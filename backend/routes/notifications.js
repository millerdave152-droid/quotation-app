/**
 * Notification Routes
 * API endpoints for in-app notifications
 */

const express = require('express');
const router = express.Router();
const NotificationService = require('../services/NotificationService');
const db = require('../config/database');
const { authenticate } = require('../middleware/auth');
const { ApiError, asyncHandler } = require('../middleware/errorHandler');

// Initialize service
const notificationService = new NotificationService(db);

/**
 * @route   GET /api/notifications
 * @desc    Get user's notifications
 * @access  Private
 */
router.get('/', authenticate, asyncHandler(async (req, res) => {
  const { unreadOnly, limit = 50, offset = 0 } = req.query;

  const notifications = await notificationService.getUserNotifications(
    req.user.id,
    {
      limit: parseInt(limit),
      offset: parseInt(offset),
      unreadOnly: unreadOnly === 'true'
    }
  );

  res.json({
    success: true,
    data: { notifications }
  });
}));

/**
 * @route   GET /api/notifications/unread-count
 * @desc    Get unread notification count (for polling)
 * @access  Private
 */
router.get('/unread-count', authenticate, asyncHandler(async (req, res) => {
  const count = await notificationService.getUnreadCount(req.user.id);

  res.json({
    success: true,
    data: { count }
  });
}));

/**
 * @route   POST /api/notifications/:id/read
 * @desc    Mark a notification as read
 * @access  Private
 */
router.post('/:id/read', authenticate, asyncHandler(async (req, res) => {
  const notificationId = parseInt(req.params.id);
  const success = await notificationService.markAsRead(notificationId, req.user.id);

  if (!success) {
    throw ApiError.notFound('Notification');
  }

  res.json({
    success: true,
    message: 'Notification marked as read'
  });
}));

/**
 * @route   POST /api/notifications/mark-all-read
 * @desc    Mark all notifications as read
 * @access  Private
 */
router.post('/mark-all-read', authenticate, asyncHandler(async (req, res) => {
  const count = await notificationService.markAllAsRead(req.user.id);

  res.json({
    success: true,
    message: `${count} notifications marked as read`,
    data: { count }
  });
}));

/**
 * @route   DELETE /api/notifications/:id
 * @desc    Delete a notification
 * @access  Private
 */
router.delete('/:id', authenticate, asyncHandler(async (req, res) => {
  const notificationId = parseInt(req.params.id);

  const result = await db.query(
    'DELETE FROM user_notifications WHERE id = $1 AND user_id = $2 RETURNING id',
    [notificationId, req.user.id]
  );

  if (result.rows.length === 0) {
    throw ApiError.notFound('Notification');
  }

  res.json({
    success: true,
    message: 'Notification deleted'
  });
}));

module.exports = router;
