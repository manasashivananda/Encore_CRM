const mongoose = require('mongoose');

//Model Inclusion
const LoginUsers = require('../models/loginModel');
const Account = require('../models/accountModel');
const OrderMaster = require('../models/ordermasterModel');
const CoreProduct = require('../models/coreproductModel');
const { logError } = require('../logger');

//Dashboard API
exports.dashboardInfoDetails = async (req, res) => {
    try {
    
        const [
            customerCount,
            orderCount,
            userCount,
            materialCount
        ] = await Promise.all([
            Account.countDocuments({ account_DataRemoved: false }),
            OrderMaster.countDocuments(),
            LoginUsers.countDocuments(),
            CoreProduct.countDocuments()
        ]);
        const dashboardInfoObj = {
            Customer: { count: customerCount },
            Orders: { count: orderCount },
            Users: { count: userCount },
            Materials: { count: materialCount }
        };
        res.status(200).send(dashboardInfoObj).end();
    } catch (err) {
        logError('dashboardInfoDetails', err, req.user.user_ref_id);
        res.status(500).send("Data Fetching Failed");
    }
}

exports.dashboardMonthlyOrderDetails = async (req, res) => {
    try {
        const currentDate = new Date();
        const monthFirstDay = new Date(currentDate.getFullYear(), currentDate.getMonth(), 1);
        const monthLastDay = new Date(currentDate.getFullYear(), currentDate.getMonth() + 1, 0);
        const statusArray = ["Order Created", "Order In Progress", "Production In Progress"];
        const headers = statusArray.map(status => ({ value: status }));
        const monthlyOrderInfoObj = { status: headers };
        const orders = await OrderMaster.aggregate([
            { $match: { created: { $gte: monthFirstDay, $lt: monthLastDay }, order_status: { $in: statusArray } } },
            { $group: { _id: "$order_status", count: { $sum: 1 } } }
        ]);

        const orderDetails = statusArray.map(status => {
            const order = orders.find(o => o._id === status) || { count: 0 };
            return { name: status, count: order.count };
        });

        monthlyOrderInfoObj.order = orderDetails;
        res.status(200).send(monthlyOrderInfoObj).end();
    } catch (err) {
        logError('dashboardMonthlyOrderDetails', err, req.user.user_ref_id);
        res.status(500).send("Data Fetching Failed");
    }
};

exports.dashboardYearlyOrderDetails = async (req, res) => {
    try {
        const performanceMonthCount = 12;
        const today = new Date();
        const startDate = new Date(today.getFullYear(), today.getMonth() - performanceMonthCount + 1, 1);
        const endDate = new Date(today.getFullYear(), today.getMonth() + 1, 1);
        const pipeline = [
            {
                $match: {
                    created: { $gte: startDate, $lt: endDate },
                    order_status: "Production In Progress"
                }
            },
            {
                $group: {
                    _id: {
                        year: { $year: "$created" },
                        month: { $month: "$created" }
                    },
                    count: { $sum: 1 }
                }
            },
            {
                $sort: { "_id.year": -1, "_id.month": -1 }
            }
        ];
        const monthlyOrderCounts = await OrderMaster.aggregate(pipeline);
        const monthNames = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
        const monthname = [];
        const orders = [];

        for (let i = performanceMonthCount; i > 0; i--) {
            const currentDate = new Date(today.getFullYear(), today.getMonth() + 1 - i, 1);
            const monthName = monthNames[currentDate.getMonth()];
            monthname.push({ value: monthName });
            const orderData = monthlyOrderCounts.find(data => 
                data._id.year === currentDate.getFullYear() && data._id.month === currentDate.getMonth() + 1
            );
            orders.push({
                month: monthName,
                Completed: orderData ? orderData.count : 0
            });
        }

        const yearlyOrderInfoObj = {
            months: monthname,
            order: orders
        };
        res.status(200).send(yearlyOrderInfoObj);
    } catch (err) {
        logError('dashboardYearlyOrderDetails', err, req.user.user_ref_id);
        res.status(500).send("Data Fetching Failed");
    }
};
