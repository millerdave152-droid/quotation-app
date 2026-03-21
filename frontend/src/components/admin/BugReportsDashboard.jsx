/**
 * BugReportsDashboard — Admin page for viewing and managing bug reports
 * Route: /admin/bugs
 */

import React, { useState, useEffect, useCallback } from 'react';
import { authFetch } from '../../services/authFetch';

const API_URL = process.env.REACT_APP_API_URL || '';

const SEVERITY_BADGE = {
  blocker: { bg: '#fee2e2', color: '#991b1b', border: '#fca5a5' },
  major:   { bg: '#fef3c7', color: '#92400e', border: '#fcd34d' },
  minor:   { bg: '#d1fae5', color: '#065f46', border: '#6ee7b7' }
};

const STATUS_BADGE = {
  open:        { bg: '#fee2e2', color: '#991b1b' },
  in_progress: { bg: '#fef3c7', color: '#92400e' },
  resolved:    { bg: '#d1fae5', color: '#065f46' },
  wont_fix:    { bg: '#f3f4f6', color: '#6b7280' }
};

const STATUS_OPTIONS = [
  { value: 'open', label: 'Open' },
  { value: 'in_progress', label: 'In Progress' },
  { value: 'resolved', label: 'Resolved' },
  { value: 'wont_fix', label: "Won't Fix" }
];

function relativeTime(dateStr) {
  if (!dateStr) return '-';
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'Just now';
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  if (days < 30) return `${days}d ago`;
  return new Date(dateStr).toLocaleDateString('en-CA', { month: 'short', day: 'numeric' });
}

function Badge({ value, colorMap }) {
  const c = colorMap[value] || { bg: '#f3f4f6', color: '#6b7280' };
  return (
    <span style={{
      display: 'inline-block',
      padding: '2px 10px',
      borderRadius: 12,
      fontSize: 12,
      fontWeight: 600,
      background: c.bg,
      color: c.color,
      textTransform: 'capitalize',
      whiteSpace: 'nowrap'
    }}>
      {(value || '').replace(/_/g, ' ')}
    </span>
  );
}

// ============================================================================
// FILTER BAR
// ============================================================================

function FilterBar({ severity, status, onSeverityChange, onStatusChange }) {
  const sevOptions = [
    { value: '', label: 'All' },
    { value: 'blocker', label: 'Blocker' },
    { value: 'major', label: 'Major' },
    { value: 'minor', label: 'Minor' }
  ];
  const statOptions = [
    { value: '', label: 'All' },
    { value: 'open', label: 'Open' },
    { value: 'in_progress', label: 'In Progress' },
    { value: 'resolved', label: 'Resolved' }
  ];

  const pill = (active) => ({
    padding: '6px 14px',
    borderRadius: 8,
    border: active ? '1.5px solid #667eea' : '1px solid #d1d5db',
    background: active ? '#eef2ff' : '#fff',
    color: active ? '#4338ca' : '#374151',
    fontWeight: active ? 600 : 400,
    fontSize: 13,
    cursor: 'pointer',
    transition: 'all 0.15s'
  });

  return (
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 24, marginBottom: 24 }}>
      <div>
        <div style={{ fontSize: 12, fontWeight: 600, color: '#6b7280', marginBottom: 6, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
          Severity
        </div>
        <div style={{ display: 'flex', gap: 6 }}>
          {sevOptions.map((o) => (
            <button key={o.value} style={pill(severity === o.value)} onClick={() => onSeverityChange(o.value)}>
              {o.label}
            </button>
          ))}
        </div>
      </div>
      <div>
        <div style={{ fontSize: 12, fontWeight: 600, color: '#6b7280', marginBottom: 6, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
          Status
        </div>
        <div style={{ display: 'flex', gap: 6 }}>
          {statOptions.map((o) => (
            <button key={o.value} style={pill(status === o.value)} onClick={() => onStatusChange(o.value)}>
              {o.label}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

// ============================================================================
// EXPANDED ROW DETAIL
// ============================================================================

function ExpandedDetail({ bug, onSaved }) {
  const [status, setStatus] = useState(bug.status);
  const [notes, setNotes] = useState(bug.notes || '');
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  const handleSave = async () => {
    setSaving(true);
    setSaved(false);
    try {
      const res = await authFetch(`${API_URL}/api/bug-reports/${bug.id}`, {
        method: 'PATCH',
        body: JSON.stringify({ status, notes })
      });
      if (res.ok) {
        setSaved(true);
        onSaved();
        setTimeout(() => setSaved(false), 2000);
      }
    } catch (e) {
      console.error('Save failed', e);
    } finally {
      setSaving(false);
    }
  };

  const hasChanges = status !== bug.status || notes !== (bug.notes || '');

  return (
    <tr>
      <td colSpan={7} style={{ padding: 0 }}>
        <div style={{
          padding: '20px 24px',
          background: '#f9fafb',
          borderBottom: '2px solid #e5e7eb'
        }}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 24, marginBottom: 20 }}>
            {/* Description */}
            <div>
              <div style={sectionLabel}>Description</div>
              <div style={sectionBody}>{bug.description}</div>
            </div>

            {/* Steps */}
            <div>
              <div style={sectionLabel}>Steps to Reproduce</div>
              <div style={{ ...sectionBody, whiteSpace: 'pre-wrap' }}>
                {bug.steps || <span style={{ color: '#9ca3af', fontStyle: 'italic' }}>None provided</span>}
              </div>
            </div>
          </div>

          {/* User agent */}
          <div style={{ marginBottom: 20 }}>
            <div style={sectionLabel}>User Agent</div>
            <div style={{
              fontSize: 12,
              color: '#6b7280',
              background: '#fff',
              padding: '8px 12px',
              borderRadius: 6,
              border: '1px solid #e5e7eb',
              fontFamily: 'monospace',
              wordBreak: 'break-all'
            }}>
              {bug.user_agent || '-'}
            </div>
          </div>

          {/* Actions row */}
          <div style={{ display: 'flex', gap: 16, alignItems: 'flex-end', flexWrap: 'wrap' }}>
            {/* Status dropdown */}
            <div style={{ minWidth: 160 }}>
              <div style={sectionLabel}>Update Status</div>
              <select
                value={status}
                onChange={(e) => setStatus(e.target.value)}
                style={{
                  width: '100%',
                  padding: '8px 12px',
                  border: '1px solid #d1d5db',
                  borderRadius: 8,
                  fontSize: 14,
                  background: '#fff',
                  cursor: 'pointer'
                }}
              >
                {STATUS_OPTIONS.map((o) => (
                  <option key={o.value} value={o.value}>{o.label}</option>
                ))}
              </select>
            </div>

            {/* Notes */}
            <div style={{ flex: 1, minWidth: 250 }}>
              <div style={sectionLabel}>Notes</div>
              <textarea
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                rows={2}
                placeholder="Internal notes..."
                style={{
                  width: '100%',
                  padding: '8px 12px',
                  border: '1px solid #d1d5db',
                  borderRadius: 8,
                  fontSize: 14,
                  resize: 'vertical',
                  boxSizing: 'border-box'
                }}
              />
            </div>

            {/* Save */}
            <button
              onClick={handleSave}
              disabled={saving || !hasChanges}
              style={{
                padding: '8px 20px',
                borderRadius: 8,
                border: 'none',
                background: saved ? '#10b981' : hasChanges ? '#667eea' : '#d1d5db',
                color: '#fff',
                fontWeight: 600,
                fontSize: 14,
                cursor: hasChanges && !saving ? 'pointer' : 'default',
                transition: 'background 0.15s',
                whiteSpace: 'nowrap',
                height: 38
              }}
            >
              {saving ? 'Saving...' : saved ? 'Saved' : 'Save Changes'}
            </button>
          </div>
        </div>
      </td>
    </tr>
  );
}

const sectionLabel = {
  fontSize: 12,
  fontWeight: 600,
  color: '#6b7280',
  marginBottom: 6,
  textTransform: 'uppercase',
  letterSpacing: '0.03em'
};

const sectionBody = {
  fontSize: 14,
  color: '#374151',
  lineHeight: 1.6
};

// ============================================================================
// MAIN DASHBOARD
// ============================================================================

export default function BugReportsDashboard() {
  const [bugs, setBugs] = useState([]);
  const [count, setCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [severity, setSeverity] = useState('');
  const [status, setStatus] = useState('');
  const [expandedId, setExpandedId] = useState(null);

  const fetchBugs = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      params.set('limit', '200');
      if (severity) params.set('severity', severity);
      if (status) params.set('status', status);

      const res = await authFetch(`${API_URL}/api/bug-reports?${params}`);
      if (res.ok) {
        const json = await res.json();
        setBugs(json.bugs || []);
        setCount(json.count || 0);
      }
    } catch (e) {
      console.error('Failed to fetch bug reports', e);
    } finally {
      setLoading(false);
    }
  }, [severity, status]);

  // Fetch on mount and filter change
  useEffect(() => {
    fetchBugs();
  }, [fetchBugs]);

  // Auto-refresh every 60 seconds
  useEffect(() => {
    const interval = setInterval(fetchBugs, 60000);
    return () => clearInterval(interval);
  }, [fetchBugs]);

  const toggleRow = (id) => {
    setExpandedId((prev) => (prev === id ? null : id));
  };

  const thStyle = {
    textAlign: 'left',
    padding: '10px 8px',
    color: '#6b7280',
    fontWeight: 500,
    fontSize: 12,
    textTransform: 'uppercase',
    letterSpacing: '0.05em'
  };

  const tdStyle = {
    padding: '10px 8px',
    fontSize: 13,
    color: '#374151'
  };

  return (
    <div style={{ maxWidth: 1200, margin: '0 auto', padding: '24px 16px' }}>
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 24 }}>
        <div>
          <h1 style={{ fontSize: 24, fontWeight: 700, color: '#111827', margin: '0 0 4px' }}>
            Bug Reports
          </h1>
          <p style={{ fontSize: 14, color: '#6b7280', margin: 0 }}>
            {count} report{count !== 1 ? 's' : ''} — auto-refreshes every 60s
          </p>
        </div>
        <button
          onClick={fetchBugs}
          disabled={loading}
          style={{
            padding: '8px 16px',
            borderRadius: 8,
            border: '1px solid #d1d5db',
            background: '#fff',
            color: '#374151',
            fontSize: 13,
            fontWeight: 500,
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            gap: 6
          }}
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor"
            strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"
            style={{ animation: loading ? 'spin 1s linear infinite' : 'none' }}>
            <polyline points="23 4 23 10 17 10" />
            <polyline points="1 20 1 14 7 14" />
            <path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15" />
          </svg>
          Refresh
        </button>
      </div>

      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>

      {/* Filters */}
      <FilterBar
        severity={severity}
        status={status}
        onSeverityChange={setSeverity}
        onStatusChange={setStatus}
      />

      {/* Table */}
      <div style={{
        background: '#fff',
        borderRadius: 12,
        boxShadow: '0 1px 3px rgba(0,0,0,0.08)',
        border: '1px solid #e5e7eb',
        overflow: 'hidden'
      }}>
        {loading && bugs.length === 0 ? (
          <div style={{ padding: 48, textAlign: 'center', color: '#6b7280' }}>
            Loading bug reports...
          </div>
        ) : bugs.length === 0 ? (
          <div style={{ padding: 48, textAlign: 'center', color: '#9ca3af' }}>
            No bug reports found
          </div>
        ) : (
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr style={{ borderBottom: '2px solid #e5e7eb' }}>
                <th style={{ ...thStyle, width: 50 }}>#</th>
                <th style={{ ...thStyle, width: 90 }}>Severity</th>
                <th style={thStyle}>Title</th>
                <th style={{ ...thStyle, width: 120 }}>Reported By</th>
                <th style={{ ...thStyle, width: 150 }}>Page</th>
                <th style={{ ...thStyle, width: 100 }}>Status</th>
                <th style={{ ...thStyle, width: 100, textAlign: 'right' }}>Time</th>
              </tr>
            </thead>
            <tbody>
              {bugs.map((bug) => (
                <React.Fragment key={bug.id}>
                  <tr
                    onClick={() => toggleRow(bug.id)}
                    style={{
                      borderBottom: expandedId === bug.id ? 'none' : '1px solid #f3f4f6',
                      cursor: 'pointer',
                      background: expandedId === bug.id ? '#f0f4ff' : '#fff',
                      transition: 'background 0.1s'
                    }}
                    onMouseEnter={(e) => {
                      if (expandedId !== bug.id) e.currentTarget.style.background = '#f9fafb';
                    }}
                    onMouseLeave={(e) => {
                      if (expandedId !== bug.id) e.currentTarget.style.background = '#fff';
                    }}
                  >
                    <td style={{ ...tdStyle, fontWeight: 600, color: '#9ca3af' }}>{bug.id}</td>
                    <td style={tdStyle}><Badge value={bug.severity} colorMap={SEVERITY_BADGE} /></td>
                    <td style={{
                      ...tdStyle,
                      fontWeight: 500,
                      maxWidth: 350,
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                      whiteSpace: 'nowrap'
                    }}>
                      {bug.title}
                    </td>
                    <td style={tdStyle}>{bug.reported_by || '-'}</td>
                    <td style={{
                      ...tdStyle,
                      fontSize: 12,
                      color: '#6b7280',
                      maxWidth: 150,
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                      whiteSpace: 'nowrap',
                      fontFamily: 'monospace'
                    }}>
                      {bug.page || '-'}
                    </td>
                    <td style={tdStyle}><Badge value={bug.status} colorMap={STATUS_BADGE} /></td>
                    <td style={{ ...tdStyle, textAlign: 'right', color: '#6b7280', fontSize: 12 }}>
                      {relativeTime(bug.created_at)}
                    </td>
                  </tr>
                  {expandedId === bug.id && (
                    <ExpandedDetail bug={bug} onSaved={fetchBugs} />
                  )}
                </React.Fragment>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
