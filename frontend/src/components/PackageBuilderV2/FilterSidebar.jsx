/**
 * FilterSidebar - Left panel with all filter categories
 * Shows filter counts and updates in real-time
 */
import React from 'react';
import FilterSection from './FilterSection';
import FilterOption from './FilterOption';
import './FilterSidebar.css';

const FilterSidebar = ({
  packageType = 'kitchen',
  filterOptions = {},
  selectedFilters = {},
  onFilterChange,
  onClearFilters,
  loading = false
}) => {
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
        {/* Global Filters - Brand */}
        {filterOptions.global?.brand && (
          <FilterSection
            title="Brand"
            icon="🏷️"
            defaultExpanded={true}
            badge={selectedFilters.brand?.length || null}
          >
            <div className="filter-options-list">
              {renderFilterOptions(filterOptions.global.brand, 'global', 'brand')}
            </div>
          </FilterSection>
        )}

        {/* Global Filters - Finish */}
        {filterOptions.global?.finish && (
          <FilterSection
            title="Finish"
            icon="✨"
            defaultExpanded={true}
          >
            <div className="filter-options-list">
              {renderFilterOptions(filterOptions.global.finish, 'global', 'finish')}
            </div>
          </FilterSection>
        )}

        {/* Price Range (if implemented) */}
        {filterOptions.global?.price_range && (
          <FilterSection
            title="Package Price"
            icon="💰"
            defaultExpanded={false}
          >
            <div className="filter-options-list">
              {renderFilterOptions(filterOptions.global.price_range, 'global', 'price_range')}
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
