/**
 * Approval Workflow Routes
 * EXTRACTED from server.js inline handlers (lines 1966-2393)
 * Handles quote approval requests, review, approve, and reject flows.
 */

const express = require('express');
const router = express.Router();
const { authenticate } = require('../middleware/auth');
const logger = require('../utils/logger');
const { SESv2Client, SendEmailCommand } = require('@aws-sdk/client-sesv2');
const ApprovalRulesService = require('../services/ApprovalRulesService');

let pool = null;
let sesClient = null;

// ============================================================================
// POST /api/quotations/:id/request-approval
// Request approval for a quotation
// ============================================================================
router.post('/quotations/:id/request-approval', authenticate, async (req, res) => {
  try {
    const { id } = req.params;
    const { requested_by, requested_by_email, approver_name, approver_email, comments } = req.body;

    // Check if there's already a pending approval
    const existing = await pool.query(
      'SELECT * FROM quote_approvals WHERE quotation_id = $1 AND status = \'PENDING\'',
      [id]
    );

    if (existing.rows.length > 0) {
      return res.status(400).json({ error: 'This quote already has a pending approval request' });
    }

    // Create approval request
    const result = await pool.query(`
      INSERT INTO quote_approvals (quotation_id, requested_by, requested_by_email, approver_name, approver_email, comments)
      VALUES ($1, $2, $3, $4, $5, $6) RETURNING *
    `, [id, requested_by, requested_by_email, approver_name, approver_email, comments]);

    // Add event to timeline
    await pool.query(`
      INSERT INTO quote_events (quotation_id, event_type, description)
      VALUES ($1, $2, $3)
    `, [id, 'APPROVAL_REQUESTED', `Approval requested by ${requested_by} from ${approver_name}`]);

    // Update quote status to PENDING_APPROVAL
    await pool.query(
      'UPDATE quotations SET status = \'PENDING_APPROVAL\' WHERE id = $1',
      [id]
    );

    // Send email notification to approver (using AWS SES)
    const quoteResult = await pool.query(
      `SELECT q.*, c.name as customer_name, c.company as customer_company
       FROM quotations q LEFT JOIN customers c ON q.customer_id = c.id
       WHERE q.id = $1`,
      [id]
    );

    if (quoteResult.rows.length > 0 && approver_email) {
      const quote = quoteResult.rows[0];
      const emailHTML = `
        <!DOCTYPE html>
        <html>
        <head>
          <style>
            body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
            .container { max-width: 600px; margin: 0 auto; padding: 20px; }
            .header { background: #6366f1; color: white; padding: 20px; border-radius: 8px; margin-bottom: 20px; }
            .content { background: #f9fafb; padding: 20px; border-radius: 8px; margin-bottom: 20px; }
            .button { display: inline-block; padding: 12px 24px; background: #6366f1; color: white;
                     text-decoration: none; border-radius: 6px; font-weight: bold; margin-top: 16px; }
            .details { background: white; padding: 16px; border-radius: 6px; margin-top: 16px; }
            .label { color: #6b7280; font-size: 14px; }
            .value { color: #111827; font-weight: bold; font-size: 16px; }
          </style>
        </head>
        <body>
          <div class="container">
            <div class="header">
              <h2 style="margin: 0;">Approval Request</h2>
            </div>
            <div class="content">
              <p>Hi ${approver_name},</p>
              <p><strong>${requested_by}</strong> has requested your approval for the following quote:</p>
              <div class="details">
                <div style="margin-bottom: 12px;">
                  <div class="label">Quote Number</div>
                  <div class="value">${quote.quote_number}</div>
                </div>
                <div style="margin-bottom: 12px;">
                  <div class="label">Customer</div>
                  <div class="value">${quote.customer_name}${quote.customer_company ? ' (' + quote.customer_company + ')' : ''}</div>
                </div>
                <div style="margin-bottom: 12px;">
                  <div class="label">Total Value</div>
                  <div class="value">$${((quote.total_cents || 0) / 100).toFixed(2)} CAD</div>
                </div>
                ${comments ? `
                <div style="margin-top: 16px; padding-top: 16px; border-top: 1px solid #e5e7eb;">
                  <div class="label">Comments</div>
                  <div style="color: #374151; margin-top: 8px;">${comments}</div>
                </div>
                ` : ''}
              </div>
              <p style="margin-top: 24px;">Please review and approve or reject this quote in the quotation system.</p>
            </div>
            <div style="text-align: center; color: #6b7280; font-size: 12px;">
              <p>This is an automated notification from the Quotation Management System</p>
            </div>
          </div>
        </body>
        </html>
      `;

      try {
        const command = new SendEmailCommand({
          Source: process.env.EMAIL_FROM,
          Destination: { ToAddresses: [approver_email] },
          Message: {
            Subject: { Data: `Approval Request: Quote ${quote.quote_number}` },
            Body: { Html: { Data: emailHTML } }
          }
        });
        await sesClient.send(command);
        logger.info({ recipient: approver_email }, 'Approval request email sent');
      } catch (emailErr) {
        logger.error({ err: emailErr }, 'Error sending approval email');
      }
    }

    res.status(201).json(result.rows[0]);
  } catch (error) {
    logger.error({ err: error }, 'Error requesting approval');
    res.status(500).json({ error: 'Failed to request approval' });
  }
});

// ============================================================================
// GET /api/quotations/:id/approvals
// Get approval history for a quotation
// ============================================================================
router.get('/quotations/:id/approvals', authenticate, async (req, res) => {
  try {
    const { id } = req.params;
    const result = await pool.query(
      'SELECT * FROM quote_approvals WHERE quotation_id = $1 ORDER BY requested_at DESC',
      [id]
    );
    res.json(result.rows);
  } catch (error) {
    logger.error({ err: error }, 'Error fetching approvals');
    res.status(500).json({ error: 'Failed to fetch approvals' });
  }
});

// ============================================================================
// GET /api/quotations/:id/approval-summary
// Get approval rules summary for a quotation
// ============================================================================
router.get('/quotations/:id/approval-summary', authenticate, async (req, res) => {
  try {
    const { id } = req.params;

    const quoteResult = await pool.query(
      'SELECT * FROM quotations WHERE id = $1',
      [id]
    );

    if (quoteResult.rows.length === 0) {
      return res.status(404).json({ error: 'Quote not found' });
    }

    const quote = quoteResult.rows[0];
    const summary = ApprovalRulesService.getApprovalSummary(quote, req.user);

    res.json(summary);
  } catch (error) {
    logger.error({ err: error }, 'Error getting approval summary');
    res.status(500).json({ error: 'Failed to fetch approvals' });
  }
});

// ============================================================================
// GET /api/approvals/pending
// Get all pending approvals
// ============================================================================
router.get('/approvals/pending', authenticate, async (req, res) => {
  try {
    const { approver_email } = req.query;

    let query = `
      SELECT
        qa.*,
        q.quote_number,
        q.total_cents,
        q.created_at as quote_created_at,
        c.name as customer_name,
        c.company as customer_company
      FROM quote_approvals qa
      LEFT JOIN quotations q ON qa.quotation_id = q.id
      LEFT JOIN customers c ON q.customer_id = c.id
      WHERE qa.status = 'PENDING'
    `;

    const params = [];
    if (approver_email) {
      query += ' AND qa.approver_email = $1';
      params.push(approver_email);
    }

    query += ' ORDER BY qa.requested_at DESC';

    const result = await pool.query(query, params);
    res.json(result.rows);
  } catch (error) {
    logger.error({ err: error }, 'Error fetching pending approvals');
    res.status(500).json({ error: 'Failed to fetch pending approvals' });
  }
});

// ============================================================================
// POST /api/approvals/:id/approve
// Approve a quote
// ============================================================================
router.post('/approvals/:id/approve', authenticate, async (req, res) => {
  try {
    const { id } = req.params;
    const { comments } = req.body;

    // Get approval request
    const approvalResult = await pool.query(
      `SELECT qa.*, q.total_cents FROM quote_approvals qa
       LEFT JOIN quotations q ON qa.quotation_id = q.id
       WHERE qa.id = $1`,
      [id]
    );

    if (approvalResult.rows.length === 0) {
      return res.status(404).json({ error: 'Approval request not found' });
    }

    const approval = approvalResult.rows[0];

    // Role enforcement - check if user can approve this quote
    const canApprove = ApprovalRulesService.canApprove(req.user, approval);
    if (!canApprove.canApprove) {
      return res.status(403).json({
        error: 'Not authorized to approve this quote',
        reason: canApprove.reason
      });
    }

    // Update approval record
    const result = await pool.query(`
      UPDATE quote_approvals
      SET status = 'APPROVED', comments = COALESCE($1, comments), reviewed_at = CURRENT_TIMESTAMP,
          approver_name = $3, approver_email = $4
      WHERE id = $2 RETURNING *
    `, [comments, id, `${req.user.firstName} ${req.user.lastName}`, req.user.email]);

    // Update quote status to APPROVED with audit fields
    await pool.query(
      'UPDATE quotations SET status = \'APPROVED\', approved_at = CURRENT_TIMESTAMP, approved_by = $2 WHERE id = $1',
      [approval.quotation_id, req.user.id]
    );

    // Add event to timeline
    await pool.query(`
      INSERT INTO quote_events (quotation_id, event_type, description)
      VALUES ($1, $2, $3)
    `, [approval.quotation_id, 'APPROVED', `Quote approved by ${approval.approver_name}${comments ? ': ' + comments : ''}`]);

    // Send notification email to requester
    if (approval.requested_by_email) {
      const quoteResult = await pool.query(
        `SELECT q.*, c.name as customer_name FROM quotations q
         LEFT JOIN customers c ON q.customer_id = c.id WHERE q.id = $1`,
        [approval.quotation_id]
      );

      if (quoteResult.rows.length > 0) {
        const quote = quoteResult.rows[0];
        const emailHTML = `
          <!DOCTYPE html>
          <html>
          <head>
            <style>
              body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
              .container { max-width: 600px; margin: 0 auto; padding: 20px; }
              .header { background: #10b981; color: white; padding: 20px; border-radius: 8px; margin-bottom: 20px; }
              .content { background: #f9fafb; padding: 20px; border-radius: 8px; }
            </style>
          </head>
          <body>
            <div class="container">
              <div class="header">
                <h2 style="margin: 0;">Quote Approved</h2>
              </div>
              <div class="content">
                <p>Hi ${approval.requested_by},</p>
                <p>Your quote <strong>${quote.quote_number}</strong> for <strong>${quote.customer_name}</strong> has been approved by ${approval.approver_name}.</p>
                ${comments ? `<p><strong>Comments:</strong> ${comments}</p>` : ''}
                <p>You can now proceed with sending the quote to the customer.</p>
              </div>
            </div>
          </body>
          </html>
        `;

        try {
          const command = new SendEmailCommand({
            Source: process.env.EMAIL_FROM,
            Destination: { ToAddresses: [approval.requested_by_email] },
            Message: {
              Subject: { Data: `Quote Approved: ${quote.quote_number}` },
              Body: { Html: { Data: emailHTML } }
            }
          });
          await sesClient.send(command);
        } catch (emailErr) {
          logger.error({ err: emailErr }, 'Error sending approval notification');
        }
      }
    }

    res.json(result.rows[0]);
  } catch (error) {
    logger.error({ err: error }, 'Error approving quote');
    res.status(500).json({ error: 'Failed to approve quote' });
  }
});

// ============================================================================
// POST /api/approvals/:id/reject
// Reject a quote
// ============================================================================
router.post('/approvals/:id/reject', authenticate, async (req, res) => {
  try {
    const { id } = req.params;
    const { comments } = req.body;

    if (!comments || !comments.trim()) {
      return res.status(400).json({ error: 'Comments are required when rejecting a quote' });
    }

    // Get approval request
    const approvalResult = await pool.query(
      `SELECT qa.*, q.total_cents FROM quote_approvals qa
       LEFT JOIN quotations q ON qa.quotation_id = q.id
       WHERE qa.id = $1`,
      [id]
    );

    if (approvalResult.rows.length === 0) {
      return res.status(404).json({ error: 'Approval request not found' });
    }

    const approval = approvalResult.rows[0];

    // Role enforcement - check if user can reject this quote
    const canReject = ApprovalRulesService.canReject(req.user);
    if (!canReject.canReject) {
      return res.status(403).json({
        error: 'Not authorized to reject this quote',
        reason: canReject.reason
      });
    }

    // Update approval record
    const result = await pool.query(`
      UPDATE quote_approvals
      SET status = 'REJECTED', comments = $1, reviewed_at = CURRENT_TIMESTAMP,
          approver_name = $3, approver_email = $4
      WHERE id = $2 RETURNING *
    `, [comments, id, `${req.user.firstName} ${req.user.lastName}`, req.user.email]);

    // Update quote status to REJECTED with audit fields
    await pool.query(
      'UPDATE quotations SET status = \'REJECTED\', rejected_at = CURRENT_TIMESTAMP, rejected_by = $2, rejected_reason = $3 WHERE id = $1',
      [approval.quotation_id, req.user.id, comments]
    );

    // Add event to timeline
    await pool.query(`
      INSERT INTO quote_events (quotation_id, event_type, description)
      VALUES ($1, $2, $3)
    `, [approval.quotation_id, 'REJECTED', `Quote rejected by ${approval.approver_name}: ${comments}`]);

    // Send notification email to requester
    if (approval.requested_by_email) {
      const quoteResult = await pool.query(
        `SELECT q.*, c.name as customer_name FROM quotations q
         LEFT JOIN customers c ON q.customer_id = c.id WHERE q.id = $1`,
        [approval.quotation_id]
      );

      if (quoteResult.rows.length > 0) {
        const quote = quoteResult.rows[0];
        const emailHTML = `
          <!DOCTYPE html>
          <html>
          <head>
            <style>
              body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
              .container { max-width: 600px; margin: 0 auto; padding: 20px; }
              .header { background: #ef4444; color: white; padding: 20px; border-radius: 8px; margin-bottom: 20px; }
              .content { background: #f9fafb; padding: 20px; border-radius: 8px; }
            </style>
          </head>
          <body>
            <div class="container">
              <div class="header">
                <h2 style="margin: 0;">Quote Rejected</h2>
              </div>
              <div class="content">
                <p>Hi ${approval.requested_by},</p>
                <p>Your quote <strong>${quote.quote_number}</strong> for <strong>${quote.customer_name}</strong> has been rejected by ${approval.approver_name}.</p>
                <p><strong>Reason:</strong> ${comments}</p>
                <p>Please review the feedback and make necessary changes before resubmitting.</p>
              </div>
            </div>
          </body>
          </html>
        `;

        try {
          const command = new SendEmailCommand({
            Source: process.env.EMAIL_FROM,
            Destination: { ToAddresses: [approval.requested_by_email] },
            Message: {
              Subject: { Data: `Quote Rejected: ${quote.quote_number}` },
              Body: { Html: { Data: emailHTML } }
            }
          });
          await sesClient.send(command);
        } catch (emailErr) {
          logger.error({ err: emailErr }, 'Error sending rejection notification');
        }
      }
    }

    res.json(result.rows[0]);
  } catch (error) {
    logger.error({ err: error }, 'Error rejecting quote');
    res.status(500).json({ error: 'Failed to reject quote' });
  }
});

// ============================================================================
// INIT
// ============================================================================
const init = (deps) => {
  pool = deps.pool;

  // Initialize SES client for approval emails
  sesClient = deps.sesClient || new SESv2Client({
    region: process.env.AWS_REGION || 'us-east-1',
    credentials: {
      accessKeyId: process.env.AWS_ACCESS_KEY_ID,
      secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY
    },
  });

  return router;
};

module.exports = { init };
