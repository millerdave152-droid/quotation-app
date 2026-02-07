import { authFetch } from '../../services/authFetch';
/**
 * CustomerActivityTimeline - CRM-style activity timeline for customers
 * Displays calls, emails, meetings, notes, and system events
 */

import React, { useState, useEffect, useCallback } from 'react';

const API_URL = process.env.REACT_APP_API_URL || 'http://localhost:3001';

// Activity type configurations
const ACTIVITY_TYPES = {
  call: { icon: '📞', color: '#3b82f6', bgColor: '#dbeafe', label: 'Phone Call' },
  email: { icon: '📧', color: '#10b981', bgColor: '#d1fae5', label: 'Email' },
  meeting: { icon: '🤝', color: '#8b5cf6', bgColor: '#ede9fe', label: 'Meeting' },
  note: { icon: '📝', color: '#6b7280', bgColor: '#f3f4f6', label: 'Note' },
  quote_created: { icon: '📋', color: '#f59e0b', bgColor: '#fef3c7', label: 'Quote Created' },
  quote_won: { icon: '🏆', color: '#22c55e', bgColor: '#dcfce7', label: 'Quote Won' },
  quote_lost: { icon: '❌', color: '#ef4444', bgColor: '#fee2e2', label: 'Quote Lost' },
  order_placed: { icon: '🛒', color: '#6366f1', bgColor: '#e0e7ff', label: 'Order Placed' },
  payment_received: { icon: '💰', color: '#22c55e', bgColor: '#dcfce7', label: 'Payment' },
  follow_up: { icon: '📅', color: '#f97316', bgColor: '#ffedd5', label: 'Follow-up' },
  status_change: { icon: '🔄', color: '#6366f1', bgColor: '#e0e7ff', label: 'Status Change' },
  created: { icon: '✨', color: '#3b82f6', bgColor: '#dbeafe', label: 'Created' }
};

/**
 * Format relative time
 */
const formatRelativeTime = (date) => {
  const now = new Date();
  const d = new Date(date);
  const diffMs = now - d;
  const diffMins = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMs / 3600000);
  const diffDays = Math.floor(diffMs / 86400000);

  if (diffMins < 1) return 'Just now';
  if (diffMins < 60) return `${diffMins}m ago`;
  if (diffHours < 24) return `${diffHours}h ago`;
  if (diffDays < 7) return `${diffDays}d ago`;
  return d.toLocaleDateString('en-CA', { month: 'short', day: 'numeric', year: 'numeric' });
};

/**
 * Activity Item Component
 */
const ActivityItem = ({ activity, onEdit, onDelete }) => {
  const config = ACTIVITY_TYPES[activity.activity_type] || {
    icon: '📌',
    color: '#6b7280',
    bgColor: '#f3f4f6',
    label: activity.activity_type
  };

  return (
    <div style={{
      display: 'flex',
      gap: '16px',
      padding: '16px 0',
      borderBottom: '1px solid #f3f4f6'
    }}>
      {/* Icon */}
      <div style={{
        width: '40px',
        height: '40px',
        borderRadius: '50%',
        background: config.bgColor,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        fontSize: '18px',
        flexShrink: 0
      }}>
        {config.icon}
      </div>

      {/* Content */}
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
          <div>
            <span style={{
              fontSize: '14px',
              fontWeight: '600',
              color: '#1f2937'
            }}>
              {activity.title}
            </span>
            <span style={{
              fontSize: '12px',
              color: config.color,
              marginLeft: '8px',
              padding: '2px 6px',
              background: config.bgColor,
              borderRadius: '4px'
            }}>
              {config.label}
            </span>
          </div>
          <span style={{ fontSize: '12px', color: '#9ca3af', whiteSpace: 'nowrap' }}>
            {formatRelativeTime(activity.created_at)}
          </span>
        </div>

        {activity.description && (
          <p style={{
            margin: '8px 0 0',
            fontSize: '13px',
            color: '#4b5563',
            lineHeight: '1.5'
          }}>
            {activity.description}
          </p>
        )}

        {activity.performed_by_name && (
          <div style={{ marginTop: '8px', fontSize: '12px', color: '#9ca3af' }}>
            by {activity.performed_by_name}
          </div>
        )}

        {/* Metadata display for specific types */}
        {activity.metadata && activity.activity_type === 'call' && activity.metadata.duration_minutes && (
          <div style={{
            marginTop: '8px',
            fontSize: '12px',
            color: '#6b7280',
            display: 'flex',
            gap: '12px'
          }}>
            <span>Duration: {activity.metadata.duration_minutes} min</span>
            {activity.metadata.outcome && <span>Outcome: {activity.metadata.outcome}</span>}
          </div>
        )}
      </div>
    </div>
  );
};

/**
 * Add Activity Form
 */
const AddActivityForm = ({ customerId, onActivityAdded, onClose }) => {
  const [activityType, setActivityType] = useState('note');
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [metadata, setMetadata] = useState({});
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError(null);

    try {
      const endpoint = activityType === 'note'
        ? `/api/customers/${customerId}/activities/note`
        : activityType === 'call'
        ? `/api/customers/${customerId}/activities/call`
        : activityType === 'email'
        ? `/api/customers/${customerId}/activities/email`
        : activityType === 'meeting'
        ? `/api/customers/${customerId}/activities/meeting`
        : `/api/customers/${customerId}/activities`;

      const body = activityType === 'note'
        ? { title, content: description }
        : activityType === 'call'
        ? { duration_minutes: metadata.duration, outcome: metadata.outcome, notes: description }
        : activityType === 'email'
        ? { subject: title, direction: metadata.direction || 'outbound', notes: description }
        : activityType === 'meeting'
        ? { meeting_type: metadata.type, attendees: metadata.attendees, notes: description, outcome: metadata.outcome }
        : { activity_type: activityType, title, description, metadata };

      const res = await authFetch(`${API_URL}${endpoint}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body)
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error?.message || 'Failed to add activity');
      }

      onActivityAdded();
      onClose();
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={{
      background: '#f9fafb',
      padding: '16px',
      borderRadius: '8px',
      marginBottom: '16px'
    }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
        <h4 style={{ margin: 0, fontSize: '14px', fontWeight: '600' }}>Add Activity</h4>
        <button
          onClick={onClose}
          style={{
            background: 'none',
            border: 'none',
            cursor: 'pointer',
            fontSize: '18px',
            color: '#9ca3af'
          }}
        >
          ✕
        </button>
      </div>

      <form onSubmit={handleSubmit}>
        <div style={{ marginBottom: '12px' }}>
          <label style={{ display: 'block', fontSize: '12px', fontWeight: '500', marginBottom: '4px' }}>
            Activity Type
          </label>
          <select
            value={activityType}
            onChange={(e) => setActivityType(e.target.value)}
            style={{
              width: '100%',
              padding: '8px',
              border: '1px solid #d1d5db',
              borderRadius: '6px',
              fontSize: '14px'
            }}
          >
            <option value="note">Note</option>
            <option value="call">Phone Call</option>
            <option value="email">Email</option>
            <option value="meeting">Meeting</option>
            <option value="follow_up">Follow-up</option>
          </select>
        </div>

        <div style={{ marginBottom: '12px' }}>
          <label style={{ display: 'block', fontSize: '12px', fontWeight: '500', marginBottom: '4px' }}>
            {activityType === 'email' ? 'Subject' : 'Title'}
          </label>
          <input
            type="text"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder={activityType === 'email' ? 'Email subject...' : 'Activity title...'}
            style={{
              width: '100%',
              padding: '8px',
              border: '1px solid #d1d5db',
              borderRadius: '6px',
              fontSize: '14px'
            }}
          />
        </div>

        {activityType === 'call' && (
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px', marginBottom: '12px' }}>
            <div>
              <label style={{ display: 'block', fontSize: '12px', fontWeight: '500', marginBottom: '4px' }}>
                Duration (min)
              </label>
              <input
                type="number"
                value={metadata.duration || ''}
                onChange={(e) => setMetadata({ ...metadata, duration: e.target.value })}
                placeholder="5"
                style={{
                  width: '100%',
                  padding: '8px',
                  border: '1px solid #d1d5db',
                  borderRadius: '6px',
                  fontSize: '14px'
                }}
              />
            </div>
            <div>
              <label style={{ display: 'block', fontSize: '12px', fontWeight: '500', marginBottom: '4px' }}>
                Outcome
              </label>
              <select
                value={metadata.outcome || ''}
                onChange={(e) => setMetadata({ ...metadata, outcome: e.target.value })}
                style={{
                  width: '100%',
                  padding: '8px',
                  border: '1px solid #d1d5db',
                  borderRadius: '6px',
                  fontSize: '14px'
                }}
              >
                <option value="">Select outcome...</option>
                <option value="connected">Connected</option>
                <option value="voicemail">Voicemail</option>
                <option value="no_answer">No Answer</option>
                <option value="wrong_number">Wrong Number</option>
              </select>
            </div>
          </div>
        )}

        <div style={{ marginBottom: '12px' }}>
          <label style={{ display: 'block', fontSize: '12px', fontWeight: '500', marginBottom: '4px' }}>
            {activityType === 'note' ? 'Content' : 'Notes'}
          </label>
          <textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="Add details..."
            rows={3}
            style={{
              width: '100%',
              padding: '8px',
              border: '1px solid #d1d5db',
              borderRadius: '6px',
              fontSize: '14px',
              resize: 'vertical'
            }}
          />
        </div>

        {error && (
          <div style={{
            padding: '8px 12px',
            background: '#fee2e2',
            color: '#991b1b',
            borderRadius: '6px',
            fontSize: '13px',
            marginBottom: '12px'
          }}>
            {error}
          </div>
        )}

        <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end' }}>
          <button
            type="button"
            onClick={onClose}
            style={{
              padding: '8px 16px',
              background: '#f3f4f6',
              color: '#374151',
              border: 'none',
              borderRadius: '6px',
              fontSize: '13px',
              cursor: 'pointer'
            }}
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={loading}
            style={{
              padding: '8px 16px',
              background: '#3b82f6',
              color: 'white',
              border: 'none',
              borderRadius: '6px',
              fontSize: '13px',
              cursor: loading ? 'wait' : 'pointer'
            }}
          >
            {loading ? 'Saving...' : 'Add Activity'}
          </button>
        </div>
      </form>
    </div>
  );
};

/**
 * Main CustomerActivityTimeline Component
 */
function CustomerActivityTimeline({ customerId, limit = 25 }) {
  const [activities, setActivities] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [showAddForm, setShowAddForm] = useState(false);
  const [filter, setFilter] = useState('all');
  const [hasMore, setHasMore] = useState(false);
  const [total, setTotal] = useState(0);

  const fetchActivities = useCallback(async () => {
    try {
      setLoading(true);
      const typeParam = filter !== 'all' ? `&type=${filter}` : '';
      const res = await authFetch(`${API_URL}/api/customers/${customerId}/activities?limit=${limit}${typeParam}`);

      if (!res.ok) throw new Error('Failed to fetch activities');

      const data = await res.json();
      setActivities(data.data?.activities || []);
      setTotal(data.data?.total || 0);
      setHasMore(data.data?.activities?.length < (data.data?.total || 0));
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [customerId, limit, filter]);

  useEffect(() => {
    if (customerId) {
      fetchActivities();
    }
  }, [customerId, fetchActivities]);

  if (loading && activities.length === 0) {
    return (
      <div style={{
        background: 'white',
        borderRadius: '12px',
        padding: '24px',
        boxShadow: '0 1px 3px rgba(0,0,0,0.1)'
      }}>
        <div style={{ textAlign: 'center', color: '#6b7280' }}>
          Loading activities...
        </div>
      </div>
    );
  }

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
        alignItems: 'center'
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          <h3 style={{ margin: 0, fontSize: '16px', fontWeight: '600', color: '#1f2937' }}>
            Activity Timeline
          </h3>
          <span style={{
            padding: '2px 8px',
            background: '#f3f4f6',
            borderRadius: '12px',
            fontSize: '12px',
            color: '#6b7280'
          }}>
            {total}
          </span>
        </div>

        <div style={{ display: 'flex', gap: '8px' }}>
          <select
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
            style={{
              padding: '6px 10px',
              border: '1px solid #e5e7eb',
              borderRadius: '6px',
              fontSize: '13px',
              color: '#374151',
              background: 'white'
            }}
          >
            <option value="all">All Activities</option>
            <option value="call">Calls</option>
            <option value="email">Emails</option>
            <option value="meeting">Meetings</option>
            <option value="note">Notes</option>
          </select>
          <button
            onClick={() => setShowAddForm(true)}
            style={{
              padding: '6px 12px',
              background: '#3b82f6',
              color: 'white',
              border: 'none',
              borderRadius: '6px',
              fontSize: '13px',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: '4px'
            }}
          >
            <span>+</span> Add Activity
          </button>
        </div>
      </div>

      {/* Add Form */}
      <div style={{ padding: showAddForm ? '16px 20px 0' : 0 }}>
        {showAddForm && (
          <AddActivityForm
            customerId={customerId}
            onActivityAdded={fetchActivities}
            onClose={() => setShowAddForm(false)}
          />
        )}
      </div>

      {/* Activity List */}
      <div style={{ padding: '0 20px' }}>
        {error && (
          <div style={{
            padding: '16px',
            textAlign: 'center',
            color: '#ef4444'
          }}>
            {error}
          </div>
        )}

        {!error && activities.length === 0 && (
          <div style={{
            padding: '40px 20px',
            textAlign: 'center',
            color: '#6b7280'
          }}>
            <div style={{ fontSize: '36px', marginBottom: '12px' }}>📋</div>
            <p style={{ margin: 0, fontWeight: '500' }}>No activities yet</p>
            <p style={{ margin: '4px 0 0', fontSize: '13px' }}>
              Add calls, emails, meetings, or notes to track interactions
            </p>
          </div>
        )}

        {activities.map((activity) => (
          <ActivityItem key={activity.id} activity={activity} />
        ))}

        {hasMore && (
          <div style={{ padding: '16px 0', textAlign: 'center' }}>
            <button
              onClick={() => {/* Load more implementation */}}
              style={{
                padding: '8px 16px',
                background: '#f3f4f6',
                color: '#374151',
                border: 'none',
                borderRadius: '6px',
                fontSize: '13px',
                cursor: 'pointer'
              }}
            >
              Load More
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

export default CustomerActivityTimeline;
