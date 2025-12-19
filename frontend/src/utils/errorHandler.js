/**
 * Error Handler Utility
 * Extracts meaningful error messages from API responses and provides
 * user-friendly feedback while maintaining debugging capabilities.
 */

import { toast } from '../components/ui/Toast';

// Error type constants for categorization
export const ERROR_TYPES = {
  NETWORK: 'NETWORK',
  VALIDATION: 'VALIDATION',
  AUTH: 'AUTH',
  SERVER: 'SERVER',
  UNKNOWN: 'UNKNOWN'
};

/**
 * Extract error message from axios error response
 * @param {Error} error - Axios error object
 * @returns {{ message: string, type: string }}
 */
export const extractAxiosErrorMessage = (error) => {
  // Network error (no response from server)
  if (!error.response) {
    if (error.code === 'ECONNABORTED') {
      return { message: 'Request timed out. Please try again.', type: ERROR_TYPES.NETWORK };
    }
    if (error.message === 'Network Error') {
      return { message: 'Cannot connect to server. Please check your connection.', type: ERROR_TYPES.NETWORK };
    }
    return { message: 'Network error occurred. Please try again.', type: ERROR_TYPES.NETWORK };
  }

  const { status, data } = error.response;

  // Extract message from various response formats
  const serverMessage = data?.error || data?.message || data?.errors?.[0]?.message || null;

  // HTTP status-based messages
  switch (status) {
    case 400:
      return {
        message: serverMessage || 'Invalid request. Please check your input.',
        type: ERROR_TYPES.VALIDATION
      };
    case 401:
      return { message: 'Authentication required. Please log in.', type: ERROR_TYPES.AUTH };
    case 403:
      return { message: 'You do not have permission for this action.', type: ERROR_TYPES.AUTH };
    case 404:
      return { message: serverMessage || 'Requested resource not found.', type: ERROR_TYPES.SERVER };
    case 409:
      return {
        message: serverMessage || 'Conflict - this item may already exist.',
        type: ERROR_TYPES.VALIDATION
      };
    case 422:
      return {
        message: serverMessage || 'Validation error. Please check your input.',
        type: ERROR_TYPES.VALIDATION
      };
    case 429:
      return { message: 'Too many requests. Please wait a moment.', type: ERROR_TYPES.SERVER };
    case 500:
    case 502:
    case 503:
      return { message: 'Server error. Please try again later.', type: ERROR_TYPES.SERVER };
    default:
      return {
        message: serverMessage || `Error (${status}). Please try again.`,
        type: ERROR_TYPES.UNKNOWN
      };
  }
};

/**
 * Extract error message from fetch API error response
 * @param {Error} error - Error object
 * @param {Response} response - Fetch Response object (optional)
 * @returns {{ message: string, type: string }}
 */
export const extractFetchErrorMessage = (error, response = null) => {
  // Network-level error (fetch itself failed)
  if (error instanceof TypeError) {
    return { message: 'Cannot connect to server. Please check your connection.', type: ERROR_TYPES.NETWORK };
  }

  // If we have a response, use its status
  if (response && !response.ok) {
    const status = response.status;

    switch (status) {
      case 400:
        return { message: 'Invalid request. Please check your input.', type: ERROR_TYPES.VALIDATION };
      case 401:
        return { message: 'Authentication required. Please log in.', type: ERROR_TYPES.AUTH };
      case 403:
        return { message: 'You do not have permission for this action.', type: ERROR_TYPES.AUTH };
      case 404:
        return { message: 'Requested resource not found.', type: ERROR_TYPES.SERVER };
      case 500:
      case 502:
      case 503:
        return { message: 'Server error. Please try again later.', type: ERROR_TYPES.SERVER };
      default:
        return { message: `Error (${status}). Please try again.`, type: ERROR_TYPES.UNKNOWN };
    }
  }

  return { message: error.message || 'An unexpected error occurred.', type: ERROR_TYPES.UNKNOWN };
};

/**
 * Get appropriate error title based on error type
 * @param {string} errorType - One of ERROR_TYPES
 * @param {string} context - Operation context
 * @returns {string}
 */
const getErrorTitle = (errorType, context) => {
  switch (errorType) {
    case ERROR_TYPES.NETWORK:
      return 'Connection Error';
    case ERROR_TYPES.VALIDATION:
      return 'Validation Error';
    case ERROR_TYPES.AUTH:
      return 'Authentication Error';
    case ERROR_TYPES.SERVER:
      return 'Server Error';
    default:
      return `${context} Failed`;
  }
};

/**
 * Main error handler function
 * Use this for consistent error handling across the app
 *
 * @param {Error} error - The error object from catch block
 * @param {Object} options - Configuration options
 * @param {string} options.context - Operation context (e.g., 'Loading customers')
 * @param {boolean} options.showToast - Whether to show toast (default: true)
 * @param {boolean} options.logError - Whether to log to console (default: true)
 * @param {boolean} options.silent - If true, don't show toast (default: false)
 * @returns {{ message: string, type: string }}
 */
export const handleApiError = (error, options = {}) => {
  const {
    context = 'Operation',
    showToast = true,
    logError = true,
    silent = false
  } = options;

  // Determine if this is an axios error or fetch error
  const isAxiosError = error.response !== undefined || error.isAxiosError;

  const extracted = isAxiosError
    ? extractAxiosErrorMessage(error)
    : extractFetchErrorMessage(error);

  // Always log for debugging
  if (logError) {
    console.error(`[${context}] ${extracted.type}:`, error);
  }

  // Show toast unless silent mode
  if (showToast && !silent) {
    const title = getErrorTitle(extracted.type, context);
    toast.error(extracted.message, title);
  }

  return extracted;
};

/**
 * Success handler for consistency
 * @param {string} message - Success message
 * @param {string} title - Toast title (default: 'Success')
 */
export const handleApiSuccess = (message, title = 'Success') => {
  toast.success(message, title);
};

/**
 * Warning handler
 * @param {string} message - Warning message
 * @param {string} title - Toast title (default: 'Warning')
 */
export const handleWarning = (message, title = 'Warning') => {
  toast.warning(message, title);
};

/**
 * Info handler
 * @param {string} message - Info message
 * @param {string} title - Toast title (default: 'Info')
 */
export const handleInfo = (message, title = 'Info') => {
  toast.info(message, title);
};

export default handleApiError;
