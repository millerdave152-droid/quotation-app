/**
 * TeleTime POS - Trade-In Cart Section
 * Displays trade-ins as line items in the cart with negative values
 * Grouped at the bottom of the cart items list
 */

import React, { useState } from 'react';
import {
  ArrowsRightLeftIcon,
  TrashIcon,
  ExclamationTriangleIcon,
  CheckCircleIcon,
  ClockIcon,
  ChevronDownIcon,
  ChevronUpIcon,
  DevicePhoneMobileIcon,
} from '@heroicons/react/24/outline';
import { formatCurrency } from '../../utils/formatters';

// ============================================================================
// TRADE-IN LINE ITEM
// Single trade-in display in cart
// ============================================================================

function TradeInLineItem({ tradeIn, onRemove, disabled = false }) {
  const [expanded, setExpanded] = useState(false);

  const statusConfig = {
    pending: {
      icon: ClockIcon,
      color: 'text-yellow-600',
      bgColor: 'bg-yellow-50',
      borderColor: 'border-yellow-200',
      label: 'Pending Approval',
    },
    approved: {
      icon: CheckCircleIcon,
      color: 'text-green-600',
      bgColor: 'bg-green-50',
      borderColor: 'border-green-200',
      label: 'Approved',
    },
    applied: {
      icon: CheckCircleIcon,
      color: 'text-blue-600',
      bgColor: 'bg-blue-50',
      borderColor: 'border-blue-200',
      label: 'Applied',
    },
  };

  const status = tradeIn.requires_approval && tradeIn.status === 'pending'
    ? 'pending'
    : tradeIn.status === 'approved' || tradeIn.status === 'applied'
    ? tradeIn.status
    : 'approved';

  const config = statusConfig[status] || statusConfig.approved;
  const StatusIcon = config.icon;

  return (
    <div
      className={`
        relative px-4 py-3
        border-l-4 border-emerald-500
        ${config.bgColor}
        transition-all duration-150
      `}
    >
      {/* Main Row */}
      <div className="flex items-start gap-3">
        {/* Icon */}
        <div className="flex-shrink-0 w-10 h-10 rounded-lg bg-emerald-100 flex items-center justify-center">
          <ArrowsRightLeftIcon className="w-5 h-5 text-emerald-600" />
        </div>

        {/* Content */}
        <div className="flex-1 min-w-0">
          {/* Header */}
          <div className="flex items-center gap-2">
            <span className="text-xs font-semibold text-emerald-600 uppercase tracking-wide">
              Trade-In Credit
            </span>
            {tradeIn.requires_approval && tradeIn.status === 'pending' && (
              <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-xs font-medium bg-yellow-100 text-yellow-700">
                <ExclamationTriangleIcon className="w-3 h-3" />
                Pending
              </span>
            )}
          </div>

          {/* Product Name */}
          <p className="font-semibold text-gray-900 truncate">
            {tradeIn.brand} {tradeIn.model}
          </p>

          {/* Condition */}
          <p className="text-sm text-gray-500">
            {tradeIn.condition_name} condition
            {tradeIn.serial_number && (
              <span className="ml-2 text-gray-400">
                S/N: {tradeIn.serial_number.slice(-6)}...
              </span>
            )}
          </p>

          {/* Expand Button */}
          {(tradeIn.condition_notes || tradeIn.adjustment_amount) && (
            <button
              type="button"
              onClick={() => setExpanded(!expanded)}
              className="mt-1 text-xs text-gray-400 hover:text-gray-600 flex items-center gap-1"
            >
              {expanded ? (
                <>
                  <ChevronUpIcon className="w-3 h-3" />
                  Hide details
                </>
              ) : (
                <>
                  <ChevronDownIcon className="w-3 h-3" />
                  Show details
                </>
              )}
            </button>
          )}
        </div>

        {/* Value & Actions */}
        <div className="flex flex-col items-end gap-2">
          {/* Value */}
          <span className="text-lg font-bold text-emerald-600 tabular-nums">
            -{formatCurrency(tradeIn.final_value || tradeIn.finalValue)}
          </span>

          {/* Remove Button */}
          {onRemove && !disabled && tradeIn.status !== 'applied' && (
            <button
              type="button"
              onClick={() => onRemove(tradeIn.id)}
              className="p-1 text-gray-400 hover:text-red-500 hover:bg-red-50 rounded transition-colors"
              title="Remove trade-in"
            >
              <TrashIcon className="w-4 h-4" />
            </button>
          )}
        </div>
      </div>

      {/* Expanded Details */}
      {expanded && (
        <div className="mt-3 pt-3 border-t border-gray-200 space-y-2 text-sm">
          {/* Value Breakdown */}
          <div className="flex justify-between text-gray-500">
            <span>Base value:</span>
            <span>{formatCurrency(tradeIn.base_value || tradeIn.baseValue)}</span>
          </div>
          <div className="flex justify-between text-gray-500">
            <span>Condition ({Math.round((tradeIn.condition_multiplier || tradeIn.conditionMultiplier) * 100)}%):</span>
            <span>×{(tradeIn.condition_multiplier || tradeIn.conditionMultiplier || 1).toFixed(2)}</span>
          </div>
          {(tradeIn.adjustment_amount || tradeIn.adjustmentAmount) !== 0 && (
            <div className="flex justify-between text-gray-500">
              <span>Adjustment{tradeIn.adjustment_reason && ` (${tradeIn.adjustment_reason})`}:</span>
              <span className={(tradeIn.adjustment_amount || tradeIn.adjustmentAmount) > 0 ? 'text-green-600' : 'text-red-600'}>
                {(tradeIn.adjustment_amount || tradeIn.adjustmentAmount) > 0 ? '+' : ''}
                {formatCurrency(tradeIn.adjustment_amount || tradeIn.adjustmentAmount)}
              </span>
            </div>
          )}
          {tradeIn.condition_notes && (
            <div className="pt-2 text-gray-500">
              <span className="font-medium">Notes:</span> {tradeIn.condition_notes}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ============================================================================
// TRADE-IN CART SECTION
// Container for all trade-ins in cart
// ============================================================================

export function TradeInCartSection({
  tradeIns = [],
  onRemoveTradeIn,
  onAddTradeIn,
  disabled = false,
}) {
  if (!tradeIns || tradeIns.length === 0) {
    return null;
  }

  // Calculate totals
  const totalTradeInValue = tradeIns.reduce(
    (sum, ti) => sum + parseFloat(ti.final_value || ti.finalValue || 0),
    0
  );

  const pendingApprovalCount = tradeIns.filter(
    (ti) => ti.requires_approval && ti.status === 'pending'
  ).length;

  return (
    <div className="border-t-2 border-emerald-200 bg-emerald-50/50">
      {/* Section Header */}
      <div className="px-4 py-2 bg-emerald-100 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <ArrowsRightLeftIcon className="w-5 h-5 text-emerald-600" />
          <span className="font-semibold text-emerald-700">
            Trade-In Credits
          </span>
          <span className="px-1.5 py-0.5 bg-emerald-200 text-emerald-700 text-xs font-bold rounded">
            {tradeIns.length}
          </span>
        </div>
        <span className="text-lg font-bold text-emerald-600">
          -{formatCurrency(totalTradeInValue)}
        </span>
      </div>

      {/* Pending Approval Warning */}
      {pendingApprovalCount > 0 && (
        <div className="px-4 py-2 bg-yellow-50 border-b border-yellow-200 flex items-center gap-2 text-sm">
          <ExclamationTriangleIcon className="w-4 h-4 text-yellow-600" />
          <span className="text-yellow-700">
            {pendingApprovalCount} trade-in{pendingApprovalCount > 1 ? 's' : ''} pending manager approval
          </span>
        </div>
      )}

      {/* Trade-In Items */}
      <div className="divide-y divide-emerald-100">
        {tradeIns.map((tradeIn) => (
          <TradeInLineItem
            key={tradeIn.id}
            tradeIn={tradeIn}
            onRemove={onRemoveTradeIn}
            disabled={disabled}
          />
        ))}
      </div>
    </div>
  );
}

// ============================================================================
// TRADE-IN TOTALS ROW
// Shows trade-in total in the cart totals section
// ============================================================================

export function TradeInTotalsRow({ tradeInTotal, hasPendingApprovals = false }) {
  if (!tradeInTotal || tradeInTotal <= 0) return null;

  return (
    <div className="flex justify-between items-center text-sm mt-1">
      <span className="text-emerald-600 flex items-center gap-1">
        <ArrowsRightLeftIcon className="w-4 h-4" />
        Trade-In Credit
        {hasPendingApprovals && (
          <ExclamationTriangleIcon className="w-3 h-3 text-yellow-500" title="Pending approval" />
        )}
      </span>
      <span className="font-medium text-emerald-600 tabular-nums">
        -{formatCurrency(tradeInTotal)}
      </span>
    </div>
  );
}

// ============================================================================
// TRADE-IN RECEIPT SECTION
// For displaying trade-ins on receipts
// ============================================================================

export function TradeInReceiptSection({ tradeIns = [], variant = 'full' }) {
  if (!tradeIns || tradeIns.length === 0) return null;

  const totalValue = tradeIns.reduce(
    (sum, ti) => sum + parseFloat(ti.final_value || ti.finalValue || 0),
    0
  );

  // Thermal receipt format
  if (variant === 'thermal') {
    return (
      <div className="border-t border-dashed border-gray-400 my-2 pt-2">
        <p className="font-bold text-center">--- TRADE-IN ---</p>
        {tradeIns.map((tradeIn, index) => (
          <div key={index} className="mb-1">
            <p className="truncate">{tradeIn.brand} {tradeIn.model}</p>
            <div className="flex justify-between">
              <span className="text-gray-600">  {tradeIn.condition_name}</span>
              <span className="font-bold">-{formatCurrency(tradeIn.final_value || tradeIn.finalValue)}</span>
            </div>
            {tradeIn.serial_number && (
              <p className="text-gray-500 text-[9px]">  S/N: {tradeIn.serial_number}</p>
            )}
          </div>
        ))}
        <div className="flex justify-between font-bold border-t border-dashed border-gray-300 pt-1 mt-1">
          <span>Trade-In Total:</span>
          <span>-{formatCurrency(totalValue)}</span>
        </div>
      </div>
    );
  }

  // Full page receipt format
  return (
    <div className="mt-4 pt-4 border-t-2 border-emerald-200">
      <h3 className="font-bold text-emerald-700 mb-3 flex items-center gap-2">
        <ArrowsRightLeftIcon className="w-5 h-5" />
        TRADE-IN CREDITS
      </h3>
      <table className="w-full text-sm">
        <thead>
          <tr className="bg-emerald-100 text-emerald-800">
            <th className="py-2 px-3 text-left font-semibold">Device</th>
            <th className="py-2 px-3 text-left font-semibold">Condition</th>
            <th className="py-2 px-3 text-left font-semibold">Serial/IMEI</th>
            <th className="py-2 px-3 text-right font-semibold">Credit</th>
          </tr>
        </thead>
        <tbody>
          {tradeIns.map((tradeIn, index) => (
            <tr key={index} className={index % 2 === 0 ? 'bg-emerald-50' : 'bg-white'}>
              <td className="py-2 px-3">
                <p className="font-semibold text-gray-900">{tradeIn.brand} {tradeIn.model}</p>
                {tradeIn.variant && <p className="text-xs text-gray-500">{tradeIn.variant}</p>}
              </td>
              <td className="py-2 px-3 text-gray-600">
                {tradeIn.condition_name}
                <span className="text-gray-400 ml-1">
                  ({Math.round((tradeIn.condition_multiplier || 1) * 100)}%)
                </span>
              </td>
              <td className="py-2 px-3 text-gray-500 font-mono text-xs">
                {tradeIn.serial_number || tradeIn.imei || '-'}
              </td>
              <td className="py-2 px-3 text-right font-bold text-emerald-600">
                -{formatCurrency(tradeIn.final_value || tradeIn.finalValue)}
              </td>
            </tr>
          ))}
        </tbody>
        <tfoot>
          <tr className="bg-emerald-200">
            <td colSpan={3} className="py-2 px-3 font-bold text-emerald-800 text-right">
              Total Trade-In Credit:
            </td>
            <td className="py-2 px-3 text-right font-bold text-emerald-800 text-lg">
              -{formatCurrency(totalValue)}
            </td>
          </tr>
        </tfoot>
      </table>

      {/* Trade-In Notice */}
      <div className="mt-3 p-3 bg-gray-50 border border-gray-200 rounded text-xs text-gray-500">
        <p className="font-semibold text-gray-700 mb-1">Trade-In Terms:</p>
        <ul className="list-disc list-inside space-y-0.5">
          <li>Trade-in devices become property of the store upon completion of sale</li>
          <li>All personal data should be removed before trade-in</li>
          <li>Trade-in values are based on condition assessment at time of transaction</li>
        </ul>
      </div>
    </div>
  );
}

export default TradeInCartSection;
