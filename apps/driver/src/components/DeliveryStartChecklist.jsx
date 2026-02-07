import { useState } from 'react';

const CHECKLIST_ITEMS = [
  { key: 'address', label: 'Verified correct address', icon: '📍' },
  { key: 'items', label: 'All items accounted for', icon: '📦' },
  { key: 'path', label: 'Path to door is clear', icon: '🚶' },
  { key: 'customer', label: 'Customer is present OR safe drop location identified', icon: '👤' },
];

/**
 * Pre-delivery checklist. All items must be checked before "Begin Delivery".
 *
 * Props:
 *   delivery   — the delivery object (for context display)
 *   onStart    — async (payload) => void   called with { checklist_verified: true, start_time }
 *   onBack     — () => void
 */
export default function DeliveryStartChecklist({ delivery, onStart, onBack }) {
  const [checked, setChecked] = useState({});
  const [submitting, setSubmitting] = useState(false);

  const allChecked = CHECKLIST_ITEMS.every(item => checked[item.key]);
  const checkedCount = CHECKLIST_ITEMS.filter(item => checked[item.key]).length;

  function toggle(key) {
    setChecked(prev => ({ ...prev, [key]: !prev[key] }));
  }

  async function handleStart() {
    if (!allChecked) return;
    setSubmitting(true);
    try {
      await onStart({
        checklist_verified: true,
        start_time: new Date().toISOString(),
      });
    } catch {
      setSubmitting(false);
    }
  }

  const hasWarnings = delivery?.access_narrow_stairs || delivery?.elevator_booking_required
    || (delivery?.has_elevator === false && (delivery?.floor_level > 1 || delivery?.floor_number > 1));

  return (
    <div className="fixed inset-0 z-50 flex items-end bg-black/40">
      <div className="w-full rounded-t-2xl bg-white p-5 pb-8 shadow-2xl">
        {/* Header */}
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-lg font-bold text-slate-900">Pre-Delivery Checklist</h2>
          <button onClick={onBack} className="text-sm font-medium text-slate-400">Back</button>
        </div>

        {/* Progress */}
        <div className="mb-4">
          <div className="mb-1 flex justify-between text-xs text-slate-400">
            <span>{checkedCount} of {CHECKLIST_ITEMS.length}</span>
            {allChecked && <span className="font-medium text-green-600">All verified</span>}
          </div>
          <div className="flex gap-1">
            {CHECKLIST_ITEMS.map(item => (
              <div
                key={item.key}
                className={`h-1.5 flex-1 rounded-full transition-colors ${
                  checked[item.key] ? 'bg-green-500' : 'bg-slate-200'
                }`}
              />
            ))}
          </div>
        </div>

        {/* Access warnings */}
        {hasWarnings && (
          <div className="mb-4 rounded-lg bg-amber-50 border border-amber-200 px-3 py-2">
            <p className="text-xs font-medium text-amber-700">
              {delivery.access_narrow_stairs && 'Narrow stairs — '}
              {delivery.elevator_booking_required && 'Elevator booking required — '}
              {delivery.has_elevator === false && (delivery.floor_level > 1 || delivery.floor_number > 1) && 'No elevator — '}
              Verify access before starting
            </p>
          </div>
        )}

        {/* Checklist */}
        <div className="mb-5 space-y-2">
          {CHECKLIST_ITEMS.map(item => (
            <button
              key={item.key}
              onClick={() => toggle(item.key)}
              className={`flex w-full items-center gap-3 rounded-xl border p-3.5 text-left transition-colors ${
                checked[item.key]
                  ? 'border-green-200 bg-green-50'
                  : 'border-slate-200 bg-white'
              }`}
            >
              <span className={`flex h-7 w-7 items-center justify-center rounded-lg text-sm ${
                checked[item.key] ? 'bg-green-500 text-white' : 'bg-slate-100 text-slate-400'
              }`}>
                {checked[item.key] ? '✓' : item.icon}
              </span>
              <span className={`flex-1 text-sm font-medium ${
                checked[item.key] ? 'text-green-700' : 'text-slate-700'
              }`}>
                {item.label}
              </span>
            </button>
          ))}
        </div>

        {/* Begin Delivery button */}
        <button
          onClick={handleStart}
          disabled={!allChecked || submitting}
          className={`w-full rounded-xl px-4 py-3.5 text-sm font-bold shadow-lg transition-colors ${
            allChecked
              ? 'bg-green-600 text-white'
              : 'bg-slate-200 text-slate-400'
          } disabled:opacity-50`}
        >
          {submitting ? 'Starting...' : allChecked ? 'Begin Delivery' : `Complete checklist (${checkedCount}/${CHECKLIST_ITEMS.length})`}
        </button>
      </div>
    </div>
  );
}
