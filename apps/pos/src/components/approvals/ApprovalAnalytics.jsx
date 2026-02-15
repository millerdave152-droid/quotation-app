/**
 * TeleTime POS - Approval Analytics Dashboard
 * Admin-only analytics for price-override approvals.
 * Shows summary cards, charts (Recharts), and sortable breakdown tables.
 */

import { useState, useEffect, useMemo, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  ArrowLeftIcon,
  ArrowPathIcon,
  ArrowUpIcon,
  ArrowDownIcon,
  ChevronUpIcon,
  ChevronDownIcon,
} from '@heroicons/react/24/outline';
import {
  ResponsiveContainer,
  PieChart, Pie, Cell,
  LineChart, Line,
  BarChart, Bar,
  XAxis, YAxis, CartesianGrid, Tooltip, Legend,
} from 'recharts';
import { getApprovalAnalytics } from '../../api/approvals';
import { formatCurrency } from '../../utils/formatters';

// ---- Constants ----

const PERIODS = { '7d': 7, '30d': 30, '90d': 90, '1y': 365 };
const TIER_COLORS = ['#3B82F6', '#10B981', '#8B5CF6', '#F59E0B'];

function dateRange(days) {
  const end = new Date();
  const start = new Date(end.getTime() - days * 86400000);
  return { startDate: start.toISOString(), endDate: end.toISOString() };
}

// ---- Trend helpers ----

function trendPct(current, previous) {
  if (previous == null || previous === 0) return current > 0 ? 100 : 0;
  return Math.round(((current - previous) / Math.abs(previous)) * 100);
}

function TrendArrow({ value, inverted = false }) {
  if (value === 0) return null;
  // For inverted metrics (response time, margin impact), lower is better
  const isPositive = inverted ? value < 0 : value > 0;
  const Icon = value > 0 ? ArrowUpIcon : ArrowDownIcon;
  return (
    <span className={`inline-flex items-center gap-0.5 text-sm font-medium ${isPositive ? 'text-green-600' : 'text-red-600'}`}>
      <Icon className="w-3.5 h-3.5" />
      {Math.abs(value)}%
    </span>
  );
}

// ---- Skeleton loader ----

function Skeleton({ className = '' }) {
  return <div className={`animate-pulse bg-gray-200 rounded ${className}`} />;
}

// ---- Summary Card ----

function SummaryCard({ label, value, trend, inverted = false }) {
  return (
    <div className="bg-white rounded-xl border border-gray-200 p-6 shadow-sm">
      <div className="flex items-start justify-between">
        <p className="text-sm font-medium text-gray-500">{label}</p>
        {trend !== undefined && <TrendArrow value={trend} inverted={inverted} />}
      </div>
      <p className="mt-2 text-2xl font-bold text-gray-900">{value}</p>
    </div>
  );
}

// ---- Sortable table helpers ----

function useSortable(data, defaultField, defaultDir = 'desc') {
  const [sortField, setSortField] = useState(defaultField);
  const [sortDir, setSortDir] = useState(defaultDir);

  const sorted = useMemo(() => {
    if (!data || data.length === 0) return [];
    return [...data].sort((a, b) => {
      const av = a[sortField] ?? 0;
      const bv = b[sortField] ?? 0;
      if (typeof av === 'string') return sortDir === 'asc' ? av.localeCompare(bv) : bv.localeCompare(av);
      return sortDir === 'asc' ? av - bv : bv - av;
    });
  }, [data, sortField, sortDir]);

  const toggleSort = useCallback((field) => {
    if (field === sortField) {
      setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'));
    } else {
      setSortField(field);
      setSortDir('desc');
    }
  }, [sortField]);

  return { sorted, sortField, sortDir, toggleSort };
}

function SortHeader({ label, field, sortField, sortDir, onSort }) {
  const active = sortField === field;
  return (
    <th
      className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider cursor-pointer select-none hover:text-gray-700"
      onClick={() => onSort(field)}
    >
      <span className="inline-flex items-center gap-1">
        {label}
        {active && (sortDir === 'asc'
          ? <ChevronUpIcon className="w-3 h-3" />
          : <ChevronDownIcon className="w-3 h-3" />
        )}
      </span>
    </th>
  );
}

// ---- Chart tooltip formatter ----

function fmtDate(dateStr) {
  const d = new Date(dateStr);
  return d.toLocaleDateString('en-CA', { month: 'short', day: 'numeric' });
}

// ---- Main Component ----

export function ApprovalAnalytics() {
  const navigate = useNavigate();

  const [period, setPeriod] = useState('30d');
  const [customStart, setCustomStart] = useState('');
  const [customEnd, setCustomEnd] = useState('');
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [activeTab, setActiveTab] = useState('salesperson');

  const fetchData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      let params;
      if (period === 'custom' && customStart && customEnd) {
        params = { startDate: new Date(customStart).toISOString(), endDate: new Date(customEnd).toISOString() };
      } else {
        params = dateRange(PERIODS[period] || 30);
      }
      const res = await getApprovalAnalytics(params);
      setData(res.data?.data || res.data || res);
    } catch (err) {
      console.error('[ApprovalAnalytics] fetch error:', err);
      setError(err.message || 'Failed to load analytics');
    } finally {
      setLoading(false);
    }
  }, [period, customStart, customEnd]);

  useEffect(() => {
    if (period !== 'custom') fetchData();
  }, [period]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (period === 'custom' && customStart && customEnd) fetchData();
  }, [customStart, customEnd]); // eslint-disable-line react-hooks/exhaustive-deps

  const s = data?.summary || {};
  const prev = data?.previousPeriod || {};

  // Sortable hooks for tables
  const spSort = useSortable(data?.bySalesperson, 'total_requests');
  const mgrSort = useSortable(data?.byManager, 'total_decisions');
  const prodSort = useSortable(data?.byProduct, 'times_overridden');

  // Pie chart data
  const tierData = useMemo(() => {
    if (!data?.byTier) return [];
    return data.byTier.map((t, i) => ({
      name: t.tier_name || `Tier ${t.tier}`,
      value: t.total,
      color: TIER_COLORS[i % TIER_COLORS.length],
    }));
  }, [data?.byTier]);

  // ---- Render ----

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <header className="bg-white border-b border-gray-200 sticky top-0 z-10">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between h-16">
            <div className="flex items-center gap-4">
              <button type="button" onClick={() => navigate(-1)} className="w-10 h-10 flex items-center justify-center text-gray-500 hover:text-gray-700 hover:bg-gray-100 rounded-lg transition-colors">
                <ArrowLeftIcon className="w-5 h-5" />
              </button>
              <div>
                <h1 className="text-xl font-bold text-gray-900">Approval Analytics</h1>
                <p className="text-sm text-gray-500">Price-override approval insights</p>
              </div>
            </div>
            <button type="button" onClick={fetchData} disabled={loading} className="flex items-center gap-2 h-10 px-4 bg-gray-100 hover:bg-gray-200 text-gray-700 font-medium rounded-lg transition-colors disabled:opacity-50">
              <ArrowPathIcon className={`w-5 h-5 ${loading ? 'animate-spin' : ''}`} />
              Refresh
            </button>
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6 space-y-6">
        {/* Period Selector */}
        <div className="flex flex-wrap items-center gap-2">
          {Object.keys(PERIODS).map((key) => (
            <button
              key={key}
              type="button"
              onClick={() => setPeriod(key)}
              className={`px-4 py-2 text-sm font-medium rounded-lg transition-colors ${period === key ? 'bg-blue-600 text-white' : 'bg-white text-gray-700 border border-gray-300 hover:bg-gray-50'}`}
            >
              {key}
            </button>
          ))}
          <button
            type="button"
            onClick={() => setPeriod('custom')}
            className={`px-4 py-2 text-sm font-medium rounded-lg transition-colors ${period === 'custom' ? 'bg-blue-600 text-white' : 'bg-white text-gray-700 border border-gray-300 hover:bg-gray-50'}`}
          >
            Custom
          </button>
          {period === 'custom' && (
            <div className="flex items-center gap-2 ml-2">
              <input type="date" value={customStart} onChange={(e) => setCustomStart(e.target.value)} className="px-3 py-2 text-sm border border-gray-300 rounded-lg" />
              <span className="text-gray-400">to</span>
              <input type="date" value={customEnd} onChange={(e) => setCustomEnd(e.target.value)} className="px-3 py-2 text-sm border border-gray-300 rounded-lg" />
            </div>
          )}
        </div>

        {error && (
          <div className="p-4 bg-red-50 border border-red-200 rounded-xl text-red-700">{error}</div>
        )}

        {/* Summary Cards */}
        {loading ? (
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-4">
            {Array.from({ length: 5 }).map((_, i) => (
              <Skeleton key={i} className="h-28 rounded-xl" />
            ))}
          </div>
        ) : data && (
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-4">
            <SummaryCard
              label="Total Requests"
              value={s.total_requests ?? 0}
              trend={trendPct(s.total_requests, prev.total_requests)}
            />
            <SummaryCard
              label="Approval Rate"
              value={`${s.approval_rate ?? 0}%`}
              trend={trendPct(Number(s.approval_rate), Number(prev.approval_rate))}
            />
            <SummaryCard
              label="Avg Margin"
              value={`${formatCurrency(s.avg_approved_margin_amt ?? 0)} (${s.avg_approved_margin_pct ?? 0}%)`}
              trend={trendPct(Number(s.avg_approved_margin_pct), Number(prev.avg_approved_margin_pct))}
            />
            <SummaryCard
              label="Avg Response Time"
              value={s.avg_response_time_ms != null ? `${(s.avg_response_time_ms / 1000).toFixed(1)}s` : 'N/A'}
              trend={trendPct(s.avg_response_time_ms, prev.avg_response_time_ms)}
              inverted
            />
            <SummaryCard
              label="Total Margin Impact"
              value={formatCurrency(s.total_margin_impact ?? 0)}
              trend={trendPct(Number(s.total_margin_impact), Number(prev.total_margin_impact))}
              inverted
            />
          </div>
        )}

        {/* Charts */}
        {!loading && data && (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Tier Distribution Donut */}
            <div className="bg-white rounded-xl border border-gray-200 p-6 shadow-sm">
              <h3 className="text-base font-semibold text-gray-900 mb-4">Tier Distribution</h3>
              {tierData.length > 0 ? (
                <ResponsiveContainer width="100%" height={260}>
                  <PieChart>
                    <Pie data={tierData} dataKey="value" nameKey="name" cx="50%" cy="50%" innerRadius={60} outerRadius={90} paddingAngle={2} label={({ name, value }) => `${name}: ${value}`}>
                      {tierData.map((entry, i) => (
                        <Cell key={i} fill={entry.color} />
                      ))}
                    </Pie>
                    <Tooltip />
                    <Legend />
                  </PieChart>
                </ResponsiveContainer>
              ) : (
                <EmptyChart />
              )}
            </div>

            {/* Approval Rate Over Time */}
            <div className="bg-white rounded-xl border border-gray-200 p-6 shadow-sm">
              <h3 className="text-base font-semibold text-gray-900 mb-4">Approval Rate Over Time</h3>
              {data.dailyTimeSeries?.length > 0 ? (
                <ResponsiveContainer width="100%" height={260}>
                  <LineChart data={data.dailyTimeSeries}>
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis dataKey="date" tickFormatter={fmtDate} tick={{ fontSize: 12 }} />
                    <YAxis domain={[0, 100]} tickFormatter={(v) => `${v}%`} tick={{ fontSize: 12 }} />
                    <Tooltip labelFormatter={fmtDate} formatter={(v) => [`${v}%`, 'Approval Rate']} />
                    <Line type="monotone" dataKey="approval_rate" stroke="#3B82F6" strokeWidth={2} dot={false} />
                  </LineChart>
                </ResponsiveContainer>
              ) : (
                <EmptyChart />
              )}
            </div>

            {/* Margin Impact Over Time */}
            <div className="bg-white rounded-xl border border-gray-200 p-6 shadow-sm">
              <h3 className="text-base font-semibold text-gray-900 mb-4">Margin Impact Over Time</h3>
              {data.dailyTimeSeries?.length > 0 ? (
                <ResponsiveContainer width="100%" height={260}>
                  <BarChart data={data.dailyTimeSeries}>
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis dataKey="date" tickFormatter={fmtDate} tick={{ fontSize: 12 }} />
                    <YAxis tickFormatter={(v) => `$${v}`} tick={{ fontSize: 12 }} />
                    <Tooltip labelFormatter={fmtDate} formatter={(v) => [formatCurrency(v), 'Margin Impact']} />
                    <Bar dataKey="margin_impact" fill="#F59E0B" radius={[4, 4, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              ) : (
                <EmptyChart />
              )}
            </div>

            {/* Response Time Trend */}
            <div className="bg-white rounded-xl border border-gray-200 p-6 shadow-sm">
              <h3 className="text-base font-semibold text-gray-900 mb-4">Response Time Trend</h3>
              {data.dailyTimeSeries?.length > 0 ? (
                <ResponsiveContainer width="100%" height={260}>
                  <LineChart data={data.dailyTimeSeries}>
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis dataKey="date" tickFormatter={fmtDate} tick={{ fontSize: 12 }} />
                    <YAxis tickFormatter={(v) => v != null ? `${(v / 1000).toFixed(0)}s` : ''} tick={{ fontSize: 12 }} />
                    <Tooltip labelFormatter={fmtDate} formatter={(v) => [v != null ? `${(v / 1000).toFixed(1)}s` : 'N/A', 'Avg Response']} />
                    <Line type="monotone" dataKey="avg_response_ms" stroke="#8B5CF6" strokeWidth={2} dot={false} connectNulls />
                  </LineChart>
                </ResponsiveContainer>
              ) : (
                <EmptyChart />
              )}
            </div>
          </div>
        )}

        {/* Tables */}
        {!loading && data && (
          <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
            {/* Tab Switcher */}
            <div className="flex border-b border-gray-200">
              {[
                { key: 'salesperson', label: 'By Salesperson' },
                { key: 'manager', label: 'By Manager' },
                { key: 'product', label: 'By Product' },
              ].map((tab) => (
                <button
                  key={tab.key}
                  type="button"
                  onClick={() => setActiveTab(tab.key)}
                  className={`px-6 py-3 text-sm font-medium transition-colors ${activeTab === tab.key ? 'border-b-2 border-blue-600 text-blue-600' : 'text-gray-500 hover:text-gray-700'}`}
                >
                  {tab.label}
                </button>
              ))}
            </div>

            {/* Salesperson Table */}
            {activeTab === 'salesperson' && (
              spSort.sorted.length > 0 ? (
                <div className="overflow-x-auto">
                  <table className="w-full">
                    <thead className="bg-gray-50">
                      <tr>
                        <SortHeader label="Salesperson" field="salesperson_name" {...spSort} onSort={spSort.toggleSort} />
                        <SortHeader label="Requests" field="total_requests" {...spSort} onSort={spSort.toggleSort} />
                        <SortHeader label="Approval Rate" field="approval_rate" {...spSort} onSort={spSort.toggleSort} />
                        <SortHeader label="Avg Discount %" field="avg_discount_pct" {...spSort} onSort={spSort.toggleSort} />
                        <SortHeader label="Margin Impact" field="total_margin_impact" {...spSort} onSort={spSort.toggleSort} />
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100">
                      {spSort.sorted.map((row) => (
                        <tr key={row.salesperson_id} className={Number(row.approval_rate) > 80 ? 'bg-yellow-50' : 'hover:bg-gray-50'}>
                          <td className="px-4 py-3 text-sm font-medium text-gray-900">{row.salesperson_name}</td>
                          <td className="px-4 py-3 text-sm text-gray-700">{row.total_requests}</td>
                          <td className="px-4 py-3 text-sm text-gray-700">{row.approval_rate}%</td>
                          <td className="px-4 py-3 text-sm text-gray-700">{row.avg_discount_pct ?? '-'}%</td>
                          <td className="px-4 py-3 text-sm text-gray-700">{formatCurrency(row.total_margin_impact)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : <EmptyTable message="No salesperson data for this period" />
            )}

            {/* Manager Table */}
            {activeTab === 'manager' && (
              mgrSort.sorted.length > 0 ? (
                <div className="overflow-x-auto">
                  <table className="w-full">
                    <thead className="bg-gray-50">
                      <tr>
                        <SortHeader label="Manager" field="manager_name" {...mgrSort} onSort={mgrSort.toggleSort} />
                        <SortHeader label="Decisions" field="total_decisions" {...mgrSort} onSort={mgrSort.toggleSort} />
                        <SortHeader label="Approval Rate" field="approval_rate" {...mgrSort} onSort={mgrSort.toggleSort} />
                        <SortHeader label="Avg Response" field="avg_response_ms" {...mgrSort} onSort={mgrSort.toggleSort} />
                        <SortHeader label="Counter-offer Rate" field="counter_offer_rate" {...mgrSort} onSort={mgrSort.toggleSort} />
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100">
                      {mgrSort.sorted.map((row) => (
                        <tr key={row.manager_id} className="hover:bg-gray-50">
                          <td className="px-4 py-3 text-sm font-medium text-gray-900">{row.manager_name}</td>
                          <td className="px-4 py-3 text-sm text-gray-700">{row.total_decisions}</td>
                          <td className="px-4 py-3 text-sm text-gray-700">{row.approval_rate}%</td>
                          <td className="px-4 py-3 text-sm text-gray-700">{row.avg_response_ms != null ? `${(row.avg_response_ms / 1000).toFixed(1)}s` : '-'}</td>
                          <td className="px-4 py-3 text-sm text-gray-700">{row.counter_offer_rate}%</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : <EmptyTable message="No manager data for this period" />
            )}

            {/* Product Table */}
            {activeTab === 'product' && (
              prodSort.sorted.length > 0 ? (
                <div className="overflow-x-auto">
                  <table className="w-full">
                    <thead className="bg-gray-50">
                      <tr>
                        <SortHeader label="Product" field="product_name" {...prodSort} onSort={prodSort.toggleSort} />
                        <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">SKU</th>
                        <SortHeader label="Times Overridden" field="times_overridden" {...prodSort} onSort={prodSort.toggleSort} />
                        <SortHeader label="Avg Discount %" field="avg_approved_discount_pct" {...prodSort} onSort={prodSort.toggleSort} />
                        <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">Common Price</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100">
                      {prodSort.sorted.map((row) => (
                        <tr key={row.product_id} className="hover:bg-gray-50">
                          <td className="px-4 py-3 text-sm font-medium text-gray-900">{row.product_name}</td>
                          <td className="px-4 py-3 text-sm text-gray-500 font-mono">{row.product_sku}</td>
                          <td className="px-4 py-3 text-sm text-gray-700">{row.times_overridden}</td>
                          <td className="px-4 py-3 text-sm text-gray-700">{row.avg_approved_discount_pct ?? '-'}%</td>
                          <td className="px-4 py-3 text-sm text-gray-700">{row.most_common_approved_price != null ? formatCurrency(row.most_common_approved_price) : '-'}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : <EmptyTable message="No product data for this period" />
            )}
          </div>
        )}
      </main>
    </div>
  );
}

function EmptyChart() {
  return (
    <div className="flex items-center justify-center h-[260px] text-gray-400 text-sm">
      No data for this period
    </div>
  );
}

function EmptyTable({ message }) {
  return (
    <div className="flex items-center justify-center py-12 text-gray-400 text-sm">
      {message}
    </div>
  );
}

export default ApprovalAnalytics;
