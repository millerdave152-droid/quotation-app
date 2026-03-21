/**
 * Payroll Summary Page
 * Manager view of commission payroll for a period
 */

import React, { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  getPayrollSummary,
  getPendingPayouts,
  createPayout,
  approvePayout,
  markPayoutPaid,
  exportCommissionsCSV,
} from '../api/commissions';

import { ArrowLeft, Banknote, Calendar, Check, Clock, Download, RefreshCw } from 'lucide-react';
function formatCurrency(amount) {
  if (amount == null || isNaN(amount)) return '$0.00';
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 2,
  }).format(amount);
}

/**
 * Date range presets for payroll periods
 */
const PAYROLL_PRESETS = [
  { label: 'This Month', getValue: () => {
    const now = new Date();
    return {
      start: new Date(now.getFullYear(), now.getMonth(), 1).toISOString().split('T')[0],
      end: now.toISOString().split('T')[0],
    };
  }},
  { label: 'Last Month', getValue: () => {
    const now = new Date();
    return {
      start: new Date(now.getFullYear(), now.getMonth() - 1, 1).toISOString().split('T')[0],
      end: new Date(now.getFullYear(), now.getMonth(), 0).toISOString().split('T')[0],
    };
  }},
  { label: 'This Quarter', getValue: () => {
    const now = new Date();
    const q = Math.floor(now.getMonth() / 3);
    return {
      start: new Date(now.getFullYear(), q * 3, 1).toISOString().split('T')[0],
      end: now.toISOString().split('T')[0],
    };
  }},
];

export default function PayrollSummaryPage() {
  const navigate = useNavigate();
  const [summary, setSummary] = useState([]);
  const [pendingPayouts, setPendingPayouts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [payoutsLoading, setPayoutsLoading] = useState(true);
  const [error, setError] = useState(null);
  const [selectedPreset, setSelectedPreset] = useState(0);

  const defaultDates = PAYROLL_PRESETS[0].getValue();
  const [periodStart, setPeriodStart] = useState(defaultDates.start);
  const [periodEnd, setPeriodEnd] = useState(defaultDates.end);

  const fetchPayroll = useCallback(async () => {
    if (!periodStart || !periodEnd) return;
    setLoading(true);
    setError(null);
    try {
      const result = await getPayrollSummary(periodStart, periodEnd);
      if (result.success) {
        setSummary(result.data || []);
      } else {
        setError(result.error || 'Failed to load payroll');
      }
    } catch (err) {
      setError('Failed to load payroll summary');
    } finally {
      setLoading(false);
    }
  }, [periodStart, periodEnd]);

  const fetchPendingPayouts = useCallback(async () => {
    setPayoutsLoading(true);
    try {
      const result = await getPendingPayouts();
      if (result.success) {
        setPendingPayouts(result.data || []);
      }
    } catch { /* ignore */ }
    finally { setPayoutsLoading(false); }
  }, []);

  useEffect(() => { fetchPayroll(); }, [fetchPayroll]);
  useEffect(() => { fetchPendingPayouts(); }, [fetchPendingPayouts]);

  const handlePresetChange = (index) => {
    setSelectedPreset(index);
    const dates = PAYROLL_PRESETS[index].getValue();
    setPeriodStart(dates.start);
    setPeriodEnd(dates.end);
  };

  const handleCreatePayout = async (rep) => {
    if (!window.confirm(`Create payout for ${rep.repName} (${formatCurrency(rep.grossCommission)})?`)) return;
    try {
      const result = await createPayout({
        repId: rep.repId,
        periodStart,
        periodEnd,
        notes: `Payroll for ${periodStart} to ${periodEnd}`,
      });
      if (result.success) {
        alert('Payout created successfully');
        fetchPendingPayouts();
      } else {
        alert(result.error || 'Failed to create payout');
      }
    } catch {
      alert('Failed to create payout');
    }
  };

  const handleApprovePayout = async (payoutId) => {
    try {
      const result = await approvePayout(payoutId);
      if (result.success) {
        fetchPendingPayouts();
      } else {
        alert(result.error || 'Failed to approve payout');
      }
    } catch {
      alert('Failed to approve payout');
    }
  };

  const handleMarkPaid = async (payoutId) => {
    const ref = prompt('Enter payment reference (optional):');
    if (ref === null) return;
    try {
      const result = await markPayoutPaid(payoutId, ref);
      if (result.success) {
        fetchPendingPayouts();
      } else {
        alert(result.error || 'Failed to mark as paid');
      }
    } catch {
      alert('Failed to mark as paid');
    }
  };

  const handleExport = async () => {
    await exportCommissionsCSV({ startDate: periodStart, endDate: periodEnd });
  };

  // Totals
  const totals = summary.reduce((acc, row) => ({
    grossCommission: acc.grossCommission + (row.grossCommission || 0),
    totalSales: acc.totalSales + (row.totalSales || 0),
    orderCount: acc.orderCount + (row.orderCount || 0),
  }), { grossCommission: 0, totalSales: 0, orderCount: 0 });

  return (
    <div className="min-h-screen bg-slate-50">
      {/* Header */}
      <header className="bg-white border-b border-slate-200 sticky top-0 z-10">
        <div className="max-w-7xl mx-auto px-4 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              <button
                onClick={() => navigate('/')}
                className="p-2 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded-lg transition-colors"
              >
                <ArrowLeft className="w-5 h-5" />
              </button>
              <div className="flex items-center gap-3">
                <div className="p-2 bg-green-100 rounded-lg">
                  <Banknote className="w-6 h-6 text-green-600" />
                </div>
                <div>
                  <h1 className="text-xl font-bold text-slate-900">Payroll Summary</h1>
                  <p className="text-sm text-slate-500">Review commissions and manage payouts</p>
                </div>
              </div>
            </div>
            <div className="flex items-center gap-3">
              <button
                onClick={fetchPayroll}
                disabled={loading}
                className="flex items-center gap-2 px-4 py-2 text-slate-600 hover:text-slate-900 hover:bg-slate-100 rounded-lg transition-colors"
              >
                <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
                Refresh
              </button>
              <button
                onClick={handleExport}
                className="flex items-center gap-2 px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors"
              >
                <Download className="w-4 h-4" />
                Export CSV
              </button>
            </div>
          </div>
        </div>
      </header>

      {/* Date Range */}
      <div className="bg-white border-b border-slate-200">
        <div className="max-w-7xl mx-auto px-4 py-3">
          <div className="flex items-center gap-4 flex-wrap">
            <Calendar className="w-5 h-5 text-slate-400" />
            <div className="flex items-center gap-1 p-1 bg-slate-100 rounded-lg">
              {PAYROLL_PRESETS.map((preset, index) => (
                <button
                  key={preset.label}
                  onClick={() => handlePresetChange(index)}
                  className={`px-3 py-1.5 text-sm rounded-md transition-colors ${
                    selectedPreset === index
                      ? 'bg-white text-slate-900 shadow-sm'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  {preset.label}
                </button>
              ))}
            </div>
            <div className="flex items-center gap-2 ml-auto">
              <input
                type="date"
                value={periodStart}
                onChange={(e) => { setPeriodStart(e.target.value); setSelectedPreset(-1); }}
                className="px-3 py-1.5 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
              <span className="text-slate-400">to</span>
              <input
                type="date"
                value={periodEnd}
                onChange={(e) => { setPeriodEnd(e.target.value); setSelectedPreset(-1); }}
                className="px-3 py-1.5 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
          </div>
        </div>
      </div>

      <main className="max-w-7xl mx-auto px-4 py-6 space-y-6">
        {/* Summary Cards */}
        {!loading && summary.length > 0 && (
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            <div className="bg-white rounded-xl border border-slate-200 p-5">
              <div className="text-sm text-slate-500 mb-1">Total Commission</div>
              <div className="text-2xl font-bold text-green-600">{formatCurrency(totals.grossCommission)}</div>
            </div>
            <div className="bg-white rounded-xl border border-slate-200 p-5">
              <div className="text-sm text-slate-500 mb-1">Total Sales</div>
              <div className="text-2xl font-bold text-slate-900">{formatCurrency(totals.totalSales)}</div>
            </div>
            <div className="bg-white rounded-xl border border-slate-200 p-5">
              <div className="text-sm text-slate-500 mb-1">Total Orders</div>
              <div className="text-2xl font-bold text-blue-600">{totals.orderCount}</div>
            </div>
            <div className="bg-white rounded-xl border border-slate-200 p-5">
              <div className="text-sm text-slate-500 mb-1">Effective Rate</div>
              <div className="text-2xl font-bold text-purple-600">
                {totals.totalSales > 0 ? `${((totals.grossCommission / totals.totalSales) * 100).toFixed(2)}%` : '0%'}
              </div>
            </div>
          </div>
        )}

        {/* Payroll Table */}
        {error ? (
          <div className="bg-red-50 border border-red-200 rounded-xl p-6 text-center">
            <p className="text-red-600">{error}</p>
            <button onClick={fetchPayroll} className="mt-3 text-sm text-red-600 hover:underline">Try again</button>
          </div>
        ) : (
          <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
            <div className="px-4 py-3 border-b border-slate-200 bg-slate-50">
              <h2 className="text-sm font-semibold text-slate-700">Commission by Sales Rep</h2>
            </div>

            {loading ? (
              <div className="p-8 text-center">
                <div className="w-8 h-8 border-2 border-slate-300 border-t-blue-500 rounded-full animate-spin mx-auto mb-3" />
                <p className="text-sm text-slate-500">Loading payroll data...</p>
              </div>
            ) : summary.length === 0 ? (
              <div className="p-12 text-center">
                <p className="text-slate-500">No commission data for this period</p>
              </div>
            ) : (
              <table className="w-full">
                <thead>
                  <tr className="text-xs font-medium text-slate-500 uppercase tracking-wider border-b border-slate-200">
                    <th className="text-left px-4 py-3">Sales Rep</th>
                    <th className="text-left px-4 py-3">Email</th>
                    <th className="text-right px-4 py-3">Orders</th>
                    <th className="text-right px-4 py-3">Total Sales</th>
                    <th className="text-right px-4 py-3">Commission</th>
                    <th className="text-right px-4 py-3">Rate</th>
                    <th className="text-center px-4 py-3">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {summary.map(row => (
                    <tr key={row.repId} className="hover:bg-slate-50 transition-colors">
                      <td className="px-4 py-3 font-medium text-slate-900">{row.repName}</td>
                      <td className="px-4 py-3 text-sm text-slate-500">{row.email}</td>
                      <td className="px-4 py-3 text-right text-sm">{row.orderCount}</td>
                      <td className="px-4 py-3 text-right text-sm">{formatCurrency(row.totalSales)}</td>
                      <td className="px-4 py-3 text-right font-semibold text-green-600">{formatCurrency(row.grossCommission)}</td>
                      <td className="px-4 py-3 text-right text-sm text-slate-500">
                        {row.totalSales > 0 ? `${((row.grossCommission / row.totalSales) * 100).toFixed(1)}%` : '0%'}
                      </td>
                      <td className="px-4 py-3 text-center">
                        <button
                          onClick={() => handleCreatePayout(row)}
                          className="text-xs font-medium text-blue-600 hover:text-blue-800 hover:underline"
                        >
                          Create Payout
                        </button>
                      </td>
                    </tr>
                  ))}
                  {summary.length > 1 && (
                    <tr className="bg-slate-50 font-semibold border-t-2 border-slate-200">
                      <td className="px-4 py-3 text-slate-900">Totals</td>
                      <td className="px-4 py-3"></td>
                      <td className="px-4 py-3 text-right">{totals.orderCount}</td>
                      <td className="px-4 py-3 text-right">{formatCurrency(totals.totalSales)}</td>
                      <td className="px-4 py-3 text-right text-green-600">{formatCurrency(totals.grossCommission)}</td>
                      <td className="px-4 py-3 text-right text-sm">
                        {totals.totalSales > 0 ? `${((totals.grossCommission / totals.totalSales) * 100).toFixed(1)}%` : '0%'}
                      </td>
                      <td className="px-4 py-3"></td>
                    </tr>
                  )}
                </tbody>
              </table>
            )}
          </div>
        )}

        {/* Pending Payouts */}
        <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
          <div className="px-4 py-3 border-b border-slate-200 bg-slate-50 flex items-center justify-between">
            <h2 className="text-sm font-semibold text-slate-700">Pending Payouts</h2>
            <button
              onClick={fetchPendingPayouts}
              className="text-xs text-slate-500 hover:text-slate-700"
            >
              Refresh
            </button>
          </div>

          {payoutsLoading ? (
            <div className="p-6 text-center text-sm text-slate-500">Loading payouts...</div>
          ) : pendingPayouts.length === 0 ? (
            <div className="p-8 text-center text-sm text-slate-500">No pending payouts</div>
          ) : (
            <div className="divide-y divide-slate-100">
              {pendingPayouts.map(payout => (
                <div key={payout.id} className="flex items-center justify-between px-4 py-3 hover:bg-slate-50">
                  <div>
                    <div className="font-medium text-slate-900">
                      {payout.rep_name || `Rep #${payout.rep_id}`}
                    </div>
                    <div className="text-xs text-slate-500">
                      {payout.period_start} to {payout.period_end}
                    </div>
                  </div>
                  <div className="text-right">
                    <div className="font-semibold text-green-600">
                      {formatCurrency(payout.net_amount_cents ? payout.net_amount_cents / 100 : payout.gross_commission_cents / 100)}
                    </div>
                    <div className="flex items-center gap-1 text-xs text-slate-500">
                      <Clock className="w-3 h-3" />
                      {payout.status}
                    </div>
                  </div>
                  <div className="flex items-center gap-2 ml-4">
                    {payout.status === 'pending' && (
                      <button
                        onClick={() => handleApprovePayout(payout.id)}
                        className="flex items-center gap-1 px-3 py-1.5 text-xs font-medium bg-blue-50 text-blue-700 rounded-lg hover:bg-blue-100 transition-colors"
                      >
                        <Check className="w-3 h-3" />
                        Approve
                      </button>
                    )}
                    {payout.status === 'approved' && (
                      <button
                        onClick={() => handleMarkPaid(payout.id)}
                        className="flex items-center gap-1 px-3 py-1.5 text-xs font-medium bg-green-50 text-green-700 rounded-lg hover:bg-green-100 transition-colors"
                      >
                        <Banknote className="w-3 h-3" />
                        Mark Paid
                      </button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </main>
    </div>
  );
}
