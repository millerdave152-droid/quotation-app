/**
 * Global Error Handler Middleware
 *
 * Catches all errors and returns standardized API responses.
 * Must be registered AFTER all routes.
 */

const { error, ErrorCodes, ErrorStatusCodes } = require('../utils/apiResponse');

/**
 * Custom API Error class for throwing standardized errors
 */
class ApiError extends Error {
  constructor(code, message, options = {}) {
    super(message);
    this.name = 'ApiError';
    this.code = code;
    this.statusCode = options.statusCode || ErrorStatusCodes[code] || 500;
    this.details = options.details || null;
    this.isOperational = true; // Distinguishes from programming errors

    Error.captureStackTrace(this, this.constructor);
  }

  static badRequest(message, details) {
    return new ApiError(ErrorCodes.BAD_REQUEST, message, { details });
  }

  static notFound(resource = 'Resource') {
    return new ApiError(ErrorCodes.NOT_FOUND, `${resource} not found`);
  }

  static unauthorized(message = 'Authentication required') {
    return new ApiError(ErrorCodes.UNAUTHORIZED, message);
  }

  static forbidden(message = 'Access denied') {
    return new ApiError(ErrorCodes.FORBIDDEN, message);
  }

  static validation(message, details) {
    return new ApiError(ErrorCodes.VALIDATION_ERROR, message, { details });
  }

  static conflict(message, details) {
    return new ApiError(ErrorCodes.CONFLICT, message, { details });
  }

  static internal(message = 'An unexpected error occurred') {
    return new ApiError(ErrorCodes.INTERNAL_ERROR, message);
  }

  static database(message = 'Database operation failed') {
    return new ApiError(ErrorCodes.DATABASE_ERROR, message);
  }
}

/**
 * Async handler wrapper to catch async errors
 * Use: app.get('/route', asyncHandler(async (req, res) => { ... }))
 */
const asyncHandler = (fn) => (req, res, next) => {
  Promise.resolve(fn(req, res, next)).catch(next);
};

/**
 * 404 Not Found handler - for undefined routes
 */
const notFoundHandler = (req, res, next) => {
  const err = new ApiError(
    ErrorCodes.NOT_FOUND,
    `Route not found: ${req.method} ${req.originalUrl}`
  );
  next(err);
};

/**
 * Global error handler middleware
 */
const errorHandler = (err, req, res, next) => {
  // Log error for debugging (in production, use a proper logger)
  console.error('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.error(`❌ Error at ${new Date().toISOString()}`);
  console.error(`   Path: ${req.method} ${req.originalUrl}`);
  console.error(`   Message: ${err.message}`);
  if (process.env.NODE_ENV === 'development') {
    console.error(`   Stack: ${err.stack}`);
  }
  console.error('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');

  // Handle known ApiError instances
  if (err instanceof ApiError) {
    return res.status(err.statusCode).json(
      error(err.code, err.message, { details: err.details })
    );
  }

  // Handle Postgres/pg errors
  if (err.code && typeof err.code === 'string' && err.code.match(/^[0-9]{5}$/)) {
    const pgErrorMap = {
      '23505': { code: ErrorCodes.CONFLICT, message: 'Duplicate entry already exists', status: 409 },
      '23503': { code: ErrorCodes.BAD_REQUEST, message: 'Referenced record does not exist', status: 400 },
      '23502': { code: ErrorCodes.VALIDATION_ERROR, message: 'Required field is missing', status: 400 },
      '22P02': { code: ErrorCodes.VALIDATION_ERROR, message: 'Invalid input syntax', status: 400 },
      '42P01': { code: ErrorCodes.INTERNAL_ERROR, message: 'Database table not found', status: 500 },
      '42703': { code: ErrorCodes.INTERNAL_ERROR, message: 'Database column not found', status: 500 }
    };

    const pgError = pgErrorMap[err.code] || {
      code: ErrorCodes.DATABASE_ERROR,
      message: 'Database operation failed',
      status: 500
    };

    // SECURITY: Log database errors server-side for debugging, but never expose in responses
    if (process.env.NODE_ENV === 'development') {
      console.error('Database error details:', { pgCode: err.code, pgDetail: err.detail });
    }
    return res.status(pgError.status).json(
      error(pgError.code, pgError.message, {
        // SECURITY: Never expose database error details to clients
        details: undefined
      })
    );
  }

  // Handle JWT errors
  if (err.name === 'JsonWebTokenError') {
    return res.status(401).json(
      error(ErrorCodes.UNAUTHORIZED, 'Invalid authentication token')
    );
  }

  if (err.name === 'TokenExpiredError') {
    return res.status(401).json(
      error(ErrorCodes.UNAUTHORIZED, 'Authentication token has expired')
    );
  }

  // Handle validation errors from express-validator or Joi
  if (err.name === 'ValidationError' || err.isJoi) {
    return res.status(400).json(
      error(ErrorCodes.VALIDATION_ERROR, err.message, {
        details: err.details || err.errors
      })
    );
  }

  // Handle multer file upload errors
  if (err.name === 'MulterError') {
    const multerErrorMap = {
      'LIMIT_FILE_SIZE': 'File is too large',
      'LIMIT_FILE_COUNT': 'Too many files',
      'LIMIT_UNEXPECTED_FILE': 'Unexpected file field'
    };

    return res.status(400).json(
      error(ErrorCodes.BAD_REQUEST, multerErrorMap[err.code] || 'File upload error')
    );
  }

  // Handle syntax errors (malformed JSON in request body)
  if (err instanceof SyntaxError && err.status === 400 && 'body' in err) {
    return res.status(400).json(
      error(ErrorCodes.BAD_REQUEST, 'Invalid JSON in request body')
    );
  }

  // Default to internal server error for unknown errors
  // SECURITY: Always treat unknown NODE_ENV as production to prevent accidental exposure
  const isProduction = process.env.NODE_ENV !== 'development';

  // SECURITY: Never expose internal error details in responses
  // Stack traces should only be logged server-side, not returned to clients
  return res.status(500).json(
    error(
      ErrorCodes.INTERNAL_ERROR,
      isProduction ? 'An unexpected error occurred' : err.message,
      {
        // SECURITY: Stack traces logged server-side only, not in response
        details: undefined
      }
    )
  );
};

module.exports = {
  ApiError,
  asyncHandler,
  notFoundHandler,
  errorHandler
};
