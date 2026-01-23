/**
 * LeadList - Displays leads in a table/card format
 * Includes bulk selection, follow-up alerts, export functionality, and quick actions
 */

import React, { useState, useMemo, useRef, useEffect } from 'react';
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
  onLeadEdit,
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
      await api.post(`/leads/${quickActionModal.lead.id}/quick-actions/call`, data);
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
      await api.post(`/leads/${quickActionModal.lead.id}/quick-actions/note`, data);
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
      await api.post(`/leads/${quickActionModal.lead.id}/quick-actions/email`, data);
      toast.success('Email logged successfully');
      closeQuickAction();
      onRefresh();
    } catch (error) {
      toast.error(error.response?.data?.error || 'Failed to log email');
    } finally {
      setQuickActionLoading(false);
    }
  };

  const handleQuickStatus = async (status, e) => {
    e.stopPropagation();
    const lead = quickActionModal.lead;
    setQuickActionLoading(true);
    try {
      await api.put(`/leads/${lead.id}/quick-actions/status`, { status });
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
      await api.put(`/leads/${quickActionModal.lead.id}/quick-actions/follow-up`, data);
      toast.success('Follow-up scheduled');
      closeQuickAction();
      onRefresh();
    } catch (error) {
      toast.error(error.response?.data?.error || 'Failed to schedule follow-up');
    } finally {
      setQuickActionLoading(false);
    }
  };

  const formatDate = (dateStr) => {
    if (!dateStr) return '-';
    const date = new Date(dateStr);
    return date.toLocaleDateString('en-CA', {
      month: 'short',
      day: 'numeric',
      year: 'numeric'
    });
  };

  const formatRelativeDate = (dateStr) => {
    if (!dateStr) return '-';
    const date = new Date(dateStr);
    const now = new Date();
    const diffDays = Math.floor((now - date) / (1000 * 60 * 60 * 24));

    if (diffDays === 0) return 'Today';
    if (diffDays === 1) return 'Yesterday';
    if (diffDays < 7) return `${diffDays} days ago`;
    return formatDate(dateStr);
  };

  if (loading) {
    return (
      <div className="lead-list">
        <div className="loading-state">
          <div className="loading-spinner"></div>
          <p>Loading leads...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="lead-list">
        <div className="empty-state">
          <div className="empty-state-icon">!</div>
          <div className="empty-state-title">Error Loading Leads</div>
          <p className="empty-state-description">{error}</p>
          <button className="btn btn-primary" onClick={onRefresh}>
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
          <div className="empty-state-icon">📋</div>
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
        <h2>Leads ({pagination.total})</h2>
        <div className="lead-list-actions">
          <button className="btn btn-sm btn-secondary" onClick={exportToCSV} title="Export to CSV">
            Export CSV
          </button>
          <button className="btn btn-sm btn-secondary" onClick={onRefresh}>
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
                <div style={{ display: 'flex', flexDirection: 'column' }}>
                  <span style={{ fontWeight: 600 }}>{lead.contact_name}</span>
                  <span style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>
                    {lead.lead_number}
                  </span>
                </div>
              </td>
              <td>
                <LeadScoreBadge score={lead.lead_score} />
              </td>
              <td>
                <div style={{ display: 'flex', flexDirection: 'column', fontSize: '0.875rem' }}>
                  {lead.contact_email && <span>{lead.contact_email}</span>}
                  {lead.contact_phone && (
                    <span style={{ color: 'var(--text-secondary)' }}>{lead.contact_phone}</span>
                  )}
                </div>
              </td>
              <td>
                <span style={{ textTransform: 'capitalize' }}>
                  {lead.lead_source?.replace('_', ' ') || '-'}
                </span>
              </td>
              <td>
                <TimelineBadge timeline={lead.timeline} />
              </td>
              <td>
                <LeadStatusBadge status={lead.status} />
              </td>
              <td>
                <LeadPriorityBadge priority={lead.priority} />
              </td>
              <td>
                <FollowUpDate date={lead.follow_up_date} />
              </td>
              <td>
                <span style={{ fontSize: '0.875rem', color: 'var(--text-secondary)' }}>
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

  if (!timeline) return <span style={{ color: 'var(--text-secondary)' }}>-</span>;

  const isUrgent = timeline === 'asap' || timeline === '1_2_weeks';

  return (
    <span
      style={{
        fontSize: '0.8rem',
        padding: '0.25rem 0.5rem',
        borderRadius: '4px',
        background: isUrgent ? '#fef3c7' : '#f3f4f6',
        color: isUrgent ? '#b45309' : '#6b7280'
      }}
    >
      {labels[timeline] || timeline}
    </span>
  );
}

// Follow-up Date component
function FollowUpDate({ date }) {
  if (!date) return <span style={{ color: 'var(--text-secondary)' }}>-</span>;

  const followUp = new Date(date);
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  followUp.setHours(0, 0, 0, 0);

  const diffDays = Math.floor((followUp - today) / (1000 * 60 * 60 * 24));

  let style = { fontSize: '0.875rem' };
  let text = followUp.toLocaleDateString('en-CA', { month: 'short', day: 'numeric' });

  if (diffDays < 0) {
    style.color = '#dc2626';
    style.fontWeight = '600';
    text = `${Math.abs(diffDays)}d overdue`;
  } else if (diffDays === 0) {
    style.color = '#d97706';
    style.fontWeight = '600';
    text = 'Today';
  } else if (diffDays === 1) {
    style.color = '#d97706';
    text = 'Tomorrow';
  }

  return <span style={style}>{text}</span>;
}

// Lead Score Badge component
function LeadScoreBadge({ score }) {
  if (score === null || score === undefined) {
    return (
      <span style={{
        fontSize: '0.75rem',
        padding: '0.2rem 0.5rem',
        borderRadius: '10px',
        background: '#f3f4f6',
        color: '#9ca3af'
      }}>
        --
      </span>
    );
  }

  // Determine color based on score
  let bgColor, textColor, label;
  if (score >= 80) {
    bgColor = '#dcfce7';
    textColor = '#166534';
    label = 'A';
  } else if (score >= 60) {
    bgColor = '#dbeafe';
    textColor = '#1e40af';
    label = 'B';
  } else if (score >= 40) {
    bgColor = '#fef3c7';
    textColor = '#92400e';
    label = 'C';
  } else {
    bgColor = '#fee2e2';
    textColor = '#991b1b';
    label = 'D';
  }

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
      <span style={{
        fontSize: '0.75rem',
        padding: '0.2rem 0.5rem',
        borderRadius: '10px',
        background: bgColor,
        color: textColor,
        fontWeight: '600',
        minWidth: '32px',
        textAlign: 'center'
      }}>
        {score}
      </span>
      <span style={{
        fontSize: '0.65rem',
        padding: '0.1rem 0.3rem',
        borderRadius: '4px',
        background: bgColor,
        color: textColor,
        fontWeight: '700'
      }}>
        {label}
      </span>
    </div>
  );
}

// Quick Actions Buttons component
function QuickActionsButtons({ lead, onCall, onNote, onEmail, onStatus, onFollowUp }) {
  const buttonStyle = {
    padding: '4px 8px',
    border: 'none',
    borderRadius: '4px',
    cursor: 'pointer',
    fontSize: '0.75rem',
    display: 'inline-flex',
    alignItems: 'center',
    gap: '4px',
    transition: 'background-color 0.2s'
  };

  return (
    <div style={{ display: 'flex', gap: '4px', flexWrap: 'nowrap' }}>
      <button
        onClick={onCall}
        style={{ ...buttonStyle, background: '#dbeafe', color: '#1e40af' }}
        title="Log call"
      >
        <span>📞</span>
      </button>
      <button
        onClick={onEmail}
        style={{ ...buttonStyle, background: '#e0e7ff', color: '#3730a3' }}
        title="Log email"
      >
        <span>📧</span>
      </button>
      <button
        onClick={onNote}
        style={{ ...buttonStyle, background: '#fef3c7', color: '#92400e' }}
        title="Add note"
      >
        <span>📝</span>
      </button>
      <button
        onClick={onStatus}
        style={{ ...buttonStyle, background: '#f3f4f6', color: '#374151' }}
        title="Change status"
      >
        <span>⚡</span>
      </button>
      <button
        onClick={onFollowUp}
        style={{ ...buttonStyle, background: '#dcfce7', color: '#166534' }}
        title="Schedule follow-up"
      >
        <span>📅</span>
      </button>
    </div>
  );
}

// Quick Action Modal component
function QuickActionModal({ type, lead, loading, onClose, onCall, onNote, onEmail, onStatus, onFollowUp }) {
  const [formData, setFormData] = useState({});
  const modalRef = useRef(null);

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

  const modalStyle = {
    position: 'fixed',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    background: 'rgba(0, 0, 0, 0.5)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 1000
  };

  const contentStyle = {
    background: 'white',
    borderRadius: '8px',
    padding: '24px',
    width: '100%',
    maxWidth: '450px',
    maxHeight: '90vh',
    overflow: 'auto',
    boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.1)'
  };

  const headerStyle = {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: '16px',
    paddingBottom: '12px',
    borderBottom: '1px solid #e5e7eb'
  };

  const inputStyle = {
    width: '100%',
    padding: '8px 12px',
    border: '1px solid #d1d5db',
    borderRadius: '6px',
    fontSize: '0.875rem',
    marginTop: '4px'
  };

  const labelStyle = {
    display: 'block',
    fontSize: '0.875rem',
    fontWeight: '500',
    color: '#374151',
    marginBottom: '4px'
  };

  const titles = {
    call: 'Log Phone Call',
    note: 'Add Quick Note',
    email: 'Log Email',
    status: 'Change Status',
    followup: 'Schedule Follow-up'
  };

  return (
    <div style={modalStyle} onClick={onClose}>
      <div style={contentStyle} ref={modalRef} onClick={(e) => e.stopPropagation()}>
        <div style={headerStyle}>
          <div>
            <h3 style={{ margin: 0, fontSize: '1.1rem', fontWeight: '600' }}>{titles[type]}</h3>
            <p style={{ margin: '4px 0 0', fontSize: '0.8rem', color: '#6b7280' }}>
              {lead.contact_name} • {lead.lead_number}
            </p>
          </div>
          <button
            onClick={onClose}
            style={{
              background: 'none',
              border: 'none',
              fontSize: '1.5rem',
              cursor: 'pointer',
              color: '#9ca3af',
              lineHeight: 1
            }}
          >
            ×
          </button>
        </div>

        {type === 'status' ? (
          <div style={{ display: 'grid', gap: '8px' }}>
            {['contacted', 'qualified', 'converted', 'lost'].map((status) => (
              <button
                key={status}
                onClick={(e) => onStatus(status, e)}
                disabled={loading || lead.status === status}
                style={{
                  padding: '12px 16px',
                  border: lead.status === status ? '2px solid #3b82f6' : '1px solid #e5e7eb',
                  borderRadius: '8px',
                  background: lead.status === status ? '#eff6ff' : 'white',
                  cursor: lead.status === status ? 'default' : 'pointer',
                  textAlign: 'left',
                  textTransform: 'capitalize',
                  fontSize: '0.9rem',
                  fontWeight: lead.status === status ? '600' : '400',
                  color: lead.status === status ? '#1d4ed8' : '#374151',
                  opacity: loading ? 0.7 : 1
                }}
              >
                {status === 'contacted' && '📞 '}
                {status === 'qualified' && '✓ '}
                {status === 'converted' && '🎉 '}
                {status === 'lost' && '✗ '}
                {status.replace('_', ' ')}
                {lead.status === status && ' (current)'}
              </button>
            ))}
          </div>
        ) : (
          <form onSubmit={handleSubmit}>
            {type === 'call' && (
              <>
                <div style={{ marginBottom: '16px' }}>
                  <label style={labelStyle}>Call Outcome</label>
                  <select
                    style={inputStyle}
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
                <div style={{ marginBottom: '16px' }}>
                  <label style={labelStyle}>Duration (minutes)</label>
                  <input
                    type="number"
                    style={inputStyle}
                    placeholder="Optional"
                    min="0"
                    value={formData.duration_minutes || ''}
                    onChange={(e) => setFormData({ ...formData, duration_minutes: e.target.value })}
                  />
                </div>
                <div style={{ marginBottom: '16px' }}>
                  <label style={labelStyle}>Notes</label>
                  <textarea
                    style={{ ...inputStyle, minHeight: '80px', resize: 'vertical' }}
                    placeholder="Call notes..."
                    value={formData.notes || ''}
                    onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
                  />
                </div>
              </>
            )}

            {type === 'note' && (
              <div style={{ marginBottom: '16px' }}>
                <label style={labelStyle}>Note</label>
                <textarea
                  style={{ ...inputStyle, minHeight: '120px', resize: 'vertical' }}
                  placeholder="Enter your note..."
                  required
                  value={formData.note || ''}
                  onChange={(e) => setFormData({ ...formData, note: e.target.value })}
                />
              </div>
            )}

            {type === 'email' && (
              <>
                <div style={{ marginBottom: '16px' }}>
                  <label style={labelStyle}>Subject</label>
                  <input
                    type="text"
                    style={inputStyle}
                    placeholder="Email subject..."
                    value={formData.subject || ''}
                    onChange={(e) => setFormData({ ...formData, subject: e.target.value })}
                  />
                </div>
                <div style={{ marginBottom: '16px' }}>
                  <label style={labelStyle}>Notes</label>
                  <textarea
                    style={{ ...inputStyle, minHeight: '80px', resize: 'vertical' }}
                    placeholder="Brief summary of the email..."
                    value={formData.notes || ''}
                    onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
                  />
                </div>
              </>
            )}

            {type === 'followup' && (
              <>
                <div style={{ marginBottom: '16px' }}>
                  <label style={labelStyle}>Follow-up Date</label>
                  <input
                    type="date"
                    style={inputStyle}
                    required
                    min={new Date().toISOString().split('T')[0]}
                    value={formData.follow_up_date || ''}
                    onChange={(e) => setFormData({ ...formData, follow_up_date: e.target.value })}
                  />
                </div>
                <div style={{ marginBottom: '16px' }}>
                  <label style={labelStyle}>Reminder Note</label>
                  <textarea
                    style={{ ...inputStyle, minHeight: '60px', resize: 'vertical' }}
                    placeholder="What's the follow-up about?"
                    value={formData.note || ''}
                    onChange={(e) => setFormData({ ...formData, note: e.target.value })}
                  />
                </div>
                <div style={{ display: 'flex', gap: '8px', marginBottom: '16px' }}>
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
                        onClick={() => setFormData({ ...formData, follow_up_date: dateStr })}
                        style={{
                          flex: 1,
                          padding: '8px',
                          border: formData.follow_up_date === dateStr ? '2px solid #3b82f6' : '1px solid #e5e7eb',
                          borderRadius: '6px',
                          background: formData.follow_up_date === dateStr ? '#eff6ff' : '#f9fafb',
                          cursor: 'pointer',
                          fontSize: '0.75rem'
                        }}
                      >
                        {label}
                      </button>
                    );
                  })}
                </div>
              </>
            )}

            <div style={{ display: 'flex', gap: '12px', justifyContent: 'flex-end' }}>
              <button
                type="button"
                onClick={onClose}
                disabled={loading}
                style={{
                  padding: '8px 16px',
                  border: '1px solid #d1d5db',
                  borderRadius: '6px',
                  background: 'white',
                  cursor: 'pointer',
                  fontSize: '0.875rem'
                }}
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={loading}
                style={{
                  padding: '8px 16px',
                  border: 'none',
                  borderRadius: '6px',
                  background: '#3b82f6',
                  color: 'white',
                  cursor: loading ? 'not-allowed' : 'pointer',
                  fontSize: '0.875rem',
                  fontWeight: '500',
                  opacity: loading ? 0.7 : 1
                }}
              >
                {loading ? 'Saving...' : 'Save'}
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}

export default LeadList;
