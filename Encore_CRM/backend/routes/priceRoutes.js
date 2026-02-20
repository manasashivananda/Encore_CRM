const express = require('express');
const router = express.Router();
const priceController = require('../controllers/priceCtrl');

router.get('/custom-unit-price', priceController.getCustomUnitPrice);


module.exports = router;
