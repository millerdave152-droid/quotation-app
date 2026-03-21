/**
 * LeadDashboard — Analytics dashboard for leads
 * Shows funnel, conversion rates, source breakdown, trends, priority ring, response metrics
 */

import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { authFetch } from '../../services/authFetch';
import { useToast } from '../ui/Toast';

const API_BASE = `${process.env.REACT_APP_API_URL || ''}/api`;

// ─── Source colors ──────────────────────────────────────────

const SOURCE_COLORS = {
  walk_in: '#8b5cf6',
  phone: '#3b82f6',
  email: '#06b6d4',
  website: '#10b981',
  referral: '#f59e0b',
  social_media: '#ec4899',
  advertisement: '#f97316',
  realtor: '#14b8a6',
  builder: '#6366f1',
  other: '#6b7280',
  unknown: '#9ca3af',
};

const SOURCE_LABELS = {
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
  unknown: 'Unknown',
};

const FUNNEL_COLORS = ['#818cf8', '#60a5fa', '#34d399', '#fbbf24', '#4ade80'];

const STATUS_LABELS = {
  new: 'New',
  contacted: 'Contacted',
  qualified: 'Qualified',
  quote_created: 'Quote Created',
  converted: 'Converted',
  lost: 'Lost',
};

const STATUS_COLORS = {
  new: '#8b5cf6',
  contacted: '#3b82f6',
  qualified: '#10b981',
  quote_created: '#f59e0b',
  converted: '#22c55e',
  lost: '#ef4444',
};

const PRIORITY_COLORS = {
  hot: '#ef4444',
  warm: '#f59e0b',
  cold: '#6b7280',
};

// ─── Component ──────────────────────────────────────────────

function LeadDashboard({ onClose }) {
  const toast = useToast();
  const [stats, setStats] = useState(null);
  const [leads, setLeads] = useState([]);
  const [loading, setLoading] = useState(true);
  const [dateRange, setDateRange] = useState('30');

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const [statsRes, leadsRes] = await Promise.all([
        authFetch(`${API_BASE}/leads/stats`),
        authFetch(`${API_BASE}/leads?limit=1000`),
      ]);

      if (statsRes.ok) {
        const d = await statsRes.json();
        setStats(d.data || d);
      }
      if (leadsRes.ok) {
        const d = await leadsRes.json();
        setLeads(d.data || d.leads || []);
      }
    } catch {
      toast.error('Failed to load dashboard data');
    } finally {
      setLoading(false);
    }
  }, [toast]);

  useEffect(() => { fetchData(); }, [fetchData]);

  // ─── Computed metrics from leads (filtered by date range) ──

  const metrics = useMemo(() => {
    const empty = { total: 0, byStatus: {}, bySource: {}, byPriority: {}, conversionRate: 0, recentTrend: [] };
    if (!leads.length) return empty;

    const now = new Date();
    const days = parseInt(dateRange);
    const cutoff = new Date(now.getTime() - days * 86400000);
    const filtered = leads.filter(l => new Date(l.created_at) >= cutoff);

    const byStatus = {};
    const bySource = {};
    const byPriority = {};

    filtered.forEach(lead => {
      byStatus[lead.status] = (byStatus[lead.status] || 0) + 1;
      const src = lead.lead_source || 'unknown';
      bySource[src] = (bySource[src] || 0) + 1;
      byPriority[lead.priority] = (byPriority[lead.priority] || 0) + 1;
    });

    const converted = filtered.filter(l => l.status === 'converted').length;
    const conversionRate = filtered.length > 0 ? ((converted / filtered.length) * 100).toFixed(1) : 0;

    // 7-day trend
    const recentTrend = [];
    for (let i = 6; i >= 0; i--) {
      const date = new Date(now.getTime() - i * 86400000);
      date.setHours(0, 0, 0, 0);
      const next = new Date(date.getTime() + 86400000);
      const count = leads.filter(l => {
        const c = new Date(l.created_at);
        return c >= date && c < next;
      }).length;
      recentTrend.push({
        day: date.toLocaleDateString('en-CA', { weekday: 'short' }),
        fullDate: date.toLocaleDateString('en-CA', { month: 'short', day: 'numeric' }),
        count,
      });
    }

    return { total: filtered.length, byStatus, bySource, byPriority, conversionRate, recentTrend };
  }, [leads, dateRange]);

  // ─── Funnel ───────────────────────────────────────────────

  const funnelData = useMemo(() => {
    const stages = ['new', 'contacted', 'qualified', 'quote_created', 'converted'];
    const labels = { new: 'New', contacted: 'Contacted', qualified: 'Qualified', quote_created: 'Quote Created', converted: 'Converted' };
    return stages.map((s, i) => {
      const count = metrics.byStatus[s] || 0;
      const pct = metrics.total > 0 ? ((count / metrics.total) * 100) : 0;
      return { status: s, label: labels[s], count, pct, color: FUNNEL_COLORS[i], width: 100 - i * 12 };
    });
  }, [metrics]);

  // ─── Priority ring data ───────────────────────────────────

  const priorityRing = useMemo(() => {
    const hot = metrics.byPriority['hot'] || 0;
    const warm = metrics.byPriority['warm'] || 0;
    const cold = metrics.byPriority['cold'] || 0;
    const total = hot + warm + cold || 1;
    const r = 48;
    const c = 2 * Math.PI * r;
    return { hot, warm, cold, total, r, c };
  }, [metrics]);

  // ─── Loading ──────────────────────────────────────────────

  if (loading) {
    return (
      <div className="lead-dashboard">
        <div className="dashboard-header">
          <div>
            <h2>Lead Analytics Dashboard</h2>
            <p className="dashboard-subtitle">Loading...</p>
          </div>
          <div className="dashboard-actions">
            <button className="btn btn-secondary" onClick={onClose}>Close</button>
          </div>
        </div>
        <div className="dash-loading">
          <div className="dash-skeleton-row">
            <div className="dash-skeleton-card" /><div className="dash-skeleton-card" />
            <div className="dash-skeleton-card" /><div className="dash-skeleton-card" />
          </div>
          <div className="dash-skeleton-row">
            <div className="dash-skeleton-wide" /><div className="dash-skeleton-wide" />
          </div>
        </div>
      </div>
    );
  }

  // ─── Trend helpers ────────────────────────────────────────

  const trendMax = Math.max(...metrics.recentTrend.map(d => d.count), 1);
  const weekTotal = metrics.recentTrend.reduce((s, d) => s + d.count, 0);

  // Response time from stats
  const avgResponseHours = stats?.avg_response_hours != null ? Number(stats.avg_response_hours).toFixed(1) : null;

  return (
    <div className="lead-dashboard">
      {/* ─── Header ─── */}
      <div className="dashboard-header">
        <div>
          <h2>Lead Analytics Dashboard</h2>
          <p className="dashboard-subtitle">Performance insights and conversion metrics</p>
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
            <option value="365">Last 12 months</option>
          </select>
          <button className="btn btn-secondary" onClick={onClose}>Close</button>
        </div>
      </div>

      {/* ─── Key Metrics ─── */}
      <div className="metrics-row">
        <div className="metric-card">
          <div className="metric-icon metric-icon-blue">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M22 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>
          </div>
          <div className="metric-value">{metrics.total}</div>
          <div className="metric-label">Total Leads</div>
        </div>
        <div className="metric-card highlight-green">
          <div className="metric-icon metric-icon-green">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="22 7 13.5 15.5 8.5 10.5 2 17"/><polyline points="16 7 22 7 22 13"/></svg>
          </div>
          <div className="metric-value">{metrics.conversionRate}%</div>
          <div className="metric-label">Conversion Rate</div>
        </div>
        <div className="metric-card highlight-blue">
          <div className="metric-icon metric-icon-indigo">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><line x1="19" y1="8" x2="19" y2="14"/><line x1="22" y1="11" x2="16" y2="11"/></svg>
          </div>
          <div className="metric-value">{metrics.byStatus['new'] || 0}</div>
          <div className="metric-label">New Leads</div>
        </div>
        <div className="metric-card highlight-orange">
          <div className="metric-icon metric-icon-red">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M8.5 14.5A2.5 2.5 0 0 0 11 12c0-1.38-.5-2-1-3-1.072-2.143-.224-4.054 2-6 .5 2.5 2 4.9 4 6.5 2 1.6 3 3.5 3 5.5a7 7 0 1 1-14 0c0-1.153.433-2.294 1-3a2.5 2.5 0 0 0 2.5 2.5z"/></svg>
          </div>
          <div className="metric-value">{metrics.byPriority['hot'] || 0}</div>
          <div className="metric-label">Hot Leads</div>
        </div>
      </div>

      {/* ─── Response Time (if available from stats) ─── */}
      {avgResponseHours && (
        <div className="response-time-bar">
          <div className="response-time-item">
            <span className="response-time-label">Avg Response Time</span>
            <span className="response-time-value">{avgResponseHours}h</span>
          </div>
          <div className="response-time-divider" />
          <div className="response-time-item">
            <span className="response-time-label">Responded &lt;1h</span>
            <span className="response-time-value">{stats?.responded_within_1h || 0}</span>
          </div>
          <div className="response-time-divider" />
          <div className="response-time-item">
            <span className="response-time-label">Follow-ups Today</span>
            <span className="response-time-value response-time-warn">{stats?.follow_up_today || 0}</span>
          </div>
          <div className="response-time-divider" />
          <div className="response-time-item">
            <span className="response-time-label">Overdue</span>
            <span className="response-time-value response-time-danger">{stats?.overdue_follow_ups || 0}</span>
          </div>
        </div>
      )}

      {/* ─── Funnel + Sources ─── */}
      <div className="charts-row">
        <div className="chart-card">
          <h3>Lead Funnel</h3>
          <div className="funnel-container">
            {funnelData.map((stage, i) => (
              <div key={stage.status} className="funnel-stage" style={{ '--stage-width': `${stage.width}%`, '--stage-color': stage.color }}>
                <div className="funnel-bar">
                  <span className="funnel-label">{stage.label}</span>
                  <div className="funnel-right">
                    <span className="funnel-count">{stage.count}</span>
                    <span className="funnel-pct">{stage.pct.toFixed(0)}%</span>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="chart-card">
          <h3>Lead Sources</h3>
          <div className="source-bars">
            {Object.entries(metrics.bySource)
              .sort((a, b) => b[1] - a[1])
              .slice(0, 6)
              .map(([source, count]) => {
                const color = SOURCE_COLORS[source] || '#6b7280';
                const pct = metrics.total > 0 ? ((count / metrics.total) * 100) : 0;
                return (
                  <div key={source} className="source-bar-item">
                    <div className="source-bar-header">
                      <div className="source-name-row">
                        <span className="source-dot" style={{ background: color }} />
                        <span className="source-name">{SOURCE_LABELS[source] || source}</span>
                      </div>
                      <div className="source-meta">
                        <span className="source-count">{count}</span>
                        <span className="source-pct">{pct.toFixed(0)}%</span>
                      </div>
                    </div>
                    <div className="source-bar-track">
                      <div className="source-bar-fill" style={{ width: `${pct}%`, background: color }} />
                    </div>
                  </div>
                );
              })}
            {Object.keys(metrics.bySource).length === 0 && (
              <p className="empty-chart-msg">No source data available</p>
            )}
          </div>
        </div>
      </div>

      {/* ─── Trend Chart ─── */}
      <div className="chart-card trend-chart">
        <div className="trend-header">
          <h3>Lead Trend (Last 7 Days)</h3>
          <span className="trend-total">{weekTotal} this week</span>
        </div>
        <div className="trend-container">
          <div className="trend-bars">
            {metrics.recentTrend.map((day, i) => {
              const barH = trendMax > 0 ? Math.max((day.count / trendMax) * 100, day.count > 0 ? 8 : 3) : 3;
              return (
                <div key={i} className="trend-bar-item" title={`${day.fullDate}: ${day.count} leads`}>
                  <div className="trend-bar" style={{ height: `${barH}%` }}>
                    <span className="trend-count">{day.count}</span>
                  </div>
                  <span className="trend-label">{day.day}</span>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* ─── Priority Ring + Status Breakdown ─── */}
      <div className="charts-row">
        <div className="chart-card">
          <h3>By Priority</h3>
          <div className="priority-ring-layout">
            {/* SVG Ring */}
            <div className="priority-ring-wrap">
              <svg viewBox="0 0 120 120" className="priority-ring-svg">
                <circle cx="60" cy="60" r={priorityRing.r} fill="none" stroke="#f3f4f6" strokeWidth="9" />
                {/* Hot */}
                <circle cx="60" cy="60" r={priorityRing.r} fill="none"
                  stroke="#ef4444" strokeWidth="9"
                  strokeDasharray={`${(priorityRing.hot / priorityRing.total) * priorityRing.c} ${priorityRing.c}`}
                  strokeDashoffset="0" strokeLinecap="round"
                  transform="rotate(-90 60 60)"
                />
                {/* Warm */}
                <circle cx="60" cy="60" r={priorityRing.r} fill="none"
                  stroke="#f59e0b" strokeWidth="9"
                  strokeDasharray={`${(priorityRing.warm / priorityRing.total) * priorityRing.c} ${priorityRing.c}`}
                  strokeDashoffset={`${-((priorityRing.hot / priorityRing.total) * priorityRing.c)}`}
                  strokeLinecap="round"
                  transform="rotate(-90 60 60)"
                />
                {/* Cold */}
                <circle cx="60" cy="60" r={priorityRing.r} fill="none"
                  stroke="#6b7280" strokeWidth="9"
                  strokeDasharray={`${(priorityRing.cold / priorityRing.total) * priorityRing.c} ${priorityRing.c}`}
                  strokeDashoffset={`${-(((priorityRing.hot + priorityRing.warm) / priorityRing.total) * priorityRing.c)}`}
                  strokeLinecap="round"
                  transform="rotate(-90 60 60)"
                />
                <text x="60" y="56" textAnchor="middle" className="ring-total">{priorityRing.hot + priorityRing.warm + priorityRing.cold}</text>
                <text x="60" y="70" textAnchor="middle" className="ring-sublabel">total</text>
              </svg>
            </div>
            {/* Legend */}
            <div className="priority-legend">
              {[
                { key: 'hot', label: 'Hot', color: '#ef4444', count: priorityRing.hot },
                { key: 'warm', label: 'Warm', color: '#f59e0b', count: priorityRing.warm },
                { key: 'cold', label: 'Cold', color: '#6b7280', count: priorityRing.cold },
              ].map(p => {
                const pct = priorityRing.total > 0 ? ((p.count / priorityRing.total) * 100).toFixed(0) : 0;
                return (
                  <div key={p.key} className="priority-legend-item">
                    <span className="priority-legend-dot" style={{ background: p.color }} />
                    <span className="priority-legend-label">{p.label}</span>
                    <span className="priority-legend-count">{p.count}</span>
                    <span className="priority-legend-pct">{pct}%</span>
                  </div>
                );
              })}
            </div>
          </div>
        </div>

        <div className="chart-card">
          <h3>By Status</h3>
          <div className="status-breakdown">
            {Object.entries(metrics.byStatus)
              .sort((a, b) => b[1] - a[1])
              .map(([status, count]) => {
                const color = STATUS_COLORS[status] || '#6b7280';
                const pct = metrics.total > 0 ? ((count / metrics.total) * 100) : 0;
                return (
                  <div key={status} className="status-row">
                    <span className="status-dot" style={{ background: color }} />
                    <span className="status-name">{STATUS_LABELS[status] || status}</span>
                    <div className="status-bar-track">
                      <div className="status-bar-fill" style={{ width: `${pct}%`, background: color }} />
                    </div>
                    <span className="status-count">{count}</span>
                    <span className="status-pct">{pct.toFixed(0)}%</span>
                  </div>
                );
              })}
            {Object.keys(metrics.byStatus).length === 0 && (
              <p className="empty-chart-msg">No data yet</p>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

export default LeadDashboard;
