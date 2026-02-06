/**
 * AI Insights Widget
 *
 * Displays AI-generated business insights with actionable recommendations:
 * - Stale quotes needing follow-up
 * - Quote expiry warnings
 * - Customer churn risks
 * - Inventory alerts
 * - Overdue invoices
 */

import React, { useState, useEffect, useCallback } from 'react';

const API_URL = process.env.REACT_APP_API_URL || 'http://localhost:3001';

// Priority colors and icons
const PRIORITY_CONFIG = {
  critical: { bg: '#fef2f2', border: '#fecaca', text: '#991b1b', icon: '🚨', label: 'Critical' },
  high: { bg: '#fff7ed', border: '#fed7aa', text: '#c2410c', icon: '⚡', label: 'High' },
  medium: { bg: '#fefce8', border: '#fef08a', text: '#a16207', icon: '💡', label: 'Medium' },
  low: { bg: '#f0fdf4', border: '#bbf7d0', text: '#166534', icon: '💬', label: 'Info' }
};

// Type icons
const TYPE_ICONS = {
  stale_quote: '📋',
  quote_expiring: '⏰',
  churn_risk: '⚠️',
  inventory_low: '📦',
  invoice_overdue: '💰',
  customer_milestone: '🎉',
  sales_opportunity: '🎯',
  reorder_needed: '🔄'
};

const AIInsightsWidget = ({ onNavigate, onAction, limit = 5 }) => {
  const [insights, setInsights] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [dismissing, setDismissing] = useState(null);
  const [expanded, setExpanded] = useState(false);

  // Fetch insights from API
  const fetchInsights = useCallback(async () => {
    try {
      const token = localStorage.getItem('auth_token');
      const response = await fetch(`${API_URL}/api/insights?limit=${expanded ? 20 : limit}`, {
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        }
      });

      if (!response.ok) {
        throw new Error('Failed to fetch insights');
      }

      const data = await response.json();
      if (data.success && data.data) {
        setInsights(data.data.insights || []);
      }
    } catch (err) {
      console.error('Error fetching insights:', err);
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [expanded, limit]);

  useEffect(() => {
    fetchInsights();
    const interval = setInterval(fetchInsights, 300000); // Refresh every 5 minutes
    return () => clearInterval(interval);
  }, [fetchInsights]);

  // Dismiss an insight
  const dismissInsight = async (insightId) => {
    setDismissing(insightId);
    try {
      const token = localStorage.getItem('auth_token');
      await fetch(`${API_URL}/api/insights/${insightId}/dismiss`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        }
      });
      setInsights(prev => prev.filter(i => i.id !== insightId));
    } catch (err) {
      console.error('Error dismissing insight:', err);
    } finally {
      setDismissing(null);
    }
  };

  // Execute an insight action
  const executeAction = async (insight, action) => {
    try {
      const token = localStorage.getItem('auth_token');

      // Handle navigation actions directly
      if (action.action === 'view_quote' && insight.data?.quoteId) {
        onNavigate?.('quotes', { selected: insight.data.quoteId });
        return;
      }
      if (action.action === 'view_customer' && insight.data?.customerId) {
        onNavigate?.('customers', { selected: insight.data.customerId });
        return;
      }
      if (action.action === 'view_product' && insight.data?.productId) {
        onNavigate?.('products', { selected: insight.data.productId });
        return;
      }
      if (action.action === 'view_invoice' && insight.data?.invoiceId) {
        onNavigate?.('invoices', { selected: insight.data.invoiceId });
        return;
      }
      if (action.action === 'create_quote' && insight.data?.customerId) {
        onNavigate?.('builder', { customerId: insight.data.customerId });
        return;
      }

      // Execute backend action
      const response = await fetch(`${API_URL}/api/insights/${insight.id}/action`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          action: action.action,
          data: insight.data
        })
      });

      const result = await response.json();

      if (result.success && result.data?.redirectTo) {
        // Handle redirects
        const path = result.data.redirectTo;
        if (path.includes('/quotes/new')) {
          onNavigate?.('builder', { customerId: insight.data?.customerId });
        } else if (path.includes('/inventory')) {
          onNavigate?.('inventory', { productId: insight.data?.productId });
        }
      }

      // Notify parent of action
      onAction?.(action.action, insight, result);

      // Refresh insights after action
      fetchInsights();
    } catch (err) {
      console.error('Error executing action:', err);
    }
  };

  // Format relative time
  const formatRelativeTime = (date) => {
    if (!date) return '';
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
    return d.toLocaleDateString('en-CA', { month: 'short', day: 'numeric' });
  };

  if (loading) {
    return (
      <div style={{
        background: 'white',
        borderRadius: '12px',
        padding: '20px',
        boxShadow: '0 1px 3px rgba(0,0,0,0.1)'
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '16px' }}>
          <span style={{ fontSize: '20px' }}>🤖</span>
          <h3 style={{ margin: 0, fontSize: '16px', fontWeight: '600', color: '#1f2937' }}>
            AI Insights
          </h3>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
          {[1, 2, 3].map(i => (
            <div key={i} style={{
              height: '72px',
              background: '#f3f4f6',
              borderRadius: '8px',
              animation: 'pulse 2s infinite'
            }} />
          ))}
        </div>
        <style>{`
          @keyframes pulse {
            0%, 100% { opacity: 1; }
            50% { opacity: 0.5; }
          }
        `}</style>
      </div>
    );
  }

  if (error) {
    return (
      <div style={{
        background: 'white',
        borderRadius: '12px',
        padding: '20px',
        boxShadow: '0 1px 3px rgba(0,0,0,0.1)'
      }}>
        <div style={{ textAlign: 'center', color: '#6b7280', padding: '20px' }}>
          <div style={{ fontSize: '24px', marginBottom: '8px' }}>⚠️</div>
          <p style={{ margin: 0 }}>Unable to load insights</p>
        </div>
      </div>
    );
  }

  const displayedInsights = expanded ? insights : insights.slice(0, limit);
  const hasMore = insights.length > limit;

  return (
    <div style={{
      background: 'white',
      borderRadius: '12px',
      boxShadow: '0 1px 3px rgba(0,0,0,0.1)',
      overflow: 'hidden'
    }}>
      {/* Header */}
      <div style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        padding: '16px 20px',
        borderBottom: '1px solid #f3f4f6'
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <span style={{ fontSize: '20px' }}>🤖</span>
          <h3 style={{ margin: 0, fontSize: '16px', fontWeight: '600', color: '#1f2937' }}>
            AI Insights
          </h3>
          {insights.length > 0 && (
            <span style={{
              background: insights.some(i => i.priority === 'critical') ? '#ef4444' :
                         insights.some(i => i.priority === 'high') ? '#f59e0b' : '#6366f1',
              color: 'white',
              padding: '2px 8px',
              borderRadius: '12px',
              fontSize: '12px',
              fontWeight: '600'
            }}>
              {insights.length}
            </span>
          )}
        </div>
        <button
          onClick={fetchInsights}
          style={{
            padding: '6px 12px',
            background: '#f3f4f6',
            border: 'none',
            borderRadius: '6px',
            fontSize: '12px',
            color: '#6b7280',
            cursor: 'pointer'
          }}
        >
          Refresh
        </button>
      </div>

      {/* Insights List */}
      <div style={{ maxHeight: expanded ? '500px' : '400px', overflowY: 'auto' }}>
        {displayedInsights.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '40px 20px', color: '#6b7280' }}>
            <div style={{ fontSize: '36px', marginBottom: '12px' }}>✨</div>
            <p style={{ margin: 0, fontWeight: '500' }}>All caught up!</p>
            <p style={{ margin: '4px 0 0', fontSize: '13px' }}>No actionable insights right now</p>
          </div>
        ) : (
          displayedInsights.map((insight) => {
            const priorityConfig = PRIORITY_CONFIG[insight.priority] || PRIORITY_CONFIG.medium;
            const typeIcon = TYPE_ICONS[insight.type] || '📌';

            return (
              <div
                key={insight.id}
                style={{
                  padding: '16px 20px',
                  borderBottom: '1px solid #f3f4f6',
                  background: dismissing === insight.id ? '#f9fafb' : 'white',
                  transition: 'all 0.2s ease'
                }}
              >
                {/* Insight Header */}
                <div style={{ display: 'flex', gap: '12px', marginBottom: '8px' }}>
                  <div style={{
                    width: '36px',
                    height: '36px',
                    borderRadius: '8px',
                    background: priorityConfig.bg,
                    border: `1px solid ${priorityConfig.border}`,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    fontSize: '16px',
                    flexShrink: 0
                  }}>
                    {typeIcon}
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'start', gap: '8px' }}>
                      <h4 style={{
                        margin: 0,
                        fontSize: '14px',
                        fontWeight: '600',
                        color: '#1f2937',
                        lineHeight: 1.3
                      }}>
                        {insight.title}
                      </h4>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexShrink: 0 }}>
                        <span style={{
                          padding: '2px 6px',
                          borderRadius: '4px',
                          fontSize: '10px',
                          fontWeight: '600',
                          background: priorityConfig.bg,
                          color: priorityConfig.text,
                          textTransform: 'uppercase'
                        }}>
                          {priorityConfig.label}
                        </span>
                        <button
                          onClick={() => dismissInsight(insight.id)}
                          disabled={dismissing === insight.id}
                          style={{
                            padding: '4px',
                            background: 'transparent',
                            border: 'none',
                            cursor: 'pointer',
                            color: '#9ca3af',
                            fontSize: '16px',
                            lineHeight: 1,
                            borderRadius: '4px'
                          }}
                          title="Dismiss"
                        >
                          ×
                        </button>
                      </div>
                    </div>
                    <p style={{
                      margin: '4px 0 0',
                      fontSize: '13px',
                      color: '#6b7280',
                      lineHeight: 1.4
                    }}>
                      {insight.message}
                    </p>
                  </div>
                </div>

                {/* Actions */}
                {insight.actions && insight.actions.length > 0 && (
                  <div style={{
                    display: 'flex',
                    gap: '8px',
                    marginTop: '12px',
                    paddingLeft: '48px'
                  }}>
                    {insight.actions.map((action, idx) => (
                      <button
                        key={idx}
                        onClick={() => executeAction(insight, action)}
                        style={{
                          padding: '6px 12px',
                          background: action.primary ? '#6366f1' : 'white',
                          color: action.primary ? 'white' : '#374151',
                          border: action.primary ? 'none' : '1px solid #e5e7eb',
                          borderRadius: '6px',
                          fontSize: '12px',
                          fontWeight: '500',
                          cursor: 'pointer',
                          transition: 'all 0.15s ease'
                        }}
                      >
                        {action.label}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            );
          })
        )}
      </div>

      {/* Footer - Show More/Less */}
      {hasMore && (
        <div style={{
          padding: '12px 20px',
          borderTop: '1px solid #f3f4f6',
          textAlign: 'center'
        }}>
          <button
            onClick={() => setExpanded(!expanded)}
            style={{
              padding: '8px 16px',
              background: 'transparent',
              border: 'none',
              color: '#6366f1',
              fontSize: '13px',
              fontWeight: '500',
              cursor: 'pointer'
            }}
          >
            {expanded ? 'Show Less' : `Show ${insights.length - limit} More`}
          </button>
        </div>
      )}
    </div>
  );
};

export default AIInsightsWidget;
