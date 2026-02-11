/**
 * TeleTime POS - Return Initiation Page
 * Search invoices and start a return process
 */

import { useState, useEffect, useCallback, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { searchInvoices } from '../api/returns';
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
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [selectedTransaction, setSelectedTransaction] = useState(null);
  const [returnTransaction, setReturnTransaction] = useState(null);
  const [refundData, setRefundData] = useState(null); // { returnRecord, transaction }
  const [exchangeTransaction, setExchangeTransaction] = useState(null);
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
    } catch (err) {
      setError('An unexpected error occurred');
      setResults([]);
    } finally {
      setLoading(false);
    }
  }, []);

  // Debounced search on query change
  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      fetchResults(searchQuery, dateRange, 1);
    }, 300);
    return () => clearTimeout(debounceRef.current);
  }, [searchQuery, dateRange, fetchResults]);

  const handlePageChange = (newPage) => {
    fetchResults(searchQuery, dateRange, newPage);
  };

  const handleStartReturn = (transaction) => {
    setReturnTransaction(transaction);
  };

  const handleReturnComplete = (returnRecord) => {
    // Items selected — move to refund processing step
    setRefundData({ returnRecord, transaction: returnTransaction });
    setReturnTransaction(null);
  };

  const handleRefundComplete = () => {
    setRefundData(null);
    fetchResults(searchQuery, dateRange, pagination.page);
  };

  const handleStartExchange = (transaction) => {
    setExchangeTransaction(transaction);
  };

  const handleExchangeComplete = () => {
    setExchangeTransaction(null);
    fetchResults(searchQuery, dateRange, pagination.page);
  };

  const formatDate = (dateStr) => {
    if (!dateStr) return '—';
    return new Date(dateStr).toLocaleDateString('en-CA', {
      year: 'numeric', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit',
    });
  };

  const formatCurrency = (amount) => {
    if (amount == null) return '$0.00';
    return `$${Number(amount).toFixed(2)}`;
  };

  return (
    <div className="min-h-screen bg-slate-900 text-white p-6">
      {/* Header */}
      <div className="flex items-center gap-4 mb-6">
        <button
          type="button"
          onClick={() => navigate('/')}
          className="flex items-center gap-1.5 px-3 py-2 bg-slate-800 hover:bg-slate-700 border border-slate-700 text-slate-300 hover:text-white text-sm font-medium rounded-lg transition-colors"
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
          </svg>
          Back
        </button>
        <div>
          <h1 className="text-2xl font-bold">Returns</h1>
          <p className="text-slate-400 text-sm mt-0.5">Search for a transaction to initiate a return</p>
        </div>
      </div>

      {/* Search & Filters */}
      <div className="flex flex-col sm:flex-row gap-3 mb-6">
        <div className="flex-1 relative">
          <input
            type="text"
            placeholder="Search by invoice #, customer name, or phone..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full bg-slate-800 border border-slate-700 rounded-lg px-4 py-2.5 text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
          />
          {loading && (
            <div className="absolute right-3 top-3">
              <div className="w-5 h-5 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
            </div>
          )}
        </div>
        <select
          value={dateRange}
          onChange={(e) => setDateRange(e.target.value)}
          className="bg-slate-800 border border-slate-700 rounded-lg px-4 py-2.5 text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
        >
          {DATE_RANGE_OPTIONS.map((opt) => (
            <option key={opt.value} value={opt.value}>{opt.label}</option>
          ))}
        </select>
      </div>

      {/* Error Banner */}
      {error && (
        <div className="bg-red-900/50 border border-red-700 rounded-lg p-4 mb-6 text-red-200">
          {error}
        </div>
      )}

      {/* Results Table */}
      {!loading && results.length === 0 && !error && (
        <div className="text-center py-16 text-slate-500">
          <svg className="w-16 h-16 mx-auto mb-4 opacity-30" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 14l6-6m-5.5.5h.01m4.99 5h.01M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16l3.5-2 3.5 2 3.5-2 3.5 2z" />
          </svg>
          <p className="text-lg font-medium">No transactions found</p>
          <p className="text-sm mt-1">Try searching by invoice number, customer name, or phone number</p>
        </div>
      )}

      {results.length > 0 && (
        <div className="bg-slate-800 rounded-lg border border-slate-700 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-700 text-slate-400 text-left">
                  <th className="px-4 py-3 font-medium">Invoice #</th>
                  <th className="px-4 py-3 font-medium">Date</th>
                  <th className="px-4 py-3 font-medium">Customer</th>
                  <th className="px-4 py-3 font-medium">Items</th>
                  <th className="px-4 py-3 font-medium text-right">Total</th>
                  <th className="px-4 py-3 font-medium text-center">Status</th>
                  <th className="px-4 py-3 font-medium text-center">Action</th>
                </tr>
              </thead>
              <tbody>
                {results.map((tx) => (
                  <tr
                    key={tx.id}
                    className={`border-b border-slate-700/50 hover:bg-slate-700/30 cursor-pointer ${selectedTransaction?.id === tx.id ? 'bg-slate-700/50' : ''}`}
                    onClick={() => setSelectedTransaction(tx)}
                  >
                    <td className="px-4 py-3 font-mono text-blue-400">{tx.transaction_number}</td>
                    <td className="px-4 py-3 text-slate-300">{formatDate(tx.created_at)}</td>
                    <td className="px-4 py-3">
                      <div className="text-white">{tx.customer_name || 'Walk-in'}</div>
                      {tx.customer_phone && (
                        <div className="text-xs text-slate-500">{tx.customer_phone}</div>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <span className="text-white">{tx.item_count} item{tx.item_count !== 1 ? 's' : ''}</span>
                      {tx.item_summary && (
                        <div className="text-xs text-slate-500 truncate max-w-[200px]">{tx.item_summary}</div>
                      )}
                    </td>
                    <td className="px-4 py-3 text-right font-medium text-white">{formatCurrency(tx.total_amount)}</td>
                    <td className="px-4 py-3 text-center">
                      <span className="px-2 py-0.5 rounded-full text-xs font-medium bg-green-900/50 text-green-400 border border-green-800">
                        Completed
                      </span>
                    </td>
                    <td className="px-4 py-3 text-center">
                      <div className="flex gap-1.5 justify-center">
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            handleStartReturn(tx);
                          }}
                          className="px-3 py-1.5 bg-orange-600 hover:bg-orange-500 text-white text-xs font-medium rounded-lg transition-colors"
                        >
                          Return
                        </button>
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            handleStartExchange(tx);
                          }}
                          className="px-3 py-1.5 bg-blue-600 hover:bg-blue-500 text-white text-xs font-medium rounded-lg transition-colors"
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

          {/* Pagination */}
          {pagination.totalPages > 1 && (
            <div className="flex items-center justify-between px-4 py-3 border-t border-slate-700">
              <div className="text-sm text-slate-400">
                Showing {((pagination.page - 1) * pagination.limit) + 1}–{Math.min(pagination.page * pagination.limit, pagination.total)} of {pagination.total}
              </div>
              <div className="flex gap-2">
                <button
                  onClick={() => handlePageChange(pagination.page - 1)}
                  disabled={pagination.page <= 1}
                  className="px-3 py-1 rounded bg-slate-700 text-white text-sm disabled:opacity-40 hover:bg-slate-600"
                >
                  Previous
                </button>
                <button
                  onClick={() => handlePageChange(pagination.page + 1)}
                  disabled={pagination.page >= pagination.totalPages}
                  className="px-3 py-1 rounded bg-slate-700 text-white text-sm disabled:opacity-40 hover:bg-slate-600"
                >
                  Next
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Return Reason Selector Modal */}
      {returnTransaction && (
        <ReturnReasonSelector
          transaction={returnTransaction}
          onClose={() => setReturnTransaction(null)}
          onComplete={handleReturnComplete}
        />
      )}

      {/* Refund Processor Modal */}
      {refundData && (
        <RefundProcessor
          returnRecord={refundData.returnRecord}
          transaction={refundData.transaction}
          onClose={() => setRefundData(null)}
          onComplete={handleRefundComplete}
        />
      )}

      {/* Exchange Processor Modal */}
      {exchangeTransaction && (
        <ExchangeProcessor
          transaction={exchangeTransaction}
          onClose={() => setExchangeTransaction(null)}
          onComplete={handleExchangeComplete}
        />
      )}
    </div>
  );
}
