/**
 * TeleTime POS - Financing Prompt
 * Prompt for financing/payment plan options
 */

import { useState } from 'react';
import { formatCurrency } from '../../utils/formatters';

// Provider logos/colors
const PROVIDER_STYLES = {
  affirm: {
    name: 'Affirm',
    color: '#0FA0EA',
    bgColor: 'bg-[#0FA0EA]',
    lightBg: 'bg-blue-50',
  },
  klarna: {
    name: 'Klarna',
    color: '#FFB3C7',
    bgColor: 'bg-[#FFB3C7]',
    lightBg: 'bg-pink-50',
  },
  synchrony: {
    name: 'Synchrony',
    color: '#003087',
    bgColor: 'bg-[#003087]',
    lightBg: 'bg-indigo-50',
  },
  internal: {
    name: 'Store Financing',
    color: '#059669',
    bgColor: 'bg-emerald-600',
    lightBg: 'bg-emerald-50',
  },
};

/**
 * Financing prompt component
 * @param {object} props
 * @param {Array} props.options - Available financing options
 * @param {number} props.cartTotal - Cart total for calculation
 * @param {function} props.onSelect - Select financing callback
 * @param {function} props.onDecline - Decline callback
 * @param {function} props.onLearnMore - Learn more callback
 * @param {string} props.variant - 'standard' | 'compact' | 'comparison'
 * @param {string} props.className - Additional CSS classes
 */
export function FinancingPrompt({
  options = [],
  cartTotal = 0,
  onSelect,
  onDecline,
  onLearnMore,
  variant = 'standard',
  className = '',
}) {
  const [selectedOption, setSelectedOption] = useState(null);
  const [isApplying, setIsApplying] = useState(false);
  const [showTerms, setShowTerms] = useState(false);

  // Get best option (lowest APR or promotional)
  const bestOption = options.find(o => o.isPromotional) || options[0];

  // Handle select
  const handleSelect = async (option) => {
    if (isApplying) return;
    setIsApplying(true);
    setSelectedOption(option);
    await onSelect?.(option);
    setIsApplying(false);
  };

  // Compact variant - single option banner
  if (variant === 'compact' && bestOption) {
    const provider = PROVIDER_STYLES[bestOption.provider] || PROVIDER_STYLES.internal;

    return (
      <div className={`${provider.lightBg} border border-gray-200 rounded-xl p-4 ${className}`}>
        <div className="flex items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className={`p-2 ${provider.bgColor} rounded-lg`}>
              <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 10h18M7 15h1m4 0h1m-7 4h12a3 3 0 003-3V8a3 3 0 00-3-3H6a3 3 0 00-3 3v8a3 3 0 003 3z" />
              </svg>
            </div>
            <div>
              <p className="font-medium text-gray-900">
                Pay {formatCurrency(bestOption.monthlyPayment)}/mo
              </p>
              <p className="text-sm text-gray-600">
                {bestOption.highlightText || `${bestOption.termMonths} months with ${provider.name}`}
              </p>
            </div>
          </div>
          <button
            onClick={() => onLearnMore?.(bestOption)}
            className={`px-4 py-2 ${provider.bgColor} text-white text-sm font-semibold rounded-lg hover:opacity-90 transition-opacity`}
          >
            Learn More
          </button>
        </div>
      </div>
    );
  }

  // Comparison variant - show all options side by side
  if (variant === 'comparison') {
    return (
      <div className={`bg-white rounded-2xl shadow-lg overflow-hidden ${className}`}>
        {/* Header */}
        <div className="bg-gradient-to-r from-gray-800 to-gray-900 px-6 py-5">
          <div className="flex items-center gap-4">
            <div className="p-3 bg-white/10 rounded-xl">
              <svg className="w-8 h-8 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 10h18M7 15h1m4 0h1m-7 4h12a3 3 0 003-3V8a3 3 0 00-3-3H6a3 3 0 00-3 3v8a3 3 0 003 3z" />
              </svg>
            </div>
            <div>
              <h3 className="text-xl font-bold text-white">Flexible Payment Options</h3>
              <p className="text-gray-400">
                Total: {formatCurrency(cartTotal)} - Choose how you pay
              </p>
            </div>
          </div>
        </div>

        {/* Options grid */}
        <div className="p-6">
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {options.map((option) => {
              const provider = PROVIDER_STYLES[option.provider] || PROVIDER_STYLES.internal;
              const isSelected = selectedOption?.financingId === option.financingId;

              return (
                <div
                  key={option.financingId}
                  className={`relative border-2 rounded-xl p-4 cursor-pointer transition-all ${
                    isSelected
                      ? 'border-green-500 bg-green-50'
                      : 'border-gray-200 hover:border-gray-300'
                  }`}
                  onClick={() => setSelectedOption(option)}
                >
                  {/* Promotional badge */}
                  {option.isPromotional && (
                    <div className="absolute -top-2 -right-2">
                      <span className="px-2 py-0.5 bg-yellow-400 text-yellow-900 text-xs font-bold rounded-full">
                        PROMO
                      </span>
                    </div>
                  )}

                  {/* Provider */}
                  <div className="flex items-center gap-2 mb-3">
                    <div
                      className="w-3 h-3 rounded-full"
                      style={{ backgroundColor: provider.color }}
                    />
                    <span className="text-sm font-medium text-gray-600">
                      {provider.name}
                    </span>
                  </div>

                  {/* Monthly payment */}
                  <p className="text-2xl font-bold text-gray-900 mb-1">
                    {formatCurrency(option.monthlyPayment)}
                    <span className="text-sm font-normal text-gray-500">/mo</span>
                  </p>

                  {/* Terms */}
                  <p className="text-sm text-gray-600 mb-2">
                    {option.termMonths} months
                    {option.apr === 0 ? (
                      <span className="text-green-600 font-medium"> · 0% APR</span>
                    ) : (
                      <span> · {option.apr}% APR</span>
                    )}
                  </p>

                  {/* Highlight */}
                  {option.highlightText && (
                    <p className="text-xs text-blue-600 font-medium">
                      {option.highlightText}
                    </p>
                  )}

                  {/* Selection indicator */}
                  {isSelected && (
                    <div className="absolute top-3 left-3">
                      <div className="w-5 h-5 bg-green-500 rounded-full flex items-center justify-center">
                        <svg className="w-3 h-3 text-white" fill="currentColor" viewBox="0 0 20 20">
                          <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                        </svg>
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>

          {/* Pay in full option */}
          <div
            className={`mt-4 border-2 rounded-xl p-4 cursor-pointer transition-all ${
              selectedOption === null
                ? 'border-green-500 bg-green-50'
                : 'border-gray-200 hover:border-gray-300'
            }`}
            onClick={() => setSelectedOption(null)}
          >
            <div className="flex items-center justify-between">
              <div>
                <p className="font-semibold text-gray-900">Pay in Full</p>
                <p className="text-sm text-gray-600">No financing - pay today</p>
              </div>
              <p className="text-xl font-bold text-gray-900">{formatCurrency(cartTotal)}</p>
            </div>
          </div>
        </div>

        {/* Actions */}
        <div className="px-6 py-4 bg-gray-50 border-t border-gray-100 flex gap-3">
          <button
            onClick={() => onDecline?.()}
            className="flex-1 py-3 text-gray-600 hover:text-gray-800 font-medium transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={() => handleSelect(selectedOption)}
            disabled={isApplying}
            className="flex-1 py-3 bg-gray-900 hover:bg-gray-800 text-white font-semibold rounded-xl transition-colors disabled:opacity-50"
          >
            {isApplying ? 'Processing...' : selectedOption ? 'Apply for Financing' : 'Continue'}
          </button>
        </div>
      </div>
    );
  }

  // Standard variant (default) - featured best option with alternatives
  if (!bestOption) {
    return null;
  }

  const provider = PROVIDER_STYLES[bestOption.provider] || PROVIDER_STYLES.internal;

  return (
    <div className={`bg-white rounded-2xl shadow-lg overflow-hidden ${className}`}>
      {/* Header */}
      <div className={`${provider.bgColor} px-6 py-5`}>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-4">
            <div className="p-3 bg-white/20 rounded-xl">
              <svg className="w-8 h-8 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 10h18M7 15h1m4 0h1m-7 4h12a3 3 0 003-3V8a3 3 0 00-3-3H6a3 3 0 00-3 3v8a3 3 0 003 3z" />
              </svg>
            </div>
            <div>
              <h3 className="text-xl font-bold text-white">Pay Over Time</h3>
              <p className="text-white/80">with {provider.name}</p>
            </div>
          </div>
          {bestOption.isPromotional && (
            <span className="px-3 py-1 bg-yellow-400 text-yellow-900 text-xs font-bold rounded-full">
              LIMITED TIME
            </span>
          )}
        </div>
      </div>

      {/* Main offer */}
      <div className="p-6">
        <div className="text-center mb-6">
          <p className="text-sm text-gray-600 mb-2">As low as</p>
          <p className="text-5xl font-bold text-gray-900">
            {formatCurrency(bestOption.monthlyPayment)}
          </p>
          <p className="text-lg text-gray-600">/month</p>

          <div className="mt-4 flex items-center justify-center gap-4 text-sm">
            <span className="px-3 py-1 bg-gray-100 rounded-full text-gray-700">
              {bestOption.termMonths} months
            </span>
            {bestOption.apr === 0 ? (
              <span className="px-3 py-1 bg-green-100 rounded-full text-green-700 font-medium">
                0% APR
              </span>
            ) : (
              <span className="px-3 py-1 bg-gray-100 rounded-full text-gray-700">
                {bestOption.apr}% APR
              </span>
            )}
          </div>
        </div>

        {/* Highlight */}
        {bestOption.highlightText && (
          <div className={`${provider.lightBg} rounded-xl p-4 mb-6 text-center`}>
            <p className="font-semibold text-gray-900">{bestOption.highlightText}</p>
            {bestOption.promoEndDate && (
              <p className="text-sm text-gray-600 mt-1">
                Offer ends {new Date(bestOption.promoEndDate).toLocaleDateString()}
              </p>
            )}
          </div>
        )}

        {/* How it works */}
        <div className="mb-6">
          <h4 className="text-sm font-semibold text-gray-700 mb-3">How it works</h4>
          <div className="space-y-3">
            <div className="flex items-start gap-3">
              <div className="w-6 h-6 rounded-full bg-gray-100 flex items-center justify-center text-xs font-bold text-gray-600">
                1
              </div>
              <div>
                <p className="text-sm text-gray-900 font-medium">Quick application</p>
                <p className="text-xs text-gray-500">
                  {bestOption.instantDecision ? 'Get approved in seconds' : 'Decision within minutes'}
                </p>
              </div>
            </div>
            <div className="flex items-start gap-3">
              <div className="w-6 h-6 rounded-full bg-gray-100 flex items-center justify-center text-xs font-bold text-gray-600">
                2
              </div>
              <div>
                <p className="text-sm text-gray-900 font-medium">Choose your plan</p>
                <p className="text-xs text-gray-500">Select the payment schedule that works for you</p>
              </div>
            </div>
            <div className="flex items-start gap-3">
              <div className="w-6 h-6 rounded-full bg-gray-100 flex items-center justify-center text-xs font-bold text-gray-600">
                3
              </div>
              <div>
                <p className="text-sm text-gray-900 font-medium">Complete your purchase</p>
                <p className="text-xs text-gray-500">Take your items home today</p>
              </div>
            </div>
          </div>
        </div>

        {/* Other options */}
        {options.length > 1 && (
          <div className="mb-6">
            <button
              onClick={() => setShowTerms(!showTerms)}
              className="text-sm text-blue-600 hover:text-blue-700 font-medium flex items-center gap-1"
            >
              {showTerms ? 'Hide' : 'See'} other payment options
              <svg
                className={`w-4 h-4 transition-transform ${showTerms ? 'rotate-180' : ''}`}
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
              </svg>
            </button>

            {showTerms && (
              <div className="mt-3 space-y-2">
                {options.filter(o => o.financingId !== bestOption.financingId).map((option) => (
                  <button
                    key={option.financingId}
                    onClick={() => handleSelect(option)}
                    className="w-full flex items-center justify-between p-3 bg-gray-50 rounded-lg hover:bg-gray-100 transition-colors"
                  >
                    <div className="text-left">
                      <p className="text-sm font-medium text-gray-900">
                        {formatCurrency(option.monthlyPayment)}/mo for {option.termMonths} months
                      </p>
                      <p className="text-xs text-gray-500">
                        {option.apr === 0 ? '0% APR' : `${option.apr}% APR`}
                      </p>
                    </div>
                    <svg className="w-5 h-5 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                    </svg>
                  </button>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Disclaimer */}
        <p className="text-xs text-gray-400 text-center mb-4">
          Subject to credit approval. See terms for details.
        </p>
      </div>

      {/* Actions */}
      <div className="px-6 py-4 bg-gray-50 border-t border-gray-100 flex gap-3">
        <button
          onClick={() => onDecline?.()}
          className="flex-1 py-3 text-gray-600 hover:text-gray-800 font-medium transition-colors"
        >
          Pay in Full
        </button>
        <button
          onClick={() => handleSelect(bestOption)}
          disabled={isApplying}
          className={`flex-1 py-3 ${provider.bgColor} hover:opacity-90 text-white font-semibold rounded-xl transition-opacity disabled:opacity-50 flex items-center justify-center gap-2`}
        >
          {isApplying ? (
            <>
              <svg className="w-5 h-5 animate-spin" fill="none" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
              </svg>
              Applying...
            </>
          ) : (
            <>
              Apply Now
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 8l4 4m0 0l-4 4m4-4H3" />
              </svg>
            </>
          )}
        </button>
      </div>
    </div>
  );
}

export default FinancingPrompt;
