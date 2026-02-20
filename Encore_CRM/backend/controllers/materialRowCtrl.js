// controllers/materialRowCtrl.js
const mongoose = require('mongoose');
const { logger } = require('../utils/logger');
const MaterialRow = require('../models/materialRowModel');

exports.createMaterialRow = async (req, res) => {
  try {
    const { templateId } = req.params;

    if (!mongoose.Types.ObjectId.isValid(templateId)) {
      return res.status(400).json({ error: 'Invalid templateId' });
    }

    const lastRow = await MaterialRow.find({ templateId })
      .sort({ rowNumber: -1 })
      .limit(1)
      .lean();

    const nextRowNumber = lastRow.length > 0 ? lastRow[0].rowNumber + 1 : 1;
   
    // Remove _id and other fields that shouldn't be set during creation
    const { _id, __v, createdAt, updatedAt, ...bodyWithoutId } = req.body;
    
    const rowData = {
      ...bodyWithoutId,
      templateId,
      rowNumber: nextRowNumber
    };

    // Validate required fields before creation
    const requiredFields = ['material', 'color', 'quantity', 'length', 'tag', 'unitPrice', 'extPrice'];
    const missingFields = requiredFields.filter(field => !rowData[field] && rowData[field] !== 0);
    
    if (missingFields.length > 0) {
      return res.status(400).json({ 
        error: 'Missing required fields', 
        missingFields,
        receivedData: rowData 
      });
    }

    const row = await MaterialRow.create(rowData);

    res.status(201).json(row);
  } catch (err) {
    logger.error('Error creating material row:', err);
    
    res.status(500).json({ 
      error: 'Failed to save material row',
      details: err.message,
      stack: process.env.NODE_ENV === 'development' ? err.stack : undefined
    });
  }
};

exports.getMaterialRows = async (req, res) => {
  try {
    const { templateId } = req.params;

    if (!mongoose.Types.ObjectId.isValid(templateId)) {
      return res.status(400).json({ error: 'Invalid templateId' });
    }

    const rows = await MaterialRow.find({ templateId }).lean();
    res.json(rows);
  } catch (err) {
    logger.error('Error fetching material rows:', err);
    res.status(500).json({ error: 'Failed to fetch material rows' });
  }
};

exports.updateRow = async (req, res) => {
  try {
    const { rowId } = req.params;
    const updateData = req.body;

    // Validate the ID
    if (!mongoose.Types.ObjectId.isValid(rowId)) {
      return res.status(400).json({ error: 'Invalid rowId' });
    }

    // Remove any fields that shouldn't be updated
    const { _id, templateId, createdAt, updatedAt, __v, ...fieldsToUpdate } = updateData;

    // Update all provided fields
    const updated = await MaterialRow.findByIdAndUpdate(
      rowId,
      fieldsToUpdate,
      { new: true, runValidators: true }
    );

    if (!updated) {
      return res.status(404).json({ error: 'Material row not found' });
    }

    res.json(updated);
  } catch (err) {
    logger.error('Error updating material row:', err);
    res.status(500).json({ error: 'Failed to update material row', details: err.message });
  }
};

exports.deleteRow = async (req, res) => {
  try {
    const { rowId } = req.params;

    if (!mongoose.Types.ObjectId.isValid(rowId)) {
      return res.status(400).json({ error: 'Invalid rowId' });
    }

    // First, get the row to find its swiJobId and templateId
    const rowToDelete = await MaterialRow.findById(rowId);
    if (!rowToDelete) {
      return res.status(404).json({ error: 'Material row not found' });
    }

    const { templateId, swiJobId } = rowToDelete;

    // Delete the material row
    await MaterialRow.findByIdAndDelete(rowId);

    // CRITICAL FIX: If this row had an swiJobId:
    // 1. Remove it from template.swiJobIds
    // 2. Delete the SWI job from SWI database (prevents orphaned tags)
    if (swiJobId && templateId) {
      const Template = require('../models/templateModel');
      const template = await Template.findById(templateId);

      if (template && template.swiJobIds && template.swiJobIds.length > 0) {
        const swiJobIdStr = swiJobId.toString();
        const updatedSwiJobIds = template.swiJobIds.filter(id => id.toString() !== swiJobIdStr);

        if (updatedSwiJobIds.length !== template.swiJobIds.length) {
          template.swiJobIds = updatedSwiJobIds;
          await template.save();
          logger.info(`[deleteRow] Removed swiJobId ${swiJobId} from template ${templateId}. Remaining: ${updatedSwiJobIds.length}`);
        }
      }

      // Also delete the SWI job from SWI database to free up the tag
      try {
        const swiService = require('../services/swiService');
        await swiService.deleteSWIJobs([swiJobId], template?.orderNumber || '');
        logger.info(`[deleteRow] Deleted SWI job ${swiJobId} from SWI database`);
      } catch (swiError) {
        // Log but don't fail - MongoDB deletion is more important
        logger.warn(`[deleteRow] Failed to delete SWI job ${swiJobId}: ${swiError.message}`);
      }
    }

    res.json({ message: 'Deleted successfully', deletedSwiJobId: swiJobId || null });
  } catch (err) {
    logger.error('Error deleting material row:', err);
    res.status(500).json({ error: 'Failed to delete material row' });
  }
};

// Bulk delete material rows (for rollback on SWI failure)
exports.bulkDeleteRows = async (req, res) => {
  try {
    const { rowIds, templateId } = req.body;

    if (!rowIds || !Array.isArray(rowIds) || rowIds.length === 0) {
      return res.status(400).json({ error: 'rowIds array is required' });
    }

    // Validate all rowIds are valid ObjectIds
    const invalidIds = rowIds.filter(id => !mongoose.Types.ObjectId.isValid(id));
    if (invalidIds.length > 0) {
      return res.status(400).json({
        error: 'Invalid rowIds',
        invalidIds
      });
    }

    // CRITICAL FIX: Get swiJobIds from rows BEFORE deleting them
    const rowsToDelete = await MaterialRow.find({ _id: { $in: rowIds } }).lean();
    const swiJobIdsToRemove = rowsToDelete
      .filter(row => row.swiJobId)
      .map(row => row.swiJobId.toString());
    const affectedTemplateId = rowsToDelete[0]?.templateId;

    // Build delete query
    const deleteQuery = { _id: { $in: rowIds } };

    // If templateId provided, add extra safety check
    if (templateId && mongoose.Types.ObjectId.isValid(templateId)) {
      deleteQuery.templateId = templateId;
    }

    const result = await MaterialRow.deleteMany(deleteQuery);

    // CRITICAL FIX: Remove deleted swiJobIds from template AND delete from SWI database
    let orderNumber = '';
    if (swiJobIdsToRemove.length > 0 && affectedTemplateId) {
      const Template = require('../models/templateModel');
      const template = await Template.findById(affectedTemplateId);
      orderNumber = template?.orderNumber || '';

      if (template && template.swiJobIds && template.swiJobIds.length > 0) {
        const updatedSwiJobIds = template.swiJobIds.filter(
          id => !swiJobIdsToRemove.includes(id.toString())
        );

        if (updatedSwiJobIds.length !== template.swiJobIds.length) {
          template.swiJobIds = updatedSwiJobIds;
          await template.save();
          logger.info(`[bulkDeleteRows] Removed ${swiJobIdsToRemove.length} swiJobIds from template. Remaining: ${updatedSwiJobIds.length}`);
        }
      }

      // Also delete the SWI jobs from SWI database to free up the tags
      try {
        const swiService = require('../services/swiService');
        await swiService.deleteSWIJobs(swiJobIdsToRemove, orderNumber);
        logger.info(`[bulkDeleteRows] Deleted ${swiJobIdsToRemove.length} SWI jobs from SWI database`);
      } catch (swiError) {
        // Log but don't fail - MongoDB deletion is more important
        logger.warn(`[bulkDeleteRows] Failed to delete SWI jobs: ${swiError.message}`);
      }
    }

    res.json({
      success: true,
      deletedCount: result.deletedCount,
      deletedSwiJobIds: swiJobIdsToRemove,
      message: `Deleted ${result.deletedCount} material row(s)`
    });
  } catch (err) {
    logger.error('Error bulk deleting material rows:', err);
    res.status(500).json({ error: 'Failed to bulk delete material rows' });
  }
};
