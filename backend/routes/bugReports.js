'use strict';

/**
 * TeleTime — Bug Report Routes
 * POST   /api/bug-reports      — submit a bug report (public)
 * GET    /api/bug-reports      — list bug reports (auth required)
 * PATCH  /api/bug-reports/:id  — update status/notes
 *
 * =========================================================================
 * MANUAL TEST CHECKLIST — Bug Report Feature (end-to-end)
 * =========================================================================
 *
 * 1. SUBMIT A TEST BUG VIA THE UI
 *    - Log in to http://localhost:3000 (quotation app)
 *    - Click the blue "Report a Bug" button (bottom-right corner)
 *    - Fill in: title, select a severity card, enter a description
 *    - Click "Submit [Severity] Bug"
 *    - Expect: green confirmation banner, modal auto-closes after 2 seconds
 *
 * 2. CONFIRM THE DB ROW WAS CREATED
 *    Run against the quotationapp database:
 *
 *      SELECT id, title, severity, status, reported_by, page,
 *             created_at, updated_at
 *      FROM bug_reports
 *      ORDER BY created_at DESC
 *      LIMIT 5;
 *
 *    Verify the row matches your submission. Status should be 'open',
 *    updated_at should be NULL.
 *
 * 3. UPDATE STATUS FROM THE ADMIN DASHBOARD
 *    - Log in as admin and navigate to http://localhost:3000/admin/bugs
 *    - Click a row to expand it
 *    - Change the status dropdown (e.g. to "In Progress"), add a note
 *    - Click "Save Changes", expect the button to flash green "Saved"
 *    - Confirm in the DB:
 *
 *      SELECT id, status, notes, updated_at
 *      FROM bug_reports
 *      WHERE id = <the bug id>;
 *
 *    Verify status matches your selection and updated_at is now set.
 *
 * 4. CONFIRM THE COMPONENT APPEARS ON BOTH APPS
 *    - Quotation app: log in at http://localhost:3000
 *      Look for "Report a Bug" floating button (bottom-right, blue)
 *      It pulses briefly on first page load
 *    - POS app: log in at http://localhost:5173
 *      Same floating button should appear (bottom-right)
 *    - Both buttons open the same modal form and POST to the same
 *      backend endpoint (/api/bug-reports)
 *
 * =========================================================================
 */

const express = require('express');
const router = express.Router();
const { asyncHandler, ApiError } = require('../middleware/errorHandler');
const { authenticate } = require('../middleware/auth');

// ============================================================================
// MODULE STATE
// ============================================================================

let pool = null;

// ============================================================================
// HELPERS
// ============================================================================

const VALID_SEVERITIES = ['blocker', 'major', 'minor'];
const VALID_STATUSES = ['open', 'in_progress', 'resolved', 'wont_fix'];

// ============================================================================
// POST /api/bug-reports — Submit a bug report (no auth required)
// ============================================================================

router.post('/', asyncHandler(async (req, res) => {
  const { title, description, severity, page, reportedBy, steps, createdAt, userAgent } = req.body;

  // --- validation ---
  const errors = [];
  if (!title || !String(title).trim()) errors.push('title is required');
  if (!description || !String(description).trim()) errors.push('description is required');
  if (!severity || !VALID_SEVERITIES.includes(severity)) {
    errors.push(`severity must be one of: ${VALID_SEVERITIES.join(', ')}`);
  }
  if (errors.length) {
    throw ApiError.badRequest(errors.join('; '));
  }

  const { rows } = await pool.query(
    `INSERT INTO bug_reports (title, description, severity, page, reported_by, steps, user_agent, created_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7, COALESCE($8::timestamptz, NOW()))
     RETURNING id`,
    [
      title.trim(),
      description.trim(),
      severity,
      page || null,
      reportedBy || null,
      steps || null,
      userAgent || null,
      createdAt || null
    ]
  );

  const bugId = rows[0].id;

  res.status(201).json({ success: true, id: bugId });
}));

// ============================================================================
// GET /api/bug-reports — List bug reports (auth required)
// ============================================================================

router.get('/', authenticate, asyncHandler(async (req, res) => {
  const { severity, status, limit: rawLimit, offset: rawOffset } = req.query;

  const limit = Math.min(Math.max(parseInt(rawLimit, 10) || 50, 1), 200);
  const offset = Math.max(parseInt(rawOffset, 10) || 0, 0);

  const conditions = [];
  const params = [];
  let idx = 1;

  if (severity && VALID_SEVERITIES.includes(severity)) {
    conditions.push(`severity = $${idx++}`);
    params.push(severity);
  }
  if (status && VALID_STATUSES.includes(status)) {
    conditions.push(`status = $${idx++}`);
    params.push(status);
  }

  const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';

  const countQuery = `SELECT COUNT(*)::int AS count FROM bug_reports ${where}`;
  const dataQuery = `SELECT * FROM bug_reports ${where} ORDER BY created_at DESC LIMIT $${idx++} OFFSET $${idx++}`;

  params.push(limit, offset);

  const [countResult, dataResult] = await Promise.all([
    pool.query(countQuery, params.slice(0, params.length - 2)),
    pool.query(dataQuery, params)
  ]);

  res.json({
    bugs: dataResult.rows,
    count: countResult.rows[0].count
  });
}));

// ============================================================================
// PATCH /api/bug-reports/:id — Update status / notes
// ============================================================================

router.patch('/:id', asyncHandler(async (req, res) => {
  const { id } = req.params;
  const { status, notes } = req.body;

  if (status && !VALID_STATUSES.includes(status)) {
    throw ApiError.badRequest(`status must be one of: ${VALID_STATUSES.join(', ')}`);
  }

  const setClauses = ['updated_at = NOW()'];
  const params = [];
  let idx = 1;

  if (status) {
    setClauses.push(`status = $${idx++}`);
    params.push(status);
  }
  if (notes !== undefined) {
    setClauses.push(`notes = $${idx++}`);
    params.push(notes);
  }

  params.push(parseInt(id, 10));

  const { rowCount } = await pool.query(
    `UPDATE bug_reports SET ${setClauses.join(', ')} WHERE id = $${idx}`,
    params
  );

  if (rowCount === 0) {
    throw ApiError.notFound('Bug report not found');
  }

  res.json({ success: true });
}));

// ============================================================================
// INIT
// ============================================================================

function init(deps) {
  pool = deps.pool;
  return router;
}

module.exports = { init };
