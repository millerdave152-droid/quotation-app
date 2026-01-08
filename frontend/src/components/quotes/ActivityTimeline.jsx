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

const API_URL = process.env.REACT_APP_API_URL || 'http://localhost:3001';

// Activity type configurations
const ACTIVITY_CONFIG = {
  CREATED: { icon: '✨', color: '#3b82f6', bgColor: '#dbeafe', label: 'Created' },
  UPDATED: { icon: '✏️', color: '#f59e0b', bgColor: '#fef3c7', label: 'Updated' },
  STATUS_CHANGED: { icon: '🔄', color: '#6366f1', bgColor: '#e0e7ff', label: 'Status Changed' },
  SENT: { icon: '📤', color: '#10b981', bgColor: '#d1fae5', label: 'Sent' },
  WON: { icon: '🏆', color: '#22c55e', bgColor: '#dcfce7', label: 'Won' },
  LOST: { icon: '❌', color: '#ef4444', bgColor: '#fee2e2', label: 'Lost' },
  EMAIL_SENT: { icon: '📧', color: '#10b981', bgColor: '#d1fae5', label: 'Email Sent' },
  CUSTOMER_VIEWED: { icon: '👀', color: '#8b5cf6', bgColor: '#ede9fe', label: 'Viewed' },
  FOLLOW_UP_SCHEDULED: { icon: '📅', color: '#f97316', bgColor: '#ffedd5', label: 'Follow-up' },
  CUSTOMER_CONTACTED: { icon: '📞', color: '#06b6d4', bgColor: '#cffafe', label: 'Contacted' },
  PRICE_ADJUSTED: { icon: '💰', color: '#eab308', bgColor: '#fef9c3', label: 'Price Adjusted' },
  APPROVAL_REQUESTED: { icon: '⏳', color: '#f59e0b', bgColor: '#fef3c7', label: 'Approval Requested' },
  APPROVED: { icon: '✅', color: '#22c55e', bgColor: '#dcfce7', label: 'Approved' },
  REJECTED: { icon: '❌', color: '#ef4444', bgColor: '#fee2e2', label: 'Rejected' },
  NOTE_ADDED: { icon: '📝', color: '#6b7280', bgColor: '#f3f4f6', label: 'Note' },
  INTERNAL_NOTE: { icon: '🔒', color: '#374151', bgColor: '#e5e7eb', label: 'Internal Note' },
  PDF_GENERATED: { icon: '📄', color: '#3b82f6', bgColor: '#dbeafe', label: 'PDF Generated' },
  PDF_DOWNLOADED: { icon: '⬇️', color: '#3b82f6', bgColor: '#dbeafe', label: 'PDF Downloaded' },
  // Signature events
  SIGNATURE_ADDED: { icon: '✍️', color: '#10b981', bgColor: '#d1fae5', label: 'Signed' },
  CUSTOMER_SIGNED: { icon: '✍️', color: '#22c55e', bgColor: '#dcfce7', label: 'Customer Signed' },
  STAFF_SIGNED: { icon: '✍️', color: '#3b82f6', bgColor: '#dbeafe', label: 'Staff Signed' },
  SIGNATURE_REMOVED: { icon: '❌', color: '#ef4444', bgColor: '#fee2e2', label: 'Signature Removed' }
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
  { id: 'phone', label: 'Phone Call', icon: '📞' },
  { id: 'email', label: 'Email', icon: '📧' },
  { id: 'in-person', label: 'In Person', icon: '🤝' },
  { id: 'video-call', label: 'Video Call', icon: '🎥' },
  { id: 'text', label: 'Text/SMS', icon: '💬' }
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
      const response = await fetch(`${API_URL}/api/activities/quote/${quoteId}/note`, {
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
      const response = await fetch(`${API_URL}/api/activities/quote/${quoteId}/contact`, {
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
      const response = await fetch(`${API_URL}/api/activities/quote/${quoteId}/follow-up`, {
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
      icon: '📌',
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
            <span>📝</span> Add Note
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
            <span>📞</span> Log Contact
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
            <span>📅</span> Follow-up
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
            <div style={{ fontSize: '48px', marginBottom: '12px' }}>📋</div>
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
                        🔒 Internal
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
