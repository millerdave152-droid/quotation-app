import { useState, useRef } from 'react';
import api from '../api/client';

export default function ClockOutModal({ shift, stats, inspectionData, onComplete, onClose }) {
  const [odometer, setOdometer] = useState(inspectionData?.odometer_reading?.toString() || '');
  const [notes, setNotes] = useState('');
  const [photoPreview, setPhotoPreview] = useState(null);
  const [photoFile, setPhotoFile] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const fileRef = useRef(null);

  function handlePhoto(e) {
    const file = e.target.files?.[0];
    if (!file) return;
    setPhotoFile(file);
    const reader = new FileReader();
    reader.onload = () => setPhotoPreview(reader.result);
    reader.readAsDataURL(file);
  }

  async function handleSubmit() {
    setError('');
    setLoading(true);
    try {
      let odometerPhotoUrl = null;
      if (photoFile) {
        const form = new FormData();
        form.append('photo', photoFile, photoFile.name);
        form.append('type', 'odometer_end');
        try {
          const uploadRes = await api.upload('/api/driver/upload-photo', form);
          odometerPhotoUrl = uploadRes.data.url;
        } catch {
          // Optional — continue
        }
      }

      const res = await api.post('/api/driver/clock-out', {
        end_odometer: odometer ? parseInt(odometer) : null,
        odometer_photo_url: odometerPhotoUrl,
        notes: notes || null,
        inspection_id: inspectionData?.inspection_id || null,
      });

      onComplete(res.data.shift);
    } catch (err) {
      setError(err.message || 'Failed to clock out');
    } finally {
      setLoading(false);
    }
  }

  const shiftStart = shift?.actual_start
    ? new Date(shift.actual_start).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
    : '—';

  const elapsed = shift?.actual_start
    ? formatElapsed(Date.now() - new Date(shift.actual_start).getTime())
    : null;

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 sm:items-center">
      <div className="w-full max-w-md rounded-t-2xl bg-white p-5 shadow-xl sm:rounded-2xl">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-lg font-bold text-slate-900">Clock Out</h2>
          <button onClick={onClose} className="text-sm text-slate-400">Cancel</button>
        </div>

        {error && (
          <div className="mb-4 rounded-lg bg-red-50 px-4 py-2 text-sm text-red-700">{error}</div>
        )}

        {/* Inspection completed badge */}
        {inspectionData && (
          <div className="mb-4 flex items-center gap-2 rounded-lg bg-green-50 border border-green-200 px-3 py-2">
            <svg className="h-4 w-4 text-green-600" fill="none" viewBox="0 0 24 24" strokeWidth={2.5} stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" d="m4.5 12.75 6 6 9-13.5" />
            </svg>
            <span className="text-sm font-medium text-green-700">Post-trip inspection completed</span>
          </div>
        )}

        {/* Shift summary */}
        <div className="mb-4 rounded-lg bg-slate-50 p-3">
          <p className="mb-2 text-xs font-medium uppercase text-slate-400">Shift Summary</p>
          <div className="grid grid-cols-3 gap-3 text-center text-sm">
            <div>
              <p className="font-semibold text-slate-900">{shiftStart}</p>
              <p className="text-xs text-slate-500">Clock in</p>
            </div>
            <div>
              <p className="font-semibold text-slate-900">{elapsed || '—'}</p>
              <p className="text-xs text-slate-500">Duration</p>
            </div>
            <div>
              <p className="font-semibold text-slate-900">{stats?.completed || 0}</p>
              <p className="text-xs text-slate-500">Deliveries</p>
            </div>
          </div>
          {shift?.start_odometer && (
            <p className="mt-2 text-center text-xs text-slate-500">
              Start odometer: {shift.start_odometer.toLocaleString()} km
            </p>
          )}
        </div>

        {/* Ending odometer */}
        <div className="mb-4">
          <label className="mb-1 block text-sm font-medium text-slate-700">
            Ending Odometer <span className="text-slate-400">(optional)</span>
          </label>
          <input
            type="number"
            inputMode="numeric"
            placeholder="e.g. 45310"
            value={odometer}
            onChange={(e) => setOdometer(e.target.value)}
            className="w-full rounded-lg border border-slate-300 px-3 py-2.5 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
          />
          {odometer && shift?.start_odometer && parseInt(odometer) > shift.start_odometer && (
            <p className="mt-1 text-xs text-slate-500">
              Distance: {(parseInt(odometer) - shift.start_odometer).toLocaleString()} km
            </p>
          )}
        </div>

        {/* Odometer photo */}
        <div className="mb-4">
          <label className="mb-1 block text-sm font-medium text-slate-700">
            Odometer Photo <span className="text-slate-400">(optional)</span>
          </label>
          <input
            ref={fileRef}
            type="file"
            accept="image/*"
            capture="environment"
            onChange={handlePhoto}
            className="hidden"
          />
          {photoPreview ? (
            <div className="relative">
              <img src={photoPreview} alt="Odometer" className="h-32 w-full rounded-lg object-cover" />
              <button
                type="button"
                onClick={() => { setPhotoPreview(null); setPhotoFile(null); }}
                className="absolute right-2 top-2 rounded-full bg-black/50 px-2 py-0.5 text-xs text-white"
              >
                Remove
              </button>
            </div>
          ) : (
            <button
              type="button"
              onClick={() => fileRef.current?.click()}
              className="flex w-full items-center justify-center gap-2 rounded-lg border-2 border-dashed border-slate-300 py-4 text-sm text-slate-500"
            >
              <CameraIcon className="h-5 w-5" />
              Take Photo
            </button>
          )}
        </div>

        {/* Notes */}
        <div className="mb-6">
          <label className="mb-1 block text-sm font-medium text-slate-700">
            Notes <span className="text-slate-400">(optional)</span>
          </label>
          <textarea
            rows={2}
            placeholder="Any issues or notes about today's shift..."
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            className="w-full rounded-lg border border-slate-300 px-3 py-2.5 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
          />
        </div>

        {/* Submit */}
        <button
          onClick={handleSubmit}
          disabled={loading}
          className="w-full rounded-lg bg-red-600 px-4 py-3 text-sm font-semibold text-white disabled:opacity-50"
        >
          {loading ? 'Clocking Out...' : 'Confirm Clock Out'}
        </button>
      </div>
    </div>
  );
}

function formatElapsed(ms) {
  const hours = Math.floor(ms / 3600000);
  const minutes = Math.floor((ms % 3600000) / 60000);
  if (hours > 0) return `${hours}h ${minutes}m`;
  return `${minutes}m`;
}

function CameraIcon({ className }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" d="M6.827 6.175A2.31 2.31 0 0 1 5.186 7.23c-.38.054-.757.112-1.134.175C2.999 7.58 2.25 8.507 2.25 9.574V18a2.25 2.25 0 0 0 2.25 2.25h15A2.25 2.25 0 0 0 21.75 18V9.574c0-1.067-.75-1.994-1.802-2.169a47.865 47.865 0 0 0-1.134-.175 2.31 2.31 0 0 1-1.64-1.055l-.822-1.316a2.192 2.192 0 0 0-1.736-1.039 48.774 48.774 0 0 0-5.232 0 2.192 2.192 0 0 0-1.736 1.039l-.821 1.316Z" />
      <path strokeLinecap="round" strokeLinejoin="round" d="M16.5 12.75a4.5 4.5 0 1 1-9 0 4.5 4.5 0 0 1 9 0Z" />
    </svg>
  );
}
