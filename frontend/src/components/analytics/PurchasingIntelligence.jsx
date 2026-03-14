import React, { useState, useEffect, useRef, useCallback } from 'react';
import { authFetch } from '../../services/authFetch';
import {
  Package, TrendingUp, TrendingDown, AlertTriangle, RefreshCw, CheckCircle,
  Brain, Clock, ShoppingCart, Filter, BarChart2, Activity, Download
} from 'lucide-react';

const API_BASE = `${process.env.REACT_APP_API_URL || ''}/api`;

/**
 * PurchasingIntelligence Dashboard
 * AI-powered analysis of purchasing patterns with recommendations
 */
const PurchasingIntelligence = () => {
  const [dashboardData, setDashboardData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [activeTab, setActiveTab] = useState('recommendations');
  const [priorityFilter, setPriorityFilter] = useState('all');
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [forecasts, setForecasts] = useState([]);
  const [forecastsLoading, setForecastsLoading] = useState(false);

  const isMounted = useRef(true);
  const loadedOnce = useRef(false);

  const fetchDashboardData = useCallback(async () => {
    if (!isMounted.current) return;

    setLoading(true);
    setError(null);

    try {
      const token = localStorage.getItem('auth_token');
      const response = await authFetch(`${API_BASE}/purchasing-intelligence/dashboard`, {
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        }
      });

      if (!response.ok) {
        throw new Error('Failed to fetch dashboard data');
      }

      const result = await response.json();

      if (!isMounted.current) return;
      setDashboardData(result.data);
    } catch (err) {
      console.error('Dashboard fetch error:', err);
      if (isMounted.current) {
        setError(err.message || 'Failed to fetch data');
      }
    } finally {
      if (isMounted.current) {
        setLoading(false);
      }
    }
  }, []);

  useEffect(() => {
    isMounted.current = true;

    if (!loadedOnce.current) {
      loadedOnce.current = true;
      fetchDashboardData();
    }

    return () => {
      isMounted.current = false;
    };
  }, [fetchDashboardData]);

  const fetchForecasts = useCallback(async () => {
    setForecastsLoading(true);
    try {
      const token = localStorage.getItem('auth_token');
      const response = await authFetch(`${API_BASE}/purchasing-intelligence/forecasts`, {
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        }
      });

      if (response.ok) {
        const result = await response.json();
        if (isMounted.current) setForecasts(result.data || []);
      }
    } catch (err) {
      console.error('Forecasts fetch error:', err);
    } finally {
      if (isMounted.current) setForecastsLoading(false);
    }
  }, []);

  // Fetch forecasts when switching to that tab
  useEffect(() => {
    if (activeTab === 'forecasts' && forecasts.length === 0 && !forecastsLoading) {
      fetchForecasts();
    }
  }, [activeTab, forecasts.length, forecastsLoading, fetchForecasts]);

  const triggerAnalysis = async () => {
    setIsAnalyzing(true);
    try {
      const token = localStorage.getItem('auth_token');
      const response = await authFetch(`${API_BASE}/purchasing-intelligence/analyze`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        }
      });

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.message || 'Failed to start analysis');
      }

      // Refresh dashboard after a short delay
      setTimeout(() => {
        fetchDashboardData();
        setIsAnalyzing(false);
      }, 3000);
    } catch (err) {
      console.error('Analysis trigger error:', err);
      setError(err.message);
      setIsAnalyzing(false);
    }
  };

  const acknowledgeRecommendation = async (recommendationId) => {
    try {
      const token = localStorage.getItem('auth_token');
      await authFetch(`${API_BASE}/purchasing-intelligence/recommendations/${recommendationId}/acknowledge`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        }
      });

      fetchDashboardData();
    } catch (err) {
      console.error('Acknowledge error:', err);
    }
  };

  const formatDate = (dateValue) => {
    if (!dateValue) return 'N/A';
    try {
      const date = new Date(dateValue);
      if (isNaN(date.getTime())) return 'N/A';
      return date.toLocaleDateString('en-CA', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
    } catch {
      return 'N/A';
    }
  };

  const priorityConfig = {
    critical: { color: '#dc2626', bgColor: '#fef2f2', label: 'Critical' },
    high: { color: '#ea580c', bgColor: '#fff7ed', label: 'High' },
    medium: { color: '#ca8a04', bgColor: '#fefce8', label: 'Medium' },
    low: { color: '#16a34a', bgColor: '#f0fdf4', label: 'Low' }
  };

  const getFilteredRecommendations = () => {
    if (!dashboardData?.recommendations) return [];
    if (priorityFilter === 'all') return dashboardData.recommendations;
    return dashboardData.recommendations.filter(r => r.priority === priorityFilter);
  };

  const exportCsv = () => {
    const recs = getFilteredRecommendations();
    if (recs.length === 0) return;
    const headers = ['Priority', 'Product', 'SKU', 'Type', 'Stock', 'Days Left', 'Suggested Order'];
    const rows = recs.map(r => [
      r.priority || '',
      (r.product_name || '').replace(/"/g, '""'),
      r.sku || '',
      (r.recommendation_type || '').replace(/_/g, ' '),
      r.current_stock ?? '',
      r.days_of_stock_remaining ?? '',
      r.suggested_quantity ?? ''
    ]);
    const csv = [headers.join(','), ...rows.map(r => r.map(v => `"${v}"`).join(','))].join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `purchasing-recommendations-${new Date().toISOString().slice(0, 10)}.csv`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  if (loading && !dashboardData) {
    return (
      <div style={{ padding: '24px', maxWidth: '1400px', margin: '0 auto' }}>
        {/* Skeleton header */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '14px', marginBottom: '28px' }}>
          <div style={{ width: '42px', height: '42px', borderRadius: '12px', background: '#e5e7eb', animation: 'skeletonPulse 1.5s ease-in-out infinite' }} />
          <div>
            <div style={{ width: '220px', height: '20px', borderRadius: '6px', background: '#e5e7eb', marginBottom: '8px', animation: 'skeletonPulse 1.5s ease-in-out infinite' }} />
            <div style={{ width: '300px', height: '14px', borderRadius: '6px', background: '#f3f4f6', animation: 'skeletonPulse 1.5s ease-in-out infinite' }} />
          </div>
        </div>
        {/* Skeleton summary cards */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: '16px', marginBottom: '28px' }}>
          {[0, 1, 2, 3, 4].map(i => (
            <div key={i} style={{
              background: 'white', padding: '20px', borderRadius: '12px',
              border: '1px solid #e5e7eb'
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '12px' }}>
                <div style={{ width: '36px', height: '36px', borderRadius: '10px', background: '#f3f4f6', animation: 'skeletonPulse 1.5s ease-in-out infinite', animationDelay: `${i * 0.1}s` }} />
                <div style={{ width: '80px', height: '12px', borderRadius: '4px', background: '#f3f4f6', animation: 'skeletonPulse 1.5s ease-in-out infinite', animationDelay: `${i * 0.1}s` }} />
              </div>
              <div style={{ width: '50px', height: '28px', borderRadius: '6px', background: '#e5e7eb', animation: 'skeletonPulse 1.5s ease-in-out infinite', animationDelay: `${i * 0.1}s` }} />
            </div>
          ))}
        </div>
        {/* Skeleton table */}
        <div style={{ background: 'white', borderRadius: '12px', border: '1px solid #e5e7eb', overflow: 'hidden' }}>
          <div style={{ padding: '12px 16px', background: '#f9fafb', display: 'flex', gap: '16px' }}>
            {[60, 140, 80, 60, 70, 90, 80].map((w, i) => (
              <div key={i} style={{ width: `${w}px`, height: '12px', borderRadius: '4px', background: '#e5e7eb', animation: 'skeletonPulse 1.5s ease-in-out infinite' }} />
            ))}
          </div>
          {[0, 1, 2, 3, 4].map(i => (
            <div key={i} style={{ padding: '14px 16px', borderTop: '1px solid #f3f4f6', display: 'flex', gap: '16px', alignItems: 'center' }}>
              <div style={{ width: '60px', height: '20px', borderRadius: '12px', background: '#f3f4f6', animation: 'skeletonPulse 1.5s ease-in-out infinite', animationDelay: `${i * 0.08}s` }} />
              <div style={{ flex: 1 }}>
                <div style={{ width: '140px', height: '14px', borderRadius: '4px', background: '#f3f4f6', marginBottom: '6px', animation: 'skeletonPulse 1.5s ease-in-out infinite', animationDelay: `${i * 0.08}s` }} />
                <div style={{ width: '80px', height: '10px', borderRadius: '4px', background: '#f9fafb', animation: 'skeletonPulse 1.5s ease-in-out infinite', animationDelay: `${i * 0.08}s` }} />
              </div>
              <div style={{ width: '80px', height: '14px', borderRadius: '4px', background: '#f3f4f6', animation: 'skeletonPulse 1.5s ease-in-out infinite', animationDelay: `${i * 0.08}s` }} />
              <div style={{ width: '50px', height: '14px', borderRadius: '4px', background: '#f3f4f6', animation: 'skeletonPulse 1.5s ease-in-out infinite', animationDelay: `${i * 0.08}s` }} />
              <div style={{ width: '60px', height: '14px', borderRadius: '4px', background: '#f3f4f6', animation: 'skeletonPulse 1.5s ease-in-out infinite', animationDelay: `${i * 0.08}s` }} />
              <div style={{ width: '70px', height: '14px', borderRadius: '4px', background: '#f3f4f6', animation: 'skeletonPulse 1.5s ease-in-out infinite', animationDelay: `${i * 0.08}s` }} />
              <div style={{ width: '80px', height: '26px', borderRadius: '6px', background: '#f3f4f6', animation: 'skeletonPulse 1.5s ease-in-out infinite', animationDelay: `${i * 0.08}s` }} />
            </div>
          ))}
        </div>
        <style>{`@keyframes skeletonPulse { 0%, 100% { opacity: 1; } 50% { opacity: 0.4; } }`}</style>
      </div>
    );
  }

  if (error && !dashboardData) {
    return (
      <div style={{ padding: '60px', textAlign: 'center' }}>
        <div style={{ marginBottom: '16px' }}>
          <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="#dc2626" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/>
          </svg>
        </div>
        <p style={{ color: '#dc2626', fontWeight: '500', marginBottom: '8px' }}>Error: {error}</p>
        <button
          onClick={fetchDashboardData}
          style={{
            marginTop: '8px', padding: '8px 20px',
            background: '#2563eb', color: 'white', border: 'none',
            borderRadius: '8px', cursor: 'pointer', fontSize: '14px', fontWeight: '500'
          }}
        >
          Retry
        </button>
      </div>
    );
  }

  const stats = dashboardData?.stats || {};
  const recommendations = getFilteredRecommendations();

  const tabs = [
    { id: 'recommendations', label: 'Recommendations', icon: <Package size={16} />, count: stats.total_recommendations },
    { id: 'forecasts', label: 'Forecasts', icon: <BarChart2 size={16} /> },
    { id: 'insights', label: 'AI Insights', icon: <Brain size={16} /> },
    { id: 'history', label: 'Run History', icon: <Clock size={16} /> }
  ];

  return (
    <div style={{ padding: '24px', maxWidth: '1400px', margin: '0 auto' }}>
      {/* Header */}
      <div style={{
        display: 'flex', justifyContent: 'space-between', alignItems: 'center',
        marginBottom: '28px', flexWrap: 'wrap', gap: '16px'
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '14px' }}>
          <div style={{
            width: '42px', height: '42px', borderRadius: '12px',
            background: 'linear-gradient(135deg, #2563eb 0%, #1d4ed8 100%)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            boxShadow: '0 4px 12px rgba(37, 99, 235, 0.3)', flexShrink: 0
          }}>
            <Brain size={22} color="white" />
          </div>
          <div>
            <h1 style={{ fontSize: '24px', fontWeight: '700', margin: 0, color: '#111827' }}>
              Purchasing Intelligence
            </h1>
            <p style={{ color: '#6b7280', margin: '2px 0 0', fontSize: '13px' }}>
              AI-powered analysis and purchasing recommendations
            </p>
          </div>
        </div>
        <div style={{ display: 'flex', gap: '10px', alignItems: 'center' }}>
          {dashboardData?.lastAnalysisAt && (
            <span style={{
              fontSize: '12px', color: '#6b7280',
              background: '#f3f4f6', padding: '4px 10px', borderRadius: '6px'
            }}>
              <Clock size={12} style={{ marginRight: '4px', verticalAlign: '-1px' }} />
              {formatDate(dashboardData.lastAnalysisAt)}
            </span>
          )}
          <button
            onClick={fetchDashboardData}
            disabled={loading}
            style={{
              display: 'flex', alignItems: 'center', gap: '6px',
              padding: '8px 14px', background: 'white', color: '#374151',
              border: '1px solid #d1d5db', borderRadius: '8px',
              cursor: loading ? 'not-allowed' : 'pointer', fontSize: '13px', fontWeight: '500'
            }}
          >
            <RefreshCw size={14} style={loading ? { animation: 'spin 1s linear infinite' } : {}} />
            Refresh
          </button>
          <button
            onClick={exportCsv}
            disabled={!dashboardData?.recommendations?.length}
            style={{
              display: 'flex', alignItems: 'center', gap: '6px',
              padding: '8px 14px', background: 'white', color: '#374151',
              border: '1px solid #d1d5db', borderRadius: '8px',
              cursor: dashboardData?.recommendations?.length ? 'pointer' : 'not-allowed',
              fontSize: '13px', fontWeight: '500',
              opacity: dashboardData?.recommendations?.length ? 1 : 0.5
            }}
          >
            <Download size={14} />
            Export CSV
          </button>
          <button
            onClick={triggerAnalysis}
            disabled={isAnalyzing}
            style={{
              display: 'flex', alignItems: 'center', gap: '6px',
              padding: '8px 16px',
              background: isAnalyzing ? '#9ca3af' : 'linear-gradient(135deg, #2563eb 0%, #1d4ed8 100%)',
              color: 'white', border: 'none', borderRadius: '8px',
              cursor: isAnalyzing ? 'not-allowed' : 'pointer',
              fontSize: '13px', fontWeight: '500',
              boxShadow: isAnalyzing ? 'none' : '0 2px 8px rgba(37, 99, 235, 0.3)'
            }}
          >
            <Activity size={14} style={isAnalyzing ? { animation: 'spin 1s linear infinite' } : {}} />
            {isAnalyzing ? 'Analyzing...' : 'Run Analysis'}
          </button>
        </div>
      </div>

      {/* Summary Cards */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: '16px', marginBottom: '28px' }}>
        <SummaryCard
          icon={<Package size={20} />}
          label="Total Recommendations"
          value={stats.total_recommendations || 0}
          color="#2563eb"
          bgColor="#eff6ff"
        />
        <SummaryCard
          icon={<AlertTriangle size={20} />}
          label="Critical Alerts"
          value={stats.critical_count || 0}
          color="#dc2626"
          bgColor="#fef2f2"
          highlight={stats.critical_count > 0}
        />
        <SummaryCard
          icon={<TrendingUp size={20} />}
          label="Trending Up"
          value={stats.trending_up_count || 0}
          color="#16a34a"
          bgColor="#f0fdf4"
        />
        <SummaryCard
          icon={<TrendingDown size={20} />}
          label="Declining"
          value={stats.trending_down_count || 0}
          color="#f59e0b"
          bgColor="#fffbeb"
        />
        <SummaryCard
          icon={<ShoppingCart size={20} />}
          label="Need Restock"
          value={stats.restock_count || 0}
          color="#8b5cf6"
          bgColor="#f5f3ff"
        />
      </div>

      {/* Tabs */}
      <div style={{
        display: 'flex', gap: '4px', marginBottom: '24px',
        borderBottom: '2px solid #e5e7eb', paddingBottom: 0
      }}>
        {tabs.map(tab => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            style={{
              display: 'flex', alignItems: 'center', gap: '6px',
              padding: '10px 18px',
              background: 'transparent',
              color: activeTab === tab.id ? '#2563eb' : '#6b7280',
              border: 'none',
              borderBottom: activeTab === tab.id ? '2px solid #2563eb' : '2px solid transparent',
              marginBottom: '-2px',
              cursor: 'pointer',
              fontSize: '14px',
              fontWeight: activeTab === tab.id ? '600' : '400',
              transition: 'all 0.15s ease'
            }}
          >
            {tab.icon}
            {tab.label}
            {tab.count > 0 && (
              <span style={{
                background: activeTab === tab.id ? '#2563eb' : '#e5e7eb',
                color: activeTab === tab.id ? 'white' : '#6b7280',
                fontSize: '11px', fontWeight: '600',
                padding: '1px 7px', borderRadius: '10px', minWidth: '18px', textAlign: 'center'
              }}>
                {tab.count}
              </span>
            )}
          </button>
        ))}
      </div>

      {/* Tab Content */}
      {activeTab === 'recommendations' && (
        <div>
          {/* Filter */}
          <div style={{
            marginBottom: '16px', display: 'flex', alignItems: 'center', gap: '8px',
            flexWrap: 'wrap'
          }}>
            <Filter size={14} color="#6b7280" />
            <span style={{ fontSize: '13px', color: '#6b7280', fontWeight: '500' }}>Priority:</span>
            {['all', 'critical', 'high', 'medium', 'low'].map(priority => (
              <button
                key={priority}
                onClick={() => setPriorityFilter(priority)}
                style={{
                  padding: '5px 14px',
                  background: priorityFilter === priority
                    ? (priority === 'all' ? '#2563eb' : priorityConfig[priority]?.color || '#6b7280')
                    : '#f3f4f6',
                  color: priorityFilter === priority ? 'white' : '#374151',
                  border: 'none',
                  borderRadius: '20px',
                  cursor: 'pointer',
                  fontSize: '12px',
                  fontWeight: '500',
                  textTransform: 'capitalize',
                  transition: 'all 0.15s ease'
                }}
              >
                {priority}
              </button>
            ))}
          </div>

          {/* Recommendations Table */}
          {recommendations.length > 0 ? (
            <div style={{
              background: 'white', borderRadius: '12px',
              border: '1px solid #e5e7eb', overflow: 'hidden',
              boxShadow: '0 1px 3px rgba(0,0,0,0.06)'
            }}>
              <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: '700px' }}>
                <thead>
                  <tr style={{ background: '#f9fafb' }}>
                    <th style={tableHeaderStyle}>Priority</th>
                    <th style={tableHeaderStyle}>Product</th>
                    <th style={tableHeaderStyle}>Type</th>
                    <th style={tableHeaderStyle}>Stock</th>
                    <th style={tableHeaderStyle}>Days Left</th>
                    <th style={tableHeaderStyle}>Suggested Order</th>
                    <th style={tableHeaderStyle}>Action</th>
                  </tr>
                </thead>
                <tbody>
                  {recommendations.map((rec, idx) => (
                    <tr
                      key={rec.id || idx}
                      style={{ borderTop: '1px solid #f3f4f6', transition: 'background 0.1s' }}
                      onMouseEnter={e => e.currentTarget.style.background = '#f9fafb'}
                      onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
                    >
                      <td style={tableCellStyle}>
                        <span style={{
                          padding: '3px 10px', borderRadius: '12px',
                          fontSize: '11px', fontWeight: '600',
                          background: priorityConfig[rec.priority]?.bgColor || '#f3f4f6',
                          color: priorityConfig[rec.priority]?.color || '#374151'
                        }}>
                          {rec.priority?.toUpperCase()}
                        </span>
                      </td>
                      <td style={tableCellStyle}>
                        <div style={{ fontWeight: '500', color: '#111827' }}>{rec.product_name}</div>
                        <div style={{ fontSize: '12px', color: '#9ca3af' }}>{rec.sku || 'No SKU'}</div>
                      </td>
                      <td style={tableCellStyle}>
                        <span style={{ textTransform: 'capitalize', fontSize: '13px' }}>
                          {rec.recommendation_type?.replace(/_/g, ' ')}
                        </span>
                      </td>
                      <td style={tableCellStyle}>
                        <span style={{ fontWeight: '500' }}>{rec.current_stock}</span>
                        <span style={{ color: '#9ca3af', fontSize: '12px' }}> units</span>
                      </td>
                      <td style={tableCellStyle}>
                        <span style={{
                          fontWeight: rec.days_of_stock_remaining <= 7 ? '600' : '400',
                          color: rec.days_of_stock_remaining <= 3 ? '#dc2626' :
                                 rec.days_of_stock_remaining <= 7 ? '#ea580c' : '#374151',
                          padding: rec.days_of_stock_remaining <= 7 ? '2px 8px' : '0',
                          background: rec.days_of_stock_remaining <= 3 ? '#fef2f2' :
                                     rec.days_of_stock_remaining <= 7 ? '#fff7ed' : 'transparent',
                          borderRadius: '4px'
                        }}>
                          {rec.days_of_stock_remaining ?? 'N/A'} days
                        </span>
                      </td>
                      <td style={tableCellStyle}>
                        <strong style={{ color: '#111827' }}>{rec.suggested_quantity}</strong>
                        <span style={{ color: '#9ca3af', fontSize: '12px' }}> units</span>
                      </td>
                      <td style={tableCellStyle}>
                        <button
                          onClick={() => acknowledgeRecommendation(rec.id)}
                          style={{
                            display: 'flex', alignItems: 'center', gap: '4px',
                            padding: '5px 12px', background: '#10b981',
                            color: 'white', border: 'none', borderRadius: '6px',
                            cursor: 'pointer', fontSize: '12px', fontWeight: '500',
                            transition: 'background 0.15s'
                          }}
                          onMouseEnter={e => e.currentTarget.style.background = '#059669'}
                          onMouseLeave={e => e.currentTarget.style.background = '#10b981'}
                        >
                          <CheckCircle size={13} />
                          Acknowledge
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              </div>
            </div>
          ) : (
            <EmptyState
              icon={<Package size={40} color="#d1d5db" />}
              title="No recommendations at this time"
              subtitle="Run an analysis to generate new purchasing recommendations."
              actionLabel="Run Analysis Now"
              onAction={triggerAnalysis}
            />
          )}
        </div>
      )}

      {activeTab === 'forecasts' && (
        <div style={{
          background: 'white', borderRadius: '12px',
          border: '1px solid #e5e7eb', overflow: 'hidden',
          boxShadow: '0 1px 3px rgba(0,0,0,0.06)'
        }}>
          <div style={{
            padding: '16px 20px', borderBottom: '1px solid #f3f4f6',
            display: 'flex', alignItems: 'center', justifyContent: 'space-between'
          }}>
            <h3 style={{ margin: 0, fontSize: '15px', fontWeight: '600', color: '#111827', display: 'flex', alignItems: 'center', gap: '8px' }}>
              <BarChart2 size={18} color="#2563eb" />
              Demand Forecasts
            </h3>
            <button
              onClick={fetchForecasts}
              disabled={forecastsLoading}
              style={{
                display: 'flex', alignItems: 'center', gap: '4px',
                padding: '5px 10px', background: '#f3f4f6',
                border: 'none', borderRadius: '6px', cursor: 'pointer',
                fontSize: '12px', color: '#6b7280'
              }}
            >
              <RefreshCw size={12} style={forecastsLoading ? { animation: 'spin 1s linear infinite' } : {}} />
              Refresh
            </button>
          </div>
          {forecastsLoading ? (
            <div style={{ padding: '40px', textAlign: 'center', color: '#6b7280' }}>
              <RefreshCw size={20} style={{ animation: 'spin 1s linear infinite', marginBottom: '8px' }} />
              <p style={{ margin: 0, fontSize: '14px' }}>Loading forecasts...</p>
            </div>
          ) : forecasts.length > 0 ? (
            <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: '500px' }}>
              <thead>
                <tr style={{ background: '#f9fafb' }}>
                  <th style={tableHeaderStyle}>Product</th>
                  <th style={tableHeaderStyle}>Predicted Demand</th>
                  <th style={tableHeaderStyle}>Confidence</th>
                  <th style={tableHeaderStyle}>Forecast Date</th>
                </tr>
              </thead>
              <tbody>
                {forecasts.map((f, idx) => (
                  <tr
                    key={f.id || idx}
                    style={{ borderTop: '1px solid #f3f4f6', transition: 'background 0.1s' }}
                    onMouseEnter={e => e.currentTarget.style.background = '#f9fafb'}
                    onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
                  >
                    <td style={tableCellStyle}>
                      <div style={{ fontWeight: '500', color: '#111827' }}>{f.product_name}</div>
                      <div style={{ fontSize: '12px', color: '#9ca3af' }}>{f.sku || ''}</div>
                    </td>
                    <td style={tableCellStyle}>
                      <strong style={{ color: '#111827' }}>{Math.round(f.predicted_demand || 0)}</strong>
                      <span style={{ color: '#9ca3af', fontSize: '12px' }}> units</span>
                    </td>
                    <td style={tableCellStyle}>
                      <ConfidenceBadge score={f.confidence_score} />
                    </td>
                    <td style={tableCellStyle}>
                      {formatDate(f.forecast_date)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            </div>
          ) : (
            <EmptyState
              icon={<BarChart2 size={40} color="#d1d5db" />}
              title="No forecasts available"
              subtitle="Run an analysis to generate demand forecasts."
              actionLabel="Run Analysis Now"
              onAction={triggerAnalysis}
            />
          )}
        </div>
      )}

      {activeTab === 'insights' && (
        <div style={{
          background: 'white', borderRadius: '12px',
          border: '1px solid #e5e7eb', padding: '24px',
          boxShadow: '0 1px 3px rgba(0,0,0,0.06)'
        }}>
          <h3 style={{
            margin: '0 0 16px 0', display: 'flex', alignItems: 'center', gap: '8px',
            fontSize: '15px', fontWeight: '600', color: '#111827'
          }}>
            <div style={{
              width: '28px', height: '28px', borderRadius: '8px',
              background: '#eff6ff', display: 'flex', alignItems: 'center', justifyContent: 'center'
            }}>
              <Brain size={16} color="#2563eb" />
            </div>
            AI Analysis Summary
          </h3>
          {dashboardData?.aiSummary ? (
            <div style={{
              background: '#f8fafc',
              borderLeft: '4px solid #2563eb',
              padding: '20px',
              borderRadius: '0 10px 10px 0',
              whiteSpace: 'pre-wrap',
              lineHeight: '1.7',
              fontSize: '14px',
              color: '#374151'
            }}>
              {dashboardData.aiSummary}
            </div>
          ) : (
            <EmptyState
              icon={<Brain size={40} color="#d1d5db" />}
              title="No AI insights available yet"
              subtitle="Run an analysis to generate AI-powered purchasing insights."
              actionLabel="Run Analysis Now"
              onAction={triggerAnalysis}
            />
          )}
        </div>
      )}

      {activeTab === 'history' && (
        <div style={{
          background: 'white', borderRadius: '12px',
          border: '1px solid #e5e7eb', overflow: 'hidden',
          boxShadow: '0 1px 3px rgba(0,0,0,0.06)'
        }}>
          {dashboardData?.recentRuns?.length > 0 ? (
            <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: '600px' }}>
              <thead>
                <tr style={{ background: '#f9fafb' }}>
                  <th style={tableHeaderStyle}>Date</th>
                  <th style={tableHeaderStyle}>Type</th>
                  <th style={tableHeaderStyle}>Status</th>
                  <th style={tableHeaderStyle}>Products Analyzed</th>
                  <th style={tableHeaderStyle}>Recommendations</th>
                  <th style={tableHeaderStyle}>Email Sent</th>
                </tr>
              </thead>
              <tbody>
                {dashboardData.recentRuns.map((run, idx) => (
                  <tr
                    key={run.id || idx}
                    style={{ borderTop: '1px solid #f3f4f6', transition: 'background 0.1s' }}
                    onMouseEnter={e => e.currentTarget.style.background = '#f9fafb'}
                    onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
                  >
                    <td style={tableCellStyle}>{formatDate(run.started_at)}</td>
                    <td style={tableCellStyle}>
                      <span style={{
                        textTransform: 'capitalize', fontSize: '13px',
                        padding: '2px 8px', background: '#f3f4f6',
                        borderRadius: '4px', fontWeight: '500'
                      }}>
                        {run.run_type}
                      </span>
                    </td>
                    <td style={tableCellStyle}>
                      <span style={{
                        padding: '3px 10px', borderRadius: '12px',
                        fontSize: '11px', fontWeight: '600',
                        background: run.status === 'completed' ? '#f0fdf4' :
                                   run.status === 'running' ? '#eff6ff' : '#fef2f2',
                        color: run.status === 'completed' ? '#16a34a' :
                               run.status === 'running' ? '#2563eb' : '#dc2626'
                      }}>
                        {run.status === 'completed' && <CheckCircle size={11} style={{ marginRight: '3px', verticalAlign: '-1px' }} />}
                        {run.status}
                      </span>
                    </td>
                    <td style={tableCellStyle}>
                      <span style={{ fontWeight: '500' }}>{run.products_analyzed || 0}</span>
                    </td>
                    <td style={tableCellStyle}>
                      <span style={{ fontWeight: '500' }}>{run.recommendations_generated || 0}</span>
                    </td>
                    <td style={tableCellStyle}>
                      {run.email_sent ? (
                        <CheckCircle size={16} color="#16a34a" />
                      ) : (
                        <span style={{ color: '#d1d5db' }}>--</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            </div>
          ) : (
            <EmptyState
              icon={<Clock size={40} color="#d1d5db" />}
              title="No analysis runs yet"
              subtitle="Run your first analysis to see history here."
              actionLabel="Run Analysis Now"
              onAction={triggerAnalysis}
            />
          )}
        </div>
      )}

      <style>{`@keyframes spin { to { transform: rotate(360deg); } } @keyframes skeletonPulse { 0%, 100% { opacity: 1; } 50% { opacity: 0.4; } }`}</style>
    </div>
  );
};

// Summary Card Component
const SummaryCard = ({ icon, label, value, color, bgColor, highlight }) => (
  <div style={{
    background: highlight ? '#fef2f2' : 'white',
    padding: '20px',
    borderRadius: '12px',
    border: `1px solid ${highlight ? '#fecaca' : '#e5e7eb'}`,
    boxShadow: '0 1px 3px rgba(0,0,0,0.06)',
    transition: 'transform 0.15s ease, box-shadow 0.15s ease'
  }}
    onMouseEnter={e => { e.currentTarget.style.transform = 'translateY(-1px)'; e.currentTarget.style.boxShadow = '0 4px 12px rgba(0,0,0,0.08)'; }}
    onMouseLeave={e => { e.currentTarget.style.transform = 'translateY(0)'; e.currentTarget.style.boxShadow = '0 1px 3px rgba(0,0,0,0.06)'; }}
  >
    <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '12px' }}>
      <div style={{
        width: '36px', height: '36px', borderRadius: '10px',
        background: bgColor || '#f3f4f6',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        color
      }}>
        {icon}
      </div>
      <span style={{ fontSize: '13px', color: '#6b7280', fontWeight: '500' }}>{label}</span>
    </div>
    <div style={{ fontSize: '28px', fontWeight: '700', color: highlight ? '#dc2626' : '#111827' }}>
      {value}
    </div>
  </div>
);

// Empty State Component
const EmptyState = ({ icon, title, subtitle, actionLabel, onAction }) => (
  <div style={{
    textAlign: 'center', padding: '48px 20px', color: '#6b7280'
  }}>
    <div style={{ marginBottom: '12px', opacity: 0.6 }}>{icon}</div>
    <p style={{ fontWeight: '500', margin: '0 0 4px', color: '#374151' }}>{title}</p>
    <p style={{ fontSize: '13px', margin: 0 }}>{subtitle}</p>
    {actionLabel && onAction && (
      <button
        onClick={onAction}
        style={{
          marginTop: '16px', display: 'inline-flex', alignItems: 'center', gap: '6px',
          padding: '8px 18px',
          background: 'linear-gradient(135deg, #2563eb 0%, #1d4ed8 100%)',
          color: 'white', border: 'none', borderRadius: '8px',
          cursor: 'pointer', fontSize: '13px', fontWeight: '500',
          boxShadow: '0 2px 8px rgba(37, 99, 235, 0.3)',
          transition: 'opacity 0.15s ease'
        }}
      >
        <Activity size={14} />
        {actionLabel}
      </button>
    )}
  </div>
);

// Confidence Badge Component
const ConfidenceBadge = ({ score }) => {
  const pct = Math.round((score || 0) * 100);
  const color = pct >= 80 ? '#16a34a' : pct >= 50 ? '#f59e0b' : '#dc2626';
  const bg = pct >= 80 ? '#f0fdf4' : pct >= 50 ? '#fffbeb' : '#fef2f2';
  return (
    <span style={{
      padding: '3px 10px', borderRadius: '12px',
      fontSize: '11px', fontWeight: '600',
      background: bg, color
    }}>
      {pct}%
    </span>
  );
};

// Table Styles
const tableHeaderStyle = {
  padding: '12px 16px',
  textAlign: 'left',
  fontSize: '11px',
  fontWeight: '600',
  color: '#6b7280',
  textTransform: 'uppercase',
  letterSpacing: '0.05em'
};

const tableCellStyle = {
  padding: '12px 16px',
  fontSize: '13px',
  color: '#374151'
};

export default PurchasingIntelligence;
