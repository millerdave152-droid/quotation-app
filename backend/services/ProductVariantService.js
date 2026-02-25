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
}

module.exports = ProductVariantService;
