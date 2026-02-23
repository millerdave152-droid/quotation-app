/**
 * DraftList Component
 * Renders local IndexedDB drafts as cards with resume and delete actions
 */

import React, { useState } from 'react';
import { getRelativeTime } from '../../utils/relativeTime';

const DraftList = ({ drafts = [], onResume, onDelete, formatCurrency }) => {
  const [confirmDeleteId, setConfirmDeleteId] = useState(null);

  if (drafts.length === 0) {
    return (
      <div style={{
        textAlign: 'center',
        padding: '60px 20px',
        color: '#6b7280',
      }}>
        <div style={{ fontSize: '48px', marginBottom: '12px' }}>📝</div>
        <div style={{ fontSize: '16px', fontWeight: '500' }}>No local drafts</div>
        <div style={{ fontSize: '13px', marginTop: '4px' }}>
          Drafts are automatically saved as you work on a quote
        </div>
      </div>
    );
  }

  return (
    <div style={{ display: 'grid', gap: '12px', gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))' }}>
      {drafts.map(draft => {
        const snapshot = draft.snapshot || {};
        const customer = snapshot.selectedCustomer;
        const items = snapshot.quoteItems || [];
        const itemCount = items.length;
        const approxTotal = items.reduce((sum, item) => {
          const price = item.sell_cents || item.unit_price_cents || (item.price ? item.price * 100 : 0);
          return sum + (price * (item.quantity || 1));
        }, 0);
        const isPending = draft.status === 'pending_sync';

        return (
          <div
            key={draft.id}
            style={{
              background: 'white',
              border: '1px solid #e5e7eb',
              borderRadius: '10px',
              padding: '16px',
              boxShadow: '0 1px 3px rgba(0,0,0,0.06)',
            }}
          >
            {/* Header */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '10px' }}>
              <div>
                <div style={{ fontWeight: '600', fontSize: '14px', color: '#111827' }}>
                  {customer ? customer.name || customer.company || 'Unnamed Customer' : 'No customer selected'}
                </div>
                {customer?.company && customer?.name && (
                  <div style={{ fontSize: '12px', color: '#6b7280', marginTop: '2px' }}>{customer.company}</div>
                )}
              </div>
              <span style={{
                display: 'inline-block',
                padding: '2px 8px',
                borderRadius: '9999px',
                fontSize: '11px',
                fontWeight: '600',
                background: isPending ? '#fef3c7' : '#f3f4f6',
                color: isPending ? '#92400e' : '#6b7280',
              }}>
                {isPending ? 'Pending Sync' : 'Local Draft'}
              </span>
            </div>

            {/* Details */}
            <div style={{ fontSize: '13px', color: '#4b5563', marginBottom: '12px' }}>
              <div>{itemCount} item{itemCount !== 1 ? 's' : ''}</div>
              {approxTotal > 0 && (
                <div style={{ fontWeight: '500' }}>
                  ~{formatCurrency ? formatCurrency(approxTotal / 100) : `$${(approxTotal / 100).toFixed(2)}`}
                </div>
              )}
              <div style={{ fontSize: '11px', color: '#9ca3af', marginTop: '4px' }}>
                Last edited {getRelativeTime(draft.updated_at)}
              </div>
            </div>

            {/* Actions */}
            <div style={{ display: 'flex', gap: '8px' }}>
              <button
                onClick={() => onResume(draft.id)}
                style={{
                  flex: 1,
                  padding: '7px 12px',
                  background: '#2563eb',
                  color: 'white',
                  border: 'none',
                  borderRadius: '6px',
                  fontSize: '13px',
                  fontWeight: '500',
                  cursor: 'pointer',
                }}
              >
                Resume
              </button>
              {confirmDeleteId === draft.id ? (
                <>
                  <button
                    onClick={() => { onDelete(draft.id); setConfirmDeleteId(null); }}
                    style={{
                      padding: '7px 12px',
                      background: '#dc2626',
                      color: 'white',
                      border: 'none',
                      borderRadius: '6px',
                      fontSize: '13px',
                      fontWeight: '500',
                      cursor: 'pointer',
                    }}
                  >
                    Confirm
                  </button>
                  <button
                    onClick={() => setConfirmDeleteId(null)}
                    style={{
                      padding: '7px 12px',
                      background: '#f3f4f6',
                      color: '#374151',
                      border: 'none',
                      borderRadius: '6px',
                      fontSize: '13px',
                      cursor: 'pointer',
                    }}
                  >
                    Cancel
                  </button>
                </>
              ) : (
                <button
                  onClick={() => setConfirmDeleteId(draft.id)}
                  style={{
                    padding: '7px 12px',
                    background: '#fef2f2',
                    color: '#dc2626',
                    border: '1px solid #fecaca',
                    borderRadius: '6px',
                    fontSize: '13px',
                    fontWeight: '500',
                    cursor: 'pointer',
                  }}
                >
                  Delete
                </button>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
};

export default DraftList;
