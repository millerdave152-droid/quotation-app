/**
 * NotificationBell — POS header bell icon with unread badge & dropdown.
 *
 * Tailwind + heroicons version for the POS app.
 * Polls unread count every 30 seconds, shows a dropdown list of
 * recent notifications, mark individual / all as read.
 */

import { useState, useEffect, useCallback, useRef } from 'react';
import api from '../../api/axios';
import { AlertCircle, Bell, BellRing, Check, CheckCircle, ChevronRight, FileText, MessageSquare, Star, X } from 'lucide-react';

const POLL_INTERVAL = 300_000; // 5 minutes

/** Map notification_type → icon component + color */
const TYPE_ICONS = {
  quote_followup:        { Icon: FileText,       color: 'text-violet-500' },
  approval_request:      { Icon: AlertCircle,  color: 'text-amber-500' },
  approval_approved:     { Icon: CheckCircle,        color: 'text-emerald-500' },
  approval_rejected:     { Icon: AlertCircle,  color: 'text-red-500' },
  counter_offer:         { Icon: MessageSquare,     color: 'text-blue-500' },
  counter_offer_pending: { Icon: MessageSquare,     color: 'text-amber-500' },
  quote_won:             { Icon: Star,               color: 'text-emerald-500' },
  quote_lost:            { Icon: AlertCircle,  color: 'text-red-500' },
  quote_sent:            { Icon: FileText,       color: 'text-blue-500' },
};

const DEFAULT_ICON = { Icon: BellRing, color: 'text-gray-400' };

export default function NotificationBell() {
  const [open, setOpen] = useState(false);
  const [unreadCount, setUnreadCount] = useState(0);
  const [notifications, setNotifications] = useState([]);
  const [loading, setLoading] = useState(false);
  const [markingAll, setMarkingAll] = useState(false);
  const dropdownRef = useRef(null);
  const bellRef = useRef(null);

  // ── Close on outside click ──────────────────────────
  useEffect(() => {
    const handleClickOutside = (e) => {
      if (
        dropdownRef.current && !dropdownRef.current.contains(e.target) &&
        bellRef.current && !bellRef.current.contains(e.target)
      ) {
        setOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // ── Poll unread count ───────────────────────────────
  const fetchUnreadCount = useCallback(async () => {
    try {
      const { data } = await api.get('/notifications/unread-count');
      setUnreadCount(data.data?.count || 0);
    } catch {
      // silent
    }
  }, []);

  useEffect(() => {
    fetchUnreadCount();
    const timer = setInterval(fetchUnreadCount, POLL_INTERVAL);
    return () => clearInterval(timer);
  }, [fetchUnreadCount]);

  // ── Fetch list on open ──────────────────────────────
  const fetchNotifications = useCallback(async () => {
    setLoading(true);
    try {
      const { data } = await api.get('/notifications', { params: { limit: 20 } });
      setNotifications(data.data?.notifications || []);
    } catch {
      setNotifications([]);
    } finally {
      setLoading(false);
    }
  }, []);

  const toggleOpen = () => {
    const next = !open;
    setOpen(next);
    if (next) fetchNotifications();
  };

  // ── Mark single ─────────────────────────────────────
  const markRead = async (id) => {
    try {
      await api.post(`/notifications/${id}/read`);
      setNotifications((prev) =>
        prev.map((n) => (n.id === id ? { ...n, is_read: true } : n))
      );
      setUnreadCount((c) => Math.max(0, c - 1));
    } catch { /* ignore */ }
  };

  // ── Mark all ────────────────────────────────────────
  const markAllRead = async () => {
    setMarkingAll(true);
    try {
      await api.post('/notifications/mark-all-read');
      setNotifications((prev) => prev.map((n) => ({ ...n, is_read: true })));
      setUnreadCount(0);
    } catch { /* ignore */ }
    finally { setMarkingAll(false); }
  };

  // ── Click notification ──────────────────────────────
  const handleClick = (n) => {
    if (!n.is_read) markRead(n.id);
    if (n.action_url) {
      setOpen(false);
      // POS uses hash router or direct location
      window.location.href = n.action_url;
    }
  };

  // ── Relative time ───────────────────────────────────
  const relativeTime = (dateStr) => {
    const diff = Date.now() - new Date(dateStr).getTime();
    const mins = Math.floor(diff / 60_000);
    if (mins < 1) return 'just now';
    if (mins < 60) return `${mins}m`;
    const hrs = Math.floor(mins / 60);
    if (hrs < 24) return `${hrs}h`;
    const days = Math.floor(hrs / 24);
    if (days < 7) return `${days}d`;
    return new Date(dateStr).toLocaleDateString('en-CA');
  };

  return (
    <div className="relative">
      {/* Bell Button */}
      <button
        ref={bellRef}
        type="button"
        onClick={toggleOpen}
        className="relative p-2 text-gray-500 hover:text-gray-700 hover:bg-gray-100 rounded-full transition-colors"
        aria-label="Notifications"
      >
        {unreadCount > 0 ? (
          <BellRing className="w-6 h-6" />
        ) : (
          <Bell className="w-6 h-6" />
        )}

        {/* Badge */}
        {unreadCount > 0 && (
          <span className="
            absolute -top-0.5 -right-0.5
            min-w-[18px] h-[18px]
            flex items-center justify-center
            bg-red-500 text-white
            text-[10px] font-bold
            rounded-full px-1
            ring-2 ring-white
          ">
            {unreadCount > 99 ? '99+' : unreadCount}
          </span>
        )}
      </button>

      {/* Dropdown */}
      {open && (
        <div
          ref={dropdownRef}
          className="
            absolute right-0 mt-2 z-50
            w-[360px] max-h-[420px]
            bg-white rounded-xl
            border border-gray-200
            shadow-xl
            flex flex-col
            overflow-hidden
          "
        >
          {/* Header */}
          <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100">
            <h3 className="text-sm font-bold text-gray-900">Notifications</h3>
            <div className="flex items-center gap-2">
              {unreadCount > 0 && (
                <button
                  type="button"
                  onClick={markAllRead}
                  disabled={markingAll}
                  className="text-xs text-indigo-600 hover:text-indigo-800 font-medium flex items-center gap-1 disabled:opacity-50"
                >
                  <Check className="w-3.5 h-3.5" />
                  Mark all read
                </button>
              )}
              <button
                type="button"
                onClick={() => setOpen(false)}
                className="text-gray-400 hover:text-gray-600"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          </div>

          {/* List */}
          <div className="flex-1 overflow-y-auto">
            {loading ? (
              <div className="flex justify-center py-8">
                <div className="w-6 h-6 border-2 border-indigo-200 border-t-indigo-600 rounded-full animate-spin" />
              </div>
            ) : notifications.length === 0 ? (
              <div className="text-center py-8 text-gray-400">
                <Bell className="w-8 h-8 mx-auto mb-2 opacity-30" />
                <p className="text-sm">No notifications</p>
              </div>
            ) : (
              <ul className="divide-y divide-gray-50">
                {notifications.map((n) => {
                  const { Icon, color } = TYPE_ICONS[n.notification_type] || DEFAULT_ICON;
                  return (
                    <li key={n.id}>
                      <button
                        type="button"
                        onClick={() => handleClick(n)}
                        className={`
                          w-full text-left px-4 py-3
                          flex items-start gap-3
                          hover:bg-gray-50 transition-colors
                          ${!n.is_read ? 'bg-indigo-50/40' : ''}
                        `}
                      >
                        <Icon className={`w-5 h-5 mt-0.5 flex-shrink-0 ${color}`} />
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-1">
                            <span className={`text-sm truncate ${n.is_read ? 'text-gray-700' : 'font-semibold text-gray-900'}`}>
                              {n.title}
                            </span>
                            {(n.priority === 'high' || n.priority === 'urgent') && (
                              <span className={`
                                text-[10px] font-bold px-1.5 py-0.5 rounded-full
                                ${n.priority === 'urgent'
                                  ? 'bg-red-100 text-red-600'
                                  : 'bg-amber-100 text-amber-600'}
                              `}>
                                {n.priority}
                              </span>
                            )}
                          </div>
                          <p className="text-xs text-gray-500 line-clamp-2 mt-0.5">
                            {n.message}
                          </p>
                          <span className="text-[11px] text-gray-400 mt-0.5 block">
                            {relativeTime(n.created_at)}
                          </span>
                        </div>
                        {n.action_url && (
                          <ChevronRight className="w-4 h-4 text-gray-300 mt-1 flex-shrink-0" />
                        )}
                      </button>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
