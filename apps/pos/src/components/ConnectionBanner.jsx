/**
 * TeleTime POS - Connection Banner
 *
 * Renders above the Header in POSMain to indicate offline/reconnecting state.
 * Accepts optional pendingCount to show offline transaction queue status.
 */

import { ExclamationTriangleIcon, ArrowPathIcon } from '@heroicons/react/24/outline';

export function ConnectionBanner({ status, pendingCount = 0 }) {
  if (status === 'connected') return null;

  if (status === 'reconnecting') {
    return (
      <div className="flex items-center justify-center gap-2 px-4 py-1.5 bg-amber-500 text-white text-sm font-medium">
        <ArrowPathIcon className="w-4 h-4 animate-spin" />
        <span>Reconnecting to server...</span>
        {pendingCount > 0 && (
          <span className="ml-2 px-2 py-0.5 bg-white/20 rounded-full text-xs font-bold">
            {pendingCount} pending
          </span>
        )}
      </div>
    );
  }

  // disconnected
  return (
    <div className="flex items-center justify-center gap-2 px-4 py-1.5 bg-red-600 text-white text-sm font-medium">
      <ExclamationTriangleIcon className="w-4 h-4" />
      <span>Offline mode — transactions will be saved locally and synced when connection returns</span>
      {pendingCount > 0 && (
        <span className="ml-2 px-2 py-0.5 bg-white/20 rounded-full text-xs font-bold">
          {pendingCount} pending
        </span>
      )}
    </div>
  );
}

export default ConnectionBanner;
