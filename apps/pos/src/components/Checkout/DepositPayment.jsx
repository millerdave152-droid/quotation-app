/**
 * TeleTime POS - Deposit / Partial Payment Component
 * Allows collecting a deposit (25%, 50%, custom) on an order
 * Order remains with outstanding balance to be collected later
 */

import { useState, useCallback, useMemo } from 'react';
import { formatCurrency } from '../../utils/formatters';

const DEPOSIT_PRESETS = [
  { label: '25%', factor: 0.25 },
  { label: '50%', factor: 0.50 },
  { label: '75%', factor: 0.75 },
];

export function DepositPayment({ amountDue, onComplete, onBack, onSelectMethod }) {
  const [selectedPreset, setSelectedPreset] = useState(null);
  const [customAmount, setCustomAmount] = useState('');
  const [useCustom, setUseCustom] = useState(false);
  const [paymentStep, setPaymentStep] = useState('amount'); // 'amount' or 'method'

  const depositAmount = useMemo(() => {
    if (useCustom && customAmount) {
      const val = parseFloat(customAmount);
      if (!isNaN(val) && val > 0 && val < amountDue) return Math.round(val * 100) / 100;
      return 0;
    }
    if (selectedPreset !== null) {
      return Math.round(amountDue * DEPOSIT_PRESETS[selectedPreset].factor * 100) / 100;
    }
    return 0;
  }, [useCustom, customAmount, selectedPreset, amountDue]);

  const remainingAfterDeposit = amountDue - depositAmount;

  const handlePresetClick = useCallback((index) => {
    setSelectedPreset(index);
    setUseCustom(false);
    setCustomAmount('');
  }, []);

  const handleCustomToggle = useCallback(() => {
    setUseCustom(true);
    setSelectedPreset(null);
  }, []);

  const handleContinueToPayment = useCallback(() => {
    if (depositAmount <= 0) return;
    setPaymentStep('method');
  }, [depositAmount]);

  // When a payment method is selected for the deposit, create the deposit payment
  const handleMethodSelect = useCallback((method) => {
    onComplete({
      paymentMethod: method,
      amount: depositAmount,
      isDeposit: true,
      depositTotal: amountDue,
      balanceDue: remainingAfterDeposit,
    });
  }, [onComplete, depositAmount, amountDue, remainingAfterDeposit]);

  if (paymentStep === 'method') {
    return (
      <div className="flex flex-col h-full">
        <div className="text-center mb-6">
          <h2 className="text-2xl font-bold text-gray-900 mb-1">Collect Deposit</h2>
          <p className="text-sm text-gray-500">Select how to collect the deposit</p>
          <p className="text-4xl font-bold text-amber-600 tabular-nums mt-2">
            {formatCurrency(depositAmount)}
          </p>
        </div>

        <div className="bg-amber-50 border border-amber-200 rounded-lg p-4 mb-6">
          <div className="flex justify-between text-sm mb-1">
            <span className="text-gray-600">Order Total</span>
            <span className="font-medium">{formatCurrency(amountDue)}</span>
          </div>
          <div className="flex justify-between text-sm mb-1">
            <span className="text-gray-600">Deposit</span>
            <span className="font-medium text-amber-700">{formatCurrency(depositAmount)}</span>
          </div>
          <div className="flex justify-between text-sm pt-2 border-t border-amber-200">
            <span className="font-medium text-gray-700">Balance Due Later</span>
            <span className="font-bold text-gray-900">{formatCurrency(remainingAfterDeposit)}</span>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3 mb-6">
          <button
            type="button"
            onClick={() => handleMethodSelect('cash')}
            className="flex flex-col items-center p-5 border-2 rounded-xl bg-green-50 hover:bg-green-100 text-green-700 border-green-200 transition-colors"
          >
            <span className="text-lg font-semibold">Cash</span>
          </button>
          <button
            type="button"
            onClick={() => handleMethodSelect('credit')}
            className="flex flex-col items-center p-5 border-2 rounded-xl bg-blue-50 hover:bg-blue-100 text-blue-700 border-blue-200 transition-colors"
          >
            <span className="text-lg font-semibold">Card</span>
          </button>
          <button
            type="button"
            onClick={() => handleMethodSelect('debit')}
            className="flex flex-col items-center p-5 border-2 rounded-xl bg-blue-50 hover:bg-blue-100 text-blue-700 border-blue-200 transition-colors"
          >
            <span className="text-lg font-semibold">Debit</span>
          </button>
          <button
            type="button"
            onClick={() => handleMethodSelect('etransfer')}
            className="flex flex-col items-center p-5 border-2 rounded-xl bg-indigo-50 hover:bg-indigo-100 text-indigo-700 border-indigo-200 transition-colors"
          >
            <span className="text-lg font-semibold">E-Transfer</span>
          </button>
        </div>

        <div className="mt-auto">
          <button
            type="button"
            onClick={() => setPaymentStep('amount')}
            className="w-full py-3 text-sm font-medium text-gray-500 hover:text-gray-700 transition-colors"
          >
            Back to Deposit Amount
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="text-center mb-6">
        <h2 className="text-2xl font-bold text-gray-900 mb-1">Deposit Payment</h2>
        <p className="text-sm text-gray-500">Collect a deposit — remaining balance due later</p>
        <p className="text-4xl font-bold text-gray-900 tabular-nums mt-2">
          {formatCurrency(amountDue)}
        </p>
        <p className="text-xs text-gray-400 mt-1">Order Total</p>
      </div>

      {/* Preset buttons */}
      <div className="grid grid-cols-3 gap-3 mb-4">
        {DEPOSIT_PRESETS.map((preset, index) => (
          <button
            key={preset.label}
            type="button"
            onClick={() => handlePresetClick(index)}
            className={`
              py-4 rounded-xl border-2 text-center transition-all
              ${selectedPreset === index && !useCustom
                ? 'border-amber-500 bg-amber-50 text-amber-700'
                : 'border-gray-200 bg-gray-50 text-gray-700 hover:border-amber-300 hover:bg-amber-50'
              }
            `}
          >
            <span className="block text-xl font-bold">{preset.label}</span>
            <span className="block text-sm text-gray-500 mt-1">
              {formatCurrency(Math.round(amountDue * preset.factor * 100) / 100)}
            </span>
          </button>
        ))}
      </div>

      {/* Custom amount */}
      <div className="mb-6">
        <button
          type="button"
          onClick={handleCustomToggle}
          className={`
            w-full text-left px-4 py-3 rounded-xl border-2 transition-all
            ${useCustom
              ? 'border-amber-500 bg-amber-50'
              : 'border-gray-200 bg-gray-50 hover:border-amber-300'
            }
          `}
        >
          <span className="text-sm font-medium text-gray-700">Custom Amount</span>
        </button>
        {useCustom && (
          <div className="relative mt-2">
            <span className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400 text-lg">$</span>
            <input
              type="number"
              step="0.01"
              min="0.01"
              max={amountDue - 0.01}
              value={customAmount}
              onChange={(e) => setCustomAmount(e.target.value)}
              className="w-full pl-8 pr-4 py-3 border border-gray-300 rounded-xl text-lg focus:outline-none focus:ring-2 focus:ring-amber-500 focus:border-transparent"
              placeholder="Enter deposit amount"
              autoFocus
            />
          </div>
        )}
      </div>

      {/* Summary */}
      {depositAmount > 0 && (
        <div className="bg-amber-50 border border-amber-200 rounded-xl p-5 mb-6">
          <div className="space-y-2">
            <div className="flex justify-between text-sm">
              <span className="text-gray-600">Deposit Amount</span>
              <span className="font-bold text-amber-700 text-lg">{formatCurrency(depositAmount)}</span>
            </div>
            <div className="flex justify-between text-sm pt-2 border-t border-amber-200">
              <span className="text-gray-600">Outstanding Balance</span>
              <span className="font-medium text-gray-900">{formatCurrency(remainingAfterDeposit)}</span>
            </div>
          </div>
          <p className="text-xs text-amber-600 mt-3">
            Order will be saved as "Deposit Paid" with {formatCurrency(remainingAfterDeposit)} remaining balance.
          </p>
        </div>
      )}

      {/* Action buttons */}
      <div className="mt-auto space-y-3">
        <button
          type="button"
          onClick={handleContinueToPayment}
          disabled={depositAmount <= 0}
          className="w-full py-4 bg-amber-600 hover:bg-amber-700 text-white text-lg font-semibold rounded-xl transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
        >
          Continue — Collect {depositAmount > 0 ? formatCurrency(depositAmount) : 'Deposit'}
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

export default DepositPayment;
