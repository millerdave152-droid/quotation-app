/**
 * TeleTime POS - Financing Schedule Preview Component
 * Displays payment schedule breakdown for selected plan
 */

import { useState } from 'react';
import {
  CalendarDaysIcon,
  ChevronDownIcon,
  ChevronUpIcon,
  BanknotesIcon,
  ReceiptPercentIcon,
  CurrencyDollarIcon,
} from '@heroicons/react/24/outline';
import { formatCurrency } from '../../utils/formatters';

/**
 * Format date for display
 */
function formatDate(dateStr) {
  if (!dateStr) return '—';
  const date = new Date(dateStr);
  return date.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}

/**
 * Summary stat card
 */
function StatCard({ icon: Icon, label, value, subValue, color = 'gray' }) {
  const colorClasses = {
    gray: 'bg-gray-50 text-gray-600',
    blue: 'bg-blue-50 text-blue-600',
    green: 'bg-green-50 text-green-600',
    amber: 'bg-amber-50 text-amber-600',
  };

  return (
    <div className={`p-3 rounded-lg ${colorClasses[color]}`}>
      <div className="flex items-center gap-2 mb-1">
        <Icon className="w-4 h-4" />
        <span className="text-xs font-medium uppercase tracking-wide opacity-75">{label}</span>
      </div>
      <p className="text-lg font-bold text-gray-900 tabular-nums">{value}</p>
      {subValue && (
        <p className="text-xs text-gray-500">{subValue}</p>
      )}
    </div>
  );
}

/**
 * Financing schedule preview component
 * @param {object} props
 * @param {object} props.paymentPlan - Full payment plan with schedule
 * @param {boolean} props.compact - Show compact view (fewer details)
 */
export function FinancingSchedulePreview({ paymentPlan, compact = false }) {
  const [showFullSchedule, setShowFullSchedule] = useState(false);

  if (!paymentPlan) {
    return null;
  }

  const {
    planName,
    providerName,
    principal,
    monthlyPayment,
    totalCost,
    totalInterest,
    termMonths,
    apr,
    schedule = [],
    firstPaymentDate,
    finalPaymentDate,
  } = paymentPlan;

  const isZeroApr = apr === 0;

  // Show first 3 and last payment by default
  const visibleSchedule = showFullSchedule
    ? schedule
    : [
        ...schedule.slice(0, 3),
        ...(schedule.length > 4 ? [{ isPlaceholder: true, count: schedule.length - 4 }] : []),
        ...(schedule.length > 3 ? [schedule[schedule.length - 1]] : []),
      ];

  return (
    <div className="space-y-4">
      {/* Plan Header */}
      <div className="flex items-center justify-between">
        <div>
          <h3 className="font-semibold text-gray-900">{planName}</h3>
          <p className="text-sm text-gray-500">{providerName}</p>
        </div>
        <div className="text-right">
          <p className="text-2xl font-bold text-gray-900 tabular-nums">
            {formatCurrency(monthlyPayment)}<span className="text-base font-normal text-gray-500">/mo</span>
          </p>
          <p className="text-sm text-gray-500">{termMonths} payments</p>
        </div>
      </div>

      {/* Summary Stats */}
      <div className="grid grid-cols-2 gap-3">
        <StatCard
          icon={CurrencyDollarIcon}
          label="Financed"
          value={formatCurrency(principal)}
          color="blue"
        />
        <StatCard
          icon={BanknotesIcon}
          label="Total Cost"
          value={formatCurrency(totalCost)}
          subValue={totalInterest > 0 ? `+${formatCurrency(totalInterest)} interest` : 'No interest'}
          color={isZeroApr ? 'green' : 'amber'}
        />
        <StatCard
          icon={ReceiptPercentIcon}
          label="APR"
          value={isZeroApr ? '0%' : `${apr}%`}
          color={isZeroApr ? 'green' : 'gray'}
        />
        <StatCard
          icon={CalendarDaysIcon}
          label="First Payment"
          value={formatDate(firstPaymentDate)}
          color="gray"
        />
      </div>

      {/* Payment Schedule */}
      {!compact && schedule.length > 0 && (
        <div className="border border-gray-200 rounded-lg overflow-hidden">
          <div className="bg-gray-50 px-4 py-2 border-b border-gray-200">
            <div className="flex items-center justify-between">
              <h4 className="text-sm font-medium text-gray-700">Payment Schedule</h4>
              {schedule.length > 4 && (
                <button
                  type="button"
                  onClick={() => setShowFullSchedule(!showFullSchedule)}
                  className="text-sm text-blue-600 hover:text-blue-700 flex items-center gap-1"
                >
                  {showFullSchedule ? (
                    <>
                      <span>Show Less</span>
                      <ChevronUpIcon className="w-4 h-4" />
                    </>
                  ) : (
                    <>
                      <span>Show All</span>
                      <ChevronDownIcon className="w-4 h-4" />
                    </>
                  )}
                </button>
              )}
            </div>
          </div>

          <div className="divide-y divide-gray-100">
            {/* Header Row */}
            <div className="grid grid-cols-4 gap-2 px-4 py-2 bg-gray-50 text-xs font-medium text-gray-500">
              <span>#</span>
              <span>Due Date</span>
              <span className="text-right">Amount</span>
              <span className="text-right">Balance</span>
            </div>

            {/* Payment Rows */}
            {visibleSchedule.map((payment, idx) => {
              if (payment.isPlaceholder) {
                return (
                  <div key="placeholder" className="px-4 py-3 text-center">
                    <button
                      type="button"
                      onClick={() => setShowFullSchedule(true)}
                      className="text-sm text-gray-500 hover:text-blue-600"
                    >
                      + {payment.count} more payments
                    </button>
                  </div>
                );
              }

              const isLast = payment.paymentNumber === termMonths;

              return (
                <div
                  key={payment.paymentNumber}
                  className={`
                    grid grid-cols-4 gap-2 px-4 py-2 text-sm
                    ${isLast ? 'bg-green-50' : ''}
                  `}
                >
                  <span className="text-gray-500">{payment.paymentNumber}</span>
                  <span className="text-gray-700">{formatDate(payment.dueDate)}</span>
                  <span className="text-right font-medium text-gray-900 tabular-nums">
                    {formatCurrency(payment.amountDue)}
                  </span>
                  <span className={`text-right tabular-nums ${isLast ? 'text-green-600 font-medium' : 'text-gray-500'}`}>
                    {isLast ? 'Paid Off' : formatCurrency(payment.balanceAfter)}
                  </span>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Timeline Summary (Compact) */}
      {compact && (
        <div className="flex items-center justify-between text-sm text-gray-500">
          <span>First: {formatDate(firstPaymentDate)}</span>
          <span className="text-gray-300">→</span>
          <span>Last: {formatDate(finalPaymentDate)}</span>
        </div>
      )}

      {/* Interest Breakdown (if not 0%) */}
      {!compact && totalInterest > 0 && (
        <div className="p-3 bg-amber-50 border border-amber-200 rounded-lg">
          <p className="text-sm text-amber-800">
            <strong>Interest Details:</strong> At {apr}% APR over {termMonths} months,
            you'll pay {formatCurrency(totalInterest)} in interest
            ({((totalInterest / principal) * 100).toFixed(1)}% of principal).
          </p>
        </div>
      )}

      {/* 0% APR Note */}
      {!compact && isZeroApr && (
        <div className="p-3 bg-green-50 border border-green-200 rounded-lg">
          <p className="text-sm text-green-800">
            <strong>0% APR Financing:</strong> Pay the same amount whether you pay today
            or over {termMonths} months. No interest charges!
          </p>
        </div>
      )}
    </div>
  );
}

export default FinancingSchedulePreview;
