/**
 * TeleTime - Communication Preferences & CASL Compliance Routes
 * Manage customer communication preferences with full consent audit logging.
 */

const express = require('express');
const Joi = require('joi');
const { authenticate, requireRole } = require('../middleware/auth');
const { ApiError, asyncHandler } = require('../middleware/errorHandler');

let pool = null;

// ============================================================================
// CUSTOMER PREFERENCES ROUTER — mounted at /api/customers
// ============================================================================

const customerRouter = express.Router();
customerRouter.use(authenticate);

const PREFERENCE_FIELDS = ['email_transactional', 'email_marketing', 'sms_transactional', 'sms_marketing'];

/**
 * GET /api/customers/:id/preferences
 * Returns current communication preferences and consent history.
 */
customerRouter.get('/:id/preferences', asyncHandler(async (req, res) => {
  const customerId = parseInt(req.params.id);
  if (isNaN(customerId)) throw ApiError.badRequest('Invalid customer ID');

  const result = await pool.query(
    `SELECT id, name, email, phone,
            email_transactional, email_marketing, sms_transactional, sms_marketing,
            preferences_updated_at, consent_recorded_at, consent_ip_address, consent_source
     FROM customers WHERE id = $1`,
    [customerId]
  );

  if (result.rows.length === 0) throw ApiError.notFound('Customer');

  const c = result.rows[0];

  // Recent consent history
  const history = await pool.query(
    `SELECT consent_type, consent_given, previous_value, consent_source,
            ip_address, recorded_by, notes, created_at
     FROM customer_consent_log
     WHERE customer_id = $1
     ORDER BY created_at DESC
     LIMIT 20`,
    [customerId]
  );

  res.json({
    success: true,
    data: {
      customerId: c.id,
      customerName: c.name,
      email: c.email,
      phone: c.phone,
      preferences: {
        emailTransactional: c.email_transactional,
        emailMarketing: c.email_marketing,
        smsTransactional: c.sms_transactional,
        smsMarketing: c.sms_marketing,
      },
      consentMeta: {
        preferencesUpdatedAt: c.preferences_updated_at,
        consentRecordedAt: c.consent_recorded_at,
        consentSource: c.consent_source,
      },
      consentHistory: history.rows.map(h => ({
        consentType: h.consent_type,
        consentGiven: h.consent_given,
        previousValue: h.previous_value,
        source: h.consent_source,
        ipAddress: h.ip_address,
        recordedBy: h.recorded_by,
        notes: h.notes,
        createdAt: h.created_at,
      })),
    },
  });
}));

/**
 * PUT /api/customers/:id/preferences
 * Update communication preferences with CASL consent logging.
 * Body: { emailTransactional?, emailMarketing?, smsTransactional?, smsMarketing?,
 *         consentSource?, notes? }
 */
customerRouter.put('/:id/preferences', asyncHandler(async (req, res) => {
  const customerId = parseInt(req.params.id);
  if (isNaN(customerId)) throw ApiError.badRequest('Invalid customer ID');

  const schema = Joi.object({
    emailTransactional: Joi.boolean().optional(),
    emailMarketing: Joi.boolean().optional(),
    smsTransactional: Joi.boolean().optional(),
    smsMarketing: Joi.boolean().optional(),
    consentSource: Joi.string().max(50).default('pos'),
    notes: Joi.string().max(500).optional().allow('', null),
  }).min(1);

  const { error, value } = schema.validate(req.body, { stripUnknown: true });
  if (error) throw ApiError.badRequest(error.details[0].message);

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // Get current values
    const current = await client.query(
      `SELECT email_transactional, email_marketing, sms_transactional, sms_marketing
       FROM customers WHERE id = $1 FOR UPDATE`,
      [customerId]
    );

    if (current.rows.length === 0) {
      await client.query('ROLLBACK');
      throw ApiError.notFound('Customer');
    }

    const prev = current.rows[0];
    const ipAddress = req.ip || req.headers['x-forwarded-for'] || null;
    const userAgent = req.headers['user-agent'] || null;

    // Map camelCase to DB column names
    const fieldMap = {
      emailTransactional: 'email_transactional',
      emailMarketing: 'email_marketing',
      smsTransactional: 'sms_transactional',
      smsMarketing: 'sms_marketing',
    };

    // Log each changed preference
    for (const [camelKey, dbCol] of Object.entries(fieldMap)) {
      if (value[camelKey] !== undefined && value[camelKey] !== prev[dbCol]) {
        await client.query(
          `INSERT INTO customer_consent_log
            (customer_id, consent_type, consent_given, previous_value, consent_source,
             ip_address, user_agent, recorded_by, notes)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
          [
            customerId, dbCol, value[camelKey], prev[dbCol],
            value.consentSource, ipAddress, userAgent,
            req.user.id, value.notes || null,
          ]
        );
      }
    }

    // Update customer
    await client.query(
      `UPDATE customers SET
        email_transactional = COALESCE($1, email_transactional),
        email_marketing = COALESCE($2, email_marketing),
        sms_transactional = COALESCE($3, sms_transactional),
        sms_marketing = COALESCE($4, sms_marketing),
        preferences_updated_at = NOW(),
        consent_recorded_at = NOW(),
        consent_ip_address = $5,
        consent_source = $6,
        updated_at = NOW()
       WHERE id = $7`,
      [
        value.emailTransactional ?? null,
        value.emailMarketing ?? null,
        value.smsTransactional ?? null,
        value.smsMarketing ?? null,
        ipAddress,
        value.consentSource,
        customerId,
      ]
    );

    await client.query('COMMIT');

    // Fetch updated
    const updated = await pool.query(
      `SELECT email_transactional, email_marketing, sms_transactional, sms_marketing,
              preferences_updated_at
       FROM customers WHERE id = $1`,
      [customerId]
    );

    const u = updated.rows[0];

    res.json({
      success: true,
      data: {
        customerId,
        preferences: {
          emailTransactional: u.email_transactional,
          emailMarketing: u.email_marketing,
          smsTransactional: u.sms_transactional,
          smsMarketing: u.sms_marketing,
        },
        updatedAt: u.preferences_updated_at,
      },
    });
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}));

// ============================================================================
// PUBLIC UNSUBSCRIBE ROUTER — mounted at /api/customers
// (no auth — used from unsubscribe links in emails)
// ============================================================================

const publicRouter = express.Router();

/**
 * POST /api/customers/:id/unsubscribe
 * Public endpoint for email unsubscribe links.
 * Body: { type: 'email_marketing' | 'sms_marketing' | 'all_marketing', token? }
 */
publicRouter.post('/:id/unsubscribe', asyncHandler(async (req, res) => {
  const customerId = parseInt(req.params.id);
  if (isNaN(customerId)) throw ApiError.badRequest('Invalid customer ID');

  const schema = Joi.object({
    type: Joi.string().valid('email_marketing', 'sms_marketing', 'all_marketing').required(),
  });

  const { error, value } = schema.validate(req.body, { stripUnknown: true });
  if (error) throw ApiError.badRequest(error.details[0].message);

  const ipAddress = req.ip || req.headers['x-forwarded-for'] || null;
  const userAgent = req.headers['user-agent'] || null;

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // Verify customer exists
    const current = await client.query(
      'SELECT email_marketing, sms_marketing FROM customers WHERE id = $1 FOR UPDATE',
      [customerId]
    );

    if (current.rows.length === 0) {
      await client.query('ROLLBACK');
      throw ApiError.notFound('Customer');
    }

    const prev = current.rows[0];
    const typesToUpdate = value.type === 'all_marketing'
      ? ['email_marketing', 'sms_marketing']
      : [value.type];

    for (const consentType of typesToUpdate) {
      if (prev[consentType] !== false) {
        await client.query(
          `INSERT INTO customer_consent_log
            (customer_id, consent_type, consent_given, previous_value, consent_source,
             ip_address, user_agent, notes)
           VALUES ($1, $2, false, $3, 'unsubscribe_link', $4, $5, 'Customer unsubscribed')`,
          [customerId, consentType, prev[consentType], ipAddress, userAgent]
        );
      }
    }

    const sets = typesToUpdate.map(t => `${t} = false`).join(', ');
    await client.query(
      `UPDATE customers SET ${sets},
        preferences_updated_at = NOW(), consent_recorded_at = NOW(),
        consent_ip_address = $1, consent_source = 'unsubscribe_link',
        updated_at = NOW()
       WHERE id = $2`,
      [ipAddress, customerId]
    );

    await client.query('COMMIT');

    res.json({
      success: true,
      message: 'You have been unsubscribed successfully.',
    });
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}));

// ============================================================================
// MARKETING ADMIN ROUTER — mounted at /api/marketing
// ============================================================================

const marketingRouter = express.Router();
marketingRouter.use(authenticate);

/**
 * GET /api/marketing/suppression-list
 * Admin-only. Returns customers who have opted out of marketing.
 * Query: ?type=email_marketing|sms_marketing|all (default: all)
 *        &format=json|csv (default: json)
 *        &page=1&limit=100
 */
marketingRouter.get('/suppression-list', requireRole('admin'), asyncHandler(async (req, res) => {
  const type = req.query.type || 'all';
  const page = parseInt(req.query.page) || 1;
  const limit = Math.min(parseInt(req.query.limit) || 100, 500);
  const offset = (page - 1) * limit;

  let whereClause;
  if (type === 'email_marketing') {
    whereClause = 'email_marketing = false';
  } else if (type === 'sms_marketing') {
    whereClause = 'sms_marketing = false';
  } else {
    whereClause = '(email_marketing = false OR sms_marketing = false)';
  }

  const countResult = await pool.query(
    `SELECT COUNT(*) FROM customers WHERE ${whereClause}`
  );

  const result = await pool.query(
    `SELECT id, name, email, phone,
            email_transactional, email_marketing, sms_transactional, sms_marketing,
            preferences_updated_at, consent_source
     FROM customers
     WHERE ${whereClause}
     ORDER BY preferences_updated_at DESC NULLS LAST, id
     LIMIT $1 OFFSET $2`,
    [limit, offset]
  );

  const totalCount = parseInt(countResult.rows[0].count);

  res.json({
    success: true,
    data: result.rows.map(c => ({
      id: c.id,
      name: c.name,
      email: c.email,
      phone: c.phone,
      emailMarketing: c.email_marketing,
      smsMarketing: c.sms_marketing,
      emailTransactional: c.email_transactional,
      smsTransactional: c.sms_transactional,
      optedOutAt: c.preferences_updated_at,
      consentSource: c.consent_source,
    })),
    pagination: {
      page,
      limit,
      totalCount,
      totalPages: Math.ceil(totalCount / limit),
    },
  });
}));

/**
 * GET /api/marketing/consent-audit
 * Admin-only. Full consent audit log.
 * Query: ?customer_id=&consent_type=&date_from=&date_to=&page=&limit=
 */
marketingRouter.get('/consent-audit', requireRole('admin'), asyncHandler(async (req, res) => {
  const page = parseInt(req.query.page) || 1;
  const limit = Math.min(parseInt(req.query.limit) || 50, 200);
  const offset = (page - 1) * limit;

  let where = 'WHERE 1=1';
  const params = [];
  let idx = 1;

  if (req.query.customer_id) {
    where += ` AND cl.customer_id = $${idx}`;
    params.push(parseInt(req.query.customer_id));
    idx++;
  }
  if (req.query.consent_type) {
    where += ` AND cl.consent_type = $${idx}`;
    params.push(req.query.consent_type);
    idx++;
  }
  if (req.query.date_from) {
    where += ` AND cl.created_at >= $${idx}`;
    params.push(req.query.date_from);
    idx++;
  }
  if (req.query.date_to) {
    where += ` AND cl.created_at <= $${idx}`;
    params.push(req.query.date_to);
    idx++;
  }

  const countResult = await pool.query(
    `SELECT COUNT(*) FROM customer_consent_log cl ${where}`,
    params
  );

  const result = await pool.query(
    `SELECT cl.*, c.name AS customer_name, c.email AS customer_email,
            u.name AS recorded_by_name
     FROM customer_consent_log cl
     JOIN customers c ON cl.customer_id = c.id
     LEFT JOIN users u ON cl.recorded_by = u.id
     ${where}
     ORDER BY cl.created_at DESC
     LIMIT $${idx} OFFSET $${idx + 1}`,
    [...params, limit, offset]
  );

  res.json({
    success: true,
    data: result.rows.map(r => ({
      id: r.id,
      customerId: r.customer_id,
      customerName: r.customer_name,
      customerEmail: r.customer_email,
      consentType: r.consent_type,
      consentGiven: r.consent_given,
      previousValue: r.previous_value,
      consentSource: r.consent_source,
      ipAddress: r.ip_address,
      userAgent: r.user_agent,
      recordedByName: r.recorded_by_name,
      notes: r.notes,
      createdAt: r.created_at,
    })),
    pagination: {
      page,
      limit,
      totalCount: parseInt(countResult.rows[0].count),
      totalPages: Math.ceil(parseInt(countResult.rows[0].count) / limit),
    },
  });
}));

// ============================================================================
// INIT
// ============================================================================

const init = (deps) => {
  pool = deps.pool;
  return { customerRouter, publicRouter, marketingRouter };
};

module.exports = { init };
