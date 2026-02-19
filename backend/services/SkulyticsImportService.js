'use strict';

const pool = require('../db');

class SkulyticsImportService {
  /**
   * Browse the Skulytics global catalogue with filtering and pagination.
   */
  async getCatalogue({ page = 1, pageSize = 25, search, brand, category, status, inStock }) {
    pageSize = Math.min(Math.max(1, parseInt(pageSize) || 25), 100);
    page = Math.max(1, parseInt(page) || 1);
    const offset = (page - 1) * pageSize;

    const conditions = [];
    const params = [];
    let paramIdx = 0;

    // Search filter
    if (search && search.trim()) {
      paramIdx++;
      const searchParam = `%${search.trim()}%`;
      conditions.push(`(gsp.sku ILIKE $${paramIdx} OR gsp.brand ILIKE $${paramIdx} OR gsp.model_name ILIKE $${paramIdx})`);
      params.push(searchParam);
    }

    // Brand filter
    if (brand && brand.trim()) {
      paramIdx++;
      conditions.push(`gsp.brand ILIKE $${paramIdx}`);
      params.push(`%${brand.trim()}%`);
    }

    // Category filter
    if (category && category.trim()) {
      paramIdx++;
      conditions.push(`gsp.category_slug = $${paramIdx}`);
      params.push(category.trim());
    }

    // In-stock filter
    if (inStock === 'true' || inStock === true) {
      conditions.push(`gsp.is_in_stock = true`);
    } else if (inStock === 'false' || inStock === false) {
      conditions.push(`gsp.is_in_stock = false`);
    }

    // Status filter
    if (status) {
      switch (status) {
        case 'not_imported':
          conditions.push(`(sim.id IS NULL OR sim.match_status = 'new') AND p.skulytics_id IS NULL`);
          break;
        case 'matched':
          conditions.push(`sim.match_status = 'pending'`);
          break;
        case 'confirmed':
          conditions.push(`sim.match_status = 'confirmed'`);
          break;
        case 'rejected':
          conditions.push(`sim.match_status = 'rejected'`);
          break;
        case 'imported':
          conditions.push(`p.skulytics_id IS NOT NULL`);
          break;
      }
    }

    const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

    // Count query
    const countSql = `
      SELECT COUNT(*)::int AS total
      FROM global_skulytics_products gsp
      LEFT JOIN skulytics_import_matches sim ON gsp.skulytics_id = sim.skulytics_id
      LEFT JOIN products p ON p.skulytics_id = gsp.skulytics_id
      ${whereClause}
    `;

    // Data query
    const dataSql = `
      SELECT
        gsp.skulytics_id,
        gsp.sku,
        gsp.brand,
        gsp.model_name,
        gsp.category_slug,
        gsp.msrp,
        gsp.is_in_stock,
        gsp.is_discontinued,
        gsp.primary_image,
        sim.id AS match_id,
        sim.match_status,
        sim.match_confidence,
        sim.match_method,
        p.name AS matched_product_name,
        p.id AS matched_product_id,
        p.skulytics_id AS product_skulytics_id
      FROM global_skulytics_products gsp
      LEFT JOIN skulytics_import_matches sim ON gsp.skulytics_id = sim.skulytics_id
      LEFT JOIN products p ON p.skulytics_id = gsp.skulytics_id
      ${whereClause}
      ORDER BY gsp.brand ASC, gsp.model_name ASC
      LIMIT $${paramIdx + 1} OFFSET $${paramIdx + 2}
    `;

    const dataParams = [...params, pageSize, offset];

    const [countResult, dataResult] = await Promise.all([
      pool.query(countSql, params),
      pool.query(dataSql, dataParams),
    ]);

    const total = countResult.rows[0]?.total || 0;

    return {
      items: dataResult.rows,
      pagination: { page, limit: pageSize, total },
    };
  }

  /**
   * Get a single product from the global catalogue with full detail.
   */
  async getProduct(skulyticsId) {
    const { rows } = await pool.query(
      `SELECT
        gsp.*,
        sim.id AS match_id,
        sim.match_status,
        sim.match_confidence,
        sim.match_method,
        sim.reviewed_by,
        sim.reviewed_at,
        p.id AS matched_product_id,
        p.name AS matched_product_name,
        p.sku AS matched_product_sku,
        p.price AS matched_product_price
      FROM global_skulytics_products gsp
      LEFT JOIN skulytics_import_matches sim ON gsp.skulytics_id = sim.skulytics_id
      LEFT JOIN products p ON p.skulytics_id = gsp.skulytics_id
      WHERE gsp.skulytics_id = $1`,
      [skulyticsId]
    );

    return rows[0] || null;
  }

  /**
   * Get catalogue stats for the dashboard cards.
   */
  async getStats() {
    const { rows } = await pool.query(`
      SELECT
        COUNT(*)::int AS total_in_catalogue,
        COUNT(*) FILTER (WHERE p.skulytics_id IS NOT NULL)::int AS total_imported,
        COUNT(*) FILTER (WHERE sim.match_status = 'pending')::int AS total_pending_review,
        COUNT(*) FILTER (
          WHERE p.skulytics_id IS NULL
          AND (sim.id IS NULL OR sim.match_status = 'new')
        )::int AS total_not_imported,
        COUNT(*) FILTER (WHERE gsp.is_discontinued = true)::int AS total_discontinued,
        MAX(gsp.last_synced_at) AS last_sync_at
      FROM global_skulytics_products gsp
      LEFT JOIN skulytics_import_matches sim ON gsp.skulytics_id = sim.skulytics_id
      LEFT JOIN products p ON p.skulytics_id = gsp.skulytics_id
    `);

    return rows[0];
  }

  /**
   * Confirm an auto-matched product.
   */
  async confirmMatch(matchId, userId) {
    const { rows } = await pool.query(
      `UPDATE skulytics_import_matches
       SET match_status = 'confirmed', reviewed_by = $1, reviewed_at = NOW()
       WHERE id = $2
       RETURNING *`,
      [userId, matchId]
    );
    return rows[0] || null;
  }

  /**
   * Reject an auto-matched product.
   */
  async rejectMatch(matchId, userId) {
    const { rows } = await pool.query(
      `UPDATE skulytics_import_matches
       SET match_status = 'rejected', reviewed_by = $1, reviewed_at = NOW()
       WHERE id = $2
       RETURNING *`,
      [userId, matchId]
    );
    return rows[0] || null;
  }

  /**
   * Bulk-import products from the global catalogue into the local products table.
   */
  async bulkImport(skulyticsIds, userId, tenantId) {
    const client = await pool.connect();
    let imported = 0;
    let skipped = 0;
    const errors = [];

    try {
      await client.query('BEGIN');

      for (const skulyticsId of skulyticsIds) {
        try {
          // Fetch full product data from global catalogue
          const { rows: gspRows } = await client.query(
            `SELECT skulytics_id, sku, upc, brand, model_number, model_name,
                    category_slug, category_path, msrp, map_price, umrp,
                    primary_image, is_discontinued, is_in_stock,
                    weight_kg, width_cm, height_cm, depth_cm,
                    specs, competitor_pricing, warranty, product_link
             FROM global_skulytics_products WHERE skulytics_id = $1`,
            [skulyticsId]
          );

          if (!gspRows.length) {
            errors.push({ skulytics_id: skulyticsId, reason: 'Not found in catalogue' });
            continue;
          }

          const gsp = gspRows[0];

          // Check if already imported
          const { rows: existingRows } = await client.query(
            `SELECT id FROM products WHERE skulytics_id = $1`,
            [skulyticsId]
          );

          if (existingRows.length > 0) {
            skipped++;
            continue;
          }

          // Convert dollar amounts to cents
          const msrpCents = gsp.msrp ? Math.round(parseFloat(gsp.msrp) * 100) : 0;
          const mapCents = gsp.map_price ? Math.round(parseFloat(gsp.map_price) * 100) : null;
          const umrpCents = gsp.umrp ? Math.round(parseFloat(gsp.umrp) * 100) : null;
          const productName = gsp.model_name || `${gsp.brand} ${gsp.sku}`;

          // Build a description from available data
          const descParts = [];
          if (gsp.brand) descParts.push(gsp.brand);
          if (gsp.model_name) descParts.push(gsp.model_name);
          if (gsp.model_number) descParts.push(`(Model: ${gsp.model_number})`);
          const description = descParts.join(' ') || null;

          // Use category_slug as category, fall back to 'Imported'
          const categoryName = gsp.category_slug
            ? gsp.category_slug.replace(/-/g, ' ').replace(/\b\w/g, c => c.toUpperCase())
            : 'Imported';

          // Build decoded_attributes from specs + dimensions
          let decodedAttrs = null;
          if (gsp.specs || gsp.weight_kg || gsp.width_cm) {
            decodedAttrs = { ...(gsp.specs || {}) };
            if (gsp.weight_kg) decodedAttrs.weight_kg = parseFloat(gsp.weight_kg);
            if (gsp.width_cm) decodedAttrs.width_cm = parseFloat(gsp.width_cm);
            if (gsp.height_cm) decodedAttrs.height_cm = parseFloat(gsp.height_cm);
            if (gsp.depth_cm) decodedAttrs.depth_cm = parseFloat(gsp.depth_cm);
            if (gsp.warranty) decodedAttrs.warranty = gsp.warranty;
          }

          const { rows: insertedRows } = await client.query(
            `INSERT INTO products (
               name, sku, upc, category, price, cost, brand, manufacturer,
               model, description, image_url,
               msrp_cents, map_price_cents, umrp_cents, sell_cents,
               discontinued, in_stock,
               decoded_attributes, import_source,
               skulytics_id, skulytics_imported_at, active
             )
             VALUES (
               $1, $2, $3, $4, $5, 0, $6, $7,
               $8, $9, $10,
               $11, $12, $13, $14,
               $15, $16,
               $17, 'skulytics',
               $18, NOW(), true
             )
             RETURNING id`,
            [
              productName,          // $1
              gsp.sku,              // $2
              gsp.upc || null,      // $3
              categoryName,         // $4
              msrpCents,            // $5 (price in cents — legacy column)
              gsp.brand,            // $6
              gsp.brand,            // $7 (manufacturer = brand)
              gsp.model_number || null, // $8
              description,          // $9
              gsp.primary_image || null, // $10
              msrpCents || null,    // $11
              mapCents,             // $12
              umrpCents,            // $13
              msrpCents || null,    // $14 (sell_cents defaults to msrp)
              gsp.is_discontinued || false, // $15
              gsp.is_in_stock !== false,    // $16
              decodedAttrs ? JSON.stringify(decodedAttrs) : null, // $17
              skulyticsId,          // $18
            ]
          );

          const productId = insertedRows[0].id;

          // Upsert skulytics_import_matches
          await client.query(
            `INSERT INTO skulytics_import_matches
               (tenant_id, skulytics_id, internal_product_id, match_method, match_confidence, match_status, reviewed_by, reviewed_at)
             VALUES ($1, $2, $3, 'manual', 100, 'confirmed', $4, NOW())
             ON CONFLICT (tenant_id, skulytics_id) DO UPDATE SET
               internal_product_id = $3,
               match_method = 'manual',
               match_confidence = 100,
               match_status = 'confirmed',
               reviewed_by = $4,
               reviewed_at = NOW()`,
            [tenantId, skulyticsId, productId, userId]
          );

          imported++;
        } catch (err) {
          errors.push({ skulytics_id: skulyticsId, reason: err.message });
        }
      }

      await client.query('COMMIT');
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }

    return { imported, skipped, errors };
  }
}

module.exports = new SkulyticsImportService();
