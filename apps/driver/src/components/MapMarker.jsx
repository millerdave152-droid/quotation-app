import { Marker, Popup } from 'react-leaflet';
import L from 'leaflet';

const STATUS_COLORS = {
  completed: '#22c55e',   // green-500
  approaching: '#eab308', // yellow-500
  arrived: '#eab308',
  pending: '#94a3b8',     // slate-400
  failed: '#ef4444',      // red-500
  skipped: '#f97316',     // orange-500
};

function createNumberedIcon(number, color) {
  return L.divIcon({
    className: '',
    html: `<div style="
      width:32px;height:32px;border-radius:50%;
      background:${color};color:#fff;
      display:flex;align-items:center;justify-content:center;
      font-weight:700;font-size:13px;
      border:3px solid #fff;box-shadow:0 2px 6px rgba(0,0,0,.3);
    ">${number}</div>`,
    iconSize: [32, 32],
    iconAnchor: [16, 16],
    popupAnchor: [0, -20],
  });
}

export default function MapMarker({ stop, onNavigate }) {
  const lat = parseFloat(stop.latitude || stop.lat);
  const lng = parseFloat(stop.longitude || stop.lng);
  if (isNaN(lat) || isNaN(lng)) return null;

  const status = stop.stop_status || mapStatus(stop.booking_status);
  const color = STATUS_COLORS[status] || STATUS_COLORS.pending;
  const seq = stop.sequence_order || '·';
  const icon = createNumberedIcon(status === 'completed' ? '✓' : seq, color);

  const customerName = stop.customer_name || stop.contact_name || 'Stop';
  const address = stop.delivery_address || stop.stop_address || '';

  return (
    <Marker position={[lat, lng]} icon={icon}>
      <Popup>
        <div className="min-w-[180px]">
          <p className="font-semibold text-sm text-slate-900">{customerName}</p>
          <p className="text-xs text-slate-500 mt-0.5">{address}</p>
          {stop.scheduled_start && (
            <p className="text-xs text-slate-400 mt-1">
              {formatTime(stop.scheduled_start)}
              {stop.scheduled_end && ` – ${formatTime(stop.scheduled_end)}`}
            </p>
          )}
          {stop.items?.length > 0 && (
            <p className="text-xs text-slate-500 mt-1">
              {stop.items.reduce((s, i) => s + (i.quantity || 1), 0)} items
            </p>
          )}
          {onNavigate && status !== 'completed' && (
            <button
              onClick={() => onNavigate(stop)}
              className="mt-2 w-full rounded bg-blue-600 px-2 py-1 text-xs font-medium text-white"
            >
              Navigate here
            </button>
          )}
        </div>
      </Popup>
    </Marker>
  );
}

function mapStatus(bookingStatus) {
  const map = {
    pending: 'pending', scheduled: 'pending', confirmed: 'pending',
    in_transit: 'approaching', delivered: 'completed',
    failed: 'failed', cancelled: 'skipped',
  };
  return map[bookingStatus] || 'pending';
}

function formatTime(t) {
  if (!t) return '';
  const d = t.includes('T') ? new Date(t) : new Date(`2000-01-01T${t}`);
  return d.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
}
