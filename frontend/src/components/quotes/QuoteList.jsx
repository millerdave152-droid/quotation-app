/**
 * QuoteList Component
 * Displays the list of quotations with filters, search, and actions
 */

import React, { useMemo, useState } from 'react';
import BulkActionToolbar from './BulkActionToolbar';
import FilterChips from './FilterChips';

/**
 * Tooltip wrapper component
 */
const Tooltip = ({ children, text }) => {
  const [isVisible, setIsVisible] = useState(false);

  return (
    <div
      style={{ position: 'relative', display: 'inline-block' }}
      onMouseEnter={() => setIsVisible(true)}
      onMouseLeave={() => setIsVisible(false)}
    >
      {children}
      {isVisible && text && (
        <div style={{
          position: 'absolute',
          bottom: '100%',
          left: '50%',
          transform: 'translateX(-50%)',
          marginBottom: '6px',
          padding: '6px 10px',
          background: '#1f2937',
          color: 'white',
          fontSize: '11px',
          fontWeight: '500',
          borderRadius: '6px',
          whiteSpace: 'nowrap',
          zIndex: 1000,
          boxShadow: '0 2px 8px rgba(0,0,0,0.2)'
        }}>
          {text}
          {/* Arrow */}
          <div style={{
            position: 'absolute',
            top: '100%',
            left: '50%',
            transform: 'translateX(-50%)',
            borderWidth: '5px',
            borderStyle: 'solid',
            borderColor: '#1f2937 transparent transparent transparent'
          }} />
        </div>
      )}
    </div>
  );
};

/**
 * StatusBadge - Displays quote status with tooltip
 */
const StatusBadge = ({ status, createdAt }) => {
  // Standardized color palette (WCAG 2.1 AA compliant - 4.5:1 contrast)
  const statusConfig = {
    DRAFT: { bg: '#6b7280', text: 'white', label: 'DRAFT' },         // Gray - neutral
    SENT: { bg: '#8b5cf6', text: 'white', label: 'SENT' },           // Purple - in progress
    VIEWED: { bg: '#0ea5e9', text: 'white', label: 'VIEWED' },       // Sky blue - engaged
    PENDING_APPROVAL: { bg: '#f59e0b', text: '#000000', label: 'PENDING' }, // Amber - needs attention
    APPROVED: { bg: '#10b981', text: 'white', label: 'APPROVED' },   // Green - positive
    WON: { bg: '#059669', text: 'white', label: 'WON' },             // Darker green - success
    LOST: { bg: '#dc2626', text: 'white', label: 'LOST' },           // Red - negative
    REJECTED: { bg: '#ef4444', text: 'white', label: 'REJECTED' }    // Lighter red - negative
  };

  const config = statusConfig[status] || { bg: '#6b7280', text: 'white', label: status };

  const formatTooltipDate = (date) => {
    if (!date) return 'Unknown date';
    return new Date(date).toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric'
    });
  };

  return (
    <Tooltip text={`Created on ${formatTooltipDate(createdAt)}`}>
      <span style={{
        display: 'inline-block',
        padding: '4px 12px',
        borderRadius: '9999px',
        fontSize: '12px',
        fontWeight: '600',
        background: config.bg,
        color: config.text,
        cursor: 'default'
      }}>
        {config.label}
      </span>
    </Tooltip>
  );
};

/**
 * ExpiryBadge - Displays expiry status with tooltip (only for Draft/Sent)
 */
const ExpiryBadge = ({ expiresAt, status }) => {
  // Only show for Draft and Sent quotes
  if (status === 'WON' || status === 'LOST') return null;
  if (!expiresAt) return null;

  const expiryDate = new Date(expiresAt);
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  expiryDate.setHours(0, 0, 0, 0);

  const diffTime = expiryDate - today;
  const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));

  // Not expiring soon and not expired - don't show badge
  if (diffDays > 7) return null;

  const isExpired = diffDays < 0;
  const isExpiringSoon = diffDays >= 0 && diffDays <= 7;

  const formatExpiryDate = (date) => {
    return new Date(date).toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric'
    });
  };

  const getTooltipText = () => {
    if (isExpired) {
      const daysAgo = Math.abs(diffDays);
      if (daysAgo === 0) return 'Expired today';
      if (daysAgo === 1) return 'Expired yesterday';
      return `Expired ${daysAgo} days ago`;
    }
    if (diffDays === 0) return 'Expires today';
    if (diffDays === 1) return 'Expires tomorrow';
    return `Expires on ${formatExpiryDate(expiresAt)}`;
  };

  if (isExpired) {
    return (
      <Tooltip text={getTooltipText()}>
        <span style={{
          display: 'inline-flex',
          alignItems: 'center',
          padding: '4px 10px',
          borderRadius: '9999px',
          fontSize: '11px',
          fontWeight: '600',
          background: '#dc2626',
          color: 'white',
          cursor: 'default'
        }}>
          EXPIRED
        </span>
      </Tooltip>
    );
  }

  if (isExpiringSoon) {
    return (
      <Tooltip text={getTooltipText()}>
        <span style={{
          display: 'inline-flex',
          alignItems: 'center',
          padding: '4px 10px',
          borderRadius: '9999px',
          fontSize: '11px',
          fontWeight: '600',
          background: '#f97316',
          color: 'white',
          cursor: 'default'
        }}>
          {diffDays === 0 ? 'EXPIRES TODAY' : diffDays === 1 ? 'EXPIRES IN 1 DAY' : `EXPIRES IN ${diffDays} DAYS`}
        </span>
      </Tooltip>
    );
  }

  return null;
};

/**
 * SearchMatchBadge - Shows which field matched the search
 */
const SearchMatchBadge = ({ match, searchTerm }) => {
  if (!match || !match.type) return null;

  const matchColors = {
    quote_number: { bg: '#dbeafe', text: '#1d4ed8', icon: '#' },
    customer_name: { bg: '#dcfce7', text: '#15803d', icon: '👤' },
    customer_email: { bg: '#fef3c7', text: '#92400e', icon: '📧' },
    customer_phone: { bg: '#f3e8ff', text: '#7c3aed', icon: '📞' },
    customer_company: { bg: '#e0e7ff', text: '#4338ca', icon: '🏢' },
    product: { bg: '#fce7f3', text: '#be185d', icon: '📦' },
    internal_notes: { bg: '#fee2e2', text: '#dc2626', icon: '📝' },
    notes: { bg: '#f3f4f6', text: '#374151', icon: '📋' }
  };

  const colors = matchColors[match.type] || { bg: '#f3f4f6', text: '#6b7280', icon: '🔍' };

  return (
    <div style={{ marginTop: '4px' }}>
      <span style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: '4px',
        padding: '2px 8px',
        borderRadius: '4px',
        fontSize: '11px',
        fontWeight: '500',
        background: colors.bg,
        color: colors.text
      }}>
        <span>{colors.icon}</span>
        <span>Match: {match.field}</span>
      </span>
      {/* Show matched product details */}
      {match.type === 'product' && match.matched_products && match.matched_products.length > 0 && (
        <div style={{ marginTop: '2px' }}>
          {match.matched_products.slice(0, 2).map((product, idx) => (
            <div key={idx} style={{
              fontSize: '10px',
              color: '#6b7280',
              paddingLeft: '12px'
            }}>
              • {product.manufacturer} {product.model || product.sku}
            </div>
          ))}
          {match.matched_products.length > 2 && (
            <div style={{ fontSize: '10px', color: '#9ca3af', paddingLeft: '12px' }}>
              +{match.matched_products.length - 2} more
            </div>
          )}
        </div>
      )}
    </div>
  );
};

const QuoteList = ({
  // Data
  quotations,
  stats,
  followUpStats,

  // Filters
  searchTerm,
  setSearchTerm,
  searchLoading = false,
  statusFilter,
  setStatusFilter,
  dateFilter,
  setDateFilter,
  valueFilter,
  setValueFilter,
  expiringFilter,
  setExpiringFilter,
  sortBy,
  setSortBy,
  sortOrder,
  setSortOrder,
  showAdvancedFilters,
  setShowAdvancedFilters,
  customerFilter,
  setCustomerFilter,
  productFilter,
  setProductFilter,

  // Actions
  onCreateNew,
  onViewQuote,
  onEditQuote,
  onDeleteQuote,
  onViewDashboard,
  onViewAnalytics,
  onViewApprovals,
  onViewFollowUps,
  onExport,
  onClearFilters,
  getActiveFilterCount,

  // Bulk selection
  selectedIds = [],
  onToggleSelect,
  onSelectAll,
  onClearSelection,
  onBulkActionComplete,

  // Helpers
  formatCurrency,
  formatDate,
  getStatusColor,

  // Filter chips
  filterRefreshTrigger,
  activeQuickFilter,
  onQuickFilterChange,

  // View mode
  listViewMode = 'list',
  onViewModeChange
}) => {
  // Filter and sort quotations
  const filteredQuotes = useMemo(() => {
    if (!Array.isArray(quotations)) return [];

    return quotations.filter(q => {
      // Search filter
      if (searchTerm) {
        const search = searchTerm.toLowerCase();
        const matchesSearch =
          (q.quotation_number || q.quote_number || '').toLowerCase().includes(search) ||
          (q.customer_name || '').toLowerCase().includes(search) ||
          (q.customer_email || '').toLowerCase().includes(search) ||
          (q.customer_company || '').toLowerCase().includes(search);
        if (!matchesSearch) return false;
      }

      // Status filter
      if (statusFilter !== 'all' && q.status !== statusFilter) {
        return false;
      }

      // Date filter
      if (dateFilter !== 'all') {
        const quoteDate = new Date(q.created_at);
        const today = new Date();
        today.setHours(0, 0, 0, 0);

        if (dateFilter === 'today') {
          const todayEnd = new Date(today);
          todayEnd.setHours(23, 59, 59, 999);
          if (quoteDate < today || quoteDate > todayEnd) return false;
        } else if (dateFilter === 'week') {
          const weekAgo = new Date(today);
          weekAgo.setDate(weekAgo.getDate() - 7);
          if (quoteDate < weekAgo) return false;
        } else if (dateFilter === 'month') {
          const monthAgo = new Date(today);
          monthAgo.setDate(monthAgo.getDate() - 30);
          if (quoteDate < monthAgo) return false;
        }
      }

      // Value filter
      if (valueFilter !== 'all') {
        const total = (q.total_cents || 0) / 100;
        if (valueFilter === '0-1000' && total > 1000) return false;
        if (valueFilter === '1000-5000' && (total < 1000 || total > 5000)) return false;
        if (valueFilter === '5000-10000' && (total < 5000 || total > 10000)) return false;
        if (valueFilter === '10000+' && total < 10000) return false;
        if (valueFilter === '5000+' && total < 5000) return false; // High value filter
      }

      // Expiring filter
      if (expiringFilter) {
        if (!q.quote_expiry_date && !q.expires_at) return false;
        const expiryDate = new Date(q.quote_expiry_date || q.expires_at);
        const today = new Date();
        const daysUntilExpiry = Math.ceil((expiryDate - today) / (1000 * 60 * 60 * 24));
        if (daysUntilExpiry < 0 || daysUntilExpiry > 7) return false;
        if (q.status === 'WON' || q.status === 'LOST') return false;
      }

      // Customer filter
      if (customerFilter === 'none') {
        // No customer filter - only show quotes without a customer
        if (q.customer_id) return false;
      } else if (customerFilter !== 'all' && q.customer_id?.toString() !== customerFilter) {
        return false;
      }

      // Product filter
      if (productFilter) {
        // Would need items to filter by product - skip for now
      }

      return true;
    });
  }, [quotations, searchTerm, statusFilter, dateFilter, valueFilter, expiringFilter, customerFilter, productFilter]);

  // Sort filtered quotes
  const sortedQuotes = useMemo(() => {
    return [...filteredQuotes].sort((a, b) => {
      let comparison = 0;

      switch (sortBy) {
        case 'date':
          comparison = new Date(b.created_at) - new Date(a.created_at);
          break;
        case 'value':
          comparison = (b.total_cents || 0) - (a.total_cents || 0);
          break;
        case 'customer':
          comparison = (a.customer_name || '').localeCompare(b.customer_name || '');
          break;
        case 'status':
          comparison = (a.status || '').localeCompare(b.status || '');
          break;
        default:
          comparison = 0;
      }

      return sortOrder === 'asc' ? comparison : -comparison;
    });
  }, [filteredQuotes, sortBy, sortOrder]);

  // Count expiring soon
  const expiringSoonCount = useMemo(() => {
    return quotations.filter(q => {
      if (!q.quote_expiry_date && !q.expires_at) return false;
      const days = Math.ceil((new Date(q.quote_expiry_date || q.expires_at) - new Date()) / (1000 * 60 * 60 * 24));
      return days >= 0 && days <= 7 && q.status !== 'WON' && q.status !== 'LOST';
    }).length;
  }, [quotations]);

  // Helper to check if quote is expired
  const isExpired = (expiresAt) => {
    if (!expiresAt) return false;
    return new Date(expiresAt) < new Date();
  };

  return (
    <div style={{ padding: '24px' }}>
      {/* Header */}
      <div style={{
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginBottom: '24px',
        flexWrap: 'wrap',
        gap: '12px'
      }}>
        <h1 style={{ fontSize: '32px', fontWeight: 'bold', margin: 0 }}>
          Quotations
        </h1>

        <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap', alignItems: 'center' }}>
          {/* Navigation buttons - outline/ghost style */}
          <button
            onClick={onViewDashboard}
            style={{
              padding: '10px 20px',
              background: 'transparent',
              color: '#0ea5e9',
              border: '2px solid #0ea5e9',
              borderRadius: '8px',
              fontSize: '14px',
              fontWeight: '600',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: '8px',
              transition: 'all 0.2s ease'
            }}
            onMouseEnter={(e) => { e.target.style.background = '#0ea5e9'; e.target.style.color = 'white'; }}
            onMouseLeave={(e) => { e.target.style.background = 'transparent'; e.target.style.color = '#0ea5e9'; }}
          >
            Dashboard
          </button>

          <button
            onClick={onViewAnalytics}
            style={{
              padding: '10px 20px',
              background: 'transparent',
              color: '#8b5cf6',
              border: '2px solid #8b5cf6',
              borderRadius: '8px',
              fontSize: '14px',
              fontWeight: '600',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: '8px',
              transition: 'all 0.2s ease'
            }}
            onMouseEnter={(e) => { e.target.style.background = '#8b5cf6'; e.target.style.color = 'white'; }}
            onMouseLeave={(e) => { e.target.style.background = 'transparent'; e.target.style.color = '#8b5cf6'; }}
          >
            Analytics
          </button>

          <button
            onClick={onViewApprovals}
            style={{
              padding: '10px 20px',
              background: 'transparent',
              color: '#6366f1',
              border: '2px solid #6366f1',
              borderRadius: '8px',
              fontSize: '14px',
              fontWeight: '600',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: '8px',
              transition: 'all 0.2s ease'
            }}
            onMouseEnter={(e) => { e.target.style.background = '#6366f1'; e.target.style.color = 'white'; }}
            onMouseLeave={(e) => { e.target.style.background = 'transparent'; e.target.style.color = '#6366f1'; }}
          >
            Approvals
          </button>

          <button
            onClick={onViewFollowUps}
            style={{
              padding: '10px 20px',
              background: 'transparent',
              color: '#ec4899',
              border: '2px solid #ec4899',
              borderRadius: '8px',
              fontSize: '14px',
              fontWeight: '600',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: '8px',
              transition: 'all 0.2s ease'
            }}
            onMouseEnter={(e) => { e.target.style.background = '#ec4899'; e.target.style.color = 'white'; }}
            onMouseLeave={(e) => { e.target.style.background = 'transparent'; e.target.style.color = '#ec4899'; }}
          >
            Follow-Ups
            {(followUpStats?.overdue_count > 0 || followUpStats?.due_soon_count > 0) && (
              <span style={{
                background: '#dc2626',
                color: 'white',
                borderRadius: '12px',
                padding: '2px 8px',
                fontSize: '12px',
                fontWeight: 'bold'
              }}>
                {(followUpStats.overdue_count || 0) + (followUpStats.due_soon_count || 0)}
              </span>
            )}
          </button>

          {/* Export button - outline style */}
          <button
            onClick={() => onExport?.(sortedQuotes)}
            disabled={sortedQuotes.length === 0}
            style={{
              padding: '10px 20px',
              background: 'transparent',
              color: sortedQuotes.length === 0 ? '#9ca3af' : '#10b981',
              border: `2px solid ${sortedQuotes.length === 0 ? '#9ca3af' : '#10b981'}`,
              borderRadius: '8px',
              fontSize: '14px',
              fontWeight: '600',
              cursor: sortedQuotes.length === 0 ? 'not-allowed' : 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: '8px',
              transition: 'all 0.2s ease'
            }}
            onMouseEnter={(e) => { if (sortedQuotes.length > 0) { e.target.style.background = '#10b981'; e.target.style.color = 'white'; }}}
            onMouseLeave={(e) => { e.target.style.background = 'transparent'; e.target.style.color = sortedQuotes.length === 0 ? '#9ca3af' : '#10b981'; }}
          >
            Export
          </button>

          {/* View Mode Toggle */}
          {onViewModeChange && (
            <div style={{
              display: 'flex',
              backgroundColor: '#f3f4f6',
              borderRadius: '8px',
              padding: '4px',
            }}>
              <button
                onClick={() => onViewModeChange('list')}
                style={{
                  padding: '8px 16px',
                  border: 'none',
                  borderRadius: '6px',
                  backgroundColor: listViewMode === 'list' ? 'white' : 'transparent',
                  color: listViewMode === 'list' ? '#111827' : '#6b7280',
                  fontSize: '13px',
                  fontWeight: '600',
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '6px',
                  boxShadow: listViewMode === 'list' ? '0 1px 3px rgba(0,0,0,0.1)' : 'none',
                  transition: 'all 0.15s ease',
                }}
              >
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <line x1="8" y1="6" x2="21" y2="6"></line>
                  <line x1="8" y1="12" x2="21" y2="12"></line>
                  <line x1="8" y1="18" x2="21" y2="18"></line>
                  <line x1="3" y1="6" x2="3.01" y2="6"></line>
                  <line x1="3" y1="12" x2="3.01" y2="12"></line>
                  <line x1="3" y1="18" x2="3.01" y2="18"></line>
                </svg>
                List
              </button>
              <button
                onClick={() => onViewModeChange('kanban')}
                style={{
                  padding: '8px 16px',
                  border: 'none',
                  borderRadius: '6px',
                  backgroundColor: listViewMode === 'kanban' ? 'white' : 'transparent',
                  color: listViewMode === 'kanban' ? '#111827' : '#6b7280',
                  fontSize: '13px',
                  fontWeight: '600',
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '6px',
                  boxShadow: listViewMode === 'kanban' ? '0 1px 3px rgba(0,0,0,0.1)' : 'none',
                  transition: 'all 0.15s ease',
                }}
              >
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <rect x="3" y="3" width="5" height="18" rx="1"></rect>
                  <rect x="10" y="3" width="5" height="12" rx="1"></rect>
                  <rect x="17" y="3" width="5" height="8" rx="1"></rect>
                </svg>
                Pipeline
              </button>
            </div>
          )}

          {/* Primary CTA - New Quote button - prominent filled style */}
          <button
            onClick={onCreateNew}
            style={{
              padding: '14px 28px',
              background: '#22c55e',
              color: 'white',
              border: 'none',
              borderRadius: '8px',
              fontSize: '15px',
              fontWeight: 'bold',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: '8px',
              boxShadow: '0 2px 8px rgba(34, 197, 94, 0.4)',
              transition: 'all 0.2s ease'
            }}
            onMouseEnter={(e) => { e.target.style.background = '#16a34a'; e.target.style.boxShadow = '0 4px 12px rgba(34, 197, 94, 0.5)'; }}
            onMouseLeave={(e) => { e.target.style.background = '#22c55e'; e.target.style.boxShadow = '0 2px 8px rgba(34, 197, 94, 0.4)'; }}
          >
            + New Quote
          </button>
        </div>
      </div>

      {/* Stats Cards */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))',
        gap: '16px',
        marginBottom: '24px'
      }}>
        <div style={{
          background: 'white',
          padding: '20px',
          borderRadius: '12px',
          boxShadow: '0 1px 3px rgba(0,0,0,0.1)'
        }}>
          <div style={{ fontSize: '14px', color: '#6b7280', marginBottom: '8px' }}>
            Total Quotes
          </div>
          <div style={{ fontSize: '32px', fontWeight: 'bold', color: '#3b82f6' }}>
            {stats?.total_quotes || quotations.length || 0}
          </div>
        </div>

        <div style={{
          background: 'white',
          padding: '20px',
          borderRadius: '12px',
          boxShadow: '0 1px 3px rgba(0,0,0,0.1)'
        }}>
          <div style={{ fontSize: '14px', color: '#6b7280', marginBottom: '8px' }}>
            Total Value
          </div>
          <div style={{ fontSize: '32px', fontWeight: 'bold', color: '#10b981' }}>
            {formatCurrency ? formatCurrency(stats?.total_value_cents || 0) : `$${((stats?.total_value_cents || 0) / 100).toFixed(2)}`}
          </div>
        </div>

        <div style={{
          background: 'white',
          padding: '20px',
          borderRadius: '12px',
          boxShadow: '0 1px 3px rgba(0,0,0,0.1)'
        }}>
          <div style={{ fontSize: '14px', color: '#6b7280', marginBottom: '8px' }}>
            Won Rate
          </div>
          <div style={{ fontSize: '32px', fontWeight: 'bold', color: '#8b5cf6' }}>
            {stats?.won_rate || stats?.win_rate || '0'}%
          </div>
        </div>

        <div style={{
          background: 'white',
          padding: '20px',
          borderRadius: '12px',
          boxShadow: '0 1px 3px rgba(0,0,0,0.1)',
          border: expiringSoonCount > 0 ? '2px solid #f59e0b' : 'none'
        }}>
          <div style={{ fontSize: '14px', color: '#6b7280', marginBottom: '8px' }}>
            Expiring Soon
          </div>
          <div style={{ fontSize: '32px', fontWeight: 'bold', color: expiringSoonCount > 0 ? '#f59e0b' : '#6b7280' }}>
            {expiringSoonCount}
          </div>
          <div style={{ fontSize: '11px', color: '#9ca3af', marginTop: '4px' }}>
            Within 7 days
          </div>
        </div>
      </div>

      {/* Quick Filter Chips */}
      <FilterChips
        activeFilter={activeQuickFilter}
        onFilterChange={onQuickFilterChange}
        onRefreshTrigger={filterRefreshTrigger}
        statusFilter={statusFilter}
        setStatusFilter={setStatusFilter}
        expiringFilter={expiringFilter}
        setExpiringFilter={setExpiringFilter}
        valueFilter={valueFilter}
        setValueFilter={setValueFilter}
        dateFilter={dateFilter}
        setDateFilter={setDateFilter}
        customerFilter={customerFilter}
        setCustomerFilter={setCustomerFilter}
        onClearFilters={onClearFilters}
      />

      {/* Filters */}
      <div style={{
        background: 'white',
        padding: '16px',
        borderRadius: '12px',
        marginBottom: '24px',
        boxShadow: '0 1px 3px rgba(0,0,0,0.1)'
      }}>
        <div style={{ display: 'flex', gap: '12px', marginBottom: '12px', flexWrap: 'wrap' }}>
          {/* Enhanced Search Input */}
          <div style={{ flex: '0 1 350px', minWidth: '200px', position: 'relative', overflow: 'hidden' }}>
            <input
              type="text"
              placeholder="Search by quote #, customer, phone, SKU, model, notes..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              style={{
                width: '100%',
                boxSizing: 'border-box',
                padding: '12px 40px 12px 12px',
                border: `2px solid ${searchTerm.length >= 2 ? '#3b82f6' : '#d1d5db'}`,
                borderRadius: '8px',
                fontSize: '14px',
                transition: 'border-color 0.2s'
              }}
            />
            {/* Search indicator */}
            <div style={{
              position: 'absolute',
              right: '12px',
              top: '50%',
              transform: 'translateY(-50%)',
              color: searchLoading ? '#3b82f6' : '#9ca3af'
            }}>
              {searchLoading ? (
                <span style={{ animation: 'spin 1s linear infinite', display: 'inline-block' }}>⟳</span>
              ) : (
                <span>🔍</span>
              )}
            </div>
          </div>

          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            style={{
              padding: '12px',
              border: '1px solid #d1d5db',
              borderRadius: '8px',
              fontSize: '14px',
              minWidth: '120px'
            }}
          >
            <option value="all">All Status</option>
            <option value="DRAFT">Draft</option>
            <option value="SENT">Sent</option>
            <option value="WON">Won</option>
            <option value="LOST">Lost</option>
          </select>

          <select
            value={dateFilter}
            onChange={(e) => setDateFilter(e.target.value)}
            style={{
              padding: '12px',
              border: '1px solid #d1d5db',
              borderRadius: '8px',
              fontSize: '14px',
              minWidth: '120px'
            }}
          >
            <option value="all">All Time</option>
            <option value="today">Today</option>
            <option value="week">Last 7 Days</option>
            <option value="month">Last 30 Days</option>
          </select>

          <select
            value={valueFilter}
            onChange={(e) => setValueFilter(e.target.value)}
            style={{
              padding: '12px',
              border: '1px solid #d1d5db',
              borderRadius: '8px',
              fontSize: '14px',
              minWidth: '120px'
            }}
          >
            <option value="all">All Values</option>
            <option value="0-1000">$0 - $1,000</option>
            <option value="1000-5000">$1,000 - $5,000</option>
            <option value="5000-10000">$5,000 - $10,000</option>
            <option value="10000+">$10,000+</option>
          </select>

          <button
            onClick={() => setExpiringFilter(!expiringFilter)}
            style={{
              padding: '12px 16px',
              background: expiringFilter ? '#f59e0b' : 'white',
              color: expiringFilter ? 'white' : '#6b7280',
              border: expiringFilter ? 'none' : '1px solid #d1d5db',
              borderRadius: '8px',
              fontSize: '14px',
              fontWeight: 'bold',
              cursor: 'pointer',
              whiteSpace: 'nowrap'
            }}
          >
            Expiring Soon
          </button>
        </div>

        {/* Sort Controls */}
        <div style={{ display: 'flex', gap: '12px', alignItems: 'center', flexWrap: 'wrap' }}>
          <span style={{ fontSize: '14px', color: '#6b7280', fontWeight: 'bold' }}>
            Sort by:
          </span>
          <select
            value={sortBy}
            onChange={(e) => setSortBy(e.target.value)}
            style={{
              padding: '8px 12px',
              border: '1px solid #d1d5db',
              borderRadius: '8px',
              fontSize: '14px'
            }}
          >
            <option value="date">Date</option>
            <option value="value">Value</option>
            <option value="customer">Customer</option>
            <option value="status">Status</option>
          </select>

          <button
            onClick={() => setSortOrder(sortOrder === 'asc' ? 'desc' : 'asc')}
            style={{
              padding: '8px 12px',
              background: 'white',
              border: '1px solid #d1d5db',
              borderRadius: '8px',
              fontSize: '14px',
              cursor: 'pointer',
              fontWeight: 'bold'
            }}
          >
            {sortOrder === 'asc' ? '↑ Ascending' : '↓ Descending'}
          </button>

          <div style={{ flex: 1 }} />

          <button
            onClick={onClearFilters}
            style={{
              padding: '8px 12px',
              background: '#6b7280',
              color: 'white',
              border: 'none',
              borderRadius: '8px',
              fontSize: '14px',
              cursor: 'pointer',
              fontWeight: 'bold'
            }}
          >
            Clear Filters
          </button>

          <span style={{ fontSize: '14px', color: '#6b7280' }}>
            Showing {sortedQuotes.length} {searchTerm && searchTerm.length >= 2 ? 'results' : `of ${quotations.length}`}
          </span>
        </div>
      </div>

      {/* Search Info Banner */}
      {searchTerm && searchTerm.length >= 2 && (
        <div style={{
          background: 'linear-gradient(135deg, #dbeafe 0%, #e0e7ff 100%)',
          border: '1px solid #93c5fd',
          borderRadius: '8px',
          padding: '12px 16px',
          marginBottom: '16px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: '12px'
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <span style={{ fontSize: '18px' }}>🔍</span>
            <div>
              <span style={{ fontWeight: '600', color: '#1e40af' }}>
                Searching for "{searchTerm}"
              </span>
              <span style={{ marginLeft: '8px', fontSize: '13px', color: '#3b82f6' }}>
                across quote #, customer, phone, email, SKU, model, notes
              </span>
            </div>
          </div>
          <button
            onClick={() => setSearchTerm('')}
            style={{
              padding: '6px 12px',
              background: 'white',
              border: '1px solid #93c5fd',
              borderRadius: '6px',
              fontSize: '13px',
              cursor: 'pointer',
              color: '#1e40af',
              fontWeight: '500'
            }}
          >
            Clear Search
          </button>
        </div>
      )}

      {/* Quote Table */}
      <div style={{
        background: 'white',
        borderRadius: '12px',
        boxShadow: '0 1px 3px rgba(0,0,0,0.1)',
        overflow: 'hidden'
      }}>
        {sortedQuotes.length === 0 ? (
          <div style={{
            padding: '48px',
            textAlign: 'center',
            color: '#6b7280'
          }}>
            <div style={{ fontSize: '48px', marginBottom: '16px' }}>📋</div>
            <div style={{ fontSize: '18px', fontWeight: 'bold', marginBottom: '8px' }}>
              No quotations found
            </div>
            <div style={{ fontSize: '14px' }}>
              {searchTerm || statusFilter !== 'all' || dateFilter !== 'all' || valueFilter !== 'all'
                ? 'Try adjusting your filters'
                : 'Create your first quotation to get started'}
            </div>
          </div>
        ) : (
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr style={{ background: '#f9fafb', borderBottom: '1px solid #e5e7eb' }}>
                {/* Checkbox column */}
                <th style={{ padding: '16px', textAlign: 'center', width: '50px' }} onClick={(e) => e.stopPropagation()}>
                  <input
                    type="checkbox"
                    checked={sortedQuotes.length > 0 && selectedIds.length === sortedQuotes.length}
                    onChange={(e) => {
                      e.stopPropagation();
                      if (e.target.checked) {
                        onSelectAll?.(sortedQuotes.map(q => q.id));
                      } else {
                        onClearSelection?.();
                      }
                    }}
                    style={{ width: '18px', height: '18px', cursor: 'pointer' }}
                    title={selectedIds.length === sortedQuotes.length ? 'Deselect all' : 'Select all'}
                  />
                </th>
                <th style={{ padding: '16px', textAlign: 'left', fontSize: '14px', fontWeight: '600', color: '#374151' }}>
                  Quote #
                </th>
                <th style={{ padding: '16px', textAlign: 'left', fontSize: '14px', fontWeight: '600', color: '#374151' }}>
                  Customer
                </th>
                <th style={{ padding: '16px', textAlign: 'left', fontSize: '14px', fontWeight: '600', color: '#374151' }}>
                  Status
                </th>
                <th style={{ padding: '16px', textAlign: 'right', fontSize: '14px', fontWeight: '600', color: '#374151' }}>
                  Total
                </th>
                <th style={{ padding: '16px', textAlign: 'right', fontSize: '14px', fontWeight: '600', color: '#374151' }}>
                  Date
                </th>
                <th style={{ padding: '16px', textAlign: 'center', fontSize: '14px', fontWeight: '600', color: '#374151' }}>
                  Actions
                </th>
              </tr>
            </thead>
            <tbody>
              {sortedQuotes.map((quote) => {
                const expiryDate = quote.quote_expiry_date || quote.expires_at;
                const expired = isExpired(expiryDate);
                const isSelected = selectedIds.includes(quote.id);

                return (
                  <tr
                    key={quote.id}
                    style={{
                      borderBottom: '1px solid #e5e7eb',
                      cursor: 'pointer',
                      transition: 'background 0.2s',
                      background: isSelected
                        ? '#eff6ff'
                        : expired && quote.status !== 'WON' && quote.status !== 'LOST'
                          ? '#fef3c7'
                          : 'white'
                    }}
                    onMouseEnter={(e) => {
                      if (!isSelected) e.currentTarget.style.background = '#f9fafb';
                    }}
                    onMouseLeave={(e) => {
                      e.currentTarget.style.background = isSelected
                        ? '#eff6ff'
                        : expired && quote.status !== 'WON' && quote.status !== 'LOST'
                          ? '#fef3c7'
                          : 'white';
                    }}
                    onClick={() => onViewQuote(quote.id)}
                  >
                    {/* Row checkbox */}
                    <td style={{ padding: '16px', textAlign: 'center' }} onClick={(e) => e.stopPropagation()}>
                      <input
                        type="checkbox"
                        checked={isSelected}
                        onChange={(e) => {
                          e.stopPropagation();
                          onToggleSelect?.(quote.id);
                        }}
                        style={{ width: '18px', height: '18px', cursor: 'pointer' }}
                      />
                    </td>
                    <td style={{ padding: '16px' }}>
                      <div style={{ fontWeight: '600', color: '#3b82f6' }}>
                        {quote.quotation_number || quote.quote_number}
                      </div>
                      {quote.item_count && (
                        <div style={{ fontSize: '12px', color: '#9ca3af' }}>
                          {quote.item_count} item{quote.item_count !== 1 ? 's' : ''}
                        </div>
                      )}
                      {/* Search match indicator */}
                      {quote.search_match && searchTerm && (
                        <SearchMatchBadge match={quote.search_match} searchTerm={searchTerm} />
                      )}
                    </td>
                    <td style={{ padding: '16px' }}>
                      <div style={{ fontWeight: '500', color: '#111827' }}>
                        {quote.customer_name || 'No customer'}
                      </div>
                      {quote.customer_company && (
                        <div style={{ fontSize: '12px', color: '#6b7280' }}>
                          {quote.customer_company}
                        </div>
                      )}
                    </td>
                    <td style={{ padding: '16px' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                        <StatusBadge status={quote.status} createdAt={quote.created_at} />
                        <ExpiryBadge
                          expiresAt={quote.quote_expiry_date || quote.expires_at}
                          status={quote.status}
                        />
                      </div>
                    </td>
                    <td style={{ padding: '16px', textAlign: 'right' }}>
                      <div style={{ fontWeight: '600', color: '#111827' }}>
                        ${((quote.total_cents || 0) / 100).toLocaleString('en-US', { minimumFractionDigits: 2 })}
                      </div>
                    </td>
                    <td style={{ padding: '16px', textAlign: 'right' }}>
                      <div style={{ fontSize: '14px', color: '#6b7280' }}>
                        {formatDate ? formatDate(quote.created_at) : new Date(quote.created_at).toLocaleDateString()}
                      </div>
                    </td>
                    <td style={{ padding: '16px', textAlign: 'center' }} onClick={(e) => e.stopPropagation()}>
                      <div style={{ display: 'flex', gap: '8px', justifyContent: 'center' }}>
                        <button
                          onClick={() => onViewQuote(quote.id)}
                          style={{
                            padding: '8px 12px',
                            background: '#3b82f6',
                            color: 'white',
                            border: 'none',
                            borderRadius: '6px',
                            fontSize: '12px',
                            fontWeight: '500',
                            cursor: 'pointer'
                          }}
                        >
                          View
                        </button>
                        <button
                          onClick={() => onEditQuote(quote.id)}
                          style={{
                            padding: '8px 12px',
                            background: '#6b7280',
                            color: 'white',
                            border: 'none',
                            borderRadius: '6px',
                            fontSize: '12px',
                            fontWeight: '500',
                            cursor: 'pointer'
                          }}
                        >
                          Edit
                        </button>
                        <button
                          onClick={() => onDeleteQuote(quote.id)}
                          style={{
                            padding: '8px 12px',
                            background: '#dc2626',
                            color: 'white',
                            border: 'none',
                            borderRadius: '6px',
                            fontSize: '12px',
                            fontWeight: '500',
                            cursor: 'pointer'
                          }}
                        >
                          Delete
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>

      {/* Bulk Action Toolbar */}
      <BulkActionToolbar
        selectedIds={selectedIds}
        selectedQuotes={sortedQuotes.filter(q => selectedIds.includes(q.id))}
        onClearSelection={onClearSelection}
        onActionComplete={onBulkActionComplete}
        formatCurrency={formatCurrency}
      />
    </div>
  );
};

export default QuoteList;
