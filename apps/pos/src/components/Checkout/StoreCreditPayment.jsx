/**
 * TeleTime POS - Store Credit / Gift Card Payment
 * Lookup code, validate balance, allow partial redemption, complete payment
 */

import { useState, useCallback } from 'react';
import { formatCurrency } from '../../utils/formatters';
import { lookupStoreCredit } from '../../api/storeCredits';

export default function StoreCreditPayment({ amountDue, onComplete, onBack, isPartial }) {
  const [code, setCode] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [credit, setCredit] = useState(null);
  const [customAmount, setCustomAmount] = useState('');
  const [useCustom, setUseCustom] = useState(false);

  const amountDueCents = Math.round(amountDue * 100);
  const balanceCents = credit ? (credit.currentBalanceCents ?? credit.current_balance ?? 0) : 0;
  const balanceDollars = balanceCents / 100;
  const maxApply = credit ? Math.min(balanceCents, amountDueCents) / 100 : 0;

  const applyAmount = useCustom && customAmount
    ? Math.min(Math.max(parseFloat(customAmount) || 0, 0), maxApply)
    : maxApply;

  const handleLookup = useCallback(async () => {
    if (!code.trim()) return;
    setLoading(true);
    setError(null);
    setCredit(null);
    setUseCustom(false);
    setCustomAmount('');

    const result = await lookupStoreCredit(code.trim());
    setLoading(false);

    if (result.success) {
      const d = result.data;
      if (d.status !== 'active') {
        setError(`This credit is ${d.status}`);
      } else if ((d.currentBalanceCents ?? d.current_balance ?? 0) <= 0) {
        setError('No remaining balance on this credit');
      } else {
        setCredit(d);
      }
    } else {
      setError(result.error || 'Store credit not found');
    }
  }, [code]);

  const handleApply = useCallback(() => {
    if (!credit || applyAmount <= 0) return;
    const applyCents = Math.round(applyAmount * 100);
    onComplete({
      paymentMethod: 'store_credit',
      amount: applyAmount,
      storeCreditCode: credit.code,
      storeCreditId: credit.id,
      storeCreditAmountCents: applyCents,
      storeCreditRemainingCents: balanceCents - applyCents,
    });
  }, [credit, applyAmount, onComplete]);

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="text-center mb-6">
        <h2 className="text-2xl font-bold text-gray-900 mb-1">Store Credit / Gift Card</h2>
        <p className="text-sm text-gray-500">
          {isPartial ? 'Remaining balance' : 'Amount due'}
        </p>
        <p className="text-4xl font-bold text-gray-900 tabular-nums mt-1">
          {formatCurrency(amountDue)}
        </p>
      </div>

      {/* Code Input */}
      <div className="flex gap-3 mb-4">
        <input
          type="text"
          value={code}
          onChange={(e) => setCode(e.target.value.toUpperCase())}
          onKeyDown={(e) => e.key === 'Enter' && handleLookup()}
          placeholder="Enter code (SC-XXXXX)"
          className="flex-1 border border-gray-300 rounded-xl px-4 py-3 text-lg font-mono tracking-wider focus:outline-none focus:ring-2 focus:ring-purple-500 focus:border-transparent"
          autoFocus
        />
        <button
          type="button"
          onClick={handleLookup}
          disabled={loading || !code.trim()}
          className="px-6 py-3 bg-purple-600 hover:bg-purple-700 disabled:opacity-50 disabled:cursor-not-allowed text-white font-semibold rounded-xl transition-colors"
        >
          {loading ? 'Checking...' : 'Apply'}
        </button>
      </div>

      {/* Error */}
      {error && (
        <div className="mb-4 p-4 bg-red-50 border border-red-200 rounded-lg">
          <p className="text-sm text-red-700">{error}</p>
        </div>
      )}

      {/* Credit Details */}
      {credit && (
        <div className="bg-purple-50 border border-purple-200 rounded-xl p-5 mb-4 space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-lg font-mono font-bold text-purple-900">{credit.code}</p>
              {(credit.customerName || credit.customer_name) && (
                <p className="text-xs text-purple-600">Issued to: {credit.customerName || credit.customer_name}</p>
              )}
            </div>
            <div className="text-right">
              <p className="text-2xl font-bold text-purple-700">{formatCurrency(balanceDollars)}</p>
              <p className="text-xs text-purple-500">available balance</p>
            </div>
          </div>

          {(credit.expiryDate || credit.expiry_date) && (
            <p className="text-xs text-purple-500">
              Expires: {new Date(credit.expiryDate || credit.expiry_date).toLocaleDateString('en-CA')}
            </p>
          )}

          {/* Partial redemption toggle */}
          {balanceCents > amountDueCents ? (
            <div className="p-3 bg-green-50 border border-green-200 rounded-lg">
              <p className="text-sm text-green-800">
                Credit covers the full amount. <strong>{formatCurrency(balanceDollars - maxApply)}</strong> will remain on the credit after this transaction.
              </p>
            </div>
          ) : (
            <div className="space-y-3">
              <div className="flex items-center gap-3">
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="radio"
                    checked={!useCustom}
                    onChange={() => { setUseCustom(false); setCustomAmount(''); }}
                    className="text-purple-600 focus:ring-purple-500"
                  />
                  <span className="text-sm text-gray-700">
                    Apply full balance ({formatCurrency(balanceDollars)})
                  </span>
                </label>
              </div>
              <div className="flex items-center gap-3">
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="radio"
                    checked={useCustom}
                    onChange={() => setUseCustom(true)}
                    className="text-purple-600 focus:ring-purple-500"
                  />
                  <span className="text-sm text-gray-700">Custom amount</span>
                </label>
                {useCustom && (
                  <div className="relative flex-1 max-w-[160px]">
                    <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400">$</span>
                    <input
                      type="number"
                      step="0.01"
                      min="0.01"
                      max={maxApply}
                      value={customAmount}
                      onChange={(e) => setCustomAmount(e.target.value)}
                      className="w-full pl-7 pr-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-purple-500"
                      placeholder={maxApply.toFixed(2)}
                      autoFocus
                    />
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Apply summary */}
          <div className="pt-3 border-t border-purple-200">
            <div className="flex justify-between items-center">
              <span className="text-sm font-medium text-gray-700">Amount to apply</span>
              <span className="text-xl font-bold text-purple-700 tabular-nums">
                {formatCurrency(applyAmount)}
              </span>
            </div>
            {applyAmount < amountDue && (
              <p className="text-xs text-gray-500 mt-1">
                Remaining {formatCurrency(amountDue - applyAmount)} can be paid with another method
              </p>
            )}
          </div>
        </div>
      )}

      {/* Action buttons */}
      <div className="mt-auto space-y-3">
        {credit && (
          <button
            type="button"
            onClick={handleApply}
            disabled={applyAmount <= 0}
            className="w-full py-4 bg-purple-600 hover:bg-purple-700 text-white text-lg font-semibold rounded-xl transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            Apply {formatCurrency(applyAmount)} Store Credit
          </button>
        )}

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
