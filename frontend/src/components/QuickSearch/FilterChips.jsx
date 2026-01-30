/**
 * FilterChips - Quick filter preset chips
 */
import React from 'react';

// Preset icons
const presetIcons = {
  tag: (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M20.59 13.41l-7.17 7.17a2 2 0 0 1-2.83 0L2 12V2h10l8.59 8.59a2 2 0 0 1 0 2.82z" />
      <line x1="7" y1="7" x2="7.01" y2="7" />
    </svg>
  ),
  dollar: (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <line x1="12" y1="1" x2="12" y2="23" />
      <path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6" />
    </svg>
  ),
  sparkles: (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M12 3l1.5 4.5L18 9l-4.5 1.5L12 15l-1.5-4.5L6 9l4.5-1.5L12 3z" />
      <path d="M5 19l1 3 1-3 3-1-3-1-1-3-1 3-3 1 3 1z" />
    </svg>
  ),
  clock: (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <circle cx="12" cy="12" r="10" />
      <polyline points="12 6 12 12 16 14" />
    </svg>
  ),
  trending: (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <polyline points="23 6 13.5 15.5 8.5 10.5 1 18" />
      <polyline points="17 6 23 6 23 12" />
    </svg>
  ),
  leaf: (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M6.5 21.5C4 19 2 15 2 11c0-4 5-9 10-9 7 2 10 7 10 12 0 5-4 8-10 9" />
      <path d="M9 18c0-6 8-10 8-10" />
    </svg>
  ),
  wifi: (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M5 12.55a11 11 0 0 1 14.08 0" />
      <path d="M1.42 9a16 16 0 0 1 21.16 0" />
      <path d="M8.53 16.11a6 6 0 0 1 6.95 0" />
      <line x1="12" y1="20" x2="12.01" y2="20" />
    </svg>
  )
};

const FilterChips = ({
  presets = [],
  activePreset = null,
  onSelect,
  activeFilters = {},
  onClearFilters
}) => {
  // Check if any filters are active
  const hasActiveFilters = Object.keys(activeFilters).some(k =>
    activeFilters[k] && (Array.isArray(activeFilters[k]) ? activeFilters[k].length > 0 : true)
  );

  // Check if a preset matches current filters
  const isPresetActive = (preset) => {
    if (!preset.filters) return false;

    const presetFilters = preset.filters;
    const currentFilters = activeFilters;

    // Check if all preset filters match current filters
    for (const key of Object.keys(presetFilters)) {
      if (key === 'sortBy') continue; // Sort is handled separately

      const presetValue = presetFilters[key];
      const currentValue = currentFilters[key];

      if (Array.isArray(presetValue)) {
        if (!Array.isArray(currentValue)) return false;
        if (presetValue.length !== currentValue.length) return false;
        if (!presetValue.every(v => currentValue.includes(v))) return false;
      } else {
        if (presetValue !== currentValue) return false;
      }
    }

    return true;
  };

  return (
    <div className="filter-chips">
      {presets.map(preset => (
        <button
          key={preset.id}
          className={`filter-chip ${isPresetActive(preset) ? 'active' : ''}`}
          onClick={() => onSelect(preset)}
          title={preset.description}
        >
          <span className="chip-icon">
            {presetIcons[preset.icon] || presetIcons.tag}
          </span>
          {preset.label}
        </button>
      ))}

      {hasActiveFilters && (
        <button
          className="clear-filters-btn"
          onClick={onClearFilters}
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <line x1="18" y1="6" x2="6" y2="18" />
            <line x1="6" y1="6" x2="18" y2="18" />
          </svg>
          Clear Filters
        </button>
      )}
    </div>
  );
};

export default FilterChips;
