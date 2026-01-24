/**
 * Data Quality Service
 * Detects and manages data quality issues:
 * - Duplicate detection for customers and leads
 * - Incomplete record identification
 * - Stale data detection
 * - Data health scoring
 */

class DataQualityService {
  constructor(pool, cache) {
    this.pool = pool;
    this.cache = cache;
  }

  /**
   * Get comprehensive data quality report
   */
  async getDataQualityReport() {
    const [
      customerIssues,
      leadIssues,
      productIssues,
      duplicates,
      overallHealth
    ] = await Promise.all([
      this.getCustomerDataIssues(),
      this.getLeadDataIssues(),
      this.getProductDataIssues(),
      this.getAllDuplicates(),
      this.calculateOverallHealth()
    ]);

    return {
      summary: {
        overallScore: overallHealth.score,
        totalIssues: customerIssues.total + leadIssues.total + productIssues.total + duplicates.total,
        criticalIssues: this.countCriticalIssues(customerIssues, leadIssues, productIssues),
        duplicatesFound: duplicates.total
      },
      customers: customerIssues,
      leads: leadIssues,
      products: productIssues,
      duplicates,
      health: overallHealth,
      generatedAt: new Date().toISOString()
    };
  }

  /**
   * Get customer data issues
   */
  async getCustomerDataIssues() {
    const issues = [];

    // Missing email
    const missingEmail = await this.pool.query(`
      SELECT id, name, company FROM customers
      WHERE (email IS NULL OR email = '')
        AND (active = true OR active IS NULL)
    `);
    if (missingEmail.rows.length > 0) {
      issues.push({
        type: 'missing_email',
        severity: 'high',
        count: missingEmail.rows.length,
        message: `${missingEmail.rows.length} customers missing email address`,
        records: missingEmail.rows.slice(0, 10)
      });
    }

    // Missing phone
    const missingPhone = await this.pool.query(`
      SELECT id, name, email FROM customers
      WHERE (phone IS NULL OR phone = '')
        AND (active = true OR active IS NULL)
    `);
    if (missingPhone.rows.length > 0) {
      issues.push({
        type: 'missing_phone',
        severity: 'medium',
        count: missingPhone.rows.length,
        message: `${missingPhone.rows.length} customers missing phone number`,
        records: missingPhone.rows.slice(0, 10)
      });
    }

    // Stale customers (no activity in 365 days with history)
    const staleCustomers = await this.pool.query(`
      SELECT c.id, c.name, c.email, c.days_since_last_activity
      FROM customers c
      WHERE c.days_since_last_activity > 365
        AND c.total_transactions > 0
        AND (c.active = true OR c.active IS NULL)
      ORDER BY c.clv_score DESC NULLS LAST
      LIMIT 20
    `);
    if (staleCustomers.rows.length > 0) {
      issues.push({
        type: 'stale_customer',
        severity: 'medium',
        count: staleCustomers.rows.length,
        message: `${staleCustomers.rows.length} customers inactive for over a year`,
        records: staleCustomers.rows
      });
    }

    // Invalid email format
    const invalidEmails = await this.pool.query(`
      SELECT id, name, email FROM customers
      WHERE email IS NOT NULL
        AND email != ''
        AND email !~ '^[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\\.[A-Za-z]{2,}$'
        AND (active = true OR active IS NULL)
      LIMIT 20
    `);
    if (invalidEmails.rows.length > 0) {
      issues.push({
        type: 'invalid_email',
        severity: 'high',
        count: invalidEmails.rows.length,
        message: `${invalidEmails.rows.length} customers with invalid email format`,
        records: invalidEmails.rows
      });
    }

    return {
      total: issues.reduce((sum, i) => sum + i.count, 0),
      issueCount: issues.length,
      issues
    };
  }

  /**
   * Get lead data issues
   */
  async getLeadDataIssues() {
    const issues = [];

    // Leads without contact info
    const noContact = await this.pool.query(`
      SELECT id, name, company FROM leads
      WHERE (email IS NULL OR email = '')
        AND (phone IS NULL OR phone = '')
        AND status NOT IN ('converted', 'lost')
    `);
    if (noContact.rows.length > 0) {
      issues.push({
        type: 'no_contact_info',
        severity: 'critical',
        count: noContact.rows.length,
        message: `${noContact.rows.length} leads without any contact information`,
        records: noContact.rows.slice(0, 10)
      });
    }

    // Stale leads (new status for 30+ days)
    const staleLeads = await this.pool.query(`
      SELECT id, name, email, created_at,
        EXTRACT(days FROM NOW() - created_at) as days_old
      FROM leads
      WHERE status = 'new'
        AND created_at < NOW() - INTERVAL '30 days'
      ORDER BY created_at ASC
      LIMIT 20
    `);
    if (staleLeads.rows.length > 0) {
      issues.push({
        type: 'stale_lead',
        severity: 'high',
        count: staleLeads.rows.length,
        message: `${staleLeads.rows.length} leads stuck in 'new' status for 30+ days`,
        records: staleLeads.rows
      });
    }

    // Leads without source
    const noSource = await this.pool.query(`
      SELECT id, name, email FROM leads
      WHERE (lead_source IS NULL OR lead_source = '')
        AND status NOT IN ('converted', 'lost')
      LIMIT 20
    `);
    if (noSource.rows.length > 0) {
      issues.push({
        type: 'missing_source',
        severity: 'low',
        count: noSource.rows.length,
        message: `${noSource.rows.length} leads without source attribution`,
        records: noSource.rows
      });
    }

    // Unassigned leads
    const unassigned = await this.pool.query(`
      SELECT id, name, email, created_at FROM leads
      WHERE assigned_to IS NULL
        AND status NOT IN ('converted', 'lost')
      ORDER BY lead_score DESC NULLS LAST
      LIMIT 20
    `);
    if (unassigned.rows.length > 0) {
      issues.push({
        type: 'unassigned',
        severity: 'medium',
        count: unassigned.rows.length,
        message: `${unassigned.rows.length} active leads not assigned to anyone`,
        records: unassigned.rows
      });
    }

    return {
      total: issues.reduce((sum, i) => sum + i.count, 0),
      issueCount: issues.length,
      issues
    };
  }

  /**
   * Get product data issues
   */
  async getProductDataIssues() {
    const issues = [];

    // Products without price
    const noPrice = await this.pool.query(`
      SELECT id, model, manufacturer FROM products
      WHERE (sell_price IS NULL OR sell_price = 0)
        AND is_active = true
      LIMIT 20
    `);
    if (noPrice.rows.length > 0) {
      issues.push({
        type: 'missing_price',
        severity: 'high',
        count: noPrice.rows.length,
        message: `${noPrice.rows.length} products without sell price`,
        records: noPrice.rows
      });
    }

    // Products without category
    const noCategory = await this.pool.query(`
      SELECT id, model, manufacturer FROM products
      WHERE (category IS NULL OR category = '')
        AND is_active = true
      LIMIT 20
    `);
    if (noCategory.rows.length > 0) {
      issues.push({
        type: 'missing_category',
        severity: 'medium',
        count: noCategory.rows.length,
        message: `${noCategory.rows.length} products without category`,
        records: noCategory.rows
      });
    }

    // Low stock products
    const lowStock = await this.pool.query(`
      SELECT id, model, manufacturer, quantity_on_hand FROM products
      WHERE quantity_on_hand <= 2
        AND quantity_on_hand > 0
        AND is_active = true
      LIMIT 20
    `);
    if (lowStock.rows.length > 0) {
      issues.push({
        type: 'low_stock',
        severity: 'medium',
        count: lowStock.rows.length,
        message: `${lowStock.rows.length} products with low stock`,
        records: lowStock.rows
      });
    }

    return {
      total: issues.reduce((sum, i) => sum + i.count, 0),
      issueCount: issues.length,
      issues
    };
  }

  /**
   * Find all duplicates
   */
  async getAllDuplicates() {
    const [customerDuplicates, leadDuplicates] = await Promise.all([
      this.findCustomerDuplicates(),
      this.findLeadDuplicates()
    ]);

    return {
      total: customerDuplicates.length + leadDuplicates.length,
      customers: customerDuplicates,
      leads: leadDuplicates
    };
  }

  /**
   * Find potential duplicate customers
   */
  async findCustomerDuplicates() {
    // Email duplicates
    const emailDupes = await this.pool.query(`
      SELECT email, array_agg(json_build_object('id', id, 'name', name)) as records
      FROM customers
      WHERE email IS NOT NULL AND email != ''
        AND (active = true OR active IS NULL)
      GROUP BY LOWER(email)
      HAVING COUNT(*) > 1
      LIMIT 10
    `);

    // Phone duplicates
    const phoneDupes = await this.pool.query(`
      SELECT phone, array_agg(json_build_object('id', id, 'name', name, 'email', email)) as records
      FROM customers
      WHERE phone IS NOT NULL AND phone != ''
        AND (active = true OR active IS NULL)
      GROUP BY REGEXP_REPLACE(phone, '[^0-9]', '', 'g')
      HAVING COUNT(*) > 1
      LIMIT 10
    `);

    const duplicates = [];

    emailDupes.rows.forEach(row => {
      duplicates.push({
        type: 'email',
        matchValue: row.email,
        records: row.records
      });
    });

    phoneDupes.rows.forEach(row => {
      duplicates.push({
        type: 'phone',
        matchValue: row.phone,
        records: row.records
      });
    });

    return duplicates;
  }

  /**
   * Find potential duplicate leads
   */
  async findLeadDuplicates() {
    // Email duplicates
    const emailDupes = await this.pool.query(`
      SELECT email, array_agg(json_build_object('id', id, 'name', name, 'status', status)) as records
      FROM leads
      WHERE email IS NOT NULL AND email != ''
        AND status NOT IN ('lost')
      GROUP BY LOWER(email)
      HAVING COUNT(*) > 1
      LIMIT 10
    `);

    // Name + company duplicates
    const nameDupes = await this.pool.query(`
      SELECT LOWER(name) as name_match, LOWER(COALESCE(company, '')) as company_match,
        array_agg(json_build_object('id', id, 'email', email, 'status', status)) as records
      FROM leads
      WHERE name IS NOT NULL AND name != ''
        AND status NOT IN ('lost')
      GROUP BY LOWER(name), LOWER(COALESCE(company, ''))
      HAVING COUNT(*) > 1
      LIMIT 10
    `);

    const duplicates = [];

    emailDupes.rows.forEach(row => {
      duplicates.push({
        type: 'email',
        matchValue: row.email,
        records: row.records
      });
    });

    nameDupes.rows.forEach(row => {
      duplicates.push({
        type: 'name_company',
        matchValue: `${row.name_match} / ${row.company_match || 'No company'}`,
        records: row.records
      });
    });

    return duplicates;
  }

  /**
   * Calculate overall data health score
   */
  async calculateOverallHealth() {
    const metrics = {};

    // Customer completeness
    const customerStats = await this.pool.query(`
      SELECT
        COUNT(*) as total,
        COUNT(*) FILTER (WHERE email IS NOT NULL AND email != '') as has_email,
        COUNT(*) FILTER (WHERE phone IS NOT NULL AND phone != '') as has_phone,
        COUNT(*) FILTER (WHERE address IS NOT NULL AND address != '') as has_address
      FROM customers
      WHERE active = true OR active IS NULL
    `);
    const cs = customerStats.rows[0];
    metrics.customerCompleteness = cs.total > 0
      ? Math.round(((parseInt(cs.has_email) + parseInt(cs.has_phone) + parseInt(cs.has_address)) / (cs.total * 3)) * 100)
      : 100;

    // Lead quality
    const leadStats = await this.pool.query(`
      SELECT
        COUNT(*) as total,
        COUNT(*) FILTER (WHERE email IS NOT NULL OR phone IS NOT NULL) as has_contact,
        COUNT(*) FILTER (WHERE lead_source IS NOT NULL AND lead_source != '') as has_source,
        COUNT(*) FILTER (WHERE assigned_to IS NOT NULL) as assigned
      FROM leads
      WHERE status NOT IN ('converted', 'lost')
    `);
    const ls = leadStats.rows[0];
    metrics.leadQuality = ls.total > 0
      ? Math.round(((parseInt(ls.has_contact) + parseInt(ls.has_source) + parseInt(ls.assigned)) / (ls.total * 3)) * 100)
      : 100;

    // Product data quality
    const productStats = await this.pool.query(`
      SELECT
        COUNT(*) as total,
        COUNT(*) FILTER (WHERE sell_price IS NOT NULL AND sell_price > 0) as has_price,
        COUNT(*) FILTER (WHERE category IS NOT NULL AND category != '') as has_category,
        COUNT(*) FILTER (WHERE description IS NOT NULL AND description != '') as has_description
      FROM products
      WHERE is_active = true
    `);
    const ps = productStats.rows[0];
    metrics.productQuality = ps.total > 0
      ? Math.round(((parseInt(ps.has_price) + parseInt(ps.has_category) + parseInt(ps.has_description)) / (ps.total * 3)) * 100)
      : 100;

    // Freshness score (based on recent activity)
    const freshnessResult = await this.pool.query(`
      SELECT
        (SELECT COUNT(*) FROM leads WHERE created_at > NOW() - INTERVAL '30 days') as recent_leads,
        (SELECT COUNT(*) FROM quotations WHERE created_at > NOW() - INTERVAL '30 days') as recent_quotes,
        (SELECT COUNT(*) FROM customers WHERE created_at > NOW() - INTERVAL '30 days') as recent_customers
    `);
    const fr = freshnessResult.rows[0];
    const recentActivity = parseInt(fr.recent_leads) + parseInt(fr.recent_quotes) + parseInt(fr.recent_customers);
    metrics.freshnessScore = recentActivity > 50 ? 100 : Math.min(100, recentActivity * 2);

    // Overall score
    const score = Math.round(
      (metrics.customerCompleteness * 0.3) +
      (metrics.leadQuality * 0.3) +
      (metrics.productQuality * 0.25) +
      (metrics.freshnessScore * 0.15)
    );

    return {
      score,
      grade: this.getGrade(score),
      metrics,
      recommendations: this.getRecommendations(metrics)
    };
  }

  /**
   * Get grade from score
   */
  getGrade(score) {
    if (score >= 90) return 'A';
    if (score >= 80) return 'B';
    if (score >= 70) return 'C';
    if (score >= 60) return 'D';
    return 'F';
  }

  /**
   * Get recommendations based on metrics
   */
  getRecommendations(metrics) {
    const recommendations = [];

    if (metrics.customerCompleteness < 80) {
      recommendations.push({
        priority: 'high',
        area: 'customers',
        message: 'Improve customer data completeness by filling in missing emails and phone numbers'
      });
    }

    if (metrics.leadQuality < 80) {
      recommendations.push({
        priority: 'high',
        area: 'leads',
        message: 'Assign unassigned leads and ensure all leads have contact information'
      });
    }

    if (metrics.productQuality < 80) {
      recommendations.push({
        priority: 'medium',
        area: 'products',
        message: 'Add missing prices and categories to product catalog'
      });
    }

    if (metrics.freshnessScore < 50) {
      recommendations.push({
        priority: 'low',
        area: 'activity',
        message: 'Data shows low recent activity - consider lead generation efforts'
      });
    }

    return recommendations;
  }

  /**
   * Count critical issues
   */
  countCriticalIssues(...issueGroups) {
    return issueGroups.reduce((count, group) => {
      return count + (group.issues || []).filter(i => i.severity === 'critical').length;
    }, 0);
  }

  /**
   * Fix common issues automatically
   */
  async autoFix(issueType) {
    const fixes = {
      // Trim whitespace from emails
      trim_emails: async () => {
        const result = await this.pool.query(`
          UPDATE customers SET email = TRIM(email)
          WHERE email != TRIM(email)
          RETURNING id
        `);
        return { fixed: result.rowCount, type: 'trim_emails' };
      },

      // Standardize phone numbers
      standardize_phones: async () => {
        const result = await this.pool.query(`
          UPDATE customers
          SET phone = REGEXP_REPLACE(phone, '[^0-9]', '', 'g')
          WHERE phone ~ '[^0-9]'
            AND LENGTH(REGEXP_REPLACE(phone, '[^0-9]', '', 'g')) >= 10
          RETURNING id
        `);
        return { fixed: result.rowCount, type: 'standardize_phones' };
      },

      // Mark old leads as lost
      close_stale_leads: async () => {
        const result = await this.pool.query(`
          UPDATE leads
          SET status = 'lost',
              lost_reason = 'Auto-closed due to inactivity'
          WHERE status = 'new'
            AND created_at < NOW() - INTERVAL '90 days'
          RETURNING id
        `);
        return { fixed: result.rowCount, type: 'close_stale_leads' };
      }
    };

    if (fixes[issueType]) {
      return fixes[issueType]();
    }

    throw new Error(`Unknown fix type: ${issueType}`);
  }

  /**
   * Merge duplicate records
   */
  async mergeDuplicates(entityType, primaryId, duplicateIds) {
    if (entityType === 'customer') {
      return this.mergeCustomers(primaryId, duplicateIds);
    } else if (entityType === 'lead') {
      return this.mergeLeads(primaryId, duplicateIds);
    }
    throw new Error('Unknown entity type');
  }

  /**
   * Merge customer duplicates
   */
  async mergeCustomers(primaryId, duplicateIds) {
    // Move quotations to primary
    await this.pool.query(`
      UPDATE quotations SET customer_id = $1
      WHERE customer_id = ANY($2::int[])
    `, [primaryId, duplicateIds]);

    // Move activities to primary
    await this.pool.query(`
      UPDATE customer_activities SET customer_id = $1
      WHERE customer_id = ANY($2::int[])
    `, [primaryId, duplicateIds]);

    // Move payments to primary
    await this.pool.query(`
      UPDATE customer_payments SET customer_id = $1
      WHERE customer_id = ANY($2::int[])
    `, [primaryId, duplicateIds]);

    // Soft delete duplicates
    await this.pool.query(`
      UPDATE customers SET active = false, merged_into_id = $1
      WHERE id = ANY($2::int[])
    `, [primaryId, duplicateIds]);

    return { merged: duplicateIds.length, primaryId };
  }

  /**
   * Merge lead duplicates
   */
  async mergeLeads(primaryId, duplicateIds) {
    // Merge notes
    const notesResult = await this.pool.query(`
      SELECT notes FROM leads WHERE id = ANY($1::int[]) AND notes IS NOT NULL
    `, [duplicateIds]);

    if (notesResult.rows.length > 0) {
      const mergedNotes = notesResult.rows.map(r => r.notes).join('\n---\n');
      await this.pool.query(`
        UPDATE leads SET notes = CONCAT(COALESCE(notes, ''), '\n---Merged from duplicates---\n', $1)
        WHERE id = $2
      `, [mergedNotes, primaryId]);
    }

    // Delete duplicates
    await this.pool.query(`
      DELETE FROM leads WHERE id = ANY($1::int[])
    `, [duplicateIds]);

    return { merged: duplicateIds.length, primaryId };
  }
}

module.exports = DataQualityService;
