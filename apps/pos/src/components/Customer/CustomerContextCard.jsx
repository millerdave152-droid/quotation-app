/**
 * CustomerContextCard — Walk-in customer recognition.
 *
 * Shows a one-line context strip (compact) that expands to a detail card.
 * Fetches GET /api/customers/:id/context on mount.
 */

import { useState, useEffect, useCallback } from 'react';
import api from '../../api/axios';
import { formatCurrency } from '../../utils/formatters';
import { ChevronDown, Clock, FileText, ShoppingBag, Tag, Wrench, X } from 'lucide-react';

export default function CustomerContextCard({ customerId, compact = true }) {
  const [ctx, setCtx] = useState(null);
  const [loading, setLoading] = useState(true);
  const [expanded, setExpanded] = useState(!compact);

  const fetchContext = useCallback(async () => {
    if (!customerId) return;
    setLoading(true);
    try {
      const { data } = await api.get(`/customers/${customerId}/context`);
      setCtx(data.data || null);
    } catch {
      setCtx(null);
    } finally {
      setLoading(false);
    }
  }, [customerId]);

  useEffect(() => {
    fetchContext();
  }, [fetchContext]);

  if (!customerId) return null;

  // Loading skeleton
  if (loading) {
    return (
      <div className="mt-1.5 px-3 py-1.5 bg-blue-50/50 rounded-md">
        <div className="h-4 w-3/5 bg-blue-100 rounded animate-pulse" />
      </div>
    );
  }

  if (!ctx) return null;

  const hasPromos = ctx.applicablePromotions?.length > 0;
  const hasTickets = ctx.openServiceTickets > 0;
  const isFirstTime = ctx.contextSummary === 'First-time customer';

  // Compact one-line strip
  if (compact && !expanded) {
    return (
      <button
        type="button"
        onClick={() => setExpanded(true)}
        className="
          mt-1.5 w-full px-3 py-1.5
          bg-sky-50 border border-sky-100
          rounded-md
          flex items-center gap-2
          text-left
          hover:bg-sky-100
          transition-colors duration-150
        "
      >
        <span className="flex-1 text-xs text-sky-800 truncate">
          {ctx.contextSummary}
        </span>

        {/* Indicator dots */}
        <span className="flex items-center gap-1 flex-shrink-0">
          {hasPromos && (
            <span className="relative flex h-2.5 w-2.5" title={`${ctx.applicablePromotions.length} promo(s)`}>
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-amber-400 opacity-75" />
              <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-amber-500" />
            </span>
          )}
          {hasTickets && (
            <span className="h-2.5 w-2.5 rounded-full bg-red-500 flex-shrink-0"
              title={`${ctx.openServiceTickets} open ticket(s)`} />
          )}
          <ChevronDown className="w-3.5 h-3.5 text-sky-400" />
        </span>
      </button>
    );
  }

  // Full expanded card
  return (
    <div className="mt-1.5 bg-white border border-gray-200 rounded-lg shadow-sm overflow-hidden">
      {/* Header */}
      {compact && (
        <div className="flex items-center justify-between px-3 py-2 bg-sky-50 border-b border-sky-100">
          <span className="text-xs font-semibold text-sky-800">Customer Snapshot</span>
          <button
            type="button"
            onClick={(e) => { e.stopPropagation(); setExpanded(false); }}
            className="w-5 h-5 flex items-center justify-center text-sky-400 hover:text-sky-600 rounded"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      <div className="px-3 py-2.5 space-y-2">
        {/* Last Visit */}
        {ctx.lastPurchase.daysSince !== null ? (
          <div className="flex items-center gap-2 text-xs">
            <Clock className="w-3.5 h-3.5 text-gray-400 flex-shrink-0" />
            <span className="text-gray-700">
              <span className="font-medium">
                {ctx.lastPurchase.daysSince === 0 ? 'Today' :
                 ctx.lastPurchase.daysSince === 1 ? 'Yesterday' :
                 `${ctx.lastPurchase.daysSince} days ago`}
              </span>
              {' — '}
              <span className="font-semibold text-gray-900">
                {formatCurrency(ctx.lastPurchase.totalCents / 100)}
              </span>
              {' purchase'}
            </span>
          </div>
        ) : (
          <div className="flex items-center gap-2 text-xs">
            <ShoppingBag className="w-3.5 h-3.5 text-gray-400 flex-shrink-0" />
            <span className="text-gray-500 italic">Welcome — first visit</span>
          </div>
        )}

        {/* Lifetime */}
        {ctx.visitCount > 0 && (
          <div className="flex items-center gap-2 text-xs">
            <ShoppingBag className="w-3.5 h-3.5 text-gray-400 flex-shrink-0" />
            <span className="text-gray-700">
              {ctx.visitCount} visit{ctx.visitCount > 1 ? 's' : ''}
              {' · '}
              <span className="font-semibold">{formatCurrency(ctx.lifetimeValueCents / 100)}</span> lifetime
            </span>
          </div>
        )}

        {/* Open Quotes */}
        {ctx.openQuotesCount > 0 && (
          <div className="flex items-center gap-2 text-xs">
            <FileText className="w-3.5 h-3.5 text-blue-400 flex-shrink-0" />
            <span className="text-blue-700">
              {ctx.openQuotesCount} open quote{ctx.openQuotesCount > 1 ? 's' : ''}
              {' totaling '}
              <span className="font-semibold">{formatCurrency(ctx.openQuotesValueCents / 100)}</span>
            </span>
          </div>
        )}

        {/* Service Tickets */}
        {hasTickets && (
          <div className="flex items-center gap-2 text-xs">
            <Wrench className="w-3.5 h-3.5 text-red-400 flex-shrink-0" />
            <span className="text-red-700 font-medium">
              {ctx.openServiceTickets} open service ticket{ctx.openServiceTickets > 1 ? 's' : ''}
            </span>
          </div>
        )}

        {/* Promotions */}
        {hasPromos && (
          <div className="flex items-start gap-2 text-xs">
            <Tag className="w-3.5 h-3.5 text-amber-500 flex-shrink-0 mt-0.5" />
            <div className="space-y-0.5">
              {ctx.applicablePromotions.map(p => (
                <div key={p.id} className="text-amber-800">
                  <span className="font-medium">{p.name}</span>
                  {p.discountPercent && (
                    <span className="ml-1 text-amber-600">({p.discountPercent}% off)</span>
                  )}
                  {p.discountAmountCents && !p.discountPercent && (
                    <span className="ml-1 text-amber-600">({formatCurrency(p.discountAmountCents / 100)} off)</span>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
