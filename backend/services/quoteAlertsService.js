'use strict';

/**
 * QuoteAlertsService
 *
 * Daily scan of open quotes → contextual follow-up reminders.
 *
 * Flow:
 *   1. getStalledQuotes()  – find DRAFT/SENT quotes with no activity
 *   2. generateFollowUpMessage() – ask Claude Haiku for a one-liner
 *   3. createFollowUpNotification() – insert into user_notifications
 *   4. sendDigestEmail() – optional morning email digest via SES
 *   5. runDailyQuoteAlerts() – orchestrator called by cron
 */

const pool = require('../db');
const EmailService = require('./EmailService');

// ── Thresholds (days of inactivity before alerting) ──────────────
const STALE_THRESHOLDS = {
  DRAFT: 2,   // draft untouched for 2+ days
  SENT:  3,   // sent but no response for 3+ days
};

// ── Anthropic lazy init ──────────────────────────────────────────
let anthropic = null;
function getAnthropic() {
  if (!anthropic) {
    const Anthropic = require('@anthropic-ai/sdk');
    anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
  }
  return anthropic;
}

// ── Core Methods ─────────────────────────────────────────────────

/**
 * Find quotes that have gone stale (no update within threshold).
 * Groups results by salesperson_id so we can batch per rep.
 *
 * @returns {Array<object>} rows with quote + customer + rep info
 */
async function getStalledQuotes() {
  const result = await pool.query(`
    SELECT
      q.id              AS quote_id,
      q.quote_number,
      q.status,
      q.salesperson_id,
      q.customer_id,
      q.total_cents,
      q.created_at,
      q.updated_at,
      q.expires_at,
      EXTRACT(DAY FROM NOW() - COALESCE(q.updated_at, q.created_at))::int AS days_stale,
      c.name            AS customer_name,
      c.email           AS customer_email,
      c.phone           AS customer_phone,
      u.email           AS rep_email,
      u.first_name      AS rep_first_name
    FROM quotations q
    LEFT JOIN customers c ON q.customer_id = c.id
    LEFT JOIN users     u ON q.salesperson_id = u.id
    WHERE q.status IN ('DRAFT', 'SENT')
      AND q.salesperson_id IS NOT NULL
      AND (
        (q.status = 'DRAFT' AND COALESCE(q.updated_at, q.created_at) < NOW() - ($1 * INTERVAL '1 day'))
        OR
        (q.status = 'SENT'  AND COALESCE(q.updated_at, q.created_at) < NOW() - ($2 * INTERVAL '1 day'))
      )
      -- Dedup: skip if we already created a followup notification for
      -- this quote in the last 24 hours
      AND NOT EXISTS (
        SELECT 1 FROM user_notifications n
        WHERE n.related_quote_id = q.id
          AND n.notification_type = 'quote_followup'
          AND n.created_at > NOW() - INTERVAL '24 hours'
      )
    ORDER BY q.salesperson_id, days_stale DESC
  `, [STALE_THRESHOLDS.DRAFT, STALE_THRESHOLDS.SENT]);

  return result.rows;
}

/**
 * Fetch recent quote follow-up history (last 5 contacts).
 * Used to give Claude context for the follow-up suggestion.
 */
async function getQuoteHistory(quoteId) {
  const result = await pool.query(`
    SELECT
      qf.contact_method,
      qf.outcome,
      qf.notes,
      qf.created_at
    FROM quote_follow_ups qf
    WHERE qf.quote_id = $1
    ORDER BY qf.created_at DESC
    LIMIT 5
  `, [quoteId]);

  return result.rows;
}

/**
 * Ask Claude Haiku for a short, contextual follow-up suggestion.
 *
 * @param {object} quote - stalled quote row
 * @param {Array}  history - recent activity log entries
 * @returns {string} one-liner follow-up message
 */
async function generateFollowUpMessage(quote, history) {
  try {
    const client = getAnthropic();

    const historyText = history.length
      ? history.map(h => `  - ${h.contact_method} on ${new Date(h.created_at).toLocaleDateString('en-CA')}: ${h.outcome || 'no outcome'}${h.notes ? ` — "${h.notes}"` : ''}`).join('\n')
      : '  (no previous follow-ups)';

    const prompt = `You are a sales assistant for TeleTime, an Ontario appliance/electronics/furniture retailer.

A quote has been sitting idle. Write ONE short, actionable follow-up suggestion (max 120 chars) for the sales rep.

Quote details:
- Quote #: ${quote.quote_number}
- Status: ${quote.status}
- Customer: ${quote.customer_name || 'Unknown'}
- Value: $${((quote.total_cents || 0) / 100).toFixed(2)}
- Days since last activity: ${quote.days_stale}
- Customer phone: ${quote.customer_phone || 'N/A'}
- Customer email: ${quote.customer_email || 'N/A'}

Previous follow-ups:
${historyText}

Reply with ONLY the follow-up suggestion, no quotes or labels.`;

    const response = await client.messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 100,
      messages: [{ role: 'user', content: prompt }],
    });

    return response.content[0]?.text?.trim() || fallbackMessage(quote);
  } catch (err) {
    console.error('[QuoteAlerts] Claude error, using fallback:', err.message);
    return fallbackMessage(quote);
  }
}

/**
 * Static fallback when Claude is unavailable.
 */
function fallbackMessage(quote) {
  if (quote.status === 'DRAFT') {
    return `Draft quote #${quote.quote_number} for ${quote.customer_name || 'customer'} is ${quote.days_stale}d old — review & send?`;
  }
  return `Quote #${quote.quote_number} sent ${quote.days_stale}d ago to ${quote.customer_name || 'customer'} — time to follow up?`;
}

/**
 * Insert a follow-up notification into user_notifications.
 */
async function createFollowUpNotification(quote, message) {
  const result = await pool.query(`
    INSERT INTO user_notifications (
      user_id, notification_type, title, message, icon,
      related_quote_id, action_url, priority
    )
    VALUES ($1, 'quote_followup', $2, $3, 'FollowUp', $4, $5, $6)
    RETURNING id
  `, [
    quote.salesperson_id,
    `Follow up: ${quote.quote_number}`,
    message,
    quote.quote_id,
    `/quotes/${quote.quote_id}`,
    quote.days_stale >= 7 ? 'high' : 'normal',
  ]);

  return result.rows[0];
}

/**
 * Build and send a digest email for one rep.
 *
 * @param {string} repEmail
 * @param {string} repFirstName
 * @param {Array<object>} quotes - stalled quotes for this rep (with .followUpMessage attached)
 */
async function sendDigestEmail(repEmail, repFirstName, quotes) {
  if (!repEmail || quotes.length === 0) return;

  const subject = `TeleTime — ${quotes.length} quote${quotes.length > 1 ? 's' : ''} need${quotes.length === 1 ? 's' : ''} follow-up`;

  const quoteRows = quotes.map(q => `
    <tr>
      <td style="padding:10px 12px;border-bottom:1px solid #e5e7eb;">
        <a href="${process.env.APP_URL || 'https://app.teletime.ca'}/quotes/${q.quote_id}"
           style="color:#4f46e5;font-weight:600;text-decoration:none;">
          ${q.quote_number}
        </a>
      </td>
      <td style="padding:10px 12px;border-bottom:1px solid #e5e7eb;">${q.customer_name || '—'}</td>
      <td style="padding:10px 12px;border-bottom:1px solid #e5e7eb;text-align:right;font-weight:600;color:#10b981;">
        $${((q.total_cents || 0) / 100).toFixed(2)}
      </td>
      <td style="padding:10px 12px;border-bottom:1px solid #e5e7eb;text-align:center;">
        <span style="background:${q.days_stale >= 7 ? '#fef2f2;color:#dc2626' : '#fffbeb;color:#d97706'};
                     padding:2px 8px;border-radius:12px;font-size:12px;font-weight:600;">
          ${q.days_stale}d
        </span>
      </td>
    </tr>
    <tr>
      <td colspan="4" style="padding:4px 12px 12px;border-bottom:1px solid #f3f4f6;font-size:13px;color:#6b7280;">
        💡 ${q.followUpMessage}
      </td>
    </tr>
  `).join('');

  const html = `
    <div style="font-family:Arial,sans-serif;max-width:640px;margin:0 auto;">
      <div style="background:linear-gradient(135deg,#8b5cf6 0%,#6366f1 100%);padding:28px;text-align:center;">
        <h1 style="color:white;margin:0;font-size:22px;">Morning Follow-Up Digest</h1>
      </div>
      <div style="padding:24px;background:#f9fafb;">
        <p style="font-size:15px;color:#374151;">
          Good morning${repFirstName ? ` ${repFirstName}` : ''}! You have
          <strong>${quotes.length}</strong> open quote${quotes.length > 1 ? 's' : ''} that could use attention today.
        </p>
        <table style="width:100%;border-collapse:collapse;margin:16px 0;background:white;border-radius:8px;overflow:hidden;box-shadow:0 1px 3px rgba(0,0,0,.08);">
          <thead>
            <tr style="background:#f9fafb;">
              <th style="padding:10px 12px;text-align:left;font-size:12px;color:#6b7280;text-transform:uppercase;">Quote</th>
              <th style="padding:10px 12px;text-align:left;font-size:12px;color:#6b7280;text-transform:uppercase;">Customer</th>
              <th style="padding:10px 12px;text-align:right;font-size:12px;color:#6b7280;text-transform:uppercase;">Value</th>
              <th style="padding:10px 12px;text-align:center;font-size:12px;color:#6b7280;text-transform:uppercase;">Idle</th>
            </tr>
          </thead>
          <tbody>
            ${quoteRows}
          </tbody>
        </table>
        <p style="text-align:center;margin-top:20px;">
          <a href="${process.env.APP_URL || 'https://app.teletime.ca'}/quotes"
             style="display:inline-block;padding:10px 24px;background:#4f46e5;color:white;border-radius:6px;text-decoration:none;font-weight:600;">
            View All Quotes
          </a>
        </p>
      </div>
      <div style="padding:16px;text-align:center;color:#9ca3af;font-size:11px;">
        TeleTime Quotation System &bull; Manage digest in Settings → Notifications
      </div>
    </div>
  `;

  const result = await EmailService.sendEmail(repEmail, subject, html);

  // Audit trail — log with first quote id
  if (quotes.length > 0) {
    await EmailService.logNotification(
      quotes[0].quote_id,
      'QUOTE_FOLLOWUP_DIGEST',
      repEmail,
      subject,
      result.success ? 'sent' : 'failed',
      result.error || null
    );
  }

  return result;
}

// ── Orchestrator ─────────────────────────────────────────────────

/**
 * Main entry point — called daily by the cron job.
 *
 * 1. Fetch stalled quotes
 * 2. Generate follow-up messages (in parallel, batched by 5)
 * 3. Create in-app notifications
 * 4. Send digest emails to reps who opted in
 *
 * @returns {{ notificationsCreated: number, digestsSent: number }}
 */
async function runDailyQuoteAlerts() {
  const stalledQuotes = await getStalledQuotes();

  if (stalledQuotes.length === 0) {
    return { notificationsCreated: 0, digestsSent: 0 };
  }

  // Generate follow-up messages in batches of 5
  const BATCH_SIZE = 5;
  for (let i = 0; i < stalledQuotes.length; i += BATCH_SIZE) {
    const batch = stalledQuotes.slice(i, i + BATCH_SIZE);
    await Promise.all(
      batch.map(async (quote) => {
        const history = await getQuoteHistory(quote.quote_id);
        quote.followUpMessage = await generateFollowUpMessage(quote, history);
      })
    );
  }

  // Create in-app notifications
  let notificationsCreated = 0;
  for (const quote of stalledQuotes) {
    try {
      await createFollowUpNotification(quote, quote.followUpMessage);
      notificationsCreated++;
    } catch (err) {
      console.error(`[QuoteAlerts] Failed to create notification for quote ${quote.quote_id}:`, err.message);
    }
  }

  // Group by salesperson for digest emails
  const byRep = {};
  for (const q of stalledQuotes) {
    if (!byRep[q.salesperson_id]) {
      byRep[q.salesperson_id] = {
        repEmail: q.rep_email,
        repFirstName: q.rep_first_name,
        quotes: [],
      };
    }
    byRep[q.salesperson_id].quotes.push(q);
  }

  // Send digest emails only to reps who opted in
  let digestsSent = 0;
  for (const repId of Object.keys(byRep)) {
    try {
      // Check notification_preferences
      const prefResult = await pool.query(
        `SELECT daily_digest, email_quote_followup
         FROM notification_preferences
         WHERE user_id = $1`,
        [repId]
      );

      const prefs = prefResult.rows[0];
      // Send if: no preference row (default on), or both flags are true
      const shouldSendDigest =
        !prefs || (prefs.daily_digest !== false && prefs.email_quote_followup !== false);

      if (shouldSendDigest) {
        const rep = byRep[repId];
        await sendDigestEmail(rep.repEmail, rep.repFirstName, rep.quotes);
        digestsSent++;
      }
    } catch (err) {
      console.error(`[QuoteAlerts] Digest email failed for rep ${repId}:`, err.message);
    }
  }

  return { notificationsCreated, digestsSent };
}

// ── Exports ──────────────────────────────────────────────────────

module.exports = {
  getStalledQuotes,
  getQuoteHistory,
  generateFollowUpMessage,
  createFollowUpNotification,
  sendDigestEmail,
  runDailyQuoteAlerts,
};
