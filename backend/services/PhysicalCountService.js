const { ApiError } = require('../middleware/errorHandler');

class PhysicalCountService {
  constructor(pool, cache = null) {
    this.pool = pool;
    this.cache = cache;
  }

  async _generateCountNumber(client) {
    const db = client || this.pool;
    const today = new Date().toISOString().slice(0, 10).replace(/-/g, '');
    const { rows } = await db.query(
      'SELECT count_number FROM physical_counts WHERE count_number LIKE $1 ORDER BY count_number DESC LIMIT 1',
      [`PC-${today}-%`]
    );
    let seq = 1;
    if (rows.length) {
      const last = rows[0].count_number.split('-')[2];
      seq = parseInt(last) + 1;
    }
    return `PC-${today}-${String(seq).padStart(4, '0')}`;
  }

  async createCount(locationId, countType, userId, notes = null) {
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      const countNumber = await this._generateCountNumber(client);

      const { rows: [count] } = await client.query(
        `INSERT INTO physical_counts (count_number, location_id, count_type, status, started_by, notes)
         VALUES ($1, $2, $3, 'draft', $4, $5) RETURNING *`,
        [countNumber, locationId, countType, userId, notes]
      );

      await client.query('COMMIT');
      return count;
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
  }

  async startCount(countId, userId) {
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');

      const { rows: [count] } = await client.query(
        'SELECT * FROM physical_counts WHERE id = $1', [countId]
      );
      if (!count) throw new ApiError(404, 'Count not found');
      if (count.status !== 'draft') throw new ApiError(400, 'Count must be in draft status to start');

      // Snapshot current inventory as expected quantities
      const { rows: items } = await client.query(
        `INSERT INTO physical_count_items (physical_count_id, product_id, expected_qty, unit_cost_cents)
         SELECT $1, li.product_id, li.quantity_on_hand, COALESCE(p.cost * 100, 0)::int
         FROM location_inventory li
         JOIN products p ON p.id = li.product_id
         WHERE li.location_id = $2 AND li.quantity_on_hand > 0
         RETURNING *`,
        [countId, count.location_id]
      );

      await client.query(
        `UPDATE physical_counts SET status = 'in_progress', started_at = NOW(),
         total_items = $2, updated_at = NOW() WHERE id = $1`,
        [countId, items.length]
      );

      await client.query('COMMIT');
      return { ...count, status: 'in_progress', total_items: items.length };
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
  }

  async recordCount(countId, productId, countedQty, userId, scannedBarcode = null) {
    const { rows: [count] } = await this.pool.query(
      'SELECT * FROM physical_counts WHERE id = $1', [countId]
    );
    if (!count) throw new ApiError(404, 'Count not found');
    if (count.status !== 'in_progress') throw new ApiError(400, 'Count must be in progress');

    const { rows: [item] } = await this.pool.query(
      `UPDATE physical_count_items SET counted_qty = $3, counted_by = $4, counted_at = NOW(),
       scanned_barcode = COALESCE($5, scanned_barcode)
       WHERE physical_count_id = $1 AND product_id = $2 RETURNING *`,
      [countId, productId, countedQty, userId, scannedBarcode]
    );

    if (!item) {
      // Product not in expected list — add as unexpected find
      const { rows: [newItem] } = await this.pool.query(
        `INSERT INTO physical_count_items (physical_count_id, product_id, expected_qty, counted_qty, counted_by, counted_at, scanned_barcode, unit_cost_cents)
         SELECT $1, $2, 0, $3, $4, NOW(), $5, COALESCE(p.cost * 100, 0)::int
         FROM products p WHERE p.id = $2 RETURNING *`,
        [countId, productId, countedQty, userId, scannedBarcode]
      );
      return newItem;
    }

    // Update total counted
    await this.pool.query(
      `UPDATE physical_counts SET total_counted = (
        SELECT COUNT(*) FROM physical_count_items WHERE physical_count_id = $1 AND counted_qty IS NOT NULL
       ), updated_at = NOW() WHERE id = $1`,
      [countId]
    );

    return item;
  }

  async bulkRecordCounts(countId, entries, userId) {
    const results = [];
    for (const entry of entries) {
      const item = await this.recordCount(countId, entry.productId, entry.countedQty, userId, entry.barcode);
      results.push(item);
    }
    return results;
  }

  async completeCount(countId, userId) {
    const { rows: [count] } = await this.pool.query(
      `UPDATE physical_counts SET status = 'review', completed_at = NOW(),
       total_variance_units = (SELECT COALESCE(SUM(ABS(variance)), 0) FROM physical_count_items WHERE physical_count_id = $1),
       total_variance_cost_cents = (SELECT COALESCE(SUM(ABS(variance_cost_cents)), 0) FROM physical_count_items WHERE physical_count_id = $1),
       updated_at = NOW()
       WHERE id = $1 AND status = 'in_progress' RETURNING *`,
      [countId]
    );
    if (!count) throw new ApiError(400, 'Count must be in progress to complete');
    return count;
  }

  async approveCount(countId, userId) {
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');

      const { rows: [count] } = await client.query(
        'SELECT * FROM physical_counts WHERE id = $1 AND status = \'review\'', [countId]
      );
      if (!count) throw new ApiError(400, 'Count must be in review status to approve');

      // Get all items with variance
      const { rows: items } = await client.query(
        'SELECT * FROM physical_count_items WHERE physical_count_id = $1 AND variance != 0',
        [countId]
      );

      // Create inventory adjustments for each variance
      for (const item of items) {
        const adjustQty = item.variance;
        await client.query(
          `UPDATE location_inventory SET quantity_on_hand = quantity_on_hand + $3, updated_at = NOW()
           WHERE location_id = $1 AND product_id = $2`,
          [count.location_id, item.product_id, adjustQty]
        );

        // Record in inventory_transactions if table exists
        await client.query(
          `INSERT INTO inventory_transactions (product_id, location_id, transaction_type, quantity, reference_type, reference_id, notes, created_by)
           VALUES ($1, $2, CASE WHEN $3 > 0 THEN 'adjustment_in' ELSE 'adjustment_out' END, ABS($3), 'physical_count', $4, 'Physical count adjustment', $5)`,
          [item.product_id, count.location_id, adjustQty, countId, userId]
        ).catch(() => {}); // ignore if table doesn't exist
      }

      await client.query(
        `UPDATE physical_counts SET status = 'approved', approved_by = $2, approved_at = NOW(), updated_at = NOW()
         WHERE id = $1`,
        [countId, userId]
      );

      await client.query('COMMIT');
      return { ...count, status: 'approved', adjustments: items.length };
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
  }

  async getCount(countId) {
    const { rows: [count] } = await this.pool.query(
      `SELECT pc.*, l.name as location_name, u.name as started_by_name
       FROM physical_counts pc
       LEFT JOIN locations l ON l.id = pc.location_id
       LEFT JOIN users u ON u.id = pc.started_by
       WHERE pc.id = $1`, [countId]
    );
    if (!count) throw new ApiError(404, 'Count not found');

    const { rows: items } = await this.pool.query(
      `SELECT pci.*, p.name as product_name, p.sku, p.upc
       FROM physical_count_items pci
       JOIN products p ON p.id = pci.product_id
       WHERE pci.physical_count_id = $1
       ORDER BY p.name`,
      [countId]
    );

    return { ...count, items };
  }

  async listCounts({ locationId, status, limit = 50, offset = 0 } = {}) {
    const conditions = [];
    const params = [];
    let pi = 1;

    if (locationId) { conditions.push(`pc.location_id = $${pi++}`); params.push(locationId); }
    if (status) { conditions.push(`pc.status = $${pi++}`); params.push(status); }

    const where = conditions.length ? 'WHERE ' + conditions.join(' AND ') : '';

    const { rows } = await this.pool.query(
      `SELECT pc.*, l.name as location_name, u.name as started_by_name
       FROM physical_counts pc
       LEFT JOIN locations l ON l.id = pc.location_id
       LEFT JOIN users u ON u.id = pc.started_by
       ${where}
       ORDER BY pc.created_at DESC
       LIMIT $${pi++} OFFSET $${pi++}`,
      [...params, limit, offset]
    );

    const { rows: [{ total }] } = await this.pool.query(
      `SELECT COUNT(*)::int as total FROM physical_counts pc ${where}`, params
    );

    return { counts: rows, total };
  }

  async getVarianceReport(countId) {
    const { rows } = await this.pool.query(
      `SELECT pci.*, p.name as product_name, p.sku, p.upc,
       pci.variance as variance_qty, pci.variance_cost_cents
       FROM physical_count_items pci
       JOIN products p ON p.id = pci.product_id
       WHERE pci.physical_count_id = $1 AND pci.variance != 0
       ORDER BY ABS(pci.variance_cost_cents) DESC`,
      [countId]
    );

    const summary = {
      total_items: rows.length,
      positive_variance: rows.filter(r => r.variance > 0).reduce((s, r) => s + r.variance, 0),
      negative_variance: rows.filter(r => r.variance < 0).reduce((s, r) => s + r.variance, 0),
      total_cost_impact: rows.reduce((s, r) => s + (r.variance_cost_cents || 0), 0)
    };

    return { items: rows, summary };
  }

  async getAbcClassification(locationId) {
    const { rows } = await this.pool.query(
      `SELECT p.id, p.name, p.sku, li.quantity_on_hand,
       p.cost * li.quantity_on_hand as inventory_value,
       SUM(p.cost * li.quantity_on_hand) OVER () as total_value,
       SUM(p.cost * li.quantity_on_hand) OVER (ORDER BY p.cost * li.quantity_on_hand DESC) as cumulative_value
       FROM location_inventory li
       JOIN products p ON p.id = li.product_id
       WHERE li.location_id = $1 AND li.quantity_on_hand > 0
       ORDER BY p.cost * li.quantity_on_hand DESC`,
      [locationId]
    );

    let totalValue = rows.length > 0 ? parseFloat(rows[0].total_value) : 0;
    return rows.map(r => {
      const cumPct = totalValue > 0 ? (parseFloat(r.cumulative_value) / totalValue) * 100 : 0;
      return {
        ...r,
        abc_class: cumPct <= 80 ? 'A' : cumPct <= 95 ? 'B' : 'C',
        cumulative_pct: Math.round(cumPct * 100) / 100
      };
    });
  }

  async generateCycleCount(locationId) {
    const { rows: schedules } = await this.pool.query(
      'SELECT * FROM cycle_count_schedule WHERE location_id = $1 AND is_active = TRUE AND next_count_date <= CURRENT_DATE',
      [locationId]
    );

    const counts = [];
    for (const schedule of schedules) {
      const count = await this.createCount(locationId, 'cycle', null, `Auto-generated cycle count for class ${schedule.abc_class}`);

      // Update next count date
      await this.pool.query(
        `UPDATE cycle_count_schedule SET next_count_date = CURRENT_DATE + interval '1 day' * frequency_days,
         last_count_date = CURRENT_DATE, updated_at = NOW() WHERE id = $1`,
        [schedule.id]
      );

      counts.push(count);
    }

    return counts;
  }
}

module.exports = PhysicalCountService;
