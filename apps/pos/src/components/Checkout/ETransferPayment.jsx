/**
 * TeleTime POS - E-Transfer Payment Component
 * Generates reference code and displays transfer instructions
 */

import { useState, useEffect, useCallback } from 'react';
import { ClipboardDocumentIcon, PrinterIcon, EnvelopeIcon, CheckIcon } from '@heroicons/react/24/outline';
import { formatCurrency } from '../../utils/formatters';
import { generateReference, emailInstructions } from '../../api/etransfer';

const ETRANSFER_EMAIL = import.meta.env.VITE_ETRANSFER_EMAIL || 'payments@teletime.ca';

export function ETransferPayment({ amountDue, onComplete, onBack, isPartial, customer }) {
  const [reference, setReference] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [copied, setCopied] = useState(false);
  const [emailing, setEmailing] = useState(false);
  const [emailSent, setEmailSent] = useState(false);

  // Generate reference on mount
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        setLoading(true);
        const res = await generateReference();
        if (!cancelled) {
          setReference(res.data.reference);
        }
      } catch (err) {
        if (!cancelled) {
          setError(err?.response?.data?.error || err.message || 'Failed to generate reference');
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, []);

  const handleCopy = useCallback(async () => {
    if (!reference) return;
    try {
      await navigator.clipboard.writeText(reference);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Fallback
      const el = document.createElement('textarea');
      el.value = reference;
      document.body.appendChild(el);
      el.select();
      document.execCommand('copy');
      document.body.removeChild(el);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  }, [reference]);

  const handlePrint = useCallback(() => {
    window.print();
  }, []);

  const handleEmail = useCallback(async () => {
    if (!customer?.email || !reference) return;
    setEmailing(true);
    try {
      await emailInstructions({
        transactionId: null,
        customerEmail: customer.email,
        reference,
        amount: amountDue,
      });
      setEmailSent(true);
    } catch (err) {
      setError(err?.response?.data?.error || 'Failed to send email');
    } finally {
      setEmailing(false);
    }
  }, [customer, reference, amountDue]);

  const handleComplete = useCallback(() => {
    onComplete({
      paymentMethod: 'etransfer',
      amount: amountDue,
      etransferReference: reference,
    });
  }, [onComplete, amountDue, reference]);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="w-10 h-10 border-4 border-indigo-600 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (error && !reference) {
    return (
      <div className="text-center py-12">
        <p className="text-red-600 mb-4">{error}</p>
        <button type="button" onClick={onBack} className="text-sm text-blue-600 hover:underline">
          Go Back
        </button>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full">
      <div className="text-center mb-6">
        <h2 className="text-2xl font-bold text-gray-900 mb-1">E-Transfer Payment</h2>
        <p className="text-sm text-gray-500">
          {isPartial ? 'Remaining balance' : 'Amount to transfer'}
        </p>
        <p className="text-4xl font-bold text-indigo-600 tabular-nums mt-1">
          {formatCurrency(amountDue)}
        </p>
      </div>

      {/* Instructions */}
      <div className="bg-indigo-50 border border-indigo-200 rounded-xl p-6 mb-6 space-y-4">
        <div>
          <p className="text-xs font-medium text-indigo-500 uppercase tracking-wide mb-1">Send E-Transfer To</p>
          <p className="text-lg font-semibold text-indigo-900">{ETRANSFER_EMAIL}</p>
        </div>

        <div>
          <p className="text-xs font-medium text-indigo-500 uppercase tracking-wide mb-1">Reference Code (include in memo)</p>
          <div className="flex items-center gap-3">
            <p className="text-3xl font-mono font-bold text-indigo-900 tracking-wider">{reference}</p>
            <button
              type="button"
              onClick={handleCopy}
              className="p-2 rounded-lg hover:bg-indigo-100 transition-colors"
              title="Copy reference"
            >
              {copied ? (
                <CheckIcon className="w-5 h-5 text-green-600" />
              ) : (
                <ClipboardDocumentIcon className="w-5 h-5 text-indigo-600" />
              )}
            </button>
          </div>
        </div>

        <div>
          <p className="text-xs font-medium text-indigo-500 uppercase tracking-wide mb-1">Amount</p>
          <p className="text-lg font-semibold text-indigo-900">{formatCurrency(amountDue)}</p>
        </div>
      </div>

      {/* Important note */}
      <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4 mb-6">
        <p className="text-sm text-yellow-800">
          <strong>Important:</strong> Customer must include the reference code <strong>{reference}</strong> in the e-transfer memo field. The order will remain pending until the e-transfer is confirmed.
        </p>
      </div>

      {error && (
        <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg">
          <p className="text-sm text-red-700">{error}</p>
        </div>
      )}

      {/* Action buttons */}
      <div className="flex gap-3 mb-6">
        <button
          type="button"
          onClick={handlePrint}
          className="flex-1 flex items-center justify-center gap-2 px-4 py-3 border border-gray-300 rounded-lg text-sm font-medium text-gray-700 hover:bg-gray-50 transition-colors"
        >
          <PrinterIcon className="w-5 h-5" />
          Print Instructions
        </button>

        {customer?.email && (
          <button
            type="button"
            onClick={handleEmail}
            disabled={emailing || emailSent}
            className="flex-1 flex items-center justify-center gap-2 px-4 py-3 border border-gray-300 rounded-lg text-sm font-medium text-gray-700 hover:bg-gray-50 transition-colors disabled:opacity-50"
          >
            {emailSent ? (
              <>
                <CheckIcon className="w-5 h-5 text-green-600" />
                Email Sent
              </>
            ) : (
              <>
                <EnvelopeIcon className="w-5 h-5" />
                {emailing ? 'Sending...' : 'Email Instructions'}
              </>
            )}
          </button>
        )}
      </div>

      {/* Complete button */}
      <div className="mt-auto space-y-3">
        <button
          type="button"
          onClick={handleComplete}
          disabled={!reference}
          className="w-full py-4 bg-indigo-600 hover:bg-indigo-700 text-white text-lg font-semibold rounded-xl transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
        >
          Mark as Awaiting E-Transfer
        </button>

        <button
          type="button"
          onClick={onBack}
          className="w-full py-3 text-sm font-medium text-gray-500 hover:text-gray-700 transition-colors"
        >
          Back to Payment Methods
        </button>
      </div>
    </div>
  );
}

export default ETransferPayment;
