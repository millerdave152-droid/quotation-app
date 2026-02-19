const pool = require('../db');

class TenantManager {
  constructor(pool) {
    this.pool = pool;
  }

  // ─── Create tenant ─────────────────────────────────────────────────
  async createTenant(data) {
    var { tenantCode, companyName, contactEmail, plan, config } = data;
    if (!tenantCode || !companyName) throw new Error('tenantCode and companyName are required');

    var { rows: [tenant] } = await this.pool.query(`
      INSERT INTO marketplace_tenants (tenant_code, company_name, contact_email, plan, config)
      VALUES ($1, $2, $3, $4, $5)
      RETURNING *
    `, [
      tenantCode.toUpperCase(),
      companyName,
      contactEmail || null,
      plan || 'STANDARD',
      JSON.stringify(config || {})
    ]);

    return tenant;
  }

  // ─── List tenants ──────────────────────────────────────────────────
  async getTenants(includeInactive) {
    var filter = includeInactive ? '' : 'WHERE active = true';
    var { rows } = await this.pool.query(
      'SELECT * FROM marketplace_tenants ' + filter + ' ORDER BY created_at ASC'
    );
    return rows;
  }

  // ─── Get single tenant ─────────────────────────────────────────────
  async getTenant(tenantId) {
    var { rows: [tenant] } = await this.pool.query(
      'SELECT * FROM marketplace_tenants WHERE id = $1', [tenantId]
    );
    if (!tenant) throw new Error('Tenant not found: ' + tenantId);
    return tenant;
  }

  // ─── Update tenant ─────────────────────────────────────────────────
  async updateTenant(tenantId, updates) {
    var sets = ['updated_at = NOW()'];
    var params = [];
    var idx = 1;

    if (updates.companyName !== undefined) { sets.push('company_name = $' + idx); params.push(updates.companyName); idx++; }
    if (updates.contactEmail !== undefined) { sets.push('contact_email = $' + idx); params.push(updates.contactEmail); idx++; }
    if (updates.plan !== undefined) { sets.push('plan = $' + idx); params.push(updates.plan); idx++; }
    if (updates.active !== undefined) { sets.push('active = $' + idx); params.push(updates.active); idx++; }
    if (updates.config !== undefined) { sets.push('config = $' + idx); params.push(JSON.stringify(updates.config)); idx++; }

    params.push(tenantId);
    var { rows: [tenant] } = await this.pool.query(
      'UPDATE marketplace_tenants SET ' + sets.join(', ') + ' WHERE id = $' + idx + ' RETURNING *',
      params
    );
    if (!tenant) throw new Error('Tenant not found: ' + tenantId);
    return tenant;
  }

  // ─── Channels for a tenant ─────────────────────────────────────────
  async getTenantChannels(tenantId) {
    var { rows } = await this.pool.query(`
      SELECT c.*,
        (SELECT COUNT(*)::int FROM marketplace_orders o WHERE o.channel_id = c.id AND o.order_state NOT IN ('CANCELED', 'REFUSED')) AS order_count,
        (SELECT COUNT(*)::int FROM product_channel_listings l WHERE l.channel_id = c.id AND l.listing_status = 'ACTIVE') AS active_listings
      FROM marketplace_channels c
      WHERE c.tenant_id = $1
      ORDER BY c.created_at ASC
    `, [tenantId]);
    return rows;
  }

  // ─── Tenant stats (orders, revenue, listings) ──────────────────────
  async getTenantStats(tenantId) {
    var { rows: [orderStats] } = await this.pool.query(`
      SELECT
        COUNT(DISTINCT o.id)::int AS total_orders,
        SUM(COALESCE(oi.line_total, oi.total_price_cents / 100.0))::numeric(14,2) AS total_revenue,
        SUM(COALESCE(oi.commission_amount, oi.commission_fee_cents / 100.0))::numeric(14,2) AS total_commission,
        (SUM(COALESCE(oi.line_total, oi.total_price_cents / 100.0))
         / NULLIF(COUNT(DISTINCT o.id), 0))::numeric(14,2) AS avg_order_value
      FROM marketplace_orders o
      JOIN marketplace_order_items oi ON oi.order_id = o.id
      WHERE o.tenant_id = $1
        AND o.order_state NOT IN ('CANCELED', 'REFUSED')
    `, [tenantId]);

    var { rows: [listingStats] } = await this.pool.query(`
      SELECT
        COUNT(*)::int AS total_listings,
        COUNT(*) FILTER (WHERE listing_status = 'ACTIVE')::int AS active_listings,
        COUNT(*) FILTER (WHERE listing_status = 'ERROR')::int AS error_listings
      FROM product_channel_listings
      WHERE tenant_id = $1
    `, [tenantId]);

    var { rows: [channelStats] } = await this.pool.query(`
      SELECT
        COUNT(*)::int AS total_channels,
        COUNT(*) FILTER (WHERE status = 'ACTIVE')::int AS active_channels
      FROM marketplace_channels
      WHERE tenant_id = $1
    `, [tenantId]);

    var { rows: [returnStats] } = await this.pool.query(`
      SELECT
        COUNT(*)::int AS total_returns,
        COALESCE(SUM(total_refund_cents / 100.0), 0)::numeric(14,2) AS total_refund_value
      FROM marketplace_returns r
      JOIN marketplace_orders o ON o.id = r.order_id
      WHERE o.tenant_id = $1
        AND r.status NOT IN ('rejected', 'REJECTED')
    `, [tenantId]);

    // Recent activity (last 30 days)
    var { rows: [recent] } = await this.pool.query(`
      SELECT
        COUNT(DISTINCT o.id)::int AS orders_30d,
        COALESCE(SUM(COALESCE(oi.line_total, oi.total_price_cents / 100.0)), 0)::numeric(14,2) AS revenue_30d
      FROM marketplace_orders o
      JOIN marketplace_order_items oi ON oi.order_id = o.id
      WHERE o.tenant_id = $1
        AND o.order_date >= NOW() - INTERVAL '30 days'
        AND o.order_state NOT IN ('CANCELED', 'REFUSED')
    `, [tenantId]);

    return {
      orders: {
        total: (orderStats && orderStats.total_orders) || 0,
        revenue: (orderStats && orderStats.total_revenue) || '0.00',
        commission: (orderStats && orderStats.total_commission) || '0.00',
        avg_order_value: (orderStats && orderStats.avg_order_value) || '0.00'
      },
      listings: {
        total: (listingStats && listingStats.total_listings) || 0,
        active: (listingStats && listingStats.active_listings) || 0,
        errors: (listingStats && listingStats.error_listings) || 0
      },
      channels: {
        total: (channelStats && channelStats.total_channels) || 0,
        active: (channelStats && channelStats.active_channels) || 0
      },
      returns: {
        total: (returnStats && returnStats.total_returns) || 0,
        refund_value: (returnStats && returnStats.total_refund_value) || '0.00'
      },
      recent_30d: {
        orders: (recent && recent.orders_30d) || 0,
        revenue: (recent && recent.revenue_30d) || '0.00'
      }
    };
  }

  // ─── Tenant middleware ─────────────────────────────────────────────
  // Extracts tenant_id from the authenticated user's record or X-Tenant header
  // and attaches it to req.tenantId for downstream query filtering.
  tenantMiddleware() {
    var self = this;
    return async function(req, res, next) {
      try {
        // Priority 1: X-Tenant-Id header (admin override)
        var headerTenantId = req.headers['x-tenant-id'];
        if (headerTenantId) {
          var tid = parseInt(headerTenantId, 10);
          var { rows } = await self.pool.query(
            'SELECT id FROM marketplace_tenants WHERE id = $1 AND active = true', [tid]
          );
          if (rows.length === 0) {
            return res.status(403).json({ error: 'Invalid or inactive tenant' });
          }
          req.tenantId = tid;
          return next();
        }

        // Priority 2: Lookup from user's record (if user has tenant_id)
        if (req.user && req.user.userId) {
          // Check if user has a tenant assignment via marketplace_channels they manage
          var { rows: userTenants } = await self.pool.query(`
            SELECT DISTINCT c.tenant_id
            FROM marketplace_channels c
            WHERE c.tenant_id IS NOT NULL
            ORDER BY c.tenant_id ASC
            LIMIT 1
          `);
          if (userTenants.length > 0 && userTenants[0].tenant_id) {
            req.tenantId = userTenants[0].tenant_id;
            return next();
          }
        }

        // Priority 3: Default to first active tenant (backward compatible)
        var { rows: defaultTenant } = await self.pool.query(
          'SELECT id FROM marketplace_tenants WHERE active = true ORDER BY id ASC LIMIT 1'
        );
        if (defaultTenant.length > 0) {
          req.tenantId = defaultTenant[0].id;
        }

        next();
      } catch (err) {
        next(err);
      }
    };
  }
}

module.exports = new TenantManager(pool);
