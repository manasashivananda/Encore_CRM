const puppeteer = require("puppeteer");
const OrderItem = require('../models/orderitemModel');
const OrderItemManual = require('../models/orderitemmanualModel');
const RackMaster = require('../models/rackingModel');
const OrderMaster = require('../models/ordermasterModel');
const SplitOrders = require("../models/splitOrdersModel");
const { PDFDocument : PDFLibDocument, StandardFonts, rgb  } = require('pdf-lib');
const fs = require('fs');
const path = require('path');
const sharp = require('sharp')
const { GetObjectCommand, S3Client } = require("@aws-sdk/client-s3");
const fsPromises = require("fs/promises");
const { docketHTMLContent, docketHeader } = require("../templates/docket");
const { logError} = require("../logger");
const Users = require('../models/userModel');
const Roles = require('../models/roleModel');
const Modules = require('../models/modulesModel');
const RolesPermission = require('../models/rolepermissionModel');

const AWF_CUST_ID = process.env.AWF_CUSTOMER_ID

const s3Client = new S3Client({
  region: process.env.AWS_REGION,
  credentials: {
    accessKeyId: process.env.AWS_ACCESS_KEY_ID,
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
  },
});

let browserInstance = null;
const pagePool = [];
const MAX_POOL_SIZE = 6;


let browserPool = null;
let activeTasks = 0;
let isClosing = false;  // ✅ Add flag
const MAX_IDLE_TIME = 4 * 60 * 1000; // 4 minutes
let idleTimeout = null;
let consecutiveBlankPdfs = 0;  // ✅ Track blank PDFs

async function initBrowserPool() {
  if (!browserPool) {
    browserPool = await puppeteer.launch({
      headless: true,
      args: [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-dev-shm-usage',
        '--disable-gpu'
      ]
    });
  }
  return browserPool;
}

// ✅ Function to force restart browser pool
async function forceRestartBrowser(reason = 'Unknown') {
  console.log(`[BROWSER] Force restarting browser pool. Reason: ${reason}`);
  isClosing = true;
  
  try {
    if (browserPool) {
      await browserPool.close();
      console.log('[BROWSER] Browser closed successfully');
    }
  } catch (error) {
    console.error('[BROWSER] Error closing browser:', error);
  } finally {
    browserPool = null;
    isClosing = false;
    consecutiveBlankPdfs = 0;  // Reset counter
    console.log('[BROWSER] Browser pool reset complete');
  }
}

function isPdfBlank(validTableImages, allTableBlocks, docketDataWithMetadata, allDocketBlocks) {
  // Check 1: All table generations failed
  if (allTableBlocks.length > 0 && validTableImages.length === 0) {
    console.error('[BLANK-PDF] All table image generations failed');
    return true;
  }
  
  // Check 2: Some tables failed
  if (validTableImages.length < allTableBlocks.length) {
    console.warn(`[BLANK-PDF] Only ${validTableImages.length}/${allTableBlocks.length} tables generated`);
  }
  
  // Check 3: All dockets failed (if dockets expected)
  if (allDocketBlocks.length > 0) {
    const totalDocketPages = docketDataWithMetadata.reduce((sum, d) => sum + (d.pages?.length || 0), 0);
    if (totalDocketPages === 0) {
      console.error('[BLANK-PDF] All docket generations failed');
      return true;
    }
  }
  
  // Check 4: No content at all
  if (validTableImages.length === 0 && docketDataWithMetadata.length === 0) {
    console.error('[BLANK-PDF] No content generated at all');
    return true;
  }
  
  return false;
}

async function closeBrowserIfIdle() {
  if (activeTasks === 0 && browserPool && !isClosing) {
    console.log('Closing idle browser...');
    isClosing = true;  // ✅ Set flag before closing
    try {
      await browserPool.close();
    } catch (err) {
      console.error('Error closing browser:', err);
    }
    browserPool = null;
    isClosing = false;
  }
}

function resetIdleTimer() {
  if (idleTimeout) clearTimeout(idleTimeout);
  idleTimeout = setTimeout(closeBrowserIfIdle, MAX_IDLE_TIME);
}

// Modify your getPage function
async function getPage() {
  activeTasks++;
  resetIdleTimer();
  
  // ✅ Wait if browser is closing
  while (isClosing) {
    console.warn('Browser is closing, waiting...');
    await new Promise(resolve => setTimeout(resolve, 100));
  }
  
  const browser = await initBrowserPool();
  const page = await browser.newPage();
  return page;
}

// Modify your releasePage function
async function releasePage(page) {
  try {
    if (page && !page.isClosed()) {
      await page.close();
    }
  } catch (error) {
    console.error('Error closing page:', error);
  } finally {
    activeTasks--;
    if (activeTasks === 0) {
      resetIdleTimer();
    }
  }
}

async function closeBrowser() {
  if (browserInstance && browserInstance.isConnected()) {
    await browserInstance.close();
    browserInstance = null;
    pagePool.length = 0; // Clear the page pool
  }
}


function isImageFile(fileKey) {
  const ext = path.extname(fileKey).toLowerCase();
  return [".jpg", ".jpeg", ".png", ".gif", ".bmp", ".webp"].includes(ext);
}

// Helper to convert image to PDF
// async function convertImageToPDF(imagePath, pdfPath) {
//   const imageBytes = await fsPromises.readFile(imagePath);
//   const pdfDoc = await PDFLibDocument.create();
//   let image;
//   if (imagePath.endsWith(".png")) {
//     image = await pdfDoc.embedPng(imageBytes);
//   } else {
//     image = await pdfDoc.embedJpg(imageBytes);
//   }
//   const page = pdfDoc.addPage([image.width, image.height]);
//   page.drawImage(image, { x: 0, y: 0, width: image.width, height: image.height });
//   const pdfBytes = await pdfDoc.save();
//   await fsPromises.writeFile(pdfPath, pdfBytes);
// }

async function convertImageToPDF(imagePath, pdfPath) {
  try{
    const pdfDoc = await PDFLibDocument.create();
    const imageBytes = fs.readFileSync(imagePath);

    // Try to embed JPG or PNG
    let image;
    try {
        image = await pdfDoc.embedJpg(imageBytes);
    } catch {
        image = await pdfDoc.embedPng(imageBytes);
    }

    // A4 size in points (1 point = 1/72 inch)
    const pageWidth = 595.28;
    const pageHeight = 841.89;
    const margin = 40;

    // Original image size
    const imgWidth = image.width;
    const imgHeight = image.height;

    // Scale to fit A4
    const scale = Math.min(
        (pageWidth - margin * 2) / imgWidth,
        (pageHeight - margin * 2) / imgHeight
    );

    const newWidth = imgWidth * scale;
    const newHeight = imgHeight * scale;

    const page = pdfDoc.addPage([pageWidth, pageHeight]);

    // Center the image on the page
    const x = (pageWidth - newWidth) / 2;
    const y = (pageHeight - newHeight) / 2;

    page.drawImage(image, {
        x,
        y,
        width: newWidth,
        height: newHeight,
    });

    const pdfBytes = await pdfDoc.save();
    fs.writeFileSync(pdfPath, pdfBytes);
  } catch (error) {
    logError("convertImageToPDF", error);
  }
}

const handleMongooseError = (error, res) => {
  if (error.code === 11000) {
    // Duplicate key error
    const field = Object.keys(error.keyValue)[0];
    const value = error.keyValue[field];
    return res.status(409).json({
      status: 'error',
      code: 'DUPLICATE_KEY',
      errors: [`The ${field} '${value}' already exists in our records.`]
    });
  } else if (error.name === 'ValidationError') {
    // Mongoose validation error
    const messages = Object.values(error.errors).map(err => err.message);
    return res.status(422).json({
      status: 'error',
      code: 'VALIDATION_ERROR',
      errors: messages
    });
  } else if (error.name === 'CastError') {
    // Invalid ID or type casting error
    return res.status(400).json({
      status: 'error',
      code: 'INVALID_FORMAT',
      errors: [`Invalid ${error.path}: ${error.value}`]
    });
  } else if (error.name === 'MongoServerError') {
    // Database connection or operation error
    return res.status(503).json({
      status: 'error',
      code: 'DATABASE_ERROR',
      message: error.message,
      errors: ['Database operation failed. Please try again later.']
    });
  } else if (error.name === 'ReferenceError') {
    // Reference errors
    return res.status(400).json({
      status: 'error',
      code: 'REFERENCE_ERROR',
      message: error.message,
      errors: ['Invalid reference in the request.']
    });
  } else if (error.name === 'TypeError') {
    // Type errors
    return res.status(400).json({
      status: 'error',
      code: 'TYPE_ERROR',
      message: error.message,
      errors: ['Invalid data type in the request.']
    });
    } else if (error.response) {
    // Third party API errors    
    // Function to recursively find error messages
    const findErrors = (obj) => {
      let errors = [];
      if (typeof obj === 'object' && obj !== null) {
      for (let key in obj) {
        if (key === 'error' || key === 'errors' || key === "exceptionMessage") {
        if (Array.isArray(obj[key])) {
          errors = errors.concat(obj[key]);
        } else if (typeof obj[key] === 'string') {
          errors.push(obj[key]);
        }
        } else if (typeof obj[key] === 'object') {
        errors = errors.concat(findErrors(obj[key]));
        }
      }
      }
      return errors;
    };

    const errorMessages = findErrors(error.response.data);

    return res.status(error.response.status || 500).json({
      status: 'error',
      code: 'MYOB_ERROR',
      message: error.response.data?.message || error.message,
      errors: errorMessages.length > 0 ? errorMessages : ['External API request failed']
    });
    } else if (error.request) {
    // Network errors
    return res.status(503).json({
      status: 'error',
      code: 'NETWORK_ERROR',
      message: error.message,
      errors: ['Network request failed. Please check your connection.']
    });
  }
  // Unexpected errors
  return res.status(500).json({
    status: 'error',
    code: 'INTERNAL_SERVER_ERROR',
    message: error.message,
    errors: ['An unexpected error occurred. Please try again later.']
  });
};

// async function getOrderItems(orderId) {
//     const deptOrder = ['GBIL', 'GBI', 'J', 'ROOF', 'FG', 'CL', 'F', 'DC'];
//     let groupedOrders = {};
//     let deptPiecesCount = {};  // To hold total pieces per department

//     // Get Order Items (Standard)
//     const orderItems = await OrderItem.find({ order_master_id: orderId }).sort({ order_row_index: 1 });
//     orderItems.forEach((item) => {
//         const deptCode = item.dept_code || "F";
//         if (!groupedOrders[deptCode]) groupedOrders[deptCode] = [];
//         groupedOrders[deptCode].push({
//             desc: `${item.order_item_code}: ${item.order_item_description}`,
//             pieces: item.order_item_pieces || 'N/A',
//             length: item.order_item_length || 'N/A',
//             uom: item.order_item_uom || 'LN MTR',
//             qty: item.order_item_quantity ? parseFloat(item.order_item_quantity).toFixed(2) : 'N/A'
//         });

//         // Calculate total pieces
//         const pieces = parseFloat(item.order_item_pieces) || 0;
//         deptPiecesCount[deptCode] = (deptPiecesCount[deptCode] || 0) + pieces;
//     });

//     // Get Order Items (Manual)
//     const orderItemsManual = await OrderItemManual.aggregate([
//         { $match: { order_master_me_id: orderId } },
//         { $lookup: { from: "departments", localField: "order_item_me_department", foreignField: "_id", as: "departmentsInfo" } },
//         { $unwind: { path: "$departmentsInfo", preserveNullAndEmptyArrays: true } },
//         { $sort: { order_row_index: 1 } }
//     ]);

//     orderItemsManual.forEach((item) => {
//         const deptCode = item.departmentsInfo?.department_code || "F";
//         if (!groupedOrders[deptCode]) groupedOrders[deptCode] = [];
//         groupedOrders[deptCode].push({
//             desc: `${item.order_item_me_code}: ${item.order_item_me_description}`,
//             pieces: item.order_item_me_uom_value || 'N/A',
//             length: item.order_item_me_length || 'N/A',
//             uom: item.order_item_me_uom || 'N/A',
//             qty: item.order_item_me_quantity ? parseFloat(item.order_item_me_quantity).toFixed(2) : 'N/A'
//         });

//         // Calculate total pieces
//         const pieces = parseFloat(item.order_item_me_uom_value) || 0;
//         deptPiecesCount[deptCode] = (deptPiecesCount[deptCode] || 0) + pieces;
//     });

//     const results = [];
//     deptOrder.forEach((dept) => {
//         if (groupedOrders[dept]) {
//             results.push({
//                 deptDisplayName: dept,
//                 deptCode: dept,
//                 totalPieces: deptPiecesCount[dept] || 0,
//                 items: groupedOrders[dept]
//             });
//         }
//     });
//     return results;
// }

async function getOrderItems(orderId) {
  const deptOrder = ['GBIL', 'GBI', 'J', 'ROOF', 'FG', 'CL', 'F', 'DC'];
  let groupedOrders = {};
  let deptPiecesCount = {};

  // -------------------------------
  // STANDARD ORDER ITEMS (PROJECTED)
  // -------------------------------
  const orderItems = await OrderItem.find(
    { order_master_id: orderId },
    {
      dept_code: 1,
      order_item_code: 1,
      order_item_description: 1,
      order_item_pieces: 1,
      order_item_length: 1,
      order_item_uom: 1,
      order_item_quantity: 1,
      order_row_index: 1
    }
  ).sort({ order_row_index: 1 }).lean();

  orderItems.forEach((item) => {
    const deptCode = item.dept_code || "F";
    if (!groupedOrders[deptCode]) groupedOrders[deptCode] = [];

    groupedOrders[deptCode].push({
      desc: `${item.order_item_code}: ${item.order_item_description}`,
      pieces: item.order_item_pieces || 'N/A',
      length: item.order_item_length || 'N/A',
      uom: item.order_item_uom || 'LN MTR',
      qty: item.order_item_quantity
        ? parseFloat(item.order_item_quantity).toFixed(2)
        : 'N/A'
    });

    const pieces = parseFloat(item.order_item_pieces) || 0;
    deptPiecesCount[deptCode] = (deptPiecesCount[deptCode] || 0) + pieces;
  });

  // --------------------------------
  // MANUAL ORDER ITEMS (PROJECTED)
  // --------------------------------
  const orderItemsManual = await OrderItemManual.aggregate([
    { $match: { order_master_me_id: orderId } },

    {
      $lookup: {
        from: "departments",
        let: { deptId: "$order_item_me_department" },
        pipeline: [
          { $match: { $expr: { $eq: ["$_id", "$$deptId"] } } },
          { $project: { _id: 0, department_code: 1 } }
        ],
        as: "departmentsInfo"
      }
    },

    { $unwind: { path: "$departmentsInfo", preserveNullAndEmptyArrays: true } },

    {
      $project: {
        order_item_me_code: 1,
        order_item_me_description: 1,
        order_item_me_uom_value: 1,
        order_item_me_length: 1,
        order_item_me_uom: 1,
        order_item_me_quantity: 1,
        order_row_index: 1,
        "departmentsInfo.department_code": 1
      }
    },

    { $sort: { order_row_index: 1 } }
  ]);

  orderItemsManual.forEach((item) => {
    const deptCode = item.departmentsInfo?.department_code || "F";
    if (!groupedOrders[deptCode]) groupedOrders[deptCode] = [];

    groupedOrders[deptCode].push({
      desc: `${item.order_item_me_code}: ${item.order_item_me_description}`,
      pieces: item.order_item_me_uom_value || 'N/A',
      length: item.order_item_me_length || 'N/A',
      uom: item.order_item_me_uom || 'N/A',
      qty: item.order_item_me_quantity
        ? parseFloat(item.order_item_me_quantity).toFixed(2)
        : 'N/A'
    });

    const pieces = parseFloat(item.order_item_me_uom_value) || 0;
    deptPiecesCount[deptCode] = (deptPiecesCount[deptCode] || 0) + pieces;
  });

  // -------------------------------
  // FINAL RESULT (UNCHANGED LOGIC)
  // -------------------------------
  const results = [];
  deptOrder.forEach((dept) => {
    if (groupedOrders[dept]) {
      results.push({
        deptDisplayName: dept,
        deptCode: dept,
        totalPieces: deptPiecesCount[dept] || 0,
        items: groupedOrders[dept]
      });
    }
  });

  return results;
}


async function generateDocketPDFDocketwise(orderNumber, type) {
    const PDFMerger = (await import("pdf-merger-js")).default;
    let matchCondition = {};
    const orderNum = type === "split" ? excludeAlphabetsAfterLastDigit(orderNumber) : orderNumber;
    const tempFilesToCleanup = [];
    
    // Restrict Cancelled Orders
    if (type !== "split") {
        matchCondition.order_status = { $ne: "Order Cancelled" };
    }
    
    // const aggregationPipeline = [
    //     { $match: matchCondition },
    //     {
    //         $match: {
    //             $or: [
    //                 { order_unique_id: orderNum },
    //                 {
    //                     $expr: {
    //                         $and: [
    //                             { $eq: ["$order_customer_UID", AWF_CUST_ID] },
    //                             { $eq: [{ $substrBytes: ["$order_customer_PO_number", 0, 6] }, orderNum] }
    //                         ]
    //                     }
    //                 }
    //             ]
    //         }
    //     },
    //     {
    //         $lookup: {
    //             from: "accountcontacts",
    //             as: "accountcontactsInfo",
    //             localField: "order_customer_contact_id",
    //             foreignField: "_id"
    //         }
    //     },
    //     { $unwind: { path: "$accountcontactsInfo", preserveNullAndEmptyArrays: true } },
    //     {
    //         $project: {
    //             _id: 1,
    //             order_unique_id: {
    //                 $cond: [
    //                     { $eq: ["$order_customer_UID", AWF_CUST_ID] },
    //                     { $substr: ["$order_customer_PO_number", 0, 6] },
    //                     "$order_unique_id"
    //                 ]
    //             },
    //             order_customer_name: 1,
    //             order_customer_UID: 1,
    //             order_customer_PO_number: {
    //                 $cond: [
    //                     { $eq: ["$order_customer_UID", AWF_CUST_ID] },
    //                     {
    //                         $let: {
    //                             vars: {
    //                                 restLen: {
    //                                     $max: [
    //                                         { $subtract: [{ $strLenBytes: "$order_customer_PO_number" }, 6] },
    //                                         0
    //                                     ]
    //                                 }
    //                             },
    //                             in: {
    //                                 $concat: [
    //                                     { $toString: "$order_unique_id" },
    //                                     {
    //                                         $cond: [
    //                                             { $gt: ["$$restLen", 0] },
    //                                             { $substrBytes: ["$order_customer_PO_number", 6, "$$restLen"] },
    //                                             ""
    //                                         ]
    //                                     }
    //                                 ]
    //                             }
    //                         }
    //                     },
    //                     "$order_customer_PO_number"
    //                 ]
    //             },
    //             order_customer_contact_name: 1,
    //             order_customer_contact_phone: 1,
    //             order_delivery_date_str: 1,
    //             order_delivery_time: 1,
    //             order_delivery_session: 1,
    //             created_str: 1,
    //             order_delivery_address_mode: 1,
    //             order_store_delivery_address1: 1,
    //             order_store_delivery_city: 1,
    //             order_store_delivery_country: 1,
    //             order_store_delivery_postalcode: 1,
    //             order_store_delivery_state: 1,
    //             order_site_delivery_attention_contact: 1,
    //             order_site_delivery_attention_person: 1,
    //             order_site_delivery_address1: 1,
    //             order_site_delivery_city: 1,
    //             order_site_delivery_country: 1,
    //             order_site_delivery_postalcode: 1,
    //             order_site_delivery_state: 1,
    //             order_loaders_info: 1,
    //             order_custom_note: 1,
    //             order_crane_lift_checker: 1,
    //             f_order_racking_table: 1,
    //             fg_order_racking_table: 1,
    //             cl_order_racking_table: 1,
    //             j_order_racking_table: 1,
    //             roof_order_racking_table: 1,
    //             gbi_order_racking_table: 1,
    //             docket: 1,
    //             order_site_delivery_mud_map: 1,
    //             account_Contact_FName: "$accountcontactsInfo.account_Contact_FName"
    //         }
    //     },
    // ];

    const aggregationPipeline = [
      { $match: matchCondition },

      {
        $match: {
          $or: [
            { order_unique_id: orderNum },
            {
              $expr: {
                $and: [
                  { $eq: ["$order_customer_UID", AWF_CUST_ID] },
                  { $eq: [{ $substrBytes: ["$order_customer_PO_number", 0, 6] }, orderNum] }
                ]
              }
            }
          ]
        }
      },

      // ---- ACCOUNT CONTACT (PROJECTED) ----
      {
        $lookup: {
          from: "accountcontacts",
          let: { id: "$order_customer_contact_id" },
          pipeline: [
            { $match: { $expr: { $eq: ["$_id", "$$id"] } } },
            {
              $project: {
                _id: 0,
                account_Contact_FName: 1
              }
            }
          ],
          as: "accountcontactsInfo"
        }
      },

      { $unwind: { path: "$accountcontactsInfo", preserveNullAndEmptyArrays: true } },

      // ---- EARLY & STRICT PROJECTION ----
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

          order_customer_name: 1,
          order_customer_UID: 1,

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

          order_customer_contact_name: 1,
          order_customer_contact_phone: 1,

          order_delivery_date_str: 1,
          order_delivery_time: 1,
          order_delivery_session: 1,
          created_str: 1,

          order_delivery_address_mode: 1,

          order_store_delivery_address1: 1,
          order_store_delivery_city: 1,
          order_store_delivery_state: 1,
          order_store_delivery_postalcode: 1,
          order_store_delivery_country: 1,

          order_site_delivery_attention_contact: 1,
          order_site_delivery_attention_person: 1,
          order_site_delivery_address1: 1,
          order_site_delivery_city: 1,
          order_site_delivery_state: 1,
          order_site_delivery_postalcode: 1,
          order_site_delivery_country: 1,

          order_loaders_info: 1,
          order_custom_note: 1,
          order_crane_lift_checker: 1,

          f_order_racking_table: 1,
          fg_order_racking_table: 1,
          cl_order_racking_table: 1,
          j_order_racking_table: 1,
          roof_order_racking_table: 1,
          gbi_order_racking_table: 1,

          docket: 1,
          order_site_delivery_mud_map: 1,

          account_Contact_FName: "$accountcontactsInfo.account_Contact_FName"
        }
      }
    ];

    const Orders = await OrderMaster.aggregate(aggregationPipeline);
    let splitOrder;

    if (type === "split") {
        splitOrder = await SplitOrders.findOne({ order_unique_id: orderNumber });
    }

    if (!Orders.length) return "No Orders Found!";
    
    const merger = new PDFMerger();
    const deptNames = {
        'CL': 'CLADDING',
        'J': 'JOBBING',
        'FG': 'FASCIA GUTTER',
        'DC': 'DELIVERY CHARGES',
        'ROOF': 'ROOFING',
        'F': 'FLASHING',
        'GBI': 'GBI',
        'GBIL': 'GBI.L'
    };

    const deptRackingFieldMap = {
        F: 'f_order_racking_table',
        FG: 'fg_order_racking_table',
        CL: 'cl_order_racking_table',
        J: 'j_order_racking_table',
        ROOF: 'roof_order_racking_table',
        GBI: 'gbi_order_racking_table'
    };

    const getDeptName = (key) => deptNames[key?.toUpperCase()] || key;
    
    // Helper function to create order PDF
    const createOrderPdf = async (order) => {
        let serialNumber = 1;
        const items = await getOrderItems(order._id);

        const rackNames = {};

        for (const group of items) {
            const deptCode = group.deptDisplayName;
            if (deptCode === 'DC') continue;
            const rackingFieldName = deptRackingFieldMap[deptCode];
            const rackingId = order[rackingFieldName];

            if (rackingId) {
                // const rack = await RackMaster.findById(rackingId).select('rack_name');
                const rack = await RackMaster.findById(rackingId, { rack_name: 1 }).lean();
                rackNames[deptCode] = rack ? rack.rack_name : '';
            } else {
                rackNames[deptCode] = '';
            }
        }

        const deptSummaryTable = `
            <table cellpadding="2" cellspacing="0" width="100%" style="width:100%; margin-bottom:8px; text-align:left; table-layout: fixed">
                <thead style="background-color:#000;color:#fff;font-size:10px;">
                    <tr>
                        ${items
                            .filter(group => group.deptDisplayName !== 'DC')
                            .map(group => `
                            <th style="padding:2px 4px; width: 50px;">${group.deptDisplayName}</th>
                        `).join('')}
                    </tr>
                </thead>
                <tbody style="color:#000;font-size:11px;">
                    <tr style="font-size:11px;">
                        ${items
                            .filter(group => group.deptDisplayName !== 'DC')
                            .map(group => {
                                const deptCode = group.deptDisplayName;
                                const rackName = rackNames[deptCode];
                                const totalPieces = group.totalPieces;
                                const countDisplay = rackName
                                    ? `(${rackName}) ${totalPieces} `
                                    : `${totalPieces}`;
                                return `<td style="padding:4px;">${countDisplay}</td>`;
                            }).join('')}
                    </tr>
                </tbody>
            </table>
        `;

        const orderHtmlContent = `
        <html>
        <head>
        <style>
        @page {
            margin-right: 50px;margin-left:50px;
        }
        html {-webkit-print-color-adjust: exact;} 
        body { font-family: Arial; font-size: 11px; }
        </style>
        </head>
        <body style="margin:0;padding:0;min-width:100%;">   
        ${deptSummaryTable}
        <table cellpadding="2" cellspacing="0" width="100%" style="width:100%;" >
        <thead style="background-color:#000;color:#fff;font-size:10px;">
            <tr>
                <th style="font-family: Arial, Helvetica, sans-serif;" align="left">NO</th>
                <th style="font-family: Arial, Helvetica, sans-serif;" align="left">ITEM</th>
                <th style="font-family: Arial, Helvetica, sans-serif;" align="left">PIECES</th>
                <th style="font-family: Arial, Helvetica, sans-serif;" align="left">LENGTH</th>
                <th style="font-family: Arial, Helvetica, sans-serif;" align="left">UOM</th>
                <th style="font-family: Arial, Helvetica, sans-serif;" align="left">QTY</th>
            </tr>
        </thead>
        <tbody style="color:#000;font-size:11px;">
        ${items.map((group) => `
            <tr><td colspan="6" style="font-family: Arial, Helvetica, sans-serif; text-align:center;font-size:14px;border-top:1px solid #333;"><strong>${getDeptName(group.deptDisplayName)}</strong></td></tr>
            ${group.items.map(item => `
                <tr style="font-size:11px;">
                    <td style="font-family: Arial, Helvetica, sans-serif;">${serialNumber++}</td>
                    <td style="font-family: Arial, Helvetica, sans-serif;">${item.desc}</td>
                    <td style="font-family: Arial, Helvetica, sans-serif;">${item.pieces}</td>
                    <td style="font-family: Arial, Helvetica, sans-serif;">${item.length}</td>
                    <td style="font-family: Arial, Helvetica, sans-serif;">${item.uom}</td>
                    <td style="font-family: Arial, Helvetica, sans-serif;">${item.qty}</td>   
                </tr>
            `).join("")}
        `).join("")}
        </tbody></table></body></html>`;

        const page = await getPage();
        
        try {
            await page.setContent(orderHtmlContent, { waitUntil: 'networkidle0', /*timeout: 90000*/ });

            const logoPath = path.join(__dirname, "../images/docket-logo.png");
            const logoBase64 = fs.readFileSync(logoPath, { encoding: "base64" });
            const logoDataUri = `data:image/png;base64,${logoBase64}`;

            const tempFilePath = path.join(__dirname, "../dockets", `order_${orderNumber}_${Date.now()}.pdf`);

            await page.pdf({
                path: tempFilePath,
                format: 'A4',
                printBackground: true,
                displayHeaderFooter: true,
                // timeout: 90000,
                headerTemplate: `
                <div style="display: flex; flex-direction: column; margin:25px 50px 50px 50px; width: calc(100% - 100px);">
                  <div style="display: flex; width: 100%; margin-bottom: 25px;">
                      <div style="width: 50%;display:flex;align-items:start;">   
                              <div><img src="${logoDataUri}" alt="ENCORE" style="max-width:100px; margin-right: 10px"></div>
                              <p style="font-family: Arial, Helvetica, sans-serif; font-size:12px;">ENCORE SHEETMETAL<br>67 QUANTUM CLOSE<br>DANDENONG SOUTH, VIC, 3175<br>Phone: 03 9999 7800<br>Web: encoresheetmetal.com.au<br>ABN: 47631765163</p>
                      </div>
                      <div style="width: 50%; display:flex;justify-content: flex-end">
                          <div style="width:230px;display:block;">
                              <h2 style="font-family: Arial, Helvetica, sans-serif; font-size:24px; margin: 0 0 5px 0;text-align:right;width:100%;">Delivery Docket</h2>
                              <table cellpadding="1" cellspacing="0" width="100%" style="font-family: Arial, Helvetica, sans-serif; font-size:12px; width: 100%;">
                                  <tr>
                                      <td align="left" ><strong style="font-family: Arial, Helvetica, sans-serif;">Order No.:</strong></td>
                                      <td align="right" width="50%"><strong style="font-size:13px; font-family: Arial, Helvetica, sans-serif;">${orderNumber}</strong></td>
                                  </tr>
                                  <tr>
                                      <td align="left"><strong style="font-family: Arial, Helvetica, sans-serif;">Order Date:</strong></td>
                                      <td align="right" style="font-family: Arial, Helvetica, sans-serif;">
                                          ${order.created_str.split(' ')[0]?.replace(/-/g, '/')}
                                      </td>
                                  </tr>
                                  <tr>
                                      <td><strong style="font-family: Arial, Helvetica, sans-serif;">Delivery Date:</strong></td>
                                      <td align="right" style="font-family: Arial, Helvetica, sans-serif;">
                                          ${order.order_delivery_date_str.split(' ')[0]?.replace(/-/g, '/')}
                                      </td>
                                  </tr>
                                  <tr><td><strong style="font-family: Arial, Helvetica, sans-serif;">Customer PO:</strong></td>
                                      <td align="right" style="font-family: Arial, Helvetica, sans-serif;">${order.order_customer_PO_number}</td></tr>
                                  <tr>
                                      <td><strong style="font-family: Arial, Helvetica, sans-serif;">Time Required:</strong></td>
                                      <td align="right" style="font-family: Arial, Helvetica, sans-serif;">
                                          ${(() => {
                                              let time = order.order_delivery_time;
                                              let session = order.order_delivery_session;
                                              if (time === '12.00 AM') {
                                                  return session;
                                              }
                                              time = time?.replace(/^0/, '');
                                              time = time?.replace(/\.00/, '');
                                              time = time?.replace(/\s?(AM|PM)/, '$1');
                                              return `${session}&nbsp;${time}`;
                                          })()}
                                      </td>
                                  </tr>
                                  <tr>
                                      <td><strong style="font-family: Arial, Helvetica, sans-serif;">Ship Via:</strong></td>
                                      <td align="right" style="font-family: Arial, Helvetica, sans-serif;">
                                          ${order.order_delivery_address_mode === '0' ? 'Store' : 
                                          order.order_delivery_address_mode === '1' ? 'Site' : 
                                          order.order_delivery_address_mode === '2' ? 'Pick Up' : ''}
                                      </td>
                                  </tr>
                              </table>
                          </div>
                      </div>
                  </div>
                  <div style="width:100%;">                     
                      <table cellpadding="2" cellspacing="0" width="100%">
                      <thead style="background-color:#000;font-size:10px; -webkit-print-color-adjust: exact;font-family: Arial, Helvetica, sans-serif;">
                          <tr >
                              <th align="left" style="font-family: Arial, Helvetica, sans-serif; font-size:10px;color:#fff;width:50%;">SHIP TO:</th>
                              <th align="left" style="font-family: Arial, Helvetica, sans-serif; font-size:10px;color:#fff;width:50%;">INFO:</th>
                          </tr>
                          </thead>
                          <tbody>
                              ${order.order_delivery_address_mode === '0' ? `
                              <tr>
                                  <td style="font-family: Arial, Helvetica, sans-serif; font-size:12px; vertical-align: top" valign="top">
                                      ${order.order_customer_name}<br>
                                      -<br>
                                      ${order.order_store_delivery_address1}<br>
                                      ${order.order_store_delivery_city}&nbsp;${order.order_store_delivery_state}&nbsp;${order.order_store_delivery_postalcode}<br>
                                      ${order.order_store_delivery_country}<br>
                                      Ph: ${order.order_customer_contact_phone}
                                  </td>
                                  <td style="font-size:12px;">
                                      <strong style="font-family: Arial, Helvetica, sans-serif;">Driver's Info</strong><p style="font-family: Arial, Helvetica, sans-serif; margin-top:0;">${order.order_custom_note ? order.order_custom_note : '-'}</p>
                                      <strong style="font-family: Arial, Helvetica, sans-serif; display:block;margin:0;">Loader's Info</strong> <p style="font-family: Arial, Helvetica, sans-serif; margin-top:0;">${order.order_loaders_info ? order.order_loaders_info : '-'}</p>
                                      <strong style="font-family: Arial, Helvetica, sans-serif; display:block;margin:0;">${order.order_crane_lift_checker ? 'CRANE LIFT' : ''}</strong>
                                  </td>
                              </tr>
                              ` : ''}
                              
                              ${order.order_delivery_address_mode === '1' ? `
                              <tr>
                                  <td style="font-family: Arial, Helvetica, sans-serif; font-size:12px;">
                                      ${order.order_customer_name}<br>
                                      -<br>
                                      ${order.order_site_delivery_address1}<br>
                                      ${order.order_site_delivery_city}&nbsp;${order.order_site_delivery_state}&nbsp;${order.order_site_delivery_postalcode}<br>
                                      ${order.order_site_delivery_country}<br>
                                      Attn: ${order.order_site_delivery_attention_person}<br>
                                      Ph: ${order.order_site_delivery_attention_contact}
                                  </td>
                                  <td style="font-size:12px;">
                                      <strong style="font-family: Arial, Helvetica, sans-serif;">Driver's Info</strong><p style="font-family: Arial, Helvetica, sans-serif; margin-top:0;">${order.order_custom_note ? order.order_custom_note : '-'}</p>
                                      <strong style="font-family: Arial, Helvetica, sans-serif; display:block;margin:0;">Loader's Info</strong> <p style="font-family: Arial, Helvetica, sans-serif; margin-top:0;">${order.order_loaders_info ? order.order_loaders_info : '-'}</p>
                                      <strong style="font-family: Arial, Helvetica, sans-serif; display:block;margin:0;">${order.order_crane_lift_checker ? 'CRANE LIFT' : ''}</strong>
                                  </td>
                              </tr>
                              ` : ''}
                              
                              ${order.order_delivery_address_mode === '2' ? `
                              <tr>
                                  <td style="font-family: Arial, Helvetica, sans-serif; font-size:12px;">
                                      ${order.order_customer_name}<br>
                                      -<br>
                                      <strong>PickUp Order</strong>
                                      <br>
                                      <strong>Attn:</strong> ${order.order_site_delivery_attention_person}<br>
                                      <strong>Ph:</strong> ${order.order_site_delivery_attention_contact}
                                  </td>
                                  <td style="font-size:12px;">
                                      <strong style="font-family: Arial, Helvetica, sans-serif;">Driver's Info</strong><p style="font-family: Arial, Helvetica, sans-serif; margin-top:0;">${order.order_custom_note ? order.order_custom_note : '-'}</p>
                                      <strong style="font-family: Arial, Helvetica, sans-serif; display:block;margin:0;">Loader's Info</strong> <p style="font-family: Arial, Helvetica, sans-serif; margin-top:0;">${order.order_loaders_info ? order.order_loaders_info : '-'}</p>
                                      <strong style="font-family: Arial, Helvetica, sans-serif; display:block;margin:0;">${order.order_crane_lift_checker ? 'CRANE LIFT' : ''}</strong>
                                  </td>
                              </tr>
                              ` : ''}
                              
                          </tbody>
                      </table>             
                  </div>
              </div>
                  `,
                footerTemplate: `<div style="font-family: Arial, Helvetica, sans-serif; width:100%;font-size:11px;text-align:right;padding:0 50px;">
                                <h2 style="font-size:18px;text-align:center;">${splitOrder?.info ? splitOrder.info : ""}</h2>
                      Page <span class="pageNumber"></span> of <span class="totalPages"></span>
                  </div>`,
                margin: { top: "350px", bottom: "100px" }
            });

            const pdfBytes = fs.readFileSync(tempFilePath);
            const pdfDoc = await PDFLibDocument.load(pdfBytes);
            const totalPages = pdfDoc.getPageCount();

            for (let i = 0; i < totalPages; i++) {
                const pdfPage = pdfDoc.getPage(i);
                const { width } = pdfPage.getSize();
            
                if (i === totalPages - 1) {
                } else {
                    pdfPage.drawText(`Continued...`, {
                        x: width / 2 - 30,
                        y: 30,
                        size: 9
                    });
                }
            }
            
            const updatedPdfBytes = await pdfDoc.save();
            fs.writeFileSync(tempFilePath, updatedPdfBytes);
            tempFilesToCleanup.push(tempFilePath);
            
            return tempFilePath;
            
        } finally {
            await releasePage(page);
        }
    };
    
    // Process each order
    for (const order of Orders) {
        // If docket files exist on S3 for this order, download & append them in order
        if (Array.isArray(order.docket) && order.order_delivery_address_mode === "1" && order.docket.length > 0) {
            for (const fileKey of order.docket) {
                const downloadedPath = path.join(__dirname, "../dockets", `${Date.now()}_${path.basename(fileKey)}`);
                const command = new GetObjectCommand({
                    Bucket: "encore-sheet",
                    Key: fileKey,
                });
                
                try {
                    const s3StreamData = await s3Client.send(command);
                    await new Promise((resolve, reject) => {
                        const writeStream = fs.createWriteStream(downloadedPath);
                        s3StreamData.Body.pipe(writeStream);
                        s3StreamData.Body.on("error", reject);
                        writeStream.on("finish", resolve);
                    });

                    // ensure we clean this temp file later
                    tempFilesToCleanup.push(downloadedPath);

                    // Check header using buffer read (safer for binary)
                    let header = "";
                    try {
                        const fd = fs.openSync(downloadedPath, 'r');
                        const buf = Buffer.alloc(4);
                        fs.readSync(fd, buf, 0, 4, 0);
                        fs.closeSync(fd);
                        header = buf.toString('utf8');
                    } catch (e) {
                        header = "";
                    }

                    if (isImageFile(fileKey)) {
                        // convert image to pdf then add
                        const tempPdfPath = downloadedPath.replace(path.extname(downloadedPath), ".pdf");
                        await convertImageToPDF(downloadedPath, tempPdfPath);
                        tempFilesToCleanup.push(tempPdfPath);

                        // validate pdf header
                        let pdfHeader = "";
                        try {
                            const fd = fs.openSync(tempPdfPath, 'r');
                            const buf = Buffer.alloc(4);
                            fs.readSync(fd, buf, 0, 4, 0);
                            fs.closeSync(fd);
                            pdfHeader = buf.toString('utf8');
                        } catch (e) {
                            pdfHeader = "";
                        }

                        if (pdfHeader === "%PDF") {
                            await merger.add(tempPdfPath);
                        }
                    } else {
                        // PDF file from S3
                        if (header === "%PDF") {
                            await merger.add(downloadedPath);
                        } else {
                            // If header not PDF, attempt to convert (fallback)
                            const tryPdfPath = downloadedPath.replace(path.extname(downloadedPath), ".pdf");
                            try {
                                await convertImageToPDF(downloadedPath, tryPdfPath);
                                tempFilesToCleanup.push(tryPdfPath);
                                const fd = fs.openSync(tryPdfPath, 'r');
                                const buf = Buffer.alloc(4);
                                fs.readSync(fd, buf, 0, 4, 0);
                                fs.closeSync(fd);
                                if (buf.toString('utf8') === "%PDF") {
                                    await merger.add(tryPdfPath);
                                }
                            } catch (e) {
                                // skip if conversion fails
                            }
                        }
                    }
                } catch (error) {
                    console.error(`Error processing docket file ${fileKey}:`, error);
                    // Continue with next file
                }
            }
        } else {
            // No docket on S3 -> generate PDF for this order and append
            const generatedPdf = await createOrderPdf(order);
            if (generatedPdf) {
                await merger.add(generatedPdf);
            }
        }

        // Attach mud map for site deliveries if file is there
        if (
            order.order_delivery_address_mode === "1" && 
            order.order_site_delivery_mud_map &&
            order.order_site_delivery_mud_map.trim() !== '' &&
            order.order_site_delivery_mud_map.trim() !== '-'
        ) {
            await processMudMap({ order, merger, orderNumber });
        }
    }

    // After processing all orders, save merged PDF and cleanup temp files
    const mergedFilePath = path.join(__dirname, "../dockets", `merged_${orderNumber}_${Date.now()}.pdf`);
    await merger.save(mergedFilePath);

    // Cleanup temporary files (keep mergedFilePath)
    for (const f of tempFilesToCleanup) {
        try { 
            fs.unlinkSync(f); 
        } catch (e) {
            // Ignore cleanup errors
        }
    }

    return mergedFilePath;
}

// Replace the renderTableAsImage function:

async function renderTableAsImage(headers, rows, options = {}) {
  const {
    name = "", runType = "", truckName = "", startTime = "",
    day = "", printDate = "", type = ""
  } = options;

  const rowCount = rows.length;

  
  let Time = startTime === "" ? "" : `START TIME - ${startTime}`;
  let Truck = truckName === "" ? `${runType} RUN` : `${name} ${runType} - ${truckName}`;

  // Calculate font sizes dynamically ONLY for table content
  const calculateFontSize = (baseSize, minSize) => {
    if (rowCount <= 15) return baseSize + 2;
    if (rowCount <= 20) return baseSize + 1;
    if (rowCount <= 25) return baseSize;
    if (rowCount <= 35) return Math.max(baseSize * 0.85, minSize);
    if (rowCount <= 45) return Math.max(baseSize * 0.75, minSize);
    if (rowCount <= 55) return Math.max(baseSize * 0.65, minSize);
    return Math.max(baseSize * 0.99, minSize);
  };

  const headerFontSize = 45;
  const tableFontSize = calculateFontSize(28, 10);
  const tableHeaderFontSize = calculateFontSize(23, 10);
  const footerFontSize = 75;

  const getCellPadding = () => '2px 3px';
  const cellPadding = getCellPadding();

  // Calculate column widths with better optimization
  const getColumnWidths = (headers, rows, fontSize = tableFontSize, type = "") => {
    const minWidths = {
      "CUSTOMER": type === "LOADING SHEET" ? 200 : 90,  // Reduced from 150/120
      "CITY": type === "LOADING SHEET" ? 180 : 140,      // Reduced from 150/140
      "PO NO": 140,
      "TIME": type === "LOADING SHEET" ? 150 : 130,
      "ORDER NO": 160,
      "PRODUCTS": type === "LOADING SHEET" ? 150: 160,
      "LENGTH": 100,
      "RACK": 190,
      // "LOADER'S INFO": 150,
      // "DRIVER'S INFO": 220
    };

    // Calculate actual content widths more precisely
    let widths = headers.map(header => {
      let maxCellLength = header.length;
      
      // For customer column, use actual trimmed length
      if (header.toUpperCase() === "CUSTOMER") {
        maxCellLength = Math.max(
          header.length,
          ...rows.map(row => {
             if (!row[header]) return 0;
            let cellValue = row[header].toString().trim().toLowerCase();
            // if (cellValue.endsWith("australia pty ltd")) {
            //   cellValue = cellValue.replace(/australia pty ltd$/i, "").trim();
            // }
            // cellValue = cellValue.split(/\s+/).slice(0, 2).join(" ");
            // Remove "Australia Pty Ltd" wherever it appears
            cellValue = cellValue.replace(/\s*australia pty ltd\s*/i, " ").trim();

            // Normalize spaces
            cellValue = cellValue.replace(/\s+/g, " ");
            cellValue = cellValue.split(/\s+/).slice(0, 3).join(" ");
            return cellValue.length;
          })
        );
      } else {
        maxCellLength = Math.max(
          header.length,
          ...rows.map(row => (row[header] ? row[header].toString().length : 0))
        );
      }
      
      let pxWidth = Math.max(60, Math.ceil(fontSize * maxCellLength * 0.55) + 16); // Reduced multiplier and padding

      const minWidth = minWidths[header.toUpperCase()] || 70;
      return Math.max(minWidth, pxWidth);
    });

    const totalWidth = widths.reduce((sum, w) => sum + w, 0);
    const maxPageWidth = type === "LOADING SHEET" ? 2000 : 1800

    if (totalWidth > maxPageWidth) {
      const scale = maxPageWidth / totalWidth;
      widths = widths.map((w, i) => {
        const minWidth = minWidths[headers[i].toUpperCase()] || 70;
        return Math.max(minWidth, Math.floor(w * scale));
      });
    }
    return widths;
  };

  const dynamicColWidths = getColumnWidths(headers, rows, tableFontSize, type);
  const colGroup = headers.map((item, i) =>
    `<col style="width: ${dynamicColWidths[i]}px;">`
  ).join("");

  const tableHtml = `
    <table>
      <colgroup>${colGroup}</colgroup>
      <thead>
        <tr>${headers.map(h => `<th>${h}</th>`).join("")}</tr>
      </thead>
      <tbody>
        ${rows.map(r => {
          return `
            <tr class="${getRowColor(r).classname}">
              ${headers.map(h => {
                let cellValue = r[h] ?? "";
                if (h === "CUSTOMER" && typeof cellValue === "string") {
                  let val = cellValue.trim().toLowerCase();
                  if (/australia pty ltd/i.test(val)) {
                    val = val.replace(/\s*australia pty ltd\s*/i, " ").trim();
                    val = val.replace(/\s+/g, " ");
                  } else {
                    val = val.split(/\s+/).slice(0, 3).join(" ");
                  }
                  cellValue = val.replace(/\b\w/g, l => l.toUpperCase());
                }
                return `<td class="${h === 'LENGTH' && r.large_length ? 'cell-color' : ''}">${cellValue}</td>`;
              }).join("")}
            </tr>
          `;
        }).join("")}
      </tbody>
    </table>
  `;

  const combinedHtml = `
    <html>
      <head>
        <style>
          * { box-sizing: border-box; }
          body {
            font-family: Arial, Helvetica, sans-serif;
            margin: 0;
            padding: 10px;
            background: white;
            display: flex;
            justify-content: center;
          }
          .wrapper {
            width: 1800px;
            display: flex;
            flex-direction: column;
          }
          .header {
            width:1800px;
            display: flex;
            justify-content: space-between;
            align-items: center;
            font-weight: bold;
            font-size: ${headerFontSize}px;
            margin-bottom: 15px;
           
          }
          /* Use fixed width for each part to keep alignment consistent */
          .header > div:first-child {
            text-align: left;
          }
          .header > div:last-child {
            text-align: right;
          }
          
          .header .sheet-type.loading-type {
            color: #000000ff;
            font-weight: 900;
            letter-spacing: 12px;
            font-size: 65px;
            text-transform: uppercase;
          }
            .header .sheet-type.run-type {
            color: #000000ff;
            font-family: Arial;
            font-size: 70px;
            letter-spacing: 15px;
            font-weight: 200;
          }
          .time {
            text-align : right
          }
          .priority-1{
            background-color: #a6cff7
          }

          .priority-2{
            background-color: #b9ffc0
          }

          .priority-3{
            background-color: #fcefe3
          }

          .priority-4{
            background-color: #b9ffc0
          }
          .content {
            width: 1800px;
            display: flex;
            flex-direction: ${rowCount <= 15 ? 'unset': 'column'};
          }
          .cell-color { background-color: #add8e6 !important; }
          table {
            width: 100%;
            border-collapse: collapse;
          }
          th, td, tr {
            border: 1px solid #000;
            padding: ${cellPadding};
            text-align: left;
            vertical-align: top;
            white-space: ${rowCount <= 15 ? 'wrap': 'nowrap'}; 
            overflow: hidden;
            text-overflow: ellipsis;
            font-size: ${tableFontSize}px;
            line-height: 1.2; /* Reduced line height */
          }
          th {
            background-color: #f0f0f0;
            font-weight: bold;
            font-size: ${tableHeaderFontSize}px;
          }
          /* Allow wrapping only for specific columns if absolutely necessary */
          td:nth-child(6), /* PRODUCTS column */
          td:nth-child(9), /* LOADER'S INFO column */
          td:nth-child(7), /* DRIVER'S INFO column */ 
          td:nth-child(8){
            white-space: normal;
            word-wrap: break-word;
            overflow-wrap: break-word;
          }
          tbody tr { page-break-inside: avoid; }
          @media print {
            body { margin: 0; padding: 0; -webkit-print-color-adjust: exact; }
            table, th, td, tr { border: 1px solid #000; }
          }
          .footer {
            text-align: center;
            font-weight: bold;
            font-size: ${footerFontSize}px;
            margin: 0;
          }
        </style>
      </head>
      <body>
        <div class="wrapper">
          <div class="header">
            <div>${day.toUpperCase()} ${printDate}</div>
              <div class="sheet-type ${type === "LOADING SHEET" ? "loading-type" : "run-type"}">${type}</div>
            <div class="time">${Time}</div>
          </div>
          <div class="content">
            ${tableHtml}
          </div>
          <div class="footer">${Truck}</div>
        </div>
      </body>
    </html>
  `;

  let page;
  try {
    page = await getPage();
    
    // Optimized viewport - smaller for less memory
    await page.setViewport({
      width: 1800,
      height: Math.min(2000, Math.max(800, 300 + (rows.length * 24))), // Cap height
      deviceScaleFactor: 1.5 // Reduced from 2 for less memory
    });
    
    await page.setContent(combinedHtml, { 
      waitUntil: "networkidle0", 
      timeout: 60000 // Reduced timeout
    });

    await page.evaluate(() => {
      return new Promise((resolve) => {
        // Wait for table to be rendered
        if (document.querySelector('table')) {
          // Give it a bit more time for layout
          setTimeout(resolve, 500);
        } else {
          resolve();
        }
      });
    });
    
    const buffer = await page.screenshot({ 
      fullPage: true, 
      type: "png", 
      timeout: 45000,
      optimizeForSpeed: true // Add if your version supports it
    });
    
    return buffer;
  } catch (error) {
    console.error('Screenshot error:', error);
    throw error;
  } finally {
    if (page) {
      await releasePage(page);
    }
  }
}


function getFormattedDeliveryTime(time, session, type = "other") {
  if (time?.trim() === "AT") {return type === "other" ? "A/T": "";}
  if (session === "A/T" && time?.trim() === "12.00 AM") {return type === "other" ? "A/T": "";}
  if (!time) {return session || "";}
  const [rawTime, meridian] = time.trim().split(" ");
  if (!rawTime || !meridian) {
    return session ? `${session} ${time}` : time;
  }
  let [hour, minute] = rawTime.split(".");
  hour = String(parseInt(hour, 10));
  const timeStr = minute === "00" ? `${hour}${meridian.toUpperCase()}` : `${hour}.${minute}${meridian.toUpperCase()}`;
  if (session === "B4" || session === "Aft") {
    return `${session} ${timeStr}`;
  }
  return timeStr;
}

const getOrderDetails = async (matchCondition, isLoading, orderNums) => {
  const result = await OrderMaster.aggregate([
    { $match: matchCondition },
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
    { $lookup: { from: "rackings", localField: "gbi_order_racking_table", foreignField: "_id", as: "gbirackingsInfo" } },
    { $unwind: { path: "$orderssubitemcountsInfo", preserveNullAndEmptyArrays: true } },
    // Custom sort based on input array order
    {
      $addFields: {
        sortIndex: {
          $indexOfArray: [orderNums, "$order_unique_id"]
        }
      }
    },
    { $sort: { sortIndex: 1 } },
    {
      $project: {
        _id: 0,
        CHECK: "",
        CUSTOMER: { $arrayElemAt: ["$customerInfo.account_Name", 0] },
        CITY: {
          $toUpper: {
            $cond: [
              { $eq: ["$order_delivery_address_mode", "0"] },
              "$order_store_delivery_city",
              "$order_site_delivery_city"
            ]
          }
        },
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
        LENGTH: isLoading ? "$largestItem" : "$$REMOVE",
        RACK: !isLoading
          ? "$$REMOVE"
          : {
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
        "DRIVER'S INFO": isLoading ? "$$REMOVE" : "$order_custom_note",
        "LOADER'S INFO": isLoading ? "$order_loaders_info" : "$$REMOVE",
        order_crane_lift_checker: 1,
        order_delivery_date_str: 1,
        order_delivery_time: 1,
        order_delivery_session: 1,
        order_priority_status: 1,
        order_customer_UID: 1,
        order_unique_id: 1,
        order_customer_PO_number: 1
      }
    }
  ]).exec();

  let maxLength = 0;
  result.forEach(item => {
    const val = item.LENGTH;
    if (typeof val === 'number' && !isNaN(val) && val > maxLength) {
      maxLength = val;
    }
  });
  const formatted = result.map(doc => ({
    ...doc,
    TIME: getFormattedDeliveryTime(doc.order_delivery_time, doc.order_delivery_session, 'runs'),
    large_length: doc.LENGTH === maxLength
  }));

  return formatted
};

const getSplitOrderDetails = async (matchCondition, isLoading, orderNums) => {
  const result = await SplitOrders.aggregate([
    { $match: matchCondition },
    {
      $lookup: {
        from: "ordermasters",
        localField: "order_master_id",
        foreignField: "_id",
        as: "parentOrder"
      }
    },
    { $unwind: "$parentOrder" },
    { $lookup: { from: "orderitems", localField: "order_master_id", foreignField: "order_master_id", as: "orderitemsInfo" } },
    { $lookup: { from: "orderitemsmanuals", localField: "order_master_id", foreignField: "order_master_me_id", as: "orderitemsmanualsInfo" } },
    // Bring in counts and racks same as internal orders
    {
      $lookup: {
        from: "orderssubitemcounts",
        localField: "order_master_id",
        foreignField: "Order_Mas_Id",
        as: "orderssubitemcountsInfo"
      }
    },
    { $lookup: { from: "accounts", localField: "parentOrder.order_customer_id", foreignField: "_id", as: "customerInfo" } },
    { $unwind: { path: "$orderssubitemcountsInfo", preserveNullAndEmptyArrays: true } },

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

    { $lookup: { from: "rackings", localField: "parentOrder.f_order_racking_table", foreignField: "_id", as: "frackingsInfo" } },
    { $lookup: { from: "rackings", localField: "parentOrder.fg_order_racking_table", foreignField: "_id", as: "fgrackingsInfo" } },
    { $lookup: { from: "rackings", localField: "parentOrder.cl_order_racking_table", foreignField: "_id", as: "clrackingsInfo" } },
    { $lookup: { from: "rackings", localField: "parentOrder.j_order_racking_table", foreignField: "_id", as: "jrackingsInfo" } },
    { $lookup: { from: "rackings", localField: "parentOrder.roof_order_racking_table", foreignField: "_id", as: "roofrackingsInfo" } },
    { $lookup: { from: "rackings", localField: "parentOrder.gbi_order_racking_table", foreignField: "_id", as: "gbirackingsInfo" } },
    {
      $addFields: {
        sortIndex: {
          $indexOfArray: [orderNums, "$order_unique_id"]
        }
      }
    },
    { $sort: { sortIndex: 1 } },

    {
      $project: {
        _id: 0,
        CHECK: "",
        CUSTOMER: { $arrayElemAt: ["$customerInfo.account_Name", 0] },
        CITY: {
          $toUpper: {
            $cond: [
              { $eq: ["$order_delivery_address_mode", "0"] },
              "$order_store_delivery_city",
              "$order_site_delivery_city"
            ]
          }
        },
        "PO NO": "$order_customer_PO_number",
        "ORDER NO": "$order_unique_id",
        // "PO NO": {
        //     $cond: [
        //     { $eq: ["$parentOrder.order_customer_UID", AWF_CUST_ID] },
        //     {
        //         $let: {
        //         vars: {
        //             restLen: {
        //             $max: [
        //                 { $subtract: [{ $strLenBytes: "$parentOrder.order_customer_PO_number" }, 6] },
        //                 0
        //             ]
        //             }
        //         },
        //         in: {
        //             $concat: [
        //             { $toString: "$order_unique_id" },
        //             {
        //                 $cond: [
        //                 { $gt: ["$$restLen", 0] },
        //                 { $substrBytes: ["$parentOrder.order_customer_PO_number", 6, "$$restLen"] },
        //                 ""  // nothing to append if PO number has <= 6 chars
        //                 ]
        //             }
        //             ]
        //         }
        //         }
        //     },
        //     "$parentOrder.order_customer_PO_number"
        //     ]
        // },
        // "ORDER NO": {
        //     $cond: [
        //     { $eq: ["$parentOrder.order_customer_UID", AWF_CUST_ID] },
        //     { $substr: ["$parentOrder.order_customer_PO_number", 0, 6] },
        //     "$order_unique_id"
        //     ]
        // },
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
        LENGTH: isLoading ? "$largestItem" : "$$REMOVE",
        RACK: !isLoading
          ? "$$REMOVE"
          : {
            $let: {
              vars: {
                // flashing rack name if exists, else empty string
                fRackName: { $ifNull: [{ $arrayElemAt: ["$frackingsInfo.rack_name", 0] }, ""] },

                // compute flashing status code (RO / FO / PIP / C) when rack name is empty
                fStatusCode: {
                  $switch: {
                    branches: [
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
        "DRIVER'S INFO": isLoading ? "$$REMOVE" : "$parentOrder.order_custom_note",
        "LOADER'S INFO": isLoading ? "$parentOrder.order_loaders_info" : "$$REMOVE",
        order_crane_lift_checker: "$parentOrder.order_crane_lift_checker",
        order_delivery_date_str: "$order_delivery_date_str",
        order_delivery_time: "$order_delivery_time",
        order_delivery_session: "$order_delivery_session",
        order_priority_status: "$order_priority_status",
        order_customer_UID: 1,
        order_unique_id: 1,
        order_customer_PO_number: 1
      }
    }
  ]).exec();

  let maxLength = 0;
  result.forEach(item => {
    const val = item.LENGTH;
    if (typeof val === 'number' && !isNaN(val) && val > maxLength) {
      maxLength = val;
    }
  });

  const formatted = result.map(doc => ({
    ...doc,
    TIME: getFormattedDeliveryTime(doc.order_delivery_time, doc.order_delivery_session, 'runs'),
    large_length: doc.LENGTH === maxLength,
    source: "split"
  }));

  return formatted;
};

const autoColumnWidth = (data, fontSize = 11) => {
    if (!data || !data.length) return [];

    const keys = Object.keys(data[0]);
    const scalingFactor = fontSize / 11; // 11 is default Excel font size

    return keys.map(key => {
        const maxLength = Math.max(
        key.length,
        ...data.map(row => row[key] ? row[key].toString().length : 0)
        );
        return {
        wch: Math.ceil(maxLength * scalingFactor) + 2 // add padding
        };
    });
};

function ordinalSuffixOf(i) {
  const j = i % 10,
        k = i % 100;
  if (j === 1 && k !== 11) {
    return i + "ST";
  }
  if (j === 2 && k !== 12) {
    return i + "ND";
  }
  if (j === 3 && k !== 13) {
    return i + "RD";
  }
  return i + "TH";
}

function getDayOfWeek(dateString) {
    const days = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
    const date = new Date(dateString);
    return days[date.getDay()];
}

const getRowColor = (item) => {
  if (!item) return { rowColor: "", classname: "" };
  let rowColor = '';
  let classname = '';

  if (item.order_priority_status === 1) {
    rowColor = 'a6cff7'
    classname = 'priority-1'; // Mapped primary color
  } else if (
    item?.PRODUCTS !== undefined &&
    item?.order_priority_status !== undefined &&
    (
      (item.PRODUCTS.includes("R") && item.order_priority_status === 0) ||
      item.order_priority_status === 2
    )
  ) {
    rowColor = 'b9ffc0';
    classname = 'priority-2';
  }
  else if (item.order_crane_lift_checker && item?.order_priority_status === 0) {
      rowColor = 'fcefe3'
      classname = 'priority-3';
  } else if (item.Order_Roofing_Count && item?.order_priority_status === 0) {
      rowColor = 'b9ffc0'  
      classname = 'priority-4';
  }

  return {rowColor, classname};
};

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

function excludeAlphabetsAfterLastDigit(str) {
  // Find the last digit position
  const lastDigitIndex = str.search(/\d(?!.*\d)/);

  if (lastDigitIndex === -1) {
    // No digits found → return original string or empty string
    return str;
  }

  // Slice string up to the last digit (inclusive)
  return str.slice(0, lastDigitIndex + 1);
}

const makeInCondition = (idsArray, uniqueField, poField) => ({
  $or: [
    // direct match on unique field
    { [uniqueField]: { $in: idsArray } },

    // fallback: same customer and first 6 bytes of PO in idsArray
    {
      $expr: {
        $and: [
          { $eq: ["$order_customer_UID", AWF_CUST_ID] },
          { $in: [{ $substrBytes: ["$" + poField, 0, 6] }, idsArray] }
        ]
      }
    }
  ]
});

// helper to build $or condition for single id
const makeEqCondition = (idValue, uniqueField, poField) => ({
  $or: [
    { [uniqueField]: idValue },
    {
      $expr: {
        $and: [
          { $eq: ["$order_customer_UID", AWF_CUST_ID] },
          { $eq: [{ $substrBytes: ["$" + poField, 0, 6] }, idValue] }
        ]
      }
    }
  ]
});

function computeOrderFields(order) {
  const uid = order?.order_customer_UID;
  const origPO = order?.order_customer_PO_number ?? "";
  const origUnique = order?.order_unique_id;

  if (uid === AWF_CUST_ID) {
    const newOrderUniqueId = origPO.substring(0, 6);            // first 6 chars (safe if shorter)
    const rest = origPO.length > 6 ? origPO.substring(6) : "";  // remainder after 6 chars
    const newOrderCustomerPO = String(origUnique) + rest;       // use original unique id, then rest
    return {
      order_unique_id: newOrderUniqueId,
      order_customer_PO_number: newOrderCustomerPO
    };
  } else {
    return {
      order_unique_id: order?.order_unique_id,
      order_customer_PO_number: order?.order_customer_PO_number
    };
  }
}

async function addOrderNumberToPDF(inputPath, outputPath, orderNumber, opts = {}) {
  const headerHeightPts = opts.headerHeightPts || 30; // points (1pt = 1/72in). Default 30pt.
  const bgColor = opts.bgColor || '#E6E6E6';
  const textColor = opts.textColor || '#000';
  const fontFamily = opts.fontFamily || 'Arial, Helvetica, sans-serif';
  const fontSizePts = opts.fontSizePts || 14;

  // Conversion ratio: PDF points -> CSS pixels for Puppeteer (assume 96 DPI)
  const PT_TO_PX = 96 / 72; // = 4/3

  // Load source PDF
  const srcBytes = fs.readFileSync(inputPath);
  const pdfDoc = await PDFLibDocument.load(srcBytes);

  // We'll embed PNGs into this same pdfDoc
  // Launch Puppeteer once and reuse for per-page header renders
  const browser = await puppeteer.launch({ headless: true, args: ['--no-sandbox', '--disable-setuid-sandbox'] });

  try {
    const page = await browser.newPage();

    // Loop pages and render a header PNG sized for each page width
    const pages = pdfDoc.getPages();
    for (let i = 0; i < pages.length; ++i) {
      const p = pages[i];
      const { width: pageWidthPts, height: pageHeightPts } = p.getSize();

      // Compute CSS pixel dimensions for rendering header image
      const pageWidthPx = Math.max(200, Math.ceil(pageWidthPts * PT_TO_PX)); // min width to avoid very small viewports
      const headerHeightPx = Math.max(20, Math.ceil(headerHeightPts * PT_TO_PX));

      // Create header HTML (simple, inline styles). You can elaborate as needed.
      const headerHtml = `
        <!doctype html>
        <html>
          <head>
            <meta charset="utf-8"/>
            <style>
              html,body{ margin:0; padding:0; }
              .header {
                width: ${pageWidthPx}px;
                height: ${headerHeightPx}px;
                box-sizing: border-box;
                background: ${bgColor};
                display:flex;
                align-items:center;
                justify-content: space-between;
                padding: 0 12px;
                font-family: ${fontFamily};
                -webkit-font-smoothing:antialiased;
              }
              .order {
                font-weight: 700;
                font-size: ${Math.round(fontSizePts * PT_TO_PX)}px;
                color: ${textColor};
                white-space: nowrap;
                overflow: hidden;
                text-overflow: ellipsis;
              }
              .brand { font-weight: 700; font-size: ${Math.round(fontSizePts * PT_TO_PX)}px; color: ${textColor}; }
            </style>
          </head>
          <body>
            <div class="header">
              <div class="brand">Site Map</div>
              <div class="order">Order: ${escapeHtml(orderNumber)}</div>
            </div>
          </body>
        </html>`.trim();

      // Set viewport and content, then screenshot the header area
      await page.setViewport({ width: pageWidthPx, height: headerHeightPx });
      await page.setContent(headerHtml, { waitUntil: ['load', 'networkidle0'] });

      // Take PNG screenshot of the header strip
      const pngBuffer = await page.screenshot({ omitBackground: false, type: 'png' });

      // Embed PNG into the same pdfDoc
      const pngImage = await pdfDoc.embedPng(pngBuffer);

      // Compute height to draw in PDF points (preserve aspect ratio)
      const imgWidthPx = pngImage.width; // in px
      const imgHeightPx = pngImage.height; // in px
      // image aspect ratio in px
      const aspect = imgHeightPx / imgWidthPx;

      // We want the image to span the PDF page width (in points) and occupy headerHeightPts tall.
      const drawWidthPts = pageWidthPts;
      const drawHeightPts = headerHeightPts; // we rendered header to match this, so use headerHeightPts

      // If aspect differs slightly, we can compute drawHeight from aspect, but using headerHeightPts is fine.
      // Draw at top of page: x=0, y = pageHeightPts - drawHeightPts
      p.drawImage(pngImage, {
        x: 0,
        y: pageHeightPts - drawHeightPts,
        width: drawWidthPts,
        height: drawHeightPts,
      });
    }

    // Save PDF. For maximum Acrobat compatibility you can disable object streams/compression.
    const saveOptions = opts.acrobatCompatibility
      ? { useObjectStreams: true, compress: true }
      : {};

    const outBytes = await pdfDoc.save(saveOptions);
    fs.writeFileSync(outputPath, outBytes);
  } finally {
    await browser.close();
  }
}

/** small HTML-escape helper */
function escapeHtml(str) {
  if (str === undefined || str === null) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

async function processMudMap({ order, merger, orderNumber = "" }) {
    try {
        console.log("Processing mud map for order:", order.order_unique_id);
        const mudMapFileKey = order.order_site_delivery_mud_map;
        const command = new GetObjectCommand({
        Bucket: "encore-sheet",
        Key: mudMapFileKey,
        });
        console.log("Fetching mud map from S3:", mudMapFileKey);

        const response = await s3Client.send(command);
        const tempFilePath = path.join(
        __dirname,
        "../dockets",
        `mudmap_${order.order_unique_id}${path.extname(mudMapFileKey)}_${Date.now()}`
        );

        // Save S3 stream to local file
        await new Promise((resolve, reject) => {
        const writeStream = fs.createWriteStream(tempFilePath);
        response.Body.pipe(writeStream);
        response.Body.on("error", reject);
        writeStream.on("finish", resolve);
        });


        const ext = path.extname(mudMapFileKey).toLowerCase();

        if ([".png", ".jpg", ".jpeg"].includes(ext)) {
        const tempPdfPath = tempFilePath.replace(ext, ".pdf");
        await convertImageToPDF(tempFilePath, tempPdfPath);

        const tempPdfWithOrder = tempPdfPath.replace(".pdf", "_order.pdf");
        await addOrderNumberToPDF(tempPdfPath, tempPdfWithOrder, orderNumber || order.order_unique_id)
        await merger.add(tempPdfWithOrder);
        await fs.promises.unlink(tempPdfPath);
        await fs.promises.unlink(tempPdfWithOrder);
        await fs.promises.unlink(tempFilePath);
        } else if (ext === ".pdf") {
        const tempPdfWithOrder = tempFilePath.replace(".pdf", "_order.pdf");
        await addOrderNumberToPDF(tempFilePath, tempPdfWithOrder, orderNumber || order.order_unique_id, { headerHeightPts: 30, acrobatCompatibility: true });

        await merger.add(tempPdfWithOrder);
        await fs.promises.unlink(tempPdfWithOrder);
        await fs.promises.unlink(tempFilePath);
        }
        // fs.unlinkSync(tempFilePath);
    } catch (error) {
        console.error("Error processing mud map:", error);
    }
}

// ✅ NEW: Increment blank PDF counter
function incrementBlankPdfCounter() {
  consecutiveBlankPdfs++;
  console.log(`[BROWSER] Blank PDF count: ${consecutiveBlankPdfs}`);
  return consecutiveBlankPdfs;
}

// ✅ NEW: Reset blank PDF counter
function resetBlankPdfCounter() {
  consecutiveBlankPdfs = 0;
  console.log(`[BROWSER] Blank PDF counter reset`);
}

// ✅ NEW: Get current blank PDF count
function getBlankPdfCount() {
  return consecutiveBlankPdfs;
}

const getEmpRolesAndPermissions = async (user_id) => {
    try{
        var rolesObj = [];
        var resObj = {};
        let specificUser = await Users.find({_id: user_id, user_status: "active"});
        
        if (specificUser.length == 0){
            console.log("can't find the user");
            return resObj;
        }else{
            
            var roles = specificUser[0].user_Role;
            var roleName = "";
            let activeModules = await Modules.find({modules_Status: "active"});
    
            if(activeModules.length > 0){
                var roleModuleObj = {};
                for(i=0;i<activeModules.length;i++){
                    var moduleProperties = {};
                    moduleProperties.Module_Name = activeModules[i].modules_Name;
                    moduleProperties.add = "0";
                    moduleProperties.edit = "0";
                    moduleProperties.view = "0"
                    //Character concatenated because of React dependency
                    var moduleAliase = activeModules[i].modules_Alias;
                    roleModuleObj[moduleAliase] = moduleProperties;
                }
                
            }

            for(j=0;j<roles.length;j++){
                var role = specificUser[0].user_Role[j];
                let roleInfo = await Roles.find({_id: role });
                if(j > 0){ roleName = roleName + ", " }
                roleName = roleName + roleInfo[0].role_Name;
                var roleid = roleInfo[0]._id;
                let rolePermissionInfo = await RolesPermission.find({Role_Id: roleid });

                if(rolePermissionInfo.length > 0){
                    for(k=0;k<rolePermissionInfo.length;k++){
                        
                        let moduleInfo = await Modules.find({_id: rolePermissionInfo[k].Module_Id});

                        var roleModuleId = moduleInfo[0]?.modules_Alias;
                        if(roleModuleObj[roleModuleId]?.add == "0"){
                            roleModuleObj[roleModuleId].add = rolePermissionInfo[k]?.Add_Perms;
                        }
                        if(roleModuleObj[roleModuleId]?.edit == "0"){
                            roleModuleObj[roleModuleId].edit = rolePermissionInfo[k]?.Edit_Perms;
                        }
                        if(roleModuleObj[roleModuleId]?.view == "0"){
                            roleModuleObj[roleModuleId].view = rolePermissionInfo[k]?.View_Perms;
                        }
                    }
                }
            }
            resObj.Role_Name = roleName;
            resObj.rolepermissions = roleModuleObj;
            return resObj;            
        }
    }
    catch(err){ logError('getEmpRolesAndPermissions', err); }
}

module.exports = {
  handleMongooseError,
  renderTableAsImage,
  generateDocketPDFDocketwise,
  ordinalSuffixOf,
  getDayOfWeek,
  getOrderDetails,
  autoColumnWidth,
  getRowColor,
  formatDateString,
  getSplitOrderDetails,
  makeInCondition,
  makeEqCondition,
  computeOrderFields,
  processMudMap,
  convertImageToPDF,
  excludeAlphabetsAfterLastDigit,
  getFormattedDeliveryTime,
  closeBrowser,
  forceRestartBrowser,
  isPdfBlank,
  incrementBlankPdfCounter,
  resetBlankPdfCounter,
  getBlankPdfCount,
  getEmpRolesAndPermissions
};