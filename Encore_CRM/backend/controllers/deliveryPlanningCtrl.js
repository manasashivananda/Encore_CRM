const { default: mongoose } = require("mongoose");
const { logError } = require("../logger");
const OrderMaster = require("../models/ordermasterModel");
const ExternalOrders = require("../models/externalOrderModel");
const { handleMongooseError } = require("./common");
const { DateTime } = require('luxon');
const xlsx = require('xlsx'); // Import the xlsx library
const path = require('path');
const fs = require('fs');
const { GetObjectCommand, S3Client, PutObjectCommand, DeleteObjectCommand } = require('@aws-sdk/client-s3');
const { getSignedUrl } = require('@aws-sdk/s3-request-presigner');
const SplitOrders = require("../models/splitOrdersModel");
const moment = require("moment-timezone");

const AWF_CUST_ID = process.env.AWF_CUSTOMER_ID

const s3Client = new S3Client({
    region: process.env.AWS_REGION,
    credentials: {
      accessKeyId: process.env.AWS_ACCESS_KEY_ID,
      secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
    },
  });

function formatDateString(orderdeliverydate) {
    const date = new Date(orderdeliverydate);
    const timeZone = 'Australia/Sydney';
    const options = {
        day: '2-digit',
        month: '2-digit',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
        hour12: true,
        timeZone: timeZone
    };    
    const formattedDate = new Intl.DateTimeFormat('en-GB', options).format(date);
    const [datePart, timePart] = formattedDate.split(', ');
    const [day, month, year] = datePart.split('/');
    let [time, ampm] = timePart.split(' ');
    ampm = ampm.toLowerCase();    
    return `${day}-${month}-${year}`;
}

// ✅ OPTIMIZATION: Helper to escape regex
function escapeRegExp(string) {
  return string.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

// ✅ OPTIMIZATION: Helper to build match conditions
function buildMatchConditions(query) {
  const matchCondition = {
    $nor: [
      { order_delivery_address_mode: "2" },
      { order_status: "Order Cancelled" }
    ],
    order_hold: { $ne: true }
  };
  
  const searchFilter = {};
  
  // Date range logic
  const today = new Date();
  const tomorrow = new Date(today);
  tomorrow.setDate(today.getDate() + 1);
  tomorrow.setHours(0, 0, 0, 0);
  
  let fromDateTime, toDateTime;
  
  if (query.fromTime && query.toTime) {
    fromDateTime = new Date(query.fromTime);
    toDateTime = new Date(query.toTime);
  } else {
    fromDateTime = new Date(tomorrow);
    toDateTime = new Date(tomorrow);
  }
  
  // Search filter
  const escapedKeyword = query.orderUID ? escapeRegExp(query.orderUID.trim()) : '';
  
  if (escapedKeyword) {
    searchFilter.$or = [
      {
        $expr: {
          $or: [
            {
              $regexMatch: {
                input: "$order_unique_id",
                regex: escapedKeyword,
                options: "i"
              }
            },
            {
              $and: [
                { $eq: ["$order_customer_UID", AWF_CUST_ID] },
                { $eq: [{ $substrBytes: ["$order_customer_PO_number", 0, 6] }, query.orderUID] }
              ]
            }
          ]
        }
      }
    ];
  } else {
    matchCondition.order_delivery_date = { $gte: fromDateTime, $lte: toDateTime };
  }
  
  // Earlies filter
  if (query.earlies === "true") {
    const earlyEnd = moment.tz(toDateTime, "Australia/Sydney")
      .hour(7)
      .minute(45)
      .second(0)
      .millisecond(0)
      .toDate();
    
    if (!query.fromTime) {
      const dt = new Date(toDateTime);
      dt.setHours(0, 0, 0, 0);
      matchCondition.order_delivery_date = { $gte: dt, $lte: earlyEnd };
    } else {
      matchCondition.order_delivery_date = { $gte: fromDateTime, $lte: earlyEnd };
    }
    
    matchCondition.order_delivery_session = { $ne: "A/T" };
    matchCondition.order_customer_UID = { $ne: AWF_CUST_ID };
  }
  
  return { matchCondition, searchFilter, escapedKeyword };
}

// ✅ OPTIMIZATION: Helper to build sort condition
function buildSortCondition(query) {
  const sortableFieldsMap = {
    order_customer_name: "order_customer_name",
    order_site_delivery_city: "order_site_delivery_city",
    order_unique_id: "order_unique_id"
  };
  
  const sortDirection = parseInt(query.sortDirection) || -1;
  const sortField = query.sortField;
  
  let sortCondition = {
    useSalesCommentForSort: 1,
    order_sales_comment: -1
  };
  
  if (sortableFieldsMap[sortField]) {
    sortCondition = {
      [sortableFieldsMap[sortField]]: sortDirection,
      ...sortCondition
    };
  }
  
  return sortCondition;
}

// ✅ OPTIMIZATION: Build optimized aggregation pipeline for OrderMaster
function buildOrderMasterPipeline(matchCondition, searchFilter, sortCondition, skip, limit) {
  return [
    // STEP 1: Match first
    { $match: { ...matchCondition, split: { $ne: 2 } } },
    { $match: searchFilter },
    
    // STEP 2: Add computed fields for sorting
    {
      $addFields: {
        hasSalesComment: {
          $cond: [
            { $and: [{ $ne: ["$order_sales_comment", ""] }, { $ne: ["$order_sales_comment", null] }] },
            true,
            false
          ]
        },
        useSalesCommentForSort: {
          $cond: [
            {
              $and: [
                { $not: ["$order_comment_added_user"] },
                { $ne: ["$order_sales_comment", ""] },
                { $ne: ["$order_sales_comment", null] }
              ]
            },
            true,
            false
          ]
        }
      }
    },
    
    // STEP 3: Sort
    { $sort: sortCondition },
    
    // ✅ CRITICAL: Skip and limit BEFORE expensive lookups
    { $skip: skip },
    { $limit: limit },
    
    // STEP 4: Lookups (only for paginated results)
    {
      $lookup: {
        from: "orderitems",
        localField: "_id",
        foreignField: "order_master_id",
        pipeline: [{ $project: { order_item_length: 1, _id: 1 } }],
        as: "orderitemsInfo"
      }
    },
    {
      $lookup: {
        from: "orderitemsmanuals",
        localField: "_id",
        foreignField: "order_master_me_id",
        pipeline: [{ $project: { order_item_me_length: 1, _id: 1 } }],
        as: "orderitemsmanualsInfo"
      }
    },
    {
      $lookup: {
        from: "accounts",
        localField: "order_customer_id",
        foreignField: "_id",
        pipeline: [
          {
            $project: {
              account_UID: 1,
              account_Name: 1,
              account_Address_line_one: 1,
              account_Address_line_two: 1,
              account_Address_Country: 1,
              account_Address_State: 1,
              account_Address_City: 1,
              account_Address_PostalCode: 1,
              account_Address_Phone: 1,
              account_Address_Email: 1
            }
          }
        ],
        as: "customerInfo"
      }
    },
    {
      $lookup: {
        from: "orderssubitemcounts",
        localField: "_id",
        foreignField: "Order_Mas_Id",
        pipeline: [
          {
            $project: {
              Order_Flashing_Count: 1,
              Order_Jobbing_Count: 1,
              Order_Cladding_Count: 1,
              Order_Faciagutter_Count: 1,
              Order_Roofing_Count: 1,
              Order_GBI_Count: 1,
              Order_GBIL_Count: 1
            }
          }
        ],
        as: "orderssubitemcountsInfo"
      }
    },
    
    // STEP 5: Calculate largest item
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
    
    // STEP 6: Filter to largest items
    {
      $addFields: {
        orderitemsInfo: {
          $filter: {
            input: "$orderitemsInfo",
            as: "item",
            cond: {
              $eq: [{ $divide: [{ $toDouble: "$$item.order_item_length" }, 1000] }, "$largestItem"]
            }
          }
        },
        orderitemsmanualsInfo: {
          $filter: {
            input: "$orderitemsmanualsInfo",
            as: "manualItem",
            cond: {
              $eq: [{ $toDouble: "$$manualItem.order_item_me_length" }, "$largestItem"]
            }
          }
        }
      }
    },
    {
      $addFields: {
        orderitemsInfo: { $arrayElemAt: ["$orderitemsInfo", 0] },
        orderitemsmanualsInfo: { $arrayElemAt: ["$orderitemsmanualsInfo", 0] }
      }
    },
    
    // STEP 7: Racking lookups
    {
      $lookup: {
        from: "rackings",
        localField: "f_order_racking_table",
        foreignField: "_id",
        pipeline: [{ $project: { rack_name: 1, _id: 0 } }],
        as: "frackingsInfo"
      }
    },
    {
      $lookup: {
        from: "rackings",
        localField: "fg_order_racking_table",
        foreignField: "_id",
        pipeline: [{ $project: { rack_name: 1, _id: 0 } }],
        as: "fgrackingsInfo"
      }
    },
    {
      $lookup: {
        from: "rackings",
        localField: "cl_order_racking_table",
        foreignField: "_id",
        pipeline: [{ $project: { rack_name: 1, _id: 0 } }],
        as: "clrackingsInfo"
      }
    },
    {
      $lookup: {
        from: "rackings",
        localField: "j_order_racking_table",
        foreignField: "_id",
        pipeline: [{ $project: { rack_name: 1, _id: 0 } }],
        as: "jrackingsInfo"
      }
    },
    {
      $lookup: {
        from: "rackings",
        localField: "roof_order_racking_table",
        foreignField: "_id",
        pipeline: [{ $project: { rack_name: 1, _id: 0 } }],
        as: "roofrackingsInfo"
      }
    },
    
    { $unwind: { path: "$orderssubitemcountsInfo", preserveNullAndEmptyArrays: true } },
    
    // STEP 8: Final projection
    {
      $project: {
        _id: 1,
        order_unique_id: {
          $cond: [
            { $eq: ["$order_customer_UID", AWF_CUST_ID] },
            { $substrBytes: ["$order_customer_PO_number", 0, 6] },
            "$order_unique_id"
          ]
        },
        order_customer_id: 1,
        order_delivery_date: 1,
        order_delivery_date_str: 1,
        order_delivery_time: 1,
        order_delivery_session: 1,
        order_delivery_address_mode: 1,
        order_delivery_address: 1,
        order_site_delivery_city: 1,
        order_site_delivery_address2: 1,
        order_site_delivery_address1: 1,
        order_site_delivery_country: 1,
        order_site_delivery_postalcode: 1,
        order_site_delivery_state: 1,
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
                        ""
                      ]
                    }
                  ]
                }
              }
            },
            "$order_customer_PO_number"
          ]
        },
        order_site_delivery_attention_person: 1,
        order_site_delivery_attention_contact: 1,
        order_store_delivery_city: 1,
        order_store_delivery_address2: 1,
        order_store_delivery_address1: 1,
        order_store_delivery_country: 1,
        order_store_delivery_postalcode: 1,
        order_store_delivery_state: 1,
        order_crane_lift_checker: 1,
        order_master_rack: 1,
        order_Overall_Price: 1,
        order_loaders_info: 1,
        order_custom_note: 1,
        order_Pieces: 1,
        created: 1,
        created_str: 1,
        account_ID: { $arrayElemAt: ["$customerInfo._id", 0] },
        account_UID: { $arrayElemAt: ["$customerInfo.account_UID", 0] },
        account_Name: { $arrayElemAt: ["$customerInfo.account_Name", 0] },
        account_Address_line_one: { $arrayElemAt: ["$customerInfo.account_Address_line_one", 0] },
        account_Address_line_two: { $arrayElemAt: ["$customerInfo.account_Address_line_two", 0] },
        account_Address_Country: { $arrayElemAt: ["$customerInfo.account_Address_Country", 0] },
        account_Address_State: { $arrayElemAt: ["$customerInfo.account_Address_State", 0] },
        account_Address_City: { $arrayElemAt: ["$customerInfo.account_Address_City", 0] },
        account_Address_PostalCode: { $arrayElemAt: ["$customerInfo.account_Address_PostalCode", 0] },
        account_Address_Phone: { $arrayElemAt: ["$customerInfo.account_Address_Phone", 0] },
        account_Address_Email: { $arrayElemAt: ["$customerInfo.account_Address_Email", 0] },
        Order_Flashing_Count: "$orderssubitemcountsInfo.Order_Flashing_Count",
        Order_Jobbing_Count: "$orderssubitemcountsInfo.Order_Jobbing_Count",
        Order_Cladding_Count: "$orderssubitemcountsInfo.Order_Cladding_Count",
        Order_Faciagutter_Count: "$orderssubitemcountsInfo.Order_Faciagutter_Count",
        Order_Roofing_Count: "$orderssubitemcountsInfo.Order_Roofing_Count",
        Order_GBI_Count: "$orderssubitemcountsInfo.Order_GBI_Count",
        Order_GBIL_Count: "$orderssubitemcountsInfo.Order_GBIL_Count",
        f_order_racking_table: { $arrayElemAt: ["$frackingsInfo.rack_name", 0] },
        fg_order_racking_table: { $arrayElemAt: ["$fgrackingsInfo.rack_name", 0] },
        cl_order_racking_table: { $arrayElemAt: ["$clrackingsInfo.rack_name", 0] },
        j_order_racking_table: { $arrayElemAt: ["$jrackingsInfo.rack_name", 0] },
        roof_order_racking_table: { $arrayElemAt: ["$roofrackingsInfo.rack_name", 0] },
        overall_item_count: {
          $add: [
            { $ifNull: ["$orderssubitemcountsInfo.Order_Flashing_Count", 0] },
            { $ifNull: ["$orderssubitemcountsInfo.Order_Jobbing_Count", 0] },
            { $ifNull: ["$orderssubitemcountsInfo.Order_Cladding_Count", 0] },
            { $ifNull: ["$orderssubitemcountsInfo.Order_Faciagutter_Count", 0] },
            { $ifNull: ["$orderssubitemcountsInfo.Order_Roofing_Count", 0] },
            { $ifNull: ["$orderssubitemcountsInfo.Order_GBI_Count", 0] }
          ]
        },
        largest_length: "$largestItem",
        order_sales_comment: 1,
        order_priority_status: 1,
        order_comment_attended_user: 1,
        split: 1,
        source: { $literal: "OrderMaster" }
      }
    }
  ];
}

// ✅ OPTIMIZATION: Process split orders with batched queries (eliminates N+1 problem)
async function processSplitOrders(splitOrders) {
  if (!splitOrders || splitOrders.length === 0) {
    return [];
  }
  
  // ✅ CRITICAL: Collect all IDs first
  const orderMasterIds = splitOrders.map(so => so.order_master_id);
  const allOrderItemIds = splitOrders.flatMap(so => so.order_item_id || []);
  const allManualItemIds = splitOrders.flatMap(so => so.order_item_manual_id || []);
  
  // ✅ OPTIMIZATION: Batch query ALL data at once instead of N queries
  const [
    orderMasters,
    orderItems,
    manualItems,
    rackings,
    subitemCounts
  ] = await Promise.all([
    OrderMaster.find({ _id: { $in: orderMasterIds }, split: 2 }).lean(),
    mongoose.model("orderitems").find({ _id: { $in: allOrderItemIds } }).select('_id order_item_length order_master_id').lean(),
    mongoose.model("orderitemsmanuals").find({ _id: { $in: allManualItemIds } }).select('_id order_item_me_length').lean(),
    mongoose.model("rackings").find({}).select('_id rack_name').lean(), // Get all rackings once
    mongoose.model("orderssubitemcounts").find({
      Order_Mas_Id: { $in: orderMasterIds }
    }).lean()
  ]);
  
  const customerIds = orderMasters.map(om => om.order_customer_id).filter(Boolean);
  const customers = await mongoose.model("accounts")
  .find({ _id: { $in: customerIds } })
  .lean();
  // ✅ Create lookup maps for O(1) access
  const orderMasterMap = new Map(orderMasters.map(om => [om._id.toString(), om]));
  const rackingMap = new Map(rackings.map(r => [r._id.toString(), r]));
  const subitemCountMap = new Map(subitemCounts.map(sc => [sc.Order_Mas_Id.toString(), sc]));
  const customerMap = new Map(customers.map(c => [c._id.toString(), c]));
  
  // Group items by order_master_id
  const itemsByMaster = new Map();
  orderItems.forEach(item => {
    const masterId = item.order_master_id?.toString();
    if (!itemsByMaster.has(masterId)) {
      itemsByMaster.set(masterId, []);
    }
    itemsByMaster.get(masterId).push(item);
  });
  
  // ✅ Process all split orders
  const splitOrderItems = [];
  
  for (const splitOrder of splitOrders) {
    const orderMaster = orderMasterMap.get(splitOrder.order_master_id.toString());
    if (!orderMaster) continue;
    
    // Get items for this split order
    const orderitemsInfo = orderItems.filter(item => 
      splitOrder.order_item_id?.some(id => id.toString() === item._id.toString())
    );
    const orderitemsmanualsInfo = manualItems.filter(item =>
      splitOrder.order_item_manual_id?.some(id => id.toString() === item._id.toString())
    );
    
    // Calculate largest item
    const itemLengths = orderitemsInfo.map(item => Number(item.order_item_length) / 1000);
    const manualLengths = orderitemsmanualsInfo.map(item => Number(item.order_item_me_length));
    const largestItem = Math.max(...itemLengths, ...manualLengths, 0);
    
    const largestOrderItem = orderitemsInfo.find(item => 
      Number(item.order_item_length) / 1000 === largestItem
    ) || null;
    const largestManualItem = orderitemsmanualsInfo.find(item => 
      Number(item.order_item_me_length) === largestItem
    ) || null;
    
    // Get related data from maps
    const orderssubitemcountsInfo = subitemCountMap.get(orderMaster._id.toString());
    const customerInfo = customerMap.get(orderMaster.order_customer_id?.toString());
    
    splitOrderItems.push({
      _id: splitOrder._id,
      order_unique_id: splitOrder.order_unique_id,
      order_customer_id: orderMaster.order_customer_id,
      order_delivery_date: splitOrder.order_delivery_date,
      order_delivery_date_str: splitOrder.order_delivery_date_str,
      order_delivery_time: splitOrder.order_delivery_time,
      order_delivery_session: splitOrder.order_delivery_session,
      order_delivery_address_mode: splitOrder.order_delivery_address_mode,
      order_site_delivery_city: splitOrder.order_site_delivery_city,
      order_site_delivery_address2: splitOrder.order_site_delivery_address2,
      order_site_delivery_address1: splitOrder.order_site_delivery_address1,
      order_site_delivery_country: splitOrder.order_site_delivery_country,
      order_site_delivery_postalcode: splitOrder.order_site_delivery_postalcode,
      order_site_delivery_state: splitOrder.order_site_delivery_state,
      order_customer_PO_number: splitOrder.order_customer_PO_number,
      order_store_delivery_city: splitOrder.order_store_delivery_city,
      order_store_delivery_address2: splitOrder.order_store_delivery_address2,
      order_store_delivery_address1: splitOrder.order_store_delivery_address1,
      order_store_delivery_country: splitOrder.order_store_delivery_country,
      order_store_delivery_postalcode: splitOrder.order_store_delivery_postalcode,
      order_site_delivery_attention_person: splitOrder.order_site_delivery_attention_person,
      order_site_delivery_attention_contact: splitOrder.order_site_delivery_attention_contact,
      order_store_delivery_state: splitOrder.order_store_delivery_state,
      order_crane_lift_checker: orderMaster.order_crane_lift_checker,
      order_master_rack: orderMaster.order_master_rack,
      order_Overall_Price: orderMaster.order_Overall_Price,
      order_loaders_info: orderMaster.order_loaders_info,
      order_custom_note: orderMaster.order_custom_note,
      order_Pieces: orderMaster.order_Pieces,
      created: orderMaster.created,
      created_str: orderMaster.created_str,
      account_ID: customerInfo?._id,
      account_UID: customerInfo?.account_UID,
      account_Name: customerInfo?.account_Name,
      account_Address_line_one: customerInfo?.account_Address_line_one,
      account_Address_line_two: customerInfo?.account_Address_line_two,
      account_Address_Country: customerInfo?.account_Address_Country,
      account_Address_State: customerInfo?.account_Address_State,
      account_Address_City: customerInfo?.account_Address_City,
      account_Address_PostalCode: customerInfo?.account_Address_PostalCode,
      account_Address_Phone: customerInfo?.account_Address_Phone,
      account_Address_Email: customerInfo?.account_Address_Email,
      Order_Flashing_Count: orderssubitemcountsInfo?.Order_Flashing_Count,
      Order_Jobbing_Count: orderssubitemcountsInfo?.Order_Jobbing_Count,
      Order_Cladding_Count: orderssubitemcountsInfo?.Order_Cladding_Count,
      Order_Faciagutter_Count: orderssubitemcountsInfo?.Order_Faciagutter_Count,
      Order_Roofing_Count: orderssubitemcountsInfo?.Order_Roofing_Count,
      Order_GBI_Count: orderssubitemcountsInfo?.Order_GBI_Count,
      Order_GBIL_Count: orderssubitemcountsInfo?.Order_GBIL_Count,
      f_order_racking_table: rackingMap.get(orderMaster.f_order_racking_table?.toString())?.rack_name,
      fg_order_racking_table: rackingMap.get(orderMaster.fg_order_racking_table?.toString())?.rack_name,
      cl_order_racking_table: rackingMap.get(orderMaster.cl_order_racking_table?.toString())?.rack_name,
      j_order_racking_table: rackingMap.get(orderMaster.j_order_racking_table?.toString())?.rack_name,
      roof_order_racking_table: rackingMap.get(orderMaster.roof_order_racking_table?.toString())?.rack_name,
      overall_item_count: [
        orderssubitemcountsInfo?.Order_Flashing_Count || 0,
        orderssubitemcountsInfo?.Order_Jobbing_Count || 0,
        orderssubitemcountsInfo?.Order_Cladding_Count || 0,
        orderssubitemcountsInfo?.Order_Faciagutter_Count || 0,
        orderssubitemcountsInfo?.Order_Roofing_Count || 0,
        orderssubitemcountsInfo?.Order_GBI_Count || 0
      ].reduce((a, b) => a + b, 0),
      largest_length: largestItem,
      order_sales_comment: splitOrder.order_sales_comment,
      order_priority_status: splitOrder.order_priority_status,
      order_comment_attended_user: splitOrder.order_comment_attended_user,
      split: orderMaster.split,
      info: splitOrder.info,
      source: "SplitOrders",
      orderitemsInfo: largestOrderItem,
      orderitemsmanualsInfo: largestManualItem
    });
  }
  
  return splitOrderItems;
}

// ✅ MAIN OPTIMIZED FUNCTION
exports.getDeliveryPlanning = async (req, res) => {
  const startTime = Date.now();
  
  try {
    const limit = 50;
    const page = parseInt(req.query.page) || 0;
    const skip = page * limit;
    
    // Build conditions
    const { matchCondition, searchFilter, escapedKeyword } = buildMatchConditions(req.query);
    const sortCondition = buildSortCondition(req.query);
    
    // ✅ OPTIMIZATION: Execute all independent queries in parallel
    const [
      nonSplitOrdersCount,
      loaderReportItems,
      splitOrders,
      externalOrdersData
    ] = await Promise.all([
      // Count non-split orders
      OrderMaster.countDocuments({
        split: { $ne: 2 },
        ...matchCondition,
        ...searchFilter
      }),
      
      // Get paginated OrderMaster items
      OrderMaster.aggregate(
        buildOrderMasterPipeline(matchCondition, searchFilter, sortCondition, skip, limit)
      ).allowDiskUse(true),
      
      // Get split orders
      SplitOrders.aggregate([
        { $match: { ...matchCondition, ...searchFilter } },
        { $sort: sortCondition }
      ]).allowDiskUse(true),
      
      // Get external orders (conditional)
      req.query.earlies !== "true" ? (async () => {
        const externalMatchCondition = {};
        if (matchCondition.order_delivery_date) {
          externalMatchCondition.order_delivery_date = matchCondition.order_delivery_date;
        }
        
        const externalSearchFilter = {};
        if (req.query.orderUID) {
          externalSearchFilter.$or = [
            { order_number: { $regex: escapedKeyword, $options: "i" } }
          ];
        }
        
        const items = await ExternalOrders.aggregate([
          { $match: externalMatchCondition },
          { $match: externalSearchFilter },
          { $sort: sortCondition },
          { $skip: skip },
          { $limit: limit },
          {
            $project: {
              _id: 1,
              order_unique_id: '$order_number',
              account_Name: '$order_customer_name',
              order_customer_PO_number: '$order_customer_po_number',
              order_delivery_date: 1,
              order_delivery_date_str: 1,
              order_delivery_time: 1,
              order_delivery_session: 1,
              order_crane_lift_checker: 1,
              order_loaders_info: 1,
              order_custom_note: '$order_drivers_info',
              order_master_rack: 1,
              largest_length: '$order_length',
              order_Overall_Price: '$order_overall_price',
              order_city: 1,
              order_postal_code: 1,
              order_state: 1,
              order_delivery_address: 1,
              created: 1,
              order_docket: 1,
              order_priority_status: 1,
              order_sales_comment: 1,
              order_comment_added_user: 1,
              order_comment_updated_user: 1,
              order_comment_attended_user: 1,
              source: { $literal: "ExternalOrders" }
            }
          }
        ]).allowDiskUse(true);
        
        return { items, count: items.length };
      })() : Promise.resolve({ items: [], count: 0 })
    ]);
    
    // ✅ OPTIMIZATION: Process split orders with batched queries
    const splitOrderItems = await processSplitOrders(splitOrders);
    
    // Combine results
    const combinedItems = [
      ...loaderReportItems,
      ...splitOrderItems,
      ...externalOrdersData.items
    ];
    
    // Calculate totals
    const totalOrdersCount = nonSplitOrdersCount + splitOrderItems.length;
    const totalPages = Math.ceil((totalOrdersCount + externalOrdersData.count) / limit);
    
    const queryTime = Date.now() - startTime;
    if (queryTime > 2000) {
      console.warn(`[PERF] Slow getDeliveryPlanning: ${queryTime}ms`, {
        page,
        hasSearch: !!req.query.orderUID,
        earlies: req.query.earlies === "true",
        nonSplitCount: nonSplitOrdersCount,
        splitCount: splitOrderItems.length,
        externalCount: externalOrdersData.count
      });
    }
    
    const responseObject = {
      loaderReportItems: combinedItems,
      totalItems: totalOrdersCount + externalOrdersData.count,
      rowsPerPage: limit,
      totalPages: totalPages
    };
    
    res.status(200).json(responseObject);
    
  } catch (err) {
    console.error('Error in getDeliveryPlanning:', err);
    logError('getDeliveryPlanning', err, req.user?.user_ref_id);
    handleMongooseError(err, res);
  }
};

exports.exportDeliveryPlanning = async (req, res) => {
    try {
        // Escape regex safely
        function escapeRegExp(string) {
            return string.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
        }

        // Common filter logic
        const matchCondition = {
            $nor: [
                { order_delivery_address_mode: "2" },
                { order_status: "Order Cancelled" }
            ],
            // Exclude orders on hold
            order_hold: { $ne: true }
        };

        let fromDateTime, toDateTime;
        const searchFilter = {};
        const today = new Date();
        const tomorrow = new Date(today);
        tomorrow.setDate(today.getDate() + 1);
        const year = tomorrow.getFullYear();
        const month = String(tomorrow.getMonth() + 1).padStart(2, '0');
        const day = String(tomorrow.getDate()).padStart(2, '0');
        const tomorrowDate = `${year}-${month}-${day}`;

        const escapedKeyword = escapeRegExp(req.query.orderUID.trim());
        if (escapedKeyword) {
            searchFilter.$or = [
                // { order_unique_id: { $regex: escapedKeyword, $options: "i" } },
                {
                    $expr: {
                        $or: [
                        // case-insensitive regex match against order_unique_id
                        {
                            $regexMatch: {
                            input: "$order_unique_id",
                            regex: escapedKeyword,    // escapedKeyword should be a string (already escaped)
                            options: "i"
                            }
                        },
                        // AWF-specific case: customer UID equals AWF_CUST_ID and first 6 chars of PO equal the UID
                        {
                            $and: [
                            { $eq: ["$order_customer_UID", AWF_CUST_ID] },
                            { $eq: [{ $substrBytes: ["$order_customer_PO_number", 0, 6] }, req.query.orderUID] }
                            ]
                        }
                        ]
                    }
                },
            ]
        } else{
            if (req.query.fromTime && req.query.toTime) {
                fromDateTime = new Date(req.query.fromTime);
                toDateTime = new Date(req.query.toTime);
            } else {
                fromDateTime = new Date(tomorrowDate);
                toDateTime = new Date(tomorrowDate);
            }
            matchCondition.order_delivery_date = { $gte: fromDateTime, $lte: toDateTime };
        }

            // Extra filter for earlies
            if (req.query.earlies === "true") {
                const earlyStart = fromDateTime || new Date(toDateTime);
                // Adjust to 7:45 AM in Australia/Sydney timezone
                const earlyEnd = moment.tz(toDateTime, "Australia/Sydney")
                    .hour(7)
                    .minute(45)
                    .second(0)
                    .millisecond(0)
                    .toDate();

                if (!req.query.fromTime) {
                    const dt = new Date(toDateTime);
                    dt.setHours(0, 0, 0, 0);
                    matchCondition.order_delivery_date = { $gte: dt, $lte: earlyEnd };
                } else {
                    matchCondition.order_delivery_date = { $gte: earlyStart, $lte: earlyEnd };
                }

                // Exclude A/T sessions
                matchCondition.order_delivery_session = { $ne: "A/T" };
            }

        // ✅ Non-split orders directly from OrderMaster
        let nonSplitOrders = await OrderMaster.find({
            split: { $ne: 2 },
            ...matchCondition,
            ...searchFilter
        });

        // ✅ Split orders directly from SplitOrders
        let splitOrders = [];
        if (req.query.orderUID) {
            splitOrders = await SplitOrders.find({ ...searchFilter });
        } else {
            splitOrders = await SplitOrders.find({
                // order_delivery_date: { $gte: fromDateTime, $lte: toDateTime },
                ...matchCondition,
                ...searchFilter,
            });
        }

        // LoaderReportItems aggregation (for non-split orders only)
        let loaderReportItems = await OrderMaster.aggregate([
            { $match: { ...matchCondition, split: { $ne: 2 } } },
            { $match: searchFilter },
            // ... rest of aggregation unchanged ...
            {
                $addFields: {
                    hasSalesComment: {
                        $cond: [
                            { $and: [{ $ne: ["$order_sales_comment", "" ] }, { $ne: ["$order_sales_comment", null] }] },
                            true,
                            false
                        ]
                    },
                    useSalesCommentForSort: {
                        $cond: [
                            {
                                $and: [
                                    { $not: ["$order_comment_added_user"] },
                                    { $ne: ["$order_sales_comment", "" ] },
                                    { $ne: ["$order_sales_comment", null] }
                                ]
                            },
                            true,
                            false
                        ]
                    }
                }
            },
            {
                $sort: {
                    useSalesCommentForSort: 1,
                    order_sales_comment: -1,
                    created: 1
                }
            },
            { $match: { ...matchCondition, split: { $ne: 2 } } },
            { $match: searchFilter },
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
                            cond: {
                                $eq: [{ $divide: [{ $toDouble: "$$item.order_item_length" }, 1000] }, "$largestItem"]
                            }
                        }
                    },
                    orderitemsmanualsInfo: {
                        $filter: {
                            input: "$orderitemsmanualsInfo",
                            as: "manualItem",
                            cond: {
                                $eq: [{ $toDouble: "$$manualItem.order_item_me_length" }, "$largestItem"]
                            }
                        }
                    }
                }
            },
            {
                $addFields: {
                    orderitemsInfo: { $arrayElemAt: ["$orderitemsInfo", 0] },
                    orderitemsmanualsInfo: { $arrayElemAt: ["$orderitemsmanualsInfo", 0] }
                }
            },
            { $lookup: { from: "rackings", localField: "f_order_racking_table", foreignField: "_id", as: "frackingsInfo" } },
            { $lookup: { from: "rackings", localField: "fg_order_racking_table", foreignField: "_id", as: "fgrackingsInfo" } },
            { $lookup: { from: "rackings", localField: "cl_order_racking_table", foreignField: "_id", as: "clrackingsInfo" } },
            { $lookup: { from: "rackings", localField: "j_order_racking_table", foreignField: "_id", as: "jrackingsInfo" } },
            { $lookup: { from: "rackings", localField: "roof_order_racking_table", foreignField: "_id", as: "roofrackingsInfo" } },
            { $unwind: { path: "$orderssubitemcountsInfo", preserveNullAndEmptyArrays: true } },
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
                    order_customer_id: 1,
                    order_delivery_date: 1,
                    order_delivery_date_str: 1,
                    order_delivery_time: 1,
                    order_delivery_session: 1,
                    order_delivery_address_mode: 1,
                    order_delivery_address: 1,
                    order_site_delivery_city: 1,
                    order_site_delivery_address2: 1,
                    order_site_delivery_address1: 1,
                    order_site_delivery_country: 1,
                    order_site_delivery_postalcode: 1,
                    order_site_delivery_state: 1,
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
                    order_store_delivery_address2: 1,
                    order_store_delivery_address1: 1,
                    order_store_delivery_country: 1,
                    order_store_delivery_postalcode: 1,
                    order_store_delivery_state: 1,
                    order_crane_lift_checker:1,
                    order_master_rack: 1,
                    order_Overall_Price: 1,
                    order_loaders_info: 1,
                    order_custom_note: 1,
                    order_Pieces: 1,
                    created: 1,
                    created_str: 1,
                    account_ID: { $arrayElemAt: ["$customerInfo._id", 0] },
                    account_UID: { $arrayElemAt: ["$customerInfo.account_UID", 0] },
                    account_Name: { $arrayElemAt: ["$customerInfo.account_Name", 0] },
                    account_Address_line_one: { $arrayElemAt: ["$customerInfo.account_Address_line_one", 0] },
                    account_Address_line_two: { $arrayElemAt: ["$customerInfo.account_Address_line_two", 0] },
                    account_Address_Country: { $arrayElemAt: ["$customerInfo.account_Address_Country", 0] },
                    account_Address_State: { $arrayElemAt: ["$customerInfo.account_Address_State", 0] },
                    account_Address_City: { $arrayElemAt: ["$customerInfo.account_Address_City", 0] },
                    account_Address_PostalCode: { $arrayElemAt: ["$customerInfo.account_Address_PostalCode", 0] },
                    account_Address_Phone: { $arrayElemAt: ["$customerInfo.account_Address_Phone", 0] },
                    account_Address_Email: { $arrayElemAt: ["$customerInfo.account_Address_Email", 0] },
                    Order_Flashing_Count: "$orderssubitemcountsInfo.Order_Flashing_Count",
                    Order_Jobbing_Count: "$orderssubitemcountsInfo.Order_Jobbing_Count",
                    Order_Cladding_Count: "$orderssubitemcountsInfo.Order_Cladding_Count",
                    Order_Faciagutter_Count: "$orderssubitemcountsInfo.Order_Faciagutter_Count",
                    Order_Roofing_Count: "$orderssubitemcountsInfo.Order_Roofing_Count",
                    Order_GBI_Count: "$orderssubitemcountsInfo.Order_GBI_Count",
                    Order_GBIL_Count: "$orderssubitemcountsInfo.Order_GBIL_Count",
                    f_order_racking_table: { $arrayElemAt: ["$frackingsInfo.rack_name", 0] },
                    fg_order_racking_table: { $arrayElemAt: ["$fgrackingsInfo.rack_name", 0] },
                    cl_order_racking_table: { $arrayElemAt: ["$clrackingsInfo.rack_name", 0] },
                    j_order_racking_table: { $arrayElemAt: ["$jrackingsInfo.rack_name", 0] },
                    roof_order_racking_table: { $arrayElemAt: ["$roofrackingsInfo.rack_name", 0] },
                    overall_item_count: {
                        $add: [
                            "$orderssubitemcountsInfo.Order_Flashing_Count",
                            "$orderssubitemcountsInfo.Order_Jobbing_Count",
                            "$orderssubitemcountsInfo.Order_Cladding_Count",
                            "$orderssubitemcountsInfo.Order_Faciagutter_Count",
                            "$orderssubitemcountsInfo.Order_Roofing_Count",
                            "$orderssubitemcountsInfo.Order_GBI_Count",
                        ],
                    },
                    largest_length: "$largestItem",
                    order_sales_comment: 1,
                    order_priority_status: 1,
                    order_comment_attended_user: 1,
                    split: 1,
                    source: { $literal: "OrderMaster" }
                }
            }
        ])

        // SplitOrders aggregation
        let splitOrderItems = [];
        if (splitOrders.length > 0) {
            for (const splitOrder of splitOrders) {
                const orderMaster = await OrderMaster.findOne({_id: splitOrder.order_master_id, split : { $eq: 2 }});
                if (!orderMaster) continue;

                const orderitemsInfo = await mongoose.model("orderitems").find({ _id: { $in: splitOrder.order_item_id } });
                const orderitemsmanualsInfo = await mongoose.model("orderitemsmanuals").find({ _id: { $in: splitOrder.order_item_manual_id } });

                const itemLengths = orderitemsInfo.map(item => Number(item.order_item_length) / 1000);
                const manualLengths = orderitemsmanualsInfo.map(item => Number(item.order_item_me_length));
                const largestItem = Math.max(...itemLengths, ...manualLengths);

                const largestOrderItem = orderitemsInfo.find(item => Number(item.order_item_length) / 1000 === largestItem) || null;
                const largestManualItem = orderitemsmanualsInfo.find(item => Number(item.order_item_me_length) === largestItem) || null;

                const frackingsInfo = await mongoose.model("rackings").find({ _id: orderMaster.f_order_racking_table });
                const fgrackingsInfo = await mongoose.model("rackings").find({ _id: orderMaster.fg_order_racking_table });
                const clrackingsInfo = await mongoose.model("rackings").find({ _id: orderMaster.cl_order_racking_table });
                const jrackingsInfo = await mongoose.model("rackings").find({ _id: orderMaster.j_order_racking_table });
                const roofrackingsInfo = await mongoose.model("rackings").find({ _id: orderMaster.roof_order_racking_table });
                const orderssubitemcountsInfo = await mongoose.model("orderssubitemcounts").findOne({ Order_Mas_Id: orderMaster._id });

                const customerInfo = await mongoose.model("accounts").findById(orderMaster.order_customer_id);

                splitOrderItems.push({
                    _id: splitOrder._id,
                    order_unique_id: splitOrder.order_unique_id,
                    order_customer_id: orderMaster.order_customer_id,
                    order_delivery_date: splitOrder.order_delivery_date,
                    order_delivery_date_str: splitOrder.order_delivery_date_str,
                    order_delivery_time: splitOrder.order_delivery_time,
                    order_delivery_session: splitOrder.order_delivery_session,
                    order_delivery_address_mode: splitOrder.order_delivery_address_mode,
                    order_site_delivery_city: splitOrder.order_site_delivery_city,
                    order_site_delivery_address2: splitOrder.order_site_delivery_address2,
                    order_site_delivery_address1: splitOrder.order_site_delivery_address1,
                    order_site_delivery_country: splitOrder.order_site_delivery_country,
                    order_site_delivery_postalcode: splitOrder.order_site_delivery_postalcode,
                    order_site_delivery_state: splitOrder.order_site_delivery_state,
                    order_customer_PO_number: splitOrder.order_customer_PO_number,
                    order_store_delivery_city: splitOrder.order_store_delivery_city,
                    order_store_delivery_address2: splitOrder.order_store_delivery_address2,
                    order_store_delivery_address1: splitOrder.order_store_delivery_address1,
                    order_store_delivery_country: splitOrder.order_store_delivery_country,
                    order_store_delivery_postalcode: splitOrder.order_store_delivery_postalcode,
                    order_site_delivery_attention_person: splitOrder.order_site_delivery_attention_person,
                    order_site_delivery_attention_contact: splitOrder.order_site_delivery_attention_contact,
                    order_store_delivery_state: splitOrder.order_store_delivery_state,
                    order_crane_lift_checker: orderMaster.order_crane_lift_checker,
                    order_master_rack: orderMaster.order_master_rack,
                    order_Overall_Price: orderMaster.order_Overall_Price,
                    order_loaders_info: orderMaster.order_loaders_info,
                    order_custom_note: orderMaster.order_custom_note,
                    order_Pieces: orderMaster.order_Pieces,
                    created: orderMaster.created,
                    created_str: orderMaster.created_str,
                    account_ID: customerInfo?._id,
                    account_UID: customerInfo?.account_UID,
                    account_Name: customerInfo?.account_Name,
                    account_Address_line_one: customerInfo?.account_Address_line_one,
                    account_Address_line_two: customerInfo?.account_Address_line_two,
                    account_Address_Country: customerInfo?.account_Address_Country,
                    account_Address_State: customerInfo?.account_Address_State,
                    account_Address_City: customerInfo?.account_Address_City,
                    account_Address_PostalCode: customerInfo?.account_Address_PostalCode,
                    account_Address_Phone: customerInfo?.account_Address_Phone,
                    account_Address_Email: customerInfo?.account_Address_Email,
                    Order_Flashing_Count: orderssubitemcountsInfo?.Order_Flashing_Count,
                    Order_Jobbing_Count: orderssubitemcountsInfo?.Order_Jobbing_Count,
                    Order_Cladding_Count: orderssubitemcountsInfo?.Order_Cladding_Count,
                    Order_Faciagutter_Count: orderssubitemcountsInfo?.Order_Faciagutter_Count,
                    Order_Roofing_Count: orderssubitemcountsInfo?.Order_Roofing_Count,
                    Order_GBI_Count: orderssubitemcountsInfo?.Order_GBI_Count,
                    Order_GBIL_Count: orderssubitemcountsInfo?.Order_GBIL_Count,
                    f_order_racking_table: frackingsInfo[0]?.rack_name,
                    fg_order_racking_table: fgrackingsInfo[0]?.rack_name,
                    cl_order_racking_table: clrackingsInfo[0]?.rack_name,
                    j_order_racking_table: jrackingsInfo[0]?.rack_name,
                    roof_order_racking_table: roofrackingsInfo[0]?.rack_name,
                    overall_item_count: [
                        orderssubitemcountsInfo?.Order_Flashing_Count || 0,
                        orderssubitemcountsInfo?.Order_Jobbing_Count || 0,
                        orderssubitemcountsInfo?.Order_Cladding_Count || 0,
                        orderssubitemcountsInfo?.Order_Faciagutter_Count || 0,
                        orderssubitemcountsInfo?.Order_Roofing_Count || 0,
                        orderssubitemcountsInfo?.Order_GBI_Count || 0,
                    ].reduce((a, b) => a + b, 0),
                    largest_length: largestItem,
                    order_sales_comment: splitOrder.order_sales_comment,
                    order_priority_status: splitOrder.order_priority_status,
                    order_comment_attended_user: splitOrder.order_comment_attended_user,
                    split: orderMaster.split,
                    info: splitOrder.info,
                    source: "SplitOrders",
                    orderitemsInfo: largestOrderItem,
                    orderitemsmanualsInfo: largestManualItem
                });
            }
        }

        // ExternalOrders aggregation (unchanged except matches)
        const externalMatchCondition = {};
        if (matchCondition.order_delivery_date) {
            externalMatchCondition.order_delivery_date = matchCondition.order_delivery_date;
        }
        const externalSearchFilter = {};
        if (req.query.orderUID) {
            externalSearchFilter.$or = [
                { order_number: { $regex: req.query.orderUID, $options: "i" } }
            ];
        }

        let externalOrdersItems = await ExternalOrders.aggregate([
            { $match: externalMatchCondition },
            { $match: externalSearchFilter },
            {
                $project: {
                    _id: 1,
                    order_unique_id: '$order_number',
                    account_Name :'$order_customer_name',
                    order_customer_PO_number :'$order_customer_po_number',
                    order_delivery_date: 1,
                    order_delivery_date_str: 1,
                    order_delivery_time: 1,
                    order_delivery_session: 1,
                    order_crane_lift_checker: 1,
                    order_loaders_info: 1,
                    order_custom_note: '$order_drivers_info',
                    order_master_rack: 1,
                    largest_length: '$order_length',
                    order_Overall_Price: '$order_overall_price',
                    order_city: 1,
                    order_postal_code: 1,
                    order_state: 1,
                    order_delivery_address: 1,
                    created: 1,
                    order_docket: 1,
                    order_priority_status: 1,
                    order_sales_comment:1, 
                    order_comment_added_user: 1,
                    order_comment_updated_user: 1,
                    order_comment_attended_user: 1,
                    source: { $literal: "ExternalOrders" }
                }
            }
        ])
        // Combine all results
        const combinedItems = [...loaderReportItems, ...splitOrderItems, ...externalOrdersItems];

        // Pagination count
        const externalOrdersCount = externalOrdersItems?.length;
        const totalOrdersCount = nonSplitOrders.length + splitOrderItems.length;

        const responseObject = {
            loaderReportItems: combinedItems,
            totalItems: totalOrdersCount + externalOrdersCount,
        };
        res.send(responseObject).status(200).end();
    } catch (err) {
        logError('getDeliveryPlanning', err, req.user.user_ref_id);
        handleMongooseError(err, res)
    }
};

exports.updateOrderStatusCommentDetails = async (req, res) =>{
    try{
        const orderMasID = new mongoose.Types.ObjectId(req.params.id);
        const comment_added_user = new mongoose.Types.ObjectId(req.user.user_ref_id);
        let { loader_info, priority_status, comment, source } = req.body;
        let orderMasterInfo;
        if(source !== "ExternalOrders"){
            orderMasterInfo = await OrderMaster.findOne({ _id: orderMasID });
            let status = orderMasterInfo.order_status;
            if (status === "Order Cancelled") {
                return res.status(404).send('Cancelled Order. Please Recheck');
            }
        }else{
            orderMasterInfo = await ExternalOrders.findOne({ _id: orderMasID });
        }
        

        let loader_message = orderMasterInfo.order_loaders_info || "";

        // Remove existing "Priority" if priority_status is 0
        if (priority_status !== 1) {
            loader_message = loader_message.replace(/\bPriority\b/g, '').trim();
        }

        // // If loader_info exists, append it to the message
        // if (loader_info && loader_info.trim() !== "") {
        //     loader_message += (loader_message ? " " : "") + loader_info.trim();
        // }

        // Add "Priority" if priority_status is 1 and it's not already present
        if (priority_status === 1 && !/\bPriority\b/.test(loader_message)) {
            loader_message = "Priority " + loader_message;
        }


        let updatedData = {
            $set: {
                order_loaders_info: loader_message,
                order_priority_status: priority_status || 0,
                order_sales_comment: comment,
                order_comment_added_user : comment ? comment_added_user : null
            }
        }

        const conditions = { _id: orderMasID };
        let updatedOrderInfo;
        if(source !== "ExternalOrders"){
            updatedOrderInfo = await OrderMaster.findByIdAndUpdate(conditions, updatedData);
        }else{
            updatedOrderInfo = await ExternalOrders.findByIdAndUpdate(conditions, updatedData);
        }

        res.status(200).send(updatedOrderInfo);
    }catch(err){
        logError("updateOrderStatusCommentDetails", err)
    }   
}

const generateExtOrderNumber = async (type) => {
  if (type !== "Pickup") return null; // Only generate for Pickup

  // Find the latest Pickup order_number
  const lastOrder = await ExternalOrders.findOne({ order_number: { $regex: /^PUP-/ } })
    .sort({ created: -1 })
    .lean();

  let nextNumber = 1;

  if (lastOrder) {
    // Extract the numeric part after 'PUP-'
    const lastNumber = parseInt(lastOrder.order_number.replace("PUP-", ""), 10);
    if (!isNaN(lastNumber)) {
      nextNumber = lastNumber + 1;
    }else{
        const lastPickupOrder = await ExternalOrders.findOne({ order_number: { $regex: /^PUP-/ }, order_type: "Pickup" })
        .sort({ created: -1 })
        .lean();
        const lastPickupNumber = parseInt(lastPickupOrder.order_number.replace("PUP-", ""), 10);
        nextNumber = lastPickupNumber + 1
    }
  }

  const order_number = `PUP-${nextNumber}`;
  return order_number;
};


exports.addExternalOrderDetails = async (req, res) => {
    try {

        let { 
            order_customer_name,
            order_customer_po_number,
            order_delivery_date,
            order_delivery_time,
            order_delivery_session,
            order_crane_lift_checker,
            order_loaders_info,
            order_drivers_info,
            order_master_rack,
            order_length,
            order_overall_price,
            order_city,
            order_country,
            order_postal_code,
            order_state,
            order_delivery_address,
            order_type
        } = req.body

        let order_created_by = new mongoose.Types.ObjectId(req.user.user_ref_id)
        const generatedNumber = await generateExtOrderNumber(order_type)

        let order_number = generatedNumber !== null ? generatedNumber : req.body.order_number

        let now = new Date();
        let melbourneTime = new Date(now.toLocaleString('en-US', { timeZone: 'Australia/Melbourne' }));

        let formattedNow = [
            ('0' + melbourneTime.getDate()).slice(-2),        
            ('0' + (melbourneTime.getMonth() + 1)).slice(-2), 
            melbourneTime.getFullYear()                       
        ].join('-') + ' ' + melbourneTime.toLocaleTimeString('en-US', {
            hour: '2-digit',
            minute: '2-digit',
            hour12: true
        }).toLowerCase().replace(':', ':').replace(' ', ' ');
        formattedNow = formattedNow.replace(/\.(\d{2})/, ':$1');

        let formattedDate = formatDateString(order_delivery_date);
        let dateObj = DateTime.fromRFC2822(order_delivery_date, { zone: 'Australia/Sydney' });
        if (!dateObj.isValid) {
            console.error('Invalid DateTime:', dateObj.invalidExplanation);
        } else {
            if (dateObj.isInDST) {
                //console.log('Daylight Saving is active.');
                dateObj = dateObj.plus({ hours: 11 });
            } else {
                //console.log('Standard time is active.');
                dateObj = dateObj.plus({ hours: 10 });
            }
        } 

        let currentDateObj = DateTime.now().setZone('Australia/Sydney');
        if (!currentDateObj.isValid) {
            console.error('Invalid DateTime:', currentDateObj.invalidExplanation);
        } else {
            if (currentDateObj.isInDST) {
                //console.log('Daylight Saving is active.');
                currentDateObj = currentDateObj.plus({ hours: 11 });
            } else {
                //console.log('Standard time is active.');
                currentDateObj = currentDateObj.plus({ hours: 10 });
            }
            formattedCurrentDate = currentDateObj.toFormat("yyyy-MM-dd'T'HH:mm:ssZZ");
        }

        if (order_delivery_time && order_delivery_time.trim() === "12.00 AM") {
            order_delivery_session = "A/T";
        }
        let timeOnlyStr = order_delivery_time.replace(/ AM| PM/i, '').trim();
        if(order_delivery_session === "A/T"){
            timeOnlyStr = "A/T"
        }else{
            timeOnlyStr = order_delivery_time;
        }

        const orderData = new ExternalOrders({
            order_number,
            order_customer_name,
            order_customer_po_number,
            order_delivery_date,
            order_delivery_date_str: formattedDate,
            order_delivery_time,
            order_delivery_session,
            created_str: formattedNow,
            order_crane_lift_checker,
            order_loaders_info,
            order_drivers_info,
            order_master_rack,
            order_length,
            order_overall_price,
            order_city,
            order_country,
            order_postal_code,
            order_state,
            order_delivery_address,
            order_created_person: order_created_by,
            order_type
        });
        const orderDataInfo = await orderData.save();
        res.status(200).send(orderDataInfo);   
    } catch (err) {
      logError('addExternalOrderDetails', err, req.user.user_ref_id);
      handleMongooseError(err, res)
    }
}

exports.updateExternalOrderDetails = async (req, res) => {
    try {
        const order_id = new mongoose.Types.ObjectId(req.params.id);
        let { 
            order_number,
            order_customer_name,
            order_customer_po_number,
            order_delivery_date,
            order_delivery_time,
            order_delivery_session,
            order_crane_lift_checker,
            order_loaders_info,
            order_drivers_info,
            order_master_rack,
            order_length,
            order_overall_price,
            order_city,
            order_country,
            order_postal_code,
            order_state,
            order_delivery_address,
            comment_attended
        } = req.body

        let order_updated_by = new mongoose.Types.ObjectId(req.user.user_ref_id)
        let order_comment_attended_user = comment_attended === "true" ? new mongoose.Types.ObjectId(req.user.user_ref_id) : null


        let now = new Date();
        let options = { timeZone: 'Australia/Melbourne', hour12: true };
        let datenow = new Intl.DateTimeFormat('en-US', options).format(now);
        let melbourneTime = new Date(now.toLocaleString('en-US', { timeZone: 'Australia/Melbourne' }));

        let formattedNow = [
            ('0' + melbourneTime.getDate()).slice(-2),        
            ('0' + (melbourneTime.getMonth() + 1)).slice(-2), 
            melbourneTime.getFullYear()                       
        ].join('-') + ' ' + melbourneTime.toLocaleTimeString('en-US', {
            hour: '2-digit',
            minute: '2-digit',
            hour12: true
        }).toLowerCase().replace(':', ':').replace(' ', ' ');
        formattedNow = formattedNow.replace(/\.(\d{2})/, ':$1');

        let formattedDate = formatDateString(order_delivery_date);
        let dateObj = DateTime.fromRFC2822(order_delivery_date, { zone: 'Australia/Sydney' });
        if (!dateObj.isValid) {
            console.error('Invalid DateTime:', dateObj.invalidExplanation);
        } else {
            if (dateObj.isInDST) {
                //console.log('Daylight Saving is active.');
                dateObj = dateObj.plus({ hours: 11 });
            } else {
                //console.log('Standard time is active.');
                dateObj = dateObj.plus({ hours: 10 });
            }
        } 

        let currentDateObj = DateTime.now().setZone('Australia/Sydney');
        if (!currentDateObj.isValid) {
            console.error('Invalid DateTime:', currentDateObj.invalidExplanation);
        } else {
            if (currentDateObj.isInDST) {
                //console.log('Daylight Saving is active.');
                currentDateObj = currentDateObj.plus({ hours: 11 });
            } else {
                //console.log('Standard time is active.');
                currentDateObj = currentDateObj.plus({ hours: 10 });
            }
            formattedCurrentDate = currentDateObj.toFormat("yyyy-MM-dd'T'HH:mm:ssZZ");
        }

        if (order_delivery_time && order_delivery_time.trim() === "12.00 AM") {
            order_delivery_session = "A/T";
        }
        let timeOnlyStr = order_delivery_time.replace(/ AM| PM/i, '').trim();
        if(order_delivery_session === "A/T"){
            timeOnlyStr = "A/T"
        }else{
            timeOnlyStr = order_delivery_time;
        }

        const updateData = {
            $set: {
                order_number,
                order_customer_name,
                order_customer_po_number,
                order_delivery_date,
                order_delivery_date_str: formattedDate,
                order_delivery_time,
                order_delivery_session,
                created_str: formattedNow,
                order_crane_lift_checker,
                order_loaders_info,
                order_drivers_info,
                order_master_rack,
                order_length,
                order_overall_price,
                order_city,
                order_country,
                order_postal_code,
                order_state,
                order_delivery_address,
                updated: datenow,
                order_updated_person: order_updated_by,
                order_comment_attended_user : order_comment_attended_user
            }
        };
        const conditions = { _id: order_id };
        updatedOrderInfo = await ExternalOrders.findByIdAndUpdate(conditions, updateData);
        res.status(200).send(updatedOrderInfo);   
    } catch (err) {
      logError('updateExternalOrderDetails', err, req.user.user_ref_id);
      handleMongooseError(err, res)
    }
}

exports.bulkImportExternalOrders = async (req, res) => {
    try {
        let sheets = [];
        if (req.files && req.files.length > 0) {
            sheets = req.files.map((file) => file.filename);
        }
        const totalSheets = sheets.length;
        let sheetsProcessed = 0;
        let order_updated_by = new mongoose.Types.ObjectId(req.user.user_ref_id)
        let order_created_by = new mongoose.Types.ObjectId(req.user.user_ref_id)
        let errorMessages = [];
        let skippedOrders = [];
        const sampleFormat = {
            Delivery_Date: "DD-MM-YYYY",
            Delivery_Time: "HH.MM AM/PM"
        };

        // Helper to validate date and time
        function isValidDateFormat(dateStr) {
            // Should be DD-MM-YYYY
            return /^\d{2}-\d{2}-\d{4}$/.test(dateStr);
        }
        function isValidTimeFormat(timeStr) {
            // Should be H.MM AM/PM or HH.MM AM/PM (e.g., 5.00 AM, 12.30 PM)
            return /^([1-9]|1[0-2])\.\d{2}\s?(AM|PM)$/i.test(timeStr);
        }

        const promises = sheets.map(async (sheet) => {
            sheetsProcessed++;
            const filePath = path.join(__dirname, '..', 'xlsximages', sheet);
            const workbook = xlsx.readFile(filePath);
            const sheetName = workbook.SheetNames[0];
            const worksheet = workbook.Sheets[sheetName];
            const jsonData = [];
            const headerRow = xlsx.utils.sheet_to_json(worksheet, { header: 1 })[0];

            if (!headerRow || headerRow.length === 0) {
                return Promise.reject('Invalid Excel file format');
            }

            const cleanHeaderRow = headerRow.map((key) => key.replace(/\s+/g, '_'));
            xlsx.utils.sheet_to_json(worksheet, { header: 1, range: 1 }).forEach((row) => {
                const rowData = {};
                for (let i = 0; i < cleanHeaderRow.length; i++) {
                    rowData[cleanHeaderRow[i]] = row[i];
                }
                jsonData.push(rowData);
            });

            const existingRowsCount = await ExternalOrders.countDocuments();
            // Filter out invalid records and collect skipped order numbers
            const validData = [];
            for (const item of jsonData) {
                const orderNumber = item["Order_Number"];
                const deliveryDate = item["Delivery_Date"];
                const deliveryTime = item["Delivery_Time"];
                if (!isValidDateFormat(deliveryDate) || !isValidTimeFormat(deliveryTime)) {
                    skippedOrders.push(orderNumber);
                    continue;
                }
                validData.push(item);
            }

            if (existingRowsCount === 0) {
                const bulkInsertOperations = validData.map(async (item) => {
                    const checkIDExistance = await ExternalOrders.findOne({ order_number: item["Order_Number"] });

                    let now = new Date();
                    let options = { timeZone: 'Australia/Melbourne', hour12: true };
                    let datenow = new Intl.DateTimeFormat('en-US', options).format(now);
                    let melbourneTime = new Date(now.toLocaleString('en-US', { timeZone: 'Australia/Melbourne' }));

                    let formattedNow = [
                            ('0' + melbourneTime.getDate()).slice(-2),        
                            ('0' + (melbourneTime.getMonth() + 1)).slice(-2), 
                            melbourneTime.getFullYear()                       
                    ].join('-') + ' ' + melbourneTime.toLocaleTimeString('en-US', {
                            hour: '2-digit',
                            minute: '2-digit',
                            hour12: true
                    }).toLowerCase().replace(':', ':').replace(' ', ' ');
                    formattedNow = formattedNow.replace(/\.(\d{2})/, ':$1');
                    item["Delivery_Date"] = new Date(item["Delivery_Date"]?.split("-").reverse().join("-")).toUTCString();
                    let formattedDate = formatDateString(item["Delivery_Date"]);
                    let dateObj = DateTime.fromRFC2822(item["Delivery_Date"], { zone: 'Australia/Sydney' });
                    if (!dateObj.isValid) {
                            // skip, but should not happen due to earlier validation
                    } else {
                            if (dateObj.isInDST) {
                                    dateObj = dateObj.plus({ hours: 11 });
                            } else {
                                    dateObj = dateObj.plus({ hours: 10 });
                            }
                    } 

                    let currentDateObj = DateTime.now().setZone('Australia/Sydney');
                    if (currentDateObj.isValid) {
                            if (currentDateObj.isInDST) {
                                    currentDateObj = currentDateObj.plus({ hours: 11 });
                            } else {
                                    currentDateObj = currentDateObj.plus({ hours: 10 });
                            }
                    }
                    let order_delivery_session;

                    if (item["Delivery_Time"] && item["Delivery_Time"].trim() === "12.00 AM") {
                            order_delivery_session = "A/T";
                    }
                    if (!checkIDExistance) {
                        const orderData = new ExternalOrders({
                                order_number: item["Order_Number"],
                                order_customer_name: item["Customer_Name"],
                                order_customer_po_number: item["Cust_PO_Number"],
                                order_delivery_date: item["Delivery_Date"] || null,
                                order_delivery_date_str: formattedDate,
                                order_delivery_time: item["Delivery_Time"] || "",
                                order_delivery_session: order_delivery_session || "",
                                created_str: formattedNow,
                                order_crane_lift_checker: item["Crane_Lift"] && item["Crane_Lift"].toLowerCase() === "yes"? true: false,
                                order_loaders_info: item["Loaders_info"] || "",
                                order_drivers_info: item["Drivers_Info"] || "",
                                order_master_rack: item["Master_Rack"] || "",
                                order_length: item["Order_Length"],
                                order_overall_price: item["Order_Value"],
                                order_city: item["City"],
                                order_postal_code: item["Postal_Code"],
                                order_delivery_address: item["Delivery_Address"],
                                order_created_person: order_created_by
                        });
                        await orderData.save();
                    } else {
                        errorMessages.push({ message: `Order Number ${item["Order_Number"]} already exists.` })
                    }
                });

                await Promise.all(bulkInsertOperations);
            } else {
                const bulkOperations = validData.map(async (item) => {
                    const order_number = item["Order_Number"];
                    if(order_number === undefined){
                            return;
                    }
                    let now = new Date();
                    let options = { timeZone: 'Australia/Melbourne', hour12: true };
                    let datenow = new Intl.DateTimeFormat('en-US', options).format(now);
                    let melbourneTime = new Date(now.toLocaleString('en-US', { timeZone: 'Australia/Melbourne' }));

                    let formattedNow = [
                            ('0' + melbourneTime.getDate()).slice(-2),        
                            ('0' + (melbourneTime.getMonth() + 1)).slice(-2), 
                            melbourneTime.getFullYear()                       
                    ].join('-') + ' ' + melbourneTime.toLocaleTimeString('en-US', {
                            hour: '2-digit',
                            minute: '2-digit',
                            hour12: true
                    }).toLowerCase().replace(':', ':').replace(' ', ' ');
                    formattedNow = formattedNow.replace(/\.(\d{2})/, ':$1');
                    item["Delivery_Date"] = new Date(item["Delivery_Date"]?.split("-").reverse().join("-")).toUTCString();
                    let formattedDate = formatDateString(item["Delivery_Date"]);
                    let dateObj = DateTime.fromRFC2822(item["Delivery_Date"], { zone: 'Australia/Sydney' });
                    if (!dateObj.isValid) {
                            // skip, but should not happen due to earlier validation
                    } else {
                            if (dateObj.isInDST) {
                                    dateObj = dateObj.plus({ hours: 11 });
                            } else {
                                    dateObj = dateObj.plus({ hours: 10 });
                            }
                    } 

                    let currentDateObj = DateTime.now().setZone('Australia/Sydney');
                    if (currentDateObj.isValid) {
                            if (currentDateObj.isInDST) {
                                    currentDateObj = currentDateObj.plus({ hours: 11 });
                            } else {
                                    currentDateObj = currentDateObj.plus({ hours: 10 });
                            }
                    }
                    let order_delivery_session;

                    if (item["Delivery_Time"] && item["Delivery_Time"].trim() === "12.00 AM") {
                            order_delivery_session = "A/T";
                    }
                    if (!order_number) {
                            errorMessages.push({ message: `Order Number ${order_number} not found.` })
                            return;
                    }
                    if (order_number === item["Order_Number"]) {
                            errorMessages.push({ message: `Order Number ${item["Order_Number"]} already exists.` })
                    }
                    
                    const checkIDExistance = await ExternalOrders.findOne({ order_number: order_number });
                    if (checkIDExistance) {
                            const updateData = {
                            $set: {
                                    order_number: item["Order_Number"],
                                    order_customer_name: item["Customer_Name"],
                                    order_customer_po_number: item["Cust_PO_Number"],
                                    order_delivery_date: item["Delivery_Date"] || null,
                                    order_delivery_date_str: formattedDate,
                                    order_delivery_time: item["Delivery_Time"] || "",
                                    order_delivery_session: order_delivery_session || "",
                                    created_str: formattedNow,
                                    order_crane_lift_checker: item["Crane_Lift"] && item["Crane_Lift"].toLowerCase() === "yes"? true: false,
                                    order_loaders_info: item["Loaders_info"] || "",
                                    order_drivers_info: item["Drivers_Info"] || "",
                                    order_master_rack: item["Master_Rack"] || "",
                                    order_length: item["Order_Length"],
                                    order_overall_price: item["Order_Value"],
                                    order_city: item["City"],
                                    order_postal_code: item["Postal_Code"],
                                    order_delivery_address: item["Delivery_Address"],
                                    order_updated_person: order_updated_by,
                                    updated: datenow
                            },
                            };
                            const conditions = { _id: checkIDExistance._id };
                            await ExternalOrders.updateOne(conditions, updateData);
                    } else {
                            const orderData = new ExternalOrders({
                                    order_number: item["Order_Number"],
                                    order_customer_name: item["Customer_Name"],
                                    order_customer_po_number: item["Cust_PO_Number"],
                                    order_delivery_date: item["Delivery_Date"] || null,
                                    order_delivery_date_str: formattedDate,
                                    order_delivery_time: item["Delivery_Time"] || "",
                                    order_delivery_session: order_delivery_session || "",
                                    created_str: formattedNow,
                                    order_crane_lift_checker: item["Crane_Lift"] && item["Crane_Lift"].toLowerCase() === "yes"? true: false,
                                    order_loaders_info: item["Loaders_info"] || "",
                                    order_drivers_info: item["Drivers_Info"] || "",
                                    order_master_rack: item["Master_Rack"] || "",
                                    order_length: item["Order_Length"],
                                    order_overall_price: item["Order_Value"],
                                    order_city: item["City"],
                                    order_postal_code: item["Postal_Code"],
                                    order_delivery_address: item["Delivery_Address"],
                                    order_created_person: order_created_by
                            });
                            await orderData.save();
                    }
                });
                await Promise.all(bulkOperations);
            }
            fs.unlink(filePath, (err) => {
                if (err) {
                    // ignore
                }
            });
        });

        await Promise.all(promises);
        res.status(200).json({
            errorMessages,
            skippedOrders,
            sampleFormat,
            message: `Data Imported Successfully. ${skippedOrders.length > 0 ? "Below Order/s is skipped because of invalid Delivery Date or Time.":""}`
        });
    } catch (err) {
        logError('bulkImportExternalOrders', err, req.user.user_ref_id);
        handleMongooseError(err, res)
    }
};

exports.getExternalOrders = async (req, res) =>{
    try {
        let { page = 0, limit = 10, search_text } = req.query;
        page = parseInt(page);
        limit = parseInt(limit);
        const skip = page * limit;

        // Build filter object
        const matchCondition = {};

        let fromDateTime;
        let toDateTime;
        const today = new Date();
        const tomorrow = new Date(today);
        tomorrow.setDate(today.getDate() + 1);
        const year = tomorrow.getFullYear();
        const month = String(tomorrow.getMonth() + 1).padStart(2, '0');
        const day = String(tomorrow.getDate()).padStart(2, '0');
        const tomorrowDate = `${year}-${month}-${day}`;
        // if (search_text) {
            matchCondition.$or = [
                { order_number: { $regex: search_text, $options: 'i' } },
                { order_customer_name: { $regex: search_text, $options: 'i' } },
                { order_length: { $regex: search_text, $options: 'i' } },
                { order_overall_price: { $regex: search_text, $options: 'i' } }
            ];
        // } else {
            if (req.query.fromTime && req.query.toTime) {
                const fromDateTime = new Date(req.query.fromTime);
                const toDateTime = new Date(req.query.toTime);
                matchCondition.order_delivery_date = { $gte: fromDateTime, $lte: toDateTime };
            } else {
                fromDateTime = new Date(tomorrowDate);
                toDateTime = new Date(tomorrowDate);
                matchCondition.order_delivery_date = { $gte: fromDateTime, $lte: toDateTime };
            }
        // }

        const orders = await ExternalOrders.aggregate()
        .match(matchCondition)
        .skip(skip)
        .limit(limit)
        .sort({ order_docket: 1, created: -1 });

        // Collect all docket keys from all orders
        const allKeys = orders.flatMap(order => order.order_docket || []);
        // Get signed URLs for all unique keys
        const uniqueKeys = [...new Set(allKeys)];
        const signedUrlsMap = {};
        await Promise.all(uniqueKeys.map(async (key) => {
            const command = new GetObjectCommand({
                Bucket: 'encore-sheet',
                Key: key
            });
            const url = await getSignedUrl(s3Client, command, { expiresIn: 3600 });
            signedUrlsMap[key] = url;
        }));

        // Attach docket URLs to each order
        const ordersWithDockets = orders.map(order => {
            if (Array.isArray(order.order_docket)) {
                order.order_docket = order.order_docket.map(key => ({
                    key,
                    url: signedUrlsMap[key] || null
                }));
            }
            return order;
        });

        const totalOrders = await ExternalOrders.countDocuments(matchCondition);

        res.status(200).json({
            status: true,
            message: 'External Orders list fetched successfully',
            data: ordersWithDockets,
            total: totalOrders,
            page: parseInt(page),
            limit: parseInt(limit),
        });
    } catch (error) {
        handleMongooseError(error, res);
        logError('getExternalOrders', error, req.user.user_ref_id);
    }
}

exports.uploadDocketsForExtOrders = async (req, res) =>{
    try{
        const orderMasID = new mongoose.Types.ObjectId(req.params.id);
        let orderImages = [];
        if (req.files && req.files.length > 0) {
            orderImages = await Promise.all(req.files.map(async (file) => {
                const command = new GetObjectCommand({
                    Bucket: 'encore-sheet',
                    Key: file.key
                });
                const url = await getSignedUrl(s3Client, command, { expiresIn: 3600 }); // URL expires in 1 hour
                return { key: file.key, url };
            }));
        }

        let updateData;
        updateData = { $addToSet: { order_docket: { $each: orderImages.map(img => img.key) } } };
        const conditions = { _id: orderMasID };
        const updatedOrderInfo = await ExternalOrders.findByIdAndUpdate(conditions, updateData, { new: true });
        res.status(200).send(updatedOrderInfo);
    }catch(err){
        logError('uploadDocketsForExtOrders', err, req.user.user_ref_id);
        handleMongooseError(err, res)
    }
}

exports.deleteDocketsForExtOrders = async (req, res) => {
    try {
        const orderMasID = new mongoose.Types.ObjectId(req.params.id);
        const imageIndex = parseInt(req.params.index); // Parse the index as an integer
        let orderImagesField = "order_docket";

        // Fetch order info and validate
        const orderInfo = await ExternalOrders.findById(orderMasID);
        if (!orderInfo) {
            return res.status(500).send('Order not found');
        }

        // Fetch the image key to delete
        const orderImages = orderInfo[orderImagesField];
        if (imageIndex >= orderImages.length || imageIndex < 0) {
            return res.status(500).send('Invalid image index');
        }
        const imageNameToDelete = orderImages[imageIndex];

        // Delete image from S3
        const deleteParams = {
            Bucket: 'encore-sheet', // Your S3 bucket name
            Key: imageNameToDelete
        };
        await s3Client.send(new DeleteObjectCommand(deleteParams));

        // Remove the deleted image key from the order_images array
        orderImages.splice(imageIndex, 1);

        // Update the orderInfo document with the modified order_images array
        orderInfo[orderImagesField] = orderImages;
        await orderInfo.save();

        res.status(200).send('Image deleted successfully');
    } catch (err) {
        //console.error(err);
        logError('deleteDocketsForExtOrders', err, req.user.user_ref_id);
        handleMongooseError(err, res)
    }
};

exports.fetchSpecificExtOrder = async ( req, res ) =>{
    const order_id = new mongoose.Types.ObjectId(req.params.id);
    try{
        const result = await ExternalOrders.findById(order_id)

        if(!result){
            return res.status(404).send('Order not found');
        }

        const resultObj = result.toObject();
        resultObj.source = "ExternalOrders";

        res.status(200).send(resultObj);
    }catch(err){
        logError('fetchSpecificExtOrder', err, req.user.user_ref_id);
        handleMongooseError(err, res)
    }
}

exports.deleteExtOrder = async ( req, res ) =>{
    const order_id = new mongoose.Types.ObjectId(req.params.id);
    try{
        const result = await ExternalOrders.findByIdAndDelete(order_id)

        if(!result){
            return res.status(404).send('Order not found');
        }

        res.status(200).send("Order deleted successfully.");
    }catch(err){
        logError('deleteExtOrder', err, req.user.user_ref_id);
        handleMongooseError(err, res)
    }
}