/**
 * TeleTime POS - Email Receipts Button
 * Quick action buttons for triggering batch receipt emails
 */

import { useState, useCallback } from 'react';
import {
  EnvelopeIcon,
  PaperAirplaneIcon,
  CheckCircleIcon,
} from '@heroicons/react/24/outline';
import BatchReceiptEmailModal from './BatchReceiptEmailModal';

/**
 * Email Receipts Button - Shift Mode
 * Shows count of unsent receipts for a shift or date
 */
export function EmailShiftReceiptsButton({
  shiftId,
  date,
  unsentCount,
  onComplete,
  className = '',
  variant = 'default', // 'default' | 'compact' | 'icon'
}) {
  const [isOpen, setIsOpen] = useState(false);

  const handleComplete = useCallback(() => {
    onComplete?.();
  }, [onComplete]);

  // Determine mode based on props
  const mode = shiftId ? 'shift' : date ? 'date' : 'today';
  const buttonLabel = shiftId ? 'Email Shift Receipts' : date ? 'Email Day\'s Receipts' : 'Email Receipts';

  if (variant === 'icon') {
    return (
      <>
        <button
          onClick={() => setIsOpen(true)}
          className={`relative p-2 text-gray-500 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-colors ${className}`}
          title={unsentCount != null ? `Email ${unsentCount} unsent receipts` : buttonLabel}
        >
          <EnvelopeIcon className="w-5 h-5" />
          {unsentCount != null && unsentCount > 0 && (
            <span className="absolute -top-1 -right-1 w-4 h-4 bg-blue-600 text-white text-xs font-bold rounded-full flex items-center justify-center">
              {unsentCount > 9 ? '9+' : unsentCount}
            </span>
          )}
        </button>

        <BatchReceiptEmailModal
          isOpen={isOpen}
          onClose={() => setIsOpen(false)}
          mode={mode}
          shiftId={shiftId}
          date={date}
          onComplete={handleComplete}
        />
      </>
    );
  }

  if (variant === 'compact') {
    const isDisabled = unsentCount != null && unsentCount === 0;
    return (
      <>
        <button
          onClick={() => setIsOpen(true)}
          disabled={isDisabled}
          className={`
            flex items-center gap-2 px-3 py-1.5
            text-sm font-medium rounded-lg
            transition-colors
            ${!isDisabled
              ? 'text-blue-600 hover:bg-blue-50'
              : 'text-gray-400 cursor-not-allowed'
            }
            ${className}
          `}
        >
          <EnvelopeIcon className="w-4 h-4" />
          {unsentCount != null
            ? (unsentCount > 0 ? `Email (${unsentCount})` : 'All Emailed')
            : 'Email Receipts'
          }
        </button>

        <BatchReceiptEmailModal
          isOpen={isOpen}
          onClose={() => setIsOpen(false)}
          mode={mode}
          shiftId={shiftId}
          date={date}
          onComplete={handleComplete}
        />
      </>
    );
  }

  // Default variant
  const isDisabled = unsentCount != null && unsentCount === 0;
  return (
    <>
      <button
        onClick={() => setIsOpen(true)}
        disabled={isDisabled}
        className={`
          flex items-center gap-2 px-4 py-2
          font-medium rounded-lg
          transition-colors
          ${!isDisabled
            ? 'bg-blue-600 hover:bg-blue-700 text-white'
            : 'bg-gray-100 text-gray-400 cursor-not-allowed'
          }
          ${className}
        `}
      >
        {isDisabled ? (
          <>
            <CheckCircleIcon className="w-5 h-5" />
            All Receipts Emailed
          </>
        ) : unsentCount != null ? (
          <>
            <PaperAirplaneIcon className="w-5 h-5" />
            Email {unsentCount} Receipt{unsentCount !== 1 ? 's' : ''}
          </>
        ) : (
          <>
            <EnvelopeIcon className="w-5 h-5" />
            {buttonLabel}
          </>
        )}
      </button>

      <BatchReceiptEmailModal
        isOpen={isOpen}
        onClose={() => setIsOpen(false)}
        mode={mode}
        shiftId={shiftId}
        date={date}
        onComplete={handleComplete}
      />
    </>
  );
}

/**
 * Email Today's Receipts Button
 * Quick action for emailing all unsent receipts from today
 */
export function EmailTodayReceiptsButton({
  onComplete,
  className = '',
}) {
  const [isOpen, setIsOpen] = useState(false);

  return (
    <>
      <button
        onClick={() => setIsOpen(true)}
        className={`
          flex items-center gap-2 px-4 py-2
          bg-blue-600 hover:bg-blue-700 text-white
          font-medium rounded-lg
          transition-colors
          ${className}
        `}
      >
        <EnvelopeIcon className="w-5 h-5" />
        Email Today's Receipts
      </button>

      <BatchReceiptEmailModal
        isOpen={isOpen}
        onClose={() => setIsOpen(false)}
        mode="today"
        onComplete={onComplete}
      />
    </>
  );
}

/**
 * Email Selected Transactions Button
 * For use with multi-select in transaction lists
 */
export function EmailSelectedButton({
  transactionIds = [],
  onComplete,
  disabled = false,
  className = '',
}) {
  const [isOpen, setIsOpen] = useState(false);
  const count = transactionIds.length;

  return (
    <>
      <button
        onClick={() => setIsOpen(true)}
        disabled={disabled || count === 0}
        className={`
          flex items-center gap-2 px-4 py-2
          font-medium rounded-lg
          transition-colors
          ${count > 0 && !disabled
            ? 'bg-blue-600 hover:bg-blue-700 text-white'
            : 'bg-gray-100 text-gray-400 cursor-not-allowed'
          }
          ${className}
        `}
      >
        <EnvelopeIcon className="w-5 h-5" />
        Email Selected ({count})
      </button>

      <BatchReceiptEmailModal
        isOpen={isOpen}
        onClose={() => setIsOpen(false)}
        mode="manual"
        transactionIds={transactionIds}
        onComplete={onComplete}
      />
    </>
  );
}

/**
 * Unified component that renders based on props
 */
export default function EmailReceiptsButton({
  mode = 'today',
  shiftId,
  transactionIds,
  unsentCount,
  onComplete,
  variant,
  disabled,
  className,
}) {
  if (mode === 'shift' && shiftId) {
    return (
      <EmailShiftReceiptsButton
        shiftId={shiftId}
        unsentCount={unsentCount}
        onComplete={onComplete}
        variant={variant}
        className={className}
      />
    );
  }

  if (mode === 'manual' && transactionIds) {
    return (
      <EmailSelectedButton
        transactionIds={transactionIds}
        onComplete={onComplete}
        disabled={disabled}
        className={className}
      />
    );
  }

  return (
    <EmailTodayReceiptsButton
      onComplete={onComplete}
      className={className}
    />
  );
}
