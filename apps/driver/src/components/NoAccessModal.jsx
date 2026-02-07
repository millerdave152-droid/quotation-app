import { useState } from 'react';

const ACCESS_REASONS = [
  'Gate locked',
  'Building security denied entry',
  'Road blocked / inaccessible',
  'Elevator out of service',
  'Buzzer / intercom not working',
  'Unsafe conditions',
  'Other',
];

const RECOMMENDED_ACTIONS = [
  { value: 'reschedule', label: 'Reschedule delivery' },
  { value: 'contact_customer', label: 'Office to contact customer' },
  { value: 'leave_at_door', label: 'Attempt to leave at door/lobby' },
  { value: 'return_warehouse', label: 'Return to warehouse' },
];

/**
 * Modal for no-access delivery — reason, contact attempted, recommended action.
 *
 * Props:
 *   delivery   — delivery object
 *   onConfirm  — ({ no_access_reason, contact_attempted, recommended_action, notes }) => void
 *   onBack     — go back to outcome selector
 */
export default function NoAccessModal({ delivery, onConfirm, onBack }) {
  const [reason, setReason] = useState('');
  const [otherReason, setOtherReason] = useState('');
  const [contactAttempted, setContactAttempted] = useState(false);
  const [contactMethod, setContactMethod] = useState('');
  const [recommendedAction, setRecommendedAction] = useState('reschedule');
  const [notes, setNotes] = useState('');

  const effectiveReason = reason === 'Other' ? otherReason.trim() : reason;
  const canSubmit = !!effectiveReason;

  function handleConfirm() {
    onConfirm({
      no_access_reason: effectiveReason,
      contact_attempted: contactAttempted,
      contact_method: contactAttempted ? contactMethod || null : null,
      recommended_action: recommendedAction,
      notes: notes.trim() || null,
    });
  }

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-white">
      {/* Header */}
      <div className="flex items-center justify-between border-b border-slate-200 px-4 py-3">
        <button onClick={onBack} className="text-sm font-medium text-blue-600">Back</button>
        <h2 className="text-sm font-bold text-slate-900">No Access</h2>
        <span className="w-10" />
      </div>

      <div className="flex-1 overflow-y-auto px-4 py-4 space-y-4">
        {/* Warning */}
        <div className="rounded-xl border border-orange-200 bg-orange-50 p-3">
          <p className="text-xs font-semibold text-orange-700">
            Cannot access delivery location
          </p>
          <p className="mt-0.5 text-[10px] text-orange-500">
            Document the reason and recommended next steps.
          </p>
        </div>

        {/* Reason */}
        <div>
          <label className="mb-1.5 block text-xs font-medium text-slate-700">Access Issue *</label>
          <div className="space-y-1.5">
            {ACCESS_REASONS.map(r => (
              <button
                key={r}
                onClick={() => setReason(r)}
                className={`w-full rounded-lg border px-3 py-2.5 text-left text-sm transition-colors ${
                  reason === r
                    ? 'border-orange-400 bg-orange-50 text-orange-700 font-medium'
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
              placeholder="Describe the access issue..."
              className="mt-2 w-full rounded-lg border border-orange-200 px-3 py-2.5 text-sm text-slate-700 placeholder:text-slate-300"
              autoFocus
            />
          )}
        </div>

        {/* Contact attempted */}
        <div className="rounded-xl border border-slate-200 p-3 space-y-2">
          <label className="flex items-center gap-3">
            <input
              type="checkbox"
              checked={contactAttempted}
              onChange={e => setContactAttempted(e.target.checked)}
              className="h-4 w-4 rounded border-slate-300 text-blue-600"
            />
            <span className="text-sm font-medium text-slate-700">I attempted to contact the customer</span>
          </label>
          {contactAttempted && (
            <div className="flex gap-2 pl-7">
              {['Called', 'Texted', 'Buzzed', 'Knocked'].map(m => (
                <button
                  key={m}
                  onClick={() => setContactMethod(m)}
                  className={`rounded-full border px-2.5 py-1 text-xs font-medium ${
                    contactMethod === m
                      ? 'border-blue-400 bg-blue-50 text-blue-700'
                      : 'border-slate-200 text-slate-500'
                  }`}
                >
                  {m}
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Recommended action */}
        <div>
          <label className="mb-1.5 block text-xs font-medium text-slate-700">Recommended Action</label>
          <div className="space-y-1.5">
            {RECOMMENDED_ACTIONS.map(a => (
              <button
                key={a.value}
                onClick={() => setRecommendedAction(a.value)}
                className={`w-full rounded-lg border px-3 py-2.5 text-left text-sm transition-colors ${
                  recommendedAction === a.value
                    ? 'border-blue-400 bg-blue-50 text-blue-700 font-medium'
                    : 'border-slate-200 text-slate-700'
                }`}
              >
                {a.label}
              </button>
            ))}
          </div>
        </div>

        {/* Notes */}
        <div>
          <label className="mb-1 block text-xs font-medium text-slate-500">Driver Notes (optional)</label>
          <textarea
            value={notes}
            onChange={e => setNotes(e.target.value)}
            placeholder="Describe what you saw, who you spoke to..."
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
            canSubmit ? 'bg-orange-600 text-white' : 'bg-slate-200 text-slate-400'
          }`}
        >
          {canSubmit ? 'Submit No Access Report' : 'Select an access issue to continue'}
        </button>
      </div>
    </div>
  );
}
