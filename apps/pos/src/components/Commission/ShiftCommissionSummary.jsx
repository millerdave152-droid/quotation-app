/**
 * TeleTime POS - Shift Commission Summary
 * Shows commission summary modal on logout / shift close
 */

import { useState, useEffect } from 'react';
import { getCommissionSummary } from '../../api/commissions';

const formatCents = (cents) => `$${(Math.abs(cents || 0) / 100).toFixed(2)}`;

export default function ShiftCommissionSummary({ isOpen, onClose, onViewDetails }) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    if (!isOpen) return;
    setLoading(true);
    setError(null);

    getCommissionSummary()
      .then((result) => {
        if (result.success) {
          setData(result.data);
        } else {
          setError('Failed to load commission data');
        }
      })
      .catch((err) => {
        setError(err.message || 'Failed to load commission data');
      })
      .finally(() => setLoading(false));
  }, [isOpen]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-[60] p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md overflow-hidden">
        {/* Header */}
        <div className="bg-gradient-to-r from-blue-600 to-indigo-600 px-6 py-5 text-white">
          <h2 className="text-lg font-bold">Your Commission Summary</h2>
          <p className="text-blue-100 text-sm mt-0.5">End of shift overview</p>
        </div>

        {/* Content */}
        <div className="px-6 py-5">
          {loading && (
            <div className="flex items-center justify-center py-12">
              <div className="w-8 h-8 border-3 border-blue-600 border-t-transparent rounded-full animate-spin" />
            </div>
          )}

          {error && (
            <div className="bg-amber-50 border border-amber-200 rounded-lg p-4 text-amber-700 text-sm">
              <p className="font-medium">Commission data unavailable</p>
              <p className="mt-1 text-amber-600 text-xs">You can still close your shift normally.</p>
            </div>
          )}

          {data && !loading && (
            <div className="space-y-5">
              {/* Today */}
              <div>
                <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-3">Today</h3>
                <div className="grid grid-cols-3 gap-3">
                  <StatCard
                    label="Sales"
                    value={data.today.salesCount}
                    color="text-gray-900"
                  />
                  <StatCard
                    label="Revenue"
                    value={formatCents(data.today.totalSalesCents)}
                    color="text-gray-900"
                  />
                  <StatCard
                    label="Commission"
                    value={formatCents(data.today.commissionCents)}
                    color="text-green-600"
                    highlight
                  />
                </div>
              </div>

              {/* Divider */}
              <div className="border-t border-gray-100" />

              {/* Pay Period */}
              <div>
                <div className="flex items-center justify-between mb-3">
                  <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wider">Pay Period</h3>
                  <span className="text-xs text-gray-400">
                    {formatDate(data.payPeriod.startDate)} — {formatDate(data.payPeriod.endDate)}
                  </span>
                </div>
                <div className="grid grid-cols-3 gap-3">
                  <StatCard
                    label="Sales"
                    value={data.payPeriod.salesCount}
                    color="text-gray-900"
                  />
                  <StatCard
                    label="Revenue"
                    value={formatCents(data.payPeriod.totalSalesCents)}
                    color="text-gray-900"
                  />
                  <StatCard
                    label="Commission"
                    value={formatCents(data.payPeriod.commissionCents)}
                    color="text-green-600"
                    highlight
                  />
                </div>
              </div>

              {/* Target Progress */}
              {data.targetProgress && (
                <>
                  <div className="border-t border-gray-100" />
                  <div>
                    <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-3">Monthly Target</h3>
                    <div className="flex items-center justify-between text-sm mb-2">
                      <span className="text-gray-600">
                        ${data.targetProgress.earnedDollars.toFixed(2)} of ${data.targetProgress.targetDollars.toFixed(2)}
                      </span>
                      <span className="font-bold text-blue-600">{data.targetProgress.percent}%</span>
                    </div>
                    <div className="w-full bg-gray-200 rounded-full h-2.5">
                      <div
                        className="bg-blue-600 h-2.5 rounded-full transition-all"
                        style={{ width: `${Math.min(100, data.targetProgress.percent)}%` }}
                      />
                    </div>
                  </div>
                </>
              )}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-6 py-4 bg-gray-50 border-t border-gray-100 flex items-center justify-between">
          {onViewDetails && (
            <button
              type="button"
              onClick={onViewDetails}
              className="text-sm font-medium text-blue-600 hover:text-blue-700"
            >
              View Full Report
            </button>
          )}
          {!onViewDetails && <div />}
          <button
            type="button"
            onClick={onClose}
            className="px-5 py-2 bg-gray-900 hover:bg-gray-800 text-white text-sm font-medium rounded-lg transition-colors"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
}

function StatCard({ label, value, color = 'text-gray-900', highlight = false }) {
  return (
    <div className={`rounded-lg p-3 text-center ${highlight ? 'bg-green-50 border border-green-100' : 'bg-gray-50'}`}>
      <div className={`text-lg font-bold ${color}`}>{value}</div>
      <div className="text-xs text-gray-500 mt-0.5">{label}</div>
    </div>
  );
}

function formatDate(dateStr) {
  if (!dateStr) return '';
  const d = new Date(dateStr + 'T00:00:00');
  return d.toLocaleDateString('en-CA', { month: 'short', day: 'numeric' });
}
