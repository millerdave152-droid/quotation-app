import { useState, useRef } from 'react';

const CATEGORIES = [
  { value: 'item_damage',     icon: '📦', label: 'Item Damage',     desc: 'Item damaged during delivery' },
  { value: 'property_damage', icon: '🏠', label: 'Property Damage', desc: 'Damaged customer property' },
  { value: 'vehicle_issue',   icon: '🚗', label: 'Vehicle Issue',   desc: 'Truck problem' },
  { value: 'safety_issue',    icon: '🤕', label: 'Safety Issue',    desc: 'Safety concern' },
  { value: 'address_issue',   icon: '📍', label: 'Address Issue',   desc: 'Wrong/incomplete address' },
  { value: 'customer_issue',  icon: '👤', label: 'Customer Issue',  desc: 'Problem with customer' },
  { value: 'app_issue',       icon: '📱', label: 'App Issue',       desc: 'Technical problem' },
  { value: 'other',           icon: '❓', label: 'Other',           desc: 'Something else' },
];

const SEVERITIES = [
  { value: 'low',      label: 'Low',      cls: 'border-slate-300 bg-slate-50 text-slate-700' },
  { value: 'medium',   label: 'Medium',   cls: 'border-amber-300 bg-amber-50 text-amber-700' },
  { value: 'high',     label: 'High',     cls: 'border-orange-300 bg-orange-50 text-orange-700' },
  { value: 'critical', label: 'Critical', cls: 'border-red-300 bg-red-50 text-red-700' },
];

/**
 * Problem report modal — category selection, description, severity, photos, urgent toggle.
 *
 * Props:
 *   deliveryId     — optional delivery booking ID
 *   onSubmit       — async (payload) => { issue }
 *   onClose        — () => void
 */
export default function ProblemReportModal({ deliveryId, onSubmit, onClose }) {
  const [step, setStep] = useState('category'); // category | details
  const [category, setCategory] = useState(null);
  const [severity, setSeverity] = useState('medium');
  const [description, setDescription] = useState('');
  const [photos, setPhotos] = useState([]);
  const [immediateAction, setImmediateAction] = useState(false);
  const [customerNotified, setCustomerNotified] = useState(false);
  const [customerComments, setCustomerComments] = useState('');
  // Vehicle-specific
  const [canContinue, setCanContinue] = useState(true);
  const [needsAssistance, setNeedsAssistance] = useState(false);
  // Damage-specific
  const [whatDamaged, setWhatDamaged] = useState('');

  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [result, setResult] = useState(null);
  const fileRef = useRef(null);

  const isDamage = category === 'item_damage' || category === 'property_damage';
  const isVehicle = category === 'vehicle_issue';
  const photoRequired = isDamage || category === 'safety_issue';
  const canSubmit = description.trim().length >= 10
    && (!photoRequired || photos.length > 0)
    && (!isDamage || whatDamaged.trim());

  function handlePhotoAdd(e) {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      setPhotos(prev => [...prev, {
        id: Date.now(),
        data: reader.result,
        caption: '',
      }]);
    };
    reader.readAsDataURL(file);
    e.target.value = '';
  }

  function removePhoto(id) {
    setPhotos(prev => prev.filter(p => p.id !== id));
  }

  async function handleSubmit() {
    setSubmitting(true);
    setError('');
    try {
      const payload = {
        delivery_id: deliveryId || null,
        category,
        severity,
        description: description.trim(),
        photos: photos.map(p => ({ data: p.data, caption: p.caption })),
        requires_immediate_action: immediateAction,
        customer_notified: customerNotified,
        customer_comments: customerComments.trim() || null,
        can_continue_route: isVehicle ? canContinue : true,
        needs_assistance: isVehicle ? needsAssistance : false,
        damage_item: isDamage ? whatDamaged.trim() : null,
      };
      const res = await onSubmit(payload);
      setResult(res);
    } catch (err) {
      setError(err.message || 'Failed to submit');
      setSubmitting(false);
    }
  }

  // ---- Success screen ----
  if (result) {
    return (
      <div className="fixed inset-0 z-50 flex flex-col bg-white">
        <div className="flex flex-1 flex-col items-center justify-center px-6">
          <div className="mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-green-100">
            <svg className="h-8 w-8 text-green-600" fill="none" viewBox="0 0 24 24" strokeWidth={2.5} stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" d="m4.5 12.75 6 6 9-13.5" />
            </svg>
          </div>
          <h2 className="text-lg font-bold text-slate-900">Issue Reported</h2>
          <p className="mt-1 text-sm text-slate-500">Ticket: {result.ticket_number}</p>
          <p className="mt-2 text-xs text-slate-400 text-center">{result.message || 'Dispatch has been notified.'}</p>

          {immediateAction && (
            <div className="mt-4 rounded-xl border border-red-200 bg-red-50 p-3 text-center">
              <p className="text-xs font-semibold text-red-700">Dispatch has been alerted for immediate action</p>
            </div>
          )}
        </div>
        <div className="px-4 pb-8">
          <button
            onClick={onClose}
            className="w-full rounded-xl bg-blue-600 py-3.5 text-sm font-bold text-white shadow-lg"
          >
            Done
          </button>
        </div>
      </div>
    );
  }

  // ---- Category selection ----
  if (step === 'category') {
    return (
      <div className="fixed inset-0 z-50 flex items-end bg-black/40" onClick={onClose}>
        <div className="w-full max-h-[85vh] rounded-t-2xl bg-white pb-8 overflow-y-auto" onClick={e => e.stopPropagation()}>
          <div className="flex justify-center pt-3 pb-1">
            <div className="h-1 w-10 rounded-full bg-slate-300" />
          </div>
          <div className="px-4 pb-3">
            <h2 className="text-lg font-bold text-slate-900">Report a Problem</h2>
            <p className="text-xs text-slate-500">Select the type of issue</p>
          </div>

          <div className="grid grid-cols-2 gap-2 px-4">
            {CATEGORIES.map(c => (
              <button
                key={c.value}
                onClick={() => { setCategory(c.value); setStep('details'); }}
                className="flex flex-col items-start rounded-xl border border-slate-200 p-3 text-left transition-colors hover:border-blue-300 hover:bg-blue-50/50"
              >
                <span className="text-xl">{c.icon}</span>
                <span className="mt-1 text-sm font-semibold text-slate-800">{c.label}</span>
                <span className="mt-0.5 text-[10px] text-slate-500">{c.desc}</span>
              </button>
            ))}
          </div>

          <div className="px-4 pt-4">
            <button onClick={onClose} className="w-full rounded-xl border border-slate-200 py-3 text-sm font-medium text-slate-600">
              Cancel
            </button>
          </div>
        </div>
      </div>
    );
  }

  // ---- Details form ----
  const catLabel = CATEGORIES.find(c => c.value === category);

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-white">
      {/* Header */}
      <div className="flex items-center justify-between border-b border-slate-200 px-4 py-3">
        <button onClick={() => setStep('category')} className="text-sm font-medium text-blue-600">Back</button>
        <h2 className="text-sm font-bold text-slate-900">{catLabel?.icon} {catLabel?.label}</h2>
        <button onClick={onClose} className="text-sm text-slate-400">Cancel</button>
      </div>

      <div className="flex-1 overflow-y-auto px-4 py-4 space-y-4">
        {error && (
          <div className="rounded-lg bg-red-50 border border-red-200 px-3 py-2">
            <p className="text-xs text-red-700">{error}</p>
          </div>
        )}

        {/* Severity */}
        <div>
          <label className="mb-1.5 block text-xs font-medium text-slate-700">Severity</label>
          <div className="flex gap-2">
            {SEVERITIES.map(s => (
              <button
                key={s.value}
                onClick={() => setSeverity(s.value)}
                className={`flex-1 rounded-lg border py-2 text-center text-xs font-semibold transition-colors ${
                  severity === s.value ? s.cls : 'border-slate-200 bg-white text-slate-500'
                }`}
              >
                {s.label}
              </button>
            ))}
          </div>
        </div>

        {/* Damage-specific: what was damaged */}
        {isDamage && (
          <div>
            <label className="mb-1 block text-xs font-medium text-slate-700">What was damaged? *</label>
            <input
              type="text"
              value={whatDamaged}
              onChange={e => setWhatDamaged(e.target.value)}
              placeholder={category === 'item_damage' ? 'e.g., 55" Samsung TV — cracked screen' : 'e.g., Door frame scratched'}
              className="w-full rounded-lg border border-slate-200 px-3 py-2.5 text-sm text-slate-800 placeholder:text-slate-300"
            />
          </div>
        )}

        {/* Description */}
        <div>
          <label className="mb-1 block text-xs font-medium text-slate-700">
            Description * <span className="text-slate-400 font-normal">(min 10 chars)</span>
          </label>
          <textarea
            value={description}
            onChange={e => setDescription(e.target.value)}
            placeholder="Describe the issue in detail..."
            rows={4}
            className="w-full rounded-lg border border-slate-200 px-3 py-2.5 text-sm text-slate-800 placeholder:text-slate-300"
          />
          <p className="mt-0.5 text-right text-[10px] text-slate-400">{description.length} chars</p>
        </div>

        {/* Vehicle-specific options */}
        {isVehicle && (
          <div className="space-y-2 rounded-xl border border-slate-200 p-3">
            <label className="flex items-center gap-3">
              <input
                type="checkbox"
                checked={!canContinue}
                onChange={e => setCanContinue(!e.target.checked)}
                className="h-4 w-4 rounded border-slate-300 text-red-600"
              />
              <span className="text-sm text-slate-700">Cannot continue route</span>
            </label>
            <label className="flex items-center gap-3">
              <input
                type="checkbox"
                checked={needsAssistance}
                onChange={e => setNeedsAssistance(e.target.checked)}
                className="h-4 w-4 rounded border-slate-300 text-red-600"
              />
              <span className="text-sm text-slate-700">Need roadside assistance</span>
            </label>
          </div>
        )}

        {/* Photos */}
        <div>
          <label className="mb-1.5 block text-xs font-medium text-slate-700">
            Photos {photoRequired ? '*' : '(optional)'}
          </label>
          <input
            ref={fileRef}
            type="file"
            accept="image/*"
            capture="environment"
            onChange={handlePhotoAdd}
            className="hidden"
          />
          <div className="flex flex-wrap gap-2">
            {photos.map(p => (
              <div key={p.id} className="group relative h-20 w-20 overflow-hidden rounded-lg bg-slate-100">
                <img src={p.data} alt="" className="h-full w-full object-cover" />
                <button
                  onClick={() => removePhoto(p.id)}
                  className="absolute right-0.5 top-0.5 flex h-5 w-5 items-center justify-center rounded-full bg-black/50 text-[10px] text-white"
                >
                  ✕
                </button>
              </div>
            ))}
            {photos.length < 5 && (
              <button
                onClick={() => fileRef.current?.click()}
                className="flex h-20 w-20 flex-col items-center justify-center gap-1 rounded-lg border-2 border-dashed border-slate-300 text-slate-400"
              >
                <span className="text-lg">📷</span>
                <span className="text-[9px]">Add</span>
              </button>
            )}
          </div>
          {photoRequired && photos.length === 0 && (
            <p className="mt-1 text-xs text-amber-600">At least 1 photo required for damage reports</p>
          )}
        </div>

        {/* Customer notification (for damage categories) */}
        {isDamage && (
          <div className="space-y-2 rounded-xl border border-slate-200 p-3">
            <label className="flex items-center gap-3">
              <input
                type="checkbox"
                checked={customerNotified}
                onChange={e => setCustomerNotified(e.target.checked)}
                className="h-4 w-4 rounded border-slate-300 text-blue-600"
              />
              <span className="text-sm text-slate-700">Customer has been notified</span>
            </label>
            {customerNotified && (
              <textarea
                value={customerComments}
                onChange={e => setCustomerComments(e.target.value)}
                placeholder="Customer's reaction/comments..."
                rows={2}
                className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm text-slate-800 placeholder:text-slate-300"
              />
            )}
          </div>
        )}

        {/* Immediate action toggle */}
        <div className="rounded-xl border border-red-200 bg-red-50 p-3">
          <label className="flex items-center gap-3">
            <input
              type="checkbox"
              checked={immediateAction}
              onChange={e => setImmediateAction(e.target.checked)}
              className="h-4 w-4 rounded border-red-300 text-red-600"
            />
            <div>
              <span className="text-sm font-medium text-red-700">Requires immediate action</span>
              <p className="text-[10px] text-red-500">Dispatch + manager will be notified immediately</p>
            </div>
          </label>
        </div>
      </div>

      {/* Submit */}
      <div className="border-t border-slate-200 px-4 pb-8 pt-3">
        <button
          onClick={handleSubmit}
          disabled={!canSubmit || submitting}
          className={`w-full rounded-xl py-3.5 text-sm font-bold shadow-lg ${
            canSubmit ? 'bg-red-600 text-white' : 'bg-slate-200 text-slate-400'
          } disabled:opacity-50`}
        >
          {submitting ? 'Submitting...' : 'Submit Issue Report'}
        </button>
      </div>
    </div>
  );
}
