/**
 * TeleTime POS - Batch Email Results
 * Detailed completion summary modal
 */

import { useState, useEffect, useCallback } from 'react';
import {
  XMarkIcon,
  CheckCircleIcon,
  XCircleIcon,
  ExclamationTriangleIcon,
  ArrowPathIcon,
  EnvelopeIcon,
  ClockIcon,
  DocumentTextIcon,
} from '@heroicons/react/24/outline';
import { formatCurrency } from '../../utils/formatters';

/**
 * Result item row
 */
function ResultItem({ item, status }) {
  const statusConfig = {
    sent: {
      icon: CheckCircleIcon,
      iconColor: 'text-green-500',
      bg: 'bg-green-50',
      label: 'Sent',
    },
    failed: {
      icon: XCircleIcon,
      iconColor: 'text-red-500',
      bg: 'bg-red-50',
      label: 'Failed',
    },
    skipped: {
      icon: ExclamationTriangleIcon,
      iconColor: 'text-amber-500',
      bg: 'bg-amber-50',
      label: 'Skipped',
    },
    pending: {
      icon: ClockIcon,
      iconColor: 'text-gray-400',
      bg: 'bg-gray-50',
      label: 'Pending',
    },
  };

  const config = statusConfig[status] || statusConfig.pending;
  const Icon = config.icon;

  return (
    <div className={`flex items-center gap-3 p-3 rounded-lg ${config.bg}`}>
      <Icon className={`w-5 h-5 ${config.iconColor} flex-shrink-0`} />
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <span className="font-medium text-gray-900">
            {item.transaction_number || `#${item.transaction_id}`}
          </span>
          {item.customer_name && (
            <span className="text-sm text-gray-500">
              {item.customer_name}
            </span>
          )}
        </div>
        <div className="text-sm text-gray-500 truncate">
          {item.recipient_email}
        </div>
        {status === 'failed' && item.error_message && (
          <div className="text-xs text-red-600 mt-1">
            {item.error_message}
          </div>
        )}
      </div>
      <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${config.bg} ${config.iconColor}`}>
        {config.label}
      </span>
    </div>
  );
}

/**
 * Tab button
 */
function TabButton({ active, count, label, color, onClick }) {
  return (
    <button
      onClick={onClick}
      className={`
        flex items-center gap-2 px-4 py-2 text-sm font-medium rounded-lg transition-colors
        ${active
          ? `${color} text-white`
          : 'text-gray-600 hover:bg-gray-100'
        }
      `}
    >
      {label}
      <span className={`
        px-1.5 py-0.5 text-xs rounded-full
        ${active ? 'bg-white/20' : 'bg-gray-200'}
      `}>
        {count}
      </span>
    </button>
  );
}

/**
 * Batch Email Results Modal
 */
export default function BatchEmailResults({
  isOpen,
  onClose,
  batchStatus,
  items = [],
  onRetry,
  onRetryFailed,
}) {
  const [activeTab, setActiveTab] = useState('all');
  const [isRetrying, setIsRetrying] = useState(false);

  // Reset tab when opening
  useEffect(() => {
    if (isOpen) {
      setActiveTab('all');
    }
  }, [isOpen]);

  // Group items by status
  const groupedItems = {
    all: items,
    sent: items.filter(i => i.status === 'sent'),
    failed: items.filter(i => i.status === 'failed'),
    skipped: items.filter(i => i.status === 'skipped'),
  };

  const displayItems = groupedItems[activeTab] || [];

  // Handle retry
  const handleRetryFailed = useCallback(async () => {
    if (!onRetryFailed) return;

    setIsRetrying(true);
    try {
      await onRetryFailed();
      onClose?.();
    } catch (err) {
      console.error('[BatchEmailResults] Retry error:', err);
    } finally {
      setIsRetrying(false);
    }
  }, [onRetryFailed, onClose]);

  if (!isOpen) return null;

  const hasFailed = groupedItems.failed.length > 0;
  const allSuccess = !hasFailed && groupedItems.sent.length > 0;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50">
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-2xl max-h-[85vh] flex flex-col overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200">
          <div className="flex items-center gap-3">
            <div className={`
              w-10 h-10 rounded-full flex items-center justify-center
              ${allSuccess ? 'bg-green-100' : hasFailed ? 'bg-amber-100' : 'bg-blue-100'}
            `}>
              {allSuccess ? (
                <CheckCircleIcon className="w-5 h-5 text-green-600" />
              ) : hasFailed ? (
                <ExclamationTriangleIcon className="w-5 h-5 text-amber-600" />
              ) : (
                <EnvelopeIcon className="w-5 h-5 text-blue-600" />
              )}
            </div>
            <div>
              <h2 className="text-lg font-bold text-gray-900">
                {allSuccess ? 'All Emails Sent' : hasFailed ? 'Completed with Errors' : 'Email Results'}
              </h2>
              <p className="text-sm text-gray-500">
                Batch #{batchStatus?.id} completed
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-2 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-lg transition-colors"
          >
            <XMarkIcon className="w-5 h-5" />
          </button>
        </div>

        {/* Summary Stats */}
        <div className="px-6 py-4 bg-gray-50 border-b border-gray-200">
          <div className="grid grid-cols-4 gap-4">
            <div className="text-center">
              <p className="text-2xl font-bold text-gray-900">
                {batchStatus?.total_count || items.length}
              </p>
              <p className="text-xs text-gray-500">Total</p>
            </div>
            <div className="text-center">
              <p className="text-2xl font-bold text-green-600">
                {batchStatus?.sent_count || groupedItems.sent.length}
              </p>
              <p className="text-xs text-gray-500">Sent</p>
            </div>
            <div className="text-center">
              <p className="text-2xl font-bold text-red-600">
                {batchStatus?.failed_count || groupedItems.failed.length}
              </p>
              <p className="text-xs text-gray-500">Failed</p>
            </div>
            <div className="text-center">
              <p className="text-2xl font-bold text-amber-600">
                {batchStatus?.skipped_count || groupedItems.skipped.length}
              </p>
              <p className="text-xs text-gray-500">Skipped</p>
            </div>
          </div>
        </div>

        {/* Tabs */}
        <div className="px-6 py-3 border-b border-gray-200">
          <div className="flex gap-2">
            <TabButton
              active={activeTab === 'all'}
              count={groupedItems.all.length}
              label="All"
              color="bg-gray-700"
              onClick={() => setActiveTab('all')}
            />
            <TabButton
              active={activeTab === 'sent'}
              count={groupedItems.sent.length}
              label="Sent"
              color="bg-green-600"
              onClick={() => setActiveTab('sent')}
            />
            <TabButton
              active={activeTab === 'failed'}
              count={groupedItems.failed.length}
              label="Failed"
              color="bg-red-600"
              onClick={() => setActiveTab('failed')}
            />
            {groupedItems.skipped.length > 0 && (
              <TabButton
                active={activeTab === 'skipped'}
                count={groupedItems.skipped.length}
                label="Skipped"
                color="bg-amber-600"
                onClick={() => setActiveTab('skipped')}
              />
            )}
          </div>
        </div>

        {/* Results List */}
        <div className="flex-1 overflow-y-auto p-6">
          {displayItems.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 text-gray-400">
              <DocumentTextIcon className="w-12 h-12 mb-3" />
              <p>No items in this category</p>
            </div>
          ) : (
            <div className="space-y-2">
              {displayItems.map((item) => (
                <ResultItem
                  key={item.id}
                  item={item}
                  status={item.status}
                />
              ))}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between px-6 py-4 border-t border-gray-200 bg-gray-50">
          <div className="text-sm text-gray-500">
            {batchStatus?.completed_at && (
              <>Completed {new Date(batchStatus.completed_at).toLocaleString()}</>
            )}
          </div>
          <div className="flex items-center gap-3">
            {hasFailed && onRetryFailed && (
              <button
                onClick={handleRetryFailed}
                disabled={isRetrying}
                className="flex items-center gap-2 px-4 py-2 text-amber-600 font-medium hover:bg-amber-50 rounded-lg transition-colors disabled:opacity-50"
              >
                <ArrowPathIcon className={`w-4 h-4 ${isRetrying ? 'animate-spin' : ''}`} />
                Retry {groupedItems.failed.length} Failed
              </button>
            )}
            <button
              onClick={onClose}
              className="px-6 py-2 bg-gray-900 hover:bg-gray-800 text-white font-medium rounded-lg transition-colors"
            >
              Done
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
