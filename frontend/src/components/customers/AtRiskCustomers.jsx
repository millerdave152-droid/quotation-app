/**
 * AtRiskCustomers Component
 * Week 4.4 of 4-week sprint
 *
 * Dashboard widget showing customers with high churn risk,
 * sorted by CLV (highest value at risk first).
 */

import React, { useState, useEffect, useCallback } from 'react';
import CustomerHealth from './CustomerHealth';

const API_BASE = `${process.env.REACT_APP_API_URL || 'http://localhost:3001'}/api`;

// Helper to get auth headers
const getAuthHeaders = () => {
  const token = localStorage.getItem('auth_token');
  return {
    'Content-Type': 'application/json',
    ...(token && { 'Authorization': `Bearer ${token}` })
  };
};

/**
 * Format currency value
 */
const formatCurrency = (cents) => {
  if (!cents) return '$0.00';
  return `$${(cents / 100).toFixed(2).replace(/\B(?=(\d{3})+(?!\d))/g, ',')}`;
};

/**
 * Customer Row Component
 */
const CustomerRow = ({ customer, onViewProfile, onScheduleFollowUp }) => {
  const churnRiskColors = {
    high: '#ef4444',
    medium: '#f59e0b',
    low: '#22c55e'
  };

  const segmentColors = {
    platinum: { bg: '#1e293b', text: '#a78bfa' },
    gold: { bg: '#78350f', text: '#fbbf24' },
    silver: { bg: '#374151', text: '#e2e8f0' },
    bronze: { bg: '#451a03', text: '#fcd34d' }
  };

  const segment = customer.clv?.segment;
  const segmentStyle = segmentColors[segment] || { bg: '#6b7280', text: 'white' };

  return (
    <div style={{
      padding: '16px',
      borderBottom: '1px solid #e5e7eb',
      display: 'flex',
      alignItems: 'center',
      gap: '16px',
      transition: 'background 0.15s',
      cursor: 'pointer'
    }}
    onMouseEnter={(e) => e.currentTarget.style.background = '#f9fafb'}
    onMouseLeave={(e) => e.currentTarget.style.background = 'white'}
    onClick={() => onViewProfile?.(customer)}
    >
      {/* Customer Info */}
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '4px' }}>
          <span style={{ fontWeight: '600', color: '#111827', fontSize: '14px' }}>
            {customer.name}
          </span>
          {segment && (
            <span style={{
              fontSize: '10px',
              fontWeight: '700',
              padding: '2px 8px',
              borderRadius: '10px',
              background: segmentStyle.bg,
              color: segmentStyle.text,
              textTransform: 'uppercase',
              letterSpacing: '0.5px'
            }}>
              {segment}
            </span>
          )}
        </div>
        <div style={{ fontSize: '12px', color: '#6b7280' }}>
          {customer.company && <span>{customer.company} &middot; </span>}
          {customer.email || customer.phone || 'No contact info'}
        </div>
      </div>

      {/* CLV Value */}
      <div style={{ textAlign: 'right', minWidth: '80px' }}>
        <div style={{ fontSize: '16px', fontWeight: '700', color: '#111827' }}>
          {formatCurrency(customer.clv?.score)}
        </div>
        <div style={{ fontSize: '11px', color: '#6b7280' }}>CLV</div>
      </div>

      {/* Days Since Activity */}
      <div style={{ textAlign: 'center', minWidth: '60px' }}>
        <div style={{
          fontSize: '14px',
          fontWeight: '600',
          color: customer.engagement?.daysSinceLastActivity > 90 ? '#ef4444' :
                 customer.engagement?.daysSinceLastActivity > 60 ? '#f59e0b' : '#374151'
        }}>
          {customer.engagement?.daysSinceLastActivity ?? '-'}
        </div>
        <div style={{ fontSize: '11px', color: '#6b7280' }}>Days Idle</div>
      </div>

      {/* Risk Badge */}
      <div style={{
        padding: '6px 12px',
        borderRadius: '16px',
        background: churnRiskColors[customer.engagement?.churnRisk] || '#6b7280',
        color: 'white',
        fontSize: '11px',
        fontWeight: '600',
        textTransform: 'uppercase',
        minWidth: '50px',
        textAlign: 'center'
      }}>
        {customer.engagement?.churnRisk || 'Unknown'}
      </div>

      {/* Actions */}
      <div style={{ display: 'flex', gap: '8px' }}>
        <button
          onClick={(e) => {
            e.stopPropagation();
            onScheduleFollowUp?.(customer);
          }}
          style={{
            padding: '8px 12px',
            background: '#3b82f6',
            color: 'white',
            border: 'none',
            borderRadius: '6px',
            fontSize: '12px',
            fontWeight: '500',
            cursor: 'pointer',
            whiteSpace: 'nowrap'
          }}
          title="Schedule follow-up"
        >
          Follow Up
        </button>
      </div>
    </div>
  );
};

/**
 * Loading Skeleton
 */
const LoadingSkeleton = ({ rows = 5 }) => (
  <div>
    {Array.from({ length: rows }).map((_, i) => (
      <div key={i} style={{
        padding: '16px',
        borderBottom: '1px solid #e5e7eb',
        display: 'flex',
        gap: '16px',
        alignItems: 'center'
      }}>
        <div style={{ flex: 1 }}>
          <div style={{
            height: '14px',
            width: '60%',
            background: 'linear-gradient(90deg, #f0f0f0 25%, #e0e0e0 50%, #f0f0f0 75%)',
            backgroundSize: '200% 100%',
            animation: 'shimmer 1.5s infinite',
            borderRadius: '4px',
            marginBottom: '8px'
          }} />
          <div style={{
            height: '12px',
            width: '40%',
            background: 'linear-gradient(90deg, #f0f0f0 25%, #e0e0e0 50%, #f0f0f0 75%)',
            backgroundSize: '200% 100%',
            animation: 'shimmer 1.5s infinite',
            borderRadius: '4px'
          }} />
        </div>
        <div style={{
          height: '32px',
          width: '80px',
          background: 'linear-gradient(90deg, #f0f0f0 25%, #e0e0e0 50%, #f0f0f0 75%)',
          backgroundSize: '200% 100%',
          animation: 'shimmer 1.5s infinite',
          borderRadius: '16px'
        }} />
      </div>
    ))}
  </div>
);

/**
 * Summary Stats Component
 */
const SummaryStats = ({ customers }) => {
  const totalAtRiskCLV = customers.reduce((sum, c) => sum + (c.clv?.score || 0), 0);
  const avgIdleDays = customers.length > 0
    ? Math.round(customers.reduce((sum, c) => sum + (c.engagement?.daysSinceLastActivity || 0), 0) / customers.length)
    : 0;

  return (
    <div style={{
      display: 'grid',
      gridTemplateColumns: 'repeat(3, 1fr)',
      gap: '12px',
      padding: '16px',
      background: '#fef2f2',
      borderBottom: '1px solid #fecaca'
    }}>
      <div style={{ textAlign: 'center' }}>
        <div style={{ fontSize: '20px', fontWeight: '700', color: '#dc2626' }}>
          {customers.length}
        </div>
        <div style={{ fontSize: '11px', color: '#991b1b' }}>At-Risk Customers</div>
      </div>
      <div style={{ textAlign: 'center' }}>
        <div style={{ fontSize: '20px', fontWeight: '700', color: '#dc2626' }}>
          {formatCurrency(totalAtRiskCLV)}
        </div>
        <div style={{ fontSize: '11px', color: '#991b1b' }}>Value at Risk</div>
      </div>
      <div style={{ textAlign: 'center' }}>
        <div style={{ fontSize: '20px', fontWeight: '700', color: '#dc2626' }}>
          {avgIdleDays}
        </div>
        <div style={{ fontSize: '11px', color: '#991b1b' }}>Avg Days Idle</div>
      </div>
    </div>
  );
};

/**
 * Main AtRiskCustomers Component
 */
const AtRiskCustomers = ({
  limit = 10,
  showHeader = true,
  showSummary = true,
  onViewProfile,
  onScheduleFollowUp,
  onViewAll,
  className = ''
}) => {
  const [customers, setCustomers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const fetchAtRiskCustomers = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);

      const response = await fetch(`${API_BASE}/customers/at-risk?limit=${limit}`, {
        headers: getAuthHeaders()
      });

      if (!response.ok) {
        throw new Error('Failed to fetch at-risk customers');
      }

      const data = await response.json();
      setCustomers(data.customers || []);
    } catch (err) {
      console.error('Error fetching at-risk customers:', err);
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [limit]);

  useEffect(() => {
    fetchAtRiskCustomers();
  }, [fetchAtRiskCustomers]);

  const handleViewProfile = (customer) => {
    if (onViewProfile) {
      onViewProfile(customer);
    } else {
      // Default: navigate to customer management with customer selected
      window.location.href = `/customers?selected=${customer.id}`;
    }
  };

  const handleScheduleFollowUp = (customer) => {
    if (onScheduleFollowUp) {
      onScheduleFollowUp(customer);
    } else {
      // Default: show alert with customer info
      alert(`Schedule follow-up for ${customer.name}\nEmail: ${customer.email || 'N/A'}\nPhone: ${customer.phone || 'N/A'}`);
    }
  };

  return (
    <div
      className={className}
      style={{
        background: 'white',
        borderRadius: '12px',
        boxShadow: '0 1px 3px rgba(0,0,0,0.1)',
        overflow: 'hidden'
      }}
    >
      {/* Header */}
      {showHeader && (
        <div style={{
          padding: '16px 20px',
          borderBottom: '1px solid #e5e7eb',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center'
        }}>
          <div>
            <h3 style={{ margin: 0, fontSize: '16px', fontWeight: '600', color: '#111827' }}>
              At-Risk Customers
            </h3>
            <p style={{ margin: '4px 0 0 0', fontSize: '12px', color: '#6b7280' }}>
              High churn risk, sorted by value
            </p>
          </div>
          <div style={{ display: 'flex', gap: '8px' }}>
            <button
              onClick={fetchAtRiskCustomers}
              disabled={loading}
              style={{
                padding: '8px 12px',
                background: 'white',
                color: '#374151',
                border: '1px solid #d1d5db',
                borderRadius: '6px',
                fontSize: '12px',
                cursor: loading ? 'wait' : 'pointer',
                opacity: loading ? 0.6 : 1
              }}
            >
              Refresh
            </button>
            {onViewAll && (
              <button
                onClick={onViewAll}
                style={{
                  padding: '8px 12px',
                  background: '#ef4444',
                  color: 'white',
                  border: 'none',
                  borderRadius: '6px',
                  fontSize: '12px',
                  fontWeight: '500',
                  cursor: 'pointer'
                }}
              >
                View All
              </button>
            )}
          </div>
        </div>
      )}

      {/* Summary Stats */}
      {showSummary && !loading && customers.length > 0 && (
        <SummaryStats customers={customers} />
      )}

      {/* Content */}
      <div style={{ maxHeight: '400px', overflowY: 'auto' }}>
        {loading ? (
          <LoadingSkeleton rows={5} />
        ) : error ? (
          <div style={{
            padding: '40px 20px',
            textAlign: 'center',
            color: '#6b7280'
          }}>
            <div style={{ fontSize: '24px', marginBottom: '8px' }}>!</div>
            <div style={{ fontSize: '14px' }}>{error}</div>
            <button
              onClick={fetchAtRiskCustomers}
              style={{
                marginTop: '12px',
                padding: '8px 16px',
                background: '#3b82f6',
                color: 'white',
                border: 'none',
                borderRadius: '6px',
                fontSize: '13px',
                cursor: 'pointer'
              }}
            >
              Try Again
            </button>
          </div>
        ) : customers.length === 0 ? (
          <div style={{
            padding: '40px 20px',
            textAlign: 'center',
            color: '#6b7280'
          }}>
            <div style={{ fontSize: '32px', marginBottom: '8px' }}>-</div>
            <div style={{ fontSize: '14px', fontWeight: '500' }}>No at-risk customers</div>
            <div style={{ fontSize: '12px', marginTop: '4px' }}>
              All customers are in good standing
            </div>
          </div>
        ) : (
          customers.map((customer) => (
            <CustomerRow
              key={customer.id}
              customer={customer}
              onViewProfile={handleViewProfile}
              onScheduleFollowUp={handleScheduleFollowUp}
            />
          ))
        )}
      </div>

      {/* Footer */}
      {!loading && customers.length > 0 && (
        <div style={{
          padding: '12px 16px',
          borderTop: '1px solid #e5e7eb',
          background: '#f9fafb',
          fontSize: '12px',
          color: '#6b7280',
          textAlign: 'center'
        }}>
          Showing {customers.length} customer{customers.length !== 1 ? 's' : ''} with high churn risk
        </div>
      )}

      <style>{`
        @keyframes shimmer {
          0% { background-position: -200% 0; }
          100% { background-position: 200% 0; }
        }
      `}</style>
    </div>
  );
};

export default AtRiskCustomers;
