/**
 * LeadFilters - Sidebar filter component for leads
 */

import React, { useState } from 'react';

const statusOptions = [
  { value: '', label: 'All Statuses' },
  { value: 'new', label: 'New', color: '#3b82f6' },
  { value: 'contacted', label: 'Contacted', color: '#8b5cf6' },
  { value: 'qualified', label: 'Qualified', color: '#10b981' },
  { value: 'quote_created', label: 'Quote Created', color: '#f59e0b' },
  { value: 'converted', label: 'Converted', color: '#22c55e' },
  { value: 'lost', label: 'Lost', color: '#ef4444' }
];

const priorityOptions = [
  { value: '', label: 'All Priorities' },
  { value: 'hot', label: 'Hot', color: '#ef4444' },
  { value: 'warm', label: 'Warm', color: '#f59e0b' },
  { value: 'cold', label: 'Cold', color: '#6b7280' }
];

function LeadFilters({ filters, onFilterChange }) {
  const [searchValue, setSearchValue] = useState(filters.search || '');

  const handleSearchChange = (e) => {
    setSearchValue(e.target.value);
  };

  const handleSearchSubmit = (e) => {
    e.preventDefault();
    onFilterChange({ search: searchValue });
  };

  const handleSearchKeyDown = (e) => {
    if (e.key === 'Enter') {
      onFilterChange({ search: searchValue });
    }
  };

  const handleStatusChange = (status) => {
    onFilterChange({ status: filters.status === status ? '' : status });
  };

  const handlePriorityChange = (priority) => {
    onFilterChange({ priority: filters.priority === priority ? '' : priority });
  };

  const clearFilters = () => {
    setSearchValue('');
    onFilterChange({
      search: '',
      status: '',
      priority: '',
      assignedTo: ''
    });
  };

  const hasActiveFilters = filters.search || filters.status || filters.priority || filters.assignedTo;

  return (
    <div className="lead-filters">
      {/* Filter header */}
      <div className="filter-header">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polygon points="22 3 2 3 10 12.46 10 19 14 21 14 12.46 22 3"/></svg>
        <span>Filters</span>
        {hasActiveFilters && (
          <span className="filter-active-dot" />
        )}
      </div>

      {/* Search */}
      <div className="filter-section">
        <div className="filter-section-title">Search</div>
        <form onSubmit={handleSearchSubmit}>
          <div className="filter-search-wrap">
            <svg className="filter-search-icon" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
            <input
              type="text"
              placeholder="Name, email, phone..."
              value={searchValue}
              onChange={handleSearchChange}
              onKeyDown={handleSearchKeyDown}
              className="filter-search-input"
            />
            {searchValue && (
              <button
                type="button"
                className="filter-search-clear"
                onClick={() => { setSearchValue(''); onFilterChange({ search: '' }); }}
              >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
              </button>
            )}
          </div>
        </form>
      </div>

      {/* Status Filter */}
      <div className="filter-section">
        <div className="filter-section-title">Status</div>
        <div className="filter-options">
          {statusOptions.slice(1).map(option => (
            <div
              key={option.value}
              className={`filter-option ${filters.status === option.value ? 'active' : ''}`}
              onClick={() => handleStatusChange(option.value)}
            >
              <span className="filter-option-dot" style={{ background: option.color }} />
              <span className="filter-option-label">{option.label}</span>
              {filters.status === option.value && (
                <svg className="filter-option-check" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12"/></svg>
              )}
            </div>
          ))}
        </div>
      </div>

      {/* Priority Filter */}
      <div className="filter-section">
        <div className="filter-section-title">Priority</div>
        <div className="filter-options">
          {priorityOptions.slice(1).map(option => (
            <div
              key={option.value}
              className={`filter-option ${filters.priority === option.value ? 'active' : ''}`}
              onClick={() => handlePriorityChange(option.value)}
            >
              <span className="filter-option-dot" style={{ background: option.color }} />
              <span className="filter-option-label">{option.label}</span>
              {filters.priority === option.value && (
                <svg className="filter-option-check" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12"/></svg>
              )}
            </div>
          ))}
        </div>
      </div>

      {/* Clear Filters */}
      {hasActiveFilters && (
        <div className="filter-section">
          <button
            className="btn btn-secondary btn-sm filter-clear-btn"
            onClick={clearFilters}
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
            Clear All Filters
          </button>
        </div>
      )}
    </div>
  );
}

export default LeadFilters;
