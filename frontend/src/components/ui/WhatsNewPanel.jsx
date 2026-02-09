import React, { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';

const FEATURES = [
  {
    id: 'leaderboard-2026-02',
    date: '2026-02-09',
    title: 'Sales Leaderboard',
    description: 'Track top performers with the new leaderboard. View rankings by day, week, month, quarter, or year with live commission data.',
    icon: '🏆',
    linkTo: '/leaderboard',
  },
  {
    id: 'global-search-expansion-2026-02',
    date: '2026-02-09',
    title: 'Enhanced Global Search',
    description: 'Global search (Ctrl+Shift+F) now includes Leads, Invoices, and Orders in addition to Quotes, Customers, and Products.',
    icon: '🔍',
    linkTo: null,
  },
  {
    id: 'lead-response-time-2026-02',
    date: '2026-02-09',
    title: 'Lead Response Time Tracking',
    description: 'Automatic tracking of how quickly leads are contacted. See average response time on the dashboard and leads page.',
    icon: '⏱️',
    linkTo: '/leads',
  },
  {
    id: 'quote-acceptance-2026-02',
    date: '2026-02-09',
    title: 'Online Quote Acceptance',
    description: 'Customers can now accept quotes directly from their email with a single click. No login required.',
    icon: '✅',
    linkTo: '/quotes',
  },
  {
    id: 'daily-digest-2026-02',
    date: '2026-02-09',
    title: 'Daily Digest Email',
    description: 'Sales reps receive a weekday morning email with new leads, follow-ups due, yesterday\'s sales, and expiring quotes.',
    icon: '📧',
    linkTo: null,
  },
  {
    id: 'fraud-detection-2026-02',
    date: '2026-02-01',
    title: 'Fraud Detection System',
    description: 'Automated fraud risk scoring for POS transactions with real-time alerts and admin dashboard.',
    icon: '🛡️',
    linkTo: '/admin/fraud',
  },
  {
    id: 'clv-analytics-2026-01',
    date: '2026-01-15',
    title: 'Customer Lifetime Value Analytics',
    description: 'Deep analytics on customer value, segmentation, and churn risk with the CLV Dashboard.',
    icon: '💎',
    linkTo: '/clv-dashboard',
  },
  {
    id: 'pipeline-analytics-2026-01',
    date: '2026-01-10',
    title: 'Pipeline Analytics',
    description: 'Visual sales pipeline with funnel analysis, conversion rates, and revenue forecasting.',
    icon: '📊',
    linkTo: '/pipeline-analytics',
  },
];

const STORAGE_KEY = 'whats_new_dismissed';

const getDismissed = () => {
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]');
  } catch {
    return [];
  }
};

export const getUnreadCount = () => {
  const dismissed = getDismissed();
  return FEATURES.filter(f => !dismissed.includes(f.id)).length;
};

const WhatsNewPanel = ({ isOpen, onClose }) => {
  const [dismissed, setDismissed] = useState(getDismissed);
  const panelRef = useRef(null);
  const navigate = useNavigate();

  useEffect(() => {
    if (isOpen) {
      setDismissed(getDismissed());
    }
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen) return;
    const handleClickOutside = (e) => {
      if (panelRef.current && !panelRef.current.contains(e.target)) {
        onClose();
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [isOpen, onClose]);

  const markAllRead = () => {
    const allIds = FEATURES.map(f => f.id);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(allIds));
    setDismissed(allIds);
  };

  const handleFeatureClick = (feature) => {
    // Mark as read
    const updated = [...new Set([...dismissed, feature.id])];
    localStorage.setItem(STORAGE_KEY, JSON.stringify(updated));
    setDismissed(updated);

    if (feature.linkTo) {
      navigate(feature.linkTo);
      onClose();
    }
  };

  if (!isOpen) return null;

  const unreadCount = FEATURES.filter(f => !dismissed.includes(f.id)).length;

  return (
    <div
      ref={panelRef}
      style={{
        position: 'fixed',
        top: '70px',
        right: '80px',
        width: '380px',
        maxHeight: '520px',
        background: 'white',
        borderRadius: '12px',
        boxShadow: '0 20px 60px rgba(0, 0, 0, 0.2)',
        border: '1px solid #e5e7eb',
        overflow: 'hidden',
        zIndex: 10000,
        display: 'flex',
        flexDirection: 'column',
      }}
    >
      {/* Header */}
      <div style={{
        padding: '16px 20px',
        borderBottom: '1px solid #e5e7eb',
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        background: 'linear-gradient(135deg, #667eea08 0%, #764ba208 100%)',
      }}>
        <div>
          <div style={{ fontWeight: '700', fontSize: '16px', color: '#111827' }}>What's New</div>
          {unreadCount > 0 && (
            <div style={{ fontSize: '12px', color: '#6b7280', marginTop: '2px' }}>{unreadCount} unread updates</div>
          )}
        </div>
        <div style={{ display: 'flex', gap: '8px' }}>
          {unreadCount > 0 && (
            <button
              onClick={markAllRead}
              style={{
                padding: '6px 12px', borderRadius: '6px', border: '1px solid #e5e7eb',
                background: 'white', fontSize: '12px', color: '#6b7280', cursor: 'pointer',
                fontWeight: '500',
              }}
            >
              Mark all read
            </button>
          )}
          <button
            onClick={onClose}
            style={{
              width: '28px', height: '28px', borderRadius: '6px', border: 'none',
              background: '#f3f4f6', cursor: 'pointer', fontSize: '14px',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}
          >
            ×
          </button>
        </div>
      </div>

      {/* Feature list */}
      <div style={{ overflowY: 'auto', flex: 1, padding: '8px' }}>
        {FEATURES.map(feature => {
          const isRead = dismissed.includes(feature.id);
          return (
            <div
              key={feature.id}
              onClick={() => handleFeatureClick(feature)}
              style={{
                padding: '14px 16px',
                borderRadius: '10px',
                cursor: feature.linkTo ? 'pointer' : 'default',
                background: isRead ? 'transparent' : '#f0f4ff',
                marginBottom: '4px',
                transition: 'background 0.2s',
                borderLeft: isRead ? '3px solid transparent' : '3px solid #667eea',
              }}
              onMouseEnter={(e) => { if (feature.linkTo) e.currentTarget.style.background = isRead ? '#f9fafb' : '#e8edff'; }}
              onMouseLeave={(e) => { e.currentTarget.style.background = isRead ? 'transparent' : '#f0f4ff'; }}
            >
              <div style={{ display: 'flex', gap: '12px', alignItems: 'flex-start' }}>
                <span style={{ fontSize: '22px', flexShrink: 0, marginTop: '2px' }}>{feature.icon}</span>
                <div style={{ flex: 1 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '4px' }}>
                    <span style={{ fontWeight: '600', fontSize: '14px', color: '#111827' }}>{feature.title}</span>
                    {!isRead && (
                      <span style={{
                        width: '8px', height: '8px', borderRadius: '50%',
                        background: '#667eea', flexShrink: 0,
                      }} />
                    )}
                  </div>
                  <div style={{ fontSize: '13px', color: '#6b7280', lineHeight: '1.4' }}>{feature.description}</div>
                  <div style={{ fontSize: '11px', color: '#9ca3af', marginTop: '6px' }}>{feature.date}</div>
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};

export default WhatsNewPanel;
