/**
 * Auto Invoice Service
 * Automatically generates invoices based on configured triggers
 * Supports: quote acceptance, order creation, recurring billing
 */

const { ApiError } = require('../middleware/errorHandler');

class AutoInvoiceService {
  constructor(pool, invoiceService) {
    this.pool = pool;
    this.invoiceService = invoiceService;
  }

  /**
   * Get auto-invoice settings
   */
  async getSettings() {
    try {
      const result = await this.pool.query(`
        SELECT * FROM auto_invoice_settings
        WHERE id = 1
      `);

      if (result.rows.length === 0) {
        // Return defaults if no settings exist
        return {
          enabled: false,
          triggerOnQuoteWon: true,
          triggerOnOrderCreated: false,
          triggerOnOrderShipped: false,
          defaultPaymentTermsDays: 30,
          autoSendEmail: false,
          includePaymentLink: false,
          notifyOnGeneration: true
        };
      }

      return result.rows[0];
    } catch (error) {
      // Table might not exist yet, return defaults
      if (error.code === '42P01') {
        return {
          enabled: false,
          triggerOnQuoteWon: true,
          triggerOnOrderCreated: false,
          triggerOnOrderShipped: false,
          defaultPaymentTermsDays: 30,
          autoSendEmail: false,
          includePaymentLink: false,
          notifyOnGeneration: true
        };
      }
      throw error;
    }
  }

  /**
   * Update auto-invoice settings
   */
  async updateSettings(settings) {
    // Ensure table exists
    await this.ensureSettingsTable();

    const result = await this.pool.query(`
      INSERT INTO auto_invoice_settings (
        id,
        enabled,
        trigger_on_quote_won,
        trigger_on_order_created,
        trigger_on_order_shipped,
        default_payment_terms_days,
        auto_send_email,
        include_payment_link,
        notify_on_generation,
        updated_at
      ) VALUES (1, $1, $2, $3, $4, $5, $6, $7, $8, CURRENT_TIMESTAMP)
      ON CONFLICT (id) DO UPDATE SET
        enabled = EXCLUDED.enabled,
        trigger_on_quote_won = EXCLUDED.trigger_on_quote_won,
        trigger_on_order_created = EXCLUDED.trigger_on_order_created,
        trigger_on_order_shipped = EXCLUDED.trigger_on_order_shipped,
        default_payment_terms_days = EXCLUDED.default_payment_terms_days,
        auto_send_email = EXCLUDED.auto_send_email,
        include_payment_link = EXCLUDED.include_payment_link,
        notify_on_generation = EXCLUDED.notify_on_generation,
        updated_at = CURRENT_TIMESTAMP
      RETURNING *
    `, [
      settings.enabled ?? false,
      settings.triggerOnQuoteWon ?? true,
      settings.triggerOnOrderCreated ?? false,
      settings.triggerOnOrderShipped ?? false,
      settings.defaultPaymentTermsDays ?? 30,
      settings.autoSendEmail ?? false,
      settings.includePaymentLink ?? false,
      settings.notifyOnGeneration ?? true
    ]);

    return this.formatSettings(result.rows[0]);
  }

  /**
   * Handle quote won trigger
   * Called when a quote status changes to WON
   */
  async onQuoteWon(quoteId, options = {}) {
    const settings = await this.getSettings();

    if (!settings.enabled || !settings.triggerOnQuoteWon) {
      return { triggered: false, reason: 'Auto-invoice disabled for quote won trigger' };
    }

    // Check if invoice already exists for this quote
    const existingInvoice = await this.pool.query(`
      SELECT id FROM invoices WHERE quotation_id = $1
    `, [quoteId]);

    if (existingInvoice.rows.length > 0) {
      return {
        triggered: false,
        reason: 'Invoice already exists for this quote',
        existingInvoiceId: existingInvoice.rows[0].id
      };
    }

    // Generate invoice
    try {
      const dueDate = new Date();
      dueDate.setDate(dueDate.getDate() + settings.defaultPaymentTermsDays);

      const invoice = await this.invoiceService.createFromQuote(quoteId, {
        dueDate: dueDate.toISOString().split('T')[0],
        paymentTerms: `Net ${settings.defaultPaymentTermsDays}`,
        notes: 'Auto-generated from accepted quote',
        createdBy: 'auto-invoice'
      });

      // Log the auto-generation
      await this.logAutoInvoice({
        invoiceId: invoice.id,
        trigger: 'quote_won',
        sourceId: quoteId,
        sourceType: 'quote'
      });

      // Auto-send if configured
      if (settings.autoSendEmail && invoice.id) {
        try {
          await this.invoiceService.sendInvoice(invoice.id, {
            includePaymentLink: settings.includePaymentLink
          });
        } catch (sendError) {
          console.error('Auto-send invoice failed:', sendError);
          // Don't fail the whole operation if send fails
        }
      }

      return {
        triggered: true,
        invoice,
        autoSent: settings.autoSendEmail
      };
    } catch (error) {
      console.error('Auto-invoice generation failed:', error);

      // Log the failure
      await this.logAutoInvoice({
        trigger: 'quote_won',
        sourceId: quoteId,
        sourceType: 'quote',
        error: error.message
      });

      throw error;
    }
  }

  /**
   * Handle order created trigger
   */
  async onOrderCreated(orderId, options = {}) {
    const settings = await this.getSettings();

    if (!settings.enabled || !settings.triggerOnOrderCreated) {
      return { triggered: false, reason: 'Auto-invoice disabled for order created trigger' };
    }

    // Check if invoice already exists for this order
    const existingInvoice = await this.pool.query(`
      SELECT id FROM invoices WHERE order_id = $1
    `, [orderId]);

    if (existingInvoice.rows.length > 0) {
      return {
        triggered: false,
        reason: 'Invoice already exists for this order',
        existingInvoiceId: existingInvoice.rows[0].id
      };
    }

    try {
      const dueDate = new Date();
      dueDate.setDate(dueDate.getDate() + settings.defaultPaymentTermsDays);

      const invoice = await this.invoiceService.createFromOrder(orderId, {
        dueDate: dueDate.toISOString().split('T')[0],
        paymentTerms: `Net ${settings.defaultPaymentTermsDays}`,
        notes: 'Auto-generated from order',
        createdBy: 'auto-invoice'
      });

      await this.logAutoInvoice({
        invoiceId: invoice.id,
        trigger: 'order_created',
        sourceId: orderId,
        sourceType: 'order'
      });

      if (settings.autoSendEmail && invoice.id) {
        try {
          await this.invoiceService.sendInvoice(invoice.id, {
            includePaymentLink: settings.includePaymentLink
          });
        } catch (sendError) {
          console.error('Auto-send invoice failed:', sendError);
        }
      }

      return {
        triggered: true,
        invoice,
        autoSent: settings.autoSendEmail
      };
    } catch (error) {
      console.error('Auto-invoice generation failed:', error);

      await this.logAutoInvoice({
        trigger: 'order_created',
        sourceId: orderId,
        sourceType: 'order',
        error: error.message
      });

      throw error;
    }
  }

  /**
   * Get recent auto-generated invoices
   */
  async getRecentAutoInvoices(limit = 20) {
    try {
      const result = await this.pool.query(`
        SELECT
          ail.id,
          ail.invoice_id,
          ail.trigger_type,
          ail.source_type,
          ail.source_id,
          ail.error_message,
          ail.created_at,
          i.invoice_number,
          i.total_cents,
          i.status as invoice_status,
          c.name as customer_name
        FROM auto_invoice_log ail
        LEFT JOIN invoices i ON ail.invoice_id = i.id
        LEFT JOIN customers c ON i.customer_id = c.id
        ORDER BY ail.created_at DESC
        LIMIT $1
      `, [limit]);

      return result.rows;
    } catch (error) {
      // Table might not exist
      if (error.code === '42P01') {
        return [];
      }
      throw error;
    }
  }

  /**
   * Get auto-invoice statistics
   */
  async getStatistics(days = 30) {
    try {
      const result = await this.pool.query(`
        SELECT
          COUNT(*) FILTER (WHERE error_message IS NULL) as successful_count,
          COUNT(*) FILTER (WHERE error_message IS NOT NULL) as failed_count,
          COUNT(*) FILTER (WHERE trigger_type = 'quote_won') as quote_triggered_count,
          COUNT(*) FILTER (WHERE trigger_type = 'order_created') as order_triggered_count,
          COALESCE(SUM(i.total_cents) FILTER (WHERE ail.error_message IS NULL), 0) as total_invoiced_cents
        FROM auto_invoice_log ail
        LEFT JOIN invoices i ON ail.invoice_id = i.id
        WHERE ail.created_at > NOW() - INTERVAL '${days} days'
      `);

      const stats = result.rows[0];
      return {
        successfulCount: parseInt(stats.successful_count) || 0,
        failedCount: parseInt(stats.failed_count) || 0,
        quoteTriggeredCount: parseInt(stats.quote_triggered_count) || 0,
        orderTriggeredCount: parseInt(stats.order_triggered_count) || 0,
        totalInvoicedCents: parseInt(stats.total_invoiced_cents) || 0,
        periodDays: days
      };
    } catch (error) {
      if (error.code === '42P01') {
        return {
          successfulCount: 0,
          failedCount: 0,
          quoteTriggeredCount: 0,
          orderTriggeredCount: 0,
          totalInvoicedCents: 0,
          periodDays: days
        };
      }
      throw error;
    }
  }

  /**
   * Manually trigger invoice generation for a quote
   */
  async generateFromQuote(quoteId, options = {}) {
    // Check if invoice already exists
    const existingInvoice = await this.pool.query(`
      SELECT id, invoice_number FROM invoices WHERE quotation_id = $1
    `, [quoteId]);

    if (existingInvoice.rows.length > 0) {
      throw ApiError.conflict('Invoice already exists for this quote', {
        existingInvoiceId: existingInvoice.rows[0].id,
        existingInvoiceNumber: existingInvoice.rows[0].invoice_number
      });
    }

    const settings = await this.getSettings();
    const dueDate = new Date();
    dueDate.setDate(dueDate.getDate() + (options.paymentTermsDays || settings.defaultPaymentTermsDays));

    const invoice = await this.invoiceService.createFromQuote(quoteId, {
      dueDate: options.dueDate || dueDate.toISOString().split('T')[0],
      paymentTerms: options.paymentTerms || `Net ${settings.defaultPaymentTermsDays}`,
      notes: options.notes || 'Generated from quote',
      createdBy: options.createdBy || 'manual'
    });

    await this.logAutoInvoice({
      invoiceId: invoice.id,
      trigger: 'manual',
      sourceId: quoteId,
      sourceType: 'quote'
    });

    return invoice;
  }

  /**
   * Log auto-invoice generation
   */
  async logAutoInvoice({ invoiceId, trigger, sourceId, sourceType, error }) {
    await this.ensureLogTable();

    await this.pool.query(`
      INSERT INTO auto_invoice_log (
        invoice_id,
        trigger_type,
        source_type,
        source_id,
        error_message,
        created_at
      ) VALUES ($1, $2, $3, $4, $5, CURRENT_TIMESTAMP)
    `, [invoiceId || null, trigger, sourceType, sourceId, error || null]);
  }

  /**
   * Ensure settings table exists
   */
  async ensureSettingsTable() {
    await this.pool.query(`
      CREATE TABLE IF NOT EXISTS auto_invoice_settings (
        id INTEGER PRIMARY KEY DEFAULT 1,
        enabled BOOLEAN DEFAULT false,
        trigger_on_quote_won BOOLEAN DEFAULT true,
        trigger_on_order_created BOOLEAN DEFAULT false,
        trigger_on_order_shipped BOOLEAN DEFAULT false,
        default_payment_terms_days INTEGER DEFAULT 30,
        auto_send_email BOOLEAN DEFAULT false,
        include_payment_link BOOLEAN DEFAULT false,
        notify_on_generation BOOLEAN DEFAULT true,
        created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
        CONSTRAINT single_row CHECK (id = 1)
      )
    `);
  }

  /**
   * Ensure log table exists
   */
  async ensureLogTable() {
    await this.pool.query(`
      CREATE TABLE IF NOT EXISTS auto_invoice_log (
        id SERIAL PRIMARY KEY,
        invoice_id INTEGER REFERENCES invoices(id),
        trigger_type VARCHAR(50) NOT NULL,
        source_type VARCHAR(50) NOT NULL,
        source_id INTEGER NOT NULL,
        error_message TEXT,
        created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // Create index if not exists
    await this.pool.query(`
      CREATE INDEX IF NOT EXISTS idx_auto_invoice_log_created
      ON auto_invoice_log(created_at DESC)
    `);
  }

  /**
   * Format settings from database to API response
   */
  formatSettings(row) {
    if (!row) return null;
    return {
      enabled: row.enabled,
      triggerOnQuoteWon: row.trigger_on_quote_won,
      triggerOnOrderCreated: row.trigger_on_order_created,
      triggerOnOrderShipped: row.trigger_on_order_shipped,
      defaultPaymentTermsDays: row.default_payment_terms_days,
      autoSendEmail: row.auto_send_email,
      includePaymentLink: row.include_payment_link,
      notifyOnGeneration: row.notify_on_generation,
      updatedAt: row.updated_at
    };
  }
}

module.exports = AutoInvoiceService;
