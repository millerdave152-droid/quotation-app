/**
 * Draft Service
 * Handles draft persistence for quotes, POS, and orders
 * Supports offline sync and conflict resolution
 */

class DraftService {
  constructor(pool) {
    this.pool = pool;
  }

  /**
   * Create or update a draft
   * Uses upsert based on draft_key if provided
   */
  async saveDraft(draftData, userId) {
    const {
      draftType,
      draftKey,
      deviceId,
      registerId,
      customerId,
      quoteId,
      data,
      itemCount,
      totalCents,
      customerName,
      label,
      expiresAt,
      syncVersion,
    } = draftData;

    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');

      let result;

      // If draft_key provided, try to upsert
      if (draftKey) {
        // Check for existing draft with this key
        const existing = await client.query(
          'SELECT id, sync_version FROM drafts WHERE draft_key = $1',
          [draftKey]
        );

        if (existing.rows.length > 0) {
          const existingDraft = existing.rows[0];

          // Conflict detection: if server version is newer, reject
          if (syncVersion && existingDraft.sync_version > syncVersion) {
            throw {
              code: 'SYNC_CONFLICT',
              message: 'Draft has been modified since last sync',
              serverVersion: existingDraft.sync_version,
              clientVersion: syncVersion,
            };
          }

          // Update existing draft
          result = await client.query(`
            UPDATE drafts SET
              draft_type = COALESCE($2, draft_type),
              device_id = COALESCE($3, device_id),
              register_id = $4,
              customer_id = $5,
              quote_id = $6,
              data = $7,
              item_count = COALESCE($8, item_count),
              total_cents = COALESCE($9, total_cents),
              customer_name = COALESCE($10, customer_name),
              label = COALESCE($11, label),
              expires_at = $12,
              is_synced = TRUE,
              last_synced_at = NOW()
            WHERE id = $1
            RETURNING *
          `, [
            existingDraft.id,
            draftType,
            deviceId,
            registerId,
            customerId,
            quoteId,
            JSON.stringify(data),
            itemCount,
            totalCents,
            customerName,
            label,
            expiresAt,
          ]);

          // Log to history
          await client.query(`
            INSERT INTO draft_history (draft_id, action, changed_by, data_snapshot)
            VALUES ($1, 'updated', $2, $3)
          `, [existingDraft.id, userId, JSON.stringify(data)]);
        } else {
          // Create new draft
          result = await client.query(`
            INSERT INTO drafts (
              draft_type, draft_key, user_id, device_id, register_id,
              customer_id, quote_id, data, item_count, total_cents,
              customer_name, label, expires_at, is_synced, last_synced_at
            ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, TRUE, NOW())
            RETURNING *
          `, [
            draftType,
            draftKey,
            userId,
            deviceId,
            registerId,
            customerId,
            quoteId,
            JSON.stringify(data),
            itemCount,
            totalCents,
            customerName,
            label,
            expiresAt,
          ]);

          // Log to history
          await client.query(`
            INSERT INTO draft_history (draft_id, action, changed_by, data_snapshot)
            VALUES ($1, 'created', $2, $3)
          `, [result.rows[0].id, userId, JSON.stringify(data)]);
        }
      } else {
        // No draft_key, always create new
        result = await client.query(`
          INSERT INTO drafts (
            draft_type, user_id, device_id, register_id,
            customer_id, quote_id, data, item_count, total_cents,
            customer_name, label, expires_at, is_synced, last_synced_at
          ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, TRUE, NOW())
          RETURNING *
        `, [
          draftType,
          userId,
          deviceId,
          registerId,
          customerId,
          quoteId,
          JSON.stringify(data),
          itemCount,
          totalCents,
          customerName,
          label,
          expiresAt,
        ]);

        // Log to history
        await client.query(`
          INSERT INTO draft_history (draft_id, action, changed_by, data_snapshot)
          VALUES ($1, 'created', $2, $3)
        `, [result.rows[0].id, userId, JSON.stringify(data)]);
      }

      await client.query('COMMIT');

      const draft = result.rows[0];
      return {
        ...draft,
        data: typeof draft.data === 'string' ? JSON.parse(draft.data) : draft.data,
      };
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  /**
   * Get a draft by ID
   */
  async getDraft(draftId) {
    const result = await this.pool.query(`
      SELECT d.*, u.first_name || ' ' || u.last_name as username, r.register_name
      FROM drafts d
      LEFT JOIN users u ON d.user_id = u.id
      LEFT JOIN registers r ON d.register_id = r.register_id
      WHERE d.id = $1
    `, [draftId]);

    if (result.rows.length === 0) {
      return null;
    }

    const draft = result.rows[0];
    return {
      ...draft,
      data: typeof draft.data === 'string' ? JSON.parse(draft.data) : draft.data,
    };
  }

  /**
   * Get a draft by key
   */
  async getDraftByKey(draftKey) {
    const result = await this.pool.query(`
      SELECT d.*, u.first_name || ' ' || u.last_name as username, r.register_name
      FROM drafts d
      LEFT JOIN users u ON d.user_id = u.id
      LEFT JOIN registers r ON d.register_id = r.register_id
      WHERE d.draft_key = $1
    `, [draftKey]);

    if (result.rows.length === 0) {
      return null;
    }

    const draft = result.rows[0];
    return {
      ...draft,
      data: typeof draft.data === 'string' ? JSON.parse(draft.data) : draft.data,
    };
  }

  /**
   * List drafts for a user
   */
  async listDrafts(options = {}) {
    const {
      userId,
      draftType,
      deviceId,
      registerId,
      includeExpired = false,
      limit = 50,
      offset = 0,
    } = options;

    const conditions = [];
    const params = [];
    let paramIndex = 1;

    if (userId) {
      conditions.push(`d.user_id = $${paramIndex++}`);
      params.push(userId);
    }

    if (draftType) {
      conditions.push(`d.draft_type = $${paramIndex++}`);
      params.push(draftType);
    }

    if (deviceId) {
      conditions.push(`d.device_id = $${paramIndex++}`);
      params.push(deviceId);
    }

    if (registerId) {
      conditions.push(`d.register_id = $${paramIndex++}`);
      params.push(registerId);
    }

    if (!includeExpired) {
      conditions.push(`(d.expires_at IS NULL OR d.expires_at > NOW())`);
    }

    const whereClause = conditions.length > 0
      ? `WHERE ${conditions.join(' AND ')}`
      : '';

    // Get total count
    const countResult = await this.pool.query(
      `SELECT COUNT(*) as total FROM drafts d ${whereClause}`,
      params
    );
    const total = parseInt(countResult.rows[0].total);

    // Get drafts
    const result = await this.pool.query(`
      SELECT
        d.id,
        d.draft_type,
        d.draft_key,
        d.user_id,
        u.first_name || ' ' || u.last_name as username,
        d.register_id,
        r.register_name,
        d.device_id,
        d.customer_id,
        c.name as customer_name_lookup,
        d.item_count,
        d.total_cents,
        d.customer_name,
        d.label,
        d.created_at,
        d.updated_at,
        d.sync_version,
        d.is_synced
      FROM drafts d
      LEFT JOIN users u ON d.user_id = u.id
      LEFT JOIN registers r ON d.register_id = r.register_id
      LEFT JOIN customers c ON d.customer_id = c.id
      ${whereClause}
      ORDER BY d.updated_at DESC
      LIMIT $${paramIndex++} OFFSET $${paramIndex++}
    `, [...params, limit, offset]);

    return {
      drafts: result.rows,
      total,
      limit,
      offset,
    };
  }

  /**
   * Delete a draft
   */
  async deleteDraft(draftId, userId) {
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');

      // Get draft for history
      const existing = await client.query(
        'SELECT * FROM drafts WHERE id = $1',
        [draftId]
      );

      if (existing.rows.length === 0) {
        throw { code: 'NOT_FOUND', message: 'Draft not found' };
      }

      // Log to history
      await client.query(`
        INSERT INTO draft_history (draft_id, action, changed_by, data_snapshot)
        VALUES ($1, 'deleted', $2, $3)
      `, [draftId, userId, existing.rows[0].data]);

      // Delete draft
      await client.query('DELETE FROM drafts WHERE id = $1', [draftId]);

      await client.query('COMMIT');
      return true;
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  /**
   * Mark draft as completed (e.g., when converted to quote/transaction)
   */
  async completeDraft(draftId, userId, notes = '') {
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');

      // Get draft for history
      const existing = await client.query(
        'SELECT * FROM drafts WHERE id = $1',
        [draftId]
      );

      if (existing.rows.length === 0) {
        throw { code: 'NOT_FOUND', message: 'Draft not found' };
      }

      // Log to history
      await client.query(`
        INSERT INTO draft_history (draft_id, action, changed_by, data_snapshot, notes)
        VALUES ($1, 'completed', $2, $3, $4)
      `, [draftId, userId, existing.rows[0].data, notes]);

      // Delete draft
      await client.query('DELETE FROM drafts WHERE id = $1', [draftId]);

      await client.query('COMMIT');
      return true;
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  /**
   * Queue an operation for sync
   */
  async queueSyncOperation(operation) {
    const {
      operationType,
      entityType,
      entityId,
      userId,
      deviceId,
      payload,
      priority = 10,
    } = operation;

    const result = await this.pool.query(`
      INSERT INTO sync_queue (
        operation_type, entity_type, entity_id,
        user_id, device_id, payload, priority
      ) VALUES ($1, $2, $3, $4, $5, $6, $7)
      RETURNING *
    `, [operationType, entityType, entityId, userId, deviceId, JSON.stringify(payload), priority]);

    return result.rows[0];
  }

  /**
   * Get pending sync operations for a device/user
   */
  async getPendingSyncOperations(options = {}) {
    const { userId, deviceId, limit = 100 } = options;

    const conditions = [`status IN ('pending', 'failed')`, `retry_count < max_retries`];
    const params = [];
    let paramIndex = 1;

    if (userId) {
      conditions.push(`user_id = $${paramIndex++}`);
      params.push(userId);
    }

    if (deviceId) {
      conditions.push(`device_id = $${paramIndex++}`);
      params.push(deviceId);
    }

    const result = await this.pool.query(`
      SELECT * FROM sync_queue
      WHERE ${conditions.join(' AND ')}
      ORDER BY priority, created_at
      LIMIT $${paramIndex}
    `, [...params, limit]);

    return result.rows.map(row => ({
      ...row,
      payload: typeof row.payload === 'string' ? JSON.parse(row.payload) : row.payload,
    }));
  }

  /**
   * Process a sync operation
   */
  async processSyncOperation(operationId, success, errorMessage = null) {
    if (success) {
      await this.pool.query(`
        UPDATE sync_queue
        SET status = 'completed', processed_at = NOW()
        WHERE id = $1
      `, [operationId]);
    } else {
      await this.pool.query(`
        UPDATE sync_queue
        SET status = 'failed', retry_count = retry_count + 1, error_message = $2
        WHERE id = $1
      `, [operationId, errorMessage]);
    }
  }

  /**
   * Batch sync operations from client
   */
  async batchSync(operations, userId, deviceId) {
    const results = [];
    const client = await this.pool.connect();

    try {
      await client.query('BEGIN');

      for (const op of operations) {
        try {
          let result;

          switch (op.type) {
            case 'save_draft':
              result = await this.saveDraft({
                ...op.payload,
                deviceId,
              }, userId);
              results.push({ id: op.id, success: true, data: result });
              break;

            case 'delete_draft':
              await this.deleteDraft(op.payload.draftId, userId);
              results.push({ id: op.id, success: true });
              break;

            case 'complete_draft':
              await this.completeDraft(op.payload.draftId, userId, op.payload.notes);
              results.push({ id: op.id, success: true });
              break;

            default:
              // Queue unknown operations for manual processing
              const queued = await this.queueSyncOperation({
                operationType: op.type,
                entityType: op.entityType || 'unknown',
                entityId: op.entityId,
                userId,
                deviceId,
                payload: op.payload,
              });
              results.push({ id: op.id, success: true, queued: queued.id });
          }
        } catch (error) {
          results.push({
            id: op.id,
            success: false,
            error: error.code || 'UNKNOWN_ERROR',
            message: error.message,
          });
        }
      }

      await client.query('COMMIT');
      return results;
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  /**
   * Clean up expired drafts
   */
  async cleanupExpiredDrafts() {
    const result = await this.pool.query('SELECT clean_expired_drafts()');
    return result.rows[0].clean_expired_drafts;
  }
}

module.exports = DraftService;
