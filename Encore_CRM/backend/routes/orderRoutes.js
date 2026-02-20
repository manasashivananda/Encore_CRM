const express = require('express');
const router = express.Router();
const Order = require('../models/ordermasterModel');
const orderController = require('../controllers/orderCtrl');
// Quotation code
const Quote = require('../models/quotationmasterModel')

// TEMP DEBUG version of by-order-number
// Handled Quotation check also using type param
router.get('/by-order-number/:type/:orderNumber', async (req, res) => {
    try {
        if(req.params.type === "order"){
            const order = await Order.findOne({ order_unique_id: req.params.orderNumber });

            if (!order) {
                return res.status(404).json({ message: 'Order not found' });
            }

            res.json(order);
        }else{
            const quote = await Quote.findOne({ quote_unique_id: req.params.orderNumber });

            if (!quote) {
                return res.status(404).json({ message: 'Quote not found' });
            }

            res.json(quote);
        }
    } catch (error) {
        res.status(500).json({ message: 'Server error' });
    }
});

// Get order by ID
router.get('/id/:id', async (req, res) => {
    try {
        const order = await Order.findById(req.params.id);

        if (!order) {
            return res.status(404).json({ message: 'Order not found' });
        }

        res.json(order);
    } catch (error) {
        res.status(500).json({ message: 'Server error' });
    }
});

router.get('/:orderNumber/drawings', orderController.getDrawingsByOrderNumber);
// Handled Quotation check also using type param
router.get('/id/:orderId/:type/drawings', orderController.getDrawingsByOrderId);

module.exports = router;
