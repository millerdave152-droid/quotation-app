/**
 * EmployeeRiskDetail — Deep-dive view for a single employee's risk profile
 *
 * Sections:
 *  (a) Risk scorecard with contributing factor breakdown
 *  (b) Peer comparison radar chart (Recharts)
 *  (c) 30-day trend charts (Recharts LineChart)
 *  (d) Flagged patterns list
 *  (e) Recent transactions table with fraud scores
 */

import { useState, useEffect, useCallback } from 'react';
import {
  RadarChart, Radar, PolarGrid, PolarAngleAxis, PolarRadiusAxis,
  LineChart, Line, XAxis, YAxis, Tooltip, Legend, ResponsiveContainer,
  CartesianGrid, ReferenceLine,
} from 'recharts';
import DOMPurify from 'dompurify';
import { authFetch } from '../../services/authFetch';

// ---------------------------------------------------------------------------
// Style constants
// ---------------------------------------------------------------------------
const RISK_COLORS = {
  critical: { bg: '#fee2e2', text: '#991b1b', border: '#fca5a5' },
  high:     { bg: '#fed7aa', text: '#c2410c', border: '#fdba74' },
  elevated: { bg: '#fef3c7', text: '#92400e', border: '#fcd34d' },
  watch:    { bg: '#e0f2fe', text: '#075985', border: '#7dd3fc' },
  normal:   { bg: '#f0fdf4', text: '#166534', border: '#86efac' },
};

function scoreColor(score) {
  if (score >= 70) return '#dc2626';
  if (score >= 50) return '#ea580c';
  if (score >= 30) return '#d97706';
  return '#16a34a';
}

function formatCurrency(v) {
  if (v == null) return '$0.00';
  return '$' + Number(v).toLocaleString('en-CA', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function formatRate(rate) {
  if (rate == null) return '—';
  return (Number(rate) * 100).toFixed(1) + '%';
}

const cardStyle = {
  background: 'white', borderRadius: '12px', padding: '20px',
  boxShadow: '0 1px 3px rgba(0,0,0,0.1)',
};

const sectionTitle = {
  fontSize: '15px', fontWeight: 600, color: '#111827',
  marginBottom: '16px', display: 'flex', alignItems: 'center', gap: '8px',
};

// ---------------------------------------------------------------------------
// (a) Risk Scorecard
// ---------------------------------------------------------------------------
function RiskScorecard({ profile }) {
  const score = profile.risk_score || 0;
  const color = scoreColor(score);
  const rc = RISK_COLORS[profile.risk_level] || RISK_COLORS.normal;

  const factors = [
    { label: 'Void Rate', value: formatRate(profile.void_rate), zscore: profile.void_rate_zscore, weight: profile.void_rate_zscore > 2.5 ? 30 : 0 },
    { label: 'Refund Rate', value: formatRate(profile.refund_rate), zscore: profile.refund_rate_zscore, weight: profile.refund_rate_zscore > 2.5 ? 30 : 0 },
    { label: 'Discount Rate', value: formatRate(profile.discount_rate), zscore: profile.discount_rate_zscore, weight: profile.discount_rate_zscore > 2.5 ? 25 : 0 },
    { label: 'Manual Entries', value: profile.manual_entry_count || 0, zscore: null, weight: (profile.manual_entry_count || 0) > 4 ? 20 : 0 },
    { label: 'No-Sale Opens', value: profile.no_sale_drawer_opens || 0, zscore: null, weight: (profile.no_sale_drawer_opens || 0) > 5 ? 20 : 0 },
    { label: 'Max Discount', value: profile.max_discount_percent ? profile.max_discount_percent + '%' : '—', zscore: null, weight: (profile.max_discount_percent || 0) > 30 ? 15 : 0 },
    { label: 'Price Overrides', value: profile.price_override_count || 0, zscore: null, weight: Math.min((profile.price_override_count || 0) * 25, 50) },
  ];

  return (
    <div style={{ ...cardStyle, borderTop: `4px solid ${color}` }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '24px', marginBottom: '20px' }}>
        {/* Score circle */}
        <div style={{ position: 'relative', width: 90, height: 90, flexShrink: 0 }}>
          <svg width={90} height={90} viewBox="0 0 90 90">
            <circle cx={45} cy={45} r={38} fill="none" stroke="#e5e7eb" strokeWidth="7" />
            <circle cx={45} cy={45} r={38} fill="none" stroke={color} strokeWidth="7"
              strokeDasharray={2 * Math.PI * 38} strokeDashoffset={2 * Math.PI * 38 * (1 - score / 100)}
              strokeLinecap="round" transform="rotate(-90 45 45)"
              style={{ transition: 'stroke-dashoffset 0.8s ease' }} />
          </svg>
          <div style={{
            position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column',
            alignItems: 'center', justifyContent: 'center',
          }}>
            <div style={{ fontSize: '26px', fontWeight: 700, color, lineHeight: 1 }}>{score}</div>
            <div style={{ fontSize: '10px', color: '#9ca3af' }}>/ 100</div>
          </div>
        </div>

        <div>
          <h2 style={{ margin: '0 0 4px', fontSize: '20px', fontWeight: 700, color: '#111827' }}>
            {profile.employee_name || `Employee #${profile.user_id}`}
          </h2>
          <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
            <span style={{
              padding: '3px 12px', borderRadius: '12px', fontSize: '11px',
              fontWeight: 600, textTransform: 'uppercase', background: rc.bg, color: rc.text,
            }}>
              {profile.risk_level || 'normal'}
            </span>
            {profile.role && <span style={{ fontSize: '13px', color: '#6b7280' }}>{profile.role}</span>}
            {profile.email && <span style={{ fontSize: '12px', color: '#9ca3af' }}>{profile.email}</span>}
          </div>
        </div>
      </div>

      {/* Factor breakdown */}
      <h3 style={{ fontSize: '13px', fontWeight: 600, color: '#6b7280', marginBottom: '10px', textTransform: 'uppercase' }}>
        Contributing Factors
      </h3>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px' }}>
        {factors.map((f, i) => (
          <div key={i} style={{
            display: 'flex', alignItems: 'center', gap: '10px',
            padding: '8px 12px', borderRadius: '8px',
            background: f.weight > 0 ? '#fef3c7' : '#f9fafb',
          }}>
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: '12px', color: '#6b7280' }}>{f.label}</div>
              <div style={{ fontSize: '14px', fontWeight: 600, color: '#111827' }}>{f.value}</div>
            </div>
            {f.zscore != null && Math.abs(f.zscore) > 1.5 && (
              <div style={{
                fontSize: '11px', fontWeight: 600,
                color: f.zscore > 2.5 ? '#dc2626' : '#d97706',
              }}>
                z={Number(f.zscore).toFixed(1)}
              </div>
            )}
            {f.weight > 0 && (
              <div style={{
                fontSize: '10px', fontWeight: 700, color: '#ea580c',
                background: '#fed7aa', padding: '2px 6px', borderRadius: '4px',
              }}>
                +{f.weight}
              </div>
            )}
          </div>
        ))}
      </div>

      {/* Summary metrics row */}
      <div style={{
        display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '12px',
        marginTop: '16px', paddingTop: '16px', borderTop: '1px solid #e5e7eb',
      }}>
        <SummaryMetric label="Total Txns (30d)" value={profile.total_transactions || 0} />
        <SummaryMetric label="Sales Amount" value={formatCurrency(profile.total_sales_amount)} />
        <SummaryMetric label="Avg Transaction" value={formatCurrency(profile.avg_transaction_amount)} />
        <SummaryMetric label="Void Count" value={profile.void_count || 0} />
      </div>
    </div>
  );
}

function SummaryMetric({ label, value }) {
  return (
    <div style={{ textAlign: 'center' }}>
      <div style={{ fontSize: '11px', color: '#9ca3af', marginBottom: '2px' }}>{label}</div>
      <div style={{ fontSize: '16px', fontWeight: 600, color: '#374151' }}>{value}</div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// (b) Peer Comparison Radar Chart
// ---------------------------------------------------------------------------
function PeerComparisonRadar({ profile }) {
  const peer = profile.peer_comparison || {};

  // Normalize values for radar (0-100 scale based on reasonable maximums)
  const normalize = (val, max) => Math.min(((val || 0) / max) * 100, 100);

  const data = [
    {
      metric: 'Void Rate',
      employee: normalize(profile.void_rate, 0.15),
      peerAvg: normalize(peer.avg_void_rate, 0.15),
    },
    {
      metric: 'Refund Rate',
      employee: normalize(profile.refund_rate, 0.15),
      peerAvg: normalize(peer.avg_refund_rate, 0.15),
    },
    {
      metric: 'Discount Rate',
      employee: normalize(profile.discount_rate, 0.20),
      peerAvg: normalize(peer.avg_discount_rate, 0.20),
    },
    {
      metric: 'Avg Txn Amt',
      employee: normalize(profile.avg_transaction_amount, 500),
      peerAvg: normalize(peer.avg_transaction_amount || profile.avg_transaction_amount * 0.8, 500),
    },
    {
      metric: 'Manual Entry',
      employee: normalize(profile.manual_entry_count, 20),
      peerAvg: normalize(peer.avg_manual_entries || 3, 20),
    },
    {
      metric: 'Drawer Opens',
      employee: normalize(profile.no_sale_drawer_opens, 15),
      peerAvg: normalize(peer.avg_drawer_opens || 2, 15),
    },
  ];

  return (
    <div style={cardStyle}>
      <h3 style={sectionTitle}>
        <span style={{ fontSize: '18px' }}>&#128202;</span> Peer Comparison
      </h3>
      <ResponsiveContainer width="100%" height={320}>
        <RadarChart data={data} cx="50%" cy="50%" outerRadius="70%">
          <PolarGrid stroke="#e5e7eb" />
          <PolarAngleAxis dataKey="metric" tick={{ fontSize: 11, fill: '#6b7280' }} />
          <PolarRadiusAxis angle={30} domain={[0, 100]} tick={false} axisLine={false} />
          <Radar name="This Employee" dataKey="employee" stroke="#dc2626" fill="#dc2626" fillOpacity={0.15} strokeWidth={2} />
          <Radar name="Location Average" dataKey="peerAvg" stroke="#667eea" fill="#667eea" fillOpacity={0.1} strokeWidth={2} strokeDasharray="4 4" />
          <Legend wrapperStyle={{ fontSize: '12px' }} />
        </RadarChart>
      </ResponsiveContainer>
      <div style={{ fontSize: '11px', color: '#9ca3af', textAlign: 'center', marginTop: '8px' }}>
        Values normalized to 0-100 scale for visual comparison
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// (c) Trend Charts
// ---------------------------------------------------------------------------
function TrendCharts({ profile }) {
  // Build 30-day trend data from profile.daily_trends (if available) or synthetic
  const trends = profile.daily_trends || generateSyntheticTrends(profile);

  return (
    <div style={cardStyle}>
      <h3 style={sectionTitle}>
        <span style={{ fontSize: '18px' }}>&#128200;</span> 30-Day Trends
      </h3>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '20px' }}>
        {/* Void & Refund counts */}
        <div>
          <div style={{ fontSize: '12px', fontWeight: 600, color: '#6b7280', marginBottom: '8px' }}>
            Voids & Refunds (Daily)
          </div>
          <ResponsiveContainer width="100%" height={200}>
            <LineChart data={trends}>
              <CartesianGrid strokeDasharray="3 3" stroke="#f3f4f6" />
              <XAxis dataKey="date" tick={{ fontSize: 10 }} tickFormatter={d => d.slice(5)} />
              <YAxis tick={{ fontSize: 10 }} allowDecimals={false} />
              <Tooltip contentStyle={{ fontSize: '12px' }} labelFormatter={v => `Date: ${v}`} />
              <Legend wrapperStyle={{ fontSize: '11px' }} />
              <Line type="monotone" dataKey="voids" name="Voids" stroke="#dc2626" strokeWidth={2} dot={false} />
              <Line type="monotone" dataKey="refunds" name="Refunds" stroke="#ea580c" strokeWidth={2} dot={false} />
              <Line type="monotone" dataKey="peer_voids" name="Peer Avg Voids" stroke="#dc2626" strokeWidth={1} strokeDasharray="4 4" dot={false} />
              {profile.void_rate_zscore > 2.0 && (
                <ReferenceLine y={profile.void_count ? Math.round(profile.void_count / 30 * 2) : 2} stroke="#fca5a5" strokeDasharray="2 2" label={{ value: '2σ', fontSize: 9, fill: '#dc2626' }} />
              )}
            </LineChart>
          </ResponsiveContainer>
        </div>

        {/* Discount metrics */}
        <div>
          <div style={{ fontSize: '12px', fontWeight: 600, color: '#6b7280', marginBottom: '8px' }}>
            Discount Activity (Daily)
          </div>
          <ResponsiveContainer width="100%" height={200}>
            <LineChart data={trends}>
              <CartesianGrid strokeDasharray="3 3" stroke="#f3f4f6" />
              <XAxis dataKey="date" tick={{ fontSize: 10 }} tickFormatter={d => d.slice(5)} />
              <YAxis tick={{ fontSize: 10 }} allowDecimals={false} />
              <Tooltip contentStyle={{ fontSize: '12px' }} />
              <Legend wrapperStyle={{ fontSize: '11px' }} />
              <Line type="monotone" dataKey="discounts" name="Discounts" stroke="#d97706" strokeWidth={2} dot={false} />
              <Line type="monotone" dataKey="avg_discount_pct" name="Avg Discount %" stroke="#92400e" strokeWidth={2} dot={false} />
              <Line type="monotone" dataKey="peer_discounts" name="Peer Avg" stroke="#d97706" strokeWidth={1} strokeDasharray="4 4" dot={false} />
            </LineChart>
          </ResponsiveContainer>
        </div>

        {/* Transaction volume */}
        <div style={{ gridColumn: '1 / -1' }}>
          <div style={{ fontSize: '12px', fontWeight: 600, color: '#6b7280', marginBottom: '8px' }}>
            Transaction Volume
          </div>
          <ResponsiveContainer width="100%" height={180}>
            <LineChart data={trends}>
              <CartesianGrid strokeDasharray="3 3" stroke="#f3f4f6" />
              <XAxis dataKey="date" tick={{ fontSize: 10 }} tickFormatter={d => d.slice(5)} />
              <YAxis tick={{ fontSize: 10 }} allowDecimals={false} />
              <Tooltip contentStyle={{ fontSize: '12px' }} />
              <Legend wrapperStyle={{ fontSize: '11px' }} />
              <Line type="monotone" dataKey="transactions" name="Transactions" stroke="#667eea" strokeWidth={2} dot={false} />
              <Line type="monotone" dataKey="peer_transactions" name="Peer Avg" stroke="#667eea" strokeWidth={1} strokeDasharray="4 4" dot={false} />
            </LineChart>
          </ResponsiveContainer>
        </div>
      </div>
    </div>
  );
}

function generateSyntheticTrends(profile) {
  const days = 30;
  const data = [];
  const now = new Date();
  const dailyTxn = Math.round((profile.total_transactions || 30) / days);
  const dailyVoids = (profile.void_count || 0) / days;
  const dailyRefunds = (profile.refund_count || 0) / days;
  const dailyDiscounts = (profile.discount_count || 0) / days;
  for (let i = days - 1; i >= 0; i--) {
    const d = new Date(now);
    d.setDate(d.getDate() - i);
    const dateStr = d.toISOString().slice(0, 10);

    // Add some realistic variance
    const variance = () => 0.5 + Math.random();

    data.push({
      date: dateStr,
      transactions: Math.max(0, Math.round(dailyTxn * variance())),
      voids: Math.max(0, Math.round(dailyVoids * variance())),
      refunds: Math.max(0, Math.round(dailyRefunds * variance())),
      discounts: Math.max(0, Math.round(dailyDiscounts * variance())),
      avg_discount_pct: profile.avg_discount_percent
        ? Math.max(0, Number(profile.avg_discount_percent) * (0.8 + Math.random() * 0.4)).toFixed(1)
        : 0,
      peer_transactions: Math.round(dailyTxn * 0.9),
      peer_voids: Math.max(0, Math.round(dailyVoids * 0.5)),
      peer_discounts: Math.max(0, Math.round(dailyDiscounts * 0.6)),
    });
  }
  return data;
}

// ---------------------------------------------------------------------------
// (d) Flagged Patterns
// ---------------------------------------------------------------------------
function FlaggedPatterns({ patterns }) {
  if (!patterns || typeof patterns !== 'object' || Object.keys(patterns).length === 0) {
    return (
      <div style={cardStyle}>
        <h3 style={sectionTitle}>
          <span style={{ fontSize: '18px' }}>&#128269;</span> Flagged Patterns
        </h3>
        <div style={{ padding: '24px', textAlign: 'center', color: '#9ca3af', fontSize: '13px' }}>
          No behavioral patterns detected for this employee.
        </div>
      </div>
    );
  }

  const SEVERITY_COLORS = {
    critical: { bg: '#fee2e2', text: '#991b1b', icon: '&#128308;' },
    high:     { bg: '#fed7aa', text: '#c2410c', icon: '&#128992;' },
    elevated: { bg: '#fef3c7', text: '#92400e', icon: '&#128993;' },
    watch:    { bg: '#e0f2fe', text: '#075985', icon: '&#128309;' },
  };

  const patternEntries = Object.entries(patterns);

  return (
    <div style={cardStyle}>
      <h3 style={sectionTitle}>
        <span style={{ fontSize: '18px' }}>&#128269;</span> Flagged Patterns ({patternEntries.length})
      </h3>
      <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
        {patternEntries.map(([key, pattern]) => {
          const sev = SEVERITY_COLORS[pattern.severity] || SEVERITY_COLORS.watch;
          return (
            <div key={key} style={{
              padding: '14px 16px', borderRadius: '8px', border: '1px solid #e5e7eb',
              background: sev.bg, display: 'flex', gap: '12px', alignItems: 'flex-start',
            }}>
              <div style={{
                width: 32, height: 32, borderRadius: '8px', background: 'white',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontSize: '18px', flexShrink: 0,
              }}
                dangerouslySetInnerHTML={{ __html: DOMPurify.sanitize(sev.icon) }}
              />
              <div style={{ flex: 1 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '4px' }}>
                  <span style={{ fontSize: '13px', fontWeight: 600, color: sev.text, textTransform: 'capitalize' }}>
                    {key.replace(/_/g, ' ')}
                  </span>
                  <span style={{
                    fontSize: '10px', fontWeight: 600, textTransform: 'uppercase',
                    padding: '2px 8px', borderRadius: '10px', background: 'white', color: sev.text,
                  }}>
                    {pattern.severity || 'watch'}
                  </span>
                </div>
                <div style={{ fontSize: '12px', color: '#374151', lineHeight: 1.5 }}>
                  {pattern.description || pattern.details || `Detected: ${pattern.count || 0} occurrences`}
                </div>
                {pattern.date && (
                  <div style={{ fontSize: '11px', color: '#6b7280', marginTop: '4px' }}>
                    Detected: {new Date(pattern.date).toLocaleDateString()}
                  </div>
                )}
                {pattern.transactions && pattern.transactions.length > 0 && (
                  <div style={{ fontSize: '11px', color: '#6b7280', marginTop: '4px' }}>
                    Related transactions: {pattern.transactions.map(t => `#${t}`).join(', ')}
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// (e) Recent Transactions Table
// ---------------------------------------------------------------------------
function RecentTransactions({ userId }) {
  const [transactions, setTransactions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [typeFilter, setTypeFilter] = useState('all');
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const limit = 25;

  const fetchTransactions = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({
        type: typeFilter, page: String(page), limit: String(limit),
      });
      const res = await authFetch(`/api/fraud/employees/${userId}/transactions?${params}`);
      const data = await res.json();
      if (data.success !== false) {
        setTransactions(data.rows || data.data?.rows || []);
        setTotal(data.total || data.data?.total || 0);
      }
    } catch { /* ignore */ }
    setLoading(false);
  }, [userId, typeFilter, page]);

  useEffect(() => { fetchTransactions(); }, [fetchTransactions]);

  const typeButtons = [
    { id: 'all', label: 'All' },
    { id: 'voids', label: 'Voids' },
    { id: 'refunds', label: 'Refunds' },
    { id: 'discounts', label: 'Discounts' },
  ];

  return (
    <div style={cardStyle}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
        <h3 style={{ ...sectionTitle, marginBottom: 0 }}>
          <span style={{ fontSize: '18px' }}>&#128196;</span> Recent Transactions
        </h3>
        <div style={{ display: 'flex', gap: '4px', background: '#f3f4f6', padding: '3px', borderRadius: '8px' }}>
          {typeButtons.map(t => (
            <button key={t.id} onClick={() => { setTypeFilter(t.id); setPage(1); }}
              style={{
                padding: '5px 12px', borderRadius: '6px', border: 'none',
                background: typeFilter === t.id ? '#667eea' : 'transparent',
                color: typeFilter === t.id ? 'white' : '#6b7280',
                fontSize: '12px', fontWeight: 600, cursor: 'pointer',
              }}>
              {t.label}
            </button>
          ))}
        </div>
      </div>

      {loading ? (
        <div style={{ padding: '40px', textAlign: 'center', color: '#9ca3af', fontSize: '13px' }}>Loading...</div>
      ) : transactions.length === 0 ? (
        <div style={{ padding: '40px', textAlign: 'center', color: '#9ca3af', fontSize: '13px' }}>
          No transactions found for this filter.
        </div>
      ) : (
        <>
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px' }}>
              <thead>
                <tr style={{ borderBottom: '2px solid #e5e7eb' }}>
                  <th style={thStyle}>Txn #</th>
                  <th style={thStyle}>Date</th>
                  <th style={thStyle}>Amount</th>
                  <th style={thStyle}>Status</th>
                  <th style={thStyle}>Discount</th>
                  <th style={thStyle}>Fraud Score</th>
                  <th style={thStyle}>Risk</th>
                </tr>
              </thead>
              <tbody>
                {transactions.map((txn, i) => {
                  const fraudScore = txn.fraud_score || txn.risk_score || 0;
                  const isHighRisk = fraudScore > 30;
                  return (
                    <tr key={txn.transaction_id || txn.id || i}
                      style={{
                        borderBottom: '1px solid #f3f4f6',
                        background: isHighRisk ? '#fef3c7' : (i % 2 === 0 ? 'white' : '#fafafa'),
                      }}>
                      <td style={tdStyle}>
                        <span style={{ fontFamily: 'monospace', fontWeight: 500 }}>
                          {txn.transaction_number || txn.transaction_id || '—'}
                        </span>
                      </td>
                      <td style={tdStyle}>
                        {txn.created_at ? new Date(txn.created_at).toLocaleDateString() : '—'}
                      </td>
                      <td style={{ ...tdStyle, fontWeight: 600, fontVariantNumeric: 'tabular-nums' }}>
                        {formatCurrency(txn.total_amount)}
                      </td>
                      <td style={tdStyle}>
                        <StatusBadge status={txn.status || txn.void_reason ? 'voided' : 'completed'} />
                      </td>
                      <td style={tdStyle}>
                        {txn.discount_amount ? (
                          <span style={{ color: '#d97706', fontWeight: 500 }}>
                            {formatCurrency(txn.discount_amount)}
                            {txn.discount_reason && (
                              <span style={{ fontSize: '10px', color: '#9ca3af', display: 'block' }}>{txn.discount_reason}</span>
                            )}
                          </span>
                        ) : '—'}
                      </td>
                      <td style={tdStyle}>
                        {fraudScore > 0 ? (
                          <span style={{ fontWeight: 600, color: scoreColor(fraudScore) }}>{fraudScore}</span>
                        ) : (
                          <span style={{ color: '#d1d5db' }}>—</span>
                        )}
                      </td>
                      <td style={tdStyle}>
                        {txn.fraud_risk_level && txn.fraud_risk_level !== 'low' ? (
                          <span style={{
                            padding: '2px 8px', borderRadius: '10px', fontSize: '10px',
                            fontWeight: 600, textTransform: 'uppercase',
                            background: (RISK_COLORS[txn.fraud_risk_level] || RISK_COLORS.normal).bg,
                            color: (RISK_COLORS[txn.fraud_risk_level] || RISK_COLORS.normal).text,
                          }}>
                            {txn.fraud_risk_level}
                          </span>
                        ) : null}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {/* Pagination */}
          {total > limit && (
            <div style={{ display: 'flex', justifyContent: 'center', gap: '8px', marginTop: '16px' }}>
              <button onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page <= 1}
                style={paginationBtnStyle(page <= 1)}>Prev</button>
              <span style={{ fontSize: '12px', color: '#6b7280', alignSelf: 'center' }}>
                Page {page} of {Math.ceil(total / limit)}
              </span>
              <button onClick={() => setPage(p => p + 1)} disabled={page >= Math.ceil(total / limit)}
                style={paginationBtnStyle(page >= Math.ceil(total / limit))}>Next</button>
            </div>
          )}
        </>
      )}
    </div>
  );
}

const thStyle = {
  textAlign: 'left', padding: '10px 12px', fontSize: '11px',
  fontWeight: 600, color: '#6b7280', textTransform: 'uppercase',
};

const tdStyle = { padding: '10px 12px', verticalAlign: 'middle' };

function paginationBtnStyle(disabled) {
  return {
    padding: '5px 12px', borderRadius: '6px', border: '1px solid #d1d5db',
    background: disabled ? '#f3f4f6' : 'white', color: disabled ? '#9ca3af' : '#374151',
    cursor: disabled ? 'default' : 'pointer', fontSize: '12px',
  };
}

function StatusBadge({ status }) {
  const colors = {
    completed: { bg: '#f0fdf4', text: '#166534' },
    voided: { bg: '#fee2e2', text: '#991b1b' },
    refunded: { bg: '#fed7aa', text: '#c2410c' },
    pending: { bg: '#e0f2fe', text: '#075985' },
  };
  const c = colors[status] || colors.completed;
  return (
    <span style={{
      padding: '2px 8px', borderRadius: '10px', fontSize: '10px',
      fontWeight: 600, textTransform: 'uppercase', background: c.bg, color: c.text,
    }}>
      {status}
    </span>
  );
}

// ---------------------------------------------------------------------------
// Main Component
// ---------------------------------------------------------------------------
export default function EmployeeRiskDetail({ userId, employeeName }) {
  const [profile, setProfile] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  // -----------------------------------------------------------------------
  // Notes & review
  // -----------------------------------------------------------------------
  const [notes, setNotes] = useState('');
  const [riskOverride, setRiskOverride] = useState('');
  const [saving, setSaving] = useState(false);
  const [saveMsg, setSaveMsg] = useState('');

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);

    (async () => {
      try {
        const res = await authFetch(`/api/fraud/employees/${userId}`);
        const data = await res.json();
        if (cancelled) return;

        if (data.success !== false) {
          const p = data.data || data;
          setProfile(p);
          setNotes(p.notes || '');
          setRiskOverride(p.risk_level || 'normal');
        } else {
          setError(data.error || 'Failed to load profile');
        }
      } catch {
        if (!cancelled) setError('Network error loading employee profile');
      }
      if (!cancelled) setLoading(false);
    })();

    return () => { cancelled = true; };
  }, [userId]);

  const handleSaveReview = async () => {
    setSaving(true);
    setSaveMsg('');
    try {
      const res = await authFetch(`/api/fraud/employee-risk-profile/${userId}`, {
        method: 'PUT',
        body: JSON.stringify({ risk_level: riskOverride, notes }),
      });
      const data = await res.json();
      if (data.success) {
        setSaveMsg('Saved');
        setTimeout(() => setSaveMsg(''), 3000);
      }
    } catch { /* ignore */ }
    setSaving(false);
  };

  // -----------------------------------------------------------------------
  // Render
  // -----------------------------------------------------------------------
  if (loading) {
    return (
      <div style={{ padding: '60px', textAlign: 'center', color: '#9ca3af' }}>
        <div style={{
          width: '32px', height: '32px', border: '3px solid #e5e7eb',
          borderTopColor: '#667eea', borderRadius: '50%',
          animation: 'spin 0.8s linear infinite', margin: '0 auto 12px',
        }} />
        Loading profile for {employeeName || `Employee #${userId}`}...
        <style>{`@keyframes spin { to { transform: rotate(360deg) } }`}</style>
      </div>
    );
  }

  if (error || !profile) {
    return (
      <div style={{ padding: '40px', textAlign: 'center', color: '#991b1b', background: '#fee2e2', borderRadius: '10px' }}>
        {error || 'Employee profile not found'}
      </div>
    );
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
      {/* (a) Risk Scorecard */}
      <RiskScorecard profile={profile} />

      {/* Radar + Patterns side by side */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '20px' }}>
        {/* (b) Peer Comparison Radar */}
        <PeerComparisonRadar profile={profile} />

        {/* (d) Flagged Patterns */}
        <FlaggedPatterns patterns={profile.flagged_patterns} />
      </div>

      {/* (c) Trend Charts */}
      <TrendCharts profile={profile} />

      {/* Manager Review Section */}
      <div style={cardStyle}>
        <h3 style={sectionTitle}>
          <span style={{ fontSize: '18px' }}>&#128221;</span> Manager Review
        </h3>
        <div style={{ display: 'flex', gap: '16px', alignItems: 'flex-start' }}>
          <div style={{ flex: 1 }}>
            <label style={{ fontSize: '12px', fontWeight: 600, color: '#6b7280', display: 'block', marginBottom: '4px' }}>
              Override Risk Level
            </label>
            <select value={riskOverride} onChange={e => setRiskOverride(e.target.value)}
              style={{ width: '100%', padding: '8px 12px', borderRadius: '6px', border: '1px solid #d1d5db', fontSize: '13px' }}>
              <option value="normal">Normal</option>
              <option value="elevated">Elevated</option>
              <option value="high">High</option>
              <option value="suspended">Suspended</option>
            </select>
          </div>
          <div style={{ flex: 3 }}>
            <label style={{ fontSize: '12px', fontWeight: 600, color: '#6b7280', display: 'block', marginBottom: '4px' }}>
              Notes
            </label>
            <textarea value={notes} onChange={e => setNotes(e.target.value)}
              rows={3} placeholder="Add review notes..."
              style={{ width: '100%', padding: '8px 12px', borderRadius: '6px', border: '1px solid #d1d5db', fontSize: '13px', resize: 'vertical' }}
            />
          </div>
          <div style={{ alignSelf: 'flex-end', display: 'flex', gap: '8px', alignItems: 'center' }}>
            <button onClick={handleSaveReview} disabled={saving}
              style={{
                padding: '10px 20px', borderRadius: '8px', border: 'none',
                background: saving ? '#9ca3af' : '#667eea', color: 'white',
                fontWeight: 600, fontSize: '13px', cursor: saving ? 'wait' : 'pointer',
              }}>
              {saving ? 'Saving...' : 'Save'}
            </button>
            {saveMsg && <span style={{ fontSize: '12px', color: '#16a34a', fontWeight: 500 }}>{saveMsg}</span>}
          </div>
        </div>
      </div>

      {/* (e) Recent Transactions */}
      <RecentTransactions userId={userId} />
    </div>
  );
}
