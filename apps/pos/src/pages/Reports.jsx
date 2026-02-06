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

// API import (to be implemented)
// import { getShiftReports, getDailySummary, getWeeklySummary } from '../api/reports';

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
      // TODO: Implement actual API calls
      // const [shiftsRes, summaryRes] = await Promise.all([
      //   getShiftReports({ dateRange }),
      //   getDailySummary({ dateRange }),
      // ]);

      // Mock data for now
      await new Promise(resolve => setTimeout(resolve, 500));

      setSummary({
        totalSales: 4523.45,
        transactionCount: 47,
        averageTicket: 96.24,
        shiftCount: 3,
        topPaymentMethod: 'Credit Card',
        varianceTotal: -2.50,
      });

      setShifts([
        {
          shiftId: 1,
          registerName: 'Register 1',
          userName: 'John Doe',
          openedAt: new Date().toISOString(),
          closedAt: new Date().toISOString(),
          totalSales: 1523.45,
          transactionCount: 15,
          variance: -1.25,
        },
        {
          shiftId: 2,
          registerName: 'Register 2',
          userName: 'Jane Smith',
          openedAt: new Date(Date.now() - 86400000).toISOString(),
          closedAt: new Date(Date.now() - 86400000 + 28800000).toISOString(),
          totalSales: 2000.00,
          transactionCount: 22,
          variance: 0,
        },
      ]);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleViewShiftDetails = (shift) => {
    // TODO: Open shift details modal
    console.log('View shift:', shift);
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
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
              <StatCard
                icon={CurrencyDollarIcon}
                label="Total Sales"
                value={formatCurrency(summary?.totalSales || 0)}
                subValue={`${summary?.shiftCount || 0} shifts`}
                color="green"
              />
              <StatCard
                icon={DocumentTextIcon}
                label="Transactions"
                value={summary?.transactionCount || 0}
                subValue="completed"
                color="blue"
              />
              <StatCard
                icon={ChartBarIcon}
                label="Average Ticket"
                value={formatCurrency(summary?.averageTicket || 0)}
                color="purple"
              />
              <StatCard
                icon={UserGroupIcon}
                label="Total Variance"
                value={formatCurrency(Math.abs(summary?.varianceTotal || 0))}
                subValue={summary?.varianceTotal >= 0 ? 'over' : 'short'}
                color={Math.abs(summary?.varianceTotal || 0) > 10 ? 'yellow' : 'blue'}
              />
            </div>

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

              {/* Placeholder for future reports */}
              <div className="p-4 bg-gray-50 rounded-xl border border-dashed border-gray-300 flex items-center justify-center">
                <p className="text-sm text-gray-400">More reports coming soon</p>
              </div>
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
