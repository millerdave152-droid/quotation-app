/**
 * Customer Routes Module
 * Handles all customer-related API endpoints
 * Uses CustomerService for business logic
 */

const express = require('express');
const router = express.Router();
const { ApiError, asyncHandler } = require('../middleware/errorHandler');
const CustomerService = require('../services/CustomerService');

// Module-level service instance
let customerService = null;

/**
 * Initialize the router with dependencies
 * @param {object} deps - Dependencies
 * @param {Pool} deps.pool - PostgreSQL connection pool
 * @param {object} deps.cache - Cache module
 */
const init = (deps) => {
  customerService = new CustomerService(deps.pool, deps.cache);
  return router;
};

// ============================================
// CUSTOMER ROUTES
// ============================================

/**
 * GET /api/customers
 * Get all customers with search, filter, sorting, and pagination
 */
router.get('/', asyncHandler(async (req, res) => {
  const result = await customerService.getCustomers(req.query);
  res.json(result);
}));

/**
 * GET /api/customers/stats/overview
 * Get customer statistics overview
 */
router.get('/stats/overview', asyncHandler(async (req, res) => {
  const stats = await customerService.getStatsOverview();
  res.success(stats);
}));

/**
 * GET /api/customers/:id
 * Get single customer with quote history
 */
router.get('/:id', asyncHandler(async (req, res) => {
  const { id } = req.params;
  const result = await customerService.getCustomerById(id);

  if (!result) {
    throw ApiError.notFound('Customer');
  }

  res.success(result);
}));

/**
 * POST /api/customers
 * Create a new customer
 */
router.post('/', asyncHandler(async (req, res) => {
  const { name, email } = req.body;

  if (!name || !email) {
    throw ApiError.validation('Name and email are required');
  }

  try {
    const customer = await customerService.createCustomer(req.body);
    res.created(customer);
  } catch (error) {
    // Check for duplicate email constraint violation
    if (error.code === '23505' && error.constraint === 'customers_email_key') {
      throw ApiError.conflict('Email already in use', {
        details: 'This email address is already registered to another customer'
      });
    }
    throw error;
  }
}));

/**
 * PUT /api/customers/:id
 * Update an existing customer
 */
router.put('/:id', asyncHandler(async (req, res) => {
  const { id } = req.params;

  try {
    const customer = await customerService.updateCustomer(id, req.body);

    if (!customer) {
      throw ApiError.notFound('Customer');
    }

    res.success(customer);
  } catch (error) {
    // Check for duplicate email constraint violation
    if (error.code === '23505' && error.constraint === 'customers_email_key') {
      throw ApiError.conflict('Email already in use', {
        details: 'This email address is already registered to another customer'
      });
    }
    throw error;
  }
}));

/**
 * DELETE /api/customers/:id
 * Delete a customer
 */
router.delete('/:id', asyncHandler(async (req, res) => {
  const { id } = req.params;
  const result = await customerService.deleteCustomer(id);

  if (!result) {
    throw ApiError.notFound('Customer');
  }

  res.success(null, { message: 'Customer deleted successfully' });
}));

module.exports = { router, init };
