import { useState, useEffect, useRef } from 'react';
import api from '../api/client';

export default function ClockInModal({ onComplete, onClose }) {
  const [vehicles, setVehicles] = useState([]);
  const [vehicleId, setVehicleId] = useState('');
  const [odometer, setOdometer] = useState('');
  const [photoPreview, setPhotoPreview] = useState(null);
  const [photoFile, setPhotoFile] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const fileRef = useRef(null);

  useEffect(() => {
    api.get('/api/driver/vehicles/available')
      .then(res => setVehicles(res.data.vehicles || []))
      .catch(() => setError('Failed to load vehicles'));
  }, []);

  function handlePhoto(e) {
    const file = e.target.files?.[0];
    if (!file) return;
    setPhotoFile(file);
    const reader = new FileReader();
    reader.onload = () => setPhotoPreview(reader.result);
    reader.readAsDataURL(file);
  }

  async function handleSubmit() {
    if (!vehicleId) {
      setError('Please select a vehicle');
      return;
    }

    setError('');
    setLoading(true);
    try {
      // Upload photo first if present
      let odometerPhotoUrl = null;
      if (photoFile) {
        const form = new FormData();
        form.append('photo', photoFile, photoFile.name);
        form.append('type', 'odometer_start');
        try {
          const uploadRes = await api.upload('/api/driver/upload-photo', form);
          odometerPhotoUrl = uploadRes.data.url;
        } catch {
          // Photo upload is optional; continue without it
        }
      }

      const res = await api.post('/api/driver/clock-in', {
        vehicle_id: parseInt(vehicleId),
        start_odometer: odometer ? parseInt(odometer) : null,
        odometer_photo_url: odometerPhotoUrl,
      });

      onComplete(res.data.shift);
    } catch (err) {
      setError(err.message || 'Failed to clock in');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 sm:items-center">
      <div className="w-full max-w-md rounded-t-2xl bg-white p-5 shadow-xl sm:rounded-2xl">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-lg font-bold text-slate-900">Clock In</h2>
          <button onClick={onClose} className="text-sm text-slate-400">Cancel</button>
        </div>

        {error && (
          <div className="mb-4 rounded-lg bg-red-50 px-4 py-2 text-sm text-red-700">{error}</div>
        )}

        {/* Vehicle selection */}
        <div className="mb-4">
          <label className="mb-1 block text-sm font-medium text-slate-700">Select Vehicle</label>
          {vehicles.length === 0 ? (
            <p className="text-sm text-slate-400">No vehicles available</p>
          ) : (
            <div className="space-y-2">
              {vehicles.map(v => (
                <button
                  key={v.id}
                  type="button"
                  onClick={() => setVehicleId(String(v.id))}
                  className={`w-full rounded-lg border p-3 text-left text-sm ${
                    String(v.id) === vehicleId
                      ? 'border-blue-500 bg-blue-50 ring-1 ring-blue-500'
                      : 'border-slate-200 bg-white'
                  }`}
                >
                  <p className="font-semibold text-slate-900">{v.name}</p>
                  <p className="text-xs text-slate-500">
                    {v.license_plate || v.plate_number} — {v.vehicle_type}
                    {v.has_lift_gate ? ' — Lift gate' : ''}
                  </p>
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Odometer */}
        <div className="mb-4">
          <label className="mb-1 block text-sm font-medium text-slate-700">
            Starting Odometer <span className="text-slate-400">(optional)</span>
          </label>
          <input
            type="number"
            inputMode="numeric"
            placeholder="e.g. 45230"
            value={odometer}
            onChange={(e) => setOdometer(e.target.value)}
            className="w-full rounded-lg border border-slate-300 px-3 py-2.5 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
          />
        </div>

        {/* Odometer photo */}
        <div className="mb-6">
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
              className="flex w-full items-center justify-center gap-2 rounded-lg border-2 border-dashed border-slate-300 py-6 text-sm text-slate-500"
            >
              <CameraIcon className="h-5 w-5" />
              Take Photo
            </button>
          )}
        </div>

        {/* Submit */}
        <button
          onClick={handleSubmit}
          disabled={loading || !vehicleId}
          className="w-full rounded-lg bg-green-600 px-4 py-3 text-sm font-semibold text-white disabled:opacity-50"
        >
          {loading ? 'Clocking In...' : 'Confirm Clock In'}
        </button>
      </div>
    </div>
  );
}

function CameraIcon({ className }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" d="M6.827 6.175A2.31 2.31 0 0 1 5.186 7.23c-.38.054-.757.112-1.134.175C2.999 7.58 2.25 8.507 2.25 9.574V18a2.25 2.25 0 0 0 2.25 2.25h15A2.25 2.25 0 0 0 21.75 18V9.574c0-1.067-.75-1.994-1.802-2.169a47.865 47.865 0 0 0-1.134-.175 2.31 2.31 0 0 1-1.64-1.055l-.822-1.316a2.192 2.192 0 0 0-1.736-1.039 48.774 48.774 0 0 0-5.232 0 2.192 2.192 0 0 0-1.736 1.039l-.821 1.316Z" />
      <path strokeLinecap="round" strokeLinejoin="round" d="M16.5 12.75a4.5 4.5 0 1 1-9 0 4.5 4.5 0 0 1 9 0Z" />
    </svg>
  );
}
