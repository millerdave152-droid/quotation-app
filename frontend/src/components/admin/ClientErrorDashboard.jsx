/**
 * TeleTime - Client Error Dashboard
 * Admin dashboard for viewing and managing POS/web client-side errors.
 * Tabs: Overview (stats), Error Groups (table), Detail drawer.
 */

import React, { useState, useEffect, useCallback } from 'react';
import { authFetch } from '../../services/authFetch';

const API_URL = process.env.REACT_APP_API_URL || 'http://localhost:3001';

// ============================================================================
// HELPERS
// ============================================================================

const severityColors = {
  fatal:   { bg: '#fee2e2', text: '#991b1b', border: '#fca5a5' },
  error:   { bg: '#fed7aa', text: '#c2410c', border: '#fdba74' },
  warning: { bg: '#fef3c7', text: '#92400e', border: '#fcd34d' },
  info:    { bg: '#dbeafe', text: '#1e40af', border: '#93c5fd' },
  debug:   { bg: '#f3f4f6', text: '#374151', border: '#d1d5db' },
};

const statusColors = {
  open:         { bg: '#fee2e2', text: '#991b1b' },
  acknowledged: { bg: '#fef3c7', text: '#92400e' },
  resolved:     { bg: '#d1fae5', text: '#065f46' },
  ignored:      { bg: '#f3f4f6', text: '#6b7280' },
};

function Badge({ value, colorMap }) {
  const c = colorMap[value] || { bg: '#f3f4f6', text: '#6b7280' };
  return (
    <span style={{
      display: 'inline-block', padding: '2px 10px', borderRadius: 12,
      fontSize: 12, fontWeight: 600, background: c.bg, color: c.text,
      textTransform: 'capitalize',
    }}>
      {(value || '').replace(/_/g, ' ')}
    </span>
  );
}

const fmt = (d) => {
  if (!d) return '-';
  return new Date(d).toLocaleDateString('en-CA', {
    year: 'numeric', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit',
  });
};

// ============================================================================
// STAT CARD
// ============================================================================

function StatCard({ label, value, color }) {
  return (
    <div style={{
      flex: '1 1 180px', background: '#fff', borderRadius: 12, padding: '20px 24px',
      boxShadow: '0 1px 3px rgba(0,0,0,0.08)', borderLeft: `4px solid ${color || '#6366f1'}`,
    }}>
      <div style={{ fontSize: 13, color: '#6b7280', marginBottom: 4 }}>{label}</div>
      <div style={{ fontSize: 28, fontWeight: 700, color: '#111827' }}>{value ?? '-'}</div>
    </div>
  );
}

// ============================================================================
// MAIN DASHBOARD
// ============================================================================

export default function ClientErrorDashboard() {
  const [tab, setTab] = useState('overview'); // overview | groups
  const [stats, setStats] = useState(null);
  const [groups, setGroups] = useState([]);
  const [pagination, setPagination] = useState({ page: 1, limit: 25, total: 0, totalPages: 0 });
  const [filters, setFilters] = useState({ status: '', severity: '', error_type: '', search: '' });
  const [loading, setLoading] = useState(false);
  const [detail, setDetail] = useState(null); // selected group detail (drawer)
  const [detailLoading, setDetailLoading] = useState(false);

  // ---- Fetch stats ----
  const fetchStats = useCallback(async () => {
    try {
      const res = await authFetch(`${API_URL}/api/errors/client/stats`);
      if (res.ok) {
        const json = await res.json();
        setStats(json.data);
      }
    } catch (e) {
      console.error('[ClientErrorDashboard] stats fetch failed', e);
    }
  }, []);

  // ---- Fetch groups ----
  const fetchGroups = useCallback(async (page = 1) => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      params.set('page', page);
      params.set('limit', pagination.limit);
      if (filters.status) params.set('status', filters.status);
      if (filters.severity) params.set('severity', filters.severity);
      if (filters.error_type) params.set('error_type', filters.error_type);
      if (filters.search) params.set('search', filters.search);

      const res = await authFetch(`${API_URL}/api/errors/client?${params}`);
      if (res.ok) {
        const json = await res.json();
        setGroups(json.data.groups || []);
        setPagination(json.data.pagination || { page: 1, limit: 25, total: 0, totalPages: 0 });
      }
    } catch (e) {
      console.error('[ClientErrorDashboard] groups fetch failed', e);
    } finally {
      setLoading(false);
    }
  }, [filters, pagination.limit]);

  // ---- Fetch group detail ----
  const fetchDetail = useCallback(async (id) => {
    setDetailLoading(true);
    try {
      const res = await authFetch(`${API_URL}/api/errors/client/${id}`);
      if (res.ok) {
        const json = await res.json();
        setDetail(json.data);
      }
    } catch (e) {
      console.error('[ClientErrorDashboard] detail fetch failed', e);
    } finally {
      setDetailLoading(false);
    }
  }, []);

  // ---- Update status ----
  const updateStatus = useCallback(async (id, status) => {
    try {
      await authFetch(`${API_URL}/api/errors/client/${id}/status`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status }),
      });
      fetchGroups(pagination.page);
      fetchStats();
      if (detail?.id === id) fetchDetail(id);
    } catch (e) {
      console.error('[ClientErrorDashboard] status update failed', e);
    }
  }, [pagination.page, detail, fetchGroups, fetchStats, fetchDetail]);

  // ---- Bulk status ----
  const [selected, setSelected] = useState(new Set());

  const bulkUpdate = useCallback(async (status) => {
    if (selected.size === 0) return;
    try {
      await authFetch(`${API_URL}/api/errors/client/bulk-status`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ groupIds: [...selected], status }),
      });
      setSelected(new Set());
      fetchGroups(pagination.page);
      fetchStats();
    } catch (e) {
      console.error('[ClientErrorDashboard] bulk update failed', e);
    }
  }, [selected, pagination.page, fetchGroups, fetchStats]);

  // ---- Initial load ----
  useEffect(() => { fetchStats(); }, [fetchStats]);
  useEffect(() => { fetchGroups(1); }, [fetchGroups]);

  // ============================================================================
  // RENDER
  // ============================================================================

  const tabs = [
    { key: 'overview', label: 'Overview' },
    { key: 'groups', label: 'Error Groups' },
  ];

  return (
    <div style={{ maxWidth: 1200, margin: '0 auto', padding: '24px 16px' }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 24 }}>
        <div>
          <h1 style={{ fontSize: 24, fontWeight: 700, margin: 0 }}>Client Error Tracking</h1>
          <p style={{ color: '#6b7280', margin: '4px 0 0' }}>
            POS and web client-side error monitoring
          </p>
        </div>
        <button
          onClick={() => { fetchStats(); fetchGroups(pagination.page); }}
          style={{
            padding: '8px 16px', borderRadius: 8, border: '1px solid #d1d5db',
            background: '#fff', cursor: 'pointer', fontSize: 13, fontWeight: 500,
          }}
        >
          Refresh
        </button>
      </div>

      {/* Tabs */}
      <div style={{ display: 'flex', gap: 8, marginBottom: 24, borderBottom: '2px solid #e5e7eb', paddingBottom: 0 }}>
        {tabs.map(t => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            style={{
              padding: '8px 20px', border: 'none', cursor: 'pointer', fontSize: 14, fontWeight: 600,
              background: 'none', borderBottom: tab === t.key ? '2px solid #6366f1' : '2px solid transparent',
              color: tab === t.key ? '#6366f1' : '#6b7280', marginBottom: -2,
            }}
          >
            {t.label}
          </button>
        ))}
      </div>

      {/* Overview Tab */}
      {tab === 'overview' && stats && (
        <div>
          {/* Stat Cards */}
          <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap', marginBottom: 32 }}>
            <StatCard label="Total Errors (7d)" value={stats.totalErrors} color="#ef4444" />
            <StatCard label="Affected Users" value={stats.affectedUsers} color="#f59e0b" />
            <StatCard label="Open Groups" value={stats.openGroups} color="#6366f1" />
          </div>

          {/* By Severity */}
          <div style={{ display: 'flex', gap: 24, flexWrap: 'wrap', marginBottom: 32 }}>
            <div style={{ flex: '1 1 300px', background: '#fff', borderRadius: 12, padding: 20, boxShadow: '0 1px 3px rgba(0,0,0,0.08)' }}>
              <h3 style={{ fontSize: 15, fontWeight: 600, marginBottom: 12 }}>By Severity</h3>
              {(stats.bySeverity || []).map(s => (
                <div key={s.severity} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '6px 0' }}>
                  <Badge value={s.severity} colorMap={severityColors} />
                  <span style={{ fontWeight: 600 }}>{s.count}</span>
                </div>
              ))}
              {(!stats.bySeverity || stats.bySeverity.length === 0) && (
                <div style={{ color: '#9ca3af', fontSize: 13 }}>No data</div>
              )}
            </div>

            <div style={{ flex: '1 1 300px', background: '#fff', borderRadius: 12, padding: 20, boxShadow: '0 1px 3px rgba(0,0,0,0.08)' }}>
              <h3 style={{ fontSize: 15, fontWeight: 600, marginBottom: 12 }}>By Type</h3>
              {(stats.byType || []).map(t => (
                <div key={t.error_type} style={{ display: 'flex', justifyContent: 'space-between', padding: '6px 0' }}>
                  <span style={{ fontSize: 13, textTransform: 'capitalize' }}>{t.error_type}</span>
                  <span style={{ fontWeight: 600 }}>{t.count}</span>
                </div>
              ))}
              {(!stats.byType || stats.byType.length === 0) && (
                <div style={{ color: '#9ca3af', fontSize: 13 }}>No data</div>
              )}
            </div>
          </div>

          {/* Top Errors */}
          <div style={{ background: '#fff', borderRadius: 12, padding: 20, boxShadow: '0 1px 3px rgba(0,0,0,0.08)' }}>
            <h3 style={{ fontSize: 15, fontWeight: 600, marginBottom: 12 }}>Top Errors (7d)</h3>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
              <thead>
                <tr style={{ borderBottom: '1px solid #e5e7eb' }}>
                  <th style={{ textAlign: 'left', padding: '8px 4px', color: '#6b7280', fontWeight: 500 }}>Message</th>
                  <th style={{ textAlign: 'center', padding: '8px 4px', color: '#6b7280', fontWeight: 500 }}>Severity</th>
                  <th style={{ textAlign: 'right', padding: '8px 4px', color: '#6b7280', fontWeight: 500 }}>Count</th>
                  <th style={{ textAlign: 'right', padding: '8px 4px', color: '#6b7280', fontWeight: 500 }}>Users</th>
                </tr>
              </thead>
              <tbody>
                {(stats.topErrors || []).map(e => (
                  <tr key={e.id} style={{ borderBottom: '1px solid #f3f4f6' }}>
                    <td style={{ padding: '8px 4px', maxWidth: 400, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {e.message}
                    </td>
                    <td style={{ padding: '8px 4px', textAlign: 'center' }}>
                      <Badge value={e.severity} colorMap={severityColors} />
                    </td>
                    <td style={{ padding: '8px 4px', textAlign: 'right', fontWeight: 600 }}>{e.occurrence_count}</td>
                    <td style={{ padding: '8px 4px', textAlign: 'right' }}>{e.affected_users}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            {(!stats.topErrors || stats.topErrors.length === 0) && (
              <div style={{ textAlign: 'center', padding: 24, color: '#9ca3af' }}>No errors recorded in this period</div>
            )}
          </div>
        </div>
      )}

      {tab === 'overview' && !stats && (
        <div style={{ textAlign: 'center', padding: 48, color: '#9ca3af' }}>Loading stats...</div>
      )}

      {/* Groups Tab */}
      {tab === 'groups' && (
        <div>
          {/* Filters Row */}
          <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', marginBottom: 16, alignItems: 'center' }}>
            <input
              placeholder="Search errors..."
              value={filters.search}
              onChange={e => setFilters(f => ({ ...f, search: e.target.value }))}
              style={{
                padding: '8px 12px', borderRadius: 8, border: '1px solid #d1d5db',
                fontSize: 13, width: 220,
              }}
            />
            <select
              value={filters.status}
              onChange={e => setFilters(f => ({ ...f, status: e.target.value }))}
              style={{ padding: '8px 12px', borderRadius: 8, border: '1px solid #d1d5db', fontSize: 13 }}
            >
              <option value="">All Statuses</option>
              <option value="open">Open</option>
              <option value="acknowledged">Acknowledged</option>
              <option value="resolved">Resolved</option>
              <option value="ignored">Ignored</option>
            </select>
            <select
              value={filters.severity}
              onChange={e => setFilters(f => ({ ...f, severity: e.target.value }))}
              style={{ padding: '8px 12px', borderRadius: 8, border: '1px solid #d1d5db', fontSize: 13 }}
            >
              <option value="">All Severities</option>
              <option value="fatal">Fatal</option>
              <option value="error">Error</option>
              <option value="warning">Warning</option>
              <option value="info">Info</option>
            </select>
            <select
              value={filters.error_type}
              onChange={e => setFilters(f => ({ ...f, error_type: e.target.value }))}
              style={{ padding: '8px 12px', borderRadius: 8, border: '1px solid #d1d5db', fontSize: 13 }}
            >
              <option value="">All Types</option>
              <option value="runtime">Runtime</option>
              <option value="render">Render</option>
              <option value="network">Network</option>
              <option value="unhandled">Unhandled</option>
            </select>

            {selected.size > 0 && (
              <div style={{ display: 'flex', gap: 8, marginLeft: 'auto' }}>
                <span style={{ fontSize: 13, color: '#6b7280', alignSelf: 'center' }}>
                  {selected.size} selected:
                </span>
                <button onClick={() => bulkUpdate('acknowledged')} style={bulkBtnStyle}>Acknowledge</button>
                <button onClick={() => bulkUpdate('resolved')} style={{ ...bulkBtnStyle, background: '#d1fae5', color: '#065f46' }}>Resolve</button>
                <button onClick={() => bulkUpdate('ignored')} style={{ ...bulkBtnStyle, background: '#f3f4f6', color: '#6b7280' }}>Ignore</button>
              </div>
            )}
          </div>

          {/* Table */}
          <div style={{ background: '#fff', borderRadius: 12, boxShadow: '0 1px 3px rgba(0,0,0,0.08)', overflow: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
              <thead>
                <tr style={{ borderBottom: '2px solid #e5e7eb' }}>
                  <th style={thStyle}>
                    <input
                      type="checkbox"
                      checked={groups.length > 0 && selected.size === groups.length}
                      onChange={e => {
                        if (e.target.checked) setSelected(new Set(groups.map(g => g.id)));
                        else setSelected(new Set());
                      }}
                    />
                  </th>
                  <th style={thStyle}>Message</th>
                  <th style={{ ...thStyle, textAlign: 'center' }}>Status</th>
                  <th style={{ ...thStyle, textAlign: 'center' }}>Severity</th>
                  <th style={{ ...thStyle, textAlign: 'center' }}>Type</th>
                  <th style={{ ...thStyle, textAlign: 'right' }}>Count</th>
                  <th style={{ ...thStyle, textAlign: 'right' }}>Users</th>
                  <th style={{ ...thStyle, textAlign: 'right' }}>Last Seen</th>
                  <th style={{ ...thStyle, textAlign: 'center' }}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {loading ? (
                  <tr><td colSpan={9} style={{ padding: 40, textAlign: 'center', color: '#9ca3af' }}>Loading...</td></tr>
                ) : groups.length === 0 ? (
                  <tr><td colSpan={9} style={{ padding: 40, textAlign: 'center', color: '#9ca3af' }}>No error groups found</td></tr>
                ) : groups.map(g => (
                  <tr
                    key={g.id}
                    style={{ borderBottom: '1px solid #f3f4f6', cursor: 'pointer' }}
                    onClick={() => fetchDetail(g.id)}
                  >
                    <td style={tdStyle} onClick={e => e.stopPropagation()}>
                      <input
                        type="checkbox"
                        checked={selected.has(g.id)}
                        onChange={e => {
                          const next = new Set(selected);
                          if (e.target.checked) next.add(g.id); else next.delete(g.id);
                          setSelected(next);
                        }}
                      />
                    </td>
                    <td style={{ ...tdStyle, maxWidth: 350, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {g.message}
                    </td>
                    <td style={{ ...tdStyle, textAlign: 'center' }}><Badge value={g.status} colorMap={statusColors} /></td>
                    <td style={{ ...tdStyle, textAlign: 'center' }}><Badge value={g.severity} colorMap={severityColors} /></td>
                    <td style={{ ...tdStyle, textAlign: 'center', textTransform: 'capitalize' }}>{g.error_type}</td>
                    <td style={{ ...tdStyle, textAlign: 'right', fontWeight: 600 }}>{g.occurrence_count}</td>
                    <td style={{ ...tdStyle, textAlign: 'right' }}>{g.affected_users}</td>
                    <td style={{ ...tdStyle, textAlign: 'right', fontSize: 12, color: '#6b7280' }}>{fmt(g.last_seen)}</td>
                    <td style={{ ...tdStyle, textAlign: 'center' }} onClick={e => e.stopPropagation()}>
                      <select
                        value={g.status}
                        onChange={e => updateStatus(g.id, e.target.value)}
                        style={{ fontSize: 12, padding: '2px 6px', borderRadius: 6, border: '1px solid #d1d5db' }}
                      >
                        <option value="open">Open</option>
                        <option value="acknowledged">Acknowledged</option>
                        <option value="resolved">Resolved</option>
                        <option value="ignored">Ignored</option>
                      </select>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Pagination */}
          {pagination.totalPages > 1 && (
            <div style={{ display: 'flex', justifyContent: 'center', gap: 8, marginTop: 16 }}>
              <button
                disabled={pagination.page <= 1}
                onClick={() => fetchGroups(pagination.page - 1)}
                style={pageBtnStyle}
              >
                Prev
              </button>
              <span style={{ fontSize: 13, alignSelf: 'center', color: '#6b7280' }}>
                Page {pagination.page} of {pagination.totalPages} ({pagination.total} total)
              </span>
              <button
                disabled={pagination.page >= pagination.totalPages}
                onClick={() => fetchGroups(pagination.page + 1)}
                style={pageBtnStyle}
              >
                Next
              </button>
            </div>
          )}
        </div>
      )}

      {/* Detail Drawer */}
      {detail && (
        <div
          style={{
            position: 'fixed', top: 0, right: 0, bottom: 0, width: 540,
            background: '#fff', boxShadow: '-4px 0 20px rgba(0,0,0,0.15)', zIndex: 1000,
            overflow: 'auto', padding: 24,
          }}
        >
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
            <h2 style={{ fontSize: 18, fontWeight: 700, margin: 0 }}>Error Detail</h2>
            <button onClick={() => setDetail(null)} style={{ border: 'none', background: 'none', fontSize: 22, cursor: 'pointer' }}>x</button>
          </div>

          {detailLoading ? (
            <div style={{ textAlign: 'center', padding: 40, color: '#9ca3af' }}>Loading...</div>
          ) : (
            <>
              {/* Group Meta */}
              <div style={{ marginBottom: 16, display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                <Badge value={detail.status} colorMap={statusColors} />
                <Badge value={detail.severity} colorMap={severityColors} />
                <span style={{ fontSize: 12, color: '#6b7280', alignSelf: 'center' }}>{detail.error_type}</span>
              </div>
              <div style={{ background: '#f9fafb', borderRadius: 8, padding: 12, marginBottom: 16 }}>
                <div style={{ fontWeight: 600, fontSize: 14, marginBottom: 4 }}>{detail.message}</div>
                <div style={{ fontSize: 12, color: '#6b7280' }}>
                  Fingerprint: <code>{detail.fingerprint}</code>
                </div>
                <div style={{ fontSize: 12, color: '#6b7280', marginTop: 2 }}>
                  First seen: {fmt(detail.first_seen)} | Last seen: {fmt(detail.last_seen)}
                </div>
                <div style={{ fontSize: 12, color: '#6b7280', marginTop: 2 }}>
                  Occurrences: <strong>{detail.occurrence_count}</strong> | Affected users: <strong>{detail.affected_users}</strong>
                </div>
                {detail.resolved_by_name && (
                  <div style={{ fontSize: 12, color: '#6b7280', marginTop: 2 }}>
                    Resolved by: {detail.resolved_by_name} at {fmt(detail.resolved_at)}
                  </div>
                )}
                {detail.notes && (
                  <div style={{ fontSize: 12, marginTop: 8, padding: 8, background: '#fff', borderRadius: 6, border: '1px solid #e5e7eb' }}>
                    {detail.notes}
                  </div>
                )}
              </div>

              {/* Status Actions */}
              <div style={{ display: 'flex', gap: 8, marginBottom: 20 }}>
                {['open', 'acknowledged', 'resolved', 'ignored'].map(s => (
                  <button
                    key={s}
                    disabled={detail.status === s}
                    onClick={() => updateStatus(detail.id, s)}
                    style={{
                      padding: '6px 14px', borderRadius: 8, border: '1px solid #d1d5db',
                      fontSize: 12, fontWeight: 500, cursor: detail.status === s ? 'default' : 'pointer',
                      background: detail.status === s ? '#e5e7eb' : '#fff',
                      textTransform: 'capitalize', opacity: detail.status === s ? 0.5 : 1,
                    }}
                  >
                    {s}
                  </button>
                ))}
              </div>

              {/* Occurrences */}
              <h3 style={{ fontSize: 14, fontWeight: 600, marginBottom: 8 }}>Recent Occurrences</h3>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {(detail.occurrences || []).map((occ, idx) => (
                  <div key={occ.id || idx} style={{
                    background: '#f9fafb', borderRadius: 8, padding: 12, border: '1px solid #f3f4f6',
                  }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
                      <span style={{ fontSize: 12, color: '#6b7280' }}>{fmt(occ.created_at)}</span>
                      {occ.user_name && (
                        <span style={{ fontSize: 12, color: '#6b7280' }}>User: {occ.user_name}</span>
                      )}
                    </div>
                    {occ.url && <div style={{ fontSize: 11, color: '#9ca3af', marginBottom: 4 }}>{occ.url}</div>}
                    {occ.stack_trace && (
                      <pre style={{
                        fontSize: 11, background: '#1f2937', color: '#e5e7eb', borderRadius: 6,
                        padding: 8, overflow: 'auto', maxHeight: 160, whiteSpace: 'pre-wrap', margin: 0,
                      }}>
                        {occ.stack_trace}
                      </pre>
                    )}
                    {occ.component_stack && (
                      <details style={{ marginTop: 4 }}>
                        <summary style={{ fontSize: 11, color: '#6366f1', cursor: 'pointer' }}>Component Stack</summary>
                        <pre style={{
                          fontSize: 11, background: '#f3f4f6', borderRadius: 6,
                          padding: 8, overflow: 'auto', maxHeight: 120, whiteSpace: 'pre-wrap', margin: '4px 0 0',
                        }}>
                          {occ.component_stack}
                        </pre>
                      </details>
                    )}
                  </div>
                ))}
                {(!detail.occurrences || detail.occurrences.length === 0) && (
                  <div style={{ color: '#9ca3af', fontSize: 13, textAlign: 'center', padding: 20 }}>No occurrences</div>
                )}
              </div>
            </>
          )}
        </div>
      )}

      {/* Backdrop for drawer */}
      {detail && (
        <div
          onClick={() => setDetail(null)}
          style={{
            position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
            background: 'rgba(0,0,0,0.3)', zIndex: 999,
          }}
        />
      )}
    </div>
  );
}

// ============================================================================
// SHARED STYLES
// ============================================================================

const thStyle = { textAlign: 'left', padding: '10px 8px', color: '#6b7280', fontWeight: 500, fontSize: 12 };
const tdStyle = { padding: '10px 8px' };
const pageBtnStyle = {
  padding: '6px 14px', borderRadius: 8, border: '1px solid #d1d5db', background: '#fff',
  cursor: 'pointer', fontSize: 13,
};
const bulkBtnStyle = {
  padding: '4px 12px', borderRadius: 6, border: 'none', fontSize: 12,
  fontWeight: 500, cursor: 'pointer', background: '#fef3c7', color: '#92400e',
};
