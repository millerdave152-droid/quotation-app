/**
 * TeleTime POS - Cash Movement Modal
 * Record paid-outs, drops, and cash additions
 */

import { useState, useCallback } from 'react';
import {
  XMarkIcon,
  ArrowDownTrayIcon,
  ArrowUpTrayIcon,
  MinusCircleIcon,
  PlusCircleIcon,
  ExclamationTriangleIcon,
} from '@heroicons/react/24/outline';
import { formatCurrency } from '../../utils/formatters';

const API_BASE = import.meta.env.VITE_API_URL || 'http://localhost:3001/api';

/**
 * Movement type configurations
 */
const MOVEMENT_TYPES = {
  paid_out: {
    label: 'Paid Out',
    description: 'Remove cash for expenses (vendor payment, petty cash)',
    icon: MinusCircleIcon,
    color: 'red',
    direction: 'out',
    requiresReason: true,
    requiresApproval: true,
    approvalThreshold: 100
  },
  drop: {
    label: 'Safe Drop',
    description: 'Remove excess cash to safe',
    icon: ArrowDownTrayIcon,
    color: 'orange',
    direction: 'out',
    requiresReason: true
  },
  pickup: {
    label: 'Cash Pickup',
    description: 'Manager collected cash from drawer',
    icon: ArrowUpTrayIcon,
    color: 'orange',
    direction: 'out',
    requiresReason: true
  },
  add: {
    label: 'Add Cash',
    description: 'Add cash to drawer (change, float adjustment)',
    icon: PlusCircleIcon,
    color: 'green',
    direction: 'in',
    requiresReason: true
  },
  refund: {
    label: 'Cash Refund',
    description: 'Cash refund to customer (outside transaction)',
    icon: MinusCircleIcon,
    color: 'red',
    direction: 'out',
    requiresReason: true
  }
};

/**
 * Common reasons for each type
 */
const COMMON_REASONS = {
  paid_out: [
    'Supplier payment',
    'Petty cash expense',
    'Office supplies',
    'Delivery charge',
    'Misc. expense'
  ],
  drop: [
    'Excess cash - safe drop',
    'End of day deposit',
    'Cash pickup for bank'
  ],
  pickup: [
    'Manager cash pickup',
    'Bank deposit preparation'
  ],
  add: [
    'Additional float',
    'Change replenishment',
    'Returned change error'
  ],
  refund: [
    'Product return - cash',
    'Price adjustment',
    'Customer satisfaction'
  ]
};

/**
 * Cash Movement Modal
 * @param {object} props
 * @param {boolean} props.isOpen - Whether modal is open
 * @param {function} props.onClose - Close callback
 * @param {number} props.shiftId - Current shift ID
 * @param {function} props.onSuccess - Success callback
 * @param {string} props.defaultType - Default movement type
 */
export function CashMovementModal({
  isOpen,
  onClose,
  shiftId,
  onSuccess,
  defaultType = null
}) {
  const [step, setStep] = useState(defaultType ? 'form' : 'type');
  const [movementType, setMovementType] = useState(defaultType);
  const [amount, setAmount] = useState('');
  const [reason, setReason] = useState('');
  const [referenceNumber, setReferenceNumber] = useState('');
  const [notes, setNotes] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState(null);

  const typeConfig = movementType ? MOVEMENT_TYPES[movementType] : null;
  const parsedAmount = parseFloat(amount) || 0;

  // Handle type selection
  const handleSelectType = (type) => {
    setMovementType(type);
    setStep('form');
    setError(null);
  };

  // Handle reason quick select
  const handleQuickReason = (selectedReason) => {
    setReason(selectedReason);
  };

  // Handle submit
  const handleSubmit = useCallback(async () => {
    if (!parsedAmount || parsedAmount <= 0) {
      setError('Please enter a valid amount');
      return;
    }

    if (!reason.trim()) {
      setError('Please enter a reason');
      return;
    }

    setIsSubmitting(true);
    setError(null);

    try {
      const response = await fetch(`${API_BASE}/cash-drawer/movement`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${localStorage.getItem('pos_token')}`
        },
        body: JSON.stringify({
          shiftId,
          movementType,
          amount: parsedAmount,
          reason: reason.trim(),
          referenceNumber: referenceNumber.trim() || null,
          notes: notes.trim() || null
        })
      });

      const result = await response.json();

      if (!response.ok || !result.success) {
        throw new Error(result.error || 'Failed to record movement');
      }

      onSuccess?.(result.data);
      handleClose();
    } catch (err) {
      console.error('[CashMovement] Error:', err);
      setError(err.message);
    } finally {
      setIsSubmitting(false);
    }
  }, [shiftId, movementType, parsedAmount, reason, referenceNumber, notes, onSuccess]);

  // Handle close
  const handleClose = () => {
    setStep(defaultType ? 'form' : 'type');
    setMovementType(defaultType);
    setAmount('');
    setReason('');
    setReferenceNumber('');
    setNotes('');
    setError(null);
    onClose?.();
  };

  // Handle back
  const handleBack = () => {
    if (defaultType) {
      handleClose();
    } else {
      setStep('type');
      setError(null);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/50"
        onClick={handleClose}
      />

      {/* Modal */}
      <div className="relative bg-white rounded-2xl shadow-2xl w-full max-w-md max-h-[90vh] overflow-hidden flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-gray-200">
          <h2 className="text-lg font-bold text-gray-900">
            {step === 'type' ? 'Cash Movement' : typeConfig?.label}
          </h2>
          <button
            onClick={handleClose}
            className="w-10 h-10 flex items-center justify-center hover:bg-gray-100 rounded-lg transition-colors"
          >
            <XMarkIcon className="w-6 h-6 text-gray-500" />
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-4">
          {/* Type Selection Step */}
          {step === 'type' && (
            <div className="space-y-3">
              <p className="text-sm text-gray-500 mb-4">
                Select the type of cash movement to record
              </p>

              {Object.entries(MOVEMENT_TYPES).map(([type, config]) => (
                <button
                  key={type}
                  onClick={() => handleSelectType(type)}
                  className="w-full flex items-center gap-4 p-4 border-2 border-gray-200 hover:border-gray-300 rounded-xl transition-colors text-left"
                >
                  <div className={`
                    w-12 h-12 rounded-xl flex items-center justify-center
                    ${config.color === 'red' ? 'bg-red-100 text-red-600' : ''}
                    ${config.color === 'orange' ? 'bg-orange-100 text-orange-600' : ''}
                    ${config.color === 'green' ? 'bg-green-100 text-green-600' : ''}
                  `}>
                    <config.icon className="w-6 h-6" />
                  </div>
                  <div className="flex-1">
                    <p className="font-semibold text-gray-900">{config.label}</p>
                    <p className="text-sm text-gray-500">{config.description}</p>
                  </div>
                </button>
              ))}
            </div>
          )}

          {/* Form Step */}
          {step === 'form' && typeConfig && (
            <div className="space-y-4">
              {/* Type Badge */}
              <div className={`
                inline-flex items-center gap-2 px-3 py-1.5 rounded-full text-sm font-medium
                ${typeConfig.color === 'red' ? 'bg-red-100 text-red-700' : ''}
                ${typeConfig.color === 'orange' ? 'bg-orange-100 text-orange-700' : ''}
                ${typeConfig.color === 'green' ? 'bg-green-100 text-green-700' : ''}
              `}>
                <typeConfig.icon className="w-4 h-4" />
                {typeConfig.direction === 'out' ? 'Cash Out' : 'Cash In'}
              </div>

              {/* Error */}
              {error && (
                <div className="p-3 bg-red-50 border border-red-200 rounded-lg">
                  <p className="text-sm text-red-700">{error}</p>
                </div>
              )}

              {/* Amount */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Amount
                </label>
                <div className="relative">
                  <span className="absolute left-4 top-1/2 -translate-y-1/2 text-xl text-gray-400">$</span>
                  <input
                    type="number"
                    step="0.01"
                    min="0.01"
                    value={amount}
                    onChange={(e) => setAmount(e.target.value)}
                    placeholder="0.00"
                    className="w-full h-14 pl-10 pr-4 text-2xl font-bold text-right border-2 border-gray-200 rounded-xl focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
                  />
                </div>
              </div>

              {/* Approval Warning */}
              {typeConfig.requiresApproval && parsedAmount > typeConfig.approvalThreshold && (
                <div className="p-3 bg-yellow-50 border border-yellow-200 rounded-lg flex items-start gap-2">
                  <ExclamationTriangleIcon className="w-5 h-5 text-yellow-600 flex-shrink-0 mt-0.5" />
                  <p className="text-sm text-yellow-700">
                    Amounts over {formatCurrency(typeConfig.approvalThreshold)} require manager approval
                  </p>
                </div>
              )}

              {/* Reason */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Reason
                </label>
                <input
                  type="text"
                  value={reason}
                  onChange={(e) => setReason(e.target.value)}
                  placeholder="Enter reason for this movement"
                  className="w-full h-12 px-4 border-2 border-gray-200 rounded-xl focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
                />

                {/* Quick Reasons */}
                {COMMON_REASONS[movementType] && (
                  <div className="mt-2 flex flex-wrap gap-2">
                    {COMMON_REASONS[movementType].map((r) => (
                      <button
                        key={r}
                        type="button"
                        onClick={() => handleQuickReason(r)}
                        className={`
                          px-3 py-1 text-sm rounded-full transition-colors
                          ${reason === r
                            ? 'bg-blue-600 text-white'
                            : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                          }
                        `}
                      >
                        {r}
                      </button>
                    ))}
                  </div>
                )}
              </div>

              {/* Reference Number (for paid-outs) */}
              {movementType === 'paid_out' && (
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Reference / Receipt # (optional)
                  </label>
                  <input
                    type="text"
                    value={referenceNumber}
                    onChange={(e) => setReferenceNumber(e.target.value)}
                    placeholder="Receipt or reference number"
                    className="w-full h-12 px-4 border-2 border-gray-200 rounded-xl focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
                  />
                </div>
              )}

              {/* Notes */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Notes (optional)
                </label>
                <textarea
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  placeholder="Additional notes..."
                  rows={2}
                  className="w-full px-4 py-3 border-2 border-gray-200 rounded-xl focus:border-blue-500 focus:ring-2 focus:ring-blue-100 resize-none"
                />
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="p-4 border-t border-gray-200 space-y-3">
          {step === 'form' && (
            <button
              onClick={handleSubmit}
              disabled={isSubmitting || !parsedAmount || !reason.trim()}
              className={`
                w-full h-12 flex items-center justify-center gap-2
                text-white font-semibold rounded-xl transition-colors
                disabled:bg-gray-300 disabled:cursor-not-allowed
                ${typeConfig?.color === 'red' ? 'bg-red-600 hover:bg-red-700' : ''}
                ${typeConfig?.color === 'orange' ? 'bg-orange-600 hover:bg-orange-700' : ''}
                ${typeConfig?.color === 'green' ? 'bg-green-600 hover:bg-green-700' : ''}
              `}
            >
              {isSubmitting ? (
                <>
                  <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                  Recording...
                </>
              ) : (
                <>
                  <typeConfig.icon className="w-5 h-5" />
                  Record {typeConfig?.label} - {formatCurrency(parsedAmount)}
                </>
              )}
            </button>
          )}

          {step === 'form' && !defaultType && (
            <button
              onClick={handleBack}
              className="w-full h-10 text-gray-600 hover:text-gray-800 hover:bg-gray-100 rounded-xl transition-colors"
            >
              Back to Movement Types
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

export default CashMovementModal;
