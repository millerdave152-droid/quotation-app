import { useState } from 'react';

const UNDELIVERED_REASONS = [
  'Damaged in transit',
  'Missing from truck',
  'Wrong item loaded',
  'Customer refused this item',
  'Back-ordered',
  'Other',
];

/**
 * Modal for partial delivery — item-level delivered/undelivered selection.
 *
 * Props:
 *   items       — order items array [{ product_name, sku, quantity }]
 *   onConfirm   — ({ delivered_items, undelivered_items, notes }) => void
 *   onBack      — go back to outcome selector
 */
export default function PartialDeliveryModal({ items = [], onConfirm, onBack }) {
  const [itemStates, setItemStates] = useState(
    items.map(() => ({ delivered: true, reason: '', otherReason: '' }))
  );
  const [notes, setNotes] = useState('');

  function toggleItem(idx) {
    setItemStates(prev => prev.map((s, i) =>
      i === idx ? { ...s, delivered: !s.delivered, reason: '', otherReason: '' } : s
    ));
  }

  function setReason(idx, reason) {
    setItemStates(prev => prev.map((s, i) =>
      i === idx ? { ...s, reason } : s
    ));
  }

  function setOtherReason(idx, otherReason) {
    setItemStates(prev => prev.map((s, i) =>
      i === idx ? { ...s, otherReason } : s
    ));
  }

  const deliveredItems = items.filter((_, i) => itemStates[i].delivered)
    .map((item, i) => ({ ...item }));
  const undeliveredItems = items
    .map((item, i) => ({ ...item, ...itemStates[i] }))
    .filter((_, i) => !itemStates[i].delivered)
    .map(item => ({
      product_name: item.product_name,
      sku: item.sku,
      quantity: item.quantity,
      reason: item.reason === 'Other' ? item.otherReason : item.reason,
    }));

  const hasUndelivered = undeliveredItems.length > 0;
  const allReasoned = undeliveredItems.every(i => i.reason?.trim());
  const canSubmit = hasUndelivered && allReasoned;

  function handleConfirm() {
    onConfirm({ delivered_items: deliveredItems, undelivered_items: undeliveredItems, notes: notes.trim() || null });
  }

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-white">
      {/* Header */}
      <div className="flex items-center justify-between border-b border-slate-200 px-4 py-3">
        <button onClick={onBack} className="text-sm font-medium text-blue-600">Back</button>
        <h2 className="text-sm font-bold text-slate-900">Partial Delivery</h2>
        <span className="text-xs text-amber-600 font-medium">
          {undeliveredItems.length} undelivered
        </span>
      </div>

      <div className="flex-1 overflow-y-auto px-4 py-4 space-y-3">
        <p className="text-xs text-slate-500">
          Mark which items were delivered and provide a reason for undelivered items.
        </p>

        {items.map((item, i) => (
          <div key={i} className={`rounded-xl border p-3 ${
            itemStates[i].delivered ? 'border-green-200 bg-green-50/50' : 'border-red-200 bg-red-50/50'
          }`}>
            <div className="flex items-start gap-3">
              <button
                onClick={() => toggleItem(i)}
                className={`mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded border text-xs font-bold ${
                  itemStates[i].delivered
                    ? 'border-green-400 bg-green-500 text-white'
                    : 'border-red-300 bg-white text-red-400'
                }`}
              >
                {itemStates[i].delivered ? '✓' : '✕'}
              </button>
              <div className="flex-1">
                <p className="text-sm font-medium text-slate-800">{item.product_name}</p>
                <div className="flex gap-3 text-xs text-slate-500">
                  {item.sku && <span>SKU: {item.sku}</span>}
                  <span>Qty: {item.quantity}</span>
                </div>
              </div>
              <span className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${
                itemStates[i].delivered ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'
              }`}>
                {itemStates[i].delivered ? 'Delivered' : 'Not Delivered'}
              </span>
            </div>

            {/* Reason for undelivered */}
            {!itemStates[i].delivered && (
              <div className="mt-2 pl-8 space-y-2">
                <select
                  value={itemStates[i].reason}
                  onChange={e => setReason(i, e.target.value)}
                  className="w-full rounded-lg border border-red-200 bg-white px-3 py-2 text-xs text-slate-700"
                >
                  <option value="">Select reason...</option>
                  {UNDELIVERED_REASONS.map(r => (
                    <option key={r} value={r}>{r}</option>
                  ))}
                </select>
                {itemStates[i].reason === 'Other' && (
                  <input
                    type="text"
                    value={itemStates[i].otherReason}
                    onChange={e => setOtherReason(i, e.target.value)}
                    placeholder="Specify reason..."
                    className="w-full rounded-lg border border-red-200 px-3 py-2 text-xs text-slate-700 placeholder:text-slate-300"
                  />
                )}
              </div>
            )}
          </div>
        ))}

        {/* Notes */}
        <div>
          <label className="mb-1 block text-xs font-medium text-slate-500">Additional Notes</label>
          <textarea
            value={notes}
            onChange={e => setNotes(e.target.value)}
            placeholder="Any details about the partial delivery..."
            rows={2}
            className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm text-slate-800 placeholder:text-slate-300"
          />
        </div>
      </div>

      {/* Bottom action */}
      <div className="border-t border-slate-200 px-4 pb-8 pt-3">
        <button
          onClick={handleConfirm}
          disabled={!canSubmit}
          className={`w-full rounded-xl py-3.5 text-sm font-bold shadow-lg ${
            canSubmit ? 'bg-amber-600 text-white' : 'bg-slate-200 text-slate-400'
          }`}
        >
          {canSubmit ? 'Continue with Partial Delivery' : 'Mark undelivered items & provide reasons'}
        </button>
      </div>
    </div>
  );
}
