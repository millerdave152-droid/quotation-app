/**
 * Product Variant Service
 * Manages product attributes, attribute values, category mappings, and parent/child variant relationships
 */

const { ApiError } = require('../middleware/errorHandler');

class ProductVariantService {
  constructor(pool, cache = null) {
    this.pool = pool;
    this.cache = cache;
    this.CACHE_TTL = 300;
  }

  /**
   * Create a structured error with code, message, and context.
   * @param {string} code - VARIANT_NOT_FOUND | INSUFFICIENT_INVENTORY | INVALID_ADJUSTMENT | DB_ERROR
   * @param {string} message
   * @param {object} context
   * @returns {Error}
   */
  _variantError(code, message, context = {}) {
    const err = new Error(message);
    err.code = code;
    err.context = context;
    return err;
  }

  // ---------------------------------------------------------------------------
  // ATTRIBUTES CRUD
  // ---------------------------------------------------------------------------

  async listAttributes() {
    const { rows } = await this.pool.query(
      `SELECT pa.*, (SELECT COUNT(*)::int FROM product_attribute_values WHERE attribute_id = pa.id) AS value_count
       FROM product_attributes pa
       WHERE pa.is_active = true
       ORDER BY pa.display_order, pa.name`
    );
    return rows;
  }

  async getAttribute(attributeId) {
    const { rows } = await this.pool.query('SELECT * FROM product_attributes WHERE id = $1', [attributeId]);
    if (!rows.length) throw ApiError.notFound('Attribute');

    const values = await this.pool.query(
      'SELECT * FROM product_attribute_values WHERE attribute_id = $1 ORDER BY display_order, value',
      [attributeId]
    );
    rows[0].values = values.rows;
    return rows[0];
  }

  async createAttribute(name, slug) {
    if (!name || !slug) throw ApiError.badRequest('name and slug are required');

    const dup = await this.pool.query('SELECT id FROM product_attributes WHERE slug = $1', [slug]);
    if (dup.rows.length) throw ApiError.conflict('Attribute slug already exists');

    const { rows } = await this.pool.query(
      'INSERT INTO product_attributes (name, slug) VALUES ($1, $2) RETURNING *',
      [name, slug]
    );
    return rows[0];
  }

  async updateAttribute(attributeId, data) {
    const fields = [];
    const params = [];
    let idx = 1;

    if (data.name !== undefined) { fields.push(`name = $${idx++}`); params.push(data.name); }
    if (data.slug !== undefined) { fields.push(`slug = $${idx++}`); params.push(data.slug); }
    if (data.displayOrder !== undefined) { fields.push(`display_order = $${idx++}`); params.push(data.displayOrder); }
    if (data.isActive !== undefined) { fields.push(`is_active = $${idx++}`); params.push(data.isActive); }

    if (!fields.length) return this.getAttribute(attributeId);

    fields.push('updated_at = NOW()');
    params.push(attributeId);
    await this.pool.query(`UPDATE product_attributes SET ${fields.join(', ')} WHERE id = $${idx}`, params);
    return this.getAttribute(attributeId);
  }

  // ---------------------------------------------------------------------------
  // ATTRIBUTE VALUES
  // ---------------------------------------------------------------------------

  async addAttributeValue(attributeId, value, slug, metadata = {}) {
    if (!value || !slug) throw ApiError.badRequest('value and slug are required');

    const attr = await this.pool.query('SELECT id FROM product_attributes WHERE id = $1', [attributeId]);
    if (!attr.rows.length) throw ApiError.notFound('Attribute');

    const { rows } = await this.pool.query(
      `INSERT INTO product_attribute_values (attribute_id, value, slug, metadata) VALUES ($1, $2, $3, $4)
       ON CONFLICT (attribute_id, slug) DO NOTHING
       RETURNING *`,
      [attributeId, value, slug, JSON.stringify(metadata)]
    );
    if (!rows.length) throw ApiError.conflict('Value with this slug already exists for this attribute');
    return rows[0];
  }

  async updateAttributeValue(valueId, data) {
    const fields = [];
    const params = [];
    let idx = 1;

    if (data.value !== undefined) { fields.push(`value = $${idx++}`); params.push(data.value); }
    if (data.slug !== undefined) { fields.push(`slug = $${idx++}`); params.push(data.slug); }
    if (data.displayOrder !== undefined) { fields.push(`display_order = $${idx++}`); params.push(data.displayOrder); }
    if (data.metadata !== undefined) { fields.push(`metadata = $${idx++}`); params.push(JSON.stringify(data.metadata)); }

    if (!fields.length) return;

    params.push(valueId);
    await this.pool.query(`UPDATE product_attribute_values SET ${fields.join(', ')} WHERE id = $${idx}`, params);

    const { rows } = await this.pool.query('SELECT * FROM product_attribute_values WHERE id = $1', [valueId]);
    return rows[0];
  }

  async deleteAttributeValue(valueId) {
    await this.pool.query('DELETE FROM product_attribute_values WHERE id = $1', [valueId]);
  }

  // ---------------------------------------------------------------------------
  // CATEGORY ATTRIBUTES
  // ---------------------------------------------------------------------------

  async setCategoryAttributes(categoryId, attributeIds) {
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      await client.query('DELETE FROM category_attributes WHERE category_id = $1', [categoryId]);
      for (let i = 0; i < attributeIds.length; i++) {
        await client.query(
          'INSERT INTO category_attributes (category_id, attribute_id, display_order) VALUES ($1, $2, $3)',
          [categoryId, attributeIds[i], i + 1]
        );
      }
      await client.query('COMMIT');
      return this.getCategoryAttributes(categoryId);
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
  }

  async getCategoryAttributes(categoryId) {
    const { rows } = await this.pool.query(
      `SELECT pa.*, ca.is_required, ca.display_order AS category_display_order
       FROM category_attributes ca
       JOIN product_attributes pa ON pa.id = ca.attribute_id
       WHERE ca.category_id = $1
       ORDER BY ca.display_order`,
      [categoryId]
    );

    // Load values for each attribute
    for (const attr of rows) {
      const vals = await this.pool.query(
        'SELECT * FROM product_attribute_values WHERE attribute_id = $1 ORDER BY display_order',
        [attr.id]
      );
      attr.values = vals.rows;
    }
    return rows;
  }

  // ---------------------------------------------------------------------------
  // PARENT / VARIANT MANAGEMENT
  // ---------------------------------------------------------------------------

  async createParentProduct(productId) {
    const { rows } = await this.pool.query('SELECT id, is_parent, parent_product_id FROM products WHERE id = $1', [productId]);
    if (!rows.length) throw ApiError.notFound('Product');
    if (rows[0].parent_product_id) throw ApiError.badRequest('Product is already a variant child');

    await this.pool.query('UPDATE products SET is_parent = true WHERE id = $1', [productId]);
    return this.getVariantMatrix(productId);
  }

  async convertToParent(productId) {
    return this.createParentProduct(productId);
  }

  async generateVariants(parentId, attributeCombinations) {
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');

      const parent = (await client.query(
        'SELECT * FROM products WHERE id = $1 AND is_parent = true', [parentId]
      )).rows[0];
      if (!parent) throw ApiError.badRequest('Product must be a parent product');

      const variants = [];
      for (const combo of attributeCombinations) {
        // combo: { attributes: { color: 'White', size: '36 inch' }, sku, price, cost }
        const variantSku = combo.sku || `${parent.sku}-${Object.values(combo.attributes).join('-').replace(/\s+/g, '')}`;
        const variantName = `${parent.name} - ${Object.values(combo.attributes).join(' / ')}`;

        const { rows } = await client.query(
          `INSERT INTO products (name, sku, category, price, cost, qty_on_hand, parent_product_id, is_parent, variant_attributes, is_active)
           VALUES ($1, $2, $3, $4, $5, 0, $6, false, $7, true)
           RETURNING *`,
          [
            variantName,
            variantSku,
            parent.category,
            combo.price || parent.price,
            combo.cost || parent.cost,
            parentId,
            JSON.stringify(combo.attributes),
          ]
        );
        variants.push(rows[0]);
      }

      await client.query('COMMIT');
      return variants;
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
  }

  async addVariant(parentId, variantData, attributes) {
    const parent = (await this.pool.query(
      'SELECT * FROM products WHERE id = $1 AND is_parent = true', [parentId]
    )).rows[0];
    if (!parent) throw ApiError.badRequest('Product must be a parent product');

    const { rows } = await this.pool.query(
      `INSERT INTO products (name, sku, category, price, cost, qty_on_hand, parent_product_id, is_parent, variant_attributes, is_active)
       VALUES ($1, $2, $3, $4, $5, $6, $7, false, $8, true)
       RETURNING *`,
      [
        variantData.name || `${parent.name} - ${Object.values(attributes).join(' / ')}`,
        variantData.sku,
        parent.category,
        variantData.price || parent.price,
        variantData.cost || parent.cost,
        variantData.qtyOnHand || 0,
        parentId,
        JSON.stringify(attributes),
      ]
    );
    return rows[0];
  }

  async updateVariant(variantId, data) {
    const fields = [];
    const params = [];
    let idx = 1;

    const map = { sku: 'sku', name: 'name', price: 'price', cost: 'cost', qtyOnHand: 'qty_on_hand', isActive: 'is_active' };
    for (const [camel, col] of Object.entries(map)) {
      if (data[camel] !== undefined) {
        fields.push(`${col} = $${idx++}`);
        params.push(data[camel]);
      }
    }
    if (data.variantAttributes) {
      fields.push(`variant_attributes = $${idx++}`);
      params.push(JSON.stringify(data.variantAttributes));
    }

    if (!fields.length) return;

    params.push(variantId);
    await this.pool.query(`UPDATE products SET ${fields.join(', ')} WHERE id = $${idx} AND parent_product_id IS NOT NULL`, params);

    const { rows } = await this.pool.query('SELECT * FROM products WHERE id = $1', [variantId]);
    return rows[0];
  }

  async deleteVariant(variantId) {
    await this.pool.query('UPDATE products SET is_active = false WHERE id = $1 AND parent_product_id IS NOT NULL', [variantId]);
  }

  // ---------------------------------------------------------------------------
  // VARIANT QUERIES
  // ---------------------------------------------------------------------------

  async getVariantMatrix(parentId) {
    const parent = (await this.pool.query(
      `SELECT p.*, c.name AS category_name
       FROM products p
       LEFT JOIN categories c ON c.slug = p.category OR c.name = p.category
       WHERE p.id = $1`,
      [parentId]
    )).rows[0];
    if (!parent) throw ApiError.notFound('Product');

    const variants = (await this.pool.query(
      'SELECT * FROM products WHERE parent_product_id = $1 AND is_active = true ORDER BY name',
      [parentId]
    )).rows;

    // Extract attribute dimensions
    const dimensions = {};
    for (const v of variants) {
      if (v.variant_attributes) {
        for (const [key, val] of Object.entries(v.variant_attributes)) {
          if (!dimensions[key]) dimensions[key] = new Set();
          dimensions[key].add(val);
        }
      }
    }
    const dimensionsSummary = {};
    for (const [key, vals] of Object.entries(dimensions)) {
      dimensionsSummary[key] = [...vals];
    }

    return { parent, variants, dimensions: dimensionsSummary, variantCount: variants.length };
  }

  async getProductWithVariants(productId) {
    const product = (await this.pool.query('SELECT * FROM products WHERE id = $1', [productId])).rows[0];
    if (!product) throw ApiError.notFound('Product');

    if (product.is_parent) {
      return this.getVariantMatrix(productId);
    }

    if (product.parent_product_id) {
      const matrix = await this.getVariantMatrix(product.parent_product_id);
      return { ...matrix, selectedVariant: product };
    }

    return { parent: product, variants: [], dimensions: {}, variantCount: 0 };
  }

  async mergeAsVariants(parentId, childProductIds, attributeValues) {
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');

      // Ensure parent exists and is_parent
      await client.query('UPDATE products SET is_parent = true WHERE id = $1', [parentId]);

      for (let i = 0; i < childProductIds.length; i++) {
        const childId = childProductIds[i];
        const attrs = attributeValues[i] || {};

        await client.query(
          'UPDATE products SET parent_product_id = $1, is_parent = false, variant_attributes = $2 WHERE id = $3',
          [parentId, JSON.stringify(attrs), childId]
        );
      }

      await client.query('COMMIT');
      return this.getVariantMatrix(parentId);
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
  }

  // ---------------------------------------------------------------------------
  // VIEW-BASED READS (migration 167 views)
  // ---------------------------------------------------------------------------

  /**
   * Get a parent product with all its variants and resolved attribute pairs.
   * Uses product_parents and product_variants views.
   * @param {number} parentProductId
   * @returns {Promise<{parent: object, variants: object[]}>}
   */
  async getParentWithVariants(parentProductId) {
    try {
      // 1. Parent from view
      const parentRes = await this.pool.query(
        `SELECT * FROM product_parents WHERE id = $1`,
        [parentProductId]
      );
      if (parentRes.rows.length === 0) {
        throw this._variantError('VARIANT_NOT_FOUND', 'Parent product not found', {
          parentProductId
        });
      }
      const parent = parentRes.rows[0];

      // 2. Variants from view
      const variantRes = await this.pool.query(
        `SELECT * FROM product_variants
         WHERE parent_product_id = $1
         ORDER BY variant_sort_order, id`,
        [parentProductId]
      );

      // 3. Resolve attribute/value pairs for all variants in one query
      const variantIds = variantRes.rows.map(v => v.id);
      const attrMap = {};

      if (variantIds.length > 0) {
        const attrRes = await this.pool.query(
          `SELECT
             pva.product_id,
             pa.name   AS attribute_name,
             pav.value AS attribute_value,
             pav.metadata->>'hex' AS color_hex
           FROM product_variant_attributes pva
           JOIN product_attributes pa  ON pa.id = pva.attribute_id
           JOIN product_attribute_values pav ON pav.id = pva.attribute_value_id
           WHERE pva.product_id = ANY($1)
           ORDER BY pa.display_order`,
          [variantIds]
        );
        for (const row of attrRes.rows) {
          if (!attrMap[row.product_id]) attrMap[row.product_id] = [];
          attrMap[row.product_id].push({
            name: row.attribute_name,
            value: row.attribute_value,
            colorHex: row.color_hex || null
          });
        }
      }

      const variants = variantRes.rows.map(v => ({
        ...v,
        attributes: attrMap[v.id] || []
      }));

      return { parent, variants };
    } catch (err) {
      if (err.code === 'VARIANT_NOT_FOUND') throw err;
      throw this._variantError('DB_ERROR', 'Failed to fetch parent with variants', {
        parentProductId, detail: err.message
      });
    }
  }

  /**
   * Find the variant that matches ALL selected attribute values for a parent.
   * @param {number} parentProductId
   * @param {number[]} attributeValueIds - Array of product_attribute_values IDs
   * @returns {Promise<object|null>} Full variant row or null
   */
  async getVariantByAttributes(parentProductId, attributeValueIds) {
    if (!attributeValueIds || attributeValueIds.length === 0) {
      throw this._variantError('INVALID_ADJUSTMENT', 'attributeValueIds must be non-empty', {
        parentProductId
      });
    }

    try {
      const res = await this.pool.query(
        `SELECT p.*
         FROM products p
         JOIN (
           SELECT product_id
           FROM product_variant_attributes
           WHERE attribute_value_id = ANY($1)
           GROUP BY product_id
           HAVING COUNT(*) = $2
         ) matched ON matched.product_id = p.id
         WHERE p.parent_product_id = $3`,
        [attributeValueIds, attributeValueIds.length, parentProductId]
      );

      return res.rows[0] || null;
    } catch (err) {
      throw this._variantError('DB_ERROR', 'Failed to find variant by attributes', {
        parentProductId, attributeValueIds, detail: err.message
      });
    }
  }

  /**
   * Get variant inventory, optionally filtered by location.
   * @param {number} productId
   * @param {number|null} locationId - If null, returns all locations + aggregate totals
   * @returns {Promise<{byLocation: object[], totals: object}>}
   */
  async getVariantInventory(productId, locationId = null) {
    try {
      let byLocation;

      if (locationId != null) {
        const res = await this.pool.query(
          `SELECT * FROM variant_inventory
           WHERE product_id = $1 AND location_id = $2`,
          [productId, locationId]
        );
        byLocation = res.rows;
      } else {
        const res = await this.pool.query(
          `SELECT * FROM variant_inventory
           WHERE product_id = $1
           ORDER BY location_id`,
          [productId]
        );
        byLocation = res.rows;
      }

      // Aggregate totals across all locations for this variant
      const totalsRes = await this.pool.query(
        `SELECT
           COALESCE(SUM(qty_on_hand), 0)::int   AS qty_on_hand,
           COALESCE(SUM(qty_reserved), 0)::int   AS qty_reserved,
           COALESCE(SUM(qty_on_hand - qty_reserved), 0)::int AS qty_available
         FROM variant_inventory
         WHERE product_id = $1`,
        [productId]
      );

      return {
        byLocation,
        totals: {
          qty_on_hand: totalsRes.rows[0].qty_on_hand,
          qty_reserved: totalsRes.rows[0].qty_reserved,
          qty_available: totalsRes.rows[0].qty_available
        }
      };
    } catch (err) {
      throw this._variantError('DB_ERROR', 'Failed to fetch variant inventory', {
        productId, locationId, detail: err.message
      });
    }
  }

  // ---------------------------------------------------------------------------
  // INVENTORY WRITES (transactional, with stock_movements audit trail)
  // ---------------------------------------------------------------------------

  /**
   * Adjust variant inventory (receive or remove stock).
   * @param {number} productId
   * @param {number} locationId
   * @param {number} adjustment - Signed integer (+receive, -sell/remove)
   * @param {string} reason
   * @param {number} userId
   * @returns {Promise<object>} Updated variant_inventory row
   */
  async adjustVariantInventory(productId, locationId, adjustment, reason, userId) {
    if (!Number.isInteger(adjustment) || adjustment === 0) {
      throw this._variantError('INVALID_ADJUSTMENT', 'Adjustment must be a non-zero integer', {
        productId, locationId, adjustment
      });
    }

    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');

      // 1. Lock row
      const lockRes = await client.query(
        `SELECT * FROM variant_inventory
         WHERE product_id = $1 AND location_id = $2
         FOR UPDATE`,
        [productId, locationId]
      );

      if (lockRes.rows.length === 0) {
        throw this._variantError('VARIANT_NOT_FOUND', 'Variant inventory row not found', {
          productId, locationId
        });
      }

      const current = lockRes.rows[0];
      const newQty = current.qty_on_hand + adjustment;

      // 2. Validate non-negative
      if (newQty < 0) {
        throw this._variantError('INSUFFICIENT_INVENTORY',
          `Adjustment would result in negative on-hand (${current.qty_on_hand} + (${adjustment}) = ${newQty})`, {
            productId, locationId, qty_on_hand: current.qty_on_hand, adjustment
          });
      }

      // 3. Update
      const updateRes = await client.query(
        `UPDATE variant_inventory
         SET qty_on_hand = qty_on_hand + $1
         WHERE product_id = $2 AND location_id = $3
         RETURNING *`,
        [adjustment, productId, locationId]
      );

      // 4. Audit trail → stock_movements
      await client.query(
        `INSERT INTO stock_movements
           (product_id, movement_type, quantity, quantity_before, quantity_after,
            reference_type, notes, created_by)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
        [
          productId,
          adjustment > 0 ? 'receipt' : 'adjustment',
          adjustment,
          current.qty_on_hand,
          newQty,
          'variant_inventory',
          JSON.stringify({ location_id: locationId, reason }),
          userId != null ? String(userId) : 'system'
        ]
      );

      await client.query('COMMIT');

      this.cache?.invalidatePattern?.('inventory:*');
      this.cache?.invalidatePattern?.('variant:*');

      return updateRes.rows[0];
    } catch (err) {
      await client.query('ROLLBACK');
      if (['VARIANT_NOT_FOUND', 'INSUFFICIENT_INVENTORY', 'INVALID_ADJUSTMENT'].includes(err.code)) throw err;
      throw this._variantError('DB_ERROR', 'Failed to adjust variant inventory', {
        productId, locationId, adjustment, detail: err.message
      });
    } finally {
      client.release();
    }
  }

  /**
   * Reserve variant inventory for a quote or order.
   * @param {number} productId
   * @param {number} locationId
   * @param {number} qty - Positive quantity to reserve
   * @param {number} referenceId - Quote or order ID
   * @param {'quote'|'order'} referenceType
   * @returns {Promise<object>} Updated variant_inventory row
   */
  async reserveVariantInventory(productId, locationId, qty, referenceId, referenceType) {
    if (!Number.isInteger(qty) || qty <= 0) {
      throw this._variantError('INVALID_ADJUSTMENT', 'Reservation quantity must be a positive integer', {
        productId, locationId, qty
      });
    }

    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');

      // 1. Lock
      const lockRes = await client.query(
        `SELECT * FROM variant_inventory
         WHERE product_id = $1 AND location_id = $2
         FOR UPDATE`,
        [productId, locationId]
      );

      if (lockRes.rows.length === 0) {
        throw this._variantError('VARIANT_NOT_FOUND', 'Variant inventory row not found', {
          productId, locationId
        });
      }

      const current = lockRes.rows[0];
      const available = current.qty_on_hand - current.qty_reserved;

      // 2. Validate
      if (available < qty) {
        throw this._variantError('INSUFFICIENT_INVENTORY',
          `Insufficient available inventory (available: ${available}, requested: ${qty})`, {
            productId, locationId, qty_available: available, qty_requested: qty
          });
      }

      // 3. Increment reserved
      const updateRes = await client.query(
        `UPDATE variant_inventory
         SET qty_reserved = qty_reserved + $1
         WHERE product_id = $2 AND location_id = $3
         RETURNING *`,
        [qty, productId, locationId]
      );

      // 4. Audit
      await client.query(
        `INSERT INTO stock_movements
           (product_id, movement_type, quantity, quantity_before, quantity_after,
            reference_type, reference_id, notes, created_by)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
        [
          productId,
          'reservation',
          qty,
          current.qty_reserved,
          current.qty_reserved + qty,
          referenceType,
          referenceId,
          JSON.stringify({ location_id: locationId, reason: 'reserved' }),
          'system'
        ]
      );

      await client.query('COMMIT');

      this.cache?.invalidatePattern?.('inventory:*');
      this.cache?.invalidatePattern?.('variant:*');

      return updateRes.rows[0];
    } catch (err) {
      await client.query('ROLLBACK');
      if (['VARIANT_NOT_FOUND', 'INSUFFICIENT_INVENTORY', 'INVALID_ADJUSTMENT'].includes(err.code)) throw err;
      throw this._variantError('DB_ERROR', 'Failed to reserve variant inventory', {
        productId, locationId, qty, detail: err.message
      });
    } finally {
      client.release();
    }
  }

  /**
   * Release a variant inventory reservation.
   * Decrements qty_reserved (floors at 0, never negative).
   * @param {number} productId
   * @param {number} locationId
   * @param {number} qty - Quantity to release
   * @param {number} referenceId - Original quote/order ID
   * @returns {Promise<object>} Updated variant_inventory row
   */
  async releaseVariantReservation(productId, locationId, qty, referenceId) {
    if (!Number.isInteger(qty) || qty <= 0) {
      throw this._variantError('INVALID_ADJUSTMENT', 'Release quantity must be a positive integer', {
        productId, locationId, qty
      });
    }

    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');

      const lockRes = await client.query(
        `SELECT * FROM variant_inventory
         WHERE product_id = $1 AND location_id = $2
         FOR UPDATE`,
        [productId, locationId]
      );

      if (lockRes.rows.length === 0) {
        throw this._variantError('VARIANT_NOT_FOUND', 'Variant inventory row not found', {
          productId, locationId
        });
      }

      const current = lockRes.rows[0];
      const newReserved = Math.max(0, current.qty_reserved - qty);
      const actualReleased = current.qty_reserved - newReserved;

      const updateRes = await client.query(
        `UPDATE variant_inventory
         SET qty_reserved = $1
         WHERE product_id = $2 AND location_id = $3
         RETURNING *`,
        [newReserved, productId, locationId]
      );

      // Audit
      await client.query(
        `INSERT INTO stock_movements
           (product_id, movement_type, quantity, quantity_before, quantity_after,
            reference_type, reference_id, notes, created_by)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
        [
          productId,
          'release',
          -actualReleased,
          current.qty_reserved,
          newReserved,
          'variant_inventory',
          referenceId,
          JSON.stringify({ location_id: locationId, reason: 'reservation_released' }),
          'system'
        ]
      );

      await client.query('COMMIT');

      this.cache?.invalidatePattern?.('inventory:*');
      this.cache?.invalidatePattern?.('variant:*');

      return updateRes.rows[0];
    } catch (err) {
      await client.query('ROLLBACK');
      if (['VARIANT_NOT_FOUND', 'INVALID_ADJUSTMENT'].includes(err.code)) throw err;
      throw this._variantError('DB_ERROR', 'Failed to release variant reservation', {
        productId, locationId, qty, detail: err.message
      });
    } finally {
      client.release();
    }
  }

  // ---------------------------------------------------------------------------
  // SEARCH
  // ---------------------------------------------------------------------------

  /**
   * Search variants by SKU fragment. Returns up to 20 results.
   * @param {string} skuFragment
   * @param {number|null} locationId - Filter inventory to this location (or aggregate)
   * @returns {Promise<object[]>}
   */
  async searchVariantsBySku(skuFragment, locationId = null) {
    if (!skuFragment || skuFragment.trim().length === 0) {
      return [];
    }

    const trimmed = skuFragment.trim();
    const pattern = `%${trimmed}%`;
    const prefixPattern = `${trimmed}%`;

    try {
      const res = await this.pool.query(
        `SELECT
           p.id,
           p.name,
           p.model,
           p.sku,
           p.variant_sku,
           p.price,
           p.parent_product_id,
           pp.name        AS parent_name,
           pp.min_price,
           pp.max_price,
           COALESCE(vi.qty_avail, 0)::int AS qty_available,
           CASE
             WHEN p.variant_sku ILIKE $2 THEN 1
             WHEN p.sku        ILIKE $2 THEN 2
             WHEN p.variant_sku ILIKE $1 THEN 3
             WHEN p.sku        ILIKE $1 THEN 4
             ELSE 5
           END AS relevance
         FROM products p
         LEFT JOIN product_parents pp ON pp.id = p.parent_product_id
         LEFT JOIN (
           SELECT product_id,
                  SUM(qty_on_hand - qty_reserved)::int AS qty_avail
           FROM variant_inventory
           WHERE ($3::int IS NULL OR location_id = $3)
           GROUP BY product_id
         ) vi ON vi.product_id = p.id
         WHERE p.is_parent = false
           AND (p.variant_sku ILIKE $1 OR p.sku ILIKE $1)
         ORDER BY relevance, p.name
         LIMIT 20`,
        [pattern, prefixPattern, locationId]
      );

      return res.rows;
    } catch (err) {
      throw this._variantError('DB_ERROR', 'Failed to search variants by SKU', {
        skuFragment, locationId, detail: err.message
      });
    }
  }

  // ---------------------------------------------------------------------------
  // PHASE 2 — MANAGEMENT WRITES
  // ---------------------------------------------------------------------------

  /**
   * Create a new variant under a parent product.
   * @param {number} parentProductId
   * @param {object} variantData - { variant_sku, price_cents, cost_cents, is_default_variant, variant_sort_order }
   * @param {number[]} attributeValueIds - product_attribute_values IDs (one per varying attribute)
   * @param {number} userId
   * @returns {Promise<object>} Full variant row with resolved attributes
   */
  async createVariant(parentProductId, variantData, attributeValueIds, userId) {
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');

      // 1. Validate parent
      const parentRes = await client.query(
        `SELECT * FROM products WHERE id = $1 FOR UPDATE`,
        [parentProductId]
      );
      if (parentRes.rows.length === 0) {
        throw this._variantError('VARIANT_NOT_FOUND', 'Parent product not found', { parentProductId });
      }
      const parent = parentRes.rows[0];
      if (!parent.is_parent) {
        throw this._variantError('INVALID_ADJUSTMENT', 'Product is not a parent product', { parentProductId });
      }

      // 2. Check variant_sku uniqueness
      if (variantData.variant_sku) {
        const skuCheck = await client.query(
          `SELECT id FROM products WHERE variant_sku = $1`,
          [variantData.variant_sku]
        );
        if (skuCheck.rows.length > 0) {
          throw this._variantError('DUPLICATE_SKU', 'variant_sku already in use', {
            variant_sku: variantData.variant_sku,
            existing_product_id: skuCheck.rows[0].id
          });
        }
      }

      // 3. INSERT variant into products
      // price column is NUMERIC (legacy selling price); cost_cents / msrp_cents are INTEGER cents
      const insertRes = await client.query(
        `INSERT INTO products (
           name, parent_product_id, is_parent,
           variant_sku, price, cost_cents,
           is_default_variant, variant_sort_order,
           category, manufacturer, is_active
         ) VALUES (
           $1, $2, false,
           $3, $4, $5,
           $6, $7,
           $8, $9, true
         ) RETURNING *`,
        [
          parent.name,   // inherit parent name; can be updated later
          parentProductId,
          variantData.variant_sku || null,
          variantData.price_cents != null ? variantData.price_cents : parent.price,
          variantData.cost_cents != null ? variantData.cost_cents : parent.cost_cents,
          variantData.is_default_variant || false,
          variantData.variant_sort_order || 0,
          parent.category,
          parent.manufacturer
        ]
      );
      const variant = insertRes.rows[0];

      // 4. INSERT product_variant_attributes junction rows
      if (attributeValueIds && attributeValueIds.length > 0) {
        // Resolve attribute_id for each value
        const valuesRes = await client.query(
          `SELECT id, attribute_id FROM product_attribute_values WHERE id = ANY($1)`,
          [attributeValueIds]
        );
        for (const av of valuesRes.rows) {
          await client.query(
            `INSERT INTO product_variant_attributes (product_id, attribute_id, attribute_value_id)
             VALUES ($1, $2, $3)`,
            [variant.id, av.attribute_id, av.id]
          );
        }

        // Also build variant_attributes JSONB for the legacy column
        const attrJsonRes = await client.query(
          `SELECT pa.slug, pav.value
           FROM product_attribute_values pav
           JOIN product_attributes pa ON pa.id = pav.attribute_id
           WHERE pav.id = ANY($1)`,
          [attributeValueIds]
        );
        const variantAttrsJson = {};
        for (const row of attrJsonRes.rows) {
          variantAttrsJson[row.slug] = row.value;
        }
        await client.query(
          `UPDATE products SET variant_attributes = $1 WHERE id = $2`,
          [JSON.stringify(variantAttrsJson), variant.id]
        );
      }

      // 5. Seed variant_inventory for each active location
      const locRes = await client.query(
        `SELECT id FROM locations WHERE active = true`
      );
      for (const loc of locRes.rows) {
        await client.query(
          `INSERT INTO variant_inventory (product_id, location_id, qty_on_hand, qty_reserved)
           VALUES ($1, $2, 0, 0)
           ON CONFLICT (product_id, location_id) DO NOTHING`,
          [variant.id, loc.id]
        );
      }

      // 6. Default variant handling
      if (variantData.is_default_variant) {
        // Clear previous default
        await client.query(
          `UPDATE products SET is_default_variant = false
           WHERE parent_product_id = $1 AND id != $2 AND is_default_variant = true`,
          [parentProductId, variant.id]
        );
        // Set on parent config
        await client.query(
          `INSERT INTO product_parent_config (product_id, default_variant_id)
           VALUES ($1, $2)
           ON CONFLICT (product_id)
           DO UPDATE SET default_variant_id = $2, updated_at = NOW()`,
          [parentProductId, variant.id]
        );
      }

      // 7. Audit
      await client.query(
        `INSERT INTO stock_movements
           (product_id, movement_type, quantity, quantity_before, quantity_after,
            reference_type, notes, created_by)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
        [
          variant.id,
          'adjustment',
          0,
          0,
          0,
          'variant_inventory',
          JSON.stringify({ action: 'variant_created', parent_id: parentProductId }),
          String(userId)
        ]
      );

      await client.query('COMMIT');

      this.cache?.invalidatePattern?.('inventory:*');
      this.cache?.invalidatePattern?.('variant:*');
      this.cache?.invalidatePattern?.('product:*');

      // Return with resolved attributes
      const result = await this.getParentWithVariants(parentProductId);
      return result.variants.find(v => v.id === variant.id) || variant;
    } catch (err) {
      await client.query('ROLLBACK');
      if (['VARIANT_NOT_FOUND', 'INVALID_ADJUSTMENT', 'DUPLICATE_SKU'].includes(err.code)) throw err;
      throw this._variantError('DB_ERROR', 'Failed to create variant', {
        parentProductId, detail: err.message
      });
    } finally {
      client.release();
    }
  }

  /**
   * Update pricing on a variant product.
   * @param {number} productId
   * @param {object} pricingData - { price_cents?, cost_cents?, msrp_cents? }
   * @param {number} userId
   * @returns {Promise<{updated: object, warning: string|null}>}
   */
  async updateVariantPricing(productId, pricingData, userId) {
    // Validate
    if (pricingData.price_cents != null && pricingData.price_cents <= 0) {
      throw this._variantError('INVALID_ADJUSTMENT', 'price_cents must be > 0', {
        productId, price_cents: pricingData.price_cents
      });
    }
    if (pricingData.cost_cents != null && pricingData.cost_cents < 0) {
      throw this._variantError('INVALID_ADJUSTMENT', 'cost_cents must be >= 0', {
        productId, cost_cents: pricingData.cost_cents
      });
    }

    try {
      // Read current values for audit diff
      const currentRes = await this.pool.query(
        `SELECT id, price, cost_cents, msrp_cents, is_parent
         FROM products WHERE id = $1`,
        [productId]
      );
      if (currentRes.rows.length === 0) {
        throw this._variantError('VARIANT_NOT_FOUND', 'Product not found', { productId });
      }
      const current = currentRes.rows[0];
      if (current.is_parent) {
        throw this._variantError('INVALID_ADJUSTMENT', 'Cannot update pricing on parent product via this method', { productId });
      }

      // Build dynamic SET clause — price column is NUMERIC (selling price), cost_cents / msrp_cents are INTEGER
      const sets = [];
      const params = [];
      let idx = 1;
      const oldValues = {};
      const newValues = {};

      if (pricingData.price_cents != null) {
        sets.push(`price = $${idx++}`);
        params.push(pricingData.price_cents);
        oldValues.price = current.price;
        newValues.price = pricingData.price_cents;
      }
      if (pricingData.cost_cents != null) {
        sets.push(`cost_cents = $${idx++}`);
        params.push(pricingData.cost_cents);
        oldValues.cost_cents = current.cost_cents;
        newValues.cost_cents = pricingData.cost_cents;
      }
      if (pricingData.msrp_cents != null) {
        sets.push(`msrp_cents = $${idx++}`);
        params.push(pricingData.msrp_cents);
        oldValues.msrp_cents = current.msrp_cents;
        newValues.msrp_cents = pricingData.msrp_cents;
      }

      if (sets.length === 0) {
        return { updated: current, warning: null };
      }

      sets.push('updated_at = NOW()');
      params.push(productId);
      const updateRes = await this.pool.query(
        `UPDATE products SET ${sets.join(', ')} WHERE id = $${idx} AND is_parent = false RETURNING *`,
        params
      );

      // Below-cost warning
      let warning = null;
      const effectivePrice = pricingData.price_cents != null ? pricingData.price_cents : Number(current.price);
      const effectiveCost = pricingData.cost_cents != null ? pricingData.cost_cents : (current.cost_cents || 0);
      if (effectivePrice < effectiveCost) {
        console.warn(`[ProductVariantService] BELOW_COST: variant ${productId} price (${effectivePrice}) < cost (${effectiveCost})`);
        warning = 'BELOW_COST';
      }

      // Audit
      await this.pool.query(
        `INSERT INTO stock_movements
           (product_id, movement_type, quantity, quantity_before, quantity_after,
            reference_type, notes, created_by)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
        [
          productId,
          'adjustment',
          0,
          0,
          0,
          'variant_pricing',
          JSON.stringify({ action: 'pricing_updated', old: oldValues, new: newValues, warning }),
          String(userId)
        ]
      );

      this.cache?.invalidatePattern?.('variant:*');
      this.cache?.invalidatePattern?.('product:*');

      return { updated: updateRes.rows[0], warning };
    } catch (err) {
      if (['VARIANT_NOT_FOUND', 'INVALID_ADJUSTMENT'].includes(err.code)) throw err;
      throw this._variantError('DB_ERROR', 'Failed to update variant pricing', {
        productId, detail: err.message
      });
    }
  }

  /**
   * Deactivate a variant. Blocks if any location has qty_reserved > 0.
   * @param {number} productId
   * @param {number} userId
   * @param {string} reason
   * @returns {Promise<object>} Deactivated product row
   */
  async deactivateVariant(productId, userId, reason) {
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');

      // Verify it's a variant
      const prodRes = await client.query(
        `SELECT * FROM products WHERE id = $1 FOR UPDATE`,
        [productId]
      );
      if (prodRes.rows.length === 0) {
        throw this._variantError('VARIANT_NOT_FOUND', 'Product not found', { productId });
      }
      if (prodRes.rows[0].is_parent || !prodRes.rows[0].parent_product_id) {
        throw this._variantError('INVALID_ADJUSTMENT', 'Product is not a variant', { productId });
      }

      // 1. Check reservations across all variant_inventory rows
      const reservedRes = await client.query(
        `SELECT vi.location_id, vi.qty_reserved, l.name AS location_name
         FROM variant_inventory vi
         LEFT JOIN locations l ON l.id = vi.location_id
         WHERE vi.product_id = $1 AND vi.qty_reserved > 0`,
        [productId]
      );
      if (reservedRes.rows.length > 0) {
        throw this._variantError('VARIANT_HAS_RESERVATIONS',
          'Cannot deactivate variant with active reservations', {
            productId,
            reservations: reservedRes.rows.map(r => ({
              location_id: r.location_id,
              location_name: r.location_name,
              qty_reserved: r.qty_reserved
            }))
          });
      }

      // 2. Deactivate (keep qty_on_hand for historical reporting)
      const updateRes = await client.query(
        `UPDATE products SET is_active = false, updated_at = NOW()
         WHERE id = $1 RETURNING *`,
        [productId]
      );

      // 3. Audit
      await client.query(
        `INSERT INTO stock_movements
           (product_id, movement_type, quantity, quantity_before, quantity_after,
            reference_type, notes, created_by)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
        [
          productId,
          'adjustment',
          0,
          prodRes.rows[0].qty_on_hand || 0,
          prodRes.rows[0].qty_on_hand || 0,
          'variant_inventory',
          JSON.stringify({ action: 'variant_deactivated', reason }),
          String(userId)
        ]
      );

      await client.query('COMMIT');

      this.cache?.invalidatePattern?.('inventory:*');
      this.cache?.invalidatePattern?.('variant:*');
      this.cache?.invalidatePattern?.('product:*');

      return updateRes.rows[0];
    } catch (err) {
      await client.query('ROLLBACK');
      if (['VARIANT_NOT_FOUND', 'INVALID_ADJUSTMENT', 'VARIANT_HAS_RESERVATIONS'].includes(err.code)) throw err;
      throw this._variantError('DB_ERROR', 'Failed to deactivate variant', {
        productId, detail: err.message
      });
    } finally {
      client.release();
    }
  }

  // ---------------------------------------------------------------------------
  // PHASE 2 — POS PICKER INTEGRATION
  // ---------------------------------------------------------------------------

  /**
   * Get the full picker state for the POS variant selector.
   * Called on every attribute selection change.
   * @param {number} parentProductId
   * @param {number[]} selectedAttributeValueIds - Currently selected value IDs
   * @param {number|null} locationId - POS location for inventory lookup
   * @returns {Promise<object>} Picker state
   */
  async getPickerState(parentProductId, selectedAttributeValueIds = [], locationId = null) {
    try {
      // 0. Validate parent exists and is_parent = true
      const parentCheck = await this.pool.query(
        `SELECT id, is_parent FROM products WHERE id = $1`,
        [parentProductId]
      );
      if (parentCheck.rows.length === 0) {
        throw this._variantError('VARIANT_NOT_FOUND', 'Parent product not found', { parentProductId });
      }
      if (!parentCheck.rows[0].is_parent) {
        throw this._variantError('VARIANT_NOT_FOUND', 'Product is not a parent product', { parentProductId });
      }

      // 1. Load parent config for display_mode and varying attributes
      const configRes = await this.pool.query(
        `SELECT * FROM product_parent_config WHERE product_id = $1`,
        [parentProductId]
      );
      const config = configRes.rows[0] || null;
      const varyingAttrIds = config?.varying_attribute_ids || [];

      if (varyingAttrIds.length === 0) {
        // No variant config — fall back to empty picker
        return {
          availableAttributes: [],
          matchedVariant: null,
          isComplete: false,
          inventoryAtLocation: null
        };
      }

      // 2. Load all active variants for this parent with their attribute value mappings
      const variantsRes = await this.pool.query(
        `SELECT p.id
         FROM products p
         WHERE p.parent_product_id = $1 AND p.is_active = true`,
        [parentProductId]
      );
      const allVariantIds = variantsRes.rows.map(r => r.id);

      if (allVariantIds.length === 0) {
        return {
          availableAttributes: [],
          matchedVariant: null,
          isComplete: false,
          inventoryAtLocation: null
        };
      }

      // 3. Load all variant↔attribute-value mappings in one query
      const mappingsRes = await this.pool.query(
        `SELECT pva.product_id, pva.attribute_id, pva.attribute_value_id
         FROM product_variant_attributes pva
         WHERE pva.product_id = ANY($1)`,
        [allVariantIds]
      );

      // Build lookup: variantId → Set of attribute_value_ids
      const variantValueMap = {};  // variantId → Set<valueId>
      for (const row of mappingsRes.rows) {
        if (!variantValueMap[row.product_id]) variantValueMap[row.product_id] = new Set();
        variantValueMap[row.product_id].add(row.attribute_value_id);
      }

      // 4. Find compatible variants — those matching ALL currently selected values
      const selectedSet = new Set(selectedAttributeValueIds);
      const compatibleVariantIds = allVariantIds.filter(vid => {
        const vals = variantValueMap[vid];
        if (!vals) return false;
        for (const sv of selectedSet) {
          if (!vals.has(sv)) return false;
        }
        return true;
      });

      // Build set of value IDs present on compatible variants (for isSelectable)
      const selectableValueIds = new Set();
      for (const vid of compatibleVariantIds) {
        const vals = variantValueMap[vid];
        if (vals) {
          for (const v of vals) selectableValueIds.add(v);
        }
      }

      // 5. Load attribute metadata + all values for each varying attribute
      const attrsRes = await this.pool.query(
        `SELECT pa.id AS attribute_id, pa.name AS attribute_name, pa.display_order
         FROM product_attributes pa
         WHERE pa.id = ANY($1)
         ORDER BY pa.display_order`,
        [varyingAttrIds]
      );

      const valuesRes = await this.pool.query(
        `SELECT pav.id, pav.attribute_id, pav.value AS label,
                pav.metadata->>'hex' AS color_hex, pav.display_order
         FROM product_attribute_values pav
         WHERE pav.attribute_id = ANY($1)
         ORDER BY pav.display_order`,
        [varyingAttrIds]
      );

      // Group values by attribute
      const valuesByAttr = {};
      for (const v of valuesRes.rows) {
        if (!valuesByAttr[v.attribute_id]) valuesByAttr[v.attribute_id] = [];
        valuesByAttr[v.attribute_id].push(v);
      }

      // Determine per-attribute display mode from config (single display_mode applies to all for now)
      const displayMode = config?.display_mode || 'dropdown';

      // 6. Build availableAttributes
      const availableAttributes = attrsRes.rows.map(attr => ({
        attributeId: attr.attribute_id,
        attributeName: attr.attribute_name,
        displayMode,
        values: (valuesByAttr[attr.attribute_id] || []).map(v => ({
          valueId: v.id,
          label: v.label,
          colorHex: v.color_hex || null,
          isSelectable: selectableValueIds.has(v.id),
          isSelected: selectedSet.has(v.id)
        }))
      }));

      // 7. Attempt to match a variant (all attributes selected)
      let matchedVariant = null;
      let inventoryAtLocation = null;

      if (selectedAttributeValueIds.length === varyingAttrIds.length && selectedAttributeValueIds.length > 0) {
        // Exact match: find the variant whose values match exactly
        const match = compatibleVariantIds.find(vid => {
          const vals = variantValueMap[vid];
          return vals && vals.size === selectedAttributeValueIds.length;
        });

        if (match) {
          const varRes = await this.pool.query(
            `SELECT * FROM products WHERE id = $1`, [match]
          );
          matchedVariant = varRes.rows[0] || null;

          // Inventory at location
          if (matchedVariant) {
            if (locationId != null) {
              const invRes = await this.pool.query(
                `SELECT qty_on_hand, qty_reserved, qty_available
                 FROM variant_inventory
                 WHERE product_id = $1 AND location_id = $2`,
                [match, locationId]
              );
              inventoryAtLocation = invRes.rows[0] || { qty_on_hand: 0, qty_reserved: 0, qty_available: 0 };
            } else {
              const invRes = await this.pool.query(
                `SELECT
                   COALESCE(SUM(qty_on_hand), 0)::int AS qty_on_hand,
                   COALESCE(SUM(qty_reserved), 0)::int AS qty_reserved,
                   COALESCE(SUM(qty_on_hand - qty_reserved), 0)::int AS qty_available
                 FROM variant_inventory WHERE product_id = $1`,
                [match]
              );
              inventoryAtLocation = invRes.rows[0];
            }
          }
        }
      }

      return {
        availableAttributes,
        matchedVariant,
        isComplete: matchedVariant !== null,
        inventoryAtLocation
      };
    } catch (err) {
      if (err.code && ['VARIANT_NOT_FOUND'].includes(err.code)) throw err;
      throw this._variantError('DB_ERROR', 'Failed to compute picker state', {
        parentProductId, selectedAttributeValueIds, detail: err.message
      });
    }
  }

  // ---------------------------------------------------------------------------
  // PHASE 2 — BULK OPERATIONS
  // ---------------------------------------------------------------------------

  /**
   * Bulk-update variant sort order (drag-and-drop reorder).
   * @param {Array<{productId: number, sortOrder: number}>} updates
   * @param {number} userId
   * @returns {Promise<{count: number}>} Number of updated rows
   */
  async bulkUpdateVariantSortOrder(updates, userId) {
    if (!updates || updates.length === 0) return { count: 0 };

    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');

      let count = 0;
      for (const { productId, sortOrder } of updates) {
        const res = await client.query(
          `UPDATE products SET variant_sort_order = $1, updated_at = NOW()
           WHERE id = $2 AND is_parent = false`,
          [sortOrder, productId]
        );
        count += res.rowCount;
      }

      await client.query('COMMIT');

      this.cache?.invalidatePattern?.('variant:*');
      this.cache?.invalidatePattern?.('product:*');

      return { count };
    } catch (err) {
      await client.query('ROLLBACK');
      throw this._variantError('DB_ERROR', 'Failed to bulk update sort order', {
        updateCount: updates.length, detail: err.message
      });
    } finally {
      client.release();
    }
  }
}

module.exports = ProductVariantService;
