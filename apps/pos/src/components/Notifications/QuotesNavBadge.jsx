/**
 * Quotes Nav Badge Component
 * Shows count of expiring quotes on navigation item
 */

import React from 'react';
import { useExpiringQuotes } from '../../hooks/useExpiringQuotes';

/**
 * Badge variants based on urgency
 */
const BADGE_VARIANTS = {
  urgent: 'bg-red-500 text-white animate-pulse',
  warning: 'bg-orange-500 text-white',
  info: 'bg-yellow-500 text-white',
  none: 'bg-gray-400 text-white',
};

/**
 * Compact badge for nav items
 */
export function QuotesBadge({ count, variant = 'info', size = 'sm' }) {
  if (!count || count <= 0) return null;

  const sizeClasses = {
    xs: 'min-w-4 h-4 text-[10px]',
    sm: 'min-w-5 h-5 text-xs',
    md: 'min-w-6 h-6 text-sm',
  };

  return (
    <span
      className={`
        inline-flex items-center justify-center
        rounded-full font-bold
        ${sizeClasses[size]}
        ${BADGE_VARIANTS[variant]}
      `}
    >
      {count > 99 ? '99+' : count}
    </span>
  );
}

/**
 * Full nav badge with auto-fetching
 */
export default function QuotesNavBadge({
  salesRepId = null,
  showZero = false,
  className = '',
}) {
  const { stats, hasUrgentQuotes, loading } = useExpiringQuotes({
    salesRepId,
    daysAhead: 7,
    maxQuotes: 1, // We only need the count
    pollInterval: 5 * 60 * 1000,
  });

  // Don't show while loading initially
  if (loading && !stats.expiringIn7Days) {
    return null;
  }

  const count = stats.expiringIn7Days || 0;

  if (count === 0 && !showZero) {
    return null;
  }

  // Determine variant based on urgency
  let variant = 'info';
  if (stats.expiringToday > 0) {
    variant = 'urgent';
  } else if (stats.expiringIn3Days > 0) {
    variant = 'warning';
  }

  return (
    <span className={`relative ${className}`}>
      <QuotesBadge count={count} variant={variant} />
    </span>
  );
}

/**
 * Wrapper for nav items that adds the badge
 */
export function QuotesNavItem({
  children,
  salesRepId = null,
  badgePosition = 'top-right',
  className = '',
}) {
  const positionClasses = {
    'top-right': 'absolute -top-1 -right-1',
    'top-left': 'absolute -top-1 -left-1',
    'inline': 'ml-2',
  };

  return (
    <span className={`relative inline-flex items-center ${className}`}>
      {children}
      <span className={positionClasses[badgePosition]}>
        <QuotesNavBadge salesRepId={salesRepId} />
      </span>
    </span>
  );
}
