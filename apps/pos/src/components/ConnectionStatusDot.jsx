/**
 * TeleTime POS - Connection Status Dot
 * Small indicator: green=online, amber=reconnecting, red=offline
 */

export function ConnectionStatusDot({ status, showLabel = true }) {
  const config = {
    connected: {
      dotClass: 'bg-green-500',
      label: 'Online',
    },
    reconnecting: {
      dotClass: 'bg-amber-500 animate-pulse',
      label: 'Reconnecting...',
    },
    disconnected: {
      dotClass: 'bg-red-500',
      label: 'Offline',
    },
  };

  const { dotClass, label } = config[status] || config.disconnected;

  return (
    <div className="flex items-center gap-1.5">
      <div className={`w-2.5 h-2.5 rounded-full ${dotClass}`} />
      {showLabel && (
        <span className="text-xs text-slate-400">{label}</span>
      )}
    </div>
  );
}

export default ConnectionStatusDot;
