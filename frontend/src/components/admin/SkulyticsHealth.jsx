import React, { useState, useEffect, useCallback, useRef } from 'react';
import { authFetch } from '../../services/authFetch';
import { useToast } from '../ui';
import { SkeletonStats, SkeletonTable } from '../ui';
import {
  Activity, Database, AlertTriangle, XCircle, Clock, RefreshCw,
  ChevronLeft, ChevronRight, Loader, Filter
} from 'lucide-react';

const API = '/api/admin/skulytics';

const formatDate = (d) => {
  if (!d) return '--';
  try {
    return new Date(d).toLocaleDateString('en-CA', {
      month: 'short', day: 'numeric', year: 'numeric',
      hour: '2-digit', minute: '2-digit',
    });
  } catch { return '--'; }
};

const formatRelative = (d) => {
  if (!d) return '--';
  const now = new Date();
  const then = new Date(d);
  const diffMs = now - then;
  const diffMin = Math.floor(diffMs / 60000);
  if (diffMin < 1) return 'Just now';
  if (diffMin < 60) return `${diffMin}m ago`;
  const diffHrs = Math.floor(diffMin / 60);
  if (diffHrs < 24) return `${diffHrs}h ago`;
  const diffDays = Math.floor(diffHrs / 24);
  return `${diffDays}d ago`;
};

const formatDuration = (secs) => {
  if (secs == null) return '--';
  if (secs < 60) return `${secs}s`;
  const mins = Math.floor(secs / 60);
  const rem = secs % 60;
  return `${mins}m ${rem}s`;
};

const syncStatusColors = {
  completed: { bg: '#d1fae5', color: '#065f46' },
  running: { bg: '#dbeafe', color: '#1e40af' },
  failed: { bg: '#fee2e2', color: '#991b1b' },
  partial: { bg: '#fef3c7', color: '#92400e' },
};

const SyncStatusBadge = ({ status }) => {
  const s = syncStatusColors[status] || { bg: '#f3f4f6', color: '#6b7280' };
  return (
    <span style={{
      display: 'inline-block', padding: '3px 10px', borderRadius: '12px',
      fontSize: '12px', fontWeight: 600, background: s.bg, color: s.color,
      textTransform: 'capitalize',
    }}>
      {status || '--'}
    </span>
  );
};

const TypeBadge = ({ type }) => {
  const colors = {
    incremental: { bg: '#ede9fe', color: '#5b21b6' },
    full: { bg: '#dbeafe', color: '#1e40af' },
    manual_sku: { bg: '#f3f4f6', color: '#6b7280' },
  };
  const s = colors[type] || colors.manual_sku;
  return (
    <span style={{
      display: 'inline-block', padding: '3px 10px', borderRadius: '12px',
      fontSize: '12px', fontWeight: 600, background: s.bg, color: s.color,
      textTransform: 'capitalize',
    }}>
      {(type || '--').replace(/_/g, ' ')}
    </span>
  );
};

// ── Tabs ─────────────────────────────────────────────────────

const TABS = [
  { id: 'overview', label: 'Overview' },
  { id: 'history', label: 'Sync History' },
];

// ── Main Component ───────────────────────────────────────────

const SkulyticsHealth = () => {
  const toast = useToast();
  const [activeTab, setActiveTab] = useState('overview');

  return (
    <div style={{ padding: '30px', fontFamily: 'system-ui, -apple-system, sans-serif', background: '#f9fafb', minHeight: 'calc(100vh - 140px)' }}>
      <div style={{ maxWidth: '1400px', margin: '0 auto' }}>
        {/* Header */}
        <div style={{ marginBottom: '24px' }}>
          <h1 style={{ margin: '0 0 6px 0', fontSize: '28px', fontWeight: 'bold', background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>
            Skulytics Sync Health
          </h1>
          <p style={{ margin: 0, color: '#6b7280', fontSize: '14px' }}>
            Monitor catalogue sync status, trigger syncs, and review run history
          </p>
        </div>

        {/* Tabs */}
        <div style={{ display: 'flex', gap: '4px', marginBottom: '24px', background: 'white', borderRadius: '10px', padding: '4px', boxShadow: '0 1px 3px rgba(0,0,0,0.08)', width: 'fit-content' }}>
          {TABS.map(tab => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              style={{
                padding: '10px 20px', borderRadius: '8px', border: 'none',
                fontSize: '14px', fontWeight: 600, cursor: 'pointer',
                background: activeTab === tab.id ? '#667eea' : 'transparent',
                color: activeTab === tab.id ? 'white' : '#6b7280',
                transition: 'all 0.15s',
              }}
            >
              {tab.label}
            </button>
          ))}
        </div>

        {activeTab === 'overview' && <OverviewTab toast={toast} />}
        {activeTab === 'history' && <HistoryTab toast={toast} />}
      </div>
    </div>
  );
};

// ── Overview Tab ─────────────────────────────────────────────

const OverviewTab = ({ toast }) => {
  const [health, setHealth] = useState(null);
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [syncStatus, setSyncStatus] = useState(null);
  const syncPollRef = useRef(null);
  const isMounted = useRef(true);

  useEffect(() => {
    isMounted.current = true;
    return () => { isMounted.current = false; if (syncPollRef.current) clearInterval(syncPollRef.current); };
  }, []);

  const fetchHealth = useCallback(async () => {
    setLoading(true);
    try {
      const res = await authFetch(`${API}/health`);
      const json = await res.json();
      if (!isMounted.current) return;
      if (json.success) setHealth(json.data);
    } catch { /* silent */ }
    finally { if (isMounted.current) setLoading(false); }
  }, []);

  useEffect(() => { fetchHealth(); }, [fetchHealth]);

  const pollSyncStatus = useCallback(async () => {
    try {
      const res = await authFetch(`${API}/sync/status`);
      const json = await res.json();
      if (!isMounted.current) return;
      if (json.success && json.data) {
        setSyncStatus(json.data);
        if (json.data.status !== 'running') {
          if (syncPollRef.current) { clearInterval(syncPollRef.current); syncPollRef.current = null; }
          setSyncing(false);
          fetchHealth();
          if (json.data.status === 'completed') {
            toast.success(`Sync completed: ${json.data.processed || 0} processed`);
          } else {
            toast.error(`Sync ended with status: ${json.data.status}`);
          }
        }
      }
    } catch { /* silent */ }
  }, [fetchHealth, toast]);

  const triggerSync = async (type) => {
    setSyncing(true);
    setSyncStatus(null);
    try {
      const res = await authFetch(`${API}/sync/trigger`, {
        method: 'POST', body: JSON.stringify({ type }),
      });
      if (res.status === 409) { toast.error('A sync is already running'); setSyncing(false); return; }
      if (res.status === 429) { toast.error('Rate limit exceeded. Wait a few minutes.'); setSyncing(false); return; }
      const json = await res.json();
      if (json.success) {
        toast.info(`${type === 'full' ? 'Full' : 'Incremental'} sync started...`);
        syncPollRef.current = setInterval(pollSyncStatus, 3000);
      } else {
        toast.error(json.error?.message || 'Failed to trigger sync');
        setSyncing(false);
      }
    } catch { toast.error('Failed to trigger sync'); setSyncing(false); }
  };

  if (loading) return <SkeletonStats count={4} />;
  if (!health) return <div style={{ padding: '40px', textAlign: 'center', color: '#9ca3af' }}>Failed to load health data</div>;

  const { catalog, recentSyncs } = health;

  return (
    <div>
      {/* Stat Cards */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '16px', marginBottom: '24px' }}>
        <StatCard label="Total SKUs" value={catalog.total_skus} icon={<Database size={20} />} color="#667eea" />
        <StatCard label="Stale SKUs" value={catalog.stale_skus} icon={<Clock size={20} />} color="#f59e0b" />
        <StatCard label="Discontinued" value={catalog.discontinued_skus} icon={<XCircle size={20} />} color="#ef4444" />
        <StatCard label="Overdue Sync" value={catalog.overdue_skus} icon={<AlertTriangle size={20} />} color="#dc2626" />
      </div>

      {/* Last Sync + Trigger */}
      <div style={{ background: 'white', borderRadius: '12px', boxShadow: '0 1px 3px rgba(0,0,0,0.08)', padding: '20px', marginBottom: '24px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '12px' }}>
          <div>
            <div style={{ fontSize: '13px', color: '#6b7280', marginBottom: '4px' }}>Last Sync</div>
            <div style={{ fontSize: '16px', fontWeight: 600, color: '#111827' }}>
              {catalog.most_recent_sync ? (
                <>
                  {formatDate(catalog.most_recent_sync)}
                  <span style={{ fontSize: '13px', color: '#9ca3af', marginLeft: '8px' }}>({formatRelative(catalog.most_recent_sync)})</span>
                </>
              ) : 'Never'}
            </div>
          </div>
          <div style={{ display: 'flex', gap: '10px', alignItems: 'center' }}>
            {syncing && syncStatus && (
              <span style={{ fontSize: '12px', color: '#667eea', fontWeight: 500 }}>
                {syncStatus.processed || 0} processed...
              </span>
            )}
            <button
              onClick={() => triggerSync('incremental')}
              disabled={syncing}
              style={{
                display: 'flex', alignItems: 'center', gap: '8px', padding: '10px 20px',
                background: '#667eea', color: 'white', border: 'none', borderRadius: '8px',
                fontSize: '14px', fontWeight: 600, cursor: syncing ? 'not-allowed' : 'pointer',
                opacity: syncing ? 0.7 : 1,
              }}
            >
              {syncing ? <Loader size={16} style={{ animation: 'spin 1s linear infinite' }} /> : <RefreshCw size={16} />}
              Incremental
            </button>
            <button
              onClick={() => triggerSync('full')}
              disabled={syncing}
              style={{
                display: 'flex', alignItems: 'center', gap: '8px', padding: '10px 20px',
                background: '#764ba2', color: 'white', border: 'none', borderRadius: '8px',
                fontSize: '14px', fontWeight: 600, cursor: syncing ? 'not-allowed' : 'pointer',
                opacity: syncing ? 0.7 : 1,
              }}
            >
              {syncing ? <Loader size={16} style={{ animation: 'spin 1s linear infinite' }} /> : <RefreshCw size={16} />}
              Full Sync
            </button>
          </div>
        </div>
        <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
      </div>

      {/* Recent Syncs Mini Table */}
      <div style={{ background: 'white', borderRadius: '12px', boxShadow: '0 1px 3px rgba(0,0,0,0.08)', overflow: 'hidden' }}>
        <div style={{ padding: '16px 20px', borderBottom: '1px solid #e5e7eb' }}>
          <h3 style={{ margin: 0, fontSize: '16px', fontWeight: 700, color: '#111827' }}>Recent Syncs</h3>
        </div>
        {recentSyncs && recentSyncs.length > 0 ? (
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr style={{ background: '#f9fafb', borderBottom: '2px solid #e5e7eb' }}>
                <th style={thStyle}>Type</th>
                <th style={thStyle}>Status</th>
                <th style={thStyle}>Processed</th>
                <th style={thStyle}>Failed</th>
                <th style={thStyle}>Duration</th>
                <th style={thStyle}>Started</th>
              </tr>
            </thead>
            <tbody>
              {recentSyncs.map(run => (
                <tr key={run.id} style={{ borderBottom: '1px solid #f3f4f6' }}>
                  <td style={tdStyle}><TypeBadge type={run.run_type} /></td>
                  <td style={tdStyle}><SyncStatusBadge status={run.status} /></td>
                  <td style={tdStyle}>{run.processed ?? '--'}</td>
                  <td style={tdStyle}>{run.failed ?? '--'}</td>
                  <td style={tdStyle}>{formatDuration(run.duration_seconds)}</td>
                  <td style={tdStyle}>{formatDate(run.started_at)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          <div style={{ padding: '40px', textAlign: 'center', color: '#9ca3af', fontSize: '14px' }}>
            No sync runs recorded yet
          </div>
        )}
      </div>
    </div>
  );
};

// ── History Tab ──────────────────────────────────────────────

const HistoryTab = ({ toast }) => {
  const [runs, setRuns] = useState([]);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [statusFilter, setStatusFilter] = useState('');
  const [typeFilter, setTypeFilter] = useState('');
  const isMounted = useRef(true);

  useEffect(() => {
    isMounted.current = true;
    return () => { isMounted.current = false; };
  }, []);

  const fetchHistory = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({ page, pageSize: 25 });
      if (statusFilter) params.set('status', statusFilter);
      if (typeFilter) params.set('type', typeFilter);

      const res = await authFetch(`${API}/sync/history?${params}`);
      const json = await res.json();
      if (!isMounted.current) return;
      if (json.success) {
        setRuns(json.data || []);
        const pag = json.meta?.pagination;
        if (pag) setTotalPages(pag.totalPages || 1);
      }
    } catch { /* silent */ }
    finally { if (isMounted.current) setLoading(false); }
  }, [page, statusFilter, typeFilter]);

  useEffect(() => { fetchHistory(); }, [fetchHistory]);
  useEffect(() => { setPage(1); }, [statusFilter, typeFilter]);

  return (
    <div>
      {/* Filters */}
      <div style={{
        display: 'flex', gap: '12px', alignItems: 'center', marginBottom: '20px',
        padding: '16px 20px', background: 'white', borderRadius: '12px',
        boxShadow: '0 1px 3px rgba(0,0,0,0.08)',
      }}>
        <Filter size={16} style={{ color: '#9ca3af' }} />
        <select
          value={statusFilter}
          onChange={e => setStatusFilter(e.target.value)}
          style={{ padding: '8px 12px', border: '1px solid #e5e7eb', borderRadius: '8px', fontSize: '14px', background: 'white', cursor: 'pointer' }}
        >
          <option value="">All Statuses</option>
          <option value="completed">Completed</option>
          <option value="running">Running</option>
          <option value="failed">Failed</option>
          <option value="partial">Partial</option>
        </select>
        <select
          value={typeFilter}
          onChange={e => setTypeFilter(e.target.value)}
          style={{ padding: '8px 12px', border: '1px solid #e5e7eb', borderRadius: '8px', fontSize: '14px', background: 'white', cursor: 'pointer' }}
        >
          <option value="">All Types</option>
          <option value="incremental">Incremental</option>
          <option value="full">Full</option>
          <option value="manual_sku">Manual SKU</option>
        </select>
        {(statusFilter || typeFilter) && (
          <button
            onClick={() => { setStatusFilter(''); setTypeFilter(''); }}
            style={{
              padding: '8px 14px', background: '#f3f4f6', color: '#374151', border: 'none',
              borderRadius: '8px', fontSize: '13px', fontWeight: 500, cursor: 'pointer',
            }}
          >
            Clear
          </button>
        )}
      </div>

      {/* Table */}
      <div style={{ background: 'white', borderRadius: '12px', boxShadow: '0 1px 3px rgba(0,0,0,0.08)', overflow: 'hidden' }}>
        {loading ? (
          <SkeletonTable rows={10} columns={9} />
        ) : runs.length === 0 ? (
          <div style={{ padding: '60px 20px', textAlign: 'center', color: '#9ca3af' }}>
            <Activity size={48} style={{ marginBottom: '16px', opacity: 0.4 }} />
            <div style={{ fontSize: '16px', fontWeight: 500 }}>No sync runs found</div>
          </div>
        ) : (
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr style={{ background: '#f9fafb', borderBottom: '2px solid #e5e7eb' }}>
                <th style={thStyle}>ID</th>
                <th style={thStyle}>Type</th>
                <th style={thStyle}>Status</th>
                <th style={thStyle}>Triggered By</th>
                <th style={thStyle}>Processed</th>
                <th style={thStyle}>Created</th>
                <th style={thStyle}>Updated</th>
                <th style={thStyle}>Failed</th>
                <th style={thStyle}>Duration</th>
                <th style={thStyle}>Started At</th>
              </tr>
            </thead>
            <tbody>
              {runs.map(run => (
                <tr key={run.id} style={{ borderBottom: '1px solid #f3f4f6' }}
                  onMouseEnter={e => e.currentTarget.style.background = '#f9fafb'}
                  onMouseLeave={e => e.currentTarget.style.background = 'white'}
                >
                  <td style={tdStyle}>
                    <span style={{ fontFamily: 'monospace', fontSize: '12px', color: '#6b7280' }}>
                      {typeof run.id === 'string' ? run.id.slice(0, 8) : run.id}
                    </span>
                  </td>
                  <td style={tdStyle}><TypeBadge type={run.run_type} /></td>
                  <td style={tdStyle}><SyncStatusBadge status={run.status} /></td>
                  <td style={tdStyle}>
                    <span style={{ fontSize: '13px', color: '#374151' }}>{run.triggered_by || '--'}</span>
                  </td>
                  <td style={tdStyle}>{run.processed ?? '--'}</td>
                  <td style={tdStyle}>
                    <span style={{ color: '#065f46', fontWeight: 500 }}>{run.created ?? '--'}</span>
                  </td>
                  <td style={tdStyle}>
                    <span style={{ color: '#1e40af', fontWeight: 500 }}>{run.updated ?? '--'}</span>
                  </td>
                  <td style={tdStyle}>
                    <span style={{ color: run.failed > 0 ? '#991b1b' : '#374151', fontWeight: run.failed > 0 ? 600 : 400 }}>
                      {run.failed ?? '--'}
                    </span>
                  </td>
                  <td style={tdStyle}>{formatDuration(run.duration_seconds)}</td>
                  <td style={tdStyle}>
                    <span style={{ fontSize: '13px' }}>{formatDate(run.started_at)}</span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* Pagination */}
      {totalPages > 1 && (
        <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', gap: '16px', marginTop: '20px' }}>
          <button
            disabled={page <= 1}
            onClick={() => setPage(p => Math.max(1, p - 1))}
            style={{
              display: 'flex', alignItems: 'center', gap: '6px', padding: '8px 16px',
              border: '1px solid #e5e7eb', borderRadius: '8px', background: 'white',
              fontSize: '13px', fontWeight: 500, cursor: page <= 1 ? 'not-allowed' : 'pointer',
              opacity: page <= 1 ? 0.5 : 1,
            }}
          >
            <ChevronLeft size={14} /> Previous
          </button>
          <span style={{ fontSize: '13px', color: '#6b7280' }}>
            Page {page} of {totalPages}
          </span>
          <button
            disabled={page >= totalPages}
            onClick={() => setPage(p => Math.min(totalPages, p + 1))}
            style={{
              display: 'flex', alignItems: 'center', gap: '6px', padding: '8px 16px',
              border: '1px solid #e5e7eb', borderRadius: '8px', background: 'white',
              fontSize: '13px', fontWeight: 500, cursor: page >= totalPages ? 'not-allowed' : 'pointer',
              opacity: page >= totalPages ? 0.5 : 1,
            }}
          >
            Next <ChevronRight size={14} />
          </button>
        </div>
      )}
    </div>
  );
};

// ── Stat Card ────────────────────────────────────────────────

const StatCard = ({ label, value, icon, color }) => (
  <div style={{
    background: 'white', padding: '20px', borderRadius: '12px',
    boxShadow: '0 1px 3px rgba(0,0,0,0.08)', borderLeft: `4px solid ${color}`,
    display: 'flex', alignItems: 'center', gap: '16px',
  }}>
    <div style={{
      width: '44px', height: '44px', borderRadius: '10px',
      background: `${color}15`, display: 'flex', alignItems: 'center', justifyContent: 'center',
      color,
    }}>
      {icon}
    </div>
    <div>
      <div style={{ fontSize: '24px', fontWeight: 700, color: '#111827' }}>
        {value != null ? value.toLocaleString() : '--'}
      </div>
      <div style={{ fontSize: '13px', color: '#6b7280', fontWeight: 500 }}>{label}</div>
    </div>
  </div>
);

// ── Shared Styles ────────────────────────────────────────────

const thStyle = {
  padding: '12px 16px', textAlign: 'left', fontSize: '12px', fontWeight: 600,
  color: '#6b7280', textTransform: 'uppercase', letterSpacing: '0.05em',
};

const tdStyle = {
  padding: '12px 16px', fontSize: '14px', verticalAlign: 'middle',
};

export default SkulyticsHealth;
