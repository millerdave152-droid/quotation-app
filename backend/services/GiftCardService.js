/**
 * TeleTime - Gift Card Service
 * Purchase, balance check, reload, expiry alerts, and reminder emails.
 * Extends the store_credits table with credit_type = 'gift_card'.
 */

const crypto = require('crypto');
const { ApiError } = require('../middleware/errorHandler');

class GiftCardService {
  constructor(pool, opts = {}) {
    this.pool = pool;
    this.emailService = opts.emailService || null;
  }

  /**
   * Generate a unique GC-XXXXX code
   */
  async _generateCode(client) {
    const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
    for (let attempt = 0; attempt < 10; attempt++) {
      let code = 'GC-';
      for (let i = 0; i < 5; i++) {
        code += chars.charAt(crypto.randomInt(chars.length));
      }
      const exists = await client.query('SELECT 1 FROM store_credits WHERE code = $1', [code]);
      if (exists.rows.length === 0) return code;
    }
    throw ApiError.create(500, 'Failed to generate unique gift card code');
  }

  /**
   * Purchase a gift card.
   * @param {Object} data - { amountCents, recipientName, recipientEmail, purchaserCustomerId,
   *   giftMessage, deliveryMethod, sendDate, expiryDate }
   * @param {number} userId - Performing user
   */
  async purchase(data, userId) {
    const {
      amountCents, recipientName, recipientEmail,
      purchaserCustomerId, customerId,
      giftMessage, deliveryMethod = 'email',
      sendDate, expiryDate,
    } = data;

    if (!amountCents || amountCents <= 0) {
      throw ApiError.badRequest('amountCents must be positive');
    }

    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');

      const code = await this._generateCode(client);

      const result = await client.query(
        `INSERT INTO store_credits (
          customer_id, code, credit_type, original_amount, current_balance,
          source_type, issued_by, expiry_date,
          recipient_name, recipient_email,
          delivery_method, purchaser_customer_id, gift_message,
          send_date, needs_printing, notes
        ) VALUES ($1, $2, 'gift_card', $3, $3, 'gift_purchase', $4, $5,
                  $6, $7, $8, $9, $10, $11, $12, $13)
        RETURNING *`,
        [
          customerId || null, code, amountCents, userId, expiryDate || null,
          recipientName || null, recipientEmail || null,
          deliveryMethod, purchaserCustomerId || null, giftMessage || null,
          sendDate || null, deliveryMethod === 'print',
          giftMessage ? `Gift card: ${giftMessage.substring(0, 100)}` : 'Gift card purchase',
        ]
      );

      const card = result.rows[0];

      await client.query(
        `INSERT INTO store_credit_transactions (store_credit_id, amount_cents, transaction_type, balance_after, notes, performed_by)
         VALUES ($1, $2, 'issue', $3, 'Gift card purchased', $4)`,
        [card.id, amountCents, amountCents, userId]
      );

      await client.query('COMMIT');

      // Queue email delivery if method is email and no future send_date
      if (deliveryMethod === 'email' && recipientEmail && !sendDate) {
        this._sendGiftCardEmail(card).catch(() => {});
      }

      return {
        id: card.id,
        code: card.code,
        amount: amountCents / 100,
        amountCents,
        recipientName: card.recipient_name,
        recipientEmail: card.recipient_email,
        deliveryMethod: card.delivery_method,
        sendDate: card.send_date,
        needsPrinting: card.needs_printing,
        expiryDate: card.expiry_date,
        status: card.status,
      };
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
  }

  /**
   * Public balance check — no auth required.
   */
  async checkBalance(code) {
    const result = await this.pool.query(
      `SELECT id, code, credit_type, current_balance, original_amount, status, expiry_date
       FROM store_credits WHERE code = $1 AND credit_type = 'gift_card'`,
      [code.toUpperCase()]
    );

    if (result.rows.length === 0) {
      throw ApiError.notFound('Gift card');
    }

    const card = result.rows[0];

    // Auto-expire
    if (card.expiry_date && new Date(card.expiry_date) < new Date() && card.status === 'active') {
      await this.pool.query(
        "UPDATE store_credits SET status = 'expired', updated_at = NOW() WHERE id = $1",
        [card.id]
      );
      card.status = 'expired';
    }

    return {
      code: card.code,
      balance: card.current_balance / 100,
      balanceCents: card.current_balance,
      originalAmount: card.original_amount / 100,
      originalAmountCents: card.original_amount,
      status: card.status,
      expiryDate: card.expiry_date,
    };
  }

  /**
   * Reload a gift card with additional funds.
   */
  async reload(code, amountCents, userId) {
    if (!amountCents || amountCents <= 0) {
      throw ApiError.badRequest('amountCents must be positive');
    }

    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');

      const result = await client.query(
        "SELECT * FROM store_credits WHERE code = $1 AND credit_type = 'gift_card' FOR UPDATE",
        [code.toUpperCase()]
      );

      if (result.rows.length === 0) {
        await client.query('ROLLBACK');
        throw ApiError.notFound('Gift card');
      }

      const card = result.rows[0];

      if (card.status === 'cancelled') {
        await client.query('ROLLBACK');
        throw ApiError.badRequest('Cannot reload a cancelled gift card');
      }

      if (card.status === 'expired') {
        await client.query('ROLLBACK');
        throw ApiError.badRequest('Cannot reload an expired gift card');
      }

      const newBalance = card.current_balance + amountCents;
      const newOriginal = card.original_amount + amountCents;

      await client.query(
        `UPDATE store_credits
         SET current_balance = $1, original_amount = $2, status = 'active', updated_at = NOW()
         WHERE id = $3`,
        [newBalance, newOriginal, card.id]
      );

      await client.query(
        `INSERT INTO store_credit_transactions (store_credit_id, amount_cents, transaction_type, balance_after, notes, performed_by)
         VALUES ($1, $2, 'reload', $3, 'Gift card reloaded', $4)`,
        [card.id, amountCents, newBalance, userId]
      );

      await client.query('COMMIT');

      return {
        code: card.code,
        reloadedAmount: amountCents / 100,
        reloadedAmountCents: amountCents,
        newBalance: newBalance / 100,
        newBalanceCents: newBalance,
        status: 'active',
      };
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
  }

  /**
   * Get gift cards expiring within N days.
   */
  async getExpiring(days = 30) {
    const result = await this.pool.query(
      `SELECT sc.*, c.name AS customer_name, c.email AS customer_email
       FROM store_credits sc
       LEFT JOIN customers c ON sc.customer_id = c.id
       WHERE sc.credit_type = 'gift_card'
         AND sc.status = 'active'
         AND sc.expiry_date IS NOT NULL
         AND sc.expiry_date BETWEEN CURRENT_DATE AND CURRENT_DATE + $1 * INTERVAL '1 day'
       ORDER BY sc.expiry_date ASC`,
      [days]
    );

    return result.rows.map(row => ({
      id: row.id,
      code: row.code,
      balanceCents: row.current_balance,
      balance: row.current_balance / 100,
      expiryDate: row.expiry_date,
      daysUntilExpiry: Math.ceil((new Date(row.expiry_date) - new Date()) / (1000 * 60 * 60 * 24)),
      customerName: row.customer_name,
      customerEmail: row.customer_email,
      recipientName: row.recipient_name,
      recipientEmail: row.recipient_email,
    }));
  }

  /**
   * Send a balance reminder email for a gift card.
   */
  async sendReminder(code, userId) {
    const result = await this.pool.query(
      `SELECT sc.*, c.email AS customer_email, c.name AS customer_name
       FROM store_credits sc
       LEFT JOIN customers c ON sc.customer_id = c.id
       WHERE sc.code = $1 AND sc.credit_type = 'gift_card'`,
      [code.toUpperCase()]
    );

    if (result.rows.length === 0) {
      throw ApiError.notFound('Gift card');
    }

    const card = result.rows[0];
    const recipientEmail = card.recipient_email || card.customer_email;

    if (!recipientEmail) {
      throw ApiError.badRequest('No email address available for this gift card');
    }

    if (this.emailService) {
      await this.emailService.sendEmail({
        to: recipientEmail,
        subject: `Your TeleTime Gift Card Balance — ${card.code}`,
        html: this._buildReminderHtml(card),
      });
    }

    return {
      sent: true,
      email: recipientEmail,
      code: card.code,
      balanceCents: card.current_balance,
      balance: card.current_balance / 100,
    };
  }

  // ---- Internal helpers ----

  async _sendGiftCardEmail(card) {
    if (!this.emailService || !card.recipient_email) return;
    try {
      await this.emailService.sendEmail({
        to: card.recipient_email,
        subject: 'You received a TeleTime Gift Card!',
        html: this._buildGiftCardHtml(card),
      });
      await this.pool.query(
        'UPDATE store_credits SET email_sent = TRUE, email_sent_at = NOW() WHERE id = $1',
        [card.id]
      );
    } catch (err) {
      console.error('Failed to send gift card email:', err.message);
    }
  }

  _buildGiftCardHtml(card) {
    const amount = (card.original_amount / 100).toFixed(2);
    return `
      <div style="font-family:Arial,sans-serif;max-width:500px;margin:0 auto;padding:20px;">
        <h2 style="color:#4F46E5;">You received a TeleTime Gift Card!</h2>
        ${card.recipient_name ? `<p>Hi ${card.recipient_name},</p>` : ''}
        ${card.gift_message ? `<p style="font-style:italic;">"${card.gift_message}"</p>` : ''}
        <div style="background:#F3F4F6;border-radius:8px;padding:20px;text-align:center;margin:20px 0;">
          <p style="font-size:14px;color:#6B7280;margin:0;">Gift Card Code</p>
          <p style="font-size:28px;font-weight:bold;color:#111827;margin:8px 0;letter-spacing:2px;">${card.code}</p>
          <p style="font-size:24px;color:#059669;margin:0;">$${amount}</p>
        </div>
        ${card.expiry_date ? `<p style="color:#6B7280;font-size:12px;">Expires: ${new Date(card.expiry_date).toLocaleDateString()}</p>` : ''}
        <p style="color:#6B7280;font-size:12px;">Present this code at checkout to redeem.</p>
      </div>`;
  }

  _buildReminderHtml(card) {
    const balance = (card.current_balance / 100).toFixed(2);
    return `
      <div style="font-family:Arial,sans-serif;max-width:500px;margin:0 auto;padding:20px;">
        <h2 style="color:#4F46E5;">Your TeleTime Gift Card Balance</h2>
        <div style="background:#F3F4F6;border-radius:8px;padding:20px;text-align:center;margin:20px 0;">
          <p style="font-size:14px;color:#6B7280;margin:0;">Card: ${card.code}</p>
          <p style="font-size:28px;font-weight:bold;color:#059669;margin:8px 0;">$${balance}</p>
        </div>
        ${card.expiry_date ? `<p style="color:#EF4444;font-size:13px;">Expires: ${new Date(card.expiry_date).toLocaleDateString()}</p>` : ''}
        <p style="color:#6B7280;font-size:12px;">Visit us or shop online to use your gift card.</p>
      </div>`;
  }
}

module.exports = GiftCardService;
