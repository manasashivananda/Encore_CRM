/**
 * Template API Service
 *
 * Centralized service for template-related API calls
 * Uses the new unified template API endpoints
 *
 * Created: Day 9 - November 24, 2025
 */

import axios from 'axios';
import { buildApiUrl, tokenManager } from '../config/api.config';
import { logger } from '../utils/logger';

/**
 * Create a complete template with material rows in a single atomic transaction
 *
 * @param {Object} params - Template creation parameters
 * @param {Object} params.templateData - Template data (name, lengths, angles, etc.)
 * @param {Array} params.materialRows - Array of material row objects
 * @param {boolean} params.enableS3 - Whether to upload previews to S3 (optional, default: false)
 * @param {boolean} params.enableSWI - Whether to push to SWI database (optional, default: false)
 * @param {Object} params.swiData - SWI-specific data (required if enableSWI=true)
 * @param {boolean} params.bypassDuplicateCheck - Skip duplicate checking (optional, default: false)
 *
 * @returns {Promise<Object>} API response with template, materialRows, s3Keys, swiJobIds
 *
 * @example
 * const result = await createTemplateComplete({
 *   templateData: {
 *     geometryName: 'Test Job',
 *     orderNumber: 'IN240001',
 *     customerName: 'ACME Corp',
 *     width: 1200,
 *     length: 2400,
 *     thickness: 0.55,
 *     material: 'COLORBOND',
 *     colour: 'SURFMIST',
 *     fold1: 90,
 *     fold2: 90,
 *     // ... other template fields
 *   },
 *   materialRows: [
 *     {
 *       material: 'COLORBOND',
 *       color: 'SURFMIST',
 *       quantity: 10,
 *       length: 1200,
 *       tag: 'FL',
 *       unitPrice: 25.50,
 *       extPrice: 255.00
 *     }
 *   ],
 *   enableS3: false,
 *   enableSWI: true,
 *   swiData: {
 *     orderNumber: 'IN240001',
 *     customerName: 'ACME Corp',
 *     deliveryDate: '25-11-2024',
 *     enteredBy: 'userId123'
 *   }
 * });
 */
export const createTemplateComplete = async ({
  templateData,
  materialRows,
  enableS3 = false,
  enableSWI = false,
  swiData = null,
  bypassDuplicateCheck = false
}) => {
  try {
    logger.info('[templateApi] Creating template with unified API', {
      orderNumber: templateData?.orderNumber,
      materialRowsCount: materialRows?.length,
      enableS3,
      enableSWI
    });

    // Validate required parameters
    if (!templateData || !materialRows) {
      throw new Error('templateData and materialRows are required');
    }

    if (enableSWI && !swiData) {
      throw new Error('swiData is required when enableSWI is true');
    }

    // Build API URL
    const url = buildApiUrl('api/templates/unified');

    // Get auth token
    const token = tokenManager.getToken();
    if (!token) {
      throw new Error('Authentication token not found');
    }

    // Make API request
    const response = await axios.post(
      url,
      {
        templateData,
        materialRows,
        enableS3,
        enableSWI,
        swiData,
        bypassDuplicateCheck
      },
      {
        headers: {
          'x-access-token': token,
          'Accept': 'application/json',
          'Content-Type': 'application/json'
        },
        timeout: 120000 // 120 seconds for template creation (may involve S3/SWI)
      }
    );

    logger.info('[templateApi] Template created successfully', {
      templateId: response.data?.data?.template?._id,
      materialRowsCount: response.data?.data?.materialRows?.length,
      swiJobsCount: response.data?.data?.swiJobIds?.length
    });

    return {
      success: true,
      data: response.data.data,
      message: response.data.message
    };

  } catch (error) {
    logger.error('[templateApi] Template creation failed', error);

    // Handle different error types
    if (error.response) {
      // Server responded with error status
      const errorData = error.response.data;

      return {
        success: false,
        error: errorData.error || 'Template creation failed',
        code: errorData.code,
        message: errorData.message,
        errors: errorData.errors, // Validation errors
        duplicates: errorData.duplicates, // Duplicate templates
        rollbackCompleted: errorData.rollbackCompleted
      };
    } else if (error.request) {
      // Request made but no response
      return {
        success: false,
        error: 'Network error',
        code: 'NETWORK_ERROR',
        message: 'No response from server. Please check your connection.'
      };
    } else {
      // Request setup error
      return {
        success: false,
        error: 'Request error',
        code: 'REQUEST_ERROR',
        message: error.message
      };
    }
  }
};

/**
 * Re-push deleted SWI jobs for selected material rows
 *
 * @param {Object} params - REPUSH parameters
 * @param {string} params.templateId - Template ID
 * @param {Array<number>} params.rowIndices - Material row indices to repush (0-indexed)
 * @param {string} params.orderNumber - Order number (optional)
 * @param {string} params.customerName - Customer name (optional)
 * @param {string} params.customerPoNumber - Customer PO number (optional)
 * @param {string} params.deliveryDate - Delivery date in DD-MM-YYYY format (optional)
 * @param {string} params.enteredBy - User ID (optional)
 *
 * @returns {Promise<Object>} API response with updated template and new job IDs
 *
 * @example
 * const result = await repushTemplateToSWI({
 *   templateId: '673d1234567890abcdef1234',
 *   rowIndices: [0, 2, 4],
 *   orderNumber: 'IN240001',
 *   customerName: 'ACME Corp',
 *   deliveryDate: '25-11-2024'
 * });
 */
export const repushTemplateToSWI = async ({
  templateId,
  rowIndices,
  orderNumber = '',
  customerName = '',
  customerPoNumber = '',
  deliveryDate = '',
  enteredBy = ''
}) => {
  try {
    logger.info('[templateApi] Re-pushing template to SWI', {
      templateId,
      rowIndicesCount: rowIndices?.length
    });

    // Validate required parameters
    if (!templateId) {
      throw new Error('templateId is required');
    }

    if (!rowIndices || !Array.isArray(rowIndices) || rowIndices.length === 0) {
      throw new Error('rowIndices must be a non-empty array');
    }

    // Build API URL
    const url = buildApiUrl('api/templates/unified/repush');

    // Get auth token
    const token = tokenManager.getToken();
    if (!token) {
      throw new Error('Authentication token not found');
    }

    // Make API request
    const response = await axios.post(
      url,
      {
        templateId,
        rowIndices,
        orderNumber,
        customerName,
        customerPoNumber,
        deliveryDate,
        enteredBy
      },
      {
        headers: {
          'x-access-token': token,
          'Accept': 'application/json',
          'Content-Type': 'application/json'
        },
        timeout: 120000 // 120 seconds for SWI operations
      }
    );

    logger.info('[templateApi] REPUSH completed successfully', {
      templateId,
      newJobIdsCount: response.data?.data?.newJobIds?.length
    });

    return {
      success: true,
      data: response.data.data,
      message: response.data.message
    };

  } catch (error) {
    logger.error('[templateApi] REPUSH failed', error);

    // Handle different error types
    if (error.response) {
      const errorData = error.response.data;

      return {
        success: false,
        error: errorData.error || 'REPUSH failed',
        code: errorData.code,
        message: errorData.message,
        rollbackCompleted: errorData.rollbackCompleted
      };
    } else if (error.request) {
      return {
        success: false,
        error: 'Network error',
        code: 'NETWORK_ERROR',
        message: 'No response from server. Please check your connection.'
      };
    } else {
      return {
        success: false,
        error: 'Request error',
        code: 'REQUEST_ERROR',
        message: error.message
      };
    }
  }
};

/**
 * Update existing template SWI records (for EDIT mode)
 *
 * @param {Object} params - Update parameters
 * @param {string} params.templateId - Template ID
 * @param {Object} params.templateData - Template data to update (flipH, flipV, etc.)
 * @param {Object} params.swiData - SWI data for update
 *
 * @returns {Promise<Object>} API response with updated template and job IDs
 */
export const updateTemplateComplete = async ({
  templateId,
  templateData,
  swiData
}) => {
  try {
    logger.info('[templateApi] Updating template SWI records', { templateId });

    if (!templateId) {
      throw new Error('templateId is required');
    }

    // Build API URL
    const url = buildApiUrl(`api/templates/unified/${templateId}`);

    // Get auth token
    const token = tokenManager.getToken();
    if (!token) {
      throw new Error('Authentication token not found');
    }

    // Make API request
    const response = await axios.put(
      url,
      { templateData, swiData },
      {
        headers: {
          'x-access-token': token,
          'Accept': 'application/json',
          'Content-Type': 'application/json'
        },
        timeout: 120000 // 120 seconds for template update (may involve SWI)
      }
    );

    logger.info('[templateApi] Template updated successfully', {
      templateId,
      swiJobsCount: response.data?.data?.swiJobIds?.length
    });

    return {
      success: true,
      data: response.data.data,
      message: response.data.message
    };

  } catch (error) {
    logger.error('[templateApi] Template update failed', error);

    if (error.response) {
      const errorData = error.response.data;
      return {
        success: false,
        error: errorData.error || 'Template update failed',
        code: errorData.code,
        message: errorData.message
      };
    } else if (error.request) {
      return {
        success: false,
        error: 'Network error',
        code: 'NETWORK_ERROR',
        message: 'No response from server. Please check your connection.'
      };
    } else {
      return {
        success: false,
        error: 'Request error',
        code: 'REQUEST_ERROR',
        message: error.message
      };
    }
  }
};

/**
 * Export all template API functions
 */
export default {
  createTemplateComplete,
  updateTemplateComplete,
  repushTemplateToSWI
};
