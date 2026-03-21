/**
 * TeleTime POS - MOTO (Mail Order / Telephone Order) Security Routes
 *
 * High-risk card-not-present transaction channel with:
 * - Employee authorization gate (moto_authorized flag)
 * - Full card + AVS/CVV validation via Zod
 * - Per-employee and store-wide amount limits
 * - Callback verification for orders > threshold
 * - Delivery address divergence detection
 * - Pickup-to-chip conversion workflow
 * - Full audit trail (event_type 'moto_entry')
 */

const express = require('express');
const router = express.Router();
const { ApiError, asyncHandler } = require('../middleware/errorHandler');
const { authenticate, requirePermission } = require('../middleware/auth');
const { validateBody, schemas, detectCardBrand } = require('../middleware/zodValidation');
const logger = require('../utils/logger');

// ============================================================================
// MODULE STATE — injected via init()
// ============================================================================
let pool = null;
let fraudService = null;
let fraudScoringService = null;
let monerisService = null;
let auditLogService = null;

// ============================================================================
// HELPERS
// ============================================================================

/** Load a MOTO setting by key */
async function getMotoSetting(key) {
  const { rows } = await pool.query(
    'SELECT setting_value FROM moto_settings WHERE setting_key = $1',
    [key]
  );
  return rows[0]?.setting_value || null;
}

/** Log a MOTO audit entry */
async function logMotoAudit(userId, action, entityId, details, req) {
  try {
    if (auditLogService) {
      await auditLogService.log({
        userId,
        action,
        entityType: 'moto_order',
        entityId,
        details,
        ipAddress: req?.ip || req?.headers?.['x-forwarded-for'] || null,
        userAgent: req?.headers?.['user-agent'] || null,
      });
    } else if (fraudService?.logAuditEntry) {
      await fraudService.logAuditEntry(userId, action, 'moto_order', entityId, details, req);
    }
  } catch (err) {
    logger.error({ err, action }, '[MOTO] Audit log failed');
  }
}

/** AVS response code interpretation */
const AVS_CODES = {
  Y: { match: true,  severity: 'success', message: 'Address verified' },
  A: { match: true,  severity: 'success', message: 'Address matches, ZIP does not' },
  Z: { match: true,  severity: 'warning', message: 'ZIP matches, address does not' },
  N: { match: false, severity: 'danger',  message: 'Address mismatch — HIGH RISK' },
  U: { match: null,  severity: 'warning', message: 'Unavailable (international card)' },
  G: { match: null,  severity: 'warning', message: 'Unavailable (international card)' },
  R: { match: null,  severity: 'warning', message: 'Retry — system unavailable' },
  S: { match: null,  severity: 'warning', message: 'Service not supported' },
  E: { match: null,  severity: 'warning', message: 'AVS error' },
};

/** CVV response code interpretation */
const CVV_CODES = {
  '1M': { match: true,  severity: 'success', message: 'CVV verified' },
  '1N': { match: false, severity: 'danger',  message: 'CVV mismatch — DECLINE RECOMMENDED' },
  '1P': { match: null,  severity: 'warning', message: 'CVV not processed' },
  '1S': { match: null,  severity: 'warning', message: 'CVV should be on card but not provided' },
  '1U': { match: null,  severity: 'warning', message: 'Issuer not certified for CVV' },
};

function interpretAVS(code) {
  return AVS_CODES[code?.toUpperCase()] || { match: null, severity: 'warning', message: `Unknown AVS code: ${code}` };
}

function interpretCVV(code) {
  return CVV_CODES[code] || { match: null, severity: 'warning', message: `Unknown CVV code: ${code}` };
}

// ============================================================================
// ACCESS GATE — Check if employee is MOTO authorized
// ============================================================================

/**
 * GET /api/moto/access-check
 * Checks if the current employee has moto_authorized flag.
 * Used by frontend to decide whether to show the MOTO entry form.
 */
router.get('/access-check', authenticate, requirePermission('moto.access'), asyncHandler(async (req, res) => {
  const userId = req.user.id;

  const { rows } = await pool.query(
    'SELECT moto_authorized, moto_limit FROM users WHERE id = $1',
    [userId]
  );

  const user = rows[0];
  if (!user) throw ApiError.notFound('User');

  const motoEnabled = await getMotoSetting('moto_enabled');

  if (motoEnabled !== 'true') {
    await logMotoAudit(userId, 'moto_access_denied', null, { reason: 'moto_disabled_globally' }, req);
    return res.json({
      success: true,
      data: {
        authorized: false,
        reason: 'MOTO transactions are currently disabled.',
      },
    });
  }

  if (!user.moto_authorized) {
    await logMotoAudit(userId, 'moto_access_denied', null, { reason: 'not_moto_authorized' }, req);
    return res.json({
      success: true,
      data: {
        authorized: false,
        reason: 'MOTO access requires authorization. Contact your manager.',
      },
    });
  }

  const storeLimitStr = await getMotoSetting('store_moto_limit');
  const callbackThresholdStr = await getMotoSetting('callback_threshold');

  res.json({
    success: true,
    data: {
      authorized: true,
      employeeLimit: parseFloat(user.moto_limit) || 2000,
      storeLimit: parseFloat(storeLimitStr) || 5000,
      callbackThreshold: parseFloat(callbackThresholdStr) || 500,
    },
  });
}));

// ============================================================================
// MOTO SETTINGS — Admin management
// ============================================================================

/**
 * GET /api/moto/settings
 * Returns all MOTO security settings.
 */
router.get('/settings', authenticate, requirePermission('moto.settings'), asyncHandler(async (req, res) => {
  const { rows } = await pool.query('SELECT setting_key, setting_value, description, updated_at FROM moto_settings ORDER BY id');
  const settings = {};
  rows.forEach(r => { settings[r.setting_key] = { value: r.setting_value, description: r.description, updated_at: r.updated_at }; });
  res.json({ success: true, data: settings });
}));

/**
 * PUT /api/moto/settings
 * Update one or more MOTO settings.
 */
router.put('/settings', authenticate, requirePermission('moto.settings'), asyncHandler(async (req, res) => {
  const updates = req.body; // { setting_key: value, ... }

  for (const [key, value] of Object.entries(updates)) {
    await pool.query(
      'UPDATE moto_settings SET setting_value = $1, updated_by = $2, updated_at = NOW() WHERE setting_key = $3',
      [String(value), req.user.id, key]
    );
  }

  await logMotoAudit(req.user.id, 'moto_settings_update', null, { updates }, req);

  const { rows } = await pool.query('SELECT setting_key, setting_value FROM moto_settings ORDER BY id');
  const settings = {};
  rows.forEach(r => { settings[r.setting_key] = r.setting_value; });
  res.json({ success: true, data: settings });
}));

// ============================================================================
// EMPLOYEE MOTO AUTHORIZATION — Admin controls
// ============================================================================

/**
 * PUT /api/moto/authorize/:userId
 * Grant or revoke MOTO authorization for an employee.
 */
router.put('/authorize/:userId', authenticate, requirePermission('moto.settings'), asyncHandler(async (req, res) => {
  const targetUserId = parseInt(req.params.userId);
  const { authorized, motoLimit } = req.body;

  const updates = [];
  const params = [];
  let idx = 1;

  if (typeof authorized === 'boolean') {
    updates.push(`moto_authorized = $${idx++}`);
    params.push(authorized);
  }
  if (motoLimit !== undefined) {
    const limit = parseFloat(motoLimit);
    if (isNaN(limit) || limit < 0) throw ApiError.badRequest('motoLimit must be a positive number');
    updates.push(`moto_limit = $${idx++}`);
    params.push(limit);
  }

  if (updates.length === 0) throw ApiError.badRequest('No updates provided');

  params.push(targetUserId);
  const { rows } = await pool.query(
    `UPDATE users SET ${updates.join(', ')}, updated_at = NOW() WHERE id = $${idx} RETURNING id, moto_authorized, moto_limit`,
    params
  );

  if (!rows[0]) throw ApiError.notFound('User');

  await logMotoAudit(req.user.id, 'moto_authorization_change', targetUserId, {
    target_user_id: targetUserId,
    authorized: rows[0].moto_authorized,
    moto_limit: rows[0].moto_limit,
  }, req);

  res.json({ success: true, data: rows[0] });
}));

/**
 * GET /api/moto/authorized-employees
 * List all employees with their MOTO authorization status.
 */
router.get('/authorized-employees', authenticate, requirePermission('moto.settings'), asyncHandler(async (req, res) => {
  const { rows } = await pool.query(`
    SELECT id, first_name, last_name, email, role, moto_authorized, moto_limit
    FROM users
    WHERE is_active = true
    ORDER BY moto_authorized DESC, last_name ASC
  `);
  res.json({ success: true, data: rows });
}));

// ============================================================================
// PROCESS MOTO TRANSACTION
// ============================================================================

/**
 * POST /api/moto/process
 * Process a MOTO transaction with full validation, fraud scoring, and AVS/CVV.
 *
 * Flow:
 * 1. Verify employee moto_authorized
 * 2. Validate all fields via motoTransactionSchema
 * 3. Check per-employee and store-wide amount limits
 * 4. Detect address divergence
 * 5. If amount > callback threshold, set status to pending_verification
 * 6. Submit to Moneris with AVS/CVV data
 * 7. Record fraud score with MOTO signals
 * 8. Create moto_orders record
 * 9. Audit log everything
 */
router.post('/process', authenticate, requirePermission('moto.process'),
  validateBody(schemas.motoTransaction),
  asyncHandler(async (req, res) => {
    const userId = req.user.id;
    const data = req.body;

    // 1. Verify MOTO authorization
    const { rows: userRows } = await pool.query(
      'SELECT moto_authorized, moto_limit FROM users WHERE id = $1',
      [userId]
    );
    if (!userRows[0]?.moto_authorized) {
      await logMotoAudit(userId, 'moto_unauthorized_attempt', null, {
        amount: data.totalAmount || data.total_amount,
      }, req);
      throw ApiError.forbidden('You are not authorized to process MOTO transactions');
    }

    const employeeLimit = parseFloat(userRows[0].moto_limit) || 2000;
    const storeLimitStr = await getMotoSetting('store_moto_limit');
    const storeLimit = parseFloat(storeLimitStr) || 5000;
    const callbackThresholdStr = await getMotoSetting('callback_threshold');
    const callbackThreshold = parseFloat(callbackThresholdStr) || 500;
    const callbackRequired = (await getMotoSetting('callback_required')) === 'true';
    const addressDivergenceScoreStr = await getMotoSetting('address_divergence_score');
    const addressDivergenceScore = parseInt(addressDivergenceScoreStr) || 5;

    const amount = parseFloat(data.totalAmount || data.total_amount || 0);
    const cardBrand = detectCardBrand(data.cardNumber);

    // 2. Check per-employee limit
    let requiresManagerApproval = false;
    let requiresOwnerApproval = false;

    if (amount > storeLimit) {
      // Store-wide limit exceeded — always requires owner/admin approval
      requiresOwnerApproval = true;
      if (!data.fraudOverride?.managerId) {
        throw ApiError.forbidden(
          `MOTO transactions over $${storeLimit.toFixed(2)} require owner/admin approval`,
          { code: 'MOTO_STORE_LIMIT', storeLimit, amount }
        );
      }
    } else if (amount > employeeLimit) {
      // Per-employee limit exceeded — requires manager approval
      requiresManagerApproval = true;
      if (!data.fraudOverride?.managerId) {
        throw ApiError.forbidden(
          `MOTO transactions over your limit of $${employeeLimit.toFixed(2)} require manager approval`,
          { code: 'MOTO_EMPLOYEE_LIMIT', employeeLimit, amount }
        );
      }
    }

    // 3. Address divergence check
    let addressDivergent = false;
    let addressDivergenceDetail = null;
    let extraFraudPoints = 0;

    if (data.deliveryAddress && data.billingAddress) {
      const billingCity = data.billingAddress.city.toLowerCase().trim();
      const deliveryCity = data.deliveryAddress.city.toLowerCase().trim();
      const billingPostal = data.billingAddress.postalCode.replace(/\s/g, '').toUpperCase();
      const deliveryPostal = data.deliveryAddress.postalCode.replace(/\s/g, '').toUpperCase();

      if (billingCity !== deliveryCity || billingPostal !== deliveryPostal) {
        addressDivergent = true;
        if (billingCity !== deliveryCity) {
          extraFraudPoints = addressDivergenceScore;
          addressDivergenceDetail = `Billing city "${data.billingAddress.city}" differs from delivery city "${data.deliveryAddress.city}"`;
        } else {
          addressDivergenceDetail = 'Delivery postal code differs from billing postal code';
        }
      }
    }

    // 4. Determine callback requirement
    const needsCallback = callbackRequired && amount > callbackThreshold;

    // If callback required but not yet done, set to pending_verification
    if (needsCallback && !data.callbackVerified) {
      // Look up CRM phone for existing customer
      let crmPhone = null;
      if (data.customerId) {
        const { rows: custRows } = await pool.query(
          'SELECT phone FROM customers WHERE id = $1',
          [data.customerId]
        );
        crmPhone = custRows[0]?.phone || null;
      }

      // Create moto_orders record in pending_verification status
      const { rows: motoRows } = await pool.query(`
        INSERT INTO moto_orders (
          employee_id, cardholder_name, card_bin, card_last_four, card_brand,
          expiry_month, expiry_year,
          billing_street, billing_city, billing_province, billing_postal_code,
          delivery_street, delivery_city, delivery_province, delivery_postal_code,
          delivery_method, callback_phone, callback_required, callback_crm_phone,
          address_divergent, address_divergence_detail,
          amount, currency, required_manager_approval, status
        ) VALUES (
          $1, $2, $3, $4, $5, $6, $7,
          $8, $9, $10, $11,
          $12, $13, $14, $15,
          $16, $17, true, $18,
          $19, $20,
          $21, $22, $23, 'pending_verification'
        ) RETURNING id
      `, [
        userId,
        data.cardholderName,
        data.cardNumber.substring(0, 6),
        data.cardNumber.slice(-4),
        cardBrand,
        parseInt(data.expiryDate.split('/')[0]),
        2000 + parseInt(data.expiryDate.split('/')[1]),
        `${data.billingAddress.streetNumber} ${data.billingAddress.streetName}`,
        data.billingAddress.city,
        data.billingAddress.province,
        data.billingAddress.postalCode,
        data.deliveryAddress ? `${data.deliveryAddress.streetNumber} ${data.deliveryAddress.streetName}` : null,
        data.deliveryAddress?.city || null,
        data.deliveryAddress?.province || null,
        data.deliveryAddress?.postalCode || null,
        data.deliveryMethod || null,
        data.callbackPhone,
        crmPhone,
        addressDivergent,
        addressDivergenceDetail,
        amount,
        data.currency || 'CAD',
        requiresManagerApproval || requiresOwnerApproval,
      ]);

      const motoOrderId = motoRows[0].id;

      await logMotoAudit(userId, 'moto_entry', motoOrderId, {
        event_type: 'moto_entry',
        employee_id: userId,
        amount,
        card_brand: cardBrand,
        card_last_four: data.cardNumber.slice(-4),
        callback_required: true,
        callback_completed: false,
        address_divergent: addressDivergent,
        status: 'pending_verification',
        crm_phone_available: !!crmPhone,
      }, req);

      return res.json({
        success: true,
        data: {
          motoOrderId,
          status: 'pending_verification',
          callbackRequired: true,
          callbackPhone: crmPhone || data.callbackPhone,
          crmPhoneAvailable: !!crmPhone,
          crmPhone,
          providedPhone: data.callbackPhone,
          addressDivergent,
          addressDivergenceDetail,
          message: crmPhone
            ? `Call customer at CRM number ${crmPhone} to verify this order before processing.`
            : `Call customer at ${data.callbackPhone} to verify. WARNING: No CRM phone on file — verify identity carefully.`,
        },
      });
    }

    // 5. Process payment via Moneris (with AVS + CVV)
    let avsResult = null;
    let cvvResult = null;
    let authorizationCode = null;
    let monerisOrderId = null;
    let monerisReceiptId = null;
    let paymentDeclined = false;

    if (monerisService && monerisService.isConfigured()) {
      try {
        const monerisResult = await monerisService.processTransaction({
          type: 'purchase',
          order_id: `MOTO-${Date.now()}-${userId}`,
          amount: amount.toFixed(2),
          pan: data.cardNumber,
          expdate: data.expiryDate.replace('/', ''), // MMYY for Moneris
          crypt_type: '1', // 1 = Mail Order/Telephone Order
          cvd_indicator: '1',
          cvd_value: data.cvv,
          avs_street_number: data.billingAddress.streetNumber,
          avs_street_name: data.billingAddress.streetName,
          avs_zipcode: data.billingAddress.postalCode.replace(/\s/g, ''),
        });

        avsResult = monerisResult.avs_result || monerisResult.AvsResultCode || null;
        cvvResult = monerisResult.cvv_result || monerisResult.CvdResultCode || null;
        authorizationCode = monerisResult.auth_code || monerisResult.AuthCode || null;
        monerisOrderId = monerisResult.order_id || monerisResult.ReferenceNum || null;
        monerisReceiptId = monerisResult.receipt_id || monerisResult.ReceiptId || null;

        if (monerisResult.response_code && parseInt(monerisResult.response_code) >= 50) {
          paymentDeclined = true;
        }
      } catch (monerisErr) {
        logger.error({ err: monerisErr }, '[MOTO] Moneris processing failed');
        // In dev/test without Moneris configured, continue with simulated results
        if (!monerisService.isConfigured()) {
          avsResult = 'Y';
          cvvResult = '1M';
          authorizationCode = 'SIM' + Math.random().toString(36).substring(2, 8).toUpperCase();
          monerisOrderId = `SIM-${Date.now()}`;
        } else {
          throw ApiError.badRequest('Payment processing failed: ' + monerisErr.message);
        }
      }
    } else {
      // Simulated results for development
      avsResult = 'Y';
      cvvResult = '1M';
      authorizationCode = 'DEV' + Math.random().toString(36).substring(2, 8).toUpperCase();
      monerisOrderId = `DEV-${Date.now()}`;
    }

    const avsInterpretation = interpretAVS(avsResult);
    const cvvInterpretation = interpretCVV(cvvResult);

    // 6. Create moto_orders record
    const status = paymentDeclined ? 'declined' : 'authorized';

    const { rows: motoRows } = await pool.query(`
      INSERT INTO moto_orders (
        employee_id, cardholder_name, card_bin, card_last_four, card_brand,
        expiry_month, expiry_year,
        billing_street, billing_city, billing_province, billing_postal_code,
        delivery_street, delivery_city, delivery_province, delivery_postal_code,
        delivery_method, callback_phone, callback_required, callback_completed,
        callback_completed_by, callback_completed_at,
        avs_result, cvv_result, avs_message, cvv_message,
        address_divergent, address_divergence_detail,
        amount, currency, required_manager_approval,
        manager_approved_by, manager_approved_at,
        status, moneris_order_id, moneris_receipt_id, authorization_code
      ) VALUES (
        $1, $2, $3, $4, $5, $6, $7,
        $8, $9, $10, $11,
        $12, $13, $14, $15,
        $16, $17, $18, $19,
        $20, $21,
        $22, $23, $24, $25,
        $26, $27,
        $28, $29, $30,
        $31, $32,
        $33, $34, $35, $36
      ) RETURNING id
    `, [
      userId,
      data.cardholderName,
      data.cardNumber.substring(0, 6),
      data.cardNumber.slice(-4),
      cardBrand,
      parseInt(data.expiryDate.split('/')[0]),
      2000 + parseInt(data.expiryDate.split('/')[1]),
      `${data.billingAddress.streetNumber} ${data.billingAddress.streetName}`,
      data.billingAddress.city,
      data.billingAddress.province,
      data.billingAddress.postalCode,
      data.deliveryAddress ? `${data.deliveryAddress.streetNumber} ${data.deliveryAddress.streetName}` : null,
      data.deliveryAddress?.city || null,
      data.deliveryAddress?.province || null,
      data.deliveryAddress?.postalCode || null,
      data.deliveryMethod || null,
      data.callbackPhone,
      needsCallback,
      data.callbackVerified ? true : !needsCallback,
      data.callbackVerifiedBy || (data.callbackVerified ? userId : null),
      data.callbackVerified ? new Date() : (!needsCallback ? new Date() : null),
      avsResult,
      cvvResult,
      avsInterpretation.message,
      cvvInterpretation.message,
      addressDivergent,
      addressDivergenceDetail,
      amount,
      data.currency || 'CAD',
      requiresManagerApproval || requiresOwnerApproval,
      data.fraudOverride?.managerId || null,
      data.fraudOverride?.managerId ? new Date() : null,
      status,
      monerisOrderId,
      monerisReceiptId,
      authorizationCode,
    ]);

    const motoOrderId = motoRows[0].id;

    // 7. Record in fraud_scores with MOTO-specific signals
    try {
      const signals = {
        entry_method_risk: { risk_points: 10, detail: 'MOTO (card-not-present)' },
        address_divergence: addressDivergent
          ? { risk_points: extraFraudPoints, detail: addressDivergenceDetail }
          : { risk_points: 0, detail: 'Addresses match' },
        avs_verification: { result: avsResult, match: avsInterpretation.match, message: avsInterpretation.message },
        cvv_verification: { result: cvvResult, match: cvvInterpretation.match, message: cvvInterpretation.message },
      };

      // Add AVS/CVV mismatch risk
      if (avsInterpretation.match === false) signals.avs_mismatch = { risk_points: 15, detail: 'AVS mismatch' };
      if (cvvInterpretation.match === false) signals.cvv_mismatch = { risk_points: 20, detail: 'CVV mismatch' };

      const totalSignalPoints = Object.values(signals).reduce((sum, s) => sum + (s.risk_points || 0), 0);
      const riskScore = Math.min(100, totalSignalPoints);
      const riskLevel = riskScore >= 80 ? 'critical' : riskScore >= 60 ? 'high' : riskScore >= 30 ? 'medium' : 'low';

      await pool.query(`
        INSERT INTO fraud_scores (
          score, risk_level, signals, action_taken,
          card_bin, card_last_four, card_brand, entry_method,
          employee_id, customer_id, amount, currency,
          avs_result, cvv_result, created_at
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, 'moto', $8, $9, $10, $11, $12, $13, NOW())
      `, [
        riskScore, riskLevel, JSON.stringify(signals),
        paymentDeclined ? 'declined' : (riskScore >= 60 ? 'flagged' : 'approved'),
        data.cardNumber.substring(0, 6), data.cardNumber.slice(-4), cardBrand,
        userId, data.customerId || null, amount, data.currency || 'CAD',
        avsResult, cvvResult,
      ]);
    } catch (err) {
      logger.error({ err }, '[MOTO] Fraud score recording failed');
    }

    // 8. Full audit log
    await logMotoAudit(userId, 'moto_entry', motoOrderId, {
      event_type: 'moto_entry',
      employee_id: userId,
      amount,
      card_brand: cardBrand,
      card_last_four: data.cardNumber.slice(-4),
      avs_result: avsResult,
      cvv_result: cvvResult,
      avs_match: avsInterpretation.match,
      cvv_match: cvvInterpretation.match,
      callback_completed: data.callbackVerified || !needsCallback,
      address_divergent: addressDivergent,
      address_divergence_detail: addressDivergenceDetail,
      requires_manager_approval: requiresManagerApproval || requiresOwnerApproval,
      manager_approved: !!data.fraudOverride?.managerId,
      status,
      authorization_code: authorizationCode,
    }, req);

    // 9. Return response
    res.json({
      success: true,
      data: {
        motoOrderId,
        status,
        authorizationCode: paymentDeclined ? null : authorizationCode,
        avs: { code: avsResult, ...avsInterpretation },
        cvv: { code: cvvResult, ...cvvInterpretation },
        addressDivergent,
        addressDivergenceDetail,
        amount,
        cardBrand,
        cardLastFour: data.cardNumber.slice(-4),
        paymentDeclined,
      },
    });
  })
);

// ============================================================================
// CALLBACK VERIFICATION
// ============================================================================

/**
 * PUT /api/moto/callback-verify/:id
 * Complete callback verification for a pending MOTO order.
 */
router.put('/callback-verify/:id', authenticate, requirePermission('moto.callback_verify'), asyncHandler(async (req, res) => {
  const motoOrderId = parseInt(req.params.id);
  const { verified, notes } = req.body;

  if (typeof verified !== 'boolean') {
    throw ApiError.badRequest('verified must be a boolean');
  }

  // Get the MOTO order
  const { rows: orderRows } = await pool.query(
    'SELECT * FROM moto_orders WHERE id = $1',
    [motoOrderId]
  );
  if (!orderRows[0]) throw ApiError.notFound('MOTO order');

  const order = orderRows[0];
  if (order.status !== 'pending_verification') {
    throw ApiError.badRequest(`Order is in ${order.status} status, cannot verify`);
  }

  if (!verified) {
    // Callback failed — cancel the order
    await pool.query(
      `UPDATE moto_orders
       SET status = 'cancelled', callback_completed = false,
           callback_notes = $1, updated_at = NOW()
       WHERE id = $2`,
      [notes || 'Callback verification failed', motoOrderId]
    );

    await logMotoAudit(req.user.id, 'moto_callback_failed', motoOrderId, {
      verified: false,
      notes,
    }, req);

    return res.json({
      success: true,
      data: { motoOrderId, status: 'cancelled', message: 'Order cancelled — callback verification failed' },
    });
  }

  // Callback succeeded — mark verified, ready for authorization
  await pool.query(
    `UPDATE moto_orders
     SET status = 'verified',
         callback_completed = true,
         callback_completed_by = $1,
         callback_completed_at = NOW(),
         callback_notes = $2,
         updated_at = NOW()
     WHERE id = $3`,
    [req.user.id, notes || 'Callback verified', motoOrderId]
  );

  await logMotoAudit(req.user.id, 'moto_callback_verified', motoOrderId, {
    verified: true,
    notes,
    employee_id: req.user.id,
  }, req);

  res.json({
    success: true,
    data: {
      motoOrderId,
      status: 'verified',
      message: 'Callback verified. Order is ready for authorization.',
    },
  });
}));

// ============================================================================
// PICKUP CONVERSION — Void MOTO, re-process as chip
// ============================================================================

/**
 * POST /api/moto/pickup-convert/:id
 * Void the MOTO authorization and return data needed to start a chip transaction.
 */
router.post('/pickup-convert/:id', authenticate, requirePermission('moto.pickup_convert'), asyncHandler(async (req, res) => {
  const motoOrderId = parseInt(req.params.id);
  const { convertToChip, idVerified, idType, authorizationSigned } = req.body;

  const { rows: orderRows } = await pool.query(
    'SELECT * FROM moto_orders WHERE id = $1',
    [motoOrderId]
  );
  if (!orderRows[0]) throw ApiError.notFound('MOTO order');

  const order = orderRows[0];
  if (!['authorized', 'completed'].includes(order.status)) {
    throw ApiError.badRequest(`Cannot convert order in ${order.status} status`);
  }

  if (convertToChip) {
    // Void the MOTO authorization via Moneris
    if (monerisService && monerisService.isConfigured() && order.moneris_order_id) {
      try {
        await monerisService.processTransaction({
          type: 'purchasecorrection',
          order_id: order.moneris_order_id,
          txn_number: order.moneris_receipt_id,
        });
      } catch (err) {
        logger.error({ err }, '[MOTO] Void for chip conversion failed');
        throw ApiError.badRequest('Failed to void MOTO authorization for chip conversion');
      }
    }

    await pool.query(
      `UPDATE moto_orders
       SET status = 'voided', pickup_converted_to_chip = true, updated_at = NOW()
       WHERE id = $1`,
      [motoOrderId]
    );

    await logMotoAudit(req.user.id, 'moto_pickup_chip_convert', motoOrderId, {
      original_amount: parseFloat(order.amount),
      authorization_voided: true,
      cardholder_name: order.cardholder_name,
    }, req);

    return res.json({
      success: true,
      data: {
        motoOrderId,
        status: 'voided',
        convertedToChip: true,
        message: 'MOTO authorization voided. Process a new chip transaction for this order.',
        orderDetails: {
          amount: parseFloat(order.amount),
          cardholderName: order.cardholder_name,
          cardLastFour: order.card_last_four,
        },
      },
    });
  }

  // Customer cannot present card — require ID + signed authorization
  if (!idVerified || !authorizationSigned) {
    throw ApiError.badRequest(
      'Customer cannot present card. Photo ID verification and signed pickup authorization form are required.'
    );
  }

  await pool.query(
    `UPDATE moto_orders
     SET pickup_id_verified = true,
         pickup_id_type = $1,
         pickup_authorization_signed = true,
         updated_at = NOW()
     WHERE id = $2`,
    [idType || 'government_id', motoOrderId]
  );

  await logMotoAudit(req.user.id, 'moto_pickup_id_verified', motoOrderId, {
    id_type: idType,
    authorization_signed: true,
    card_not_presented: true,
  }, req);

  res.json({
    success: true,
    data: {
      motoOrderId,
      idVerified: true,
      authorizationSigned: true,
      message: 'Pickup authorized with photo ID and signed form.',
    },
  });
}));

// ============================================================================
// LIST MOTO ORDERS
// ============================================================================

/**
 * GET /api/moto/orders
 * Paginated list of MOTO orders with filters.
 */
router.get('/orders', authenticate, requirePermission('moto.access'), asyncHandler(async (req, res) => {
  const { status, employee_id, date_from, date_to, page = 1, limit = 25 } = req.query;
  const conditions = [];
  const params = [];
  let idx = 1;

  if (status) { conditions.push(`mo.status = $${idx++}`); params.push(status); }
  if (employee_id) { conditions.push(`mo.employee_id = $${idx++}`); params.push(parseInt(employee_id)); }
  if (date_from) { conditions.push(`mo.created_at >= $${idx++}`); params.push(date_from); }
  if (date_to) { conditions.push(`mo.created_at <= $${idx++}`); params.push(date_to); }

  const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
  const offset = (parseInt(page) - 1) * parseInt(limit);

  const countResult = await pool.query(`SELECT COUNT(*) FROM moto_orders mo ${whereClause}`, params);
  const total = parseInt(countResult.rows[0].count);

  const dataParams = [...params, parseInt(limit), offset];
  const { rows } = await pool.query(`
    SELECT mo.*,
           u.first_name || ' ' || u.last_name AS employee_name
    FROM moto_orders mo
    LEFT JOIN users u ON u.id = mo.employee_id
    ${whereClause}
    ORDER BY mo.created_at DESC
    LIMIT $${idx++} OFFSET $${idx++}
  `, dataParams);

  res.json({ success: true, data: { rows, total, page: parseInt(page), limit: parseInt(limit) } });
}));

/**
 * GET /api/moto/orders/:id
 * Single MOTO order detail.
 */
router.get('/orders/:id', authenticate, requirePermission('moto.access'), asyncHandler(async (req, res) => {
  const { rows } = await pool.query(`
    SELECT mo.*,
           u.first_name || ' ' || u.last_name AS employee_name,
           cb.first_name || ' ' || cb.last_name AS callback_completed_by_name,
           ma.first_name || ' ' || ma.last_name AS manager_approved_by_name
    FROM moto_orders mo
    LEFT JOIN users u ON u.id = mo.employee_id
    LEFT JOIN users cb ON cb.id = mo.callback_completed_by
    LEFT JOIN users ma ON ma.id = mo.manager_approved_by
    WHERE mo.id = $1
  `, [parseInt(req.params.id)]);

  if (!rows[0]) throw ApiError.notFound('MOTO order');
  res.json({ success: true, data: rows[0] });
}));

/**
 * GET /api/moto/pending-callbacks
 * List MOTO orders pending callback verification.
 */
router.get('/pending-callbacks', authenticate, requirePermission('moto.callback_verify'), asyncHandler(async (req, res) => {
  const { rows } = await pool.query(`
    SELECT mo.*,
           u.first_name || ' ' || u.last_name AS employee_name
    FROM moto_orders mo
    LEFT JOIN users u ON u.id = mo.employee_id
    WHERE mo.status = 'pending_verification'
      AND mo.callback_required = true
      AND mo.callback_completed = false
    ORDER BY mo.created_at ASC
  `);
  res.json({ success: true, data: rows });
}));

/**
 * GET /api/moto/pickup-pending
 * List MOTO orders ready for in-store pickup that should be converted to chip.
 */
router.get('/pickup-pending', authenticate, requirePermission('moto.pickup_convert'), asyncHandler(async (req, res) => {
  const { rows } = await pool.query(`
    SELECT mo.*,
           u.first_name || ' ' || u.last_name AS employee_name
    FROM moto_orders mo
    LEFT JOIN users u ON u.id = mo.employee_id
    WHERE mo.delivery_method = 'pickup'
      AND mo.status IN ('authorized', 'completed')
      AND mo.pickup_converted_to_chip = false
    ORDER BY mo.created_at ASC
  `);
  res.json({ success: true, data: rows });
}));

// ============================================================================
// AVS/CVV REFERENCE — For frontend display
// ============================================================================

/**
 * GET /api/moto/avs-cvv-codes
 * Returns the AVS and CVV code reference tables for frontend display.
 */
router.get('/avs-cvv-codes', authenticate, asyncHandler(async (req, res) => {
  res.json({
    success: true,
    data: { avs: AVS_CODES, cvv: CVV_CODES },
  });
}));

// ============================================================================
// INIT
// ============================================================================

const init = (deps) => {
  pool = deps.pool;
  fraudService = deps.fraudService || null;
  fraudScoringService = deps.fraudScoringService || null;
  monerisService = deps.monerisService || null;
  auditLogService = deps.auditLogService || null;
  return router;
};

module.exports = { init };
