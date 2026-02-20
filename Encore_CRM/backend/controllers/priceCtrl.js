const { logger } = require('../utils/logger');
const CustomerMaterialPrice = require('../models/customermaterialpricebookModel');
const Account = require('../models/accountModel');
const CoreProduct = require('../models/coreproductModel');
const ProductGirth = require('../models/productgirthModel');
const ProductFold = require('../models/productfoldModel');
const mongoose = require('mongoose');


// Code change  by Rahul
exports.getCustomUnitPrice = async (req, res) => {
  try {
    const { material, customerId, girth, folds } = req.query;

    if (!material || !customerId || !girth || !folds) {
      return res.status(400).json({ error: 'Missing required parameters' });
    }

    const girthValue = parseInt(girth);
    const foldValue = parseInt(folds);
    
    // Validate parsed values
    if (isNaN(girthValue) || girthValue <= 0) {
      return res.status(400).json({ error: 'Invalid girth value' });
    }
    if (isNaN(foldValue) || foldValue < 0) {
      return res.status(400).json({ error: 'Invalid folds value' });
    }

    // Resolve customer
    if (!mongoose.Types.ObjectId.isValid(customerId)) {
      return res.status(404).json({ error: 'Customer not found' });
    }
    
    const customerDoc = await Account.findById(customerId);
    if (!customerDoc) return res.status(404).json({ error: 'Customer not found' });

    // Resolve material ID by name (case-insensitive)
    const materialDoc = await CoreProduct.findOne({ 
      core_Product_Name: { $regex: new RegExp(`^${material}$`, 'i') }
    });
    if (!materialDoc) return res.status(404).json({ error: 'Material not found' });

    // Find all girth rows ≤ target girth
    const girthDocs = await ProductGirth.find({ product_Girth: { $lte: girthValue } }).sort({ product_Girth: -1 });
    if (!girthDocs.length) return res.status(404).json({ error: 'No matching girth found' });

    const matchedGirth = girthDocs[0]; // closest <=

    // Resolve fold ID
    const foldDoc = await ProductFold.findOne({ product_Fold: folds.toString() });
    if (!foldDoc) return res.status(404).json({ error: 'Fold not found' });

    // First, try to find customer-specific pricing
    const customerPriceRow = await CustomerMaterialPrice.findOne({
      customer_ID: customerId,
      material_ID: materialDoc._id,
      girth_ID: matchedGirth._id,
      fold_ID: foldDoc._id
    });

    if (!customerPriceRow) {
      return res.status(404).json({
        error: 'No customer-specific pricing found for this material/girth/fold combination'
      });
    }

    return res.status(200).json({ unitPrice: customerPriceRow.price_Values });


  } catch (err) {
    logger.error('❌ getCustomUnitPrice error:', err);
    return res.status(500).json({ error: 'Internal server error' });
  }
};