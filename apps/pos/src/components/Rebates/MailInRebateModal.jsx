/**
 * TeleTime POS - Mail-in Rebate Info Modal
 * Detailed rebate information with print/email options
 */

import { useState } from 'react';
import {
  XMarkIcon,
  EnvelopeIcon,
  PrinterIcon,
  ClockIcon,
  ExclamationTriangleIcon,
  CheckCircleIcon,
  ArrowTopRightOnSquareIcon,
  DocumentTextIcon,
  ClipboardDocumentListIcon,
  GlobeAltIcon,
} from '@heroicons/react/24/outline';

const API_BASE = import.meta.env.VITE_API_URL || 'http://localhost:3001/api';

/**
 * Format currency
 */
function formatCurrency(value) {
  return new Intl.NumberFormat('en-CA', {
    style: 'currency',
    currency: 'CAD',
  }).format(value || 0);
}

/**
 * Format date
 */
function formatDate(dateStr) {
  if (!dateStr) return 'N/A';
  const date = new Date(dateStr);
  return date.toLocaleDateString('en-CA', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });
}

/**
 * Single Rebate Card
 */
function RebateCard({ rebate, isUrgent = false }) {
  const [expanded, setExpanded] = useState(false);

  const isMailIn = rebate.rebateType === 'mail_in' || !rebate.rebateType;
  const isOnline = rebate.rebateType === 'online';

  return (
    <div className={`
      border rounded-lg overflow-hidden
      ${isUrgent ? 'border-orange-300 bg-orange-50' : 'border-gray-200 bg-white'}
    `}>
      {/* Header */}
      <div className="p-4">
        <div className="flex items-start justify-between gap-3">
          <div className="flex-1">
            <div className="flex items-center gap-2">
              {isOnline ? (
                <GlobeAltIcon className="w-5 h-5 text-purple-600" />
              ) : (
                <EnvelopeIcon className="w-5 h-5 text-blue-600" />
              )}
              <h4 className="font-semibold text-gray-900">
                {rebate.rebateName || rebate.name}
              </h4>
            </div>
            <p className="text-sm text-gray-500 mt-1">
              {rebate.manufacturer} - {rebate.productName}
              {rebate.quantity > 1 && ` (x${rebate.quantity})`}
            </p>
          </div>
          <div className="text-right">
            <p className="text-xl font-bold text-blue-600">
              {formatCurrency(rebate.amount)}
            </p>
            <p className="text-xs text-gray-500">
              {rebate.quantity > 1 && `${formatCurrency(rebate.unitAmount)}/unit`}
            </p>
          </div>
        </div>

        {/* Deadline */}
        <div className={`
          flex items-center gap-2 mt-3 p-2 rounded-lg text-sm
          ${isUrgent
            ? 'bg-orange-100 text-orange-800'
            : 'bg-gray-100 text-gray-700'
          }
        `}>
          {isUrgent ? (
            <ExclamationTriangleIcon className="w-4 h-4" />
          ) : (
            <ClockIcon className="w-4 h-4" />
          )}
          <span>
            Submit by: <strong>{formatDate(rebate.deadline)}</strong>
            {rebate.daysRemaining && (
              <span className={isUrgent ? 'text-orange-900' : 'text-gray-500'}>
                {' '}({rebate.daysRemaining} days left)
              </span>
            )}
          </span>
        </div>

        {/* Quick Actions */}
        <div className="flex gap-2 mt-3">
          {rebate.submissionUrl && (
            <a
              href={rebate.submissionUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="flex-1 flex items-center justify-center gap-2 px-3 py-2 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700 transition-colors"
            >
              {isOnline ? 'Submit Online' : 'Download Form'}
              <ArrowTopRightOnSquareIcon className="w-4 h-4" />
            </a>
          )}
          <button
            type="button"
            onClick={() => setExpanded(!expanded)}
            className="px-3 py-2 text-sm font-medium text-gray-700 bg-gray-100 rounded-lg hover:bg-gray-200 transition-colors"
          >
            {expanded ? 'Hide Details' : 'View Steps'}
          </button>
        </div>
      </div>

      {/* Expanded Details */}
      {expanded && (
        <div className="border-t border-gray-200 bg-gray-50 p-4">
          {/* Requirements */}
          <div className="mb-4">
            <h5 className="text-xs font-medium text-gray-500 uppercase tracking-wide mb-2">
              Requirements
            </h5>
            <div className="flex flex-wrap gap-2">
              {rebate.requiresReceipt && (
                <span className="inline-flex items-center gap-1 px-2 py-1 bg-white border border-gray-200 rounded text-xs">
                  <DocumentTextIcon className="w-3.5 h-3.5 text-gray-500" />
                  Receipt Copy
                </span>
              )}
              {rebate.requiresUpc && (
                <span className="inline-flex items-center gap-1 px-2 py-1 bg-white border border-gray-200 rounded text-xs">
                  <ClipboardDocumentListIcon className="w-3.5 h-3.5 text-gray-500" />
                  UPC Barcode
                </span>
              )}
              {rebate.requiresRegistration && (
                <span className="inline-flex items-center gap-1 px-2 py-1 bg-white border border-gray-200 rounded text-xs">
                  <GlobeAltIcon className="w-3.5 h-3.5 text-gray-500" />
                  Product Registration
                </span>
              )}
            </div>
          </div>

          {/* Instructions */}
          {rebate.instructions && (
            <div>
              <h5 className="text-xs font-medium text-gray-500 uppercase tracking-wide mb-2">
                How to Submit
              </h5>
              <ol className="space-y-2">
                {rebate.instructions.steps?.map((step, index) => (
                  <li
                    key={index}
                    className="flex items-start gap-2 text-sm text-gray-700"
                  >
                    <span className="flex-shrink-0 w-5 h-5 flex items-center justify-center bg-blue-100 text-blue-700 text-xs font-medium rounded-full">
                      {index + 1}
                    </span>
                    <span>{step}</span>
                  </li>
                ))}
              </ol>

              {rebate.instructions.processingTime && (
                <p className="mt-3 text-xs text-gray-500">
                  Processing time: {rebate.instructions.processingTime}
                </p>
              )}
            </div>
          )}

          {/* Terms Link */}
          {rebate.termsUrl && (
            <a
              href={rebate.termsUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1 mt-3 text-xs text-blue-600 hover:text-blue-700"
            >
              View Full Terms & Conditions
              <ArrowTopRightOnSquareIcon className="w-3 h-3" />
            </a>
          )}
        </div>
      )}
    </div>
  );
}

/**
 * Mail-in Rebate Modal
 */
export function MailInRebateModal({
  isOpen,
  onClose,
  mailInRebates = [],
  onlineRebates = [],
  customerEmail,
  orderId,
  onPrintForms,
  onEmailInfo,
}) {
  const [isSendingEmail, setIsSendingEmail] = useState(false);
  const [emailSent, setEmailSent] = useState(false);
  const [email, setEmail] = useState(customerEmail || '');

  if (!isOpen) return null;

  const allRebates = [...mailInRebates, ...onlineRebates];
  const totalAmount = allRebates.reduce((sum, r) => sum + (r.amount || 0), 0);

  // Identify urgent rebates (< 14 days)
  const urgentRebates = allRebates.filter(r => r.daysRemaining && r.daysRemaining <= 14);

  const handlePrint = () => {
    if (onPrintForms) {
      onPrintForms(allRebates);
    } else {
      window.print();
    }
  };

  const handleSendEmail = async () => {
    if (!email) return;

    try {
      setIsSendingEmail(true);

      if (onEmailInfo) {
        await onEmailInfo(email, allRebates);
      } else {
        // Default API call
        const token = localStorage.getItem('pos_token');
        await fetch(`${API_BASE}/rebates/email-info`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({
            email,
            orderId,
            rebates: allRebates.map(r => r.rebateId),
          }),
        });
      }

      setEmailSent(true);
      setTimeout(() => setEmailSent(false), 3000);
    } catch (error) {
      console.error('[MailInRebateModal] Email error:', error);
      alert('Failed to send email. Please try again.');
    } finally {
      setIsSendingEmail(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50">
      <div className="w-full max-w-2xl max-h-[90vh] bg-white rounded-2xl shadow-2xl flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-blue-100 rounded-lg">
              <EnvelopeIcon className="w-6 h-6 text-blue-600" />
            </div>
            <div>
              <h2 className="text-lg font-bold text-gray-900">Mail-in Rebate Information</h2>
              <p className="text-sm text-gray-500">
                {allRebates.length} rebate{allRebates.length !== 1 && 's'} - Total: {formatCurrency(totalAmount)}
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-2 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-lg transition-colors"
          >
            <XMarkIcon className="w-6 h-6" />
          </button>
        </div>

        {/* Urgent Warning */}
        {urgentRebates.length > 0 && (
          <div className="mx-6 mt-4 p-3 bg-orange-50 border border-orange-200 rounded-lg">
            <div className="flex items-center gap-2 text-orange-800">
              <ExclamationTriangleIcon className="w-5 h-5" />
              <span className="font-medium">
                {urgentRebates.length} rebate{urgentRebates.length !== 1 && 's'} expiring soon!
              </span>
            </div>
            <p className="text-sm text-orange-700 mt-1">
              Please submit claims within the deadline to receive your rebate.
            </p>
          </div>
        )}

        {/* Rebate List */}
        <div className="flex-1 overflow-y-auto px-6 py-4 space-y-4">
          {allRebates.length === 0 ? (
            <div className="text-center py-8 text-gray-500">
              No mail-in rebates on this order.
            </div>
          ) : (
            allRebates.map((rebate, index) => (
              <RebateCard
                key={rebate.rebateId || index}
                rebate={rebate}
                isUrgent={rebate.daysRemaining && rebate.daysRemaining <= 14}
              />
            ))
          )}
        </div>

        {/* Footer Actions */}
        <div className="border-t border-gray-200 px-6 py-4">
          {/* Email Input */}
          <div className="flex gap-2 mb-4">
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="Customer email address"
              className="flex-1 px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
            />
            <button
              type="button"
              onClick={handleSendEmail}
              disabled={!email || isSendingEmail || emailSent}
              className={`
                flex items-center gap-2 px-4 py-2 rounded-lg font-medium
                transition-colors
                ${emailSent
                  ? 'bg-green-100 text-green-700'
                  : isSendingEmail
                    ? 'bg-gray-100 text-gray-400 cursor-wait'
                    : 'bg-blue-600 text-white hover:bg-blue-700'
                }
              `}
            >
              {emailSent ? (
                <>
                  <CheckCircleIcon className="w-5 h-5" />
                  Sent!
                </>
              ) : isSendingEmail ? (
                <>
                  <span className="w-5 h-5 border-2 border-gray-400 border-t-transparent rounded-full animate-spin" />
                  Sending...
                </>
              ) : (
                <>
                  <EnvelopeIcon className="w-5 h-5" />
                  Email Info
                </>
              )}
            </button>
          </div>

          {/* Action Buttons */}
          <div className="flex gap-3">
            <button
              type="button"
              onClick={handlePrint}
              className="flex-1 flex items-center justify-center gap-2 px-4 py-3 bg-gray-100 text-gray-700 font-medium rounded-lg hover:bg-gray-200 transition-colors"
            >
              <PrinterIcon className="w-5 h-5" />
              Print Rebate Forms
            </button>
            <button
              type="button"
              onClick={onClose}
              className="px-6 py-3 bg-blue-600 text-white font-medium rounded-lg hover:bg-blue-700 transition-colors"
            >
              Done
            </button>
          </div>

          {/* Help Text */}
          <p className="text-xs text-center text-gray-500 mt-3">
            Rebate information will also be printed on the customer receipt.
          </p>
        </div>
      </div>
    </div>
  );
}

/**
 * Quick Rebate Info Popover
 * Lighter version for inline use
 */
export function RebateInfoPopover({
  rebate,
  isOpen,
  onClose,
  anchorRef,
}) {
  if (!isOpen || !rebate) return null;

  return (
    <div
      className="absolute z-50 w-80 bg-white rounded-lg shadow-xl border border-gray-200 overflow-hidden"
      style={{
        top: anchorRef?.current?.offsetTop + anchorRef?.current?.offsetHeight + 8 || 0,
        left: anchorRef?.current?.offsetLeft || 0,
      }}
    >
      <div className="p-4">
        <div className="flex items-start justify-between mb-3">
          <div>
            <h4 className="font-medium text-gray-900">{rebate.rebateName}</h4>
            <p className="text-sm text-gray-500">{rebate.manufacturer}</p>
          </div>
          <span className="text-lg font-bold text-blue-600">
            {formatCurrency(rebate.amount)}
          </span>
        </div>

        <div className="flex items-center gap-2 p-2 bg-gray-50 rounded text-sm text-gray-600 mb-3">
          <ClockIcon className="w-4 h-4" />
          <span>Submit by {formatDate(rebate.deadline)}</span>
        </div>

        {rebate.submissionUrl && (
          <a
            href={rebate.submissionUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="block w-full text-center px-4 py-2 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700 transition-colors"
          >
            Submit Rebate Claim
          </a>
        )}
      </div>

      <button
        type="button"
        onClick={onClose}
        className="absolute top-2 right-2 p-1 text-gray-400 hover:text-gray-600"
      >
        <XMarkIcon className="w-4 h-4" />
      </button>
    </div>
  );
}

export default MailInRebateModal;
