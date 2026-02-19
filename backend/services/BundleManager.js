const pool = require('../db');

class BundleManager {
  constructor(pool) {
    this.pool = pool;
  }

  // ─── Create bundle with components in a transaction ────────────────
  async createBundle(data) {
    const { bundleSku, bundleName, bundleDescription, bundlePrice, components, category, imageUrl } = data;
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');

      // Calculate sum of component prices
      const productIds = components.map(function(c) { return c.productId; });
      const { rows: products } = await client.query(
        `SELECT id, price FROM products WHERE id = ANY($1)`,
        [productIds]
      );
      const priceMap = {};
      products.forEach(function(p) { priceMap[p.id] = parseFloat(p.price); });

      var componentsTotal = 0;
      components.forEach(function(c) {
        componentsTotal += (priceMap[c.productId] || 0) * (c.quantity || 1);
      });

      var discountAmount = parseFloat((componentsTotal - bundlePrice).toFixed(2));
      if (discountAmount < 0) discountAmount = 0;

      const { rows: [bundle] } = await client.query(`
        INSERT INTO product_bundles
          (bundle_sku, bundle_name, bundle_description, bundle_price, discount_amount,
           bundle_category, bundle_image_url, is_active, created_at, updated_at)
        VALUES ($1, $2, $3, $4, $5, $6, $7, true, NOW(), NOW())
        RETURNING *
      `, [bundleSku, bundleName, bundleDescription || null, bundlePrice, discountAmount,
          category || null, imageUrl || null]);

      // Insert components
      var insertedComponents = [];
      for (var i = 0; i < components.length; i++) {
        var c = components[i];
        var { rows: [comp] } = await client.query(`
          INSERT INTO bundle_components (bundle_id, product_id, quantity)
          VALUES ($1, $2, $3)
          RETURNING *
        `, [bundle.id, c.productId, c.quantity || 1]);
        insertedComponents.push(comp);
      }

      await client.query('COMMIT');

      return {
        ...this._formatBundle(bundle),
        components_total: componentsTotal,
        components: insertedComponents
      };
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
  }

  // ─── Bundle availability (min component stock / required qty) ──────
  async getBundleAvailability(bundleId) {
    const { rows } = await this.pool.query(`
      SELECT
        bc.product_id,
        p.name AS product_name,
        p.sku,
        bc.quantity AS required_qty,
        COALESCE(p.quantity_in_stock, 0)::int AS current_stock,
        CASE WHEN bc.quantity > 0
          THEN FLOOR(COALESCE(p.quantity_in_stock, 0)::numeric / bc.quantity)::int
          ELSE 0 END AS available_bundles
      FROM bundle_components bc
      JOIN products p ON p.id = bc.product_id
      WHERE bc.bundle_id = $1
      ORDER BY available_bundles ASC
    `, [bundleId]);

    if (rows.length === 0) return { bundleId, maxAvailable: 0, components: [] };

    var maxAvailable = rows[0].available_bundles;
    for (var i = 1; i < rows.length; i++) {
      if (rows[i].available_bundles < maxAvailable) {
        maxAvailable = rows[i].available_bundles;
      }
    }

    var limitingComponent = null;
    for (var j = 0; j < rows.length; j++) {
      if (rows[j].available_bundles === maxAvailable) {
        limitingComponent = rows[j].product_name;
        break;
      }
    }

    return {
      bundleId: bundleId,
      maxAvailable: maxAvailable,
      limitingComponent: limitingComponent,
      components: rows
    };
  }

  // ─── Sync bundle listings to marketplace channels ──────────────────
  async syncBundleListings() {
    const { rows: bundles } = await this.pool.query(
      `SELECT id, bundle_sku, bundle_name, bundle_price, is_active
       FROM product_bundles WHERE bundle_sku IS NOT NULL`
    );

    var results = [];
    for (var i = 0; i < bundles.length; i++) {
      var bundle = bundles[i];
      var avail = await this.getBundleAvailability(bundle.id);
      var shouldBeActive = avail.maxAvailable > 0 && bundle.is_active;

      // If any component is OOS and bundle was active, deactivate
      if (!shouldBeActive && bundle.is_active && avail.maxAvailable === 0) {
        await this.pool.query(
          `UPDATE product_bundles SET is_active = false, updated_at = NOW() WHERE id = $1`,
          [bundle.id]
        );
      }

      results.push({
        bundleId: bundle.id,
        sku: bundle.bundle_sku,
        name: bundle.bundle_name,
        available: avail.maxAvailable,
        active: shouldBeActive,
        limitingComponent: avail.limitingComponent
      });
    }

    return { synced: results.length, bundles: results };
  }

  // ─── List all bundles with components and availability ─────────────
  async getBundles(activeOnly) {
    var filter = activeOnly ? 'WHERE pb.is_active = true' : '';
    var { rows: bundles } = await this.pool.query(`
      SELECT pb.*,
        COALESCE(json_agg(
          json_build_object(
            'id', bc.id,
            'product_id', bc.product_id,
            'product_name', p.name,
            'sku', p.sku,
            'quantity', bc.quantity,
            'unit_price', p.price,
            'current_stock', COALESCE(p.quantity_in_stock, 0)
          ) ORDER BY bc.id
        ) FILTER (WHERE bc.id IS NOT NULL), '[]') AS components
      FROM product_bundles pb
      LEFT JOIN bundle_components bc ON bc.bundle_id = pb.id
      LEFT JOIN products p ON p.id = bc.product_id
      ${filter}
      GROUP BY pb.id
      ORDER BY pb.created_at DESC
    `);

    var result = [];
    for (var i = 0; i < bundles.length; i++) {
      var b = bundles[i];
      var comps = typeof b.components === 'string' ? JSON.parse(b.components) : b.components;

      // Calculate availability inline
      var maxAvail = null;
      for (var j = 0; j < comps.length; j++) {
        var qty = comps[j].quantity || 1;
        var canMake = qty > 0 ? Math.floor(comps[j].current_stock / qty) : 0;
        if (maxAvail === null || canMake < maxAvail) maxAvail = canMake;
      }

      result.push({
        ...this._formatBundle(b),
        components: comps,
        max_available: maxAvail !== null ? maxAvail : 0
      });
    }

    return result;
  }

  // ─── Update bundle ─────────────────────────────────────────────────
  async updateBundle(bundleId, updates) {
    var { bundleName, bundleDescription, bundlePrice, bundleSku, category, imageUrl, active, components } = updates;
    var client = await this.pool.connect();
    try {
      await client.query('BEGIN');

      // Build SET clause dynamically
      var sets = ['updated_at = NOW()'];
      var params = [];
      var idx = 1;

      if (bundleName !== undefined) { sets.push('bundle_name = $' + idx); params.push(bundleName); idx++; }
      if (bundleDescription !== undefined) { sets.push('bundle_description = $' + idx); params.push(bundleDescription); idx++; }
      if (bundlePrice !== undefined) { sets.push('bundle_price = $' + idx); params.push(bundlePrice); idx++; }
      if (bundleSku !== undefined) { sets.push('bundle_sku = $' + idx); params.push(bundleSku); idx++; }
      if (category !== undefined) { sets.push('bundle_category = $' + idx); params.push(category); idx++; }
      if (imageUrl !== undefined) { sets.push('bundle_image_url = $' + idx); params.push(imageUrl); idx++; }
      if (active !== undefined) { sets.push('is_active = $' + idx); params.push(active); idx++; }

      params.push(bundleId);
      var { rows: [bundle] } = await client.query(
        'UPDATE product_bundles SET ' + sets.join(', ') + ' WHERE id = $' + idx + ' RETURNING *',
        params
      );

      if (!bundle) {
        await client.query('ROLLBACK');
        throw new Error('Bundle not found: ' + bundleId);
      }

      // Replace components if provided
      if (components && Array.isArray(components)) {
        await client.query('DELETE FROM bundle_components WHERE bundle_id = $1', [bundleId]);
        for (var i = 0; i < components.length; i++) {
          var c = components[i];
          await client.query(
            'INSERT INTO bundle_components (bundle_id, product_id, quantity) VALUES ($1, $2, $3)',
            [bundleId, c.productId, c.quantity || 1]
          );
        }

        // Recalculate discount_amount
        if (bundle.bundle_price) {
          var productIds = components.map(function(c) { return c.productId; });
          var { rows: products } = await client.query(
            'SELECT id, price FROM products WHERE id = ANY($1)', [productIds]
          );
          var priceMap = {};
          products.forEach(function(p) { priceMap[p.id] = parseFloat(p.price); });
          var total = 0;
          components.forEach(function(c) { total += (priceMap[c.productId] || 0) * (c.quantity || 1); });
          var disc = parseFloat((total - parseFloat(bundle.bundle_price)).toFixed(2));
          if (disc < 0) disc = 0;
          await client.query(
            'UPDATE product_bundles SET discount_amount = $1 WHERE id = $2',
            [disc, bundleId]
          );
          bundle.discount_amount = disc;
        }
      }

      await client.query('COMMIT');

      // Fetch updated components
      var { rows: comps } = await client.query(`
        SELECT bc.*, p.name AS product_name, p.sku, p.price AS unit_price
        FROM bundle_components bc
        JOIN products p ON p.id = bc.product_id
        WHERE bc.bundle_id = $1 ORDER BY bc.id
      `, [bundleId]);

      return { ...this._formatBundle(bundle), components: comps };
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
  }

  // ─── Soft-delete (deactivate) bundle ───────────────────────────────
  async deleteBundle(bundleId) {
    var { rows: [bundle] } = await this.pool.query(
      `UPDATE product_bundles SET is_active = false, updated_at = NOW()
       WHERE id = $1 RETURNING id, bundle_sku, bundle_name, is_active`,
      [bundleId]
    );
    if (!bundle) throw new Error('Bundle not found: ' + bundleId);
    return bundle;
  }

  // ─── Format helper ─────────────────────────────────────────────────
  _formatBundle(row) {
    return {
      id: row.id,
      bundle_sku: row.bundle_sku,
      bundle_name: row.bundle_name,
      bundle_description: row.bundle_description,
      bundle_price: row.bundle_price ? parseFloat(row.bundle_price) : null,
      discount_amount: row.discount_amount ? parseFloat(row.discount_amount) : 0,
      category: row.bundle_category,
      image_url: row.bundle_image_url,
      is_featured: row.is_featured,
      is_active: row.is_active,
      valid_from: row.valid_from,
      valid_until: row.valid_until,
      created_at: row.created_at,
      updated_at: row.updated_at
    };
  }
}

module.exports = new BundleManager(pool);
