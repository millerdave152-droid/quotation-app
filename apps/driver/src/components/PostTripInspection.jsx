import { useState, useRef } from 'react';
import api from '../api/client';

const CHECKLIST_ITEMS = [
  { key: 'no_new_damage', label: 'No new damage to vehicle', icon: '🚗' },
  { key: 'equipment_returned', label: 'All equipment returned (dolly, straps, blankets)', icon: '🔧' },
  { key: 'cargo_clean', label: 'Cargo area clean', icon: '🧹' },
  { key: 'no_personal_items', label: 'No personal items left in vehicle', icon: '🎒' },
];

const FUEL_LEVELS = [
  { value: 'full', label: 'Full', pct: 100 },
  { value: '3/4', label: '¾', pct: 75 },
  { value: '1/2', label: '½', pct: 50 },
  { value: '1/4', label: '¼', pct: 25 },
  { value: 'empty', label: 'Low', pct: 10 },
];

/**
 * Post-trip vehicle inspection — required before clock-out.
 *
 * Props:
 *   shift       — current shift object { id, vehicle_id, vehicle_name, start_odometer }
 *   stats       — { completed, total }
 *   onComplete  — (inspectionResult) => void
 *   onClose     — () => void
 */
export default function PostTripInspection({ shift, stats, onComplete, onClose }) {
  const [step, setStep] = useState('checklist'); // checklist | fuel | damage | issues | review
  const [checklist, setChecklist] = useState({});
  const [fuelLevel, setFuelLevel] = useState('');
  const [fuelPurchased, setFuelPurchased] = useState(false);
  const [fuelReceiptPhoto, setFuelReceiptPhoto] = useState(null);
  const [odometer, setOdometer] = useState('');
  const [odometerPhoto, setOdometerPhoto] = useState(null);
  // Damage
  const [hasNewDamage, setHasNewDamage] = useState(false);
  const [damageDesc, setDamageDesc] = useState('');
  const [damageWhen, setDamageWhen] = useState('');
  const [damageHow, setDamageHow] = useState('');
  const [damagePhotos, setDamagePhotos] = useState([]);
  const [damageReported, setDamageReported] = useState(false);
  // Issues
  const [mechanicalIssues, setMechanicalIssues] = useState('');
  const [incidents, setIncidents] = useState('');
  const [maintenanceNeeded, setMaintenanceNeeded] = useState('');

  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const fileRef = useRef(null);
  const odometerFileRef = useRef(null);
  const receiptFileRef = useRef(null);

  const allChecked = CHECKLIST_ITEMS.every(i => checklist[i.key]);
  const hasDamageCheckFailed = checklist.no_new_damage === false;

  function toggleCheck(key) {
    const newVal = !checklist[key];
    setChecklist(prev => ({ ...prev, [key]: newVal }));
    if (key === 'no_new_damage' && !newVal) {
      setHasNewDamage(true);
    } else if (key === 'no_new_damage' && newVal) {
      setHasNewDamage(false);
    }
  }

  function handlePhotoFile(e, setter) {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => setter(reader.result);
    reader.readAsDataURL(file);
    e.target.value = '';
  }

  function addDamagePhoto(e) {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => setDamagePhotos(prev => [...prev, { id: Date.now(), data: reader.result }]);
    reader.readAsDataURL(file);
    e.target.value = '';
  }

  const canProceedFromChecklist = Object.keys(checklist).length === CHECKLIST_ITEMS.length;
  const canProceedFromFuel = !!fuelLevel;
  const canSubmit = canProceedFromChecklist && canProceedFromFuel;

  async function handleSubmit() {
    setSubmitting(true);
    setError('');
    try {
      const issuesArray = [];
      if (mechanicalIssues.trim()) {
        issuesArray.push({ description: mechanicalIssues.trim(), type: 'mechanical' });
      }
      if (incidents.trim()) {
        issuesArray.push({ description: incidents.trim(), type: 'incident' });
      }

      const payload = {
        vehicle_id: shift?.vehicle_id,
        shift_id: shift?.id,
        inspection_type: 'post_trip',
        odometer_reading: odometer ? parseInt(odometer) : null,
        odometer_photo: odometerPhoto || null,
        fuel_level: fuelLevel,
        fuel_purchased: fuelPurchased,
        fuel_receipt_photo: fuelReceiptPhoto || null,
        checklist: CHECKLIST_ITEMS.reduce((acc, item) => {
          acc[item.key] = { passed: !!checklist[item.key] };
          return acc;
        }, {}),
        new_damage: hasNewDamage ? {
          description: damageDesc,
          when: damageWhen,
          how: damageHow,
          photos: damagePhotos.map(p => p.data),
          already_reported: damageReported,
        } : null,
        issues_reported: issuesArray.length > 0 ? issuesArray : null,
        maintenance_needed: maintenanceNeeded.trim() || null,
        inspected_at: new Date().toISOString(),
      };

      const res = await api.post('/api/driver/inspections', payload);
      onComplete(res.data);
    } catch (err) {
      setError(err.message || 'Failed to submit inspection');
      setSubmitting(false);
    }
  }

  const steps = ['checklist', 'fuel', 'issues', 'review'];
  if (hasNewDamage) steps.splice(2, 0, 'damage');
  const stepIdx = steps.indexOf(step);
  const stepLabels = { checklist: 'Checklist', fuel: 'Fuel & Odometer', damage: 'Damage Report', issues: 'Issues', review: 'Review' };

  function nextStep() {
    if (stepIdx < steps.length - 1) setStep(steps[stepIdx + 1]);
  }
  function prevStep() {
    if (stepIdx > 0) setStep(steps[stepIdx - 1]);
  }

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-white">
      {/* Header */}
      <div className="flex items-center justify-between border-b border-slate-200 px-4 py-3">
        <button
          onClick={stepIdx === 0 ? onClose : prevStep}
          className="text-sm font-medium text-blue-600"
        >
          {stepIdx === 0 ? 'Cancel' : 'Back'}
        </button>
        <h2 className="text-sm font-bold text-slate-900">Post-Trip Inspection</h2>
        <span className="text-xs text-slate-400">{stepIdx + 1}/{steps.length}</span>
      </div>

      {/* Step indicator */}
      <div className="flex gap-1 px-4 pt-3">
        {steps.map((s, i) => (
          <div key={s} className="flex-1">
            <div className={`h-1 rounded-full ${i <= stepIdx ? 'bg-blue-500' : 'bg-slate-200'}`} />
            <p className={`mt-1 text-center text-[9px] ${i <= stepIdx ? 'text-blue-600 font-medium' : 'text-slate-400'}`}>
              {stepLabels[s]}
            </p>
          </div>
        ))}
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto px-4 py-4 space-y-4">
        {error && (
          <div className="rounded-lg bg-red-50 border border-red-200 px-3 py-2">
            <p className="text-xs text-red-700">{error}</p>
          </div>
        )}

        {/* Vehicle info banner */}
        {step === 'checklist' && shift && (
          <div className="rounded-xl bg-slate-50 p-3">
            <p className="text-xs text-slate-400">Vehicle</p>
            <p className="text-sm font-semibold text-slate-800">
              {shift.vehicle_name} — {shift.license_plate || shift.plate_number}
            </p>
            {stats && (
              <p className="mt-1 text-xs text-slate-500">
                {stats.completed || 0} deliveries completed today
              </p>
            )}
          </div>
        )}

        {/* ---- CHECKLIST ---- */}
        {step === 'checklist' && (
          <div className="space-y-2">
            <p className="text-xs text-slate-500">Inspect your vehicle and confirm each item:</p>
            {CHECKLIST_ITEMS.map(item => (
              <button
                key={item.key}
                onClick={() => toggleCheck(item.key)}
                className={`flex w-full items-center gap-3 rounded-xl border p-3.5 text-left transition-colors ${
                  checklist[item.key] === true
                    ? 'border-green-200 bg-green-50'
                    : checklist[item.key] === false
                      ? 'border-red-200 bg-red-50'
                      : 'border-slate-200 bg-white'
                }`}
              >
                <span className={`flex h-7 w-7 items-center justify-center rounded-lg text-sm ${
                  checklist[item.key] === true ? 'bg-green-500 text-white'
                    : checklist[item.key] === false ? 'bg-red-500 text-white'
                    : 'bg-slate-100 text-slate-400'
                }`}>
                  {checklist[item.key] === true ? '✓' : checklist[item.key] === false ? '✕' : item.icon}
                </span>
                <span className={`flex-1 text-sm font-medium ${
                  checklist[item.key] === true ? 'text-green-700'
                    : checklist[item.key] === false ? 'text-red-700'
                    : 'text-slate-700'
                }`}>
                  {item.label}
                </span>
              </button>
            ))}

            {hasDamageCheckFailed && (
              <div className="rounded-xl border border-red-200 bg-red-50 p-3">
                <p className="text-xs font-semibold text-red-700">New damage detected — you'll need to fill out a damage report.</p>
              </div>
            )}
          </div>
        )}

        {/* ---- FUEL & ODOMETER ---- */}
        {step === 'fuel' && (
          <div className="space-y-4">
            {/* Fuel level */}
            <div>
              <label className="mb-2 block text-xs font-medium text-slate-700">Fuel Level *</label>
              <div className="flex gap-2">
                {FUEL_LEVELS.map(f => (
                  <button
                    key={f.value}
                    onClick={() => setFuelLevel(f.value)}
                    className={`flex-1 flex flex-col items-center rounded-xl border py-3 transition-colors ${
                      fuelLevel === f.value
                        ? 'border-blue-400 bg-blue-50'
                        : 'border-slate-200 bg-white'
                    }`}
                  >
                    {/* Mini fuel gauge */}
                    <div className="mb-1 h-8 w-3 overflow-hidden rounded-full border border-slate-300 bg-slate-100">
                      <div
                        className={`w-full rounded-full ${f.pct > 25 ? 'bg-green-500' : 'bg-red-500'}`}
                        style={{ height: `${f.pct}%`, marginTop: `${100 - f.pct}%` }}
                      />
                    </div>
                    <span className={`text-xs font-semibold ${
                      fuelLevel === f.value ? 'text-blue-700' : 'text-slate-600'
                    }`}>
                      {f.label}
                    </span>
                  </button>
                ))}
              </div>
            </div>

            {/* Fuel purchased */}
            <div className="rounded-xl border border-slate-200 p-3 space-y-2">
              <label className="flex items-center gap-3">
                <input
                  type="checkbox"
                  checked={fuelPurchased}
                  onChange={e => setFuelPurchased(e.target.checked)}
                  className="h-4 w-4 rounded border-slate-300 text-blue-600"
                />
                <span className="text-sm text-slate-700">I purchased fuel today</span>
              </label>
              {fuelPurchased && (
                <div>
                  <input
                    ref={receiptFileRef}
                    type="file"
                    accept="image/*"
                    capture="environment"
                    onChange={e => handlePhotoFile(e, setFuelReceiptPhoto)}
                    className="hidden"
                  />
                  {fuelReceiptPhoto ? (
                    <div className="relative">
                      <img src={fuelReceiptPhoto} alt="Receipt" className="h-24 w-full rounded-lg object-cover" />
                      <button
                        onClick={() => setFuelReceiptPhoto(null)}
                        className="absolute right-1 top-1 rounded-full bg-black/50 px-2 py-0.5 text-xs text-white"
                      >
                        Remove
                      </button>
                    </div>
                  ) : (
                    <button
                      onClick={() => receiptFileRef.current?.click()}
                      className="w-full rounded-lg border-2 border-dashed border-slate-300 py-4 text-xs text-slate-500"
                    >
                      📸 Take photo of receipt
                    </button>
                  )}
                </div>
              )}
            </div>

            {/* Odometer */}
            <div>
              <label className="mb-1 block text-xs font-medium text-slate-700">Ending Odometer</label>
              <input
                type="number"
                inputMode="numeric"
                placeholder="e.g. 45310"
                value={odometer}
                onChange={e => setOdometer(e.target.value)}
                className="w-full rounded-lg border border-slate-200 px-3 py-2.5 text-sm focus:border-blue-400 focus:outline-none"
              />
              {odometer && shift?.start_odometer && parseInt(odometer) > shift.start_odometer && (
                <p className="mt-1 text-xs text-slate-500">
                  Today's distance: {(parseInt(odometer) - shift.start_odometer).toLocaleString()} km
                </p>
              )}
            </div>

            {/* Odometer photo */}
            <div>
              <label className="mb-1 block text-xs font-medium text-slate-500">Odometer Photo (optional)</label>
              <input
                ref={odometerFileRef}
                type="file"
                accept="image/*"
                capture="environment"
                onChange={e => handlePhotoFile(e, setOdometerPhoto)}
                className="hidden"
              />
              {odometerPhoto ? (
                <div className="relative">
                  <img src={odometerPhoto} alt="Odometer" className="h-24 w-full rounded-lg object-cover" />
                  <button
                    onClick={() => setOdometerPhoto(null)}
                    className="absolute right-1 top-1 rounded-full bg-black/50 px-2 py-0.5 text-xs text-white"
                  >
                    Remove
                  </button>
                </div>
              ) : (
                <button
                  onClick={() => odometerFileRef.current?.click()}
                  className="w-full rounded-lg border-2 border-dashed border-slate-300 py-4 text-xs text-slate-500"
                >
                  📸 Take photo of odometer
                </button>
              )}
            </div>
          </div>
        )}

        {/* ---- DAMAGE REPORT ---- */}
        {step === 'damage' && (
          <div className="space-y-4">
            <div className="rounded-xl border border-red-200 bg-red-50 p-3">
              <p className="text-xs font-semibold text-red-700">New Damage Report</p>
              <p className="mt-0.5 text-[10px] text-red-500">Provide details about the damage found.</p>
            </div>

            <div>
              <label className="mb-1 block text-xs font-medium text-slate-700">What is damaged? *</label>
              <input
                type="text"
                value={damageDesc}
                onChange={e => setDamageDesc(e.target.value)}
                placeholder="e.g., Rear bumper dent, cargo door scratch..."
                className="w-full rounded-lg border border-slate-200 px-3 py-2.5 text-sm placeholder:text-slate-300"
              />
            </div>

            <div>
              <label className="mb-1 block text-xs font-medium text-slate-700">When did it happen?</label>
              <input
                type="text"
                value={damageWhen}
                onChange={e => setDamageWhen(e.target.value)}
                placeholder="e.g., During 3rd delivery at 2pm, backing into driveway"
                className="w-full rounded-lg border border-slate-200 px-3 py-2.5 text-sm placeholder:text-slate-300"
              />
            </div>

            <div>
              <label className="mb-1 block text-xs font-medium text-slate-700">How did it happen?</label>
              <textarea
                value={damageHow}
                onChange={e => setDamageHow(e.target.value)}
                placeholder="Describe what happened..."
                rows={3}
                className="w-full rounded-lg border border-slate-200 px-3 py-2.5 text-sm placeholder:text-slate-300"
              />
            </div>

            {/* Damage photos */}
            <div>
              <label className="mb-1.5 block text-xs font-medium text-slate-700">Photos of Damage *</label>
              <input
                ref={fileRef}
                type="file"
                accept="image/*"
                capture="environment"
                onChange={addDamagePhoto}
                className="hidden"
              />
              <div className="flex flex-wrap gap-2">
                {damagePhotos.map(p => (
                  <div key={p.id} className="relative h-20 w-20 overflow-hidden rounded-lg bg-slate-100">
                    <img src={p.data} alt="" className="h-full w-full object-cover" />
                    <button
                      onClick={() => setDamagePhotos(prev => prev.filter(x => x.id !== p.id))}
                      className="absolute right-0.5 top-0.5 flex h-5 w-5 items-center justify-center rounded-full bg-black/50 text-[10px] text-white"
                    >
                      ✕
                    </button>
                  </div>
                ))}
                {damagePhotos.length < 5 && (
                  <button
                    onClick={() => fileRef.current?.click()}
                    className="flex h-20 w-20 flex-col items-center justify-center gap-1 rounded-lg border-2 border-dashed border-red-300 text-red-400"
                  >
                    <span className="text-lg">📷</span>
                    <span className="text-[9px]">Add</span>
                  </button>
                )}
              </div>
            </div>

            <label className="flex items-center gap-3 rounded-xl border border-slate-200 p-3">
              <input
                type="checkbox"
                checked={damageReported}
                onChange={e => setDamageReported(e.target.checked)}
                className="h-4 w-4 rounded border-slate-300 text-blue-600"
              />
              <span className="text-sm text-slate-700">Already reported via Issue Report</span>
            </label>
          </div>
        )}

        {/* ---- ISSUES ---- */}
        {step === 'issues' && (
          <div className="space-y-4">
            <p className="text-xs text-slate-500">Report any issues from today's shift:</p>

            <div>
              <label className="mb-1 block text-xs font-medium text-slate-700">Mechanical Issues</label>
              <textarea
                value={mechanicalIssues}
                onChange={e => setMechanicalIssues(e.target.value)}
                placeholder="e.g., AC not cooling well, brakes squeaking..."
                rows={2}
                className="w-full rounded-lg border border-slate-200 px-3 py-2.5 text-sm placeholder:text-slate-300"
              />
            </div>

            <div>
              <label className="mb-1 block text-xs font-medium text-slate-700">Incidents</label>
              <textarea
                value={incidents}
                onChange={e => setIncidents(e.target.value)}
                placeholder="e.g., Minor fender bender in parking lot, close call on highway..."
                rows={2}
                className="w-full rounded-lg border border-slate-200 px-3 py-2.5 text-sm placeholder:text-slate-300"
              />
            </div>

            <div>
              <label className="mb-1 block text-xs font-medium text-slate-700">Maintenance Needed</label>
              <textarea
                value={maintenanceNeeded}
                onChange={e => setMaintenanceNeeded(e.target.value)}
                placeholder="e.g., Oil change due soon, tire pressure low..."
                rows={2}
                className="w-full rounded-lg border border-slate-200 px-3 py-2.5 text-sm placeholder:text-slate-300"
              />
            </div>

            {!mechanicalIssues && !incidents && !maintenanceNeeded && (
              <div className="rounded-xl bg-green-50 border border-green-200 p-3 text-center">
                <p className="text-xs text-green-700">No issues to report? You can skip to review.</p>
              </div>
            )}
          </div>
        )}

        {/* ---- REVIEW ---- */}
        {step === 'review' && (
          <div className="space-y-3">
            <div className="rounded-xl bg-slate-50 p-3">
              <p className="text-[10px] text-slate-400">Vehicle</p>
              <p className="text-sm font-semibold text-slate-800">{shift?.vehicle_name}</p>
            </div>

            <div className="grid grid-cols-3 gap-2">
              <div className="rounded-xl bg-slate-50 p-3 text-center">
                <p className="text-[10px] text-slate-400">Fuel</p>
                <p className="text-sm font-semibold text-slate-800">{fuelLevel || '—'}</p>
              </div>
              <div className="rounded-xl bg-slate-50 p-3 text-center">
                <p className="text-[10px] text-slate-400">Odometer</p>
                <p className="text-sm font-semibold text-slate-800">{odometer || '—'}</p>
              </div>
              <div className="rounded-xl bg-slate-50 p-3 text-center">
                <p className="text-[10px] text-slate-400">Checklist</p>
                <p className={`text-sm font-semibold ${allChecked ? 'text-green-600' : 'text-amber-600'}`}>
                  {allChecked ? 'All pass' : 'Issues'}
                </p>
              </div>
            </div>

            {hasNewDamage && damageDesc && (
              <div className="rounded-xl border border-red-200 bg-red-50 p-3">
                <p className="text-[10px] text-red-500">New Damage</p>
                <p className="text-sm text-red-800">{damageDesc}</p>
                {damagePhotos.length > 0 && (
                  <p className="mt-1 text-[10px] text-red-500">{damagePhotos.length} photo(s) attached</p>
                )}
              </div>
            )}

            {(mechanicalIssues || incidents || maintenanceNeeded) && (
              <div className="rounded-xl border border-amber-200 bg-amber-50 p-3 space-y-1">
                <p className="text-[10px] text-amber-500">Issues Reported</p>
                {mechanicalIssues && <p className="text-xs text-amber-800">Mechanical: {mechanicalIssues}</p>}
                {incidents && <p className="text-xs text-amber-800">Incident: {incidents}</p>}
                {maintenanceNeeded && <p className="text-xs text-amber-800">Maintenance: {maintenanceNeeded}</p>}
              </div>
            )}

            {fuelPurchased && (
              <div className="rounded-xl bg-blue-50 border border-blue-200 p-3">
                <p className="text-xs text-blue-700">Fuel receipt {fuelReceiptPhoto ? 'photo attached' : 'not attached'}</p>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Bottom action */}
      <div className="border-t border-slate-200 px-4 pb-8 pt-3">
        {step === 'review' ? (
          <button
            onClick={handleSubmit}
            disabled={!canSubmit || submitting}
            className="w-full rounded-xl bg-green-600 py-3.5 text-sm font-bold text-white shadow-lg disabled:opacity-50"
          >
            {submitting ? 'Submitting...' : 'Submit Inspection & Clock Out'}
          </button>
        ) : (
          <button
            onClick={nextStep}
            disabled={
              (step === 'checklist' && !canProceedFromChecklist) ||
              (step === 'fuel' && !canProceedFromFuel) ||
              (step === 'damage' && hasNewDamage && !damageDesc.trim())
            }
            className="w-full rounded-xl bg-blue-600 py-3.5 text-sm font-bold text-white shadow-lg disabled:bg-slate-200 disabled:text-slate-400"
          >
            Next
          </button>
        )}
      </div>
    </div>
  );
}
