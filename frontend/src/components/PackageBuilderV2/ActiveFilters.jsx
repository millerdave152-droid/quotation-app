/**
 * ActiveFilters - Display active filter chips
 * Shows all currently selected filters with remove buttons
 */
import React from 'react';
import './ActiveFilters.css';

const ActiveFilters = ({
  selectedFilters = {},
  filterOptions = {},
  onRemoveFilter,
  onClearAll
}) => {
  const categoryLabels = {
    refrigerator: 'Fridge',
    range: 'Range',
    dishwasher: 'Dishwasher',
    washer: 'Washer',
    dryer: 'Dryer'
  };

  // Build array of active filter chips
  const getActiveChips = () => {
    const chips = [];

    // Brand filters
    if (selectedFilters.brand?.length > 0) {
      selectedFilters.brand.forEach(brand => {
        chips.push({
          id: `brand-${brand}`,
          category: 'global',
          filterKey: 'brand',
          value: brand,
          label: brand,
          prefix: 'Brand'
        });
      });
    }

    // Finish filter
    if (selectedFilters.finish) {
      const finishOption = filterOptions.global?.finish?.options?.find(
        o => o.value === selectedFilters.finish
      );
      chips.push({
        id: `finish-${selectedFilters.finish}`,
        category: 'global',
        filterKey: 'finish',
        value: selectedFilters.finish,
        label: finishOption?.label || selectedFilters.finish,
        prefix: 'Finish'
      });
    }

    // Category-specific filters
    const categories = ['refrigerator', 'range', 'dishwasher', 'washer', 'dryer'];
    for (const category of categories) {
      const catFilters = selectedFilters[category];
      if (!catFilters) continue;

      for (const [filterKey, filterValue] of Object.entries(catFilters)) {
        const filterDef = filterOptions[category]?.[filterKey];

        if (Array.isArray(filterValue)) {
          // Multi-select filters
          filterValue.forEach(val => {
            const option = filterDef?.options?.find(o => o.value === val);
            chips.push({
              id: `${category}-${filterKey}-${val}`,
              category,
              filterKey,
              value: val,
              label: option?.label || val,
              prefix: `${categoryLabels[category] || category}: ${filterDef?.label || filterKey}`
            });
          });
        } else {
          // Single-select filters
          const option = filterDef?.options?.find(o => o.value === filterValue);
          chips.push({
            id: `${category}-${filterKey}-${filterValue}`,
            category,
            filterKey,
            value: filterValue,
            label: option?.label || filterValue,
            prefix: `${categoryLabels[category] || category}: ${filterDef?.label || filterKey}`
          });
        }
      }
    }

    return chips;
  };

  const chips = getActiveChips();

  if (chips.length === 0) {
    return null;
  }

  const handleRemove = (chip) => {
    onRemoveFilter(chip.category, chip.filterKey, chip.value);
  };

  return (
    <div className="active-filters">
      <div className="active-filters-label">Active Filters:</div>
      <div className="active-filters-chips">
        {chips.map(chip => (
          <div key={chip.id} className="filter-chip">
            <span className="filter-chip-prefix">{chip.prefix}:</span>
            <span className="filter-chip-value">{chip.label}</span>
            <button
              className="filter-chip-remove"
              onClick={() => handleRemove(chip)}
              aria-label={`Remove ${chip.label} filter`}
            >
              &times;
            </button>
          </div>
        ))}
      </div>
      {chips.length > 1 && (
        <button className="clear-all-btn" onClick={onClearAll}>
          Clear All
        </button>
      )}
    </div>
  );
};

export default ActiveFilters;
