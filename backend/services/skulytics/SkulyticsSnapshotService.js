'use strict';

/**
 * SkulyticsSnapshotService.js
 *
 * Pure transformation — no database calls, no side effects.
 *
 * Builds an immutable quote-time snapshot DTO by merging a
 * global_skulytics_products row with an optional tenant_product_overrides
 * row.  The snapshot is stored as JSONB on quote_items.skulytics_snapshot
 * so the quote preserves the exact product state at the moment it was created.
 */

// ── Error ───────────────────────────────────────────────────

class SnapshotBuildError extends Error {
  /**
   * @param {string} message
   * @param {Object} [context]
   */
  constructor(message, context) {
    super(message);
    this.name = 'SnapshotBuildError';
    this.context = context || null;
  }
}

// ── Builder ─────────────────────────────────────────────────

/**
 * Build a frozen quote-time snapshot from a global product row
 * and an optional tenant override row.
 *
 * @param {Object} globalProduct   - Row from global_skulytics_products
 * @param {Object|null} [tenantOverride=null] - Row from tenant_product_overrides
 * @returns {Readonly<Object>} Frozen snapshot DTO
 * @throws {SnapshotBuildError} If skulytics_id is missing from globalProduct
 */
function buildQuoteSnapshot(globalProduct, tenantOverride = null) {
  // ── Validation ──────────────────────────────────────────
  if (!globalProduct || !globalProduct.skulytics_id) {
    throw new SnapshotBuildError(
      'Cannot build snapshot: skulytics_id is missing from globalProduct',
      { globalProduct, tenantOverride }
    );
  }

  const g = globalProduct;
  const t = tenantOverride || {};

  // Capture timestamp once so it's consistent across the snapshot
  const snapshotTakenAt = new Date().toISOString();

  // ── Build dimensions sub-object ─────────────────────────
  const dimensions_cm = Object.freeze({
    width:  g.width_cm  ?? null,
    height: g.height_cm ?? null,
    depth:  g.depth_cm  ?? null,
  });

  // ── Deep-copy arrays/objects so the snapshot is self-contained ──
  const frozenSpecs    = g.specs    != null ? JSON.parse(JSON.stringify(g.specs))    : null;
  const frozenImages   = g.images   != null ? JSON.parse(JSON.stringify(g.images))   : null;
  const frozenWarranty = g.warranty != null ? JSON.parse(JSON.stringify(g.warranty)) : null;

  // ── Assemble DTO ────────────────────────────────────────
  const snapshot = {
    // Identifiers
    skulytics_id:   g.skulytics_id,
    sku:            g.sku  ?? null,
    upc:            g.upc  ?? null,

    // Product identity (tenant override wins on non-null)
    brand:          g.brand ?? null,
    model_number:   g.model_number ?? null,
    model_name:     (t.custom_model_name != null ? t.custom_model_name : g.model_name) ?? null,
    description:    t.custom_description ?? null,
    category_slug:  g.category_slug ?? null,

    // Pricing frozen at quote time
    msrp_at_quote:  (t.override_msrp != null ? t.override_msrp : g.msrp) ?? null,
    currency:       g.currency ?? 'CAD',

    // Logistics
    weight_kg:      g.weight_kg ?? null,
    dimensions_cm,

    // Spec sheet — frozen
    specs:          frozenSpecs,

    // Media — frozen at snapshot time
    images:         frozenImages,

    // Variants
    variant_group_id: g.variant_group_id ?? null,
    variant_type:     g.variant_type     ?? null,
    variant_value:    g.variant_value    ?? null,

    // Warranty
    warranty:       frozenWarranty,

    // Trade-in
    buyback_value_at_quote: g.buyback_value ?? null,

    // Provenance
    skulytics_snapshot_version: g.api_schema_version ?? null,
    skulytics_synced_at:        g.last_synced_at     ?? null,
    snapshot_taken_at:          snapshotTakenAt,
  };

  return Object.freeze(snapshot);
}

module.exports = {
  buildQuoteSnapshot,
  SnapshotBuildError,
};
