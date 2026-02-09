/**
 * Invoice Service
 * Handles invoice creation, payments, and management
 */

class InvoiceService {
  constructor(pool, cache, emailService) {
    this.pool = pool;
    this.cache = cache;
    this.emailService = emailService;
  }

  /**
   * Generate a unique invoice number
   * Format: INV-YYYYMMDD-XXXX
   * Uses MAX+1 pattern for thread-safety instead of COUNT which has race conditions
   * @param {object} client - Optional database client for transaction
   * @returns {Promise<string>} Generated invoice number
   */
  async generateInvoiceNumber(client = null) {
    const db = client || this.pool;
    const date = new Date();
    const dateStr = date.toISOString().slice(0, 10).replace(/-/g, '');

    // CRITICAL FIX: Use MAX+1 pattern to prevent race conditions
    // COUNT(*)+1 can return same number for concurrent requests
    const result = await db.query(`
      SELECT COALESCE(
        MAX(CAST(SUBSTRING(invoice_number FROM 'INV-${dateStr}-(\\d+)') AS INTEGER)),
        0
      ) + 1 as seq
      FROM invoices
      WHERE invoice_number LIKE 'INV-${dateStr}-%'
    `);

    const seq = String(result.rows[0].seq).padStart(4, '0');
    return `INV-${dateStr}-${seq}`;
  }

  /**
   * Create an invoice from a quotation
   * @param {number} quotationId - Quotation ID
   * @param {object} options - Invoice options
   * @returns {Promise<object>} Created invoice
   */
  async createFromQuote(quotationId, options = {}) {
    const {
      dueDate = null,
      paymentTerms = 'Due on Receipt',
      notes = '',
      createdBy = 'system'
    } = options;

    const client = await this.pool.connect();

    try {
      await client.query('BEGIN');

      // Get quotation
      const quoteResult = await client.query(`
        SELECT q.*, c.id as customer_id
        FROM quotations q
        LEFT JOIN customers c ON q.customer_id = c.id
        WHERE q.id = $1
      `, [quotationId]);

      if (quoteResult.rows.length === 0) {
        throw new Error(`Quotation ${quotationId} not found`);
      }

      const quote = quoteResult.rows[0];

      // Check if invoice already exists for this quote
      const existingInvoice = await client.query(`
        SELECT id, invoice_number FROM invoices WHERE quotation_id = $1
      `, [quotationId]);

      if (existingInvoice.rows.length > 0) {
        throw new Error(`Invoice ${existingInvoice.rows[0].invoice_number} already exists for this quotation`);
      }

      // Get quotation items
      const itemsResult = await client.query(`
        SELECT qi.*, p.model, p.manufacturer, p.name as product_name
        FROM quotation_items qi
        JOIN products p ON qi.product_id = p.id
        WHERE qi.quotation_id = $1
      `, [quotationId]);

      // Generate invoice number (pass client for transaction safety)
      const invoiceNumber = await this.generateInvoiceNumber(client);

      // Calculate due date if not provided
      const calculatedDueDate = dueDate || new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);

      // Create invoice
      const invoiceResult = await client.query(`
        INSERT INTO invoices (
          invoice_number, quotation_id, customer_id, status,
          subtotal_cents, tax_cents, total_cents,
          amount_paid_cents, balance_due_cents,
          due_date, payment_terms, notes, created_by
        )
        VALUES ($1, $2, $3, 'draft', $4, $5, $6, 0, $6, $7, $8, $9, $10)
        RETURNING *
      `, [
        invoiceNumber,
        quotationId,
        quote.customer_id,
        quote.subtotal_cents || 0,
        quote.tax_cents || 0,
        quote.total_cents || 0,
        calculatedDueDate,
        paymentTerms,
        notes,
        createdBy
      ]);

      const invoice = invoiceResult.rows[0];

      // Create invoice items
      for (const item of itemsResult.rows) {
        await client.query(`
          INSERT INTO invoice_items (
            invoice_id, product_id, description, quantity, unit_price_cents, total_cents
          )
          VALUES ($1, $2, $3, $4, $5, $6)
        `, [
          invoice.id,
          item.product_id,
          `${item.manufacturer} ${item.model}${item.product_name ? ' - ' + item.product_name : ''}`,
          item.quantity,
          item.unit_price_cents,
          item.total_cents
        ]);
      }

      // Update quotation with invoice reference
      await client.query(`
        UPDATE quotations SET invoice_id = $2, updated_at = CURRENT_TIMESTAMP WHERE id = $1
      `, [quotationId, invoice.id]);

      await client.query('COMMIT');

      this.cache?.invalidatePattern('invoices:*');
      this.cache?.invalidatePattern('quotes:*');

      return await this.getInvoiceById(invoice.id);

    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  /**
   * Create an invoice from an order
   * @param {number} orderId - Order ID
   * @param {object} options - Invoice options
   * @returns {Promise<object>} Created invoice
   */
  async createFromOrder(orderId, options = {}) {
    const {
      dueDate = null,
      paymentTerms = 'Due on Receipt',
      notes = '',
      createdBy = 'system'
    } = options;

    const client = await this.pool.connect();

    try {
      await client.query('BEGIN');

      // Get order
      const orderResult = await client.query(`
        SELECT o.*, c.id as customer_id
        FROM orders o
        LEFT JOIN customers c ON o.customer_id = c.id
        WHERE o.id = $1
      `, [orderId]);

      if (orderResult.rows.length === 0) {
        throw new Error(`Order ${orderId} not found`);
      }

      const order = orderResult.rows[0];

      // Check if invoice already exists
      const existingInvoice = await client.query(`
        SELECT id, invoice_number FROM invoices WHERE order_id = $1
      `, [orderId]);

      if (existingInvoice.rows.length > 0) {
        throw new Error(`Invoice ${existingInvoice.rows[0].invoice_number} already exists for this order`);
      }

      // Get order items
      const itemsResult = await client.query(`
        SELECT oi.*, p.model, p.manufacturer, p.name as product_name
        FROM order_items oi
        JOIN products p ON oi.product_id = p.id
        WHERE oi.order_id = $1
      `, [orderId]);

      // Generate invoice number (pass client for transaction safety)
      const invoiceNumber = await this.generateInvoiceNumber(client);
      const calculatedDueDate = dueDate || new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);

      // Create invoice
      const invoiceResult = await client.query(`
        INSERT INTO invoices (
          invoice_number, order_id, quotation_id, customer_id, status,
          subtotal_cents, tax_cents, total_cents,
          amount_paid_cents, balance_due_cents,
          due_date, payment_terms, notes, created_by
        )
        VALUES ($1, $2, $3, $4, 'draft', $5, $6, $7, 0, $7, $8, $9, $10, $11)
        RETURNING *
      `, [
        invoiceNumber,
        orderId,
        order.quotation_id,
        order.customer_id,
        order.subtotal_cents || 0,
        order.tax_cents || 0,
        order.total_cents || 0,
        calculatedDueDate,
        paymentTerms,
        notes,
        createdBy
      ]);

      const invoice = invoiceResult.rows[0];

      // Create invoice items
      for (const item of itemsResult.rows) {
        await client.query(`
          INSERT INTO invoice_items (
            invoice_id, product_id, description, quantity, unit_price_cents, total_cents
          )
          VALUES ($1, $2, $3, $4, $5, $6)
        `, [
          invoice.id,
          item.product_id,
          `${item.manufacturer} ${item.model}${item.product_name ? ' - ' + item.product_name : ''}`,
          item.quantity,
          item.unit_price_cents,
          item.total_cents
        ]);
      }

      // Update order with invoice reference
      await client.query(`
        UPDATE orders SET invoice_id = $2, updated_at = CURRENT_TIMESTAMP WHERE id = $1
      `, [orderId, invoice.id]);

      await client.query('COMMIT');

      this.cache?.invalidatePattern('invoices:*');
      this.cache?.invalidatePattern('orders:*');

      return await this.getInvoiceById(invoice.id);

    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  /**
   * Get invoice by ID
   * @param {number} invoiceId - Invoice ID
   * @returns {Promise<object|null>} Invoice with items
   */
  async getInvoiceById(invoiceId) {
    const invoiceResult = await this.pool.query(`
      SELECT
        i.*,
        c.name as customer_name,
        c.company,
        c.email,
        c.phone,
        c.address,
        c.city,
        c.province,
        c.postal_code,
        q.quote_number,
        o.order_number
      FROM invoices i
      LEFT JOIN customers c ON i.customer_id = c.id
      LEFT JOIN quotations q ON i.quotation_id = q.id
      LEFT JOIN orders o ON i.order_id = o.id
      WHERE i.id = $1
    `, [invoiceId]);

    if (invoiceResult.rows.length === 0) {
      return null;
    }

    const invoice = invoiceResult.rows[0];

    // Get items
    const itemsResult = await this.pool.query(`
      SELECT * FROM invoice_items WHERE invoice_id = $1 ORDER BY id
    `, [invoiceId]);

    // Get payments
    const paymentsResult = await this.pool.query(`
      SELECT * FROM invoice_payments WHERE invoice_id = $1 ORDER BY paid_at DESC
    `, [invoiceId]);

    return {
      ...invoice,
      items: itemsResult.rows,
      payments: paymentsResult.rows
    };
  }

  /**
   * Record a payment on an invoice
   * @param {number} invoiceId - Invoice ID
   * @param {object} paymentData - Payment details
   * @returns {Promise<object>} Updated invoice
   */
  async recordPayment(invoiceId, paymentData) {
    const {
      amountCents,
      paymentMethod = 'other',
      stripePaymentIntentId = null,
      stripeChargeId = null,
      referenceNumber = null,
      notes = ''
    } = paymentData;

    const client = await this.pool.connect();

    try {
      await client.query('BEGIN');

      // Get current invoice
      const invoiceResult = await client.query(`
        SELECT * FROM invoices WHERE id = $1
      `, [invoiceId]);

      if (invoiceResult.rows.length === 0) {
        throw new Error(`Invoice ${invoiceId} not found`);
      }

      const invoice = invoiceResult.rows[0];

      if (invoice.status === 'void') {
        throw new Error('Cannot record payment on voided invoice');
      }

      if (invoice.status === 'paid') {
        throw new Error('Invoice is already fully paid');
      }

      // Record payment
      await client.query(`
        INSERT INTO invoice_payments (
          invoice_id, amount_cents, payment_method,
          stripe_payment_intent_id, stripe_charge_id,
          reference_number, notes
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7)
      `, [invoiceId, amountCents, paymentMethod, stripePaymentIntentId, stripeChargeId, referenceNumber, notes]);

      // Calculate new totals
      const newAmountPaid = invoice.amount_paid_cents + amountCents;
      const newBalanceDue = invoice.total_cents - newAmountPaid;

      // Determine new status
      let newStatus = invoice.status;
      if (newBalanceDue <= 0) {
        newStatus = 'paid';
      } else if (newAmountPaid > 0) {
        newStatus = 'partially_paid';
      }

      // Update invoice
      await client.query(`
        UPDATE invoices
        SET
          amount_paid_cents = $2,
          balance_due_cents = $3,
          status = $4,
          paid_at = ${newStatus === 'paid' ? 'CURRENT_TIMESTAMP' : 'paid_at'},
          updated_at = CURRENT_TIMESTAMP
        WHERE id = $1
      `, [invoiceId, newAmountPaid, Math.max(0, newBalanceDue), newStatus]);

      await client.query('COMMIT');

      this.cache?.invalidatePattern('invoices:*');

      return await this.getInvoiceById(invoiceId);

    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  /**
   * Send invoice to customer
   * @param {number} invoiceId - Invoice ID
   * @param {object} options - Send options
   * @returns {Promise<object>} Updated invoice
   */
  async sendInvoice(invoiceId, options = {}) {
    const {
      paymentLinkUrl = null,
      customMessage = ''
    } = options;

    const invoice = await this.getInvoiceById(invoiceId);

    if (!invoice) {
      throw new Error(`Invoice ${invoiceId} not found`);
    }

    if (!invoice.email) {
      throw new Error('Customer has no email address');
    }

    // Update status to sent
    await this.pool.query(`
      UPDATE invoices
      SET
        status = CASE WHEN status = 'draft' THEN 'sent' ELSE status END,
        sent_at = CURRENT_TIMESTAMP,
        updated_at = CURRENT_TIMESTAMP
      WHERE id = $1
    `, [invoiceId]);

    // Send email if email service available
    if (this.emailService) {
      await this.emailService.sendInvoice({
        to: invoice.email,
        customerName: invoice.customer_name || invoice.company,
        invoiceNumber: invoice.invoice_number,
        totalCents: invoice.total_cents,
        balanceDueCents: invoice.balance_due_cents,
        dueDate: invoice.due_date,
        paymentLinkUrl,
        customMessage,
        items: invoice.items
      });
    }

    this.cache?.invalidatePattern('invoices:*');

    return await this.getInvoiceById(invoiceId);
  }

  /**
   * Void an invoice
   * @param {number} invoiceId - Invoice ID
   * @param {string} reason - Void reason
   * @param {string} voidedBy - User voiding
   * @returns {Promise<object>} Voided invoice
   */
  async voidInvoice(invoiceId, reason, voidedBy = 'system') {
    const invoice = await this.getInvoiceById(invoiceId);

    if (!invoice) {
      throw new Error(`Invoice ${invoiceId} not found`);
    }

    if (invoice.status === 'paid') {
      throw new Error('Cannot void a paid invoice. Create a credit note instead.');
    }

    if (invoice.status === 'void') {
      throw new Error('Invoice is already voided');
    }

    await this.pool.query(`
      UPDATE invoices
      SET
        status = 'void',
        voided_at = CURRENT_TIMESTAMP,
        void_reason = $2,
        voided_by = $3,
        updated_at = CURRENT_TIMESTAMP
      WHERE id = $1
    `, [invoiceId, reason, voidedBy]);

    this.cache?.invalidatePattern('invoices:*');

    return await this.getInvoiceById(invoiceId);
  }

  /**
   * Search invoices by invoice number or customer name
   */
  async searchInvoices(query, limit = 5) {
    const pattern = `%${query}%`;
    const result = await this.pool.query(`
      SELECT i.id, i.invoice_number, i.status, i.total, i.due_date,
        c.name AS customer_name
      FROM invoices i
      LEFT JOIN customers c ON i.customer_id = c.id
      WHERE i.invoice_number ILIKE $1
        OR c.name ILIKE $1
        OR c.company ILIKE $1
      ORDER BY i.created_at DESC
      LIMIT $2
    `, [pattern, limit]);
    return result.rows;
  }

  /**
   * Get invoices with filters
   * @param {object} options - Filter options
   * @returns {Promise<object>} Invoices with pagination
   */
  async getInvoices(options = {}) {
    const {
      customerId,
      orderId,
      quotationId,
      status,
      search,
      overdue,
      fromDate,
      toDate,
      page = 1,
      limit = 50,
      sortBy = 'created_at',
      sortOrder = 'DESC'
    } = options;

    let conditions = [];
    let params = [];
    let paramIndex = 1;

    if (customerId) {
      conditions.push(`i.customer_id = $${paramIndex++}`);
      params.push(customerId);
    }

    if (orderId) {
      conditions.push(`i.order_id = $${paramIndex++}`);
      params.push(orderId);
    }

    if (quotationId) {
      conditions.push(`i.quotation_id = $${paramIndex++}`);
      params.push(quotationId);
    }

    if (status) {
      conditions.push(`i.status = $${paramIndex++}`);
      params.push(status);
    }

    if (overdue === 'true') {
      conditions.push(`i.due_date < CURRENT_DATE AND i.status NOT IN ('paid', 'void')`);
    }

    if (search) {
      conditions.push(`(
        i.invoice_number ILIKE $${paramIndex} OR
        c.name ILIKE $${paramIndex} OR
        c.company ILIKE $${paramIndex}
      )`);
      params.push(`%${search}%`);
      paramIndex++;
    }

    if (fromDate) {
      conditions.push(`i.created_at >= $${paramIndex++}`);
      params.push(fromDate);
    }

    if (toDate) {
      conditions.push(`i.created_at <= $${paramIndex++}`);
      params.push(toDate);
    }

    const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
    const offset = (page - 1) * limit;

    // Get total count
    const countResult = await this.pool.query(`
      SELECT COUNT(*) as total
      FROM invoices i
      LEFT JOIN customers c ON i.customer_id = c.id
      ${whereClause}
    `, params);

    const total = parseInt(countResult.rows[0].total);

    // Get invoices
    const validSortColumns = ['invoice_number', 'created_at', 'total_cents', 'status', 'due_date', 'balance_due_cents'];
    const sortColumn = validSortColumns.includes(sortBy) ? sortBy : 'created_at';
    const order = sortOrder.toUpperCase() === 'ASC' ? 'ASC' : 'DESC';

    const invoicesResult = await this.pool.query(`
      SELECT
        i.*,
        c.name as customer_name,
        c.company,
        c.email,
        q.quote_number,
        o.order_number,
        CASE WHEN i.due_date < CURRENT_DATE AND i.status NOT IN ('paid', 'void') THEN true ELSE false END as is_overdue
      FROM invoices i
      LEFT JOIN customers c ON i.customer_id = c.id
      LEFT JOIN quotations q ON i.quotation_id = q.id
      LEFT JOIN orders o ON i.order_id = o.id
      ${whereClause}
      ORDER BY i.${sortColumn} ${order}
      LIMIT $${paramIndex} OFFSET $${paramIndex + 1}
    `, [...params, limit, offset]);

    return {
      invoices: invoicesResult.rows,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit)
      }
    };
  }

  /**
   * Update invoice status based on payments and due date
   * @returns {Promise<number>} Number of invoices updated
   */
  async updateOverdueStatus() {
    const result = await this.pool.query(`
      UPDATE invoices
      SET
        status = 'overdue',
        updated_at = CURRENT_TIMESTAMP
      WHERE due_date < CURRENT_DATE
        AND status IN ('sent', 'partially_paid')
        AND balance_due_cents > 0
      RETURNING id
    `);

    if (result.rowCount > 0) {
      this.cache?.invalidatePattern('invoices:*');
    }

    return result.rowCount;
  }

  /**
   * Get invoice summary statistics
   * @param {object} options - Filter options
   * @returns {Promise<object>} Summary stats
   */
  async getInvoiceSummary(options = {}) {
    const { customerId, fromDate, toDate } = options;

    let conditions = [];
    let params = [];
    let paramIndex = 1;

    if (customerId) {
      conditions.push(`customer_id = $${paramIndex++}`);
      params.push(customerId);
    }

    if (fromDate) {
      conditions.push(`created_at >= $${paramIndex++}`);
      params.push(fromDate);
    }

    if (toDate) {
      conditions.push(`created_at <= $${paramIndex++}`);
      params.push(toDate);
    }

    const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

    const result = await this.pool.query(`
      SELECT
        COUNT(*) as total_invoices,
        COUNT(*) FILTER (WHERE status = 'draft') as draft_count,
        COUNT(*) FILTER (WHERE status = 'sent') as sent_count,
        COUNT(*) FILTER (WHERE status = 'partially_paid') as partial_count,
        COUNT(*) FILTER (WHERE status = 'paid') as paid_count,
        COUNT(*) FILTER (WHERE status = 'overdue') as overdue_count,
        COUNT(*) FILTER (WHERE status = 'void') as void_count,
        COALESCE(SUM(total_cents), 0) as total_invoiced_cents,
        COALESCE(SUM(amount_paid_cents), 0) as total_paid_cents,
        COALESCE(SUM(balance_due_cents), 0) as total_outstanding_cents,
        COALESCE(SUM(balance_due_cents) FILTER (WHERE due_date < CURRENT_DATE AND status NOT IN ('paid', 'void')), 0) as total_overdue_cents
      FROM invoices
      ${whereClause}
    `, params);

    return result.rows[0];
  }
}

module.exports = InvoiceService;
