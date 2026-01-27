/**
 * TeleTime POS - Financing Plan Card Component
 * Displays individual financing option with key details
 */

import {
  CheckCircleIcon,
  SparklesIcon,
  ClockIcon,
} from '@heroicons/react/24/outline';
import { formatCurrency } from '../../utils/formatters';

/**
 * Provider logo/badge component
 */
function ProviderBadge({ provider }) {
  const providerStyles = {
    affirm: {
      bg: 'bg-blue-600',
      text: 'text-white',
      label: 'Affirm',
    },
    klarna: {
      bg: 'bg-pink-500',
      text: 'text-white',
      label: 'Klarna',
    },
    synchrony: {
      bg: 'bg-purple-600',
      text: 'text-white',
      label: 'Synchrony',
    },
    internal: {
      bg: 'bg-emerald-600',
      text: 'text-white',
      label: 'Store',
    },
  };

  const style = providerStyles[provider] || providerStyles.internal;

  return (
    <span className={`
      inline-flex items-center px-2 py-0.5
      text-xs font-medium rounded
      ${style.bg} ${style.text}
    `}>
      {style.label}
    </span>
  );
}

/**
 * Financing plan card component
 * @param {object} props
 * @param {object} props.plan - Financing plan data
 * @param {boolean} props.selected - Whether this plan is selected
 * @param {function} props.onSelect - Callback when plan is selected
 * @param {boolean} props.recommended - Show as recommended
 * @param {boolean} props.inComparison - Whether this plan is in comparison
 * @param {function} props.onCompare - Callback to add/remove from comparison
 * @param {boolean} props.showCompareButton - Whether to show compare button
 */
export function FinancingPlanCard({
  plan,
  selected = false,
  onSelect,
  recommended = false,
  inComparison = false,
  onCompare,
  showCompareButton = false,
}) {
  const {
    planId,
    planName,
    provider,
    termMonths,
    interestRate,
    monthlyPayment,
    totalCost,
    totalInterest,
    isPromotional,
    highlightText,
  } = plan;

  const isZeroApr = interestRate === 0;

  return (
    <button
      type="button"
      onClick={() => onSelect?.(plan)}
      className={`
        relative w-full p-4 text-left
        border-2 rounded-xl
        transition-all duration-150
        ${selected
          ? 'border-blue-500 bg-blue-50 ring-2 ring-blue-200'
          : 'border-gray-200 bg-white hover:border-gray-300 hover:shadow-sm'
        }
      `}
    >
      {/* Recommended Badge */}
      {recommended && (
        <div className="absolute -top-3 left-4">
          <span className="inline-flex items-center gap-1 px-2 py-0.5 bg-amber-500 text-white text-xs font-semibold rounded-full">
            <SparklesIcon className="w-3 h-3" />
            Best Value
          </span>
        </div>
      )}

      {/* Promotional Badge */}
      {isPromotional && !recommended && (
        <div className="absolute -top-3 left-4">
          <span className="inline-flex items-center gap-1 px-2 py-0.5 bg-green-500 text-white text-xs font-semibold rounded-full">
            <ClockIcon className="w-3 h-3" />
            Limited Time
          </span>
        </div>
      )}

      {/* Selected Indicator */}
      {selected && (
        <div className="absolute top-3 right-3">
          <CheckCircleIcon className="w-6 h-6 text-blue-600" />
        </div>
      )}

      {/* Header Row */}
      <div className="flex items-start justify-between mb-3 pr-8">
        <div>
          <h3 className="font-semibold text-gray-900">{planName}</h3>
          <div className="flex items-center gap-2 mt-1">
            <ProviderBadge provider={provider} />
            <span className="text-sm text-gray-500">
              {termMonths} months
            </span>
          </div>
        </div>
      </div>

      {/* Monthly Payment - Main Focus */}
      <div className="mb-3">
        <div className="flex items-baseline gap-1">
          <span className="text-3xl font-bold text-gray-900 tabular-nums">
            {formatCurrency(monthlyPayment)}
          </span>
          <span className="text-gray-500">/mo</span>
        </div>
      </div>

      {/* APR and Interest Info */}
      <div className="space-y-1">
        {/* APR Display */}
        <div className="flex items-center gap-2">
          {isZeroApr ? (
            <span className="inline-flex items-center px-2 py-0.5 bg-green-100 text-green-700 text-sm font-semibold rounded">
              0% APR
            </span>
          ) : (
            <span className="text-sm text-gray-600">
              {interestRate}% APR
            </span>
          )}
          {highlightText && isZeroApr && (
            <span className="text-xs text-green-600">{highlightText}</span>
          )}
        </div>

        {/* Total Cost */}
        <div className="flex justify-between text-sm">
          <span className="text-gray-500">Total Cost</span>
          <span className={`font-medium tabular-nums ${isZeroApr ? 'text-gray-900' : 'text-gray-700'}`}>
            {formatCurrency(totalCost)}
          </span>
        </div>

        {/* Interest if applicable */}
        {totalInterest > 0 && (
          <div className="flex justify-between text-sm">
            <span className="text-gray-500">Interest</span>
            <span className="text-orange-600 tabular-nums">
              +{formatCurrency(totalInterest)}
            </span>
          </div>
        )}
      </div>
    </button>
  );
}

export default FinancingPlanCard;
