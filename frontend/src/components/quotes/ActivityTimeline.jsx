import { authFetch } from '../../services/authFetch';
/**
 * ActivityTimeline Component
 *
 * Displays a comprehensive activity timeline for quotes.
 * Features:
 * - Chronological activity display
 * - Activity type filtering
 * - Add note functionality
 * - Contact logging
 * - Follow-up scheduling
 */

import React, { useState, useCallback } from 'react';

const API_URL = process.env.REACT_APP_API_URL || '';

// SVG icon helper
const SvgIcon = ({ d, color = 'currentColor', size = 14 }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" dangerouslySetInnerHTML={{ __html: d }} />
);

// Activity type configurations
const ACTIVITY_CONFIG = {
  CREATED: { icon: <SvgIcon d='<circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="16"/><line x1="8" y1="12" x2="16" y2="12"/>' color="#3b82f6" />, color: '#3b82f6', bgColor: '#dbeafe', label: 'Created' },
  UPDATED: { icon: <SvgIcon d='<path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/>' color="#f59e0b" />, color: '#f59e0b', bgColor: '#fef3c7', label: 'Updated' },
  STATUS_CHANGED: { icon: <SvgIcon d='<polyline points="23 4 23 10 17 10"/><polyline points="1 20 1 14 7 14"/><path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15"/>' color="#6366f1" />, color: '#6366f1', bgColor: '#e0e7ff', label: 'Status Changed' },
  SENT: { icon: <SvgIcon d='<line x1="22" y1="2" x2="11" y2="13"/><polygon points="22 2 15 22 11 13 2 9 22 2"/>' color="#10b981" />, color: '#10b981', bgColor: '#d1fae5', label: 'Sent' },
  WON: { icon: <SvgIcon d='<path d="M6 9H4.5a2.5 2.5 0 0 1 0-5C7 4 9 7 12 7s5-3 7.5-3a2.5 2.5 0 0 1 0 5H18"/><path d="M18 9v11a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2V9"/>' color="#22c55e" />, color: '#22c55e', bgColor: '#dcfce7', label: 'Won' },
  LOST: { icon: <SvgIcon d='<circle cx="12" cy="12" r="10"/><line x1="15" y1="9" x2="9" y2="15"/><line x1="9" y1="9" x2="15" y2="15"/>' color="#ef4444" />, color: '#ef4444', bgColor: '#fee2e2', label: 'Lost' },
  EMAIL_SENT: { icon: <SvgIcon d='<line x1="22" y1="2" x2="11" y2="13"/><polygon points="22 2 15 22 11 13 2 9 22 2"/>' color="#10b981" />, color: '#10b981', bgColor: '#d1fae5', label: 'Email Sent' },
  CUSTOMER_VIEWED: { icon: <SvgIcon d='<path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/>' color="#8b5cf6" />, color: '#8b5cf6', bgColor: '#ede9fe', label: 'Viewed' },
  FOLLOW_UP_SCHEDULED: { icon: <SvgIcon d='<rect x="3" y="4" width="18" height="18" rx="2" ry="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/>' color="#f97316" />, color: '#f97316', bgColor: '#ffedd5', label: 'Follow-up' },
  CUSTOMER_CONTACTED: { icon: <SvgIcon d='<path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z"/>' color="#06b6d4" />, color: '#06b6d4', bgColor: '#cffafe', label: 'Contacted' },
  PRICE_ADJUSTED: { icon: <SvgIcon d='<line x1="12" y1="1" x2="12" y2="23"/><path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"/>' color="#eab308" />, color: '#eab308', bgColor: '#fef9c3', label: 'Price Adjusted' },
  APPROVAL_REQUESTED: { icon: <SvgIcon d='<circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/>' color="#f59e0b" />, color: '#f59e0b', bgColor: '#fef3c7', label: 'Approval Requested' },
  APPROVED: { icon: <SvgIcon d='<path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/>' color="#22c55e" />, color: '#22c55e', bgColor: '#dcfce7', label: 'Approved' },
  REJECTED: { icon: <SvgIcon d='<circle cx="12" cy="12" r="10"/><line x1="15" y1="9" x2="9" y2="15"/><line x1="9" y1="9" x2="15" y2="15"/>' color="#ef4444" />, color: '#ef4444', bgColor: '#fee2e2', label: 'Rejected' },
  NOTE_ADDED: { icon: <SvgIcon d='<path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/>' color="#6b7280" />, color: '#6b7280', bgColor: '#f3f4f6', label: 'Note' },
  INTERNAL_NOTE: { icon: <SvgIcon d='<rect x="3" y="11" width="18" height="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/>' color="#374151" />, color: '#374151', bgColor: '#e5e7eb', label: 'Internal Note' },
  PDF_GENERATED: { icon: <SvgIcon d='<path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/>' color="#3b82f6" />, color: '#3b82f6', bgColor: '#dbeafe', label: 'PDF Generated' },
  PDF_DOWNLOADED: { icon: <SvgIcon d='<path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/>' color="#3b82f6" />, color: '#3b82f6', bgColor: '#dbeafe', label: 'PDF Downloaded' },
  // Signature events
  SIGNATURE_ADDED: { icon: <SvgIcon d='<path d="M20 12v6a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h6"/><polyline points="22 4 12 14.01 9 11.01"/>' color="#10b981" />, color: '#10b981', bgColor: '#d1fae5', label: 'Signed' },
  CUSTOMER_SIGNED: { icon: <SvgIcon d='<path d="M20 12v6a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h6"/><polyline points="22 4 12 14.01 9 11.01"/>' color="#22c55e" />, color: '#22c55e', bgColor: '#dcfce7', label: 'Customer Signed' },
  STAFF_SIGNED: { icon: <SvgIcon d='<path d="M20 12v6a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h6"/><polyline points="22 4 12 14.01 9 11.01"/>' color="#3b82f6" />, color: '#3b82f6', bgColor: '#dbeafe', label: 'Staff Signed' },
  SIGNATURE_REMOVED: { icon: <SvgIcon d='<circle cx="12" cy="12" r="10"/><line x1="15" y1="9" x2="9" y2="15"/><line x1="9" y1="9" x2="15" y2="15"/>' color="#ef4444" />, color: '#ef4444', bgColor: '#fee2e2', label: 'Signature Removed' }
};

// Category filters
const CATEGORIES = [
  { id: 'all', label: 'All Activities' },
  { id: 'lifecycle', label: 'Lifecycle' },
  { id: 'status', label: 'Status' },
  { id: 'communication', label: 'Communication' },
  { id: 'editing', label: 'Edits' },
  { id: 'approval', label: 'Approvals' },
  { id: 'signatures', label: 'Signatures' },
  { id: 'notes', label: 'Notes' }
];

// Contact methods
const CONTACT_METHODS = [
  { id: 'phone', label: 'Phone Call', icon: <SvgIcon d='<path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z"/>' color="#6b7280" /> },
  { id: 'email', label: 'Email', icon: <SvgIcon d='<path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z"/><polyline points="22,6 12,13 2,6"/>' color="#6b7280" /> },
  { id: 'in-person', label: 'In Person', icon: <SvgIcon d='<path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/>' color="#6b7280" /> },
  { id: 'video-call', label: 'Video Call', icon: <SvgIcon d='<polygon points="23 7 16 12 23 17 23 7"/><rect x="1" y="5" width="15" height="14" rx="2" ry="2"/>' color="#6b7280" /> },
  { id: 'text', label: 'Text/SMS', icon: <SvgIcon d='<path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>' color="#6b7280" /> }
];

const ActivityTimeline = ({
  quoteId,
  activities = [],
  onRefresh,
  userName = 'User',
  compact = false
}) => {
  const [filter, setFilter] = useState('all');
  const [showAddNote, setShowAddNote] = useState(false);
  const [showContactLog, setShowContactLog] = useState(false);
  const [showFollowUp, setShowFollowUp] = useState(false);
  const [noteText, setNoteText] = useState('');
  const [isInternal, setIsInternal] = useState(true);
  const [contactMethod, setContactMethod] = useState('phone');
  const [contactNotes, setContactNotes] = useState('');
  const [followUpDate, setFollowUpDate] = useState('');
  const [followUpDescription, setFollowUpDescription] = useState('');
  const [saving, setSaving] = useState(false);

  // Filter activities
  const filteredActivities = activities.filter(activity => {
    if (filter === 'all') return true;
    return activity.activity_category === filter;
  });

  // Format relative time
  const formatRelativeTime = (date) => {
    const now = new Date();
    const activityDate = new Date(date);
    const diffMs = now - activityDate;
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMs / 3600000);
    const diffDays = Math.floor(diffMs / 86400000);

    if (diffMins < 1) return 'Just now';
    if (diffMins < 60) return `${diffMins}m ago`;
    if (diffHours < 24) return `${diffHours}h ago`;
    if (diffDays < 7) return `${diffDays}d ago`;

    return activityDate.toLocaleDateString('en-CA', {
      month: 'short',
      day: 'numeric',
      year: activityDate.getFullYear() !== now.getFullYear() ? 'numeric' : undefined
    });
  };

  // Add note
  const handleAddNote = useCallback(async () => {
    if (!noteText.trim()) return;

    setSaving(true);
    try {
      const response = await authFetch(`${API_URL}/api/activities/quote/${quoteId}/note`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          note: noteText.trim(),
          isInternal,
          userName
        })
      });

      if (!response.ok) throw new Error('Failed to add note');

      setNoteText('');
      setShowAddNote(false);
      if (onRefresh) onRefresh();
    } catch (error) {
      console.error('Error adding note:', error);
      alert('Failed to add note');
    } finally {
      setSaving(false);
    }
  }, [quoteId, noteText, isInternal, userName, onRefresh]);

  // Log customer contact
  const handleLogContact = useCallback(async () => {
    setSaving(true);
    try {
      const response = await authFetch(`${API_URL}/api/activities/quote/${quoteId}/contact`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contactMethod,
          notes: contactNotes.trim(),
          userName
        })
      });

      if (!response.ok) throw new Error('Failed to log contact');

      setContactNotes('');
      setShowContactLog(false);
      if (onRefresh) onRefresh();
    } catch (error) {
      console.error('Error logging contact:', error);
      alert('Failed to log contact');
    } finally {
      setSaving(false);
    }
  }, [quoteId, contactMethod, contactNotes, userName, onRefresh]);

  // Schedule follow-up
  const handleScheduleFollowUp = useCallback(async () => {
    if (!followUpDate) return;

    setSaving(true);
    try {
      const response = await authFetch(`${API_URL}/api/activities/quote/${quoteId}/follow-up`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          followUpDate,
          description: followUpDescription.trim() || 'Follow-up scheduled',
          userName
        })
      });

      if (!response.ok) throw new Error('Failed to schedule follow-up');

      setFollowUpDate('');
      setFollowUpDescription('');
      setShowFollowUp(false);
      if (onRefresh) onRefresh();
    } catch (error) {
      console.error('Error scheduling follow-up:', error);
      alert('Failed to schedule follow-up');
    } finally {
      setSaving(false);
    }
  }, [quoteId, followUpDate, followUpDescription, userName, onRefresh]);

  // Get config for activity type
  const getActivityConfig = (type) => {
    return ACTIVITY_CONFIG[type] || {
      icon: <SvgIcon d='<circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/>' color="#6b7280" />,
      color: '#6b7280',
      bgColor: '#f3f4f6',
      label: type
    };
  };

  return (
    <div style={{
      background: 'white',
      borderRadius: '12px',
      boxShadow: '0 1px 3px rgba(0,0,0,0.1)',
      overflow: 'hidden'
    }}>
      {/* Header */}
      <div style={{
        padding: '16px 20px',
        borderBottom: '1px solid #e5e7eb',
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        flexWrap: 'wrap',
        gap: '12px'
      }}>
        <h3 style={{ margin: 0, fontSize: '18px', fontWeight: 'bold', color: '#1f2937' }}>
          Activity Timeline
        </h3>

        <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
          <button
            onClick={() => setShowAddNote(true)}
            style={{
              padding: '8px 16px',
              background: '#3b82f6',
              color: 'white',
              border: 'none',
              borderRadius: '6px',
              fontSize: '13px',
              fontWeight: '600',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: '6px'
            }}
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="12" y1="18" x2="12" y2="12"/><line x1="9" y1="15" x2="15" y2="15"/></svg> Add Note
          </button>

          <button
            onClick={() => setShowContactLog(true)}
            style={{
              padding: '8px 16px',
              background: '#06b6d4',
              color: 'white',
              border: 'none',
              borderRadius: '6px',
              fontSize: '13px',
              fontWeight: '600',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: '6px'
            }}
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z"/></svg> Log Contact
          </button>

          <button
            onClick={() => setShowFollowUp(true)}
            style={{
              padding: '8px 16px',
              background: '#f97316',
              color: 'white',
              border: 'none',
              borderRadius: '6px',
              fontSize: '13px',
              fontWeight: '600',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: '6px'
            }}
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="4" width="18" height="18" rx="2" ry="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg> Follow-up
          </button>
        </div>
      </div>

      {/* Category Filter */}
      {!compact && (
        <div style={{
          padding: '12px 20px',
          borderBottom: '1px solid #e5e7eb',
          display: 'flex',
          gap: '8px',
          overflowX: 'auto'
        }}>
          {CATEGORIES.map(cat => (
            <button
              key={cat.id}
              onClick={() => setFilter(cat.id)}
              style={{
                padding: '6px 14px',
                background: filter === cat.id ? '#3b82f6' : '#f3f4f6',
                color: filter === cat.id ? 'white' : '#374151',
                border: 'none',
                borderRadius: '20px',
                fontSize: '12px',
                fontWeight: '500',
                cursor: 'pointer',
                whiteSpace: 'nowrap'
              }}
            >
              {cat.label}
            </button>
          ))}
        </div>
      )}

      {/* Activity List */}
      <div style={{
        maxHeight: compact ? '300px' : '500px',
        overflowY: 'auto',
        padding: '16px 20px'
      }}>
        {filteredActivities.length === 0 ? (
          <div style={{
            padding: '40px 20px',
            textAlign: 'center',
            color: '#6b7280'
          }}>
            <div style={{ marginBottom: '12px', display: 'flex', justifyContent: 'center' }}><svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="#d1d5db" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/></svg></div>
            <p style={{ margin: 0 }}>No activities recorded yet.</p>
            <p style={{ margin: '8px 0 0', fontSize: '14px' }}>Add notes to start tracking interactions!</p>
          </div>
        ) : (
          <div style={{ position: 'relative' }}>
            {/* Timeline line */}
            <div style={{
              position: 'absolute',
              left: '15px',
              top: '20px',
              bottom: '20px',
              width: '2px',
              background: '#e5e7eb'
            }} />

            {/* Activity items */}
            {filteredActivities.map((activity, index) => {
              const config = getActivityConfig(activity.event_type);

              return (
                <div
                  key={activity.id}
                  style={{
                    display: 'flex',
                    gap: '16px',
                    marginBottom: index < filteredActivities.length - 1 ? '20px' : 0,
                    position: 'relative'
                  }}
                >
                  {/* Icon */}
                  <div style={{
                    width: '32px',
                    height: '32px',
                    borderRadius: '50%',
                    background: config.bgColor,
                    border: `2px solid ${config.color}`,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    fontSize: '14px',
                    flexShrink: 0,
                    zIndex: 1
                  }}>
                    {activity.icon || config.icon}
                  </div>

                  {/* Content */}
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{
                      display: 'flex',
                      justifyContent: 'space-between',
                      alignItems: 'flex-start',
                      gap: '8px',
                      marginBottom: '4px'
                    }}>
                      <span style={{
                        display: 'inline-block',
                        padding: '2px 8px',
                        background: config.bgColor,
                        color: config.color,
                        borderRadius: '4px',
                        fontSize: '11px',
                        fontWeight: '600',
                        textTransform: 'uppercase'
                      }}>
                        {config.label}
                      </span>

                      <span style={{
                        fontSize: '12px',
                        color: '#9ca3af',
                        whiteSpace: 'nowrap'
                      }}>
                        {formatRelativeTime(activity.created_at)}
                      </span>
                    </div>

                    <p style={{
                      margin: '4px 0 0',
                      fontSize: '14px',
                      color: '#374151',
                      lineHeight: '1.5',
                      wordBreak: 'break-word'
                    }}>
                      {activity.description}
                    </p>

                    {activity.user_name && activity.user_name !== 'System' && (
                      <p style={{
                        margin: '4px 0 0',
                        fontSize: '12px',
                        color: '#9ca3af'
                      }}>
                        by {activity.user_name}
                      </p>
                    )}

                    {activity.is_internal && (
                      <span style={{
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: '4px',
                        marginTop: '6px',
                        padding: '2px 6px',
                        background: '#fef3c7',
                        color: '#92400e',
                        borderRadius: '4px',
                        fontSize: '10px',
                        fontWeight: '500'
                      }}>
                        <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="11" width="18" height="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg> Internal
                      </span>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Add Note Modal */}
      {showAddNote && (
        <div style={{
          position: 'fixed',
          inset: 0,
          background: 'rgba(0,0,0,0.5)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 1000,
          padding: '20px'
        }}>
          <div style={{
            background: 'white',
            borderRadius: '12px',
            padding: '24px',
            width: '100%',
            maxWidth: '500px'
          }}>
            <h4 style={{ margin: '0 0 16px', fontSize: '18px' }}>Add Note</h4>

            <textarea
              value={noteText}
              onChange={(e) => setNoteText(e.target.value)}
              placeholder="Enter your note..."
              rows={4}
              style={{
                width: '100%',
                padding: '12px',
                border: '1px solid #d1d5db',
                borderRadius: '8px',
                fontSize: '14px',
                resize: 'vertical',
                boxSizing: 'border-box'
              }}
              autoFocus
            />

            <label style={{
              display: 'flex',
              alignItems: 'center',
              gap: '8px',
              marginTop: '12px',
              fontSize: '14px',
              cursor: 'pointer'
            }}>
              <input
                type="checkbox"
                checked={isInternal}
                onChange={(e) => setIsInternal(e.target.checked)}
                style={{ width: '18px', height: '18px' }}
              />
              <span>Internal note (not visible to customer)</span>
            </label>

            <div style={{ display: 'flex', gap: '12px', marginTop: '20px', justifyContent: 'flex-end' }}>
              <button
                onClick={() => setShowAddNote(false)}
                style={{
                  padding: '10px 20px',
                  background: '#f3f4f6',
                  color: '#374151',
                  border: 'none',
                  borderRadius: '8px',
                  cursor: 'pointer'
                }}
              >
                Cancel
              </button>
              <button
                onClick={handleAddNote}
                disabled={saving || !noteText.trim()}
                style={{
                  padding: '10px 20px',
                  background: saving || !noteText.trim() ? '#9ca3af' : '#3b82f6',
                  color: 'white',
                  border: 'none',
                  borderRadius: '8px',
                  cursor: saving || !noteText.trim() ? 'not-allowed' : 'pointer'
                }}
              >
                {saving ? 'Saving...' : 'Add Note'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Log Contact Modal */}
      {showContactLog && (
        <div style={{
          position: 'fixed',
          inset: 0,
          background: 'rgba(0,0,0,0.5)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 1000,
          padding: '20px'
        }}>
          <div style={{
            background: 'white',
            borderRadius: '12px',
            padding: '24px',
            width: '100%',
            maxWidth: '500px'
          }}>
            <h4 style={{ margin: '0 0 16px', fontSize: '18px' }}>Log Customer Contact</h4>

            <div style={{ marginBottom: '16px' }}>
              <label style={{ display: 'block', marginBottom: '8px', fontWeight: '600', fontSize: '14px' }}>
                Contact Method
              </label>
              <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                {CONTACT_METHODS.map(method => (
                  <button
                    key={method.id}
                    onClick={() => setContactMethod(method.id)}
                    style={{
                      padding: '8px 14px',
                      background: contactMethod === method.id ? '#3b82f6' : '#f3f4f6',
                      color: contactMethod === method.id ? 'white' : '#374151',
                      border: 'none',
                      borderRadius: '8px',
                      cursor: 'pointer',
                      fontSize: '13px',
                      display: 'flex',
                      alignItems: 'center',
                      gap: '6px'
                    }}
                  >
                    <span>{method.icon}</span>
                    {method.label}
                  </button>
                ))}
              </div>
            </div>

            <div>
              <label style={{ display: 'block', marginBottom: '8px', fontWeight: '600', fontSize: '14px' }}>
                Notes (optional)
              </label>
              <textarea
                value={contactNotes}
                onChange={(e) => setContactNotes(e.target.value)}
                placeholder="Summary of the conversation..."
                rows={3}
                style={{
                  width: '100%',
                  padding: '12px',
                  border: '1px solid #d1d5db',
                  borderRadius: '8px',
                  fontSize: '14px',
                  resize: 'vertical',
                  boxSizing: 'border-box'
                }}
              />
            </div>

            <div style={{ display: 'flex', gap: '12px', marginTop: '20px', justifyContent: 'flex-end' }}>
              <button
                onClick={() => setShowContactLog(false)}
                style={{
                  padding: '10px 20px',
                  background: '#f3f4f6',
                  color: '#374151',
                  border: 'none',
                  borderRadius: '8px',
                  cursor: 'pointer'
                }}
              >
                Cancel
              </button>
              <button
                onClick={handleLogContact}
                disabled={saving}
                style={{
                  padding: '10px 20px',
                  background: saving ? '#9ca3af' : '#06b6d4',
                  color: 'white',
                  border: 'none',
                  borderRadius: '8px',
                  cursor: saving ? 'not-allowed' : 'pointer'
                }}
              >
                {saving ? 'Saving...' : 'Log Contact'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Schedule Follow-up Modal */}
      {showFollowUp && (
        <div style={{
          position: 'fixed',
          inset: 0,
          background: 'rgba(0,0,0,0.5)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 1000,
          padding: '20px'
        }}>
          <div style={{
            background: 'white',
            borderRadius: '12px',
            padding: '24px',
            width: '100%',
            maxWidth: '500px'
          }}>
            <h4 style={{ margin: '0 0 16px', fontSize: '18px' }}>Schedule Follow-up</h4>

            <div style={{ marginBottom: '16px' }}>
              <label style={{ display: 'block', marginBottom: '8px', fontWeight: '600', fontSize: '14px' }}>
                Follow-up Date *
              </label>
              <input
                type="date"
                value={followUpDate}
                onChange={(e) => setFollowUpDate(e.target.value)}
                min={new Date().toISOString().split('T')[0]}
                style={{
                  width: '100%',
                  padding: '12px',
                  border: '1px solid #d1d5db',
                  borderRadius: '8px',
                  fontSize: '14px',
                  boxSizing: 'border-box'
                }}
              />
            </div>

            <div>
              <label style={{ display: 'block', marginBottom: '8px', fontWeight: '600', fontSize: '14px' }}>
                Description (optional)
              </label>
              <textarea
                value={followUpDescription}
                onChange={(e) => setFollowUpDescription(e.target.value)}
                placeholder="What to discuss on follow-up..."
                rows={3}
                style={{
                  width: '100%',
                  padding: '12px',
                  border: '1px solid #d1d5db',
                  borderRadius: '8px',
                  fontSize: '14px',
                  resize: 'vertical',
                  boxSizing: 'border-box'
                }}
              />
            </div>

            <div style={{ display: 'flex', gap: '12px', marginTop: '20px', justifyContent: 'flex-end' }}>
              <button
                onClick={() => setShowFollowUp(false)}
                style={{
                  padding: '10px 20px',
                  background: '#f3f4f6',
                  color: '#374151',
                  border: 'none',
                  borderRadius: '8px',
                  cursor: 'pointer'
                }}
              >
                Cancel
              </button>
              <button
                onClick={handleScheduleFollowUp}
                disabled={saving || !followUpDate}
                style={{
                  padding: '10px 20px',
                  background: saving || !followUpDate ? '#9ca3af' : '#f97316',
                  color: 'white',
                  border: 'none',
                  borderRadius: '8px',
                  cursor: saving || !followUpDate ? 'not-allowed' : 'pointer'
                }}
              >
                {saving ? 'Saving...' : 'Schedule'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default ActivityTimeline;
