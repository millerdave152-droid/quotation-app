/**
 * TeleTime POS - Transactions Page (Manager)
 * View transactions and void completed transactions
 */

import { useCallback, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { TransactionList } from '../components/Orders';
import { getTransaction, voidTransaction } from '../api/transactions';
import { formatCurrency } from '../utils/formatters';

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

  const canVoid = useMemo(() => {
    const status = details?.status || selectedTransaction?.status;
    return status === 'completed';
  }, [details?.status, selectedTransaction?.status]);

  const handleSelectTransaction = useCallback(async (txn) => {
    setSelectedTransaction(txn);
    setDetails(null);
    setDetailsError(null);
    setError(null);
    setSuccess(null);
    setVoidReason('');

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
                <span className="font-medium text-gray-900">{formatCurrency(details.totalAmount)}</span>
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
    </div>
  );
}
