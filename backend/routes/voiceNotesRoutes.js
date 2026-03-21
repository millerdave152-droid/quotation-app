'use strict';

/**
 * Voice Notes Routes
 *
 * POST /api/notes/voice           — Upload + transcribe + structure
 * GET  /api/notes/customer/:id    — Customer note history
 * GET  /api/notes/action-items    — Follow-up items for current user
 */

const express = require('express');
const router = express.Router();
const multer = require('multer');
const { ApiError, asyncHandler } = require('../middleware/errorHandler');
const { authenticate, requirePermission } = require('../middleware/auth');

// Multer config: memory storage, 25 MB limit, audio mimetypes only
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 25 * 1024 * 1024 }, // 25 MB — Whisper limit
  fileFilter(req, file, cb) {
    if (/^audio\/(webm|mp4|wav|mpeg|ogg)$/.test(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error('Only audio files (webm, mp4, wav, mpeg, ogg) are accepted'));
    }
  },
});

let voiceNotesService = null;

// ============================================================================
// POST /api/notes/voice
// ============================================================================

router.post(
  '/voice',
  authenticate,
  requirePermission('customer_notes.voice'),
  upload.single('audio'),
  asyncHandler(async (req, res) => {
    if (!req.file) {
      throw ApiError.badRequest('Audio file is required (field name: audio)');
    }

    const { customerId, surface, contextNote } = req.body;
    if (!customerId) throw ApiError.badRequest('customerId is required');
    if (!surface) throw ApiError.badRequest('surface is required (pos or quotation)');

    try {
      const result = await voiceNotesService.processVoiceNote(
        req.file.buffer,
        req.file.mimetype,
        parseInt(customerId),
        req.user.id,
        { surface, contextNote: contextNote || undefined }
      );
      res.status(201).json({ success: true, data: result });
    } catch (err) {
      if (err.code === 'TRANSCRIPTION_EMPTY') {
        return res.status(422).json({
          success: false,
          error: { code: 'TRANSCRIPTION_EMPTY', message: err.message },
        });
      }
      if (err.code === 'OPENAI_NOT_CONFIGURED') {
        throw ApiError.badRequest(err.message);
      }
      if (err.code === 'ANTHROPIC_NOT_CONFIGURED') {
        throw ApiError.badRequest(err.message);
      }
      throw err;
    }
  })
);

// ============================================================================
// GET /api/notes/customer/:customerId
// ============================================================================

router.get(
  '/customer/:customerId',
  authenticate,
  requirePermission('customer_notes.view'),
  asyncHandler(async (req, res) => {
    const customerId = parseInt(req.params.customerId);
    if (isNaN(customerId)) throw ApiError.badRequest('Customer ID must be an integer');

    const { source, tags, sentiment, fromDate, toDate } = req.query;
    const filters = {};
    if (source) filters.source = source;
    if (tags) filters.tags = tags.split(',').map(t => t.trim());
    if (sentiment) filters.sentiment = sentiment;
    if (fromDate) filters.fromDate = fromDate;
    if (toDate) filters.toDate = toDate;

    const notes = await voiceNotesService.getCustomerNoteHistory(customerId, filters);
    res.json({ success: true, data: notes });
  })
);

// ============================================================================
// GET /api/notes/action-items
// ============================================================================

router.get(
  '/action-items',
  authenticate,
  asyncHandler(async (req, res) => {
    const daysAhead = req.query.daysAhead ? parseInt(req.query.daysAhead) : 7;
    const items = await voiceNotesService.getActionItemsDue(req.user.id, daysAhead);
    res.json({ success: true, data: items });
  })
);

// ============================================================================
// INIT
// ============================================================================

const init = (deps) => {
  voiceNotesService = deps.voiceNotesService;
  return router;
};

module.exports = { init };
