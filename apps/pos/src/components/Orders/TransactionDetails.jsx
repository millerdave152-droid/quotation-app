/**
 * TeleTime POS - Transaction Details Component
 * Shows full transaction details with warranty information
 */

import { useState, useEffect, useCallback } from 'react';
import {
  XMarkIcon,
  ShieldCheckIcon,
  PrinterIcon,
  EnvelopeIcon,
  ClockIcon,
  CheckCircleIcon,
  ExclamationTriangleIcon,
  ArrowTopRightOnSquareIcon,
} from '@heroicons/react/24/outline';
import { ShieldCheckIcon as ShieldCheckSolid } from '@heroicons/react/24/solid';
import { formatCurrency, formatDateTime } from '../../utils/formatters';

const API_BASE = import.meta.env.VITE_API_URL || 'http://localhost:3001/api';

/**
 * Warranty status badge
 */
function WarrantyStatusBadge({ status, daysRemaining }) {
  const statusConfig = {
    active: {
      bg: 'bg-green-100',
      text: 'text-green-700',
      icon: CheckCircleIcon,
      label: daysRemaining <= 30 ? `Expiring in ${daysRemaining} days` : 'Active',
    },
    expired: {
      bg: 'bg-gray-100',
      text: 'text-gray-600',
      icon: ClockIcon,
      label: 'Expired',
    },
    pending: {
      bg: 'bg-yellow-100',
      text: 'text-yellow-700',
      icon: ClockIcon,
      label: 'Pending',
    },
    claimed: {
      bg: 'bg-blue-100',
      text: 'text-blue-700',
      icon: ShieldCheckSolid,
      label: 'Claimed',
    },
    cancelled: {
      bg: 'bg-red-100',
      text: 'text-red-700',
      icon: ExclamationTriangleIcon,
      label: 'Cancelled',
    },
  };

  const config = statusConfig[status] || statusConfig.active;
  const Icon = config.icon;

  return (
    <span className={`inline-flex items-center gap-1 px-2 py-1 rounded-full text-xs font-medium ${config.bg} ${config.text}`}>
      <Icon className="w-3.5 h-3.5" />
      {config.label}
    </span>
  );
}

/**
 * Product item with warranty
 */
function ProductItemCard({ item }) {
  return (
    <div className="border border-gray-200 rounded-lg overflow-hidden">
      {/* Product row */}
      <div className="p-4 bg-white">
        <div className="flex justify-between items-start">
          <div className="flex-1 min-w-0">
            <h4 className="font-semibold text-gray-900 truncate">{item.name}</h4>
            {item.sku && (
              <p className="text-xs text-gray-400 mt-0.5">{item.sku}</p>
            )}
            {item.serialNumber && (
              <p className="text-xs text-gray-500 mt-1">
                S/N: <span className="font-mono">{item.serialNumber}</span>
              </p>
            )}
          </div>
          <div className="text-right ml-4">
            <p className="font-semibold text-gray-900">
              {formatCurrency(item.total)}
            </p>
            <p className="text-xs text-gray-500">
              {item.quantity} × {formatCurrency(item.unitPrice)}
            </p>
            {item.discountAmount > 0 && (
              <p className="text-xs text-red-600">
                -{formatCurrency(item.discountAmount)} discount
              </p>
            )}
          </div>
        </div>
      </div>

      {/* Warranties under this product */}
      {item.warranties && item.warranties.length > 0 && (
        <div className="bg-blue-50 border-t border-blue-100">
          {item.warranties.map((warranty, wIndex) => (
            <div key={wIndex} className="p-4 border-b border-blue-100 last:border-b-0">
              <div className="flex items-start gap-3">
                <div className="p-2 bg-blue-100 rounded-lg">
                  <ShieldCheckIcon className="w-5 h-5 text-blue-600" />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <h5 className="font-semibold text-blue-800">
                        {warranty.name || 'Protection Plan'}
                      </h5>
                      <WarrantyStatusBadge
                        status={warranty.status}
                        daysRemaining={warranty.daysRemaining}
                      />
                    </div>
                    <p className="font-semibold text-blue-700">
                      {formatCurrency(warranty.price)}
                    </p>
                  </div>

                  {/* Coverage period */}
                  <div className="mt-2 p-2 bg-white/50 rounded-md">
                    <p className="text-sm font-medium text-green-700">
                      Coverage: {warranty.coverageStartDate
                        ? new Date(warranty.coverageStartDate).toLocaleDateString('en-CA', { year: 'numeric', month: 'short', day: 'numeric' })
                        : 'TBD'}
                      {' - '}
                      {warranty.coverageEndDate
                        ? new Date(warranty.coverageEndDate).toLocaleDateString('en-CA', { year: 'numeric', month: 'short', day: 'numeric' })
                        : 'TBD'}
                    </p>
                    {warranty.daysRemaining > 0 && warranty.status === 'active' && (
                      <p className="text-xs text-gray-500 mt-1">
                        {warranty.daysRemaining} days remaining
                      </p>
                    )}
                  </div>

                  {/* Registration code */}
                  {warranty.registrationCode && (
                    <div className="mt-2">
                      <p className="text-xs text-gray-500">Registration Code</p>
                      <p className="font-mono text-sm font-semibold text-gray-900">
                        {warranty.registrationCode}
                      </p>
                    </div>
                  )}

                  {/* Terms link */}
                  {warranty.termsUrl && (
                    <a
                      href={warranty.termsUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="mt-2 inline-flex items-center gap-1 text-sm text-blue-600 hover:text-blue-800"
                    >
                      View Terms & Conditions
                      <ArrowTopRightOnSquareIcon className="w-4 h-4" />
                    </a>
                  )}

                  {/* Additional info */}
                  {warranty.deductible > 0 && (
                    <p className="mt-2 text-xs text-amber-600">
                      {formatCurrency(warranty.deductible)} deductible per claim
                    </p>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

/**
 * Transaction Details Component
 */
export function TransactionDetails({
  transactionId,
  isOpen,
  onClose,
  onPrintReceipt,
  onEmailReceipt,
}) {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [receiptData, setReceiptData] = useState(null);

  const normalizeSignatureSrc = useCallback((sig) => {
    if (!sig?.signatureData) return null;
    if (sig.signatureData.startsWith('data:')) return sig.signatureData;
    const format = sig.signatureFormat || 'png';
    return `data:image/${format};base64,${sig.signatureData}`;
  }, []);

  // Fetch receipt data
  const fetchData = useCallback(async () => {
    if (!transactionId) return;

    setLoading(true);
    setError(null);

    try {
      const response = await fetch(`${API_BASE}/receipts/${transactionId}/data`, {
        headers: {
          Authorization: `Bearer ${localStorage.getItem('pos_token')}`,
        },
      });

      if (!response.ok) {
        throw new Error('Failed to load transaction details');
      }

      const data = await response.json();
      setReceiptData(data);
    } catch (err) {
      console.error('[TransactionDetails] Fetch error:', err);
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [transactionId]);

  useEffect(() => {
    if (isOpen && transactionId) {
      fetchData();
    }
  }, [isOpen, transactionId, fetchData]);

  // Handle print
  const handlePrint = useCallback(async () => {
    if (onPrintReceipt) {
      await onPrintReceipt(receiptData);
    }
  }, [receiptData, onPrintReceipt]);

  // Handle email
  const handleEmail = useCallback(async () => {
    const email = prompt('Enter email address:', receiptData?.transaction?.customerEmail || '');
    if (email && onEmailReceipt) {
      await onEmailReceipt(receiptData, email);
    }
  }, [receiptData, onEmailReceipt]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/50 backdrop-blur-sm"
        onClick={onClose}
      />

      {/* Modal */}
      <div className="relative w-full max-w-2xl mx-4 max-h-[90vh] bg-white rounded-2xl shadow-2xl flex flex-col overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-gray-200">
          <div>
            <h2 className="text-lg font-bold text-gray-900">Transaction Details</h2>
            {receiptData?.transaction?.number && (
              <p className="text-sm text-gray-500">{receiptData.transaction.number}</p>
            )}
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={handlePrint}
              disabled={loading || !receiptData}
              className="p-2 text-gray-500 hover:text-gray-700 hover:bg-gray-100 rounded-lg disabled:opacity-50"
              title="Print Receipt"
            >
              <PrinterIcon className="w-5 h-5" />
            </button>
            <button
              type="button"
              onClick={handleEmail}
              disabled={loading || !receiptData}
              className="p-2 text-gray-500 hover:text-gray-700 hover:bg-gray-100 rounded-lg disabled:opacity-50"
              title="Email Receipt"
            >
              <EnvelopeIcon className="w-5 h-5" />
            </button>
            <button
              type="button"
              onClick={onClose}
              className="p-2 text-gray-500 hover:text-gray-700 hover:bg-gray-100 rounded-lg"
            >
              <XMarkIcon className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-4">
          {loading ? (
            <div className="flex items-center justify-center py-12">
              <div className="w-8 h-8 border-4 border-blue-600 border-t-transparent rounded-full animate-spin" />
            </div>
          ) : error ? (
            <div className="text-center py-12">
              <ExclamationTriangleIcon className="w-12 h-12 text-red-500 mx-auto mb-4" />
              <p className="text-gray-600">{error}</p>
              <button
                type="button"
                onClick={fetchData}
                className="mt-4 text-blue-600 hover:underline"
              >
                Try again
              </button>
            </div>
          ) : receiptData ? (
            <div className="space-y-6">
              {/* Transaction Info */}
              <div className="grid grid-cols-2 gap-4">
                <div className="p-3 bg-gray-50 rounded-lg">
                  <p className="text-xs text-gray-500">Date</p>
                  <p className="font-medium text-gray-900">
                    {formatDateTime(receiptData.transaction.date)}
                  </p>
                </div>
                <div className="p-3 bg-gray-50 rounded-lg">
                  <p className="text-xs text-gray-500">Cashier</p>
                  <p className="font-medium text-gray-900">
                    {receiptData.transaction.cashier || 'N/A'}
                  </p>
                </div>
                {receiptData.transaction.customer && (
                  <div className="col-span-2 p-3 bg-blue-50 rounded-lg">
                    <p className="text-xs text-blue-600">Customer</p>
                    <p className="font-medium text-gray-900">
                      {receiptData.transaction.customer}
                    </p>
                    {receiptData.transaction.customerEmail && (
                      <p className="text-sm text-gray-500">
                        {receiptData.transaction.customerEmail}
                      </p>
                    )}
                  </div>
                )}
              </div>

              {/* Items */}
              <div>
                <h3 className="font-semibold text-gray-900 mb-3">Items</h3>
                <div className="space-y-3">
                  {receiptData.items.map((item, index) => (
                    <ProductItemCard key={index} item={item} />
                  ))}
                </div>
              </div>

              {/* Totals */}
              <div className="bg-gray-50 rounded-lg p-4">
                <div className="space-y-2">
                  <div className="flex justify-between text-sm">
                    <span className="text-gray-500">Subtotal</span>
                    <span className="font-medium">{formatCurrency(receiptData.totals.subtotal)}</span>
                  </div>
                  {receiptData.totals.discount > 0 && (
                    <div className="flex justify-between text-sm">
                      <span className="text-gray-500">Discount</span>
                      <span className="font-medium text-red-600">
                        -{formatCurrency(receiptData.totals.discount)}
                      </span>
                    </div>
                  )}
                  {receiptData.totals.hst > 0 && (
                    <div className="flex justify-between text-sm">
                      <span className="text-gray-500">HST (13%)</span>
                      <span className="font-medium">{formatCurrency(receiptData.totals.hst)}</span>
                    </div>
                  )}
                  {receiptData.totals.gst > 0 && (
                    <div className="flex justify-between text-sm">
                      <span className="text-gray-500">GST (5%)</span>
                      <span className="font-medium">{formatCurrency(receiptData.totals.gst)}</span>
                    </div>
                  )}
                  {receiptData.totals.pst > 0 && (
                    <div className="flex justify-between text-sm">
                      <span className="text-gray-500">PST</span>
                      <span className="font-medium">{formatCurrency(receiptData.totals.pst)}</span>
                    </div>
                  )}
                  <div className="pt-2 border-t border-gray-200">
                    <div className="flex justify-between">
                      <span className="font-bold text-gray-900">Total</span>
                      <span className="font-bold text-gray-900 text-lg">
                        {formatCurrency(receiptData.totals.total)}
                      </span>
                    </div>
                  </div>
                </div>
              </div>

              {/* Payments */}
              <div>
                <h3 className="font-semibold text-gray-900 mb-3">Payments</h3>
                <div className="space-y-2">
                  {receiptData.payments.map((payment, index) => (
                    <div key={index} className="flex justify-between items-center p-3 bg-gray-50 rounded-lg">
                      <div>
                        <p className="font-medium text-gray-900">
                          {payment.cardBrand && payment.cardLastFour
                            ? `${payment.cardBrand} ****${payment.cardLastFour}`
                            : payment.method.toUpperCase()}
                        </p>
                        {payment.cashTendered && (
                          <p className="text-xs text-gray-500">
                            Tendered: {formatCurrency(payment.cashTendered)}
                            {payment.changeGiven > 0 && (
                              <span className="text-green-600 ml-2">
                                Change: {formatCurrency(payment.changeGiven)}
                              </span>
                            )}
                          </p>
                        )}
                      </div>
                      <p className="font-semibold text-gray-900">
                        {formatCurrency(payment.amount)}
                      </p>
                    </div>
                  ))}
                </div>
              </div>

              {/* Signatures */}
              {receiptData.signatures?.length > 0 && (
                <div>
                  <h3 className="font-semibold text-gray-900 mb-3">Signatures</h3>
                  <div className="space-y-3">
                    {receiptData.signatures.map((sig) => {
                      const src = normalizeSignatureSrc(sig);
                      return (
                        <div key={sig.id} className="p-3 bg-gray-50 rounded-lg flex items-center justify-between gap-4">
                          <div>
                            <p className="text-sm font-medium text-gray-900">
                              {sig.type?.toUpperCase() || 'SIGNATURE'}
                            </p>
                            <p className="text-xs text-gray-500">
                              {sig.signerName || 'Customer'}
                            </p>
                            {sig.capturedAt && (
                              <p className="text-[11px] text-gray-400">
                                {new Date(sig.capturedAt).toLocaleString('en-CA')}
                              </p>
                            )}
                          </div>
                          {src && (
                            <img
                              src={src}
                              alt="Signature"
                              className="h-16 w-40 object-contain border border-gray-200 bg-white rounded"
                            />
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}

export default TransactionDetails;
