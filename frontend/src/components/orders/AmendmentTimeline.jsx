/**
 * TeleTime - Amendment Timeline
 *
 * Reusable component that shows the amendment history for a single order
 * as a vertical timeline with expandable detail sections and credit memo links.
 */

import React, { useState, useEffect, useCallback } from 'react';
import { authFetch } from '../../services/authFetch';

const API_URL = process.env.REACT_APP_API_URL || '';

// ============================================================================
// FORMATTING HELPERS
// ============================================================================

const fmtMoney = (dollars) => {
  if (dollars == null) return '$0.00';
  return Math.abs(dollars).toLocaleString('en-CA', {
    style: 'currency',
    currency: 'CAD',
  });
};

const fmtTimestamp = (timestamp) => {
  if (!timestamp) return '-';
  return new Date(timestamp).toLocaleString('en-CA', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
};

// ============================================================================
// TYPE LABELS AND COLORS
// ============================================================================

const typeLabels = {
  item_added: 'Item Added',
  item_removed: 'Item Removed',
  item_modified: 'Item Modified',
  quantity_changed: 'Qty Changed',
  price_changed: 'Price Changed',
  discount_changed: 'Discount Changed',
  fulfillment_updated: 'Fulfillment Updated',
  order_cancelled: 'Order Cancelled',
  order_reinstated: 'Order Reinstated',
};

const typeColors = {
  item_added: { bg: '#dcfce7', text: '#166534' },
  item_removed: { bg: '#fee2e2', text: '#991b1b' },
  item_modified: { bg: '#dbeafe', text: '#1e40af' },
  quantity_changed: { bg: '#fef3c7', text: '#92400e' },
  price_changed: { bg: '#e0e7ff', text: '#3730a3' },
  discount_changed: { bg: '#fce7f3', text: '#9d174d' },
  fulfillment_updated: { bg: '#ccfbf1', text: '#115e59' },
  order_cancelled: { bg: '#fee2e2', text: '#991b1b' },
  order_reinstated: { bg: '#dcfce7', text: '#166534' },
};

const statusColors = {
  draft: { dot: '#9ca3af', bg: '#f3f4f6', text: '#374151' },
  pending_approval: { dot: '#f59e0b', bg: '#fef3c7', text: '#92400e' },
  approved: { dot: '#3b82f6', bg: '#dbeafe', text: '#1e40af' },
  rejected: { dot: '#ef4444', bg: '#fee2e2', text: '#991b1b' },
  applied: { dot: '#10b981', bg: '#dcfce7', text: '#166534' },
  cancelled: { dot: '#9ca3af', bg: '#f3f4f6', text: '#374151' },
};

const statusLabels = {
  draft: 'Draft',
  pending_approval: 'Pending Approval',
  approved: 'Approved',
  rejected: 'Rejected',
  applied: 'Applied',
  cancelled: 'Cancelled',
};

// ============================================================================
// SUB-COMPONENTS
// ============================================================================

function TypeBadge({ amendmentType }) {
  const label = typeLabels[amendmentType] || amendmentType;
  const colors = typeColors[amendmentType] || { bg: '#f3f4f6', text: '#374151' };
  return (
    <span
      style={{
        display: 'inline-block',
        padding: '2px 10px',
        borderRadius: '12px',
        fontSize: '11px',
        fontWeight: 600,
        background: colors.bg,
        color: colors.text,
        whiteSpace: 'nowrap',
      }}
    >
      {label}
    </span>
  );
}

function StatusBadge({ status }) {
  const colors = statusColors[status] || statusColors.draft;
  const label = statusLabels[status] || status;
  return (
    <span
      style={{
        display: 'inline-block',
        padding: '2px 10px',
        borderRadius: '12px',
        fontSize: '11px',
        fontWeight: 600,
        background: colors.bg,
        color: colors.text,
        whiteSpace: 'nowrap',
      }}
    >
      {label}
    </span>
  );
}

function FinancialImpact({ difference }) {
  if (difference == null || difference === 0) return null;
  const isPositive = difference > 0;
  return (
    <span
      style={{
        fontSize: '13px',
        fontWeight: 600,
        color: isPositive ? '#16a34a' : '#dc2626',
      }}
    >
      {isPositive ? '+' : '-'}{fmtMoney(difference)}
    </span>
  );
}

function ItemChangeDescription({ item }) {
  const { changeType, productName, productSku, previousQuantity, newQuantity, appliedPrice } = item;
  const name = productName || productSku || 'Unknown item';

  if (changeType === 'added') {
    return (
      <div style={{ fontSize: '13px', color: '#374151', padding: '3px 0' }}>
        <span style={{ color: '#16a34a', fontWeight: 600 }}>Added:</span>{' '}
        {name} x {newQuantity} @ {fmtMoney(appliedPrice)}
      </div>
    );
  }

  if (changeType === 'removed') {
    return (
      <div style={{ fontSize: '13px', color: '#374151', padding: '3px 0' }}>
        <span style={{ color: '#dc2626', fontWeight: 600 }}>Removed:</span>{' '}
        {name} x {previousQuantity}
      </div>
    );
  }

  // modified
  return (
    <div style={{ fontSize: '13px', color: '#374151', padding: '3px 0' }}>
      <span style={{ color: '#2563eb', fontWeight: 600 }}>Modified:</span>{' '}
      {name} qty {previousQuantity} &rarr; {newQuantity}
      {appliedPrice != null && <span style={{ color: '#6b7280' }}> @ {fmtMoney(appliedPrice)}</span>}
    </div>
  );
}

function CreditMemoLink({ memo }) {
  const statusStyle = {
    fontSize: '11px',
    fontWeight: 500,
    color: memo.status === 'voided' ? '#991b1b' : '#065f46',
  };
  return (
    <div style={{ fontSize: '13px', color: '#374151', padding: '4px 0' }}>
      <span style={{ color: '#6b7280' }}>Credit Memo:</span>{' '}
      <span
        style={{
          color: '#4f46e5',
          fontWeight: 600,
          cursor: 'pointer',
          textDecoration: 'underline',
        }}
        title={`View credit memo ${memo.creditMemoNumber}`}
      >
        {memo.creditMemoNumber}
      </span>{' '}
      <span style={statusStyle}>({memo.status})</span>
      {memo.totalCents != null && (
        <span style={{ color: '#6b7280', marginLeft: '6px' }}>
          {fmtMoney(memo.totalCents / 100)}
        </span>
      )}
    </div>
  );
}

// ============================================================================
// EXPANDABLE DETAIL
// ============================================================================

function AmendmentDetail({ amendment, creditMemo, token }) {
  const [items, setItems] = useState(null);
  const [loadingItems, setLoadingItems] = useState(false);

  const fetchItems = useCallback(async () => {
    if (items !== null) return; // already loaded
    setLoadingItems(true);
    try {
      const res = await authFetch(
        `${API_URL}/api/order-modifications/amendments/${amendment.id}`,
        { headers: { Authorization: `Bearer ${token}` } }
      );
      const data = await res.json();
      if (data.success && data.data?.items) {
        setItems(data.data.items);
      } else {
        setItems([]);
      }
    } catch (err) {
      console.error('Failed to fetch amendment items:', err);
      setItems([]);
    } finally {
      setLoadingItems(false);
    }
  }, [amendment.id, token, items]);

  useEffect(() => {
    fetchItems();
  }, [fetchItems]);

  return (
    <div
      style={{
        marginTop: '8px',
        padding: '12px',
        background: '#f9fafb',
        borderRadius: '8px',
        borderLeft: '3px solid #e5e7eb',
      }}
    >
      {/* Reason */}
      {amendment.reason && (
        <div style={{ fontSize: '13px', color: '#6b7280', marginBottom: '8px' }}>
          <strong>Reason:</strong> {amendment.reason}
        </div>
      )}

      {/* Item changes */}
      {loadingItems ? (
        <div style={{ fontSize: '13px', color: '#9ca3af', padding: '8px 0' }}>
          Loading item details...
        </div>
      ) : items && items.length > 0 ? (
        <div style={{ marginBottom: '8px' }}>
          <div style={{ fontSize: '12px', fontWeight: 600, color: '#6b7280', marginBottom: '4px' }}>
            Item Changes:
          </div>
          {items.map((item) => (
            <ItemChangeDescription key={item.id} item={item} />
          ))}
        </div>
      ) : items && items.length === 0 ? (
        <div style={{ fontSize: '13px', color: '#9ca3af', marginBottom: '8px' }}>
          No item details available
        </div>
      ) : null}

      {/* Credit memo link */}
      {creditMemo && <CreditMemoLink memo={creditMemo} />}

      {/* Approval / rejection info */}
      {amendment.status === 'approved' && amendment.approvedBy && (
        <div style={{ fontSize: '13px', color: '#2563eb', marginTop: '6px' }}>
          Approved by {amendment.approvedBy}
          {amendment.approvedAt && <span style={{ color: '#9ca3af' }}> on {fmtTimestamp(amendment.approvedAt)}</span>}
        </div>
      )}
      {amendment.status === 'rejected' && (
        <div style={{ fontSize: '13px', color: '#dc2626', marginTop: '6px' }}>
          Rejected by {amendment.approvedBy || 'unknown'}
          {amendment.rejectionReason && (
            <span>: &ldquo;{amendment.rejectionReason}&rdquo;</span>
          )}
        </div>
      )}

      {/* Financial summary */}
      {(amendment.previousTotal != null && amendment.newTotal != null) && (
        <div
          style={{
            fontSize: '12px',
            color: '#9ca3af',
            marginTop: '8px',
            borderTop: '1px solid #e5e7eb',
            paddingTop: '6px',
          }}
        >
          Previous total: {fmtMoney(amendment.previousTotal)} &rarr; New total: {fmtMoney(amendment.newTotal)}
        </div>
      )}
    </div>
  );
}

// ============================================================================
// TIMELINE ENTRY
// ============================================================================

function TimelineEntry({ amendment, creditMemo, isLast, token }) {
  const [expanded, setExpanded] = useState(false);
  const colors = statusColors[amendment.status] || statusColors.draft;

  return (
    <div style={{ display: 'flex', gap: '0', minHeight: '60px' }}>
      {/* Left: dot + line */}
      <div
        style={{
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          width: '24px',
          flexShrink: 0,
        }}
      >
        {/* Dot */}
        <div
          style={{
            width: '12px',
            height: '12px',
            borderRadius: '50%',
            background: colors.dot,
            border: '2px solid white',
            boxShadow: `0 0 0 2px ${colors.dot}`,
            flexShrink: 0,
            marginTop: '4px',
          }}
        />
        {/* Vertical line */}
        {!isLast && (
          <div
            style={{
              width: '2px',
              flex: 1,
              background: '#e5e7eb',
              marginTop: '4px',
            }}
          />
        )}
      </div>

      {/* Right: content */}
      <div style={{ flex: 1, paddingLeft: '12px', paddingBottom: isLast ? '0' : '20px' }}>
        {/* Header line */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            flexWrap: 'wrap',
            gap: '6px',
            marginBottom: '4px',
          }}
        >
          <span style={{ fontSize: '14px', fontWeight: 600, color: '#111827' }}>
            {amendment.amendmentNumber}
          </span>
          {amendment.createdBy && (
            <span style={{ fontSize: '13px', color: '#6b7280' }}>
              created by {amendment.createdBy}
            </span>
          )}
          <span style={{ fontSize: '12px', color: '#9ca3af' }}>
            {fmtTimestamp(amendment.createdAt)}
          </span>
        </div>

        {/* Badges + financial impact row */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            flexWrap: 'wrap',
            gap: '8px',
            marginBottom: '4px',
          }}
        >
          <TypeBadge amendmentType={amendment.amendmentType} />
          <StatusBadge status={amendment.status} />
          <FinancialImpact difference={amendment.difference} />
          {amendment.itemCount > 0 && (
            <span style={{ fontSize: '12px', color: '#9ca3af' }}>
              ({amendment.itemCount} item{amendment.itemCount !== 1 ? 's' : ''})
            </span>
          )}
        </div>

        {/* Expand / collapse toggle */}
        <button
          onClick={() => setExpanded(!expanded)}
          style={{
            background: 'none',
            border: 'none',
            cursor: 'pointer',
            fontSize: '12px',
            color: '#6366f1',
            fontWeight: 500,
            padding: '2px 0',
            marginTop: '2px',
          }}
        >
          {expanded ? 'Hide details' : 'Show details'}
        </button>

        {/* Expandable detail */}
        {expanded && (
          <AmendmentDetail
            amendment={amendment}
            creditMemo={creditMemo}
            token={token}
          />
        )}
      </div>
    </div>
  );
}

// ============================================================================
// MAIN COMPONENT
// ============================================================================

export default function AmendmentTimeline({ orderId }) {
  const [amendments, setAmendments] = useState([]);
  const [creditMemos, setCreditMemos] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const token = localStorage.getItem('token') || localStorage.getItem('auth_token');

  const fetchData = useCallback(async () => {
    if (!orderId) return;
    setLoading(true);
    setError(null);

    try {
      const [amendRes, memoRes] = await Promise.all([
        authFetch(`${API_URL}/api/order-modifications/${orderId}/amendments`, {
          headers: { Authorization: `Bearer ${token}` },
        }),
        authFetch(`${API_URL}/api/credit-memos/order/${orderId}`, {
          headers: { Authorization: `Bearer ${token}` },
        }).catch(() => null), // credit memos are optional
      ]);

      const amendData = await amendRes.json();
      if (amendData.success) {
        setAmendments(amendData.data || []);
      } else {
        setAmendments([]);
      }

      if (memoRes) {
        const memoData = await memoRes.json();
        if (memoData.success) {
          setCreditMemos(memoData.data || []);
        }
      }
    } catch (err) {
      console.error('Failed to fetch amendment timeline:', err);
      setError('Failed to load amendment history');
    } finally {
      setLoading(false);
    }
  }, [orderId, token]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  // Build a lookup of credit memos by amendment_id for quick access
  const memosByAmendment = {};
  creditMemos.forEach((memo) => {
    if (memo.amendmentId) {
      memosByAmendment[memo.amendmentId] = memo;
    }
  });

  // ============================================================================
  // RENDER
  // ============================================================================

  // Loading state
  if (loading) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '40px' }}>
        <div
          style={{
            width: '24px',
            height: '24px',
            border: '3px solid #e5e7eb',
            borderTopColor: '#6366f1',
            borderRadius: '50%',
            animation: 'amendment-spin 0.8s linear infinite',
          }}
        />
        <span style={{ marginLeft: '12px', fontSize: '14px', color: '#9ca3af' }}>
          Loading amendments...
        </span>
        <style>{`@keyframes amendment-spin { to { transform: rotate(360deg); } }`}</style>
      </div>
    );
  }

  // Error state
  if (error) {
    return (
      <div
        style={{
          padding: '16px',
          background: '#fef2f2',
          border: '1px solid #fecaca',
          borderRadius: '8px',
          color: '#991b1b',
          fontSize: '14px',
          textAlign: 'center',
        }}
      >
        {error}
        <button
          onClick={fetchData}
          style={{
            marginLeft: '12px',
            padding: '4px 12px',
            border: '1px solid #fca5a5',
            borderRadius: '6px',
            background: 'white',
            color: '#dc2626',
            cursor: 'pointer',
            fontSize: '13px',
          }}
        >
          Retry
        </button>
      </div>
    );
  }

  // Empty state
  if (amendments.length === 0) {
    return (
      <div
        style={{
          padding: '40px',
          textAlign: 'center',
          color: '#9ca3af',
          fontSize: '14px',
        }}
      >
        No amendments yet for this order
      </div>
    );
  }

  // Timeline
  return (
    <div style={{ padding: '4px 0' }}>
      {amendments.map((amendment, index) => (
        <TimelineEntry
          key={amendment.id}
          amendment={amendment}
          creditMemo={memosByAmendment[amendment.id] || null}
          isLast={index === amendments.length - 1}
          token={token}
        />
      ))}
    </div>
  );
}
