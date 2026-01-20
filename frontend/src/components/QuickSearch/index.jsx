/**
 * QuickSearch - Universal Product Finder
 *
 * Features:
 * - Full-text search with relevance ranking
 * - Multiple filter options (brand, status, price, stock, attributes)
 * - Quick filter presets (Best Deals, Budget Picks, etc.)
 * - Role-based pricing visibility
 * - Grid/List view toggle
 * - URL-synced filters for shareable searches
 */
import React, { useState, useEffect, useCallback } from 'react';
import SearchBar from './SearchBar';
import FilterPanel from './FilterPanel';
import FilterChips from './FilterChips';
import ProductResultCard from './ProductResultCard';
import ProductResultsList from './ProductResultsList';
import SortDropdown from './SortDropdown';
import { useQuickSearch } from './hooks/useQuickSearch';
import { useFilterState } from './hooks/useFilterState';
import './QuickSearch.css';

const QuickSearch = ({ onAddToQuote, userRole = 'sales' }) => {
  const [viewMode, setViewMode] = useState('grid');
  const [showFilters, setShowFilters] = useState(true);

  // URL-synced filter state
  const {
    filters,
    setFilters,
    updateFilter,
    clearFilters,
    searchQuery,
    setSearchQuery,
    sortBy,
    setSortBy
  } = useFilterState();

  // Search hook
  const {
    products,
    pagination,
    filterOptions,
    presets,
    loading,
    error,
    refresh
  } = useQuickSearch(searchQuery, filters, sortBy, userRole);

  // Handle preset selection
  const handlePresetSelect = useCallback((preset) => {
    setFilters(preset.filters);
    if (preset.filters.sortBy) {
      setSortBy(preset.filters.sortBy);
    }
  }, [setFilters, setSortBy]);

  // Handle page change
  const handlePageChange = useCallback((newPage) => {
    updateFilter('page', newPage);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }, [updateFilter]);

  // Count active filters
  const activeFilterCount = Object.keys(filters).filter(k =>
    filters[k] && (Array.isArray(filters[k]) ? filters[k].length > 0 : true)
  ).length;

  return (
    <div className="quick-search">
      {/* Header */}
      <div className="quick-search-header">
        <div className="quick-search-title">
          <h1>Quick Search</h1>
          <span className="quick-search-subtitle">Find products fast with intelligent filtering</span>
        </div>
        <div className="quick-search-actions">
          <button
            className={`view-toggle ${viewMode === 'grid' ? 'active' : ''}`}
            onClick={() => setViewMode('grid')}
            title="Grid view"
          >
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <rect x="3" y="3" width="7" height="7" />
              <rect x="14" y="3" width="7" height="7" />
              <rect x="3" y="14" width="7" height="7" />
              <rect x="14" y="14" width="7" height="7" />
            </svg>
          </button>
          <button
            className={`view-toggle ${viewMode === 'list' ? 'active' : ''}`}
            onClick={() => setViewMode('list')}
            title="List view"
          >
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <line x1="8" y1="6" x2="21" y2="6" />
              <line x1="8" y1="12" x2="21" y2="12" />
              <line x1="8" y1="18" x2="21" y2="18" />
              <line x1="3" y1="6" x2="3.01" y2="6" />
              <line x1="3" y1="12" x2="3.01" y2="12" />
              <line x1="3" y1="18" x2="3.01" y2="18" />
            </svg>
          </button>
          <button
            className={`filter-toggle ${showFilters ? 'active' : ''}`}
            onClick={() => setShowFilters(!showFilters)}
          >
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <polygon points="22 3 2 3 10 12.46 10 19 14 21 14 12.46 22 3" />
            </svg>
            Filters
            {activeFilterCount > 0 && (
              <span className="filter-count-badge">{activeFilterCount}</span>
            )}
          </button>
        </div>
      </div>

      {/* Search Bar */}
      <SearchBar
        value={searchQuery}
        onChange={setSearchQuery}
        placeholder="Search by model, name, brand, or description..."
        loading={loading}
      />

      {/* Quick Filter Presets */}
      <FilterChips
        presets={presets}
        activePreset={null}
        onSelect={handlePresetSelect}
        activeFilters={filters}
        onClearFilters={clearFilters}
      />

      <div className="quick-search-content">
        {/* Filter Panel */}
        {showFilters && (
          <FilterPanel
            filters={filters}
            filterOptions={filterOptions}
            onFilterChange={updateFilter}
            onClearFilters={clearFilters}
            loading={loading}
            userRole={userRole}
          />
        )}

        {/* Results */}
        <div className={`quick-search-results ${!showFilters ? 'full-width' : ''}`}>
          {/* Results Header */}
          <div className="results-header">
            <div className="results-info">
              {loading ? (
                <span>Searching...</span>
              ) : (
                <span>
                  <strong>{pagination.totalCount.toLocaleString()}</strong> products found
                  {searchQuery && <span className="search-term"> for "{searchQuery}"</span>}
                </span>
              )}
            </div>
            <SortDropdown
              value={sortBy}
              onChange={setSortBy}
              userRole={userRole}
            />
          </div>

          {/* Error State */}
          {error && (
            <div className="search-error">
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <circle cx="12" cy="12" r="10" />
                <line x1="12" y1="8" x2="12" y2="12" />
                <line x1="12" y1="16" x2="12.01" y2="16" />
              </svg>
              <span>{error}</span>
              <button onClick={refresh}>Try Again</button>
            </div>
          )}

          {/* Products */}
          {!error && (
            <ProductResultsList
              products={products}
              loading={loading}
              viewMode={viewMode}
              userRole={userRole}
              onAddToQuote={onAddToQuote}
              pagination={pagination}
              onPageChange={handlePageChange}
            />
          )}
        </div>
      </div>
    </div>
  );
};

export default QuickSearch;
