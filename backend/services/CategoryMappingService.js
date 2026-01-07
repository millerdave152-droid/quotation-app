/**
 * CategoryMappingService
 *
 * Maps raw category text strings to normalized category IDs.
 * Handles brand prefix stripping, dimension removal, and pattern matching.
 */

class CategoryMappingService {
  constructor(pool) {
    this.pool = pool;
    this.categoryCache = null;
    this.categoryBySlug = null;

    // Brand prefixes to strip from category names
    this.BRAND_PREFIXES = [
      'samsung', 'lg', 'ge', 'whirlpool', 'frigidaire', 'electrolux',
      'bosch', 'kitchenaid', 'maytag', 'miele', 'thermador', 'jenn-air',
      'jennair', 'viking', 'sub-zero', 'wolf', 'monogram', 'cafe',
      'bertazzoni', 'fulgor milano', 'fulgor', 'thor kitchen', 'thor',
      'hisense', 'sony', 'tcl', 'vesta', 'napoleon', 'yoder', 'presrv',
      'amana', 'kenmore', 'dacor', 'fisher & paykel', 'fisher paykel',
      'ge profile', 'ge cafe', 'lg signature', 'samsung bespoke', 'bespoke'
    ];

    // Dimension patterns to remove
    this.DIMENSION_PATTERNS = [
      /(\d{2,3})["''"\s]*(?:inch|in|")?/gi,  // 24", 30 inch, 36in
      /(\d{2,3})\s*cu\.?\s*ft\.?/gi,          // 25 cu ft, 18.2 cu. ft.
    ];
  }

  /**
   * Load all categories from database into cache
   */
  async loadCategories() {
    if (this.categoryCache) return this.categoryCache;

    const result = await this.pool.query(`
      SELECT id, name, slug, level, parent_id, legacy_patterns
      FROM categories
      WHERE is_active = true
      ORDER BY level DESC, display_order
    `);

    this.categoryCache = result.rows.map(row => ({
      ...row,
      legacy_patterns: typeof row.legacy_patterns === 'string'
        ? JSON.parse(row.legacy_patterns)
        : (row.legacy_patterns || [])
    }));

    // Build slug lookup
    this.categoryBySlug = {};
    for (const cat of this.categoryCache) {
      this.categoryBySlug[cat.slug] = cat;
    }

    return this.categoryCache;
  }

  /**
   * Get category by slug
   */
  async getCategoryBySlug(slug) {
    await this.loadCategories();
    return this.categoryBySlug[slug] || null;
  }

  /**
   * Get category hierarchy as tree
   */
  async getCategoryTree() {
    await this.loadCategories();

    const lookup = {};
    const tree = [];

    // Create lookup by id
    for (const cat of this.categoryCache) {
      lookup[cat.id] = { ...cat, children: [] };
    }

    // Build tree structure
    for (const cat of this.categoryCache) {
      if (cat.parent_id && lookup[cat.parent_id]) {
        lookup[cat.parent_id].children.push(lookup[cat.id]);
      } else if (!cat.parent_id) {
        tree.push(lookup[cat.id]);
      }
    }

    // Sort children by display_order (already sorted in query, but ensure)
    const sortChildren = (node) => {
      if (node.children) {
        node.children.sort((a, b) => (a.display_order || 0) - (b.display_order || 0));
        node.children.forEach(sortChildren);
      }
    };

    tree.forEach(sortChildren);

    return tree;
  }

  /**
   * Strip brand prefix from category text
   */
  stripBrandPrefix(text) {
    if (!text) return '';

    let cleaned = text.toLowerCase().trim();

    // Sort by length descending to match longer prefixes first
    const sortedPrefixes = [...this.BRAND_PREFIXES].sort((a, b) => b.length - a.length);

    for (const brand of sortedPrefixes) {
      // Handle "Brand - Category" format
      const dashPattern = new RegExp(`^${brand.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\s*[-:]+\\s*`, 'i');
      if (dashPattern.test(cleaned)) {
        cleaned = cleaned.replace(dashPattern, '');
        break;
      }

      // Handle "Brand Category" format (space separated)
      if (cleaned.startsWith(brand + ' ')) {
        cleaned = cleaned.substring(brand.length + 1);
        break;
      }
    }

    return cleaned.trim();
  }

  /**
   * Strip dimension specifications from category text
   */
  stripDimensions(text) {
    if (!text) return '';

    let cleaned = text;
    for (const pattern of this.DIMENSION_PATTERNS) {
      cleaned = cleaned.replace(pattern, ' ');
    }

    // Clean up multiple spaces
    return cleaned.replace(/\s+/g, ' ').trim();
  }

  /**
   * Normalize category text for matching
   */
  normalizeForMatching(text) {
    if (!text) return '';

    let normalized = this.stripBrandPrefix(text);
    normalized = this.stripDimensions(normalized);

    // Remove common noise words
    const noiseWords = ['with', 'and', 'the', 'new', 'series', 'collection', 'premium', 'pro', 'plus'];
    for (const word of noiseWords) {
      normalized = normalized.replace(new RegExp(`\\b${word}\\b`, 'gi'), ' ');
    }

    return normalized.toLowerCase().replace(/\s+/g, ' ').trim();
  }

  /**
   * Map a raw category string to normalized category IDs
   *
   * @param {string} rawCategory - The raw category text from import
   * @param {string} manufacturer - Optional manufacturer name for context
   * @returns {Object} { categoryId, subcategoryId, confidence }
   */
  async mapCategory(rawCategory, manufacturer = null) {
    if (!rawCategory) {
      return { categoryId: null, subcategoryId: null, confidence: 0 };
    }

    const categories = await this.loadCategories();
    const normalized = this.normalizeForMatching(rawCategory);

    if (!normalized) {
      return { categoryId: null, subcategoryId: null, confidence: 0 };
    }

    let bestMatch = { categoryId: null, subcategoryId: null, confidence: 0, matchedPattern: null };

    // Try to find best matching category by pattern
    // Categories are sorted by level DESC, so subcategories (level 3) are checked first
    for (const cat of categories) {
      for (const pattern of cat.legacy_patterns) {
        const patternLower = pattern.toLowerCase();

        // Check if pattern exists in normalized text
        if (normalized.includes(patternLower)) {
          // Calculate confidence based on pattern length and position
          const confidence = (patternLower.length / normalized.length) * 100;

          if (confidence > bestMatch.confidence) {
            if (cat.level === 3) {
              // This is a subcategory - set both category and subcategory
              bestMatch = {
                categoryId: cat.parent_id,
                subcategoryId: cat.id,
                confidence,
                matchedPattern: pattern,
                matchedCategory: cat.name
              };
            } else if (cat.level === 2) {
              // Only update if we don't already have a subcategory match
              // OR if this confidence is significantly higher
              if (!bestMatch.subcategoryId || confidence > bestMatch.confidence + 20) {
                bestMatch = {
                  categoryId: cat.id,
                  subcategoryId: null,
                  confidence,
                  matchedPattern: pattern,
                  matchedCategory: cat.name
                };
              }
            }
          }
        }
      }
    }

    return bestMatch;
  }

  /**
   * Map multiple products in batch
   *
   * @param {Array} products - Array of { category, manufacturer } objects
   * @returns {Map} Map of category -> { categoryId, subcategoryId }
   */
  async mapCategoriesBatch(products) {
    await this.loadCategories();

    const mappings = new Map();
    const unmapped = [];

    for (const product of products) {
      const key = `${product.category}|${product.manufacturer || ''}`;

      if (!mappings.has(key)) {
        const mapping = await this.mapCategory(product.category, product.manufacturer);
        mappings.set(key, mapping);

        if (!mapping.categoryId) {
          unmapped.push({
            category: product.category,
            manufacturer: product.manufacturer,
            normalized: this.normalizeForMatching(product.category)
          });
        }
      }
    }

    return { mappings, unmapped };
  }

  /**
   * Get all level-2 categories (main categories like Refrigerators, Washers, etc.)
   */
  async getMainCategories() {
    await this.loadCategories();
    return this.categoryCache.filter(c => c.level === 2);
  }

  /**
   * Get subcategories for a given category
   */
  async getSubcategories(categoryId) {
    await this.loadCategories();
    return this.categoryCache.filter(c => c.parent_id === categoryId && c.level === 3);
  }

  /**
   * Get category with its parent and children
   */
  async getCategoryWithRelations(categoryId) {
    await this.loadCategories();

    const category = this.categoryCache.find(c => c.id === categoryId);
    if (!category) return null;

    const parent = category.parent_id
      ? this.categoryCache.find(c => c.id === category.parent_id)
      : null;

    const children = this.categoryCache.filter(c => c.parent_id === categoryId);

    return {
      ...category,
      parent,
      children
    };
  }

  /**
   * Clear cache (useful after adding new categories)
   */
  clearCache() {
    this.categoryCache = null;
    this.categoryBySlug = null;
  }
}

module.exports = CategoryMappingService;
