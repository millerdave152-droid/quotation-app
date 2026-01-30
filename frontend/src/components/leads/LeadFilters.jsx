/**
 * LeadFilters - Sidebar filter component for leads
 */

import React, { useState } from 'react';

const statusOptions = [
  { value: '', label: 'All Statuses' },
  { value: 'new', label: 'New' },
  { value: 'contacted', label: 'Contacted' },
  { value: 'qualified', label: 'Qualified' },
  { value: 'quote_created', label: 'Quote Created' },
  { value: 'converted', label: 'Converted' },
  { value: 'lost', label: 'Lost' }
];

const priorityOptions = [
  { value: '', label: 'All Priorities' },
  { value: 'hot', label: 'Hot' },
  { value: 'warm', label: 'Warm' },
  { value: 'cold', label: 'Cold' }
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
      {/* Search */}
      <div className="filter-section">
        <div className="filter-section-title">Search</div>
        <form onSubmit={handleSearchSubmit}>
          <input
            type="text"
            placeholder="Name, email, phone..."
            value={searchValue}
            onChange={handleSearchChange}
            onKeyDown={handleSearchKeyDown}
            style={{
              width: '100%',
              padding: '0.625rem',
              border: '1px solid var(--border-color, #d1d5db)',
              borderRadius: '6px',
              fontSize: '0.875rem'
            }}
          />
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
              <span className={`status-badge status-${option.value}`} style={{ fontSize: '0.7rem' }}>
                {option.label}
              </span>
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
              <span className={`priority-badge priority-${option.value}`}>
                {option.label}
              </span>
            </div>
          ))}
        </div>
      </div>

      {/* Clear Filters */}
      {hasActiveFilters && (
        <div className="filter-section">
          <button
            className="btn btn-secondary btn-sm"
            onClick={clearFilters}
            style={{ width: '100%' }}
          >
            Clear All Filters
          </button>
        </div>
      )}
    </div>
  );
}

export default LeadFilters;
