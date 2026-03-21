import { RefreshCw } from 'lucide-react';

/**
 * TeleTime POS - Pending Sync Badge
 * Shows count of offline transactions waiting to sync
 */

export function PendingSyncBadge({ count = 0, isSyncing = false }) {
  if (count === 0 && !isSyncing) return null;

  return (
    <div className="flex items-center gap-1.5 px-2 py-1 bg-amber-500/20 rounded-lg">
      {isSyncing ? (
        <RefreshCw className="w-3.5 h-3.5 text-amber-400 animate-spin" />
      ) : (
        <div className="w-3.5 h-3.5 flex items-center justify-center">
          <div className="w-2 h-2 rounded-full bg-amber-400" />
        </div>
      )}
      <span className="text-xs font-medium text-amber-400">
        {count} pending
      </span>
    </div>
  );
}

export default PendingSyncBadge;
