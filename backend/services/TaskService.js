/**
 * Task Service
 * Handles follow-up tasks, reminders, and scheduling
 */

class TaskService {
  constructor(pool, cache) {
    this.pool = pool;
    this.cache = cache;
  }

  /**
   * Create a new task
   */
  async createTask(taskData, createdBy = null) {
    const {
      title,
      description,
      due_date,
      due_time,
      priority = 'normal',
      task_type = 'follow_up',
      assigned_to,
      related_type,
      related_id,
      reminder_at,
      notes,
      metadata = {}
    } = taskData;

    const result = await this.pool.query(`
      INSERT INTO tasks (
        title, description, due_date, due_time, priority, task_type,
        assigned_to, created_by, related_type, related_id,
        reminder_at, notes, metadata
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)
      RETURNING *
    `, [
      title, description, due_date, due_time, priority, task_type,
      assigned_to || createdBy, createdBy, related_type, related_id,
      reminder_at, notes, JSON.stringify(metadata)
    ]);

    this.invalidateCache();

    return this.enrichTask(result.rows[0]);
  }

  /**
   * Get task by ID
   */
  async getTaskById(id) {
    const result = await this.pool.query(`
      SELECT t.*,
        CONCAT(u1.first_name, ' ', u1.last_name) as assigned_to_name,
        CONCAT(u2.first_name, ' ', u2.last_name) as created_by_name
      FROM tasks t
      LEFT JOIN users u1 ON t.assigned_to = u1.id
      LEFT JOIN users u2 ON t.created_by = u2.id
      WHERE t.id = $1
    `, [id]);

    if (result.rows.length === 0) return null;

    return this.enrichTask(result.rows[0]);
  }

  /**
   * Get tasks with filters
   */
  async getTasks(filters = {}) {
    const {
      status,
      priority,
      task_type,
      assigned_to,
      related_type,
      related_id,
      due_before,
      due_after,
      include_completed = false,
      page = 1,
      limit = 20,
      sort_by = 'due_date',
      sort_dir = 'ASC'
    } = filters;

    let whereClause = 'WHERE 1=1';
    const params = [];
    let paramCount = 0;

    if (!include_completed) {
      whereClause += ` AND t.status NOT IN ('completed', 'cancelled')`;
    }

    if (status) {
      params.push(status);
      whereClause += ` AND t.status = $${++paramCount}`;
    }

    if (priority) {
      params.push(priority);
      whereClause += ` AND t.priority = $${++paramCount}`;
    }

    if (task_type) {
      params.push(task_type);
      whereClause += ` AND t.task_type = $${++paramCount}`;
    }

    if (assigned_to) {
      params.push(assigned_to);
      whereClause += ` AND t.assigned_to = $${++paramCount}`;
    }

    if (related_type) {
      params.push(related_type);
      whereClause += ` AND t.related_type = $${++paramCount}`;
    }

    if (related_id) {
      params.push(related_id);
      whereClause += ` AND t.related_id = $${++paramCount}`;
    }

    if (due_before) {
      params.push(due_before);
      whereClause += ` AND t.due_date <= $${++paramCount}`;
    }

    if (due_after) {
      params.push(due_after);
      whereClause += ` AND t.due_date >= $${++paramCount}`;
    }

    // Count total
    const countResult = await this.pool.query(
      `SELECT COUNT(*) FROM tasks t ${whereClause}`,
      params
    );
    const total = parseInt(countResult.rows[0].count);

    // Get tasks
    const offset = (page - 1) * limit;
    params.push(limit, offset);

    const validSortColumns = ['due_date', 'created_at', 'priority', 'status', 'title'];
    const sortColumn = validSortColumns.includes(sort_by) ? sort_by : 'due_date';
    const sortDirection = sort_dir.toUpperCase() === 'DESC' ? 'DESC' : 'ASC';

    // Handle priority sorting specially
    let orderBy = `t.${sortColumn} ${sortDirection}`;
    if (sortColumn === 'priority') {
      orderBy = `CASE t.priority WHEN 'urgent' THEN 1 WHEN 'high' THEN 2 WHEN 'normal' THEN 3 WHEN 'low' THEN 4 END ${sortDirection}`;
    }

    const result = await this.pool.query(`
      SELECT t.*,
        CONCAT(u1.first_name, ' ', u1.last_name) as assigned_to_name,
        CONCAT(u2.first_name, ' ', u2.last_name) as created_by_name
      FROM tasks t
      LEFT JOIN users u1 ON t.assigned_to = u1.id
      LEFT JOIN users u2 ON t.created_by = u2.id
      ${whereClause}
      ORDER BY ${orderBy}, t.due_date ASC NULLS LAST
      LIMIT $${++paramCount} OFFSET $${++paramCount}
    `, params);

    return {
      tasks: result.rows.map(t => this.enrichTask(t)),
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit)
      }
    };
  }

  /**
   * Update a task
   */
  async updateTask(id, updates, updatedBy = null) {
    const allowedFields = [
      'title', 'description', 'due_date', 'due_time', 'status',
      'priority', 'task_type', 'assigned_to', 'reminder_at', 'notes', 'metadata'
    ];

    const setClauses = [];
    const values = [];
    let paramCount = 0;

    for (const [key, value] of Object.entries(updates)) {
      if (allowedFields.includes(key) && value !== undefined) {
        setClauses.push(`${key} = $${++paramCount}`);
        values.push(key === 'metadata' ? JSON.stringify(value) : value);
      }
    }

    if (setClauses.length === 0) return null;

    // Handle completion
    if (updates.status === 'completed') {
      setClauses.push(`completed_at = CURRENT_TIMESTAMP`);
      if (updatedBy) {
        setClauses.push(`completed_by = $${++paramCount}`);
        values.push(updatedBy);
      }
    }

    values.push(id);

    const result = await this.pool.query(`
      UPDATE tasks
      SET ${setClauses.join(', ')}
      WHERE id = $${++paramCount}
      RETURNING *
    `, values);

    if (result.rows.length === 0) return null;

    this.invalidateCache();

    return this.enrichTask(result.rows[0]);
  }

  /**
   * Complete a task
   */
  async completeTask(id, completedBy = null, notes = null) {
    const updates = { status: 'completed' };
    if (notes) updates.notes = notes;

    return this.updateTask(id, updates, completedBy);
  }

  /**
   * Delete a task
   */
  async deleteTask(id) {
    const result = await this.pool.query(
      'DELETE FROM tasks WHERE id = $1 RETURNING id',
      [id]
    );

    if (result.rows.length === 0) return false;

    this.invalidateCache();

    return true;
  }

  /**
   * Get tasks due today
   */
  async getTasksDueToday(assignedTo = null) {
    let query = `
      SELECT t.*,
        CONCAT(u1.first_name, ' ', u1.last_name) as assigned_to_name,
        l.contact_name as related_lead_name,
        l.lead_number as related_lead_number,
        q.quotation_number as related_quote_number,
        c.name as related_customer_name
      FROM tasks t
      LEFT JOIN users u1 ON t.assigned_to = u1.id
      LEFT JOIN leads l ON t.related_type = 'lead' AND t.related_id = l.id
      LEFT JOIN quotations q ON t.related_type = 'quote' AND t.related_id = q.id
      LEFT JOIN customers c ON t.related_type = 'customer' AND t.related_id = c.id
      WHERE t.status NOT IN ('completed', 'cancelled')
        AND DATE(t.due_date) = CURRENT_DATE
    `;

    const params = [];
    if (assignedTo) {
      params.push(assignedTo);
      query += ` AND t.assigned_to = $1`;
    }

    query += ` ORDER BY t.due_time ASC NULLS LAST, t.priority DESC`;

    const result = await this.pool.query(query, params);

    return result.rows.map(t => this.enrichTask(t));
  }

  /**
   * Get overdue tasks
   */
  async getOverdueTasks(assignedTo = null) {
    let query = `
      SELECT t.*,
        CONCAT(u1.first_name, ' ', u1.last_name) as assigned_to_name,
        l.contact_name as related_lead_name,
        l.lead_number as related_lead_number
      FROM tasks t
      LEFT JOIN users u1 ON t.assigned_to = u1.id
      LEFT JOIN leads l ON t.related_type = 'lead' AND t.related_id = l.id
      WHERE t.status NOT IN ('completed', 'cancelled')
        AND t.due_date < CURRENT_DATE
    `;

    const params = [];
    if (assignedTo) {
      params.push(assignedTo);
      query += ` AND t.assigned_to = $1`;
    }

    query += ` ORDER BY t.due_date ASC`;

    const result = await this.pool.query(query, params);

    return result.rows.map(t => this.enrichTask(t));
  }

  /**
   * Get upcoming tasks (next 7 days)
   */
  async getUpcomingTasks(assignedTo = null, days = 7) {
    let query = `
      SELECT t.*,
        CONCAT(u1.first_name, ' ', u1.last_name) as assigned_to_name,
        l.contact_name as related_lead_name,
        l.lead_number as related_lead_number,
        q.quotation_number as related_quote_number,
        c.name as related_customer_name
      FROM tasks t
      LEFT JOIN users u1 ON t.assigned_to = u1.id
      LEFT JOIN leads l ON t.related_type = 'lead' AND t.related_id = l.id
      LEFT JOIN quotations q ON t.related_type = 'quote' AND t.related_id = q.id
      LEFT JOIN customers c ON t.related_type = 'customer' AND t.related_id = c.id
      WHERE t.status NOT IN ('completed', 'cancelled')
        AND t.due_date > CURRENT_DATE
        AND t.due_date <= CURRENT_DATE + INTERVAL '${days} days'
    `;

    const params = [];
    if (assignedTo) {
      params.push(assignedTo);
      query += ` AND t.assigned_to = $1`;
    }

    query += ` ORDER BY t.due_date ASC, t.due_time ASC NULLS LAST`;

    const result = await this.pool.query(query, params);

    return result.rows.map(t => this.enrichTask(t));
  }

  /**
   * Get task summary/stats
   */
  async getTaskStats(assignedTo = null) {
    let whereClause = '';
    const params = [];

    if (assignedTo) {
      params.push(assignedTo);
      whereClause = 'WHERE assigned_to = $1';
    }

    const result = await this.pool.query(`
      SELECT
        COUNT(*) FILTER (WHERE status NOT IN ('completed', 'cancelled')) as total_open,
        COUNT(*) FILTER (WHERE status NOT IN ('completed', 'cancelled') AND due_date < CURRENT_DATE) as overdue,
        COUNT(*) FILTER (WHERE status NOT IN ('completed', 'cancelled') AND DATE(due_date) = CURRENT_DATE) as due_today,
        COUNT(*) FILTER (WHERE status NOT IN ('completed', 'cancelled') AND due_date > CURRENT_DATE AND due_date <= CURRENT_DATE + INTERVAL '7 days') as upcoming,
        COUNT(*) FILTER (WHERE status = 'completed' AND completed_at >= CURRENT_DATE - INTERVAL '7 days') as completed_this_week,
        COUNT(*) FILTER (WHERE priority = 'urgent' AND status NOT IN ('completed', 'cancelled')) as urgent
      FROM tasks
      ${whereClause}
    `, params);

    return {
      totalOpen: parseInt(result.rows[0].total_open) || 0,
      overdue: parseInt(result.rows[0].overdue) || 0,
      dueToday: parseInt(result.rows[0].due_today) || 0,
      upcoming: parseInt(result.rows[0].upcoming) || 0,
      completedThisWeek: parseInt(result.rows[0].completed_this_week) || 0,
      urgent: parseInt(result.rows[0].urgent) || 0
    };
  }

  /**
   * Get tasks pending reminder
   */
  async getTasksForReminder() {
    const result = await this.pool.query(`
      SELECT t.*,
        u.email as assigned_to_email,
        CONCAT(u.first_name, ' ', u.last_name) as assigned_to_name
      FROM tasks t
      LEFT JOIN users u ON t.assigned_to = u.id
      WHERE t.reminder_at <= CURRENT_TIMESTAMP
        AND t.reminder_sent = FALSE
        AND t.status NOT IN ('completed', 'cancelled')
    `);

    return result.rows;
  }

  /**
   * Mark reminder as sent
   */
  async markReminderSent(taskId) {
    await this.pool.query(
      'UPDATE tasks SET reminder_sent = TRUE WHERE id = $1',
      [taskId]
    );
  }

  /**
   * Create task from lead follow-up
   */
  async createFromLeadFollowUp(leadId, dueDate, assignedTo = null, createdBy = null) {
    const leadResult = await this.pool.query(
      'SELECT id, lead_number, contact_name FROM leads WHERE id = $1',
      [leadId]
    );

    if (leadResult.rows.length === 0) return null;

    const lead = leadResult.rows[0];

    return this.createTask({
      title: `Follow up with ${lead.contact_name}`,
      description: `Follow-up task for lead ${lead.lead_number}`,
      due_date: dueDate,
      priority: 'normal',
      task_type: 'follow_up',
      assigned_to: assignedTo,
      related_type: 'lead',
      related_id: leadId
    }, createdBy);
  }

  /**
   * Enrich task with computed fields
   */
  enrichTask(task) {
    if (!task) return null;

    const now = new Date();
    const dueDate = task.due_date ? new Date(task.due_date) : null;

    return {
      ...task,
      isOverdue: dueDate && dueDate < now && task.status !== 'completed' && task.status !== 'cancelled',
      isDueToday: dueDate && dueDate.toDateString() === now.toDateString(),
      daysUntilDue: dueDate ? Math.ceil((dueDate - now) / (1000 * 60 * 60 * 24)) : null
    };
  }

  /**
   * Invalidate cache
   */
  invalidateCache() {
    if (this.cache) {
      this.cache.invalidatePattern('tasks:');
    }
  }
}

module.exports = TaskService;
