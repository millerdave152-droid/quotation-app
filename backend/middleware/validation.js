/**
 * Validation Middleware
 * Handles request validation using express-validator
 * @module middleware/validation
 */

const { body, param, query, validationResult } = require('express-validator');
const { PASSWORD_MIN_LENGTH } = require('../utils/password');

/**
 * Handle Validation Errors
 * Middleware to check validation result and return errors
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 * @param {Function} next - Express next middleware function
 */
const handleValidationErrors = (req, res, next) => {
  const errors = validationResult(req);

  if (!errors.isEmpty()) {
    const formattedErrors = errors.array().map(err => ({
      field: err.path || err.param,
      message: err.msg,
      value: err.value
    }));

    return res.status(400).json({
      success: false,
      message: 'Validation failed',
      errors: formattedErrors
    });
  }

  next();
};

/**
 * Validation Rules for User Registration
 * Validates email, password, first name, last name
 */
const validateRegister = [
  body('email')
    .trim()
    .notEmpty()
    .withMessage('Email is required')
    .isEmail()
    .withMessage('Please provide a valid email address')
    .normalizeEmail()
    .isLength({ max: 255 })
    .withMessage('Email must not exceed 255 characters'),

  body('password')
    .notEmpty()
    .withMessage('Password is required')
    .isLength({ min: PASSWORD_MIN_LENGTH })
    .withMessage(`Password must be at least ${PASSWORD_MIN_LENGTH} characters long`)
    .isLength({ max: 128 })
    .withMessage('Password must not exceed 128 characters')
    .matches(/[A-Z]/)
    .withMessage('Password must contain at least one uppercase letter')
    .matches(/[a-z]/)
    .withMessage('Password must contain at least one lowercase letter')
    .matches(/[0-9]/)
    .withMessage('Password must contain at least one number'),

  body('firstName')
    .trim()
    .notEmpty()
    .withMessage('First name is required')
    .isLength({ min: 2, max: 50 })
    .withMessage('First name must be between 2 and 50 characters')
    .matches(/^[a-zA-Z\s'-]+$/)
    .withMessage('First name can only contain letters, spaces, hyphens, and apostrophes'),

  body('lastName')
    .trim()
    .notEmpty()
    .withMessage('Last name is required')
    .isLength({ min: 2, max: 50 })
    .withMessage('Last name must be between 2 and 50 characters')
    .matches(/^[a-zA-Z\s'-]+$/)
    .withMessage('Last name can only contain letters, spaces, hyphens, and apostrophes'),

  body('role')
    .optional()
    .trim()
    .isIn(['user', 'admin', 'manager'])
    .withMessage('Invalid role. Must be one of: user, admin, manager'),

  handleValidationErrors
];

/**
 * Validation Rules for User Login
 * Validates email and password presence
 */
const validateLogin = [
  body('email')
    .trim()
    .notEmpty()
    .withMessage('Email is required')
    .isEmail()
    .withMessage('Please provide a valid email address')
    .normalizeEmail(),

  body('password')
    .notEmpty()
    .withMessage('Password is required'),

  handleValidationErrors
];

/**
 * Validation Rules for Password Change
 * Validates current password and new password
 */
const validateChangePassword = [
  body('currentPassword')
    .notEmpty()
    .withMessage('Current password is required'),

  body('newPassword')
    .notEmpty()
    .withMessage('New password is required')
    .isLength({ min: PASSWORD_MIN_LENGTH })
    .withMessage(`New password must be at least ${PASSWORD_MIN_LENGTH} characters long`)
    .isLength({ max: 128 })
    .withMessage('New password must not exceed 128 characters')
    .matches(/[A-Z]/)
    .withMessage('New password must contain at least one uppercase letter')
    .matches(/[a-z]/)
    .withMessage('New password must contain at least one lowercase letter')
    .matches(/[0-9]/)
    .withMessage('New password must contain at least one number')
    .custom((value, { req }) => {
      if (value === req.body.currentPassword) {
        throw new Error('New password must be different from current password');
      }
      return true;
    }),

  body('confirmPassword')
    .notEmpty()
    .withMessage('Password confirmation is required')
    .custom((value, { req }) => {
      if (value !== req.body.newPassword) {
        throw new Error('Password confirmation does not match new password');
      }
      return true;
    }),

  handleValidationErrors
];

/**
 * Validation Rules for Refresh Token
 * Validates refresh token presence
 */
const validateRefreshToken = [
  body('refreshToken')
    .notEmpty()
    .withMessage('Refresh token is required')
    .isString()
    .withMessage('Refresh token must be a string'),

  handleValidationErrors
];

/**
 * Validation Rules for Password Reset Request
 * Validates email for password reset
 */
const validatePasswordResetRequest = [
  body('email')
    .trim()
    .notEmpty()
    .withMessage('Email is required')
    .isEmail()
    .withMessage('Please provide a valid email address')
    .normalizeEmail(),

  handleValidationErrors
];

/**
 * Validation Rules for Password Reset
 * Validates reset token and new password
 */
const validatePasswordReset = [
  body('token')
    .notEmpty()
    .withMessage('Reset token is required')
    .isString()
    .withMessage('Reset token must be a string'),

  body('newPassword')
    .notEmpty()
    .withMessage('New password is required')
    .isLength({ min: PASSWORD_MIN_LENGTH })
    .withMessage(`New password must be at least ${PASSWORD_MIN_LENGTH} characters long`)
    .isLength({ max: 128 })
    .withMessage('New password must not exceed 128 characters')
    .matches(/[A-Z]/)
    .withMessage('New password must contain at least one uppercase letter')
    .matches(/[a-z]/)
    .withMessage('New password must contain at least one lowercase letter')
    .matches(/[0-9]/)
    .withMessage('New password must contain at least one number'),

  body('confirmPassword')
    .notEmpty()
    .withMessage('Password confirmation is required')
    .custom((value, { req }) => {
      if (value !== req.body.newPassword) {
        throw new Error('Password confirmation does not match new password');
      }
      return true;
    }),

  handleValidationErrors
];

/**
 * Validation Rules for Email Update
 * Validates new email address
 */
const validateEmailUpdate = [
  body('newEmail')
    .trim()
    .notEmpty()
    .withMessage('New email is required')
    .isEmail()
    .withMessage('Please provide a valid email address')
    .normalizeEmail()
    .isLength({ max: 255 })
    .withMessage('Email must not exceed 255 characters'),

  body('password')
    .notEmpty()
    .withMessage('Password is required for email change'),

  handleValidationErrors
];

/**
 * Validation Rules for Profile Update
 * Validates first name and last name
 */
const validateProfileUpdate = [
  body('firstName')
    .optional()
    .trim()
    .isLength({ min: 2, max: 50 })
    .withMessage('First name must be between 2 and 50 characters')
    .matches(/^[a-zA-Z\s'-]+$/)
    .withMessage('First name can only contain letters, spaces, hyphens, and apostrophes'),

  body('lastName')
    .optional()
    .trim()
    .isLength({ min: 2, max: 50 })
    .withMessage('Last name must be between 2 and 50 characters')
    .matches(/^[a-zA-Z\s'-]+$/)
    .withMessage('Last name can only contain letters, spaces, hyphens, and apostrophes'),

  handleValidationErrors
];

/**
 * Validation Rules for User ID Parameter
 * Validates user ID in URL params
 */
const validateUserId = [
  param('id')
    .notEmpty()
    .withMessage('User ID is required')
    .isInt({ min: 1 })
    .withMessage('User ID must be a positive integer'),

  handleValidationErrors
];

/**
 * Validation Rules for Pagination
 * Validates page and limit query parameters
 */
const validatePagination = [
  query('page')
    .optional()
    .isInt({ min: 1 })
    .withMessage('Page must be a positive integer'),

  query('limit')
    .optional()
    .isInt({ min: 1, max: 100 })
    .withMessage('Limit must be between 1 and 100'),

  handleValidationErrors
];

/**
 * Validation Rules for API Key Creation
 * Validates API key name and expiration
 */
const validateApiKeyCreation = [
  body('name')
    .trim()
    .notEmpty()
    .withMessage('API key name is required')
    .isLength({ min: 3, max: 100 })
    .withMessage('API key name must be between 3 and 100 characters'),

  body('expiresInDays')
    .optional()
    .isInt({ min: 1, max: 365 })
    .withMessage('Expiration must be between 1 and 365 days'),

  handleValidationErrors
];

/**
 * Custom Validator: Check if Email Already Exists
 * Can be used in registration validation
 * @param {Function} checkEmailFn - Function to check if email exists
 * @returns {Function} Validator function
 */
const emailNotExists = (checkEmailFn) => {
  return body('email').custom(async (email) => {
    const exists = await checkEmailFn(email);
    if (exists) {
      throw new Error('Email already registered');
    }
    return true;
  });
};

/**
 * Sanitization Middleware
 * Additional sanitization for common fields
 */
const sanitizeCommonFields = [
  body('email').trim().normalizeEmail(),
  body('firstName').trim().escape(),
  body('lastName').trim().escape(),
];

// ============================================
// JOI VALIDATION FOR MARKETPLACE ENDPOINTS
// ============================================
const Joi = require('joi');

/**
 * Create Joi validation middleware
 * @param {Object} schema - Joi schema
 * @param {string} property - Request property to validate (body, params, query)
 */
const validateJoi = (schema, property = 'body') => {
  return (req, res, next) => {
    const { error, value } = schema.validate(req[property], {
      abortEarly: false,
      stripUnknown: true
    });

    if (error) {
      const errors = error.details.map(detail => ({
        field: detail.path.join('.'),
        message: detail.message
      }));
      return res.status(400).json({
        error: 'Validation failed',
        details: errors
      });
    }

    req[property] = value;
    next();
  };
};

// Order Schemas
const orderIdParamSchema = Joi.object({
  id: Joi.number().integer().positive().required()
});

const orderSyncSchema = Joi.object({
  start_date: Joi.date().iso().optional(),
  order_state_codes: Joi.string().optional()
});

const batchOrdersSchema = Joi.object({
  order_ids: Joi.array()
    .items(Joi.number().integer().positive())
    .min(1)
    .max(100)
    .required()
    .messages({
      'array.min': 'At least one order ID is required',
      'array.max': 'Cannot process more than 100 orders at once'
    }),
  reason: Joi.string().max(500).optional()
});

const shipmentSchema = Joi.object({
  tracking_number: Joi.string().max(255).required(),
  carrier_code: Joi.string().max(100).required(),
  carrier_name: Joi.string().max(255).optional(),
  shipped_items: Joi.array().items(
    Joi.object({
      order_line_id: Joi.string().required(),
      quantity: Joi.number().integer().positive().required()
    })
  ).optional()
});

// Product Schemas
const productIdsSchema = Joi.object({
  product_ids: Joi.array()
    .items(Joi.number().integer().positive())
    .min(1)
    .max(500)
    .required()
    .messages({
      'array.min': 'At least one product ID is required',
      'array.max': 'Cannot process more than 500 products at once'
    })
});

const bulkToggleSchema = Joi.object({
  product_ids: Joi.array()
    .items(Joi.number().integer().positive())
    .min(1)
    .max(500)
    .required(),
  enabled: Joi.boolean().required(),
  user_name: Joi.string().max(255).optional()
});

const bulkAssignCategorySchema = Joi.object({
  product_ids: Joi.array()
    .items(Joi.number().integer().positive())
    .min(1)
    .max(500)
    .required(),
  category_code: Joi.string().max(50).required(),
  user_name: Joi.string().max(255).optional()
});

const bulkAdjustPricesSchema = Joi.object({
  product_ids: Joi.array()
    .items(Joi.number().integer().positive())
    .min(1)
    .max(500)
    .required(),
  adjustment_type: Joi.string()
    .valid('percentage', 'fixed', 'set')
    .required(),
  adjustment_value: Joi.number().required(),
  user_name: Joi.string().max(255).optional()
});

const stockBufferSchema = Joi.object({
  buffer: Joi.alternatives()
    .try(
      Joi.number().integer().min(0).max(9999),
      Joi.allow(null, '')
    )
    .required()
});

// Price Rule Schemas
const priceRuleSchema = Joi.object({
  name: Joi.string().min(1).max(255).required(),
  description: Joi.string().max(1000).optional().allow(''),
  rule_type: Joi.string()
    .valid('percentage_markup', 'percentage_discount', 'fixed_markup', 'fixed_price', 'cost_plus')
    .required(),
  value: Joi.number().required(),
  category_code: Joi.string().max(50).optional().allow(null, ''),
  manufacturer: Joi.string().max(255).optional().allow(null, ''),
  min_price: Joi.number().min(0).optional().allow(null),
  max_price: Joi.number().min(0).optional().allow(null),
  priority: Joi.number().integer().min(1).max(1000).default(100),
  enabled: Joi.boolean().default(true),
  apply_globally: Joi.boolean().default(false)
});

const priceRuleUpdateSchema = Joi.object({
  name: Joi.string().min(1).max(255).optional(),
  description: Joi.string().max(1000).optional().allow(''),
  rule_type: Joi.string()
    .valid('percentage_markup', 'percentage_discount', 'fixed_markup', 'fixed_price', 'cost_plus')
    .optional(),
  value: Joi.number().optional(),
  category_code: Joi.string().max(50).optional().allow(null, ''),
  manufacturer: Joi.string().max(255).optional().allow(null, ''),
  min_price: Joi.number().min(0).optional().allow(null),
  max_price: Joi.number().min(0).optional().allow(null),
  priority: Joi.number().integer().min(1).max(1000).optional(),
  enabled: Joi.boolean().optional(),
  apply_globally: Joi.boolean().optional()
});

// Automation Rule Schemas
const conditionSchema = Joi.object({
  field: Joi.string().required(),
  operator: Joi.string()
    .valid('equals', 'not_equals', 'greater_than', 'less_than', 'greater_than_or_equal', 'less_than_or_equal', 'contains', 'not_contains')
    .required(),
  value: Joi.alternatives()
    .try(Joi.string(), Joi.number(), Joi.boolean())
    .required()
});

const autoRuleSchema = Joi.object({
  name: Joi.string().min(1).max(255).required(),
  description: Joi.string().max(1000).optional().allow(''),
  rule_type: Joi.string()
    .valid('auto_accept', 'auto_reject', 'alert', 'notification')
    .required(),
  conditions: Joi.array().items(conditionSchema).min(1).required(),
  action: Joi.string()
    .valid('accept', 'reject', 'notify', 'flag')
    .required(),
  action_params: Joi.object().optional().default({}),
  priority: Joi.number().integer().min(1).max(1000).default(100),
  enabled: Joi.boolean().default(true)
});

// Return Schemas
const returnItemSchema = Joi.object({
  order_item_id: Joi.number().integer().positive().optional(),
  product_id: Joi.number().integer().positive().optional(),
  product_sku: Joi.string().max(255).optional(),
  quantity_returned: Joi.number().integer().positive().required(),
  reason: Joi.string().max(100).optional(),
  condition: Joi.string()
    .valid('new', 'like_new', 'good', 'fair', 'poor', 'damaged', 'unknown')
    .default('unknown'),
  notes: Joi.string().max(1000).optional()
});

const createReturnSchema = Joi.object({
  order_id: Joi.number().integer().positive().required(),
  return_type: Joi.string()
    .valid('return', 'exchange', 'refund_only')
    .default('return'),
  return_reason: Joi.string().max(100).required(),
  return_reason_detail: Joi.string().max(2000).optional(),
  items: Joi.array().items(returnItemSchema).min(1).required(),
  notes: Joi.string().max(2000).optional()
});

const updateReturnSchema = Joi.object({
  status: Joi.string()
    .valid('pending', 'approved', 'rejected', 'received', 'inspecting', 'processed', 'refunded', 'closed', 'cancelled')
    .optional(),
  received_date: Joi.date().iso().optional(),
  tracking_number: Joi.string().max(255).optional(),
  carrier_code: Joi.string().max(100).optional(),
  notes: Joi.string().max(2000).optional(),
  internal_notes: Joi.string().max(2000).optional(),
  restocking_fee_cents: Joi.number().integer().min(0).optional()
});

const processRefundSchema = Joi.object({
  return_id: Joi.number().integer().positive().optional(),
  order_id: Joi.number().integer().positive().optional(),
  refund_type: Joi.string()
    .valid('full', 'partial', 'shipping_only', 'store_credit')
    .default('full'),
  amount_cents: Joi.number().integer().positive().required(),
  reason: Joi.string().max(255).optional(),
  notes: Joi.string().max(1000).optional()
}).or('return_id', 'order_id');

// Bulk Operations Schemas
const bulkShipmentSchema = Joi.object({
  shipments: Joi.array().items(
    Joi.object({
      order_id: Joi.number().integer().positive().required(),
      tracking_number: Joi.string().max(255).required(),
      carrier_code: Joi.string().max(100).required(),
      carrier_name: Joi.string().max(255).optional()
    })
  ).min(1).max(50).required()
});

const bulkStockUpdateSchema = Joi.object({
  updates: Joi.array().items(
    Joi.object({
      product_id: Joi.number().integer().positive().required(),
      quantity: Joi.number().integer().min(0).required()
    })
  ).min(1).max(500).required(),
  user_name: Joi.string().max(255).optional()
});

// Query Schemas
const marketplacePaginationSchema = Joi.object({
  page: Joi.number().integer().min(1).default(1),
  limit: Joi.number().integer().min(1).max(100).default(50),
  offset: Joi.number().integer().min(0).default(0)
});

const orderQuerySchema = marketplacePaginationSchema.keys({
  status: Joi.string()
    .valid('WAITING_ACCEPTANCE', 'SHIPPING', 'SHIPPED', 'RECEIVED', 'REFUSED', 'CANCELLED')
    .optional(),
  start_date: Joi.date().iso().optional(),
  end_date: Joi.date().iso().optional(),
  customer_email: Joi.string().email().optional(),
  search: Joi.string().max(255).optional()
});

const returnQuerySchema = marketplacePaginationSchema.keys({
  status: Joi.string()
    .valid('pending', 'approved', 'rejected', 'received', 'inspecting', 'processed', 'refunded', 'closed', 'cancelled')
    .optional(),
  return_type: Joi.string().valid('return', 'exchange', 'refund_only').optional(),
  start_date: Joi.date().iso().optional(),
  end_date: Joi.date().iso().optional(),
  customer_email: Joi.string().email().optional()
});

// Marketplace validation schemas export
const marketplaceSchemas = {
  orderIdParam: orderIdParamSchema,
  orderSync: orderSyncSchema,
  batchOrders: batchOrdersSchema,
  shipment: shipmentSchema,
  productIds: productIdsSchema,
  bulkToggle: bulkToggleSchema,
  bulkAssignCategory: bulkAssignCategorySchema,
  bulkAdjustPrices: bulkAdjustPricesSchema,
  stockBuffer: stockBufferSchema,
  priceRule: priceRuleSchema,
  priceRuleUpdate: priceRuleUpdateSchema,
  autoRule: autoRuleSchema,
  createReturn: createReturnSchema,
  updateReturn: updateReturnSchema,
  processRefund: processRefundSchema,
  bulkShipment: bulkShipmentSchema,
  bulkStockUpdate: bulkStockUpdateSchema,
  pagination: marketplacePaginationSchema,
  orderQuery: orderQuerySchema,
  returnQuery: returnQuerySchema
};

module.exports = {
  validateRegister,
  validateLogin,
  validateChangePassword,
  validateRefreshToken,
  validatePasswordResetRequest,
  validatePasswordReset,
  validateEmailUpdate,
  validateProfileUpdate,
  validateUserId,
  validatePagination,
  validateApiKeyCreation,
  handleValidationErrors,
  emailNotExists,
  sanitizeCommonFields,
  // Joi validation for marketplace
  validateJoi,
  marketplaceSchemas
};
