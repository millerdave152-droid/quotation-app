const express = require('express');
const router = express.Router();
const { asyncHandler } = require('../middleware/errorHandler');
const { authenticate, requirePermission } = require('../middleware/auth');

let accountService = null;

// List accounts
router.get('/', authenticate, requirePermission('customer_accounts.view'), asyncHandler(async (req, res) => {
  const { status, limit, offset } = req.query;
  const result = await accountService.listAccounts({
    status,
    limit: parseInt(limit) || 50,
    offset: parseInt(offset) || 0
  });
  res.success(result);
}));

// Get account by ID
router.get('/:id', authenticate, requirePermission('customer_accounts.view'), asyncHandler(async (req, res) => {
  const account = await accountService.getAccount(parseInt(req.params.id));
  res.success(account);
}));

// Get account by customer ID
router.get('/customer/:customerId', authenticate, requirePermission('customer_accounts.view'), asyncHandler(async (req, res) => {
  const account = await accountService.getAccount(parseInt(req.params.customerId), true);
  res.success(account);
}));

// Open account
router.post('/', authenticate, requirePermission('customer_accounts.create'), asyncHandler(async (req, res) => {
  const { customerId, creditLimitCents, paymentTermsDays } = req.body;
  const account = await accountService.openAccount(customerId, creditLimitCents, paymentTermsDays, req.user.userId);
  res.created(account);
}));

// Update account
router.put('/:id', authenticate, requirePermission('customer_accounts.edit'), asyncHandler(async (req, res) => {
  const account = await accountService.updateAccount(parseInt(req.params.id), req.body, req.user.userId);
  res.success(account);
}));

// Charge to account
router.post('/:id/charge', authenticate, requirePermission('customer_accounts.charge'), asyncHandler(async (req, res) => {
  const { amountCents, referenceType, referenceId, description } = req.body;
  const txn = await accountService.charge(parseInt(req.params.id), amountCents, referenceType, referenceId, description, req.user.userId);
  res.created(txn);
}));

// Record payment
router.post('/:id/payment', authenticate, requirePermission('customer_accounts.payment'), asyncHandler(async (req, res) => {
  const { amountCents, referenceType, referenceId, description } = req.body;
  const txn = await accountService.payment(parseInt(req.params.id), amountCents, referenceType, referenceId, description, req.user.userId);
  res.created(txn);
}));

// Get statement
router.get('/:id/statement', authenticate, requirePermission('customer_accounts.view'), asyncHandler(async (req, res) => {
  const { startDate, endDate, limit, offset } = req.query;
  const statement = await accountService.getStatement(parseInt(req.params.id), {
    startDate, endDate,
    limit: parseInt(limit) || 100,
    offset: parseInt(offset) || 0
  });
  res.success(statement);
}));

// Check credit hold
router.get('/credit-check/:customerId', authenticate, asyncHandler(async (req, res) => {
  const result = await accountService.checkCreditHold(parseInt(req.params.customerId));
  res.success(result);
}));

const init = (deps) => {
  accountService = deps.accountService;
  return router;
};

module.exports = { init };
