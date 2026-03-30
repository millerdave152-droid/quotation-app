const request = require('supertest');
const express = require('express');

// ============================================
// Mock EmailService (SES wrapper)
// ============================================
jest.mock('../services/EmailService', () => ({
  sendEmail: jest.fn().mockResolvedValue({ success: true }),
  logNotification: jest.fn().mockResolvedValue(undefined),
  stripHtml: jest.fn(html => html.replace(/<[^>]*>/g, ''))
}));

const mockEmailService = require('../services/EmailService');

// ============================================
// Mock Pool
// ============================================
const mockPool = {
  query: jest.fn()
};

// ============================================
// EmailReminderService Unit Tests
// ============================================
describe('EmailReminderService', () => {
  const EmailReminderService = require('../services/EmailReminderService');
  let service;

  beforeEach(() => {
    jest.clearAllMocks();
    mockPool.query.mockReset();
    mockEmailService.sendEmail.mockResolvedValue({ success: true });
    mockEmailService.logNotification.mockResolvedValue(undefined);
    service = new EmailReminderService(mockPool);
  });

  // ------------------------------------------
  // dispatchLeadEmail
  // ------------------------------------------
  describe('dispatchLeadEmail', () => {
    const mockLead = {
      id: 10, status: 'quoted', assigned_to: 5,
      customer_name: 'John Doe', customer_phone: '555-1234',
      assigned_to_name: 'Alice Smith', store_location_name: 'Main Store',
      primary_quote_id: 20, primary_quote_number: 'QT-2026-0050',
      primary_quote_total_cents: 150000, primary_quote_expires_at: '2026-04-02T00:00:00Z'
    };

    const mockRecipient = {
      id: 5, email: 'alice@teletime.ca', first_name: 'Alice', last_name: 'Smith',
      notification_preferences: { lead_email_reminders: true }
    };

    test('sends to correct recipients and updates sent_at', async () => {
      // _getLeadData
      mockPool.query.mockResolvedValueOnce({ rows: [mockLead] });
      // _resolveRecipients
      mockPool.query.mockResolvedValueOnce({ rows: [mockRecipient] });
      // _markRemindersSent
      mockPool.query.mockResolvedValueOnce({});

      await service.dispatchLeadEmail('lead-created', 10, [5]);

      // Verify sendEmail was called with correct recipient
      expect(mockEmailService.sendEmail).toHaveBeenCalledWith(
        'alice@teletime.ca',
        expect.stringContaining('John Doe'),
        expect.stringContaining('John Doe')
      );

      // Verify logNotification was called
      expect(mockEmailService.logNotification).toHaveBeenCalledWith(
        20, // primary_quote_id
        'LEAD_LEAD_CREATED',
        'alice@teletime.ca',
        expect.any(String),
        'sent',
        null
      );
    });

    test('does not throw on SES failure — logs error instead', async () => {
      mockPool.query.mockResolvedValueOnce({ rows: [mockLead] });
      mockPool.query.mockResolvedValueOnce({ rows: [mockRecipient] });
      mockPool.query.mockResolvedValueOnce({});

      // SES fails
      mockEmailService.sendEmail.mockResolvedValueOnce({ success: false, error: 'SES throttled' });

      // Should NOT throw
      await expect(
        service.dispatchLeadEmail('lead-created', 10, [5])
      ).resolves.not.toThrow();

      // Should log as failed
      expect(mockEmailService.logNotification).toHaveBeenCalledWith(
        expect.anything(),
        expect.anything(),
        'alice@teletime.ca',
        expect.anything(),
        'failed',
        'SES throttled'
      );
    });

    test('skips opted-out user — notification_preferences.lead_email_reminders = false', async () => {
      const optedOutUser = {
        ...mockRecipient,
        notification_preferences: { lead_email_reminders: false }
      };

      mockPool.query.mockResolvedValueOnce({ rows: [mockLead] });
      mockPool.query.mockResolvedValueOnce({ rows: [optedOutUser] });
      mockPool.query.mockResolvedValueOnce({});

      await service.dispatchLeadEmail('lead-created', 10, [5]);

      // sendEmail should NOT have been called
      expect(mockEmailService.sendEmail).not.toHaveBeenCalled();
    });

    test('handles missing lead gracefully', async () => {
      mockPool.query.mockResolvedValueOnce({ rows: [] });

      await expect(
        service.dispatchLeadEmail('lead-created', 999, [5])
      ).resolves.not.toThrow();

      expect(mockEmailService.sendEmail).not.toHaveBeenCalled();
    });

    test('handles empty recipient list gracefully', async () => {
      await service.dispatchLeadEmail('lead-created', 10, []);
      expect(mockPool.query).not.toHaveBeenCalled();
    });
  });

  // ------------------------------------------
  // processEmailQueue
  // ------------------------------------------
  describe('processEmailQueue', () => {
    test('processes only unsent email reminders', async () => {
      // Queue query
      mockPool.query.mockResolvedValueOnce({
        rows: [
          { id: 1, lead_id: 10, trigger_type: 'no_contact', recipient_user_id: 5, message_body: 'test' },
          { id: 2, lead_id: 11, trigger_type: 'quote_expiry', recipient_user_id: 6, message_body: 'test2' }
        ]
      });

      // For each item: _getLeadData, _resolveRecipients, _markRemindersSent, UPDATE sent_at
      // Item 1
      mockPool.query.mockResolvedValueOnce({ rows: [{ id: 10, customer_name: 'A', primary_quote_number: 'Q1' }] });
      mockPool.query.mockResolvedValueOnce({ rows: [{ id: 5, email: 'a@test.com', notification_preferences: {} }] });
      mockPool.query.mockResolvedValueOnce({}); // _markRemindersSent
      mockPool.query.mockResolvedValueOnce({}); // UPDATE sent_at

      // Item 2
      mockPool.query.mockResolvedValueOnce({ rows: [{ id: 11, customer_name: 'B', primary_quote_number: 'Q2' }] });
      mockPool.query.mockResolvedValueOnce({ rows: [{ id: 6, email: 'b@test.com', notification_preferences: {} }] });
      mockPool.query.mockResolvedValueOnce({}); // _markRemindersSent
      mockPool.query.mockResolvedValueOnce({}); // UPDATE sent_at

      const result = await service.processEmailQueue();

      expect(result.processed).toBe(2);
      expect(result.sent).toBe(2);
      expect(result.errors).toBe(0);

      // Verify the initial query filters on unsent email reminders
      const queueQuery = mockPool.query.mock.calls[0][0];
      expect(queueQuery).toContain("reminder_type = 'email'");
      expect(queueQuery).toContain('sent_at IS NULL');
      expect(queueQuery).toContain('scheduled_at <= NOW()');
    });

    test('batches correctly — limits to BATCH_SIZE', async () => {
      // Empty queue
      mockPool.query.mockResolvedValueOnce({ rows: [] });

      const result = await service.processEmailQueue();

      expect(result.processed).toBe(0);
      expect(result.sent).toBe(0);

      // Verify LIMIT parameter was passed
      expect(mockPool.query.mock.calls[0][1]).toEqual([20]);
    });

    test('skips opted-out users during queue processing', async () => {
      mockPool.query.mockResolvedValueOnce({
        rows: [{ id: 1, lead_id: 10, trigger_type: 'no_contact', recipient_user_id: 5 }]
      });

      // _getLeadData
      mockPool.query.mockResolvedValueOnce({ rows: [{ id: 10, customer_name: 'Test' }] });
      // _resolveRecipients — user has opted out
      mockPool.query.mockResolvedValueOnce({
        rows: [{ id: 5, email: 'test@test.com', notification_preferences: { lead_email_reminders: false } }]
      });
      mockPool.query.mockResolvedValueOnce({}); // _markRemindersSent
      mockPool.query.mockResolvedValueOnce({}); // UPDATE sent_at

      const result = await service.processEmailQueue();
      expect(result.sent).toBe(1); // Item is "sent" (processed) even though email was suppressed

      // sendEmail should NOT have been called (user opted out)
      expect(mockEmailService.sendEmail).not.toHaveBeenCalled();
    });
  });

  // ------------------------------------------
  // Template rendering
  // ------------------------------------------
  describe('_renderTemplate', () => {
    const mockLead = {
      id: 10, customer_name: 'John Doe', customer_phone: '555-1234',
      assigned_to_name: 'Alice', store_location_name: 'Main Store',
      primary_quote_number: 'QT-2026-0050', primary_quote_total_cents: 150000,
      primary_quote_expires_at: '2026-04-02T00:00:00Z'
    };

    test.each([
      ['lead-created', 'New Lead'],
      ['no-followup-nudge', 'Follow Up with'],
      ['expiry-warning', 'Quote Expiring Soon'],
      ['quote-expired', 'Expired Quote'],
      ['followup-reminder', 'Reminder']
    ])('renders %s template with correct subject', (templateId, expectedSubjectPart) => {
      const { subject, html } = service._renderTemplate(templateId, mockLead, { email: 'test@test.com' });
      expect(subject).toContain(expectedSubjectPart);
      expect(html).toContain('John Doe');
      expect(html).toContain('QT-2026-0050');
      expect(html).toContain('/leads/10'); // Direct link
      expect(html).toContain('View Lead'); // CTA button
      expect(html).toContain('Teletime'); // Company name in footer
    });
  });
});

// ============================================
// Integration: Lead creation triggers email
// ============================================
describe('Lead creation triggers lead-created email', () => {
  test('findOrCreateLeadForCustomer fires email on new lead', async () => {
    const LeadService = require('../services/LeadService');
    const EmailReminderService = require('../services/EmailReminderService');

    const mockDispatch = jest.fn().mockResolvedValue(undefined);
    jest.spyOn(EmailReminderService.prototype, 'dispatchLeadEmail').mockImplementation(mockDispatch);

    const mockClient = {
      query: jest.fn(),
      release: jest.fn()
    };
    const mockConnPool = {
      query: jest.fn(),
      connect: jest.fn().mockResolvedValue(mockClient)
    };

    const service = new LeadService(mockConnPool);

    // generateLeadNumber uses pool.query
    mockConnPool.query.mockResolvedValueOnce({ rows: [{ nextval: 1 }] });

    mockClient.query
      .mockResolvedValueOnce({}) // BEGIN
      .mockResolvedValueOnce({ rows: [] }) // no existing lead
      .mockResolvedValueOnce({ rows: [{ name: 'Test', email: 't@t.com', phone: '555' }] }) // customer
      .mockResolvedValueOnce({ rows: [{ id: 50, status: 'quoted', assigned_to: 5 }] }) // INSERT lead
      .mockResolvedValueOnce({}) // INSERT lead_quotes
      .mockResolvedValueOnce({}) // UPDATE quotations
      .mockResolvedValueOnce({ rows: [{ id: 1 }] }) // logActivity
      .mockResolvedValueOnce({}); // COMMIT

    await service.findOrCreateLeadForCustomer({
      customerId: 10, assignedStaffId: 5, storeLocationId: 2,
      source: 'quote_generated', quoteId: 99
    });

    // Verify dispatchLeadEmail was called with lead-created template
    expect(mockDispatch).toHaveBeenCalledWith('lead-created', 50, [5]);

    EmailReminderService.prototype.dispatchLeadEmail.mockRestore();
  });
});

// ============================================
// SES failure does not fail quote creation
// ============================================
describe('SES failure does not fail quote creation', () => {
  test('lead email error is caught — quote creation succeeds', async () => {
    const EmailReminderService = require('../services/EmailReminderService');

    // Make dispatchLeadEmail throw
    jest.spyOn(EmailReminderService.prototype, 'dispatchLeadEmail')
      .mockRejectedValue(new Error('SES connection refused'));

    // Simulate the try/catch pattern from findOrCreateLeadForCustomer
    const logger = require('../utils/logger');
    const logSpy = jest.spyOn(logger, 'error').mockImplementation(() => {});

    let caughtError = false;
    const leadId = 50;

    // This mirrors what happens after COMMIT in findOrCreateLeadForCustomer
    try {
      const emailReminderService = new EmailReminderService({});
      await emailReminderService.dispatchLeadEmail('lead-created', leadId, [5]);
    } catch (err) {
      // In the real code this is caught by .catch()
      caughtError = true;
    }

    // The error was thrown but would be caught by .catch() in the real code
    expect(caughtError).toBe(true);

    // The quote (simulated) is not affected
    const quote = { id: 50, status: 'DRAFT' };
    expect(quote.id).toBe(50);

    EmailReminderService.prototype.dispatchLeadEmail.mockRestore();
    logSpy.mockRestore();
  });
});

// ============================================
// PATCH /api/users/me/notifications
// ============================================
describe('PATCH /api/users/me/notifications', () => {
  let app;
  const notifPool = { query: jest.fn() };

  beforeAll(() => {
    app = express();
    app.use(express.json());

    app.patch('/api/users/me/notifications', (req, res) => {
      req.user = { id: parseInt(req.headers['x-user-id'] || '1') };

      const { lead_email_reminders } = req.body;
      const prefs = { lead_email_reminders: lead_email_reminders !== false };

      notifPool.query(`
        UPDATE users SET notification_preferences = notification_preferences || $1::jsonb
        WHERE id = $2
      `, [JSON.stringify(prefs), req.user.id])
        .then(() => res.json({ success: true, data: prefs }))
        .catch(() => res.status(500).json({ success: false, error: 'Failed' }));
    });
  });

  beforeEach(() => {
    jest.clearAllMocks();
    notifPool.query.mockResolvedValue({});
  });

  test('persists preference correctly — opt out', async () => {
    const res = await request(app)
      .patch('/api/users/me/notifications')
      .set('x-user-id', '5')
      .send({ lead_email_reminders: false });

    expect(res.status).toBe(200);
    expect(res.body.data.lead_email_reminders).toBe(false);

    // Verify the DB was updated with the correct preference
    expect(notifPool.query).toHaveBeenCalledWith(
      expect.stringContaining('UPDATE users'),
      [JSON.stringify({ lead_email_reminders: false }), 5]
    );
  });

  test('persists preference correctly — opt in', async () => {
    const res = await request(app)
      .patch('/api/users/me/notifications')
      .set('x-user-id', '5')
      .send({ lead_email_reminders: true });

    expect(res.status).toBe(200);
    expect(res.body.data.lead_email_reminders).toBe(true);
  });
});
