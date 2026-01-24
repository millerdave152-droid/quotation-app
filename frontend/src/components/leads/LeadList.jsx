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
                <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                  <LeadStatusBadge status={lead.status} />
                  {lead.status === 'lost' && lead.lost_reason && (
                    <span
                      style={{
                        fontSize: '0.75rem',
                        color: '#991b1b',
                        maxWidth: '150px',
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                        whiteSpace: 'nowrap'
                      }}
                      title={lead.lost_reason}
                    >
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

  if (!timeline) return <span style={{ color: '#9ca3af', fontSize: '14px' }}>-</span>;

  const isUrgent = timeline === 'asap' || timeline === '1_2_weeks';

  return (
    <span
      style={{
        fontSize: '12px',
        fontWeight: '600',
        padding: '6px 10px',
        borderRadius: '6px',
        background: isUrgent
          ? 'linear-gradient(135deg, #fef3c7 0%, #fde68a 100%)'
          : 'linear-gradient(135deg, #f3f4f6 0%, #e5e7eb 100%)',
        color: isUrgent ? '#b45309' : '#6b7280',
        display: 'inline-block',
        whiteSpace: 'nowrap'
      }}
    >
      {isUrgent && '🔥 '}{labels[timeline] || timeline}
    </span>
  );
}

// Follow-up Date component
function FollowUpDate({ date }) {
  if (!date) return <span style={{ color: '#9ca3af', fontSize: '14px' }}>-</span>;

  const followUp = new Date(date);
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  followUp.setHours(0, 0, 0, 0);

  const diffDays = Math.floor((followUp - today) / (1000 * 60 * 60 * 24));

  let style = {
    fontSize: '13px',
    padding: '5px 10px',
    borderRadius: '6px',
    display: 'inline-block',
    fontWeight: '500'
  };
  let text = followUp.toLocaleDateString('en-CA', { month: 'short', day: 'numeric' });

  if (diffDays < 0) {
    style.background = 'linear-gradient(135deg, #fee2e2 0%, #fecaca 100%)';
    style.color = '#dc2626';
    style.fontWeight = '600';
    text = `⚠️ ${Math.abs(diffDays)}d overdue`;
  } else if (diffDays === 0) {
    style.background = 'linear-gradient(135deg, #fef3c7 0%, #fde68a 100%)';
    style.color = '#d97706';
    style.fontWeight = '600';
    text = '📌 Today';
  } else if (diffDays === 1) {
    style.background = 'linear-gradient(135deg, #dbeafe 0%, #bfdbfe 100%)';
    style.color = '#1d4ed8';
    text = 'Tomorrow';
  } else {
    style.background = '#f3f4f6';
    style.color = '#6b7280';
  }

  return <span style={style}>{text}</span>;
}

// Lead Score Badge component
function LeadScoreBadge({ score }) {
  if (score === null || score === undefined) {
    return (
      <span style={{
        fontSize: '12px',
        padding: '6px 12px',
        borderRadius: '20px',
        background: '#f3f4f6',
        color: '#9ca3af',
        fontWeight: '500'
      }}>
        --
      </span>
    );
  }

  // Determine color based on score
  let bgGradient, textColor, label, shadowColor;
  if (score >= 80) {
    bgGradient = 'linear-gradient(135deg, #dcfce7 0%, #bbf7d0 100%)';
    textColor = '#166534';
    label = 'A';
    shadowColor = 'rgba(22, 163, 74, 0.2)';
  } else if (score >= 60) {
    bgGradient = 'linear-gradient(135deg, #dbeafe 0%, #bfdbfe 100%)';
    textColor = '#1e40af';
    label = 'B';
    shadowColor = 'rgba(30, 64, 175, 0.2)';
  } else if (score >= 40) {
    bgGradient = 'linear-gradient(135deg, #fef3c7 0%, #fde68a 100%)';
    textColor = '#92400e';
    label = 'C';
    shadowColor = 'rgba(146, 64, 14, 0.2)';
  } else {
    bgGradient = 'linear-gradient(135deg, #fee2e2 0%, #fecaca 100%)';
    textColor = '#991b1b';
    label = 'D';
    shadowColor = 'rgba(153, 27, 27, 0.2)';
  }

  return (
    <div style={{
      display: 'inline-flex',
      alignItems: 'center',
      gap: '6px',
      padding: '6px 12px',
      borderRadius: '20px',
      background: bgGradient,
      boxShadow: `0 2px 8px ${shadowColor}`
    }}>
      <span style={{
        fontSize: '14px',
        color: textColor,
        fontWeight: '700'
      }}>
        {score}
      </span>
      <span style={{
        fontSize: '10px',
        padding: '2px 6px',
        borderRadius: '4px',
        background: textColor,
        color: 'white',
        fontWeight: '700',
        letterSpacing: '0.05em'
      }}>
        {label}
      </span>
    </div>
  );
}

// Quick Actions Buttons component
function QuickActionsButtons({ lead, onCall, onNote, onEmail, onStatus, onFollowUp }) {
  const buttonStyle = {
    padding: '8px 10px',
    border: 'none',
    borderRadius: '8px',
    cursor: 'pointer',
    fontSize: '14px',
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    transition: 'all 0.2s ease',
    boxShadow: '0 1px 2px rgba(0,0,0,0.05)'
  };

  return (
    <div style={{ display: 'flex', gap: '6px', flexWrap: 'nowrap', justifyContent: 'center' }}>
      <button
        onClick={onCall}
        style={{ ...buttonStyle, background: 'linear-gradient(135deg, #dbeafe, #bfdbfe)', color: '#1e40af' }}
        title="Log call"
        onMouseEnter={(e) => e.target.style.transform = 'translateY(-2px)'}
        onMouseLeave={(e) => e.target.style.transform = 'translateY(0)'}
      >
        📞
      </button>
      <button
        onClick={onEmail}
        style={{ ...buttonStyle, background: 'linear-gradient(135deg, #e0e7ff, #c7d2fe)', color: '#3730a3' }}
        title="Log email"
        onMouseEnter={(e) => e.target.style.transform = 'translateY(-2px)'}
        onMouseLeave={(e) => e.target.style.transform = 'translateY(0)'}
      >
        📧
      </button>
      <button
        onClick={onNote}
        style={{ ...buttonStyle, background: 'linear-gradient(135deg, #fef3c7, #fde68a)', color: '#92400e' }}
        title="Add note"
        onMouseEnter={(e) => e.target.style.transform = 'translateY(-2px)'}
        onMouseLeave={(e) => e.target.style.transform = 'translateY(0)'}
      >
        📝
      </button>
      <button
        onClick={onStatus}
        style={{ ...buttonStyle, background: 'linear-gradient(135deg, #f3f4f6, #e5e7eb)', color: '#374151' }}
        title="Change status"
        onMouseEnter={(e) => e.target.style.transform = 'translateY(-2px)'}
        onMouseLeave={(e) => e.target.style.transform = 'translateY(0)'}
      >
        ⚡
      </button>
      <button
        onClick={onFollowUp}
        style={{ ...buttonStyle, background: 'linear-gradient(135deg, #dcfce7, #bbf7d0)', color: '#166534' }}
        title="Schedule follow-up"
        onMouseEnter={(e) => e.target.style.transform = 'translateY(-2px)'}
        onMouseLeave={(e) => e.target.style.transform = 'translateY(0)'}
      >
        📅
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

  const modalStyle = {
    position: 'fixed',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    background: 'rgba(0, 0, 0, 0.6)',
    backdropFilter: 'blur(4px)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 1000
  };

  const contentStyle = {
    background: 'white',
    borderRadius: '16px',
    padding: '0',
    width: '100%',
    maxWidth: '480px',
    maxHeight: '90vh',
    overflow: 'hidden',
    boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.25)'
  };

  const headerStyle = {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: '20px 24px',
    background: 'linear-gradient(135deg, #f8fafc 0%, #f1f5f9 100%)',
    borderBottom: '1px solid #e5e7eb'
  };

  const bodyStyle = {
    padding: '24px',
    maxHeight: 'calc(90vh - 140px)',
    overflowY: 'auto'
  };

  const inputStyle = {
    width: '100%',
    padding: '12px 14px',
    border: '1px solid #d1d5db',
    borderRadius: '8px',
    fontSize: '14px',
    marginTop: '6px',
    transition: 'border-color 0.2s, box-shadow 0.2s',
    boxSizing: 'border-box'
  };

  const labelStyle = {
    display: 'block',
    fontSize: '13px',
    fontWeight: '600',
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
            <h3 style={{ margin: 0, fontSize: '18px', fontWeight: '600', color: '#111827' }}>{titles[type]}</h3>
            <p style={{ margin: '4px 0 0', fontSize: '13px', color: '#6b7280' }}>
              {lead.contact_name} • <span style={{ fontFamily: 'monospace' }}>{lead.lead_number}</span>
            </p>
          </div>
          <button
            onClick={onClose}
            style={{
              background: '#f3f4f6',
              border: 'none',
              fontSize: '18px',
              cursor: 'pointer',
              color: '#6b7280',
              lineHeight: 1,
              width: '32px',
              height: '32px',
              borderRadius: '8px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              transition: 'all 0.15s'
            }}
            onMouseEnter={(e) => { e.target.style.background = '#e5e7eb'; e.target.style.color = '#374151'; }}
            onMouseLeave={(e) => { e.target.style.background = '#f3f4f6'; e.target.style.color = '#6b7280'; }}
          >
            ✕
          </button>
        </div>

        <div style={bodyStyle}>
        {type === 'status' ? (
          showLostReasons ? (
            // Lost Reason Selection
            <div>
              <button
                onClick={() => setShowLostReasons(false)}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '6px',
                  background: 'none',
                  border: 'none',
                  cursor: 'pointer',
                  fontSize: '0.875rem',
                  color: '#6b7280',
                  marginBottom: '12px',
                  padding: '4px 0'
                }}
              >
                ← Back to status options
              </button>
              <h4 style={{ margin: '0 0 12px', fontSize: '0.95rem', color: '#374151' }}>
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
                      borderRadius: '6px',
                      background: selectedLostReason === reason.label && !useCustomLostReason
                        ? '#fef2f2'
                        : 'white',
                      cursor: 'pointer',
                      textAlign: 'left',
                      fontSize: '0.8rem'
                    }}
                  >
                    <span>{reason.icon}</span>
                    <span>{reason.label}</span>
                  </button>
                ))}
              </div>
              <div style={{ marginBottom: '12px' }}>
                <label style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '0.875rem', cursor: 'pointer' }}>
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
                    style={{
                      width: '100%',
                      marginTop: '8px',
                      padding: '8px',
                      border: '1px solid #d1d5db',
                      borderRadius: '6px',
                      fontSize: '0.875rem',
                      boxSizing: 'border-box'
                    }}
                  />
                )}
              </div>
              <div style={{ display: 'flex', gap: '8px' }}>
                <button
                  onClick={(e) => onStatus('lost', e, null)}
                  style={{
                    flex: 1,
                    padding: '10px',
                    background: '#f3f4f6',
                    border: '1px solid #d1d5db',
                    borderRadius: '6px',
                    cursor: 'pointer',
                    fontSize: '0.875rem'
                  }}
                >
                  Skip (No Reason)
                </button>
                <button
                  onClick={(e) => {
                    const reason = useCustomLostReason ? customLostReason.trim() : selectedLostReason;
                    onStatus('lost', e, reason || null);
                  }}
                  disabled={!selectedLostReason && (!useCustomLostReason || !customLostReason.trim())}
                  style={{
                    flex: 1,
                    padding: '10px',
                    background: (selectedLostReason || (useCustomLostReason && customLostReason.trim())) ? '#dc2626' : '#9ca3af',
                    color: 'white',
                    border: 'none',
                    borderRadius: '6px',
                    cursor: (selectedLostReason || (useCustomLostReason && customLostReason.trim())) ? 'pointer' : 'not-allowed',
                    fontSize: '0.875rem',
                    fontWeight: '500'
                  }}
                >
                  Mark as Lost
                </button>
              </div>
            </div>
          ) : (
            // Normal Status Selection
            <div style={{ display: 'grid', gap: '8px' }}>
              {['contacted', 'qualified', 'converted', 'lost'].map((status) => (
                <button
                  key={status}
                  onClick={(e) => {
                    if (status === 'lost') {
                      setShowLostReasons(true);
                    } else {
                      onStatus(status, e);
                    }
                  }}
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
          )
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
    </div>
  );
}

export default LeadList;
