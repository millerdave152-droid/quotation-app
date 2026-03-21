/**
 * NotificationBell — Header component for in-app notifications.
 *
 * Features:
 * - Polls unread count every 30 seconds
 * - Badge with unread count
 * - Popover dropdown with notification list
 * - Mark individual / all as read
 * - Click notification → navigate to action_url
 */

import { useState, useEffect, useCallback, useRef } from 'react';
import {
  Badge,
  IconButton,
  Popover,
  Box,
  Typography,
  Button,
  Divider,
  List,
  ListItemButton,
  ListItemIcon,
  ListItemText,
  CircularProgress,
  Chip,
  Tooltip,
} from '@mui/material';
import {
  Bell,
  BellDot,
  Check,
  CheckCheck,
  FileText,
  ArrowRight,
  MessageSquare,
  AlertCircle,
  Star,
} from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import apiClient from '../../services/apiClient';

const POLL_INTERVAL = 300_000; // 5 minutes

/** Map notification_type → lucide icon + color */
const TYPE_CONFIG = {
  quote_followup:       { Icon: FileText,       color: '#8b5cf6' },
  approval_request:     { Icon: AlertCircle,     color: '#f59e0b' },
  approval_approved:    { Icon: Check,           color: '#10b981' },
  approval_rejected:    { Icon: AlertCircle,     color: '#ef4444' },
  counter_offer:        { Icon: MessageSquare,   color: '#3b82f6' },
  counter_offer_pending:{ Icon: MessageSquare,   color: '#f59e0b' },
  quote_won:            { Icon: Star,            color: '#10b981' },
  quote_lost:           { Icon: AlertCircle,     color: '#ef4444' },
  quote_sent:           { Icon: FileText,        color: '#3b82f6' },
};

const DEFAULT_TYPE_CONFIG = { Icon: Bell, color: '#6b7280' };

export default function NotificationBell() {
  const navigate = useNavigate();
  const [anchorEl, setAnchorEl] = useState(null);
  const [unreadCount, setUnreadCount] = useState(0);
  const [notifications, setNotifications] = useState([]);
  const [loading, setLoading] = useState(false);
  const [markingAll, setMarkingAll] = useState(false);
  const pollRef = useRef(null);

  // ── Poll unread count ────────────────────────────────
  const fetchUnreadCount = useCallback(async () => {
    try {
      const { data } = await apiClient.get('/api/notifications/unread-count');
      setUnreadCount(data.data?.count || 0);
    } catch {
      // silent — background poll
    }
  }, []);

  useEffect(() => {
    fetchUnreadCount();
    pollRef.current = setInterval(fetchUnreadCount, POLL_INTERVAL);
    return () => clearInterval(pollRef.current);
  }, [fetchUnreadCount]);

  // ── Fetch notifications when popover opens ───────────
  const fetchNotifications = useCallback(async () => {
    setLoading(true);
    try {
      const { data } = await apiClient.get('/api/notifications', {
        params: { limit: 20 },
      });
      setNotifications(data.data?.notifications || []);
    } catch {
      setNotifications([]);
    } finally {
      setLoading(false);
    }
  }, []);

  const handleOpen = (e) => {
    setAnchorEl(e.currentTarget);
    fetchNotifications();
  };

  const handleClose = () => setAnchorEl(null);
  const open = Boolean(anchorEl);

  // ── Mark single as read ──────────────────────────────
  const markRead = async (id) => {
    try {
      await apiClient.post(`/api/notifications/${id}/read`);
      setNotifications((prev) =>
        prev.map((n) => (n.id === id ? { ...n, is_read: true, read_at: new Date() } : n))
      );
      setUnreadCount((c) => Math.max(0, c - 1));
    } catch {
      // ignore
    }
  };

  // ── Mark all as read ─────────────────────────────────
  const markAllRead = async () => {
    setMarkingAll(true);
    try {
      await apiClient.post('/api/notifications/mark-all-read');
      setNotifications((prev) =>
        prev.map((n) => ({ ...n, is_read: true, read_at: new Date() }))
      );
      setUnreadCount(0);
    } catch {
      // ignore
    } finally {
      setMarkingAll(false);
    }
  };

  // ── Click notification → navigate ────────────────────
  const handleClick = (notification) => {
    if (!notification.is_read) markRead(notification.id);
    if (notification.action_url) {
      handleClose();
      navigate(notification.action_url);
    }
  };

  // ── Format relative time ─────────────────────────────
  const relativeTime = (dateStr) => {
    const diff = Date.now() - new Date(dateStr).getTime();
    const mins = Math.floor(diff / 60_000);
    if (mins < 1) return 'just now';
    if (mins < 60) return `${mins}m ago`;
    const hrs = Math.floor(mins / 60);
    if (hrs < 24) return `${hrs}h ago`;
    const days = Math.floor(hrs / 24);
    if (days < 7) return `${days}d ago`;
    return new Date(dateStr).toLocaleDateString('en-CA');
  };

  // ── Priority chip ────────────────────────────────────
  const priorityChip = (priority) => {
    if (priority === 'high' || priority === 'urgent') {
      return (
        <Chip
          label={priority}
          size="small"
          sx={{
            height: 18,
            fontSize: 10,
            fontWeight: 700,
            bgcolor: priority === 'urgent' ? '#fef2f2' : '#fffbeb',
            color: priority === 'urgent' ? '#dc2626' : '#d97706',
            ml: 1,
          }}
        />
      );
    }
    return null;
  };

  return (
    <>
      <Tooltip title="Notifications">
        <IconButton
          onClick={handleOpen}
          size="small"
          sx={{ color: 'inherit' }}
        >
          <Badge
            badgeContent={unreadCount}
            color="error"
            max={99}
            invisible={unreadCount === 0}
          >
            {unreadCount > 0 ? <BellDot size={22} /> : <Bell size={22} />}
          </Badge>
        </IconButton>
      </Tooltip>

      <Popover
        open={open}
        anchorEl={anchorEl}
        onClose={handleClose}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'right' }}
        transformOrigin={{ vertical: 'top', horizontal: 'right' }}
        slotProps={{
          paper: {
            sx: {
              width: 380,
              maxHeight: 480,
              overflow: 'hidden',
              display: 'flex',
              flexDirection: 'column',
              borderRadius: 2,
              boxShadow: '0 10px 40px rgba(0,0,0,0.12)',
            },
          },
        }}
      >
        {/* Header */}
        <Box
          sx={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            px: 2,
            py: 1.5,
            borderBottom: '1px solid',
            borderColor: 'divider',
          }}
        >
          <Typography variant="subtitle1" fontWeight={700}>
            Notifications
          </Typography>
          {unreadCount > 0 && (
            <Button
              size="small"
              startIcon={markingAll ? <CircularProgress size={14} /> : <CheckCheck size={14} />}
              onClick={markAllRead}
              disabled={markingAll}
              sx={{ textTransform: 'none', fontSize: 12 }}
            >
              Mark all read
            </Button>
          )}
        </Box>

        {/* List */}
        <Box sx={{ flex: 1, overflowY: 'auto' }}>
          {loading ? (
            <Box sx={{ display: 'flex', justifyContent: 'center', py: 4 }}>
              <CircularProgress size={28} />
            </Box>
          ) : notifications.length === 0 ? (
            <Box sx={{ textAlign: 'center', py: 4, color: 'text.secondary' }}>
              <Bell size={32} style={{ opacity: 0.3, marginBottom: 8 }} />
              <Typography variant="body2">No notifications</Typography>
            </Box>
          ) : (
            <List disablePadding>
              {notifications.map((n, idx) => {
                const { Icon, color } = TYPE_CONFIG[n.notification_type] || DEFAULT_TYPE_CONFIG;
                return (
                  <Box key={n.id}>
                    <ListItemButton
                      onClick={() => handleClick(n)}
                      sx={{
                        py: 1.5,
                        px: 2,
                        bgcolor: n.is_read ? 'transparent' : 'action.hover',
                        '&:hover': { bgcolor: 'action.selected' },
                        alignItems: 'flex-start',
                      }}
                    >
                      <ListItemIcon sx={{ minWidth: 36, mt: 0.5 }}>
                        <Icon size={18} style={{ color }} />
                      </ListItemIcon>
                      <ListItemText
                        primary={
                          <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                            <Typography
                              variant="body2"
                              fontWeight={n.is_read ? 400 : 600}
                              noWrap
                              sx={{ flex: 1 }}
                            >
                              {n.title}
                            </Typography>
                            {priorityChip(n.priority)}
                          </Box>
                        }
                        secondary={
                          <>
                            <Typography
                              component="span"
                              variant="caption"
                              color="text.secondary"
                              sx={{
                                display: '-webkit-box',
                                WebkitLineClamp: 2,
                                WebkitBoxOrient: 'vertical',
                                overflow: 'hidden',
                              }}
                            >
                              {n.message}
                            </Typography>
                            <Typography
                              component="span"
                              variant="caption"
                              color="text.disabled"
                              sx={{ display: 'block', mt: 0.25, fontSize: 11 }}
                            >
                              {relativeTime(n.created_at)}
                            </Typography>
                          </>
                        }
                      />
                      {n.action_url && (
                        <ArrowRight size={14} style={{ color: '#9ca3af', marginTop: 6, flexShrink: 0 }} />
                      )}
                    </ListItemButton>
                    {idx < notifications.length - 1 && <Divider />}
                  </Box>
                );
              })}
            </List>
          )}
        </Box>

        {/* Footer */}
        {notifications.length > 0 && (
          <Box
            sx={{
              borderTop: '1px solid',
              borderColor: 'divider',
              px: 2,
              py: 1,
              textAlign: 'center',
            }}
          >
            <Button
              size="small"
              onClick={() => {
                handleClose();
                navigate('/notifications');
              }}
              sx={{ textTransform: 'none', fontSize: 12 }}
            >
              View all notifications
            </Button>
          </Box>
        )}
      </Popover>
    </>
  );
}
