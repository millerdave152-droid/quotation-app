/**
 * My Commissions Page
 * Sales rep view of their commission earnings
 */

import React, { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  ArrowLeftIcon,
  ArrowPathIcon,
  CalendarIcon,
  ArrowDownTrayIcon,
  ChartBarIcon,
} from '@heroicons/react/24/outline';
import { useAuth } from '../context/AuthContext';
import { getMyCommissions, exportCommissionsCSV } from '../api/commissions';
import {
  RepCommissionSummary,
  TargetProgressCard,
} from '../components/Commission/CommissionSummaryCards';
import CommissionTable from '../components/Commission/CommissionTable';
import { DailyCommissionWidget, CommissionLeaderboard } from '../components/Commission';

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
  { label: 'Year to Date', getValue: () => {
    const now = new Date();
    const start = new Date(now.getFullYear(), 0, 1);
    return {
      startDate: start.toISOString().split('T')[0],
      endDate: now.toISOString().split('T')[0],
    };
  }},
];

/**
 * My Commissions Page Component
 */
export default function MyCommissionsPage() {
  const navigate = useNavigate();
  const { user } = useAuth();

  const [report, setReport] = useState(null);
  const [loading, setLoading] = useState(true);
  const [exporting, setExporting] = useState(false);
  const [error, setError] = useState(null);

  // Date range state
  const [selectedPreset, setSelectedPreset] = useState(2); // This Month
  const [customRange, setCustomRange] = useState(false);
  const [dateRange, setDateRange] = useState(DATE_PRESETS[2].getValue());

  // Fetch commission data
  const fetchCommissions = useCallback(async () => {
    setLoading(true);
    setError(null);

    try {
      const result = await getMyCommissions(dateRange);
      setReport(result.data);
    } catch (err) {
      console.error('[MyCommissionsPage] Error:', err);
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [dateRange]);

  useEffect(() => {
    fetchCommissions();
  }, [fetchCommissions]);

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
  const handleExport = async () => {
    setExporting(true);
    try {
      await exportCommissionsCSV({
        startDate: dateRange.startDate,
        endDate: dateRange.endDate,
      });
    } catch (err) {
      console.error('[MyCommissionsPage] Export error:', err);
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
              <div>
                <h1 className="text-xl font-bold text-slate-900">My Commissions</h1>
                <p className="text-sm text-slate-500">
                  Track your earnings and performance
                </p>
              </div>
            </div>

            <div className="flex items-center gap-3">
              <button
                onClick={fetchCommissions}
                disabled={loading}
                className="flex items-center gap-2 px-4 py-2 text-slate-600 hover:text-slate-900 hover:bg-slate-100 rounded-lg transition-colors"
              >
                <ArrowPathIcon className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
                Refresh
              </button>
              <button
                onClick={handleExport}
                disabled={exporting || loading}
                className="flex items-center gap-2 px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors disabled:opacity-50"
              >
                <ArrowDownTrayIcon className="w-4 h-4" />
                {exporting ? 'Exporting...' : 'Export CSV'}
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
              onClick={fetchCommissions}
              className="mt-3 text-sm text-red-600 hover:underline"
            >
              Try again
            </button>
          </div>
        ) : (
          <div className="space-y-6">
            {/* Summary Cards */}
            <RepCommissionSummary
              summary={report?.summary}
              comparison={report?.comparison}
              loading={loading}
            />

            {/* Target Progress */}
            {report?.targetProgress && (
              <TargetProgressCard
                targetProgress={report.targetProgress}
                loading={loading}
              />
            )}

            {/* Main Grid */}
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
              {/* Commission Table - Takes 2 columns */}
              <div className="lg:col-span-2">
                <div className="mb-4">
                  <h2 className="text-lg font-semibold text-slate-900">Commission Details</h2>
                  <p className="text-sm text-slate-500">
                    {report?.earnings?.length || 0} transactions in selected period
                  </p>
                </div>
                <CommissionTable
                  earnings={report?.earnings || []}
                  loading={loading}
                />
              </div>

              {/* Sidebar widgets */}
              <div className="space-y-6">
                {/* Daily breakdown chart */}
                {report?.dailyBreakdown?.length > 0 && (
                  <div className="bg-white rounded-xl border border-slate-200 p-4">
                    <h3 className="font-semibold text-slate-900 mb-4 flex items-center gap-2">
                      <ChartBarIcon className="w-5 h-5 text-slate-400" />
                      Daily Breakdown
                    </h3>
                    <div className="space-y-2 max-h-64 overflow-y-auto">
                      {report.dailyBreakdown.slice(0, 14).map(day => (
                        <div
                          key={day.date}
                          className="flex items-center justify-between py-2 border-b border-slate-100 last:border-0"
                        >
                          <div>
                            <div className="text-sm font-medium text-slate-700">
                              {new Date(day.date).toLocaleDateString('en-US', {
                                weekday: 'short',
                                month: 'short',
                                day: 'numeric',
                              })}
                            </div>
                            <div className="text-xs text-slate-500">
                              {day.orders} order{day.orders !== 1 ? 's' : ''}
                            </div>
                          </div>
                          <div className="text-right">
                            <div className="text-sm font-semibold text-green-600">
                              ${day.commission.toFixed(2)}
                            </div>
                            <div className="text-xs text-slate-500">
                              ${day.sales.toFixed(0)} sales
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Leaderboard */}
                <CommissionLeaderboard
                  currentUserId={user?.id}
                  defaultPeriod="month"
                  maxEntries={5}
                />
              </div>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
