// services/validationService.js
// NEW FILE - Validation service for unified template API
// Created: November 18, 2025
// Purpose: Centralized validation logic for geometry, materials, and duplicate checking

const { logger } = require('../utils/logger');
const Template = require('../models/templateModel');

/**
 * Validate geometry data (lengths and angles)
 * @param {Array<Number>} lengths - Array of length values
 * @param {Array<Number>} angles - Array of angle values
 * @returns {Object} { valid: boolean, errors: Array<String> }
 */
exports.validateGeometry = async (lengths, angles) => {
  const errors = [];

  // Check if arrays exist
  if (!Array.isArray(lengths)) {
    errors.push('Lengths must be an array');
  }
  if (!Array.isArray(angles)) {
    errors.push('Angles must be an array');
  }

  if (errors.length > 0) {
    return { valid: false, errors };
  }

  // Check array lengths match
  if (lengths.length !== angles.length) {
    errors.push(`Lengths and angles array length mismatch (lengths: ${lengths.length}, angles: ${angles.length})`);
  }

  // Validate length values
  lengths.forEach((length, index) => {
    if (typeof length !== 'number' || length <= 0) {
      errors.push(`Invalid length at index ${index}: ${length} (must be positive number)`);
    }
  });

  // Validate angle values
  angles.forEach((angle, index) => {
    if (typeof angle !== 'number') {
      errors.push(`Invalid angle at index ${index}: ${angle} (must be a number)`);
    }
  });

  // Check minimum sides
  if (lengths.length < 2) {
    errors.push('Template must have at least 2 sides');
  }

  return {
    valid: errors.length === 0,
    errors
  };
};

/**
 * Validate material rows data
 * @param {Array<Object>} materialRows - Array of material row objects
 * @returns {Object} { valid: boolean, errors: Array<String> }
 */
exports.validateMaterials = async (materialRows) => {
  const errors = [];

  // Check if array exists
  if (!Array.isArray(materialRows)) {
    return { valid: false, errors: ['Material rows must be an array'] };
  }

  // Check at least one material row
  if (materialRows.length === 0) {
    return { valid: false, errors: ['At least one material row is required'] };
  }

  // Required fields
  const requiredFields = ['material', 'color', 'quantity', 'length', 'tag', 'unitPrice', 'extPrice'];

  // Validate each row
  materialRows.forEach((row, index) => {
    // Check required fields
    requiredFields.forEach(field => {
      if (row[field] === undefined || row[field] === null || row[field] === '') {
        errors.push(`Row ${index + 1}: Missing required field '${field}'`);
      }
    });

    // Validate numeric fields
    if (typeof row.quantity !== 'number' || row.quantity <= 0) {
      errors.push(`Row ${index + 1}: Quantity must be a positive number`);
    }
    if (typeof row.length !== 'number' || row.length <= 0) {
      errors.push(`Row ${index + 1}: Length must be a positive number`);
    }
    if (typeof row.unitPrice !== 'number' || row.unitPrice < 0) {
      errors.push(`Row ${index + 1}: Unit price must be a non-negative number`);
    }
    if (typeof row.extPrice !== 'number' || row.extPrice < 0) {
      errors.push(`Row ${index + 1}: Extended price must be a non-negative number`);
    }
  });

  return {
    valid: errors.length === 0,
    errors
  };
};

/**
 * Check for duplicate templates
 * @param {String} orderNumber - Order number
 * @param {Array<Number>} lengths - Template lengths
 * @param {Array<Number>} angles - Template angles
 * @returns {Object} { exists: boolean, duplicates: Array<Object> }
 */
exports.checkDuplicateTemplate = async (orderNumber, lengths, angles) => {
  try {
    // Find templates with same order number
    const existingTemplates = await Template.find({ orderNumber }).lean();

    // Check for geometry match
    const duplicates = existingTemplates.filter(template => {
      const lengthsMatch = JSON.stringify(template.lengths) === JSON.stringify(lengths);
      const anglesMatch = JSON.stringify(template.angles) === JSON.stringify(angles);
      return lengthsMatch && anglesMatch;
    });

    return {
      exists: duplicates.length > 0,
      duplicates: duplicates.map(t => ({
        _id: t._id,
        name: t.name,
        createdAt: t.createdAt
      }))
    };
  } catch (error) {
    logger.error('[checkDuplicateTemplate] Error:', error);
    throw error;
  }
};

/**
 * Sanitize string input to prevent XSS and injection attacks
 * @param {String} input - Input string to sanitize
 * @returns {String} Sanitized string
 */
function sanitizeString(input) {
  if (typeof input !== 'string') return input;

  // Remove any HTML tags
  let sanitized = input.replace(/<[^>]*>/g, '');

  // Remove any script tags and their content
  sanitized = sanitized.replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '');

  // Trim whitespace
  sanitized = sanitized.trim();

  // Limit length to prevent buffer overflow
  if (sanitized.length > 500) {
    sanitized = sanitized.substring(0, 500);
  }

  return sanitized;
}

/**
 * Validate complete template data including all required fields
 * @param {Object} templateData - Template data object
 * @returns {Object} { valid: boolean, errors: Array<String> }
 */
exports.validateTemplateData = (templateData) => {
  const errors = [];

  // Required fields
  if (!templateData.name || typeof templateData.name !== 'string') {
    errors.push('Template name is required and must be a string');
  } else if (templateData.name.length > 100) {
    errors.push('Template name must be 100 characters or less');
  }

  // Geometry validation
  if (!Array.isArray(templateData.lengths)) {
    errors.push('Lengths must be an array');
  }

  if (!Array.isArray(templateData.angles)) {
    errors.push('Angles must be an array');
  }

  // Validate array lengths match (angles should be lengths - 1)
  if (Array.isArray(templateData.lengths) && Array.isArray(templateData.angles)) {
    if (templateData.lengths.length > 0 &&
        templateData.angles.length !== templateData.lengths.length - 1) {
      errors.push('Invalid angles array length (should be lengths.length - 1)');
    }
  }

  // Taper mode validation
  if (templateData.isTaper) {
    if (!Array.isArray(templateData.nearLengths) || templateData.nearLengths.length === 0) {
      errors.push('Taper mode requires nearLengths array');
    }
    // nearAngles validation - must be array and match nearLengths.length - 1 (same as non-taper)
    if (!Array.isArray(templateData.nearAngles)) {
      errors.push('Taper mode requires nearAngles array');
    } else if (Array.isArray(templateData.nearLengths) && templateData.nearLengths.length > 0 &&
               templateData.nearAngles.length !== templateData.nearLengths.length - 1) {
      errors.push('Invalid nearAngles array length (should be nearLengths.length - 1)');
    }
  }

  // Library validation
  if (templateData.library === 'customer' && !templateData.customerId) {
    errors.push('Customer ID is required when saving to customer library');
  }

  // Sanitize string fields
  if (templateData.name) templateData.name = sanitizeString(templateData.name);
  if (templateData.partGroup) templateData.partGroup = sanitizeString(templateData.partGroup);
  if (templateData.partClass) templateData.partClass = sanitizeString(templateData.partClass);
  if (templateData.orderNumber) templateData.orderNumber = sanitizeString(templateData.orderNumber);
  if (templateData.customerName) templateData.customerName = sanitizeString(templateData.customerName);

  return {
    valid: errors.length === 0,
    errors
  };
};

/**
 * Validate complete template creation request (template + materials)
 * @param {Object} requestData - { templateData, materialRows }
 * @returns {Promise<Object>} { valid: boolean, errors: Array<String> }
 */
exports.validateTemplateCreationRequest = async (requestData) => {
  const errors = [];

  // Validate template data
  const templateValidation = exports.validateTemplateData(requestData.templateData || {});
  if (!templateValidation.valid) {
    errors.push(...templateValidation.errors);
  }

  // Validate material rows (async function)
  const materialValidation = await exports.validateMaterials(requestData.materialRows || []);
  if (!materialValidation.valid) {
    errors.push(...materialValidation.errors);
  }

  const result = {
    valid: errors.length === 0,
    errors
  };

  if (!result.valid) {
    logger.warn('[ValidationService] Request validation failed:', { errors });
  }

  return result;
};

// Export sanitizeString for use in other modules
exports.sanitizeString = sanitizeString;
