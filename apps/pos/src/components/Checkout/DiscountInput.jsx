/**
 * TeleTime POS - Discount Input Component
 * Allows applying cart-level discounts during checkout
 */

import { useState, useCallback, useMemo } from 'react';
import {
  TagIcon,
  XMarkIcon,
  PercentBadgeIcon,
  CurrencyDollarIcon,
  CheckIcon,
} from '@heroicons/react/24/outline';
import { formatCurrency } from '../../utils/formatters';

/**
 * Common discount reasons
 */
const DISCOUNT_REASONS = [
  { id: 'price_match', label: 'Price Match' },
  { id: 'damaged', label: 'Damaged/Floor Model' },
  { id: 'loyalty', label: 'Loyalty Discount' },
  { id: 'manager', label: 'Manager Override' },
  { id: 'bundle', label: 'Bundle Deal' },
  { id: 'employee', label: 'Employee Discount' },
  { id: 'custom', label: 'Custom' },
];

/**
 * Quick discount percentages
 */
const QUICK_PERCENTAGES = [5, 10, 15, 20, 25];

/**
 * Discount input component
 * @param {object} props
 * @param {number} props.subtotal - Cart subtotal (before discounts)
 * @param {object} props.currentDiscount - Current discount { amount, reason }
 * @param {function} props.onApply - Callback to apply discount (amount, reason)
 * @param {function} props.onClear - Callback to clear discount
 * @param {function} props.onClose - Callback to close the input panel
 */
export function DiscountInput({
  subtotal = 0,
  currentDiscount = { amount: 0, reason: '' },
  onApply,
  onClear,
  onClose,
}) {
  // Input mode: 'dollar' or 'percent'
  const [mode, setMode] = useState('dollar');
  const [inputValue, setInputValue] = useState('');
  const [selectedReason, setSelectedReason] = useState('');
  const [customReason, setCustomReason] = useState('');

  // Calculate discount amount based on mode
  const calculatedDiscount = useMemo(() => {
    const value = parseFloat(inputValue) || 0;
    if (mode === 'percent') {
      return Math.min(subtotal, (subtotal * value) / 100);
    }
    return Math.min(subtotal, value);
  }, [inputValue, mode, subtotal]);

  // Get the reason text
  const reasonText = useMemo(() => {
    if (selectedReason === 'custom') {
      return customReason.trim() || 'Custom Discount';
    }
    const found = DISCOUNT_REASONS.find((r) => r.id === selectedReason);
    return found?.label || '';
  }, [selectedReason, customReason]);

  // Handle apply discount
  const handleApply = useCallback(() => {
    if (calculatedDiscount > 0 && selectedReason) {
      onApply?.(calculatedDiscount, reasonText);
      onClose?.();
    }
  }, [calculatedDiscount, selectedReason, reasonText, onApply, onClose]);

  // Handle clear discount
  const handleClear = useCallback(() => {
    onClear?.();
    setInputValue('');
    setSelectedReason('');
    setCustomReason('');
  }, [onClear]);

  // Handle quick percentage click
  const handleQuickPercent = useCallback((percent) => {
    setMode('percent');
    setInputValue(percent.toString());
  }, []);

  // Check if form is valid
  const isValid = calculatedDiscount > 0 && selectedReason;

  return (
    <div className="bg-white rounded-xl border border-gray-200 shadow-lg p-4">
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <TagIcon className="w-5 h-5 text-blue-600" />
          <h3 className="text-lg font-semibold text-gray-900">Apply Discount</h3>
        </div>
        <button
          type="button"
          onClick={onClose}
          className="w-8 h-8 flex items-center justify-center text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-lg transition-colors"
        >
          <XMarkIcon className="w-5 h-5" />
        </button>
      </div>

      {/* Current Discount Display */}
      {currentDiscount.amount > 0 && (
        <div className="mb-4 p-3 bg-green-50 border border-green-200 rounded-lg flex items-center justify-between">
          <div>
            <p className="text-sm font-medium text-green-800">
              Current Discount: {formatCurrency(currentDiscount.amount)}
            </p>
            {currentDiscount.reason && (
              <p className="text-xs text-green-600">{currentDiscount.reason}</p>
            )}
          </div>
          <button
            type="button"
            onClick={handleClear}
            className="px-3 py-1 text-sm font-medium text-red-600 hover:text-red-700 hover:bg-red-50 rounded transition-colors"
          >
            Remove
          </button>
        </div>
      )}

      {/* Mode Toggle */}
      <div className="flex gap-2 mb-4">
        <button
          type="button"
          onClick={() => setMode('dollar')}
          className={`
            flex-1 h-10 flex items-center justify-center gap-2
            text-sm font-medium rounded-lg
            transition-all duration-150
            ${
              mode === 'dollar'
                ? 'bg-blue-600 text-white'
                : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
            }
          `}
        >
          <CurrencyDollarIcon className="w-4 h-4" />
          Dollar Amount
        </button>
        <button
          type="button"
          onClick={() => setMode('percent')}
          className={`
            flex-1 h-10 flex items-center justify-center gap-2
            text-sm font-medium rounded-lg
            transition-all duration-150
            ${
              mode === 'percent'
                ? 'bg-blue-600 text-white'
                : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
            }
          `}
        >
          <PercentBadgeIcon className="w-4 h-4" />
          Percentage
        </button>
      </div>

      {/* Quick Percentages */}
      {mode === 'percent' && (
        <div className="flex gap-2 mb-4">
          {QUICK_PERCENTAGES.map((percent) => (
            <button
              key={percent}
              type="button"
              onClick={() => handleQuickPercent(percent)}
              className={`
                flex-1 h-9
                text-sm font-medium
                rounded-lg
                transition-all duration-150
                ${
                  inputValue === percent.toString()
                    ? 'bg-blue-100 text-blue-700 border-2 border-blue-500'
                    : 'bg-gray-50 text-gray-700 border border-gray-200 hover:bg-gray-100'
                }
              `}
            >
              {percent}%
            </button>
          ))}
        </div>
      )}

      {/* Amount Input */}
      <div className="mb-4">
        <label className="block text-sm font-medium text-gray-700 mb-1">
          {mode === 'dollar' ? 'Discount Amount' : 'Discount Percentage'}
        </label>
        <div className="relative">
          <span className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-500 text-lg">
            {mode === 'dollar' ? '$' : ''}
          </span>
          <input
            type="number"
            value={inputValue}
            onChange={(e) => setInputValue(e.target.value)}
            placeholder={mode === 'dollar' ? '0.00' : '0'}
            step={mode === 'dollar' ? '0.01' : '1'}
            min="0"
            max={mode === 'percent' ? '100' : subtotal}
            className={`
              w-full h-12
              ${mode === 'dollar' ? 'pl-8' : 'pl-4'} pr-12
              text-xl font-bold text-right
              border-2 border-gray-200 rounded-xl
              focus:border-blue-500 focus:ring-2 focus:ring-blue-100
              transition-colors duration-150
            `}
          />
          <span className="absolute right-4 top-1/2 -translate-y-1/2 text-gray-500 text-lg">
            {mode === 'percent' ? '%' : ''}
          </span>
        </div>
        {calculatedDiscount > 0 && (
          <p className="mt-1 text-sm text-gray-500">
            Discount: {formatCurrency(calculatedDiscount)} off {formatCurrency(subtotal)}
          </p>
        )}
      </div>

      {/* Reason Selection */}
      <div className="mb-4">
        <label className="block text-sm font-medium text-gray-700 mb-2">
          Reason
        </label>
        <div className="grid grid-cols-2 gap-2">
          {DISCOUNT_REASONS.map((reason) => (
            <button
              key={reason.id}
              type="button"
              onClick={() => setSelectedReason(reason.id)}
              className={`
                h-10 px-3
                text-sm font-medium text-left
                rounded-lg
                transition-all duration-150
                ${
                  selectedReason === reason.id
                    ? 'bg-blue-100 text-blue-700 border-2 border-blue-500'
                    : 'bg-gray-50 text-gray-700 border border-gray-200 hover:bg-gray-100'
                }
              `}
            >
              {reason.label}
            </button>
          ))}
        </div>
      </div>

      {/* Custom Reason Input */}
      {selectedReason === 'custom' && (
        <div className="mb-4">
          <label className="block text-sm font-medium text-gray-700 mb-1">
            Custom Reason
          </label>
          <input
            type="text"
            value={customReason}
            onChange={(e) => setCustomReason(e.target.value)}
            placeholder="Enter reason..."
            maxLength={100}
            className="
              w-full h-10 px-3
              text-sm
              border-2 border-gray-200 rounded-lg
              focus:border-blue-500 focus:ring-2 focus:ring-blue-100
              transition-colors duration-150
            "
          />
        </div>
      )}

      {/* Apply Button */}
      <button
        type="button"
        onClick={handleApply}
        disabled={!isValid}
        className="
          w-full h-12
          flex items-center justify-center gap-2
          bg-green-600 hover:bg-green-700
          disabled:bg-gray-300 disabled:cursor-not-allowed
          text-white text-base font-bold
          rounded-xl
          transition-colors duration-150
        "
      >
        <CheckIcon className="w-5 h-5" />
        Apply Discount {calculatedDiscount > 0 && `(${formatCurrency(calculatedDiscount)})`}
      </button>
    </div>
  );
}

export default DiscountInput;
