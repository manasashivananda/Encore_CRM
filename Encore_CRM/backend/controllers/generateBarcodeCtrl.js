const fs = require('fs');
const path = require('path');
const nodemailer = require('nodemailer');
const pdfkit = require('pdfkit');

const OrderMaster = require('../models/ordermasterModel');
const { logError } = require("../logger");
const { handleMongooseError } = require('./common');

const MAX_RETRIES = 3;
const RETRY_DELAY_MS = 3000;
const AWF_CUST_ID = process.env.AWF_CUSTOMER_ID

async function sendEmailWithRetry(mailTransporter, mailOptions, retries = MAX_RETRIES) {
    console.log("Mail Push Function Call");
    let attempt = 0;
    while (attempt < retries) {
        try {
            attempt++;
            console.log(`Attempt ${attempt}: Sending email...`);
            const response = await mailTransporter.sendMail(mailOptions);
            console.log(`Email sent on attempt ${attempt}`);
            return response;
        } catch (error) {
            console.error(`Error sending email on attempt ${attempt}:`, error);
            if (attempt < retries) {
                console.log(`Retrying in ${RETRY_DELAY_MS / 1000} seconds...`);
                await new Promise(resolve => setTimeout(resolve, RETRY_DELAY_MS)); // Delay before retrying
            } else {
                console.error(`Failed to send email after ${retries} attempts.`);
                throw error; // If all retries fail, throw the error
            }
        }
    }
}

exports.fetchSpecificOrderBarcodeDetails = async (req, res) => {
    try {

        const orderID = req.params.orderid;

        let orderDetails = await OrderMaster.aggregate([
            {
                $match: {
                $or: [
                    // Match directly by order_unique_id
                    { order_unique_id: orderID },

                    // Match by first 6 chars of PO + same customer UID
                    {
                    $expr: {
                        $and: [
                        { $eq: ["$order_customer_UID", AWF_CUST_ID] },
                        { $eq: [{ $substr: ["$order_customer_PO_number", 0, 6] }, orderID] }
                        ]
                    }
                    }
                ]
                }
            },
            //{ $match: { order_qc_status: "4" } },
            { $lookup: { from: "accounts", as: "customerInfo", localField: "order_customer_id", foreignField: "_id" } },
            { $lookup: { from: "accountcontacts", as: "customercontactInfo", localField: "order_customer_contact_id", foreignField: "_id" } },
            { $lookup: { from: "orderssubitemcounts", as: "orderssubitemcountsInfo", localField: "_id", foreignField: "Order_Mas_Id" } },
            { $lookup: {
                from: "users",
                as: "assignedPersonInfo",
                let: { assignedPerson: "$order_designed_person" },
                pipeline: [
                    {
                        $match: {
                            $expr: {
                                $eq: ["$_id", "$$assignedPerson"]
                            }
                        }
                    },
                    {
                        $project: {
                            fullName: { $concat: ["$user_firstName", " ", "$user_lastName"] }
                        }
                    }
                ]
            }},
            { $lookup: {
                from: "users",
                as: "qcPersonInfo",
                let: { qcedPerson: "$order_qced_person" },
                pipeline: [
                    {
                        $match: {
                            $expr: {
                                $eq: ["$_id", "$$qcedPerson"]
                            }
                        }
                    },
                    {
                        $project: {
                            fullName: { $concat: ["$user_firstName", " ", "$user_lastName"] }
                        }
                    }
                ]
            }},
            { $unwind: { path: "$customerInfo", preserveNullAndEmptyArrays: true }},
            { $unwind: { path: "$customercontactInfo", preserveNullAndEmptyArrays: true }},
            { $unwind: { path: "$assignedPersonInfo", preserveNullAndEmptyArrays: true }},
            { $unwind: { path: "$qcPersonInfo", preserveNullAndEmptyArrays: true }},
            { $unwind: { path: "$orderssubitemcountsInfo", preserveNullAndEmptyArrays: true }},
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
                    order_delivery_session: 1,
                    order_delivery_time:1,
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
                        $concat: [
                            "$customercontactInfo.account_Contact_FName",
                            " ",
                            "$customercontactInfo.account_Contact_LName"
                        ]
                    },
                    order_designed_person_fullName: {
                        $cond: {
                            if: {
                                $eq: [
                                    { $type: "$order_designed_person" },
                                    "objectId"
                                ]
                            },
                            then: "$assignedPersonInfo.fullName",
                            else: "$order_designed_person"
                        }
                    },
                    order_qced_person_fullName: {
                        $cond: {
                            if: {
                                $eq: [
                                    { $type: "$order_qced_person" },
                                    "objectId"
                                ]
                            },
                            then: "$qcPersonInfo.fullName",
                            else: "$order_qced_person"
                        }
                    },
                }
            }
        ]);
        res.send(orderDetails).status(200).end();
    } catch (error) {
        logError('fetchSpecificOrderBarcodeDetails', error, req.user.user_ref_id);
        handleMongooseError(error, res);
    }
}

exports.sentBarcodePDFForPrinting = async (req, res) => {
    try {
        const orderID = req.params.orderid;
        const sendEmail = req.params.send_email;
        let OrdDept = req.params.dept;

        // First try to find by order_unique_id (preferred)
        let orderMasDetails = await OrderMaster.findOne({ order_unique_id: orderID });

        // If not found, fallback to match first 6 bytes of order_customer_PO_number
        if (!orderMasDetails) {
            orderMasDetails = await OrderMaster.findOne({
                $expr: {
                    $and: [
                        { $eq: ["$order_customer_UID", AWF_CUST_ID] },
                        { $eq: [{ $substrBytes: ["$order_customer_PO_number", 0, 6] }, orderID] }
                    ]
                }
            });
        }

        // If still not found, return 404
        if (!orderMasDetails) {
            return res.status(404).json({ message: 'Order not found' });
        }

        const orderUID = orderMasDetails.order_unique_id;

        let orderJobName = "";
        if (OrdDept === "F") orderJobName = "- Flashing";
        if (OrdDept === "FG") orderJobName = "- Fascia Gutter";
        if (OrdDept === "J") orderJobName = "- Jobbing";
        if (OrdDept === "CL") orderJobName = "- Cladding";
        if (OrdDept === "GBI") orderJobName = "- GBI";
        if (OrdDept === "ROOF") orderJobName = "- Roofing";

        let orderType = orderMasDetails.order_flashing_checker === false
            ? "(Custom Order) " + orderJobName
            : orderJobName;

        let orderImages = [];
        if (req.files && req.files.length > 0) {
            orderImages = req.files.map((file) => ({ filename: file.filename, path: file.path }));
        }

        const barcodeDir = path.join(__dirname, '..', 'barcodeimagespdf');
        if (!fs.existsSync(barcodeDir)) {
            fs.mkdirSync(barcodeDir);
        }

        const createCombinedPDF = async (orderImages, outputFileName = 'barcode_combined.pdf') => {
            const outputPath = path.join(barcodeDir, outputFileName);
            const doc = new pdfkit({ autoFirstPage: false });

            return new Promise((resolve, reject) => {
                const stream = fs.createWriteStream(outputPath);
                doc.pipe(stream);

                for (const image of orderImages) {
                    const imageFilePath = path.join(__dirname, '..', image.path);
                    doc.addPage({ size: [6 * 72, 4 * 72], layout: 'landscape' });
                    doc.rotate(90);
                    doc.image(imageFilePath, 0, -4 * 72, { width: 6 * 72, height: 4 * 72 });
                }

                doc.end();

                stream.on('finish', () => {
                    resolve([{
                        filename: outputFileName,
                        path: outputPath
                    }]);
                });

                stream.on('error', reject);
            });
        };

        let orderImagesPDF = await createCombinedPDF(orderImages, 'barcode_combined.pdf');

        const deleteFiles = (files) => {
            files.forEach((file) => {
                const absolutePath = path.isAbsolute(file.path)
                    ? file.path
                    : path.join(__dirname, '..', file.path);
                if (fs.existsSync(absolutePath)) {
                    fs.unlink(absolutePath, (err) => {
                        if (err) console.error(`Error deleting file ${absolutePath}:`, err);
                        else console.log(`Deleted file ${absolutePath}`);
                    });
                } else {
                    console.warn(`File not found, skipping: ${absolutePath}`);
                }
            });
        };

        const mailTransporter = nodemailer.createTransport({
            service: 'gmail',
            auth: {
                user: `${process.env.From_Email}`,
                pass: `${process.env.From_Email_PW}`,
            }
        });

        if (orderImagesPDF.length > 0) {
            const mailOptionsWithPDF = {
                from: `${process.env.From_Email}`,
                to: `${process.env.Barcode_Email}`,
                subject: orderUID + ' Barcodes ' + orderType,
                text: 'Barcode Images for the OrderID:' + orderUID + ' attached',
                attachments: orderImagesPDF,
            };

            if (sendEmail === 'true') {
                let emailResponse;
                try {
                    emailResponse = await sendEmailWithRetry(mailTransporter, mailOptionsWithPDF);
                    console.log('Barcode email sent successfully.');
                } catch (error) {
                    console.error('Failed to send barcode email:', error);
                }
                console.log(emailResponse)
                if (emailResponse?.accepted?.length > 0) {
                    res.status(200).json({ message: 'Emails sent successfully' });
                }

                deleteFiles(orderImages);
                deleteFiles(orderImagesPDF);
            } else {
                const pdfToSend = orderImagesPDF[0];
                if (!pdfToSend || !fs.existsSync(pdfToSend.path)) {
                    return res.status(404).json({ message: 'PDF file not found to download.' });
                }

                res.setHeader('Content-Type', 'application/pdf');
                res.setHeader('Content-Disposition', `attachment; filename=\"${pdfToSend.filename}\"`);

                const filestream = fs.createReadStream(pdfToSend.path);
                filestream.pipe(res);

                filestream.on('close', () => {
                    deleteFiles(orderImages);
                    deleteFiles(orderImagesPDF);
                });
            }
        } else {
            deleteFiles(orderImages);

            const fallbackMail = {
                from: `${process.env.From_Email}`,
                to: `${process.env.DesignPDF_Email}`,
                subject: `${orderUID} ${orderType} Barcode Generation Failed Alert !!!`,
                html: `<p style=\"font-family: Arial; font-size: 16px;\">Hi,<br>The Barcode for <strong>${orderUID}</strong> for Job <strong>${orderType}</strong> failed. Please re-send it from Encore CRM.<br><br>Thanks</p>`
            };

            await sendEmailWithRetry(mailTransporter, fallbackMail);
            res.status(200).send({ message: 'Barcode Generation Failed. Alert Email Sent...' });
        }

    } catch (error) {
        logError('fetchSpecificOrderBarcodeDetails', error, req.user.user_ref_id);
        handleMongooseError(error, res);
        res.status(500).send('Internal Server Error: Error in Sending(Barcode/PDF) Emails. Please Resend!!!');
    }
};
