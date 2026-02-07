export default function RouteProgress({ summary, route }) {
  const total = summary.total || 1;
  const completedPct = Math.round((summary.completed / total) * 100);
  const failedPct = Math.round((summary.failed / total) * 100);

  return (
    <div className="mb-4">
      {/* Bar */}
      <div className="flex h-2.5 overflow-hidden rounded-full bg-slate-100">
        {completedPct > 0 && (
          <div
            className="rounded-l-full bg-green-500 transition-all duration-500"
            style={{ width: `${completedPct}%` }}
          />
        )}
        {failedPct > 0 && (
          <div
            className="bg-red-400 transition-all duration-500"
            style={{ width: `${failedPct}%` }}
          />
        )}
      </div>

      {/* Labels */}
      <div className="mt-1.5 flex justify-between text-xs text-slate-500">
        <span>{completedPct}% complete</span>
        {route?.status === 'in_progress' && summary.remaining > 0 && (
          <span>{summary.remaining} remaining</span>
        )}
        {route?.status === 'completed' && (
          <span className="text-green-600">Route complete</span>
        )}
      </div>
    </div>
  );
}
