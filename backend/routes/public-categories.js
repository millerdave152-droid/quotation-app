/**
 * Public Category API Routes (No Authentication Required)
 *
 * Customer-portal-ready endpoints that expose the category taxonomy
 * without internal fields (bby_category_codes, skulytics_paths, legacy_patterns, etc.).
 *
 * Endpoints:
 *   GET /api/public/categories               → full grouped tree (public safe)
 *   GET /api/public/categories/departments    → departments list
 *   GET /api/public/categories/:slug          → single category detail
 *   GET /api/public/categories/by-use-case/:uc → use-case browse (public)
 *   GET /api/public/categories/:slug/specs    → spec quick-filters (public)
 *   GET /api/public/categories/:slug/schema   → Schema.org JSON-LD
 *   GET /api/public/breadcrumb                → breadcrumb trail by slug
 *   GET /api/public/products                  → filtered products (active only)
 */

const express = require('express');
const { ApiError, asyncHandler } = require('../middleware/errorHandler');

// ── Internal fields to strip from public responses ──────────────
const INTERNAL_FIELDS = new Set([
  'bby_category_codes', 'skulytics_paths', 'legacy_patterns',
  'created_at', 'updated_at',
]);

function stripInternal(obj) {
  if (!obj) return obj;
  const clean = { ...obj };
  for (const field of INTERNAL_FIELDS) delete clean[field];
  return clean;
}

// ── Canonical URL helper ────────────────────────────────────────
const PORTAL_BASE = process.env.PORTAL_BASE_URL || 'https://teletimes.ca';

function canonicalUrl(deptSlug, categorySlug) {
  if (!categorySlug) return `${PORTAL_BASE}/shop`;
  if (!deptSlug) return `${PORTAL_BASE}/shop/${categorySlug}`;
  return `${PORTAL_BASE}/shop/${deptSlug}/${categorySlug}`;
}

// ── Use-case tag constants (mirror of categories.js) ────────────
const USE_CASE_MAP = {
  'kitchen':     { tag: 'kitchen',     label: 'Kitchen' },
  'living-room': { tag: 'living room', label: 'Living Room' },
  'bedroom':     { tag: 'bedroom',     label: 'Bedroom' },
  'laundry':     { tag: 'laundry',     label: 'Laundry' },
  'outdoor':     { tag: 'outdoor',     label: 'Outdoor' },
  'office':      { tag: 'office',      label: 'Office' },
  'air-quality': { tag: 'air quality', label: 'Air Quality' },
};

module.exports = function initPublicCategoryRoutes({ pool, productService }) {
  const router = express.Router();

  // ════════════════════════════════════════════════════════════════
  // GET /api/public/categories
  // Full category hierarchy grouped by department (public safe)
  // ════════════════════════════════════════════════════════════════
  router.get('/categories', asyncHandler(async (req, res) => {
    const { rows: allCats } = await pool.query(`
      SELECT id, parent_id, name, slug, display_name, level, display_order,
             icon, color, is_active, use_case_tags,
             portal_headline, portal_description, portal_image_key
      FROM categories
      WHERE is_active = true
      ORDER BY level, display_order, name
    `);

    // Build hierarchy: departments → categories → subcategories
    const byId = new Map(allCats.map(c => [c.id, c]));
    const childrenOf = new Map();
    for (const c of allCats) {
      if (c.parent_id) {
        if (!childrenOf.has(c.parent_id)) childrenOf.set(c.parent_id, []);
        childrenOf.get(c.parent_id).push(c);
      }
    }

    const departments = allCats
      .filter(c => c.level === 1)
      .map(dept => {
        const cats = (childrenOf.get(dept.id) || []).map(cat => {
          const subcats = (childrenOf.get(cat.id) || []).map(sub => ({
            id: sub.id,
            name: sub.name,
            slug: sub.slug,
            display_name: sub.display_name,
            icon: sub.icon,
            use_case_tags: sub.use_case_tags || [],
            canonical_url: canonicalUrl(dept.slug, sub.slug),
          }));

          return {
            id: cat.id,
            name: cat.name,
            slug: cat.slug,
            display_name: cat.display_name,
            icon: cat.icon,
            use_case_tags: cat.use_case_tags || [],
            portal_headline: cat.portal_headline,
            portal_description: cat.portal_description,
            portal_image_key: cat.portal_image_key,
            canonical_url: canonicalUrl(dept.slug, cat.slug),
            subcategories: subcats,
          };
        });

        return {
          id: dept.id,
          name: dept.name,
          slug: dept.slug,
          display_name: dept.display_name,
          icon: dept.icon,
          canonical_url: canonicalUrl(dept.slug, null),
          categories: cats,
        };
      });

    res.json({ success: true, departments });
  }));

  // ════════════════════════════════════════════════════════════════
  // GET /api/public/categories/departments
  // Flat list of level-1 departments
  // ════════════════════════════════════════════════════════════════
  router.get('/categories/departments', asyncHandler(async (req, res) => {
    const { rows } = await pool.query(`
      SELECT id, name, slug, display_name, icon, color
      FROM categories
      WHERE level = 1 AND is_active = true
      ORDER BY display_order, name
    `);

    res.json({
      success: true,
      departments: rows.map(d => ({
        ...d,
        canonical_url: canonicalUrl(d.slug, null),
      })),
    });
  }));

  // ════════════════════════════════════════════════════════════════
  // GET /api/public/categories/by-use-case/:useCase
  // Use-case browse (public)
  // ════════════════════════════════════════════════════════════════
  router.get('/categories/by-use-case/:useCase', asyncHandler(async (req, res) => {
    const entry = USE_CASE_MAP[req.params.useCase];
    if (!entry) {
      throw ApiError.badRequest(
        `Invalid use case "${req.params.useCase}". Valid: ${Object.keys(USE_CASE_MAP).join(', ')}`
      );
    }

    const { rows } = await pool.query(`
      WITH RECURSIVE ancestors AS (
        SELECT c.id, c.name, c.slug, c.display_name, c.level, c.parent_id,
               c.display_order, c.use_case_tags, c.icon, c.id AS origin_id
        FROM categories c
        WHERE c.use_case_tags @> ARRAY[$1]::text[] AND c.is_active = true
        UNION ALL
        SELECT p.id, p.name, p.slug, p.display_name, p.level, p.parent_id,
               p.display_order, p.use_case_tags, p.icon, a.origin_id
        FROM categories p
        JOIN ancestors a ON a.parent_id = p.id
        WHERE p.is_active = true
      )
      SELECT DISTINCT
        dept.id   AS dept_id, dept.name AS dept_name, dept.slug AS dept_slug,
        dept.display_order AS dept_order,
        cat.id, cat.name, cat.slug, cat.display_name, cat.level,
        cat.display_order, cat.icon, cat.use_case_tags
      FROM ancestors dept
      JOIN ancestors cat ON cat.origin_id = dept.origin_id
      WHERE dept.level = 1 AND cat.level > 1
      ORDER BY dept.display_order, cat.level, cat.display_order, cat.name
    `, [entry.tag]);

    const deptMap = new Map();
    for (const row of rows) {
      if (!deptMap.has(row.dept_id)) {
        deptMap.set(row.dept_id, {
          id: row.dept_id, name: row.dept_name, slug: row.dept_slug,
          categories: [],
        });
      }
      deptMap.get(row.dept_id).categories.push({
        id: row.id, name: row.name, slug: row.slug,
        display_name: row.display_name, level: row.level, icon: row.icon,
        use_case_tags: row.use_case_tags || [],
        canonical_url: canonicalUrl(row.dept_slug, row.slug),
      });
    }

    res.json({
      success: true,
      useCase: req.params.useCase,
      label: entry.label,
      departments: [...deptMap.values()],
    });
  }));

  // ════════════════════════════════════════════════════════════════
  // GET /api/public/categories/:slug/specs
  // Spec quick-filters (public)
  // ════════════════════════════════════════════════════════════════
  router.get('/categories/:slug/specs', asyncHandler(async (req, res) => {
    const { slug } = req.params;

    const { rows } = await pool.query(`
      SELECT s.spec_key, s.spec_label, s.spec_values, s.display_order
      FROM product_category_specs s
      JOIN categories c ON c.id = s.category_id
      WHERE c.slug = $1 AND c.is_active = true
      UNION
      SELECT s.spec_key, s.spec_label, s.spec_values, s.display_order
      FROM product_category_specs s
      JOIN categories c ON c.id = s.category_id
      JOIN categories parent ON c.parent_id = parent.id
      WHERE parent.slug = $1 AND c.is_active = true
      ORDER BY display_order, spec_label
    `, [slug]);

    // Deduplicate spec_values across subcategories
    const merged = new Map();
    for (const row of rows) {
      if (merged.has(row.spec_key)) {
        const existing = merged.get(row.spec_key);
        for (const v of row.spec_values) {
          if (!existing.spec_values.includes(v)) existing.spec_values.push(v);
        }
      } else {
        merged.set(row.spec_key, {
          spec_key: row.spec_key,
          spec_label: row.spec_label,
          spec_values: [...row.spec_values],
        });
      }
    }

    res.json({
      success: true,
      slug,
      specs: [...merged.values()],
    });
  }));

  // ════════════════════════════════════════════════════════════════
  // GET /api/public/categories/:slug/schema
  // Schema.org BreadcrumbList + ItemList JSON-LD
  // ════════════════════════════════════════════════════════════════
  router.get('/categories/:slug/schema', asyncHandler(async (req, res) => {
    const { slug } = req.params;

    // Fetch category + ancestor chain
    const { rows: chain } = await pool.query(`
      WITH RECURSIVE ancestors AS (
        SELECT id, parent_id, name, slug, display_name, level,
               portal_headline, portal_description
        FROM categories
        WHERE slug = $1 AND is_active = true
        UNION ALL
        SELECT p.id, p.parent_id, p.name, p.slug, p.display_name, p.level,
               p.portal_headline, p.portal_description
        FROM categories p
        JOIN ancestors a ON a.parent_id = p.id
        WHERE p.is_active = true
      )
      SELECT * FROM ancestors ORDER BY level
    `, [slug]);

    if (chain.length === 0) {
      throw ApiError.notFound('Category');
    }

    const category = chain[chain.length - 1];
    const dept = chain.find(c => c.level === 1);

    // Build BreadcrumbList
    const breadcrumbItems = [
      {
        '@type': 'ListItem',
        position: 1,
        name: 'Home',
        item: PORTAL_BASE,
      },
    ];

    let position = 2;
    for (const ancestor of chain) {
      const deptSlugForUrl = ancestor.level === 1 ? ancestor.slug : dept?.slug;
      breadcrumbItems.push({
        '@type': 'ListItem',
        position: position++,
        name: ancestor.display_name || ancestor.name,
        item: ancestor.level === 1
          ? `${PORTAL_BASE}/shop/${ancestor.slug}`
          : canonicalUrl(deptSlugForUrl, ancestor.slug),
      });
    }

    const breadcrumbSchema = {
      '@context': 'https://schema.org',
      '@type': 'BreadcrumbList',
      itemListElement: breadcrumbItems,
    };

    // Fetch top products for ItemList (up to 20)
    const { rows: products } = await pool.query(`
      SELECT p.id, p.name, p.model, p.manufacturer, p.sku,
             p.msrp_cents, p.description
      FROM products p
      WHERE p.category_id = $1
        AND p.msrp_cents > 0
      ORDER BY p.msrp_cents DESC
      LIMIT 20
    `, [category.id]);

    const itemListSchema = {
      '@context': 'https://schema.org',
      '@type': 'ItemList',
      name: category.display_name || category.name,
      description: category.portal_description || null,
      url: canonicalUrl(dept?.slug, category.slug),
      numberOfItems: products.length,
      itemListElement: products.map((p, i) => ({
        '@type': 'ListItem',
        position: i + 1,
        item: {
          '@type': 'Product',
          name: p.name || `${p.manufacturer} ${p.model}`,
          sku: p.sku || p.model,
          brand: { '@type': 'Brand', name: p.manufacturer },
          description: p.description || undefined,
          offers: {
            '@type': 'Offer',
            priceCurrency: 'CAD',
            price: (p.msrp_cents / 100).toFixed(2),
            availability: 'https://schema.org/InStock',
            url: `${PORTAL_BASE}/product/${p.sku || p.id}`,
          },
        },
      })),
    };

    res.json({
      success: true,
      schemas: [breadcrumbSchema, itemListSchema],
    });
  }));

  // ════════════════════════════════════════════════════════════════
  // GET /api/public/categories/:slug
  // Single category detail (public safe)
  // ════════════════════════════════════════════════════════════════
  router.get('/categories/:slug', asyncHandler(async (req, res) => {
    const { slug } = req.params;

    const { rows } = await pool.query(`
      SELECT c.id, c.name, c.slug, c.display_name, c.level, c.icon, c.color,
             c.parent_id, c.use_case_tags,
             c.portal_headline, c.portal_description, c.portal_image_key,
             p.name AS parent_name, p.slug AS parent_slug, p.level AS parent_level
      FROM categories c
      LEFT JOIN categories p ON c.parent_id = p.id
      WHERE c.slug = $1 AND c.is_active = true
    `, [slug]);

    if (rows.length === 0) {
      throw ApiError.notFound('Category');
    }

    const cat = rows[0];

    // Fetch department for canonical URL
    let deptSlug = null;
    if (cat.level === 1) {
      deptSlug = cat.slug;
    } else {
      const { rows: deptRows } = await pool.query(`
        WITH RECURSIVE chain AS (
          SELECT id, parent_id, slug, level FROM categories WHERE id = $1
          UNION ALL
          SELECT p.id, p.parent_id, p.slug, p.level
          FROM categories p JOIN chain c ON c.parent_id = p.id
        )
        SELECT slug FROM chain WHERE level = 1 LIMIT 1
      `, [cat.id]);
      deptSlug = deptRows[0]?.slug || null;
    }

    // Fetch subcategories
    const { rows: subcats } = await pool.query(`
      SELECT id, name, slug, display_name, icon, use_case_tags
      FROM categories
      WHERE parent_id = $1 AND is_active = true
      ORDER BY display_order, name
    `, [cat.id]);

    res.json({
      success: true,
      category: {
        id: cat.id,
        name: cat.name,
        slug: cat.slug,
        display_name: cat.display_name,
        level: cat.level,
        icon: cat.icon,
        color: cat.color,
        use_case_tags: cat.use_case_tags || [],
        portal_headline: cat.portal_headline,
        portal_description: cat.portal_description,
        portal_image_key: cat.portal_image_key,
        canonical_url: canonicalUrl(deptSlug, cat.slug),
        parent: cat.parent_id ? {
          name: cat.parent_name,
          slug: cat.parent_slug,
        } : null,
        subcategories: subcats.map(s => ({
          id: s.id,
          name: s.name,
          slug: s.slug,
          display_name: s.display_name,
          icon: s.icon,
          use_case_tags: s.use_case_tags || [],
          canonical_url: canonicalUrl(deptSlug, s.slug),
        })),
      },
    });
  }));

  // ════════════════════════════════════════════════════════════════
  // GET /api/public/breadcrumb?categorySlug=X
  // Breadcrumb trail for a category
  // ════════════════════════════════════════════════════════════════
  router.get('/breadcrumb', asyncHandler(async (req, res) => {
    const { categorySlug } = req.query;
    if (!categorySlug) {
      throw ApiError.badRequest('categorySlug query param is required');
    }

    const { rows: chain } = await pool.query(`
      WITH RECURSIVE ancestors AS (
        SELECT id, parent_id, name, slug, display_name, level
        FROM categories
        WHERE slug = $1 AND is_active = true
        UNION ALL
        SELECT p.id, p.parent_id, p.name, p.slug, p.display_name, p.level
        FROM categories p
        JOIN ancestors a ON a.parent_id = p.id
        WHERE p.is_active = true
      )
      SELECT * FROM ancestors ORDER BY level
    `, [categorySlug]);

    if (chain.length === 0) {
      throw ApiError.notFound('Category');
    }

    const breadcrumb = [
      { label: 'Home', slug: null },
      ...chain.map(c => ({
        label: c.display_name || c.name,
        slug: c.slug,
      })),
    ];

    res.json({ success: true, breadcrumb });
  }));

  // ════════════════════════════════════════════════════════════════
  // GET /api/public/products
  // Public product listing (active only, prices required)
  // ════════════════════════════════════════════════════════════════
  router.get('/products', asyncHandler(async (req, res) => {
    const {
      categoryId, categorySlug, search, manufacturer,
      specFilters, minPrice, maxPrice,
      page = 1, limit = 24,
      sortBy = 'name', sortOrder = 'ASC',
    } = req.query;

    const result = await productService.getProducts({
      categoryId: categoryId || '',
      categorySlug: categorySlug || '',
      search: search || '',
      manufacturer: manufacturer || '',
      specFilters: specFilters || '',
      minPrice: minPrice || '',
      maxPrice: maxPrice || '',
      status: 'active',
      requirePrice: 'true',
      page: parseInt(page) || 1,
      limit: Math.min(parseInt(limit) || 24, 50),
      sortBy,
      sortOrder,
    });

    // Strip internal fields from product data
    const publicProducts = (result.products || []).map(p => ({
      id: p.id,
      name: p.name,
      model: p.model,
      sku: p.sku,
      manufacturer: p.manufacturer,
      description: p.description,
      category_id: p.category_id,
      category_name: p.category_name || p.category,
      msrp: p.msrp_cents ? (p.msrp_cents / 100) : (p.msrp || null),
      sale_price: p.promo_price_cents ? (p.promo_price_cents / 100) : (p.sale_price || null),
      in_stock: (p.qty_on_hand || 0) > 0,
    }));

    res.json({
      success: true,
      products: publicProducts,
      pagination: result.pagination || null,
    });
  }));

  return router;
};
