/**
 * Transaction Coordinator Service
 *
 * Provides atomic transaction management for template creation workflow.
 * Ensures all operations (MongoDB, S3, SWI) succeed or fail together.
 *
 * Pattern: Compensating Transactions
 * - MongoDB doesn't support multi-collection transactions in all deployment scenarios
 * - We use manual rollback (compensating transactions) for data consistency
 * - Rollback order: SWI → S3 → Material Rows → Template (reverse of creation)
 *
 * This service coordinates:
 * 1. Template creation in MongoDB
 * 2. Preview upload to S3 (optional)
 * 3. Material rows creation in MongoDB
 * 4. Jobs push to SWI database (optional)
 *
 * If any step fails, all previous steps are rolled back automatically.
 *
 * Created: Day 4 - November 21, 2025
 * Updated: Day 5 - November 22, 2025 (Added S3 and SWI integration)
 */

const { logger } = require('../utils/logger');
const Template = require('../models/templateModel');
const MaterialRow = require('../models/materialRowModel');
const swiService = require('./swiService');

/**
 * Get current timestamp in Australia/Sydney timezone (handles daylight saving)
 * Same logic as swiService.prepareDates
 */
function getAustralianTimestamp(timeZone = 'Australia/Sydney') {
  const now = new Date();
  const fmt = new Intl.DateTimeFormat('en-GB', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false
  });

  const parts = fmt.formatToParts(now).reduce((acc, part) => {
    acc[part.type] = part.value;
    return acc;
  }, {});

  const year = parseInt(parts.year, 10);
  const month = parseInt(parts.month, 10) - 1;
  const day = parseInt(parts.day, 10);
  const hour = parseInt(parts.hour, 10);
  const minute = parseInt(parts.minute, 10);
  const second = parseInt(parts.second, 10);

  return new Date(Date.UTC(year, month, day, hour, minute, second));
}

/**
 * Create template with material rows in an atomic transaction
 * Supports optional S3 upload and SWI push
 *
 * @param {Object} templateData - Template data to create
 * @param {Array<Object>} materialRowsData - Material rows data to create
 * @param {Object} options - Optional integrations { enableS3: boolean, enableSWI: boolean, swiData: { orderNumber, customerName, deliveryDate, enteredBy } }
 * @returns {Promise<Object>} { template, materialRows, s3Keys, swiJobIds }
 * @throws {Error} If transaction fails (with rollback)
 */
exports.createTemplateWithMaterials = async (templateData, materialRowsData, options = {}) => {
  let createdTemplate = null;
  let createdMaterialRows = [];
  let uploadedS3Keys = [];
  let createdSWIJobIds = [];

  try {
    logger.info('[TransactionCoordinator] Starting template creation transaction', {
      enableSWI: options.enableSWI
    });

    // Step 1: Mark transaction as started
    templateData.status = 'processing';
    templateData.processingStartedAt = getAustralianTimestamp();

    // Step 3: Create template with S3 keys (not base64)
    logger.info('[TransactionCoordinator] Step 3: Creating template with S3 keys');
    createdTemplate = await Template.create(templateData);
    logger.info(`[TransactionCoordinator] Template created: ${createdTemplate._id}`);

    // Step 4: Create material rows (BATCH INSERT for performance)
    logger.info(`[TransactionCoordinator] Step 4: Creating ${materialRowsData.length} material rows (batch insert)`);

    // Calculate girth from template lengths
    const templateLengths = createdTemplate.lengths || [];
    const calculatedGirth = templateLengths.reduce((sum, len) => sum + (parseFloat(len) || 0), 0);

    // Prepare all rows for batch insert
    const rowsToInsert = materialRowsData.map((rowData, i) => {
      // Remove _id from incoming data to let MongoDB generate it
      const { _id, ...rowDataWithoutId } = rowData;
      return {
        ...rowDataWithoutId,
        templateId: createdTemplate._id,
        rowNumber: i + 1,
        status: 'pending',  // Material rows start as pending
        girth: calculatedGirth || null  // Add girth from template
      };
    });

    // Batch insert all rows at once (much faster than sequential create)
    createdMaterialRows = await MaterialRow.insertMany(rowsToInsert);
    logger.info(`[TransactionCoordinator] Batch created ${createdMaterialRows.length} material rows`);

    // Step 5: Push to SWI (optional)
    if (options.enableSWI && options.swiData) {
      logger.info('[TransactionCoordinator] Step 5: Pushing to SWI');

      // Log material rows with their _ids before passing to SWI
      // Note: Mongoose documents have _id as ObjectId, need to check properly
      logger.info('[TransactionCoordinator] Material rows being sent to SWI:',
        createdMaterialRows.map(r => ({
          _id: r._id ? r._id.toString() : 'NULL',
          id: r.id,  // Mongoose virtual getter
          tag: r.tag,
          hasId: !!r._id,
          typeOfId: typeof r._id
        })));

      const swiResults = await swiService.pushToSWI(
        createdTemplate,
        createdMaterialRows,
        options.swiData
      );

      // swiResults is now array of { jobId, shapeId, materialRowId }
      // Extract jobId strings for template
      createdSWIJobIds = swiResults.map(r => r.jobId);

      // Update template with SWI JobIDs
      createdTemplate.swiJobIds = createdSWIJobIds;
      await createdTemplate.save();

      // Step 5b: Update material rows with ShapeID as tag (to match SWI) - BATCH UPDATE for performance
      logger.info('[TransactionCoordinator] Step 5b: Syncing ShapeIDs to material row tags (batch update)');

      // Filter valid results and build bulk operations
      const validResults = swiResults.filter(r => r.materialRowId && r.shapeId);
      const skippedCount = swiResults.length - validResults.length;

      if (skippedCount > 0) {
        logger.warn(`[TransactionCoordinator] Skipping ${skippedCount} results - missing materialRowId or shapeId`);
      }

      if (validResults.length > 0) {
        const timestamp = getAustralianTimestamp();
        const bulkOps = validResults.map(result => ({
          updateOne: {
            filter: { _id: result.materialRowId },
            update: {
              $set: {
                // In CREATE mode: Sync ShapeID from SWI to MongoDB tag
                // This ensures both databases show the same tag (important for duplicates)
                tag: result.shapeId,
                status: 'completed',
                swiJobId: result.jobId,
                swiPushedAt: timestamp
              }
            }
          }
        }));

        try {
          const bulkResult = await MaterialRow.bulkWrite(bulkOps, { ordered: false });
          logger.info(`[TransactionCoordinator] Batch updated ${bulkResult.modifiedCount} material rows with ShapeIDs`);
        } catch (bulkError) {
          logger.error(`[TransactionCoordinator] Bulk update failed:`, bulkError.message);
          // Don't throw - tag sync is non-critical
        }
      }

      logger.info('[TransactionCoordinator] Pushed to SWI, JobIDs:', createdSWIJobIds);
    }

    // Step 6: Mark transaction as completed
    createdTemplate.status = 'completed';
    createdTemplate.processingCompletedAt = getAustralianTimestamp();
    await createdTemplate.save();

    logger.info('[TransactionCoordinator] Transaction completed successfully', {
      templateId: createdTemplate._id,
      materialRowsCount: createdMaterialRows.length,
      s3Uploaded: uploadedS3Keys.length > 0,
      swiJobsCreated: createdSWIJobIds.length
    });

    return {
      template: createdTemplate,
      materialRows: createdMaterialRows,
      s3Keys: uploadedS3Keys,
      swiJobIds: createdSWIJobIds
    };

  } catch (error) {
    logger.error('[TransactionCoordinator] Transaction failed, initiating rollback', {
      error: error.message,
      templateId: createdTemplate?._id,
      materialRowsCreated: createdMaterialRows.length,
      s3KeysUploaded: uploadedS3Keys.length,
      swiJobsCreated: createdSWIJobIds.length
    });

    // Rollback: Delete created records, S3 files, and SWI jobs
    await rollbackTransaction(createdTemplate, createdMaterialRows, uploadedS3Keys, createdSWIJobIds);

    // Re-throw error with transaction context
    const transactionError = new Error(`Transaction failed: ${error.message}`);
    transactionError.originalError = error;
    transactionError.rollbackCompleted = true;
    throw transactionError;
  }
};

/**
 * Rollback transaction by deleting created records, S3 files, and SWI jobs
 * @param {Object} template - Created template to delete
 * @param {Array<Object>} materialRows - Created material rows to delete
 * @param {Array<String>} s3Keys - Uploaded S3 keys to delete
 * @param {Array<String>} swiJobIds - Created SWI job IDs to delete
 * @returns {Promise<void>}
 */
async function rollbackTransaction(template, materialRows, s3Keys = [], swiJobIds = []) {
  logger.warn('[TransactionCoordinator] Starting rollback', {
    materialRowsToDelete: materialRows?.length || 0,
    s3KeysToDelete: s3Keys?.length || 0,
    swiJobsToDelete: swiJobIds?.length || 0
  });

  try {
    // Step 1: Rollback SWI jobs (delete from MS-SQL)
    if (swiJobIds && swiJobIds.length > 0) {
      logger.info('[TransactionCoordinator] Rollback Step 1: Deleting SWI jobs');
      await swiService.rollbackSWIPush(swiJobIds);
      logger.info(`[TransactionCoordinator] Rollback: Deleted ${swiJobIds.length} SWI jobs`);
    }

    // Step 2: Delete material rows (delete from MongoDB)
    if (materialRows && materialRows.length > 0) {
      logger.info('[TransactionCoordinator] Rollback Step 3: Deleting material rows');
      const materialRowIds = materialRows.map(row => row._id);
      const deleteResult = await MaterialRow.deleteMany({ _id: { $in: materialRowIds } });
      logger.info(`[TransactionCoordinator] Rollback: Deleted ${deleteResult.deletedCount} material rows`);
    }

    // Step 4: Mark template as failed (keep for audit trail)
    if (template && template._id) {
      logger.info('[TransactionCoordinator] Rollback Step 4: Marking template as failed');
      template.status = 'failed';
      template.errorMessage = 'Transaction rolled back';
      await template.save();

      // Optional: Keep failed template for debugging, or delete it
      // For now, we keep it with 'failed' status for audit trail
      logger.info(`[TransactionCoordinator] Rollback: Marked template ${template._id} as failed`);

      // Uncomment to delete instead of marking as failed:
      // await Template.deleteOne({ _id: template._id });
      // logger.info(`[TransactionCoordinator] Rollback: Deleted template ${template._id}`);
    }

    logger.info('[TransactionCoordinator] Rollback completed successfully');
  } catch (rollbackError) {
    // Rollback failed - this is a critical error
    logger.error('[TransactionCoordinator] CRITICAL: Rollback failed', {
      error: rollbackError.message,
      templateId: template?._id,
      materialRowCount: materialRows?.length,
      s3KeysCount: s3Keys?.length,
      swiJobIdsCount: swiJobIds?.length
    });

    // Don't throw - we've already thrown the original error
    // Just log the rollback failure for manual cleanup
  }
}

/**
 * Update template with material rows (for updates/edits)
 * @param {String} templateId - Template ID to update
 * @param {Object} templateUpdates - Template fields to update
 * @param {Array<Object>} materialRowsData - New material rows data (replaces existing)
 * @param {Object} options - Optional integrations { enableS3: boolean, enableSWI: boolean, swiData: { ... }, preservedData: { jobIds, enteredDate, enteredBy, shapeIds, customTXT01 } }
 * @returns {Promise<Object>} { template, materialRows, s3Keys, swiJobIds }
 * @throws {Error} If transaction fails (with rollback)
 */
exports.updateTemplateWithMaterials = async (templateId, templateUpdates, materialRowsData, options = {}) => {
  let updatedTemplate = null;
  let originalMaterialRows = [];
  let newMaterialRows = [];
  let uploadedS3Keys = [];
  let updatedSWIJobIds = [];

  try {
    logger.info('[TransactionCoordinator] Starting template update transaction', {
      templateId,
      enableSWI: options.enableSWI
    });

    // Step 1: Find existing template
    updatedTemplate = await Template.findById(templateId);
    if (!updatedTemplate) {
      throw new Error(`Template not found: ${templateId}`);
    }

    // Step 2: Backup existing material rows (for rollback)
    originalMaterialRows = await MaterialRow.find({ templateId }).lean();
    logger.info(`[TransactionCoordinator] Backed up ${originalMaterialRows.length} existing material rows`);

    // Step 3: Mark transaction as processing
    updatedTemplate.status = 'processing';
    updatedTemplate.processingStartedAt = getAustralianTimestamp();

    // Step 5: Update template fields with S3 keys (not base64)
    Object.assign(updatedTemplate, templateUpdates);
    await updatedTemplate.save();
    logger.info('[TransactionCoordinator] Template updated with S3 keys');

    // Step 6: Delete existing material rows
    await MaterialRow.deleteMany({ templateId });
    logger.info('[TransactionCoordinator] Deleted existing material rows');

    // Step 7: Create new material rows (BATCH INSERT for performance)
    // Calculate girth from template lengths
    const templateLengths = updatedTemplate.lengths || [];
    const calculatedGirth = templateLengths.reduce((sum, len) => sum + (parseFloat(len) || 0), 0);

    // Prepare all rows for batch insert
    const rowsToInsert = materialRowsData.map((rowData, i) => {
      // Remove _id from incoming data to let MongoDB generate it
      const { _id, ...rowDataWithoutId } = rowData;
      return {
        ...rowDataWithoutId,
        templateId: updatedTemplate._id,
        rowNumber: i + 1,
        status: 'pending',
        girth: calculatedGirth || null  // Add girth from template
      };
    });

    // Batch insert all rows at once (much faster than sequential create)
    newMaterialRows = await MaterialRow.insertMany(rowsToInsert);
    logger.info(`[TransactionCoordinator] Batch created ${newMaterialRows.length} new material rows`);

    // Step 8: Update SWI jobs (optional)
    if (options.enableSWI && options.swiData && options.preservedData) {
      logger.info('[TransactionCoordinator] Step 8: Updating SWI jobs');

      const swiResult = await swiService.updateSWI(
        updatedTemplate,
        newMaterialRows,
        options.swiData,
        options.preservedData
      );

      updatedSWIJobIds = swiResult.jobIds || [];

      // Step 8b: Update material rows with ShapeID as tag (to match SWI) - BATCH UPDATE for performance
      if (swiResult.results && swiResult.results.length > 0) {
        logger.info('[TransactionCoordinator] Step 8b: Syncing ShapeIDs to material row tags (batch update)');

        // Filter valid results and build bulk operations
        const validResults = swiResult.results.filter(r => r.materialRowId && r.shapeId);

        if (validResults.length > 0) {
          const timestamp = getAustralianTimestamp();
          const bulkOps = validResults.map(result => ({
            updateOne: {
              filter: { _id: result.materialRowId },
              update: {
                $set: {
                  tag: result.shapeId,
                  status: 'completed',
                  swiJobId: result.jobId,
                  swiPushedAt: timestamp
                }
              }
            }
          }));

          try {
            const bulkResult = await MaterialRow.bulkWrite(bulkOps, { ordered: false });
            logger.info(`[TransactionCoordinator] Batch updated ${bulkResult.modifiedCount} material rows with ShapeIDs`);
          } catch (bulkError) {
            logger.warn(`[TransactionCoordinator] Bulk update failed:`, bulkError.message);
            // Don't throw - tag sync is non-critical
          }
        }
      }

      // Template swiJobIds already set from preserved data
      logger.info('[TransactionCoordinator] Updated SWI jobs, JobIDs:', updatedSWIJobIds);
    }

    // Step 9: Mark transaction as completed
    updatedTemplate.status = 'completed';
    updatedTemplate.processingCompletedAt = getAustralianTimestamp();
    await updatedTemplate.save();

    logger.info('[TransactionCoordinator] Update transaction completed successfully');

    return {
      template: updatedTemplate,
      materialRows: newMaterialRows,
      s3Keys: uploadedS3Keys,
      swiJobIds: updatedSWIJobIds
    };

  } catch (error) {
    logger.error('[TransactionCoordinator] Update transaction failed, initiating rollback', {
      error: error.message,
      templateId
    });

    // Rollback: Restore original material rows (S3/SWI rollback not needed for UPDATE)
    await rollbackUpdate(updatedTemplate, originalMaterialRows, newMaterialRows, uploadedS3Keys);

    const transactionError = new Error(`Update transaction failed: ${error.message}`);
    transactionError.originalError = error;
    transactionError.rollbackCompleted = true;
    throw transactionError;
  }
};

/**
 * Rollback update transaction
 * @param {Object} template - Template being updated
 * @param {Array<Object>} originalMaterialRows - Original material rows to restore
 * @param {Array<Object>} newMaterialRows - New material rows to delete
 * @param {Array<String>} s3Keys - Uploaded S3 keys to delete
 * @returns {Promise<void>}
 */
async function rollbackUpdate(template, originalMaterialRows, newMaterialRows, s3Keys = []) {
  logger.warn('[TransactionCoordinator] Starting update rollback');

  try {
    // Step 1: Delete new material rows
    if (newMaterialRows && newMaterialRows.length > 0) {
      const newRowIds = newMaterialRows.map(row => row._id);
      await MaterialRow.deleteMany({ _id: { $in: newRowIds } });
      logger.info(`[TransactionCoordinator] Rollback: Deleted ${newMaterialRows.length} new material rows`);
    }

    // Step 3: Restore original material rows
    if (originalMaterialRows && originalMaterialRows.length > 0) {
      // Remove MongoDB _id and timestamps to create fresh documents
      const rowsToRestore = originalMaterialRows.map(row => {
        const { _id, createdAt, updatedAt, __v, ...rowData } = row;
        return rowData;
      });

      await MaterialRow.insertMany(rowsToRestore);
      logger.info(`[TransactionCoordinator] Rollback: Restored ${rowsToRestore.length} original material rows`);
    }

    // Step 4: Mark template as failed
    if (template && template._id) {
      template.status = 'failed';
      template.errorMessage = 'Update transaction rolled back';
      await template.save();
      logger.info('[TransactionCoordinator] Rollback: Marked template as failed');
    }

    logger.info('[TransactionCoordinator] Update rollback completed successfully');
  } catch (rollbackError) {
    logger.error('[TransactionCoordinator] CRITICAL: Update rollback failed', {
      error: rollbackError.message,
      templateId: template?._id
    });
  }
}

/**
 * Re-push deleted SWI jobs for selected material rows (atomic transaction)
 * REFERENCE: swiDrawingCtrl.js:2612-3385
 *
 * @param {String} templateId - Template ID
 * @param {Array<Number>} rowIndices - Indices of material rows to repush (0-indexed)
 * @param {Object} swiData - { orderNumber, customerName, customerPoNumber, deliveryDate, enteredBy }
 * @returns {Promise<Object>} { template, newJobIds }
 * @throws {Error} If transaction fails (with rollback)
 */
exports.repushTemplateToSWI = async (templateId, rowIndices, swiData) => {
  let template = null;
  let materialRows = [];
  let newJobIds = [];
  let originalSwiJobIds = [];

  try {
    logger.info('[TransactionCoordinator] Starting REPUSH transaction', {
      templateId,
      rowIndices
    });

    // Step 1: Fetch template
    logger.info('[TransactionCoordinator] Step 1: Fetching template');
    template = await Template.findById(templateId);
    if (!template) {
      throw new Error(`Template not found: ${templateId}`);
    }

    // Step 2: Backup original swiJobIds (for rollback)
    originalSwiJobIds = [...(template.swiJobIds || [])];
    logger.info('[TransactionCoordinator] Backed up original JobIDs:', originalSwiJobIds);

    // Step 3: Fetch material rows
    logger.info('[TransactionCoordinator] Step 2: Fetching material rows');
    materialRows = await MaterialRow.find({ templateId }).sort({ createdAt: 1 });
    if (!materialRows.length) {
      throw new Error('No material rows found for template');
    }

    // Step 4: Mark transaction as processing
    template.status = 'processing';
    template.processingStartedAt = new Date();
    await template.save();

    // Step 5: Repush to SWI (with automatic rollback on failure)
    logger.info('[TransactionCoordinator] Step 3: Repushing to SWI');
    newJobIds = await swiService.repushToSWI(template, materialRows, rowIndices, swiData);

    logger.info(`[TransactionCoordinator] REPUSH completed, ${newJobIds.length} jobs created`);

    // Step 6: Update template.swiJobIds (replace at indices)
    const updatedJobIds = [...(template.swiJobIds || [])];
    let newJobIdIndex = 0;

    rowIndices.forEach(idx => {
      updatedJobIds[idx] = newJobIds[newJobIdIndex++];
    });

    template.swiJobIds = updatedJobIds;
    logger.info('[TransactionCoordinator] Updated template.swiJobIds:', updatedJobIds);

    // Step 7: Mark transaction as completed
    template.status = 'completed';
    template.processingCompletedAt = new Date();
    await template.save();

    logger.info('[TransactionCoordinator] REPUSH transaction completed successfully', {
      templateId: template._id,
      newJobIds,
      updatedSwiJobIds: template.swiJobIds
    });

    return {
      template,
      newJobIds
    };

  } catch (error) {
    logger.error('[TransactionCoordinator] REPUSH transaction failed', {
      error: error.message,
      templateId
    });

    // Rollback: Restore original swiJobIds in template
    // Note: SWI jobs rollback is already handled by swiService.repushToSWI
    if (template && originalSwiJobIds.length > 0) {
      try {
        template.swiJobIds = originalSwiJobIds;
        template.status = 'failed';
        template.errorMessage = `REPUSH failed: ${error.message}`;
        await template.save();
        logger.info('[TransactionCoordinator] Restored original template.swiJobIds');
      } catch (rollbackError) {
        logger.error('[TransactionCoordinator] Failed to restore template.swiJobIds:', rollbackError);
      }
    }

    // Re-throw error with transaction context
    const transactionError = new Error(`REPUSH transaction failed: ${error.message}`);
    transactionError.originalError = error;
    transactionError.rollbackCompleted = error.rollbackCompleted || false;
    throw transactionError;
  }
};

module.exports = exports;
