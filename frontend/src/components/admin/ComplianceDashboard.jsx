import React, { useState, useEffect, useCallback } from 'react';
import { authFetch } from '../../services/authFetch';

// ============================================================================
// HELPERS
// ============================================================================

const SEVERITY_COLORS = {
  critical: { bg: '#fef2f2', text: '#991b1b', border: '#fecaca' },
  error:    { bg: '#fff7ed', text: '#9a3412', border: '#fed7aa' },
  warning:  { bg: '#fefce8', text: '#854d0e', border: '#fef08a' },
  info:     { bg: '#eff6ff', text: '#1e40af', border: '#bfdbfe' },
};

const CATEGORY_COLORS = {
  auth:        '#ef4444',
  transaction: '#3b82f6',
  fraud:       '#f59e0b',
  inventory:   '#10b981',
  config:      '#8b5cf6',
  system:      '#6b7280',
  export:      '#ec4899',
  customer:    '#06b6d4',
  general:     '#9ca3af',
};

const formatNumber = (n) => {
  if (n == null) return '—';
  return new Intl.NumberFormat().format(n);
};

const formatDate = (d) => {
  if (!d) return '—';
  return new Date(d).toLocaleString('en-CA', { dateStyle: 'medium', timeStyle: 'short' });
};

const formatBytes = (str) => str || '—';

// ============================================================================
// SUB-COMPONENTS
// ============================================================================

function StatusBadge({ status }) {
  const isOk = status === 'verified' || status === 'no_verification_run';
  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center', gap: '6px',
      padding: '4px 12px', borderRadius: '20px', fontSize: '13px', fontWeight: 600,
      background: isOk ? '#dcfce7' : '#fef2f2',
      color: isOk ? '#166534' : '#991b1b',
    }}>
      <span style={{
        width: '8px', height: '8px', borderRadius: '50%',
        background: isOk ? '#22c55e' : '#ef4444',
        display: 'inline-block',
      }} />
      {status === 'verified' ? 'Chain Verified' :
       status === 'no_verification_run' ? 'Not Yet Checked' :
       status === 'not_checked' ? 'Not Yet Checked' :
       'Violations Detected'}
    </span>
  );
}

function KpiCard({ label, value, subtitle, color }) {
  return (
    <div style={{
      background: 'white', borderRadius: '8px', padding: '16px',
      border: '1px solid #e5e7eb', flex: '1', minWidth: '140px',
    }}>
      <div style={{ fontSize: '12px', color: '#6b7280', marginBottom: '4px' }}>{label}</div>
      <div style={{ fontSize: '24px', fontWeight: 700, color: color || '#111827' }}>{value}</div>
      {subtitle && <div style={{ fontSize: '11px', color: '#9ca3af', marginTop: '2px' }}>{subtitle}</div>}
    </div>
  );
}

function CategoryBar({ categories }) {
  if (!categories || categories.length === 0) return <div style={{ color: '#9ca3af' }}>No data</div>;
  const total = categories.reduce((s, c) => s + c.count, 0);
  return (
    <div>
      {/* Bar */}
      <div style={{ display: 'flex', height: '24px', borderRadius: '6px', overflow: 'hidden', marginBottom: '8px' }}>
        {categories.map((c) => (
          <div
            key={c.category}
            title={`${c.category}: ${c.count}`}
            style={{
              width: `${(c.count / total) * 100}%`,
              background: CATEGORY_COLORS[c.category] || '#9ca3af',
              minWidth: c.count > 0 ? '4px' : '0',
            }}
          />
        ))}
      </div>
      {/* Legend */}
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px' }}>
        {categories.filter(c => c.count > 0).map((c) => (
          <span key={c.category} style={{ display: 'flex', alignItems: 'center', gap: '4px', fontSize: '12px' }}>
            <span style={{
              width: '10px', height: '10px', borderRadius: '2px',
              background: CATEGORY_COLORS[c.category] || '#9ca3af',
              display: 'inline-block',
            }} />
            {c.category} ({formatNumber(c.count)})
          </span>
        ))}
      </div>
    </div>
  );
}

function SeverityTable({ severities }) {
  if (!severities || severities.length === 0) return null;
  return (
    <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
      {severities.map((s) => {
        const colors = SEVERITY_COLORS[s.severity] || SEVERITY_COLORS.info;
        return (
          <div key={s.severity} style={{
            padding: '8px 14px', borderRadius: '6px',
            background: colors.bg, border: `1px solid ${colors.border}`,
            textAlign: 'center', minWidth: '80px',
          }}>
            <div style={{ fontSize: '18px', fontWeight: 700, color: colors.text }}>{formatNumber(s.count)}</div>
            <div style={{ fontSize: '11px', color: colors.text, textTransform: 'capitalize' }}>{s.severity}</div>
          </div>
        );
      })}
    </div>
  );
}

function RetentionTiers({ retention }) {
  if (!retention) return null;
  return (
    <div>
      <div style={{ display: 'flex', gap: '12px', marginBottom: '12px', flexWrap: 'wrap' }}>
        {Object.entries(retention.tiers || {}).map(([tier, data]) => (
          <div key={tier} style={{
            flex: '1', minWidth: '120px', padding: '12px', borderRadius: '8px',
            background: tier === 'hot' ? '#ecfdf5' : tier === 'warm' ? '#fefce8' : '#f3f4f6',
            border: `1px solid ${tier === 'hot' ? '#a7f3d0' : tier === 'warm' ? '#fef08a' : '#d1d5db'}`,
          }}>
            <div style={{ fontSize: '11px', color: '#6b7280', textTransform: 'uppercase', fontWeight: 600 }}>
              {tier} ({data.label})
            </div>
            <div style={{ fontSize: '20px', fontWeight: 700, color: '#111827', marginTop: '2px' }}>
              {formatNumber(data.count)}
            </div>
          </div>
        ))}
      </div>
      <div style={{ fontSize: '12px', color: '#6b7280' }}>
        Table size: {formatBytes(retention.table_size)} |
        Archived files: {retention.archived_files?.length || 0}
      </div>
    </div>
  );
}

function FailedLoginsSection({ failedLogins }) {
  if (!failedLogins || failedLogins.total === 0) {
    return <div style={{ color: '#10b981', fontSize: '14px', fontWeight: 500 }}>No failed login attempts</div>;
  }
  return (
    <div>
      <div style={{ fontSize: '24px', fontWeight: 700, color: '#ef4444', marginBottom: '8px' }}>
        {formatNumber(failedLogins.total)} failed attempts
      </div>
      {failedLogins.by_ip?.length > 0 && (
        <div style={{ marginTop: '8px' }}>
          <div style={{ fontSize: '12px', fontWeight: 600, color: '#374151', marginBottom: '4px' }}>Top IPs</div>
          <table style={{ width: '100%', fontSize: '12px', borderCollapse: 'collapse' }}>
            <tbody>
              {failedLogins.by_ip.slice(0, 5).map((item, i) => (
                <tr key={i} style={{ borderBottom: '1px solid #f3f4f6' }}>
                  <td style={{ padding: '4px 0', fontFamily: 'monospace' }}>{String(item.ip_address)}</td>
                  <td style={{ padding: '4px 0', textAlign: 'right', fontWeight: 600 }}>{item.count}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

// ============================================================================
// MAIN COMPONENT
// ============================================================================

export default function ComplianceDashboard() {
  const [report, setReport] = useState(null);
  const [retention, setRetention] = useState(null);
  const [chainStatus, setChainStatus] = useState(null);
  const [loading, setLoading] = useState(true);
  const [verifying, setVerifying] = useState(false);
  const [period, setPeriod] = useState('month');
  const [error, setError] = useState(null);

  const loadData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [reportRes, retentionRes, chainRes] = await Promise.all([
        authFetch(`/api/audit/compliance-report?period=${period}`),
        authFetch('/api/audit/retention-status'),
        authFetch('/api/audit/verify-chain/status'),
      ]);

      if (reportRes.success) setReport(reportRes.data);
      if (retentionRes.success) setRetention(retentionRes.data);
      if (chainRes.success) setChainStatus(chainRes.data);
    } catch (err) {
      setError(err.message || 'Failed to load compliance data');
    } finally {
      setLoading(false);
    }
  }, [period]);

  useEffect(() => { loadData(); }, [loadData]);

  const handleVerifyChain = async () => {
    setVerifying(true);
    try {
      const weekAgo = new Date();
      weekAgo.setDate(weekAgo.getDate() - 7);
      const res = await authFetch('/api/audit/verify-chain', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          start_date: weekAgo.toISOString().slice(0, 10),
          end_date: new Date().toISOString().slice(0, 10),
        }),
      });
      if (res.success) {
        setChainStatus(res.data);
      }
    } catch (err) {
      setError('Chain verification failed: ' + err.message);
    } finally {
      setVerifying(false);
    }
  };

  const handleExport = async () => {
    try {
      const res = await authFetch('/api/audit/compliance-report?period=' + period);
      if (res.success) {
        const blob = new Blob([JSON.stringify(res.data, null, 2)], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `pci_compliance_report_${period}_${new Date().toISOString().slice(0, 10)}.json`;
        a.click();
        URL.revokeObjectURL(url);
      }
    } catch (err) {
      setError('Export failed: ' + err.message);
    }
  };

  if (loading) {
    return (
      <div style={{ padding: '40px', textAlign: 'center', color: '#6b7280' }}>
        Loading compliance data...
      </div>
    );
  }

  if (error && !report) {
    return (
      <div style={{ padding: '20px', background: '#fef2f2', borderRadius: '8px', color: '#991b1b' }}>
        {error}
      </div>
    );
  }

  const chainOk = chainStatus?.violations?.length === 0 ||
    chainStatus?.status === 'no_verification_run' ||
    !chainStatus?.violations;

  return (
    <div>
      {/* Header Row */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px', flexWrap: 'wrap', gap: '12px' }}>
        <div>
          <h2 style={{ margin: 0, fontSize: '20px', fontWeight: 700, color: '#111827' }}>
            PCI DSS Compliance
          </h2>
          <p style={{ margin: '4px 0 0', fontSize: '13px', color: '#6b7280' }}>
            Requirement 10 — Audit Trail & Integrity Monitoring
          </p>
        </div>
        <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
          <select
            value={period}
            onChange={(e) => setPeriod(e.target.value)}
            style={{ padding: '6px 12px', borderRadius: '6px', border: '1px solid #d1d5db', fontSize: '13px' }}
          >
            <option value="day">Today</option>
            <option value="week">This Week</option>
            <option value="month">This Month</option>
            <option value="quarter">This Quarter</option>
            <option value="year">This Year</option>
          </select>
          <button
            onClick={handleExport}
            style={{
              padding: '6px 14px', borderRadius: '6px', border: '1px solid #d1d5db',
              background: 'white', cursor: 'pointer', fontSize: '13px',
            }}
          >
            Export JSON
          </button>
        </div>
      </div>

      {error && (
        <div style={{ padding: '10px 14px', background: '#fef2f2', borderRadius: '6px', color: '#991b1b', marginBottom: '16px', fontSize: '13px' }}>
          {error}
        </div>
      )}

      {/* Top KPI Cards */}
      <div style={{ display: 'flex', gap: '12px', marginBottom: '20px', flexWrap: 'wrap' }}>
        <KpiCard
          label="Total Events"
          value={formatNumber(report?.total_events)}
          subtitle={`${period} period`}
        />
        <KpiCard
          label="Failed Logins"
          value={formatNumber(report?.failed_logins?.total)}
          color={report?.failed_logins?.total > 0 ? '#ef4444' : '#10b981'}
        />
        <KpiCard
          label="After-Hours Access"
          value={formatNumber(report?.after_hours_access?.total_events)}
          subtitle={`${report?.after_hours_access?.unique_users || 0} users`}
          color={report?.after_hours_access?.total_events > 0 ? '#f59e0b' : '#10b981'}
        />
        <KpiCard
          label="Config Changes"
          value={formatNumber(report?.configuration_changes?.total)}
          color="#8b5cf6"
        />
        <KpiCard
          label="Data Exports"
          value={formatNumber(report?.data_exports?.total)}
          color="#ec4899"
        />
        <KpiCard
          label="Privilege Events"
          value={formatNumber(report?.privilege_events?.total)}
          color={report?.privilege_events?.total > 0 ? '#f59e0b' : '#10b981'}
        />
      </div>

      {/* Two-Column Layout */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px', marginBottom: '20px' }}>
        {/* Chain Integrity */}
        <div style={{
          background: 'white', borderRadius: '8px', padding: '20px',
          border: `1px solid ${chainOk ? '#e5e7eb' : '#fecaca'}`,
        }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
            <h3 style={{ margin: 0, fontSize: '15px', fontWeight: 600, color: '#111827' }}>
              Hash Chain Integrity
            </h3>
            <StatusBadge status={report?.chain_integrity?.status || 'not_checked'} />
          </div>
          <div style={{ fontSize: '13px', color: '#6b7280', marginBottom: '12px' }}>
            <div>Last checked: {chainStatus?.checked_at ? formatDate(chainStatus.checked_at) : 'Never'}</div>
            {chainStatus?.totalRecords != null && (
              <div>Records verified: {formatNumber(chainStatus.totalRecords)}</div>
            )}
            {chainStatus?.violations?.length > 0 && (
              <div style={{ color: '#ef4444', fontWeight: 600, marginTop: '4px' }}>
                {chainStatus.violations.length} violation(s) detected
              </div>
            )}
          </div>
          <button
            onClick={handleVerifyChain}
            disabled={verifying}
            style={{
              padding: '6px 14px', borderRadius: '6px', fontSize: '13px',
              background: verifying ? '#9ca3af' : '#667eea', color: 'white',
              border: 'none', cursor: verifying ? 'not-allowed' : 'pointer',
            }}
          >
            {verifying ? 'Verifying...' : 'Verify Last 7 Days'}
          </button>
        </div>

        {/* Failed Logins Detail */}
        <div style={{
          background: 'white', borderRadius: '8px', padding: '20px', border: '1px solid #e5e7eb',
        }}>
          <h3 style={{ margin: '0 0 12px', fontSize: '15px', fontWeight: 600, color: '#111827' }}>
            Failed Login Attempts (Req 10.2.4)
          </h3>
          <FailedLoginsSection failedLogins={report?.failed_logins} />
        </div>
      </div>

      {/* Events by Category + Severity */}
      <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: '16px', marginBottom: '20px' }}>
        <div style={{
          background: 'white', borderRadius: '8px', padding: '20px', border: '1px solid #e5e7eb',
        }}>
          <h3 style={{ margin: '0 0 12px', fontSize: '15px', fontWeight: 600, color: '#111827' }}>
            Events by Category (Req 10.2)
          </h3>
          <CategoryBar categories={report?.events_by_category} />
        </div>

        <div style={{
          background: 'white', borderRadius: '8px', padding: '20px', border: '1px solid #e5e7eb',
        }}>
          <h3 style={{ margin: '0 0 12px', fontSize: '15px', fontWeight: 600, color: '#111827' }}>
            By Severity
          </h3>
          <SeverityTable severities={report?.events_by_severity} />
        </div>
      </div>

      {/* Log Retention */}
      <div style={{
        background: 'white', borderRadius: '8px', padding: '20px', border: '1px solid #e5e7eb', marginBottom: '20px',
      }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
          <h3 style={{ margin: 0, fontSize: '15px', fontWeight: 600, color: '#111827' }}>
            Log Retention (Req 10.7)
          </h3>
          <div style={{ display: 'flex', gap: '8px' }}>
            <span style={{
              padding: '3px 10px', borderRadius: '12px', fontSize: '11px', fontWeight: 600,
              background: retention?.compliance?.immediate_access ? '#dcfce7' : '#fef2f2',
              color: retention?.compliance?.immediate_access ? '#166534' : '#991b1b',
            }}>
              3-Month Access: {retention?.compliance?.immediate_access ? 'Compliant' : 'Non-Compliant'}
            </span>
            <span style={{
              padding: '3px 10px', borderRadius: '12px', fontSize: '11px', fontWeight: 600,
              background: retention?.compliance?.annual_retention ? '#dcfce7' : '#fef2f2',
              color: retention?.compliance?.annual_retention ? '#166534' : '#991b1b',
            }}>
              12-Month Retention: {retention?.compliance?.annual_retention ? 'Compliant' : 'Non-Compliant'}
            </span>
          </div>
        </div>
        <RetentionTiers retention={retention} />
        <div style={{ marginTop: '8px', fontSize: '12px', color: '#9ca3af' }}>
          Oldest record: {formatDate(retention?.oldest_record)} |
          Newest record: {formatDate(retention?.newest_record)} |
          Total: {formatNumber(retention?.total_records)} records
        </div>
      </div>

      {/* Report metadata */}
      <div style={{ fontSize: '11px', color: '#9ca3af', textAlign: 'right' }}>
        Report generated: {report?.generated_at ? formatDate(report.generated_at) : '—'} |
        Period: {report?.report_period?.start ? new Date(report.report_period.start).toLocaleDateString('en-CA') : '—'} to {report?.report_period?.end ? new Date(report.report_period.end).toLocaleDateString('en-CA') : '—'}
      </div>
    </div>
  );
}
