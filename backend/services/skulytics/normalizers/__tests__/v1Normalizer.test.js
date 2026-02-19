'use strict';

// Run with: jest --testPathPatterns skulytics --runInBand --verbose --no-coverage

const { normalizeV1, _internal } = require('../v1Normalizer');
const { normalize, detectVersion, SkulyticsNormalizerError } = require('../index');
const realProduct = require('./fixtures/realApiResponse.json');

// ── Fixtures ────────────────────────────────────────────────

/** Minimal valid real-shape payload — only required fields. */
const minimalPayload = {
  product_id: 99999,
  sku: 'TEST-MIN-001',
  brand: { brand_name: 'TestBrand', brand_slug: 'testbrand' },
  price: { msrp: 0, map: 0, umrp: 0, in_stock_status: 0 },
  status: 'Active',
};

/** In-stock product payload. */
const inStockPayload = {
  ...minimalPayload,
  product_id: 99998,
  sku: 'TEST-INSTOCK-001',
  price: { msrp: 499, map: 449, umrp: 399, in_stock_status: 1, lap: {
    lowest_price: 459,
    lowes_price: 469,
    lowes_last_updated: '2025-03-01 00:00:00',
    homedepot_price: 479,
    homedepot_last_updated: '2025-03-01 00:00:00',
    bestbuy_price: 0,
    bestbuy_last_updated: '2025-03-01 00:00:00',
    ajmadison_price: 459,
    ajmadison_last_updated: '2025-03-01 00:00:00',
  }},
  is_multi_brand: 1,
};

// ── Internal helpers ────────────────────────────────────────

describe('Internal helpers', () => {
  describe('toNumber()', () => {
    const { toNumber } = _internal;

    test('converts numeric strings', () => {
      expect(toNumber('42.5')).toBe(42.5);
    });

    test('returns null for non-numeric values', () => {
      expect(toNumber(undefined)).toBeNull();
      expect(toNumber(null)).toBeNull();
      expect(toNumber('abc')).toBeNull();
      expect(toNumber(NaN)).toBeNull();
      expect(toNumber(Infinity)).toBeNull();
    });

    test('passes through finite numbers', () => {
      expect(toNumber(0)).toBe(0);
      expect(toNumber(-3.14)).toBe(-3.14);
    });
  });

  describe('buildCategoryPath()', () => {
    const { buildCategoryPath } = _internal;

    test('builds full three-level path as array', () => {
      expect(buildCategoryPath(realProduct)).toEqual(
        ['Refrigeration', 'Refrigerators', 'French Door Refrigerators']
      );
    });

    test('builds partial path when subcategory missing', () => {
      expect(buildCategoryPath({
        category: { category_name: 'Cooking' },
        detail_category: { detail_category_name: 'Ranges' },
      })).toEqual(['Cooking', 'Ranges']);
    });

    test('returns null for empty object', () => {
      expect(buildCategoryPath({})).toBeNull();
    });
  });

  describe('extractWarranty()', () => {
    const { extractWarranty } = _internal;

    test('extracts warranty from real product', () => {
      const result = extractWarranty(realProduct);
      expect(result).toEqual({
        parts: '1 Year',
        labor: '1 Year',
      });
    });

    test('returns null when no warranty specs', () => {
      expect(extractWarranty({})).toBeNull();
      expect(extractWarranty({ product_spec: [] })).toBeNull();
    });

    test('returns null when specs have no warranty section', () => {
      expect(extractWarranty({
        product_spec: [{ section: 'Dimensions', category: 'Width', feature: '36"' }],
      })).toBeNull();
    });
  });

  describe('buildCompetitorPricing()', () => {
    const { buildCompetitorPricing } = _internal;

    test('builds competitor pricing from lap', () => {
      const result = buildCompetitorPricing(inStockPayload);
      expect(result).toHaveProperty('lowes');
      expect(result.lowes.price).toBe(469);
      expect(result).toHaveProperty('homedepot');
      expect(result.homedepot.price).toBe(479);
      expect(result).toHaveProperty('bestbuy');
      expect(result).toHaveProperty('ajmadison');
    });

    test('returns null when no lap data', () => {
      expect(buildCompetitorPricing({})).toBeNull();
      expect(buildCompetitorPricing({ price: {} })).toBeNull();
    });
  });

  describe('normalizeImages()', () => {
    const { normalizeImages } = _internal;

    test('normalizes real product images', () => {
      const result = normalizeImages(realProduct);
      expect(result).toHaveLength(1);
      expect(result[0].url).toContain('MMCFDR23MBL');
      expect(result[0].type).toBe('primary');
      expect(result[0].sort_order).toBe(0);
    });

    test('returns empty array when no images', () => {
      expect(normalizeImages({})).toEqual([]);
      expect(normalizeImages({ product_images: [] })).toEqual([]);
    });
  });

  describe('extractSpecs()', () => {
    const { extractSpecs } = _internal;

    test('extracts filters and features from real product', () => {
      const result = extractSpecs(realProduct);
      expect(result).not.toBeNull();
      expect(result['Color']).toBe('Black');
      expect(result['Refrigerator Type']).toBe('French Door');
      expect(result['Installation']).toBe('Freestanding');
      expect(result._features).toContain('Customized Temperature Controls');
      expect(result._features).toHaveLength(8);
    });

    test('returns null for empty product', () => {
      expect(extractSpecs({})).toBeNull();
    });
  });
});

// ── v1 normalizer — real fixture ────────────────────────────

describe('v1Normalizer.normalizeV1()', () => {
  test('real AGA product: identity fields', () => {
    const result = normalizeV1(realProduct);
    expect(result.skulytics_id).toBe('18855');
    expect(result.api_schema_version).toBe('v1');
  });

  test('real AGA product: core catalog fields', () => {
    const result = normalizeV1(realProduct);
    expect(result.sku).toBe('MMCFDR23MBL');
    expect(result.upc).toBe('768388077440');
    expect(result.brand).toBe('AGA');
    expect(result.model_number).toBe('MMCFDR23MBL');
    expect(result.model_name).toContain('Mercury 36');
  });

  test('real AGA product: categorization', () => {
    const result = normalizeV1(realProduct);
    expect(result.category_slug).toBe('french-door-refrigerators');
    expect(result.category_path).toEqual(
      ['Refrigeration', 'Refrigerators', 'French Door Refrigerators']
    );
  });

  test('real AGA product: pricing', () => {
    const result = normalizeV1(realProduct);
    expect(result.msrp).toBe(7969);
    expect(result.map_price).toBeNull(); // map=0 → null
    expect(result.currency).toBe('CAD');
    expect(result.umrp).toBe(7249);
  });

  test('real AGA product: stock status', () => {
    const result = normalizeV1(realProduct);
    expect(result.is_in_stock).toBe(false); // in_stock_status: 0
  });

  test('real AGA product: discontinued status', () => {
    const result = normalizeV1(realProduct);
    expect(result.is_discontinued).toBe(true);
  });

  test('real AGA product: warranty extraction', () => {
    const result = normalizeV1(realProduct);
    expect(result.warranty).toEqual({
      parts: '1 Year',
      labor: '1 Year',
    });
  });

  test('real AGA product: images', () => {
    const result = normalizeV1(realProduct);
    expect(result.images).toHaveLength(1);
    expect(result.images[0].url).toContain('MMCFDR23MBL');
    expect(result.images[0].type).toBe('primary');
  });

  test('real AGA product: new fields', () => {
    const result = normalizeV1(realProduct);
    expect(result.brand_slug).toBe('aga');
    expect(result.primary_image).toContain('MMCFDR23MBL');
    expect(result.product_link).toContain('agarangeusa.com');
    expect(result.is_multi_brand).toBe(false);
  });

  test('real AGA product: specs include features and filters', () => {
    const result = normalizeV1(realProduct);
    expect(result.specs).not.toBeNull();
    expect(result.specs._features).toHaveLength(8);
    expect(result.specs['Color']).toBe('Black');
  });

  test('real AGA product: variant fields from color', () => {
    const result = normalizeV1(realProduct);
    expect(result.variant_type).toBe('color');
    expect(result.variant_value).toBe('Black (Matte)');
  });

  test('real AGA product: physical dimensions are null', () => {
    const result = normalizeV1(realProduct);
    expect(result.weight_kg).toBeNull();
    expect(result.width_cm).toBeNull();
    expect(result.height_cm).toBeNull();
    expect(result.depth_cm).toBeNull();
  });

  test('real AGA product: raw_json is the original payload untouched', () => {
    const result = normalizeV1(realProduct);
    expect(result.raw_json).toBe(realProduct);
    expect(result.raw_json.product_id).toBe(18855);
    expect(result.raw_json.price.msrp).toBe(7969);
  });

  test('real AGA product: competitor_pricing from lap', () => {
    const result = normalizeV1(realProduct);
    // All lap prices are 0 for the AGA product, but structure should exist
    expect(result.competitor_pricing).not.toBeNull();
    expect(result.competitor_pricing).toHaveProperty('lowes');
    expect(result.competitor_pricing).toHaveProperty('homedepot');
  });

  test('minimal payload: defaults correctly', () => {
    const result = normalizeV1(minimalPayload);
    expect(result.skulytics_id).toBe('99999');
    expect(result.sku).toBe('TEST-MIN-001');
    expect(result.brand).toBe('TestBrand');
    expect(result.upc).toBeNull();
    expect(result.category_slug).toBeNull();
    expect(result.category_path).toBeNull();
    expect(result.msrp).toBe(0);
    expect(result.is_discontinued).toBe(false);
    expect(result.is_in_stock).toBe(false);
    expect(result.images).toEqual([]);
    expect(result.warranty).toBeNull();
  });

  test('in-stock product: is_in_stock true, competitor_pricing populated', () => {
    const result = normalizeV1(inStockPayload);
    expect(result.is_in_stock).toBe(true);
    expect(result.msrp).toBe(499);
    expect(result.map_price).toBe(449);
    expect(result.umrp).toBe(399);
    expect(result.is_multi_brand).toBe(true);
    expect(result.competitor_pricing.lowes.price).toBe(469);
    expect(result.competitor_pricing.homedepot.price).toBe(479);
    expect(result.competitor_pricing.ajmadison.price).toBe(459);
  });

  test('all 34 required fields are present in output', () => {
    const result = normalizeV1(realProduct);
    const expectedKeys = [
      'skulytics_id', 'api_schema_version', 'sku', 'upc', 'brand',
      'model_number', 'model_name', 'category_slug', 'category_path',
      'msrp', 'map_price', 'currency',
      'umrp', 'is_in_stock', 'competitor_pricing',
      'weight_kg', 'width_cm', 'height_cm', 'depth_cm',
      'variant_group_id', 'is_variant_parent', 'parent_skulytics_id',
      'variant_type', 'variant_value',
      'is_discontinued',
      'specs', 'images', 'warranty', 'buyback_value',
      'brand_slug', 'primary_image', 'product_link', 'is_multi_brand',
      'raw_json',
    ];
    for (const key of expectedKeys) {
      expect(result).toHaveProperty(key);
    }
    expect(Object.keys(result)).toHaveLength(expectedKeys.length);
  });
});

// ── Router / version detection ──────────────────────────────

describe('normalizer index (router)', () => {
  describe('detectVersion()', () => {
    test('detects v1 from product_id + sku (real API shape)', () => {
      expect(detectVersion(realProduct)).toBe('v1');
    });

    test('detects v1 from legacy id + sku', () => {
      expect(detectVersion({ id: 'x', sku: 'y' })).toBe('v1');
    });

    test('returns null for empty object', () => {
      expect(detectVersion({})).toBeNull();
    });

    test('returns null for non-objects', () => {
      expect(detectVersion(null)).toBeNull();
      expect(detectVersion(undefined)).toBeNull();
      expect(detectVersion('string')).toBeNull();
    });

    test('returns explicit schemaVersion if present and not v1', () => {
      expect(detectVersion({ product_id: 1, sku: 'y', schemaVersion: 'v3' })).toBe('v3');
    });

    test('returns v1 if schemaVersion is explicitly v1', () => {
      expect(detectVersion({ product_id: 1, sku: 'y', schemaVersion: 'v1' })).toBe('v1');
    });
  });

  describe('normalize()', () => {
    test('routes real API payload to v1 normalizer', () => {
      const result = normalize(realProduct);
      expect(result.skulytics_id).toBe('18855');
      expect(result.api_schema_version).toBe('v1');
    });

    test('throws SkulyticsNormalizerError for undetectable version', () => {
      const badPayload = { foo: 'bar' };
      expect(() => normalize(badPayload)).toThrow(SkulyticsNormalizerError);

      try {
        normalize(badPayload);
      } catch (err) {
        expect(err.name).toBe('SkulyticsNormalizerError');
        expect(err.rawPayload).toBe(badPayload);
        expect(err.message).toContain('Unable to detect');
      }
    });

    test('throws SkulyticsNormalizerError for unsupported version', () => {
      const futurePayload = { product_id: 1, sku: 'y', schemaVersion: 'v99' };
      expect(() => normalize(futurePayload)).toThrow(SkulyticsNormalizerError);

      try {
        normalize(futurePayload);
      } catch (err) {
        expect(err.name).toBe('SkulyticsNormalizerError');
        expect(err.rawPayload).toBe(futurePayload);
        expect(err.version).toBe('v99');
        expect(err.message).toContain('Unsupported');
      }
    });

    test('throws for null/undefined input', () => {
      expect(() => normalize(null)).toThrow(SkulyticsNormalizerError);
      expect(() => normalize(undefined)).toThrow(SkulyticsNormalizerError);
    });
  });
});

// ── normalizeBatch ──────────────────────────────────────────

describe('normalizeBatch()', () => {
  const { normalizeBatch } = require('../index');

  test('normalizes a batch of valid items', () => {
    const { results, errors } = normalizeBatch([realProduct, minimalPayload]);
    expect(results).toHaveLength(2);
    expect(errors).toHaveLength(0);
    expect(results[0].skulytics_id).toBe('18855');
    expect(results[1].skulytics_id).toBe('99999');
  });

  test('collects errors without throwing', () => {
    const badItem = { foo: 'bar' };
    const { results, errors } = normalizeBatch([realProduct, badItem, minimalPayload]);
    expect(results).toHaveLength(2);
    expect(errors).toHaveLength(1);
    expect(errors[0].index).toBe(1);
    expect(errors[0].raw).toBe(badItem);
    expect(errors[0].error).toBeInstanceOf(SkulyticsNormalizerError);
  });

  test('returns empty results for empty input', () => {
    const { results, errors } = normalizeBatch([]);
    expect(results).toHaveLength(0);
    expect(errors).toHaveLength(0);
  });
});
