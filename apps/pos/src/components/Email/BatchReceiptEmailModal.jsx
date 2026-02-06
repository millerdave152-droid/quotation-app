/**
 * TeleTime POS - Batch Receipt Email Modal
 * Preview and send batch receipt emails
 */

import { useState, useEffect, useCallback, useMemo } from 'react';
import {
  XMarkIcon,
  EnvelopeIcon,
  CheckCircleIcon,
  ExclamationCircleIcon,
  ArrowPathIcon,
  PaperAirplaneIcon,
  UserIcon,
  CurrencyDollarIcon,
  ClockIcon,
  ExclamationTriangleIcon,
  CheckIcon,
  XCircleIcon,
} from '@heroicons/react/24/outline';
import { formatCurrency } from '../../utils/formatters';
import useBatchEmail from '../../hooks/useBatchEmail';

/**
 * Progress bar component
 */
function ProgressBar({ progress, status }) {
  const statusColors = {
    pending: 'bg-gray-300',
    processing: 'bg-blue-500',
    completed: 'bg-green-500',
    cancelled: 'bg-red-500',
  };

  return (
    <div className="w-full">
      <div className="flex justify-between text-sm mb-1">
        <span className="text-gray-600">Progress</span>
        <span className="font-medium text-gray-900">{progress}%</span>
      </div>
      <div className="h-2 bg-gray-200 rounded-full overflow-hidden">
        <div
          className={`h-full transition-all duration-500 ${statusColors[status] || 'bg-blue-500'}`}
          style={{ width: `${progress}%` }}
        />
      </div>
    </div>
  );
}

/**
 * Receipt item row in preview list
 */
function ReceiptItem({ item, isSelected, onToggle, disabled }) {
  return (
    <label
      className={`
        flex items-center gap-3 p-3 rounded-lg border cursor-pointer transition-all
        ${isSelected
          ? 'border-blue-500 bg-blue-50'
          : 'border-gray-200 hover:border-gray-300 hover:bg-gray-50'
        }
        ${disabled ? 'opacity-50 cursor-not-allowed' : ''}
      `}
    >
      <input
        type="checkbox"
        checked={isSelected}
        onChange={() => onToggle(item.transaction_id)}
        disabled={disabled}
        className="w-4 h-4 text-blue-600 rounded border-gray-300 focus:ring-blue-500"
      />
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <span className="font-medium text-gray-900">{item.transaction_number}</span>
          <span className="text-xs text-gray-500">
            {new Date(item.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
          </span>
        </div>
        <div className="flex items-center gap-3 text-sm text-gray-500">
          <span className="flex items-center gap-1">
            <UserIcon className="w-3.5 h-3.5" />
            {item.customer_name || 'Customer'}
          </span>
          <span className="flex items-center gap-1">
            <CurrencyDollarIcon className="w-3.5 h-3.5" />
            {formatCurrency(item.total_amount)}
          </span>
        </div>
      </div>
      <div className="text-sm text-gray-500 truncate max-w-[200px]">
        {item.customer_email}
      </div>
    </label>
  );
}

/**
 * Status badge for batch items
 */
function StatusBadge({ status }) {
  const config = {
    pending: { bg: 'bg-gray-100', text: 'text-gray-700', icon: ClockIcon },
    processing: { bg: 'bg-blue-100', text: 'text-blue-700', icon: ArrowPathIcon },
    sent: { bg: 'bg-green-100', text: 'text-green-700', icon: CheckCircleIcon },
    failed: { bg: 'bg-red-100', text: 'text-red-700', icon: XCircleIcon },
    skipped: { bg: 'bg-amber-100', text: 'text-amber-700', icon: ExclamationTriangleIcon },
  };

  const { bg, text, icon: Icon } = config[status] || config.pending;

  return (
    <span className={`inline-flex items-center gap-1 px-2 py-0.5 text-xs font-medium rounded-full ${bg} ${text}`}>
      <Icon className={`w-3 h-3 ${status === 'processing' ? 'animate-spin' : ''}`} />
      {status.charAt(0).toUpperCase() + status.slice(1)}
    </span>
  );
}

/**
 * Batch Receipt Email Modal
 * @param {object} props
 * @param {boolean} props.isOpen - Whether modal is open
 * @param {function} props.onClose - Close callback
 * @param {string} props.mode - 'shift' | 'date' | 'manual' | 'today'
 * @param {number} props.shiftId - Shift ID (for shift mode)
 * @param {string} props.date - Date string YYYY-MM-DD (for date mode)
 * @param {Array<number>} props.transactionIds - Transaction IDs (for manual mode)
 * @param {function} props.onComplete - Called when batch completes
 */
export default function BatchReceiptEmailModal({
  isOpen,
  onClose,
  mode = 'today',
  shiftId,
  date,
  transactionIds = [],
  onComplete,
}) {
  const {
    isLoading,
    error,
    unsentReceipts,
    currentBatch,
    batchStatus,
    getUnsentForShift,
    getUnsentForToday,
    getUnsentForDate,
    createShiftBatch,
    createManualBatch,
    processBatch,
    cancelBatch,
    pollBatchStatus,
    reset,
  } = useBatchEmail();

  // Local state
  const [step, setStep] = useState('preview'); // 'preview' | 'processing' | 'complete'
  const [selectedIds, setSelectedIds] = useState(new Set());
  const [processingStatus, setProcessingStatus] = useState(null);

  // Load unsent receipts on open
  useEffect(() => {
    if (isOpen) {
      reset();
      setStep('preview');
      setSelectedIds(new Set());
      setProcessingStatus(null);

      if (mode === 'shift' && shiftId) {
        getUnsentForShift(shiftId);
      } else if (mode === 'date' && date) {
        getUnsentForDate(date);
      } else if (mode === 'manual' && transactionIds.length > 0) {
        // For manual mode, we already have the IDs
        setSelectedIds(new Set(transactionIds));
      } else {
        getUnsentForToday();
      }
    }
  }, [isOpen, mode, shiftId, date, transactionIds]);

  // Auto-select all when receipts load
  useEffect(() => {
    if (unsentReceipts.length > 0 && mode !== 'manual') {
      setSelectedIds(new Set(unsentReceipts.map(r => r.transaction_id)));
    }
  }, [unsentReceipts, mode]);

  // Toggle selection
  const handleToggle = useCallback((id) => {
    setSelectedIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  }, []);

  // Select/deselect all
  const handleSelectAll = useCallback(() => {
    if (selectedIds.size === unsentReceipts.length) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(unsentReceipts.map(r => r.transaction_id)));
    }
  }, [selectedIds.size, unsentReceipts]);

  // Start sending
  const handleSend = useCallback(async () => {
    if (selectedIds.size === 0) return;

    setStep('processing');

    try {
      let batchResult;

      if (mode === 'shift' && shiftId) {
        batchResult = await createShiftBatch(shiftId);
      } else {
        batchResult = await createManualBatch(Array.from(selectedIds));
      }

      if (!batchResult.data?.batch) {
        setStep('complete');
        setProcessingStatus({
          success: true,
          message: batchResult.message || 'No emails to send',
          sent: 0,
          failed: 0,
        });
        return;
      }

      const batchId = batchResult.data.batch.id;

      // Start processing
      await processBatch(batchId, true);

      // Poll for completion
      await pollBatchStatus(batchId, (status) => {
        setProcessingStatus({
          ...status,
          progress: status.progress || 0,
        });
      });

      // Get final status
      setStep('complete');
      onComplete?.();
    } catch (err) {
      console.error('[BatchEmail] Send error:', err);
      setStep('complete');
      setProcessingStatus({
        success: false,
        error: err.message || 'Failed to send emails',
      });
    }
  }, [selectedIds, mode, shiftId, createShiftBatch, createManualBatch, processBatch, pollBatchStatus, onComplete]);

  // Cancel processing
  const handleCancel = useCallback(async () => {
    if (currentBatch?.id) {
      try {
        await cancelBatch(currentBatch.id);
      } catch (err) {
        console.error('[BatchEmail] Cancel error:', err);
      }
    }
    setStep('complete');
  }, [currentBatch, cancelBatch]);

  // Close handler
  const handleClose = useCallback(() => {
    if (step === 'processing') {
      // Confirm before closing during processing
      if (!window.confirm('Emails are being sent. Close anyway?')) {
        return;
      }
    }
    reset();
    onClose?.();
  }, [step, reset, onClose]);

  // Computed values
  const allSelected = selectedIds.size === unsentReceipts.length && unsentReceipts.length > 0;
  const someSelected = selectedIds.size > 0 && selectedIds.size < unsentReceipts.length;

  // Title based on mode
  const getTitle = () => {
    switch (mode) {
      case 'shift':
        return 'Email Shift Receipts';
      case 'date':
        return `Email Receipts for ${date || 'Selected Date'}`;
      case 'manual':
        return 'Email Selected Receipts';
      default:
        return "Email Today's Receipts";
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50">
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-2xl max-h-[90vh] flex flex-col overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-blue-100 rounded-full flex items-center justify-center">
              <EnvelopeIcon className="w-5 h-5 text-blue-600" />
            </div>
            <div>
              <h2 className="text-lg font-bold text-gray-900">{getTitle()}</h2>
              <p className="text-sm text-gray-500">
                {step === 'preview' && `${unsentReceipts.length} receipts ready to send`}
                {step === 'processing' && 'Sending emails...'}
                {step === 'complete' && 'Complete'}
              </p>
            </div>
          </div>
          <button
            onClick={handleClose}
            className="p-2 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-lg transition-colors"
          >
            <XMarkIcon className="w-5 h-5" />
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-6">
          {/* Error message */}
          {error && (
            <div className="mb-4 p-4 bg-red-50 border border-red-200 rounded-lg flex items-start gap-3">
              <ExclamationCircleIcon className="w-5 h-5 text-red-500 flex-shrink-0 mt-0.5" />
              <div>
                <p className="font-medium text-red-800">Error</p>
                <p className="text-sm text-red-600">{error}</p>
              </div>
            </div>
          )}

          {/* Preview Step */}
          {step === 'preview' && (
            <>
              {isLoading ? (
                <div className="flex flex-col items-center justify-center py-12">
                  <ArrowPathIcon className="w-8 h-8 text-gray-400 animate-spin mb-3" />
                  <p className="text-gray-500">Loading receipts...</p>
                </div>
              ) : unsentReceipts.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-12">
                  <CheckCircleIcon className="w-12 h-12 text-green-500 mb-3" />
                  <p className="text-lg font-medium text-gray-900">All caught up!</p>
                  <p className="text-gray-500">No unsent receipts found.</p>
                </div>
              ) : (
                <>
                  {/* Select all header */}
                  <div className="flex items-center justify-between mb-4">
                    <label className="flex items-center gap-2 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={allSelected}
                        ref={(el) => el && (el.indeterminate = someSelected)}
                        onChange={handleSelectAll}
                        className="w-4 h-4 text-blue-600 rounded border-gray-300 focus:ring-blue-500"
                      />
                      <span className="text-sm font-medium text-gray-700">
                        Select All ({unsentReceipts.length})
                      </span>
                    </label>
                    <span className="text-sm text-gray-500">
                      {selectedIds.size} selected
                    </span>
                  </div>

                  {/* Receipt list */}
                  <div className="space-y-2 max-h-[400px] overflow-y-auto">
                    {unsentReceipts.map((item) => (
                      <ReceiptItem
                        key={item.transaction_id}
                        item={item}
                        isSelected={selectedIds.has(item.transaction_id)}
                        onToggle={handleToggle}
                        disabled={false}
                      />
                    ))}
                  </div>
                </>
              )}
            </>
          )}

          {/* Processing Step */}
          {step === 'processing' && (
            <div className="py-8">
              <div className="text-center mb-6">
                <div className="w-16 h-16 bg-blue-100 rounded-full flex items-center justify-center mx-auto mb-4">
                  <PaperAirplaneIcon className="w-8 h-8 text-blue-600 animate-pulse" />
                </div>
                <h3 className="text-lg font-semibold text-gray-900 mb-1">
                  Sending Emails
                </h3>
                <p className="text-gray-500">
                  Please wait while receipts are being emailed...
                </p>
              </div>

              {/* Progress */}
              {processingStatus && (
                <div className="space-y-4">
                  <ProgressBar
                    progress={processingStatus.progress || 0}
                    status={processingStatus.status}
                  />

                  <div className="grid grid-cols-3 gap-4 text-center">
                    <div className="p-3 bg-gray-50 rounded-lg">
                      <p className="text-2xl font-bold text-gray-900">
                        {processingStatus.total_count || selectedIds.size}
                      </p>
                      <p className="text-xs text-gray-500">Total</p>
                    </div>
                    <div className="p-3 bg-green-50 rounded-lg">
                      <p className="text-2xl font-bold text-green-600">
                        {processingStatus.sent_count || 0}
                      </p>
                      <p className="text-xs text-gray-500">Sent</p>
                    </div>
                    <div className="p-3 bg-red-50 rounded-lg">
                      <p className="text-2xl font-bold text-red-600">
                        {processingStatus.failed_count || 0}
                      </p>
                      <p className="text-xs text-gray-500">Failed</p>
                    </div>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Complete Step */}
          {step === 'complete' && processingStatus && (
            <div className="py-8">
              <div className="text-center mb-6">
                {processingStatus.error ? (
                  <>
                    <div className="w-16 h-16 bg-red-100 rounded-full flex items-center justify-center mx-auto mb-4">
                      <XCircleIcon className="w-8 h-8 text-red-600" />
                    </div>
                    <h3 className="text-lg font-semibold text-gray-900 mb-1">
                      Something went wrong
                    </h3>
                    <p className="text-red-600">{processingStatus.error}</p>
                  </>
                ) : processingStatus.failed_count > 0 ? (
                  <>
                    <div className="w-16 h-16 bg-amber-100 rounded-full flex items-center justify-center mx-auto mb-4">
                      <ExclamationTriangleIcon className="w-8 h-8 text-amber-600" />
                    </div>
                    <h3 className="text-lg font-semibold text-gray-900 mb-1">
                      Completed with errors
                    </h3>
                    <p className="text-gray-500">
                      Some emails could not be sent.
                    </p>
                  </>
                ) : (
                  <>
                    <div className="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-4">
                      <CheckCircleIcon className="w-8 h-8 text-green-600" />
                    </div>
                    <h3 className="text-lg font-semibold text-gray-900 mb-1">
                      All done!
                    </h3>
                    <p className="text-gray-500">
                      {processingStatus.sent_count || 0} receipt{(processingStatus.sent_count || 0) !== 1 ? 's' : ''} sent successfully.
                    </p>
                  </>
                )}
              </div>

              {/* Final stats */}
              {processingStatus.total_count > 0 && (
                <div className="grid grid-cols-3 gap-4 text-center">
                  <div className="p-3 bg-gray-50 rounded-lg">
                    <p className="text-2xl font-bold text-gray-900">
                      {processingStatus.total_count}
                    </p>
                    <p className="text-xs text-gray-500">Total</p>
                  </div>
                  <div className="p-3 bg-green-50 rounded-lg">
                    <p className="text-2xl font-bold text-green-600">
                      {processingStatus.sent_count || 0}
                    </p>
                    <p className="text-xs text-gray-500">Sent</p>
                  </div>
                  <div className="p-3 bg-red-50 rounded-lg">
                    <p className="text-2xl font-bold text-red-600">
                      {processingStatus.failed_count || 0}
                    </p>
                    <p className="text-xs text-gray-500">Failed</p>
                  </div>
                </div>
              )}

              {/* Failed items list */}
              {processingStatus.failedItems?.length > 0 && (
                <div className="mt-6">
                  <h4 className="text-sm font-medium text-gray-700 mb-2">
                    Failed emails:
                  </h4>
                  <div className="space-y-2 max-h-[200px] overflow-y-auto">
                    {processingStatus.failedItems.map((item) => (
                      <div
                        key={item.id}
                        className="flex items-center justify-between p-2 bg-red-50 rounded-lg text-sm"
                      >
                        <div>
                          <span className="font-medium text-gray-900">
                            {item.transaction_number}
                          </span>
                          <span className="text-gray-500 ml-2">
                            {item.recipient_email}
                          </span>
                        </div>
                        <span className="text-xs text-red-600 truncate max-w-[150px]">
                          {item.error_message}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between px-6 py-4 border-t border-gray-200 bg-gray-50">
          {step === 'preview' && (
            <>
              <button
                onClick={handleClose}
                className="px-4 py-2 text-gray-700 font-medium hover:bg-gray-200 rounded-lg transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleSend}
                disabled={selectedIds.size === 0 || isLoading}
                className="px-6 py-2 bg-blue-600 hover:bg-blue-700 text-white font-medium rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
              >
                <PaperAirplaneIcon className="w-4 h-4" />
                Send {selectedIds.size} Email{selectedIds.size !== 1 ? 's' : ''}
              </button>
            </>
          )}

          {step === 'processing' && (
            <>
              <div />
              <button
                onClick={handleCancel}
                className="px-4 py-2 text-red-600 font-medium hover:bg-red-50 rounded-lg transition-colors"
              >
                Cancel
              </button>
            </>
          )}

          {step === 'complete' && (
            <>
              {processingStatus?.failed_count > 0 && (
                <button
                  onClick={() => {
                    // Could implement retry here
                    handleClose();
                  }}
                  className="px-4 py-2 text-blue-600 font-medium hover:bg-blue-50 rounded-lg transition-colors flex items-center gap-2"
                >
                  <ArrowPathIcon className="w-4 h-4" />
                  Retry Failed
                </button>
              )}
              {!processingStatus?.failed_count && <div />}
              <button
                onClick={handleClose}
                className="px-6 py-2 bg-gray-900 hover:bg-gray-800 text-white font-medium rounded-lg transition-colors"
              >
                Done
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
