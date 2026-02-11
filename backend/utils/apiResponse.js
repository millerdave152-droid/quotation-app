/**
 * Standardized API Response Utility
 *
 * All API responses should follow this format:
 * {
 *   success: boolean,
 *   data: any | null,
 *   error: { code: string, message: string, details?: any } | null,
 *   meta: { timestamp: string, requestId?: string, pagination?: object }
 * }
 */

/**
 * Create a successful API response
 * @param {any} data - The response data
 * @param {object} options - Additional options
 * @param {string} options.message - Optional success message
 * @param {object} options.meta - Additional metadata (pagination, etc.)
 * @returns {object} Standardized success response
 */
const success = (data, options = {}) => {
  const response = {
    success: true,
    data: data ?? null,
    error: null,
    meta: {
      timestamp: new Date().toISOString(),
      ...options.meta
    }
  };

  // Add message to meta if provided
  if (options.message) {
    response.meta.message = options.message;
  }

  return response;
};

/**
 * Create an error API response
 * @param {string} code - Error code (e.g., 'VALIDATION_ERROR', 'NOT_FOUND')
 * @param {string} message - Human-readable error message
 * @param {object} options - Additional options
 * @param {any} options.details - Additional error details
 * @param {number} options.statusCode - HTTP status code (for reference)
 * @returns {object} Standardized error response
 */
const error = (code, message, options = {}) => {
  const response = {
    success: false,
    data: null,
    error: {
      code,
      message,
      ...(options.details && { details: options.details })
    },
    meta: {
      timestamp: new Date().toISOString()
    }
  };

  return response;
};

/**
 * Create a paginated response
 * @param {Array} data - Array of items
 * @param {object} pagination - Pagination info
 * @param {number} pagination.page - Current page number
 * @param {number} pagination.limit - Items per page
 * @param {number} pagination.total - Total number of items
 * @param {object} options - Additional options
 * @returns {object} Standardized paginated response
 */
const paginated = (data, pagination, options = {}) => {
  const { page, limit, total } = pagination;
  const totalPages = Math.ceil(total / limit);

  return success(data, {
    ...options,
    meta: {
      pagination: {
        page,
        limit,
        total,
        totalPages,
        hasNextPage: page < totalPages,
        hasPrevPage: page > 1
      },
      ...options.meta
    }
  });
};

/**
 * Standard error codes
 */
const ErrorCodes = {
  // Client errors (4xx)
  VALIDATION_ERROR: 'VALIDATION_ERROR',
  UNAUTHORIZED: 'UNAUTHORIZED',
  FORBIDDEN: 'FORBIDDEN',
  NOT_FOUND: 'NOT_FOUND',
  CONFLICT: 'CONFLICT',
  RATE_LIMITED: 'RATE_LIMITED',
  BAD_REQUEST: 'BAD_REQUEST',

  // Server errors (5xx)
  INTERNAL_ERROR: 'INTERNAL_ERROR',
  DATABASE_ERROR: 'DATABASE_ERROR',
  EXTERNAL_SERVICE_ERROR: 'EXTERNAL_SERVICE_ERROR',

  // Business logic errors
  INSUFFICIENT_CREDIT: 'INSUFFICIENT_CREDIT',
  QUOTE_EXPIRED: 'QUOTE_EXPIRED',
  APPROVAL_REQUIRED: 'APPROVAL_REQUIRED',
  INVALID_STATUS_TRANSITION: 'INVALID_STATUS_TRANSITION',
  INSUFFICIENT_STOCK: 'INSUFFICIENT_STOCK',
  PAYMENT_FAILED: 'PAYMENT_FAILED',
  SERVICE_UNAVAILABLE: 'SERVICE_UNAVAILABLE',
  DUPLICATE_ENTRY: 'DUPLICATE_ENTRY',
  ACCOUNT_INACTIVE: 'ACCOUNT_INACTIVE'
};

/**
 * HTTP status code mapping for error codes
 */
const ErrorStatusCodes = {
  [ErrorCodes.VALIDATION_ERROR]: 400,
  [ErrorCodes.BAD_REQUEST]: 400,
  [ErrorCodes.UNAUTHORIZED]: 401,
  [ErrorCodes.FORBIDDEN]: 403,
  [ErrorCodes.NOT_FOUND]: 404,
  [ErrorCodes.CONFLICT]: 409,
  [ErrorCodes.RATE_LIMITED]: 429,
  [ErrorCodes.INTERNAL_ERROR]: 500,
  [ErrorCodes.DATABASE_ERROR]: 500,
  [ErrorCodes.EXTERNAL_SERVICE_ERROR]: 502,
  [ErrorCodes.INSUFFICIENT_CREDIT]: 400,
  [ErrorCodes.QUOTE_EXPIRED]: 400,
  [ErrorCodes.APPROVAL_REQUIRED]: 403,
  [ErrorCodes.INVALID_STATUS_TRANSITION]: 400,
  [ErrorCodes.INSUFFICIENT_STOCK]: 400,
  [ErrorCodes.PAYMENT_FAILED]: 402,
  [ErrorCodes.SERVICE_UNAVAILABLE]: 503,
  [ErrorCodes.DUPLICATE_ENTRY]: 409,
  [ErrorCodes.ACCOUNT_INACTIVE]: 403
};

/**
 * Express response helpers - attach to res object via middleware
 */
const responseHelpers = {
  /**
   * Send a success response
   * @param {any} data - Response data
   * @param {object} options - Options including message, meta
   */
  success(data, options = {}) {
    const statusCode = options.statusCode || 200;
    return this.status(statusCode).json(success(data, options));
  },

  /**
   * Send a created response (201)
   * @param {any} data - Created resource data
   * @param {object} options - Options
   */
  created(data, options = {}) {
    return this.status(201).json(success(data, { message: 'Resource created successfully', ...options }));
  },

  /**
   * Send an error response
   * @param {string} code - Error code from ErrorCodes
   * @param {string} message - Error message
   * @param {object} options - Options including details
   */
  error(code, message, options = {}) {
    const statusCode = options.statusCode || ErrorStatusCodes[code] || 500;
    return this.status(statusCode).json(error(code, message, options));
  },

  /**
   * Send a not found response
   * @param {string} resource - Name of resource not found
   */
  notFound(resource = 'Resource') {
    return this.status(404).json(error(ErrorCodes.NOT_FOUND, `${resource} not found`));
  },

  /**
   * Send a validation error response
   * @param {string} message - Validation error message
   * @param {any} details - Validation error details
   */
  validationError(message, details) {
    return this.status(400).json(error(ErrorCodes.VALIDATION_ERROR, message, { details }));
  },

  /**
   * Send a paginated response
   * @param {Array} data - Array of items
   * @param {object} pagination - Pagination info
   * @param {object} options - Additional options
   */
  paginated(data, pagination, options = {}) {
    return this.status(200).json(paginated(data, pagination, options));
  }
};

/**
 * Middleware to attach response helpers to res object
 */
const attachResponseHelpers = (req, res, next) => {
  // Bind helpers to res object
  res.success = responseHelpers.success.bind(res);
  res.created = responseHelpers.created.bind(res);
  res.apiError = responseHelpers.error.bind(res); // Named apiError to avoid conflict with Node's res.error
  res.notFound = responseHelpers.notFound.bind(res);
  res.validationError = responseHelpers.validationError.bind(res);
  res.paginated = responseHelpers.paginated.bind(res);
  next();
};

module.exports = {
  success,
  error,
  paginated,
  ErrorCodes,
  ErrorStatusCodes,
  attachResponseHelpers
};
