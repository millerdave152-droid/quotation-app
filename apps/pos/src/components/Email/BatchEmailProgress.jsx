/**
 * TeleTime POS - Batch Email Progress
 * Floating, non-blocking progress indicator for batch emails
 */

import { useState, useEffect, useCallback } from 'react';
import {
  EnvelopeIcon,
  CheckCircleIcon,
  XCircleIcon,
  XMarkIcon,
  ChevronUpIcon,
  ChevronDownIcon,
  ArrowPathIcon,
  ExclamationTriangleIcon,
} from '@heroicons/react/24/outline';

/**
 * Floating progress indicator
 * Shows in corner of screen, doesn't block user interaction
 */
export default function BatchEmailProgress({
  batchId,
  status, // { status, total_count, sent_count, failed_count, progress }
  onViewResults,
  onRetry,
  onDismiss,
  position = 'bottom-right', // 'bottom-right' | 'bottom-left' | 'top-right'
}) {
  const [isMinimized, setIsMinimized] = useState(false);
  const [isVisible, setIsVisible] = useState(true);

  // Auto-show when status changes
  useEffect(() => {
    if (status) {
      setIsVisible(true);
    }
  }, [status]);

  // Position classes
  const positionClasses = {
    'bottom-right': 'bottom-4 right-4',
    'bottom-left': 'bottom-4 left-4',
    'top-right': 'top-4 right-4',
  };

  if (!isVisible || !status) return null;

  const isComplete = status.status === 'completed' || status.status === 'cancelled';
  const isProcessing = status.status === 'processing';
  const hasFailed = (status.failed_count || 0) > 0;
  const currentCount = (status.sent_count || 0) + (status.failed_count || 0);
  const totalCount = status.total_count || 0;

  // Determine color scheme
  let colorScheme = 'blue'; // processing
  if (isComplete) {
    colorScheme = hasFailed ? 'amber' : 'green';
  }

  const colors = {
    blue: {
      bg: 'bg-blue-600',
      bgLight: 'bg-blue-50',
      text: 'text-blue-600',
      border: 'border-blue-200',
      progress: 'bg-blue-500',
    },
    green: {
      bg: 'bg-green-600',
      bgLight: 'bg-green-50',
      text: 'text-green-600',
      border: 'border-green-200',
      progress: 'bg-green-500',
    },
    amber: {
      bg: 'bg-amber-600',
      bgLight: 'bg-amber-50',
      text: 'text-amber-600',
      border: 'border-amber-200',
      progress: 'bg-amber-500',
    },
  };

  const c = colors[colorScheme];

  // Minimized view
  if (isMinimized) {
    return (
      <div className={`fixed ${positionClasses[position]} z-50`}>
        <button
          onClick={() => setIsMinimized(false)}
          className={`
            flex items-center gap-2 px-3 py-2
            ${c.bg} text-white
            rounded-full shadow-lg
            hover:opacity-90 transition-all
          `}
        >
          <EnvelopeIcon className="w-4 h-4" />
          {isProcessing ? (
            <span className="text-sm font-medium">
              {currentCount}/{totalCount}
            </span>
          ) : (
            <span className="text-sm font-medium">
              {status.sent_count || 0} sent
            </span>
          )}
          <ChevronUpIcon className="w-4 h-4" />
        </button>
      </div>
    );
  }

  return (
    <div className={`fixed ${positionClasses[position]} z-50 w-80`}>
      <div className={`bg-white rounded-xl shadow-2xl border ${c.border} overflow-hidden`}>
        {/* Header */}
        <div className={`${c.bgLight} px-4 py-3 flex items-center justify-between`}>
          <div className="flex items-center gap-2">
            {isProcessing ? (
              <ArrowPathIcon className={`w-5 h-5 ${c.text} animate-spin`} />
            ) : hasFailed ? (
              <ExclamationTriangleIcon className={`w-5 h-5 ${c.text}`} />
            ) : (
              <CheckCircleIcon className={`w-5 h-5 ${c.text}`} />
            )}
            <span className={`font-semibold ${c.text}`}>
              {isProcessing ? 'Sending Emails' : hasFailed ? 'Completed with Errors' : 'Emails Sent'}
            </span>
          </div>
          <div className="flex items-center gap-1">
            <button
              onClick={() => setIsMinimized(true)}
              className="p-1 text-gray-400 hover:text-gray-600 rounded"
            >
              <ChevronDownIcon className="w-4 h-4" />
            </button>
            {isComplete && (
              <button
                onClick={() => {
                  setIsVisible(false);
                  onDismiss?.();
                }}
                className="p-1 text-gray-400 hover:text-gray-600 rounded"
              >
                <XMarkIcon className="w-4 h-4" />
              </button>
            )}
          </div>
        </div>

        {/* Content */}
        <div className="px-4 py-3">
          {/* Progress text */}
          <div className="flex items-center justify-between mb-2">
            <span className="text-sm text-gray-600">
              {isProcessing ? (
                <>Sending <strong>{currentCount + 1}</strong> of <strong>{totalCount}</strong>...</>
              ) : (
                <>Processed <strong>{totalCount}</strong> emails</>
              )}
            </span>
            <span className="text-sm font-medium text-gray-900">
              {status.progress || 0}%
            </span>
          </div>

          {/* Progress bar */}
          <div className="h-2 bg-gray-100 rounded-full overflow-hidden mb-3">
            <div
              className={`h-full ${c.progress} transition-all duration-300`}
              style={{ width: `${status.progress || 0}%` }}
            />
          </div>

          {/* Stats */}
          <div className="flex items-center gap-4 text-sm">
            <div className="flex items-center gap-1">
              <CheckCircleIcon className="w-4 h-4 text-green-500" />
              <span className="text-gray-600">{status.sent_count || 0} sent</span>
            </div>
            {(status.failed_count || 0) > 0 && (
              <div className="flex items-center gap-1">
                <XCircleIcon className="w-4 h-4 text-red-500" />
                <span className="text-gray-600">{status.failed_count} failed</span>
              </div>
            )}
          </div>
        </div>

        {/* Actions */}
        {isComplete && (
          <div className="px-4 py-3 bg-gray-50 border-t border-gray-100 flex items-center justify-end gap-2">
            {hasFailed && onRetry && (
              <button
                onClick={onRetry}
                className="px-3 py-1.5 text-sm font-medium text-amber-600 hover:bg-amber-50 rounded-lg transition-colors"
              >
                Retry Failed
              </button>
            )}
            {onViewResults && (
              <button
                onClick={onViewResults}
                className={`px-3 py-1.5 text-sm font-medium ${c.text} hover:${c.bgLight} rounded-lg transition-colors`}
              >
                View Details
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

/**
 * Hook for managing progress indicator state
 */
export function useBatchEmailProgress() {
  const [activeJob, setActiveJob] = useState(null);

  const startJob = useCallback((batchId, initialStatus) => {
    setActiveJob({ batchId, status: initialStatus });
  }, []);

  const updateStatus = useCallback((status) => {
    setActiveJob(prev => prev ? { ...prev, status } : null);
  }, []);

  const clearJob = useCallback(() => {
    setActiveJob(null);
  }, []);

  return {
    activeJob,
    startJob,
    updateStatus,
    clearJob,
  };
}
