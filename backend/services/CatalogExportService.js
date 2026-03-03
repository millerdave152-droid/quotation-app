const { ApiError } = require('../middleware/errorHandler');

class CatalogExportService {
  constructor(pool, cache = null) {
    this.pool = pool;
    this.cache = cache;
  }

  async createExport(data, userId) {
    const { rows: [exp] } = await this.pool.query(
      `INSERT INTO catalog_exports (name, platform, filter_rules, field_mapping, schedule_cron, is_active, created_by)
       VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING *`,
      [data.name, data.platform, JSON.stringify(data.filterRules || {}),
       JSON.stringify(data.fieldMapping || {}), data.scheduleCron || null,
       data.isActive !== false, userId]
    );
    return exp;
  }

  async listExports() {
    const { rows } = await this.pool.query(
      `SELECT ce.*,
       (SELECT COUNT(*)::int FROM catalog_export_log WHERE export_id = ce.id) as total_runs,
       (SELECT products_exported FROM catalog_export_log WHERE export_id = ce.id ORDER BY started_at DESC LIMIT 1) as last_product_count
       FROM catalog_exports ce ORDER BY ce.created_at DESC`
    );
    return rows;
  }

  async updateExport(exportId, data) {
    const fields = [];
    const params = [];
    let pi = 1;
    if (data.name !== undefined) { fields.push(`name = $${pi++}`); params.push(data.name); }
    if (data.filterRules !== undefined) { fields.push(`filter_rules = $${pi++}`); params.push(JSON.stringify(data.filterRules)); }
    if (data.fieldMapping !== undefined) { fields.push(`field_mapping = $${pi++}`); params.push(JSON.stringify(data.fieldMapping)); }
    if (data.scheduleCron !== undefined) { fields.push(`schedule_cron = $${pi++}`); params.push(data.scheduleCron); }
    if (data.isActive !== undefined) { fields.push(`is_active = $${pi++}`); params.push(data.isActive); }

    if (!fields.length) throw new ApiError(400, 'No valid fields');
    fields.push('updated_at = NOW()');
    params.push(exportId);

    const { rows: [exp] } = await this.pool.query(
      `UPDATE catalog_exports SET ${fields.join(', ')} WHERE id = $${pi} RETURNING *`, params
    );
    if (!exp) throw new ApiError(404, 'Export not found');
    return exp;
  }

  async runExport(exportId) {
    const { rows: [config] } = await this.pool.query(
      'SELECT * FROM catalog_exports WHERE id = $1', [exportId]
    );
    if (!config) throw new ApiError(404, 'Export config not found');

    // Create log entry
    const { rows: [log] } = await this.pool.query(
      'INSERT INTO catalog_export_log (export_id, format) VALUES ($1, $2) RETURNING *',
      [exportId, config.platform === 'google_shopping' ? 'xml' : 'csv']
    );

    try {
      // Build product query from filter rules
      const filters = config.filter_rules || {};
      const conditions = [];
      const params = [];
      let pi = 1;

      if (filters.categoryId) { conditions.push(`p.category_id = $${pi++}`); params.push(filters.categoryId); }
      if (filters.manufacturer) { conditions.push(`p.manufacturer = $${pi++}`); params.push(filters.manufacturer); }
      if (filters.minPrice) { conditions.push(`p.price >= $${pi++}`); params.push(filters.minPrice); }
      if (filters.inStock !== false) { conditions.push('p.stock_quantity > 0'); }

      const where = conditions.length ? 'WHERE ' + conditions.join(' AND ') : '';

      const { rows: products } = await this.pool.query(
        `SELECT p.id, p.name, p.description, p.sku, p.upc, p.price, p.cost, p.stock_quantity,
         p.manufacturer, p.category, p.image_url
         FROM products p ${where}`,
        params
      );

      let content;
      if (config.platform === 'google_shopping') {
        content = this._generateGoogleShoppingXML(products, config.field_mapping);
      } else {
        content = this._generateFacebookCSV(products, config.field_mapping);
      }

      await this.pool.query(
        `UPDATE catalog_export_log SET products_exported = $2, status = 'completed', completed_at = NOW(),
         file_size_bytes = $3 WHERE id = $1`,
        [log.id, products.length, Buffer.byteLength(content)]
      );

      await this.pool.query(
        'UPDATE catalog_exports SET last_export_at = NOW() WHERE id = $1', [exportId]
      );

      return { logId: log.id, productsExported: products.length, content, format: log.format };
    } catch (err) {
      await this.pool.query(
        'UPDATE catalog_export_log SET status = \'failed\', errors = $2, completed_at = NOW() WHERE id = $1',
        [log.id, JSON.stringify([err.message])]
      );
      throw err;
    }
  }

  _generateFacebookCSV(products, mapping) {
    const headers = ['id', 'title', 'description', 'availability', 'condition', 'price', 'link', 'image_link', 'brand', 'gtin'];
    const rows = products.map(p => [
      p.sku || p.id,
      `"${(p.name || '').replace(/"/g, '""')}"`,
      `"${(p.description || '').replace(/"/g, '""').substring(0, 5000)}"`,
      p.stock_quantity > 0 ? 'in stock' : 'out of stock',
      'new',
      `${p.price} CAD`,
      mapping.baseUrl ? `${mapping.baseUrl}/products/${p.id}` : '',
      p.image_url || '',
      p.manufacturer || '',
      p.upc || ''
    ]);
    return [headers.join(','), ...rows.map(r => r.join(','))].join('\n');
  }

  _generateGoogleShoppingXML(products, _mapping) {
    const items = products.map(p => `
    <item>
      <g:id>${p.sku || p.id}</g:id>
      <g:title><![CDATA[${p.name || ''}]]></g:title>
      <g:description><![CDATA[${(p.description || '').substring(0, 5000)}]]></g:description>
      <g:availability>${p.stock_quantity > 0 ? 'in_stock' : 'out_of_stock'}</g:availability>
      <g:price>${p.price} CAD</g:price>
      <g:brand><![CDATA[${p.manufacturer || ''}]]></g:brand>
      <g:gtin>${p.upc || ''}</g:gtin>
      <g:condition>new</g:condition>
    </item>`).join('');

    return `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns:g="http://base.google.com/ns/1.0">
<channel>
  <title>Product Feed</title>${items}
</channel>
</rss>`;
  }

  async getExportLogs(exportId, limit = 20) {
    const { rows } = await this.pool.query(
      'SELECT * FROM catalog_export_log WHERE export_id = $1 ORDER BY started_at DESC LIMIT $2',
      [exportId, limit]
    );
    return rows;
  }
}

module.exports = CatalogExportService;
