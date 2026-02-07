import { useState } from 'react';

const REFUSAL_REASONS = [
  'Changed mind',
  'Not what was ordered',
  'Items damaged',
  'Too late / missed window',
  'Price dispute',
  'Someone else ordered',
  'Other',
];

/**
 * Modal for refused delivery — capture reason, comments, optional photo.
 *
 * Props:
 *   delivery   — delivery object
 *   onConfirm  — ({ refusal_reason, customer_comments, notes }) => void
 *   onBack     — go back to outcome selector
 */
export default function RefusedDeliveryModal({ delivery, onConfirm, onBack }) {
  const [reason, setReason] = useState('');
  const [otherReason, setOtherReason] = useState('');
  const [customerComments, setCustomerComments] = useState('');
  const [notes, setNotes] = useState('');

  const customerName = delivery?.customer_name || delivery?.contact_name || 'Customer';
  const effectiveReason = reason === 'Other' ? otherReason.trim() : reason;
  const canSubmit = !!effectiveReason;

  function handleConfirm() {
    onConfirm({
      refusal_reason: effectiveReason,
      customer_comments: customerComments.trim() || null,
      notes: notes.trim() || null,
    });
  }

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-white">
      {/* Header */}
      <div className="flex items-center justify-between border-b border-slate-200 px-4 py-3">
        <button onClick={onBack} className="text-sm font-medium text-blue-600">Back</button>
        <h2 className="text-sm font-bold text-slate-900">Refused Delivery</h2>
        <span className="w-10" />
      </div>

      <div className="flex-1 overflow-y-auto px-4 py-4 space-y-4">
        {/* Warning */}
        <div className="rounded-xl border border-red-200 bg-red-50 p-3">
          <p className="text-xs font-semibold text-red-700">
            {customerName} is refusing this delivery
          </p>
          <p className="mt-0.5 text-[10px] text-red-500">
            All items will be returned to warehouse. This cannot be undone.
          </p>
        </div>

        {/* Reason */}
        <div>
          <label className="mb-1.5 block text-xs font-medium text-slate-700">Reason for Refusal *</label>
          <div className="space-y-1.5">
            {REFUSAL_REASONS.map(r => (
              <button
                key={r}
                onClick={() => setReason(r)}
                className={`w-full rounded-lg border px-3 py-2.5 text-left text-sm transition-colors ${
                  reason === r
                    ? 'border-red-400 bg-red-50 text-red-700 font-medium'
                    : 'border-slate-200 text-slate-700'
                }`}
              >
                {r}
              </button>
            ))}
          </div>
          {reason === 'Other' && (
            <input
              type="text"
              value={otherReason}
              onChange={e => setOtherReason(e.target.value)}
              placeholder="Specify reason..."
              className="mt-2 w-full rounded-lg border border-red-200 px-3 py-2.5 text-sm text-slate-700 placeholder:text-slate-300"
              autoFocus
            />
          )}
        </div>

        {/* Customer comments */}
        <div>
          <label className="mb-1 block text-xs font-medium text-slate-500">Customer Comments (optional)</label>
          <textarea
            value={customerComments}
            onChange={e => setCustomerComments(e.target.value)}
            placeholder="Anything the customer said about the refusal..."
            rows={2}
            className="w-full rounded-lg border border-slate-200 px-3 py-2.5 text-sm text-slate-800 placeholder:text-slate-300"
          />
        </div>

        {/* Driver notes */}
        <div>
          <label className="mb-1 block text-xs font-medium text-slate-500">Driver Notes (optional)</label>
          <textarea
            value={notes}
            onChange={e => setNotes(e.target.value)}
            placeholder="Your observations about the situation..."
            rows={2}
            className="w-full rounded-lg border border-slate-200 px-3 py-2.5 text-sm text-slate-800 placeholder:text-slate-300"
          />
        </div>
      </div>

      {/* Bottom action */}
      <div className="border-t border-slate-200 px-4 pb-8 pt-3">
        <button
          onClick={handleConfirm}
          disabled={!canSubmit}
          className={`w-full rounded-xl py-3.5 text-sm font-bold shadow-lg ${
            canSubmit ? 'bg-red-600 text-white' : 'bg-slate-200 text-slate-400'
          }`}
        >
          {canSubmit ? 'Confirm Refusal' : 'Select a reason to continue'}
        </button>
      </div>
    </div>
  );
}
