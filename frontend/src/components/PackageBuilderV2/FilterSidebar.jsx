/**
 * FilterSidebar - Left panel with all filter categories
 * Shows filter counts and updates in real-time
 * Enhanced with visual branding and presets
 */
import React, { useState } from 'react';
import FilterSection from './FilterSection';
import FilterOption from './FilterOption';
import PriceRangeSlider from './PriceRangeSlider';
import FilterPresets from './FilterPresets';
import './FilterSidebar.css';

// Brand logo colors for visual badges
const brandColors = {
  'LG': { bg: '#A50034', text: 'white' },
  'Samsung': { bg: '#1428A0', text: 'white' },
  'Whirlpool': { bg: '#003B73', text: 'white' },
  'GE': { bg: '#2C5697', text: 'white' },
  'Frigidaire': { bg: '#00529B', text: 'white' },
  'Bosch': { bg: '#E20015', text: 'white' },
  'KitchenAid': { bg: '#B30000', text: 'white' },
  'Maytag': { bg: '#0066B2', text: 'white' },
  'Amana': { bg: '#003057', text: 'white' },
  'Miele': { bg: '#8B0000', text: 'white' }
};

// Finish color swatches
const finishSwatches = {
  'stainless': { color: '#A8A8A8', border: '#888' },
  'black stainless': { color: '#363636', border: '#222' },
  'black': { color: '#1a1a1a', border: '#000' },
  'white': { color: '#ffffff', border: '#ddd' },
  'slate': { color: '#5A5A5A', border: '#444' },
  'bisque': { color: '#F4E6CC', border: '#d4c4a4' }
};

const FilterSidebar = ({
  packageType = 'kitchen',
  filterOptions = {},
  selectedFilters = {},
  onFilterChange,
  onClearFilters,
  loading = false,
  onPriceRangeChange = null
}) => {
  const [brandSearch, setBrandSearch] = useState('');
  const [priceRange, setPriceRange] = useState([0, packageType === 'kitchen' ? 15000 : 7000]);

  const categories = packageType === 'kitchen'
    ? ['refrigerator', 'range', 'dishwasher']
    : ['washer', 'dryer'];

  const categoryLabels = {
    refrigerator: { label: 'Refrigerator', icon: '🧊' },
    range: { label: 'Range / Stove', icon: '🔥' },
    dishwasher: { label: 'Dishwasher', icon: '🍽️' },
    washer: { label: 'Washer', icon: '🧺' },
    dryer: { label: 'Dryer', icon: '♨️' }
  };

  // Handle single filter change
  const handleFilterChange = (category, filterKey, value, isMulti = false) => {
    const newFilters = { ...selectedFilters };

    if (category === 'global') {
      if (filterKey === 'brand') {
        // Brand is always multi-select
        const currentBrands = newFilters.brand || [];
        if (currentBrands.includes(value)) {
          newFilters.brand = currentBrands.filter(b => b !== value);
        } else {
          newFilters.brand = [...currentBrands, value];
        }
        if (newFilters.brand.length === 0) {
          delete newFilters.brand;
        }
      } else {
        // Other global filters (finish, smart)
        if (newFilters[filterKey] === value) {
          delete newFilters[filterKey];
        } else {
          newFilters[filterKey] = value;
        }
      }
    } else {
      // Category-specific filters
      if (!newFilters[category]) {
        newFilters[category] = {};
      }

      if (isMulti) {
        const currentValues = newFilters[category][filterKey] || [];
        if (currentValues.includes(value)) {
          newFilters[category][filterKey] = currentValues.filter(v => v !== value);
        } else {
          newFilters[category][filterKey] = [...currentValues, value];
        }
        if (newFilters[category][filterKey].length === 0) {
          delete newFilters[category][filterKey];
        }
      } else {
        // Single-select: toggle off if same value
        if (newFilters[category][filterKey] === value) {
          delete newFilters[category][filterKey];
        } else {
          newFilters[category][filterKey] = value;
        }
      }

      // Clean up empty category objects
      if (Object.keys(newFilters[category]).length === 0) {
        delete newFilters[category];
      }
    }

    onFilterChange(newFilters);
  };

  // Check if any filters are active
  const hasActiveFilters = () => {
    if (selectedFilters.brand?.length > 0) return true;
    if (selectedFilters.finish) return true;
    for (const cat of categories) {
      if (selectedFilters[cat] && Object.keys(selectedFilters[cat]).length > 0) {
        return true;
      }
    }
    return false;
  };

  // Count total active filters
  const countActiveFilters = () => {
    let count = 0;
    if (selectedFilters.brand) count += selectedFilters.brand.length;
    if (selectedFilters.finish) count++;
    for (const cat of categories) {
      if (selectedFilters[cat]) {
        count += Object.keys(selectedFilters[cat]).length;
      }
    }
    return count;
  };

  const renderFilterOptions = (filterData, category, filterKey) => {
    if (!filterData?.options) return null;

    const isMulti = filterData.type === 'multi' || filterKey === 'brand';

    return filterData.options.map(option => {
      let isSelected = false;

      if (category === 'global' && filterKey === 'brand') {
        isSelected = selectedFilters.brand?.includes(option.value) || false;
      } else if (category === 'global') {
        isSelected = selectedFilters[filterKey] === option.value;
      } else {
        const catFilters = selectedFilters[category] || {};
        if (isMulti) {
          isSelected = catFilters[filterKey]?.includes(option.value) || false;
        } else {
          isSelected = catFilters[filterKey] === option.value;
        }
      }

      return (
        <FilterOption
          key={option.value}
          value={option.value}
          label={option.label}
          count={option.count}
          selected={isSelected}
          type={isMulti ? 'checkbox' : 'radio'}
          disabled={option.count === 0 && !isSelected}
          onChange={(val) => handleFilterChange(category, filterKey, val, isMulti)}
        />
      );
    });
  };

  // Handle preset apply
  const handleApplyPreset = (presetFilters) => {
    onFilterChange(presetFilters);
  };

  // Handle price range change
  const handlePriceRangeChange = (range) => {
    setPriceRange(range);
    if (onPriceRangeChange) {
      onPriceRangeChange(range);
    }
    // Also update filters
    onFilterChange({
      ...selectedFilters,
      price_range: range
    });
  };

  // Filter brands by search
  const getFilteredBrandOptions = () => {
    if (!filterOptions.global?.brand?.options) return [];
    if (!brandSearch.trim()) return filterOptions.global.brand.options;
    const search = brandSearch.toLowerCase();
    return filterOptions.global.brand.options.filter(
      opt => opt.label.toLowerCase().includes(search) || opt.value.toLowerCase().includes(search)
    );
  };

  // Render brand option with logo badge
  const renderBrandOption = (option) => {
    const brandStyle = brandColors[option.value] || { bg: '#6b7280', text: 'white' };
    const isSelected = selectedFilters.brand?.includes(option.value) || false;

    return (
      <div
        key={option.value}
        className={`brand-filter-option ${isSelected ? 'selected' : ''} ${option.count === 0 && !isSelected ? 'disabled' : ''}`}
        onClick={() => option.count > 0 || isSelected ? handleFilterChange('global', 'brand', option.value, true) : null}
      >
        <span
          className="brand-badge"
          style={{ backgroundColor: brandStyle.bg, color: brandStyle.text }}
        >
          {option.value.substring(0, 2).toUpperCase()}
        </span>
        <span className="brand-name">{option.label}</span>
        <span className="brand-count">{option.count}</span>
        {isSelected && <span className="brand-check">✓</span>}
      </div>
    );
  };

  // Render finish option with color swatch
  const renderFinishOption = (option) => {
    const swatch = finishSwatches[option.value.toLowerCase()] || { color: '#ccc', border: '#999' };
    const isSelected = selectedFilters.finish === option.value;

    return (
      <div
        key={option.value}
        className={`finish-filter-option ${isSelected ? 'selected' : ''} ${option.count === 0 && !isSelected ? 'disabled' : ''}`}
        onClick={() => option.count > 0 || isSelected ? handleFilterChange('global', 'finish', option.value, false) : null}
      >
        <span
          className="finish-swatch"
          style={{
            backgroundColor: swatch.color,
            borderColor: swatch.border
          }}
        />
        <span className="finish-name">{option.label}</span>
        <span className="finish-count">{option.count}</span>
        {isSelected && <span className="finish-check">✓</span>}
      </div>
    );
  };

  return (
    <div className={`filter-sidebar ${loading ? 'loading' : ''}`}>
      <div className="filter-sidebar-header">
        <h3>Filters</h3>
        {hasActiveFilters() && (
          <button
            className="clear-filters-btn"
            onClick={onClearFilters}
          >
            Clear All ({countActiveFilters()})
          </button>
        )}
      </div>

      {loading && (
        <div className="filter-loading-overlay">
          <div className="filter-loading-spinner" />
        </div>
      )}

      <div className="filter-sidebar-content">
        {/* Quick Presets */}
        <FilterPresets
          packageType={packageType}
          onApplyPreset={handleApplyPreset}
          currentFilters={selectedFilters}
        />

        {/* Price Range Slider */}
        <FilterSection
          title="Package Price"
          icon="💰"
          defaultExpanded={true}
        >
          <PriceRangeSlider
            min={0}
            max={packageType === 'kitchen' ? 15000 : 7000}
            value={priceRange}
            onChange={handlePriceRangeChange}
            packageType={packageType}
          />
        </FilterSection>

        {/* Global Filters - Brand with Search */}
        {filterOptions.global?.brand && (
          <FilterSection
            title="Brand"
            icon="🏷️"
            defaultExpanded={true}
            badge={selectedFilters.brand?.length || null}
          >
            <div className="brand-search-container">
              <input
                type="text"
                placeholder="Search brands..."
                value={brandSearch}
                onChange={(e) => setBrandSearch(e.target.value)}
                className="brand-search-input"
              />
              {brandSearch && (
                <button
                  className="brand-search-clear"
                  onClick={() => setBrandSearch('')}
                >
                  ×
                </button>
              )}
            </div>
            <div className="brand-filter-list">
              {getFilteredBrandOptions().map(renderBrandOption)}
              {getFilteredBrandOptions().length === 0 && (
                <div className="no-brands-message">No brands match "{brandSearch}"</div>
              )}
            </div>
          </FilterSection>
        )}

        {/* Global Filters - Finish with Swatches */}
        {filterOptions.global?.finish && (
          <FilterSection
            title="Finish"
            icon="✨"
            defaultExpanded={true}
          >
            <div className="finish-filter-list">
              {filterOptions.global.finish.options?.map(renderFinishOption)}
            </div>
          </FilterSection>
        )}

        {/* Category-specific filters */}
        {categories.map(category => {
          const catFilters = filterOptions[category];
          if (!catFilters || Object.keys(catFilters).length === 0) return null;

          const catLabel = categoryLabels[category];
          const activeCount = selectedFilters[category]
            ? Object.keys(selectedFilters[category]).length
            : 0;

          return (
            <FilterSection
              key={category}
              title={catLabel.label}
              icon={catLabel.icon}
              defaultExpanded={activeCount > 0}
              badge={activeCount > 0 ? activeCount : null}
            >
              {Object.entries(catFilters).map(([filterKey, filterData]) => (
                <div key={filterKey} className="filter-group">
                  <div className="filter-group-label">{filterData.label}</div>
                  <div className="filter-options-list">
                    {renderFilterOptions(filterData, category, filterKey)}
                  </div>
                </div>
              ))}
            </FilterSection>
          );
        })}
      </div>
    </div>
  );
};

export default FilterSidebar;
