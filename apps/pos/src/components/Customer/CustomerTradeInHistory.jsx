/**
 * TeleTime POS - Customer Trade-In History Panel
 * Shows a customer's past trade-in assessments
 */

import { useState, useEffect, useCallback } from 'react';
import {
  ArrowsRightLeftIcon,
  ArrowPathIcon,
} from '@heroicons/react/24/outline';
import { getCustomerTradeIns } from '../../api/customers';
import { formatCurrency } from '../../utils/formatters';

const STATUS_COLORS = {
  pending: 'bg-yellow-100 text-yellow-700',
  approved: 'bg-blue-100 text-blue-700',
  applied: 'bg-green-100 text-green-700',
  rejected: 'bg-red-100 text-red-700',
  voided: 'bg-gray-100 text-gray-500',
};

const CONDITION_COLORS = {
  excellent: 'text-green-600',
  good: 'text-blue-600',
  fair: 'text-yellow-600',
  poor: 'text-red-600',
};

function StatusBadge({ status }) {
  const colorClass = STATUS_COLORS[status] || 'bg-gray-100 text-gray-700';
  return (
    <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${colorClass}`}>
      {status?.charAt(0).toUpperCase() + status?.slice(1)}
    </span>
  );
}

function TradeInRow({ tradeIn }) {
  const brand = tradeIn.brand || tradeIn.device_brand || '';
  const model = tradeIn.model || tradeIn.device_model || '';
  const condition = tradeIn.condition || tradeIn.device_condition || '';
  const value = parseFloat(tradeIn.final_value || tradeIn.finalValue || tradeIn.assessed_value || 0);
  const status = tradeIn.status || 'pending';
  const date = tradeIn.created_at || tradeIn.createdAt || tradeIn.date;

  return (
    <div className="p-3 border-b border-gray-100 last:border-0 hover:bg-gray-50 transition-colors">
      <div className="flex items-start justify-between gap-2">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <span className="font-medium text-gray-900 text-sm truncate">
              {brand} {model}
            </span>
            <StatusBadge status={status} />
          </div>
          <div className="flex items-center gap-3 mt-1 text-xs text-gray-500">
            {condition && (
              <span className={`font-medium ${CONDITION_COLORS[condition.toLowerCase()] || 'text-gray-500'}`}>
                {condition.charAt(0).toUpperCase() + condition.slice(1)}
              </span>
            )}
            <span>{date ? new Date(date).toLocaleDateString('en-CA') : 'N/A'}</span>
          </div>
        </div>
        <span className="font-semibold text-gray-900 text-sm whitespace-nowrap">
          {formatCurrency(value)}
        </span>
      </div>
    </div>
  );
}

/**
 * Customer Trade-In History Panel
 * @param {object} props
 * @param {object} props.customer - Selected customer
 */
export function CustomerTradeInHistory({ customer }) {
  const [tradeIns, setTradeIns] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const customerId = customer?.id || customer?.customerId || customer?.customer_id;

  const loadTradeIns = useCallback(async () => {
    if (!customerId) return;

    setLoading(true);
    setError(null);

    try {
      const result = await getCustomerTradeIns(customerId);

      if (result.success) {
        setTradeIns(result.data || []);
      } else {
        setError(result.error || 'Failed to load trade-ins');
      }
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [customerId]);

  useEffect(() => {
    loadTradeIns();
  }, [loadTradeIns]);

  if (!customerId) return null;

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-2 bg-gray-50 border-b border-gray-200">
        <div className="flex items-center gap-2">
          <ArrowsRightLeftIcon className="w-4 h-4 text-gray-500" />
          <span className="text-xs font-medium text-gray-600">
            {tradeIns.length} trade-in{tradeIns.length !== 1 ? 's' : ''}
          </span>
        </div>
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
              onClick={loadTradeIns}
              className="text-sm text-blue-600 hover:text-blue-700 flex items-center gap-1 mx-auto"
            >
              <ArrowPathIcon className="w-4 h-4" />
              Retry
            </button>
          </div>
        ) : tradeIns.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-12 text-center px-4">
            <ArrowsRightLeftIcon className="w-10 h-10 text-gray-300 mb-3" />
            <p className="text-sm text-gray-500">No trade-in history</p>
          </div>
        ) : (
          tradeIns.map((ti, idx) => (
            <TradeInRow key={ti.id || idx} tradeIn={ti} />
          ))
        )}
      </div>
    </div>
  );
}

export default CustomerTradeInHistory;
