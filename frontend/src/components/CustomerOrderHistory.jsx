import React, { useState, useEffect } from 'react';

import { authFetch } from '../services/authFetch';
const API_BASE = `${process.env.REACT_APP_API_URL || 'http://localhost:3001'}/api`;

/**
 * CustomerOrderHistory Component
 * Displays unified order history combining quotes and marketplace orders
 */
function CustomerOrderHistory({ customerId, customerEmail, onCreateQuote }) {
  const [activeTab, setActiveTab] = useState('all');
  const [orders, setOrders] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [stats, setStats] = useState({
    totalOrders: 0,
    totalQuotes: 0,
    totalMarketplaceOrders: 0,
    totalRevenue: 0,
    marketplaceRevenue: 0,
    quoteRevenue: 0
  });

  useEffect(() => {
    if (customerId) {
      fetchUnifiedHistory();
    }
  }, [customerId]);

  const fetchUnifiedHistory = async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await authFetch(`${API_BASE}/marketplace/customers/${customerId}/unified-history`);
      if (!response.ok) {
        throw new Error('Failed to fetch order history');
      }
      const data = await response.json();

      setOrders(data.orders || []);
      setStats({
        totalOrders: data.total_count || 0,
        totalQuotes: data.quote_count || 0,
        totalMarketplaceOrders: data.marketplace_count || 0,
        totalRevenue: data.total_revenue_cents || 0,
        marketplaceRevenue: data.marketplace_revenue_cents || 0,
        quoteRevenue: data.quote_revenue_cents || 0
      });
    } catch (err) {
      console.error('Error fetching unified history:', err);
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const formatCurrency = (cents) => {
    if (!cents) return '$0.00';
    return `$${(cents / 100).toFixed(2).replace(/\B(?=(\d{3})+(?!\d))/g, ',')}`;
  };

  const formatDate = (dateString) => {
    if (!dateString) return '-';
    return new Date(dateString).toLocaleDateString('en-CA', {
      year: 'numeric',
      month: 'short',
      day: 'numeric'
    });
  };

  const getStatusBadge = (status, type) => {
    const statusStyles = {
      // Quote statuses
      approved: { bg: '#dcfce7', color: '#166534' },
      pending: { bg: '#fef3c7', color: '#854d0e' },
      rejected: { bg: '#fee2e2', color: '#991b1b' },
      draft: { bg: '#e5e7eb', color: '#374151' },
      // Marketplace order statuses
      shipped: { bg: '#dbeafe', color: '#1e40af' },
      delivered: { bg: '#dcfce7', color: '#166534' },
      processing: { bg: '#fef3c7', color: '#854d0e' },
      cancelled: { bg: '#fee2e2', color: '#991b1b' },
      refunded: { bg: '#fae8ff', color: '#86198f' }
    };

    const style = statusStyles[status?.toLowerCase()] || statusStyles.pending;

    return (
      <span style={{
        padding: '4px 12px',
        borderRadius: '12px',
        fontSize: '12px',
        fontWeight: '500',
        background: style.bg,
        color: style.color,
        textTransform: 'capitalize'
      }}>
        {status || 'unknown'}
      </span>
    );
  };

  const getSourceBadge = (type) => {
    if (type === 'quote') {
      return (
        <span style={{
          padding: '4px 10px',
          borderRadius: '12px',
          fontSize: '11px',
          fontWeight: '600',
          background: '#ede9fe',
          color: '#5b21b6'
        }}>
          Quote
        </span>
      );
    }
    return (
      <span style={{
        padding: '4px 10px',
        borderRadius: '12px',
        fontSize: '11px',
        fontWeight: '600',
        background: '#fef9c3',
        color: '#854d0e'
        }}>
        Best Buy
      </span>
    );
  };

  const filteredOrders = orders.filter(order => {
    if (activeTab === 'all') return true;
    if (activeTab === 'quotes') return order.type === 'quote';
    if (activeTab === 'marketplace') return order.type === 'marketplace_order';
    return true;
  });

  const handleCreateQuoteFromOrder = async (order) => {
    if (onCreateQuote) {
      onCreateQuote(order);
    }
  };

  const tabStyle = (isActive) => ({
    padding: '12px 20px',
    background: isActive ? '#667eea' : 'transparent',
    color: isActive ? 'white' : '#6b7280',
    border: 'none',
    borderRadius: '8px',
    fontSize: '14px',
    fontWeight: '600',
    cursor: 'pointer',
    transition: 'all 0.2s ease'
  });

  if (loading) {
    return (
      <div style={{ padding: '40px', textAlign: 'center', color: '#9ca3af' }}>
        <div style={{ fontSize: '32px', marginBottom: '12px' }}>Loading order history...</div>
      </div>
    );
  }

  if (error) {
    return (
      <div style={{ padding: '40px', textAlign: 'center', color: '#ef4444', background: '#fef2f2', borderRadius: '8px' }}>
        <div style={{ fontSize: '24px', marginBottom: '8px' }}>Error loading order history</div>
        <div style={{ fontSize: '14px' }}>{error}</div>
        <button
          onClick={fetchUnifiedHistory}
          style={{ marginTop: '16px', padding: '10px 20px', background: '#667eea', color: 'white', border: 'none', borderRadius: '6px', cursor: 'pointer' }}
        >
          Retry
        </button>
      </div>
    );
  }

  return (
    <div style={{ marginTop: '30px' }}>
      <h3 style={{ margin: '0 0 20px 0', fontSize: '18px', fontWeight: '600', color: '#111827', display: 'flex', alignItems: 'center', gap: '8px' }}>
        Order History
        <span style={{ fontSize: '14px', fontWeight: '400', color: '#6b7280' }}>
          ({stats.totalOrders} total)
        </span>
      </h3>

      {/* Revenue Stats */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '12px', marginBottom: '20px' }}>
        <div style={{ background: '#f0f9ff', borderRadius: '8px', padding: '16px', textAlign: 'center' }}>
          <div style={{ fontSize: '20px', fontWeight: 'bold', color: '#0284c7' }}>{formatCurrency(stats.totalRevenue)}</div>
          <div style={{ fontSize: '12px', color: '#6b7280', marginTop: '4px' }}>Total Revenue</div>
        </div>
        <div style={{ background: '#ede9fe', borderRadius: '8px', padding: '16px', textAlign: 'center' }}>
          <div style={{ fontSize: '20px', fontWeight: 'bold', color: '#5b21b6' }}>{formatCurrency(stats.quoteRevenue)}</div>
          <div style={{ fontSize: '12px', color: '#6b7280', marginTop: '4px' }}>From Quotes ({stats.totalQuotes})</div>
        </div>
        <div style={{ background: '#fef9c3', borderRadius: '8px', padding: '16px', textAlign: 'center' }}>
          <div style={{ fontSize: '20px', fontWeight: 'bold', color: '#854d0e' }}>{formatCurrency(stats.marketplaceRevenue)}</div>
          <div style={{ fontSize: '12px', color: '#6b7280', marginTop: '4px' }}>From Marketplace ({stats.totalMarketplaceOrders})</div>
        </div>
      </div>

      {/* Tabs */}
      <div style={{ display: 'flex', gap: '8px', marginBottom: '16px', background: '#f3f4f6', padding: '6px', borderRadius: '10px' }}>
        <button style={tabStyle(activeTab === 'all')} onClick={() => setActiveTab('all')}>
          All Orders ({stats.totalOrders})
        </button>
        <button style={tabStyle(activeTab === 'quotes')} onClick={() => setActiveTab('quotes')}>
          Quotes ({stats.totalQuotes})
        </button>
        <button style={tabStyle(activeTab === 'marketplace')} onClick={() => setActiveTab('marketplace')}>
          Marketplace ({stats.totalMarketplaceOrders})
        </button>
      </div>

      {/* Order List */}
      {filteredOrders.length === 0 ? (
        <div style={{ textAlign: 'center', padding: '40px', color: '#9ca3af', background: '#f9fafb', borderRadius: '8px' }}>
          {activeTab === 'all' ? 'No orders yet for this customer' :
           activeTab === 'quotes' ? 'No quotes yet' : 'No marketplace orders yet'}
        </div>
      ) : (
        <div style={{ maxHeight: '400px', overflow: 'auto', border: '1px solid #e5e7eb', borderRadius: '8px' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead style={{ position: 'sticky', top: 0, background: '#f9fafb' }}>
              <tr style={{ borderBottom: '2px solid #e5e7eb' }}>
                <th style={{ padding: '12px', textAlign: 'left', fontSize: '12px', fontWeight: '600', color: '#6b7280' }}>Source</th>
                <th style={{ padding: '12px', textAlign: 'left', fontSize: '12px', fontWeight: '600', color: '#6b7280' }}>Order #</th>
                <th style={{ padding: '12px', textAlign: 'left', fontSize: '12px', fontWeight: '600', color: '#6b7280' }}>Date</th>
                <th style={{ padding: '12px', textAlign: 'left', fontSize: '12px', fontWeight: '600', color: '#6b7280' }}>Status</th>
                <th style={{ padding: '12px', textAlign: 'right', fontSize: '12px', fontWeight: '600', color: '#6b7280' }}>Amount</th>
                <th style={{ padding: '12px', textAlign: 'center', fontSize: '12px', fontWeight: '600', color: '#6b7280' }}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {filteredOrders.map((order, index) => (
                <tr key={`${order.type}-${order.id}`} style={{ borderBottom: '1px solid #f3f4f6' }}>
                  <td style={{ padding: '12px' }}>
                    {getSourceBadge(order.type)}
                  </td>
                  <td style={{ padding: '12px', fontSize: '14px', color: '#111827', fontWeight: '500' }}>
                    {order.type === 'quote' ? order.quotation_number : order.marketplace_order_id}
                  </td>
                  <td style={{ padding: '12px', fontSize: '14px', color: '#6b7280' }}>
                    {formatDate(order.date)}
                  </td>
                  <td style={{ padding: '12px' }}>
                    {getStatusBadge(order.status, order.type)}
                  </td>
                  <td style={{ padding: '12px', fontSize: '14px', color: '#111827', textAlign: 'right', fontWeight: '600' }}>
                    {formatCurrency(order.amount_cents)}
                  </td>
                  <td style={{ padding: '12px', textAlign: 'center' }}>
                    {order.type === 'marketplace_order' && !order.created_quote_id && (
                      <button
                        onClick={() => handleCreateQuoteFromOrder(order)}
                        style={{
                          padding: '6px 12px',
                          background: '#8b5cf6',
                          color: 'white',
                          border: 'none',
                          borderRadius: '6px',
                          fontSize: '12px',
                          cursor: 'pointer',
                          fontWeight: '500'
                        }}
                        title="Create a quote from this marketplace order"
                      >
                        Create Quote
                      </button>
                    )}
                    {order.type === 'marketplace_order' && order.created_quote_id && (
                      <span style={{ fontSize: '12px', color: '#10b981', fontWeight: '500' }}>
                        Quote Created
                      </span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

export default CustomerOrderHistory;
