/**
 * QuoteList Component
 * Displays the list of quotations with filters, search, and actions
 */

import React, { useMemo } from 'react';

const QuoteList = ({
  // Data
  quotations,
  stats,
  followUpStats,

  // Filters
  searchTerm,
  setSearchTerm,
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
  onViewAnalytics,
  onViewApprovals,
  onViewFollowUps,
  onExport,
  onClearFilters,
  getActiveFilterCount,

  // Helpers
  formatCurrency,
  formatDate,
  getStatusColor
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
      if (customerFilter !== 'all' && q.customer_id?.toString() !== customerFilter) {
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

        <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap' }}>
          <button
            onClick={onViewAnalytics}
            style={{
              padding: '12px 24px',
              background: '#8b5cf6',
              color: 'white',
              border: 'none',
              borderRadius: '8px',
              fontSize: '14px',
              fontWeight: 'bold',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: '8px'
            }}
          >
            Analytics
          </button>

          <button
            onClick={onViewApprovals}
            style={{
              padding: '12px 24px',
              background: '#6366f1',
              color: 'white',
              border: 'none',
              borderRadius: '8px',
              fontSize: '14px',
              fontWeight: 'bold',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: '8px'
            }}
          >
            Approvals
          </button>

          <button
            onClick={onViewFollowUps}
            style={{
              padding: '12px 24px',
              background: '#ec4899',
              color: 'white',
              border: 'none',
              borderRadius: '8px',
              fontSize: '14px',
              fontWeight: 'bold',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: '8px'
            }}
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

          <button
            onClick={() => onExport?.(sortedQuotes)}
            disabled={sortedQuotes.length === 0}
            style={{
              padding: '12px 24px',
              background: sortedQuotes.length === 0 ? '#9ca3af' : '#10b981',
              color: 'white',
              border: 'none',
              borderRadius: '8px',
              fontSize: '14px',
              fontWeight: 'bold',
              cursor: sortedQuotes.length === 0 ? 'not-allowed' : 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: '8px'
            }}
          >
            Export
          </button>

          <button
            onClick={onCreateNew}
            style={{
              padding: '12px 24px',
              background: '#3b82f6',
              color: 'white',
              border: 'none',
              borderRadius: '8px',
              fontSize: '14px',
              fontWeight: 'bold',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: '8px'
            }}
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

      {/* Filters */}
      <div style={{
        background: 'white',
        padding: '16px',
        borderRadius: '12px',
        marginBottom: '24px',
        boxShadow: '0 1px 3px rgba(0,0,0,0.1)'
      }}>
        <div style={{ display: 'flex', gap: '12px', marginBottom: '12px', flexWrap: 'wrap' }}>
          <input
            type="text"
            placeholder="Search quotes or customers..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            style={{
              flex: '1 1 250px',
              padding: '12px',
              border: '1px solid #d1d5db',
              borderRadius: '8px',
              fontSize: '14px'
            }}
          />

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
            Showing {sortedQuotes.length} of {quotations.length}
          </span>
        </div>
      </div>

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
                <th style={{ padding: '16px', textAlign: 'left', fontSize: '14px', fontWeight: '600', color: '#374151' }}>
                  Date
                </th>
                <th style={{ padding: '16px', textAlign: 'center', fontSize: '14px', fontWeight: '600', color: '#374151' }}>
                  Actions
                </th>
              </tr>
            </thead>
            <tbody>
              {sortedQuotes.map((quote) => {
                const expired = isExpired(quote.quote_expiry_date || quote.expires_at);
                const statusColors = getStatusColor ? getStatusColor(quote.status) : {
                  DRAFT: { bg: '#f3f4f6', text: '#6b7280' },
                  SENT: { bg: '#dbeafe', text: '#1d4ed8' },
                  WON: { bg: '#dcfce7', text: '#15803d' },
                  LOST: { bg: '#fee2e2', text: '#dc2626' }
                }[quote.status] || { bg: '#f3f4f6', text: '#6b7280' };

                return (
                  <tr
                    key={quote.id}
                    style={{
                      borderBottom: '1px solid #e5e7eb',
                      cursor: 'pointer',
                      transition: 'background 0.2s',
                      background: expired && quote.status !== 'WON' && quote.status !== 'LOST' ? '#fef3c7' : 'white'
                    }}
                    onMouseEnter={(e) => e.currentTarget.style.background = '#f9fafb'}
                    onMouseLeave={(e) => e.currentTarget.style.background = expired && quote.status !== 'WON' && quote.status !== 'LOST' ? '#fef3c7' : 'white'}
                    onClick={() => onViewQuote(quote.id)}
                  >
                    <td style={{ padding: '16px' }}>
                      <div style={{ fontWeight: '600', color: '#3b82f6' }}>
                        {quote.quotation_number || quote.quote_number}
                      </div>
                      {quote.item_count && (
                        <div style={{ fontSize: '12px', color: '#9ca3af' }}>
                          {quote.item_count} item{quote.item_count !== 1 ? 's' : ''}
                        </div>
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
                      <span style={{
                        display: 'inline-block',
                        padding: '4px 12px',
                        borderRadius: '9999px',
                        fontSize: '12px',
                        fontWeight: '600',
                        background: statusColors.bg,
                        color: statusColors.text
                      }}>
                        {quote.status}
                      </span>
                      {expired && quote.status !== 'WON' && quote.status !== 'LOST' && (
                        <span style={{
                          display: 'inline-block',
                          marginLeft: '8px',
                          padding: '4px 8px',
                          borderRadius: '4px',
                          fontSize: '10px',
                          fontWeight: '600',
                          background: '#dc2626',
                          color: 'white'
                        }}>
                          EXPIRED
                        </span>
                      )}
                    </td>
                    <td style={{ padding: '16px', textAlign: 'right' }}>
                      <div style={{ fontWeight: '600', color: '#111827' }}>
                        ${((quote.total_cents || 0) / 100).toLocaleString('en-US', { minimumFractionDigits: 2 })}
                      </div>
                    </td>
                    <td style={{ padding: '16px' }}>
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
    </div>
  );
};

export default QuoteList;
