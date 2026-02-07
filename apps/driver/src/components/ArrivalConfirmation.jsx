import { useState } from 'react';
import { getCurrentPosition } from '../utils/gps';

/**
 * Arrival confirmation step.
 * Auto-captures GPS + timestamp, optional notes, triggers customer notification.
 *
 * Props:
 *   delivery     — the delivery object
 *   onConfirm    — async (payload) => void   called with { latitude, longitude, accuracy, arrived_at, notes }
 *   onCancel     — () => void
 *   online       — boolean
 */
export default function ArrivalConfirmation({ delivery, onConfirm, onCancel, online }) {
  const [notes, setNotes] = useState('');
  const [gpsStatus, setGpsStatus] = useState('idle'); // idle | capturing | captured | failed
  const [coords, setCoords] = useState(null);
  const [submitting, setSubmitting] = useState(false);

  const customerName = delivery.customer_name || delivery.contact_name || 'Customer';
  const address = delivery.delivery_address || '';

  async function captureGPS() {
    setGpsStatus('capturing');
    try {
      const pos = await getCurrentPosition();
      setCoords(pos);
      setGpsStatus('captured');
    } catch {
      setGpsStatus('failed');
    }
  }

  async function handleConfirm() {
    setSubmitting(true);
    try {
      // Auto-capture GPS if not already done
      let position = coords;
      if (!position) {
        try {
          position = await getCurrentPosition();
        } catch {
          // Continue without GPS
        }
      }

      await onConfirm({
        latitude: position?.latitude || null,
        longitude: position?.longitude || null,
        accuracy: position?.accuracy || null,
        arrived_at: new Date().toISOString(),
        notes: notes.trim() || null,
      });
    } catch {
      setSubmitting(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end bg-black/40">
      <div className="w-full rounded-t-2xl bg-white p-5 pb-8 shadow-2xl">
        {/* Header */}
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-lg font-bold text-slate-900">Confirm Arrival</h2>
          <button onClick={onCancel} className="text-sm font-medium text-slate-400">Cancel</button>
        </div>

        {/* Delivery summary */}
        <div className="mb-4 rounded-lg bg-slate-50 p-3">
          <p className="text-sm font-semibold text-slate-800">{customerName}</p>
          <p className="text-xs text-slate-500">{address}</p>
        </div>

        {/* GPS status */}
        <div className="mb-4">
          <div className="flex items-center justify-between rounded-lg border border-slate-200 p-3">
            <div className="flex items-center gap-2">
              <span className={`flex h-8 w-8 items-center justify-center rounded-full text-sm ${
                gpsStatus === 'captured' ? 'bg-green-100 text-green-600'
                : gpsStatus === 'failed' ? 'bg-red-100 text-red-600'
                : 'bg-blue-100 text-blue-600'
              }`}>
                {gpsStatus === 'captured' ? '✓' : gpsStatus === 'capturing' ? '…' : '📍'}
              </span>
              <div>
                <p className="text-sm font-medium text-slate-700">GPS Location</p>
                <p className="text-xs text-slate-400">
                  {gpsStatus === 'idle' && 'Tap to capture or auto-captures on confirm'}
                  {gpsStatus === 'capturing' && 'Getting location...'}
                  {gpsStatus === 'captured' && `${coords.latitude.toFixed(5)}, ${coords.longitude.toFixed(5)} (±${Math.round(coords.accuracy)}m)`}
                  {gpsStatus === 'failed' && 'Failed — will retry on confirm'}
                </p>
              </div>
            </div>
            {gpsStatus !== 'captured' && (
              <button
                onClick={captureGPS}
                disabled={gpsStatus === 'capturing'}
                className="rounded-lg bg-blue-50 px-3 py-1.5 text-xs font-medium text-blue-600 disabled:opacity-50"
              >
                {gpsStatus === 'capturing' ? 'Getting...' : 'Capture'}
              </button>
            )}
          </div>
        </div>

        {/* Timestamp */}
        <div className="mb-4 flex items-center gap-2 rounded-lg border border-slate-200 p-3">
          <span className="flex h-8 w-8 items-center justify-center rounded-full bg-green-100 text-sm text-green-600">⏱</span>
          <div>
            <p className="text-sm font-medium text-slate-700">Arrival Time</p>
            <p className="text-xs text-slate-400">
              {new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })} — auto-captured
            </p>
          </div>
        </div>

        {/* Notes */}
        <div className="mb-5">
          <label className="mb-1 block text-xs font-medium text-slate-500">Arrival Notes (optional)</label>
          <textarea
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="e.g., Parked on side street, gate was open..."
            rows={2}
            className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm text-slate-800 placeholder:text-slate-300 focus:border-blue-400 focus:outline-none"
          />
        </div>

        {/* Customer notification hint */}
        {online && (
          <div className="mb-4 rounded-lg bg-blue-50 px-3 py-2">
            <p className="text-xs text-blue-700">Customer will be notified of your arrival</p>
          </div>
        )}

        {/* Confirm button */}
        <button
          onClick={handleConfirm}
          disabled={submitting}
          className="w-full rounded-xl bg-purple-600 px-4 py-3.5 text-sm font-bold text-white shadow-lg disabled:opacity-50"
        >
          {submitting ? 'Confirming...' : 'Confirm Arrival'}
        </button>
      </div>
    </div>
  );
}
