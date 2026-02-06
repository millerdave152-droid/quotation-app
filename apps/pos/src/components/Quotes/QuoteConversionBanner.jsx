/**
 * TeleTime POS - Quote Conversion Banner Component
 * Shows in cart when items came from a quote
 */

import {
  DocumentTextIcon,
  UserIcon,
  XMarkIcon,
} from '@heroicons/react/24/outline';

/**
 * Quote conversion banner
 * @param {object} props
 * @param {string|number} props.quoteId - Quote ID
 * @param {string} props.quoteNumber - Quote number for display
 * @param {string} props.salespersonName - Original salesperson name
 * @param {string} props.customerName - Customer name
 * @param {function} props.onClearQuote - Callback to clear quote from cart
 * @param {string} props.className - Additional CSS classes
 */
export function QuoteConversionBanner({
  quoteId,
  quoteNumber,
  salespersonName,
  customerName,
  onClearQuote,
  className = '',
}) {
  if (!quoteId) return null;

  return (
    <div
      className={`
        bg-gradient-to-r from-blue-500 to-blue-600
        text-white
        p-3
        ${className}
      `}
    >
      <div className="flex items-center gap-3">
        {/* Quote Icon */}
        <div className="w-10 h-10 bg-white/20 rounded-lg flex items-center justify-center flex-shrink-0">
          <DocumentTextIcon className="w-5 h-5" />
        </div>

        {/* Info */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <span className="font-bold">Converting Quote</span>
            <span className="px-2 py-0.5 bg-white/20 rounded text-sm font-mono">
              {quoteNumber || quoteId}
            </span>
          </div>
          <div className="flex items-center gap-4 text-sm text-blue-100 mt-0.5">
            {customerName && (
              <span className="flex items-center gap-1">
                <UserIcon className="w-3 h-3" />
                {customerName}
              </span>
            )}
            {salespersonName && (
              <span>
                Commission: <strong className="text-white">{salespersonName}</strong>
              </span>
            )}
          </div>
        </div>

        {/* Clear Button */}
        {onClearQuote && (
          <button
            type="button"
            onClick={onClearQuote}
            className="
              w-8 h-8
              flex items-center justify-center
              text-blue-200 hover:text-white
              hover:bg-white/20
              rounded-lg
              transition-colors duration-150
            "
            aria-label="Clear quote"
            title="Remove quote link (keeps items)"
          >
            <XMarkIcon className="w-5 h-5" />
          </button>
        )}
      </div>

      {/* Commission Note */}
      <div className="mt-2 pt-2 border-t border-white/20 text-xs text-blue-100">
        Items can still be added or removed. Sale commission will go to the quote creator.
      </div>
    </div>
  );
}

export default QuoteConversionBanner;
