/**
 * FollowUpModal — Schedule a follow-up for a lead
 * Type selector, date/time picker, notes textarea
 */

import React, { useState } from 'react';
import { authFetch } from '../../services/authFetch';
import { useToast } from '../ui/Toast';

const API_URL = process.env.REACT_APP_API_URL || '';

const FOLLOWUP_TYPES = [
  { value: 'call', label: 'Call', icon: '\u260E' },
  { value: 'email', label: 'Email', icon: '\u2709' },
  { value: 'in_store_visit', label: 'In-Store Visit', icon: '\uD83C\uDFEA' },
  { value: 'custom', label: 'Custom', icon: '\u270F' }
];

function FollowUpModal({ leadId, onClose, onSuccess }) {
  const toast = useToast();
  const [followupType, setFollowupType] = useState('call');
  const [scheduledDate, setScheduledDate] = useState('');
  const [scheduledTime, setScheduledTime] = useState('10:00');
  const [notes, setNotes] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();

    if (!scheduledDate) {
      toast.warning('Please select a date');
      return;
    }

    setSubmitting(true);
    try {
      const scheduledAt = new Date(`${scheduledDate}T${scheduledTime || '10:00'}:00`).toISOString();

      // Schedule the follow-up
      const res = await authFetch(`${API_URL}/api/leads/${leadId}/followups`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ followupType, scheduledAt, notes: notes || undefined })
      });

      if (!res.ok) throw new Error('Failed to schedule follow-up');

      // Update lead status to follow_up_scheduled
      await authFetch(`${API_URL}/api/leads/${leadId}/status`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: 'follow_up_scheduled' })
      }).catch(() => {
        // Status update is best-effort — the follow-up was already created
      });

      toast.success('Follow-up scheduled');
      onSuccess?.();
      onClose?.();
    } catch (err) {
      toast.error(err.message || 'Failed to schedule follow-up');
    } finally {
      setSubmitting(false);
    }
  };

  const today = new Date().toISOString().split('T')[0];

  return (
    <div style={{
      position: 'fixed', inset: 0, zIndex: 1000,
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      background: 'rgba(0,0,0,0.4)'
    }}
      onClick={(e) => { if (e.target === e.currentTarget) onClose?.(); }}
    >
      <div style={{
        background: '#fff', borderRadius: '12px', padding: '28px',
        width: '100%', maxWidth: '460px', boxShadow: '0 20px 60px rgba(0,0,0,0.15)'
      }}>
        <h3 style={{ margin: '0 0 20px', fontSize: '18px', fontWeight: '700', color: '#111827' }}>
          Schedule Follow-Up
        </h3>

        <form onSubmit={handleSubmit}>
          {/* Type selector */}
          <div style={{ marginBottom: '16px' }}>
            <label style={{ display: 'block', fontSize: '13px', fontWeight: '600', color: '#374151', marginBottom: '8px' }}>
              Type
            </label>
            <div style={{ display: 'flex', gap: '8px' }}>
              {FOLLOWUP_TYPES.map(t => (
                <button
                  key={t.value}
                  type="button"
                  onClick={() => setFollowupType(t.value)}
                  style={{
                    flex: 1, padding: '10px 8px', borderRadius: '8px',
                    border: followupType === t.value ? '2px solid #6366F1' : '2px solid #e5e7eb',
                    background: followupType === t.value ? '#EEF2FF' : '#fff',
                    cursor: 'pointer', fontSize: '13px', fontWeight: '500',
                    color: followupType === t.value ? '#4338CA' : '#4b5563',
                    transition: 'all 0.15s'
                  }}
                >
                  <div style={{ fontSize: '18px', marginBottom: '2px' }}>{t.icon}</div>
                  {t.label}
                </button>
              ))}
            </div>
          </div>

          {/* Date & Time */}
          <div style={{ display: 'flex', gap: '12px', marginBottom: '16px' }}>
            <div style={{ flex: 1 }}>
              <label style={{ display: 'block', fontSize: '13px', fontWeight: '600', color: '#374151', marginBottom: '6px' }}>
                Date *
              </label>
              <input
                type="date"
                value={scheduledDate}
                onChange={(e) => setScheduledDate(e.target.value)}
                min={today}
                required
                style={{
                  width: '100%', padding: '8px 12px', border: '1px solid #d1d5db',
                  borderRadius: '6px', fontSize: '14px', boxSizing: 'border-box'
                }}
              />
            </div>
            <div style={{ flex: 1 }}>
              <label style={{ display: 'block', fontSize: '13px', fontWeight: '600', color: '#374151', marginBottom: '6px' }}>
                Time
              </label>
              <input
                type="time"
                value={scheduledTime}
                onChange={(e) => setScheduledTime(e.target.value)}
                style={{
                  width: '100%', padding: '8px 12px', border: '1px solid #d1d5db',
                  borderRadius: '6px', fontSize: '14px', boxSizing: 'border-box'
                }}
              />
            </div>
          </div>

          {/* Notes */}
          <div style={{ marginBottom: '20px' }}>
            <label style={{ display: 'block', fontSize: '13px', fontWeight: '600', color: '#374151', marginBottom: '6px' }}>
              Notes
            </label>
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Add context for this follow-up..."
              rows={3}
              style={{
                width: '100%', padding: '8px 12px', border: '1px solid #d1d5db',
                borderRadius: '6px', fontSize: '14px', resize: 'vertical',
                fontFamily: 'inherit', boxSizing: 'border-box'
              }}
            />
          </div>

          {/* Actions */}
          <div style={{ display: 'flex', gap: '10px', justifyContent: 'flex-end' }}>
            <button
              type="button"
              onClick={onClose}
              style={{
                padding: '10px 20px', border: '1px solid #d1d5db', borderRadius: '8px',
                background: '#fff', fontSize: '14px', cursor: 'pointer', color: '#374151'
              }}
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={submitting}
              style={{
                padding: '10px 20px', border: 'none', borderRadius: '8px',
                background: '#6366F1', color: '#fff', fontSize: '14px',
                fontWeight: '600', cursor: submitting ? 'wait' : 'pointer',
                opacity: submitting ? 0.7 : 1
              }}
            >
              {submitting ? 'Scheduling...' : 'Schedule Follow-Up'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

export default FollowUpModal;
