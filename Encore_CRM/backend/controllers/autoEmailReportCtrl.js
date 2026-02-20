const ExcelJS = require('exceljs');
const nodemailer = require('nodemailer');
const schedule = require('node-schedule'); 
const sql = require('mssql');
const { DateTime } = require('luxon');
const config = require('../config/sqlConfig');


// Generate Excel report for a specific machine
async function generateMachineExcel(machineId, data, date) {
    const workbook = new ExcelJS.Workbook();
    const worksheet = workbook.addWorksheet('Offcuts Report');

    // Add headers
    worksheet.columns = [
        { header: 'Date', key: 'date', width: 12 },
        { header: 'Time Range', key: 'timeRange', width: 15 },
        { header: 'Machine ID', key: 'machineId', width: 35 },
        { header: 'Used [m²]', key: 'cutArea', width: 12 },
        { header: 'Product [m²]', key: 'productArea', width: 15 },
        { header: 'Offcut [m²]', key: 'offcutsArea', width: 15 },
        { header: 'Waste [m²]', key: 'wasteArea', width: 12 },
        { header: 'Result [avg %]', key: 'result', width: 10 }
    ];

    // Style header row
    worksheet.getRow(1).font = { bold: true };
    ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H'].forEach(col => {
        worksheet.getCell(`${col}1`).fill = {
            type: 'pattern',
            pattern: 'solid',
            fgColor: { argb: 'FFBFBFBF' }
        };
    });

    // Add data rows
    data.forEach(row => {
        worksheet.addRow(row);
    });

    // Add Grand Total row
    const totals = {
        date: '',
        timeRange: '',
        machineId: 'GRAND TOTAL',
        cutArea: data.reduce((sum, row) => sum + parseFloat(row.cutArea), 0).toFixed(2),
        productArea: data.reduce((sum, row) => sum + parseFloat(row.productArea), 0).toFixed(2),
        offcutsArea: data.reduce((sum, row) => sum + parseFloat(row.offcutsArea), 0).toFixed(2),
        wasteArea: data.reduce((sum, row) => sum + parseFloat(row.wasteArea), 0).toFixed(2),
        result: (data.reduce((sum, row) => sum + parseFloat(row.result), 0) / data.length).toFixed(1)
    };
    
    const totalRow = worksheet.addRow(totals);
    totalRow.font = { bold: true };

    const totalRowNumber = totalRow.number;

    ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H'].forEach(col => {
        worksheet.getCell(`${col}${totalRowNumber}`).fill = {
            type: 'pattern',
            pattern: 'solid',
            fgColor: { argb: 'FFFFEB9C' }
        };
    });

        return workbook;
    }

// Generate and send daily reports
exports.generateDailyReports = async () => {
    try {
        await sql.connect(config);

        // Get Sydney timezone dates using Luxon
        // Report covers: Previous day 6:00 AM to Current day 5:59 AM
        const sydneyNow = DateTime.now().setZone('Australia/Sydney');
        const reportEndTime = sydneyNow.set({ hour: 5, minute: 59, second: 59, millisecond: 0 });
        const reportStartTime = sydneyNow.minus({ days: 1 }).set({ hour: 6, minute: 0, second: 0, millisecond: 0 });
        
        const startDateTime = reportStartTime.toSQL({ includeOffset: false });
        const endDateTime = reportEndTime.toSQL({ includeOffset: false });
        const reportDateLabel = `${reportStartTime.toFormat('yyyy-MM-dd')} 6AM to ${reportEndTime.toFormat('yyyy-MM-dd')} 6AM`;

        // Get all machines
        const machinesResult = await sql.query(`
            SELECT DISTINCT MachineId AS Machines
            FROM StatsMaterial
            ORDER BY MachineId ASC
        `);
        
        const machines = machinesResult.recordset.map(row => row.Machines);
        const attachments = [];
        const machineSummaries = []; // Store summary for each machine

        // Generate Excel for each machine with data
        for (const machineId of machines) {
            const request = new sql.Request();
            request.input('startDateTime', sql.VarChar(50), startDateTime);
            request.input('endDateTime', sql.VarChar(50), endDateTime);
            request.input('machineId', machineId);

            const selectQuery = `
                ;WITH Hours AS (
                    SELECT 
                        DATEADD(HOUR, n, CONVERT(DATETIME, @startDateTime, 120)) AS HourDateTime,
                        DATEPART(HOUR, DATEADD(HOUR, n, CONVERT(DATETIME, @startDateTime, 120))) AS HourValue,
                        CAST(DATEADD(HOUR, n, CONVERT(DATETIME, @startDateTime, 120)) AS DATE) AS HourDate
                    FROM (
                        SELECT 0 AS n UNION ALL SELECT 1 UNION ALL SELECT 2 UNION ALL SELECT 3 UNION ALL SELECT 4 UNION ALL SELECT 5 UNION ALL
                        SELECT 6 UNION ALL SELECT 7 UNION ALL SELECT 8 UNION ALL SELECT 9 UNION ALL SELECT 10 UNION ALL SELECT 11 UNION ALL
                        SELECT 12 UNION ALL SELECT 13 UNION ALL SELECT 14 UNION ALL SELECT 15 UNION ALL SELECT 16 UNION ALL SELECT 17 UNION ALL
                        SELECT 18 UNION ALL SELECT 19 UNION ALL SELECT 20 UNION ALL SELECT 21 UNION ALL SELECT 22 UNION ALL SELECT 23
                    ) AS Numbers
                    WHERE DATEADD(HOUR, n, CONVERT(DATETIME, @startDateTime, 120)) <= CONVERT(DATETIME, @endDateTime, 120)
                )
                SELECT 
                    h.HourValue AS HourStart,
                    h.HourDate AS ReportDate,
                    COALESCE(SUM(s.OffcutArea), 0) AS TotalOffcutsArea,
                    COALESCE(SUM(s.WasteArea), 0) AS TotalWasteArea,
                    COALESCE(SUM(s.ProductArea), 0) AS TotalProductArea,
                    COALESCE(SUM(s.CutArea), 0) AS TotalCutArea,
                    @machineId AS MachineID
                FROM Hours h
                LEFT JOIN StatsMaterial s ON 
                    DATEPART(HOUR, s.StartTime) = h.HourValue 
                    AND CAST(s.StartTime AS DATE) = h.HourDate
                    AND s.MachineId = @machineId
                GROUP BY h.HourValue, h.HourDate
                ORDER BY h.HourDate ASC, h.HourValue ASC
            `;

            const result = await request.query(selectQuery);

            // Generate Excel for all hours (including zero values)
            const hourlyData = result.recordset.map(row => {
                const offcuts = parseFloat(row.TotalOffcutsArea) || 0;
                const waste = parseFloat(row.TotalWasteArea) || 0;
                const cut = parseFloat(row.TotalCutArea) || 0;
                const product = parseFloat(row.TotalProductArea) || 0;
                return {
                    date: row.ReportDate ? new Date(row.ReportDate).toISOString().split('T')[0] : '',
                    timeRange: `${String(row.HourStart).padStart(2, '0')}:00 - ${String(row.HourStart + 1).padStart(2, '0')}:00`,
                    machineId: row.MachineID,
                    cutArea: cut.toFixed(2),
                    productArea: product.toFixed(2),
                    offcutsArea: offcuts.toFixed(2),
                    wasteArea: waste.toFixed(2),
                    result: cut > 0 ? (((offcuts + waste) / cut) * 100).toFixed(2) : '0.00'
                };
            });

            // Only generate Excel if machine exists (we always have 24 hours now)
            if (hourlyData.length > 0) {

                // Calculate machine totals
                const machineTotals = {
                    machineId: machineId,
                    cutArea: hourlyData.reduce((sum, row) => sum + parseFloat(row.cutArea), 0).toFixed(2),
                    productArea: hourlyData.reduce((sum, row) => sum + parseFloat(row.productArea), 0).toFixed(2),
                    offcutsArea: hourlyData.reduce((sum, row) => sum + parseFloat(row.offcutsArea), 0).toFixed(2),
                    wasteArea: hourlyData.reduce((sum, row) => sum + parseFloat(row.wasteArea), 0).toFixed(2),
                };
                machineTotals.result = (( (parseFloat(machineTotals.offcutsArea) || 0) + (parseFloat(machineTotals.wasteArea) || 0)) / (parseFloat(machineTotals.cutArea) || 1) * 100).toFixed(2);

                machineSummaries.push(machineTotals);

                const workbook = await generateMachineExcel(machineId, hourlyData, reportDateLabel);
                const buffer = await workbook.xlsx.writeBuffer();

                attachments.push({
                    filename: `${machineId}_Offcuts_Report_${reportStartTime.toFormat('yyyy-MM-dd')}.xlsx`,
                    content: buffer,
                    contentType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
                });
            }
        }

        // Send email if there are any reports
        if (attachments.length > 0) {
            await sendDailyReportEmail(attachments, reportDateLabel, machineSummaries);
        } else {
            console.log(`No data available for ${reportDateLabel}, email not sent`);
        }

    } catch (error) {
        console.error("Error generating daily reports:", error);
    }
};

// Send email with attachments
async function sendDailyReportEmail(attachments, date, machineSummaries) {
    const transporter = nodemailer.createTransport({
        service: 'gmail',
        auth: {
            user: process.env.From_Email,
            pass: process.env.From_Email_PW
        }
    });

    // Generate table rows for each machine
    const machineRows = machineSummaries.map(machine => `
        <tr>
            <td style="border: 1px solid #ddd; padding: 8px;">${machine.machineId}</td>
            <td style="border: 1px solid #ddd; padding: 8px; text-align: right;">${machine.cutArea}</td>
            <td style="border: 1px solid #ddd; padding: 8px; text-align: right;">${machine.productArea}</td>
            <td style="border: 1px solid #ddd; padding: 8px; text-align: right;">${machine.offcutsArea}</td>
            <td style="border: 1px solid #ddd; padding: 8px; text-align: right;">${machine.wasteArea}</td>
            <td style="border: 1px solid #ddd; padding: 8px; text-align: right;">${machine.result}</td>
        </tr>
    `).join('');

    // Calculate grand totals
    const grandTotals = {
        cutArea: machineSummaries.reduce((sum, m) => sum + parseFloat(m.cutArea), 0).toFixed(2),
        productArea: machineSummaries.reduce((sum, m) => sum + parseFloat(m.productArea), 0).toFixed(2),
        offcutsArea: machineSummaries.reduce((sum, m) => sum + parseFloat(m.offcutsArea), 0).toFixed(2),
        wasteArea: machineSummaries.reduce((sum, m) => sum + parseFloat(m.wasteArea), 0).toFixed(2),
    };
    grandTotals.result = (( (parseFloat(grandTotals.offcutsArea) || 0) + (parseFloat(grandTotals.wasteArea) || 0)) / (parseFloat(grandTotals.cutArea) || 1) * 100).toFixed(2);

    // Parse multiple email recipients
    const recipients = process.env.DAILY_MACHINE_OFFCUTS_REPORT_EMAIL.split(',').map(email => email.trim()).join(', ');

    const mailOptions = {
        from: process.env.From_Email,
        to: recipients, // Support multiple emails
        subject: `Daily Machine Offcuts Report - ${date}`,
        html: `
            <h2>Daily Machine Offcuts Report</h2>
            <p>Date: <strong>${date}</strong></p>
            <p>Total Reports: <strong>${attachments.length}</strong></p>
            
            <h3>Machine Summary</h3>
            <table style="border-collapse: collapse; width: 100%; max-width: 900px; margin-top: 20px;">
                <thead>
                    <tr style="background-color: #f2f2f2;">
                        <th style="border: 1px solid #ddd; padding: 8px; text-align: left;">Machine Name</th>
                        <th style="border: 1px solid #ddd; padding: 8px; text-align: right;">Used [m²]</th>
                        <th style="border: 1px solid #ddd; padding: 8px; text-align: right;">Product [m²]</th>
                        <th style="border: 1px solid #ddd; padding: 8px; text-align: right;">Offcut [m²]</th>
                        <th style="border: 1px solid #ddd; padding: 8px; text-align: right;">Waste [m²]</th>
                        <th style="border: 1px solid #ddd; padding: 8px; text-align: right;">Result [avg %]</th>
                    </tr>
                </thead>
                <tbody>
                    ${machineRows}
                    <tr style="background-color: #ffffcc; font-weight: bold;">
                        <td style="border: 1px solid #ddd; padding: 8px;">GRAND TOTAL</td>
                        <td style="border: 1px solid #ddd; padding: 8px; text-align: right;">${grandTotals.cutArea}</td>
                        <td style="border: 1px solid #ddd; padding: 8px; text-align: right;">${grandTotals.productArea}</td>
                        <td style="border: 1px solid #ddd; padding: 8px; text-align: right;">${grandTotals.offcutsArea}</td>
                        <td style="border: 1px solid #ddd; padding: 8px; text-align: right;">${grandTotals.wasteArea}</td>
                        <td style="border: 1px solid #ddd; padding: 8px; text-align: right;">${grandTotals.result}</td>
                    </tr>
                </tbody>
            </table>
            
            <p style="margin-top: 30px;">Please find attached the detailed machine offcuts reports.</p>
            <p style="color: #666; font-size: 12px;">This is an automated email. Please do not reply.</p>
        `,
        attachments: attachments
    };

    try {
        await transporter.sendMail(mailOptions);
    } catch (error) {
        console.error("Error sending email:", error);
    }
}

// Generate Sales Report Excel
async function generateSalesReportExcel(salesData, totals, date) {
    const workbook = new ExcelJS.Workbook();
    const worksheet = workbook.addWorksheet('Sales Report');

    // Add headers
    worksheet.columns = [
        { header: 'Order Number', key: 'orderNumber', width: 15 },
        { header: 'Customer Name', key: 'customerName', width: 30 },
        { header: 'Order Entry Person', key: 'orderEntryPerson', width: 20 },
        { header: 'Primary QC Person', key: 'primaryQC', width: 20 },
        { header: 'Secondary QC Person', key: 'secondaryQC', width: 20 },
        { header: 'No Of Lines', key: 'noOfLines', width: 12 },
        { header: 'Quantity', key: 'quantity', width: 12 },
        { header: 'Created Date', key: 'createdDate', width: 18 },
        { header: 'Finished Date', key: 'finishedDate', width: 18 },
        { header: 'Total Price', key: 'totalPrice', width: 15 }
    ];

    // Style header row
    worksheet.getRow(1).font = { bold: true };
    ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H', 'I', 'J'].forEach(col => {
        worksheet.getCell(`${col}1`).fill = {
            type: 'pattern',
            pattern: 'solid',
            fgColor: { argb: 'FFBFBFBF' }
        };
    });

    // Add data rows
    salesData.forEach(row => {
        worksheet.addRow({
            orderNumber: row.OrderID,
            customerName: row.CusName,
            orderEntryPerson: row.OrderEntryPerson,
            primaryQC: row.OrderItemQCPerson || '',
            secondaryQC: row.WOrderItemQCPerson || '',
            noOfLines: row.Total_Lines,
            quantity: row.Total_Pieces,
            createdDate: row.CreatedDateStr || new Date(row.CreatedDate).toLocaleString(),
            finishedDate: row.DeliveryDateStr || '',
            totalPrice: `${row.Total_Amount.toFixed(2)}`
        });
    });

    // Add Grand Total row
    const totalRow = worksheet.addRow({
        orderNumber: '',
        customerName: 'GRAND TOTAL',
        orderEntryPerson: '',
        primaryQC: '',
        secondaryQC: '',
        noOfLines: totals.TotalLineItems,
        quantity: totals.Total_Pieces,
        createdDate: '',
        finishedDate: '',
        totalPrice: `${totals.Total_Amount.toFixed(2)}`
    });
    
    totalRow.font = { bold: true };
    const totalRowNumber = totalRow.number;

    ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H', 'I', 'J'].forEach(col => {
        worksheet.getCell(`${col}${totalRowNumber}`).fill = {
            type: 'pattern',
            pattern: 'solid',
            fgColor: { argb: 'FFFFEB9C' }
        };
    });

    return workbook;
}

// Generate and send daily sales report
exports.generateDailySalesReport = async () => {
    try {
        const OrderMaster = require('../models/ordermasterModel');
        const OrderItem = require('../models/orderitemModel');
        const OrderItemManual = require('../models/orderitemmanualModel');

        // Get today's date in Sydney timezone using Luxon
        const sydneyNow = DateTime.now().setZone('Australia/Sydney');
        const todayStart = sydneyNow.startOf('day').toJSDate(); 
        const todayEnd = sydneyNow.endOf('day').toJSDate(); 
        const todayStr = sydneyNow.toFormat('yyyy-MM-dd');
        
       
        const matchCondition = {
            created: {
                $gte: todayStart,
                $lte: todayEnd
            }
        };

        // Aggregation pipeline
        const aggregatePipeline = [
            { $match: matchCondition },
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
            { 
                $lookup: { 
                    from: "users", 
                    as: "orderItemQCInfo", 
                    let: { order_item_qc_person: "$order_item_qc_person" }, 
                    pipeline: [
                        { $match: { $expr: { $eq: ["$_id", "$$order_item_qc_person"] } } }, 
                        { $project: { user_firstName: 1, user_lastName: 1 } }
                    ] 
                } 
            },
            { 
                $lookup: { 
                    from: "users", 
                    as: "wOrderItemQCInfo", 
                    let: { w_order_item_qc_person: "$w_order_item_qc_person" }, 
                    pipeline: [
                        { $match: { $expr: { $eq: ["$_id", "$$w_order_item_qc_person"] } } }, 
                        { $project: { user_firstName: 1, user_lastName: 1 } }
                    ] 
                } 
            },
            { $unwind: { path: "$customerInfo", preserveNullAndEmptyArrays: true } },
            { $unwind: { path: "$usersInfo", preserveNullAndEmptyArrays: true } },
            { $unwind: { path: "$orderItemQCInfo", preserveNullAndEmptyArrays: true } },
            { $unwind: { path: "$wOrderItemQCInfo", preserveNullAndEmptyArrays: true } },
            {
                $addFields: {
                    order_Entry_Person: { $concat: ["$usersInfo.user_firstName", " ", "$usersInfo.user_lastName"] },
                    order_item_qc_person: { $concat: ["$orderItemQCInfo.user_firstName", " ", "$orderItemQCInfo.user_lastName"] },
                    w_order_item_qc_person: { $concat: ["$wOrderItemQCInfo.user_firstName", " ", "$wOrderItemQCInfo.user_lastName"] },
                }
            },
            { $sort: { created: -1 } }
        ];

        const orders = await OrderMaster.aggregate(aggregatePipeline);

        if (orders.length === 0) {
            console.log(`No sales data available for ${todayStr}, email not sent`);
            return;
        }

        // Get all order UIDs
        const allOrderUIDs = orders.map(o => o.order_unique_id);

        // Fetch all order items
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

        // Calculate totals
        let overallTotalLineItems = 0;
        let overallTotalPieces = 0;
        let overallTotalAmount = 0;

        const salesData = orders.map(order => {
            const orderItems = allOrderItemsMap[order.order_unique_id] || [];
            const totalPieces = orderItems.reduce((acc, curr) => acc + parseInt(curr.order_item_me_uom_value || curr.order_item_pieces || 0), 0);
            const totalLineAmount = orderItems.reduce((acc, curr) => acc + parseFloat(curr.order_item_special_me_price || curr.order_item_qty_price || 0), 0);

            overallTotalLineItems += orderItems.length;
            overallTotalPieces += totalPieces;
            overallTotalAmount += totalLineAmount;

            return {
                OrderID: order.order_unique_id,
                CusName: order.customerInfo?.account_Name || "",
                OrderEntryPerson: order.order_Entry_Person,
                CreatedDate: order.created,
                CreatedDateStr: order.created_str || new Date(order.created).toLocaleString(),
                DeliveryDateStr: order.order_delivery_date_str,
                Total_Amount: totalLineAmount,
                Total_Pieces: totalPieces,
                Total_Lines: orderItems.length,
                OrderItemQCPerson: order.order_item_qc_person,
                WOrderItemQCPerson: order.w_order_item_qc_person,
            };
        });

        const totals = {
            TotalLineItems: overallTotalLineItems,
            Total_Amount: overallTotalAmount,
            Total_Pieces: overallTotalPieces,
            Total_Orders: orders.length
        };

        // Generate Excel
        const workbook = await generateSalesReportExcel(salesData, totals, todayStr);
        const buffer = await workbook.xlsx.writeBuffer();

        const attachment = {
            filename: `Sales_Report_${todayStr}.xlsx`,
            content: buffer,
            contentType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
        };

        // Send email
        await sendDailySalesReportEmail(attachment, todayStr, totals, salesData);

    } catch (error) {
        console.error("Error generating daily sales report:", error);
    }
};


// Send sales report email
async function sendDailySalesReportEmail(attachment, date, totals, salesData) {
    const transporter = nodemailer.createTransport({
        service: 'gmail',
        auth: {
            user: process.env.From_Email,
            pass: process.env.From_Email_PW
        }
    });

    // Parse multiple email recipients
    const recipients = process.env.DAILY_SALES_REPORT_EMAIL.split(',').map(email => email.trim()).join(', ');

    const mailOptions = {
        from: process.env.From_Email,
        to: recipients, // Support multiple emails
        subject: `Daily Sales Report - ${date}`,
        html: `
            <h2>Daily Sales Report</h2>
            <p>Date: <strong>${date}</strong></p>
            
            <h3>Summary</h3>
            <table style="border-collapse: collapse; width: 100%; max-width: 600px; margin-top: 20px;">
                <tr style="background-color: #f2f2f2;">
                    <th style="border: 1px solid #ddd; padding: 8px; text-align: left;">Metric</th>
                    <th style="border: 1px solid #ddd; padding: 8px; text-align: right;">Value</th>
                </tr>
                <tr>
                    <td style="border: 1px solid #ddd; padding: 8px;">Total Orders</td>
                    <td style="border: 1px solid #ddd; padding: 8px; text-align: right;"><strong>${totals.Total_Orders}</strong></td>
                </tr>
                <tr>
                    <td style="border: 1px solid #ddd; padding: 8px;">Total Line Items</td>
                    <td style="border: 1px solid #ddd; padding: 8px; text-align: right;"><strong>${totals.TotalLineItems}</strong></td>
                </tr>
                <tr>
                    <td style="border: 1px solid #ddd; padding: 8px;">Total Quantity</td>
                    <td style="border: 1px solid #ddd; padding: 8px; text-align: right;"><strong>${totals.Total_Pieces}</strong></td>
                </tr>
                <tr style="background-color: #ffffcc; font-weight: bold;">
                    <td style="border: 1px solid #ddd; padding: 8px;">Total Amount</td>
                    <td style="border: 1px solid #ddd; padding: 8px; text-align: right;"><strong>${totals.Total_Amount.toFixed(2)}</strong></td>
                </tr>
            </table>
            
            <p style="margin-top: 30px;">Please find attached the detailed sales report.</p>
            <p style="color: #666; font-size: 12px;">This is an automated email. Please do not reply.</p>
        `,
        attachments: [attachment]
    };

    try {
        await transporter.sendMail(mailOptions);
    } catch (error) {
        console.error("Error sending email:", error);
    }
}

// Generate Excel report for folding machines
async function generateFoldingExcel(machineId, data, date) {
    const workbook = new ExcelJS.Workbook();
    const worksheet = workbook.addWorksheet('Folding Report');

    // Add headers
    worksheet.columns = [
        { header: 'Date', key: 'date', width: 12 },
        { header: 'Time Range', key: 'timeRange', width: 15 },
        { header: 'Machine Name', key: 'machineName', width: 35 },
        { header: 'Total Pieces Folded', key: 'totalPieces', width: 20 }
    ];

    // Style header row
    worksheet.getRow(1).font = { bold: true };
    ['A', 'B', 'C', 'D'].forEach(col => {
        worksheet.getCell(`${col}1`).fill = {
            type: 'pattern',
            pattern: 'solid',
            fgColor: { argb: 'FFBFBFBF' }
        };
    });

    // Add data rows
    data.forEach(row => {
        worksheet.addRow(row);
    });

    // Add Grand Total row
    const totals = {
        date: '',
        timeRange: '',
        machineName: 'GRAND TOTAL',
        totalPieces: data.reduce((sum, row) => sum + parseInt(row.totalPieces || 0), 0)
    };
    
    const totalRow = worksheet.addRow(totals);
    totalRow.font = { bold: true };

    const totalRowNumber = totalRow.number;

    ['A', 'B', 'C', 'D'].forEach(col => {
        worksheet.getCell(`${col}${totalRowNumber}`).fill = {
            type: 'pattern',
            pattern: 'solid',
            fgColor: { argb: 'FFFFEB9C' }
        };
    });

    return workbook;
}

// Generate and send daily folding reports
exports.generateDailyFoldingReport = async () => {
    try {
        await sql.connect(config);

        // Get Sydney timezone dates using Luxon
        // Report covers: Previous day 6:00 AM to Current day 5:59 AM
        const sydneyNow = DateTime.now().setZone('Australia/Sydney');
        const reportEndTime = sydneyNow.set({ hour: 5, minute: 59, second: 59, millisecond: 0 });
        const reportStartTime = sydneyNow.minus({ days: 1 }).set({ hour: 6, minute: 0, second: 0, millisecond: 0 });
        
        const startDateTime = reportStartTime.toSQL({ includeOffset: false });
        const endDateTime = reportEndTime.toSQL({ includeOffset: false });
        const reportDateLabel = `${reportStartTime.toFormat('yyyy-MM-dd')} 6AM to ${reportEndTime.toFormat('yyyy-MM-dd')} 6AM`;

        // Get all folding machines
        const machinesResult = await sql.query(`
            SELECT DISTINCT FoldedBy AS Machines
            FROM Jobs
            WHERE FoldedBy IS NOT NULL AND FoldedBy != ''
            ORDER BY FoldedBy ASC
        `);
        
        const machines = machinesResult.recordset.map(row => row.Machines);
        const attachments = [];
        const machineSummaries = []; // Store summary for each machine

        // Generate Excel for each machine with data
        for (const machineId of machines) {
            const request = new sql.Request();
            request.input('startDateTime', sql.VarChar(50), startDateTime);
            request.input('endDateTime', sql.VarChar(50), endDateTime);
            request.input('machineId', machineId);

            const selectQuery = `
                ;WITH Hours AS (
                    SELECT 
                        DATEADD(HOUR, n, CONVERT(DATETIME, @startDateTime, 120)) AS HourDateTime,
                        DATEPART(HOUR, DATEADD(HOUR, n, CONVERT(DATETIME, @startDateTime, 120))) AS HourValue,
                        CAST(DATEADD(HOUR, n, CONVERT(DATETIME, @startDateTime, 120)) AS DATE) AS HourDate
                    FROM (
                        SELECT 0 AS n UNION ALL SELECT 1 UNION ALL SELECT 2 UNION ALL SELECT 3 UNION ALL SELECT 4 UNION ALL SELECT 5 UNION ALL
                        SELECT 6 UNION ALL SELECT 7 UNION ALL SELECT 8 UNION ALL SELECT 9 UNION ALL SELECT 10 UNION ALL SELECT 11 UNION ALL
                        SELECT 12 UNION ALL SELECT 13 UNION ALL SELECT 14 UNION ALL SELECT 15 UNION ALL SELECT 16 UNION ALL SELECT 17 UNION ALL
                        SELECT 18 UNION ALL SELECT 19 UNION ALL SELECT 20 UNION ALL SELECT 21 UNION ALL SELECT 22 UNION ALL SELECT 23
                    ) AS Numbers
                    WHERE DATEADD(HOUR, n, CONVERT(DATETIME, @startDateTime, 120)) <= CONVERT(DATETIME, @endDateTime, 120)
                )
                SELECT 
                    h.HourValue AS HourStart,
                    h.HourDate AS ReportDate,
                    @machineId AS MachineName,
                    COALESCE(SUM(j.QtyFolded), 0) AS TotalPiecesFolded
                FROM Hours h
                LEFT JOIN Jobs j ON 
                    DATEPART(HOUR, j.Folded) = h.HourValue 
                    AND CAST(j.Folded AS DATE) = h.HourDate
                    AND j.FoldedBy = @machineId
                    AND j.Folded IS NOT NULL
                    AND j.FoldedBy IS NOT NULL AND j.FoldedBy != ''
                GROUP BY h.HourValue, h.HourDate
                ORDER BY h.HourDate ASC, h.HourValue ASC
            `;

            const result = await request.query(selectQuery);

            // Generate Excel for all hours (including zero values)
            const hourlyData = result.recordset.map(row => ({
                date: row.ReportDate ? new Date(row.ReportDate).toISOString().split('T')[0] : '',
                timeRange: `${String(row.HourStart).padStart(2, '0')}:00 - ${String(row.HourStart + 1).padStart(2, '0')}:00`,
                machineName: row.MachineName,
                totalPieces: row.TotalPiecesFolded || 0
            }));

            // Only generate Excel if machine exists (we always have 24 hours now)
            if (hourlyData.length > 0) {

                // Calculate machine totals
                const machineTotals = {
                    machineId: machineId,
                    totalPieces: hourlyData.reduce((sum, row) => sum + parseInt(row.totalPieces || 0), 0)
                };

                machineSummaries.push(machineTotals);

                const workbook = await generateFoldingExcel(machineId, hourlyData, reportDateLabel);
                const buffer = await workbook.xlsx.writeBuffer();

                attachments.push({
                    filename: `${machineId}_Folding_Report_${reportStartTime.toFormat('yyyy-MM-dd')}.xlsx`,
                    content: buffer,
                    contentType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
                });
            }
        }

        // Send email if there are any reports
        if (attachments.length > 0) {
            await sendDailyFoldingReportEmail(attachments, reportDateLabel, machineSummaries);
        } else {
            console.log(`No folding data available for ${reportDateLabel}, email not sent`);
        }

    } catch (error) {
        console.error("Error generating daily folding reports:", error);
    }
};

// Send folding report email with attachments
async function sendDailyFoldingReportEmail(attachments, date, machineSummaries) {
    const transporter = nodemailer.createTransport({
        service: 'gmail',
        auth: {
            user: process.env.From_Email,
            pass: process.env.From_Email_PW
        }
    });

    // Generate table rows for each machine
    const machineRows = machineSummaries.map(machine => `
        <tr>
            <td style="border: 1px solid #ddd; padding: 8px;">${machine.machineId}</td>
            <td style="border: 1px solid #ddd; padding: 8px; text-align: right;">${machine.totalPieces}</td>
        </tr>
    `).join('');

    // Calculate grand totals
    const grandTotals = {
        totalPieces: machineSummaries.reduce((sum, m) => sum + parseInt(m.totalPieces || 0), 0)
    };

    // Parse multiple email recipients
    const recipients = process.env.DAILY_MACHINE_FOLDING_REPORT_EMAIL 
        ? process.env.DAILY_MACHINE_FOLDING_REPORT_EMAIL.split(',').map(email => email.trim()).join(', ')
        : process.env.DAILY_MACHINE_OFFCUTS_REPORT_EMAIL.split(',').map(email => email.trim()).join(', ');

    const mailOptions = {
        from: process.env.From_Email,
        to: recipients,
        subject: `Daily Machine Folding Report - ${date}`,
        html: `
            <h2>Daily Machine Folding Report</h2>
            <p>Period: <strong>${date}</strong></p>
            <p>Total Reports: <strong>${attachments.length}</strong></p>
            
            <h3>Machine Summary</h3>
            <table style="border-collapse: collapse; width: 100%; max-width: 600px; margin-top: 20px;">
                <thead>
                    <tr style="background-color: #f2f2f2;">
                        <th style="border: 1px solid #ddd; padding: 8px; text-align: left;">Machine Name</th>
                        <th style="border: 1px solid #ddd; padding: 8px; text-align: right;">Total Pieces Folded</th>
                    </tr>
                </thead>
                <tbody>
                    ${machineRows}
                    <tr style="background-color: #ffffcc; font-weight: bold;">
                        <td style="border: 1px solid #ddd; padding: 8px;">GRAND TOTAL</td>
                        <td style="border: 1px solid #ddd; padding: 8px; text-align: right;">${grandTotals.totalPieces}</td>
                    </tr>
                </tbody>
            </table>
            
            <p style="margin-top: 30px;">Please find attached the detailed machine folding reports.</p>
            <p style="color: #666; font-size: 12px;">This is an automated email. Please do not reply.</p>
        `,
        attachments: attachments
    };

    try {
        await transporter.sendMail(mailOptions);
    } catch (error) {
        console.error("Error sending folding report email:", error);
    }
}

// Schedule daily report at specific time
exports.scheduleDailyReports = () => {
    const reportTimeH = process.env.DAILY_EMAIL_REPORT_TIME_H || '22'; 
    const reportTimeM = process.env.DAILY_EMAIL_REPORT_TIME_M || '45';
    console.log(`Scheduling daily sales reports at ${reportTimeH}:${reportTimeM}...`);
    // Sales report
    schedule.scheduleJob({hour: reportTimeH, minute: reportTimeM, tz:"Australia/Sydney"}, async () => {
        console.log('Running scheduled daily sales report generation...');
        await exports.generateDailySalesReport();
    });

    const machineReportTimeH = process.env.DAILY_MACHINE_EMAIL_REPORT_TIME_H || '8'; 
    const machineReportTimeM = process.env.DAILY_MACHINE_EMAIL_REPORT_TIME_M || '0';
    console.log(`Scheduling daily machine offcuts reports at ${machineReportTimeH}:${machineReportTimeM}...`);
    // Machine offcuts report (covers previous day 6 AM to current day 5:59 AM)
    schedule.scheduleJob({hour: machineReportTimeH, minute: machineReportTimeM, tz:"Australia/Sydney"}, async () => {
        console.log('Running scheduled daily machine offcuts report generation...');
        await exports.generateDailyReports();
        await exports.generateDailyFoldingReport();
    });
    
};