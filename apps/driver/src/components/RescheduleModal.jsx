import { useState } from 'react';

const RESCHEDULE_REASONS = [
  'Customer requested different date',
  'Customer not ready',
  'Access issue — need arrangement',
  'Weather conditions',
  'Vehicle / equipment issue',
  'Other',
];

/**
 * Modal for rescheduling a delivery.
 *
 * Props:
 *   delivery   — delivery object
 *   onConfirm  — ({ reschedule_reason, preferred_date, preferred_time, customer_phone_confirmed, notes }) => void
 *   onBack     — go back to outcome selector
 */
export default function RescheduleModal({ delivery, onConfirm, onBack }) {
  const [reason, setReason] = useState('');
  const [otherReason, setOtherReason] = useState('');
  const [preferredDate, setPreferredDate] = useState('');
  const [preferredTime, setPreferredTime] = useState('');
  const [phoneConfirmed, setPhoneConfirmed] = useState(false);
  const [notes, setNotes] = useState('');

  const customerName = delivery?.customer_name || delivery?.contact_name || 'Customer';
  const customerPhone = delivery?.contact_phone || delivery?.customer_phone_main || '';
  const effectiveReason = reason === 'Other' ? otherReason.trim() : reason;
  const canSubmit = !!effectiveReason;

  // Tomorrow as min date
  const tomorrow = new Date();
  tomorrow.setDate(tomorrow.getDate() + 1);
  const minDate = tomorrow.toISOString().slice(0, 10);

  function handleConfirm() {
    onConfirm({
      reschedule_reason: effectiveReason,
      preferred_date: preferredDate || null,
      preferred_time: preferredTime || null,
      customer_phone_confirmed: phoneConfirmed,
      notes: notes.trim() || null,
    });
  }

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-white">
      {/* Header */}
      <div className="flex items-center justify-between border-b border-slate-200 px-4 py-3">
        <button onClick={onBack} className="text-sm font-medium text-blue-600">Back</button>
        <h2 className="text-sm font-bold text-slate-900">Reschedule Delivery</h2>
        <span className="w-10" />
      </div>

      <div className="flex-1 overflow-y-auto px-4 py-4 space-y-4">
        {/* Info */}
        <div className="rounded-xl border border-blue-200 bg-blue-50 p-3">
          <p className="text-xs font-semibold text-blue-700">
            Rescheduling for {customerName}
          </p>
          <p className="mt-0.5 text-[10px] text-blue-500">
            Dispatch will confirm the new date with the customer.
          </p>
        </div>

        {/* Reason */}
        <div>
          <label className="mb-1.5 block text-xs font-medium text-slate-700">Reason *</label>
          <div className="space-y-1.5">
            {RESCHEDULE_REASONS.map(r => (
              <button
                key={r}
                onClick={() => setReason(r)}
                className={`w-full rounded-lg border px-3 py-2.5 text-left text-sm transition-colors ${
                  reason === r
                    ? 'border-blue-400 bg-blue-50 text-blue-700 font-medium'
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
              className="mt-2 w-full rounded-lg border border-blue-200 px-3 py-2.5 text-sm text-slate-700 placeholder:text-slate-300"
              autoFocus
            />
          )}
        </div>

        {/* Preferred date/time */}
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="mb-1 block text-xs font-medium text-slate-500">Preferred Date</label>
            <input
              type="date"
              value={preferredDate}
              onChange={e => setPreferredDate(e.target.value)}
              min={minDate}
              className="w-full rounded-lg border border-slate-200 px-3 py-2.5 text-sm text-slate-700"
            />
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-slate-500">Preferred Time</label>
            <select
              value={preferredTime}
              onChange={e => setPreferredTime(e.target.value)}
              className="w-full rounded-lg border border-slate-200 px-3 py-2.5 text-sm text-slate-700"
            >
              <option value="">Any time</option>
              <option value="morning">Morning (8-12)</option>
              <option value="afternoon">Afternoon (12-5)</option>
              <option value="evening">Evening (5-8)</option>
            </select>
          </div>
        </div>

        {/* Phone confirmed */}
        {customerPhone && (
          <div className="rounded-xl border border-slate-200 p-3">
            <label className="flex items-center gap-3">
              <input
                type="checkbox"
                checked={phoneConfirmed}
                onChange={e => setPhoneConfirmed(e.target.checked)}
                className="h-4 w-4 rounded border-slate-300 text-blue-600"
              />
              <div>
                <span className="text-sm font-medium text-slate-700">Phone number confirmed</span>
                <p className="text-xs text-slate-400">{customerPhone}</p>
              </div>
            </label>
          </div>
        )}

        {/* Notes for dispatch */}
        <div>
          <label className="mb-1 block text-xs font-medium text-slate-500">Notes for Dispatch</label>
          <textarea
            value={notes}
            onChange={e => setNotes(e.target.value)}
            placeholder="Any info dispatch should know for rescheduling..."
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
            canSubmit ? 'bg-blue-600 text-white' : 'bg-slate-200 text-slate-400'
          }`}
        >
          {canSubmit ? 'Request Reschedule' : 'Select a reason to continue'}
        </button>
      </div>
    </div>
  );
}
