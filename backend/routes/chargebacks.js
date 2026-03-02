/**
 * TeleTime POS - Chargeback Management Routes
 * Handles chargeback cases, evidence upload, status pipeline,
 * timeline, comments, analytics, and deadline notifications.
 */

const express = require('express');
const router = express.Router();
const path = require('path');
const fs = require('fs');
const { ApiError, asyncHandler } = require('../middleware/errorHandler');
const { authenticate, requirePermission } = require('../middleware/auth');
const logger = require('../utils/logger');

// ============================================================================
// MODULE STATE
// ============================================================================
let fraudService = null;
let pool = null;
let upload = null;
let wsService = null;
let chargebackEvidenceService = null;

const UPLOAD_DIR = path.join(__dirname, '..', 'public', 'uploads', 'chargebacks');

// ============================================================================
// ANALYTICS — must be before /:id routes
// ============================================================================

router.get('/analytics', authenticate, requirePermission('fraud.chargebacks.manage'), asyncHandler(async (req, res) => {
  const { period } = req.query; // month, quarter, year

  // Current period boundaries
  const now = new Date();
  let monthStart = new Date(now.getFullYear(), now.getMonth(), 1).toISOString();
  let quarterMonth = Math.floor(now.getMonth() / 3) * 3;
  let quarterStart = new Date(now.getFullYear(), quarterMonth, 1).toISOString();
  let yearStart = new Date(now.getFullYear(), 0, 1).toISOString();
  let nowIso = now.toISOString();

  const [monthResult, quarterResult, yearResult, rateResult, responseTimeResult, amountResult] = await Promise.all([
    // This month
    pool.query(`
      SELECT COUNT(*)::int AS total,
        COUNT(*) FILTER (WHERE status = 'won')::int AS won,
        COUNT(*) FILTER (WHERE status = 'lost')::int AS lost,
        COUNT(*) FILTER (WHERE status IN ('received','under_review','evidence_submitted'))::int AS pending
      FROM chargeback_cases WHERE created_at >= $1 AND created_at <= $2
    `, [monthStart, nowIso]),

    // This quarter
    pool.query(`
      SELECT COUNT(*)::int AS total,
        COUNT(*) FILTER (WHERE status = 'won')::int AS won,
        COUNT(*) FILTER (WHERE status = 'lost')::int AS lost
      FROM chargeback_cases WHERE created_at >= $1 AND created_at <= $2
    `, [quarterStart, nowIso]),

    // This year
    pool.query(`
      SELECT COUNT(*)::int AS total,
        COUNT(*) FILTER (WHERE status = 'won')::int AS won,
        COUNT(*) FILTER (WHERE status = 'lost')::int AS lost
      FROM chargeback_cases WHERE created_at >= $1 AND created_at <= $2
    `, [yearStart, nowIso]),

    // Chargeback rate (chargebacks / total transactions this month)
    pool.query(`
      SELECT
        (SELECT COUNT(*) FROM chargeback_cases WHERE created_at >= $1)::int AS cb_count,
        (SELECT COUNT(*) FROM transactions WHERE created_at >= $1)::int AS txn_count
    `, [monthStart]),

    // Average response time (received_at → evidence_submitted_at)
    pool.query(`
      SELECT
        ROUND(AVG(EXTRACT(EPOCH FROM (evidence_submitted_at - COALESCE(received_at, created_at))) / 86400), 1) AS avg_days
      FROM chargeback_cases
      WHERE evidence_submitted_at IS NOT NULL
        AND created_at >= $1
    `, [yearStart]),

    // Dollar amounts
    pool.query(`
      SELECT
        COALESCE(SUM(amount), 0)::numeric AS total_dispute,
        COALESCE(SUM(amount) FILTER (WHERE status = 'won'), 0)::numeric AS won_back,
        COALESCE(SUM(amount) FILTER (WHERE status = 'lost'), 0)::numeric AS lost_amount,
        COALESCE(SUM(amount) FILTER (WHERE status IN ('received','under_review','evidence_submitted')), 0)::numeric AS pending_amount
      FROM chargeback_cases
      WHERE created_at >= $1
    `, [yearStart]),
  ]);

  const rate = rateResult.rows[0];
  const cbRate = rate.txn_count > 0
    ? Math.round((rate.cb_count / rate.txn_count) * 10000) / 100
    : 0;

  const monthData = monthResult.rows[0];
  const quarterData = quarterResult.rows[0];
  const yearData = yearResult.rows[0];
  const winDenom = (yearData.won + yearData.lost) || 1;

  res.json({
    success: true,
    data: {
      this_month: monthData,
      this_quarter: quarterData,
      this_year: yearData,
      chargeback_rate: cbRate,
      win_rate: Math.round((yearData.won / winDenom) * 1000) / 10,
      avg_response_days: parseFloat(responseTimeResult.rows[0]?.avg_days) || null,
      amounts: {
        total_dispute: parseFloat(amountResult.rows[0].total_dispute),
        won_back: parseFloat(amountResult.rows[0].won_back),
        lost_amount: parseFloat(amountResult.rows[0].lost_amount),
        pending_amount: parseFloat(amountResult.rows[0].pending_amount),
      },
    },
  });
}));

// ============================================================================
// SEARCH TRANSACTIONS (for new chargeback creation)
// ============================================================================

router.get('/search-transactions', authenticate, requirePermission('fraud.chargebacks.manage'), asyncHandler(async (req, res) => {
  const { transaction_id, date, amount, last_four } = req.query;

  let query = `
    SELECT t.transaction_id, t.transaction_number, t.total_amount, t.status,
           t.created_at, t.customer_id,
           c.name AS customer_name,
           p.payment_id, p.payment_method, p.card_last_four, p.card_brand,
           p.authorization_code, p.amount AS payment_amount
    FROM transactions t
    LEFT JOIN customers c ON t.customer_id = c.id
    LEFT JOIN payments p ON p.transaction_id = t.transaction_id
    WHERE 1=1
  `;
  const params = [];

  if (transaction_id) {
    params.push(parseInt(transaction_id));
    query += ` AND t.transaction_id = $${params.length}`;
  }
  if (date && amount) {
    params.push(date, parseFloat(amount));
    query += ` AND DATE(t.created_at) = $${params.length - 1} AND t.total_amount = $${params.length}`;
  }
  if (last_four) {
    params.push(last_four);
    query += ` AND p.card_last_four = $${params.length}`;
  }

  query += ` ORDER BY t.created_at DESC LIMIT 20`;

  const { rows } = await pool.query(query, params);
  res.json({ success: true, data: rows });
}));

// ============================================================================
// LIST CHARGEBACKS — enhanced with filters
// ============================================================================

router.get('/', authenticate, requirePermission('fraud.chargebacks.manage'), asyncHandler(async (req, res) => {
  const { status, card_brand, date_from, date_to, amount_min, amount_max, assigned_to, page = 1, limit = 50 } = req.query;

  let query = `
    SELECT cc.*, t.transaction_number, t.total_amount AS transaction_amount,
           c.name AS customer_name,
           u.first_name || ' ' || u.last_name AS assigned_name,
           p.card_last_four, p.authorization_code, p.payment_method
    FROM chargeback_cases cc
    LEFT JOIN transactions t ON cc.transaction_id = t.transaction_id
    LEFT JOIN customers c ON cc.customer_id = c.id
    LEFT JOIN users u ON cc.assigned_to = u.id
    LEFT JOIN payments p ON cc.payment_id = p.payment_id
    WHERE 1=1
  `;
  const params = [];

  if (status) {
    params.push(status);
    query += ` AND cc.status = $${params.length}`;
  }
  if (card_brand) {
    params.push(card_brand);
    query += ` AND cc.card_brand = $${params.length}`;
  }
  if (date_from) {
    params.push(date_from);
    query += ` AND cc.created_at >= $${params.length}`;
  }
  if (date_to) {
    params.push(date_to);
    query += ` AND cc.created_at <= $${params.length}`;
  }
  if (amount_min) {
    params.push(parseFloat(amount_min));
    query += ` AND cc.amount >= $${params.length}`;
  }
  if (amount_max) {
    params.push(parseFloat(amount_max));
    query += ` AND cc.amount <= $${params.length}`;
  }
  if (assigned_to) {
    params.push(parseInt(assigned_to));
    query += ` AND cc.assigned_to = $${params.length}`;
  }

  const offset = (parseInt(page) - 1) * parseInt(limit);
  params.push(parseInt(limit), offset);
  query += ` ORDER BY CASE WHEN cc.status IN ('received','under_review') THEN 0 ELSE 1 END,
             cc.response_deadline ASC NULLS LAST, cc.created_at DESC
             LIMIT $${params.length - 1} OFFSET $${params.length}`;

  // Count total
  let countQuery = query.replace(/SELECT cc\.\*.*FROM/, 'SELECT COUNT(*)::int AS total FROM').replace(/ORDER BY.*$/, '');
  // Simpler approach
  let countQ = `SELECT COUNT(*)::int AS total FROM chargeback_cases cc WHERE 1=1`;
  const countParams = [];
  if (status) { countParams.push(status); countQ += ` AND cc.status = $${countParams.length}`; }
  if (card_brand) { countParams.push(card_brand); countQ += ` AND cc.card_brand = $${countParams.length}`; }
  if (date_from) { countParams.push(date_from); countQ += ` AND cc.created_at >= $${countParams.length}`; }
  if (date_to) { countParams.push(date_to); countQ += ` AND cc.created_at <= $${countParams.length}`; }
  if (amount_min) { countParams.push(parseFloat(amount_min)); countQ += ` AND cc.amount >= $${countParams.length}`; }
  if (amount_max) { countParams.push(parseFloat(amount_max)); countQ += ` AND cc.amount <= $${countParams.length}`; }
  if (assigned_to) { countParams.push(parseInt(assigned_to)); countQ += ` AND cc.assigned_to = $${countParams.length}`; }

  const [dataResult, countResult] = await Promise.all([
    pool.query(query, params),
    pool.query(countQ, countParams),
  ]);

  res.json({
    success: true,
    data: dataResult.rows,
    pagination: {
      total: countResult.rows[0].total,
      page: parseInt(page),
      limit: parseInt(limit),
      pages: Math.ceil(countResult.rows[0].total / parseInt(limit)),
    },
  });
}));

// ============================================================================
// CREATE CHARGEBACK — enhanced with pipeline fields
// ============================================================================

router.post('/', authenticate, requirePermission('fraud.chargebacks.manage'), asyncHandler(async (req, res) => {
  const {
    transaction_id, payment_id, case_number, amount, reason_code, reason_description,
    deadline, customer_id, notes, card_brand, received_at, response_deadline,
    moneris_case_id, assigned_to
  } = req.body;

  if (!transaction_id || !payment_id || !amount) {
    throw ApiError.badRequest('transaction_id, payment_id, and amount are required');
  }

  // Create the chargeback
  const { rows } = await pool.query(`
    INSERT INTO chargeback_cases (
      transaction_id, payment_id, case_number, amount, reason_code, reason_description,
      deadline, customer_id, notes, card_brand, received_at, response_deadline,
      moneris_case_id, assigned_to, status, status_changed_at
    ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, 'received', NOW())
    RETURNING *
  `, [
    transaction_id, payment_id, case_number || null, amount, reason_code || null,
    reason_description || null, deadline || null, customer_id || null, notes || null,
    card_brand || null, received_at || new Date().toISOString(),
    response_deadline || null, moneris_case_id || null, assigned_to || null,
  ]);

  const chargeback = rows[0];

  // Record initial status in history
  await pool.query(`
    INSERT INTO chargeback_status_history (chargeback_id, from_status, to_status, changed_by, notes)
    VALUES ($1, NULL, 'received', $2, 'Chargeback case created')
  `, [chargeback.id, req.user.id]);

  // Auto-populate evidence — prefer ChargebackEvidenceService, fallback to inline helper
  if (chargebackEvidenceService) {
    chargebackEvidenceService.buildEvidencePackage(chargeback.id)
      .then(pkg => {
        // Attempt CE 3.0 for Visa disputes
        if (card_brand === 'Visa' && reason_code?.startsWith('10.4')) {
          return chargebackEvidenceService.buildCE3Evidence(chargeback.id);
        }
        return pkg;
      })
      .catch(err => logger.error({ err, chargebackId: chargeback.id }, 'Evidence auto-collection failed'));
  } else {
    await _autoPopulateEvidence(chargeback.id, transaction_id, payment_id, req.user.id);
  }

  // Audit log
  await fraudService.logAuditEntry(req.user.id, 'chargeback.create', 'chargeback', chargeback.id, {
    transaction_id, amount, reason_code, card_brand,
  }, req);

  // WebSocket notification for new chargeback
  if (wsService) {
    wsService.broadcastToRoles(['admin', 'manager'], 'chargeback:created', {
      id: chargeback.id,
      case_number: chargeback.case_number,
      amount,
      card_brand,
      reason_code,
      message: `New chargeback case created — $${amount} (${card_brand || 'Unknown'})`,
    });
  }

  res.status(201).json({ success: true, data: chargeback });
}));

// ============================================================================
// GET CHARGEBACK DETAIL — enhanced with timeline, evidence, comments
// ============================================================================

router.get('/:id', authenticate, requirePermission('fraud.chargebacks.manage'), asyncHandler(async (req, res) => {
  const chargebackId = parseInt(req.params.id);

  const [caseResult, evidenceResult, timelineResult, commentsResult, txnResult] = await Promise.all([
    // Chargeback case with joins
    pool.query(`
      SELECT cc.*, t.transaction_number, t.total_amount AS transaction_amount,
             t.subtotal, t.discount_amount, t.hst_amount, t.status AS transaction_status,
             t.created_at AS transaction_date, t.user_id AS cashier_id,
             cashier.first_name || ' ' || cashier.last_name AS cashier_name,
             c.name AS customer_name,
             c.email AS customer_email, c.phone AS customer_phone,
             assigned.first_name || ' ' || assigned.last_name AS assigned_name,
             p.payment_method, p.card_last_four, p.card_brand AS payment_card_brand,
             p.authorization_code, p.processor_reference, p.amount AS payment_amount
      FROM chargeback_cases cc
      LEFT JOIN transactions t ON cc.transaction_id = t.transaction_id
      LEFT JOIN customers c ON cc.customer_id = c.id
      LEFT JOIN users assigned ON cc.assigned_to = assigned.id
      LEFT JOIN users cashier ON t.user_id = cashier.id
      LEFT JOIN payments p ON cc.payment_id = p.payment_id
      WHERE cc.id = $1
    `, [chargebackId]),

    // Evidence
    pool.query(`
      SELECT ce.*, u.first_name || ' ' || u.last_name AS uploaded_by_name
      FROM chargeback_evidence ce
      LEFT JOIN users u ON ce.uploaded_by = u.id
      WHERE ce.chargeback_id = $1
      ORDER BY ce.created_at DESC
    `, [chargebackId]),

    // Status history timeline
    pool.query(`
      SELECT csh.*, u.first_name || ' ' || u.last_name AS changed_by_name
      FROM chargeback_status_history csh
      LEFT JOIN users u ON csh.changed_by = u.id
      WHERE csh.chargeback_id = $1
      ORDER BY csh.created_at ASC
    `, [chargebackId]),

    // Comments
    pool.query(`
      SELECT cc.*, u.first_name || ' ' || u.last_name AS user_name
      FROM chargeback_comments cc
      LEFT JOIN users u ON cc.user_id = u.id
      WHERE cc.chargeback_id = $1
      ORDER BY cc.created_at ASC
    `, [chargebackId]),

    // Fraud score for AVS/CVV data
    pool.query(`
      SELECT fs.score, fs.risk_level, fs.signals, fs.avs_result, fs.cvv_result,
             fs.entry_method, fs.card_bin
      FROM fraud_scores fs
      WHERE fs.transaction_id = (SELECT transaction_id FROM chargeback_cases WHERE id = $1)
      ORDER BY fs.created_at DESC LIMIT 1
    `, [chargebackId]),
  ]);

  if (caseResult.rows.length === 0) {
    throw ApiError.notFound('Chargeback case');
  }

  const data = {
    ...caseResult.rows[0],
    evidence: evidenceResult.rows,
    timeline: timelineResult.rows,
    comments: commentsResult.rows,
    fraud_score: txnResult.rows[0] || null,
  };

  res.json({ success: true, data });
}));

// ============================================================================
// UPDATE CHARGEBACK — with status history tracking
// ============================================================================

router.put('/:id', authenticate, requirePermission('fraud.chargebacks.manage'), asyncHandler(async (req, res) => {
  const chargebackId = parseInt(req.params.id);
  const { status, notes, assigned_to, reason_code, reason_description, response_deadline } = req.body;

  // Get current state
  const current = await pool.query('SELECT status FROM chargeback_cases WHERE id = $1', [chargebackId]);
  if (current.rows.length === 0) throw ApiError.notFound('Chargeback case');

  const oldStatus = current.rows[0].status;
  const updates = [];
  const values = [];
  let idx = 1;

  if (status && status !== oldStatus) {
    values.push(status);
    updates.push(`status = $${idx++}`);
    values.push(oldStatus);
    updates.push(`previous_status = $${idx++}`);
    updates.push(`status_changed_at = NOW()`);

    // Track resolved/evidence timestamps
    if (status === 'evidence_submitted') {
      updates.push(`evidence_submitted_at = NOW()`);
    }
    if (['won', 'lost', 'expired', 'accepted'].includes(status)) {
      updates.push(`resolved_at = NOW()`);
      // Calculate response_days
      updates.push(`response_days = EXTRACT(DAY FROM NOW() - COALESCE(received_at, created_at))::int`);
    }
  }
  if (notes !== undefined) { values.push(notes); updates.push(`notes = $${idx++}`); }
  if (assigned_to !== undefined) { values.push(assigned_to); updates.push(`assigned_to = $${idx++}`); }
  if (reason_code !== undefined) { values.push(reason_code); updates.push(`reason_code = $${idx++}`); }
  if (reason_description !== undefined) { values.push(reason_description); updates.push(`reason_description = $${idx++}`); }
  if (response_deadline !== undefined) { values.push(response_deadline); updates.push(`response_deadline = $${idx++}`); }

  if (updates.length === 0) {
    return res.json({ success: true, data: current.rows[0] });
  }

  updates.push('updated_at = NOW()');
  values.push(chargebackId);
  const { rows } = await pool.query(
    `UPDATE chargeback_cases SET ${updates.join(', ')} WHERE id = $${idx} RETURNING *`,
    values
  );

  // Record status change in history
  if (status && status !== oldStatus) {
    await pool.query(`
      INSERT INTO chargeback_status_history (chargeback_id, from_status, to_status, changed_by, notes)
      VALUES ($1, $2, $3, $4, $5)
    `, [chargebackId, oldStatus, status, req.user.id, req.body.status_notes || null]);
  }

  await fraudService.logAuditEntry(req.user.id, 'chargeback.update', 'chargeback', chargebackId, {
    updates: req.body, old_status: oldStatus,
  }, req);

  res.json({ success: true, data: rows[0] });
}));

// ============================================================================
// EVIDENCE UPLOAD — with file storage
// ============================================================================

router.post('/:id/evidence', authenticate, requirePermission('fraud.chargebacks.manage'), (req, res, next) => {
  if (!upload) return next(ApiError.badRequest('File upload not configured'));
  upload.single('file')(req, res, next);
}, asyncHandler(async (req, res) => {
  const chargebackId = parseInt(req.params.id);

  // Verify chargeback exists
  const exists = await pool.query('SELECT id FROM chargeback_cases WHERE id = $1', [chargebackId]);
  if (exists.rows.length === 0) throw ApiError.notFound('Chargeback case');

  const evidence_type = req.body.evidence_type;
  const description = req.body.description || null;

  if (!evidence_type) {
    throw ApiError.badRequest('evidence_type is required');
  }

  let file_path = null;
  let file_name = null;
  let file_size = null;
  let mime_type = null;

  if (req.file) {
    // Validate file type and size
    const allowedTypes = ['application/pdf', 'image/jpeg', 'image/png'];
    if (!allowedTypes.includes(req.file.mimetype)) {
      throw ApiError.badRequest('Only PDF, JPEG, and PNG files are allowed');
    }
    if (req.file.size > 10 * 1024 * 1024) {
      throw ApiError.badRequest('File size must not exceed 10MB');
    }

    // Ensure directory exists
    const caseDir = path.join(UPLOAD_DIR, String(chargebackId));
    if (!fs.existsSync(caseDir)) {
      fs.mkdirSync(caseDir, { recursive: true });
    }

    // Generate unique filename
    const ext = path.extname(req.file.originalname) || '.bin';
    const safeName = `${evidence_type}_${Date.now()}${ext}`;
    const fullPath = path.join(caseDir, safeName);

    fs.writeFileSync(fullPath, req.file.buffer);

    file_path = `/uploads/chargebacks/${chargebackId}/${safeName}`;
    file_name = req.file.originalname;
    file_size = req.file.size;
    mime_type = req.file.mimetype;
  }

  const { rows } = await pool.query(`
    INSERT INTO chargeback_evidence (chargeback_id, evidence_type, file_path, description, uploaded_by, file_name, file_size, mime_type)
    VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
    RETURNING *
  `, [chargebackId, evidence_type, file_path, description, req.user.id, file_name, file_size, mime_type]);

  // Record in timeline
  await pool.query(`
    INSERT INTO chargeback_status_history (chargeback_id, from_status, to_status, changed_by, notes)
    VALUES ($1, (SELECT status FROM chargeback_cases WHERE id = $1), (SELECT status FROM chargeback_cases WHERE id = $1), $2, $3)
  `, [chargebackId, req.user.id, `Evidence added: ${evidence_type} — ${description || file_name || ''}`]);

  res.status(201).json({ success: true, data: rows[0] });
}));

// ============================================================================
// TIMELINE — get status history
// ============================================================================

router.get('/:id/timeline', authenticate, requirePermission('fraud.chargebacks.manage'), asyncHandler(async (req, res) => {
  const { rows } = await pool.query(`
    SELECT csh.*, u.first_name || ' ' || u.last_name AS changed_by_name
    FROM chargeback_status_history csh
    LEFT JOIN users u ON csh.changed_by = u.id
    WHERE csh.chargeback_id = $1
    ORDER BY csh.created_at ASC
  `, [parseInt(req.params.id)]);

  res.json({ success: true, data: rows });
}));

// ============================================================================
// COMMENTS — internal discussion thread
// ============================================================================

router.get('/:id/comments', authenticate, requirePermission('fraud.chargebacks.manage'), asyncHandler(async (req, res) => {
  const { rows } = await pool.query(`
    SELECT cc.*, u.first_name || ' ' || u.last_name AS user_name
    FROM chargeback_comments cc
    LEFT JOIN users u ON cc.user_id = u.id
    WHERE cc.chargeback_id = $1
    ORDER BY cc.created_at ASC
  `, [parseInt(req.params.id)]);

  res.json({ success: true, data: rows });
}));

router.post('/:id/comments', authenticate, requirePermission('fraud.chargebacks.manage'), asyncHandler(async (req, res) => {
  const { comment } = req.body;
  if (!comment?.trim()) throw ApiError.badRequest('comment is required');

  const { rows } = await pool.query(`
    INSERT INTO chargeback_comments (chargeback_id, user_id, comment)
    VALUES ($1, $2, $3)
    RETURNING *
  `, [parseInt(req.params.id), req.user.id, comment.trim()]);

  // Get user name for response
  const user = await pool.query('SELECT first_name, last_name FROM users WHERE id = $1', [req.user.id]);
  const data = {
    ...rows[0],
    user_name: user.rows[0] ? `${user.rows[0].first_name} ${user.rows[0].last_name}` : 'Unknown',
  };

  res.status(201).json({ success: true, data });
}));

// ============================================================================
// AUTO-POPULATE EVIDENCE HELPER
// ============================================================================

async function _autoPopulateEvidence(chargebackId, transactionId, paymentId, userId) {
  const evidenceItems = [];

  // 1) Transaction receipt data
  const txn = await pool.query(`
    SELECT t.*, p.card_last_four, p.card_brand, p.authorization_code, p.payment_method, p.amount AS payment_amount
    FROM transactions t
    LEFT JOIN payments p ON p.payment_id = $2
    WHERE t.transaction_id = $1
  `, [transactionId, paymentId]);

  if (txn.rows[0]) {
    const t = txn.rows[0];
    evidenceItems.push({
      type: 'transaction_snapshot',
      description: `Transaction #${t.transaction_number} — $${t.total_amount} on ${new Date(t.created_at).toLocaleDateString('en-CA')}. Payment: ${t.payment_method}, Card: ****${t.card_last_four || 'N/A'}, Auth: ${t.authorization_code || 'N/A'}`,
    });

    if (t.authorization_code) {
      evidenceItems.push({
        type: 'authorization',
        description: `Authorization code: ${t.authorization_code}, Processor ref: ${t.processor_reference || 'N/A'}, Entry method: ${t.payment_method}`,
      });
    }
  }

  // 2) Fraud score with AVS/CVV
  const fs = await pool.query(`
    SELECT score, avs_result, cvv_result, entry_method, card_bin, signals
    FROM fraud_scores WHERE transaction_id = $1 ORDER BY created_at DESC LIMIT 1
  `, [transactionId]);

  if (fs.rows[0]) {
    const f = fs.rows[0];
    if (f.avs_result || f.cvv_result) {
      evidenceItems.push({
        type: 'avs_cvv',
        description: `AVS result: ${f.avs_result || 'N/A'}, CVV result: ${f.cvv_result || 'N/A'}, Entry method: ${f.entry_method || 'N/A'}, Fraud score: ${f.score}/100`,
      });
    }
    if (f.entry_method === 'chip') {
      evidenceItems.push({
        type: 'emv_log',
        description: `EMV chip read confirmed. Entry method: chip. BIN: ${f.card_bin || 'N/A'}`,
      });
    }
  }

  // Insert all auto-populated evidence
  for (const item of evidenceItems) {
    await pool.query(`
      INSERT INTO chargeback_evidence (chargeback_id, evidence_type, description, uploaded_by, is_auto_populated)
      VALUES ($1, $2, $3, $4, true)
    `, [chargebackId, item.type, item.description, userId]);
  }
}

// ============================================================================
// EVIDENCE REBUILD + CE 3.0
// ============================================================================

router.post('/:id/rebuild-evidence', authenticate, requirePermission('fraud.chargebacks.manage'), asyncHandler(async (req, res) => {
  if (!chargebackEvidenceService) {
    throw ApiError.badRequest('Evidence service not configured');
  }
  const chargebackId = parseInt(req.params.id);
  const pkg = await chargebackEvidenceService.buildEvidencePackage(chargebackId);
  res.json({ success: true, data: pkg });
}));

router.post('/:id/ce3-evidence', authenticate, requirePermission('fraud.chargebacks.manage'), asyncHandler(async (req, res) => {
  if (!chargebackEvidenceService) {
    throw ApiError.badRequest('Evidence service not configured');
  }
  const chargebackId = parseInt(req.params.id);
  const ce3 = await chargebackEvidenceService.buildCE3Evidence(chargebackId);
  res.json({ success: true, data: ce3 });
}));

// ============================================================================
// DEADLINE CHECK — called by cron, also available as manual endpoint
// ============================================================================

router.post('/check-deadlines', authenticate, requirePermission('fraud.chargebacks.manage'), asyncHandler(async (req, res) => {
  const alerts = await _checkDeadlines();
  res.json({ success: true, data: { alerts_sent: alerts.length, alerts } });
}));

async function _checkDeadlines() {
  const { rows } = await pool.query(`
    SELECT cc.id, cc.case_number, cc.amount, cc.card_brand, cc.reason_code,
           cc.response_deadline, cc.assigned_to, cc.status,
           u.first_name || ' ' || u.last_name AS assigned_name,
           EXTRACT(DAY FROM cc.response_deadline - NOW())::int AS days_remaining
    FROM chargeback_cases cc
    LEFT JOIN users u ON cc.assigned_to = u.id
    WHERE cc.status IN ('received', 'under_review')
      AND cc.response_deadline IS NOT NULL
      AND cc.response_deadline <= NOW() + INTERVAL '7 days'
      AND cc.response_deadline > NOW()
    ORDER BY cc.response_deadline ASC
  `);

  if (rows.length > 0 && wsService) {
    wsService.broadcastToRoles(['admin', 'manager'], 'chargeback:deadline_warning', {
      count: rows.length,
      chargebacks: rows,
      message: `${rows.length} chargeback(s) have response deadlines within 7 days`,
    });
  }

  // Also check for newly expired
  await pool.query(`
    UPDATE chargeback_cases
    SET status = 'expired', previous_status = status, status_changed_at = NOW(), resolved_at = NOW()
    WHERE status IN ('received', 'under_review')
      AND response_deadline IS NOT NULL
      AND response_deadline < NOW()
  `);

  return rows;
}

// Export for cron usage
router._checkDeadlines = _checkDeadlines;

// ============================================================================
// INIT
// ============================================================================

const init = (deps) => {
  fraudService = deps.fraudService;
  pool = deps.pool || fraudService.pool;
  upload = deps.upload || null;
  wsService = deps.wsService || null;
  chargebackEvidenceService = deps.chargebackEvidenceService || null;
  return router;
};

module.exports = { init };
