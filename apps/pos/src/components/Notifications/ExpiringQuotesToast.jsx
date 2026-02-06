/**
 * Expiring Quotes Toast Component
 * Shows toast notification for quotes expiring today on page load
 */

import React, { useState, useEffect, useCallback } from 'react';
import { createPortal } from 'react-dom';
import {
  ExclamationTriangleIcon,
  XMarkIcon,
  ClockIcon,
  CurrencyDollarIcon,
  ChevronRightIcon,
} from '@heroicons/react/24/outline';
import { ExclamationCircleIcon } from '@heroicons/react/24/solid';

const API_BASE = import.meta.env.VITE_API_URL || 'http://localhost:3001/api';

// Session storage key to track if toast was dismissed
const TOAST_DISMISSED_KEY = 'expiring_quotes_toast_dismissed';
const TOAST_DISMISSED_EXPIRY = 4 * 60 * 60 * 1000; // 4 hours

/**
 * Format currency compactly
 */
function formatCurrency(amount) {
  if (amount == null) return '$0';
  if (amount >= 1000) return `$${(amount / 1000).toFixed(1)}K`;
  return `$${Math.round(amount).toLocaleString()}`;
}

/**
 * Check if toast was recently dismissed
 */
function wasRecentlyDismissed() {
  try {
    const dismissed = sessionStorage.getItem(TOAST_DISMISSED_KEY);
    if (!dismissed) return false;

    const dismissedTime = parseInt(dismissed, 10);
    return Date.now() - dismissedTime < TOAST_DISMISSED_EXPIRY;
  } catch {
    return false;
  }
}

/**
 * Mark toast as dismissed
 */
function markDismissed() {
  try {
    sessionStorage.setItem(TOAST_DISMISSED_KEY, Date.now().toString());
  } catch {
    // Ignore storage errors
  }
}

/**
 * Toast notification component
 */
function Toast({
  type = 'warning',
  title,
  message,
  action,
  onAction,
  onDismiss,
  autoDismiss = 0,
}) {
  useEffect(() => {
    if (autoDismiss > 0) {
      const timer = setTimeout(onDismiss, autoDismiss);
      return () => clearTimeout(timer);
    }
  }, [autoDismiss, onDismiss]);

  const typeStyles = {
    urgent: {
      bg: 'bg-red-50 border-red-200',
      icon: 'bg-red-100 text-red-600',
      title: 'text-red-800',
      message: 'text-red-700',
      button: 'bg-red-600 hover:bg-red-700 text-white',
    },
    warning: {
      bg: 'bg-orange-50 border-orange-200',
      icon: 'bg-orange-100 text-orange-600',
      title: 'text-orange-800',
      message: 'text-orange-700',
      button: 'bg-orange-600 hover:bg-orange-700 text-white',
    },
    info: {
      bg: 'bg-blue-50 border-blue-200',
      icon: 'bg-blue-100 text-blue-600',
      title: 'text-blue-800',
      message: 'text-blue-700',
      button: 'bg-blue-600 hover:bg-blue-700 text-white',
    },
  };

  const styles = typeStyles[type] || typeStyles.warning;
  const Icon = type === 'urgent' ? ExclamationCircleIcon : ExclamationTriangleIcon;

  return (
    <div
      className={`
        flex items-start gap-3 p-4 rounded-xl border shadow-lg
        animate-slide-in-right
        ${styles.bg}
      `}
      role="alert"
    >
      <div className={`p-2 rounded-lg ${styles.icon}`}>
        <Icon className="w-5 h-5" />
      </div>

      <div className="flex-1 min-w-0">
        <h4 className={`font-semibold ${styles.title}`}>{title}</h4>
        <p className={`text-sm mt-0.5 ${styles.message}`}>{message}</p>

        {action && onAction && (
          <button
            onClick={onAction}
            className={`
              mt-3 inline-flex items-center gap-1 px-3 py-1.5
              text-sm font-medium rounded-lg transition-colors
              ${styles.button}
            `}
          >
            {action}
            <ChevronRightIcon className="w-4 h-4" />
          </button>
        )}
      </div>

      <button
        onClick={onDismiss}
        className="p-1 rounded-lg hover:bg-black/5 transition-colors"
        aria-label="Dismiss"
      >
        <XMarkIcon className="w-5 h-5 text-gray-400" />
      </button>
    </div>
  );
}

/**
 * Toast container portal
 */
function ToastContainer({ children }) {
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  if (!mounted) return null;

  return createPortal(
    <div className="fixed top-4 right-4 z-[100] w-96 max-w-[calc(100vw-2rem)] space-y-3">
      {children}
    </div>,
    document.body
  );
}

/**
 * Main Expiring Quotes Toast Provider
 */
export default function ExpiringQuotesToast({
  salesRepId = null,
  showOnLoad = true,
  onViewQuotes,
}) {
  const [toasts, setToasts] = useState([]);
  const [hasChecked, setHasChecked] = useState(false);

  const addToast = useCallback((toast) => {
    const id = Date.now().toString();
    setToasts((prev) => [...prev, { ...toast, id }]);
    return id;
  }, []);

  const removeToast = useCallback((id) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  const dismissAll = useCallback(() => {
    markDismissed();
    setToasts([]);
  }, []);

  // Check for expiring quotes on mount
  useEffect(() => {
    if (!showOnLoad || hasChecked || wasRecentlyDismissed()) {
      setHasChecked(true);
      return;
    }

    const checkExpiringQuotes = async () => {
      try {
        const params = new URLSearchParams({ days: '7', limit: '50' });
        if (salesRepId) {
          params.append('repId', salesRepId.toString());
        }

        const response = await fetch(`${API_BASE}/pos/quotes/expiring?${params}`);
        if (!response.ok) return;

        const data = await response.json();
        const stats = data.stats || {};
        const quotes = data.quotes || [];

        // Priority 1: Quotes expiring TODAY
        if (stats.expiringToday > 0) {
          const todayValue = quotes
            .filter((q) => q.daysUntilExpiry <= 0 || q.isExpiringToday)
            .reduce((sum, q) => sum + (q.totalValue || 0), 0);

          addToast({
            type: 'urgent',
            title: `${stats.expiringToday} Quote${stats.expiringToday > 1 ? 's' : ''} Expire Today!`,
            message: `Worth ${formatCurrency(todayValue)} in potential revenue. Contact customers now.`,
            action: 'View Quotes',
            onAction: () => {
              if (onViewQuotes) {
                onViewQuotes('today');
              } else {
                window.location.href = '/quotes?filter=expiring&days=1';
              }
            },
          });
        }

        // Priority 2: High-value quotes expiring this week (>$1000, shown to managers)
        const highValueQuotes = quotes.filter(
          (q) => q.totalValue >= 1000 && q.daysUntilExpiry > 0 && q.daysUntilExpiry <= 7
        );

        if (highValueQuotes.length > 0 && stats.expiringToday === 0) {
          const totalHighValue = highValueQuotes.reduce((sum, q) => sum + q.totalValue, 0);

          addToast({
            type: 'warning',
            title: `${highValueQuotes.length} High-Value Quote${highValueQuotes.length > 1 ? 's' : ''} Expiring Soon`,
            message: `${formatCurrency(totalHighValue)} at risk this week. Review and follow up.`,
            action: 'Review Quotes',
            onAction: () => {
              if (onViewQuotes) {
                onViewQuotes('high-value');
              } else {
                window.location.href = '/quotes?filter=expiring&sortBy=value';
              }
            },
            autoDismiss: 15000, // Auto-dismiss after 15s for less urgent
          });
        }

        // Priority 3: Quotes expiring in 3 days (if nothing more urgent)
        if (stats.expiringToday === 0 && highValueQuotes.length === 0 && stats.expiringIn3Days > 0) {
          const in3DaysValue = quotes
            .filter((q) => q.daysUntilExpiry <= 3 && q.daysUntilExpiry > 0)
            .reduce((sum, q) => sum + (q.totalValue || 0), 0);

          addToast({
            type: 'info',
            title: `${stats.expiringIn3Days} Quote${stats.expiringIn3Days > 1 ? 's' : ''} Expire Within 3 Days`,
            message: `${formatCurrency(in3DaysValue)} worth of quotes need attention.`,
            action: 'View All',
            onAction: () => {
              if (onViewQuotes) {
                onViewQuotes('3days');
              } else {
                window.location.href = '/quotes?filter=expiring&days=3';
              }
            },
            autoDismiss: 10000,
          });
        }
      } catch (error) {
        console.error('[ExpiringQuotesToast] Error checking quotes:', error);
      } finally {
        setHasChecked(true);
      }
    };

    // Small delay to let the page load first
    const timer = setTimeout(checkExpiringQuotes, 1500);
    return () => clearTimeout(timer);
  }, [showOnLoad, hasChecked, salesRepId, addToast, onViewQuotes]);

  if (toasts.length === 0) return null;

  return (
    <ToastContainer>
      {toasts.map((toast) => (
        <Toast
          key={toast.id}
          type={toast.type}
          title={toast.title}
          message={toast.message}
          action={toast.action}
          onAction={() => {
            toast.onAction?.();
            removeToast(toast.id);
            markDismissed();
          }}
          onDismiss={() => {
            removeToast(toast.id);
            if (toasts.length === 1) {
              markDismissed();
            }
          }}
          autoDismiss={toast.autoDismiss}
        />
      ))}
    </ToastContainer>
  );
}

// Add CSS animation
const style = document.createElement('style');
style.textContent = `
  @keyframes slide-in-right {
    from {
      transform: translateX(100%);
      opacity: 0;
    }
    to {
      transform: translateX(0);
      opacity: 1;
    }
  }
  .animate-slide-in-right {
    animation: slide-in-right 0.3s ease-out;
  }
`;
if (typeof document !== 'undefined' && !document.querySelector('#expiring-quotes-toast-styles')) {
  style.id = 'expiring-quotes-toast-styles';
  document.head.appendChild(style);
}
