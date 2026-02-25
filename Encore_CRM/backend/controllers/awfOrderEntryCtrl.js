/**
 * AWF Order Entry Controller — CRUD for AWF product selections on orders
 *
 * Handles saving, fetching, and soft-deleting AWF material entries.
 * Each entry = one product + material + color + qty from AWFSelectMaterials page.
 *
 * Collection: awf_order_entries
 * Created: 24-Feb-2026
 */
const AWFOrderEntry = require('../models/awfOrderEntryModel');
const { logger } = require('../utils/logger');

/**
 * Create a new AWF order entry
 * POST /api/awf-entries
 */
exports.createEntry = async (req, res) => {
  try {
    const {
      orderNumber, customerId, customerName,
      productId, productName, partClass, subCategory,
      material, color, thickness,
      numberOfPieces, length, dimensions, tapered,
      barcode, note, unitPrice, productImage,
      size, measurements, angleDegree, offsetType, adjustableRange, seamSide
    } = req.body;

    // Validate required fields
    if (!orderNumber || !productName || !partClass || !material || !numberOfPieces) {
      return res.status(400).json({
        success: false,
        message: 'Missing required fields: orderNumber, productName, partClass, material, numberOfPieces'
      });
    }

    const entry = await AWFOrderEntry.create({
      orderNumber, customerId, customerName,
      productId, productName, partClass, subCategory,
      material, color, thickness,
      numberOfPieces, length, dimensions, tapered,
      barcode, note, unitPrice, productImage,
      size, measurements, angleDegree, offsetType, adjustableRange, seamSide,
      status: 'active'
    });

    logger.debug('AWF order entry created:', entry._id, 'for order:', orderNumber);

    res.status(201).json({ success: true, data: entry });
  } catch (error) {
    logger.error('Error creating AWF order entry:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to create AWF entry',
      error: error.message
    });
  }
};

/**
 * Get all active AWF entries for an order
 * GET /api/awf-entries/:orderNumber
 */
exports.getEntriesByOrder = async (req, res) => {
  try {
    const entries = await AWFOrderEntry.find({
      orderNumber: req.params.orderNumber,
      status: 'active'
    }).sort({ createdAt: 1 }).lean();

    res.status(200).json({ success: true, data: entries });
  } catch (error) {
    logger.error('Error fetching AWF order entries:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch AWF entries',
      error: error.message
    });
  }
};

/**
 * Update an existing AWF order entry
 * PUT /api/awf-entries/:id
 */
exports.updateEntry = async (req, res) => {
  try {
    const {
      material, color, thickness,
      numberOfPieces, length, dimensions, tapered,
      barcode, note, unitPrice,
      size, measurements, angleDegree, offsetType, adjustableRange, seamSide
    } = req.body;

    const entry = await AWFOrderEntry.findByIdAndUpdate(
      req.params.id,
      {
        material, color, thickness,
        numberOfPieces, length, dimensions, tapered,
        barcode, note, unitPrice,
        size, measurements, angleDegree, offsetType, adjustableRange, seamSide
      },
      { new: true, runValidators: true }
    );

    if (!entry) {
      return res.status(404).json({ success: false, message: 'Entry not found' });
    }

    logger.debug('AWF order entry updated:', req.params.id);

    res.status(200).json({ success: true, data: entry });
  } catch (error) {
    logger.error('Error updating AWF order entry:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to update AWF entry',
      error: error.message
    });
  }
};

/**
 * Soft-delete an AWF order entry
 * DELETE /api/awf-entries/:id
 */
exports.deleteEntry = async (req, res) => {
  try {
    const entry = await AWFOrderEntry.findByIdAndDelete(req.params.id);

    if (!entry) {
      return res.status(404).json({ success: false, message: 'Entry not found' });
    }

    logger.debug('AWF order entry hard-deleted:', req.params.id);
    res.status(200).json({ success: true, data: entry });
  } catch (error) {
    logger.error('Error deleting AWF order entry:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to delete AWF entry',
      error: error.message
    });
  }
};
