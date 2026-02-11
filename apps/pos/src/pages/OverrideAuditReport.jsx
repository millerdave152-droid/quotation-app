/**
 * TeleTime POS - Override Audit Report
 * Admin report for viewing manager override history
 */

import { useState, useEffect, useCallback, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  ArrowLeftIcon,
  CalendarIcon,
  FunnelIcon,
  ArrowDownTrayIcon,
  ShieldCheckIcon,
  XCircleIcon,
  TagIcon,
  CurrencyDollarIcon,
  UserCircleIcon,
  ChartBarIcon,
  ChevronLeftIcon,
  ChevronRightIcon,
  ArrowPathIcon,
  XMarkIcon,
} from '@heroicons/react/24/outline';
import { useAuth } from '../context/AuthContext';
import { formatCurrency, formatDateTime } from '../utils/formatters';

const API_BASE = import.meta.env.VITE_API_URL || 'http://localhost:3001';

/** Authenticated fetch using POS Bearer token */
function authFetch(url, options = {}) {
  const token = localStorage.getItem('pos_token');
  return fetch(url, {
    ...options,
    headers: {
      ...options.headers,
      Authorization: `Bearer ${token}`,
    },
  });
}

// ============================================================================
// STAT CARD COMPONENT
// ============================================================================

function StatCard({ icon: Icon, label, value, subValue, color = 'blue' }) {
  const colorClasses = {
    blue: 'bg-blue-50 text-blue-600',
    green: 'bg-green-50 text-green-600',
    red: 'bg-red-50 text-red-600',
    yellow: 'bg-yellow-50 text-yellow-600',
    purple: 'bg-purple-50 text-purple-600',
  };

  return (
    <div className="bg-white rounded-xl border border-gray-200 p-5">
      <div className="flex items-start gap-4">
        <div className={`w-12 h-12 rounded-lg flex items-center justify-center ${colorClasses[color]}`}>
          <Icon className="w-6 h-6" />
        </div>
        <div>
          <p className="text-2xl font-bold text-gray-900">{value}</p>
          <p className="text-sm text-gray-500">{label}</p>
          {subValue && (
            <p className="text-xs text-gray-400 mt-1">{subValue}</p>
          )}
        </div>
      </div>
    </div>
  );
}

// ============================================================================
// FILTER DROPDOWN
// ============================================================================

function FilterDropdown({ label, value, onChange, options, placeholder = 'All' }) {
  return (
    <div className="flex flex-col gap-1">
      <label className="text-xs font-medium text-gray-500">{label}</label>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="h-10 px-3 border border-gray-200 rounded-lg text-sm focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
      >
        <option value="">{placeholder}</option>
        {options.map((opt) => (
          <option key={opt.value} value={opt.value}>
            {opt.label}
          </option>
        ))}
      </select>
    </div>
  );
}

// ============================================================================
// DATE RANGE PICKER
// ============================================================================

function DateRangePicker({ startDate, endDate, onStartChange, onEndChange }) {
  return (
    <div className="flex items-center gap-3">
      <div className="flex flex-col gap-1">
        <label className="text-xs font-medium text-gray-500">Start Date</label>
        <input
          type="date"
          value={startDate}
          onChange={(e) => onStartChange(e.target.value)}
          className="h-10 px-3 border border-gray-200 rounded-lg text-sm focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
        />
      </div>
      <div className="flex flex-col gap-1">
        <label className="text-xs font-medium text-gray-500">End Date</label>
        <input
          type="date"
          value={endDate}
          onChange={(e) => onEndChange(e.target.value)}
          className="h-10 px-3 border border-gray-200 rounded-lg text-sm focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
        />
      </div>
    </div>
  );
}

// ============================================================================
// OVERRIDE TYPE BADGE
// ============================================================================

function OverrideTypeBadge({ type }) {
  const typeLabels = {
    discount_percent: 'Discount %',
    discount_amount: 'Discount $',
    price_below_margin: 'Below Margin',
    price_below_cost: 'Below Cost',
    refund_override: 'Refund',
    void_transaction: 'Void',
    drawer_adjustment: 'Drawer Adj.',
  };

  const typeColors = {
    discount_percent: 'bg-blue-100 text-blue-700',
    discount_amount: 'bg-blue-100 text-blue-700',
    price_below_margin: 'bg-yellow-100 text-yellow-700',
    price_below_cost: 'bg-red-100 text-red-700',
    refund_override: 'bg-orange-100 text-orange-700',
    void_transaction: 'bg-red-100 text-red-700',
    drawer_adjustment: 'bg-purple-100 text-purple-700',
  };

  return (
    <span className={`px-2 py-1 text-xs font-medium rounded ${typeColors[type] || 'bg-gray-100 text-gray-700'}`}>
      {typeLabels[type] || type}
    </span>
  );
}

// ============================================================================
// STATUS BADGE
// ============================================================================

function StatusBadge({ approved }) {
  return approved ? (
    <span className="inline-flex items-center gap-1 px-2 py-1 text-xs font-medium bg-green-100 text-green-700 rounded">
      <ShieldCheckIcon className="w-3.5 h-3.5" />
      Approved
    </span>
  ) : (
    <span className="inline-flex items-center gap-1 px-2 py-1 text-xs font-medium bg-red-100 text-red-700 rounded">
      <XCircleIcon className="w-3.5 h-3.5" />
      Denied
    </span>
  );
}

// ============================================================================
// OVERRIDE TABLE ROW
// ============================================================================

function OverrideRow({ override }) {
  const discountAmount = override.original_value > override.override_value
    ? override.original_value - override.override_value
    : 0;

  return (
    <tr className="border-b border-gray-100 hover:bg-gray-50">
      <td className="px-4 py-3 text-sm text-gray-600">
        {formatDateTime(override.created_at)}
      </td>
      <td className="px-4 py-3 text-sm">
        <span className="font-mono text-gray-900">
          {override.transaction_number || 'N/A'}
        </span>
      </td>
      <td className="px-4 py-3 text-sm text-gray-600">
        {override.cashier_name || 'Unknown'}
      </td>
      <td className="px-4 py-3">
        <OverrideTypeBadge type={override.override_type} />
      </td>
      <td className="px-4 py-3 text-sm">
        {override.product_name && (
          <div className="text-gray-900">{override.product_name}</div>
        )}
        {override.quantity > 1 && (
          <div className="text-gray-500 text-xs">Qty: {override.quantity}</div>
        )}
      </td>
      <td className="px-4 py-3 text-sm text-right">
        <div className="text-gray-400 line-through">
          {formatCurrency(override.original_value)}
        </div>
        <div className="text-gray-900 font-medium">
          {formatCurrency(override.override_value)}
        </div>
      </td>
      <td className="px-4 py-3 text-sm text-right font-medium text-red-600">
        {discountAmount > 0 ? `-${formatCurrency(discountAmount)}` : '-'}
      </td>
      <td className="px-4 py-3">
        <StatusBadge approved={override.was_approved} />
      </td>
      <td className="px-4 py-3 text-sm text-gray-600">
        {override.was_approved ? override.manager_name || 'Unknown' : '-'}
      </td>
      <td className="px-4 py-3 text-sm text-gray-500 max-w-[200px] truncate">
        {override.reason || override.denial_reason || '-'}
      </td>
    </tr>
  );
}

// ============================================================================
// PAGINATION
// ============================================================================

function Pagination({ page, totalPages, total, onPageChange }) {
  const pages = useMemo(() => {
    const result = [];
    const start = Math.max(1, page - 2);
    const end = Math.min(totalPages, page + 2);

    for (let i = start; i <= end; i++) {
      result.push(i);
    }
    return result;
  }, [page, totalPages]);

  return (
    <div className="flex items-center justify-between px-4 py-3 border-t border-gray-200">
      <div className="text-sm text-gray-500">
        {total} total records
      </div>
      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={() => onPageChange(page - 1)}
          disabled={page <= 1}
          className="p-2 text-gray-500 hover:text-gray-700 disabled:opacity-50 disabled:cursor-not-allowed"
        >
          <ChevronLeftIcon className="w-5 h-5" />
        </button>

        {pages.map((p) => (
          <button
            key={p}
            type="button"
            onClick={() => onPageChange(p)}
            className={`
              w-8 h-8 text-sm font-medium rounded-lg
              ${p === page
                ? 'bg-blue-600 text-white'
                : 'text-gray-600 hover:bg-gray-100'
              }
            `}
          >
            {p}
          </button>
        ))}

        <button
          type="button"
          onClick={() => onPageChange(page + 1)}
          disabled={page >= totalPages}
          className="p-2 text-gray-500 hover:text-gray-700 disabled:opacity-50 disabled:cursor-not-allowed"
        >
          <ChevronRightIcon className="w-5 h-5" />
        </button>
      </div>
    </div>
  );
}

// ============================================================================
// MAIN COMPONENT
// ============================================================================

export function OverrideAuditReport() {
  const navigate = useNavigate();
  const { isAdminOrManager } = useAuth();

  // Date range state
  const [startDate, setStartDate] = useState(() => {
    const date = new Date();
    date.setDate(date.getDate() - 30);
    return date.toISOString().slice(0, 10);
  });
  const [endDate, setEndDate] = useState(() => {
    return new Date().toISOString().slice(0, 10);
  });

  // Filter state
  const [managerId, setManagerId] = useState('');
  const [cashierId, setCashierId] = useState('');
  const [overrideType, setOverrideType] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [showFilters, setShowFilters] = useState(false);

  // Data state
  const [overrides, setOverrides] = useState([]);
  const [summary, setSummary] = useState(null);
  const [managers, setManagers] = useState([]);
  const [cashiers, setCashiers] = useState([]);
  const [overrideTypes, setOverrideTypes] = useState([]);

  // Pagination
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [total, setTotal] = useState(0);

  // Loading state
  const [loading, setLoading] = useState(true);
  const [exporting, setExporting] = useState(false);
  const [error, setError] = useState(null);

  // Check access
  useEffect(() => {
    if (!isAdminOrManager()) {
      navigate('/', { replace: true });
    }
  }, [isAdminOrManager, navigate]);

  // Load filter options
  useEffect(() => {
    loadFilterOptions();
  }, []);

  // Load data when filters change
  useEffect(() => {
    loadData();
  }, [startDate, endDate, managerId, cashierId, overrideType, statusFilter, page]);

  const loadFilterOptions = async () => {
    try {
      const [managersRes, cashiersRes, typesRes] = await Promise.all([
        authFetch(`${API_BASE}/api/admin/overrides/managers`),
        authFetch(`${API_BASE}/api/admin/overrides/cashiers`),
        authFetch(`${API_BASE}/api/admin/overrides/types`),
      ]);

      const [managersData, cashiersData, typesData] = await Promise.all([
        managersRes.json(),
        cashiersRes.json(),
        typesRes.json(),
      ]);

      if (managersData.success) setManagers(managersData.data);
      if (cashiersData.success) setCashiers(cashiersData.data);
      if (typesData.success) setOverrideTypes(typesData.data);
    } catch (err) {
      console.error('Failed to load filter options:', err);
    }
  };

  const loadData = async () => {
    setLoading(true);
    setError(null);

    try {
      // Build query params
      const params = new URLSearchParams();
      if (startDate) params.set('start_date', startDate);
      if (endDate) params.set('end_date', `${endDate}T23:59:59`);
      if (managerId) params.set('manager_id', managerId);
      if (cashierId) params.set('cashier_id', cashierId);
      if (overrideType) params.set('override_type', overrideType);
      if (statusFilter !== '') params.set('was_approved', statusFilter);
      params.set('page', page.toString());
      params.set('limit', '25');

      // Fetch data and summary in parallel
      const [dataRes, summaryRes] = await Promise.all([
        authFetch(`${API_BASE}/api/admin/overrides?${params}`),
        authFetch(`${API_BASE}/api/admin/overrides/summary?${params}`),
      ]);

      const [dataResult, summaryResult] = await Promise.all([
        dataRes.json(),
        summaryRes.json(),
      ]);

      if (!dataResult.success) {
        throw new Error(dataResult.error || 'Failed to load overrides');
      }

      setOverrides(dataResult.data.overrides);
      setTotal(dataResult.data.pagination.total);
      setTotalPages(dataResult.data.pagination.totalPages);

      if (summaryResult.success) {
        setSummary(summaryResult.data);
      }
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleExportCSV = async () => {
    setExporting(true);

    try {
      // Build query params
      const params = new URLSearchParams();
      if (startDate) params.set('start_date', startDate);
      if (endDate) params.set('end_date', `${endDate}T23:59:59`);
      if (managerId) params.set('manager_id', managerId);
      if (cashierId) params.set('cashier_id', cashierId);
      if (overrideType) params.set('override_type', overrideType);
      if (statusFilter !== '') params.set('was_approved', statusFilter);

      const response = await authFetch(
        `${API_BASE}/api/admin/overrides/export?${params}`
      );

      if (!response.ok) {
        throw new Error('Export failed');
      }

      // Download the CSV
      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `override_audit_${new Date().toISOString().slice(0, 10)}.csv`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      window.URL.revokeObjectURL(url);
    } catch (err) {
      console.error('Export failed:', err);
      alert('Failed to export CSV');
    } finally {
      setExporting(false);
    }
  };

  const handleClearFilters = () => {
    setManagerId('');
    setCashierId('');
    setOverrideType('');
    setStatusFilter('');
    setPage(1);
  };

  const hasFilters = managerId || cashierId || overrideType || statusFilter !== '';

  return (
    <div className="min-h-screen bg-gray-100">
      {/* Header */}
      <header className="bg-white border-b border-gray-200">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between h-16">
            <div className="flex items-center gap-4">
              <button
                type="button"
                onClick={() => navigate('/reports')}
                className="w-10 h-10 flex items-center justify-center text-gray-500 hover:text-gray-700 hover:bg-gray-100 rounded-lg transition-colors"
              >
                <ArrowLeftIcon className="w-5 h-5" />
              </button>
              <div>
                <h1 className="text-xl font-bold text-gray-900">Override Audit Report</h1>
                <p className="text-sm text-gray-500">Manager approval history and statistics</p>
              </div>
            </div>

            <div className="flex items-center gap-3">
              <button
                type="button"
                onClick={loadData}
                className="flex items-center gap-2 h-10 px-4 text-gray-600 hover:text-gray-900 hover:bg-gray-100 rounded-lg transition-colors"
              >
                <ArrowPathIcon className={`w-5 h-5 ${loading ? 'animate-spin' : ''}`} />
                Refresh
              </button>

              <button
                type="button"
                onClick={handleExportCSV}
                disabled={exporting || loading}
                className="flex items-center gap-2 h-10 px-4 bg-green-600 hover:bg-green-700 disabled:bg-gray-300 text-white font-medium rounded-lg transition-colors"
              >
                {exporting ? (
                  <>
                    <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                    Exporting...
                  </>
                ) : (
                  <>
                    <ArrowDownTrayIcon className="w-5 h-5" />
                    Export CSV
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      </header>

      {/* Content */}
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
        {/* Filters */}
        <div className="bg-white rounded-xl border border-gray-200 p-4 mb-6">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-4">
              <DateRangePicker
                startDate={startDate}
                endDate={endDate}
                onStartChange={setStartDate}
                onEndChange={setEndDate}
              />
            </div>

            <button
              type="button"
              onClick={() => setShowFilters(!showFilters)}
              className={`
                flex items-center gap-2 h-10 px-4 rounded-lg transition-colors
                ${showFilters || hasFilters
                  ? 'bg-blue-100 text-blue-700'
                  : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                }
              `}
            >
              <FunnelIcon className="w-5 h-5" />
              Filters
              {hasFilters && (
                <span className="w-5 h-5 bg-blue-600 text-white text-xs font-bold rounded-full flex items-center justify-center">
                  !
                </span>
              )}
            </button>
          </div>

          {/* Extended Filters */}
          {showFilters && (
            <div className="pt-4 border-t border-gray-200">
              <div className="flex items-end gap-4 flex-wrap">
                <FilterDropdown
                  label="Manager"
                  value={managerId}
                  onChange={setManagerId}
                  options={managers.map((m) => ({ value: m.id.toString(), label: m.name }))}
                  placeholder="All Managers"
                />

                <FilterDropdown
                  label="Cashier"
                  value={cashierId}
                  onChange={setCashierId}
                  options={cashiers.map((c) => ({ value: c.id.toString(), label: c.name }))}
                  placeholder="All Cashiers"
                />

                <FilterDropdown
                  label="Override Type"
                  value={overrideType}
                  onChange={setOverrideType}
                  options={overrideTypes.map((t) => ({ value: t, label: t.replace(/_/g, ' ') }))}
                  placeholder="All Types"
                />

                <FilterDropdown
                  label="Status"
                  value={statusFilter}
                  onChange={setStatusFilter}
                  options={[
                    { value: 'true', label: 'Approved' },
                    { value: 'false', label: 'Denied' },
                  ]}
                  placeholder="All Status"
                />

                {hasFilters && (
                  <button
                    type="button"
                    onClick={handleClearFilters}
                    className="flex items-center gap-1 h-10 px-3 text-gray-500 hover:text-gray-700"
                  >
                    <XMarkIcon className="w-4 h-4" />
                    Clear
                  </button>
                )}
              </div>
            </div>
          )}
        </div>

        {/* Summary Stats */}
        {summary && !loading && (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-4 mb-6">
            <StatCard
              icon={ChartBarIcon}
              label="Total Overrides"
              value={summary.totalOverrides}
              subValue={`${summary.approvalRate}% approval rate`}
              color="blue"
            />
            <StatCard
              icon={ShieldCheckIcon}
              label="Approved"
              value={summary.approvedCount}
              color="green"
            />
            <StatCard
              icon={XCircleIcon}
              label="Denied"
              value={summary.deniedCount}
              color="red"
            />
            <StatCard
              icon={CurrencyDollarIcon}
              label="Total Discount"
              value={formatCurrency(summary.totalDiscountAmount)}
              subValue={`Avg: ${summary.avgDiscountPercent.toFixed(1)}%`}
              color="yellow"
            />
            <StatCard
              icon={TagIcon}
              label="Most Common"
              value={summary.mostCommonType?.replace(/_/g, ' ') || 'N/A'}
              color="purple"
            />
          </div>
        )}

        {/* Data Table */}
        <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
          {loading ? (
            <div className="flex items-center justify-center py-12">
              <div className="w-10 h-10 border-4 border-blue-600 border-t-transparent rounded-full animate-spin" />
            </div>
          ) : error ? (
            <div className="p-6 text-center">
              <p className="text-red-600">{error}</p>
              <button
                type="button"
                onClick={loadData}
                className="mt-4 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
              >
                Retry
              </button>
            </div>
          ) : overrides.length === 0 ? (
            <div className="py-12 text-center">
              <ShieldCheckIcon className="w-12 h-12 text-gray-300 mx-auto mb-4" />
              <p className="text-gray-500">No overrides found for this period</p>
            </div>
          ) : (
            <>
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead className="bg-gray-50 border-b border-gray-200">
                    <tr>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Date</th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Transaction</th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Cashier</th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Type</th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Product</th>
                      <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">Original / New</th>
                      <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">Discount</th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Status</th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Approved By</th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Reason</th>
                    </tr>
                  </thead>
                  <tbody>
                    {overrides.map((override) => (
                      <OverrideRow key={override.id} override={override} />
                    ))}
                  </tbody>
                </table>
              </div>

              <Pagination
                page={page}
                totalPages={totalPages}
                total={total}
                onPageChange={setPage}
              />
            </>
          )}
        </div>

        {/* Top Managers Section */}
        {summary?.topManagers?.length > 0 && !loading && (
          <div className="mt-6 bg-white rounded-xl border border-gray-200 p-6">
            <h3 className="text-lg font-semibold text-gray-900 mb-4">Top Approving Managers</h3>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-4">
              {summary.topManagers.map((manager, idx) => (
                <div key={manager.managerId} className="p-4 bg-gray-50 rounded-lg">
                  <div className="flex items-center gap-3 mb-2">
                    <div className="w-8 h-8 bg-blue-100 text-blue-600 rounded-full flex items-center justify-center text-sm font-bold">
                      {idx + 1}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-gray-900 truncate">
                        {manager.managerName}
                      </p>
                    </div>
                  </div>
                  <div className="flex justify-between text-sm">
                    <span className="text-gray-500">{manager.overrideCount} approvals</span>
                    <span className="text-gray-700 font-medium">{formatCurrency(manager.totalDiscount)}</span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </main>
    </div>
  );
}

export default OverrideAuditReport;
