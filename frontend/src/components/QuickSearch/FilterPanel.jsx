/**
 * FilterPanel - Collapsible filter sidebar
 */
import React, { useState } from 'react';

// Color swatches
const colorSwatches = {
  'Stainless Steel': '#A8A8A8',
  'Black Stainless': '#363636',
  'Black': '#1a1a1a',
  'White': '#ffffff',
  'Slate': '#5A5A5A',
  'Bisque': '#F4E6CC',
  'Fingerprint Resistant': '#B8B8B8'
};

// Status labels
const statusLabels = {
  normal: 'Full Price',
  clearance: 'Clearance',
  end_of_line: 'End of Line',
  discontinued: 'Discontinued'
};

// Stock status options
const stockStatusOptions = [
  { value: 'in_stock', label: 'In Stock', color: '#10b981' },
  { value: 'low_stock', label: 'Low Stock', color: '#f97316' },
  { value: 'overstock', label: 'Overstock', color: '#3b82f6' },
  { value: 'last_pieces', label: 'Last Pieces', color: '#eab308' },
  { value: 'out_of_stock', label: 'Out of Stock', color: '#6b7280' }
];

const FilterPanel = ({
  filters = {},
  filterOptions = {},
  onFilterChange,
  onClearFilters,
  loading = false,
  userRole = 'sales'
}) => {
  const [expandedSections, setExpandedSections] = useState({
    status: true,
    brand: true,
    price: true,
    stock: true,
    category: true,
    attributes: false
  });

  const toggleSection = (section) => {
    setExpandedSections(prev => ({
      ...prev,
      [section]: !prev[section]
    }));
  };

  // Handle checkbox filter change
  const handleCheckboxChange = (filterKey, value, isMulti = true) => {
    if (isMulti) {
      const currentValues = filters[filterKey] || [];
      const newValues = currentValues.includes(value)
        ? currentValues.filter(v => v !== value)
        : [...currentValues, value];
      onFilterChange(filterKey, newValues.length > 0 ? newValues : undefined);
    } else {
      onFilterChange(filterKey, filters[filterKey] === value ? undefined : value);
    }
  };

  // Handle toggle filter change
  const handleToggleChange = (filterKey) => {
    onFilterChange(filterKey, !filters[filterKey] ? true : undefined);
  };

  // Handle price range change
  const handlePriceChange = (field, value) => {
    const numValue = value === '' ? undefined : parseFloat(value);
    onFilterChange(field, numValue);
  };

  // Render section header
  const renderSectionHeader = (section, label) => (
    <div
      className="filter-section-header"
      onClick={() => toggleSection(section)}
    >
      <h3>{label}</h3>
      <svg
        className={`toggle-icon ${expandedSections[section] ? 'expanded' : ''}`}
        width="16"
        height="16"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
      >
        <polyline points="6 9 12 15 18 9" />
      </svg>
    </div>
  );

  return (
    <div className="filter-panel">
      {/* Status Section */}
      <div className="filter-section">
        {renderSectionHeader('status', 'Status')}
        {expandedSections.status && (
          <div className="filter-section-content">
            <div className="stock-status-toggles">
              {Object.entries(statusLabels).map(([value, label]) => (
                <button
                  key={value}
                  className={`stock-toggle ${
                    (filters.productStatus || []).includes(value) ? 'active' : ''
                  }`}
                  onClick={() => handleCheckboxChange('productStatus', value)}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Stock Status Section */}
      <div className="filter-section">
        {renderSectionHeader('stock', 'Stock Level')}
        {expandedSections.stock && (
          <div className="filter-section-content">
            <div className="stock-status-toggles">
              {stockStatusOptions.map(option => (
                <button
                  key={option.value}
                  className={`stock-toggle ${filters.stockStatus === option.value ? 'active' : ''}`}
                  onClick={() => handleCheckboxChange('stockStatus', option.value, false)}
                  style={{
                    '--toggle-color': option.color
                  }}
                >
                  <span
                    className="stock-dot"
                    style={{ background: option.color, display: 'inline-block', width: 8, height: 8, borderRadius: '50%', marginRight: 4 }}
                  />
                  {option.label}
                </button>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Brand Section */}
      <div className="filter-section">
        {renderSectionHeader('brand', 'Brand')}
        {expandedSections.brand && (
          <div className="filter-section-content">
            {filterOptions.brands?.slice(0, 10).map(brand => (
              <div key={brand.value} className="filter-option">
                <input
                  type="checkbox"
                  id={`brand-${brand.value}`}
                  checked={(filters.brands || []).includes(brand.value)}
                  onChange={() => handleCheckboxChange('brands', brand.value)}
                />
                <label htmlFor={`brand-${brand.value}`}>{brand.value}</label>
                <span className="count">{brand.count}</span>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Price Range Section */}
      <div className="filter-section">
        {renderSectionHeader('price', 'Price Range')}
        {expandedSections.price && (
          <div className="filter-section-content">
            <div className="price-range-inputs">
              <input
                type="number"
                placeholder="Min"
                value={filters.minPrice || ''}
                onChange={(e) => handlePriceChange('minPrice', e.target.value)}
                min="0"
              />
              <span>to</span>
              <input
                type="number"
                placeholder="Max"
                value={filters.maxPrice || ''}
                onChange={(e) => handlePriceChange('maxPrice', e.target.value)}
                min="0"
              />
            </div>
            <div className="stock-status-toggles" style={{ marginTop: '0.5rem' }}>
              <button
                className={`stock-toggle ${filters.maxPrice === 500 ? 'active' : ''}`}
                onClick={() => {
                  onFilterChange('minPrice', undefined);
                  onFilterChange('maxPrice', 500);
                }}
              >
                Under $500
              </button>
              <button
                className={`stock-toggle ${filters.minPrice === 500 && filters.maxPrice === 1000 ? 'active' : ''}`}
                onClick={() => {
                  onFilterChange('minPrice', 500);
                  onFilterChange('maxPrice', 1000);
                }}
              >
                $500-$1000
              </button>
              <button
                className={`stock-toggle ${filters.minPrice === 1000 && filters.maxPrice === 2000 ? 'active' : ''}`}
                onClick={() => {
                  onFilterChange('minPrice', 1000);
                  onFilterChange('maxPrice', 2000);
                }}
              >
                $1000-$2000
              </button>
              <button
                className={`stock-toggle ${filters.minPrice === 2000 && !filters.maxPrice ? 'active' : ''}`}
                onClick={() => {
                  onFilterChange('minPrice', 2000);
                  onFilterChange('maxPrice', undefined);
                }}
              >
                $2000+
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Category Section */}
      <div className="filter-section">
        {renderSectionHeader('category', 'Category')}
        {expandedSections.category && (
          <div className="filter-section-content">
            {filterOptions.categories?.map(cat => (
              <div key={cat.value} className="filter-option">
                <input
                  type="checkbox"
                  id={`cat-${cat.value}`}
                  checked={filters.categoryId === cat.value.toString()}
                  onChange={() => handleCheckboxChange('categoryId', cat.value.toString(), false)}
                />
                <label htmlFor={`cat-${cat.value}`}>{cat.label}</label>
                <span className="count">{cat.count}</span>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Attributes Section */}
      <div className="filter-section">
        {renderSectionHeader('attributes', 'Attributes')}
        {expandedSections.attributes && (
          <div className="filter-section-content">
            {/* Color/Finish */}
            <div style={{ marginBottom: '1rem' }}>
              <label style={{ fontSize: '0.75rem', color: '#666', display: 'block', marginBottom: '0.5rem' }}>
                Color / Finish
              </label>
              <div className="color-swatches">
                {Object.entries(colorSwatches).map(([name, color]) => (
                  <div
                    key={name}
                    className={`color-swatch ${(filters.colors || []).includes(name) ? 'active' : ''}`}
                    style={{ backgroundColor: color, border: name === 'White' ? '1px solid #ddd' : 'none' }}
                    onClick={() => handleCheckboxChange('colors', name)}
                    title={name}
                  />
                ))}
              </div>
            </div>

            {/* Energy Star */}
            <div className="toggle-switch">
              <label>Energy Star Certified</label>
              <input
                type="checkbox"
                checked={!!filters.energyStar}
                onChange={() => handleToggleChange('energyStar')}
              />
            </div>

            {/* Smart/WiFi */}
            <div className="toggle-switch">
              <label>Smart / WiFi Enabled</label>
              <input
                type="checkbox"
                checked={!!filters.smartEnabled}
                onChange={() => handleToggleChange('smartEnabled')}
              />
            </div>

            {/* On Sale */}
            <div className="toggle-switch">
              <label>On Sale / Promotion</label>
              <input
                type="checkbox"
                checked={!!filters.onSale}
                onChange={() => handleToggleChange('onSale')}
              />
            </div>
          </div>
        )}
      </div>

      {/* Clear Filters */}
      {Object.keys(filters).length > 0 && (
        <button
          className="clear-filters-btn"
          onClick={onClearFilters}
          style={{ width: '100%', marginTop: '1rem' }}
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <line x1="18" y1="6" x2="6" y2="18" />
            <line x1="6" y1="6" x2="18" y2="18" />
          </svg>
          Clear All Filters
        </button>
      )}
    </div>
  );
};

export default FilterPanel;
