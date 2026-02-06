/**
 * API v1 Router
 * Versioned API with standardized patterns
 *
 * URL Structure:
 *   /api/v1/quotes     - Quote management
 *   /api/v1/orders     - Order management
 *   /api/v1/pos        - POS operations (transactions, registers, shifts)
 *   /api/v1/customers  - Customer management
 *   /api/v1/products   - Product catalog
 *   /api/v1/reports    - Unified reporting
 */

const express = require('express');
const router = express.Router();

const { apiVersion, requestLogger } = require('../../shared/middleware');

// Route modules (using init pattern for dependency injection)
const quotesRoutes = require('./quotes.routes');
const ordersRoutes = require('./orders.routes');
const posRoutes = require('./pos.routes');
const customersRoutes = require('./customers.routes');
const productsRoutes = require('./products.routes');
const reportsRoutes = require('./reports.routes');

/**
 * Initialize v1 API routes with dependencies
 * @param {Object} deps - Dependencies object
 * @param {Object} deps.db - Database connection
 * @param {Object} deps.services - Service instances
 */
const init = (deps) => {
  // Apply v1 version header to all routes
  router.use(apiVersion('1'));

  // Request logging in non-production
  router.use(requestLogger);

  // ============================================================================
  // ROUTE MODULES
  // ============================================================================

  // Quote routes
  router.use('/quotes', quotesRoutes.init(deps));

  // Order routes
  router.use('/orders', ordersRoutes.init(deps));

  // POS routes (combined transactions, registers, shifts)
  router.use('/pos', posRoutes.init(deps));

  // Customer routes
  router.use('/customers', customersRoutes.init(deps));

  // Product routes
  router.use('/products', productsRoutes.init(deps));

  // Report routes
  router.use('/reports', reportsRoutes.init(deps));

  // ============================================================================
  // API INFO ENDPOINT
  // ============================================================================

  router.get('/', (req, res) => {
    res.json({
      success: true,
      data: {
        name: 'TeleTime Quotation & POS API',
        version: '1.0.0',
        apiVersion: 'v1',
        endpoints: {
          quotes: '/api/v1/quotes',
          orders: '/api/v1/orders',
          pos: '/api/v1/pos',
          customers: '/api/v1/customers',
          products: '/api/v1/products',
          reports: '/api/v1/reports'
        },
        documentation: '/api/v1/docs'
      },
      error: null,
      meta: {
        timestamp: new Date().toISOString()
      }
    });
  });

  return router;
};

module.exports = { router, init };
