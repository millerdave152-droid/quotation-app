/**
 * NotificationDropdown - Dropdown list of notifications
 */

import React, { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';

const API_URL = process.env.REACT_APP_API_URL || 'http://localhost:3001';

const NotificationDropdown = ({ isOpen, onClose }) => {
  const [notifications, setNotifications] = useState([]);
  const [loading, setLoading] = useState(true);
  const dropdownRef = useRef(null);
  const navigate = useNavigate();

  useEffect(() => {
    if (isOpen) {
      fetchNotifications();
    }
  }, [isOpen]);

  // Close on click outside
  useEffect(() => {
    const handleClickOutside = (e) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target)) {
        onClose();
      }
    };

    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside);
    }
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [isOpen, onClose]);

  const fetchNotifications = async () => {
    try {
      setLoading(true);
      const token = localStorage.getItem('token');
      const response = await fetch(`${API_URL}/api/notifications?limit=20`, {
        headers: {
          'Authorization': `Bearer ${token}`
        }
      });

      const data = await response.json();
      if (data.success) {
        setNotifications(data.data.notifications || []);
      }
    } catch (err) {
      console.error('Error fetching notifications:', err);
    } finally {
      setLoading(false);
    }
  };

  const markAsRead = async (id) => {
    try {
      const token = localStorage.getItem('token');
      await fetch(`${API_URL}/api/notifications/${id}/read`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`
        }
      });

      setNotifications(prev =>
        prev.map(n => n.id === id ? { ...n, is_read: true } : n)
      );
    } catch (err) {
      console.error('Error marking notification as read:', err);
    }
  };

  const markAllAsRead = async () => {
    try {
      const token = localStorage.getItem('token');
      await fetch(`${API_URL}/api/notifications/mark-all-read`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`
        }
      });

      setNotifications(prev =>
        prev.map(n => ({ ...n, is_read: true }))
      );
    } catch (err) {
      console.error('Error marking all as read:', err);
    }
  };

  const handleNotificationClick = (notification) => {
    if (!notification.is_read) {
      markAsRead(notification.id);
    }

    if (notification.action_url) {
      navigate(notification.action_url);
      onClose();
    }
  };

  const formatTime = (dateString) => {
    const date = new Date(dateString);
    const now = new Date();
    const diffMs = now - date;
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMs / 3600000);
    const diffDays = Math.floor(diffMs / 86400000);

    if (diffMins < 1) return 'Just now';
    if (diffMins < 60) return `${diffMins}m ago`;
    if (diffHours < 24) return `${diffHours}h ago`;
    if (diffDays < 7) return `${diffDays}d ago`;
    return date.toLocaleDateString();
  };

  const getNotificationIcon = (type) => {
    const icons = {
      approval_request: { icon: 'Request', bg: '#fef3c7', color: '#d97706' },
      approval_approved: { icon: 'Approved', bg: '#dcfce7', color: '#16a34a' },
      approval_rejected: { icon: 'Rejected', bg: '#fee2e2', color: '#dc2626' },
      counter_offer: { icon: 'Offer', bg: '#dbeafe', color: '#2563eb' },
      counter_offer_pending: { icon: 'Pending', bg: '#fef3c7', color: '#d97706' },
      quote_won: { icon: 'Won', bg: '#dcfce7', color: '#16a34a' },
      quote_lost: { icon: 'Lost', bg: '#fee2e2', color: '#dc2626' },
      quote_sent: { icon: 'Sent', bg: '#dbeafe', color: '#2563eb' }
    };
    return icons[type] || { icon: 'Bell', bg: '#f3f4f6', color: '#6b7280' };
  };

  if (!isOpen) return null;

  const unreadCount = notifications.filter(n => !n.is_read).length;

  return (
    <div
      ref={dropdownRef}
      style={{
        position: 'absolute',
        top: '100%',
        right: 0,
        marginTop: '8px',
        width: '380px',
        maxHeight: '480px',
        background: 'white',
        borderRadius: '12px',
        boxShadow: '0 10px 40px rgba(0, 0, 0, 0.15)',
        border: '1px solid #e5e7eb',
        overflow: 'hidden',
        zIndex: 1000
      }}
    >
      {/* Header */}
      <div style={{
        padding: '16px 20px',
        borderBottom: '1px solid #e5e7eb',
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center'
      }}>
        <div>
          <h3 style={{ margin: 0, fontSize: '16px', fontWeight: '600' }}>
            Notifications
          </h3>
          {unreadCount > 0 && (
            <span style={{ fontSize: '12px', color: '#6b7280' }}>
              {unreadCount} unread
            </span>
          )}
        </div>
        {unreadCount > 0 && (
          <button
            onClick={markAllAsRead}
            style={{
              background: 'transparent',
              border: 'none',
              color: '#667eea',
              fontSize: '13px',
              cursor: 'pointer',
              fontWeight: '500'
            }}
          >
            Mark all read
          </button>
        )}
      </div>

      {/* Notifications List */}
      <div style={{ maxHeight: '400px', overflowY: 'auto' }}>
        {loading ? (
          <div style={{ padding: '40px', textAlign: 'center', color: '#6b7280' }}>
            Loading...
          </div>
        ) : notifications.length === 0 ? (
          <div style={{ padding: '40px', textAlign: 'center', color: '#6b7280' }}>
            <div style={{ fontSize: '32px', marginBottom: '8px' }}>No Notifications</div>
            <p style={{ margin: 0, fontSize: '14px' }}>You're all caught up!</p>
          </div>
        ) : (
          notifications.map(notification => {
            const iconInfo = getNotificationIcon(notification.notification_type);

            return (
              <div
                key={notification.id}
                onClick={() => handleNotificationClick(notification)}
                style={{
                  padding: '14px 20px',
                  borderBottom: '1px solid #f3f4f6',
                  cursor: notification.action_url ? 'pointer' : 'default',
                  background: notification.is_read ? 'white' : '#f0f7ff',
                  transition: 'background 0.2s',
                  display: 'flex',
                  gap: '12px'
                }}
                onMouseEnter={(e) => {
                  if (notification.action_url) {
                    e.currentTarget.style.background = notification.is_read ? '#f9fafb' : '#e0efff';
                  }
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.background = notification.is_read ? 'white' : '#f0f7ff';
                }}
              >
                {/* Icon */}
                <div style={{
                  width: '36px',
                  height: '36px',
                  borderRadius: '50%',
                  background: iconInfo.bg,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  flexShrink: 0
                }}>
                  <span style={{
                    fontSize: '14px',
                    fontWeight: 'bold',
                    color: iconInfo.color
                  }}>
                    {iconInfo.icon.charAt(0)}
                  </span>
                </div>

                {/* Content */}
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'flex-start',
                    marginBottom: '4px'
                  }}>
                    <div style={{
                      fontWeight: notification.is_read ? '500' : '600',
                      fontSize: '14px',
                      color: '#111827'
                    }}>
                      {notification.title}
                    </div>
                    <span style={{
                      fontSize: '11px',
                      color: '#9ca3af',
                      flexShrink: 0,
                      marginLeft: '8px'
                    }}>
                      {formatTime(notification.created_at)}
                    </span>
                  </div>
                  <div style={{
                    fontSize: '13px',
                    color: '#6b7280',
                    lineHeight: '1.4',
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    whiteSpace: 'nowrap'
                  }}>
                    {notification.message}
                  </div>
                  {notification.quote_number && (
                    <div style={{
                      fontSize: '11px',
                      color: '#667eea',
                      marginTop: '4px'
                    }}>
                      {notification.quote_number}
                    </div>
                  )}
                </div>

                {/* Unread indicator */}
                {!notification.is_read && (
                  <div style={{
                    width: '8px',
                    height: '8px',
                    borderRadius: '50%',
                    background: '#667eea',
                    flexShrink: 0,
                    marginTop: '6px'
                  }} />
                )}
              </div>
            );
          })
        )}
      </div>

      {/* Footer */}
      {notifications.length > 0 && (
        <div style={{
          padding: '12px 20px',
          borderTop: '1px solid #e5e7eb',
          textAlign: 'center'
        }}>
          <button
            onClick={() => {
              navigate('/notifications');
              onClose();
            }}
            style={{
              background: 'transparent',
              border: 'none',
              color: '#667eea',
              fontSize: '13px',
              cursor: 'pointer',
              fontWeight: '500'
            }}
          >
            View all notifications
          </button>
        </div>
      )}
    </div>
  );
};

export default NotificationDropdown;
