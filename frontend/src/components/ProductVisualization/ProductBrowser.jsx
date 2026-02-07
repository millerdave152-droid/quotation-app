import React, { useState, useEffect, useCallback } from 'react';
import ProductCard from './ProductCard';
import CategoryFilter from './CategoryFilter';
import SearchBar from './SearchBar';

import { authFetch } from '../../services/authFetch';
const API_BASE = '/api';

// Helper to get auth headers
const getAuthHeaders = () => {
  const token = localStorage.getItem('auth_token');
  return {
    'Content-Type': 'application/json',
    ...(token && { 'Authorization': `Bearer ${token}` })
  };
};

/**
 * ProductBrowser - Grid/list view for browsing vendor products
 * Features: filtering, search, sorting, pagination
 */
function ProductBrowser({ onProductSelect }) {
  const [products, setProducts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  // Filters
  const [selectedCategory, setSelectedCategory] = useState(null);
  const [selectedBrand, setSelectedBrand] = useState(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [sortBy, setSortBy] = useState('name');
  const [sortOrder, setSortOrder] = useState('ASC');
  const [viewMode, setViewMode] = useState('grid');

  // Pagination
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [total, setTotal] = useState(0);
  const limit = 24;

  // Filter options
  const [categories, setCategories] = useState([]);
  const [brands, setBrands] = useState([]);

  useEffect(() => {
    fetchFilterOptions();
  }, []);

  useEffect(() => {
    fetchProducts();
  }, [selectedCategory, selectedBrand, searchQuery, sortBy, sortOrder, page]);

  const fetchFilterOptions = async () => {
    try {
      const headers = getAuthHeaders();
      const [catRes, brandRes] = await Promise.all([
        authFetch(`${API_BASE}/vendor-products/categories`, { headers }),
        authFetch(`${API_BASE}/vendor-products/brands`, { headers })
      ]);

      if (catRes.ok) {
        const catData = await catRes.json();
        setCategories(catData);
      }

      if (brandRes.ok) {
        const brandData = await brandRes.json();
        setBrands(brandData);
      }
    } catch (err) {
      console.error('Failed to fetch filter options:', err);
    }
  };

  const fetchProducts = useCallback(async () => {
    setLoading(true);
    setError(null);

    try {
      const params = new URLSearchParams({
        page: page.toString(),
        limit: limit.toString(),
        sort_by: sortBy,
        sort_order: sortOrder
      });

      if (selectedCategory) params.append('category', selectedCategory);
      if (selectedBrand) params.append('brand', selectedBrand);
      if (searchQuery) params.append('search', searchQuery);

      const response = await authFetch(`${API_BASE}/vendor-products?${params}`, {
        headers: getAuthHeaders()
      });

      if (!response.ok) {
        throw new Error('Failed to fetch products');
      }

      const data = await response.json();
      setProducts(data.products || []);
      setTotalPages(data.pagination?.totalPages || 1);
      setTotal(data.pagination?.total || 0);
    } catch (err) {
      setError(err.message);
      setProducts([]);
    } finally {
      setLoading(false);
    }
  }, [selectedCategory, selectedBrand, searchQuery, sortBy, sortOrder, page]);

  const handleSearch = (query) => {
    setSearchQuery(query);
    setPage(1);
  };

  const handleCategoryChange = (category) => {
    setSelectedCategory(category);
    setPage(1);
  };

  const handleBrandChange = (brand) => {
    setSelectedBrand(brand);
    setPage(1);
  };

  const handleSortChange = (e) => {
    const [newSortBy, newSortOrder] = e.target.value.split(':');
    setSortBy(newSortBy);
    setSortOrder(newSortOrder);
    setPage(1);
  };

  const clearFilters = () => {
    setSelectedCategory(null);
    setSelectedBrand(null);
    setSearchQuery('');
    setPage(1);
  };

  const hasActiveFilters = selectedCategory || selectedBrand || searchQuery;

  return (
    <div className="product-browser">
      {/* Toolbar */}
      <div className="pb-toolbar">
        <div className="pb-toolbar-left">
          <SearchBar
            value={searchQuery}
            onChange={handleSearch}
            placeholder="Search products..."
          />
        </div>

        <div className="pb-toolbar-right">
          <select
            className="pb-sort-select"
            value={`${sortBy}:${sortOrder}`}
            onChange={handleSortChange}
          >
            <option value="name:ASC">Name (A-Z)</option>
            <option value="name:DESC">Name (Z-A)</option>
            <option value="model_number:ASC">Model (A-Z)</option>
            <option value="brand:ASC">Brand (A-Z)</option>
            <option value="msrp_cents:ASC">Price (Low-High)</option>
            <option value="msrp_cents:DESC">Price (High-Low)</option>
            <option value="created_at:DESC">Newest First</option>
          </select>

          <div className="pb-view-toggle">
            <button
              className={viewMode === 'grid' ? 'active' : ''}
              onClick={() => setViewMode('grid')}
              title="Grid View"
            >
              <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor">
                <rect x="1" y="1" width="6" height="6" rx="1" />
                <rect x="9" y="1" width="6" height="6" rx="1" />
                <rect x="1" y="9" width="6" height="6" rx="1" />
                <rect x="9" y="9" width="6" height="6" rx="1" />
              </svg>
            </button>
            <button
              className={viewMode === 'list' ? 'active' : ''}
              onClick={() => setViewMode('list')}
              title="List View"
            >
              <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor">
                <rect x="1" y="2" width="14" height="3" rx="1" />
                <rect x="1" y="7" width="14" height="3" rx="1" />
                <rect x="1" y="12" width="14" height="3" rx="1" />
              </svg>
            </button>
          </div>
        </div>
      </div>

      <div className="pb-main">
        {/* Sidebar Filters */}
        <div className="pb-sidebar">
          <CategoryFilter
            categories={categories}
            brands={brands}
            selectedCategory={selectedCategory}
            selectedBrand={selectedBrand}
            onCategoryChange={handleCategoryChange}
            onBrandChange={handleBrandChange}
          />

          {hasActiveFilters && (
            <button className="pb-clear-filters" onClick={clearFilters}>
              Clear All Filters
            </button>
          )}
        </div>

        {/* Products Grid/List */}
        <div className="pb-products">
          {/* Results Info */}
          <div className="pb-results-info">
            {loading ? (
              <span>Loading...</span>
            ) : error ? (
              <span className="pb-error">{error}</span>
            ) : (
              <span>
                Showing {products.length} of {total} products
                {hasActiveFilters && ' (filtered)'}
              </span>
            )}
          </div>

          {/* Product Grid/List */}
          {!loading && !error && (
            <div className={`pb-products-${viewMode}`}>
              {products.length === 0 ? (
                <div className="pb-no-results">
                  <p>No products found</p>
                  {hasActiveFilters && (
                    <button onClick={clearFilters}>Clear filters</button>
                  )}
                </div>
              ) : (
                products.map(product => (
                  <ProductCard
                    key={product.id}
                    product={product}
                    viewMode={viewMode}
                    onClick={() => onProductSelect(product.id)}
                  />
                ))
              )}
            </div>
          )}

          {/* Loading Spinner */}
          {loading && (
            <div className="pb-loading">
              <div className="pb-spinner"></div>
              <span>Loading products...</span>
            </div>
          )}

          {/* Pagination */}
          {!loading && totalPages > 1 && (
            <div className="pb-pagination">
              <button
                disabled={page <= 1}
                onClick={() => setPage(p => p - 1)}
              >
                Previous
              </button>

              <span className="pb-page-info">
                Page {page} of {totalPages}
              </span>

              <button
                disabled={page >= totalPages}
                onClick={() => setPage(p => p + 1)}
              >
                Next
              </button>
            </div>
          )}
        </div>
      </div>

      <style jsx>{`
        .product-browser {
          padding: 20px;
        }

        .pb-toolbar {
          display: flex;
          justify-content: space-between;
          align-items: center;
          margin-bottom: 20px;
          gap: 16px;
          flex-wrap: wrap;
        }

        .pb-toolbar-left {
          flex: 1;
          min-width: 200px;
          max-width: 400px;
        }

        .pb-toolbar-right {
          display: flex;
          gap: 12px;
          align-items: center;
        }

        .pb-sort-select {
          padding: 8px 12px;
          border: 1px solid #ddd;
          border-radius: 6px;
          font-size: 14px;
          background: white;
          min-width: 150px;
        }

        .pb-view-toggle {
          display: flex;
          border: 1px solid #ddd;
          border-radius: 6px;
          overflow: hidden;
        }

        .pb-view-toggle button {
          padding: 8px 12px;
          border: none;
          background: white;
          cursor: pointer;
          display: flex;
          align-items: center;
          color: #666;
        }

        .pb-view-toggle button:hover {
          background: #f5f5f5;
        }

        .pb-view-toggle button.active {
          background: #2196F3;
          color: white;
        }

        .pb-main {
          display: flex;
          gap: 24px;
        }

        .pb-sidebar {
          width: 240px;
          flex-shrink: 0;
        }

        .pb-clear-filters {
          width: 100%;
          margin-top: 16px;
          padding: 10px;
          background: #f5f5f5;
          border: 1px solid #ddd;
          border-radius: 6px;
          cursor: pointer;
          font-size: 14px;
          color: #666;
        }

        .pb-clear-filters:hover {
          background: #eee;
        }

        .pb-products {
          flex: 1;
          min-width: 0;
        }

        .pb-results-info {
          margin-bottom: 16px;
          font-size: 14px;
          color: #666;
        }

        .pb-error {
          color: #f44336;
        }

        .pb-products-grid {
          display: grid;
          grid-template-columns: repeat(auto-fill, minmax(240px, 1fr));
          gap: 20px;
        }

        .pb-products-list {
          display: flex;
          flex-direction: column;
          gap: 12px;
        }

        .pb-no-results {
          text-align: center;
          padding: 60px 20px;
          color: #666;
        }

        .pb-no-results button {
          margin-top: 12px;
          padding: 8px 16px;
          background: #2196F3;
          color: white;
          border: none;
          border-radius: 6px;
          cursor: pointer;
        }

        .pb-loading {
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: center;
          padding: 60px 20px;
          color: #666;
        }

        .pb-spinner {
          width: 40px;
          height: 40px;
          border: 3px solid #f0f0f0;
          border-top-color: #2196F3;
          border-radius: 50%;
          animation: spin 1s linear infinite;
          margin-bottom: 16px;
        }

        @keyframes spin {
          to { transform: rotate(360deg); }
        }

        .pb-pagination {
          display: flex;
          justify-content: center;
          align-items: center;
          gap: 16px;
          margin-top: 24px;
          padding-top: 24px;
          border-top: 1px solid #eee;
        }

        .pb-pagination button {
          padding: 8px 16px;
          background: white;
          border: 1px solid #ddd;
          border-radius: 6px;
          cursor: pointer;
          font-size: 14px;
        }

        .pb-pagination button:hover:not(:disabled) {
          background: #f5f5f5;
        }

        .pb-pagination button:disabled {
          opacity: 0.5;
          cursor: not-allowed;
        }

        .pb-page-info {
          font-size: 14px;
          color: #666;
        }

        @media (max-width: 768px) {
          .pb-main {
            flex-direction: column;
          }

          .pb-sidebar {
            width: 100%;
          }
        }
      `}</style>
    </div>
  );
}

export default ProductBrowser;
