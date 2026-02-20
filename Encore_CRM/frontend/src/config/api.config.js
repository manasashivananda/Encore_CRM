// Centralized API configuration for production safety
import { logger } from '../utils/logger';

const isDevelopment = process.env.NODE_ENV === 'development';
const isProduction = process.env.NODE_ENV === 'production';

// Get API URL from environment or use safe defaults
const getApiUrl = () => {
  // First, check for environment variable
  if (process.env.REACT_APP_API_BASE_URL) {
    return process.env.REACT_APP_API_BASE_URL.replace(/\/$/, '');
  }
  
  // In production, we should never fallback to localhost
  if (isProduction) {
    // In production, if no API URL is set, use relative path
    // This assumes the API is hosted on the same domain
    return window.location.origin;
  }
  
  // Only in development, fallback to localhost
  if (isDevelopment) {
    return 'http://localhost:8089';
  }
  
  // Default to relative path for safety
  return '';
};

// Export the API base URL
export const API_BASE_URL = getApiUrl();

// Helper function to build API endpoints
export const buildApiUrl = (endpoint) => {
  // Remove leading slash from endpoint if present
  const cleanEndpoint = endpoint.startsWith('/') ? endpoint.slice(1) : endpoint;
  return `${API_BASE_URL}/${cleanEndpoint}`;
};

// Token management helpers (more secure than direct localStorage access)
export const tokenManager = {
  getToken: () => {
    try {
      return localStorage.getItem('token');
    } catch (e) {
      logger.error('Failed to get token:', e);
      return null;
    }
  },
  
  setToken: (token) => {
    try {
      localStorage.setItem('token', token);
      // Store token timestamp for expiration checking
      localStorage.setItem('tokenTimestamp', Date.now().toString());
      return true;
    } catch (e) {
      logger.error('Failed to set token:', e);
      return false;
    }
  },
  
  removeToken: () => {
    try {
      localStorage.removeItem('token');
      localStorage.removeItem('tokenTimestamp');
      return true;
    } catch (e) {
      logger.error('Failed to remove token:', e);
      return false;
    }
  },
  
  // Check if token is likely expired (conservative estimate)
  isTokenExpired: () => {
    try {
      // First check if token exists
      const token = localStorage.getItem('token');
      if (!token) return true;
      
      // Try to get timestamp if it exists (new tokens will have it)
      const tokenTimestamp = localStorage.getItem('tokenTimestamp');
      if (!tokenTimestamp) {
        // For backward compatibility: if no timestamp exists (old tokens),
        // we can't determine expiration, so assume it's valid
        return false;
      }
      
      const now = Date.now();
      const tokenAge = now - parseInt(tokenTimestamp);
      // Conservative check: consider expired after 1.5 hours (90 minutes)
      // This is less than the 2-hour minimum to provide buffer time
      const maxAge = 90 * 60 * 1000; // 90 minutes in milliseconds
      
      return tokenAge > maxAge;
    } catch (e) {
      logger.error('Failed to check token expiration:', e);
      return false; // On error, assume valid to not disrupt existing flow
    }
  },
  
  // Get headers with token
  getAuthHeaders: () => {
    const token = tokenManager.getToken();
    return token ? { 'Authorization': `Bearer ${token}` } : {};
  }
};

// User data management helpers
export const userManager = {
  getUserId: () => {
    try {
      return localStorage.getItem('userId') || '';
    } catch (e) {
      logger.error('Failed to get userId:', e);
      return '';
    }
  },
  
  getRole: () => {
    try {
      const role = localStorage.getItem('role');
      return role ? JSON.parse(role) : null;
    } catch (e) {
      logger.error('Failed to get role:', e);
      return null;
    }
  },
  
  setUserId: (userId) => {
    try {
      localStorage.setItem('userId', userId);
      return true;
    } catch (e) {
      logger.error('Failed to set userId:', e);
      return false;
    }
  },
  
  setRole: (role) => {
    try {
      localStorage.setItem('role', JSON.stringify(role));
      return true;
    } catch (e) {
      logger.error('Failed to set role:', e);
      return false;
    }
  }
};

// API request configuration
export const apiConfig = {
  timeout: 120000, // 120 seconds - match backend timeout
  headers: {
    'Accept': 'application/json',
    'Content-Type': 'application/json'
  }
};

export default {
  API_BASE_URL,
  buildApiUrl,
  tokenManager,
  userManager,
  apiConfig
};