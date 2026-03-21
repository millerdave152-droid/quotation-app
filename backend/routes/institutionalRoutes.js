/**
 * Institutional Buyer Routes
 * Profiles, contacts, delivery addresses, and credit management
 * for government and institutional procurement.
 */

const express = require('express');
const router = express.Router();
const { ApiError, asyncHandler } = require('../middleware/errorHandler');
const { authenticate, requirePermission } = require('../middleware/auth');

let institutionalService = null;

// ============================================================================
// PROFILES
// ============================================================================

/**
 * GET /api/institutional
 * List profiles with optional filters.
 */
router.get('/', authenticate, requirePermission('institutional.profiles.view'), asyncHandler(async (req, res) => {
  const { search, orgType, isActive, limit, offset } = req.query;

  const filters = {};
  if (search) filters.search = search;
  if (orgType) filters.orgType = orgType;
  if (isActive !== undefined) filters.isActive = isActive === 'true';

  const pagination = {
    limit: limit ? parseInt(limit) : 20,
    offset: offset ? parseInt(offset) : 0,
  };

  const result = await institutionalService.listProfiles(filters, pagination);
  res.success(result);
}));

/**
 * POST /api/institutional
 * Create a new institutional profile.
 */
router.post('/', authenticate, requirePermission('institutional.profiles.create'), asyncHandler(async (req, res) => {
  const { customer_id, ...profileData } = req.body;

  if (!customer_id) throw ApiError.badRequest('customer_id is required');
  if (!profileData.org_type) throw ApiError.badRequest('org_type is required');
  if (!profileData.org_name) throw ApiError.badRequest('org_name is required');

  try {
    const profile = await institutionalService.createProfile(
      parseInt(customer_id), profileData, req.user.id
    );
    res.created(profile);
  } catch (err) {
    if (err.code === 'CUSTOMER_NOT_FOUND') throw ApiError.notFound('Customer');
    if (err.code === 'DUPLICATE_PROFILE') throw ApiError.conflict(err.message);
    if (err.code === 'INVALID_ORG_TYPE') throw ApiError.badRequest(err.message);
    if (err.code === 'INVALID_PAYMENT_TERMS') throw ApiError.badRequest(err.message);
    throw err;
  }
}));

/**
 * GET /api/institutional/:id
 * Get profile with contacts, addresses, and open quotes.
 */
router.get('/:id', authenticate, requirePermission('institutional.profiles.view'), asyncHandler(async (req, res) => {
  const profileId = parseInt(req.params.id);
  if (isNaN(profileId)) throw ApiError.badRequest('Profile ID must be an integer');

  try {
    const profile = await institutionalService.getProfile(profileId, {
      includeContacts: true,
      includeAddresses: true,
      includeOpenQuotes: true,
    });
    res.success(profile);
  } catch (err) {
    if (err.code === 'PROFILE_NOT_FOUND') throw ApiError.notFound('Institutional profile');
    throw err;
  }
}));

/**
 * PUT /api/institutional/:id
 * Update profile fields.
 */
router.put('/:id', authenticate, requirePermission('institutional.profiles.edit'), asyncHandler(async (req, res) => {
  const profileId = parseInt(req.params.id);
  if (isNaN(profileId)) throw ApiError.badRequest('Profile ID must be an integer');

  try {
    const profile = await institutionalService.updateProfile(profileId, req.body, req.user.id);
    res.success(profile);
  } catch (err) {
    if (err.code === 'PROFILE_NOT_FOUND') throw ApiError.notFound('Institutional profile');
    if (err.code === 'INVALID_ORG_TYPE') throw ApiError.badRequest(err.message);
    if (err.code === 'INVALID_PAYMENT_TERMS') throw ApiError.badRequest(err.message);
    throw err;
  }
}));

// ============================================================================
// CREDIT
// ============================================================================

/**
 * GET /api/institutional/:id/credit
 */
router.get('/:id/credit', authenticate, requirePermission('institutional.profiles.view'), asyncHandler(async (req, res) => {
  const profileId = parseInt(req.params.id);
  if (isNaN(profileId)) throw ApiError.badRequest('Profile ID must be an integer');

  try {
    const status = await institutionalService.getCreditStatus(profileId);
    res.success(status);
  } catch (err) {
    if (err.code === 'PROFILE_NOT_FOUND') throw ApiError.notFound('Institutional profile');
    throw err;
  }
}));

/**
 * PATCH /api/institutional/:id/credit-limit
 * Update credit_limit_cents only.
 */
router.patch('/:id/credit-limit', authenticate, requirePermission('institutional.profiles.edit'), asyncHandler(async (req, res) => {
  const profileId = parseInt(req.params.id);
  if (isNaN(profileId)) throw ApiError.badRequest('Profile ID must be an integer');

  const { credit_limit_cents } = req.body;
  if (!Number.isInteger(credit_limit_cents) || credit_limit_cents < 0) {
    throw ApiError.badRequest('credit_limit_cents must be a non-negative integer');
  }

  try {
    const profile = await institutionalService.updateProfile(
      profileId, { credit_limit_cents }, req.user.id
    );
    res.success(profile);
  } catch (err) {
    if (err.code === 'PROFILE_NOT_FOUND') throw ApiError.notFound('Institutional profile');
    throw err;
  }
}));

// ============================================================================
// CONTACTS
// ============================================================================

/**
 * GET /api/institutional/:id/contacts
 */
router.get('/:id/contacts', authenticate, requirePermission('institutional.contacts.view'), asyncHandler(async (req, res) => {
  const profileId = parseInt(req.params.id);
  if (isNaN(profileId)) throw ApiError.badRequest('Profile ID must be an integer');

  const includeInactive = req.query.includeInactive === 'true';
  const contacts = await institutionalService.listContacts(profileId, includeInactive);
  res.success(contacts);
}));

/**
 * POST /api/institutional/:id/contacts
 */
router.post('/:id/contacts', authenticate, requirePermission('institutional.contacts.create'), asyncHandler(async (req, res) => {
  const profileId = parseInt(req.params.id);
  if (isNaN(profileId)) throw ApiError.badRequest('Profile ID must be an integer');

  if (!req.body.first_name || !req.body.last_name) {
    throw ApiError.badRequest('first_name and last_name are required');
  }

  try {
    const contact = await institutionalService.addContact(profileId, req.body, req.user.id);
    res.created(contact);
  } catch (err) {
    if (err.code === 'PROFILE_NOT_FOUND') throw ApiError.notFound('Institutional profile');
    throw err;
  }
}));

/**
 * PUT /api/institutional/contacts/:contactId
 */
router.put('/contacts/:contactId', authenticate, requirePermission('institutional.contacts.edit'), asyncHandler(async (req, res) => {
  const contactId = parseInt(req.params.contactId);
  if (isNaN(contactId)) throw ApiError.badRequest('Contact ID must be an integer');

  try {
    const contact = await institutionalService.updateContact(contactId, req.body, req.user.id);
    res.success(contact);
  } catch (err) {
    if (err.code === 'CONTACT_NOT_FOUND') throw ApiError.notFound('Contact');
    throw err;
  }
}));

/**
 * DELETE /api/institutional/contacts/:contactId
 * Soft delete: sets is_active = false.
 */
router.delete('/contacts/:contactId', authenticate, requirePermission('institutional.contacts.edit'), asyncHandler(async (req, res) => {
  const contactId = parseInt(req.params.contactId);
  if (isNaN(contactId)) throw ApiError.badRequest('Contact ID must be an integer');

  try {
    const contact = await institutionalService.updateContact(contactId, { is_active: false }, req.user.id);
    res.success(contact);
  } catch (err) {
    if (err.code === 'CONTACT_NOT_FOUND') throw ApiError.notFound('Contact');
    throw err;
  }
}));

// ============================================================================
// DELIVERY ADDRESSES
// ============================================================================

/**
 * GET /api/institutional/:id/addresses
 */
router.get('/:id/addresses', authenticate, requirePermission('institutional.addresses.view'), asyncHandler(async (req, res) => {
  const profileId = parseInt(req.params.id);
  if (isNaN(profileId)) throw ApiError.badRequest('Profile ID must be an integer');

  const activeOnly = req.query.activeOnly !== 'false';
  const addresses = await institutionalService.listDeliveryAddresses(profileId, activeOnly);
  res.success(addresses);
}));

/**
 * POST /api/institutional/:id/addresses
 */
router.post('/:id/addresses', authenticate, requirePermission('institutional.addresses.create'), asyncHandler(async (req, res) => {
  const profileId = parseInt(req.params.id);
  if (isNaN(profileId)) throw ApiError.badRequest('Profile ID must be an integer');

  const { site_name, address_line1, city, province_code, postal_code } = req.body;
  if (!site_name || !address_line1 || !city || !province_code || !postal_code) {
    throw ApiError.badRequest('site_name, address_line1, city, province_code, and postal_code are required');
  }

  try {
    const address = await institutionalService.addDeliveryAddress(profileId, req.body);
    res.created(address);
  } catch (err) {
    if (err.code === 'PROFILE_NOT_FOUND') throw ApiError.notFound('Institutional profile');
    throw err;
  }
}));

/**
 * PUT /api/institutional/addresses/:addressId
 */
router.put('/addresses/:addressId', authenticate, requirePermission('institutional.addresses.edit'), asyncHandler(async (req, res) => {
  const addressId = parseInt(req.params.addressId);
  if (isNaN(addressId)) throw ApiError.badRequest('Address ID must be an integer');

  try {
    const address = await institutionalService.updateDeliveryAddress(addressId, req.body);
    res.success(address);
  } catch (err) {
    if (err.code === 'ADDRESS_NOT_FOUND') throw ApiError.notFound('Delivery address');
    throw err;
  }
}));

// ============================================================================
// CUSTOMER PROFILE LOOKUP
// ============================================================================

/**
 * GET /api/institutional/customer/:customerId/profile
 * Returns profile or { profile: null } — never 404.
 */
router.get('/customer/:customerId/profile', authenticate, asyncHandler(async (req, res) => {
  const customerId = parseInt(req.params.customerId);
  if (isNaN(customerId)) throw ApiError.badRequest('Customer ID must be an integer');

  const profile = await institutionalService.getProfileByCustomer(customerId);
  res.success({ profile });
}));

// ============================================================================
// INVOICES
// ============================================================================

/**
 * POST /api/institutional/invoices
 * Create invoice from accepted quotes.
 */
router.post('/invoices', authenticate, requirePermission('institutional.invoices.create'), asyncHandler(async (req, res) => {
  const { profileId, quoteIds, notes } = req.body;

  if (!profileId) throw ApiError.badRequest('profileId is required');
  if (!Array.isArray(quoteIds) || quoteIds.length === 0) {
    throw ApiError.badRequest('quoteIds must be a non-empty array');
  }

  try {
    const invoice = await institutionalService.createInvoice(
      parseInt(profileId), quoteIds.map(Number), { notes }, req.user.id
    );
    res.created(invoice);
  } catch (err) {
    if (err.code === 'PROFILE_NOT_FOUND') throw ApiError.notFound('Institutional profile');
    if (err.code === 'INVALID_QUOTES') throw ApiError.badRequest(err.message);
    if (err.code === 'QUOTES_NOT_READY') throw ApiError.badRequest(err.message);
    throw err;
  }
}));

/**
 * GET /api/institutional/invoices
 * List invoices with filters.
 */
router.get('/invoices', authenticate, requirePermission('institutional.invoices.view'), asyncHandler(async (req, res) => {
  const { profileId, status, overdueOnly, fromDate, toDate, limit, offset } = req.query;

  const filters = {};
  if (profileId) filters.profileId = parseInt(profileId);
  if (status) filters.status = status;
  if (overdueOnly === 'true') filters.overdueOnly = true;
  if (fromDate) filters.fromDate = fromDate;
  if (toDate) filters.toDate = toDate;

  const pagination = {
    limit: limit ? parseInt(limit) : 20,
    offset: offset ? parseInt(offset) : 0,
  };

  const result = await institutionalService.listInvoices(filters, pagination);
  res.success(result);
}));

/**
 * GET /api/institutional/invoices/overdue
 * Shortcut for overdue invoices.
 */
router.get('/invoices/overdue', authenticate, requirePermission('institutional.invoices.view'), asyncHandler(async (req, res) => {
  const result = await institutionalService.listInvoices({ overdueOnly: true });
  res.success(result);
}));

/**
 * GET /api/institutional/invoices/:invoiceId
 */
router.get('/invoices/:invoiceId', authenticate, requirePermission('institutional.invoices.view'), asyncHandler(async (req, res) => {
  const invoiceId = parseInt(req.params.invoiceId);
  if (isNaN(invoiceId)) throw ApiError.badRequest('Invoice ID must be an integer');

  try {
    const invoice = await institutionalService.getInvoice(invoiceId, true);
    res.success(invoice);
  } catch (err) {
    if (err.code === 'INVOICE_NOT_FOUND') throw ApiError.notFound('Invoice');
    throw err;
  }
}));

/**
 * POST /api/institutional/invoices/:invoiceId/payment
 * Record a payment.
 */
router.post('/invoices/:invoiceId/payment', authenticate, requirePermission('institutional.payments.create'), asyncHandler(async (req, res) => {
  const invoiceId = parseInt(req.params.invoiceId);
  if (isNaN(invoiceId)) throw ApiError.badRequest('Invoice ID must be an integer');

  const { amount_cents, payment_method, payment_reference, received_date, notes } = req.body;
  if (!amount_cents || !payment_method || !received_date) {
    throw ApiError.badRequest('amount_cents, payment_method, and received_date are required');
  }

  try {
    const result = await institutionalService.recordPayment(
      invoiceId,
      { amount_cents, payment_method, payment_reference, received_date, notes },
      req.user.id
    );
    res.success(result);
  } catch (err) {
    if (err.code === 'INVOICE_NOT_FOUND') throw ApiError.notFound('Invoice');
    if (err.code === 'INVOICE_VOIDED') throw ApiError.badRequest(err.message);
    if (err.code === 'INVALID_AMOUNT') throw ApiError.badRequest(err.message);
    if (err.code === 'INVALID_PAYMENT_METHOD') throw ApiError.badRequest(err.message);
    throw err;
  }
}));

/**
 * POST /api/institutional/invoices/:invoiceId/pdf
 * Generate and upload invoice PDF.
 */
router.post('/invoices/:invoiceId/pdf', authenticate, requirePermission('institutional.invoices.create'), asyncHandler(async (req, res) => {
  const invoiceId = parseInt(req.params.invoiceId);
  if (isNaN(invoiceId)) throw ApiError.badRequest('Invoice ID must be an integer');

  try {
    const pdf_url = await institutionalService.generateInvoicePDF(invoiceId);
    res.success({ pdf_url });
  } catch (err) {
    if (err.code === 'INVOICE_NOT_FOUND') throw ApiError.notFound('Invoice');
    throw err;
  }
}));

/**
 * PUT /api/institutional/invoices/:invoiceId/void
 * Void an unpaid invoice. Admin only.
 */
router.put('/invoices/:invoiceId/void', authenticate, requirePermission('institutional.invoices.edit'), asyncHandler(async (req, res) => {
  const invoiceId = parseInt(req.params.invoiceId);
  if (isNaN(invoiceId)) throw ApiError.badRequest('Invoice ID must be an integer');

  try {
    const invoice = await institutionalService.voidInvoice(invoiceId, req.body.reason || '', req.user.id);
    res.success(invoice);
  } catch (err) {
    if (err.code === 'INVOICE_NOT_FOUND') throw ApiError.notFound('Invoice');
    if (err.code === 'CANNOT_VOID_PAID') throw ApiError.badRequest(err.message);
    throw err;
  }
}));

/**
 * GET /api/institutional/:profileId/invoices
 * All invoices for one profile.
 */
router.get('/:profileId/invoices', authenticate, requirePermission('institutional.invoices.view'), asyncHandler(async (req, res) => {
  const profileId = parseInt(req.params.profileId);
  if (isNaN(profileId)) throw ApiError.badRequest('Profile ID must be an integer');

  const { limit, offset } = req.query;
  const result = await institutionalService.listInvoices(
    { profileId },
    { limit: limit ? parseInt(limit) : 20, offset: offset ? parseInt(offset) : 0 }
  );
  res.success(result);
}));

// ============================================================================
// INIT
// ============================================================================

const init = (deps) => {
  institutionalService = deps.institutionalService;
  return router;
};

module.exports = { init };
