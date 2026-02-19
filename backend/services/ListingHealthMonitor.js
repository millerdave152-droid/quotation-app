const pool = require('../db');

/**
 * ListingHealthMonitor — Scans marketplace listings for data quality issues.
 *
 * Runs a battery of checks against every active listing on a channel,
 * records issues in listing_issues, and can auto-fix certain problems
 * (stock drift, price mismatch) by pushing corrections to the channel.
 *
 * Usage:
 *   const healthMonitor = require('./services/ListingHealthMonitor');
 *   const result = await healthMonitor.scanChannel(channelId);
 *   const fixes  = await healthMonitor.autoFix(channelId);
 */
class ListingHealthMonitor {
  constructor(dbPool) {
    this.pool = dbPool;

    // Ordered list of check functions.  Each returns null (no issue) or
    // { type, severity, details, autoFixable }.
    this._checks = [
      this._checkMissingUPC,
      this._checkMissingSKU,
      this._checkMissingDescription,
      this._checkDescriptionShort,
      this._checkMissingCategory,
      this._checkMissingTaxCode,
      this._checkZeroStock,
      this._checkNegativeMargin,
      this._checkPriceMismatch,
      this._checkStockDrift,
    ];
  }

  // ============================================================
  // SCANNING
  // ============================================================

  /**
   * Scan all active listings on a channel for issues.
   *
   * @param {number} channelId
   * @returns {{ scanned, issuesFound, issuesResolved, newIssues, byType, bySeverity }}
   */
  async scanChannel(channelId) {
    // 1. Load all active listings with product data
    const { rows: listings } = await this.pool.query(`
      SELECT
        pcl.product_id, pcl.channel_id, pcl.channel_sku, pcl.channel_price,
        pcl.channel_category_id, pcl.listing_status, pcl.channel_quantity,
        p.name, p.sku, p.upc, p.price, p.cost, p.description,
        p.stock_quantity, p.manufacturer, p.category,
        p.bestbuy_product_tax_code, p.bestbuy_category_id
      FROM product_channel_listings pcl
      JOIN products p ON p.id = pcl.product_id
      WHERE pcl.channel_id = $1 AND pcl.listing_status IN ('ACTIVE', 'PENDING', 'DRAFT')
    `, [channelId]);

    const byType = {};
    const bySeverity = { ERROR: 0, WARNING: 0, INFO: 0 };
    let issuesFound = 0;
    let newIssues = 0;

    // Track which product+type combos we found issues for (to resolve stale ones)
    const foundIssueKeys = new Set();

    // 2. Run all checks on each listing
    for (const listing of listings) {
      for (const checkFn of this._checks) {
        const issue = checkFn.call(this, listing);
        if (!issue) continue;

        issuesFound++;
        byType[issue.type] = (byType[issue.type] || 0) + 1;
        bySeverity[issue.severity] = (bySeverity[issue.severity] || 0) + 1;
        foundIssueKeys.add(`${listing.product_id}:${issue.type}`);

        // UPSERT into listing_issues
        const result = await this.pool.query(`
          INSERT INTO listing_issues
            (product_id, channel_id, issue_type, severity, details, auto_fixable, detected_at)
          VALUES ($1, $2, $3, $4, $5, $6, NOW())
          ON CONFLICT (product_id, channel_id, issue_type) DO UPDATE
          SET severity = EXCLUDED.severity,
              details = EXCLUDED.details,
              auto_fixable = EXCLUDED.auto_fixable,
              detected_at = CASE WHEN listing_issues.resolved_at IS NOT NULL THEN NOW() ELSE listing_issues.detected_at END,
              resolved_at = NULL,
              fix_applied = CASE WHEN listing_issues.resolved_at IS NOT NULL THEN false ELSE listing_issues.fix_applied END
          RETURNING (xmax = 0) AS is_insert
        `, [
          listing.product_id,
          channelId,
          issue.type,
          issue.severity,
          JSON.stringify(issue.details || {}),
          issue.autoFixable || false
        ]);

        if (result.rows[0]?.is_insert) newIssues++;
      }
    }

    // 3. Resolve issues that no longer apply
    //    (issues for products on this channel that we scanned but didn't find the issue)
    const productIds = listings.map(l => l.product_id);
    let issuesResolved = 0;

    if (productIds.length > 0) {
      // Get all open issues for scanned products on this channel
      const { rows: openIssues } = await this.pool.query(`
        SELECT id, product_id, issue_type
        FROM listing_issues
        WHERE channel_id = $1 AND product_id = ANY($2) AND resolved_at IS NULL
      `, [channelId, productIds]);

      for (const oi of openIssues) {
        const key = `${oi.product_id}:${oi.issue_type}`;
        if (!foundIssueKeys.has(key)) {
          await this.pool.query(
            'UPDATE listing_issues SET resolved_at = NOW() WHERE id = $1',
            [oi.id]
          );
          issuesResolved++;
        }
      }
    }

    return {
      scanned: listings.length,
      issuesFound,
      newIssues,
      issuesResolved,
      byType,
      bySeverity
    };
  }

  // ============================================================
  // AUTO-FIX
  // ============================================================

  /**
   * Auto-fix repairable issues on a channel.
   *
   * Fixable issue types:
   *   STOCK_DRIFT    → queue inventory push for correct quantity
   *   PRICE_MISMATCH → update channel_price on listing
   *
   * @param {number} channelId
   * @returns {{ fixed, byType, errors }}
   */
  async autoFix(channelId) {
    const { rows: fixable } = await this.pool.query(`
      SELECT li.*, p.sku, p.stock_quantity, p.price
      FROM listing_issues li
      JOIN products p ON p.id = li.product_id
      WHERE li.channel_id = $1
        AND li.auto_fixable = true
        AND li.fix_applied = false
        AND li.resolved_at IS NULL
      ORDER BY li.detected_at
    `, [channelId]);

    let fixed = 0;
    const byType = {};
    const errors = [];

    for (const issue of fixable) {
      try {
        switch (issue.issue_type) {
          case 'STOCK_DRIFT': {
            // Queue an inventory sync for this product
            const miraklService = require('./miraklService');
            await miraklService.queueInventoryChange(
              issue.product_id,
              issue.sku,
              issue.details?.channelQty || 0,
              parseInt(issue.stock_quantity, 10) || 0,
              'HEALTH_FIX',
              channelId
            );
            fixed++;
            byType.STOCK_DRIFT = (byType.STOCK_DRIFT || 0) + 1;
            break;
          }

          case 'PRICE_MISMATCH': {
            // Update channel_price to match our base price
            await this.pool.query(
              `UPDATE product_channel_listings
               SET channel_price = $1, updated_at = NOW()
               WHERE product_id = $2 AND channel_id = $3`,
              [issue.price, issue.product_id, channelId]
            );
            fixed++;
            byType.PRICE_MISMATCH = (byType.PRICE_MISMATCH || 0) + 1;
            break;
          }

          default:
            continue; // skip non-fixable types
        }

        // Mark as fixed
        await this.pool.query(
          'UPDATE listing_issues SET fix_applied = true, fix_applied_at = NOW() WHERE id = $1',
          [issue.id]
        );
      } catch (err) {
        errors.push({ issueId: issue.id, type: issue.issue_type, error: err.message });
      }
    }

    return { fixed, byType, errors: errors.length > 0 ? errors : undefined, totalFixable: fixable.length };
  }

  // ============================================================
  // HEALTH SCORE & SUMMARY
  // ============================================================

  /**
   * Get health score for a channel.
   * Score = % of listings WITHOUT open ERROR-level issues.
   *
   * @param {number} channelId
   * @returns {{ score, totalListings, healthyListings, errorListings, warningListings }}
   */
  async getHealthScore(channelId) {
    const [totalResult, errorResult, warningResult] = await Promise.all([
      this.pool.query(
        `SELECT COUNT(*) AS cnt FROM product_channel_listings
         WHERE channel_id = $1 AND listing_status IN ('ACTIVE', 'PENDING')`,
        [channelId]
      ),
      this.pool.query(
        `SELECT COUNT(DISTINCT product_id) AS cnt FROM listing_issues
         WHERE channel_id = $1 AND severity = 'ERROR' AND resolved_at IS NULL`,
        [channelId]
      ),
      this.pool.query(
        `SELECT COUNT(DISTINCT product_id) AS cnt FROM listing_issues
         WHERE channel_id = $1 AND severity = 'WARNING' AND resolved_at IS NULL`,
        [channelId]
      )
    ]);

    const total = parseInt(totalResult.rows[0].cnt, 10) || 0;
    const errorCount = parseInt(errorResult.rows[0].cnt, 10) || 0;
    const warningCount = parseInt(warningResult.rows[0].cnt, 10) || 0;
    const healthy = Math.max(0, total - errorCount);
    const score = total > 0 ? Math.round((healthy / total) * 100) : 100;

    return {
      score,
      totalListings: total,
      healthyListings: healthy,
      errorListings: errorCount,
      warningListings: warningCount
    };
  }

  /**
   * Get issue summary for dashboard.
   *
   * @param {number|null} channelId - filter by channel, or null for all
   * @returns {Array<{ issueType, severity, count, autoFixable }>}
   */
  async getIssueSummary(channelId = null) {
    const where = ['li.resolved_at IS NULL'];
    const params = [];

    if (channelId) {
      where.push('li.channel_id = $1');
      params.push(channelId);
    }

    const { rows } = await this.pool.query(`
      SELECT
        li.issue_type,
        li.severity,
        COUNT(*) AS count,
        COUNT(*) FILTER (WHERE li.auto_fixable = true) AS auto_fixable_count,
        COUNT(*) FILTER (WHERE li.fix_applied = true) AS already_fixed_count
      FROM listing_issues li
      WHERE ${where.join(' AND ')}
      GROUP BY li.issue_type, li.severity
      ORDER BY
        CASE li.severity WHEN 'ERROR' THEN 1 WHEN 'WARNING' THEN 2 ELSE 3 END,
        COUNT(*) DESC
    `, params);

    return rows.map(r => ({
      issueType: r.issue_type,
      severity: r.severity,
      count: parseInt(r.count, 10),
      autoFixableCount: parseInt(r.auto_fixable_count, 10),
      alreadyFixedCount: parseInt(r.already_fixed_count, 10)
    }));
  }

  /**
   * Get individual issues with filters.
   *
   * @param {object} filters - { channelId, severity, type, productId, limit, offset }
   * @returns {Array}
   */
  async getIssues(filters = {}) {
    const where = ['li.resolved_at IS NULL'];
    const params = [];
    let idx = 1;

    if (filters.channelId) {
      where.push(`li.channel_id = $${idx++}`);
      params.push(filters.channelId);
    }
    if (filters.severity) {
      where.push(`li.severity = $${idx++}`);
      params.push(filters.severity);
    }
    if (filters.type) {
      where.push(`li.issue_type = $${idx++}`);
      params.push(filters.type);
    }
    if (filters.productId) {
      where.push(`li.product_id = $${idx++}`);
      params.push(filters.productId);
    }

    const limit = Math.min(parseInt(filters.limit, 10) || 50, 200);
    const offset = parseInt(filters.offset, 10) || 0;
    params.push(limit, offset);

    const { rows } = await this.pool.query(`
      SELECT li.*,
             p.name AS product_name, p.sku AS product_sku,
             mc.channel_code, mc.channel_name
      FROM listing_issues li
      JOIN products p ON p.id = li.product_id
      LEFT JOIN marketplace_channels mc ON mc.id = li.channel_id
      WHERE ${where.join(' AND ')}
      ORDER BY
        CASE li.severity WHEN 'ERROR' THEN 1 WHEN 'WARNING' THEN 2 ELSE 3 END,
        li.detected_at DESC
      LIMIT $${idx} OFFSET $${idx + 1}
    `, params);

    return rows;
  }

  // ============================================================
  // INDIVIDUAL CHECK METHODS
  // Each receives a listing+product joined row.
  // Returns null (no issue) or { type, severity, details, autoFixable }.
  // ============================================================

  _checkMissingUPC(row) {
    if (!row.upc || row.upc.trim() === '') {
      return {
        type: 'MISSING_UPC',
        severity: 'ERROR',
        details: { field: 'upc', message: 'Product has no UPC/EAN barcode' },
        autoFixable: false
      };
    }
    // Validate UPC format
    const cleaned = row.upc.replace(/\D/g, '');
    if (cleaned.length !== 12 && cleaned.length !== 13) {
      return {
        type: 'MISSING_UPC',
        severity: 'ERROR',
        details: { field: 'upc', value: row.upc, message: `Invalid UPC length: ${cleaned.length} (expected 12 or 13)` },
        autoFixable: false
      };
    }
    return null;
  }

  _checkMissingSKU(row) {
    if (!row.sku || row.sku.trim() === '') {
      return {
        type: 'MISSING_SKU',
        severity: 'ERROR',
        details: { field: 'sku', message: 'Product has no SKU' },
        autoFixable: false
      };
    }
    return null;
  }

  _checkMissingDescription(row) {
    if (!row.description || row.description.trim() === '') {
      return {
        type: 'MISSING_DESCRIPTION',
        severity: 'WARNING',
        details: { field: 'description', message: 'Product has no description' },
        autoFixable: false
      };
    }
    return null;
  }

  _checkDescriptionShort(row) {
    if (!row.description) return null; // separate check handles missing
    const plainText = row.description.replace(/<[^>]*>/g, '').trim();
    if (plainText.length > 0 && plainText.length < 50) {
      return {
        type: 'DESCRIPTION_SHORT',
        severity: 'WARNING',
        details: {
          field: 'description',
          length: plainText.length,
          message: `Description is only ${plainText.length} characters (recommended: 50+)`
        },
        autoFixable: false
      };
    }
    return null;
  }

  _checkMissingCategory(row) {
    if (!row.channel_category_id && !row.bestbuy_category_id) {
      return {
        type: 'CATEGORY_INVALID',
        severity: 'WARNING',
        details: { field: 'channel_category_id', message: 'No category mapped for this channel' },
        autoFixable: false
      };
    }
    return null;
  }

  _checkMissingTaxCode(row) {
    // Only relevant for channels that require it (Best Buy)
    if (!row.bestbuy_product_tax_code || row.bestbuy_product_tax_code.trim() === '') {
      return {
        type: 'MISSING_TAX_CODE',
        severity: 'INFO',
        details: { field: 'bestbuy_product_tax_code', message: 'No product tax code set' },
        autoFixable: false
      };
    }
    return null;
  }

  _checkZeroStock(row) {
    const stock = parseInt(row.stock_quantity, 10) || 0;
    if (stock <= 0 && row.listing_status === 'ACTIVE') {
      return {
        type: 'ZERO_STOCK',
        severity: 'WARNING',
        details: { field: 'stock_quantity', value: stock, message: 'Active listing with zero stock' },
        autoFixable: false
      };
    }
    return null;
  }

  _checkNegativeMargin(row) {
    const price = parseFloat(row.channel_price || row.price) || 0;
    const cost = parseFloat(row.cost) || 0;
    if (cost > 0 && price > 0 && price < cost) {
      const marginPct = Math.round(((price - cost) / cost) * 100);
      return {
        type: 'NEGATIVE_MARGIN',
        severity: 'ERROR',
        details: {
          price,
          cost,
          marginPercent: marginPct,
          message: `Selling below cost: $${price.toFixed(2)} < $${cost.toFixed(2)} (${marginPct}%)`
        },
        autoFixable: false
      };
    }
    return null;
  }

  _checkPriceMismatch(row) {
    const channelPrice = parseFloat(row.channel_price) || 0;
    const basePrice = parseFloat(row.price) || 0;
    // Only flag if both are set and differ by more than 1%
    if (channelPrice > 0 && basePrice > 0) {
      const diff = Math.abs(channelPrice - basePrice);
      const pct = (diff / basePrice) * 100;
      if (pct > 1) {
        return {
          type: 'PRICE_MISMATCH',
          severity: 'WARNING',
          details: {
            channelPrice,
            basePrice,
            diffPercent: Math.round(pct * 100) / 100,
            message: `Channel price $${channelPrice.toFixed(2)} differs from base $${basePrice.toFixed(2)} by ${pct.toFixed(1)}%`
          },
          autoFixable: true
        };
      }
    }
    return null;
  }

  _checkStockDrift(row) {
    const channelQty = parseInt(row.channel_quantity, 10);
    const ourQty = parseInt(row.stock_quantity, 10) || 0;
    // Only flag if channel_quantity is tracked and differs
    if (!isNaN(channelQty) && channelQty !== ourQty) {
      return {
        type: 'STOCK_DRIFT',
        severity: ourQty === 0 ? 'ERROR' : 'WARNING',
        details: {
          channelQty,
          ourQty,
          diff: ourQty - channelQty,
          message: `Channel shows ${channelQty} units, we have ${ourQty}`
        },
        autoFixable: true
      };
    }
    return null;
  }
}

// Singleton instance
const healthMonitor = new ListingHealthMonitor(pool);

module.exports = healthMonitor;
