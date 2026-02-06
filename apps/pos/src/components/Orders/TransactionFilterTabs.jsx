/**
 * TeleTime POS - Transaction Filter Tabs
 * Status filter tabs with animated counts
 */

import { useState, useEffect, useRef } from 'react';
import {
  CheckCircleIcon,
  ClockIcon,
  XCircleIcon,
  ArrowUturnLeftIcon,
  Squares2X2Icon,
} from '@heroicons/react/24/outline';

/**
 * Animated count badge
 * Provides subtle animation when count changes
 */
function AnimatedCount({ count, isLoading, isEmpty }) {
  const [displayCount, setDisplayCount] = useState(count);
  const [isAnimating, setIsAnimating] = useState(false);
  const prevCountRef = useRef(count);

  useEffect(() => {
    if (count !== prevCountRef.current) {
      setIsAnimating(true);

      // Animate to new count
      const timeout = setTimeout(() => {
        setDisplayCount(count);
        setIsAnimating(false);
      }, 150);

      prevCountRef.current = count;
      return () => clearTimeout(timeout);
    }
  }, [count]);

  return (
    <span
      className={`
        inline-flex items-center justify-center min-w-[1.5rem] px-1.5 py-0.5
        text-xs font-medium rounded-full tabular-nums
        transition-all duration-200
        ${isLoading ? 'opacity-50' : ''}
        ${isAnimating ? 'scale-110' : 'scale-100'}
        ${isEmpty
          ? 'bg-gray-100 text-gray-400'
          : 'bg-gray-200 text-gray-600'
        }
      `}
    >
      {isLoading ? (
        <span className="w-3 h-3 border-2 border-gray-300 border-t-gray-500 rounded-full animate-spin" />
      ) : (
        displayCount
      )}
    </span>
  );
}

/**
 * Single filter tab
 */
function FilterTab({
  label,
  icon: Icon,
  iconColor,
  count,
  isActive,
  isLoading,
  isEmpty,
  onClick,
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={isLoading}
      className={`
        group relative flex items-center gap-2 px-4 py-2.5
        text-sm font-medium rounded-lg
        transition-all duration-200
        ${isActive
          ? 'bg-white text-gray-900 shadow-sm ring-1 ring-gray-200'
          : isEmpty
            ? 'text-gray-400 hover:text-gray-500 hover:bg-gray-50'
            : 'text-gray-600 hover:text-gray-900 hover:bg-white/60'
        }
        ${isLoading ? 'cursor-wait' : 'cursor-pointer'}
        disabled:cursor-not-allowed
      `}
    >
      {/* Icon */}
      {Icon && (
        <Icon
          className={`
            w-4 h-4 transition-colors duration-200
            ${isActive
              ? iconColor
              : isEmpty
                ? 'text-gray-300'
                : 'text-gray-400 group-hover:text-gray-500'
            }
          `}
        />
      )}

      {/* Label */}
      <span className={isEmpty && !isActive ? 'opacity-60' : ''}>
        {label}
      </span>

      {/* Count badge */}
      <AnimatedCount
        count={count}
        isLoading={isLoading}
        isEmpty={isEmpty}
      />

      {/* Active indicator underline */}
      {isActive && (
        <span
          className="absolute bottom-0 left-4 right-4 h-0.5 bg-blue-500 rounded-full"
          style={{ bottom: '-1px' }}
        />
      )}
    </button>
  );
}

/**
 * Transaction Filter Tabs Component
 * @param {object} props
 * @param {string|null} props.activeStatus - Currently active status filter
 * @param {object} props.counts - Status counts object { all, pending, completed, voided, refunded }
 * @param {boolean} props.isLoading - Whether counts are loading
 * @param {function} props.onStatusChange - Callback when status changes
 * @param {string} props.className - Additional CSS classes
 */
export default function TransactionFilterTabs({
  activeStatus = null,
  counts = {},
  isLoading = false,
  onStatusChange,
  className = '',
}) {
  const tabs = [
    {
      key: null,
      label: 'All',
      countKey: 'all',
      icon: Squares2X2Icon,
      iconColor: 'text-blue-500',
    },
    {
      key: 'completed',
      label: 'Completed',
      countKey: 'completed',
      icon: CheckCircleIcon,
      iconColor: 'text-green-500',
    },
    {
      key: 'pending',
      label: 'Pending',
      countKey: 'pending',
      icon: ClockIcon,
      iconColor: 'text-amber-500',
    },
    {
      key: 'voided',
      label: 'Voided',
      countKey: 'voided',
      icon: XCircleIcon,
      iconColor: 'text-red-500',
    },
    {
      key: 'refunded',
      label: 'Refunded',
      countKey: 'refunded',
      icon: ArrowUturnLeftIcon,
      iconColor: 'text-purple-500',
    },
  ];

  return (
    <div
      className={`
        inline-flex gap-1 p-1.5
        bg-gray-100/80 backdrop-blur-sm
        rounded-xl border border-gray-200
        ${className}
      `}
      role="tablist"
      aria-label="Transaction status filter"
    >
      {tabs.map((tab) => {
        const count = counts[tab.countKey] ?? 0;
        const isEmpty = count === 0;
        const isActive = activeStatus === tab.key;

        return (
          <FilterTab
            key={tab.key ?? 'all'}
            label={tab.label}
            icon={tab.icon}
            iconColor={tab.iconColor}
            count={count}
            isActive={isActive}
            isLoading={isLoading}
            isEmpty={isEmpty}
            onClick={() => onStatusChange?.(tab.key)}
          />
        );
      })}
    </div>
  );
}

/**
 * Compact variant for smaller spaces
 */
export function TransactionFilterTabsCompact({
  activeStatus = null,
  counts = {},
  isLoading = false,
  onStatusChange,
  className = '',
}) {
  const tabs = [
    { key: null, label: 'All', countKey: 'all' },
    { key: 'completed', label: 'Done', countKey: 'completed', color: 'text-green-600' },
    { key: 'pending', label: 'Pending', countKey: 'pending', color: 'text-amber-600' },
    { key: 'voided', label: 'Void', countKey: 'voided', color: 'text-red-600' },
    { key: 'refunded', label: 'Refund', countKey: 'refunded', color: 'text-purple-600' },
  ];

  return (
    <div
      className={`inline-flex gap-0.5 p-1 bg-gray-100 rounded-lg ${className}`}
      role="tablist"
    >
      {tabs.map((tab) => {
        const count = counts[tab.countKey] ?? 0;
        const isEmpty = count === 0;
        const isActive = activeStatus === tab.key;

        return (
          <button
            key={tab.key ?? 'all'}
            type="button"
            onClick={() => onStatusChange?.(tab.key)}
            disabled={isLoading}
            role="tab"
            aria-selected={isActive}
            className={`
              px-2.5 py-1.5 text-xs font-medium rounded-md
              transition-all duration-150
              ${isActive
                ? 'bg-white text-gray-900 shadow-sm'
                : isEmpty
                  ? 'text-gray-400 hover:text-gray-500'
                  : 'text-gray-600 hover:text-gray-800 hover:bg-white/50'
              }
            `}
          >
            <span className={isActive && tab.color ? tab.color : ''}>
              {tab.label}
            </span>
            <span className={`ml-1 tabular-nums ${isEmpty ? 'opacity-50' : ''}`}>
              ({count})
            </span>
          </button>
        );
      })}
    </div>
  );
}
