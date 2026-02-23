/**
 * Relative time formatting utility
 * Converts ISO timestamps to human-readable relative time strings
 */

const MINUTE = 60 * 1000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;

export function getRelativeTime(isoString) {
  if (!isoString) return '';

  const date = new Date(isoString);
  const now = Date.now();
  const diff = now - date.getTime();

  if (diff < MINUTE) return 'just now';
  if (diff < 2 * MINUTE) return '1 minute ago';
  if (diff < HOUR) return `${Math.floor(diff / MINUTE)} minutes ago`;
  if (diff < 2 * HOUR) return '1 hour ago';
  if (diff < DAY) return `${Math.floor(diff / HOUR)} hours ago`;
  if (diff < 2 * DAY) return '1 day ago';
  return `${Math.floor(diff / DAY)} days ago`;
}
