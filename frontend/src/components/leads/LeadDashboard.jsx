import { authFetch } from '../../services/authFetch';
/**
 * LeadDashboard - Analytics dashboard for leads
 * Shows funnel visualization, conversion rates, source breakdown, and trends
 */

import React, { useState, useEffect, useMemo } from 'react';
import { useToast } from '../ui/Toast';

const API_BASE = `${process.env.REACT_APP_API_URL || 'http://localhost:3001'}/api`;

function LeadDashboard({ onClose }) {
  const toast = useToast();
  const [stats, setStats] = useState(null);
  const [leads, setLeads] = useState([]);
  const [loading, setLoading] = useState(true);
  const [dateRange, setDateRange] = useState('30'); // days

  useEffect(() => {
    fetchDashboardData();
  }, [dateRange]);

  const fetchDashboardData = async () => {
    setLoading(true);
    try {
      const [statsRes, leadsRes] = await Promise.all([
        authFetch(`${API_BASE}/leads/stats`, {
          headers: { 'Authorization': `Bearer ${localStorage.getItem('auth_token')}` }
        }),
        authFetch(`${API_BASE}/leads?limit=1000`, {
          headers: { 'Authorization': `Bearer ${localStorage.getItem('auth_token')}` }
        })
      ]);

      if (statsRes.ok) {
        const statsData = await statsRes.json();
        setStats(statsData.data || statsData);
      }

      if (leadsRes.ok) {
        const leadsData = await leadsRes.json();
        setLeads(leadsData.data || leadsData.leads || []);
      }
    } catch (error) {
      toast.error('Failed to load dashboard data');
    } finally {
      setLoading(false);
    }
  };

  // Calculate metrics from leads data
  const metrics = useMemo(() => {
    if (!leads || leads.length === 0) {
      return {
        total: 0,
        byStatus: {},
        bySource: {},
        byPriority: {},
        conversionRate: 0,
        avgTimeToConvert: 0,
        recentTrend: []
      };
    }

    const now = new Date();
    const cutoffDate = new Date(now.getTime() - parseInt(dateRange) * 24 * 60 * 60 * 1000);
    const filteredLeads = leads.filter(l => new Date(l.created_at) >= cutoffDate);

    // Status breakdown
    const byStatus = filteredLeads.reduce((acc, lead) => {
      acc[lead.status] = (acc[lead.status] || 0) + 1;
      return acc;
    }, {});

    // Source breakdown
    const bySource = filteredLeads.reduce((acc, lead) => {
      const source = lead.lead_source || 'unknown';
      acc[source] = (acc[source] || 0) + 1;
      return acc;
    }, {});

    // Priority breakdown
    const byPriority = filteredLeads.reduce((acc, lead) => {
      acc[lead.priority] = (acc[lead.priority] || 0) + 1;
      return acc;
    }, {});

    // Conversion rate
    const converted = filteredLeads.filter(l => l.status === 'converted').length;
    const conversionRate = filteredLeads.length > 0
      ? ((converted / filteredLeads.length) * 100).toFixed(1)
      : 0;

    // Daily trend (last 7 days)
    const recentTrend = [];
    for (let i = 6; i >= 0; i--) {
      const date = new Date(now.getTime() - i * 24 * 60 * 60 * 1000);
      date.setHours(0, 0, 0, 0);
      const nextDate = new Date(date.getTime() + 24 * 60 * 60 * 1000);

      const count = leads.filter(l => {
        const created = new Date(l.created_at);
        return created >= date && created < nextDate;
      }).length;

      recentTrend.push({
        date: date.toLocaleDateString('en-CA', { weekday: 'short' }),
        count
      });
    }

    return {
      total: filteredLeads.length,
      byStatus,
      bySource,
      byPriority,
      conversionRate,
      recentTrend
    };
  }, [leads, dateRange]);

  // Funnel data
  const funnelData = useMemo(() => {
    const statuses = ['new', 'contacted', 'qualified', 'quote_created', 'converted'];
    const statusLabels = {
      new: 'New',
      contacted: 'Contacted',
      qualified: 'Qualified',
      quote_created: 'Quote Created',
      converted: 'Converted'
    };

    let cumulative = metrics.total;
    return statuses.map(status => {
      const count = metrics.byStatus[status] || 0;
      const percentage = metrics.total > 0 ? ((count / metrics.total) * 100).toFixed(0) : 0;
      return {
        status,
        label: statusLabels[status],
        count,
        percentage,
        cumulative
      };
    });
  }, [metrics]);

  if (loading) {
    return (
      <div className="lead-dashboard">
        <div className="dashboard-header">
          <h2>Lead Analytics</h2>
          <button className="btn btn-secondary" onClick={onClose}>Close</button>
        </div>
        <div className="loading-state">
          <div className="loading-spinner"></div>
          <p>Loading analytics...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="lead-dashboard">
      <div className="dashboard-header">
        <div>
          <h2>Lead Analytics Dashboard</h2>
          <p className="dashboard-subtitle">Performance insights and metrics</p>
        </div>
        <div className="dashboard-actions">
          <select
            value={dateRange}
            onChange={(e) => setDateRange(e.target.value)}
            className="date-range-select"
          >
            <option value="7">Last 7 days</option>
            <option value="30">Last 30 days</option>
            <option value="90">Last 90 days</option>
            <option value="365">Last year</option>
          </select>
          <button className="btn btn-secondary" onClick={onClose}>Close</button>
        </div>
      </div>

      {/* Key Metrics Row */}
      <div className="metrics-row">
        <div className="metric-card">
          <div className="metric-value">{metrics.total}</div>
          <div className="metric-label">Total Leads</div>
        </div>
        <div className="metric-card highlight-green">
          <div className="metric-value">{metrics.conversionRate}%</div>
          <div className="metric-label">Conversion Rate</div>
        </div>
        <div className="metric-card highlight-blue">
          <div className="metric-value">{metrics.byStatus['new'] || 0}</div>
          <div className="metric-label">New Leads</div>
        </div>
        <div className="metric-card highlight-orange">
          <div className="metric-value">{metrics.byPriority['hot'] || 0}</div>
          <div className="metric-label">Hot Leads</div>
        </div>
      </div>

      {/* Charts Row */}
      <div className="charts-row">
        {/* Funnel Chart */}
        <div className="chart-card funnel-chart">
          <h3>Lead Funnel</h3>
          <div className="funnel-container">
            {funnelData.map((stage, index) => (
              <div
                key={stage.status}
                className="funnel-stage"
                style={{
                  '--stage-width': `${100 - (index * 15)}%`,
                  '--stage-color': getFunnelColor(stage.status)
                }}
              >
                <div className="funnel-bar">
                  <span className="funnel-label">{stage.label}</span>
                  <span className="funnel-count">{stage.count}</span>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Source Breakdown */}
        <div className="chart-card source-chart">
          <h3>Lead Sources</h3>
          <div className="source-bars">
            {Object.entries(metrics.bySource)
              .sort((a, b) => b[1] - a[1])
              .slice(0, 6)
              .map(([source, count]) => (
                <div key={source} className="source-bar-item">
                  <div className="source-bar-header">
                    <span className="source-name">{formatSource(source)}</span>
                    <span className="source-count">{count}</span>
                  </div>
                  <div className="source-bar-track">
                    <div
                      className="source-bar-fill"
                      style={{ width: `${(count / metrics.total) * 100}%` }}
                    />
                  </div>
                </div>
              ))}
          </div>
        </div>
      </div>

      {/* Trend Chart */}
      <div className="chart-card trend-chart">
        <h3>Lead Trend (Last 7 Days)</h3>
        <div className="trend-container">
          <div className="trend-bars">
            {metrics.recentTrend.map((day, index) => (
              <div key={index} className="trend-bar-item">
                <div
                  className="trend-bar"
                  style={{
                    height: `${Math.max(10, (day.count / Math.max(...metrics.recentTrend.map(d => d.count), 1)) * 100)}%`
                  }}
                >
                  <span className="trend-count">{day.count}</span>
                </div>
                <span className="trend-label">{day.date}</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Priority & Status Breakdown */}
      <div className="charts-row">
        <div className="chart-card">
          <h3>By Priority</h3>
          <div className="priority-breakdown">
            <PriorityBar label="Hot" count={metrics.byPriority['hot'] || 0} total={metrics.total} color="#dc2626" />
            <PriorityBar label="Warm" count={metrics.byPriority['warm'] || 0} total={metrics.total} color="#d97706" />
            <PriorityBar label="Cold" count={metrics.byPriority['cold'] || 0} total={metrics.total} color="#6b7280" />
          </div>
        </div>

        <div className="chart-card">
          <h3>By Status</h3>
          <div className="status-breakdown">
            {Object.entries(metrics.byStatus).map(([status, count]) => (
              <div key={status} className="status-item">
                <span className={`status-dot status-${status}`}></span>
                <span className="status-name">{formatStatus(status)}</span>
                <span className="status-count">{count}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

// Helper Components
function PriorityBar({ label, count, total, color }) {
  const percentage = total > 0 ? ((count / total) * 100).toFixed(0) : 0;
  return (
    <div className="priority-bar-item">
      <div className="priority-bar-header">
        <span style={{ color }}>{label}</span>
        <span>{count} ({percentage}%)</span>
      </div>
      <div className="priority-bar-track">
        <div
          className="priority-bar-fill"
          style={{ width: `${percentage}%`, background: color }}
        />
      </div>
    </div>
  );
}

// Helper Functions
function getFunnelColor(status) {
  const colors = {
    new: '#3b82f6',
    contacted: '#8b5cf6',
    qualified: '#10b981',
    quote_created: '#f59e0b',
    converted: '#22c55e'
  };
  return colors[status] || '#6b7280';
}

function formatSource(source) {
  const labels = {
    walk_in: 'Walk-in',
    phone: 'Phone',
    email: 'Email',
    website: 'Website',
    referral: 'Referral',
    social_media: 'Social Media',
    advertisement: 'Advertisement',
    realtor: 'Realtor',
    builder: 'Builder',
    other: 'Other',
    unknown: 'Unknown'
  };
  return labels[source] || source;
}

function formatStatus(status) {
  const labels = {
    new: 'New',
    contacted: 'Contacted',
    qualified: 'Qualified',
    quote_created: 'Quote Created',
    converted: 'Converted',
    lost: 'Lost'
  };
  return labels[status] || status;
}

export default LeadDashboard;
