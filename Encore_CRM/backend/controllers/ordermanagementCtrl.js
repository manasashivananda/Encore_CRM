const mongoose = require("mongoose");
const sql = require("mssql");
const express = require("express");
const axios = require("axios");
const session = require("express-session");
const app = express();
const fs = require("fs");
const path = require("path");
const { escapeRegExp } = require("utils");
const { getSignedUrl } = require("@aws-sdk/s3-request-presigner");
const { GetObjectCommand, S3Client, DeleteObjectCommand } = require("@aws-sdk/client-s3");
const { DateTime } = require("luxon");
const { v4: uuidv4 } = require("uuid");
const puppeteer = require("puppeteer");
const { PDFDocument, StandardFonts, rgb } = require("pdf-lib");
const { logError } = require("../logger");
const config = require("../config/sqlConfig");

const AWF_CUST_ID = process.env.AWF_CUSTOMER_ID

const s3Client = new S3Client({
  region: process.env.AWS_REGION,
  credentials: {
    accessKeyId: process.env.AWS_ACCESS_KEY_ID,
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
  },
});

app.use(
  session({
    secret: "EncoreMyob",
    resave: false,
    saveUninitialized: false,
  })
);

// Order coordinator module
// const getModeName = mode => {
//   let modeName = "";
//   switch (mode) {
//     case 0:
//       modeName = "Store";
//       break;
//     case 1:
//       modeName = "Site";
//       break;
//     case 2:
//       modeName = "Pickup";
//       break;
//     default:
//       modeName = "Unknown mode"; // handle unexpected inputs
//   }
//   return modeName;
// };

const nodemailer = require("nodemailer");

//Model Inclusion
const OrderMaster = require("../models/ordermasterModel");
const QuotationMaster = require("../models/quotationmasterModel");
const Users = require("../models/userModel");
const OrderItem = require("../models/orderitemModel");
const QuotationItem = require("../models/quotationitemModel");
const OrderItemManual = require("../models/orderitemmanualModel");
const QuotationItemManual = require("../models/quotationitemmanualModel");
const CustomerMaterialPricebook = require("../models/customermaterialpricebookModel");
const ProductColor = require("../models/productcolorModel");
const Account = require("../models/accountModel");
const AccountContact = require("../models/accountcontactModel");
const AccountAddress = require("../models/accountaddressModel");
const CoreProduct = require("../models/coreproductModel");
const ProductFold = require("../models/productfoldModel");
const ProductGirth = require("../models/productgirthModel");
const UserOrder = require("../models/orderuserModel");
const Department = require("../models/departmentModel");
const ErrorLogTable = require("../models/designdefectlogModel");
const QuoteErrorLogTable = require("../models/quotationdesigndefectlogModel");
const OrderItemsCount = require("../models/ordersubitemscountModel");
const OrderUserJobsCount = require("../models/orderuserjobscountModel");
const OrderLineNumber = require("../models/orderLineNumberModel");
const RackMaster = require("../models/rackingModel");
const Template = require("../models/templateModel");
const MaterialRow = require("../models/materialRowModel");
const { log } = require("console");
const { sendMail } = require('./runsDriversOrderCtrl');
let attrs = { options: true, new: true };

function formatDateString(orderdeliverydate) {
  const date = new Date(orderdeliverydate);
  const timeZone = "Australia/Sydney";
  const options = {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hour12: true,
    timeZone: timeZone,
  };
  const formattedDate = new Intl.DateTimeFormat("en-GB", options).format(date);
  const [datePart, timePart] = formattedDate.split(", ");
  const [day, month, year] = datePart.split("/");
  let [ampm] = timePart.split(" ");
  ampm = ampm.toLowerCase();
  return `${day}-${month}-${year}`;
}

exports.addOrderDetails = async (req, res) => {
    try {
        //Data Initialization
        const customerID = req.body.order_customer_id;
        const objcustomerID = new mongoose.Types.ObjectId(req.body.order_customer_id);
        const orderdeliverydate = req.body.order_delivery_date;
        const orderPOnumber = req.body.order_customer_PO_number;
        const orderStatus = process.env.MasOrdStatus1;
        const orderUser = new mongoose.Types.ObjectId(req.user.user_ref_id);
        const orderdeliveryaddressmode = req.body.order_delivery_address_mode;
        const orderflashingchecker = req.body.order_flashing_checker;
        const ordercustomnote = req.body.order_custom_note;
        const orderinterdepartmentinstruction = req.body.order_inter_department_instruction;
        const ordercreatorID = new mongoose.Types.ObjectId(req.user.user_ref_id);
        const ordermasterrack = req.body.order_master_rack;
        let orderdeliverytime = req.body.order_delivery_time;
        let orderdeliverysession = req.body.order_delivery_session;
        let ordercraneliftchecker = req.body.order_crane_lift_checker;
        let orderloadersinfo = req.body.order_loaders_info;
        let orderfarsuburb = req.body.order_far_suburb;
        let orderstoredeliveryaddress1;
        let orderstoredeliveryaddress2;
        let orderstoredeliverycity;
        let orderstoredeliverycountry;
        let orderstoredeliverypostalcode;
        let orderstoredeliverystate;
        let ordersitedeliveryattentionperson;
        let ordersitedeliveryattentioncontact;
        let ordersitedeliveryaddress1;
        let ordersitedeliveryaddress2;
        let ordersitedeliverycity;
        let ordersitedeliverycountry;
        let ordersitedeliverypostalcode;
        let ordersitedeliverystate;
        let ordersitedetails;
        let ordersitemudmap;
        let fOrderProdPushStatus;
        let orderquotechecker;
        let orderquoteno;
        let quoteMasID;
        let MYOB_ROW_ID;
        let MYOB_ORDER_ID;


        let pochecker = false;
        let pocheckexst;

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
        }).toLowerCase()?.replace(':', ':')?.replace(' ', ' ');
        formattedNow = formattedNow?.replace(/\.(\d{2})/, ':$1');

        let formattedDate = formatDateString(orderdeliverydate);
        let formattedMYOBDate;
        let dateObj = DateTime.fromRFC2822(orderdeliverydate, { zone: 'Australia/Sydney' });
        if (!dateObj.isValid) {
            console.error('Invalid DateTime:', dateObj.invalidExplanation);
        } else {
            if (dateObj.isInDST) {
                dateObj = dateObj.plus({ hours: 11 });
            } else {
                dateObj = dateObj.plus({ hours: 10 });
            }
            formattedMYOBDate = dateObj.toFormat("yyyy-MM-dd'T'HH:mm:ssZZ");
        }

        let currentDateObj = DateTime.now().setZone('Australia/Sydney');
        if (!currentDateObj.isValid) {
            console.error('Invalid DateTime:', currentDateObj.invalidExplanation);
        } else {
            if (currentDateObj.isInDST) {
                currentDateObj = currentDateObj.plus({ hours: 11 });
            } else {
                currentDateObj = currentDateObj.plus({ hours: 10 });
            }
            formattedCurrentDate = currentDateObj.toFormat("yyyy-MM-dd'T'HH:mm:ssZZ");
        }

        if (orderdeliverytime && orderdeliverytime.trim() === "12.00 AM") {
            orderdeliverysession = "A/T";
        }
        let timeOnlyStr = orderdeliverytime?.replace(/ AM| PM/i, '').trim();
        if (orderdeliverysession === "A/T") {
            timeOnlyStr = "A/T"
        } else {
            timeOnlyStr = orderdeliverytime;
        }

        let ordAccountDetails = await Account.find({ _id: objcustomerID });
        let cusUID = ordAccountDetails[0].account_UID;
        let cusPhone = ordAccountDetails[0].account_Address_Phone;
        let cusEmail = ordAccountDetails[0].account_Address_Email;

        if (cusUID === AWF_CUST_ID) {
            // For AWF customer, match by the first 6 characters of the PO number (exclude current order)
            const prefix = (orderPOnumber || "").toString().substring(0, 6);

            const escapedPrefix = prefix.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
            
            pocheckexst = await OrderMaster.find({
          order_customer_UID: AWF_CUST_ID,
          order_customer_PO_number: { $regex: `^${escapedPrefix}` }
            });
        } else {
            // For other customers, match full PO number (exclude current order)
            pocheckexst = await OrderMaster.find({
          order_customer_PO_number: orderPOnumber
            });
        }
        if (pocheckexst.length > 0) {
            pochecker = true;
        }

        if(cusUID === AWF_CUST_ID && pochecker){
          return res.status(412).send("PO number should be unique for AWF Customer order.");
        }

        if (orderdeliveryaddressmode == 0) {
            if(req.body.order_store_delivery_address1 === "" || req.body.order_store_delivery_address1 === "-"){
              return res.status(412).send("Store address is required.")
            }

            if(req.body.order_store_delivery_city === "" || req.body.order_store_delivery_city === "-"){
              return res.status(412).send("Store city is required.")
            }
            orderstoredeliveryaddress1 = req.body.order_store_delivery_address1;
            orderstoredeliveryaddress2 = req.body.order_store_delivery_address2;
            orderstoredeliverycity = req.body.order_store_delivery_city;
            orderstoredeliverycountry = req.body.order_store_delivery_country;
            orderstoredeliverypostalcode = req.body.order_store_delivery_postalcode;
            orderstoredeliverystate = req.body.order_store_delivery_state;
        }
        if (orderdeliveryaddressmode == 1) {
            ordersitedeliveryattentionperson = req.body.order_site_delivery_attention_person;
            ordersitedeliveryattentioncontact = req.body.order_site_delivery_attention_contact;
            ordersitedeliveryaddress1 = req.body.order_site_delivery_address1;
            ordersitedeliveryaddress2 = req.body.order_site_delivery_address2;
            ordersitedeliverycity = req.body.order_site_delivery_city;
            ordersitedeliverycountry = req.body.order_site_delivery_country;
            ordersitedeliverypostalcode = req.body.order_site_delivery_postalcode;
            ordersitedeliverystate = req.body.order_site_delivery_state;
            ordersitedetails = req.body.order_site_delivery_details;
            ordersitemudmap = req.body.order_site_delivery_mud_map;
            orderstoredeliveryaddress1 = ordAccountDetails[0].account_Address_line_one;
            orderstoredeliveryaddress2 = ordAccountDetails[0].account_Address_line_two;
            orderstoredeliverycity = ordAccountDetails[0].account_Address_City;
            orderstoredeliverycountry = ordAccountDetails[0].account_Address_Country;
            orderstoredeliverypostalcode = ordAccountDetails[0].account_Address_PostalCode;
            orderstoredeliverystate = ordAccountDetails[0].account_Address_State;
            const contact_exists = await CheckAttentionPersonExistenceFn(objcustomerID, cusUID, ordersitedeliveryattentionperson, ordersitedeliveryattentioncontact);
            if(contact_exists !== null){
              ordersitedeliveryattentionperson = contact_exists?.account_Contact_FName
            }
            await CheckAddressExistenceFn(objcustomerID, cusUID, ordersitedeliveryaddress1, ordersitedeliverycity, ordersitedeliverystate, ordersitedeliverycountry, ordersitedeliverypostalcode, ordercustomnote, ordersitedetails, ordersitemudmap);
        }
        if (orderdeliveryaddressmode == 2) {
            ordersitedeliveryattentionperson = req.body.order_site_delivery_attention_person;
            ordersitedeliveryattentioncontact = req.body.order_site_delivery_attention_contact;
            orderstoredeliveryaddress1 = ordAccountDetails[0].account_Address_line_one;
            orderstoredeliveryaddress2 = ordAccountDetails[0].account_Address_line_two;
            orderstoredeliverycity = ordAccountDetails[0].account_Address_City;
            orderstoredeliverycountry = ordAccountDetails[0].account_Address_Country;
            orderstoredeliverypostalcode = ordAccountDetails[0].account_Address_PostalCode;
            orderstoredeliverystate = ordAccountDetails[0].account_Address_State;
            const contact_exists = await CheckAttentionPersonExistenceFn(objcustomerID, cusUID, ordersitedeliveryattentionperson, ordersitedeliveryattentioncontact);
            if(contact_exists !== null){
              ordersitedeliveryattentionperson = contact_exists?.account_Contact_FName
            }
        }

        //MYOB Data Insetion Procedure Starts
        let aspxAuthValue = await loginMyob();
        if (aspxAuthValue) {
            const apiUrl = '' + process.env.MYOBURL + 'SalesOrder';
            const aspxAuthValue = fs.readFileSync('aspxauth.txt', 'utf8');
            let OrderData = {
                "CustomerID": { "value": "" + cusUID + "" },
                "Hold": { "value": false },
                "OrderType": { "value": "SO" },
                "CustomerOrder": { "value": "" + orderPOnumber + "" },
                "RequestedOn": { "value": "" + formattedMYOBDate + "" },
                "Description": { "value": "" + orderinterdepartmentinstruction + "" },
                "Date": { "value": "" + formattedCurrentDate + "" }
            };
            if (!ordercustomnote && orderdeliveryaddressmode === '0') {
                console.log("NO CUSTOMER NOTE AND ADDRESS MODE IS 0");
            }
            if (ordercustomnote && orderdeliveryaddressmode === '0') {
                OrderData.note = {
                    "value": "" + ordercustomnote + ""
                };
            }
            if (orderdeliveryaddressmode === '1' && !ordercustomnote) {
                OrderData.ShipToAddressOverride = {
                    "value": true
                };
                OrderData.ShipToContactOverride = {
                    "value": true
                };
                OrderData.ShipToAddress = {
                    "AddressLine1": {
                        "value": "" + timeOnlyStr + ""
                    },
                    "AddressLine2": {
                        "value": "" + ordersitedeliveryaddress1 + ""
                    },
                    "City": {
                        "value": "" + ordersitedeliverycity + ""
                    },
                    "Country": {
                        "value": "" + ordersitedeliverycountry + ""
                    },
                    "PostalCode": {
                        "value": "" + ordersitedeliverypostalcode + ""
                    },
                    "State": {
                        "value": "" + ordersitedeliverystate + ""
                    }
                };
                OrderData.ShipToContact = {
                    "Attention": {
                        "value": "" + ordersitedeliveryattentionperson + ""
                    },
                    "Phone1": {
                        "value": "" + ordersitedeliveryattentioncontact + ""
                    }
                };
            }
            if (orderdeliveryaddressmode === '1' && ordercustomnote) {
                OrderData.note = {
                    "value": "" + ordercustomnote + ""
                };
                OrderData.ShipToAddressOverride = {
                    "value": true
                };
                OrderData.ShipToContactOverride = {
                    "value": true
                };
                OrderData.ShipToAddress = {
                    "AddressLine1": {
                        "value": "" + timeOnlyStr + ""
                    },
                    "AddressLine2": {
                        "value": "" + ordersitedeliveryaddress1 + ""
                    },
                    "City": {
                        "value": "" + ordersitedeliverycity + ""
                    },
                    "Country": {
                        "value": "" + ordersitedeliverycountry + ""
                    },
                    "PostalCode": {
                        "value": "" + ordersitedeliverypostalcode + ""
                    },
                    "State": {
                        "value": "" + ordersitedeliverystate + ""
                    }
                };
                OrderData.ShipToContact = {
                    "Attention": {
                        "value": "" + ordersitedeliveryattentionperson + ""
                    },
                    "Phone1": {
                        "value": "" + ordersitedeliveryattentioncontact + ""
                    }
                };
            }
            if (orderdeliveryaddressmode === '2' && !ordercustomnote) {
                OrderData.ShipToContactOverride = {
                    "value": true
                };
                OrderData.ShipToAddressOverride = {
                    "value": true
                };
                OrderData.ShipToAddress = {
                    "AddressLine1": {
                        "value": "" + timeOnlyStr + ""
                    },
                    "AddressLine2": {
                        "value": "-"
                    },
                    "City": {
                        "value": "PICK UP"
                    },
                    "Country": {
                        "value": "AU"
                    },
                    "PostalCode": {
                        "value": "3803"
                    },
                    "State": {
                        "value": "VIC"
                    }
                };
                OrderData.ShipToContact = {
                    "Attention": {
                        "value": "" + ordersitedeliveryattentionperson + ""
                    },
                    "Phone1": {
                        "value": "" + ordersitedeliveryattentioncontact + ""
                    }
                };
            }
            if (orderdeliveryaddressmode === '2' && ordercustomnote) {
                OrderData.note = {
                    "value": "" + ordercustomnote + ""
                };
                OrderData.ShipToContactOverride = {
                    "value": true
                };
                OrderData.ShipToAddressOverride = {
                    "value": true
                };
                OrderData.ShipToAddress = {
                    "AddressLine1": {
                        "value": "" + timeOnlyStr + ""
                    },
                    "AddressLine2": {
                        "value": "-"
                    },
                    "City": {
                        "value": "PICK UP"
                    },
                    "Country": {
                        "value": "AU"
                    },
                    "PostalCode": {
                        "value": "3803"
                    },
                    "State": {
                        "value": "VIC"
                    }
                };
                OrderData.ShipToContact = {
                    "Attention": {
                        "value": "" + ordersitedeliveryattentionperson + ""
                    },
                    "Phone1": {
                        "value": "" + ordersitedeliveryattentioncontact + ""
                    }
                };
            }
            const headers = {
                'Cookie': generateCookie(aspxAuthValue),
                'Content-Type': 'application/json'
            };
            const response = await axios.put(apiUrl, OrderData, { headers });
            MYOB_ROW_ID = response.data.id;
            MYOB_ORDER_ID = response.data.OrderNbr.value;
        } else {
            res.status(500).send("Login Failed");
        }
        await logoutMyob();

        if (MYOB_ROW_ID && MYOB_ORDER_ID) {
            let booleanFlasingChecker = JSON.parse(req.body.order_flashing_checker);
            if (booleanFlasingChecker === true) {
                fOrderProdPushStatus = 1;
            } else {
                fOrderProdPushStatus = 0;
            }

            const orderData = new OrderMaster({
                order_unique_id: MYOB_ORDER_ID,
                order_myob_row_id: MYOB_ROW_ID,
                order_customer_id: customerID,
                order_delivery_date: orderdeliverydate,
                order_delivery_date_str: formattedDate,
                order_delivery_time: orderdeliverytime,
                order_delivery_session: orderdeliverysession,
                created_str: formattedNow,
                order_customer_PO_number: orderPOnumber,
                order_po_checker: pochecker,
                order_crane_lift_checker: ordercraneliftchecker,
                order_loaders_info: orderloadersinfo,
                order_master_rack: ordermasterrack,
                order_delivery_address_mode: orderdeliveryaddressmode,
                order_site_delivery_attention_person: ordersitedeliveryattentionperson,
                order_site_delivery_attention_contact: ordersitedeliveryattentioncontact,
                order_site_delivery_address1: ordersitedeliveryaddress1,
                order_site_delivery_address2: ordersitedeliveryaddress2,
                order_site_delivery_city: ordersitedeliverycity,
                order_site_delivery_details: ordersitedetails,
                order_site_delivery_mud_map: ordersitemudmap,
                order_site_delivery_country: ordersitedeliverycountry,
                order_site_delivery_postalcode: ordersitedeliverypostalcode,
                order_site_delivery_state: ordersitedeliverystate,
                order_flashing_checker: orderflashingchecker,
                order_created_person: ordercreatorID,
                order_status: orderStatus,
                order_quote_checker_status: orderquotechecker,
                order_quote_id: quoteMasID,
                order_quote_no: orderquoteno,
                order_custom_note: ordercustomnote,
                order_inter_department_instruction: orderinterdepartmentinstruction,
                user: orderUser,
                f_order_prod_push_status: fOrderProdPushStatus,
                order_customer_name: ordAccountDetails[0].account_Name,
                order_customer_UID: ordAccountDetails[0].account_UID,
                order_store_delivery_address1: orderstoredeliveryaddress1,
                order_store_delivery_address2: orderstoredeliveryaddress2,
                order_store_delivery_city: orderstoredeliverycity,
                order_store_delivery_country: orderstoredeliverycountry,
                order_store_delivery_postalcode: orderstoredeliverypostalcode,
                order_store_delivery_state: orderstoredeliverystate,
                order_customer_contact_name: "-",
                order_customer_contact_phone: cusPhone,
                order_customer_contact_email: cusEmail,
                order_far_suburb: orderfarsuburb,
            });
            const orderDataInfo = await orderData.save();
            if (orderDataInfo) {
                const userID = new mongoose.Types.ObjectId(req.user.user_ref_id);
                const userOrderData = new UserOrder({
                    user_ID: userID,
                    user_Order_ID: MYOB_ORDER_ID,
                });
                await userOrderData.save();
            }
            res.status(200).send(orderDataInfo);
        }
    } catch (err) {
        logError('addOrderDetails', err, req.user.user_ref_id);
        res.status(500).send('Order Creation Failed.');
    }
};

async function CheckAttentionPersonExistenceFn(cusobjid, cusid, attentionperson, attentioncontact) {
  let cusObjId = new mongoose.Types.ObjectId(cusobjid);

  // Find all contacts for this customer with the same name (case-insensitive)
  let existingContacts = await AccountContact.find({
    account_Id: cusObjId,
    account_Contact_FName: { $regex: `^${attentionperson}(?:-\\d+)?$`, $options: "i" }
  });

  // Check if the same name and phone already exist
  let exactMatch = existingContacts.find(
    c => c.account_Contact_FName.toLowerCase() === attentionperson.toLowerCase() &&
         c.account_Contact_Phone === attentioncontact
  );
  if (exactMatch) {
    // Already exists, do nothing
    console.log("Site Contact Exists with same name and number");
    return null;
  }

  // If same name but different number, find the next available suffix
  let maxSuffix = 0;
  existingContacts.forEach(c => {
    let match = c.account_Contact_FName.match(new RegExp(`^${attentionperson}-(\\d+)$`, "i"));
    if (match) {
      let num = parseInt(match[1], 10);
      if (num > maxSuffix) maxSuffix = num;
    } else if (c.account_Contact_FName.toLowerCase() === attentionperson.toLowerCase()) {
      // The base name exists, so next should be -1
      if (maxSuffix === 0) maxSuffix = 0;
    }
  });

  let newName = attentionperson;
  if (existingContacts.length > 0) {
    newName = `${attentionperson}-${maxSuffix + 1}`;
  }

  const attentionData = new AccountContact({
    account_Id: cusobjid,
    account_CUID: cusid,
    account_Contact_FName: newName,
    account_Contact_Phone: attentioncontact,
    account_Contact_Type: "Site",
  });
  await attentionData.save();
  return attentionData;
}

async function CheckAddressExistenceFn(cusobjid, cusid, sitedeliveryaddress1, sitedeliverycity, sitedeliverystate, sitedeliverycountry, sitedeliverypostalcode, customnote, ordersitedetails, ordersitemudmap) {
    let cusObjId = new mongoose.Types.ObjectId(cusobjid);

    sitedeliveryaddress1 = sitedeliveryaddress1
        .trim()              // remove leading & trailing spaces
        .replace(/,+$/, ""); // remove trailing commas

    let addressInfo = await AccountAddress.find({
        account_Id: cusObjId,
        account_Site_Address_line_one: sitedeliveryaddress1
    });
    if (!addressInfo || addressInfo.length === 0) {
        const addressData = new AccountAddress({
            account_Id: cusobjid,
            account_CUID: cusid,
            account_Site_Address_line_one: sitedeliveryaddress1,
            account_Site_City: sitedeliverycity,
            account_Site_State: sitedeliverystate,
            account_Site_Country: sitedeliverycountry,
            account_Site_Postalcode: sitedeliverypostalcode,
            account_Site_Notes: customnote,
            account_Site_Details: ordersitedetails, // add new field on insert
            account_Site_Mud_Map: ordersitemudmap
        });
        await addressData.save();
    } else {
        // Update Site Details if empty
        await AccountAddress.updateMany(
            {
                account_Id: cusObjId,
                account_Site_Address_line_one: sitedeliveryaddress1,
                $or: [
                    { account_Site_Details: { $exists: false } },
                    { account_Site_Details: "" },
                    { account_Site_Details: null }
                ]
            },
            { $set: { account_Site_Details: ordersitedetails } }
        );

        // Update Mud Map if empty
        await AccountAddress.updateMany(
            {
                account_Id: cusObjId,
                account_Site_Address_line_one: sitedeliveryaddress1,
                $or: [
                    { account_Mud_Map: { $exists: false } },
                    { account_Mud_Map: "" },
                    { account_Mud_Map: null }
                ]
            },
            { $set: { account_Mud_Map: ordersitemudmap } }
        );

        console.log("Site Address Exists, details & mud map updated if empty");
    }

    return;
}

exports.fetchOrderProcessingInfo = async (req, res) => {
  try {
    let Department = new mongoose.Types.ObjectId(req.query.department);
    let SubDepartment = new mongoose.Types.ObjectId(req.query.subDepartment);
    let orderItems = [];

    let orderDetails;

    orderDetails = await OrderItem.aggregate([
      {
        $match: {
          $and: [{ order_item_department: Department }, { order_item_sub_department: SubDepartment }],
        },
      },
      { $sort: { created: -1 } },
      {
        $project: {
          _id: 1,
          order_unique_id: 1,
        },
      },
    ]);

    if (orderDetails) {
      const result = orderDetails.filter((thing, index, self) => index === self.findIndex(t => t.order_unique_id === thing.order_unique_id));
      let resultCount = result.length;

      for (i = 0; i < resultCount; i++) {
        let orderMasterDetails = await OrderMaster.aggregate([
          { $match: { $and: [{ order_unique_id: result[i].order_unique_id }] } },
          { $sort: { created: -1 } },
          { $lookup: { from: "accounts", as: "customerInfo", localField: "order_customer_id", foreignField: "_id" } },
          { $lookup: { from: "accountcontacts", as: "customercontactInfo", localField: "order_customer_contact_id", foreignField: "_id" } },
          { $unwind: { path: "$customerInfo", preserveNullAndEmptyArrays: true } },
          { $unwind: { path: "$customercontactInfo", preserveNullAndEmptyArrays: true } },

          {
            $project: {
              _id: 1,
              order_unique_id: 1,
              order_customer_id: 1,
              order_delivery_date: 1,
              order_delivery_address_mode: 1,
              order_delivery_address: 1,
              order_customer_contact_id: 1,
              order_customer_PO_number: 1,
              order_Pieces: 1,
              order_status: 1,
              created: 1,
              account_ID: "$customerInfo._id",
              account_UID: "$customerInfo.account_UID",
              account_Name: "$customerInfo.account_Name",
              account_Address: "$customerInfo.account_Address",
              account_StoreAddress: "$customerInfo.account_StoreAddress",
              account_Contact_Email: "$customercontactInfo.account_Contact_Email",
              account_Contact_Phone: "$customercontactInfo.account_Contact_Phone",
              account_Contact_Name: { $concat: ["$customercontactInfo.account_Contact_FName", " ", "$customercontactInfo.account_Contact_LName"] },
            },
          },
        ]);
        orderItems.push(...orderMasterDetails);
      }
    }
    res.send(orderItems).status(200).end();
  } catch (err) {
    logError("fetchOrderProcessingInfo", err, req.user.user_ref_id);
    res.status(500).send("Data Fetching Failed.");
  }
};

exports.fetchCustomOrderProcessingInfo = async (req, res) => {
  try {
    let Department = new mongoose.Types.ObjectId(req.query.department);
    let SubDepartment = new mongoose.Types.ObjectId(req.query.subDepartment);
    const orderItems = [];

    let orderDetails;
    orderDetails = await OrderItemManual.aggregate([
      {
        $match: {
          $and: [{ order_item_me_department: Department }, { order_item_me_sub_department: SubDepartment }],
        },
      },
      { $sort: { created: -1 } },
      {
        $project: {
          _id: 1,
          order_unique_me_id: 1,
        },
      },
    ]);

    if (orderDetails) {
      const result = orderDetails.filter((thing, index, self) => index === self.findIndex(t => t.order_unique_me_id === thing.order_unique_me_id));
      let resultCount = result.length;

      for (i = 0; i < resultCount; i++) {
        let orderMasDetails = await OrderMaster.aggregate([
          { $match: { $and: [{ order_unique_id: result[i].order_unique_me_id }] } },
          { $sort: { created: -1 } },
          { $lookup: { from: "accounts", as: "customerInfo", localField: "order_customer_id", foreignField: "_id" } },
          { $lookup: { from: "accountcontacts", as: "customercontactInfo", localField: "order_customer_contact_id", foreignField: "_id" } },
          { $unwind: { path: "$customerInfo", preserveNullAndEmptyArrays: true } },
          { $unwind: { path: "$customercontactInfo", preserveNullAndEmptyArrays: true } },

          {
            $project: {
              _id: 1,
              order_unique_id: 1,
              order_customer_id: 1,
              order_delivery_date: 1,
              order_delivery_address_mode: 1,
              order_delivery_address: 1,
              order_customer_contact_id: 1,
              order_customer_PO_number: 1,
              order_Pieces: 1,
              order_status: 1,
              created: 1,
              account_ID: "$customerInfo._id",
              account_UID: "$customerInfo.account_UID",
              account_Name: "$customerInfo.account_Name",
              account_Address: "$customerInfo.account_Address",
              account_StoreAddress: "$customerInfo.account_StoreAddress",
              account_Contact_Email: "$customercontactInfo.account_Contact_Email",
              account_Contact_Phone: "$customercontactInfo.account_Contact_Phone",
              account_Contact_Name: { $concat: ["$customercontactInfo.account_Contact_FName", " ", "$customercontactInfo.account_Contact_LName"] },
            },
          },
        ]);
        orderItems.push(...orderMasDetails);
      }
    }
    res.send(orderItems).status(200).end();
  } catch (err) {
    logError("fetchCustomOrderProcessingInfo", err, req.user.user_ref_id);
    res.status(500).send("Data Fetching Failed.");
  }
};

exports.fetchOrderDetails = async (req, res) => {
    try {
        const limit = 20;
        const page = parseInt(req.query.page) || 0;
        const skip = page * limit;
        const field_condition = req.query.sortField;
        const searchKeyword = req.query.query;
        const cusId = req.query.cusId;
        const myob = req.query.myob;
        const startDate = req.query.startDate;
        const endDate = req.query.endDate;
        const sortDirection = parseInt(req.query.sortDirection) || -1;

        let matchCondition = {};
        let sortCondition = { order_unique_id: -1 };

        function escapeRegExp(string) {
            return string?.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        }

        // Helper function to build filter conditions from DataGrid filter model
        function buildDataGridFilters(queryParams) {
            const filters = [];

            if (Array.isArray(queryParams.filter)) {
                for (let item of queryParams.filter) {
                    if (!item) continue;
                    const field = item.field;
                    const operator = item.operator;
                    const value = item.value;
                    if (field && value !== undefined && value !== '') {
                        const filterCondition = buildFilterCondition(field, operator, value);
                        if (filterCondition) filters.push(filterCondition);
                    }
                }
            } else if (queryParams.filter && typeof queryParams.filter === 'object') {
                const entries = Object.keys(queryParams.filter)
                    .sort((a, b) => Number(a) - Number(b))
                    .map(k => queryParams.filter[k]);
                for (let item of entries) {
                    if (!item) continue;
                    const field = item.field;
                    const operator = item.operator;
                    const value = item.value;
                    if (field && value !== undefined && value !== '') {
                        const filterCondition = buildFilterCondition(field, operator, value);
                        if (filterCondition) filters.push(filterCondition);
                    }
                }
            } else {
                let filterIndex = 0;
                while (queryParams[`filter[${filterIndex}][field]`] !== undefined) {
                    const field = queryParams[`filter[${filterIndex}][field]`];
                    const operator = queryParams[`filter[${filterIndex}][operator]`];
                    const value = queryParams[`filter[${filterIndex}][value]`];
                    if (field && value !== undefined && value !== '') {
                        const filterCondition = buildFilterCondition(field, operator, value);
                        if (filterCondition) filters.push(filterCondition);
                    }
                    filterIndex++;
                }
            }

            if (filters.length === 0) return null;
            if (filters.length === 1) return filters[0];

            const logicOperator = queryParams.filterLogic || 'and';
            return logicOperator === 'or' ? { $or: filters } : { $and: filters };
        }

        function buildFilterCondition(field, operator, value) {
            switch (operator) {
                case 'contains':
                    return { [field]: { $regex: escapeRegExp(value), $options: 'i' } };
                case 'equals':
                    if (field === 'order_Overall_Price') {
                        return { [field]: parseFloat(value) };
                    }
                    return { [field]: value };
                case 'startsWith':
                    return { [field]: { $regex: `^${escapeRegExp(value)}`, $options: 'i' } };
                case 'endsWith':
                    return { [field]: { $regex: `${escapeRegExp(value)}$`, $options: 'i' } };
                default:
                    return { [field]: { $regex: escapeRegExp(value), $options: 'i' } };
            }
        }

        const fieldsToSearch = [
            "order_unique_id",
            "order_customer_name",
            "order_customer_PO_number",
            "order_customer_UID",
            "order_customer_contact_name",
            "order_customer_contact_phone",
            "order_customer_contact_email",
            "order_site_delivery_attention_person",
            "order_site_delivery_attention_contact",
            "order_store_delivery_address1",
            "order_store_delivery_address2",
            "order_store_delivery_city",
            "order_store_delivery_country",
            "order_store_delivery_postalcode",
            "order_store_delivery_state",
            "order_site_delivery_address1",
            "order_site_delivery_address2",
            "order_site_delivery_city",
            "order_site_delivery_country",
            "order_site_delivery_postalcode",
            "order_site_delivery_state",
            "order_quote_id"
        ];

        // Build search conditions
        if (searchKeyword && searchKeyword.trim() !== '') {
            const escapedKeyword = escapeRegExp(searchKeyword.trim());
            const regexSearchConditions = fieldsToSearch.map(field => ({
                [field]: { $regex: escapedKeyword, $options: "i" }
            }));
            matchCondition.$or = regexSearchConditions;
        }

        // Build DataGrid column filters
        const dataGridFilters = buildDataGridFilters(req.query);

        // Combine search and DataGrid filters
        if (dataGridFilters) {
            if (Object.keys(matchCondition).length > 0) {
                matchCondition = { $and: [matchCondition, dataGridFilters] };
            } else {
                matchCondition = dataGridFilters;
            }
        }

        // Handle sorting
        const sortableFieldsMap = {
            order_unique_id: "order_unique_id",
            order_delivery_date: "order_delivery_date",
            created: "created",
            order_customer_name: "order_customer_name",
            order_status: "order_status",
            order_Overall_Price: "sort_price",
            order_customer_PO_number: "order_customer_PO_number",
            order_site_delivery_attention_person: "sort_attention_person",
            order_site_delivery_address1: "sort_address",
            order_site_delivery_city: "sort_city",
        };

        // Apply additional filters (non-global mode)
        const additionalConditions = [];
        if (myob) {
            if (myob === "Pushed To MYOB") {
                additionalConditions.push({ order_myob_push_status: true, order_qc_status: "4" });
            } else if (myob === "Ready For MYOB") {
                additionalConditions.push({ order_myob_push_status: false, order_qc_status: "4" });
            } else if (myob === "Order Hold") {
                additionalConditions.push({ order_hold: true });
            } else {
                additionalConditions.push({ order_status: myob });
            }
        }
        if (req.query.global !== "true") {
          if (cusId) {
              additionalConditions.push({ order_customer_id: new mongoose.Types.ObjectId(cusId) });
          }

          if (startDate && endDate) {
              additionalConditions.push({
                  created: {
                      $gte: new Date(startDate),
                      $lte: new Date(endDate)
                  }
              });
          } else if (startDate) {
              additionalConditions.push({ created: { $gte: new Date(startDate) } });
          } else if (endDate) {
              additionalConditions.push({ created: { $lte: new Date(endDate) } });
          }
        }

        if (additionalConditions.length > 0) {
            if (matchCondition.$and) {
                matchCondition.$and.push(...additionalConditions);
            } else if (Object.keys(matchCondition).length > 0) {
                matchCondition = { $and: [matchCondition, ...additionalConditions] };
            } else {
                matchCondition = additionalConditions.length === 1
                    ? additionalConditions[0]
                    : { $and: additionalConditions };
            }
        }
        if (sortableFieldsMap[field_condition]) {
              sortCondition = {
                  [sortableFieldsMap[field_condition]]: parseInt(sortDirection)
              };
          }

        // ✅ OPTIMIZATION: Run all queries in PARALLEL
        const [total_orders, errorCount, orderDetails] = await Promise.all([
            // Query 1: Count total matching orders
            OrderMaster.countDocuments(matchCondition),

            // Query 2: Count errors using aggregation (much faster than fetching all docs)
            OrderMaster.aggregate([
                { $match: matchCondition },
                {
                    $match: {
                        $or: [
                            { f_mail_push_status: false },
                            { fg_mail_push_status: false },
                            { j_mail_push_status: false },
                            { cl_mail_push_status: false },
                            { roof_mail_push_status: false }
                        ]
                    }
                },
                { $count: "errorCount" }
            ]).then(result => result[0]?.errorCount || 0),

            // Query 3: Fetch paginated order details
            OrderMaster.aggregate([
                // STEP 1: Filter first
                { $match: matchCondition },
                
                // STEP 2: Add computed fields for sorting
                {
                    $addFields: {
                        sort_attention_person: {
                            $cond: [
                                { $eq: ["$order_delivery_address_mode", "0"] },
                                "-",
                                "$order_site_delivery_attention_person"
                            ]
                        },
                        sort_address: {
                            $cond: [
                                { $eq: ["$order_delivery_address_mode", "0"] },
                                "$order_store_delivery_address1",
                                "$order_site_delivery_address1"
                            ]
                        },
                        sort_city: {
                            $cond: [
                                { $eq: ["$order_delivery_address_mode", "0"] },
                                "$order_store_delivery_city",
                                "$order_site_delivery_city"
                            ]
                        },
                        sort_price: {
                            $cond: [
                                { $eq: [{ $type: "$order_Overall_Price" }, "string"] },
                                { $toDouble: "$order_Overall_Price" },
                                { $ifNull: ["$order_Overall_Price", 0] }
                            ]
                        }
                    }
                },
                
                // STEP 3: Sort
                { $sort: sortCondition },
                
                // STEP 4: Pagination
                { $skip: skip },
                { $limit: limit },
                
                // STEP 5: Lookups
                {
                    $lookup: {
                        from: "accounts",
                        localField: "order_customer_id",
                        foreignField: "_id",
                        pipeline: [
                            {
                                $project: {
                                    _id: 1,
                                    account_UID: 1,
                                    account_Name: 1,
                                    account_Address: 1,
                                    account_StoreAddress: 1,
                                    account_Address_line_one: 1,
                                    account_Address_line_two: 1,
                                    account_Address_Country: 1,
                                    account_Address_State: 1,
                                    account_Address_City: 1,
                                    account_Address_PostalCode: 1
                                }
                            }
                        ],
                        as: "customerInfo"
                    }
                },
                { $unwind: { path: "$customerInfo", preserveNullAndEmptyArrays: true } },
                
                {
                    $lookup: {
                        from: "accountcontacts",
                        localField: "order_customer_contact_id",
                        foreignField: "_id",
                        pipeline: [{ $project: { _id: 1 } }],
                        as: "customercontactInfo"
                    }
                },
                { $unwind: { path: "$customercontactInfo", preserveNullAndEmptyArrays: true } },
                
                {
                    $lookup: {
                        from: "departments",
                        localField: "order_department",
                        foreignField: "_id",
                        pipeline: [
                            { $project: { department_name: 1, _id: 0 } }
                        ],
                        as: "departments"
                    }
                },
                { $unwind: { path: "$departments", preserveNullAndEmptyArrays: true } },
                
                // STEP 6: Final projection
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
                        order_site_delivery_address1: 1,
                        order_site_delivery_address2: 1,
                        order_site_delivery_city: 1,
                        order_site_delivery_state: 1,
                        order_site_delivery_country: 1,
                        order_site_delivery_postalcode: 1,
                        order_site_delivery_attention_person: 1,
                        order_site_delivery_attention_contact: 1,
                        order_store_delivery_address1: 1,
                        order_store_delivery_address2: 1,
                        order_store_delivery_city: 1,
                        order_store_delivery_country: 1,
                        order_store_delivery_state: 1,
                        order_store_delivery_postalcode: 1,
                        order_inter_department_instruction: 1,
                        order_custom_note: 1,
                        order_customer_contact_email: 1,
                        order_customer_contact_phone: 1,
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
                        order_Pieces: 1,
                        order_quote_id: 1,
                        order_status: 1,
                        order_qc_status: 1,
                        order_myob_push_status: 1,
                        order_flashing_checker: 1,
                        order_barcode_checker: 1,
                        f_order_prod_push_status: 1,
                        fg_order_prod_push_status: 1,
                        cl_order_prod_push_status: 1,
                        j_order_prod_push_status: 1,
                        gbi_order_prod_push_status: 1,
                        f_order_prod_current_status: 1,
                        fg_order_prod_current_status: 1,
                        cl_order_prod_current_status: 1,
                        j_order_prod_current_status: 1,
                        gbi_order_prod_current_status: 1,
                        f_mail_push_status: 1,
                        fg_mail_push_status: 1,
                        j_mail_push_status: 1,
                        cl_mail_push_status: 1,
                        roof_mail_push_status: 1,
                        order_crane_lift_checker: 1,
                        order_loaders_info: 1,
                        order_doubt_status: 1,
                        order_far_suburb: 1,
                        created: 1,
                        order_Overall_Price: 1,
                        order_customer_name: 1,
                        order_hold: 1,
                        order_created_person: 1,
                        awf_order_prod_push_status: 1,
                        account_ID: "$customerInfo._id",
                        account_UID: "$customerInfo.account_UID",
                        account_Name: "$customerInfo.account_Name",
                        account_Address: "$customerInfo.account_Address",
                        account_StoreAddress: "$customerInfo.account_StoreAddress",
                        account_Address_line_one: "$customerInfo.account_Address_line_one",
                        account_Address_line_two: "$customerInfo.account_Address_line_two",
                        account_Address_Country: "$customerInfo.account_Address_Country",
                        account_Address_State: "$customerInfo.account_Address_State",
                        account_Address_City: "$customerInfo.account_Address_City",
                        account_Address_PostalCode: "$customerInfo.account_Address_PostalCode",
                        departments: "$departments.department_name"
                    }
                }
            ]).allowDiskUse(true)
        ]);

        const totalPages = Math.ceil(total_orders / limit);
        const fullOrderObj = {
            totalItems: total_orders,
            fetchedItems: orderDetails,
            rowsPerPage: limit,
            totalPages: totalPages,
            errorCount: errorCount
        };

        res.status(200).send(fullOrderObj);
    } catch (err) {
        logError('fetchOrderDetails', err, req.user.user_ref_id);
        console.error('Error in fetchOrderDetails:', err);
        res.status(500).send("Data Fetching Failed");
    }
};

exports.fetchOrderFullUserTracking = async (req, res) => {
  try {
    let orderID = new mongoose.Types.ObjectId(req.params.orderid);
    let orderUserDetails = await OrderMaster.aggregate([
      { $match: { _id: orderID } },
      { $lookup: { from: "departments", as: "departments", localField: "order_department", foreignField: "_id" } },
      { $lookup: { from: "users", as: "myobpusher", localField: "order_myob_pushed_person", foreignField: "_id" } },
      { $lookup: { from: "users", as: "myobrepusher", localField: "order_myob_repushed_person", foreignField: "_id" } },
      { $lookup: { from: "users", as: "userdesigner", localField: "order_designed_person", foreignField: "_id" } },
      { $lookup: { from: "users", as: "userqc", localField: "order_qced_person", foreignField: "_id" } },
      { $lookup: { from: "users", as: "usercreator", localField: "order_created_person", foreignField: "_id" } },
      { $lookup: { from: "users", as: "fuserroll", localField: "f_order_roll_user", foreignField: "_id" } },
      { $lookup: { from: "users", as: "fuserfold", localField: "f_order_fold_user", foreignField: "_id" } },
      { $lookup: { from: "users", as: "fuserrack", localField: "f_order_racking_user", foreignField: "_id" } },
      { $lookup: { from: "users", as: "juserfold", localField: "j_order_fold_user", foreignField: "_id" } },
      { $lookup: { from: "users", as: "juserrack", localField: "j_order_racking_user", foreignField: "_id" } },
      { $lookup: { from: "users", as: "cluserfold", localField: "cl_order_fold_user", foreignField: "_id" } },
      { $lookup: { from: "users", as: "cluserrack", localField: "cl_order_racking_user", foreignField: "_id" } },
      { $lookup: { from: "users", as: "fguserfold", localField: "fg_order_fold_user", foreignField: "_id" } },
      { $lookup: { from: "users", as: "fguserrack", localField: "fg_order_racking_user", foreignField: "_id" } },
      { $lookup: { from: "users", as: "gbiuserfold", localField: "gbi_order_fold_user", foreignField: "_id" } },
      { $lookup: { from: "users", as: "gbiuserrack", localField: "gbi_order_racking_user", foreignField: "_id" } },
      { $lookup: { from: "users", as: "roofuserfold", localField: "roof_order_fold_user", foreignField: "_id" } },
      { $lookup: { from: "users", as: "roofuserrack", localField: "roof_order_racking_user", foreignField: "_id" } },
      // added by bhaskar sc start
      { $lookup: { from: "users", as: "orderitemqcier", localField: "order_item_qc_person", foreignField: "_id" } },
      { $lookup: { from: "users", as: "orderitemqcierw", localField: "w_order_item_qc_person", foreignField: "_id" } },
      // added by bhaskar sc end
      { $lookup: { from: "orderssubitemcounts", as: "orderssubitemcountsinfo", localField: "_id", foreignField: "Order_Mas_Id" } },
      { $unwind: { path: "$departments", preserveNullAndEmptyArrays: true } },
      { $unwind: { path: "$myobpusher", preserveNullAndEmptyArrays: true } },
      { $unwind: { path: "$myobrepusher", preserveNullAndEmptyArrays: true } },
      { $unwind: { path: "$userdesigner", preserveNullAndEmptyArrays: true } },
      { $unwind: { path: "$userqc", preserveNullAndEmptyArrays: true } },
      { $unwind: { path: "$usercreator", preserveNullAndEmptyArrays: true } },
      { $unwind: { path: "$fuserroll", preserveNullAndEmptyArrays: true } },
      { $unwind: { path: "$fuserfold", preserveNullAndEmptyArrays: true } },
      { $unwind: { path: "$fuserrack", preserveNullAndEmptyArrays: true } },
      { $unwind: { path: "$juserfold", preserveNullAndEmptyArrays: true } },
      { $unwind: { path: "$juserrack", preserveNullAndEmptyArrays: true } },
      { $unwind: { path: "$cluserfold", preserveNullAndEmptyArrays: true } },
      { $unwind: { path: "$cluserrack", preserveNullAndEmptyArrays: true } },
      { $unwind: { path: "$fguserfold", preserveNullAndEmptyArrays: true } },
      { $unwind: { path: "$fguserrack", preserveNullAndEmptyArrays: true } },
      { $unwind: { path: "$gbiuserfold", preserveNullAndEmptyArrays: true } },
      { $unwind: { path: "$gbiuserrack", preserveNullAndEmptyArrays: true } },
      { $unwind: { path: "$roofuserfold", preserveNullAndEmptyArrays: true } },
      { $unwind: { path: "$roofuserrack", preserveNullAndEmptyArrays: true } },
      { $unwind: { path: "$orderssubitemcountsinfo", preserveNullAndEmptyArrays: true } },
      // added by bhaskar sc start
      { $unwind: { path: "$orderitemqcier", preserveNullAndEmptyArrays: true } },
      { $unwind: { path: "$orderitemqcierw", preserveNullAndEmptyArrays: true } },
      // added by bhaskar sc end
      {
        $project: {
          order_myob_moved_time_str: 1,
          order_design_assigned_time: 1,
          order_qc_assigned_time: 1,
          order_qc_completed_time: 1,
          order_design_completed_time: 1,
          f_order_racking_dimension1: 1,
          f_order_racking_dimension2: 1,
          fg_order_racking_dimension1: 1,
          fg_order_racking_dimension2: 1,
          j_order_racking_dimension1: 1,
          j_order_racking_dimension2: 1,
          cl_order_racking_dimension1: 1,
          cl_order_racking_dimension2: 1,
          gbi_order_racking_dimension1: 1,
          gbi_order_racking_dimension2: 1,
          roof_order_racking_dimension1: 1,
          roof_order_racking_dimension2: 1,
          f_order_roll_start_time: 1,
          f_order_roll_end_time: 1,
          f_order_roll_user: { $concat: ["$fuserroll.user_firstName", " ", "$fuserroll.user_lastName"] },
          f_order_fold_start_time: 1,
          f_order_fold_end_time: 1,
          f_order_fold_user: { $concat: ["$fuserfold.user_firstName", " ", "$fuserfold.user_lastName"] },
          f_order_racking_start_time: 1,
          f_order_racking_end_time: 1,
          f_order_racking_user: { $concat: ["$fuserrack.user_firstName", " ", "$fuserrack.user_lastName"] },
          j_order_fold_start_time: 1,
          j_order_fold_end_time: 1,
          j_order_fold_user: { $concat: ["$juserfold.user_firstName", " ", "$juserfold.user_lastName"] },
          j_order_racking_start_time: 1,
          j_order_racking_end_time: 1,
          j_order_racking_user: { $concat: ["$juserrack.user_firstName", " ", "$juserrack.user_lastName"] },
          cl_order_fold_start_time: 1,
          cl_order_fold_end_time: 1,
          cl_order_fold_user: { $concat: ["$cluserfold.user_firstName", " ", "$cluserfold.user_lastName"] },
          cl_order_racking_start_time: 1,
          cl_order_racking_end_time: 1,
          cl_order_racking_user: { $concat: ["$cluserrack.user_firstName", " ", "$cluserrack.user_lastName"] },
          fg_order_fold_start_time: 1,
          fg_order_fold_end_time: 1,
          fg_order_fold_user: { $concat: ["$fguserfold.user_firstName", " ", "$fguserfold.user_lastName"] },
          fg_order_racking_start_time: 1,
          fg_order_racking_end_time: 1,
          fg_order_racking_user: { $concat: ["$fguserrack.user_firstName", " ", "$fguserrack.user_lastName"] },
          gbi_order_fold_start_time: 1,
          gbi_order_fold_end_time: 1,
          gbi_order_fold_user: { $concat: ["$gbiuserfold.user_firstName", " ", "$gbiuserfold.user_lastName"] },
          gbi_order_racking_start_time: 1,
          gbi_order_racking_end_time: 1,
          gbi_order_racking_user: { $concat: ["$gbiuserrack.user_firstName", " ", "$gbiuserrack.user_lastName"] },
          roof_order_fold_start_time: 1,
          roof_order_fold_end_time: 1,
          roof_order_fold_user: { $concat: ["$roofuserfold.user_firstName", " ", "$roofuserfold.user_lastName"] },
          roof_order_racking_start_time: 1,
          roof_order_racking_end_time: 1,
          roof_order_racking_user: { $concat: ["$roofuserrack.user_firstName", " ", "$roofuserrack.user_lastName"] },
          // added by bhaskar sc start
          order_item_qc_user: { $concat: ["$orderitemqcier.user_firstName", " ", "$orderitemqcier.user_lastName"] },
          w_order_item_qc_user: { $concat: ["$orderitemqcierw.user_firstName", " ", "$orderitemqcierw.user_lastName"] },
          // added by bhaskar sc end
          departments: "$departments.department_name",
          designer_Name: { $concat: ["$userdesigner.user_firstName", " ", "$userdesigner.user_lastName"] },
          qc_Name: { $concat: ["$userqc.user_firstName", " ", "$userqc.user_lastName"] },
          myob_pusher_Name: { $concat: ["$myobpusher.user_firstName", " ", "$myobpusher.user_lastName"] },
          myob_repusher_Name: { $concat: ["$myobrepusher.user_firstName", " ", "$myobrepusher.user_lastName"] },
          creator_Name: { $concat: ["$usercreator.user_firstName", " ", "$usercreator.user_lastName"] },
          Order_Flashing_Count: "$orderssubitemcountsinfo.Order_Flashing_Count",
          Order_Jobbing_Count: "$orderssubitemcountsinfo.Order_Jobbing_Count",
          Order_Cladding_Count: "$orderssubitemcountsinfo.Order_Cladding_Count",
          Order_Faciagutter_Count: "$orderssubitemcountsinfo.Order_Faciagutter_Count",
          Order_GBI_Count: "$orderssubitemcountsinfo.Order_GBI_Count",
          Order_Roofing_Count: "$orderssubitemcountsinfo.Order_Roofing_Count",
        },
      },
    ]);

    let orderRackDetails = await OrderMaster.aggregate([
      { $match: { _id: orderID } },
      { $lookup: { from: "rackings", as: "frackingsInfo", localField: "f_order_racking_table", foreignField: "_id" } },
      { $lookup: { from: "rackings", as: "fgrackingsInfo", localField: "fg_order_racking_table", foreignField: "_id" } },
      { $lookup: { from: "rackings", as: "clrackingsInfo", localField: "cl_order_racking_table", foreignField: "_id" } },
      { $lookup: { from: "rackings", as: "jrackingsInfo", localField: "j_order_racking_table", foreignField: "_id" } },
      { $lookup: { from: "rackings", as: "gbirackingsInfo", localField: "gbi_order_racking_table", foreignField: "_id" } },
      { $lookup: { from: "rackings", as: "roofrackingsInfo", localField: "roof_order_racking_table", foreignField: "_id" } },
      { $unwind: { path: "$frackingsInfo", preserveNullAndEmptyArrays: true } },
      { $unwind: { path: "$fgrackingsInfo", preserveNullAndEmptyArrays: true } },
      { $unwind: { path: "$clrackingsInfo", preserveNullAndEmptyArrays: true } },
      { $unwind: { path: "$jrackingsInfo", preserveNullAndEmptyArrays: true } },
      { $unwind: { path: "$gbirackingsInfo", preserveNullAndEmptyArrays: true } },
      { $unwind: { path: "$roofrackingsInfo", preserveNullAndEmptyArrays: true } },
      {
        $project: {
          f_order_racking_table: "$frackingsInfo.rack_name",
          fg_order_racking_table: "$fgrackingsInfo.rack_name",
          cl_order_racking_table: "$clrackingsInfo.rack_name",
          j_order_racking_table: "$jrackingsInfo.rack_name",
          gbi_order_racking_table: "$gbirackingsInfo.rack_name",
          roof_order_racking_table: "$roofrackingsInfo.rack_name",
        },
      },
    ]);

    let mergedData = {
      ...(orderUserDetails.length > 0 ? orderUserDetails[0] : {}),
      ...(orderRackDetails.length > 0 ? orderRackDetails[0] : {}),
    };
    res.status(200).send([mergedData]);
  } catch (err) {
    logError("fetchOrderFullUserTracking", err, req.user.user_ref_id);
    res.status(500).send("Data Fetching Failed.");
  }
};

exports.fetchSpecificOrderDetails = async (req, res) => {
    try {
        const orderID = new mongoose.Types.ObjectId(req.params.orderid);
        let orderDetails = await OrderMaster.aggregate([
            { $match: { _id: orderID } },
            { $lookup: { from: "accounts", as: "customerInfo", localField: "order_customer_id", foreignField: "_id" } },
            { $lookup: { from: "accountcontacts", as: "customercontactInfo", localField: "order_customer_contact_id", foreignField: "_id" } },
            { $lookup: { from: "users", as: "cancelleduserInfo", localField: "order_cancelled_user", foreignField: "_id" } },

            { $lookup: { from: "users", as: "commentAddedUserInfo", localField: "order_comment_added_user", foreignField: "_id" } },
            { $lookup: { from: "users", as: "commentAttendedUserInfo", localField: "order_comment_attended_user", foreignField: "_id" } },
            { $lookup: { from: "users", as: "commentUpdatedUserInfo", localField: "order_comment_updated_user", foreignField: "_id" } },
            {
                $lookup: {
                    from: "users",
                    as: "assignedPersonInfo",
                    let: { assignedPerson: "$order_designed_person" },
                    pipeline: [
                        {
                            $match: {
                                $expr: {
                                    $eq: ["$_id", "$$assignedPerson"],
                                },
                            },
                        },
                        {
                            $project: {
                                fullName: { $concat: ["$user_firstName", " ", "$user_lastName"] },
                            },
                        },
                    ],
                },
            },
            {
                $lookup: {
                    from: "users",
                    as: "qcPersonInfo",
                    let: { qcedPerson: "$order_qced_person" },
                    pipeline: [
                        {
                            $match: {
                                $expr: {
                                    $eq: ["$_id", "$$qcedPerson"],
                                },
                            },
                        },
                        {
                            $project: {
                                fullName: { $concat: ["$user_firstName", " ", "$user_lastName"] },
                            },
                        },
                    ],
                },
            },
            {
                $lookup: {
                    from: "users",
                    as: "createdPersonInfo",
                    let: { createdPerson: "$order_created_person" },
                    pipeline: [
                        {
                            $match: {
                                $expr: {
                                    $eq: ["$_id", "$$createdPerson"],
                                },
                            },
                        },
                        {
                            $project: {
                                fullName: { $concat: ["$user_firstName", " ", "$user_lastName"] },
                            },
                        },
                    ],
                },
            },
            {
                $lookup: {
                    from: "users",
                    as: "orderItemQCPersonInfo",
                    let: { orderItemQCPerson: "$order_item_qc_person" },
                    pipeline: [
                        {
                            $match: {
                                $expr: {
                                    $eq: ["$_id", "$$orderItemQCPerson"],
                                },
                            },
                        },
                        {
                            $project: {
                                fullName: { $concat: ["$user_firstName", " ", "$user_lastName"] },
                            },
                        },
                    ],
                },
            },
            {
                $lookup: {
                    from: "users",
                    as: "wOrderItemQCPersonInfo",
                    let: { wOrderItemQCPerson: "$w_order_item_qc_person" },
                    pipeline: [
                        {
                            $match: {
                                $expr: {
                                    $eq: ["$_id", "$$wOrderItemQCPerson"],
                                },
                            },
                        },
                        {
                            $project: {
                                fullName: { $concat: ["$user_firstName", " ", "$user_lastName"] },
                            },
                        },
                    ],
                },
            },
            {
              $lookup: {
                from: "users",
                as: "orderHoldPersonInfo",
                let: { orderHoldPerson: "$order_hold_person" },
                pipeline: [
                  {
                    $match: {
                      $expr: {
                        $eq: ["$_id", "$$orderHoldPerson"],
                      },
                    },
                  },
                  {
                    $project: {
                      fullName: { $concat: ["$user_firstName", " ", "$user_lastName"] },
                  },
                  },
                ],
              },
            },
            { $unwind: { path: "$customerInfo", preserveNullAndEmptyArrays: true } },
            { $unwind: { path: "$customercontactInfo", preserveNullAndEmptyArrays: true } },
            { $unwind: { path: "$assignedPersonInfo", preserveNullAndEmptyArrays: true } },
            { $unwind: { path: "$qcPersonInfo", preserveNullAndEmptyArrays: true } },
            { $unwind: { path: "$createdPersonInfo", preserveNullAndEmptyArrays: true } },
            { $unwind: { path: "$cancelleduserInfo", preserveNullAndEmptyArrays: true } },

            { $unwind: { path: "$commentAddedUserInfo", preserveNullAndEmptyArrays: true } },
            { $unwind: { path: "$commentAttendedUserInfo", preserveNullAndEmptyArrays: true } },
            { $unwind: { path: "$commentUpdatedUserInfo", preserveNullAndEmptyArrays: true } },
            {
                $project: {
                    _id: 1,
                    order_Overall_Price: 1,
                    order_Discount_Total: 1,
                    order_GST_EXP_Total: 1,
                    order_GST_Taxable_Total: 1,
                    order_quote_price: 1,
                    order_Tax_Total: 1,
                    order_unique_id: 1,
                    d_order_unique_id: {
                        $cond: [
                        { $eq: ["$order_customer_UID", AWF_CUST_ID] },
                        { $substr: ["$order_customer_PO_number", 0, 6] },
                        "$order_unique_id"
                        ]
                    },
                    order_customer_id: 1,
                    order_delivery_date: 1,
                    order_master_rack: 1,
                    order_delivery_date_str: 1,
                    order_delivery_time: 1,
                    order_delivery_session: 1,
                    order_delivery_address_mode: 1,
                    order_store_delivery_address1: 1,
                    order_store_delivery_address2: 1,
                    order_store_delivery_city: 1,
                    order_store_delivery_country: 1,
                    order_store_delivery_postalcode: 1,
                    order_store_delivery_state: 1,
                    order_site_delivery_attention_person: 1,
                    order_site_delivery_attention_contact: 1,
                    order_site_delivery_address1: 1,
                    order_site_delivery_address2: 1,
                    order_site_delivery_city: 1,
                    order_site_delivery_details: 1,
                    order_site_delivery_mud_map: 1,
                    order_site_delivery_country: 1,
                    order_site_delivery_postalcode: 1,
                    order_site_delivery_state: 1,
                    order_inter_department_instruction: 1,
                    order_custom_note: 1,
                    order_delivery_address: 1,
                    order_customer_PO_number: 1,
                    d_order_customer_PO_number: {
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
                    order_po_checker: 1,
                    order_customer_contact_phone: 1,
                    order_customer_contact_email: 1,
                    order_flashing_checker: 1,
                    order_status: 1,
                    order_qc_status: 1,
                    order_myob_push_status: 1,
                    order_myob_row_id: 1,
                    order_Pieces: 1,
                    order_qc_status: 1,
                    order_design_stage: 1,
                    order_quote_no: 1,
                    order_quote_id: 1,
                    order_quote_checker_status: 1,
                    order_barcode_checker: 1,
                    f_order_prod_current_status: 1,
                    f_order_roll_start_time: 1,
                    f_order_roll_end_time: 1,
                    f_order_roll_user: 1,
                    f_order_fold_start_time: 1,
                    f_order_fold_end_time: 1,
                    f_order_fold_user: 1,
                    f_order_racking_start_time: 1,
                    f_order_racking_end_time: 1,
                    f_order_racking_user: 1,
                    j_order_prod_current_status: 1,
                    j_order_fold_start_time: 1,
                    j_order_fold_end_time: 1,
                    j_order_fold_user: 1,
                    j_order_racking_start_time: 1,
                    j_order_racking_end_time: 1,
                    j_order_racking_user: 1,
                    cl_order_prod_current_status: 1,
                    cl_order_fold_start_time: 1,
                    cl_order_fold_end_time: 1,
                    cl_order_fold_user: 1,
                    cl_order_racking_start_time: 1,
                    cl_order_racking_end_time: 1,
                    cl_order_racking_user: 1,
                    fg_order_prod_current_status: 1,
                    fg_order_fold_start_time: 1,
                    fg_order_fold_end_time: 1,
                    fg_order_fold_user: 1,
                    fg_order_racking_start_time: 1,
                    fg_order_racking_end_time: 1,
                    fg_order_racking_user: 1,
                    gbi_order_prod_current_status: 1,
                    gbi_order_fold_start_time: 1,
                    gbi_order_fold_end_time: 1,
                    gbi_order_fold_user: 1,
                    gbi_order_racking_start_time: 1,
                    gbi_order_racking_end_time: 1,
                    gbi_order_racking_user: 1,
                    roof_order_prod_current_status: 1,
                    roof_order_fold_start_time: 1,
                    roof_order_fold_end_time: 1,
                    roof_order_fold_user: 1,
                    roof_order_racking_start_time: 1,
                    roof_order_racking_end_time: 1,
                    roof_order_racking_user: 1,
                    order_custom_note: 1,
                    f_order_dept_instruction: 1,
                    cl_order_dept_instruction: 1,
                    j_order_dept_instruction: 1,
                    fg_order_dept_instruction: 1,
                    roof_order_dept_instruction: 1,
                    f_order_prod_push_status: 1,
                    fg_order_prod_push_status: 1,
                    cl_order_prod_push_status: 1,
                    j_order_prod_push_status: 1,
                    roof_order_prod_push_status: 1,
                    gbi_order_prod_push_status: 1,
                    gbil_order_prod_push_status: 1,
                    order_images_f: 1,
                    order_images_fg: 1,
                    order_images_cl: 1,
                    order_images_j: 1,
                    order_images_roof: 1,
                    order_images_gbi: 1,
                    order_cancelled_date: 1,
                    order_crane_lift_checker: 1,
                    order_remake_checker: 1,
                    order_loaders_info: 1,
                    created: 1,
                    order_doubt_status: 1,
                    order_supplier_status: 1,
                    order_far_suburb: 1,
                    order_item_qc_status: 1,
                    order_sales_comment: 1,
                    order_priority_status: 1,
                    order_comment_added_user: 1,
                    order_comment_updated_user: 1,
                    order_comment_attended_user: 1,
                    order_item_qc_person_id: "$wOrderItemQCPersonInfo._id",
                    w_order_item_qc_status: 1,
                    w_order_item_qc_person_id: "$wOrderItemQCPersonInfo._id",
                    created_str: 1,
                    docket:1,
                    order_hold: 1,
                    account_ID: "$customerInfo._id",
                    account_UID: "$customerInfo.account_UID",
                    account_Name: "$customerInfo.account_Name",
                    account_Address: "$customerInfo.account_Address",
                    account_StoreAddress: "$customerInfo.account_StoreAddress",
                    account_Address_line_one: "$customerInfo.account_Address_line_one",
                    account_Address_line_two: "$customerInfo.account_Address_line_two",
                    account_Address_Country: "$customerInfo.account_Address_Country",
                    account_Address_State: "$customerInfo.account_Address_State",
                    account_Address_City: "$customerInfo.account_Address_City",
                    account_Address_PostalCode: "$customerInfo.account_Address_PostalCode",
                    account_notes:"$customerInfo.accounts_Notes",
                    order_created_person_id: "$createdPersonInfo._id",
                    order_cancelled_user: { $concat: ["$cancelleduserInfo.user_firstName", " ", "$cancelleduserInfo.user_lastName"] },

                    order_comment_added_user_name: { $concat: ["$commentAddedUserInfo.user_firstName", " ", "$commentAddedUserInfo.user_lastName"] },
                    order_comment_attended_user_name: { $concat: ["$commentAttendedUserInfo.user_firstName", " ", "$commentAttendedUserInfo.user_lastName"] },
                    order_comment_updated_user_name: { $concat: ["$commentUpdatedUserInfo.user_firstName", " ", "$commentUpdatedUserInfo.user_lastName"] },
                    order_created_person_fullName: {
                        $cond: {
                            if: {
                                $eq: [{ $type: "$order_created_person" }, "objectId"],
                            },
                            then: "$createdPersonInfo.fullName",
                            else: "$order_created_person",
                        },
                    },
                    order_item_qc_person_fullName: {
                        $cond: {
                            if: {
                                $eq: [{ $type: "$order_item_qc_person" }, "objectId"],
                            },
                            then: "$orderItemQCPersonInfo.fullName",
                            else: "$order_item_qc_person",
                        },
                    },
                    w_order_item_qc_person_fullName: {
                        $cond: {
                            if: {
                                $eq: [{ $type: "$w_order_item_qc_person" }, "objectId"],
                            },
                            then: "$wOrderItemQCPersonInfo.fullName",
                            else: "$w_order_item_qc_person",
                        },
                    },
                    order_designed_person_id: "$assignedPersonInfo._id",
                    order_designed_person_fullName: {
                        $cond: {
                            if: {
                                $eq: [{ $type: "$order_designed_person" }, "objectId"],
                            },
                            then: "$assignedPersonInfo.fullName",
                            else: "$order_designed_person",
                        },
                    },
                    order_qced_person_id: "$qcPersonInfo._id",
                    order_qced_person_fullName: {
                        $cond: {
                            if: {
                                $eq: [{ $type: "$order_qced_person" }, "objectId"],
                            },
                            then: "$qcPersonInfo.fullName",
                            else: "$order_qced_person",
                        },
                    },
                    order_hold_person_fullName: {
                        $cond: {
                            if: {
                                $eq: [{ $type: "$order_hold_person" }, "objectId"],
                            },
                            then: "$orderHoldPersonInfo.fullName",
                            else: "$order_hold_person", 
                          },
                        },
                },
            },
        ]);
        res.send(orderDetails).status(200).end();
    } catch (err) {
        logError("fetchSpecificOrderDetails", err, req.user.user_ref_id);
        res.status(500).send("Data Fetching Failed.");
    }
};



exports.fetchSpecificOrderForProcessing = async (req, res) => {
  try {
    let ScannedOrderUID = req.query.keyword;
    const CustomDept = ScannedOrderUID.split(/\d+/).pop();
    const numorderUID = ScannedOrderUID.match(/\d/g);
    const temporderUID = numorderUID.join("");
    let orderUID;
    if(ScannedOrderUID.startsWith("IN"))
      orderUID = "IN" + temporderUID
    else
      orderUID = temporderUID
    let orderMasDetails;
    let DeptID;
    let DeptObjID;
    let DeptName;
    let matchCondition = {};

    const MasDetails = await OrderMaster.aggregate([
      { 
        $match: {
          $expr: {
            $or: [
              { $eq: ["$order_unique_id", orderUID] },
              {
                $and: [
                  { $eq: ["$order_customer_UID", AWF_CUST_ID] },
                  { $eq: [{ $substr: ["$order_customer_PO_number", 0, 6] }, orderUID] }
                ]
              }
            ]
          }
        }
      }
    ]);
    if (MasDetails.length > 0 && MasDetails[0].order_status === "Order Cancelled") {
      return res.status(500).send("This order has been cancelled!!!");
    }

    let ordDeptData = await Department.find({ department_code: CustomDept });
    if (ordDeptData.length) {
      DeptID = ordDeptData[0]._id;
      DeptName = ordDeptData[0].department_name;
      DeptObjID = new mongoose.Types.ObjectId(DeptID);
    }
    const escapedKeyword = orderUID.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    console.log("escapedKeyword", escapedKeyword)
    if (!CustomDept || CustomDept.length === 0) {
      orderMasDetails = await OrderMaster.aggregate([
        { $match: { $and: [{
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
                  { $eq: [{ $substrBytes: ["$order_customer_PO_number", 0, 6] }, orderUID] }
                ]
              }
            ] } }, 
            { order_flashing_checker: true }, { f_order_prod_push_status: 2 }] } },
        { $sort: { created: -1 } },
        { $lookup: { from: "accounts", as: "customerInfo", localField: "order_customer_id", foreignField: "_id" } },
        { $lookup: { from: "accountcontacts", as: "customercontactInfo", localField: "order_customer_contact_id", foreignField: "_id" } },
        { $unwind: { path: "$customerInfo", preserveNullAndEmptyArrays: true } },
        { $unwind: { path: "$customercontactInfo", preserveNullAndEmptyArrays: true } },
        { $lookup: { from: "orderssubitemcounts", as: "orderssubitemcountsInfo", localField: "_id", foreignField: "Order_Mas_Id" } },
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
            order_delivery_address_mode: 1,
            order_delivery_address: 1,
            order_customer_contact_id: 1,
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
            order_Pieces: 1,
            order_status: 1,
            order_flashing_checker: 1,
            created: 1,
            created_str: 1,
            f_order_prod_current_status: 1,
            f_order_prod_push_status: 1,
            f_order_roll_start_time: 1,
            f_order_roll_end_time: 1,
            f_order_roll_user: 1,
            f_order_fold_start_time: 1,
            f_order_fold_end_time: 1,
            f_order_fold_user: 1,
            f_order_racking_start_time: 1,
            f_order_racking_end_time: 1,
            f_order_racking_user: 1,
            account_ID: "$customerInfo._id",
            account_UID: "$customerInfo.account_UID",
            account_Name: "$customerInfo.account_Name",
            account_Address: "$customerInfo.account_Address",
            account_StoreAddress: "$customerInfo.account_StoreAddress",
            account_Contact_Email: "$customercontactInfo.account_Contact_Email",
            account_Contact_Phone: "$customercontactInfo.account_Contact_Phone",
            account_Contact_Name: { $concat: ["$customercontactInfo.account_Contact_FName", " ", "$customercontactInfo.account_Contact_LName"] },
            Order_Flashing_Count: "$orderssubitemcountsInfo.Order_Flashing_Count",
            Order_Jobbing_Count: "$orderssubitemcountsInfo.Order_Jobbing_Count",
            Order_Cladding_Count: "$orderssubitemcountsInfo.Order_Cladding_Count",
            Order_Faciagutter_Count: "$orderssubitemcountsInfo.Order_Faciagutter_Count",
            Order_Roofing_Count: "$orderssubitemcountsInfo.Order_Roofing_Count",
            Order_GBI_Count: "$orderssubitemcountsInfo.Order_GBI_Count",
            department_name: "Flashing",
            department_code: "F",
          },
        },
      ]);
    } else {
      matchCondition = { $and: [
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
                  { $eq: [{ $substrBytes: ["$order_customer_PO_number", 0, 6] }, orderUID] }
                ]
              }
            ] } }
      ] }
      if (CustomDept === "J") {
        matchCondition.j_order_prod_push_status = 2;
        // matchCondition.order_unique_id = orderUID;
      } else if (CustomDept === "FG") {
        matchCondition.fg_order_prod_push_status = 2;
        // matchCondition.order_unique_id = orderUID;
      } else if (CustomDept === "CL") {
        matchCondition.cl_order_prod_push_status = 2;
        // matchCondition.order_unique_id = orderUID;
      } else if (CustomDept === "GBI") {
        matchCondition.gbi_order_prod_push_status = 2;
        // matchCondition.order_unique_id = orderUID;
      } else if (CustomDept === "ROOF") {
        matchCondition.roof_order_prod_push_status = 2;
        // matchCondition.order_unique_id = orderUID;
      } else {
        return res.status(500).send("Invalid Barcode. Please Recheck");
      }

      orderMasDetails = await OrderMaster.aggregate([
        { $match: matchCondition },
        { $sort: { created: -1 } },
        { $lookup: { from: "accounts", as: "customerInfo", localField: "order_customer_id", foreignField: "_id" } },
        { $lookup: { from: "accountcontacts", as: "customercontactInfo", localField: "order_customer_contact_id", foreignField: "_id" } },
        { $unwind: { path: "$customerInfo", preserveNullAndEmptyArrays: true } },
        { $unwind: { path: "$customercontactInfo", preserveNullAndEmptyArrays: true } },
        { $lookup: { from: "orderssubitemcounts", as: "orderssubitemcountsInfo", localField: "_id", foreignField: "Order_Mas_Id" } },
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
            order_delivery_address_mode: 1,
            order_delivery_address: 1,
            order_customer_contact_id: 1,
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
            order_Pieces: 1,
            order_status: 1,
            order_flashing_checker: 1,
            created: 1,
            created_str: 1,
            j_order_prod_push_status: 1,
            fg_order_prod_push_status: 1,
            gbi_order_prod_push_status: 1,
            cl_order_prod_push_status: 1,
            roof_order_prod_push_status: 1,
            fg_order_prod_current_status: 1,
            fg_order_roll_start_time: 1,
            fg_order_roll_end_time: 1,
            fg_order_roll_user: 1,
            fg_order_fold_start_time: 1,
            fg_order_fold_end_time: 1,
            fg_order_fold_user: 1,
            fg_order_racking_start_time: 1,
            fg_order_racking_end_time: 1,
            fg_order_racking_user: 1,
            j_order_prod_current_status: 1,
            j_order_roll_start_time: 1,
            j_order_roll_end_time: 1,
            j_order_roll_user: 1,
            j_order_fold_start_time: 1,
            j_order_fold_end_time: 1,
            j_order_fold_user: 1,
            j_order_racking_start_time: 1,
            j_order_racking_end_time: 1,
            j_order_racking_user: 1,
            cl_order_prod_current_status: 1,
            cl_order_roll_start_time: 1,
            cl_order_roll_end_time: 1,
            cl_order_roll_user: 1,
            cl_order_fold_start_time: 1,
            cl_order_fold_end_time: 1,
            cl_order_fold_user: 1,
            cl_order_racking_start_time: 1,
            cl_order_racking_end_time: 1,
            cl_order_racking_user: 1,
            gbi_order_prod_current_status: 1,
            gbi_order_roll_start_time: 1,
            gbi_order_roll_end_time: 1,
            gbi_order_roll_user: 1,
            gbi_order_fold_start_time: 1,
            gbi_order_fold_end_time: 1,
            gbi_order_fold_user: 1,
            gbi_order_racking_start_time: 1,
            gbi_order_racking_end_time: 1,
            gbi_order_racking_user: 1,
            roof_order_prod_current_status: 1,
            roof_order_roll_start_time: 1,
            roof_order_roll_end_time: 1,
            roof_order_roll_user: 1,
            roof_order_fold_start_time: 1,
            roof_order_fold_end_time: 1,
            roof_order_fold_user: 1,
            roof_order_racking_start_time: 1,
            roof_order_racking_end_time: 1,
            roof_order_racking_user: 1,
            account_ID: "$customerInfo._id",
            account_UID: "$customerInfo.account_UID",
            account_Name: "$customerInfo.account_Name",
            account_Address: "$customerInfo.account_Address",
            account_StoreAddress: "$customerInfo.account_StoreAddress",
            account_Contact_Email: "$customercontactInfo.account_Contact_Email",
            account_Contact_Phone: "$customercontactInfo.account_Contact_Phone",
            account_Contact_Name: { $concat: ["$customercontactInfo.account_Contact_FName", " ", "$customercontactInfo.account_Contact_LName"] },
            Order_Flashing_Count: "$orderssubitemcountsInfo.Order_Flashing_Count",
            Order_Jobbing_Count: "$orderssubitemcountsInfo.Order_Jobbing_Count",
            Order_Cladding_Count: "$orderssubitemcountsInfo.Order_Cladding_Count",
            Order_Faciagutter_Count: "$orderssubitemcountsInfo.Order_Faciagutter_Count",
            Order_Roofing_Count: "$orderssubitemcountsInfo.Order_Roofing_Count",
            Order_GBI_Count: "$orderssubitemcountsInfo.Order_GBI_Count",
            department_name: DeptName,
            department_code: CustomDept,
          },
        },
      ]);
    }
    if (orderMasDetails.length === 0) {
      res.status(500).send("Order Not Ready For Production. Please Check The Individual Job Status Of The Order").end();
    } else {
      res.status(200).send(orderMasDetails).end();
    }
  } catch (err) {
    console.log(err)
    logError("fetchSpecificOrderForProcessing", err, req.user.user_ref_id);
    res.status(500).send("Data Fetching Failed.");
  }
};

exports.updateSpecificOrderDetails = async (req, res) => {
    try {
        const orderMasID = new mongoose.Types.ObjectId(req.params.orderid);
        let orderMasterInfo = await OrderMaster.findOne({ _id: orderMasID });
        let ordStr = orderMasterInfo.order_unique_id;
        let status = orderMasterInfo.order_status;
        if (status === "Order Cancelled") {
            const err = new Error("Attempt To Edit Cancelled Order " + ordStr);
            logError('updateSpecificOrderDetails', err, req.user.user_ref_id);
            return res.status(500).send('Cancelled Order. Please Recheck');
        }

        let OrderSORowID = req.body.order_myob_row_id
        const customerID = req.body.order_customer_id;
        const objcustomerID = new mongoose.Types.ObjectId(req.body.order_customer_id);
        const orderdeliverydate = req.body.order_delivery_date;
        const orderPieces = req.body.order_Pieces;
        const orderPOnumber = req.body.order_customer_PO_number;
        const orderdeliveryaddressmode = req.body.order_delivery_address_mode;
        const orderflashingchecker = req.body.order_flashing_checker;
        const ordercustomnote = req.body.order_custom_note;
        const ordermasterrack = req.body.order_master_rack;
        const orderinterdepartmentinstruction = req.body.order_inter_department_instruction;
        let orderdeliverytime = req.body.order_delivery_time;
        let orderdeliverysession = req.body.order_delivery_session;
        let ordercraneliftchecker = req.body.order_crane_lift_checker;
        let orderloadersinfo = req.body.order_loaders_info;
        let orderfarsuburb = req.body.order_far_suburb;
        let order_customer_contact_verified = req.body.order_customer_contact_verified
        let ordersitedeliveryattentionperson;
        let ordersitedeliveryattentioncontact;
        let ordersitedeliveryaddress1;
        let ordersitedeliveryaddress2;
        let ordersitedeliverycity;
        let ordersitedeliverycountry;
        let ordersitedeliverypostalcode;
        let ordersitedeliverystate;
        let ordersitedetails;
        let ordersitemudmap;
        let orderstoredeliveryaddress1;
        let orderstoredeliveryaddress2;
        let orderstoredeliverycity;
        let orderstoredeliverycountry;
        let orderstoredeliverypostalcode;
        let orderstoredeliverystate;
        let updated_order_qc_status;
        let orderquotechecker;
        let orderquoteno;
        let quoteMasID;
        let design_stage_check;
        let design_emp;
        let qc_emp;
        // let deleteExistingFlashing;
        let updatedOrderInfo;
        let commentAttended = req.body.comment_attended || false;
        let orderCommentAttendedUser = commentAttended ? new mongoose.Types.ObjectId(req.user.user_ref_id) : null

        let MasDetails = await OrderMaster.find({ _id: orderMasID });
        let orderUniqueId = MasDetails[0].order_unique_id;

        let pochecker = false;
        let pocheckexst;
        if (req.body.account_UID === AWF_CUST_ID) {
          const prefix = (orderPOnumber || "").toString().substring(0, 6);
          if (prefix.length === 0) {
            pocheckexst = [];
          } else {
            // match any PO that starts with the prefix, excluding current order
            const escapedPrefix = prefix.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
            pocheckexst = await OrderMaster.find({
              order_customer_UID: AWF_CUST_ID,
              order_customer_PO_number: { $regex: `^${escapedPrefix}` },
              _id: { $ne: orderMasID },
            });
          }
        } else {
          pocheckexst = await OrderMaster.find({
            order_customer_PO_number: orderPOnumber,
            _id: { $ne: orderMasID },
          });
        }
        console.log("pocheckexst", pocheckexst)
        if (pocheckexst.length > 0) {
            pochecker = true;
        }

        if(req.body.account_UID === AWF_CUST_ID && pochecker){
          return res.status(412).send("PO number should be unique for AWF Customer order.");
        }

        if (req.body.order_flashing_checker === "true") {
            updated_order_qc_status = "0";
            if (MasDetails[0].order_design_stage === "0") {
                design_stage_check = "0";
                design_emp = null;
                qc_emp = null;
            } else {
                design_stage_check = MasDetails[0].order_design_stage;
                design_emp = MasDetails[0].order_designed_person;
                qc_emp = MasDetails[0].order_qced_person;
            }
        } else {
            // deleteExistingFlashing = await OrderItem.deleteMany({ order_master_id: orderMasID, order_item_flag: "DT" });
            design_stage_check = "0";
            design_emp = null;
            qc_emp = null;
        }

        let booleanFlasingChecker = JSON.parse(orderflashingchecker);
        let f_order_exist;
        if (booleanFlasingChecker === true) {
            if (MasDetails[0].f_order_prod_push_status === 0) {
                f_order_exist = 1;
            }
            if (MasDetails[0].f_order_prod_push_status === 1) {
                f_order_exist = 1;
            }
            if (MasDetails[0].f_order_prod_push_status === 2) {
                f_order_exist = 2;
            }
        } else {
            f_order_exist = 0;
        }

        let ordAccountDetails = await Account.find({ _id: objcustomerID });
        let cusUID = ordAccountDetails[0].account_UID;
        let cusPhone = ordAccountDetails[0].account_Address_Phone;
        let cusEmail = ordAccountDetails[0].account_Address_Email;

        if (orderdeliveryaddressmode == 0) {
          if(req.body.order_store_delivery_address1 === "" || req.body.order_store_delivery_address1 === "-"){
              return res.status(412).send("Store address is required.")
            }

            if(req.body.order_store_delivery_city === "" || req.body.order_store_delivery_city === "-"){
              return res.status(412).send("Store city is required.")
            }
            orderstoredeliveryaddress1 = req.body.order_store_delivery_address1;
            orderstoredeliveryaddress2 = req.body.order_store_delivery_address2;
            orderstoredeliverycity = req.body.order_store_delivery_city;
            orderstoredeliverycountry = req.body.order_store_delivery_country;
            orderstoredeliverypostalcode = req.body.order_store_delivery_postalcode;
            orderstoredeliverystate = req.body.order_store_delivery_state;
        }
        if (orderdeliveryaddressmode == 1) {
            ordersitedeliveryattentionperson = req.body.order_site_delivery_attention_person;
            ordersitedeliveryattentioncontact = req.body.order_site_delivery_attention_contact;
            ordersitedeliveryaddress1 = req.body.order_site_delivery_address1;
            ordersitedeliveryaddress2 = req.body.order_site_delivery_address2;
            ordersitedeliverycity = req.body.order_site_delivery_city;
            ordersitedeliverycountry = req.body.order_site_delivery_country;
            ordersitedeliverypostalcode = req.body.order_site_delivery_postalcode;
            ordersitedeliverystate = req.body.order_site_delivery_state;
            ordersitedetails = req.body.order_site_delivery_details;
            ordersitemudmap = req.body.order_site_delivery_mud_map;
            orderstoredeliveryaddress1 = ordAccountDetails[0].account_Address_line_one;
            orderstoredeliveryaddress2 = ordAccountDetails[0].account_Address_line_two;
            orderstoredeliverycity = ordAccountDetails[0].account_Address_City;
            orderstoredeliverycountry = ordAccountDetails[0].account_Address_Country;
            orderstoredeliverypostalcode = ordAccountDetails[0].account_Address_PostalCode;
            orderstoredeliverystate = ordAccountDetails[0].account_Address_State;
            const contact_exists = await CheckAttentionPersonExistenceFn(objcustomerID, cusUID, ordersitedeliveryattentionperson, ordersitedeliveryattentioncontact);
            if(contact_exists !== null){
              ordersitedeliveryattentionperson = contact_exists?.account_Contact_FName
            }
            await CheckAddressExistenceFn(objcustomerID, cusUID, ordersitedeliveryaddress1, ordersitedeliverycity, ordersitedeliverystate, ordersitedeliverycountry, ordersitedeliverypostalcode, ordercustomnote, ordersitedetails, ordersitemudmap);
        }
        if (orderdeliveryaddressmode == 2) {
            ordersitedeliveryattentionperson = req.body.order_site_delivery_attention_person;
            ordersitedeliveryattentioncontact = req.body.order_site_delivery_attention_contact;
            orderstoredeliveryaddress1 = ordAccountDetails[0].account_Address_line_one;
            orderstoredeliveryaddress2 = ordAccountDetails[0].account_Address_line_two;
            orderstoredeliverycity = ordAccountDetails[0].account_Address_City;
            orderstoredeliverycountry = ordAccountDetails[0].account_Address_Country;
            orderstoredeliverypostalcode = ordAccountDetails[0].account_Address_PostalCode;
            orderstoredeliverystate = ordAccountDetails[0].account_Address_State;
            const contact_exists =  await CheckAttentionPersonExistenceFn(objcustomerID, cusUID, ordersitedeliveryattentionperson, ordersitedeliveryattentioncontact);
            if(contact_exists !== null){
              ordersitedeliveryattentionperson = contact_exists?.account_Contact_FName
            }
        }

        let formattedDate = formatDateString(orderdeliverydate);
        let formattedMYOBDate;
        let dateObj = DateTime.fromRFC2822(orderdeliverydate, { zone: 'Australia/Sydney' });
        if (!dateObj.isValid) {
            console.error('Invalid DateTime:', dateObj.invalidExplanation);
        } else {
            if (dateObj.isInDST) {
                dateObj = dateObj.plus({ hours: 11 });
            } else {
                dateObj = dateObj.plus({ hours: 10 });
            }
            formattedMYOBDate = dateObj.toFormat("yyyy-MM-dd'T'HH:mm:ssZZ");
        }

        if (orderdeliverytime && orderdeliverytime.trim() === "12.00 AM") {
            orderdeliverysession = "A/T";
        } else if (
            orderdeliverytime &&
            orderdeliverytime.trim() !== "12.00 AM" &&
            orderdeliverysession !== "B4" &&
            orderdeliverysession !== "Aft"
        ) {
            orderdeliverysession = "";
        }

        let timeOnlyStr = orderdeliverytime?.replace(/ AM| PM/i, '').trim();
        if (orderdeliverysession === "A/T") {
            timeOnlyStr = "A/T"
        } else {
            timeOnlyStr = orderdeliverytime;
        }
        // const filters = { _id: orderMasID };
        // const prevOrderDetails = await OrderMaster.findOne(filters)
        let aspxAuthValue = await loginMyob();
        if (aspxAuthValue) {
            const apiUrl = '' + process.env.MYOBURL + 'SalesOrder';
            const aspxAuthValue = fs.readFileSync('aspxauth.txt', 'utf8');
            let OrderData = {
                "id": OrderSORowID,
                "CustomerID": { "value": "" + cusUID + "" },
                "RequestedOn": {
                    "value": "" + formattedMYOBDate + ""
                },
                "ShipToAddressOverride": {
                    "value": false
                },
                "ShipToContactOverride": {
                    "value": false
                },
                "Description": {
                    "value": "" + orderinterdepartmentinstruction + ""
                },
                "CustomerOrder": { "value": "" + orderPOnumber + "" },
            };

            if (!ordercustomnote && orderdeliveryaddressmode === '0') {
                console.log("NO CUSTOMER NOTE AND ADDRESS MODE IS 0");
            }

            if (ordercustomnote && orderdeliveryaddressmode === '0') {
                OrderData.note = {
                    "value": "" + ordercustomnote + ""
                };
            }
            if (orderdeliveryaddressmode === '1' && !ordercustomnote) {
                OrderData.ShipToAddressOverride.value = true;
                OrderData.ShipToContactOverride.value = true;
                OrderData.ShipToAddress = {
                    "AddressLine1": {
                        "value": "" + timeOnlyStr + ""
                    },
                    "AddressLine2": {
                        "value": "" + ordersitedeliveryaddress1 + ""
                    },
                    "City": {
                        "value": "" + ordersitedeliverycity + ""
                    },
                    "Country": {
                        "value": "" + ordersitedeliverycountry + ""
                    },
                    "PostalCode": {
                        "value": "" + ordersitedeliverypostalcode + ""
                    },
                    "State": {
                        "value": "" + ordersitedeliverystate + ""
                    }
                };
                OrderData.ShipToContact = {
                    "Attention": {
                        "value": "" + ordersitedeliveryattentionperson + ""
                    },
                    "Phone1": {
                        "value": "" + ordersitedeliveryattentioncontact + ""
                    }
                };
            }
            if (orderdeliveryaddressmode === '1' && ordercustomnote) {
                OrderData.note = {
                    "value": "" + ordercustomnote + ""
                };
                OrderData.ShipToAddressOverride.value = true;
                OrderData.ShipToContactOverride.value = true;
                OrderData.ShipToAddress = {
                    "AddressLine1": {
                        "value": "" + timeOnlyStr + ""
                    },
                    "AddressLine2": {
                        "value": "" + ordersitedeliveryaddress1 + ""
                    },
                    "City": {
                        "value": "" + ordersitedeliverycity + ""
                    },
                    "Country": {
                        "value": "" + ordersitedeliverycountry + ""
                    },
                    "PostalCode": {
                        "value": "" + ordersitedeliverypostalcode + ""
                    },
                    "State": {
                        "value": "" + ordersitedeliverystate + ""
                    }
                };
                OrderData.ShipToContact = {
                    "Attention": {
                        "value": "" + ordersitedeliveryattentionperson + ""
                    },
                    "Phone1": {
                        "value": "" + ordersitedeliveryattentioncontact + ""
                    }
                };
            }
            if (orderdeliveryaddressmode === '2' && !ordercustomnote) {
                OrderData.ShipToContactOverride = {
                    "value": true
                };
                OrderData.ShipToAddressOverride = {
                    "value": true
                };
                OrderData.ShipToAddress = {
                    "AddressLine1": {
                        "value": "" + timeOnlyStr + ""
                    },
                    "AddressLine2": {
                        "value": "-"
                    },
                    "City": {
                        "value": "PICK UP"
                    },
                    "Country": {
                        "value": "AU"
                    },
                    "PostalCode": {
                        "value": "3803"
                    },
                    "State": {
                        "value": "VIC"
                    }
                };
                OrderData.ShipToContact = {
                    "Attention": {
                        "value": "" + ordersitedeliveryattentionperson + ""
                    },
                    "Phone1": {
                        "value": "" + ordersitedeliveryattentioncontact + ""
                    }
                };
            }
            if (orderdeliveryaddressmode === '2' && ordercustomnote) {
                OrderData.note = {
                    "value": "" + ordercustomnote + ""
                };
                OrderData.ShipToContactOverride = {
                    "value": true
                };
                OrderData.ShipToAddressOverride = {
                    "value": true
                };
                OrderData.ShipToAddress = {
                    "AddressLine1": {
                        "value": "" + timeOnlyStr + ""
                    },
                    "AddressLine2": {
                        "value": "-"
                    },
                    "City": {
                        "value": "PICK UP"
                    },
                    "Country": {
                        "value": "AU"
                    },
                    "PostalCode": {
                        "value": "3803"
                    },
                    "State": {
                        "value": "VIC"
                    }
                };
                OrderData.ShipToContact = {
                    "Attention": {
                        "value": "" + ordersitedeliveryattentionperson + ""
                    },
                    "Phone1": {
                        "value": "" + ordersitedeliveryattentioncontact + ""
                    }
                };
            }
            const headers = {
                Cookie: `.ASPXAUTH=${aspxAuthValue}`,
                'Content-Type': 'application/json'
            };
            const response = await axios.put(apiUrl, OrderData, { headers });
            if (response.data.OrderNbr) {
                const updateData = {
                    $set: {
                        order_customer_id: customerID,
                        order_delivery_date: orderdeliverydate,
                        order_delivery_date_str: formattedDate,
                        order_delivery_time: orderdeliverytime,
                        order_delivery_session: orderdeliverysession,
                        order_Pieces: orderPieces,
                        order_master_rack: ordermasterrack,
                        order_inter_department_instruction: orderinterdepartmentinstruction,
                        order_delivery_address_mode: orderdeliveryaddressmode,
                        order_site_delivery_attention_person: ordersitedeliveryattentionperson,
                        order_site_delivery_attention_contact: ordersitedeliveryattentioncontact,
                        order_site_delivery_address1: ordersitedeliveryaddress1,
                        order_site_delivery_address2: ordersitedeliveryaddress2,
                        order_site_delivery_city: ordersitedeliverycity,
                        order_site_delivery_country: ordersitedeliverycountry,
                        order_site_delivery_postalcode: ordersitedeliverypostalcode,
                        order_site_delivery_state: ordersitedeliverystate,
                        order_site_delivery_details: ordersitedetails,
                        order_site_delivery_mud_map: ordersitemudmap,
                        order_customer_PO_number: orderPOnumber,
                        order_po_checker: pochecker,
                        order_flashing_checker: orderflashingchecker,
                        order_qc_status: updated_order_qc_status,
                        order_design_stage: design_stage_check,
                        order_designed_person: design_emp,
                        order_qced_person: qc_emp,
                        order_quote_checker_status: orderquotechecker,
                        order_quote_id: quoteMasID,
                        order_crane_lift_checker: ordercraneliftchecker,
                        order_loaders_info: orderloadersinfo,
                        order_quote_no: orderquoteno,
                        order_custom_note: ordercustomnote,
                        f_order_prod_push_status: f_order_exist,
                        order_status: process.env.MasOrdStatus2,
                        order_custom_note: ordercustomnote,
                        order_customer_name: ordAccountDetails[0].account_Name,
                        order_customer_UID: ordAccountDetails[0].account_UID,
                        order_store_delivery_address1: orderstoredeliveryaddress1,
                        order_store_delivery_address2: orderstoredeliveryaddress2,
                        order_store_delivery_city: orderstoredeliverycity,
                        order_store_delivery_country: orderstoredeliverycountry,
                        order_store_delivery_postalcode: orderstoredeliverypostalcode,
                        order_store_delivery_state: orderstoredeliverystate,
                        order_customer_contact_name: "-",
                        order_customer_contact_phone: cusPhone,
                        order_customer_contact_email: cusEmail,
                        order_far_suburb: orderfarsuburb,
                        order_comment_attended_user: orderCommentAttendedUser,
                        order_customer_contact_verified
                    },
                };

                if (MasDetails[0].order_design_stage === "0" || req.body.order_flashing_checker === "false") {
                    updateData["$unset"] = {
                        order_design_assigned_time: "",
                        order_design_completed_time: "",
                        order_qc_assigned_time: "",
                        order_qc_completed_time: ""
                    }
                }
                const conditions = { _id: orderMasID };
                updatedOrderInfo = await OrderMaster.findByIdAndUpdate(conditions, updateData);
                
                // Update CustomTXT01, and ShapeDescriptor in SWI Jobs table only if PO number changed
                const oldPONumber = MasDetails[0].order_customer_PO_number;
                const newPONumber = orderPOnumber;
                
                const poNumberChanged = oldPONumber !== newPONumber;
                
                if (poNumberChanged) {
                    let pool = null;
                    try {
                        pool = await new sql.ConnectionPool(config).connect();
                        
                        // First, fetch all jobs with their ShapeDescriptor for this order
                        const jobsResult = await pool.request()
                            .input('JobName', sql.NVarChar, orderUniqueId)
                            .query(`SELECT JobID, ShapeDescriptor FROM Jobs WHERE JobName = @JobName`);
                        
                        // Update each job's ShapeDescriptor with new values
                        for (const job of jobsResult.recordset) {
                            let updatedShapeDescriptor = job.ShapeDescriptor || '';
                            
                            // Update CustomTxt1 in ShapeDescriptor if PO number changed
                            if (poNumberChanged && updatedShapeDescriptor) {
                                updatedShapeDescriptor = updatedShapeDescriptor.replace(
                                    /CustomTxt1\s*"[^"]*"/,
                                    `CustomTxt1 "${newPONumber || ''}"`
                                );
                            }
                            
                            // Update the job record
                            await pool.request()
                                .input('CustomTXT01', sql.NVarChar, newPONumber)
                                .input('ShapeDescriptor', sql.NVarChar(sql.MAX), updatedShapeDescriptor)
                                .input('JobID', sql.BigInt, job.JobID)
                                .query(`
                                    UPDATE Jobs 
                                    SET CustomTXT01 = @CustomTXT01, 
                                        ShapeDescriptor = @ShapeDescriptor
                                    WHERE JobID = @JobID
                                `);
                        }
                        
                        console.log('[updateSpecificOrderDetails] SWI Jobs updated - PO changed:', poNumberChanged, jobsResult.recordset.length);
                    } catch (sqlError) {
                        logError('[updateSpecificOrderDetails] SWI Jobs update failed', sqlError, req.user.user_ref_id);
                        console.error('[updateSpecificOrderDetails] SWI Jobs update failed:', sqlError.message);
                    } finally {
                        if (pool) {
                            await pool.close();
                        }
                    }
                }
            }
        } else {
            res.status(500).send("Login Failed");
        }
        await logoutMyob();
        await checkIndividualOrderStatus(req.params.orderid);

        // generate system message when delivery date or delivery mode changes and order already moved to production
        // if (formattedDate !== prevOrderDetails.order_delivery_date_str || orderdeliveryaddressmode !== prevOrderDetails.order_delivery_address_mode) {
        //     const del_date_change = formattedDate !== prevOrderDetails.order_delivery_date_str
        //     const del_mode_change = orderdeliveryaddressmode !== prevOrderDetails.order_delivery_address_mode
        //     let text = ''
        //     if (del_date_change && del_mode_change) {
        //         text = `Delivery Date is Changed from ${prevOrderDetails.order_delivery_date_str} ${updatedOrderInfo.order_delivery_session ? updatedOrderInfo.order_delivery_session : updatedOrderInfo.order_delivery_time} to ${formattedDate} ${updatedOrderInfo.order_delivery_session ? updatedOrderInfo.order_delivery_session : updatedOrderInfo.order_delivery_time} and Delivery mode is changed from ${getModeName(Number(prevOrderDetails.order_delivery_address_mode))} to ${getModeName(Number(orderdeliveryaddressmode))} for the Order number ${prevOrderDetails.order_unique_id}`
        //     } else if (del_mode_change) {
        //         text = `Delivery mode is changed from ${getModeName(Number(prevOrderDetails.order_delivery_address_mode))} to ${getModeName(Number(orderdeliveryaddressmode))} for the Order number ${(prevOrderDetails.order_unique_id)}`
        //     } else if (del_date_change) {
        //         text = `Delivery Date is Changed from ${prevOrderDetails.order_delivery_date_str} ${updatedOrderInfo.order_delivery_session ? updatedOrderInfo.order_delivery_session : updatedOrderInfo.order_delivery_time} to ${formattedDate} ${updatedOrderInfo.order_delivery_session ? updatedOrderInfo.order_delivery_session : updatedOrderInfo.order_delivery_time} for the Order number ${prevOrderDetails.order_unique_id}`
        //     }
        //     let dept = []
        //     if (prevOrderDetails.f_order_prod_push_status === 2)
        //         dept.push("F")
        //     if (prevOrderDetails.fg_order_prod_push_status === 2)
        //         dept.push("FG")
        //     if (prevOrderDetails.cl_order_prod_push_status === 2)
        //         dept.push("CL")
        //     if (prevOrderDetails.roof_order_prod_push_status === 2)
        //         dept.push("ROOF")
        //     if (prevOrderDetails.j_order_prod_push_status === 2)
        //         dept.push("J")
        //     if (prevOrderDetails.gbi_order_prod_push_status === 2)
        //         dept.push("GBI")
        //     await postSystemMessage(req.user.user_ref_id, text, dept)
        // }
        res.status(200).send(updatedOrderInfo);
    } catch (err) {
        logError('updateSpecificOrderDetails', err, req.user.user_ref_id);
        res.status(500).send('Data Updation Failed.');
    }

};

exports.fetchSpecificOrderDesignImages = async (req, res) => {
  try {
    const orderMasID = new mongoose.Types.ObjectId(req.params.orderid);
    const ordDept = req.params.dept;

    let fieldToUpdate;
    switch (ordDept) {
      case "F":
        fieldToUpdate = "order_images_f";
        break;
      case "FG":
        fieldToUpdate = "order_images_fg";
        break;
      case "J":
        fieldToUpdate = "order_images_j";
        break;
      case "CL":
        fieldToUpdate = "order_images_cl";
        break;
      case "GBI":
        fieldToUpdate = "order_images_gbi";
        break;
      case "ROOF":
        fieldToUpdate = "order_images_roof";
        break;
      default:
        return res.status(500).send("Invalid department");
    }

    const orderInfo = await OrderMaster.findById(orderMasID).lean().exec();
    if (!orderInfo) {
      return res.status(500).send("Order not found");
    }

    const imageKeys = orderInfo[fieldToUpdate];
    const signedUrls = await Promise.all(
      imageKeys.map(async key => {
        const command = new GetObjectCommand({
          Bucket: "encore-sheet",
          Key: key,
        });
        const url = await getSignedUrl(s3Client, command, { expiresIn: 3600 }); // URL expires in 1 hour
        return { key, url };
      })
    );

    const response = {
      _id: orderInfo._id,
      order_unique_id: orderInfo.order_unique_id,
      imageUrls: signedUrls,
    };
    res.status(200).json(response);
  } catch (err) {
    logError("updateSpecificOrderDetails", err, req.user.user_ref_id);
    res.status(500).send("Data Fetching Failed.");
  }
};

exports.updateSpecificOrderDesignImages = async (req, res) => {
  try {
    const orderMasID = new mongoose.Types.ObjectId(req.params.orderid);
    let orderMasterInfo = await OrderMaster.findOne({ _id: orderMasID });
    let status = orderMasterInfo.order_status;
    if (status === "Order Cancelled") {
      return res.status(500).send("Cancelled Order. Please Recheck");
    }

    const ordDept = req.params.dept;
    let orderImages = [];
    if (req.files && req.files.length > 0) {
      orderImages = await Promise.all(
        req.files.map(async file => {
          const command = new GetObjectCommand({
            Bucket: "encore-sheet",
            Key: file.key,
          });
          const url = await getSignedUrl(s3Client, command, { expiresIn: 3600 }); // URL expires in 1 hour
          return { key: file.key, url };
        })
      );
    }

    let updateData;
    switch (ordDept) {
      case "F":
        updateData = { $addToSet: { order_images_f: { $each: orderImages.map(img => img.key) } } };
        break;
      case "FG":
        updateData = { $addToSet: { order_images_fg: { $each: orderImages.map(img => img.key) } } };
        break;
      case "J":
        updateData = { $addToSet: { order_images_j: { $each: orderImages.map(img => img.key) } } };
        break;
      case "CL":
        updateData = { $addToSet: { order_images_cl: { $each: orderImages.map(img => img.key) } } };
        break;
      case "GBI":
        updateData = { $addToSet: { order_images_gbi: { $each: orderImages.map(img => img.key) } } };
        break;
      case "ROOF":
        updateData = { $addToSet: { order_images_roof: { $each: orderImages.map(img => img.key) } } };
        break;
      default:
        return res.status(500).send("Invalid department");
    }

    const conditions = { _id: orderMasID };
    const updatedOrderInfo = await OrderMaster.findByIdAndUpdate(conditions, updateData, { new: true });
    res.status(200).send(updatedOrderInfo);
  } catch (err) {
    logError("updateSpecificOrderDesignImages", err, req.user.user_ref_id);
    res.status(500).send("Data Updation Failed.");
  }
};

exports.deleteSpecificOrderDesignImages = async (req, res) => {
  try {
    const orderMasID = new mongoose.Types.ObjectId(req.params.orderid);
    const imageIndex = parseInt(req.params.indexid); // Parse the index as an integer
    const ordDept = req.params.dept; // Use const for ordDept as it doesn't change
    let orderImagesField;

    const orderInfo = await OrderMaster.findById(orderMasID);
    if (!orderInfo) {
      return res.status(500).send("Order not found");
    }

    switch (ordDept) {
      case "F":
        orderImagesField = "order_images_f";
        break;
      case "FG":
        orderImagesField = "order_images_fg";
        break;
      case "CL":
        orderImagesField = "order_images_cl";
        break;
      case "J":
        orderImagesField = "order_images_j";
        break;
      case "GBI":
        orderImagesField = "order_images_gbi";
        break;
      case "ROOF":
        orderImagesField = "order_images_roof";
        break;
      default:
        return res.status(500).send("Invalid department");
    }

    const orderImages = orderInfo[orderImagesField];
    if (imageIndex >= orderImages.length || imageIndex < 0) {
      return res.status(500).send("Invalid image index");
    }
    const imageNameToDelete = orderImages[imageIndex];
    const deleteParams = {
      Bucket: "encore-sheet",
      Key: imageNameToDelete,
    };
    await s3Client.send(new DeleteObjectCommand(deleteParams));
    orderImages.splice(imageIndex, 1);
    orderInfo[orderImagesField] = orderImages;
    await orderInfo.save();
    res.status(200).send("Image deleted successfully");
  } catch (err) {
    logError("deleteSpecificOrderDesignImages", err, req.user.user_ref_id);
    res.status(500).send("Data Deletion Failed.");
  }
};

exports.fetchCustomerBasedOrderDetails = async (req, res) => {
  try {
    const limit = 30;
    const page = parseInt(req.query.page) || 0;
    const skip = page * limit;
    const searchKeyword = req.query.query;
    const CusID = new mongoose.Types.ObjectId(req.params.cusid);
    const searchFilter = {
      order_customer_id: CusID,
    };

    if (searchKeyword) {
      searchFilter.$or = [
        {
          $expr: {
            $or: [
              { $eq: ["$order_unique_id", searchKeyword] },
              {
                  $and: [
                  { $eq: ["$order_customer_UID", AWF_CUST_ID] },
                  { $eq: [{ $substr: ["$order_customer_PO_number", 0, 6] }, searchKeyword] }
                  ]
              }
            ]
          }
        }
      ];
    }

    const total_Orders_count = await OrderMaster.countDocuments(searchFilter);
    const Orders = await OrderMaster.aggregate([
      { $match: searchFilter },
      { $sort: { created: -1 } },
      {
        $lookup: {
          from: "accounts",
          localField: "order_customer_id",
          foreignField: "_id",
          as: "customerInfo",
        },
      },
      {
        $lookup: {
          from: "accountcontacts",
          localField: "order_customer_contact_id",
          foreignField: "_id",
          as: "customercontactInfo",
        },
      },
      { $unwind: { path: "$customerInfo", preserveNullAndEmptyArrays: true } },
      { $unwind: { path: "$customercontactInfo", preserveNullAndEmptyArrays: true } },
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
          order_delivery_address_mode: 1,
          order_delivery_address: 1,
          order_customer_contact_id: 1,
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
          order_Pieces: 1,
          order_Overall_Price: 1,
          order_status: 1,
          created: 1,
          account_ID: "$customerInfo._id",
          account_UID: "$customerInfo.account_UID",
          account_Name: "$customerInfo.account_Name",
          account_Address: "$customerInfo.account_Address",
          account_StoreAddress: "$customerInfo.account_StoreAddress",
          account_Contact_Email: "$customercontactInfo.account_Contact_Email",
          account_Contact_Phone: "$customercontactInfo.account_Contact_Phone",
          account_Contact_Name: {
            $concat: ["$customercontactInfo.account_Contact_FName", " ", "$customercontactInfo.account_Contact_LName"],
          },
        },
      },
      { $skip: skip },
      { $limit: limit },
    ]);

    const pages = Math.ceil(total_Orders_count / limit);
    const fullObj = {
      totalItems: total_Orders_count,
      fetchedItems: Orders,
      rowsPerPage: limit,
      totalPages: pages,
    };

    res.status(200).send(fullObj);
  } catch (err) {
    logError("fetchCustomerBasedOrderDetails", err, req.user.user_ref_id);
    res.status(500).send("Data Fetching Failed.");
  }
};

exports.addOrderItemDetails = async (req, res) => {
  try {
    const orderMasID = new mongoose.Types.ObjectId(req.params.orderid);
    let count_orders = await OrderItem.find();
    let count = 0;
    if (count_orders.length > 0) {
      count = count_orders.length;
    }
    count = count + 1;
    let str = "" + count;

    let mon = new Date();
    let da = new Date();
    let dateFunc = new Date();
    let month = String(mon.getMonth() + 1).padStart(2, "0");
    let day = String(da.getDate()).padStart(2, "0");
    let year = dateFunc.getFullYear();
    let finaleDate = year + "" + month + "" + day;

    let pad = "0000";
    let ans = pad.substring(0, pad.length - str.length) + str;
    let OrderItmID = finaleDate + ans;

    let orderMasDetails = await OrderMaster.find({ _id: orderMasID });
    const ordermasterid = orderMasID;
    const ordercustomerid = orderMasDetails[0].order_customer_id;
    const orderuniqueid = orderMasDetails[0].order_unique_id;
    const orderitemunique_id = OrderItmID;
    const orderitemmaterial = new mongoose.Types.ObjectId(req.body.order_item_material);
    const orderitemcolor = new mongoose.Types.ObjectId(req.body.order_item_color);
    const orderitemstatus = req.body.order_item_status;
    const orderitemdepartment = new mongoose.Types.ObjectId("6499669ffe5ad7e297e9aff8");

    let customerDetails = await Account.find({ _id: ordercustomerid });
    let customerName = customerDetails[0].account_Name;
    let customerAddress = customerDetails[0].account_Address;

    let materialDetails = await CoreProduct.find({ _id: orderitemmaterial });
    let materialName = materialDetails[0].core_Product_Name;
    let materialThickness = materialDetails[0].core_Product_Thickness;

    let colorDetails = await ProductColor.find({ _id: orderitemcolor });
    let colorName = colorDetails[0].product_Color;

    const orderItemData = new OrderItem({
      order_master_id: ordermasterid,
      order_unique_id: orderuniqueid,
      order_item_unique_id: orderitemunique_id,
      order_item_material: orderitemmaterial,
      order_item_color: orderitemcolor,
      order_item_price: 0,
      order_item_special_price: 0,
      order_item_status: orderitemstatus,
      order_item_department: orderitemdepartment,
    });
    const orderItemDataInfo = await orderItemData.save();

    //SQL Table Insertion
    if (orderItemDataInfo) {
      await sql.connect("Server=" + process.env.SQLServerName + "; Database=" + process.env.SQLDataBase + "; User Id=" + process.env.SQLUsername + "; Password=" + process.env.SQLPassword + "; Encrypt=true;Trusted_Connection=True; TrustServerCertificate=True;");
      const insert = await sql.query("insert into Jobs (JobID, JobName, Customer, Material, Colour, Thickness, AddressStreet) values ('" + orderitemunique_id + "', '" + orderuniqueid + "', '" + customerName + "', '" + materialName + "', '" + colorName + "', '" + materialThickness + "', '" + customerAddress + "')");
      console.dir(insert);
    }

    //Overall Price Calculation and Order Master Updation
    let orderItemDetails = await OrderItem.find({ order_master_id: orderMasID });
    let OrderItemCount = orderItemDetails.length;
    let overallPrice = 0;
    for (i = 0; i < OrderItemCount; i++) {
      overallPrice = parseFloat(overallPrice) + parseFloat(orderItemDetails[i].order_item_special_price);
    }
    let updateData = { $set: { order_Overall_Price: overallPrice } };
    let conditionstwo = { _id: orderMasID };
    await OrderMaster.findByIdAndUpdate(conditionstwo, updateData, attrs);
    res.status(200).send(orderItemDataInfo);
    res.end();
  } catch (err) {
    logError("addOrderItemDetails", err, req.user.user_ref_id);
    return res.status(500).send("Data Fetching Failed.");
  }
};

exports.fetchSpecificOrderItems = async (req, res) => {
  try {
    const orderMasID = new mongoose.Types.ObjectId(req.params.orderid);
    let orderItems = await OrderItem.aggregate([
      { $match: { $and: [{ order_master_id: orderMasID }] } },
      { $lookup: { from: "coreproducts", as: "materialsInfo", localField: "order_item_material", foreignField: "_id" } },
      { $lookup: { from: "productcolors", as: "colorInfo", localField: "order_item_color", foreignField: "_id" } },
      { $lookup: { from: "productgirths", as: "girthInfo", localField: "order_item_round_grith", foreignField: "_id" } },
      { $lookup: { from: "productfolds", as: "foldInfo", localField: "order_item_fold", foreignField: "_id" } },
      { $unwind: { path: "$materialsInfo", preserveNullAndEmptyArrays: true } },
      { $unwind: { path: "$colorInfo", preserveNullAndEmptyArrays: true } },
      { $unwind: { path: "$girthInfo", preserveNullAndEmptyArrays: true } },
      { $unwind: { path: "$foldInfo", preserveNullAndEmptyArrays: true } },
      {
        $project: {
          _id: 1,
          order_master_id: 1,
          order_unique_id: 1,
          order_item_unique_id: 1,
          order_item_exact_grith: 1,
          order_item_price: 1,
          order_item_special_price: 1,
          order_item_status: 1,
          core_Product_Name: "$materialsInfo.core_Product_Name",
          core_Product_Thickness: "$materialsInfo.core_Product_Thickness",
          core_Product_Ref_Id: "$materialsInfo.core_Product_Ref_Id",
          product_Color: "$colorInfo.product_Color",
          product_Color_Special_Price: "$colorInfo.product_Color_Special_Price",
          product_Girth: "$girthInfo.product_Girth",
          product_Fold: "$foldInfo.product_Fold",
        },
      },
    ]);
    res.send(orderItems).status(200).end();
  } catch (err) {
    logError("fetchSpecificOrderItems", err, req.user.user_ref_id);
    return res.status(500).send("Data Fetching Failed.");
  }
};

exports.fetchSpecificOrderItemDetails = async (req, res) => {
  try {
    const orderItemID = new mongoose.Types.ObjectId(req.params.orderitmid);
    let orderItemData = await OrderItem.find({ _id: orderItemID });
    res.send(orderItemData).status(200).end();
  } catch (err) {
    logError("fetchSpecificOrderItemDetails", err, req.user.user_ref_id);
    return res.status(500).send("Data Fetching Failed.");
  }
};

exports.updateSpecificOrderItemDetails = async (req, res) => {
  try {
    let dept_code = "F";
    const orderID = new mongoose.Types.ObjectId(req.params.orderid);
    const orderItemData = req.body;
    let OrderItemDetails = await OrderItem.find({ _id: orderID });
    let OrderMasterID = OrderItemDetails[0].order_master_id;
    let orderitemqtyprice = req.body.order_item_price;
    let total_special_price = "0";
    let discountPercentage = req.body.order_item_discount;
    let length = req.body.order_item_length;
    if (length < 1000) {
      length = 1000;
    }
    let discountedUP = 0;
    let discountedTA = 0;
    let discountedTP;

    let orderitemquantity = parseFloat(length / 1000) * parseFloat(req.body.order_item_pieces);
    total_special_price = parseFloat(orderitemqtyprice) * parseFloat(orderitemquantity);
    discountedTP = total_special_price;
    discountedUP = parseFloat(orderitemqtyprice);
    if (discountPercentage > 0) {
      discountedUP = parseFloat(orderitemqtyprice) - (parseFloat(orderitemqtyprice) * discountPercentage) / 100;
      discountedTP = parseFloat(discountedUP) * parseFloat(orderitemquantity);
      discountedTA = total_special_price - discountedTP;
    }

    orderItemData.order_item_code = req.body.order_item_code;
    orderItemData.order_item_quantity = orderitemquantity;
    orderItemData.order_item_special_price = discountedTP;
    orderItemData.order_item_special_price_original = total_special_price;
    orderItemData.order_item_discount = discountPercentage;
    orderItemData.order_item_discounted_amount = discountedTA;
    orderItemData.order_item_qty_discounted_price = discountedUP;
    let orderItemInfo = await OrderItem.findByIdAndUpdate(orderID, orderItemData, attrs);
    if (orderItemInfo) {
      await RecalculateOrderItemsCountFn(OrderMasterID);
      await RecalculateOverallOrderTotalFn(OrderMasterID);
      await RecalculateUserJobCountFn(OrderMasterID, dept_code);
    }
    res.status(200).send(orderItemInfo);
    res.end();
  } catch (err) {
    logError("updateSpecificOrderItemDetails", err, req.user.user_ref_id);
    return res.status(500).send("Data Updation Failed.");
  }
};

exports.fetchItemPrice = async (req, res) => {
  try {
    const Itemcode = req.params.itemcode;
    const regex = /^([A-Z]+)(\d+)G(\d+)F$/i;
    const match = Itemcode.match(regex);

    if (!match) {
      return res.status(500).json({ error: "Invalid item code format" });
    }

    const colorCode = match[1];
    const girth = parseInt(match[2], 10);
    const fold = match[3].toString();
    const customerObjId = new mongoose.Types.ObjectId(req.params.cusid);

    const colorInfo = await ProductColor.findOne({ product_Color_Code: colorCode });
    const coreMaterialObjId = new mongoose.Types.ObjectId(colorInfo.product_Core_Id);
    const colorName = colorInfo.product_Color;
    const materialInfo = await CoreProduct.findOne({ _id: coreMaterialObjId });
    const materialTickness = materialInfo.core_Product_Thickness;
    const materialCode = materialInfo.core_Product_Name;
    const girthInfo = await ProductGirth.findOne({ product_Girth: girth });
    const girthObjId = new mongoose.Types.ObjectId(girthInfo._id);
    const foldInfo = await ProductFold.findOne({ product_Fold: fold });
    const foldObjId = new mongoose.Types.ObjectId(foldInfo._id);
    const finalItemDescription = `${materialTickness} ${colorName} ${materialCode} ${girth}G/${fold}F`;

    const priceDetails = await CustomerMaterialPricebook.find({
      customer_ID: customerObjId,
      material_ID: coreMaterialObjId,
      girth_ID: girthObjId,
      fold_ID: foldObjId,
    }).lean();

    if (priceDetails.length > 0) {
      let colorSpecialPrice = colorInfo.product_Color_Special_Price;
      const modifiedPriceDetails = priceDetails.map(item => {
        let updatedPrice = parseFloat(item.price_Values);
        if (colorSpecialPrice > 0) {
          updatedPrice = updatedPrice * (1 + colorSpecialPrice / 100);
        }
        return {
          ...item,
          price_Values: updatedPrice.toFixed(2),
          finalItemDescription,
        };
      });
      res.status(200).json(modifiedPriceDetails);
    } else {
      res.status(500).json({ error: "Price Not Found Or Not Assigned. Please Check The Price Matrix!!!" });
    }
  } catch (err) {
    logError("fetchItemPrice", err, req.user.user_ref_id);
    return res.status(500).send("Data Fetching Failed.");
  }
};

exports.getGirthFoldFromDesignTool = async (req, res) => {
  try {
    const ordItemID = new mongoose.Types.ObjectId(req.params.orderid);
    const cusID = new mongoose.Types.ObjectId(req.params.cusid);

    let ordItem = await OrderItem.find({ _id: ordItemID });
    let JobID = ordItem[0].order_item_unique_id;
    let materialID = ordItem[0].order_item_material;
    let colorID = ordItem[0].order_item_color;

    await sql.connect("Server=" + process.env.SQLServerName + "," + process.env.SQLPort + "; Database=" + process.env.SQLDataBase + "; User Id=" + process.env.SQLUsername + "; Password=" + process.env.SQLPassword + "; Encrypt=true;Trusted_Connection=True; TrustServerCertificate=True;");
    const selectJob = await sql.query("select * from Jobs where JobID = '" + JobID + "'");
    if (selectJob) {
      let girth = selectJob.recordset[0].Width;
      let fold = selectJob.recordset[0].Folds;
      let foldID;
      let girthID;

      let FoldData = await ProductFold.find({ product_Fold: fold });
      if (FoldData.length) {
        foldID = FoldData[0]._id;
      } else {
        res.status(500).send("Fold Info Missing in Design Tool!!!");
      }

      let girthData = await ProductGirth.findOne({ product_Girth: { $gte: girth } });
      if (girthData) {
        girthID = girthData._id;
      } else {
        res.status(500).send("Girth Info Missing in Design Tool!!!");
      }

      if (foldID !== 0 && girthID !== 0) {
        let priceDetails = await CustomerMaterialPricebook.find({ customer_ID: cusID, material_ID: materialID, girth_ID: girthID, fold_ID: foldID });
        if (priceDetails.length && priceDetails[0].price_Values > 0) {
          let defaultmaterialPrice = priceDetails[0].price_Values;
          let materialPrice = priceDetails[0].price_Values;

          //Color Special Price Calculation
          let colorDetails = await ProductColor.find({ _id: colorID });
          let colorSpecialPrice = colorDetails[0].product_Color_Special_Price;
          if (colorSpecialPrice.length) {
            let colorSpecialValue = parseFloat(colorSpecialPrice) / 100;
            let specialPrice = parseFloat(materialPrice) + parseFloat(materialPrice) * parseFloat(colorSpecialValue);
            materialPrice = parseFloat(specialPrice);
          } else {
            console.log("No Color Special Price");
          }
          let updateData = { $set: { order_item_price: defaultmaterialPrice, order_item_special_price: materialPrice, order_item_exact_grith: girth, order_item_round_grith: girthID, order_item_fold: foldID } };
          let conditions = { _id: ordItemID };
          let updatedOrderItemInfo = await OrderItem.findByIdAndUpdate(conditions, updateData, attrs);
          res.status(200).send(updatedOrderItemInfo);
        } else {
          res.status(500).send("Price Not Yet Assigned For this Customer*Girth*Fold Combination. Kindly Recheck And Assign Price");
        }
      } else {
        res.status(500).send("GirthID or FoldID Missing!!!");
      }
    } else {
      res.status(500).send("Data Not Retrieved From Design Tool DB");
    }
  } catch (err) {
    logError("getGirthFoldFromDesignTool", err, req.user.user_ref_id);
    return res.status(500).send("Data Fetching Failed.");
  }
};

exports.orderInvoiceDetails = async (req, res) => {
  try {
    const ordMasID = new mongoose.Types.ObjectId(req.params.orderid);
    let OrdInvoiceObj = {};
    let OrderMasterArray = [];
    let OrderMasterObj = {};
    let orderMasterData = await OrderMaster.aggregate([
      { $match: { $and: [{ _id: ordMasID }] } },
      { $lookup: { from: "accounts", as: "customerInfo", localField: "order_customer_id", foreignField: "_id" } },
      { $lookup: { from: "accountcontacts", as: "customerContactInfo", localField: "order_customer_contact_id", foreignField: "_id" } },
      { $unwind: { path: "$customerInfo", preserveNullAndEmptyArrays: true } },
      { $unwind: { path: "$customerContactInfo", preserveNullAndEmptyArrays: true } },
      {
        $project: {
          _id: 1,
          order_unique_id: 1,
          order_invoice_id: 1,
          order_delivery_date: 1,
          order_Overall_Price: 1,
          order_Pieces: 1,
          order_customer_id: 1,
          order_customer_contact_id: 1,
          order_status: 1,
          order_customer_PO_number: 1,
          order_delivery_address_mode: 1,
          order_delivery_address: 1,
          order_Customer_UID: "$customerInfo.account_UID",
          order_Customer_Name: "$customerInfo.account_Name",
          order_Customer_Address: "$customerInfo.account_Address",
          order_Customer_StoreAddress: "$customerInfo.account_StoreAddress",
          order_Customer_Contact_Fname: "$customerContactInfo.account_Contact_FName",
          order_Customer_Contact_Lname: "$customerContactInfo.account_Contact_LName",
          order_Customer_Contact_Email: "$customerContactInfo.account_Contact_Email",
          order_Customer_Contact_Phone: "$customerContactInfo.account_Contact_Phone",
        },
      },
    ]);

    OrderMasterObj.OrderMasterInfo = orderMasterData;
    OrderMasterArray.push(OrderMasterObj);
    OrdInvoiceObj.OrderMaster = OrderMasterArray;
    let OrderItemArray = [];
    let OrderItemObj = {};
    let orderItemData = await OrderItem.aggregate([
      { $match: { $and: [{ order_master_id: ordMasID }] } },
      { $lookup: { from: "coreproducts", as: "materialsInfo", localField: "order_item_material", foreignField: "_id" } },
      { $lookup: { from: "productcolors", as: "colorInfo", localField: "order_item_color", foreignField: "_id" } },
      { $lookup: { from: "productgirths", as: "girthInfo", localField: "order_item_round_grith", foreignField: "_id" } },
      { $lookup: { from: "productfolds", as: "foldInfo", localField: "order_item_fold", foreignField: "_id" } },
      { $unwind: { path: "$materialsInfo", preserveNullAndEmptyArrays: true } },
      { $unwind: { path: "$colorInfo", preserveNullAndEmptyArrays: true } },
      { $unwind: { path: "$girthInfo", preserveNullAndEmptyArrays: true } },
      { $unwind: { path: "$foldInfo", preserveNullAndEmptyArrays: true } },
      {
        $project: {
          _id: 1,
          order_master_id: 1,
          order_unique_id: 1,
          order_item_unique_id: 1,
          order_item_exact_grith: 1,
          order_item_price: 1,
          order_item_special_price: 1,
          order_item_status: 1,
          core_Product_Name: "$materialsInfo.core_Product_Name",
          core_Product_Thickness: "$materialsInfo.core_Product_Thickness",
          core_Product_Ref_Id: "$materialsInfo.core_Product_Ref_Id",
          product_Color: "$colorInfo.product_Color",
          product_Color_Special_Price: "$colorInfo.product_Color_Special_Price",
          product_Girth: "$girthInfo.product_Girth",
          product_Fold: "$foldInfo.product_Fold",
        },
      },
    ]);

    OrderItemObj.OrderItemInfo = orderItemData;
    OrderItemArray.push(OrderItemObj);
    OrdInvoiceObj.OrderItems = OrderItemArray;
    res.send(OrdInvoiceObj).status(200).end();
  } catch (err) {
    logError("orderInvoiceDetails", err, req.user.user_ref_id);
    res.status(500).send("Data Fetching Failed.");
  }
};

//POST PRODUCTION SWI FETCH
exports.fetchOrderSubItemsFromDesignTool = async (req, res) => {
    //code change by Rahul
    //  let sqlConnection;
    let orderItemSummary;

    const ordMasID = new mongoose.Types.ObjectId(req.params.orderid);
    let ordMasDetails = await OrderMaster.find({ _id: ordMasID });
    let dept_code = "F"

    // let ordMasUID = ordMasDetails[0].order_unique_id;
    // let ordCusID = ordMasDetails[0].order_customer_id;
    // let ordDesignerID = ordMasDetails[0].order_designed_person;
    // let ordF_ProdStatus = ordMasDetails[0].f_order_prod_push_status;

    const aggregationPipeline = [
        { $match: { $and: [{ "order_master_id": ordMasID }] } },
        { $lookup: { from: "coreproducts", as: "materialsInfo", localField: "order_item_material", foreignField: "_id" } },
        { $lookup: { from: "productcolors", as: "colorInfo", localField: "order_item_color", foreignField: "_id" } },
        { $lookup: { from: "productgirths", as: "girthInfo", localField: "order_item_round_grith", foreignField: "_id" } },
        { $lookup: { from: "productfolds", as: "foldInfo", localField: "order_item_fold", foreignField: "_id" } },
        { $lookup: { from: "departments", as: "departments", localField: "order_item_me_department", foreignField: "_id" } },
        { $unwind: { path: "$departments", preserveNullAndEmptyArrays: true } },
        { $unwind: { path: "$materialsInfo", preserveNullAndEmptyArrays: true } },
        { $unwind: { path: "$colorInfo", preserveNullAndEmptyArrays: true } },
        { $unwind: { path: "$girthInfo", preserveNullAndEmptyArrays: true } },
        { $unwind: { path: "$foldInfo", preserveNullAndEmptyArrays: true } },

        {
            $project: {
                _id: 1,
                order_master_id: 1,
                order_unique_id: 1,
                order_item_unique_id: 1,
                order_item_exact_grith: 1,
                order_item_exact_fold: 1,
                order_item_price: 1,
                order_item_qty_price: 1,
                order_item_special_price: 1,
                order_item_special_price_original: 1,
                order_item_code: 1,
                order_item_description: 1,
                order_item_quantity: 1,
                order_item_pieces: 1,
                order_item_length: 1,
                order_item_flag: 1,
                order_item_designer: 1,
                order_item_shape_id: 1,
                core_Product_Name: "$materialsInfo.core_Product_Name",
                core_Product_Thickness: "$materialsInfo.core_Product_Thickness",
                core_Product_Ref_Id: "$materialsInfo.core_Product_Ref_Id",
                product_Color: "$colorInfo.product_Color",
                product_Color_Hex_Code: "$colorInfo.product_Color_Hex_Code",
                product_Color_Special_Price: "$colorInfo.product_Color_Special_Price",
                product_Girth: "$girthInfo.product_Girth",
                product_Fold: "$foldInfo.product_Fold",
                departments: "$departments.department_name"
            }
        }
    ];

   // try {
    //     sqlConnection = await sql.connect("Server=" + process.env.SQLServerName + "; Database=" + process.env.SQLDataBase + "; User Id=" + process.env.SQLUsername + "; Password=" + process.env.SQLPassword + "; Encrypt=true;Trusted_Connection=True; TrustServerCertificate=True;");
    // } catch (sqlError) {
    //     console.error("Connection Failed");
    orderItemSummary = await OrderItem.aggregate(aggregationPipeline);
    
    const orderNumber = ordMasDetails[0].order_unique_id;
    const templates = await Template.find({ orderNumber});
    if (templates.length === 0) {
      console.log("No templates found for order:", orderNumber, ". Returning existing order items.");
      return res.send(orderItemSummary).status(200).end();
    }
    const jobIdCount = templates?.reduce((acc, item) => {
      return acc + (item?.swiJobIds?.length || 0);
    }, 0);
    console.log("Total Job IDs count from templates:", jobIdCount, "for order:", orderItemSummary?.length);
    if (orderItemSummary?.length !== jobIdCount) {
      console.log("Mismatch in order items and job IDs count. Fetching sub-items from design tool.");
      logError("fetchOrderSubItemsFromDesignTool", new Error(`Mismatch in order items and job IDs count for order ${orderNumber}`), req.user.user_ref_id);
      orderItemSummary = (await fetchOrderSubItemsFromDesignToolFn(ordMasID, templates))
      if (orderItemSummary?.errorMessage) {
        console.error("Error fetching sub-items from design tool:", orderItemSummary.errorMessage);
        return res.status(500).send(orderItemSummary.errorMessage);
      }
    }
    else {
      await RecalculateOverallOrderTotalFn(ordMasID);
      await RecalculateOrderItemsCountFn(req.params.orderid);
      await RecalculateUserJobCountFn(req.params.orderid, dept_code);
    }

    // Sort line items by templates order and their swiJobIds order
    if (templates.length > 0 && Array.isArray(orderItemSummary)) {
      const jobIdOrder = {};
      let orderIndex = 0;
      for (const template of templates) {
        if (template.swiJobIds && Array.isArray(template.swiJobIds)) {
          for (const jobId of template.swiJobIds) {
            jobIdOrder[jobId.toString()] = orderIndex++;
          }
        }
      }
      orderItemSummary.sort((a, b) => {
        const indexA = jobIdOrder[a.order_item_unique_id?.toString()] ?? Number.MAX_SAFE_INTEGER;
        const indexB = jobIdOrder[b.order_item_unique_id?.toString()] ?? Number.MAX_SAFE_INTEGER;
        return indexA - indexB;
      });
    }

    return res.send(orderItemSummary).status(200).end();

    //code change by Rahul
    // if (sqlConnection) {
    //     try {
    //         if (ordF_ProdStatus === 2) {
    //             console.error("Flashing. Moved To Prod");
    //             orderItemSummary = await OrderItem.aggregate(aggregationPipeline);
    //             res.send(orderItemSummary).status(200).end();
    //             console.log("Flashing Moved To Prod. Existing Order Items Fetched Successfully");
    //         } else {
    //             const selectJobs = await sql.query("select * from Jobs where JobName = '" + ordMasUID + "'ORDER BY JobID ASC");
    //             const orderItemsToInsert = [];
    //             let index = 0
    //             let totalSubOrderPrice = 0;

    //             for (const job of selectJobs.recordset) {
    //                 let ordItemMaterialDetails = await CoreProduct.find({ core_Product_Name: job.Material.trim() });
    //                 if (!Array.isArray(ordItemMaterialDetails) || !ordItemMaterialDetails.length) {
    //                     return res.status(404).send("SWI Selected Material Not Found in CRM!");
    //                 }

    //                 let ordItemMaterial = ordItemMaterialDetails[0]._id;
    //                 let ordItemMaterialObj = new mongoose.Types.ObjectId(ordItemMaterialDetails[0]._id);
    //                 let orderMaterialCode = ordItemMaterialDetails[0].core_Product_Ref_Id;
    //                 let orderMaterialTickness = ordItemMaterialDetails[0].core_Product_Thickness;

    //                 let ordItemProdColorDetails = await ProductColor.find({ product_Color: job.Colour, product_Core_Id: ordItemMaterialObj });
    //                 if (!Array.isArray(ordItemProdColorDetails) || !ordItemProdColorDetails.length) {
    //                     return res.status(404).send("SWI Selected Color Not Found in CRM!");
    //                 }

    //                 let ordItemProdColor = ordItemProdColorDetails[0]._id;
    //                 let ColorCode = ordItemProdColorDetails[0].product_Color_Code;
    //                 let Color = ordItemProdColorDetails[0].product_Color;

    //                 let shapeID = job.ShapeID;

    //                 // Girth Calculation
    //                 let girth = job.Width;
    //                 let exact_girth = job.Width;
    //                 if (girth > 1200) {
    //                     girth = 1200;
    //                 }
    //                 let roundedGirthID;
    //                 let girthData = await ProductGirth.findOne({ product_Girth: { $gte: girth } });
    //                 if (girthData) {
    //                     roundedGirthID = girthData._id;
    //                 }
    //                 let GirthCode = girthData.product_Girth;

    //                 // Folds Calculation
    //                 let FinalFold = 0;
    //                 let NormalFold = job.Folds;
    //                 let SquashFold = job.SquashFolds;
    //                 FinalFold = parseInt(NormalFold) + parseInt(SquashFold);
    //                 let ExactFinalFold = parseInt(NormalFold) + parseInt(SquashFold);
    //                 if (FinalFold > 10) {
    //                     FinalFold = 10;
    //                 }
    //                 let ordItemFoldDetails = await ProductFold.find({ product_Fold: FinalFold });
    //                 let ordItemFold = ordItemFoldDetails[0]._id;
    //                 let FoldCode = ordItemFoldDetails[0].product_Fold;
    //                 let finalItemCode = ColorCode + "" + GirthCode + "G" + FoldCode + "F";
    //                 let finalItemDesciption = orderMaterialTickness + " " + Color + " " + orderMaterialCode + " " + GirthCode + "G/" + FoldCode + "F";
    //                 let priceDetails = await CustomerMaterialPricebook.find({ customer_ID: ordCusID, material_ID: ordItemMaterial, girth_ID: roundedGirthID, fold_ID: ordItemFold });
    //                 let defaultmaterialPrice;
    //                 let materialPrice;
    //                 let qtyAddedDefaultmaterialPrice;
    //                 let qtyAddedMaterialPrice;
    //                 let orderPieces;
    //                 let joblength = job.Length;
    //                 if (joblength < 1000) {
    //                     joblength = 1000;
    //                 }

    //                 if (priceDetails.length) {
    //                     defaultmaterialPrice = priceDetails[0].price_Values;
    //                     materialPrice = priceDetails[0].price_Values;
    //                     //orderPieces = parseFloat(job.Quantity) * parseFloat((job.Length / 1000));
    //                     orderPieces = parseFloat(job.Quantity) * parseFloat((joblength / 1000));

    //                     qtyAddedDefaultmaterialPrice = parseFloat(defaultmaterialPrice) * (orderPieces);
    //                     qtyAddedMaterialPrice = parseFloat(defaultmaterialPrice) * (orderPieces);

    //                     // Color Special Price Calculation
    //                     let colorDetails = await ProductColor.find({ _id: ordItemProdColor });
    //                     let colorSpecialPrice = colorDetails[0].product_Color_Special_Price;
    //                     if (colorSpecialPrice > 0) {
    //                         var specialPrice = parseFloat(qtyAddedMaterialPrice) + (parseFloat(qtyAddedMaterialPrice) * parseFloat(colorSpecialPrice) / 100);
    //                         qtyAddedMaterialPrice = parseFloat(specialPrice);
    //                         totalSubOrderPrice = totalSubOrderPrice + qtyAddedMaterialPrice;
    //                     } else {
    //                         totalSubOrderPrice = totalSubOrderPrice + qtyAddedMaterialPrice;
    //                     }
    //                 } else {
    //                     res.status(400).send("Price Not Yet Assigned For this Customer*Girth*Fold Combination. Kindly Recheck And Assign Price");
    //                     return;
    //                 }

    //                 //Row Index Calculations
    //                 const OrderCustomItems = await OrderItemManual.find({ order_master_me_id: ordMasID });
    //                 const orderRowIndexes = [
    //                     ...OrderCustomItems.map(item => item.order_row_index)
    //                 ];
    //                 const LargestIndex = orderRowIndexes.length > 0 ? Math.max(...orderRowIndexes) : 0;
    //                 if(index === 0){
    //                     if(LargestIndex === 0){
    //                         index = LargestIndex + 1;
    //                     }else {
    //                        index = LargestIndex + 1;
    //                     }
    //                 }else {
    //                     index++
    //                 }

    //                 orderItemsToInsert.push({
    //                     order_row_index: index,
    //                     order_master_id: ordMasID,
    //                     order_unique_id: ordMasUID,
    //                     order_item_unique_id: job.JobID,
    //                     order_item_material: ordItemMaterial,
    //                     order_item_color: ordItemProdColor,
    //                     order_item_exact_grith: exact_girth,
    //                     order_item_round_grith: roundedGirthID,
    //                     order_item_exact_fold: ExactFinalFold,
    //                     order_item_fold: ordItemFold,
    //                     order_item_length: job.Length,
    //                     order_item_quantity: orderPieces,
    //                     order_item_pieces: job.Quantity,
    //                     order_item_price: defaultmaterialPrice,
    //                     order_item_qty_price: qtyAddedDefaultmaterialPrice,
    //                     order_item_special_price: qtyAddedMaterialPrice,
    //                     order_item_special_price_original : qtyAddedMaterialPrice,
    //                     order_item_code: finalItemCode,
    //                     order_item_description: finalItemDesciption,
    //                     order_item_flag: "DT",
    //                     order_item_designer: ordDesignerID,
    //                     order_item_shape_id: shapeID,
    //                 });
    //             }

    //             const session = await mongoose.startSession();
    //             session.startTransaction();

    //             try {
    //                 await OrderItem.bulkWrite([
    //                     {
    //                         deleteMany: {
    //                             filter: { order_master_id: ordMasID, order_item_flag: "DT" }
    //                         }
    //                     },
    //                     ...orderItemsToInsert.map(item => ({
    //                         insertOne: {
    //                             document: item
    //                         }
    //                     }))
    //                 ], { session });

    //                 await session.commitTransaction();
    //                 console.log("Deleted and Inserted Order Items Successfully");
    //                 orderItemSummary = await OrderItem.aggregate(aggregationPipeline);
    //                 res.send(orderItemSummary).status(200).end();
    //             } catch (error) {
    //                 await session.abortTransaction();
    //                 console.error(error);
    //                 orderItemSummary = await OrderItem.aggregate(aggregationPipeline);
    //                 res.send(orderItemSummary).status(200).end();
    //             } finally {
    //                 session.endSession();
    //             }
    //         }

    //         // Manual Entry Price Calculation
    //         let RecalculateOverallOrderTotal = await RecalculateOverallOrderTotalFn(ordMasID);
    //         let RecalculateOrderItemsCount = await RecalculateOrderItemsCountFn(req.params.orderid);
    //         let RecalculateUserJobCount = await RecalculateUserJobCountFn(req.params.orderid, dept_code);
            
    //     } catch (error) {
    //         console.log(error);
    //         logError('fetchOrderSubItemsFromDesignTool', error);
    //         res.status(500).send("Server Error");
    //     }
    // }
    //code change by Rahul
};  

const fetchOrderSubItemsFromDesignToolFn = async (id, templates = []) => {
  console.error("Refetch from SWI");
  let sqlConnection;
  let orderItemSummary;
  let index = 0;

  const ordMasID = new mongoose.Types.ObjectId(id);
  let ordMasDetails = await OrderMaster.find({ _id: ordMasID });
  let dept_code = "F";

  let ordMasUID = ordMasDetails[0].order_unique_id;
  let ordCusID = ordMasDetails[0].order_customer_id;
  let ordDesignerID = ordMasDetails[0].order_designed_person;
  let ordF_ProdStatus = ordMasDetails[0].f_order_prod_push_status;
  let orderUniqueId = computeOrderFields(ordMasDetails[0]).order_unique_id

  try {
    sqlConnection = await sql.connect(config);
  } catch (sqlError) {
    const err = new Error("Failed To Connect SWI DataBase. Please Check Connection and Credentials in .ENV");
    logError("fetchOrderSubItemsFromDesignToolManually", err);
    console.error("Connection Failed");
    orderItemSummary = await OrderItem.aggregate([
      { $match: { $and: [{ order_master_id: ordMasID }] } },
      { $lookup: { from: "coreproducts", as: "materialsInfo", localField: "order_item_material", foreignField: "_id" } },
      { $lookup: { from: "productcolors", as: "colorInfo", localField: "order_item_color", foreignField: "_id" } },
      { $lookup: { from: "productgirths", as: "girthInfo", localField: "order_item_round_grith", foreignField: "_id" } },
      { $lookup: { from: "productfolds", as: "foldInfo", localField: "order_item_fold", foreignField: "_id" } },
      { $unwind: { path: "$materialsInfo", preserveNullAndEmptyArrays: true } },
      { $unwind: { path: "$colorInfo", preserveNullAndEmptyArrays: true } },
      { $unwind: { path: "$girthInfo", preserveNullAndEmptyArrays: true } },
      { $unwind: { path: "$foldInfo", preserveNullAndEmptyArrays: true } },
      {
        $project: {
          _id: 1,
          order_master_id: 1,
          order_unique_id: 1,
          order_item_unique_id: 1,
          order_item_exact_grith: 1,
          order_item_exact_fold: 1,
          order_item_price: 1,
          order_item_qty_price: 1,
          order_item_special_price: 1,
          order_item_special_price_original: 1,
          order_item_code: 1,
          order_item_description: 1,
          order_item_quantity: 1,
          order_item_pieces: 1,
          order_item_length: 1,
          order_item_flag: 1,
          order_item_department: 1,
          order_item_sub_department: 1,
          order_item_designer: 1,
          order_design_stage: 1,
          order_item_shape_id: 1,
          core_Product_Name: "$materialsInfo.core_Product_Name",
          core_Product_Thickness: "$materialsInfo.core_Product_Thickness",
          core_Product_Ref_Id: "$materialsInfo.core_Product_Ref_Id",
          product_Color: "$colorInfo.product_Color",
          product_Color_Special_Price: "$colorInfo.product_Color_Special_Price",
          product_Girth: "$girthInfo.product_Girth",
          product_Fold: "$foldInfo.product_Fold",
        },
      },
    ]);
  }

  if (sqlConnection) {
    try {
      const selectJobs = await sql.query("select Material, Colour, ShapeID, Width,Folds, SquashFolds, Length, Quantity, JobID from Jobs where JobName = '" + orderUniqueId + "'ORDER BY JobID ASC");
      await OrderItem.deleteMany({ order_master_id: ordMasID, order_item_flag: "DT" });
      let subordersCount;
      subordersCount = selectJobs.recordset.length;

      let totalSubOrderPrice = 0;
      for (i = 0; i < subordersCount; i++) {
        let ordItemMaterialDetails = await CoreProduct.find({ core_Product_Name: selectJobs.recordset[i].Material.trim() });
        if (!Array.isArray(ordItemMaterialDetails) || !ordItemMaterialDetails.length) {
          const err = new Error("SWI Tool Selected Material Missing in CRM");
          logError("fetchOrderSubItemsFromDesignToolManually", err);
          return { errorMessage: "SWI Selected Material Not Found in CRM!" };
        }

        let ordItemMaterial = ordItemMaterialDetails[0]._id;
        let ordItemMaterialObj = new mongoose.Types.ObjectId(ordItemMaterialDetails[0]._id);
        let orderMaterialCode = ordItemMaterialDetails[0].core_Product_Ref_Id;
        let orderMaterialTickness = ordItemMaterialDetails[0].core_Product_Thickness;

        let ordItemProdColorDetails = await ProductColor.find({ product_Color: selectJobs.recordset[i].Colour, product_Core_Id: ordItemMaterialObj });
        if (!Array.isArray(ordItemProdColorDetails) || !ordItemProdColorDetails.length) {
          const err = new Error("SWI Tool Selected Color Missing in CRM");
          logError("fetchOrderSubItemsFromDesignToolManually", err);
          return { errorMessage: "SWI Selected Color Not Found in CRM!" };
        }
        const isGalvanised = selectJobs.recordset[i].Material.toUpperCase().includes("GALVANISED");
        const maxGirthValue = isGalvanised ? 1220 : 1203;

        let ordItemProdColor = ordItemProdColorDetails[0]._id;
        let ColorCode = ordItemProdColorDetails[0].product_Color_Code;
        let Color = ordItemProdColorDetails[0].product_Color;

        let shapeID = selectJobs.recordset[i].ShapeID;
        let girth = selectJobs.recordset[i].Width;
        let exact_girth = selectJobs.recordset[i].Width;
        if (typeof exact_girth === 'string' && exact_girth.includes('.')) {
          exact_girth = Math.ceil(parseFloat(exact_girth));
        } else if (typeof exact_girth === 'string') {
          exact_girth = parseInt(exact_girth, 10);
        } else if (typeof exact_girth === 'number' && !Number.isInteger(exact_girth)) {
          exact_girth = Math.ceil(exact_girth);
        }

        // Normalize girth to 1200 if within tolerance range based on material type
        // Galvanised: 1200-1220 → 1200, Others: 1200-1203 → 1200
        if (isGalvanised && girth >= 1200 && girth <= 1220) {
          girth = 1200;
        } else if (!isGalvanised && girth >= 1200 && girth <= 1203) {
          girth = 1200;
        }

        let maxGirthData;
        if (girth > maxGirthValue) {
          girth = 1200;
          maxGirthData = await ProductGirth.findOne({product_Girth: {$gte: selectJobs.recordset[i].Length}}).sort({ product_Girth: 1 });
        }

        const girthData = await ProductGirth.findOne({ product_Girth: { $gte: girth } }).sort({ product_Girth: 1 });
        if (!girthData) {
          throw new Error(`ProductGirth not found for girth >= ${girth}`);
        }
        const roundedGirthID = girthData._id;
        let GirthCode = girthData.product_Girth;
        if (maxGirthData) {
          GirthCode = maxGirthData.product_Girth;
          girth = maxGirthData.product_Girth;
        }

        let FinalFold = 0;
        let NormalFold = selectJobs.recordset[i].Folds;
        let SquashFold = selectJobs.recordset[i].SquashFolds;
        FinalFold = parseInt(NormalFold)
        let ExactFinalFold = parseInt(NormalFold)

        const jobID = selectJobs.recordset[i].JobID;
        const templateForJob = templates.find(template =>
          Array.isArray(template.swiJobIds) && template.swiJobIds.includes(jobID)
        );
        // Get angles array from template
        const angles = Array.isArray(templateForJob?.angles) ? templateForJob.angles : [];
        const hasFlatAngles = angles.some(angle => {
          const absAngle = Math.abs(angle);
          return absAngle >= 170 && absAngle <= 180;
        });

        if (hasFlatAngles) {
          FinalFold += 1;
          ExactFinalFold += 1;
        }

        if (FinalFold > 10) {
          FinalFold = 10;
        }
        let ordItemFoldDetails = await ProductFold.find({ product_Fold: FinalFold });
        let ordItemFold = ordItemFoldDetails[0]._id;
        let FoldCode = ordItemFoldDetails[0].product_Fold;
        let finalItemCode = ColorCode + "" + GirthCode + "G" + FoldCode + "F";
        let finalItemDesciption = orderMaterialTickness + " " + Color + " " + orderMaterialCode + " " + GirthCode + "G/" + FoldCode + "F";
        let priceDetails = await CustomerMaterialPricebook.find({ customer_ID: ordCusID, material_ID: ordItemMaterial, girth_ID: roundedGirthID, fold_ID: ordItemFold });
        let defaultmaterialPrice;
        let materialPrice;
        let qtyAddedDefaultmaterialPrice;
        let qtyAddedMaterialPrice;
        let orderPieces;
        let joblength = selectJobs.recordset[i].Length;
        if (joblength < 1000) {
          joblength = 1000;
        }

        if (priceDetails.length) {
          defaultmaterialPrice = priceDetails[0].price_Values;

          // Color Special Price Calculation
          let colorDetails = await ProductColor.find({ _id: ordItemProdColor });
          let colorSpecialPrice = colorDetails[0].product_Color_Special_Price;
          if (colorSpecialPrice > 0) {
            defaultmaterialPrice = parseFloat(defaultmaterialPrice) + (parseFloat(defaultmaterialPrice) * parseFloat(colorSpecialPrice)) / 100;
          }

          materialPrice = priceDetails[0].price_Values;
          // Normalize job length to minimum 1000mm
          let joblength = selectJobs.recordset[i].Length < 1000 ? 1000 : selectJobs.recordset[i].Length;
          const totalLength = exact_girth > maxGirthValue ? exact_girth : joblength;
          orderPieces = parseFloat(selectJobs.recordset[i].Quantity) * parseFloat(totalLength / 1000);
          qtyAddedDefaultmaterialPrice = parseFloat(defaultmaterialPrice) * orderPieces;
          qtyAddedMaterialPrice = parseFloat(defaultmaterialPrice) * orderPieces;
        } else {
          const err = new Error("Customer Price Assignment Missing In CRM");
          logError("fetchOrderSubItemsFromDesignToolManually", err);
          return { errorMessage: "Price Not Yet Assigned For this Customer*Girth*Fold Combination. Kindly Recheck And Assign Price" };
        }

        const OrderCustomItems = await OrderItemManual.find({ order_master_me_id: ordMasID });
        const orderRowIndexes = [...OrderCustomItems.map(item => item.order_row_index)];
        const LargestIndex = orderRowIndexes.length > 0 ? Math.max(...orderRowIndexes) : 0;
        if (index === 0) {
          if (LargestIndex === 0) {
            index = LargestIndex + 1;
          } else {
            index = LargestIndex + 1;
          }
        } else {
          index++;
        }

        const orderItemData = new OrderItem({
          order_row_index: index,
          order_master_id: ordMasID,
          order_unique_id: ordMasUID,
          order_item_unique_id: selectJobs.recordset[i].JobID,
          order_item_material: ordItemMaterial,
          order_item_color: ordItemProdColor,
          order_item_exact_grith: exact_girth,
          order_item_round_grith: roundedGirthID,
          order_item_exact_fold: ExactFinalFold,
          order_item_fold: ordItemFold,
          order_item_length: exact_girth > maxGirthValue ? exact_girth : selectJobs.recordset[i].Length,
          order_item_quantity: orderPieces,
          order_item_pieces: selectJobs.recordset[i].Quantity,
          order_item_price: defaultmaterialPrice,
          order_item_qty_price: qtyAddedDefaultmaterialPrice,
          order_item_special_price: qtyAddedMaterialPrice,
          order_item_special_price_original: qtyAddedMaterialPrice,
          order_item_code: finalItemCode,
          order_item_description: finalItemDesciption,
          order_item_designer: ordDesignerID,
          order_item_shape_id: shapeID,
        });
        const orderItemDataInfo = await orderItemData.save();
        if (orderItemDataInfo) {
          orderItemSummary = await OrderItem.aggregate([
            { $match: { $and: [{ order_master_id: ordMasID }] } },
            { $lookup: { from: "coreproducts", as: "materialsInfo", localField: "order_item_material", foreignField: "_id" } },
            { $lookup: { from: "productcolors", as: "colorInfo", localField: "order_item_color", foreignField: "_id" } },
            { $lookup: { from: "productgirths", as: "girthInfo", localField: "order_item_round_grith", foreignField: "_id" } },
            { $lookup: { from: "productfolds", as: "foldInfo", localField: "order_item_fold", foreignField: "_id" } },
            { $unwind: { path: "$materialsInfo", preserveNullAndEmptyArrays: true } },
            { $unwind: { path: "$colorInfo", preserveNullAndEmptyArrays: true } },
            { $unwind: { path: "$girthInfo", preserveNullAndEmptyArrays: true } },
            { $unwind: { path: "$foldInfo", preserveNullAndEmptyArrays: true } },
            {
              $project: {
                _id: 1,
                order_master_id: 1,
                order_unique_id: 1,
                order_item_unique_id: 1,
                order_item_exact_grith: 1,
                order_item_exact_fold: 1,
                order_item_price: 1,
                order_item_qty_price: 1,
                order_item_special_price: 1,
                order_item_special_price_original: 1,
                order_item_code: 1,
                order_item_description: 1,
                order_item_quantity: 1,
                order_item_pieces: 1,
                order_item_length: 1,
                order_item_flag: 1,
                order_item_designer: 1,
                order_item_shape_id: 1,
                core_Product_Name: "$materialsInfo.core_Product_Name",
                core_Product_Thickness: "$materialsInfo.core_Product_Thickness",
                core_Product_Ref_Id: "$materialsInfo.core_Product_Ref_Id",
                product_Color: "$colorInfo.product_Color",
                product_Color_Special_Price: "$colorInfo.product_Color_Special_Price",
                product_Girth: "$girthInfo.product_Girth",
                product_Fold: "$foldInfo.product_Fold",
              },
            },
          ]);
        }
      }

      await RecalculateOverallOrderTotalFn(ordMasID);
      await RecalculateOrderItemsCountFn(ordMasID);
      await RecalculateUserJobCountFn(ordMasID, dept_code);
      return orderItemSummary;
    } catch (err) {
      logError("fetchOrderSubItemsFromDesignToolManually", err);
    }
  }
};

exports.addManualEntryOrderItem = async (req, res) => {
  try {
    const orderMasID = new mongoose.Types.ObjectId(req.params.orderid);
    let ordMasDetails = await OrderMaster.find({ _id: orderMasID });
    let ordMasUID = ordMasDetails[0].order_unique_id;

    let orderMasterInfo = await OrderMaster.findOne({ _id: orderMasID });
    let status = orderMasterInfo.order_status;
    let ordStr = orderMasterInfo.order_unique_id;
    if (status === "Order Cancelled") {
      const err = new Error("Attempt To Add In Cancelled Order " + ordStr + " Line Item");
      logError("addManualEntryOrderItem", err, req.user.user_ref_id);
      return res.status(500).send("Cancelled Order. Please Recheck");
    }

    const processOrderRow = async (length, uomValue) => {
      let orderPieces = "0";
      let total_special_price = "0";
      let ordLength = length;
      if (ordLength < 1) {
        ordLength = 1;
      }
      let ordUOM = req.body.order_item_me_uom;
      let ordUOMValue = uomValue;
      orderPieces = req.body.order_item_me_quantity;
      let finalItemCode = req.body.order_item_me_code;
      let finalItemDesciption = req.body.order_item_me_description;
      let orderitemmedepartment = req.body.order_item_me_department;
      let orderitemmedepartmentObj = new mongoose.Types.ObjectId(req.body.order_item_me_department);
      let orderitemqtymeprice = req.body.order_item_qty_me_price;
      let discountPercentage = parseFloat(req.body.order_item_me_discount) || 0;
      let discountedUP = 0;
      let discountedTA = 0;
      let discountedTP;

      let dept_data = await Department.find({ _id: orderitemmedepartmentObj });
      let dept_code = dept_data[0].department_code;

      let orderitemmequantity;
      if (dept_code === "ROOF") {
        orderitemmequantity = parseFloat(ordLength) * parseFloat(ordUOMValue) * 0.762;
      } else if (dept_code === "GBI" || dept_code === "GBIL") {
        const qty = req.body.order_item_me_quantity;
        orderitemmequantity = qty === undefined || qty === null || qty === "" ? 0 : qty;
      } else {
        orderitemmequantity = parseFloat(ordLength) * parseFloat(ordUOMValue);
      }
      total_special_price = parseFloat(orderitemqtymeprice) * parseFloat(orderitemmequantity).toFixed(2);
      discountedTP = total_special_price;
      discountedUP = parseFloat(orderitemqtymeprice);
      if (discountPercentage > 0) {
        discountedUP = parseFloat(orderitemqtymeprice) - (parseFloat(orderitemqtymeprice) * discountPercentage) / 100;
        discountedTP = parseFloat(discountedUP) * parseFloat(orderitemmequantity).toFixed(2);
        discountedTA = total_special_price - discountedTP;
      }

      const OrderItems = await OrderItem.find({ order_master_id: orderMasID });
      const OrderCustomItems = await OrderItemManual.find({ order_master_me_id: orderMasID });
      const orderRowIndexes = [...OrderItems.map(item => item.order_row_index).filter(index => index !== undefined), ...OrderCustomItems.map(item => item.order_row_index).filter(index => index !== undefined)];
      const LargestIndex = orderRowIndexes.length > 0 ? Math.max(...orderRowIndexes) : 0;
      const NewIndex = LargestIndex + 1;
      const orderItemData = new OrderItemManual({
        order_row_index: NewIndex,
        order_master_me_id: orderMasID,
        order_unique_me_id: ordMasUID,
        order_item_me_length: length,
        order_item_me_uom: ordUOM,
        order_item_me_uom_value: ordUOMValue,
        order_item_me_quantity: orderitemmequantity,
        order_item_qty_me_price: orderitemqtymeprice,
        order_item_special_me_price: discountedTP,
        order_item_me_code: finalItemCode,
        order_item_me_description: finalItemDesciption,
        order_item_me_department: orderitemmedepartment,
        order_item_me_department_code: dept_code,
        order_item_special_me_price_original: total_special_price,
        order_item_me_discount: discountPercentage,
        order_item_me_discounted_amount: discountedTA,
        order_item_qty_me_discounted_price: discountedUP,
      });

      const orderItemDataInfo = await orderItemData.save();
      if (orderItemDataInfo) {
        let updateData;
        if (dept_code === "FG") {
          if (ordMasDetails[0].fg_order_prod_push_status === 2) {
            updateData = { $set: { fg_order_prod_push_status: 2 } };
          } else {
            updateData = { $set: { fg_order_prod_push_status: 1 } };
          }
        }
        if (dept_code === "J") {
          if (ordMasDetails[0].j_order_prod_push_status === 2) {
            updateData = { $set: { j_order_prod_push_status: 2 } };
          } else {
            updateData = { $set: { j_order_prod_push_status: 1 } };
          }
        }
        if (dept_code === "CL") {
          if (ordMasDetails[0].cl_order_prod_push_status === 2) {
            updateData = { $set: { cl_order_prod_push_status: 2 } };
          } else {
            updateData = { $set: { cl_order_prod_push_status: 1 } };
          }
        }
        if (dept_code === "ROOF") {
          if (ordMasDetails[0].roof_order_prod_push_status === 2) {
            updateData = { $set: { roof_order_prod_push_status: 2 } };
          } else {
            updateData = { $set: { roof_order_prod_push_status: 1 } };
          }
        }
        if (dept_code === "GBI") {
          if (ordMasDetails[0].gbi_order_prod_push_status === 2) {
            updateData = { $set: { gbi_order_prod_push_status: 2 } };
          } else {
            updateData = { $set: { gbi_order_prod_push_status: 1 } };
          }
        }
        if (dept_code === "GBIL") {
          if (ordMasDetails[0].gbil_order_prod_push_status === 2) {
            updateData = { $set: { gbil_order_prod_push_status: 2 } };
          } else {
            updateData = { $set: { gbil_order_prod_push_status: 1 } };
          }
        }
        let conditions = { _id: orderMasID };
        await OrderMaster.findByIdAndUpdate(conditions, updateData, attrs);
        await checkIndividualOrderStatus(req.params.orderid);
        await RecalculateOrderItemsCountFn(req.params.orderid);
        await RecalculateOverallOrderTotalFn(req.params.orderid);
        await RecalculateUserJobCountFn(req.params.orderid, dept_code);
      }
    };

    await processOrderRow(req.body.order_item_me_length, req.body.order_item_me_uom_value);
    if (req.body.additionalRows && req.body.additionalRows.length > 0) {
      for (const row of req.body.additionalRows) {
        await processOrderRow(row.length, row.pieces);
      }
    }
    res.send("Manual Entry Added Successfully").status(200).end();
  } catch (err) {
    logError("addManualEntryOrderItem", err, req.user.user_ref_id);
    return res.status(500).send("Data Adding Failed.");
  }
};

exports.fetchManualEntryOrderItem = async (req, res) => {
  try {
    let order_me_id = new mongoose.Types.ObjectId(req.params.orderid);

    let manualOrderDetails = await OrderItemManual.aggregate([
      { $match: { $and: [{ order_master_me_id: order_me_id }] } },
      { $sort: { created: 1 } },
      { $lookup: { from: "departments", as: "departments", localField: "order_item_me_department", foreignField: "_id" } },
      { $unwind: { path: "$departments", preserveNullAndEmptyArrays: true } },
      {
        $project: {
          _id: 1,
          order_master_me_id: 1,
          order_unique_me_id: 1,
          order_item_unique_me_id: 1,
          order_item_me_material: 1,
          order_item_me_color: 1,
          order_item_exact_me_grith: 1,
          order_item_round_me_grith: 1,
          order_item_me_fold: 1,
          order_item_me_thickness: 1,
          order_item_me_length: 1,
          order_item_me_uom: 1,
          order_item_me_uom_value: 1,
          order_item_me_quantity: 1,
          order_item_me_pieces: 1,
          order_item_me_price: 1,
          order_item_qty_me_price: 1,
          order_item_special_me_price: 1,
          order_item_me_code: 1,
          order_item_me_description: 1,
          order_item_me_flag: 1,
          order_item_me_department: 1,
          created: 1,
          departments: "$departments.department_name",
        },
      },
    ]);
    res.send(manualOrderDetails).status(200).end();
  } catch (err) {
    logError("fetchManualEntryOrderItem", err, req.user.user_ref_id);
    return res.status(500).send("Data Fetching Failed.");
  }
};

exports.fetchSpecificManualEntryOrderItem = async (req, res) => {
  try {
    const orderMEID = new mongoose.Types.ObjectId(req.params.orderid);
    let manualOrderDetails = await OrderItemManual.find({ _id: orderMEID });
    res.send(manualOrderDetails).status(200).end();
  } catch (err) {
    logError("fetchSpecificManualEntryOrderItem", err, req.user.user_ref_id);
    return res.status(500).send("Data Fetching Failed.");
  }
};

exports.updateManualEntryOrderItem = async (req, res) => {
  try {
    const orderMEID = new mongoose.Types.ObjectId(req.params.orderid);
    const orderItemDataME = req.body;
    let ordLength = req.body.order_item_me_length;
    if (ordLength < 1) {
      ordLength = 1;
    }

    let OrderItemDetails = await OrderItemManual.find({ _id: orderMEID });
    let OrderMasterID = OrderItemDetails[0].order_master_me_id;
    let orderitemmedepartmentObj = new mongoose.Types.ObjectId(req.body.order_item_me_department);

    let ordMasDetails = await OrderMaster.find({ _id: OrderMasterID });
    let orderMasterInfo = await OrderMaster.findOne({ _id: ordMasDetails });
    let status = orderMasterInfo.order_status;
    let ordStr = orderMasterInfo.order_unique_id;
    if (status === "Order Cancelled") {
      const err = new Error("Attempt To Edit In Cancelled Order " + ordStr + " Line Item");
      logError("updateManualEntryOrderItem", err, req.user.user_ref_id);
      return res.status(500).send("Cancelled Order. Please Recheck");
    }

    let dept_data = await Department.find({ _id: orderitemmedepartmentObj });
    let dept_code = dept_data[0].department_code;

    let orderitemmequantity;
    if (dept_code === "ROOF") {
      orderitemmequantity = parseFloat(ordLength) * parseFloat(req.body.order_item_me_uom_value) * 0.762;
    } else if (dept_code === "GBI" || dept_code === "GBIL") {
      const qty = req.body.order_item_me_quantity;
      orderitemmequantity = qty === undefined || qty === null || qty === "" ? 0 : qty;
    } else {
      orderitemmequantity = parseFloat(ordLength) * parseFloat(req.body.order_item_me_uom_value);
    }

    let orderitemqtymeprice = req.body.order_item_qty_me_price;
    let total_special_price = "0";
    let discountPercentage = parseFloat(req.body.order_item_me_discount) || 0;
    let discountedUP = 0;
    let discountedTA = 0;
    let discountedTP;
    total_special_price = parseFloat(orderitemqtymeprice) * parseFloat(orderitemmequantity).toFixed(2);
    discountedTP = total_special_price;
    discountedUP = parseFloat(orderitemqtymeprice);
    if (discountPercentage > 0) {
      discountedUP = parseFloat(orderitemqtymeprice) - (parseFloat(orderitemqtymeprice) * discountPercentage) / 100;
      discountedTP = parseFloat(discountedUP) * parseFloat(orderitemmequantity).toFixed(2);
      discountedTA = total_special_price - discountedTP;
    }

    orderItemDataME.updated = new Date().toISOString();
    orderItemDataME.order_item_me_length = req.body.order_item_me_length;
    orderItemDataME.order_item_me_quantity = orderitemmequantity;
    orderItemDataME.order_item_special_me_price = discountedTP;
    orderItemDataME.order_item_special_me_price_original = total_special_price;
    orderItemDataME.order_item_me_discount = discountPercentage;
    orderItemDataME.order_item_me_discounted_amount = discountedTA;
    orderItemDataME.order_item_qty_me_discounted_price = discountedUP;
    orderItemDataME.order_item_me_department = orderitemmedepartmentObj;
    orderItemDataME.order_item_me_department_code = dept_code;
    let orderItemMEInfo = await OrderItemManual.findByIdAndUpdate(orderMEID, orderItemDataME, attrs);

    if (orderItemMEInfo) {
      let updateData;
      if (dept_code === "FG") {
        if (ordMasDetails[0].fg_order_prod_push_status === 2) {
          updateData = { $set: { fg_order_prod_push_status: 2 } };
        } else {
          updateData = { $set: { fg_order_prod_push_status: 1 } };
        }
      }
      if (dept_code === "J") {
        if (ordMasDetails[0].j_order_prod_push_status === 2) {
          updateData = { $set: { j_order_prod_push_status: 2 } };
        } else {
          updateData = { $set: { j_order_prod_push_status: 1 } };
        }
      }
      if (dept_code === "CL") {
        if (ordMasDetails[0].cl_order_prod_push_status === 2) {
          updateData = { $set: { cl_order_prod_push_status: 2 } };
        } else {
          updateData = { $set: { cl_order_prod_push_status: 1 } };
        }
      }
      if (dept_code === "ROOF") {
        if (ordMasDetails[0].roof_order_prod_push_status === 2) {
          updateData = { $set: { roof_order_prod_push_status: 2 } };
        } else {
          updateData = { $set: { roof_order_prod_push_status: 1 } };
        }
      }
      if (dept_code === "GBI") {
        if (ordMasDetails[0].gbi_order_prod_push_status === 2) {
          updateData = { $set: { gbi_order_prod_push_status: 2 } };
        } else {
          updateData = { $set: { gbi_order_prod_push_status: 1 } };
        }
      }
      if (dept_code === "GBIL") {
        if (ordMasDetails[0].gbil_order_prod_push_status === 2) {
          updateData = { $set: { gbil_order_prod_push_status: 2 } };
        } else {
          updateData = { $set: { gbil_order_prod_push_status: 1 } };
        }
      }
      let conditions = { _id: OrderMasterID };
      let updatedProdPushStatus = await OrderMaster.findByIdAndUpdate(conditions, updateData, attrs);
      if (updatedProdPushStatus) {
        const DeptExistenceCheck = await OrderItemManual.find({
          order_master_me_id: OrderMasterID,
        });

        const existingCodes = DeptExistenceCheck.map(item => item.order_item_me_department_code);
        const allDeptCodes = ["FG", "J", "CL", "ROOF", "GBI", "GBIL"];
        const missingDepts = allDeptCodes.filter(code => !existingCodes.includes(code));
        const updateFields = {};
        for (const code of missingDepts) {
          switch (code) {
            case "FG":
              updateFields.fg_order_prod_push_status = 0;
              updateFields.fg_order_prod_current_status = 0;
              break;
            case "J":
              updateFields.j_order_prod_push_status = 0;
              updateFields.j_order_prod_current_status = 0;
              break;
            case "CL":
              updateFields.cl_order_prod_push_status = 0;
              updateFields.cl_order_prod_current_status = 0;
              break;
            case "ROOF":
              updateFields.roof_order_prod_push_status = 0;
              updateFields.roof_order_prod_current_status = 0;
              break;
            case "GBI":
              updateFields.gbi_order_prod_push_status = 0;
              updateFields.gbi_order_prod_current_status = 0;
              break;
            case "GBIL":
              updateFields.gbil_order_prod_push_status = 0;
              break;
          }
        }

        if (Object.keys(updateFields).length > 0) {
          await OrderMaster.findByIdAndUpdate(OrderMasterID, { $set: updateFields }, attrs);
        }
      }

      await checkIndividualOrderStatus(OrderMasterID);
      await RecalculateOrderItemsCountFn(OrderMasterID);
      await RecalculateOverallOrderTotalFn(OrderMasterID);
      await RecalculateUserJobCountFn(OrderMasterID, dept_code);
    }
    res.status(200).send(orderItemMEInfo);
    res.end();
  } catch (err) {
    logError("updateManualEntryOrderItem", err, req.user.user_ref_id);
    return res.status(500).send("Data Updation Failed");
  }
};

exports.updateOrderDepartmentalInstruction = async (req, res) => {
  try {
    const orderID = new mongoose.Types.ObjectId(req.params.orderid);
    const dept = req.body.department;
    let dept_approx_cnt = req.body.approxCount;
    let dept_Instruction = req.body.departmentInstructions;
    let updateData;
    if (dept === "F") {
      updateData = { $set: { f_order_dept_approx_count: dept_approx_cnt } };
    }
    if (dept === "FG") {
      updateData = { $set: { fg_order_dept_approx_count: dept_approx_cnt } };
    }
    if (dept === "J") {
      updateData = { $set: { j_order_dept_approx_count: dept_approx_cnt } };
    }
    if (dept === "CL") {
      updateData = { $set: { cl_order_dept_approx_count: dept_approx_cnt } };
    }
    if (dept === "GBI") {
      updateData = { $set: { gbi_order_dept_approx_count: dept_approx_cnt } };
    }
    if (dept === "ROOF") {
      updateData = { $set: { roof_order_dept_approx_count: dept_approx_cnt } };
    }
    let conditions = { _id: orderID };
    let updatedDeptInfo = await OrderMaster.findByIdAndUpdate(conditions, updateData, attrs);
    res.status(200).send(updatedDeptInfo);
    res.end();
  } catch (err) {
    logError("updateOrderDepartmentalInstruction", err, req.user.user_ref_id);
    res.status(500).send("Data Updation Failed.");
  }
};

exports.deleteSpecificManualEntryOrderItem = async (req, res) => {
  try {
    const orderMEID = new mongoose.Types.ObjectId(req.params.orderid);
    let orderitemmedepartmentObj = new mongoose.Types.ObjectId(req.params.deptcode);
    let dept_data = await Department.find({ _id: orderitemmedepartmentObj });
    let dept_code = dept_data[0].department_code;

    let OrderItemDetails = await OrderItemManual.find({ _id: orderMEID });
    let OrderMasterID = OrderItemDetails[0].order_master_me_id;

    let ordMasDetails = await OrderMaster.find({ _id: OrderMasterID });
    let orderMasterInfo = await OrderMaster.findOne({ _id: ordMasDetails });
    let status = orderMasterInfo.order_status;
    let ordStr = orderMasterInfo.order_unique_id;
    if (status === "Order Cancelled") {
      const err = new Error("Attempt To Delete In Cancelled Order " + ordStr + " Line Item");
      logError("deleteSpecificManualEntryOrderItem", err, req.user.user_ref_id);
      return res.status(500).send("Cancelled Order. Please Recheck");
    }

    let deletemanualOrder = await OrderItemManual.deleteMany({ _id: orderMEID });
    if (deletemanualOrder) {
      let DeptExistenceCheck = await OrderItemManual.find({
        order_master_me_id: OrderMasterID,
        order_item_me_department: orderitemmedepartmentObj,
      });
      let deptLength = DeptExistenceCheck.length;
      if (!deptLength) {
        let updateDeptData;
        if (dept_code === "FG") {
          updateDeptData = { $set: { fg_order_prod_push_status: 0, fg_order_prod_current_status: 0 } };
        }
        if (dept_code === "J") {
          updateDeptData = { $set: { j_order_prod_push_status: 0, j_order_prod_current_status: 0 } };
        }
        if (dept_code === "CL") {
          updateDeptData = { $set: { cl_order_prod_push_status: 0, cl_order_prod_current_status: 0 } };
        }
        if (dept_code === "ROOF") {
          updateDeptData = { $set: { roof_order_prod_push_status: 0, roof_order_prod_current_status: 0 } };
        }
        if (dept_code === "GBI") {
          updateDeptData = { $set: { gbi_order_prod_push_status: 0, gbi_order_prod_current_status: 0 } };
        }
        if (dept_code === "GBIL") {
          updateDeptData = { $set: { gbil_order_prod_push_status: 0 } };
        }
        let conditions = { _id: OrderMasterID };
        await OrderMaster.findByIdAndUpdate(conditions, updateDeptData, attrs);
      }
    }
    await checkIndividualOrderStatus(OrderMasterID);
    await RecalculateOrderItemsCountFn(OrderMasterID);
    await RecalculateOverallOrderTotalFn(OrderMasterID);
    await RecalculateUserJobCountFn(OrderMasterID, dept_code);
    res.status(200).send(deletemanualOrder);
    res.end();
  } catch (err) {
    logError("deleteSpecificManualEntryOrderItem", err, req.user.user_ref_id);
  }
};

exports.designerDashboardOrderList = async (req, res) => {
  try {
    let fullOrderObj = {};
    const limit = 10;
    let page = parseInt(req.query.page) || 0;
    const skip = page * limit;
    const searchKeyword = req.query.query;
    const searchFilter = {};

    if (searchKeyword) {
      searchFilter.$or = [{ order_unique_id: { $regex: searchKeyword, $options: "i" } }];
    }

    const total_orders = await OrderMaster.find({
      order_status: { $ne: "Order Cancelled" },
      order_flashing_checker: true,
      order_design_stage: "0",
      $or: [{ order_designed_person: { $exists: false } }, { order_designed_person: null }],
      ...searchFilter,
    });

    let total_orders_count = total_orders.length;

    let orderDetails = await OrderMaster.aggregate([
      { $sort: { order_delivery_date: 1 } },
      {
        $match: {
          order_status: { $ne: "Order Cancelled" },
          order_flashing_checker: true,
          order_design_stage: "0",
          $or: [{ order_designed_person: { $exists: false } }, { order_designed_person: null }],
          ...searchFilter,
        },
      },
      { $lookup: { from: "accounts", as: "customerInfo", localField: "order_customer_id", foreignField: "_id" } },
      { $lookup: { from: "accountcontacts", as: "customercontactInfo", localField: "order_customer_contact_id", foreignField: "_id" } },
      { $unwind: { path: "$customerInfo", preserveNullAndEmptyArrays: true } },
      { $unwind: { path: "$customercontactInfo", preserveNullAndEmptyArrays: true } },
      {
        $project: {
          _id: 1,
          order_unique_id: 1,
          d_order_unique_id: {
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
          order_customer_PO_number: 1,
          d_order_customer_PO_number: {
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
          order_customer_contact_phone: 1,
          order_customer_contact_email: 1,
          order_site_delivery_attention_person: 1,
          order_site_delivery_attention_contact: 1,
          order_flashing_checker: 1,
          order_status: 1,
          order_store_delivery_address1: 1,
          order_store_delivery_address2: 1,
          order_store_delivery_city: 1,
          order_store_delivery_country: 1,
          order_store_delivery_postalcode: 1,
          order_store_delivery_state: 1,
          order_site_delivery_address1: 1,
          order_site_delivery_address2: 1,
          order_site_delivery_city: 1,
          order_site_delivery_country: 1,
          order_site_delivery_postalcode: 1,
          order_site_delivery_state: 1,
          order_Pieces: 1,
          created: 1,
          account_ID: "$customerInfo._id",
          account_UID: "$customerInfo.account_UID",
          account_Name: "$customerInfo.account_Name",
          account_Address: "$customerInfo.account_Address",
          account_StoreAddress: "$customerInfo.account_StoreAddress",
          account_Status: "$customerInfo.account_Status",
          account_DataRemoved: "$customerInfo.account_DataRemoved",
        },
      },
    ])
      .skip(skip)
      .limit(limit);

    let pages;
    if (total_orders_count <= limit) {
      pages = 1;
    } else {
      pages = Math.ceil(total_orders_count / limit);
    }

    fullOrderObj.totalItems = total_orders_count;
    fullOrderObj.fetchedItems = orderDetails;
    fullOrderObj.rowsPerPage = limit;
    fullOrderObj.totalPages = pages;
    res.status(200).send(fullOrderObj);
  } catch (err) {
    logError("designerDashboardOrderList", err, req.user.user_ref_id);
    res.status(500).send("Data Fetching Failed");
  }
};

exports.assignOrderToDesigner = async (req, res) => {
  try {
    const orderID = new mongoose.Types.ObjectId(req.params.orderid);
    let orderMasterInfo = await OrderMaster.findOne({ _id: orderID });
    let status = orderMasterInfo.order_status;
    let ordStr = orderMasterInfo.order_unique_id;
    if (status === "Order Cancelled") {
      const err = new Error("Attempt To Assign a Cancelled Order " + ordStr + "  to Designer.");
      logError("assignOrderToDesigner", err, req.user.user_ref_id);
      return res.status(500).send("Cancelled Order. Please Recheck");
    }

    let orderMasterDetails = await OrderMaster.findById(orderID);
    if (orderMasterDetails.order_designed_person && mongoose.Types.ObjectId.isValid(orderMasterDetails.order_designed_person)) {
      res.status(500).send("Design Already Assigned. Please Refresh and Recheck");
    } else {
      const loggedUserID = new mongoose.Types.ObjectId(req.params.userid);
      let updateData = { $set: { order_design_assigned_time: new Date().toISOString(), order_designed_person: loggedUserID, order_design_stage: "1" } };
      let conditions = { _id: orderID };
      let orderdesigner = await OrderMaster.findByIdAndUpdate(conditions, updateData, attrs);
      res.status(200).send(orderdesigner);
      res.end();
    }
  } catch (err) {
    logError("assignOrderToDesigner", err, req.user.user_ref_id);
    res.status(500).send("Data Fetching Failed");
  }
};

exports.specificDesignerOrderList = async (req, res) => {
  try {
    let fullOrderObj = {};
    const limit = 10;
    const page = req.query.page;
    const skip = page * limit;
    const userID = new mongoose.Types.ObjectId(req.user.user_ref_id);

    let total_orders = await OrderMaster.find({
      order_status: { $ne: "Order Cancelled" },
      order_flashing_checker: true,
      order_designed_person: userID,
      $or: [{ order_design_stage: "1" }, { order_design_stage: "4" }],
    });
    let total_orders_count = total_orders.length;

    let orderDetails = await OrderMaster.aggregate([
      { $sort: { created: -1 } },
      {
        $match: {
          order_status: { $ne: "Order Cancelled" },
          order_flashing_checker: true,
          $or: [{ order_design_stage: "1" }, { order_design_stage: "4" }],
          order_designed_person: userID,
        },
      },
      { $lookup: { from: "accounts", as: "customerInfo", localField: "order_customer_id", foreignField: "_id" } },
      { $lookup: { from: "accountcontacts", as: "customercontactInfo", localField: "order_customer_contact_id", foreignField: "_id" } },
      { $unwind: { path: "$customerInfo", preserveNullAndEmptyArrays: true } },
      { $unwind: { path: "$customercontactInfo", preserveNullAndEmptyArrays: true } },
      {
        $project: {
          _id: 1,
          order_unique_id: 1,
          d_order_unique_id: {
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
          order_customer_PO_number: 1,
          d_order_customer_PO_number: {
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
          order_customer_contact_phone: 1,
          order_customer_contact_email: 1,
          order_site_delivery_attention_person: 1,
          order_site_delivery_attention_contact: 1,
          order_flashing_checker: 1,
          order_status: 1,
          order_Pieces: 1,
          order_designed_person: 1,
          order_store_delivery_address1: 1,
          order_store_delivery_address2: 1,
          order_store_delivery_city: 1,
          order_store_delivery_country: 1,
          order_store_delivery_postalcode: 1,
          order_store_delivery_state: 1,
          order_site_delivery_address1: 1,
          order_site_delivery_address2: 1,
          order_site_delivery_city: 1,
          order_site_delivery_country: 1,
          order_site_delivery_postalcode: 1,
          order_site_delivery_state: 1,
          order_qc_status: 1,
          order_qced_person: 1,
          created: 1,
          account_ID: "$customerInfo._id",
          account_UID: "$customerInfo.account_UID",
          account_Name: "$customerInfo.account_Name",
          account_Address: "$customerInfo.account_Address",
          account_StoreAddress: "$customerInfo.account_StoreAddress",
          account_Status: "$customerInfo.account_Status",
          account_DataRemoved: "$customerInfo.account_DataRemoved",
          account_Contact_Email: "$customercontactInfo.account_Contact_Email",
          account_Contact_Phone: "$customercontactInfo.account_Contact_Phone",
          account_Contact_Name: {
            $concat: ["$customercontactInfo.account_Contact_FName", " ", "$customercontactInfo.account_Contact_LName"],
          },
        },
      },
    ])
      .skip(skip)
      .limit(limit);
    let pages;
    if (total_orders_count <= limit) {
      pages = 0;
    } else {
      pages = Math.ceil(total_orders_count / limit);
    }
    fullOrderObj.totalItems = total_orders_count;
    fullOrderObj.fetchedItems = orderDetails;
    fullOrderObj.rowsPerPage = limit;
    fullOrderObj.totalPages = pages;
    res.send(fullOrderObj).status(200).end();
  } catch (err) {
    logError("specificDesignerOrderList", err, req.user.user_ref_id);
    res.status(500).send("Data Fetching Failed");
  }
};

exports.assignOrderToQC = async (req, res) => {
  try {
    const orderID = new mongoose.Types.ObjectId(req.params.orderid);
    let orderMasterDetails = await OrderMaster.findById(orderID);

    let orderMasterInfo = await OrderMaster.findOne({ _id: orderID });
    let status = orderMasterInfo.order_status;
    let ordStr = orderMasterInfo.order_unique_id;
    if (status === "Order Cancelled") {
      const err = new Error("Attempt To Assign a Cancelled Order " + ordStr + "  to QC.");
      logError("assignOrderToQC", err, req.user.user_ref_id);
      return res.status(500).send("Cancelled Order. Please Recheck");
    }

    if (!orderMasterDetails || !orderMasterDetails.order_designed_person || !mongoose.Types.ObjectId.isValid(orderMasterDetails.order_designed_person)) {
      const err = new Error("Attempt To Assign Order " + ordStr + " to QC Before Assigning to Designer.");
      logError("assignOrderToQC", err, req.user.user_ref_id);
      res.status(500).send("Designer Not Yet Assigned or Invalid Designer ID. Please Refresh and Recheck");
    } else {
      // Check if already assigned to QC
      let designStageValue = "2";
      if (orderMasterDetails.order_qc_assigned_time || orderMasterDetails.order_qced_person) {
        designStageValue = "3";
      }
      let updateData = {
        $set: {
          order_design_stage: designStageValue,
          order_design_completed_time: new Date().toISOString(),
          order_status: process.env.MasOrdStatus3,
        },
      };
      let updatedOrder = await OrderMaster.findByIdAndUpdate(orderID, updateData, { new: true });
      if (!updatedOrder) {
        res.status(500).send("Failed to update order. Please try again.");
      } else {
        res.status(200).send("Order Assigned To QC");
      }
    }
  } catch (err) {
    logError("assignOrderToQC", err, req.user.user_ref_id);
    res.status(500).send("Order Assignation Failed..");
  }
};

exports.assignOrderBackToDesigner = async (req, res) => {
  try {
    const orderID = new mongoose.Types.ObjectId(req.params.orderid);
    let orderMasterInfo = await OrderMaster.findById(orderID);
    let status = orderMasterInfo.order_status;
    let ordStr = orderMasterInfo.order_unique_id;
    if (status === "Order Cancelled") {
      const err = new Error("Attempt To Reassign a Cancelled Order " + ordStr + "  to Designer.");
      logError("assignOrderBackToDesigner", err, req.user.user_ref_id);
      return res.status(500).send("Cancelled Order. Please Recheck");
    }
    let updateData = { $set: { order_design_stage: "1", order_design_completed_time: null, order_status: process.env.MasOrdStatus2 } };
    let conditions = { _id: orderID };
    let updatedOrder = await OrderMaster.findOneAndUpdate(conditions, updateData, { new: true });
    if (!updatedOrder) {
      res.status(500).send("Failed to update order. Please try again.");
    } else {
      res.status(200).send("Order Assigned Back To Designer");
    }
  } catch (err) {
    logError("assignOrderBackToDesigner", err, req.user.user_ref_id);
    res.status(500).send("Order Reassignment Failed..");
  }
};

exports.qcDashboardOrderList = async (req, res) => {
  try {
    let fullOrderObj = {};
    const limit = 10;
    const page = req.query.page;
    const skip = page * limit;
    const searchKeyword = req.query.query;
    const searchFilter = {};
    if (searchKeyword) {
      searchFilter.$or = [{ order_unique_id: { $regex: searchKeyword, $options: "i" } }];
    }

    const total_orders = await OrderMaster.find({
      order_status: { $ne: "Order Cancelled" },
      order_flashing_checker: true,
      order_design_stage: "2",
      ...searchFilter,
    });
    let total_orders_count = total_orders.length;
    let orderDetails = await OrderMaster.aggregate([
      { $sort: { created: -1 } },
      {
        $match: {
          order_status: { $ne: "Order Cancelled" },
          order_flashing_checker: true,
          order_design_stage: "2",
          ...searchFilter,
        },
      },
      { $lookup: { from: "accounts", as: "customerInfo", localField: "order_customer_id", foreignField: "_id" } },
      { $lookup: { from: "accountcontacts", as: "customercontactInfo", localField: "order_customer_contact_id", foreignField: "_id" } },
      { $unwind: { path: "$customerInfo", preserveNullAndEmptyArrays: true } },
      { $unwind: { path: "$customercontactInfo", preserveNullAndEmptyArrays: true } },
      {
        $project: {
          _id: 1,
          order_unique_id: 1,
          d_order_unique_id: {
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
          order_customer_PO_number: 1,
          d_order_customer_PO_number: {
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
          order_customer_contact_phone: 1,
          order_customer_contact_email: 1,
          order_site_delivery_attention_person: 1,
          order_site_delivery_attention_contact: 1,
          order_flashing_checker: 1,
          order_status: 1,
          order_store_delivery_address1: 1,
          order_store_delivery_address2: 1,
          order_store_delivery_city: 1,
          order_store_delivery_country: 1,
          order_store_delivery_postalcode: 1,
          order_store_delivery_state: 1,
          order_site_delivery_address1: 1,
          order_site_delivery_address2: 1,
          order_site_delivery_city: 1,
          order_site_delivery_country: 1,
          order_site_delivery_postalcode: 1,
          order_site_delivery_state: 1,
          order_Pieces: 1,
          created: 1,
          account_ID: "$customerInfo._id",
          account_UID: "$customerInfo.account_UID",
          account_Name: "$customerInfo.account_Name",
          account_Address: "$customerInfo.account_Address",
          account_StoreAddress: "$customerInfo.account_StoreAddress",
          account_Status: "$customerInfo.account_Status",
          account_DataRemoved: "$customerInfo.account_DataRemoved",
        },
      },
    ])
      .skip(skip)
      .limit(limit);
    let pages;
    if (total_orders_count <= limit) {
      pages = 0;
    } else {
      pages = Math.ceil(total_orders_count / limit);
    }
    fullOrderObj.totalItems = total_orders_count;
    fullOrderObj.fetchedItems = orderDetails;
    fullOrderObj.rowsPerPage = limit;
    fullOrderObj.totalPages = pages;
    res.send(fullOrderObj).status(200).end();
  } catch (err) {
    logError("qcDashboardOrderList", err, req.user.user_ref_id);
    res.status(500).send("Data Fetching Failed");
  }
};

exports.assignOrderToQCED = async (req, res) => {
  try {
    const orderID = new mongoose.Types.ObjectId(req.params.orderid);
    let orderMasterDetails = await OrderMaster.findById(orderID);
    const loggedUserID = new mongoose.Types.ObjectId(req.params.userid);

    let orderMasterInfo = await OrderMaster.findOne({ _id: orderID });
    let status = orderMasterInfo.order_status;
    let ordStr = orderMasterInfo.order_unique_id;
    if (status === "Order Cancelled") {
      const err = new Error("Attempt To Assign a Cancelled Order " + ordStr + "  to QC.");
      logError("assignOrderToQCED", err, req.user.user_ref_id);
      return res.status(500).send("Cancelled Order. Please Recheck");
    }

    if (!orderMasterDetails || !orderMasterDetails.order_designed_person || !mongoose.Types.ObjectId.isValid(orderMasterDetails.order_designed_person) || !orderMasterDetails.order_design_completed_time) {
      const err = new Error("Attempt To Assign Order " + ordStr + " to QC Before Assigning to Designer.");
      logError("assignOrderToQCED", err, req.user.user_ref_id);
      res.status(500).send("Designer Not Yet Assigned or Invalid Designer ID or Designer Not Yet Completed. Please Refresh and Recheck");
    } else {
      if (orderMasterDetails.order_qced_person && mongoose.Types.ObjectId.isValid(orderMasterDetails.order_qced_person)) {
        res.status(500).send("QC Already Assigned. Please Refresh and Recheck");
      } else {
        let updateData = { $set: { order_qc_assigned_time: new Date().toISOString(), order_qced_person: loggedUserID, order_design_stage: "3" } };
        let conditions = { _id: orderID };
        let orderdesigner = await OrderMaster.findByIdAndUpdate(conditions, updateData, attrs);
        if (!orderdesigner) {
          res.status(500).send("Failed to update order. Please try again.");
        } else {
          res.status(200).send("Order Assigned to QCED");
        }
      }
    }
  } catch (err) {
    logError("assignOrderToQCED", err, req.user.user_ref_id);
    res.status(500).send("Data Assignation Failed.");
  }
};

exports.specificQCOrderList = async (req, res) => {
  try {
    let fullOrderObj = {};
    const limit = 10;
    const page = req.query.page;
    const skip = page * limit;
    const userID = new mongoose.Types.ObjectId(req.user.user_ref_id);
    let total_orders = await OrderMaster.find({
      order_status: { $ne: "Order Cancelled" },
      order_flashing_checker: true,
      order_qced_person: userID,
      order_design_stage: "3",
    });

    let total_orders_count = total_orders.length;
    let orderDetails = await OrderMaster.aggregate([
      { $sort: { created: -1 } },
      {
        $match: {
          order_status: { $ne: "Order Cancelled" },
          order_flashing_checker: true,
          order_design_stage: "3",
          order_qced_person: userID,
        },
      },
      { $lookup: { from: "accounts", as: "customerInfo", localField: "order_customer_id", foreignField: "_id" } },
      { $lookup: { from: "accountcontacts", as: "customercontactInfo", localField: "order_customer_contact_id", foreignField: "_id" } },
      { $unwind: { path: "$customerInfo", preserveNullAndEmptyArrays: true } },
      { $unwind: { path: "$customercontactInfo", preserveNullAndEmptyArrays: true } },
      {
        $project: {
          _id: 1,
          order_unique_id: 1,
          d_order_unique_id: {
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
          order_customer_PO_number: 1,
          d_order_customer_PO_number: {
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
          order_customer_contact_phone: 1,
          order_customer_contact_email: 1,
          order_site_delivery_attention_person: 1,
          order_site_delivery_attention_contact: 1,
          order_flashing_checker: 1,
          order_store_delivery_address1: 1,
          order_store_delivery_address2: 1,
          order_store_delivery_city: 1,
          order_store_delivery_country: 1,
          order_store_delivery_postalcode: 1,
          order_store_delivery_state: 1,
          order_site_delivery_address1: 1,
          order_site_delivery_address2: 1,
          order_site_delivery_city: 1,
          order_site_delivery_country: 1,
          order_site_delivery_postalcode: 1,
          order_site_delivery_state: 1,
          order_status: 1,
          order_Pieces: 1,
          order_qced_person: 1,
          created: 1,
          account_ID: "$customerInfo._id",
          account_UID: "$customerInfo.account_UID",
          account_Name: "$customerInfo.account_Name",
          account_Address: "$customerInfo.account_Address",
          account_StoreAddress: "$customerInfo.account_StoreAddress",
          account_Status: "$customerInfo.account_Status",
          account_DataRemoved: "$customerInfo.account_DataRemoved",
          account_Contact_Email: "$customercontactInfo.account_Contact_Email",
          account_Contact_Phone: "$customercontactInfo.account_Contact_Phone",
          account_Contact_Name: {
            $concat: ["$customercontactInfo.account_Contact_FName", " ", "$customercontactInfo.account_Contact_LName"],
          },
        },
      },
    ])
      .skip(skip)
      .limit(limit);
    let pages;
    if (total_orders_count <= limit) {
      pages = 0;
    } else {
      pages = Math.ceil(total_orders_count / limit);
    }
    fullOrderObj.totalItems = total_orders_count;
    fullOrderObj.fetchedItems = orderDetails;
    fullOrderObj.rowsPerPage = limit;
    fullOrderObj.totalPages = pages;
    res.send(fullOrderObj).status(200).end();
  } catch (err) {
    logError("specificQCOrderList", err, req.user.user_ref_id);
    res.status(500).send("Data Fetching Failed");
  }
};

exports.qcFailedOrderListMark = async (req, res) => {
  try {
    const orderID = new mongoose.Types.ObjectId(req.body.orderID);
    const loggedUserID = new mongoose.Types.ObjectId(req.user.user_ref_id);

    let orderMasterInfo = await OrderMaster.findOne({ _id: orderID });
    let status = orderMasterInfo.order_status;
    if (status === "Order Cancelled") {
      return res.status(500).send("Cancelled Order. Please Recheck");
    }

    let orderMasterDetails = await OrderMaster.find({ _id: orderID });
    let orderMasUniqueID = orderMasterDetails[0].order_unique_id;
    let errorShapeIds = req.body.shapeIDs;
    let orderErrorLog = new ErrorLogTable({
      def_Order_Mas_Id: orderID,
      def_Order_Mas_Unique_Id: orderMasUniqueID,
      def_User_Id: loggedUserID,
      def_Design_Shape_Id: errorShapeIds,
    });
    let ordererrorlogdetails = await orderErrorLog.save();
    if (ordererrorlogdetails) {
      let updateData = { $set: { order_design_stage: "4", order_status: process.env.MasOrdStatus4 } };
      let conditions = { _id: orderID };
      let orderqcstatus = await OrderMaster.findByIdAndUpdate(conditions, updateData, attrs);
    }
    res.send(ordererrorlogdetails).status(200).end();
    res.end();
  } catch (err) {
    logError("qcFailedOrderListMark", err, req.user.user_ref_id);
    res.status(500).send("Data Fetching Failed.");
  }
};

exports.qcFailedShapeiList = async (req, res) => {
  try {
    const orderID = new mongoose.Types.ObjectId(req.params.orderid);
    let defectShapeIDs = await ErrorLogTable.aggregate([
      { $sort: { def_created: -1 } },
      { $match: { $and: [{ def_Order_Mas_Id: orderID }] } },
      { $lookup: { from: "users", as: "usersInfo", localField: "def_User_Id", foreignField: "_id" } },
      { $unwind: { path: "$usersInfo", preserveNullAndEmptyArrays: true } },
      {
        $project: {
          _id: 1,
          def_Order_Mas_Id: 1,
          def_Order_Mas_Unique_Id: 1,
          def_User_Id: 1,
          def_Design_Shape_Id: 1,
          def_created: 1,
          def_qced_person: {
            $concat: ["$usersInfo.user_firstName", " ", "$usersInfo.user_lastName"],
          },
        },
      },
    ]);
    res.send(defectShapeIDs).status(200).end();
  } catch (err) {
    logError("qcFailedShapeiList", err, req.user.user_ref_id);
    res.status(500).send("Data Fetching Failed.");
  }
};

exports.assignOrderToProduction = async (req, res) => {
  try {
    const orderID = new mongoose.Types.ObjectId(req.params.orderid);
    let orderMasterDetails = await OrderMaster.findById(orderID);
    let OrdDept = req.params.dept;
    let orderMasterInfo = await OrderMaster.findOne({ _id: orderID });
    let status = orderMasterInfo.order_status;

    if (status === "Order Cancelled") {
      const err = new Error("Tried to Push Cancelled Order To Production");
      logError("assignOrderToProduction", err, req.user.user_ref_id);
      return res.status(500).send("Cancelled Order. Please Recheck");
    }

    if ((OrdDept === "F" && mongoose.Types.ObjectId.isValid(orderMasterDetails.order_designed_person) && mongoose.Types.ObjectId.isValid(orderMasterDetails.order_qced_person)) || OrdDept !== "F") {
      let totalFlashing = 0;
      let totalJobing = 0;
      let totalCladding = 0;
      let totalFaciagutter = 0;
      let totalRoofing = 0;
      let totalGBI = 0;
      let totalGBIL = 0;

      const flashingOrders = await OrderItem.find({ order_master_id: orderID });
      for (let k = 0; k < flashingOrders.length; k++) {
        totalFlashing = parseInt(totalFlashing) + parseInt(flashingOrders[k].order_item_pieces);
      }

      const customdept = await Department.find({ department_status: "active" }).sort({ department_order: 1 });
      const departmentIds = customdept.map(dept => dept._id);

      const [jobingOrders, faciagutterOrders, claddingOrders, gbiOrders, roofingOrders, gbilOrders] = await Promise.all([
        OrderItemManual.find({
          order_master_me_id: orderID,
          order_item_me_department: departmentIds[0],
        }),
        OrderItemManual.find({
          order_master_me_id: orderID,
          order_item_me_department: departmentIds[1],
        }),
        OrderItemManual.find({
          order_master_me_id: orderID,
          order_item_me_department: departmentIds[2],
        }),
        OrderItemManual.find({
          order_master_me_id: orderID,
          order_item_me_department: departmentIds[3],
        }),
        OrderItemManual.find({
          order_master_me_id: orderID,
          order_item_me_department: departmentIds[4],
        }),
        OrderItemManual.find({
          order_master_me_id: orderID,
          order_item_me_department: departmentIds[5],
        }),
      ]);

      totalJobing = jobingOrders.reduce((total, order) => total + parseFloat(order.order_item_me_uom_value || 0), 0);
      totalFaciagutter = faciagutterOrders.reduce((total, order) => total + parseFloat(order.order_item_me_uom_value || 0), 0);
      totalCladding = claddingOrders.reduce((total, order) => total + parseFloat(order.order_item_me_uom_value || 0), 0);
      totalGBI = gbiOrders.reduce((total, order) => total + parseFloat(order.order_item_me_uom_value || 0), 0);
      totalRoofing = roofingOrders.reduce((total, order) => total + parseFloat(order.order_item_me_uom_value || 0), 0);
      totalGBIL = gbilOrders.reduce((total, order) => total + parseFloat(order.order_item_me_uom_value), 0);

      const orderCountExist = await OrderItemsCount.findOne({ Order_Mas_Id: orderID });
      const createOrderCount = new OrderItemsCount({
        Order_Mas_Id: orderID,
        Order_Flashing_Count: totalFlashing,
        Order_Jobbing_Count: totalJobing,
        Order_Cladding_Count: totalCladding,
        Order_Faciagutter_Count: totalFaciagutter,
        Order_GBI_Count: totalGBI,
        Order_Roofing_Count: totalRoofing,
        Order_GBIL_Count: totalGBIL,
      });

      if (orderCountExist) {
        const deleteResult = await OrderItemsCount.deleteMany({ Order_Mas_Id: orderID });
        if (deleteResult.deletedCount === 0) {
          const err = new Error("Item Count Table Deletion Failed");
          logError("assignOrderToProduction", err, req.user.user_ref_id);
          return res.status(500).send("Item Count Table Deletion Failed. Please Verify");
        }
      }

      try {
        const createOrderCountInfo = await createOrderCount.save();
        return res.status(200).send(createOrderCountInfo);
      } catch (err) {
        logError("assignOrderToProduction", err, req.user.user_ref_id);
        return res.status(500).send("Failed to create OrderItemsCount. Please Verify");
      }
    } else {
      return res.status(500).send("Designer Or QC Assignation Mismatch. Please Refresh and Recheck.");
    }
  } catch (err) {
    logError("assignOrderToProduction", err, req.user.user_ref_id);
    return res.status(500).send("Move to Production Failed");
  }
};

async function checkIndividualOrderStatus(orderid) {
  const orderID = new mongoose.Types.ObjectId(orderid);
  let OrdMasDetails = await OrderMaster.find({ _id: orderID });
  let OverallOrderStatus;
  let updateData;

  if (OrdMasDetails[0].f_order_prod_push_status === 0 && OrdMasDetails[0].fg_order_prod_push_status === 0 && OrdMasDetails[0].cl_order_prod_push_status === 0 && OrdMasDetails[0].j_order_prod_push_status === 0 && OrdMasDetails[0].roof_order_prod_push_status === 0 && OrdMasDetails[0].gbi_order_prod_push_status === 0 && OrdMasDetails[0].gbil_order_prod_push_status === 0) {
    updateData = {
      $set: {
        order_qc_status: 0,
        order_status: process.env.MasOrdStatus1,
        order_quote_checker_status: false,
        order_quote_id: "Nil",
      },
    };
    const conditions = { _id: orderID };
    await OrderMaster.findByIdAndUpdate(conditions, updateData, attrs);
    OverallOrderStatus = "Order Master Status Changed To 0";
  } else {
    if (
      (OrdMasDetails[0].f_order_prod_push_status === 0 || OrdMasDetails[0].f_order_prod_push_status === 2) &&
      (OrdMasDetails[0].fg_order_prod_push_status === 0 || OrdMasDetails[0].fg_order_prod_push_status === 2) &&
      (OrdMasDetails[0].cl_order_prod_push_status === 0 || OrdMasDetails[0].cl_order_prod_push_status === 2) &&
      (OrdMasDetails[0].j_order_prod_push_status === 0 || OrdMasDetails[0].j_order_prod_push_status === 2) &&
      (OrdMasDetails[0].roof_order_prod_push_status === 0 || OrdMasDetails[0].roof_order_prod_push_status === 2) &&
      (OrdMasDetails[0].gbi_order_prod_push_status === 0 || OrdMasDetails[0].gbi_order_prod_push_status === 2) &&
      (OrdMasDetails[0].gbil_order_prod_push_status === 0 || OrdMasDetails[0].gbil_order_prod_push_status === 1 || OrdMasDetails[0].gbil_order_prod_push_status === 2)
    ) {
      updateData = {
        $set: {
          order_qc_status: "4",
          order_status: process.env.MasOrdStatus5,
        },
      };
      const conditions = { _id: orderID };
      await OrderMaster.findByIdAndUpdate(conditions, updateData, attrs);
      OverallOrderStatus = "Order Status Changed To 4";
    } else {
      OverallOrderStatus = "Some Job Pending For Production Push";
      updateData = {
        $set: {
          order_qc_status: "2",
          order_status: process.env.MasOrdStatus2,
        },
      };
      const conditions = { _id: orderID };
      await OrderMaster.findByIdAndUpdate(conditions, updateData, attrs);
    }
  }
  return OverallOrderStatus;
}

exports.productionDashboardOrderList = async (req, res) => {
  try {
    let fullOrderObj = {};
    const limit = 10;
    const page = req.query.page;
    const skip = page * limit;
    const searchKeyword = req.query.query;
    const searchFilter = {};
    if (searchKeyword) {
      searchFilter.$or = [{ order_unique_id: { $regex: searchKeyword, $options: "i" } }];
    }

    const total_orders = await OrderMaster.find({
      order_qc_status: "4",
      $nor: [{ f_order_prod_current_status: { $exists: true } }, { cl_order_prod_current_status: { $exists: true } }, { j_order_prod_current_status: { $exists: true } }, { fg_order_prod_current_status: { $exists: true } }, { roof_order_prod_current_status: { $exists: true } }, { gbi_order_prod_current_status: { $exists: true } }],
      ...searchFilter,
    });
    let total_orders_count = total_orders.length;

    let orderDetails = await OrderMaster.aggregate([
      { $sort: { order_delivery_date: 1 } },
      {
        $match: {
          $or: [{ order_qc_status: "4" }],
          $nor: [{ f_order_prod_current_status: { $exists: true } }, { cl_order_prod_current_status: { $exists: true } }, { j_order_prod_current_status: { $exists: true } }, { fg_order_prod_current_status: { $exists: true } }, { roof_order_prod_current_status: { $exists: true } }, { gbi_order_prod_current_status: { $exists: true } }],
          ...searchFilter,
        },
      },
      { $lookup: { from: "accounts", as: "customerInfo", localField: "order_customer_id", foreignField: "_id" } },
      { $lookup: { from: "accountcontacts", as: "customercontactInfo", localField: "order_customer_contact_id", foreignField: "_id" } },
      { $lookup: { from: "orderssubitemcounts", as: "orderssubitemcountsInfo", localField: "_id", foreignField: "Order_Mas_Id" } },
      { $unwind: { path: "$customerInfo", preserveNullAndEmptyArrays: true } },
      { $unwind: { path: "$customercontactInfo", preserveNullAndEmptyArrays: true } },
      { $unwind: { path: "$orderssubitemcountsInfo", preserveNullAndEmptyArrays: true } },
      {
        $project: {
          _id: 1,
          order_unique_id: 1,
          order_customer_id: 1,
          order_delivery_date: 1,
          order_delivery_date_str: 1,
          order_delivery_time: 1,
          order_delivery_session: 1,
          order_delivery_address_mode: 1,
          order_delivery_address: 1,
          order_customer_PO_number: 1,
          order_customer_contact_phone: 1,
          order_customer_contact_email: 1,
          order_site_delivery_attention_person: 1,
          order_status: 1,
          order_Pieces: 1,
          order_qced_person: 1,
          order_qc_status: 1,
          order_flashing_checker: 1,
          created: 1,
          account_ID: "$customerInfo._id",
          account_UID: "$customerInfo.account_UID",
          account_Name: "$customerInfo.account_Name",
          account_Address: "$customerInfo.account_Address",
          account_StoreAddress: "$customerInfo.account_StoreAddress",
          account_Status: "$customerInfo.account_Status",
          account_DataRemoved: "$customerInfo.account_DataRemoved",
          Order_Flashing_Count: "$orderssubitemcountsInfo.Order_Flashing_Count",
          Order_Jobbing_Count: "$orderssubitemcountsInfo.Order_Jobbing_Count",
          Order_Cladding_Count: "$orderssubitemcountsInfo.Order_Cladding_Count",
          Order_Faciagutter_Count: "$orderssubitemcountsInfo.Order_Faciagutter_Count",
          Order_Roofing_Count: "$orderssubitemcountsInfo.Order_Roofing_Count",
          Order_GBI_Count: "$orderssubitemcountsInfo.Order_GBI_Count",
        },
      },
    ])
      .skip(skip)
      .limit(limit);
    let pages;
    if (total_orders_count <= limit) {
      pages = 0;
    } else {
      pages = Math.ceil(total_orders_count / limit);
    }
    fullOrderObj.totalItems = total_orders_count;
    fullOrderObj.fetchedItems = orderDetails;
    fullOrderObj.rowsPerPage = limit;
    fullOrderObj.totalPages = pages;
    res.send(fullOrderObj).status(200).end();
  } catch (err) {
    logError("productionDashboardOrderList", err, req.user.user_ref_id);
    res.status(500).send("Data Fetching Failed");
  }
};

exports.specificProductionOrderList = async (req, res) => {
  try {
    let fullOrderObj = {};
    const limit = 10;
    const page = req.query.page;
    const skip = page * limit;
    const userID = new mongoose.Types.ObjectId(req.user.user_ref_id);
    let total_orders = await OrderMaster.find({
      $or: [
        {
          $and: [
            {
              $or: [{ f_order_roll_user: userID }, { f_order_fold_user: userID }, { f_order_racking_user: userID }],
            },
            { f_order_prod_current_status: { $in: ["1", "3", "5", "7"] } },
          ],
        },
        {
          $and: [
            {
              $or: [{ cl_order_roll_user: userID }, { cl_order_fold_user: userID }, { cl_order_racking_user: userID }],
            },
            { cl_order_prod_current_status: { $in: ["1", "3", "5", "7"] } },
          ],
        },
        {
          $and: [
            {
              $or: [{ j_order_roll_user: userID }, { j_order_fold_user: userID }, { j_order_racking_user: userID }],
            },
            { j_order_prod_current_status: { $in: ["1", "3", "5", "7"] } },
          ],
        },
        {
          $and: [
            {
              $or: [{ fg_order_roll_user: userID }, { fg_order_fold_user: userID }, { fg_order_racking_user: userID }],
            },
            { fg_order_prod_current_status: { $in: ["1", "3", "5", "7"] } },
          ],
        },
      ],
    });

    let total_orders_count = total_orders.length;
    let orderDetails = await OrderMaster.aggregate([
      {
        $match: {
          $or: [
            {
              $and: [
                {
                  $or: [{ f_order_roll_user: userID }, { f_order_fold_user: userID }, { f_order_racking_user: userID }],
                },
                { f_order_prod_current_status: { $in: ["1", "3", "5", "7"] } },
              ],
            },
            {
              $and: [
                {
                  $or: [{ cl_order_roll_user: userID }, { cl_order_fold_user: userID }, { cl_order_racking_user: userID }],
                },
                { cl_order_prod_current_status: { $in: ["1", "3", "5", "7"] } },
              ],
            },
            {
              $and: [
                {
                  $or: [{ j_order_roll_user: userID }, { j_order_fold_user: userID }, { j_order_racking_user: userID }],
                },
                { j_order_prod_current_status: { $in: ["1", "3", "5", "7"] } },
              ],
            },
            {
              $and: [
                {
                  $or: [{ fg_order_roll_user: userID }, { fg_order_fold_user: userID }, { fg_order_racking_user: userID }],
                },
                { fg_order_prod_current_status: { $in: ["1", "3", "5", "7"] } },
              ],
            },
          ],
        },
      },
      { $sort: { created: -1 } },
      { $lookup: { from: "users", localField: "f_order_roll_user", foreignField: "_id", as: "usersFrollerInfo" } },
      { $lookup: { from: "users", localField: "f_order_fold_user", foreignField: "_id", as: "usersFfoldInfo" } },
      { $lookup: { from: "users", localField: "f_order_racking_user", foreignField: "_id", as: "usersFrackingInfo" } },
      { $lookup: { from: "users", localField: "cl_order_fold_user", foreignField: "_id", as: "usersCLfoldInfo" } },
      { $lookup: { from: "users", localField: "cl_order_racking_user", foreignField: "_id", as: "usersCLrackingInfo" } },
      { $lookup: { from: "users", localField: "j_order_fold_user", foreignField: "_id", as: "usersJfoldInfo" } },
      { $lookup: { from: "users", localField: "j_order_racking_user", foreignField: "_id", as: "usersJrackingInfo" } },
      { $lookup: { from: "users", localField: "fg_order_fold_user", foreignField: "_id", as: "usersFGfoldInfo" } },
      { $lookup: { from: "users", localField: "fg_order_racking_user", foreignField: "_id", as: "usersFGrackingInfo" } },
      { $lookup: { from: "orderssubitemcounts", localField: "_id", foreignField: "Order_Mas_Id", as: "orderssubitemcountsInfoF" } },
      { $lookup: { from: "orderssubitemcounts", localField: "_id", foreignField: "Order_Mas_Id", as: "orderssubitemcountsInfoCL" } },
      { $lookup: { from: "orderssubitemcounts", localField: "_id", foreignField: "Order_Mas_Id", as: "orderssubitemcountsInfoJ" } },
      { $lookup: { from: "orderssubitemcounts", localField: "_id", foreignField: "Order_Mas_Id", as: "orderssubitemcountsInfoFG" } },
      { $lookup: { from: "accounts", localField: "order_customer_id", foreignField: "_id", as: "accountsInfo" } },
      { $unwind: { path: "$usersFrollerInfo", preserveNullAndEmptyArrays: true } },
      { $unwind: { path: "$usersFfoldInfo", preserveNullAndEmptyArrays: true } },
      { $unwind: { path: "$usersFrackingInfo", preserveNullAndEmptyArrays: true } },
      { $unwind: { path: "$usersCLfoldInfo", preserveNullAndEmptyArrays: true } },
      { $unwind: { path: "$usersCLrackingInfo", preserveNullAndEmptyArrays: true } },
      { $unwind: { path: "$usersJfoldInfo", preserveNullAndEmptyArrays: true } },
      { $unwind: { path: "$usersJrackingInfo", preserveNullAndEmptyArrays: true } },
      { $unwind: { path: "$usersFGfoldInfo", preserveNullAndEmptyArrays: true } },
      { $unwind: { path: "$usersFGrackingInfo", preserveNullAndEmptyArrays: true } },
      { $unwind: { path: "$orderssubitemcountsInfoF", preserveNullAndEmptyArrays: true } },
      { $unwind: { path: "$orderssubitemcountsInfoCL", preserveNullAndEmptyArrays: true } },
      { $unwind: { path: "$orderssubitemcountsInfoJ", preserveNullAndEmptyArrays: true } },
      { $unwind: { path: "$orderssubitemcountsInfoFG", preserveNullAndEmptyArrays: true } },
      { $unwind: { path: "$accountsInfo", preserveNullAndEmptyArrays: true } },
      {
        $addFields: {
          FRollerFullName: {
            $concat: [{ $ifNull: ["$usersFrollerInfo.user_firstName", ""] }, " ", { $ifNull: ["$usersFrollerInfo.user_lastName", ""] }],
          },
          FFolderFullName: {
            $concat: [{ $ifNull: ["$usersFfoldInfo.user_firstName", ""] }, " ", { $ifNull: ["$usersFfoldInfo.user_lastName", ""] }],
          },
          FRackingFullName: {
            $concat: [{ $ifNull: ["$usersFrackingInfo.user_firstName", ""] }, " ", { $ifNull: ["$usersFrackingInfo.user_lastName", ""] }],
          },
          CLFolderFullName: {
            $concat: [{ $ifNull: ["$usersCLfoldInfo.user_firstName", ""] }, " ", { $ifNull: ["$usersCLfoldInfo.user_lastName", ""] }],
          },
          CLRackingFullName: {
            $concat: [{ $ifNull: ["$usersCLrackingInfo.user_firstName", ""] }, " ", { $ifNull: ["$usersCLrackingInfo.user_lastName", ""] }],
          },
          JFolderFullName: {
            $concat: [{ $ifNull: ["$usersJfoldInfo.user_firstName", ""] }, " ", { $ifNull: ["$usersJfoldInfo.user_lastName", ""] }],
          },
          JRackingFullName: {
            $concat: [{ $ifNull: ["$usersJrackingInfo.user_firstName", ""] }, " ", { $ifNull: ["$usersJrackingInfo.user_lastName", ""] }],
          },
          FGFolderFullName: {
            $concat: [{ $ifNull: ["$usersFGfoldInfo.user_firstName", ""] }, " ", { $ifNull: ["$usersFGfoldInfo.user_lastName", ""] }],
          },
          FGRackingFullName: {
            $concat: [{ $ifNull: ["$usersFGrackingInfo.user_firstName", ""] }, " ", { $ifNull: ["$usersFGrackingInfo.user_lastName", ""] }],
          },
        },
      },
      {
        $project: {
          _id: 1,
          order_unique_id: 1,
          order_invoice_id: 1,
          order_customer_id: 1,
          order_customer_contact_id: 1,
          order_delivery_date: 1,
          order_Overall_Price: 1,
          order_status: 1,
          order_delivery_address_mode: 1,
          order_delivery_address: 1,
          order_customer_PO_number: 1,
          order_flashing_checker: 1,
          user: 1,
          created: 1,
          updated: 1,
          order_created_person: 1,
          order_designed_person: 1,
          order_design_assigned_time: 1,
          order_qc_status: 1,
          order_qced_person: 1,
          order_qc_assigned_time: 1,
          order_qc_completed_time: 1,
          order_barcode_checker: 1,
          order_prod_current_status: 1,
          f_order_prod_current_status: 1,
          j_order_prod_current_status: 1,
          cl_order_prod_current_status: 1,
          fg_order_prod_current_status: 1,
          f_order_roll_user: 1,
          f_order_fold_user: 1,
          f_order_racking_user: 1,
          fg_order_fold_user: 1,
          fg_order_racking_user: 1,
          cl_order_fold_user: 1,
          cl_order_racking_user: 1,
          j_order_fold_user: 1,
          j_order_racking_user: 1,
          FRollerFullName: 1,
          FFolderFullName: 1,
          FRackingFullName: 1,
          CLFolderFullName: 1,
          CLRackingFullName: 1,
          JFolderFullName: 1,
          JRackingFullName: 1,
          FGFolderFullName: 1,
          FGRackingFullName: 1,
          Order_Flashing_Count: "$orderssubitemcountsInfoF.Order_Flashing_Count",
          Order_Cladding_Count: "$orderssubitemcountsInfoCL.Order_Cladding_Count",
          Order_Jobbing_Count: "$orderssubitemcountsInfoJ.Order_Jobbing_Count",
          Order_Faciagutter_Count: "$orderssubitemcountsInfoFG.Order_Faciagutter_Count",
          account_Name: "$accountsInfo.account_Name",
        },
      },
    ])
      .skip(skip)
      .limit(limit);

    let pages;
    if (total_orders_count <= limit) {
      pages = 0;
    } else {
      pages = Math.ceil(total_orders_count / limit);
    }
    fullOrderObj.totalItems = total_orders_count;
    fullOrderObj.fetchedItems = orderDetails;
    fullOrderObj.rowsPerPage = limit;
    fullOrderObj.totalPages = pages;
    res.send(fullOrderObj).status(200).end();
  } catch (err) {
    logError("specificProductionOrderList", err, req.user.user_ref_id);
    res.status(500).send("Data Fetching Failed");
  }
};

exports.fetchSpecificOrderBarcode = async (req, res) => {
  try {
    const orderID = new mongoose.Types.ObjectId(req.params.orderid);
    let orderMasterInfo = await OrderMaster.findOne({ _id: orderID });
    let status = orderMasterInfo.order_status;
    let ordStr = orderMasterInfo.order_unique_id;
    if (status === "Order Cancelled") {
      const err = new Error("Attempt To Fetch a Cancelled Order " + ordStr + " For Barcode Generation.");
      logError("fetchSpecificOrderBarcode", err, req.user.user_ref_id);
      return res.status(500).send("Cancelled Order. Please Recheck");
    }

    let orderDetails = await OrderMaster.aggregate([
      { $match: { _id: orderID } },
      { $lookup: { from: "accounts", as: "customerInfo", localField: "order_customer_id", foreignField: "_id" } },
      { $lookup: { from: "accountcontacts", as: "customercontactInfo", localField: "order_customer_contact_id", foreignField: "_id" } },
      { $lookup: { from: "orderssubitemcounts", as: "orderssubitemcountsInfo", localField: "_id", foreignField: "Order_Mas_Id" } },
      {
        $lookup: {
          from: "users",
          as: "assignedPersonInfo",
          let: { assignedPerson: "$order_designed_person" },
          pipeline: [
            {
              $match: {
                $expr: {
                  $eq: ["$_id", "$$assignedPerson"],
                },
              },
            },
            {
              $project: {
                fullName: { $concat: ["$user_firstName", " ", "$user_lastName"] },
              },
            },
          ],
        },
      },
      {
        $lookup: {
          from: "users",
          as: "qcPersonInfo",
          let: { qcedPerson: "$order_qced_person" },
          pipeline: [
            {
              $match: {
                $expr: {
                  $eq: ["$_id", "$$qcedPerson"],
                },
              },
            },
            {
              $project: {
                fullName: { $concat: ["$user_firstName", " ", "$user_lastName"] },
              },
            },
          ],
        },
      },
      { $unwind: { path: "$customerInfo", preserveNullAndEmptyArrays: true } },
      { $unwind: { path: "$customercontactInfo", preserveNullAndEmptyArrays: true } },
      { $unwind: { path: "$assignedPersonInfo", preserveNullAndEmptyArrays: true } },
      { $unwind: { path: "$qcPersonInfo", preserveNullAndEmptyArrays: true } },
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
          order_master_rack: 1,
          order_delivery_date_str: 1,
          order_delivery_time: 1,
          order_delivery_session: 1,
          order_delivery_address: 1,
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
          order_customer_contact_id: 1,
          order_flashing_checker: 1,
          order_site_delivery_city: 1,
          order_store_delivery_city: 1,
          order_delivery_address_mode: 1,
          order_status: 1,
          order_Pieces: 1,
          created: 1,
          created_str: 1,
          order_qc_status: 1,
          order_barcode_checker: 1,
          account_ID: "$customerInfo._id",
          account_UID: "$customerInfo.account_UID",
          account_Name: "$customerInfo.account_Name",
          account_Address: "$customerInfo.account_Address",
          account_Status: "$customerInfo.account_Status",
          account_StoreAddress: "$customerInfo.account_StoreAddress",
          account_DataRemoved: "$customerInfo.account_DataRemoved",
          account_Address_City: "$customerInfo.account_Address_City",
          account_Contact_Email: "$customercontactInfo.account_Contact_Email",
          account_Contact_Phone: "$customercontactInfo.account_Contact_Phone",
          Order_Flashing_Count: "$orderssubitemcountsInfo.Order_Flashing_Count",
          Order_Jobbing_Count: "$orderssubitemcountsInfo.Order_Jobbing_Count",
          Order_Cladding_Count: "$orderssubitemcountsInfo.Order_Cladding_Count",
          Order_Faciagutter_Count: "$orderssubitemcountsInfo.Order_Faciagutter_Count",
          Order_GBI_Count: "$orderssubitemcountsInfo.Order_GBI_Count",
          Order_Roofing_Count: "$orderssubitemcountsInfo.Order_Roofing_Count",
          account_Contact_Name: {
            $concat: ["$customercontactInfo.account_Contact_FName", " ", "$customercontactInfo.account_Contact_LName"],
          },
          order_designed_person_fullName: {
            $cond: {
              if: {
                $eq: [{ $type: "$order_designed_person" }, "objectId"],
              },
              then: "$assignedPersonInfo.fullName",
              else: "$order_designed_person",
            },
          },
          order_qced_person_fullName: {
            $cond: {
              if: {
                $eq: [{ $type: "$order_qced_person" }, "objectId"],
              },
              then: "$qcPersonInfo.fullName",
              else: "$order_qced_person",
            },
          },
        },
      },
    ]);
    res.send(orderDetails).status(200).end();
  } catch (err) {
    logError("fetchSpecificOrderBarcode", err, req.user.user_ref_id);
    res.status(500).send("Data Fetching Failed");
  }
};

async function RecalculateOrderItemsCountFn(orderid) {
  const orderID = new mongoose.Types.ObjectId(orderid);
  let totalFlashing = 0;
  let totalJobing = 0;
  let totalCladding = 0;
  let totalFaciagutter = 0;
  let totalRoofing = 0;
  let totalGBI = 0;
  let totalGBIL = 0;

  const flashingOrders = await OrderItem.find({ order_master_id: orderID });
  for (let k = 0; k < flashingOrders.length; k++) {
    totalFlashing = parseInt(totalFlashing) + parseInt(flashingOrders[k].order_item_pieces);
  }
  const customdept = await Department.find({ department_status: "active" }).sort({ department_order: 1 });
  const departmentIds = customdept.map(dept => dept._id);

  const [jobingOrders, faciagutterOrders, claddingOrders, gbiOrders, roofingOrders, gbilOrders] = await Promise.all([
    OrderItemManual.find({
      order_master_me_id: orderID,
      order_item_me_department: departmentIds[0],
    }),
    OrderItemManual.find({
      order_master_me_id: orderID,
      order_item_me_department: departmentIds[1],
    }),
    OrderItemManual.find({
      order_master_me_id: orderID,
      order_item_me_department: departmentIds[2],
    }),
    OrderItemManual.find({
      order_master_me_id: orderID,
      order_item_me_department: departmentIds[3],
    }),
    OrderItemManual.find({
      order_master_me_id: orderID,
      order_item_me_department: departmentIds[4],
    }),
    OrderItemManual.find({
      order_master_me_id: orderID,
      order_item_me_department: departmentIds[5],
    }),
  ]);

  totalJobing = jobingOrders.reduce((total, order) => total + parseFloat(order.order_item_me_uom_value), 0);
  totalFaciagutter = faciagutterOrders.reduce((total, order) => total + parseFloat(order.order_item_me_uom_value), 0);
  totalCladding = claddingOrders.reduce((total, order) => total + parseFloat(order.order_item_me_uom_value), 0);
  totalGBI = gbiOrders.reduce((total, order) => total + parseFloat(order.order_item_me_uom_value), 0);
  totalRoofing = roofingOrders.reduce((total, order) => total + parseFloat(order.order_item_me_uom_value), 0);
  totalGBIL = gbilOrders.reduce((total, order) => total + parseFloat(order.order_item_me_uom_value), 0);
  
  // Prepare the new OrderItemsCount document
  const createOrderCountInfo = await OrderItemsCount.findOneAndUpdate(
    { Order_Mas_Id: orderID },
    {
      $set: {
        Order_Flashing_Count: totalFlashing,
        Order_Jobbing_Count: totalJobing,
        Order_Cladding_Count: totalCladding,
        Order_Faciagutter_Count: totalFaciagutter,
        Order_GBI_Count: totalGBI,
        Order_Roofing_Count: totalRoofing,
        Order_GBIL_Count: totalGBIL,
      },
    },
    {
      upsert: true,        // Create if doesn't exist
      new: true,           // Return updated document
      setDefaultsOnInsert: true,  // Apply schema defaults on insert
    }
  );
  return createOrderCountInfo;
}
//Code change by Rahul
module.exports.RecalculateOrderItemsCountFn = RecalculateOrderItemsCountFn;

async function RecalculateOverallOrderTotalFn(orderid) {
  const orderID = new mongoose.Types.ObjectId(orderid);
  let orderInfo = await OrderItem.aggregate([
    { $match: { order_master_id: orderID } },
    {
      $group: {
        _id: null,
        Gst_Exp_Total_DT: { $sum: { $toDouble: "$order_item_special_price_original" } },
        Discount_Total_DT: { $sum: { $toDouble: "$order_item_discounted_amount" } },
        Gst_Taxable_Total_DT: { $sum: { $toDouble: "$order_item_special_price" } },
      },
    },
  ]);

  let orderManualInfo = await OrderItemManual.aggregate([
    { $match: { order_master_me_id: orderID } },
    {
      $group: {
        _id: null,
        Gst_Exp_Total_ME: { $sum: { $toDouble: "$order_item_special_me_price_original" } },
        Discount_Total_ME: { $sum: { $toDouble: "$order_item_me_discounted_amount" } },
        Gst_Taxable_Total_ME: { $sum: { $toDouble: "$order_item_special_me_price" } },
      },
    },
  ]);

  let Sum_Gst_Exp_Total_DT = orderInfo.length > 0 ? orderInfo[0].Gst_Exp_Total_DT : 0;
  let Sum_Discount_Total_DT = orderInfo.length > 0 ? orderInfo[0].Discount_Total_DT : 0;
  let Sum_Gst_Taxable_Total_DT = orderInfo.length > 0 ? orderInfo[0].Gst_Taxable_Total_DT : 0;

  let Sum_Gst_Exp_Total_ME = orderManualInfo.length > 0 ? orderManualInfo[0].Gst_Exp_Total_ME : 0;
  let Sum_Discount_Total_ME = orderManualInfo.length > 0 ? orderManualInfo[0].Discount_Total_ME : 0;
  let Sum_Gst_Taxable_Total_ME = orderManualInfo.length > 0 ? orderManualInfo[0].Gst_Taxable_Total_ME : 0;

  let Sum_Gst_Exp_Total = Sum_Gst_Exp_Total_DT + Sum_Gst_Exp_Total_ME;
  let Sum_Discount_Total = Sum_Discount_Total_DT + Sum_Discount_Total_ME;
  let Sum_Gst_Taxable_Total = Sum_Gst_Taxable_Total_DT + Sum_Gst_Taxable_Total_ME;

  // Apply 10% GST
  const GST_RATE = 0.1;
  let GST_Total = Sum_Gst_Taxable_Total * GST_RATE;
  let Overall_Grant_Total = Sum_Gst_Taxable_Total + GST_Total;

  let conditions = { _id: orderID };
  let updateData = {
    $set: {
      order_Overall_Price: Overall_Grant_Total,
      order_GST_EXP_Total: Sum_Gst_Exp_Total,
      order_Discount_Total: Sum_Discount_Total,
      order_GST_Taxable_Total: Sum_Gst_Taxable_Total,
      order_Tax_Total: GST_Total,
    },
  };
  let updatedOrderMasterPrice = await OrderMaster.findByIdAndUpdate(conditions, updateData, { new: true });
  if (updatedOrderMasterPrice) {
    console.log("Overall Order Master Price Updated With GST!!! ");
  }
  return updatedOrderMasterPrice;
}

 //Code Changed By Rahul
module.exports.RecalculateOverallOrderTotalFn = RecalculateOverallOrderTotalFn;

async function RecalculateOverallQuotesTotalFn(quoteid) {
  const quoteID = new mongoose.Types.ObjectId(quoteid);
  let quoteInfo = await QuotationItem.aggregate([
    { $match: { quote_master_id: quoteID } },
    {
      $group: {
        _id: null,
        Gst_Exp_Total_DT: { $sum: { $toDouble: "$quote_item_special_price_original" } },
        Discount_Total_DT: { $sum: { $toDouble: "$quote_item_discounted_amount" } },
        Gst_Taxable_Total_DT: { $sum: { $toDouble: "$quote_item_special_price" } },
      },
    },
  ]);

  let quoteManualInfo = await QuotationItemManual.aggregate([
    { $match: { quote_master_me_id: quoteID } },
    {
      $group: {
        _id: null,
        Gst_Exp_Total_ME: { $sum: { $toDouble: "$quote_item_special_me_price_original" } },
        Discount_Total_ME: { $sum: { $toDouble: "$quote_item_me_discounted_amount" } },
        Gst_Taxable_Total_ME: { $sum: { $toDouble: "$quote_item_special_me_price" } },
      },
    },
  ]);

  let Sum_Gst_Exp_Total_DT = quoteInfo.length > 0 ? quoteInfo[0].Gst_Exp_Total_DT : 0;
  let Sum_Discount_Total_DT = quoteInfo.length > 0 ? quoteInfo[0].Discount_Total_DT : 0;
  let Sum_Gst_Taxable_Total_DT = quoteInfo.length > 0 ? quoteInfo[0].Gst_Taxable_Total_DT : 0;
  let Sum_Gst_Exp_Total_ME = quoteManualInfo.length > 0 ? quoteManualInfo[0].Gst_Exp_Total_ME : 0;
  let Sum_Discount_Total_ME = quoteManualInfo.length > 0 ? quoteManualInfo[0].Discount_Total_ME : 0;
  let Sum_Gst_Taxable_Total_ME = quoteManualInfo.length > 0 ? quoteManualInfo[0].Gst_Taxable_Total_ME : 0;
  let Sum_Gst_Exp_Total = Sum_Gst_Exp_Total_DT + Sum_Gst_Exp_Total_ME;
  let Sum_Discount_Total = Sum_Discount_Total_DT + Sum_Discount_Total_ME;
  let Sum_Gst_Taxable_Total = Sum_Gst_Taxable_Total_DT + Sum_Gst_Taxable_Total_ME;

  // Apply 10% GST
  const GST_RATE = 0.1;
  let GST_Total = Sum_Gst_Taxable_Total * GST_RATE;
  let Overall_Grant_Total = Sum_Gst_Taxable_Total + GST_Total;
  let conditions = { _id: quoteID };
  let updateData = {
    $set: {
      quote_Overall_Price: Overall_Grant_Total,
      quote_GST_EXP_Total: Sum_Gst_Exp_Total,
      quote_Discount_Total: Sum_Discount_Total,
      quote_GST_Taxable_Total: Sum_Gst_Taxable_Total,
      quote_Tax_Total: GST_Total,
    },
  };
  let updatedQuoteMasterPrice = await QuotationMaster.findByIdAndUpdate(conditions, updateData, { new: true });
  if (updatedQuoteMasterPrice) {
    console.log("Overall Quote Master Price Updated With GST!!! ");
  }
  return updatedQuoteMasterPrice;
}
// Quatation code
module.exports.RecalculateOverallQuotesTotalFn = RecalculateOverallQuotesTotalFn;


async function RecalculateUserJobCountFn(orderid, dept_code) {
  try {
    const orderID = new mongoose.Types.ObjectId(orderid);
    let updateData;
    const orderUserJobDetails = await OrderUserJobsCount.find({ Order_Id: orderID, Order_Dept_Code: dept_code });
    if (orderUserJobDetails.length > 0) {
      const orderItemsCount = await OrderItemsCount.findOne({ Order_Mas_Id: orderID });
      if (!orderItemsCount) {
        console.error("Order items count not found for the given order ID.");
        return null;
      }
      switch (dept_code) {
        case "F":
          updateData = { $set: { Order_Job_Count: orderItemsCount.Order_Flashing_Count } };
          break;
        case "FG":
          updateData = { $set: { Order_Job_Count: orderItemsCount.Order_Faciagutter_Count } };
          break;
        case "CL":
          updateData = { $set: { Order_Job_Count: orderItemsCount.Order_Cladding_Count } };
          break;
        case "J":
          updateData = { $set: { Order_Job_Count: orderItemsCount.Order_Jobbing_Count } };
          break;
        case "GBI":
          updateData = { $set: { Order_Job_Count: orderItemsCount.Order_GBI_Count } };
          break;
        case "ROOF":
          updateData = { $set: { Order_Job_Count: orderItemsCount.Order_Roofing_Count } };
          break;
        default:
          console.error("Invalid department code provided.");
          return null;
      }

      const conditions = { Order_Id: orderID, Order_Dept_Code: dept_code };
      const updatedUserJobCount = await OrderUserJobsCount.updateMany(conditions, updateData);
      return updatedUserJobCount;
    } else {
      return null;
    }
  } catch (error) {
    logError("RecalculateUserJobCountFn", error, req.user.user_ref_id);
    throw error;
  }
}
//Code Change by Rahul
// Export for use in other files
module.exports.RecalculateUserJobCountFn = RecalculateUserJobCountFn;

exports.CorrectAllOrderMasterTotals = async (req, res) => {
  try {
    const orderMasters = await OrderMaster.find();
    let data = 0;
    for (let orderMaster of orderMasters) {
      const orderID = orderMaster._id;
      let orderInfo = await OrderItem.aggregate([{ $match: { order_master_id: new mongoose.Types.ObjectId(orderID) } }, { $group: { _id: null, totalSpecialPrice: { $sum: { $toDouble: "$order_item_special_price" } } } }]);

      let orderManualInfo = await OrderItemManual.aggregate([{ $match: { order_master_me_id: new mongoose.Types.ObjectId(orderID) } }, { $group: { _id: null, totalSpecialMePrice: { $sum: { $toDouble: "$order_item_special_me_price" } } } }]);

      let OrderTotal = orderInfo.length > 0 ? orderInfo[0].totalSpecialPrice : 0;
      let manualOrderTotal = orderManualInfo.length > 0 ? orderManualInfo[0].totalSpecialMePrice : 0;

      let overallOrderPrice = OrderTotal + manualOrderTotal;
      let conditions = { _id: orderID };
      let updateData = { $set: { order_Overall_Price: overallOrderPrice } };
      let updatedOrderMasterPrice = await OrderMaster.findByIdAndUpdate(conditions, updateData, { new: true });

      if (updatedOrderMasterPrice) {
        data++;
        console.log(`ORDER PROCESSED: ${data}`);
      } else {
        console.log(`Failed to Update Order Master Price for Order ID: ${orderID}`);
      }
    }

    res.status(200).send("All Order Master Prices Updated Successfully");
  } catch (err) {
    logError("CorrectAllOrderMasterTotals", err, req.user.user_ref_id);
    res.status(500).send("Internal Server Error");
  }
};

const pdfkit = require("pdfkit");
const { ifError } = require("assert");
const { truncate } = require("fs/promises");
const orderLineNumber = require("../models/orderLineNumberModel");
const Roles = require("../models/roleModel");
const { postSystemMessage } = require("./messagesCtrl");
const ExternalOrders = require("../models/externalOrderModel");
const fsPromises = require("fs/promises");
const { docketHTMLContent, docketHeader, docketFooter } = require("../templates/docket");
const { makeInCondition, makeEqCondition, computeOrderFields, processMudMap, convertImageToPDF } = require("./common");
const { handleMongooseError } = require("./common");
const MAX_RETRIES = 3;
const RETRY_DELAY_MS = 3000;

async function sendEmailWithRetry(mailTransporter, mailOptions, retries = MAX_RETRIES) {
  let attempt = 0;
  while (attempt < retries) {
    try {
      attempt++;
      const response = await mailTransporter.sendMail(mailOptions);
      return response;
    } catch (error) {
      console.error(`Error sending email on attempt ${attempt}`);
      if (attempt < retries) {
        await new Promise(resolve => setTimeout(resolve, RETRY_DELAY_MS)); // Delay before retrying
      } else {
        throw error;
      }
    }
  }
}

function generatePdfFromImage(imageFilePath, pdfFilePath) {
  return new Promise((resolve, reject) => {
    const doc = new pdfkit({ size: [4 * 72, 6 * 72] });
    const stream = fs.createWriteStream(pdfFilePath);

    doc.rotate(90);
    doc.image(imageFilePath, 0, -4 * 72, {
      width: 6 * 72,
      height: 4 * 72
    });

    doc.pipe(stream);
    doc.end();

    stream.on("finish", resolve);
    stream.on("error", reject);
  });
}

const DEPARTMENT_CONFIG = {
  F: {
    imagesField: 'order_images_f',
    barcodeField: 'order_barcode_images_f',
    mailStatusField: 'f_mail_push_status',
    prodStatusField: 'f_order_prod_push_status',
    jobName: '- Flashing',
    needsDesignStage: true
  },
  FG: {
    imagesField: 'order_images_fg',
    barcodeField: 'order_barcode_images_fg',
    mailStatusField: 'fg_mail_push_status',
    prodStatusField: 'fg_order_prod_push_status',
    jobName: '- Fascia Gutter',
    needsDesignStage: false
  },
  J: {
    imagesField: 'order_images_j',
    barcodeField: 'order_barcode_images_j',
    mailStatusField: 'j_mail_push_status',
    prodStatusField: 'j_order_prod_push_status',
    jobName: '- Jobbing',
    needsDesignStage: false
  },
  CL: {
    imagesField: 'order_images_cl',
    barcodeField: 'order_barcode_images_cl',
    mailStatusField: 'cl_mail_push_status',
    prodStatusField: 'cl_order_prod_push_status',
    jobName: '- Cladding',
    needsDesignStage: false
  },
  GBI: {
    imagesField: 'order_images_gbi',
    barcodeField: 'order_barcode_images_gbi',
    mailStatusField: 'gbi_mail_push_status',
    prodStatusField: 'gbi_order_prod_push_status',
    jobName: '- GBI',
    needsDesignStage: false
  },
  ROOF: {
    imagesField: 'order_images_roof',
    barcodeField: 'order_barcode_images_roof',
    mailStatusField: 'roof_mail_push_status',
    prodStatusField: 'roof_order_prod_push_status',
    jobName: '- Roofing',
    needsDesignStage: false
  }
};

// ✅ OPTIMIZATION: Reusable helper functions
const FileUtils = {
  /**
   * Delete files with proper error handling
   */
  deleteFiles: (files) => {
    if (!files || files.length === 0) return;
    
    const deletePromises = files.map(file => {
      return new Promise((resolve) => {
        fs.unlink(file.path, (err) => {
          if (err) {
            console.error(`Error deleting file ${file.path}:`, err);
          } else {
            console.log(`Deleted file ${file.path}`);
          }
          resolve(); // Always resolve, don't fail on cleanup errors
        });
      });
    });
    
    return Promise.all(deletePromises);
  },

  /**
   * Safely delete files synchronously (for cleanup in catch blocks)
   */
  deleteFilesSync: (files) => {
    if (!files || files.length === 0) return;
    
    files.forEach(file => {
      try {
        if (fs.existsSync(file.path)) {
          fs.unlinkSync(file.path);
          console.log(`Deleted file ${file.path}`);
        }
      } catch (err) {
        console.error(`Error deleting file ${file.path}:`, err);
      }
    });
  },

  /**
   * Generate PDF from image
   */
  generatePDF: async (imageFilePath, imageFileName, outputDir) => {
    return new Promise((resolve, reject) => {
      try {
        const pdfFileName = imageFileName?.replace(/\.[^/.]+$/, "") + ".pdf";
        const pdfFilePath = path.join(outputDir, pdfFileName);
        
        const doc = new pdfkit({ size: [4 * 72, 6 * 72] });
        const writeStream = fs.createWriteStream(pdfFilePath);
        
        doc.pipe(writeStream);
        doc.rotate(90);
        doc.image(imageFilePath, 0, -4 * 72, { width: 6 * 72, height: 4 * 72 });
        doc.end();
        
        writeStream.on('finish', () => {
          resolve({ filename: pdfFileName, path: pdfFilePath });
        });
        
        writeStream.on('error', reject);
        doc.on('error', reject);
      } catch (error) {
        reject(error);
      }
    });
  }
};

// ✅ OPTIMIZATION: S3 helper functions
const S3Utils = {
  /**
   * Get signed URL for a single image
   */
  getSignedUrl: async (imageName) => {
    const command = new GetObjectCommand({
      Bucket: "encore-sheet",
      Key: imageName,
    });
    const url = await getSignedUrl(s3Client, command, { expiresIn: 3600 });
    return { filename: imageName, path: url };
  },

  /**
   * Get signed URLs for multiple images in parallel
   */
  getSignedUrls: async (imageNames) => {
    if (!imageNames || imageNames.length === 0) return [];
    return Promise.all(imageNames.map(name => S3Utils.getSignedUrl(name)));
  }
};

// ✅ MAIN OPTIMIZED FUNCTION
exports.sentBarcodeDesignsForPrinting = async (req, res) => {
  const orderImagesPDF = [];
  const orderImages = [];
  
  try {
    // ✅ OPTIMIZATION: Input validation
    const orderID = new mongoose.Types.ObjectId(req.params.orderid);
    const OrdDept = req.params.dept?.toUpperCase();
    
    if (!OrdDept || !DEPARTMENT_CONFIG[OrdDept]) {
      return res.status(400).send(`Invalid department: ${OrdDept}`);
    }
    
    const deptConfig = DEPARTMENT_CONFIG[OrdDept];
    
    // ✅ OPTIMIZATION: Use lean() and only select needed fields
    const orderMasDetails = await OrderMaster.findById(orderID)
      .select({
        order_unique_id: 1,
        order_flashing_checker: 1,
        [deptConfig.imagesField]: 1
      })
      .lean();
    
    if (!orderMasDetails) {
      return res.status(404).send(`Order not found: ${orderID}`);
    }
    
    const orderUID = orderMasDetails.order_unique_id;
    const orderDesignImages = orderMasDetails[deptConfig.imagesField] || [];
    
    // ✅ OPTIMIZATION: Determine order type once
    const orderType = orderMasDetails.order_flashing_checker === false
      ? `(Custom Order) ${deptConfig.jobName}`
      : deptConfig.jobName;
    
    // ✅ OPTIMIZATION: Get signed URLs in parallel
    const orderDesignPDFImages = await S3Utils.getSignedUrls(orderDesignImages);
    
    // ✅ OPTIMIZATION: Process uploaded files
    let orderImagesNames = [];
    if (req.files && req.files.length > 0) {
      orderImages.push(...req.files.map(file => ({ 
        filename: file.filename, 
        path: file.path 
      })));
      orderImagesNames = req.files.map(file => file.filename);
      
      // ✅ OPTIMIZATION: Update barcode images in database
      await OrderMaster.findByIdAndUpdate(
        orderID,
        { $set: { [deptConfig.barcodeField]: orderImagesNames } }
      );
    }
    
    // ✅ OPTIMIZATION: Create nodemailer transporter once
    const mailTransporter = nodemailer.createTransport({
      service: "gmail",
      auth: {
        user: process.env.From_Email,
        pass: process.env.From_Email_PW,
      },
    });
    
    // ✅ OPTIMIZATION: Generate PDFs in parallel
    const pdfDir = path.join(__dirname, "..", "barcodeimagespdf");
    const pdfPromises = orderImages.map(image => {
      const imageFilePath = path.join(__dirname, "..", image.path);
      return FileUtils.generatePDF(imageFilePath, image.filename, pdfDir);
    });
    
    const generatedPDFs = await Promise.all(pdfPromises);
    orderImagesPDF.push(...generatedPDFs);
    
    if (orderImagesPDF.length === 0) {
      await FileUtils.deleteFiles(orderImages);
      return res.status(400).send("No barcode images to send");
    }
    
    // ✅ OPTIMIZATION: Prepare email options
    const mailOptionsWithPDF = {
      from: process.env.From_Email,
      to: process.env.Barcode_Email,
      subject: `${orderUID} Barcodes ${orderType}`,
      text: `Barcode Images for the OrderID: ${orderUID} attached`,
      attachments: orderImagesPDF,
    };
    
    const mailPDFOptions = {
      from: process.env.From_Email,
      to: process.env.DesignPDF_Email,
      subject: `${orderUID} Design PDFs/Documents ${orderType}`,
      text: `Design PDF Images for the OrderID: ${orderUID} attached`,
      attachments: orderDesignPDFImages,
    };
    
    // ✅ OPTIMIZATION: Send emails in parallel
    let emailResponse, emailPDFResponse;
    let emailErrors = [];
    
    try {
      [emailResponse, emailPDFResponse] = await Promise.allSettled([
        sendEmailWithRetry(mailTransporter, mailOptionsWithPDF),
        sendEmailWithRetry(mailTransporter, mailPDFOptions)
      ]);
      
      // Check for email failures
      if (emailResponse.status === 'rejected') {
        emailErrors.push(`Barcode email failed: ${emailResponse.reason}`);
        logError("sentBarcodeDesignsForPrinting", emailResponse.reason, req.user.user_ref_id);
      }
      
      if (emailPDFResponse.status === 'rejected') {
        emailErrors.push(`Design PDF email failed: ${emailPDFResponse.reason}`);
        logError("sentBarcodeDesignsForPrinting", emailPDFResponse.reason, req.user.user_ref_id);
      }
      
      // Extract values from fulfilled promises
      emailResponse = emailResponse.status === 'fulfilled' ? emailResponse.value : null;
      emailPDFResponse = emailPDFResponse.status === 'fulfilled' ? emailPDFResponse.value : null;
      
    } catch (error) {
      logError("sentBarcodeDesignsForPrinting", error, req.user.user_ref_id);
      await FileUtils.deleteFiles(orderImagesPDF);
      await FileUtils.deleteFiles(orderImages);
      return res.status(500).send(`Email sending failed: ${error.message}`);
    }
    
    // ✅ OPTIMIZATION: Check email success
    const emailSuccess = emailResponse && emailPDFResponse &&
      emailResponse.messageId && emailPDFResponse.messageId &&
      emailResponse.accepted?.length > 0 && emailPDFResponse.accepted?.length > 0 &&
      emailResponse.rejected?.length === 0 && emailPDFResponse.rejected?.length === 0;
    
    if (emailSuccess) {
      // ✅ OPTIMIZATION: Build update object dynamically
      const updateMPData = {
        $set: {
          [deptConfig.mailStatusField]: 1,
          [deptConfig.prodStatusField]: "2"
        }
      };
      
      // Add design stage and completion time for Flashing department
      if (deptConfig.needsDesignStage) {
        updateMPData.$set.order_design_stage = "5";
        updateMPData.$set.order_qc_completed_time = new Date().toISOString();
      }
      
      // ✅ OPTIMIZATION: Update order and check status in sequence
      const updatedOrderInfoMP = await OrderMaster.findByIdAndUpdate(
        orderID,
        updateMPData,
        { new: true }
      );
      
      if (updatedOrderInfoMP) {
        await checkIndividualOrderStatus(req.params.orderid);
      }
      
      // ✅ OPTIMIZATION: Cleanup files after successful email
      await FileUtils.deleteFiles(orderImagesPDF);
      await FileUtils.deleteFiles(orderImages);
      
      res.status(200).json({
        success: true,
        message: "Emails sent successfully",
        order: updatedOrderInfoMP,
        warnings: emailErrors.length > 0 ? emailErrors : undefined
      });
      
    } else {
      // Email sending failed
      await FileUtils.deleteFiles(orderImagesPDF);
      await FileUtils.deleteFiles(orderImages);
      
      const errorMessage = emailErrors.length > 0 
        ? emailErrors.join('; ') 
        : `Email Sending Failed For Dept ${OrdDept}: ${orderUID}`;
      
      const err = new Error(errorMessage);
      logError("sentBarcodeDesignsForPrinting", err, req.user.user_ref_id);
      
      return res.status(500).send(errorMessage);
    }
    
  } catch (err) {
    logError("sentBarcodeDesignsForPrinting", err, req.user.user_ref_id);
    console.error('Error in sentBarcodeDesignsForPrinting:', err);
    
    // ✅ OPTIMIZATION: Emergency cleanup
    try {
      FileUtils.deleteFilesSync(orderImagesPDF);
      FileUtils.deleteFilesSync(orderImages);
    } catch (cleanupError) {
      console.error('Error during cleanup:', cleanupError);
    }
    
    res.status(500).send("Email Sending Failed. Please Resend!!!");
  }
};

exports.emailSentDefectList = async (req, res) => {
  try {
    let orderDetails = await OrderMaster.aggregate([
      { $sort: { created: -1 } },
      {
        $match: {
          $or: [{ f_mail_push_status: 2 }, { fg_mail_push_status: 2 }, { cl_mail_push_status: 2 }, { j_mail_push_status: 2 }, { roof_mail_push_status: 2 }, { gbi_mail_push_status: 2 }],
        },
      },
      {
        $project: {
          _id: 1,
          order_unique_id: 1,
          f_mail_push_status: 1,
          fg_mail_push_status: 1,
          cl_mail_push_status: 1,
          j_mail_push_status: 1,
          roof_mail_push_status: 1,
          gbi_mail_push_status: 1,
        },
      },
    ]);

    res.status(200).send(orderDetails).end();
  } catch (err) {
    logError("emailSentDefectList", err, req.user.user_ref_id);
    res.status(500).send("Data Fetching Failed.");
  }
};

exports.sentBarcodeDesignsForPrintingManual = async (req, res) => {
  try {
    const orderID = new mongoose.Types.ObjectId(req.params.orderid);
    let orderMasterInfo = await OrderMaster.findOne({ _id: orderID });
    let status = orderMasterInfo.order_status;
    if (status === "Order Cancelled") {
      return res.status(500).send("Cancelled Order. Please Recheck");
    }

    const orderMasDetails = await OrderMaster.find({ _id: orderID });
    const orderUID = orderMasDetails[0].order_unique_id;
    let orderDesignImages;
    let orderBarcodeImages;
    let OrdDept = req.params.dept;

    if (OrdDept === "F") {
      orderDesignImages = orderMasDetails[0].order_images_f;
      orderBarcodeImages = orderMasDetails[0].order_barcode_images_f;
      orderJobName = "- Flashing";
    }
    if (OrdDept === "FG") {
      orderDesignImages = orderMasDetails[0].order_images_fg;
      orderBarcodeImages = orderMasDetails[0].order_barcode_images_fg;
      orderJobName = "- Fascia Gutter";
    }
    if (OrdDept === "J") {
      orderDesignImages = orderMasDetails[0].order_images_j;
      orderBarcodeImages = orderMasDetails[0].order_barcode_images_j;
      orderJobName = "- Jobbing";
    }
    if (OrdDept === "CL") {
      orderDesignImages = orderMasDetails[0].order_images_cl;
      orderBarcodeImages = orderMasDetails[0].order_barcode_images_cl;
      orderJobName = "- Cladding";
    }
    if (OrdDept === "ROOF") {
      orderDesignImages = orderMasDetails[0].order_images_roof;
      orderBarcodeImages = orderMasDetails[0].order_barcode_images_roof;
      orderJobName = "- Roofing";
    }
    if (OrdDept === "GBI") {
      orderDesignImages = orderMasDetails[0].order_images_gbi;
      orderBarcodeImages = orderMasDetails[0].order_barcode_images_gbi;
      orderJobName = "- Roofing";
    }

    let orderType;
    if (orderMasDetails[0].order_flashing_checker === false) {
      orderType = "(Custom Order) " + orderJobName;
    } else {
      orderType = orderJobName;
    }

    let orderDesignPDFImages = [];
    if (orderDesignImages) {
      const imageNames = orderDesignImages.map(image => image);
      const designImagesDir = path.resolve(__dirname, "../designimages");
      for (const imageName of imageNames) {
        const imagePath = path.join(designImagesDir, imageName);
        if (fs.existsSync(imagePath)) {
          orderDesignPDFImages.push({ filename: imageName, path: imagePath });
        }
      }
      orderDesignPDFImages = [...orderDesignPDFImages];
    }

    let BarcodeImages = [];
    if (orderBarcodeImages) {
      const BarcodeimageNames = orderBarcodeImages.map(file => file?.replace(".jpg", ".pdf"));
      const barcodeImagesDir = path.resolve(__dirname, "../barcodeimagespdf");
      for (const BarcodeimageName of BarcodeimageNames) {
        const BRimagePath = path.join(barcodeImagesDir, BarcodeimageName);
        if (fs.existsSync(BRimagePath)) {
          BarcodeImages.push({ filename: BarcodeimageName, path: BRimagePath });
        }
      }
    }
    BarcodeImages = [...BarcodeImages];

    const mailTransporter = nodemailer.createTransport({
      service: "gmail",
      auth: {
        user: `${process.env.From_Email}`,
        pass: `${process.env.From_Email_PW}`,
      },
    });

    const mailPDFOptions = {
      from: `${process.env.From_Email}`,
      to: `${process.env.DesignPDF_Email}`,
      subject: orderUID + " Design Documents " + orderType,
      text: "Design PDF Images for the OrderID:" + orderUID + " attached",
      attachments: orderDesignPDFImages,
    };

    const mailOptions = {
      from: `${process.env.From_Email}`,
      to: `${process.env.Barcode_Email}`,
      cc: `${process.env.From_Email_CC}`,
      subject: orderUID + " Barcodes " + orderType,
      text: "Barcode Images for the OrderID:" + orderUID + " attached",
      attachments: BarcodeImages,
    };

    let emailsSentSuccessfully = false;

    const [emailResponse, emailPDFResponse] = await Promise.all([
      mailTransporter.sendMail(mailOptions).catch(error => {
        console.error("Error sending barcode email:", error);
        return false;
      }),
      mailTransporter.sendMail(mailPDFOptions).catch(error => {
        console.error("Error sending design PDF email:", error);
        return false;
      }),
    ]);

    if (emailResponse && emailPDFResponse && emailResponse.messageId && emailPDFResponse.messageId && emailResponse.accepted.length > 0 && emailPDFResponse.accepted.length > 0 && emailResponse.rejected.length === 0 && emailPDFResponse.rejected.length === 0) {
      emailsSentSuccessfully = true;
    }
    if (emailsSentSuccessfully) {
      res.status(200).json({
        message: "Emails sent successfully",
        barcodeResponse: emailResponse,
        designPDFResponse: emailPDFResponse,
      });
    } else {
      res.status(500).send("Error in Sending(Barcode/PDF) emails. Please Resend!!!");
    }
  } catch (err) {
    logError("sentBarcodeDesignsForPrintingManual", err, req.user.user_ref_id);
    res.status(500).send("Email Sending Failed.");
  }
};

// exports.assignToStartProduction = async (req, res) => {
//   try {
//     const orderID = new mongoose.Types.ObjectId(req.params.orderid);
//     let orderMasterInfo = await OrderMaster.findOne({ _id: orderID });
//     let status = orderMasterInfo.order_status;
//     let ordStr = orderMasterInfo.order_unique_id;
//     if (status === "Order Cancelled") {
//       const err = new Error("Attempt To Scan a Cancelled Order " + ordStr + ".");
//       logError("assignToStartProduction", err, req.user.user_ref_id);
//       return res.status(500).send("Cancelled Order. Please Recheck");
//     }

//     const orderStatus = req.query.prodStatus;
//     const department = req.query.department;
//     const loggedUserID = new mongoose.Types.ObjectId(req.user.user_ref_id);
//     let rackID;
//     let dimension1;
//     let dimension2;
//     if (req.query.rackid) {
//       rackID = new mongoose.Types.ObjectId(req.query.rackid);
//       dimension1 = req.query.dimensionOne;
//       dimension2 = req.query.dimensionTwo;
//     }

//     let updateData;
//     let updatedorderstatus;
//     let conditions;
//     const orderMasterData = await OrderMaster.find({ _id: orderID });
//     if (department === "F" && orderMasterData[0].f_order_prod_push_status === 2) {
//       if (orderStatus === "1") {
//         updateData = { $set: { f_order_roll_start_time: new Date().toISOString(), f_order_roll_user: loggedUserID, f_order_prod_current_status: orderStatus } };
//       }
//       if (orderStatus === "2") {
//         updateData = { $set: { f_order_roll_start_time: new Date().toISOString(), f_order_roll_user: loggedUserID, f_order_roll_end_time: new Date().toISOString(), f_order_prod_current_status: orderStatus } };
//       }
//       if (orderStatus === "3") {
//         updateData = { $set: { f_order_fold_start_time: new Date().toISOString(), f_order_fold_user: loggedUserID, f_order_prod_current_status: orderStatus } };
//       }
//       if (orderStatus === "4") {
//         updateData = { $set: { f_order_fold_start_time: new Date().toISOString(), f_order_fold_user: loggedUserID, f_order_fold_end_time: new Date().toISOString(), f_order_prod_current_status: orderStatus } };
//       }
//       if (orderStatus === "5") {
//         updateData = { $set: { f_order_racking_start_time: new Date().toISOString(), f_order_racking_user: loggedUserID, f_order_prod_current_status: orderStatus } };
//       }
//       if (orderStatus === "6") {
//         updateData = { $set: { f_order_racking_start_time: new Date().toISOString(), f_order_racking_user: loggedUserID, f_order_racking_end_time: new Date().toISOString(), f_order_prod_current_status: orderStatus, f_order_racking_table: rackID, f_order_racking_dimension1: dimension1, f_order_racking_dimension2: dimension2 } };
//       }
//       conditions = { _id: orderID };
//       updatedorderstatus = await OrderMaster.findByIdAndUpdate(conditions, updateData, attrs);
//     } else {
//       console.log("Flashing Order Not Ready For Production !!!");
//     }

//     if (department === "J" && orderMasterData[0].j_order_prod_push_status === 2) {
//       if (orderStatus === "3") {
//         updateData = { $set: { j_order_fold_start_time: new Date().toISOString(), j_order_fold_user: loggedUserID, j_order_prod_current_status: orderStatus } };
//       }
//       if (orderStatus === "4") {
//         updateData = { $set: { j_order_fold_start_time: new Date().toISOString(), j_order_fold_user: loggedUserID, j_order_fold_end_time: new Date().toISOString(), j_order_prod_current_status: orderStatus } };
//       }
//       if (orderStatus === "5") {
//         updateData = { $set: { j_order_racking_start_time: new Date().toISOString(), j_order_racking_user: loggedUserID, j_order_prod_current_status: orderStatus } };
//       }
//       if (orderStatus === "6") {
//         updateData = { $set: { j_order_racking_start_time: new Date().toISOString(), j_order_racking_user: loggedUserID, j_order_racking_end_time: new Date().toISOString(), j_order_prod_current_status: orderStatus, j_order_racking_table: rackID, j_order_racking_dimension1: dimension1, j_order_racking_dimension2: dimension2 } };
//       }
//       conditions = { _id: orderID };
//       updatedorderstatus = await OrderMaster.findByIdAndUpdate(conditions, updateData, attrs);
//     } else {
//       console.log("Jobbing Order Not Ready For Production !!!");
//     }

//     if (department === "CL" && orderMasterData[0].cl_order_prod_push_status === 2) {
//       if (orderStatus === "3") {
//         updateData = { $set: { cl_order_fold_start_time: new Date().toISOString(), cl_order_fold_user: loggedUserID, cl_order_prod_current_status: orderStatus } };
//       }
//       if (orderStatus === "4") {
//         updateData = { $set: { cl_order_fold_start_time: new Date().toISOString(), cl_order_fold_user: loggedUserID, cl_order_fold_end_time: new Date().toISOString(), cl_order_prod_current_status: orderStatus } };
//       }
//       if (orderStatus === "5") {
//         updateData = { $set: { cl_order_racking_start_time: new Date().toISOString(), cl_order_racking_user: loggedUserID, cl_order_prod_current_status: orderStatus } };
//       }
//       if (orderStatus === "6") {
//         updateData = { $set: { cl_order_racking_start_time: new Date().toISOString(), cl_order_racking_user: loggedUserID, cl_order_racking_end_time: new Date().toISOString(), cl_order_prod_current_status: orderStatus, cl_order_racking_table: rackID, cl_order_racking_dimension1: dimension1, cl_order_racking_dimension2: dimension2 } };
//       }
//       conditions = { _id: orderID };
//       updatedorderstatus = await OrderMaster.findByIdAndUpdate(conditions, updateData, attrs);
//     } else {
//       console.log("Cladding Order Not Ready For Production !!!");
//     }

//     if (department === "FG" && orderMasterData[0].fg_order_prod_push_status === 2) {
//       if (orderStatus === "3") {
//         updateData = { $set: { fg_order_fold_start_time: new Date().toISOString(), fg_order_fold_user: loggedUserID, fg_order_prod_current_status: orderStatus } };
//       }
//       if (orderStatus === "4") {
//         updateData = { $set: { fg_order_fold_start_time: new Date().toISOString(), fg_order_fold_user: loggedUserID, fg_order_fold_end_time: new Date().toISOString(), fg_order_prod_current_status: orderStatus } };
//       }
//       if (orderStatus === "5") {
//         updateData = { $set: { fg_order_racking_start_time: new Date().toISOString(), fg_order_racking_user: loggedUserID, fg_order_prod_current_status: orderStatus } };
//       }
//       if (orderStatus === "6") {
//         updateData = { $set: { fg_order_racking_start_time: new Date().toISOString(), fg_order_racking_user: loggedUserID, fg_order_racking_end_time: new Date().toISOString(), fg_order_prod_current_status: orderStatus, fg_order_racking_table: rackID, fg_order_racking_dimension1: dimension1, fg_order_racking_dimension2: dimension2 } };
//       }
//       conditions = { _id: orderID };
//       updatedorderstatus = await OrderMaster.findByIdAndUpdate(conditions, updateData, attrs);
//     } else {
//       console.log("Fascia Gutter Order Not Ready For Production !!!");
//     }

//     if (department === "GBI" && orderMasterData[0].gbi_order_prod_push_status === 2) {
//       if (orderStatus === "3") {
//         updateData = { $set: { gbi_order_fold_start_time: new Date().toISOString(), gbi_order_fold_user: loggedUserID, gbi_order_prod_current_status: orderStatus } };
//       }
//       if (orderStatus === "4") {
//         updateData = { $set: { gbi_order_fold_start_time: new Date().toISOString(), gbi_order_fold_user: loggedUserID, gbi_order_fold_end_time: new Date().toISOString(), gbi_order_prod_current_status: orderStatus } };
//       }
//       if (orderStatus === "5") {
//         updateData = { $set: { gbi_order_racking_start_time: new Date().toISOString(), gbi_order_racking_user: loggedUserID, gbi_order_prod_current_status: orderStatus } };
//       }
//       if (orderStatus === "6") {
//         updateData = { $set: { gbi_order_racking_start_time: new Date().toISOString(), gbi_order_racking_user: loggedUserID, gbi_order_racking_end_time: new Date().toISOString(), gbi_order_prod_current_status: orderStatus, gbi_order_racking_table: rackID, gbi_order_racking_dimension1: dimension1, gbi_order_racking_dimension2: dimension2 } };
//       }
//       conditions = { _id: orderID };
//       updatedorderstatus = await OrderMaster.findByIdAndUpdate(conditions, updateData, attrs);
//     } else {
//       console.log("GBI Order Not Ready For Production !!!");
//     }

//     if (department === "ROOF" && orderMasterData[0].roof_order_prod_push_status === 2) {
//       if (orderStatus === "3") {
//         updateData = { $set: { roof_order_fold_start_time: new Date().toISOString(), roof_order_fold_user: loggedUserID, roof_order_prod_current_status: orderStatus } };
//       }
//       if (orderStatus === "4") {
//         updateData = { $set: { roof_order_fold_start_time: new Date().toISOString(), roof_order_fold_user: loggedUserID, roof_order_fold_end_time: new Date().toISOString(), roof_order_prod_current_status: orderStatus } };
//       }
//       if (orderStatus === "5") {
//         updateData = { $set: { roof_order_racking_start_time: new Date().toISOString(), roof_order_racking_user: loggedUserID, roof_order_prod_current_status: orderStatus } };
//       }
//       if (orderStatus === "6") {
//         updateData = { $set: { roof_order_racking_start_time: new Date().toISOString(), roof_order_racking_user: loggedUserID, roof_order_racking_end_time: new Date().toISOString(), roof_order_prod_current_status: orderStatus, roof_order_racking_table: rackID, roof_order_racking_dimension1: dimension1, roof_order_racking_dimension2: dimension2 } };
//       }
//       conditions = { _id: orderID };
//       updatedorderstatus = await OrderMaster.findByIdAndUpdate(conditions, updateData, attrs);
//     } else {
//       console.log("Roofing Order Not Ready For Production !!!");
//     }

//     if (updatedorderstatus) {
//       const orderMasDetails = await OrderMaster.find({ _id: orderID });
//       let OrderUId = orderMasDetails[0].order_unique_id;

//       const orderMasCount = await OrderItemsCount.find({ Order_Mas_Id: orderID });
//       let jobCount;
//       if (department === "FG") {
//         jobCount = orderMasCount[0].Order_Faciagutter_Count;
//       }
//       if (department === "CL") {
//         jobCount = orderMasCount[0].Order_Cladding_Count;
//       }
//       if (department === "J") {
//         jobCount = orderMasCount[0].Order_Jobbing_Count;
//       }
//       if (department === "F") {
//         jobCount = orderMasCount[0].Order_Flashing_Count;
//       }
//       if (department === "GBI") {
//         jobCount = orderMasCount[0].Order_GBI_Count;
//       }
//       if (department === "ROOF") {
//         jobCount = orderMasCount[0].Order_Roofing_Count;
//       }

//       const userJobEntry = new OrderUserJobsCount({
//         Order_Id: orderID,
//         Order_UId: OrderUId,
//         Order_User_Id: loggedUserID,
//         Order_Dept_Code: department,
//         Order_SubDept_Status: orderStatus,
//         Order_Job_Count: jobCount,
//       });
//       const userJobEntryInfo = await userJobEntry.save();
//       res.status(200).send(updatedorderstatus);
//     }
//   } catch (err) {
//     logError("assignToStartProduction", err, req.user.user_ref_id);
//     res.status(500).send("Production Assignation Failed");
//   }
// };


// optimized code to avoid assigning job counts to other user
exports.assignToStartProduction = async (req, res) => {
  try {
    const orderID = new mongoose.Types.ObjectId(req.params.orderid);
    const loggedUserID = new mongoose.Types.ObjectId(req.user.user_ref_id);
    const orderMasterInfo = await OrderMaster.findOne({ _id: orderID });

    if (!orderMasterInfo) {
      return res.status(404).send("Order not found");
    }

    if (orderMasterInfo.order_status === "Order Cancelled") {
      const err = new Error("Attempt To Scan a Cancelled Order " + orderMasterInfo.order_unique_id);
      logError("assignToStartProduction", err, req.user.user_ref_id);
      return res.status(500).send("Cancelled Order. Please Recheck");
    }

    const orderStatus = req.query.prodStatus;
    const department = req.query.department;

    // NEW RESTRICTION BLOCK HERE
    if (department !== "F") {
      if (orderStatus === "1" || orderStatus === "2") {
        return res
          .status(400)
          .send("Only Flashing Department Allows Roll Scanning !!!");
      }
    }

    let rackID = req.query.rackid ? new mongoose.Types.ObjectId(req.query.rackid) : null;
    let dimension1 = req.query.dimensionOne || null;
    let dimension2 = req.query.dimensionTwo || null;

    // Always read once
    const data = await OrderMaster.findOne({ _id: orderID });

    if (!data) return res.status(404).send("Order not found.");

    let updateData = null;

    // Single department handler function
    const setUpdateData = (prefix) => {
      switch (orderStatus) {
        case "1":
          return { $set: { [`${prefix}_roll_start_time`]: new Date().toISOString(), [`${prefix}_roll_user`]: loggedUserID, [`${prefix}_prod_current_status`]: orderStatus } };
        case "2":
          return { $set: { [`${prefix}_roll_start_time`]: new Date().toISOString(), [`${prefix}_roll_user`]: loggedUserID, [`${prefix}_roll_end_time`]: new Date().toISOString(), [`${prefix}_prod_current_status`]: orderStatus } };
        case "3":
          return { $set: { [`${prefix}_fold_start_time`]: new Date().toISOString(), [`${prefix}_fold_user`]: loggedUserID, [`${prefix}_prod_current_status`]: orderStatus } };
        case "4":
          return { $set: { [`${prefix}_fold_start_time`]: new Date().toISOString(), [`${prefix}_fold_user`]: loggedUserID, [`${prefix}_fold_end_time`]: new Date().toISOString(), [`${prefix}_prod_current_status`]: orderStatus } };
        case "5":
          return { $set: { [`${prefix}_racking_start_time`]: new Date().toISOString(), [`${prefix}_racking_user`]: loggedUserID, [`${prefix}_prod_current_status`]: orderStatus } };
        case "6":
          return {
            $set: {
              [`${prefix}_racking_start_time`]: new Date().toISOString(),
              [`${prefix}_racking_user`]: loggedUserID,
              [`${prefix}_racking_end_time`]: new Date().toISOString(),
              [`${prefix}_prod_current_status`]: orderStatus,
              [`${prefix}_racking_table`]: rackID,
              [`${prefix}_racking_dimension1`]: dimension1,
              [`${prefix}_racking_dimension2`]: dimension2,
            },
          };
        default:
          return null;
      }
    };

    let deptPrefix = null;
    let prodFlag = null;

    switch (department) {
      case "F": deptPrefix = "f_order"; prodFlag = data.f_order_prod_push_status; break;
      case "J": deptPrefix = "j_order"; prodFlag = data.j_order_prod_push_status; break;
      case "CL": deptPrefix = "cl_order"; prodFlag = data.cl_order_prod_push_status; break;
      case "FG": deptPrefix = "fg_order"; prodFlag = data.fg_order_prod_push_status; break;
      case "GBI": deptPrefix = "gbi_order"; prodFlag = data.gbi_order_prod_push_status; break;
      case "ROOF": deptPrefix = "roof_order"; prodFlag = data.roof_order_prod_push_status; break;
      default:
        return res.status(400).send("Invalid department");
    }

    // Mapping codes to proper display names
    const deptNames = {
      F: "Flashing",
      J: "Jobbing",
      CL: "Cladding",
      FG: "Fascia Gutter",
      GBI: "GBI",
      ROOF: "Roofing",
    };

    if (prodFlag !== 2) {
      const deptLabel = deptNames[department] || department;
      const message = `${deptLabel} Order Not Ready For Production !!!`;
      console.log(message);
      return res.status(400).send(message);
    }

    updateData = setUpdateData(deptPrefix);

    if (!updateData) {
      return res.status(400).send("Invalid order status");
    }

    const updatedOrder = await OrderMaster.findOneAndUpdate(
      { _id: orderID },
      updateData,
      { new: true }
    );

    if (!updatedOrder) {
      return res.status(500).send("Update failed");
    }

    // Fetch job count info
    const orderMasCount = await OrderItemsCount.findOne({ Order_Mas_Id: orderID });
    if (!orderMasCount) return res.status(500).send("Job Count Not Found");

    let jobCount = null;
    switch (department) {
      case "FG": jobCount = orderMasCount.Order_Faciagutter_Count; break;
      case "CL": jobCount = orderMasCount.Order_Cladding_Count; break;
      case "J": jobCount = orderMasCount.Order_Jobbing_Count; break;
      case "F": jobCount = orderMasCount.Order_Flashing_Count; break;
      case "GBI": jobCount = orderMasCount.Order_GBI_Count; break;
      case "ROOF": jobCount = orderMasCount.Order_Roofing_Count; break;
    }

    await new OrderUserJobsCount({
      Order_Id: orderID,
      Order_UId: updatedOrder.order_unique_id,
      Order_User_Id: loggedUserID,
      Order_Dept_Code: department,
      Order_SubDept_Status: orderStatus,
      Order_Job_Count: jobCount,
    }).save();

    return res.status(200).send(updatedOrder);

  } catch (err) {
    logError("assignToStartProduction", err, req.user.user_ref_id);
    return res.status(500).send("Production Assignation Failed");
  }
};

exports.fetchUserDataReport = async (req, res) => {
  try {
    let rolesToFetch = [];
    let rolesToFetchDB;
    if (req.query.role === "design") {
      rolesToFetchDB = await Roles.find({ role_category: "design" });
      rolesToFetch = rolesToFetchDB.map(role => role._id.toString());
    } else if (req.query.role === "qc") {
      rolesToFetchDB = await Roles.find({ role_category: "design" });
      rolesToFetch = rolesToFetchDB.map(role => role._id.toString());
    } else if (req.query.role === "production") {
      rolesToFetchDB = await Roles.find({
        role_category: { $in: ["production", "super-admin"] },
      });
      rolesToFetch = rolesToFetchDB.map(role => role._id.toString());
    } else if (req.query.role === "orderentry") {
      rolesToFetchDB = await Roles.find({ role_category: "order-entry" });
      rolesToFetch = rolesToFetchDB.map(role => role._id.toString());
    } else {
      res.status(500).send("Invalid role parameter");
      return;
    }
    const roleObjectIds = rolesToFetch.map(role => new mongoose.Types.ObjectId(role.trim()));
    let userDetails = await Users.aggregate([
      {
        $match: {
          $and: [
            { user_DataRemoved: false },
            { user_status: "active" },
            {
              user_Role: {
                $in: roleObjectIds,
              },
            },
          ],
        },
      },
      { $sort: { user_status: 1 } },
      { $lookup: { from: "roles", as: "userroles", localField: "user_Role", foreignField: "_id" } },
      { $unwind: { path: "$userroles", preserveNullAndEmptyArrays: true } },
      {
        $group: {
          _id: "$_id",
          user_firstName: { $first: "$user_firstName" },
          user_lastName: { $first: "$user_lastName" },
          user_Email: { $first: "$user_Email" },
          user_Phone: { $first: "$user_Phone" },
          user_status: { $first: "$user_status" },
          user_Designation: { $first: "$user_Designation" },
          user_DataRemoved: { $first: "$user_DataRemoved" },
          roleId: { $addToSet: "$userroles._id" },
          roleName: { $addToSet: "$userroles.role_Name" },
          roleCategory: { $addToSet: "$userroles.role_category" },
        },
      },
      {
        $project: {
          _id: 1,
          user_firstName: 1,
          user_lastName: 1,
          user_Email: 1,
          user_Phone: 1,
          user_status: 1,
          user_Designation: 1,
          user_DataRemoved: 1,
          roleId: 1,
          roleName: 1,
          roleCategory: 1,
        },
      },
    ]);
    res.status(200).send(userDetails);
  } catch (err) {
    logError("fetchUserDataReport", err, req.user.user_ref_id);
    res.status(500).send("Data Fetching Failed.");
  }
};

exports.designReportsGenerate = async (req, res) => {
  try {
    const limit = 25;
    const page = parseInt(req.query.page) || 0;
    const skip = page * limit;
    const loggedUserID = new mongoose.Types.ObjectId(req.user.user_ref_id);
    const hasEditPermission = req.user.user_role.rolepermissions.DesignReport.edit !== "0";

    const matchCondition = { order_flashing_checker: true };

    if (req.query.orderUID) {
      // const escapedOrderUID = req.query.orderUID.replace(/[-[\]{}()*+?.,\\^$|#\s]/g, "\\$&");
      // matchCondition.order_unique_id = { $regex: escapedOrderUID, $options: "i" };
      matchCondition.$or = [
        // { order_unique_id: { $regex: escapedKeyword, $options: "i" } },
        {
          $expr: {
            $or: [
              { $eq: ["$order_unique_id", req.query.orderUID] },
              {
                  $and: [
                  { $eq: ["$order_customer_UID", AWF_CUST_ID] },
                  { $eq: [{ $substr: ["$order_customer_PO_number", 0, 6] }, req.query.orderUID] }
                  ]
              }
            ]
          }
        }
      ]
    }

    if (req.query.orderStatus) {
      matchCondition.order_status = req.query.orderStatus;
    }

    if (!hasEditPermission || req.query.orderDesigner) {
      matchCondition.order_designed_person = req.query.orderDesigner ? new mongoose.Types.ObjectId(req.query.orderDesigner) : loggedUserID;
    }

    if (req.query.fromTime && req.query.toTime) {
      matchCondition.order_design_assigned_time = {
        $gte: new Date(req.query.fromTime),
        $lte: new Date(req.query.toTime),
      };
    } else if (req.query.fromTime) {
      matchCondition.order_design_assigned_time = { $gte: new Date(req.query.fromTime) };
    } else if (req.query.toTime) {
      matchCondition.order_design_assigned_time = { $lte: new Date(req.query.toTime) };
    }

    const commonStages = [
      { $match: matchCondition },
      { $sort: { created: -1 } },
      {
        $lookup: {
          from: "users",
          localField: "order_designed_person",
          foreignField: "_id",
          pipeline: [
            {
              $project: {
                user_firstName: 1,
                user_lastName: 1,
              },
            },
          ],
          as: "usersDesignerInfo",
        },
      },
      {
        $lookup: {
          from: "users",
          localField: "order_qced_person",
          foreignField: "_id",
          pipeline: [
            {
              $project: {
                user_firstName: 1,
                user_lastName: 1,
              },
            },
          ],
          as: "usersQCInfo",
        },
      },
      {
        $lookup: {
          from: "orderitems",
          localField: "_id",
          foreignField: "order_master_id",
          pipeline: [{ $project: { order_item_shape_id: 1 } }],
          as: "orderitemsinfo",
        },
      },
      {
        $lookup: {
          from: "orderssubitemcounts",
          localField: "_id",
          foreignField: "Order_Mas_Id",
          pipeline: [{ $project: { Order_Flashing_Count: 1 } }],
          as: "orderssubitemcountsInfoF",
        },
      },
      { $unwind: { path: "$usersDesignerInfo", preserveNullAndEmptyArrays: true } },
      { $unwind: { path: "$usersQCInfo", preserveNullAndEmptyArrays: true } },
      { $unwind: { path: "$orderssubitemcountsInfoF", preserveNullAndEmptyArrays: true } },
      {
        $addFields: {
          designerFullName: {
            $concat: [{ $ifNull: ["$usersDesignerInfo.user_firstName", ""] }, " ", { $ifNull: ["$usersDesignerInfo.user_lastName", ""] }],
          },
          qcFullName: {
            $concat: [{ $ifNull: ["$usersQCInfo.user_firstName", ""] }, " ", { $ifNull: ["$usersQCInfo.user_lastName", ""] }],
          },
          uniqueShapeIDs: { $setUnion: ["$orderitemsinfo.order_item_shape_id", []] },
        },
      },
    ];

    const reportProjection = {
      $project: {
        _id: 1,
        order_unique_id: {
            $cond: [
            { $eq: ["$order_customer_UID", AWF_CUST_ID] },
            { $substr: ["$order_customer_PO_number", 0, 6] },
            "$order_unique_id"
            ]
        },
        designerFullName: 1,
        qcFullName: 1,
        Order_Flashing_Count: { $toInt: "$orderssubitemcountsInfoF.Order_Flashing_Count" },
        shapeID: "$orderitemsinfo.order_item_shape_id",
        shapeIDCount: { $size: "$uniqueShapeIDs" },
      },
    };

    const paginationProjection = {
      $project: {
        _id: 1,
        order_unique_id: {
            $cond: [
            { $eq: ["$order_customer_UID", AWF_CUST_ID] },
            { $substr: ["$order_customer_PO_number", 0, 6] },
            "$order_unique_id"
            ]
        },
        order_invoice_id: 1,
        order_customer_id: 1,
        order_customer_contact_id: 1,
        order_delivery_date: 1,
        order_delivery_date_str: 1,
        order_delivery_time: 1,
        order_delivery_session: 1,
        order_Overall_Price: 1,
        order_status: 1,
        order_delivery_address_mode: 1,
        order_delivery_address: 1,
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
        order_flashing_checker: 1,
        user: 1,
        created: 1,
        updated: 1,
        order_item_shape_id: 1,
        order_created_person: 1,
        order_designed_person: 1,
        order_design_assigned_time: 1,
        order_design_completed_time: 1,
        order_qc_status: 1,
        order_qced_person: 1,
        order_qc_assigned_time: 1,
        order_qc_completed_time: 1,
        order_barcode_checker: 1,
        order_prod_current_status: 1,
        designerFullName: 1,
        qcFullName: 1,
        Order_Flashing_Count: { $toInt: "$orderssubitemcountsInfoF.Order_Flashing_Count" },
        account_Name: "$accountsInfo.account_Name",
        shapeID: "$orderitemsinfo.order_item_shape_id",
        shapeIDCount: { $size: "$uniqueShapeIDs" },
      },
    };

    const [totalOrdersCount, orderReport, orderReportPagination] = await Promise.all([
      OrderMaster.countDocuments(matchCondition),
      OrderMaster.aggregate([...commonStages, reportProjection]),
      OrderMaster.aggregate([
        ...commonStages,
        {
          $lookup: {
            from: "accounts",
            localField: "order_customer_id",
            foreignField: "_id",
            pipeline: [{ $project: { account_Name: 1 } }],
            as: "accountsInfo",
          },
        },
        { $unwind: { path: "$accountsInfo", preserveNullAndEmptyArrays: true } },
        paginationProjection,
        { $skip: skip },
        { $limit: limit },
      ]),
    ]);

    let totalPieces = 0;
    const designedPersons = new Set();

    orderReport.forEach(order => {
      totalPieces += order.Order_Flashing_Count || 0;
      if (order.designerFullName) designedPersons.add(order.designerFullName);
    });

    // Calculate totalShapeIDs and per-order shapeIDCount using drawing count logic (same as getDrawingCountsByOrder)
    // Get all unique order_unique_ids from all matching orders (for total) and paginated orders (for individual counts)
    const allOrderNumbers = [...new Set(orderReport.map(o => o.order_unique_id).filter(Boolean))];
    const paginatedOrderNumbers = [...new Set(orderReportPagination.map(o => o.order_unique_id).filter(Boolean))];
    const combinedOrderNumbers = [...new Set([...allOrderNumbers, ...paginatedOrderNumbers])];
    
    let totalShapeIDs = 0;
    const orderDrawingCountMap = {}; // Map of orderNumber -> drawing count
    
    if (combinedOrderNumbers.length > 0) {
      // Get all template IDs for these orders (with swiJobIds)
      const templates = await Template.find({
        orderNumber: { $in: combinedOrderNumbers },
        swiJobIds: { 
          $exists: true,
          $type: 'array',
          $ne: []
        },
        $expr: { $gt: [{ $size: "$swiJobIds" }, 0] }
      }).select('_id orderNumber isTaper').lean();
      
      const templateIds = templates.map(t => t._id);
      
      // Build a map of templateId -> isTaper status
      const templateTaperMap = {};
      templates.forEach(t => {
        templateTaperMap[t._id.toString()] = t.isTaper === true;
      });
      
      if (templateIds.length > 0) {
        const materialRows = await MaterialRow.find({
          templateId: { $in: templateIds }
        }).select('splitInto templateId').lean();
        
        // Group material rows by templateId to find max splitInto per template (only for taper templates)
        const templateSplitMap = {};
        materialRows.forEach(row => {
          const templateIdStr = row.templateId.toString();
          // Only use splitInto for taper templates
          const isTaperTemplate = templateTaperMap[templateIdStr];
          const splitValue = isTaperTemplate && row.splitInto && row.splitInto > 1 ? row.splitInto : 1;
          // Take the max splitInto value for each template
          if (!templateSplitMap[templateIdStr] || splitValue > templateSplitMap[templateIdStr]) {
            templateSplitMap[templateIdStr] = splitValue;
          }
        });
        
        // Build drawing count per orderNumber
        templates.forEach(template => {
          const orderNum = template.orderNumber;
          const templateIdStr = template._id.toString();
          const drawingCount = templateSplitMap[templateIdStr] || 1;
          
          if (!orderDrawingCountMap[orderNum]) {
            orderDrawingCountMap[orderNum] = 0;
          }
          orderDrawingCountMap[orderNum] += drawingCount;
        });
        
        // Calculate total for all matching orders
        allOrderNumbers.forEach(orderNum => {
          totalShapeIDs += orderDrawingCountMap[orderNum] || 0;
        });
      }
    }
    
    // Update shapeIDCount for each order in pagination results
    orderReportPagination.forEach(order => {
      order.shapeIDCount = orderDrawingCountMap[order.order_unique_id] || 0;
    });

    const responseObject = {
      orderReportPagination,
      TotalShapeIDs: totalShapeIDs,
      TotalOrders: orderReport.length,
      TotalPieces: totalPieces,
      DesignedPersons: Array.from(designedPersons),
      totalItems: totalOrdersCount,
      rowsPerPage: limit,
      totalPages: Math.ceil(totalOrdersCount / limit),
    };

    res.status(200).send(responseObject);
  } catch (err) {
    logError("designReportsGenerate", err, req.user.user_ref_id);
    res.status(500).send("Data Fetching Failed.");
  }
};

exports.designReportsGenerateExport = async (req, res) => {
  try {
    const loggedUserID = new mongoose.Types.ObjectId(req.user.user_ref_id);
    const loggedUser = req.user.user_role.rolepermissions.DesignReport.edit !== "0";
    const matchCondition = {};
    matchCondition.order_flashing_checker = true;

    if (req.query.orderUID) {
      // const escapedOrderUID = req.query.orderUID.replace(/[-[\]{}()*+?.,\\^$|#\s]/g, "\\$&");
      // matchCondition.order_unique_id = { $regex: escapedOrderUID, $options: "i" };
      matchCondition.$or = [
        // { order_unique_id: { $regex: escapedKeyword, $options: "i" } },
        {
          $expr: {
            $or: [
              { $eq: ["$order_unique_id", req.query.orderUID] },
              {
                  $and: [
                  { $eq: ["$order_customer_UID", AWF_CUST_ID] },
                  { $eq: [{ $substr: ["$order_customer_PO_number", 0, 6] }, req.query.orderUID] }
                  ]
              }
            ]
          }
        } 
      ]
    }
    if (req.query.orderStatus) {
      matchCondition.order_status = req.query.orderStatus;
    }

    if (loggedUser === true && !req.query.orderDesigner) {
    } else {
      if (req.query.orderDesigner) {
        matchCondition.order_designed_person = new mongoose.Types.ObjectId(req.query.orderDesigner);
      } else {
        matchCondition.order_designed_person = loggedUserID;
      }
    }

    if (req.query.fromTime && req.query.toTime) {
      const fromDateTime = new Date(req.query.fromTime);
      const toDateTime = new Date(req.query.toTime);
      matchCondition.order_design_assigned_time = { $gte: fromDateTime, $lte: toDateTime };
    } else if (req.query.fromTime) {
      matchCondition.order_design_assigned_time = { $gte: new Date(req.query.fromTime) };
    } else if (req.query.toTime) {
      const toDateTime = new Date(req.query.toTime);
      matchCondition.order_design_assigned_time = { $lte: toDateTime };
    }

    let orderReportExport = await OrderMaster.aggregate([
      { $match: matchCondition },
      { $sort: { created: -1 } },
      {
        $lookup: {
          from: "users",
          localField: "order_designed_person",
          foreignField: "_id",
          pipeline: [{ $project: { user_firstName: 1, user_lastName: 1 } }],
          as: "usersDesignerInfo",
        },
      },
      {
        $lookup: {
          from: "orderitems",
          localField: "_id",
          foreignField: "order_master_id",
          pipeline: [{ $project: { order_item_shape_id: 1 } }],
          as: "orderitemsinfo",
        },
      },
      {
        $lookup: {
          from: "users",
          localField: "order_qced_person",
          foreignField: "_id",
          pipeline: [{ $project: { user_firstName: 1, user_lastName: 1 } }],
          as: "usersQCInfo",
        },
      },
      {
        $lookup: {
          from: "orderssubitemcounts",
          localField: "_id",
          foreignField: "Order_Mas_Id",
          pipeline: [{ $project: { Order_Flashing_Count: 1 } }],
          as: "orderssubitemcountsInfoF",
        },
      },
      {
        $lookup: {
          from: "accounts",
          localField: "order_customer_id",
          foreignField: "_id",
          pipeline: [{ $project: { account_Name: 1 } }],
          as: "accountsInfo",
        },
      },
      { $unwind: { path: "$usersDesignerInfo", preserveNullAndEmptyArrays: true } },
      { $unwind: { path: "$usersQCInfo", preserveNullAndEmptyArrays: true } },
      { $unwind: { path: "$orderssubitemcountsInfoF", preserveNullAndEmptyArrays: true } },
      { $unwind: { path: "$accountsInfo", preserveNullAndEmptyArrays: true } },
      {
        $addFields: {
          designerFullName: {
            $concat: [{ $ifNull: ["$usersDesignerInfo.user_firstName", ""] }, " ", { $ifNull: ["$usersDesignerInfo.user_lastName", ""] }],
          },
          qcFullName: {
            $concat: [{ $ifNull: ["$usersQCInfo.user_firstName", ""] }, " ", { $ifNull: ["$usersQCInfo.user_lastName", ""] }],
          },
        },
      },
      {
        $addFields: {
          uniqueShapeIDs: {
            $setUnion: "$orderitemsinfo.order_item_shape_id",
          },
        },
      },
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
          order_invoice_id: 1,
          order_customer_id: 1,
          order_customer_contact_id: 1,
          order_delivery_date: 1,
          order_delivery_date_str: 1,
          order_delivery_time: 1,
          order_delivery_session: 1,
          order_Overall_Price: 1,
          order_status: 1,
          order_delivery_address_mode: 1,
          order_delivery_address: 1,
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
          order_flashing_checker: 1,
          user: 1,
          created: 1,
          updated: 1,
          order_item_shape_id: 1,
          order_created_person: 1,
          order_designed_person: 1,
          order_design_assigned_time: 1,
          order_design_completed_time: 1,
          order_qc_status: 1,
          order_qced_person: 1,
          order_qc_assigned_time: 1,
          order_qc_completed_time: 1,
          order_barcode_checker: 1,
          order_prod_current_status: 1,
          designerFullName: 1,
          qcFullName: 1,
          Order_Flashing_Count: { $toInt: "$orderssubitemcountsInfoF.Order_Flashing_Count" },
          account_Name: "$accountsInfo.account_Name",
          shapeID: "$orderitemsinfo.order_item_shape_id",
          shapeIDCount: { $size: "$uniqueShapeIDs" },
        },
      },
    ]);

    // Calculate shapeIDCount for each order using drawing count logic (same as getDrawingCountsByOrder)
    const exportOrderNumbers = [...new Set(orderReportExport.map(o => o.order_unique_id).filter(Boolean))];
    const orderDrawingCountMap = {};
    
    if (exportOrderNumbers.length > 0) {
      const templates = await Template.find({
        orderNumber: { $in: exportOrderNumbers },
        swiJobIds: { 
          $exists: true,
          $type: 'array',
          $ne: []
        },
        $expr: { $gt: [{ $size: "$swiJobIds" }, 0] }
      }).select('_id orderNumber isTaper').lean();
      
      const templateIds = templates.map(t => t._id);
      
      // Build a map of templateId -> isTaper status
      const templateTaperMap = {};
      templates.forEach(t => {
        templateTaperMap[t._id.toString()] = t.isTaper === true;
      });
      
      if (templateIds.length > 0) {
        const materialRows = await MaterialRow.find({
          templateId: { $in: templateIds }
        }).select('splitInto templateId').lean();
        
        // Group material rows by templateId to find max splitInto per template (only for taper templates)
        const templateSplitMap = {};
        materialRows.forEach(row => {
          const templateIdStr = row.templateId.toString();
          // Only use splitInto for taper templates
          const isTaperTemplate = templateTaperMap[templateIdStr];
          const splitValue = isTaperTemplate && row.splitInto && row.splitInto > 1 ? row.splitInto : 1;
          if (!templateSplitMap[templateIdStr] || splitValue > templateSplitMap[templateIdStr]) {
            templateSplitMap[templateIdStr] = splitValue;
          }
        });
        
        // Build drawing count per orderNumber
        templates.forEach(template => {
          const orderNum = template.orderNumber;
          const templateIdStr = template._id.toString();
          const drawingCount = templateSplitMap[templateIdStr] || 1;
          
          if (!orderDrawingCountMap[orderNum]) {
            orderDrawingCountMap[orderNum] = 0;
          }
          orderDrawingCountMap[orderNum] += drawingCount;
        });
      }
    }
    
    // Update shapeIDCount for each order in export results
    orderReportExport.forEach(order => {
      order.shapeIDCount = orderDrawingCountMap[order.order_unique_id] || 0;
    });

    res.status(200).send(orderReportExport);
  } catch (err) {
    logError("designReportsGenerateExport", err, req.user.user_ref_id);
    res.status(500).send("Data Fetching Failed");
  }
};

exports.qcReportsGenerate = async (req, res) => {
  try {
    const limit = 25;
    const page = parseInt(req.query.page) || 0;
    const skip = page * limit;
    const loggedUserID = new mongoose.Types.ObjectId(req.user.user_ref_id);
    const hasEditPermission = req.user.user_role.rolepermissions.DesignReport.edit !== "0";

    const matchCondition = { order_flashing_checker: true };

    if (req.query.orderUID) {
      // const escapedOrderUID = req.query.orderUID.replace(/[-[\]{}()*+?.,\\^$|#\s]/g, "\\$&");
      // matchCondition.order_unique_id = { $regex: escapedOrderUID, $options: "i" };
      matchCondition.$or = [
        // { order_unique_id: { $regex: escapedKeyword, $options: "i" } },
        {
          $expr: {
            $or: [
              { $eq: ["$order_unique_id", req.query.orderUID] },
              {
                  $and: [
                  { $eq: ["$order_customer_UID", AWF_CUST_ID] },
                  { $eq: [{ $substr: ["$order_customer_PO_number", 0, 6] }, req.query.orderUID] }
                  ]
              }
            ]
          }
        }
      ]
    }
  
    if (req.query.orderStatus) {
      matchCondition.order_status = req.query.orderStatus;
    }

    if (!hasEditPermission || req.query.orderQC) {
      matchCondition.order_qced_person = req.query.orderQC ? new mongoose.Types.ObjectId(req.query.orderQC) : loggedUserID;
    }

    if (req.query.fromTime && req.query.toTime) {
      matchCondition.order_qc_assigned_time = {
        $gte: new Date(req.query.fromTime),
        $lte: new Date(req.query.toTime),
      };
    } else if (req.query.fromTime) {
      matchCondition.order_qc_assigned_time = { $gte: new Date(req.query.fromTime) };
    } else if (req.query.toTime) {
      matchCondition.order_qc_assigned_time = { $lte: new Date(req.query.toTime) };
    }

    const commonStages = [
      { $match: matchCondition },
      { $sort: { created: -1 } },
      {
        $lookup: {
          from: "orderitems",
          localField: "_id",
          foreignField: "order_master_id",
          pipeline: [{ $project: { order_item_shape_id: 1 } }],
          as: "orderitemsinfo",
        },
      },
      {
        $lookup: {
          from: "users",
          localField: "order_designed_person",
          foreignField: "_id",
          pipeline: [{ $project: { user_firstName: 1, user_lastName: 1 } }],
          as: "usersDesignerInfo",
        },
      },
      {
        $lookup: {
          from: "users",
          localField: "order_qced_person",
          foreignField: "_id",
          pipeline: [{ $project: { user_firstName: 1, user_lastName: 1 } }],
          as: "usersQCInfo",
        },
      },
      {
        $lookup: {
          from: "orderssubitemcounts",
          localField: "_id",
          foreignField: "Order_Mas_Id",
          pipeline: [{ $project: { Order_Flashing_Count: 1 } }],
          as: "orderssubitemcountsInfoF",
        },
      },
      { $unwind: { path: "$usersDesignerInfo", preserveNullAndEmptyArrays: true } },
      { $unwind: { path: "$usersQCInfo", preserveNullAndEmptyArrays: true } },
      { $unwind: { path: "$orderssubitemcountsInfoF", preserveNullAndEmptyArrays: true } },
      {
        $addFields: {
          designerFullName: {
            $concat: [{ $ifNull: ["$usersDesignerInfo.user_firstName", ""] }, " ", { $ifNull: ["$usersDesignerInfo.user_lastName", ""] }],
          },
          qcFullName: {
            $concat: [{ $ifNull: ["$usersQCInfo.user_firstName", ""] }, " ", { $ifNull: ["$usersQCInfo.user_lastName", ""] }],
          },
          uniqueShapeIDs: { $setUnion: ["$orderitemsinfo.order_item_shape_id", []] },
        },
      },
    ];

    const reportProjection = {
      $project: {
        _id: 1,
        order_unique_id: {
            $cond: [
            { $eq: ["$order_customer_UID", AWF_CUST_ID] },
            { $substr: ["$order_customer_PO_number", 0, 6] },
            "$order_unique_id"
            ]
        },
        designerFullName: 1,
        qcFullName: 1,
        Order_Flashing_Count: { $toInt: "$orderssubitemcountsInfoF.Order_Flashing_Count" },
        shapeID: "$orderitemsinfo.order_item_shape_id",
        shapeIDCount: { $size: "$uniqueShapeIDs" },
      },
    };

    const paginationProjection = {
      $project: {
        _id: 1,
        order_unique_id: {
            $cond: [
            { $eq: ["$order_customer_UID", AWF_CUST_ID] },
            { $substr: ["$order_customer_PO_number", 0, 6] },
            "$order_unique_id"
            ]
        },
        order_invoice_id: 1,
        order_customer_id: 1,
        order_customer_contact_id: 1,
        order_delivery_date: 1,
        order_delivery_date_str: 1,
        order_delivery_time: 1,
        order_delivery_session: 1,
        order_Overall_Price: 1,
        order_status: 1,
        order_delivery_address_mode: 1,
        order_delivery_address: 1,
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
        order_flashing_checker: 1,
        user: 1,
        created: 1,
        updated: 1,
        order_item_shape_id: 1,
        order_created_person: 1,
        order_designed_person: 1,
        order_design_assigned_time: 1,
        order_qc_status: 1,
        order_qced_person: 1,
        order_qc_assigned_time: 1,
        order_qc_completed_time: 1,
        order_barcode_checker: 1,
        order_prod_current_status: 1,
        designerFullName: 1,
        qcFullName: 1,
        Order_Flashing_Count: { $toInt: "$orderssubitemcountsInfoF.Order_Flashing_Count" },
        account_Name: "$accountsInfo.account_Name",
        shapeID: "$orderitemsinfo.order_item_shape_id",
        shapeIDCount: { $size: "$uniqueShapeIDs" },
      },
    };

    const [totalOrdersCount, orderReport, orderReportPagination] = await Promise.all([
      OrderMaster.countDocuments(matchCondition),
      OrderMaster.aggregate([...commonStages, reportProjection]),
      OrderMaster.aggregate([
        ...commonStages,
        {
          $lookup: {
            from: "accounts",
            localField: "order_customer_id",
            foreignField: "_id",
            pipeline: [{ $project: { account_Name: 1 } }],
            as: "accountsInfo",
          },
        },
        { $unwind: { path: "$accountsInfo", preserveNullAndEmptyArrays: true } },
        paginationProjection,
        { $skip: skip },
        { $limit: limit },
      ]),
    ]);

    let totalPieces = 0;
    const QCedPersons = new Set();

    orderReport.forEach(order => {
      totalPieces += order.Order_Flashing_Count || 0;
      if (order.qcFullName) QCedPersons.add(order.qcFullName);
    });

    // Calculate totalShapeIDs and per-order shapeIDCount using drawing count logic (same as getDrawingCountsByOrder)
    // Get all unique order_unique_ids from all matching orders (for total) and paginated orders (for individual counts)
    const allOrderNumbers = [...new Set(orderReport.map(o => o.order_unique_id).filter(Boolean))];
    const paginatedOrderNumbers = [...new Set(orderReportPagination.map(o => o.order_unique_id).filter(Boolean))];
    const combinedOrderNumbers = [...new Set([...allOrderNumbers, ...paginatedOrderNumbers])];
    
    let totalShapeIDs = 0;
    const orderDrawingCountMap = {}; // Map of orderNumber -> drawing count
    
    if (combinedOrderNumbers.length > 0) {
      // Get all template IDs for these orders (with swiJobIds)
      const templates = await Template.find({
        orderNumber: { $in: combinedOrderNumbers },
        swiJobIds: { 
          $exists: true,
          $type: 'array',
          $ne: []
        },
        $expr: { $gt: [{ $size: "$swiJobIds" }, 0] }
      }).select('_id orderNumber isTaper').lean();
      
      const templateIds = templates.map(t => t._id);
      
      // Build a map of templateId -> isTaper status
      const templateTaperMap = {};
      templates.forEach(t => {
        templateTaperMap[t._id.toString()] = t.isTaper === true;
      });
      
      if (templateIds.length > 0) {
        const materialRows = await MaterialRow.find({
          templateId: { $in: templateIds }
        }).select('splitInto templateId').lean();
        
        // Group material rows by templateId to find max splitInto per template (only for taper templates)
        const templateSplitMap = {};
        materialRows.forEach(row => {
          const templateIdStr = row.templateId.toString();
          // Only use splitInto for taper templates
          const isTaperTemplate = templateTaperMap[templateIdStr];
          const splitValue = isTaperTemplate && row.splitInto && row.splitInto > 1 ? row.splitInto : 1;
          // Take the max splitInto value for each template
          if (!templateSplitMap[templateIdStr] || splitValue > templateSplitMap[templateIdStr]) {
            templateSplitMap[templateIdStr] = splitValue;
          }
        });
        
        // Build drawing count per orderNumber
        templates.forEach(template => {
          const orderNum = template.orderNumber;
          const templateIdStr = template._id.toString();
          const drawingCount = templateSplitMap[templateIdStr] || 1;
          
          if (!orderDrawingCountMap[orderNum]) {
            orderDrawingCountMap[orderNum] = 0;
          }
          orderDrawingCountMap[orderNum] += drawingCount;
        });
        
        // Calculate total for all matching orders
        allOrderNumbers.forEach(orderNum => {
          totalShapeIDs += orderDrawingCountMap[orderNum] || 0;
        });
      }
    }
    
    // Update shapeIDCount for each order in pagination results
    orderReportPagination.forEach(order => {
      order.shapeIDCount = orderDrawingCountMap[order.order_unique_id] || 0;
    });

    const responseObject = {
      orderReportPagination,
      TotalShapeIDs: totalShapeIDs,
      TotalOrders: orderReport.length,
      TotalPieces: totalPieces,
      QCPersons: Array.from(QCedPersons),
      totalItems: totalOrdersCount,
      rowsPerPage: limit,
      totalPages: Math.ceil(totalOrdersCount / limit),
    };

    res.status(200).send(responseObject);
  } catch (err) {
    logError("qcReportsGenerate", err, req.user.user_ref_id);
    res.status(500).send("Data Fetching Failed");
  }
};

exports.qcReportsGenerateExport = async (req, res) => {
  try {
    const loggedUserID = new mongoose.Types.ObjectId(req.user.user_ref_id);
    const loggedUser = req.user.user_role.rolepermissions.DesignReport.edit !== "0";
    const matchCondition = {};
    matchCondition.order_flashing_checker = true;

    if (req.query.orderUID) {
      // const escapedOrderUID = req.query.orderUID.replace(/[-[\]{}()*+?.,\\^$|#\s]/g, "\\$&");
      // matchCondition.order_unique_id = { $regex: escapedOrderUID, $options: "i" };
      matchCondition.$or = [
        // { order_unique_id: { $regex: escapedKeyword, $options: "i" } },
        {
          $expr: {
            $or: [
              { $eq: ["$order_unique_id", req.query.orderUID] },
              {
                  $and: [
                  { $eq: ["$order_customer_UID", AWF_CUST_ID] },
                  { $eq: [{ $substr: ["$order_customer_PO_number", 0, 6] }, req.query.orderUID] }
                  ]
              }
            ]
          }
        }
      ]
    }
    if (req.query.orderStatus) {
      matchCondition.order_status = req.query.orderStatus;
    }

    if (loggedUser === true && !req.query.orderQC) {
    } else {
      if (req.query.orderQC) {
        matchCondition.order_qced_person = new mongoose.Types.ObjectId(req.query.orderQC);
      } else {
        matchCondition.order_qced_person = loggedUserID;
      }
    }

    if (req.query.fromTime && req.query.toTime) {
      const fromDateTime = new Date(req.query.fromTime);
      const toDateTime = new Date(req.query.toTime);
      matchCondition.order_qc_assigned_time = { $gte: fromDateTime, $lte: toDateTime };
    } else if (req.query.fromTime) {
      matchCondition.order_qc_assigned_time = { $gte: new Date(req.query.fromTime) };
    } else if (req.query.toTime) {
      const toDateTime = new Date(req.query.toTime);
      matchCondition.order_qc_assigned_time = { $lte: toDateTime };
    }

    let orderReportExport = await OrderMaster.aggregate([
      { $match: matchCondition },
      { $sort: { created: -1 } },
      {
        $lookup: {
          from: "orderitems",
          localField: "_id",
          foreignField: "order_master_id",
          pipeline: [{ $project: { order_item_shape_id: 1 } }],
          as: "orderitemsinfo",
        },
      },
      {
        $lookup: {
          from: "users",
          localField: "order_designed_person",
          foreignField: "_id",
          pipeline: [{ $project: { user_firstName: 1, user_lastName: 1 } }],
          as: "usersDesignerInfo",
        },
      },
      {
        $lookup: {
          from: "users",
          localField: "order_qced_person",
          foreignField: "_id",
          pipeline: [{ $project: { user_firstName: 1, user_lastName: 1 } }],
          as: "usersQCInfo",
        },
      },
      {
        $lookup: {
          from: "orderssubitemcounts",
          localField: "_id",
          foreignField: "Order_Mas_Id",
          pipeline: [{ $project: { Order_Flashing_Count: 1 } }],
          as: "orderssubitemcountsInfoF",
        },
      },
      {
        $lookup: {
          from: "accounts",
          localField: "order_customer_id",
          foreignField: "_id",
          pipeline: [{ $project: { account_Name: 1 } }],
          as: "accountsInfo",
        },
      },
      { $unwind: { path: "$usersDesignerInfo", preserveNullAndEmptyArrays: true } },
      { $unwind: { path: "$usersQCInfo", preserveNullAndEmptyArrays: true } },
      { $unwind: { path: "$orderssubitemcountsInfoF", preserveNullAndEmptyArrays: true } },
      { $unwind: { path: "$accountsInfo", preserveNullAndEmptyArrays: true } },
      {
        $addFields: {
          designerFullName: {
            $concat: [{ $ifNull: ["$usersDesignerInfo.user_firstName", ""] }, " ", { $ifNull: ["$usersDesignerInfo.user_lastName", ""] }],
          },
          qcFullName: {
            $concat: [{ $ifNull: ["$usersQCInfo.user_firstName", ""] }, " ", { $ifNull: ["$usersQCInfo.user_lastName", ""] }],
          },
        },
      },
      {
        $addFields: {
          uniqueShapeIDs: {
            $setUnion: "$orderitemsinfo.order_item_shape_id",
          },
        },
      },
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
          order_invoice_id: 1,
          order_customer_id: 1,
          order_customer_contact_id: 1,
          order_delivery_date: 1,
          order_delivery_date_str: 1,
          order_delivery_time: 1,
          order_delivery_session: 1,
          order_Overall_Price: 1,
          order_status: 1,
          order_delivery_address_mode: 1,
          order_delivery_address: 1,
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
          order_flashing_checker: 1,
          user: 1,
          created: 1,
          updated: 1,
          order_item_shape_id: 1,
          order_created_person: 1,
          order_designed_person: 1,
          order_design_assigned_time: 1,
          order_qc_status: 1,
          order_qced_person: 1,
          order_qc_assigned_time: 1,
          order_qc_completed_time: 1,
          order_barcode_checker: 1,
          order_prod_current_status: 1,
          designerFullName: 1,
          qcFullName: 1,
          Order_Flashing_Count: { $toInt: "$orderssubitemcountsInfoF.Order_Flashing_Count" },
          account_Name: "$accountsInfo.account_Name",
          shapeID: "$orderitemsinfo.order_item_shape_id",
          shapeIDCount: { $size: "$uniqueShapeIDs" },
        },
      },
    ]);

    // Calculate shapeIDCount for each order using drawing count logic (same as getDrawingCountsByOrder)
    const exportOrderNumbers = [...new Set(orderReportExport.map(o => o.order_unique_id).filter(Boolean))];
    const orderDrawingCountMap = {};
    
    if (exportOrderNumbers.length > 0) {
      const templates = await Template.find({
        orderNumber: { $in: exportOrderNumbers },
        swiJobIds: { 
          $exists: true,
          $type: 'array',
          $ne: []
        },
        $expr: { $gt: [{ $size: "$swiJobIds" }, 0] }
      }).select('_id orderNumber isTaper').lean();
      
      const templateIds = templates.map(t => t._id);
      
      // Build a map of templateId -> isTaper status
      const templateTaperMap = {};
      templates.forEach(t => {
        templateTaperMap[t._id.toString()] = t.isTaper === true;
      });
      
      if (templateIds.length > 0) {
        const materialRows = await MaterialRow.find({
          templateId: { $in: templateIds }
        }).select('splitInto templateId').lean();
        
        // Group material rows by templateId to find max splitInto per template (only for taper templates)
        const templateSplitMap = {};
        materialRows.forEach(row => {
          const templateIdStr = row.templateId.toString();
          // Only use splitInto for taper templates
          const isTaperTemplate = templateTaperMap[templateIdStr];
          const splitValue = isTaperTemplate && row.splitInto && row.splitInto > 1 ? row.splitInto : 1;
          if (!templateSplitMap[templateIdStr] || splitValue > templateSplitMap[templateIdStr]) {
            templateSplitMap[templateIdStr] = splitValue;
          }
        });
        
        // Build drawing count per orderNumber
        templates.forEach(template => {
          const orderNum = template.orderNumber;
          const templateIdStr = template._id.toString();
          const drawingCount = templateSplitMap[templateIdStr] || 1;
          
          if (!orderDrawingCountMap[orderNum]) {
            orderDrawingCountMap[orderNum] = 0;
          }
          orderDrawingCountMap[orderNum] += drawingCount;
        });
      }
    }
    
    // Update shapeIDCount for each order in export results
    orderReportExport.forEach(order => {
      order.shapeIDCount = orderDrawingCountMap[order.order_unique_id] || 0;
    });

    res.status(200).send(orderReportExport);
  } catch (err) {
    logError("qcReportsGenerateExport", err, req.user.user_ref_id);
    res.status(500).send("Data Fetching Failed");
  }
};

exports.productionReportsGenerate = async (req, res) => {
  try {
    const matchCondition = {};
    matchCondition.order_qc_status = "4";

    if (req.query.orderUID) {
      matchCondition.order_unique_id = req.query.orderUID;
    }

    let startTimeConditions;
    let loggeduserConditions;
    let searcheduserConditions;

    const loggedUserID = new mongoose.Types.ObjectId(req.user.user_ref_id);
    const loggedUser = req.user.user_role.rolepermissions.ProductionReport.edit !== "0";
    if (loggedUser === true && !req.query.orderProdEmp) {
    } else {
      if (req.query.orderProdEmp) {
        const orderProdEmp = new mongoose.Types.ObjectId(req.query.orderProdEmp);
        if (req.query.orderDepartment) {
          if (req.query.orderDepartment === "F") {
            if (req.query.orderStatus === "1" || req.query.orderStatus === "2") {
              matchCondition.f_order_roll_user = orderProdEmp;
            } else if (req.query.orderStatus === "3" || req.query.orderStatus === "4") {
              matchCondition.f_order_fold_user = orderProdEmp;
            } else if (req.query.orderStatus === "5" || req.query.orderStatus === "6") {
              matchCondition.f_order_racking_user = orderProdEmp;
            } else {
              matchCondition["$or"] = [{ f_order_roll_user: orderProdEmp }, { f_order_fold_user: orderProdEmp }, { f_order_racking_user: orderProdEmp }];
            }
          }
          if (req.query.orderDepartment === "CL") {
            if (req.query.orderStatus === "1" || req.query.orderStatus === "2") {
              matchCondition.cl_order_roll_user = orderProdEmp;
            } else if (req.query.orderStatus === "3" || req.query.orderStatus === "4") {
              matchCondition.cl_order_fold_user = orderProdEmp;
            } else if (req.query.orderStatus === "5" || req.query.orderStatus === "6") {
              matchCondition.cl_order_racking_user = orderProdEmp;
            } else {
              matchCondition["$or"] = [{ cl_order_roll_user: orderProdEmp }, { cl_order_fold_user: orderProdEmp }, { cl_order_racking_user: orderProdEmp }];
            }
          }
          if (req.query.orderDepartment === "J") {
            if (req.query.orderStatus === "1" || req.query.orderStatus === "2") {
              matchCondition.j_order_roll_user = orderProdEmp;
            } else if (req.query.orderStatus === "3" || req.query.orderStatus === "4") {
              matchCondition.j_order_fold_user = orderProdEmp;
            } else if (req.query.orderStatus === "5" || req.query.orderStatus === "6") {
              matchCondition.j_order_racking_user = orderProdEmp;
            } else {
              matchCondition["$or"] = [{ j_order_roll_user: orderProdEmp }, { j_order_fold_user: orderProdEmp }, { j_order_racking_user: orderProdEmp }];
            }
          }
          if (req.query.orderDepartment === "FG") {
            if (req.query.orderStatus === "1" || req.query.orderStatus === "2") {
              matchCondition.fg_order_roll_user = orderProdEmp;
            } else if (req.query.orderStatus === "3" || req.query.orderStatus === "4") {
              matchCondition.fg_order_fold_user = orderProdEmp;
            } else if (req.query.orderStatus === "5" || req.query.orderStatus === "6") {
              matchCondition.fg_order_racking_user = orderProdEmp;
            } else {
              matchCondition["$or"] = [{ fg_order_roll_user: orderProdEmp }, { fg_order_fold_user: orderProdEmp }, { fg_order_racking_user: orderProdEmp }];
            }
          }
        } else {
          searcheduserConditions = [{ f_order_roll_user: orderProdEmp }, { f_order_fold_user: orderProdEmp }, { f_order_racking_user: orderProdEmp }, { cl_order_roll_user: orderProdEmp }, { cl_order_fold_user: orderProdEmp }, { cl_order_racking_user: orderProdEmp }, { j_order_roll_user: orderProdEmp }, { j_order_fold_user: orderProdEmp }, { j_order_racking_user: orderProdEmp }, { fg_order_roll_user: orderProdEmp }, { fg_order_fold_user: orderProdEmp }, { fg_order_racking_user: orderProdEmp }];
        }
      } else {
        if (req.query.orderDepartment) {
          if (req.query.orderDepartment === "F") {
            if (req.query.orderStatus === "1" || req.query.orderStatus === "2") {
              matchCondition.f_order_roll_user = loggedUserID;
            } else if (req.query.orderStatus === "3" || req.query.orderStatus === "4") {
              matchCondition.f_order_fold_user = loggedUserID;
            } else if (req.query.orderStatus === "5" || req.query.orderStatus === "6") {
              matchCondition.f_order_racking_user = loggedUserID;
            } else {
              matchCondition["$or"] = [{ f_order_roll_user: loggedUserID }, { f_order_fold_user: loggedUserID }, { f_order_racking_user: loggedUserID }];
            }
          }
          if (req.query.orderDepartment === "CL") {
            if (req.query.orderStatus === "1" || req.query.orderStatus === "2") {
              matchCondition.cl_order_roll_user = loggedUserID;
            } else if (req.query.orderStatus === "3" || req.query.orderStatus === "4") {
              matchCondition.cl_order_fold_user = loggedUserID;
            } else if (req.query.orderStatus === "5" || req.query.orderStatus === "6") {
              matchCondition.cl_order_racking_user = loggedUserID;
            } else {
              matchCondition["$or"] = [{ cl_order_roll_user: loggedUserID }, { cl_order_fold_user: loggedUserID }, { cl_order_racking_user: loggedUserID }];
            }
          }
          if (req.query.orderDepartment === "J") {
            if (req.query.orderStatus === "1" || req.query.orderStatus === "2") {
              matchCondition.j_order_roll_user = loggedUserID;
            } else if (req.query.orderStatus === "3" || req.query.orderStatus === "4") {
              matchCondition.j_order_fold_user = loggedUserID;
            } else if (req.query.orderStatus === "5" || req.query.orderStatus === "6") {
              matchCondition.j_order_racking_user = loggedUserID;
            } else {
              matchCondition["$or"] = [{ j_order_roll_user: loggedUserID }, { j_order_fold_user: loggedUserID }, { j_order_racking_user: loggedUserID }];
            }
          }
          if (req.query.orderDepartment === "FG") {
            if (req.query.orderStatus === "1" || req.query.orderStatus === "2") {
              matchCondition.fg_order_roll_user = loggedUserID;
            } else if (req.query.orderStatus === "3" || req.query.orderStatus === "4") {
              matchCondition.fg_order_fold_user = loggedUserID;
            } else if (req.query.orderStatus === "5" || req.query.orderStatus === "6") {
              matchCondition.fg_order_racking_user = loggedUserID;
            } else {
              matchCondition["$or"] = [{ fg_order_roll_user: loggedUserID }, { fg_order_fold_user: loggedUserID }, { fg_order_racking_user: loggedUserID }];
            }
          }
        } else {
          loggeduserConditions = [{ f_order_roll_user: loggedUserID }, { f_order_fold_user: loggedUserID }, { f_order_racking_user: loggedUserID }, { cl_order_roll_user: loggedUserID }, { cl_order_fold_user: loggedUserID }, { cl_order_racking_user: loggedUserID }, { j_order_roll_user: loggedUserID }, { j_order_fold_user: loggedUserID }, { j_order_racking_user: loggedUserID }, { fg_order_roll_user: loggedUserID }, { fg_order_fold_user: loggedUserID }, { fg_order_racking_user: loggedUserID }];
        }
      }
    }

    if (req.query.fromTime && req.query.toTime) {
      const fromDateTime = new Date(req.query.fromTime);
      const toDateTime = new Date(req.query.toTime);
      if (req.query.orderDepartment) {
        if (req.query.orderDepartment === "F") {
          if (req.query.orderStatus === "1" || req.query.orderStatus === "2") {
            matchCondition.f_order_roll_start_time = { $gte: fromDateTime, $lte: toDateTime };
          } else if (req.query.orderStatus === "3" || req.query.orderStatus === "4") {
            matchCondition.f_order_fold_start_time = { $gte: fromDateTime, $lte: toDateTime };
          } else if (req.query.orderStatus === "5" || req.query.orderStatus === "6") {
            matchCondition.f_order_racking_start_time = { $gte: fromDateTime, $lte: toDateTime };
          } else {
            matchCondition["$or"] = [{ f_order_roll_start_time: { $gte: fromDateTime, $lte: toDateTime } }, { f_order_fold_start_time: { $gte: fromDateTime, $lte: toDateTime } }, { f_order_racking_start_time: { $gte: fromDateTime, $lte: toDateTime } }];
          }
        }
        if (req.query.orderDepartment === "CL") {
          if (req.query.orderStatus === "1" || req.query.orderStatus === "2") {
            matchCondition.cl_order_roll_start_time = { $gte: fromDateTime, $lte: toDateTime };
          } else if (req.query.orderStatus === "3" || req.query.orderStatus === "4") {
            matchCondition.cl_order_fold_start_time = { $gte: fromDateTime, $lte: toDateTime };
          } else if (req.query.orderStatus === "5" || req.query.orderStatus === "6") {
            matchCondition.cl_order_racking_start_time = { $gte: fromDateTime, $lte: toDateTime };
          } else {
            matchCondition["$or"] = [{ cl_order_roll_start_time: { $gte: fromDateTime, $lte: toDateTime } }, { cl_order_fold_start_time: { $gte: fromDateTime, $lte: toDateTime } }, { cl_order_racking_start_time: { $gte: fromDateTime, $lte: toDateTime } }];
          }
        }
        if (req.query.orderDepartment === "J") {
          if (req.query.orderStatus === "1" || req.query.orderStatus === "2") {
            matchCondition.j_order_roll_start_time = { $gte: fromDateTime, $lte: toDateTime };
          } else if (req.query.orderStatus === "3" || req.query.orderStatus === "4") {
            matchCondition.j_order_fold_start_time = { $gte: fromDateTime, $lte: toDateTime };
          } else if (req.query.orderStatus === "5" || req.query.orderStatus === "6") {
            matchCondition.j_order_racking_start_time = { $gte: fromDateTime, $lte: toDateTime };
          } else {
            matchCondition["$or"] = [{ j_order_roll_start_time: { $gte: fromDateTime, $lte: toDateTime } }, { j_order_fold_start_time: { $gte: fromDateTime, $lte: toDateTime } }, { j_order_racking_start_time: { $gte: fromDateTime, $lte: toDateTime } }];
          }
        }
        if (req.query.orderDepartment === "FG") {
          if (req.query.orderStatus === "1" || req.query.orderStatus === "2") {
            matchCondition.fg_order_roll_start_time = { $gte: fromDateTime, $lte: toDateTime };
          } else if (req.query.orderStatus === "3" || req.query.orderStatus === "4") {
            matchCondition.fg_order_fold_start_time = { $gte: fromDateTime, $lte: toDateTime };
          } else if (req.query.orderStatus === "5" || req.query.orderStatus === "6") {
            matchCondition.fg_order_racking_start_time = { $gte: fromDateTime, $lte: toDateTime };
          } else {
            matchCondition["$or"] = [{ fg_order_roll_start_time: { $gte: fromDateTime, $lte: toDateTime } }, { fg_order_fold_start_time: { $gte: fromDateTime, $lte: toDateTime } }, { fg_order_racking_start_time: { $gte: fromDateTime, $lte: toDateTime } }];
          }
        }
      } else {
        startTimeConditions = [
          { f_order_roll_start_time: { $gte: fromDateTime, $lte: toDateTime } },
          { f_order_fold_start_time: { $gte: fromDateTime, $lte: toDateTime } },
          { f_order_racking_start_time: { $gte: fromDateTime, $lte: toDateTime } },
          { cl_order_roll_start_time: { $gte: fromDateTime, $lte: toDateTime } },
          { cl_order_fold_start_time: { $gte: fromDateTime, $lte: toDateTime } },
          { cl_order_racking_start_time: { $gte: fromDateTime, $lte: toDateTime } },
          { j_order_roll_start_time: { $gte: fromDateTime, $lte: toDateTime } },
          { j_order_fold_start_time: { $gte: fromDateTime, $lte: toDateTime } },
          { j_order_racking_start_time: { $gte: fromDateTime, $lte: toDateTime } },
          { fg_order_roll_start_time: { $gte: fromDateTime, $lte: toDateTime } },
          { fg_order_fold_start_time: { $gte: fromDateTime, $lte: toDateTime } },
          { fg_order_racking_start_time: { $gte: fromDateTime, $lte: toDateTime } },
        ];
      }
    }

    if (req.query.orderDepartment) {
      const orderStatus = req.query.orderStatus;
      if (req.query.orderDepartment === "F") {
        if (req.query.orderStatus) {
          matchCondition.f_order_prod_current_status = { $exists: true };
        } else {
          matchCondition.f_order_prod_current_status = { $exists: true };
        }
      }
      if (req.query.orderDepartment === "CL") {
        if (req.query.orderStatus) {
          matchCondition.cl_order_prod_current_status = { $exists: true };
        } else {
          matchCondition.cl_order_prod_current_status = { $exists: true };
        }
      }
      if (req.query.orderDepartment === "J") {
        if (req.query.orderStatus) {
          matchCondition.j_order_prod_current_status = { $exists: true };
        } else {
          matchCondition.j_order_prod_current_status = { $exists: true };
        }
      }
      if (req.query.orderDepartment === "FG") {
        if (req.query.orderStatus) {
          matchCondition.fg_order_prod_current_status = { $exists: true };
        } else {
          matchCondition.fg_order_prod_current_status = { $exists: true };
        }
      }
    } else {
      if (req.query.orderStatus) {
        const orderStatus = req.query.orderStatus;
        matchCondition["$or"] = [{ cl_order_prod_current_status: orderStatus }, { j_order_prod_current_status: orderStatus }, { fg_order_prod_current_status: orderStatus }, { f_order_prod_current_status: orderStatus }];
      }
    }

    if ((loggeduserConditions && loggeduserConditions.length > 0) || (searcheduserConditions && searcheduserConditions.length > 0) || (startTimeConditions && startTimeConditions.length > 0)) {
      matchCondition["$and"] = [];
    }
    if (loggeduserConditions && loggeduserConditions.length > 0) {
      matchCondition["$and"].push({ $or: loggeduserConditions });
    }
    if (searcheduserConditions && searcheduserConditions.length > 0) {
      matchCondition["$and"].push({ $or: searcheduserConditions });
    }
    if (startTimeConditions && startTimeConditions.length > 0) {
      matchCondition["$and"].push({ $or: startTimeConditions });
    }

    let orderReport = await OrderMaster.aggregate([
      { $match: matchCondition },
      { $sort: { created: -1 } },
      { $lookup: { from: "users", localField: "f_order_roll_user", foreignField: "_id", as: "usersFrollerInfo" } },
      { $lookup: { from: "users", localField: "f_order_fold_user", foreignField: "_id", as: "usersFfoldInfo" } },
      { $lookup: { from: "users", localField: "f_order_racking_user", foreignField: "_id", as: "usersFrackingInfo" } },
      { $lookup: { from: "users", localField: "cl_order_fold_user", foreignField: "_id", as: "usersCLfoldInfo" } },
      { $lookup: { from: "users", localField: "cl_order_racking_user", foreignField: "_id", as: "usersCLrackingInfo" } },
      { $lookup: { from: "users", localField: "j_order_fold_user", foreignField: "_id", as: "usersJfoldInfo" } },
      { $lookup: { from: "users", localField: "j_order_racking_user", foreignField: "_id", as: "usersJrackingInfo" } },
      { $lookup: { from: "users", localField: "fg_order_fold_user", foreignField: "_id", as: "usersFGfoldInfo" } },
      { $lookup: { from: "users", localField: "fg_order_racking_user", foreignField: "_id", as: "usersFGrackingInfo" } },
      { $lookup: { from: "orderssubitemcounts", localField: "_id", foreignField: "Order_Mas_Id", as: "orderssubitemcountsInfoF" } },
      { $lookup: { from: "orderssubitemcounts", localField: "_id", foreignField: "Order_Mas_Id", as: "orderssubitemcountsInfoCL" } },
      { $lookup: { from: "orderssubitemcounts", localField: "_id", foreignField: "Order_Mas_Id", as: "orderssubitemcountsInfoJ" } },
      { $lookup: { from: "orderssubitemcounts", localField: "_id", foreignField: "Order_Mas_Id", as: "orderssubitemcountsInfoFG" } },
      { $lookup: { from: "accounts", localField: "order_customer_id", foreignField: "_id", as: "accountsInfo" } },
      { $unwind: { path: "$usersFrollerInfo", preserveNullAndEmptyArrays: true } },
      { $unwind: { path: "$usersFfoldInfo", preserveNullAndEmptyArrays: true } },
      { $unwind: { path: "$usersFrackingInfo", preserveNullAndEmptyArrays: true } },
      { $unwind: { path: "$usersCLfoldInfo", preserveNullAndEmptyArrays: true } },
      { $unwind: { path: "$usersCLrackingInfo", preserveNullAndEmptyArrays: true } },
      { $unwind: { path: "$usersJfoldInfo", preserveNullAndEmptyArrays: true } },
      { $unwind: { path: "$usersJrackingInfo", preserveNullAndEmptyArrays: true } },
      { $unwind: { path: "$usersFGfoldInfo", preserveNullAndEmptyArrays: true } },
      { $unwind: { path: "$usersFGrackingInfo", preserveNullAndEmptyArrays: true } },
      { $unwind: { path: "$orderssubitemcountsInfoF", preserveNullAndEmptyArrays: true } },
      { $unwind: { path: "$orderssubitemcountsInfoCL", preserveNullAndEmptyArrays: true } },
      { $unwind: { path: "$orderssubitemcountsInfoJ", preserveNullAndEmptyArrays: true } },
      { $unwind: { path: "$orderssubitemcountsInfoFG", preserveNullAndEmptyArrays: true } },
      { $unwind: { path: "$accountsInfo", preserveNullAndEmptyArrays: true } },
      {
        $addFields: {
          FRollerFullName: {
            $concat: [{ $ifNull: ["$usersFrollerInfo.user_firstName", ""] }, " ", { $ifNull: ["$usersFrollerInfo.user_lastName", ""] }],
          },
          FFolderFullName: {
            $concat: [{ $ifNull: ["$usersFfoldInfo.user_firstName", ""] }, " ", { $ifNull: ["$usersFfoldInfo.user_lastName", ""] }],
          },
          FRackingFullName: {
            $concat: [{ $ifNull: ["$usersFrackingInfo.user_firstName", ""] }, " ", { $ifNull: ["$usersFrackingInfo.user_lastName", ""] }],
          },
          CLFolderFullName: {
            $concat: [{ $ifNull: ["$usersCLfoldInfo.user_firstName", ""] }, " ", { $ifNull: ["$usersCLfoldInfo.user_lastName", ""] }],
          },
          CLRackingFullName: {
            $concat: [{ $ifNull: ["$usersCLrackingInfo.user_firstName", ""] }, " ", { $ifNull: ["$usersCLrackingInfo.user_lastName", ""] }],
          },
          JFolderFullName: {
            $concat: [{ $ifNull: ["$usersJfoldInfo.user_firstName", ""] }, " ", { $ifNull: ["$usersJfoldInfo.user_lastName", ""] }],
          },
          JRackingFullName: {
            $concat: [{ $ifNull: ["$usersJrackingInfo.user_firstName", ""] }, " ", { $ifNull: ["$usersJrackingInfo.user_lastName", ""] }],
          },
          FGFolderFullName: {
            $concat: [{ $ifNull: ["$usersFGfoldInfo.user_firstName", ""] }, " ", { $ifNull: ["$usersFGfoldInfo.user_lastName", ""] }],
          },
          FGRackingFullName: {
            $concat: [{ $ifNull: ["$usersFGrackingInfo.user_firstName", ""] }, " ", { $ifNull: ["$usersFGrackingInfo.user_lastName", ""] }],
          },
        },
      },
      {
        $project: {
          _id: 1,
          order_unique_id: 1,
          order_invoice_id: 1,
          order_customer_id: 1,
          order_customer_contact_id: 1,
          order_delivery_date: 1,
          order_Overall_Price: 1,
          order_status: 1,
          order_delivery_address_mode: 1,
          order_delivery_address: 1,
          order_customer_PO_number: 1,
          order_flashing_checker: 1,
          user: 1,
          created: 1,
          updated: 1,
          order_created_person: 1,
          order_designed_person: 1,
          order_design_assigned_time: 1,
          order_qc_status: 1,
          order_qced_person: 1,
          order_qc_assigned_time: 1,
          order_qc_completed_time: 1,
          order_barcode_checker: 1,
          order_prod_current_status: 1,
          FRollerFullName: 1,
          FFolderFullName: 1,
          FRackingFullName: 1,
          CLFolderFullName: 1,
          CLRackingFullName: 1,
          JFolderFullName: 1,
          JRackingFullName: 1,
          FGFolderFullName: 1,
          FGRackingFullName: 1,
          Order_Flashing_Count: "$orderssubitemcountsInfoF.Order_Flashing_Count",
          Order_Cladding_Count: "$orderssubitemcountsInfoCL.Order_Cladding_Count",
          Order_Jobbing_Count: "$orderssubitemcountsInfoJ.Order_Jobbing_Count",
          Order_Faciagutter_Count: "$orderssubitemcountsInfoFG.Order_Faciagutter_Count",
          account_Name: "$accountsInfo.account_Name",
        },
      },
    ]);

    res.status(200).send(orderReport);
  } catch (err) {
    logError("productionReportsGenerate", err, req.user.user_ref_id);
    res.status(500).send("Data Fetching Failed");
  }
};

exports.loadingDashboardOrderList = async (req, res) => {
  try {
    const limit = 30;
    const page = parseInt(req.query.page) || 0;
    const skip = page * limit;

    const matchCondition = {
      order_status: { $ne: "Order Cancelled" },
      order_qc_status: "4",
    };

    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    tomorrow.setHours(0, 0, 0, 0);
    const tomorrowEnd = new Date(tomorrow);
    tomorrowEnd.setHours(23, 59, 59, 999);

    const searchFilter = {};
    if (req.query.orderUID) {
      const escapedKeyword = req.query.orderUID.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      searchFilter.$or = [
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
        // { order_unique_id: { $regex: escapedKeyword, $options: "i" } },
        // { order_customer_PO_number: { $regex: escapedKeyword, $options: "i" } },
        { f_order_racking_dimension1: { $regex: escapedKeyword, $options: "i" } },
        { f_order_racking_dimension2: { $regex: escapedKeyword, $options: "i" } },
        { fg_order_racking_dimension1: { $regex: escapedKeyword, $options: "i" } },
        { fg_order_racking_dimension2: { $regex: escapedKeyword, $options: "i" } },
        { cl_order_racking_dimension1: { $regex: escapedKeyword, $options: "i" } },
        { cl_order_racking_dimension2: { $regex: escapedKeyword, $options: "i" } },
        { j_order_racking_dimension1: { $regex: escapedKeyword, $options: "i" } },
        { j_order_racking_dimension2: { $regex: escapedKeyword, $options: "i" } },
        { roof_order_racking_dimension1: { $regex: escapedKeyword, $options: "i" } },
        { roof_order_racking_dimension2: { $regex: escapedKeyword, $options: "i" } },
      ];
    } else {
      if(req.query.fromTime && req.query.toTime)
        matchCondition.order_delivery_date = {
          $gte: req.query.fromTime ? new Date(req.query.fromTime) : tomorrow,
          $lte: req.query.toTime ? new Date(req.query.toTime) : tomorrowEnd,
      };
    }

    const finalMatch = { $and: [matchCondition, searchFilter] };
    const totalOrdersCount = await OrderMaster.countDocuments(finalMatch);
    const loaderReportItems = await OrderMaster.aggregate([
      { $match: finalMatch },
      { $sort: { order_delivery_date: 1 } },
      {
        $lookup: {
          from: "accounts",
          as: "customerInfo",
          let: { customerId: "$order_customer_id" },
          pipeline: [
            { $match: { $expr: { $eq: ["$_id", "$$customerId"] } } },
            {
              $project: {
                _id: 1,
                account_UID: 1,
                account_Name: 1,
                account_Address_line_one: 1,
                account_Address_line_two: 1,
                account_Address_Country: 1,
                account_Address_State: 1,
                account_Address_City: 1,
                account_Address_PostalCode: 1,
                account_Address_Phone: 1,
                account_Address_Email: 1,
                account_StoreAddress: 1,
                account_Status: 1,
              },
            },
          ],
        },
      },
      {
        $lookup: {
          from: "accountcontacts",
          as: "customercontactInfo",
          let: { contactId: "$order_customer_contact_id" },
          pipeline: [
            { $match: { $expr: { $eq: ["$_id", "$$contactId"] } } },
            { $project: { _id: 1 } }, // Add specific fields if needed
          ],
        },
      },
      {
        $lookup: {
          from: "orderssubitemcounts",
          as: "orderssubitemcountsInfo",
          let: { orderId: "$_id" },
          pipeline: [
            { $match: { $expr: { $eq: ["$Order_Mas_Id", "$$orderId"] } } },
            {
              $project: {
                Order_Flashing_Count: 1,
                Order_Jobbing_Count: 1,
                Order_Cladding_Count: 1,
                Order_Faciagutter_Count: 1,
                Order_Roofing_Count: 1,
                Order_GBI_Count: 1,
                Order_GBIL_Count: 1,
              },
            },
          ],
        },
      },
      {
        $lookup: {
          from: "rackings",
          as: "frackingsInfo",
          let: { rackingId: "$f_order_racking_table" },
          pipeline: [{ $match: { $expr: { $eq: ["$_id", "$$rackingId"] } } }, { $project: { rack_name: 1 } }],
        },
      },
      {
        $lookup: {
          from: "rackings",
          as: "fgrackingsInfo",
          let: { rackingId: "$fg_order_racking_table" },
          pipeline: [{ $match: { $expr: { $eq: ["$_id", "$$rackingId"] } } }, { $project: { rack_name: 1 } }],
        },
      },
      {
        $lookup: {
          from: "rackings",
          as: "clrackingsInfo",
          let: { rackingId: "$cl_order_racking_table" },
          pipeline: [{ $match: { $expr: { $eq: ["$_id", "$$rackingId"] } } }, { $project: { rack_name: 1 } }],
        },
      },
      {
        $lookup: {
          from: "rackings",
          as: "jrackingsInfo",
          let: { rackingId: "$j_order_racking_table" },
          pipeline: [{ $match: { $expr: { $eq: ["$_id", "$$rackingId"] } } }, { $project: { rack_name: 1 } }],
        },
      },
      {
        $lookup: {
          from: "rackings",
          as: "roofrackingsInfo",
          let: { rackingId: "$roof_order_racking_table" },
          pipeline: [{ $match: { $expr: { $eq: ["$_id", "$$rackingId"] } } }, { $project: { rack_name: 1 } }],
        },
      },
      {
        $lookup: {
          from: "rackings",
          as: "gbirackingsInfo",
          let: { rackingId: "$gbi_order_racking_table" },
          pipeline: [{ $match: { $expr: { $eq: ["$_id", "$$rackingId"] } } }, { $project: { rack_name: 1 } }],
        },
      },
      { $unwind: { path: "$customerInfo", preserveNullAndEmptyArrays: true } },
      { $unwind: { path: "$customercontactInfo", preserveNullAndEmptyArrays: true } },
      { $unwind: { path: "$orderssubitemcountsInfo", preserveNullAndEmptyArrays: true } },
      { $unwind: { path: "$frackingsInfo", preserveNullAndEmptyArrays: true } },
      { $unwind: { path: "$fgrackingsInfo", preserveNullAndEmptyArrays: true } },
      { $unwind: { path: "$clrackingsInfo", preserveNullAndEmptyArrays: true } },
      { $unwind: { path: "$jrackingsInfo", preserveNullAndEmptyArrays: true } },
      { $unwind: { path: "$roofrackingsInfo", preserveNullAndEmptyArrays: true } },
      { $unwind: { path: "$gbirackingsInfo", preserveNullAndEmptyArrays: true } },
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
          order_customer_contact_phone: 1,
          order_customer_contact_email: 1,
          order_site_delivery_attention_person: 1,
          order_site_delivery_attention_contact: 1,
          order_delivery_date: 1,
          order_delivery_time: 1,
          order_delivery_session: 1,
          order_delivery_date_str: 1,
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
          order_status: 1,
          order_Pieces: 1,
          order_qc_status: 1,
          order_flashing_checker: 1,
          f_order_racking_dimension1: 1,
          f_order_racking_dimension2: 1,
          fg_order_racking_dimension1: 1,
          fg_order_racking_dimension2: 1,
          j_order_racking_dimension1: 1,
          j_order_racking_dimension2: 1,
          cl_order_racking_dimension1: 1,
          cl_order_racking_dimension2: 1,
          roof_order_racking_dimension1: 1,
          roof_order_racking_dimension2: 1,
          created: 1,
          created_str: 1,
          account_ID: "$customerInfo._id",
          account_UID: "$customerInfo.account_UID",
          account_Name: "$customerInfo.account_Name",
          account_Address_line_one: "$customerInfo.account_Address_line_one",
          account_Address_line_two: "$customerInfo.account_Address_line_two",
          account_Address_Country: "$customerInfo.account_Address_Country",
          account_Address_State: "$customerInfo.account_Address_State",
          account_Address_City: "$customerInfo.account_Address_City",
          account_Address_PostalCode: "$customerInfo.account_Address_PostalCode",
          account_Address_Phone: "$customerInfo.account_Address_Phone",
          account_Address_Email: "$customerInfo.account_Address_Email",
          account_StoreAddress: "$customerInfo.account_StoreAddress",
          account_Status: "$customerInfo.account_Status",
          Order_Flashing_Count: "$orderssubitemcountsInfo.Order_Flashing_Count",
          Order_Jobbing_Count: "$orderssubitemcountsInfo.Order_Jobbing_Count",
          Order_Cladding_Count: "$orderssubitemcountsInfo.Order_Cladding_Count",
          Order_Faciagutter_Count: "$orderssubitemcountsInfo.Order_Faciagutter_Count",
          Order_Roofing_Count: "$orderssubitemcountsInfo.Order_Roofing_Count",
          Order_GBI_Count: "$orderssubitemcountsInfo.Order_GBI_Count",
          Order_GBIL_Count: "$orderssubitemcountsInfo.Order_GBIL_Count",

          f_order_racking_table: "$frackingsInfo.rack_name",
          f_order_prod_current_status: 1,
          f_order_prod_push_status: 1,

          fg_order_racking_table: "$fgrackingsInfo.rack_name",
          fg_order_prod_current_status: 1,
          fg_order_prod_push_status: 1,

          cl_order_racking_table: "$clrackingsInfo.rack_name",
          cl_order_prod_current_status: 1,
          cl_order_prod_push_status: 1,

          j_order_racking_table: "$jrackingsInfo.rack_name",
          j_order_prod_current_status: 1,
          j_order_prod_push_status: 1,

          roof_order_racking_table: "$roofrackingsInfo.rack_name",
          roof_order_prod_current_status: 1,
          roof_order_prod_push_status: 1,

          gbi_order_racking_table: "$gbirackingsInfo.rack_name",
          gbi_order_prod_current_status: 1,
          gbi_order_prod_push_status: 1,
        },
      },
    ])
      .skip(skip)
      .limit(limit);

    const responseObject = {
      loaderReportItems,
      totalItems: totalOrdersCount,
      rowsPerPage: limit,
      totalPages: Math.ceil(totalOrdersCount / limit),
    };
    res.status(200).json(responseObject);
  } catch (err) {
    console.log(err)
    logError("loadingDashboardOrderList", err, req.user.user_ref_id);
    res.status(500).json({ error: "Data Fetching Failed" });
  }
};

exports.loadingDashboardOrderListExport = async (req, res) => {
  try {
    const matchCondition = {
      order_status: { $ne: "Order Cancelled" },
      order_qc_status: "4",
    };

    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    tomorrow.setHours(0, 0, 0, 0);
    const tomorrowEnd = new Date(tomorrow);
    tomorrowEnd.setHours(23, 59, 59, 999);

    if (req.query.orderUID) {
      // const escapedKeyword = req.query.orderUID.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      matchCondition.$or = [
        // { order_unique_id: { $regex: escapedKeyword, $options: "i" } },
        {
          $expr: {
            $or: [
              { $eq: ["$order_unique_id", req.query.orderUID] },
              {
                  $and: [
                  { $eq: ["$order_customer_UID", AWF_CUST_ID] },
                  { $eq: [{ $substr: ["$order_customer_PO_number", 0, 6] }, req.query.orderUID] }
                  ]
              }
            ]
          }
        },
        // { order_unique_id: { $regex: escapedKeyword, $options: "i" } },
      ]
    } else {
      matchCondition.order_delivery_date = {
        $gte: req.query.fromTime ? new Date(req.query.fromTime) : tomorrow,
        $lte: req.query.toTime ? new Date(req.query.toTime) : tomorrowEnd,
      };
    }

    const loaderReportItems = await OrderMaster.aggregate([
      { $match: matchCondition },
      { $sort: { order_delivery_date: 1 } },
      {
        $lookup: {
          from: "accounts",
          as: "customerInfo",
          let: { customerId: "$order_customer_id" },
          pipeline: [
            { $match: { $expr: { $eq: ["$_id", "$$customerId"] } } },
            {
              $project: {
                _id: 1,
                account_UID: 1,
                account_Name: 1,
                account_Address_line_one: 1,
                account_Address_line_two: 1,
                account_Address_Country: 1,
                account_Address_State: 1,
                account_Address_City: 1,
                account_Address_PostalCode: 1,
                account_Address_Phone: 1,
                account_Address_Email: 1,
                account_StoreAddress: 1,
                account_Status: 1,
              },
            },
          ],
        },
      },
      {
        $lookup: {
          from: "accountcontacts",
          as: "customercontactInfo",
          let: { contactId: "$order_customer_contact_id" },
          pipeline: [{ $match: { $expr: { $eq: ["$_id", "$$contactId"] } } }, { $project: { _id: 1 } }],
        },
      },
      {
        $lookup: {
          from: "orderssubitemcounts",
          as: "orderssubitemcountsInfo",
          let: { orderId: "$_id" },
          pipeline: [
            { $match: { $expr: { $eq: ["$Order_Mas_Id", "$$orderId"] } } },
            {
              $project: {
                Order_Flashing_Count: 1,
                Order_Jobbing_Count: 1,
                Order_Cladding_Count: 1,
                Order_Faciagutter_Count: 1,
                Order_Roofing_Count: 1,
                Order_GBI_Count: 1,
              },
            },
          ],
        },
      },
      {
        $lookup: {
          from: "rackings",
          as: "frackingsInfo",
          let: { rackingId: "$f_order_racking_table" },
          pipeline: [{ $match: { $expr: { $eq: ["$_id", "$$rackingId"] } } }, { $project: { rack_name: 1 } }],
        },
      },
      {
        $lookup: {
          from: "rackings",
          as: "fgrackingsInfo",
          let: { rackingId: "$fg_order_racking_table" },
          pipeline: [{ $match: { $expr: { $eq: ["$_id", "$$rackingId"] } } }, { $project: { rack_name: 1 } }],
        },
      },
      {
        $lookup: {
          from: "rackings",
          as: "clrackingsInfo",
          let: { rackingId: "$cl_order_racking_table" },
          pipeline: [{ $match: { $expr: { $eq: ["$_id", "$$rackingId"] } } }, { $project: { rack_name: 1 } }],
        },
      },
      {
        $lookup: {
          from: "rackings",
          as: "jrackingsInfo",
          let: { rackingId: "$j_order_racking_table" },
          pipeline: [{ $match: { $expr: { $eq: ["$_id", "$$rackingId"] } } }, { $project: { rack_name: 1 } }],
        },
      },
      {
        $lookup: {
          from: "rackings",
          as: "roofrackingsInfo",
          let: { rackingId: "$roof_order_racking_table" },
          pipeline: [{ $match: { $expr: { $eq: ["$_id", "$$rackingId"] } } }, { $project: { rack_name: 1 } }],
        },
      },
      {
        $lookup: {
          from: "rackings",
          as: "gbirackingsInfo",
          let: { rackingId: "$gbi_order_racking_table" },
          pipeline: [{ $match: { $expr: { $eq: ["$_id", "$$rackingId"] } } }, { $project: { rack_name: 1 } }],
        },
      },
      { $unwind: { path: "$customerInfo", preserveNullAndEmptyArrays: true } },
      { $unwind: { path: "$customercontactInfo", preserveNullAndEmptyArrays: true } },
      { $unwind: { path: "$orderssubitemcountsInfo", preserveNullAndEmptyArrays: true } },
      { $unwind: { path: "$frackingsInfo", preserveNullAndEmptyArrays: true } },
      { $unwind: { path: "$fgrackingsInfo", preserveNullAndEmptyArrays: true } },
      { $unwind: { path: "$clrackingsInfo", preserveNullAndEmptyArrays: true } },
      { $unwind: { path: "$jrackingsInfo", preserveNullAndEmptyArrays: true } },
      { $unwind: { path: "$roofrackingsInfo", preserveNullAndEmptyArrays: true } },
      { $unwind: { path: "$gbirackingsInfo", preserveNullAndEmptyArrays: true } },
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
          order_customer_contact_phone: 1,
          order_customer_contact_email: 1,
          order_site_delivery_attention_person: 1,
          order_site_delivery_attention_contact: 1,
          order_delivery_date: 1,
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
          order_status: 1,
          order_Pieces: 1,
          order_qc_status: 1,
          order_flashing_checker: 1,
          f_order_racking_dimension1: 1,
          f_order_racking_dimension2: 1,
          fg_order_racking_dimension1: 1,
          fg_order_racking_dimension2: 1,
          j_order_racking_dimension1: 1,
          j_order_racking_dimension2: 1,
          cl_order_racking_dimension1: 1,
          cl_order_racking_dimension2: 1,
          roof_order_racking_dimension1: 1,
          roof_order_racking_dimension2: 1,
          created: 1,
          created_str: 1,
          order_delivery_date_str: 1,
          account_ID: "$customerInfo._id",
          account_UID: "$customerInfo.account_UID",
          account_Name: "$customerInfo.account_Name",
          account_Address_line_one: "$customerInfo.account_Address_line_one",
          account_Address_line_two: "$customerInfo.account_Address_line_two",
          account_Address_Country: "$customerInfo.account_Address_Country",
          account_Address_State: "$customerInfo.account_Address_State",
          account_Address_City: "$customerInfo.account_Address_City",
          account_Address_PostalCode: "$customerInfo.account_Address_PostalCode",
          account_Address_Phone: "$customerInfo.account_Address_Phone",
          account_Address_Email: "$customerInfo.account_Address_Email",
          account_StoreAddress: "$customerInfo.account_StoreAddress",
          account_Status: "$customerInfo.account_Status",
          Order_Flashing_Count: "$orderssubitemcountsInfo.Order_Flashing_Count",
          Order_Jobbing_Count: "$orderssubitemcountsInfo.Order_Jobbing_Count",
          Order_Cladding_Count: "$orderssubitemcountsInfo.Order_Cladding_Count",
          Order_Faciagutter_Count: "$orderssubitemcountsInfo.Order_Faciagutter_Count",
          Order_Roofing_Count: "$orderssubitemcountsInfo.Order_Roofing_Count",
          Order_GBI_Count: "$orderssubitemcountsInfo.Order_GBI_Count",
          f_order_racking_table: "$frackingsInfo.rack_name",
          f_order_prod_current_status: 1,
          f_order_prod_push_status: 1,

          fg_order_racking_table: "$fgrackingsInfo.rack_name",
          fg_order_prod_current_status: 1,
          fg_order_prod_push_status: 1,

          cl_order_racking_table: "$clrackingsInfo.rack_name",
          cl_order_prod_current_status: 1,
          cl_order_prod_push_status: 1,

          j_order_racking_table: "$jrackingsInfo.rack_name",
          j_order_prod_current_status: 1,
          j_order_prod_push_status: 1,

          roof_order_racking_table: "$roofrackingsInfo.rack_name",
          roof_order_prod_current_status: 1,
          roof_order_prod_push_status: 1,

          gbi_order_racking_table: "$gbirackingsInfo.rack_name",
          gbi_order_prod_current_status: 1,
          gbi_order_prod_push_status: 1,
        },
      },
    ]);
    res.status(200).json(loaderReportItems);
  } catch (err) {
    logError("loadingDashboardOrderListExport", err, req.user.user_ref_id);
    res.status(500).json({ error: "Data Fetching Failed" });
  }
};

exports.myobLogin = async (req, res) => {
  try {
    const payload = {
      name: "" + process.env.MYOBUserName + "",
      password: "" + process.env.MYOBPassword + "",
      company: "" + process.env.MYOBCompany + "",
      branch: "" + process.env.MYOBBranch + "",
    };
    const response = await axios.post("" + process.env.MYOBURLLogin + "login", payload);
    const headers = response.headers;

    const aspxAuthCookie = headers["set-cookie"].find(cookie => cookie.startsWith(".ASPXAUTH="));
    if (aspxAuthCookie) {
      const aspxAuthValue = aspxAuthCookie.split(";")[0].split("=")[1];
      fs.writeFileSync("aspxauth.txt", aspxAuthValue);
    } else {
      console.log(".ASPXAUTH cookie not found");
    }
    res.send("Response logged in the console.");
  } catch (error) {
    logError("myobLogin", error, req.user.user_ref_id);
    res.status(500).send("MYOB Login Failed.");
  }
};

exports.myobLogout = async (req, res) => {
  try {
    const payload = {
      name: "" + process.env.MYOBUserName + "",
      password: "" + process.env.MYOBPassword + "",
      company: "" + process.env.MYOBCompany + "",
      branch: "" + process.env.MYOBBranch + "",
    };
    const response = await axios.post("" + process.env.MYOBURLLogin + "logout", payload);
    res.send("Response logged Out.");
  } catch (error) {
    logError("myobLogout", error, req.user.user_ref_id);
    res.status(500).send("MYOB Logout Failed.");
  }
};

exports.sentOrderMasterItemDetailsToMyob = async (req, res) => {
  const ordID = new mongoose.Types.ObjectId(req.params.orderid);
  const OrderStatus = await OrderMaster.findById(ordID);
  let status = OrderStatus.order_status;
  let ordStr = OrderStatus.order_unique_id;
  if (status === "Order Cancelled") {
    const err = new Error("Attempt To Push Cancelled Order " + ordStr + " To MYOB");
    logError("sentOrderMasterItemDetailsToMyob", err, req.user.user_ref_id);
    return res.status(500).send("Cancelled Order. MYOB Push Restricted");
  }

  const session = await mongoose.startSession();
  session.startTransaction();
  try {
    let now = new Date();
    let options = { timeZone: "Australia/Melbourne", hour12: true };
    let datenow = new Intl.DateTimeFormat("en-US", options).format(now);
    let melbourneTime = new Date(now.toLocaleString("en-US", { timeZone: "Australia/Melbourne" }));
    let formattedNow =
      [("0" + melbourneTime.getDate()).slice(-2), ("0" + (melbourneTime.getMonth() + 1)).slice(-2), melbourneTime.getFullYear()].join("-") +
      " " +
      melbourneTime
        .toLocaleTimeString("en-US", {
          hour: "2-digit",
          minute: "2-digit",
          hour12: true,
        })
        .toLowerCase()
        .replace(":", ":")
        .replace(" ", " ");
    formattedNow = formattedNow.replace(/\.(\d{2})/, ":$1");

    const orderID = new mongoose.Types.ObjectId(req.params.orderid);
    const UserID = new mongoose.Types.ObjectId(req.query.userid);
    let order = await OrderMaster.findById(orderID).session(session);

    if (order.order_myob_session_flag === "OFF") {
      order.order_myob_session_flag = "ON";
      await order.save({ session });

      let orderCustomItemDetails = await OrderItemManual.find({ order_master_me_id: orderID }).session(session);
      let orderFlashingItemDetails = [];
      if (order.order_flashing_checker === true) {
        orderFlashingItemDetails = await OrderItem.find({ order_master_id: orderID }).session(session);
      }

      let combinedItems = [...orderCustomItemDetails, ...orderFlashingItemDetails];
      combinedItems.sort((a, b) => new Date(a.order_row_index) - new Date(b.order_row_index));

      let orderMasDetails = await OrderMaster.findById(orderID).session(session);
      let CusObjID = orderMasDetails.order_customer_id;
      let OrderUID = orderMasDetails.order_unique_id;
      let OrderSORowID = orderMasDetails.order_myob_row_id;
      let orderCustomerDetails = await Account.findById(CusObjID).session(session);
      let CusomerUID = orderCustomerDetails.account_UID;

      let aspxAuthValue = await loginMyob();
      if (aspxAuthValue) {
        let Details = [];
        const detailsPromises = combinedItems.map(async item => {
          let isCustomItem = !!item.order_item_me_code;
          if (isCustomItem) {
            let OrdCuslength = parseFloat(item.order_item_me_length);
            let OrdCuspieces = parseFloat(item.order_item_me_uom_value);
            let OrdCusQty = parseFloat(item.order_item_me_quantity);
            let OrdCalcQty = OrdCuslength * OrdCuspieces;
            let limitedOrdCusQty = OrdCusQty.toFixed(2);
            if (OrdCusQty.toFixed(2) === OrdCalcQty.toFixed(2)) {
              return {
                InventoryID: { value: "" + item.order_item_me_code + "" },
                LineDescription: { value: "" + item.order_item_me_description + "" },
                pieces: { value: OrdCuspieces },
                Length: { value: OrdCuslength },
                UnitPrice: { value: "" + item.order_item_qty_me_price + "" },
                DiscountPercent: { value: item.order_item_me_discount },
              };
            } else {
              return {
                InventoryID: { value: "" + item.order_item_me_code + "" },
                LineDescription: {
                  value: `${item.order_item_me_description} - ${OrdCuspieces} * ${OrdCuslength}`,
                },
                OrderQty: { value: limitedOrdCusQty },
                UnitPrice: { value: "" + item.order_item_qty_me_price + "" },
                DiscountPercent: { value: item.order_item_me_discount },
              };
            }
          } else {
            let Ordlength = parseFloat(item.order_item_length) / 1000;
            let Ordpieces = parseFloat(item.order_item_pieces);
            let OrdQty = parseFloat(item.order_item_quantity);
            let limitedOrdQty = OrdQty.toFixed(2);

            return {
              InventoryID: { value: "" + item.order_item_code + "" },
              pieces: { value: Ordpieces },
              Length: { value: Ordlength },
              OrderQty: { value: limitedOrdQty },
              UnitPrice: { value: "" + item.order_item_price + "" },
              DiscountPercent: { value: item.order_item_discount },
            };
          }
        });
        Details = await Promise.all(detailsPromises);
        const apiUrl = "" + process.env.MYOBURL + "SalesOrder";
        const aspxAuthValue = fs.readFileSync("aspxauth.txt", "utf8");
        if (!aspxAuthValue) {
          await session.abortTransaction();
          session.endSession();
          return res.status(500).send("No .ASPXAUTH found.");
        }

        let salesOrderData1 = {
          id: OrderSORowID,
          CustomerID: {
            value: "" + CusomerUID + "",
          },
          Hold: {
            value: false,
          },
          OrderNbr: {
            value: "" + OrderUID + "",
          },
          OrderType: {
            value: "SO",
          },
          Details: Details,
        };
        const headers = {
          Cookie: `.ASPXAUTH=${aspxAuthValue}`,
          "Content-Type": "application/json",
        };
        const response = await axios.put(apiUrl, salesOrderData1, { headers });
        if (response.data.id) {
          order.order_myob_push_status = true;
          order.order_myob_moved_time_str = formattedNow;
          order.order_myob_pushed_person = UserID;
          order.order_status = process.env.MasOrdStatus5;
          await order.save({ session });
          await lineNumberStorageFn(response.data.id, response.data.OrderNbr.value, headers);
        }
        await session.commitTransaction();
        session.endSession();
        res.send(response.data);
      } else {
        await session.abortTransaction();
        session.endSession();
        const err = new Error("MYOB Login Failed. Check Login Credentials.");
        logError("sentOrderMasterItemDetailsToMyob", err, req.user.user_ref_id);
        res.status(500).send("MYOB Login Failed");
      }
      await logoutMyob();
    } else {
      await session.abortTransaction();
      session.endSession();
      res.status(500).send("OrderID Already Pushed To MYOB");
    }
  } catch (error) {
    await session.abortTransaction();
    session.endSession();
    const failedorderID = new mongoose.Types.ObjectId(req.params.orderid);
    const failureData = {
      $set: {
        order_myob_session_flag: "OFF",
      },
    };
    await OrderMaster.findByIdAndUpdate(failedorderID, failureData);
    const err = new Error("MYOB Insertion Failed For Order " + ordStr + ". Please Check Login Credentials, Inventory IDs and Related Entities");
    logError("sentOrderMasterItemDetailsToMyob", err, req.user.user_ref_id);
    // res.status(500).send("MYOB Insertion Failed.");
    handleMongooseError(error, res)
  }
};

async function lineNumberStorageFn(myob_row_id, myob_order_no, headers) {
  try {
    const apiUrl = `${process.env.MYOBURL}SalesOrder/SO/${myob_order_no}?$expand=details`;
    const response = await axios.get(apiUrl, { headers });
    const orderdetails = response.data;
    const orderdetailsarray = orderdetails.Details || [];
    const linenumbersarray = orderdetailsarray.map(detail => ({
      lineNumber: detail.LineNbr.value,
      id: detail.id,
    }));

    // Check and delete existing entry with same myob_Order_Id
    const existing = await OrderLineNumber.findOne({ myob_Order_Id: myob_order_no });
    if (existing) {
      const deleteResult = await OrderLineNumber.deleteMany({ myob_Order_Id: myob_order_no });
      if (deleteResult.deletedCount === 0) {
        console.error(`Failed to delete existing OrderLineNumber with myob_Order_Id: ${myob_order_no}`);
        return [];
      }
    }
    const orderLineData = new OrderLineNumber({
      myob_Row_Id: myob_row_id,
      myob_Order_Id: myob_order_no,
      myob_Order_LineNumbers: linenumbersarray,
    });
    await orderLineData.save();
    return linenumbersarray;
  } catch (error) {
    console.error("Error fetching order details: ", error);
    return [];
  }
}

// MYOB Re-Push on Dragged Order with Existing Line Items Delete
async function DeleteExistingLineItem(orderID) {
  let LineDetails = [];
  let DeleteFlag = false;
  let orderMasDetails = await OrderMaster.findById(orderID);
  if (!orderMasDetails) {
    return DeleteFlag;
  }
  let OrderUID = orderMasDetails.order_unique_id;
  let orderLineNumbersData = await OrderLineNumber.find({ myob_Order_Id: OrderUID });
  if (!orderLineNumbersData.length) {
    return DeleteFlag;
  }
  let orderMyobRowId = orderLineNumbersData[0].myob_Row_Id;
  let orderLineNumbers = orderLineNumbersData[0].myob_Order_LineNumbers;
  const detailsLnPromises = orderLineNumbers.map(async lineitem => {
    return {
      id: lineitem.id,
      LineNbr: { value: lineitem.lineNumber },
      delete: true,
    };
  });
  LineDetails = await Promise.all(detailsLnPromises);
  let aspxAuthValue = await loginMyob();
  if (aspxAuthValue) {
    const apiUrl = `${process.env.MYOBURL}SalesOrder`;
    const aspxAuthValue = fs.readFileSync("aspxauth.txt", "utf8");
    let salesOrderLineNbrs = {
      id: orderMyobRowId,
      OrderNbr: { value: "" + OrderUID + "" },
      Details: LineDetails,
    };
    const headers = {
      Cookie: `.ASPXAUTH=${aspxAuthValue}`,
      "Content-Type": "application/json",
    };
    try {
      const response = await axios.put(apiUrl, salesOrderLineNbrs, { headers });
      if (response.data.id) {
        let deleteLineNumbersData = await OrderLineNumber.deleteMany({ myob_Order_Id: OrderUID });
        if (deleteLineNumbersData) {
          DeleteFlag = true;
        }
      }
    } catch (error) {
      console.error("Error updating SalesOrder:", error.response ? error.response.data : error.message);
    }
  } else {
    return DeleteFlag;
  }
  await logoutMyob();
  return DeleteFlag;
}

exports.reSentOrderMasterItemDetailsToMyob = async (req, res) => {
  const ordID = new mongoose.Types.ObjectId(req.params.orderid);
  const OrderStatus = await OrderMaster.findById(ordID);
  let status = OrderStatus.order_status;
  let ordStr = OrderStatus.order_unique_id;
  if (status === "Order Cancelled") {
    const err = new Error("Attempt To Push Cancelled Order " + ordStr + " To MYOB");
    logError("reSentOrderMasterItemDetailsToMyob", err, req.user.user_ref_id);
    return res.status(500).send("Cancelled Order. MYOB Push Restricted");
  }

  // let isDeleted = await DeleteExistingLineItem(req.params.orderid);
  // if (isDeleted === true) {
    const session = await mongoose.startSession();
    session.startTransaction();
    try {
      let now = new Date();
      let options = { timeZone: "Australia/Melbourne", hour12: true };
      let datenow = new Intl.DateTimeFormat("en-US", options).format(now);
      let melbourneTime = new Date(now.toLocaleString("en-US", { timeZone: "Australia/Melbourne" }));
      let formattedNow =
        [("0" + melbourneTime.getDate()).slice(-2), ("0" + (melbourneTime.getMonth() + 1)).slice(-2), melbourneTime.getFullYear()].join("-") +
        " " +
        melbourneTime
          .toLocaleTimeString("en-US", {
            hour: "2-digit",
            minute: "2-digit",
            hour12: true,
          })
          .toLowerCase()
          .replace(":", ":")
          .replace(" ", " ");
      formattedNow = formattedNow.replace(/\.(\d{2})/, ":$1");

      const orderID = new mongoose.Types.ObjectId(req.params.orderid);
      const UserID = new mongoose.Types.ObjectId(req.query.userid);
      let order = await OrderMaster.findById(orderID).session(session);

      await order.save({ session });
      let orderCustomItemDetails = await OrderItemManual.find({ order_master_me_id: orderID }).session(session);
      let orderFlashingItemDetails = [];

      if (order.order_flashing_checker === true) {
        orderFlashingItemDetails = await OrderItem.find({ order_master_id: orderID }).session(session);
      }

      let combinedItems = [...orderCustomItemDetails, ...orderFlashingItemDetails];
      combinedItems.sort((a, b) => new Date(a.order_row_index) - new Date(b.order_row_index));
      let orderMasDetails = await OrderMaster.findById(orderID).session(session);
      let CusObjID = orderMasDetails.order_customer_id;
      let OrderUID = orderMasDetails.order_unique_id;
      let OrderSORowID = orderMasDetails.order_myob_row_id;
      let OldOrderRePushCount = orderMasDetails.order_myob_repush_count;
      let NewOrderRePushCount = parseFloat(OldOrderRePushCount) + 1;
      let orderCustomerDetails = await Account.findById(CusObjID).session(session);
      let CusomerUID = orderCustomerDetails.account_UID;

      let aspxAuthValue = await loginMyob();
      if (aspxAuthValue) {
        let Details = [];
        const detailsPromises = combinedItems.map(async item => {
          let isCustomItem = !!item.order_item_me_code;
          if (isCustomItem) {
            let OrdCuslength = parseFloat(item.order_item_me_length);
            let OrdCuspieces = parseFloat(item.order_item_me_uom_value);
            let OrdCusQty = parseFloat(item.order_item_me_quantity);
            let limitedOrdCusQty = OrdCusQty.toFixed(2);
            let OrdCalcQty = OrdCuslength * OrdCuspieces;
            if (OrdCusQty.toFixed(2) === OrdCalcQty.toFixed(2)) {
              return {
                InventoryID: { value: "" + item.order_item_me_code + "" },
                LineDescription: { value: "" + item.order_item_me_description + "" },
                pieces: { value: OrdCuspieces },
                Length: { value: OrdCuslength },
                UnitPrice: { value: "" + item.order_item_qty_me_price + "" },
                DiscountPercent: { value: item.order_item_me_discount },
              };
            } else {
              return {
                InventoryID: { value: "" + item.order_item_me_code + "" },
                LineDescription: {
                  value: `${item.order_item_me_description} - ${OrdCuspieces} * ${OrdCuslength}`,
                },
                OrderQty: { value: limitedOrdCusQty },
                UnitPrice: { value: "" + item.order_item_qty_me_price + "" },
                DiscountPercent: { value: item.order_item_me_discount },
              };
            }
          } else {
            let Ordlength = parseFloat(item.order_item_length) / 1000;
            let Ordpieces = parseFloat(item.order_item_pieces);
            let OrdQty = parseFloat(item.order_item_quantity);
            let limitedOrdQty = OrdQty.toFixed(2);

            return {
              InventoryID: { value: "" + item.order_item_code + "" },
              pieces: { value: Ordpieces },
              Length: { value: Ordlength },
              OrderQty: { value: limitedOrdQty },
              UnitPrice: { value: "" + item.order_item_price + "" },
              DiscountPercent: { value: item.order_item_discount },
            };
          }
        });

        Details = await Promise.all(detailsPromises);
        const apiUrl = "" + process.env.MYOBURL + "SalesOrder";
        const aspxAuthValue = fs.readFileSync("aspxauth.txt", "utf8");
        if (!aspxAuthValue) {
          await session.abortTransaction();
          session.endSession();
          return res.status(500).send("No .ASPXAUTH found.");
        }

        let salesOrderData1 = {
          id: OrderSORowID,
          CustomerID: {
            value: "" + CusomerUID + "",
          },
          Hold: {
            value: false,
          },
          OrderNbr: {
            value: "" + OrderUID + "",
          },
          OrderType: {
            value: "SO",
          },
          Details: Details,
        };
        const headers = {
          Cookie: `.ASPXAUTH=${aspxAuthValue}`,
          "Content-Type": "application/json",
        };
        const response = await axios.put(apiUrl, salesOrderData1, { headers });
        if (response.data.id) {
          await DeleteExistingLineItem(req.params.orderid);
          order.order_myob_repush_count = NewOrderRePushCount;
          order.order_myob_repushed_person = UserID;
          order.order_status = process.env.MasOrdStatus5;
          await order.save({ session });
          await lineNumberStorageFn(response.data.id, response.data.OrderNbr.value, headers);
        }
        await session.commitTransaction();
        session.endSession();
        res.send(response.data);
      } else {
        await session.abortTransaction();
        session.endSession();
        res.status(500).send("Login Failed");
      }
      await logoutMyob();
    } catch (error) {
      await session.abortTransaction();
      session.endSession();
      const err = new Error("MYOB Repush Failed For Order " + ordStr + ". Please Check Login Credentials, Inventory IDs and Related Entities.");
      logError("reSentOrderMasterItemDetailsToMyob", err, req.user.user_ref_id);
      handleMongooseError(error, res)
      // res.status(500).send("MYOB Repush Failed. Please Check Login Credentials, Inventory IDs and Related Entities");
    }
  // } else {
  //   const err = new Error("Deletion Of the Line Items For  " + ordStr + " Failed Or No Line Items Found.");
  //   logError("reSentOrderMasterItemDetailsToMyob", err, req.user.user_ref_id);
  //   res.status(500).send("Deletion Of the Line Items Failed Or No Line Items Found.");
  // }
};

exports.fetchCustomerFromMyobUsingOrderid = async (req, res) => {
  try {
    const orderUID = req.params.orderid;

    let aspxAuthValue = await loginMyob();
    if (aspxAuthValue) {
      const url = `${process.env.MYOBURL}SalesOrder/SO/${orderUID}?$expand=ShipToAddress,ShipToContact`;
      const headers = {
        Cookie: `.ASPXAUTH=${aspxAuthValue}`,
      };

      const response = await axios.get(url, { headers });
      if (response.status === 200) {
        const orderArray = response.data;
        let responseObject = {
          SORowKey: orderArray.id,
          CusID: orderArray.CustomerID.value,
          CusOrderNo: orderArray.CustomerOrder.value,
          CusShipToContactOverride: orderArray.ShipToContactOverride.value,
          CusShipToAddressOverride: orderArray.ShipToAddressOverride.value,
          ExpectedDeliveryDate: orderArray.RequestedOn.value,
          STAAddressLine1: orderArray.ShipToAddress.AddressLine1.value,
          STAAddressLine2: orderArray.ShipToAddress.AddressLine2.value,
          STACity: orderArray.ShipToAddress.City.value,
          STACountry: orderArray.ShipToAddress.Country.value,
          STAPostalCode: orderArray.ShipToAddress.PostalCode.value,
          STAState: orderArray.ShipToAddress.State.value,
        };

        if (responseObject.CusID) {
          let CusDetails = await Account.find({ account_UID: responseObject.CusID });
          if (CusDetails.length > 0) {
            const mergedDetails = {
              ...CusDetails[0].toObject(),
              ...responseObject,
            };
            res.status(200).json(mergedDetails);
          } else {
            res.status(500).send("Customer not found");
          }
        } else {
          res.status(500).send("Internal Server Error");
        }
      } else {
        res.status(500).send("Internal Server Error");
      }
    } else {
      res.status(500).send("Login Failed");
    }
    await logoutMyob();
  } catch (error) {
    logError("fetchCustomerFromMyobUsingOrderid", error, req.user.user_ref_id);
    res.status(500).send("Data Fetching Failed");
  }
};

async function loginMyob() {
  const payload = {
    name: "" + process.env.MYOBUserName + "",
    password: "" + process.env.MYOBPassword + "",
    company: "" + process.env.MYOBCompany + "",
    branch: "" + process.env.MYOBBranch + "",
  };
  const response = await axios.post("" + process.env.MYOBURLLogin + "login", payload);
  const headers = response.headers;
  const aspxAuthCookie = headers["set-cookie"].find(cookie => cookie.startsWith(".ASPXAUTH="));
  let aspxAuthValue;
  if (aspxAuthCookie) {
    aspxAuthValue = aspxAuthCookie.split(";")[0].split("=")[1];
    fs.writeFileSync("aspxauth.txt", aspxAuthValue);
  } else {
    console.log(".ASPXAUTH cookie not found");
  }
  return aspxAuthValue;
}

async function logoutMyob() {
  const payload = {
    name: "" + process.env.MYOBUserName + "",
    password: "" + process.env.MYOBPassword + "",
    company: "" + process.env.MYOBCompany + "",
    branch: "" + process.env.MYOBBranch + "",
  };
  const response = await axios.post("" + process.env.MYOBURLLogin + "logout", payload);
  const headers = response.headers;
  console.log("MYOB Logged Out");
}

exports.employeeProductionDashboardReport = async (req, res) => {
  try {
    const matchCondition = {};
    const matchConditionFold = {};
    let MainObj = { Data: [], OverAllTotal: [] };
    const loggedEmp = new mongoose.Types.ObjectId(req.user.user_ref_id);

    const Department = ["F", "FG", "CL", "J", "GBI", "ROOF"].includes(req.query.deptcode) ? req.query.deptcode : "All Dept";
    if (Department !== "All Dept") {
      matchCondition.Order_Dept_Code = req.query.deptcode;
    }

    if (req.query.fromTime && req.query.toTime) {
      const fromDateTime = new Date(req.query.fromTime);
      const toDateTime = new Date(req.query.toTime);
      matchCondition.created = { $gte: fromDateTime, $lte: toDateTime };
      matchConditionFold.f_order_roll_end_time = { $gte: fromDateTime, $lte: toDateTime };
      matchConditionFold.f_order_fold_end_time = { $gte: fromDateTime, $lte: toDateTime };
    }

    const [productionManagerRoles, superAdminRoles] = await Promise.all([Roles.find({ role_category: "production-manager" }).lean(), Roles.find({ role_category: "super-admin" }).lean()]);
    const roleIds = [...productionManagerRoles.map(role => role._id), ...superAdminRoles.map(role => role._id)];

    let prodEmpDetails;
    if (req.query.empid) {
      prodEmpDetails = await Users.find({ _id: new mongoose.Types.ObjectId(req.query.empid), user_status: "active" }).lean();
    } else {
      const prodEmpRoles = await Users.findOne({ _id: loggedEmp }).lean();
      const hasRole = prodEmpRoles.user_Role.some(role => roleIds.some(id => id.equals(role)));
      prodEmpDetails = await Users.find(hasRole ? { user_status: "active" } : { _id: loggedEmp, user_status: "active" }).lean();
    }

    matchCondition["$or"] = [{ Order_SubDept_Status: "2" }, { Order_SubDept_Status: "4" }, { Order_SubDept_Status: "6" }];

    const employeeIds = prodEmpDetails.map(emp => emp._id);
    const [foldDetailsRaw, jobDetailsRaw] = await Promise.all([
      req.query.deptcode === "F" || req.query.deptcode === "-" || !req.query.deptcode
        ? OrderMaster.aggregate([
            { $match: { ...matchConditionFold, f_order_fold_user: { $in: employeeIds } } },
            { $lookup: { from: "orderitems", localField: "_id", foreignField: "order_master_id", as: "orderitemsinfo" } },
            {
              $project: {
                f_order_fold_user: 1,
                order_item_exact_fold: "$orderitemsinfo.order_item_exact_fold",
                order_item_pieces: "$orderitemsinfo.order_item_pieces",
              },
            },
          ])
        : [],
      OrderUserJobsCount.aggregate([
        { $match: { Order_User_Id: { $in: employeeIds }, ...matchCondition } },
        {
          $group: {
            _id: {
              Order_UId: "$Order_UId",
              Order_User_Id: "$Order_User_Id",
              Order_Dept_Code: "$Order_Dept_Code",
              Order_SubDept_Status: "$Order_SubDept_Status",
            },
            Order_Job_Count: { $first: "$Order_Job_Count" },
            Order_Id: { $first: "$Order_Id" },
            created: { $first: "$created" },
          },
        },
      ]),
    ]);

    const foldDetailsByEmp = foldDetailsRaw.reduce((acc, fold) => {
      const empId = fold.f_order_fold_user.toString();
      acc[empId] = acc[empId] || [];
      acc[empId].push(fold);
      return acc;
    }, {});

    const jobDetailsByEmp = jobDetailsRaw.reduce((acc, job) => {
      const empId = job._id.Order_User_Id.toString();
      acc[empId] = acc[empId] || [];
      acc[empId].push(job);
      return acc;
    }, {});

    const employeeJobDetails = prodEmpDetails
      .map(employee => {
        const empId = employee._id.toString();
        const foldDetails = foldDetailsByEmp[empId] || [];
        const jobDetails = jobDetailsByEmp[empId] || [];
        const TotalFlashingFoldCount = foldDetails.reduce((sum, foldcount) => {
          const { order_item_exact_fold, order_item_pieces } = foldcount;
          if (order_item_exact_fold?.length === order_item_pieces?.length) {
            return sum + order_item_exact_fold.reduce((acc, val, index) => acc + Number(val) * Number(order_item_pieces[index]), 0);
          }
          return sum;
        }, 0);

        const jobSummary = jobDetails.reduce(
          (acc, job) => {
            const count = parseInt(job.Order_Job_Count);
            if (job._id.Order_SubDept_Status === "2") acc.Roll_Count += count;
            if (job._id.Order_SubDept_Status === "4") acc.Fold_Count += count;
            if (job._id.Order_SubDept_Status === "6") acc.Rack_Count += count;
            return acc;
          },
          { Roll_Count: 0, Fold_Count: 0, Rack_Count: 0 }
        );

        const Total_Jobs = jobSummary.Roll_Count + jobSummary.Fold_Count;
        return {
          empFName: employee.user_firstName,
          EmpName: employee.user_lastName,
          ...jobSummary,
          Total_Orders: 0, // Adjust if needed
          Department,
          Total_Jobs,
          TotalFlashingFoldCount,
        };
      })
      .filter(obj => obj.Total_Jobs > 0);

    MainObj.Data = employeeJobDetails;
    const overallTotals = employeeJobDetails.reduce(
      (acc, data) => ({
        overallTotalRollCount: acc.overallTotalRollCount + data.Roll_Count,
        overallTotalFoldCount: acc.overallTotalFoldCount + data.Fold_Count,
        overallTotalRackCount: acc.overallTotalRackCount + data.Rack_Count,
        OverallgeneratedTotalJobs: acc.OverallgeneratedTotalJobs + data.Total_Jobs,
        OverallgeneratedEmployees: acc.OverallgeneratedEmployees + 1,
      }),
      {
        overallTotalRollCount: 0,
        overallTotalFoldCount: 0,
        overallTotalRackCount: 0,
        OverallgeneratedTotalJobs: 0,
        OverallgeneratedEmployees: 0,
      }
    );
    MainObj.OverAllTotal = [overallTotals];
    res.status(200).send(MainObj);
  } catch (error) {
    logError("employeeProductionDashboardReport", error, req.user.user_ref_id);
    res.status(500).send("Data Fetching Failed");
  }
};

exports.fetchRackingDataProductionDashboard = async (req, res) => {
  try {
    const loggedEmp = new mongoose.Types.ObjectId(req.user.user_ref_id);
    let orderDetails = await OrderMaster.aggregate([
      { $sort: { created: -1 } },
      { $addFields: { loggedEmpId: loggedEmp } },
      {
        $match: {
          $and: [
            {
              $or: [{ j_order_fold_user: loggedEmp }, { f_order_fold_user: loggedEmp }, { cl_order_fold_user: loggedEmp }, { fg_order_fold_user: loggedEmp }, { gbi_order_fold_user: loggedEmp }, { roof_order_fold_user: loggedEmp }],
            },
            {
              $or: [{ j_order_prod_current_status: "4" }, { f_order_prod_current_status: "4" }, { fg_order_prod_current_status: "4" }, { cl_order_prod_current_status: "4" }, { gbi_order_prod_current_status: "4" }, { roof_order_prod_current_status: "4" }],
            },
            {
              order_status: { $ne: "Order Cancelled" },
            },
          ],
        },
      },
      { $lookup: { from: "users", localField: "loggedEmpId", foreignField: "_id", as: "userInfo" } },
      {
        $project: {
          _id: 1,
          created: 1,
          order_unique_id: 1,
          d_order_unique_id: {
              $cond: [
              { $eq: ["$order_customer_UID", AWF_CUST_ID] },
              { $substr: ["$order_customer_PO_number", 0, 6] },
              "$order_unique_id"
              ]
          },
          user_name: {
            $concat: [{ $arrayElemAt: ["$userInfo.user_firstName", 0] }, " ", { $arrayElemAt: ["$userInfo.user_lastName", 0] }],
          },
          j_order_fold_user: {
            $cond: { if: { $eq: ["$j_order_fold_user", loggedEmp] }, then: "$j_order_fold_user", else: "$$REMOVE" },
          },
          f_order_fold_user: {
            $cond: { if: { $eq: ["$f_order_fold_user", loggedEmp] }, then: "$f_order_fold_user", else: "$$REMOVE" },
          },
          cl_order_fold_user: {
            $cond: { if: { $eq: ["$cl_order_fold_user", loggedEmp] }, then: "$cl_order_fold_user", else: "$$REMOVE" },
          },
          fg_order_fold_user: {
            $cond: { if: { $eq: ["$fg_order_fold_user", loggedEmp] }, then: "$fg_order_fold_user", else: "$$REMOVE" },
          },
          gbi_order_fold_user: {
            $cond: { if: { $eq: ["$gbi_order_fold_user", loggedEmp] }, then: "$gbi_order_fold_user", else: "$$REMOVE" },
          },
          roof_order_fold_user: {
            $cond: { if: { $eq: ["$roof_order_fold_user", loggedEmp] }, then: "$roof_order_fold_user", else: "$$REMOVE" },
          },
          j_order_prod_current_status: {
            $cond: {
              if: { $and: [{ $eq: ["$j_order_prod_current_status", "4"] }, { $eq: ["$j_order_fold_user", loggedEmp] }] },
              then: "$j_order_prod_current_status",
              else: "$$REMOVE",
            },
          },
          f_order_prod_current_status: {
            $cond: {
              if: { $and: [{ $eq: ["$f_order_prod_current_status", "4"] }, { $eq: ["$f_order_fold_user", loggedEmp] }] },
              then: "$f_order_prod_current_status",
              else: "$$REMOVE",
            },
          },
          fg_order_prod_current_status: {
            $cond: {
              if: { $and: [{ $eq: ["$fg_order_prod_current_status", "4"] }, { $eq: ["$fg_order_fold_user", loggedEmp] }] },
              then: "$fg_order_prod_current_status",
              else: "$$REMOVE",
            },
          },
          cl_order_prod_current_status: {
            $cond: {
              if: { $and: [{ $eq: ["$cl_order_prod_current_status", "4"] }, { $eq: ["$cl_order_fold_user", loggedEmp] }] },
              then: "$cl_order_prod_current_status",
              else: "$$REMOVE",
            },
          },
          gbi_order_prod_current_status: {
            $cond: {
              if: { $and: [{ $eq: ["$gbi_order_prod_current_status", "4"] }, { $eq: ["$gbi_order_fold_user", loggedEmp] }] },
              then: "$gbi_order_prod_current_status",
              else: "$$REMOVE",
            },
          },
          roof_order_prod_current_status: {
            $cond: {
              if: { $and: [{ $eq: ["$roof_order_prod_current_status", "4"] }, { $eq: ["$roof_order_fold_user", loggedEmp] }] },
              then: "$roof_order_prod_current_status",
              else: "$$REMOVE",
            },
          },
        },
      },
      {
        $match: { $or: [{ j_order_prod_current_status: { $exists: true } }, { f_order_prod_current_status: { $exists: true } }, { fg_order_prod_current_status: { $exists: true } }, { cl_order_prod_current_status: { $exists: true } }, { gbi_order_prod_current_status: { $exists: true } }, { roof_order_prod_current_status: { $exists: true } }] },
      },
    ]);
    res.status(200).send(orderDetails);
  } catch (error) {
    logError("fetchRackingDataProductionDashboard", error, req.user.user_ref_id);
    res.status(500).send("Data Fetching Failed.");
  }
};

exports.employeeProductionDashboardInfo = async (req, res) => {
  try {
    const loggedEmp = new mongoose.Types.ObjectId(req.user.user_ref_id);
    let prodEmpDetails;
    let productionManagerRole = [];
    let superAdminRole = [];
    let productionManagerRoleDB;
    let superAdminRoleDB;

    productionManagerRoleDB = await Roles.find({ role_category: "production-manager" });
    productionManagerRole = productionManagerRoleDB.map(role => role._id.toString());
    const productionManagerRoleIds = productionManagerRole.map(role => new mongoose.Types.ObjectId(role.trim()));

    superAdminRoleDB = await Roles.find({ role_category: "super-admin" });
    superAdminRole = superAdminRoleDB.map(role => role._id.toString());
    const superAdminRoleRoleIds = superAdminRole.map(role => new mongoose.Types.ObjectId(role.trim()));

    if (req.query.empid) {
      let empID = new mongoose.Types.ObjectId(req.query.empid);
      prodEmpDetails = await Users.find({ _id: empID, user_status: "active" });
    } else {
      const prodEmpRoles = await Users.findOne({ _id: loggedEmp });
      const hasRole = prodEmpRoles.user_Role.some(role =>
        productionManagerRoleIds.some(id => id.equals(role)) ||
        superAdminRoleRoleIds.some(id => id.equals(role))
      );
      if (hasRole) {
        prodEmpDetails = await Users.find({ user_status: "active" });
      } else {
        prodEmpDetails = await Users.find({ _id: loggedEmp, user_status: "active" });
      }
    }

    const empIds = prodEmpDetails.map(emp => emp._id);
    const matchCondition = {
      Order_User_Id: { $in: empIds },
    };

    if (req.query.fromTime && req.query.toTime) {
      const fromDateTime = new Date(req.query.fromTime);
      const toDateTime = new Date(req.query.toTime);
      matchCondition.created = { $gte: fromDateTime, $lte: toDateTime };
    }

    let OrderDetails = await OrderUserJobsCount.aggregate([
      { $sort: { created: -1 } },
      { $match: matchCondition },
      { $lookup: { from: "users", localField: "Order_User_Id", foreignField: "_id", as: "userInfo" } },
      { $lookup: { from: "ordermasters", localField: "Order_UId", foreignField: "order_unique_id", as: "masterInfo" } },
      { $unwind: "$userInfo" },
      { $unwind: "$masterInfo" },
      {
        $addFields: {
          
          D_Order_UId: {
              $cond: [
              { $eq: ["$masterInfo.order_customer_UID", AWF_CUST_ID] },
              { $substr: ["$masterInfo.order_customer_PO_number", 0, 6] },
              "$masterInfo.order_unique_id"
              ]
          }
        }
      },
      // ✅ Case-insensitive match on D_Order_UId if query param provided
      ...(req.query.orderUID ? [{
        $match: {
          D_Order_UId: { $regex: new RegExp(`^${req.query.orderUID}$`, "i") }
        }
      }] : []),
      {
        $addFields: {
          rackLookupField: {
            $switch: {
              branches: [
                { case: { $eq: ["$Order_Dept_Code", "F"] }, then: { $ifNull: ["$masterInfo.f_order_racking_table", null] } },
                { case: { $eq: ["$Order_Dept_Code", "CL"] }, then: { $ifNull: ["$masterInfo.cl_order_racking_table", null] } },
                { case: { $eq: ["$Order_Dept_Code", "J"] }, then: { $ifNull: ["$masterInfo.j_order_racking_table", null] } },
                { case: { $eq: ["$Order_Dept_Code", "FG"] }, then: { $ifNull: ["$masterInfo.fg_order_racking_table", null] } },
                { case: { $eq: ["$Order_Dept_Code", "GBI"] }, then: { $ifNull: ["$masterInfo.gbi_order_racking_table", null] } },
                { case: { $eq: ["$Order_Dept_Code", "ROOF"] }, then: { $ifNull: ["$masterInfo.roof_order_racking_table", null] } },
              ],
              default: null,
            },
          },
        },
      },
      { $lookup: { from: "rackings", localField: "rackLookupField", foreignField: "_id", as: "rackInfo" } },
      { $unwind: { path: "$rackInfo", preserveNullAndEmptyArrays: true } },
      {
        $group: {
          _id: {
            Order_UId: "$Order_UId",
            deptCode: "$Order_Dept_Code",
          },
          rackName: { $first: "$rackInfo.rack_name" },
          rackCode: { $first: "$rackInfo.rack_code" },
          rackID: { $first: "$rackInfo._id" },
          subDeptStatuses: {
            $push: {
              status: "$Order_SubDept_Status",
              userName: {
                $concat: ["$userInfo.user_firstName", " ", "$userInfo.user_lastName"],
              },
            },
          },
          jobCount: { $first: "$Order_Job_Count" },
          orderStatus: { $first: "$masterInfo.order_status" },
          D_Order_UId: { $first: "$D_Order_UId" },
        },
      },
      { $sort: { "_id.deptCode": 1 } },
      {
        $group: {
          _id: "$_id.Order_UId",
          departments: {
            $push: {
              deptCode: "$_id.deptCode",
              rackName: "$rackName",
              rackCode: "$rackCode",
              rackID: "$rackID",
              subDeptStatuses: "$subDeptStatuses",
              jobCount: "$jobCount",
            },
          },
          orderStatus: { $first: "$orderStatus" },
          D_Order_UId: { $first: "$D_Order_UId" },
        },
      },
      { $sort: { _id: 1 } },
      {
        $project: {
          Order_UId: "$_id",
          D_Order_UId: "$D_Order_UId",
          Order_Status: "$orderStatus",
          departments: 1,
          _id: 0,
        },
      },
    ]);

    let totalCount = OrderDetails.length;
    res.status(200).send({
      orderDetails: OrderDetails,
      totalCount: totalCount,
    });
  } catch (error) {
    console.log(error);
    logError("employeeProductionDashboardInfo", error, req.user.user_ref_id);
    res.status(500).send("Data Fetching Failed");
  }
};

exports.employeeProductionDashboardInfoSummary = async (req, res) => {
  try {
    const loggedEmp = new mongoose.Types.ObjectId(req.user.user_ref_id);
    let prodEmpDetails;
    let productionManagerRole = [];
    let superAdminRole = [];
    let productionManagerRoleDB;
    let superAdminRoleDB;

    productionManagerRoleDB = await Roles.find({ role_category: "production-manager" });
    productionManagerRole = productionManagerRoleDB.map(role => role._id.toString());
    const productionManagerRoleIds = productionManagerRole.map(role => new mongoose.Types.ObjectId(role.trim()));

    superAdminRoleDB = await Roles.find({ role_category: "super-admin" });
    superAdminRole = superAdminRoleDB.map(role => role._id.toString());
    const superAdminRoleRoleIds = superAdminRole.map(role => new mongoose.Types.ObjectId(role.trim()));

    if (req.query.empid) {
      let empID = new mongoose.Types.ObjectId(req.query.empid);
      prodEmpDetails = await Users.find({ _id: empID, user_status: "active" });
    } else {
      const prodEmpRoles = await Users.findOne({ _id: loggedEmp });
      const hasRole = prodEmpRoles.user_Role.some(role =>
        productionManagerRoleIds.some(id => id.equals(role)) ||
        superAdminRoleRoleIds.some(id => id.equals(role))
      );
      if (hasRole) {
        prodEmpDetails = await Users.find({ user_status: "active" });
      } else {
        prodEmpDetails = await Users.find({ _id: loggedEmp, user_status: "active" });
      }
    }

    const empIds = prodEmpDetails.map(emp => emp._id);
    const matchCondition = {
      Order_User_Id: { $in: empIds },
    };

    if (req.query.fromTime && req.query.toTime) {
      const fromDateTime = new Date(req.query.fromTime);
      const toDateTime = new Date(req.query.toTime);
      matchCondition.created = { $gte: fromDateTime, $lte: toDateTime };
    }

    let OrderDetailsSummary = await OrderUserJobsCount.aggregate([
      { $match: matchCondition },
      { $lookup: { from: "ordermasters", localField: "Order_UId", foreignField: "order_unique_id", as: "masterInfo" } },
      { $unwind: "$masterInfo" },
      {
        $addFields: {
          D_Order_UId: {
              $cond: [
              { $eq: ["$masterInfo.order_customer_UID", AWF_CUST_ID] },
              { $substr: ["$masterInfo.order_customer_PO_number", 0, 6] },
              "$masterInfo.order_unique_id"
              ]
          }
        }
      },
      // ✅ Case-insensitive filter for orderUID if provided
      ...(req.query.orderUID ? [{
        $match: {
          D_Order_UId: { $regex: new RegExp(`^${req.query.orderUID}$`, "i") }
        }
      }] : []),
      { $match: { Order_SubDept_Status: { $in: ["1", "2", "3", "4", "5", "6"] } } },
      { $sort: { created: -1 } },
      {
        $group: {
          _id: {
            Order_Dept_Code: "$Order_Dept_Code",
            Order_SubDept_Status: "$Order_SubDept_Status",
          },
          totalJobCount: { $sum: { $toInt: "$Order_Job_Count" } },
          uniqueOrderUIDs: { $addToSet: "$D_Order_UId" },
        },
      },
      {
        $group: {
          _id: "$_id.Order_Dept_Code",
          subDeptStatuses: {
            $push: {
              Order_SubDept_Status: "$_id.Order_SubDept_Status",
              totalJobCount: "$totalJobCount",
            },
          },
          uniqueOrderUIDs: { $first: "$uniqueOrderUIDs" },
        },
      },
      {
        $project: {
          _id: 0,
          Order_Dept_Code: "$_id",
          subDeptStatuses: 1,
          uniqueOrderUIDs: 1,
        },
      },
      {
        $sort: { Order_Dept_Code: 1 },
      },
    ]);

    const allUniqueOrderUIDs = OrderDetailsSummary.reduce((acc, item) => {
      return acc.concat(item.uniqueOrderUIDs);
    }, []);

    const overallOrderUIDCount = new Set(allUniqueOrderUIDs).size;
    OrderDetailsSummary = OrderDetailsSummary.map(item => {
      return {
        Order_Dept_Code: item.Order_Dept_Code,
        subDeptStatuses: item.subDeptStatuses,
      };
    });

    res.status(200).send({
      OrderDetailsSummary,
      overallOrderUIDCount,
    });
  } catch (error) {
    logError("employeeProductionDashboardInfoSummary", error, req.user.user_ref_id);
    res.status(500).send("Data Fetching Failed");
  }
};

//Old Code
// exports.customerDashboardReport = async (req, res) => {
//     try {
//         const matchCondition = {};

//         const limit = 25;
//         let page = parseInt(req.query.page) || 0;
//         const skip = page * limit;

//         let fromDateTime, toDateTime;
//         if (req.query.fromTime && req.query.toTime) {
//             fromDateTime = new Date(req.query.fromTime);
//             toDateTime = new Date(req.query.toTime);
//         }

//         if (req.query.customerId) {
//             matchCondition._id = new mongoose.Types.ObjectId(req.query.customerId);
//         }

//         const aggregationPipeline = [
//             { $match: matchCondition },
//             {
//                 $lookup: {
//                     from: "ordermasters",
//                     as: "ordermastersInfo",
//                     let: { customerId: "$_id" },
//                     pipeline: [
//                         {
//                             $match: {
//                                 $expr: {
//                                     $and: [
//                                         { $eq: ["$order_customer_id", "$$customerId"] },
//                                         ...(fromDateTime && toDateTime ? [
//                                             { $gte: ["$created", fromDateTime] },
//                                             { $lte: ["$created", toDateTime] }
//                                         ] : [])
//                                     ]
//                                 }
//                             }
//                         }
//                     ]
//                 }
//             },
//             {
//                 $addFields: {
//                     hasOrders: {
//                         $cond: {
//                             if: { $isArray: "$ordermastersInfo" },
//                             then: { $size: "$ordermastersInfo" },
//                             else: 0
//                         }
//                     }
//                 }
//             },
//             { $unwind: { path: "$ordermastersInfo", preserveNullAndEmptyArrays: true } },
//             {
//                 $addFields: {
//                     order_Overall_Price_Int: {
//                         $toDouble: "$ordermastersInfo.order_Overall_Price"
//                     }
//                 }
//             },
//             {
//                 $group: {
//                     _id: { _id: "$_id", account_Name: "$account_Name" },
//                     totalOrderPrice: { $sum: "$order_Overall_Price_Int" },
//                     totalOrders: {
//                         $sum: {
//                             $cond: {
//                                 if: { $gt: ["$hasOrders", 0] },
//                                 then: 1,
//                                 else: 0
//                             }
//                         }
//                     }
//                 }
//             },
//             {
//                 $match: {
//                     totalOrderPrice: { $gt: 0 }
//                 }
//             },
//             {
//                 $project: {
//                     _id: "$_id._id",
//                     CusName: "$_id.account_Name",
//                     totalOrderPrice: 1,
//                     totalOrders: 1
//                 }
//             },
//             {
//                 $facet: {
//                     paginatedResults: [
//                         { $sort: { CusName: 1 } },
//                         { $skip: skip },
//                         { $limit: limit }
//                     ],
//                     allResults: [
//                         { $group: {
//                             _id: null,
//                             TotalPrice: { $sum: "$totalOrderPrice" },
//                             TotalOrders: { $sum: "$totalOrders" },
//                             Count: { $sum: 1 }
//                         }}
//                     ]
//                 }
//             }
//         ];

//         const result = await Account.aggregate(aggregationPipeline);

//         const CustomerReportItems = result[0].paginatedResults;
//         const summary = result[0].allResults[0] || {
//             TotalPrice: 0,
//             TotalOrders: 0,
//             Count: 0
//         };

//         const totalPages = Math.ceil(summary.Count / limit);

//         const MainObj = {
//             CustomerReportItems,
//             TotalPrice: summary.TotalPrice,
//             TotalOrders: summary.TotalOrders,
//             totalItems: summary.Count,
//             rowsPerPage: limit,
//             totalPages: totalPages,
//         };

//         res.status(200).send(MainObj);
//     } catch (err) {
//         logError('customerDashboardReport', err, req.user.user_ref_id);
//         res.status(500).send("Data Fetching Failed");
//     }
// };

// High Speed New Code
exports.customerDashboardReport = async (req, res) => {
  try {
    const limit = 25;
    const page = Number(req.query.page) || 0;
    const skip = page * limit;

    const orderMatch = {};
    if (req.query.customerId) {
      orderMatch.order_customer_id = new mongoose.Types.ObjectId(req.query.customerId);
    }

    if (req.query.fromTime && req.query.toTime) {
      const fromDateTime = new Date(req.query.fromTime);
      const toDateTime = new Date(req.query.toTime);
      orderMatch.created = { $gte: fromDateTime, $lte: toDateTime };
    }

    const baseGroupPipeline = [
      { $match: orderMatch },
      {
        $project: {
          order_customer_id: 1,
          order_Overall_Price_Int: {
            $toDouble: { $ifNull: ["$order_Overall_Price", "0"] },
          },
        },
      },
      {
        $group: {
          _id: "$order_customer_id",
          totalOrderPrice: { $sum: "$order_Overall_Price_Int" },
          totalOrders: { $sum: 1 },
        },
      },
      { $match: { totalOrderPrice: { $gt: 0 } } },
    ];

    const pagePipeline = [
      ...baseGroupPipeline,
      {
        $lookup: {
          from: "accounts",
          localField: "_id",
          foreignField: "_id",
          as: "acc",
        },
      },
      { $unwind: "$acc" },
      {
        $project: {
          _id: "$_id",
          CusName: "$acc.account_Name",
          totalOrderPrice: 1,
          totalOrders: 1,
        },
      },
      { $sort: { CusName: 1 } },
      { $skip: skip },
      { $limit: limit },
    ];

    const totalsPipeline = [
      ...baseGroupPipeline,
      {
        $group: {
          _id: null,
          TotalPrice: { $sum: "$totalOrderPrice" },
          TotalOrders: { $sum: "$totalOrders" },
          Count: { $sum: 1 },
        },
      },
    ];

    const [items, totalsArr] = await Promise.all([OrderMaster.aggregate(pagePipeline, { allowDiskUse: true }), OrderMaster.aggregate(totalsPipeline, { allowDiskUse: true })]);

    const summary = totalsArr[0] || { TotalPrice: 0, TotalOrders: 0, Count: 0 };
    const totalPages = Math.ceil((summary.Count || 0) / limit);

    res.status(200).send({
      CustomerReportItems: items,
      TotalPrice: summary.TotalPrice || 0,
      TotalOrders: summary.TotalOrders || 0,
      totalItems: summary.Count || 0,
      rowsPerPage: limit,
      totalPages,
    });
  } catch (err) {
    logError("customerDashboardReport", err, req.user?.user_ref_id);
    res.status(500).send("Data Fetching Failed");
  }
};

exports.customerDashboardReportExport = async (req, res) => {
  try {
    const orderMatch = {};
    if (req.query.customerId) {
      orderMatch.order_customer_id = new mongoose.Types.ObjectId(req.query.customerId);
    }

    if (req.query.fromTime && req.query.toTime) {
      const fromDateTime = new Date(req.query.fromTime);
      const toDateTime = new Date(req.query.toTime);
      orderMatch.created = { $gte: fromDateTime, $lte: toDateTime };
    }

    const baseGroupPipeline = [
      { $match: orderMatch },
      {
        $project: {
          order_customer_id: 1,
          order_Overall_Price_Int: {
            $toDouble: { $ifNull: ["$order_Overall_Price", "0"] },
          },
        },
      },
      {
        $group: {
          _id: "$order_customer_id",
          totalOrderPrice: { $sum: "$order_Overall_Price_Int" },
          totalOrders: { $sum: 1 },
        },
      },
      { $match: { totalOrderPrice: { $gt: 0 } } },
    ];

    const itemsPipeline = [
      ...baseGroupPipeline,
      {
        $lookup: {
          from: "accounts",
          localField: "_id",
          foreignField: "_id",
          as: "acc",
        },
      },
      { $unwind: "$acc" },
      {
        $project: {
          _id: "$_id",
          CusName: "$acc.account_Name",
          totalOrderPrice: 1,
          totalOrders: 1,
        },
      },
      { $sort: { CusName: 1 } },
    ];

    const totalsPipeline = [
      ...baseGroupPipeline,
      {
        $group: {
          _id: null,
          TotalPrice: { $sum: "$totalOrderPrice" },
          TotalOrders: { $sum: "$totalOrders" },
          Count: { $sum: 1 },
        },
      },
    ];

    const [CustomerReportItems, totalsArr] = await Promise.all([OrderMaster.aggregate(itemsPipeline, { allowDiskUse: true }), OrderMaster.aggregate(totalsPipeline, { allowDiskUse: true })]);
    const summary = totalsArr[0] || { TotalPrice: 0, TotalOrders: 0, Count: 0 };
    res.status(200).send({
      CustomerReportItems,
      TotalPrice: summary.TotalPrice || 0,
      TotalOrders: summary.TotalOrders || 0,
      totalItems: summary.Count || 0,
    });
  } catch (error) {
    logError("customerDashboardReportExport", error, req.user?.user_ref_id);
    res.status(500).send("Data Fetching Failed");
  }
};

exports.orderrDashboardReport = async (req, res) => {
  try {
    const limit = 25;
    const page = parseInt(req.query.page) || 0;
    const skip = page * limit;

    // Build base match
    const matchCondition = {};
    if (!req.query.orderUID && req.query.fromTime && req.query.toTime) {
      matchCondition.created = {
        $gte: new Date(req.query.fromTime),
        $lte: new Date(req.query.toTime),
      };
    }
    if (!req.query.orderUID && req.query.orderEntry) {
      matchCondition.order_created_person = new mongoose.Types.ObjectId(req.query.orderEntry);
    }

    // Build aggregation pipeline for paginated results
    const aggregatePipeline = [
      { $match: matchCondition },
      ...(req.query.orderUID ? [{
        $match: {
          $expr: {
            $or: [
              { $eq: ["$order_unique_id", req.query.orderUID] },
              {
                  $and: [
                  { $eq: ["$order_customer_UID", AWF_CUST_ID] },
                  { $eq: [{ $substr: ["$order_customer_PO_number", 0, 6] }, req.query.orderUID] }
                  ]
              }
            ]
          }
        }
      }] : []),
      // lookups
      {
        $lookup: {
          from: "accounts",
          as: "customerInfo",
          let: { order_customer_id: "$order_customer_id" },
          pipeline: [
            { $match: { $expr: { $eq: ["$_id", "$$order_customer_id"] } } },
            { $project: { account_Name: 1 } }
          ],
        },
      },
      {
        $lookup: {
          from: "users",
          as: "usersInfo",
          let: { order_created_person: "$order_created_person" },
          pipeline: [
            { $match: { $expr: { $eq: ["$_id", "$$order_created_person"] } } },
            { $project: { user_firstName: 1, user_lastName: 1 } }
          ],
        },
      },
      { $lookup: { from: "users", as: "orderItemQCInfo", let: { order_item_qc_person: "$order_item_qc_person" }, pipeline: [{ $match: { $expr: { $eq: ["$_id", "$$order_item_qc_person"] } } }, { $project: { user_firstName: 1, user_lastName: 1 } }] } },
      { $lookup: { from: "users", as: "wOrderItemQCInfo", let: { w_order_item_qc_person: "$w_order_item_qc_person" }, pipeline: [{ $match: { $expr: { $eq: ["$_id", "$$w_order_item_qc_person"] } } }, { $project: { user_firstName: 1, user_lastName: 1 } }] } },
      { $unwind: { path: "$customerInfo", preserveNullAndEmptyArrays: true } },
      { $unwind: { path: "$usersInfo", preserveNullAndEmptyArrays: true } },
      { $unwind: { path: "$orderItemQCInfo", preserveNullAndEmptyArrays: true } },
      { $unwind: { path: "$wOrderItemQCInfo", preserveNullAndEmptyArrays: true } },
      {
        $addFields: {
          d_order_unique_id: {
              $cond: [
              { $eq: ["$order_customer_UID", AWF_CUST_ID] },
              { $substr: ["$order_customer_PO_number", 0, 6] },
              "$order_unique_id"
              ]
          },
          order_Entry_Person: { $concat: ["$usersInfo.user_firstName", " ", "$usersInfo.user_lastName"] },
          order_item_qc_person: { $concat: ["$orderItemQCInfo.user_firstName", " ", "$orderItemQCInfo.user_lastName"] },
          w_order_item_qc_person: { $concat: ["$wOrderItemQCInfo.user_firstName", " ", "$wOrderItemQCInfo.user_lastName"] },
        }
      },
      {
        $facet: {
          paginatedResults: [
            { $sort: { created: -1 } },
            { $skip: skip },
            { $limit: limit }
          ],
          totalCount: [
            { $count: "count" }
          ]
        }
      }
    ];

    const [result] = await OrderMaster.aggregate(aggregatePipeline);

    const paginatedOrderMasterDetails = result?.paginatedResults || [];
    const totalOrdersCount = result?.totalCount?.[0]?.count || 0;

    // FIXED: Build the same match condition for fetching all orders
    // This ensures we fetch orders based on the SAME criteria (including orderUID search)
    const allOrdersMatchCondition = {};
    
    // Apply date range filter
    if (!req.query.orderUID && req.query.fromTime && req.query.toTime) {
      allOrdersMatchCondition.created = {
        $gte: new Date(req.query.fromTime),
        $lte: new Date(req.query.toTime),
      };
    }
    
    // Apply order entry person filter
    if (!req.query.orderUID && req.query.orderEntry) {
      allOrdersMatchCondition.order_created_person = new mongoose.Types.ObjectId(req.query.orderEntry);
    }
    
    // Apply orderUID filter if present
    if (req.query.orderUID) {
      allOrdersMatchCondition.$or = [
        { order_unique_id: req.query.orderUID },
        {
          $and: [
            { order_customer_UID: AWF_CUST_ID },
            { $expr: { $eq: [{ $substr: ["$order_customer_PO_number", 0, 6] }, req.query.orderUID] } }
          ]
        }
      ];
    }

    // Get ALL order UIDs that match the SAME filter criteria
    const allOrdersInRange = await OrderMaster.find(allOrdersMatchCondition).select('order_unique_id').lean();
    const allOrderUIDs = allOrdersInRange.map(o => o.order_unique_id);

    // Fetch all order items for ALL matching orders
    const [allOrderItemManualDetails, allOrderItemDetails] = await Promise.all([
      OrderItemManual.find({ order_unique_me_id: { $in: allOrderUIDs } }).lean(),
      OrderItem.find({ order_unique_id: { $in: allOrderUIDs } }).lean()
    ]);

    const allOrderItemsMap = [...allOrderItemManualDetails, ...allOrderItemDetails].reduce((acc, item) => {
      const orderID = item.order_unique_me_id || item.order_unique_id;
      acc[orderID] = acc[orderID] || [];
      acc[orderID].push(item);
      return acc;
    }, {});

    // Calculate overall totals for ALL matching orders (not just paginated)
    let overallTotalLineItems = 0;
    let overallTotalPieces = 0;
    let overallTotalAmount = 0;

    allOrdersInRange.forEach(order => {
      const orderItems = allOrderItemsMap[order.order_unique_id] || [];
      const totalPieces = orderItems.reduce((acc, curr) => acc + parseInt(curr.order_item_me_uom_value || curr.order_item_pieces || 0), 0);
      const totalLineAmount = orderItems.reduce((acc, curr) => acc + parseFloat(curr.order_item_special_me_price || curr.order_item_qty_price || 0), 0);

      overallTotalLineItems += orderItems.length;
      overallTotalPieces += totalPieces;
      overallTotalAmount += totalLineAmount;
    });

    const MainObj = {
      Data: [],
      OverAllTotal: {
        TotalLineItems: overallTotalLineItems,
        Total_Amount: overallTotalAmount,
        Total_Pieces: overallTotalPieces,
        Total_Orders: totalOrdersCount
      },
      totalItems: totalOrdersCount,
      rowsPerPage: limit,
      totalPages: Math.ceil(totalOrdersCount / limit),
    };

    // Map only paginated results for display
    MainObj.Data = paginatedOrderMasterDetails.map(order => {
      const orderItems = allOrderItemsMap[order.order_unique_id] || [];
      const totalPieces = orderItems.reduce((acc, curr) => acc + parseInt(curr.order_item_me_uom_value || curr.order_item_pieces || 0), 0);
      const totalLineAmount = orderItems.reduce((acc, curr) => acc + parseFloat(curr.order_item_special_me_price || curr.order_item_qty_price || 0), 0);

      return {
        OrderID: order.order_unique_id,
        DOrderID: order.d_order_unique_id,
        CusName: order.customerInfo?.account_Name || "",
        OrderEntryPerson: order.order_Entry_Person,
        DeliveryDate: order.order_delivery_date,
        DeliveryDateStr: order.order_delivery_date_str,
        CreatedDate: order.created,
        CreatedDateStr: order.created_str,
        MYOBPushedDate: order.order_myob_moved_time_str,
        Total_Amount: totalLineAmount,
        Total_Pieces: totalPieces,
        Total_Lines: orderItems.length,
        totallineamount: totalLineAmount,
        OrderItemQCPerson: order.order_item_qc_person,
        WOrderItemQCPerson: order.w_order_item_qc_person,
      };
    });

    res.status(200).json(MainObj);
  } catch (error) {
    logError("orderrDashboardReport", error, req.user?.user_ref_id);
    res.status(500).json({ error: "Data Fetching Failed" });
  }
};

exports.orderrDashboardReportExcelExport = async (req, res) => {
  try {
    // Build base match
    const matchCondition = {};
    if (!req.query.orderUID && req.query.fromTime && req.query.toTime) {
      matchCondition.created = {
        $gte: new Date(req.query.fromTime),
        $lte: new Date(req.query.toTime),
      };
    }
    if (!req.query.orderUID && req.query.orderEntry) {
      matchCondition.order_created_person = new mongoose.Types.ObjectId(req.query.orderEntry);
    }

    // Build aggregation pipeline
    const aggregatePipeline = [
      { $match: matchCondition },
      ...(req.query.orderUID ? [{
        $match: {
          $expr: {
            $or: [
              { $eq: ["$order_unique_id", req.query.orderUID] },
              {
                  $and: [
                  { $eq: ["$order_customer_UID", AWF_CUST_ID] },
                  { $eq: [{ $substr: ["$order_customer_PO_number", 0, 6] }, req.query.orderUID] }
                  ]
              }
            ]
          }
        }
      }] : []),
      // lookups
      {
        $lookup: {
          from: "accounts",
          as: "customerInfo",
          let: { order_customer_id: "$order_customer_id" },
          pipeline: [
            { $match: { $expr: { $eq: ["$_id", "$$order_customer_id"] } } },
            { $project: { account_Name: 1 } }
          ],
        },
      },
      {
        $lookup: {
          from: "users",
          as: "usersInfo",
          let: { order_created_person: "$order_created_person" },
          pipeline: [
            { $match: { $expr: { $eq: ["$_id", "$$order_created_person"] } } },
            { $project: { user_firstName: 1, user_lastName: 1 } }
          ],
        },
      },
      { $lookup: { from: "users", as: "orderItemQCInfo", let: { order_item_qc_person: "$order_item_qc_person" }, pipeline: [{ $match: { $expr: { $eq: ["$_id", "$$order_item_qc_person"] } } }, { $project: { user_firstName: 1, user_lastName: 1 } }] } },
      { $lookup: { from: "users", as: "wOrderItemQCInfo", let: { w_order_item_qc_person: "$w_order_item_qc_person" }, pipeline: [{ $match: { $expr: { $eq: ["$_id", "$$w_order_item_qc_person"] } } }, { $project: { user_firstName: 1, user_lastName: 1 } }] } },
      { $unwind: { path: "$customerInfo", preserveNullAndEmptyArrays: true } },
      { $unwind: { path: "$usersInfo", preserveNullAndEmptyArrays: true } },
      { $unwind: { path: "$orderItemQCInfo", preserveNullAndEmptyArrays: true } },
      { $unwind: { path: "$wOrderItemQCInfo", preserveNullAndEmptyArrays: true } },
      {
        $addFields: {
          d_order_unique_id: {
              $cond: [
              { $eq: ["$order_customer_UID", AWF_CUST_ID] },
              { $substr: ["$order_customer_PO_number", 0, 6] },
              "$order_unique_id"
              ]
          },
          order_Entry_Person: { $concat: ["$usersInfo.user_firstName", " ", "$usersInfo.user_lastName"] },
          order_item_qc_person: { $concat: ["$orderItemQCInfo.user_firstName", " ", "$orderItemQCInfo.user_lastName"] },
          w_order_item_qc_person: { $concat: ["$wOrderItemQCInfo.user_firstName", " ", "$wOrderItemQCInfo.user_lastName"] },
        }
      },
      {
        $facet: {
          paginatedResults: [
            { $sort: { created: -1 } },
          ],
          totalCount: [
            { $count: "count" }
          ]
        }
      }
    ];

    const [result] = await OrderMaster.aggregate(aggregatePipeline);

    const paginatedOrderMasterDetails = result?.paginatedResults || [];
    const totalOrdersCount = result?.totalCount?.[0]?.count || 0;

    // Compute order items for totals
    const allOrderUIDs = paginatedOrderMasterDetails.map(o => o.order_unique_id);
    const [allOrderItemManualDetails, allOrderItemDetails] = await Promise.all([
      OrderItemManual.find({ order_unique_me_id: { $in: allOrderUIDs } }).lean(),
      OrderItem.find({ order_unique_id: { $in: allOrderUIDs } }).lean()
    ]);

    const allOrderItemsMap = [...allOrderItemManualDetails, ...allOrderItemDetails].reduce((acc, item) => {
      const orderID = item.order_unique_me_id || item.order_unique_id;
      acc[orderID] = acc[orderID] || [];
      acc[orderID].push(item);
      return acc;
    }, {});

    const MainObj = {
      Data: [],
      OverAllTotal: {
        TotalLineItems: 0,
        Total_Amount: 0,
        Total_Pieces: 0,
        Total_Orders: totalOrdersCount
      },
      totalItems: totalOrdersCount,
    };

    MainObj.Data = paginatedOrderMasterDetails.map(order => {
      const orderItems = allOrderItemsMap[order.order_unique_id] || [];
      const totalPieces = orderItems.reduce((acc, curr) => acc + parseInt(curr.order_item_me_uom_value || curr.order_item_pieces || 0), 0);
      const totalLineAmount = orderItems.reduce((acc, curr) => acc + parseFloat(curr.order_item_special_me_price || curr.order_item_qty_price || 0), 0);

      // Update totals
      MainObj.OverAllTotal.TotalLineItems += orderItems.length;
      MainObj.OverAllTotal.Total_Pieces += totalPieces;
      MainObj.OverAllTotal.Total_Amount += totalLineAmount;

      return {
        OrderID: order.order_unique_id,
        DOrderID: order.d_order_unique_id,
        CusName: order.customerInfo?.account_Name || "",
        OrderEntryPerson: order.order_Entry_Person,
        DeliveryDate: order.order_delivery_date,
        DeliveryDateStr: order.order_delivery_date_str,
        CreatedDate: order.created,
        CreatedDateStr: order.created_str,
        MYOBPushedDate: order.order_myob_moved_time_str,
        Total_Amount: totalLineAmount,
        Total_Pieces: totalPieces,
        Total_Lines: orderItems.length,
        totallineamount: totalLineAmount,
        OrderItemQCPerson: order.order_item_qc_person,
        WOrderItemQCPerson: order.w_order_item_qc_person,
      };
    });

    res.status(200).json(MainObj);
  } catch (error) {
    logError("orderrDashboardReportExcelExport", error, req.user?.user_ref_id);
    res.status(500).json({ error: "Data Fetching Failed" });
  }
};

exports.fetchCustomerFromMyobUsingQuotationid = async (req, res) => {
  try {
    const quotesUID = req.params.quotesid;
    let aspxAuthValue = await loginMyob();
    if (aspxAuthValue) {
      const url = `${process.env.MYOBURL}SalesOrder/QT/${quotesUID}`;
      const headers = {
        Cookie: `.ASPXAUTH=${aspxAuthValue}`,
      };

      const response = await axios.get(url, { headers });
      if (response.status === 200) {
        const quotesArray = response.data;

        let responseObject = {
          SORowKey: quotesArray.id,
          CusID: quotesArray.CustomerID.value,
          CusOrderNo: quotesArray.CustomerOrder.value,
        };

        if (responseObject.CusID) {
          let CusDetails = await Account.find({ account_UID: responseObject.CusID });
          if (CusDetails.length > 0) {
            const mergedDetails = {
              ...CusDetails[0].toObject(),
              ...responseObject,
            };

            res.status(200).json(mergedDetails);
          } else {
            res.status(500).send("Customer not found");
          }
        } else {
          res.status(500).send("Internal Server Error");
        }
      } else {
        res.status(500).send("Internal Server Error");
      }
    } else {
      res.status(500).send("Login Failed");
    }
    await logoutMyob();
  } catch (error) {
    logError("fetchCustomerFromMyobUsingQuotationid", error, req.user.user_ref_id);
    res.status(500).send("Data Fetching Failed");
  }
};

exports.addQuotationDetails = async (req, res) => {
  try {
    const customerID = req.body.quote_customer_id;
    const objcustomerID = new mongoose.Types.ObjectId(req.body.quote_customer_id);
    const quotePOnumber = req.body.quote_customer_PO_number;
    const quoteStatus = "Quotation Created";
    const quoteUser = new mongoose.Types.ObjectId(req.user.user_ref_id);
    const quoteflashingchecker = req.body.quote_flashing_checker;
    const quotecustomnote = req.body.quote_custom_note;
    const quoteinterdepartmentinstruction = req.body.quote_inter_department_instruction;
    const quotedeliveryaddressmode = req.body.quote_delivery_address_mode;
    const quotedeliverydate = req.body.quote_delivery_date;
    let quotefarsuburb = req.body.quote_far_suburb;
    let quotedeliverytime = req.body.quote_delivery_time;
    let quotedeliverysession = req.body.quote_delivery_session;
    let quotesitedeliveryattentionperson;
    let quotesitedeliveryattentioncontact;
    let quotesitedeliveryaddress1;
    let quotesitedeliveryaddress2;
    let quotesitedeliverycity;
    let quotesitedeliverycountry;
    let quotesitedeliverypostalcode;
    let quotesitedeliverystate;
    let quotestoredeliveryaddress1;
    let quotestoredeliveryaddress2;
    let quotestoredeliverycity;
    let quotestoredeliverycountry;
    let quotestoredeliverypostalcode;
    let quotestoredeliverystate;

    let now = new Date();
    let options = { timeZone: "Australia/Melbourne", hour12: true };
    let datenow = new Intl.DateTimeFormat("en-US", options).format(now);
    let melbourneTime = new Date(now.toLocaleString("en-US", { timeZone: "Australia/Melbourne" }));
    let formattedNow =
      [("0" + melbourneTime.getDate()).slice(-2), ("0" + (melbourneTime.getMonth() + 1)).slice(-2), melbourneTime.getFullYear()].join("-") +
      " " +
      melbourneTime
        .toLocaleTimeString("en-US", {
          hour: "2-digit",
          minute: "2-digit",
          hour12: true,
        })
        .toLowerCase()
        .replace(":", ":")
        .replace(" ", " ");
    formattedNow = formattedNow.replace(/\.(\d{2})/, ":$1");

    let formattedDate = formatDateString(quotedeliverydate);
    let formattedMYOBDate;
    let dateObj = DateTime.fromRFC2822(quotedeliverydate, { zone: "Australia/Sydney" });
    if (!dateObj.isValid) {
      console.error("Invalid DateTime:", dateObj.invalidExplanation);
    } else {
      if (dateObj.isInDST) {
        dateObj = dateObj.plus({ hours: 11 });
      } else {
        dateObj = dateObj.plus({ hours: 10 });
      }
      formattedMYOBDate = dateObj.toFormat("yyyy-MM-dd'T'HH:mm:ssZZ");
    }

    let f_quote_exist;
    let QTMasDetails = await QuotationMaster.find();
    let maxId = QTMasDetails.reduce((max, item) => {
      let num = parseInt(item.quote_unique_id.replace(/\D/g, ""), 10);
      return num > max ? num : max;
    }, 0);
    let nextId = maxId + 1;
    let Latest_Quote_Id = `QT${nextId.toString().padStart(6, "0")}`;

    let QTAccountDetails = await Account.find({ _id: objcustomerID });
    let cusUID = QTAccountDetails[0].account_UID;
    let cusPhone = QTAccountDetails[0].account_Address_Phone;
    let cusEmail = QTAccountDetails[0].account_Address_Email;

    if (quotedeliveryaddressmode == 0) {
      quotestoredeliveryaddress1 = req.body.quote_store_delivery_address1;
      quotestoredeliveryaddress2 = req.body.quote_store_delivery_address2;
      quotestoredeliverycity = req.body.quote_store_delivery_city;
      quotestoredeliverycountry = req.body.quote_store_delivery_country;
      quotestoredeliverypostalcode = req.body.quote_store_delivery_postalcode;
      quotestoredeliverystate = req.body.quote_store_delivery_state;
    }
    if (quotedeliveryaddressmode == 1) {
      quotesitedeliveryattentionperson = req.body.quote_site_delivery_attention_person;
      quotesitedeliveryattentioncontact = req.body.quote_site_delivery_attention_contact;
      quotesitedeliveryaddress1 = req.body.quote_site_delivery_address1;
      quotesitedeliveryaddress2 = req.body.quote_site_delivery_address2;
      quotesitedeliverycity = req.body.quote_site_delivery_city;
      quotesitedeliverycountry = req.body.quote_site_delivery_country;
      quotesitedeliverypostalcode = req.body.quote_site_delivery_postalcode;
      quotesitedeliverystate = req.body.quote_site_delivery_state;
      quotestoredeliveryaddress1 = QTAccountDetails[0].account_Address_line_one;
      quotestoredeliveryaddress2 = QTAccountDetails[0].account_Address_line_two;
      quotestoredeliverycity = QTAccountDetails[0].account_Address_City;
      quotestoredeliverycountry = QTAccountDetails[0].account_Address_Country;
      quotestoredeliverypostalcode = QTAccountDetails[0].account_Address_PostalCode;
      quotestoredeliverystate = QTAccountDetails[0].account_Address_State;
      await CheckAttentionPersonExistenceFn(objcustomerID, cusUID, quotesitedeliveryattentionperson, quotesitedeliveryattentioncontact);
      await CheckAddressExistenceFn(objcustomerID, cusUID, quotesitedeliveryaddress1, quotesitedeliverycity, quotesitedeliverystate, quotesitedeliverycountry, quotesitedeliverypostalcode, quotecustomnote);
    }
    if (quotedeliveryaddressmode == 2) {
      quotesitedeliveryattentionperson = req.body.quote_site_delivery_attention_person;
      quotesitedeliveryattentioncontact = req.body.quote_site_delivery_attention_contact;
      quotestoredeliveryaddress1 = QTAccountDetails[0].account_Address_line_one;
      quotestoredeliveryaddress2 = QTAccountDetails[0].account_Address_line_two;
      quotestoredeliverycity = QTAccountDetails[0].account_Address_City;
      quotestoredeliverycountry = QTAccountDetails[0].account_Address_Country;
      quotestoredeliverypostalcode = QTAccountDetails[0].account_Address_PostalCode;
      quotestoredeliverystate = QTAccountDetails[0].account_Address_State;
      await CheckAttentionPersonExistenceFn(objcustomerID, cusUID, quotesitedeliveryattentionperson, quotesitedeliveryattentioncontact);
    }

    let booleanFlasingChecker = JSON.parse(quoteflashingchecker);
    if (booleanFlasingChecker === true) {
      f_quote_exist = 1;
    } else {
      f_quote_exist = 0;
    }

    if (quotedeliverytime && quotedeliverytime.trim() === "12.00 AM") {
      quotedeliverysession = "A/T";
    }

    const QuoteData = new QuotationMaster({
      quote_unique_id: Latest_Quote_Id,
      quote_myob_row_id: Latest_Quote_Id,
      quote_customer_id: objcustomerID,
      quote_customer_PO_number: quotePOnumber,
      quote_delivery_address_mode: quotedeliveryaddressmode,
      quote_flashing_checker: quoteflashingchecker,
      quote_created_person: quoteUser,
      quote_delivery_date: quotedeliverydate,
      quote_delivery_date_str: formattedDate,
      quote_delivery_time: quotedeliverytime,
      quote_delivery_session: quotedeliverysession,
      created_str: formattedNow,
      quote_status: quoteStatus,
      quote_custom_note: quotecustomnote,
      quote_inter_department_instruction: quoteinterdepartmentinstruction,
      quote_customer_name: QTAccountDetails[0].account_Name,
      quote_customer_UID: QTAccountDetails[0].account_UID,
      quote_customer_contact_name: "-",
      quote_customer_contact_phone: cusPhone,
      quote_customer_contact_email: cusEmail,
      quote_store_delivery_address1: quotestoredeliveryaddress1,
      quote_store_delivery_address2: quotestoredeliveryaddress2,
      quote_store_delivery_city: quotestoredeliverycity,
      quote_store_delivery_country: quotestoredeliverycountry,
      quote_store_delivery_postalcode: quotestoredeliverypostalcode,
      quote_store_delivery_state: quotestoredeliverystate,
      f_quote_prod_push_status: f_quote_exist,
      quote_site_delivery_attention_person: quotesitedeliveryattentionperson,
      quote_site_delivery_attention_contact: quotesitedeliveryattentioncontact,
      quote_site_delivery_address1: quotesitedeliveryaddress1,
      quote_site_delivery_address2: quotesitedeliveryaddress2,
      quote_site_delivery_city: quotesitedeliverycity,
      quote_site_delivery_country: quotesitedeliverycountry,
      quote_site_delivery_postalcode: quotesitedeliverypostalcode,
      quote_site_delivery_state: quotesitedeliverystate,
      quote_far_suburb: quotefarsuburb,
    });
    const QuoteDataInfo = await QuoteData.save();
    res.status(200).send(QuoteDataInfo);
  } catch (err) {
    logError("addQuotationDetails", err, req.user.user_ref_id);
    res.status(500).send("Data Adding Failed");
  }
};

exports.fetchQuotationDetails = async (req, res) => {
  try {
    const limit = 20;
    const page = parseInt(req.query.page) || 0;
    const skip = page * limit;
    const quoteStatus = req.query.status;
    const field_condition = req.query.sortField;
    const searchKeyword = req.query.query;
    const cusId = req.query.cusId;
    const startDate = req.query.startDate;
    const endDate = req.query.endDate;
    const sortDirection = parseInt(req.query.sortDirection) || -1;
    const matchCondition = {};
    let sortCondition = { quote_unique_id: -1 };

    if (searchKeyword) {
      function escapeRegExp(string) {
        return string.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      }
      const escapedKeyword = escapeRegExp(searchKeyword);
      matchCondition.$or = [
        { quote_unique_id: { $regex: escapedKeyword, $options: "i" } },
        { quote_customer_name: { $regex: escapedKeyword, $options: "i" } },
        { quote_customer_PO_number: { $regex: escapedKeyword, $options: "i" } },
        { quote_customer_UID: { $regex: escapedKeyword, $options: "i" } },
        { quote_customer_contact_name: { $regex: escapedKeyword, $options: "i" } },
        { quote_customer_contact_phone: { $regex: escapedKeyword, $options: "i" } },
        { quote_customer_contact_email: { $regex: escapedKeyword, $options: "i" } },
      ];
    }

    if (cusId) {
      matchCondition.quote_customer_id = new mongoose.Types.ObjectId(cusId);
    }
    if (field_condition) {
      sortCondition = {};
      sortCondition[field_condition] = sortDirection;
    }
    if (quoteStatus) {
      matchCondition.quote_status = quoteStatus;
    }
    if (startDate && endDate) {
      const fromDateTime = new Date(startDate);
      const toDateTime = new Date(endDate);
      matchCondition.created = { $gte: fromDateTime, $lte: toDateTime };
    } else if (startDate) {
      matchCondition.created = { $gte: new Date(startDate) };
    } else if (endDate) {
      matchCondition.created = { $lte: new Date(endDate) };
    }

    const total_quote = await QuotationMaster.countDocuments(matchCondition);
    const quoteDetails = await QuotationMaster.aggregate([
      { $match: matchCondition },
      { $sort: sortCondition },
      {
        $lookup: {
          from: "accounts",
          localField: "quote_customer_id",
          foreignField: "_id",
          as: "customerInfo",
        },
      },
      { $unwind: { path: "$customerInfo", preserveNullAndEmptyArrays: true } },
      {
        $lookup: {
          from: "accountcontacts",
          localField: "quote_customer_contact_id",
          foreignField: "_id",
          as: "customercontactInfo",
        },
      },
      { $unwind: { path: "$customercontactInfo", preserveNullAndEmptyArrays: true } },
      {
        $lookup: {
          from: "departments",
          localField: "quote_department",
          foreignField: "_id",
          as: "departments",
        },
      },
      { $unwind: { path: "$departments", preserveNullAndEmptyArrays: true } },
      {
        $project: {
          _id: 1,
          quote_unique_id: 1,
          quote_customer_id: 1,
          quote_delivery_date: 1,
          quote_delivery_time: 1,
          quote_delivery_session: 1,
          quote_far_suburb: 1,
          quote_delivery_address_mode: 1,
          quote_site_delivery_address1: 1,
          quote_site_delivery_address2: 1,
          quote_site_delivery_city: 1,
          quote_site_delivery_country: 1,
          quote_site_delivery_postalcode: 1,
          quote_delivery_date_str: 1,
          quote_store_delivery_address1: 1,
          quote_store_delivery_address2: 1,
          quote_store_delivery_city: 1,
          quote_store_delivery_country: 1,
          quote_store_delivery_postalcode: 1,
          quote_store_delivery_state: 1,
          created_str: 1,
          quote_inter_department_instruction: 1,
          quote_custom_note: 1,
          quote_site_delivery_state: 1,
          quote_customer_contact_phone: 1,
          quote_customer_contact_email: 1,
          quote_site_delivery_attention_person: 1,
          quote_site_delivery_attention_contact: 1,
          quote_customer_PO_number: 1,
          quote_Pieces: 1,
          quote_quote_id: 1,
          quote_status: 1,
          quote_qc_status: 1,
          quote_myob_push_status: 1,
          quote_flashing_checker: 1,
          quote_barcode_checker: 1,
          f_order_prod_push_status: 1,
          fg_order_prod_push_status: 1,
          cl_order_prod_push_status: 1,
          j_order_prod_push_status: 1,
          gbi_order_prod_push_status: 1,
          created: 1,
          account_ID: "$customerInfo._id",
          account_UID: "$customerInfo.account_UID",
          account_Name: "$customerInfo.account_Name",
          account_Address: "$customerInfo.account_Address",
          account_StoreAddress: "$customerInfo.account_StoreAddress",
          account_Address_line_one: "$customerInfo.account_Address_line_one",
          account_Address_line_two: "$customerInfo.account_Address_line_two",
          account_Address_Country: "$customerInfo.account_Address_Country",
          account_Address_State: "$customerInfo.account_Address_State",
          account_Address_City: "$customerInfo.account_Address_City",
          account_Address_PostalCode: "$customerInfo.account_Address_PostalCode",
          departments: "$departments.department_name",
        },
      },
    ])
      .skip(skip)
      .limit(limit);
    const totalPages = Math.ceil(total_quote / limit);

    const fullOrderObj = {
      totalItems: total_quote,
      fetchedItems: quoteDetails,
      rowsPerPage: limit,
      totalPages: totalPages,
    };
    res.status(200).send(fullOrderObj);
  } catch (err) {
    logError("fetchQuotationDetails", err, req.user.user_ref_id);
    res.status(500).send("Data Fetching Failed");
  }
};

exports.updateSpecificQuotationDetails = async (req, res) => {
  try {
    const quotesObjID = new mongoose.Types.ObjectId(req.params.quotesid);
    const QuoteID = req.body.quote_unique_id;
    const QuoteSORowID = req.body.quote_myob_row_id;
    const customerID = req.body.quote_customer_id;
    const objcustomerID = new mongoose.Types.ObjectId(req.body.quote_customer_id);
    const quotedeliverydate = req.body.quote_delivery_date;
    const quotePOnumber = req.body.quote_customer_PO_number;
    const quoteUser = new mongoose.Types.ObjectId(req.user.user_ref_id);
    const quoteflashingchecker = req.body.quote_flashing_checker;
    const quotecustomnote = req.body.quote_custom_note;
    const quoteinterdepartmentinstruction = req.body.quote_inter_department_instruction;
    const quotedeliveryaddressmode = req.body.quote_delivery_address_mode;
    let quotefarsuburb = req.body.quote_far_suburb;
    let quotedeliverytime = req.body.quote_delivery_time;
    let quotedeliverysession = req.body.quote_delivery_session;
    let quotesitedeliveryattentionperson;
    let quotesitedeliveryattentioncontact;
    let quotesitedeliveryaddress1;
    let quotesitedeliveryaddress2;
    let quotesitedeliverycity;
    let quotesitedeliverycountry;
    let quotesitedeliverypostalcode;
    let quotesitedeliverystate;
    let updated_quote_qc_status;
    let quoteStatus;
    let quotestoredeliveryaddress1;
    let quotestoredeliveryaddress2;
    let quotestoredeliverycity;
    let quotestoredeliverycountry;
    let quotestoredeliverypostalcode;
    let quotestoredeliverystate;

    let QTAccountDetails = await Account.find({ _id: objcustomerID });
    let cusUID = QTAccountDetails[0].account_UID;
    let cusPhone = QTAccountDetails[0].account_Address_Phone;
    let cusEmail = QTAccountDetails[0].account_Address_Email;
    let QuoteMasDetails = await QuotationMaster.find({ _id: quotesObjID });

    if (quotedeliveryaddressmode == 0) {
      quotestoredeliveryaddress1 = req.body.quote_store_delivery_address1;
      quotestoredeliveryaddress2 = req.body.quote_store_delivery_address2;
      quotestoredeliverycity = req.body.quote_store_delivery_city;
      quotestoredeliverycountry = req.body.quote_store_delivery_country;
      quotestoredeliverypostalcode = req.body.quote_store_delivery_postalcode;
      quotestoredeliverystate = req.body.quote_store_delivery_state;
    }
    if (quotedeliveryaddressmode == 1) {
      quotesitedeliveryattentionperson = req.body.quote_site_delivery_attention_person;
      quotesitedeliveryattentioncontact = req.body.quote_site_delivery_attention_contact;
      quotesitedeliveryaddress1 = req.body.quote_site_delivery_address1;
      quotesitedeliveryaddress2 = req.body.quote_site_delivery_address2;
      quotesitedeliverycity = req.body.quote_site_delivery_city;
      quotesitedeliverycountry = req.body.quote_site_delivery_country;
      quotesitedeliverypostalcode = req.body.quote_site_delivery_postalcode;
      quotesitedeliverystate = req.body.quote_site_delivery_state;
      quotestoredeliveryaddress1 = QTAccountDetails[0].account_Address_line_one;
      quotestoredeliveryaddress2 = QTAccountDetails[0].account_Address_line_two;
      quotestoredeliverycity = QTAccountDetails[0].account_Address_City;
      quotestoredeliverycountry = QTAccountDetails[0].account_Address_Country;
      quotestoredeliverypostalcode = QTAccountDetails[0].account_Address_PostalCode;
      quotestoredeliverystate = QTAccountDetails[0].account_Address_State;
      await CheckAttentionPersonExistenceFn(objcustomerID, cusUID, quotesitedeliveryattentionperson, quotesitedeliveryattentioncontact);
      await CheckAddressExistenceFn(objcustomerID, cusUID, quotesitedeliveryaddress1, quotesitedeliverycity, quotesitedeliverystate, quotesitedeliverycountry, quotesitedeliverypostalcode, quotecustomnote);
    }
    if (quotedeliveryaddressmode == 2) {
      quotesitedeliveryattentionperson = req.body.quote_site_delivery_attention_person;
      quotesitedeliveryattentioncontact = req.body.quote_site_delivery_attention_contact;
      quotestoredeliveryaddress1 = QTAccountDetails[0].account_Address_line_one;
      quotestoredeliveryaddress2 = QTAccountDetails[0].account_Address_line_two;
      quotestoredeliverycity = QTAccountDetails[0].account_Address_City;
      quotestoredeliverycountry = QTAccountDetails[0].account_Address_Country;
      quotestoredeliverypostalcode = QTAccountDetails[0].account_Address_PostalCode;
      quotestoredeliverystate = QTAccountDetails[0].account_Address_State;
      await CheckAttentionPersonExistenceFn(objcustomerID, cusUID, quotesitedeliveryattentionperson, quotesitedeliveryattentioncontact);
    }

    let now = new Date();
    let options = { timeZone: "Australia/Melbourne", hour12: true };
    let datenow = new Intl.DateTimeFormat("en-US", options).format(now);
    let melbourneTime = new Date(now.toLocaleString("en-US", { timeZone: "Australia/Melbourne" }));
    let formattedNow =
      [("0" + melbourneTime.getDate()).slice(-2), ("0" + (melbourneTime.getMonth() + 1)).slice(-2), melbourneTime.getFullYear()].join("-") +
      " " +
      melbourneTime
        .toLocaleTimeString("en-US", {
          hour: "2-digit",
          minute: "2-digit",
          hour12: true,
        })
        .toLowerCase()
        .replace(":", ":")
        .replace(" ", " ");
    formattedNow = formattedNow.replace(/\.(\d{2})/, ":$1");

    let formattedDate = formatDateString(quotedeliverydate);
    let formattedMYOBDate;
    let dateObj = DateTime.fromRFC2822(quotedeliverydate, { zone: "Australia/Sydney" });
    if (!dateObj.isValid) {
      console.error("Invalid DateTime:", dateObj.invalidExplanation);
    } else {
      if (dateObj.isInDST) {
        dateObj = dateObj.plus({ hours: 11 });
      } else {
        dateObj = dateObj.plus({ hours: 10 });
      }
      formattedMYOBDate = dateObj.toFormat("yyyy-MM-dd'T'HH:mm:ssZZ");
    }

    if (req.body.quote_flashing_checker === "true") {
      updated_quote_qc_status = "0";
      if (QuoteMasDetails[0].quote_design_stage === "0") {
        design_stage_check = "0";
        design_emp = null;
        qc_emp = null;
      } else {
        design_stage_check = QuoteMasDetails[0].quote_design_stage;
        design_emp = QuoteMasDetails[0].quote_designed_person;
        qc_emp = QuoteMasDetails[0].quote_qced_person;
      }
    } else {
      // deleteExistingFlashing = await QuotationItem.deleteMany({ quote_master_id: quotesObjID, quote_item_flag: "DT" });
      design_stage_check = "0";
      design_emp = null;
      qc_emp = null;
    }

    let booleanFlasingChecker = JSON.parse(quoteflashingchecker);
    let f_quote_exist;
    if (booleanFlasingChecker === true) {
      f_quote_exist = 1;
      if (QuoteMasDetails[0].f_quote_prod_push_status === 0) {
        f_quote_exist = 1;
      }
      if (QuoteMasDetails[0].f_quote_prod_push_status === 1) {
        f_quote_exist = 1;
      }
      if (QuoteMasDetails[0].f_quote_prod_push_status === 2) {
        f_quote_exist = 2;
      }
    } else {
      f_quote_exist = 0;
    }

    if (quotedeliverytime && quotedeliverytime.trim() === "12.00 AM") {
      quotedeliverysession = "A/T";
    } else if (quotedeliverytime && quotedeliverytime.trim() !== "12.00 AM" && quotedeliverysession !== "B4" && quotedeliverysession !== "Aft") {
      quotedeliverysession = "";
    }

    const updateData = {
      $set: {
        quote_unique_id: QuoteID,
        quote_myob_row_id: QuoteSORowID,
        quote_customer_id: objcustomerID,
        quote_delivery_time: quotedeliverytime,
        quote_delivery_session: quotedeliverysession,
        quote_delivery_date: quotedeliverydate,
        quote_delivery_date_str: formattedDate,
        created_str: formattedNow,
        quote_customer_PO_number: quotePOnumber,
        quote_flashing_checker: quoteflashingchecker,
        quote_created_person: quoteUser,
        quote_design_stage: design_stage_check,
        quote_designed_person: design_emp,
        quote_qced_person: qc_emp,
        quote_status: quoteStatus,
        quote_delivery_address_mode: quotedeliveryaddressmode,
        quote_custom_note: quotecustomnote,
        quote_inter_department_instruction: quoteinterdepartmentinstruction,
        quote_customer_name: QTAccountDetails[0].account_Name,
        quote_customer_UID: QTAccountDetails[0].account_UID,
        quote_customer_contact_name: "-",
        quote_customer_contact_phone: cusPhone,
        quote_customer_contact_email: cusEmail,
        f_quote_prod_push_status: f_quote_exist,
        quote_store_delivery_address1: quotestoredeliveryaddress1,
        quote_store_delivery_address2: quotestoredeliveryaddress2,
        quote_store_delivery_city: quotestoredeliverycity,
        quote_store_delivery_country: quotestoredeliverycountry,
        quote_store_delivery_postalcode: quotestoredeliverypostalcode,
        quote_store_delivery_state: quotestoredeliverystate,
        quote_site_delivery_attention_person: quotesitedeliveryattentionperson,
        quote_site_delivery_attention_contact: quotesitedeliveryattentioncontact,
        quote_site_delivery_address1: quotesitedeliveryaddress1,
        quote_site_delivery_address2: quotesitedeliveryaddress2,
        quote_site_delivery_city: quotesitedeliverycity,
        quote_site_delivery_country: quotesitedeliverycountry,
        quote_site_delivery_postalcode: quotesitedeliverypostalcode,
        quote_site_delivery_state: quotesitedeliverystate,
        quote_qc_status: updated_quote_qc_status,
        quote_far_suburb: quotefarsuburb,
      },
    };

    if (QuoteMasDetails[0].quote_design_stage === "0" || req.body.quote_flashing_checker === "false") {
      updateData["$unset"] = {
        quote_design_assigned_time: "",
        quote_design_completed_time: "",
        quote_qc_assigned_time: "",
        quote_qc_completed_time: "",
      };
    }
    const conditions = { _id: quotesObjID };
    const updatedQuoteInfo = await QuotationMaster.findByIdAndUpdate(conditions, updateData, attrs);
    if (updatedQuoteInfo) {
      await checkIndividualQuoteStatus(req.params.quotesid);
    }

    // Update CustomTXT01, and ShapeDescriptor in SWI Jobs table only if PO number changed
    const oldPONumber = QuoteMasDetails[0].quote_customer_PO_number;
    const quote_unique_id = QuoteMasDetails[0].quote_unique_id;
    const newPONumber = quotePOnumber;
    
    const poNumberChanged = oldPONumber !== newPONumber;
    
    if (poNumberChanged) {
        let pool = null;
        try {
            pool = await new sql.ConnectionPool(config).connect();
            
            // First, fetch all jobs with their ShapeDescriptor for this order
            const jobsResult = await pool.request()
                .input('JobName', sql.NVarChar, quote_unique_id)
                .query(`SELECT JobID, ShapeDescriptor FROM Jobs WHERE JobName = @JobName`);
            
            // Update each job's ShapeDescriptor with new values
            for (const job of jobsResult.recordset) {
                let updatedShapeDescriptor = job.ShapeDescriptor || '';
                
                // Update CustomTxt1 in ShapeDescriptor if PO number changed
                if (poNumberChanged && updatedShapeDescriptor) {
                    updatedShapeDescriptor = updatedShapeDescriptor.replace(
                        /CustomTxt1\s*"[^"]*"/,
                        `CustomTxt1 "${newPONumber || ''}"`
                    );
                }
                
                // Update the job record
                await pool.request()
                    .input('CustomTXT01', sql.NVarChar, newPONumber)
                    .input('ShapeDescriptor', sql.NVarChar(sql.MAX), updatedShapeDescriptor)
                    .input('JobID', sql.BigInt, job.JobID)
                    .query(`
                        UPDATE Jobs 
                        SET CustomTXT01 = @CustomTXT01, 
                            ShapeDescriptor = @ShapeDescriptor
                        WHERE JobID = @JobID
                    `);
            }
            
            console.log('[updateSpecificOrderDetails] SWI Jobs updated - PO changed:', poNumberChanged, jobsResult.recordset.length);
        } catch (sqlError) {
            logError('[updateSpecificOrderDetails] SWI Jobs update failed', sqlError, req.user.user_ref_id);
            console.error('[updateSpecificOrderDetails] SWI Jobs update failed:', sqlError.message);
        } finally {
            if (pool) {
                await pool.close();
            }
        }
      }

    res.status(200).send(updatedQuoteInfo);
  } catch (err) {
    logError("updateSpecificQuotationDetails", err, req.user.user_ref_id);
    res.status(500).send("Data Updation Failed");
  }
};

exports.fetchSpecificQuotationDetails = async (req, res) => {
  try {
    const quoteID = new mongoose.Types.ObjectId(req.params.quotesid);
    let quoteDetails = await QuotationMaster.aggregate([
      { $match: { _id: quoteID } },
      { $lookup: { from: "accounts", as: "customerInfo", localField: "quote_customer_id", foreignField: "_id" } },
      { $lookup: { from: "accountcontacts", as: "customercontactInfo", localField: "quote_customer_contact_id", foreignField: "_id" } },
      {
        $lookup: {
          from: "users",
          as: "assignedPersonInfo",
          let: { assignedPerson: "$quote_designed_person" },
          pipeline: [
            {
              $match: {
                $expr: {
                  $eq: ["$_id", "$$assignedPerson"],
                },
              },
            },
            {
              $project: {
                fullName: { $concat: ["$user_firstName", " ", "$user_lastName"] },
              },
            },
          ],
        },
      },
      {
        $lookup: {
          from: "users",
          as: "qcPersonInfo",
          let: { qcedPerson: "$quote_qced_person" },
          pipeline: [
            {
              $match: {
                $expr: {
                  $eq: ["$_id", "$$qcedPerson"],
                },
              },
            },
            {
              $project: {
                fullName: { $concat: ["$user_firstName", " ", "$user_lastName"] },
              },
            },
          ],
        },
      },
      {
        $lookup: {
          from: "users",
          as: "createdPersonInfo",
          let: { createdPerson: "$quote_created_person" },
          pipeline: [
            {
              $match: {
                $expr: {
                  $eq: ["$_id", "$$createdPerson"],
                },
              },
            },
            {
              $project: {
                fullName: { $concat: ["$user_firstName", " ", "$user_lastName"] },
              },
            },
          ],
        },
      },
      { $unwind: { path: "$customerInfo", preserveNullAndEmptyArrays: true } },
      { $unwind: { path: "$customercontactInfo", preserveNullAndEmptyArrays: true } },
      { $unwind: { path: "$assignedPersonInfo", preserveNullAndEmptyArrays: true } },
      { $unwind: { path: "$qcPersonInfo", preserveNullAndEmptyArrays: true } },
      { $unwind: { path: "$createdPersonInfo", preserveNullAndEmptyArrays: true } },
      {
        $project: {
          _id: 1,
          quote_unique_id: 1,
          quote_customer_id: 1,
          quote_delivery_date: 1,
          quote_delivery_time: 1,
          quote_delivery_session: 1,
          quote_delivery_date_str: 1,
          created_str: 1,
          quote_delivery_address_mode: 1,
          quote_far_suburb: 1,
          quote_site_delivery_address1: 1,
          quote_site_delivery_address2: 1,
          quote_site_delivery_city: 1,
          quote_site_delivery_country: 1,
          quote_site_delivery_postalcode: 1,
          quote_site_delivery_state: 1,
          quote_store_delivery_address1: 1,
          quote_store_delivery_address2: 1,
          quote_store_delivery_city: 1,
          quote_store_delivery_country: 1,
          quote_store_delivery_postalcode: 1,
          quote_store_delivery_state: 1,
          quote_inter_department_instruction: 1,
          quote_custom_note: 1,
          quote_delivery_address: 1,
          quote_customer_PO_number: 1,
          quote_customer_contact_phone: 1,
          quote_customer_contact_email: 1,
          quote_site_delivery_attention_person: 1,
          quote_site_delivery_attention_contact: 1,
          quote_flashing_checker: 1,
          quote_status: 1,
          quote_item_code: 1,
          quote_qc_status: 1,
          quote_design_stage: 1,
          quote_myob_push_status: 1,
          quote_myob_row_id: 1,
          f_quote_exist_status: 1,
          fg_quote_exist_status: 1,
          cl_quote_exist_status: 1,
          j_quote_exist_status: 1,
          quote_payment_images: 1,
          roof_quote_exist_status: 1,
          gbi_quote_exist_status: 1,
          f_quote_prod_push_status: 1,
          fg_quote_prod_push_status: 1,
          cl_quote_prod_push_status: 1,
          j_quote_prod_push_status: 1,
          gbi_quote_prod_push_status: 1,
          gbil_quote_prod_push_status: 1,
          roof_quote_prod_push_status: 1,
          quote_GST_EXP_Total: 1,
          quote_Discount_Total: 1,
          quote_GST_Taxable_Total: 1,
          quote_Tax_Total: 1,
          quote_Overall_Price: 1,
          created: 1,
          account_ID: "$customerInfo._id",
          account_UID: "$customerInfo.account_UID",
          account_Name: "$customerInfo.account_Name",
          account_Address: "$customerInfo.account_Address",
          account_StoreAddress: "$customerInfo.account_StoreAddress",
          account_Address_line_one: "$customerInfo.account_Address_line_one",
          account_Address_line_two: "$customerInfo.account_Address_line_two",
          account_Address_Country: "$customerInfo.account_Address_Country",
          account_Address_State: "$customerInfo.account_Address_State",
          account_Address_City: "$customerInfo.account_Address_City",
          account_Address_PostalCode: "$customerInfo.account_Address_PostalCode",
          account_Status: "$customerInfo.account_Status",
          account_DataRemoved: "$customerInfo.account_DataRemoved",
          // Quotation code
          quote_designed_person_id: "$quote_designed_person",
          quote_created_person_fullName: {
            $cond: {
              if: {
                $eq: [{ $type: "$quote_created_person" }, "objectId"],
              },
              then: "$createdPersonInfo.fullName",
              else: "$quote_created_person",
            },
          },
          quote_designed_person_fullName: {
            $cond: {
              if: {
                $eq: [{ $type: "$quote_designed_person" }, "objectId"],
              },
              then: "$assignedPersonInfo.fullName",
              else: "$quote_designed_person",
            },
          },
          quote_qced_person_fullName: {
            $cond: {
              if: {
                $eq: [{ $type: "$quote_qced_person" }, "objectId"],
              },
              then: "$qcPersonInfo.fullName",
              else: "$quote_qced_person",
            },
          },
        },
      },
    ]);
    res.send(quoteDetails).status(200).end();
  } catch (err) {
    logError("fetchSpecificQuotationDetails", err, req.user.user_ref_id);
    res.status(500).send("Data Fetching Failed");
  }
};

exports.fetchSpecificQuotationDetailsPage = async (req, res) => {
  try {
    const quotesID = new mongoose.Types.ObjectId(req.params.quotesid);
    let quotesDetails = await QuotationMaster.aggregate([
      { $match: { _id: quotesID } },
      { $lookup: { from: "accounts", as: "customerInfo", localField: "quote_customer_id", foreignField: "_id" } },
      { $lookup: { from: "accountcontacts", as: "customercontactInfo", localField: "quote_customer_contact_id", foreignField: "_id" } },
      { $unwind: { path: "$customerInfo", preserveNullAndEmptyArrays: true } },
      { $unwind: { path: "$customercontactInfo", preserveNullAndEmptyArrays: true } },
      {
        $project: {
          _id: 1,
          quote_unique_id: 1,
          quote_customer_id: 1,
          quote_inter_department_instruction: 1,
          quote_custom_note: 1,
          quote_customer_contact_phone: 1,
          quote_customer_contact_email: 1,
          quote_site_delivery_attention_person: 1,
          quote_site_delivery_attention_contact: 1,
          quote_customer_PO_number: 1,
          quote_status: 1,
          quote_far_suburb: 1,
          quote_myob_push_status: 1,
          quote_flashing_checker: 1,
          f_order_exist_status: 1,
          fg_order_exist_status: 1,
          j_order_exist_status: 1,
          cl_order_exist_status: 1,
          roof_order_exist_status: 1,
          gbi_order_exist_status: 1,
          created: 1,
          quote_design_stage: 1,
          account_ID: "$customerInfo._id",
          account_UID: "$customerInfo.account_UID",
          account_Name: "$customerInfo.account_Name",
          account_Address: "$customerInfo.account_Address",
          account_StoreAddress: "$customerInfo.account_StoreAddress",
          account_Address_line_one: "$customerInfo.account_Address_line_one",
          account_Address_line_two: "$customerInfo.account_Address_line_two",
          account_Address_Country: "$customerInfo.account_Address_Country",
          account_Address_State: "$customerInfo.account_Address_State",
          account_Address_City: "$customerInfo.account_Address_City",
          account_Address_PostalCode: "$customerInfo.account_Address_PostalCode",
        },
      },
    ]);
    res.send(quotesDetails).status(200).end();
  } catch (err) {
    logError("fetchSpecificQuotationDetailsPage", err, req.user.user_ref_id);
    res.status(500).send("Data Fetching Failed");
  }
};

exports.addManualEntryQuotationItem = async (req, res) => {
  try {
    const quoteMasID = new mongoose.Types.ObjectId(req.params.quotesid);
    let quoteMasDetails = await QuotationMaster.find({ _id: quoteMasID });
    let quoteMasUID = quoteMasDetails[0].quote_unique_id;

    const processOrderRow = async (length, uomValue) => {
      let quotePieces = "0";
      let total_special_price = "0";
      let quoteLength = length;
      if (quoteLength < 1) {
        quoteLength = 1;
      }
      let quoteUOM = req.body.quote_item_me_uom;
      let quoteUOMValue = uomValue;
      quotePieces = req.body.quote_item_me_quantity;
      let finalItemCode = req.body.quote_item_me_code;
      let finalItemDesciption = req.body.quote_item_me_description;
      let quoteitemmedepartment = req.body.quote_item_me_department;
      let quoteitemmedepartmentObj = new mongoose.Types.ObjectId(req.body.quote_item_me_department);
      let quoteitemqtymeprice = req.body.quote_item_qty_me_price;
      let discountPercentage = parseFloat(req.body.quote_item_me_discount) || 0;
      let discountedUP = 0;
      let discountedTA = 0;
      let discountedTP;

      let dept_data = await Department.find({ _id: quoteitemmedepartmentObj });
      let dept_code = dept_data[0].department_code;
      let quoteitemmequantity;
      if (dept_code === "ROOF") {
        quoteitemmequantity = parseFloat(quoteLength) * parseFloat(quoteUOMValue) * 0.762;
      } else if (dept_code === "GBI" || dept_code === "GBIL") {
        const qty = req.body.quote_item_me_quantity;
        quoteitemmequantity = qty === undefined || qty === null || qty === "" ? 0 : qty;
      } else {
        quoteitemmequantity = parseFloat(quoteLength) * parseFloat(quoteUOMValue);
      }

      total_special_price = parseFloat(quoteitemqtymeprice) * parseFloat(quoteitemmequantity).toFixed(2);
      discountedTP = total_special_price;
      discountedUP = parseFloat(quoteitemqtymeprice);
      if (discountPercentage > 0) {
        discountedUP = parseFloat(quoteitemqtymeprice) - (parseFloat(quoteitemqtymeprice) * discountPercentage) / 100;
        discountedTP = parseFloat(discountedUP) * parseFloat(quoteitemmequantity).toFixed(2);
        discountedTA = total_special_price - discountedTP;
      }

      const quoteItemData = new QuotationItemManual({
        quote_master_me_id: quoteMasID,
        quote_unique_me_id: quoteMasUID,
        quote_item_me_length: length,
        quote_item_me_uom: quoteUOM,
        quote_item_me_uom_value: quoteUOMValue,
        quote_item_me_quantity: quoteitemmequantity,
        quote_item_qty_me_price: quoteitemqtymeprice,
        quote_item_special_me_price: discountedTP,
        quote_item_me_code: finalItemCode,
        quote_item_me_description: finalItemDesciption,
        quote_item_me_department: quoteitemmedepartment,
        quote_item_me_department_code: dept_code,
        quote_item_special_me_price_original: total_special_price,
        quote_item_me_discount: discountPercentage,
        quote_item_me_discounted_amount: discountedTA,
        quote_item_qty_me_discounted_price: discountedUP,
      });

      const quoteItemDataInfo = await quoteItemData.save();
      if (quoteItemDataInfo) {
        let updateData;
        if (dept_code === "FG") {
          updateData = { $set: { fg_quote_prod_push_status: 1 } };
        }
        if (dept_code === "J") {
          updateData = { $set: { j_quote_prod_push_status: 1 } };
        }
        if (dept_code === "CL") {
          updateData = { $set: { cl_quote_prod_push_status: 1 } };
        }
        if (dept_code === "ROOF") {
          updateData = { $set: { roof_quote_prod_push_status: 1 } };
        }
        if (dept_code === "GBI") {
          updateData = { $set: { gbi_quote_prod_push_status: 1 } };
        }
        if (dept_code === "GBIL") {
          updateData = { $set: { gbil_quote_prod_push_status: 1 } };
        }
        let conditions = { _id: quoteMasID };
        await QuotationMaster.findByIdAndUpdate(conditions, updateData, attrs);
        await checkIndividualQuoteStatus(req.params.quotesid);
        await RecalculateOverallQuotesTotalFn(quoteMasID);
      }
    };

    await processOrderRow(req.body.quote_item_me_length, req.body.quote_item_me_uom_value);
    if (req.body.additionalRows && req.body.additionalRows.length > 0) {
      for (const row of req.body.additionalRows) {
        await processOrderRow(row.length, row.pieces);
      }
    }
    res.send("Manual Entry Added Successfully").status(200).end();
  } catch (err) {
    logError("addManualEntryQuotationItem", err, req.user.user_ref_id);
    res.status(500).send("Data Adding Failed");
  }
};

exports.fetchManualEntryQuotationItem = async (req, res) => {
  try {
    let quote_me_id = new mongoose.Types.ObjectId(req.params.quotesid);
    let manualQuotesDetails = await QuotationItemManual.aggregate([
      { $match: { $and: [{ quote_master_me_id: quote_me_id }] } },
      { $sort: { created: 1 } },
      { $lookup: { from: "departments", as: "departments", localField: "quote_item_me_department", foreignField: "_id" } },
      { $unwind: { path: "$departments", preserveNullAndEmptyArrays: true } },
      {
        $project: {
          _id: 1,
          quote_master_me_id: 1,
          quote_unique_me_id: 1,
          quote_item_unique_me_id: 1,
          quote_item_me_material: 1,
          quote_item_me_color: 1,
          quote_item_exact_me_grith: 1,
          quote_item_round_me_grith: 1,
          quote_item_me_fold: 1,
          quote_item_me_thickness: 1,
          quote_item_me_length: 1,
          quote_item_me_uom: 1,
          quote_item_me_uom_value: 1,
          quote_item_me_quantity: 1,
          quote_item_me_pieces: 1,
          quote_item_me_price: 1,
          quote_item_qty_me_price: 1,
          quote_item_special_me_price: 1,
          quote_item_me_code: 1,
          quote_item_me_description: 1,
          quote_item_me_flag: 1,
          quote_item_me_department: 1,
          quote_item_special_me_price_original: 1,
          quote_item_me_discount: 1,
          quote_item_me_discounted_amount: 1,
          quote_item_qty_me_discounted_price: 1,
          created: 1,
          quote_design_stage: 1,
          departments: "$departments.department_name",
        },
      },
    ]);
    res.send(manualQuotesDetails).status(200).end();
  } catch (err) {
    logError("fetchManualEntryQuotationItem", err, req.user.user_ref_id);
    res.status(500).send("Data Fetching Failed");
  }
};

exports.fetchSpecificManualEntryQuotationItem = async (req, res) => {
  try {
    const quoteMEID = new mongoose.Types.ObjectId(req.params.quotesid);
    let manualQuoteDetails = await QuotationItemManual.find({ _id: quoteMEID });
    res.send(manualQuoteDetails).status(200).end();
  } catch (err) {
    logError("fetchSpecificManualEntryQuotationItem", err, req.user.user_ref_id);
    res.status(500).send("Data Fetching Failed");
  }
};

exports.updateManualEntryQuotationItem = async (req, res) => {
  try {
    const quoteMEID = new mongoose.Types.ObjectId(req.params.quotesid);
    const quoteItemDataME = req.body;
    let quoteLength = req.body.quote_item_me_length;
    if (quoteLength < 1) {
      quoteLength = 1;
    }
    let QuoteItemDetails = await QuotationItemManual.find({ _id: quoteMEID });
    let QuoteMasterID = QuoteItemDetails[0].quote_master_me_id;
    let quoteitemmedepartmentObj = new mongoose.Types.ObjectId(req.body.quote_item_me_department);

    let dept_data = await Department.find({ _id: quoteitemmedepartmentObj });
    let dept_code = dept_data[0].department_code;
    let quoteitemmequantity;
    if (dept_code === "ROOF") {
      quoteitemmequantity = parseFloat(quoteLength) * parseFloat(req.body.quote_item_me_uom_value) * 0.762;
    } else if (dept_code === "GBI" || dept_code === "GBIL") {
      const qty = req.body.quote_item_me_quantity;
      quoteitemmequantity = qty === undefined || qty === null || qty === "" ? 0 : qty;
    } else {
      quoteitemmequantity = parseFloat(quoteLength) * parseFloat(req.body.quote_item_me_uom_value);
    }

    let total_special_price = "0";
    let quoteitemqtymeprice = req.body.quote_item_qty_me_price;
    let discountPercentage = parseFloat(req.body.quote_item_me_discount) || 0;
    let discountedUP = 0;
    let discountedTA = 0;
    let discountedTP;
    total_special_price = parseFloat(quoteitemqtymeprice) * parseFloat(quoteitemmequantity).toFixed(2);
    discountedTP = total_special_price;
    discountedUP = parseFloat(quoteitemqtymeprice);
    if (discountPercentage > 0) {
      discountedUP = parseFloat(quoteitemqtymeprice) - (parseFloat(quoteitemqtymeprice) * discountPercentage) / 100;
      discountedTP = parseFloat(discountedUP) * parseFloat(quoteitemmequantity).toFixed(2);
      discountedTA = total_special_price - discountedTP;
    }

    quoteItemDataME.updated = new Date().toISOString();
    quoteItemDataME.quote_item_me_length = req.body.quote_item_me_length;
    quoteItemDataME.quote_item_me_quantity = quoteitemmequantity;
    quoteItemDataME.quote_item_special_me_price = discountedTP;
    quoteItemDataME.quote_item_special_me_price_original = total_special_price;
    quoteItemDataME.quote_item_me_discount = discountPercentage;
    quoteItemDataME.quote_item_me_discounted_amount = discountedTA;
    quoteItemDataME.quote_item_qty_me_discounted_price = discountedUP;
    let quoteItemMEInfo = await QuotationItemManual.findByIdAndUpdate(quoteMEID, quoteItemDataME, attrs);

    if (quoteItemMEInfo) {
      let updateData;
      if (dept_code === "FG") {
        updateData = { $set: { fg_quote_prod_push_status: 1 } };
      }
      if (dept_code === "J") {
        updateData = { $set: { j_quote_prod_push_status: 1 } };
      }
      if (dept_code === "CL") {
        updateData = { $set: { cl_quote_prod_push_status: 1 } };
      }
      if (dept_code === "ROOF") {
        updateData = { $set: { roof_quote_prod_push_status: 1 } };
      }
      if (dept_code === "GBI") {
        updateData = { $set: { gbi_quote_prod_push_status: 1 } };
      }
      let conditions = { _id: QuoteMasterID };
      await QuotationMaster.findByIdAndUpdate(conditions, updateData, attrs);
      await checkIndividualQuoteStatus(QuoteMasterID);
      await RecalculateOverallQuotesTotalFn(QuoteMasterID);
    }
    res.status(200).send(quoteItemMEInfo);
    res.end();
  } catch (err) {
    logError("updateManualEntryQuotationItem", err, req.user.user_ref_id);
    res.status(500).send("Data Updation Failed");
  }
};

exports.deleteSpecificManualEntryQuotationItem = async (req, res) => {
  try {
    const quotesMEID = new mongoose.Types.ObjectId(req.params.quotesid);
    let quotesitemmedepartmentObj = new mongoose.Types.ObjectId(req.params.deptcode);
    let dept_data = await Department.find({ _id: quotesitemmedepartmentObj });
    let dept_code = dept_data[0].department_code;
    let QuotesItemDetails = await QuotationItemManual.find({ _id: quotesMEID });
    let QuotesMasterID = QuotesItemDetails[0].quote_master_me_id;
    let deletemanualQuote = await QuotationItemManual.deleteMany({ _id: quotesMEID });

    if (deletemanualQuote) {
      let updateData;
      if (dept_code === "FG") {
        updateData = { $set: { fg_quote_prod_push_status: 1 } };
      }
      if (dept_code === "J") {
        updateData = { $set: { j_quote_prod_push_status: 1 } };
      }
      if (dept_code === "CL") {
        updateData = { $set: { cl_quote_prod_push_status: 1 } };
      }
      if (dept_code === "ROOF") {
        updateData = { $set: { roof_quote_prod_push_status: 1 } };
      }
      if (dept_code === "GBI") {
        updateData = { $set: { gbi_quote_prod_push_status: 1 } };
      }
      if (dept_code === "GBIL") {
        updateData = { $set: { gbil_quote_prod_push_status: 1 } };
      }
      let conditions = { _id: QuotesMasterID };
      let updatedProdPushStatus = await QuotationMaster.findByIdAndUpdate(conditions, updateData, attrs);

      let DeptExistenceCheck = await QuotationItemManual.find({
        quote_master_me_id: QuotesMasterID,
        quote_item_me_department: quotesitemmedepartmentObj,
      });

      let deptLength = DeptExistenceCheck.length;
      if (!deptLength) {
        let updateDeptData;
        if (dept_code === "FG") {
          updateDeptData = { $set: { fg_quote_prod_push_status: 0 } };
        }
        if (dept_code === "J") {
          updateDeptData = { $set: { j_quote_prod_push_status: 0 } };
        }
        if (dept_code === "CL") {
          updateDeptData = { $set: { cl_quote_prod_push_status: 0 } };
        }
        if (dept_code === "ROOF") {
          updateDeptData = { $set: { roof_quote_prod_push_status: 0 } };
        }
        if (dept_code === "GBI") {
          updateDeptData = { $set: { gbi_quote_prod_push_status: 0 } };
        }
        if (dept_code === "GBIL") {
          updateDeptData = { $set: { gbil_quote_prod_push_status: 0 } };
        }
        let conditions = { _id: QuotesMasterID };
        await QuotationMaster.findByIdAndUpdate(conditions, updateDeptData, attrs);
      }
      await checkIndividualQuoteStatus(QuotesMasterID);
      await RecalculateOverallQuotesTotalFn(QuotesMasterID);
    }
    res.status(200).send(deletemanualQuote);
    res.end();
  } catch (err) {
    logError("deleteSpecificManualEntryQuotationItem", err, req.user.user_ref_id);
    res.status(500).send("Data Deletion Failed");
  }
};

// New SWI implementation for Quotation
exports.fetchQuotationFlashingsFromDesigntool = async (req, res) => {
  // let sqlConnection;
  let quoteItemSummary;
  const quoteMasID = new mongoose.Types.ObjectId(req.params.quotesid);
  let quoteMasDetails = await QuotationMaster.find({ _id: quoteMasID });
  // let quoteMasUID = quoteMasDetails[0].quote_unique_id;
  // let quoteCusID = quoteMasDetails[0].quote_customer_id;
  // let quoteDesignerID = quoteMasDetails[0].quote_designed_person;
  // let quoteF_ProdStatus = quoteMasDetails[0].f_quote_prod_push_status;
  //console.error("quoteF_ProdStatus", quoteF_ProdStatus);

  const aggregationPipeline = [
    { $match: { $and: [{ quote_master_id: quoteMasID }] } },
    { $sort: { created: 1 } },
    { $lookup: { from: "coreproducts", as: "materialsInfo", localField: "quote_item_material", foreignField: "_id" } },
    { $lookup: { from: "productcolors", as: "colorInfo", localField: "quote_item_color", foreignField: "_id" } },
    { $lookup: { from: "productgirths", as: "girthInfo", localField: "quote_item_round_grith", foreignField: "_id" } },
    { $lookup: { from: "productfolds", as: "foldInfo", localField: "quote_item_fold", foreignField: "_id" } },
    { $unwind: { path: "$materialsInfo", preserveNullAndEmptyArrays: true } },
    { $unwind: { path: "$colorInfo", preserveNullAndEmptyArrays: true } },
    { $unwind: { path: "$girthInfo", preserveNullAndEmptyArrays: true } },
    { $unwind: { path: "$foldInfo", preserveNullAndEmptyArrays: true } },
    {
      $project: {
        _id: 1,
        quote_master_id: 1,
        quote_unique_id: 1,
        quote_item_unique_id: 1,
        quote_item_exact_grith: 1,
        quote_item_exact_fold: 1,
        quote_item_price: 1,
        quote_item_qty_price: 1,
        quote_item_special_price: 1,
        quote_item_special_price_original: 1,
        quote_item_code: 1,
        quote_item_description: 1,
        quote_item_quantity: 1,
        quote_item_pieces: 1,
        quote_item_length: 1,
        quote_item_flag: 1,
        quote_item_designer: 1,
        quote_item_shape_id: 1,
        core_Product_Name: "$materialsInfo.core_Product_Name",
        core_Product_Thickness: "$materialsInfo.core_Product_Thickness",
        core_Product_Ref_Id: "$materialsInfo.core_Product_Ref_Id",
        product_Color: "$colorInfo.product_Color",
        product_Color_Hex_Code: "$colorInfo.product_Color_Hex_Code",
        product_Color_Special_Price: "$colorInfo.product_Color_Special_Price",
        product_Girth: "$girthInfo.product_Girth",
        product_Fold: "$foldInfo.product_Fold",
      },
    },
  ];

  // try {
  //   sqlConnection = await sql.connect("Server=" + process.env.SQLServerName + "," + process.env.SQLPort + "; Database=" + process.env.SQLDataBase + "; User Id=" + process.env.SQLUsername + "; Password=" + process.env.SQLPassword + "; Encrypt=true;Trusted_Connection=True; TrustServerCertificate=True;");
  // } catch (sqlError) {
  //   const err = new Error("Failed To Connect SWI DataBase. Please Check Connection and Credentials in .ENV");
  //   logError("fetchQuotationFlashingsFromDesigntool", err, req.user.user_ref_id);
  //   console.error("SWI Connection Failed");
  //   quoteItemSummary = await QuotationItem.aggregate(aggregationPipeline);
  //   res.send(quoteItemSummary).status(200).end();
  //   return;
  // }
  await RecalculateOverallQuotesTotalFn(quoteMasID);
  quoteItemSummary = await QuotationItem.aggregate(aggregationPipeline);

  const orderNumber = quoteMasDetails[0].quote_unique_id;
  const templates = await Template.find({ orderNumber});
  if (!templates || templates.length === 0) {
    console.log("No templates found for order:", orderNumber, ". Returning aggregated quote items.");
    return res.send(quoteItemSummary).status(200).end();
  }
  const jobIdCount = templates?.reduce((acc, item) => {
    return acc + (item?.swiJobIds?.length || 0);
  }, 0);
  console.log("Total Job IDs count from templates:", jobIdCount, "for order:", quoteItemSummary?.length);
  if (quoteItemSummary?.length !== jobIdCount) {
    console.log("Mismatch in order items and job IDs count. Fetching sub-items from design tool.");
    logError("fetchQuotationFlashingsFromDesigntool", new Error(`Mismatch in order items and job IDs count for order ${orderNumber}`), req.user.user_ref_id);
    quoteItemSummary = await fetchQuotationFlashingsFromDesigntoolFn(quoteMasID, templates);
    if(quoteItemSummary?.errorMessage){
      console.error("Error fetching quote items from design tool:", quoteItemSummary.errorMessage);
      return res.status(500).send(quoteItemSummary.errorMessage);
    }
  }
  
    // Sort line items by templates order and their swiJobIds order
    if (templates.length > 0 && Array.isArray(quoteItemSummary)) {
      const jobIdOrder = {};
      let orderIndex = 0;
      for (const template of templates) {
        if (template.swiJobIds && Array.isArray(template.swiJobIds)) {
          for (const jobId of template.swiJobIds) {
            jobIdOrder[jobId.toString()] = orderIndex++;
          }
        }
      }
      quoteItemSummary.sort((a, b) => {
        const indexA = jobIdOrder[a.quote_item_unique_id?.toString()] ?? Number.MAX_SAFE_INTEGER;
        const indexB = jobIdOrder[b.quote_item_unique_id?.toString()] ?? Number.MAX_SAFE_INTEGER;
        return indexA - indexB;
      });
    }

  res.send(quoteItemSummary).status(200).end();
  // if (sqlConnection) {
  //   try {
  //     if (quoteF_ProdStatus === 2) {
  //       quoteItemSummary = await QuotationItem.aggregate(aggregationPipeline);
  //       res.send(quoteItemSummary).status(200).end();
  //     } else {
  //       const selectJobs = await sql.query("select * from Jobs where JobName = '" + quoteMasUID + "'ORDER BY JobID ASC");
  //       const quoteItemsToInsert = [];
  //       let totalSubQuotePrice = 0;

  //       for (const job of selectJobs.recordset) {
  //         let quoteItemMaterialDetails = await CoreProduct.find({ core_Product_Name: job.Material.trim() });
  //         let quoteItemMaterial = quoteItemMaterialDetails[0]._id;
  //         let quoteItemMaterialObj = new mongoose.Types.ObjectId(quoteItemMaterialDetails[0]._id);
  //         let quoteMaterialCode = quoteItemMaterialDetails[0].core_Product_Ref_Id;
  //         let quoteMaterialTickness = quoteItemMaterialDetails[0].core_Product_Thickness;

  //         let quoteItemProdColorDetails = await ProductColor.find({ product_Color: job.Colour, product_Core_Id: quoteItemMaterialObj });
  //         let quoteItemProdColor = quoteItemProdColorDetails[0]._id;
  //         let ColorCode = quoteItemProdColorDetails[0].product_Color_Code;
  //         let Color = quoteItemProdColorDetails[0].product_Color;

  //         let shapeID = job.ShapeID;
  //         let joblength = job.Length;
  //         if (joblength < 1000) {
  //           joblength = 1000;
  //         }

  //         // Girth Calculation
  //         let girth = job.Width;
  //         let exact_girth = job.Width;
  //         if (girth > 1200) {
  //           girth = 1200;
  //         }
  //         let roundedGirthID;
  //         let girthData = await ProductGirth.findOne({ product_Girth: { $gte: girth } });
  //         if (girthData) {
  //           roundedGirthID = girthData._id;
  //         }
  //         let GirthCode = girthData.product_Girth;

  //         // Folds Calculation
  //         let FinalFold = 0;
  //         let NormalFold = job.Folds;
  //         let SquashFold = job.SquashFolds;
  //         FinalFold = parseInt(NormalFold) + parseInt(SquashFold);
  //         let ExactFinalFold = parseInt(NormalFold) + parseInt(SquashFold);
  //         if (FinalFold > 10) {
  //           FinalFold = 10;
  //         }
  //         let quoteItemFoldDetails = await ProductFold.find({ product_Fold: FinalFold });
  //         let quoteItemFold = quoteItemFoldDetails[0]._id;
  //         let FoldCode = quoteItemFoldDetails[0].product_Fold;

  //         let finalItemCode = ColorCode + "" + GirthCode + "G" + FoldCode + "F";
  //         let finalItemDesciption = quoteMaterialTickness + " " + Color + " " + quoteMaterialCode + " " + GirthCode + "G/" + FoldCode + "F";
  //         let priceDetails = await CustomerMaterialPricebook.find({ customer_ID: quoteCusID, material_ID: quoteItemMaterial, girth_ID: roundedGirthID, fold_ID: quoteItemFold });
  //         let defaultmaterialPrice;
  //         let materialPrice;
  //         let qtyAddedDefaultmaterialPrice;
  //         let qtyAddedMaterialPrice;
  //         let quotePieces;

  //         if (priceDetails.length) {
  //           defaultmaterialPrice = priceDetails[0].price_Values;

  //           // Color Special Price Calculation
  //           let colorDetails = await ProductColor.find({ _id: quoteItemProdColor });
  //           let colorSpecialPrice = colorDetails[0].product_Color_Special_Price;
  //           if (colorSpecialPrice > 0) {
  //             defaultmaterialPrice = parseFloat(defaultmaterialPrice) + (parseFloat(defaultmaterialPrice) * parseFloat(colorSpecialPrice)) / 100;
  //           }

  //           materialPrice = priceDetails[0].price_Values;
  //           quotePieces = parseFloat(job.Quantity) * parseFloat(joblength / 1000);
  //           qtyAddedDefaultmaterialPrice = parseFloat(defaultmaterialPrice) * quotePieces;
  //           qtyAddedMaterialPrice = parseFloat(defaultmaterialPrice) * quotePieces;
  //         } else {
  //           const err = new Error("SWI Tool Selected Material Not Found in CRM");
  //           logError("fetchQuotationFlashingsFromDesigntool", err, req.user.user_ref_id);
  //           res.status(500).send("Price Not Yet Assigned For this Customer*Girth*Fold Combination. Kindly Recheck And Assign Price");
  //           return;
  //         }

  //         quoteItemsToInsert.push({
  //           quote_master_id: quoteMasID,
  //           quote_unique_id: quoteMasUID,
  //           quote_item_unique_id: job.JobID,
  //           quote_item_material: quoteItemMaterial,
  //           quote_item_color: quoteItemProdColor,
  //           quote_item_exact_grith: exact_girth,
  //           quote_item_round_grith: roundedGirthID,
  //           quote_item_exact_fold: ExactFinalFold,
  //           quote_item_fold: quoteItemFold,
  //           quote_item_length: job.Length,
  //           quote_item_quantity: quotePieces,
  //           quote_item_pieces: job.Quantity,
  //           quote_item_price: defaultmaterialPrice,
  //           quote_item_qty_price: qtyAddedDefaultmaterialPrice,
  //           quote_item_special_price: qtyAddedMaterialPrice,
  //           quote_item_special_price_original: qtyAddedMaterialPrice,
  //           quote_item_code: finalItemCode,
  //           quote_item_description: finalItemDesciption,
  //           quote_item_flag: "DT",
  //           quote_item_designer: quoteDesignerID,
  //           quote_item_shape_id: shapeID,
  //         });
  //       }

  //       const session = await mongoose.startSession();
  //       session.startTransaction();

  //       try {
  //         await QuotationItem.bulkWrite(
  //           [
  //             {
  //               deleteMany: {
  //                 filter: { quote_master_id: quoteMasID },
  //               },
  //             },
  //             ...quoteItemsToInsert.map(item => ({
  //               insertOne: {
  //                 document: item,
  //               },
  //             })),
  //           ],
  //           { session }
  //         );

  //         await session.commitTransaction();
  //         quoteItemSummary = await QuotationItem.aggregate(aggregationPipeline);
  //         res.send(quoteItemSummary).status(200).end();
  //       } catch (error) {
  //         await session.abortTransaction();
  //         console.error(error);
  //         quoteItemSummary = await QuotationItem.aggregate(aggregationPipeline);
  //         res.send(quoteItemSummary).status(200).end();
  //       } finally {
  //         session.endSession();
  //       }
  //     }

  //     await RecalculateOverallQuotesTotalFn(quoteMasID);
  //   } catch (error) {
  //     logError("fetchQuotationFlashingsFromDesigntool", error, req.user.user_ref_id);
  //     res.status(500).send("Data Fetching Failed");
  //   }
  // }
};

const fetchQuotationFlashingsFromDesigntoolFn = async (id, templates) => {
  console.log(" Refetch from SWI")
  let sqlConnection;
  let quoteItemSummary;
  const quoteMasID = new mongoose.Types.ObjectId(id);
  let quoteMasDetails = await QuotationMaster.find({ _id: quoteMasID });
  let quoteMasUID = quoteMasDetails[0].quote_unique_id;
  let quoteCusID = quoteMasDetails[0].quote_customer_id;
  let quoteDesignerID = quoteMasDetails[0].quote_designed_person;
  let quoteF_ProdStatus = quoteMasDetails[0].f_quote_prod_push_status;

  const aggregationPipeline = [
    { $match: { $and: [{ quote_master_id: quoteMasID }] } },
    { $sort: { created: 1 } },
    { $lookup: { from: "coreproducts", as: "materialsInfo", localField: "quote_item_material", foreignField: "_id" } },
    { $lookup: { from: "productcolors", as: "colorInfo", localField: "quote_item_color", foreignField: "_id" } },
    { $lookup: { from: "productgirths", as: "girthInfo", localField: "quote_item_round_grith", foreignField: "_id" } },
    { $lookup: { from: "productfolds", as: "foldInfo", localField: "quote_item_fold", foreignField: "_id" } },
    { $unwind: { path: "$materialsInfo", preserveNullAndEmptyArrays: true } },
    { $unwind: { path: "$colorInfo", preserveNullAndEmptyArrays: true } },
    { $unwind: { path: "$girthInfo", preserveNullAndEmptyArrays: true } },
    { $unwind: { path: "$foldInfo", preserveNullAndEmptyArrays: true } },
    {
      $project: {
        _id: 1,
        quote_master_id: 1,
        quote_unique_id: 1,
        quote_item_unique_id: 1,
        quote_item_exact_grith: 1,
        quote_item_exact_fold: 1,
        quote_item_price: 1,
        quote_item_qty_price: 1,
        quote_item_special_price: 1,
        quote_item_special_price_original: 1,
        quote_item_code: 1,
        quote_item_description: 1,
        quote_item_quantity: 1,
        quote_item_pieces: 1,
        quote_item_length: 1,
        quote_item_flag: 1,
        quote_item_designer: 1,
        quote_item_shape_id: 1,
        core_Product_Name: "$materialsInfo.core_Product_Name",
        core_Product_Thickness: "$materialsInfo.core_Product_Thickness",
        core_Product_Ref_Id: "$materialsInfo.core_Product_Ref_Id",
        product_Color: "$colorInfo.product_Color",
        product_Color_Special_Price: "$colorInfo.product_Color_Special_Price",
        product_Girth: "$girthInfo.product_Girth",
        product_Fold: "$foldInfo.product_Fold",
      },
    },
  ];

  try {
    sqlConnection = await sql.connect(config);
  } catch (sqlError) {
    const err = new Error("Failed To Connect SWI DataBase. Please Check Connection and Credentials in .ENV");
    logError("fetchQuotationFlashingsFromDesigntoolManually", err, 'unkown');
    console.error("SWI Connection Failed");
    quoteItemSummary = await QuotationItem.aggregate(aggregationPipeline);
    return;
  }

  if (sqlConnection) {
    try {
      const selectJobs = await sql.query("select Material, Colour, ShapeID, Width,Folds, SquashFolds, Length, Quantity, JobID from Jobs where JobName = '" + quoteMasUID + "'ORDER BY JobID ASC");
      const quoteItemsToInsert = [];
      let totalSubQuotePrice = 0;

      for (const job of selectJobs.recordset) {
        let quoteItemMaterialDetails = await CoreProduct.find({ core_Product_Name: job.Material.trim() });
        let quoteItemMaterial = quoteItemMaterialDetails[0]._id;
        let quoteItemMaterialObj = new mongoose.Types.ObjectId(quoteItemMaterialDetails[0]._id);
        let quoteMaterialCode = quoteItemMaterialDetails[0].core_Product_Ref_Id;
        let quoteMaterialTickness = quoteItemMaterialDetails[0].core_Product_Thickness;

        let quoteItemProdColorDetails = await ProductColor.find({ product_Color: job.Colour, product_Core_Id: quoteItemMaterialObj });
        let quoteItemProdColor = quoteItemProdColorDetails[0]._id;
        let ColorCode = quoteItemProdColorDetails[0].product_Color_Code;
        let Color = quoteItemProdColorDetails[0].product_Color;

        const isGalvanised = job.Material.toUpperCase().includes("GALVANISED") || job.Material.toUpperCase().includes("GALVANIZED");
        const maxGirthValue = isGalvanised ? 1220 : 1203;

        let shapeID = job.ShapeID;
        let joblength = job.Length;
        if (joblength < 1000) {
          joblength = 1000;
        }

        let girth = job.Width;
        let exact_girth = job.Width;
        if (typeof exact_girth === 'string' && exact_girth.includes('.')) {
          exact_girth = Math.ceil(parseFloat(exact_girth));
        } else if (typeof exact_girth === 'string') {
          exact_girth = parseInt(exact_girth, 10);
        } else if (typeof exact_girth === 'number' && !Number.isInteger(exact_girth)) {
          exact_girth = Math.ceil(exact_girth);
        }
        // Normalize girth to 1200 if within tolerance range based on material type
        // Galvanised: 1200-1220 → 1200, Others: 1200-1203 → 1200
        if (isGalvanised && girth >= 1200 && girth <= 1220) {
          girth = 1200;
        } else if (!isGalvanised && girth >= 1200 && girth <= 1203) {
          girth = 1200;
        }
        let maxGirthData;
        if (girth > maxGirthValue) {
          girth = 1200;
          maxGirthData = await ProductGirth.findOne({product_Girth: {$gte: job.Length}}).sort({ product_Girth: 1 });
        }

        const girthData = await ProductGirth.findOne({ product_Girth: { $gte: girth } }).sort({ product_Girth: 1 });
        if (!girthData) {
          throw new Error(`ProductGirth not found for girth >= ${girth}`);
        }
        const roundedGirthID = girthData._id;
        let GirthCode = girthData.product_Girth;
        if (maxGirthData) {
          GirthCode = maxGirthData.product_Girth;
          girth = maxGirthData.length;
        }

        let FinalFold = 0;
        let NormalFold = job.Folds;
        let SquashFold = job.SquashFolds;
        FinalFold = parseInt(NormalFold)
        let ExactFinalFold = parseInt(NormalFold)

        const jobID = job.JobID;
        const templateForJob = templates.find(template =>
          Array.isArray(template.swiJobIds) && template.swiJobIds.includes(jobID)
        );
        // Get angles array from template
        const angles = Array.isArray(templateForJob?.angles) ? templateForJob.angles : [];
        const hasFlatAngles = angles.some(angle => {
          const absAngle = Math.abs(angle);
          return absAngle >= 170 && absAngle <= 180;
        });

        if (hasFlatAngles) {
          FinalFold += 1;
          ExactFinalFold += 1;
        }
        let quoteItemFoldDetails = await ProductFold.find({ product_Fold: FinalFold });
        let quoteItemFold = quoteItemFoldDetails[0]._id;
        let FoldCode = quoteItemFoldDetails[0].product_Fold;

        let finalItemCode = ColorCode + "" + GirthCode + "G" + FoldCode + "F";
        let finalItemDesciption = quoteMaterialTickness + " " + Color + " " + quoteMaterialCode + " " + GirthCode + "G/" + FoldCode + "F";

        let priceDetails = await CustomerMaterialPricebook.find({ customer_ID: quoteCusID, material_ID: quoteItemMaterial, girth_ID: roundedGirthID, fold_ID: quoteItemFold });
        let defaultmaterialPrice;
        let materialPrice;
        let qtyAddedDefaultmaterialPrice;
        let qtyAddedMaterialPrice;
        let quotePieces;

        if (priceDetails.length) {
          defaultmaterialPrice = priceDetails[0].price_Values;

          // Color Special Price Calculation
          let colorDetails = await ProductColor.find({ _id: quoteItemProdColor });
          let colorSpecialPrice = colorDetails[0].product_Color_Special_Price;
          if (colorSpecialPrice > 0) {
            defaultmaterialPrice = parseFloat(defaultmaterialPrice) + (parseFloat(defaultmaterialPrice) * parseFloat(colorSpecialPrice)) / 100;
          }

          materialPrice = priceDetails[0].price_Values;
          let jobLength = job.Length < 1000 ? 1000 : job.Length;
          const totalLength = exact_girth > maxGirthValue ? exact_girth : jobLength;
          quotePieces = parseFloat(job.Quantity) * parseFloat(totalLength / 1000);
          qtyAddedDefaultmaterialPrice = parseFloat(defaultmaterialPrice) * quotePieces;
          qtyAddedMaterialPrice = parseFloat(defaultmaterialPrice) * quotePieces;
        } else {
          const err = new Error("Price Not Yet Assigned For this Customer*Girth*Fold Combination. Kindly Recheck And Assign Price");
          logError("fetchQuotationFlashingsFromDesigntoolManually", err);
          return { errorMessage: "Price Not Yet Assigned For this Customer*Girth*Fold Combination. Kindly Recheck And Assign Price" };
        }

        quoteItemsToInsert.push({
          quote_master_id: quoteMasID,
          quote_unique_id: quoteMasUID,
          quote_item_unique_id: job.JobID,
          quote_item_material: quoteItemMaterial,
          quote_item_color: quoteItemProdColor,
          quote_item_exact_grith: exact_girth,
          quote_item_round_grith: roundedGirthID,
          quote_item_exact_fold: ExactFinalFold,
          quote_item_fold: quoteItemFold,
          quote_item_length: exact_girth > maxGirthValue ? exact_girth : job.Length,
          quote_item_quantity: quotePieces,
          quote_item_pieces: job.Quantity,
          quote_item_price: defaultmaterialPrice,
          quote_item_qty_price: qtyAddedDefaultmaterialPrice,
          quote_item_special_price: qtyAddedMaterialPrice,
          quote_item_special_price_original: qtyAddedMaterialPrice,
          quote_item_code: finalItemCode,
          quote_item_description: finalItemDesciption,
          quote_item_flag: "DT",
          quote_item_designer: quoteDesignerID,
          quote_item_shape_id: shapeID,
        });
      }

      const session = await mongoose.startSession();
      session.startTransaction();

      try {
        await QuotationItem.bulkWrite(
          [
            {
              deleteMany: {
                filter: { quote_master_id: quoteMasID },
              },
            },
            ...quoteItemsToInsert.map(item => ({
              insertOne: {
                document: item,
              },
            })),
          ],
          { session }
        );

        await session.commitTransaction();
        quoteItemSummary = await QuotationItem.aggregate(aggregationPipeline);
      } catch (error) {
        await session.abortTransaction();
        console.error(error);
        quoteItemSummary = await QuotationItem.aggregate(aggregationPipeline);
      } finally {
        session.endSession();
      }

      await RecalculateOverallQuotesTotalFn(quoteMasID);
      return quoteItemSummary;
    } catch (error) {
      logError("fetchQuotationFlashingsFromDesigntoolManually", error);
    }
  }
};

exports.designerDashboardQuotationList = async (req, res) => {
  try {
    let fullQuoteObj = {};
    const limit = 15;
    const page = Math.max(0, parseInt(req.query.page) || 0);
    const skip = page * limit;

    const searchKeyword = req.query.query;
    const searchFilter = {};
    if (searchKeyword) {
      searchFilter.$or = [{ quote_unique_id: { $regex: searchKeyword, $options: "i" } }];
    }

    const total_quote = await QuotationMaster.find({
      quote_flashing_checker: true,
      quote_design_stage: "0",
      $or: [{ quote_designed_person: { $exists: false } }, { quote_designed_person: null }],
      ...searchFilter,
    });
    let total_quote_count = total_quote.length;

    let quoteDetails = await QuotationMaster.aggregate([
      {
        $match: {
          quote_flashing_checker: true,
          quote_design_stage: "0",
          $or: [{ quote_designed_person: { $exists: false } }, { quote_designed_person: null }],
          ...searchFilter,
        },
      },
      { $lookup: { from: "accounts", as: "customerInfo", localField: "quote_customer_id", foreignField: "_id" } },
      { $lookup: { from: "accountcontacts", as: "customercontactInfo", localField: "quote_customer_contact_id", foreignField: "_id" } },
      { $unwind: { path: "$customerInfo", preserveNullAndEmptyArrays: true } },
      { $unwind: { path: "$customercontactInfo", preserveNullAndEmptyArrays: true } },
      {
        $project: {
          _id: 1,
          quote_unique_id: 1,
          quote_customer_id: 1,
          quote_delivery_date: 1,
          quote_delivery_date_str: 1,
          quote_delivery_time: 1,
          quote_delivery_session: 1,
          quote_far_suburb: 1,
          quote_delivery_address_mode: 1,
          quote_delivery_address: 1,
          quote_customer_PO_number: 1,
          quote_customer_contact_phone: 1,
          quote_customer_contact_email: 1,
          quote_site_delivery_attention_person: 1,
          quote_site_delivery_attention_contact: 1,
          quote_flashing_checker: 1,
          quote_status: 1,
          quote_Pieces: 1,
          quote_design_stage: 1,
          quote_store_delivery_address1: 1,
          quote_store_delivery_address2: 1,
          quote_store_delivery_city: 1,
          quote_store_delivery_country: 1,
          quote_store_delivery_postalcode: 1,
          quote_store_delivery_state: 1,
          quote_site_delivery_attention_person: 1,
          quote_site_delivery_attention_contact: 1,
          quote_site_delivery_address1: 1,
          quote_site_delivery_address2: 1,
          quote_site_delivery_city: 1,
          quote_site_delivery_country: 1,
          quote_site_delivery_postalcode: 1,
          quote_site_delivery_state: 1,
          created: 1,
          account_ID: "$customerInfo._id",
          account_UID: "$customerInfo.account_UID",
          account_Name: "$customerInfo.account_Name",
          account_Address: "$customerInfo.account_Address",
          account_StoreAddress: "$customerInfo.account_StoreAddress",
          account_Status: "$customerInfo.account_Status",
          account_DataRemoved: "$customerInfo.account_DataRemoved",
          created: "$customerInfo.created",
        },
      },
    ])
      .skip(skip)
      .limit(limit);
    let pages;
    if (total_quote_count <= limit) {
      pages = 0;
    } else {
      pages = Math.ceil(total_quote_count / limit);
    }
    fullQuoteObj.totalItems = total_quote_count;
    fullQuoteObj.fetchedItems = quoteDetails;
    fullQuoteObj.rowsPerPage = limit;
    fullQuoteObj.totalPages = pages;
    res.send(fullQuoteObj).status(200).end();
  } catch (err) {
    logError("designerDashboardQuotationList", err, req.user.user_ref_id);
    res.status(500).send("Data Fetching Failed");
  }
};

exports.assignQuotationToDesigner = async (req, res) => {
  try {
    const quoteID = new mongoose.Types.ObjectId(req.params.quotesid);
    let orderQuoteDetails = await QuotationMaster.findById(quoteID);

    if (orderQuoteDetails.quote_designed_person && mongoose.Types.ObjectId.isValid(orderQuoteDetails.quote_designed_person)) {
      res.status(500).send("Design Already Assigned. Please Refresh and Recheck");
    } else {
      const loggedUserID = new mongoose.Types.ObjectId(req.params.userid);
      let updateData = { $set: { quote_design_assigned_time: new Date().toISOString(), quote_designed_person: loggedUserID, quote_design_stage: "1" } };
      let conditions = { _id: quoteID };
      let quotedesigner = await QuotationMaster.findByIdAndUpdate(conditions, updateData, attrs);
      res.status(200).send("Data Assigned successfully");
      res.end();
    }
  } catch (err) {
    logError("assignQuotationToDesigner", err, req.user.user_ref_id);
    res.status(500).send("Data Assignation Failed");
  }
};

exports.specificDesignerQuotationList = async (req, res) => {
  try {
    let fullQuoteObj = {};
    const limit = 15;
    const page = req.query.page;
    const skip = page * limit;
    const userID = new mongoose.Types.ObjectId(req.user.user_ref_id);
    let total_quote = await QuotationMaster.find({ quote_flashing_checker: true, quote_designed_person: userID, $or: [{ quote_design_stage: "1" }, { quote_design_stage: "4" }] });
    let total_quote_count = total_quote.length;

    let quoteDetails = await QuotationMaster.aggregate([
      { $sort: { created: -1 } },
      {
        $match: {
          quote_flashing_checker: true,
          $or: [{ quote_design_stage: "1" }, { quote_design_stage: "4" }],
          quote_designed_person: userID,
        },
      },
      { $lookup: { from: "accounts", as: "customerInfo", localField: "quote_customer_id", foreignField: "_id" } },
      { $lookup: { from: "accountcontacts", as: "customercontactInfo", localField: "quote_customer_contact_id", foreignField: "_id" } },
      { $unwind: { path: "$customerInfo", preserveNullAndEmptyArrays: true } },
      { $unwind: { path: "$customercontactInfo", preserveNullAndEmptyArrays: true } },
      {
        $project: {
          _id: 1,
          quote_unique_id: 1,
          quote_customer_id: 1,
          quote_delivery_date: 1,
          quote_delivery_date_str: 1,
          quote_far_suburb: 1,
          quote_delivery_time: 1,
          quote_delivery_session: 1,
          quote_delivery_address_mode: 1,
          quote_delivery_address: 1,
          quote_customer_PO_number: 1,
          quote_customer_contact_phone: 1,
          quote_customer_contact_email: 1,
          quote_site_delivery_attention_person: 1,
          quote_site_delivery_attention_contact: 1,
          quote_flashing_checker: 1,
          quote_status: 1,
          quote_Pieces: 1,
          quote_designed_person: 1,
          quote_qc_status: 1,
          quote_qced_person: 1,
          quote_design_stage: 1,
          quote_store_delivery_address1: 1,
          quote_store_delivery_address2: 1,
          quote_store_delivery_city: 1,
          quote_store_delivery_country: 1,
          quote_store_delivery_postalcode: 1,
          quote_store_delivery_state: 1,
          quote_site_delivery_attention_person: 1,
          quote_site_delivery_attention_contact: 1,
          quote_site_delivery_address1: 1,
          quote_site_delivery_address2: 1,
          quote_site_delivery_city: 1,
          quote_site_delivery_country: 1,
          quote_site_delivery_postalcode: 1,
          quote_site_delivery_state: 1,
          created: 1,
          account_ID: "$customerInfo._id",
          account_UID: "$customerInfo.account_UID",
          account_Name: "$customerInfo.account_Name",
          account_Address: "$customerInfo.account_Address",
          account_StoreAddress: "$customerInfo.account_StoreAddress",
          account_Status: "$customerInfo.account_Status",
          account_DataRemoved: "$customerInfo.account_DataRemoved",
          // Removed overriding above created key
          // created: "$customerInfo.created",
        },
      },
    ])
      .skip(skip)
      .limit(limit);
    let pages;
    if (total_quote_count <= limit) {
      pages = 0;
    } else {
      pages = Math.ceil(total_quote_count / limit);
    }
    fullQuoteObj.totalItems = total_quote_count;
    fullQuoteObj.fetchedItems = quoteDetails;
    fullQuoteObj.rowsPerPage = limit;
    fullQuoteObj.totalPages = pages;
    res.send(fullQuoteObj).status(200).end();
  } catch (err) {
    logError("specificDesignerQuotationList", err, req.user.user_ref_id);
    res.status(500).send("Data Fetching Failed");
  }
};

exports.assignQuotationToQC = async (req, res) => {
  try {
    const quoteID = new mongoose.Types.ObjectId(req.params.quotesid);
    let orderQuoteDetails = await QuotationMaster.findById(quoteID);

    if (!orderQuoteDetails || !orderQuoteDetails.quote_designed_person || !mongoose.Types.ObjectId.isValid(orderQuoteDetails.quote_designed_person)) {
      res.status(500).send("Designer Not Yet Assigned or Invalid Designer ID. Please Refresh and Recheck");
    } else {
      let updateData = {
        $set: {
          quote_design_stage: "2",
          quote_design_completed_time: new Date().toISOString(),
          /*"quote_status": "QC InProgress"*/
        },
      };
      let conditions = { _id: quoteID };
      let quotedesigner = await QuotationMaster.findByIdAndUpdate(conditions, updateData, attrs);
      res.status(200).send("Data Assigned successfully");
      res.end();
    }
  } catch (err) {
    logError("assignQuotationToQC", err, req.user.user_ref_id);
    res.status(500).send("Data Assignation Failed");
  }
};

exports.qcDashboardQuotationList = async (req, res) => {
  try {
    let fullQuoteObj = {};
    const limit = 15;
    const page = Math.max(0, parseInt(req.query.page) || 0);
    const skip = page * limit;

    const searchKeyword = req.query.query;
    const searchFilter = {};
    if (searchKeyword) {
      searchFilter.$or = [{ quote_unique_id: { $regex: searchKeyword, $options: "i" } }];
    }

    const total_quote = await QuotationMaster.find({
      quote_flashing_checker: true,
      quote_design_stage: "2",
      ...searchFilter,
    });
    let total_quote_count = total_quote.length;

    let quoteDetails = await QuotationMaster.aggregate([
      { $sort: { created: -1 } },
      {
        $match: {
          quote_flashing_checker: true,
          quote_design_stage: "2",
          ...searchFilter,
        },
      },
      { $lookup: { from: "accounts", as: "customerInfo", localField: "quote_customer_id", foreignField: "_id" } },
      { $lookup: { from: "accountcontacts", as: "customercontactInfo", localField: "quote_customer_contact_id", foreignField: "_id" } },
      { $unwind: { path: "$customerInfo", preserveNullAndEmptyArrays: true } },
      { $unwind: { path: "$customercontactInfo", preserveNullAndEmptyArrays: true } },
      {
        $project: {
          _id: 1,
          quote_unique_id: 1,
          quote_customer_id: 1,
          quote_delivery_date: 1,
          quote_delivery_date_str: 1,
          quote_delivery_time: 1,
          quote_delivery_session: 1,
          quote_delivery_address_mode: 1,
          quote_delivery_address: 1,
          quote_customer_PO_number: 1,
          quote_customer_contact_phone: 1,
          quote_customer_contact_email: 1,
          quote_site_delivery_attention_person: 1,
          quote_site_delivery_attention_contact: 1,
          quote_flashing_checker: 1,
          quote_status: 1,
          quote_far_suburb: 1,
          quote_Pieces: 1,
          quote_design_stage: 1,
          created: 1,
          quote_store_delivery_address1: 1,
          quote_store_delivery_address2: 1,
          quote_store_delivery_city: 1,
          quote_store_delivery_country: 1,
          quote_store_delivery_postalcode: 1,
          quote_store_delivery_state: 1,
          quote_site_delivery_attention_person: 1,
          quote_site_delivery_attention_contact: 1,
          quote_site_delivery_address1: 1,
          quote_site_delivery_address2: 1,
          quote_site_delivery_city: 1,
          quote_site_delivery_country: 1,
          quote_site_delivery_postalcode: 1,
          quote_site_delivery_state: 1,
          account_ID: "$customerInfo._id",
          account_UID: "$customerInfo.account_UID",
          account_Name: "$customerInfo.account_Name",
          account_Address: "$customerInfo.account_Address",
          account_StoreAddress: "$customerInfo.account_StoreAddress",
          account_Status: "$customerInfo.account_Status",
          account_DataRemoved: "$customerInfo.account_DataRemoved",
          // created: "$customerInfo.created",
        },
      },
    ])
      .skip(skip)
      .limit(limit);
    let pages;
    if (total_quote_count <= limit) {
      pages = 0;
    } else {
      pages = Math.ceil(total_quote_count / limit);
    }
    fullQuoteObj.totalItems = total_quote_count;
    fullQuoteObj.fetchedItems = quoteDetails;
    fullQuoteObj.rowsPerPage = limit;
    fullQuoteObj.totalPages = pages;
    res.send(fullQuoteObj).status(200).end();
  } catch (err) {
    logError("qcDashboardQuotationList", err, req.user.user_ref_id);
    res.status(500).send("Data Fetching Failed");
  }
};

exports.assignQuotationToQCED = async (req, res) => {
  try {
    const quoteID = new mongoose.Types.ObjectId(req.params.quotesid);
    let orderQuoteDetails = await QuotationMaster.findById(quoteID);
    const loggedUserID = new mongoose.Types.ObjectId(req.params.userid);

    if (!orderQuoteDetails || !orderQuoteDetails.quote_designed_person || !mongoose.Types.ObjectId.isValid(orderQuoteDetails.quote_designed_person) || !orderQuoteDetails.quote_design_completed_time) {
      res.status(500).send("Designer Not Yet Assigned or Invalid Designer ID or Designer Not Yet Completed. Please Refresh and Recheck");
    } else {
      if (orderQuoteDetails.quote_qced_person && mongoose.Types.ObjectId.isValid(orderQuoteDetails.quote_qced_person)) {
        res.status(500).send("QC Already Assigned. Please Refresh and Recheck");
      } else {
        let updateData = { $set: { quote_qc_assigned_time: new Date().toISOString(), quote_qced_person: loggedUserID, quote_design_stage: "3" } };
        let conditions = { _id: quoteID };
        let quoteqcinfo = await QuotationMaster.findByIdAndUpdate(conditions, updateData, attrs);
        res.status(200).send("Data Assigned successfully");
        res.end();
      }
    }
  } catch (err) {
    logError("assignQuotationToQCED", err, req.user.user_ref_id);
    res.status(500).send("Data Assignation Failed");
  }
};

exports.specificQCQuotationList = async (req, res) => {
  try {
    let fullQuoteObj = {};
    const limit = 15;
    const page = req.query.page;
    const skip = page * limit;
    const userID = new mongoose.Types.ObjectId(req.user.user_ref_id);

    let total_quote = await QuotationMaster.find({ quote_flashing_checker: true, quote_qced_person: userID, quote_design_stage: "3" });
    let total_quote_count = total_quote.length;
    let quoteDetails = await QuotationMaster.aggregate([
      { $sort: { created: -1 } },
      {
        $match: {
          quote_flashing_checker: true,
          quote_design_stage: "3",
          quote_qced_person: userID,
        },
      },
      { $lookup: { from: "accounts", as: "customerInfo", localField: "quote_customer_id", foreignField: "_id" } },
      { $lookup: { from: "accountcontacts", as: "customercontactInfo", localField: "quote_customer_contact_id", foreignField: "_id" } },
      { $unwind: { path: "$customerInfo", preserveNullAndEmptyArrays: true } },
      { $unwind: { path: "$customercontactInfo", preserveNullAndEmptyArrays: true } },
      {
        $project: {
          _id: 1,
          quote_unique_id: 1,
          quote_customer_id: 1,
          quote_delivery_date: 1,
          quote_delivery_date_str: 1,
          quote_delivery_time: 1,
          quote_delivery_session: 1,
          quote_far_suburb: 1,
          quote_delivery_address_mode: 1,
          quote_delivery_address: 1,
          quote_customer_PO_number: 1,
          quote_customer_contact_phone: 1,
          quote_customer_contact_email: 1,
          quote_site_delivery_attention_person: 1,
          quote_site_delivery_attention_contact: 1,
          quote_flashing_checker: 1,
          quote_status: 1,
          quote_Pieces: 1,
          quote_qced_person: 1,
          quote_design_stage: 1,
          quote_store_delivery_address1: 1,
          quote_store_delivery_address2: 1,
          quote_store_delivery_city: 1,
          quote_store_delivery_country: 1,
          quote_store_delivery_postalcode: 1,
          quote_store_delivery_state: 1,
          quote_site_delivery_attention_person: 1,
          quote_site_delivery_attention_contact: 1,
          quote_site_delivery_address1: 1,
          quote_site_delivery_address2: 1,
          quote_site_delivery_city: 1,
          quote_site_delivery_country: 1,
          quote_site_delivery_postalcode: 1,
          quote_site_delivery_state: 1,
          created: 1,
          account_ID: "$customerInfo._id",
          account_UID: "$customerInfo.account_UID",
          account_Name: "$customerInfo.account_Name",
          account_Address: "$customerInfo.account_Address",
          account_StoreAddress: "$customerInfo.account_StoreAddress",
          account_Status: "$customerInfo.account_Status",
          account_DataRemoved: "$customerInfo.account_DataRemoved",
          created: "$customerInfo.created",
        },
      },
    ])
      .skip(skip)
      .limit(limit);
    let pages;
    if (total_quote_count <= limit) {
      pages = 0;
    } else {
      pages = Math.ceil(total_quote_count / limit);
    }
    fullQuoteObj.totalItems = total_quote_count;
    fullQuoteObj.fetchedItems = quoteDetails;
    fullQuoteObj.rowsPerPage = limit;
    fullQuoteObj.totalPages = pages;
    res.send(fullQuoteObj).status(200).end();
  } catch (err) {
    logError("specificQCQuotationList", err, req.user.user_ref_id);
    res.status(500).send("Data Fetching Failed");
  }
};

exports.qcFailedQuotationListMark = async (req, res) => {
  try {
    const quoteID = new mongoose.Types.ObjectId(req.body.quoteID);
    const loggedUserID = new mongoose.Types.ObjectId(req.user.user_ref_id);

    let quoteMasterDetails = await QuotationMaster.find({ _id: quoteID });
    let quoteMasUniqueID = quoteMasterDetails[0].quote_unique_id;
    let errorShapeIds = req.body.shapeIDs;
    let quoteErrorLog = new QuoteErrorLogTable({
      def_Quote_Mas_Id: quoteID,
      def_Quote_Mas_Unique_Id: quoteMasUniqueID,
      def_User_Id: loggedUserID,
      def_Design_Shape_Id: errorShapeIds,
    });
    let quoteerrorlogdetails = await quoteErrorLog.save();
    if (quoteerrorlogdetails) {
      let updateData = { $set: { quote_design_stage: "4", quote_qced_person: null } };
      let conditions = { _id: quoteID };
      await QuotationMaster.findByIdAndUpdate(conditions, updateData, attrs);
    }
    res.send(quoteerrorlogdetails).status(200).end();
    res.end();
  } catch (err) {
    logError("qcFailedQuotationListMark", err, req.user.user_ref_id);
    res.status(500).send("Data Fetching Failed");
  }
};

exports.qcFailedQuotationShapeiList = async (req, res) => {
  try {
    const quoteID = new mongoose.Types.ObjectId(req.params.quotesid);
    let defectShapeIDs = await QuoteErrorLogTable.aggregate([
      { $sort: { def_created: -1 } },
      { $match: { $and: [{ def_Quote_Mas_Id: quoteID }] } },
      { $lookup: { from: "users", as: "usersInfo", localField: "def_User_Id", foreignField: "_id" } },
      { $unwind: { path: "$usersInfo", preserveNullAndEmptyArrays: true } },
      {
        $project: {
          _id: 1,
          def_Quote_Mas_Id: 1,
          def_Quote_Mas_Unique_Id: 1,
          def_User_Id: 1,
          def_Design_Shape_Id: 1,
          def_created: 1,
          def_qced_person: {
            $concat: ["$usersInfo.user_firstName", " ", "$usersInfo.user_lastName"],
          },
        },
      },
    ]);
    res.send(defectShapeIDs).status(200).end();
  } catch (err) {
    logError("qcFailedQuotationShapeiList", err, req.user.user_ref_id);
    res.status(500).send("Data Fetching Failed");
  }
};

exports.assignQuotationReadyToMYOB = async (req, res) => {
  try {
    const quoteID = new mongoose.Types.ObjectId(req.params.quotesid);
    let orderQuoteDetails = await QuotationMaster.findById(quoteID);
    let QuoteDept = req.params.dept;

    if ((QuoteDept === "F" && mongoose.Types.ObjectId.isValid(orderQuoteDetails.quote_designed_person) && mongoose.Types.ObjectId.isValid(orderQuoteDetails.quote_qced_person)) || QuoteDept !== "F") {
      let updateData;
      if (QuoteDept === "F") {
        updateData = {
          $set: {
            f_quote_prod_push_status: "2",
            quote_design_stage: "5",
            quote_qc_completed_time: new Date().toISOString(),
          },
        };
      }
      if (QuoteDept === "FG") {
        updateData = {
          $set: {
            fg_quote_prod_push_status: "2",
          },
        };
      }
      if (QuoteDept === "CL") {
        updateData = {
          $set: {
            cl_quote_prod_push_status: "2",
          },
        };
      }
      if (QuoteDept === "J") {
        updateData = {
          $set: {
            j_quote_prod_push_status: "2",
          },
        };
      }
      if (QuoteDept === "ROOF") {
        updateData = {
          $set: {
            roof_quote_prod_push_status: "2",
          },
        };
      }
      if (QuoteDept === "GBI") {
        updateData = {
          $set: {
            gbi_quote_prod_push_status: "2",
          },
        };
      }

      const conditions = { _id: quoteID };
      const quotestatus = await QuotationMaster.findByIdAndUpdate(conditions, updateData, attrs);
      if (!quotestatus) {
        return res.status(500).send("Quotation not found.");
      } else {
        await checkIndividualQuoteStatus(req.params.quotesid);
      }
      res.status(200).send("Quotation QC Completed");
    } else {
      return res.status(500).send("Designer Or QC Assignation Mismatch. Please Refresh and Recheck.");
    }
  } catch (err) {
    logError("assignQuotationReadyToMYOB", err, req.user.user_ref_id);
    res.status(500).send("Data Assignation Failed");
  }
};

async function checkIndividualQuoteStatus(quoteid) {
  const quoteID = new mongoose.Types.ObjectId(quoteid);
  let QuoteMasDetails = await QuotationMaster.find({ _id: quoteID });
  let OverallQuoteStatus;
  let updateData;

  if (QuoteMasDetails[0].f_quote_prod_push_status === 0 && QuoteMasDetails[0].fg_quote_prod_push_status === 0 && QuoteMasDetails[0].cl_quote_prod_push_status === 0 && QuoteMasDetails[0].j_quote_prod_push_status === 0 && QuoteMasDetails[0].roof_quote_prod_push_status === 0 && QuoteMasDetails[0].gbi_quote_prod_push_status === 0 && QuoteMasDetails[0].gbil_quote_prod_push_status === 0) {
    updateData = {
      $set: {
        quote_qc_status: 0,
        quote_status: "Quotation Created",
      },
    };
    const conditions = { _id: quoteID };
    await QuotationMaster.findByIdAndUpdate(conditions, updateData, attrs);
    OverallQuoteStatus = "Quote Master Status Changed To 0";
  } else {
    if (
      (QuoteMasDetails[0].f_quote_prod_push_status === 0 || QuoteMasDetails[0].f_quote_prod_push_status === 2) &&
      (QuoteMasDetails[0].fg_quote_prod_push_status === 0 || QuoteMasDetails[0].fg_quote_prod_push_status === 2) &&
      (QuoteMasDetails[0].cl_quote_prod_push_status === 0 || QuoteMasDetails[0].cl_quote_prod_push_status === 2) &&
      (QuoteMasDetails[0].j_quote_prod_push_status === 0 || QuoteMasDetails[0].j_quote_prod_push_status === 2) &&
      (QuoteMasDetails[0].roof_quote_prod_push_status === 0 || QuoteMasDetails[0].roof_quote_prod_push_status === 2) &&
      (QuoteMasDetails[0].gbi_quote_prod_push_status === 0 || QuoteMasDetails[0].gbi_quote_prod_push_status === 2) &&
      (QuoteMasDetails[0].gbil_quote_prod_push_status === 0 || QuoteMasDetails[0].gbil_quote_prod_push_status === 1 || QuoteMasDetails[0].gbil_quote_prod_push_status === 2)
    ) {
      updateData = {
        $set: {
          quote_qc_status: 5,
          quote_status: "Quote Ready",
        },
      };
      const conditions = { _id: quoteID };
      await QuotationMaster.findByIdAndUpdate(conditions, updateData, attrs);
      OverallQuoteStatus = "Quote Master Status Changed To 4";
    } else {
      OverallQuoteStatus = "Some Quotation Job Pending For Production Push";
      updateData = {
        $set: {
          quote_qc_status: 4,
          quote_status: "Quotation In Progress",
        },
      };
      const conditions = { _id: quoteID };
      await QuotationMaster.findByIdAndUpdate(conditions, updateData, attrs);
    }
  }
  return OverallQuoteStatus;
}

exports.fetchQuotationItemToOrder = async (req, res) => {
  try {
    let QuotationDetails = await QuotationMaster.find();
    res.status(200).send(QuotationDetails).end();
  } catch (err) {
    logError("fetchQuotationItemToOrder", err, req.user.user_ref_id);
    res.status(500).send("Data Fetching Failed");
  }
};

exports.fetchQuoteFullUserTracking = async (req, res) => {
  try {
    let quoteID = new mongoose.Types.ObjectId(req.params.quoteid);
    let quoteDetails = await QuotationMaster.aggregate([
      { $match: { _id: quoteID } },
      { $lookup: { from: "accounts", as: "customerInfo", localField: "quote_customer_id", foreignField: "_id" } },
      { $lookup: { from: "accountcontacts", as: "customercontactInfo", localField: "quote_customer_contact_id", foreignField: "_id" } },
      { $lookup: { from: "departments", as: "departments", localField: "quote_department", foreignField: "_id" } },
      { $lookup: { from: "users", as: "userdesigner", localField: "quote_designed_person", foreignField: "_id" } },
      { $lookup: { from: "users", as: "userqc", localField: "quote_qced_person", foreignField: "_id" } },
      { $lookup: { from: "users", as: "usercreator", localField: "quote_created_person", foreignField: "_id" } },
      { $unwind: { path: "$customerInfo", preserveNullAndEmptyArrays: true } },
      { $unwind: { path: "$customercontactInfo", preserveNullAndEmptyArrays: true } },
      { $unwind: { path: "$departments", preserveNullAndEmptyArrays: true } },
      { $unwind: { path: "$userdesigner", preserveNullAndEmptyArrays: true } },
      { $unwind: { path: "$userqc", preserveNullAndEmptyArrays: true } },
      { $unwind: { path: "$usercreator", preserveNullAndEmptyArrays: true } },
      {
        $project: {
          _id: 1,
          quote_unique_id: 1,
          quote_customer_id: 1,
          quote_delivery_date: 1,
          quote_delivery_address_mode: 1,
          quote_delivery_address: 1,
          quote_customer_contact_id: 1,
          quote_customer_PO_number: 1,
          quote_design_assigned_time: 1,
          quote_design_completed_time: 1,
          quote_qc_assigned_time: 1,
          quote_qc_completed_time: 1,
          quote_Pieces: 1,
          quote_status: 1,
          created: 1,
          account_ID: "$customerInfo._id",
          account_UID: "$customerInfo.account_UID",
          account_Name: "$customerInfo.account_Name",
          account_Address: "$customerInfo.account_Address",
          account_StoreAddress: "$customerInfo.account_StoreAddress",
          account_Contact_Email: "$customercontactInfo.account_Contact_Email",
          account_Contact_Phone: "$customercontactInfo.account_Contact_Phone",
          account_Contact_Name: { $concat: ["$customercontactInfo.account_Contact_FName", " ", "$customercontactInfo.account_Contact_LName"] },
          departments: "$departments.department_name",
          designer_Name: { $concat: ["$userdesigner.user_firstName", " ", "$userdesigner.user_lastName"] },
          qc_Name: { $concat: ["$userqc.user_firstName", " ", "$userqc.user_lastName"] },
          creator_Name: { $concat: ["$usercreator.user_firstName", " ", "$usercreator.user_lastName"] },
        },
      },
    ]);
    res.send(quoteDetails).status(200).end();
  } catch (err) {
    logError("fetchQuoteFullUserTracking", err, req.user.user_ref_id);
    res.status(500).send("Data Fetching Failed");
  }
};

exports.fetchOrderRackingDetails = async (req, res) => {
  try {
    let OrderID = req.query.orderId;
    let orderMasterInfo = await OrderMaster.aggregate([
      { 
        $match: {
          $expr: {
            $or: [
              { $eq: ["$order_unique_id", OrderID] },
              {
                $and: [
                  { $eq: ["$order_customer_UID", AWF_CUST_ID] },
                  { $eq: [{ $substr: ["$order_customer_PO_number", 0, 6] }, OrderID] }
                ]
              }
            ]
          }
        }
      }
    ]);
    let status = orderMasterInfo[0]?.order_status;
    if (status === "Order Cancelled") {
      return res.status(500).send("Cancelled Order. Please Recheck");
    }
    const escapedKeyword = OrderID.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    let OrdMasDetails = await OrderMaster.aggregate([
      { $match: { $and: [
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
                  { $eq: [{ $substrBytes: ["$order_customer_PO_number", 0, 6] }, OrderID] }
                ]
              }
            ] } }
        ] }},
      { $lookup: { from: "accounts", as: "customerInfo", localField: "order_customer_id", foreignField: "_id" } },
      { $lookup: { from: "accountcontacts", as: "customercontactInfo", localField: "order_customer_contact_id", foreignField: "_id" } },
      { $lookup: { from: "orderssubitemcounts", as: "orderssubitemcountsInfo", localField: "_id", foreignField: "Order_Mas_Id" } },
      { $lookup: { from: "rackings", as: "frackingsInfo", localField: "f_order_racking_table", foreignField: "_id" } },
      { $lookup: { from: "rackings", as: "fgrackingsInfo", localField: "fg_order_racking_table", foreignField: "_id" } },
      { $lookup: { from: "rackings", as: "clrackingsInfo", localField: "cl_order_racking_table", foreignField: "_id" } },
      { $lookup: { from: "rackings", as: "jrackingsInfo", localField: "j_order_racking_table", foreignField: "_id" } },
      { $lookup: { from: "rackings", as: "gbirackingsInfo", localField: "gbi_order_racking_table", foreignField: "_id" } },
      { $lookup: { from: "rackings", as: "roofrackingsInfo", localField: "roof_order_racking_table", foreignField: "_id" } },
      { $unwind: { path: "$customerInfo", preserveNullAndEmptyArrays: true } },
      { $unwind: { path: "$customercontactInfo", preserveNullAndEmptyArrays: true } },
      { $unwind: { path: "$orderssubitemcountsInfo", preserveNullAndEmptyArrays: true } },
      { $unwind: { path: "$frackingsInfo", preserveNullAndEmptyArrays: true } },
      { $unwind: { path: "$fgrackingsInfo", preserveNullAndEmptyArrays: true } },
      { $unwind: { path: "$clrackingsInfo", preserveNullAndEmptyArrays: true } },
      { $unwind: { path: "$jrackingsInfo", preserveNullAndEmptyArrays: true } },
      { $unwind: { path: "$gbirackingsInfo", preserveNullAndEmptyArrays: true } },
      { $unwind: { path: "$roofrackingsInfo", preserveNullAndEmptyArrays: true } },
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
          order_store_delivery_city: 1,
          order_store_delivery_address2: 1,
          order_store_delivery_address1: 1,
          order_store_delivery_country: 1,
          order_store_delivery_postalcode: 1,
          order_store_delivery_state: 1,
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
          order_status: 1,
          order_Pieces: 1,
          order_master_rack: 1,
          order_qc_status: 1,
          order_flashing_checker: 1,
          f_order_racking_dimension1: 1,
          f_order_racking_dimension2: 1,
          fg_order_racking_dimension1: 1,
          fg_order_racking_dimension2: 1,
          j_order_racking_dimension1: 1,
          j_order_racking_dimension2: 1,
          cl_order_racking_dimension1: 1,
          cl_order_racking_dimension2: 1,
          gbi_order_racking_dimension1: 1,
          gbi_order_racking_dimension2: 1,
          roof_order_racking_dimension1: 1,
          roof_order_racking_dimension2: 1,
          created: 1,
          account_ID: "$customerInfo._id",
          account_UID: "$customerInfo.account_UID",
          account_Name: "$customerInfo.account_Name",
          account_Address_line_one: "$customerInfo.account_Address_line_one",
          account_Address_line_two: "$customerInfo.account_Address_line_two",
          account_Address_Country: "$customerInfo.account_Address_Country",
          account_Address_State: "$customerInfo.account_Address_State",
          account_Address_City: "$customerInfo.account_Address_City",
          account_Address_PostalCode: "$customerInfo.account_Address_PostalCode",
          account_Address_Phone: "$customerInfo.account_Address_Phone",
          account_Address_Email: "$customerInfo.account_Address_Email",
          account_StoreAddress: "$customerInfo.account_StoreAddress",
          account_Status: "$customerInfo.account_Status",
          account_Contact_Email: "$customercontactInfo.account_Contact_Email",
          account_Contact_Phone: "$customercontactInfo.account_Contact_Phone",
          account_Contact_FName: "$customercontactInfo.account_Contact_FName",
          Order_Flashing_Count: "$orderssubitemcountsInfo.Order_Flashing_Count",
          Order_Jobbing_Count: "$orderssubitemcountsInfo.Order_Jobbing_Count",
          Order_Cladding_Count: "$orderssubitemcountsInfo.Order_Cladding_Count",
          Order_Faciagutter_Count: "$orderssubitemcountsInfo.Order_Faciagutter_Count",
          Order_Roofing_Count: "$orderssubitemcountsInfo.Order_Roofing_Count",
          Order_GBI_Count: "$orderssubitemcountsInfo.Order_GBI_Count",
          f_order_racking_table: "$frackingsInfo.rack_name",
          fg_order_racking_table: "$fgrackingsInfo.rack_name",
          cl_order_racking_table: "$clrackingsInfo.rack_name",
          j_order_racking_table: "$jrackingsInfo.rack_name",
          gbi_order_racking_table: "$gbirackingsInfo.rack_name",
          roof_order_racking_table: "$roofrackingsInfo.rack_name",
        },
      },
    ]);
    if (OrdMasDetails.length > 0) {
      res.send(OrdMasDetails).status(200).end();
    } else {
      return res.status(500).send("No SaleOrder Found!!!");
    }
  } catch (err) {
    console.log(err)
    logError("fetchOrderRackingDetails", err, req.user.user_ref_id);
    res.status(500).send("Data Fetching Failed.");
  }
};

exports.updateOrderDepartmentRackDetails = async (req, res) => {
  try {
    let OrderID = req.query.OrderID;
    let Department = req.query.Dept;
    let MasterRack = req.query.MRack;
    let SubRack = req.query.SRack;
    let updateData;
    let OrdMasDetails = await OrderMaster.aggregate([
      { 
        $match: {
          $expr: {
            $or: [
              { $eq: ["$order_unique_id", OrderID] },
              {
                $and: [
                  { $eq: ["$order_customer_UID", AWF_CUST_ID] },
                  { $eq: [{ $substr: ["$order_customer_PO_number", 0, 6] }, OrderID] }
                ]
              }
            ]
          }
        }
      }
    ]);
    const loggedUserID = new mongoose.Types.ObjectId(req.user.user_ref_id);

    if (!OrdMasDetails.length) {
      return res.status(500).send("Order not found");
    }

    let OrdUid = OrdMasDetails[0].order_unique_id;
    let OrdObjid = new mongoose.Types.ObjectId(OrdMasDetails[0]._id);
    if (MasterRack) {
      let updateMRackData = {
        $set: {
          order_master_rack: MasterRack,
        },
      };
      await OrderMaster.findByIdAndUpdate(OrdObjid, updateMRackData);
    }

    if (SubRack) {
      switch (Department) {
        case "F":
          if (OrdMasDetails[0].f_order_racking_table) {
            updateData = { $set: { f_order_racking_table: SubRack, f_order_racking_user: loggedUserID } };
          } else {
            return res.status(500).send("No Racks Found For " + OrdUid + " Flashing! Please check the Racking Data");
          }
          break;
        case "J":
          if (OrdMasDetails[0].j_order_racking_table) {
            updateData = { $set: { j_order_racking_table: SubRack, j_order_racking_user: loggedUserID } };
          } else {
            return res.status(500).send("No Racks Found For " + OrdUid + " Jobbing! Please check the Racking Data");
          }
          break;
        case "CL":
          if (OrdMasDetails[0].cl_order_racking_table) {
            updateData = { $set: { cl_order_racking_table: SubRack, cl_order_racking_user: loggedUserID } };
          } else {
            return res.status(500).send("No Racks Found For " + OrdUid + " Cladding! Please check the Racking Data");
          }
          break;
        case "FG":
          if (OrdMasDetails[0].fg_order_racking_table) {
            updateData = { $set: { fg_order_racking_table: SubRack, fg_order_racking_user: loggedUserID } };
          } else {
            return res.status(500).send("No Racks Found For " + OrdUid + " Fascia Gutter! Please check the Racking Data");
          }
          break;
        case "GBI":
          if (OrdMasDetails[0].gbi_order_racking_table) {
            updateData = { $set: { gbi_order_racking_table: SubRack, gbi_order_racking_user: loggedUserID } };
          } else {
            return res.status(500).send("No Racks Found For " + OrdUid + " GBI! Please check the Racking Data");
          }
          break;
        case "ROOF":
          if (OrdMasDetails[0].roof_order_racking_table) {
            updateData = { $set: { roof_order_racking_table: SubRack, roof_order_racking_user: loggedUserID } };
          } else {
            return res.status(500).send("No Racks Found For " + OrdUid + " Roofing! Please check the Racking Data");
          }
          break;
        default:
          return res.status(500).send("Invalid Department");
      }
      await OrderMaster.findByIdAndUpdate(OrdObjid, updateData);
      await OrderUserJobsCount.updateOne(
        {
          Order_Id: OrdObjid,
          Order_Dept_Code: Department,
          Order_SubDept_Status: "6",
        },
        { $set: { Order_User_Id: loggedUserID } }
      );
    }
    res.status(200).send("RackMaster Details Updated For " + OrdUid);
  } catch (error) {
    logError("updateOrderDepartmentRackDetails", error, req.user.user_ref_id);
    res.status(500).send("Data Updation Failed.");
  }
};

exports.updateOrderDepartmentRackDetailsCustom = async (req, res) => {
  try {
    const { OrderID, Dept: Department, SRack: SubRack } = req.query;
    let orderMasterInfo = await OrderMaster.findOne({ order_unique_id: OrderID });
    let status = orderMasterInfo.order_status;
    if (status === "Order Cancelled") {
      return res.status(500).send("Cancelled Order. Please Recheck");
    }

    if (!SubRack) return res.status(500).send("SubRack is required");
    const OrdMasDetails = await OrderMaster.findOne({ order_unique_id: OrderID });
    if (!OrdMasDetails) return res.status(500).send("Order not found");

    const loggedUserID = new mongoose.Types.ObjectId(req.user.user_ref_id);
    const OrdObjid = new mongoose.Types.ObjectId(OrdMasDetails._id);
    let addflag = 0;
    const deptMap = {
      F: "f",
      J: "j",
      CL: "cl",
      FG: "fg",
      GBI: "gbi",
      ROOF: "roof",
    };

    const deptPrefix = deptMap[Department];
    if (!deptPrefix) return res.status(500).send("Invalid Department");

    const rackingField = `${deptPrefix}_order_racking_table`;
    const currentTime = new Date().toISOString();

    let updateData;
    if (OrdMasDetails[rackingField]) {
      updateData = {
        $set: {
          [rackingField]: SubRack,
          [`${deptPrefix}_order_racking_start_time`]: currentTime,
          [`${deptPrefix}_order_racking_user`]: loggedUserID,
          [`${deptPrefix}_order_racking_end_time`]: currentTime,
        },
      };
      await OrderUserJobsCount.updateOne(
        {
          Order_Id: OrdObjid,
          Order_Dept_Code: Department,
          Order_SubDept_Status: "6",
        },
        { $set: { Order_User_Id: loggedUserID } }
      );
    } else {
      addflag = 1;
      updateData = {
        $set: {
          [`${deptPrefix}_order_racking_start_time`]: currentTime,
          [`${deptPrefix}_order_racking_user`]: loggedUserID,
          [`${deptPrefix}_order_racking_end_time`]: currentTime,
          [`${deptPrefix}_order_prod_current_status`]: "6",
          [rackingField]: SubRack,
        },
      };
    }

    await OrderMaster.findByIdAndUpdate(OrdObjid, updateData);
    if (addflag === 1) {
      const orderMasCount = await OrderItemsCount.findOne({ Order_Mas_Id: OrdObjid });
      if (!orderMasCount) return res.status(500).send("Order items count not found");

      const jobCountField = {
        FG: "Order_Faciagutter_Count",
        CL: "Order_Cladding_Count",
        J: "Order_Jobbing_Count",
        F: "Order_Flashing_Count",
        GBI: "Order_GBI_Count",
        ROOF: "Order_Roofing_Count",
      }[Department];

      const jobCount = orderMasCount[jobCountField];

      const userJobEntry = new OrderUserJobsCount({
        Order_Id: OrdObjid,
        Order_UId: OrdMasDetails.order_unique_id,
        Order_User_Id: loggedUserID,
        Order_Dept_Code: Department,
        Order_SubDept_Status: "6",
        Order_Job_Count: jobCount,
      });

      await userJobEntry.save();
    } else {
      console.log("Racking Updated. User Jobs Count Not Added");
    }
    res.status(200).send(`RackMaster Details Updated For ${computeOrderFields(OrdMasDetails).order_unique_id}`);
  } catch (error) {
    logError("updateOrderDepartmentRackDetailsCustom", error, req.user.user_ref_id);
    res.status(500).send("Data Updation Failed.");
  }
};

exports.fetchOrderLineitemsDetails = async (req, res) => {
  try {
    let orderID = new mongoose.Types.ObjectId(req.params.orderid);
    const orderDetails = [];

    let ordMaster = await OrderMaster.findOne({ _id: orderID });
    if (!ordMaster) {
      return res.status(500).send({ error: "Order not found" }).end();
    }

    let FlashingFlag = ordMaster.order_flashing_checker;
    let orderItems = [];
    let orderItemsCustom = [];

    //Code change by Rahul made f_order_prod_push_status === 2 to f_order_prod_push_status === 1
    if (ordMaster.f_order_prod_push_status === 1 || ordMaster.f_order_prod_push_status === 2) {
      //Code change by Rahul
      orderItems = await OrderItem.aggregate([
        { $match: { order_master_id: orderID } },
        { $sort: { order_row_index: 1 } },
        { $lookup: { from: "coreproducts", as: "materialsInfo", localField: "order_item_material", foreignField: "_id" } },
        { $lookup: { from: "productcolors", as: "colorInfo", localField: "order_item_color", foreignField: "_id" } },
        { $lookup: { from: "productgirths", as: "girthInfo", localField: "order_item_round_grith", foreignField: "_id" } },
        { $lookup: { from: "productfolds", as: "foldInfo", localField: "order_item_fold", foreignField: "_id" } },
        { $unwind: { path: "$materialsInfo", preserveNullAndEmptyArrays: true } },
        { $unwind: { path: "$colorInfo", preserveNullAndEmptyArrays: true } },
        { $unwind: { path: "$girthInfo", preserveNullAndEmptyArrays: true } },
        { $unwind: { path: "$foldInfo", preserveNullAndEmptyArrays: true } },
        {
          $project: {
            _id: 1,
            order_master_id: 1,
            order_unique_id: 1,
            order_item_unique_id: 1,
            order_item_exact_grith: 1,
            order_item_exact_fold: 1,
            order_item_price: { $round: [{ $toDouble: "$order_item_price" }, 2] },
            order_item_qty_price: { $round: [{ $toDouble: "$order_item_qty_price" }, 2] },
            order_item_special_price: {$round: [{ $toDouble: "$order_item_special_price" }, 2] },
            order_item_special_price_original: { $round: [{ $toDouble: "$order_item_special_price_original" }, 2] },
            order_item_discount: 1,
            order_item_discounted_amount: { $round: [{ $toDouble: "$order_item_discounted_amount" }, 2] },
            order_item_qty_discounted_price: { $round: [{ $toDouble: "$order_item_qty_discounted_price" }, 2] },
            order_item_code: 1,
            order_item_description: 1,
            order_item_quantity: 1,
            order_item_pieces: 1,
            order_item_length: 1,
            order_item_flag: 1,
            order_item_designer: 1,
            order_item_shape_id: 1,
            order_row_index: 1,
            order_item_remake: 1,
            core_Product_Name: "$materialsInfo.core_Product_Name",
            core_Product_Thickness: "$materialsInfo.core_Product_Thickness",
            core_Product_Ref_Id: "$materialsInfo.core_Product_Ref_Id",
            product_Color: "$colorInfo.product_Color",
            product_Color_Hex_Code: "$colorInfo.product_Color_Hex_Code",
            product_Color_Special_Price: "$colorInfo.product_Color_Special_Price",
            product_Girth: "$girthInfo.product_Girth",
            product_Fold: "$foldInfo.product_Fold",
            created: 1
          },
        },
      ]);
      // If all order_row_index are the same, sort by created
      if (orderItems.length > 1 && orderItems.every(item => item.order_row_index === orderItems[0].order_row_index)) {
        orderItems.sort((a, b) => new Date(a.created) - new Date(b.created));
      }
  }

    orderItemsCustom = await OrderItemManual.aggregate([
      { $match: { order_master_me_id: orderID } },
      { $sort: { order_row_index: 1 } },
      { $lookup: { from: "departments", as: "departments", localField: "order_item_me_department", foreignField: "_id" } },
      { $unwind: { path: "$departments", preserveNullAndEmptyArrays: true } },
      {
        $project: {
          _id: 1,
          order_item_me_flag: 1,
          order_master_me_id: 1,
          order_unique_me_id: 1,
          order_item_unique_me_id: 1,
          order_item_me_material: 1,
          order_item_me_color: 1,
          order_item_exact_me_grith: 1,
          order_item_round_me_grith: 1,
          order_item_me_fold: 1,
          order_item_me_thickness: 1,
          order_item_me_length: 1,
          order_item_me_uom: 1,
          order_item_me_uom_value: 1,
          order_item_me_quantity: 1,
          order_item_me_pieces: 1,
          order_item_me_price: { $round: [{ $toDouble: "$order_item_me_price" }, 2] },
          order_item_qty_me_price: { $round: [{ $toDouble: "$order_item_qty_me_price" }, 2] },
          order_item_special_me_price: { $round: [{ $toDouble: "$order_item_special_me_price" }, 2] },
          order_item_special_me_price_original: { $round: [{ $toDouble: "$order_item_special_me_price_original" }, 2] },
          order_item_me_discount: 1,
          order_item_me_discounted_amount: { $round: [{ $toDouble: "$order_item_me_discounted_amount" }, 2] },
          order_item_qty_me_discounted_price: { $round: [{ $toDouble: "$order_item_qty_me_discounted_price" }, 2] },
          order_item_me_code: 1,
          order_item_me_description: 1,
          order_item_me_flag: 1,
          order_item_me_department: 1,
          created: 1,
          order_row_index: 1,
          order_item_me_remake: 1,
          departments: "$departments.department_name",
        },
      },
    ]);

    const orderNumber = ordMaster.order_unique_id;
    const templates = await Template.find({ orderNumber});
    if (templates.length === 0) {
      const combinedItems = [...orderItems, ...orderItemsCustom];
      combinedItems.sort((a, b) => a.order_row_index - b.order_row_index);
      return res.send(combinedItems).status(200).end();
    }

    const jobIdCount = templates?.reduce((acc, item) => {
      return acc + (item?.swiJobIds?.length || 0);
    }, 0);
    console.log("Total Job IDs count from templates:", jobIdCount, "for order:", orderItems?.length);
    if (orderItems?.length !== jobIdCount && ordMaster?.order_flashing_checker) {
      console.log("Mismatch in order items and job IDs count. Fetching sub-items from design tool.");
      logError("fetchOrderLineitemsDetails", new Error(`Mismatch in order items and job IDs count for order ${orderNumber}`), req.user.user_ref_id);
      orderItems = await fetchOrderSubItemsFromDesignToolFn(orderID, templates);
      if (orderItems?.errorMessage) {
        console.error("Error fetching sub-items from design tool:", orderItems.errorMessage);
        return res.status(500).send(orderItems.errorMessage);
      }
    }

    const combinedItems = [ ...(orderItems || []), ...(orderItemsCustom || []) ];
    combinedItems.sort((a, b) => a.order_row_index - b.order_row_index);
    res.status(200).send(combinedItems).end();
  } catch (err) {
    logError("fetchOrderLineitemsDetails", err, req.user.user_ref_id);
    res.status(500).send("Data Fetching Failed");
  }
};

exports.updateDraggedOrderLineitems = async (req, res) => {
  try {
    let lineitems = req.body;
    const lineitemscount = lineitems.lineItems.length;
    let updateData;
    let dept;
    let objID;
    for (let i = 0; i < lineitemscount; i++) {
      dept = lineitems.lineItems[i].order_item_flag;
      objID = new mongoose.Types.ObjectId(lineitems.lineItems[i]._id);

      if (dept === "DT") {
        updateData = { $set: { order_row_index: i } };
        await OrderItem.findByIdAndUpdate(objID, updateData);
      }
      if (dept === "ME") {
        updateData = { $set: { order_row_index: i } };
        await OrderItemManual.findByIdAndUpdate(objID, updateData);
      }
    }
    res.status(200).send({ message: "Line items processed successfully" }).end();
  } catch (err) {
    logError("updateDraggedOrderLineitems", err, req.user.user_ref_id);
    res.status(500).send("Data Updation Failed");
  }
};

function generateCookie(aspxAuthValue) {
  const sessionId = uuidv4();
  const requestId = uuidv4().replace(/-/g, "").toUpperCase();
  const cookie = `.ASPXAUTH=${aspxAuthValue}; ASP.NET_SessionId=${sessionId}; UserBranch=1; requestid=${requestId};`;
  return cookie;
}

function getCurrentDateTime() {
  const now = new Date();
  return `${now.getFullYear()}-${(now.getMonth() + 1).toString().padStart(2, "0")}-${now.getDate().toString().padStart(2, "0")}_${now.getHours().toString().padStart(2, "0")}-${now.getMinutes().toString().padStart(2, "0")}-${now.getSeconds().toString().padStart(2, "0")}`;
}

exports.operationsDashboardReport = async (req, res) => {
  try {
    const matchCondition = {};
    const matchCondition1 = {};
    // if (req.query.orderUID) {
      // matchCondition.order_unique_id = req.query.orderUID;
      // matchCondition1.order_unique_id = req.query.orderUID;
    // } else {
      if (!req.query.orderUID && req.query.deliveryDate) {
        const fromDateTime = new Date(req.query.deliveryDate);
        const toDateTime = new Date(fromDateTime);
        toDateTime.setDate(toDateTime.getDate() + 1);
        toDateTime.setMilliseconds(toDateTime.getMilliseconds() - 1);
        matchCondition.order_delivery_date = { $gte: fromDateTime, $lte: toDateTime };
        matchCondition1.order_delivery_date = { $gte: fromDateTime, $lte: toDateTime };
      }
    // }

    // F Count Operations
    let ReportFlashing = await OrderMaster.aggregate([
      {
        $match: {
          ...matchCondition,
          f_order_prod_current_status: { $gte: req.query.F },
        },
      },
      {
        $lookup: {
          from: "orderitems",
          localField: "_id",
          foreignField: "order_master_id",
          as: "orderitemsInfo",
        },
      },
      {
        $unwind: "$orderitemsInfo",
      },
      ...(req.query.orderUID ? [{
        $match: {
          $expr: {
            $or: [
              { $eq: ["$order_unique_id", req.query.orderUID] },
              {
                  $and: [
                  { $eq: ["$order_customer_UID", AWF_CUST_ID] },
                  { $eq: [{ $substr: ["$order_customer_PO_number", 0, 6] }, req.query.orderUID] }
                  ]
              }
            ]
          }
        }
      }] : []),
      {
        $group: {
          _id: "$_id",
          order_unique_id: { $first: {
              $cond: [
              { $eq: ["$order_customer_UID", AWF_CUST_ID] },
              { $substr: ["$order_customer_PO_number", 0, 6] },
              "$order_unique_id"
              ]
          }, },
          orderitemsCount: { $sum: 1 },
          totalOrderItemPieces: { $sum: { $toDouble: "$orderitemsInfo.order_item_pieces" } },
          order_delivery_date: { $first: "$order_delivery_date" },
        },
      },
      { $sort: { order_delivery_date: 1 } },
    ]);
    let ReportFlashingCount = ReportFlashing.reduce((sum, item) => sum + item.totalOrderItemPieces, 0);

    // J Count Operations
    let j_status_filter = {};
    if (req.query.J !== undefined && req.query.J !== null && req.query.J !== "") {
      j_status_filter = { j_order_prod_current_status: { $gte: req.query.J } }; // Exact match
    } else {
      j_status_filter = { j_order_prod_current_status: { $gt: "2" } }; // Default condition
    }
    let ReportJobbing = await OrderMaster.aggregate([
      {
        $match: {
          ...matchCondition,
          ...j_status_filter,
        },
      },
      {
        $lookup: {
          from: "orderitemsmanuals",
          localField: "_id",
          foreignField: "order_master_me_id",
          as: "orderitemsmanualsInfo",
          pipeline: [
            { $match: { order_item_me_department_code: "J" } }, // Filter at DB level
            {
              $addFields: {
                order_item_me_uom_value: { $toDouble: "$order_item_me_uom_value" }, // Convert to integer
              },
            },
          ],
        },
      },
      ...(req.query.orderUID ? [{
        $match: {
          $expr: {
            $or: [
              { $eq: ["$order_unique_id", req.query.orderUID] },
              {
                  $and: [
                  { $eq: ["$order_customer_UID", AWF_CUST_ID] },
                  { $eq: [{ $substr: ["$order_customer_PO_number", 0, 6] }, req.query.orderUID] }
                  ]
              }
            ]
          }
        }
      }] : []),
      {
        $sort: { order_delivery_date: 1 },
      },
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
          orderitemsmanualsInfo: 1,
          j_order_prod_current_status: 1,
        },
      },
    ]);
    let ReportJobbingCount = ReportJobbing.reduce((sum, item) => {
      return (
        sum +
        item.orderitemsmanualsInfo.reduce((innerSum, orderItem) => {
          return innerSum + (parseInt(orderItem.order_item_me_uom_value) || 0);
        }, 0)
      );
    }, 0);

    // ROOF Count Operations
    let roof_status_filter = {};
    if (req.query.ROOF !== undefined && req.query.ROOF !== null && req.query.ROOF !== "") {
      roof_status_filter = { roof_order_prod_current_status: { $gte: req.query.ROOF } }; // Exact match
    } else {
      roof_status_filter = { roof_order_prod_current_status: { $gt: "2" } }; // Default condition
    }
    let ReportRoofing = await OrderMaster.aggregate([
      {
        $match: {
          ...matchCondition,
          ...roof_status_filter,
        },
      },
      {
        $lookup: {
          from: "orderitemsmanuals",
          localField: "_id",
          foreignField: "order_master_me_id",
          as: "orderitemsmanualsInfo",
          pipeline: [
            { $match: { order_item_me_department_code: "ROOF" } }, // Filter at DB level
            {
              $addFields: {
                order_item_me_uom_value: { $toDouble: "$order_item_me_uom_value" }, // Convert to integer
              },
            },
          ],
        },
      },
      ...(req.query.orderUID ? [{
        $match: {
          $expr: {
            $or: [
              { $eq: ["$order_unique_id", req.query.orderUID] },
              {
                  $and: [
                  { $eq: ["$order_customer_UID", AWF_CUST_ID] },
                  { $eq: [{ $substr: ["$order_customer_PO_number", 0, 6] }, req.query.orderUID] }
                  ]
              }
            ]
          }
        }
      }] : []),
      {
        $sort: { order_delivery_date: 1 },
      },
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
          orderitemsmanualsInfo: 1,
          roof_order_prod_current_status: 1,
        },
      },
    ]);
    let ReportRoofingCount = ReportRoofing.reduce((sum, item) => {
      return (
        sum +
        item.orderitemsmanualsInfo.reduce((innerSum, orderItem) => {
          return innerSum + (parseInt(orderItem.order_item_me_uom_value) || 0);
        }, 0)
      );
    }, 0);

    // FG Count Operations
    let fg_status_filter = {};
    if (req.query.FG !== undefined && req.query.FG !== null && req.query.FG !== "") {
      fg_status_filter = { fg_order_prod_current_status: { $gte: req.query.FG } }; // Exact match
    } else {
      fg_status_filter = { fg_order_prod_current_status: { $gt: "2" } }; // Default condition
    }
    let ReportFG = await OrderMaster.aggregate([
      {
        $match: {
          ...matchCondition,
          ...fg_status_filter,
        },
      },
      {
        $lookup: {
          from: "orderitemsmanuals",
          localField: "_id",
          foreignField: "order_master_me_id",
          as: "orderitemsmanualsInfo",
          pipeline: [
            { $match: { order_item_me_department_code: "FG" } }, // Filter at DB level
            {
              $addFields: {
                order_item_me_uom_value: { $toDouble: "$order_item_me_uom_value" }, // Convert to integer
              },
            },
          ],
        },
      },
      ...(req.query.orderUID ? [{
        $match: {
          $expr: {
            $or: [
              { $eq: ["$order_unique_id", req.query.orderUID] },
              {
                  $and: [
                  { $eq: ["$order_customer_UID", AWF_CUST_ID] },
                  { $eq: [{ $substr: ["$order_customer_PO_number", 0, 6] }, req.query.orderUID] }
                  ]
              }
            ]
          }
        }
      }] : []),
      {
        $sort: { order_delivery_date: 1 },
      },
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
          orderitemsmanualsInfo: 1,
          fg_order_prod_current_status: 1,
        },
      },
    ]);
    let ReportFGCount = ReportFG.reduce((sum, item) => {
      return (
        sum +
        item.orderitemsmanualsInfo.reduce((innerSum, orderItem) => {
          return innerSum + (parseInt(orderItem.order_item_me_uom_value) || 0);
        }, 0)
      );
    }, 0);

    // CL Count Operations
    let cl_status_filter = {};
    if (req.query.CL !== undefined && req.query.CL !== null && req.query.CL !== "") {
      cl_status_filter = { cl_order_prod_current_status: { $gte: req.query.CL } }; // Exact match
    } else {
      cl_status_filter = { cl_order_prod_current_status: { $gt: "2" } }; // Default condition
    }
    let ReportCL = await OrderMaster.aggregate([
      {
        $match: {
          ...matchCondition,
          ...cl_status_filter,
        },
      },
      {
        $lookup: {
          from: "orderitemsmanuals",
          localField: "_id",
          foreignField: "order_master_me_id",
          as: "orderitemsmanualsInfo",
          pipeline: [
            { $match: { order_item_me_department_code: "CL" } }, // Filter at DB level
            {
              $addFields: {
                order_item_me_uom_value: { $toDouble: "$order_item_me_uom_value" }, // Convert to integer
              },
            },
          ],
        },
      },
      ...(req.query.orderUID ? [{
        $match: {
          $expr: {
            $or: [
              { $eq: ["$order_unique_id", req.query.orderUID] },
              {
                  $and: [
                  { $eq: ["$order_customer_UID", AWF_CUST_ID] },
                  { $eq: [{ $substr: ["$order_customer_PO_number", 0, 6] }, req.query.orderUID] }
                  ]
              }
            ]
          }
        }
      }] : []),
      {
        $sort: { order_delivery_date: 1 },
      },
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
          orderitemsmanualsInfo: 1,
          cl_order_prod_current_status: 1,
        },
      },
    ]);
    let ReportCLCount = ReportCL.reduce((sum, item) => {
      return (
        sum +
        item.orderitemsmanualsInfo.reduce((innerSum, orderItem) => {
          return innerSum + (parseInt(orderItem.order_item_me_uom_value) || 0);
        }, 0)
      );
    }, 0);

    // GBI Count Operations
    let gbi_status_filter = {};
    if (req.query.GBI !== undefined && req.query.GBI !== null && req.query.GBI !== "") {
      gbi_status_filter = { gbi_order_prod_current_status: { $gte: req.query.GBI } }; // Exact match
    } else {
      gbi_status_filter = { gbi_order_prod_current_status: { $gt: "2" } }; // Default condition
    }
    let ReportGBI = await OrderMaster.aggregate([
      {
        $match: {
          ...matchCondition,
          ...gbi_status_filter,
        },
      },
      {
        $lookup: {
          from: "orderitemsmanuals",
          localField: "_id",
          foreignField: "order_master_me_id",
          as: "orderitemsmanualsInfo",
          pipeline: [
            { $match: { order_item_me_department_code: "GBI" } }, // Filter at DB level
            {
              $addFields: {
                order_item_me_uom_value: { $toDouble: "$order_item_me_uom_value" }, // Convert to integer
              },
            },
          ],
        },
      },
      ...(req.query.orderUID ? [{
        $match: {
          $expr: {
            $or: [
              { $eq: ["$order_unique_id", req.query.orderUID] },
              {
                  $and: [
                  { $eq: ["$order_customer_UID", AWF_CUST_ID] },
                  { $eq: [{ $substr: ["$order_customer_PO_number", 0, 6] }, req.query.orderUID] }
                  ]
              }
            ]
          }
        }
      }] : []),
      {
        $sort: { order_delivery_date: 1 },
      },
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
          orderitemsmanualsInfo: 1,
          gbi_order_prod_current_status: 1,
        },
      },
    ]);
    let ReportGBICount = ReportGBI.reduce((sum, item) => {
      return (
        sum +
        item.orderitemsmanualsInfo.reduce((innerSum, orderItem) => {
          return innerSum + (parseInt(orderItem.order_item_me_uom_value) || 0);
        }, 0)
      );
    }, 0);

    const statusConditions = [];
    if (req.query.deptcode === "F") {
      matchCondition.f_order_prod_push_status = { $gt: 0 };
      if (req.query.F) statusConditions.push({ f_order_prod_current_status: { $gte: req.query.F } });
    }
    if (req.query.deptcode === "J") {
      matchCondition.j_order_prod_push_status = { $gt: 0 };
      if (req.query.J) statusConditions.push({ j_order_prod_current_status: { $gte: req.query.J } });
    }
    if (req.query.deptcode === "FG") {
      matchCondition.fg_order_prod_push_status = { $gt: 0 };
      if (req.query.FG) statusConditions.push({ fg_order_prod_current_status: { $gte: req.query.FG } });
    }
    if (req.query.deptcode === "CL") {
      matchCondition.cl_order_prod_push_status = { $gt: 0 };
      if (req.query.CL) statusConditions.push({ cl_order_prod_current_status: { $gte: req.query.CL } });
    }
    if (req.query.deptcode === "ROOF") {
      matchCondition.roof_order_prod_push_status = { $gt: 0 };
      if (req.query.ROOF) statusConditions.push({ roof_order_prod_current_status: { $gte: req.query.ROOF } });
    }
    if (req.query.deptcode === "GBI") {
      matchCondition.gbi_order_prod_push_status = { $gt: 0 };
      if (req.query.GBI) statusConditions.push({ gbi_order_prod_current_status: { $gte: req.query.GBI } });
    }
    if (req.query.deptcode === "All") {
      if (req.query.F) statusConditions.push({ f_order_prod_current_status: { $gte: req.query.F } });
      if (req.query.J) statusConditions.push({ j_order_prod_current_status: { $gte: req.query.J } });
      if (req.query.FG) statusConditions.push({ fg_order_prod_current_status: { $gte: req.query.FG } });
      if (req.query.CL) statusConditions.push({ cl_order_prod_current_status: { $gte: req.query.CL } });
      if (req.query.ROOF) statusConditions.push({ roof_order_prod_current_status: { $gte: req.query.ROOF } });
      if (req.query.GBI) statusConditions.push({ gbi_order_prod_current_status: { $gte: req.query.GBI } });
    }
    if (statusConditions.length > 0) {
      matchCondition.$or = statusConditions;
    }

    // For Total Rows Count
    let ReportItems = await OrderMaster.aggregate([
      { $match: matchCondition },
      { $sort: { created: 1 } },
      {
        $lookup: {
          from: "orderitems",
          localField: "_id",
          foreignField: "order_master_id",
          as: "orderitemsInfo",
          pipeline: [{ $project: { _id: 0, order_unique_id: 1, order_item_pieces: 1 } }],
        },
      },
      {
        $lookup: {
          from: "orderitemsmanuals",
          localField: "_id",
          foreignField: "order_master_me_id",
          as: "orderitemsmanualsInfo",
          pipeline: [{ $project: { _id: 0, order_unique_me_id: 1, order_item_me_department_code: 1, order_item_me_uom_value: 1 } }],
        },
      },
      ...(req.query.orderUID ? [{
        $match: {
          $expr: {
            $or: [
              { $eq: ["$order_unique_id", req.query.orderUID] },
              {
                  $and: [
                  { $eq: ["$order_customer_UID", AWF_CUST_ID] },
                  { $eq: [{ $substr: ["$order_customer_PO_number", 0, 6] }, req.query.orderUID] }
                  ]
              }
            ]
          }
        }
      }] : []),
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
          order_customer_UID: 1,
          order_delivery_date: 1,
          order_delivery_date_str: 1,
          order_delivery_time: 1,
          order_delivery_session: 1,
          order_status: 1,
          created: 1,
          created_str: 1,
          order_hold: 1,
          f_order_prod_current_status: 1,
          fg_order_prod_current_status: 1,
          cl_order_prod_current_status: 1,
          j_order_prod_current_status: 1,
          roof_order_prod_current_status: 1,
          gbi_order_prod_current_status: 1,
          f_order_prod_push_status: 1,
          j_order_prod_push_status: 1,
          fg_order_prod_push_status: 1,
          cl_order_prod_push_status: 1,
          gbi_order_prod_push_status: 1,
          roof_order_prod_push_status: 1,
          order_customer_name: 1,
          orderitemsInfo: 1,
          orderitemsmanualsInfo: 1,
        },
      },
    ]);

    let Total_Rows = ReportItems.length;
    let Total_Flashing_Rows = 0;
    let DepartmentCounts = { FG: 0, CL: 0, J: 0, GBI: 0, ROOF: 0 };
    ReportItems.forEach(item => {
      let orderItemPiecesSum = item.orderitemsInfo.reduce((sum, orderItem) => {
        return sum + parseInt(orderItem.order_item_pieces || "0", 10);
      }, 0);
      Total_Flashing_Rows += orderItemPiecesSum;
      item.departmentLineItemCounts = orderItemPiecesSum ? { F: orderItemPiecesSum } : {};
      if (item.orderitemsmanualsInfo.length > 0) {
        item.orderitemsmanualsInfo.forEach(manualItem => {
          let deptCode = manualItem.order_item_me_department_code;
          let uomValue = parseInt(manualItem.order_item_me_uom_value || "0", 10);

          if (DepartmentCounts.hasOwnProperty(deptCode)) {
            DepartmentCounts[deptCode] += uomValue;
            item.departmentLineItemCounts[deptCode] = (item.departmentLineItemCounts[deptCode] || 0) + uomValue;
          }
        });
      }
    });

    // For Total Rows Count
    let ReportItems1 = await OrderMaster.aggregate([
      { $match: matchCondition1 },
      { $sort: { created: 1 } },
      {
        $lookup: {
          from: "orderitems",
          localField: "_id",
          foreignField: "order_master_id",
          as: "orderitemsInfo",
          pipeline: [{ $project: { _id: 0, order_unique_id: 1, order_item_pieces: 1 } }],
        },
      },
      {
        $lookup: {
          from: "orderitemsmanuals",
          localField: "_id",
          foreignField: "order_master_me_id",
          as: "orderitemsmanualsInfo",
          pipeline: [{ $project: { _id: 0, order_unique_me_id: 1, order_item_me_department_code: 1, order_item_me_uom_value: 1 } }],
        },
      },
      ...(req.query.orderUID ? [{
        $match: {
          $expr: {
            $or: [
              { $eq: ["$order_unique_id", req.query.orderUID] },
              {
                  $and: [
                  { $eq: ["$order_customer_UID", AWF_CUST_ID] },
                  { $eq: [{ $substr: ["$order_customer_PO_number", 0, 6] }, req.query.orderUID] }
                  ]
              }
            ]
          }
        }
      }] : []),
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
          order_customer_UID: 1,
          order_delivery_date: 1,
          order_delivery_date_str: 1,
          order_delivery_time: 1,
          order_delivery_session: 1,
          order_status: 1,
          created: 1,
          created_str: 1,
          f_order_prod_current_status: 1,
          fg_order_prod_current_status: 1,
          cl_order_prod_current_status: 1,
          j_order_prod_current_status: 1,
          roof_order_prod_current_status: 1,
          gbi_order_prod_current_status: 1,
          f_order_prod_push_status: 1,
          j_order_prod_push_status: 1,
          fg_order_prod_push_status: 1,
          cl_order_prod_push_status: 1,
          gbi_order_prod_push_status: 1,
          roof_order_prod_push_status: 1,
          order_customer_name: 1,
          orderitemsInfo: 1,
          orderitemsmanualsInfo: 1,
        },
      },
    ]);

    // let Total_Rows = ReportItems.length;
    let Total_Flashing_Rows1 = 0;
    let DepartmentCounts1 = { FG: 0, CL: 0, J: 0, GBI: 0, ROOF: 0 };
    ReportItems1.forEach(item => {
      let orderItemPiecesSum1 = item.orderitemsInfo.reduce((sum, orderItem) => {
        return sum + parseInt(orderItem.order_item_pieces || "0", 10);
      }, 0);
      Total_Flashing_Rows1 += orderItemPiecesSum1;
      item.departmentLineItemCounts1 = orderItemPiecesSum1 ? { F: orderItemPiecesSum1 } : {};
      if (item.orderitemsmanualsInfo.length > 0) {
        item.orderitemsmanualsInfo.forEach(manualItem => {
          let deptCode1 = manualItem.order_item_me_department_code;
          let uomValue1 = parseInt(manualItem.order_item_me_uom_value || "0", 10);

          if (DepartmentCounts1.hasOwnProperty(deptCode1)) {
            DepartmentCounts1[deptCode1] += uomValue1;
            item.departmentLineItemCounts1[deptCode1] = (item.departmentLineItemCounts1[deptCode1] || 0) + uomValue1;
          }
        });
      }
    });

    let responseObject = { Total_Rows, ReportItems };
    if (req.query.deptcode === "F") {
      responseObject.Total_Flashing_Rows = Total_Flashing_Rows1;
      responseObject.ReportFlashingCount = ReportFlashingCount;
    } else if (req.query.deptcode === "J") {
      responseObject.Total_J_Rows = DepartmentCounts1.J;
      responseObject.Total_J_Rows_Job = ReportJobbingCount;
    } else if (req.query.deptcode === "FG") {
      responseObject.Total_FG_Rows = DepartmentCounts1.FG;
      responseObject.Total_FG_Rows_Job = ReportFGCount;
    } else if (req.query.deptcode === "CL") {
      responseObject.Total_CL_Rows = DepartmentCounts1.CL;
      responseObject.Total_CL_Rows_Job = ReportCLCount;
    } else if (req.query.deptcode === "ROOF") {
      responseObject.Total_ROOF_Rows = DepartmentCounts1.ROOF;
      responseObject.Total_ROOF_Rows_Job = ReportRoofingCount;
    } else if (req.query.deptcode === "GBI") {
      responseObject.Total_GBI_Rows = DepartmentCounts1.GBI;
      responseObject.Total_GBI_Rows_Job = ReportGBICount;
    } else {
      responseObject = {
        Total_Rows,
        ReportItems,
        Total_Flashing_Rows,
        Total_Flashing_Rows: Total_Flashing_Rows1,
        Total_FG_Rows: DepartmentCounts1.FG,
        Total_CL_Rows: DepartmentCounts1.CL,
        Total_J_Rows: DepartmentCounts1.J,
        Total_GBI_Rows: DepartmentCounts1.GBI,
        Total_ROOF_Rows: DepartmentCounts1.ROOF,
        ReportFlashingCount,
        Total_J_Rows_Job: ReportJobbingCount,
        Total_FG_Rows_Job: ReportFGCount,
        Total_CL_Rows_Job: ReportCLCount,
        Total_ROOF_Rows_Job: ReportRoofingCount,
        Total_GBI_Rows_Job: ReportGBICount,
      };
    }
    res.status(200).send(responseObject);
  } catch (err) {
    logError("operationsDashboardReport", err, req.user.user_ref_id);
    res.status(500).send("Data Fetching Failed");
  }
};

exports.runsReportList = async (req, res) => {
  try {
    const limit = 50;
    let page = parseInt(req.query.page) || 0;
    const skip = page * limit;

    const matchCondition = {};
    matchCondition.$nor = [{ order_delivery_address_mode: "2" }, { order_status: "Order Cancelled" }];
    // Exclude orders that are on hold
    matchCondition.order_hold = { $ne: true };

    let fromDateTime;
    let toDateTime;
    const searchFilter = {};
    const today = new Date();
    const tomorrow = new Date(today);
    tomorrow.setDate(today.getDate() + 1);
    const year = tomorrow.getFullYear();
    const month = String(tomorrow.getMonth() + 1).padStart(2, "0");
    const day = String(tomorrow.getDate()).padStart(2, "0");
    const tomorrowDate = `${year}-${month}-${day}`;

    if (req.query.orderUID) {
      function escapeRegExp(string) {
        return string.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      }
      const escapedKeyword = escapeRegExp(req.query.orderUID);
      searchFilter.$or = [{ order_unique_id: { $regex: escapedKeyword, $options: "i" } }];
    } else {
      if (req.query.fromTime && req.query.toTime) {
        fromDateTime = new Date(req.query.fromTime);
        toDateTime = new Date(req.query.toTime);
        matchCondition.order_delivery_date = { $gte: fromDateTime, $lte: toDateTime };
      } else {
        fromDateTime = new Date(tomorrowDate);
        toDateTime = new Date(tomorrowDate);
        matchCondition.order_delivery_date = { $gte: fromDateTime, $lte: toDateTime };
      }
    }

    let totalReturnedOrders = await OrderMaster.find({
      $and: [matchCondition, searchFilter],
    });
    let totalOrdersCount = totalReturnedOrders.length;
    let loaderReportItems = await OrderMaster.aggregate([
      { $sort: { created: 1 } },
      { $match: matchCondition },
      { $match: searchFilter },
      {
        $lookup: {
          from: "orderitems",
          localField: "_id",
          foreignField: "order_master_id",
          pipeline: [{ $project: { order_item_length: 1 } }],
          as: "orderitemsInfo",
        },
      },
      {
        $lookup: {
          from: "orderitemsmanuals",
          localField: "_id",
          foreignField: "order_master_me_id",
          pipeline: [{ $project: { order_item_me_length: 1 } }],
          as: "orderitemsmanualsInfo",
        },
      },
      {
        $lookup: {
          from: "accounts",
          localField: "order_customer_id",
          foreignField: "_id",
          pipeline: [
            {
              $project: {
                _id: 1,
                account_UID: 1,
                account_Name: 1,
                account_Address_line_one: 1,
                account_Address_line_two: 1,
                account_Address_Country: 1,
                account_Address_State: 1,
                account_Address_City: 1,
                account_Address_PostalCode: 1,
                account_Address_Phone: 1,
                account_Address_Email: 1,
              },
            },
          ],
          as: "customerInfo",
        },
      },
      {
        $lookup: {
          from: "accountcontacts",
          localField: "order_customer_contact_id",
          foreignField: "_id",
          pipeline: [{ $project: { _id: 1 } }],
          as: "customercontactInfo",
        },
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
                Order_GBIL_Count: 1,
              },
            },
          ],
          as: "orderssubitemcountsInfo",
        },
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
                    in: { $divide: [{ $toDouble: "$$item.order_item_length" }, 1000] },
                  },
                },
                {
                  $map: {
                    input: "$orderitemsmanualsInfo",
                    as: "manualItem",
                    in: { $toDouble: "$$manualItem.order_item_me_length" },
                  },
                },
              ],
            },
          },
        },
      },
      {
        $addFields: {
          orderitemsInfo: {
            $filter: {
              input: "$orderitemsInfo",
              as: "item",
              cond: {
                $eq: [{ $divide: [{ $toDouble: "$$item.order_item_length" }, 1000] }, "$largestItem"],
              },
            },
          },
          orderitemsmanualsInfo: {
            $filter: {
              input: "$orderitemsmanualsInfo",
              as: "manualItem",
              cond: {
                $eq: [{ $toDouble: "$$manualItem.order_item_me_length" }, "$largestItem"],
              },
            },
          },
        },
      },
      {
        $addFields: {
          orderitemsInfo: { $arrayElemAt: ["$orderitemsInfo", 0] },
          orderitemsmanualsInfo: { $arrayElemAt: ["$orderitemsmanualsInfo", 0] },
        },
      },
      {
        $lookup: {
          from: "rackings",
          localField: "f_order_racking_table",
          foreignField: "_id",
          pipeline: [{ $project: { rack_name: 1 } }],
          as: "frackingsInfo",
        },
      },
      {
        $lookup: {
          from: "rackings",
          localField: "fg_order_racking_table",
          foreignField: "_id",
          pipeline: [{ $project: { rack_name: 1 } }],
          as: "fgrackingsInfo",
        },
      },
      {
        $lookup: {
          from: "rackings",
          localField: "cl_order_racking_table",
          foreignField: "_id",
          pipeline: [{ $project: { rack_name: 1 } }],
          as: "clrackingsInfo",
        },
      },
      {
        $lookup: {
          from: "rackings",
          localField: "j_order_racking_table",
          foreignField: "_id",
          pipeline: [{ $project: { rack_name: 1 } }],
          as: "jrackingsInfo",
        },
      },
      {
        $lookup: {
          from: "rackings",
          localField: "roof_order_racking_table",
          foreignField: "_id",
          pipeline: [{ $project: { rack_name: 1 } }],
          as: "roofrackingsInfo",
        },
      },
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
          order_site_delivery_details: 1,
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
          order_crane_lift_checker: 1,
          order_master_rack: 1,
          order_Overall_Price: 1,
          order_loaders_info: 1,
          order_custom_note: 1,
          order_Pieces: 1,
          f_order_prod_push_status: 1,
          j_order_prod_push_status: 1,
          fg_order_prod_push_status: 1,
          cl_order_prod_push_status: 1,
          roof_order_prod_push_status: 1,
          gbi_order_prod_push_status: 1,
          gbil_order_prod_push_status: 1,
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
            $add: ["$orderssubitemcountsInfo.Order_Flashing_Count", "$orderssubitemcountsInfo.Order_Jobbing_Count", "$orderssubitemcountsInfo.Order_Cladding_Count", "$orderssubitemcountsInfo.Order_Faciagutter_Count", "$orderssubitemcountsInfo.Order_Roofing_Count", "$orderssubitemcountsInfo.Order_GBI_Count"],
          },
          largest_length: "$largestItem",
        },
      },
    ])
      .skip(skip)
      .limit(limit);
    let totalPages = Math.ceil(totalOrdersCount / limit);
    const responseObject = {
      loaderReportItems,
      totalItems: totalOrdersCount,
      rowsPerPage: limit,
      totalPages: totalPages,
    };
    res.send(responseObject).status(200).end();
  } catch (err) {
    logError("runsReportList", err, req.user.user_ref_id);
    res.status(500).send("Data Fetching Failed");
  }
};

exports.runsReportListExport = async (req, res) => {
  try {
    const matchCondition = {};
    matchCondition.$nor = [{ order_delivery_address_mode: "2" }, { order_status: "Order Cancelled" }];
    // Exclude orders that are on hold
    matchCondition.order_hold = { $ne: true };

    let fromDateTime;
    let toDateTime;
    const searchFilter = {};

    const today = new Date();
    const tomorrow = new Date(today);
    tomorrow.setDate(today.getDate() + 1);
    const year = tomorrow.getFullYear();
    const month = String(tomorrow.getMonth() + 1).padStart(2, "0");
    const day = String(tomorrow.getDate()).padStart(2, "0");
    const tomorrowDate = `${year}-${month}-${day}`;

    if (req.query.orderUID) {
      function escapeRegExp(string) {
        return string.replace();
      }
      const escapedKeyword = escapeRegExp(req.query.orderUID);
      searchFilter.$or = [{ order_unique_id: { $regex: escapedKeyword, $options: "i" } }];
    } else {
      if (req.query.fromTime && req.query.toTime) {
        const fromDateTime = new Date(req.query.fromTime);
        const toDateTime = new Date(req.query.toTime);
        matchCondition.order_delivery_date = { $gte: fromDateTime, $lte: toDateTime };
      } else {
        fromDateTime = new Date(tomorrowDate);
        toDateTime = new Date(tomorrowDate);
        matchCondition.order_delivery_date = { $gte: fromDateTime, $lte: toDateTime };
      }
    }

    let totalReturnedOrders = await OrderMaster.find({
      $and: [matchCondition, searchFilter],
    });
    let fetchedItems = await OrderMaster.aggregate([
      { $sort: { created: 1 } },
      { $match: matchCondition },
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
                    in: { $divide: [{ $toDouble: "$$item.order_item_length" }, 1000] },
                  },
                },
                {
                  $map: {
                    input: "$orderitemsmanualsInfo",
                    as: "manualItem",
                    in: { $toDouble: "$$manualItem.order_item_me_length" },
                  },
                },
              ],
            },
          },
        },
      },

      {
        $addFields: {
          orderitemsInfo: {
            $filter: {
              input: "$orderitemsInfo",
              as: "item",
              cond: {
                $eq: [{ $divide: [{ $toDouble: "$$item.order_item_length" }, 1000] }, "$largestItem"],
              },
            },
          },
          orderitemsmanualsInfo: {
            $filter: {
              input: "$orderitemsmanualsInfo",
              as: "manualItem",
              cond: {
                $eq: [{ $toDouble: "$$manualItem.order_item_me_length" }, "$largestItem"],
              },
            },
          },
        },
      },

      {
        $addFields: {
          orderitemsInfo: { $arrayElemAt: ["$orderitemsInfo", 0] },
          orderitemsmanualsInfo: { $arrayElemAt: ["$orderitemsmanualsInfo", 0] },
        },
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
          order_site_delivery_details: 1,
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
          order_crane_lift_checker: 1,
          order_master_rack: 1,
          order_Overall_Price: 1,
          order_loaders_info: 1,
          order_custom_note: 1,
          f_order_prod_push_status: 1,
          j_order_prod_push_status: 1,
          fg_order_prod_push_status: 1,
          cl_order_prod_push_status: 1,
          roof_order_prod_push_status: 1,
          gbi_order_prod_push_status: 1,
          gbil_order_prod_push_status: 1,
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
            $add: ["$orderssubitemcountsInfo.Order_Flashing_Count", "$orderssubitemcountsInfo.Order_Jobbing_Count", "$orderssubitemcountsInfo.Order_Cladding_Count", "$orderssubitemcountsInfo.Order_Faciagutter_Count", "$orderssubitemcountsInfo.Order_Roofing_Count", "$orderssubitemcountsInfo.Order_GBI_Count"],
          },
          largest_length: "$largestItem",
        },
      },
    ]);
    res.send(fetchedItems).status(200).end();
  } catch (err) {
    logError("runsReportListExport", err, req.user.user_ref_id);
    res.status(500).send("Data Fetching Failed");
  }
};

// Helper to check if file is image
function isImageFile(fileKey) {
    const ext = path.extname(fileKey).toLowerCase();
    return [".jpg", ".jpeg", ".png", ".gif", ".bmp", ".webp"].includes(ext);
}

// Helper to convert image to PDF
// async function convertImageToPDF(imagePath, pdfPath) {
//     const pdfDoc = await PDFDocument.create();
//     const imageBytes = fs.readFileSync(imagePath);

//     // Try to embed JPG or PNG
//     let image;
//     try {
//         image = await pdfDoc.embedJpg(imageBytes);
//     } catch {
//         image = await pdfDoc.embedPng(imageBytes);
//     }

//     // A4 size in points (1 point = 1/72 inch)
//     const pageWidth = 595.28;
//     const pageHeight = 841.89;
//     const margin = 40;

//     // Original image size
//     const imgWidth = image.width;
//     const imgHeight = image.height;

//     // Scale to fit A4
//     const scale = Math.min(
//         (pageWidth - margin * 2) / imgWidth,
//         (pageHeight - margin * 2) / imgHeight
//     );

//     const newWidth = imgWidth * scale;
//     const newHeight = imgHeight * scale;

//     const page = pdfDoc.addPage([pageWidth, pageHeight]);

//     // Center the image on the page
//     const x = (pageWidth - newWidth) / 2;
//     const y = (pageHeight - newHeight) / 2;

//     page.drawImage(image, {
//         x,
//         y,
//         width: newWidth,
//         height: newHeight,
//     });

//     const pdfBytes = await pdfDoc.save();
//     fs.writeFileSync(pdfPath, pdfBytes);
// }

exports.generateDocketPDFDocketwise = async (req, res) => {
  try {
    const PDFMerger = (await import("pdf-merger-js")).default;
    let matchCondition = {};
    let extOrdersMatchCondition = {};

    const sendMailDocket = req.query.sendMail === "true";
    // Build Query Condition
    let ordersArray = null;
    let extOrdersArray = null;
    if (req.query.mode === "group-orders") {
      const rawOrders = req.query.groupOrders;
      if (typeof rawOrders === "string") {
        ordersArray = rawOrders.split(",").map(id => id.trim());
      } else if (Array.isArray(rawOrders)) {
        ordersArray = rawOrders.map(id => id.trim());
      }

      // match either order_unique_id in array OR first 6 bytes of order_customer_PO_number in array (for AWF customer)
      matchCondition = makeInCondition(ordersArray, "order_unique_id", "order_customer_PO_number");

      extOrdersArray = [...ordersArray];

      // for external orders collection: apply same fallback but using ext fields (order_number / order_customer_PO_number)
      extOrdersMatchCondition = makeInCondition(extOrdersArray, "order_number", "order_customer_PO_number");

      } else {
      if (req.query.mode === "individual-order") {
        const orderUID = req.query.orderUID;

        // single id equality with fallback on first6(PONumber)
        matchCondition = makeEqCondition(orderUID, "order_unique_id", "order_customer_PO_number");
        matchCondition = {
        $or: [
              { order_unique_id: orderUID },
              {
                $expr: {
                  $and: [
                    { $eq: ["$order_customer_UID", AWF_CUST_ID] },
                    { $eq: [{ $substrBytes: ["$order_customer_PO_number", 0, 6] }, orderUID] }
                  ]
                }
              }
            ]
          }
        extOrdersMatchCondition = makeEqCondition(orderUID, "order_number", "order_customer_PO_number");

      } else if (req.query.mode === "created-date") {
        const fromDateTime = new Date(req.query.fromTime);
        const toDateTime = new Date(req.query.toTime);
        matchCondition.created = { $gte: fromDateTime, $lte: toDateTime };
        extOrdersMatchCondition.created = { $gte: fromDateTime, $lte: toDateTime };

      } else if (req.query.mode === "promised-date") {
        const fromDateTime = new Date(req.query.fromTime);
        const toDateTime = new Date(req.query.toTime);
        matchCondition.order_delivery_date = { $gte: fromDateTime, $lte: toDateTime };
        extOrdersMatchCondition.order_delivery_date = { $gte: fromDateTime, $lte: toDateTime };

      } else if (req.query.mode === "pickup-promised-date") {
        const fromDateTime = new Date(req.query.fromTime);
        const toDateTime = new Date(req.query.toTime);
        matchCondition.order_delivery_date = { $gte: fromDateTime, $lte: toDateTime };
        matchCondition.order_delivery_address_mode = "2";

      } else if (req.query.mode === "pickup-created-date") {
        const fromDateTime = new Date(req.query.fromTime);
        const toDateTime = new Date(req.query.toTime);
        matchCondition.created = { $gte: fromDateTime, $lte: toDateTime };
        matchCondition.order_delivery_address_mode = "2";

      } else if (req.query.mode === "range") {
        let fromOrder = parseInt(req.query.fromOrder.replace(/\D/g, ""), 10);
        let toOrder = parseInt(req.query.toOrder.replace(/\D/g, ""), 10);
        matchCondition = { 
            $expr: {
                $and: [
                    { 
                        $gte: [
                            { 
                                $convert: {
                                    input: {
                                        $trim: {
                                            input: { $substrCP: ["$order_unique_id", 2, { $strLenCP: "$order_unique_id" }] }
                                        }
                                    },
                                    to: "int",
                                    onError: 0  
                                }
                            },
                            fromOrder
                        ]
                    },
                    { 
                        $lte: [
                            { 
                                $convert: {
                                    input: {
                                        $trim: {
                                            input: { $substrCP: ["$order_unique_id", 2, { $strLenCP: "$order_unique_id" }] }
                                        }
                                    },
                                    to: "int",
                                    onError: 0 
                                }
                            },
                            toOrder
                        ]
                    }
                ]
            }
        };
      }
    }

    // Restrict Cancelled Orders
    matchCondition.order_status = { $ne: "Order Cancelled" };
    const aggregationPipeline = [
      { $match: matchCondition },
      {
        $lookup: {
          from: "accountcontacts",
          as: "accountcontactsInfo",
          localField: "order_customer_contact_id",
          foreignField: "_id",
        },
      },
      { $unwind: { path: "$accountcontactsInfo", preserveNullAndEmptyArrays: true } },
      // Add sort index based on input order
      ...(req.query.mode === "group-orders"
        ? [
            {
              $addFields: {
                sortIndex: {
                  $indexOfArray: [ordersArray, "$order_unique_id"],
                },
              },
            },
          ]
        : []),
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
          order_customer_contact_name: 1,
          order_customer_contact_phone: 1,
          order_delivery_date_str: 1,
          order_delivery_time: 1,
          order_delivery_session: 1,
          created_str: 1,
          order_delivery_address_mode: 1,
          order_store_delivery_address1: 1,
          order_store_delivery_city: 1,
          order_store_delivery_country: 1,
          order_store_delivery_postalcode: 1,
          order_store_delivery_state: 1,
          order_site_delivery_attention_contact: 1,
          order_site_delivery_attention_person: 1,
          order_site_delivery_address1: 1,
          order_site_delivery_city: 1,
          order_site_delivery_country: 1,
          order_site_delivery_postalcode: 1,
          order_site_delivery_state: 1,
          order_loaders_info: 1,
          order_custom_note: 1,
          order_crane_lift_checker: 1,
          f_order_racking_table: 1,
          fg_order_racking_table: 1,
          cl_order_racking_table: 1,
          j_order_racking_table: 1,
          roof_order_racking_table: 1,
          gbi_order_racking_table: 1,
          order_site_delivery_mud_map: 1,
          docket: 1,
          account_Contact_FName: "$accountcontactsInfo.account_Contact_FName",
          ...(req.query.mode === "group-orders" ? { sortIndex: 1 } : {}),
        },
      },
      ...(req.query.mode === "group-orders" ? [{ $sort: { sortIndex: 1 } }] : []),
    ];

    const extOrdersAggregationPipeline = [
      { $match: extOrdersMatchCondition },
      ...(extOrdersArray
        ? [
            {
              $addFields: {
                sortIndex: {
                  $indexOfArray: [extOrdersArray, "$order_number"],
                },
              },
            },
          ]
        : []),
      {
        $project: {
          _id: 1,
          order_number: 1,
          order_docket: 1,
          ...(extOrdersArray ? { sortIndex: 1 } : {}),
        },
      },
      ...(extOrdersArray ? [{ $sort: { sortIndex: 1 } }] : []),
    ];

    // Fetch orders in serialwise
    let Orders = await OrderMaster.aggregate(aggregationPipeline);
    let ExtOrders = await ExternalOrders.aggregate(extOrdersAggregationPipeline);

    // Sort Orders and ExtOrders by serial (order_unique_id or order_number)
    const first6OfPO = (po) => (typeof po === 'string' ? po.substring(0, 6) : '');

    // Reorder Orders according to ordersArray, using fallback matching on PO first 6 chars
    if (Array.isArray(ordersArray) && Orders.length) {
      Orders = ordersArray.map((uid) => {
        // find exact match on order_unique_id
        let found = Orders.find(o => {
          // normalize to strings for safe comparison (handle numbers, nulls)
          const ouid = o?.order_unique_id ?? '';
          return String(ouid) === String(uid);
        });

        if (found) return found;

        // fallback: match first 6 chars of PO when order_customer_UID === AWF_CUST_ID
        found = Orders.find(o => {
          if (o?.order_customer_UID !== AWF_CUST_ID) return false;
          const poFirst6 = first6OfPO(o?.order_customer_PO_number);
          return String(poFirst6) === String(uid);
        });

        return found || null;
      }).filter(Boolean); // remove any nulls (not found)
    }

    // Reorder ExtOrders according to extOrdersArray, using same fallback semantics
    if (Array.isArray(extOrdersArray) && ExtOrders.length) {
      ExtOrders = extOrdersArray.map((uid) => {
        // exact match on order_number
        let found = ExtOrders.find(o => {
          const onum = o?.order_number ?? '';
          return String(onum) === String(uid);
        });

        if (found) return found;

        // fallback: match first 6 chars of PO when order_customer_UID === AWF_CUST_ID
        found = ExtOrders.find(o => {
          if (o?.order_customer_UID !== AWF_CUST_ID) return false;
          const poFirst6 = first6OfPO(o?.order_customer_PO_number);
          return String(poFirst6) === String(uid);
        });

        return found || null;
      }).filter(Boolean);
    }


    // Prepare docket files in serial order
    let docketFilesOrdered = [];
    if (ordersArray || req.query.orderUID) {
      if(ordersArray?.length > 0){
        for (const orderUID of ordersArray) {
          // Check in ExtOrders first
          const extOrder = ExtOrders.find(o => o.order_number === orderUID);
          if (extOrder && Array.isArray(extOrder.order_docket)) {
            docketFilesOrdered.push(
              ...extOrder.order_docket.map(fileKey => ({
                fileKey,
                isExternal: true,
                extOrder,
              }))
            );
          }
          // Then check in Orders
          const first6OfPO = (po) => (typeof po === 'string' ? po.substring(0, 6) : '');

          let masterOrder = Orders.find(o => String(o?.order_unique_id) === String(orderUID));
          if (!masterOrder) {
            masterOrder = Orders.find(o =>
              o?.order_customer_UID === AWF_CUST_ID &&
              first6OfPO(o?.order_unique_id) === String(orderUID)
            );
          }

          if (masterOrder) {
            docketFilesOrdered.push({
              fileKey: masterOrder,
              isExternal: false,
              masterOrder,
            });
          }
        }
      }else{
        const orderUID = req.query.orderUID
        const extOrder = ExtOrders.find(o => o.order_number === orderUID);
          if (extOrder && Array.isArray(extOrder.order_docket)) {
            docketFilesOrdered.push(
              ...extOrder.order_docket.map(fileKey => ({
                fileKey,
                isExternal: true,
                extOrder,
              }))
            );
          }
          // Then check in Orders
          const first6OfPO = (po) => (typeof po === 'string' ? po.substring(0, 6) : '');

          let masterOrder = Orders.find(o => String(o?.order_unique_id) === String(orderUID));

          // console.log("masO", masterOrder)
          // conosle.log("ord", masterOrder[0])

          if (!masterOrder) {
            masterOrder = Orders.find(o =>
              o?.order_customer_UID === AWF_CUST_ID &&
              first6OfPO(o?.order_unique_id) === String(orderUID)
            );
          }

          if (masterOrder) {
            docketFilesOrdered.push({
              fileKey: masterOrder,
              isExternal: false,
              masterOrder,
            });
          }
      }
    }

    // If no OrderMaster orders found, but ExternalOrders found, send those PDFs
    if (!Orders.length && ExtOrders.length) {
      let docketFiles = [];
      ExtOrders.forEach(extOrder => {
        if (Array.isArray(extOrder.order_docket)) {
          docketFiles = docketFiles.concat(extOrder.order_docket);
        }
      });
      if (!docketFiles.length) {
        return res.status(500).send("No Docket Files Found!");
      }
      const merger = new PDFMerger();
      for (const fileKey of docketFiles) {
        const tempFilePath = path.join(__dirname, "../dockets", `${path.basename(fileKey)}`);
        const command = new GetObjectCommand({
          Bucket: "encore-sheet",
          Key: fileKey,
        });
        const s3Stream = await s3Client.send(command);
        await new Promise((resolve, reject) => {
          const writeStream = fs.createWriteStream(tempFilePath);
          s3Stream.Body.pipe(writeStream);
          s3Stream.Body.on("error", reject);
          writeStream.on("finish", resolve);
        });
        // Check PDF header before merging
        let fileHeader = "";
        try {
          fileHeader = fs.readFileSync(tempFilePath, { encoding: "utf8", flag: "r" }).slice(0, 4);
        } catch (e) {
          fileHeader = "";
        }
        if (isImageFile(fileKey)) {
          const tempPdfPath = tempFilePath.replace(path.extname(tempFilePath), ".pdf");
          await convertImageToPDF(tempFilePath, tempPdfPath);
          // Only add if the PDF was successfully created and is valid
          let pdfHeader = "";
          try {
            pdfHeader = fs.readFileSync(tempPdfPath, { encoding: "utf8", flag: "r" }).slice(0, 4);
          } catch (e) {
            pdfHeader = "";
          }
          if (pdfHeader === "%PDF") {
            await merger.add(tempPdfPath);
          }
          fs.unlinkSync(tempFilePath);
          fs.unlinkSync(tempPdfPath);
        } else {
          // Check if file is a valid PDF before adding
          if (fileHeader === "%PDF") {
            await merger.add(tempFilePath);
          }
          fs.unlinkSync(tempFilePath);
        }
      }
      let file_name = req.query.mode === "individual-order" ? `DO_${req.query.orderUID}.pdf` : `Docket_${Date.now()}.pdf`;
      const finalFilePath = path.join(__dirname, "../dockets", file_name);
      await merger.save(finalFilePath);
      res.status(200).send(`dockets/${path.basename(finalFilePath)}`);
      res.on("finish", () => {
        setTimeout(() => {
          fs.unlink(finalFilePath, unlinkError => {
            if (unlinkError) {
              console.error("Error deleting merged PDF:", unlinkError);
            } else {
              console.log("Merged PDF deleted successfully:", finalFilePath);
            }
          });
        }, 5000);
      });
      return;
    }

    // If OrderMaster orders found, continue with existing logic
    if (!Orders.length) return res.status(500).send("No Orders Found!");
    const merger = new PDFMerger();

    const deptRackingFieldMap = {
      F: "f_order_racking_table",
      FG: "fg_order_racking_table",
      CL: "cl_order_racking_table",
      J: "j_order_racking_table",
      ROOF: "roof_order_racking_table",
      GBI: "gbi_order_racking_table",
    };

    // If docketFilesOrdered is set (group-orders), use that order for merging
    if (docketFilesOrdered.length > 0) {
      for (const entry of docketFilesOrdered) {
        // console.log("entry", entry)
        if (entry.isExternal) {
          // External docket file
          const fileKey = entry.fileKey;
          const tempFilePath = path.join(__dirname, "../dockets", `${path.basename(fileKey)}`);
          const command = new GetObjectCommand({
            Bucket: "encore-sheet",
            Key: fileKey,
          });
          const s3Stream = await s3Client.send(command);
          await new Promise((resolve, reject) => {
            const writeStream = fs.createWriteStream(tempFilePath);
            s3Stream.Body.pipe(writeStream);
            s3Stream.Body.on("error", reject);
            writeStream.on("finish", resolve);
          });
          let fileHeader = "";
          try {
            fileHeader = fs.readFileSync(tempFilePath, { encoding: "utf8", flag: "r" }).slice(0, 4);
          } catch (e) {
            fileHeader = "";
          }
          if (isImageFile(fileKey)) {
            const tempPdfPath = tempFilePath.replace(path.extname(tempFilePath), ".pdf");
            await convertImageToPDF(tempFilePath, tempPdfPath);
            let pdfHeader = "";
            try {
              pdfHeader = fs.readFileSync(tempPdfPath, { encoding: "utf8", flag: "r" }).slice(0, 4);
            } catch (e) {
              pdfHeader = "";
            }
            if (pdfHeader === "%PDF") {
              await merger.add(tempPdfPath);
            }
            fs.unlinkSync(tempFilePath);
            fs.unlinkSync(tempPdfPath);
          } else {
            if (fileHeader === "%PDF") {
              await merger.add(tempFilePath);
            }
            fs.unlinkSync(tempFilePath);
          }
        } else if (entry.masterOrder) {
          // Master order docket
          const order = entry.masterOrder;

          // master order docket or generated docket handling
          // const order = entry.masterOrder;
          if (!order) continue;

          // If order has docket files on S3, add them (in order)
          if (Array.isArray(order.docket) && order.docket.length > 0) {
            for (const fileKey of order.docket) {
              const tempFilePath = path.join(__dirname, "../dockets", `${Date.now()}_${path.basename(fileKey)}`);
              const command = new GetObjectCommand({
                Bucket: "encore-sheet",
                Key: fileKey,
              });
              const s3Stream = await s3Client.send(command);
              await new Promise((resolve, reject) => {
                const writeStream = fs.createWriteStream(tempFilePath);
                s3Stream.Body.pipe(writeStream);
                s3Stream.Body.on("error", reject);
                writeStream.on("finish", resolve);
              });

              // Check PDF header before merging
              let fileHeader = "";
              try {
                fileHeader = fs.readFileSync(tempFilePath, { encoding: "utf8", flag: "r" }).slice(0, 4);
              } catch (e) {
                fileHeader = "";
              }

              if (isImageFile(fileKey)) {
                const tempPdfPath = tempFilePath.replace(path.extname(tempFilePath), ".pdf");
                await convertImageToPDF(tempFilePath, tempPdfPath);
                // Only add if the created PDF is valid
                let pdfHeader = "";
                try {
            pdfHeader = fs.readFileSync(tempPdfPath, { encoding: "utf8", flag: "r" }).slice(0, 4);
                } catch (e) {
            pdfHeader = "";
                }
                if (pdfHeader === "%PDF") {
                await merger.add(tempPdfPath);
                }
                // cleanup
                try { fs.unlinkSync(tempFilePath); } catch (e) {}
                try { fs.unlinkSync(tempPdfPath); } catch (e) {}
              } else {
                // PDF file from S3
                if (fileHeader === "%PDF") {
            await merger.add(tempFilePath);
                }
                try { fs.unlinkSync(tempFilePath); } catch (e) {}
              }
              if (
                  order.order_site_delivery_mud_map &&
                  order.order_site_delivery_mud_map.trim() !== '' &&
                  order.order_site_delivery_mud_map.trim() !== '-'
                  ) {
                  await processMudMap({ order, merger });
              }
            }
          } else {
            // No docket files: render and add generated PDF for this order
            let serialNumber = 1;
            const items = await getOrderItems(order._id);
            const tempFilePath = path.join(__dirname, "../dockets", `order_${order.order_unique_id}.pdf`);

            // Resolve rack names for departments
            const rackNames = {};
            for (const group of items) {
              const deptCode = group.deptDisplayName;
              if (deptCode === "DC") continue;
              const rackingFieldName = deptRackingFieldMap[deptCode];
              const rackingId = order[rackingFieldName];
              if (rackingId) {
                const rack = await RackMaster.findById(rackingId).select("rack_name");
                rackNames[deptCode] = rack ? rack.rack_name : "";
              } else {
                rackNames[deptCode] = "";
              }
            }

            const orderHtmlContent = docketHTMLContent(items, rackNames, serialNumber);

            const browser = await puppeteer.launch({
              headless: true,
              args: ["--no-sandbox", "--disable-setuid-sandbox"],
            });
            const pageP = await browser.newPage();
            await pageP.setContent(orderHtmlContent, { waitUntil: "networkidle0" });

            const logoPath = path.join(__dirname, "../images/docket-logo.png");
            const logoBase64 = fs.readFileSync(logoPath, { encoding: "base64" });
            const logoDataUri = `data:image/png;base64,${logoBase64}`;

          await pageP.pdf({
            path: tempFilePath,
            format: "A4",
            printBackground: true,
            displayHeaderFooter: true,
            headerTemplate: docketHeader(logoDataUri, order),
            footerTemplate: docketFooter(),
            margin: { top: "350px", bottom: "100px" },
          });

            await browser.close();

            // Mark continued text on all but last page and add to merger
            try {
              const pdfBytes = fs.readFileSync(tempFilePath);
              const pdfDoc = await PDFDocument.load(pdfBytes);
              const totalPages = pdfDoc.getPageCount();
              for (let i = 0; i < totalPages; i++) {
                const pageObj = pdfDoc.getPage(i);
                const { width } = pageObj.getSize();
                if (i !== totalPages - 1) {
                pageObj.drawText(`Continued...`, {
                x: width / 2 - 30,
                y: 30,
                size: 9,
                });
                }
              }
              const updatedPdfBytes = await pdfDoc.save();
              fs.writeFileSync(tempFilePath, updatedPdfBytes);
              await merger.add(tempFilePath);
              try { fs.unlinkSync(tempFilePath); } catch (e) {}
              if (
                    order.order_site_delivery_mud_map &&
                    order.order_site_delivery_mud_map.trim() !== '' &&
                    order.order_site_delivery_mud_map.trim() !== '-'
                    ) {
                    await processMudMap({ order, merger });
                }
            } catch (e) {
              // if any PDF post-processing fails, still attempt to add the generated PDF
                try {
                    await merger.add(tempFilePath);
                    try { fs.unlinkSync(tempFilePath); } catch (e) {}
                } catch (errAdd) {
                    try { fs.unlinkSync(tempFilePath); } catch (e) {}
                }
            }
          }
        }
      }
      // Fallback: original logic for non-group-orders
    }else{
      for (const order of Orders) {
        let serialNumber = 1;
        const items = await getOrderItems(order._id);

        const rackNames = {};
        for (const group of items) {
          const deptCode = group.deptDisplayName;
          if (deptCode === "DC") continue;
          const rackingFieldName = deptRackingFieldMap[deptCode];
          const rackingId = order[rackingFieldName];

          if (rackingId) {
            const rack = await RackMaster.findById(rackingId).select("rack_name");
            rackNames[deptCode] = rack ? rack.rack_name : "";
          } else {
            rackNames[deptCode] = "";
          }
        }

        const orderHtmlContent = docketHTMLContent(items, rackNames, serialNumber);

        const browser = await puppeteer.launch({
          headless: true,
          args: ["--no-sandbox", "--disable-setuid-sandbox"],
        });
        const page = await browser.newPage();
        await page.setContent(orderHtmlContent, { waitUntil: "networkidle0" });

        const logoPath = path.join(__dirname, "../images/docket-logo.png");
        const logoBase64 = fs.readFileSync(logoPath, { encoding: "base64" });
        const logoDataUri = `data:image/png;base64,${logoBase64}`;

        const tempFilePath = path.join(__dirname, "../dockets", `order_${order.order_unique_id}.pdf`);

        await page.pdf({
          path: tempFilePath,
          format: "A4",
          printBackground: true,
          displayHeaderFooter: true,
          headerTemplate: docketHeader(logoDataUri, order),
          footerTemplate: docketFooter(),
          margin: { top: "350px", bottom: "100px" },
        });

        await browser.close();
        const pdfBytes = fs.readFileSync(tempFilePath);
        const pdfDoc = await PDFDocument.load(pdfBytes);
        const totalPages = pdfDoc.getPageCount();

        for (let i = 0; i < totalPages; i++) {
          const page = pdfDoc.getPage(i);
          const { width } = page.getSize();
          if (i === totalPages - 1) {
          } else {
            page.drawText(`Continued...`, {
              x: width / 2 - 30,
              y: 30,
              size: 9,
            });
          }
        }
        const updatedPdfBytes = await pdfDoc.save();
        fs.writeFileSync(tempFilePath, updatedPdfBytes);
        await merger.add(tempFilePath);
        fs.unlinkSync(tempFilePath);

        if (
            order.order_site_delivery_mud_map &&
            order.order_site_delivery_mud_map.trim() !== '' &&
            order.order_site_delivery_mud_map.trim() !== '-'
            ) {
            await processMudMap({ order, merger });
        }
      }
    }

    // If there are ExternalOrders, attach their S3 PDFs/images as well (for non-group-orders)
    if (!docketFilesOrdered.length && ExtOrders.length) {
      for (const extOrder of ExtOrders) {
        if (Array.isArray(extOrder.order_docket)) {
          for (const fileKey of extOrder.order_docket) {
            const tempFilePath = path.join(__dirname, "../dockets", `${path.basename(fileKey)}`);
            const command = new GetObjectCommand({
              Bucket: "encore-sheet",
              Key: fileKey,
            });
            const s3Stream = await s3Client.send(command);
            await new Promise((resolve, reject) => {
              const writeStream = fs.createWriteStream(tempFilePath);
              s3Stream.Body.pipe(writeStream);
              s3Stream.Body.on("error", reject);
              writeStream.on("finish", resolve);
            });
            let fileHeader = "";
            try {
              fileHeader = fs.readFileSync(tempFilePath, { encoding: "utf8", flag: "r" }).slice(0, 4);
            } catch (e) {
              fileHeader = "";
            }
            if (isImageFile(fileKey)) {
              const tempPdfPath = tempFilePath.replace(path.extname(tempFilePath), ".pdf");
              await convertImageToPDF(tempFilePath, tempPdfPath);
              let pdfHeader = "";
              try {
                pdfHeader = fs.readFileSync(tempPdfPath, { encoding: "utf8", flag: "r" }).slice(0, 4);
              } catch (e) {
                pdfHeader = "";
              }
              if (pdfHeader === "%PDF") {
                await merger.add(tempPdfPath);
              }
              fs.unlinkSync(tempFilePath);
              fs.unlinkSync(tempPdfPath);
            } else {
              if (fileHeader === "%PDF") {
                await merger.add(tempFilePath);
              }
              fs.unlinkSync(tempFilePath);
            }
          }
        }
      }
    }
    let file_name = req.query.mode === "individual-order" ? `DO_${req.query.orderUID}.pdf` : `Docket_${Date.now()}.pdf`;
        if (sendMailDocket) {
            const outBuffer = await merger.saveAsBuffer();
            const mimeType = "application/pdf";
            await sendMail(file_name, outBuffer, mimeType);
            res.status(200).send("Mail sent successfully");
        } else {
            const finalFilePath = path.join(__dirname, "../dockets", file_name);
            await merger.save(finalFilePath);
            res.status(200).send(`dockets/${path.basename(finalFilePath)}`);
            res.on('finish', () => {
                setTimeout(() => {
                    fs.unlink(finalFilePath, (unlinkError) => {
                        if (unlinkError) {
                            console.error('Error deleting merged PDF:', unlinkError);
                        } else {
                            console.log('Merged PDF deleted successfully:', finalFilePath);
                        }
                    });
                }, 5000);
            });
        }
    } catch (err) {
    logError("generateDocketPDFDocketwise", err, req.user.user_ref_id);
    console.log(err)
    res.status(500).send("Docket Generation Failed");
    }
  
};

async function getOrderItems(orderId) {
  const deptOrder = ["GBIL", "GBI", "J", "ROOF", "FG", "CL", "F", "DC"];
  let groupedOrders = {};
  let deptPiecesCount = {};

  const orderItems = await OrderItem.find({ order_master_id: orderId }).sort({ order_row_index: 1 });
  orderItems.forEach(item => {
    const deptCode = item.dept_code || "F";
    if (!groupedOrders[deptCode]) groupedOrders[deptCode] = [];
    groupedOrders[deptCode].push({
      desc: `${item.order_item_code}: ${item.order_item_description}`,
      pieces: item.order_item_pieces || "N/A",
      length: item.order_item_length || "N/A",
      uom: item.order_item_uom || "LN MTR",
      qty: item.order_item_quantity ? parseFloat(item.order_item_quantity).toFixed(2) : "N/A",
    });

    const pieces = parseFloat(item.order_item_pieces) || 0;
    deptPiecesCount[deptCode] = (deptPiecesCount[deptCode] || 0) + pieces;
  });

  const orderItemsManual = await OrderItemManual.aggregate([{ $match: { order_master_me_id: orderId } }, { $lookup: { from: "departments", localField: "order_item_me_department", foreignField: "_id", as: "departmentsInfo" } }, { $unwind: { path: "$departmentsInfo", preserveNullAndEmptyArrays: true } }, { $sort: { order_row_index: 1 } }]);

  orderItemsManual.forEach(item => {
    const deptCode = item.departmentsInfo?.department_code || "F";
    if (!groupedOrders[deptCode]) groupedOrders[deptCode] = [];
    groupedOrders[deptCode].push({
      desc: `${item.order_item_me_code}: ${item.order_item_me_description}`,
      pieces: item.order_item_me_uom_value || "N/A",
      length: item.order_item_me_length || "N/A",
      uom: item.order_item_me_uom || "N/A",
      qty: item.order_item_me_quantity ? parseFloat(item.order_item_me_quantity).toFixed(2) : "N/A",
    });

    const pieces = parseFloat(item.order_item_me_uom_value) || 0;
    deptPiecesCount[deptCode] = (deptPiecesCount[deptCode] || 0) + pieces;
  });

  const results = [];
  deptOrder.forEach(dept => {
    if (groupedOrders[dept]) {
      results.push({
        deptDisplayName: dept,
        deptCode: dept,
        totalPieces: deptPiecesCount[dept] || 0,
        items: groupedOrders[dept],
      });
    }
  });
  return results;
}

exports.convertQuoteToSaleOrder = async (req, res) => {
  try {
    let quoteObjID = new mongoose.Types.ObjectId(req.params.quoteid);
    let QuoteInfo = await QuotationMaster.findOne({ _id: quoteObjID });
    let quoteMasID = QuoteInfo.quote_unique_id;
    const customerID = QuoteInfo.quote_customer_id;
    const objcustomerID = new mongoose.Types.ObjectId(QuoteInfo.quote_customer_id);
    const ordercustomercontactid = QuoteInfo.quote_customer_contact_id;
    const objordercustomercontactid = new mongoose.Types.ObjectId(QuoteInfo.quote_customer_contact_id);
    let orderdeliverydate = QuoteInfo.quote_delivery_date;
    let orderdeliverytime = QuoteInfo.quote_delivery_time;
    let orderdeliverysession = QuoteInfo.quote_delivery_session;
    const orderPOnumber = QuoteInfo.quote_customer_PO_number;
    const orderStatus = process.env.MasOrdStatus1;
    const orderUser = new mongoose.Types.ObjectId(req.user.user_ref_id);
    const orderdeliveryaddressmode = QuoteInfo.quote_delivery_address_mode;
    const orderflashingchecker = QuoteInfo.quote_flashing_checker;
    const ordercreatorID = new mongoose.Types.ObjectId(req.user.user_ref_id);
    let ordersitedeliveryattentionperson = QuoteInfo.quote_site_delivery_attention_person;
    let ordersitedeliveryattentioncontact = QuoteInfo.quote_site_delivery_attention_contact;
    let ordersitedeliveryaddress1 = QuoteInfo.quote_site_delivery_address1;
    let ordersitedeliveryaddress2 = QuoteInfo.quote_site_delivery_address2;
    let ordersitedeliverycity = QuoteInfo.quote_site_delivery_city;
    let ordersitedeliverycountry = QuoteInfo.quote_site_delivery_country;
    let ordersitedeliverypostalcode = QuoteInfo.quote_site_delivery_postalcode;
    let ordersitedeliverystate = QuoteInfo.quote_site_delivery_state;
    let orderstoredeliveryaddress1 = QuoteInfo.quote_store_delivery_address1;
    let orderstoredeliveryaddress2 = QuoteInfo.quote_store_delivery_address2;
    let orderstoredeliverycity = QuoteInfo.quote_store_delivery_city;
    let orderstoredeliverycountry = QuoteInfo.quote_store_delivery_country;
    let orderstoredeliverypostalcode = QuoteInfo.quote_store_delivery_postalcode;
    let orderstoredeliverystate = QuoteInfo.quote_store_delivery_state;
    let quoteoverallprice = QuoteInfo.quote_Overall_Price;
    let quotecustomercontactphone = QuoteInfo.quote_customer_contact_phone;
    let quotecustomercontactemail = QuoteInfo.quote_customer_contact_email;
    let quotefarsuburb = QuoteInfo.quote_far_suburb;
    let fOrderProdPushStatus;
    let MYOB_ROW_ID;
    let MYOB_ORDER_ID;

    let pochecker = false;
    let pocheckexst = await OrderMaster.find({ order_customer_PO_number: orderPOnumber });
    if (pocheckexst.length > 0) {
      pochecker = true;
    }

    let now = new Date();
    let options = { timeZone: "Australia/Melbourne", hour12: true };
    let datenow = new Intl.DateTimeFormat("en-US", options).format(now);
    let melbourneTime = new Date(now.toLocaleString("en-US", { timeZone: "Australia/Melbourne" }));
    let formattedNow =
      [("0" + melbourneTime.getDate()).slice(-2), ("0" + (melbourneTime.getMonth() + 1)).slice(-2), melbourneTime.getFullYear()].join("-") +
      " " +
      melbourneTime
        .toLocaleTimeString("en-US", {
          hour: "2-digit",
          minute: "2-digit",
          hour12: true,
        })
        .toLowerCase()
        ?.replace(":", ":")
        ?.replace(" ", " ");
    formattedNow = formattedNow?.replace(/\.(\d{2})/, ":$1");

    let formattedDate = formatDateString(orderdeliverydate);
    orderdeliverydate = new Date(orderdeliverydate).toUTCString();
    let formattedMYOBDate;
    let dateObj = DateTime.fromRFC2822(orderdeliverydate, { zone: "Australia/Sydney" });
    if (!dateObj.isValid) {
      console.error("Invalid DateTime:", dateObj.invalidExplanation);
    } else {
      if (dateObj.isInDST) {
        dateObj = dateObj.plus({ hours: 11 });
      } else {
        dateObj = dateObj.plus({ hours: 10 });
      }
      formattedMYOBDate = dateObj.toFormat("yyyy-MM-dd'T'HH:mm:ssZZ");
    }

    let currentDateObj = DateTime.now().setZone("Australia/Sydney");
    let formattedCurrentDate;
    if (!currentDateObj.isValid) {
      console.error("Invalid DateTime:", currentDateObj.invalidExplanation);
    } else {
      if (currentDateObj.isInDST) {
        currentDateObj = currentDateObj.plus({ hours: 11 });
      } else {
        currentDateObj = currentDateObj.plus({ hours: 10 });
      }
      formattedCurrentDate = currentDateObj.toFormat("yyyy-MM-dd'T'HH:mm:ssZZ");
    }

    let timeOnlyStr = orderdeliverytime?.replace(/ AM| PM/i, "").trim();
    if (orderdeliverysession === "A/T") {
      timeOnlyStr = "A/T";
    } else {
      timeOnlyStr = orderdeliverytime;
    }

    let ordAccountDetails = await Account.find({ _id: objcustomerID });
    let cusUID = ordAccountDetails[0].account_UID;

    //MYOB Data Insetion Procedure Starts
    let aspxAuthValue = await loginMyob();
    if (aspxAuthValue) {
      const apiUrl = "" + process.env.MYOBURL + "SalesOrder";
      const aspxAuthValue = fs.readFileSync("aspxauth.txt", "utf8");
      let OrderData = {
        CustomerID: { value: "" + cusUID + "" },
        Hold: { value: false },
        OrderType: { value: "SO" },
        CustomerOrder: { value: "" + orderPOnumber + "" },
        RequestedOn: { value: "" + formattedMYOBDate + "" },
        Date: { value: "" + formattedCurrentDate + "" },
      };
      if (orderdeliveryaddressmode === "1") {
        OrderData.ShipToAddressOverride = {
          value: true,
        };
        OrderData.ShipToContactOverride = {
          value: true,
        };
        OrderData.ShipToAddress = {
          AddressLine1: {
            value: "" + timeOnlyStr + "",
          },
          AddressLine2: {
            value: "" + ordersitedeliveryaddress1 + "",
          },
          City: {
            value: "" + ordersitedeliverycity + "",
          },
          Country: {
            value: "" + ordersitedeliverycountry + "",
          },
          PostalCode: {
            value: "" + ordersitedeliverypostalcode + "",
          },
          State: {
            value: "" + ordersitedeliverystate + "",
          },
        };
        OrderData.ShipToContact = {
          Attention: {
            value: "" + ordersitedeliveryattentionperson + "",
          },
          Phone1: {
            value: "" + ordersitedeliveryattentioncontact + "",
          },
        };
      }
      if (orderdeliveryaddressmode === "2") {
        OrderData.ShipToAddressOverride = {
          value: true,
        };
        OrderData.ShipToAddress = {
          AddressLine1: {
            value: "" + timeOnlyStr + "",
          },
          AddressLine2: {
            value: "-",
          },
          City: {
            value: "PICK UP",
          },
          Country: {
            value: "AU",
          },
          PostalCode: {
            value: "3803",
          },
          State: {
            value: "VIC",
          },
        };
      }
      const headers = {
        Cookie: generateCookie(aspxAuthValue),
        "Content-Type": "application/json",
      };
      const response = await axios.put(apiUrl, OrderData, { headers });
      MYOB_ROW_ID = response.data.id;
      MYOB_ORDER_ID = response.data.OrderNbr.value;
    } else {
      res.status(500).send("Login Failed");
    }
    await logoutMyob();

    //CRM Data Insetion Procedure Starts
    if (MYOB_ROW_ID && MYOB_ORDER_ID) {
      console.log("MYOB Insertion Sucesfully Completed. Storing Data in CRM Started...");
      await AccountContact.find({ _id: objordercustomercontactid });
      let booleanFlasingChecker = JSON.parse(QuoteInfo.quote_flashing_checker);
      if (booleanFlasingChecker === true) {
        fOrderProdPushStatus = 1;
      } else {
        fOrderProdPushStatus = 0;
      }

      const orderData = new OrderMaster({
        order_unique_id: MYOB_ORDER_ID,
        order_myob_row_id: MYOB_ROW_ID,
        order_customer_id: customerID,
        order_customer_contact_id: ordercustomercontactid,
        order_delivery_date: orderdeliverydate,
        order_delivery_date_str: formattedDate,
        order_delivery_time: orderdeliverytime,
        order_delivery_session: orderdeliverysession,
        created_str: formattedNow,
        order_customer_PO_number: orderPOnumber,
        order_po_checker: pochecker,
        order_delivery_address_mode: orderdeliveryaddressmode,
        order_site_delivery_attention_person: ordersitedeliveryattentionperson,
        order_site_delivery_attention_contact: ordersitedeliveryattentioncontact,
        order_site_delivery_address1: ordersitedeliveryaddress1,
        order_site_delivery_address2: ordersitedeliveryaddress2,
        order_site_delivery_city: ordersitedeliverycity,
        order_site_delivery_country: ordersitedeliverycountry,
        order_site_delivery_postalcode: ordersitedeliverypostalcode,
        order_site_delivery_state: ordersitedeliverystate,
        order_flashing_checker: orderflashingchecker,
        order_created_person: ordercreatorID,
        order_status: orderStatus,
        order_quote_checker_status: true,
        order_quote_id: quoteMasID,
        order_quote_no: quoteObjID,
        order_quote_price: quoteoverallprice,
        order_far_suburb: quotefarsuburb,
        user: orderUser,
        f_order_prod_push_status: fOrderProdPushStatus,
        order_customer_name: ordAccountDetails[0].account_Name,
        order_customer_UID: ordAccountDetails[0].account_UID,
        order_store_delivery_address1: orderstoredeliveryaddress1,
        order_store_delivery_address2: orderstoredeliveryaddress2,
        order_store_delivery_city: orderstoredeliverycity,
        order_store_delivery_country: orderstoredeliverycountry,
        order_store_delivery_postalcode: orderstoredeliverypostalcode,
        order_store_delivery_state: orderstoredeliverystate,
        order_customer_contact_name: "-",
        order_customer_contact_phone: quotecustomercontactphone,
        order_customer_contact_email: quotecustomercontactemail,
      });
      const orderDataInfo = await orderData.save();
      if (orderDataInfo) {
        let convertQTitemstoSOitems = await conversionOfQTitemstoSOitems(quoteObjID, quoteMasID, orderDataInfo.order_unique_id, orderDataInfo._id);
        if (convertQTitemstoSOitems === 1) {
          let updateData = { $set: { quote_status: "Quote Converted To SO" } };
          const conditions = { _id: quoteObjID };
          const quotestatus = await QuotationMaster.findByIdAndUpdate(conditions, updateData, attrs);
        }
        const userID = new mongoose.Types.ObjectId(req.user.user_ref_id);
        const userOrderData = new UserOrder({
          user_ID: userID,
          user_Order_ID: MYOB_ORDER_ID,
        });
        await userOrderData.save();
      }
      res.status(200).send(orderDataInfo);
    }
  } catch (err) {
    logError("convertQuoteToSaleOrder", err, req.user.user_ref_id);
    res.status(500).send("Quote to Sale Order Conversion Failed.");
  }
};

async function conversionOfQTitemstoSOitems(orderquoteno, quoteMasID, ordersaleorderno, ordersaleorderid) {
  let ManualItemAddingStatus = 0;
  let quoteMasDetails = await QuotationMaster.find({ _id: orderquoteno });
  if (quoteMasDetails) {
    let quoteCustomItems = await QuotationItemManual.find({ quote_master_me_id: orderquoteno });
    let quoteCustomItemsCount = quoteCustomItems.length;
    let indexCounter = 0;
    for (let i = 0; i < quoteCustomItemsCount; i++) {
      const NewIndex = indexCounter;
      indexCounter++;

      const orderItemObj = new OrderItemManual({
        order_row_index: NewIndex,
        order_master_me_id: ordersaleorderid,
        order_unique_me_id: ordersaleorderno,
        order_item_me_code: quoteCustomItems[i].quote_item_me_code,
        order_item_me_description: quoteCustomItems[i].quote_item_me_description,
        order_item_me_department: quoteCustomItems[i].quote_item_me_department,
        order_item_me_department_code: quoteCustomItems[i].quote_item_me_department_code,
        order_item_me_length: quoteCustomItems[i].quote_item_me_length,
        order_item_me_uom: quoteCustomItems[i].quote_item_me_uom,
        order_item_me_pieces: quoteCustomItems[i].quote_item_me_pieces,
        order_item_qty_me_price: quoteCustomItems[i].quote_item_qty_me_price,
        order_item_special_me_price: quoteCustomItems[i].quote_item_special_me_price,
        order_item_special_me_price_original: quoteCustomItems[i].quote_item_special_me_price_original,
        order_item_me_discount: quoteCustomItems[i].quote_item_me_discount,
        order_item_me_discounted_amount: quoteCustomItems[i].quote_item_me_discounted_amount,
        order_item_qty_me_discounted_price: quoteCustomItems[i].quote_item_qty_me_discounted_price,
        order_item_me_uom_value: quoteCustomItems[i].quote_item_me_uom_value,
        order_item_me_quantity: quoteCustomItems[i].quote_item_me_quantity,
        order_item_me_flag: quoteCustomItems[i].quote_item_me_flag,
        created: quoteCustomItems[i].created,
      });
      let OrderManualItems = await orderItemObj.save();
      if (OrderManualItems) {
        let DeptDetails = await Department.find({ _id: quoteCustomItems[i].quote_item_me_department });
        let DeptCode = DeptDetails[0].department_code;
        let updateData;
        if (DeptCode === "FG") {
          updateData = { $set: { fg_order_prod_push_status: "1" } };
        }
        if (DeptCode === "CL") {
          updateData = { $set: { cl_order_prod_push_status: "1" } };
        }
        if (DeptCode === "J") {
          updateData = { $set: { j_order_prod_push_status: "1" } };
        }
        if (DeptCode === "ROOF") {
          updateData = { $set: { roof_order_prod_push_status: "1" } };
        }
        if (DeptCode === "GBI") {
          updateData = { $set: { gbi_order_prod_push_status: "1" } };
        }
        if (DeptCode === "GBIL") {
          updateData = { $set: { gbil_order_prod_push_status: "1" } };
        }
        const conditions = { order_unique_id: ordersaleorderno };
        const quotestatus = await OrderMaster.findOneAndUpdate(conditions, updateData, attrs);
        if (quotestatus) {
          ManualItemAddingStatus = 1;
        }
      }
    }
    ManualItemAddingStatus = 1;
    await RecalculateOverallOrderTotalFn(ordersaleorderid);
  } else {
    ManualItemAddingStatus = 0;
  }
  return ManualItemAddingStatus;
}

exports.uploadQuotationPaymentReciept = async (req, res) => {
  try {
    const quoteMasID = new mongoose.Types.ObjectId(req.params.quoteid);
    let quoteImages = [];
    if (req.files && req.files.length > 0) {
      quoteImages = await Promise.all(
        req.files.map(async file => {
          const command = new GetObjectCommand({
            Bucket: "encore-sheet",
            Key: file.key,
          });
          const url = await getSignedUrl(s3Client, command, { expiresIn: 3600 }); // URL expires in 1 hour
          return { key: file.key, url };
        })
      );
    }

    let updateData = { $addToSet: { quote_payment_images: { $each: quoteImages.map(img => img.key) } } };
    const conditions = { _id: quoteMasID };
    await QuotationMaster.findByIdAndUpdate(conditions, updateData, { new: true });
    res.status(200).send("Data Updated Successfully");
  } catch (err) {
    logError("uploadQuotationPaymentReciept", err, req.user.user_ref_id);
    res.status(500).send("Data Upload Failed");
  }
};

exports.deleteQuotationPaymentReciept = async (req, res) => {
  try {
    const quoteMasID = new mongoose.Types.ObjectId(req.params.quoteid);
    const imageIndex = parseInt(req.params.indexid); // Parse the index as an integer

    let orderImagesField;
    const quoteInfo = await QuotationMaster.findById(quoteMasID);
    if (!quoteInfo) {
      return res.status(500).send("Quote not found");
    }
    orderImagesField = "quote_payment_images";

    const quoteImages = quoteInfo[orderImagesField];
    if (imageIndex >= quoteImages.length || imageIndex < 0) {
      return res.status(500).send("Invalid image index");
    }
    const imageNameToDelete = quoteImages[imageIndex];

    const deleteParams = {
      Bucket: "encore-sheet", // Your S3 bucket name
      Key: imageNameToDelete,
    };
    await s3Client.send(new DeleteObjectCommand(deleteParams));

    quoteImages.splice(imageIndex, 1);
    quoteInfo[orderImagesField] = quoteImages;
    await quoteInfo.save();
    res.status(200).send("Data Deleted Successfully");
  } catch (err) {
    logError("deleteQuotationPaymentReciept", err, req.user.user_ref_id);
    res.status(500).send("Data Deletion Failed.");
  }
};

exports.fetchQuotationPaymentReciept = async (req, res) => {
  try {
    const quoteMasID = new mongoose.Types.ObjectId(req.params.quoteid);
    let fieldToUpdate = "quote_payment_images";
    const quoteInfo = await QuotationMaster.findById(quoteMasID).lean().exec();
    if (!quoteInfo) {
      return res.status(500).send("Quote not found");
    }

    const imageKeys = quoteInfo[fieldToUpdate];
    const signedUrls = await Promise.all(
      imageKeys.map(async key => {
        const command = new GetObjectCommand({
          Bucket: "encore-sheet",
          Key: key,
        });
        const url = await getSignedUrl(s3Client, command, { expiresIn: 3600 }); // URL expires in 1 hour
        return { key, url };
      })
    );

    const response = {
      _id: quoteInfo._id,
      quote_unique_id: quoteInfo.quote_unique_id,
      imageUrls: signedUrls,
    };
    res.status(200).json(response);
  } catch (err) {
    logError("fetchQuotationPaymentReciept", err, req.user.user_ref_id);
    res.status(500).send("Data Fetching Failed.");
  }
};

exports.updateSpecificQuotationItemDetails = async (req, res) => {
  try {
    const quoteID = new mongoose.Types.ObjectId(req.params.quoteid);
    const quoteItemData = req.body;
    let quoteItemDetails = await QuotationItem.find({ _id: quoteID });
    let quoteMasterID = quoteItemDetails[0].quote_master_id;
    let quoteitemqtyprice = req.body.quote_item_price;
    let total_special_price = "0";
    let discountPercentage = req.body.quote_item_discount;
    let length = req.body.quote_item_length;
    if (length < 1000) {
      length = 1000;
    }
    let discountedUP = 0;
    let discountedTA = 0;
    let discountedTP;

    let quoteitemquantity = parseFloat(length / 1000) * parseFloat(req.body.quote_item_pieces);
    total_special_price = parseFloat(quoteitemqtyprice) * parseFloat(quoteitemquantity);
    discountedTP = total_special_price;
    discountedUP = parseFloat(quoteitemqtyprice);
    if (discountPercentage > 0) {
      discountedUP = parseFloat(quoteitemqtyprice) - (parseFloat(quoteitemqtyprice) * discountPercentage) / 100;
      discountedTP = parseFloat(discountedUP) * parseFloat(quoteitemquantity);
      discountedTA = total_special_price - discountedTP;
    }

    quoteItemData.quote_item_code = req.body.quote_item_code;
    quoteItemData.quote_item_quantity = quoteitemquantity;
    quoteItemData.quote_item_special_price = discountedTP;
    quoteItemData.quote_item_special_price_original = total_special_price;
    quoteItemData.quote_item_discount = discountPercentage;
    quoteItemData.quote_item_discounted_amount = discountedTA;
    quoteItemData.quote_item_qty_discounted_price = discountedUP;
    let quoteItemInfo = await QuotationItem.findByIdAndUpdate(quoteID, quoteItemData, attrs);
    if (quoteItemInfo) {
      await RecalculateOverallQuotesTotalFn(quoteMasterID);
    }
    res.status(200).send(quoteItemInfo);
    res.end();
  } catch (err) {
    logError("updateSpecificQuotationItemDetails", err, req.user.user_ref_id);
    res.status(500).send("Data Updation Failed.");
  }
};

exports.fetchSpecificQuotationItemDetails = async (req, res) => {
  try {
    const quoteItemID = new mongoose.Types.ObjectId(req.params.quoteitmid);
    let quoteItemData = await QuotationItem.find({ _id: quoteItemID });
    res.send(quoteItemData).status(200).end();
  } catch (err) {
    logError("fetchSpecificQuotationItemDetails", err, req.user.user_ref_id);
    res.status(500).send("Data Fetching Failed");
  }
};

exports.fetchQuotationLineitemsDetails = async (req, res) => {
  try {
    let quoteID = new mongoose.Types.ObjectId(req.params.quoteid);
    const quoteDetails = [];

    let quoteMaster = await QuotationMaster.findOne({ _id: quoteID });
    if (!quoteMaster) {
      return res.status(500).send({ error: "Quote not found" }).end();
    }

    let FlashingFlag = quoteMaster.quote_flashing_checker;
    let quoteItems = [];
    let quoteItemsCustom = [];

    // if (quoteMaster.f_quote_prod_push_status === 2) {

    // Remove condition to show line items
      quoteItems = await QuotationItem.aggregate([
        { $match: { quote_master_id: quoteID } },
        { $sort: { created: 1 } },
        { $lookup: { from: "coreproducts", as: "materialsInfo", localField: "quote_item_material", foreignField: "_id" } },
        { $lookup: { from: "productcolors", as: "colorInfo", localField: "quote_item_color", foreignField: "_id" } },
        { $lookup: { from: "productgirths", as: "girthInfo", localField: "quote_item_round_grith", foreignField: "_id" } },
        { $lookup: { from: "productfolds", as: "foldInfo", localField: "quote_item_fold", foreignField: "_id" } },
        { $unwind: { path: "$materialsInfo", preserveNullAndEmptyArrays: true } },
        { $unwind: { path: "$colorInfo", preserveNullAndEmptyArrays: true } },
        { $unwind: { path: "$girthInfo", preserveNullAndEmptyArrays: true } },
        { $unwind: { path: "$foldInfo", preserveNullAndEmptyArrays: true } },
        {
          $project: {
            _id: 1,
            quote_master_id: 1,
            quote_unique_id: 1,
            quote_item_unique_id: 1,
            quote_item_exact_grith: 1,
            quote_item_exact_fold: 1,
            quote_item_price: 1,
            quote_item_qty_price: 1,
            quote_item_special_price: 1,
            quote_item_special_price_original: 1,
            quote_item_discount: 1,
            quote_item_discounted_amount: 1,
            quote_item_qty_discounted_price: 1,
            quote_item_code: 1,
            quote_item_description: 1,
            quote_item_quantity: 1,
            quote_item_pieces: 1,
            quote_item_length: 1,
            quote_item_flag: 1,
            quote_item_designer: 1,
            quote_item_shape_id: 1,
            quote_row_index: 1,
            core_Product_Name: "$materialsInfo.core_Product_Name",
            core_Product_Thickness: "$materialsInfo.core_Product_Thickness",
            core_Product_Ref_Id: "$materialsInfo.core_Product_Ref_Id",
            product_Color: "$colorInfo.product_Color",
            product_Color_Hex_Code: "$colorInfo.product_Color_Hex_Code",
            product_Color_Special_Price: "$colorInfo.product_Color_Special_Price",
            product_Girth: "$girthInfo.product_Girth",
            product_Fold: "$foldInfo.product_Fold",
            created: 1,
          },
        },
      ]);
    // }
      // If all quote_row_index are the same, sort by created
      if(quoteItems.length > 1 && quoteItems.every(item => item.quote_row_index === quoteItems[0].quote_row_index)) {
        quoteItems.sort((a, b) => new Date(a.created) - new Date(b.created));
      }

    quoteItemsCustom = await QuotationItemManual.aggregate([
      { $match: { quote_master_me_id: quoteID } },
      { $sort: { created: 1 } },
      { $lookup: { from: "departments", as: "departments", localField: "quote_item_me_department", foreignField: "_id" } },
      { $unwind: { path: "$departments", preserveNullAndEmptyArrays: true } },
      {
        $project: {
          _id: 1,
          quote_item_me_flag: 1,
          quote_master_me_id: 1,
          quote_unique_me_id: 1,
          quote_item_unique_me_id: 1,
          quote_item_me_material: 1,
          quote_item_me_color: 1,
          quote_item_exact_me_grith: 1,
          quote_item_round_me_grith: 1,
          quote_item_me_fold: 1,
          quote_item_me_thickness: 1,
          quote_item_me_length: 1,
          quote_item_me_uom: 1,
          quote_item_me_uom_value: 1,
          quote_item_me_quantity: 1,
          quote_item_me_pieces: 1,
          quote_item_me_price: 1,
          quote_item_qty_me_price: 1,
          quote_item_special_me_price: 1,
          quote_item_special_me_price_original: 1,
          quote_item_me_discount: 1,
          quote_item_me_discounted_amount: 1,
          quote_item_qty_me_discounted_price: 1,
          quote_item_me_code: 1,
          quote_item_me_description: 1,
          quote_item_me_flag: 1,
          quote_item_me_department: 1,
          created: 1,
          departments: "$departments.department_name",
        },
      },
    ]);

    const orderNumber = quoteMaster.quote_unique_id;
    const templates = await Template.find({ orderNumber});
    if (templates.length === 0) {
      console.log("No templates found for order number:", orderNumber);
      return res.status(200).send([...quoteItems, ...quoteItemsCustom]).end();
    }

    const jobIdCount = templates?.reduce((acc, item) => {
      return acc + (item?.swiJobIds?.length || 0);
    }, 0);
    console.log("Total Job IDs count from templates:", jobIdCount, "for order:", quoteItems?.length);
    if (quoteItems?.length !== jobIdCount && quoteMaster?.quote_flashing_checker) {
      console.log("Mismatch in order items and job IDs count. Fetching sub-items from design tool.");
      logError("fetchQuotationLineitemsDetails", new Error(`Mismatch in order items and job IDs count for quote ${quoteID}`), req.user.user_ref_id);
      quoteItems = await fetchQuotationFlashingsFromDesigntoolFn(quoteID, templates);
      if (quoteItems?.errorMessage) {
        console.error("Error fetching quote items from design tool:", quoteItems.errorMessage);
        return res.status(500).send(quoteItems.errorMessage);
      }

    }

    const combinedItems = [...quoteItems, ...quoteItemsCustom];
    res.status(200).send(combinedItems).end();
  } catch (err) {
    logError("fetchQuotationLineitemsDetails", err, req.user.user_ref_id);
    res.status(500).send("Data Fetching Failed");
  }
};

exports.remakeSaleOrder = async (req, res) => {
  try {
    const orderID = req.params.orderid;
    const ordMasID = new mongoose.Types.ObjectId(orderID);
    const Flag = req.body.order_remake_checker;
    let orderMasterInfo = await OrderMaster.findOne({ _id: orderID });
    let status = orderMasterInfo.order_status;
    let ordStr = orderMasterInfo.order_unique_id;
    if (status === "Order Cancelled") {
      const err = new Error("Attempt To Push Cancelled Order " + ordStr + " To Remake.");
      logError("remakeSaleOrder", err, req.user.user_ref_id);
      return res.status(500).send("Cancelled Order. Please Recheck.");
    }

    if (Flag === true) {
      await OrderItem.updateMany({ order_master_id: ordMasID }, [
        {
          $set: {
            order_item_special_price: 0,
            order_item_special_price_original: 0,
            order_item_discount: 0,
            order_item_discounted_amount: 0,
            order_item_price: 0,
            order_item_qty_discounted_price: "$order_item_price",
            order_item_remake: true,
            order_item_qty_discounted_price: "0"
          },
        },
      ]);
      await OrderItemManual.updateMany({ order_master_me_id: ordMasID }, [
        {
          $set: {
            order_item_qty_me_price: 0,
            order_item_special_me_price: 0,
            order_item_special_me_price_original: 0,
            order_item_me_discount: 0,
            order_item_me_discounted_amount: 0,
            order_item_qty_me_discounted_price: "$order_item_qty_me_price",
            order_item_me_remake: true,
            order_item_qty_me_discounted_price: "0"
          },
        },
      ]);
      await OrderMaster.updateMany({ _id: ordMasID }, { $set: { order_remake_checker: true } });
      await RecalculateOverallOrderTotalFn(ordMasID);
      res.status(200).send("Remake Enabled. Order prices reset.");
    } else {
      await OrderItem.updateMany({ order_master_id: ordMasID }, { $set: { order_item_remake: false } });
      await OrderItemManual.updateMany({ order_master_me_id: ordMasID }, { $set: { order_item_me_remake: false } });
      await OrderMaster.updateMany({ _id: ordMasID }, { $set: { order_remake_checker: false } });
      res.status(200).send("Remake Disabled.");
    }
  } catch (err) {
    logError("remakeSaleOrder", err, req.user.user_ref_id);
    res.status(500).send("Remake Failed.");
  }
};

exports.generateQuotationDocket = async (req, res) => {
  try {
    const PDFMerger = (await import("pdf-merger-js")).default;
    let matchCondition = {};
    if (req.params.quotesid) {
      matchCondition._id = new mongoose.Types.ObjectId(req.params.quotesid);
    }

    let Quote = await QuotationMaster.aggregate([
      { $match: matchCondition },
      { $lookup: { from: "accounts", as: "accountsInfo", localField: "quote_customer_id", foreignField: "_id" } },
      { $unwind: { path: "$accountsInfo", preserveNullAndEmptyArrays: true } },
      {
        $project: {
          _id: 1,
          quote_unique_id: 1,
          quote_customer_id: 1,
          quote_customer_UID: 1,
          quote_delivery_address_mode: 1,
          quote_delivery_date_str: 1,
          quote_delivery_time: 1,
          quote_delivery_session: 1,
          created_str: 1,
          quote_customer_name: 1,
          quote_store_delivery_address1: 1,
          quote_store_delivery_city: 1,
          quote_store_delivery_country: 1,
          quote_store_delivery_postalcode: 1,
          quote_store_delivery_state: 1,
          quote_customer_contact_phone: 1,
          quote_customer_contact_email: 1,
          quote_site_delivery_attention_person: 1,
          quote_site_delivery_attention_contact: 1,
          quote_customer_contact_phone: 1,
          quote_site_delivery_address2: 1,
          quote_Overall_Price: 1,
          quote_GST_EXP_Total: 1,
          quote_GST_Taxable_Total: 1,
          quote_Discount_Total: 1,
          quote_Tax_Total: 1,
          quote_site_delivery_address1: 1,
          quote_site_delivery_city: 1,
          quote_site_delivery_country: 1,
          quote_site_delivery_postalcode: 1,
          quote_site_delivery_state: 1,
          quote_customer_PO_number: 1,
          quote_delivery_date: 1,
          created: 1,
          account_Name: "$accountsInfo.account_Name",
          account_Terms: "$accountsInfo.account_Terms",
          account_Address_line_one: "$accountsInfo.account_Address_line_one",
          account_Address_line_two: "$accountsInfo.account_Address_line_two",
          account_Address_Country: "$accountsInfo.account_Address_Country",
          account_Address_State: "$accountsInfo.account_Address_State",
          account_Address_City: "$accountsInfo.account_Address_City",
          account_Address_PostalCode: "$accountsInfo.account_Address_PostalCode",
          account_Address_Phone: "$accountsInfo.account_Address_Phone",
          account_Address_Email: "$accountsInfo.account_Address_Email",
        },
      },
    ]);
    if (!Quote.length) return res.status(500).send("No Quote Found!");

    const merger = new PDFMerger();
    const deptNames = {
      CL: "CLADDING",
      J: "JOBBING",
      FG: "FASCIA GUTTER",
      DC: "DELIVERY CHARGES",
      ROOF: "ROOFING",
      F: "FLASHING",
      GBI: "GBI",
      GBIL: "GBI.L",
    };

    const getDeptName = key => deptNames[key?.toUpperCase()] || key;
    for (const quote of Quote) {
      let serialNumber = 1;
      const items = await getQuoteItems(quote._id);
      for (const group of items) {
        const deptCode = group.deptDisplayName;
        if (deptCode === "DC") continue;
      }

      const deptSummaryTable = `
                <table cellpadding="2" cellspacing="0" width="100%" style="width:100%; margin-bottom:8px; text-align:left; table-layout: fixed">
                    <thead style="background-color:#000;color:#fff;font-size:10px;">
                        <tr>
                            ${items
                              .filter(group => group.deptDisplayName !== "DC")
                              .map(
                                group => `
                            <th style="padding:2px 4px; width: 50px;">${group.deptDisplayName}</th>
                        `
                              )
                              .join("")}
                        </tr>
                    </thead>
                    <tbody style="color:#000;font-size:11px;">
                        <tr style="font-size:11px;">
                            ${items
                              .filter(group => group.deptDisplayName !== "DC")
                              .map(group => {
                                const deptCode = group.deptDisplayName;
                                const totalPieces = group.totalPieces;
                                const countDisplay = `${totalPieces}`;
                                return `<td style="padding:4px;">${countDisplay}</td>`;
                              })
                              .join("")}
                        </tr>
                    </tbody>
                </table>
            `;

      const quoteHtmlContent = `
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
                    <th align="left">NO</th>
                    <th align="left">ITEM</th>
                    <th align="left">PIECES</th>
                    <th align="left">LENGTH</th>
                    <th align="left">QTY</th>
                    <th align="left" width="50">UOM</th>
                    <th align="right">PRICE</th>
                    <th align="right">DISC</th>
                    <th align="right" >EXT PRICE</th>
                </tr>
            </thead>
            <tbody style="color:#000;font-size:11px;">
            ${items
              .map(
                group => `
                ${group.items
                  .map(
                    item => `
                    <tr style="font-size:11px;">
                        <td>${serialNumber++}</td>
                        <td>${item.desc}</td>
                        <td>${item.pieces}</td>
                        <td>${item.length}</td>
                        <td>${item.qty}</td>   
                        <td>${item.uom}</td>
                        <td align="right">${item.price}</td>
                        <td align="right">${parseFloat(item.disc) % 1 === 0 ? parseInt(item.disc) : parseFloat(item.disc)}%</td>
                        <td align="right">${item.extprice}</td>
                    </tr>
                `
                  )
                  .join("")}
            `
              )
              .join("")}
            </tbody></table></body></html>`;

      const browser = await puppeteer.launch({
        headless: true,
        args: ["--no-sandbox", "--disable-setuid-sandbox"],
      });
      const page = await browser.newPage();
      await page.setContent(quoteHtmlContent, { waitUntil: "networkidle0" });
      const logoPath = path.join(__dirname, "../images/docket-logo.png");
      const logoBase64 = fs.readFileSync(logoPath, { encoding: "base64" });
      const logoDataUri = `data:image/png;base64,${logoBase64}`;
      const tempFilePath = path.join(__dirname, "../dockets", `quote_${quote.quote_unique_id}.pdf`);
      await page.pdf({
        path: tempFilePath,
        format: "A4",
        printBackground: true,
        displayHeaderFooter: true,
        headerTemplate: `
             <div style="display: flex; flex-direction: column; margin:25px 50px 50px 50px; width: calc(100% - 100px);">
                <div style="display: flex; width: 100%; margin-bottom: 25px;">
                    <div style="width: 50%;display:flex;align-items:start;">   
                            <div><img src="${logoDataUri}" alt="ENCORE" style="max-width:100px; margin-right: 10px"></div>
                            <p style="font-family: Arial, Helvetica, sans-serif; font-size:12px;">ENCORE SHEETMETAL<br>67 QUANTUM CLOSE<br>DANDENONG SOUTH, VIC, 3175<br>Phone: 03 9999 7800<br>Web: encoresheetmetal.com.au<br>ABN: 47631765163</p>
                    </div>
                    <div style="width: 50%; display:flex;justify-content: flex-end">
                        <div style="width:230px;display:block;">
                            <h2 style="font-family: Arial, Helvetica, sans-serif; font-size:24px; margin: 0 0 5px 0;text-align:right;width:100%;">Quotation</h2>
                            <table cellpadding="1" cellspacing="0" width="100%" style="font-family: Arial, Helvetica, sans-serif; font-size:12px; width: 100%;">
                                <tr>
                                    <td align="left" ><strong>Quote No.:</strong></td>
                                    <td align="right" width="50%"><strong style="font-size:13px;">${quote.quote_unique_id}</strong></td>
                                </tr>
                                <tr>
                                    <td align="left"><strong>Quote Date:</strong></td>
                                    <td align="right">
                                        ${quote.created_str?.split(" ")[0]?.replace(/-/g, "/")}
                                    </td>
                                </tr>
                                <tr>
                                    <td><strong>Delivery Date:</strong></td>
                                    <td align="right">
                                        ${quote.quote_delivery_date_str?.split(" ")[0]?.replace(/-/g, "/")}
                                    </td>
                                </tr>
                                <tr><td><strong>Customer PO:</strong></td><td align="right">${quote.quote_customer_PO_number}</td></tr>
                                <tr>
                                    <td><strong>Time Required:</strong></td>
                                    <td align="right">
                                        ${(() => {
                                          let time = quote.quote_delivery_time;
                                          let session = quote.quote_delivery_session;
                                          if (time === "12.00 AM") {
                                            return session;
                                          }
                                          time = time?.replace(/^0/, "");
                                          time = time?.replace(/\.00/, "");
                                          time = time?.replace(/\s?(AM|PM)/, "$1"); // Remove any space before AM/PM
                                          return `${session}&nbsp;${time}`;
                                        })()}
                                    </td>
                                </tr>
                                <tr>
                                    <td><strong>Ship Via:</strong></td>
                                    <td align="right">
                                        ${quote.quote_delivery_address_mode === "0" ? "Store" : quote.quote_delivery_address_mode === "1" ? "Site" : quote.quote_delivery_address_mode === "2" ? "Pick Up" : ""}
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
                                <th align="left" style="font-size:10px;color:#fff;width:50%;">SHIP TO:</th>
                                <th align="left" style="font-size:10px;color:#fff;width:50%;">BILL TO:</th>
                            </tr>
                        </thead>
                        <tbody>
                            ${
                              quote.quote_delivery_address_mode === "0"
                                ? `
                            <tr>
                                <td style="font-size:12px; vertical-align: top" valign="top">
                                    ${quote.quote_customer_name}<br>
                                    -<br>
                                    ${quote.quote_store_delivery_address1}<br>
                                    ${quote.quote_store_delivery_city}&nbsp;${quote.quote_store_delivery_state}&nbsp;${quote.quote_store_delivery_postalcode}<br>
                                    ${quote.quote_store_delivery_country}<br>
                                    Ph: ${quote.quote_customer_contact_phone}
                                </td>
                                <td style="font-size:12px; vertical-align: top" valign="top">
                                    ${quote.quote_customer_name}<br>
                                    -<br>
                                    ${quote.quote_store_delivery_address1}<br>
                                    ${quote.quote_store_delivery_city}&nbsp;${quote.quote_store_delivery_state}&nbsp;${quote.quote_store_delivery_postalcode}<br>
                                    ${quote.quote_store_delivery_country}<br>
                                    Ph: ${quote.quote_customer_contact_phone}
                                </td>
                            </tr>
                            `
                                : ""
                            }
                            
                            ${
                              quote.quote_delivery_address_mode === "1"
                                ? `
                            <tr>
                                <td style="font-size:12px;">
                                    ${quote.quote_customer_name}<br>
                                    -<br>
                                    ${quote.quote_site_delivery_address1}<br>
                                    ${quote.quote_site_delivery_city}&nbsp;${quote.quote_site_delivery_state}&nbsp;${quote.quote_site_delivery_postalcode}<br>
                                    ${quote.quote_site_delivery_country}<br>
                                    Attn: ${quote.quote_site_delivery_attention_person}<br>
                                    Ph: ${quote.quote_site_delivery_attention_contact}
                                </td>
                                <td style="font-size:12px; vertical-align: top" valign="top">
                                    ${quote.quote_customer_name}<br>
                                    -<br>
                                    ${quote.quote_store_delivery_address1}<br>
                                    ${quote.quote_store_delivery_city}&nbsp;${quote.quote_store_delivery_state}&nbsp;${quote.quote_store_delivery_postalcode}<br>
                                    ${quote.quote_store_delivery_country}<br>
                                    Ph: ${quote.quote_customer_contact_phone}
                                </td>
                            </tr>
                            `
                                : ""
                            }

                            ${
                              quote.quote_delivery_address_mode === "2"
                                ? `
                            <tr>
                                <td style="font-size:12px;">
                                    ${quote.quote_customer_name}<br>
                                    -<br>
                                    <strong>PICKUP</strong>
                                    <br>
                                    <strong>Attn:</strong> ${quote.quote_site_delivery_attention_person}<br>
                                    <strong>Ph:</strong> ${quote.quote_site_delivery_attention_contact}
                                </td>
                                <td style="font-size:12px; vertical-align: top" valign="top">
                                    ${quote.quote_customer_name}<br>
                                    -<br>
                                    ${quote.quote_store_delivery_address1}<br>
                                    ${quote.quote_store_delivery_city}&nbsp;${quote.quote_store_delivery_state}&nbsp;${quote.quote_store_delivery_postalcode}<br>
                                    ${quote.quote_store_delivery_country}<br>
                                    Ph: ${quote.quote_customer_contact_phone}
                                </td>
                            </tr>
                            `
                                : ""
                            }

                        </tbody>
                    </table>   
                    <table cellpadding="2" cellspacing="0" width="100%" style="margin-top:10px";>
                        <thead style="background-color:#000;font-size:10px; -webkit-print-color-adjust: exact;font-family: Arial, Helvetica, sans-serif;">
                            <tr >
                                <th align="left" style="font-size:10px;color:#fff;width:36%;">Customer PO Number</th>
                                <th align="left" style="font-size:10px;color:#fff;width:32%;">Terms</th>
                                <th align="left" style="font-size:10px;color:#fff;width:32%;">Contact</th>
                            </tr>
                        </thead>
                        <tbody>
                            <tr >
                                <td style="font-size:12px; vertical-align: top" valign="top" align="left" style="font-size:10px;">${quote.quote_customer_PO_number}</td>
                                <td style="font-size:12px; vertical-align: top" valign="top" align="left" style="font-size:10px;">${quote.account_Terms === "DONM30DAYS" ? "30th of Next Month" : quote.account_Terms}</td>
                                 <td style="font-size:12px; vertical-align: top" valign="top" align="left" style="font-size:10px;">${quote.quote_customer_contact_phone}</td>
                            </tr>
                        </tbody>
                    </table>           
                    <table cellpadding="2" cellspacing="0" width="100%" style="margin-top:10px";>
                        <thead style="background-color:#000;font-size:10px; -webkit-print-color-adjust: exact;font-family: Arial, Helvetica, sans-serif;">
                            <tr >
                                <th align="left" style="font-size:10px;color:#fff;width:36%;">FOB Point</th>
                                <th align="left" style="font-size:10px;color:#fff;width:32%;">Shipping Terms</th>
                                <th align="left" style="font-size:10px;color:#fff;width:32%;">Shipvia</th>
                            </tr>
                        </thead>
                        <tbody>
                            <tr >
                                <td style="font-size:12px; vertical-align: top" valign="top" align="left" style="font-size:10px;">-</td>
                                <td style="font-size:12px; vertical-align: top" valign="top" align="left" style="font-size:10px;">-</td>
                                <td style="font-size:12px; vertical-align: top" valign="top" align="left">
                                    ${quote.quote_delivery_address_mode === "0" ? "Store" : quote.quote_delivery_address_mode === "1" ? "Site" : quote.quote_delivery_address_mode === "2" ? "Pickup" : ""}

                                </td>
                            </tr>
                        </tbody>
                    </table>                       
                </div>
            </div>
               `,
        footerTemplate: `
                <div style="width:calc(100% - 100px);font-size:12px; -webkit-print-color-adjust: exact;margin:0px 50px;">                   
                     <div style="width:100%;font-size:11px;text-align:right;margin-top:20px">
                    Page <span class="pageNumber"></span> of <span class="totalPages"></span>
                </div>
                </div>
               `,
        margin: { top: "410px", bottom: "130px" },
      });

      await browser.close();
      const pdfBytes = fs.readFileSync(tempFilePath);
      const pdfDoc = await PDFDocument.load(pdfBytes);
      const totalPages = pdfDoc.getPageCount();
      const helveticaFont = await pdfDoc.embedFont(StandardFonts.Helvetica);
      for (let i = 0; i < totalPages; i++) {
        const page = pdfDoc.getPage(i);
        const { width } = page.getSize();
        if (i === totalPages - 1) {
          const xLabel = width - 220;
          const xValue = width - 35;
          let y = 80;

          // Draw top border line
          page.drawLine({
            start: { x: 35, y: y + 20 },
            end: { x: width - 35, y: y + 20 },
            thickness: 1,
            color: rgb(0, 0, 0),
          });

          // Draw each label and value
          const lines = [
            ["Sales Total:", Number(quote.quote_GST_Taxable_Total).toFixed(2)],
            ["Freight & Misc:", "-"],
            ["Tax Total:", Number(quote.quote_Tax_Total).toFixed(2)],
            ["Total (AUD):", Number(quote.quote_Overall_Price).toFixed(2)],
          ];

          for (let [label, value] of lines) {
            page.drawText(label, {
              x: xLabel,
              y,
              size: 9,
            });
            const valueWidth = helveticaFont.widthOfTextAtSize(value, 10);
            page.drawText(value, {
              x: xValue - valueWidth,
              y,
              size: 9,
            });
            y -= 15;
          }
        } else {
          page.drawText(`Continued...`, {
            x: width / 2 - 30,
            y: 30,
            size: 9,
          });
        }
      }
      const updatedPdfBytes = await pdfDoc.save();
      fs.writeFileSync(tempFilePath, updatedPdfBytes);
      await merger.add(tempFilePath);
      fs.unlinkSync(tempFilePath);
    }

    let file_name = `${Quote[0]?.quote_unique_id}.pdf`;
    const finalFilePath = path.join(__dirname, "../dockets", file_name);
    await merger.save(finalFilePath);
    res.status(200).send(`dockets/${path.basename(finalFilePath)}`);
    res.on("finish", () => {
      setTimeout(() => {
        fs.unlink(finalFilePath, unlinkError => {
          if (unlinkError) {
            console.error("Error deleting merged PDF:", unlinkError);
          } else {
            console.log("Merged PDF deleted successfully:", finalFilePath);
          }
        });
      }, 5000);
    });
  } catch (err) {
    logError("generateQuotationDocket", err, req.user.user_ref_id);
    res.status(500).send("Quote Copy Generation Failed.");
  }
};

async function getQuoteItems(quoteId) {
  const deptOrder = ["GBIL", "GBI", "J", "ROOF", "FG", "CL", "F", "DC"];
  let groupedQuote = {};
  let deptPiecesCount = {};

  const quoteItems = await QuotationItem.find({ quote_master_id: quoteId }).sort({ created: 1 });
  quoteItems.forEach(item => {
    const deptCode = item.dept_code || "F";
    if (!groupedQuote[deptCode]) groupedQuote[deptCode] = [];
    groupedQuote[deptCode].push({
      desc: `${item.quote_item_code}: ${item.quote_item_description}`,
      pieces: item.quote_item_pieces || "N/A",
      length: item.quote_item_length || "N/A",
      //uom: '-',
      uom: item.order_item_uom || "LN MTR",
      qty: item.quote_item_quantity ? parseFloat(item.quote_item_quantity).toFixed(2) : "N/A",
      disc: item.quote_item_discount ? parseFloat(item.quote_item_discount).toFixed(2) : "0",
      price: item.quote_item_price ? parseFloat(item.quote_item_price).toFixed(2) : "N/A",
      extprice: item.quote_item_special_price ? parseFloat(item.quote_item_special_price).toFixed(2) : "N/A",
    });
    const pieces = parseFloat(item.quote_item_pieces) || 0;
    deptPiecesCount[deptCode] = (deptPiecesCount[deptCode] || 0) + pieces;
  });

  const quoteItemsManual = await QuotationItemManual.aggregate([{ $match: { quote_master_me_id: quoteId } }, { $lookup: { from: "departments", localField: "quote_item_me_department", foreignField: "_id", as: "departmentsInfo" } }, { $unwind: { path: "$departmentsInfo", preserveNullAndEmptyArrays: true } }, { $sort: { created: 1 } }]);

  quoteItemsManual.forEach(item => {
    const deptCode = item.departmentsInfo?.department_code || "F";
    if (!groupedQuote[deptCode]) groupedQuote[deptCode] = [];
    groupedQuote[deptCode].push({
      desc: `${item.quote_item_me_code}: ${item.quote_item_me_description}`,
      pieces: item.quote_item_me_uom_value || "N/A",
      length: item.quote_item_me_length || "N/A",
      uom: item.quote_item_me_uom || "N/A",
      qty: item.quote_item_me_quantity ? parseFloat(item.quote_item_me_quantity).toFixed(2) : "N/A",
      disc: item.quote_item_me_discount ? parseFloat(item.quote_item_me_discount).toFixed(2) : "0",
      price: item.quote_item_qty_me_price ? parseFloat(item.quote_item_qty_me_price).toFixed(2) : "N/A",
      extprice: item.quote_item_special_me_price ? parseFloat(item.quote_item_special_me_price).toFixed(2) : "N/A",
    });

    // Calculate total pieces
    const pieces = parseFloat(item.quote_item_me_uom_value) || 0;
    deptPiecesCount[deptCode] = (deptPiecesCount[deptCode] || 0) + pieces;
  });

  const results = [];
  deptOrder.forEach(dept => {
    if (groupedQuote[dept]) {
      results.push({
        deptDisplayName: dept,
        deptCode: dept,
        totalPieces: deptPiecesCount[dept] || 0,
        items: groupedQuote[dept],
      });
    }
  });
  return results;
}

exports.cancelSaleOrder = async (req, res) => {
  try {
    let orderObjID = new mongoose.Types.ObjectId(req.params.orderid);
    let orderMasterInfo = await OrderMaster.findOne({ _id: orderObjID });
    let status = orderMasterInfo.order_status;
    if (status === "Order Cancelled") {
      const err = new Error("Attempt To Cancel an Already Cancelled Order");
      logError("cancelSaleOrder", err, req.user.user_ref_id);
      return res.status(500).send("Cancelled Order. Please Recheck.");
    }

    let OrderUID = orderMasterInfo.order_unique_id;
    let user = new mongoose.Types.ObjectId(req.params.userid);
    let userInfo = await Users.findOne({ _id: user });
    let userName = userInfo.user_firstName + " " + userInfo.user_lastName;
    let aspxAuthValue = await loginMyob();
    if (aspxAuthValue) {
      const apiUrl = `${process.env.MYOBURL}SalesOrder/CancelSalesOrder`;
      const aspxAuthValue = fs.readFileSync("aspxauth.txt", "utf8");
      let OrderData = {
        entity: {
          OrderNbr: {
            value: "" + OrderUID + "",
          },
          OrderType: {
            value: "SO",
          },
        },
      };
      const headers = {
        Cookie: `.ASPXAUTH=${aspxAuthValue}`,
        "Content-Type": "application/json",
      };
      const response = await axios.post(apiUrl, OrderData, { headers });
      let logout = await logoutMyob();
      let updatedCancelledData;
      if (response.status === 204) {
        let updateData = { $set: { order_status: "Order Cancelled", order_cancelled_user: user, order_cancelled_date: new Date().toISOString() } };
        const updateConditions = { _id: orderObjID };
        updatedCancelledData = await OrderMaster.findOneAndUpdate(updateConditions, updateData, attrs);
      }
      res.status(200).send({ ...updatedCancelledData._doc, userName });
    }
  } catch (err) {
    const error = new Error("Order Cancellation Failed. Could be MYOB Update Failure. Please Verify");
    logError("cancelSaleOrder", error, req.user.user_ref_id);
    res.status(500).send("Order Cancellation Failed. Please Re-check!!!");
  }
};

exports.generateSaleOrderDocket = async (req, res) => {
    try {
        const PDFMerger = (await import("pdf-merger-js")).default;
        let matchCondition = {};
        if (req.params.orderid) {
            matchCondition._id = new mongoose.Types.ObjectId(req.params.orderid);
        }

        const sendMailOrder = req.query.sendMail === "true";
        let orderMasterInfo = await OrderMaster.findOne({ _id: req.params.orderid });
        let status = orderMasterInfo.order_status;
        if (status === "Order Cancelled") {
            return res.status(500).send("Cancelled Order. Please Recheck");
        }

        let Order = await OrderMaster.aggregate([
            { $match: matchCondition },
            { $lookup: { from: "accounts", as: "accountsInfo", localField: "order_customer_id", foreignField: "_id" } },
            { $unwind: { path: "$accountsInfo", preserveNullAndEmptyArrays: true } },
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
                    order_customer_UID: 1,
                    order_delivery_address_mode: 1,
                    order_delivery_date_str: 1,
                    order_delivery_time: 1,
                    order_delivery_session: 1,
                    created_str: 1,
                    order_customer_name: 1,
                    order_store_delivery_address1: 1,
                    order_store_delivery_city: 1,
                    order_store_delivery_country: 1,
                    order_store_delivery_postalcode: 1,
                    order_store_delivery_state: 1,
                    order_customer_contact_phone: 1,
                    order_customer_contact_email: 1,
                    order_site_delivery_attention_person: 1,
                    order_site_delivery_attention_contact: 1,
                    order_customer_contact_phone: 1,
                    order_site_delivery_address2: 1,
                    order_Overall_Price: 1,
                    order_GST_EXP_Total: 1,
                    order_GST_Taxable_Total: 1,
                    order_Discount_Total: 1,
                    order_Tax_Total: 1,
                    order_site_delivery_address1: 1,
                    order_site_delivery_city: 1,
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
                    order_delivery_date: 1,
                    created: 1,
                    account_Name: "$accountsInfo.account_Name",
                    account_Terms: "$accountsInfo.account_Terms",
                    account_Address_line_one: "$accountsInfo.account_Address_line_one",
                    account_Address_line_two: "$accountsInfo.account_Address_line_two",
                    account_Address_Country: "$accountsInfo.account_Address_Country",
                    account_Address_State: "$accountsInfo.account_Address_State",
                    account_Address_City: "$accountsInfo.account_Address_City",
                    account_Address_PostalCode: "$accountsInfo.account_Address_PostalCode",
                    account_Address_Phone: "$accountsInfo.account_Address_Phone",
                    account_Address_Email: "$accountsInfo.account_Address_Email",
                },
            },
        ]);
        if (!Order.length) return res.status(500).send("No Order Found!");

        const merger = new PDFMerger();
        const deptNames = {
            CL: "CLADDING",
            J: "JOBBING",
            FG: "FASCIA GUTTER",
            DC: "DELIVERY CHARGES",
            ROOF: "ROOFING",
            F: "FLASHING",
            GBI: "GBI",
            GBIL: "GBI.L",
        };

        const getDeptName = key => deptNames[key?.toUpperCase()] || key;
        let file_name;
        for (const order of Order) {
            let serialNumber = 1;
            const items = await getSOItems(order._id);
            for (const group of items) {
                const deptCode = group.deptDisplayName;
                if (deptCode === "DC") continue;
            }

            const deptSummaryTable = `
                <table cellpadding="2" cellspacing="0" width="100%" style="width:100%; margin-bottom:8px; text-align:left; table-layout: fixed">
                    <thead style="background-color:#000;color:#fff;font-size:10px;">
                        <tr>
                            ${items
                    .filter(group => group.deptDisplayName !== "DC")
                    .map(
                        group => `
                            <th style="padding:2px 4px; width: 50px;">${group.deptDisplayName}</th>
                        `
                    )
                    .join("")}
                        </tr>
                    </thead>
                    <tbody style="color:#000;font-size:11px;">
                        <tr style="font-size:11px;">
                            ${items
                    .filter(group => group.deptDisplayName !== "DC")
                    .map(group => {
                        const deptCode = group.deptDisplayName;
                        const totalPieces = group.totalPieces;
                        const countDisplay = `${totalPieces}`;
                        return `<td style="padding:4px;">${countDisplay}</td>`;
                    })
                    .join("")}
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
                    <th align="left">NO</th>
                    <th align="left">ITEM</th>
                    <th align="left">PIECES</th>
                    <th align="left">LENGTH</th>
                    <th align="left">QTY</th>
                    <th align="left" width="50">UOM</th>
                    <th align="right">PRICE</th>
                    <th align="right">DISC</th>
                    <th align="right" >EXT PRICE</th>
                </tr>
            </thead>
            <tbody style="color:#000;font-size:11px;">
            ${items
                    .map(
                        group => `
                ${group.items
                                .map(
                                    item => `
                    <tr style="font-size:11px;">
                        <td>${serialNumber++}</td>
                        <td>${item.desc}</td>
                        <td>${item.pieces}</td>
                        <td>${item.length}</td>
                        <td>${item.qty}</td>   
                        <td>${item.uom}</td>
                        <td align="right">${item.price}</td>
                        <td align="right">${parseFloat(item.disc) % 1 === 0 ? parseInt(item.disc) : parseFloat(item.disc)}%</td>
                        <td align="right">${item.extprice}</td>
                    </tr>
                `
                                )
                                .join("")}
            `
                    )
                    .join("")}
            </tbody></table></body></html>`;

            const browser = await puppeteer.launch({
                headless: true,
                args: ["--no-sandbox", "--disable-setuid-sandbox"],
            });
            const page = await browser.newPage();
            await page.setContent(orderHtmlContent, { waitUntil: "networkidle0" });
            //await page.setContent(finalorderHtmlContent, { waitUntil: 'networkidle0' });
            const logoPath = path.join(__dirname, "../images/docket-logo.png");
            const logoBase64 = fs.readFileSync(logoPath, { encoding: "base64" });
            const logoDataUri = `data:image/png;base64,${logoBase64}`;
            const tempFilePath = path.join(__dirname, "../dockets", `order_${order.order_unique_id}.pdf`);
            await page.pdf({
                path: tempFilePath,
                format: "A4",
                printBackground: true,
                displayHeaderFooter: true,
                headerTemplate: `
             <div style="display: flex; flex-direction: column; margin:25px 50px 50px 50px; width: calc(100% - 100px);">
                <div style="display: flex; width: 100%; margin-bottom: 25px;">
                    <div style="width: 50%;display:flex;align-items:start;">   
                            <div><img src="${logoDataUri}" alt="ENCORE" style="max-width:100px; margin-right: 10px"></div>
                            <p style="font-family: Arial, Helvetica, sans-serif; font-size:12px;">ENCORE SHEETMETAL<br>67 QUANTUM CLOSE<br>DANDENONG SOUTH, VIC, 3175<br>Phone: 03 9999 7800<br>Web: encoresheetmetal.com.au<br>ABN: 47631765163</p>
                    </div>
                    <div style="width: 50%; display:flex;justify-content: flex-end">
                        <div style="width:230px;display:block;">
                            <h2 style="font-family: Arial, Helvetica, sans-serif; font-size:24px; margin: 0 0 5px 0;text-align:right;width:100%;">Order Confirmation</h2>
                            <table cellpadding="1" cellspacing="0" width="100%" style="font-family: Arial, Helvetica, sans-serif; font-size:12px; width: 100%;">
                                <tr>
                                    <td align="left" ><strong>Order No.:</strong></td>
                                    <td align="right" width="50%"><strong style="font-size:13px;">${order.order_unique_id}</strong></td>
                                </tr>
                                <tr>
                                    <td align="left"><strong>Order Date:</strong></td>
                                    <td align="right">
                                        ${order.created_str.split(" ")[0]?.replace(/-/g, "/")}
                                    </td>
                                </tr>
                                <tr>
                                    <td><strong>Delivery Date:</strong></td>
                                    <td align="right">
                                        ${order.order_delivery_date_str.split(" ")[0]?.replace(/-/g, "/")}
                                    </td>
                                </tr>
                                <tr><td><strong>Customer PO:</strong></td><td align="right">${order.order_customer_PO_number}</td></tr>
                                <tr>
                                    <td><strong>Time Required:</strong></td>
                                    <td align="right">
                                        ${(() => {
                        let time = order.order_delivery_time;
                        let session = order.order_delivery_session;
                        if (time === "12.00 AM") {
                            return session;
                        }
                        time = time?.replace(/^0/, "");
                        time = time?.replace(/\.00/, "");
                        time = time?.replace(/\s?(AM|PM)/, "$1"); // Remove any space before AM/PM
                        return `${session}&nbsp;${time}`;
                    })()}
                                    </td>
                                </tr>
                                <tr>
                                    <td><strong>Ship Via:</strong></td>
                                    <td align="right">
                                        ${order.order_delivery_address_mode === "0" ? "Store" : order.order_delivery_address_mode === "1" ? "Site" : order.order_delivery_address_mode === "2" ? "Pick Up" : ""}
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
                                <th align="left" style="font-size:10px;color:#fff;width:50%;">SHIP TO:</th>
                                <th align="left" style="font-size:10px;color:#fff;width:50%;">BILL TO:</th>
                            </tr>
                        </thead>
                        <tbody>
                            ${order.order_delivery_address_mode === "0"
                        ? `
                            <tr>
                                <td style="font-size:12px; vertical-align: top" valign="top">
                                    ${order.order_customer_name}<br>
                                    -<br>
                                    ${order.order_store_delivery_address1}<br>
                                    ${order.order_store_delivery_city}&nbsp;${order.order_store_delivery_state}&nbsp;${order.order_store_delivery_postalcode}<br>
                                    ${order.order_store_delivery_country}<br>
                                    Ph: ${order.order_customer_contact_phone}
                                </td>
                                <td style="font-size:12px; vertical-align: top" valign="top">
                                    ${order.order_customer_name}<br>
                                    -<br>
                                    ${order.order_store_delivery_address1}<br>
                                    ${order.order_store_delivery_city}&nbsp;${order.order_store_delivery_state}&nbsp;${order.order_store_delivery_postalcode}<br>
                                    ${order.order_store_delivery_country}<br>
                                    Ph: ${order.order_customer_contact_phone}
                                </td>
                            </tr>
                            `
                        : ""
                    }
                            
                            ${order.order_delivery_address_mode === "1"
                        ? `
                            <tr>
                                <td style="font-size:12px;">
                                    ${order.order_customer_name}<br>
                                    -<br>
                                    ${order.order_site_delivery_address1}<br>
                                    ${order.order_site_delivery_city}&nbsp;${order.order_site_delivery_state}&nbsp;${order.order_site_delivery_postalcode}<br>
                                    ${order.order_site_delivery_country}<br>
                                    Attn: ${order.order_site_delivery_attention_person}<br>
                                    Ph: ${order.order_site_delivery_attention_contact}
                                </td>
                                <td style="font-size:12px; vertical-align: top" valign="top">
                                    ${order.order_customer_name}<br>
                                    -<br>
                                    ${order.order_store_delivery_address1}<br>
                                    ${order.order_store_delivery_city}&nbsp;${order.order_store_delivery_state}&nbsp;${order.order_store_delivery_postalcode}<br>
                                    ${order.order_store_delivery_country}<br>
                                    Ph: ${order.order_customer_contact_phone}
                                </td>
                            </tr>
                            `
                        : ""
                    }

                            ${order.order_delivery_address_mode === "2"
                        ? `
                            <tr>
                                <td style="font-size:12px;">
                                    ${order.order_customer_name}<br>
                                    -<br>
                                    <strong>PICKUP</strong>
                                    <br>
                                    <strong>Attn:</strong> ${order.order_site_delivery_attention_person}<br>
                                    <strong>Ph:</strong> ${order.order_site_delivery_attention_contact}
                                </td>
                                <td style="font-size:12px; vertical-align: top" valign="top">
                                    ${order.order_customer_name}<br>
                                    -<br>
                                    ${order.order_store_delivery_address1}<br>
                                    ${order.order_store_delivery_city}&nbsp;${order.order_store_delivery_state}&nbsp;${order.order_store_delivery_postalcode}<br>
                                    ${order.order_store_delivery_country}<br>
                                    Ph: ${order.order_customer_contact_phone}
                                </td>
                            </tr>
                            `
                        : ""
                    }

                        </tbody>
                    </table>   
                    <table cellpadding="2" cellspacing="0" width="100%" style="margin-top:10px";>
                        <thead style="background-color:#000;font-size:10px; -webkit-print-color-adjust: exact;font-family: Arial, Helvetica, sans-serif;">
                            <tr >
                                <th align="left" style="font-size:10px;color:#fff;width:36%;">Customer PO Number</th>
                                <th align="left" style="font-size:10px;color:#fff;width:32%;">Terms</th>
                                <th align="left" style="font-size:10px;color:#fff;width:32%;">Contact</th>
                            </tr>
                        </thead>
                        <tbody>
                            <tr >
                                <td style="font-size:12px; vertical-align: top" valign="top" align="left" style="font-size:10px;">${order.order_customer_PO_number}</td>
                                <td style="font-size:12px; vertical-align: top" valign="top" align="left" style="font-size:10px;">${order.account_Terms === "DONM30DAYS" ? "30th of Next Month" : order.account_Terms}</td>
                                 <td style="font-size:12px; vertical-align: top" valign="top" align="left" style="font-size:10px;">${order.order_customer_contact_phone}</td>
                            </tr>
                        </tbody>
                    </table>           
                    <table cellpadding="2" cellspacing="0" width="100%" style="margin-top:10px";>
                        <thead style="background-color:#000;font-size:10px; -webkit-print-color-adjust: exact;font-family: Arial, Helvetica, sans-serif;">
                            <tr >
                                <th align="left" style="font-size:10px;color:#fff;width:36%;">FOB Point</th>
                                <th align="left" style="font-size:10px;color:#fff;width:32%;">Shipping Terms</th>
                                <th align="left" style="font-size:10px;color:#fff;width:32%;">Shipvia</th>
                            </tr>
                        </thead>
                        <tbody>
                            <tr >
                                <td style="font-size:12px; vertical-align: top" valign="top" align="left" style="font-size:10px;">-</td>
                                <td style="font-size:12px; vertical-align: top" valign="top" align="left" style="font-size:10px;">-</td>
                                <td style="font-size:12px; vertical-align: top" valign="top" align="left">
                                    ${order.order_delivery_address_mode === "0" ? "Store" : order.order_delivery_address_mode === "1" ? "Site" : order.order_delivery_address_mode === "2" ? "Pickup" : ""}

                                </td>
                            </tr>
                        </tbody>
                    </table>                       
                </div>
            </div>
               `,
                footerTemplate: `
                <div style="width:calc(100% - 100px);font-size:12px; -webkit-print-color-adjust: exact;margin:0px 50px;">                   
                     <div style="width:100%;font-size:11px;text-align:right;margin-top:20px">
                    Page <span class="pageNumber"></span> of <span class="totalPages"></span>
                </div>
                </div>
               `,
                margin: { top: "410px", bottom: "130px" },
            });

            await browser.close();
            const pdfBytes = fs.readFileSync(tempFilePath);
            const pdfDoc = await PDFDocument.load(pdfBytes);
            const totalPages = pdfDoc.getPageCount();
            const helveticaFont = await pdfDoc.embedFont(StandardFonts.Helvetica);
            for (let i = 0; i < totalPages; i++) {
                const page = pdfDoc.getPage(i);
                const { width } = page.getSize();

                if (i === totalPages - 1) {
                    const xLabel = width - 220;
                    const xValue = width - 35;
                    let y = 80;

                    // Draw top border line
                    page.drawLine({
                        start: { x: 35, y: y + 20 },
                        end: { x: width - 35, y: y + 20 },
                        thickness: 1,
                        color: rgb(0, 0, 0),
                    });

                    // Draw each label and value
                    const lines = [
                        ["Sales Total:", Number(order.order_GST_Taxable_Total).toFixed(2)],
                        ["Freight & Misc:", "-"],
                        ["Tax Total:", Number(order.order_Tax_Total).toFixed(2)],
                        ["Total (AUD):", Number(order.order_Overall_Price).toFixed(2)],
                    ];

                    for (let [label, value] of lines) {
                        page.drawText(label, {
                            x: xLabel,
                            y,
                            size: 9,
                        });
                        const valueWidth = helveticaFont.widthOfTextAtSize(value, 10);
                        page.drawText(value, {
                            x: xValue - valueWidth,
                            y,
                            size: 9,
                        });
                        y -= 15;
                    }
                } else {
                    page.drawText(`Continued...`, {
                        x: width / 2 - 30,
                        y: 30,
                        size: 9,
                    });
                }
            }
            const updatedPdfBytes = await pdfDoc.save();
            fs.writeFileSync(tempFilePath, updatedPdfBytes);
            await merger.add(tempFilePath);
            fs.unlinkSync(tempFilePath);
            file_name = `SO_${Order[0]?.order_unique_id}.pdf`
            const outBuffer = Buffer.from(updatedPdfBytes);
            const mimeType = "application/pdf";

            if (sendMailOrder) {
                await sendMail(file_name, outBuffer, mimeType)
                res.status(200).send("Mail sent successfully");;
            }
        }

        if (!sendMailOrder) {
            const finalFilePath = path.join(__dirname, "../dockets", file_name);
            await merger.save(finalFilePath);
            res.status(200).send(`dockets/${path.basename(finalFilePath)}`);
            res.on('finish', () => {
                setTimeout(() => {
                    fs.unlink(finalFilePath, (unlinkError) => {
                        if (unlinkError) {
                            console.error('Error deleting merged PDF:', unlinkError);
                        } else {
                            console.log('Merged PDF deleted successfully:', finalFilePath);
                        }
                    });
                }, 5000);
            });
        }
    } catch (err) {
        logError("generateSaleOrderDocket", err, req.user.user_ref_id);
        res.status(500).send("Sale Order Copy Generation Failed.");
    }
};

async function getSOItems(orderId) {
  const deptOrder = ["GBIL", "GBI", "J", "ROOF", "FG", "CL", "F", "DC"];
  let groupedorder = {};
  let deptPiecesCount = {}; // To hold total pieces per department

  // Get order Items (Standard)
  const orderItems = await OrderItem.find({ order_master_id: orderId }).sort({ created: 1 });
  orderItems.forEach(item => {
    const deptCode = item.dept_code || "F";
    if (!groupedorder[deptCode]) groupedorder[deptCode] = [];
    groupedorder[deptCode].push({
      desc: `${item.order_item_code}: ${item.order_item_description}`,
      pieces: item.order_item_pieces || "N/A",
      length: item.order_item_length || "N/A",
      //uom: '-',
      uom: item.order_item_uom || "LN MTR",
      qty: item.order_item_quantity ? parseFloat(item.order_item_quantity).toFixed(2) : "N/A",
      disc: item.order_item_discount ? parseFloat(item.order_item_discount).toFixed(2) : "0",
      price: item.order_item_price ? parseFloat(item.order_item_price).toFixed(2) : "N/A",
      extprice: item.order_item_special_price ? parseFloat(item.order_item_special_price).toFixed(2) : "N/A",
    });

    // Calculate total pieces
    const pieces = parseFloat(item.order_item_pieces) || 0;
    deptPiecesCount[deptCode] = (deptPiecesCount[deptCode] || 0) + pieces;
  });

  // Get order Items (Manual)
  const orderItemsManual = await OrderItemManual.aggregate([{ $match: { order_master_me_id: orderId } }, { $lookup: { from: "departments", localField: "order_item_me_department", foreignField: "_id", as: "departmentsInfo" } }, { $unwind: { path: "$departmentsInfo", preserveNullAndEmptyArrays: true } }, { $sort: { created: 1 } }]);

  orderItemsManual.forEach(item => {
    const deptCode = item.departmentsInfo?.department_code || "F";
    if (!groupedorder[deptCode]) groupedorder[deptCode] = [];
    groupedorder[deptCode].push({
      desc: `${item.order_item_me_code}: ${item.order_item_me_description}`,
      pieces: item.order_item_me_uom_value || "N/A",
      length: item.order_item_me_length || "N/A",
      uom: item.order_item_me_uom || "N/A",
      qty: item.order_item_me_quantity ? parseFloat(item.order_item_me_quantity).toFixed(2) : "N/A",
      disc: item.order_item_me_discount ? parseFloat(item.order_item_me_discount).toFixed(2) : "0",
      price: item.order_item_qty_me_price ? parseFloat(item.order_item_qty_me_price).toFixed(2) : "N/A",
      extprice: item.order_item_special_me_price ? parseFloat(item.order_item_special_me_price).toFixed(2) : "N/A",
    });

    // Calculate total pieces
    const pieces = parseFloat(item.order_item_me_uom_value) || 0;
    deptPiecesCount[deptCode] = (deptPiecesCount[deptCode] || 0) + pieces;
  });

  const results = [];
  deptOrder.forEach(dept => {
    if (groupedorder[dept]) {
      results.push({
        deptDisplayName: dept,
        deptCode: dept,
        totalPieces: deptPiecesCount[dept] || 0,
        items: groupedorder[dept],
      });
    }
  });
  return results;
}

exports.orderItemQCStatus = async (req, res) => {
  try {
    const { w_order_item_qc_status, w_user_id, order_item_qc_status, user_id, type, person } = req.body;
    const { orderid } = req.params;
    // 0 = yet to assign and reset
    // 1 = assigned
    // type = assign or reset

    const orderID = new mongoose.Types.ObjectId(orderid);
    const orderItem = await OrderMaster.findById(orderID);

    if (!orderItem) return res.status(404).send("Order item not found");
    let updateData = { $set: { order_item_qc_status, order_item_qc_person: user_id || null } };
    if (person === "w") {
      if (type && type === "reset") {
        updateData = { $set: { w_order_item_qc_status, w_order_item_qc_person: null } };
      } else {
        updateData = { $set: { w_order_item_qc_status, w_order_item_qc_person: w_user_id || null } };
      }
    } else {
      if (type && type === "reset") {
        updateData = { $set: { order_item_qc_status, order_item_qc_person: null } };
      } else {
        updateData = { $set: { order_item_qc_status, order_item_qc_person: user_id || null } };
      }
    }
    const conditions = { _id: orderID };

    await OrderMaster.findByIdAndUpdate(conditions, updateData);
    let result = {
      order_item_qc_status: order_item_qc_status,
      w_order_item_qc_status: w_order_item_qc_status,
    };
    if (order_item_qc_status === 1) {
      result.message = "Order item Assigned for QC successfully";
    } else if (order_item_qc_status === 0) {
      result.message = "Order item QC Reset successfully";
    }
    res.status(200).send(result);
  } catch (error) {
    res.status(500).send("An error occurred while updating order item QC status");
  }
};

exports.uploadAWFDockets = async (req, res) =>{
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
        updateData = { $addToSet: { docket: { $each: orderImages.map(img => img.key) } } };
        const conditions = { _id: orderMasID };
        const updatedOrderInfo = await OrderMaster.findByIdAndUpdate(conditions, updateData, { new: true });
        res.status(200).send(updatedOrderInfo);
    }catch(err){
        logError('uploadAWFDockets', err, req.user.user_ref_id);
        handleMongooseError(err, res)
    }
}

exports.fetchAWFDocket = async (req, res) => {
  try {
    const orderMasID = new mongoose.Types.ObjectId(req.params.id);

    let fieldToTake = "docket"

    const orderInfo = await OrderMaster.findById(orderMasID).lean().exec();
    if (!orderInfo) {
      return res.status(500).send("Order not found");
    }

    const imageKeys = orderInfo[fieldToTake] ? orderInfo[fieldToTake] : [];
    const signedUrls = await Promise.all(
      imageKeys?.map(async key => {
        const command = new GetObjectCommand({
          Bucket: "encore-sheet",
          Key: key,
        });
        const url = await getSignedUrl(s3Client, command, { expiresIn: 3600 }); // URL expires in 1 hour
        return { key, url };
      })
    );

    const response = {
      _id: orderInfo._id,
      order_unique_id: orderInfo.order_unique_id,
      imageUrls: signedUrls,
    };
    res.status(200).json(response);
  } catch (err) {
    logError("fetchAWFDocket", err, req.user.user_ref_id);
    handleMongooseError(err, res)
  }
};

exports.deleteAWFDocket = async (req, res) => {
  try {
    const orderMasID = new mongoose.Types.ObjectId(req.params.id);
    const imageIndex = parseInt(req.params.indexid); // Parse the index as an integer
    let orderImagesField = "docket";

    const orderInfo = await OrderMaster.findById(orderMasID);
    if (!orderInfo) {
      return res.status(500).send("Order not found");
    }

    const orderImages = orderInfo[orderImagesField];
    if (imageIndex >= orderImages.length || imageIndex < 0) {
      return res.status(500).send("Invalid image index");
    }
    const imageNameToDelete = orderImages[imageIndex];
    const deleteParams = {
      Bucket: "encore-sheet",
      Key: imageNameToDelete,
    };
    await s3Client.send(new DeleteObjectCommand(deleteParams));
    orderImages.splice(imageIndex, 1);
    orderInfo[orderImagesField] = orderImages;
    await orderInfo.save();
    res.status(200).send("Image deleted successfully");
  } catch (err) {
    logError("deleteAWFDocket", err, req.user.user_ref_id);
    handleMongooseError(err, res)
  }
};


exports.holdOrder = async (req, res) => {
    try {
        const { order_hold } = req.body;
        const { orderid } = req.params;

        const orderID = new mongoose.Types.ObjectId(orderid);
        const orderItem = await OrderMaster.findById(orderID);
        if (!orderItem) return res.status(404).send("Order item not found");

        const OrderSORowID = orderItem.order_myob_row_id;
        const order_hold_person = new mongoose.Types.ObjectId(req.body.order_hold_person);
        let aspxAuthValue = await loginMyob();

        if (aspxAuthValue) {
            const apiUrl = '' + process.env.MYOBURL + 'SalesOrder';
            const aspxAuthValue = fs.readFileSync('aspxauth.txt', 'utf8');
            let OrderData = {
              "id": OrderSORowID,
              "Hold": { "value": order_hold },
            };

            const headers = {
                Cookie: `.ASPXAUTH=${aspxAuthValue}`,
                'Content-Type': 'application/json'
            };
            const response = await axios.put(apiUrl, OrderData, { headers });
            if (response.data.OrderNbr) {

              const updateData = { $set: { order_hold, order_hold_person } };
              const conditions = { _id: orderID };
              const updatedOrderInfo = await OrderMaster.findByIdAndUpdate(conditions, updateData, { new: true });
            } else {
              res.status(500).send("Failed to update order hold status in MYOB.");
            }
        } else {

            res.status(500).send("Failed to authenticate with MYOB.");
        }

        await logoutMyob();
        res.status(200).send("Order hold status updated successfully.");

    } catch (err) {
        logError("holdOrder", err, req.user.user_ref_id);
        handleMongooseError(err, res)
    }
};


//Code by rahul
exports.fetchOrderDetailsByOrderNumber = async (req, res) => {
  try {
    const AWF_CUST_ID = process.env.AWF_CUSTOMER_ID;
    const orderNumber = req.params.ordernumber;
    let orderDetails = []
    
    // Check if it's a quotation (starts with "QT")
    if(orderNumber.startsWith("QT")){
      orderDetails = await QuotationMaster.aggregate([
          { $match: { quote_unique_id: orderNumber } },
          {
            $lookup: {
              from: "accounts",
              localField: "quote_customer_id",
              foreignField: "_id",
              as: "customerInfo",
            },
          },
          { $unwind: { path: "$customerInfo", preserveNullAndEmptyArrays: true } },
          {
            $project: {
              _id: 0,
              order_number: "$quote_unique_id",
              order_customer_name: "$customerInfo.account_Name",
              order_delivery_date: "$quote_delivery_date_str",
              order_created_date: "$created_str",
              quote_customer_PO_number: "$quote_customer_PO_number",
            },
          },
        ]);
    } else {
      // It's an order - either starts with "IN" (regular) or AWF order number
      orderDetails = await OrderMaster.aggregate([
          { $match: { 
            $expr: {
              $or: [
                { $eq: [ "$order_unique_id", orderNumber ] },
                {
                  $and: [
                    { $eq: [ "$order_customer_UID", AWF_CUST_ID ] },
                    { $eq: [{ $substr: ["$order_customer_PO_number", 0, 6] }, orderNumber ] }
                  ]
                }
              ]
            }
          } },
          {
            $lookup: {
              from: "accounts",
              localField: "order_customer_id",
              foreignField: "_id",
              as: "customerInfo",
            },
          },
          { $unwind: { path: "$customerInfo", preserveNullAndEmptyArrays: true } },
          {
            $project: {
              _id: 0,
              order_number: {
                $cond: [
                  { $eq: ["$order_customer_UID", AWF_CUST_ID] },
                  { $substr: ["$order_customer_PO_number", 0, 6] },
                  "$order_unique_id"
                ]
              },
              order_customer_name: "$customerInfo.account_Name",
              order_delivery_date: "$order_delivery_date_str",
              order_created_date: "$created_str",
              order_customer_PO_number: {
                $cond: [
                  { $eq: ["$order_customer_UID", AWF_CUST_ID] },
                  "$order_unique_id",
                  "$order_customer_PO_number"
                ]
              },
            },
          },
        ]);
    }
    if (orderDetails.length === 0) {
      return res.status(404).send("Order not found");
    }

    res.status(200).send(orderDetails[0]);
  } catch (err) {
    logError("fetchOrderDetailsByOrderNumber", err, req.user.user_ref_id);
    res.status(500).send("Data Fetching Failed");
  }
};
