/**
 * TeleTime POS - Loyalty Points Redemption Component
 * Auto-fetches customer point balance, lets cashier apply points to order.
 *
 * Integration status: POS-side ready. Requires Hub loyalty API endpoints:
 *   GET  /api/customers/:id/loyalty
 *   POST /api/customers/:id/loyalty/redeem
 */

import { useState, useEffect, useCallback, useMemo } from 'react';
import { formatCurrency } from '../../utils/formatters';
import { getLoyaltyBalance, POINTS_PER_DOLLAR } from '../../api/loyalty';

const TIER_LABELS = {
  none: null,
  bronze: { label: 'Bronze', color: 'text-amber-700 bg-amber-100' },
  silver: { label: 'Silver', color: 'text-gray-600 bg-gray-200' },
  gold: { label: 'Gold', color: 'text-yellow-700 bg-yellow-100' },
  platinum: { label: 'Platinum', color: 'text-purple-700 bg-purple-100' },
};

function pointsToDollars(points, rate = POINTS_PER_DOLLAR) {
  return points / rate;
}
function dollarsToPoints(dollars, rate = POINTS_PER_DOLLAR) {
  return Math.round(dollars * rate);
}

export function LoyaltyRedemption({ amountDue, onComplete, onBack, isPartial, customer }) {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [loyalty, setLoyalty] = useState(null);
  const [useCustom, setUseCustom] = useState(false);
  const [customPoints, setCustomPoints] = useState('');

  const customerId = customer?.customerId || customer?.customer_id || customer?.id;
  const rate = loyalty?.pointsPerDollar || POINTS_PER_DOLLAR;

  // Fetch loyalty balance on mount
  useEffect(() => {
    if (!customerId) {
      setLoading(false);
      setError('No customer selected');
      return;
    }
    let cancelled = false;
    (async () => {
      setLoading(true);
      setError(null);
      const result = await getLoyaltyBalance(customerId);
      if (cancelled) return;
      if (result.success) {
        setLoyalty(result.data);
      } else {
        setError(result.error || 'Failed to load loyalty balance');
      }
      setLoading(false);
    })();
    return () => { cancelled = true; };
  }, [customerId]);

  const availablePoints = loyalty?.pointsBalance ?? 0;
  const availableDollars = pointsToDollars(availablePoints, rate);
  const maxApplyDollars = Math.min(availableDollars, amountDue);
  const maxApplyPoints = dollarsToPoints(maxApplyDollars, rate);

  const redeemPoints = useMemo(() => {
    if (useCustom && customPoints) {
      const pts = parseInt(customPoints, 10) || 0;
      return Math.min(Math.max(pts, 0), maxApplyPoints);
    }
    return maxApplyPoints;
  }, [useCustom, customPoints, maxApplyPoints]);

  const redeemDollars = pointsToDollars(redeemPoints, rate);

  const handleApply = useCallback(() => {
    if (redeemPoints <= 0) return;
    onComplete({
      paymentMethod: 'loyalty_points',
      amount: redeemDollars,
      loyaltyPointsUsed: redeemPoints,
      loyaltyCustomerId: customerId,
      loyaltyRate: rate,
    });
  }, [onComplete, redeemPoints, redeemDollars, customerId, rate]);

  // Loading state
  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-center">
          <div className="w-10 h-10 border-4 border-rose-500 border-t-transparent rounded-full animate-spin mx-auto mb-3" />
          <p className="text-sm text-gray-500">Loading loyalty balance...</p>
        </div>
      </div>
    );
  }

  // No customer
  if (!customerId) {
    return (
      <div className="text-center py-12">
        <p className="text-gray-500 mb-4">A customer must be selected to use loyalty points.</p>
        <button type="button" onClick={onBack} className="text-sm text-blue-600 hover:underline">
          Back to Payment Methods
        </button>
      </div>
    );
  }

  // Error (API not available yet, etc.)
  if (error && !loyalty) {
    return (
      <div className="text-center py-12">
        <p className="text-red-600 mb-4">{error}</p>
        <button type="button" onClick={onBack} className="text-sm text-blue-600 hover:underline">
          Back to Payment Methods
        </button>
      </div>
    );
  }

  // Mock/unavailable indicator
  const isMock = loyalty?._mock;

  // No points
  if (availablePoints <= 0) {
    return (
      <div className="flex flex-col h-full">
        <div className="text-center mb-6">
          <h2 className="text-2xl font-bold text-gray-900 mb-1">Loyalty Points</h2>
          <p className="text-sm text-gray-500">
            {customer?.customerName || customer?.name || 'Customer'}
          </p>
        </div>

        <div className="bg-gray-50 border border-gray-200 rounded-xl p-8 text-center mb-6">
          <p className="text-4xl font-bold text-gray-300 mb-2">0</p>
          <p className="text-sm text-gray-400">points available</p>
          {isMock && (
            <p className="text-xs text-amber-500 mt-3">
              Loyalty system is not yet active.
            </p>
          )}
        </div>

        <div className="mt-auto">
          <button
            type="button"
            onClick={onBack}
            className="w-full py-3 text-sm font-medium text-gray-500 hover:text-gray-700 transition-colors"
          >
            Back to Payment Methods
          </button>
        </div>
      </div>
    );
  }

  const tier = TIER_LABELS[loyalty?.tier] || null;

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="text-center mb-6">
        <h2 className="text-2xl font-bold text-gray-900 mb-1">Loyalty Points</h2>
        <p className="text-sm text-gray-500">
          {isPartial ? 'Remaining balance' : 'Amount due'}
        </p>
        <p className="text-4xl font-bold text-gray-900 tabular-nums mt-1">
          {formatCurrency(amountDue)}
        </p>
      </div>

      {/* Balance card */}
      <div className="bg-rose-50 border border-rose-200 rounded-xl p-5 mb-4">
        <div className="flex items-center justify-between mb-3">
          <div>
            <p className="text-sm font-medium text-gray-700">
              {customer?.customerName || customer?.name}
            </p>
            {tier && (
              <span className={`inline-block mt-1 px-2 py-0.5 text-xs font-semibold rounded-full ${tier.color}`}>
                {tier.label} Member
              </span>
            )}
          </div>
          <div className="text-right">
            <p className="text-3xl font-bold text-rose-600">{availablePoints.toLocaleString()}</p>
            <p className="text-xs text-rose-400">points available</p>
          </div>
        </div>

        <div className="pt-3 border-t border-rose-200">
          <div className="flex justify-between text-sm">
            <span className="text-gray-600">Point value</span>
            <span className="font-medium text-gray-900">
              {availablePoints.toLocaleString()} pts = {formatCurrency(availableDollars)}
            </span>
          </div>
          <p className="text-xs text-rose-400 mt-1">{rate} points = $1.00</p>
        </div>

        {isMock && (
          <div className="mt-3 p-2 bg-amber-50 border border-amber-200 rounded-lg">
            <p className="text-xs text-amber-600">{loyalty._message}</p>
          </div>
        )}
      </div>

      {/* Redemption selector */}
      <div className="bg-white border border-gray-200 rounded-xl p-5 mb-4 space-y-3">
        <p className="text-sm font-medium text-gray-700 mb-2">Points to Redeem</p>

        {/* Full balance option */}
        <label className="flex items-center gap-3 cursor-pointer">
          <input
            type="radio"
            checked={!useCustom}
            onChange={() => { setUseCustom(false); setCustomPoints(''); }}
            className="text-rose-600 focus:ring-rose-500"
          />
          <div className="flex-1 flex justify-between">
            <span className="text-sm text-gray-700">
              {maxApplyPoints === availablePoints ? 'All points' : `Max applicable`}
            </span>
            <span className="text-sm font-medium text-gray-900">
              {maxApplyPoints.toLocaleString()} pts ({formatCurrency(maxApplyDollars)})
            </span>
          </div>
        </label>

        {/* Custom amount option */}
        <label className="flex items-center gap-3 cursor-pointer">
          <input
            type="radio"
            checked={useCustom}
            onChange={() => setUseCustom(true)}
            className="text-rose-600 focus:ring-rose-500"
          />
          <span className="text-sm text-gray-700">Custom amount</span>
        </label>

        {useCustom && (
          <div className="ml-7 flex items-center gap-3">
            <div className="relative flex-1 max-w-[180px]">
              <input
                type="number"
                min="1"
                max={maxApplyPoints}
                step="1"
                value={customPoints}
                onChange={(e) => setCustomPoints(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-rose-500"
                placeholder={`1 – ${maxApplyPoints}`}
                autoFocus
              />
            </div>
            <span className="text-sm text-gray-500">
              pts = {formatCurrency(redeemDollars)}
            </span>
          </div>
        )}
      </div>

      {/* Summary */}
      {redeemPoints > 0 && (
        <div className="bg-green-50 border border-green-200 rounded-lg p-4 mb-4">
          <div className="flex justify-between items-center">
            <span className="text-sm font-medium text-gray-700">Redeeming</span>
            <div className="text-right">
              <span className="text-lg font-bold text-green-700">{formatCurrency(redeemDollars)}</span>
              <p className="text-xs text-green-600">{redeemPoints.toLocaleString()} points</p>
            </div>
          </div>
          {redeemDollars < amountDue && (
            <p className="text-xs text-gray-500 mt-2">
              Remaining {formatCurrency(amountDue - redeemDollars)} can be paid with another method
            </p>
          )}
          <p className="text-xs text-gray-400 mt-1">
            Points remaining after: {(availablePoints - redeemPoints).toLocaleString()}
          </p>
        </div>
      )}

      {error && (
        <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg">
          <p className="text-sm text-red-700">{error}</p>
        </div>
      )}

      {/* Actions */}
      <div className="mt-auto space-y-3">
        <button
          type="button"
          onClick={handleApply}
          disabled={redeemPoints <= 0 || isMock}
          className="w-full py-4 bg-rose-600 hover:bg-rose-700 text-white text-lg font-semibold rounded-xl transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {isMock
            ? 'Loyalty System Not Active Yet'
            : `Apply ${redeemPoints.toLocaleString()} Points (${formatCurrency(redeemDollars)})`
          }
        </button>

        <button
          type="button"
          onClick={onBack}
          className="w-full py-3 text-sm font-medium text-gray-500 hover:text-gray-700 transition-colors"
        >
          Back to Payment Methods
        </button>
      </div>
    </div>
  );
}

export default LoyaltyRedemption;
