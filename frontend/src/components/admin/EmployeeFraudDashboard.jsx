/**
 * EmployeeFraudDashboard — Manager-facing employee risk overview
 *
 * Summary card grid showing all employees at the selected location with
 * risk scores, behavioral metrics, and exception alerts. Click any card
 * to drill into the EmployeeRiskDetail view.
 */

import { useState, useEffect, useCallback } from 'react';
import { authFetch } from '../../services/authFetch';
import EmployeeRiskDetail from './EmployeeRiskDetail';

// ---------------------------------------------------------------------------
// Style helpers
// ---------------------------------------------------------------------------
const RISK_COLORS = {
  critical: { bg: '#fee2e2', text: '#991b1b', border: '#fca5a5', dot: '#dc2626' },
  high:     { bg: '#fed7aa', text: '#c2410c', border: '#fdba74', dot: '#ea580c' },
  elevated: { bg: '#fef3c7', text: '#92400e', border: '#fcd34d', dot: '#d97706' },
  watch:    { bg: '#e0f2fe', text: '#075985', border: '#7dd3fc', dot: '#0284c7' },
  normal:   { bg: '#f0fdf4', text: '#166534', border: '#86efac', dot: '#16a34a' },
};

function riskColor(level) {
  return RISK_COLORS[level] || RISK_COLORS.normal;
}

function scoreColor(score) {
  if (score >= 70) return '#dc2626';
  if (score >= 50) return '#ea580c';
  if (score >= 30) return '#d97706';
  return '#16a34a';
}

function formatRate(rate) {
  if (rate == null) return '—';
  return (rate * 100).toFixed(1) + '%';
}

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

function SummaryCards({ stats }) {
  const cards = [
    { label: 'Total Monitored', value: stats.total, color: '#6b7280' },
    { label: 'Critical / High', value: stats.critical + stats.high, color: '#dc2626' },
    { label: 'Elevated / Watch', value: stats.elevated + stats.watch, color: '#d97706' },
    { label: 'Normal', value: stats.normal, color: '#16a34a' },
  ];

  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '16px', marginBottom: '24px' }}>
      {cards.map((c, i) => (
        <div key={i} style={{
          background: 'white', borderRadius: '12px', padding: '20px',
          boxShadow: '0 1px 3px rgba(0,0,0,0.1)', borderLeft: `4px solid ${c.color}`,
        }}>
          <div style={{ fontSize: '13px', color: '#6b7280', marginBottom: '4px' }}>{c.label}</div>
          <div style={{ fontSize: '28px', fontWeight: 700, color: c.color }}>{c.value}</div>
        </div>
      ))}
    </div>
  );
}

function FilterBar({ filters, onChange, onRefresh, refreshing }) {
  const update = (key, val) => onChange({ ...filters, [key]: val });

  return (
    <div style={{
      display: 'flex', gap: '12px', alignItems: 'center', flexWrap: 'wrap',
      marginBottom: '20px', padding: '16px', background: '#f9fafb',
      borderRadius: '10px',
    }}>
      {/* Risk level */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
        <label style={{ fontSize: '11px', fontWeight: 600, color: '#6b7280', textTransform: 'uppercase' }}>Risk Level</label>
        <select value={filters.risk_level} onChange={e => update('risk_level', e.target.value)}
          style={{ padding: '8px 12px', borderRadius: '6px', border: '1px solid #d1d5db', fontSize: '13px', minWidth: '140px' }}>
          <option value="">All Levels</option>
          <option value="critical">Critical</option>
          <option value="high">High</option>
          <option value="elevated">Elevated</option>
          <option value="watch">Watch</option>
          <option value="normal">Normal</option>
        </select>
      </div>

      {/* Min score */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
        <label style={{ fontSize: '11px', fontWeight: 600, color: '#6b7280', textTransform: 'uppercase' }}>Min Score</label>
        <input type="number" min="0" max="100" value={filters.min_score}
          onChange={e => update('min_score', e.target.value)}
          placeholder="0"
          style={{ padding: '8px 12px', borderRadius: '6px', border: '1px solid #d1d5db', fontSize: '13px', width: '80px' }}
        />
      </div>

      {/* Sort */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
        <label style={{ fontSize: '11px', fontWeight: 600, color: '#6b7280', textTransform: 'uppercase' }}>Sort By</label>
        <select value={filters.sort_by} onChange={e => update('sort_by', e.target.value)}
          style={{ padding: '8px 12px', borderRadius: '6px', border: '1px solid #d1d5db', fontSize: '13px', minWidth: '160px' }}>
          <option value="risk_score">Risk Score (High First)</option>
          <option value="employee_name">Name (A-Z)</option>
          <option value="total_transactions">Total Transactions</option>
          <option value="void_rate_zscore">Void Rate Z-Score</option>
          <option value="refund_rate_zscore">Refund Rate Z-Score</option>
          <option value="discount_rate_zscore">Discount Rate Z-Score</option>
        </select>
      </div>

      <div style={{ flex: 1 }} />

      {/* Refresh */}
      <button onClick={onRefresh} disabled={refreshing}
        style={{
          padding: '10px 20px', borderRadius: '8px', border: 'none',
          background: refreshing ? '#9ca3af' : '#667eea', color: 'white',
          fontWeight: 600, fontSize: '13px', cursor: refreshing ? 'wait' : 'pointer',
          alignSelf: 'flex-end',
        }}>
        {refreshing ? 'Refreshing...' : 'Refresh Metrics'}
      </button>
    </div>
  );
}

function RiskScoreBadge({ score }) {
  const color = scoreColor(score);
  const size = 56;
  const radius = 22;
  const circumference = 2 * Math.PI * radius;
  const offset = circumference - (score / 100) * circumference;

  return (
    <div style={{ position: 'relative', width: size, height: size }}>
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
        <circle cx={size / 2} cy={size / 2} r={radius} fill="none" stroke="#e5e7eb" strokeWidth="5" />
        <circle cx={size / 2} cy={size / 2} r={radius} fill="none" stroke={color} strokeWidth="5"
          strokeDasharray={circumference} strokeDashoffset={offset}
          strokeLinecap="round" transform={`rotate(-90 ${size / 2} ${size / 2})`}
          style={{ transition: 'stroke-dashoffset 0.6s ease' }} />
      </svg>
      <div style={{
        position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center',
        fontSize: '16px', fontWeight: 700, color,
      }}>
        {score}
      </div>
    </div>
  );
}

function EmployeeCard({ employee, onClick }) {
  const rc = riskColor(employee.risk_level);
  const topFlag = getTopFlag(employee);

  return (
    <div onClick={() => onClick(employee)}
      style={{
        background: 'white', borderRadius: '12px', padding: '20px',
        boxShadow: '0 1px 3px rgba(0,0,0,0.1)', cursor: 'pointer',
        border: `1px solid ${rc.border}`, transition: 'box-shadow 0.15s, transform 0.15s',
      }}
      onMouseEnter={e => { e.currentTarget.style.boxShadow = '0 4px 12px rgba(0,0,0,0.15)'; e.currentTarget.style.transform = 'translateY(-2px)'; }}
      onMouseLeave={e => { e.currentTarget.style.boxShadow = '0 1px 3px rgba(0,0,0,0.1)'; e.currentTarget.style.transform = 'translateY(0)'; }}
    >
      {/* Header row */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '12px' }}>
        {/* Avatar */}
        <div style={{
          width: 40, height: 40, borderRadius: '50%', background: '#e5e7eb',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          fontSize: '16px', fontWeight: 700, color: '#6b7280',
        }}>
          {(employee.employee_name || '??').split(' ').map(n => n[0]).join('').substring(0, 2).toUpperCase()}
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: '14px', fontWeight: 600, color: '#111827', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
            {employee.employee_name || `Employee #${employee.user_id}`}
          </div>
          <div style={{ fontSize: '12px', color: '#6b7280' }}>
            {employee.role || 'Staff'}
          </div>
        </div>
        <RiskScoreBadge score={employee.risk_score || 0} />
      </div>

      {/* Risk level badge */}
      <div style={{ marginBottom: '12px' }}>
        <span style={{
          display: 'inline-block', padding: '3px 10px', borderRadius: '12px',
          fontSize: '11px', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.5px',
          background: rc.bg, color: rc.text,
        }}>
          {employee.risk_level || 'normal'}
        </span>
      </div>

      {/* Metrics */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '8px', fontSize: '12px' }}>
        <MetricCell label="Transactions" value={employee.total_transactions || 0} />
        <MetricCell label="Void Rate" value={formatRate(employee.void_rate)} zscore={employee.void_rate_zscore} />
        <MetricCell label="Refund Rate" value={formatRate(employee.refund_rate)} zscore={employee.refund_rate_zscore} />
      </div>

      {/* Top flagged metric */}
      {topFlag && (
        <div style={{
          marginTop: '10px', padding: '6px 10px', borderRadius: '6px',
          background: '#fef3c7', fontSize: '11px', color: '#92400e',
          display: 'flex', alignItems: 'center', gap: '6px',
        }}>
          <span style={{ fontSize: '14px' }}>&#9888;</span>
          {topFlag}
        </div>
      )}
    </div>
  );
}

function MetricCell({ label, value, zscore }) {
  const isHigh = zscore != null && Math.abs(zscore) > 2.0;
  return (
    <div style={{ textAlign: 'center' }}>
      <div style={{ color: '#9ca3af', fontSize: '10px', marginBottom: '2px' }}>{label}</div>
      <div style={{ fontWeight: 600, color: isHigh ? '#dc2626' : '#374151' }}>{value}</div>
      {zscore != null && Math.abs(zscore) > 1.5 && (
        <div style={{ fontSize: '9px', color: isHigh ? '#dc2626' : '#d97706' }}>
          z={zscore.toFixed(1)}
        </div>
      )}
    </div>
  );
}

function getTopFlag(emp) {
  const flags = [];
  if (emp.void_rate_zscore > 2.0) flags.push(`Void rate ${(emp.void_rate * 100).toFixed(1)}% (z=${emp.void_rate_zscore.toFixed(1)})`);
  if (emp.refund_rate_zscore > 2.0) flags.push(`Refund rate ${(emp.refund_rate * 100).toFixed(1)}% (z=${emp.refund_rate_zscore.toFixed(1)})`);
  if (emp.discount_rate_zscore > 2.0) flags.push(`Discount rate ${(emp.discount_rate * 100).toFixed(1)}% (z=${emp.discount_rate_zscore.toFixed(1)})`);

  const patterns = emp.flagged_patterns;
  if (patterns && typeof patterns === 'object') {
    const patternKeys = Object.keys(patterns);
    if (patternKeys.length > 0) {
      flags.push(`${patternKeys.length} flagged pattern${patternKeys.length > 1 ? 's' : ''}`);
    }
  }

  return flags.length > 0 ? flags[0] : null;
}

function Pagination({ page, totalPages, onPageChange }) {
  if (totalPages <= 1) return null;

  return (
    <div style={{ display: 'flex', justifyContent: 'center', gap: '8px', marginTop: '20px' }}>
      <button onClick={() => onPageChange(page - 1)} disabled={page <= 1}
        style={{
          padding: '6px 14px', borderRadius: '6px', border: '1px solid #d1d5db',
          background: page <= 1 ? '#f3f4f6' : 'white', color: page <= 1 ? '#9ca3af' : '#374151',
          cursor: page <= 1 ? 'default' : 'pointer', fontSize: '13px',
        }}>
        Prev
      </button>
      <span style={{ display: 'flex', alignItems: 'center', fontSize: '13px', color: '#6b7280' }}>
        Page {page} of {totalPages}
      </span>
      <button onClick={() => onPageChange(page + 1)} disabled={page >= totalPages}
        style={{
          padding: '6px 14px', borderRadius: '6px', border: '1px solid #d1d5db',
          background: page >= totalPages ? '#f3f4f6' : 'white', color: page >= totalPages ? '#9ca3af' : '#374151',
          cursor: page >= totalPages ? 'default' : 'pointer', fontSize: '13px',
        }}>
        Next
      </button>
    </div>
  );
}

// ---------------------------------------------------------------------------
// ExceptionAlertsPanel — threshold exceedances for current period
// ---------------------------------------------------------------------------
function ExceptionAlertsPanel({ employees, onSelectEmployee }) {
  const exceptions = [];

  for (const emp of employees) {
    const metrics = [
      { name: 'Void Rate', value: emp.void_rate, zscore: emp.void_rate_zscore, threshold: 2.0 },
      { name: 'Refund Rate', value: emp.refund_rate, zscore: emp.refund_rate_zscore, threshold: 2.0 },
      { name: 'Discount Rate', value: emp.discount_rate, zscore: emp.discount_rate_zscore, threshold: 2.0 },
    ];

    for (const m of metrics) {
      if (m.zscore != null && m.zscore > m.threshold) {
        exceptions.push({
          employee: emp,
          metric: m.name,
          value: m.value,
          zscore: m.zscore,
          severity: m.zscore > 3.0 ? 'critical' : m.zscore > 2.5 ? 'high' : 'elevated',
        });
      }
    }

    // flagged patterns
    if (emp.flagged_patterns && typeof emp.flagged_patterns === 'object') {
      for (const [key, pattern] of Object.entries(emp.flagged_patterns)) {
        exceptions.push({
          employee: emp,
          metric: key.replace(/_/g, ' '),
          value: pattern.count || pattern.value || '—',
          zscore: null,
          severity: pattern.severity || 'elevated',
          isPattern: true,
          description: pattern.description || pattern.details || key,
        });
      }
    }
  }

  // Sort by severity
  const severityOrder = { critical: 0, high: 1, elevated: 2, watch: 3 };
  exceptions.sort((a, b) => (severityOrder[a.severity] ?? 9) - (severityOrder[b.severity] ?? 9));

  if (exceptions.length === 0) {
    return (
      <div style={{
        padding: '40px', textAlign: 'center', color: '#9ca3af',
        background: '#f9fafb', borderRadius: '10px',
      }}>
        No threshold exceedances detected for the current period.
      </div>
    );
  }

  return (
    <div style={{ background: 'white', borderRadius: '12px', boxShadow: '0 1px 3px rgba(0,0,0,0.1)' }}>
      <div style={{ padding: '16px 20px', borderBottom: '2px solid #e5e7eb', display: 'flex', alignItems: 'center', gap: '8px' }}>
        <span style={{ fontSize: '16px' }}>&#9888;</span>
        <h3 style={{ margin: 0, fontSize: '15px', fontWeight: 600, color: '#111827' }}>
          Exception Alerts ({exceptions.length})
        </h3>
      </div>
      <div style={{ maxHeight: '400px', overflowY: 'auto' }}>
        {exceptions.map((ex, i) => {
          const rc = riskColor(ex.severity);
          return (
            <div key={i}
              onClick={() => onSelectEmployee(ex.employee)}
              style={{
                padding: '12px 20px', borderBottom: '1px solid #f3f4f6',
                display: 'flex', alignItems: 'center', gap: '12px',
                cursor: 'pointer', transition: 'background 0.1s',
              }}
              onMouseEnter={e => { e.currentTarget.style.background = '#f9fafb'; }}
              onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; }}
            >
              <span style={{
                display: 'inline-block', padding: '2px 8px', borderRadius: '10px',
                fontSize: '10px', fontWeight: 600, textTransform: 'uppercase',
                background: rc.bg, color: rc.text, flexShrink: 0,
              }}>
                {ex.severity}
              </span>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: '13px', fontWeight: 500, color: '#111827' }}>
                  {ex.employee.employee_name || `Employee #${ex.employee.user_id}`}
                  <span style={{ color: '#9ca3af', fontWeight: 400 }}> — {ex.isPattern ? ex.description : ex.metric}</span>
                </div>
              </div>
              <div style={{ textAlign: 'right', flexShrink: 0 }}>
                {ex.zscore != null && (
                  <div style={{ fontSize: '12px', fontWeight: 600, color: ex.zscore > 2.5 ? '#dc2626' : '#d97706' }}>
                    z={ex.zscore.toFixed(2)}
                  </div>
                )}
                <div style={{ fontSize: '11px', color: '#6b7280' }}>
                  {ex.isPattern ? '' : `Value: ${formatRate(ex.value)}`}
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main Component
// ---------------------------------------------------------------------------
export default function EmployeeFraudDashboard() {
  const [employees, setEmployees] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [refreshing, setRefreshing] = useState(false);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const limit = 24;

  const [filters, setFilters] = useState({
    risk_level: '', min_score: '', sort_by: 'risk_score',
  });

  // Detail drill-down
  const [selectedEmployee, setSelectedEmployee] = useState(null);

  // View toggle: 'cards' | 'alerts'
  const [view, setView] = useState('cards');

  // -----------------------------------------------------------------------
  // Data fetching
  // -----------------------------------------------------------------------
  const fetchEmployees = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams();
      params.set('page', String(page));
      params.set('limit', String(limit));
      params.set('sort_by', filters.sort_by);
      params.set('sort_dir', filters.sort_by === 'employee_name' ? 'ASC' : 'DESC');
      if (filters.risk_level) params.set('risk_level', filters.risk_level);
      if (filters.min_score) params.set('min_score', filters.min_score);

      const res = await authFetch(`/api/fraud/employees?${params.toString()}`);
      const data = await res.json();

      if (data.success !== false) {
        setEmployees(data.rows || data.data?.rows || []);
        setTotal(data.total || data.data?.total || 0);
      } else {
        setError(data.error || 'Failed to load employee data');
      }
    } catch (err) {
      setError('Network error loading employee data');
    }
    setLoading(false);
  }, [page, filters]);

  useEffect(() => { fetchEmployees(); }, [fetchEmployees]);

  // -----------------------------------------------------------------------
  // Refresh metrics
  // -----------------------------------------------------------------------
  const handleRefresh = async () => {
    setRefreshing(true);
    try {
      const res = await authFetch('/api/fraud/employees/refresh', { method: 'POST' });
      await res.json();
      await fetchEmployees();
    } catch { /* ignore */ }
    setRefreshing(false);
  };

  // -----------------------------------------------------------------------
  // Stats
  // -----------------------------------------------------------------------
  const stats = employees.reduce((acc, e) => {
    acc.total++;
    const level = e.risk_level || 'normal';
    acc[level] = (acc[level] || 0) + 1;
    return acc;
  }, { total: 0, critical: 0, high: 0, elevated: 0, watch: 0, normal: 0 });

  // If total from server is more than current page, use that for stats total
  if (total > stats.total) stats.total = total;

  // -----------------------------------------------------------------------
  // Detail view
  // -----------------------------------------------------------------------
  if (selectedEmployee) {
    return (
      <div>
        <button onClick={() => setSelectedEmployee(null)}
          style={{
            padding: '8px 16px', borderRadius: '8px', border: '1px solid #d1d5db',
            background: 'white', color: '#374151', cursor: 'pointer',
            fontSize: '13px', fontWeight: 500, marginBottom: '16px',
            display: 'flex', alignItems: 'center', gap: '6px',
          }}>
          &#8592; Back to Employee List
        </button>
        <EmployeeRiskDetail
          userId={selectedEmployee.user_id}
          employeeName={selectedEmployee.employee_name}
        />
      </div>
    );
  }

  // -----------------------------------------------------------------------
  // Render
  // -----------------------------------------------------------------------
  return (
    <div>
      {/* Summary cards */}
      <SummaryCards stats={stats} />

      {/* View toggle */}
      <div style={{
        display: 'flex', gap: '4px', background: '#f3f4f6', padding: '4px',
        borderRadius: '10px', marginBottom: '16px', width: 'fit-content',
      }}>
        {[
          { id: 'cards', label: 'Employee Cards' },
          { id: 'alerts', label: 'Exception Alerts' },
        ].map(v => (
          <button key={v.id} onClick={() => setView(v.id)}
            style={{
              padding: '8px 20px', borderRadius: '8px', border: 'none',
              background: view === v.id ? '#667eea' : 'transparent',
              color: view === v.id ? 'white' : '#6b7280',
              fontWeight: 600, fontSize: '13px', cursor: 'pointer',
            }}>
            {v.label}
          </button>
        ))}
      </div>

      {/* Exception Alerts view */}
      {view === 'alerts' && (
        <ExceptionAlertsPanel employees={employees} onSelectEmployee={setSelectedEmployee} />
      )}

      {/* Cards view */}
      {view === 'cards' && (
        <>
          <FilterBar filters={filters} onChange={f => { setFilters(f); setPage(1); }} onRefresh={handleRefresh} refreshing={refreshing} />

          {error && (
            <div style={{ padding: '16px', background: '#fee2e2', borderRadius: '8px', color: '#991b1b', fontSize: '13px', marginBottom: '16px' }}>
              {error}
            </div>
          )}

          {loading ? (
            <div style={{ padding: '60px', textAlign: 'center', color: '#9ca3af' }}>
              <div style={{
                width: '32px', height: '32px', border: '3px solid #e5e7eb',
                borderTopColor: '#667eea', borderRadius: '50%',
                animation: 'spin 0.8s linear infinite', margin: '0 auto 12px',
              }} />
              Loading employee data...
              <style>{`@keyframes spin { to { transform: rotate(360deg) } }`}</style>
            </div>
          ) : employees.length === 0 ? (
            <div style={{ padding: '60px', textAlign: 'center', color: '#9ca3af', background: '#f9fafb', borderRadius: '10px' }}>
              No employees found matching the current filters.
              <br />
              <button onClick={handleRefresh} style={{
                marginTop: '12px', padding: '8px 16px', borderRadius: '6px',
                border: '1px solid #d1d5db', background: 'white', cursor: 'pointer', fontSize: '13px',
              }}>
                Refresh Metrics
              </button>
            </div>
          ) : (
            <>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gap: '16px' }}>
                {employees.map(emp => (
                  <EmployeeCard key={emp.user_id} employee={emp} onClick={setSelectedEmployee} />
                ))}
              </div>
              <Pagination page={page} totalPages={Math.ceil(total / limit)} onPageChange={setPage} />
            </>
          )}
        </>
      )}
    </div>
  );
}
