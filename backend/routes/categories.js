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

module.exports = function(pool, productService) {
  /**
   * GET /api/categories
   * Returns full category hierarchy with product counts
   */
  router.get('/', async (req, res) => {
    try {
      const hierarchy = await productService.getCategoryHierarchy();
      res.json({
        success: true,
        categories: hierarchy
      });
    } catch (err) {
      console.error('Error fetching category hierarchy:', err);
      res.status(500).json({
        success: false,
        error: 'Failed to fetch categories'
      });
    }
  });

  /**
   * GET /api/categories/main
   * Returns flat list of level-2 categories (main categories)
   */
  router.get('/main', async (req, res) => {
    try {
      const categories = await productService.getMainCategories();
      res.json({
        success: true,
        categories
      });
    } catch (err) {
      console.error('Error fetching main categories:', err);
      res.status(500).json({
        success: false,
        error: 'Failed to fetch main categories'
      });
    }
  });

  /**
   * GET /api/categories/legacy
   * Returns legacy raw category strings (for backward compatibility)
   */
  router.get('/legacy', async (req, res) => {
    try {
      const categories = await productService.getCategories();
      res.json({
        success: true,
        categories
      });
    } catch (err) {
      console.error('Error fetching legacy categories:', err);
      res.status(500).json({
        success: false,
        error: 'Failed to fetch legacy categories'
      });
    }
  });

  /**
   * GET /api/categories/:slug
   * Returns single category by slug with subcategories
   */
  router.get('/:slug', async (req, res) => {
    try {
      const { slug } = req.params;
      const category = await productService.getCategoryBySlug(slug);

      if (!category) {
        return res.status(404).json({
          success: false,
          error: 'Category not found'
        });
      }

      res.json({
        success: true,
        category
      });
    } catch (err) {
      console.error('Error fetching category:', err);
      res.status(500).json({
        success: false,
        error: 'Failed to fetch category'
      });
    }
  });

  /**
   * GET /api/categories/:slug/subcategories
   * Returns subcategories for a category
   */
  router.get('/:slug/subcategories', async (req, res) => {
    try {
      const { slug } = req.params;
      const category = await productService.getCategoryBySlug(slug);

      if (!category) {
        return res.status(404).json({
          success: false,
          error: 'Category not found'
        });
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
    } catch (err) {
      console.error('Error fetching subcategories:', err);
      res.status(500).json({
        success: false,
        error: 'Failed to fetch subcategories'
      });
    }
  });

  /**
   * GET /api/categories/:slug/products
   * Returns products in a category (including subcategories)
   */
  router.get('/:slug/products', async (req, res) => {
    try {
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
        return res.status(404).json({
          success: false,
          error: 'Category not found'
        });
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
    } catch (err) {
      console.error('Error fetching products by category:', err);
      res.status(500).json({
        success: false,
        error: 'Failed to fetch products'
      });
    }
  });

  /**
   * GET /api/categories/id/:id
   * Returns category by ID
   */
  router.get('/id/:id', async (req, res) => {
    try {
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
        return res.status(404).json({
          success: false,
          error: 'Category not found'
        });
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
    } catch (err) {
      console.error('Error fetching category by ID:', err);
      res.status(500).json({
        success: false,
        error: 'Failed to fetch category'
      });
    }
  });

  return router;
};
