/**
 * TeleTime POS - Reports Page
 * Manager-only access to shift reports and analytics
 */

import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  ArrowLeftIcon,
  CalendarIcon,
  ChartBarIcon,
  DocumentTextIcon,
  CurrencyDollarIcon,
  UserGroupIcon,
  ClockIcon,
  PrinterIcon,
  FunnelIcon,
  ShieldCheckIcon,
  ArrowRightIcon,
} from '@heroicons/react/24/outline';
import { useAuth } from '../context/AuthContext';
import { formatCurrency, formatDate, formatDateTime } from '../utils/formatters';
import api from '../api/axios';

/**
 * Stat card component
 */
function StatCard({ icon: Icon, label, value, subValue, trend, color = 'blue' }) {
  const colorClasses = {
    blue: 'bg-blue-50 text-blue-600',
    green: 'bg-green-50 text-green-600',
    yellow: 'bg-yellow-50 text-yellow-600',
    purple: 'bg-purple-50 text-purple-600',
  };

  return (
    <div className="bg-white rounded-xl border border-gray-200 p-6">
      <div className="flex items-start justify-between">
        <div className={`w-12 h-12 rounded-lg flex items-center justify-center ${colorClasses[color]}`}>
          <Icon className="w-6 h-6" />
        </div>
        {trend && (
          <span className={`text-sm font-medium ${trend >= 0 ? 'text-green-600' : 'text-red-600'}`}>
            {trend >= 0 ? '+' : ''}{trend}%
          </span>
        )}
      </div>
      <div className="mt-4">
        <p className="text-2xl font-bold text-gray-900">{value}</p>
        <p className="text-sm text-gray-500">{label}</p>
        {subValue && (
          <p className="text-xs text-gray-400 mt-1">{subValue}</p>
        )}
      </div>
    </div>
  );
}

/**
 * Shift row component
 */
function ShiftRow({ shift, onViewDetails }) {
  const registerName = shift.registerName || shift.register_name || 'Register';
  const userName = shift.userName || shift.user_name || 'Staff';
  const openedAt = shift.openedAt || shift.opened_at;
  const closedAt = shift.closedAt || shift.closed_at;
  const totalSales = shift.totalSales || shift.total_sales || 0;
  const transactionCount = shift.transactionCount || shift.transaction_count || 0;
  const variance = shift.variance || 0;

  return (
    <div className="flex items-center justify-between p-4 bg-white border-b border-gray-100 hover:bg-gray-50 transition-colors">
      <div className="flex items-center gap-4">
        <div className="w-10 h-10 bg-slate-100 rounded-lg flex items-center justify-center">
          <ClockIcon className="w-5 h-5 text-slate-600" />
        </div>
        <div>
          <p className="font-medium text-gray-900">
            {registerName} - {userName}
          </p>
          <p className="text-sm text-gray-500">
            {formatDateTime(openedAt)}
            {closedAt && ` - ${formatDateTime(closedAt)}`}
          </p>
        </div>
      </div>

      <div className="flex items-center gap-6">
        <div className="text-right">
          <p className="font-semibold text-gray-900">{formatCurrency(totalSales)}</p>
          <p className="text-sm text-gray-500">{transactionCount} transactions</p>
        </div>

        {variance !== 0 && (
          <div className={`text-right ${Math.abs(variance) > 5 ? 'text-red-600' : 'text-gray-500'}`}>
            <p className="text-sm font-medium">
              {variance >= 0 ? '+' : ''}{formatCurrency(variance)}
            </p>
            <p className="text-xs">variance</p>
          </div>
        )}

        <button
          type="button"
          onClick={() => onViewDetails(shift)}
          className="px-4 py-2 text-sm font-medium text-blue-600 hover:text-blue-700 hover:bg-blue-50 rounded-lg transition-colors"
        >
          View
        </button>
      </div>
    </div>
  );
}

/**
 * Reports page component
 */
export function Reports() {
  const navigate = useNavigate();
  const { user, isAdminOrManager } = useAuth();

  // State
  const [dateRange, setDateRange] = useState('today'); // 'today', 'week', 'month', 'custom'
  const [shifts, setShifts] = useState([]);
  const [summary, setSummary] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  // Check access
  useEffect(() => {
    if (!isAdminOrManager()) {
      navigate('/', { replace: true });
    }
  }, [isAdminOrManager, navigate]);

  // Load data
  useEffect(() => {
    loadReportData();
  }, [dateRange]);

  const loadReportData = async () => {
    setLoading(true);
    setError(null);

    try {
      // Build date params based on selected range
      const now = new Date();
      let startTime, endTime;

      if (dateRange === 'today') {
        const today = new Date(now);
        today.setHours(0, 0, 0, 0);
        const tomorrow = new Date(today);
        tomorrow.setDate(tomorrow.getDate() + 1);
        startTime = today.toISOString();
        endTime = tomorrow.toISOString();
      } else if (dateRange === 'week') {
        const weekStart = new Date(now);
        weekStart.setDate(weekStart.getDate() - weekStart.getDay());
        weekStart.setHours(0, 0, 0, 0);
        const weekEnd = new Date(now);
        weekEnd.setDate(weekEnd.getDate() + 1);
        weekEnd.setHours(0, 0, 0, 0);
        startTime = weekStart.toISOString();
        endTime = weekEnd.toISOString();
      } else {
        const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
        const monthEnd = new Date(now);
        monthEnd.setDate(monthEnd.getDate() + 1);
        monthEnd.setHours(0, 0, 0, 0);
        startTime = monthStart.toISOString();
        endTime = monthEnd.toISOString();
      }

      // Fetch report summary and shifts list in parallel
      const [reportRes, shiftsRes] = await Promise.all([
        api.post('/reports/period/summary', { startTime, endTime }),
        api.get(`/reports/shifts?date=${now.toISOString().split('T')[0]}`).catch(() => null),
      ]);

      const data = reportRes?.data || reportRes;

      const sales = data?.sales || {};
      const txns = sales?.transactions || {};
      const revenue = sales?.revenue || {};
      const averages = sales?.averages || {};

      setSummary({
        totalSales: revenue.grossRevenue || 0,
        netRevenue: revenue.netRevenue || 0,
        transactionCount: txns.total || 0,
        refundCount: txns.refunded || 0,
        voidCount: txns.voided || 0,
        refundAmount: revenue.refundAmount || 0,
        averageTicket: averages.transactionValue || 0,
        itemsSold: sales.itemsSold || 0,
        shiftCount: data?.shift?.shiftId ? 1 : 0,
        varianceTotal: 0,
      });

      // Populate shifts list from the shifts endpoint
      const shiftsData = shiftsRes?.data?.shifts || shiftsRes?.shifts || [];
      setShifts(shiftsData);
    } catch (err) {
      console.error('[Reports] Load error:', err);
      setError(err.message || 'Failed to load report data');
    } finally {
      setLoading(false);
    }
  };

  const handleViewShiftDetails = (shift) => {
    const shiftId = shift.shiftId || shift.shift_id || shift.id;
    navigate(`/reports/shift?shiftId=${shiftId}`);
  };

  const handlePrint = () => {
    window.print();
  };

  return (
    <div className="min-h-screen bg-gray-100">
      {/* Header */}
      <header className="bg-white border-b border-gray-200">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between h-16">
            <div className="flex items-center gap-4">
              <button
                type="button"
                onClick={() => navigate('/')}
                className="w-10 h-10 flex items-center justify-center text-gray-500 hover:text-gray-700 hover:bg-gray-100 rounded-lg transition-colors"
              >
                <ArrowLeftIcon className="w-5 h-5" />
              </button>
              <div>
                <h1 className="text-xl font-bold text-gray-900">Reports</h1>
                <p className="text-sm text-gray-500">Shift summaries and analytics</p>
              </div>
            </div>

            <div className="flex items-center gap-3">
              {/* Date Range Filter */}
              <div className="flex items-center gap-2 bg-gray-100 rounded-lg p-1">
                {['today', 'week', 'month'].map((range) => (
                  <button
                    key={range}
                    type="button"
                    onClick={() => setDateRange(range)}
                    className={`
                      px-4 py-2 text-sm font-medium rounded-md transition-colors
                      ${dateRange === range
                        ? 'bg-white text-gray-900 shadow-sm'
                        : 'text-gray-600 hover:text-gray-900'
                      }
                    `}
                  >
                    {range.charAt(0).toUpperCase() + range.slice(1)}
                  </button>
                ))}
              </div>

              {/* Print Button */}
              <button
                type="button"
                onClick={handlePrint}
                className="flex items-center gap-2 h-10 px-4 bg-gray-200 hover:bg-gray-300 text-gray-700 font-medium rounded-lg transition-colors"
              >
                <PrinterIcon className="w-5 h-5" />
                Print
              </button>
            </div>
          </div>
        </div>
      </header>

      {/* Content */}
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {loading ? (
          <div className="flex items-center justify-center py-12">
            <div className="w-10 h-10 border-4 border-blue-600 border-t-transparent rounded-full animate-spin" />
          </div>
        ) : error ? (
          <div className="p-6 bg-red-50 border border-red-200 rounded-xl">
            <p className="text-red-700">{error}</p>
          </div>
        ) : (
          <>
            {/* Summary Stats */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-4">
              <StatCard
                icon={CurrencyDollarIcon}
                label="Gross Sales"
                value={formatCurrency(summary?.totalSales || 0)}
                subValue={`${summary?.transactionCount || 0} transactions`}
                color="green"
              />
              <StatCard
                icon={DocumentTextIcon}
                label="Transactions"
                value={summary?.transactionCount || 0}
                subValue={`${summary?.itemsSold || 0} items sold`}
                color="blue"
              />
              <StatCard
                icon={ChartBarIcon}
                label="Average Ticket"
                value={formatCurrency(summary?.averageTicket || 0)}
                color="purple"
              />
              <StatCard
                icon={CurrencyDollarIcon}
                label="Net Revenue"
                value={formatCurrency(summary?.netRevenue || 0)}
                color="green"
              />
            </div>

            {/* Refunds & Returns Row */}
            {(summary?.refundCount > 0 || summary?.voidCount > 0) && (
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-8">
                <div className="bg-white rounded-xl border border-red-200 p-5">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-lg bg-red-50 flex items-center justify-center">
                      <CurrencyDollarIcon className="w-5 h-5 text-red-600" />
                    </div>
                    <div>
                      <p className="text-xl font-bold text-red-600">-{formatCurrency(summary?.refundAmount || 0)}</p>
                      <p className="text-sm text-gray-500">Refunds ({summary?.refundCount || 0})</p>
                    </div>
                  </div>
                </div>
                <div className="bg-white rounded-xl border border-amber-200 p-5">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-lg bg-amber-50 flex items-center justify-center">
                      <DocumentTextIcon className="w-5 h-5 text-amber-600" />
                    </div>
                    <div>
                      <p className="text-xl font-bold text-amber-600">{summary?.voidCount || 0}</p>
                      <p className="text-sm text-gray-500">Voided Transactions</p>
                    </div>
                  </div>
                </div>
                <div className="bg-white rounded-xl border border-gray-200 p-5">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-lg bg-blue-50 flex items-center justify-center">
                      <ChartBarIcon className="w-5 h-5 text-blue-600" />
                    </div>
                    <div>
                      <p className="text-xl font-bold text-gray-900">{formatCurrency(summary?.netRevenue || 0)}</p>
                      <p className="text-sm text-gray-500">Net After Refunds</p>
                    </div>
                  </div>
                </div>
              </div>
            )}
            {!(summary?.refundCount > 0 || summary?.voidCount > 0) && <div className="mb-8" />}

            {/* Report Links */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-8">
              <button
                type="button"
                onClick={() => navigate('/reports/overrides')}
                className="flex items-center justify-between p-4 bg-white rounded-xl border border-gray-200 hover:border-blue-300 hover:shadow-md transition-all group"
              >
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 bg-purple-100 rounded-lg flex items-center justify-center">
                    <ShieldCheckIcon className="w-5 h-5 text-purple-600" />
                  </div>
                  <div className="text-left">
                    <p className="font-medium text-gray-900">Override Audit</p>
                    <p className="text-sm text-gray-500">Manager approval history</p>
                  </div>
                </div>
                <ArrowRightIcon className="w-5 h-5 text-gray-400 group-hover:text-blue-600 transition-colors" />
              </button>

              <button
                type="button"
                onClick={() => navigate('/reports/shift')}
                className="flex items-center justify-between p-4 bg-white rounded-xl border border-gray-200 hover:border-blue-300 hover:shadow-md transition-all group"
              >
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 bg-green-100 rounded-lg flex items-center justify-center">
                    <ChartBarIcon className="w-5 h-5 text-green-600" />
                  </div>
                  <div className="text-left">
                    <p className="font-medium text-gray-900">Shift Report</p>
                    <p className="text-sm text-gray-500">End-of-day detailed report</p>
                  </div>
                </div>
                <ArrowRightIcon className="w-5 h-5 text-gray-400 group-hover:text-blue-600 transition-colors" />
              </button>

              <button
                type="button"
                onClick={() => navigate('/admin/approval-analytics')}
                className="flex items-center justify-between p-4 bg-white rounded-xl border border-gray-200 hover:border-blue-300 hover:shadow-md transition-all group"
              >
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 bg-blue-100 rounded-lg flex items-center justify-center">
                    <ChartBarIcon className="w-5 h-5 text-blue-600" />
                  </div>
                  <div className="text-left">
                    <p className="font-medium text-gray-900">Approval Analytics</p>
                    <p className="text-sm text-gray-500">Override trends & insights</p>
                  </div>
                </div>
                <ArrowRightIcon className="w-5 h-5 text-gray-400 group-hover:text-blue-600 transition-colors" />
              </button>
            </div>

            {/* Shifts List */}
            <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
              <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200">
                <h2 className="text-lg font-semibold text-gray-900">Shift History</h2>
                <button
                  type="button"
                  className="flex items-center gap-2 text-sm text-gray-600 hover:text-gray-900"
                >
                  <FunnelIcon className="w-4 h-4" />
                  Filter
                </button>
              </div>

              {shifts.length > 0 ? (
                <div>
                  {shifts.map((shift) => (
                    <ShiftRow
                      key={shift.shiftId || shift.shift_id}
                      shift={shift}
                      onViewDetails={handleViewShiftDetails}
                    />
                  ))}
                </div>
              ) : (
                <div className="py-12 text-center">
                  <ClockIcon className="w-12 h-12 text-gray-300 mx-auto mb-4" />
                  <p className="text-gray-500">No shifts found for this period</p>
                </div>
              )}
            </div>
          </>
        )}
      </main>
    </div>
  );
}

export default Reports;
