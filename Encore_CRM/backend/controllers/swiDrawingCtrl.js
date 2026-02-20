/**
 * SWI Drawing Controller - Utility Functions Only
 *
 * Main SWI operations (insert/update/repush) are handled by:
 * - templateUnifiedCtrl.js via swiService.js
 *
 * This file only contains utility functions:
 * - checkSWIJobStatus: Bulk check if SWI Job IDs exist in database
 */

const sql = require('mssql');
const dbPool = require('../utils/dbPool');
const OrderItem = require('../models/orderitemModel');
const QuoteItem = require('../models/quotationitemModel');
const logger = require('../logger');
const { logError } = require("../logger");
const OrderMaster = require('../models/ordermasterModel');
const { RecalculateOverallOrderTotalFn, RecalculateOrderItemsCountFn } = require('./ordermanagementCtrl');

// Bulk check if SWI Job IDs still exist in the database
exports.checkSWIJobStatus = async (req, res) => {
  const { jobIds } = req.body; // Array of Job IDs to check

  if (!jobIds || !Array.isArray(jobIds) || jobIds.length === 0) {
    return res.status(400).json({
      success: false,
      message: 'No Job IDs provided'
    });
  }

  try {
    // Use connection pool for production safety
    const result = await dbPool.executeQuery(async (pool) => {

    // Build safe parameterized query - also fetch Shape ID
    const placeholders = jobIds.map((_, index) => `@jobId${index}`).join(',');
    const query = `SELECT JobID, ShapeID FROM dbo.Jobs WHERE JobID IN (${placeholders})`;

    const request = pool.request();

    let deletedJobIds = [];
    // Add each Job ID as a parameter
    jobIds.forEach((jobId, index) => {
      request.input(`jobId${index}`, sql.BigInt, jobId);
    });

      const result = await request.query(query);

      // Build map of existing Job IDs with their Shape IDs
      const existingJobs = {};
      result.recordset.forEach(row => {
        existingJobs[row.JobID.toString()] = row.ShapeID;
      });

      // Build status map for each Job ID with Shape ID
      const statusMap = {};
      const shapeIdMap = {};
      jobIds.forEach(jobId => {
        const jobIdStr = jobId.toString();
        if (existingJobs.hasOwnProperty(jobIdStr)) {
          statusMap[jobId] = 'active';
          shapeIdMap[jobId] = existingJobs[jobIdStr];
        } else {
          statusMap[jobId] = 'deleted';
          shapeIdMap[jobId] = null;
        }
      });

      const activeCount = Object.values(statusMap).filter(s => s === 'active').length;
      const deletedCount = Object.values(statusMap).filter(s => s === 'deleted').length;
      logger.info(`[checkSWIJobStatus] Status mapping complete - Active: ${activeCount}, Deleted: ${deletedCount}`);

      deletedJobIds = Object.keys(statusMap).filter(jobId => statusMap[jobId] === 'deleted');
      if (deletedJobIds.length > 0) {
        logger.info(`[checkSWIJobStatus] Cleaning up items for ${deletedJobIds.length} deleted jobs by ${req.user.user_ref_id}`);
        
        // First, find the items in OrderItem to determine their order_unique_id
        const itemsToCheck = await OrderItem.find(
          { order_item_unique_id: { $in: deletedJobIds } },
          { order_item_unique_id: 1, order_unique_id: 1 }
        );
        
        // Separate job IDs based on order_unique_id prefix
        const orderJobIds = []; // For IN prefix - delete from OrderItem
        const quoteJobIds = []; // For QT prefix - delete from QuoteItem
        
        itemsToCheck.forEach(item => {
          if (item.order_unique_id && item.order_unique_id.startsWith('IN')) {
            orderJobIds.push(item.order_item_unique_id);
          } else if (item.order_unique_id && item.order_unique_id.startsWith('QT')) {
            quoteJobIds.push(item.order_item_unique_id);
          }
        });
        
        let orderItemDeleteCount = 0;
        let quoteItemDeleteCount = 0;
        
        // Delete from OrderItem for IN prefix
        if (orderJobIds.length > 0) {
          const orderItemDeleteResult = await OrderItem.deleteMany({ order_item_unique_id: { $in: orderJobIds } });
          orderItemDeleteCount = orderItemDeleteResult.deletedCount;
          logger.info(`[checkSWIJobStatus] Deleted ${orderItemDeleteCount} OrderItems (IN prefix) for deleted jobs by ${req.user.user_ref_id}`);
        }
        
        // Delete from QuoteItem for QT prefix
        if (quoteJobIds.length > 0) {
          const quoteItemDeleteResult = await QuoteItem.deleteMany({ quote_item_unique_id: { $in: quoteJobIds } });
          quoteItemDeleteCount = quoteItemDeleteResult.deletedCount;
          logger.info(`[checkSWIJobStatus] Deleted ${quoteItemDeleteCount} QuoteItems (QT prefix) for deleted jobs by ${req.user.user_ref_id}`);
        }
        
        const totalDeleted = orderItemDeleteCount + quoteItemDeleteCount;
        if (totalDeleted > 0) {
          logError("Deleting line items", new Error(`Deleting ${totalDeleted} line items (${orderItemDeleteCount} orders, ${quoteItemDeleteCount} quotes) those are deleted in SWI`), req.user.user_ref_id);
        }
        deletedJobIds = []; // Clear deletedJobIds after cleanup
      } else {
        logger.info('[checkSWIJobStatus] No deleted jobs found, skipping order item cleanup');
      }

      deletedJobIds = []; // Clear deletedJobIds after processing
      return { statusMap, shapeIdMap };
    });

    logger.info(`[checkSWIJobStatus] Successfully completed. Returning response with ${Object.keys(result.statusMap).length} statuses`);

    res.json({
      success: true,
      statusMap: result.statusMap,
      shapeIdMap: result.shapeIdMap,
      checkedAt: new Date().toISOString()
    });

  } catch (error) {
    logError('checkSWIJobStatus', error, req.user.user_ref_id);

    // Return error status for all Job IDs if check fails
    const statusMap = {};
    jobIds.forEach(jobId => {
      statusMap[jobId] = 'error';
    });

    res.status(500).json({
      success: false,
      statusMap,
      message: 'Unable to verify SWI status'
    });
  }
};
