/**
 * Unified Template Controller
 *
 * Provides a single endpoint to create complete templates with material rows in one atomic transaction.
 * Replaces the old multi-step workflow that required 9-19+ separate API calls.
 *
 * Features:
 * - Single API call creates template + material rows
 * - Optional S3 preview upload (enableS3: true)
 * - Optional SWI database push (enableSWI: true)
 * - Automatic rollback on any failure
 * - Duplicate template detection
 * - Comprehensive input validation
 *
 * Created: Day 1 - November 18, 2025
 * Updated: Day 5 - November 22, 2025 (Added S3 and SWI support)
 *
 * Purpose: Simplify template creation with atomic transactions and proper error handling
 */

const { logger } = require('../utils/logger');
const Template = require('../models/templateModel');
const MaterialRow = require('../models/materialRowModel');
const validationService = require('../services/validationService');
const transactionCoordinator = require('../services/transactionCoordinator');
const swiService = require('../services/swiService');
const { S3Client, GetObjectCommand } = require('@aws-sdk/client-s3');
const { getSignedUrl } = require('@aws-sdk/s3-request-presigner');

// S3 client for generating signed URLs
const s3Client = new S3Client({
  region: process.env.AWS_REGION,
  credentials: {
    accessKeyId: process.env.AWS_ACCESS_KEY_ID,
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
  },
});

/**
 * Generate signed S3 URL from S3 key
 * @param {String} key - S3 object key
 * @returns {Promise<String>} Signed URL or empty string
 */
async function getS3Url(key) {
  if (!key) return '';

  // Skip if it's base64 data (old format) - not an S3 key
  if (key.startsWith('data:image')) return '';

  // Skip if it's an old file path format
  if (key.startsWith('/uploads/') || key.startsWith('uploads/')) return '';

  // Only process keys that look like S3 keys (contain image extension)
  // Relaxed validation to handle various key formats
  if (!key.match(/\.(png|jpg|jpeg|webp)$/i)) return '';

  try {
    const command = new GetObjectCommand({
      Bucket: 'encore-sheet',
      Key: key
    });
    return await getSignedUrl(s3Client, command, { expiresIn: 3600 });
  } catch (error) {
    logger.error('[getS3Url] Error generating signed URL:', error);
    return '';
  }
}

/**
 * Create complete template with material rows (unified API)
 * Single endpoint that replaces 9-19+ separate API calls
 *
 * Request body:
 * {
 *   templateData: { name, lengths, angles, ... },
 *   materialRows: [{ material, color, quantity, length, tag, unitPrice, extPrice }, ...],
 *   enableS3: boolean (optional - upload preview to S3),
 *   enableSWI: boolean (optional - push to SWI database),
 *   swiData: { orderNumber, customerName, deliveryDate, enteredBy, customerPoNumber?, area?, suburb? } (required if enableSWI=true)
 * }
 *
 * POST /api/templates/unified
 */
exports.createTemplateWithMaterials = async (req, res) => {
  try {
    logger.info('[createTemplateWithMaterials] Starting unified template creation');

    const { templateData, materialRows, enableS3, enableSWI, swiData } = req.body;

    // Step 1: Validate request data
    logger.info('[createTemplateWithMaterials] Step 1: Validating request data');
    const validation = await validationService.validateTemplateCreationRequest({
      templateData,
      materialRows
    });

    if (!validation.valid) {
      logger.warn('[createTemplateWithMaterials] Validation failed:', validation.errors);
      return res.status(400).json({
        success: false,
        error: 'Validation failed',
        code: 'VALIDATION_FAILED',
        errors: validation.errors
      });
    }

    // Step 2: Check for duplicate templates (optional - can skip if bypassDuplicateCheck is true)
    if (!req.body.bypassDuplicateCheck && templateData.orderNumber) {
      logger.info('[createTemplateWithMaterials] Step 2: Checking for duplicates');
      const duplicateCheck = await validationService.checkDuplicateTemplate(
        templateData.orderNumber,
        templateData.lengths,
        templateData.angles
      );

      if (duplicateCheck.exists) {
        logger.warn('[createTemplateWithMaterials] Duplicate template found');
        return res.status(409).json({
          success: false,
          error: 'Duplicate template found',
          code: 'DUPLICATE_TEMPLATE',
          duplicates: duplicateCheck.duplicates
        });
      }
    }

    // Step 3: Create template and material rows in atomic transaction (with optional S3/SWI)
    logger.info('[createTemplateWithMaterials] Step 3: Creating template and material rows', {
      enableS3,
      enableSWI
    });

    const result = await transactionCoordinator.createTemplateWithMaterials(
      templateData,
      materialRows,
      {
        enableS3: enableS3 === true,
        enableSWI: enableSWI === true,
        swiData: enableSWI ? swiData : null
      }
    );

    logger.info('[createTemplateWithMaterials] SUCCESS! Template created:', {
      templateId: result.template._id,
      materialRowsCount: result.materialRows.length,
      s3Uploaded: result.s3Keys?.length > 0,
      swiJobsCreated: result.swiJobIds?.length || 0
    });

    // Generate signed S3 URLs for preview images
    const [previewUrl, previewFarUrl, previewNearUrl] = await Promise.all([
      result.template.preview ? getS3Url(result.template.preview) : Promise.resolve(null),
      result.template.previewFar ? getS3Url(result.template.previewFar) : Promise.resolve(null),
      result.template.previewNear ? getS3Url(result.template.previewNear) : Promise.resolve(null)
    ]);

    // Add signed URLs to template object
    const templateWithUrls = result.template.toObject ? result.template.toObject() : { ...result.template };
    templateWithUrls.previewUrl = previewUrl;
    templateWithUrls.previewFarUrl = previewFarUrl;
    templateWithUrls.previewNearUrl = previewNearUrl;

    // Return success response
    res.status(201).json({
      success: true,
      message: 'Template created successfully',
      data: {
        template: templateWithUrls,
        materialRows: result.materialRows,
        s3Keys: result.s3Keys || [],
        swiJobIds: result.swiJobIds || []
      }
    });

  } catch (error) {
    logger.error('[createTemplateWithMaterials] ERROR:', error);

    // Check if this is a transaction error (rollback already completed)
    if (error.rollbackCompleted) {
      return res.status(500).json({
        success: false,
        error: 'Template creation failed',
        code: 'TRANSACTION_FAILED',
        message: error.message,
        rollbackCompleted: true
      });
    }

    // Unexpected error
    return res.status(500).json({
      success: false,
      error: 'Internal server error',
      code: 'INTERNAL_ERROR',
      message: error.message
    });
  }
};

/**
 * Re-push deleted SWI jobs for selected material rows
 * Single endpoint with atomic transaction support
 *
 * Request body:
 * {
 *   templateId: "67123abc...",
 *   rowIndices: [0, 2, 4],          // Which material rows to repush (0-indexed)
 *   orderNumber: "IN240001",         // Optional
 *   customerName: "ACME Corp",       // Optional
 *   customerPoNumber: "PO12345",     // Optional
 *   deliveryDate: "25-11-2024",      // Optional - DD-MM-YYYY
 *   enteredBy: "userId"              // Optional
 * }
 *
 * POST /api/templates/unified/repush
 */
exports.repushTemplate = async (req, res) => {
  try {
    logger.info('[repushTemplate] Starting unified REPUSH');

    const { templateId, rowIndices, orderNumber, customerName, customerPoNumber, deliveryDate, enteredBy } = req.body;

    // Step 1: Validate required parameters
    logger.info('[repushTemplate] Step 1: Validating parameters');
    if (!templateId) {
      logger.warn('[repushTemplate] Validation failed: missing templateId');
      return res.status(400).json({
        success: false,
        error: 'Validation failed',
        code: 'VALIDATION_FAILED',
        message: 'Template ID is required'
      });
    }

    if (!rowIndices || !Array.isArray(rowIndices) || rowIndices.length === 0) {
      logger.warn('[repushTemplate] Validation failed: invalid rowIndices');
      return res.status(400).json({
        success: false,
        error: 'Validation failed',
        code: 'VALIDATION_FAILED',
        message: 'Row indices array is required and must not be empty'
      });
    }

    // Step 2: Prepare SWI data
    const swiData = {
      orderNumber,
      customerName,
      customerPoNumber,
      deliveryDate,
      enteredBy: enteredBy || req.user?.id || req.user?._id
    };

    // Step 3: Call transaction coordinator (with automatic rollback)
    logger.info('[repushTemplate] Step 2: Calling transaction coordinator');
    const result = await transactionCoordinator.repushTemplateToSWI(templateId, rowIndices, swiData);

    logger.info('[repushTemplate] SUCCESS! REPUSH completed:', {
      templateId: result.template._id,
      newJobIds: result.newJobIds
    });

    // Generate signed S3 URLs for preview images
    const [previewUrl, previewFarUrl, previewNearUrl] = await Promise.all([
      result.template.preview ? getS3Url(result.template.preview) : Promise.resolve(null),
      result.template.previewFar ? getS3Url(result.template.previewFar) : Promise.resolve(null),
      result.template.previewNear ? getS3Url(result.template.previewNear) : Promise.resolve(null)
    ]);

    // Add signed URLs to template object
    const templateWithUrls = result.template.toObject ? result.template.toObject() : { ...result.template };
    templateWithUrls.previewUrl = previewUrl;
    templateWithUrls.previewFarUrl = previewFarUrl;
    templateWithUrls.previewNearUrl = previewNearUrl;

    // Return success response
    res.status(200).json({
      success: true,
      message: `Successfully re-pushed ${rowIndices.length} material row(s) to SWI`,
      data: {
        template: templateWithUrls,
        newJobIds: result.newJobIds
      }
    });

  } catch (error) {
    logger.error('[repushTemplate] ERROR:', error);

    // Check if this is a transaction error (rollback already completed)
    if (error.rollbackCompleted) {
      return res.status(500).json({
        success: false,
        error: 'REPUSH failed',
        code: 'TRANSACTION_FAILED',
        message: error.message,
        rollbackCompleted: true
      });
    }

    // Unexpected error
    return res.status(500).json({
      success: false,
      error: 'Internal server error',
      code: 'INTERNAL_ERROR',
      message: error.message
    });
  }
};

/**
 * Update existing template and SWI records (unified API)
 * Used for EDIT mode - updates template fields in MongoDB and SWI records
 *
 * Request body:
 * {
 *   templateData: { flipH?, flipV?, reverseColor?, firstSegmentAngle?, labelOffsets?, preview?, previewFar?, previewNear? } (optional - template fields to update),
 *   swiData: { orderNumber, customerName, deliveryDate, enteredBy, customerPoNumber?, customerId? }
 * }
 *
 * PUT /api/templates/unified/:templateId
 */
exports.updateTemplate = async (req, res) => {
  // Store original template state for rollback
  let originalTemplateState = null;
  let templateModified = false;

  /**
   * Rollback helper - restores template to original state
   */
  const rollbackTemplateChanges = async (template, originalState) => {
    if (!template || !originalState) {
      logger.warn('[updateTemplate] Rollback skipped - no original state to restore');
      return;
    }

    try {
      logger.info('[updateTemplate] Rolling back template changes...');

      // Restore all fields from original state
      Object.keys(originalState).forEach(key => {
        if (key !== '_id' && key !== '__v') {
          template[key] = originalState[key];
        }
      });

      await template.save();
      logger.info('[updateTemplate] Rollback completed - template restored to original state');
    } catch (rollbackError) {
      logger.error('[updateTemplate] CRITICAL: Rollback failed:', rollbackError.message);
    }
  };

  try {
    const { templateId } = req.params;
    const { templateData, swiData } = req.body;

    logger.info('[updateTemplate] Starting unified template UPDATE for:', templateId);

    // Step 1: Validate input
    if (!templateId) {
      return res.status(400).json({
        success: false,
        error: 'Template ID is required',
        code: 'MISSING_TEMPLATE_ID'
      });
    }

    // Step 2: Fetch template from MongoDB
    let template = await Template.findById(templateId);
    if (!template) {
      return res.status(404).json({
        success: false,
        error: 'Template not found',
        code: 'TEMPLATE_NOT_FOUND'
      });
    }

    // Step 2a: Store original template state for rollback (before any modifications)
    originalTemplateState = template.toObject();
    logger.info('[updateTemplate] Stored original template state for rollback');

    // Step 2b: Update template fields if templateData is provided
    if (templateData) {
      logger.info('[updateTemplate] Updating template fields:', {
        flipH: templateData.flipH,
        flipV: templateData.flipV,
        reverseColor: templateData.reverseColor,
        firstSegmentAngle: templateData.firstSegmentAngle,
        hasPreview: !!templateData.preview,
        hasPreviewFar: !!templateData.previewFar,
        hasPreviewNear: !!templateData.previewNear,
        hasSplitLabelOffsets: !!templateData.splitLabelOffsets,
        splitLabelOffsetsKeys: templateData.splitLabelOffsets ? Object.keys(templateData.splitLabelOffsets) : []
      });

      // Update only the fields that are provided
      if (templateData.flipH !== undefined) template.flipH = templateData.flipH;
      if (templateData.flipV !== undefined) template.flipV = templateData.flipV;
      if (templateData.reverseColor !== undefined) template.reverseColor = templateData.reverseColor;
      if (templateData.firstSegmentAngle !== undefined) template.firstSegmentAngle = templateData.firstSegmentAngle;
      // CRITICAL: Save segmentAbsoluteAngles for correct split drawing orientation after edit
      if (templateData.segmentAbsoluteAngles !== undefined) template.segmentAbsoluteAngles = templateData.segmentAbsoluteAngles;
      if (templateData.labelOffsets !== undefined) template.labelOffsets = templateData.labelOffsets;
      if (templateData.splitLabelOffsets !== undefined) template.splitLabelOffsets = templateData.splitLabelOffsets;

      // Update geometry fields if provided (for modifying lengths/angles during edit)
      if (templateData.lengths !== undefined) template.lengths = templateData.lengths;
      if (templateData.angles !== undefined) template.angles = templateData.angles;
      if (templateData.farLengths !== undefined) template.farLengths = templateData.farLengths;
      if (templateData.farAngles !== undefined) template.farAngles = templateData.farAngles;
      if (templateData.nearLengths !== undefined) template.nearLengths = templateData.nearLengths;
      if (templateData.nearAngles !== undefined) template.nearAngles = templateData.nearAngles;
      if (templateData.direction !== undefined) template.direction = templateData.direction;
      if (templateData.isTaper !== undefined) template.isTaper = templateData.isTaper;
      if (templateData.girth !== undefined) template.girth = templateData.girth;

      // Update fold fields if provided (for adding/modifying folds during edit)
      logger.info('[updateTemplate] Fold data received:', {
        startFoldType: templateData.startFoldType,
        startFoldDirection: templateData.startFoldDirection,
        startFoldLength: templateData.startFoldLength,
        endFoldType: templateData.endFoldType,
        endFoldDirection: templateData.endFoldDirection,
        endFoldLength: templateData.endFoldLength
      });
      if (templateData.startFoldType !== undefined) template.startFoldType = templateData.startFoldType;
      if (templateData.startFoldDirection !== undefined) template.startFoldDirection = templateData.startFoldDirection;
      if (templateData.startFoldLength !== undefined) template.startFoldLength = templateData.startFoldLength;
      if (templateData.startFoldGap !== undefined) template.startFoldGap = templateData.startFoldGap;
      if (templateData.endFoldType !== undefined) template.endFoldType = templateData.endFoldType;
      if (templateData.endFoldDirection !== undefined) template.endFoldDirection = templateData.endFoldDirection;
      if (templateData.endFoldLength !== undefined) template.endFoldLength = templateData.endFoldLength;
      if (templateData.endFoldGap !== undefined) template.endFoldGap = templateData.endFoldGap;
      if (templateData.girthStartFoldType !== undefined) template.girthStartFoldType = templateData.girthStartFoldType;
      if (templateData.girthEndFoldType !== undefined) template.girthEndFoldType = templateData.girthEndFoldType;
      logger.info('[updateTemplate] Template fold fields after update:', {
        startFoldType: template.startFoldType,
        startFoldDirection: template.startFoldDirection,
        startFoldLength: template.startFoldLength,
        endFoldType: template.endFoldType,
        endFoldDirection: template.endFoldDirection,
        endFoldLength: template.endFoldLength
      });

      // Save the updated template
      await template.save();
      templateModified = true;
      logger.info('[updateTemplate] Template fields updated in MongoDB');
    }

    // Step 3: Fetch material rows for this template
    const materialRows = await MaterialRow.find({ templateId });
    if (!materialRows || materialRows.length === 0) {
      return res.status(404).json({
        success: false,
        error: 'No material rows found for this template',
        code: 'NO_MATERIAL_ROWS'
      });
    }

    // Step 4: Check if template has SWI jobs to update
    // EDGE CASE FIX: If all rows were deleted and new rows added, swiJobIds will be empty
    // In this case, use CREATE flow (pushToSWI) instead of UPDATE flow
    if (!template.swiJobIds || template.swiJobIds.length === 0) {
      logger.info('[updateTemplate] No existing SWI jobs - using CREATE flow (pushToSWI) for new rows');

      let swiResults;
      try {
        swiResults = await swiService.pushToSWI(
          template,
          materialRows,
          {
            orderNumber: swiData?.orderNumber || template.orderNumber,
            customerName: swiData?.customerName || template.customerName,
            customerId: swiData?.customerId || template.customerId,
            deliveryDate: swiData?.deliveryDate,
            enteredBy: swiData?.enteredBy,
            customerPoNumber: swiData?.customerPoNumber || ''
          }
        );
      } catch (swiError) {
        logger.error('[updateTemplate] SWI pushToSWI failed:', swiError.message);

        // Rollback template changes if SWI push fails
        if (templateModified) {
          await rollbackTemplateChanges(template, originalTemplateState);
        }

        return res.status(500).json({
          success: false,
          error: 'Failed to push to SWI',
          code: 'SWI_PUSH_FAILED',
          message: swiError.message,
          rollbackCompleted: templateModified
        });
      }

      // Extract jobIds and update template
      const createdSWIJobIds = swiResults.map(r => r.jobId);
      template.swiJobIds = createdSWIJobIds;
      await template.save();

      // Sync ShapeIDs and swiJobIds back to material rows
      const validResults = swiResults.filter(r => r.materialRowId && r.shapeId);
      if (validResults.length > 0) {
        const bulkOps = validResults.map(result => ({
          updateOne: {
            filter: { _id: result.materialRowId },
            update: {
              $set: {
                tag: result.shapeId,
                swiJobId: result.jobId
              }
            }
          }
        }));

        try {
          await MaterialRow.bulkWrite(bulkOps, { ordered: false });
          logger.info(`[updateTemplate] Synced ${validResults.length} material rows with new ShapeIDs`);
        } catch (bulkError) {
          logger.warn('[updateTemplate] Bulk sync failed:', bulkError.message);
        }
      }

      // Fetch updated material rows and return success
      const updatedMaterialRows = await MaterialRow.find({ templateId });

      const [previewUrl, previewFarUrl, previewNearUrl] = await Promise.all([
        template.preview ? getS3Url(template.preview) : Promise.resolve(null),
        template.previewFar ? getS3Url(template.previewFar) : Promise.resolve(null),
        template.previewNear ? getS3Url(template.previewNear) : Promise.resolve(null)
      ]);

      const templateWithUrls = template.toObject ? template.toObject() : { ...template };
      templateWithUrls.previewUrl = previewUrl;
      templateWithUrls.previewFarUrl = previewFarUrl;
      templateWithUrls.previewNearUrl = previewNearUrl;

      return res.json({
        success: true,
        message: 'Template SWI records created successfully (converted from UPDATE to CREATE)',
        data: {
          template: templateWithUrls,
          materialRows: updatedMaterialRows,
          swiJobIds: createdSWIJobIds
        }
      });
    }

    // Step 5: Update SWI records using swiService.updateSWI
    logger.info('[updateTemplate] Calling swiService.updateSWI');

    const preservedData = {
      jobIds: template.swiJobIds,
      shapeIds: [], // Will be fetched from SWI database by updateSWI
      ids: [],      // Will be fetched from SWI database by updateSWI
      enteredDate: null, // Will be preserved from SWI database
      enteredBy: null    // Will be preserved from SWI database
    };

    let swiResult;
    try {
      swiResult = await swiService.updateSWI(
        template,
        materialRows,
        {
          orderNumber: swiData?.orderNumber || template.orderNumber,
          customerName: swiData?.customerName || template.customerName,
          customerId: swiData?.customerId || template.customerId,
          deliveryDate: swiData?.deliveryDate,
          enteredBy: swiData?.enteredBy,
          customerPoNumber: swiData?.customerPoNumber || ''
        },
        preservedData
      );
    } catch (swiError) {
      logger.error('[updateTemplate] SWI updateSWI threw error:', swiError.message);

      // Rollback template changes if SWI update fails
      if (templateModified) {
        await rollbackTemplateChanges(template, originalTemplateState);
      }

      return res.status(500).json({
        success: false,
        error: 'Failed to update SWI records',
        code: 'SWI_UPDATE_FAILED',
        message: swiError.message,
        rollbackCompleted: templateModified
      });
    }

    if (!swiResult.success) {
      logger.error('[updateTemplate] SWI updateSWI returned failure:', swiResult.error);

      // Rollback template changes if SWI update fails
      if (templateModified) {
        await rollbackTemplateChanges(template, originalTemplateState);
      }

      return res.status(500).json({
        success: false,
        error: 'Failed to update SWI records',
        code: 'SWI_UPDATE_FAILED',
        message: swiResult.error,
        rollbackCompleted: templateModified
      });
    }

    logger.info('[updateTemplate] SWI update successful:', swiResult.jobIds?.length, 'jobs updated');

    // Step 6: Sync ShapeIDs and swiJobIds back to material rows
    // - For NON-SPLIT: Sync both tag and swiJobId (swiJobId needed for HYBRID matching on next edit)
    // - For SPLIT: Sync tag AND first split job's swiJobId (needed for split→non-split conversion)
    //   IMPORTANT: When reducing split count (e.g., 6→4), some jobs get deleted. We must sync
    //   one of the REMAINING job IDs to MaterialRow, not a deleted one.
    if (swiResult.results && swiResult.results.length > 0) {
      // Track which materialRowIds have been synced with swiJobId (for splits, only first piece)
      const materialRowsSwiJobIdSynced = new Set();

      for (const result of swiResult.results) {
        if (result.materialRowId && result.shapeId) {
          try {
            const updateData = { tag: result.shapeId };

            // Sync swiJobId for:
            // 1. Non-split drawings (required for HYBRID matching)
            // 2. FIRST split piece (required for split→non-split conversion)
            if (result.jobId) {
              if (!result.isSplit) {
                // Non-split: always sync swiJobId
                updateData.swiJobId = result.jobId.toString();
              } else if (!materialRowsSwiJobIdSynced.has(result.materialRowId)) {
                // Split: sync swiJobId only for FIRST piece
                // This ensures MaterialRow has a valid swiJobId from the REMAINING jobs
                updateData.swiJobId = result.jobId.toString();
                materialRowsSwiJobIdSynced.add(result.materialRowId);
                logger.info(`[updateTemplate] Syncing FIRST split swiJobId ${result.jobId} to MaterialRow ${result.materialRowId}`);
              }
            }

            await MaterialRow.findByIdAndUpdate(
              result.materialRowId,
              updateData,
              { new: true }
            );
          } catch (updateError) {
            logger.warn(`[updateTemplate] Failed to update row ${result.materialRowId}:`, updateError.message);
          }
        }
      }
    }

    // Fetch updated material rows (now with synced tags)
    const updatedMaterialRows = await MaterialRow.find({ templateId });

    // Generate signed S3 URLs for preview images
    const [previewUrl, previewFarUrl, previewNearUrl] = await Promise.all([
      template.preview ? getS3Url(template.preview) : Promise.resolve(null),
      template.previewFar ? getS3Url(template.previewFar) : Promise.resolve(null),
      template.previewNear ? getS3Url(template.previewNear) : Promise.resolve(null)
    ]);

    // Add signed URLs to template object
    const templateWithUrls = template.toObject ? template.toObject() : { ...template };
    templateWithUrls.previewUrl = previewUrl;
    templateWithUrls.previewFarUrl = previewFarUrl;
    templateWithUrls.previewNearUrl = previewNearUrl;

    return res.json({
      success: true,
      message: 'Template SWI records updated successfully',
      data: {
        template: templateWithUrls,
        materialRows: updatedMaterialRows,
        swiJobIds: swiResult.jobIds || template.swiJobIds
      }
    });

  } catch (error) {
    logger.error('[updateTemplate] Error:', error);

    // Rollback template changes on any unexpected error
    if (templateModified && originalTemplateState) {
      await rollbackTemplateChanges(
        await Template.findById(req.params.templateId),
        originalTemplateState
      );
    }

    return res.status(500).json({
      success: false,
      error: 'Internal server error',
      code: 'INTERNAL_ERROR',
      message: error.message,
      rollbackCompleted: templateModified
    });
  }
};

/**
 * Get template by ID
 * Returns template with signed S3 URLs for preview images
 */
exports.getTemplateById = async (req, res) => {
  try {
    const templateId = req.params.id;

    if (!templateId) {
      return res.status(400).json({
        success: false,
        message: 'Template ID is required'
      });
    }

    // Fetch from MongoDB
    const template = await Template.findById(templateId);
    if (!template) {
      return res.status(404).json({
        success: false,
        message: 'Template not found'
      });
    }

    // Generate all preview URLs concurrently
    const [previewUrl, previewFarUrl, previewNearUrl] = await Promise.all([
      template.preview ? getS3Url(template.preview) : Promise.resolve(null),
      template.previewFar ? getS3Url(template.previewFar) : Promise.resolve(null),
      template.previewNear ? getS3Url(template.previewNear) : Promise.resolve(null)
    ]);

    // Convert template to a plain object to modify it
    const templateObject = template.toObject();

    // Attach URLs to the template object
    templateObject.previewUrl = previewUrl || null;
    templateObject.previewFarUrl = previewFarUrl || null;
    templateObject.previewNearUrl = previewNearUrl || null;

    res.json({ data: templateObject });
  } catch (err) {
    logger.error('[getTemplateById] Error:', err);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch template'
    });
  }
};

/**
 * Get template preview URLs only (lightweight endpoint)
 * Returns only: previewUrl, previewFarUrl, previewNearUrl, segmentAbsoluteAngles
 * Used by SelectMaterialsSimplified for edit mode
 */
exports.getTemplatePreviewUrls = async (req, res) => {
  try {
    const templateId = req.params.id;

    if (!templateId) {
      return res.status(400).json({
        success: false,
        message: 'Template ID is required'
      });
    }

    // Fetch only needed fields from MongoDB using projection
    const template = await Template.findById(templateId)
      .select('preview previewFar previewNear segmentAbsoluteAngles')
      .lean();

    if (!template) {
      return res.status(404).json({
        success: false,
        message: 'Template not found'
      });
    }

    // Generate S3 URLs in parallel
    const [previewUrl, previewFarUrl, previewNearUrl] = await Promise.all([
      template.preview ? getS3Url(template.preview) : Promise.resolve(null),
      template.previewFar ? getS3Url(template.previewFar) : Promise.resolve(null),
      template.previewNear ? getS3Url(template.previewNear) : Promise.resolve(null)
    ]);

    res.json({
      data: {
        previewUrl: previewUrl || null,
        previewFarUrl: previewFarUrl || null,
        previewNearUrl: previewNearUrl || null,
        segmentAbsoluteAngles: template.segmentAbsoluteAngles || []
      }
    });
  } catch (err) {
    logger.error('[getTemplatePreviewUrls] Error:', err);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch template preview URLs'
    });
  }
};
