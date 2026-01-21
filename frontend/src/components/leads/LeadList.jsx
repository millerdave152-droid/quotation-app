/**
 * LeadList - Displays leads in a table/card format
 */

import React from 'react';
import LeadStatusBadge from './LeadStatusBadge';
import LeadPriorityBadge from './LeadPriorityBadge';

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
      <div className="lead-list-header">
        <h2>Leads ({pagination.total})</h2>
        <button className="btn btn-sm btn-secondary" onClick={onRefresh}>
          Refresh
        </button>
      </div>

      <table className="lead-list-table">
        <thead>
          <tr>
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
            <tr key={lead.id} onClick={() => onLeadSelect(lead)}>
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
