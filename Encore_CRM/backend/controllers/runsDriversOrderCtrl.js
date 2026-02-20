const RunsDriversOrderModel = require('../models/runsDriversOrderModel');
const Trucks = require('../models/truckMasterModel');
const OrderMaster = require('../models/ordermasterModel');
const {
  getOrderDetails,
  generateDocketPDFDocketwise,
  renderTableAsImage,
  autoColumnWidth,
  getDayOfWeek,
  ordinalSuffixOf,
  getSplitOrderDetails,
  handleMongooseError,
  computeOrderFields,
  getFormattedDeliveryTime,
  closeBrowser,
  isPdfBlank,
  incrementBlankPdfCounter,
  forceRestartBrowser,
  resetBlankPdfCounter
} = require('./common');

const mongoose = require('mongoose');
const XLSX = require('xlsx-js-style');
const schedule = require("node-schedule");
const nodemailer = require("nodemailer");
const { DateTime } = require("luxon");
const {
  PDFDocument: PDFLibDocument
} = require('pdf-lib');
const fs = require('fs');
const ExternalOrders = require('../models/externalOrderModel'); // Make sure this model exists
const { GetObjectCommand, S3Client } = require('@aws-sdk/client-s3');
const SplitOrders = require("../models/splitOrdersModel");
const { logError } = require("../logger");

const AWF_CUST_ID = process.env.AWF_CUSTOMER_ID

const s3FileCache = new Map();

const s3Client = new S3Client({
    region: process.env.AWS_REGION,
    credentials: {
      accessKeyId: process.env.AWS_ACCESS_KEY_ID,
      secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
    },
  });

// const { execFile } = require('child_process');
// const path = require('path');

// // Helper to compress PDF using Ghostscript
// async function compressPDF(inputBuffer, outputPath) {
//   const tempInput = path.join(__dirname, 'temp_input.pdf');
//   const tempOutput = path.join(__dirname, 'temp_output.pdf');
//   fs.writeFileSync(tempInput, inputBuffer);

//   // Ghostscript command for compression
//   const gsCmd = process.platform === 'win32' ? 'gswin64c' : 'gs';
//   const args = [
//     '-sDEVICE=pdfwrite',
//     '-dCompatibilityLevel=1.4',
//     '-dPDFSETTINGS=/ebook', // /screen, /ebook, /printer, /prepress
//     '-dNOPAUSE',
//     '-dQUIET',
//     '-dBATCH',
//     `-sOutputFile=${tempOutput}`,
//     tempInput
//   ];

//   await new Promise((resolve, reject) => {
//     execFile(gsCmd, args, (error) => {
//       if (error) reject(error);
//       else resolve();
//     });
//   });

//   const compressedBuffer = fs.readFileSync(tempOutput);
//   fs.unlinkSync(tempInput);
//   fs.unlinkSync(tempOutput);
//   return compressedBuffer;
// }

const createDriverOrders = async (req, res) => {
  try {
    const {
      run_id, order_nums = [], delivery_date, truck_id, driver_id, start_time, truck_length, del_date_proceed = false, max_length_proceed = false
    } = req.body

    const orderNumsStr = order_nums.map(String);

    const orMatch = {
      $or: [
        { order_unique_id: { $in: order_nums } },

        {
          $expr: {
            $and: [
              // ensure types line up; remove String(...) if AWF_CUST_ID already matches DB type
              { $eq: ["$order_customer_UID", AWF_CUST_ID] },

              // compare first 6 bytes/chars of PO against the list of order nums
              {
                $in: [
                  { $substrBytes: [{ $ifNull: ["$order_customer_PO_number", ""] }, 0, 6] },
                  orderNumsStr
                ]
              }
            ]
          }
        }
      ]
    };

    const [matchingOrders, nonMatchingOrders, nonMatchingQC] = await Promise.all([
      OrderMaster.find({
         ...orMatch,
        order_qc_status: "4",
        order_delivery_date_str: {
          $regex: new RegExp(`^${delivery_date.split('T')[0].split('-').reverse().join('-')}`)
        }
      }).select('order_unique_id order_customer_PO_number order_customer_UID'),

      OrderMaster.find({
         ...orMatch,
        order_delivery_date_str: {
          $not: {
            $regex: new RegExp(`^${delivery_date.split('T')[0].split('-').reverse().join('-')}`)
          }
        }
      }).select('order_unique_id order_customer_PO_number order_customer_UID'),
      OrderMaster.find({
         ...orMatch,
          order_qc_status: {
            $ne: "4"
          }
      }).select('order_unique_id order_customer_PO_number order_customer_UID')
    ]);

    // const now = new Date();

    // const existingAssignments = await RunsDriversOrderModel.find({
    //   delivery_date: { $lte: now }, // same day or past deliveries
    //   order_nums: { $in: order_nums },
    //   driver_id: { $ne: driver_id }, // only check conflicts with other drivers
    //   // run_type
    // });

    // if (existingAssignments.length > 0) {
    //   const conflictingOrders = [];
    //   existingAssignments.forEach(record => {
    //     record.order_nums.forEach(order => {
    //       if (order_nums.includes(order)) {
    //         conflictingOrders.push(order);
    //       }
    //     });
    //   });

    //   // Only block if delivery_date is in the future
    //   const isFuture = new Date(delivery_date) > now;

    //   if (conflictingOrders.length > 0 && isFuture) {
    //     return res.status(400).json({
    //       status: false,
    //       message:
    //         "Some orders are already assigned to another driver for this future delivery date.",
    //       conflictingOrders
    //     });
    //   }
    // }


    // const matchedOrderNums = matchingOrders.map(o => o.order_unique_id);
    const unmatchedOrderNums = nonMatchingOrders.map(o => o.order_customer_UID === AWF_CUST_ID ? o.order_customer_PO_number.substring(0, 6) : o.order_unique_id);
    const unmatchedQCOrderNums = nonMatchingQC.map(o => o.order_customer_UID === AWF_CUST_ID ? o.order_customer_PO_number.substring(0, 6) : o.order_unique_id)

    if (unmatchedOrderNums.length > 0 && !del_date_proceed) {
      return res.status(200).json({
        status: false,
        message: 'Some orders have different delivery dates',
        unmatchedOrderNums,
        requiresDateConfirmation: true
      });
    }

    if (unmatchedQCOrderNums.length > 0 && !del_date_proceed) {
      return res.status(200).json({
        status: false,
        message: 'Some orders have different QC status',
        unmatchedOrderNums: unmatchedQCOrderNums,
        requiresDateConfirmation: true
      });
    }

    // verify max length
    const exceedingOrders = await verifyMaxLength(order_nums, truck_length);
    if (exceedingOrders.length > 0) {
      const proceedValue = max_length_proceed;
      if (!proceedValue) {
        return res.status(200).json({
          status: false,
          message: 'Following orders exceed the truck length limit',
          unmatchedOrderNums: exceedingOrders,
          requiresLengthConfirmation: true
        });
      }
    }

    let updatedDriverOrders;
    const date = new Date(delivery_date);
    const nextDate = new Date(date);
    nextDate.setDate(date.getDate() + 1);

    let existingRecord = await RunsDriversOrderModel.findById(run_id);

    // if (existingRecord) {
      updatedDriverOrders = await RunsDriversOrderModel.findByIdAndUpdate(
        run_id, {
          order_nums: order_nums,
          truck_id,
          driver_id,
          draft_driver: driver_id ? "" : existingRecord?.draft_driver,
          start_time,
          delivery_date,
          updated_by: req?.user?.user_ref_id,
          updated_date: new Date()
        }, {
          new: true
        }
      );

    res.status(200).json({
      status: true,
      message: 'Orders assigned to driver',
      updatedDriverOrders,
      warnings: {
        exceedingOrders: exceedingOrders.length > 0 ? exceedingOrders : null,
        unmatchedOrders: unmatchedOrderNums.length > 0 ? unmatchedOrderNums : null
      }
    });
  } catch (error) {
    logError('createDriverOrders', error, req.user.user_ref_id);
    handleMongooseError(error, res)
  }
}
const checkHasAssignedOrdersByDriverId = async (req, res) => {
  try {
    const {
      delivery_date,
      id,
      run_type
    } = req.query;

    if (!delivery_date) {
      return res.status(400).json({
        status: false,
        message: 'Delivery date is required'
      });
    }

    const parsedDate = new Date(delivery_date);
    if (isNaN(parsedDate.getTime())) {
      return res.status(400).json({
        status: false,
        message: 'Invalid delivery date format'
      });
    }

    const formattedDate = parsedDate.toISOString().split('T')[0];
    const matchCondition = {};

    // Convert delivery_date to start and end of day for exact date matching
    const startDate = new Date(formattedDate);
    const endDate = new Date(formattedDate);
    endDate.setDate(endDate.getDate() + 1);

    matchCondition.delivery_date = {
      $gte: startDate,
      $lt: endDate
    };

    if (!id) {
      return res.status(400).json({
      status: false,
      message: 'Driver id is required'
      });
    }

    const query = {
      _id: mongoose.Types.ObjectId.isValid(id) ? new mongoose.Types.ObjectId(id) : id,
      delivery_date: matchCondition.delivery_date,
      run_type
    };

    // Get record by table _id (not by driver_id)
    const driversData = await RunsDriversOrderModel.aggregate([
      { $match: query },
      {
      $lookup: {
        from: "drivers",
        localField: "driver_id",
        foreignField: "_id",
        as: "driverInfo"
      }
      },
      {
      $lookup: {
        from: "trucks",
        localField: "truck_id",
        foreignField: "_id",
        as: "truckInfo"
      }
      },
      {
      $addFields: {
        driver_name: { $arrayElemAt: ["$driverInfo.name", 0] }
      }
      },
      {
      $project: {
        _id: 1,
        order_nums: 1,
        delivery_date: 1,
        run_type: 1,
        driver_id: 1,
        start_time: 1,
        driver_name: 1,
        truckInfo: "$truckInfo"
      }
      }
    ]).exec();

    const status_flag = driversData[0]?.order_nums.length > 0 ? true : false;

    return res.status(200).json({
      status: status_flag,
      // truck: (truckInfo.length > 0) ? truckInfo[0] : null,
      driversData: driversData[0]
    });

  } catch (error) {
    logError('checkHasAssignedOrdersByDriverId', error, req.user.user_ref_id);
    handleMongooseError(error, res);
  }
}

const verifyMaxLength = async (order_nums, max_length) => {
  // Internal Orders
  const orderNumsStr = order_nums.map(String);
  const matchCondition = {
      order_qc_status: "4",
      $or: [
        { order_unique_id: { $in: order_nums } },

        {
          $expr: {
            $and: [
              // ensure types line up; remove String(...) if AWF_CUST_ID already matches DB type
              { $eq: ["$order_customer_UID", AWF_CUST_ID] },

              // compare first 6 bytes/chars of PO against the list of order nums
              {
                $in: [
                  { $substrBytes: [{ $ifNull: ["$order_customer_PO_number", ""] }, 0, 6] },
                  orderNumsStr
                ]
              }
            ]
          }
        }
      ]
    };
  // const matchCondition = {
  //   order_qc_status: "4",
  //   order_unique_id: {
  //     $in: order_nums
  //   }
  // };

  let internalResults = await OrderMaster.aggregate([
    { $match: matchCondition },
    {
      $lookup: {
        from: "orderitems",
        localField: "_id",
        foreignField: "order_master_id",
        as: "orderitemsInfo"
      }
    },
    {
      $lookup: {
        from: "orderitemsmanuals",
        localField: "_id",
        foreignField: "order_master_me_id",
        as: "orderitemsmanualsInfo"
      }
    },
    {
      $addFields: {
        largestItem: {
          $max: {
            $concatArrays: [
              {
                $map: {
                  input: "$orderitemsInfo",
                  as: "item",
                  in: {
                    $divide: [{ $toDouble: "$$item.order_item_length" }, 1000]
                  }
                }
              },
              {
                $map: {
                  input: "$orderitemsmanualsInfo",
                  as: "manualItem",
                  in: { $toDouble: "$$manualItem.order_item_me_length" }
                }
              }
            ]
          }
        }
      }
    },
    {
      $project: {
        _id: 1,
        order_unique_id: 1,
        order_customer_UID: 1,
        order_customer_PO_number: 1,
        largest_length: "$largestItem"
      }
    },
    {
      $match: {
        largest_length: { $gt: max_length }
      }
    }
  ]);

  // External Orders
  const externalResults = await ExternalOrders.find({
    order_number: { $in: order_nums },
    $expr: {
      $gt: [
        {
          $cond: [
            { $regexMatch: { input: "$order_length", regex: "^[0-9]+(\\.[0-9]+)?$" } },
            { $toDouble: "$order_length" },
            0
          ]
        },
        max_length
      ]
    }
  }).select("order_number").lean();

  // Combine both
  const internalOrderIds = internalResults.map(item => item.order_customer_UID === AWF_CUST_ID ? item.order_customer_PO_number.substring(0, 6) : item.order_unique_id);
  const externalOrderIds = externalResults.map(item => item.order_number);

  return [...internalOrderIds, ...externalOrderIds];
}

const fetchRunsOrderDetails = async (req, res) => {
  try {
    const {
      order_nums = [],
      truck_id,
      limit = 100
    } = req.body;

    if (order_nums.length === 0) {
      return res.status(200).json({
        status: true,
        data: [],
        message: "No orders to fetch"
      });
    }

    // ------------------------
    // Internal Orders (OrderMaster)
    // ------------------------
    const orderNumsStr = order_nums.map(String);
    const matchCondition = {
      // order_qc_status: "4",
      $nor: [
          { order_delivery_address_mode: "2" },
          { order_status: "Order Cancelled" }
      ],
      $or: [
        { order_unique_id: { $in: order_nums } },

        {
          $expr: {
            $and: [
              // ensure types line up; remove String(...) if AWF_CUST_ID already matches DB type
              { $eq: ["$order_customer_UID", AWF_CUST_ID] },

              // compare first 6 bytes/chars of PO against the list of order nums
              {
                $in: [
                  { $substrBytes: [{ $ifNull: ["$order_customer_PO_number", ""] }, 0, 6] },
                  orderNumsStr
                ]
              }
            ]
          }
        }
      ]
    };

    let internalOrders = await OrderMaster.aggregate([
      { $match: matchCondition },
      { $addFields: { sortIndex: { $indexOfArray: [order_nums, "$order_unique_id"] } } },
      { $sort: { sortIndex: 1 } },
      { $limit: parseInt(limit) },
      { $lookup: { from: "orderitems", localField: "_id", foreignField: "order_master_id", as: "orderitemsInfo" } },
      { $lookup: { from: "orderitemsmanuals", localField: "_id", foreignField: "order_master_me_id", as: "orderitemsmanualsInfo" } },
      { $lookup: { from: "accounts", localField: "order_customer_id", foreignField: "_id", as: "customerInfo" } },
      { $lookup: { from: "accountcontacts", localField: "order_customer_contact_id", foreignField: "_id", as: "customercontactInfo" } },
      { $lookup: { from: "orderssubitemcounts", localField: "_id", foreignField: "Order_Mas_Id", as: "orderssubitemcountsInfo" } },
      {
        $addFields: {
          largestItem: {
            $max: {
              $concatArrays: [
                {
                  $map: {
                    input: "$orderitemsInfo",
                    as: "item",
                    in: { $divide: [{ $toDouble: "$$item.order_item_length" }, 1000] }
                  }
                },
                {
                  $map: {
                    input: "$orderitemsmanualsInfo",
                    as: "manualItem",
                    in: { $toDouble: "$$manualItem.order_item_me_length" }
                  }
                }
              ]
            }
          }
        }
      },
      {
        $addFields: {
          orderitemsInfo: {
            $filter: {
              input: "$orderitemsInfo",
              as: "item",
              cond: { $eq: [{ $divide: [{ $toDouble: "$$item.order_item_length" }, 1000] }, "$largestItem"] }
            }
          },
          orderitemsmanualsInfo: {
            $filter: {
              input: "$orderitemsmanualsInfo",
              as: "manualItem",
              cond: { $eq: [{ $toDouble: "$$manualItem.order_item_me_length" }, "$largestItem"] }
            }
          }
        }
      },
      {
        $addFields: {
          orderitemsInfo: { $arrayElemAt: ["$orderitemsInfo", 0] },
          orderitemsmanualsInfo: { $arrayElemAt: ["$orderitemsmanualsInfo", 0] },
          orderssubitemcountsInfo: { $arrayElemAt: ["$orderssubitemcountsInfo", 0] }
        }
      },
      { $lookup: { from: "rackings", localField: "f_order_racking_table", foreignField: "_id", as: "frackingsInfo" } },
      { $lookup: { from: "rackings", localField: "fg_order_racking_table", foreignField: "_id", as: "fgrackingsInfo" } },
      { $lookup: { from: "rackings", localField: "cl_order_racking_table", foreignField: "_id", as: "clrackingsInfo" } },
      { $lookup: { from: "rackings", localField: "j_order_racking_table", foreignField: "_id", as: "jrackingsInfo" } },
      { $lookup: { from: "rackings", localField: "roof_order_racking_table", foreignField: "_id", as: "roofrackingsInfo" } },
      { $lookup: { from: "rackings", localField: "gbi_order_racking_table", foreignField: "_id", as: "gbirackingsInfo" } },
      // { $unwind: { path: "$orderssubitemcountsInfo", preserveNullAndEmptyArrays: true } },
      {
        $project: {
          _id: 1,
          order_unique_id: {
              $cond: [
              { $eq: ["$order_customer_UID", AWF_CUST_ID] },
              { $substr: ["$order_customer_PO_number", 0, 6] },
              "$order_unique_id"
              ]
          },
          order_delivery_date: 1,
          order_delivery_date_str: 1,
          order_delivery_address_mode: 1,
          order_delivery_address: 1,
          order_site_delivery_city: 1,
          order_customer_PO_number: {
              $cond: [
              { $eq: ["$order_customer_UID", AWF_CUST_ID] },
              {
                  $let: {
                  vars: {
                      restLen: {
                      $max: [
                          { $subtract: [{ $strLenBytes: "$order_customer_PO_number" }, 6] },
                          0
                      ]
                      }
                  },
                  in: {
                      $concat: [
                      { $toString: "$order_unique_id" },
                      {
                          $cond: [
                          { $gt: ["$$restLen", 0] },
                          { $substrBytes: ["$order_customer_PO_number", 6, "$$restLen"] },
                          ""  // nothing to append if PO number has <= 6 chars
                          ]
                      }
                      ]
                  }
                  }
              },
              "$order_customer_PO_number"
              ]
          },
          order_store_delivery_city: 1,
          order_master_rack: 1,
          order_Pieces: 1,
          account_ID: { $arrayElemAt: ["$customerInfo._id", 0] },
          account_UID: { $arrayElemAt: ["$customerInfo.account_UID", 0] },
          account_Name: { $arrayElemAt: ["$customerInfo.account_Name", 0] },
          account_Address_City: { $arrayElemAt: ["$customerInfo.account_Address_City", 0] },
          largest_length: "$largestItem",
          driver_info: "driver information",
          loader_info: "loader information",
          products: {
            $reduce: {
              input: [
                { letter: "F", count: "$orderssubitemcountsInfo.Order_Flashing_Count" },
                { letter: "J", count: "$orderssubitemcountsInfo.Order_Jobbing_Count" },
                { letter: "G", count: "$orderssubitemcountsInfo.Order_GBI_Count" },
                { letter: "CL", count: "$orderssubitemcountsInfo.Order_Cladding_Count" },
                { letter: "FG", count: "$orderssubitemcountsInfo.Order_Faciagutter_Count" },
                { letter: "R", count: "$orderssubitemcountsInfo.Order_Roofing_Count" },
                { letter: "G.L", count: "$orderssubitemcountsInfo.Order_GBIL_Count" }
              ],
              initialValue: "",
              in: {
                $concat: [
                  "$$value",
                  {
                    $cond: [
                      { $gt: [{ $toInt: "$$this.count" }, 0] },
                      { $concat: ["$$this.letter", ": ", { $toString: "$$this.count" }, "; "] },
                      ""
                    ]
                  }
                ]
              }
            }
          },

          // -------------------
          // UPDATED sub_racks
          // -------------------
          sub_racks: {
            $let: {
              vars: {
                // flashing rack name if exists, else empty string
                fRackName: { $ifNull: [{ $arrayElemAt: ["$frackingsInfo.rack_name", 0] }, ""] },

                // compute flashing status code (RO / FO / PIP / C) when rack name is empty
                fStatusCode: {
                  $switch: {
                    branches: [
                      { case: { $eq: ["$order_flashing_checker", false] }, then: "" },
                      { case: { $eq: ["$f_order_prod_push_status", 0] }, then: "PIP" },
                      { case: { $eq: ["$f_order_prod_push_status", 1] }, then: "" },
                      {
                        case: { $eq: ["$f_order_prod_push_status", 2] },
                        then: {
                          $switch: {
                            branches: [
                              { case: { $eq: ["$f_order_prod_current_status", "2"] }, then: "RO" },
                              { case: { $eq: ["$f_order_prod_current_status", "4"] }, then: "FO" }
                            ],
                            default: "PIP"
                          }
                        }
                      }
                    ],
                    default: "PIP"
                  }
                }
              },
              in: {
                $reduce: {
                  input: [
                    // For flashing: if rack name exists -> use rack name; else use status code.
                    {
                      prefix: "F: ",
                      value: {
                        $cond: [
                          { $ne: ["$$fRackName", ""] },
                          "$$fRackName",
                          "$$fStatusCode"
                        ]
                      }
                    },
                    // other departments unchanged
                    { prefix: "FG: ", value: { $ifNull: [{ $arrayElemAt: ["$fgrackingsInfo.rack_name", 0] }, ""] } },
                    { prefix: "CL: ", value: { $ifNull: [{ $arrayElemAt: ["$clrackingsInfo.rack_name", 0] }, ""] } },
                    { prefix: "J: ", value: { $ifNull: [{ $arrayElemAt: ["$jrackingsInfo.rack_name", 0] }, ""] } },
                    { prefix: "R: ", value: { $ifNull: [{ $arrayElemAt: ["$roofrackingsInfo.rack_name", 0] }, ""] } },
                    { prefix: "G: ", value: { $ifNull: [{ $arrayElemAt: ["$gbirackingsInfo.rack_name", 0] }, ""] } }
                  ],
                  initialValue: "",
                  in: {
                    $concat: [
                      "$$value",
                      {
                        $cond: [
                          { $ne: ["$$this.value", ""] },
                          { $concat: ["$$this.prefix", "$$this.value", "; "] },
                          ""
                        ]
                      }
                    ]
                  }
                }
              }
            }
          },
          order_custom_note: 1,
          order_loaders_info: 1,
          order_crane_lift_checker: 1,
          order_delivery_date_str: 1,
          order_delivery_time: 1,
          order_delivery_session: 1,
          order_priority_status: 1,
          source: "internal"
        }
      }
    ]).allowDiskUse(true);

    // ------------------------
    // Split Orders (SplitOrders + OrderMaster)
    // ------------------------
// ------------------------
// Split Orders (with enriched data like internal orders)
// ------------------------
const splitOrderItems = await SplitOrders.aggregate([
  { $match: { order_unique_id: { $in: order_nums }, 
      $nor: [
          { order_delivery_address_mode: "2" }
      ],
    } 
  },
  {
    $lookup: {
      from: "ordermasters",
      localField: "order_master_id",
      foreignField: "_id",
      as: "parentOrder"
    }
  },
  { $unwind: "$parentOrder" },

  // Items + Manuals
  { $lookup: { from: "orderitems", localField: "parentOrder._id", foreignField: "order_master_id", as: "orderitemsInfo" } },
  { $lookup: { from: "orderitemsmanuals", localField: "parentOrder._id", foreignField: "order_master_me_id", as: "orderitemsmanualsInfo" } },

  // Customer + Subitem Counts
  { $lookup: { from: "accounts", localField: "parentOrder.order_customer_id", foreignField: "_id", as: "customerInfo" } },
  { $lookup: { from: "orderssubitemcounts", localField: "parentOrder._id", foreignField: "Order_Mas_Id", as: "orderssubitemcountsInfo" } },

  // Racking Info
  { $lookup: { from: "rackings", localField: "parentOrder.f_order_racking_table", foreignField: "_id", as: "frackingsInfo" } },
  { $lookup: { from: "rackings", localField: "parentOrder.fg_order_racking_table", foreignField: "_id", as: "fgrackingsInfo" } },
  { $lookup: { from: "rackings", localField: "parentOrder.cl_order_racking_table", foreignField: "_id", as: "clrackingsInfo" } },
  { $lookup: { from: "rackings", localField: "parentOrder.j_order_racking_table", foreignField: "_id", as: "jrackingsInfo" } },
  { $lookup: { from: "rackings", localField: "parentOrder.roof_order_racking_table", foreignField: "_id", as: "roofrackingsInfo" } },
  { $lookup: { from: "rackings", localField: "gbi_order_racking_table", foreignField: "_id", as: "gbirackingsInfo" } },

  // Largest item calc
  {
    $addFields: {
      largestItem: {
        $max: {
          $concatArrays: [
            {
              $map: {
                input: "$orderitemsInfo",
                as: "item",
                in: { $divide: [{ $toDouble: "$$item.order_item_length" }, 1000] }
              }
            },
            {
              $map: {
                input: "$orderitemsmanualsInfo",
                as: "manualItem",
                in: { $toDouble: "$$manualItem.order_item_me_length" }
              }
            }
          ]
        }
      },
      orderssubitemcountsInfo: { $arrayElemAt: ["$orderssubitemcountsInfo", 0] }
    }
  },

  // { $unwind: { path: "$orderssubitemcountsInfo", preserveNullAndEmptyArrays: true } },

  // Final projection
  {
    $project: {
      _id: 1,
      order_unique_id: 1,
      order_delivery_date: 1,
      order_delivery_date_str: 1,
      order_delivery_time: 1,
      order_delivery_session: 1,
      order_delivery_address_mode: 1,
      order_site_delivery_city: 1,
      order_site_delivery_address2: 1,
      order_site_delivery_address1: 1,
      order_site_delivery_country: 1,
      order_site_delivery_postalcode: 1,
      order_site_delivery_state: 1,
      order_store_delivery_city: 1,
      order_store_delivery_address2: 1,
      order_store_delivery_address1: 1,
      order_store_delivery_country: 1,
      order_store_delivery_postalcode: 1,
      order_site_delivery_attention_person: 1,
      order_site_delivery_attention_contact: 1,
      order_store_delivery_state: 1,
      order_customer_PO_number: "$order_customer_PO_number",
      order_master_rack: "$parentOrder.order_master_rack",
      account_ID: { $arrayElemAt: ["$customerInfo._id", 0] },
      account_UID: { $arrayElemAt: ["$customerInfo.account_UID", 0] },
      account_Name: { $arrayElemAt: ["$customerInfo.account_Name", 0] },
      account_Address_City: { $arrayElemAt: ["$customerInfo.account_Address_City", 0] },
      largest_length: "$largestItem",
      products: {
        $reduce: {
          input: [
            { letter: "F", count: "$orderssubitemcountsInfo.Order_Flashing_Count" },
            { letter: "J", count: "$orderssubitemcountsInfo.Order_Jobbing_Count" },
            { letter: "G", count: "$orderssubitemcountsInfo.Order_GBI_Count" },
            { letter: "CL", count: "$orderssubitemcountsInfo.Order_Cladding_Count" },
            { letter: "FG", count: "$orderssubitemcountsInfo.Order_Faciagutter_Count" },
            { letter: "R", count: "$orderssubitemcountsInfo.Order_Roofing_Count" },
            { letter: "G.L", count: "$orderssubitemcountsInfo.Order_GBIL_Count" }
          ],
          initialValue: "",
          in: {
            $concat: [
              "$$value",
              {
                $cond: [
                  { $gt: [{ $toInt: "$$this.count" }, 0] },
                  { $concat: ["$$this.letter", ": ", { $toString: "$$this.count" }, "; "] },
                  ""
                ]
              }
            ]
          }
        }
      },

      // UPDATED sub_racks
      sub_racks: {
        $let: {
          vars: {
            // flashing rack name if exists, else empty string
            fRackName: { $ifNull: [{ $arrayElemAt: ["$frackingsInfo.rack_name", 0] }, ""] },

            // compute flashing status code (RO / FO / PIP / C) when rack name is empty
            fStatusCode: {
              $switch: {
                branches: [
                  { case: { $eq: ["$parentOrder.order_flashing_checker", false] }, then: "" },
                  { case: { $eq: ["$f_order_prod_push_status", 0] }, then: "PIP" },
                  { case: { $eq: ["$f_order_prod_push_status", 1] }, then: "" },
                  {
                    case: { $eq: ["$f_order_prod_push_status", 2] },
                    then: {
                      $switch: {
                        branches: [
                          { case: { $eq: ["$f_order_prod_current_status", "2"] }, then: "RO" },
                          { case: { $eq: ["$f_order_prod_current_status", "4"] }, then: "FO" }
                        ],
                        default: "PIP"
                      }
                    }
                  }
                ],
                default: "PIP"
              }
            }
          },
          in: {
            $reduce: {
              input: [
                // For flashing: if rack name exists -> use rack name; else use status code.
                {
                  prefix: "F: ",
                  value: {
                    $cond: [
                      { $ne: ["$$fRackName", ""] },
                      "$$fRackName",
                      "$$fStatusCode"
                    ]
                  }
                },
                // other departments unchanged
                { prefix: "FG: ", value: { $ifNull: [{ $arrayElemAt: ["$fgrackingsInfo.rack_name", 0] }, ""] } },
                { prefix: "CL: ", value: { $ifNull: [{ $arrayElemAt: ["$clrackingsInfo.rack_name", 0] }, ""] } },
                { prefix: "J: ", value: { $ifNull: [{ $arrayElemAt: ["$jrackingsInfo.rack_name", 0] }, ""] } },
                { prefix: "R: ", value: { $ifNull: [{ $arrayElemAt: ["$roofrackingsInfo.rack_name", 0] }, ""] } },
                { prefix: "G: ", value: { $ifNull: [{ $arrayElemAt: ["$gbirackingsInfo.rack_name", 0] }, ""] } }
              ],
              initialValue: "",
              in: {
                $concat: [
                  "$$value",
                  {
                    $cond: [
                      { $ne: ["$$this.value", ""] },
                      { $concat: ["$$this.prefix", "$$this.value", "; "] },
                      ""
                    ]
                  }
                ]
              }
            }
          }
        }
      },
      order_custom_note: "$parentOrder.order_custom_note",
      order_loaders_info: "$parentOrder.order_loaders_info",
      order_crane_lift_checker: "$parentOrder.order_crane_lift_checker",
      order_delivery_time: "$parentOrder.order_delivery_time",
      order_delivery_session: "$parentOrder.order_delivery_session",
      source: "SplitOrders"
    }
  }
]).allowDiskUse(true);


    // ------------------------
    // External Orders
    // ------------------------
    const externalOrders = await ExternalOrders.find({
      order_number: { $in: order_nums },
      order_docket: { $ne: [] }
    }).lean();

    const externalOrderItems = externalOrders.map(order => ({
      _id: order._id,
      order_unique_id: order.order_number,
      order_delivery_date: order.order_delivery_date,
      order_delivery_date_str: order.order_delivery_date
      ? order.order_delivery_date.toISOString().split('T')[0].split('-').reverse().join('-')
      : "",
      order_delivery_address: order.order_delivery_address,
      order_customer_PO_number: order.order_customer_po_number,
      order_delivery_city: order.order_city,
      order_master_rack: order.order_master_rack,
      account_Name: order.order_customer_name,
      largest_length: order.order_length ? Number(order.order_length) : 0,
      order_custom_note: order.order_drivers_info,
      order_loaders_info: order.order_loaders_info,
      order_crane_lift_checker: order.order_crane_lift_checker || false,
      order_delivery_time: order.order_delivery_time,
      order_delivery_session: order.order_delivery_session,
      order_priority_status: order.order_priority_status,
      sub_racks: order.order_master_rack,
      source: "external"
    }));

    // ------------------------
    // Merge all three
    // ------------------------
    let allOrders = [...internalOrders, ...splitOrderItems, ...externalOrderItems];

    // Sort in same order as order_nums
    allOrders.sort((a, b) => order_nums.indexOf(a.order_unique_id) - order_nums.indexOf(b.order_unique_id));

    // check the order_nums assigned to the driver by taking order_nums in RunsDriversOrderModel if yes then return driver info here both order_nums are array
    const driverInfo = await RunsDriversOrderModel.findOne({
      order_nums: { $in: order_nums }
    });

    const TruckInfo = await Trucks.findById(truck_id)
    // Find max length
    let maxLength = 0;
    allOrders.forEach(item => {
      const val = Number(item.largest_length);
      if (!isNaN(val) && val > maxLength) maxLength = val;
    });

    // Mark large_length
    allOrders = allOrders.map(item => ({
      ...item,
      large_length: Number(item.largest_length) === maxLength || Number(item.largest_length) > TruckInfo?.dimensions?.max_length
    }));

    const responseObject = {
      status: true,
      data: allOrders,
      driverInfo: driverInfo || null,
      message: "Orders fetched successfully"
    };

    res.status(200).json(responseObject);
  } catch (error) {
    logError('fetchRunsOrderDetails', error, req.user.user_ref_id);
    handleMongooseError(error, res);
  }
};


function createRunSheet({
  titleDate,
  titleMiddle,
  rows,
  footerText,
  footerText2
}) {
  const ws = XLSX.utils.aoa_to_sheet([]);

  const visibleHeaders = rows.length ? Object.keys(rows[0]).filter(key =>
    key !== "order_crane_lift_checker" && key !== "large_length" &&  key !== "order_docket" && key !== "source" && key !== "order_priority_status" && key !== "order_customer_UID" && key !== "order_unique_id" && key !== "order_customer_PO_number"
  ) : [];

  const maxCols = visibleHeaders.length;
  const headerRow = 1;
  const dataStartRow = 2;

  const part = Math.ceil(maxCols / 3);
  const colA = 1,
    colB = part,
    colC = part * 2;

  // Merge title rows
  ws['!merges'] = [{
      s: { r: 0, c: colA },
      e: { r: 0, c: colB - 1 }
    },
    {
      s: { r: 0, c: colB },
      e: { r: 0, c: colC - 1 }
    }
  ];

  // Add title cells
  ws[XLSX.utils.encode_cell({ r: 0, c: colA })] = {
    v: titleDate,
    t: 's',
    s: {
      font: { bold: true, sz: 28 },
      alignment: { horizontal: 'left' }
    }
  };
  ws[XLSX.utils.encode_cell({ r: 0, c: colB })] = {
    v: titleMiddle,
    t: 's',
    s: {
      font: { bold: true, sz: 28 },
      alignment: { horizontal: 'center' }
    }
  };

  // Add headers
  XLSX.utils.sheet_add_aoa(ws, [visibleHeaders], { origin: `A${headerRow + 1}` });

  // Prepare data without hidden logic keys
  const rowsWithLogic = [...rows]; // includes extra logic keys
  const exportRows = rows.map(row => {
    const newRow = {};
    visibleHeaders.forEach(header => {
      newRow[header] = row[header] || "";
    });
    return newRow;
  });

  // Add data rows
  XLSX.utils.sheet_add_json(ws, exportRows, {
    origin: `A${dataStartRow + 1}`,
    skipHeader: true
  });

  // Add footer rows
  const footerRowIdx1 = dataStartRow + exportRows.length + 1;
  const footerRowIdx2 = footerRowIdx1 + 1;

  XLSX.utils.sheet_add_aoa(ws, [[footerText]], { origin: `A${footerRowIdx1}` });
  XLSX.utils.sheet_add_aoa(ws, [[footerText2]], { origin: `A${footerRowIdx2}` });

  // Merge footer cells across all columns
  ws['!merges'].push({
    s: { r: footerRowIdx1 - 1, c: 0 },
    e: { r: footerRowIdx1 - 1, c: maxCols - 1 }
  }, {
    s: { r: footerRowIdx2 - 1, c: 0 },
    e: { r: footerRowIdx2 - 1, c: maxCols - 1 }
  });

  // Style footer cells
  [footerRowIdx1, footerRowIdx2].forEach((rowIdx) => {
    const cell = ws[XLSX.utils.encode_cell({ r: rowIdx - 1, c: 0 })];
    if (cell) {
      cell.s = {
        font: { bold: true, sz: 72 },
        alignment: { horizontal: 'center' }
      };
    }
  });

  // Apply borders to all populated cells
  const totalRows = footerRowIdx2;
  const borderStyle = {
    top: { style: 'thin' },
    bottom: { style: 'thin' },
    left: { style: 'thin' },
    right: { style: 'thin' }
  };

  for (let r = 0; r < totalRows; r++) {
    for (let c = 0; c < maxCols; c++) {
      const ref = XLSX.utils.encode_cell({ r, c });
      const cell = ws[ref];
      if (!cell) continue;
      cell.s = cell.s || {};
      cell.s.font = cell.s.font || { sz: 28 };
      cell.s.border = borderStyle;
    }
  }

  // === Conditional Styling Logic ===
  rowsWithLogic.forEach((row, rowIndex) => {
    const isYellow = row["order_crane_lift_checker"] === true;
    const isBlue = row["large_length"] === true;
    const isPriority1 = row["order_priority_status"] === 1;
    const isPriority2 = row["order_priority_status"] === 2;
    const isPriority3 = row["order_priority_status"] === 3;
    const excelRow = dataStartRow + rowIndex;

    // Highlight entire row yellow
    if (isYellow) {
      visibleHeaders.forEach((_, colIndex) => {
        const cellRef = XLSX.utils.encode_cell({ r: excelRow, c: colIndex });
        const cell = ws[cellRef];
        if (cell) {
          cell.s = cell.s || {};
          cell.s.fill = {
            patternType: "solid",
            fgColor: { rgb: "FCEFE3" } // Yellow
          };
          cell.s.font = cell.s.font || { sz: 28 };
        }
      });
    }

    if (isPriority1) {
      visibleHeaders.forEach((_, colIndex) => {
        const cellRef = XLSX.utils.encode_cell({ r: excelRow, c: colIndex });
        const cell = ws[cellRef];
        if (cell) {
          cell.s = cell.s || {};
          cell.s.fill = {
            patternType: "solid",
            fgColor: { rgb: "a6cff7" } // Yellow
          };
          cell.s.font = cell.s.font || { sz: 28 };
        }
      });
    }

    if (isPriority2) {
      visibleHeaders.forEach((_, colIndex) => {
        const cellRef = XLSX.utils.encode_cell({ r: excelRow, c: colIndex });
        const cell = ws[cellRef];
        if (cell) {
          cell.s = cell.s || {};
          cell.s.fill = {
            patternType: "solid",
            fgColor: { rgb: "b9ffc0" } // Yellow
          };
          cell.s.font = cell.s.font || { sz: 28 };
        }
      });
    }

    if (isPriority3) {
      visibleHeaders.forEach((_, colIndex) => {
        const cellRef = XLSX.utils.encode_cell({ r: excelRow, c: colIndex });
        const cell = ws[cellRef];
        if (cell) {
          cell.s = cell.s || {};
          cell.s.fill = {
            patternType: "solid",
            fgColor: { rgb: "fcefe3" } // Yellow
          };
          cell.s.font = cell.s.font || { sz: 28 };
        }
      });
    }

    // Highlight only "LENGTH" cell light blue
    if (isBlue) {
      const lengthColIndex = visibleHeaders.indexOf("LENGTH");
      if (lengthColIndex !== -1) {
        const cellRef = XLSX.utils.encode_cell({ r: excelRow, c: lengthColIndex });
        const cell = ws[cellRef];
        if (cell) {
          cell.s = cell.s || {};
          cell.s.fill = {
            patternType: "solid",
            fgColor: { rgb: "ADD8E6" } // Light Blue
          };
          cell.s.font = cell.s.font || { sz: 28 };
        }
      }
    }
  });

  // Set page orientation
  ws['!pageSetup'] = { orientation: 'landscape' };

  return ws;
}

// Store the current scheduled job and latest attachment
let scheduledJob = null;
let latestMailData = null;

// ------------------- Helper: Send Email -------------------
const sendMail = async (filename, outBuffer, mimeType) => {
  const mailTransporter = nodemailer.createTransport({
    service: "gmail",
    auth: {
      user: process.env.From_Email,
      pass: process.env.From_Email_PW,
    },
  });

  await mailTransporter.sendMail({
    from: process.env.From_Email,
    to: process.env.To_Daily_Report_Email,
    subject: filename,
    text: "Please find the attached file.",
    attachments: [
      {
        filename,
        content: outBuffer,
        contentType: mimeType,
      },
    ],
  });

  console.log(`Mail sent: ${filename}`);
}


// ------------------- Helper: Schedule Mail -------------------
function scheduleMail(doMail, filename, outBuffer, mimeType, printDate) {
  if (!doMail) return;

  // Convert printDate to DateTime in Australia/Sydney
  let targetDate = DateTime.fromISO(printDate, { zone: "Australia/Sydney" });

  // Schedule one day before printDate
  let scheduleTime = targetDate
    .minus({ days: 1 })
    .set({
      hour: Number(process.env.Report_Schedule_Hour),
      minute: Number(process.env.Report_Schedule_Min),
      second: 0,
      millisecond: 0
    });

  // Store latest content
  latestMailData = { filename, outBuffer, mimeType };

  // Cancel previous job if exists
  if (scheduledJob) {
    scheduledJob.cancel();
    console.log("Previous scheduled job cancelled.");
  }

  let now = DateTime.now().setZone("Australia/Sydney");

  if (now < scheduleTime) {
    // Schedule mail for calculated time
    scheduledJob = schedule.scheduleJob(scheduleTime.toJSDate(), async () => {
      console.log(
        `Sending scheduled mail at ${scheduleTime.toFormat("FF")} with latest content`
      );
      if (latestMailData) {
        await sendMail(
          latestMailData.filename,
          latestMailData.outBuffer,
          latestMailData.mimeType
        );
      }
      scheduledJob = null;
      latestMailData = null;
    });
    console.log(`Mail scheduled for ${scheduleTime.toFormat("FF")}`);
  } else {
    // If current time is already past the schedule, send immediately
    console.log("Schedule time has passed. Sending mail immediately.");
    sendMail(filename, outBuffer, mimeType);
  }
}

async function processBatch(items, batchSize, processFn) {
  const results = [];
  for (let i = 0; i < items.length; i += batchSize) {
    const batch = items.slice(i, i + batchSize);
    const batchResults = await Promise.all(batch.map(processFn));
    results.push(...batchResults);
    
    // Allow garbage collection between batches
    if (global.gc) {
      global.gc();
    }
  }
  return results;
}

async function processWithLimit(items, limit, processFn) {
  const results = [];
  const executing = [];
  
  for (const [index, item] of items.entries()) {
    const promise = Promise.resolve().then(() => processFn(item, index));
    results.push(promise);
    
    if (limit <= items.length) {
      const e = promise.then(() => executing.splice(executing.indexOf(e), 1));
      executing.push(e);
      
      if (executing.length >= limit) {
        await Promise.race(executing);
      }
    }
  }
  
  return Promise.all(results);
}


const exportToXLSXRunsOrder = async (req, res) => {
  try {
    const {
      driver_ids = [],
      delivery_date,
      doMail = false,
      report_type = [],
      export_type = "pdf",
      run_type = [],
    } = req.body;

    const reportTypes = Array.isArray(report_type) ? report_type : [report_type];
    const runTypes = Array.isArray(run_type) ? run_type : [run_type];

    const dateOnly = delivery_date.split("T")[0];
    const printDate = dateOnly.split("-").reverse().join("-");
    const day = getDayOfWeek(dateOnly);
    const startDate = new Date(dateOnly);
    const endDate = new Date(dateOnly);
    endDate.setDate(endDate.getDate() + 1);

    // Fetch driver orders
    // Split driver ids
    const draftIds = driver_ids.filter(id => id.startsWith("draft_"));
    const realDriverIds = driver_ids.filter(id => !id.startsWith("draft_"));

    // Convert real driver ids into ObjectId only
    const objectIds =
      realDriverIds.length > 0
        ? realDriverIds.map(id => new mongoose.Types.ObjectId(id))
        : [];

    // Extract draft driver names from draft_ prefix
    const draftDriverNamesFromIds = draftIds.map(id => id.replace("draft_", "").trim());

    // -----------------------------
    // MAIN QUERY (ONLY real drivers)
    // -----------------------------
    let driversOrders = [];

    if (objectIds.length > 0) {
      driversOrders = await RunsDriversOrderModel.aggregate([
        {
          $match: {
            driver_id: { $in: objectIds },
            delivery_date: { $gte: startDate, $lt: endDate },
            run_type: { $in: runTypes },
          },
        },
        { $sort: { driver_id: 1, run_type: 1 } },
        {
          $lookup: {
            from: "drivers",
            localField: "driver_id",
            foreignField: "_id",
            as: "driverInfo",
          },
        },
        {
          $lookup: {
            from: "trucks",
            localField: "truck_id",
            foreignField: "_id",
            as: "truckInfo",
          },
        },
      ]);
    }

    // ----------------------------------------------
    // DRAFT DRIVER NAMES (Clean & simplified)
    // ----------------------------------------------
    let draftDriverNames = [];

    if (draftDriverNamesFromIds.length > 0) {
      draftDriverNames = await RunsDriversOrderModel.distinct("draft_driver", {
        _id: { $in: draftDriverNamesFromIds },
        driver_id: null,
        delivery_date: { $gte: startDate, $lt: endDate },
        run_type: { $in: runTypes },
      });
    }

    // ----------------------------------------------
    // FETCH DRAFT ORDERS
    // ----------------------------------------------
    let draftOrders = [];

    if (draftDriverNames.length > 0) {
      draftOrders = await RunsDriversOrderModel.aggregate([
        {
          $match: {
            draft_driver: { $in: draftDriverNames },
            driver_id: null,
            delivery_date: { $gte: startDate, $lt: endDate },
            run_type: { $in: runTypes },
          },
        },
        { $sort: { draft_driver: 1, run_type: 1 } },
         // ⭐ FIX: Explicitly include fields you need ⭐
        {
          $project: {
            _id: 1,
            order_nums: 1,        // ← IMPORTANT
            draft_driver: 1,
            run_type: 1,
            truck_id: 1,
            delivery_date: 1,
            created_date: 1,
            driver_id: 1
          }
        }
      ]);

      // Add draft orders to main list
      draftOrders.forEach((o) => {
        driversOrders.push({
          ...o,
          driverInfo: [],
          truckInfo: [],
        });
      });
    }

    // ----------------------------------------------
    // FINAL EXPORT CHECK
    // ----------------------------------------------
    const allOrderNums = driversOrders.reduce((acc, curr) => {
      if (Array.isArray(curr.order_nums)) acc.push(...curr.order_nums);
      return acc;
    }, []);

    // FIX: If draft orders exist, allow export even if order_nums empty
    if (allOrderNums.length === 0) {
      return res.status(200).send("No data to export");
    }

    const orderNumsStr = allOrderNums
      .filter(num => /^\d+$/.test(String(num)))  // Only numeric strings
      .map(num => String(num).substring(0, 6));

    const matchCondition = {
      $or: [
        { order_unique_id: { $in: allOrderNums } },  // Matches all order types
        ...(orderNumsStr.length > 0 ? [{  // Only add AWF condition if we have AWF orders
          $expr: {
            $and: [
              { $eq: ["$order_customer_UID", AWF_CUST_ID] },
              {
                $in: [
                  { $substrBytes: [{ $ifNull: ["$order_customer_PO_number", ""] }, 0, 6] },
                  orderNumsStr
                ]
              }
            ]
          }
        }] : [])
      ],
      $nor: [{ order_delivery_address_mode: "2" }],
    };

    const [allInternalOrders, allSplitOrders, externalOrders, allTrucks] = await Promise.all([
      getOrderDetailsBatch(matchCondition, allOrderNums),
      getSplitOrderDetailsBatch(matchCondition, allOrderNums),
      ExternalOrders.find({ order_number: { $in: allOrderNums } }).lean(),
      Trucks.find({ _id: { $in: driversOrders.map(o => o.truck_id).filter(Boolean) } }).lean()
    ]);

    const internalOrderMap = new Map(allInternalOrders.map(o => [o["ORDER NO"], o]));
    const splitOrderMap = new Map(allSplitOrders.map(o => [o["ORDER NO"], o]));
    const externalOrderMap = new Map(externalOrders.map(o => [o.order_number, o]));
    const truckMap = new Map(allTrucks.map(t => [t._id.toString(), t]));

    const workbook = XLSX.utils.book_new();
    const driverBlocksMap = new Map(); // Group by driver
    const isLoading = (type) => type === 2;
    const processedDocketOrders = new Set();

    const normalOrders = driversOrders.filter((o) => o.driver_id);
    const draftDriverOrders = driversOrders.filter((o) => !o.driver_id && o.draft_driver);

    const processOrders = (orders, isDraft = false) => {
      for (const order of orders) {
        if (!runTypes.includes(order.run_type)) continue;
        if (!order.order_nums?.length) continue;

        const TruckInfo = order.truckInfo?.[0]?._id ? truckMap.get(order.truckInfo[0]._id.toString()) : null;
        
        // Create unique driver key
        const driverKey = isDraft 
          ? `DRAFT_${order.draft_driver}_${order.run_type}`
          : `${order.driver_id}_${order.run_type}`;

        if (!driverBlocksMap.has(driverKey)) {
          driverBlocksMap.set(driverKey, []);
        }
        for (const type of reportTypes) {
          const loaderReportItems = order.order_nums
            .map(num => internalOrderMap.get(num))
            .filter(Boolean)
            .filter(item => !item.order_delivery_address_mode || item.order_delivery_address_mode !== "2");

          const splitReportItems = order.order_nums
            .map(num => splitOrderMap.get(num))
            .filter(Boolean);

          const allLengths = [
            ...loaderReportItems.map((i) => Number(i.LENGTH) || 0),
            ...splitReportItems.map((i) => Number(i.LENGTH) || 0),
            ...order.order_nums
              .map((n) => externalOrderMap.get(n))
              .filter(Boolean)
              .map((o) => Number(o.order_length) || 0),
          ];
          const maxLength = Math.max(...allLengths, 0);

          loaderReportItems.forEach((i) => {
            i.large_length =
              (TruckInfo && Number(i.LENGTH) > TruckInfo?.dimensions?.max_length) ||
              Number(i.LENGTH) === maxLength;
          });

          splitReportItems.forEach((i) => {
            i.large_length = Number(i.LENGTH) === maxLength;
          });

          const externalReportItems = order.order_nums
            .map((n) => externalOrderMap.get(n))
            .filter(Boolean)
            .map((o) => ({
              CUSTOMER: o.order_customer_name,
              CITY: o.order_city?.toUpperCase(),
              "PO NO": o.order_customer_po_number,
              TIME: o.order_delivery_time,
              "ORDER NO": o.order_number,
              PRODUCTS: o.order_products,
              LENGTH: o.order_length ? Number(o.order_length) : "",
              RACK: o.order_master_rack,
              "DRIVER'S INFO": o.order_drivers_info,
              "LOADER'S INFO": o.order_loaders_info,
              order_crane_lift_checker: o.order_crane_lift_checker || false,
              large_length: Number(o.order_length) === maxLength,
              source: "external",
              order_docket: o.order_docket || [],
              order_priority_status: o.order_priority_status,
            }));

          const orderMap = new Map();
          [...loaderReportItems, ...splitReportItems, ...externalReportItems].forEach((item) => {
            if (!orderMap.has(item["ORDER NO"])) {
              orderMap.set(item["ORDER NO"], item);
            }
          });

          let allReportItems = order.order_nums
            .map((num) => orderMap.get(num))
            .filter(Boolean);

          // ✅ ADD THIS CHECK
          if (allReportItems.length === 0) {
            console.warn(`No matching orders found for driver ${order.driver_id || order.draft_driver}, order_nums:`, order.order_nums);
            continue; // Skip this block entirely
          }
          
          let requiredHeaders;
          let extraKeys = [];

          if (isLoading(type)) {
            requiredHeaders = [
              "CUSTOMER",
              "CITY",
              "PO NO",
              "TIME",
              "ORDER NO",
              "PRODUCTS",
              "LENGTH",
              "RACK",
              "LOADER'S INFO",
            ];
            extraKeys = ["order_crane_lift_checker", "large_length", "order_docket", "source", "order_priority_status"];
          } else if (type === 3) {
            requiredHeaders = ["ORDER NO"];
            extraKeys = ["order_crane_lift_checker", "large_length", "order_docket", "source", "order_priority_status"];
          } else {
            requiredHeaders = [
              "CUSTOMER",
              "CITY",
              "PO NO",
              "TIME",
              "ORDER NO",
              "PRODUCTS",
              "DRIVER'S INFO",
            ];
            extraKeys = ["order_crane_lift_checker", "large_length", "order_docket", "source", "order_priority_status"];
          }

          const exportHeaders = [...new Set([...requiredHeaders, ...extraKeys])];

          allReportItems = allReportItems.map((row) => {
            const filteredRow = {};
            for (const header of exportHeaders) {
              filteredRow[header] = row[header] ?? "";
            }
            return filteredRow;
          });

          const reportTitle = type === 2 ? "LOADING SHEET" : type === 3 ? "DOCKETS" : "RUN SHEET";

          if (type !== 3 && export_type !== 'pdf') {
            const footerText = isDraft ? "" : `START TIME-${order?.start_time || ""}`;
            const footerText2 = isDraft
              ? `${ordinalSuffixOf(order.run_type)} RUN`
              : `${order.driverInfo[0]?.name?.toUpperCase() || "UNKNOWN"} ${ordinalSuffixOf(order.run_type)}-${order.truckInfo[0]?.name || ""}`;

            const ws = createRunSheet({
              titleDate: `${day.toUpperCase()} ${printDate}`,
              titleMiddle: reportTitle,
              rows: allReportItems,
              footerText,
              footerText2,
            });

            ws["!cols"] = autoColumnWidth(allReportItems, 28);
            const sheetName = isDraft
              ? `${order?.draft_driver} ${ordinalSuffixOf(order.run_type)} ${reportTypes.length > 1 ? reportTitle : ""}`
              : `${order.driverInfo[0]?.name?.toUpperCase() || "UNKNOWN"} ${ordinalSuffixOf(order.run_type)} ${reportTypes.length > 1 ? reportTitle : ""}`;
            XLSX.utils.book_append_sheet(workbook, ws, sheetName);
          }

          // Add block to driver's array
          driverBlocksMap.get(driverKey).push({
            name: order.driverInfo[0]?.name?.toUpperCase() || order.draft_driver || "UNKNOWN",
            runType: ordinalSuffixOf(order.run_type),
            truckName: order.truckInfo[0]?.name || "",
            startTime: order.start_time || "",
            rows: allReportItems,
            type: reportTitle,
            day,
            printDate,
            headers: requiredHeaders,
            driverOrder: order,
            isDraft,
            driverKey, // Add this for sorting later
            reportType: type, // Store the numeric report type (1, 2, or 3)
          });
        }
      }
    };

    processOrders(normalOrders, false);
    processOrders(draftDriverOrders, true);

    // Sort blocks within each driver according to report_type order
    for (const [driverKey, blocks] of driverBlocksMap) {
      blocks.sort((a, b) => {
        const indexA = reportTypes.indexOf(a.reportType);
        const indexB = reportTypes.indexOf(b.reportType);
        return indexA - indexB;
      });
    }

    const filenameBase = `REPORT_${printDate}`;
    
    // Convert map to array and flatten
    const allBlocks = Array.from(driverBlocksMap.values()).flat();
    const blocksWithData = allBlocks.filter(block => block.rows && block.rows.length > 0);

    if (blocksWithData.length === 0) {
      return res.status(200).send("No data to export - no matching orders found");
    }
    // if (!allBlocks[0]?.rows.length) {
    //   return res.status(200).send("No data to export");
    // }

    if (export_type === "pdf") {
      const doc = await PDFLibDocument.create();
      
      // Clear S3 cache for this request
      s3FileCache.clear();

      const TABLE_BATCH_SIZE = 1;  // Process 3 tables at a time (reduced from 6)
      const DOCKET_BATCH_SIZE = 3; // Process 5 dockets at a time
      
      // Separate table and docket blocks
      const allTableBlocks = allBlocks.filter(b => b.type !== "DOCKETS");
      const allDocketBlocks = allBlocks.filter(b => b.type === "DOCKETS");

      console.log(`Processing ${allTableBlocks.length} table blocks...`);
      // ===== STEP 1: Generate ALL table images in parallel (batches of 6) =====
      const tableImagesWithMetadata = await processBatch(
        allTableBlocks,
        TABLE_BATCH_SIZE,
        async (block) => {
          try {
            const buffer = await renderTableAsImage(block.headers, block.rows, {
              type: block.type,
              name: block.name,
              runType: block.runType,
              truckName: block.isDraft ? "" : block.truckName,
              startTime: block.isDraft ? "" : block.startTime,
              day: block.day,
              printDate: block.printDate,
            });
            
            return { 
              buffer, 
              driverKey: block.driverKey,
              blockType: block.type 
            };
          } catch (error) {
            console.error(`Error generating table for ${block.name}:`, error);
            return null;
          }
        }
      );

      // Filter out failed generations
      const validTableImages = tableImagesWithMetadata.filter(Boolean);
      console.log(`Generated ${validTableImages.length} table images`);


      // ===== STEP 2: Generate ALL dockets in parallel =====
      const allDocketItems = [];
      for (const block of allDocketBlocks) {
        for (const row of block.rows) {
          if (row["ORDER NO"] && !processedDocketOrders.has(row["ORDER NO"])) {
            processedDocketOrders.add(row["ORDER NO"]);
            allDocketItems.push({ row, block });
          }
        }
      }

      console.log(`Processing ${allDocketItems.length} dockets...`);
      
      const docketDataWithMetadata = await processWithLimit(
        allDocketItems,
        DOCKET_BATCH_SIZE,
        async ({ row, block }) => {
          try {
            const orderNo = row["ORDER NO"];

            if (row.source === "external" && Array.isArray(row.order_docket) && row.order_docket.length) {
              const pages = [];
              
              // Process S3 files sequentially for this order
              for (const path of row.order_docket) {
                try {
                  const s3Buffer = await getS3FileBuffer(path);
                  if (!s3Buffer) continue;

                  if (path.toLowerCase().endsWith(".pdf")) {
                    const docketDoc = await PDFLibDocument.load(s3Buffer);
                    pages.push({ type: 'pdf', doc: docketDoc });
                  } else if (/\.(png|jpg|jpeg)$/i.test(path)) {
                    pages.push({ 
                      type: 'image', 
                      buffer: s3Buffer, 
                      ext: path.split('.').pop().toLowerCase() 
                    });
                  }
                } catch (err) {
                  console.error(`Error loading S3 file ${path}:`, err);
                }
              }
              
              return { pages, driverKey: block.driverKey, blockType: block.type };
            } else {
              const docketPdfPath = await generateDocketPDFDocketwise(orderNo, row.source);
              
              if (docketPdfPath && fs.existsSync(docketPdfPath)) {
                const docketBytes = fs.readFileSync(docketPdfPath);
                fs.unlinkSync(docketPdfPath);
                const docketDoc = await PDFLibDocument.load(docketBytes);
                return { 
                  pages: [{ type: 'pdf', doc: docketDoc }], 
                  driverKey: block.driverKey, 
                  blockType: block.type 
                };
              }
              
              return { pages: [], driverKey: block.driverKey, blockType: block.type };
            }
          } catch (error) {
            console.error(`Error processing docket ${row["ORDER NO"]}:`, error);
            return { pages: [], driverKey: block.driverKey, blockType: block.type };
          }
        }
      );

      console.log(`Generated ${docketDataWithMetadata.length} dockets`);

      const isBlank = isPdfBlank(validTableImages, allTableBlocks, docketDataWithMetadata, allDocketBlocks);
      
      if (isBlank) {
        const blankCount = incrementBlankPdfCounter();  // ✅ Increment counter
        console.error(`[BLANK-PDF] Blank PDF detected! Count: ${blankCount}`);
        
        // ✅ Restart browser on first blank PDF
        if (blankCount >= 1) {
          await forceRestartBrowser('Blank PDF detected');
        }
        
        return res.status(500).json({ 
          error: 'Failed to generate PDF content. Please try again.',
          details: 'Content generation failed'
        });
      }
      
      // ✅ Reset counter on success
      resetBlankPdfCounter();
      
      // ===== STEP 3: Add pages to PDF in driver order =====
      console.log('Assembling final PDF...');
      
      for (const [driverKey, blocks] of driverBlocksMap) {
        for (const block of blocks) {
          if (block.type === "DOCKETS") {
            const blockDockets = docketDataWithMetadata.filter(
              d => d.driverKey === driverKey && d.blockType === block.type
            );
            
            for (const { pages } of blockDockets) {
              for (const pageData of pages) {
                try {
                  if (pageData.type === 'pdf') {
                    const copiedPages = await doc.copyPages(
                      pageData.doc, 
                      pageData.doc.getPageIndices()
                    );
                    copiedPages.forEach((p) => doc.addPage(p));
                  } else if (pageData.type === 'image') {
                    const page = doc.addPage([841.89, 595.28]);
                    let image;
                    
                    if (pageData.ext === 'png') {
                      image = await doc.embedPng(pageData.buffer);
                    } else {
                      image = await doc.embedJpg(pageData.buffer);
                    }
                    
                    const { width, height } = image.scale(1);
                    const scale = Math.min(800 / width, 515 / height);
                    
                    page.drawImage(image, {
                      x: 20,
                      y: 40,
                      width: width * scale,
                      height: height * scale
                    });
                  }
                } catch (error) {
                  console.error('Error adding page to PDF:', error);
                }
              }
            }
          } else {
            const tableImage = validTableImages.find(
              img => img.driverKey === driverKey && img.blockType === block.type
            );
            
            if (tableImage) {
              try {
                const image = await doc.embedPng(tableImage.buffer);
                const page = doc.addPage([841.89, 595.28]);
                page.drawImage(image, { 
                  x: 20, 
                  y: 60, 
                  width: 800, 
                  height: 475 
                });
              } catch (error) {
                console.error('Error embedding table image:', error);
              }
            }
          }
        }
      }
      // Clear cache and cleanup
      s3FileCache.clear();
      
      console.log('Saving PDF...');
      const pdfBytes = await doc.save();
      const outBuffer = Buffer.from(pdfBytes);
      // Compress PDF here
      // const compressedBuffer = await compressPDF(outBuffer, `${filenameBase}.pdf`);
      const mimeType = "application/pdf";
      const filename = `${filenameBase}.pdf`;

      res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
      res.setHeader("Content-Type", mimeType);
            
      console.log(`PDF generation complete: ${filename}`);
      resetBlankPdfCounter();
      return res.status(200).end(outBuffer);
    }

    const outBuffer = XLSX.write(workbook, {
      type: "buffer",
      bookType: "xlsx",
      cellStyles: true,
    });

    const mimeType =
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";
    const filename = `${filenameBase}.xlsx`;

    scheduleMail(doMail, filename, outBuffer, mimeType, delivery_date);

    res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
    res.setHeader("Content-Type", mimeType);
    res.status(200).end(outBuffer);
    // Add memory monitoring (optional but helpful)
    function logMemoryUsage(label = '') {
      const used = process.memoryUsage();
      console.log(`Memory ${label}:`, {
        rss: `${Math.round(used.rss / 1024 / 1024)}MB`,
        heapUsed: `${Math.round(used.heapUsed / 1024 / 1024)}MB`,
        external: `${Math.round(used.external / 1024 / 1024)}MB`
      });
    }
    logMemoryUsage('after XLSX generation');
  } catch (error) {
    if (!res.headersSent) {
      logError('exportToXLSXRunsOrder', error, req.user?.user_ref_id);
      handleMongooseError(error, res);
    }
  }
};

// const getOrderDetailsBatch = async (matchCondition, orderNums) => {
//   const result = await OrderMaster.aggregate([
//     { $match: matchCondition },
//     { $lookup: { from: "orderitems", localField: "_id", foreignField: "order_master_id", as: "orderitemsInfo" } },
//     { $lookup: { from: "orderitemsmanuals", localField: "_id", foreignField: "order_master_me_id", as: "orderitemsmanualsInfo" } },
//     { $lookup: { from: "accounts", localField: "order_customer_id", foreignField: "_id", as: "customerInfo" } },
//     { $lookup: { from: "orderssubitemcounts", localField: "_id", foreignField: "Order_Mas_Id", as: "orderssubitemcountsInfo" } },
//     {
//       $addFields: {
//         largestItem: {
//           $max: {
//             $concatArrays: [
//               { $map: { input: "$orderitemsInfo", as: "item", in: { $divide: [{ $toDouble: "$$item.order_item_length" }, 1000] } } },
//               { $map: { input: "$orderitemsmanualsInfo", as: "manualItem", in: { $toDouble: "$$manualItem.order_item_me_length" } } }
//             ]
//           }
//         }
//       }
//     },
//     { $lookup: { from: "rackings", localField: "f_order_racking_table", foreignField: "_id", as: "frackingsInfo" } },
//     { $lookup: { from: "rackings", localField: "fg_order_racking_table", foreignField: "_id", as: "fgrackingsInfo" } },
//     { $lookup: { from: "rackings", localField: "cl_order_racking_table", foreignField: "_id", as: "clrackingsInfo" } },
//     { $lookup: { from: "rackings", localField: "j_order_racking_table", foreignField: "_id", as: "jrackingsInfo" } },
//     { $lookup: { from: "rackings", localField: "roof_order_racking_table", foreignField: "_id", as: "roofrackingsInfo" } },
//     { $lookup: { from: "rackings", localField: "gbi_order_racking_table", foreignField: "_id", as: "gbirackingsInfo" } },
//     { $unwind: { path: "$orderssubitemcountsInfo", preserveNullAndEmptyArrays: true } },
//     {
//       $project: {
//         _id: 0,
//         CUSTOMER: { $arrayElemAt: ["$customerInfo.account_Name", 0] },
//         CITY: { $toUpper: { $cond: [{ $eq: ["$order_delivery_address_mode", "0"] }, "$order_store_delivery_city", "$order_site_delivery_city"] } },
//         "PO NO": {
//             $cond: [
//             { $eq: ["$order_customer_UID", AWF_CUST_ID] },
//             {
//                 $let: {
//                 vars: {
//                     restLen: {
//                     $max: [
//                         { $subtract: [{ $strLenBytes: "$order_customer_PO_number" }, 6] },
//                         0
//                     ]
//                     }
//                 },
//                 in: {
//                     $concat: [
//                     { $toString: "$order_unique_id" },
//                     {
//                         $cond: [
//                         { $gt: ["$$restLen", 0] },
//                         { $substrBytes: ["$order_customer_PO_number", 6, "$$restLen"] },
//                         ""  // nothing to append if PO number has <= 6 chars
//                         ]
//                     }
//                     ]
//                 }
//                 }
//             },
//             "$order_customer_PO_number"
//             ]
//         },
//         "ORDER NO": {
//             $cond: [
//             { $eq: ["$order_customer_UID", AWF_CUST_ID] },
//             { $substr: ["$order_customer_PO_number", 0, 6] },
//             "$order_unique_id"
//             ]
//         },
//         TIME: "$order_delivery_time",
//         PRODUCTS: {
//           $reduce: {
//             input: [
//               { letter: "F", count: "$orderssubitemcountsInfo.Order_Flashing_Count" },
//               { letter: "J", count: "$orderssubitemcountsInfo.Order_Jobbing_Count" },
//               { letter: "G", count: "$orderssubitemcountsInfo.Order_GBI_Count" },
//               { letter: "CL", count: "$orderssubitemcountsInfo.Order_Cladding_Count" },
//               { letter: "FG", count: "$orderssubitemcountsInfo.Order_Faciagutter_Count" },
//               { letter: "R", count: "$orderssubitemcountsInfo.Order_Roofing_Count" },
//               { letter: "G.L", count: "$orderssubitemcountsInfo.Order_GBIL_Count" }
//             ],
//             initialValue: "",
//             in: { $concat: ["$$value", { $cond: [{ $gt: [{ $toInt: "$$this.count" }, 0] }, { $concat: ["$$this.letter", ": ", { $toString: "$$this.count" }, "; "] }, ""] }] }
//           }
//         },
//         LENGTH: "$largestItem",
//         RACK: {
//           $let: {
//             vars: {
//               fRackName: { $ifNull: [{ $arrayElemAt: ["$frackingsInfo.rack_name", 0] }, ""] },
//               fStatusCode: {
//                 $switch: {
//                   branches: [
//                     { case: { $eq: ["$order_flashing_checker", false] }, then: "" },
//                     { case: { $eq: ["$f_order_prod_push_status", 0] }, then: "PIP" },
//                     { case: { $eq: ["$f_order_prod_push_status", 1] }, then: "" },
//                     { case: { $eq: ["$f_order_prod_push_status", 2] }, then: { $switch: { branches: [{ case: { $eq: ["$f_order_prod_current_status", "2"] }, then: "RO" }, { case: { $eq: ["$f_order_prod_current_status", "4"] }, then: "FO" }], default: "PIP" } } }
//                   ],
//                   default: "PIP"
//                 }
//               }
//             },
//             in: {
//               $reduce: {
//                 input: [
//                   { prefix: "F: ", value: { $cond: [{ $ne: ["$$fRackName", ""] }, "$$fRackName", "$$fStatusCode"] } },
//                   { prefix: "FG: ", value: { $ifNull: [{ $arrayElemAt: ["$fgrackingsInfo.rack_name", 0] }, ""] } },
//                   { prefix: "CL: ", value: { $ifNull: [{ $arrayElemAt: ["$clrackingsInfo.rack_name", 0] }, ""] } },
//                   { prefix: "J: ", value: { $ifNull: [{ $arrayElemAt: ["$jrackingsInfo.rack_name", 0] }, ""] } },
//                   { prefix: "R: ", value: { $ifNull: [{ $arrayElemAt: ["$roofrackingsInfo.rack_name", 0] }, ""] } },
//                   { prefix: "G: ", value: { $ifNull: [{ $arrayElemAt: ["$gbirackingsInfo.rack_name", 0] }, ""] } }
//                 ],
//                 initialValue: "",
//                 in: { $concat: ["$$value", { $cond: [{ $ne: ["$$this.value", ""] }, { $concat: ["$$this.prefix", "$$this.value", "; "] }, ""] }] }
//               }
//             }
//           }
//         },
//         "DRIVER'S INFO": "$order_custom_note",
//         "LOADER'S INFO": "$order_loaders_info",
//         order_crane_lift_checker: 1,
//         order_delivery_time: 1,
//         order_delivery_session: 1,
//         order_priority_status: 1
//       }
//     }
//   ]).allowDiskUse(true).exec();

//   return result.map(doc => ({
//     ...doc,
//     TIME: getFormattedDeliveryTime(doc.order_delivery_time, doc.order_delivery_session, 'runs')
//   }));
// };

const getOrderDetailsBatch = async (matchCondition) => {
  const rackProject = [{ $project: { _id: 0, rack_name: 1 } }];
  const result = await OrderMaster.aggregate([
    { $match: matchCondition },

    // ---- ORDER ITEMS ----
    {
      $lookup: {
        from: "orderitems",
        let: { orderId: "$_id" },
        pipeline: [
          { $match: { $expr: { $eq: ["$order_master_id", "$$orderId"] } } },
          { $project: { _id: 0, order_item_length: 1 } }
        ],
        as: "orderitemsInfo"
      }
    },

    {
      $lookup: {
        from: "orderitemsmanuals",
        let: { orderId: "$_id" },
        pipeline: [
          { $match: { $expr: { $eq: ["$order_master_me_id", "$$orderId"] } } },
          { $project: { _id: 0, order_item_me_length: 1 } }
        ],
        as: "orderitemsmanualsInfo"
      }
    },

    // ---- CUSTOMER ----
    {
      $lookup: {
        from: "accounts",
        let: { custId: "$order_customer_id" },
        pipeline: [
          { $match: { $expr: { $eq: ["$_id", "$$custId"] } } },
          { $project: { _id: 0, account_Name: 1 } }
        ],
        as: "customerInfo"
      }
    },

    // ---- SUB ITEM COUNTS ----
    {
      $lookup: {
        from: "orderssubitemcounts",
        let: { orderId: "$_id" },
        pipeline: [
          { $match: { $expr: { $eq: ["$Order_Mas_Id", "$$orderId"] } } },
          {
            $project: {
              _id: 0,
              Order_Flashing_Count: 1,
              Order_Jobbing_Count: 1,
              Order_GBI_Count: 1,
              Order_Cladding_Count: 1,
              Order_Faciagutter_Count: 1,
              Order_Roofing_Count: 1,
              Order_GBIL_Count: 1
            }
          }
        ],
        as: "orderssubitemcountsInfo"
      }
    },

    // ---- LARGEST ITEM CALCULATION ----
    {
      $addFields: {
        largestItem: {
          $max: {
            $concatArrays: [
              {
                $map: {
                  input: "$orderitemsInfo",
                  as: "item",
                  in: { $divide: [{ $toDouble: "$$item.order_item_length" }, 1000] }
                }
              },
              {
                $map: {
                  input: "$orderitemsmanualsInfo",
                  as: "manual",
                  in: { $toDouble: "$$manual.order_item_me_length" }
                }
              }
            ]
          }
        }
      }
    },

    // ---- RACKING LOOKUPS (ALL PROJECTED) ----
    {
      $lookup: {
        from: "rackings",
        let: { id: "$f_order_racking_table" },
        pipeline: [{ $match: { $expr: { $eq: ["$_id", "$$id"] } } }, ...rackProject],
        as: "frackingsInfo"
      }
    },
    {
      $lookup: {
        from: "rackings",
        let: { id: "$fg_order_racking_table" },
        pipeline: [{ $match: { $expr: { $eq: ["$_id", "$$id"] } } }, ...rackProject],
        as: "fgrackingsInfo"
      }
    },
    {
      $lookup: {
        from: "rackings",
        let: { id: "$cl_order_racking_table" },
        pipeline: [{ $match: { $expr: { $eq: ["$_id", "$$id"] } } }, ...rackProject],
        as: "clrackingsInfo"
      }
    },
    {
      $lookup: {
        from: "rackings",
        let: { id: "$j_order_racking_table" },
        pipeline: [{ $match: { $expr: { $eq: ["$_id", "$$id"] } } }, ...rackProject],
        as: "jrackingsInfo"
      }
    },
    {
      $lookup: {
        from: "rackings",
        let: { id: "$roof_order_racking_table" },
        pipeline: [{ $match: { $expr: { $eq: ["$_id", "$$id"] } } }, ...rackProject],
        as: "roofrackingsInfo"
      }
    },
    {
      $lookup: {
        from: "rackings",
        let: { id: "$gbi_order_racking_table" },
        pipeline: [{ $match: { $expr: { $eq: ["$_id", "$$id"] } } }, ...rackProject],
        as: "gbirackingsInfo"
      }
    },

    { $unwind: { path: "$orderssubitemcountsInfo", preserveNullAndEmptyArrays: true } },

    // ---- FINAL PROJECT (unchanged logic, lighter docs) ----
    {
      $project: {
        _id: 0,
        CUSTOMER: { $arrayElemAt: ["$customerInfo.account_Name", 0] },
        CITY: { $toUpper: { $cond: [{ $eq: ["$order_delivery_address_mode", "0"] }, "$order_store_delivery_city", "$order_site_delivery_city"] } },
        "PO NO": {
            $cond: [
            { $eq: ["$order_customer_UID", AWF_CUST_ID] },
            {
                $let: {
                vars: {
                    restLen: {
                    $max: [
                        { $subtract: [{ $strLenBytes: "$order_customer_PO_number" }, 6] },
                        0
                    ]
                    }
                },
                in: {
                    $concat: [
                    { $toString: "$order_unique_id" },
                    {
                        $cond: [
                        { $gt: ["$$restLen", 0] },
                        { $substrBytes: ["$order_customer_PO_number", 6, "$$restLen"] },
                        ""  // nothing to append if PO number has <= 6 chars
                        ]
                    }
                    ]
                }
                }
            },
            "$order_customer_PO_number"
            ]
        },
        "ORDER NO": {
            $cond: [
            { $eq: ["$order_customer_UID", AWF_CUST_ID] },
            { $substr: ["$order_customer_PO_number", 0, 6] },
            "$order_unique_id"
            ]
        },
        TIME: "$order_delivery_time",
        PRODUCTS: {
          $reduce: {
            input: [
              { letter: "F", count: "$orderssubitemcountsInfo.Order_Flashing_Count" },
              { letter: "J", count: "$orderssubitemcountsInfo.Order_Jobbing_Count" },
              { letter: "G", count: "$orderssubitemcountsInfo.Order_GBI_Count" },
              { letter: "CL", count: "$orderssubitemcountsInfo.Order_Cladding_Count" },
              { letter: "FG", count: "$orderssubitemcountsInfo.Order_Faciagutter_Count" },
              { letter: "R", count: "$orderssubitemcountsInfo.Order_Roofing_Count" },
              { letter: "G.L", count: "$orderssubitemcountsInfo.Order_GBIL_Count" }
            ],
            initialValue: "",
            in: { $concat: ["$$value", { $cond: [{ $gt: [{ $toInt: "$$this.count" }, 0] }, { $concat: ["$$this.letter", ": ", { $toString: "$$this.count" }, "; "] }, ""] }] }
          }
        },
        LENGTH: "$largestItem",
        RACK: {
          $let: {
            vars: {
              fRackName: { $ifNull: [{ $arrayElemAt: ["$frackingsInfo.rack_name", 0] }, ""] },
              fStatusCode: {
                $switch: {
                  branches: [
                    { case: { $eq: ["$order_flashing_checker", false] }, then: "" },
                    { case: { $eq: ["$f_order_prod_push_status", 0] }, then: "PIP" },
                    { case: { $eq: ["$f_order_prod_push_status", 1] }, then: "" },
                    { case: { $eq: ["$f_order_prod_push_status", 2] }, then: { $switch: { branches: [{ case: { $eq: ["$f_order_prod_current_status", "2"] }, then: "RO" }, { case: { $eq: ["$f_order_prod_current_status", "4"] }, then: "FO" }], default: "PIP" } } }
                  ],
                  default: "PIP"
                }
              }
            },
            in: {
              $reduce: {
                input: [
                  { prefix: "F: ", value: { $cond: [{ $ne: ["$$fRackName", ""] }, "$$fRackName", "$$fStatusCode"] } },
                  { prefix: "FG: ", value: { $ifNull: [{ $arrayElemAt: ["$fgrackingsInfo.rack_name", 0] }, ""] } },
                  { prefix: "CL: ", value: { $ifNull: [{ $arrayElemAt: ["$clrackingsInfo.rack_name", 0] }, ""] } },
                  { prefix: "J: ", value: { $ifNull: [{ $arrayElemAt: ["$jrackingsInfo.rack_name", 0] }, ""] } },
                  { prefix: "R: ", value: { $ifNull: [{ $arrayElemAt: ["$roofrackingsInfo.rack_name", 0] }, ""] } },
                  { prefix: "G: ", value: { $ifNull: [{ $arrayElemAt: ["$gbirackingsInfo.rack_name", 0] }, ""] } }
                ],
                initialValue: "",
                in: { $concat: ["$$value", { $cond: [{ $ne: ["$$this.value", ""] }, { $concat: ["$$this.prefix", "$$this.value", "; "] }, ""] }] }
              }
            }
          }
        },
        "DRIVER'S INFO": "$order_custom_note",
        "LOADER'S INFO": "$order_loaders_info",
        order_crane_lift_checker: 1,
        order_delivery_time: 1,
        order_delivery_session: 1,
        order_priority_status: 1
      }
    }
  ]).exec();

  return result.map(doc => ({
    ...doc,
    TIME: getFormattedDeliveryTime(
      doc.order_delivery_time,
      doc.order_delivery_session,
      "runs"
    )
  }));
};

// const getSplitOrderDetailsBatch = async (matchCondition, orderNums) => {
//   const result = await SplitOrders.aggregate([
//     { $match: matchCondition },
//     { $lookup: { from: "ordermasters", localField: "order_master_id", foreignField: "_id", as: "parentOrder" } },
//     { $unwind: "$parentOrder" },
//     { $lookup: { from: "orderitems", localField: "order_master_id", foreignField: "order_master_id", as: "orderitemsInfo" } },
//     { $lookup: { from: "orderitemsmanuals", localField: "order_master_id", foreignField: "order_master_me_id", as: "orderitemsmanualsInfo" } },
//     { $lookup: { from: "orderssubitemcounts", localField: "order_master_id", foreignField: "Order_Mas_Id", as: "orderssubitemcountsInfo" } },
//     { $lookup: { from: "accounts", localField: "parentOrder.order_customer_id", foreignField: "_id", as: "customerInfo" } },
//     { $unwind: { path: "$orderssubitemcountsInfo", preserveNullAndEmptyArrays: true } },
//     {
//       $addFields: {
//         largestItem: {
//           $max: {
//             $concatArrays: [
//               { $map: { input: "$orderitemsInfo", as: "item", in: { $divide: [{ $toDouble: "$$item.order_item_length" }, 1000] } } },
//               { $map: { input: "$orderitemsmanualsInfo", as: "manualItem", in: { $toDouble: "$$manualItem.order_item_me_length" } } }
//             ]
//           }
//         }
//       }
//     },
//     { $lookup: { from: "rackings", localField: "parentOrder.f_order_racking_table", foreignField: "_id", as: "frackingsInfo" } },
//     { $lookup: { from: "rackings", localField: "parentOrder.fg_order_racking_table", foreignField: "_id", as: "fgrackingsInfo" } },
//     { $lookup: { from: "rackings", localField: "parentOrder.cl_order_racking_table", foreignField: "_id", as: "clrackingsInfo" } },
//     { $lookup: { from: "rackings", localField: "parentOrder.j_order_racking_table", foreignField: "_id", as: "jrackingsInfo" } },
//     { $lookup: { from: "rackings", localField: "parentOrder.roof_order_racking_table", foreignField: "_id", as: "roofrackingsInfo" } },
//     { $lookup: { from: "rackings", localField: "parentOrder.gbi_order_racking_table", foreignField: "_id", as: "gbirackingsInfo" } },
//     {
//       $project: {
//         _id: 0,
//         CUSTOMER: { $arrayElemAt: ["$customerInfo.account_Name", 0] },
//         CITY: { $toUpper: { $cond: [{ $eq: ["$order_delivery_address_mode", "0"] }, "$order_store_delivery_city", "$order_site_delivery_city"] } },
//         "PO NO": "$order_customer_PO_number",
//         "ORDER NO": "$order_unique_id",
//         TIME: "$order_delivery_time",
//         PRODUCTS: {
//           $reduce: {
//             input: [
//               { letter: "F", count: "$orderssubitemcountsInfo.Order_Flashing_Count" },
//               { letter: "J", count: "$orderssubitemcountsInfo.Order_Jobbing_Count" },
//               { letter: "G", count: "$orderssubitemcountsInfo.Order_GBI_Count" },
//               { letter: "CL", count: "$orderssubitemcountsInfo.Order_Cladding_Count" },
//               { letter: "FG", count: "$orderssubitemcountsInfo.Order_Faciagutter_Count" },
//               { letter: "R", count: "$orderssubitemcountsInfo.Order_Roofing_Count" },
//               { letter: "G.L", count: "$orderssubitemcountsInfo.Order_GBIL_Count" }
//             ],
//             initialValue: "",
//             in: { $concat: ["$$value", { $cond: [{ $gt: [{ $toInt: "$$this.count" }, 0] }, { $concat: ["$$this.letter", ": ", { $toString: "$$this.count" }, "; "] }, ""] }] }
//           }
//         },
//         LENGTH: "$largestItem",
//         RACK: {
//           $let: {
//             vars: {
//               fRackName: { $ifNull: [{ $arrayElemAt: ["$frackingsInfo.rack_name", 0] }, ""] },
//               fStatusCode: {
//                 $switch: {
//                   branches: [
//                     { case: { $eq: ["$parentOrder.order_flashing_checker", false] }, then: "" },
//                     { case: { $eq: ["$f_order_prod_push_status", 0] }, then: "PIP" },
//                     { case: { $eq: ["$f_order_prod_push_status", 1] }, then: "" },
//                     { case: { $eq: ["$f_order_prod_push_status", 2] }, then: { $switch: { branches: [{ case: { $eq: ["$f_order_prod_current_status", "2"] }, then: "RO" }, { case: { $eq: ["$f_order_prod_current_status", "4"] }, then: "FO" }], default: "PIP" } } }
//                   ],
//                   default: "PIP"
//                 }
//               }
//             },
//             in: {
//               $reduce: {
//                 input: [
//                   { prefix: "F: ", value: { $cond: [{ $ne: ["$$fRackName", ""] }, "$$fRackName", "$$fStatusCode"] } },
//                   { prefix: "FG: ", value: { $ifNull: [{ $arrayElemAt: ["$fgrackingsInfo.rack_name", 0] }, ""] } },
//                   { prefix: "CL: ", value: { $ifNull: [{ $arrayElemAt: ["$clrackingsInfo.rack_name", 0] }, ""] } },
//                   { prefix: "J: ", value: { $ifNull: [{ $arrayElemAt: ["$jrackingsInfo.rack_name", 0] }, ""] } },
//                   { prefix: "R: ", value: { $ifNull: [{ $arrayElemAt: ["$roofrackingsInfo.rack_name", 0] }, ""] } },
//                   { prefix: "G: ", value: { $ifNull: [{ $arrayElemAt: ["$gbirackingsInfo.rack_name", 0] }, ""] } }
//                 ],
//                 initialValue: "",
//                 in: { $concat: ["$$value", { $cond: [{ $ne: ["$$this.value", ""] }, { $concat: ["$$this.prefix", "$$this.value", "; "] }, ""] }] }
//               }
//             }
//           }
//         },
//         "DRIVER'S INFO": "$parentOrder.order_custom_note",
//         "LOADER'S INFO": "$parentOrder.order_loaders_info",
//         order_crane_lift_checker: "$parentOrder.order_crane_lift_checker",
//         order_delivery_time: 1,
//         order_delivery_session: 1,
//         order_priority_status: 1,
//         source: { $literal: "split" }
//       }
//     }
//   ]).exec();

//   return result.map(doc => ({
//     ...doc,
//     TIME: getFormattedDeliveryTime(doc.order_delivery_time, doc.order_delivery_session, 'runs')
//   }));
// };

const getSplitOrderDetailsBatch = async (matchCondition) => {
  const rackProject = [{ $project: { _id: 0, rack_name: 1 } }];

  const result = await SplitOrders.aggregate([
    { $match: matchCondition },

    // ---- PARENT ORDER ----
    {
      $lookup: {
        from: "ordermasters",
        let: { id: "$order_master_id" },
        pipeline: [
          { $match: { $expr: { $eq: ["$_id", "$$id"] } } },
          {
            $project: {
              _id: 1,
              order_customer_id: 1,
              order_flashing_checker: 1,
              f_order_racking_table: 1,
              fg_order_racking_table: 1,
              cl_order_racking_table: 1,
              j_order_racking_table: 1,
              roof_order_racking_table: 1,
              gbi_order_racking_table: 1,
              order_custom_note: 1,
              order_loaders_info: 1,
              order_crane_lift_checker: 1
            }
          }
        ],
        as: "parentOrder"
      }
    },
    { $unwind: "$parentOrder" },

    // ---- ORDER ITEMS ----
    {
      $lookup: {
        from: "orderitems",
        let: { id: "$order_master_id" },
        pipeline: [
          { $match: { $expr: { $eq: ["$order_master_id", "$$id"] } } },
          { $project: { _id: 0, order_item_length: 1 } }
        ],
        as: "orderitemsInfo"
      }
    },

    {
      $lookup: {
        from: "orderitemsmanuals",
        let: { id: "$order_master_id" },
        pipeline: [
          { $match: { $expr: { $eq: ["$order_master_me_id", "$$id"] } } },
          { $project: { _id: 0, order_item_me_length: 1 } }
        ],
        as: "orderitemsmanualsInfo"
      }
    },

    // ---- SUB ITEM COUNTS ----
    {
      $lookup: {
        from: "orderssubitemcounts",
        let: { id: "$order_master_id" },
        pipeline: [
          { $match: { $expr: { $eq: ["$Order_Mas_Id", "$$id"] } } },
          {
            $project: {
              _id: 0,
              Order_Flashing_Count: 1,
              Order_Jobbing_Count: 1,
              Order_GBI_Count: 1,
              Order_Cladding_Count: 1,
              Order_Faciagutter_Count: 1,
              Order_Roofing_Count: 1,
              Order_GBIL_Count: 1
            }
          }
        ],
        as: "orderssubitemcountsInfo"
      }
    },

    { $unwind: { path: "$orderssubitemcountsInfo", preserveNullAndEmptyArrays: true } },

    // ---- CUSTOMER ----
    {
      $lookup: {
        from: "accounts",
        let: { id: "$parentOrder.order_customer_id" },
        pipeline: [
          { $match: { $expr: { $eq: ["$_id", "$$id"] } } },
          { $project: { _id: 0, account_Name: 1 } }
        ],
        as: "customerInfo"
      }
    },

    // ---- LARGEST ITEM ----
    {
      $addFields: {
        largestItem: {
          $max: {
            $concatArrays: [
              {
                $map: {
                  input: "$orderitemsInfo",
                  as: "item",
                  in: { $divide: [{ $toDouble: "$$item.order_item_length" }, 1000] }
                }
              },
              {
                $map: {
                  input: "$orderitemsmanualsInfo",
                  as: "manual",
                  in: { $toDouble: "$$manual.order_item_me_length" }
                }
              }
            ]
          }
        }
      }
    },

    // ---- RACKINGS ----
    {
      $lookup: {
        from: "rackings",
        let: { id: "$parentOrder.f_order_racking_table" },
        pipeline: [{ $match: { $expr: { $eq: ["$_id", "$$id"] } } }, ...rackProject],
        as: "frackingsInfo"
      }
    },
    {
      $lookup: {
        from: "rackings",
        let: { id: "$parentOrder.fg_order_racking_table" },
        pipeline: [{ $match: { $expr: { $eq: ["$_id", "$$id"] } } }, ...rackProject],
        as: "fgrackingsInfo"
      }
    },
    {
      $lookup: {
        from: "rackings",
        let: { id: "$parentOrder.cl_order_racking_table" },
        pipeline: [{ $match: { $expr: { $eq: ["$_id", "$$id"] } } }, ...rackProject],
        as: "clrackingsInfo"
      }
    },
    {
      $lookup: {
        from: "rackings",
        let: { id: "$parentOrder.j_order_racking_table" },
        pipeline: [{ $match: { $expr: { $eq: ["$_id", "$$id"] } } }, ...rackProject],
        as: "jrackingsInfo"
      }
    },
    {
      $lookup: {
        from: "rackings",
        let: { id: "$parentOrder.roof_order_racking_table" },
        pipeline: [{ $match: { $expr: { $eq: ["$_id", "$$id"] } } }, ...rackProject],
        as: "roofrackingsInfo"
      }
    },
    {
      $lookup: {
        from: "rackings",
        let: { id: "$parentOrder.gbi_order_racking_table" },
        pipeline: [{ $match: { $expr: { $eq: ["$_id", "$$id"] } } }, ...rackProject],
        as: "gbirackingsInfo"
      }
    },

    // ---- FINAL SHAPE ----
    {
      $project: {
        _id: 0,
        CUSTOMER: { $arrayElemAt: ["$customerInfo.account_Name", 0] },
        CITY: { $toUpper: { $cond: [{ $eq: ["$order_delivery_address_mode", "0"] }, "$order_store_delivery_city", "$order_site_delivery_city"] } },
        "PO NO": "$order_customer_PO_number",
        "ORDER NO": "$order_unique_id",
        TIME: "$order_delivery_time",
        PRODUCTS: {
          $reduce: {
            input: [
              { letter: "F", count: "$orderssubitemcountsInfo.Order_Flashing_Count" },
              { letter: "J", count: "$orderssubitemcountsInfo.Order_Jobbing_Count" },
              { letter: "G", count: "$orderssubitemcountsInfo.Order_GBI_Count" },
              { letter: "CL", count: "$orderssubitemcountsInfo.Order_Cladding_Count" },
              { letter: "FG", count: "$orderssubitemcountsInfo.Order_Faciagutter_Count" },
              { letter: "R", count: "$orderssubitemcountsInfo.Order_Roofing_Count" },
              { letter: "G.L", count: "$orderssubitemcountsInfo.Order_GBIL_Count" }
            ],
            initialValue: "",
            in: { $concat: ["$$value", { $cond: [{ $gt: [{ $toInt: "$$this.count" }, 0] }, { $concat: ["$$this.letter", ": ", { $toString: "$$this.count" }, "; "] }, ""] }] }
          }
        },
        LENGTH: "$largestItem",
        RACK: {
          $let: {
            vars: {
              fRackName: { $ifNull: [{ $arrayElemAt: ["$frackingsInfo.rack_name", 0] }, ""] },
              fStatusCode: {
                $switch: {
                  branches: [
                    { case: { $eq: ["$parentOrder.order_flashing_checker", false] }, then: "" },
                    { case: { $eq: ["$f_order_prod_push_status", 0] }, then: "PIP" },
                    { case: { $eq: ["$f_order_prod_push_status", 1] }, then: "" },
                    { case: { $eq: ["$f_order_prod_push_status", 2] }, then: { $switch: { branches: [{ case: { $eq: ["$f_order_prod_current_status", "2"] }, then: "RO" }, { case: { $eq: ["$f_order_prod_current_status", "4"] }, then: "FO" }], default: "PIP" } } }
                  ],
                  default: "PIP"
                }
              }
            },
            in: {
              $reduce: {
                input: [
                  { prefix: "F: ", value: { $cond: [{ $ne: ["$$fRackName", ""] }, "$$fRackName", "$$fStatusCode"] } },
                  { prefix: "FG: ", value: { $ifNull: [{ $arrayElemAt: ["$fgrackingsInfo.rack_name", 0] }, ""] } },
                  { prefix: "CL: ", value: { $ifNull: [{ $arrayElemAt: ["$clrackingsInfo.rack_name", 0] }, ""] } },
                  { prefix: "J: ", value: { $ifNull: [{ $arrayElemAt: ["$jrackingsInfo.rack_name", 0] }, ""] } },
                  { prefix: "R: ", value: { $ifNull: [{ $arrayElemAt: ["$roofrackingsInfo.rack_name", 0] }, ""] } },
                  { prefix: "G: ", value: { $ifNull: [{ $arrayElemAt: ["$gbirackingsInfo.rack_name", 0] }, ""] } }
                ],
                initialValue: "",
                in: { $concat: ["$$value", { $cond: [{ $ne: ["$$this.value", ""] }, { $concat: ["$$this.prefix", "$$this.value", "; "] }, ""] }] }
              }
            }
          }
        },
        "DRIVER'S INFO": "$parentOrder.order_custom_note",
        "LOADER'S INFO": "$parentOrder.order_loaders_info",
        order_crane_lift_checker: "$parentOrder.order_crane_lift_checker",
        order_delivery_time: 1,
        order_delivery_session: 1,
        order_priority_status: 1,
        source: { $literal: "split" }
      }
    }
  ]).exec();

  return result.map(doc => ({
    ...doc,
    TIME: getFormattedDeliveryTime(
      doc.order_delivery_time,
      doc.order_delivery_session,
      "runs"
    )
  }));
};


// Replace the getS3FileBuffer function with this cached version
async function getS3FileBuffer(s3Path) {
  if (s3FileCache.has(s3Path)) {
    return s3FileCache.get(s3Path);
  }
  
  try {
    const params = { Bucket: 'encore-sheet', Key: s3Path };
    const command = new GetObjectCommand(params);
    const data = await s3Client.send(command);
    const buffer = data.Body instanceof Buffer 
      ? data.Body 
      : Buffer.from(await data.Body.transformToByteArray());
    
    s3FileCache.set(s3Path, buffer);
    return buffer;
  } catch (err) {
    console.error(`S3 fetch error for ${s3Path}:`, err.message);
    return null;
  }
}

const assignDriversToRuns = async (delivery_date, run_type, driver_ids = []) =>{
  const date = new Date(delivery_date);
    const nextDate = new Date(date);
    nextDate.setDate(date.getDate() + 1);
    // Build base query
    const query = {
      run_type: run_type.toString(),
      delivery_date: {
        $gte: date,
        $lt: nextDate
      }
    };

    let existingRecord = await RunsDriversOrderModel.find(query);

    for (let i = 0; i < existingRecord.length; i++) {
      const record = existingRecord[i];
      const driverId = driver_ids[i];

      await RunsDriversOrderModel.findByIdAndUpdate(
        record._id,
        { driver_id: driverId },
        { new: true }
      );
    }
}

const checkAllOrdersAssignedToDeliveryDate = async (req, res) => {
  try {
    const { delivery_date } = req.query; // e.g. 2025-09-25T10:21:49.489Z

    // Parse input into Sydney timezone
    const dtSydney = DateTime.fromISO(delivery_date, { zone: "Australia/Sydney" });
    if (!dtSydney.isValid) {
      return res.status(400).json({ message: "Invalid delivery_date" });
    }

    // Start and end of the given day in Sydney
    const startOfDaySydney = dtSydney.startOf("day");
    const endOfDaySydney = dtSydney.endOf("day");

    // Convert to UTC for DB storage/querying
    const startOfDayUTC = startOfDaySydney.toUTC().toJSDate();
    const endOfDayUTC = endOfDaySydney.toUTC().toJSDate();

    // 1. Get all orders from OrderMaster for that Sydney day
    const masterOrders = await OrderMaster.find({
      order_delivery_date: { $gte: startOfDayUTC, $lte: endOfDayUTC },
      split: { $ne : 2},
      order_status: { $ne: "Order Cancelled" },
      $or: [
      // existing logic: non-AWF customers where address mode is not "2"
      { order_customer_UID: { $ne: AWF_CUST_ID }, order_delivery_address_mode: { $ne: "2" } },
      // AWF customer: only include when address mode is "1"
      { order_customer_UID: AWF_CUST_ID, order_delivery_address_mode: "1" }
      ]
    }).select("order_unique_id").lean();

    const externalOrders = await ExternalOrders.find({
      order_delivery_date: { $gte: startOfDayUTC, $lte: endOfDayUTC }
    }).select("order_number").lean();

    const splitOrders = await SplitOrders.find({
      order_delivery_date: { $gte: startOfDayUTC, $lte: endOfDayUTC }
    }).select("order_unique_id").lean();

    if (!masterOrders.length && !externalOrders.length && !splitOrders.length) {
      return res.status(404).json({ message: "No orders found for this delivery date" });
    }

    const masterIds = masterOrders.map(o => o.order_unique_id);
    const externalIds = externalOrders.map(o => o.order_number);
    const splitOrderIds = splitOrders.map(o => o.order_unique_id);

    const allIds = [...masterIds, ...externalIds, ...splitOrderIds]

    // 2. Get all assigned order_nums for that Sydney day
    const runs = await RunsDriversOrderModel.find({
      delivery_date: { $gte: startOfDayUTC, $lte: endOfDayUTC }
    }).select("order_nums").lean();

    const assignedIds = new Set(
      runs.flatMap(run => run.order_nums.map(String))
    );

    // 3. Detect missing orders
    const missingOrders = allIds.filter(id => !assignedIds.has(String(id)));

    if (missingOrders.length > 0) {
      return res.status(200).json({
        status: "missing",
        message: "The order(s) below are not assigned.",
        missingOrders
      });
    }

    return res.status(200).json({
      status: "ok",
      message: "All orders are assigned"
    });

  } catch (err) {
    logError("checkAllOrdersAssignedToDeliveryDate", err, req.user?.user_ref_id);
    handleMongooseError(err, res);
  }
};


const createDraftDriversToRuns = async ( req, res) =>{
  const { delivery_date, draft_drivers, run_type } = req.body

  try{
    const formattedDate = new Date(delivery_date).toISOString().split('T')[0];
    
    // Check if a record already exists for this date
    const existingRecord = await RunsDriversOrderModel.find({ 
        delivery_date: new Date(formattedDate),
        run_type
    });

    if (existingRecord.length > 0) {
      return res.status(209).json({
          status: false,
          message: 'A drivers list already exists for this delivery date and run.'
      });
    }

    const result = await Promise.all(
      draft_drivers?.map(async (item, index) => {
        return await RunsDriversOrderModel.create({
          draft_driver: item,
          delivery_date: new Date(formattedDate),
          order: index + 1,
          run_type,
          created_by: req.user.user_ref_id,
          created_date: new Date()
        });
      })
    );

    res.status(200).json({
      status: true,
      message: `${ordinalSuffixOf(run_type)} run added successfully.`,
      result,
    })
  }catch(err){
    logError('createDraftDriversToRuns', err, req.user.user_ref_id);
    handleMongooseError(err, res);
  }
}

const createSingleDraftDriversToRuns = async (req, res) => {
  const { delivery_date, run_type } = req.body;

  try {
    const formattedDate = new Date(delivery_date).toISOString().split('T')[0];

    // Find existing records for that date/type, sorted descending by order
    const existingRecord = await RunsDriversOrderModel.find({
      delivery_date: new Date(formattedDate),
      run_type
    }).sort({ order: -1 });

    const lastRecord = existingRecord[0];
    const nextOrder = lastRecord ? lastRecord.order + 1 : 1;

    const result = await RunsDriversOrderModel.create({
      draft_driver: `D${nextOrder}`,
      delivery_date: new Date(formattedDate),
      order: nextOrder,
      run_type,
      created_by: req.user.user_ref_id,
      created_date: new Date()
    });

    res.status(200).json({
      status: true,
      message: `Driver added successfully.`,
      result
    });
  } catch (err) {
    console.log(err)
    logError('createSingleDraftDriversToRuns', err, req.user.user_ref_id);
    handleMongooseError(err, res);
  }
};

const fetchRuns = async ( req, res) =>{
  const { delivery_date, run_type } = req.query;
  try{
    if (!delivery_date) {
        return res.status(400).json({
            status: false,
            message: 'Delivery date is required'
        });
    }

    const parsedDate = new Date(delivery_date);
    if (isNaN(parsedDate.getTime())) {
        return res.status(400).json({
            status: false,
            message: 'Invalid delivery date format'
        });
    }

    const formattedDate = parsedDate.toISOString().split('T')[0];
    const startDate = new Date(formattedDate);
    const endDate = new Date(formattedDate);
    endDate.setDate(endDate.getDate() + 1);

    const matchCondition = {
        delivery_date: {
            $gte: startDate,
            $lt: endDate
        },
        run_type
    };

    const pipeline = [
        {
            $match: { ...matchCondition }
        },
        { $lookup: { from: "drivers", localField: "driver_id", foreignField: "_id", as: "driversInfo" } },
        {
            $project: {
                _id: 1,
                delivery_date: 1,
                run_type: 1,
                draft_driver: 1,
                order: 1,
                driver_id: "$driversInfo",
                truck_id: 1,
                start_time: 1
            }
        },
        {
            $sort: { order: 1 }
        }
    ];

    const runsData = await RunsDriversOrderModel.aggregate(pipeline);

    res.status(200).json({
        status: true,
        message: 'Runs fetched successfully',
        data: runsData
    });
  }catch(err){
    logError('fetchRuns', err, req.user.user_ref_id);
    handleMongooseError(err, res);
  }
}

const deleteDriver = async ( req, res ) => {
  const { id } = req.params;
  try{
    if (!id) {
        return res.status(400).json({
          status: false,
          message: 'id is required'
        });
    }

    const result = await RunsDriversOrderModel.findByIdAndDelete(id);

    if(result){
      res.status(200).json({
        status: true,
        message: "Driver deleted successfully."
      });
    } else {
      res.status(404).json({
        status: false,
        message: "Driver not found."
      });
    }
  }catch(err){
    logError('deleteDriver', err, req.user.user_ref_id);
    handleMongooseError(err, res);
  }
}

const getRunTypesAdded = async (req, res) => {
    try {
        const { delivery_date } = req.query;

        if (!delivery_date) {
            return res.status(400).json({
                status: false,
                message: 'Delivery date is required'
            });
        }

        const parsedDate = new Date(delivery_date);
        if (isNaN(parsedDate.getTime())) {
            return res.status(400).json({
                status: false,
                message: 'Invalid delivery date format'
            });
        }

        const formattedDate = parsedDate.toISOString().split('T')[0];
        const startDate = new Date(formattedDate);
        const endDate = new Date(formattedDate);
        endDate.setDate(endDate.getDate() + 1);

        const matchCondition = {
            delivery_date: {
                $gte: startDate,
                $lt: endDate
            }
        };

        const pipeline = [
            {
                $match: { ...matchCondition }
            },
            {
                $project: {
                    _id: 1,
                    delivery_date: 1,
                    run_type: 1
                }
            },
            {
                $sort: { created_date: -1 }
            }
        ];

        const runsData = await RunsDriversOrderModel.aggregate(pipeline);

        res.status(200).json({
            status: true,
            message: 'Added run types fetched successfully.',
            data: runsData
        });

    } catch (error) {
        logError('getRunTypesAdded', error, req.user.user_ref_id);
        handleMongooseError(error, res);
    }
}

const fetchDeafultTruckByDriverId = async ( req, res ) => {
  const { id } = req.params;

  const truckInfo = await Trucks.findOne({ default_driver_id: id, status: 'active' });

  if(truckInfo){
    res.status(200).json({
      status: true,
      truckInfo
    })
  }else{
    res.status(200).json({
      status: false
    })
  }
}

// const assignOrdersDriversToRuns = async (req, res) =>{

// }


module.exports = {
  createDriverOrders,
  checkHasAssignedOrdersByDriverId,
  fetchRunsOrderDetails,
  exportToXLSXRunsOrder,
  assignDriversToRuns,
  sendMail,
  checkAllOrdersAssignedToDeliveryDate,

  // updated functions
  createDraftDriversToRuns,
  fetchRuns,
  deleteDriver,
  getRunTypesAdded,
  fetchDeafultTruckByDriverId,
  createSingleDraftDriversToRuns
}