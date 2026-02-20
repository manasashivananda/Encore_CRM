const express = require('express');
const router = express.Router();
const materialRowController = require('../controllers/materialRowCtrl');
const {
  deleteTemplate,
  generateSplitPreviews,
  generateOrderDrawingsPDF,
  getDrawingCountsByOrder
} = require('../controllers/templateCtrl');

// Import unified template controller
const templateUnifiedCtrl = require('../controllers/templateUnifiedCtrl');

// ============================================================================
// UNIFIED API ROUTES (Main template operations)
// ============================================================================

// POST create template with material rows in single transaction
router.post('/unified', templateUnifiedCtrl.createTemplateWithMaterials);

// POST repush deleted SWI jobs for selected material rows
router.post('/unified/repush', templateUnifiedCtrl.repushTemplate);

// PUT update existing template SWI records (Edit mode)
router.put('/unified/:templateId', templateUnifiedCtrl.updateTemplate);

// ============================================================================
// TEMPLATE ROUTES
// ============================================================================

// GET template preview URLs only (lightweight - for edit mode)
router.get('/:id/preview-urls', templateUnifiedCtrl.getTemplatePreviewUrls);

// GET a specific template by ID (now using unified controller)
router.get('/:id', templateUnifiedCtrl.getTemplateById);

// DELETE a template
router.delete('/:id', deleteTemplate);

// POST to generate split preview data
router.post('/generate-split-previews', generateSplitPreviews);

//  MATERIAL ROW ROUTES (linked to a template)

// Add a new row
router.post('/:templateId/material-rows', materialRowController.createMaterialRow);

// Get all rows for a template
router.get('/:templateId/material-rows', materialRowController.getMaterialRows);

// Update a single row by ID
router.put('/material-rows/:rowId', materialRowController.updateRow);

// Delete a single row by ID
router.delete('/material-rows/:rowId', materialRowController.deleteRow);

// Bulk delete material rows (for rollback on SWI failure)
router.post('/material-rows/bulk-delete', materialRowController.bulkDeleteRows);

// Alias route for /rows to match frontend expectation
router.get('/:templateId/rows', materialRowController.getMaterialRows);

// ============================================================================
// UTILITY ROUTES (Code by Rahul)
// ============================================================================

// Print system generated drawings
router.get('/get-system-generated-drawing/:orderid', generateOrderDrawingsPDF);
router.get('/get-drawing-counts/:orderNumber', getDrawingCountsByOrder);

module.exports = router;
