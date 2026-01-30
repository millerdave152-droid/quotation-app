/**
 * LeadTimeline - Activity timeline for a lead
 */

import React from 'react';

const activityTypeLabels = {
  created: 'Lead Created',
  updated: 'Lead Updated',
  status_changed: 'Status Changed',
  note: 'Note Added',
  call: 'Phone Call',
  email: 'Email Sent',
  converted_to_quote: 'Converted to Quote',
  ai_summary: 'AI Summary Generated',
  ai_suggestions: 'AI Suggestions Generated'
};

function LeadTimeline({ activities }) {
  const formatTime = (dateStr) => {
    const date = new Date(dateStr);
    const now = new Date();
    const diffMs = now - date;
    const diffMins = Math.floor(diffMs / (1000 * 60));
    const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
    const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

    if (diffMins < 1) return 'Just now';
    if (diffMins < 60) return `${diffMins}m ago`;
    if (diffHours < 24) return `${diffHours}h ago`;
    if (diffDays < 7) return `${diffDays}d ago`;

    return date.toLocaleDateString('en-CA', {
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  };

  if (!activities || activities.length === 0) {
    return (
      <div className="lead-timeline">
        <div style={{ color: 'var(--text-secondary)', fontStyle: 'italic', fontSize: '0.875rem' }}>
          No activities recorded yet.
        </div>
      </div>
    );
  }

  return (
    <div className="lead-timeline">
      {activities.map((activity, index) => (
        <div key={activity.id || index} className="timeline-item">
          <div className={`timeline-dot ${activity.activity_type}`}></div>
          <div className="timeline-content">
            <div className="timeline-header">
              <span className="timeline-type">
                {activityTypeLabels[activity.activity_type] || activity.activity_type}
              </span>
              <span className="timeline-time">{formatTime(activity.created_at)}</span>
            </div>
            {activity.description && (
              <div className="timeline-description">{activity.description}</div>
            )}
            {activity.performed_by_name && (
              <div className="timeline-user">by {activity.performed_by_name}</div>
            )}
          </div>
        </div>
      ))}
    </div>
  );
}

export default LeadTimeline;
