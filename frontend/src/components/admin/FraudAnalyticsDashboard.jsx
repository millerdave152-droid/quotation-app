/**
 * TeleTime - Fraud Analytics Dashboard
 * Comprehensive analytics view of fraud activity, trends, and system effectiveness.
 * Visualizes data from GET /api/fraud/analytics with 7 Recharts charts,
 * KPI cards, employee leaderboard, chargeback metrics, and CSV export.
 */

import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { authFetch } from '../../services/authFetch';
import {
  BarChart, Bar, AreaChart, Area, PieChart, Pie, Cell,
  XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer,
} from 'recharts';

const API_URL = process.env.REACT_APP_API_URL || '';

// ============================================================================
// CONSTANTS
// ============================================================================

const RISK_COLORS = {
  low: '#10b981',
  medium: '#f59e0b',
  high: '#f97316',
  critical: '#ef4444',
};

const CHART_COLORS = ['#667eea', '#764ba2', '#f093fb', '#4facfe', '#00f2fe', '#43e97b', '#fa709a', '#fee140'];

const DAY_LABELS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

const ENTRY_METHOD_LABELS = {
  chip: 'Chip',
  contactless: 'Contactless',
  swipe: 'Swipe',
  manual: 'Manual Entry',
  moto: 'MOTO',
  ecommerce: 'E-Commerce',
  unknown: 'Unknown',
};

const PRESETS = [
  { id: 'today', label: 'Today' },
  { id: 'week', label: 'This Week' },
  { id: 'month', label: 'This Month' },
  { id: '30d', label: 'Last 30 Days' },
  { id: 'custom', label: 'Custom' },
];

// ============================================================================
// HELPERS
// ============================================================================

const formatCurrency = (val) => {
  const num = parseFloat(val) || 0;
  if (num >= 1000000) return `$${(num / 1000000).toFixed(1)}M`;
  if (num >= 1000) return `$${(num / 1000).toFixed(1)}K`;
  return `$${num.toFixed(2)}`;
};

const formatNumber = (val) => {
  const num = parseInt(val) || 0;
  if (num >= 1000000) return `${(num / 1000000).toFixed(1)}M`;
  if (num >= 1000) return `${(num / 1000).toFixed(1)}K`;
  return num.toLocaleString();
};

const formatPct = (val) => {
  const num = parseFloat(val) || 0;
  return `${num.toFixed(1)}%`;
};

// ============================================================================
// KPI CARD
// ============================================================================

function KpiCard({ label, value, subtext, change, icon, color }) {
  const changeColor = change > 0 ? '#dc2626' : change < 0 ? '#10b981' : '#6b7280';
  const changeArrow = change > 0 ? '\u2191' : change < 0 ? '\u2193' : '';

  return (
    <div style={{
      background: 'white',
      borderRadius: '12px',
      padding: '20px',
      border: '1px solid #e5e7eb',
      boxShadow: '0 1px 3px rgba(0,0,0,0.08)',
    }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
        <div>
          <p style={{ margin: '0 0 4px', fontSize: '13px', color: '#6b7280', fontWeight: 500 }}>{label}</p>
          <p style={{ margin: '0 0 4px', fontSize: '28px', fontWeight: 700, color: color || '#111827' }}>{value}</p>
          {subtext && <p style={{ margin: 0, fontSize: '12px', color: '#9ca3af' }}>{subtext}</p>}
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: '4px' }}>
          <span style={{ fontSize: '24px' }}>{icon}</span>
          {change !== null && change !== undefined && (
            <span style={{ fontSize: '12px', fontWeight: 600, color: changeColor }}>
              {changeArrow} {Math.abs(change)}% vs prev
            </span>
          )}
        </div>
      </div>
    </div>
  );
}

// ============================================================================
// CHART SECTION WRAPPER
// ============================================================================

function ChartSection({ title, subtitle, children, style }) {
  return (
    <div style={{
      background: 'white',
      borderRadius: '12px',
      border: '1px solid #e5e7eb',
      padding: '20px',
      boxShadow: '0 1px 3px rgba(0,0,0,0.08)',
      ...style,
    }}>
      <div style={{ marginBottom: '16px' }}>
        <h3 style={{ margin: '0 0 2px', fontSize: '16px', fontWeight: 600, color: '#111827' }}>{title}</h3>
        {subtitle && <p style={{ margin: 0, fontSize: '12px', color: '#9ca3af' }}>{subtitle}</p>}
      </div>
      {children}
    </div>
  );
}

// ============================================================================
// CUSTOM TOOLTIP
// ============================================================================

function CustomTooltip({ active, payload, label, formatter }) {
  if (!active || !payload?.length) return null;
  return (
    <div style={{
      background: 'white',
      border: '1px solid #e5e7eb',
      borderRadius: '8px',
      padding: '10px 14px',
      boxShadow: '0 4px 12px rgba(0,0,0,0.15)',
      fontSize: '13px',
    }}>
      <p style={{ margin: '0 0 6px', fontWeight: 600, color: '#374151' }}>{label}</p>
      {payload.map((entry, i) => (
        <p key={i} style={{ margin: '2px 0', color: entry.color || '#6b7280' }}>
          {entry.name}: {formatter ? formatter(entry.value) : entry.value}
        </p>
      ))}
    </div>
  );
}

// ============================================================================
// HEATMAP CELL
// ============================================================================

function HeatmapGrid({ data }) {
  // Build a 7 (days) × 24 (hours) grid
  const grid = useMemo(() => {
    const g = Array.from({ length: 7 }, () => Array(24).fill(0));
    let max = 1;
    (data || []).forEach(d => {
      const day = parseInt(d.day_of_week);
      const hour = parseInt(d.hour);
      const val = parseInt(d.flagged) || 0;
      if (day >= 0 && day < 7 && hour >= 0 && hour < 24) {
        g[day][hour] = val;
        if (val > max) max = val;
      }
    });
    return { g, max };
  }, [data]);

  const getCellColor = (val) => {
    if (val === 0) return '#f9fafb';
    const intensity = Math.min(val / grid.max, 1);
    if (intensity < 0.25) return '#fef3c7';
    if (intensity < 0.5) return '#fbbf24';
    if (intensity < 0.75) return '#f97316';
    return '#ef4444';
  };

  return (
    <div style={{ overflowX: 'auto' }}>
      <div style={{ display: 'grid', gridTemplateColumns: '40px repeat(24, 1fr)', gap: '2px', minWidth: '600px' }}>
        {/* Header row — hours */}
        <div />
        {Array.from({ length: 24 }, (_, h) => (
          <div key={h} style={{ fontSize: '10px', color: '#9ca3af', textAlign: 'center', padding: '2px 0' }}>
            {h}
          </div>
        ))}
        {/* Data rows — days */}
        {grid.g.map((dayRow, dayIdx) => (
          <React.Fragment key={dayIdx}>
            <div style={{ fontSize: '11px', color: '#6b7280', display: 'flex', alignItems: 'center', fontWeight: 500 }}>
              {DAY_LABELS[dayIdx]}
            </div>
            {dayRow.map((val, hourIdx) => (
              <div
                key={hourIdx}
                title={`${DAY_LABELS[dayIdx]} ${hourIdx}:00 — ${val} flagged`}
                style={{
                  background: getCellColor(val),
                  borderRadius: '2px',
                  aspectRatio: '1',
                  minHeight: '18px',
                  cursor: 'default',
                  transition: 'transform 0.1s',
                }}
                onMouseEnter={e => { e.currentTarget.style.transform = 'scale(1.15)'; }}
                onMouseLeave={e => { e.currentTarget.style.transform = 'scale(1)'; }}
              />
            ))}
          </React.Fragment>
        ))}
      </div>
      {/* Legend */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginTop: '8px', justifyContent: 'flex-end' }}>
        <span style={{ fontSize: '11px', color: '#9ca3af' }}>Less</span>
        {['#f9fafb', '#fef3c7', '#fbbf24', '#f97316', '#ef4444'].map((c, i) => (
          <div key={i} style={{ width: '14px', height: '14px', borderRadius: '2px', background: c, border: '1px solid #e5e7eb' }} />
        ))}
        <span style={{ fontSize: '11px', color: '#9ca3af' }}>More</span>
      </div>
    </div>
  );
}

// ============================================================================
// EMPLOYEE LEADERBOARD
// ============================================================================

function EmployeeLeaderboard({ data }) {
  if (!data?.length) {
    return <p style={{ color: '#9ca3af', fontSize: '14px', textAlign: 'center', padding: '20px 0' }}>No employee data available</p>;
  }

  return (
    <div style={{ overflowX: 'auto' }}>
      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px' }}>
        <thead>
          <tr style={{ borderBottom: '2px solid #e5e7eb' }}>
            <th style={{ padding: '8px 12px', textAlign: 'left', color: '#6b7280', fontWeight: 600 }}>#</th>
            <th style={{ padding: '8px 12px', textAlign: 'left', color: '#6b7280', fontWeight: 600 }}>Employee</th>
            <th style={{ padding: '8px 12px', textAlign: 'right', color: '#6b7280', fontWeight: 600 }}>Scanned</th>
            <th style={{ padding: '8px 12px', textAlign: 'right', color: '#6b7280', fontWeight: 600 }}>Flagged</th>
            <th style={{ padding: '8px 12px', textAlign: 'right', color: '#6b7280', fontWeight: 600 }}>Flag Rate</th>
            <th style={{ padding: '8px 12px', textAlign: 'right', color: '#6b7280', fontWeight: 600 }}>Avg Score</th>
            <th style={{ padding: '8px 12px', textAlign: 'right', color: '#6b7280', fontWeight: 600 }}>$ Flagged</th>
          </tr>
        </thead>
        <tbody>
          {data.map((emp, idx) => {
            const flagRate = emp.total_scanned > 0
              ? ((emp.flagged / emp.total_scanned) * 100).toFixed(1)
              : '0.0';
            const isHigh = parseFloat(flagRate) > 10;

            return (
              <tr key={emp.employee_id || idx} style={{
                borderBottom: '1px solid #f3f4f6',
                background: isHigh ? '#fef2f2' : 'transparent',
              }}>
                <td style={{ padding: '10px 12px', fontWeight: 600, color: '#6b7280' }}>{idx + 1}</td>
                <td style={{ padding: '10px 12px', fontWeight: 500, color: '#111827' }}>
                  {emp.employee_name || `Employee #${emp.employee_id}`}
                </td>
                <td style={{ padding: '10px 12px', textAlign: 'right' }}>{formatNumber(emp.total_scanned)}</td>
                <td style={{ padding: '10px 12px', textAlign: 'right', fontWeight: 600, color: emp.flagged > 0 ? '#dc2626' : '#111827' }}>
                  {emp.flagged}
                </td>
                <td style={{ padding: '10px 12px', textAlign: 'right', color: isHigh ? '#dc2626' : '#6b7280' }}>
                  {flagRate}%
                </td>
                <td style={{ padding: '10px 12px', textAlign: 'right' }}>{emp.avg_score}</td>
                <td style={{ padding: '10px 12px', textAlign: 'right', fontWeight: 500 }}>
                  {formatCurrency(emp.flagged_amount)}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

// ============================================================================
// CHARGEBACK PANEL
// ============================================================================

function ChargebackPanel({ data }) {
  if (!data) return null;

  const metrics = [
    { label: 'Total', value: data.total_chargebacks || 0, color: '#111827' },
    { label: 'Won', value: data.won || 0, color: '#10b981' },
    { label: 'Lost', value: data.lost || 0, color: '#ef4444' },
    { label: 'Pending', value: data.pending || 0, color: '#f59e0b' },
  ];

  return (
    <div>
      {/* Summary row */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '12px', marginBottom: '20px' }}>
        {metrics.map(m => (
          <div key={m.label} style={{
            padding: '12px',
            background: '#f9fafb',
            borderRadius: '8px',
            textAlign: 'center',
          }}>
            <p style={{ margin: '0 0 2px', fontSize: '12px', color: '#6b7280' }}>{m.label}</p>
            <p style={{ margin: 0, fontSize: '22px', fontWeight: 700, color: m.color }}>{m.value}</p>
          </div>
        ))}
      </div>

      {/* Win rate + amount */}
      <div style={{ display: 'flex', gap: '20px', marginBottom: '20px' }}>
        <div style={{ flex: 1, padding: '16px', background: '#f0fdf4', borderRadius: '8px', border: '1px solid #bbf7d0' }}>
          <p style={{ margin: '0 0 4px', fontSize: '12px', color: '#6b7280' }}>Win Rate</p>
          <p style={{ margin: 0, fontSize: '24px', fontWeight: 700, color: '#059669' }}>
            {data.win_rate !== null ? `${data.win_rate}%` : 'N/A'}
          </p>
        </div>
        <div style={{ flex: 1, padding: '16px', background: '#fef2f2', borderRadius: '8px', border: '1px solid #fecaca' }}>
          <p style={{ margin: '0 0 4px', fontSize: '12px', color: '#6b7280' }}>Amount Lost</p>
          <p style={{ margin: 0, fontSize: '24px', fontWeight: 700, color: '#dc2626' }}>
            {formatCurrency(data.lost_amount)}
          </p>
        </div>
      </div>

      {/* Reason codes */}
      {data.reason_codes?.length > 0 && (
        <div>
          <h4 style={{ margin: '0 0 10px', fontSize: '14px', fontWeight: 600, color: '#374151' }}>Top Reason Codes</h4>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
            {data.reason_codes.map((rc, idx) => (
              <div key={idx} style={{
                display: 'flex',
                alignItems: 'center',
                gap: '10px',
                padding: '8px 12px',
                background: '#f9fafb',
                borderRadius: '6px',
              }}>
                <span style={{ fontSize: '12px', fontWeight: 600, color: '#667eea', minWidth: '60px' }}>
                  {rc.reason_code}
                </span>
                <span style={{ flex: 1, fontSize: '13px', color: '#374151' }}>{rc.description}</span>
                <span style={{ fontSize: '13px', fontWeight: 600, color: '#111827' }}>{rc.count}</span>
                <span style={{ fontSize: '12px', color: '#6b7280' }}>{formatCurrency(rc.total_amount)}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// ============================================================================
// DATE RANGE SELECTOR
// ============================================================================

function DateRangeSelector({ preset, dateFrom, dateTo, onPresetChange, onDateChange }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
      {PRESETS.map(p => (
        <button
          key={p.id}
          onClick={() => onPresetChange(p.id)}
          style={{
            padding: '6px 14px',
            borderRadius: '6px',
            border: '1px solid',
            borderColor: preset === p.id ? '#667eea' : '#d1d5db',
            background: preset === p.id ? '#667eea' : 'white',
            color: preset === p.id ? 'white' : '#374151',
            fontSize: '13px',
            fontWeight: 500,
            cursor: 'pointer',
            transition: 'all 0.15s',
          }}
        >
          {p.label}
        </button>
      ))}
      {preset === 'custom' && (
        <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginLeft: '8px' }}>
          <input
            type="date"
            value={dateFrom}
            onChange={e => onDateChange('from', e.target.value)}
            style={{
              padding: '5px 10px',
              border: '1px solid #d1d5db',
              borderRadius: '6px',
              fontSize: '13px',
              color: '#374151',
            }}
          />
          <span style={{ color: '#9ca3af', fontSize: '13px' }}>to</span>
          <input
            type="date"
            value={dateTo}
            onChange={e => onDateChange('to', e.target.value)}
            style={{
              padding: '5px 10px',
              border: '1px solid #d1d5db',
              borderRadius: '6px',
              fontSize: '13px',
              color: '#374151',
            }}
          />
        </div>
      )}
    </div>
  );
}

// ============================================================================
// MAIN COMPONENT
// ============================================================================

export default function FraudAnalyticsDashboard() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [preset, setPreset] = useState('30d');
  const [customFrom, setCustomFrom] = useState('');
  const [customTo, setCustomTo] = useState('');
  const [exporting, setExporting] = useState(false);

  // ---- Fetch analytics data ----
  const fetchAnalytics = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams();
      if (preset !== 'custom') {
        params.set('preset', preset);
      } else {
        if (customFrom) params.set('date_from', new Date(customFrom).toISOString());
        if (customTo) params.set('date_to', new Date(customTo + 'T23:59:59').toISOString());
      }
      const resp = await authFetch(`${API_URL}/api/fraud/analytics?${params.toString()}`);
      const json = await resp.json();
      if (json.success) {
        setData(json.data);
      } else {
        throw new Error(json.error || 'Failed to fetch analytics');
      }
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [preset, customFrom, customTo]);

  useEffect(() => {
    fetchAnalytics();
  }, [fetchAnalytics]);

  // ---- CSV Export ----
  const handleExport = async () => {
    setExporting(true);
    try {
      const params = new URLSearchParams();
      if (preset !== 'custom') {
        params.set('preset', preset);
      } else {
        if (customFrom) params.set('date_from', new Date(customFrom).toISOString());
        if (customTo) params.set('date_to', new Date(customTo + 'T23:59:59').toISOString());
      }
      const resp = await authFetch(`${API_URL}/api/fraud/analytics/export?${params.toString()}`);
      const blob = await resp.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `fraud_analytics_${new Date().toISOString().slice(0, 10)}.csv`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      window.URL.revokeObjectURL(url);
    } catch (err) {
      alert('Export failed: ' + err.message);
    } finally {
      setExporting(false);
    }
  };

  // ---- Preset / date handlers ----
  const handlePresetChange = (id) => {
    setPreset(id);
    if (id !== 'custom') {
      setCustomFrom('');
      setCustomTo('');
    }
  };

  const handleDateChange = (which, val) => {
    if (which === 'from') setCustomFrom(val);
    else setCustomTo(val);
  };

  // ---- Score distribution data for histogram ----
  const histogramData = useMemo(() => {
    if (!data?.score_distribution) return [];
    return data.score_distribution.map(d => ({
      range: `${d.bucket_start}-${d.bucket_end}`,
      count: parseInt(d.count),
      risk_band: d.risk_band,
      fill: RISK_COLORS[d.risk_band] || '#6b7280',
    }));
  }, [data?.score_distribution]);

  // ---- Timeline data ----
  const timelineData = useMemo(() => {
    if (!data?.timeline) return [];
    return data.timeline.map(d => ({
      date: new Date(d.date).toLocaleDateString('en-CA', { month: 'short', day: 'numeric' }),
      low: parseInt(d.low) || 0,
      medium: parseInt(d.medium) || 0,
      high: parseInt(d.high) || 0,
      critical: parseInt(d.critical) || 0,
      flagged: parseInt(d.flagged_total) || 0,
    }));
  }, [data?.timeline]);

  // ---- Entry method pie data ----
  const entryMethodData = useMemo(() => {
    if (!data?.entry_methods) return [];
    return data.entry_methods.map(d => ({
      name: ENTRY_METHOD_LABELS[d.method] || d.method,
      value: parseInt(d.total),
      flagged: parseInt(d.flagged),
      flag_rate: parseFloat(d.flag_rate),
    }));
  }, [data?.entry_methods]);

  // ---- Card brand data ----
  const cardBrandData = useMemo(() => {
    if (!data?.card_brands) return [];
    return data.card_brands.map(d => ({
      brand: d.brand,
      total: parseInt(d.total),
      flagged: parseInt(d.flagged),
      flags_per_1000: parseFloat(d.flags_per_1000),
    }));
  }, [data?.card_brands]);

  // ---- Signal data ----
  const signalData = useMemo(() => {
    if (!data?.top_signals) return [];
    return data.top_signals.map(d => ({
      name: d.signal_name.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase()),
      count: parseInt(d.trigger_count),
      avg_score: parseFloat(d.avg_score),
    }));
  }, [data?.top_signals]);

  // ============================================================================
  // RENDER
  // ============================================================================

  if (error) {
    return (
      <div style={{ padding: '40px', textAlign: 'center' }}>
        <p style={{ color: '#dc2626', fontSize: '16px', marginBottom: '12px' }}>Failed to load analytics</p>
        <p style={{ color: '#6b7280', fontSize: '14px', marginBottom: '16px' }}>{error}</p>
        <button onClick={fetchAnalytics} style={{
          padding: '8px 20px', background: '#667eea', color: 'white',
          border: 'none', borderRadius: '6px', cursor: 'pointer', fontWeight: 500,
        }}>
          Retry
        </button>
      </div>
    );
  }

  return (
    <div>
      {/* Header Row — Date Range + Export */}
      <div style={{
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginBottom: '24px',
        flexWrap: 'wrap',
        gap: '12px',
      }}>
        <DateRangeSelector
          preset={preset}
          dateFrom={customFrom}
          dateTo={customTo}
          onPresetChange={handlePresetChange}
          onDateChange={handleDateChange}
        />
        <button
          onClick={handleExport}
          disabled={exporting || loading}
          style={{
            padding: '8px 18px',
            background: exporting ? '#d1d5db' : '#111827',
            color: 'white',
            border: 'none',
            borderRadius: '6px',
            cursor: exporting ? 'default' : 'pointer',
            fontWeight: 500,
            fontSize: '13px',
            display: 'flex',
            alignItems: 'center',
            gap: '6px',
          }}
        >
          {exporting ? 'Exporting...' : 'Download Report'}
        </button>
      </div>

      {loading ? (
        <div style={{ display: 'flex', justifyContent: 'center', padding: '60px 0' }}>
          <div style={{
            width: '40px', height: '40px', border: '3px solid #e5e7eb',
            borderTopColor: '#667eea', borderRadius: '50%',
            animation: 'spin 0.8s linear infinite',
          }} />
          <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
        </div>
      ) : data ? (
        <>
          {/* ---- KPI SUMMARY CARDS ---- */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '16px', marginBottom: '24px' }}>
            <KpiCard
              label="Transactions Scanned"
              value={formatNumber(data.kpi.total_scanned)}
              change={data.kpi.total_scanned_pct_change}
              icon={'\uD83D\uDD0D'}
              color="#111827"
            />
            <KpiCard
              label="Flagged"
              value={formatNumber(data.kpi.flagged)}
              subtext={`${formatPct(data.kpi.flagged_pct)} of total`}
              icon={'\u26A0\uFE0F'}
              color={data.kpi.flagged > 0 ? '#f59e0b' : '#111827'}
            />
            <KpiCard
              label="Declined"
              value={formatNumber(data.kpi.declined)}
              subtext={`${formatPct(data.kpi.declined_pct)} of total`}
              icon={'\uD83D\uDEAB'}
              color={data.kpi.declined > 0 ? '#ef4444' : '#111827'}
            />
            <KpiCard
              label="Fraud Prevented"
              value={formatCurrency(data.kpi.fraud_prevented)}
              icon={'\uD83D\uDEE1\uFE0F'}
              color="#059669"
            />
          </div>

          {/* ---- ROW 1: Score Distribution + Events Timeline ---- */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 2fr', gap: '16px', marginBottom: '16px' }}>
            {/* 1) Score Distribution Histogram */}
            <ChartSection title="Score Distribution" subtitle="Risk score histogram across transactions">
              {histogramData.length > 0 ? (
                <ResponsiveContainer width="100%" height={260}>
                  <BarChart data={histogramData} margin={{ top: 5, right: 10, left: -10, bottom: 5 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#f3f4f6" />
                    <XAxis dataKey="range" tick={{ fontSize: 11, fill: '#6b7280' }} />
                    <YAxis tick={{ fontSize: 11, fill: '#6b7280' }} allowDecimals={false} />
                    <Tooltip content={<CustomTooltip />} />
                    <Bar dataKey="count" name="Transactions" radius={[4, 4, 0, 0]}>
                      {histogramData.map((entry, i) => (
                        <Cell key={i} fill={entry.fill} />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              ) : (
                <p style={{ color: '#9ca3af', textAlign: 'center', padding: '40px 0' }}>No score data</p>
              )}
            </ChartSection>

            {/* 2) Events Timeline */}
            <ChartSection title="Events Timeline" subtitle="Daily fraud events by severity">
              {timelineData.length > 0 ? (
                <ResponsiveContainer width="100%" height={260}>
                  <AreaChart data={timelineData} margin={{ top: 5, right: 10, left: -10, bottom: 5 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#f3f4f6" />
                    <XAxis dataKey="date" tick={{ fontSize: 11, fill: '#6b7280' }} />
                    <YAxis tick={{ fontSize: 11, fill: '#6b7280' }} allowDecimals={false} />
                    <Tooltip content={<CustomTooltip />} />
                    <Legend wrapperStyle={{ fontSize: '12px' }} />
                    <Area type="monotone" dataKey="critical" stackId="1" stroke={RISK_COLORS.critical} fill={RISK_COLORS.critical} fillOpacity={0.7} name="Critical" />
                    <Area type="monotone" dataKey="high" stackId="1" stroke={RISK_COLORS.high} fill={RISK_COLORS.high} fillOpacity={0.7} name="High" />
                    <Area type="monotone" dataKey="medium" stackId="1" stroke={RISK_COLORS.medium} fill={RISK_COLORS.medium} fillOpacity={0.7} name="Medium" />
                    <Area type="monotone" dataKey="low" stackId="1" stroke={RISK_COLORS.low} fill={RISK_COLORS.low} fillOpacity={0.7} name="Low" />
                  </AreaChart>
                </ResponsiveContainer>
              ) : (
                <p style={{ color: '#9ca3af', textAlign: 'center', padding: '40px 0' }}>No timeline data</p>
              )}
            </ChartSection>
          </div>

          {/* ---- ROW 2: Entry Method + Card Brand + Top Signals ---- */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '16px', marginBottom: '16px' }}>
            {/* 3) Entry Method Breakdown — Pie */}
            <ChartSection title="Entry Methods" subtitle="Transaction volume by entry method">
              {entryMethodData.length > 0 ? (
                <ResponsiveContainer width="100%" height={260}>
                  <PieChart>
                    <Pie
                      data={entryMethodData}
                      dataKey="value"
                      nameKey="name"
                      cx="50%"
                      cy="50%"
                      outerRadius={90}
                      innerRadius={50}
                      paddingAngle={2}
                      label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`}
                      labelLine={false}
                      style={{ fontSize: '11px' }}
                    >
                      {entryMethodData.map((_, i) => (
                        <Cell key={i} fill={CHART_COLORS[i % CHART_COLORS.length]} />
                      ))}
                    </Pie>
                    <Tooltip formatter={(val) => formatNumber(val)} />
                  </PieChart>
                </ResponsiveContainer>
              ) : (
                <p style={{ color: '#9ca3af', textAlign: 'center', padding: '40px 0' }}>No entry method data</p>
              )}
            </ChartSection>

            {/* 4) Card Brand Analysis — Horizontal Bar */}
            <ChartSection title="Card Brands" subtitle="Flags per 1,000 transactions">
              {cardBrandData.length > 0 ? (
                <ResponsiveContainer width="100%" height={260}>
                  <BarChart data={cardBrandData} layout="vertical" margin={{ top: 5, right: 10, left: 10, bottom: 5 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#f3f4f6" />
                    <XAxis type="number" tick={{ fontSize: 11, fill: '#6b7280' }} />
                    <YAxis dataKey="brand" type="category" width={70} tick={{ fontSize: 12, fill: '#374151' }} />
                    <Tooltip formatter={(val) => `${val} per 1K`} />
                    <Bar dataKey="flags_per_1000" name="Flags/1000" fill="#667eea" radius={[0, 4, 4, 0]} barSize={18} />
                  </BarChart>
                </ResponsiveContainer>
              ) : (
                <p style={{ color: '#9ca3af', textAlign: 'center', padding: '40px 0' }}>No card brand data</p>
              )}
            </ChartSection>

            {/* 5) Top Triggered Signals — Horizontal Bar */}
            <ChartSection title="Top Signals" subtitle="Most frequently triggered fraud signals">
              {signalData.length > 0 ? (
                <ResponsiveContainer width="100%" height={260}>
                  <BarChart data={signalData.slice(0, 8)} layout="vertical" margin={{ top: 5, right: 10, left: 10, bottom: 5 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#f3f4f6" />
                    <XAxis type="number" tick={{ fontSize: 11, fill: '#6b7280' }} allowDecimals={false} />
                    <YAxis dataKey="name" type="category" width={110} tick={{ fontSize: 11, fill: '#374151' }} />
                    <Tooltip />
                    <Bar dataKey="count" name="Triggers" fill="#764ba2" radius={[0, 4, 4, 0]} barSize={16} />
                  </BarChart>
                </ResponsiveContainer>
              ) : (
                <p style={{ color: '#9ca3af', textAlign: 'center', padding: '40px 0' }}>No signal data</p>
              )}
            </ChartSection>
          </div>

          {/* ---- ROW 3: Heatmap + Location ---- */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px', marginBottom: '16px' }}>
            {/* 6) Time-of-Day Heatmap */}
            <ChartSection title="Activity Heatmap" subtitle="Flagged events by day of week and hour">
              <HeatmapGrid data={data.heatmap} />
            </ChartSection>

            {/* 7) Location Comparison */}
            <ChartSection title="Location Comparison" subtitle="Fraud flags per 1,000 transactions by location">
              {data.locations?.length > 0 ? (
                <ResponsiveContainer width="100%" height={260}>
                  <BarChart data={data.locations} margin={{ top: 5, right: 10, left: -10, bottom: 5 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#f3f4f6" />
                    <XAxis dataKey="location_id" tick={{ fontSize: 11, fill: '#6b7280' }}
                      tickFormatter={(val) => `Loc ${val}`} />
                    <YAxis tick={{ fontSize: 11, fill: '#6b7280' }} />
                    <Tooltip formatter={(val, name) => name === 'Avg Score' ? val : `${val}/1K`} />
                    <Legend wrapperStyle={{ fontSize: '12px' }} />
                    <Bar dataKey="flags_per_1000" name="Flags/1K" fill="#f97316" radius={[4, 4, 0, 0]} barSize={24} />
                    <Bar dataKey="avg_score" name="Avg Score" fill="#667eea" radius={[4, 4, 0, 0]} barSize={24} />
                  </BarChart>
                </ResponsiveContainer>
              ) : (
                <p style={{ color: '#9ca3af', textAlign: 'center', padding: '40px 0' }}>No location data</p>
              )}
            </ChartSection>
          </div>

          {/* ---- ROW 4: Employee Leaderboard + Chargeback Metrics ---- */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
            {/* Employee Leaderboard */}
            <ChartSection title="Employee Leaderboard" subtitle="Top 10 employees by flagged transaction involvement">
              <EmployeeLeaderboard data={data.employee_leaderboard} />
            </ChartSection>

            {/* Chargeback Metrics */}
            <ChartSection title="Chargeback Metrics" subtitle="Dispute outcomes, win rate, and top reason codes">
              <ChargebackPanel data={data.chargebacks} />
            </ChartSection>
          </div>
        </>
      ) : null}
    </div>
  );
}
