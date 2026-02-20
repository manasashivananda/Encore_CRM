/**
 * Input sanitization utilities for production safety
 */

// Sanitize HTML to prevent XSS
export const sanitizeHTML = (input) => {
  if (!input) return '';
  
  return String(input)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#x27;')
    .replace(/\//g, '&#x2F;');
};

// Sanitize input for display
export const sanitizeInput = (input) => {
  if (!input) return '';
  
  return String(input)
    .trim()
    .replace(/[<>]/g, '') // Remove angle brackets
    .slice(0, 1000); // Limit length
};

// Validate and sanitize numbers
export const sanitizeNumber = (input, min = 0, max = Number.MAX_SAFE_INTEGER) => {
  const num = parseFloat(input);
  if (isNaN(num)) return min;
  return Math.max(min, Math.min(max, num));
};

// Validate email format
export const validateEmail = (email) => {
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return emailRegex.test(email);
};

// Validate phone number
export const validatePhone = (phone) => {
  const phoneRegex = /^[\d\s\-\+\(\)]+$/;
  return phoneRegex.test(phone) && phone.replace(/\D/g, '').length >= 10;
};

// Sanitize file name
export const sanitizeFileName = (fileName) => {
  if (!fileName) return 'unnamed';
  
  return fileName
    .replace(/[^a-zA-Z0-9\-_.]/g, '_') // Replace special chars with underscore
    .replace(/_{2,}/g, '_') // Replace multiple underscores with single
    .slice(0, 255); // Limit length
};

// Validate URL
export const validateURL = (url) => {
  try {
    new URL(url);
    return true;
  } catch {
    return false;
  }
};

// Sanitize SQL-like input to prevent injection
export const sanitizeQuery = (input) => {
  if (!input) return '';
  
  return String(input)
    .replace(/['";\\]/g, '') // Remove quotes and backslashes
    .replace(/--/g, '') // Remove SQL comments
    .replace(/\/\*/g, '') // Remove block comments
    .replace(/\*\//g, '');
};