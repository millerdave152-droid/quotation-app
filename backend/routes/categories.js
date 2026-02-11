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
const { authenticate } = require('../middleware/auth');
const { ApiError, asyncHandler } = require('../middleware/errorHandler');

module.exports = function(pool, productService) {
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
