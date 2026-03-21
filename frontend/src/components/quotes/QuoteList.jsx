/**
 * QuoteList Component
 * Displays the list of quotations with filters, search, and actions
 */

import React, { useMemo, useState } from 'react';
import BulkActionToolbar from './BulkActionToolbar';
import FilterChips from './FilterChips';
import DraftList from './DraftList';
import './QuoteList.css';

/**
 * Tooltip wrapper component
 */
const Tooltip = ({ children, text }) => {
  const [isVisible, setIsVisible] = useState(false);

  return (
    <div
      className="quote-tooltip-wrap"
      onMouseEnter={() => setIsVisible(true)}
      onMouseLeave={() => setIsVisible(false)}
    >
      {children}
      {isVisible && text && (
        <div className="quote-tooltip">
          {text}
          <div className="quote-tooltip-arrow" />
        </div>
      )}
    </div>
  );
};

/**
 * StatusBadge - Displays quote status with tooltip
 */
const StatusBadge = ({ status, createdAt }) => {
  const statusConfig = {
    DRAFT: { bg: '#6b7280', text: 'white', label: 'DRAFT' },
    SENT: { bg: '#8b5cf6', text: 'white', label: 'SENT' },
    VIEWED: { bg: '#0ea5e9', text: 'white', label: 'VIEWED' },
    PENDING_APPROVAL: { bg: '#f59e0b', text: '#000000', label: 'PENDING' },
    APPROVED: { bg: '#10b981', text: 'white', label: 'APPROVED' },
    WON: { bg: '#059669', text: 'white', label: 'WON' },
    LOST: { bg: '#dc2626', text: 'white', label: 'LOST' },
    REJECTED: { bg: '#ef4444', text: 'white', label: 'REJECTED' }
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
      <span
        className="quote-status-badge"
        style={{ background: config.bg, color: config.text }}
      >
        {config.label}
      </span>
    </Tooltip>
  );
};

/**
 * ExpiryBadge - Displays expiry status with tooltip (only for Draft/Sent)
 */
const ExpiryBadge = ({ expiresAt, status }) => {
  if (status === 'WON' || status === 'LOST') return null;
  if (!expiresAt) return null;

  const expiryDate = new Date(expiresAt);
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  expiryDate.setHours(0, 0, 0, 0);

  const diffTime = expiryDate - today;
  const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));

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
        <span className="quote-expiry-badge expired">
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><line x1="15" y1="9" x2="9" y2="15"/><line x1="9" y1="9" x2="15" y2="15"/></svg>
          EXPIRED
        </span>
      </Tooltip>
    );
  }

  if (isExpiringSoon) {
    return (
      <Tooltip text={getTooltipText()}>
        <span className="quote-expiry-badge expiring">
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>
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
const SearchMatchBadge = ({ match }) => {
  if (!match || !match.type) return null;

  const matchConfig = {
    quote_number: { bg: '#dbeafe', text: '#1d4ed8', icon: <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M4 9h16"/><path d="M4 15h16"/><path d="M10 3 8 21"/><path d="M16 3 14 21"/></svg> },
    customer_name: { bg: '#dcfce7', text: '#15803d', icon: <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg> },
    customer_email: { bg: '#fef3c7', text: '#92400e', icon: <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z"/><polyline points="22,6 12,13 2,6"/></svg> },
    customer_phone: { bg: '#f3e8ff', text: '#7c3aed', icon: <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z"/></svg> },
    customer_company: { bg: '#e0e7ff', text: '#4338ca', icon: <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><rect x="2" y="7" width="20" height="14" rx="2" ry="2"/><path d="M16 21V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v16"/></svg> },
    product: { bg: '#fce7f3', text: '#be185d', icon: <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"/></svg> },
    internal_notes: { bg: '#fee2e2', text: '#dc2626', icon: <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg> },
    notes: { bg: '#f3f4f6', text: '#374151', icon: <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/></svg> }
  };

  const config = matchConfig[match.type] || { bg: '#f3f4f6', text: '#6b7280', icon: <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg> };

  return (
    <div style={{ marginTop: '4px' }}>
      <span
        className="search-match-badge"
        style={{ background: config.bg, color: config.text }}
      >
        {config.icon}
        <span>Match: {match.field}</span>
      </span>
      {match.type === 'product' && match.matched_products && match.matched_products.length > 0 && (
        <div className="search-match-products">
          {match.matched_products.slice(0, 2).map((product, idx) => (
            <div key={idx} className="search-match-product">
              {product.manufacturer} {product.model || product.sku}
            </div>
          ))}
          {match.matched_products.length > 2 && (
            <div className="search-match-more">
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
  customerFilter,
  setCustomerFilter,

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

  // Bulk selection
  selectedIds = [],
  onToggleSelect,
  onSelectAll,
  onClearSelection,
  onBulkActionComplete,

  // Helpers
  formatCurrency,
  formatDate,

  // Filter chips
  filterRefreshTrigger,
  activeQuickFilter,
  onQuickFilterChange,

  // View mode
  listViewMode = 'list',
  onViewModeChange,

  // Draft persistence
  localDrafts = [],
  onResumeDraft,
  onDeleteDraft,
  activeDraftTab = false,
  setActiveDraftTab
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
        if (valueFilter === '5000+' && total < 5000) return false;
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
        if (q.customer_id) return false;
      } else if (customerFilter !== 'all' && q.customer_id?.toString() !== customerFilter) {
        return false;
      }

      return true;
    });
  }, [quotations, searchTerm, statusFilter, dateFilter, valueFilter, expiringFilter, customerFilter]);

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
    <div className="quote-list-container">
      {/* Header */}
      <div className="quote-list-header">
        <h1 className="quote-list-title">
          <span className="quote-title-icon">
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/><polyline points="10 9 9 9 8 9"/></svg>
          </span>
          Quotations
        </h1>

        <div className="quote-header-actions">
          {/* Navigation buttons */}
          <button onClick={onViewDashboard} className="quote-nav-btn nav-dashboard">
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/><rect x="14" y="14" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/></svg>
            Dashboard
          </button>

          <button onClick={onViewAnalytics} className="quote-nav-btn nav-analytics">
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="20" x2="18" y2="10"/><line x1="12" y1="20" x2="12" y2="4"/><line x1="6" y1="20" x2="6" y2="14"/></svg>
            Analytics
          </button>

          <button onClick={onViewApprovals} className="quote-nav-btn nav-approvals">
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/></svg>
            Approvals
          </button>

          <button onClick={onViewFollowUps} className="quote-nav-btn nav-followups">
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="4" width="18" height="18" rx="2" ry="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>
            Follow-Ups
            {(followUpStats?.overdue_count > 0 || followUpStats?.due_soon_count > 0) && (
              <span className="quote-nav-badge">
                {(followUpStats.overdue_count || 0) + (followUpStats.due_soon_count || 0)}
              </span>
            )}
          </button>

          {/* Export button */}
          <button
            onClick={() => onExport?.(sortedQuotes)}
            disabled={sortedQuotes.length === 0}
            className="quote-nav-btn nav-export"
          >
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
            Export
          </button>

          {/* View Mode Toggle */}
          {onViewModeChange && (
            <div className="quote-view-toggle">
              <button
                onClick={() => onViewModeChange('list')}
                className={`quote-view-btn ${listViewMode === 'list' ? 'active' : ''}`}
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
                className={`quote-view-btn ${listViewMode === 'kanban' ? 'active' : ''}`}
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

          {/* Primary CTA - New Quote */}
          <button onClick={onCreateNew} className="quote-new-btn">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
            New Quote
          </button>
        </div>
      </div>

      {/* Stats Cards */}
      <div className="quote-stats-grid">
        <div className="quote-stat-card">
          <div className="quote-stat-icon icon-blue">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/></svg>
          </div>
          <div className="quote-stat-info">
            <div className="quote-stat-label">Total Quotes</div>
            <div className="quote-stat-value val-blue">
              {stats?.total_quotes || quotations.length || 0}
            </div>
          </div>
        </div>

        <div className="quote-stat-card">
          <div className="quote-stat-icon icon-green">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="12" y1="1" x2="12" y2="23"/><path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"/></svg>
          </div>
          <div className="quote-stat-info">
            <div className="quote-stat-label">Total Value</div>
            <div className="quote-stat-value val-green">
              {formatCurrency ? formatCurrency(stats?.total_value_cents || 0) : `$${((stats?.total_value_cents || 0) / 100).toFixed(2)}`}
            </div>
          </div>
        </div>

        <div className="quote-stat-card">
          <div className="quote-stat-icon icon-purple">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M22 12h-4l-3 9L9 3l-3 9H2"/></svg>
          </div>
          <div className="quote-stat-info">
            <div className="quote-stat-label">Won Rate</div>
            <div className="quote-stat-value val-purple">
              {stats?.won_rate || stats?.win_rate || '0'}%
            </div>
          </div>
        </div>

        <div className={`quote-stat-card ${expiringSoonCount > 0 ? 'stat-expiring' : ''}`}>
          <div className="quote-stat-icon icon-amber">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>
          </div>
          <div className="quote-stat-info">
            <div className="quote-stat-label">Expiring Soon</div>
            <div className={`quote-stat-value ${expiringSoonCount > 0 ? 'val-amber' : 'val-muted'}`}>
              {expiringSoonCount}
            </div>
            <div className="quote-stat-sub">Within 7 days</div>
          </div>
        </div>
      </div>

      {/* Quick Filter Chips + Drafts Tab */}
      <div className="quote-quick-filters">
        <button
          onClick={() => setActiveDraftTab && setActiveDraftTab(!activeDraftTab)}
          className={`quote-drafts-chip ${activeDraftTab ? 'active' : ''}`}
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
          Drafts
          {localDrafts.length > 0 && (
            <span className="quote-drafts-badge">
              {localDrafts.length}
            </span>
          )}
        </button>
        <FilterChips
          activeFilter={activeQuickFilter}
          onFilterChange={(f) => { setActiveDraftTab && setActiveDraftTab(false); onQuickFilterChange(f); }}
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
      </div>

      {/* Filters */}
      <div className="quote-filters-bar">
        <div className="quote-filters-row">
          {/* Enhanced Search Input */}
          <div className="quote-search-wrap">
            <div className="quote-search-icon">
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
            </div>
            <input
              type="text"
              placeholder="Search by quote #, customer, phone, SKU, model, notes..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className={`quote-search-input ${searchTerm.length >= 2 ? 'active' : ''}`}
            />
            <div className={`quote-search-indicator ${searchLoading ? 'searching' : ''}`}>
              {searchLoading ? (
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 12a9 9 0 1 1-6.219-8.56"/></svg>
              ) : searchTerm.length >= 2 ? (
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12"/></svg>
              ) : null}
            </div>
          </div>

          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="quote-filter-select"
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
            className="quote-filter-select"
          >
            <option value="all">All Time</option>
            <option value="today">Today</option>
            <option value="week">Last 7 Days</option>
            <option value="month">Last 30 Days</option>
          </select>

          <select
            value={valueFilter}
            onChange={(e) => setValueFilter(e.target.value)}
            className="quote-filter-select"
          >
            <option value="all">All Values</option>
            <option value="0-1000">$0 - $1,000</option>
            <option value="1000-5000">$1,000 - $5,000</option>
            <option value="5000-10000">$5,000 - $10,000</option>
            <option value="10000+">$10,000+</option>
          </select>

          <button
            onClick={() => setExpiringFilter(!expiringFilter)}
            className={`quote-expiring-toggle ${expiringFilter ? 'active' : ''}`}
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>
            Expiring Soon
          </button>
        </div>

        {/* Sort Controls */}
        <div className="quote-sort-row">
          <span className="quote-sort-label">Sort by:</span>
          <select
            value={sortBy}
            onChange={(e) => setSortBy(e.target.value)}
            className="quote-sort-select"
          >
            <option value="date">Date</option>
            <option value="value">Value</option>
            <option value="customer">Customer</option>
            <option value="status">Status</option>
          </select>

          <button
            onClick={() => setSortOrder(sortOrder === 'asc' ? 'desc' : 'asc')}
            className="quote-sort-btn"
          >
            {sortOrder === 'asc' ? (
              <><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="12" y1="19" x2="12" y2="5"/><polyline points="5 12 12 5 19 12"/></svg> Ascending</>
            ) : (
              <><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="12" y1="5" x2="12" y2="19"/><polyline points="19 12 12 19 5 12"/></svg> Descending</>
            )}
          </button>

          <div style={{ flex: 1 }} />

          <button onClick={onClearFilters} className="quote-clear-filters-btn">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
            Clear Filters
          </button>

          <span className="quote-results-count">
            Showing {sortedQuotes.length} {searchTerm && searchTerm.length >= 2 ? 'results' : `of ${quotations.length}`}
          </span>
        </div>
      </div>

      {/* Search Info Banner */}
      {searchTerm && searchTerm.length >= 2 && (
        <div className="quote-search-banner">
          <div className="quote-search-banner-text">
            <span className="quote-search-banner-icon">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
            </span>
            <div>
              <span className="quote-search-banner-title">
                Searching for "{searchTerm}"
              </span>
              <span className="quote-search-banner-sub">
                across quote #, customer, phone, email, SKU, model, notes
              </span>
            </div>
          </div>
          <button onClick={() => setSearchTerm('')} className="quote-search-clear-btn">
            Clear Search
          </button>
        </div>
      )}

      {/* Drafts view or Quote Table */}
      {activeDraftTab ? (
        <div className="quote-table-wrap" style={{ padding: '16px' }}>
          <DraftList
            drafts={localDrafts}
            onResume={onResumeDraft}
            onDelete={onDeleteDraft}
            formatCurrency={formatCurrency}
          />
        </div>
      ) : (
      <div className="quote-table-wrap">
        {sortedQuotes.length === 0 ? (
          <div className="quote-empty-state">
            <div className="quote-empty-icon">
              <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/></svg>
            </div>
            <div className="quote-empty-title">
              No quotations found
            </div>
            <div className="quote-empty-desc">
              {searchTerm || statusFilter !== 'all' || dateFilter !== 'all' || valueFilter !== 'all'
                ? 'Try adjusting your filters'
                : 'Create your first quotation to get started'}
            </div>
          </div>
        ) : (
          <table className="quote-table">
            <thead>
              <tr>
                {/* Checkbox column */}
                <th className="text-center" style={{ width: '50px' }} onClick={(e) => e.stopPropagation()}>
                  <input
                    type="checkbox"
                    className="quote-checkbox"
                    checked={sortedQuotes.length > 0 && selectedIds.length === sortedQuotes.length}
                    onChange={(e) => {
                      e.stopPropagation();
                      if (e.target.checked) {
                        onSelectAll?.(sortedQuotes.map(q => q.id));
                      } else {
                        onClearSelection?.();
                      }
                    }}
                    title={selectedIds.length === sortedQuotes.length ? 'Deselect all' : 'Select all'}
                  />
                </th>
                <th>Quote #</th>
                <th>Customer</th>
                <th>Status</th>
                <th className="text-right">Total</th>
                <th className="text-right">Date</th>
                <th className="text-center">Actions</th>
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
                    className={`${isSelected ? 'selected' : ''} ${expired && quote.status !== 'WON' && quote.status !== 'LOST' ? 'expired-row' : ''}`}
                    onClick={() => onViewQuote(quote.id)}
                  >
                    {/* Row checkbox */}
                    <td className="text-center" onClick={(e) => e.stopPropagation()}>
                      <input
                        type="checkbox"
                        className="quote-checkbox"
                        checked={isSelected}
                        onChange={(e) => {
                          e.stopPropagation();
                          onToggleSelect?.(quote.id);
                        }}
                      />
                    </td>
                    <td>
                      <div className="quote-number-cell">
                        {quote.quotation_number || quote.quote_number}
                      </div>
                      {quote.item_count && (
                        <div className="quote-items-count">
                          {quote.item_count} item{quote.item_count !== 1 ? 's' : ''}
                        </div>
                      )}
                      {quote.search_match && searchTerm && (
                        <SearchMatchBadge match={quote.search_match} searchTerm={searchTerm} />
                      )}
                    </td>
                    <td>
                      <div className="quote-customer-name">
                        {quote.customer_name || 'No customer'}
                      </div>
                      {quote.customer_company && (
                        <div className="quote-customer-company">
                          {quote.customer_company}
                        </div>
                      )}
                    </td>
                    <td>
                      <div className="quote-status-wrap">
                        <StatusBadge status={quote.status} createdAt={quote.created_at} />
                        <ExpiryBadge
                          expiresAt={quote.quote_expiry_date || quote.expires_at}
                          status={quote.status}
                        />
                      </div>
                    </td>
                    <td className="text-right">
                      <div className="quote-total-cell">
                        ${((quote.total_cents || 0) / 100).toLocaleString('en-US', { minimumFractionDigits: 2 })}
                      </div>
                    </td>
                    <td className="text-right">
                      <div className="quote-date-cell">
                        {formatDate ? formatDate(quote.created_at) : new Date(quote.created_at).toLocaleDateString()}
                      </div>
                    </td>
                    <td className="text-center" onClick={(e) => e.stopPropagation()}>
                      <div className="quote-actions-cell">
                        <button
                          onClick={() => onViewQuote(quote.id)}
                          className="quote-action-btn btn-view"
                        >
                          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>
                          View
                        </button>
                        <button
                          onClick={() => onEditQuote(quote.id)}
                          className="quote-action-btn btn-edit"
                        >
                          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
                          Edit
                        </button>
                        <button
                          onClick={() => onDeleteQuote(quote.id)}
                          className="quote-action-btn btn-delete"
                        >
                          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>
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
      )}

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
