/**
 * LeadDetailView — Full lead detail with two-column layout
 * Left: Lead info, status, staff, notes
 * Right: Tabs — Linked Quotes, Follow-Up History, Activity Log (stub)
 */

import React, { useState, useEffect, useCallback } from 'react';
import { authFetch } from '../../services/authFetch';
import { useToast } from '../ui/Toast';
import FollowUpModal from './FollowUpModal';

const API_URL = process.env.REACT_APP_API_URL || '';

const STATUS_COLORS = {
  new: { bg: '#2B8FAD', text: '#fff', label: 'New' },
  quoted: { bg: '#6366F1', text: '#fff', label: 'Quoted' },
  follow_up_scheduled: { bg: '#F59E0B', text: '#000', label: 'Follow-Up Scheduled' },
  negotiating: { bg: '#C8614A', text: '#fff', label: 'Negotiating' },
  won: { bg: '#22C55E', text: '#fff', label: 'Won' },
  lost: { bg: '#6B7280', text: '#fff', label: 'Lost' },
  expired: { bg: '#EF4444', text: '#fff', label: 'Expired' },
  contacted: { bg: '#8b5cf6', text: '#fff', label: 'Contacted' },
  qualified: { bg: '#0ea5e9', text: '#fff', label: 'Qualified' },
  quote_created: { bg: '#6366F1', text: '#fff', label: 'Quote Created' },
  converted: { bg: '#059669', text: '#fff', label: 'Converted' }
};

// Combined state machine — legal next states from any status
const VALID_TRANSITIONS = {
  new: ['contacted', 'qualified', 'quoted', 'lost'],
  contacted: ['qualified', 'quote_created', 'quoted', 'follow_up_scheduled', 'lost'],
  qualified: ['quote_created', 'quoted', 'follow_up_scheduled', 'negotiating', 'lost'],
  quoted: ['follow_up_scheduled', 'negotiating', 'won', 'lost', 'expired'],
  quote_created: ['converted', 'follow_up_scheduled', 'negotiating', 'lost'],
  follow_up_scheduled: ['negotiating', 'won', 'lost', 'quoted', 'contacted'],
  negotiating: ['won', 'lost'],
  converted: [],
  won: [],
  lost: ['new'],
  expired: []
};

const formatDate = (dateStr) => {
  if (!dateStr) return '-';
  return new Date(dateStr).toLocaleDateString('en-CA', {
    month: 'short', day: 'numeric', year: 'numeric'
  });
};

const formatDateTime = (dateStr) => {
  if (!dateStr) return '-';
  return new Date(dateStr).toLocaleString('en-CA', {
    month: 'short', day: 'numeric', year: 'numeric',
    hour: '2-digit', minute: '2-digit'
  });
};

const formatCents = (cents) => {
  if (!cents && cents !== 0) return '-';
  return `$${(cents / 100).toLocaleString('en-CA', { minimumFractionDigits: 2 })}`;
};

const FOLLOWUP_ICONS = {
  call: '\u260E',
  email: '\u2709',
  in_store_visit: '\uD83C\uDFEA',
  custom: '\u270F'
};

function LeadDetailView({ leadId, onBack, onQuoteSelect }) {
  const toast = useToast();
  const [lead, setLead] = useState(null);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState('quotes');
  const [showFollowUpModal, setShowFollowUpModal] = useState(false);
  const [notesValue, setNotesValue] = useState('');
  const [savingNotes, setSavingNotes] = useState(false);

  // Mark-complete state
  const [completingId, setCompletingId] = useState(null);
  const [completeOutcome, setCompleteOutcome] = useState('');

  const fetchLead = useCallback(async () => {
    setLoading(true);
    try {
      const res = await authFetch(`${API_URL}/api/leads/${leadId}`);
      if (!res.ok) throw new Error('Failed to fetch lead');
      const data = await res.json();
      const leadData = data.data || data;
      setLead(leadData);
      setNotesValue(leadData.requirements_notes || '');
    } catch (err) {
      toast.error('Failed to load lead details');
    } finally {
      setLoading(false);
    }
  }, [leadId, toast]);

  useEffect(() => { fetchLead(); }, [fetchLead]);

  const handleStatusChange = async (newStatus) => {
    try {
      const res = await authFetch(`${API_URL}/api/leads/${leadId}/status`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: newStatus })
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || 'Failed to update status');
      }
      toast.success(`Status updated to ${STATUS_COLORS[newStatus]?.label || newStatus}`);
      fetchLead();
    } catch (err) {
      toast.error(err.message);
    }
  };

  const handleNotesSave = async () => {
    if (notesValue === (lead?.requirements_notes || '')) return;
    setSavingNotes(true);
    try {
      await authFetch(`${API_URL}/api/leads/${leadId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...lead, requirements_notes: notesValue })
      });
    } catch {
      toast.error('Failed to save notes');
    } finally {
      setSavingNotes(false);
    }
  };

  const handleMarkComplete = async (followupId) => {
    try {
      const res = await authFetch(`${API_URL}/api/leads/${leadId}/followups/${followupId}/complete`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ outcome: completeOutcome || undefined })
      });
      if (!res.ok) throw new Error('Failed to complete follow-up');
      toast.success('Follow-up marked complete');
      setCompletingId(null);
      setCompleteOutcome('');
      fetchLead();
    } catch (err) {
      toast.error(err.message);
    }
  };

  if (loading) {
    return <div style={{ padding: '40px', textAlign: 'center', color: '#9ca3af' }}>Loading...</div>;
  }

  if (!lead) {
    return <div style={{ padding: '40px', textAlign: 'center', color: '#9ca3af' }}>Lead not found</div>;
  }

  const currentStatusConfig = STATUS_COLORS[lead.status] || { bg: '#6B7280', text: '#fff', label: lead.status };
  const nextStatuses = VALID_TRANSITIONS[lead.status] || [];
  const linkedQuotes = lead.linked_quotes || [];
  const followups = lead.followups || [];

  const tabs = [
    { key: 'quotes', label: `Linked Quotes (${linkedQuotes.length})` },
    { key: 'followups', label: `Follow-Ups (${followups.length})` },
    { key: 'activity', label: 'Activity Log' }
  ];

  return (
    <div style={{ padding: '24px' }}>
      {/* Back button */}
      <button
        onClick={onBack}
        style={{
          display: 'flex', alignItems: 'center', gap: '4px', marginBottom: '16px',
          background: 'none', border: 'none', fontSize: '14px', color: '#6366F1',
          cursor: 'pointer', padding: 0, fontWeight: '500'
        }}
      >
        &larr; Back to Pipeline
      </button>

      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '24px' }}>
        <h2 style={{ margin: 0, fontSize: '22px', fontWeight: '700', color: '#111827' }}>
          {lead.contact_name || lead.customer_name || 'Lead'}
        </h2>
        {lead.lead_number && (
          <span style={{ fontSize: '14px', color: '#9ca3af', fontWeight: '500' }}>
            {lead.lead_number}
          </span>
        )}
      </div>

      {/* Two-column layout */}
      <div style={{ display: 'grid', gridTemplateColumns: '340px 1fr', gap: '24px', alignItems: 'start' }}>

        {/* LEFT COLUMN — Lead Info */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>

          {/* Customer Card */}
          <div style={{
            padding: '16px', background: '#fff', border: '1px solid #e5e7eb',
            borderRadius: '10px'
          }}>
            <div style={{ fontSize: '13px', fontWeight: '600', color: '#6b7280', marginBottom: '10px', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
              Customer
            </div>
            <div style={{ fontWeight: '600', color: '#111827', marginBottom: '4px' }}>
              {lead.contact_name || lead.customer_name || '-'}
            </div>
            {(lead.contact_phone || lead.customer_phone) && (
              <div style={{ fontSize: '13px', color: '#4b5563', marginBottom: '2px' }}>
                {lead.contact_phone || lead.customer_phone}
              </div>
            )}
            {(lead.contact_email || lead.customer_email) && (
              <div style={{ fontSize: '13px', color: '#4b5563', marginBottom: '2px' }}>
                {lead.contact_email || lead.customer_email}
              </div>
            )}
            {lead.store_location_name && (
              <div style={{ fontSize: '12px', color: '#9ca3af', marginTop: '6px' }}>
                Store: {lead.store_location_name}
              </div>
            )}
          </div>

          {/* Status + change */}
          <div style={{
            padding: '16px', background: '#fff', border: '1px solid #e5e7eb',
            borderRadius: '10px'
          }}>
            <div style={{ fontSize: '13px', fontWeight: '600', color: '#6b7280', marginBottom: '10px', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
              Status
            </div>
            <div style={{ marginBottom: '10px' }}>
              <span style={{
                display: 'inline-block', padding: '4px 14px', borderRadius: '9999px',
                fontSize: '13px', fontWeight: '600',
                background: currentStatusConfig.bg, color: currentStatusConfig.text
              }}>
                {currentStatusConfig.label}
              </span>
            </div>
            {nextStatuses.length > 0 && (
              <select
                onChange={(e) => { if (e.target.value) handleStatusChange(e.target.value); }}
                value=""
                style={{
                  width: '100%', padding: '8px 10px', border: '1px solid #d1d5db',
                  borderRadius: '6px', fontSize: '13px', color: '#374151',
                  background: '#fff', cursor: 'pointer'
                }}
              >
                <option value="">Change status...</option>
                {nextStatuses.map(s => (
                  <option key={s} value={s}>
                    {STATUS_COLORS[s]?.label || s}
                  </option>
                ))}
              </select>
            )}
          </div>

          {/* Assigned Staff */}
          <div style={{
            padding: '16px', background: '#fff', border: '1px solid #e5e7eb',
            borderRadius: '10px'
          }}>
            <div style={{ fontSize: '13px', fontWeight: '600', color: '#6b7280', marginBottom: '6px', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
              Assigned Staff
            </div>
            <div style={{ fontSize: '14px', color: '#111827' }}>
              {lead.assigned_to_name || 'Unassigned'}
            </div>
          </div>

          {/* Source & Created */}
          <div style={{
            padding: '16px', background: '#fff', border: '1px solid #e5e7eb',
            borderRadius: '10px'
          }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '6px' }}>
              <span style={{ fontSize: '13px', color: '#6b7280' }}>Source</span>
              <span style={{ fontSize: '13px', color: '#111827', fontWeight: '500' }}>
                {lead.lead_source || '-'}
              </span>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
              <span style={{ fontSize: '13px', color: '#6b7280' }}>Created</span>
              <span style={{ fontSize: '13px', color: '#111827' }}>
                {formatDate(lead.created_at)}
              </span>
            </div>
          </div>

          {/* Notes */}
          <div style={{
            padding: '16px', background: '#fff', border: '1px solid #e5e7eb',
            borderRadius: '10px'
          }}>
            <div style={{ fontSize: '13px', fontWeight: '600', color: '#6b7280', marginBottom: '8px', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
              Notes
            </div>
            <textarea
              value={notesValue}
              onChange={(e) => setNotesValue(e.target.value)}
              onBlur={handleNotesSave}
              placeholder="Add notes..."
              rows={4}
              style={{
                width: '100%', padding: '8px 10px', border: '1px solid #d1d5db',
                borderRadius: '6px', fontSize: '13px', resize: 'vertical',
                fontFamily: 'inherit', boxSizing: 'border-box'
              }}
            />
            {savingNotes && (
              <div style={{ fontSize: '11px', color: '#9ca3af', marginTop: '4px' }}>Saving...</div>
            )}
          </div>
        </div>

        {/* RIGHT COLUMN — Tabs */}
        <div style={{
          background: '#fff', border: '1px solid #e5e7eb', borderRadius: '10px',
          overflow: 'hidden'
        }}>
          {/* Tab headers */}
          <div style={{
            display: 'flex', borderBottom: '1px solid #e5e7eb'
          }}>
            {tabs.map(tab => (
              <button
                key={tab.key}
                onClick={() => setActiveTab(tab.key)}
                style={{
                  flex: 1, padding: '12px 16px', background: 'none', border: 'none',
                  borderBottom: activeTab === tab.key ? '2px solid #6366F1' : '2px solid transparent',
                  color: activeTab === tab.key ? '#6366F1' : '#6b7280',
                  fontWeight: activeTab === tab.key ? '600' : '500',
                  fontSize: '14px', cursor: 'pointer', transition: 'all 0.15s'
                }}
              >
                {tab.label}
              </button>
            ))}
          </div>

          {/* Tab content */}
          <div style={{ padding: '20px' }}>

            {/* Tab 1: Linked Quotes */}
            {activeTab === 'quotes' && (
              <div>
                {linkedQuotes.length === 0 ? (
                  <div style={{ textAlign: 'center', padding: '30px 0', color: '#9ca3af' }}>
                    No quotes linked to this lead
                  </div>
                ) : (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                    {linkedQuotes.map(q => (
                      <div
                        key={q.id}
                        onClick={() => onQuoteSelect?.(q)}
                        style={{
                          display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                          padding: '12px 16px', background: '#f9fafb', borderRadius: '8px',
                          border: '1px solid #e5e7eb', cursor: 'pointer',
                          transition: 'border-color 0.15s'
                        }}
                        onMouseEnter={(e) => e.currentTarget.style.borderColor = '#6366F1'}
                        onMouseLeave={(e) => e.currentTarget.style.borderColor = '#e5e7eb'}
                      >
                        <div>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '4px' }}>
                            <span style={{ fontWeight: '600', color: '#111827', fontSize: '14px' }}>
                              {q.quote_number || `Quote #${q.id}`}
                            </span>
                            {q.is_primary && (
                              <span style={{
                                padding: '1px 8px', background: '#DBEAFE', color: '#1D4ED8',
                                borderRadius: '9999px', fontSize: '11px', fontWeight: '600'
                              }}>
                                Primary
                              </span>
                            )}
                          </div>
                          <div style={{ fontSize: '12px', color: '#6b7280' }}>
                            {formatDate(q.linked_at)} &middot; Status: {q.status || '-'}
                            {q.expires_at && ` \u00B7 Expires: ${formatDate(q.expires_at)}`}
                          </div>
                        </div>
                        <div style={{ fontWeight: '600', color: '#111827', fontSize: '15px' }}>
                          {formatCents(q.total_cents)}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
                {lead.customer_id && (
                  <div style={{ marginTop: '12px', textAlign: 'right' }}>
                    <button
                      onClick={() => onQuoteSelect?.({ viewAllForCustomer: lead.customer_id })}
                      style={{
                        background: 'none', border: 'none', color: '#6366F1',
                        fontSize: '13px', fontWeight: '500', cursor: 'pointer',
                        textDecoration: 'underline'
                      }}
                    >
                      View All Quotes for Customer &rarr;
                    </button>
                  </div>
                )}
              </div>
            )}

            {/* Tab 2: Follow-Up History */}
            {activeTab === 'followups' && (
              <div>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
                  <span style={{ fontSize: '14px', fontWeight: '600', color: '#374151' }}>
                    Follow-Up History
                  </span>
                  <button
                    onClick={() => setShowFollowUpModal(true)}
                    style={{
                      padding: '8px 16px', background: '#6366F1', color: '#fff',
                      border: 'none', borderRadius: '8px', fontSize: '13px',
                      fontWeight: '600', cursor: 'pointer'
                    }}
                  >
                    + Schedule Follow-Up
                  </button>
                </div>

                {followups.length === 0 ? (
                  <div style={{ textAlign: 'center', padding: '30px 0', color: '#9ca3af' }}>
                    No follow-ups scheduled
                  </div>
                ) : (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                    {followups.map(f => {
                      const isPending = !f.completed_at;
                      const isPast = isPending && new Date(f.scheduled_at) < new Date();
                      return (
                        <div key={f.id} style={{
                          padding: '12px 16px', background: isPending ? '#FFFBEB' : '#f9fafb',
                          borderRadius: '8px', border: `1px solid ${isPast ? '#F59E0B' : '#e5e7eb'}`
                        }}>
                          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                            <div style={{ display: 'flex', gap: '10px', alignItems: 'flex-start' }}>
                              <span style={{ fontSize: '20px' }}>
                                {FOLLOWUP_ICONS[f.followup_type] || '\u270F'}
                              </span>
                              <div>
                                <div style={{ fontWeight: '500', color: '#111827', fontSize: '14px', marginBottom: '2px' }}>
                                  {f.followup_type === 'in_store_visit' ? 'In-Store Visit'
                                    : f.followup_type?.charAt(0).toUpperCase() + f.followup_type?.slice(1)}
                                </div>
                                <div style={{ fontSize: '12px', color: '#6b7280' }}>
                                  Scheduled: {formatDateTime(f.scheduled_at)}
                                  {f.scheduled_by_name && ` by ${f.scheduled_by_name}`}
                                </div>
                                {f.completed_at && (
                                  <div style={{ fontSize: '12px', color: '#059669', marginTop: '2px' }}>
                                    Completed: {formatDateTime(f.completed_at)}
                                  </div>
                                )}
                                {f.notes && (
                                  <div style={{ fontSize: '13px', color: '#4b5563', marginTop: '4px' }}>
                                    {f.notes}
                                  </div>
                                )}
                                {f.outcome && (
                                  <div style={{ fontSize: '13px', color: '#059669', marginTop: '4px', fontStyle: 'italic' }}>
                                    Outcome: {f.outcome}
                                  </div>
                                )}
                              </div>
                            </div>

                            <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                              {isPending ? (
                                <span style={{
                                  padding: '2px 8px', borderRadius: '9999px', fontSize: '11px', fontWeight: '600',
                                  background: isPast ? '#FEF3C7' : '#DBEAFE',
                                  color: isPast ? '#92400E' : '#1D4ED8'
                                }}>
                                  {isPast ? 'Overdue' : 'Pending'}
                                </span>
                              ) : (
                                <span style={{
                                  padding: '2px 8px', borderRadius: '9999px', fontSize: '11px', fontWeight: '600',
                                  background: '#D1FAE5', color: '#065F46'
                                }}>
                                  Done
                                </span>
                              )}
                            </div>
                          </div>

                          {/* Mark Complete inline form */}
                          {isPending && completingId !== f.id && (
                            <div style={{ marginTop: '8px', textAlign: 'right' }}>
                              <button
                                onClick={() => { setCompletingId(f.id); setCompleteOutcome(''); }}
                                style={{
                                  padding: '4px 12px', background: '#fff', border: '1px solid #d1d5db',
                                  borderRadius: '6px', fontSize: '12px', cursor: 'pointer',
                                  color: '#374151', fontWeight: '500'
                                }}
                              >
                                Mark Complete
                              </button>
                            </div>
                          )}
                          {completingId === f.id && (
                            <div style={{ marginTop: '10px', padding: '10px', background: '#fff', borderRadius: '6px', border: '1px solid #d1d5db' }}>
                              <textarea
                                value={completeOutcome}
                                onChange={(e) => setCompleteOutcome(e.target.value)}
                                placeholder="Outcome / result..."
                                rows={2}
                                style={{
                                  width: '100%', padding: '6px 10px', border: '1px solid #d1d5db',
                                  borderRadius: '4px', fontSize: '13px', fontFamily: 'inherit',
                                  marginBottom: '8px', resize: 'none', boxSizing: 'border-box'
                                }}
                              />
                              <div style={{ display: 'flex', gap: '6px', justifyContent: 'flex-end' }}>
                                <button
                                  onClick={() => setCompletingId(null)}
                                  style={{
                                    padding: '4px 12px', border: '1px solid #d1d5db', borderRadius: '6px',
                                    background: '#fff', fontSize: '12px', cursor: 'pointer'
                                  }}
                                >
                                  Cancel
                                </button>
                                <button
                                  onClick={() => handleMarkComplete(f.id)}
                                  style={{
                                    padding: '4px 12px', border: 'none', borderRadius: '6px',
                                    background: '#22C55E', color: '#fff', fontSize: '12px',
                                    fontWeight: '600', cursor: 'pointer'
                                  }}
                                >
                                  Confirm
                                </button>
                              </div>
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            )}

            {/* Tab 3: Activity Log (stub) */}
            {activeTab === 'activity' && (
              <div style={{
                textAlign: 'center', padding: '60px 20px', color: '#9ca3af'
              }}>
                <div style={{ fontSize: '40px', marginBottom: '12px', opacity: 0.4 }}>
                  {'\uD83D\uDCCB'}
                </div>
                <div style={{ fontSize: '16px', fontWeight: '600', color: '#6b7280', marginBottom: '6px' }}>
                  Activity Log
                </div>
                <div style={{ fontSize: '14px' }}>
                  Coming soon &mdash; full activity timeline with status changes, notes, and interactions.
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Follow-Up Modal */}
      {showFollowUpModal && (
        <FollowUpModal
          leadId={leadId}
          onClose={() => setShowFollowUpModal(false)}
          onSuccess={fetchLead}
        />
      )}
    </div>
  );
}

export default LeadDetailView;
