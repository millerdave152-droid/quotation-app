/**
 * TeleTime - Pending Amendments Dashboard
 * Manager/admin approval queue for order amendments.
 * Supports filtering, sorting, approve/reject workflows.
 */

import React, { useState, useEffect, useCallback } from 'react';
import { useAuth } from '../../contexts/AuthContext';
import { authFetch } from '../../services/authFetch';

const API_URL = process.env.REACT_APP_API_URL || 'http://localhost:3001';

// ============================================================================
// HELPERS
// ============================================================================

const formatDate = (dateStr) => {
  if (!dateStr) return '-';
  return new Date(dateStr).toLocaleDateString('en-CA', {
    year: 'numeric', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit'
  });
};

const formatMoney = (cents) => {
  const num = (parseFloat(cents) || 0) / 100;
  return num.toLocaleString('en-CA', { style: 'currency', currency: 'CAD' });
};

const AMENDMENT_TYPES = [
  { value: '', label: 'All Types' },
  { value: 'item_added', label: 'Item Added' },
  { value: 'item_removed', label: 'Item Removed' },
  { value: 'item_modified', label: 'Item Modified' },
  { value: 'quantity_changed', label: 'Quantity Changed' },
  { value: 'price_changed', label: 'Price Changed' },
  { value: 'discount_changed', label: 'Discount Changed' },
];

const getTypeColor = (type) => {
  const colors = {
    item_added: { bg: '#d1fae5', text: '#065f46' },
    item_removed: { bg: '#fee2e2', text: '#991b1b' },
    item_modified: { bg: '#dbeafe', text: '#1e40af' },
    quantity_changed: { bg: '#fef3c7', text: '#92400e' },
    price_changed: { bg: '#fce7f3', text: '#9d174d' },
    discount_changed: { bg: '#ede9fe', text: '#5b21b6' },
  };
  return colors[type] || { bg: '#f3f4f6', text: '#6b7280' };
};

// ============================================================================
// TYPE BADGE
// ============================================================================

function TypeBadge({ type }) {
  const color = getTypeColor(type);
  return (
    <span style={{
      display: 'inline-block',
      padding: '2px 10px',
      borderRadius: '12px',
      fontSize: '12px',
      fontWeight: 600,
      background: color.bg,
      color: color.text,
      textTransform: 'capitalize',
      whiteSpace: 'nowrap',
    }}>
      {(type || '').replace(/_/g, ' ')}
    </span>
  );
}

// ============================================================================
// FINANCIAL IMPACT DISPLAY
// ============================================================================

function FinancialImpact({ cents }) {
  const val = parseFloat(cents) || 0;
  const isPositive = val >= 0;
  return (
    <span style={{
      fontWeight: 600,
      fontSize: '14px',
      color: isPositive ? '#16a34a' : '#dc2626',
    }}>
      {val > 0 ? '+' : ''}{formatMoney(cents)}
    </span>
  );
}

// ============================================================================
// REJECT MODAL
// ============================================================================

function RejectModal({ amendment, onConfirm, onCancel, submitting }) {
  const [reason, setReason] = useState('');

  return (
    <div style={{
      position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
      background: 'rgba(0,0,0,0.5)', display: 'flex',
      alignItems: 'center', justifyContent: 'center', zIndex: 1000,
    }}>
      <div style={{
        background: 'white', borderRadius: '12px', padding: '24px',
        width: '100%', maxWidth: '480px', boxShadow: '0 20px 60px rgba(0,0,0,0.2)',
      }}>
        <h3 style={{ margin: '0 0 8px', fontSize: '18px', fontWeight: 700, color: '#111827' }}>
          Reject Amendment
        </h3>
        <p style={{ margin: '0 0 16px', fontSize: '14px', color: '#6b7280' }}>
          Rejecting amendment #{amendment?.id} for Order #{amendment?.order_id}.
          Please provide a reason.
        </p>
        <textarea
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          placeholder="Reason for rejection..."
          rows={4}
          style={{
            width: '100%', padding: '10px 12px', borderRadius: '8px',
            border: '1px solid #d1d5db', resize: 'vertical', marginBottom: '16px',
            fontSize: '14px', fontFamily: 'inherit', boxSizing: 'border-box',
          }}
          autoFocus
        />
        <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end' }}>
          <button
            onClick={onCancel}
            disabled={submitting}
            style={{
              padding: '8px 20px', background: '#f3f4f6', color: '#374151',
              border: 'none', borderRadius: '8px', cursor: 'pointer',
              fontSize: '14px', fontWeight: 500,
            }}
          >
            Cancel
          </button>
          <button
            onClick={() => onConfirm(reason)}
            disabled={!reason.trim() || submitting}
            style={{
              padding: '8px 20px',
              background: reason.trim() && !submitting ? '#dc2626' : '#d1d5db',
              color: 'white', border: 'none', borderRadius: '8px',
              cursor: reason.trim() && !submitting ? 'pointer' : 'not-allowed',
              fontSize: '14px', fontWeight: 500,
            }}
          >
            {submitting ? 'Rejecting...' : 'Reject'}
          </button>
        </div>
      </div>
    </div>
  );
}

// ============================================================================
// MAIN COMPONENT
// ============================================================================

export default function PendingAmendments() {
  const { token } = useAuth();

  // Data state
  const [amendments, setAmendments] = useState([]);
  const [totalCount, setTotalCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  // Filter state
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [typeFilter, setTypeFilter] = useState('');
  const [requestedByFilter, setRequestedByFilter] = useState('');

  // Sort state
  const [sortBy, setSortBy] = useState('date'); // 'date' or 'impact'

  // Action state
  const [approving, setApproving] = useState(null); // amendment id being approved
  const [rejectTarget, setRejectTarget] = useState(null); // amendment being rejected
  const [submitting, setSubmitting] = useState(false);
  const [actionMessage, setActionMessage] = useState(null); // { type: 'success'|'error', text }

  // -------------------------------------------------------------------------
  // FETCH AMENDMENTS
  // -------------------------------------------------------------------------

  const fetchAmendments = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams();
      if (dateFrom) params.set('date_from', dateFrom);
      if (dateTo) params.set('date_to', dateTo);
      if (typeFilter) params.set('type', typeFilter);
      if (requestedByFilter) params.set('requested_by', requestedByFilter);
      params.set('sort', sortBy);

      const qs = params.toString();
      const res = await authFetch(`${API_URL}/api/order-modifications/amendments/pending${qs ? '?' + qs : ''}`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      const data = await res.json();
      if (data.success) {
        setAmendments(data.data?.amendments || data.data || []);
        setTotalCount(data.data?.total ?? (data.data?.amendments || data.data || []).length);
      } else {
        setError(data.message || 'Failed to fetch pending amendments');
      }
    } catch (err) {
      console.error('Failed to fetch pending amendments:', err);
      setError('Failed to load pending amendments. Please try again.');
    } finally {
      setLoading(false);
    }
  }, [token, dateFrom, dateTo, typeFilter, requestedByFilter, sortBy]);

  useEffect(() => { fetchAmendments(); }, [fetchAmendments]);

  // Auto-refresh every 30 seconds
  useEffect(() => {
    const interval = setInterval(fetchAmendments, 30000);
    return () => clearInterval(interval);
  }, [fetchAmendments]);

  // Clear action message after 4 seconds
  useEffect(() => {
    if (actionMessage) {
      const timer = setTimeout(() => setActionMessage(null), 4000);
      return () => clearTimeout(timer);
    }
  }, [actionMessage]);

  // -------------------------------------------------------------------------
  // APPROVE
  // -------------------------------------------------------------------------

  const handleApprove = async (amendmentId) => {
    setApproving(amendmentId);
    try {
      const res = await authFetch(`${API_URL}/api/order-modifications/amendments/${amendmentId}/approve`, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({})
      });
      const data = await res.json();
      if (data.success) {
        setActionMessage({ type: 'success', text: `Amendment #${amendmentId} approved successfully.` });
        fetchAmendments();
      } else {
        setActionMessage({ type: 'error', text: data.message || 'Failed to approve amendment.' });
      }
    } catch (err) {
      console.error('Approve failed:', err);
      setActionMessage({ type: 'error', text: 'Failed to approve amendment. Please try again.' });
    } finally {
      setApproving(null);
    }
  };

  // -------------------------------------------------------------------------
  // REJECT
  // -------------------------------------------------------------------------

  const handleReject = async (reason) => {
    if (!rejectTarget) return;
    setSubmitting(true);
    try {
      const res = await authFetch(`${API_URL}/api/order-modifications/amendments/${rejectTarget.id}/reject`, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ reason })
      });
      const data = await res.json();
      if (data.success) {
        setActionMessage({ type: 'success', text: `Amendment #${rejectTarget.id} rejected.` });
        setRejectTarget(null);
        fetchAmendments();
      } else {
        setActionMessage({ type: 'error', text: data.message || 'Failed to reject amendment.' });
      }
    } catch (err) {
      console.error('Reject failed:', err);
      setActionMessage({ type: 'error', text: 'Failed to reject amendment. Please try again.' });
    } finally {
      setSubmitting(false);
    }
  };

  // -------------------------------------------------------------------------
  // CLEAR FILTERS
  // -------------------------------------------------------------------------

  const clearFilters = () => {
    setDateFrom('');
    setDateTo('');
    setTypeFilter('');
    setRequestedByFilter('');
    setSortBy('date');
  };

  const hasFilters = dateFrom || dateTo || typeFilter || requestedByFilter;

  // -------------------------------------------------------------------------
  // RENDER
  // -------------------------------------------------------------------------

  return (
    <div style={{ padding: '24px', maxWidth: '1400px', margin: '0 auto' }}>
      {/* Header */}
      <div style={{ marginBottom: '24px', display: 'flex', alignItems: 'center', gap: '12px' }}>
        <h1 style={{ margin: 0, fontSize: '28px', fontWeight: 700, color: '#111827' }}>
          Pending Amendments
        </h1>
        {!loading && (
          <span style={{
            display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
            minWidth: '28px', height: '28px', padding: '0 8px',
            borderRadius: '14px', fontSize: '14px', fontWeight: 700,
            background: totalCount > 0 ? '#dc2626' : '#9ca3af',
            color: 'white',
          }}>
            {totalCount}
          </span>
        )}
      </div>

      {/* Action Feedback */}
      {actionMessage && (
        <div style={{
          padding: '12px 16px', borderRadius: '8px', marginBottom: '16px',
          fontSize: '14px', fontWeight: 500,
          background: actionMessage.type === 'success' ? '#d1fae5' : '#fee2e2',
          color: actionMessage.type === 'success' ? '#065f46' : '#991b1b',
          border: `1px solid ${actionMessage.type === 'success' ? '#a7f3d0' : '#fecaca'}`,
        }}>
          {actionMessage.text}
        </div>
      )}

      {/* Filters Bar */}
      <div style={{
        background: 'white', borderRadius: '12px', padding: '16px',
        boxShadow: '0 1px 3px rgba(0,0,0,0.1)', marginBottom: '16px',
      }}>
        <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap', alignItems: 'flex-end' }}>
          {/* Date From */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
            <label style={filterLabelStyle}>From</label>
            <input
              type="date"
              value={dateFrom}
              onChange={(e) => setDateFrom(e.target.value)}
              style={filterInputStyle}
            />
          </div>

          {/* Date To */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
            <label style={filterLabelStyle}>To</label>
            <input
              type="date"
              value={dateTo}
              onChange={(e) => setDateTo(e.target.value)}
              style={filterInputStyle}
            />
          </div>

          {/* Type Filter */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
            <label style={filterLabelStyle}>Amendment Type</label>
            <select
              value={typeFilter}
              onChange={(e) => setTypeFilter(e.target.value)}
              style={{ ...filterInputStyle, minWidth: '160px' }}
            >
              {AMENDMENT_TYPES.map(t => (
                <option key={t.value} value={t.value}>{t.label}</option>
              ))}
            </select>
          </div>

          {/* Requested By */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
            <label style={filterLabelStyle}>Requested By</label>
            <input
              type="text"
              value={requestedByFilter}
              onChange={(e) => setRequestedByFilter(e.target.value)}
              placeholder="Search user..."
              style={{ ...filterInputStyle, minWidth: '160px' }}
            />
          </div>

          {/* Sort */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
            <label style={filterLabelStyle}>Sort By</label>
            <select
              value={sortBy}
              onChange={(e) => setSortBy(e.target.value)}
              style={filterInputStyle}
            >
              <option value="date">Newest First</option>
              <option value="impact">Largest Impact</option>
            </select>
          </div>

          {/* Clear Filters */}
          {hasFilters && (
            <button
              onClick={clearFilters}
              style={{
                padding: '8px 16px', background: '#f3f4f6', color: '#6b7280',
                border: 'none', borderRadius: '8px', cursor: 'pointer',
                fontSize: '13px', fontWeight: 500, alignSelf: 'flex-end',
              }}
            >
              Clear Filters
            </button>
          )}
        </div>
      </div>

      {/* Content */}
      {loading ? (
        <div style={{ textAlign: 'center', padding: '60px 20px' }}>
          <div style={{
            width: '40px', height: '40px', border: '3px solid #e5e7eb',
            borderTopColor: '#667eea', borderRadius: '50%',
            animation: 'spin 0.8s linear infinite',
            margin: '0 auto 16px',
          }} />
          <p style={{ color: '#9ca3af', fontSize: '14px', margin: 0 }}>Loading pending amendments...</p>
          <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
        </div>
      ) : error ? (
        <div style={{
          textAlign: 'center', padding: '60px 20px',
          background: '#fee2e2', borderRadius: '12px',
        }}>
          <p style={{ color: '#991b1b', fontSize: '16px', fontWeight: 600, margin: '0 0 12px' }}>
            {error}
          </p>
          <button
            onClick={fetchAmendments}
            style={{
              padding: '8px 24px', background: '#dc2626', color: 'white',
              border: 'none', borderRadius: '8px', cursor: 'pointer',
              fontSize: '14px', fontWeight: 500,
            }}
          >
            Retry
          </button>
        </div>
      ) : amendments.length === 0 ? (
        <div style={{
          textAlign: 'center', padding: '60px 20px',
          background: 'white', borderRadius: '12px',
          boxShadow: '0 1px 3px rgba(0,0,0,0.1)',
        }}>
          <div style={{ fontSize: '48px', marginBottom: '12px', opacity: 0.4 }}>&#9745;</div>
          <p style={{ color: '#6b7280', fontSize: '16px', fontWeight: 500, margin: '0 0 4px' }}>
            No pending amendments
          </p>
          <p style={{ color: '#9ca3af', fontSize: '14px', margin: 0 }}>
            All order amendments have been reviewed.
          </p>
        </div>
      ) : (
        <div style={{
          background: 'white', borderRadius: '12px',
          boxShadow: '0 1px 3px rgba(0,0,0,0.1)', overflow: 'hidden',
        }}>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr style={{ borderBottom: '2px solid #e5e7eb' }}>
                <th style={thStyle}>Amendment #</th>
                <th style={thStyle}>Order #</th>
                <th style={thStyle}>Customer</th>
                <th style={thStyle}>Requested By</th>
                <th style={thStyle}>Date</th>
                <th style={thStyle}>Type</th>
                <th style={thStyle}>Financial Impact</th>
                <th style={{ ...thStyle, textAlign: 'right' }}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {amendments.map((a) => (
                <tr key={a.id} style={{ borderBottom: '1px solid #f3f4f6' }}>
                  <td style={tdStyle}>
                    <span style={{ fontWeight: 600, color: '#111827' }}>#{a.id}</span>
                  </td>
                  <td style={tdStyle}>
                    <span style={{ fontWeight: 500, color: '#374151' }}>#{a.order_id}</span>
                  </td>
                  <td style={tdStyle}>
                    <span style={{ fontSize: '14px', color: '#374151' }}>
                      {a.customer_name || a.customer || '-'}
                    </span>
                  </td>
                  <td style={tdStyle}>
                    <span style={{ fontSize: '14px', color: '#374151' }}>
                      {a.requested_by_name || a.requested_by || '-'}
                    </span>
                  </td>
                  <td style={tdStyle}>
                    <span style={{ fontSize: '12px', color: '#6b7280' }}>
                      {formatDate(a.created_at)}
                    </span>
                  </td>
                  <td style={tdStyle}>
                    <TypeBadge type={a.amendment_type || a.type} />
                  </td>
                  <td style={tdStyle}>
                    <FinancialImpact cents={a.financial_impact ?? a.price_difference ?? 0} />
                  </td>
                  <td style={{ ...tdStyle, textAlign: 'right' }}>
                    <div style={{ display: 'flex', gap: '6px', justifyContent: 'flex-end' }}>
                      {/* View Order */}
                      <button
                        onClick={() => window.open(`/quotes/${a.order_id}`, '_blank')}
                        style={{
                          padding: '6px 12px', background: '#f3f4f6', color: '#374151',
                          border: 'none', borderRadius: '6px', cursor: 'pointer',
                          fontSize: '12px', fontWeight: 500,
                        }}
                        title="View order in new tab"
                      >
                        View Order
                      </button>
                      {/* Approve */}
                      <button
                        onClick={() => handleApprove(a.id)}
                        disabled={approving === a.id}
                        style={{
                          padding: '6px 12px',
                          background: approving === a.id ? '#86efac' : '#16a34a',
                          color: 'white', border: 'none', borderRadius: '6px',
                          cursor: approving === a.id ? 'not-allowed' : 'pointer',
                          fontSize: '12px', fontWeight: 600,
                        }}
                      >
                        {approving === a.id ? 'Approving...' : 'Approve'}
                      </button>
                      {/* Reject */}
                      <button
                        onClick={() => setRejectTarget(a)}
                        style={{
                          padding: '6px 12px', background: '#dc2626', color: 'white',
                          border: 'none', borderRadius: '6px', cursor: 'pointer',
                          fontSize: '12px', fontWeight: 600,
                        }}
                      >
                        Reject
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Reject Modal */}
      {rejectTarget && (
        <RejectModal
          amendment={rejectTarget}
          onConfirm={handleReject}
          onCancel={() => setRejectTarget(null)}
          submitting={submitting}
        />
      )}
    </div>
  );
}

// ============================================================================
// SHARED STYLES
// ============================================================================

const thStyle = {
  textAlign: 'left', padding: '10px 12px', fontSize: '12px',
  fontWeight: 600, color: '#6b7280', textTransform: 'uppercase',
  letterSpacing: '0.05em',
};

const tdStyle = {
  padding: '10px 12px', fontSize: '14px', verticalAlign: 'middle',
};

const filterLabelStyle = {
  fontSize: '12px', fontWeight: 600, color: '#6b7280',
  textTransform: 'uppercase', letterSpacing: '0.05em',
};

const filterInputStyle = {
  padding: '8px 12px', borderRadius: '8px',
  border: '1px solid #d1d5db', fontSize: '14px',
  fontFamily: 'inherit', background: 'white',
};
