/**
 * TeleTime POS - Return Initiation Page
 * Search invoices, start a return process, and review completed refunds.
 */

import { useState, useEffect, useCallback, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { getReturnsHistory, searchInvoices } from '../api/returns';
import { ReceiptEmailModal, RefundReceiptPreviewModal } from '../components/Receipt';
import { ReturnDetailsModal } from '../components/Returns';
import { useRefundReceiptActions } from '../hooks/useRefundReceiptActions';
import ReturnReasonSelector from '../components/Returns/ReturnReasonSelector';
import RefundProcessor from '../components/Returns/RefundProcessor';
import ExchangeProcessor from '../components/Returns/ExchangeProcessor';

const DATE_RANGE_OPTIONS = [
  { value: 'all_time', label: 'All Time' },
  { value: 'today', label: 'Today' },
  { value: 'this_week', label: 'This Week' },
  { value: 'this_month', label: 'This Month' },
  { value: 'last_month', label: 'Last Month' },
];
export default function ReturnInitiation() {
  const navigate = useNavigate();
  const [searchQuery, setSearchQuery] = useState('');
  const [dateRange, setDateRange] = useState('all_time');
  const [results, setResults] = useState([]);
  const [pagination, setPagination] = useState({ page: 1, limit: 20, total: 0, totalPages: 0 });
  const [returnsHistory, setReturnsHistory] = useState([]);
  const [historyPagination, setHistoryPagination] = useState({ page: 1, limit: 10, total: 0, totalPages: 0 });
  const [loading, setLoading] = useState(false);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [error, setError] = useState(null);
  const [historyError, setHistoryError] = useState(null);
  const [selectedTransaction, setSelectedTransaction] = useState(null);
  const [returnTransaction, setReturnTransaction] = useState(null);
  const [refundData, setRefundData] = useState(null);
  const [exchangeTransaction, setExchangeTransaction] = useState(null);
  const [activeHistoryReceipt, setActiveHistoryReceipt] = useState(null);
  const [detailsOpen, setDetailsOpen] = useState(false);
  const debounceRef = useRef(null);

  const fetchResults = useCallback(async (query, range, page = 1) => {
    setLoading(true);
    setError(null);
    try {
      const result = await searchInvoices({
        search: query || undefined,
        dateRange: range !== 'all_time' ? range : undefined,
        page,
        limit: 20,
      });
      if (result.success) {
        setResults(result.data || []);
        setPagination(result.pagination || { page: 1, limit: 20, total: 0, totalPages: 0 });
      } else {
        setError(result.error || 'Failed to search transactions');
        setResults([]);
      }
    } catch {
      setError('An unexpected error occurred');
      setResults([]);
    } finally {
      setLoading(false);
    }
  }, []);

  const fetchReturnsHistory = useCallback(async (query, range, page = 1) => {
    setHistoryLoading(true);
    setHistoryError(null);
    try {
      const result = await getReturnsHistory({
        search: query || undefined,
        dateRange: range !== 'all_time' ? range : undefined,
        page,
        limit: 10,
      });
      if (result.success) {
        setReturnsHistory(result.data || []);
        setHistoryPagination(result.pagination || { page: 1, limit: 10, total: 0, totalPages: 0 });
      } else {
        setHistoryError(result.error || 'Failed to load returns history');
        setReturnsHistory([]);
      }
    } catch (err) {
      setHistoryError(err.message || 'Failed to load returns history');
      setReturnsHistory([]);
    } finally {
      setHistoryLoading(false);
    }
  }, []);

  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      fetchResults(searchQuery, dateRange, 1);
      fetchReturnsHistory(searchQuery, dateRange, 1);
    }, 300);
    return () => clearTimeout(debounceRef.current);
  }, [searchQuery, dateRange, fetchResults, fetchReturnsHistory]);

  const handlePageChange = (newPage) => {
    fetchResults(searchQuery, dateRange, newPage);
  };

  const handleHistoryPageChange = (newPage) => {
    fetchReturnsHistory(searchQuery, dateRange, newPage);
  };

  const handleStartReturn = (transaction) => {
    setReturnTransaction(transaction);
  };

  const handleReturnComplete = (returnRecord) => {
    setRefundData({ returnRecord, transaction: returnTransaction });
    setReturnTransaction(null);
  };

  const handleRefundComplete = () => {
    setRefundData(null);
    fetchResults(searchQuery, dateRange, pagination.page);
    fetchReturnsHistory(searchQuery, dateRange, historyPagination.page);
  };

  const handleStartExchange = (transaction) => {
    setExchangeTransaction(transaction);
  };

  const handleExchangeComplete = () => {
    setExchangeTransaction(null);
    fetchResults(searchQuery, dateRange, pagination.page);
  };

  const activeHistoryActions = useRefundReceiptActions({
    returnId: activeHistoryReceipt?.id,
    receiptNumber: activeHistoryReceipt?.return_number,
    initialEmail: activeHistoryReceipt?.customer_email || '',
  });

  const handlePreviewReceipt = useCallback(async (returnRecord) => {
    if (!returnRecord?.id) return;
    setActiveHistoryReceipt(returnRecord);
    await activeHistoryActions.preview(returnRecord);
  }, [activeHistoryActions]);

  const handleDownloadReceipt = useCallback(async (returnRecord) => {
    if (!returnRecord?.id) return;
    await activeHistoryActions.download(returnRecord);
  }, [activeHistoryActions]);

  const handlePrintReceipt = useCallback(async (returnRecord) => {
    if (!returnRecord?.id) return;
    await activeHistoryActions.print(returnRecord);
  }, [activeHistoryActions]);

  const handleEmailReceipt = useCallback(async (returnRecord) => {
    if (!returnRecord?.id) return;
    setActiveHistoryReceipt(returnRecord);
    activeHistoryActions.setEmailModalOpen(true);
  }, [activeHistoryActions]);

  const formatDate = (dateStr) => {
    if (!dateStr) return '-';
    return new Date(dateStr).toLocaleDateString('en-CA', {
      year: 'numeric', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit',
    });
  };

  const formatCurrency = (amount) => {
    if (amount == null) return '$0.00';
    return `$${Number(amount).toFixed(2)}`;
  };

  return (
    <div className="min-h-screen bg-slate-900 p-6 text-white">
      <div className="mb-6 flex items-center gap-4">
        <button
          type="button"
          onClick={() => navigate('/')}
          className="flex items-center gap-1.5 rounded-lg border border-slate-700 bg-slate-800 px-3 py-2 text-sm font-medium text-slate-300 transition-colors hover:bg-slate-700 hover:text-white"
        >
          <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
          </svg>
          Back
        </button>
        <div>
          <h1 className="text-2xl font-bold">Returns</h1>
          <p className="mt-0.5 text-sm text-slate-400">Search for a transaction to initiate a return</p>
        </div>
      </div>

      <div className="mb-6 flex flex-col gap-3 sm:flex-row">
        <div className="relative flex-1">
          <input
            type="text"
            placeholder="Search by invoice #, customer name, or phone..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full rounded-lg border border-slate-700 bg-slate-800 px-4 py-2.5 text-white placeholder-slate-500 focus:border-transparent focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
          {loading && (
            <div className="absolute right-3 top-3">
              <div className="h-5 w-5 animate-spin rounded-full border-2 border-blue-500 border-t-transparent" />
            </div>
          )}
        </div>
        <select
          value={dateRange}
          onChange={(e) => setDateRange(e.target.value)}
          className="rounded-lg border border-slate-700 bg-slate-800 px-4 py-2.5 text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
        >
          {DATE_RANGE_OPTIONS.map((opt) => (
            <option key={opt.value} value={opt.value}>{opt.label}</option>
          ))}
        </select>
      </div>

      {error && (
        <div className="mb-6 rounded-lg border border-red-700 bg-red-900/50 p-4 text-red-200">
          {error}
        </div>
      )}

      {!loading && results.length === 0 && !error && (
        <div className="py-16 text-center text-slate-500">
          <svg className="mx-auto mb-4 h-16 w-16 opacity-30" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 14l6-6m-5.5.5h.01m4.99 5h.01M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16l3.5-2 3.5 2 3.5-2 3.5 2z" />
          </svg>
          <p className="text-lg font-medium">No transactions found</p>
          <p className="mt-1 text-sm">Try searching by invoice number, customer name, or phone number</p>
        </div>
      )}

      {results.length > 0 && (
        <div className="overflow-hidden rounded-lg border border-slate-700 bg-slate-800">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-700 text-left text-slate-400">
                  <th className="px-4 py-3 font-medium">Invoice #</th>
                  <th className="px-4 py-3 font-medium">Date</th>
                  <th className="px-4 py-3 font-medium">Customer</th>
                  <th className="px-4 py-3 font-medium">Items</th>
                  <th className="px-4 py-3 text-right font-medium">Total</th>
                  <th className="px-4 py-3 text-center font-medium">Status</th>
                  <th className="px-4 py-3 text-center font-medium">Action</th>
                </tr>
              </thead>
              <tbody>
                {results.map((tx) => (
                  <tr
                    key={tx.transaction_id}
                    className={`cursor-pointer border-b border-slate-700/50 hover:bg-slate-700/30 ${selectedTransaction?.transaction_id === tx.transaction_id ? 'bg-slate-700/50' : ''}`}
                    onClick={() => setSelectedTransaction(tx)}
                  >
                    <td className="px-4 py-3 font-mono text-blue-400">{tx.transaction_number}</td>
                    <td className="px-4 py-3 text-slate-300">{formatDate(tx.created_at)}</td>
                    <td className="px-4 py-3">
                      <div className="text-white">{tx.customer_name || 'Walk-in'}</div>
                      {tx.customer_phone && <div className="text-xs text-slate-500">{tx.customer_phone}</div>}
                    </td>
                    <td className="px-4 py-3">
                      <span className="text-white">{tx.item_count} item{tx.item_count !== 1 ? 's' : ''}</span>
                      {tx.item_summary && <div className="max-w-[200px] truncate text-xs text-slate-500">{tx.item_summary}</div>}
                    </td>
                    <td className="px-4 py-3 text-right font-medium text-white">{formatCurrency(tx.total_amount)}</td>
                    <td className="px-4 py-3 text-center">
                      <span className="rounded-full border border-green-800 bg-green-900/50 px-2 py-0.5 text-xs font-medium text-green-400">
                        Completed
                      </span>
                    </td>
                    <td className="px-4 py-3 text-center">
                      <div className="flex justify-center gap-1.5">
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            handleStartReturn(tx);
                          }}
                          className="rounded-lg bg-orange-600 px-3 py-1.5 text-xs font-medium text-white transition-colors hover:bg-orange-500"
                        >
                          Return
                        </button>
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            handleStartExchange(tx);
                          }}
                          className="rounded-lg bg-blue-600 px-3 py-1.5 text-xs font-medium text-white transition-colors hover:bg-blue-500"
                        >
                          Exchange
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {pagination.totalPages > 1 && (
            <div className="flex items-center justify-between border-t border-slate-700 px-4 py-3">
              <div className="text-sm text-slate-400">
                Showing {((pagination.page - 1) * pagination.limit) + 1}-{Math.min(pagination.page * pagination.limit, pagination.total)} of {pagination.total}
              </div>
              <div className="flex gap-2">
                <button
                  onClick={() => handlePageChange(pagination.page - 1)}
                  disabled={pagination.page <= 1}
                  className="rounded bg-slate-700 px-3 py-1 text-sm text-white hover:bg-slate-600 disabled:opacity-40"
                >
                  Previous
                </button>
                <button
                  onClick={() => handlePageChange(pagination.page + 1)}
                  disabled={pagination.page >= pagination.totalPages}
                  className="rounded bg-slate-700 px-3 py-1 text-sm text-white hover:bg-slate-600 disabled:opacity-40"
                >
                  Next
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      <div className="mt-8">
        <div className="mb-4">
          <h2 className="text-xl font-bold">Recent Refunds</h2>
          <p className="text-sm text-slate-400">Completed return history with refund receipt access</p>
        </div>

        {historyError && (
          <div className="mb-4 rounded-lg border border-red-700 bg-red-900/50 p-4 text-red-200">
            {historyError}
          </div>
        )}

        <div className="overflow-hidden rounded-lg border border-slate-700 bg-slate-800">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-700 text-left text-slate-400">
                  <th className="px-4 py-3 font-medium">Return #</th>
                  <th className="px-4 py-3 font-medium">Original Invoice</th>
                  <th className="px-4 py-3 font-medium">Customer</th>
                  <th className="px-4 py-3 font-medium">Completed</th>
                  <th className="px-4 py-3 text-right font-medium">Refund</th>
                  <th className="px-4 py-3 text-center font-medium">Receipt</th>
                </tr>
              </thead>
              <tbody>
                {historyLoading ? (
                  <tr>
                    <td colSpan={6} className="px-4 py-12 text-center text-slate-400">
                      Loading returns history...
                    </td>
                  </tr>
                ) : returnsHistory.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="px-4 py-12 text-center text-slate-500">
                      No completed refunds found
                    </td>
                  </tr>
                ) : (
                  returnsHistory.map((ret) => (
                    <tr key={ret.id} className="border-b border-slate-700/50 last:border-b-0 hover:bg-slate-700/20">
                      <td className="px-4 py-3 font-mono text-emerald-400">{ret.return_number}</td>
                      <td className="px-4 py-3 text-blue-400">{ret.original_transaction_number}</td>
                      <td className="px-4 py-3">
                        <div className="text-white">{ret.customer_name || 'Walk-in'}</div>
                        {ret.customer_email && <div className="text-xs text-slate-500">{ret.customer_email}</div>}
                      </td>
                      <td className="px-4 py-3 text-slate-300">{formatDate(ret.completed_at || ret.updated_at || ret.created_at)}</td>
                      <td className="px-4 py-3 text-right font-medium text-white">{formatCurrency(ret.total_refund_amount)}</td>
                      <td className="px-4 py-3">
                        <div className="flex flex-wrap justify-center gap-2">
                          <button
                            type="button"
                            onClick={() => {
                              setActiveHistoryReceipt(ret);
                              setDetailsOpen(true);
                            }}
                            disabled={activeHistoryActions.busy}
                            className="rounded-lg bg-slate-700 px-3 py-1.5 text-xs font-medium text-white transition-colors hover:bg-slate-600 disabled:opacity-40"
                          >
                            Details
                          </button>
                          <button
                            type="button"
                            onClick={() => handlePreviewReceipt(ret)}
                            disabled={activeHistoryActions.busy}
                            className="rounded-lg bg-slate-700 px-3 py-1.5 text-xs font-medium text-white transition-colors hover:bg-slate-600 disabled:opacity-40"
                          >
                            Preview
                          </button>
                          <button
                            type="button"
                            onClick={() => handleDownloadReceipt(ret)}
                            disabled={activeHistoryActions.busy}
                            className="rounded-lg bg-slate-700 px-3 py-1.5 text-xs font-medium text-white transition-colors hover:bg-slate-600 disabled:opacity-40"
                          >
                            Download
                          </button>
                          <button
                            type="button"
                            onClick={() => handlePrintReceipt(ret)}
                            disabled={activeHistoryActions.busy}
                            className="rounded-lg bg-slate-700 px-3 py-1.5 text-xs font-medium text-white transition-colors hover:bg-slate-600 disabled:opacity-40"
                          >
                            Print
                          </button>
                          <button
                            type="button"
                            onClick={() => handleEmailReceipt(ret)}
                            disabled={activeHistoryActions.busy}
                            className="rounded-lg bg-slate-700 px-3 py-1.5 text-xs font-medium text-white transition-colors hover:bg-slate-600 disabled:opacity-40"
                          >
                            Email
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>

          {historyPagination.totalPages > 1 && (
            <div className="flex items-center justify-between border-t border-slate-700 px-4 py-3">
              <div className="text-sm text-slate-400">
                Showing {((historyPagination.page - 1) * historyPagination.limit) + 1}-{Math.min(historyPagination.page * historyPagination.limit, historyPagination.total)} of {historyPagination.total}
              </div>
              <div className="flex gap-2">
                <button
                  onClick={() => handleHistoryPageChange(historyPagination.page - 1)}
                  disabled={historyPagination.page <= 1}
                  className="rounded bg-slate-700 px-3 py-1 text-sm text-white hover:bg-slate-600 disabled:opacity-40"
                >
                  Previous
                </button>
                <button
                  onClick={() => handleHistoryPageChange(historyPagination.page + 1)}
                  disabled={historyPagination.page >= historyPagination.totalPages}
                  className="rounded bg-slate-700 px-3 py-1 text-sm text-white hover:bg-slate-600 disabled:opacity-40"
                >
                  Next
                </button>
              </div>
            </div>
          )}
        </div>

        {activeHistoryActions.message && (
          <p className={`mt-3 text-sm ${activeHistoryActions.message.includes('emailed to') ? 'text-green-300' : 'text-red-300'}`}>
            {activeHistoryActions.message}
          </p>
        )}
      </div>

      {returnTransaction && (
        <ReturnReasonSelector
          transaction={returnTransaction}
          onClose={() => setReturnTransaction(null)}
          onComplete={handleReturnComplete}
        />
      )}

      {refundData && (
        <RefundProcessor
          returnRecord={refundData.returnRecord}
          transaction={refundData.transaction}
          onClose={() => setRefundData(null)}
          onComplete={handleRefundComplete}
        />
      )}

      {exchangeTransaction && (
        <ExchangeProcessor
          transaction={exchangeTransaction}
          onClose={() => setExchangeTransaction(null)}
          onComplete={handleExchangeComplete}
        />
      )}

      <RefundReceiptPreviewModal
        isOpen={activeHistoryActions.previewOpen}
        onClose={() => activeHistoryActions.setPreviewOpen(false)}
        previewUrl={activeHistoryActions.previewUrl}
        receiptNumber={activeHistoryReceipt?.return_number}
      />
      <ReturnDetailsModal
        returnId={activeHistoryReceipt?.id}
        isOpen={detailsOpen}
        onClose={() => setDetailsOpen(false)}
      />
      <ReceiptEmailModal
        isOpen={activeHistoryActions.emailModalOpen}
        onClose={() => activeHistoryActions.setEmailModalOpen(false)}
        initialEmail={activeHistoryReceipt?.customer_email || ''}
        title="Email Refund Receipt"
        successLabel="Refund receipt sent"
        sendLabel="Send Refund Receipt"
        onSend={(email) => activeHistoryActions.sendEmail(email, activeHistoryReceipt)}
      />
    </div>
  );
}
