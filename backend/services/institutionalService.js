/**
 * Institutional Buyer Service
 * Manages institutional profiles, contacts, delivery addresses,
 * invoicing, payment tracking, and credit lifecycle for
 * government/institutional procurement.
 * All monetary values are INTEGER cents.
 */

const PDFDocument = require('pdfkit');
const { S3Client, PutObjectCommand } = require('@aws-sdk/client-s3');

const s3 = new S3Client({
  region: process.env.AWS_REGION || 'us-east-1',
  credentials: process.env.AWS_ACCESS_KEY_ID ? {
    accessKeyId: process.env.AWS_ACCESS_KEY_ID,
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
  } : undefined,
});

const S3_BUCKET = process.env.S3_BUCKET || 'teletime-product-images';
const CDN_BASE = process.env.CDN_BASE_URL || `https://${S3_BUCKET}.s3.amazonaws.com`;

const VALID_ORG_TYPES = ['housing_authority', 'school', 'municipality', 'corporation', 'other'];
const VALID_PAYMENT_TERMS = ['net30', 'net60', 'net90', 'cod', 'prepaid'];
const VALID_PAYMENT_METHODS = ['cheque', 'eft', 'wire', 'credit_card'];

const TERMS_TO_DAYS = {
  net30: 30, net60: 60, net90: 90, cod: 0, prepaid: 0,
};

function _localDateStr(d) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

const COLORS = {
  primary: '#1e40af',
  primaryLight: '#3b82f6',
  text: '#1f2937',
  textSecondary: '#4b5563',
  textMuted: '#9ca3af',
  border: '#e5e7eb',
  success: '#059669',
  warning: '#d97706',
  error: '#dc2626',
};

class InstitutionalService {
  constructor(pool, cache) {
    this.pool = pool;
    this.cache = cache;
  }

  // =========================================================================
  // PROFILES
  // =========================================================================

  /**
   * Create an institutional profile linked to an existing customer.
   */
  async createProfile(customerId, profileData, userId) {
    // Validate org_type
    if (!VALID_ORG_TYPES.includes(profileData.org_type)) {
      throw this._error('INVALID_ORG_TYPE',
        `org_type must be one of: ${VALID_ORG_TYPES.join(', ')}`,
        { org_type: profileData.org_type });
    }

    // Validate payment_terms
    const terms = profileData.payment_terms || 'net30';
    if (!VALID_PAYMENT_TERMS.includes(terms)) {
      throw this._error('INVALID_PAYMENT_TERMS',
        `payment_terms must be one of: ${VALID_PAYMENT_TERMS.join(', ')}`,
        { payment_terms: terms });
    }

    // Check customer exists
    const custRes = await this.pool.query(
      `SELECT id FROM customers WHERE id = $1`, [customerId]
    );
    if (custRes.rows.length === 0) {
      throw this._error('CUSTOMER_NOT_FOUND', 'Customer not found', { customerId });
    }

    // Check for duplicate profile before hitting UNIQUE constraint
    const dupRes = await this.pool.query(
      `SELECT id FROM institutional_profiles WHERE customer_id = $1`, [customerId]
    );
    if (dupRes.rows.length > 0) {
      throw this._error('DUPLICATE_PROFILE',
        `Customer ${customerId} already has an institutional profile`,
        { customerId, existingProfileId: dupRes.rows[0].id });
    }

    const res = await this.pool.query(
      `INSERT INTO institutional_profiles
         (customer_id, org_type, org_name, vendor_number, payment_terms,
          credit_limit_cents, requires_po, requires_quote_approval,
          is_active, notes, created_by)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
       RETURNING *`,
      [
        customerId,
        profileData.org_type,
        profileData.org_name,
        profileData.vendor_number || null,
        terms,
        profileData.credit_limit_cents || 0,
        profileData.requires_po !== undefined ? profileData.requires_po : true,
        profileData.requires_quote_approval || false,
        profileData.is_active !== undefined ? profileData.is_active : true,
        profileData.notes || null,
        userId,
      ]
    );

    // Audit
    await this._audit(userId, 'institutional_profile_created', 'institutional_profile', res.rows[0].id, {
      customerId,
      org_type: profileData.org_type,
      org_name: profileData.org_name,
    });

    this.cache?.invalidatePattern?.('institutional:*');

    return res.rows[0];
  }

  /**
   * Get a single profile by ID with optional related data.
   */
  async getProfile(profileId, opts = {}) {
    const { includeContacts = false, includeAddresses = false, includeOpenQuotes = false } = opts;

    const res = await this.pool.query(
      `SELECT p.*, c.name AS customer_name, c.email, c.phone
       FROM institutional_profiles p
       JOIN customers c ON c.id = p.customer_id
       WHERE p.id = $1`,
      [profileId]
    );

    if (res.rows.length === 0) {
      throw this._error('PROFILE_NOT_FOUND', 'Institutional profile not found', { profileId });
    }

    const profile = res.rows[0];

    if (includeContacts) {
      const contactsRes = await this.pool.query(
        `SELECT * FROM institutional_contacts
         WHERE profile_id = $1 AND is_active = TRUE
         ORDER BY is_primary DESC, last_name ASC`,
        [profileId]
      );
      profile.contacts = contactsRes.rows;
    }

    if (includeAddresses) {
      const addrRes = await this.pool.query(
        `SELECT * FROM institutional_delivery_addresses
         WHERE profile_id = $1 AND is_active = TRUE
         ORDER BY site_name ASC`,
        [profileId]
      );
      profile.addresses = addrRes.rows;
    }

    if (includeOpenQuotes) {
      const quotesRes = await this.pool.query(
        `SELECT id, quotation_number, total_cents, status, created_at,
                po_number, payment_terms
         FROM quotations
         WHERE institutional_profile_id = $1
           AND status NOT IN ('expired', 'cancelled', 'EXPIRED', 'CANCELLED')
         ORDER BY created_at DESC
         LIMIT 20`,
        [profileId]
      );
      profile.openQuotes = quotesRes.rows;
    }

    return profile;
  }

  /**
   * Get profile by customer ID (returns null if none).
   */
  async getProfileByCustomer(customerId) {
    const res = await this.pool.query(
      `SELECT * FROM institutional_profiles WHERE customer_id = $1`,
      [customerId]
    );
    return res.rows[0] || null;
  }

  /**
   * List profiles with filtering and pagination.
   */
  async listProfiles(filters = {}, pagination = {}) {
    const { isActive, orgType, search } = filters;
    const limit = Math.min(pagination.limit || 20, 100);
    const offset = pagination.offset || 0;

    const conditions = [];
    const params = [];
    let idx = 1;

    if (isActive !== undefined) {
      conditions.push(`p.is_active = $${idx++}`);
      params.push(isActive);
    }

    if (orgType) {
      conditions.push(`p.org_type = $${idx++}`);
      params.push(orgType);
    }

    if (search) {
      conditions.push(`(p.org_name ILIKE $${idx} OR c.name ILIKE $${idx})`);
      params.push(`%${search}%`);
      idx++;
    }

    const where = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

    const countRes = await this.pool.query(
      `SELECT COUNT(*) AS total
       FROM institutional_profiles p
       JOIN customers c ON c.id = p.customer_id
       ${where}`,
      params
    );

    const dataRes = await this.pool.query(
      `SELECT p.*, c.name AS customer_name, c.email, c.phone
       FROM institutional_profiles p
       JOIN customers c ON c.id = p.customer_id
       ${where}
       ORDER BY p.created_at DESC
       LIMIT $${idx++} OFFSET $${idx++}`,
      [...params, limit, offset]
    );

    return {
      profiles: dataRes.rows,
      total: parseInt(countRes.rows[0].total, 10),
    };
  }

  /**
   * Update profile fields (dynamic SET builder).
   */
  async updateProfile(profileId, updates, userId) {
    const ALLOWED = [
      'org_name', 'org_type', 'vendor_number', 'payment_terms',
      'credit_limit_cents', 'requires_po', 'requires_quote_approval',
      'is_active', 'notes', 'preferred_contact_id',
    ];

    // Validate org_type if provided
    if (updates.org_type && !VALID_ORG_TYPES.includes(updates.org_type)) {
      throw this._error('INVALID_ORG_TYPE',
        `org_type must be one of: ${VALID_ORG_TYPES.join(', ')}`,
        { org_type: updates.org_type });
    }

    // Validate payment_terms if provided
    if (updates.payment_terms && !VALID_PAYMENT_TERMS.includes(updates.payment_terms)) {
      throw this._error('INVALID_PAYMENT_TERMS',
        `payment_terms must be one of: ${VALID_PAYMENT_TERMS.join(', ')}`,
        { payment_terms: updates.payment_terms });
    }

    // Fetch current for audit diff
    const currentRes = await this.pool.query(
      `SELECT * FROM institutional_profiles WHERE id = $1`, [profileId]
    );
    if (currentRes.rows.length === 0) {
      throw this._error('PROFILE_NOT_FOUND', 'Institutional profile not found', { profileId });
    }
    const current = currentRes.rows[0];

    const sets = [];
    const params = [];
    let idx = 1;
    const oldValues = {};
    const newValues = {};

    for (const field of ALLOWED) {
      if (updates[field] !== undefined) {
        sets.push(`${field} = $${idx++}`);
        params.push(updates[field]);
        oldValues[field] = current[field];
        newValues[field] = updates[field];
      }
    }

    if (sets.length === 0) {
      return current;
    }

    params.push(profileId);
    const res = await this.pool.query(
      `UPDATE institutional_profiles
       SET ${sets.join(', ')}
       WHERE id = $${idx}
       RETURNING *`,
      params
    );

    // Audit with old/new diff
    await this._audit(userId, 'institutional_profile_updated', 'institutional_profile', profileId, {
      old: oldValues,
      new: newValues,
    });

    this.cache?.invalidatePattern?.('institutional:*');

    return res.rows[0];
  }

  // =========================================================================
  // CREDIT
  // =========================================================================

  /**
   * Get credit status for a profile.
   */
  async getCreditStatus(profileId) {
    const res = await this.pool.query(
      `SELECT credit_limit_cents, credit_used_cents
       FROM institutional_profiles WHERE id = $1`,
      [profileId]
    );

    if (res.rows.length === 0) {
      throw this._error('PROFILE_NOT_FOUND', 'Institutional profile not found', { profileId });
    }

    const limitCents = res.rows[0].credit_limit_cents;
    const usedCents = res.rows[0].credit_used_cents;
    const availableCents = limitCents - usedCents;
    const hasLimit = limitCents > 0;

    return {
      limitCents,
      usedCents,
      availableCents,
      utilizationPct: hasLimit ? Math.round((usedCents / limitCents) * 100) : 0,
      isOverLimit: usedCents > limitCents,
      hasLimit,
    };
  }

  /**
   * Check if a profile has sufficient credit for a given amount.
   */
  async checkCreditAvailability(profileId, amountCents) {
    const status = await this.getCreditStatus(profileId);

    if (!status.hasLimit) {
      return { approved: true, availableCents: status.availableCents, shortfallCents: 0 };
    }

    const approved = status.availableCents >= amountCents;
    return {
      approved,
      availableCents: status.availableCents,
      shortfallCents: approved ? 0 : amountCents - status.availableCents,
    };
  }

  // =========================================================================
  // CONTACTS
  // =========================================================================

  /**
   * Add a contact to an institutional profile.
   */
  async addContact(profileId, contactData, userId) {
    // Verify profile exists
    await this._requireProfile(profileId);

    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');

      // If setting as primary, clear existing primary first
      if (contactData.is_primary) {
        await client.query(
          `UPDATE institutional_contacts SET is_primary = FALSE
           WHERE profile_id = $1 AND is_primary = TRUE`,
          [profileId]
        );
      }

      const res = await client.query(
        `INSERT INTO institutional_contacts
           (profile_id, first_name, last_name, title, department,
            email, phone, is_primary, can_issue_po)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
         RETURNING *`,
        [
          profileId,
          contactData.first_name,
          contactData.last_name,
          contactData.title || null,
          contactData.department || null,
          contactData.email || null,
          contactData.phone || null,
          contactData.is_primary || false,
          contactData.can_issue_po || false,
        ]
      );

      await client.query('COMMIT');

      await this._audit(userId, 'institutional_contact_added', 'institutional_contact', res.rows[0].id, {
        profileId,
        name: `${contactData.first_name} ${contactData.last_name}`,
      });

      this.cache?.invalidatePattern?.('institutional:*');

      return res.rows[0];
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
  }

  /**
   * Update a contact.
   */
  async updateContact(contactId, updates, userId) {
    const ALLOWED = [
      'title', 'department', 'email', 'phone',
      'can_issue_po', 'is_primary', 'is_active',
    ];

    const currentRes = await this.pool.query(
      `SELECT * FROM institutional_contacts WHERE id = $1`, [contactId]
    );
    if (currentRes.rows.length === 0) {
      throw this._error('CONTACT_NOT_FOUND', 'Contact not found', { contactId });
    }
    const current = currentRes.rows[0];

    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');

      // If setting as primary, clear existing primary first
      if (updates.is_primary === true) {
        await client.query(
          `UPDATE institutional_contacts SET is_primary = FALSE
           WHERE profile_id = $1 AND is_primary = TRUE AND id != $2`,
          [current.profile_id, contactId]
        );
      }

      const sets = [];
      const params = [];
      let idx = 1;

      for (const field of ALLOWED) {
        if (updates[field] !== undefined) {
          sets.push(`${field} = $${idx++}`);
          params.push(updates[field]);
        }
      }

      if (sets.length === 0) {
        await client.query('COMMIT');
        return current;
      }

      params.push(contactId);
      const res = await client.query(
        `UPDATE institutional_contacts SET ${sets.join(', ')} WHERE id = $${idx} RETURNING *`,
        params
      );

      await client.query('COMMIT');

      await this._audit(userId, 'institutional_contact_updated', 'institutional_contact', contactId, {
        profileId: current.profile_id,
      });

      this.cache?.invalidatePattern?.('institutional:*');

      return res.rows[0];
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
  }

  /**
   * List contacts for a profile.
   */
  async listContacts(profileId, includeInactive = false) {
    const activeClause = includeInactive ? '' : 'AND is_active = TRUE';
    const res = await this.pool.query(
      `SELECT * FROM institutional_contacts
       WHERE profile_id = $1 ${activeClause}
       ORDER BY is_primary DESC, last_name ASC`,
      [profileId]
    );
    return res.rows;
  }

  // =========================================================================
  // DELIVERY ADDRESSES
  // =========================================================================

  /**
   * Add a delivery address to an institutional profile.
   */
  async addDeliveryAddress(profileId, addressData) {
    await this._requireProfile(profileId);

    const res = await this.pool.query(
      `INSERT INTO institutional_delivery_addresses
         (profile_id, site_name, address_line1, address_line2, city,
          province_code, postal_code, contact_name, contact_phone, access_notes)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
       RETURNING *`,
      [
        profileId,
        addressData.site_name,
        addressData.address_line1,
        addressData.address_line2 || null,
        addressData.city,
        addressData.province_code,
        addressData.postal_code,
        addressData.contact_name || null,
        addressData.contact_phone || null,
        addressData.access_notes || null,
      ]
    );

    this.cache?.invalidatePattern?.('institutional:*');

    return res.rows[0];
  }

  /**
   * Update a delivery address.
   */
  async updateDeliveryAddress(addressId, updates) {
    const ALLOWED = [
      'site_name', 'address_line1', 'address_line2', 'city',
      'province_code', 'postal_code', 'contact_name', 'contact_phone',
      'access_notes', 'is_active',
    ];

    const currentRes = await this.pool.query(
      `SELECT * FROM institutional_delivery_addresses WHERE id = $1`, [addressId]
    );
    if (currentRes.rows.length === 0) {
      throw this._error('ADDRESS_NOT_FOUND', 'Delivery address not found', { addressId });
    }

    const sets = [];
    const params = [];
    let idx = 1;

    for (const field of ALLOWED) {
      if (updates[field] !== undefined) {
        sets.push(`${field} = $${idx++}`);
        params.push(updates[field]);
      }
    }

    if (sets.length === 0) {
      return currentRes.rows[0];
    }

    params.push(addressId);
    const res = await this.pool.query(
      `UPDATE institutional_delivery_addresses SET ${sets.join(', ')} WHERE id = $${idx} RETURNING *`,
      params
    );

    this.cache?.invalidatePattern?.('institutional:*');

    return res.rows[0];
  }

  /**
   * List delivery addresses for a profile.
   */
  async listDeliveryAddresses(profileId, activeOnly = true) {
    const activeClause = activeOnly ? 'AND is_active = TRUE' : '';
    const res = await this.pool.query(
      `SELECT * FROM institutional_delivery_addresses
       WHERE profile_id = $1 ${activeClause}
       ORDER BY site_name ASC`,
      [profileId]
    );
    return res.rows;
  }

  // =========================================================================
  // INVOICING
  // =========================================================================

  /**
   * Generate a formatted invoice number: INV-YYYY-00001
   */
  async _generateInvoiceNumber(issuedDate) {
    const year = issuedDate.getFullYear();
    const seqRes = await this.pool.query(`SELECT nextval('institutional_invoice_seq') AS seq`);
    const seq = String(seqRes.rows[0].seq).padStart(5, '0');
    return `INV-${year}-${seq}`;
  }

  /**
   * Create an invoice from one or more accepted/won quotes.
   */
  async createInvoice(profileId, quoteIds, invoiceData = {}, userId) {
    if (!quoteIds || quoteIds.length === 0) {
      throw this._error('INVALID_QUOTES', 'At least one quote ID is required', { quoteIds });
    }

    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');

      // 1. Fetch profile for payment_terms
      const profileRes = await client.query(
        `SELECT * FROM institutional_profiles WHERE id = $1`, [profileId]
      );
      if (profileRes.rows.length === 0) {
        throw this._error('PROFILE_NOT_FOUND', 'Institutional profile not found', { profileId });
      }
      const profile = profileRes.rows[0];

      // 2. Fetch and validate quotes
      const quotesRes = await client.query(
        `SELECT id, quotation_number, subtotal_cents, tax_cents, total_cents, status,
                institutional_profile_id
         FROM quotations
         WHERE id = ANY($1)`,
        [quoteIds]
      );

      if (quotesRes.rows.length !== quoteIds.length) {
        const found = quotesRes.rows.map(r => r.id);
        const missing = quoteIds.filter(id => !found.includes(id));
        throw this._error('INVALID_QUOTES', 'Some quote IDs not found', { missing });
      }

      for (const q of quotesRes.rows) {
        if (q.institutional_profile_id !== profileId) {
          throw this._error('INVALID_QUOTES',
            `Quote ${q.id} does not belong to profile ${profileId}`,
            { quoteId: q.id, profileId });
        }
        // Statuses are uppercase in DB: WON = accepted
        if (!['WON', 'COMPLETED'].includes(q.status)) {
          throw this._error('QUOTES_NOT_READY',
            `Quote ${q.quotation_number} has status '${q.status}' — must be WON or COMPLETED`,
            { quoteId: q.id, status: q.status });
        }
      }

      // 3. Sum totals from quotes
      let subtotalCents = 0;
      let taxCents = 0;
      for (const q of quotesRes.rows) {
        subtotalCents += q.subtotal_cents || 0;
        taxCents += q.tax_cents || 0;
      }

      // Try to get more precise tax from transaction_tax_breakdown
      const taxBreakdownRes = await client.query(
        `SELECT COALESCE(SUM(total_tax_cents), 0) AS total_tax
         FROM transaction_tax_breakdown
         WHERE transaction_id = ANY($1) AND transaction_type = 'quote'`,
        [quoteIds]
      );
      if (taxBreakdownRes.rows[0].total_tax > 0) {
        taxCents = parseInt(taxBreakdownRes.rows[0].total_tax, 10);
      }

      const totalCents = subtotalCents + taxCents;

      // 4. Generate invoice number
      const issuedDate = new Date();
      const invoiceNumber = await this._generateInvoiceNumber(issuedDate);

      // 5. Calculate due date from payment_terms
      const termsDays = TERMS_TO_DAYS[profile.payment_terms] ?? 30;
      const dueDate = new Date(issuedDate);
      dueDate.setDate(dueDate.getDate() + termsDays);

      // 6. Insert invoice
      const invoiceRes = await client.query(
        `INSERT INTO institutional_invoices
           (invoice_number, profile_id, quote_ids, subtotal_cents, tax_cents,
            total_cents, issued_date, due_date, notes, created_by)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
         RETURNING *`,
        [
          invoiceNumber,
          profileId,
          quoteIds,
          subtotalCents,
          taxCents,
          totalCents,
          _localDateStr(issuedDate),
          _localDateStr(dueDate),
          invoiceData.notes || null,
          userId,
        ]
      );

      // 7. Update credit_used_cents on profile
      await client.query(
        `UPDATE institutional_profiles
         SET credit_used_cents = credit_used_cents + $1
         WHERE id = $2`,
        [totalCents, profileId]
      );

      await client.query('COMMIT');

      // Audit
      await this._audit(userId, 'invoice_created', 'institutional_invoice', invoiceRes.rows[0].id, {
        invoice_number: invoiceNumber,
        total_cents: totalCents,
        quote_ids: quoteIds,
      });

      this.cache?.invalidatePattern?.('institutional:*');

      return invoiceRes.rows[0];
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
  }

  /**
   * Get a single invoice with optional payment history.
   */
  async getInvoice(invoiceId, includePayments = true) {
    const res = await this.pool.query(
      `SELECT i.*,
              p.org_name, p.vendor_number, p.payment_terms AS profile_payment_terms,
              c.name AS customer_name, c.email AS customer_email,
              c.phone AS customer_phone, c.address AS customer_address,
              c.city AS customer_city, c.province AS customer_province,
              c.postal_code AS customer_postal_code
       FROM institutional_invoices i
       JOIN institutional_profiles p ON p.id = i.profile_id
       JOIN customers c ON c.id = p.customer_id
       WHERE i.id = $1`,
      [invoiceId]
    );

    if (res.rows.length === 0) {
      throw this._error('INVOICE_NOT_FOUND', 'Invoice not found', { invoiceId });
    }

    const invoice = res.rows[0];
    invoice.balance_owing_cents = invoice.total_cents - invoice.paid_cents;

    if (includePayments) {
      const paymentsRes = await this.pool.query(
        `SELECT ip.*, u.first_name || ' ' || u.last_name AS recorded_by_name
         FROM institutional_payments ip
         LEFT JOIN users u ON u.id = ip.recorded_by
         WHERE ip.invoice_id = $1
         ORDER BY ip.received_date ASC`,
        [invoiceId]
      );
      invoice.payments = paymentsRes.rows;
    }

    return invoice;
  }

  /**
   * List invoices with filtering and pagination.
   */
  async listInvoices(filters = {}, pagination = {}) {
    const { profileId, status, overdueOnly, fromDate, toDate } = filters;
    const limit = Math.min(pagination.limit || 20, 100);
    const offset = pagination.offset || 0;

    const conditions = [];
    const params = [];
    let idx = 1;

    if (profileId) {
      conditions.push(`i.profile_id = $${idx++}`);
      params.push(profileId);
    }

    if (status) {
      conditions.push(`i.status = $${idx++}`);
      params.push(status);
    }

    if (overdueOnly) {
      conditions.push(`i.due_date < CURRENT_DATE`);
      conditions.push(`i.status NOT IN ('paid', 'void')`);
    }

    if (fromDate) {
      conditions.push(`i.issued_date >= $${idx++}`);
      params.push(fromDate);
    }

    if (toDate) {
      conditions.push(`i.issued_date <= $${idx++}`);
      params.push(toDate);
    }

    const where = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

    const countRes = await this.pool.query(
      `SELECT COUNT(*) AS total FROM institutional_invoices i ${where}`,
      params
    );

    const dataRes = await this.pool.query(
      `SELECT i.*, p.org_name, c.name AS customer_name
       FROM institutional_invoices i
       JOIN institutional_profiles p ON p.id = i.profile_id
       JOIN customers c ON c.id = p.customer_id
       ${where}
       ORDER BY i.due_date ASC
       LIMIT $${idx++} OFFSET $${idx++}`,
      [...params, limit, offset]
    );

    return {
      invoices: dataRes.rows.map(inv => ({
        ...inv,
        balance_owing_cents: inv.total_cents - inv.paid_cents,
      })),
      total: parseInt(countRes.rows[0].total, 10),
    };
  }

  /**
   * Record a payment against an invoice.
   */
  async recordPayment(invoiceId, paymentData, userId) {
    if (!paymentData.amount_cents || paymentData.amount_cents <= 0) {
      throw this._error('INVALID_AMOUNT', 'amount_cents must be a positive integer', {
        amount_cents: paymentData.amount_cents,
      });
    }

    if (!VALID_PAYMENT_METHODS.includes(paymentData.payment_method)) {
      throw this._error('INVALID_PAYMENT_METHOD',
        `payment_method must be one of: ${VALID_PAYMENT_METHODS.join(', ')}`,
        { payment_method: paymentData.payment_method });
    }

    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');

      // Lock invoice row
      const invRes = await client.query(
        `SELECT * FROM institutional_invoices WHERE id = $1 FOR UPDATE`,
        [invoiceId]
      );
      if (invRes.rows.length === 0) {
        throw this._error('INVOICE_NOT_FOUND', 'Invoice not found', { invoiceId });
      }
      const invoice = invRes.rows[0];

      if (invoice.status === 'void') {
        throw this._error('INVOICE_VOIDED', 'Cannot record payment on a voided invoice', { invoiceId });
      }

      // Insert payment
      const payRes = await client.query(
        `INSERT INTO institutional_payments
           (invoice_id, amount_cents, payment_method, payment_reference,
            received_date, recorded_by, notes)
         VALUES ($1, $2, $3, $4, $5, $6, $7)
         RETURNING *`,
        [
          invoiceId,
          paymentData.amount_cents,
          paymentData.payment_method,
          paymentData.payment_reference || null,
          paymentData.received_date,
          userId,
          paymentData.notes || null,
        ]
      );

      // Calculate new paid total
      const newPaidCents = invoice.paid_cents + paymentData.amount_cents;
      let newStatus = invoice.status;
      let paidDate = invoice.paid_date;

      if (newPaidCents >= invoice.total_cents) {
        newStatus = 'paid';
        paidDate = _localDateStr(new Date());
      } else if (newPaidCents > 0) {
        newStatus = 'partially_paid';
      }

      // Update invoice
      await client.query(
        `UPDATE institutional_invoices
         SET paid_cents = $1, status = $2, paid_date = $3,
             payment_reference = $4
         WHERE id = $5`,
        [newPaidCents, newStatus, paidDate, paymentData.payment_reference || invoice.payment_reference, invoiceId]
      );

      // If fully paid, release credit
      if (newStatus === 'paid') {
        await client.query(
          `UPDATE institutional_profiles
           SET credit_used_cents = GREATEST(credit_used_cents - $1, 0)
           WHERE id = $2`,
          [invoice.total_cents, invoice.profile_id]
        );
      }

      await client.query('COMMIT');

      await this._audit(userId, 'payment_recorded', 'institutional_payment', payRes.rows[0].id, {
        invoiceId,
        amount_cents: paymentData.amount_cents,
        new_status: newStatus,
      });

      this.cache?.invalidatePattern?.('institutional:*');

      // Re-fetch updated invoice
      const updated = await this.getInvoice(invoiceId, false);
      return { invoice: updated, payment: payRes.rows[0] };
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
  }

  /**
   * Void an unpaid invoice. Cannot void paid or partially paid invoices.
   */
  async voidInvoice(invoiceId, reason, userId) {
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');

      const invRes = await client.query(
        `SELECT * FROM institutional_invoices WHERE id = $1 FOR UPDATE`,
        [invoiceId]
      );
      if (invRes.rows.length === 0) {
        throw this._error('INVOICE_NOT_FOUND', 'Invoice not found', { invoiceId });
      }
      const invoice = invRes.rows[0];

      if (['paid', 'partially_paid'].includes(invoice.status)) {
        throw this._error('CANNOT_VOID_PAID',
          'Cannot void an invoice that has received payments',
          { invoiceId, status: invoice.status, paid_cents: invoice.paid_cents });
      }

      await client.query(
        `UPDATE institutional_invoices SET status = 'void' WHERE id = $1`,
        [invoiceId]
      );

      // Release credit
      await client.query(
        `UPDATE institutional_profiles
         SET credit_used_cents = GREATEST(credit_used_cents - $1, 0)
         WHERE id = $2`,
        [invoice.total_cents, invoice.profile_id]
      );

      await client.query('COMMIT');

      await this._audit(userId, 'invoice_voided', 'institutional_invoice', invoiceId, {
        invoice_number: invoice.invoice_number,
        total_cents: invoice.total_cents,
        reason,
      });

      this.cache?.invalidatePattern?.('institutional:*');

      return { ...invoice, status: 'void' };
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
  }

  /**
   * Batch job: mark overdue invoices. Called daily at 6am by cron.
   */
  async updateOverdueStatuses() {
    const res = await this.pool.query(
      `UPDATE institutional_invoices
       SET status = 'overdue'
       WHERE due_date < CURRENT_DATE
         AND status IN ('issued', 'sent', 'partially_paid')
       RETURNING id`
    );
    return res.rowCount;
  }

  // =========================================================================
  // PDF GENERATION
  // =========================================================================

  /**
   * Generate a formal invoice PDF, upload to S3, update invoice record.
   */
  async generateInvoicePDF(invoiceId) {
    const invoice = await this.getInvoice(invoiceId, true);

    // Fetch quote details for line items
    let quoteLines = [];
    if (invoice.quote_ids && invoice.quote_ids.length > 0) {
      const qlRes = await this.pool.query(
        `SELECT id, quotation_number, subtotal_cents, tax_cents, total_cents, notes
         FROM quotations WHERE id = ANY($1)
         ORDER BY id ASC`,
        [invoice.quote_ids]
      );
      quoteLines = qlRes.rows;
    }

    // Fetch tax breakdown if available
    let taxBreakdown = null;
    if (invoice.quote_ids && invoice.quote_ids.length > 0) {
      const tbRes = await this.pool.query(
        `SELECT province_code,
                COALESCE(SUM(gst_cents), 0) AS gst_cents, MAX(gst_rate) AS gst_rate,
                COALESCE(SUM(hst_cents), 0) AS hst_cents, MAX(hst_rate) AS hst_rate,
                COALESCE(SUM(pst_cents), 0) AS pst_cents, MAX(pst_rate) AS pst_rate,
                COALESCE(SUM(qst_cents), 0) AS qst_cents, MAX(qst_rate) AS qst_rate
         FROM transaction_tax_breakdown
         WHERE transaction_id = ANY($1) AND transaction_type = 'quote'
         GROUP BY province_code
         LIMIT 1`,
        [invoice.quote_ids]
      );
      if (tbRes.rows.length > 0) taxBreakdown = tbRes.rows[0];
    }

    // Env-driven payment instructions (bracketed placeholders if missing)
    const bankName = process.env.TELETIME_BANK_NAME || '[Bank Name]';
    const bankTransit = process.env.TELETIME_BANK_TRANSIT || '[Transit No.]';
    const bankAccount = process.env.TELETIME_BANK_ACCOUNT || '[Account No.]';
    const remittanceAddress = process.env.TELETIME_REMITTANCE_ADDRESS || '[Remittance Address]';
    const hstNumber = process.env.TELETIME_HST_NUMBER || '[HST Number]';
    const companyName = process.env.COMPANY_NAME || 'TeleTime POS';
    const companyAddress = process.env.COMPANY_ADDRESS || '';
    const companyPhone = process.env.COMPANY_PHONE || '';
    const companyEmail = process.env.COMPANY_EMAIL || 'accounts@teletime.ca';

    const pdfBuffer = await new Promise((resolve, reject) => {
      const doc = new PDFDocument({ size: 'LETTER', margin: 50 });
      const chunks = [];
      doc.on('data', c => chunks.push(c));
      doc.on('end', () => resolve(Buffer.concat(chunks)));
      doc.on('error', reject);

      // --- Header accent bar ---
      doc.rect(0, 0, 612, 4).fill(COLORS.primary);

      // --- Company name ---
      doc.fontSize(22).font('Helvetica-Bold').fillColor(COLORS.primary)
         .text(companyName, 50, 20);
      doc.fontSize(8).font('Helvetica').fillColor(COLORS.textSecondary)
         .text([companyAddress, companyPhone, companyEmail].filter(Boolean).join('  |  '), 50, 46);

      // --- INVOICE badge ---
      doc.fontSize(18).font('Helvetica-Bold').fillColor(COLORS.primary)
         .text('INVOICE', 400, 20, { width: 162, align: 'right' });

      // --- Invoice meta ---
      const metaY = 70;
      doc.fontSize(9).font('Helvetica').fillColor(COLORS.text);
      doc.font('Helvetica-Bold').text('Invoice #:', 400, metaY);
      doc.font('Helvetica').text(invoice.invoice_number, 470, metaY);
      doc.font('Helvetica-Bold').text('Issued:', 400, metaY + 14);
      doc.font('Helvetica').text(this._fmtDate(invoice.issued_date), 470, metaY + 14);
      doc.font('Helvetica-Bold').text('Due:', 400, metaY + 28);
      doc.font('Helvetica').text(this._fmtDate(invoice.due_date), 470, metaY + 28);
      if (invoice.vendor_number) {
        doc.font('Helvetica-Bold').text('Vendor #:', 400, metaY + 42);
        doc.font('Helvetica').text(invoice.vendor_number, 470, metaY + 42);
      }

      // --- Bill To ---
      const billY = 70;
      doc.fontSize(9).font('Helvetica-Bold').fillColor(COLORS.primary).text('BILL TO', 50, billY);
      doc.fontSize(9).font('Helvetica-Bold').fillColor(COLORS.text)
         .text(invoice.org_name, 50, billY + 14);
      doc.font('Helvetica').fillColor(COLORS.textSecondary);
      let addrY = billY + 28;
      if (invoice.customer_name) { doc.text(invoice.customer_name, 50, addrY); addrY += 12; }
      if (invoice.customer_address) { doc.text(invoice.customer_address, 50, addrY); addrY += 12; }
      const cityLine = [invoice.customer_city, invoice.customer_province, invoice.customer_postal_code].filter(Boolean).join(', ');
      if (cityLine) { doc.text(cityLine, 50, addrY); addrY += 12; }
      if (invoice.customer_email) { doc.text(invoice.customer_email, 50, addrY); addrY += 12; }
      if (invoice.customer_phone) { doc.text(invoice.customer_phone, 50, addrY); }

      // --- Divider ---
      doc.moveTo(50, 155).lineTo(562, 155).strokeColor(COLORS.border).lineWidth(0.5).stroke();

      // --- Line items table ---
      const tableY = 168;
      // Header row
      doc.roundedRect(50, tableY, 512, 20, 3).fill(COLORS.primary);
      doc.fontSize(8).font('Helvetica-Bold').fillColor('#ffffff');
      doc.text('QUOTE #', 60, tableY + 5, { width: 100 });
      doc.text('DESCRIPTION', 170, tableY + 5, { width: 200 });
      doc.text('SUBTOTAL', 380, tableY + 5, { width: 80, align: 'right' });
      doc.text('TAX', 465, tableY + 5, { width: 50, align: 'right' });
      doc.text('TOTAL', 505, tableY + 5, { width: 50, align: 'right' });

      let rowY = tableY + 24;
      doc.fontSize(8).font('Helvetica').fillColor(COLORS.text);

      for (let qi = 0; qi < quoteLines.length; qi++) {
        const ql = quoteLines[qi];
        if (qi % 2 === 0) {
          doc.rect(50, rowY - 2, 512, 16).fill('#f9fafb');
          doc.fillColor(COLORS.text);
        }
        doc.text(ql.quotation_number || `Q-${ql.id}`, 60, rowY, { width: 100 });
        doc.text(ql.notes ? ql.notes.substring(0, 40) : '—', 170, rowY, { width: 200 });
        doc.text(this._fmtCurrency(ql.subtotal_cents), 380, rowY, { width: 80, align: 'right' });
        doc.text(this._fmtCurrency(ql.tax_cents || 0), 465, rowY, { width: 50, align: 'right' });
        doc.text(this._fmtCurrency(ql.total_cents), 505, rowY, { width: 50, align: 'right' });
        rowY += 18;
      }

      // --- Totals ---
      const totalsY = rowY + 10;
      doc.moveTo(380, totalsY).lineTo(562, totalsY).strokeColor(COLORS.border).stroke();

      let tY = totalsY + 8;
      doc.fontSize(9).font('Helvetica').fillColor(COLORS.textSecondary);
      doc.text('Subtotal:', 380, tY, { width: 90, align: 'right' });
      doc.text(this._fmtCurrency(invoice.subtotal_cents), 480, tY, { width: 75, align: 'right' });
      tY += 14;

      // Tax breakdown lines
      if (taxBreakdown) {
        if (taxBreakdown.hst_cents > 0) {
          doc.text(`HST (${(Number(taxBreakdown.hst_rate) * 100).toFixed(1)}%):`, 380, tY, { width: 90, align: 'right' });
          doc.text(this._fmtCurrency(taxBreakdown.hst_cents), 480, tY, { width: 75, align: 'right' });
          tY += 14;
        }
        if (taxBreakdown.gst_cents > 0) {
          doc.text(`GST (${(Number(taxBreakdown.gst_rate) * 100).toFixed(1)}%):`, 380, tY, { width: 90, align: 'right' });
          doc.text(this._fmtCurrency(taxBreakdown.gst_cents), 480, tY, { width: 75, align: 'right' });
          tY += 14;
        }
        if (taxBreakdown.pst_cents > 0) {
          doc.text(`PST (${(Number(taxBreakdown.pst_rate) * 100).toFixed(1)}%):`, 380, tY, { width: 90, align: 'right' });
          doc.text(this._fmtCurrency(taxBreakdown.pst_cents), 480, tY, { width: 75, align: 'right' });
          tY += 14;
        }
        if (taxBreakdown.qst_cents > 0) {
          doc.text(`QST (${(Number(taxBreakdown.qst_rate) * 100).toFixed(2)}%):`, 380, tY, { width: 90, align: 'right' });
          doc.text(this._fmtCurrency(taxBreakdown.qst_cents), 480, tY, { width: 75, align: 'right' });
          tY += 14;
        }
      } else if (invoice.tax_cents > 0) {
        doc.text('Tax:', 380, tY, { width: 90, align: 'right' });
        doc.text(this._fmtCurrency(invoice.tax_cents), 480, tY, { width: 75, align: 'right' });
        tY += 14;
      }

      // Total line
      doc.moveTo(380, tY).lineTo(562, tY).strokeColor(COLORS.primary).lineWidth(1).stroke();
      tY += 6;
      doc.fontSize(11).font('Helvetica-Bold').fillColor(COLORS.primary);
      doc.text('TOTAL:', 380, tY, { width: 90, align: 'right' });
      doc.text(this._fmtCurrency(invoice.total_cents), 480, tY, { width: 75, align: 'right' });
      tY += 18;

      // Amount paid + balance
      if (invoice.paid_cents > 0) {
        doc.fontSize(9).font('Helvetica').fillColor(COLORS.success);
        doc.text('Paid:', 380, tY, { width: 90, align: 'right' });
        doc.text(`-${this._fmtCurrency(invoice.paid_cents)}`, 480, tY, { width: 75, align: 'right' });
        tY += 14;
      }

      if (invoice.balance_owing_cents > 0) {
        doc.fontSize(10).font('Helvetica-Bold').fillColor(COLORS.error);
        doc.text('Balance Owing:', 380, tY, { width: 90, align: 'right' });
        doc.text(this._fmtCurrency(invoice.balance_owing_cents), 480, tY, { width: 75, align: 'right' });
      }

      // --- Payment instructions block ---
      const piY = Math.max(tY + 30, 540);
      doc.fontSize(9).font('Helvetica-Bold').fillColor(COLORS.text).text('PAYMENT INSTRUCTIONS', 50, piY);
      doc.roundedRect(50, piY + 14, 512, 80, 4).fillAndStroke('#f0fdf4', '#bbf7d0');

      let lnY = piY + 24;
      const lnH = 11;
      doc.fontSize(8).font('Helvetica').fillColor(COLORS.textSecondary);
      doc.text('Please include your invoice number on all payments.', 60, lnY);
      lnY += lnH;
      doc.text(`Payment is due by ${this._fmtDate(invoice.due_date)}.`, 60, lnY);
      lnY += lnH + 2;

      doc.font('Helvetica-Bold').text('Bank:', 60, lnY, { continued: true })
         .font('Helvetica').text(`  ${bankName}   Transit: ${bankTransit}   Account: ${bankAccount}`, { continued: false });
      lnY += lnH;
      doc.font('Helvetica-Bold').text('Remit to:', 60, lnY, { continued: true })
         .font('Helvetica').text(`  ${remittanceAddress}`, { continued: false });
      lnY += lnH;
      doc.font('Helvetica-Bold').text('HST #:', 60, lnY, { continued: true })
         .font('Helvetica').text(`  ${hstNumber}`, { continued: false });

      // --- Footer ---
      doc.moveTo(50, 745).lineTo(562, 745).strokeColor(COLORS.border).lineWidth(0.5).stroke();
      const termsLabel = invoice.profile_payment_terms
        ? invoice.profile_payment_terms.replace('net', 'Net-')
        : 'Net-30';
      doc.fontSize(8).font('Helvetica').fillColor(COLORS.textMuted)
         .text(`Tax Registration: ${hstNumber}`, 50, 752);
      doc.text(`Payment terms: ${termsLabel}  |  Questions: ${companyEmail}`, 50, 763, { width: 512, align: 'center' });

      doc.end();
    });

    // Upload to S3
    const key = `invoices/${invoice.profile_id}/${invoice.invoice_number}.pdf`;
    await s3.send(new PutObjectCommand({
      Bucket: S3_BUCKET,
      Key: key,
      Body: pdfBuffer,
      ContentType: 'application/pdf',
    }));

    const pdfUrl = `${CDN_BASE}/${key}`;

    // Update invoice record with PDF URL
    await this.pool.query(
      `UPDATE institutional_invoices SET pdf_url = $1 WHERE id = $2`,
      [pdfUrl, invoiceId]
    );

    return pdfUrl;
  }

  // =========================================================================
  // HELPERS
  // =========================================================================

  _fmtCurrency(cents) {
    return `$${(cents / 100).toFixed(2)}`;
  }

  _fmtDate(d) {
    if (!d) return '—';
    const date = d instanceof Date ? d : new Date(d);
    return date.toLocaleDateString('en-CA');
  }

  async _requireProfile(profileId) {
    const res = await this.pool.query(
      `SELECT id FROM institutional_profiles WHERE id = $1`, [profileId]
    );
    if (res.rows.length === 0) {
      throw this._error('PROFILE_NOT_FOUND', 'Institutional profile not found', { profileId });
    }
    return res.rows[0];
  }

  async _audit(userId, action, entityType, entityId, details = {}) {
    try {
      await this.pool.query(
        `INSERT INTO audit_log (user_id, action, entity_type, entity_id, details, created_at)
         VALUES ($1, $2, $3, $4, $5, NOW())`,
        [userId, action, entityType, entityId, JSON.stringify(details)]
      );
    } catch {
      // Audit failure should not block the operation
    }
  }

  _error(code, message, context = {}) {
    const err = new Error(message);
    err.code = code;
    err.context = context;
    return err;
  }
}

module.exports = InstitutionalService;
