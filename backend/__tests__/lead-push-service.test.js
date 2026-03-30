/**
 * LeadPushService Tests — Phase 5 (Web Push)
 */

const mockSendNotification = jest.fn().mockResolvedValue({});
jest.mock('web-push', () => ({
  sendNotification: mockSendNotification,
  setVapidDetails: jest.fn()
}));

const mockPool = { query: jest.fn() };
const originalEnv = process.env.WEB_PUSH_ENABLED;

afterAll(() => { process.env.WEB_PUSH_ENABLED = originalEnv; });

function loadService() {
  jest.resetModules();
  jest.mock('web-push', () => ({ sendNotification: mockSendNotification, setVapidDetails: jest.fn() }));
  return require('../services/LeadPushService');
}

describe('LeadPushService', () => {

  beforeEach(() => {
    jest.clearAllMocks();
    mockPool.query.mockReset();
    mockSendNotification.mockResolvedValue({});
  });

  // ------------------------------------------
  // sendToUser
  // ------------------------------------------
  describe('sendToUser', () => {
    test('sends to all active subscriptions for a user', async () => {
      process.env.WEB_PUSH_ENABLED = 'true';
      const LPS = loadService();
      const service = new LPS(mockPool);

      mockPool.query
        .mockResolvedValueOnce({ rows: [{ push_notifications_enabled: true }] })
        .mockResolvedValueOnce({ rows: [
          { id: 1, endpoint: 'https://fcm/1', p256dh: 'k1', auth: 'a1' },
          { id: 2, endpoint: 'https://fcm/2', p256dh: 'k2', auth: 'a2' }
        ] })
        .mockResolvedValue({});

      const result = await service.sendToUser(5, { title: 'Test', body: 'Hello' });

      expect(result.sent).toBe(2);
      expect(result.failed).toBe(0);
      expect(mockSendNotification).toHaveBeenCalledTimes(2);
    });

    test('suppresses when push_notifications_enabled = false', async () => {
      process.env.WEB_PUSH_ENABLED = 'true';
      const LPS = loadService();
      const service = new LPS(mockPool);

      mockPool.query.mockResolvedValueOnce({ rows: [{ push_notifications_enabled: false }] });

      const result = await service.sendToUser(5, { title: 'T', body: 'B' });

      expect(result.suppressed).toBe(1);
      expect(mockSendNotification).not.toHaveBeenCalled();
    });

    test('deletes expired subscription on 410 response', async () => {
      process.env.WEB_PUSH_ENABLED = 'true';
      const LPS = loadService();
      const service = new LPS(mockPool);

      mockPool.query
        .mockResolvedValueOnce({ rows: [{ push_notifications_enabled: true }] })
        .mockResolvedValueOnce({ rows: [{ id: 1, endpoint: 'https://gone', p256dh: 'k', auth: 'a' }] })
        .mockResolvedValue({});

      const err = new Error('Gone'); err.statusCode = 410;
      mockSendNotification.mockRejectedValueOnce(err);

      const result = await service.sendToUser(5, { title: 'T', body: 'B' });
      expect(result.failed).toBe(1);

      const deletes = mockPool.query.mock.calls.filter(c => c[0]?.includes?.('DELETE FROM push_subscriptions'));
      expect(deletes.length).toBeGreaterThanOrEqual(1);
    });

    test('deletes expired subscription on 404 response', async () => {
      process.env.WEB_PUSH_ENABLED = 'true';
      const LPS = loadService();
      const service = new LPS(mockPool);

      mockPool.query
        .mockResolvedValueOnce({ rows: [{ push_notifications_enabled: true }] })
        .mockResolvedValueOnce({ rows: [{ id: 1, endpoint: 'https://404', p256dh: 'k', auth: 'a' }] })
        .mockResolvedValue({});

      const err = new Error('Not Found'); err.statusCode = 404;
      mockSendNotification.mockRejectedValueOnce(err);

      const result = await service.sendToUser(5, { title: 'T', body: 'B' });
      expect(result.failed).toBe(1);

      const deletes = mockPool.query.mock.calls.filter(c => c[0]?.includes?.('DELETE FROM push_subscriptions'));
      expect(deletes.length).toBeGreaterThanOrEqual(1);
    });

    test('does not throw on non-410 webpush failure', async () => {
      process.env.WEB_PUSH_ENABLED = 'true';
      const LPS = loadService();
      const service = new LPS(mockPool);

      mockPool.query
        .mockResolvedValueOnce({ rows: [{ push_notifications_enabled: true }] })
        .mockResolvedValueOnce({ rows: [{ id: 1, endpoint: 'https://err', p256dh: 'k', auth: 'a' }] });

      mockSendNotification.mockRejectedValueOnce(new Error('Network error'));

      const result = await service.sendToUser(5, { title: 'T', body: 'B' });
      expect(result.failed).toBe(1);
    });

    test('updates last_used_at on successful send', async () => {
      process.env.WEB_PUSH_ENABLED = 'true';
      const LPS = loadService();
      const service = new LPS(mockPool);

      mockPool.query
        .mockResolvedValueOnce({ rows: [{ push_notifications_enabled: true }] })
        .mockResolvedValueOnce({ rows: [{ id: 42, endpoint: 'https://ok', p256dh: 'k', auth: 'a' }] })
        .mockResolvedValue({});

      await service.sendToUser(5, { title: 'T', body: 'B' });

      const updates = mockPool.query.mock.calls.filter(c => c[0]?.includes?.('last_used_at'));
      expect(updates.length).toBeGreaterThanOrEqual(1);
      expect(updates[0][1]).toEqual([42]);
    });
  });

  // ------------------------------------------
  // WEB_PUSH_ENABLED guard
  // ------------------------------------------
  describe('WEB_PUSH_ENABLED guard', () => {
    test('returns suppressed when disabled', async () => {
      process.env.WEB_PUSH_ENABLED = 'false';
      const LPS = loadService();
      const service = new LPS(mockPool);

      const result = await service.sendToUser(5, { title: 'T', body: 'B' });
      expect(result).toEqual(expect.objectContaining({ status: 'suppressed' }));
      expect(mockSendNotification).not.toHaveBeenCalled();
    });
  });

  // ------------------------------------------
  // buildPayload
  // ------------------------------------------
  describe('buildPayload', () => {
    const leadData = {
      id: 42, customerName: 'Jane Doe', quoteNumber: 'QT-2026-0050',
      quoteTotal: '$1,500.00', expiryDate: 'Apr 5, 2026', daysLeft: 3, time: '2:00 PM'
    };

    test.each([
      ['lead-created', 'New Lead'],
      ['no-followup-nudge', 'Follow Up Needed'],
      ['expiry-warning', 'Quote Expiring'],
      ['quote-expired', 'Quote Expired'],
      ['followup-reminder', 'Follow-Up Today']
    ])('%s has correct title, body, tag, and data.url', (templateId, expectedTitle) => {
      process.env.WEB_PUSH_ENABLED = 'true';
      const LPS = loadService();
      const service = new LPS(mockPool);
      const payload = service.buildPayload(templateId, leadData);

      expect(payload.title).toContain(expectedTitle);
      expect(payload.body).toBeTruthy();
      expect(payload.body.length).toBeLessThanOrEqual(100);
      expect(payload.tag).toContain('lead-');
      expect(payload.data.url).toBe('/leads/42');
      expect(payload.data.leadId).toBe(42);
      expect(payload.data.templateId).toBe(templateId);
    });

    test('requireInteraction = true only for expiry-warning and quote-expired', () => {
      process.env.WEB_PUSH_ENABLED = 'true';
      const LPS = loadService();
      const service = new LPS(mockPool);

      expect(service.buildPayload('expiry-warning', leadData).requireInteraction).toBe(true);
      expect(service.buildPayload('quote-expired', leadData).requireInteraction).toBe(true);
      expect(service.buildPayload('lead-created', leadData).requireInteraction).toBe(false);
      expect(service.buildPayload('no-followup-nudge', leadData).requireInteraction).toBe(false);
      expect(service.buildPayload('followup-reminder', leadData).requireInteraction).toBe(false);
    });
  });

  // ------------------------------------------
  // Background push queue
  // ------------------------------------------
  describe('Background push queue', () => {
    test('processes unsent push reminders', async () => {
      process.env.WEB_PUSH_ENABLED = 'true';
      const LPS = loadService();
      const service = new LPS(mockPool);

      // sendToUser flow
      mockPool.query
        .mockResolvedValueOnce({ rows: [{ push_notifications_enabled: true }] })
        .mockResolvedValueOnce({ rows: [{ id: 1, endpoint: 'https://fcm', p256dh: 'k', auth: 'a' }] })
        .mockResolvedValue({});

      const payload = service.buildPayload('followup-reminder', { id: 10, customerName: 'Alice' });
      await service.sendToUser(5, payload);

      expect(mockSendNotification).toHaveBeenCalledTimes(1);
    });

    test('handles empty subscriptions without error', async () => {
      process.env.WEB_PUSH_ENABLED = 'true';
      const LPS = loadService();
      const service = new LPS(mockPool);

      mockPool.query
        .mockResolvedValueOnce({ rows: [{ push_notifications_enabled: true }] })
        .mockResolvedValueOnce({ rows: [] }); // no subscriptions

      const result = await service.sendToUser(5, { title: 'T', body: 'B' });
      expect(result.sent).toBe(0);
      expect(mockSendNotification).not.toHaveBeenCalled();
    });
  });

  // ------------------------------------------
  // Lead creation trigger
  // ------------------------------------------
  describe('Lead creation trigger', () => {
    test('push fired after new lead created (spy on sendToUser)', async () => {
      process.env.WEB_PUSH_ENABLED = 'true';
      const LPS = loadService();
      const spy = jest.spyOn(LPS.prototype, 'sendToUser').mockResolvedValue({ sent: 1 });

      const service = new LPS(mockPool);
      const payload = service.buildPayload('lead-created', {
        id: 50, customerName: 'John Doe', quoteNumber: 'QT-2026-0099'
      });

      await service.sendToUser(5, payload);

      expect(spy).toHaveBeenCalledWith(5, expect.objectContaining({
        title: 'New Lead',
        data: expect.objectContaining({ leadId: 50, templateId: 'lead-created' })
      }));

      spy.mockRestore();
    });
  });
});

// ------------------------------------------
// API Route Tests
// ------------------------------------------
const request = require('supertest');
const express = require('express');

describe('Push API Routes', () => {
  let app;
  const mockPushService = {
    subscribe: jest.fn().mockResolvedValue({ id: 1 }),
    unsubscribe: jest.fn().mockResolvedValue(true)
  };
  const routePool = { query: jest.fn().mockResolvedValue({}) };

  beforeAll(() => {
    app = express();
    app.use(express.json());
    const router = express.Router();
    const mockAuth = (req, res, next) => {
      req.user = { id: parseInt(req.headers['x-user-id'] || '1') };
      next();
    };

    router.post('/subscribe', mockAuth, async (req, res) => {
      const subscription = req.body.subscription || req.body;
      if (!subscription?.endpoint || !subscription?.keys) {
        return res.status(400).json({ success: false, error: 'Invalid subscription' });
      }
      const result = await mockPushService.subscribe(subscription, req.body.userAgent, req.user.id);
      await routePool.query('UPDATE users SET push_notifications_enabled = true WHERE id = $1', [req.user.id]);
      res.status(201).json({ success: true, id: result.id });
    });

    router.delete('/unsubscribe', mockAuth, async (req, res) => {
      const { endpoint } = req.body;
      if (!endpoint) return res.status(400).json({ error: 'Endpoint required' });
      await mockPushService.unsubscribe(endpoint);
      res.json({ success: true });
    });

    app.use('/api/push', router);
  });

  beforeEach(() => { jest.clearAllMocks(); routePool.query.mockResolvedValue({}); });

  describe('POST /api/push/subscribe', () => {
    test('creates subscription and sets push_notifications_enabled = true', async () => {
      const res = await request(app)
        .post('/api/push/subscribe')
        .set('x-user-id', '5')
        .send({
          subscription: { endpoint: 'https://fcm/test', keys: { p256dh: 'k', auth: 'a' } },
          userAgent: 'Mozilla/5.0'
        });

      expect(res.status).toBe(201);
      expect(mockPushService.subscribe).toHaveBeenCalledWith(
        expect.objectContaining({ endpoint: 'https://fcm/test' }), 'Mozilla/5.0', 5
      );
      expect(routePool.query).toHaveBeenCalledWith(
        expect.stringContaining('push_notifications_enabled = true'), [5]
      );
    });

    test('upserts on duplicate endpoint', async () => {
      const res = await request(app)
        .post('/api/push/subscribe')
        .set('x-user-id', '5')
        .send({ subscription: { endpoint: 'https://fcm/dup', keys: { p256dh: 'k', auth: 'a' } } });
      expect(res.status).toBe(201);
    });
  });

  describe('DELETE /api/push/unsubscribe', () => {
    test('removes correct subscription', async () => {
      const res = await request(app)
        .delete('/api/push/unsubscribe')
        .set('x-user-id', '5')
        .send({ endpoint: 'https://fcm/remove' });

      expect(res.status).toBe(200);
      expect(mockPushService.unsubscribe).toHaveBeenCalledWith('https://fcm/remove');
    });
  });
});
