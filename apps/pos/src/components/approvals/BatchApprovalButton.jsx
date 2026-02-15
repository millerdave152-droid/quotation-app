/**
 * TeleTime POS - Batch Approval Button
 *
 * Renders in the cart when multiple items have discounts requiring approval.
 * Clicking triggers the batch approval flow for all qualifying items.
 */

import { useMemo } from 'react';
import { ShieldCheckIcon } from '@heroicons/react/24/outline';

/**
 * Determine if an item's discount would require Tier 2+ approval.
 */
function needsApproval(item) {
  const retail = parseFloat(item.basePrice || item.unitPrice || 0);
  const current = parseFloat(item.overridePrice || item.unitPrice || retail);
  if (retail <= 0 || current >= retail) return false;
  const discountPct = ((retail - current) / retail) * 100;
  return discountPct > 10;
}

function hasAnyDiscount(item) {
  const retail = parseFloat(item.basePrice || item.unitPrice || 0);
  const current = parseFloat(item.overridePrice || item.unitPrice || retail);
  return retail > 0 && current < retail;
}

export default function BatchApprovalButton({ items, onRequestBatchApproval }) {
  const { needsApprovalItems, visible } = useMemo(() => {
    if (!items || items.length === 0) return { needsApprovalItems: [], visible: false };

    const qualifying = items.filter(needsApproval);
    const anyDiscounted = items.some(hasAnyDiscount);

    // Show if: 2+ items need Tier 2+ approval, OR 4+ items with any discounts
    const show = qualifying.length >= 2 || (items.length >= 4 && anyDiscounted);
    return { needsApprovalItems: qualifying, visible: show };
  }, [items]);

  if (!visible) return null;

  const handleClick = () => {
    // Filter items that actually have discounts to include in the batch
    const batchItems = items.filter(hasAnyDiscount);
    if (batchItems.length > 0) {
      onRequestBatchApproval(batchItems);
    }
  };

  return (
    <div className="px-4 py-2">
      <button
        type="button"
        onClick={handleClick}
        className="
          w-full flex items-center justify-center gap-2
          px-4 py-2.5
          text-sm font-semibold
          text-blue-700 bg-blue-50
          border-2 border-blue-300 hover:border-blue-400
          hover:bg-blue-100
          rounded-lg
          transition-all duration-150
        "
      >
        <ShieldCheckIcon className="w-5 h-5" />
        <span>Request Batch Approval ({needsApprovalItems.length} items)</span>
      </button>
    </div>
  );
}
