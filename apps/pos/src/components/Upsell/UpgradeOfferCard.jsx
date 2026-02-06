/**
 * TeleTime POS - Upgrade Offer Card
 * Side-by-side comparison for product upgrades
 */

import { useState, useEffect } from 'react';
import { formatCurrency } from '../../utils/formatters';

/**
 * Upgrade offer card component
 * @param {object} props
 * @param {object} props.offer - Upgrade offer data
 * @param {function} props.onAccept - Accept upgrade callback
 * @param {function} props.onDecline - Decline upgrade callback
 * @param {boolean} props.loading - Loading state
 * @param {string} props.className - Additional CSS classes
 */
export function UpgradeOfferCard({
  offer,
  onAccept,
  onDecline,
  loading = false,
  className = '',
}) {
  const [isAccepting, setIsAccepting] = useState(false);
  const [isDeclining, setIsDeclining] = useState(false);

  const {
    currentItem,
    suggestedItem,
    priceDifference,
    valueProposition,
    featureComparison = [],
    badgeText,
    urgency,
    urgencyLevel,
  } = offer;

  // Handle accept
  const handleAccept = async () => {
    if (loading || isAccepting) return;
    setIsAccepting(true);
    await onAccept?.(offer);
    setIsAccepting(false);
  };

  // Handle decline
  const handleDecline = async () => {
    if (loading || isDeclining) return;
    setIsDeclining(true);
    await onDecline?.(offer);
    setIsDeclining(false);
  };

  return (
    <div className={`bg-white rounded-2xl shadow-lg overflow-hidden ${className}`}>
      {/* Header */}
      <div className="bg-gradient-to-r from-blue-600 to-indigo-600 px-6 py-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-white/20 rounded-lg">
              <svg
                className="w-6 h-6 text-white"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M13 7h8m0 0v8m0-8l-8 8-4-4-6 6"
                />
              </svg>
            </div>
            <div>
              <h3 className="text-lg font-bold text-white">Upgrade Available</h3>
              <p className="text-blue-100 text-sm">Better value for your needs</p>
            </div>
          </div>
          {badgeText && (
            <span className="px-3 py-1 bg-yellow-400 text-yellow-900 text-xs font-bold rounded-full">
              {badgeText}
            </span>
          )}
        </div>

        {/* Urgency indicator */}
        {urgency && (
          <div className={`mt-3 flex items-center gap-2 text-sm ${
            urgencyLevel === 'high' ? 'text-yellow-300' : 'text-blue-200'
          }`}>
            <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
              <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm1-12a1 1 0 10-2 0v4a1 1 0 00.293.707l2.828 2.829a1 1 0 101.415-1.415L11 9.586V6z" clipRule="evenodd" />
            </svg>
            <span className="font-medium">{urgency}</span>
          </div>
        )}
      </div>

      {/* Comparison */}
      <div className="p-6">
        <div className="grid grid-cols-2 gap-6">
          {/* Current Product */}
          <div className="relative">
            <div className="absolute -top-3 left-4">
              <span className="px-2 py-0.5 bg-gray-200 text-gray-600 text-xs font-medium rounded-full">
                CURRENT
              </span>
            </div>
            <div className="p-4 bg-gray-50 rounded-xl border-2 border-gray-200">
              <div className="h-24 mb-3 flex items-center justify-center bg-white rounded-lg">
                <svg className="w-12 h-12 text-gray-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4" />
                </svg>
              </div>
              <h4 className="font-semibold text-gray-900 text-sm line-clamp-2 mb-2">
                {currentItem?.name}
              </h4>
              <p className="text-xl font-bold text-gray-700">
                {formatCurrency(currentItem?.price || 0)}
              </p>
            </div>
          </div>

          {/* Upgrade Product */}
          <div className="relative">
            <div className="absolute -top-3 left-4">
              <span className="px-2 py-0.5 bg-green-500 text-white text-xs font-medium rounded-full">
                UPGRADE
              </span>
            </div>
            <div className="p-4 bg-green-50 rounded-xl border-2 border-green-300 ring-2 ring-green-100">
              <div className="h-24 mb-3 flex items-center justify-center bg-white rounded-lg">
                <svg className="w-14 h-14 text-green-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4" />
                </svg>
              </div>
              <h4 className="font-semibold text-gray-900 text-sm line-clamp-2 mb-2">
                {suggestedItem?.name}
              </h4>
              <p className="text-xl font-bold text-green-600">
                {formatCurrency(suggestedItem?.price || 0)}
              </p>
            </div>
          </div>
        </div>

        {/* Arrow between products */}
        <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 hidden md:block">
          <div className="w-10 h-10 bg-blue-600 rounded-full flex items-center justify-center shadow-lg">
            <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 8l4 4m0 0l-4 4m4-4H3" />
            </svg>
          </div>
        </div>

        {/* Price Difference */}
        <div className="mt-6 p-4 bg-blue-50 rounded-xl text-center">
          <p className="text-sm text-blue-600 font-medium mb-1">Upgrade for just</p>
          <p className="text-3xl font-bold text-blue-700">
            +{formatCurrency(priceDifference || 0)}
          </p>
          {valueProposition && (
            <p className="mt-2 text-sm text-blue-600">{valueProposition}</p>
          )}
        </div>

        {/* Feature Comparison */}
        {featureComparison.length > 0 && (
          <div className="mt-6">
            <h4 className="text-sm font-semibold text-gray-700 mb-3">What you get:</h4>
            <div className="space-y-2">
              {featureComparison.map((feature, index) => (
                <div
                  key={index}
                  className="flex items-center justify-between p-3 bg-gray-50 rounded-lg"
                >
                  <span className="text-sm text-gray-600">{feature.feature}</span>
                  <div className="flex items-center gap-3">
                    <span className="text-sm text-gray-400 line-through">
                      {feature.current}
                    </span>
                    <svg className="w-4 h-4 text-green-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 7l5 5m0 0l-5 5m5-5H6" />
                    </svg>
                    <span className="text-sm font-semibold text-green-600">
                      {feature.upgrade}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Actions */}
        <div className="mt-6 flex gap-3">
          <button
            onClick={handleDecline}
            disabled={loading || isDeclining}
            className="flex-1 py-3 px-4 bg-gray-100 hover:bg-gray-200 text-gray-700 font-medium rounded-xl transition-colors disabled:opacity-50"
          >
            {isDeclining ? 'Processing...' : 'Keep Current'}
          </button>
          <button
            onClick={handleAccept}
            disabled={loading || isAccepting}
            className="flex-1 py-3 px-4 bg-blue-600 hover:bg-blue-700 text-white font-semibold rounded-xl transition-colors flex items-center justify-center gap-2 disabled:opacity-50"
          >
            {isAccepting ? (
              <>
                <svg className="w-5 h-5 animate-spin" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                </svg>
                Upgrading...
              </>
            ) : (
              <>
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 10l7-7m0 0l7 7m-7-7v18" />
                </svg>
                Upgrade
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}

export default UpgradeOfferCard;
