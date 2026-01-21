/**
 * Lead Service
 * Handles all lead/inquiry capture business logic
 */

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
        u.username as assigned_to_name,
        cb.username as created_by_name,
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
   */
  async getLeadById(id) {
    const leadQuery = `
      SELECT
        l.*,
        c.name as customer_name,
        c.email as customer_email,
        c.phone as customer_phone,
        c.company as customer_company,
        u.username as assigned_to_name,
        cb.username as created_by_name,
        q.quote_number
      FROM leads l
      LEFT JOIN customers c ON l.customer_id = c.id
      LEFT JOIN users u ON l.assigned_to = u.id
      LEFT JOIN users cb ON l.created_by = cb.id
      LEFT JOIN quotations q ON l.quotation_id = q.id
      WHERE l.id = $1
    `;

    const leadResult = await this.pool.query(leadQuery, [id]);
    if (leadResult.rows.length === 0) {
      return null;
    }

    const lead = leadResult.rows[0];

    // Get requirements
    const reqResult = await this.pool.query(
      'SELECT * FROM lead_requirements WHERE lead_id = $1 ORDER BY id',
      [id]
    );
    lead.requirements = reqResult.rows;

    // Get recent activities
    const actResult = await this.pool.query(
      `SELECT la.*, u.username as performed_by_name
       FROM lead_activities la
       LEFT JOIN users u ON la.performed_by = u.id
       WHERE la.lead_id = $1
       ORDER BY la.created_at DESC
       LIMIT 50`,
      [id]
    );
    lead.activities = actResult.rows;

    return lead;
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

      // Generate quote number
      const quoteNumResult = await client.query(
        "SELECT COALESCE(MAX(CAST(SUBSTRING(quote_number FROM 5) AS INTEGER)), 0) + 1 as next_num FROM quotations"
      );
      const quoteNumber = `QUO-${String(quoteNumResult.rows[0].next_num).padStart(6, '0')}`;

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
        COUNT(*) FILTER (WHERE follow_up_date < CURRENT_DATE AND status NOT IN ('converted', 'lost')) as overdue_follow_ups
      FROM leads
    `;

    const result = await this.pool.query(statsQuery);
    return result.rows[0];
  }

  /**
   * Get leads due for follow-up
   */
  async getFollowUpsDue(daysAhead = 7) {
    const query = `
      SELECT
        l.*,
        u.username as assigned_to_name
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
}

module.exports = LeadService;
