export default function RouteHeader({ route, summary }) {
  const today = new Date();
  const dateStr = today.toLocaleDateString('en-CA', {
    weekday: 'long',
    month: 'long',
    day: 'numeric',
  });

  const statusLabel = route
    ? { planned: 'Planned', optimized: 'Optimized', assigned: 'Assigned', in_progress: 'In Progress', completed: 'Completed' }[route.status] || route.status
    : null;

  return (
    <div className="mb-4">
      <p className="text-xs font-medium uppercase text-slate-400">{dateStr}</p>
      <div className="mt-1 flex items-center justify-between">
        <h1 className="text-xl font-bold text-slate-900">
          {route ? `Route ${route.route_number}` : "Today's Deliveries"}
        </h1>
        {statusLabel && (
          <span className={`rounded-full px-2.5 py-0.5 text-xs font-medium ${
            route.status === 'in_progress' ? 'bg-green-100 text-green-700'
              : route.status === 'completed' ? 'bg-slate-100 text-slate-600'
              : 'bg-blue-100 text-blue-700'
          }`}>
            {statusLabel}
          </span>
        )}
      </div>

      {/* Summary row */}
      <div className="mt-2 flex gap-4 text-sm text-slate-500">
        <span>{summary.total} stop{summary.total !== 1 ? 's' : ''}</span>
        <span className="text-slate-300">|</span>
        <span className="text-green-600">{summary.completed} done</span>
        <span className="text-slate-300">|</span>
        <span className={summary.remaining > 0 ? 'text-amber-600' : 'text-slate-400'}>
          {summary.remaining} left
        </span>
        {summary.failed > 0 && (
          <>
            <span className="text-slate-300">|</span>
            <span className="text-red-600">{summary.failed} failed</span>
          </>
        )}
      </div>

      {/* Estimated completion */}
      {route?.estimated_duration_minutes && route.status !== 'completed' && (
        <p className="mt-1 text-xs text-slate-400">
          Est. {formatDuration(route.estimated_duration_minutes)} remaining
          {route.total_distance_km && ` — ${route.total_distance_km} km`}
        </p>
      )}
    </div>
  );
}

function formatDuration(mins) {
  if (!mins) return '';
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  if (h > 0 && m > 0) return `${h}h ${m}m`;
  if (h > 0) return `${h}h`;
  return `${m}m`;
}
