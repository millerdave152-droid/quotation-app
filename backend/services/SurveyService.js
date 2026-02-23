const { ApiError } = require('../middleware/errorHandler');

class SurveyService {
  constructor(pool, cache = null) {
    this.pool = pool;
    this.cache = cache;
  }

  async createTemplate(data, userId) {
    const { rows: [template] } = await this.pool.query(
      `INSERT INTO survey_templates (name, trigger_event, trigger_delay_hours, questions, google_review_redirect_url, is_active, created_by)
       VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING *`,
      [data.name, data.triggerEvent, data.triggerDelayHours || 24, JSON.stringify(data.questions || []),
       data.googleReviewRedirectUrl || null, data.isActive !== false, userId]
    );
    return template;
  }

  async updateTemplate(templateId, data) {
    const fields = [];
    const params = [];
    let pi = 1;
    if (data.name !== undefined) { fields.push(`name = $${pi++}`); params.push(data.name); }
    if (data.triggerEvent !== undefined) { fields.push(`trigger_event = $${pi++}`); params.push(data.triggerEvent); }
    if (data.triggerDelayHours !== undefined) { fields.push(`trigger_delay_hours = $${pi++}`); params.push(data.triggerDelayHours); }
    if (data.questions !== undefined) { fields.push(`questions = $${pi++}`); params.push(JSON.stringify(data.questions)); }
    if (data.googleReviewRedirectUrl !== undefined) { fields.push(`google_review_redirect_url = $${pi++}`); params.push(data.googleReviewRedirectUrl); }
    if (data.isActive !== undefined) { fields.push(`is_active = $${pi++}`); params.push(data.isActive); }

    if (!fields.length) throw new ApiError(400, 'No valid fields');
    fields.push('updated_at = NOW()');
    params.push(templateId);

    const { rows: [template] } = await this.pool.query(
      `UPDATE survey_templates SET ${fields.join(', ')} WHERE id = $${pi} RETURNING *`, params
    );
    if (!template) throw new ApiError(404, 'Template not found');
    return template;
  }

  async listTemplates() {
    const { rows } = await this.pool.query(
      `SELECT st.*, COUNT(sr.id)::int as response_count,
       ROUND(AVG(sr.overall_rating), 1) as avg_rating
       FROM survey_templates st
       LEFT JOIN survey_responses sr ON sr.template_id = st.id AND sr.completed_at IS NOT NULL
       GROUP BY st.id ORDER BY st.created_at DESC`
    );
    return rows;
  }

  async queueSurvey(templateId, customerId, transactionId = null, workOrderId = null) {
    const { rows: [template] } = await this.pool.query(
      `SELECT * FROM survey_templates WHERE id = $1 AND is_active = TRUE`, [templateId]
    );
    if (!template) return null;

    const { rows: [customer] } = await this.pool.query(
      `SELECT email, phone FROM customers WHERE id = $1`, [customerId]
    );

    const sendAt = new Date(Date.now() + template.trigger_delay_hours * 3600000);

    const { rows: [queued] } = await this.pool.query(
      `INSERT INTO survey_queue (template_id, customer_id, transaction_id, work_order_id, send_at, email, phone)
       VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING *`,
      [templateId, customerId, transactionId, workOrderId, sendAt, customer?.email, customer?.phone]
    );
    return queued;
  }

  async respondToSurvey(token, data) {
    const { rows: [response] } = await this.pool.query(
      `SELECT * FROM survey_responses WHERE token = $1`, [token]
    );
    if (!response) throw new ApiError(404, 'Survey not found');
    if (response.completed_at) throw new ApiError(400, 'Survey already completed');

    const { rows: [updated] } = await this.pool.query(
      `UPDATE survey_responses SET overall_rating = $2, answers = $3, feedback_text = $4,
       redirected_to_google = $5, completed_at = NOW() WHERE id = $1 RETURNING *`,
      [response.id, data.overallRating, JSON.stringify(data.answers || {}),
       data.feedbackText || null, data.redirectedToGoogle || false]
    );
    return updated;
  }

  async getResponses(templateId, { limit = 50, offset = 0 } = {}) {
    const { rows } = await this.pool.query(
      `SELECT sr.*, c.name as customer_name
       FROM survey_responses sr
       LEFT JOIN customers c ON c.id = sr.customer_id
       WHERE sr.template_id = $1 AND sr.completed_at IS NOT NULL
       ORDER BY sr.completed_at DESC LIMIT $2 OFFSET $3`,
      [templateId, limit, offset]
    );
    return rows;
  }

  async getDashboardStats() {
    const { rows: [stats] } = await this.pool.query(`
      SELECT
        COUNT(DISTINCT st.id)::int as template_count,
        COUNT(sr.id) FILTER (WHERE sr.completed_at IS NOT NULL)::int as total_responses,
        ROUND(AVG(sr.overall_rating) FILTER (WHERE sr.completed_at IS NOT NULL), 2) as avg_rating,
        COUNT(sr.id) FILTER (WHERE sr.redirected_to_google = TRUE)::int as google_redirects,
        COUNT(sq.id) FILTER (WHERE sq.status = 'pending')::int as pending_sends
      FROM survey_templates st
      LEFT JOIN survey_responses sr ON sr.template_id = st.id
      LEFT JOIN survey_queue sq ON sq.template_id = st.id
    `);
    return stats;
  }

  async processPendingSurveys() {
    const { rows: pending } = await this.pool.query(
      `SELECT sq.*, st.questions, st.name as template_name
       FROM survey_queue sq
       JOIN survey_templates st ON st.id = sq.template_id
       WHERE sq.status = 'pending' AND sq.send_at <= NOW()
       LIMIT 50`
    );

    for (const item of pending) {
      // Create response record with token
      await this.pool.query(
        `INSERT INTO survey_responses (template_id, customer_id, transaction_id, work_order_id)
         VALUES ($1, $2, $3, $4)`,
        [item.template_id, item.customer_id, item.transaction_id, item.work_order_id]
      );

      await this.pool.query(
        `UPDATE survey_queue SET status = 'sent', sent_at = NOW() WHERE id = $1`, [item.id]
      );
    }

    return pending.length;
  }
}

module.exports = SurveyService;
