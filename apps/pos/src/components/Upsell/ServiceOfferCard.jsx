/**
 * TeleTime POS - Service Offer Card
 * Display service add-ons (installation, setup, delivery, etc.)
 */

import { useState } from 'react';
import { formatCurrency } from '../../utils/formatters';

// Service type icons
const SERVICE_ICONS = {
  installation: (
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
  ),
  setup: (
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 3v2m6-2v2M9 19v2m6-2v2M5 9H3m2 6H3m18-6h-2m2 6h-2M7 19h10a2 2 0 002-2V7a2 2 0 00-2-2H7a2 2 0 00-2 2v10a2 2 0 002 2zM9 9h6v6H9V9z" />
  ),
  training: (
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253" />
  ),
  delivery: (
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16V6a1 1 0 00-1-1H4a1 1 0 00-1 1v10a1 1 0 001 1h1m8-1a1 1 0 01-1 1H9m4-1V8a1 1 0 011-1h2.586a1 1 0 01.707.293l3.414 3.414a1 1 0 01.293.707V16a1 1 0 01-1 1h-1m-6-1a1 1 0 001 1h1M5 17a2 2 0 104 0m-4 0a2 2 0 114 0m6 0a2 2 0 104 0m-4 0a2 2 0 114 0" />
  ),
  support: (
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M18.364 5.636l-3.536 3.536m0 5.656l3.536 3.536M9.172 9.172L5.636 5.636m3.536 9.192l-3.536 3.536M21 12a9 9 0 11-18 0 9 9 0 0118 0zm-5 0a4 4 0 11-8 0 4 4 0 018 0z" />
  ),
  custom: (
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 3v4M3 5h4M6 17v4m-2-2h4m5-16l2.286 6.857L21 12l-5.714 2.143L13 21l-2.286-6.857L5 12l5.714-2.143L13 3z" />
  ),
};

// Service type colors
const SERVICE_COLORS = {
  installation: { bg: 'bg-blue-50', border: 'border-blue-200', icon: 'text-blue-600', button: 'bg-blue-600 hover:bg-blue-700' },
  setup: { bg: 'bg-purple-50', border: 'border-purple-200', icon: 'text-purple-600', button: 'bg-purple-600 hover:bg-purple-700' },
  training: { bg: 'bg-green-50', border: 'border-green-200', icon: 'text-green-600', button: 'bg-green-600 hover:bg-green-700' },
  delivery: { bg: 'bg-orange-50', border: 'border-orange-200', icon: 'text-orange-600', button: 'bg-orange-600 hover:bg-orange-700' },
  support: { bg: 'bg-teal-50', border: 'border-teal-200', icon: 'text-teal-600', button: 'bg-teal-600 hover:bg-teal-700' },
  custom: { bg: 'bg-indigo-50', border: 'border-indigo-200', icon: 'text-indigo-600', button: 'bg-indigo-600 hover:bg-indigo-700' },
};

/**
 * Service offer card component
 * @param {object} props
 * @param {object} props.service - Service data
 * @param {function} props.onAdd - Add service callback
 * @param {function} props.onDecline - Decline callback
 * @param {string} props.variant - 'standard' | 'compact' | 'featured'
 * @param {string} props.className - Additional CSS classes
 */
export function ServiceOfferCard({
  service,
  onAdd,
  onDecline,
  variant = 'standard',
  className = '',
}) {
  const [isAdding, setIsAdding] = useState(false);
  const [showDetails, setShowDetails] = useState(false);

  const {
    serviceId,
    name,
    description,
    price,
    priceCents,
    serviceType = 'custom',
    duration,
    requiresScheduling,
    matchType,
  } = service;

  const colors = SERVICE_COLORS[serviceType] || SERVICE_COLORS.custom;
  const icon = SERVICE_ICONS[serviceType] || SERVICE_ICONS.custom;

  // Handle add service
  const handleAdd = async () => {
    if (isAdding) return;
    setIsAdding(true);
    await onAdd?.(service);
    setIsAdding(false);
  };

  // Compact variant
  if (variant === 'compact') {
    return (
      <div className={`flex items-center gap-4 p-3 ${colors.bg} border ${colors.border} rounded-xl ${className}`}>
        <div className={`p-2 bg-white rounded-lg ${colors.icon}`}>
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            {icon}
          </svg>
        </div>

        <div className="flex-1 min-w-0">
          <h4 className="font-medium text-gray-900 text-sm">{name}</h4>
          <p className="text-xs text-gray-500">{formatCurrency(price)}</p>
        </div>

        <button
          onClick={handleAdd}
          disabled={isAdding}
          className={`px-4 py-2 text-white text-sm font-medium rounded-lg ${colors.button} transition-colors disabled:opacity-50`}
        >
          {isAdding ? '...' : 'Add'}
        </button>
      </div>
    );
  }

  // Featured variant
  if (variant === 'featured') {
    return (
      <div className={`relative overflow-hidden rounded-2xl shadow-lg ${className}`}>
        {/* Background gradient */}
        <div className={`absolute inset-0 ${colors.bg} opacity-50`} />
        <div className="absolute inset-0 bg-gradient-to-br from-white/80 to-transparent" />

        <div className="relative p-6">
          {/* Badge */}
          {matchType === 'product' && (
            <div className="absolute top-4 right-4">
              <span className="px-2 py-1 bg-green-500 text-white text-xs font-bold rounded-full">
                RECOMMENDED
              </span>
            </div>
          )}

          {/* Icon and Title */}
          <div className="flex items-start gap-4 mb-4">
            <div className={`p-3 ${colors.bg} border ${colors.border} rounded-xl`}>
              <svg className={`w-8 h-8 ${colors.icon}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                {icon}
              </svg>
            </div>
            <div>
              <h3 className="text-lg font-bold text-gray-900">{name}</h3>
              {duration && (
                <p className="text-sm text-gray-500 flex items-center gap-1">
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                  {duration} minutes
                </p>
              )}
            </div>
          </div>

          {/* Description */}
          <p className="text-gray-600 text-sm mb-4">{description}</p>

          {/* Scheduling note */}
          {requiresScheduling && (
            <div className="flex items-center gap-2 text-sm text-amber-600 bg-amber-50 px-3 py-2 rounded-lg mb-4">
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
              </svg>
              <span>Requires scheduling after purchase</span>
            </div>
          )}

          {/* Price and Action */}
          <div className="flex items-center justify-between">
            <div>
              <p className="text-2xl font-bold text-gray-900">{formatCurrency(price)}</p>
            </div>
            <div className="flex gap-2">
              {onDecline && (
                <button
                  onClick={() => onDecline?.(service)}
                  className="px-4 py-2 text-gray-600 hover:text-gray-800 font-medium transition-colors"
                >
                  No thanks
                </button>
              )}
              <button
                onClick={handleAdd}
                disabled={isAdding}
                className={`px-6 py-2.5 text-white font-semibold rounded-xl ${colors.button} transition-colors disabled:opacity-50 flex items-center gap-2`}
              >
                {isAdding ? (
                  <>
                    <svg className="w-5 h-5 animate-spin" fill="none" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                    </svg>
                    Adding...
                  </>
                ) : (
                  <>
                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                    </svg>
                    Add Service
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // Standard variant (default)
  return (
    <div className={`border ${colors.border} rounded-xl overflow-hidden ${className}`}>
      {/* Header */}
      <div className={`${colors.bg} px-4 py-3 flex items-center justify-between`}>
        <div className="flex items-center gap-3">
          <div className={`p-2 bg-white rounded-lg ${colors.icon}`}>
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              {icon}
            </svg>
          </div>
          <div>
            <h4 className="font-semibold text-gray-900">{name}</h4>
            {duration && (
              <p className="text-xs text-gray-500">{duration} min service</p>
            )}
          </div>
        </div>
        <p className="text-lg font-bold text-gray-900">{formatCurrency(price)}</p>
      </div>

      {/* Content */}
      <div className="p-4">
        <p className="text-sm text-gray-600 mb-3">{description}</p>

        {/* What's included (expandable) */}
        <button
          onClick={() => setShowDetails(!showDetails)}
          className="text-sm text-blue-600 hover:text-blue-700 font-medium flex items-center gap-1 mb-3"
        >
          {showDetails ? 'Hide details' : "What's included"}
          <svg
            className={`w-4 h-4 transition-transform ${showDetails ? 'rotate-180' : ''}`}
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
          </svg>
        </button>

        {showDetails && (
          <div className="mb-4 p-3 bg-gray-50 rounded-lg text-sm space-y-2">
            <div className="flex items-center gap-2 text-gray-600">
              <svg className="w-4 h-4 text-green-500" fill="currentColor" viewBox="0 0 20 20">
                <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
              </svg>
              <span>Professional technician</span>
            </div>
            <div className="flex items-center gap-2 text-gray-600">
              <svg className="w-4 h-4 text-green-500" fill="currentColor" viewBox="0 0 20 20">
                <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
              </svg>
              <span>All necessary equipment</span>
            </div>
            <div className="flex items-center gap-2 text-gray-600">
              <svg className="w-4 h-4 text-green-500" fill="currentColor" viewBox="0 0 20 20">
                <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
              </svg>
              <span>Satisfaction guaranteed</span>
            </div>
            {requiresScheduling && (
              <div className="flex items-center gap-2 text-amber-600">
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
                </svg>
                <span>We'll schedule at your convenience</span>
              </div>
            )}
          </div>
        )}

        {/* Actions */}
        <div className="flex gap-2">
          {onDecline && (
            <button
              onClick={() => onDecline?.(service)}
              className="flex-1 py-2.5 text-gray-600 hover:text-gray-800 font-medium transition-colors"
            >
              No thanks
            </button>
          )}
          <button
            onClick={handleAdd}
            disabled={isAdding}
            className={`flex-1 py-2.5 text-white font-semibold rounded-lg ${colors.button} transition-colors disabled:opacity-50 flex items-center justify-center gap-2`}
          >
            {isAdding ? (
              'Adding...'
            ) : (
              <>
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                </svg>
                Add Service
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}

export default ServiceOfferCard;
