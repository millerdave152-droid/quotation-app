/**
 * TeleTime POS - Customer Purchase History Panel
 * Shows a customer's past transactions with expandable line items
 */

import { useState, useEffect, useCallback } from 'react';
import {
  ChevronDownIcon,
  ChevronRightIcon,
  ClockIcon,
  ShoppingBagIcon,
  ArrowPathIcon,
} from '@heroicons/react/24/outline';
import { getCustomerTransactions } from '../../api/customers';
import { formatCurrency } from '../../utils/formatters';

const STATUS_COLORS = {
  completed: 'bg-green-100 text-green-700',
  pending: 'bg-yellow-100 text-yellow-700',
  voided: 'bg-red-100 text-red-700',
  refunded: 'bg-orange-100 text-orange-700',
};

function StatusBadge({ status }) {
  const colorClass = STATUS_COLORS[status] || 'bg-gray-100 text-gray-700';
  return (
    <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${colorClass}`}>
      {status?.charAt(0).toUpperCase() + status?.slice(1)}
    </span>
  );
}

function TransactionRow({ transaction }) {
  const [expanded, setExpanded] = useState(false);

  const number = transaction.transaction_number || transaction.transactionNumber || transaction.number;
  const date = transaction.created_at || transaction.createdAt || transaction.date;
  const total = parseFloat(transaction.total_amount || transaction.totalAmount || transaction.total || 0);
  const status = transaction.status || 'completed';
  const items = transaction.items || transaction.lineItems || [];
  const itemCount = transaction.item_count || transaction.itemCount || items.length || 0;

  return (
    <div className="border-b border-gray-100 last:border-0">
      <button
        type="button"
        onClick={() => setExpanded(!expanded)}
        className="w-full p-3 flex items-center gap-3 text-left hover:bg-gray-50 transition-colors"
      >
        {expanded ? (
          <ChevronDownIcon className="w-4 h-4 text-gray-400 flex-shrink-0" />
        ) : (
          <ChevronRightIcon className="w-4 h-4 text-gray-400 flex-shrink-0" />
        )}

        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <span className="font-medium text-gray-900 text-sm">{number}</span>
            <StatusBadge status={status} />
          </div>
          <div className="flex items-center gap-3 mt-0.5 text-xs text-gray-500">
            <span>{date ? new Date(date).toLocaleDateString('en-CA') : 'N/A'}</span>
            <span>{itemCount} item{itemCount !== 1 ? 's' : ''}</span>
          </div>
        </div>

        <span className="font-semibold text-gray-900 text-sm">
          {formatCurrency(total)}
        </span>
      </button>

      {expanded && items.length > 0 && (
        <div className="px-4 pb-3 pl-10">
          <div className="bg-gray-50 rounded-lg p-2 space-y-1">
            {items.map((item, idx) => (
              <div key={idx} className="flex justify-between text-xs text-gray-600">
                <span className="truncate flex-1">
                  {item.product_name || item.productName || item.name}
                  {(item.quantity || 1) > 1 && ` x${item.quantity}`}
                </span>
                <span className="ml-2 font-medium">
                  {formatCurrency(item.line_total || item.lineTotal || item.total || (item.unit_price || item.unitPrice || 0) * (item.quantity || 1))}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

/**
 * Customer Purchase History Panel
 * @param {object} props
 * @param {object} props.customer - Selected customer
 */
export function CustomerPurchaseHistory({ customer }) {
  const [transactions, setTransactions] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [dateRange, setDateRange] = useState('30'); // days

  const customerId = customer?.id || customer?.customerId || customer?.customer_id;

  const loadHistory = useCallback(async () => {
    if (!customerId) return;

    setLoading(true);
    setError(null);

    try {
      const startDate = new Date();
      startDate.setDate(startDate.getDate() - parseInt(dateRange));

      const result = await getCustomerTransactions(customerId, {
        limit: 20,
        startDate: startDate.toISOString(),
      });

      if (result.success) {
        setTransactions(result.data || []);
      } else {
        setError(result.error || 'Failed to load history');
      }
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [customerId, dateRange]);

  useEffect(() => {
    loadHistory();
  }, [loadHistory]);

  if (!customerId) return null;

  return (
    <div className="flex flex-col h-full">
      {/* Header with date filter */}
      <div className="flex items-center justify-between px-4 py-2 bg-gray-50 border-b border-gray-200">
        <div className="flex items-center gap-2">
          <ClockIcon className="w-4 h-4 text-gray-500" />
          <span className="text-xs font-medium text-gray-600">
            {transactions.length} transaction{transactions.length !== 1 ? 's' : ''}
          </span>
        </div>
        <select
          value={dateRange}
          onChange={(e) => setDateRange(e.target.value)}
          className="text-xs border border-gray-300 rounded-md px-2 py-1 bg-white focus:border-blue-500 focus:ring-1 focus:ring-blue-200"
        >
          <option value="7">Last 7 days</option>
          <option value="30">Last 30 days</option>
          <option value="90">Last 90 days</option>
          <option value="365">Last year</option>
        </select>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto">
        {loading ? (
          <div className="flex items-center justify-center py-12">
            <div className="w-8 h-8 border-3 border-blue-600 border-t-transparent rounded-full animate-spin" />
          </div>
        ) : error ? (
          <div className="text-center py-8 px-4">
            <p className="text-sm text-red-600 mb-2">{error}</p>
            <button
              onClick={loadHistory}
              className="text-sm text-blue-600 hover:text-blue-700 flex items-center gap-1 mx-auto"
            >
              <ArrowPathIcon className="w-4 h-4" />
              Retry
            </button>
          </div>
        ) : transactions.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-12 text-center px-4">
            <ShoppingBagIcon className="w-10 h-10 text-gray-300 mb-3" />
            <p className="text-sm text-gray-500">No purchase history found</p>
            <p className="text-xs text-gray-400 mt-1">for the selected period</p>
          </div>
        ) : (
          transactions.map((txn, idx) => (
            <TransactionRow key={txn.id || txn.transaction_id || idx} transaction={txn} />
          ))
        )}
      </div>
    </div>
  );
}

export default CustomerPurchaseHistory;
