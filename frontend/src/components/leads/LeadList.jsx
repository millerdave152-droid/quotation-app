/**
 * LeadList - Displays leads in a table/card format
 * Includes bulk selection, follow-up alerts, export functionality, and quick actions
 */

import { useState, useMemo, useRef, useEffect } from 'react';
import LeadStatusBadge from './LeadStatusBadge';
import LeadPriorityBadge from './LeadPriorityBadge';
import { updateLeadStatus } from './hooks/useLeads';
import { useToast } from '../ui/Toast';
import { api } from '../../services/apiClient';

function LeadList({
  leads,
  loading,
  error,
  pagination,
  onPageChange,
  onLeadSelect,
  onRefresh
}) {
  const toast = useToast();
  const [selectedIds, setSelectedIds] = useState(new Set());
  const [bulkAction, setBulkAction] = useState('');
  const [bulkLoading, setBulkLoading] = useState(false);

  // Quick action state
  const [quickActionModal, setQuickActionModal] = useState({ open: false, type: null, lead: null });
  const [quickActionLoading, setQuickActionLoading] = useState(false);

  // Calculate overdue and today's follow-ups
  const followUpAlerts = useMemo(() => {
    if (!leads) return { overdue: [], today: [] };
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const overdue = [];
    const todayList = [];

    leads.forEach(lead => {
      if (!lead.follow_up_date) return;
      const followUp = new Date(lead.follow_up_date);
      followUp.setHours(0, 0, 0, 0);
      const diffDays = Math.floor((followUp - today) / (1000 * 60 * 60 * 24));

      if (diffDays < 0) overdue.push(lead);
      else if (diffDays === 0) todayList.push(lead);
    });

    return { overdue, today: todayList };
  }, [leads]);

  // Selection handlers
  const toggleSelect = (id, e) => {
    e.stopPropagation();
    setSelectedIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const toggleSelectAll = () => {
    if (selectedIds.size === leads.length) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(leads.map(l => l.id)));
    }
  };

  const clearSelection = () => setSelectedIds(new Set());

  // Bulk action handler
  const handleBulkAction = async () => {
    if (!bulkAction || selectedIds.size === 0) return;

    setBulkLoading(true);
    try {
      const promises = Array.from(selectedIds).map(id =>
        updateLeadStatus(id, bulkAction)
      );
      await Promise.all(promises);
      toast.success(`Updated ${selectedIds.size} leads to "${bulkAction.replace('_', ' ')}"`);
      clearSelection();
      setBulkAction('');
      onRefresh();
    } catch (error) {
      toast.error('Failed to update some leads');
    } finally {
      setBulkLoading(false);
    }
  };

  // CSV Export
  const exportToCSV = () => {
    if (!leads || leads.length === 0) return;

    const headers = [
      'Lead Number', 'Contact Name', 'Email', 'Phone', 'Source',
      'Status', 'Priority', 'Timeline', 'Follow-up Date', 'Created'
    ];

    const rows = leads.map(lead => [
      lead.lead_number,
      lead.contact_name,
      lead.contact_email || '',
      lead.contact_phone || '',
      lead.lead_source || '',
      lead.status,
      lead.priority,
      lead.timeline || '',
      lead.follow_up_date ? new Date(lead.follow_up_date).toLocaleDateString() : '',
      new Date(lead.created_at).toLocaleDateString()
    ]);

    const csvContent = [
      headers.join(','),
      ...rows.map(row => row.map(cell => `"${String(cell).replace(/"/g, '""')}"`).join(','))
    ].join('\n');

    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = `leads_export_${new Date().toISOString().split('T')[0]}.csv`;
    link.click();
    toast.success('Leads exported to CSV');
  };

  // Quick action handlers
  const openQuickAction = (type, lead, e) => {
    e.stopPropagation();
    setQuickActionModal({ open: true, type, lead });
  };

  const closeQuickAction = () => {
    setQuickActionModal({ open: false, type: null, lead: null });
  };

  const handleQuickCall = async (data) => {
    setQuickActionLoading(true);
    try {
      await api.post(`/api/leads/${quickActionModal.lead.id}/quick-actions/call`, data);
      toast.success('Call logged successfully');
      closeQuickAction();
      onRefresh();
    } catch (error) {
      toast.error(error.response?.data?.error || 'Failed to log call');
    } finally {
      setQuickActionLoading(false);
    }
  };

  const handleQuickNote = async (data) => {
    setQuickActionLoading(true);
    try {
      await api.post(`/api/leads/${quickActionModal.lead.id}/quick-actions/note`, data);
      toast.success('Note added successfully');
      closeQuickAction();
      onRefresh();
    } catch (error) {
      toast.error(error.response?.data?.error || 'Failed to add note');
    } finally {
      setQuickActionLoading(false);
    }
  };

  const handleQuickEmail = async (data) => {
    setQuickActionLoading(true);
    try {
      await api.post(`/api/leads/${quickActionModal.lead.id}/quick-actions/email`, data);
      toast.success('Email logged successfully');
      closeQuickAction();
      onRefresh();
    } catch (error) {
      toast.error(error.response?.data?.error || 'Failed to log email');
    } finally {
      setQuickActionLoading(false);
    }
  };

  const handleQuickStatus = async (status, e, lostReason = null) => {
    e.stopPropagation();
    const lead = quickActionModal.lead;
    setQuickActionLoading(true);
    try {
      const payload = { status };
      if (status === 'lost' && lostReason) {
        payload.lost_reason = lostReason;
      }
      await api.put(`/api/leads/${lead.id}/quick-actions/status`, payload);
      toast.success(`Status updated to ${status}`);
      closeQuickAction();
      onRefresh();
    } catch (error) {
      toast.error(error.response?.data?.error || 'Failed to update status');
    } finally {
      setQuickActionLoading(false);
    }
  };

  const handleQuickFollowUp = async (data) => {
    setQuickActionLoading(true);
    try {
      await api.put(`/api/leads/${quickActionModal.lead.id}/quick-actions/follow-up`, data);
      toast.success('Follow-up scheduled');
      closeQuickAction();
      onRefresh();
    } catch (error) {
      toast.error(error.response?.data?.error || 'Failed to schedule follow-up');
    } finally {
      setQuickActionLoading(false);
    }
  };

  const formatRelativeDate = (dateStr) => {
    if (!dateStr) return '-';
    const date = new Date(dateStr);
    const now = new Date();
    const diffDays = Math.floor((now - date) / (1000 * 60 * 60 * 24));

    if (diffDays === 0) return 'Today';
    if (diffDays === 1) return 'Yesterday';
    if (diffDays < 7) return `${diffDays}d ago`;
    return date.toLocaleDateString('en-CA', { month: 'short', day: 'numeric' });
  };

  if (loading) {
    return (
      <div className="lead-list">
        <div className="lead-list-header">
          <h2>Leads</h2>
        </div>
        <div className="list-loading-skeleton">
          {[1, 2, 3, 4, 5].map(i => (
            <div key={i} className="list-skeleton-row">
              <div className="list-skeleton-cell list-skeleton-name" />
              <div className="list-skeleton-cell list-skeleton-badge" />
              <div className="list-skeleton-cell list-skeleton-text" />
              <div className="list-skeleton-cell list-skeleton-badge" />
              <div className="list-skeleton-cell list-skeleton-text-sm" />
            </div>
          ))}
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="lead-list">
        <div className="empty-state">
          <div className="empty-state-icon-wrap empty-state-icon-error">
            <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>
          </div>
          <div className="empty-state-title">Error Loading Leads</div>
          <p className="empty-state-description">{error}</p>
          <button className="btn btn-primary" onClick={onRefresh}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="23 4 23 10 17 10"/><path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10"/></svg>
            Try Again
          </button>
        </div>
      </div>
    );
  }

  if (!leads || leads.length === 0) {
    return (
      <div className="lead-list">
        <div className="empty-state">
          <div className="empty-state-icon-wrap">
            <svg width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2"/><rect x="8" y="2" width="8" height="4" rx="1" ry="1"/></svg>
          </div>
          <div className="empty-state-title">No Leads Found</div>
          <p className="empty-state-description">
            No leads match your current filters. Try adjusting your search or create a new lead.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="lead-list">
      {/* Follow-up Alerts Banner */}
      {(followUpAlerts.overdue.length > 0 || followUpAlerts.today.length > 0) && (
        <div className="follow-up-alerts-banner">
          {followUpAlerts.overdue.length > 0 && (
            <div className="alert-item alert-overdue">
              <span className="alert-badge">{followUpAlerts.overdue.length}</span>
              <span>Overdue follow-ups</span>
            </div>
          )}
          {followUpAlerts.today.length > 0 && (
            <div className="alert-item alert-today">
              <span className="alert-badge">{followUpAlerts.today.length}</span>
              <span>Follow-ups due today</span>
            </div>
          )}
        </div>
      )}

      <div className="lead-list-header">
        <h2>
          Leads
          <span className="lead-list-count">{pagination.total}</span>
        </h2>
        <div className="lead-list-actions">
          <button className="btn btn-sm btn-secondary" onClick={exportToCSV} title="Export to CSV">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
            Export
          </button>
          <button className="btn btn-sm btn-secondary" onClick={onRefresh}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="23 4 23 10 17 10"/><path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10"/></svg>
            Refresh
          </button>
        </div>
      </div>

      {/* Bulk Action Bar */}
      {selectedIds.size > 0 && (
        <div className="bulk-action-bar">
          <span className="selection-count">{selectedIds.size} selected</span>
          <select
            value={bulkAction}
            onChange={(e) => setBulkAction(e.target.value)}
            className="bulk-action-select"
          >
            <option value="">Select action...</option>
            <option value="contacted">Mark as Contacted</option>
            <option value="qualified">Mark as Qualified</option>
            <option value="lost">Mark as Lost</option>
          </select>
          <button
            className="btn btn-sm btn-primary"
            onClick={handleBulkAction}
            disabled={!bulkAction || bulkLoading}
          >
            {bulkLoading ? 'Updating...' : 'Apply'}
          </button>
          <button className="btn btn-sm btn-ghost" onClick={clearSelection}>
            Clear
          </button>
        </div>
      )}

      <table className="lead-list-table">
        <thead>
          <tr>
            <th className="checkbox-col">
              <input
                type="checkbox"
                checked={selectedIds.size === leads.length && leads.length > 0}
                onChange={toggleSelectAll}
                title="Select all"
              />
            </th>
            <th>Lead</th>
            <th>Score</th>
            <th>Contact</th>
            <th>Source</th>
            <th>Timeline</th>
            <th>Status</th>
            <th>Priority</th>
            <th>Follow-up</th>
            <th>Created</th>
            <th className="actions-col">Actions</th>
          </tr>
        </thead>
        <tbody>
          {leads.map(lead => (
            <tr
              key={lead.id}
              onClick={() => onLeadSelect(lead)}
              className={selectedIds.has(lead.id) ? 'selected' : ''}
            >
              <td className="checkbox-col" onClick={(e) => e.stopPropagation()}>
                <input
                  type="checkbox"
                  checked={selectedIds.has(lead.id)}
                  onChange={(e) => toggleSelect(lead.id, e)}
                />
              </td>
              <td>
                <div className="lead-name-cell">
                  <span className="lead-name">{lead.contact_name}</span>
                  <span className="lead-number">{lead.lead_number}</span>
                </div>
              </td>
              <td>
                <LeadScoreBadge score={lead.lead_score} />
              </td>
              <td>
                <div className="lead-contact-cell">
                  {lead.contact_email && <span className="lead-contact-email">{lead.contact_email}</span>}
                  {lead.contact_phone && <span className="lead-contact-phone">{lead.contact_phone}</span>}
                </div>
              </td>
              <td>
                <span className="lead-source-label">
                  {lead.lead_source?.replace('_', ' ') || '-'}
                </span>
              </td>
              <td>
                <TimelineBadge timeline={lead.timeline} />
              </td>
              <td>
                <div className="lead-status-cell">
                  <LeadStatusBadge status={lead.status} />
                  {lead.status === 'lost' && lead.lost_reason && (
                    <span className="lead-lost-reason" title={lead.lost_reason}>
                      {lead.lost_reason}
                    </span>
                  )}
                </div>
              </td>
              <td>
                <LeadPriorityBadge priority={lead.priority} />
              </td>
              <td>
                <FollowUpDate date={lead.follow_up_date} />
              </td>
              <td>
                <span className="lead-created-date">
                  {formatRelativeDate(lead.created_at)}
                </span>
              </td>
              <td className="actions-col" onClick={(e) => e.stopPropagation()}>
                <QuickActionsButtons
                  lead={lead}
                  onCall={(e) => openQuickAction('call', lead, e)}
                  onNote={(e) => openQuickAction('note', lead, e)}
                  onEmail={(e) => openQuickAction('email', lead, e)}
                  onStatus={(e) => openQuickAction('status', lead, e)}
                  onFollowUp={(e) => openQuickAction('followup', lead, e)}
                />
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      {/* Quick Action Modal */}
      {quickActionModal.open && (
        <QuickActionModal
          type={quickActionModal.type}
          lead={quickActionModal.lead}
          loading={quickActionLoading}
          onClose={closeQuickAction}
          onCall={handleQuickCall}
          onNote={handleQuickNote}
          onEmail={handleQuickEmail}
          onStatus={handleQuickStatus}
          onFollowUp={handleQuickFollowUp}
        />
      )}

      {/* Pagination */}
      {pagination.totalPages > 1 && (
        <div className="pagination">
          <button
            className="pagination-btn"
            onClick={() => onPageChange(pagination.page - 1)}
            disabled={pagination.page <= 1}
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="15 18 9 12 15 6"/></svg>
            Previous
          </button>
          <span className="pagination-info">
            Page {pagination.page} of {pagination.totalPages}
          </span>
          <button
            className="pagination-btn"
            onClick={() => onPageChange(pagination.page + 1)}
            disabled={pagination.page >= pagination.totalPages}
          >
            Next
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="9 18 15 12 9 6"/></svg>
          </button>
        </div>
      )}
    </div>
  );
}

// Timeline Badge component
function TimelineBadge({ timeline }) {
  const labels = {
    asap: 'ASAP',
    '1_2_weeks': '1-2 Weeks',
    '1_3_months': '1-3 Months',
    '3_6_months': '3-6 Months',
    just_researching: 'Researching'
  };

  if (!timeline) return <span className="lead-empty-cell">-</span>;

  const isUrgent = timeline === 'asap' || timeline === '1_2_weeks';

  return (
    <span className={`timeline-badge ${isUrgent ? 'timeline-urgent' : 'timeline-normal'}`}>
      {isUrgent && (
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M8.5 14.5A2.5 2.5 0 0 0 11 12c0-1.38-.5-2-1-3-1.072-2.143-.224-4.054 2-6 .5 2.5 2 4.9 4 6.5 2 1.6 3 3.5 3 5.5a7 7 0 1 1-14 0c0-1.153.433-2.294 1-3a2.5 2.5 0 0 0 2.5 2.5z"/></svg>
      )}
      {labels[timeline] || timeline}
    </span>
  );
}

// Follow-up Date component
function FollowUpDate({ date }) {
  if (!date) return <span className="lead-empty-cell">-</span>;

  const followUp = new Date(date);
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  followUp.setHours(0, 0, 0, 0);

  const diffDays = Math.floor((followUp - today) / (1000 * 60 * 60 * 24));

  let className = 'followup-badge ';
  let text = followUp.toLocaleDateString('en-CA', { month: 'short', day: 'numeric' });

  if (diffDays < 0) {
    className += 'followup-overdue';
    text = `${Math.abs(diffDays)}d overdue`;
  } else if (diffDays === 0) {
    className += 'followup-today';
    text = 'Today';
  } else if (diffDays === 1) {
    className += 'followup-tomorrow';
    text = 'Tomorrow';
  } else {
    className += 'followup-future';
  }

  return (
    <span className={className}>
      {diffDays < 0 && (
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>
      )}
      {diffDays === 0 && (
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="4" width="18" height="18" rx="2" ry="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>
      )}
      {text}
    </span>
  );
}

// Lead Score Badge component
function LeadScoreBadge({ score }) {
  if (score === null || score === undefined) {
    return <span className="score-badge score-none">--</span>;
  }

  let className = 'score-badge ';
  let label;
  if (score >= 80) { className += 'score-a'; label = 'A'; }
  else if (score >= 60) { className += 'score-b'; label = 'B'; }
  else if (score >= 40) { className += 'score-c'; label = 'C'; }
  else { className += 'score-d'; label = 'D'; }

  return (
    <div className={className}>
      <span className="score-number">{score}</span>
      <span className="score-letter">{label}</span>
    </div>
  );
}

// Quick Actions Buttons component — SVG icons instead of emojis
function QuickActionsButtons({ lead: _lead, onCall, onNote, onEmail, onStatus, onFollowUp }) {
  return (
    <div className="quick-actions-row">
      <button className="qa-btn qa-btn-call" onClick={onCall} title="Log call">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z"/></svg>
      </button>
      <button className="qa-btn qa-btn-email" onClick={onEmail} title="Log email">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z"/><polyline points="22,6 12,13 2,6"/></svg>
      </button>
      <button className="qa-btn qa-btn-note" onClick={onNote} title="Add note">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
      </button>
      <button className="qa-btn qa-btn-status" onClick={onStatus} title="Change status">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12"/></svg>
      </button>
      <button className="qa-btn qa-btn-followup" onClick={onFollowUp} title="Schedule follow-up">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="4" width="18" height="18" rx="2" ry="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>
      </button>
    </div>
  );
}

// Quick Action Modal component
function QuickActionModal({ type, lead, loading, onClose, onCall, onNote, onEmail, onStatus, onFollowUp }) {
  const [formData, setFormData] = useState({});
  const [showLostReasons, setShowLostReasons] = useState(false);
  const [selectedLostReason, setSelectedLostReason] = useState('');
  const [customLostReason, setCustomLostReason] = useState('');
  const [useCustomLostReason, setUseCustomLostReason] = useState(false);
  const modalRef = useRef(null);

  const commonLostReasons = [
    { id: 'price', label: 'Price too high', icon: '💰' },
    { id: 'competitor', label: 'Went with competitor', icon: '🏃' },
    { id: 'timing', label: 'Bad timing / Not ready', icon: '⏰' },
    { id: 'no_response', label: 'No response / Unresponsive', icon: '📵' },
    { id: 'budget', label: 'Budget constraints', icon: '💸' },
    { id: 'changed_mind', label: 'Changed mind / No longer needed', icon: '🔄' },
    { id: 'wrong_fit', label: 'Product not a good fit', icon: '❌' },
    { id: 'delayed', label: 'Project delayed indefinitely', icon: '📅' }
  ];

  useEffect(() => {
    // Focus the first input when modal opens
    const firstInput = modalRef.current?.querySelector('input, textarea, select');
    if (firstInput) firstInput.focus();

    // Close on escape key
    const handleEscape = (e) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', handleEscape);
    return () => document.removeEventListener('keydown', handleEscape);
  }, [onClose]);

  const handleSubmit = (e) => {
    e.preventDefault();
    switch (type) {
      case 'call':
        onCall(formData);
        break;
      case 'note':
        onNote(formData);
        break;
      case 'email':
        onEmail(formData);
        break;
      case 'followup':
        onFollowUp(formData);
        break;
      default:
        break;
    }
  };

  const titles = {
    call: 'Log Phone Call',
    note: 'Add Quick Note',
    email: 'Log Email',
    status: 'Change Status',
    followup: 'Schedule Follow-up'
  };

  const titleIcons = {
    call: <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z"/></svg>,
    note: <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>,
    email: <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z"/><polyline points="22,6 12,13 2,6"/></svg>,
    status: <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12"/></svg>,
    followup: <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="4" width="18" height="18" rx="2" ry="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>,
  };

  return (
    <div className="quick-capture-modal" onClick={onClose}>
      <div className="quick-action-content" ref={modalRef} onClick={(e) => e.stopPropagation()}>
        <div className="quick-action-header">
          <div>
            <h3 className="quick-action-title">
              {titleIcons[type]}
              {titles[type]}
            </h3>
            <p className="quick-action-subtitle">
              {lead.contact_name} <span className="quick-action-lead-num">{lead.lead_number}</span>
            </p>
          </div>
          <button className="quick-action-close" onClick={onClose}>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
          </button>
        </div>

        <div className="quick-action-body">
        {type === 'status' ? (
          showLostReasons ? (
            // Lost Reason Selection
            <div>
              <button
                onClick={() => setShowLostReasons(false)}
                className="btn btn-sm btn-ghost"
                style={{ marginBottom: '12px' }}
              >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="15 18 9 12 15 6"/></svg>
                Back to status options
              </button>
              <h4 style={{ margin: '0 0 12px', fontSize: '15px', color: '#374151', fontWeight: '600' }}>
                Why was this lead lost?
              </h4>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px', marginBottom: '12px' }}>
                {commonLostReasons.map(reason => (
                  <button
                    key={reason.id}
                    onClick={() => {
                      setSelectedLostReason(reason.label);
                      setUseCustomLostReason(false);
                    }}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: '6px',
                      padding: '10px',
                      border: selectedLostReason === reason.label && !useCustomLostReason
                        ? '2px solid #dc2626'
                        : '1px solid #e5e7eb',
                      borderRadius: '8px',
                      background: selectedLostReason === reason.label && !useCustomLostReason
                        ? '#fef2f2'
                        : 'white',
                      cursor: 'pointer',
                      textAlign: 'left',
                      fontSize: '13px',
                      transition: 'all 0.15s'
                    }}
                  >
                    <span>{reason.icon}</span>
                    <span>{reason.label}</span>
                  </button>
                ))}
              </div>
              <div style={{ marginBottom: '12px' }}>
                <label style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '14px', cursor: 'pointer' }}>
                  <input
                    type="checkbox"
                    checked={useCustomLostReason}
                    onChange={(e) => {
                      setUseCustomLostReason(e.target.checked);
                      if (e.target.checked) setSelectedLostReason('');
                    }}
                  />
                  Custom reason
                </label>
                {useCustomLostReason && (
                  <textarea
                    value={customLostReason}
                    onChange={(e) => setCustomLostReason(e.target.value)}
                    placeholder="Enter custom reason..."
                    rows={2}
                    className="form-group-input"
                    style={{ marginTop: '8px' }}
                  />
                )}
              </div>
              <div style={{ display: 'flex', gap: '8px' }}>
                <button className="btn btn-sm btn-secondary" style={{ flex: 1 }} onClick={(e) => onStatus('lost', e, null)}>
                  Skip (No Reason)
                </button>
                <button
                  className="btn btn-sm btn-danger"
                  style={{ flex: 1 }}
                  onClick={(e) => {
                    const reason = useCustomLostReason ? customLostReason.trim() : selectedLostReason;
                    onStatus('lost', e, reason || null);
                  }}
                  disabled={!selectedLostReason && (!useCustomLostReason || !customLostReason.trim())}
                >
                  Mark as Lost
                </button>
              </div>
            </div>
          ) : (
            // Normal Status Selection
            <div className="status-select-grid">
              {['contacted', 'qualified', 'converted', 'lost'].map((status) => {
                const isCurrent = lead.status === status;
                const icons = {
                  contacted: <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72"/></svg>,
                  qualified: <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12"/></svg>,
                  converted: <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/></svg>,
                  lost: <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>,
                };
                return (
                  <button
                    key={status}
                    onClick={(e) => {
                      if (status === 'lost') {
                        setShowLostReasons(true);
                      } else {
                        onStatus(status, e);
                      }
                    }}
                    disabled={loading || isCurrent}
                    className={`status-select-btn ${isCurrent ? 'status-select-current' : ''}`}
                  >
                    {icons[status]}
                    <span style={{ textTransform: 'capitalize' }}>{status.replace('_', ' ')}</span>
                    {isCurrent && <span className="status-current-tag">current</span>}
                  </button>
                );
              })}
            </div>
          )
        ) : (
          <form onSubmit={handleSubmit}>
            {type === 'call' && (
              <>
                <div className="qa-form-group">
                  <label className="qa-label">Call Outcome</label>
                  <select
                    className="qa-input"
                    value={formData.outcome || ''}
                    onChange={(e) => setFormData({ ...formData, outcome: e.target.value })}
                    required
                  >
                    <option value="">Select outcome...</option>
                    <option value="answered">Answered - Spoke with contact</option>
                    <option value="voicemail">Left voicemail</option>
                    <option value="no_answer">No answer</option>
                    <option value="busy">Busy / Call back later</option>
                    <option value="wrong_number">Wrong number</option>
                  </select>
                </div>
                <div className="qa-form-group">
                  <label className="qa-label">Duration (minutes)</label>
                  <input
                    type="number"
                    className="qa-input"
                    placeholder="Optional"
                    min="0"
                    value={formData.duration_minutes || ''}
                    onChange={(e) => setFormData({ ...formData, duration_minutes: e.target.value })}
                  />
                </div>
                <div className="qa-form-group">
                  <label className="qa-label">Notes</label>
                  <textarea
                    className="qa-input qa-textarea"
                    placeholder="Call notes..."
                    value={formData.notes || ''}
                    onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
                  />
                </div>
              </>
            )}

            {type === 'note' && (
              <div className="qa-form-group">
                <label className="qa-label">Note</label>
                <textarea
                  className="qa-input qa-textarea qa-textarea-lg"
                  placeholder="Enter your note..."
                  required
                  value={formData.note || ''}
                  onChange={(e) => setFormData({ ...formData, note: e.target.value })}
                />
              </div>
            )}

            {type === 'email' && (
              <>
                <div className="qa-form-group">
                  <label className="qa-label">Subject</label>
                  <input
                    type="text"
                    className="qa-input"
                    placeholder="Email subject..."
                    value={formData.subject || ''}
                    onChange={(e) => setFormData({ ...formData, subject: e.target.value })}
                  />
                </div>
                <div className="qa-form-group">
                  <label className="qa-label">Notes</label>
                  <textarea
                    className="qa-input qa-textarea"
                    placeholder="Brief summary of the email..."
                    value={formData.notes || ''}
                    onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
                  />
                </div>
              </>
            )}

            {type === 'followup' && (
              <>
                <div className="qa-form-group">
                  <label className="qa-label">Follow-up Date</label>
                  <input
                    type="date"
                    className="qa-input"
                    required
                    min={new Date().toISOString().split('T')[0]}
                    value={formData.follow_up_date || ''}
                    onChange={(e) => setFormData({ ...formData, follow_up_date: e.target.value })}
                  />
                </div>
                <div className="qa-form-group">
                  <label className="qa-label">Reminder Note</label>
                  <textarea
                    className="qa-input qa-textarea-sm"
                    placeholder="What's the follow-up about?"
                    value={formData.note || ''}
                    onChange={(e) => setFormData({ ...formData, note: e.target.value })}
                  />
                </div>
                <div className="qa-quick-dates">
                  {[
                    { label: 'Tomorrow', days: 1 },
                    { label: 'In 3 days', days: 3 },
                    { label: 'Next week', days: 7 }
                  ].map(({ label, days }) => {
                    const date = new Date();
                    date.setDate(date.getDate() + days);
                    const dateStr = date.toISOString().split('T')[0];
                    return (
                      <button
                        key={days}
                        type="button"
                        className={`qa-quick-date-btn ${formData.follow_up_date === dateStr ? 'qa-quick-date-active' : ''}`}
                        onClick={() => setFormData({ ...formData, follow_up_date: dateStr })}
                      >
                        {label}
                      </button>
                    );
                  })}
                </div>
              </>
            )}

            <div className="qa-form-footer">
              <button type="button" className="btn btn-secondary btn-sm" onClick={onClose} disabled={loading}>
                Cancel
              </button>
              <button type="submit" className="btn btn-primary btn-sm" disabled={loading}>
                {loading ? 'Saving...' : 'Save'}
              </button>
            </div>
          </form>
        )}
        </div>
      </div>
    </div>
  );
}

export default LeadList;
