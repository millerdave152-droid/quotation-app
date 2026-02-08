/**
 * TeleTime - Fraud & Audit Dashboard
 * Admin dashboard with tabs for Alert Queue, Employee Monitor,
 * Incidents, Chargebacks, and Rules Configuration.
 */

import React, { useState, useEffect, useCallback } from 'react';
import { useAuth } from '../../contexts/AuthContext';
import { authFetch } from '../../services/authFetch';

const API_URL = process.env.REACT_APP_API_URL || 'http://localhost:3001';

// ============================================================================
// SEVERITY HELPERS
// ============================================================================

const getSeverityColor = (severity) => {
  const colors = {
    critical: { bg: '#fee2e2', text: '#991b1b', border: '#fecaca' },
    high: { bg: '#fed7aa', text: '#c2410c', border: '#fdba74' },
    medium: { bg: '#fef3c7', text: '#92400e', border: '#fcd34d' },
    low: { bg: '#f3f4f6', text: '#374151', border: '#d1d5db' }
  };
  return colors[severity] || colors.medium;
};

const getStatusColor = (status) => {
  const colors = {
    new: { bg: '#dbeafe', text: '#1e40af' },
    reviewing: { bg: '#fef3c7', text: '#92400e' },
    confirmed_fraud: { bg: '#fee2e2', text: '#991b1b' },
    false_positive: { bg: '#d1fae5', text: '#065f46' },
    dismissed: { bg: '#f3f4f6', text: '#6b7280' },
    pending: { bg: '#dbeafe', text: '#1e40af' },
    in_review: { bg: '#fef3c7', text: '#92400e' },
    resolved: { bg: '#d1fae5', text: '#065f46' },
    open: { bg: '#fee2e2', text: '#991b1b' },
    investigating: { bg: '#fef3c7', text: '#92400e' },
    confirmed: { bg: '#fed7aa', text: '#c2410c' },
    closed: { bg: '#f3f4f6', text: '#6b7280' },
    received: { bg: '#dbeafe', text: '#1e40af' },
    responding: { bg: '#fef3c7', text: '#92400e' },
    won: { bg: '#d1fae5', text: '#065f46' },
    lost: { bg: '#fee2e2', text: '#991b1b' },
    expired: { bg: '#f3f4f6', text: '#6b7280' },
  };
  return colors[status] || { bg: '#f3f4f6', text: '#6b7280' };
};

const formatDate = (dateStr) => {
  if (!dateStr) return '-';
  return new Date(dateStr).toLocaleDateString('en-CA', {
    year: 'numeric', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit'
  });
};

const formatCurrency = (val) => {
  const num = parseFloat(val) || 0;
  return `$${num.toFixed(2)}`;
};

// ============================================================================
// STATUS BADGE
// ============================================================================

function StatusBadge({ status }) {
  const color = getStatusColor(status);
  return (
    <span style={{
      display: 'inline-block',
      padding: '2px 10px',
      borderRadius: '12px',
      fontSize: '12px',
      fontWeight: 600,
      background: color.bg,
      color: color.text,
      textTransform: 'capitalize',
    }}>
      {(status || '').replace(/_/g, ' ')}
    </span>
  );
}

// ============================================================================
// SEVERITY BADGE
// ============================================================================

function SeverityBadge({ severity }) {
  const color = getSeverityColor(severity);
  return (
    <span style={{
      display: 'inline-block',
      padding: '2px 10px',
      borderRadius: '12px',
      fontSize: '12px',
      fontWeight: 600,
      background: color.bg,
      color: color.text,
      border: `1px solid ${color.border}`,
      textTransform: 'capitalize',
    }}>
      {severity}
    </span>
  );
}

// ============================================================================
// RISK SCORE INDICATOR
// ============================================================================

function RiskScoreIndicator({ score }) {
  const getColor = (s) => {
    if (s >= 80) return '#dc2626';
    if (s >= 60) return '#ea580c';
    if (s >= 30) return '#d97706';
    return '#16a34a';
  };

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
      <div style={{
        width: '32px', height: '32px', borderRadius: '50%',
        background: getColor(score), color: 'white',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        fontSize: '11px', fontWeight: 700,
      }}>
        {score}
      </div>
    </div>
  );
}

// ============================================================================
// TAB 1: ALERT QUEUE
// ============================================================================

function AlertQueue({ token }) {
  const [alerts, setAlerts] = useState([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState('');
  const [page, setPage] = useState(1);
  const [expandedId, setExpandedId] = useState(null);
  const [reviewForm, setReviewForm] = useState({ resolution: '', notes: '' });
  const [reviewing, setReviewing] = useState(false);

  const fetchAlerts = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({ page, limit: 25 });
      if (statusFilter) params.set('status', statusFilter);
      const res = await authFetch(`${API_URL}/api/fraud/alerts?${params}`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      const data = await res.json();
      if (data.success) {
        setAlerts(data.data.alerts || []);
        setTotal(data.data.total || 0);
      }
    } catch (err) {
      console.error('Failed to fetch alerts:', err);
    } finally {
      setLoading(false);
    }
  }, [token, statusFilter, page]);

  useEffect(() => { fetchAlerts(); }, [fetchAlerts]);

  const handleReview = async (alertId) => {
    if (!reviewForm.resolution) return;
    setReviewing(true);
    try {
      await authFetch(`${API_URL}/api/fraud/alerts/${alertId}/review`, {
        method: 'PUT',
        headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify(reviewForm)
      });
      setExpandedId(null);
      setReviewForm({ resolution: '', notes: '' });
      fetchAlerts();
    } catch (err) {
      console.error('Review failed:', err);
    } finally {
      setReviewing(false);
    }
  };

  const statuses = ['', 'new', 'reviewing', 'confirmed_fraud', 'false_positive', 'dismissed'];

  return (
    <div>
      {/* Filters */}
      <div style={{ display: 'flex', gap: '8px', marginBottom: '16px', flexWrap: 'wrap' }}>
        {statuses.map(s => (
          <button
            key={s || 'all'}
            onClick={() => { setStatusFilter(s); setPage(1); }}
            style={{
              padding: '6px 14px',
              background: statusFilter === s ? '#667eea' : '#f3f4f6',
              color: statusFilter === s ? 'white' : '#6b7280',
              border: 'none', borderRadius: '6px', cursor: 'pointer',
              fontSize: '13px', fontWeight: 500, textTransform: 'capitalize',
            }}
          >
            {s ? s.replace(/_/g, ' ') : 'All'}
          </button>
        ))}
      </div>

      {loading ? (
        <p style={{ color: '#9ca3af', textAlign: 'center', padding: '40px' }}>Loading alerts...</p>
      ) : alerts.length === 0 ? (
        <p style={{ color: '#9ca3af', textAlign: 'center', padding: '40px' }}>No alerts found</p>
      ) : (
        <div>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr style={{ borderBottom: '2px solid #e5e7eb' }}>
                <th style={thStyle}>Risk</th>
                <th style={thStyle}>Alert Type</th>
                <th style={thStyle}>Rule</th>
                <th style={thStyle}>Employee</th>
                <th style={thStyle}>Severity</th>
                <th style={thStyle}>Status</th>
                <th style={thStyle}>Created</th>
              </tr>
            </thead>
            <tbody>
              {alerts.map(alert => (
                <React.Fragment key={alert.id}>
                  <tr
                    onClick={() => setExpandedId(expandedId === alert.id ? null : alert.id)}
                    style={{ borderBottom: '1px solid #f3f4f6', cursor: 'pointer', background: expandedId === alert.id ? '#f9fafb' : 'white' }}
                  >
                    <td style={tdStyle}><RiskScoreIndicator score={alert.risk_score} /></td>
                    <td style={tdStyle}><span style={{ textTransform: 'capitalize' }}>{alert.alert_type}</span></td>
                    <td style={tdStyle}>{alert.rule_name}</td>
                    <td style={tdStyle}>{alert.employee_name}</td>
                    <td style={tdStyle}><SeverityBadge severity={alert.severity} /></td>
                    <td style={tdStyle}><StatusBadge status={alert.status} /></td>
                    <td style={tdStyle}><span style={{ fontSize: '12px', color: '#6b7280' }}>{formatDate(alert.created_at)}</span></td>
                  </tr>
                  {expandedId === alert.id && (
                    <tr>
                      <td colSpan={7} style={{ padding: '16px', background: '#f9fafb' }}>
                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
                          <div>
                            <h4 style={{ margin: '0 0 8px', fontSize: '14px', fontWeight: 600 }}>Alert Details</h4>
                            <p style={{ fontSize: '13px', color: '#6b7280', margin: '4px 0' }}>
                              Transaction: {alert.transaction_id || '-'} | Return: {alert.return_id || '-'}
                            </p>
                            {alert.details?.triggered_rules?.map((tr, i) => (
                              <div key={i} style={{ padding: '6px 10px', background: 'white', borderRadius: '6px', marginTop: '6px', fontSize: '13px' }}>
                                <strong>{tr.rule_name}</strong> (+{tr.risk_points} pts)
                                {tr.details && <span style={{ color: '#9ca3af', marginLeft: '8px' }}>{JSON.stringify(tr.details)}</span>}
                              </div>
                            ))}
                            {alert.reviewer_name && (
                              <p style={{ fontSize: '13px', color: '#6b7280', marginTop: '8px' }}>
                                Reviewed by: {alert.reviewer_name} on {formatDate(alert.reviewed_at)}
                              </p>
                            )}
                            {alert.review_notes && <p style={{ fontSize: '13px', marginTop: '4px' }}>Notes: {alert.review_notes}</p>}
                          </div>
                          {alert.status === 'new' || alert.status === 'reviewing' ? (
                            <div>
                              <h4 style={{ margin: '0 0 8px', fontSize: '14px', fontWeight: 600 }}>Review</h4>
                              <select
                                value={reviewForm.resolution}
                                onChange={e => setReviewForm(f => ({ ...f, resolution: e.target.value }))}
                                style={{ width: '100%', padding: '8px', borderRadius: '6px', border: '1px solid #d1d5db', marginBottom: '8px' }}
                              >
                                <option value="">Select resolution...</option>
                                <option value="confirmed_fraud">Confirmed Fraud</option>
                                <option value="false_positive">False Positive</option>
                                <option value="dismissed">Dismiss</option>
                              </select>
                              <textarea
                                value={reviewForm.notes}
                                onChange={e => setReviewForm(f => ({ ...f, notes: e.target.value }))}
                                placeholder="Review notes..."
                                rows={3}
                                style={{ width: '100%', padding: '8px', borderRadius: '6px', border: '1px solid #d1d5db', resize: 'vertical', marginBottom: '8px' }}
                              />
                              <button
                                onClick={() => handleReview(alert.id)}
                                disabled={!reviewForm.resolution || reviewing}
                                style={{
                                  padding: '8px 20px', background: reviewForm.resolution ? '#667eea' : '#d1d5db',
                                  color: 'white', border: 'none', borderRadius: '6px', cursor: reviewForm.resolution ? 'pointer' : 'not-allowed',
                                }}
                              >
                                {reviewing ? 'Submitting...' : 'Submit Review'}
                              </button>
                            </div>
                          ) : null}
                        </div>
                      </td>
                    </tr>
                  )}
                </React.Fragment>
              ))}
            </tbody>
          </table>
          {/* Pagination */}
          {total > 25 && (
            <div style={{ display: 'flex', justifyContent: 'center', gap: '8px', marginTop: '16px' }}>
              <button onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page <= 1}
                style={{ padding: '6px 14px', border: '1px solid #d1d5db', borderRadius: '6px', cursor: page > 1 ? 'pointer' : 'not-allowed' }}>
                Previous
              </button>
              <span style={{ padding: '6px 14px', color: '#6b7280' }}>Page {page} of {Math.ceil(total / 25)}</span>
              <button onClick={() => setPage(p => p + 1)} disabled={page >= Math.ceil(total / 25)}
                style={{ padding: '6px 14px', border: '1px solid #d1d5db', borderRadius: '6px', cursor: page < Math.ceil(total / 25) ? 'pointer' : 'not-allowed' }}>
                Next
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ============================================================================
// TAB 2: EMPLOYEE MONITOR
// ============================================================================

function EmployeeMonitor({ token }) {
  const [metrics, setMetrics] = useState([]);
  const [loading, setLoading] = useState(true);

  const fetchMetrics = useCallback(async () => {
    setLoading(true);
    try {
      const res = await authFetch(`${API_URL}/api/fraud/employee-metrics`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      const data = await res.json();
      if (data.success) setMetrics(data.data || []);
    } catch (err) {
      console.error('Failed to fetch metrics:', err);
    } finally {
      setLoading(false);
    }
  }, [token]);

  useEffect(() => { fetchMetrics(); }, [fetchMetrics]);

  const handleRefresh = async () => {
    try {
      await authFetch(`${API_URL}/api/fraud/employee-metrics/refresh`, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${token}` }
      });
      fetchMetrics();
    } catch (err) {
      console.error('Refresh failed:', err);
    }
  };

  const getRowBg = (m) => {
    if (m.fraud_alert_count > 3) return '#fee2e2';
    if (m.fraud_alert_count > 1) return '#fef3c7';
    return 'white';
  };

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
        <p style={{ margin: 0, color: '#6b7280', fontSize: '14px' }}>90-day rolling metrics from materialized view</p>
        <button onClick={handleRefresh} style={{
          padding: '6px 14px', background: '#667eea', color: 'white',
          border: 'none', borderRadius: '6px', cursor: 'pointer', fontSize: '13px'
        }}>
          Refresh Metrics
        </button>
      </div>

      {loading ? (
        <p style={{ color: '#9ca3af', textAlign: 'center', padding: '40px' }}>Loading metrics...</p>
      ) : (
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead>
            <tr style={{ borderBottom: '2px solid #e5e7eb' }}>
              <th style={thStyle}>Employee</th>
              <th style={thStyle}>Role</th>
              <th style={thStyle}>Transactions</th>
              <th style={thStyle}>Voids</th>
              <th style={thStyle}>Refunds</th>
              <th style={thStyle}>Avg Discount</th>
              <th style={thStyle}>Total Refunds</th>
              <th style={thStyle}>Alerts</th>
            </tr>
          </thead>
          <tbody>
            {metrics.map(m => (
              <tr key={m.user_id} style={{ borderBottom: '1px solid #f3f4f6', background: getRowBg(m) }}>
                <td style={tdStyle}><strong>{m.employee_name}</strong></td>
                <td style={tdStyle}><span style={{ textTransform: 'capitalize' }}>{m.role}</span></td>
                <td style={tdStyle}>{m.total_transactions}</td>
                <td style={tdStyle}>{m.void_count}</td>
                <td style={tdStyle}>{m.refund_count}</td>
                <td style={tdStyle}>{formatCurrency(m.avg_discount)}</td>
                <td style={tdStyle}>{formatCurrency(m.total_refund_amount)}</td>
                <td style={tdStyle}>
                  <span style={{
                    fontWeight: m.fraud_alert_count > 0 ? 700 : 400,
                    color: m.fraud_alert_count > 3 ? '#dc2626' : m.fraud_alert_count > 1 ? '#d97706' : '#374151'
                  }}>
                    {m.fraud_alert_count}
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}

// ============================================================================
// TAB 3: INCIDENTS
// ============================================================================

function Incidents({ token }) {
  const [incidents, setIncidents] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);
  const [createForm, setCreateForm] = useState({ alert_ids: '', incident_type: '', description: '', total_loss: '' });
  const [saving, setSaving] = useState(false);

  const fetchIncidents = useCallback(async () => {
    setLoading(true);
    try {
      const res = await authFetch(`${API_URL}/api/fraud/incidents`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      const data = await res.json();
      if (data.success) setIncidents(data.data || []);
    } catch (err) {
      console.error('Failed to fetch incidents:', err);
    } finally {
      setLoading(false);
    }
  }, [token]);

  useEffect(() => { fetchIncidents(); }, [fetchIncidents]);

  const handleCreate = async () => {
    setSaving(true);
    try {
      const alertIds = createForm.alert_ids.split(',').map(s => parseInt(s.trim())).filter(n => !isNaN(n));
      await authFetch(`${API_URL}/api/fraud/incidents`, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          alert_ids: alertIds,
          incident_type: createForm.incident_type,
          description: createForm.description,
          total_loss: parseFloat(createForm.total_loss) || 0,
        })
      });
      setShowCreate(false);
      setCreateForm({ alert_ids: '', incident_type: '', description: '', total_loss: '' });
      fetchIncidents();
    } catch (err) {
      console.error('Create incident failed:', err);
    } finally {
      setSaving(false);
    }
  };

  const incidentTypes = ['employee_theft', 'return_fraud', 'chargeback_fraud', 'discount_abuse', 'collusion'];

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
        <p style={{ margin: 0, color: '#6b7280', fontSize: '14px' }}>Confirmed fraud cases and investigations</p>
        <button onClick={() => setShowCreate(!showCreate)} style={{
          padding: '6px 14px', background: '#667eea', color: 'white',
          border: 'none', borderRadius: '6px', cursor: 'pointer', fontSize: '13px'
        }}>
          {showCreate ? 'Cancel' : 'Create Incident'}
        </button>
      </div>

      {showCreate && (
        <div style={{ background: '#f9fafb', borderRadius: '8px', padding: '16px', marginBottom: '16px' }}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
            <div>
              <label style={labelStyle}>Alert IDs (comma-separated)</label>
              <input value={createForm.alert_ids} onChange={e => setCreateForm(f => ({ ...f, alert_ids: e.target.value }))}
                style={inputStyle} placeholder="e.g. 1, 2, 3" />
            </div>
            <div>
              <label style={labelStyle}>Incident Type</label>
              <select value={createForm.incident_type} onChange={e => setCreateForm(f => ({ ...f, incident_type: e.target.value }))} style={inputStyle}>
                <option value="">Select type...</option>
                {incidentTypes.map(t => <option key={t} value={t}>{t.replace(/_/g, ' ')}</option>)}
              </select>
            </div>
            <div>
              <label style={labelStyle}>Total Loss ($)</label>
              <input type="number" value={createForm.total_loss} onChange={e => setCreateForm(f => ({ ...f, total_loss: e.target.value }))}
                style={inputStyle} placeholder="0.00" />
            </div>
            <div>
              <label style={labelStyle}>Description</label>
              <input value={createForm.description} onChange={e => setCreateForm(f => ({ ...f, description: e.target.value }))}
                style={inputStyle} placeholder="Brief description" />
            </div>
          </div>
          <button onClick={handleCreate} disabled={!createForm.incident_type || !createForm.alert_ids || saving}
            style={{ marginTop: '12px', padding: '8px 20px', background: '#667eea', color: 'white', border: 'none', borderRadius: '6px', cursor: 'pointer' }}>
            {saving ? 'Creating...' : 'Create Incident'}
          </button>
        </div>
      )}

      {loading ? (
        <p style={{ color: '#9ca3af', textAlign: 'center', padding: '40px' }}>Loading incidents...</p>
      ) : incidents.length === 0 ? (
        <p style={{ color: '#9ca3af', textAlign: 'center', padding: '40px' }}>No incidents found</p>
      ) : (
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead>
            <tr style={{ borderBottom: '2px solid #e5e7eb' }}>
              <th style={thStyle}>Incident #</th>
              <th style={thStyle}>Type</th>
              <th style={thStyle}>Employee</th>
              <th style={thStyle}>Total Loss</th>
              <th style={thStyle}>Status</th>
              <th style={thStyle}>Created</th>
            </tr>
          </thead>
          <tbody>
            {incidents.map(inc => (
              <tr key={inc.id} style={{ borderBottom: '1px solid #f3f4f6' }}>
                <td style={tdStyle}><strong>{inc.incident_number}</strong></td>
                <td style={tdStyle}><span style={{ textTransform: 'capitalize' }}>{(inc.incident_type || '').replace(/_/g, ' ')}</span></td>
                <td style={tdStyle}>{inc.employee_name || '-'}</td>
                <td style={tdStyle}>{formatCurrency(inc.total_loss)}</td>
                <td style={tdStyle}><StatusBadge status={inc.status} /></td>
                <td style={tdStyle}><span style={{ fontSize: '12px', color: '#6b7280' }}>{formatDate(inc.created_at)}</span></td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}

// ============================================================================
// TAB 4: CHARGEBACKS
// ============================================================================

function Chargebacks({ token }) {
  const [cases, setCases] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);
  const [createForm, setCreateForm] = useState({ transaction_id: '', payment_id: '', amount: '', case_number: '', reason_code: '', deadline: '', notes: '' });
  const [saving, setSaving] = useState(false);

  const fetchCases = useCallback(async () => {
    setLoading(true);
    try {
      const res = await authFetch(`${API_URL}/api/chargebacks`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      const data = await res.json();
      if (data.success) setCases(data.data || []);
    } catch (err) {
      console.error('Failed to fetch chargebacks:', err);
    } finally {
      setLoading(false);
    }
  }, [token]);

  useEffect(() => { fetchCases(); }, [fetchCases]);

  const handleCreate = async () => {
    setSaving(true);
    try {
      await authFetch(`${API_URL}/api/chargebacks`, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          transaction_id: parseInt(createForm.transaction_id),
          payment_id: parseInt(createForm.payment_id),
          amount: parseFloat(createForm.amount),
          case_number: createForm.case_number || null,
          reason_code: createForm.reason_code || null,
          deadline: createForm.deadline || null,
          notes: createForm.notes || null,
        })
      });
      setShowCreate(false);
      setCreateForm({ transaction_id: '', payment_id: '', amount: '', case_number: '', reason_code: '', deadline: '', notes: '' });
      fetchCases();
    } catch (err) {
      console.error('Create chargeback failed:', err);
    } finally {
      setSaving(false);
    }
  };

  const getDeadlineStyle = (deadline) => {
    if (!deadline) return {};
    const days = Math.ceil((new Date(deadline) - new Date()) / (1000 * 60 * 60 * 24));
    if (days < 0) return { color: '#dc2626', fontWeight: 700 };
    if (days <= 7) return { color: '#d97706', fontWeight: 600 };
    return { color: '#6b7280' };
  };

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
        <p style={{ margin: 0, color: '#6b7280', fontSize: '14px' }}>Payment disputes and chargeback tracking</p>
        <button onClick={() => setShowCreate(!showCreate)} style={{
          padding: '6px 14px', background: '#667eea', color: 'white',
          border: 'none', borderRadius: '6px', cursor: 'pointer', fontSize: '13px'
        }}>
          {showCreate ? 'Cancel' : 'New Chargeback'}
        </button>
      </div>

      {showCreate && (
        <div style={{ background: '#f9fafb', borderRadius: '8px', padding: '16px', marginBottom: '16px' }}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '12px' }}>
            <div>
              <label style={labelStyle}>Transaction ID *</label>
              <input type="number" value={createForm.transaction_id} onChange={e => setCreateForm(f => ({ ...f, transaction_id: e.target.value }))} style={inputStyle} />
            </div>
            <div>
              <label style={labelStyle}>Payment ID *</label>
              <input type="number" value={createForm.payment_id} onChange={e => setCreateForm(f => ({ ...f, payment_id: e.target.value }))} style={inputStyle} />
            </div>
            <div>
              <label style={labelStyle}>Amount *</label>
              <input type="number" value={createForm.amount} onChange={e => setCreateForm(f => ({ ...f, amount: e.target.value }))} style={inputStyle} placeholder="0.00" />
            </div>
            <div>
              <label style={labelStyle}>Case Number</label>
              <input value={createForm.case_number} onChange={e => setCreateForm(f => ({ ...f, case_number: e.target.value }))} style={inputStyle} />
            </div>
            <div>
              <label style={labelStyle}>Reason Code</label>
              <input value={createForm.reason_code} onChange={e => setCreateForm(f => ({ ...f, reason_code: e.target.value }))} style={inputStyle} />
            </div>
            <div>
              <label style={labelStyle}>Deadline</label>
              <input type="date" value={createForm.deadline} onChange={e => setCreateForm(f => ({ ...f, deadline: e.target.value }))} style={inputStyle} />
            </div>
          </div>
          <div style={{ marginTop: '12px' }}>
            <label style={labelStyle}>Notes</label>
            <textarea value={createForm.notes} onChange={e => setCreateForm(f => ({ ...f, notes: e.target.value }))}
              style={{ ...inputStyle, resize: 'vertical' }} rows={2} />
          </div>
          <button onClick={handleCreate} disabled={!createForm.transaction_id || !createForm.payment_id || !createForm.amount || saving}
            style={{ marginTop: '12px', padding: '8px 20px', background: '#667eea', color: 'white', border: 'none', borderRadius: '6px', cursor: 'pointer' }}>
            {saving ? 'Creating...' : 'Create Case'}
          </button>
        </div>
      )}

      {loading ? (
        <p style={{ color: '#9ca3af', textAlign: 'center', padding: '40px' }}>Loading chargebacks...</p>
      ) : cases.length === 0 ? (
        <p style={{ color: '#9ca3af', textAlign: 'center', padding: '40px' }}>No chargeback cases</p>
      ) : (
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead>
            <tr style={{ borderBottom: '2px solid #e5e7eb' }}>
              <th style={thStyle}>Case #</th>
              <th style={thStyle}>Transaction</th>
              <th style={thStyle}>Customer</th>
              <th style={thStyle}>Amount</th>
              <th style={thStyle}>Reason</th>
              <th style={thStyle}>Deadline</th>
              <th style={thStyle}>Status</th>
            </tr>
          </thead>
          <tbody>
            {cases.map(c => (
              <tr key={c.id} style={{ borderBottom: '1px solid #f3f4f6' }}>
                <td style={tdStyle}><strong>{c.case_number || `#${c.id}`}</strong></td>
                <td style={tdStyle}>{c.transaction_number}</td>
                <td style={tdStyle}>{c.customer_name || '-'}</td>
                <td style={tdStyle}>{formatCurrency(c.amount)}</td>
                <td style={tdStyle}>{c.reason_code || '-'}</td>
                <td style={tdStyle}>
                  <span style={{ fontSize: '12px', ...getDeadlineStyle(c.deadline) }}>
                    {c.deadline ? new Date(c.deadline).toLocaleDateString('en-CA') : '-'}
                  </span>
                </td>
                <td style={tdStyle}><StatusBadge status={c.status} /></td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}

// ============================================================================
// TAB 5: RULES CONFIG
// ============================================================================

function RulesConfig({ token }) {
  const [rules, setRules] = useState([]);
  const [loading, setLoading] = useState(true);
  const [editingId, setEditingId] = useState(null);
  const [editForm, setEditForm] = useState({});
  const [saving, setSaving] = useState(false);

  const fetchRules = useCallback(async () => {
    setLoading(true);
    try {
      const res = await authFetch(`${API_URL}/api/fraud/rules`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      const data = await res.json();
      if (data.success) setRules(data.data || []);
    } catch (err) {
      console.error('Failed to fetch rules:', err);
    } finally {
      setLoading(false);
    }
  }, [token]);

  useEffect(() => { fetchRules(); }, [fetchRules]);

  const startEdit = (rule) => {
    setEditingId(rule.id);
    setEditForm({
      risk_points: rule.risk_points,
      severity: rule.severity,
      action: rule.action,
      is_active: rule.is_active,
      conditions: JSON.stringify(rule.conditions, null, 2),
    });
  };

  const handleSave = async (ruleId) => {
    setSaving(true);
    try {
      let conditions;
      try {
        conditions = JSON.parse(editForm.conditions);
      } catch {
        alert('Invalid JSON in conditions');
        setSaving(false);
        return;
      }
      await authFetch(`${API_URL}/api/fraud/rules/${ruleId}`, {
        method: 'PUT',
        headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          risk_points: parseInt(editForm.risk_points),
          severity: editForm.severity,
          action: editForm.action,
          is_active: editForm.is_active,
          conditions,
        })
      });
      setEditingId(null);
      fetchRules();
    } catch (err) {
      console.error('Update rule failed:', err);
    } finally {
      setSaving(false);
    }
  };

  const handleToggle = async (rule) => {
    try {
      await authFetch(`${API_URL}/api/fraud/rules/${rule.id}`, {
        method: 'PUT',
        headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ is_active: !rule.is_active })
      });
      fetchRules();
    } catch (err) {
      console.error('Toggle failed:', err);
    }
  };

  return (
    <div>
      {loading ? (
        <p style={{ color: '#9ca3af', textAlign: 'center', padding: '40px' }}>Loading rules...</p>
      ) : (
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead>
            <tr style={{ borderBottom: '2px solid #e5e7eb' }}>
              <th style={thStyle}>Active</th>
              <th style={thStyle}>Rule</th>
              <th style={thStyle}>Type</th>
              <th style={thStyle}>Points</th>
              <th style={thStyle}>Severity</th>
              <th style={thStyle}>Action</th>
              <th style={thStyle}>Conditions</th>
              <th style={thStyle}></th>
            </tr>
          </thead>
          <tbody>
            {rules.map(rule => (
              <tr key={rule.id} style={{ borderBottom: '1px solid #f3f4f6', background: !rule.is_active ? '#f9fafb' : 'white' }}>
                <td style={tdStyle}>
                  <button onClick={() => handleToggle(rule)}
                    style={{ width: '36px', height: '20px', borderRadius: '10px', border: 'none', cursor: 'pointer',
                      background: rule.is_active ? '#667eea' : '#d1d5db', position: 'relative', transition: 'background 0.2s' }}>
                    <span style={{
                      display: 'block', width: '16px', height: '16px', borderRadius: '50%', background: 'white',
                      position: 'absolute', top: '2px', left: rule.is_active ? '18px' : '2px', transition: 'left 0.2s'
                    }} />
                  </button>
                </td>
                <td style={tdStyle}>
                  <div>
                    <strong style={{ fontSize: '13px' }}>{rule.rule_name}</strong>
                    <p style={{ margin: '2px 0 0', fontSize: '11px', color: '#9ca3af' }}>{rule.rule_code}</p>
                  </div>
                </td>
                <td style={tdStyle}><span style={{ textTransform: 'capitalize', fontSize: '13px' }}>{rule.rule_type}</span></td>
                {editingId === rule.id ? (
                  <>
                    <td style={tdStyle}>
                      <input type="number" value={editForm.risk_points} onChange={e => setEditForm(f => ({ ...f, risk_points: e.target.value }))}
                        style={{ ...inputStyle, width: '60px' }} />
                    </td>
                    <td style={tdStyle}>
                      <select value={editForm.severity} onChange={e => setEditForm(f => ({ ...f, severity: e.target.value }))} style={{ ...inputStyle, width: '100px' }}>
                        {['low', 'medium', 'high', 'critical'].map(s => <option key={s} value={s}>{s}</option>)}
                      </select>
                    </td>
                    <td style={tdStyle}>
                      <select value={editForm.action} onChange={e => setEditForm(f => ({ ...f, action: e.target.value }))} style={{ ...inputStyle, width: '130px' }}>
                        {['alert', 'block', 'require_approval'].map(a => <option key={a} value={a}>{a.replace(/_/g, ' ')}</option>)}
                      </select>
                    </td>
                    <td style={tdStyle}>
                      <textarea value={editForm.conditions} onChange={e => setEditForm(f => ({ ...f, conditions: e.target.value }))}
                        style={{ ...inputStyle, width: '200px', fontFamily: 'monospace', fontSize: '11px', resize: 'vertical' }} rows={3} />
                    </td>
                    <td style={tdStyle}>
                      <div style={{ display: 'flex', gap: '4px' }}>
                        <button onClick={() => handleSave(rule.id)} disabled={saving}
                          style={{ padding: '4px 10px', background: '#16a34a', color: 'white', border: 'none', borderRadius: '4px', cursor: 'pointer', fontSize: '12px' }}>
                          Save
                        </button>
                        <button onClick={() => setEditingId(null)}
                          style={{ padding: '4px 10px', background: '#d1d5db', border: 'none', borderRadius: '4px', cursor: 'pointer', fontSize: '12px' }}>
                          Cancel
                        </button>
                      </div>
                    </td>
                  </>
                ) : (
                  <>
                    <td style={tdStyle}><strong>{rule.risk_points}</strong></td>
                    <td style={tdStyle}><SeverityBadge severity={rule.severity} /></td>
                    <td style={tdStyle}><span style={{ fontSize: '12px', textTransform: 'capitalize' }}>{(rule.action || '').replace(/_/g, ' ')}</span></td>
                    <td style={tdStyle}><code style={{ fontSize: '11px', color: '#6b7280' }}>{JSON.stringify(rule.conditions)}</code></td>
                    <td style={tdStyle}>
                      <button onClick={() => startEdit(rule)}
                        style={{ padding: '4px 10px', background: '#f3f4f6', border: '1px solid #d1d5db', borderRadius: '4px', cursor: 'pointer', fontSize: '12px' }}>
                        Edit
                      </button>
                    </td>
                  </>
                )}
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}

// ============================================================================
// SHARED STYLES
// ============================================================================

const thStyle = { textAlign: 'left', padding: '10px 12px', fontSize: '12px', fontWeight: 600, color: '#6b7280', textTransform: 'uppercase', letterSpacing: '0.05em' };
const tdStyle = { padding: '10px 12px', fontSize: '14px', verticalAlign: 'middle' };
const labelStyle = { display: 'block', fontSize: '12px', fontWeight: 600, color: '#374151', marginBottom: '4px' };
const inputStyle = { width: '100%', padding: '8px', borderRadius: '6px', border: '1px solid #d1d5db', fontSize: '13px' };

// ============================================================================
// MAIN DASHBOARD
// ============================================================================

export default function FraudDashboard() {
  const { token } = useAuth();
  const [activeTab, setActiveTab] = useState('alerts');
  const [stats, setStats] = useState(null);

  useEffect(() => {
    const fetchStats = async () => {
      try {
        const res = await authFetch(`${API_URL}/api/fraud/dashboard`, {
          headers: { 'Authorization': `Bearer ${token}` }
        });
        const data = await res.json();
        if (data.success) setStats(data.data);
      } catch (err) {
        console.error('Failed to fetch dashboard stats:', err);
      }
    };
    fetchStats();
  }, [token]);

  const tabs = [
    { id: 'alerts', label: 'Alert Queue', badge: stats?.new_alerts },
    { id: 'employees', label: 'Employee Monitor' },
    { id: 'incidents', label: 'Incidents', badge: stats?.active_incidents },
    { id: 'chargebacks', label: 'Chargebacks', badge: stats?.active_chargebacks },
    { id: 'rules', label: 'Rules Config' },
  ];

  return (
    <div style={{ padding: '24px', maxWidth: '1400px', margin: '0 auto' }}>
      {/* Header */}
      <div style={{ marginBottom: '24px' }}>
        <h1 style={{ margin: '0 0 8px', fontSize: '28px', fontWeight: 700, color: '#111827' }}>
          Fraud & Audit Dashboard
        </h1>
        <p style={{ margin: 0, color: '#6b7280', fontSize: '14px' }}>
          Monitor fraud alerts, review incidents, and manage detection rules
        </p>
      </div>

      {/* Summary Cards */}
      {stats && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '16px', marginBottom: '24px' }}>
          <div style={cardStyle}>
            <p style={cardLabel}>New Alerts</p>
            <p style={{ ...cardValue, color: parseInt(stats.new_alerts) > 0 ? '#dc2626' : '#111827' }}>{stats.new_alerts || 0}</p>
          </div>
          <div style={cardStyle}>
            <p style={cardLabel}>Pending Reviews</p>
            <p style={{ ...cardValue, color: parseInt(stats.pending_reviews) > 0 ? '#d97706' : '#111827' }}>{stats.pending_reviews || 0}</p>
          </div>
          <div style={cardStyle}>
            <p style={cardLabel}>Active Incidents</p>
            <p style={cardValue}>{stats.active_incidents || 0}</p>
          </div>
          <div style={cardStyle}>
            <p style={cardLabel}>30-Day Loss</p>
            <p style={cardValue}>{formatCurrency(stats.total_loss_30d)}</p>
          </div>
        </div>
      )}

      {/* Tabs */}
      <div style={{ display: 'flex', gap: '8px', marginBottom: '16px', borderBottom: '1px solid #e5e7eb', paddingBottom: '8px' }}>
        {tabs.map(tab => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            style={{
              padding: '8px 16px',
              background: activeTab === tab.id ? '#667eea' : 'transparent',
              color: activeTab === tab.id ? 'white' : '#6b7280',
              border: 'none', borderRadius: '6px', cursor: 'pointer',
              fontSize: '14px', fontWeight: 500,
              display: 'flex', alignItems: 'center', gap: '6px',
            }}
          >
            {tab.label}
            {tab.badge > 0 && (
              <span style={{
                padding: '1px 7px', borderRadius: '10px', fontSize: '11px', fontWeight: 700,
                background: activeTab === tab.id ? 'rgba(255,255,255,0.3)' : '#fee2e2',
                color: activeTab === tab.id ? 'white' : '#dc2626',
              }}>
                {tab.badge}
              </span>
            )}
          </button>
        ))}
      </div>

      {/* Tab Content */}
      <div style={{ background: 'white', borderRadius: '12px', padding: '24px', boxShadow: '0 1px 3px rgba(0,0,0,0.1)' }}>
        {activeTab === 'alerts' && <AlertQueue token={token} />}
        {activeTab === 'employees' && <EmployeeMonitor token={token} />}
        {activeTab === 'incidents' && <Incidents token={token} />}
        {activeTab === 'chargebacks' && <Chargebacks token={token} />}
        {activeTab === 'rules' && <RulesConfig token={token} />}
      </div>
    </div>
  );
}

const cardStyle = { background: 'white', borderRadius: '12px', padding: '20px', boxShadow: '0 1px 3px rgba(0,0,0,0.1)' };
const cardLabel = { margin: '0 0 4px', fontSize: '13px', color: '#6b7280', fontWeight: 500 };
const cardValue = { margin: 0, fontSize: '28px', fontWeight: 700, color: '#111827' };
