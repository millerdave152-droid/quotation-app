const request = require('supertest');
const express = require('express');

// ============================================
// Mock Pool
// ============================================
const mockPool = {
  query: jest.fn()
};

// ============================================
// ReminderService Unit Tests
// ============================================
describe('ReminderService', () => {
  const ReminderService = require('../services/ReminderService');
  let service;

  beforeEach(() => {
    jest.clearAllMocks();
    mockPool.query.mockReset();
    service = new ReminderService(mockPool);
  });

  // ------------------------------------------
  // generateRemindersForLead
  // ------------------------------------------
  describe('generateRemindersForLead', () => {
    test('stale lead generates state_stale reminder', async () => {
      const fourDaysAgo = new Date(Date.now() - 4 * 24 * 60 * 60 * 1000).toISOString();

      mockPool.query
        .mockResolvedValueOnce({ rows: [{
          id: 1, status: 'new', assigned_to: 5, created_at: fourDaysAgo,
          followup_count: '0', completed_followup_count: '0',
          primary_quote_expires_at: null
        }] })
        // Dedup check — no existing
        .mockResolvedValueOnce({ rows: [] })
        // INSERT
        .mockResolvedValueOnce({});

      const result = await service.generateRemindersForLead(1);
      expect(result.created).toBe(1);

      const insertCall = mockPool.query.mock.calls.find(
        c => typeof c[0] === 'string' && c[0].includes('INSERT INTO lead_reminders')
      );
      expect(insertCall).toBeTruthy();
      expect(insertCall[1]).toContain('state_stale');
    });

    test('duplicate not created — unacknowledged reminder of same type exists', async () => {
      const fourDaysAgo = new Date(Date.now() - 4 * 24 * 60 * 60 * 1000).toISOString();

      mockPool.query
        .mockResolvedValueOnce({ rows: [{
          id: 1, status: 'new', assigned_to: 5, created_at: fourDaysAgo,
          followup_count: '0', completed_followup_count: '0',
          primary_quote_expires_at: null
        }] })
        // Dedup check — existing unacknowledged found
        .mockResolvedValueOnce({ rows: [{ id: 99 }] });

      const result = await service.generateRemindersForLead(1);
      expect(result.created).toBe(0);

      // No INSERT should have been called
      const insertCalls = mockPool.query.mock.calls.filter(
        c => typeof c[0] === 'string' && c[0].includes('INSERT INTO lead_reminders')
      );
      expect(insertCalls).toHaveLength(0);
    });

    test('terminal lead generates no reminders (won, lost, expired, converted)', async () => {
      for (const status of ['won', 'lost', 'expired', 'converted']) {
        mockPool.query.mockResolvedValueOnce({ rows: [{
          id: 10, status, assigned_to: 5, created_at: new Date().toISOString(),
          followup_count: '0', completed_followup_count: '0',
          primary_quote_expires_at: null
        }] });

        const result = await service.generateRemindersForLead(10);
        expect(result.evaluated).toBe(true);
        expect(result.created).toBe(0);
      }
    });

    test('creates quote_expiry reminder when primary quote expires within 3 days', async () => {
      const twoDaysFromNow = new Date(Date.now() + 2 * 24 * 60 * 60 * 1000).toISOString();
      const tenDaysAgo = new Date(Date.now() - 10 * 24 * 60 * 60 * 1000).toISOString();

      mockPool.query
        .mockResolvedValueOnce({ rows: [{
          id: 2, status: 'quoted', assigned_to: 5, created_at: tenDaysAgo,
          followup_count: '1', completed_followup_count: '0',
          primary_quote_expires_at: twoDaysFromNow
        }] })
        // state_stale dedup + INSERT
        .mockResolvedValueOnce({ rows: [] })
        .mockResolvedValueOnce({})
        // quote_expiry dedup + INSERT
        .mockResolvedValueOnce({ rows: [] })
        .mockResolvedValueOnce({});

      const result = await service.generateRemindersForLead(2);
      expect(result.created).toBe(2); // state_stale + quote_expiry
    });

    test('creates no_contact reminder for quoted lead > 2 days with zero follow-ups', async () => {
      const fourDaysAgo = new Date(Date.now() - 4 * 24 * 60 * 60 * 1000).toISOString();

      mockPool.query
        .mockResolvedValueOnce({ rows: [{
          id: 3, status: 'quoted', assigned_to: 5, created_at: fourDaysAgo,
          followup_count: '0', completed_followup_count: '0',
          primary_quote_expires_at: null
        }] })
        // state_stale dedup + INSERT
        .mockResolvedValueOnce({ rows: [] })
        .mockResolvedValueOnce({})
        // no_contact dedup + INSERT
        .mockResolvedValueOnce({ rows: [] })
        .mockResolvedValueOnce({});

      const result = await service.generateRemindersForLead(3);
      expect(result.created).toBe(2); // state_stale + no_contact
    });

    test('does not create state_stale for lead < 3 days old', async () => {
      const oneDayAgo = new Date(Date.now() - 1 * 24 * 60 * 60 * 1000).toISOString();

      mockPool.query.mockResolvedValueOnce({ rows: [{
        id: 1, status: 'new', assigned_to: 5, created_at: oneDayAgo,
        followup_count: '0', completed_followup_count: '0',
        primary_quote_expires_at: null
      }] });

      const result = await service.generateRemindersForLead(1);
      expect(result.created).toBe(0);
    });

    test('returns { evaluated: false } for non-existent lead', async () => {
      mockPool.query.mockResolvedValueOnce({ rows: [] });
      const result = await service.generateRemindersForLead(999);
      expect(result.evaluated).toBe(false);
      expect(result.created).toBe(0);
    });
  });

  // ------------------------------------------
  // getUnacknowledgedRemindersForUser
  // ------------------------------------------
  describe('getUnacknowledgedRemindersForUser', () => {
    test('returns only unacknowledged reminders for the correct user', async () => {
      mockPool.query.mockResolvedValueOnce({
        rows: [
          {
            id: 1, lead_id: 10, trigger_type: 'state_stale',
            customer_name: 'John', lead_status: 'new', store_location_name: 'Main',
            primary_quote: { id: 20, quote_number: 'QT-2026-0001', total_cents: 50000, expires_at: null }
          },
          {
            id: 2, lead_id: 11, trigger_type: 'quote_expiry',
            customer_name: 'Jane', lead_status: 'quoted', store_location_name: 'West',
            primary_quote: null
          }
        ]
      });

      const result = await service.getUnacknowledgedRemindersForUser(5);
      expect(result).toHaveLength(2);
      expect(result[0].customer_name).toBe('John');
      expect(result[0].primary_quote.quote_number).toBe('QT-2026-0001');

      // Verify the query filters on user, acknowledged, type, and time
      const query = mockPool.query.mock.calls[0][0];
      expect(query).toContain('recipient_user_id = $1');
      expect(query).toContain('acknowledged_at IS NULL');
      expect(query).toContain("reminder_type = 'in_app'");
      expect(query).toContain('scheduled_at <= NOW()');
      // Verify the user ID was passed
      expect(mockPool.query.mock.calls[0][1]).toEqual([5]);
    });

    test('returns empty array when user has no reminders', async () => {
      mockPool.query.mockResolvedValueOnce({ rows: [] });

      const result = await service.getUnacknowledgedRemindersForUser(99);
      expect(result).toHaveLength(0);
      expect(mockPool.query.mock.calls[0][1]).toEqual([99]);
    });
  });

  // ------------------------------------------
  // acknowledgeReminder
  // ------------------------------------------
  describe('acknowledgeReminder', () => {
    test('sets acknowledged_at and returns updated record', async () => {
      // Ownership check
      mockPool.query.mockResolvedValueOnce({
        rows: [{ id: 1, recipient_user_id: 5 }]
      });
      // UPDATE
      mockPool.query.mockResolvedValueOnce({
        rows: [{ id: 1, acknowledged_at: '2026-03-30T12:00:00Z', recipient_user_id: 5 }]
      });

      const result = await service.acknowledgeReminder(1, 5);
      expect(result.id).toBe(1);
      expect(result.acknowledged_at).toBeTruthy();
    });

    test('throws Reminder not found for non-existent reminder', async () => {
      mockPool.query.mockResolvedValueOnce({ rows: [] });
      await expect(service.acknowledgeReminder(999, 5)).rejects.toThrow('Reminder not found');
    });

    test('throws Forbidden when user is not the recipient', async () => {
      mockPool.query.mockResolvedValueOnce({
        rows: [{ id: 1, recipient_user_id: 7 }]
      });

      await expect(service.acknowledgeReminder(1, 5)).rejects.toThrow('Forbidden');
    });

    test('allows acknowledge when recipient_user_id is null (unassigned reminder)', async () => {
      // Ownership check — null recipient
      mockPool.query.mockResolvedValueOnce({
        rows: [{ id: 1, recipient_user_id: null }]
      });
      // UPDATE
      mockPool.query.mockResolvedValueOnce({
        rows: [{ id: 1, acknowledged_at: '2026-03-30T12:00:00Z', recipient_user_id: null }]
      });

      const result = await service.acknowledgeReminder(1, 5);
      expect(result.id).toBe(1);
    });
  });

  // ------------------------------------------
  // generateStoreReminders / generateAllStoreReminders
  // ------------------------------------------
  describe('generateStoreReminders', () => {
    test('evaluates all open leads in a store', async () => {
      mockPool.query.mockResolvedValueOnce({ rows: [{ id: 1 }, { id: 2 }] });
      // Lead 1 — terminal
      mockPool.query.mockResolvedValueOnce({ rows: [{
        id: 1, status: 'won', assigned_to: 5, created_at: new Date().toISOString(),
        followup_count: '0', completed_followup_count: '0', primary_quote_expires_at: null
      }] });
      // Lead 2 — new, <3 days
      mockPool.query.mockResolvedValueOnce({ rows: [{
        id: 2, status: 'new', assigned_to: 5, created_at: new Date().toISOString(),
        followup_count: '0', completed_followup_count: '0', primary_quote_expires_at: null
      }] });

      const result = await service.generateStoreReminders(1);
      expect(result.evaluated).toBe(2);
      expect(result.created).toBe(0);
    });

    test('does not throw on empty store (no leads)', async () => {
      mockPool.query.mockResolvedValueOnce({ rows: [] });

      const result = await service.generateStoreReminders(1);
      expect(result.evaluated).toBe(0);
      expect(result.created).toBe(0);
    });
  });

  describe('generateAllStoreReminders', () => {
    test('does not throw on empty store list', async () => {
      mockPool.query.mockResolvedValueOnce({ rows: [] });

      const result = await service.generateAllStoreReminders();
      expect(result.stores).toBe(0);
      expect(result.evaluated).toBe(0);
      expect(result.created).toBe(0);
    });

    test('logs errors per store without crashing', async () => {
      // Two stores
      mockPool.query.mockResolvedValueOnce({ rows: [{ id: 1 }, { id: 2 }] });
      // Store 1 — throws
      mockPool.query.mockRejectedValueOnce(new Error('DB timeout'));
      // Store 2 — empty
      mockPool.query.mockResolvedValueOnce({ rows: [] });

      // Should NOT throw
      const result = await service.generateAllStoreReminders();
      expect(result.stores).toBe(2);
      // Store 2 was processed successfully
      expect(result.evaluated).toBe(0);
    });
  });

  // ------------------------------------------
  // getUnacknowledgedRemindersForStore
  // ------------------------------------------
  describe('getUnacknowledgedRemindersForStore', () => {
    test('returns all reminders for a store with staff names', async () => {
      mockPool.query.mockResolvedValueOnce({
        rows: [
          { id: 1, lead_id: 10, assigned_staff_name: 'Alice', trigger_type: 'state_stale' },
          { id: 2, lead_id: 11, assigned_staff_name: 'Bob', trigger_type: 'no_contact' }
        ]
      });

      const result = await service.getUnacknowledgedRemindersForStore(1);
      expect(result).toHaveLength(2);
      expect(result[0].assigned_staff_name).toBe('Alice');

      const query = mockPool.query.mock.calls[0][0];
      expect(query).toContain('store_location_id = $1');
    });
  });
});

// ============================================
// API Route Tests
// ============================================
describe('Reminder API Routes', () => {
  let app;

  const responseHelpers = (req, res, next) => {
    res.success = (data) => res.status(200).json({ success: true, data });
    res.created = (data) => res.status(201).json({ success: true, data });
    next();
  };

  const mockReminderService = {
    getUnacknowledgedRemindersForUser: jest.fn(),
    getUnacknowledgedRemindersForStore: jest.fn(),
    acknowledgeReminder: jest.fn(),
    generateStoreReminders: jest.fn()
  };

  beforeAll(() => {
    app = express();
    app.use(express.json());
    app.use(responseHelpers);

    const router = express.Router();

    // Simulate auth middleware that sets user from header
    const mockAuth = (req, res, next) => {
      req.user = { id: parseInt(req.headers['x-user-id'] || '1'), role: req.headers['x-user-role'] || 'sales' };
      next();
    };

    router.get('/reminders/mine', mockAuth, async (req, res) => {
      const reminders = await mockReminderService.getUnacknowledgedRemindersForUser(req.user.id);
      res.success(reminders);
    });

    router.patch('/reminders/:reminderId/acknowledge', mockAuth, async (req, res) => {
      try {
        const reminder = await mockReminderService.acknowledgeReminder(
          parseInt(req.params.reminderId), req.user.id
        );
        res.success(reminder);
      } catch (error) {
        if (error.message === 'Reminder not found') {
          return res.status(404).json({ success: false, error: error.message });
        }
        if (error.message === 'Forbidden') {
          return res.status(403).json({ success: false, error: 'You can only acknowledge your own reminders' });
        }
        res.status(500).json({ success: false, error: error.message });
      }
    });

    router.get('/reminders/store/:storeLocationId', mockAuth, async (req, res) => {
      if (!['manager', 'admin'].includes(req.user.role)) {
        return res.status(403).json({ success: false, error: 'Manager or admin role required' });
      }
      const reminders = await mockReminderService.getUnacknowledgedRemindersForStore(
        parseInt(req.params.storeLocationId)
      );
      res.success(reminders);
    });

    app.use('/api/leads', router);
  });

  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('GET /api/leads/reminders/mine', () => {
    test('returns correct reminders for authenticated user', async () => {
      mockReminderService.getUnacknowledgedRemindersForUser.mockResolvedValue([
        { id: 1, trigger_type: 'state_stale', customer_name: 'John' },
        { id: 2, trigger_type: 'quote_expiry', customer_name: 'Jane' }
      ]);

      const res = await request(app)
        .get('/api/leads/reminders/mine')
        .set('x-user-id', '5');

      expect(res.status).toBe(200);
      expect(res.body.data).toHaveLength(2);
      // Verify the service was called with the correct user ID
      expect(mockReminderService.getUnacknowledgedRemindersForUser).toHaveBeenCalledWith(5);
    });
  });

  describe('PATCH /api/leads/reminders/:reminderId/acknowledge', () => {
    test('200 on valid reminder owned by user', async () => {
      mockReminderService.acknowledgeReminder.mockResolvedValue({
        id: 1, acknowledged_at: '2026-03-30T12:00:00Z', recipient_user_id: 5
      });

      const res = await request(app)
        .patch('/api/leads/reminders/1/acknowledge')
        .set('x-user-id', '5');

      expect(res.status).toBe(200);
      expect(res.body.data.acknowledged_at).toBeTruthy();
      expect(mockReminderService.acknowledgeReminder).toHaveBeenCalledWith(1, 5);
    });

    test('403 on another user\'s reminder', async () => {
      mockReminderService.acknowledgeReminder.mockRejectedValue(new Error('Forbidden'));

      const res = await request(app)
        .patch('/api/leads/reminders/1/acknowledge')
        .set('x-user-id', '5');

      expect(res.status).toBe(403);
      expect(res.body.error).toContain('only acknowledge your own');
    });

    test('404 for non-existent reminder', async () => {
      mockReminderService.acknowledgeReminder.mockRejectedValue(new Error('Reminder not found'));

      const res = await request(app)
        .patch('/api/leads/reminders/999/acknowledge')
        .set('x-user-id', '5');

      expect(res.status).toBe(404);
    });
  });

  describe('GET /api/leads/reminders/store/:storeLocationId', () => {
    test('200 for manager role', async () => {
      mockReminderService.getUnacknowledgedRemindersForStore.mockResolvedValue([
        { id: 1, assigned_staff_name: 'Alice' }
      ]);

      const res = await request(app)
        .get('/api/leads/reminders/store/1')
        .set('x-user-id', '1')
        .set('x-user-role', 'manager');

      expect(res.status).toBe(200);
      expect(res.body.data).toHaveLength(1);
    });

    test('403 for non-manager role', async () => {
      const res = await request(app)
        .get('/api/leads/reminders/store/1')
        .set('x-user-id', '1')
        .set('x-user-role', 'sales');

      expect(res.status).toBe(403);
    });
  });
});
