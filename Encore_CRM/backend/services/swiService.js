/**
 * SWI Service
 *
 * Handles integration with SWI (Sheet Metal Works Interface) manufacturing system.
 * SWI is a MS-SQL based system used by operators to manufacture sheet metal profiles.
 *
 * This service:
 * - Pushes template jobs to SWI database for manufacturing
 * - Handles geometry transformations (FAR/NEAR swap for tapers)
 * - Generates SWI-specific shape descriptors
 * - Supports rollback (deletes jobs from SWI on transaction failure)
 *
 * Created: Day 5 - November 22, 2025
 */

const sql = require('mssql');
const { logger } = require('../utils/logger');
const User = require('../models/userModel');

// Import SQL config from centralized config file
const swiConfig = require('../config/sqlConfig');

// SWI image path configuration (can be overridden via environment variable)
const SWI_IMAGE_PATH = process.env.SWI_IMAGE_PATH || 'C:\\SWI Engineering\\SWI Folder Interface\\Images';

// ============================================================================
// CONNECTION POOL MANAGEMENT
// ============================================================================

/**
 * Shared connection pool for better performance
 * Reuses connections instead of creating new ones for each request
 */
let sharedPool = null;

/**
 * Get or create a shared connection pool
 * @returns {Promise<Object>} MS-SQL connection pool
 */
async function getSharedPool() {
  if (sharedPool && sharedPool.connected) {
    return sharedPool;
  }

  // Close any existing disconnected pool
  if (sharedPool) {
    try {
      await sharedPool.close();
    } catch (err) {
      logger.debug('[getSharedPool] Error closing old pool:', err.message);
    }
  }

  // Create new pool
  sharedPool = new sql.ConnectionPool(swiConfig);
  await sharedPool.connect();
  logger.info('[getSharedPool] Created new shared connection pool');

  // Handle pool errors
  sharedPool.on('error', (err) => {
    logger.error('[sharedPool] Pool error:', err.message);
    sharedPool = null; // Reset pool on error so next request creates a new one
  });

  return sharedPool;
}

/**
 * Close the shared connection pool (for graceful shutdown)
 * @returns {Promise<void>}
 */
async function closeSharedPool() {
  if (sharedPool) {
    try {
      await sharedPool.close();
      sharedPool = null;
      logger.info('[closeSharedPool] Shared pool closed');
    } catch (err) {
      logger.error('[closeSharedPool] Error closing pool:', err.message);
    }
  }
}

/**
 * Health check for SWI database connection
 * @returns {Promise<Object>} Health status with connected flag and response time
 */
exports.healthCheck = async () => {
  const startTime = Date.now();
  try {
    const pool = await getSharedPool();
    const result = await pool.request().query('SELECT 1 AS healthy');
    const responseTime = Date.now() - startTime;

    return {
      connected: true,
      database: swiConfig.database,
      server: swiConfig.server,
      responseTimeMs: responseTime,
      timestamp: new Date().toISOString()
    };
  } catch (error) {
    const responseTime = Date.now() - startTime;
    logger.error('[healthCheck] SWI database health check failed:', error.message);

    return {
      connected: false,
      database: swiConfig.database,
      server: swiConfig.server,
      error: error.message,
      responseTimeMs: responseTime,
      timestamp: new Date().toISOString()
    };
  }
};

// Export pool management functions
exports.getSharedPool = getSharedPool;
exports.closeSharedPool = closeSharedPool;

// ============================================================================
// USER RESOLUTION
// ============================================================================

/**
 * Resolve user ID to full name for SWI EnteredBy/LastModifiedBy fields
 *
 * @param {String} userId - MongoDB user ID (ObjectId as string)
 * @returns {String} User's full name, email, or userId as fallback
 */
async function resolveUserName(userId) {
  if (!userId) {
    return 'SYSTEM';
  }

  // Check if it's a valid MongoDB ObjectId (24 hex characters)
  if (userId.match(/^[0-9a-fA-F]{24}$/)) {
    try {
      const user = await User.findById(userId);
      if (user) {
        const fullName = `${user.user_firstName || ''} ${user.user_lastName || ''}`.trim();
        const userName = fullName || user.user_Email || userId;
        logger.debug('[resolveUserName] Resolved userId to name:', { userId, userName });
        return userName;
      }
    } catch (err) {
      logger.warn('[resolveUserName] Failed to fetch user:', err.message);
    }
  }

  // Fallback: return userId as-is (might already be a name)
  return userId;
}

/**
 * Check if template already exists in SWI
 * Prevents duplicate job creation
 *
 * @param {Object} template - MongoDB template object
 * @throws {Error} If template already has SWI jobs
 */
exports.checkTemplateNotInSWI = async (template) => {
  if (template.swiJobIds && template.swiJobIds.length > 0) {
    logger.warn('[checkTemplateNotInSWI] Template already has SWI records:', template.swiJobIds);
    throw new Error(
      `Template already has ${template.swiJobIds.length} SWI job(s). ` +
      `JobIDs: ${template.swiJobIds.join(', ')}. ` +
      `Use UPDATE endpoint instead of INSERT.`
    );
  }
  logger.info('[checkTemplateNotInSWI] Template OK - no existing SWI jobs');
};

/**
 * Push template to SWI (create jobs in MS-SQL)
 * @param {Object} template - MongoDB template object
 * @param {Array<Object>} materialRows - Array of material row objects
 * @param {Object} swiData - { orderNumber, customerName, deliveryDate, enteredBy, customerPoNumber?, area?, suburb? }
 * @returns {Array<String>} jobIds - Array of created SWI job IDs
 */
exports.pushToSWI = async (template, materialRows, swiData) => {
  logger.info('[pushToSWI] Starting SWI push for template:', template._id);

  const jobIds = [];
  let pool = null;

  try {
    // Step 0: Check for duplicates
    logger.info('[pushToSWI] Step 0: Checking for duplicate SWI jobs');
    await this.checkTemplateNotInSWI(template);

    // Step 1: Connect to MS-SQL using shared pool (faster - no connection overhead)
    logger.info('[pushToSWI] Step 1: Getting shared SWI database connection');
    pool = await getSharedPool();
    logger.info('[pushToSWI] Got shared connection to SWI database');

    // Step 2: Verify customer exists in SWI
    logger.info('[pushToSWI] Step 2: Verifying customer in SWI');
    const customerName = swiData.customerName || template.customerName || '';
    const cleanCustomer = customerName.trim();

    if (!cleanCustomer) {
      throw new Error('Customer name is required for SWI push');
    }

    const customerCheck = await pool.request()
      .input('Customer', sql.NVarChar(64), cleanCustomer)
      .query(`SELECT 1 FROM dbo.Customers WHERE RTRIM(LTRIM(Customer)) = @Customer`);

    if (!customerCheck.recordset.length) {
      throw new Error(`Customer "${cleanCustomer}" not found in SWI database`);
    }
    logger.info('[pushToSWI] Customer verified:', cleanCustomer);
    // Step 3: Prepare geometry data
    logger.info('[pushToSWI] Step 3: Preparing geometry data');
    const geometryData = prepareGeometryData(template);
    logger.info('[pushToSWI] Geometry prepared:', {
      isTaper: template.isTaper,
      farTotal: geometryData.farTotal,
      nearTotal: geometryData.nearTotal
    });

    // Step 4: Prepare dates
    logger.info('[pushToSWI] Step 4: Preparing dates');
    const dates = prepareDates(swiData.deliveryDate);
    logger.info('[pushToSWI] Dates prepared');

    // Step 5: Group material rows and handle splits
    logger.info('[pushToSWI] Step 5: Processing material rows with split handling');
    const jobName = swiData.orderNumber || template.orderNumber || `ORDER_${Date.now()}`;
    const grouped = await processMaterialRowsWithSplits(template, materialRows, jobName, pool);
    logger.info('[pushToSWI] Grouped into', Object.keys(grouped).length, 'job entries');

    // Step 6: Calculate ShapeID counters for this push
    logger.info('[pushToSWI] Step 6: Calculating ShapeID counters');
    const tagCounters = await calculateShapeIdCounters(pool, jobName, grouped);
    const tagUsedInPush = {}; // Track which ShapeID to use for each tag in this push
    logger.info('[pushToSWI] ShapeID counters calculated');

    // Step 7: Process each grouped entry
    logger.info('[pushToSWI] Step 7: Creating SWI jobs');
    for (const key of Object.keys(grouped)) {
      const entry = grouped[key];
      logger.info(`[pushToSWI] Processing entry for tag: ${entry.tag}`);

      // NOTE: In CREATE mode, duplicate tags are handled by determineShapeId + tagCounters
      // which auto-suffixes tags (e.g., "1" becomes "1-1", "1-2" etc.)
      // So we do NOT block duplicates here - let the existing logic handle it

      // Generate JobID
      const jobId = await this.generateJobID(jobName, template.partClass, jobIds.length);
      logger.info(`[pushToSWI] Generated JobID: ${jobId}`);

      // Determine ShapeID for this entry
      const shapeId = determineShapeId(entry, tagCounters, tagUsedInPush);
      logger.info(`[pushToSWI] ShapeID: ${shapeId}`);
      // Create SWI job with enhanced parameters
      await insertJobToSWI(pool, {
        template,
        entry, // Use grouped entry instead of raw row
        jobId,
        jobName,
        customerName: cleanCustomer,
        geometryData,
        dates,
        enteredBy: swiData.enteredBy || 'SYSTEM',
        shapeId,
        swiData // Pass swiData for customerPoNumber, area, suburb
      });

      // Convert ObjectId to string if needed
      const materialRowIdStr = entry.materialRowId ? entry.materialRowId.toString() : null;
      jobIds.push({ jobId, shapeId, materialRowId: materialRowIdStr });
      logger.info(`[pushToSWI] Job created: ${jobId}, ShapeID: ${shapeId}, MaterialRowId: ${materialRowIdStr}`);

      // Step 8: Sync to MongoDB CRM (OrderItem or QuotationItem)
      try {
        logger.info(`[pushToSWI] Step 8: Syncing JobID ${jobId} to MongoDB CRM`);

        // Prepare material data for MongoDB sync
        // Use split-specific width if available, otherwise use template width
        // IMPORTANT: Use same calculation as insertJobToSWI to avoid rounding discrepancies
        let descriptorWidth = geometryData.widthValue;
        if (entry.isSplit && entry.splitFar && entry.splitNear) {
          // Use sum of interpolated lengths (already rounded) to match SQL Width calculation
          const splitFarTotal = entry.splitFar.reduce((sum, v) => sum + v, 0);
          const splitNearTotal = entry.splitNear.reduce((sum, v) => sum + v, 0);
          
          let adjustedFarTotal = splitFarTotal;
          let adjustedNearTotal = splitNearTotal;
          
          // Add fold lengths to match SQL Width calculation
          if (template.startFoldType === 'SF' || template.startFoldType === 'SSF') {
            adjustedFarTotal += template.startFoldLength || 0;
            adjustedNearTotal += template.startFoldLength || 0;
          }
          if (template.endFoldType === 'SF' || template.endFoldType === 'SSF') {
            adjustedFarTotal += template.endFoldLength || 0;
            adjustedNearTotal += template.endFoldLength || 0;
          }
          
          descriptorWidth = Math.max(adjustedFarTotal, adjustedNearTotal);
        }

        const materialData = {
          dbMaterial: entry.dbMaterial,
          dbColour: entry.dbColour,
          descriptorWidthValue: descriptorWidth,
          length: entry.length,
          totalQty: entry.totalQty,
          farAngles: geometryData.farAngles,
          splitInto: entry.splitTotal,
          shapeID: shapeId,
          unitPrice: entry.unitPrice || 0,
          extPrice: entry.extPrice || 0
        };

        // Determine if this is an Order (starts with "IN") or Quotation
        if (!jobName.startsWith("QT")) {
          // Order sync
          const orderResult = await this.updateOrCreateOrderItem(jobId, jobName, materialData, template);
          logger.info(`[pushToSWI] MongoDB OrderItem ${orderResult.action} for JobID: ${jobId}`);
        } else {
          // Quotation sync
          const quoteResult = await this.updateOrCreateQuotationItem(jobId, jobName, materialData, template);
          logger.info(`[pushToSWI] MongoDB QuotationItem ${quoteResult.action} for JobID: ${jobId}`);
        }
      } catch (mongoError) {
        logger.error(`[pushToSWI] MongoDB sync failed for JobID ${jobId}:`, mongoError.message);
        // Don't throw - we want to continue with other jobs even if MongoDB sync fails
        // The SWI job is already created, MongoDB sync is secondary
      }
    }

    // Don't close shared pool - it stays open for reuse
    logger.info('[pushToSWI] Successfully created', jobIds.length, 'SWI jobs');
    return jobIds;

  } catch (error) {
    logger.error('[pushToSWI] Error:', error);

    // Don't close shared pool - it stays open for reuse

    // Rollback any created jobs
    if (jobIds.length > 0) {
      logger.warn('[pushToSWI] Attempting rollback of', jobIds.length, 'jobs');
      // Extract just the jobId strings for rollback
      const jobIdStrings = jobIds.map(j => j.jobId);
      await this.rollbackSWIPush(jobIdStrings);
    }

    throw error;
  }
};

/**
 * Update existing SWI jobs (UPDATE mode)
 *
 * @param {Object} template - MongoDB template object
 * @param {Array<Object>} materialRows - Array of material row objects
 * @param {Object} swiData - { orderNumber, customerName, deliveryDate, enteredBy }
 * @param {Object} preservedData - { jobIds: [], enteredDate: Date, enteredBy: String, shapeIds: [], customTXT01?: String }
 * @returns {Array<String>} jobIds - Array of updated SWI job IDs
 *
 * NOTE: In UPDATE mode:
 * - EnteredBy is NOT updated (automatically preserved by not including in SET clause)
 * - EnteredDate is NOT updated (automatically preserved by not including in SET clause)
 * - CustomTXT01 uses preservedData.customTXT01 (original PO number)
 * - LastModifiedBy is updated to current user
 * - Updated timestamp is updated to current time
 */
exports.updateSWI = async (template, materialRows, swiData, preservedData) => {
  logger.info('[updateSWI] Starting SWI UPDATE for template:', template._id);

  const jobIds = preservedData.jobIds || [];
  let pool = null;

  try {
    // Step 1: Connect to MS-SQL using shared pool (faster - no connection overhead)
    logger.info('[updateSWI] Step 1: Getting shared SWI database connection');
    pool = await getSharedPool();
    logger.info('[updateSWI] Got shared connection to SWI database');

    // Step 1b: Fetch preserved values from SWI database
    logger.info('[updateSWI] Step 1b: Fetching preserved values from SWI');

    // Use parameterized query to prevent SQL injection
    const preservedRequest = pool.request();
    jobIds.forEach((id, index) => {
      preservedRequest.input(`jobId${index}`, sql.BigInt, id);
    });
    const jobIdPlaceholders = jobIds.map((_, i) => `@jobId${i}`).join(',');
    const originalDataResult = await preservedRequest.query(`
      SELECT ID, JobID, ShapeID, EnteredDate, EnteredBy, CustomTXT01
      FROM Jobs
      WHERE JobID IN (${jobIdPlaceholders})
      ORDER BY JobID
    `);

    if (originalDataResult.recordset.length === 0) {
      // Don't close shared pool
      return { success: false, error: 'SWI jobs not found in database. Use CREATE instead.' };
    }

    // Extract preserved values from first job (all jobs should have same values)
    const firstJob = originalDataResult.recordset[0];
    preservedData.enteredDate = firstJob.EnteredDate;
    preservedData.enteredBy = firstJob.EnteredBy;
    preservedData.customTXT01 = (swiData.customerPoNumber && swiData.customerPoNumber !== '0')
      ? swiData.customerPoNumber
      : (firstJob.CustomTXT01 || null);

    // Ensure swiData has resolved PO for new jobs created during edit (insertJobToSWI)
    if (!swiData.customerPoNumber || swiData.customerPoNumber === '0') {
      swiData.customerPoNumber = preservedData.customTXT01 || '';
    }

    preservedData.shapeIds = originalDataResult.recordset.map(row => row.ShapeID);
    preservedData.ids = originalDataResult.recordset.map(row => row.ID);

    logger.info('[updateSWI] Preserved values fetched:', {
      enteredDate: preservedData.enteredDate,
      enteredBy: preservedData.enteredBy,
      customTXT01: preservedData.customTXT01,
      customTXT01Source: (swiData.customerPoNumber && swiData.customerPoNumber !== '0') ? 'frontend' : 'SWI',
      shapeIdsCount: preservedData.shapeIds.length
    });

    // Step 2: Verify customer exists in SWI
    logger.info('[updateSWI] Step 2: Verifying customer in SWI');
    const customerName = swiData.customerName || template.customerName || '';
    const cleanCustomer = customerName.trim();

    if (!cleanCustomer) {
      throw new Error('Customer name is required for SWI update');
    }

    const customerCheck = await pool.request()
      .input('Customer', sql.NVarChar(64), cleanCustomer)
      .query(`SELECT 1 FROM dbo.Customers WHERE RTRIM(LTRIM(Customer)) = @Customer`);

    if (!customerCheck.recordset.length) {
      throw new Error(`Customer "${cleanCustomer}" not found in SWI database`);
    }
    logger.info('[updateSWI] Customer verified:', cleanCustomer);

    // Step 3: Prepare geometry data
    logger.info('[updateSWI] Step 3: Preparing geometry data');
    const geometryData = prepareGeometryData(template);
    logger.info('[updateSWI] Geometry prepared');

    // Step 4: Prepare dates
    logger.info('[updateSWI] Step 4: Preparing dates');
    const dates = prepareDates(swiData.deliveryDate);
    logger.info('[updateSWI] Dates prepared');

    // Step 5: Group material rows and handle splits
    logger.info('[updateSWI] Step 5: Processing material rows with split handling');
    const jobName = swiData.orderNumber || template.orderNumber || `ORDER_${Date.now()}`;
    const grouped = await processMaterialRowsWithSplits(template, materialRows, jobName, pool);
    logger.info('[updateSWI] Grouped into', Object.keys(grouped).length, 'job entries');

    // Step 6: Resolve user for UPDATE (LastModifiedBy = current, EnteredBy = preserved)
    logger.info('[updateSWI] Step 6: Resolving user for UPDATE mode');
    const enteredByUser = preservedData.enteredBy || 'SYSTEM';
    const lastModifiedByUser = await resolveUserName(swiData.enteredBy);
    logger.info('[updateSWI] UPDATE mode users:', { enteredByUser, lastModifiedByUser });

    // Step 7: Update each job in SWI
    logger.info('[updateSWI] Step 7: Updating jobs in SWI');

    // HYBRID APPROACH:
    // - Non-split drawings: Use swiJobId-based matching (handles row deletions correctly)
    // - Split drawings: Use index-based matching (they share the same swiJobId from MaterialRow)

    // Build lookup map from jobId to shapeId for non-split drawings
    const jobIdToShapeIdMap = {};
    originalDataResult.recordset.forEach(row => {
      jobIdToShapeIdMap[row.JobID.toString()] = row.ShapeID;
    });
    logger.info('[updateSWI] Built jobId->shapeId map:', Object.keys(jobIdToShapeIdMap).length, 'entries');

    let jobIndex = 0; // For index-based matching of split drawings
    const newlyCreatedJobIds = []; // Track new jobs created for additional split pieces
    const usedJobIds = new Set(); // Track which job IDs are being used (for cleanup)
    const finalShapeIds = []; // Track final computed shapeIds for each entry (for syncing back to MaterialRow)
    const finalJobIds = []; // Track final jobIds for each entry (for syncing swiJobId back to MaterialRow)

    for (const key of Object.keys(grouped)) {
      const entry = grouped[key];

      let jobId = null;
      let preservedShapeId = null;

      if (entry.isSplit) {
        // SPLIT DRAWINGS: Use index-based matching
        // Split drawings share the same swiJobId from MaterialRow, so we must use index
        jobId = jobIds[jobIndex] || null;
        preservedShapeId = preservedData.shapeIds?.[jobIndex];
        logger.info(`[updateSWI] Split: Using index-based matching: jobIndex=${jobIndex}, jobId=${jobId}, preservedShapeId=${preservedShapeId}`);
      } else {
        // NON-SPLIT DRAWINGS: Use swiJobId-based matching
        // This correctly matches rows to jobs even after deletions
        jobId = entry.swiJobId || null;
        preservedShapeId = jobId ? jobIdToShapeIdMap[jobId.toString()] : null;
        logger.info(`[updateSWI] Non-split: Using swiJobId-based matching: swiJobId=${entry.swiJobId}, jobId=${jobId}, preservedShapeId=${preservedShapeId}`);
      }

      // Track used job IDs for cleanup
      if (jobId) {
        usedJobIds.add(jobId.toString());
      }

      let shapeId;

      if (entry.isSplit) {
        // For split drawings: Check if we're editing existing splits or converting from non-split
        // entry.tag = "A-7" or "A-8" (auto-generated split tags from processMaterialRowsWithSplits)
        // entry.originalTag = "A" (the base tag user entered)
        // entry.splitPiece = 1, 2, 3... (which split piece this is)
        // preservedShapeId = actual tag from SWI (e.g., "A-13", "A-14" for existing splits)

        const currentBaseTag = entry.originalTag || entry.tag.replace(/-\d+$/, '');

        // Check if preservedShapeId is an existing split tag with the SAME base tag
        // This handles cases where split numbers aren't sequential from 1 (e.g., "1-13", "1-14", "1-15", "1-16")
        const preservedBaseTag = preservedShapeId ? preservedShapeId.replace(/-\d+$/, '') : null;
        const preservedHasSplitSuffix = preservedShapeId && /-\d+$/.test(preservedShapeId);

        // Preserve existing tag if:
        // 1. preservedShapeId exists
        // 2. It has a split suffix (e.g., "-13")
        // 3. The base tag matches what user has now (user didn't change the tag)
        const shouldPreserveTag = preservedShapeId && preservedHasSplitSuffix && preservedBaseTag === currentBaseTag;

        if (shouldPreserveTag) {
          // Editing existing splits with same base tag - preserve the original ShapeID
          shapeId = preservedShapeId;
          logger.info(`[updateSWI] Preserving existing split tag: ${shapeId} (base tag unchanged: ${currentBaseTag})`);
        } else {
          // Either:
          // - Converting from non-split to split (preservedShapeId has no suffix)
          // - User changed the base tag (preservedBaseTag !== currentBaseTag)
          // - No preserved data (new job)
          // Use the new split tag generated by processMaterialRowsWithSplits
          shapeId = entry.tag;
          logger.info(`[updateSWI] Using new split tag: ${entry.tag} (preserved=${preservedShapeId}, preservedBase=${preservedBaseTag}, currentBase=${currentBaseTag})`);
        }
      } else {
        // For non-split: Check if user changed the tag and handle duplicates
        const tagChanged = entry.tag && preservedShapeId && entry.tag !== preservedShapeId;

        if (tagChanged) {
          // User changed the tag - need to check for duplicates in SWI
          // IMPORTANT: Exclude ALL of this template's existing jobs, not just the current one
          // This handles split→non-split conversion where old split jobs (1-1, 1-2, etc.) still exist

          // Build exclusion list for ALL this template's job IDs
          let excludeClause = '';
          const duplicateRequest = pool.request()
            .input('JobName', sql.NVarChar(64), jobName)
            .input('Tag', sql.NVarChar(64), entry.tag)
            .input('TagPattern', sql.NVarChar(64), `${entry.tag}-%`);

          if (jobIds && jobIds.length > 0) {
            // Exclude all of this template's existing jobs
            const jobIdPlaceholders = jobIds.map((id, idx) => {
              duplicateRequest.input(`ExcludeJobId${idx}`, sql.BigInt, id);
              return `@ExcludeJobId${idx}`;
            }).join(',');
            excludeClause = `AND JobID NOT IN (${jobIdPlaceholders})`;
          } else if (jobId) {
            // Fallback: at least exclude current job
            duplicateRequest.input('CurrentJobId', sql.BigInt, jobId);
            excludeClause = 'AND JobID != @CurrentJobId';
          }

          const duplicateCheck = await duplicateRequest.query(`
            SELECT ShapeID FROM Jobs
            WHERE JobName = @JobName
            AND (ShapeID = @Tag OR ShapeID LIKE @TagPattern)
            ${excludeClause}
          `);

          if (duplicateCheck.recordset.length > 0) {
            // Tag already exists in OTHER templates - find the highest counter and add suffix
            const existingShapeIds = duplicateCheck.recordset.map(row => row.ShapeID);
            let maxCounter = 0;

            // Check if base tag exists
            if (existingShapeIds.includes(entry.tag)) {
              maxCounter = 1;
            }

            // Find highest counter from existing suffixed tags
            const escapedTag = entry.tag.replace(/[-[\]{}()*+?.,\\^$|#\s]/g, '\\$&');
            existingShapeIds.forEach(sid => {
              const match = sid.match(new RegExp(`^${escapedTag}-(\\d+)$`));
              if (match) {
                maxCounter = Math.max(maxCounter, parseInt(match[1]) + 1);
              }
            });

            // Generate unique shapeId with suffix
            shapeId = maxCounter > 0 ? `${entry.tag}-${maxCounter}` : entry.tag;
            logger.info(`[updateSWI] Tag "${entry.tag}" exists in other templates, using "${shapeId}"`);
          } else {
            // No duplicate in other templates - use the new tag as-is
            shapeId = entry.tag;
            logger.info(`[updateSWI] Using tag "${shapeId}" (no duplicates in other templates)`);
          }
        } else {
          // Tag not changed or no preserved shapeId - use current tag
          shapeId = entry.tag || preservedShapeId;
        }
      }

      if (!jobId) {
        // No existing job - CREATE a new one (e.g., when converting taper to split)
        logger.info('[updateSWI] No preserved JobID for entry:', key, '- CREATING new job');

        // Generate new JobID
        const newJobId = await this.generateJobID(jobName, template.partClass, jobIds.length + newlyCreatedJobIds.length);
        logger.info(`[updateSWI] Generated new JobID: ${newJobId} for entry: ${entry.tag}`);

        // Check for duplicate tags before creating new job (same logic as create mode)
        const duplicateCheckForNew = await pool.request()
          .input('JobName', sql.NVarChar(64), jobName)
          .input('Tag', sql.NVarChar(64), entry.tag)
          .input('TagPattern', sql.NVarChar(64), `${entry.tag}-%`)
          .query(`
            SELECT ShapeID FROM Jobs
            WHERE JobName = @JobName
            AND (ShapeID = @Tag OR ShapeID LIKE @TagPattern)
          `);

        if (duplicateCheckForNew.recordset.length > 0) {
          // Tag already exists - find the highest counter and add suffix
          const existingShapeIds = duplicateCheckForNew.recordset.map(row => row.ShapeID);
          let maxCounter = 0;

          // Check if base tag exists
          if (existingShapeIds.includes(entry.tag)) {
            maxCounter = 1;
          }

          // Find highest counter from existing suffixed tags
          const escapedTag = entry.tag.replace(/[-[\]{}()*+?.,\\^$|#\s]/g, '\\$&');
          existingShapeIds.forEach(sid => {
            const match = sid.match(new RegExp(`^${escapedTag}-(\\d+)$`));
            if (match) {
              maxCounter = Math.max(maxCounter, parseInt(match[1]) + 1);
            }
          });

          // Generate unique shapeId with suffix
          shapeId = maxCounter > 0 ? `${entry.tag}-${maxCounter}` : entry.tag;
          logger.info(`[updateSWI] New job duplicate detected, using unique shapeId: ${shapeId}`);
        } else {
          // No duplicate - use the tag as-is
          shapeId = entry.tag;
        }

        // IMPORTANT: Use same calculation as insertJobToSWI to avoid rounding discrepancies
        let descriptorWidth = geometryData.widthValue;
        if (entry.isSplit && entry.splitFar && entry.splitNear) {
          // Use sum of interpolated lengths (already rounded) to match SQL Width calculation
          const splitFarTotal = entry.splitFar.reduce((sum, v) => sum + v, 0);
          const splitNearTotal = entry.splitNear.reduce((sum, v) => sum + v, 0);
          
          let adjustedFarTotal = splitFarTotal;
          let adjustedNearTotal = splitNearTotal;
          
          // Add fold lengths to match SQL Width calculation
          if (template.startFoldType === 'SF' || template.startFoldType === 'SSF') {
            adjustedFarTotal += template.startFoldLength || 0;
            adjustedNearTotal += template.startFoldLength || 0;
          }
          if (template.endFoldType === 'SF' || template.endFoldType === 'SSF') {
            adjustedFarTotal += template.endFoldLength || 0;
            adjustedNearTotal += template.endFoldLength || 0;
          }
          
          descriptorWidth = Math.max(adjustedFarTotal, adjustedNearTotal);
        }

        // INSERT new job to SWI
        await insertJobToSWI(pool, {
          template,
          entry,
          jobId: newJobId,
          jobName,
          customerName: cleanCustomer,
          geometryData,
          dates,
          enteredBy: enteredByUser,
          shapeId,
          swiData
        });

        // Track the new job
        newlyCreatedJobIds.push({ jobId: newJobId, shapeId, materialRowId: entry.materialRowId });

        // Sync to MongoDB CRM for the new job
        try {
          const materialData = {
            dbMaterial: entry.dbMaterial,
            dbColour: entry.dbColour,
            descriptorWidthValue: descriptorWidth,
            length: entry.length,
            totalQty: entry.totalQty,
            splitInto: entry.splitTotal,
            farAngles: geometryData.farAngles,
            shapeID: shapeId,
            unitPrice: entry.unitPrice || 0,
            extPrice: entry.extPrice || 0
          };

          if (!jobName.startsWith("QT")) {
            await this.updateOrCreateOrderItem(newJobId, jobName, materialData, template);
          } else {
            await this.updateOrCreateQuotationItem(newJobId, jobName, materialData, template);
          }
        } catch (mongoError) {
          logger.error(`MongoDB sync failed for new JobID ${newJobId}:`, mongoError.message);
        }

        // Track final shapeId and jobId for this entry (for syncing back to MaterialRow)
        finalShapeIds.push(shapeId);
        finalJobIds.push(newJobId);
        usedJobIds.add(newJobId.toString());
        jobIndex++;
        continue;
      }

      logger.info(`[updateSWI] Updating job for entry tag=${entry.tag}:`, {
        jobId,
        entryTag: entry.tag,
        preservedShapeId,
        finalShapeId: shapeId,
        isSplit: entry.isSplit,
        material: entry.dbMaterial,
        color: entry.dbColour
      });

      // Calculate descriptor width
      // IMPORTANT: Use same calculation as insertJobToSWI to avoid rounding discrepancies
      let descriptorWidth = geometryData.widthValue;
      if (entry.isSplit && entry.splitFar && entry.splitNear) {
        // Use sum of interpolated lengths (already rounded) to match SQL Width calculation
        const splitFarTotal = entry.splitFar.reduce((sum, v) => sum + v, 0);
        const splitNearTotal = entry.splitNear.reduce((sum, v) => sum + v, 0);
        
        let adjustedFarTotal = splitFarTotal;
        let adjustedNearTotal = splitNearTotal;
        
        if (template.startFoldType === 'SF' || template.startFoldType === 'SSF') {
          adjustedFarTotal += template.startFoldLength || 0;
          adjustedNearTotal += template.startFoldLength || 0;
        }
        if (template.endFoldType === 'SF' || template.endFoldType === 'SSF') {
          adjustedFarTotal += template.endFoldLength || 0;
          adjustedNearTotal += template.endFoldLength || 0;
        }
        
        descriptorWidth = Math.max(adjustedFarTotal, adjustedNearTotal);
      }

      // UPDATE job to SWI
      await updateJobToSWI(
        pool,
        template,
        entry,
        geometryData,
        dates,
        jobName,
        cleanCustomer,
        jobId,
        shapeId,
        enteredByUser,
        lastModifiedByUser,
        preservedData.enteredDate,
        preservedData
      );

      // Step 8: Sync to MongoDB CRM
      try {
        const materialData = {
          dbMaterial: entry.dbMaterial,
          dbColour: entry.dbColour,
          descriptorWidthValue: descriptorWidth,
          length: entry.length,
          totalQty: entry.totalQty,
          splitInto: entry.splitTotal,
          farAngles: geometryData.farAngles,
          shapeID: shapeId,
          unitPrice: entry.unitPrice || 0,
          extPrice: entry.extPrice || 0
        };

        if (!jobName.startsWith("QT")) {
          await this.updateOrCreateOrderItem(jobId, jobName, materialData, template);
        } else {
          await this.updateOrCreateQuotationItem(jobId, jobName, materialData, template);
        }
      } catch (mongoError) {
        logger.error(`MongoDB sync failed for JobID ${jobId}:`, mongoError.message);
        // Don't throw - continue with other jobs
      }

      // Track final shapeId and jobId for this entry (for syncing back to MaterialRow)
      finalShapeIds.push(shapeId);
      finalJobIds.push(jobId);
      jobIndex++;
    }

    // Step 8b: Add newly created job IDs to the main jobIds array
    if (newlyCreatedJobIds.length > 0) {
      logger.info(`[updateSWI] Step 8b: Adding ${newlyCreatedJobIds.length} newly created jobs to jobIds array`);
      for (const newJob of newlyCreatedJobIds) {
        jobIds.push(newJob.jobId);
      }

      // Update template.swiJobIds in MongoDB to include new jobs
      const Template = require('../models/templateModel');
      await Template.findByIdAndUpdate(template._id, { swiJobIds: jobIds });
      logger.info('[updateSWI] Updated template.swiJobIds with new jobs:', jobIds);
    }

    // Step 9: DELETE unused jobs if material rows were removed
    // Use usedJobIds set to determine which jobs are still needed (handles non-split deletions correctly)
    const groupedCount = Object.keys(grouped).length;
    const jobsToDelete = jobIds.filter(id => !usedJobIds.has(id.toString()));

    // DEBUG: Log critical values to trace the issue
    logger.info('[updateSWI] DEBUG - Before cleanup:', {
      inputJobIdsCount: preservedData.jobIds?.length || 0,
      inputJobIds: preservedData.jobIds,
      groupedEntriesCount: groupedCount,
      groupedEntries: Object.keys(grouped).map(k => ({
        key: k,
        tag: grouped[k].tag,
        isSplit: grouped[k].isSplit,
        swiJobId: grouped[k].swiJobId
      })),
      usedJobIdsCount: usedJobIds.size,
      usedJobIds: Array.from(usedJobIds),
      currentJobIds: jobIds,
      jobsToDeleteCount: jobsToDelete.length,
      jobsToDelete: jobsToDelete
    });

    if (jobsToDelete.length > 0) {
      logger.info(`[updateSWI] Step 9: Deleting ${jobsToDelete.length} unused jobs (rows removed)`);
      logger.info('[updateSWI] Jobs to delete:', jobsToDelete);
      logger.info('[updateSWI] Used job IDs:', Array.from(usedJobIds));

      // Delete from SWI
      const deleteRequest = pool.request();
      const placeholders = jobsToDelete.map((id, index) => {
        deleteRequest.input(`delJobId${index}`, sql.BigInt, id);
        return `@delJobId${index}`;
      }).join(',');

      await deleteRequest.query(`DELETE FROM Jobs WHERE JobID IN (${placeholders})`);
      logger.info('[updateSWI] Deleted jobs from SWI');

      // Delete from MongoDB (OrderItem or QuotationItem) - batch delete for performance
      const OrderItem = require('../models/orderitemModel');
      const QuotationItem = require('../models/quotationitemModel');
      const OrderMaster = require('../models/ordermasterModel');
      const QuotationMaster = require('../models/quotationmasterModel');
      const { RecalculateOverallOrderTotalFn, RecalculateOrderItemsCountFn, RecalculateOverallQuotesTotalFn } = require('../controllers/ordermanagementCtrl');

      // Convert job IDs to strings for MongoDB query
      const jobIdsToDelete = jobsToDelete.map(id => id.toString());

      try {
        if (!jobName.startsWith("QT")) {
          const deleteResult = await OrderItem.deleteMany({ order_item_unique_id: { $in: jobIdsToDelete } });
          logger.info(`[updateSWI] Batch deleted ${deleteResult.deletedCount} OrderItems`);
          if (deleteResult.deletedCount !== 0) {
            const AWF_CUST_ID = process.env.AWF_CUSTOMER_ID;
            const ordMasDetails = await OrderMaster.aggregate([
              { $match: {
                $expr: {
                  $or: [
                    { $eq: [ "$order_unique_id", jobName ] },
                    {
                      $and: [
                        { $eq: [ "$order_customer_UID", AWF_CUST_ID ] },
                        { $eq: [{ $substr: [ "$order_customer_PO_number", 0, 6 ] }, jobName ]}
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
        } else {
          const deleteResult = await QuotationItem.deleteMany({ quote_item_unique_id: { $in: jobIdsToDelete } });
          logger.info(`[updateSWI] Batch deleted ${deleteResult.deletedCount} QuotationItems`);
          if (deleteResult.deletedCount !== 0) {
            const quoteMasDetails = await QuotationMaster.findOne({ quote_unique_id: jobName });
            if (quoteMasDetails) {
              await RecalculateOverallQuotesTotalFn(quoteMasDetails._id);
              logger.info('[updateSWI] Recalculated quote totals after batch deletion');
            }
          }
        }
      } catch (deleteError) {
        logger.error(`[updateSWI] Error batch deleting MongoDB items:`, deleteError.message);
      }

      // Update the jobIds array to reflect deletions (filter out deleted ones)
      const remainingJobIds = jobIds.filter(id => usedJobIds.has(id.toString()));

      // Update template.swiJobIds in MongoDB to match the remaining jobIds
      const Template = require('../models/templateModel');
      await Template.findByIdAndUpdate(template._id, { swiJobIds: remainingJobIds });
      logger.info('[updateSWI] Updated template.swiJobIds in MongoDB:', remainingJobIds);
    }

    // Don't close shared pool - it stays open for reuse by other requests
    logger.info('[updateSWI] Successfully processed SWI jobs:', {
      updated: groupedCount - newlyCreatedJobIds.length,
      created: newlyCreatedJobIds.length,
      total: groupedCount
    });

    // Return results with shapeId mappings for tag sync
    // Use finalShapeIds and finalJobIds which contain the actual computed values after HYBRID matching
    const results = Object.keys(grouped).map((key, idx) => ({
      jobId: finalJobIds[idx],
      shapeId: finalShapeIds[idx] || grouped[key].tag,
      materialRowId: grouped[key].materialRowId,
      isSplit: grouped[key].isSplit || false
    }));

    return { success: true, jobIds, results, newlyCreatedJobIds };

  } catch (error) {
    logger.error('[updateSWI] Error:', error);
    // Don't close shared pool - it stays open for reuse by other requests
    return { success: false, error: error.message };
  }
};

/**
 * Delete SWI jobs and MongoDB items (used when material rows are removed)
 *
 * This is different from rollbackSWIPush():
 * - Deletes from MS-SQL Jobs table
 * - Deletes from MongoDB OrderItem/QuotationItem
 * - Recalculates order/quote totals
 *
 * @param {Array<String>} jobIds - Array of SWI job IDs to delete
 * @param {String} jobName - Order/Quote number (e.g., "IN123")
 * @returns {Promise<void>}
 */
exports.deleteSWIJobs = async (jobIds, jobName) => {
  logger.info('[deleteSWIJobs] Deleting SWI jobs and MongoDB items:', { jobIds, jobName });

  if (!jobIds || jobIds.length === 0) {
    logger.info('[deleteSWIJobs] No jobs to delete');
    return;
  }

  const OrderItem = require('../models/orderitemModel');
  const QuotationItem = require('../models/quotationitemModel');
  const OrderMaster = require('../models/ordermasterModel');
  const QuotationMaster = require('../models/quotationmasterModel');
  const { RecalculateOverallOrderTotalFn, RecalculateOrderItemsCountFn, RecalculateOverallQuotesTotalFn } = require('../controllers/ordermanagementCtrl');

  let pool = null;

  try {
    // Step 1: Delete from MS-SQL SWI Jobs table - use shared pool
    pool = await getSharedPool();
    logger.info('[deleteSWIJobs] Got shared connection to SWI database');

    const request = pool.request();
    const placeholders = jobIds.map((id, index) => {
      request.input(`jobId${index}`, sql.BigInt, id);
      return `@jobId${index}`;
    }).join(',');

    const deleteResult = await request.query(`
      DELETE FROM Jobs
      WHERE JobID IN (${placeholders})
    `);

    // Don't close shared pool - it stays open for reuse by other requests
    logger.info(`[deleteSWIJobs] Deleted ${deleteResult.rowsAffected[0]} jobs from SWI database`);

    // Step 2: Delete from MongoDB (OrderItem or QuotationItem)
    if (!jobName.startsWith("QT")) {
      // Delete OrderItems
      const mongoDeleteResult = await OrderItem.deleteMany({
        order_item_unique_id: { $in: jobIds }
      });
      logger.info(`[deleteSWIJobs] Deleted ${mongoDeleteResult.deletedCount} OrderItems from MongoDB`);

      // Step 3: Recalculate order totals
      if (mongoDeleteResult.deletedCount !== 0) {
        const AWF_CUST_ID = process.env.AWF_CUSTOMER_ID;
        const ordMasDetails = await OrderMaster.aggregate([
          { $match: {
            $expr: {
              $or: [
                { $eq: [ "$order_unique_id", jobName ] },
                {
                  $and: [
                    { $eq: [ "$order_customer_UID", AWF_CUST_ID ] },
                    { $eq: [{ $substr: [ "$order_customer_PO_number", 0, 6 ] }, jobName ]}
                  ]
                }
              ]
            }
          }}
        ]).then(results => results[0]);
        if (ordMasDetails) {
          await RecalculateOverallOrderTotalFn(ordMasDetails._id);
          await RecalculateOrderItemsCountFn(ordMasDetails._id);
          logger.info('[deleteSWIJobs] Recalculated order totals after deletion');
        }
      }
    } else {
      // Delete QuotationItems
      const mongoDeleteResult = await QuotationItem.deleteMany({
        quote_item_unique_id: { $in: jobIds }
      });
      logger.info(`[deleteSWIJobs] Deleted ${mongoDeleteResult.deletedCount} QuotationItems from MongoDB`);

      // Step 3: Recalculate quotation totals
      if (mongoDeleteResult.deletedCount !== 0) {
        const quoteMasDetails = await QuotationMaster.findOne({ quote_unique_id: jobName });
        if (quoteMasDetails) {
          await RecalculateOverallQuotesTotalFn(quoteMasDetails._id);
          logger.info('[deleteSWIJobs] Recalculated quotation totals after deletion');
        }
      }
    }

    logger.info('[deleteSWIJobs] Successfully deleted jobs and recalculated totals');

  } catch (error) {
    logger.error('[deleteSWIJobs] Error:', error);
    // Don't close shared pool - it stays open for reuse by other requests
    throw error;
  }
};

/**
 * Re-push deleted jobs for selected material rows (with atomic transaction)
 * REFERENCE: swiDrawingCtrl.js:2612-3385
 *
 * This operation re-creates SWI jobs that were previously deleted.
 * Unlike INSERT, it:
 * - Only processes SELECTED material rows (via rowIndices)
 * - Uses collision-aware JobID generation (checks both MS-SQL and MongoDB)
 * - Replaces old JobIDs in template.swiJobIds at specified indices
 * - Does NOT sync to MongoDB CRM (matching original behavior)
 *
 * @param {Object} template - Template object
 * @param {Array<Object>} materialRows - ALL material rows for the template
 * @param {Array<Number>} rowIndices - Indices of rows to repush (0-indexed)
 * @param {Object} swiData - { orderNumber, customerName, customerPoNumber, deliveryDate, enteredBy }
 * @returns {Promise<Array<String>>} Array of new JobIDs created
 * @throws {Error} If repush fails (with automatic rollback)
 */
exports.repushToSWI = async (template, materialRows, rowIndices, swiData) => {
  const createdJobIds = [];
  let pool = null;

  try {
    logger.info('[repushToSWI] Starting REPUSH operation', {
      templateId: template._id,
      rowIndices,
      rowCount: rowIndices.length
    });

    // Step 1: Validate rowIndices
    if (!rowIndices || !Array.isArray(rowIndices) || rowIndices.length === 0) {
      throw new Error('Row indices array is required and must not be empty');
    }

    // Step 2: Filter rows to repush
    const rowsToRepush = materialRows.filter((row, idx) => rowIndices.includes(idx));

    if (rowsToRepush.length === 0) {
      throw new Error('No valid rows found for the specified indices');
    }

    logger.info(`[repushToSWI] Found ${rowsToRepush.length} rows to repush`);

    // Step 3: Connect to SWI database (use shared pool like pushToSWI)
    pool = await getSharedPool();
    logger.info('[repushToSWI] Got shared connection to SWI database');

    // Step 4: Verify customer exists
    const cleanCustomer = (swiData.customerName || template.customerName || '').trim();
    if (!cleanCustomer) {
      throw new Error('Customer name is required');
    }

    const customerCheck = await pool.request()
      .input('Customer', sql.NVarChar(64), cleanCustomer)
      .query('SELECT 1 FROM dbo.Customers WHERE RTRIM(LTRIM(Customer)) = @Customer');

    if (customerCheck.recordset.length === 0) {
      throw new Error(`Customer "${cleanCustomer}" not found in SWI database`);
    }

    logger.info('[repushToSWI] Customer verified:', cleanCustomer);

    // Step 5: Get PO number (CustomTXT01 fallback chain)
    let finalPoNumber = swiData.customerPoNumber;

    if (!finalPoNumber || finalPoNumber === '0') {
      finalPoNumber = template.customTXT01;

      if ((!finalPoNumber || finalPoNumber === '0') && (swiData.orderNumber || template.orderNumber)) {
        const ordNum = swiData.orderNumber || template.orderNumber;
        const orderType = ordNum.startsWith('IN') ? 'order' : 'quote';
        const OrderModel = orderType === 'order'
          ? require('../models/ordermasterModel')
          : require('../models/quotationmasterModel');

        try {
          const order = await OrderModel.findOne({
            [orderType === 'order' ? 'order_unique_id' : 'quote_unique_id']: ordNum
          });

          if (order) {
            finalPoNumber = orderType === 'order'
              ? order.order_customer_PO_number
              : order.quote_customer_PO_number;
          }
        } catch (err) {
          logger.warn('[repushToSWI] Could not fetch PO from order:', err.message);
        }
      }
    }

    logger.info('[repushToSWI] PO number resolved:', finalPoNumber || 'null');

    // Step 6: Prepare geometry and dates
    const geometryData = await prepareGeometryData(template, materialRows);
    const dates = prepareDates(swiData.deliveryDate, swiData.enteredDate);
    const jobName = swiData.orderNumber || template.orderNumber || `ORDER_${Date.now()}`;

    // Step 7: Resolve user name
    const enteredByUser = await resolveUserName(swiData.enteredBy);
    const lastModifiedByUser = enteredByUser;

    logger.info('[repushToSWI] User resolved:', enteredByUser);

    // Step 8: Process rows using same approach as pushToSWI
    // Use processMaterialRowsWithSplits to handle splits properly (same as CREATE flow)
    logger.info('[repushToSWI] Step 8: Processing rows with split handling (same as pushToSWI)');
    const grouped = await processMaterialRowsWithSplits(template, rowsToRepush, jobName, pool);
    logger.info(`[repushToSWI] Grouped into ${Object.keys(grouped).length} job entries`);

    // Step 9: Calculate ShapeID counters (same as pushToSWI)
    logger.info('[repushToSWI] Step 9: Calculating ShapeID counters');
    const tagCounters = await calculateShapeIdCounters(pool, jobName, grouped);
    const tagUsedInPush = {};
    logger.info('[repushToSWI] ShapeID counters calculated');

    // Step 10: Process each grouped entry and insert to SWI (same as pushToSWI)
    logger.info('[repushToSWI] Step 10: Creating SWI jobs');
    const jobResults = []; // Match pushToSWI return format: {jobId, shapeId, materialRowId}

    for (const key of Object.keys(grouped)) {
      const entry = grouped[key];
      logger.info(`[repushToSWI] Processing entry for tag: ${entry.tag}`);

      // Generate JobID (same as pushToSWI)
      const jobId = await exports.generateJobID(jobName, template.partClass, createdJobIds.length);
      logger.info(`[repushToSWI] Generated JobID: ${jobId}`);

      // Determine ShapeID using same logic as pushToSWI
      const shapeId = determineShapeId(entry, tagCounters, tagUsedInPush);
      logger.info(`[repushToSWI] ShapeID: ${shapeId}`);

      // Insert job to SWI
      await insertJobToSWI(pool, {
        template,
        entry,
        jobId,
        jobName,
        customerName: cleanCustomer,
        geometryData,
        dates,
        enteredBy: enteredByUser,
        shapeId,
        swiData: { customerPoNumber: finalPoNumber }
      });

      // Convert ObjectId to string if needed (same as pushToSWI)
      const materialRowIdStr = entry.materialRowId ? entry.materialRowId.toString() : null;
      createdJobIds.push(jobId);
      jobResults.push({ jobId, shapeId, materialRowId: materialRowIdStr });
      logger.info(`[repushToSWI] Created job: ${jobId}, ShapeID: ${shapeId}, MaterialRowId: ${materialRowIdStr}`);

      // Step 11: Sync to MongoDB CRM (same as pushToSWI)
      try {
        logger.info(`[repushToSWI] Step 11: Syncing JobID ${jobId} to MongoDB CRM`);

        // Prepare material data for MongoDB sync (same calculation as pushToSWI)
        let descriptorWidth = geometryData.widthValue;
        if (entry.isSplit && entry.splitFar && entry.splitNear) {
          const splitFarTotal = entry.splitFar.reduce((sum, v) => sum + v, 0);
          const splitNearTotal = entry.splitNear.reduce((sum, v) => sum + v, 0);

          let adjustedFarTotal = splitFarTotal;
          let adjustedNearTotal = splitNearTotal;

          // Add fold lengths to match SQL Width calculation
          if (template.startFoldType === 'SF' || template.startFoldType === 'SSF') {
            adjustedFarTotal += template.startFoldLength || 0;
            adjustedNearTotal += template.startFoldLength || 0;
          }
          if (template.endFoldType === 'SF' || template.endFoldType === 'SSF') {
            adjustedFarTotal += template.endFoldLength || 0;
            adjustedNearTotal += template.endFoldLength || 0;
          }

          descriptorWidth = Math.max(adjustedFarTotal, adjustedNearTotal);
        }

        const materialData = {
          dbMaterial: entry.dbMaterial,
          dbColour: entry.dbColour,
          descriptorWidthValue: descriptorWidth,
          length: entry.length,
          totalQty: entry.totalQty,
          splitInto: entry.splitTotal,
          farAngles: geometryData.farAngles,
          shapeID: shapeId,
          unitPrice: entry.unitPrice || 0,
          extPrice: entry.extPrice || 0
        };

        // Determine if this is an Order (starts with "IN") or Quotation
        if (!jobName.startsWith("QT")) {
          // Order sync
          const orderResult = await exports.updateOrCreateOrderItem(jobId, jobName, materialData, template);
          logger.info(`[repushToSWI] MongoDB OrderItem ${orderResult.action} for JobID: ${jobId}`);
        } else {
          // Quotation sync
          const quoteResult = await exports.updateOrCreateQuotationItem(jobId, jobName, materialData, template);
          logger.info(`[repushToSWI] MongoDB QuotationItem ${quoteResult.action} for JobID: ${jobId}`);
        }
      } catch (mongoError) {
        logger.error(`[repushToSWI] MongoDB sync failed for JobID ${jobId}:`, mongoError.message);
        // Don't throw - continue with other jobs even if MongoDB sync fails
      }
    }

    // Don't close shared pool - it stays open for reuse (same as pushToSWI)
    logger.info('[repushToSWI] REPUSH completed successfully', {
      templateId: template._id,
      jobsCreated: createdJobIds.length,
      jobIds: createdJobIds
    });

    return createdJobIds;

  } catch (error) {
    logger.error('[repushToSWI] REPUSH failed, initiating rollback', {
      error: error.message,
      createdJobIds
    });

    // Don't close shared pool - it stays open for reuse

    // Rollback: Delete all created jobs
    if (createdJobIds.length > 0) {
      try {
        await rollbackSWIPush(createdJobIds);
        logger.info('[repushToSWI] Rollback completed successfully');
      } catch (rollbackError) {
        logger.error('[repushToSWI] CRITICAL: Rollback failed', rollbackError);
      }
    }

    // Re-throw error with context
    const repushError = new Error(`REPUSH failed: ${error.message}`);
    repushError.originalError = error;
    repushError.rollbackCompleted = createdJobIds.length > 0;
    throw repushError;
  }
};

/**
 * Rollback (delete) SWI jobs (used for transaction rollback only)
 *
 * This is different from deleteSWIJobs():
 * - Only deletes from MS-SQL Jobs table
 * - Does NOT delete from MongoDB (items weren't created yet)
 * - Does NOT recalculate totals
 * - Best-effort deletion (continues on errors)
 *
 * @param {Array<String>} jobIds - Array of SWI job IDs to delete
 * @returns {Promise<void>}
 */
exports.rollbackSWIPush = async (jobIds) => {
  logger.info('[rollbackSWIPush] Rolling back SWI jobs:', jobIds);

  if (!jobIds || jobIds.length === 0) {
    logger.info('[rollbackSWIPush] No jobs to delete');
    return;
  }

  let pool = null;

  try {
    pool = await getSharedPool();
    logger.info('[rollbackSWIPush] Got shared connection to SWI database');

    // Batch delete all jobs in single query for performance
    const deleteRequest = pool.request();
    const placeholders = jobIds.map((id, index) => {
      deleteRequest.input(`jobId${index}`, sql.BigInt, id);
      return `@jobId${index}`;
    }).join(',');

    const result = await deleteRequest.query(`DELETE FROM Jobs WHERE JobID IN (${placeholders})`);
    logger.info(`[rollbackSWIPush] Deleted ${result.rowsAffected[0] || 0} jobs from SWI`);

    // Don't close shared pool - it stays open for reuse by other requests
    logger.info('[rollbackSWIPush] Successfully rolled back', jobIds.length, 'SWI jobs');

  } catch (error) {
    logger.error('[rollbackSWIPush] Error:', error);
    // Don't throw - rollback should be best-effort
    // Log as CRITICAL since this could leave orphaned jobs in SWI
    logger.error('[rollbackSWIPush] CRITICAL: Some SWI jobs may not have been deleted');
    // Don't close shared pool - it stays open for reuse by other requests
  }
};

// Export the resolveUserName function for external use
// (The actual implementation is the private function defined at the top of this file)
exports.resolveUserName = resolveUserName;

// ============================================================================
// HELPER FUNCTIONS - MATERIAL ROW PROCESSING
// ============================================================================

/**
 * Process material rows and handle taper splits
 * Groups material rows by tag and handles split calculations for tapers
 *
 * @param {Object} template - Template object
 * @param {Array} materialRows - Array of material row objects
 * @param {String} orderNumber - Order number to query ALL existing tags in the order
 * @param {Object} pool - MS-SQL connection pool (optional, for querying SWI)
 * @returns {Object} Grouped material rows with split handling
 */
async function processMaterialRowsWithSplits(template, materialRows, orderNumber, pool = null) {
  const grouped = {};
  const { logger } = require('../utils/logger');

  // FIRST PASS: Collect all existing tags from ALL drawings in the order (not just current template)
  // This prevents tag collisions when converting taper to split
  const usedTags = new Set();

  // Build thisTemplateTags FIRST so we can exclude them when adding material row tags
  // This is critical because for splits, materialRow.tag gets synced to the LAST split tag
  // e.g., if split tags were 1-3, 1-4, materialRow.tag would be "1-4"
  // Without exclusion, "1-4" would be in usedTags and skipped during regeneration
  const thisTemplateTags = new Set();

  // EDIT MODE FIX: Store existing split tags IN ORDER for reuse
  // This prevents tags from changing when user just edits without modifying the tag
  const existingSplitTagsInOrder = [];

  // Query SWI database for existing ShapeIDs (tags) in this order
  // IMPORTANT: Exclude THIS template's existing tags so they can be reused in edit mode
  // Only skip tags from OTHER drawings to maintain global uniqueness
  if (orderNumber && pool) {
    try {
      const sql = require('mssql');

      // First, get tags from THIS template's existing jobs (to exclude from usedTags)
      // ALSO get them IN ORDER for reuse in edit mode
      if (template.swiJobIds && template.swiJobIds.length > 0) {
        const jobIdPlaceholders = template.swiJobIds.map((_, idx) => `@jobId${idx}`).join(',');
        const thisTemplateRequest = pool.request();
        template.swiJobIds.forEach((id, idx) => {
          thisTemplateRequest.input(`jobId${idx}`, sql.BigInt, id);
        });

        // Get ShapeIDs in the same order as swiJobIds (for correct split piece matching)
        const thisTemplateResult = await thisTemplateRequest.query(`
          SELECT JobID, ShapeID
          FROM Jobs
          WHERE JobID IN (${jobIdPlaceholders}) AND ShapeID IS NOT NULL
        `);

        // Build a map of JobID -> ShapeID
        const jobIdToShapeId = {};
        thisTemplateResult.recordset.forEach(row => {
          if (row.ShapeID) {
            thisTemplateTags.add(row.ShapeID);
            jobIdToShapeId[row.JobID.toString()] = row.ShapeID;
          }
        });

        // Store existing tags in order of swiJobIds (for edit mode reuse)
        template.swiJobIds.forEach(jobId => {
          const shapeId = jobIdToShapeId[jobId.toString()];
          if (shapeId) {
            existingSplitTagsInOrder.push(shapeId);
          }
        });

        logger.info(`[processMaterialRowsWithSplits] This template's existing tags (excluded): ${Array.from(thisTemplateTags).join(', ')}`);
        logger.info(`[processMaterialRowsWithSplits] Existing split tags in order: ${existingSplitTagsInOrder.join(', ')}`);
      }

      // Now get ALL tags in the order
      const result = await pool.request()
        .input('JobName', sql.NVarChar(64), orderNumber)
        .query(`
          SELECT DISTINCT ShapeID
          FROM Jobs
          WHERE JobName = @JobName AND ShapeID IS NOT NULL
        `);

      // Add only tags from OTHER templates (exclude this template's tags)
      const allSwiTags = result.recordset.map(row => row.ShapeID).filter(Boolean);
      let addedCount = 0;
      allSwiTags.forEach(tag => {
        if (!thisTemplateTags.has(tag)) {
          usedTags.add(tag);
          addedCount++;
        }
      });
      logger.info(`[processMaterialRowsWithSplits] Found ${allSwiTags.length} total ShapeIDs, added ${addedCount} from OTHER templates to usedTags`);
    } catch (dbError) {
      logger.error(`[processMaterialRowsWithSplits] Error querying SWI for existing tags: ${dbError.message}`);
      // Continue without SWI tags - at least use materialRows tags
    }
  }

  // Add tags from current material rows, but EXCLUDE this template's existing tags
  // This is important because for splits, materialRow.tag is synced to the last split tag
  // Without this exclusion, we'd skip tags that should be reusable
  materialRows.forEach((r) => {
    if (r.tag && !thisTemplateTags.has(r.tag)) {
      usedTags.add(r.tag);
    }
  });

  logger.info(`[processMaterialRowsWithSplits] All used tags: ${Array.from(usedTags).join(', ')}`);

  // Lookup core_Product_Thickness for each unique material from Material Master
  // This ensures the correct thickness from the product chart is used in SWI push
  const materialThicknessMap = {};
  try {
    const CoreProduct = require('../models/coreproductModel');
    const uniqueMaterials = [...new Set(materialRows.map(r => (r.material || '').trim()).filter(m => m))];
    if (uniqueMaterials.length > 0) {
      const products = await CoreProduct.find(
        { core_Product_Name: { $in: uniqueMaterials } },
        { core_Product_Name: 1, core_Product_Thickness: 1 }
      ).lean();
      products.forEach(p => {
        const thickness = parseFloat(p.core_Product_Thickness);
        if (!isNaN(thickness) && thickness > 0) {
          materialThicknessMap[p.core_Product_Name] = thickness;
        }
      });
      logger.info(`[processMaterialRowsWithSplits] Material thickness map: ${JSON.stringify(materialThicknessMap)}`);
    }
  } catch (thicknessErr) {
    logger.error(`[processMaterialRowsWithSplits] Error looking up material thickness: ${thicknessErr.message}. Will use fallback.`);
  }

  // EDIT MODE FIX: Track global split piece index for matching with existingSplitTagsInOrder
  let globalSplitIndex = 0;

  materialRows.forEach((r) => {
    // Get the _id - handle both Mongoose documents and plain objects
    const rowId = r._id ? (r._id.toString ? r._id.toString() : r._id) : null;
    logger.debug(`[processMaterialRowsWithSplits] Processing row: _id=${rowId}, tag=${r.tag}`);

    // Check if this is a taper with split
    const splitCount = Number(r.splitInto || 1);
    const isTaper = template.isTaper === true;

    if (isTaper && splitCount > 1) {
      // Calculate split dimensions for taper

      // Use consistent field names - template.lengths for far, template.nearLengths for near
      const templateFarLengths = template.lengths || [];
      const templateNearLengths = template.nearLengths || template.lengths || [];
      const farGirth = templateFarLengths.reduce((sum, len) => sum + (parseFloat(len) || 0), 0) || 150;
      const nearGirth = templateNearLengths.reduce((sum, len) => sum + (parseFloat(len) || 0), 0) || 140;
      const taperDiff = farGirth - nearGirth;
      const step = taperDiff / splitCount;
      // IMPORTANT: Don't divide length - each split piece keeps the full length
      const unitLength = Number(r.length || 1000);

      // Create separate entries for each split piece
      // IMPORTANT: Split pieces should be numbered from FAR to NEAR
      // So piece 1 starts at the FAR end, last piece ends at NEAR
      for (let i = 0; i < splitCount; i++) {
        // Calculate the girth for bottom and top of this split piece
        const reverseIndex = splitCount - 1 - i;
        const segmentBottom = nearGirth + (reverseIndex * step);
        const segmentTop = nearGirth + ((reverseIndex + 1) * step);

        // Calculate interpolated length arrays for this split piece
        // FIX: Handle identical far/near dimensions (non-tapered split)
        // When farGirth === nearGirth, division by zero causes NaN → NULL width in database
        let splitFarLengths, splitNearLengths;

        if (taperDiff === 0) {
          // Non-tapered split: Use original dimensions for all pieces (no interpolation)
          splitFarLengths = [...templateFarLengths];
          splitNearLengths = [...templateNearLengths];
        } else {
          // Tapered split: Interpolate dimensions for each piece
          splitFarLengths = templateFarLengths.map((farLen, idx) => {
            const nearLen = templateNearLengths[idx] || farLen;
            const ratio = (segmentTop - nearGirth) / (farGirth - nearGirth);
            return Math.round(nearLen + (farLen - nearLen) * ratio);
          });

          splitNearLengths = templateFarLengths.map((farLen, idx) => {
            const nearLen = templateNearLengths[idx] || farLen;
            const ratio = (segmentBottom - nearGirth) / (farGirth - nearGirth);
            return Math.round(nearLen + (farLen - nearLen) * ratio);
          });
        }

        // Create unique key for each split piece using row _id
        // For split drawings, preserve the user's tag and find next available numbers
        // e.g., "1-8" split into 2 with "1-9" already used → "1-8", "1-10" (skip "1-9")
        const originalTag = r.tag || 'default';
        let splitTag;
        let baseTag;

        // EDIT MODE FIX: Check if we have an existing tag for this split piece
        // If so, and the base tag matches, reuse it to prevent tag changes on simple edits
        const existingTag = existingSplitTagsInOrder[globalSplitIndex];
        const existingBaseTag = existingTag ? existingTag.replace(/-\d+$/, '') : null;

        // Determine the current base tag (what user has now)
        const trailingNumberMatch = originalTag.match(/-(\d+)$/);
        if (trailingNumberMatch) {
          baseTag = originalTag.replace(/-\d+$/, ''); // "1" from "1-8"
        } else {
          baseTag = originalTag; // "A" stays "A"
        }

        // Check if we should reuse existing tag:
        // 1. existingTag exists
        // 2. existingTag has a split suffix (e.g., "-13")
        // 3. Base tags match (user didn't change the tag)
        const existingHasSplitSuffix = existingTag && /-\d+$/.test(existingTag);
        const shouldReuseExisting = existingTag && existingHasSplitSuffix && existingBaseTag === baseTag;

        if (shouldReuseExisting) {
          // EDIT MODE: Reuse existing tag - don't regenerate!
          splitTag = existingTag;
          logger.info(`[processMaterialRowsWithSplits] EDIT MODE: Reusing existing tag ${splitTag} for split piece ${i + 1}`);
        } else if (trailingNumberMatch) {
          // Tag ends with a number (e.g., "1-8") - find next available numbers
          const startingNumber = parseInt(trailingNumberMatch[1], 10); // 8

          // For first split piece (i=0), use original tag
          // For subsequent pieces, find next available number
          if (i === 0) {
            splitTag = originalTag; // Keep original "1-8"
          } else {
            // Find next available number starting from startingNumber + 1
            let nextNum = startingNumber + 1;
            let candidateTag = `${baseTag}-${nextNum}`;
            let skippedTags = [];

            // Skip numbers that are already used (but not the original tag we're splitting)
            while (usedTags.has(candidateTag) && candidateTag !== originalTag && skippedTags.length < 100) {
              skippedTags.push(candidateTag);
              nextNum++;
              candidateTag = `${baseTag}-${nextNum}`;
            }

            // Also check tags we've already generated in this split
            for (let j = 0; j < i; j++) {
              const prevKey = `${r._id}_split_${j}`;
              if (grouped[prevKey] && grouped[prevKey].tag === candidateTag) {
                skippedTags.push(`${candidateTag}(in-split)`);
                nextNum++;
                candidateTag = `${baseTag}-${nextNum}`;
              }
            }

            splitTag = candidateTag;
            if (skippedTags.length > 0) {
              logger.info(`[processMaterialRowsWithSplits] SKIPPED TAGS: ${skippedTags.join(', ')} -> using ${splitTag}`);
            }
          }
        } else {
          // Tag doesn't end with a number (e.g., "A", "Test") - find next available suffix
          // Find next available suffix starting from 1
          let nextNum = i + 1;
          let candidateTag = `${baseTag}-${nextNum}`;

          // Skip numbers that are already used
          while (usedTags.has(candidateTag)) {
            nextNum++;
            candidateTag = `${baseTag}-${nextNum}`;
          }

          splitTag = candidateTag;
        }

        // Add the generated tag to usedTags to prevent collisions within the same split
        usedTags.add(splitTag);

        // Increment global split index for next iteration
        globalSplitIndex++;

        const key = `${r._id}_split_${i}`; // Use row _id for uniqueness

        logger.debug(`[processMaterialRowsWithSplits] Split piece ${i + 1}: r.tag=${r.tag}, baseTag=${baseTag}, splitTag=${splitTag}`);

        if (!grouped[key]) {
          const dbMaterial = (r.material || '').trim();
          const dbColour = (r.color || '').trim();

          grouped[key] = {
            tag: splitTag,
            originalTag: baseTag,  // Use extracted base tag, not the full r.tag which may have suffix
            length: unitLength,
            totalQty: 0,
            dbMaterial,
            dbColour,
            isSplit: true,
            splitPiece: i + 1,
            splitTotal: splitCount,
            splitFar: splitFarLengths,
            splitNear: splitNearLengths,
            splitFarGirth: segmentTop,
            splitNearGirth: segmentBottom,
            unitPrice: r.unitPrice || 0,
            extPrice: r.extPrice || 0,
            thickness: materialThicknessMap[dbMaterial] || r.thickness || 0,
            materialRowId: rowId // Track original material row ID for tag sync
          };
        }
        // Each split piece gets the full quantity (they're cut from separate sheets)
        grouped[key].totalQty += Math.round(r.quantity / splitCount);
      }
    } else {
      // Normal processing for non-split or non-taper
      // Use row _id as key to ensure each row creates its own Job ID
      const key = `${r._id}`;
      const dbMaterial = (r.material || '').trim();
      const dbColour = (r.color || '').trim();

      // Use the tag directly from the row - frontend sends the correct tag
      // NOTE: Tag conversion from split to non-split is handled at frontend level now
      let nonSplitTag = r.tag || 'default';

      grouped[key] = {
        tag: nonSplitTag,
        length: r.length,
        totalQty: r.quantity, // Use the row's quantity directly
        dbMaterial,
        dbColour,
        isSplit: false,
        splitFar: null,
        splitNear: null,
        splitPiece: null,
        splitTotal: null,
        splitFarGirth: null,
        splitNearGirth: null,
        unitPrice: r.unitPrice || 0,
        extPrice: r.extPrice || 0,
        thickness: materialThicknessMap[dbMaterial] || r.thickness || 0,
        materialRowId: rowId, // Track original material row ID for tag sync
        swiJobId: r.swiJobId || null // For edit mode: swiJobId-based matching for non-split
      };
    }
  });

  return grouped;
}

/**
 * Generate collision-aware JobID for REPUSH
 * Checks BOTH MS-SQL and MongoDB to avoid JobID collisions
 * REFERENCE: swiDrawingCtrl.js lines 2889-2930
 *
 * @param {Object} pool - MS-SQL connection pool
 * @returns {Promise<String>} New JobID (format: YYYYMMDDNNNN)
 */
async function generateCollisionAwareJobId(pool) {
  const Template = require('../models/templateModel');

  // Get today's date prefix (YYYYMMDD)
  const today = new Date();
  const yyyyMMdd = today.toISOString().slice(0, 10).replace(/-/g, '');

  // Step 1: Check MS-SQL for max counter
  const jobIdResult = await pool.request()
    .input('prefix', sql.VarChar(8), yyyyMMdd)
    .query(`
      SELECT TOP 1 JobID
      FROM Jobs
      WHERE LEFT(CAST(JobID AS VARCHAR), 8) = @prefix
      ORDER BY JobID DESC
    `);

  let maxCounterFromDb = 0;
  if (jobIdResult.recordset.length > 0) {
    const lastId = jobIdResult.recordset[0].JobID.toString();
    maxCounterFromDb = parseInt(lastId.slice(8), 10);
  }

  // Step 2: Check MongoDB templates for max counter
  const templatesWithJobIds = await Template.find({
    swiJobIds: { $exists: true, $ne: [] }
  }).select('swiJobIds');

  const allExistingJobIds = templatesWithJobIds.flatMap(t => t.swiJobIds || []);
  const todaysJobIds = allExistingJobIds.filter(id => id && id.toString().startsWith(yyyyMMdd));

  let maxCounterFromMongo = 0;
  if (todaysJobIds.length > 0) {
    todaysJobIds.forEach(id => {
      const counter = parseInt(id.toString().slice(8), 10);
      if (!isNaN(counter) && counter > maxCounterFromMongo) {
        maxCounterFromMongo = counter;
      }
    });
  }

  // Step 3: Use the higher counter to avoid collisions
  const maxCounter = Math.max(maxCounterFromDb, maxCounterFromMongo);
  const newCounter = maxCounter + 1;
  const jobId = `${yyyyMMdd}${newCounter.toString().padStart(4, '0')}`;

  logger.info('[generateCollisionAwareJobId] Generated JobID:', {
    jobId,
    maxCounterFromDb,
    maxCounterFromMongo,
    finalCounter: newCounter
  });

  return jobId;
}

/**
 * Calculate ShapeID counters for existing jobs in database
 * Prevents ShapeID collisions when creating new jobs
 *
 * @param {Object} pool - MS-SQL connection pool
 * @param {String} jobName - Order number / job name
 * @param {Object} grouped - Grouped material rows
 * @returns {Object} Tag counters map
 */
async function calculateShapeIdCounters(pool, jobName, grouped) {
  const tagCounters = {};
  const uniqueTags = [...new Set(Object.values(grouped).map(row => row.tag))];

  try {
    // Get counters for each unique tag in this push
    for (const tag of uniqueTags) {
      // Find if this tag is used in any ACTUAL split drawings (not just user-entered tags with hyphens)
      const isSplitDrawing = Object.values(grouped).some(row => row.tag === tag && row.isSplit === true);

      if (isSplitDrawing) {
        // For ACTUAL split drawings, query using the base tag to find all related ShapeIDs
        const baseTag = tag.replace(/-\d+$/, '');
        const existingJobs = await pool.request()
          .input('JobName', sql.NVarChar(64), jobName)
          .input('BaseTag', sql.NVarChar(64), baseTag)
          .input('BaseTagPattern', sql.NVarChar(64), `${baseTag}-%`)
          .query(`
            SELECT ShapeID FROM Jobs
            WHERE JobName = @JobName
            AND (ShapeID = @BaseTag OR ShapeID LIKE @BaseTagPattern)
          `);

        // Find the highest number used for this base tag
        let maxNum = 0;
        existingJobs.recordset.forEach(row => {
          if (row.ShapeID === baseTag) {
            // Just "A" without number - consider this as taking slot 0
            maxNum = Math.max(maxNum, 0);
          } else {
            const match = row.ShapeID.match(new RegExp(`^${baseTag}-(\\d+)$`));
            if (match) {
              maxNum = Math.max(maxNum, parseInt(match[1]));
            }
          }
        });

        tagCounters[baseTag] = maxNum;
      } else {
        // For ALL user-entered tags (regardless of whether they contain hyphens)
        // Query for existing ShapeIDs and find the next available number
        const existingJobs = await pool.request()
          .input('JobName', sql.NVarChar(64), jobName)
          .input('Tag', sql.NVarChar(64), tag)
          .input('TagPattern', sql.NVarChar(64), `${tag}-%`)
          .query(`
            SELECT ShapeID FROM Jobs
            WHERE JobName = @JobName
            AND (ShapeID = @Tag OR ShapeID LIKE @TagPattern)
          `);

        // Find the highest counter for this specific tag
        const existingCounters = existingJobs.recordset
          .map(row => {
            // Check if it's just the tag (e.g., "B" or "1-1") or has a number (e.g., "B-1" or "1-1-1")
            if (row.ShapeID === tag) {
              return 1; // If it's just the tag itself, that's counter 1
            }
            const match = row.ShapeID.match(new RegExp(`^${tag.replace(/[-[\]{}()*+?.,\\^$|#\s]/g, '\\$&')}-(\\d+)$`));
            return match ? parseInt(match[1]) + 1 : 0; // "B-1" is counter 2, "B-2" is counter 3
          })
          .filter(num => num > 0);

        tagCounters[tag] = existingCounters.length > 0 ? Math.max(...existingCounters) + 1 : 1;
      }
    }

    return tagCounters;
  } catch (error) {
    logger.error('[calculateShapeIdCounters] Error calculating counters:', error);
    return tagCounters; // Return empty object on error
  }
}

/**
 * Determine ShapeID for a grouped entry
 * Handles split drawings and regular tags
 *
 * @param {Object} entry - Grouped material row entry
 * @param {Object} tagCounters - Tag counters map (mutable - will be updated for splits)
 * @param {Object} tagUsedInPush - Track which ShapeID to use for each tag in this push (mutable)
 * @returns {String} ShapeID
 */
function determineShapeId(entry, tagCounters, tagUsedInPush) {
  const { tag, isSplit, splitPiece, splitTotal } = entry;

  if (isSplit) {
    // For split pieces, the tag was ALREADY calculated by processMaterialRowsWithSplits
    // which checked for duplicates against usedTags (SWI + materialRows from other templates)
    // Just return the tag as-is - DO NOT recalculate!
    //
    // Previous bug: This code was adding tagCounters[baseTag] + splitNum which caused
    // double-counting (e.g., 1-7 became 1-13 because 6 + 7 = 13)
    return tag;
  } else {
    // All rows with same tag in same push get SAME ShapeID for SWI grouping
    if (!tagUsedInPush[tag]) {
      // First time seeing this tag in this push - determine its ShapeID
      if (!tagCounters[tag]) {
        tagCounters[tag] = 1;
      }
      const currentCounter = tagCounters[tag];
      tagUsedInPush[tag] = currentCounter === 1 ? tag : `${tag}-${currentCounter - 1}`;
      // Note: tagCounters will be incremented at the end of processing all rows with this tag
    }
    return tagUsedInPush[tag]; // Use the same ShapeID for all rows with this tag
  }
}

// ============================================================================
// HELPER FUNCTIONS - GEOMETRY TRANSFORMATIONS
// ============================================================================

/**
 * Calculate rotation value based on flip states and firstSegmentAngle
 * Handles FlipV, FlipH, and both flips
 *
 * @param {Object} template - Template object
 * @param {Array} anglesForSWI - Processed angles array
 * @returns {Number} Rotation value in degrees
 */
function calculateRotation(template, anglesForSWI) {
  let rotationValue;
  const flipV = template.flipV || false;
  const flipH = template.flipH || false;

  // For split drawings and regular drawings, use firstSegmentAngle if available
  if (template.firstSegmentAngle !== null && template.firstSegmentAngle !== undefined) {
    // Both flips: Add 180° (no negation needed, angles already handle the mirroring)
    // Flip V only: DON'T negate (send as-is to get opposite orientation)
    // Flip H only: Keep same as non-flip (negate for coordinate conversion)
    // No flip: Negate for coordinate conversion
    if (flipV && flipH) {
      // Both flips: Negate and add 180° to rotate to opposite direction
      rotationValue = -template.firstSegmentAngle + 180;
      // Normalize to -180 to 180 range
      if (rotationValue > 180) rotationValue -= 360;
      if (rotationValue < -180) rotationValue += 360;
    } else if (flipV) {
      // Flip V only: send as-is (no negation)
      rotationValue = template.firstSegmentAngle;
    } else if (flipH) {
      // Flip H only: Mirror across vertical axis (Y-axis)
      // To flip horizontally: new_angle = 180 - angle
      // Then negate for SWI coordinate system: -(180 - angle) = angle - 180
      rotationValue = template.firstSegmentAngle - 180;
      // Normalize to -180 to 180 range
      if (rotationValue > 180) rotationValue -= 360;
      if (rotationValue < -180) rotationValue += 360;
    } else {
      // No flip: negate for coordinate conversion
      rotationValue = -template.firstSegmentAngle;
    }
  }
  // When firstSegmentAngle is null (SSF on first segment), calculate based on direction
  else if (template.startFoldDirection === 'openup' || template.startFoldDirection === 'opendn' ||
           template.startFoldDirection === 'OpenUp' || template.startFoldDirection === 'OpenDn') {
    // For SSF on first segment, use the first angle from the angles array directly
    // Unlike regular segments, SSF doesn't need negation
    if (anglesForSWI && anglesForSWI.length > 0) {
      rotationValue = anglesForSWI[0];
    } else {
      rotationValue = 0.00;
    }
  } else {
    // When firstSegmentAngle is null, use direction to determine rotation
    if (template.direction) {
      const directionRotationMap = {
        'Up': -90,    // Point up
        'Down': 90,   // Point down
        'Left': 180,  // Point left
        'Right': 0    // Point right
      };

      rotationValue = directionRotationMap[template.direction] || 0;
    } else {
      rotationValue = 0.00;
    }
  }

  logger.debug('[calculateRotation] Rotation calculated:', {
    firstSegmentAngle: template.firstSegmentAngle,
    flipV,
    flipH,
    rotationValue,
    logic: (flipV && flipH) ? 'Both flips: -angle + 180°' : (flipV ? 'FlipV: no negation' : (flipH ? 'FlipH: angle - 180°' : 'No flip: negated'))
  });

  return rotationValue;
}

/**
 * Calculate reverseColours based on flip states
 * Both flips cancel out, single flip reverses colors
 *
 * @param {Object} template - Template object
 * @returns {Boolean} Whether to reverse colours
 */
function calculateReverseColours(template) {
  const flipV = template.flipV || false;
  const flipH = template.flipH || false;

  // Both flips: two reversals = original (don't flip)
  // One flip (V or H): reverse colors
  // No flip: keep original
  if (flipV && flipH) {
    return !!template.reverseColor; // Both flips cancel out
  } else if (flipV || flipH) {
    return !template.reverseColor; // Single flip reverses
  } else {
    return !!template.reverseColor; // No flip keeps original
  }
}

/**
 * Transform angles based on flip states
 * Single flip negates angles, both flips cancel out
 *
 * @param {Array} angles - Original angles array
 * @param {Object} template - Template object
 * @returns {Array} Transformed angles
 */
function transformAnglesForFlips(angles, template) {
  const flipV = template.flipV || false;
  const flipH = template.flipH || false;

  // One flip (V or H): negate all angles to mirror the turn directions
  // No flip: keep original angles
  // Both flips: angles NOT negated (cancel out)
  if ((flipV || flipH) && !(flipV && flipH)) {
    const negated = angles.map(angle => -angle);
    logger.debug('[transformAnglesForFlips] Flipped angles:', { flipV, flipH, original: angles, negated });
    return negated;
  } else if (flipV && flipH) {
    logger.debug('[transformAnglesForFlips] Both flips - angles NOT negated (cancel out):', { flipV, flipH, angles });
    return angles;
  }

  return angles;
}

// ============================================================================
// HELPER FUNCTIONS - GEOMETRY PREPARATION
// ============================================================================

/**
 * Prepare geometry data from template
 * Handles FAR/NEAR geometry, angles, and taper calculations
 */
function prepareGeometryData(template) {
  // Prepare FAR geometry (main profile)
  const farLengths = [...template.lengths];
  let farAngles = [...template.angles];

  // Remove first/last angles if they are 30° or 90° (fold angles)
  if (farAngles.length > farLengths.length - 1) {
    if ([30, 90].includes(Math.abs(farAngles[0]))) farAngles.shift();
    if ([30, 90].includes(Math.abs(farAngles.at(-1)))) farAngles.pop();
  }

  // Calculate FAR total girth
  let farTotal = farLengths.reduce((sum, v) => sum + v, 0);
  let sheetLength = farTotal; // Base sheet length WITHOUT folds

  // Prepare NEAR geometry (for taper mode)
  // CRITICAL: For non-taper drawings, ALWAYS use farLengths/farAngles as nearLengths/nearAngles
  // This prevents old taper values from persisting when converting taper to normal
  let nearLengths, nearAngles;

  if (template.isTaper) {
    // Taper mode: use stored nearLengths/nearAngles if available
    nearLengths = Array.isArray(template.nearLengths) && template.nearLengths.length > 0
      ? [...template.nearLengths]
      : [...farLengths];
    nearAngles = Array.isArray(template.nearAngles) && template.nearAngles.length > 0
      ? [...template.nearAngles]
      : [...farAngles];
  } else {
    // Normal (non-taper) mode: nearLengths/nearAngles MUST equal farLengths/farAngles
    // This ensures both ends show the same girth in SWI
    nearLengths = [...farLengths];
    nearAngles = [...farAngles];
  }

  // Remove first/last angles from near if needed
  if (nearAngles.length > nearLengths.length - 1) {
    if ([30, 90].includes(Math.abs(nearAngles[0]))) nearAngles.shift();
    if ([30, 90].includes(Math.abs(nearAngles.at(-1)))) nearAngles.pop();
  }

  const nearTotal = nearLengths.reduce((sum, v) => sum + v, 0);

  // Calculate girth WITH fold lengths (for Width field)
  let farGirthWithFolds = farTotal;
  if (template.startFoldType === 'SF' || template.startFoldType === 'SSF') {
    farGirthWithFolds += template.startFoldLength || 0;
  }
  if (template.endFoldType === 'SF' || template.endFoldType === 'SSF') {
    farGirthWithFolds += template.endFoldLength || 0;
  }

  let nearGirthWithFolds = nearTotal;
  if (template.startFoldType === 'SF' || template.startFoldType === 'SSF') {
    nearGirthWithFolds += template.startFoldLength || 0;
  }
  if (template.endFoldType === 'SF' || template.endFoldType === 'SSF') {
    nearGirthWithFolds += template.endFoldLength || 0;
  }

  // For tapers: SWAP near/far for SWI coordinate system
  // IMPORTANT: SWI displays sheetLength as FAR (blue), taperWidth as NEAR (green)
  // So we send NEAR as sheetLength, FAR as taperWidth
  let actualSheetLength = sheetLength;
  let widthValue = farGirthWithFolds;
  let taperWidthValue = nearTotal;

  if (template.isTaper) {
    actualSheetLength = nearTotal; // NEAR total for sheetLength (displays as FAR/blue in SWI)
    widthValue = Math.max(farGirthWithFolds, nearGirthWithFolds); // Larger value for Width
    taperWidthValue = sheetLength; // FAR total for taperWidth (displays as NEAR/green in SWI)
  }

  return {
    farLengths,
    farAngles,
    nearLengths,
    nearAngles,
    farTotal,
    nearTotal,
    farGirthWithFolds,
    nearGirthWithFolds,
    sheetLength: actualSheetLength,
    widthValue,
    taperWidthValue
  };
}

/**
 * Prepare dates for SWI insertion
 */
function prepareDates(deliveryDateFromClient) {
  // Parse delivery date
  const parseDDMMYYYY = str => {
    if (!str) return new Date();
    if (str.includes('T') || str.includes('/')) {
      return new Date(str);
    }
    const [d, m, y] = str.split('-');
    return new Date(y, m - 1, d, 12, 0, 0);
  };

  // Get current timestamp in Australia/Sydney timezone
  const getCurrentTimestamp = (timeZone = 'Australia/Sydney') => {
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
  };

  const deliveryDate = deliveryDateFromClient
    ? parseDDMMYYYY(deliveryDateFromClient)
    : new Date();

  const enteredDate = getCurrentTimestamp();

  return {
    deliveryDate,
    enteredDate,
    updated: getCurrentTimestamp()
  };
}

/**
 * Generate next job ID using the job ID generator utility
 *
 * REFERENCE: utils/jobIdGenerator.js
 */
exports.generateJobID = async (orderNumber, partClass, index) => {
  const { generateNextJobId } = require('../utils/jobIdGenerator');
  const jobId = await generateNextJobId();
  return jobId.toString();
};

/**
 * Calculate folds for SWI
 */
function calculateFolds(farAngles, template, type) {
  const baseBends = farAngles.length;
  const hasFolds = template.startFoldType || template.endFoldType;
  const startFoldBends = (template.startFoldType === 'SF' || template.startFoldType === 'SSF') ? 2 : 0;
  const endFoldBends = (template.endFoldType === 'SF' || template.endFoldType === 'SSF') ? 2 : 0;

  let totalBends = 0;
  if (hasFolds) {
    // When there are folds, ONLY count fold bends (ignore base geometry)
    totalBends = startFoldBends + endFoldBends + baseBends;
  } else {
    // No folds: count base geometry bends, minimum 1 for straight line
    totalBends = Math.max(1, baseBends);
  }

  let squashCount = 0;
  if (template.startFoldType === 'SF' || template.startFoldType === 'SSF') {
    squashCount++;
  }
  if (template.endFoldType === 'SF' || template.endFoldType === 'SSF') {
    squashCount++;
  }

  if (type === "Folds") {
    return totalBends;
  }

  if (type === "SquashFolds") {
    return squashCount;
  }

  return null;
}

/**
 * Insert job into SWI Jobs table
 * Enhanced version - handles regular profiles AND taper splits with flip transformations
 */
async function insertJobToSWI(pool, params) {
  const {
    template,
    entry, // Use entry instead of row (from grouped material rows)
    jobId,
    jobName,
    customerName,
    geometryData,
    dates,
    enteredBy,
    shapeId,
    swiData // Contains customerPoNumber, area, suburb
  } = params;

  logger.info('[insertJobToSWI] Inserting job:', jobId, 'ShapeID:', shapeId);

  // Resolve enteredBy userId to full name
  const resolvedEnteredBy = await resolveUserName(enteredBy);
  logger.info('[insertJobToSWI] EnteredBy resolved:', { original: enteredBy, resolved: resolvedEnteredBy });

  // Debug: Log customerPoNumber for CustomTXT01
  logger.info('[insertJobToSWI] CustomTXT01 debug:', {
    customerPoNumber: swiData?.customerPoNumber,
    templateCustomTXT01: template?.customTXT01,
    area: swiData?.area,
    suburb: swiData?.suburb,
    finalValue: (swiData?.customerPoNumber && swiData?.customerPoNumber !== '0')
      ? swiData.customerPoNumber
      : (template?.customTXT01 || swiData?.area || swiData?.suburb || null)
  });

  // Import shape descriptor generator
  const { generateShapeDescriptorDetailed } = require('../utils/shapeUtils');

  // Determine lengths and angles to use (split vs non-split)
  let farLengthsForDescriptor, nearLengthsForDescriptor;
  let farAnglesForDescriptor, nearAnglesForDescriptor;
  let widthForDescriptor, taperWidthForDescriptor, sheetLengthForDescriptor;

  if (entry.isSplit && entry.splitFar && entry.splitNear) {
    // For split drawings, use interpolated dimensions
    // IMPORTANT: For tapers, SWI displays these in reverse - must swap values
    farLengthsForDescriptor = entry.splitFar;
    nearLengthsForDescriptor = entry.splitNear;

    // For tapers, always use near angles (matches non-split taper behavior)
    if (template.isTaper) {
      farAnglesForDescriptor = template.nearAngles ? [...template.nearAngles] : [...template.angles];
      nearAnglesForDescriptor = [...template.angles];
    } else {
      farAnglesForDescriptor = [...template.angles];
      nearAnglesForDescriptor = template.nearAngles ? [...template.nearAngles] : [...template.angles];
    }

    // Calculate totals for split pieces
    const splitFarTotal = entry.splitFar.reduce((sum, v) => sum + v, 0);
    const splitNearTotal = entry.splitNear.reduce((sum, v) => sum + v, 0);

    // Add fold lengths to the totals if applicable
    let adjustedFarTotal = splitFarTotal;
    let adjustedNearTotal = splitNearTotal;

    if (template.startFoldType === 'SF' || template.startFoldType === 'SSF') {
      adjustedFarTotal += template.startFoldLength || 0;
      adjustedNearTotal += template.startFoldLength || 0;
    }
    if (template.endFoldType === 'SF' || template.endFoldType === 'SSF') {
      adjustedFarTotal += template.endFoldLength || 0;
      adjustedNearTotal += template.endFoldLength || 0;
    }

    // For tapers, Width field gets the maximum value (WITH folds)
    // But sheetLength should be WITHOUT folds
    widthForDescriptor = Math.max(adjustedFarTotal, adjustedNearTotal);
    sheetLengthForDescriptor = splitNearTotal;  // NEAR total WITHOUT folds for sheetLength
    taperWidthForDescriptor = entry.length || 1000;  // JobLength (already in correct unit)
  } else {
    // For non-split drawings, use template dimensions directly (no swap here)
    // The swap happens at lengthsForDescriptor/nearLengthsForTaper below
    farLengthsForDescriptor = geometryData.farLengths;
    nearLengthsForDescriptor = template.isTaper ? geometryData.nearLengths : [];
    farAnglesForDescriptor = [...geometryData.farAngles];
    nearAnglesForDescriptor = template.isTaper ? [...geometryData.nearAngles] : [];
    widthForDescriptor = geometryData.widthValue;
    taperWidthForDescriptor = entry.length || 1000;
    sheetLengthForDescriptor = geometryData.sheetLength;
  }

  // Get angles for SWI - for tapers, always use near angles
  let anglesForSWI = template.isTaper ? geometryData.nearAngles : geometryData.farAngles;
  if (!anglesForSWI || anglesForSWI.length === 0) {
    anglesForSWI = geometryData.farAngles;
  }

  // Apply flip transformation to angles
  // Both flips: two negations cancel out (keep original angles)
  // One flip (V or H): negate all angles to mirror the turn directions
  // No flip: keep original angles
  const transformedAngles = ((template.flipV || template.flipH) && !(template.flipV && template.flipH))
    ? anglesForSWI.map(angle => -angle)
    : [...anglesForSWI];

  // Calculate rotation with flip logic
  const rotation = calculateRotation(template, transformedAngles);

  // Calculate reverse colours with flip logic
  const reverseColours = calculateReverseColours(template);

  // Generate shape descriptor
  // For tapers, use NEAR lengths in the 'lengths' field (displays as FAR in SWI)
  // And FAR lengths in the 'nearLengths' field (displays as NEAR in SWI)
  const lengthsForDescriptor = template.isTaper ? nearLengthsForDescriptor : farLengthsForDescriptor;
  const nearLengthsForTaper = template.isTaper ? farLengthsForDescriptor : [];

  // For nearAngles in descriptor: tapers use farAngles, non-tapers use empty
  const nearAnglesForTaper = template.isTaper ? geometryData.farAngles : [];

  const shapeDescriptor = generateShapeDescriptorDetailed({
    jobName,
    tag: entry.tag || 'default',
    lengths: lengthsForDescriptor,
    angles: transformedAngles,
    material: entry.dbMaterial || '',
    colour: entry.dbColour || '',
    thickness: entry.thickness || template.thickness || 0.55,
    customer: customerName,
    sheetLength: sheetLengthForDescriptor,
    widthOverride: widthForDescriptor,
    enteredDate: dates.enteredDate,
    deliveryDate: dates.deliveryDate,
    enteredBy,
    rotation: rotation,
    reverseColours: reverseColours,
    taper: !!template.isTaper,
    taperWidth: taperWidthForDescriptor,
    nearLengths: nearLengthsForTaper,
    nearAngles: nearAnglesForTaper,
    jobIds: [jobId],
    jobLengths: [entry.length || 1000],
    jobQuantities: [entry.totalQty || 1],
    startFoldType: template.startFoldType,
    startFoldDirection: template.startFoldDirection,
    startFoldLength: template.startFoldLength,
    endFoldType: template.endFoldType,
    endFoldDirection: template.endFoldDirection,
    endFoldLength: template.endFoldLength
  });

  logger.info('[insertJobToSWI] Shape descriptor generated');

  // Prepare preview image
  let profileImage = null;
  const previewData = template.isTaper ? template.previewFar : template.preview;
  if (previewData && previewData.startsWith('data:image/png;base64,')) {
    const base64Data = previewData.replace(/^data:image\/png;base64,/, '');
    profileImage = Buffer.from(base64Data, 'base64');
  }

  // Execute INSERT statement
  const request = pool.request();

  await request
    .input('JobID', sql.BigInt, jobId)
    .input('JobName', sql.NVarChar(64), jobName)
    .input('Customer', sql.NVarChar(64), customerName)
    .input('Material', sql.NVarChar(64), entry.dbMaterial || '')
    .input('Colour', sql.NVarChar(64), entry.dbColour || '')
    .input('Thickness', sql.Float, entry.thickness || template.thickness || 0.55)
    .input('Width', sql.Float, widthForDescriptor)
    .input('Length', sql.Float, entry.length || 1000)
    .input('Quantity', sql.Int, entry.totalQty || 1)
    .input('ShapeDescriptor', sql.VarChar(sql.MAX), shapeDescriptor)
    .input('ShapeID', sql.NVarChar(64), shapeId)
    .input('Folds', sql.Int, calculateFolds(transformedAngles, template, "Folds"))
    .input('SquashFolds', sql.Int, calculateFolds(transformedAngles, template, "SquashFolds"))
    .input('Units', sql.Int, 0)
    .input('FoldOrder', sql.Int, 0)
    // .input('QtyCut', sql.Int, null)
    // .input('QtyFolded', sql.Int, null)
    .input('SlitterToUse', sql.NVarChar(64), '')
    .input('FolderToUse', sql.NVarChar(64), '')
    // .input('OffcutID', sql.NVarChar(64), null)
    .input('AddressStreet', sql.NVarChar(64), '')
    .input('AddressCity', sql.NVarChar(64), '')
    .input('AddressState', sql.NVarChar(64), '')
    .input('AddressCode', sql.NVarChar(64), '')
    .input('DeliveryDate', sql.DateTime, dates.deliveryDate)
    .input('EnteredDate', sql.DateTime, dates.enteredDate)
    .input('Updated', sql.DateTime, dates.updated)
    .input('Taper', sql.Int, template.isTaper ? 1 : 0)
    .input('dW', sql.Float, 0)
    .input('dL', sql.Float, 0)
    .input('EnteredBy', sql.NVarChar(64), resolvedEnteredBy)
    .input('DeliveryCode', sql.NVarChar(64), '')
    .input('TotalWeight', sql.Float, 0)
    .input('FolderLibRef', sql.NVarChar(260), `${SWI_IMAGE_PATH}\\${shapeId}.png`)
    // .input('InvoicedDate', sql.Date, null)
    // .input('Cut', sql.DateTime, null)
    // .input('Folded', sql.DateTime, null)
    .input('Phone', sql.NVarChar(16), '')
    // .input('DeliveryTime', sql.Time, null)
    .input('CustomINT01', sql.Int, 0)
    .input('CustomINT02', sql.Int, 0)
    .input('CustomINT03', sql.Int, 0)
    .input('CustomINT04', sql.Int, 0)
    .input('CustomTXT01', sql.NVarChar(64),
      // Fallback chain: customerPoNumber > template.customTXT01 > swiData.area > swiData.suburb > null
      (swiData.customerPoNumber && swiData.customerPoNumber !== '0')
        ? swiData.customerPoNumber
        : (template.customTXT01 || swiData.area || swiData.suburb || null)
    )
    .input('CustomTXT02', sql.NVarChar(64), '')
    // .input('CustomTXT03', sql.NVarChar(64), null)
    // .input('CustomTXT04', sql.NVarChar(64), null)
    // .input('CustomTXT05', sql.NVarChar(64), null)
    // .input('DeliveryAddrInstr', sql.NVarChar(256), null)
    // .input('Cancelled', sql.Int, null)
    .input('ProfileImage', sql.VarBinary, profileImage)
    // .input('CoilID', sql.NVarChar(36), null)
    .input('SchedProcessed', sql.NVarChar(8), 'N')
    .input('USgage', sql.NVarChar(16), '')
    // .input('RollformerID', sql.NVarChar(64), null)
    // .input('Category', sql.NVarChar(64), null)
    // .input('RowVersion_MYOB', sql.NVarChar(64), null)
    // .input('RowID_MYOB', sql.Int, null)
    // .input('InProductionSlitter', sql.NVarChar(64), null)
    // .input('LastModifiedBy', sql.NVarChar(64), resolvedEnteredBy)
    // .input('CutBy', sql.NVarChar(128), null)
    // .input('FoldedBy', sql.NVarChar(128), null)
    // .input('TemplateID', sql.Int, null)
    // .input('BayN', sql.NVarChar(32), null)
    // .input('LoadN', sql.NVarChar(32), null)
    // .input('SOLine', sql.NVarChar(32), null)
    // .input('Pitch', sql.NVarChar(32), null)
    // .input('Site', sql.NVarChar(32), null)
    // .input('CoilCode', sql.NVarChar(64), null)
    // .input('ImportFile', sql.NVarChar(260), null)
    // .input('CostEstimatedLM_LF', sql.Float, null)
    // .input('CostActualLM_LF', sql.Float, null)
    // .input('CoilWidthUsed', sql.Int, null)
    // .input('BatchID', sql.Int, null)
    // .input('CloudID', sql.Int, null)
    // .input('Status', sql.Int, null)
    .input('SideLoaderApproval', sql.Int, 0)
    // .input('OnlineOrderStatus', sql.NVarChar(24), null)
    // .input('OnlineOrderId', sql.NVarChar(24), null)
    // .input('Price', sql.Int, null)
    // .input('ERP_status', sql.Int, null)
    .input('MongoTemplateID', sql.NVarChar(24), template._id.toString())
    .query(`
      INSERT INTO Jobs (
        JobID, 
        JobName, 
        Customer, 
        Material, 
        Colour,
        Thickness, 
        Width, 
        Length, 
        Quantity,
        ShapeDescriptor, 
        ShapeID, 
        Folds, 
        SquashFolds, 
        Units, 
        FoldOrder, 
        SlitterToUse,
        FolderToUse,
        AddressStreet,
        AddressCity,
        AddressState,
        AddressCode,
        DeliveryDate, 
        EnteredDate, 
        Updated, 
        Taper,
        dW,
        dL,
        EnteredBy, 
        DeliveryCode,
        TotalWeight,
        FolderLibRef,
        Phone,
        CustomINT01,
        CustomINT02,
        CustomINT03,
        CustomINT04,
        CustomTXT01,
        CustomTXT02,
        ProfileImage, 
        SchedProcessed,
        USgage,
        SideLoaderApproval, 
        MongoTemplateID
      ) VALUES (
        @JobID, 
        @JobName, 
        @Customer, 
        @Material, 
        @Colour,
        @Thickness, 
        @Width, 
        @Length, 
        @Quantity,
        @ShapeDescriptor, 
        @ShapeID, 
        @Folds, 
        @SquashFolds, 
        @Units, 
        @FoldOrder, 
        @SlitterToUse,
        @FolderToUse,
        @AddressStreet,
        @AddressCity,
        @AddressState,
        @AddressCode,
        @DeliveryDate, 
        @EnteredDate, 
        @Updated, 
        @Taper,
        @dW,
        @dL,
        @EnteredBy, 
        @DeliveryCode,
        @TotalWeight,
        @FolderLibRef,
        @Phone,
        @CustomINT01,
        @CustomINT02,
        @CustomINT03,
        @CustomINT04,
        @CustomTXT01,
        @CustomTXT02,
        @ProfileImage, 
        @SchedProcessed,
        @USgage,
        @SideLoaderApproval, 
        @MongoTemplateID
      );
    `);

  logger.info('[insertJobToSWI] Job inserted successfully:', jobId);
}

/**
 * Update existing job in SWI (MS-SQL UPDATE)
 *
 * @param {Object} pool - MS-SQL connection pool
 * @param {Object} template - Template object
 * @param {Object} entry - Grouped material row entry
 * @param {Object} geometryData - Prepared geometry data
 * @param {Object} dates - Prepared dates object
 * @param {String} jobName - Job name (order number)
 * @param {String} customer - Customer name
 * @param {String} jobId - Existing JobID to update
 * @param {String} shapeId - ShapeID (preserved from original)
 * @param {String} enteredBy - Original EnteredBy user (preserved)
 * @param {String} lastModifiedBy - Current user (LastModifiedBy)
 * @param {Date} enteredDate - Original EnteredDate (preserved)
 * @param {Object} preservedData - Preserved data (customTXT01, etc.)
 * @returns {Promise<void>}
 */
async function updateJobToSWI(
  pool,
  template,
  entry,
  geometryData,
  dates,
  jobName,
  customer,
  jobId,
  shapeId,
  enteredBy,
  lastModifiedBy,
  enteredDate,
  preservedData
) {
  logger.info('[updateJobToSWI] Updating job:', jobId);

  // Import shape descriptor utility (same as insertJobToSWI)
  const { generateShapeDescriptorDetailed } = require('../utils/shapeUtils');

  // Resolve lastModifiedBy userId to full name
  const resolvedLastModifiedBy = await resolveUserName(lastModifiedBy);
  logger.info('[updateJobToSWI] LastModifiedBy resolved:', { original: lastModifiedBy, resolved: resolvedLastModifiedBy });

  // Get geometry for this entry (split-aware)
  let farLengthsForDescriptor, nearLengthsForDescriptor, widthForDescriptor, farAnglesForDescriptor;
  let sheetLengthForDescriptor;

  if (entry.isSplit && entry.splitFar && entry.splitNear) {
    farLengthsForDescriptor = entry.splitFar;
    nearLengthsForDescriptor = entry.splitNear;

    // Calculate totals for split pieces
    const splitFarTotal = entry.splitFar.reduce((sum, v) => sum + v, 0);
    const splitNearTotal = entry.splitNear.reduce((sum, v) => sum + v, 0);

    // Add fold lengths to width (WITH folds for material width)
    let adjustedFarTotal = splitFarTotal;
    let adjustedNearTotal = splitNearTotal;

    if (template.startFoldType === 'SF' || template.startFoldType === 'SSF') {
      adjustedFarTotal += template.startFoldLength || 0;
      adjustedNearTotal += template.startFoldLength || 0;
    }
    if (template.endFoldType === 'SF' || template.endFoldType === 'SSF') {
      adjustedFarTotal += template.endFoldLength || 0;
      adjustedNearTotal += template.endFoldLength || 0;
    }

    widthForDescriptor = Math.max(adjustedFarTotal, adjustedNearTotal);
    sheetLengthForDescriptor = splitNearTotal;  // NEAR total WITHOUT folds for sheetLength
    farAnglesForDescriptor = geometryData.farAngles;
  } else {
    farLengthsForDescriptor = geometryData.farLengths;
    nearLengthsForDescriptor = geometryData.nearLengths;
    widthForDescriptor = geometryData.widthValue;
    sheetLengthForDescriptor = geometryData.sheetLength;
    farAnglesForDescriptor = geometryData.farAngles;
  }

  // Apply flip transformations
  const transformedFarAngles = transformAnglesForFlips(farAnglesForDescriptor, template);

  // Calculate rotation and reverse colours for shape descriptor
  const rotation = calculateRotation(template, transformedFarAngles);
  const reverseColours = calculateReverseColours(template);

  // For tapers, swap far/near lengths (same as insertJobToSWI)
  const lengthsForDescriptor = template.isTaper ? nearLengthsForDescriptor : farLengthsForDescriptor;
  const nearLengthsForTaper = template.isTaper ? farLengthsForDescriptor : nearLengthsForDescriptor;

  // For nearAngles: tapers use raw farAngles, non-tapers use transformed
  const nearAnglesForDescriptor_final = template.isTaper
    ? (geometryData.farAngles || [])
    : transformedFarAngles;

  // Taper width is the job length
  const taperWidthForDescriptor = entry.length || 1000;

  // Build shape descriptor using the same detailed function as INSERT
  // This ensures SWI can properly render the drawing
  const shapeDescriptor = generateShapeDescriptorDetailed({
    jobName,
    tag: entry.tag || shapeId || 'default',
    lengths: lengthsForDescriptor,
    angles: transformedFarAngles,
    material: entry.dbMaterial || '',
    colour: entry.dbColour || '',
    thickness: entry.thickness || template.thickness || 0.55,
    customer: customer,
    sheetLength: sheetLengthForDescriptor,
    widthOverride: widthForDescriptor,
    enteredDate: dates.enteredDate || enteredDate,
    deliveryDate: dates.deliveryDate,
    enteredBy: enteredBy,
    rotation: rotation,
    reverseColours: reverseColours,
    taper: !!template.isTaper,
    taperWidth: taperWidthForDescriptor,
    nearLengths: nearLengthsForTaper,
    nearAngles: nearAnglesForDescriptor_final,
    jobIds: [jobId],
    jobLengths: [entry.length || 1000],
    jobQuantities: [entry.totalQty || 1],
    startFoldType: template.startFoldType,
    startFoldDirection: template.startFoldDirection,
    startFoldLength: template.startFoldLength,
    endFoldType: template.endFoldType,
    endFoldDirection: template.endFoldDirection,
    endFoldLength: template.endFoldLength
  });

  logger.info('[updateJobToSWI] Shape descriptor generated using generateShapeDescriptorDetailed');

  // Calculate folds (using calculateFolds with transformedFarAngles to match INSERT logic)
  const folds = calculateFolds(transformedFarAngles, template, "Folds");

  // Get profile image - convert base64 to buffer (same as insertJobToSWI)
  let profileImage = null;
  const previewData = template.isTaper ? template.previewFar : template.preview;
  if (previewData && previewData.startsWith('data:image/png;base64,')) {
    const base64Data = previewData.replace(/^data:image\/png;base64,/, '');
    profileImage = Buffer.from(base64Data, 'base64');
  }
  logger.info('[updateJobToSWI] ProfileImage:', profileImage ? `${profileImage.length} bytes` : 'null');

  // UPDATE SQL statement
  const request = pool.request();

  request
    .input('JobID', sql.BigInt, jobId)
    .input('JobName', sql.NVarChar(64), jobName)
    .input('Customer', sql.NVarChar(64), customer)
    .input('Material', sql.NVarChar(64), entry.dbMaterial)
    .input('Colour', sql.NVarChar(64), entry.dbColour)
    .input('Thickness', sql.Float, entry.thickness || template.thickness || 0.55)
    .input('Width', sql.Float, widthForDescriptor)
    .input('Length', sql.Float, entry.length || 1000)
    .input('Quantity', sql.Int, entry.totalQty)
    .input('ShapeDescriptor', sql.NVarChar(sql.MAX), shapeDescriptor)
    .input('ShapeID', sql.NVarChar(64), shapeId)
    .input('Folds', sql.Int, folds)
    .input('SquashFolds', sql.Int, calculateFolds(transformedFarAngles, template, "SquashFolds"))
    // .input('Units', sql.Int, 0)  // Units is INT in SWI database, not NVarChar
    // .input('FoldOrder', sql.Int, 0)
    // .input('QtyCut', sql.Int, 0)
    // .input('QtyFolded', sql.Int, 0)
    // .input('SlitterToUse', sql.Int, 0)
    // .input('FolderToUse', sql.Int, 0)
    // .input('OffcutID', sql.NVarChar(64), '')
    // .input('AddressStreet', sql.NVarChar(64), '')
    // .input('AddressCity', sql.NVarChar(64), '')
    // .input('AddressState', sql.NVarChar(64), '')
    // .input('AddressCode', sql.NVarChar(64), '')
    .input('DeliveryDate', sql.DateTime, dates.deliveryDate)
    .input('Updated', sql.DateTime, dates.updated)
    .input('Taper', sql.Int, template.isTaper ? 1 : 0)
    // .input('dW', sql.Float, 0)
    // .input('dL', sql.Float, 0)
    // .input('DeliveryCode', sql.NVarChar(64), '')
    // .input('TotalWeight', sql.Float, 0)
    .input('FolderLibRef', sql.NVarChar(260), `${SWI_IMAGE_PATH}\\${shapeId}.png`)
    // .input('InvoicedDate', sql.Date, null)
    // .input('Cut', sql.DateTime, null)
    // .input('Folded', sql.DateTime, null)
    // .input('Phone', sql.NVarChar(16), '')
    // .input('DeliveryTime', sql.Time, null)
    // .input('CustomINT01', sql.Int, null)
    // .input('CustomINT02', sql.Int, null)
    .input('CustomTXT01', sql.NVarChar(64),
      // UPDATE mode: Use preserved value (original PO number)
      preservedData.customTXT01 || null
    )
    // .input('CustomTXT02', sql.NVarChar(64), '')
    // .input('CustomTXT03', sql.NVarChar(64), null)
    // .input('CustomTXT04', sql.NVarChar(64), null)
    // .input('CustomTXT05', sql.NVarChar(64), null)
    // .input('DeliveryAddrInstr', sql.NVarChar(256), null)
    // .input('Cancelled', sql.Int, null)
    .input('ProfileImage', sql.VarBinary, profileImage)
    // .input('CoilID', sql.NVarChar(36), null)
    // .input('SchedProcessed', sql.NVarChar(8), null)
    // .input('USgage', sql.NVarChar(16), null)
    // .input('RollformerID', sql.NVarChar(64), null)
    // .input('Category', sql.NVarChar(64), null)
    // .input('RowVersion_MYOB', sql.NVarChar(64), null)
    // .input('RowID_MYOB', sql.Int, null)
    // .input('InProductionSlitter', sql.NVarChar(64), null)
    .input('LastModifiedBy', sql.NVarChar(64), resolvedLastModifiedBy)
    // .input('CutBy', sql.NVarChar(128), null)
    // .input('FoldedBy', sql.NVarChar(128), null)
    // .input('TemplateID', sql.Int, null)
    // .input('BayN', sql.NVarChar(32), null)
    // .input('LoadN', sql.NVarChar(32), null)
    // .input('SOLine', sql.NVarChar(32), null)
    // .input('Pitch', sql.NVarChar(32), null)
    // .input('Site', sql.NVarChar(32), null)
    // .input('CoilCode', sql.NVarChar(64), null)
    // .input('ImportFile', sql.NVarChar(260), null)
    // .input('CostEstimatedLM_LF', sql.Float, null)
    // .input('CostActualLM_LF', sql.Float, null)
    // .input('CoilWidthUsed', sql.Int, null)
    // .input('BatchID', sql.Int, null)
    // .input('CloudID', sql.Int, null)
    // .input('Status', sql.Int, null)
    // .input('SideLoaderApproval', sql.Int, null)
    // .input('OnlineOrderStatus', sql.NVarChar(24), null)
    // .input('OnlineOrderId', sql.NVarChar(24), null)
    // .input('Price', sql.Int, null)
    // .input('ERP_status', sql.Int, null);

  // NOTE: Rotation and ReverseColours are NOT separate columns in SWI database
  // They are stored inside the ShapeDescriptor JSON field only

  await request.query(`
    UPDATE Jobs
    SET
      JobName = @JobName,
      Customer = @Customer,
      Material = @Material,
      Colour = @Colour,
      Thickness = @Thickness,
      Width = @Width,
      Length = @Length,
      Quantity = @Quantity,
      ShapeDescriptor = @ShapeDescriptor,
      ShapeID = @ShapeID,
      Folds = @Folds,
      SquashFolds = @SquashFolds,
      DeliveryDate = @DeliveryDate,
      Updated = @Updated,
      Taper = @Taper,
      FolderLibRef = @FolderLibRef,
      CustomTXT01 = @CustomTXT01,
      ProfileImage = @ProfileImage,
      LastModifiedBy = @LastModifiedBy
    WHERE JobID = @JobID
  `);

  logger.info('[updateJobToSWI] Job updated successfully:', jobId);
}

// ============================================================================
// MONGODB CRM SYNCHRONIZATION
// ============================================================================

/**
 * Update or create OrderItem in MongoDB CRM
 * Syncs SWI job with CRM order system
 *
 * @param {String} jobId - SWI JobID
 * @param {String} jobName - Order number
 * @param {Object} materialData - Material/color/dimensions data
 * @param {Object} template - Template object
 * @returns {Promise<Object>} Result with action and orderItem
 */
exports.updateOrCreateOrderItem = async (jobId, jobName, materialData, template) => {
  const AWF_CUST_ID = process.env.AWF_CUSTOMER_ID;
  logger.info('[updateOrCreateOrderItem] Syncing JobID:', jobId, 'to OrderItem');

  try {
    // Import models
    const mongoose = require('mongoose');
    const OrderMaster = require('../models/ordermasterModel');
    const CoreProduct = require('../models/coreproductModel');
    const ProductColor = require('../models/productcolorModel');
    const ProductGirth = require('../models/productgirthModel');
    const ProductFold = require('../models/productfoldModel');
    const OrderItemManual = require('../models/orderitemmanualModel');
    const OrderItem = require('../models/orderitemModel');
    const { RecalculateOverallOrderTotalFn } = require('../controllers/ordermanagementCtrl');
    const { RecalculateOrderItemsCountFn } = require('../controllers/ordermanagementCtrl');
    const { RecalculateUserJobCountFn } = require('../controllers/ordermanagementCtrl');

    // Step 1: Fetch OrderMaster
    logger.debug('[updateOrCreateOrderItem] Step 1: Fetching OrderMaster');
    const ordMasDetails = await OrderMaster.aggregate([
      { $match: {
        $expr: {
          $or: [
            { $eq: [ "$order_unique_id", jobName ] },
            {
              $and: [
                { $eq: [ "$order_customer_UID", AWF_CUST_ID ] },
                { $eq: [{ $substr: [ "$order_customer_PO_number", 0, 6 ] }, jobName ]}
              ]
            }
          ]
        }
      }}
    ]).then(results => results[0]);
    if (!ordMasDetails) {
      throw new Error(`OrderMaster not found for order: ${jobName}`);
    }

    const dept_code = "F";
    const ordMasUID = ordMasDetails.order_unique_id;
    const ordCusID = ordMasDetails.order_customer_id;
    const ordDesignerID = ordMasDetails.order_designed_person;
    const ordMasID = ordMasDetails._id;

    // Step 2: Material Lookup
    logger.debug('[updateOrCreateOrderItem] Step 2: Looking up CoreProduct');
    const ordItemMaterialDetails = await CoreProduct.findOne({
      core_Product_Name: { $regex: new RegExp(`^${materialData.dbMaterial}$`, 'i') }
    });

    if (!ordItemMaterialDetails) {
      throw new Error(`CoreProduct not found for material: ${materialData.dbMaterial}`);
    }

    // Check if material starts with GALVANISED (covers GALVANISED 0.55, GALVANISED 0.95, GALVANISED 1.2, etc.)
    const isGalvanised = ordItemMaterialDetails.core_Product_Name.toUpperCase().startsWith("GALVANISED");
    const maxGirthValue = isGalvanised ? 1220 : 1203;

    const ordItemMaterial = ordItemMaterialDetails._id;
    const ordItemMaterialObj = new mongoose.Types.ObjectId(ordItemMaterialDetails._id);
    const orderMaterialCode = ordItemMaterialDetails.core_Product_Ref_Id;
    const orderMaterialThickness = ordItemMaterialDetails.core_Product_Thickness;

    // Step 3: Color Lookup
    logger.debug('[updateOrCreateOrderItem] Step 3: Looking up ProductColor');
    const ordItemProdColorDetails = await ProductColor.findOne({
      product_Color: materialData.dbColour,
      product_Core_Id: ordItemMaterialObj
    });

    if (!ordItemProdColorDetails) {
      throw new Error(`ProductColor not found: ${materialData.dbColour} for material ${materialData.dbMaterial}`);
    }

    const ordItemProdColor = ordItemProdColorDetails._id;
    const ColorCode = ordItemProdColorDetails.product_Color_Code;
    const Color = ordItemProdColorDetails.product_Color;
    const colorSpecialPrice = ordItemProdColorDetails.product_Color_Special_Price || 0;

    // Step 4: Girth Calculation (cap at 1200)
    logger.debug('[updateOrCreateOrderItem] Step 4: Calculating girth');
    let girth = materialData.descriptorWidthValue;
    let exact_girth = materialData.descriptorWidthValue;
    if (typeof exact_girth === 'string' && exact_girth.includes('.')) {
      exact_girth = Math.ceil(parseFloat(exact_girth));
    } else if (typeof exact_girth === 'string') {
      exact_girth = parseInt(exact_girth, 10);
    } else if (typeof exact_girth === 'number' && !Number.isInteger(exact_girth)) {
      exact_girth = Math.ceil(exact_girth);
    }

    // Normalize girth to 1200 if within tolerance range based on material type
    // Galvanised: 1200-1220 → 1200, Others: 1200-1203 → 1200
    if (isGalvanised && girth >= 1200 && girth <= 1220) {
      girth = 1200;
    } else if (!isGalvanised && girth >= 1200 && girth <= 1203) {
      girth = 1200;
    }

    let maxGirthData;
    if (girth > maxGirthValue) {
      girth = 1200;
      maxGirthData = await ProductGirth.findOne({product_Girth: {$gte: materialData.length}}).sort({ product_Girth: 1 });
    }

    const girthData = await ProductGirth.findOne({ product_Girth: { $gte: girth } }).sort({ product_Girth: 1 });
    if (!girthData) {
      throw new Error(`ProductGirth not found for girth >= ${girth}`);
    }
    const roundedGirthID = girthData._id;
    let GirthCode = girthData.product_Girth;
    if (maxGirthData) {
      GirthCode = maxGirthData.product_Girth;
      girth = maxGirthData.length;
    }
    // Step 5: Folds Calculation
    logger.debug('[updateOrCreateOrderItem] Step 5: Calculating folds');
    let FinalFold = 0;
    let ExactFinalFold = 0;

    if (template.bends !== undefined && template.bends !== null) {
      FinalFold = parseInt(template.bends);
      ExactFinalFold = parseInt(template.bends);
    } else {
      const NormalFold = calculateFolds(materialData.farAngles, template, "Folds");
      const SquashFold = calculateFolds(materialData.farAngles, template, "SquashFolds");
      FinalFold = parseInt(NormalFold);
      ExactFinalFold = parseInt(NormalFold) ;
    }

    // Check if any angle is between 170 and 180 (or -170 to -180) - add 1 to fold
    const anglesToCheck = template.angles || materialData.farAngles || [];
    const hasNearFlatAngle = anglesToCheck.some(angle => {
      const absAngle = Math.abs(angle);
      return absAngle >= 170 && absAngle <= 180;
    });
    if (hasNearFlatAngle) {
      FinalFold += 1;
      ExactFinalFold += 1;
      logger.debug('[updateOrCreateOrderItem] Added 1 fold for near-flat angle (170-180 degrees)');
    }

    if (FinalFold > 10) FinalFold = 10;

    // Look up or auto-create ProductFold
    let ordItemFoldDetails = await ProductFold.findOne({ product_Fold: FinalFold.toString() });

    if (!ordItemFoldDetails) {
      logger.warn('[updateOrCreateOrderItem] ProductFold not found, auto-creating for fold:', FinalFold);
      try {
        ordItemFoldDetails = await ProductFold.findOneAndUpdate(
          { product_Fold: FinalFold.toString() },
          {
            $setOnInsert: {
              product_Fold: FinalFold.toString(),
              product_Fold_Status: "Active",
              product_Fold_Order: FinalFold,
              created: new Date()
            }
          },
          {
            upsert: true,
            new: true,
            setDefaultsOnInsert: true
          }
        );
        logger.info('[updateOrCreateOrderItem] Created ProductFold:', FinalFold);
      } catch (upsertError) {
        throw new Error(`Failed to create ProductFold: ${upsertError.message}`);
      }
    }

    const ordItemFold = ordItemFoldDetails._id;
    const FoldCode = ordItemFoldDetails.product_Fold;
    // Step 6: Generate Item Code and Description
    const finalItemCode = `${ColorCode}${GirthCode}G${FoldCode}F`;
    const finalItemDescription = `${orderMaterialThickness} ${Color} ${orderMaterialCode} ${GirthCode}G/${FoldCode}F`;

    // Step 7: Price Calculations
    logger.debug('[updateOrCreateOrderItem] Step 7: Calculating prices');
    const defaultmaterialPrice = materialData.unitPrice || 0;
    let qtyAddedMaterialPrice = materialData?.splitInto ? (materialData.extPrice / materialData.splitInto) : materialData.extPrice || 0;

    // Normalize job length to minimum 1000mm
    let joblength = materialData.length < 1000 ? 1000 : materialData.length;
    const totalLength = exact_girth > maxGirthValue ? exact_girth : joblength;
    const orderPieces = parseFloat(materialData.totalQty) * parseFloat(totalLength / 1000);

    // Apply color special price if exists
    if (parseFloat(colorSpecialPrice) > 0) {
      qtyAddedMaterialPrice = parseFloat(qtyAddedMaterialPrice) +
        (parseFloat(qtyAddedMaterialPrice) * parseFloat(colorSpecialPrice) / 100);
    }

    // Step 8: Row Index Calculation
    logger.debug('[updateOrCreateOrderItem] Step 8: Calculating row index');
    let index = 0;
    
    // Check largest index from OrderItemManual
    const OrderCustomItems = await OrderItemManual.find({ order_master_me_id: ordMasID });
    const manualRowIndexes = OrderCustomItems.map(item => item.order_row_index);
    const largestManualIndex = manualRowIndexes.length > 0 ? Math.max(...manualRowIndexes) : 0;
    
    // Check largest index from OrderItem
    const OrderItems = await OrderItem.find({ order_master_id: ordMasID });
    const orderRowIndexes = OrderItems.map(item => item.order_row_index);
    const largestOrderIndex = orderRowIndexes.length > 0 ? Math.max(...orderRowIndexes) : 0;
    
    // Use the maximum from both collections
    const LargestIndex = Math.max(largestManualIndex, largestOrderIndex);
    logger.debug(`[updateOrCreateOrderItem] Largest index - Manual: ${largestManualIndex}, Order: ${largestOrderIndex}, Using: ${LargestIndex}`);
    
    index = LargestIndex + 1;
    // Step 9: Prepare OrderItem Data
    const orderItemData = {
      order_row_index: index,
      order_master_id: ordMasID,
      order_unique_id: ordMasUID,
      order_item_unique_id: jobId,
      order_item_material: ordItemMaterial,
      order_item_color: ordItemProdColor,
      order_item_exact_grith: exact_girth,
      order_item_round_grith: roundedGirthID,
      order_item_exact_fold: ExactFinalFold,
      order_item_fold: ordItemFold,
      order_item_length: exact_girth > maxGirthValue ? exact_girth : materialData.length,
      order_item_quantity: orderPieces,
      order_item_pieces: materialData.totalQty,
      order_item_price: defaultmaterialPrice,
      order_item_qty_price: qtyAddedMaterialPrice,
      order_item_special_price: qtyAddedMaterialPrice,
      order_item_special_price_original: qtyAddedMaterialPrice,
      order_item_code: finalItemCode,
      order_item_description: finalItemDescription,
      order_item_designer: ordDesignerID,
      order_item_flag: "DT",
      order_item_shape_id: materialData.shapeID,
    };

    // Step 10: UPDATE or INSERT
    const existingOrderItem = await OrderItem.findOne({ order_item_unique_id: jobId });

    let result;
    if (existingOrderItem) {
      // UPDATE existing - exclude order_row_index to preserve original value
      logger.info('[updateOrCreateOrderItem] Updating existing OrderItem for JobID:', jobId);
      const { order_row_index, ...updateData } = orderItemData;
      const updatedItem = await OrderItem.findByIdAndUpdate(
        existingOrderItem._id,
        { ...updateData, updated: new Date() },
        { new: true }
      );

      result = { action: 'updated', orderItem: updatedItem };
    } else {
      // INSERT new
      logger.info('[updateOrCreateOrderItem] Creating new OrderItem for JobID:', jobId);
      const orderItemDoc = new OrderItem(orderItemData);
      const newItem = await orderItemDoc.save();

      result = { action: 'inserted', orderItem: newItem };
    }

    // Step 11: Recalculate Order Totals
    logger.debug('[updateOrCreateOrderItem] Step 11: Recalculating order totals');
    await RecalculateOverallOrderTotalFn(ordMasID);
    await RecalculateOrderItemsCountFn(ordMasDetails._id);
    await RecalculateUserJobCountFn(ordMasDetails._id, dept_code);

    logger.info('[updateOrCreateOrderItem] SUCCESS:', result.action, 'OrderItem for JobID:', jobId);
    return result;

  } catch (error) {
    logger.error('[updateOrCreateOrderItem] ERROR for JobID:', jobId, '-', error.message);
    throw error;
  }
};

/**
 * Update or create QuotationItem in MongoDB CRM
 * Syncs SWI job with CRM quotation system
 *
 * @param {String} jobId - SWI JobID
 * @param {String} jobName - Quotation number
 * @param {Object} materialData - Material/color/dimensions data
 * @param {Object} template - Template object
 * @returns {Promise<Object>} Result with action and quotationItem
 */
exports.updateOrCreateQuotationItem = async (jobId, jobName, materialData, template) => {
  logger.info('[updateOrCreateQuotationItem] Syncing JobID:', jobId, 'to QuotationItem');

  try {
    // Import models
    const mongoose = require('mongoose');
    const QuotationMaster = require('../models/quotationmasterModel');
    const CoreProduct = require('../models/coreproductModel');
    const ProductColor = require('../models/productcolorModel');
    const ProductGirth = require('../models/productgirthModel');
    const ProductFold = require('../models/productfoldModel');
    const QuotationItem = require('../models/quotationitemModel');
    const { RecalculateOverallQuotesTotalFn } = require('../controllers/ordermanagementCtrl');

    // Step 1: Fetch QuotationMaster
    logger.debug('[updateOrCreateQuotationItem] Step 1: Fetching QuotationMaster');
    const quoteMasDetails = await QuotationMaster.findOne({ quote_unique_id: jobName });

    if (!quoteMasDetails) {
      throw new Error(`QuotationMaster not found for quote: ${jobName}`);
    }

    const quoteMasUID = quoteMasDetails.quote_unique_id;
    const quoteCusID = quoteMasDetails.quote_customer_id;
    const quoteDesignerID = quoteMasDetails.quote_designed_person;
    const quoteMasID = quoteMasDetails._id;

    // Step 2: Material Lookup (same as OrderItem)
    logger.debug('[updateOrCreateQuotationItem] Step 2: Looking up CoreProduct');
    const quoteItemMaterialDetails = await CoreProduct.findOne({
      core_Product_Name: { $regex: new RegExp(`^${materialData.dbMaterial}$`, 'i') }
    });

    if (!quoteItemMaterialDetails) {
      throw new Error(`CoreProduct not found for material: ${materialData.dbMaterial}`);
    }

    // Check if material starts with GALVANISED (covers GALVANISED 0.55, GALVANISED 0.95, GALVANISED 1.2, etc.)
    const isGalvanised = quoteItemMaterialDetails.core_Product_Name.toUpperCase().startsWith("GALVANISED");
    const maxGirthValue = isGalvanised ? 1220 : 1203;

    const quoteItemMaterial = quoteItemMaterialDetails._id;
    const quoteItemMaterialObj = new mongoose.Types.ObjectId(quoteItemMaterialDetails._id);
    const quoteMaterialCode = quoteItemMaterialDetails.core_Product_Ref_Id;
    const quoteMaterialThickness = quoteItemMaterialDetails.core_Product_Thickness;

    // Step 3: Color Lookup
    logger.debug('[updateOrCreateQuotationItem] Step 3: Looking up ProductColor');
    const quoteItemProdColorDetails = await ProductColor.findOne({
      product_Color: materialData.dbColour,
      product_Core_Id: quoteItemMaterialObj
    });

    if (!quoteItemProdColorDetails) {
      throw new Error(`ProductColor not found: ${materialData.dbColour} for material ${materialData.dbMaterial}`);
    }

    const quoteItemProdColor = quoteItemProdColorDetails._id;
    const ColorCode = quoteItemProdColorDetails.product_Color_Code;
    const Color = quoteItemProdColorDetails.product_Color;
    const colorSpecialPrice = quoteItemProdColorDetails.product_Color_Special_Price || 0;

    // Step 4: Girth Calculation (cap at 1200)
    logger.debug('[updateOrCreateQuotationItem] Step 4: Calculating girth');
    let girth = materialData.descriptorWidthValue;
    let exact_girth = materialData.descriptorWidthValue;
    if (typeof exact_girth === 'string' && exact_girth.includes('.')) {
      exact_girth = Math.ceil(parseFloat(exact_girth));
    } else if (typeof exact_girth === 'string') {
      exact_girth = parseInt(exact_girth, 10);
    } else if (typeof exact_girth === 'number' && !Number.isInteger(exact_girth)) {
      exact_girth = Math.ceil(exact_girth);
    }
    
    // Normalize girth to 1200 if within tolerance range based on material type
    // Galvanised: 1200-1220 → 1200, Others: 1200-1203 → 1200
    if (isGalvanised && girth >= 1200 && girth <= 1220) {
      girth = 1200;
    } else if (!isGalvanised && girth >= 1200 && girth <= 1203) {
      girth = 1200;
    }
    let maxGirthData;
    if (girth > maxGirthValue) {
      girth = 1200;
      maxGirthData = await ProductGirth.findOne({product_Girth: {$gte: materialData.length}}).sort({ product_Girth: 1 });
    }

    const girthData = await ProductGirth.findOne({ product_Girth: { $gte: girth } }).sort({ product_Girth: 1 });
    if (!girthData) {
      throw new Error(`ProductGirth not found for girth >= ${girth}`);
    }
    const roundedGirthID = girthData._id;
    let GirthCode = girthData.product_Girth;
    if (maxGirthData) {
      GirthCode = maxGirthData.product_Girth;
      girth = maxGirthData.length;
    }

    // Step 5: Folds Calculation
    logger.debug('[updateOrCreateQuotationItem] Step 5: Calculating folds');
    let FinalFold = 0;
    let ExactFinalFold = 0;

    if (template.bends !== undefined && template.bends !== null) {
      FinalFold = parseInt(template.bends);
      ExactFinalFold = parseInt(template.bends);
    } else {
      const NormalFold = calculateFolds(materialData.farAngles, template, "Folds");
      const SquashFold = calculateFolds(materialData.farAngles, template, "SquashFolds");
      FinalFold = parseInt(NormalFold);
      ExactFinalFold = parseInt(NormalFold);
    }

    // Check if any angle is between 170 and 180 (or -170 to -180) - add 1 to fold
    const anglesToCheck = template.angles || materialData.farAngles || [];
    const hasNearFlatAngle = anglesToCheck.some(angle => {
      const absAngle = Math.abs(angle);
      return absAngle >= 170 && absAngle <= 180;
    });
    if (hasNearFlatAngle) {
      FinalFold += 1;
      ExactFinalFold += 1;
      logger.debug('[updateOrCreateQuotationItem] Added 1 fold for near-flat angle (170-180 degrees)');
    }

    if (FinalFold > 10) FinalFold = 10;

    // Look up or auto-create ProductFold
    let quoteItemFoldDetails = await ProductFold.findOne({ product_Fold: FinalFold.toString() });

    if (!quoteItemFoldDetails) {
      logger.warn('[updateOrCreateQuotationItem] ProductFold not found, auto-creating for fold:', FinalFold);
      try {
        quoteItemFoldDetails = await ProductFold.findOneAndUpdate(
          { product_Fold: FinalFold.toString() },
          {
            $setOnInsert: {
              product_Fold: FinalFold.toString(),
              product_Fold_Status: "Active",
              product_Fold_Order: FinalFold,
              created: new Date()
            }
          },
          {
            upsert: true,
            new: true,
            setDefaultsOnInsert: true
          }
        );
        logger.info('[updateOrCreateQuotationItem] Created ProductFold:', FinalFold);
      } catch (upsertError) {
        throw new Error(`Failed to create ProductFold: ${upsertError.message}`);
      }
    }

    const quoteItemFold = quoteItemFoldDetails._id;
    const FoldCode = quoteItemFoldDetails.product_Fold;

    // Step 6: Generate Item Code and Description
    const finalItemCode = `${ColorCode}${GirthCode}G${FoldCode}F`;
    const finalItemDescription = `${quoteMaterialThickness} ${Color} ${quoteMaterialCode} ${GirthCode}G/${FoldCode}F`;

    // Step 7: Price Calculations
    logger.debug('[updateOrCreateQuotationItem] Step 7: Calculating prices');
    const defaultmaterialPrice = materialData.unitPrice || 0;
    let qtyAddedMaterialPrice = materialData?.splitInto ? (materialData.extPrice / materialData.splitInto) : materialData.extPrice || 0;

    // Normalize job length to minimum 1000mm
    let joblength = materialData.length < 1000 ? 1000 : materialData.length;
    const totalLength = exact_girth > 1200 ? exact_girth : joblength;
    const quotePieces = parseFloat(materialData.totalQty) * parseFloat(totalLength / 1000);

    // Apply color special price if exists
    if (parseFloat(colorSpecialPrice) > 0) {
      qtyAddedMaterialPrice = parseFloat(qtyAddedMaterialPrice) +
        (parseFloat(qtyAddedMaterialPrice) * parseFloat(colorSpecialPrice) / 100);
    }
    // Step 8: Prepare QuotationItem Data
    const quotationItemData = {
      quote_master_id: quoteMasID,
      quote_unique_id: quoteMasUID,
      quote_item_unique_id: jobId,
      quote_item_material: quoteItemMaterial,
      quote_item_color: quoteItemProdColor,
      quote_item_exact_grith: exact_girth,
      quote_item_round_grith: roundedGirthID,
      quote_item_exact_fold: ExactFinalFold,
      quote_item_fold: quoteItemFold,
      quote_item_length: exact_girth > 1200 ? exact_girth : materialData.length,
      quote_item_quantity: quotePieces,
      quote_item_pieces: materialData.totalQty,
      quote_item_price: defaultmaterialPrice,
      quote_item_qty_price: qtyAddedMaterialPrice,
      quote_item_special_price: qtyAddedMaterialPrice,
      quote_item_special_price_original: qtyAddedMaterialPrice,
      quote_item_code: finalItemCode,
      quote_item_description: finalItemDescription,
      quote_item_designer: quoteDesignerID,
      quote_item_flag: "DT",
      quote_item_shape_id: materialData.shapeID,
    };

    // Step 9: UPDATE or INSERT
    const existingQuotationItem = await QuotationItem.findOne({ quote_item_unique_id: jobId });

    let result;
    if (existingQuotationItem) {
      // UPDATE existing
      logger.info('[updateOrCreateQuotationItem] Updating existing QuotationItem for JobID:', jobId);
      const updatedItem = await QuotationItem.findByIdAndUpdate(
        existingQuotationItem._id,
        { ...quotationItemData, updated: new Date() },
        { new: true }
      );

      result = { action: 'updated', quotationItem: updatedItem };
    } else {
      // INSERT new
      logger.info('[updateOrCreateQuotationItem] Creating new QuotationItem for JobID:', jobId);
      const quotationItemDoc = new QuotationItem(quotationItemData);
      const newItem = await quotationItemDoc.save();

      result = { action: 'inserted', quotationItem: newItem };
    }

    // Step 10: Recalculate Quotation Totals
    logger.debug('[updateOrCreateQuotationItem] Step 10: Recalculating quotation totals');
    await RecalculateOverallQuotesTotalFn(quoteMasID);

    logger.info('[updateOrCreateQuotationItem] SUCCESS:', result.action, 'QuotationItem for JobID:', jobId);
    return result;

  } catch (error) {
    logger.error('[updateOrCreateQuotationItem] ERROR for JobID:', jobId, '-', error.message);
    throw error;
  }
};

// ============================================================================
