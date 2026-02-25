const { ApiError } = require('../middleware/errorHandler');
const crypto = require('crypto');

class AudienceSyncService {
  constructor(pool, cache = null) {
    this.pool = pool;
    this.cache = cache;
  }

  async createSync(data, userId) {
    const { rows: [sync] } = await this.pool.query(
      `INSERT INTO audience_syncs (name, platform, segment_rules, external_audience_id, sync_frequency_hours, is_active, created_by)
       VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING *`,
      [data.name, data.platform || 'facebook', JSON.stringify(data.segmentRules || {}),
       data.externalAudienceId || null, data.syncFrequencyHours || 24,
       data.isActive !== false, userId]
    );
    return sync;
  }

  async listSyncs() {
    const { rows } = await this.pool.query(
      `SELECT as2.*,
       (SELECT COUNT(*)::int FROM audience_sync_log WHERE sync_id = as2.id) as total_runs,
       (SELECT members_added FROM audience_sync_log WHERE sync_id = as2.id ORDER BY started_at DESC LIMIT 1) as last_members_added
       FROM audience_syncs as2 ORDER BY as2.created_at DESC`
    );
    return rows;
  }

  async updateSync(syncId, data) {
    const fields = [];
    const params = [];
    let pi = 1;
    if (data.name !== undefined) { fields.push(`name = $${pi++}`); params.push(data.name); }
    if (data.segmentRules !== undefined) { fields.push(`segment_rules = $${pi++}`); params.push(JSON.stringify(data.segmentRules)); }
    if (data.externalAudienceId !== undefined) { fields.push(`external_audience_id = $${pi++}`); params.push(data.externalAudienceId); }
    if (data.syncFrequencyHours !== undefined) { fields.push(`sync_frequency_hours = $${pi++}`); params.push(data.syncFrequencyHours); }
    if (data.isActive !== undefined) { fields.push(`is_active = $${pi++}`); params.push(data.isActive); }

    if (!fields.length) throw new ApiError(400, 'No valid fields');
    fields.push('updated_at = NOW()');
    params.push(syncId);

    const { rows: [sync] } = await this.pool.query(
      `UPDATE audience_syncs SET ${fields.join(', ')} WHERE id = $${pi} RETURNING *`, params
    );
    if (!sync) throw new ApiError(404, 'Sync not found');
    return sync;
  }

  async runSync(syncId) {
    const { rows: [config] } = await this.pool.query(
      'SELECT * FROM audience_syncs WHERE id = $1', [syncId]
    );
    if (!config) throw new ApiError(404, 'Sync config not found');

    const { rows: [log] } = await this.pool.query(
      'INSERT INTO audience_sync_log (sync_id) VALUES ($1) RETURNING *', [syncId]
    );

    try {
      const members = await this._buildAudience(config.segment_rules);
      const hashed = members.map(m => ({
        email_hash: this._hashForFB(m.email),
        phone_hash: m.phone ? this._hashForFB(m.phone.replace(/\D/g, '')) : null,
        name_hash: m.name ? this._hashForFB(m.name.toLowerCase().trim()) : null
      }));

      await this.pool.query(
        `UPDATE audience_sync_log SET members_matched = $2, members_added = $2, status = 'completed', completed_at = NOW()
         WHERE id = $1`,
        [log.id, hashed.length]
      );

      await this.pool.query(
        'UPDATE audience_syncs SET last_sync_at = NOW() WHERE id = $1', [syncId]
      );

      return { logId: log.id, membersMatched: hashed.length, hashedMembers: hashed };
    } catch (err) {
      await this.pool.query(
        'UPDATE audience_sync_log SET status = \'failed\', error_message = $2, completed_at = NOW() WHERE id = $1',
        [log.id, err.message]
      );
      throw err;
    }
  }

  async _buildAudience(rules) {
    const conditions = [];
    const params = [];
    let pi = 1;

    if (rules.minPurchases) {
      conditions.push(`(SELECT COUNT(*) FROM transactions t WHERE t.customer_id = c.id) >= $${pi++}`);
      params.push(rules.minPurchases);
    }
    if (rules.minSpend) {
      conditions.push(`(SELECT COALESCE(SUM(t.total_amount), 0) FROM transactions t WHERE t.customer_id = c.id) >= $${pi++}`);
      params.push(rules.minSpend);
    }
    if (rules.purchasedSince) {
      conditions.push(`(SELECT MAX(t.created_at) FROM transactions t WHERE t.customer_id = c.id) >= $${pi++}`);
      params.push(rules.purchasedSince);
    }
    if (rules.categoryId) {
      conditions.push(`EXISTS (SELECT 1 FROM transactions t JOIN transaction_items ti ON ti.transaction_id = t.transaction_id JOIN products p ON p.id = ti.product_id WHERE t.customer_id = c.id AND p.category_id = $${pi++})`);
      params.push(rules.categoryId);
    }

    const where = conditions.length ? 'WHERE c.email IS NOT NULL AND ' + conditions.join(' AND ') : 'WHERE c.email IS NOT NULL';

    const { rows } = await this.pool.query(
      `SELECT c.id, c.name, c.email, c.phone FROM customers c ${where}`, params
    );
    return rows;
  }

  _hashForFB(value) {
    if (!value) return null;
    return crypto.createHash('sha256').update(value.toLowerCase().trim()).digest('hex');
  }

  async getSyncLogs(syncId, limit = 20) {
    const { rows } = await this.pool.query(
      'SELECT * FROM audience_sync_log WHERE sync_id = $1 ORDER BY started_at DESC LIMIT $2',
      [syncId, limit]
    );
    return rows;
  }
}

module.exports = AudienceSyncService;
