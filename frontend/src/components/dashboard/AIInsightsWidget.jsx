import { authFetch } from '../../services/authFetch';
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

const API_URL = process.env.REACT_APP_API_URL || '';

// Priority colors and icons
const PRIORITY_CONFIG = {
  critical: { bg: '#fef2f2', border: '#fecaca', text: '#991b1b', icon: <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#991b1b" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>, label: 'Critical' },
  high: { bg: '#fff7ed', border: '#fed7aa', text: '#c2410c', icon: <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#c2410c" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/></svg>, label: 'High' },
  medium: { bg: '#fefce8', border: '#fef08a', text: '#a16207', icon: <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#a16207" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="9" y1="18" x2="15" y2="18"/><line x1="10" y1="22" x2="14" y2="22"/><path d="M15.09 14c.18-.98.65-1.74 1.41-2.5A4.65 4.65 0 0 0 18 8 6 6 0 0 0 6 8c0 1 .23 2.23 1.5 3.5A4.61 4.61 0 0 1 8.91 14"/></svg>, label: 'Medium' },
  low: { bg: '#f0fdf4', border: '#bbf7d0', text: '#166534', icon: <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#166534" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>, label: 'Info' }
};

// Type icons
const TYPE_ICONS = {
  stale_quote: <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2"/><rect x="8" y="2" width="8" height="4" rx="1" ry="1"/></svg>,
  quote_expiring: <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>,
  churn_risk: <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>,
  inventory_low: <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="16.5" y1="9.4" x2="7.5" y2="4.21"/><path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"/><polyline points="3.27 6.96 12 12.01 20.73 6.96"/><line x1="12" y1="22.08" x2="12" y2="12"/></svg>,
  invoice_overdue: <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="12" y1="1" x2="12" y2="23"/><path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"/></svg>,
  customer_milestone: <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="8" r="7"/><polyline points="8.21 13.89 7 23 12 20 17 23 15.79 13.88"/></svg>,
  sales_opportunity: <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><circle cx="12" cy="12" r="6"/><circle cx="12" cy="12" r="2"/></svg>,
  reorder_needed: <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="23 4 23 10 17 10"/><polyline points="1 20 1 14 7 14"/><path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15"/></svg>
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
      const response = await authFetch(`${API_URL}/api/insights?limit=${expanded ? 20 : limit}`, {
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
      await authFetch(`${API_URL}/api/insights/${insightId}/dismiss`, {
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
      const response = await authFetch(`${API_URL}/api/insights/${insight.id}/action`, {
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


  if (loading) {
    return (
      <div style={{
        background: 'white',
        borderRadius: '12px',
        padding: '20px',
        boxShadow: '0 1px 3px rgba(0,0,0,0.1)'
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '16px' }}>
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#6366f1" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="11" width="18" height="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/><circle cx="12" cy="16" r="1"/></svg>
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
          <div style={{ marginBottom: '8px' }}>
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#ef4444" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>
          </div>
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
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#6366f1" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="11" width="18" height="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/><circle cx="12" cy="16" r="1"/></svg>
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
            <div style={{ marginBottom: '12px' }}>
              <svg width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="#9ca3af" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/></svg>
            </div>
            <p style={{ margin: 0, fontWeight: '500' }}>All caught up!</p>
            <p style={{ margin: '4px 0 0', fontSize: '13px' }}>No actionable insights right now</p>
          </div>
        ) : (
          displayedInsights.map((insight) => {
            const priorityConfig = PRIORITY_CONFIG[insight.priority] || PRIORITY_CONFIG.medium;
            const typeIcon = TYPE_ICONS[insight.type] || <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>;

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
