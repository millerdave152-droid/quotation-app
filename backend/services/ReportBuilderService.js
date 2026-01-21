/**
 * Report Builder Service
 * Handles report template management, data aggregation, and scheduled reports
 *
 * Features:
 * - Report template storage (JSON schema)
 * - Data aggregation queries
 * - Scheduled report execution
 * - Export to PDF/Excel
 */

class ReportBuilderService {
  constructor(pool) {
    this.pool = pool;

    // Available metrics for report building
    this.availableMetrics = {
      // Revenue metrics
      totalRevenue: {
        id: 'totalRevenue',
        name: 'Total Revenue',
        category: 'revenue',
        sql: `SUM(total_cents) / 100.0`,
        table: 'quotations',
        condition: `status = 'WON'`
      },
      avgOrderValue: {
        id: 'avgOrderValue',
        name: 'Average Order Value',
        category: 'revenue',
        sql: `AVG(total_cents) / 100.0`,
        table: 'quotations',
        condition: `status = 'WON'`
      },
      pipelineValue: {
        id: 'pipelineValue',
        name: 'Pipeline Value',
        category: 'revenue',
        sql: `SUM(total_cents) / 100.0`,
        table: 'quotations',
        condition: `status NOT IN ('WON', 'LOST', 'EXPIRED')`
      },

      // Quote metrics
      totalQuotes: {
        id: 'totalQuotes',
        name: 'Total Quotes',
        category: 'quotes',
        sql: `COUNT(*)`,
        table: 'quotations'
      },
      wonQuotes: {
        id: 'wonQuotes',
        name: 'Won Quotes',
        category: 'quotes',
        sql: `COUNT(*) FILTER (WHERE status = 'WON')`,
        table: 'quotations'
      },
      lostQuotes: {
        id: 'lostQuotes',
        name: 'Lost Quotes',
        category: 'quotes',
        sql: `COUNT(*) FILTER (WHERE status = 'LOST')`,
        table: 'quotations'
      },
      winRate: {
        id: 'winRate',
        name: 'Win Rate',
        category: 'quotes',
        sql: `ROUND(COUNT(*) FILTER (WHERE status = 'WON')::numeric / NULLIF(COUNT(*) FILTER (WHERE status IN ('WON', 'LOST')), 0) * 100, 1)`,
        table: 'quotations'
      },

      // Customer metrics
      totalCustomers: {
        id: 'totalCustomers',
        name: 'Total Customers',
        category: 'customers',
        sql: `COUNT(DISTINCT id)`,
        table: 'customers'
      },
      newCustomers: {
        id: 'newCustomers',
        name: 'New Customers',
        category: 'customers',
        sql: `COUNT(*) FILTER (WHERE created_at >= $dateStart)`,
        table: 'customers'
      },
      avgCLV: {
        id: 'avgCLV',
        name: 'Average CLV',
        category: 'customers',
        sql: `AVG(clv_score)`,
        table: 'customers'
      },

      // Product metrics
      totalProducts: {
        id: 'totalProducts',
        name: 'Total Products',
        category: 'products',
        sql: `COUNT(*)`,
        table: 'products',
        condition: `active = true`
      },
      lowStockProducts: {
        id: 'lowStockProducts',
        name: 'Low Stock Products',
        category: 'products',
        sql: `COUNT(*) FILTER (WHERE COALESCE(qty_on_hand, 0) <= 5)`,
        table: 'products',
        condition: `active = true`
      },
      outOfStockProducts: {
        id: 'outOfStockProducts',
        name: 'Out of Stock Products',
        category: 'products',
        sql: `COUNT(*) FILTER (WHERE COALESCE(qty_on_hand, 0) = 0)`,
        table: 'products',
        condition: `active = true`
      },

      // Invoice metrics
      totalInvoiced: {
        id: 'totalInvoiced',
        name: 'Total Invoiced',
        category: 'invoices',
        sql: `SUM(total_cents) / 100.0`,
        table: 'invoices'
      },
      overdueInvoices: {
        id: 'overdueInvoices',
        name: 'Overdue Invoices',
        category: 'invoices',
        sql: `COUNT(*) FILTER (WHERE status = 'SENT' AND due_date < CURRENT_DATE)`,
        table: 'invoices'
      },
      overdueAmount: {
        id: 'overdueAmount',
        name: 'Overdue Amount',
        category: 'invoices',
        sql: `SUM(CASE WHEN status = 'SENT' AND due_date < CURRENT_DATE THEN balance_due_cents ELSE 0 END) / 100.0`,
        table: 'invoices'
      }
    };

    // Available dimensions for grouping
    this.availableDimensions = {
      date: {
        id: 'date',
        name: 'Date',
        sql: 'DATE(created_at)',
        groupBy: 'DATE(created_at)'
      },
      week: {
        id: 'week',
        name: 'Week',
        sql: `DATE_TRUNC('week', created_at)::date`,
        groupBy: `DATE_TRUNC('week', created_at)`
      },
      month: {
        id: 'month',
        name: 'Month',
        sql: `TO_CHAR(created_at, 'YYYY-MM')`,
        groupBy: `DATE_TRUNC('month', created_at)`
      },
      quarter: {
        id: 'quarter',
        name: 'Quarter',
        sql: `TO_CHAR(created_at, 'YYYY-"Q"Q')`,
        groupBy: `DATE_TRUNC('quarter', created_at)`
      },
      salesperson: {
        id: 'salesperson',
        name: 'Salesperson',
        sql: 'created_by',
        groupBy: 'created_by'
      },
      customer: {
        id: 'customer',
        name: 'Customer',
        sql: 'customer_name',
        groupBy: 'customer_name'
      },
      status: {
        id: 'status',
        name: 'Status',
        sql: 'status',
        groupBy: 'status'
      },
      manufacturer: {
        id: 'manufacturer',
        name: 'Manufacturer',
        sql: 'manufacturer',
        groupBy: 'manufacturer',
        table: 'products'
      },
      category: {
        id: 'category',
        name: 'Category',
        sql: 'master_category',
        groupBy: 'master_category',
        table: 'products'
      }
    };
  }

  /**
   * Ensure report tables exist
   */
  async ensureTables() {
    await this.pool.query(`
      CREATE TABLE IF NOT EXISTS report_templates (
        id SERIAL PRIMARY KEY,
        name VARCHAR(255) NOT NULL,
        description TEXT,
        config JSONB NOT NULL,
        created_by VARCHAR(255),
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        is_public BOOLEAN DEFAULT false
      );

      CREATE TABLE IF NOT EXISTS scheduled_reports (
        id SERIAL PRIMARY KEY,
        template_id INTEGER REFERENCES report_templates(id),
        schedule_type VARCHAR(50) NOT NULL,
        schedule_config JSONB,
        recipients JSONB,
        last_run_at TIMESTAMP,
        next_run_at TIMESTAMP,
        is_active BOOLEAN DEFAULT true,
        created_by VARCHAR(255),
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );

      CREATE TABLE IF NOT EXISTS report_executions (
        id SERIAL PRIMARY KEY,
        template_id INTEGER REFERENCES report_templates(id),
        scheduled_report_id INTEGER REFERENCES scheduled_reports(id),
        status VARCHAR(50) DEFAULT 'pending',
        result_data JSONB,
        error_message TEXT,
        started_at TIMESTAMP,
        completed_at TIMESTAMP,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `);
  }

  /**
   * Get available metrics for report builder
   */
  getAvailableMetrics() {
    return Object.values(this.availableMetrics).map(m => ({
      id: m.id,
      name: m.name,
      category: m.category
    }));
  }

  /**
   * Get available dimensions for report builder
   */
  getAvailableDimensions() {
    return Object.values(this.availableDimensions).map(d => ({
      id: d.id,
      name: d.name
    }));
  }

  /**
   * Create a new report template
   */
  async createTemplate(template) {
    const { name, description, config, createdBy, isPublic } = template;

    const result = await this.pool.query(`
      INSERT INTO report_templates (name, description, config, created_by, is_public)
      VALUES ($1, $2, $3, $4, $5)
      RETURNING *
    `, [name, description, JSON.stringify(config), createdBy, isPublic || false]);

    return result.rows[0];
  }

  /**
   * Get all report templates
   */
  async getTemplates(userId = null) {
    const result = await this.pool.query(`
      SELECT * FROM report_templates
      WHERE is_public = true OR created_by = $1
      ORDER BY updated_at DESC
    `, [userId]);

    return result.rows;
  }

  /**
   * Get a single report template
   */
  async getTemplate(templateId) {
    const result = await this.pool.query(`
      SELECT * FROM report_templates WHERE id = $1
    `, [templateId]);

    return result.rows[0];
  }

  /**
   * Update a report template
   */
  async updateTemplate(templateId, updates) {
    const { name, description, config, isPublic } = updates;

    const result = await this.pool.query(`
      UPDATE report_templates
      SET name = COALESCE($1, name),
          description = COALESCE($2, description),
          config = COALESCE($3, config),
          is_public = COALESCE($4, is_public),
          updated_at = CURRENT_TIMESTAMP
      WHERE id = $5
      RETURNING *
    `, [name, description, config ? JSON.stringify(config) : null, isPublic, templateId]);

    return result.rows[0];
  }

  /**
   * Delete a report template
   */
  async deleteTemplate(templateId) {
    await this.pool.query(`DELETE FROM report_templates WHERE id = $1`, [templateId]);
    return { deleted: true };
  }

  /**
   * Execute a report based on configuration
   */
  async executeReport(config, options = {}) {
    const { metrics, dimensions, filters, dateRange } = config;
    const { templateId, scheduledReportId } = options;

    // Log execution start
    const executionResult = await this.pool.query(`
      INSERT INTO report_executions (template_id, scheduled_report_id, status, started_at)
      VALUES ($1, $2, 'running', CURRENT_TIMESTAMP)
      RETURNING id
    `, [templateId || null, scheduledReportId || null]);
    const executionId = executionResult.rows[0].id;

    try {
      const data = await this.buildAndExecuteQuery(metrics, dimensions, filters, dateRange);

      // Update execution with success
      await this.pool.query(`
        UPDATE report_executions
        SET status = 'completed', result_data = $1, completed_at = CURRENT_TIMESTAMP
        WHERE id = $2
      `, [JSON.stringify(data), executionId]);

      return {
        executionId,
        data,
        generatedAt: new Date().toISOString()
      };
    } catch (error) {
      // Update execution with error
      await this.pool.query(`
        UPDATE report_executions
        SET status = 'failed', error_message = $1, completed_at = CURRENT_TIMESTAMP
        WHERE id = $2
      `, [error.message, executionId]);

      throw error;
    }
  }

  /**
   * Build and execute the report query
   */
  async buildAndExecuteQuery(metricIds, dimensionId, filters, dateRange) {
    // Validate metrics
    const selectedMetrics = metricIds.map(id => this.availableMetrics[id]).filter(Boolean);
    if (selectedMetrics.length === 0) {
      throw new Error('At least one valid metric is required');
    }

    // Determine the primary table
    const primaryTable = selectedMetrics[0].table;

    // Build SELECT clause
    const selectParts = selectedMetrics.map(m => `${m.sql} as ${m.id}`);

    // Build GROUP BY if dimension is specified
    const dimension = dimensionId ? this.availableDimensions[dimensionId] : null;
    if (dimension) {
      selectParts.unshift(`${dimension.sql} as dimension`);
    }

    // Build WHERE clause
    const conditions = [];
    const params = [];
    let paramIndex = 1;

    // Date range filter
    if (dateRange) {
      const { start, end } = dateRange;
      if (start) {
        conditions.push(`created_at >= $${paramIndex++}`);
        params.push(start);
      }
      if (end) {
        conditions.push(`created_at <= $${paramIndex++}`);
        params.push(end);
      }
    }

    // Apply metric-specific conditions
    for (const metric of selectedMetrics) {
      if (metric.condition && !conditions.some(c => c.includes(metric.condition))) {
        // Only add if not conflicting with general conditions
      }
    }

    // Apply custom filters
    if (filters) {
      if (filters.salesperson) {
        conditions.push(`created_by = $${paramIndex++}`);
        params.push(filters.salesperson);
      }
      if (filters.customer) {
        conditions.push(`customer_name ILIKE $${paramIndex++}`);
        params.push(`%${filters.customer}%`);
      }
      if (filters.status) {
        conditions.push(`status = $${paramIndex++}`);
        params.push(filters.status);
      }
    }

    // Build full query
    let query = `SELECT ${selectParts.join(', ')} FROM ${primaryTable}`;

    if (conditions.length > 0) {
      query += ` WHERE ${conditions.join(' AND ')}`;
    }

    if (dimension) {
      query += ` GROUP BY ${dimension.groupBy}`;
      query += ` ORDER BY dimension`;
    }

    // Execute query
    const result = await this.pool.query(query, params);

    // Format results
    return {
      metrics: metricIds,
      dimension: dimensionId,
      rows: result.rows,
      rowCount: result.rows.length,
      summary: this.calculateSummary(result.rows, selectedMetrics)
    };
  }

  /**
   * Calculate summary statistics
   */
  calculateSummary(rows, metrics) {
    const summary = {};

    for (const metric of metrics) {
      const values = rows.map(r => parseFloat(r[metric.id]) || 0);

      if (values.length > 0) {
        summary[metric.id] = {
          total: values.reduce((a, b) => a + b, 0),
          average: values.reduce((a, b) => a + b, 0) / values.length,
          min: Math.min(...values),
          max: Math.max(...values)
        };
      }
    }

    return summary;
  }

  /**
   * Schedule a report
   */
  async scheduleReport(schedule) {
    const { templateId, scheduleType, scheduleConfig, recipients, createdBy } = schedule;

    // Calculate next run time
    const nextRunAt = this.calculateNextRunTime(scheduleType, scheduleConfig);

    const result = await this.pool.query(`
      INSERT INTO scheduled_reports
        (template_id, schedule_type, schedule_config, recipients, next_run_at, created_by)
      VALUES ($1, $2, $3, $4, $5, $6)
      RETURNING *
    `, [
      templateId,
      scheduleType,
      JSON.stringify(scheduleConfig),
      JSON.stringify(recipients),
      nextRunAt,
      createdBy
    ]);

    return result.rows[0];
  }

  /**
   * Get scheduled reports
   */
  async getScheduledReports(templateId = null) {
    let query = `
      SELECT sr.*, rt.name as template_name
      FROM scheduled_reports sr
      JOIN report_templates rt ON sr.template_id = rt.id
    `;

    const params = [];
    if (templateId) {
      query += ` WHERE sr.template_id = $1`;
      params.push(templateId);
    }

    query += ` ORDER BY sr.next_run_at`;

    const result = await this.pool.query(query, params);
    return result.rows;
  }

  /**
   * Update scheduled report
   */
  async updateScheduledReport(scheduleId, updates) {
    const { scheduleType, scheduleConfig, recipients, isActive } = updates;

    let nextRunAt = null;
    if (scheduleType && scheduleConfig) {
      nextRunAt = this.calculateNextRunTime(scheduleType, scheduleConfig);
    }

    const result = await this.pool.query(`
      UPDATE scheduled_reports
      SET schedule_type = COALESCE($1, schedule_type),
          schedule_config = COALESCE($2, schedule_config),
          recipients = COALESCE($3, recipients),
          is_active = COALESCE($4, is_active),
          next_run_at = COALESCE($5, next_run_at)
      WHERE id = $6
      RETURNING *
    `, [
      scheduleType,
      scheduleConfig ? JSON.stringify(scheduleConfig) : null,
      recipients ? JSON.stringify(recipients) : null,
      isActive,
      nextRunAt,
      scheduleId
    ]);

    return result.rows[0];
  }

  /**
   * Delete scheduled report
   */
  async deleteScheduledReport(scheduleId) {
    await this.pool.query(`DELETE FROM scheduled_reports WHERE id = $1`, [scheduleId]);
    return { deleted: true };
  }

  /**
   * Calculate next run time based on schedule
   */
  calculateNextRunTime(scheduleType, config) {
    const now = new Date();

    switch (scheduleType) {
      case 'daily': {
        const [hour, minute] = (config.time || '08:00').split(':');
        const next = new Date(now);
        next.setHours(parseInt(hour), parseInt(minute), 0, 0);
        if (next <= now) {
          next.setDate(next.getDate() + 1);
        }
        return next;
      }

      case 'weekly': {
        const dayOfWeek = config.dayOfWeek || 1; // Monday default
        const [hour, minute] = (config.time || '08:00').split(':');
        const next = new Date(now);
        next.setHours(parseInt(hour), parseInt(minute), 0, 0);

        const currentDay = next.getDay();
        const daysUntil = (dayOfWeek - currentDay + 7) % 7 || 7;
        next.setDate(next.getDate() + daysUntil);

        if (next <= now) {
          next.setDate(next.getDate() + 7);
        }
        return next;
      }

      case 'monthly': {
        const dayOfMonth = config.dayOfMonth || 1;
        const [hour, minute] = (config.time || '08:00').split(':');
        const next = new Date(now);
        next.setDate(dayOfMonth);
        next.setHours(parseInt(hour), parseInt(minute), 0, 0);

        if (next <= now) {
          next.setMonth(next.getMonth() + 1);
        }
        return next;
      }

      default:
        return null;
    }
  }

  /**
   * Get due scheduled reports
   */
  async getDueScheduledReports() {
    const result = await this.pool.query(`
      SELECT sr.*, rt.config as template_config
      FROM scheduled_reports sr
      JOIN report_templates rt ON sr.template_id = rt.id
      WHERE sr.is_active = true
        AND sr.next_run_at <= CURRENT_TIMESTAMP
    `);

    return result.rows;
  }

  /**
   * Process due scheduled reports
   */
  async processScheduledReports() {
    const dueReports = await this.getDueScheduledReports();
    const results = [];

    for (const schedule of dueReports) {
      try {
        const config = typeof schedule.template_config === 'string'
          ? JSON.parse(schedule.template_config)
          : schedule.template_config;

        // Execute the report
        const reportResult = await this.executeReport(config, {
          templateId: schedule.template_id,
          scheduledReportId: schedule.id
        });

        // Update last run and next run
        const nextRunAt = this.calculateNextRunTime(
          schedule.schedule_type,
          typeof schedule.schedule_config === 'string'
            ? JSON.parse(schedule.schedule_config)
            : schedule.schedule_config
        );

        await this.pool.query(`
          UPDATE scheduled_reports
          SET last_run_at = CURRENT_TIMESTAMP, next_run_at = $1
          WHERE id = $2
        `, [nextRunAt, schedule.id]);

        results.push({
          scheduleId: schedule.id,
          status: 'success',
          executionId: reportResult.executionId
        });
      } catch (error) {
        results.push({
          scheduleId: schedule.id,
          status: 'error',
          error: error.message
        });
      }
    }

    return results;
  }

  /**
   * Get report execution history
   */
  async getExecutionHistory(templateId = null, limit = 50) {
    let query = `
      SELECT re.*, rt.name as template_name
      FROM report_executions re
      LEFT JOIN report_templates rt ON re.template_id = rt.id
    `;

    const params = [];
    if (templateId) {
      query += ` WHERE re.template_id = $1`;
      params.push(templateId);
    }

    query += ` ORDER BY re.created_at DESC LIMIT $${params.length + 1}`;
    params.push(limit);

    const result = await this.pool.query(query, params);
    return result.rows;
  }

  /**
   * Get pre-built report templates
   */
  getPrebuiltTemplates() {
    return [
      {
        id: 'sales-summary',
        name: 'Sales Summary',
        description: 'Overview of sales performance',
        config: {
          metrics: ['totalRevenue', 'totalQuotes', 'wonQuotes', 'winRate'],
          dimensions: 'month',
          chartType: 'bar'
        }
      },
      {
        id: 'salesperson-performance',
        name: 'Salesperson Performance',
        description: 'Compare performance across sales team',
        config: {
          metrics: ['totalRevenue', 'wonQuotes', 'winRate'],
          dimensions: 'salesperson',
          chartType: 'bar'
        }
      },
      {
        id: 'customer-analysis',
        name: 'Customer Analysis',
        description: 'Customer metrics and CLV analysis',
        config: {
          metrics: ['totalCustomers', 'newCustomers', 'avgCLV'],
          dimensions: 'month',
          chartType: 'line'
        }
      },
      {
        id: 'inventory-status',
        name: 'Inventory Status',
        description: 'Stock levels and alerts',
        config: {
          metrics: ['totalProducts', 'lowStockProducts', 'outOfStockProducts'],
          dimensions: null,
          chartType: 'pie'
        }
      },
      {
        id: 'ar-aging',
        name: 'AR Aging Report',
        description: 'Accounts receivable and overdue invoices',
        config: {
          metrics: ['totalInvoiced', 'overdueInvoices', 'overdueAmount'],
          dimensions: 'month',
          chartType: 'bar'
        }
      }
    ];
  }
}

module.exports = ReportBuilderService;
