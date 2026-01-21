/**
 * Activity Routes
 *
 * API endpoints for quote activity tracking and timeline.
 */

const express = require('express');
const router = express.Router();
const { authenticate } = require('../middleware/auth');

module.exports = function(pool) {
  const ActivityService = require('../services/ActivityService');
  const activityService = new ActivityService(pool);

  // Helper for async route handlers
  const asyncHandler = fn => (req, res, next) =>
    Promise.resolve(fn(req, res, next)).catch(next);

  // ============================================
  // QUOTE-SPECIFIC ACTIVITIES
  // ============================================

  /**
   * GET /api/activities/quote/:quoteId
   * Get all activities for a specific quote
   */
  router.get('/quote/:quoteId', authenticate, asyncHandler(async (req, res) => {
    const { quoteId } = req.params;
    const {
      limit = 50,
      offset = 0,
      category,
      eventType,
      includeInternal = 'true'
    } = req.query;

    const activities = await activityService.getActivities(quoteId, {
      limit: parseInt(limit),
      offset: parseInt(offset),
      category,
      eventType,
      includeInternal: includeInternal === 'true'
    });

    res.json({
      success: true,
      activities,
      pagination: {
        limit: parseInt(limit),
        offset: parseInt(offset)
      }
    });
  }));

  /**
   * GET /api/activities/quote/:quoteId/summary
   * Get activity summary for a quote
   */
  router.get('/quote/:quoteId/summary', authenticate, asyncHandler(async (req, res) => {
    const { quoteId } = req.params;

    const [summary, count] = await Promise.all([
      activityService.getActivitySummary(quoteId),
      activityService.getActivityCount(quoteId)
    ]);

    res.json({
      success: true,
      summary: {
        ...summary,
        total: count
      }
    });
  }));

  /**
   * POST /api/activities/quote/:quoteId/note
   * Add a note to quote activity
   */
  router.post('/quote/:quoteId/note', authenticate, asyncHandler(async (req, res) => {
    const { quoteId } = req.params;
    const {
      note,
      isInternal = true,
      userName = 'User'
    } = req.body;

    if (!note || !note.trim()) {
      return res.status(400).json({
        success: false,
        error: 'Note content is required'
      });
    }

    const activity = await activityService.logNoteAdded(
      quoteId,
      note.trim(),
      isInternal,
      userName
    );

    res.status(201).json({
      success: true,
      activity
    });
  }));

  /**
   * POST /api/activities/quote/:quoteId/contact
   * Log customer contact activity
   */
  router.post('/quote/:quoteId/contact', authenticate, asyncHandler(async (req, res) => {
    const { quoteId } = req.params;
    const {
      contactMethod,
      notes = '',
      userName = 'User'
    } = req.body;

    const validMethods = ['phone', 'email', 'in-person', 'video-call', 'text', 'other'];
    if (!contactMethod || !validMethods.includes(contactMethod.toLowerCase())) {
      return res.status(400).json({
        success: false,
        error: `Contact method is required. Valid methods: ${validMethods.join(', ')}`
      });
    }

    const activity = await activityService.logCustomerContacted(
      quoteId,
      contactMethod,
      notes,
      userName
    );

    res.status(201).json({
      success: true,
      activity
    });
  }));

  /**
   * POST /api/activities/quote/:quoteId/follow-up
   * Schedule a follow-up activity
   */
  router.post('/quote/:quoteId/follow-up', authenticate, asyncHandler(async (req, res) => {
    const { quoteId } = req.params;
    const {
      followUpDate,
      description,
      userName = 'User'
    } = req.body;

    if (!followUpDate) {
      return res.status(400).json({
        success: false,
        error: 'Follow-up date is required'
      });
    }

    const activity = await activityService.logFollowUpScheduled(
      quoteId,
      followUpDate,
      description || 'Follow-up scheduled',
      userName
    );

    res.status(201).json({
      success: true,
      activity
    });
  }));

  /**
   * POST /api/activities/quote/:quoteId/price-adjustment
   * Log a price adjustment
   */
  router.post('/quote/:quoteId/price-adjustment', authenticate, asyncHandler(async (req, res) => {
    const { quoteId } = req.params;
    const {
      itemModel,
      oldPriceCents,
      newPriceCents,
      reason = '',
      userName = 'User'
    } = req.body;

    if (!itemModel || oldPriceCents === undefined || newPriceCents === undefined) {
      return res.status(400).json({
        success: false,
        error: 'Item model, old price, and new price are required'
      });
    }

    const activity = await activityService.logPriceAdjusted(
      quoteId,
      itemModel,
      oldPriceCents,
      newPriceCents,
      reason,
      userName
    );

    res.status(201).json({
      success: true,
      activity
    });
  }));

  /**
   * POST /api/activities/quote/:quoteId/customer-viewed
   * Log when customer views the quote (for tracking)
   */
  router.post('/quote/:quoteId/customer-viewed', authenticate, asyncHandler(async (req, res) => {
    const { quoteId } = req.params;
    const { customerName = 'Customer' } = req.body;
    const ipAddress = req.ip || req.connection.remoteAddress;

    const activity = await activityService.logCustomerViewed(
      quoteId,
      customerName,
      ipAddress
    );

    res.status(201).json({
      success: true,
      activity
    });
  }));

  // ============================================
  // GLOBAL ACTIVITY FEED
  // ============================================

  /**
   * GET /api/activities/recent
   * Get recent activities across all quotes
   */
  router.get('/recent', authenticate, asyncHandler(async (req, res) => {
    const { limit = 20, category, userId } = req.query;

    const activities = await activityService.getRecentActivities(
      parseInt(limit),
      { category, userId: userId ? parseInt(userId) : null }
    );

    res.json({
      success: true,
      activities
    });
  }));

  /**
   * GET /api/activities/types
   * Get all available activity types
   */
  router.get('/types', authenticate, (req, res) => {
    res.json({
      success: true,
      types: ActivityService.TYPES,
      categories: ActivityService.CATEGORIES
    });
  });

  // ============================================
  // ACTIVITY ICONS (for frontend reference)
  // ============================================

  /**
   * GET /api/activities/icons
   * Get icon mapping for all activity types
   */
  router.get('/icons', authenticate, (req, res) => {
    const icons = {};
    Object.keys(ActivityService.TYPES).forEach(type => {
      icons[type] = ActivityService.getIconForType(type);
    });

    res.json({
      success: true,
      icons
    });
  });

  return router;
};
