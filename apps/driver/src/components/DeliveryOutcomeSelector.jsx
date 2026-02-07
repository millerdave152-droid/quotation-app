import { useState } from 'react';

const OUTCOMES = [
  { value: 'delivered',    label: 'Delivered',     icon: '✅', desc: 'All items delivered successfully', cls: 'border-green-300 bg-green-50 text-green-700' },
  { value: 'partial',      label: 'Partial',       icon: '📦', desc: 'Some items could not be delivered', cls: 'border-amber-300 bg-amber-50 text-amber-700' },
  { value: 'refused',      label: 'Refused',       icon: '🚫', desc: 'Customer refused the delivery', cls: 'border-red-300 bg-red-50 text-red-700' },
  { value: 'no_access',    label: 'No Access',     icon: '🔒', desc: 'Cannot access delivery location', cls: 'border-orange-300 bg-orange-50 text-orange-700' },
  { value: 'no_one_home',  label: 'No One Home',   icon: '🏠', desc: 'No one available to receive', cls: 'border-slate-300 bg-slate-50 text-slate-700' },
  { value: 'wrong_address',label: 'Wrong Address',  icon: '📍', desc: 'Address is incorrect or not found', cls: 'border-purple-300 bg-purple-50 text-purple-700' },
  { value: 'damaged',      label: 'Damaged',       icon: '💔', desc: 'Items found damaged before delivery', cls: 'border-rose-300 bg-rose-50 text-rose-700' },
  { value: 'reschedule',   label: 'Reschedule',    icon: '📅', desc: 'Customer requests a different date', cls: 'border-blue-300 bg-blue-50 text-blue-700' },
];

/**
 * Outcome selector grid — replaces the simple "Report Problem" button.
 *
 * Props:
 *   onSelect(outcomeValue) — called when user taps an outcome
 *   onCancel               — close the selector
 *   currentStatus          — current delivery status (to filter available outcomes)
 */
export default function DeliveryOutcomeSelector({ onSelect, onCancel, currentStatus }) {
  // "delivered" only available during in_progress
  const available = OUTCOMES.filter(o => {
    if (o.value === 'delivered' && currentStatus !== 'in_progress') return false;
    return true;
  });

  return (
    <div className="fixed inset-0 z-50 flex items-end bg-black/40" onClick={onCancel}>
      <div
        className="w-full max-h-[85vh] rounded-t-2xl bg-white pb-8 overflow-y-auto"
        onClick={e => e.stopPropagation()}
      >
        {/* Handle */}
        <div className="flex justify-center pt-3 pb-1">
          <div className="h-1 w-10 rounded-full bg-slate-300" />
        </div>

        <div className="px-4 pb-2">
          <h2 className="text-lg font-bold text-slate-900">Delivery Outcome</h2>
          <p className="text-xs text-slate-500">Select what happened with this delivery</p>
        </div>

        <div className="grid grid-cols-2 gap-2 px-4">
          {available.map(o => (
            <button
              key={o.value}
              onClick={() => onSelect(o.value)}
              className={`flex flex-col items-start rounded-xl border p-3 text-left transition-colors ${o.cls}`}
            >
              <span className="text-xl">{o.icon}</span>
              <span className="mt-1 text-sm font-semibold">{o.label}</span>
              <span className="mt-0.5 text-[10px] opacity-75">{o.desc}</span>
            </button>
          ))}
        </div>

        <div className="px-4 pt-4">
          <button
            onClick={onCancel}
            className="w-full rounded-xl border border-slate-200 py-3 text-sm font-medium text-slate-600"
          >
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
}
