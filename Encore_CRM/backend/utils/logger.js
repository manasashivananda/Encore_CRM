// Production-safe logging utility for backend
const isDevelopment = process.env.NODE_ENV !== 'production';
const isProduction = process.env.NODE_ENV === 'production';

// ANSI color codes for console output
const colors = {
  reset: '\x1b[0m',
  red: '\x1b[31m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  green: '\x1b[32m',
  cyan: '\x1b[36m'
};

// Format log message with timestamp
const formatMessage = (level, message, ...args) => {
  const timestamp = new Date().toISOString();
  const formattedArgs = args.length > 0 ? JSON.stringify(args, null, 2) : '';
  return `[${timestamp}] [${level}] ${message} ${formattedArgs}`;
};

const logger = {
  log: (message, ...args) => {
    if (isDevelopment) {
      console.log(formatMessage('LOG', message, ...args));
    }
  },

  debug: (message, ...args) => {
    if (isDevelopment) {
      console.log(`${colors.cyan}${formatMessage('DEBUG', message, ...args)}${colors.reset}`);
    }
  },

  info: (message, ...args) => {
    const formatted = formatMessage('INFO', message, ...args);
    if (isDevelopment) {
      console.info(`${colors.blue}${formatted}${colors.reset}`);
    } else if (isProduction) {
      // In production, log important info
      console.info(formatted);
    }
  },

  warn: (message, ...args) => {
    const formatted = formatMessage('WARN', message, ...args);
    if (isDevelopment) {
      console.warn(`${colors.yellow}${formatted}${colors.reset}`);
    } else if (isProduction) {
      // In production, log warnings
      console.warn(formatted);
    }
  },

  error: (error, context = {}) => {
    const errorMessage = error?.message || error?.toString() || 'Unknown error';
    const errorStack = error?.stack;
    const formatted = formatMessage('ERROR', errorMessage, context);
    
    if (isDevelopment) {
      console.error(`${colors.red}${formatted}${colors.reset}`);
      if (errorStack) {
        console.error(`${colors.red}Stack trace:${colors.reset}`, errorStack);
      }
    } else if (isProduction) {
      // In production, always log errors
      console.error(formatted);
      // You could also send to error tracking service here
      // Example: Sentry.captureException(error);
    }
  },

  // Special method for database errors
  dbError: (operation, error, query = {}) => {
    const errorInfo = {
      operation,
      message: error?.message,
      code: error?.code,
      query: isDevelopment ? query : undefined
    };
    
    logger.error(error, { type: 'DATABASE_ERROR', ...errorInfo });
  },

  // Special method for API errors
  apiError: (req, error, additionalInfo = {}) => {
    const errorInfo = {
      method: req?.method,
      url: req?.originalUrl,
      ip: req?.ip,
      userId: req?.user?.id,
      ...additionalInfo
    };
    
    logger.error(error, { type: 'API_ERROR', ...errorInfo });
  },

  // Method for successful operations (useful for audit trails)
  success: (operation, details = {}) => {
    const formatted = formatMessage('SUCCESS', operation, details);
    if (isDevelopment) {
      console.log(`${colors.green}${formatted}${colors.reset}`);
    } else if (isProduction && details.important) {
      // Log important successful operations in production
      console.info(formatted);
    }
  }
};

module.exports = { logger };