import { authFetch } from '../../services/authFetch';
/**
 * Smart Quick Actions Widget
 *
 * Displays context-aware quick action buttons based on pending work:
 * - Quotes expiring soon
 * - Stale quotes needing follow-up
 * - Overdue invoices
 * - Low/out of stock items
 * - Pending orders
 */

import React, { useState, useEffect, useCallback } from 'react';
import {
  Clock, AlertCircle, FileText, Package, AlertTriangle, ShoppingCart, RefreshCw, ArrowRight
} from 'lucide-react';

const API_URL = process.env.REACT_APP_API_URL || 'http://localhost:3001';

// Action configuration
const ACTION_CONFIG = {
  'quotes-expiring': {
    icon: Clock,
    color: '#f59e0b',
    bgColor: '#fef3c7',
    path: '/quotes?filter=expiring',
    verb: 'Quote',
    verbPlural: 'Quotes'
  },
  'stale-quotes': {
    icon: AlertCircle,
    color: '#f97316',
    bgColor: '#ffedd5',
    path: '/quotes?filter=stale',
    verb: 'Stale Quote',
    verbPlural: 'Stale Quotes'
  },
  'overdue-invoices': {
    icon: FileText,
    color: '#ef4444',
    bgColor: '#fee2e2',
    path: '/invoices?filter=overdue',
    verb: 'Overdue Invoice',
    verbPlural: 'Overdue Invoices'
  },
  'low-stock': {
    icon: Package,
    color: '#f59e0b',
    bgColor: '#fef3c7',
    path: '/inventory?filter=low-stock',
    verb: 'Low Stock Item',
    verbPlural: 'Low Stock Items'
  },
  'out-of-stock': {
    icon: AlertTriangle,
    color: '#ef4444',
    bgColor: '#fee2e2',
    path: '/inventory?filter=out-of-stock',
    verb: 'Out of Stock',
    verbPlural: 'Out of Stock'
  },
  'pending-orders': {
    icon: ShoppingCart,
    color: '#3b82f6',
    bgColor: '#dbeafe',
    path: '/orders?filter=pending',
    verb: 'Pending Order',
    verbPlural: 'Pending Orders'
  }
};

const SmartQuickActions = ({ onNavigate }) => {
  const [actions, setActions] = useState([]);
  const [allActions, setAllActions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [totalCount, setTotalCount] = useState(0);

  // Fetch quick action counts from API
  const fetchQuickActions = useCallback(async () => {
    try {
      const token = localStorage.getItem('auth_token');
      const response = await authFetch(`${API_URL}/api/insights/quick-actions`, {
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        }
      });

      if (!response.ok) {
        throw new Error('Failed to fetch quick actions');
      }

      const data = await response.json();
      if (data.success && data.data) {
        setActions(data.data.actions || []);
        setAllActions(data.data.allActions || []);
        setTotalCount(data.data.totalCount || 0);
      }
    } catch (err) {
      console.error('Error fetching quick actions:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchQuickActions();
    const interval = setInterval(fetchQuickActions, 120000); // Refresh every 2 minutes
    return () => clearInterval(interval);
  }, [fetchQuickActions]);

  // Handle action click
  const handleActionClick = (action) => {
    // Navigate based on action path
    const pathMap = {
      '/quotes': 'quotes',
      '/invoices': 'invoices',
      '/inventory': 'inventory',
      '/orders': 'orders'
    };

    const basePath = Object.keys(pathMap).find(p => action.path?.startsWith(p));
    if (basePath && onNavigate) {
      const filter = action.path?.split('filter=')[1];
      onNavigate(pathMap[basePath], { filter });
    }
  };

  if (loading) {
    return (
      <div style={{
        display: 'flex',
        gap: '12px',
        flexWrap: 'wrap',
        padding: '16px 0'
      }}>
        {[1, 2, 3].map(i => (
          <div key={i} style={{
            width: '120px',
            height: '48px',
            background: '#f3f4f6',
            borderRadius: '8px',
            animation: 'pulse 2s infinite'
          }} />
        ))}
        <style>{`
          @keyframes pulse {
            0%, 100% { opacity: 1; }
            50% { opacity: 0.5; }
          }
        `}</style>
      </div>
    );
  }

  // No pending items
  if (actions.length === 0) {
    return (
      <div style={{
        background: '#f0fdf4',
        border: '1px solid #bbf7d0',
        borderRadius: '12px',
        padding: '16px 20px',
        display: 'flex',
        alignItems: 'center',
        gap: '12px'
      }}>
        <div style={{
          width: '40px',
          height: '40px',
          borderRadius: '50%',
          background: '#dcfce7',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          fontSize: '20px'
        }}>
          ✨
        </div>
        <div>
          <div style={{ fontWeight: '600', color: '#166534', fontSize: '14px' }}>
            All Caught Up!
          </div>
          <div style={{ fontSize: '13px', color: '#15803d' }}>
            No urgent items need attention right now
          </div>
        </div>
      </div>
    );
  }

  return (
    <div style={{
      background: 'white',
      borderRadius: '12px',
      padding: '16px 20px',
      boxShadow: '0 1px 3px rgba(0,0,0,0.1)'
    }}>
      {/* Header */}
      <div style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        marginBottom: '12px'
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <span style={{ fontSize: '16px' }}>⚡</span>
          <h4 style={{ margin: 0, fontSize: '14px', fontWeight: '600', color: '#1f2937' }}>
            Quick Actions
          </h4>
          <span style={{
            background: totalCount > 10 ? '#ef4444' : totalCount > 5 ? '#f59e0b' : '#6366f1',
            color: 'white',
            padding: '2px 8px',
            borderRadius: '12px',
            fontSize: '11px',
            fontWeight: '600'
          }}>
            {totalCount} items
          </span>
        </div>
        <button
          onClick={fetchQuickActions}
          style={{
            padding: '4px',
            background: 'transparent',
            border: 'none',
            cursor: 'pointer',
            color: '#9ca3af',
            display: 'flex',
            alignItems: 'center'
          }}
          title="Refresh"
        >
          <RefreshCw size={14} />
        </button>
      </div>

      {/* Action Buttons */}
      <div style={{
        display: 'flex',
        gap: '8px',
        flexWrap: 'wrap'
      }}>
        {actions.map((action) => {
          const config = ACTION_CONFIG[action.id] || {};
          const IconComponent = config.icon || AlertCircle;
          const label = action.count === 1 ? config.verb : config.verbPlural;

          return (
            <button
              key={action.id}
              onClick={() => handleActionClick(action)}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '8px',
                padding: '8px 12px',
                background: config.bgColor || '#f3f4f6',
                border: 'none',
                borderRadius: '8px',
                cursor: 'pointer',
                transition: 'all 0.15s ease'
              }}
            >
              <IconComponent size={16} color={config.color || '#6b7280'} />
              <span style={{
                fontSize: '13px',
                fontWeight: '600',
                color: config.color || '#374151'
              }}>
                {action.count}
              </span>
              <span style={{
                fontSize: '12px',
                color: '#6b7280'
              }}>
                {label}
              </span>
              <ArrowRight size={14} color="#9ca3af" />
            </button>
          );
        })}
      </div>
    </div>
  );
};

export default SmartQuickActions;
