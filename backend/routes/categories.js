/**
 * Categories API Routes
 *
 * Provides endpoints for the normalized category system:
 * - GET /api/categories - Full category hierarchy with counts
 * - GET /api/categories/main - Flat list of level-2 categories
 * - GET /api/categories/:slug - Single category by slug
 * - GET /api/categories/:slug/subcategories - Subcategories of a category
 * - GET /api/categories/:slug/products - Products in a category
 */

const express = require('express');
const router = express.Router();
const Anthropic = require('@anthropic-ai/sdk');
const { authenticate } = require('../middleware/auth');
const { ApiError, asyncHandler } = require('../middleware/errorHandler');

module.exports = function(pool, productService, cache) {
  /**
   * GET /api/categories
   * Returns full category hierarchy with product counts
   */
  router.get('/', authenticate, asyncHandler(async (req, res) => {
    const hierarchy = await productService.getCategoryHierarchy();
    res.json({
      success: true,
      categories: hierarchy
    });
  }));

  /**
   * GET /api/categories/main
   * Returns flat list of level-2 categories (main categories)
   */
  router.get('/main', authenticate, asyncHandler(async (req, res) => {
    const categories = await productService.getMainCategories();
    res.json({
      success: true,
      categories
    });
  }));

  /**
   * GET /api/categories/legacy
   * Returns legacy raw category strings (for backward compatibility)
   */
  router.get('/legacy', authenticate, asyncHandler(async (req, res) => {
    const categories = await productService.getCategories();
    res.json({
      success: true,
      categories
    });
  }));

  // ── Lazy Anthropic client for /suggest ──────────────────────
  let _anthropic = null;
  function getAnthropic() {
    if (!_anthropic) {
      if (!process.env.ANTHROPIC_API_KEY) {
        throw ApiError.badRequest('ANTHROPIC_API_KEY is not configured');
      }
      _anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
    }
    return _anthropic;
  }

  const SUGGEST_CACHE_TTL = 7 * 24 * 60 * 60; // 7 days in seconds

  // ── Shared category list query (used by suggest + suggest-batch) ──
  let _categoryListCache = null;
  let _categoryListCacheTime = 0;
  const CATEGORY_LIST_TTL = 60 * 60 * 1000; // 1 hour

  async function getCategoryList() {
    const now = Date.now();
    if (_categoryListCache && (now - _categoryListCacheTime) < CATEGORY_LIST_TTL) {
      return _categoryListCache;
    }
    const { rows: cats } = await pool.query(`
      WITH depts AS (
        SELECT id, name FROM categories
        WHERE level = 1 AND is_active = true
      )
      SELECT
        c.id,
        c.name,
        c.slug,
        c.level,
        d.name  AS dept_name,
        d.id    AS dept_id
      FROM categories c
      JOIN LATERAL (
        WITH RECURSIVE up AS (
          SELECT id, parent_id, name, level FROM categories WHERE id = c.id
          UNION ALL
          SELECT p.id, p.parent_id, p.name, p.level
          FROM categories p JOIN up ON up.parent_id = p.id
        )
        SELECT id, name FROM up WHERE level = 1 LIMIT 1
      ) d ON true
      WHERE c.level >= 2 AND c.is_active = true
      ORDER BY d.id, c.level, c.display_order, c.name
    `);

    const categoryList = cats
      .map(c => `${c.dept_name} > ${c.name} [id:${c.id},dept:${c.dept_id}]`)
      .join('\n');

    _categoryListCache = { cats, categoryList };
    _categoryListCacheTime = now;
    return _categoryListCache;
  }

  /**
   * Shared helper: suggest a category for a single product using Claude Haiku.
   * Returns { department_id, department_name, category_id, category_name,
   *           category_slug, confidence, reasoning, cached }
   */
  async function suggestCategory({ name, brand, model, description }) {
    // ── Cache lookup ─────────────────────────────────────────
    const cacheKey = `cat-suggest:${(brand || '').trim().toLowerCase()}:${(model || '').trim().toLowerCase()}`;
    if (cache) {
      const cached = cache.get('long', cacheKey);
      if (cached) {
        return { ...cached, cached: true };
      }
    }

    const { cats, categoryList } = await getCategoryList();

    const prompt = `You are a product categorization assistant for TeleTime, a Canadian electronics and appliance retailer.

Product to categorize:
Name: ${name || 'Unknown'}
Brand: ${brand || 'Unknown'}
Model: ${model || 'Unknown'}
${description ? `Description: ${description}` : ''}

Available categories (Department > Category [id:X,dept:Y]):
${categoryList}

Pick the most specific category that fits. Return ONLY a JSON object with no other text:
{
  "department_id": <number>,
  "category_id": <number>,
  "confidence": "high" | "medium" | "low",
  "reasoning": "<one sentence>"
}`;

    const message = await getAnthropic().messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 200,
      messages: [{ role: 'user', content: prompt }],
    });

    // ── Parse response ───────────────────────────────────────
    const raw = (message.content[0]?.text || '').trim();
    let parsed;
    try {
      parsed = JSON.parse(raw);
    } catch {
      const m = raw.match(/\{[\s\S]*\}/);
      if (!m) throw new Error('AI returned unparseable response');
      parsed = JSON.parse(m[0]);
    }

    // ── Enrich with names from our cats array ────────────────
    const cat = cats.find(c => c.id === parsed.category_id);

    const result = {
      department_id: parsed.department_id,
      department_name: cat?.dept_name || null,
      category_id: parsed.category_id,
      category_name: cat?.name || null,
      category_slug: cat?.slug || null,
      confidence: ['high', 'medium', 'low'].includes(parsed.confidence) ? parsed.confidence : 'low',
      reasoning: parsed.reasoning || null,
    };

    // ── Cache the result ─────────────────────────────────────
    if (cache && brand && model) {
      cache.set('long', cacheKey, result, SUGGEST_CACHE_TTL);
    }

    return { ...result, cached: false };
  }

  /**
   * POST /api/categories/suggest
   * Uses Claude Haiku to suggest the best category for a product.
   * Cached by (brand + model) for 7 days.
   *
   * Body: { name: string, brand: string, model: string, description?: string }
   * Returns: { department_id, department_name, category_id, category_name,
   *            confidence, reasoning }
   */
  router.post('/suggest', authenticate, asyncHandler(async (req, res) => {
    const { name, brand, model, description } = req.body || {};

    if (!name && !brand && !model) {
      throw ApiError.badRequest('At least one of name, brand, or model is required');
    }

    const result = await suggestCategory({ name, brand, model, description });
    res.json({ success: true, ...result });
  }));

  /**
   * POST /api/categories/suggest-batch
   * Batch AI category suggestion for multiple products.
   * Accepts up to 50 products, processes sequentially with 200ms delay.
   *
   * Body: { products: [{ id, name, brand, model, description }] }
   * Returns: { suggestions: [...], errors: [], summary: { total, suggested, cached, failed } }
   */
  router.post('/suggest-batch', authenticate, asyncHandler(async (req, res) => {
    const { products: productList } = req.body || {};

    if (!Array.isArray(productList) || productList.length === 0) {
      throw ApiError.badRequest('products must be a non-empty array');
    }
    if (productList.length > 50) {
      throw ApiError.badRequest('Maximum 50 products per batch');
    }

    const suggestions = [];
    const errors = [];
    let suggested = 0;
    let cachedCount = 0;

    for (let i = 0; i < productList.length; i++) {
      const product = productList[i];
      try {
        const result = await suggestCategory({
          name: product.name,
          brand: product.brand,
          model: product.model,
          description: product.description,
        });

        suggestions.push({
          productId: product.id,
          ...result,
        });

        if (result.cached) cachedCount++;
        suggested++;

        // Rate limit: 200ms delay between API calls (skip for cached results)
        if (!result.cached && i < productList.length - 1) {
          await new Promise(resolve => setTimeout(resolve, 200));
        }
      } catch (err) {
        errors.push({
          productId: product.id,
          error: err.message,
        });
      }
    }

    res.json({
      success: true,
      suggestions,
      errors,
      summary: {
        total: productList.length,
        suggested,
        cached: cachedCount,
        failed: errors.length,
      },
    });
  }));

  /**
   * GET /api/categories/product-counts?locationId=X
   * Returns live product counts per category, grouped by department.
   * When locationId is provided, also returns in_stock_count (products with
   * quantity_available > 0 at that location).
   */
  router.get('/product-counts', authenticate, asyncHandler(async (req, res) => {
    const locationId = req.query.locationId ? parseInt(req.query.locationId, 10) : null;

    if (locationId !== null && (!Number.isFinite(locationId) || locationId <= 0)) {
      throw ApiError.badRequest('locationId must be a positive integer');
    }

    // ── 1. Count products per leaf category ──────────────────
    //   Products link via category_id FK *or* via the legacy text
    //   `category` column (case-insensitive match to categories.name).
    const countRows = (await pool.query(`
      SELECT
        c.id           AS cat_id,
        count(DISTINCT p.id)::int AS product_count
      FROM categories c
      JOIN products p
        ON (
             p.category_id = c.id
          OR (p.category_id IS NULL AND (
               UPPER(p.category) = UPPER(c.name)
            OR UPPER(p.category) = UPPER(c.display_name)
            OR UPPER(c.name) LIKE UPPER(p.category) || '%'
            OR UPPER(p.category) LIKE UPPER(c.name) || '%'
          ))
       )
      WHERE c.is_active = true
      GROUP BY c.id
    `)).rows;

    const countMap = new Map(countRows.map(r => [r.cat_id, r.product_count]));

    // ── 2. Optional: in-stock counts at a specific location ──
    const stockMap = new Map();
    if (locationId !== null) {
      const stockRows = (await pool.query(`
        SELECT
          c.id           AS cat_id,
          count(DISTINCT p.id)::int AS in_stock_count
        FROM categories c
        JOIN products p
          ON (
               p.category_id = c.id
            OR (p.category_id IS NULL AND UPPER(p.category) = UPPER(c.name))
         )
        JOIN location_inventory li
          ON li.product_id = p.id
         AND li.location_id = $1
         AND li.quantity_available > 0
        WHERE c.is_active = true
        GROUP BY c.id
      `, [locationId])).rows;

      for (const r of stockRows) stockMap.set(r.cat_id, r.in_stock_count);
    }

    // ── 3. Build the full hierarchy from categories table ────
    const allCats = (await pool.query(`
      SELECT id, parent_id, name, slug, display_name, level, display_order
      FROM categories
      WHERE is_active = true
      ORDER BY level, display_order, name
    `)).rows;

    // Index by id, find children
    const byId = new Map(allCats.map(c => [c.id, c]));
    const childrenOf = new Map();
    for (const c of allCats) {
      if (c.parent_id) {
        if (!childrenOf.has(c.parent_id)) childrenOf.set(c.parent_id, []);
        childrenOf.get(c.parent_id).push(c);
      }
    }

    // Recursive roll-up: a parent's count = sum of its own + all descendants
    function rollUp(catId) {
      let total = countMap.get(catId) || 0;
      let stock = stockMap.get(catId) || 0;
      const kids = childrenOf.get(catId);
      if (kids) {
        for (const kid of kids) {
          const sub = rollUp(kid.id);
          total += sub.count;
          stock += sub.in_stock_count;
        }
      }
      return { count: total, in_stock_count: stock };
    }

    // ── 4. Assemble response grouped by department (level 1) ─
    const departments = [];
    for (const dept of allCats.filter(c => c.level === 1)) {
      const kids = childrenOf.get(dept.id) || [];

      const categories = kids.map(cat => {
        const rolled = rollUp(cat.id);
        return {
          id: cat.id,
          name: cat.name,
          slug: cat.slug,
          display_name: cat.display_name,
          count: rolled.count,
          ...(locationId !== null ? { in_stock_count: rolled.in_stock_count } : {}),
        };
      }).filter(c => c.count > 0);

      const deptRolled = rollUp(dept.id);
      if (deptRolled.count === 0) continue;

      departments.push({
        id: dept.id,
        name: dept.name,
        slug: dept.slug,
        count: deptRolled.count,
        ...(locationId !== null ? { in_stock_count: deptRolled.in_stock_count } : {}),
        categories,
      });
    }

    res.json({ success: true, departments });
  }));

  // ── Use-case tag constants ──────────────────────────────────
  const USE_CASE_MAP = {
    'kitchen':     { tag: 'kitchen',     label: 'Kitchen' },
    'living-room': { tag: 'living room', label: 'Living Room' },
    'bedroom':     { tag: 'bedroom',     label: 'Bedroom' },
    'laundry':     { tag: 'laundry',     label: 'Laundry' },
    'outdoor':     { tag: 'outdoor',     label: 'Outdoor' },
    'office':      { tag: 'office',      label: 'Office' },
    'air-quality': { tag: 'air quality', label: 'Air Quality' },
  };

  /**
   * GET /api/categories/by-use-case/:useCase
   * Returns departments + categories whose use_case_tags contain the given tag,
   * grouped by department (level-1 ancestor).
   */
  router.get('/by-use-case/:useCase', authenticate, asyncHandler(async (req, res) => {
    const entry = USE_CASE_MAP[req.params.useCase];
    if (!entry) {
      throw ApiError.badRequest(
        `Invalid use case "${req.params.useCase}". Valid values: ${Object.keys(USE_CASE_MAP).join(', ')}`
      );
    }

    // Fetch all active categories that carry this tag, joining to their
    // level-1 ancestor (department) via a recursive CTE.
    const { rows } = await pool.query(`
      WITH RECURSIVE ancestors AS (
        -- base: the matched categories themselves
        SELECT
          c.id,
          c.name,
          c.slug,
          c.display_name,
          c.level,
          c.parent_id,
          c.display_order,
          c.use_case_tags,
          c.id   AS origin_id
        FROM categories c
        WHERE c.use_case_tags @> ARRAY[$1]::text[]
          AND c.is_active = true

        UNION ALL

        -- walk up to parent
        SELECT
          p.id,
          p.name,
          p.slug,
          p.display_name,
          p.level,
          p.parent_id,
          p.display_order,
          p.use_case_tags,
          a.origin_id
        FROM categories p
        JOIN ancestors a ON a.parent_id = p.id
        WHERE p.is_active = true
      )
      -- For every matched category, grab the level-1 ancestor (department)
      SELECT DISTINCT
        dept.id   AS dept_id,
        dept.name AS dept_name,
        dept.slug AS dept_slug,
        dept.display_order AS dept_order,
        cat.id,
        cat.name,
        cat.slug,
        cat.display_name,
        cat.level,
        cat.parent_id,
        cat.display_order,
        cat.use_case_tags
      FROM ancestors dept
      JOIN ancestors cat ON cat.origin_id = dept.origin_id
      WHERE dept.level = 1
        AND cat.level > 1
      ORDER BY dept.display_order, cat.level, cat.display_order, cat.name
    `, [entry.tag]);

    // Group rows by department
    const deptMap = new Map();
    for (const row of rows) {
      if (!deptMap.has(row.dept_id)) {
        deptMap.set(row.dept_id, {
          id: row.dept_id,
          name: row.dept_name,
          slug: row.dept_slug,
          categories: [],
        });
      }
      deptMap.get(row.dept_id).categories.push({
        id: row.id,
        name: row.name,
        slug: row.slug,
        display_name: row.display_name,
        level: row.level,
        parent_id: row.parent_id,
        use_case_tags: row.use_case_tags,
      });
    }

    res.json({
      success: true,
      useCase: req.params.useCase,
      label: entry.label,
      departments: [...deptMap.values()],
    });
  }));

  /**
   * GET /api/categories/:slug/specs
   * Returns quick-filter spec options for a category (and its subcategories).
   * Used to render inline filter chips (e.g. 30", 36", 5.1, etc.)
   */
  router.get('/:slug/specs', authenticate, asyncHandler(async (req, res) => {
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

    // Deduplicate: if the same spec_key appears from multiple subcategories,
    // merge the spec_values arrays into a single unique-value set.
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
          display_order: row.display_order,
        });
      }
    }

    res.json({
      success: true,
      slug,
      specs: [...merged.values()].map(({ spec_key, spec_label, spec_values }) => ({
        spec_key,
        spec_label,
        spec_values,
      })),
    });
  }));

  /**
   * GET /api/categories/:slug/context
   * Returns enriched category context for the semantic search service.
   * Includes the category, its department (level-1 ancestor), use_case_tags,
   * legacy search patterns, sibling slugs, and skulytics category_paths.
   * The caller receives a flat boost_terms array for relevance boosting.
   */
  router.get('/:slug/context', authenticate, asyncHandler(async (req, res) => {
    const { slug } = req.params;

    // ── 1. Fetch the category + its full ancestor chain ──────
    const { rows: catRows } = await pool.query(`
      WITH RECURSIVE chain AS (
        SELECT id, parent_id, name, slug, display_name, level,
               use_case_tags, legacy_patterns, icon
        FROM categories
        WHERE slug = $1 AND is_active = true
        UNION ALL
        SELECT p.id, p.parent_id, p.name, p.slug, p.display_name, p.level,
               p.use_case_tags, p.legacy_patterns, p.icon
        FROM categories p
        JOIN chain c ON c.parent_id = p.id
        WHERE p.is_active = true
      )
      SELECT * FROM chain ORDER BY level
    `, [slug]);

    if (catRows.length === 0) {
      throw ApiError.notFound('Category');
    }

    // The requested category is the last row (deepest level)
    const category = catRows[catRows.length - 1];
    // The department is level 1
    const department = catRows.find(c => c.level === 1) || null;

    // ── 2. Sibling categories (same parent) ──────────────────
    const { rows: siblings } = await pool.query(`
      SELECT slug, name, display_name
      FROM categories
      WHERE parent_id = $1 AND is_active = true AND slug != $2
      ORDER BY display_order, name
    `, [category.parent_id, slug]);

    // ── 3. Child categories (if this is a parent) ────────────
    const { rows: children } = await pool.query(`
      SELECT slug, name, display_name, use_case_tags
      FROM categories
      WHERE parent_id = $1 AND is_active = true
      ORDER BY display_order, name
    `, [category.id]);

    // ── 4. Skulytics category_paths matching this slug ───────
    const { rows: skuRows } = await pool.query(`
      SELECT DISTINCT category_path
      FROM global_skulytics_products
      WHERE category_slug = $1 AND category_path IS NOT NULL
      LIMIT 50
    `, [slug]);
    const skulyticsPaths = skuRows.map(r => r.category_path);

    // ── 5. Build boost_terms ─────────────────────────────────
    //   Merge: use_case_tags (own + ancestors), legacy_patterns,
    //   display names of category + ancestors + children,
    //   skulytics paths, and sibling names.
    const terms = new Set();

    // Category & ancestor names + display names + use_case_tags
    for (const c of catRows) {
      terms.add(c.name.toLowerCase());
      if (c.display_name) terms.add(c.display_name.toLowerCase());
      if (Array.isArray(c.use_case_tags)) {
        for (const t of c.use_case_tags) terms.add(t.toLowerCase());
      }
      // Legacy patterns are search keywords
      if (Array.isArray(c.legacy_patterns)) {
        for (const p of c.legacy_patterns) terms.add(p.toLowerCase());
      }
    }

    // Child names
    for (const c of children) {
      terms.add(c.name.toLowerCase());
      if (c.display_name) terms.add(c.display_name.toLowerCase());
      if (Array.isArray(c.use_case_tags)) {
        for (const t of c.use_case_tags) terms.add(t.toLowerCase());
      }
    }

    // Skulytics paths — split on common delimiters and add segments
    for (const p of skulyticsPaths) {
      terms.add(p.toLowerCase());
      for (const seg of p.split(/[>/|]+/)) {
        const trimmed = seg.trim().toLowerCase();
        if (trimmed.length > 1) terms.add(trimmed);
      }
    }

    // Remove empty
    terms.delete('');

    res.json({
      success: true,
      category: {
        id: category.id,
        name: category.name,
        slug: category.slug,
        display_name: category.display_name,
        level: category.level,
        icon: category.icon,
        use_case_tags: category.use_case_tags || [],
        legacy_patterns: category.legacy_patterns || [],
      },
      department: department ? {
        id: department.id,
        name: department.name,
        slug: department.slug,
        display_name: department.display_name,
      } : null,
      ancestors: catRows.slice(0, -1).map(c => ({
        id: c.id, name: c.name, slug: c.slug, level: c.level,
      })),
      siblings: siblings.map(s => ({ slug: s.slug, name: s.name })),
      children: children.map(c => ({ slug: c.slug, name: c.name, display_name: c.display_name })),
      skulytics_paths: skulyticsPaths,
      boost_terms: [...terms].sort(),
    });
  }));

  /**
   * GET /api/categories/:slug
   * Returns single category by slug with subcategories
   */
  router.get('/:slug', authenticate, asyncHandler(async (req, res) => {
    const { slug } = req.params;
    const category = await productService.getCategoryBySlug(slug);

    if (!category) {
      throw ApiError.notFound('Category');
    }

    res.json({
      success: true,
      category
    });
  }));

  /**
   * GET /api/categories/:slug/subcategories
   * Returns subcategories for a category
   */
  router.get('/:slug/subcategories', authenticate, asyncHandler(async (req, res) => {
    const { slug } = req.params;
    const category = await productService.getCategoryBySlug(slug);

    if (!category) {
      throw ApiError.notFound('Category');
    }

    const subcategories = await productService.getSubcategories(category.id);
    res.json({
      success: true,
      category: {
        id: category.id,
        name: category.name,
        slug: category.slug
      },
      subcategories
    });
  }));

  /**
   * GET /api/categories/:slug/products
   * Returns products in a category (including subcategories)
   */
  router.get('/:slug/products', authenticate, asyncHandler(async (req, res) => {
    const { slug } = req.params;
    const {
      page = 1,
      limit = 50,
      sortBy = 'model',
      sortOrder = 'ASC',
      search = '',
      manufacturer = '',
      includeSubcategories = 'true'
    } = req.query;

    // Get category to verify it exists
    const category = await productService.getCategoryBySlug(slug);
    if (!category) {
      throw ApiError.notFound('Category');
    }

    // Fetch products using categorySlug filter
    const result = await productService.getProducts({
      categorySlug: slug,
      page: parseInt(page),
      limit: parseInt(limit),
      sortBy,
      sortOrder,
      search,
      manufacturer,
      includeSubcategories
    });

    res.json({
      success: true,
      category: {
        id: category.id,
        name: category.name,
        slug: category.slug,
        display_name: category.display_name
      },
      ...result
    });
  }));

  /**
   * GET /api/categories/id/:id
   * Returns category by ID
   */
  router.get('/id/:id', authenticate, asyncHandler(async (req, res) => {
    const { id } = req.params;

    const result = await pool.query(`
      SELECT
        c.*,
        parent.name as parent_name,
        parent.slug as parent_slug
      FROM categories c
      LEFT JOIN categories parent ON c.parent_id = parent.id
      WHERE c.id = $1 AND c.is_active = true
    `, [parseInt(id)]);

    if (result.rows.length === 0) {
      throw ApiError.notFound('Category');
    }

    const category = result.rows[0];

    // Get subcategories if level-2
    if (category.level === 2) {
      category.subcategories = await productService.getSubcategories(category.id);
    }

    res.json({
      success: true,
      category
    });
  }));

  return router;
};
