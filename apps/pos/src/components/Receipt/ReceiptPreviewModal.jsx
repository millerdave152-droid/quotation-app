/**
 * TeleTime POS - Receipt Preview Modal
 *
 * Modal for previewing and printing receipts
 */

import { useState, useRef, useCallback } from 'react';
import {
  XMarkIcon,
  PrinterIcon,
  EnvelopeIcon,
  ArrowDownTrayIcon,
  ArrowPathIcon,
  DocumentTextIcon,
  ReceiptRefundIcon,
} from '@heroicons/react/24/outline';
import { ReceiptTemplate } from './ReceiptTemplate';

const API_BASE = import.meta.env.VITE_API_URL || 'http://localhost:3001/api';

/**
 * Receipt Preview Modal
 * @param {object} props
 * @param {boolean} props.isOpen - Whether modal is open
 * @param {function} props.onClose - Close callback
 * @param {number} props.transactionId - Transaction ID to display
 */
export function ReceiptPreviewModal({ isOpen, onClose, transactionId }) {
  const [receipt, setReceipt] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [variant, setVariant] = useState('full'); // 'full' or 'thermal'
  const [emailModalOpen, setEmailModalOpen] = useState(false);
  const [email, setEmail] = useState('');
  const [emailSending, setEmailSending] = useState(false);
  const [emailSuccess, setEmailSuccess] = useState(false);
  const receiptRef = useRef(null);

  // Load receipt data
  const loadReceipt = useCallback(async () => {
    if (!transactionId) return;

    setLoading(true);
    setError(null);

    try {
      const response = await fetch(`${API_BASE}/receipts/${transactionId}/data`, {
        headers: {
          Authorization: `Bearer ${localStorage.getItem('pos_token')}`
        }
      });

      const result = await response.json();

      if (!response.ok || !result.success) {
        throw new Error(result.error || 'Failed to load receipt');
      }

      setReceipt(result.data);

      // Pre-fill email if customer has one
      if (result.data.transaction?.customerEmail) {
        setEmail(result.data.transaction.customerEmail);
      }
    } catch (err) {
      console.error('[ReceiptPreview] Error:', err);
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [transactionId]);

  // Load on open
  useState(() => {
    if (isOpen && transactionId) {
      loadReceipt();
    }
  }, [isOpen, transactionId, loadReceipt]);

  // Handle print
  const handlePrint = useCallback(async () => {
    try {
      // Option 1: Use PDF from API for proper printing
      const response = await fetch(`${API_BASE}/receipts/${transactionId}/pdf`, {
        headers: {
          Authorization: `Bearer ${localStorage.getItem('pos_token')}`
        }
      });

      if (!response.ok) {
        throw new Error('Failed to generate PDF');
      }

      const blob = await response.blob();
      const url = URL.createObjectURL(blob);

      // Open in new window for printing
      const printWindow = window.open(url, '_blank');
      if (printWindow) {
        printWindow.onload = () => {
          printWindow.print();
        };
      }
    } catch (err) {
      console.error('[ReceiptPreview] Print error:', err);
      // Fallback: print the DOM element
      if (receiptRef.current) {
        const printContent = receiptRef.current.innerHTML;
        const printWindow = window.open('', '_blank');
        printWindow.document.write(`
          <html>
            <head>
              <title>Receipt - ${receipt?.transaction?.number}</title>
              <link href="https://cdn.jsdelivr.net/npm/tailwindcss@2.2.19/dist/tailwind.min.css" rel="stylesheet">
              <style>
                @media print {
                  body { margin: 0; }
                  @page { margin: 0.5in; }
                }
              </style>
            </head>
            <body>
              ${printContent}
            </body>
          </html>
        `);
        printWindow.document.close();
        printWindow.onload = () => {
          printWindow.print();
          printWindow.close();
        };
      }
    }
  }, [transactionId, receipt]);

  // Handle download PDF
  const handleDownload = async () => {
    try {
      const response = await fetch(`${API_BASE}/receipts/${transactionId}/pdf`, {
        headers: {
          Authorization: `Bearer ${localStorage.getItem('pos_token')}`
        }
      });

      if (!response.ok) {
        throw new Error('Failed to generate PDF');
      }

      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `Receipt-${receipt?.transaction?.number || transactionId}.pdf`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch (err) {
      console.error('[ReceiptPreview] Download error:', err);
      setError('Failed to download PDF');
    }
  };

  // Handle email send
  const handleSendEmail = async () => {
    if (!email) return;

    setEmailSending(true);
    setEmailSuccess(false);

    try {
      const response = await fetch(`${API_BASE}/receipts/${transactionId}/email`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${localStorage.getItem('pos_token')}`
        },
        body: JSON.stringify({ email })
      });

      const result = await response.json();

      if (!response.ok || !result.success) {
        throw new Error(result.error || 'Failed to send email');
      }

      setEmailSuccess(true);
      setTimeout(() => {
        setEmailModalOpen(false);
        setEmailSuccess(false);
      }, 2000);
    } catch (err) {
      console.error('[ReceiptPreview] Email error:', err);
      setError(err.message);
    } finally {
      setEmailSending(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/50"
        onClick={onClose}
      />

      {/* Modal */}
      <div className="relative bg-white rounded-2xl shadow-2xl w-full max-w-4xl max-h-[90vh] overflow-hidden flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-gray-200 bg-gray-50">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-blue-100 rounded-lg flex items-center justify-center">
              <ReceiptRefundIcon className="w-5 h-5 text-blue-600" />
            </div>
            <div>
              <h2 className="text-lg font-bold text-gray-900">Receipt Preview</h2>
              {receipt && (
                <p className="text-sm text-gray-500">{receipt.transaction.number}</p>
              )}
            </div>
          </div>

          <div className="flex items-center gap-2">
            {/* Variant Toggle */}
            <div className="flex bg-gray-200 rounded-lg p-1">
              <button
                onClick={() => setVariant('full')}
                className={`px-3 py-1.5 text-sm rounded-md transition-colors ${
                  variant === 'full'
                    ? 'bg-white text-gray-900 shadow-sm'
                    : 'text-gray-600 hover:text-gray-900'
                }`}
              >
                Full Page
              </button>
              <button
                onClick={() => setVariant('thermal')}
                className={`px-3 py-1.5 text-sm rounded-md transition-colors ${
                  variant === 'thermal'
                    ? 'bg-white text-gray-900 shadow-sm'
                    : 'text-gray-600 hover:text-gray-900'
                }`}
              >
                Thermal
              </button>
            </div>

            <button
              onClick={onClose}
              className="w-10 h-10 flex items-center justify-center hover:bg-gray-200 rounded-lg transition-colors"
            >
              <XMarkIcon className="w-6 h-6 text-gray-500" />
            </button>
          </div>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-6 bg-gray-100">
          {loading ? (
            <div className="flex flex-col items-center justify-center h-64">
              <div className="w-12 h-12 border-4 border-blue-600 border-t-transparent rounded-full animate-spin mb-4" />
              <p className="text-gray-500">Loading receipt...</p>
            </div>
          ) : error ? (
            <div className="flex flex-col items-center justify-center h-64">
              <div className="w-16 h-16 bg-red-100 rounded-full flex items-center justify-center mb-4">
                <DocumentTextIcon className="w-8 h-8 text-red-600" />
              </div>
              <h3 className="text-lg font-semibold text-gray-900 mb-2">Error Loading Receipt</h3>
              <p className="text-gray-500 mb-4">{error}</p>
              <button
                onClick={loadReceipt}
                className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors flex items-center gap-2"
              >
                <ArrowPathIcon className="w-4 h-4" />
                Try Again
              </button>
            </div>
          ) : receipt ? (
            <div className={`flex justify-center ${variant === 'thermal' ? '' : 'shadow-xl'}`}>
              <div className={variant === 'thermal' ? 'shadow-xl' : ''}>
                <ReceiptTemplate
                  ref={receiptRef}
                  receipt={receipt}
                  variant={variant}
                />
              </div>
            </div>
          ) : null}
        </div>

        {/* Footer Actions */}
        <div className="p-4 border-t border-gray-200 bg-white">
          <div className="flex justify-between items-center">
            <button
              onClick={loadReceipt}
              disabled={loading}
              className="px-4 py-2 text-gray-600 hover:text-gray-800 hover:bg-gray-100 rounded-lg transition-colors flex items-center gap-2"
            >
              <ArrowPathIcon className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
              Refresh
            </button>

            <div className="flex gap-3">
              <button
                onClick={() => setEmailModalOpen(true)}
                disabled={loading || !receipt}
                className="px-4 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 transition-colors flex items-center gap-2 disabled:opacity-50"
              >
                <EnvelopeIcon className="w-4 h-4" />
                Email
              </button>

              <button
                onClick={handleDownload}
                disabled={loading || !receipt}
                className="px-4 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 transition-colors flex items-center gap-2 disabled:opacity-50"
              >
                <ArrowDownTrayIcon className="w-4 h-4" />
                Download
              </button>

              <button
                onClick={handlePrint}
                disabled={loading || !receipt}
                className="px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors flex items-center gap-2 disabled:opacity-50"
              >
                <PrinterIcon className="w-4 h-4" />
                Print Receipt
              </button>
            </div>
          </div>
        </div>

        {/* Email Modal */}
        {emailModalOpen && (
          <div className="absolute inset-0 bg-black/50 flex items-center justify-center">
            <div className="bg-white rounded-xl shadow-2xl w-full max-w-md p-6">
              <h3 className="text-lg font-bold text-gray-900 mb-4">Email Receipt</h3>

              {emailSuccess ? (
                <div className="text-center py-6">
                  <div className="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-4">
                    <EnvelopeIcon className="w-8 h-8 text-green-600" />
                  </div>
                  <p className="text-lg font-semibold text-gray-900">Email Sent!</p>
                  <p className="text-gray-500">Receipt sent to {email}</p>
                </div>
              ) : (
                <>
                  <div className="mb-4">
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      Email Address
                    </label>
                    <input
                      type="email"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      placeholder="customer@example.com"
                      className="w-full h-12 px-4 border-2 border-gray-200 rounded-lg focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
                    />
                  </div>

                  <div className="flex gap-3">
                    <button
                      onClick={() => setEmailModalOpen(false)}
                      className="flex-1 py-3 border border-gray-300 rounded-lg text-gray-700 hover:bg-gray-50 transition-colors"
                    >
                      Cancel
                    </button>
                    <button
                      onClick={handleSendEmail}
                      disabled={!email || emailSending}
                      className="flex-1 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors disabled:opacity-50 flex items-center justify-center gap-2"
                    >
                      {emailSending ? (
                        <>
                          <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                          Sending...
                        </>
                      ) : (
                        <>
                          <EnvelopeIcon className="w-4 h-4" />
                          Send Receipt
                        </>
                      )}
                    </button>
                  </div>
                </>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

export default ReceiptPreviewModal;
