/**
 * Team Commissions Page
 * Manager view of all sales reps' commission earnings
 */

import React, { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  ArrowLeftIcon,
  ArrowPathIcon,
  CalendarIcon,
  ArrowDownTrayIcon,
  UserGroupIcon,
  XMarkIcon,
  ChevronRightIcon,
} from '@heroicons/react/24/outline';
import { useAuth } from '../context/AuthContext';
import {
  getTeamCommissions,
  getRepDetailedCommissions,
  exportCommissionsCSV,
} from '../api/commissions';
import {
  TeamCommissionSummary,
  RepCommissionSummary,
  TargetProgressCard,
} from '../components/Commission/CommissionSummaryCards';
import CommissionTable, { TeamCommissionTable } from '../components/Commission/CommissionTable';

/**
 * Date range presets
 */
const DATE_PRESETS = [
  { label: 'Today', getValue: () => {
    const today = new Date().toISOString().split('T')[0];
    return { startDate: today, endDate: today };
  }},
  { label: 'This Week', getValue: () => {
    const now = new Date();
    const start = new Date(now);
    start.setDate(start.getDate() - start.getDay());
    return {
      startDate: start.toISOString().split('T')[0],
      endDate: now.toISOString().split('T')[0],
    };
  }},
  { label: 'This Month', getValue: () => {
    const now = new Date();
    const start = new Date(now.getFullYear(), now.getMonth(), 1);
    return {
      startDate: start.toISOString().split('T')[0],
      endDate: now.toISOString().split('T')[0],
    };
  }},
  { label: 'Last Month', getValue: () => {
    const now = new Date();
    const start = new Date(now.getFullYear(), now.getMonth() - 1, 1);
    const end = new Date(now.getFullYear(), now.getMonth(), 0);
    return {
      startDate: start.toISOString().split('T')[0],
      endDate: end.toISOString().split('T')[0],
    };
  }},
  { label: 'This Quarter', getValue: () => {
    const now = new Date();
    const quarter = Math.floor(now.getMonth() / 3);
    const start = new Date(now.getFullYear(), quarter * 3, 1);
    return {
      startDate: start.toISOString().split('T')[0],
      endDate: now.toISOString().split('T')[0],
    };
  }},
];

/**
 * Rep Detail Slide-over Panel
 */
function RepDetailPanel({ rep, dateRange, onClose }) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [detailError, setDetailError] = useState(null);

  useEffect(() => {
    if (rep) {
      setLoading(true);
      setDetailError(null);
      getRepDetailedCommissions(rep.repId, dateRange)
        .then(result => setData(result.data))
        .catch(err => {
          console.error('[TeamCommissions] Failed to load rep details:', err);
          setDetailError(err.message || 'Failed to load rep details');
        })
        .finally(() => setLoading(false));
    }
  }, [rep, dateRange]);

  if (!rep) return null;

  return (
    <div className="fixed inset-0 z-50 overflow-hidden">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/30 backdrop-blur-sm"
        onClick={onClose}
      />

      {/* Panel */}
      <div className="absolute right-0 top-0 h-full w-full max-w-2xl bg-white shadow-2xl overflow-hidden flex flex-col animate-slide-in-right">
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-slate-200 bg-slate-50">
          <div>
            <h2 className="text-lg font-semibold text-slate-900">{rep.repName}</h2>
            <p className="text-sm text-slate-500">{rep.email}</p>
          </div>
          <button
            onClick={onClose}
            className="p-2 text-slate-400 hover:text-slate-600 hover:bg-slate-200 rounded-lg"
          >
            <XMarkIcon className="w-5 h-5" />
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-4 space-y-6">
          {loading ? (
            <div className="flex items-center justify-center py-12">
              <div className="w-8 h-8 border-2 border-slate-300 border-t-blue-500 rounded-full animate-spin" />
            </div>
          ) : data ? (
            <>
              {/* Summary cards */}
              <RepCommissionSummary
                summary={data.summary}
                comparison={data.comparison}
              />

              {/* Comparison */}
              {data.comparison && (
                <div className="bg-slate-50 rounded-xl p-4">
                  <h3 className="text-sm font-semibold text-slate-700 mb-3">
                    vs Previous Period
                  </h3>
                  <div className="grid grid-cols-3 gap-4">
                    <div className="text-center">
                      <div className={`text-lg font-bold ${
                        data.comparison.changes.commission >= 0 ? 'text-green-600' : 'text-red-500'
                      }`}>
                        {data.comparison.changes.commission >= 0 ? '+' : ''}
                        ${data.comparison.changes.commission.toFixed(2)}
                      </div>
                      <div className="text-xs text-slate-500">Commission</div>
                    </div>
                    <div className="text-center">
                      <div className={`text-lg font-bold ${
                        data.comparison.changes.orders >= 0 ? 'text-green-600' : 'text-red-500'
                      }`}>
                        {data.comparison.changes.orders >= 0 ? '+' : ''}
                        {data.comparison.changes.orders}
                      </div>
                      <div className="text-xs text-slate-500">Orders</div>
                    </div>
                    <div className="text-center">
                      <div className={`text-lg font-bold ${
                        data.comparison.changes.sales >= 0 ? 'text-green-600' : 'text-red-500'
                      }`}>
                        {data.comparison.changes.sales >= 0 ? '+' : ''}
                        ${data.comparison.changes.sales.toFixed(0)}
                      </div>
                      <div className="text-xs text-slate-500">Sales</div>
                    </div>
                  </div>
                </div>
              )}

              {/* Target progress */}
              {data.targetProgress && (
                <TargetProgressCard targetProgress={data.targetProgress} />
              )}

              {/* Commission details */}
              <div>
                <h3 className="text-sm font-semibold text-slate-700 mb-3">
                  Transactions ({data.earnings?.length || 0})
                </h3>
                <CommissionTable
                  earnings={data.earnings || []}
                  loading={false}
                />
              </div>
            </>
          ) : (
            <div className="text-center py-12">
              <p className="text-red-600 font-medium mb-2">Failed to load rep details</p>
              {detailError && <p className="text-sm text-slate-500 mb-4">{detailError}</p>}
              <button
                onClick={() => {
                  setLoading(true);
                  setDetailError(null);
                  getRepDetailedCommissions(rep.repId, dateRange)
                    .then(result => setData(result.data))
                    .catch(err => setDetailError(err.message || 'Failed to load rep details'))
                    .finally(() => setLoading(false));
                }}
                className="px-4 py-2 text-sm font-medium text-blue-600 hover:bg-blue-50 rounded-lg"
              >
                Try Again
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Animation styles */}
      <style>{`
        @keyframes slide-in-right {
          from { transform: translateX(100%); }
          to { transform: translateX(0); }
        }
        .animate-slide-in-right {
          animation: slide-in-right 0.3s ease-out forwards;
        }
      `}</style>
    </div>
  );
}

/**
 * Team Commissions Page Component
 */
export default function TeamCommissionsPage() {
  const navigate = useNavigate();
  const { user, isAdminOrManager } = useAuth();

  const [report, setReport] = useState(null);
  const [loading, setLoading] = useState(true);
  const [exporting, setExporting] = useState(false);
  const [error, setError] = useState(null);
  const [selectedRep, setSelectedRep] = useState(null);

  // Date range state
  const [selectedPreset, setSelectedPreset] = useState(2); // This Month
  const [customRange, setCustomRange] = useState(false);
  const [dateRange, setDateRange] = useState(DATE_PRESETS[2].getValue());

  // Check permission
  useEffect(() => {
    if (!isAdminOrManager?.()) {
      navigate('/commissions/my');
    }
  }, [isAdminOrManager, navigate]);

  // Fetch team data
  const fetchTeamData = useCallback(async () => {
    setLoading(true);
    setError(null);

    try {
      const result = await getTeamCommissions(dateRange);
      setReport(result.data);
    } catch (err) {
      console.error('[TeamCommissionsPage] Error:', err);
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [dateRange]);

  useEffect(() => {
    fetchTeamData();
  }, [fetchTeamData]);

  // Handle preset selection
  const handlePresetChange = (index) => {
    setSelectedPreset(index);
    setCustomRange(false);
    setDateRange(DATE_PRESETS[index].getValue());
  };

  // Handle custom date change
  const handleDateChange = (field, value) => {
    setCustomRange(true);
    setSelectedPreset(-1);
    setDateRange(prev => ({ ...prev, [field]: value }));
  };

  // Export to CSV
  const handleExport = async (repId = null) => {
    setExporting(true);
    try {
      await exportCommissionsCSV({
        startDate: dateRange.startDate,
        endDate: dateRange.endDate,
        repId,
      });
    } catch (err) {
      console.error('[TeamCommissionsPage] Export error:', err);
      alert('Failed to export: ' + err.message);
    } finally {
      setExporting(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-50">
      {/* Header */}
      <header className="bg-white border-b border-slate-200 sticky top-0 z-10">
        <div className="max-w-7xl mx-auto px-4 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              <button
                onClick={() => navigate(-1)}
                className="p-2 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded-lg transition-colors"
              >
                <ArrowLeftIcon className="w-5 h-5" />
              </button>
              <div className="flex items-center gap-3">
                <div className="p-2 bg-blue-100 rounded-lg">
                  <UserGroupIcon className="w-6 h-6 text-blue-600" />
                </div>
                <div>
                  <h1 className="text-xl font-bold text-slate-900">Team Commissions</h1>
                  <p className="text-sm text-slate-500">
                    Monitor your team's performance
                  </p>
                </div>
              </div>
            </div>

            <div className="flex items-center gap-3">
              <button
                onClick={fetchTeamData}
                disabled={loading}
                className="flex items-center gap-2 px-4 py-2 text-slate-600 hover:text-slate-900 hover:bg-slate-100 rounded-lg transition-colors"
              >
                <ArrowPathIcon className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
                Refresh
              </button>
              <button
                onClick={() => handleExport()}
                disabled={exporting || loading}
                className="flex items-center gap-2 px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors disabled:opacity-50"
              >
                <ArrowDownTrayIcon className="w-4 h-4" />
                {exporting ? 'Exporting...' : 'Export All'}
              </button>
            </div>
          </div>
        </div>
      </header>

      {/* Date Range Selector */}
      <div className="bg-white border-b border-slate-200">
        <div className="max-w-7xl mx-auto px-4 py-3">
          <div className="flex items-center gap-4 flex-wrap">
            <CalendarIcon className="w-5 h-5 text-slate-400" />

            {/* Presets */}
            <div className="flex items-center gap-1 p-1 bg-slate-100 rounded-lg">
              {DATE_PRESETS.map((preset, index) => (
                <button
                  key={preset.label}
                  onClick={() => handlePresetChange(index)}
                  className={`px-3 py-1.5 text-sm rounded-md transition-colors ${
                    selectedPreset === index && !customRange
                      ? 'bg-white text-slate-900 shadow-sm'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  {preset.label}
                </button>
              ))}
            </div>

            {/* Custom range inputs */}
            <div className="flex items-center gap-2 ml-auto">
              <input
                type="date"
                value={dateRange.startDate}
                onChange={(e) => handleDateChange('startDate', e.target.value)}
                className="px-3 py-1.5 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
              <span className="text-slate-400">to</span>
              <input
                type="date"
                value={dateRange.endDate}
                onChange={(e) => handleDateChange('endDate', e.target.value)}
                className="px-3 py-1.5 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
          </div>
        </div>
      </div>

      {/* Main Content */}
      <main className="max-w-7xl mx-auto px-4 py-6">
        {error ? (
          <div className="bg-red-50 border border-red-200 rounded-xl p-6 text-center">
            <p className="text-red-600">{error}</p>
            <button
              onClick={fetchTeamData}
              className="mt-3 text-sm text-red-600 hover:underline"
            >
              Try again
            </button>
          </div>
        ) : (
          <div className="space-y-6">
            {/* Team Summary Cards */}
            <TeamCommissionSummary
              totals={report?.teamTotals}
              loading={loading}
            />

            {/* Team Table */}
            <div>
              <div className="flex items-center justify-between mb-4">
                <div>
                  <h2 className="text-lg font-semibold text-slate-900">Sales Rep Performance</h2>
                  <p className="text-sm text-slate-500">
                    {report?.reps?.length || 0} reps • Click a row for details
                  </p>
                </div>
              </div>

              <TeamCommissionTable
                reps={report?.reps || []}
                loading={loading}
                onRepClick={setSelectedRep}
              />
            </div>

            {/* Quick Actions */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <button
                onClick={() => navigate('/admin/commissions/rules')}
                className="flex items-center justify-between p-4 bg-white rounded-xl border border-slate-200 hover:border-blue-300 hover:shadow-md transition-all group"
              >
                <div className="text-left">
                  <div className="font-medium text-slate-900">Commission Rules</div>
                  <div className="text-sm text-slate-500">Configure rates and bonuses</div>
                </div>
                <ChevronRightIcon className="w-5 h-5 text-slate-400 group-hover:text-blue-500" />
              </button>

              <button
                onClick={() => navigate('/admin/commissions/payroll')}
                className="flex items-center justify-between p-4 bg-white rounded-xl border border-slate-200 hover:border-blue-300 hover:shadow-md transition-all group"
              >
                <div className="text-left">
                  <div className="font-medium text-slate-900">Payroll Summary</div>
                  <div className="text-sm text-slate-500">Review pending payouts</div>
                </div>
                <ChevronRightIcon className="w-5 h-5 text-slate-400 group-hover:text-blue-500" />
              </button>

              <button
                onClick={() => handleExport()}
                disabled={exporting}
                className="flex items-center justify-between p-4 bg-white rounded-xl border border-slate-200 hover:border-green-300 hover:shadow-md transition-all group"
              >
                <div className="text-left">
                  <div className="font-medium text-slate-900">Export Report</div>
                  <div className="text-sm text-slate-500">Download full CSV</div>
                </div>
                <ArrowDownTrayIcon className="w-5 h-5 text-slate-400 group-hover:text-green-500" />
              </button>
            </div>
          </div>
        )}
      </main>

      {/* Rep Detail Panel */}
      {selectedRep && (
        <RepDetailPanel
          rep={selectedRep}
          dateRange={dateRange}
          onClose={() => setSelectedRep(null)}
        />
      )}
    </div>
  );
}
