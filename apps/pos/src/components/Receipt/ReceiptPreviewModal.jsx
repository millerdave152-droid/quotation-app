/**
 * TeleTime POS - Receipt Preview Modal
 *
 * Modal for previewing and printing receipts
 */

import { useState, useRef, useCallback, useEffect } from 'react';
import { ReceiptTemplate } from './ReceiptTemplate';
import { ReceiptEmailModal } from './ReceiptEmailModal';
import { Download, FileText, Mail, Printer, Receipt, RefreshCw, X } from 'lucide-react';

const API_BASE = import.meta.env.VITE_API_URL || '/api';
const getToken = () => localStorage.getItem('pos_token') || localStorage.getItem('auth_token') || '';

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
  const receiptRef = useRef(null);

  // Load receipt data
  const loadReceipt = useCallback(async () => {
    if (!transactionId) return;

    setLoading(true);
    setError(null);

    try {
      const response = await fetch(`${API_BASE}/receipts/${transactionId}/data`, {
        headers: {
          Authorization: `Bearer ${getToken()}`
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
  useEffect(() => {
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
          Authorization: `Bearer ${getToken()}`
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
          Authorization: `Bearer ${getToken()}`
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
      if (a && a.parentNode) {
        a.parentNode.removeChild(a);
      }
      URL.revokeObjectURL(url);
    } catch (err) {
      console.error('[ReceiptPreview] Download error:', err);
      setError('Failed to download PDF');
    }
  };

  // Handle email send
  const handleSendEmail = async () => {
    if (!email) return;

    try {
      const response = await fetch(`${API_BASE}/receipts/${transactionId}/email`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${getToken()}`
        },
        body: JSON.stringify({ email })
      });

      const result = await response.json();

      if (!response.ok || !result.success) {
        throw new Error(result.error || 'Failed to send email');
      }
    } catch (err) {
      console.error('[ReceiptPreview] Email error:', err);
      setError(err.message);
      throw err;
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
              <Receipt className="w-5 h-5 text-blue-600" />
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
              <X className="w-6 h-6 text-gray-500" />
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
                <FileText className="w-8 h-8 text-red-600" />
              </div>
              <h3 className="text-lg font-semibold text-gray-900 mb-2">Error Loading Receipt</h3>
              <p className="text-gray-500 mb-4">{error}</p>
              <button
                onClick={loadReceipt}
                className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors flex items-center gap-2"
              >
                <RefreshCw className="w-4 h-4" />
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
                  rebates={receipt.rebates}
                  tradeIns={receipt.tradeIns?.items}
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
              <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
              Refresh
            </button>

            <div className="flex gap-3">
              <button
                onClick={() => setEmailModalOpen(true)}
                disabled={loading || !receipt}
                className="px-4 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 transition-colors flex items-center gap-2 disabled:opacity-50"
              >
                <Mail className="w-4 h-4" />
                Email
              </button>

              <button
                onClick={handleDownload}
                disabled={loading || !receipt}
                className="px-4 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 transition-colors flex items-center gap-2 disabled:opacity-50"
              >
                <Download className="w-4 h-4" />
                Download
              </button>

              <button
                onClick={handlePrint}
                disabled={loading || !receipt}
                className="px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors flex items-center gap-2 disabled:opacity-50"
              >
                <Printer className="w-4 h-4" />
                Print Receipt
              </button>
            </div>
          </div>
        </div>

      </div>
      <ReceiptEmailModal
        isOpen={emailModalOpen}
        onClose={() => setEmailModalOpen(false)}
        initialEmail={email}
        title="Email Receipt"
        successLabel="Receipt sent"
        sendLabel="Send Receipt"
        onSend={handleSendEmail}
      />
    </div>
  );
}

export default ReceiptPreviewModal;
