/**
 * LeadList - Displays leads in a table/card format
 * Includes bulk selection, follow-up alerts, and export functionality
 */

import React, { useState, useMemo } from 'react';
import LeadStatusBadge from './LeadStatusBadge';
import LeadPriorityBadge from './LeadPriorityBadge';
import { updateLeadStatus } from './hooks/useLeads';
import { useToast } from '../ui/Toast';

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
            <th>Contact</th>
            <th>Source</th>
            <th>Timeline</th>
            <th>Status</th>
            <th>Priority</th>
            <th>Follow-up</th>
            <th>Created</th>
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
            </tr>
          ))}
        </tbody>
      </table>

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

export default LeadList;
