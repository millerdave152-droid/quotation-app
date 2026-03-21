/**
 * TeleTime - TransactionReviewQueue
 * Full-featured review queue for flagged fraud transactions.
 *
 * Sources data from fraud_scores (action_taken IN flagged/held/escalated, unreviewed).
 * Features: sortable columns, comprehensive filters, search, expandable detail panel
 * with signal bar chart, review actions, batch operations, stats summary bar.
 */

import React, { useState, useEffect, useCallback, useRef } from 'react';
import { authFetch } from '../../services/authFetch';

const API = process.env.REACT_APP_API_URL || '';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const riskColor = (score) => {
  if (score >= 80) return '#dc2626';
  if (score >= 60) return '#ea580c';
  if (score >= 30) return '#d97706';
  return '#16a34a';
};

const riskLevelBadge = (level) => {
  const map = {
    critical: { bg: '#fee2e2', fg: '#991b1b' },
    high:     { bg: '#fed7aa', fg: '#c2410c' },
    medium:   { bg: '#fef3c7', fg: '#92400e' },
    low:      { bg: '#f0fdf4', fg: '#166534' },
  };
  return map[level] || map.medium;
};

const actionBadge = (action) => {
  const map = {
    flagged:          { bg: '#fef3c7', fg: '#92400e', label: 'Flagged' },
    held:             { bg: '#fed7aa', fg: '#c2410c', label: 'Held' },
    escalated:        { bg: '#fee2e2', fg: '#991b1b', label: 'Escalated' },
    approved:         { bg: '#d1fae5', fg: '#065f46', label: 'Approved' },
    confirmed_fraud:  { bg: '#fecaca', fg: '#7f1d1d', label: 'Confirmed Fraud' },
    override_approved:{ bg: '#dbeafe', fg: '#1e40af', label: 'Override' },
  };
  return map[action] || { bg: '#f3f4f6', fg: '#6b7280', label: action || '—' };
};

const fmtDate = (d) => {
  if (!d) return '—';
  return new Date(d).toLocaleDateString('en-CA', {
    month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit',
  });
};

const fmtCurrency = (v) => {
  const n = parseFloat(v) || 0;
  return `$${n.toLocaleString('en-CA', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
};

const fmtEntry = (e) => {
  if (!e) return '—';
  const map = { chip: 'Chip', swipe: 'Swipe', contactless: 'Tap', manual: 'Manual', fallback: 'Fallback' };
  return map[e.toLowerCase()] || e;
};

const signalLabel = (key) => {
  const map = {
    velocity_card: 'Card Velocity',
    amount_anomaly: 'Amount Anomaly',
    bin_risk: 'BIN Risk',
    time_anomaly: 'Off-Hours',
    decline_history: 'Decline History',
    employee_risk: 'Employee Risk',
    entry_method_risk: 'Entry Method',
    pattern_risk: 'Pattern Risk',
    customer_risk: 'Customer Risk',
    split_transaction: 'Split Transaction',
    card_testing: 'Card Testing',
    geographic_anomaly: 'Geo Anomaly',
  };
  return map[key] || key.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
};

const timeAgo = (d) => {
  if (!d) return '—';
  const mins = Math.floor((Date.now() - new Date(d).getTime()) / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.floor(hrs / 24)}d ago`;
};

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

function StatsSummary({ stats, loading }) {
  if (loading || !stats) {
    return (
      <div style={styles.statsBar}>
        <span style={{ color: '#9ca3af', fontSize: 13 }}>Loading stats...</span>
      </div>
    );
  }

  const byRisk = stats.by_risk_level || {};
  return (
    <div style={styles.statsBar}>
      <div style={styles.statItem}>
        <span style={styles.statValue}>{stats.total_pending}</span>
        <span style={styles.statLabel}>Pending Review</span>
      </div>
      <div style={styles.statDivider} />
      {['critical', 'high', 'medium', 'low'].map(level => {
        const badge = riskLevelBadge(level);
        const count = byRisk[level] || 0;
        return (
          <div key={level} style={styles.statItem}>
            <span style={{
              ...styles.statValue,
              color: badge.fg, fontSize: 18,
            }}>{count}</span>
            <span style={{ ...styles.statLabel, textTransform: 'capitalize' }}>{level}</span>
          </div>
        );
      })}
      <div style={styles.statDivider} />
      <div style={styles.statItem}>
        <span style={styles.statValue}>
          {stats.avg_review_minutes > 0 ? `${stats.avg_review_minutes}m` : '—'}
        </span>
        <span style={styles.statLabel}>Avg Review Time</span>
      </div>
      <div style={styles.statItem}>
        <span style={{ ...styles.statValue, fontSize: 13 }}>
          {stats.oldest_unreviewed ? timeAgo(stats.oldest_unreviewed) : '—'}
        </span>
        <span style={styles.statLabel}>Oldest Pending</span>
      </div>
    </div>
  );
}

function SignalBarChart({ signals }) {
  const parsed = typeof signals === 'string' ? JSON.parse(signals) : (signals || {});
  const entries = Object.entries(parsed)
    .map(([key, val]) => {
      const pts = typeof val === 'object' ? (val.risk_points || val.points || 0) : (parseFloat(val) || 0);
      return { key, points: pts };
    })
    .filter(e => e.points > 0)
    .sort((a, b) => b.points - a.points);

  if (entries.length === 0) {
    return <p style={{ color: '#9ca3af', fontSize: 13, margin: 0 }}>No signal data</p>;
  }

  const maxPts = Math.max(...entries.map(e => e.points), 1);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
      {entries.map(({ key, points }) => (
        <div key={key} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{ width: 120, fontSize: 12, color: '#374151', textAlign: 'right', flexShrink: 0 }}>
            {signalLabel(key)}
          </span>
          <div style={{ flex: 1, height: 16, background: '#f3f4f6', borderRadius: 4, overflow: 'hidden' }}>
            <div style={{
              height: '100%', borderRadius: 4,
              width: `${Math.max((points / maxPts) * 100, 4)}%`,
              background: points >= 15 ? '#ef4444' : points >= 10 ? '#f97316' : points >= 5 ? '#eab308' : '#6b7280',
              transition: 'width 0.3s ease',
            }} />
          </div>
          <span style={{ width: 36, fontSize: 12, color: '#6b7280', textAlign: 'right' }}>{points}pt</span>
        </div>
      ))}
    </div>
  );
}

function DetailPanel({ item, token, onReviewed }) {
  const [detail, setDetail] = useState(null);
  const [loading, setLoading] = useState(true);
  const [reviewNotes, setReviewNotes] = useState('');
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    authFetch(`${API}/api/fraud/transactions/${item.id}`, {
      headers: { Authorization: `Bearer ${token}` },
    })
      .then(r => r.json())
      .then(d => { if (!cancelled && d.success) setDetail(d.data); })
      .catch(() => {})
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [item.id, token]);

  const submitReview = async (decision) => {
    setSubmitting(true);
    try {
      const res = await authFetch(`${API}/api/fraud/transactions/${item.id}/review`, {
        method: 'PUT',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ decision, notes: reviewNotes }),
      });
      const d = await res.json();
      if (d.success) {
        setReviewNotes('');
        onReviewed();
      }
    } catch (err) {
      console.error('Review failed:', err);
    }
    setSubmitting(false);
  };

  if (loading) {
    return <div style={{ padding: 20, color: '#9ca3af', textAlign: 'center' }}>Loading details...</div>;
  }

  const data = detail || item;
  const cust = detail?.customerStats;
  const emp = detail?.employeeProfile;
  const timeline = detail?.timeline || [];

  return (
    <div style={{ padding: '16px 24px', background: '#f8fafc', borderBottom: '2px solid #e5e7eb' }}>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20, marginBottom: 16 }}>
        {/* Left: Signal Breakdown */}
        <div>
          <h4 style={styles.detailHeading}>Signal Breakdown</h4>
          <SignalBarChart signals={data.signals} />
        </div>

        {/* Right: Transaction Details */}
        <div>
          <h4 style={styles.detailHeading}>Transaction Details</h4>
          <div style={styles.detailGrid}>
            <DL label="Transaction ID" value={data.transaction_id || '—'} />
            <DL label="Amount" value={fmtCurrency(data.amount)} />
            <DL label="Card" value={
              data.card_last_four
                ? `${data.card_brand || ''} ****${data.card_last_four}`
                : '—'
            } />
            <DL label="BIN" value={data.card_bin || '—'} />
            <DL label="Entry Method" value={fmtEntry(data.entry_method)} />
            <DL label="Terminal" value={data.terminal_id || '—'} />
            <DL label="AVS" value={data.avs_result || '—'} />
            <DL label="CVV" value={data.cvv_result || '—'} />
            <DL label="IP" value={data.ip_address || '—'} />
          </div>
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20, marginBottom: 16 }}>
        {/* Customer Info */}
        <div>
          <h4 style={styles.detailHeading}>Customer Info</h4>
          <div style={styles.detailGrid}>
            <DL label="Name" value={data.customer_name || '—'} />
            {detail?.customer_email && <DL label="Email" value={detail.customer_email} />}
            {cust && (
              <>
                <DL label="Total Txns" value={cust.total_transactions} />
                <DL label="Total Spend" value={fmtCurrency(cust.total_spend)} />
                <DL label="Chargebacks" value={
                  <span style={{ color: parseInt(cust.chargeback_count) > 0 ? '#dc2626' : '#16a34a', fontWeight: 600 }}>
                    {cust.chargeback_count}
                  </span>
                } />
              </>
            )}
          </div>
        </div>

        {/* Employee Info */}
        <div>
          <h4 style={styles.detailHeading}>Employee Info</h4>
          <div style={styles.detailGrid}>
            <DL label="Name" value={data.employee_name || '—'} />
            {detail?.employee_role && <DL label="Role" value={detail.employee_role} />}
            {emp && (
              <>
                <DL label="Risk Level" value={
                  <span style={{ color: riskLevelBadge(emp.risk_level).fg, fontWeight: 600 }}>
                    {(emp.risk_level || 'normal').toUpperCase()}
                  </span>
                } />
                <DL label="Void Rate Z" value={parseFloat(emp.void_rate_zscore || 0).toFixed(2)} />
                <DL label="Refund Rate Z" value={parseFloat(emp.refund_rate_zscore || 0).toFixed(2)} />
                <DL label="Discount Rate Z" value={parseFloat(emp.discount_rate_zscore || 0).toFixed(2)} />
              </>
            )}
          </div>
        </div>
      </div>

      {/* Timeline */}
      {timeline.length > 0 && (
        <div style={{ marginBottom: 16 }}>
          <h4 style={styles.detailHeading}>Timeline</h4>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 4, maxHeight: 120, overflowY: 'auto' }}>
            {timeline.map((e, i) => (
              <div key={i} style={{ fontSize: 12, color: '#6b7280', display: 'flex', gap: 8 }}>
                <span style={{ color: '#9ca3af', minWidth: 100 }}>{fmtDate(e.created_at)}</span>
                <span style={{ fontWeight: 500, color: '#374151' }}>{e.actor_name || `User #${e.user_id}`}</span>
                <span>{e.action}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Review Actions */}
      {!data.reviewed_by && (
        <div style={{
          display: 'flex', gap: 8, alignItems: 'flex-end',
          padding: '12px 0', borderTop: '1px solid #e5e7eb',
        }}>
          <div style={{ flex: 1 }}>
            <label style={{ fontSize: 12, color: '#6b7280', display: 'block', marginBottom: 4 }}>Review Notes</label>
            <input
              type="text"
              value={reviewNotes}
              onChange={(e) => setReviewNotes(e.target.value)}
              placeholder="Add notes about this transaction..."
              style={styles.noteInput}
            />
          </div>
          <button onClick={() => submitReview('approve')} disabled={submitting}
            style={{ ...styles.reviewBtn, background: '#16a34a', color: '#fff' }}>
            Approve
          </button>
          <button onClick={() => submitReview('confirm_fraud')} disabled={submitting}
            style={{ ...styles.reviewBtn, background: '#dc2626', color: '#fff' }}>
            Confirm Fraud
          </button>
          <button onClick={() => submitReview('escalate')} disabled={submitting}
            style={{ ...styles.reviewBtn, background: '#ea580c', color: '#fff' }}>
            Escalate
          </button>
          <button onClick={() => submitReview('add_note')} disabled={submitting || !reviewNotes.trim()}
            style={{ ...styles.reviewBtn, background: '#6366f1', color: '#fff', opacity: reviewNotes.trim() ? 1 : 0.5 }}>
            Add Note
          </button>
        </div>
      )}

      {/* Already reviewed */}
      {data.reviewed_by && (
        <div style={{ padding: '8px 0', borderTop: '1px solid #e5e7eb', fontSize: 13, color: '#6b7280' }}>
          Reviewed by <b>{data.reviewer_name || `User #${data.reviewed_by}`}</b> on {fmtDate(data.reviewed_at)}
          {data.review_notes && (
            <div style={{ marginTop: 4, whiteSpace: 'pre-wrap', color: '#374151' }}>{data.review_notes}</div>
          )}
        </div>
      )}
    </div>
  );
}

function DL({ label, value }) {
  return (
    <div style={{ display: 'flex', gap: 6 }}>
      <span style={{ color: '#6b7280', minWidth: 100, fontSize: 13 }}>{label}:</span>
      <span style={{ color: '#111827', fontWeight: 500, fontSize: 13 }}>{value}</span>
    </div>
  );
}

function BatchModal({ count, onConfirm, onCancel, submitting }) {
  const [decision, setDecision] = useState('approve');
  const [notes, setNotes] = useState('');

  return (
    <div style={styles.modalOverlay}>
      <div style={styles.modalContent}>
        <h3 style={{ margin: '0 0 12px', fontSize: 16, color: '#111827' }}>Batch Review</h3>
        <p style={{ margin: '0 0 16px', fontSize: 14, color: '#6b7280' }}>
          Apply review decision to <b>{count}</b> selected transaction{count !== 1 ? 's' : ''}.
        </p>

        <div style={{ marginBottom: 12 }}>
          <label style={{ fontSize: 13, color: '#374151', display: 'block', marginBottom: 4 }}>Decision</label>
          <select value={decision} onChange={e => setDecision(e.target.value)} style={styles.select}>
            <option value="approve">Approve (False Positive)</option>
            <option value="confirm_fraud">Confirm Fraud</option>
            <option value="escalate">Escalate</option>
          </select>
        </div>

        <div style={{ marginBottom: 16 }}>
          <label style={{ fontSize: 13, color: '#374151', display: 'block', marginBottom: 4 }}>Notes (optional)</label>
          <input
            type="text" value={notes} onChange={e => setNotes(e.target.value)}
            placeholder="Reason for batch decision..."
            style={styles.noteInput}
          />
        </div>

        <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
          <button onClick={onCancel} disabled={submitting} style={styles.cancelBtn}>Cancel</button>
          <button
            onClick={() => onConfirm(decision, notes)}
            disabled={submitting}
            style={{
              ...styles.reviewBtn,
              background: decision === 'confirm_fraud' ? '#dc2626' : decision === 'escalate' ? '#ea580c' : '#16a34a',
              color: '#fff', opacity: submitting ? 0.6 : 1,
            }}
          >
            {submitting ? 'Processing...' : `Apply to ${count}`}
          </button>
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main Component
// ---------------------------------------------------------------------------

export default function TransactionReviewQueue({ token }) {
  // Data
  const [rows, setRows] = useState([]);
  const [total, setTotal] = useState(0);
  const [stats, setStats] = useState(null);
  const [loading, setLoading] = useState(true);
  const [statsLoading, setStatsLoading] = useState(true);

  // Filters
  const [statusFilter, setStatusFilter] = useState('pending'); // pending | reviewed | all
  const [riskFilter, setRiskFilter] = useState('');
  const [entryFilter, setEntryFilter] = useState('');
  const [minScore, setMinScore] = useState('');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [search, setSearch] = useState('');
  const searchDebounce = useRef(null);

  // Sorting & pagination
  const [sortBy, setSortBy] = useState('score');
  const [sortDir, setSortDir] = useState('DESC');
  const [page, setPage] = useState(1);
  const [limit] = useState(25);

  // Selection & batch
  const [selectedIds, setSelectedIds] = useState(new Set());
  const [showBatchModal, setShowBatchModal] = useState(false);
  const [batchSubmitting, setBatchSubmitting] = useState(false);

  // Expanded row
  const [expandedId, setExpandedId] = useState(null);

  // -----------------------------------------------------------------------
  // Data fetching
  // -----------------------------------------------------------------------

  const fetchQueue = useCallback(async () => {
    setLoading(true);
    try {
      const p = new URLSearchParams({ page, limit, sort_by: sortBy, sort_dir: sortDir, status: statusFilter });
      if (riskFilter) p.set('risk_level', riskFilter);
      if (entryFilter) p.set('entry_method', entryFilter);
      if (minScore) p.set('min_score', minScore);
      if (dateFrom) p.set('date_from', dateFrom);
      if (dateTo) p.set('date_to', dateTo);
      if (search.trim()) p.set('search', search.trim());

      const res = await authFetch(`${API}/api/fraud/transactions?${p}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json();
      if (data.success) {
        setRows(data.data.rows || []);
        setTotal(data.data.total || 0);
      }
    } catch (err) {
      console.error('Failed to fetch transaction queue:', err);
    }
    setLoading(false);
  }, [token, page, limit, sortBy, sortDir, statusFilter, riskFilter, entryFilter, minScore, dateFrom, dateTo, search]);

  const fetchStats = useCallback(async () => {
    setStatsLoading(true);
    try {
      const res = await authFetch(`${API}/api/fraud/transactions/stats`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json();
      if (data.success) setStats(data.data);
    } catch {}
    setStatsLoading(false);
  }, [token]);

  useEffect(() => { fetchQueue(); }, [fetchQueue]);
  useEffect(() => { fetchStats(); }, [fetchStats]);

  // Debounced search
  const handleSearchChange = (val) => {
    setSearch(val);
    clearTimeout(searchDebounce.current);
    searchDebounce.current = setTimeout(() => {
      setPage(1);
    }, 400);
  };

  // -----------------------------------------------------------------------
  // Sort
  // -----------------------------------------------------------------------

  const handleSort = (col) => {
    if (sortBy === col) {
      setSortDir(d => d === 'ASC' ? 'DESC' : 'ASC');
    } else {
      setSortBy(col);
      setSortDir('DESC');
    }
    setPage(1);
  };

  // -----------------------------------------------------------------------
  // Selection
  // -----------------------------------------------------------------------

  const toggleSelect = (id) => {
    setSelectedIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  const toggleSelectAll = () => {
    if (selectedIds.size === rows.length && rows.length > 0) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(rows.map(r => r.id)));
    }
  };

  // -----------------------------------------------------------------------
  // Batch review
  // -----------------------------------------------------------------------

  const handleBatchConfirm = async (decision, notes) => {
    setBatchSubmitting(true);
    try {
      const res = await authFetch(`${API}/api/fraud/transactions/batch-review`, {
        method: 'PUT',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ ids: Array.from(selectedIds), decision, notes }),
      });
      const data = await res.json();
      if (data.success) {
        setSelectedIds(new Set());
        setShowBatchModal(false);
        fetchQueue();
        fetchStats();
      }
    } catch (err) {
      console.error('Batch review failed:', err);
    }
    setBatchSubmitting(false);
  };

  const onSingleReviewed = () => {
    setExpandedId(null);
    fetchQueue();
    fetchStats();
  };

  // -----------------------------------------------------------------------
  // Reset filters
  // -----------------------------------------------------------------------

  const resetFilters = () => {
    setRiskFilter('');
    setEntryFilter('');
    setMinScore('');
    setDateFrom('');
    setDateTo('');
    setSearch('');
    setPage(1);
  };

  const hasActiveFilters = riskFilter || entryFilter || minScore || dateFrom || dateTo || search;

  // -----------------------------------------------------------------------
  // Render helpers
  // -----------------------------------------------------------------------

  const SortHeader = ({ col, label, width }) => {
    const active = sortBy === col;
    return (
      <th onClick={() => handleSort(col)} style={{ ...styles.th, width, cursor: 'pointer', userSelect: 'none' }}>
        {label} {active ? (sortDir === 'ASC' ? '\u25B2' : '\u25BC') : ''}
      </th>
    );
  };

  const totalPages = Math.ceil(total / limit);

  // -----------------------------------------------------------------------
  // JSX
  // -----------------------------------------------------------------------

  return (
    <div>
      {/* Stats Summary */}
      <StatsSummary stats={stats} loading={statsLoading} />

      {/* Header + Status Tabs */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', margin: '16px 0 12px' }}>
        <div style={{ display: 'flex', gap: 4 }}>
          {['pending', 'reviewed', 'all'].map(s => (
            <button
              key={s}
              onClick={() => { setStatusFilter(s); setPage(1); setSelectedIds(new Set()); }}
              style={{
                padding: '6px 14px', fontSize: 13, fontWeight: 600, borderRadius: 6,
                border: 'none', cursor: 'pointer',
                background: statusFilter === s ? '#4f46e5' : '#f3f4f6',
                color: statusFilter === s ? '#fff' : '#6b7280',
              }}
            >
              {s === 'pending' ? 'Pending' : s === 'reviewed' ? 'Reviewed' : 'All'}
            </button>
          ))}
        </div>
        <button onClick={() => { fetchQueue(); fetchStats(); }} style={styles.refreshBtn}>Refresh</button>
      </div>

      {/* Filters */}
      <div style={styles.filterBar}>
        <input
          type="text"
          value={search}
          onChange={e => handleSearchChange(e.target.value)}
          placeholder="Search card, customer, txn ID..."
          style={{ ...styles.select, flex: 1, minWidth: 180 }}
        />
        <select value={riskFilter} onChange={e => { setRiskFilter(e.target.value); setPage(1); }} style={styles.select}>
          <option value="">All Risk Levels</option>
          <option value="critical">Critical</option>
          <option value="high">High</option>
          <option value="medium">Medium</option>
          <option value="low">Low</option>
        </select>
        <select value={entryFilter} onChange={e => { setEntryFilter(e.target.value); setPage(1); }} style={styles.select}>
          <option value="">All Entry Methods</option>
          <option value="chip">Chip</option>
          <option value="swipe">Swipe</option>
          <option value="contactless">Contactless</option>
          <option value="manual">Manual</option>
          <option value="fallback">Fallback</option>
        </select>
        <input
          type="number" min="0" max="100"
          value={minScore}
          onChange={e => { setMinScore(e.target.value); setPage(1); }}
          placeholder="Min Score"
          style={{ ...styles.select, width: 90 }}
        />
        <input type="date" value={dateFrom} onChange={e => { setDateFrom(e.target.value); setPage(1); }} style={styles.select} />
        <input type="date" value={dateTo} onChange={e => { setDateTo(e.target.value); setPage(1); }} style={styles.select} />
        {hasActiveFilters && (
          <button onClick={resetFilters} style={{ ...styles.refreshBtn, fontSize: 12, padding: '4px 10px' }}>
            Clear
          </button>
        )}
      </div>

      {/* Batch Actions Bar */}
      {selectedIds.size > 0 && (
        <div style={styles.batchBar}>
          <span style={{ fontSize: 13, fontWeight: 600, color: '#4338ca' }}>
            {selectedIds.size} selected
          </span>
          <button onClick={() => setShowBatchModal(true)} style={{ ...styles.reviewBtn, background: '#4f46e5', color: '#fff' }}>
            Review Selected
          </button>
          <button onClick={() => setSelectedIds(new Set())} style={styles.cancelBtn}>
            Deselect
          </button>
        </div>
      )}

      {/* Table */}
      {loading ? (
        <div style={{ padding: 40, textAlign: 'center', color: '#9ca3af' }}>Loading transactions...</div>
      ) : rows.length === 0 ? (
        <div style={{ padding: 40, textAlign: 'center', color: '#9ca3af' }}>
          <p style={{ fontSize: 16, margin: '0 0 4px', fontWeight: 500 }}>No transactions found</p>
          <p style={{ fontSize: 13, margin: 0 }}>
            {statusFilter === 'pending' ? 'No flagged transactions awaiting review' : 'Try adjusting your filters'}
          </p>
        </div>
      ) : (
        <>
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 900 }}>
              <thead>
                <tr>
                  <th style={{ ...styles.th, width: 36 }}>
                    <input
                      type="checkbox"
                      checked={selectedIds.size === rows.length && rows.length > 0}
                      onChange={toggleSelectAll}
                    />
                  </th>
                  <SortHeader col="score" label="Score" width={70} />
                  <SortHeader col="risk_level" label="Risk" width={80} />
                  <SortHeader col="amount" label="Amount" width={90} />
                  <SortHeader col="created_at" label="Time" width={120} />
                  <SortHeader col="employee_name" label="Employee" width={120} />
                  <th style={{ ...styles.th, width: 70 }}>Terminal</th>
                  <th style={{ ...styles.th, width: 70 }}>Entry</th>
                  <th style={{ ...styles.th, width: 70 }}>Card</th>
                  <th style={{ ...styles.th, width: 90 }}>Status</th>
                </tr>
              </thead>
              <tbody>
                {rows.map(row => {
                  const isExpanded = expandedId === row.id;
                  const ab = actionBadge(row.action_taken);
                  const rlb = riskLevelBadge(row.risk_level);

                  return (
                    <React.Fragment key={row.id}>
                      <tr
                        onClick={() => setExpandedId(isExpanded ? null : row.id)}
                        style={{
                          cursor: 'pointer',
                          background: isExpanded ? '#f0f4ff' : selectedIds.has(row.id) ? '#faf5ff' : 'transparent',
                          borderBottom: '1px solid #e5e7eb',
                          transition: 'background 0.15s',
                        }}
                        onMouseEnter={e => { if (!isExpanded && !selectedIds.has(row.id)) e.currentTarget.style.background = '#f9fafb'; }}
                        onMouseLeave={e => { if (!isExpanded && !selectedIds.has(row.id)) e.currentTarget.style.background = 'transparent'; }}
                      >
                        <td style={styles.td} onClick={e => e.stopPropagation()}>
                          <input
                            type="checkbox"
                            checked={selectedIds.has(row.id)}
                            onChange={() => toggleSelect(row.id)}
                          />
                        </td>
                        <td style={styles.td}>
                          <span style={{ fontWeight: 700, fontSize: 16, color: riskColor(row.score) }}>
                            {row.score}
                          </span>
                        </td>
                        <td style={styles.td}>
                          <span style={{
                            display: 'inline-block', padding: '2px 8px', borderRadius: 4,
                            fontSize: 11, fontWeight: 700, textTransform: 'uppercase',
                            background: rlb.bg, color: rlb.fg,
                          }}>
                            {row.risk_level}
                          </span>
                        </td>
                        <td style={{ ...styles.td, fontWeight: 500 }}>{fmtCurrency(row.amount)}</td>
                        <td style={{ ...styles.td, fontSize: 13 }}>{fmtDate(row.created_at)}</td>
                        <td style={{ ...styles.td, fontSize: 13 }}>{row.employee_name || '—'}</td>
                        <td style={{ ...styles.td, fontSize: 12, color: '#6b7280' }}>{row.terminal_id || '—'}</td>
                        <td style={{ ...styles.td, fontSize: 12 }}>{fmtEntry(row.entry_method)}</td>
                        <td style={{ ...styles.td, fontSize: 12, color: '#6b7280' }}>
                          {row.card_last_four ? `****${row.card_last_four}` : '—'}
                        </td>
                        <td style={styles.td}>
                          <span style={{
                            display: 'inline-block', padding: '2px 8px', borderRadius: 10,
                            fontSize: 11, fontWeight: 600,
                            background: ab.bg, color: ab.fg,
                          }}>
                            {ab.label}
                          </span>
                        </td>
                      </tr>

                      {isExpanded && (
                        <tr>
                          <td colSpan={10}>
                            <DetailPanel item={row} token={token} onReviewed={onSingleReviewed} />
                          </td>
                        </tr>
                      )}
                    </React.Fragment>
                  );
                })}
              </tbody>
            </table>
          </div>

          {/* Pagination */}
          {totalPages > 1 && (
            <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', gap: 8, marginTop: 16 }}>
              <button
                onClick={() => setPage(p => Math.max(1, p - 1))}
                disabled={page <= 1}
                style={{ ...styles.pageBtn, opacity: page <= 1 ? 0.4 : 1 }}
              >
                Previous
              </button>
              <span style={{ fontSize: 13, color: '#6b7280' }}>
                Page {page} of {totalPages} ({total} total)
              </span>
              <button
                onClick={() => setPage(p => Math.min(totalPages, p + 1))}
                disabled={page >= totalPages}
                style={{ ...styles.pageBtn, opacity: page >= totalPages ? 0.4 : 1 }}
              >
                Next
              </button>
            </div>
          )}
        </>
      )}

      {/* Batch Modal */}
      {showBatchModal && (
        <BatchModal
          count={selectedIds.size}
          onConfirm={handleBatchConfirm}
          onCancel={() => setShowBatchModal(false)}
          submitting={batchSubmitting}
        />
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Styles
// ---------------------------------------------------------------------------

const styles = {
  statsBar: {
    display: 'flex', alignItems: 'center', gap: 16, padding: '12px 16px',
    background: '#ffffff', borderRadius: 8, border: '1px solid #e5e7eb',
    flexWrap: 'wrap',
  },
  statItem: {
    display: 'flex', flexDirection: 'column', alignItems: 'center', minWidth: 60,
  },
  statValue: {
    fontSize: 22, fontWeight: 700, color: '#111827', lineHeight: 1.2,
  },
  statLabel: {
    fontSize: 11, color: '#9ca3af', fontWeight: 500, marginTop: 2,
  },
  statDivider: {
    width: 1, height: 32, background: '#e5e7eb',
  },
  filterBar: {
    display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 12, alignItems: 'center',
  },
  select: {
    padding: '6px 10px', fontSize: 13, border: '1px solid #d1d5db',
    borderRadius: 6, background: '#fff', color: '#374151',
  },
  th: {
    padding: '10px 10px', textAlign: 'left', fontSize: 11, fontWeight: 600,
    color: '#6b7280', textTransform: 'uppercase', letterSpacing: '0.05em',
    borderBottom: '2px solid #e5e7eb', background: '#f9fafb', whiteSpace: 'nowrap',
  },
  td: {
    padding: '10px 10px', fontSize: 14, color: '#111827',
  },
  refreshBtn: {
    padding: '6px 14px', fontSize: 13, fontWeight: 500,
    background: '#f3f4f6', border: '1px solid #d1d5db',
    borderRadius: 6, cursor: 'pointer', color: '#374151',
  },
  batchBar: {
    display: 'flex', alignItems: 'center', gap: 10, padding: '8px 14px',
    background: '#eef2ff', borderRadius: 8, marginBottom: 12,
  },
  reviewBtn: {
    padding: '6px 14px', fontSize: 13, fontWeight: 600,
    border: 'none', borderRadius: 6, cursor: 'pointer',
  },
  cancelBtn: {
    padding: '6px 14px', fontSize: 13, fontWeight: 500,
    background: '#f3f4f6', border: '1px solid #d1d5db',
    borderRadius: 6, cursor: 'pointer', color: '#6b7280',
  },
  noteInput: {
    width: '100%', padding: '6px 10px', fontSize: 13,
    border: '1px solid #d1d5db', borderRadius: 6, color: '#374151',
  },
  detailHeading: {
    margin: '0 0 8px', fontSize: 14, fontWeight: 600, color: '#374151',
  },
  detailGrid: {
    display: 'flex', flexDirection: 'column', gap: 4,
  },
  pageBtn: {
    padding: '6px 14px', fontSize: 13, fontWeight: 500,
    background: '#fff', border: '1px solid #d1d5db',
    borderRadius: 6, cursor: 'pointer', color: '#374151',
  },
  modalOverlay: {
    position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)',
    display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000,
  },
  modalContent: {
    background: '#fff', borderRadius: 12, padding: 24, width: 420,
    boxShadow: '0 20px 60px rgba(0,0,0,0.2)',
  },
};
