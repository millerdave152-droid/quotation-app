import React from 'react';

/**
 * CategoryFilter - Sidebar filter component for categories and brands
 */
function CategoryFilter({
  categories = [],
  brands = [],
  selectedCategory,
  selectedBrand,
  onCategoryChange,
  onBrandChange
}) {
  // Standard appliance categories with icons
  const categoryIcons = {
    'Cooking': (
      <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor">
        <path d="M8.1 13.34l2.83-2.83L3.91 3.5a4.008 4.008 0 000 5.66l4.19 4.18zm6.78-1.81c1.53.71 3.68.21 5.27-1.38 1.91-1.91 2.28-4.65.81-6.12-1.46-1.46-4.2-1.1-6.12.81-1.59 1.59-2.09 3.74-1.38 5.27L3.7 19.87l1.41 1.41L12 14.41l6.88 6.88 1.41-1.41L13.41 13l1.47-1.47z"/>
      </svg>
    ),
    'Cleaning': (
      <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor">
        <path d="M17 4h-7v2h3.84c-.52.61-.93 1.27-1.23 2H8v2h4.21c-.15.33-.26.67-.34 1H8v2h4c.46 2.28 2.48 4 4.9 4 .74 0 1.44-.17 2.1-.45V18c0 .55-.45 1-1 1H6c-.55 0-1-.45-1-1V8c0-.55.45-1 1-1h9c0-.37.04-.73.1-1.09.13-.77.41-1.51.79-2.17.03-.05.07-.11.11-.16V3c0-.55-.45-1-1-1h-1v2zm.86 3c.95 0 1.79.62 2.08 1.52.29.89-.04 1.87-.82 2.42a1.5 1.5 0 01-.08.06c.53.29.98.71 1.31 1.22.77-1.08 1.19-2.39 1.15-3.77-.08-2.66-2.19-4.85-4.84-5.02C13.19 3.22 10.5 5.21 10.05 8H17c0-.55.38-1 .86-1z"/>
      </svg>
    ),
    'Refrigeration': (
      <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor">
        <path d="M18 2H6c-1.1 0-2 .9-2 2v16c0 1.1.9 2 2 2h12c1.1 0 2-.9 2-2V4c0-1.1-.9-2-2-2zm0 14H6V9h12v7zm0-9H6V4h12v3zm-8 2H8v3h2v-3z"/>
      </svg>
    ),
    'Laundry': (
      <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor">
        <path d="M9.17 16.83a4.008 4.008 0 005.66 0 4.008 4.008 0 000-5.66l-5.66 5.66zM18 2H6c-1.1 0-2 .9-2 2v16c0 1.1.9 2 2 2h12c1.1 0 2-.9 2-2V4c0-1.1-.9-2-2-2zM6 4h12v2H6V4zm12 16H6V8h12v12z"/>
      </svg>
    )
  };

  const getCategoryIcon = (category) => {
    return categoryIcons[category] || (
      <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor">
        <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm0 18c-4.41 0-8-3.59-8-8s3.59-8 8-8 8 3.59 8 8-3.59 8-8 8z"/>
      </svg>
    );
  };

  return (
    <div className="category-filter">
      {/* Categories */}
      <div className="cf-section">
        <h3 className="cf-title">Categories</h3>
        <ul className="cf-list">
          <li>
            <button
              className={!selectedCategory ? 'active' : ''}
              onClick={() => onCategoryChange(null)}
            >
              <span className="cf-icon">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor">
                  <path d="M4 8h4V4H4v4zm6 12h4v-4h-4v4zm-6 0h4v-4H4v4zm0-6h4v-4H4v4zm6 0h4v-4h-4v4zm6-10v4h4V4h-4zm-6 4h4V4h-4v4zm6 6h4v-4h-4v4zm0 6h4v-4h-4v4z"/>
                </svg>
              </span>
              <span className="cf-label">All Categories</span>
            </button>
          </li>
          {categories.map(cat => (
            <li key={cat.category}>
              <button
                className={selectedCategory === cat.category ? 'active' : ''}
                onClick={() => onCategoryChange(cat.category)}
              >
                <span className="cf-icon">{getCategoryIcon(cat.category)}</span>
                <span className="cf-label">{cat.category}</span>
                <span className="cf-count">{cat.count}</span>
              </button>
            </li>
          ))}
        </ul>
      </div>

      {/* Brands */}
      <div className="cf-section">
        <h3 className="cf-title">Brands</h3>
        <select
          className="cf-brand-select"
          value={selectedBrand || ''}
          onChange={(e) => onBrandChange(e.target.value || null)}
        >
          <option value="">All Brands</option>
          {brands.map(brand => (
            <option key={brand.brand} value={brand.brand}>
              {brand.brand} ({brand.count})
            </option>
          ))}
        </select>
      </div>

      <style jsx>{`
        .category-filter {
          background: white;
        }

        .cf-section {
          margin-bottom: 24px;
        }

        .cf-title {
          font-size: 13px;
          font-weight: 600;
          color: #666;
          text-transform: uppercase;
          letter-spacing: 0.5px;
          margin: 0 0 12px 0;
        }

        .cf-list {
          list-style: none;
          padding: 0;
          margin: 0;
        }

        .cf-list li {
          margin-bottom: 4px;
        }

        .cf-list button {
          width: 100%;
          display: flex;
          align-items: center;
          gap: 10px;
          padding: 10px 12px;
          border: none;
          background: none;
          border-radius: 6px;
          cursor: pointer;
          text-align: left;
          font-size: 14px;
          color: #444;
          transition: all 0.2s;
        }

        .cf-list button:hover {
          background: #f5f5f5;
        }

        .cf-list button.active {
          background: #e3f2fd;
          color: #2196F3;
        }

        .cf-icon {
          display: flex;
          align-items: center;
          justify-content: center;
          width: 28px;
          height: 28px;
          background: #f5f5f5;
          border-radius: 6px;
          color: #666;
        }

        .cf-list button.active .cf-icon {
          background: #bbdefb;
          color: #1976D2;
        }

        .cf-label {
          flex: 1;
        }

        .cf-count {
          font-size: 12px;
          color: #999;
          background: #f0f0f0;
          padding: 2px 8px;
          border-radius: 10px;
        }

        .cf-list button.active .cf-count {
          background: #bbdefb;
          color: #1976D2;
        }

        .cf-brand-select {
          width: 100%;
          padding: 10px 12px;
          border: 1px solid #ddd;
          border-radius: 6px;
          font-size: 14px;
          background: white;
          cursor: pointer;
        }

        .cf-brand-select:focus {
          outline: none;
          border-color: #2196F3;
        }
      `}</style>
    </div>
  );
}

export default CategoryFilter;
