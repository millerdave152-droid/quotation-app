/**
 * Shared Middleware Module
 * Standardized middleware for all API endpoints
 */

const { ApiError, asyncHandler } = require('../../middleware/errorHandler');
const { authenticate, optionalAuth, requireRole, authenticateApiKey } = require('../../middleware/auth');
const { attachResponseHelpers } = require('../../utils/apiResponse');
const { validate, validateId } = require('../validation/schemas');

// ============================================================================
// REQUEST ID MIDDLEWARE
// ============================================================================

/**
 * Adds unique request ID to each request for tracing
 */
const requestId = (req, res, next) => {
  req.id = req.requestId = `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
  req._startTime = Date.now();
  res.setHeader('X-Request-ID', req.requestId);
  next();
};

// ============================================================================
// REQUEST LOGGING MIDDLEWARE
// ============================================================================

/**
 * Logs incoming requests (development/staging only)
 */
const requestLogger = (req, res, next) => {
  if (process.env.NODE_ENV !== 'production') {
    const startTime = Date.now();

    res.on('finish', () => {
      const duration = Date.now() - startTime;
      console.log(
        `[${new Date().toISOString()}] ${req.method} ${req.originalUrl} - ${res.statusCode} (${duration}ms)`
      );
    });
  }
  next();
};

// ============================================================================
// PARSE PAGINATION MIDDLEWARE
// ============================================================================

/**
 * Parses and normalizes pagination query params
 */
const parsePagination = (defaultLimit = 50, maxLimit = 500) => {
  return (req, res, next) => {
    const page = Math.max(1, parseInt(req.query.page, 10) || 1);
    const limit = Math.min(maxLimit, Math.max(1, parseInt(req.query.limit, 10) || defaultLimit));
    const offset = (page - 1) * limit;

    const sortOrder = ['ASC', 'DESC'].includes(req.query.sortOrder?.toUpperCase())
      ? req.query.sortOrder.toUpperCase()
      : 'DESC';

    req.pagination = {
      page,
      limit,
      offset,
      sortBy: req.query.sortBy || null,
      sortOrder
    };

    next();
  };
};

// ============================================================================
// PARSE DATE RANGE MIDDLEWARE
// ============================================================================

/**
 * Parses and validates date range query params
 */
const parseDateRange = (req, res, next) => {
  const { startDate, endDate } = req.query;

  req.dateRange = {
    startDate: startDate ? new Date(startDate) : null,
    endDate: endDate ? new Date(endDate) : null
  };

  // Validate dates
  if (req.dateRange.startDate && isNaN(req.dateRange.startDate.getTime())) {
    return res.status(400).json({
      success: false,
      data: null,
      error: {
        code: 'VALIDATION_ERROR',
        message: 'Invalid startDate format'
      },
      meta: { timestamp: new Date().toISOString() }
    });
  }

  if (req.dateRange.endDate && isNaN(req.dateRange.endDate.getTime())) {
    return res.status(400).json({
      success: false,
      data: null,
      error: {
        code: 'VALIDATION_ERROR',
        message: 'Invalid endDate format'
      },
      meta: { timestamp: new Date().toISOString() }
    });
  }

  next();
};

// ============================================================================
// CENTS/DOLLARS NORMALIZATION MIDDLEWARE
// ============================================================================

/**
 * Normalizes monetary values to cents
 * Accepts both 'amount' (dollars) and 'amountCents' fields
 */
const normalizeMoneyFields = (fields = []) => {
  return (req, res, next) => {
    if (!req.body) return next();

    const normalize = (obj, parentPath = '') => {
      if (!obj || typeof obj !== 'object') return;

      // Handle arrays
      if (Array.isArray(obj)) {
        obj.forEach((item, index) => normalize(item, `${parentPath}[${index}]`));
        return;
      }

      // Check each field mapping
      const fieldMappings = [
        { dollars: 'amount', cents: 'amountCents' },
        { dollars: 'unitPrice', cents: 'unitPriceCents' },
        { dollars: 'discountAmount', cents: 'discountAmountCents' },
        { dollars: 'cashTendered', cents: 'cashTenderedCents' },
        { dollars: 'lineTotal', cents: 'lineTotalCents' },
        { dollars: 'openingCash', cents: 'openingCashCents' },
        { dollars: 'closingCash', cents: 'closingCashCents' }
      ];

      for (const mapping of fieldMappings) {
        // If dollars field exists and cents field doesn't, convert
        if (obj[mapping.dollars] !== undefined && obj[mapping.cents] === undefined) {
          obj[mapping.cents] = Math.round(parseFloat(obj[mapping.dollars]) * 100);
        }
      }

      // Recurse into nested objects
      for (const key of Object.keys(obj)) {
        if (obj[key] && typeof obj[key] === 'object') {
          normalize(obj[key], `${parentPath}.${key}`);
        }
      }
    };

    normalize(req.body);
    next();
  };
};

// ============================================================================
// RESOURCE OWNERSHIP CHECK
// ============================================================================

/**
 * Checks if user owns the resource or is admin/manager
 */
const checkOwnership = (getOwnerId) => {
  return async (req, res, next) => {
    try {
      if (!req.user) {
        throw ApiError.unauthorized('Authentication required');
      }

      const ownerId = await getOwnerId(req);
      const userId = req.user.id;
      const role = req.user.role?.toLowerCase();

      // Admins and managers can access any resource
      if (role === 'admin' || role === 'manager') {
        return next();
      }

      // Check ownership
      if (String(ownerId) !== String(userId)) {
        throw ApiError.forbidden('You do not have permission to access this resource');
      }

      next();
    } catch (error) {
      next(error);
    }
  };
};

// ============================================================================
// CACHE CONTROL MIDDLEWARE
// ============================================================================

/**
 * Sets cache control headers
 */
const cacheControl = (options = {}) => {
  const {
    maxAge = 0,
    private: isPrivate = true,
    noStore = false
  } = options;

  return (req, res, next) => {
    if (noStore) {
      res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate');
    } else if (isPrivate) {
      res.setHeader('Cache-Control', `private, max-age=${maxAge}`);
    } else {
      res.setHeader('Cache-Control', `public, max-age=${maxAge}`);
    }
    next();
  };
};

// ============================================================================
// API VERSION HEADER
// ============================================================================

/**
 * Adds API version to response headers
 */
const apiVersion = (version = '1') => {
  return (req, res, next) => {
    res.setHeader('X-API-Version', version);
    req.apiVersion = version;
    next();
  };
};

// ============================================================================
// COMBINED MIDDLEWARE STACKS
// ============================================================================

/**
 * Standard authenticated endpoint middleware stack
 */
const standardStack = [
  requestId,
  attachResponseHelpers,
  authenticate
];

/**
 * Public endpoint middleware stack (no auth required)
 */
const publicStack = [
  requestId,
  attachResponseHelpers
];

/**
 * Admin-only endpoint middleware stack
 */
const adminStack = [
  requestId,
  attachResponseHelpers,
  authenticate,
  requireRole('admin')
];

/**
 * Manager or admin endpoint middleware stack
 */
const managerStack = [
  requestId,
  attachResponseHelpers,
  authenticate,
  requireRole('admin', 'manager')
];

/**
 * POS endpoint middleware stack (cashiers allowed)
 */
const posStack = [
  requestId,
  attachResponseHelpers,
  authenticate,
  requireRole('admin', 'manager', 'sales', 'cashier')
];

// ============================================================================
// EXPORTS
// ============================================================================

module.exports = {
  // Core middleware
  requestId,
  requestLogger,
  parsePagination,
  parseDateRange,
  normalizeMoneyFields,
  checkOwnership,
  cacheControl,
  apiVersion,

  // Re-exports from existing modules
  ApiError,
  asyncHandler,
  authenticate,
  optionalAuth,
  requireRole,
  authenticateApiKey,
  attachResponseHelpers,
  validate,
  validateId,

  // Middleware stacks
  standardStack,
  publicStack,
  adminStack,
  managerStack,
  posStack
};
