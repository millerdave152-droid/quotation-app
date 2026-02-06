/**
 * TeleTime POS - Membership Prompt
 * Prompt to join loyalty/membership program
 */

import { useState } from 'react';
import { formatCurrency } from '../../utils/formatters';

/**
 * Membership prompt component
 * @param {object} props
 * @param {object} props.offer - Membership offer data
 * @param {function} props.onJoin - Join membership callback
 * @param {function} props.onDecline - Decline callback
 * @param {number} props.cartValue - Current cart value for savings calculation
 * @param {string} props.variant - 'standard' | 'compact' | 'banner'
 * @param {string} props.className - Additional CSS classes
 */
export function MembershipPrompt({
  offer,
  onJoin,
  onDecline,
  cartValue = 0,
  variant = 'standard',
  className = '',
}) {
  const [isJoining, setIsJoining] = useState(false);
  const [selectedProgram, setSelectedProgram] = useState(null);

  const {
    type, // 'signup' or 'upgrade'
    program,
    potentialSavings,
    signupBonus,
    totalValue,
    message,
    currentProgram,
  } = offer;

  // Handle join
  const handleJoin = async (programToJoin = program) => {
    if (isJoining) return;
    setIsJoining(true);
    await onJoin?.({ ...offer, program: programToJoin });
    setIsJoining(false);
  };

  // Banner variant (slim)
  if (variant === 'banner') {
    return (
      <div className={`bg-gradient-to-r from-indigo-600 to-purple-600 rounded-xl px-4 py-3 ${className}`}>
        <div className="flex items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-white/20 rounded-lg">
              <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
            </div>
            <div>
              <p className="text-white font-medium text-sm">
                {type === 'upgrade'
                  ? `Upgrade to ${program.name} and save more!`
                  : `Join ${program.name} today!`}
              </p>
              {potentialSavings > 0 && (
                <p className="text-indigo-200 text-xs">
                  Save {formatCurrency(potentialSavings)} on this order
                </p>
              )}
            </div>
          </div>
          <button
            onClick={() => handleJoin()}
            disabled={isJoining}
            className="px-4 py-1.5 bg-white text-indigo-600 text-sm font-semibold rounded-lg hover:bg-indigo-50 transition-colors disabled:opacity-50"
          >
            {isJoining ? '...' : type === 'upgrade' ? 'Upgrade' : 'Join'}
          </button>
        </div>
      </div>
    );
  }

  // Compact variant
  if (variant === 'compact') {
    return (
      <div className={`border border-indigo-200 rounded-xl overflow-hidden ${className}`}>
        <div className="bg-indigo-50 px-4 py-3 flex items-center gap-3">
          <div className="p-2 bg-indigo-100 rounded-lg">
            <svg className="w-5 h-5 text-indigo-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 3v4M3 5h4M6 17v4m-2-2h4m5-16l2.286 6.857L21 12l-5.714 2.143L13 21l-2.286-6.857L5 12l5.714-2.143L13 3z" />
            </svg>
          </div>
          <div className="flex-1">
            <h4 className="font-semibold text-gray-900">{program.name}</h4>
            <p className="text-sm text-gray-600">{program.discountPercent}% off every purchase</p>
          </div>
          <div className="text-right">
            <p className="font-bold text-indigo-600">{formatCurrency(program.annualFee)}/yr</p>
            {signupBonus > 0 && (
              <p className="text-xs text-green-600">+{formatCurrency(signupBonus)} bonus</p>
            )}
          </div>
        </div>
        <div className="p-4 flex gap-2">
          <button
            onClick={() => onDecline?.()}
            className="flex-1 py-2 text-gray-600 hover:text-gray-800 font-medium"
          >
            No thanks
          </button>
          <button
            onClick={() => handleJoin()}
            disabled={isJoining}
            className="flex-1 py-2 bg-indigo-600 hover:bg-indigo-700 text-white font-semibold rounded-lg transition-colors disabled:opacity-50"
          >
            {isJoining ? 'Joining...' : 'Join Now'}
          </button>
        </div>
      </div>
    );
  }

  // Standard variant (default) - full card with benefits
  return (
    <div className={`bg-white rounded-2xl shadow-lg overflow-hidden ${className}`}>
      {/* Header */}
      <div className="bg-gradient-to-r from-indigo-600 via-purple-600 to-pink-500 px-6 py-5">
        <div className="flex items-center gap-4">
          <div className="p-3 bg-white/20 rounded-xl">
            <svg className="w-8 h-8 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 3v4M3 5h4M6 17v4m-2-2h4m5-16l2.286 6.857L21 12l-5.714 2.143L13 21l-2.286-6.857L5 12l5.714-2.143L13 3z" />
            </svg>
          </div>
          <div>
            <h3 className="text-xl font-bold text-white">
              {type === 'upgrade'
                ? `Upgrade to ${program.name}`
                : `Join ${program.name}`}
            </h3>
            <p className="text-indigo-200">{message || 'Unlock exclusive member benefits'}</p>
          </div>
        </div>

        {/* Current tier (for upgrades) */}
        {type === 'upgrade' && currentProgram && (
          <div className="mt-3 text-sm text-indigo-200">
            Current tier: <span className="font-medium text-white">{currentProgram}</span>
          </div>
        )}
      </div>

      {/* Savings highlight */}
      {(potentialSavings > 0 || signupBonus > 0) && (
        <div className="bg-green-50 px-6 py-4 border-b border-green-100">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-green-100 rounded-lg">
                <svg className="w-5 h-5 text-green-600" fill="currentColor" viewBox="0 0 20 20">
                  <path fillRule="evenodd" d="M5 2a2 2 0 00-2 2v14l3.5-2 3.5 2 3.5-2 3.5 2V4a2 2 0 00-2-2H5zm2.5 3a1.5 1.5 0 100 3 1.5 1.5 0 000-3zm6.207.293a1 1 0 00-1.414 0l-6 6a1 1 0 101.414 1.414l6-6a1 1 0 000-1.414zM12.5 10a1.5 1.5 0 100 3 1.5 1.5 0 000-3z" clipRule="evenodd" />
                </svg>
              </div>
              <div>
                <p className="text-sm text-green-800 font-medium">
                  Join today and save on this order!
                </p>
                <p className="text-xs text-green-600">
                  {potentialSavings > 0 && `${formatCurrency(potentialSavings)} off this purchase`}
                  {potentialSavings > 0 && signupBonus > 0 && ' + '}
                  {signupBonus > 0 && `${formatCurrency(signupBonus)} signup bonus`}
                </p>
              </div>
            </div>
            <div className="text-right">
              <p className="text-2xl font-bold text-green-600">
                {formatCurrency(totalValue || (potentialSavings + signupBonus))}
              </p>
              <p className="text-xs text-green-600">total value</p>
            </div>
          </div>
        </div>
      )}

      {/* Benefits */}
      <div className="px-6 py-5">
        <h4 className="text-sm font-semibold text-gray-700 mb-3">Member Benefits</h4>
        <div className="space-y-3">
          {program.discountPercent > 0 && (
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 rounded-full bg-indigo-100 flex items-center justify-center">
                <svg className="w-4 h-4 text-indigo-600" fill="currentColor" viewBox="0 0 20 20">
                  <path fillRule="evenodd" d="M5 2a2 2 0 00-2 2v14l3.5-2 3.5 2 3.5-2 3.5 2V4a2 2 0 00-2-2H5zm2.5 3a1.5 1.5 0 100 3 1.5 1.5 0 000-3zm6.207.293a1 1 0 00-1.414 0l-6 6a1 1 0 101.414 1.414l6-6a1 1 0 000-1.414zM12.5 10a1.5 1.5 0 100 3 1.5 1.5 0 000-3z" clipRule="evenodd" />
                </svg>
              </div>
              <div>
                <p className="font-medium text-gray-900">{program.discountPercent}% Off Every Purchase</p>
                <p className="text-sm text-gray-500">Automatic discount at checkout</p>
              </div>
            </div>
          )}

          {program.pointsMultiplier > 1 && (
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 rounded-full bg-purple-100 flex items-center justify-center">
                <svg className="w-4 h-4 text-purple-600" fill="currentColor" viewBox="0 0 20 20">
                  <path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z" />
                </svg>
              </div>
              <div>
                <p className="font-medium text-gray-900">{program.pointsMultiplier}x Rewards Points</p>
                <p className="text-sm text-gray-500">Earn points faster on every purchase</p>
              </div>
            </div>
          )}

          {program.freeShippingThreshold === 0 || program.freeShippingThreshold === null ? (
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 rounded-full bg-blue-100 flex items-center justify-center">
                <svg className="w-4 h-4 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 8h14M5 8a2 2 0 110-4h14a2 2 0 110 4M5 8v10a2 2 0 002 2h10a2 2 0 002-2V8m-9 4h4" />
                </svg>
              </div>
              <div>
                <p className="font-medium text-gray-900">Free Shipping</p>
                <p className="text-sm text-gray-500">On all orders, no minimum</p>
              </div>
            </div>
          ) : program.freeShippingThreshold && (
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 rounded-full bg-blue-100 flex items-center justify-center">
                <svg className="w-4 h-4 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 8h14M5 8a2 2 0 110-4h14a2 2 0 110 4M5 8v10a2 2 0 002 2h10a2 2 0 002-2V8m-9 4h4" />
                </svg>
              </div>
              <div>
                <p className="font-medium text-gray-900">Reduced Shipping Threshold</p>
                <p className="text-sm text-gray-500">Free shipping on orders over {formatCurrency(program.freeShippingThreshold)}</p>
              </div>
            </div>
          )}

          {signupBonus > 0 && (
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 rounded-full bg-green-100 flex items-center justify-center">
                <svg className="w-4 h-4 text-green-600" fill="currentColor" viewBox="0 0 20 20">
                  <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm1-11a1 1 0 10-2 0v2H7a1 1 0 100 2h2v2a1 1 0 102 0v-2h2a1 1 0 100-2h-2V7z" clipRule="evenodd" />
                </svg>
              </div>
              <div>
                <p className="font-medium text-gray-900">{formatCurrency(signupBonus)} Signup Bonus</p>
                <p className="text-sm text-gray-500">Store credit applied to your account</p>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Pricing */}
      <div className="px-6 py-4 bg-gray-50 border-t border-gray-100">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-sm text-gray-600">Annual membership</p>
            <p className="text-2xl font-bold text-gray-900">
              {program.annualFee === 0 ? 'FREE' : formatCurrency(program.annualFee)}
              {program.annualFee > 0 && <span className="text-sm font-normal text-gray-500">/year</span>}
            </p>
          </div>
          <div
            className="w-12 h-12 rounded-full flex items-center justify-center"
            style={{ backgroundColor: program.badgeColor || '#4F46E5' }}
          >
            <span className="text-white font-bold text-lg">
              {program.tierLevel || 1}
            </span>
          </div>
        </div>
      </div>

      {/* Actions */}
      <div className="px-6 py-4 flex gap-3">
        <button
          onClick={() => onDecline?.()}
          className="flex-1 py-3 text-gray-600 hover:text-gray-800 font-medium transition-colors"
        >
          No thanks
        </button>
        <button
          onClick={() => handleJoin()}
          disabled={isJoining}
          className="flex-1 py-3 bg-gradient-to-r from-indigo-600 to-purple-600 hover:from-indigo-700 hover:to-purple-700 text-white font-semibold rounded-xl transition-colors disabled:opacity-50 flex items-center justify-center gap-2"
        >
          {isJoining ? (
            <>
              <svg className="w-5 h-5 animate-spin" fill="none" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
              </svg>
              Processing...
            </>
          ) : (
            <>
              <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 20 20">
                <path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z" />
              </svg>
              {type === 'upgrade' ? 'Upgrade Now' : 'Join Now'}
            </>
          )}
        </button>
      </div>
    </div>
  );
}

export default MembershipPrompt;
