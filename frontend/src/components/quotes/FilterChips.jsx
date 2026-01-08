/**
 * FilterChips Component
 * Quick filter chips for one-click filtering of quotes
 * Shows dynamic counts that update with data changes
 */

import React, { useState, useEffect, useCallback } from 'react';

const API_URL = process.env.REACT_APP_API_URL || 'http://localhost:3001';

// Filter chip definitions
const FILTER_CHIPS = [
  { id: 'all', label: 'All', countKey: 'all', color: '#6b7280' },
  { id: 'draft', label: 'Draft', countKey: 'draft', color: '#f59e0b', statusValue: 'DRAFT' },
  { id: 'sent', label: 'Sent', countKey: 'sent', color: '#3b82f6', statusValue: 'SENT' },
  { id: 'won', label: 'Won', countKey: 'won', color: '#10b981', statusValue: 'WON' },
  { id: 'lost', label: 'Lost', countKey: 'lost', color: '#ef4444', statusValue: 'LOST' },
  { id: 'pending_approval', label: 'Pending', countKey: 'pending_approval', color: '#8b5cf6', statusValue: 'PENDING_APPROVAL' },
  { id: 'expiring_soon', label: 'Expiring Soon', countKey: 'expiring_soon', color: '#f97316', special: 'expiring' },
  { id: 'high_value', label: 'High Value', countKey: 'high_value', color: '#059669', special: 'highValue' },
  { id: 'recent', label: 'Recent', countKey: 'recent', color: '#6366f1', special: 'recent' },
  { id: 'no_customer', label: 'No Customer', countKey: 'no_customer', color: '#dc2626', special: 'noCustomer' }
];

const FilterChips = ({
  activeFilter,
  onFilterChange,
  onRefreshTrigger,
  statusFilter,
  setStatusFilter,
  expiringFilter,
  setExpiringFilter,
  valueFilter,
  setValueFilter,
  dateFilter,
  setDateFilter,
  customerFilter,
  setCustomerFilter,
  onClearFilters
}) => {
  const [filterCounts, setFilterCounts] = useState({});
  const [loading, setLoading] = useState(true);

  // Fetch filter counts from API
  const fetchFilterCounts = useCallback(async () => {
    try {
      const response = await fetch(`${API_URL}/api/quotations/stats/filter-counts`);
      if (response.ok) {
        const data = await response.json();
        setFilterCounts(data.filterCounts || {});
      }
    } catch (error) {
      console.error('Error fetching filter counts:', error);
    } finally {
      setLoading(false);
    }
  }, []);

  // Initial load and refresh on trigger
  useEffect(() => {
    fetchFilterCounts();
  }, [fetchFilterCounts, onRefreshTrigger]);

  // Determine which chip is active based on current filters
  const getActiveChipId = () => {
    // Check special filters first
    if (expiringFilter) return 'expiring_soon';
    if (valueFilter === '5000+' || valueFilter === '5000-10000' || valueFilter === '10000+') return 'high_value';
    if (dateFilter === 'week') return 'recent';
    if (customerFilter === 'none') return 'no_customer';

    // Check status filter
    if (statusFilter && statusFilter !== 'all') {
      const chip = FILTER_CHIPS.find(c => c.statusValue === statusFilter);
      if (chip) return chip.id;
    }

    return 'all';
  };

  const activeChipId = activeFilter || getActiveChipId();

  // Handle chip click
  const handleChipClick = (chip) => {
    // Clear all filters first
    if (onClearFilters) {
      onClearFilters();
    }

    if (chip.id === 'all') {
      // Reset all filters
      if (setStatusFilter) setStatusFilter('all');
      if (setExpiringFilter) setExpiringFilter(false);
      if (setValueFilter) setValueFilter('all');
      if (setDateFilter) setDateFilter('all');
      if (setCustomerFilter) setCustomerFilter('all');
    } else if (chip.statusValue) {
      // Status-based filter
      if (setStatusFilter) setStatusFilter(chip.statusValue);
      if (setExpiringFilter) setExpiringFilter(false);
      if (setValueFilter) setValueFilter('all');
      if (setDateFilter) setDateFilter('all');
    } else if (chip.special === 'expiring') {
      // Expiring soon filter
      if (setStatusFilter) setStatusFilter('all');
      if (setExpiringFilter) setExpiringFilter(true);
      if (setValueFilter) setValueFilter('all');
    } else if (chip.special === 'highValue') {
      // High value filter (> $5,000)
      if (setStatusFilter) setStatusFilter('all');
      if (setExpiringFilter) setExpiringFilter(false);
      if (setValueFilter) setValueFilter('5000+');
    } else if (chip.special === 'recent') {
      // Recent filter (last 7 days)
      if (setStatusFilter) setStatusFilter('all');
      if (setExpiringFilter) setExpiringFilter(false);
      if (setValueFilter) setValueFilter('all');
      if (setDateFilter) setDateFilter('week');
    } else if (chip.special === 'noCustomer') {
      // No customer filter
      if (setStatusFilter) setStatusFilter('all');
      if (setExpiringFilter) setExpiringFilter(false);
      if (setValueFilter) setValueFilter('all');
      if (setCustomerFilter) setCustomerFilter('none');
    }

    // Notify parent of filter change
    if (onFilterChange) {
      onFilterChange(chip.id);
    }
  };

  return (
    <div style={{
      display: 'flex',
      flexWrap: 'wrap',
      gap: '8px',
      marginBottom: '16px',
      padding: '12px 16px',
      background: '#f8fafc',
      borderRadius: '8px',
      border: '1px solid #e2e8f0'
    }}>
      {FILTER_CHIPS.map((chip) => {
        const count = filterCounts[chip.countKey] || 0;
        const isActive = activeChipId === chip.id;

        return (
          <button
            key={chip.id}
            onClick={() => handleChipClick(chip)}
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: '6px',
              padding: '6px 12px',
              borderRadius: '9999px',
              border: isActive ? `2px solid ${chip.color}` : '1px solid #e2e8f0',
              background: isActive ? `${chip.color}15` : 'white',
              color: isActive ? chip.color : '#64748b',
              fontSize: '13px',
              fontWeight: isActive ? '600' : '500',
              cursor: 'pointer',
              transition: 'all 0.15s ease',
              whiteSpace: 'nowrap'
            }}
            onMouseEnter={(e) => {
              if (!isActive) {
                e.currentTarget.style.background = '#f1f5f9';
                e.currentTarget.style.borderColor = chip.color;
              }
            }}
            onMouseLeave={(e) => {
              if (!isActive) {
                e.currentTarget.style.background = 'white';
                e.currentTarget.style.borderColor = '#e2e8f0';
              }
            }}
          >
            <span>{chip.label}</span>
            <span style={{
              display: 'inline-flex',
              alignItems: 'center',
              justifyContent: 'center',
              minWidth: '20px',
              height: '20px',
              padding: '0 6px',
              borderRadius: '10px',
              background: isActive ? chip.color : '#e2e8f0',
              color: isActive ? 'white' : '#64748b',
              fontSize: '11px',
              fontWeight: '600'
            }}>
              {loading ? '-' : count}
            </span>
          </button>
        );
      })}
    </div>
  );
};

export default FilterChips;
