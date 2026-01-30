/**
 * Unified Timeline Widget
 *
 * Cross-module activity stream showing the complete customer journey:
 * - Quotes: Created, Sent, Viewed, Accepted, Lost
 * - Orders: Placed, Shipped, Delivered
 * - Invoices: Created, Sent, Paid
 *
 * Click any event to navigate to the detail view
 */

import React, { useState, useEffect, useCallback } from 'react';
import {
  FileText, ShoppingCart, Receipt, User, ArrowRight, Filter, RefreshCw
} from 'lucide-react';

const API_URL = process.env.REACT_APP_API_URL || 'http://localhost:3001';

// Event type configuration
const EVENT_CONFIG = {
  quote: {
    icon: FileText,
    color: '#6366f1',
    bgColor: '#e0e7ff',
    label: 'Quote'
  },
  order: {
    icon: ShoppingCart,
    color: '#22c55e',
    bgColor: '#dcfce7',
    label: 'Order'
  },
  invoice: {
    icon: Receipt,
    color: '#f59e0b',
    bgColor: '#fef3c7',
    label: 'Invoice'
  },
  customer: {
    icon: User,
    color: '#3b82f6',
    bgColor: '#dbeafe',
    label: 'Customer'
  }
};

// Status colors
const STATUS_COLORS = {
  draft: { bg: '#f3f4f6', text: '#374151' },
  sent: { bg: '#dbeafe', text: '#1d4ed8' },
  pending: { bg: '#fef3c7', text: '#92400e' },
  accepted: { bg: '#dcfce7', text: '#166534' },
  won: { bg: '#dcfce7', text: '#166534' },
  lost: { bg: '#fee2e2', text: '#991b1b' },
  cancelled: { bg: '#fee2e2', text: '#991b1b' },
  paid: { bg: '#dcfce7', text: '#166534' },
  overdue: { bg: '#fee2e2', text: '#991b1b' },
  shipped: { bg: '#dbeafe', text: '#1d4ed8' },
  delivered: { bg: '#dcfce7', text: '#166534' }
};

const UnifiedTimeline = ({ onNavigate, customerId = null, limit = 20 }) => {
  const [events, setEvents] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [filter, setFilter] = useState('all');

  // Fetch timeline events
  const fetchTimeline = useCallback(async () => {
    try {
      const token = localStorage.getItem('token');
      let url = `${API_URL}/api/insights/timeline?limit=${limit}`;
      if (customerId) {
        url += `&customerId=${customerId}`;
      }

      const response = await fetch(url, {
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        }
      });

      if (!response.ok) {
        throw new Error('Failed to fetch timeline');
      }

      const data = await response.json();
      if (data.success && data.data) {
        setEvents(data.data.events || []);
      }
    } catch (err) {
      console.error('Error fetching timeline:', err);
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [customerId, limit]);

  useEffect(() => {
    fetchTimeline();
    const interval = setInterval(fetchTimeline, 120000); // Refresh every 2 minutes
    return () => clearInterval(interval);
  }, [fetchTimeline]);

  // Format relative time
  const formatRelativeTime = (date) => {
    if (!date) return '';
    const now = new Date();
    const d = new Date(date);
    const diffMs = now - d;
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMs / 3600000);
    const diffDays = Math.floor(diffMs / 86400000);

    if (diffMins < 1) return 'Just now';
    if (diffMins < 60) return `${diffMins}m ago`;
    if (diffHours < 24) return `${diffHours}h ago`;
    if (diffDays < 7) return `${diffDays}d ago`;
    return d.toLocaleDateString('en-CA', { month: 'short', day: 'numeric' });
  };

  // Format currency
  const formatCurrency = (amount) => {
    if (!amount || amount === 0) return '';
    return `$${parseFloat(amount).toLocaleString('en-CA', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`;
  };

  // Handle event click
  const handleEventClick = (event) => {
    if (!onNavigate) return;

    switch (event.type) {
      case 'quote':
        onNavigate('quotes', { selected: event.entityId });
        break;
      case 'order':
        onNavigate('orders', { selected: event.entityId });
        break;
      case 'invoice':
        onNavigate('invoices', { selected: event.entityId });
        break;
      default:
        break;
    }
  };

  // Filter events
  const filteredEvents = filter === 'all'
    ? events
    : events.filter(e => e.type === filter);

  // Filter options
  const filterOptions = [
    { value: 'all', label: 'All' },
    { value: 'quote', label: 'Quotes' },
    { value: 'order', label: 'Orders' },
    { value: 'invoice', label: 'Invoices' }
  ];

  if (loading) {
    return (
      <div style={{
        background: 'white',
        borderRadius: '12px',
        padding: '20px',
        boxShadow: '0 1px 3px rgba(0,0,0,0.1)'
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '16px' }}>
          <span style={{ fontSize: '16px' }}>📜</span>
          <h3 style={{ margin: 0, fontSize: '16px', fontWeight: '600', color: '#1f2937' }}>
            Activity Timeline
          </h3>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
          {[1, 2, 3, 4].map(i => (
            <div key={i} style={{
              display: 'flex',
              gap: '12px',
              alignItems: 'flex-start'
            }}>
              <div style={{
                width: '32px',
                height: '32px',
                borderRadius: '50%',
                background: '#f3f4f6',
                animation: 'pulse 2s infinite'
              }} />
              <div style={{ flex: 1 }}>
                <div style={{
                  height: '14px',
                  background: '#f3f4f6',
                  borderRadius: '4px',
                  width: '60%',
                  animation: 'pulse 2s infinite'
                }} />
                <div style={{
                  height: '12px',
                  background: '#f3f4f6',
                  borderRadius: '4px',
                  width: '40%',
                  marginTop: '6px',
                  animation: 'pulse 2s infinite'
                }} />
              </div>
            </div>
          ))}
        </div>
        <style>{`
          @keyframes pulse {
            0%, 100% { opacity: 1; }
            50% { opacity: 0.5; }
          }
        `}</style>
      </div>
    );
  }

  return (
    <div style={{
      background: 'white',
      borderRadius: '12px',
      boxShadow: '0 1px 3px rgba(0,0,0,0.1)',
      overflow: 'hidden'
    }}>
      {/* Header */}
      <div style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        padding: '16px 20px',
        borderBottom: '1px solid #f3f4f6'
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <span style={{ fontSize: '16px' }}>📜</span>
          <h3 style={{ margin: 0, fontSize: '16px', fontWeight: '600', color: '#1f2937' }}>
            Activity Timeline
          </h3>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          {/* Filter Tabs */}
          <div style={{
            display: 'flex',
            background: '#f3f4f6',
            borderRadius: '6px',
            padding: '2px'
          }}>
            {filterOptions.map(option => (
              <button
                key={option.value}
                onClick={() => setFilter(option.value)}
                style={{
                  padding: '4px 10px',
                  background: filter === option.value ? 'white' : 'transparent',
                  border: 'none',
                  borderRadius: '4px',
                  fontSize: '12px',
                  fontWeight: '500',
                  color: filter === option.value ? '#1f2937' : '#6b7280',
                  cursor: 'pointer',
                  boxShadow: filter === option.value ? '0 1px 2px rgba(0,0,0,0.05)' : 'none'
                }}
              >
                {option.label}
              </button>
            ))}
          </div>
          <button
            onClick={fetchTimeline}
            style={{
              padding: '4px',
              background: 'transparent',
              border: 'none',
              cursor: 'pointer',
              color: '#9ca3af',
              display: 'flex',
              alignItems: 'center'
            }}
            title="Refresh"
          >
            <RefreshCw size={14} />
          </button>
        </div>
      </div>

      {/* Timeline */}
      <div style={{ maxHeight: '400px', overflowY: 'auto' }}>
        {filteredEvents.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '40px 20px', color: '#6b7280' }}>
            <div style={{ fontSize: '36px', marginBottom: '12px' }}>📋</div>
            <p style={{ margin: 0, fontWeight: '500' }}>No activity yet</p>
            <p style={{ margin: '4px 0 0', fontSize: '13px' }}>
              {filter !== 'all' ? `No ${filter} activity found` : 'Activity will appear here'}
            </p>
          </div>
        ) : (
          <div style={{ padding: '8px 0' }}>
            {filteredEvents.map((event, index) => {
              const config = EVENT_CONFIG[event.type] || EVENT_CONFIG.quote;
              const IconComponent = config.icon;
              const statusColor = STATUS_COLORS[event.status?.toLowerCase()] || STATUS_COLORS.draft;

              return (
                <div
                  key={event.id}
                  onClick={() => handleEventClick(event)}
                  style={{
                    display: 'flex',
                    gap: '12px',
                    padding: '12px 20px',
                    cursor: onNavigate ? 'pointer' : 'default',
                    transition: 'background 0.15s ease',
                    borderLeft: index === 0 ? 'none' : `2px solid #f3f4f6`,
                    marginLeft: index === 0 ? '0' : '35px',
                    paddingLeft: index === 0 ? '20px' : '24px'
                  }}
                  onMouseEnter={(e) => {
                    if (onNavigate) e.currentTarget.style.background = '#f9fafb';
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.background = 'transparent';
                  }}
                >
                  {/* Icon */}
                  <div style={{
                    width: '32px',
                    height: '32px',
                    borderRadius: '50%',
                    background: config.bgColor,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    flexShrink: 0
                  }}>
                    <IconComponent size={16} color={config.color} />
                  </div>

                  {/* Content */}
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'start', gap: '8px' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flexWrap: 'wrap' }}>
                        <span style={{ fontWeight: '600', fontSize: '13px', color: config.color }}>
                          {event.entityNumber || `#${event.entityId}`}
                        </span>
                        <span style={{
                          padding: '2px 6px',
                          borderRadius: '4px',
                          fontSize: '10px',
                          fontWeight: '600',
                          background: statusColor.bg,
                          color: statusColor.text,
                          textTransform: 'uppercase'
                        }}>
                          {event.status || 'unknown'}
                        </span>
                        {event.amount > 0 && (
                          <span style={{ fontSize: '12px', color: '#22c55e', fontWeight: '600' }}>
                            {formatCurrency(event.amount)}
                          </span>
                        )}
                      </div>
                      <span style={{ fontSize: '11px', color: '#9ca3af', whiteSpace: 'nowrap' }}>
                        {formatRelativeTime(event.timestamp)}
                      </span>
                    </div>
                    <p style={{
                      margin: '4px 0 0',
                      fontSize: '12px',
                      color: '#6b7280'
                    }}>
                      {event.customerName && (
                        <>
                          <span style={{ color: '#374151' }}>{event.customerName}</span>
                          <span> - </span>
                        </>
                      )}
                      {event.description || `${config.label} ${event.status?.toLowerCase() || 'created'}`}
                    </p>
                  </div>

                  {/* Arrow */}
                  {onNavigate && (
                    <div style={{ display: 'flex', alignItems: 'center' }}>
                      <ArrowRight size={14} color="#9ca3af" />
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Footer - View All Link */}
      {filteredEvents.length > 0 && (
        <div style={{
          padding: '12px 20px',
          borderTop: '1px solid #f3f4f6',
          textAlign: 'center'
        }}>
          <button
            onClick={() => onNavigate?.('activities')}
            style={{
              padding: '8px 16px',
              background: 'transparent',
              border: 'none',
              color: '#6366f1',
              fontSize: '13px',
              fontWeight: '500',
              cursor: 'pointer',
              display: 'inline-flex',
              alignItems: 'center',
              gap: '4px'
            }}
          >
            View All Activity
            <ArrowRight size={14} />
          </button>
        </div>
      )}
    </div>
  );
};

export default UnifiedTimeline;
