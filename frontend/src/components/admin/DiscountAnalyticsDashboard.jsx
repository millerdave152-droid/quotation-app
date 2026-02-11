/**
 * TeleTime - Discount Analytics Dashboard
 * Admin dashboard with tabs for Employee Analysis, Product Analysis,
 * Summary KPIs, and Commission Impact tracking.
 */

import React, { useState, useEffect, useCallback } from 'react';
import { useAuth } from '../../contexts/AuthContext';
import { authFetch } from '../../services/authFetch';
import {
  ResponsiveContainer, LineChart, Line, BarChart, Bar,
  XAxis, YAxis, CartesianGrid, Tooltip, Legend
} from 'recharts';

const API_URL = process.env.REACT_APP_API_URL || 'http://localhost:3001';

const formatCurrency = (val) => {
  const num = parseFloat(val) || 0;
  return `$${num.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
};

const formatDate = (dateStr) => {
  if (!dateStr) return '-';
  return new Date(dateStr).toLocaleDateString('en-CA', { month: 'short', day: 'numeric' });
};

// ============================================================================
// STYLES
// ============================================================================

const cardStyle = {
  background: 'white',
  borderRadius: '12px',
  padding: '20px',
  boxShadow: '0 1px 3px rgba(0,0,0,0.1)',
};

const thStyle = {
  textAlign: 'left',
  padding: '10px 12px',
  fontSize: '12px',
  fontWeight: 600,
  color: '#6b7280',
  textTransform: 'uppercase',
  letterSpacing: '0.05em',
  borderBottom: '2px solid #e5e7eb',
};

const tdStyle = {
  padding: '10px 12px',
  fontSize: '14px',
  borderBottom: '1px solid #f3f4f6',
};

const TABS = [
  { id: 'summary', label: 'Summary' },
  { id: 'by-employee', label: 'By Employee' },
  { id: 'by-product', label: 'By Product' },
  { id: 'commission', label: 'Commission Impact' },
];

// ============================================================================
// MAIN COMPONENT
// ============================================================================

export default function DiscountAnalyticsDashboard() {
  const { user } = useAuth();
  const [activeTab, setActiveTab] = useState('summary');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');

  // Data
  const [summary, setSummary] = useState(null);
  const [byEmployee, setByEmployee] = useState([]);
  const [byProduct, setByProduct] = useState([]);
  const [commissionImpact, setCommissionImpact] = useState(null);

  const dateParams = useCallback(() => {
    const params = new URLSearchParams();
    if (startDate) params.set('startDate', startDate);
    if (endDate) params.set('endDate', endDate);
    const str = params.toString();
    return str ? `?${str}` : '';
  }, [startDate, endDate]);

  const fetchAll = useCallback(async () => {
    setLoading(true);
    setError(null);
    const qs = dateParams();

    try {
      const [sumRes, empRes, prodRes, commRes] = await Promise.all([
        authFetch(`${API_URL}/api/discount-analytics/summary${qs}`).then(r => r.json()),
        authFetch(`${API_URL}/api/discount-analytics/by-employee${qs}`).then(r => r.json()),
        authFetch(`${API_URL}/api/discount-analytics/by-product${qs}`).then(r => r.json()),
        authFetch(`${API_URL}/api/discount-analytics/commission-impact${qs}`).then(r => r.json()),
      ]);

      if (sumRes.success) setSummary(sumRes.data);
      if (empRes.success) setByEmployee(empRes.data || []);
      if (prodRes.success) setByProduct(prodRes.data || []);
      if (commRes.success) setCommissionImpact(commRes.data);
    } catch (err) {
      setError(err.message || 'Failed to load analytics');
    } finally {
      setLoading(false);
    }
  }, [dateParams]);

  useEffect(() => {
    fetchAll();
  }, [fetchAll]);

  return (
    <div style={{ padding: '24px', maxWidth: '1400px', margin: '0 auto' }}>
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '24px' }}>
        <div>
          <h1 style={{ margin: 0, fontSize: '24px', fontWeight: 700, color: '#111827' }}>
            Discount Analytics
          </h1>
          <p style={{ margin: '4px 0 0', fontSize: '14px', color: '#6b7280' }}>
            Track discount patterns, margin impact, and budget utilization
          </p>
        </div>
        {/* Date Range */}
        <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
          <input
            type="date"
            value={startDate}
            onChange={(e) => setStartDate(e.target.value)}
            style={{ padding: '6px 10px', border: '1px solid #d1d5db', borderRadius: '6px', fontSize: '13px' }}
          />
          <span style={{ color: '#9ca3af' }}>to</span>
          <input
            type="date"
            value={endDate}
            onChange={(e) => setEndDate(e.target.value)}
            style={{ padding: '6px 10px', border: '1px solid #d1d5db', borderRadius: '6px', fontSize: '13px' }}
          />
          <button
            onClick={fetchAll}
            style={{
              padding: '6px 16px',
              background: '#667eea',
              color: 'white',
              border: 'none',
              borderRadius: '6px',
              fontSize: '13px',
              fontWeight: 600,
              cursor: 'pointer',
            }}
          >
            Refresh
          </button>
        </div>
      </div>

      {/* Summary Cards */}
      {summary?.kpis && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '16px', marginBottom: '24px' }}>
          <div style={cardStyle}>
            <p style={{ margin: '0 0 4px', fontSize: '13px', color: '#6b7280' }}>Total Discounts</p>
            <p style={{ margin: 0, fontSize: '28px', fontWeight: 700, color: '#111827' }}>
              {summary.kpis.total_transactions || 0}
            </p>
          </div>
          <div style={cardStyle}>
            <p style={{ margin: '0 0 4px', fontSize: '13px', color: '#6b7280' }}>Avg Discount %</p>
            <p style={{ margin: 0, fontSize: '28px', fontWeight: 700, color: '#f59e0b' }}>
              {summary.kpis.avg_discount_pct || 0}%
            </p>
          </div>
          <div style={cardStyle}>
            <p style={{ margin: '0 0 4px', fontSize: '13px', color: '#6b7280' }}>Total $ Given</p>
            <p style={{ margin: 0, fontSize: '28px', fontWeight: 700, color: '#ef4444' }}>
              {formatCurrency(summary.kpis.total_discount_dollars)}
            </p>
          </div>
          <div style={cardStyle}>
            <p style={{ margin: '0 0 4px', fontSize: '13px', color: '#6b7280' }}>Commission Impact</p>
            <p style={{ margin: 0, fontSize: '28px', fontWeight: 700, color: '#dc2626' }}>
              -{formatCurrency(summary.kpis.total_commission_impact)}
            </p>
          </div>
        </div>
      )}

      {/* Tabs */}
      <div style={{ display: 'flex', gap: '8px', marginBottom: '16px', borderBottom: '1px solid #e5e7eb', paddingBottom: '8px' }}>
        {TABS.map(tab => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            style={{
              padding: '8px 16px',
              background: activeTab === tab.id ? '#667eea' : 'transparent',
              color: activeTab === tab.id ? 'white' : '#6b7280',
              border: 'none',
              borderRadius: '6px',
              cursor: 'pointer',
              fontSize: '13px',
              fontWeight: 600,
              transition: 'all 0.2s ease',
            }}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Error */}
      {error && (
        <div style={{ padding: '12px 16px', background: '#fee2e2', color: '#991b1b', borderRadius: '8px', marginBottom: '16px', fontSize: '14px' }}>
          {error}
        </div>
      )}

      {/* Loading */}
      {loading ? (
        <div style={{ textAlign: 'center', padding: '60px 0', color: '#9ca3af' }}>Loading analytics...</div>
      ) : (
        <div style={cardStyle}>
          {activeTab === 'summary' && <SummaryTab summary={summary} />}
          {activeTab === 'by-employee' && <ByEmployeeTab data={byEmployee} />}
          {activeTab === 'by-product' && <ByProductTab data={byProduct} />}
          {activeTab === 'commission' && <CommissionTab data={commissionImpact} />}
        </div>
      )}
    </div>
  );
}

// ============================================================================
// SUMMARY TAB
// ============================================================================

function SummaryTab({ summary }) {
  if (!summary) return <p style={{ color: '#9ca3af', textAlign: 'center', padding: '40px' }}>No data available</p>;

  const kpis = summary.kpis || {};
  const trend = (summary.dailyTrend || []).reverse();
  const correlation = summary.closeRateCorrelation || [];

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
      {/* KPI Detail Grid */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '16px' }}>
        <div style={{ background: '#f9fafb', borderRadius: '8px', padding: '16px' }}>
          <p style={{ margin: '0 0 4px', fontSize: '12px', color: '#6b7280' }}>Avg Margin Before</p>
          <p style={{ margin: 0, fontSize: '20px', fontWeight: 700 }}>{kpis.avg_margin_before || 0}%</p>
        </div>
        <div style={{ background: '#f9fafb', borderRadius: '8px', padding: '16px' }}>
          <p style={{ margin: '0 0 4px', fontSize: '12px', color: '#6b7280' }}>Avg Margin After</p>
          <p style={{ margin: 0, fontSize: '20px', fontWeight: 700 }}>{kpis.avg_margin_after || 0}%</p>
        </div>
        <div style={{ background: '#f9fafb', borderRadius: '8px', padding: '16px' }}>
          <p style={{ margin: '0 0 4px', fontSize: '12px', color: '#6b7280' }}>Avg Discount Amount</p>
          <p style={{ margin: 0, fontSize: '20px', fontWeight: 700 }}>{formatCurrency(kpis.avg_discount_amount)}</p>
        </div>
      </div>

      {/* Approval Breakdown */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
        <div style={{ background: '#d1fae5', borderRadius: '8px', padding: '16px' }}>
          <p style={{ margin: '0 0 4px', fontSize: '12px', color: '#065f46' }}>Auto-Approved</p>
          <p style={{ margin: 0, fontSize: '24px', fontWeight: 700, color: '#065f46' }}>{kpis.auto_approved || 0}</p>
        </div>
        <div style={{ background: '#fef3c7', borderRadius: '8px', padding: '16px' }}>
          <p style={{ margin: '0 0 4px', fontSize: '12px', color: '#92400e' }}>Required Escalation</p>
          <p style={{ margin: 0, fontSize: '24px', fontWeight: 700, color: '#92400e' }}>{kpis.required_escalation || 0}</p>
        </div>
      </div>

      {/* Daily Trend Chart */}
      {trend.length > 0 && (
        <div>
          <h3 style={{ margin: '0 0 12px', fontSize: '15px', fontWeight: 600, color: '#374151' }}>Daily Trend</h3>
          <ResponsiveContainer width="100%" height={280}>
            <LineChart data={trend}>
              <CartesianGrid strokeDasharray="3 3" stroke="#f3f4f6" />
              <XAxis dataKey="date" tickFormatter={formatDate} fontSize={11} />
              <YAxis yAxisId="left" fontSize={11} />
              <YAxis yAxisId="right" orientation="right" fontSize={11} tickFormatter={v => `$${v}`} />
              <Tooltip formatter={(v, name) => name === 'total_dollars' ? formatCurrency(v) : v} />
              <Legend />
              <Line yAxisId="left" type="monotone" dataKey="count" stroke="#667eea" name="Discounts" strokeWidth={2} dot={false} />
              <Line yAxisId="left" type="monotone" dataKey="avg_pct" stroke="#f59e0b" name="Avg %" strokeWidth={2} dot={false} />
              <Line yAxisId="right" type="monotone" dataKey="total_dollars" stroke="#ef4444" name="Total $" strokeWidth={2} dot={false} />
            </LineChart>
          </ResponsiveContainer>
        </div>
      )}

      {/* Close Rate Correlation */}
      {correlation.length > 0 && (
        <div>
          <h3 style={{ margin: '0 0 12px', fontSize: '15px', fontWeight: 600, color: '#374151' }}>
            Discounted vs Full-Price Sales
          </h3>
          <ResponsiveContainer width="100%" height={200}>
            <BarChart data={correlation} layout="vertical">
              <CartesianGrid strokeDasharray="3 3" stroke="#f3f4f6" />
              <XAxis type="number" fontSize={11} />
              <YAxis dataKey="sale_type" type="category" fontSize={12} width={100} />
              <Tooltip formatter={(v) => typeof v === 'number' && v > 100 ? formatCurrency(v) : v} />
              <Bar dataKey="transaction_count" fill="#667eea" name="Transactions" />
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}
    </div>
  );
}

// ============================================================================
// BY EMPLOYEE TAB
// ============================================================================

function ByEmployeeTab({ data }) {
  if (!data.length) return <p style={{ color: '#9ca3af', textAlign: 'center', padding: '40px' }}>No discount data found</p>;

  return (
    <div style={{ overflowX: 'auto' }}>
      <table style={{ width: '100%', borderCollapse: 'collapse' }}>
        <thead>
          <tr>
            <th style={thStyle}>Employee</th>
            <th style={thStyle}>Role</th>
            <th style={{ ...thStyle, textAlign: 'right' }}>Discounts</th>
            <th style={{ ...thStyle, textAlign: 'right' }}>Avg %</th>
            <th style={{ ...thStyle, textAlign: 'right' }}>Total $</th>
            <th style={{ ...thStyle, textAlign: 'right' }}>Avg Margin Before</th>
            <th style={{ ...thStyle, textAlign: 'right' }}>Avg Margin After</th>
            <th style={{ ...thStyle, textAlign: 'right' }}>Escalations</th>
            <th style={{ ...thStyle, textAlign: 'right' }}>Auto-Approved</th>
          </tr>
        </thead>
        <tbody>
          {data.map((row, i) => (
            <tr key={row.employee_id} style={{ background: i % 2 === 0 ? 'white' : '#f9fafb' }}>
              <td style={{ ...tdStyle, fontWeight: 600 }}>{row.employee_name}</td>
              <td style={tdStyle}>
                <span style={{
                  padding: '2px 8px',
                  borderRadius: '12px',
                  fontSize: '11px',
                  fontWeight: 600,
                  background: row.role === 'admin' ? '#dbeafe' : row.role === 'manager' ? '#d1fae5' : '#f3f4f6',
                  color: row.role === 'admin' ? '#1e40af' : row.role === 'manager' ? '#065f46' : '#374151',
                }}>
                  {row.role}
                </span>
              </td>
              <td style={{ ...tdStyle, textAlign: 'right' }}>{row.total_discounts}</td>
              <td style={{ ...tdStyle, textAlign: 'right', color: parseFloat(row.avg_discount_pct) > 10 ? '#dc2626' : '#374151' }}>
                {row.avg_discount_pct}%
              </td>
              <td style={{ ...tdStyle, textAlign: 'right', fontWeight: 600 }}>{formatCurrency(row.total_discount_dollars)}</td>
              <td style={{ ...tdStyle, textAlign: 'right' }}>{row.avg_margin_before}%</td>
              <td style={{ ...tdStyle, textAlign: 'right' }}>{row.avg_margin_after}%</td>
              <td style={{ ...tdStyle, textAlign: 'right' }}>{row.escalations_needed}</td>
              <td style={{ ...tdStyle, textAlign: 'right' }}>{row.auto_approved}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// ============================================================================
// BY PRODUCT TAB
// ============================================================================

function ByProductTab({ data }) {
  if (!data.length) return <p style={{ color: '#9ca3af', textAlign: 'center', padding: '40px' }}>No discount data found</p>;

  return (
    <div style={{ overflowX: 'auto' }}>
      <table style={{ width: '100%', borderCollapse: 'collapse' }}>
        <thead>
          <tr>
            <th style={thStyle}>Product</th>
            <th style={thStyle}>SKU</th>
            <th style={thStyle}>Category</th>
            <th style={{ ...thStyle, textAlign: 'right' }}>Times Discounted</th>
            <th style={{ ...thStyle, textAlign: 'right' }}>Avg %</th>
            <th style={{ ...thStyle, textAlign: 'right' }}>Total $</th>
            <th style={{ ...thStyle, textAlign: 'right' }}>Avg Margin Before</th>
            <th style={{ ...thStyle, textAlign: 'right' }}>Avg Margin After</th>
            <th style={{ ...thStyle, textAlign: 'right' }}>Employees</th>
          </tr>
        </thead>
        <tbody>
          {data.map((row, i) => (
            <tr key={row.product_id} style={{ background: i % 2 === 0 ? 'white' : '#f9fafb' }}>
              <td style={{ ...tdStyle, fontWeight: 600 }}>{row.product_name}</td>
              <td style={{ ...tdStyle, fontSize: '12px', color: '#6b7280', fontFamily: 'monospace' }}>{row.sku || '-'}</td>
              <td style={tdStyle}>{row.category || '-'}</td>
              <td style={{ ...tdStyle, textAlign: 'right' }}>{row.times_discounted}</td>
              <td style={{ ...tdStyle, textAlign: 'right' }}>{row.avg_discount_pct}%</td>
              <td style={{ ...tdStyle, textAlign: 'right', fontWeight: 600 }}>{formatCurrency(row.total_discount_dollars)}</td>
              <td style={{ ...tdStyle, textAlign: 'right' }}>{row.avg_margin_before}%</td>
              <td style={{ ...tdStyle, textAlign: 'right' }}>{row.avg_margin_after}%</td>
              <td style={{ ...tdStyle, textAlign: 'right' }}>{row.unique_employees}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// ============================================================================
// COMMISSION IMPACT TAB
// ============================================================================

function CommissionTab({ data }) {
  if (!data) return <p style={{ color: '#9ca3af', textAlign: 'center', padding: '40px' }}>No data available</p>;

  const totals = data.totals || {};
  const employees = data.byEmployee || [];

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
      {/* Totals Cards */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '16px' }}>
        <div style={{ background: '#fee2e2', borderRadius: '8px', padding: '16px' }}>
          <p style={{ margin: '0 0 4px', fontSize: '12px', color: '#991b1b' }}>Total Commission Lost</p>
          <p style={{ margin: 0, fontSize: '24px', fontWeight: 700, color: '#dc2626' }}>
            {formatCurrency(totals.total_commission_lost)}
          </p>
        </div>
        <div style={{ background: '#fef3c7', borderRadius: '8px', padding: '16px' }}>
          <p style={{ margin: '0 0 4px', fontSize: '12px', color: '#92400e' }}>Total Discounts Given</p>
          <p style={{ margin: 0, fontSize: '24px', fontWeight: 700, color: '#d97706' }}>
            {formatCurrency(totals.total_discount_given)}
          </p>
        </div>
        <div style={{ background: '#f3f4f6', borderRadius: '8px', padding: '16px' }}>
          <p style={{ margin: '0 0 4px', fontSize: '12px', color: '#6b7280' }}>Total Discount Txns</p>
          <p style={{ margin: 0, fontSize: '24px', fontWeight: 700, color: '#374151' }}>
            {totals.total_discounts || 0}
          </p>
        </div>
      </div>

      {/* Bar Chart */}
      {employees.length > 0 && (
        <div>
          <h3 style={{ margin: '0 0 12px', fontSize: '15px', fontWeight: 600, color: '#374151' }}>
            Commission Lost by Employee
          </h3>
          <ResponsiveContainer width="100%" height={Math.max(200, employees.length * 50)}>
            <BarChart data={employees} layout="vertical">
              <CartesianGrid strokeDasharray="3 3" stroke="#f3f4f6" />
              <XAxis type="number" fontSize={11} tickFormatter={v => `$${v}`} />
              <YAxis dataKey="employee_name" type="category" fontSize={12} width={140} />
              <Tooltip formatter={(v) => formatCurrency(v)} />
              <Bar dataKey="total_commission_lost" fill="#ef4444" name="Commission Lost" radius={[0, 4, 4, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}

      {/* Detail Table */}
      {employees.length > 0 && (
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr>
                <th style={thStyle}>Employee</th>
                <th style={thStyle}>Role</th>
                <th style={{ ...thStyle, textAlign: 'right' }}>Discounts</th>
                <th style={{ ...thStyle, textAlign: 'right' }}>Total Given</th>
                <th style={{ ...thStyle, textAlign: 'right' }}>Avg %</th>
                <th style={{ ...thStyle, textAlign: 'right' }}>Commission Lost</th>
                <th style={{ ...thStyle, textAlign: 'right' }}>Avg Lost/Discount</th>
                <th style={{ ...thStyle, textAlign: 'right' }}>Avg Margin After</th>
              </tr>
            </thead>
            <tbody>
              {employees.map((row, i) => (
                <tr key={row.employee_id} style={{ background: i % 2 === 0 ? 'white' : '#f9fafb' }}>
                  <td style={{ ...tdStyle, fontWeight: 600 }}>{row.employee_name}</td>
                  <td style={tdStyle}>{row.role}</td>
                  <td style={{ ...tdStyle, textAlign: 'right' }}>{row.discount_count}</td>
                  <td style={{ ...tdStyle, textAlign: 'right' }}>{formatCurrency(row.total_discount_given)}</td>
                  <td style={{ ...tdStyle, textAlign: 'right' }}>{row.avg_discount_pct}%</td>
                  <td style={{ ...tdStyle, textAlign: 'right', fontWeight: 600, color: '#dc2626' }}>
                    {formatCurrency(row.total_commission_lost)}
                  </td>
                  <td style={{ ...tdStyle, textAlign: 'right' }}>{formatCurrency(row.avg_commission_lost_per_discount)}</td>
                  <td style={{ ...tdStyle, textAlign: 'right' }}>{row.avg_margin_after}%</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
