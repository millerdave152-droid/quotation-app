/**
 * TeleTime POS - Customer Quotes Panel Component
 * Shows pending quotes for selected customer
 */

import {
  ArrowLeftIcon,
  DocumentTextIcon,
  ShoppingCartIcon,
  ArrowRightIcon,
  CalendarIcon,
  UserIcon,
} from '@heroicons/react/24/outline';
import { formatCurrency, formatDate } from '../../utils/formatters';

/**
 * Quote card component
 */
function QuoteCard({ quote, onLoad }) {
  const quoteNumber = quote.quoteNumber || quote.quote_number || quote.quotation_number;
  const total = quote.totalAmount || quote.total_amount || (quote.total_cents / 100) || 0;
  const itemCount = quote.itemCount || quote.item_count || quote.items?.length || 0;
  const createdAt = quote.createdAt || quote.created_at;
  const salesperson = quote.salespersonName || quote.salesperson_name || quote.userName || quote.user_name;
  const status = quote.status || 'pending';

  const statusConfig = {
    pending: { bg: 'bg-yellow-100', text: 'text-yellow-700', label: 'Pending' },
    sent: { bg: 'bg-blue-100', text: 'text-blue-700', label: 'Sent' },
    accepted: { bg: 'bg-green-100', text: 'text-green-700', label: 'Accepted' },
  };

  const config = statusConfig[status] || statusConfig.pending;

  return (
    <div className="p-4 bg-white border border-gray-200 rounded-xl hover:border-blue-300 hover:shadow-md transition-all duration-150">
      <div className="flex items-start justify-between mb-3">
        <div>
          <div className="flex items-center gap-2">
            <span className="font-bold text-gray-900">{quoteNumber}</span>
            <span className={`px-2 py-0.5 text-xs font-medium rounded-full ${config.bg} ${config.text}`}>
              {config.label}
            </span>
          </div>
          <div className="flex items-center gap-3 mt-1 text-xs text-gray-500">
            <span className="flex items-center gap-1">
              <CalendarIcon className="w-3 h-3" />
              {formatDate(createdAt)}
            </span>
            {salesperson && (
              <span className="flex items-center gap-1">
                <UserIcon className="w-3 h-3" />
                {salesperson}
              </span>
            )}
          </div>
        </div>
        <div className="text-right">
          <p className="text-lg font-bold text-gray-900 tabular-nums">
            {formatCurrency(total)}
          </p>
          <p className="text-xs text-gray-500">
            {itemCount} {itemCount === 1 ? 'item' : 'items'}
          </p>
        </div>
      </div>

      <button
        type="button"
        onClick={() => onLoad(quote)}
        className="
          w-full h-11
          flex items-center justify-center gap-2
          bg-blue-600 hover:bg-blue-700
          text-white font-medium
          rounded-lg
          transition-colors duration-150
        "
      >
        <ShoppingCartIcon className="w-5 h-5" />
        Load Quote
      </button>
    </div>
  );
}

/**
 * Customer quotes panel
 * @param {object} props
 * @param {object} props.customer - Selected customer
 * @param {Array} props.quotes - Pending quotes
 * @param {function} props.onLoadQuote - Callback to load quote
 * @param {function} props.onContinueWithoutQuote - Callback to continue without quote
 * @param {function} props.onBack - Callback to go back
 */
export function CustomerQuotesPanel({
  customer,
  quotes = [],
  onLoadQuote,
  onContinueWithoutQuote,
  onBack,
}) {
  const customerName = customer?.name ||
    `${customer?.firstName || ''} ${customer?.lastName || ''}`.trim() ||
    'Customer';

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="flex items-center gap-3 p-4 border-b border-gray-200">
        <button
          type="button"
          onClick={onBack}
          className="
            w-10 h-10
            flex items-center justify-center
            text-gray-500 hover:text-gray-700
            hover:bg-gray-100
            rounded-lg
            transition-colors duration-150
          "
        >
          <ArrowLeftIcon className="w-5 h-5" />
        </button>
        <div>
          <h2 className="text-lg font-bold text-gray-900">Pending Quotes</h2>
          <p className="text-sm text-gray-500">for {customerName}</p>
        </div>
      </div>

      {/* Quote Count Banner */}
      <div className="p-4 bg-blue-50 border-b border-blue-100">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 bg-blue-500 rounded-full flex items-center justify-center">
            <DocumentTextIcon className="w-5 h-5 text-white" />
          </div>
          <div>
            <p className="font-semibold text-blue-900">
              {customerName} has {quotes.length} pending {quotes.length === 1 ? 'quote' : 'quotes'}
            </p>
            <p className="text-sm text-blue-700">
              Select a quote to load it into the cart
            </p>
          </div>
        </div>
      </div>

      {/* Quotes List */}
      <div className="flex-1 overflow-y-auto p-4 space-y-3">
        {quotes.map((quote, index) => (
          <QuoteCard
            key={quote.id || quote.quoteId || quote.quote_id || index}
            quote={quote}
            onLoad={onLoadQuote}
          />
        ))}
      </div>

      {/* Continue Without Quote */}
      <div className="p-4 bg-gray-50 border-t border-gray-200">
        <button
          type="button"
          onClick={onContinueWithoutQuote}
          className="
            w-full h-12
            flex items-center justify-center gap-2
            bg-gray-200 hover:bg-gray-300
            text-gray-700 font-medium
            rounded-xl
            transition-colors duration-150
          "
        >
          Continue without Quote
          <ArrowRightIcon className="w-5 h-5" />
        </button>
        <p className="mt-2 text-center text-xs text-gray-500">
          Customer will be attached to cart without loading a quote
        </p>
      </div>
    </div>
  );
}

export default CustomerQuotesPanel;
