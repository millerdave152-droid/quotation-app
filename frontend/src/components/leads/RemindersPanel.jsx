/**
 * RemindersPanel — Displays unacknowledged lead reminders
 * Groups by trigger type, supports acknowledge flow
 */

import React, { useState, useEffect, useCallback } from 'react';
import { authFetch } from '../../services/authFetch';
import { useToast } from '../ui/Toast';

const API_URL = process.env.REACT_APP_API_URL || '';

const TRIGGER_LABELS = {
  state_stale: { label: 'Stale Lead', icon: '\u23F0', color: '#F59E0B' },
  quote_expiry: { label: 'Expiring Quote', icon: '\u26A0', color: '#EF4444' },
  no_contact: { label: 'No Contact Yet', icon: '\uD83D\uDCDE', color: '#6366F1' },
  manual: { label: 'Reminder', icon: '\uD83D\uDCCB', color: '#6B7280' }
};

const STATUS_COLORS = {
  new: '#2B8FAD', quoted: '#6366F1', follow_up_scheduled: '#F59E0B',
  negotiating: '#C8614A', won: '#22C55E', lost: '#6B7280', expired: '#EF4444',
  contacted: '#8b5cf6', qualified: '#0ea5e9', quote_created: '#6366F1', converted: '#059669'
};

const formatCents = (cents) => {
  if (!cents && cents !== 0) return '';
  return `$${(cents / 100).toLocaleString('en-CA', { minimumFractionDigits: 2 })}`;
};

function RemindersPanel({ onClose, onViewLead }) {
  const toast = useToast();
  const [reminders, setReminders] = useState([]);
  const [loading, setLoading] = useState(true);

  const fetchReminders = useCallback(async () => {
    try {
      const res = await authFetch(`${API_URL}/api/leads/reminders/mine`);
      if (!res.ok) throw new Error('Failed to fetch reminders');
      const data = await res.json();
      setReminders(data.data || []);
    } catch {
      toast.error('Failed to load reminders');
    } finally {
      setLoading(false);
    }
  }, [toast]);

  useEffect(() => { fetchReminders(); }, [fetchReminders]);

  const handleAcknowledge = async (reminderId) => {
    try {
      const res = await authFetch(`${API_URL}/api/leads/reminders/${reminderId}/acknowledge`, {
        method: 'PATCH'
      });
      if (!res.ok) throw new Error('Failed to acknowledge');
      setReminders(prev => prev.filter(r => r.id !== reminderId));
      toast.success('Reminder acknowledged');
    } catch {
      toast.error('Failed to acknowledge reminder');
    }
  };

  // Group by trigger type
  const grouped = {};
  for (const r of reminders) {
    if (!grouped[r.trigger_type]) grouped[r.trigger_type] = [];
    grouped[r.trigger_type].push(r);
  }

  return (
    <div style={{
      position: 'fixed', top: 0, right: 0, bottom: 0, width: '420px',
      background: '#fff', boxShadow: '-4px 0 20px rgba(0,0,0,0.1)',
      zIndex: 1100, display: 'flex', flexDirection: 'column',
      borderLeft: '1px solid #e5e7eb'
    }}>
      {/* Header */}
      <div style={{
        padding: '16px 20px', borderBottom: '1px solid #e5e7eb',
        display: 'flex', justifyContent: 'space-between', alignItems: 'center'
      }}>
        <h3 style={{ margin: 0, fontSize: '17px', fontWeight: '700', color: '#111827' }}>
          Reminders
          {reminders.length > 0 && (
            <span style={{
              marginLeft: '8px', padding: '2px 8px', borderRadius: '9999px',
              fontSize: '12px', fontWeight: '600', background: '#C8614A', color: '#fff'
            }}>
              {reminders.length}
            </span>
          )}
        </h3>
        <button
          onClick={onClose}
          style={{
            background: 'none', border: 'none', fontSize: '20px',
            cursor: 'pointer', color: '#6b7280', padding: '4px'
          }}
        >
          &times;
        </button>
      </div>

      {/* Content */}
      <div style={{ flex: 1, overflowY: 'auto', padding: '16px 20px' }}>
        {loading ? (
          <div style={{ textAlign: 'center', padding: '40px 0', color: '#9ca3af' }}>Loading...</div>
        ) : reminders.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '40px 0', color: '#9ca3af' }}>
            <div style={{ fontSize: '36px', marginBottom: '8px', opacity: 0.4 }}>{'\u2705'}</div>
            <div style={{ fontSize: '15px', fontWeight: '500' }}>All caught up!</div>
            <div style={{ fontSize: '13px', marginTop: '4px' }}>No pending reminders</div>
          </div>
        ) : (
          Object.entries(grouped).map(([triggerType, items]) => {
            const cfg = TRIGGER_LABELS[triggerType] || TRIGGER_LABELS.manual;
            return (
              <div key={triggerType} style={{ marginBottom: '20px' }}>
                {/* Group header */}
                <div style={{
                  display: 'flex', alignItems: 'center', gap: '8px',
                  marginBottom: '10px', fontSize: '13px', fontWeight: '600',
                  color: cfg.color, textTransform: 'uppercase', letterSpacing: '0.5px'
                }}>
                  <span style={{ fontSize: '16px' }}>{cfg.icon}</span>
                  {cfg.label} ({items.length})
                </div>

                {/* Reminder cards */}
                {items.map(r => (
                  <div key={r.id} style={{
                    padding: '12px 14px', marginBottom: '8px',
                    background: '#f9fafb', borderRadius: '8px',
                    border: '1px solid #e5e7eb', borderLeft: `3px solid ${cfg.color}`
                  }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '6px' }}>
                      <div>
                        <div style={{ fontWeight: '600', fontSize: '14px', color: '#111827', marginBottom: '2px' }}>
                          {r.customer_name || 'Unknown Customer'}
                        </div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '4px' }}>
                          <span style={{
                            padding: '1px 8px', borderRadius: '9999px', fontSize: '11px',
                            fontWeight: '600', color: '#fff',
                            background: STATUS_COLORS[r.lead_status] || '#6B7280'
                          }}>
                            {r.lead_status}
                          </span>
                          {r.store_location_name && (
                            <span style={{ fontSize: '11px', color: '#9ca3af' }}>
                              {r.store_location_name}
                            </span>
                          )}
                        </div>
                      </div>
                    </div>

                    {/* Message */}
                    {r.message_body && (
                      <div style={{ fontSize: '13px', color: '#4b5563', marginBottom: '6px' }}>
                        {r.message_body}
                      </div>
                    )}

                    {/* Primary quote info */}
                    {r.primary_quote && r.primary_quote.quote_number && (
                      <div style={{ fontSize: '12px', color: '#6b7280', marginBottom: '8px' }}>
                        Quote {r.primary_quote.quote_number}
                        {r.primary_quote.total_cents ? ` \u00B7 ${formatCents(r.primary_quote.total_cents)}` : ''}
                      </div>
                    )}

                    {/* Actions */}
                    <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end' }}>
                      <button
                        onClick={() => onViewLead?.(r.lead_id)}
                        style={{
                          padding: '5px 12px', background: '#fff', border: '1px solid #d1d5db',
                          borderRadius: '6px', fontSize: '12px', fontWeight: '500',
                          cursor: 'pointer', color: '#374151'
                        }}
                      >
                        View Lead
                      </button>
                      <button
                        onClick={() => handleAcknowledge(r.id)}
                        style={{
                          padding: '5px 12px', background: '#C8614A', border: 'none',
                          borderRadius: '6px', fontSize: '12px', fontWeight: '600',
                          cursor: 'pointer', color: '#fff'
                        }}
                      >
                        Acknowledge
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}

export default RemindersPanel;
