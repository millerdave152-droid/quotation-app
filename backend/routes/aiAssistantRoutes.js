'use strict';

/**
 * AI Business Assistant Routes
 *
 * Session-based conversational assistant with tool use.
 * All routes require authentication. Users can only access
 * their own sessions.
 *
 * Base path: /api/assistant
 */

const express = require('express');
const router = express.Router();
const rateLimit = require('express-rate-limit');
const { authenticate } = require('../middleware/auth');
const { asyncHandler } = require('../middleware/errorHandler');
const aiAssistantService = require('../services/aiAssistantService');

// ── Rate limiter: 20 messages/min per user ──────────────────────

const messageLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 20,
  keyGenerator: (req) => req.user?.id?.toString() || 'anon',
  standardHeaders: true,
  legacyHeaders: false,
  message: { success: false, message: 'Too many requests. Please wait a moment.' },
});

router.use(authenticate);

// ── POST /sessions — Create a new session ───────────────────────

router.post('/sessions', asyncHandler(async (req, res) => {
  const { surface, locationId, context } = req.body;

  if (!surface || !['pos', 'quotation', 'backoffice'].includes(surface)) {
    return res.status(400).json({ success: false, message: 'Valid surface required (pos, quotation, backoffice).' });
  }

  const session = await aiAssistantService.createSession(
    req.user.id, surface, locationId || null, context || {}
  );

  res.status(201).json({ success: true, data: { sessionId: session.id } });
}));

// ── POST /sessions/:id/message — Send a message ────────────────

router.post('/sessions/:id/message', messageLimiter, asyncHandler(async (req, res) => {
  const sessionId = parseInt(req.params.id);
  const { message } = req.body;

  if (!message || typeof message !== 'string' || !message.trim()) {
    return res.status(400).json({ success: false, message: 'Message is required.' });
  }
  if (message.length > 2000) {
    return res.status(400).json({ success: false, message: 'Message too long (max 2000 chars).' });
  }

  const userContext = {
    userId: req.user.id,
    locationId: req.body.locationId || null,
    role: req.user.role,
    surface: req.body.surface || 'quotation',
  };

  const result = await aiAssistantService.sendMessage(sessionId, message.trim(), userContext);

  res.json({ success: true, data: result });
}));

// ── GET /sessions — List active sessions ────────────────────────

router.get('/sessions', asyncHandler(async (req, res) => {
  const sessions = await aiAssistantService.getActiveSessions(
    req.user.id, req.query.surface || null
  );
  res.json({ success: true, data: sessions });
}));

// ── GET /sessions/:id — Get session with history ────────────────

router.get('/sessions/:id', asyncHandler(async (req, res) => {
  const sessionId = parseInt(req.params.id);
  const session = await aiAssistantService.getSession(sessionId, req.user.id);
  const history = await aiAssistantService.loadHistory(sessionId);

  res.json({
    success: true,
    data: { session, messages: history },
  });
}));

// ── DELETE /sessions/:id — End a session ────────────────────────

router.delete('/sessions/:id', asyncHandler(async (req, res) => {
  const sessionId = parseInt(req.params.id);
  await aiAssistantService.endSession(sessionId, req.user.id);
  res.json({ success: true });
}));

module.exports = router;
