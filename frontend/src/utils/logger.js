/**
 * Logger Utility
 *
 * Production-safe logging that automatically suppresses debug logs in production builds
 * while preserving errors for debugging. Errors are sent to the client error tracking
 * service in all environments.
 *
 * Usage:
 *   import logger from './utils/logger';
 *   logger.log('Debug message');    // Only in development
 *   logger.error('Error occurred');  // Always shown + sent to error tracker
 *   logger.warn('Warning');          // Only in development
 *   logger.info('Info message');     // Only in development
 */

import errorTracker from '../services/errorTracker';

const isDevelopment = process.env.NODE_ENV !== 'production';

const logger = {
  /**
   * Log debug information (development only)
   */
  log: (...args) => {
    if (isDevelopment) {
      console.log(...args);
    }
  },

  /**
   * Log errors (always shown, critical for debugging production issues)
   */
  error: (...args) => {
    // Always log errors, even in production
    console.error(...args);

    // Send to client error tracking service
    const first = args[0];
    const error = first instanceof Error
      ? first
      : { message: String(first), stack: null, name: 'LoggedError' };
    errorTracker.captureError(error, {
      errorType: 'manual',
      severity: 'error',
      context: { source: 'logger.error', argCount: args.length },
    });
  },

  /**
   * Log warnings (development only, unless configured otherwise)
   */
  warn: (...args) => {
    if (isDevelopment) {
      console.warn(...args);
    }
  },

  /**
   * Log info messages (development only)
   */
  info: (...args) => {
    if (isDevelopment) {
      console.info(...args);
    }
  },

  /**
   * Log debug messages (development only)
   */
  debug: (...args) => {
    if (isDevelopment) {
      console.debug(...args);
    }
  },

  /**
   * Group logs together (development only)
   */
  group: (label) => {
    if (isDevelopment && console.group) {
      console.group(label);
    }
  },

  /**
   * End a log group (development only)
   */
  groupEnd: () => {
    if (isDevelopment && console.groupEnd) {
      console.groupEnd();
    }
  },

  /**
   * Log a table (development only)
   */
  table: (data) => {
    if (isDevelopment && console.table) {
      console.table(data);
    }
  }
};

export default logger;
