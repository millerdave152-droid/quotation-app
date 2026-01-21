/**
 * NotificationBadge - Shows notification count with polling
 */

import React, { useState, useEffect, useCallback } from 'react';

const API_URL = process.env.REACT_APP_API_URL || 'http://localhost:3001';
const POLL_INTERVAL = 30000; // 30 seconds

const NotificationBadge = ({ onClick, isOpen }) => {
  const [unreadCount, setUnreadCount] = useState(0);
  const [loading, setLoading] = useState(false);

  const fetchUnreadCount = useCallback(async () => {
    try {
      const token = localStorage.getItem('auth_token');
      if (!token) return;

      const response = await fetch(`${API_URL}/api/notifications/unread-count`, {
        headers: {
          'Authorization': `Bearer ${token}`
        }
      });

      const data = await response.json();
      if (data.success) {
        setUnreadCount(data.data.count);
      }
    } catch (err) {
      console.error('Error fetching notification count:', err);
    }
  }, []);

  // Initial fetch and polling
  useEffect(() => {
    fetchUnreadCount();

    const interval = setInterval(fetchUnreadCount, POLL_INTERVAL);
    return () => clearInterval(interval);
  }, [fetchUnreadCount]);

  // Refetch when dropdown closes (in case user read notifications)
  useEffect(() => {
    if (!isOpen) {
      fetchUnreadCount();
    }
  }, [isOpen, fetchUnreadCount]);

  return (
    <button
      onClick={onClick}
      aria-expanded={isOpen}
      aria-haspopup="true"
      aria-label={unreadCount > 0
        ? `Notifications, ${unreadCount} unread`
        : 'Notifications, no unread'}
      style={{
        position: 'relative',
        background: isOpen ? '#f3f4f6' : 'transparent',
        border: 'none',
        borderRadius: '8px',
        padding: '8px 12px',
        cursor: 'pointer',
        display: 'flex',
        alignItems: 'center',
        gap: '6px',
        transition: 'background 0.2s'
      }}
      onMouseEnter={(e) => {
        if (!isOpen) e.currentTarget.style.background = '#f3f4f6';
      }}
      onMouseLeave={(e) => {
        if (!isOpen) e.currentTarget.style.background = 'transparent';
      }}
      title={`${unreadCount} unread notification${unreadCount !== 1 ? 's' : ''}`}
    >
      {/* Bell Icon */}
      <svg
        width="20"
        height="20"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden="true"
        focusable="false"
      >
        <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" />
        <path d="M13.73 21a2 2 0 0 1-3.46 0" />
      </svg>

      {/* Badge */}
      {unreadCount > 0 && (
        <span
          style={{
            position: 'absolute',
            top: '2px',
            right: '4px',
            background: '#ef4444',
            color: 'white',
            fontSize: '10px',
            fontWeight: 'bold',
            minWidth: '16px',
            height: '16px',
            borderRadius: '8px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: '0 4px'
          }}
          aria-hidden="true"
        >
          {unreadCount > 99 ? '99+' : unreadCount}
        </span>
      )}
    </button>
  );
};

export default NotificationBadge;
