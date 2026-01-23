/**
 * Lead Assignment Service
 * Auto-assigns leads using various strategies:
 * - Round-robin: Distribute leads evenly among team
 * - Territory: Assign based on geography
 * - Expertise: Match lead category to sales rep specialization
 * - Workload: Balance based on current active leads
 * - Availability: Consider availability status
 */

class LeadAssignmentService {
  constructor(pool, cache) {
    this.pool = pool;
    this.cache = cache;
  }

  /**
   * Auto-assign a lead based on configured rules
   */
  async assignLead(leadId) {
    // Get lead details
    const leadResult = await this.pool.query(`
      SELECT * FROM leads WHERE id = $1
    `, [leadId]);

    if (leadResult.rows.length === 0) {
      throw new Error('Lead not found');
    }

    const lead = leadResult.rows[0];

    // Get assignment rules (ordered by priority)
    const rules = await this.getActiveRules();

    // Try each rule until one matches
    for (const rule of rules) {
      const assignee = await this.evaluateRule(rule, lead);
      if (assignee) {
        await this.assignToUser(leadId, assignee.id, rule.id, rule.strategy);
        return {
          assigned: true,
          assigneeId: assignee.id,
          assigneeName: assignee.name,
          strategy: rule.strategy,
          ruleName: rule.name
        };
      }
    }

    // Fall back to default strategy if no rules matched
    const defaultAssignee = await this.getDefaultAssignee(lead);
    if (defaultAssignee) {
      await this.assignToUser(leadId, defaultAssignee.id, null, 'default');
      return {
        assigned: true,
        assigneeId: defaultAssignee.id,
        assigneeName: defaultAssignee.name,
        strategy: 'default',
        ruleName: 'Default Assignment'
      };
    }

    return { assigned: false, reason: 'No available assignees' };
  }

  /**
   * Get active assignment rules
   */
  async getActiveRules() {
    const result = await this.pool.query(`
      SELECT * FROM lead_assignment_rules
      WHERE is_active = true
      ORDER BY priority ASC, created_at ASC
    `);
    return result.rows;
  }

  /**
   * Get all assignment rules
   */
  async getAllRules() {
    const result = await this.pool.query(`
      SELECT
        lar.*,
        COUNT(l.id) FILTER (WHERE l.assigned_at > NOW() - INTERVAL '30 days') as leads_assigned_30d
      FROM lead_assignment_rules lar
      LEFT JOIN leads l ON l.assignment_rule_id = lar.id
      GROUP BY lar.id
      ORDER BY lar.priority ASC, lar.created_at ASC
    `);
    return result.rows;
  }

  /**
   * Create assignment rule
   */
  async createRule(data) {
    const {
      name,
      strategy,
      conditions = {},
      assigned_users = [],
      priority = 100,
      is_active = true
    } = data;

    const result = await this.pool.query(`
      INSERT INTO lead_assignment_rules (
        name, strategy, conditions, assigned_users, priority, is_active
      ) VALUES ($1, $2, $3, $4, $5, $6)
      RETURNING *
    `, [name, strategy, JSON.stringify(conditions), assigned_users, priority, is_active]);

    this.cache?.invalidatePattern?.('assignment:*');
    return result.rows[0];
  }

  /**
   * Update assignment rule
   */
  async updateRule(id, updates) {
    const allowedFields = ['name', 'strategy', 'conditions', 'assigned_users', 'priority', 'is_active'];
    const setClauses = [];
    const params = [id];

    for (const [key, value] of Object.entries(updates)) {
      if (allowedFields.includes(key) && value !== undefined) {
        params.push(key === 'conditions' ? JSON.stringify(value) : value);
        setClauses.push(`${key} = $${params.length}`);
      }
    }

    if (setClauses.length === 0) return null;

    setClauses.push('updated_at = NOW()');

    const result = await this.pool.query(`
      UPDATE lead_assignment_rules SET ${setClauses.join(', ')}
      WHERE id = $1
      RETURNING *
    `, params);

    this.cache?.invalidatePattern?.('assignment:*');
    return result.rows[0];
  }

  /**
   * Delete assignment rule
   */
  async deleteRule(id) {
    const result = await this.pool.query(
      `DELETE FROM lead_assignment_rules WHERE id = $1 RETURNING id`,
      [id]
    );
    this.cache?.invalidatePattern?.('assignment:*');
    return result.rowCount > 0;
  }

  /**
   * Evaluate a rule against a lead
   */
  async evaluateRule(rule, lead) {
    const conditions = typeof rule.conditions === 'string'
      ? JSON.parse(rule.conditions)
      : rule.conditions || {};

    // Check conditions
    if (!this.matchesConditions(conditions, lead)) {
      return null;
    }

    // Get assignee based on strategy
    switch (rule.strategy) {
      case 'round_robin':
        return this.getRoundRobinAssignee(rule.assigned_users);

      case 'workload':
        return this.getLowestWorkloadAssignee(rule.assigned_users);

      case 'territory':
        return this.getTerritoryAssignee(lead, rule.assigned_users);

      case 'expertise':
        return this.getExpertiseAssignee(lead, rule.assigned_users);

      case 'availability':
        return this.getAvailableAssignee(rule.assigned_users);

      case 'specific_user':
        return this.getSpecificAssignee(rule.assigned_users);

      default:
        return null;
    }
  }

  /**
   * Check if lead matches rule conditions
   */
  matchesConditions(conditions, lead) {
    // Lead source condition
    if (conditions.lead_sources?.length > 0) {
      if (!conditions.lead_sources.includes(lead.lead_source)) {
        return false;
      }
    }

    // Priority condition
    if (conditions.priorities?.length > 0) {
      if (!conditions.priorities.includes(lead.priority)) {
        return false;
      }
    }

    // Budget range condition
    if (conditions.min_budget !== undefined || conditions.max_budget !== undefined) {
      const budget = lead.budget_min || 0;
      if (conditions.min_budget && budget < conditions.min_budget) return false;
      if (conditions.max_budget && budget > conditions.max_budget) return false;
    }

    // Lead score condition
    if (conditions.min_score !== undefined) {
      if ((lead.lead_score || 0) < conditions.min_score) return false;
    }

    // Category/interest condition
    if (conditions.categories?.length > 0) {
      // Check if any interest matches any category
      const interests = lead.interests || [];
      const hasMatch = interests.some(i => conditions.categories.includes(i));
      if (!hasMatch) return false;
    }

    // Geographic conditions
    if (conditions.postal_codes?.length > 0) {
      const postalPrefix = (lead.postal_code || '').substring(0, 3).toUpperCase();
      if (!conditions.postal_codes.some(p => postalPrefix.startsWith(p))) {
        return false;
      }
    }

    if (conditions.cities?.length > 0) {
      const city = (lead.city || '').toLowerCase();
      if (!conditions.cities.some(c => c.toLowerCase() === city)) {
        return false;
      }
    }

    return true;
  }

  /**
   * Round-robin assignment
   */
  async getRoundRobinAssignee(userIds) {
    if (!userIds || userIds.length === 0) {
      userIds = await this.getActiveUserIds();
    }
    if (userIds.length === 0) return null;

    // Get user with oldest last assignment
    const result = await this.pool.query(`
      SELECT
        u.id,
        TRIM(CONCAT(u.first_name, ' ', u.last_name)) as name,
        u.email,
        MAX(l.assigned_at) as last_assignment
      FROM users u
      LEFT JOIN leads l ON l.assigned_to = u.id
      WHERE u.id = ANY($1::int[])
        AND u.is_active = true
      GROUP BY u.id
      ORDER BY last_assignment ASC NULLS FIRST
      LIMIT 1
    `, [userIds]);

    return result.rows[0] || null;
  }

  /**
   * Workload-based assignment
   */
  async getLowestWorkloadAssignee(userIds) {
    if (!userIds || userIds.length === 0) {
      userIds = await this.getActiveUserIds();
    }
    if (userIds.length === 0) return null;

    // Get user with fewest active leads
    const result = await this.pool.query(`
      SELECT
        u.id,
        TRIM(CONCAT(u.first_name, ' ', u.last_name)) as name,
        u.email,
        COUNT(l.id) FILTER (WHERE l.status NOT IN ('converted', 'lost')) as active_leads
      FROM users u
      LEFT JOIN leads l ON l.assigned_to = u.id
      WHERE u.id = ANY($1::int[])
        AND u.is_active = true
      GROUP BY u.id
      ORDER BY active_leads ASC
      LIMIT 1
    `, [userIds]);

    return result.rows[0] || null;
  }

  /**
   * Territory-based assignment
   */
  async getTerritoryAssignee(lead, userIds) {
    if (!userIds || userIds.length === 0) return null;

    // Get users with matching territory
    const postalPrefix = (lead.postal_code || '').substring(0, 3).toUpperCase();

    const result = await this.pool.query(`
      SELECT
        u.id,
        TRIM(CONCAT(u.first_name, ' ', u.last_name)) as name,
        u.email
      FROM users u
      WHERE u.id = ANY($1::int[])
        AND u.is_active = true
        AND (
          u.territories @> ARRAY[$2]::text[]
          OR u.territories @> ARRAY[$3]::text[]
        )
      LIMIT 1
    `, [userIds, postalPrefix, (lead.city || '').toLowerCase()]);

    return result.rows[0] || null;
  }

  /**
   * Expertise-based assignment
   */
  async getExpertiseAssignee(lead, userIds) {
    if (!userIds || userIds.length === 0) return null;

    const interests = lead.interests || [];
    if (interests.length === 0) return null;

    // Get users with matching expertise
    const result = await this.pool.query(`
      SELECT
        u.id,
        TRIM(CONCAT(u.first_name, ' ', u.last_name)) as name,
        u.email,
        COALESCE(array_length(array(SELECT unnest(u.expertise) INTERSECT SELECT unnest($2::text[])), 1), 0) as match_count
      FROM users u
      WHERE u.id = ANY($1::int[])
        AND u.is_active = true
        AND u.expertise && $2::text[]
      ORDER BY match_count DESC
      LIMIT 1
    `, [userIds, interests]);

    return result.rows[0] || null;
  }

  /**
   * Availability-based assignment
   */
  async getAvailableAssignee(userIds) {
    if (!userIds || userIds.length === 0) {
      userIds = await this.getActiveUserIds();
    }
    if (userIds.length === 0) return null;

    // Get first available user
    const result = await this.pool.query(`
      SELECT
        u.id,
        TRIM(CONCAT(u.first_name, ' ', u.last_name)) as name,
        u.email
      FROM users u
      WHERE u.id = ANY($1::int[])
        AND u.is_active = true
        AND (u.availability_status IS NULL OR u.availability_status = 'available')
      LIMIT 1
    `, [userIds]);

    return result.rows[0] || null;
  }

  /**
   * Specific user assignment
   */
  async getSpecificAssignee(userIds) {
    if (!userIds || userIds.length === 0) return null;

    const result = await this.pool.query(`
      SELECT
        id,
        TRIM(CONCAT(first_name, ' ', last_name)) as name,
        email
      FROM users
      WHERE id = $1
        AND is_active = true
    `, [userIds[0]]);

    return result.rows[0] || null;
  }

  /**
   * Get default assignee (fallback)
   */
  async getDefaultAssignee(lead) {
    // Default: round-robin among all active sales users
    return this.getRoundRobinAssignee([]);
  }

  /**
   * Get active user IDs
   */
  async getActiveUserIds() {
    const result = await this.pool.query(`
      SELECT id FROM users
      WHERE is_active = true
        AND role IN ('admin', 'sales', 'manager')
    `);
    return result.rows.map(r => r.id);
  }

  /**
   * Assign lead to user
   */
  async assignToUser(leadId, userId, ruleId, strategy) {
    await this.pool.query(`
      UPDATE leads SET
        assigned_to = $1,
        assigned_at = NOW(),
        assignment_rule_id = $2,
        assignment_strategy = $3,
        updated_at = NOW()
      WHERE id = $4
    `, [userId, ruleId, strategy, leadId]);

    // Log assignment
    await this.pool.query(`
      INSERT INTO lead_assignment_log (
        lead_id, assigned_to, rule_id, strategy
      ) VALUES ($1, $2, $3, $4)
    `, [leadId, userId, ruleId, strategy]);
  }

  /**
   * Bulk assign unassigned leads
   */
  async assignUnassignedLeads(limit = 50) {
    const result = await this.pool.query(`
      SELECT id FROM leads
      WHERE assigned_to IS NULL
        AND status NOT IN ('converted', 'lost')
      ORDER BY created_at ASC
      LIMIT $1
    `, [limit]);

    const results = [];
    for (const row of result.rows) {
      try {
        const assignment = await this.assignLead(row.id);
        results.push({ leadId: row.id, ...assignment });
      } catch (error) {
        results.push({ leadId: row.id, assigned: false, error: error.message });
      }
    }

    return {
      processed: results.length,
      assigned: results.filter(r => r.assigned).length,
      failed: results.filter(r => !r.assigned).length,
      details: results
    };
  }

  /**
   * Get assignment statistics
   */
  async getStats() {
    const result = await this.pool.query(`
      SELECT
        u.id,
        TRIM(CONCAT(u.first_name, ' ', u.last_name)) as name,
        COUNT(l.id) FILTER (WHERE l.assigned_at > NOW() - INTERVAL '7 days') as assigned_7d,
        COUNT(l.id) FILTER (WHERE l.assigned_at > NOW() - INTERVAL '30 days') as assigned_30d,
        COUNT(l.id) FILTER (WHERE l.status NOT IN ('converted', 'lost')) as active_leads,
        COUNT(l.id) FILTER (WHERE l.status = 'converted') as converted,
        ROUND(
          100.0 * COUNT(l.id) FILTER (WHERE l.status = 'converted') /
          NULLIF(COUNT(l.id), 0), 1
        ) as conversion_rate
      FROM users u
      LEFT JOIN leads l ON l.assigned_to = u.id
      WHERE u.is_active = true
        AND u.role IN ('admin', 'sales', 'manager')
      GROUP BY u.id
      ORDER BY assigned_30d DESC
    `);

    const unassigned = await this.pool.query(`
      SELECT COUNT(*) FROM leads
      WHERE assigned_to IS NULL
        AND status NOT IN ('converted', 'lost')
    `);

    return {
      byUser: result.rows,
      unassignedCount: parseInt(unassigned.rows[0].count)
    };
  }
}

module.exports = LeadAssignmentService;
