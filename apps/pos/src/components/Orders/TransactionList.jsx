/**
 * TeleTime POS - Transaction List Component
 * Displays transactions with status filters and counts
 */

import { useState, useEffect, useCallback, useMemo } from 'react';
import {
  MagnifyingGlassIcon,
  ArrowPathIcon,
  ChevronLeftIcon,
  ChevronRightIcon,
  ReceiptRefundIcon,
  EnvelopeIcon,
} from '@heroicons/react/24/outline';
import { getTransactions } from '../../api/transactions';
import { formatCurrency } from '../../utils/formatters';
import TransactionFilterTabs from './TransactionFilterTabs';
import useTransactionCounts from '../../hooks/useTransactionCounts';
import { EmailSelectedButton } from '../Email';

/**
 * Date range filter dropdown
 */
function DateRangeFilter({ value, onChange }) {
  const options = [
    { value: 'today', label: 'Today' },
    { value: 'yesterday', label: 'Yesterday' },
    { value: 'this_week', label: 'This Week' },
    { value: 'last_week', label: 'Last Week' },
    { value: 'this_month', label: 'This Month' },
    { value: 'last_month', label: 'Last Month' },
    { value: '', label: 'All Time' },
  ];

  return (
    <select
      value={value || ''}
      onChange={(e) => onChange(e.target.value || null)}
      className="h-10 px-3 text-sm border border-gray-300 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
    >
      {options.map((opt) => (
        <option key={opt.value} value={opt.value}>
          {opt.label}
        </option>
      ))}
    </select>
  );
}

/**
 * Transaction row component
 */
function TransactionRow({ transaction, onSelect, isSelected, showCheckbox, isChecked, onToggleSelect }) {
  const statusConfig = {
    completed: { bg: 'bg-green-50', text: 'text-green-700', label: 'Completed' },
    pending: { bg: 'bg-amber-50', text: 'text-amber-700', label: 'Pending' },
    voided: { bg: 'bg-red-50', text: 'text-red-700', label: 'Voided' },
    refunded: { bg: 'bg-purple-50', text: 'text-purple-700', label: 'Refunded' },
  };

  const status = statusConfig[transaction.status] || statusConfig.pending;

  const handleCheckboxClick = (e) => {
    e.stopPropagation();
    onToggleSelect?.(transaction.transactionId);
  };

  return (
    <tr
      onClick={() => onSelect?.(transaction)}
      className={`
        cursor-pointer transition-colors
        ${isSelected ? 'bg-blue-50' : isChecked ? 'bg-blue-25' : 'hover:bg-gray-50'}
      `}
    >
      {showCheckbox && (
        <td className="w-12 px-4 py-3">
          <input
            type="checkbox"
            checked={isChecked}
            onChange={handleCheckboxClick}
            onClick={(e) => e.stopPropagation()}
            className="w-4 h-4 text-blue-600 rounded border-gray-300 focus:ring-blue-500"
          />
        </td>
      )}
      <td className="px-4 py-3">
        <div className="font-medium text-gray-900">{transaction.transactionNumber}</div>
        <div className="text-xs text-gray-500">
          {new Date(transaction.createdAt).toLocaleString()}
        </div>
      </td>
      <td className="px-4 py-3">
        <div className="text-gray-900">{transaction.customerName || 'Walk-in'}</div>
        <div className="text-xs text-gray-500">
          {transaction.itemCount} item{transaction.itemCount !== 1 ? 's' : ''}
        </div>
      </td>
      <td className="px-4 py-3 text-right">
        <div className="font-medium text-gray-900 tabular-nums">
          {formatCurrency(transaction.totalAmount)}
        </div>
        {transaction.discountAmount > 0 && (
          <div className="text-xs text-green-600 tabular-nums">
            -{formatCurrency(transaction.discountAmount)} discount
          </div>
        )}
      </td>
      <td className="px-4 py-3">
        <span className={`inline-flex items-center px-2 py-1 text-xs font-medium rounded-full ${status.bg} ${status.text}`}>
          {status.label}
        </span>
      </td>
      <td className="px-4 py-3 text-sm text-gray-500">
        {transaction.cashierName || '-'}
      </td>
    </tr>
  );
}

/**
 * Pagination controls
 */
function Pagination({ pagination, onPageChange, isLoading }) {
  if (!pagination || pagination.totalPages <= 1) return null;

  return (
    <div className="flex items-center justify-between px-4 py-3 border-t border-gray-200">
      <div className="text-sm text-gray-500">
        Showing {(pagination.page - 1) * pagination.limit + 1} to{' '}
        {Math.min(pagination.page * pagination.limit, pagination.total)} of {pagination.total}
      </div>
      <div className="flex gap-2">
        <button
          onClick={() => onPageChange(pagination.page - 1)}
          disabled={pagination.page <= 1 || isLoading}
          className="p-2 text-gray-500 hover:text-gray-700 hover:bg-gray-100 rounded-lg disabled:opacity-50 disabled:cursor-not-allowed"
        >
          <ChevronLeftIcon className="w-5 h-5" />
        </button>
        <span className="flex items-center px-3 text-sm font-medium text-gray-700">
          {pagination.page} / {pagination.totalPages}
        </span>
        <button
          onClick={() => onPageChange(pagination.page + 1)}
          disabled={!pagination.hasMore || isLoading}
          className="p-2 text-gray-500 hover:text-gray-700 hover:bg-gray-100 rounded-lg disabled:opacity-50 disabled:cursor-not-allowed"
        >
          <ChevronRightIcon className="w-5 h-5" />
        </button>
      </div>
    </div>
  );
}

/**
 * Transaction List Component
 * @param {object} props
 * @param {function} props.onSelectTransaction - Callback when transaction is selected
 * @param {number} props.selectedTransactionId - Currently selected transaction ID
 * @param {number} props.shiftId - Filter by shift (optional)
 * @param {number} props.customerId - Filter by customer (optional)
 * @param {string} props.initialStatus - Initial status filter
 * @param {string} props.initialDateRange - Initial date range filter
 */
export default function TransactionList({
  onSelectTransaction,
  selectedTransactionId,
  shiftId,
  customerId,
  salesRepId,
  initialStatus = null,
  initialDateRange = 'today',
}) {
  // State
  const [transactions, setTransactions] = useState([]);
  const [pagination, setPagination] = useState(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState(null);

  // Selection state for multi-select actions
  const [selectedIds, setSelectedIds] = useState(new Set());
  const [isSelectMode, setIsSelectMode] = useState(false);

  // Filters
  const [status, setStatus] = useState(initialStatus);
  const [dateRange, setDateRange] = useState(initialDateRange);
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);

  // Debounced search
  const [debouncedSearch, setDebouncedSearch] = useState('');
  useEffect(() => {
    const timer = setTimeout(() => setDebouncedSearch(search), 300);
    return () => clearTimeout(timer);
  }, [search]);

  // Build filter object for counts hook
  const filterParams = useMemo(() => ({
    dateRange,
    search: debouncedSearch || undefined,
    shiftId,
    customerId,
    salesRepId,
  }), [dateRange, debouncedSearch, shiftId, customerId, salesRepId]);

  // Use transaction counts hook (fetches counts separately for better UX)
  const {
    counts,
    isLoading: countsLoading,
    refresh: refreshCounts,
  } = useTransactionCounts(filterParams);

  // Fetch transactions
  const fetchTransactions = useCallback(async () => {
    setIsLoading(true);
    setError(null);

    try {
      const result = await getTransactions({
        status,
        dateRange,
        search: debouncedSearch || undefined,
        shiftId,
        customerId,
        salesRepId,
        page,
        limit: 20,
        includeCounts: false, // Counts handled by hook
      });

      if (result.success) {
        setTransactions(result.data);
        setPagination(result.pagination);
      } else {
        setError(result.error || 'Failed to load transactions');
      }
    } catch (err) {
      console.error('[TransactionList] Fetch error:', err);
      setError(err.message || 'An error occurred');
    } finally {
      setIsLoading(false);
    }
  }, [status, dateRange, debouncedSearch, shiftId, customerId, salesRepId, page]);

  // Load on mount and when filters change
  useEffect(() => {
    fetchTransactions();
  }, [fetchTransactions]);

  // Reset page when filters change
  useEffect(() => {
    setPage(1);
  }, [status, dateRange, debouncedSearch]);

  // Handle status change
  const handleStatusChange = useCallback((newStatus) => {
    setStatus(newStatus);
  }, []);

  // Handle date range change
  const handleDateRangeChange = useCallback((newRange) => {
    setDateRange(newRange);
  }, []);

  // Handle search change
  const handleSearchChange = useCallback((e) => {
    setSearch(e.target.value);
  }, []);

  // Handle refresh
  const handleRefresh = useCallback(() => {
    fetchTransactions();
    refreshCounts();
  }, [fetchTransactions, refreshCounts]);

  // Handle toggle select mode
  const handleToggleSelectMode = useCallback(() => {
    setIsSelectMode(prev => {
      if (prev) {
        // Exiting select mode, clear selections
        setSelectedIds(new Set());
      }
      return !prev;
    });
  }, []);

  // Handle toggle single selection
  const handleToggleSelect = useCallback((transactionId) => {
    setSelectedIds(prev => {
      const next = new Set(prev);
      if (next.has(transactionId)) {
        next.delete(transactionId);
      } else {
        next.add(transactionId);
      }
      return next;
    });
  }, []);

  // Handle select all visible
  const handleSelectAll = useCallback(() => {
    const visibleIds = transactions.map(t => t.transactionId);
    const allSelected = visibleIds.every(id => selectedIds.has(id));

    if (allSelected) {
      // Deselect all visible
      setSelectedIds(prev => {
        const next = new Set(prev);
        visibleIds.forEach(id => next.delete(id));
        return next;
      });
    } else {
      // Select all visible
      setSelectedIds(prev => {
        const next = new Set(prev);
        visibleIds.forEach(id => next.add(id));
        return next;
      });
    }
  }, [transactions, selectedIds]);

  // Clear selection when filters change
  useEffect(() => {
    setSelectedIds(new Set());
  }, [status, dateRange, debouncedSearch]);

  // Computed selection state
  const allVisibleSelected = transactions.length > 0 && transactions.every(t => selectedIds.has(t.transactionId));
  const someVisibleSelected = transactions.some(t => selectedIds.has(t.transactionId)) && !allVisibleSelected;

  return (
    <div className="flex flex-col h-full bg-white rounded-xl border border-gray-200 overflow-hidden">
      {/* Header with filters */}
      <div className="p-4 border-b border-gray-200 space-y-4">
        {/* Status tabs with counts */}
        <TransactionFilterTabs
          activeStatus={status}
          counts={counts}
          isLoading={countsLoading}
          onStatusChange={handleStatusChange}
        />

        {/* Search and date filter row */}
        <div className="flex gap-3">
          {/* Search input */}
          <div className="flex-1 relative">
            <MagnifyingGlassIcon className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
            <input
              type="text"
              placeholder="Search transactions, customers..."
              value={search}
              onChange={handleSearchChange}
              className="w-full h-10 pl-10 pr-4 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
            />
          </div>

          {/* Date range filter */}
          <DateRangeFilter value={dateRange} onChange={handleDateRangeChange} />

          {/* Refresh button */}
          <button
            onClick={handleRefresh}
            disabled={isLoading}
            className="h-10 px-3 text-gray-500 hover:text-gray-700 hover:bg-gray-100 border border-gray-300 rounded-lg transition-colors disabled:opacity-50"
            title="Refresh"
          >
            <ArrowPathIcon className={`w-5 h-5 ${isLoading ? 'animate-spin' : ''}`} />
          </button>

          {/* Select mode toggle */}
          <button
            onClick={handleToggleSelectMode}
            className={`
              h-10 px-3 font-medium text-sm rounded-lg border transition-colors
              ${isSelectMode
                ? 'bg-blue-600 text-white border-blue-600 hover:bg-blue-700'
                : 'text-gray-600 border-gray-300 hover:bg-gray-100'
              }
            `}
          >
            {isSelectMode ? `${selectedIds.size} Selected` : 'Select'}
          </button>
        </div>

        {/* Multi-select action bar */}
        {isSelectMode && selectedIds.size > 0 && (
          <div className="flex items-center justify-between pt-3 border-t border-gray-200">
            <div className="text-sm text-gray-600">
              {selectedIds.size} transaction{selectedIds.size !== 1 ? 's' : ''} selected
            </div>
            <div className="flex items-center gap-2">
              <button
                onClick={() => setSelectedIds(new Set())}
                className="px-3 py-1.5 text-sm text-gray-600 hover:bg-gray-100 rounded-lg transition-colors"
              >
                Clear Selection
              </button>
              <EmailSelectedButton
                transactionIds={Array.from(selectedIds)}
                onComplete={() => {
                  setSelectedIds(new Set());
                  setIsSelectMode(false);
                }}
              />
            </div>
          </div>
        )}
      </div>

      {/* Error message */}
      {error && (
        <div className="px-4 py-3 bg-red-50 border-b border-red-200">
          <p className="text-sm text-red-700">{error}</p>
        </div>
      )}

      {/* Table */}
      <div className="flex-1 overflow-auto">
        <table className="w-full">
          <thead className="bg-gray-50 sticky top-0">
            <tr>
              {isSelectMode && (
                <th className="w-12 px-4 py-3">
                  <input
                    type="checkbox"
                    checked={allVisibleSelected}
                    ref={(el) => el && (el.indeterminate = someVisibleSelected)}
                    onChange={handleSelectAll}
                    className="w-4 h-4 text-blue-600 rounded border-gray-300 focus:ring-blue-500"
                  />
                </th>
              )}
              <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">
                Transaction
              </th>
              <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">
                Customer
              </th>
              <th className="px-4 py-3 text-right text-xs font-semibold text-gray-500 uppercase tracking-wider">
                Amount
              </th>
              <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">
                Status
              </th>
              <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">
                Cashier
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {isLoading && transactions.length === 0 ? (
              <tr>
                <td colSpan={isSelectMode ? 6 : 5} className="px-4 py-12 text-center">
                  <div className="flex flex-col items-center gap-3">
                    <ArrowPathIcon className="w-8 h-8 text-gray-300 animate-spin" />
                    <p className="text-gray-500">Loading transactions...</p>
                  </div>
                </td>
              </tr>
            ) : transactions.length === 0 ? (
              <tr>
                <td colSpan={isSelectMode ? 6 : 5} className="px-4 py-12 text-center">
                  <div className="flex flex-col items-center gap-3">
                    <ReceiptRefundIcon className="w-12 h-12 text-gray-300" />
                    <p className="text-gray-500">No transactions found</p>
                    <p className="text-sm text-gray-400">
                      Try adjusting your filters or date range
                    </p>
                  </div>
                </td>
              </tr>
            ) : (
              transactions.map((transaction) => (
                <TransactionRow
                  key={transaction.transactionId}
                  transaction={transaction}
                  onSelect={onSelectTransaction}
                  isSelected={selectedTransactionId === transaction.transactionId}
                  showCheckbox={isSelectMode}
                  isChecked={selectedIds.has(transaction.transactionId)}
                  onToggleSelect={handleToggleSelect}
                />
              ))
            )}
          </tbody>
        </table>
      </div>

      {/* Pagination */}
      <Pagination
        pagination={pagination}
        onPageChange={setPage}
        isLoading={isLoading}
      />
    </div>
  );
}
