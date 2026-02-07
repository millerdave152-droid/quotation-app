import { useNavigate } from 'react-router-dom';

const STATUS_CONFIG = {
  pending:     { label: 'Pending',     cls: 'bg-slate-100 text-slate-600' },
  approaching: { label: 'En Route',    cls: 'bg-blue-100 text-blue-700' },
  arrived:     { label: 'Arrived',     cls: 'bg-purple-100 text-purple-700' },
  completed:   { label: 'Completed',   cls: 'bg-green-100 text-green-700' },
  failed:      { label: 'Failed',      cls: 'bg-red-100 text-red-700' },
  skipped:     { label: 'Skipped',     cls: 'bg-amber-100 text-amber-700' },
};

export default function DeliveryCard({ stop, isActive }) {
  const navigate = useNavigate();

  const status = stop.stop_status || mapBookingStatus(stop.booking_status);
  const { label: statusLabel, cls: statusCls } = STATUS_CONFIG[status] || STATUS_CONFIG.pending;

  const address = stop.delivery_address || stop.stop_address || '';
  const truncatedAddress = address.length > 60 ? address.slice(0, 57) + '...' : address;

  const customerName = stop.customer_name || stop.contact_name || 'Unknown';
  const customerPhone = stop.contact_phone || stop.customer_phone_main;

  const timeWindow = formatTimeWindow(stop.scheduled_start, stop.scheduled_end);
  const eta = stop.stop_eta ? formatTime(stop.stop_eta) : null;

  // Build items summary
  const items = stop.items || [];
  const itemCount = items.reduce((sum, i) => sum + (i.quantity || 1), 0);
  const itemNames = items.slice(0, 3).map(i => i.product_name).join(', ');
  const itemsSummary = itemCount > 0
    ? `${itemCount} item${itemCount !== 1 ? 's' : ''}${itemNames ? ' — ' + itemNames : ''}`
    : null;

  // Special indicators
  const indicators = [];
  if (stop.dwelling_type && ['condo', 'apartment', 'highrise'].includes(stop.dwelling_type)) {
    indicators.push({ icon: '🏢', label: stop.dwelling_type });
  }
  if (stop.elevator_booking_required) {
    indicators.push({ icon: '🛗', label: 'Elevator' });
  }
  if (stop.access_notes || stop.access_code) {
    indicators.push({ icon: '⚠️', label: 'Access notes' });
  }
  if (stop.delivery_instructions?.toLowerCase().includes('call')) {
    indicators.push({ icon: '📞', label: 'Call ahead' });
  }
  if (stop.floor_level && stop.floor_level > 1 && !stop.has_elevator) {
    indicators.push({ icon: '🚶', label: `Floor ${stop.floor_level} (stairs)` });
  }

  function handleTap() {
    const id = stop.booking_id || stop.stop_id;
    if (id) navigate(`/deliveries/${id}`);
  }

  return (
    <button
      onClick={handleTap}
      className={`w-full rounded-xl border bg-white p-4 text-left shadow-sm transition-colors ${
        isActive ? 'border-blue-400 ring-2 ring-blue-100' : 'border-slate-200'
      }`}
    >
      <div className="mb-2 flex items-start justify-between gap-2">
        {/* Sequence badge + customer */}
        <div className="flex items-center gap-2.5">
          <span className={`flex h-7 w-7 items-center justify-center rounded-full text-xs font-bold ${
            status === 'completed' ? 'bg-green-100 text-green-700'
              : isActive ? 'bg-blue-600 text-white'
              : 'bg-slate-100 text-slate-600'
          }`}>
            {status === 'completed' ? '✓' : stop.sequence_order || '·'}
          </span>
          <div>
            <p className="font-semibold text-slate-900">{customerName}</p>
            {stop.order_number && (
              <p className="text-xs text-slate-400">{stop.order_number}</p>
            )}
          </div>
        </div>

        {/* Status badge */}
        <span className={`flex-shrink-0 rounded-full px-2 py-0.5 text-xs font-medium ${statusCls}`}>
          {statusLabel}
        </span>
      </div>

      {/* Address */}
      <p className="mb-1 text-sm text-slate-600">{truncatedAddress}</p>

      {/* Time window / ETA */}
      <div className="mb-2 flex items-center gap-3 text-xs text-slate-400">
        {timeWindow && <span>{timeWindow}</span>}
        {eta && !timeWindow && <span>ETA {eta}</span>}
        {customerPhone && (
          <a
            href={`tel:${customerPhone}`}
            onClick={e => e.stopPropagation()}
            className="text-blue-500"
          >
            {customerPhone}
          </a>
        )}
      </div>

      {/* Items summary */}
      {itemsSummary && (
        <p className="mb-2 text-xs text-slate-500">{itemsSummary}</p>
      )}

      {/* Special indicators */}
      {indicators.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {indicators.map((ind, i) => (
            <span key={i} className="rounded bg-slate-50 px-1.5 py-0.5 text-xs text-slate-600">
              {ind.icon} {ind.label}
            </span>
          ))}
        </div>
      )}

      {/* Issue reported */}
      {stop.issue_reported && (
        <div className="mt-2 rounded bg-red-50 px-2 py-1 text-xs text-red-600">
          Issue: {stop.issue_reported}
        </div>
      )}
    </button>
  );
}

function formatTimeWindow(start, end) {
  if (!start && !end) return null;
  const fmt = (t) => {
    if (!t) return '';
    // Handle TIME format (HH:MM:SS) or full timestamp
    const d = t.includes('T') ? new Date(t) : new Date(`2000-01-01T${t}`);
    return d.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
  };
  if (start && end) return `${fmt(start)} – ${fmt(end)}`;
  if (start) return `From ${fmt(start)}`;
  return `Until ${fmt(end)}`;
}

function formatTime(t) {
  if (!t) return null;
  const d = t.includes('T') ? new Date(t) : new Date(`2000-01-01T${t}`);
  return d.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
}

function mapBookingStatus(bookingStatus) {
  const map = {
    pending: 'pending', scheduled: 'pending', confirmed: 'pending',
    in_transit: 'approaching', delivered: 'completed',
    failed: 'failed', cancelled: 'skipped', rescheduled: 'skipped',
  };
  return map[bookingStatus] || 'pending';
}
