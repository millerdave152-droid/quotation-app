/**
 * Commission Breakdown Modal
 * Detailed view of commission calculation per item
 */

import React from 'react';
import { createPortal } from 'react-dom';
import {
  XMarkIcon,
  CurrencyDollarIcon,
  SparklesIcon,
  ExclamationTriangleIcon,
  CheckCircleIcon,
  InformationCircleIcon,
} from '@heroicons/react/24/outline';

/**
 * Format currency
 */
function formatCurrency(amount) {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 2,
  }).format(amount || 0);
}

/**
 * Commission item row in table
 */
function CommissionRow({ item, index }) {
  return (
    <tr className={`
      ${index % 2 === 0 ? 'bg-white' : 'bg-slate-50'}
      ${item.isReduced ? 'bg-amber-50' : ''}
      hover:bg-slate-100 transition-colors
    `}>
      {/* Item */}
      <td className="px-4 py-3">
        <div className="flex items-center gap-2">
          <span className="font-medium text-slate-900 truncate max-w-[200px]">
            {item.itemName}
          </span>
          {item.isBonus && (
            <span className="inline-flex items-center gap-0.5 px-1.5 py-0.5 text-xs font-medium bg-green-100 text-green-700 rounded-full">
              <SparklesIcon className="w-3 h-3" />
              Bonus
            </span>
          )}
          {item.isReduced && (
            <span className="inline-flex items-center gap-0.5 px-1.5 py-0.5 text-xs font-medium bg-amber-100 text-amber-700 rounded-full">
              <ExclamationTriangleIcon className="w-3 h-3" />
              Reduced
            </span>
          )}
        </div>
        {item.categoryName && (
          <div className="text-xs text-slate-500 mt-0.5">{item.categoryName}</div>
        )}
      </td>

      {/* Sale Amount */}
      <td className="px-4 py-3 text-right">
        <span className="text-slate-700">{formatCurrency(item.saleAmount)}</span>
      </td>

      {/* Rate */}
      <td className="px-4 py-3 text-center">
        <span className={`
          inline-block px-2 py-0.5 text-xs font-medium rounded
          ${item.isBonus ? 'bg-green-100 text-green-700' : 'bg-slate-100 text-slate-600'}
          ${item.isReduced ? 'bg-amber-100 text-amber-700' : ''}
        `}>
          {item.ratePercent}
        </span>
      </td>

      {/* Commission */}
      <td className="px-4 py-3 text-right">
        <span className={`
          font-semibold
          ${item.isBonus ? 'text-green-600' : 'text-slate-900'}
        `}>
          {formatCurrency(item.commission)}
        </span>
      </td>
    </tr>
  );
}

/**
 * Note item in the notes section
 */
function NoteItem({ note }) {
  let icon = <InformationCircleIcon className="w-4 h-4 text-blue-500" />;
  let bgColor = 'bg-blue-50';
  let textColor = 'text-blue-700';

  if (note.toLowerCase().includes('bonus')) {
    icon = <SparklesIcon className="w-4 h-4 text-green-500" />;
    bgColor = 'bg-green-50';
    textColor = 'text-green-700';
  } else if (note.toLowerCase().includes('reduced') || note.toLowerCase().includes('discount')) {
    icon = <ExclamationTriangleIcon className="w-4 h-4 text-amber-500" />;
    bgColor = 'bg-amber-50';
    textColor = 'text-amber-700';
  } else if (note.toLowerCase().includes('full commission')) {
    icon = <CheckCircleIcon className="w-4 h-4 text-green-500" />;
    bgColor = 'bg-green-50';
    textColor = 'text-green-700';
  }

  return (
    <div className={`flex items-center gap-2 px-3 py-2 ${bgColor} rounded-lg`}>
      {icon}
      <span className={`text-sm ${textColor}`}>{note}</span>
    </div>
  );
}

/**
 * Commission Breakdown Modal
 */
export default function CommissionBreakdownModal({
  isOpen,
  onClose,
  commission,
  cart,
}) {
  if (!isOpen) return null;

  const breakdown = commission?.breakdown || [];
  const notes = commission?.notes || [];
  const summary = commission?.summary || {};

  return createPortal(
    <div className="fixed inset-0 z-50 overflow-y-auto">
      {/* Backdrop */}
      <div
        className="fixed inset-0 bg-black/40 backdrop-blur-sm transition-opacity"
        onClick={onClose}
      />

      {/* Modal */}
      <div className="flex min-h-full items-center justify-center p-4">
        <div className="relative w-full max-w-2xl bg-white rounded-2xl shadow-2xl transform transition-all">
          {/* Header */}
          <div className="flex items-center justify-between p-5 border-b border-slate-200">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-green-100 rounded-xl">
                <CurrencyDollarIcon className="w-6 h-6 text-green-600" />
              </div>
              <div>
                <h2 className="text-lg font-semibold text-slate-900">Commission Breakdown</h2>
                <p className="text-sm text-slate-500">
                  {breakdown.length} item{breakdown.length !== 1 ? 's' : ''} in cart
                </p>
              </div>
            </div>
            <button
              onClick={onClose}
              className="p-2 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded-lg transition-colors"
            >
              <XMarkIcon className="w-5 h-5" />
            </button>
          </div>

          {/* Table */}
          <div className="max-h-[400px] overflow-y-auto">
            <table className="w-full">
              <thead className="bg-slate-100 sticky top-0">
                <tr>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-slate-600 uppercase tracking-wider">
                    Item
                  </th>
                  <th className="px-4 py-3 text-right text-xs font-semibold text-slate-600 uppercase tracking-wider">
                    Sale Amount
                  </th>
                  <th className="px-4 py-3 text-center text-xs font-semibold text-slate-600 uppercase tracking-wider">
                    Rate
                  </th>
                  <th className="px-4 py-3 text-right text-xs font-semibold text-slate-600 uppercase tracking-wider">
                    Commission
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {breakdown.map((item, index) => (
                  <CommissionRow key={item.itemId || index} item={item} index={index} />
                ))}
              </tbody>
            </table>

            {breakdown.length === 0 && (
              <div className="py-12 text-center">
                <CurrencyDollarIcon className="w-12 h-12 text-slate-300 mx-auto mb-3" />
                <p className="text-slate-500">No commission data available</p>
              </div>
            )}
          </div>

          {/* Notes */}
          {notes.length > 0 && (
            <div className="px-5 py-4 border-t border-slate-200 bg-slate-50">
              <h3 className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-2">
                Notes
              </h3>
              <div className="flex flex-wrap gap-2">
                {notes.map((note, i) => (
                  <NoteItem key={i} note={note} />
                ))}
              </div>
            </div>
          )}

          {/* Summary Footer */}
          <div className="p-5 border-t border-slate-200 bg-gradient-to-r from-slate-50 to-white rounded-b-2xl">
            <div className="grid grid-cols-3 gap-4">
              {/* Base Commission */}
              <div className="text-center">
                <div className="text-xs text-slate-500 uppercase tracking-wider mb-1">Base</div>
                <div className="text-lg font-semibold text-slate-700">
                  {formatCurrency(summary.baseCommission || 0)}
                </div>
              </div>

              {/* Bonus */}
              <div className="text-center">
                <div className="text-xs text-slate-500 uppercase tracking-wider mb-1">Bonus</div>
                <div className="text-lg font-semibold text-green-600">
                  +{formatCurrency(summary.bonusCommission || 0)}
                </div>
              </div>

              {/* Total */}
              <div className="text-center border-l border-slate-200">
                <div className="text-xs text-slate-500 uppercase tracking-wider mb-1">Total</div>
                <div className="text-2xl font-bold text-green-600">
                  {formatCurrency(commission?.totalCommission || 0)}
                </div>
              </div>
            </div>

            {/* Reduced items warning */}
            {summary.reducedItems > 0 && (
              <div className="mt-4 flex items-center gap-2 p-3 bg-amber-50 border border-amber-200 rounded-lg">
                <ExclamationTriangleIcon className="w-5 h-5 text-amber-500 flex-shrink-0" />
                <span className="text-sm text-amber-700">
                  {summary.reducedItems} item{summary.reducedItems !== 1 ? 's have' : ' has'} reduced
                  commission due to discounts above threshold.
                </span>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>,
    document.body
  );
}
