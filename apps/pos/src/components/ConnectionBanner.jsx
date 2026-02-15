/**
 * TeleTime POS - Connection Banner
 *
 * Renders above the Header in POSMain to indicate offline/reconnecting state.
 */

import { ExclamationTriangleIcon, ArrowPathIcon } from '@heroicons/react/24/outline';

export function ConnectionBanner({ status }) {
  if (status === 'connected') return null;

  if (status === 'reconnecting') {
    return (
      <div className="flex items-center justify-center gap-2 px-4 py-1.5 bg-amber-500 text-white text-sm font-medium">
        <ArrowPathIcon className="w-4 h-4 animate-spin" />
        <span>Reconnecting to server...</span>
      </div>
    );
  }

  // disconnected
  return (
    <div className="flex items-center justify-center gap-2 px-4 py-1.5 bg-red-600 text-white text-sm font-medium">
      <ExclamationTriangleIcon className="w-4 h-4" />
      <span>Offline mode — remote approvals unavailable, PIN override only</span>
    </div>
  );
}

export default ConnectionBanner;
