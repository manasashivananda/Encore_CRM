// controllers/templateController.js
const { logger } = require('../utils/logger');
const Template = require('../models/templateModel');
const MaterialRow = require('../models/materialRowModel');
const OrderMaster = require('../models/ordermasterModel');

//Code change by Rahul
const OrderItem = require('../models/orderitemModel');
// Quotation check
const QuotationItem = require("../models/quotationitemModel");
const QuotationMaster = require("../models/quotationmasterModel");
//Code end by Rahul

// Template caching utility
const { invalidateCache } = require('../utils/templateCache');
const { S3Client, PutObjectCommand, GetObjectCommand, DeleteObjectCommand } = require('@aws-sdk/client-s3');
const { getSignedUrl } = require('@aws-sdk/s3-request-presigner');
const {RecalculateOrderItemsCountFn, RecalculateOverallOrderTotalFn, RecalculateOverallQuotesTotalFn} = require('./ordermanagementCtrl');

const s3Client = new S3Client({
  region: process.env.AWS_REGION,
  credentials: {
    accessKeyId: process.env.AWS_ACCESS_KEY_ID,
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
  },
});

// Process image data to ensure it's in base64 data URI format
const processImageData = async (imageData) => {
  try {
    if (!imageData) return null;

    // If it's a file path (legacy data), return null to trigger re-generation
    if (imageData.startsWith('/uploads/') || imageData.startsWith('uploads/')) {
      return null;
    }

    // Process base64 data
    let base64Data = imageData;
    if (imageData.startsWith('data:image')) {
      // Remove the data URI prefix
      base64Data = imageData.split(';base64,')[1];
    }

    // Validate base64
    if (!base64Data.match(/^[A-Za-z0-9+/]+=*$/)) {
      logger.error('Invalid base64 data');
      return null;
    }

    // Convert base64 to buffer
    const buffer = Buffer.from(base64Data, 'base64');

    const sharp = require('sharp');
      const optimizedBuffer = await sharp(buffer)
    .resize({ width: 2400, height: 2400, fit: "inside", withoutEnlargement: true })
    .toColorspace("srgb")
    .webp({
      quality: 100,           // near-lossless
      lossless: false,        // smaller file size than true lossless
      nearLossless: true,     // preserves line details
      smartSubsample: true,   // better color handling for sharp edges
      effort: 6
    })
    .toBuffer();

    // Generate unique filename
    const filename = `${Date.now()}-drawings.png`;
    
    // Upload to S3
    const uploadCommand = new PutObjectCommand({
      Bucket: 'encore-sheet',
      Key: filename,
      Body: optimizedBuffer,
      ContentType: 'image/png'
    });

    await s3Client.send(uploadCommand);
    logger.info(`Uploaded image to S3: ${filename}`);

    // Return the S3 key to store in DB
    return filename;

  } catch (err) {
    logger.error('Failed to process and upload image:', err.message);
    return null;
  }
};

//  Create Template
exports.createTemplate = async (req, res) => {
  try {
    const {
      name,
      partGroup,
      partClass,
      lengths = [],
      angles = [],
      nearLengths,
      nearAngles,
      direction,
      reverseColor,
      preview,
      previewFar,
      previewNear,
      isTaper,
      library, // Remove default value
      orderNumber,
      customerName,
      customerId,
      createdBy,
      startFoldType,
      startFoldDirection,
      startFoldLength,
      startFoldGap,
      endFoldType,
      endFoldDirection,
      endFoldLength,
      endFoldGap,
      firstSegmentAngle,  // Add firstSegmentAngle
      flipH,  // Horizontal flip state
      flipV,  // Vertical flip state
      isDraft,  // Accept isDraft flag from frontend
      labelOffsets,  // Label position offsets for preserving manual adjustments
      material,  // Add material
      color,  // Add color
    } = req.body;

    // Input validation and sanitization
    if (name && name.length > 100) {
      return res.status(400).json({ message: 'Template name must be 100 characters or less' });
    }

    // Validate arrays
    if (!Array.isArray(lengths) || !Array.isArray(angles)) {
      return res.status(400).json({ message: 'Lengths and angles must be arrays' });
    }

    // Validate array lengths match
    if (angles.length !== lengths.length - 1 && lengths.length > 0) {
      return res.status(400).json({ message: 'Invalid angles array length for given lengths' });
    }

    // Use userId from request body, user object, or default
    const userId = createdBy || req.user?.user_ref_id || 'default-user';
  
    // Customer library validation
    if (library === 'customer' && !customerId) {
      return res.status(400).json({ message: 'Customer must be selected to save to Customer Library.' });
    }


    const template = new Template({
      name,
      partGroup,
      partClass,
      lengths,
      angles,
      // if no explicit near arrays, default to the far ones
      nearLengths: Array.isArray(nearLengths) ? nearLengths : lengths,
      nearAngles:  Array.isArray(nearAngles)  ? nearAngles  : angles,
      direction,
      reverseColor,
      isTaper,
      // Only set library field if it's explicitly provided and not undefined
      ...(library !== undefined && library !== null && library !== '' && { library }),
      orderNumber,
      customerName,
      customerId: customerId || undefined,  // Always set customerId if provided, not just for customer library
      createdBy: createdBy || req.user?.user_ref_id,
      lastModifiedBy: createdBy || req.user?.user_ref_id,  // Set initial lastModifiedBy same as createdBy
      startFoldType,
      startFoldDirection,
      startFoldLength,
      startFoldGap,
      endFoldType,
      endFoldDirection,
      endFoldLength,
      endFoldGap,
      girthStartFoldType: req.body.girthStartFoldType,
      girthEndFoldType: req.body.girthEndFoldType,
      firstSegmentAngle,  // Save firstSegmentAngle
      flipH: flipH || false,  // Save horizontal flip state
      flipV: flipV || false,  // Save vertical flip state
      labelOffsets,  // Save label position offsets
      // Set isDraft flag - true only if explicitly set AND no library field
      // If library is set, it's being saved to library, so not a draft
      isDraft: (isDraft === true && !library),
      // Add material and color if provided
      material: material || null,
      color: color || null,
    });

    // Save ORIGINAL uncompressed images first (FAST - user sees images immediately!)
    // Then compress in background to save database space
    let originalPreviews = {};

    if (preview) {
      const processed = await processImageData(preview);
      template.preview = processed;  // Save uncompressed (FAST - ~0.5s)
      originalPreviews.preview = processed;  // Queue for compression
    }
    if (previewFar) {
      const processed = await processImageData(previewFar);
      template.previewFar = processed;
      originalPreviews.previewFar = processed;
    }
    if (previewNear) {
      const processed = await processImageData(previewNear);
      template.previewNear = processed;
      originalPreviews.previewNear = processed;
    }

    // Check if an identical template already exists for this order
    // UNLESS bypassDuplicateCheck flag is set (for copy/flip operations)
    const bypassDuplicateCheck = req.body.bypassDuplicateCheck === true;
    const existingTemplates = await Template.find({ orderNumber });

    // Only check for duplicates if bypassDuplicateCheck is false
    const isDuplicate = !bypassDuplicateCheck && existingTemplates.some(existing => {
      const lengthsMatch = JSON.stringify(existing.lengths) === JSON.stringify(lengths);
      const anglesMatch = JSON.stringify(existing.angles) === JSON.stringify(angles);
      const nearLengthsMatch = JSON.stringify(existing.nearLengths || []) === JSON.stringify(nearLengths || []);
      const nearAnglesMatch = JSON.stringify(existing.nearAngles || []) === JSON.stringify(nearAngles || []);
      const taperMatch = existing.isTaper === isTaper;

      return lengthsMatch && anglesMatch && nearLengthsMatch && nearAnglesMatch && taperMatch;
    });

    if (isDuplicate) {
      // Return the existing template instead of creating a duplicate
      const existingTemplate = existingTemplates.find(existing => {
        const lengthsMatch = JSON.stringify(existing.lengths) === JSON.stringify(lengths);
        const anglesMatch = JSON.stringify(existing.angles) === JSON.stringify(angles);
        return lengthsMatch && anglesMatch;
      });

      return res.status(200).json({
        message: 'Template already exists, returning existing',
        data: existingTemplate,
        isDuplicate: true
      });
    }

    // Save template WITH uncompressed images (fast enough ~0.5s, user gets images!)
    const saved = await template.save();

    res.status(201).json({ message: 'Template created', data: saved });
  } catch (error) {
 
    logger.error('Error creating template:', error);
    res.status(500).json({ error: 'Failed to create template' });
  }
};

//  Update Template
exports.updateTemplate = async (req, res) => {
  try {
    const {
      name,
      partGroup,
      partClass,
      lengths = [],
      angles = [],
      nearLengths,
      nearAngles,
      farLengths,
      farAngles,
      isTaper,
      direction,
      reverseColor,
      preview,
      previewFar,
      previewNear,
      startFoldType,
      startFoldDirection,
      startFoldLength,
      startFoldGap,
      endFoldType,
      endFoldDirection,
      endFoldLength,
      endFoldGap,
      firstSegmentAngle,  // Add firstSegmentAngle
      flipH,  // Horizontal flip state
      flipV,  // Vertical flip state
      material,
      color,
      thickness,
      qty,
      length,
      splitInto,
      splitLength,
      girth,
      tag,
      unitPrice,
      isDraft,  // Accept isDraft flag to update draft status
      library,   // Accept library field to convert draft to saved
      labelOffsets,  // Label position offsets for preserving manual adjustments
      splitLabelOffsets,  // Split drawing label offsets for draggable labels
      customerId,  // Customer ID for customer library templates
      customerName,  // Customer name for customer library templates
      orderNumber  // Order number for templates
    } = req.body;

    const template = await Template.findById(req.params.id);
    if (!template) {
      return res.status(404).json({ message: 'Template not found' });
    }

    // overwrite fields
    template.name      = name;
    if (partGroup !== undefined) template.partGroup = partGroup;
    if (partClass !== undefined) template.partClass = partClass;
    template.lengths   = lengths;
    template.angles    = angles;
    
    // Handle taper mode fields
    if (isTaper !== undefined) template.isTaper = isTaper;
    if (farLengths !== undefined) template.farLengths = farLengths;
    if (farAngles !== undefined) template.farAngles = farAngles;
    
    template.nearLengths = Array.isArray(nearLengths) ? nearLengths : lengths;
    template.nearAngles  = Array.isArray(nearAngles)  ? nearAngles  : angles;
    template.direction = direction;
    template.reverseColor = reverseColor;
    template.startFoldType = startFoldType;
    template.startFoldDirection = startFoldDirection;
    template.startFoldLength = startFoldLength;
    template.startFoldGap = startFoldGap;
    template.endFoldType = endFoldType;
    template.endFoldDirection = endFoldDirection;
    template.endFoldLength = endFoldLength;
    template.endFoldGap = endFoldGap;
    if (firstSegmentAngle !== undefined) template.firstSegmentAngle = firstSegmentAngle;
    if (flipH !== undefined) template.flipH = flipH;
    if (flipV !== undefined) template.flipV = flipV;

    // Update label offsets if provided (for preserving manual position adjustments)
    if (labelOffsets !== undefined) template.labelOffsets = labelOffsets;
    if (splitLabelOffsets !== undefined) template.splitLabelOffsets = splitLabelOffsets;

    // Update material fields if provided
    if (material !== undefined) template.material = material;
    if (color !== undefined) template.color = color;
    if (thickness !== undefined) template.thickness = thickness;
    if (qty !== undefined) template.qty = qty;
    if (length !== undefined) template.length = length;
    if (splitInto !== undefined) template.splitInto = splitInto;
    if (splitLength !== undefined) template.splitLength = splitLength;
    if (girth !== undefined) template.girth = girth;
    if (tag !== undefined) template.tag = tag;
    if (unitPrice !== undefined) template.unitPrice = unitPrice;
    
    // Handle isDraft flag - when saving to library, set isDraft to false
    if (isDraft !== undefined) {
      template.isDraft = isDraft;
    }

    // Handle library field - when set, automatically mark as not draft
    if (library !== undefined && library !== null && library !== '') {
      template.library = library;
      template.isDraft = false;
    }

    // Update customerId, customerName, and orderNumber if provided
    if (customerId !== undefined) template.customerId = customerId;
    if (customerName !== undefined) template.customerName = customerName;
    if (orderNumber !== undefined) template.orderNumber = orderNumber;

    // Set lastModifiedBy to current user
    const modifiedBy = req.body.modifiedBy || req.user?.user_ref_id || 'unknown';
    template.lastModifiedBy = modifiedBy;

    // Save ORIGINAL uncompressed images first (FAST - user sees images immediately!)
    // Then compress in background to save database space
    let originalPreviews = {};

    if (preview) {
      const processed = await processImageData(preview);
      if(processed !== null){
        template.preview = processed;  // Save uncompressed (FAST - ~0.5s)
        originalPreviews.preview = processed; 
      } // Queue for compression
    }
    if (previewFar) {
      const processed = await processImageData(previewFar);
      if(processed !== null){
        template.previewFar = processed;
        originalPreviews.previewFar = processed;
      }
    }
    if (previewNear) {
      const processed = await processImageData(previewNear);
      if(processed !== null){
        template.previewNear = processed;
        originalPreviews.previewNear = processed;
      }
    }

    // Save template WITH uncompressed images (fast enough ~0.5s, user gets images!)
    await template.save();

    // Fetch the saved template to ensure we have the latest data
    const savedTemplate = await Template.findById(template._id);

    res.json({ message: 'Template updated', data: savedTemplate });
  } catch (err) {
    logger.error('Error updating template:', err);
    res.status(500).json({ error: 'Failed to update template' });
  }
};

//  Get All Templates
exports.getAllTemplates = async (req, res) => {
  try {
    const { partGroup, partClass, library, customerId, includeDrafts } = req.query;
    // No authentication required for viewing templates
    const userId = req.user?.user_ref_id || null;
    
    let filter = {};
    
    // CRITICAL: Filter out draft templates by default
    // Only include drafts if explicitly requested (for editing existing drafts)
    if (!includeDrafts || includeDrafts !== 'true') {
      filter.isDraft = { $ne: true };  // Exclude templates where isDraft is true
    }
    
    // Part group and class filtering
    if (partGroup) filter.partGroup = partGroup;
    if (partClass) filter.partClass = partClass;
    
    // Library-based filtering (no authentication required for viewing)
    if (library === 'my') {
      // My Library: show ONLY templates explicitly marked as 'my'
      filter.library = 'my';
    } else if (library === 'customer') {
      // Customer Library: show templates for specific customer
      if (customerId) {
        // Only show templates explicitly marked as 'customer' library
        filter.library = 'customer';
        filter.customerId = customerId;
      } else {
        return res.status(400).json({ message: 'Customer ID required for customer library' });
      }
    } else if (partClass && !library) {
      // For part class browsing (Aprons, Gutters, etc.) when no library is specified,
      filter.library = { $exists: false };
    }
    const templates = await Template.find(filter).sort({ createdAt: -1 });
    res.json({ data: templates });
  } catch (err) {
    logger.error('Error fetching templates:', err);
    res.status(500).json({ error: 'Failed to fetch templates' });
  }
};

//  Get Template by ID
exports.getTemplateById = async (req, res) => {
  try {
    const templateId = req.params.id;
    const template = await Template.findById(templateId);
    if (!template) return res.status(404).json({ message: 'Template not found' });

    // Convert template to a plain object to modify it
    const templateObject = template.toObject();

    // Attach URLs to the template object
    templateObject.previewUrl = "";
    templateObject.previewFarUrl = "";
    templateObject.previewNearUrl = "";

    res.json({ data: templateObject });
  } catch (err) {
    logger.error('Error fetching template:', err);
    res.status(404).json({ error: 'Template not found' });
  }
};

//  Delete All Templates for Order
exports.deleteAllTemplatesForOrder = async (req, res) => {
  try {
    const { orderNumber } = req.params;

    // Find all templates for this order
    const templates = await Template.find({ orderNumber });
    
    if (templates.length === 0) {
      return res.status(404).json({ message: 'No templates found for this order' });
    }
    
    const deletionResults = {
      templatesDeleted: 0,
      materialRowsDeleted: 0,
      swiJobsDeleted: 0,
      deletedTemplateIds: []
    };
    
    // Move requires outside loop for efficiency
    const MaterialRow = require('../models/materialRowModel');
    const sql = require('mssql');
    const config = require('../config/sqlConfig');

    // Collect all template IDs and SWI job IDs for batch operations
    const templateIds = templates.map(t => t._id);
    const allSwiJobIds = [];
    templates.forEach(template => {
      if (template.swiJobIds && template.swiJobIds.length > 0) {
        allSwiJobIds.push(...template.swiJobIds);
      }
    });

    // Batch delete all material rows in one query
    const materialResult = await MaterialRow.deleteMany({ templateId: { $in: templateIds } });
    deletionResults.materialRowsDeleted = materialResult.deletedCount;

    // Batch delete all SWI jobs with single connection
    if (allSwiJobIds.length > 0) {
      let swiPool;
      try {
        swiPool = await sql.connect(config);
        const jobIdList = allSwiJobIds.map(id => `'${id}'`).join(',');
        const result = await swiPool.request().query(`
          DELETE FROM Jobs WHERE JobID IN (${jobIdList})
        `);
        deletionResults.swiJobsDeleted = result.rowsAffected[0] || 0;
      } catch (swiError) {
        logger.error('Error deleting SWI jobs:', swiError);
      } finally {
        if (swiPool) {
          try {
            await swiPool.close();
          } catch (closeErr) {
            // Ignore close errors
          }
        }
      }
    }

    // Batch delete all templates
    await Template.deleteMany({ _id: { $in: templateIds } });
    deletionResults.templatesDeleted = templates.length;
    deletionResults.deletedTemplateIds = templateIds.map(id => id.toString());

    // Invalidate cache for all deleted templates
    templateIds.forEach(id => invalidateCache(id.toString()));

    res.json({
      success: true,
      message: `Deleted all templates for order ${orderNumber}`,
      ...deletionResults
    });

  } catch (error) {
    logger.error('Error in deleteAllTemplatesForOrder:', error);
    res.status(500).json({ error: 'Failed to delete templates' });
  }
};

exports.deleteTemplate = async (req, res) => {
  try {
    const templateId = req.params.id;
    

    
    //  Get template details before deleting (for SWI cleanup)
    const template = await Template.findById(templateId);
    if (!template) {
  
      return res.status(404).json({ error: 'Template not found' });
    }

    let imagesToDelete = [template.preview, template.previewNear, template.previewFar];

    // Filter valid S3 keys (not null, not base64)
    const validS3Keys = imagesToDelete.filter(item => {
      if (!item) return false;
      if (typeof item === 'string' && item.trim().startsWith('data:')) {
        logger.debug('Skipping S3 delete for base64 image (not an S3 key)');
        return false;
      }
      return true;
    });

    // Delete all S3 objects in parallel
    if (validS3Keys.length > 0) {
      await Promise.all(validS3Keys.map(async (item) => {
        try {
          const deleteParams = {
            Bucket: 'encore-sheet',
            Key: item
          };
          await s3Client.send(new DeleteObjectCommand(deleteParams));
        } catch (err) {
          logger.error('Error deleting S3 object', item, err.message || err);
        }
      }));
    }

    // Delete from MongoDB
    const deleteResult = await Template.findByIdAndDelete(templateId);

    // Also delete associated material rows
    const MaterialRow = require('../models/materialRowModel');
    await MaterialRow.deleteMany({ templateId });

    // Clean up SWI database using specific JobIDs
    if (template.swiJobIds && template.swiJobIds.length > 0) {
      try {
        const sql = require('mssql');
        const config = require('../config/sqlConfig');
        
        const swiPool = await sql.connect(config);
        
        // Delete by specific JobIDs only (precise deletion)
        const jobIdList = template.swiJobIds.map(id => `'${id}'`).join(',');
        const result = await swiPool.request().query(`
          DELETE FROM Jobs 
          WHERE JobID IN (${jobIdList})
        `);
        
        await swiPool.close();
        
        const deletedCount = result.rowsAffected[0] || 0;

        if(!template.orderNumber?.startsWith("QT")){
          // Also delete from MongoDB orderitem collection where order_item_unique_id matches any swiJobId
          const orderItemDeleteResult = await OrderItem.deleteMany({
            order_item_unique_id: { $in: template.swiJobIds }
          });
          if (orderItemDeleteResult.deletedCount !== 0) {
            const AWF_CUST_ID = process.env.AWF_CUSTOMER_ID;
            const ordMasDetails = await OrderMaster.aggregate([
              { $match: {
                $expr: {
                  $or: [
                    { $eq: [ "$order_unique_id", template.orderNumber ] },
                    {
                      $and: [
                        { $eq: [ "$order_customer_UID", AWF_CUST_ID ] },
                        { $eq: [{ $substr: [ "$order_customer_PO_number", 0, 6 ] }, template.orderNumber ]}
                      ]
                    }
                  ]
                }
              }}
            ]).then(results => results[0]);
            if (ordMasDetails) {
              await RecalculateOverallOrderTotalFn(ordMasDetails._id);
              await RecalculateOrderItemsCountFn(ordMasDetails._id);
              logger.info('[updateSWI] Recalculated order totals after batch deletion');
            }
          }
        }else{
          // Quotation check
          const quoteItemDeleteResult = await QuotationItem.deleteMany({
            quote_item_unique_id: { $in: template.swiJobIds }
          });
          logger.info(`[deleteTemplate] Deleted ${quoteItemDeleteResult.deletedCount} QuotationItems`);
          if (quoteItemDeleteResult.deletedCount !== 0) {
            const quoteMasDetails = await QuotationMaster.findOne({ quote_unique_id: template.orderNumber });
            if (quoteMasDetails) {
              await RecalculateOverallQuotesTotalFn(quoteMasDetails._id);
              logger.info('[deleteTemplate] Recalculated quote totals after deletion');
            }
          }
        }

        res.json({
          message: 'Template deleted successfully',
          swiJobsDeleted: deletedCount,
          deletedJobIds: template.swiJobIds
        });
      } catch (swiError) {
        logger.error('Error deleting SWI jobs:', swiError);
        // Template was deleted, but SWI cleanup failed
        res.json({ 
          message: 'Template deleted successfully, but failed to clean up SWI jobs',
          swiError: swiError.message
        });
      }
    } else {
      res.json({ message: 'Template deleted successfully (no SWI jobs to clean up)' });
    }
    
  } catch (err) {
    logger.error('Error deleting template:', err);
    res.status(500).json({ error: 'Failed to delete template' });
  }
};

// PUT to update selected material (used in final material submission)
exports.updateMaterialSelection = async (req, res) => {
  try {
    const { material, color, thickness, qty, length, splitInto, splitLength, girth, tag, unitPrice, previewFar, previewNear, orderNumber, customerName, customerId, startFoldType, startFoldDirection, startFoldLength, startFoldGap, endFoldType, endFoldDirection, endFoldLength, endFoldGap, girthStartFoldType, girthEndFoldType, labelOffsets } = req.body;

    const template = await Template.findById(req.params.id);
    if (!template) return res.status(404).json({ message: 'Template not found' });

    // update only the material‐selection fields
    template.material    = material;
    template.color       = color;
    template.thickness   = thickness;
    template.qty         = qty;
    template.length      = length;
    template.splitInto   = splitInto;
    template.splitLength = splitLength;
    template.girth       = girth;
    template.tag         = tag;
    template.unitPrice   = unitPrice;
    
    // Also update customer data if provided (use !== undefined to allow updating to null/empty)
    if (orderNumber !== undefined) template.orderNumber = orderNumber;
    if (customerName !== undefined) template.customerName = customerName;
    if (customerId !== undefined) template.customerId = customerId;

    // Set lastModifiedBy to track who made changes
    const modifiedBy = req.body.modifiedBy || req.user?.user_ref_id || 'unknown';
    template.lastModifiedBy = modifiedBy;

    // Update fold data if provided
    if (startFoldType !== undefined) template.startFoldType = startFoldType;
    if (startFoldDirection !== undefined) template.startFoldDirection = startFoldDirection;
    if (startFoldLength !== undefined) template.startFoldLength = startFoldLength;
    if (startFoldGap !== undefined) template.startFoldGap = startFoldGap;
    if (endFoldType !== undefined) template.endFoldType = endFoldType;
    if (endFoldDirection !== undefined) template.endFoldDirection = endFoldDirection;
    if (endFoldLength !== undefined) template.endFoldLength = endFoldLength;
    if (endFoldGap !== undefined) template.endFoldGap = endFoldGap;
    if (girthStartFoldType !== undefined) template.girthStartFoldType = girthStartFoldType;
    if (girthEndFoldType !== undefined) template.girthEndFoldType = girthEndFoldType;

    // Update label offsets if provided (for preserving manual position adjustments)
    if (labelOffsets !== undefined) template.labelOffsets = labelOffsets;

    // Save ORIGINAL uncompressed images first (user sees images immediately!)
    let materialPreviews = {};

    if (previewFar) {
      const processed = await processImageData(previewFar);
      if(processed !== null){
        template.previewFar = processed;
        materialPreviews.previewFar = processed;
      }
    }
    if (previewNear) {
      const processed = await processImageData(previewNear);
      if(processed !== null){
        template.previewNear = processed;
        materialPreviews.previewNear = processed;
      }
    }

    // Save with uncompressed images
    await template.save();

    // Queue background compression to reduce database size
    res.json({ message: 'Material selection updated', data: template });
  } catch (error) {
    logger.error('Error updating material selection:', error);
    res.status(500).json({ error: 'Failed to update material selection' });
  }
};

//  Generate Split Preview Images
const { generateSplitPreview } = require('../utils/splitPreviewGenerator');

exports.generateSplitPreviews = async (req, res) => {
  try {
    const { templateId, splitInto } = req.body;

    // Get the template
    const template = await Template.findById(templateId);
    if (!template) {
      return res.status(404).json({
        success: false,
        message: 'Template not found'
      });
    }

    // Check if it's a taper template
    // Note: Templates saved via "Save to Library" store farLengths in the 'lengths' field
    // and don't have a separate 'farLengths' field
    const isTaper = template.isTaper === true;
    const templateFarLengths = template.farLengths || template.lengths;
    const templateNearLengths = template.nearLengths;
    
    if (!isTaper || !templateFarLengths || !templateNearLengths) {
      return res.status(400).json({ 
        success: false, 
        message: 'Template is not a taper or missing dimensions' 
      });
    }
    
    const farLengths = templateFarLengths;
    const nearLengths = templateNearLengths;
    const angles = template.angles || [];

    // Use template direction if available, otherwise default to 'Right'
    const direction = template.direction || 'Right';
    const reverseColor = template.reverseColor || false;
    
    // Calculate progressive dimensions for each split
    const splitPreviews = [];
    const n = Number(splitInto) || 1;
    
    for (let i = 0; i < n; i++) {
      const splitFarLengths = [];
      const splitNearLengths = [];
      
      // Calculate interpolated dimensions for this split piece
      for (let j = 0; j < farLengths.length; j++) {
        const farLen = parseFloat(farLengths[j]) || 0;
        const nearLen = parseFloat(nearLengths[j]) || 0;
        const diff = nearLen - farLen;
        const step = diff / n;
        
        // Progressive dimensions for this split
        const pieceFarLen = farLen + (step * i);
        const pieceNearLen = farLen + (step * (i + 1));
        
        splitFarLengths.push(Math.round(pieceFarLen));
        splitNearLengths.push(Math.round(pieceNearLen));
      }
      
      // Generate preview images for this split piece
      try {
        const { farImage, nearImage } = await generateSplitPreview({
          farLengths: splitFarLengths,
          nearLengths: splitNearLengths,
          angles: angles,
          direction: direction,
          firstSegmentAngle: template.firstSegmentAngle,  // Pass the actual first segment angle
          splitIndex: i + 1,
          splitTotal: n,
          templateId: templateId,
          isTaper: true,
          reverseColor: reverseColor
        });

        splitPreviews.push({
          splitIndex: i + 1,
          farLengths: splitFarLengths,
          farImage: farImage,
          nearImage: nearImage,
          nearLengths: splitNearLengths,
          farGirth: splitFarLengths.reduce((sum, len) => sum + len, 0),
          nearGirth: splitNearLengths.reduce((sum, len) => sum + len, 0)
        });
      } catch (previewError) {
        logger.error(`Failed to generate split preview ${i + 1}:`, previewError);
        // Still add the split data even if preview generation fails
        splitPreviews.push({
          splitIndex: i + 1,
          farLengths: splitFarLengths,
          farImage: null,
          nearImage: null,
          nearLengths: splitNearLengths,
          farGirth: splitFarLengths.reduce((sum, len) => sum + len, 0),
          nearGirth: splitNearLengths.reduce((sum, len) => sum + len, 0)
        });
      }
    }

    res.status(200).json({
      success: true,
      splitPreviews,
      message: 'Split previews generated successfully'
    });

  } catch (error) {
    logger.error('Error generating split previews:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Failed to generate split previews' 
    });
  }
};


const puppeteer = require("puppeteer");
const path = require("path");
const fs = require("fs");
const bwipjs = require('bwip-js');


async function getS3Url(key) {
  if (!key) return '';

  // Skip if it's base64 data (old format) - not an S3 key
  if (key.startsWith('data:image')) return key;

  // Skip if it's an old file path format
  if (key.startsWith('/uploads/') || key.startsWith('uploads/')) return '';

  // Only process keys that look like S3 keys (contain image extension)
  if (!key.match(/\.(png|jpg|jpeg|webp)$/i)) return key;

  try {
    const command = new GetObjectCommand({
        Bucket: 'encore-sheet',
        Key: key
    });
    const S3_BUCKET_URL = await getSignedUrl(s3Client, command, { expiresIn: 3600 });
    return `${S3_BUCKET_URL}`;
  } catch (error) {
    return '';
  }
}

exports.generateOrderDrawingsPDF = async (req, res) => {
  try {
    const orderId = req.params.orderid;
    
    // Fetch order data
    const orderData = await OrderMaster.findOne({ _id: orderId }).lean();
    if (!orderData) return res.status(404).send("Order not found");

    const orderNumber = orderData.order_unique_id;
    
    // Fetch templates/drawings
    const drawings = await Template.find({ orderNumber }).sort({ createdAt: 1 }).lean();
    if (!drawings || drawings.length === 0) {
      return res.status(404).send("No drawings found for this order");
    }

    // Fetch material rows for each drawing and get S3 URLs (OPTIMIZED)
    // First, fetch ALL material rows in one query to avoid N+1 problem
    const allTemplateIds = drawings.map(d => d._id);
    const allMaterialRows = await MaterialRow.find({ templateId: { $in: allTemplateIds } }).sort({ rowNumber: 1 }).lean();

    // Group material rows by templateId for quick lookup
    const materialRowsByTemplate = {};
    allMaterialRows.forEach(row => {
      const templateId = row.templateId.toString();
      if (!materialRowsByTemplate[templateId]) {
        materialRowsByTemplate[templateId] = [];
      }
      materialRowsByTemplate[templateId].push(row);
    });

    const drawingsWithMaterials = await Promise.all(
      drawings.map(async (drawing) => {
        // Get material rows from pre-fetched data (no extra query)
        const materialRows = materialRowsByTemplate[drawing._id.toString()] || [];

        // Get S3 URLs for all preview images (PARALLEL for taper)
        let previewUrl = null;
        let previewFarUrl = null;
        let previewNearUrl = null;

        if (drawing.isTaper) {
          // Fetch both URLs in parallel
          [previewFarUrl, previewNearUrl] = await Promise.all([
            getS3Url(drawing.previewFar),
            getS3Url(drawing.previewNear)
          ]);
        } else {
          previewUrl = await getS3Url(drawing.preview);
        }

        return {
          ...drawing,
          materialRows,
          previewUrl,
          previewFarUrl,
          previewNearUrl
        };
      })
    );

    // Sort drawings: Tapered first, then regular
    drawingsWithMaterials.sort((a, b) => {
      if (a.isTaper && !b.isTaper) return -1;
      if (!a.isTaper && b.isTaper) return 1;
      return 0;
    });

    // Helper functions
    const calculateGirth = (lengths) => {
      if (!lengths || lengths.length === 0) return 0;
      return lengths.reduce((sum, len) => sum + (parseFloat(len) || 0), 0);
    };

    const calculateTotals = (materialRows) => {
      if (!materialRows || materialRows.length === 0) return { totalQty: 0, totalLength: 0 };
      const totalQty = materialRows.reduce((sum, row) => sum + (row.quantity || 0), 0);
      const totalLength = materialRows.reduce((sum, row) => sum + ((row.quantity || 0) * (row.length || 0)), 0);
      return { totalQty, totalLength };
    };

    const totalPiecesInOrder = drawingsWithMaterials.reduce((sum, d) => {
      const totals = calculateTotals(d.materialRows);
      return sum + totals.totalQty;
    }, 0);

    const formatDate = (dateStr) => {
      if (!dateStr) return 'Not specified';
      const date = new Date(dateStr);
      const day = String(date.getDate()).padStart(2, '0');
      const month = String(date.getMonth() + 1).padStart(2, '0');
      const year = date.getFullYear();
      return `${day}-${month}-${year}`;
    };

    // Generate barcodes
    const generateBarcode = async (jobId) => {
      try {
        const png = await bwipjs.toBuffer({
          bcid: 'code128',
          text: String(jobId),
          scale: 2,
          height: 5,
          includetext: true,
          textxalign: 'center',
          rotate: 'L',
        });
        return `data:image/png;base64,${png.toString('base64')}`;
      } catch (err) {
        logger.error('Barcode generation error:', err);
        return null;
      }
    };

    // Generate barcodes for each drawing (PARALLEL for performance)
    await Promise.all(drawingsWithMaterials.map(async (drawing) => {
      const swiJobId = drawing.swiJobIds && drawing.swiJobIds.length > 0 ? drawing.swiJobIds[0] : '';
      if (swiJobId) {
        drawing.barcodeDataUri = await generateBarcode(swiJobId);
      }
    }));

    // Split into pages - 6 drawings per page (each drawing is one box, tapered counts as 1)
    const pages = [];
    const drawingsPerPage = 6;

    for (let i = 0; i < drawingsWithMaterials.length; i += drawingsPerPage) {
      pages.push(drawingsWithMaterials.slice(i, i + drawingsPerPage));
    }

    const totalPages = pages.length;

    // Read the logo image as base64
    const logoPath = path.join(__dirname, "../images/docket-logo.png");
    const logoBase64 = fs.readFileSync(logoPath, { encoding: "base64" });
    const logoDataUri = `data:image/png;base64,${logoBase64}`;

    const htmlContent = `
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="utf-8">
      <style>
        @page {
          size: A4 portrait;
          margin: 0;
        }
        * {
          box-sizing: border-box;
          margin: 0;
          padding: 0;
        }
        body {
          font-family: Arial, sans-serif;
          font-size: 7px;
          line-height: 1.2;
        }
        .page {
          page-break-after: always;
          width: 210mm;
          height: 297mm;
          padding: 3mm;
          display: flex;
          flex-direction: column;
          position: relative;
        }
        .page:last-child {
          page-break-after: auto;
        }
        
        .page-header {
          padding: 1mm 2mm;
          margin-bottom: 1mm;
          background: #f5f5f5;
          border: 1px solid #000;
        }
        .header-top {
          display: flex;
          justify-content: space-between;
          align-items: center;
          margin-bottom: 1mm;
        }
        .logo img {
          height: 28px;
        }
        .order-info {
          display: flex;
          gap: 12mm;
          justify-content: space-between;
        }
        .order-number {
          font-size: 18px;
          font-weight: bold;
          color: #000;
        }
        .customer-name {
          font-size: 14px;
          font-weight: bold;
          color: #333;
        }
        .header-details {
          display: flex;
          gap: 8mm;
          font-size: 8px;
        }
        .header-item {
          display: flex;
          gap: 2mm;
        }
        .header-label {
          font-weight: bold;
        }
        .header-value {
          color: #333;
        }
        
        .drawings-grid {
          display: grid;
          grid-template-columns: 1fr 1fr;
          grid-template-rows: repeat(3, 1fr);
          gap: 1.5mm;
          flex: 1;
          margin-bottom: 2mm;
        }
        
        .drawing-box {
          display: flex;
          flex-direction: column;
          overflow: hidden;
          background: white;
          border: 1px solid #000 !important;
        }
        
        .drawing-box-header {
          padding: 0.8mm 2mm;
          display: flex;
          justify-content: space-between;
          align-items: center;
          gap: 3mm;
          border-bottom: 1px solid #000;
        }
        
        .material-info {
          font-size: 9px;
          color: #000;
        }
        
        .girth-badge {
          color: #000;
          padding: 0.5mm 2mm;
          font-size: 11px;
          font-weight: bold;
        }
        
        .drawing-content {
          display: flex;
          flex: 1;
          overflow: hidden;
        }
        
        .drawing-area {
          flex: 1;
          display: flex;
          align-items: center;
          justify-content: center;
          padding: 1mm;
          background: white;
          position: relative;
        }
        
        .drawing-area img {
          max-width: 100%;
          max-height: 100%;
          object-fit: contain;
        }

        .tapered-container {
          display: flex;
          flex-direction: column;
          gap: 0.3mm;
          flex: 1;
        }

        .tapered-label {
          font-size: 7px;
          font-weight: bold;
          text-align: center;
          padding: 0.3mm;
          background: #f0f0f0;
        }
        
        .barcode-area {
          width: 16%;
          display: flex;
          align-items: center;
          justify-content: center;
          background: white;
          padding: 0.5mm;
        }
        
        .barcode-vertical {
          width: 80%;
          height: 80%;
          display: flex;
          align-items: center;
          justify-content: center;
        }
        
        .barcode-vertical img {
          max-width: 100%;
          max-height: 100%;
          object-fit: contain;
        }
        
        .bottom-info {
          display: flex;
          height: 7mm;
        }
        
        .info-table {
          display: flex;
          flex: 1;
          border-collapse: collapse;
        }
        
        .info-cell {
          padding: 1mm 2mm;
          display: flex;
          flex-direction: column;
          justify-content: center;
          background: white;
        }
      
        .info-cell.qty-cell {
          flex: 2;
        }
        
        .info-cell.small-cell {
          flex: 1;
          align-items: center;
          text-align: center;
        }
        
        .info-label {
          font-size: 7px;
          color: #000;
          margin-bottom: 0.3mm;
          font-weight: normal;
        }
        
        .info-value {
          font-weight: bold;
          font-size: 9px;
          color: #000;
        }
        
        .page-footer {
          position: absolute;
          bottom: 3mm;
          right: 3mm;
          font-size: 9px;
          font-weight: bold;
          color: #333;
        }
      </style>
    </head>
    <body>
      ${pages.map((pageDrawings, pageIndex) => `
        <div class="page">
          <div class="page-header">
            <div class="header-top">
              <div class="order-info">
                ${logoDataUri ? `<div class="logo"><img src="${logoDataUri}" alt="Logo" /></div>` : '<div></div>'}
                <div class="order-number">Job Name: ${orderNumber}</div>
              </div>
              <div class="order-info">
                <div class="customer-name">${orderData.order_customer_name || 'Customer'}</div>
              </div>
            </div>
            <div class="header-details">
              <div class="header-item">
                <span class="header-label">Order Date:</span>
                <span class="header-value">${formatDate(orderData.created)}</span>
              </div>
              <div class="header-item">
                <span class="header-label">Delivery Date:</span>
                <span class="header-value">${orderData.order_delivery_date_str}</span>
              </div>
              <div class="header-item">
                <span class="header-label">Total Pieces:</span>
                <span class="header-value">${totalPiecesInOrder}</span>
              </div>
            </div>
          </div>
          
          <div class="drawings-grid">
            ${pageDrawings.map((drawing, idx) => {
              const girth = calculateGirth(drawing.lengths);
              const swiJobId = drawing.swiJobIds && drawing.swiJobIds.length > 0 ? drawing.swiJobIds[0] : '';
              const totals = calculateTotals(drawing.materialRows);
              const firstRow = drawing.materialRows && drawing.materialRows.length > 0 ? drawing.materialRows[0] : {};
              const bends = drawing.angles ? drawing.angles.length : 0;
              
              // Get material details from MaterialRow (first row)
              const material = firstRow.material || drawing.material || 'N/A';
              const color = firstRow.color || drawing.color || 'N/A';
              const thickness = firstRow.thickness || '0.55';
              const tag = firstRow.tag || 'A';
              
              if (drawing.isTaper) {
                return `
                  <div class="drawing-box">
                    <div class="drawing-box-header">
                      <div class="material-info"><strong>M:</strong> ${material} ${thickness} <strong> C:</strong> ${color}</div>
                      <div class="girth-badge"><strong>Girth:</strong> ${girth}</div>
                    </div>
                    
                    <div class="drawing-content">
                      <div class="tapered-container">
                        <div class="tapered-label">Far</div>
                        <div class="drawing-area">
                          ${drawing.previewFarUrl 
                            ? `<img src="${drawing.previewFarUrl}" alt="Far" />` 
                            : '<p style="color: #999; font-size: 8px;">No far image</p>'
                          }
                        </div>
                      </div>
                      
                      <div class="tapered-container">
                        <div class="tapered-label">Near</div>
                        <div class="drawing-area">
                          ${drawing.previewNearUrl 
                            ? `<img src="${drawing.previewNearUrl}" alt="Near" />` 
                            : '<p style="color: #999; font-size: 8px;">No near image</p>'
                          }
                        </div>
                      </div>
                      
                      <div class="barcode-area">
                        <div class="barcode-vertical">
                          ${drawing.barcodeDataUri 
                            ? `<img src="${drawing.barcodeDataUri}" alt="Barcode" />` 
                            : `<div style="font-size: 7px; writing-mode: vertical-rl; transform: rotate(180deg);">JobID: ${swiJobId || ''}</div>`
                          }
                        </div>
                      </div>
                    </div>
                    
                    <div class="bottom-info">
                      <div class="info-table">
                        <div class="info-cell qty-cell">
                          <div class="info-label">Qty/Length</div>
                          <div class="info-value">${totals.totalQty} X ${firstRow.length || 1200}</div>
                        </div>
                        <div class="info-cell small-cell">
                          <div class="info-label">Bends</div>
                          <div class="info-value">${bends}</div>
                        </div>
                        <div class="info-cell small-cell">
                          <div class="info-label">Tag</div>
                          <div class="info-value">${tag}</div>
                        </div>
                      </div>
                    </div>
                  </div>
                `;
              } else {
                return `
                  <div class="drawing-box">
                    <div class="drawing-box-header">
                      <div class="material-info"><strong>M:</strong> ${material} ${thickness} <strong> C:</strong> ${color}</div>
                      <div class="girth-badge"><strong>Girth:</strong> ${girth}</div>
                    </div>
                    
                    <div class="drawing-content">
                      <div class="drawing-area">
                        ${drawing.previewUrl 
                          ? `<img src="${drawing.previewUrl}" alt="Drawing" />` 
                          : '<p style="color: #999; font-size: 8px;">No drawing available</p>'
                        }
                      </div>
                      
                      <div class="barcode-area">
                        <div class="barcode-vertical">
                          ${drawing.barcodeDataUri 
                            ? `<img src="${drawing.barcodeDataUri}" alt="Barcode" />` 
                            : `<div style="font-size: 7px; writing-mode: vertical-rl; transform: rotate(180deg);">JobID: ${swiJobId || ''}</div>`
                          }
                        </div>
                      </div>
                    </div>
                    
                    <div class="bottom-info">
                      <div class="info-table">
                        <div class="info-cell qty-cell">
                          <div class="info-label">Qty/Length</div>
                          <div class="info-value">${totals.totalQty} X ${firstRow.length || 1200}</div>
                        </div>
                        <div class="info-cell small-cell">
                          <div class="info-label">Bends</div>
                          <div class="info-value">${bends}</div>
                        </div>
                        <div class="info-cell small-cell">
                          <div class="info-label">Tag</div>
                          <div class="info-value">${tag}</div>
                        </div>
                      </div>
                    </div>
                  </div>
                `;
              }
            }).join('')}
          </div>
          
          <div class="page-footer">
            Page ${pageIndex + 1} of ${totalPages}
          </div>
        </div>
      `).join('')}
    </body>
    </html>`;

    // Launch Puppeteer
    const browser = await puppeteer.launch({
      headless: true,
      args: ["--no-sandbox", "--disable-setuid-sandbox"],
      timeout: 60000
    });

    const page = await browser.newPage();
    await page.setContent(htmlContent, { waitUntil: "networkidle0", timeout: 60000 });

    const today = new Date();
    const dateStr = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;
    const fileName = `Order_Drawings_From_Design_Tool_${orderNumber}_${dateStr}.pdf`;
    const filePath = path.join(__dirname, "../dockets", fileName);

    await page.pdf({
      path: filePath,
      format: "A4",
      printBackground: true,
      margin: { top: 0, bottom: 0, left: 0, right: 0 },
      timeout: 60000
    });

    await browser.close();

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="${fileName}"`);
    
    const fileStream = fs.createReadStream(filePath);
    fileStream.pipe(res);

    fileStream.on('end', () => {
      setTimeout(() => {
        fs.unlink(filePath, (err) => {
          if (err) logger.error("Error deleting PDF:", err);
        });
      }, 5000);
    });

  } catch (err) {
    logger.error("Error generating drawings PDF:", err);
    res.status(500).send("PDF generation failed: " + err.message);
  }
};

exports.getDrawingCountsByOrder = async (req, res) => {
  try {
    const { orderNumber } = req.params;
    
    if (!orderNumber) {
      return res.status(400).json({ message: 'Order number is required' });
    }
    
    // Get all template IDs for this order (with swiJobIds)
    const templates = await Template.find({
      orderNumber: orderNumber,
      swiJobIds: { 
        $exists: true,
        $type: 'array',
        $ne: []
      },
      $expr: { $gt: [{ $size: "$swiJobIds" }, 0] }
    }).select('_id swiJobIds isTaper').lean();
    
    const templateIds = templates.map(t => t._id);
    
    // Build a map of templateId -> isTaper status
    const templateTaperMap = {};
    templates.forEach(t => {
      templateTaperMap[t._id.toString()] = t.isTaper === true;
    });
    
    // Calculate total pieces, distinct colors count, and total drawings from MaterialRow table
    let totalPieces = 0;
    let colorCount = 0;
    let totalDrawings = 0;
    
    if (templateIds.length > 0) {
      const materialRows = await MaterialRow.find({
        templateId: { $in: templateIds }
      }).select('quantity color material splitInto templateId').lean();
      
      // Calculate total pieces              
      totalPieces = materialRows.reduce((sum, row) => {
        return sum + (row.quantity || 0);
      }, 0);
      
      // Get distinct colors count from material rows
      const colorSet = new Set();
      materialRows.forEach(row => {
        if (row.color && row.color.trim() !== '') {
          colorSet.add(row.color);
        }
      });
      colorCount = colorSet.size;
      
      // Calculate total drawings: count templates, but if any material row has splitInto > 1 
      // AND template has isTaper = true, use that value instead of 1 for that template
      // Group material rows by templateId to find max splitInto per template (only for taper templates)
      const templateSplitMap = {};
      materialRows.forEach(row => {
        const templateIdStr = row.templateId.toString();
        // Only use splitInto for taper templates
        const isTaperTemplate = templateTaperMap[templateIdStr];
        const splitValue = isTaperTemplate && row.splitInto && row.splitInto > 1 ? row.splitInto : 1;
        // Take the max splitInto value for each template
        if (!templateSplitMap[templateIdStr] || splitValue > templateSplitMap[templateIdStr]) {
          templateSplitMap[templateIdStr] = splitValue;
        }
      });
      
      // Sum up: for each template, add its splitInto value (or 1 if no material rows or not taper)
      templateIds.forEach(templateId => {
        const templateIdStr = templateId.toString();
        totalDrawings += templateSplitMap[templateIdStr] || 1;
      });
    } else {
      // No templates with swiJobIds
      totalDrawings = 0;
    }
    
    res.json({ 
      success: true,
      orderNumber: orderNumber,
      colorCount: colorCount,
      totalDrawings: totalDrawings,
      totalPieces: totalPieces
    });
    
  } catch (error) {
    logger.error('Error getting drawing counts:', error);
    res.status(500).json({ error: 'Failed to get drawing counts' });
  }
};