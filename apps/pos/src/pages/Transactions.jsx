/**
 * TeleTime POS - Transactions Page (Manager)
 * View transactions and void completed transactions
 */

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { TransactionList } from '../components/Orders';
import { getTransaction, voidTransaction } from '../api/transactions';
import { getReturnByTransaction } from '../api/returns';
import { ReceiptEmailModal, RefundReceiptPreviewModal } from '../components/Receipt';
import { ReturnDetailsModal } from '../components/Returns';
import { useRefundReceiptActions } from '../hooks/useRefundReceiptActions';
import { formatCurrency } from '../utils/formatters';
import { ClipboardList, FileText, Printer, Truck } from 'lucide-react';

const API_BASE = import.meta.env.VITE_API_URL || '/api';
const getToken = () => localStorage.getItem('pos_token') || localStorage.getItem('auth_token') || '';

function openAuthPdf(url) {
  fetch(url, { headers: { Authorization: `Bearer ${getToken()}` } })
    .then(r => { if (!r.ok) throw new Error(`HTTP ${r.status}`); return r.blob(); })
    .then(b => window.open(URL.createObjectURL(b), '_blank'))
    .catch(() => alert('Failed to load document. Please try again.'));
}

export default function TransactionsPage() {
  const navigate = useNavigate();
  const [selectedTransaction, setSelectedTransaction] = useState(null);
  const [details, setDetails] = useState(null);
  const [detailsError, setDetailsError] = useState(null);
  const [isLoadingDetails, setIsLoadingDetails] = useState(false);
  const [voidReason, setVoidReason] = useState('');
  const [error, setError] = useState(null);
  const [success, setSuccess] = useState(null);
  const [refreshKey, setRefreshKey] = useState(0);
  const [refundReturn, setRefundReturn] = useState(null);
  const [refundReturnLoading, setRefundReturnLoading] = useState(false);
  const [returnDetailsOpen, setReturnDetailsOpen] = useState(false);

  const canVoid = useMemo(() => {
    const status = details?.status || selectedTransaction?.status;
    return status === 'completed';
  }, [details?.status, selectedTransaction?.status]);

  const selectedTransactionId = details?.transactionId || selectedTransaction?.transactionId;
  const isRefundedTransaction = (details?.status || selectedTransaction?.status) === 'refunded';

  const handleSelectTransaction = useCallback(async (txn) => {
    setSelectedTransaction(txn);
    setDetails(null);
    setDetailsError(null);
    setError(null);
    setSuccess(null);
    setVoidReason('');
    setRefundReturn(null);

    if (!txn?.transactionId) return;
    setIsLoadingDetails(true);
    try {
      const result = await getTransaction(txn.transactionId);
      if (result.success) {
        setDetails(result.data);
      } else {
        setDetailsError(result.error || 'Failed to load transaction details');
      }
    } catch (err) {
      setDetailsError(err.message || 'Failed to load transaction details');
    } finally {
      setIsLoadingDetails(false);
    }
  }, []);

  useEffect(() => {
    let cancelled = false;

    const loadRefundReturn = async () => {
      if (!isRefundedTransaction || !selectedTransactionId) {
        setRefundReturn(null);
        setRefundReturnLoading(false);
        return;
      }

      setRefundReturnLoading(true);
      const result = await getReturnByTransaction(selectedTransactionId);
      if (cancelled) return;

      if (result.success) {
        setRefundReturn(result.data);
      } else {
        setRefundReturn(null);
      }
      setRefundReturnLoading(false);
    };

    loadRefundReturn();
    return () => {
      cancelled = true;
    };
  }, [isRefundedTransaction, selectedTransactionId]);

  const refundReceipt = useRefundReceiptActions({
    returnId: refundReturn?.id,
    receiptNumber: refundReturn?.return_number,
    initialEmail: refundReturn?.customer_email || details?.customer?.email || '',
  });

  const handleVoid = useCallback(async () => {
    const transactionId = details?.transactionId || selectedTransaction?.transactionId;
    if (!transactionId) return;
    if (!voidReason.trim()) {
      setError('Void reason is required.');
      return;
    }

    const confirmed = window.confirm(
      `Void transaction ${details?.transactionNumber || selectedTransaction?.transactionNumber || ''}? This cannot be undone.`
    );
    if (!confirmed) return;

    setError(null);
    setSuccess(null);
    try {
      const result = await voidTransaction(transactionId, voidReason.trim());
      if (result.success) {
        setSuccess('Transaction voided successfully.');
        if (details) {
          setDetails({ ...details, status: 'voided', void: { reason: voidReason.trim() } });
        }
        setRefreshKey((k) => k + 1);
      } else {
        setError(result.error || 'Failed to void transaction');
      }
    } catch (err) {
      setError(err.message || 'Failed to void transaction');
    }
  }, [details, selectedTransaction, voidReason]);

  return (
    <div className="min-h-screen bg-gray-100 p-6">
      <div className="flex items-center gap-4 mb-6">
        <button
          type="button"
          onClick={() => navigate('/')}
          className="flex items-center gap-2 px-3 py-2 bg-white border border-gray-200 rounded-lg text-sm hover:bg-gray-50"
        >
          Back to POS
        </button>
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Transactions</h1>
          <p className="text-sm text-gray-500">Manager view with void actions</p>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 bg-white rounded-xl shadow-sm border border-gray-200">
          <TransactionList
            key={refreshKey}
            onSelectTransaction={handleSelectTransaction}
            selectedTransactionId={selectedTransaction?.transactionId}
            initialStatus="completed"
            initialDateRange="today"
          />
        </div>

        <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-5">
          <h2 className="text-lg font-semibold text-gray-900 mb-4">Transaction Details</h2>

          {!selectedTransaction && (
            <p className="text-sm text-gray-500">Select a transaction to view details.</p>
          )}

          {selectedTransaction && isLoadingDetails && (
            <p className="text-sm text-gray-500">Loading details...</p>
          )}

          {detailsError && (
            <div className="mb-4 p-3 bg-amber-50 border border-amber-200 rounded-lg text-sm text-amber-800">
              {detailsError}
            </div>
          )}

          {details && (
            <div className="space-y-3 text-sm">
              <div className="flex items-center justify-between">
                <span className="text-gray-500">Transaction</span>
                <span className="font-medium text-gray-900">{details.transactionNumber}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-gray-500">Status</span>
                <span className="font-medium text-gray-900 capitalize">{details.status}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-gray-500">Total</span>
                <span className="font-medium text-gray-900">{formatCurrency(details.totals?.totalAmount)}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-gray-500">Customer</span>
                <span className="font-medium text-gray-900">{details.customer?.name || 'Walk-in'}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-gray-500">Items</span>
                <span className="font-medium text-gray-900">{details.items?.length || 0}</span>
              </div>

              {details.void?.reason && (
                <div className="p-3 bg-red-50 border border-red-200 rounded-lg text-red-700">
                  Voided: {details.void.reason}
                </div>
              )}

              {isRefundedTransaction && (
                <div className="rounded-lg border border-purple-200 bg-purple-50 p-3">
                  <div className="mb-3 flex items-start justify-between gap-3">
                    <div>
                      <p className="text-xs font-medium uppercase tracking-wide text-purple-700">Refund Receipt</p>
                      <p className="text-sm text-gray-700">
                        {refundReturnLoading
                          ? 'Loading refund receipt details...'
                          : refundReturn?.return_number
                            ? `Return ${refundReturn.return_number}`
                            : 'Refund receipt not found'}
                      </p>
                    </div>
                    {refundReturn?.total_refund_amount != null && (
                      <span className="text-sm font-semibold text-purple-700">
                        {formatCurrency(refundReturn.total_refund_amount)}
                      </span>
                    )}
                  </div>

                  {refundReturn?.id && (
                    <div className="flex flex-wrap gap-2">
                      <button
                        type="button"
                        onClick={() => setReturnDetailsOpen(true)}
                        disabled={refundReceipt.busy}
                        className="rounded-lg bg-white px-3 py-2 text-sm font-medium text-gray-700 transition-colors hover:bg-gray-100 disabled:opacity-50"
                      >
                        Details
                      </button>
                      <button
                        type="button"
                        onClick={refundReceipt.preview}
                        disabled={refundReceipt.busy}
                        className="rounded-lg bg-white px-3 py-2 text-sm font-medium text-gray-700 transition-colors hover:bg-gray-100 disabled:opacity-50"
                      >
                        Preview
                      </button>
                      <button
                        type="button"
                        onClick={refundReceipt.download}
                        disabled={refundReceipt.busy}
                        className="rounded-lg bg-white px-3 py-2 text-sm font-medium text-gray-700 transition-colors hover:bg-gray-100 disabled:opacity-50"
                      >
                        Download
                      </button>
                      <button
                        type="button"
                        onClick={refundReceipt.print}
                        disabled={refundReceipt.busy}
                        className="rounded-lg bg-white px-3 py-2 text-sm font-medium text-gray-700 transition-colors hover:bg-gray-100 disabled:opacity-50"
                      >
                        Print
                      </button>
                      <button
                        type="button"
                        onClick={() => refundReceipt.setEmailModalOpen(true)}
                        disabled={refundReceipt.busy}
                        className="rounded-lg bg-white px-3 py-2 text-sm font-medium text-gray-700 transition-colors hover:bg-gray-100 disabled:opacity-50"
                      >
                        Email
                      </button>
                    </div>
                  )}

                  {refundReceipt.message && (
                    <p className={`mt-2 text-sm ${refundReceipt.message.includes('emailed to') ? 'text-green-600' : 'text-red-600'}`}>
                      {refundReceipt.message}
                    </p>
                  )}
                </div>
              )}
            </div>
          )}

          {/* Document Reprint Buttons */}
          {details && (
            <div className="mt-5 pt-4 border-t border-gray-200">
              <h3 className="text-sm font-semibold text-gray-700 mb-3">Documents</h3>
              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={() => openAuthPdf(`${API_BASE}/receipts/${selectedTransactionId}/preview`)}
                  className="inline-flex items-center gap-1.5 px-3 py-2 border border-gray-200 rounded-lg bg-gray-50 hover:bg-gray-100 text-gray-700 text-xs font-medium transition-colors"
                >
                  <Printer className="w-3.5 h-3.5" />
                  Receipt
                </button>
                <button
                  type="button"
                  onClick={() => openAuthPdf(`${API_BASE}/sales-orders/${selectedTransactionId}/view`)}
                  className="inline-flex items-center gap-1.5 px-3 py-2 border border-blue-200 rounded-lg bg-blue-50 hover:bg-blue-100 text-blue-700 text-xs font-medium transition-colors"
                >
                  <FileText className="w-3.5 h-3.5" />
                  Sales Order
                </button>
                <button
                  type="button"
                  onClick={() => openAuthPdf(`${API_BASE}/delivery-slips/transaction/${selectedTransactionId}/view`)}
                  className="inline-flex items-center gap-1.5 px-3 py-2 border border-cyan-200 rounded-lg bg-cyan-50 hover:bg-cyan-100 text-cyan-700 text-xs font-medium transition-colors"
                >
                  <Truck className="w-3.5 h-3.5" />
                  Delivery Slip
                </button>
                <button
                  type="button"
                  onClick={() => openAuthPdf(`${API_BASE}/delivery-slips/transaction/${selectedTransactionId}/waiver`)}
                  className="inline-flex items-center gap-1.5 px-3 py-2 border border-amber-200 rounded-lg bg-amber-50 hover:bg-amber-100 text-amber-700 text-xs font-medium transition-colors"
                >
                  <ClipboardList className="w-3.5 h-3.5" />
                  Delivery Waiver
                </button>
              </div>
            </div>
          )}

          <div className="mt-6">
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Void Reason
            </label>
            <textarea
              value={voidReason}
              onChange={(e) => setVoidReason(e.target.value)}
              rows={3}
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:ring-2 focus:ring-red-500 focus:border-red-500"
              placeholder="Enter reason for voiding..."
            />

            <button
              type="button"
              onClick={handleVoid}
              disabled={!details || !canVoid}
              className="mt-3 w-full h-10 rounded-lg bg-red-600 text-white text-sm font-semibold disabled:opacity-50 disabled:cursor-not-allowed hover:bg-red-700"
            >
              Void Transaction
            </button>
          </div>

          {error && (
            <div className="mt-4 p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700">
              {error}
            </div>
          )}
          {success && (
            <div className="mt-4 p-3 bg-green-50 border border-green-200 rounded-lg text-sm text-green-700">
              {success}
            </div>
          )}
        </div>
      </div>

      <RefundReceiptPreviewModal
        isOpen={refundReceipt.previewOpen}
        onClose={() => refundReceipt.setPreviewOpen(false)}
        previewUrl={refundReceipt.previewUrl}
        receiptNumber={refundReturn?.return_number}
      />
      <ReturnDetailsModal
        returnId={refundReturn?.id}
        isOpen={returnDetailsOpen}
        onClose={() => setReturnDetailsOpen(false)}
      />
      <ReceiptEmailModal
        isOpen={refundReceipt.emailModalOpen}
        onClose={() => refundReceipt.setEmailModalOpen(false)}
        initialEmail={refundReceipt.initialEmail}
        title="Email Refund Receipt"
        successLabel="Refund receipt sent"
        sendLabel="Send Refund Receipt"
        onSend={refundReceipt.sendEmail}
      />
    </div>
  );
}
