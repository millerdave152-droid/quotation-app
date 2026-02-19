'use strict';

const {
  buildQuoteSnapshot,
  SnapshotBuildError,
} = require('../SkulyticsSnapshotService');

// ── Fixtures ────────────────────────────────────────────────

/** Full global_skulytics_products row with every field populated. */
const fullGlobal = {
  id: 'some-uuid',
  skulytics_id: 'SKU-abc-123',
  api_schema_version: 'v1',
  sku: 'WH-DRY-4500',
  upc: '012345678901',
  brand: 'Whirlpool',
  model_number: 'WED4500MW',
  model_name: 'Whirlpool 7.0 cu.ft. Electric Dryer',
  category_slug: 'laundry-dryers',
  category_path: ['appliances', 'laundry', 'dryers'],
  msrp: 899.99,
  map_price: 849.99,
  currency: 'CAD',
  weight_kg: 56.5,
  width_cm: 68.58,
  height_cm: 91.44,
  depth_cm: 77.47,
  variant_group_id: 'VG-WED4500',
  is_variant_parent: true,
  parent_skulytics_id: null,
  variant_type: 'color',
  variant_value: 'white',
  is_discontinued: false,
  is_stale: false,
  last_synced_at: '2026-02-17T04:00:00.000Z',
  sync_run_id: 'run-uuid-1',
  raw_json: { id: 'SKU-abc-123', sku: 'WH-DRY-4500' },
  specs: { capacity: '7.0 cu.ft.', voltage: '240V', cycles: 12 },
  images: [
    { url: 'https://img.skulytics.com/a.jpg', type: 'primary', sort_order: 0 },
    { url: 'https://img.skulytics.com/b.jpg', type: 'lifestyle', sort_order: 1 },
  ],
  warranty: { years: 1, type: 'limited' },
  buyback_value: 120.0,
  created_at: '2026-01-01T00:00:00.000Z',
  updated_at: '2026-02-17T04:00:00.000Z',
};

/** Minimal global row — only required fields. */
const minimalGlobal = {
  skulytics_id: 'SKU-min-001',
  sku: 'MIN-001',
  brand: 'Generic',
  currency: 'CAD',
};

/** Full tenant override row. */
const fullOverride = {
  id: 'override-uuid',
  tenant_id: 'tenant-uuid',
  skulytics_id: 'SKU-abc-123',
  custom_description: 'Our exclusive model with extended warranty.',
  custom_model_name: 'TeleTime Exclusive Dryer',
  override_msrp: 799.99,
  is_enabled: true,
  is_featured: true,
  pricing_rule_id: null,
  overridden_by: 'user-uuid',
  created_at: '2026-02-01T00:00:00.000Z',
  updated_at: '2026-02-15T00:00:00.000Z',
};

/** Override with all overridable fields set to null. */
const nullOverride = {
  id: 'override-uuid-2',
  tenant_id: 'tenant-uuid',
  skulytics_id: 'SKU-abc-123',
  custom_description: null,
  custom_model_name: null,
  override_msrp: null,
  is_enabled: true,
  is_featured: false,
};

// ── Expected output shape ───────────────────────────────────

const ALL_SNAPSHOT_KEYS = [
  'skulytics_id', 'sku', 'upc',
  'brand', 'model_number', 'model_name', 'description', 'category_slug',
  'msrp_at_quote', 'currency',
  'weight_kg', 'dimensions_cm',
  'specs', 'images',
  'variant_group_id', 'variant_type', 'variant_value',
  'warranty',
  'buyback_value_at_quote',
  'skulytics_snapshot_version', 'skulytics_synced_at', 'snapshot_taken_at',
];

// ── Tests ───────────────────────────────────────────────────

describe('buildQuoteSnapshot()', () => {

  // ── Override precedence ─────────────────────────────────

  describe('override fields take precedence', () => {
    test('custom_model_name overrides model_name', () => {
      const snap = buildQuoteSnapshot(fullGlobal, fullOverride);
      expect(snap.model_name).toBe('TeleTime Exclusive Dryer');
    });

    test('custom_description populates description', () => {
      const snap = buildQuoteSnapshot(fullGlobal, fullOverride);
      expect(snap.description).toBe('Our exclusive model with extended warranty.');
    });

    test('override_msrp overrides msrp', () => {
      const snap = buildQuoteSnapshot(fullGlobal, fullOverride);
      expect(snap.msrp_at_quote).toBe(799.99);
    });

    test('non-overridable fields are always from global', () => {
      const snap = buildQuoteSnapshot(fullGlobal, fullOverride);
      expect(snap.skulytics_id).toBe('SKU-abc-123');
      expect(snap.sku).toBe('WH-DRY-4500');
      expect(snap.brand).toBe('Whirlpool');
      expect(snap.model_number).toBe('WED4500MW');
      expect(snap.currency).toBe('CAD');
      expect(snap.weight_kg).toBe(56.5);
    });
  });

  // ── Null override fallback ──────────────────────────────

  describe('null override fields fall back to global', () => {
    test('null custom_model_name falls back to global model_name', () => {
      const snap = buildQuoteSnapshot(fullGlobal, nullOverride);
      expect(snap.model_name).toBe('Whirlpool 7.0 cu.ft. Electric Dryer');
    });

    test('null custom_description results in null description', () => {
      const snap = buildQuoteSnapshot(fullGlobal, nullOverride);
      expect(snap.description).toBeNull();
    });

    test('null override_msrp falls back to global msrp', () => {
      const snap = buildQuoteSnapshot(fullGlobal, nullOverride);
      expect(snap.msrp_at_quote).toBe(899.99);
    });
  });

  // ── No override at all ──────────────────────────────────

  describe('no tenant override', () => {
    test('null override uses all global values', () => {
      const snap = buildQuoteSnapshot(fullGlobal, null);
      expect(snap.model_name).toBe('Whirlpool 7.0 cu.ft. Electric Dryer');
      expect(snap.description).toBeNull();
      expect(snap.msrp_at_quote).toBe(899.99);
    });

    test('omitted override defaults to null', () => {
      const snap = buildQuoteSnapshot(fullGlobal);
      expect(snap.model_name).toBe('Whirlpool 7.0 cu.ft. Electric Dryer');
      expect(snap.description).toBeNull();
    });
  });

  // ── snapshot_taken_at ───────────────────────────────────

  describe('snapshot_taken_at', () => {
    test('is a valid ISO 8601 string', () => {
      const snap = buildQuoteSnapshot(fullGlobal);
      expect(snap.snapshot_taken_at).toBeDefined();
      const parsed = new Date(snap.snapshot_taken_at);
      expect(parsed.toISOString()).toBe(snap.snapshot_taken_at);
    });

    test('is close to current time', () => {
      const before = Date.now();
      const snap = buildQuoteSnapshot(fullGlobal);
      const after = Date.now();
      const ts = new Date(snap.snapshot_taken_at).getTime();
      expect(ts).toBeGreaterThanOrEqual(before);
      expect(ts).toBeLessThanOrEqual(after);
    });
  });

  // ── Frozen object ───────────────────────────────────────

  describe('returned object is frozen', () => {
    test('top-level object is frozen', () => {
      const snap = buildQuoteSnapshot(fullGlobal);
      expect(Object.isFrozen(snap)).toBe(true);
    });

    test('dimensions_cm sub-object is frozen', () => {
      const snap = buildQuoteSnapshot(fullGlobal);
      expect(Object.isFrozen(snap.dimensions_cm)).toBe(true);
    });

    test('attempting to set a property throws in strict mode', () => {
      const snap = buildQuoteSnapshot(fullGlobal);
      expect(() => { snap.sku = 'HACKED'; }).toThrow(TypeError);
    });
  });

  // ── Input immutability ──────────────────────────────────

  describe('never mutates inputs', () => {
    test('globalProduct is not mutated', () => {
      const gCopy = JSON.parse(JSON.stringify(fullGlobal));
      buildQuoteSnapshot(fullGlobal, fullOverride);
      expect(fullGlobal).toEqual(gCopy);
    });

    test('tenantOverride is not mutated', () => {
      const tCopy = JSON.parse(JSON.stringify(fullOverride));
      buildQuoteSnapshot(fullGlobal, fullOverride);
      expect(fullOverride).toEqual(tCopy);
    });

    test('modifying source specs after snapshot does not affect snapshot', () => {
      const g = { ...fullGlobal, specs: { voltage: '120V' } };
      const snap = buildQuoteSnapshot(g);
      g.specs.voltage = '240V';
      expect(snap.specs.voltage).toBe('120V');
    });

    test('modifying source images after snapshot does not affect snapshot', () => {
      const g = { ...fullGlobal, images: [{ url: 'https://a.com/1.jpg', type: 'primary', sort_order: 0 }] };
      const snap = buildQuoteSnapshot(g);
      g.images[0].url = 'https://hacked.com';
      expect(snap.images[0].url).toBe('https://a.com/1.jpg');
    });
  });

  // ── Validation ──────────────────────────────────────────

  describe('SnapshotBuildError on missing skulytics_id', () => {
    test('throws for null globalProduct', () => {
      expect(() => buildQuoteSnapshot(null)).toThrow(SnapshotBuildError);
    });

    test('throws for undefined globalProduct', () => {
      expect(() => buildQuoteSnapshot(undefined)).toThrow(SnapshotBuildError);
    });

    test('throws for globalProduct without skulytics_id', () => {
      expect(() => buildQuoteSnapshot({ sku: 'ABC' })).toThrow(SnapshotBuildError);
    });

    test('throws for empty skulytics_id', () => {
      expect(() => buildQuoteSnapshot({ skulytics_id: '', sku: 'ABC' })).toThrow(SnapshotBuildError);
    });

    test('error includes context', () => {
      try {
        buildQuoteSnapshot({ sku: 'BAD' });
      } catch (err) {
        expect(err).toBeInstanceOf(SnapshotBuildError);
        expect(err.name).toBe('SnapshotBuildError');
        expect(err.context).toBeDefined();
        expect(err.context.globalProduct).toEqual({ sku: 'BAD' });
      }
    });
  });

  // ── All fields present ──────────────────────────────────

  describe('all fields present', () => {
    test('full global + full override has every key', () => {
      const snap = buildQuoteSnapshot(fullGlobal, fullOverride);
      for (const key of ALL_SNAPSHOT_KEYS) {
        expect(snap).toHaveProperty(key);
      }
      expect(Object.keys(snap).sort()).toEqual([...ALL_SNAPSHOT_KEYS].sort());
    });

    test('minimal global with no override still has every key', () => {
      const snap = buildQuoteSnapshot(minimalGlobal);
      for (const key of ALL_SNAPSHOT_KEYS) {
        expect(snap).toHaveProperty(key);
      }
      expect(Object.keys(snap).sort()).toEqual([...ALL_SNAPSHOT_KEYS].sort());
    });

    test('optional fields are null when absent from minimal global', () => {
      const snap = buildQuoteSnapshot(minimalGlobal);
      expect(snap.upc).toBeNull();
      expect(snap.model_number).toBeNull();
      expect(snap.model_name).toBeNull();
      expect(snap.description).toBeNull();
      expect(snap.category_slug).toBeNull();
      expect(snap.msrp_at_quote).toBeNull();
      expect(snap.weight_kg).toBeNull();
      expect(snap.dimensions_cm.width).toBeNull();
      expect(snap.dimensions_cm.height).toBeNull();
      expect(snap.dimensions_cm.depth).toBeNull();
      expect(snap.specs).toBeNull();
      expect(snap.images).toBeNull();
      expect(snap.variant_group_id).toBeNull();
      expect(snap.variant_type).toBeNull();
      expect(snap.variant_value).toBeNull();
      expect(snap.warranty).toBeNull();
      expect(snap.buyback_value_at_quote).toBeNull();
      expect(snap.skulytics_snapshot_version).toBeNull();
      expect(snap.skulytics_synced_at).toBeNull();
    });
  });

  // ── Provenance fields ───────────────────────────────────

  describe('provenance fields', () => {
    test('skulytics_snapshot_version comes from api_schema_version', () => {
      const snap = buildQuoteSnapshot(fullGlobal);
      expect(snap.skulytics_snapshot_version).toBe('v1');
    });

    test('skulytics_synced_at comes from last_synced_at', () => {
      const snap = buildQuoteSnapshot(fullGlobal);
      expect(snap.skulytics_synced_at).toBe('2026-02-17T04:00:00.000Z');
    });

    test('buyback_value_at_quote comes from buyback_value', () => {
      const snap = buildQuoteSnapshot(fullGlobal);
      expect(snap.buyback_value_at_quote).toBe(120.0);
    });
  });

  // ── dimensions_cm structure ─────────────────────────────

  describe('dimensions_cm', () => {
    test('contains width, height, depth from global', () => {
      const snap = buildQuoteSnapshot(fullGlobal);
      expect(snap.dimensions_cm).toEqual({
        width: 68.58,
        height: 91.44,
        depth: 77.47,
      });
    });

    test('all null when global has no dimensions', () => {
      const snap = buildQuoteSnapshot(minimalGlobal);
      expect(snap.dimensions_cm).toEqual({
        width: null,
        height: null,
        depth: null,
      });
    });
  });
});
