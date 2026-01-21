import React, { useState, useEffect, useRef } from 'react';
import {
  Package, TrendingUp, TrendingDown, AlertTriangle, RefreshCw, CheckCircle,
  BarChart2, Brain, Clock, ShoppingCart, ChevronRight, Filter
} from 'lucide-react';
import { cachedFetch } from '../../services/apiCache';

const API_BASE = `${process.env.REACT_APP_API_URL || 'http://localhost:3001'}/api`;

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

  const isMounted = useRef(true);
  const loadedOnce = useRef(false);

  useEffect(() => {
    isMounted.current = true;

    if (!loadedOnce.current) {
      loadedOnce.current = true;
      fetchDashboardData();
    }

    return () => {
      isMounted.current = false;
    };
  }, []);

  const fetchDashboardData = async () => {
    if (!isMounted.current) return;

    setLoading(true);
    setError(null);

    try {
      const token = localStorage.getItem('auth_token');
      const response = await fetch(`${API_BASE}/purchasing-intelligence/dashboard`, {
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
  };

  const triggerAnalysis = async () => {
    setIsAnalyzing(true);
    try {
      const token = localStorage.getItem('auth_token');
      const response = await fetch(`${API_BASE}/purchasing-intelligence/analyze`, {
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
      await fetch(`${API_BASE}/purchasing-intelligence/recommendations/${recommendationId}/acknowledge`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        }
      });

      // Refresh data
      fetchDashboardData();
    } catch (err) {
      console.error('Acknowledge error:', err);
    }
  };

  const formatCurrency = (value) => {
    if (value === null || value === undefined || isNaN(value)) return '$0.00';
    return `$${parseFloat(value).toLocaleString('en-CA', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
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

  if (loading && !dashboardData) {
    return (
      <div style={{ padding: '40px', textAlign: 'center' }}>
        <RefreshCw style={{ animation: 'spin 1s linear infinite', marginBottom: '10px' }} size={24} />
        <p>Loading purchasing intelligence data...</p>
        <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
      </div>
    );
  }

  if (error && !dashboardData) {
    return (
      <div style={{ padding: '40px', textAlign: 'center', color: '#dc2626' }}>
        <AlertTriangle size={24} style={{ marginBottom: '10px' }} />
        <p>Error: {error}</p>
        <button
          onClick={fetchDashboardData}
          style={{
            marginTop: '10px',
            padding: '8px 16px',
            background: '#2563eb',
            color: 'white',
            border: 'none',
            borderRadius: '6px',
            cursor: 'pointer'
          }}
        >
          Retry
        </button>
      </div>
    );
  }

  const stats = dashboardData?.stats || {};
  const recommendations = getFilteredRecommendations();

  return (
    <div style={{ padding: '20px', maxWidth: '1400px', margin: '0 auto' }}>
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '24px' }}>
        <div>
          <h1 style={{ fontSize: '24px', fontWeight: '600', margin: 0, display: 'flex', alignItems: 'center', gap: '10px' }}>
            <Brain size={28} color="#2563eb" />
            Purchasing Intelligence
          </h1>
          <p style={{ color: '#6b7280', margin: '4px 0 0 0' }}>
            AI-powered analysis and recommendations
          </p>
        </div>
        <div style={{ display: 'flex', gap: '10px', alignItems: 'center' }}>
          {dashboardData?.lastAnalysisAt && (
            <span style={{ fontSize: '12px', color: '#6b7280' }}>
              Last updated: {formatDate(dashboardData.lastAnalysisAt)}
            </span>
          )}
          <button
            onClick={triggerAnalysis}
            disabled={isAnalyzing}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              padding: '10px 16px',
              background: isAnalyzing ? '#9ca3af' : '#2563eb',
              color: 'white',
              border: 'none',
              borderRadius: '6px',
              cursor: isAnalyzing ? 'not-allowed' : 'pointer',
              fontSize: '14px'
            }}
          >
            <RefreshCw size={16} style={isAnalyzing ? { animation: 'spin 1s linear infinite' } : {}} />
            {isAnalyzing ? 'Analyzing...' : 'Run Analysis'}
          </button>
        </div>
      </div>

      {/* Summary Cards */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '16px', marginBottom: '24px' }}>
        <SummaryCard
          icon={<Package size={20} />}
          label="Total Recommendations"
          value={stats.total_recommendations || 0}
          color="#2563eb"
        />
        <SummaryCard
          icon={<AlertTriangle size={20} />}
          label="Critical Alerts"
          value={stats.critical_count || 0}
          color="#dc2626"
          highlight={stats.critical_count > 0}
        />
        <SummaryCard
          icon={<TrendingUp size={20} />}
          label="Trending Up"
          value={stats.trending_up_count || 0}
          color="#16a34a"
        />
        <SummaryCard
          icon={<TrendingDown size={20} />}
          label="Declining"
          value={stats.trending_down_count || 0}
          color="#f59e0b"
        />
        <SummaryCard
          icon={<ShoppingCart size={20} />}
          label="Need Restock"
          value={stats.restock_count || 0}
          color="#8b5cf6"
        />
      </div>

      {/* Tabs */}
      <div style={{ display: 'flex', gap: '8px', marginBottom: '20px', borderBottom: '1px solid #e5e7eb', paddingBottom: '8px' }}>
        {[
          { id: 'recommendations', label: 'Recommendations', icon: <Package size={16} /> },
          { id: 'insights', label: 'AI Insights', icon: <Brain size={16} /> },
          { id: 'history', label: 'Run History', icon: <Clock size={16} /> }
        ].map(tab => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              padding: '10px 16px',
              background: activeTab === tab.id ? '#2563eb' : 'transparent',
              color: activeTab === tab.id ? 'white' : '#6b7280',
              border: 'none',
              borderRadius: '6px',
              cursor: 'pointer',
              fontSize: '14px',
              fontWeight: activeTab === tab.id ? '500' : '400'
            }}
          >
            {tab.icon}
            {tab.label}
          </button>
        ))}
      </div>

      {/* Tab Content */}
      {activeTab === 'recommendations' && (
        <div>
          {/* Filter */}
          <div style={{ marginBottom: '16px', display: 'flex', alignItems: 'center', gap: '10px' }}>
            <Filter size={16} color="#6b7280" />
            <span style={{ fontSize: '14px', color: '#6b7280' }}>Priority:</span>
            {['all', 'critical', 'high', 'medium', 'low'].map(priority => (
              <button
                key={priority}
                onClick={() => setPriorityFilter(priority)}
                style={{
                  padding: '4px 12px',
                  background: priorityFilter === priority ?
                    (priority === 'all' ? '#2563eb' : priorityConfig[priority]?.color || '#6b7280') :
                    '#f3f4f6',
                  color: priorityFilter === priority ? 'white' : '#374151',
                  border: 'none',
                  borderRadius: '20px',
                  cursor: 'pointer',
                  fontSize: '12px',
                  textTransform: 'capitalize'
                }}
              >
                {priority}
              </button>
            ))}
          </div>

          {/* Recommendations Table */}
          {recommendations.length > 0 ? (
            <div style={{ background: 'white', borderRadius: '8px', border: '1px solid #e5e7eb', overflow: 'hidden' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse' }}>
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
                    <tr key={rec.id || idx} style={{ borderTop: '1px solid #e5e7eb' }}>
                      <td style={tableCellStyle}>
                        <span style={{
                          padding: '2px 10px',
                          borderRadius: '12px',
                          fontSize: '11px',
                          fontWeight: '600',
                          background: priorityConfig[rec.priority]?.bgColor || '#f3f4f6',
                          color: priorityConfig[rec.priority]?.color || '#374151'
                        }}>
                          {rec.priority?.toUpperCase()}
                        </span>
                      </td>
                      <td style={tableCellStyle}>
                        <div style={{ fontWeight: '500' }}>{rec.product_name}</div>
                        <div style={{ fontSize: '12px', color: '#6b7280' }}>{rec.sku || 'No SKU'}</div>
                      </td>
                      <td style={tableCellStyle}>
                        <span style={{ textTransform: 'capitalize' }}>
                          {rec.recommendation_type?.replace('_', ' ')}
                        </span>
                      </td>
                      <td style={tableCellStyle}>
                        {rec.current_stock} units
                      </td>
                      <td style={tableCellStyle}>
                        <span style={{
                          fontWeight: rec.days_of_stock_remaining <= 7 ? '600' : '400',
                          color: rec.days_of_stock_remaining <= 3 ? '#dc2626' :
                                 rec.days_of_stock_remaining <= 7 ? '#ea580c' : '#374151'
                        }}>
                          {rec.days_of_stock_remaining ?? 'N/A'} days
                        </span>
                      </td>
                      <td style={tableCellStyle}>
                        <strong>{rec.suggested_quantity}</strong> units
                      </td>
                      <td style={tableCellStyle}>
                        <button
                          onClick={() => acknowledgeRecommendation(rec.id)}
                          style={{
                            display: 'flex',
                            alignItems: 'center',
                            gap: '4px',
                            padding: '4px 10px',
                            background: '#10b981',
                            color: 'white',
                            border: 'none',
                            borderRadius: '4px',
                            cursor: 'pointer',
                            fontSize: '12px'
                          }}
                        >
                          <CheckCircle size={14} />
                          Done
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <div style={{ textAlign: 'center', padding: '40px', color: '#6b7280' }}>
              <Package size={40} style={{ marginBottom: '10px', opacity: 0.5 }} />
              <p>No recommendations at this time.</p>
              <p style={{ fontSize: '14px' }}>Run an analysis to generate new recommendations.</p>
            </div>
          )}
        </div>
      )}

      {activeTab === 'insights' && (
        <div style={{ background: 'white', borderRadius: '8px', border: '1px solid #e5e7eb', padding: '24px' }}>
          <h3 style={{ margin: '0 0 16px 0', display: 'flex', alignItems: 'center', gap: '8px' }}>
            <Brain size={20} color="#2563eb" />
            AI Analysis Summary
          </h3>
          {dashboardData?.aiSummary ? (
            <div style={{
              background: '#eff6ff',
              borderLeft: '4px solid #2563eb',
              padding: '16px',
              borderRadius: '0 8px 8px 0',
              whiteSpace: 'pre-wrap',
              lineHeight: '1.6'
            }}>
              {dashboardData.aiSummary}
            </div>
          ) : (
            <div style={{ textAlign: 'center', padding: '40px', color: '#6b7280' }}>
              <Brain size={40} style={{ marginBottom: '10px', opacity: 0.5 }} />
              <p>No AI insights available yet.</p>
              <p style={{ fontSize: '14px' }}>Run an analysis to generate AI-powered insights.</p>
            </div>
          )}
        </div>
      )}

      {activeTab === 'history' && (
        <div style={{ background: 'white', borderRadius: '8px', border: '1px solid #e5e7eb', overflow: 'hidden' }}>
          {dashboardData?.recentRuns?.length > 0 ? (
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
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
                  <tr key={run.id || idx} style={{ borderTop: '1px solid #e5e7eb' }}>
                    <td style={tableCellStyle}>{formatDate(run.started_at)}</td>
                    <td style={tableCellStyle}>
                      <span style={{ textTransform: 'capitalize' }}>{run.run_type}</span>
                    </td>
                    <td style={tableCellStyle}>
                      <span style={{
                        padding: '2px 10px',
                        borderRadius: '12px',
                        fontSize: '11px',
                        fontWeight: '500',
                        background: run.status === 'completed' ? '#f0fdf4' :
                                   run.status === 'running' ? '#eff6ff' : '#fef2f2',
                        color: run.status === 'completed' ? '#16a34a' :
                               run.status === 'running' ? '#2563eb' : '#dc2626'
                      }}>
                        {run.status}
                      </span>
                    </td>
                    <td style={tableCellStyle}>{run.products_analyzed || 0}</td>
                    <td style={tableCellStyle}>{run.recommendations_generated || 0}</td>
                    <td style={tableCellStyle}>
                      {run.email_sent ? (
                        <CheckCircle size={16} color="#16a34a" />
                      ) : (
                        <span style={{ color: '#9ca3af' }}>-</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : (
            <div style={{ textAlign: 'center', padding: '40px', color: '#6b7280' }}>
              <Clock size={40} style={{ marginBottom: '10px', opacity: 0.5 }} />
              <p>No analysis runs yet.</p>
            </div>
          )}
        </div>
      )}
    </div>
  );
};

// Summary Card Component
const SummaryCard = ({ icon, label, value, color, highlight }) => (
  <div style={{
    background: highlight ? '#fef2f2' : 'white',
    padding: '20px',
    borderRadius: '8px',
    border: `1px solid ${highlight ? '#fecaca' : '#e5e7eb'}`,
    boxShadow: '0 1px 3px rgba(0,0,0,0.05)'
  }}>
    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '8px' }}>
      <span style={{ color }}>{icon}</span>
      <span style={{ fontSize: '13px', color: '#6b7280' }}>{label}</span>
    </div>
    <div style={{ fontSize: '28px', fontWeight: '600', color: highlight ? '#dc2626' : '#1f2937' }}>
      {value}
    </div>
  </div>
);

// Table Styles
const tableHeaderStyle = {
  padding: '12px 16px',
  textAlign: 'left',
  fontSize: '12px',
  fontWeight: '600',
  color: '#6b7280',
  textTransform: 'uppercase'
};

const tableCellStyle = {
  padding: '12px 16px',
  fontSize: '14px',
  color: '#374151'
};

export default PurchasingIntelligence;
