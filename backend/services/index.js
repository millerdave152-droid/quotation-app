/**
 * Services Index
 * Exports all service classes for dependency injection
 */

const CustomerService = require('./CustomerService');
const QuoteService = require('./QuoteService');
const ProductService = require('./ProductService');

module.exports = {
  CustomerService,
  QuoteService,
  ProductService
};
