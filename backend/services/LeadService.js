/**
 * Lead Service
 * Handles all lead/inquiry capture business logic
 */

const { ApiError } = require('../middleware/errorHandler');
const logger = require('../utils/logger');

class LeadService {
  constructor(pool, cache) {
    this.pool = pool;
    this.cache = cache;
  }

  /**
   * Generate a unique lead number (LD-2026-0001)
   */
  async generateLeadNumber() {
    const result = await this.pool.query("SELECT nextval('lead_number_seq')");
    const seq = result.rows[0].nextval;
    const year = new Date().getFullYear();
    return `LD-${year}-${String(seq).padStart(4, '0')}`;
  }

  /**
   * Get leads with filtering, sorting, and pagination
   */
  async getLeads(options = {}) {
    const {
      search = '',
      status = '',
      priority = '',
      assignedTo = '',
      page = 1,
      limit = 25,
      sortBy = 'created_at',
      sortOrder = 'DESC'
    } = options;

    const offset = (page - 1) * limit;
    const validSortColumns = ['created_at', 'lead_number', 'contact_name', 'priority', 'status', 'follow_up_date'];
    const sortColumn = validSortColumns.includes(sortBy) ? sortBy : 'created_at';
    const order = sortOrder.toUpperCase() === 'ASC' ? 'ASC' : 'DESC';

    // Build WHERE clause
    let whereConditions = [];
    let queryParams = [];
    let paramIndex = 1;

    if (search) {
      whereConditions.push(`(
        l.lead_number ILIKE $${paramIndex} OR
        l.contact_name ILIKE $${paramIndex} OR
        l.contact_email ILIKE $${paramIndex} OR
        l.contact_phone ILIKE $${paramIndex} OR
        l.requirements_notes ILIKE $${paramIndex}
      )`);
      queryParams.push(`%${search}%`);
      paramIndex++;
    }

    if (status) {
      whereConditions.push(`l.status = $${paramIndex}`);
      queryParams.push(status);
      paramIndex++;
    }

    if (priority) {
      whereConditions.push(`l.priority = $${paramIndex}`);
      queryParams.push(priority);
      paramIndex++;
    }

    if (assignedTo) {
      whereConditions.push(`l.assigned_to = $${paramIndex}`);
      queryParams.push(parseInt(assignedTo));
      paramIndex++;
    }

    const whereClause = whereConditions.length > 0
      ? `WHERE ${whereConditions.join(' AND ')}`
      : '';

    // Get total count
    const countQuery = `SELECT COUNT(*) FROM leads l ${whereClause}`;
    const countResult = await this.pool.query(countQuery, queryParams);
    const totalCount = parseInt(countResult.rows[0].count);

    // Get paginated results with joined data
    const dataQuery = `
      SELECT
        l.*,
        c.name as customer_name,
        c.email as customer_email,
        NULLIF(TRIM(CONCAT(u.first_name, ' ', u.last_name)), '') as assigned_to_name,
        NULLIF(TRIM(CONCAT(cb.first_name, ' ', cb.last_name)), '') as created_by_name,
        q.quote_number,
        (SELECT COUNT(*) FROM lead_requirements WHERE lead_id = l.id) as requirement_count,
        (SELECT COUNT(*) FROM lead_activities WHERE lead_id = l.id) as activity_count
      FROM leads l
      LEFT JOIN customers c ON l.customer_id = c.id
      LEFT JOIN users u ON l.assigned_to = u.id
      LEFT JOIN users cb ON l.created_by = cb.id
      LEFT JOIN quotations q ON l.quotation_id = q.id
      ${whereClause}
      ORDER BY l.${sortColumn} ${order}
      LIMIT $${paramIndex} OFFSET $${paramIndex + 1}
    `;

    const result = await this.pool.query(dataQuery, [...queryParams, limit, offset]);

    return {
      leads: result.rows,
      pagination: {
        total: totalCount,
        page: parseInt(page),
        limit: parseInt(limit),
        totalPages: Math.ceil(totalCount / limit)
      }
    };
  }

  /**
   * Get a single lead by ID with full details
   * PERF: Uses single query with JSON aggregation instead of 3 separate queries
   */
  async getLeadById(id) {
    const query = `
      WITH lead_data AS (
        SELECT
          l.*,
          c.name as customer_name,
          c.email as customer_email,
          c.phone as customer_phone,
          c.company as customer_company,
          NULLIF(TRIM(CONCAT(u.first_name, ' ', u.last_name)), '') as assigned_to_name,
          NULLIF(TRIM(CONCAT(cb.first_name, ' ', cb.last_name)), '') as created_by_name,
          q.quote_number
        FROM leads l
        LEFT JOIN customers c ON l.customer_id = c.id
        LEFT JOIN users u ON l.assigned_to = u.id
        LEFT JOIN users cb ON l.created_by = cb.id
        LEFT JOIN quotations q ON l.quotation_id = q.id
        WHERE l.id = $1
      ),
      requirements_agg AS (
        SELECT
          lead_id,
          COALESCE(json_agg(
            json_build_object(
              'id', lr.id,
              'lead_id', lr.lead_id,
              'category', lr.category,
              'subcategory', lr.subcategory,
              'quantity', lr.quantity,
              'budget_min_cents', lr.budget_min_cents,
              'budget_max_cents', lr.budget_max_cents,
              'brand_preferences', lr.brand_preferences,
              'color_preferences', lr.color_preferences,
              'size_constraints', lr.size_constraints,
              'notes', lr.notes
            ) ORDER BY lr.id
          ) FILTER (WHERE lr.id IS NOT NULL), '[]'::json) as requirements
        FROM lead_requirements lr
        WHERE lr.lead_id = $1
        GROUP BY lead_id
      ),
      activities_agg AS (
        SELECT
          la.lead_id,
          COALESCE(json_agg(
            json_build_object(
              'id', la.id,
              'lead_id', la.lead_id,
              'activity_type', la.activity_type,
              'description', la.description,
              'metadata', la.metadata,
              'performed_by', la.performed_by,
              'performed_by_name', NULLIF(TRIM(CONCAT(u.first_name, ' ', u.last_name)), ''),
              'created_at', la.created_at
            ) ORDER BY la.created_at DESC
          ) FILTER (WHERE la.id IS NOT NULL), '[]'::json) as activities
        FROM (
          SELECT * FROM lead_activities WHERE lead_id = $1 ORDER BY created_at DESC LIMIT 50
        ) la
        LEFT JOIN users u ON la.performed_by = u.id
        GROUP BY la.lead_id
      ),
      linked_quotes_agg AS (
        SELECT
          lq.lead_id,
          COALESCE(json_agg(
            json_build_object(
              'id', qt.id,
              'quote_number', qt.quote_number,
              'total_cents', qt.total_cents,
              'status', qt.status,
              'expires_at', qt.expires_at,
              'is_primary', lq.is_primary,
              'linked_at', lq.linked_at
            ) ORDER BY lq.is_primary DESC, lq.linked_at DESC
          ) FILTER (WHERE qt.id IS NOT NULL), '[]'::json) as linked_quotes
        FROM lead_quotes lq
        JOIN quotations qt ON lq.quote_id = qt.id
        WHERE lq.lead_id = $1
        GROUP BY lq.lead_id
      ),
      followups_agg AS (
        SELECT
          f.lead_id,
          COALESCE(json_agg(
            json_build_object(
              'id', f.id,
              'followup_type', f.followup_type,
              'scheduled_at', f.scheduled_at,
              'completed_at', f.completed_at,
              'notes', f.notes,
              'outcome', f.outcome,
              'scheduled_by', f.scheduled_by,
              'scheduled_by_name', NULLIF(TRIM(CONCAT(u.first_name, ' ', u.last_name)), ''),
              'created_at', f.created_at
            ) ORDER BY f.scheduled_at DESC
          ) FILTER (WHERE f.id IS NOT NULL), '[]'::json) as followups
        FROM lead_followups f
        LEFT JOIN users u ON f.scheduled_by = u.id
        WHERE f.lead_id = $1
        GROUP BY f.lead_id
      )
      SELECT
        ld.*,
        COALESCE(r.requirements, '[]'::json) as requirements,
        COALESCE(a.activities, '[]'::json) as activities,
        COALESCE(lqa.linked_quotes, '[]'::json) as linked_quotes,
        COALESCE(fa.followups, '[]'::json) as followups
      FROM lead_data ld
      LEFT JOIN requirements_agg r ON r.lead_id = ld.id
      LEFT JOIN activities_agg a ON a.lead_id = ld.id
      LEFT JOIN linked_quotes_agg lqa ON lqa.lead_id = ld.id
      LEFT JOIN followups_agg fa ON fa.lead_id = ld.id
    `;

    const result = await this.pool.query(query, [id]);
    if (result.rows.length === 0) {
      return null;
    }

    return result.rows[0];
  }

  /**
   * Create a new lead
   */
  async createLead(data, userId) {
    const client = await this.pool.connect();

    try {
      await client.query('BEGIN');

      const leadNumber = await this.generateLeadNumber();

      const insertQuery = `
        INSERT INTO leads (
          lead_number, customer_id, contact_name, contact_email, contact_phone,
          preferred_contact_method, best_time_to_contact, lead_source, source_details,
          inquiry_reason, timeline, move_in_date, requirements_notes,
          priority, assigned_to, follow_up_date, status, created_by
        ) VALUES (
          $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18
        ) RETURNING *
      `;

      const values = [
        leadNumber,
        data.customer_id || null,
        data.contact_name,
        data.contact_email || null,
        data.contact_phone || null,
        data.preferred_contact_method || null,
        data.best_time_to_contact || null,
        data.lead_source || null,
        data.source_details || null,
        data.inquiry_reason || null,
        data.timeline || null,
        data.move_in_date || null,
        data.requirements_notes || null,
        data.priority || 'warm',
        data.assigned_to || null,
        data.follow_up_date || null,
        'new',
        userId
      ];

      const result = await client.query(insertQuery, values);
      const lead = result.rows[0];

      // Insert requirements if provided
      if (data.requirements && Array.isArray(data.requirements)) {
        for (const req of data.requirements) {
          await client.query(`
            INSERT INTO lead_requirements (
              lead_id, category, subcategory, brand_preferences,
              budget_min_cents, budget_max_cents, must_have_features,
              color_preferences, size_constraints, quantity, notes
            ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
          `, [
            lead.id,
            req.category,
            req.subcategory || null,
            req.brand_preferences ? JSON.stringify(req.brand_preferences) : null,
            req.budget_min_cents || null,
            req.budget_max_cents || null,
            req.must_have_features ? JSON.stringify(req.must_have_features) : null,
            req.color_preferences ? JSON.stringify(req.color_preferences) : null,
            req.size_constraints || null,
            req.quantity || 1,
            req.notes || null
          ]);
        }
      }

      // Log activity
      await this.logActivity(client, lead.id, 'created', 'Lead created', null, userId);

      // If quoteId provided, link the quote to this lead
      if (data.quote_id) {
        await client.query(`
          INSERT INTO lead_quotes (lead_id, quote_id, is_primary)
          VALUES ($1, $2, true)
          ON CONFLICT (lead_id, quote_id) DO NOTHING
        `, [lead.id, data.quote_id]);

        await client.query(
          'UPDATE quotations SET lead_id = $1 WHERE id = $2',
          [lead.id, data.quote_id]
        );

        // Update status to quoted since a quote is linked
        await client.query(
          "UPDATE leads SET status = 'quoted', updated_at = NOW() WHERE id = $1",
          [lead.id]
        );
      }

      await client.query('COMMIT');

      return this.getLeadById(lead.id);
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  /**
   * Update a lead
   */
  async updateLead(id, data, userId) {
    const client = await this.pool.connect();

    try {
      await client.query('BEGIN');

      const updateQuery = `
        UPDATE leads SET
          customer_id = COALESCE($2, customer_id),
          contact_name = COALESCE($3, contact_name),
          contact_email = COALESCE($4, contact_email),
          contact_phone = COALESCE($5, contact_phone),
          preferred_contact_method = $6,
          best_time_to_contact = $7,
          lead_source = $8,
          source_details = $9,
          inquiry_reason = $10,
          timeline = $11,
          move_in_date = $12,
          requirements_notes = $13,
          priority = COALESCE($14, priority),
          assigned_to = $15,
          follow_up_date = $16,
          updated_at = CURRENT_TIMESTAMP
        WHERE id = $1
        RETURNING *
      `;

      const values = [
        id,
        data.customer_id,
        data.contact_name,
        data.contact_email,
        data.contact_phone,
        data.preferred_contact_method || null,
        data.best_time_to_contact || null,
        data.lead_source || null,
        data.source_details || null,
        data.inquiry_reason || null,
        data.timeline || null,
        data.move_in_date || null,
        data.requirements_notes || null,
        data.priority,
        data.assigned_to || null,
        data.follow_up_date || null
      ];

      const result = await client.query(updateQuery, values);

      if (result.rows.length === 0) {
        await client.query('ROLLBACK');
        return null;
      }

      // Update requirements if provided
      if (data.requirements !== undefined) {
        // Remove existing requirements
        await client.query('DELETE FROM lead_requirements WHERE lead_id = $1', [id]);

        // Insert new requirements
        if (Array.isArray(data.requirements)) {
          for (const req of data.requirements) {
            await client.query(`
              INSERT INTO lead_requirements (
                lead_id, category, subcategory, brand_preferences,
                budget_min_cents, budget_max_cents, must_have_features,
                color_preferences, size_constraints, quantity, notes
              ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
            `, [
              id,
              req.category,
              req.subcategory || null,
              req.brand_preferences ? JSON.stringify(req.brand_preferences) : null,
              req.budget_min_cents || null,
              req.budget_max_cents || null,
              req.must_have_features ? JSON.stringify(req.must_have_features) : null,
              req.color_preferences ? JSON.stringify(req.color_preferences) : null,
              req.size_constraints || null,
              req.quantity || 1,
              req.notes || null
            ]);
          }
        }
      }

      // Log activity
      await this.logActivity(client, id, 'updated', 'Lead updated', null, userId);

      await client.query('COMMIT');

      return this.getLeadById(id);
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  /**
   * Update lead status
   */
  async updateStatus(id, newStatus, lostReason, userId) {
    const client = await this.pool.connect();

    try {
      await client.query('BEGIN');

      // Get current status
      const currentResult = await client.query(
        'SELECT status FROM leads WHERE id = $1',
        [id]
      );

      if (currentResult.rows.length === 0) {
        await client.query('ROLLBACK');
        return null;
      }

      const oldStatus = currentResult.rows[0].status;

      // Validate status transition
      const validTransitions = {
        new: ['contacted', 'qualified', 'lost'],
        contacted: ['qualified', 'quote_created', 'lost'],
        qualified: ['quote_created', 'lost'],
        quote_created: ['converted', 'lost'],
        converted: [],
        lost: ['new'] // Allow reopening lost leads
      };

      if (!validTransitions[oldStatus]?.includes(newStatus) && newStatus !== oldStatus) {
        throw new Error(`Invalid status transition from ${oldStatus} to ${newStatus}`);
      }

      const updateQuery = `
        UPDATE leads SET
          status = $2,
          lost_reason = $3,
          updated_at = CURRENT_TIMESTAMP
        WHERE id = $1
        RETURNING *
      `;

      const result = await client.query(updateQuery, [
        id,
        newStatus,
        newStatus === 'lost' ? lostReason : null
      ]);

      // Auto-set first_contacted_at on first contact
      if (newStatus === 'contacted' && oldStatus === 'new') {
        await client.query(
          'UPDATE leads SET first_contacted_at = CURRENT_TIMESTAMP WHERE id = $1 AND first_contacted_at IS NULL',
          [id]
        );
      }

      // Log activity
      await this.logActivity(
        client,
        id,
        'status_changed',
        `Status changed from ${oldStatus} to ${newStatus}`,
        { oldStatus, newStatus, lostReason },
        userId
      );

      await client.query('COMMIT');

      return this.getLeadById(id);
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  /**
   * Convert lead to quote
   */
  async convertToQuote(id, quoteData, userId) {
    const client = await this.pool.connect();

    try {
      await client.query('BEGIN');

      // Get lead data
      const lead = await this.getLeadById(id);
      if (!lead) {
        throw new Error('Lead not found');
      }

      if (lead.status === 'converted') {
        throw new Error('Lead already converted');
      }

      let customerId = lead.customer_id;

      // Create customer if not linked
      if (!customerId) {
        const customerResult = await client.query(`
          INSERT INTO customers (name, email, phone, created_at)
          VALUES ($1, $2, $3, CURRENT_TIMESTAMP)
          RETURNING id
        `, [lead.contact_name, lead.contact_email, lead.contact_phone]);

        customerId = customerResult.rows[0].id;

        // Update lead with customer_id
        await client.query(
          'UPDATE leads SET customer_id = $1 WHERE id = $2',
          [customerId, id]
        );
      }

      // Generate quote number (format: QT-{year}-{number})
      const year = new Date().getFullYear();
      const quoteNumResult = await client.query(
        'SELECT quote_number FROM quotations WHERE quote_number LIKE $1 ORDER BY quote_number DESC LIMIT 1',
        [`QT-${year}-%`]
      );

      let nextNum = 1;
      if (quoteNumResult.rows.length > 0) {
        const lastNumber = parseInt(quoteNumResult.rows[0].quote_number.split('-').pop());
        nextNum = lastNumber + 1;
      }
      const quoteNumber = `QT-${year}-${nextNum.toString().padStart(4, '0')}`;

      // Create quotation
      const quoteResult = await client.query(`
        INSERT INTO quotations (
          quote_number, customer_id, status, notes, created_by, created_at
        ) VALUES ($1, $2, 'draft', $3, $4, CURRENT_TIMESTAMP)
        RETURNING id, quote_number
      `, [
        quoteNumber,
        customerId,
        quoteData?.notes || `Converted from lead ${lead.lead_number}`,
        userId
      ]);

      const quotation = quoteResult.rows[0];

      // Update lead status and link to quotation
      await client.query(`
        UPDATE leads SET
          status = 'quote_created',
          quotation_id = $2,
          updated_at = CURRENT_TIMESTAMP
        WHERE id = $1
      `, [id, quotation.id]);

      // Log activity
      await this.logActivity(
        client,
        id,
        'converted_to_quote',
        `Converted to quote ${quotation.quote_number}`,
        { quotationId: quotation.id, quoteNumber: quotation.quote_number },
        userId
      );

      await client.query('COMMIT');

      return {
        lead: await this.getLeadById(id),
        quotation: {
          id: quotation.id,
          quote_number: quotation.quote_number
        }
      };
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  /**
   * Log an activity for a lead
   */
  async logActivity(clientOrPool, leadId, activityType, description, metadata, userId) {
    const query = `
      INSERT INTO lead_activities (lead_id, activity_type, description, metadata, performed_by)
      VALUES ($1, $2, $3, $4, $5)
      RETURNING *
    `;

    const result = await clientOrPool.query(query, [
      leadId,
      activityType,
      description,
      metadata ? JSON.stringify(metadata) : null,
      userId
    ]);

    return result.rows[0];
  }

  /**
   * Add a manual activity/note to a lead
   */
  async addActivity(leadId, activityType, description, metadata, userId) {
    const result = await this.logActivity(this.pool, leadId, activityType, description, metadata, userId);

    // Update lead's updated_at
    await this.pool.query(
      'UPDATE leads SET updated_at = CURRENT_TIMESTAMP WHERE id = $1',
      [leadId]
    );

    return result;
  }

  /**
   * Get lead statistics for dashboard
   */
  async getStats() {
    const statsQuery = `
      SELECT
        COUNT(*) as total,
        COUNT(*) FILTER (WHERE status = 'new') as new_count,
        COUNT(*) FILTER (WHERE status = 'contacted') as contacted_count,
        COUNT(*) FILTER (WHERE status = 'qualified') as qualified_count,
        COUNT(*) FILTER (WHERE status = 'quote_created') as quote_created_count,
        COUNT(*) FILTER (WHERE status = 'converted') as converted_count,
        COUNT(*) FILTER (WHERE status = 'lost') as lost_count,
        COUNT(*) FILTER (WHERE priority = 'hot') as hot_count,
        COUNT(*) FILTER (WHERE priority = 'warm') as warm_count,
        COUNT(*) FILTER (WHERE priority = 'cold') as cold_count,
        COUNT(*) FILTER (WHERE follow_up_date = CURRENT_DATE) as follow_up_today,
        COUNT(*) FILTER (WHERE follow_up_date < CURRENT_DATE AND status NOT IN ('converted', 'lost')) as overdue_follow_ups,
        AVG(EXTRACT(EPOCH FROM (first_contacted_at - created_at)) / 3600)
          FILTER (WHERE first_contacted_at IS NOT NULL) as avg_response_hours,
        COUNT(*) FILTER (WHERE first_contacted_at IS NOT NULL
          AND EXTRACT(EPOCH FROM (first_contacted_at - created_at)) / 3600 <= 1) as responded_within_1h,
        COUNT(*) FILTER (WHERE first_contacted_at IS NOT NULL) as total_responded
      FROM leads
    `;

    const result = await this.pool.query(statsQuery);
    return result.rows[0];
  }

  /**
   * Get all leads for a customer
   * @param {number} customerId
   * @returns {Array} Leads for the customer
   */
  async getLeadsByCustomer(customerId) {
    const result = await this.pool.query(`
      SELECT
        l.*,
        NULLIF(TRIM(CONCAT(u.first_name, ' ', u.last_name)), '') as assigned_to_name,
        loc.name as store_location_name,
        (SELECT COUNT(*) FROM lead_quotes WHERE lead_id = l.id) as linked_quote_count
      FROM leads l
      LEFT JOIN users u ON l.assigned_to = u.id
      LEFT JOIN locations loc ON l.store_location_id = loc.id
      WHERE l.customer_id = $1
      ORDER BY l.created_at DESC
    `, [customerId]);
    return result.rows;
  }

  /**
   * Search leads by name, email, phone, or lead number
   */
  async searchLeads(query, limit = 5) {
    const pattern = `%${query}%`;
    const result = await this.pool.query(`
      SELECT id, lead_number, contact_name, contact_email, status, priority
      FROM leads
      WHERE lead_number ILIKE $1
        OR contact_name ILIKE $1
        OR contact_email ILIKE $1
        OR contact_phone ILIKE $1
      ORDER BY created_at DESC
      LIMIT $2
    `, [pattern, limit]);
    return result.rows;
  }

  /**
   * Get leads due for follow-up
   */
  async getFollowUpsDue(daysAhead = 7) {
    const query = `
      SELECT
        l.*,
        NULLIF(TRIM(CONCAT(u.first_name, ' ', u.last_name)), '') as assigned_to_name
      FROM leads l
      LEFT JOIN users u ON l.assigned_to = u.id
      WHERE l.follow_up_date <= CURRENT_DATE + $1
        AND l.follow_up_date >= CURRENT_DATE
        AND l.status NOT IN ('converted', 'lost')
      ORDER BY l.follow_up_date ASC, l.priority DESC
    `;

    const result = await this.pool.query(query, [daysAhead]);
    return result.rows;
  }

  /**
   * Save AI-generated content
   */
  async saveAIContent(id, field, content) {
    const validFields = ['ai_summary', 'ai_suggested_products', 'ai_draft_message'];
    if (!validFields.includes(field)) {
      throw new Error('Invalid AI field');
    }

    const value = field === 'ai_suggested_products' ? JSON.stringify(content) : content;

    await this.pool.query(
      `UPDATE leads SET ${field} = $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2`,
      [value, id]
    );

    return this.getLeadById(id);
  }

  /**
   * Delete a lead
   */
  async deleteLead(id) {
    const result = await this.pool.query(
      'DELETE FROM leads WHERE id = $1 RETURNING id',
      [id]
    );
    return result.rows.length > 0;
  }

  // ============================================================
  // Quote-to-Lead Pipeline Methods
  // ============================================================

  /**
   * Create a lead specifically for the quote pipeline
   * @param {object} params - { customerId, assignedStaffId, storeLocationId, source, notes }
   * @returns {object} The created lead record
   */
  async createPipelineLead(params) {
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');

      const leadNumber = await this.generateLeadNumber();

      // Look up customer name for contact_name
      const custResult = await client.query(
        'SELECT name, email, phone FROM customers WHERE id = $1',
        [params.customerId]
      );
      const customer = custResult.rows[0];
      if (!customer) {
        throw new Error('Customer not found');
      }

      const result = await client.query(`
        INSERT INTO leads (
          lead_number, customer_id, contact_name, contact_email, contact_phone,
          lead_source, status, assigned_to, store_location_id, requirements_notes,
          created_by
        ) VALUES ($1, $2, $3, $4, $5, $6, 'new', $7, $8, $9, $7)
        RETURNING *
      `, [
        leadNumber,
        params.customerId,
        customer.name,
        customer.email || null,
        customer.phone || null,
        params.source || 'quote_generated',
        params.assignedStaffId || null,
        params.storeLocationId || null,
        params.notes || null
      ]);

      await this.logActivity(client, result.rows[0].id, 'created', 'Lead created via quote pipeline', null, params.assignedStaffId);

      await client.query('COMMIT');
      return result.rows[0];
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  /**
   * Link a quotation to a lead via the lead_quotes junction table
   * @param {number} leadId
   * @param {number} quoteId
   * @param {boolean} isPrimary - If true, demotes other links for this lead
   * @returns {object} The lead_quotes record
   */
  async linkQuoteToLead(leadId, quoteId, isPrimary = false) {
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');

      // If isPrimary, demote all other links for this lead
      if (isPrimary) {
        await client.query(
          'UPDATE lead_quotes SET is_primary = false WHERE lead_id = $1',
          [leadId]
        );
      }

      // Insert junction record (upsert on unique constraint)
      const result = await client.query(`
        INSERT INTO lead_quotes (lead_id, quote_id, is_primary)
        VALUES ($1, $2, $3)
        ON CONFLICT (lead_id, quote_id)
        DO UPDATE SET is_primary = EXCLUDED.is_primary, linked_at = NOW()
        RETURNING *
      `, [leadId, quoteId, isPrimary]);

      // Also set the direct FK on quotations for quick lookups
      await client.query(
        'UPDATE quotations SET lead_id = $1 WHERE id = $2',
        [leadId, quoteId]
      );

      await client.query('COMMIT');
      return result.rows[0];
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  /**
   * Find an existing open lead for a customer, or create one and link the quote
   * @param {object} params - { customerId, assignedStaffId, storeLocationId, source, quoteId }
   * @returns {object} The lead record (existing or newly created)
   */
  async findOrCreateLeadForCustomer(params) {
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');

      // Look for an open lead for this customer
      const existingResult = await client.query(`
        SELECT id, status FROM leads
        WHERE customer_id = $1
          AND status NOT IN ('converted', 'lost', 'won', 'expired')
        ORDER BY created_at DESC
        LIMIT 1
      `, [params.customerId]);

      let lead;
      let isNew = false;

      if (existingResult.rows.length > 0) {
        // Existing open lead found — link quote to it
        lead = existingResult.rows[0];

        // Link quote as non-primary (existing lead already has a primary)
        await client.query(`
          INSERT INTO lead_quotes (lead_id, quote_id, is_primary)
          VALUES ($1, $2, false)
          ON CONFLICT (lead_id, quote_id) DO NOTHING
        `, [lead.id, params.quoteId]);

        // Set direct FK on quotation
        await client.query(
          'UPDATE quotations SET lead_id = $1 WHERE id = $2',
          [lead.id, params.quoteId]
        );

        // Update status to 'quoted' if currently 'new' or 'contacted'
        if (['new', 'contacted'].includes(lead.status)) {
          await client.query(`
            UPDATE leads SET status = 'quoted', updated_at = NOW()
            WHERE id = $1
          `, [lead.id]);
        }

        await this.logActivity(
          client, lead.id, 'quote_linked',
          `Linked to existing lead via quote pipeline`,
          { quoteId: params.quoteId },
          params.assignedStaffId
        );
      } else {
        // No open lead — create a new one
        isNew = true;
        const leadNumber = await this.generateLeadNumber();

        const custResult = await client.query(
          'SELECT name, email, phone FROM customers WHERE id = $1',
          [params.customerId]
        );
        const customer = custResult.rows[0];
        if (!customer) {
          throw new Error('Customer not found');
        }

        const insertResult = await client.query(`
          INSERT INTO leads (
            lead_number, customer_id, contact_name, contact_email, contact_phone,
            lead_source, status, assigned_to, store_location_id, created_by
          ) VALUES ($1, $2, $3, $4, $5, $6, 'quoted', $7, $8, $7)
          RETURNING *
        `, [
          leadNumber,
          params.customerId,
          customer.name,
          customer.email || null,
          customer.phone || null,
          params.source || 'quote_generated',
          params.assignedStaffId || null,
          params.storeLocationId || null
        ]);

        lead = insertResult.rows[0];

        // Link quote as primary (first quote on new lead)
        await client.query(`
          INSERT INTO lead_quotes (lead_id, quote_id, is_primary)
          VALUES ($1, $2, true)
        `, [lead.id, params.quoteId]);

        // Set direct FK on quotation
        await client.query(
          'UPDATE quotations SET lead_id = $1 WHERE id = $2',
          [lead.id, params.quoteId]
        );

        await this.logActivity(
          client, lead.id, 'created',
          'Lead created via quote pipeline',
          { quoteId: params.quoteId, source: params.source || 'quote_generated' },
          params.assignedStaffId
        );
      }

      await client.query('COMMIT');

      // Fire-and-forget: send lead-created email for new leads
      if (isNew && lead.assigned_to) {
        const EmailReminderService = require('./EmailReminderService');
        const emailReminderService = new EmailReminderService(this.pool);
        emailReminderService.dispatchLeadEmail('lead-created', lead.id, [lead.assigned_to])
          .catch(err => logger.error({ err, leadId: lead.id }, 'lead-created email failed'));
      }

      return { lead, isNew };
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  /**
   * Update lead status with state-machine validation (pipeline statuses)
   * Extends the existing updateStatus for pipeline-specific transitions
   * @param {number} leadId
   * @param {string} newStatus
   * @param {number} userId
   * @returns {object} Updated lead
   */
  async updatePipelineStatus(leadId, newStatus, userId) {
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');

      const currentResult = await client.query(
        'SELECT status FROM leads WHERE id = $1',
        [leadId]
      );
      if (currentResult.rows.length === 0) {
        throw new Error('Lead not found');
      }

      const oldStatus = currentResult.rows[0].status;

      // Combined state machine covering both original and pipeline statuses
      const validTransitions = {
        new: ['contacted', 'qualified', 'quoted', 'lost'],
        contacted: ['qualified', 'quote_created', 'quoted', 'follow_up_scheduled', 'lost'],
        qualified: ['quote_created', 'quoted', 'follow_up_scheduled', 'negotiating', 'lost'],
        quoted: ['follow_up_scheduled', 'negotiating', 'won', 'lost', 'expired'],
        quote_created: ['converted', 'follow_up_scheduled', 'negotiating', 'lost'],
        follow_up_scheduled: ['negotiating', 'won', 'lost', 'quoted', 'contacted'],
        negotiating: ['won', 'lost'],
        converted: [],
        won: [],
        lost: ['new'],
        expired: []
      };

      const allowed = validTransitions[oldStatus];
      if (!allowed || !allowed.includes(newStatus)) {
        throw new Error(`Invalid status transition from '${oldStatus}' to '${newStatus}'`);
      }

      // Terminal states get resolved_at
      const isTerminal = ['converted', 'won', 'lost', 'expired'].includes(newStatus);

      await client.query(`
        UPDATE leads SET
          status = $2,
          resolved_at = ${isTerminal ? 'NOW()' : 'resolved_at'},
          updated_at = NOW()
        WHERE id = $1
      `, [leadId, newStatus]);

      await this.logActivity(
        client, leadId, 'status_changed',
        `Pipeline status changed from ${oldStatus} to ${newStatus}`,
        { oldStatus, newStatus },
        userId
      );

      await client.query('COMMIT');
      return this.getLeadById(leadId);
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  /**
   * Get lead by ID with linked quotes (extended for pipeline)
   * @param {number} leadId
   * @returns {object} Lead with linked quotes, followups, and store location
   */
  async getPipelineLeadById(leadId) {
    const leadResult = await this.pool.query(`
      SELECT
        l.*,
        c.name as customer_name,
        c.email as customer_email,
        c.phone as customer_phone,
        c.company as customer_company,
        NULLIF(TRIM(CONCAT(u.first_name, ' ', u.last_name)), '') as assigned_to_name,
        loc.name as store_location_name
      FROM leads l
      LEFT JOIN customers c ON l.customer_id = c.id
      LEFT JOIN users u ON l.assigned_to = u.id
      LEFT JOIN locations loc ON l.store_location_id = loc.id
      WHERE l.id = $1
    `, [leadId]);

    if (leadResult.rows.length === 0) return null;

    const lead = leadResult.rows[0];

    // Fetch linked quotes
    const quotesResult = await this.pool.query(`
      SELECT
        lq.is_primary,
        lq.linked_at,
        q.id,
        q.quote_number,
        q.total_cents,
        q.status,
        q.expires_at
      FROM lead_quotes lq
      JOIN quotations q ON lq.quote_id = q.id
      WHERE lq.lead_id = $1
      ORDER BY lq.is_primary DESC, lq.linked_at DESC
    `, [leadId]);

    // Fetch follow-up history
    const followupsResult = await this.pool.query(`
      SELECT
        f.*,
        NULLIF(TRIM(CONCAT(u.first_name, ' ', u.last_name)), '') as scheduled_by_name
      FROM lead_followups f
      LEFT JOIN users u ON f.scheduled_by = u.id
      WHERE f.lead_id = $1
      ORDER BY f.scheduled_at DESC
    `, [leadId]);

    lead.linked_quotes = quotesResult.rows;
    lead.followups = followupsResult.rows;

    return lead;
  }

  /**
   * Get leads by store location with filtering and pagination
   * @param {number} storeLocationId
   * @param {object} filters - { status, assignedStaffId, page, limit }
   * @returns {object} { leads, pagination }
   */
  async getLeadsByStore(storeLocationId, filters = {}) {
    const {
      status,
      assignedStaffId,
      page = 1,
      limit = 25
    } = filters;

    const offset = (page - 1) * limit;
    const conditions = ['l.store_location_id = $1'];
    const params = [storeLocationId];
    let paramIndex = 2;

    if (status) {
      conditions.push(`l.status = $${paramIndex}`);
      params.push(status);
      paramIndex++;
    }

    if (assignedStaffId) {
      conditions.push(`l.assigned_to = $${paramIndex}`);
      params.push(parseInt(assignedStaffId));
      paramIndex++;
    }

    const whereClause = conditions.join(' AND ');

    const countResult = await this.pool.query(
      `SELECT COUNT(*) FROM leads l WHERE ${whereClause}`,
      params
    );
    const totalCount = parseInt(countResult.rows[0].count);

    const dataResult = await this.pool.query(`
      SELECT
        l.*,
        c.name as customer_name,
        NULLIF(TRIM(CONCAT(u.first_name, ' ', u.last_name)), '') as assigned_to_name,
        loc.name as store_location_name,
        (SELECT COUNT(*) FROM lead_quotes WHERE lead_id = l.id) as linked_quote_count
      FROM leads l
      LEFT JOIN customers c ON l.customer_id = c.id
      LEFT JOIN users u ON l.assigned_to = u.id
      LEFT JOIN locations loc ON l.store_location_id = loc.id
      WHERE ${whereClause}
      ORDER BY l.created_at DESC
      LIMIT $${paramIndex} OFFSET $${paramIndex + 1}
    `, [...params, limit, offset]);

    return {
      leads: dataResult.rows,
      pagination: {
        total: totalCount,
        page: parseInt(page),
        limit: parseInt(limit),
        totalPages: Math.ceil(totalCount / limit)
      }
    };
  }

  /**
   * Schedule a follow-up for a lead
   * @param {number} leadId
   * @param {object} data - { followupType, scheduledAt, notes }
   * @param {number} userId
   * @returns {object} The created follow-up record
   */
  async scheduleFollowup(leadId, data, userId) {
    const result = await this.pool.query(`
      INSERT INTO lead_followups (lead_id, scheduled_by, followup_type, scheduled_at, notes)
      VALUES ($1, $2, $3, $4, $5)
      RETURNING *
    `, [
      leadId,
      userId,
      data.followupType || 'call',
      data.scheduledAt,
      data.notes || null
    ]);

    await this.logActivity(
      this.pool, leadId, 'followup_scheduled',
      `Follow-up scheduled: ${data.followupType || 'call'} at ${data.scheduledAt}`,
      { followupId: result.rows[0].id },
      userId
    );

    // Queue email reminder 1 hour before the follow-up (fire-and-forget)
    try {
      const reminderAt = new Date(new Date(data.scheduledAt).getTime() - 60 * 60 * 1000);
      if (reminderAt > new Date()) {
        await this.pool.query(`
          INSERT INTO lead_reminders (lead_id, reminder_type, trigger_type, scheduled_at, recipient_user_id, message_body)
          VALUES ($1, 'email', 'manual', $2, $3, $4)
        `, [leadId, reminderAt.toISOString(), userId, `Follow-up reminder: ${data.followupType || 'call'}`]);
      }
    } catch (err) {
      logger.error({ err, leadId }, 'Failed to queue follow-up email reminder');
    }

    return result.rows[0];
  }

  /**
   * Complete a follow-up
   * @param {number} followupId
   * @param {object} data - { outcome, notes }
   * @param {number} userId
   * @returns {object} The updated follow-up record
   */
  async completeFollowup(followupId, data, userId) {
    const result = await this.pool.query(`
      UPDATE lead_followups SET
        completed_at = NOW(),
        outcome = $2,
        notes = COALESCE($3, notes)
      WHERE id = $1
      RETURNING *
    `, [followupId, data.outcome || null, data.notes || null]);

    if (result.rows.length === 0) {
      throw new Error('Follow-up not found');
    }

    const followup = result.rows[0];

    await this.logActivity(
      this.pool, followup.lead_id, 'followup_completed',
      `Follow-up completed: ${followup.followup_type}`,
      { followupId, outcome: data.outcome },
      userId
    );

    return followup;
  }
}

module.exports = LeadService;
