// Production-safe logging utility with enhanced error handling
const isDevelopment = process.env.NODE_ENV === 'development';
const isProduction = process.env.NODE_ENV === 'production';

// Error tracking for production (can integrate with services like Sentry)
const logToService = (level, message, extra = {}) => {
  if (isProduction) {
    // In production, you could send to error tracking service
    // Example: Sentry.captureMessage(message, level);
    // For now, we'll store critical errors in localStorage for debugging
    if (level === 'error') {
      try {
        const errors = JSON.parse(localStorage.getItem('app_errors') || '[]');
        errors.push({
          timestamp: new Date().toISOString(),
          level,
          message: message.toString(),
          ...extra
        });
        // Keep only last 50 errors
        if (errors.length > 50) errors.shift();
        localStorage.setItem('app_errors', JSON.stringify(errors));
      } catch (e) {
        // Fail silently if localStorage is full
      }
    }
  }
};

export const logger = {
  log: (...args) => {
    if (isDevelopment) {
      console.log(...args);
    }
  },
  
  debug: (...args) => {
    if (isDevelopment) {
      console.log('[DEBUG]', ...args);
    }
  },
  
  info: (...args) => {
    if (isDevelopment) {
      console.info(...args);
    }
    logToService('info', args[0], { args: args.slice(1) });
  },
  
  warn: (...args) => {
    if (isDevelopment) {
      console.warn(...args);
    }
    logToService('warning', args[0], { args: args.slice(1) });
  },
  
  error: (error, context = {}) => {
    const errorMessage = error?.message || error?.toString() || 'Unknown error';
    const errorStack = error?.stack;
    
    if (isDevelopment) {
      console.error('Error:', errorMessage, '\nContext:', context);
      if (errorStack) console.error('Stack:', errorStack);
    }
    
    logToService('error', errorMessage, {
      stack: errorStack,
      context,
      url: window.location.href,
      userAgent: navigator.userAgent
    });
  },
  
  // Special method for API errors
  apiError: (endpoint, error, requestData = {}) => {
    const errorInfo = {
      endpoint,
      status: error?.response?.status,
      statusText: error?.response?.statusText,
      message: error?.message,
      requestData: isDevelopment ? requestData : undefined
    };
    
    if (isDevelopment) {
      console.error('API Error:', errorInfo);
    }
    
    logToService('error', `API Error: ${endpoint}`, errorInfo);
  },
  
  // Method to get stored errors (useful for debugging)
  getStoredErrors: () => {
    try {
      return JSON.parse(localStorage.getItem('app_errors') || '[]');
    } catch {
      return [];
    }
  },
  
  // Clear stored errors
  clearStoredErrors: () => {
    try {
      localStorage.removeItem('app_errors');
    } catch {
      // Fail silently
    }
  }
};

export default logger;