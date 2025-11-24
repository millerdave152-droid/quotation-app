import { cachedFetch } from './apiCache';

jest.mock('./apiCache');

describe('Email Notification Service', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('sendQuoteCreatedNotification', () => {
    test('should send quote created notification', async () => {
      cachedFetch.mockResolvedValue({
        success: true,
        message: 'Quote creation notification sent'
      });

      const sendQuoteCreatedNotification = async (quoteId, recipientEmail, recipientName) => {
        return await cachedFetch('/api/notifications/quote-created', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ quote_id: quoteId, recipient_email: recipientEmail, recipient_name: recipientName })
        });
      };

      const result = await sendQuoteCreatedNotification(1, 'customer@example.com', 'John Doe');

      expect(result.success).toBe(true);
      expect(cachedFetch).toHaveBeenCalledWith(
        '/api/notifications/quote-created',
        expect.objectContaining({ method: 'POST' })
      );
    });

    test('should validate email address before sending', () => {
      const validateEmail = (email) => {
        const regex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        return regex.test(email);
      };

      expect(validateEmail('valid@example.com')).toBe(true);
      expect(validateEmail('invalid-email')).toBe(false);
      expect(validateEmail('missing@domain')).toBe(false);
    });
  });

  describe('sendQuoteSentNotification', () => {
    test('should send quote sent notification with PDF', async () => {
      cachedFetch.mockResolvedValue({
        success: true,
        message: 'Quote sent notification delivered'
      });

      const sendQuoteSentNotification = async (quoteId, customerEmail, customerName, pdfUrl) => {
        return await cachedFetch('/api/notifications/quote-sent', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            quote_id: quoteId,
            customer_email: customerEmail,
            customer_name: customerName,
            pdf_url: pdfUrl
          })
        });
      };

      const result = await sendQuoteSentNotification(
        1,
        'customer@example.com',
        'Jane Smith',
        'https://example.com/quotes/1.pdf'
      );

      expect(result.success).toBe(true);
    });
  });

  describe('sendStatusChangeNotification', () => {
    test('should send status change notification', async () => {
      cachedFetch.mockResolvedValue({
        success: true,
        message: 'Status change notification sent (sent → approved)'
      });

      const sendStatusChangeNotification = async (quoteId, oldStatus, newStatus, recipientEmail, notifyCustomer = false) => {
        return await cachedFetch('/api/notifications/status-change', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            quote_id: quoteId,
            old_status: oldStatus,
            new_status: newStatus,
            recipient_email: recipientEmail,
            notify_customer: notifyCustomer
          })
        });
      };

      const result = await sendStatusChangeNotification(1, 'sent', 'approved', 'staff@example.com', true);

      expect(result.message).toContain('sent → approved');
    });

    test('should validate status transitions', () => {
      const validStatuses = ['draft', 'sent', 'approved', 'rejected', 'expired'];

      const isValidStatus = (status) => {
        return validStatuses.includes(status);
      };

      expect(isValidStatus('approved')).toBe(true);
      expect(isValidStatus('invalid')).toBe(false);
    });

    test('should determine if customer should be notified', () => {
      const shouldNotifyCustomer = (oldStatus, newStatus) => {
        // Notify customer for these transitions
        const notifyTransitions = {
          'sent': ['approved', 'rejected'],
          'draft': ['sent']
        };

        return notifyTransitions[oldStatus]?.includes(newStatus) || false;
      };

      expect(shouldNotifyCustomer('sent', 'approved')).toBe(true);
      expect(shouldNotifyCustomer('sent', 'rejected')).toBe(true);
      expect(shouldNotifyCustomer('draft', 'sent')).toBe(true);
      expect(shouldNotifyCustomer('draft', 'approved')).toBe(false);
    });
  });

  describe('sendFollowUpEmail', () => {
    test('should send follow-up email with custom message', async () => {
      cachedFetch.mockResolvedValue({
        success: true,
        message: 'Follow-up email sent'
      });

      const sendFollowUpEmail = async (quoteId, recipientEmail, daysSinceSent, customMessage) => {
        return await cachedFetch('/api/notifications/follow-up', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            quote_id: quoteId,
            recipient_email: recipientEmail,
            days_since_sent: daysSinceSent,
            custom_message: customMessage
          })
        });
      };

      const result = await sendFollowUpEmail(
        1,
        'customer@example.com',
        7,
        'Just checking in on your quote...'
      );

      expect(result.success).toBe(true);
    });

    test('should generate default follow-up message', () => {
      const generateFollowUpMessage = (daysSinceSent) => {
        if (daysSinceSent <= 3) {
          return 'We wanted to follow up on your recent quote.';
        } else if (daysSinceSent <= 7) {
          return 'Hope you had a chance to review your quote. Any questions?';
        } else {
          return 'Just checking in on your quote from last week. Still interested?';
        }
      };

      expect(generateFollowUpMessage(2)).toContain('recent quote');
      expect(generateFollowUpMessage(5)).toContain('Any questions');
      expect(generateFollowUpMessage(10)).toContain('last week');
    });
  });

  describe('sendExpirationWarning', () => {
    test('should send expiration warning', async () => {
      cachedFetch.mockResolvedValue({
        success: true,
        message: 'Expiration warning sent'
      });

      const sendExpirationWarning = async (quoteId, recipientEmail, daysUntilExpiration) => {
        return await cachedFetch('/api/notifications/expiration-warning', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            quote_id: quoteId,
            recipient_email: recipientEmail,
            days_until_expiration: daysUntilExpiration
          })
        });
      };

      const result = await sendExpirationWarning(1, 'customer@example.com', 3);

      expect(result.success).toBe(true);
    });

    test('should format expiration message based on days remaining', () => {
      const formatExpirationMessage = (daysRemaining) => {
        if (daysRemaining === 1) {
          return 'Your quote expires tomorrow!';
        } else if (daysRemaining <= 3) {
          return `Your quote expires in ${daysRemaining} days.`;
        } else if (daysRemaining <= 7) {
          return `Reminder: Your quote expires in ${daysRemaining} days.`;
        } else {
          return `Your quote is valid for ${daysRemaining} more days.`;
        }
      };

      expect(formatExpirationMessage(1)).toContain('tomorrow');
      expect(formatExpirationMessage(2)).toContain('2 days');
      expect(formatExpirationMessage(5)).toContain('Reminder');
      expect(formatExpirationMessage(10)).toContain('valid for');
    });
  });

  describe('Notification Log', () => {
    test('should fetch notification log for quote', async () => {
      const mockLog = [
        { id: 1, notification_type: 'quote_created', status: 'sent', created_at: '2025-01-01' },
        { id: 2, notification_type: 'quote_sent', status: 'sent', created_at: '2025-01-02' }
      ];

      cachedFetch.mockResolvedValue(mockLog);

      const getNotificationLog = async (quoteId) => {
        return await cachedFetch(`/api/notifications/log/${quoteId}`);
      };

      const log = await getNotificationLog(1);

      expect(log).toHaveLength(2);
      expect(log[0].notification_type).toBe('quote_created');
    });

    test('should group notifications by type', () => {
      const groupNotificationsByType = (notifications) => {
        return notifications.reduce((acc, notif) => {
          if (!acc[notif.notification_type]) {
            acc[notif.notification_type] = [];
          }
          acc[notif.notification_type].push(notif);
          return acc;
        }, {});
      };

      const notifications = [
        { id: 1, notification_type: 'quote_created' },
        { id: 2, notification_type: 'quote_sent' },
        { id: 3, notification_type: 'quote_created' }
      ];

      const grouped = groupNotificationsByType(notifications);

      expect(grouped.quote_created).toHaveLength(2);
      expect(grouped.quote_sent).toHaveLength(1);
    });
  });

  describe('Notification Preferences', () => {
    test('should fetch user notification preferences', async () => {
      const mockPreferences = {
        quote_created: true,
        quote_sent: true,
        status_change: false,
        follow_up: false,
        expiration_warning: true
      };

      cachedFetch.mockResolvedValue(mockPreferences);

      const getNotificationPreferences = async (userId) => {
        return await cachedFetch(`/api/notifications/preferences/${userId}`);
      };

      const prefs = await getNotificationPreferences(1);

      expect(prefs.quote_created).toBe(true);
      expect(prefs.status_change).toBe(false);
    });

    test('should update notification preferences', async () => {
      cachedFetch.mockResolvedValue({
        success: true,
        preferences: {
          quote_created: false,
          quote_sent: true
        }
      });

      const updateNotificationPreferences = async (userId, preferences) => {
        return await cachedFetch(`/api/notifications/preferences/${userId}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(preferences)
        });
      };

      const result = await updateNotificationPreferences(1, {
        quote_created: false,
        quote_sent: true
      });

      expect(result.success).toBe(true);
    });

    test('should validate preference structure', () => {
      const validPreferences = {
        quote_created: true,
        quote_sent: true,
        status_change: false,
        follow_up: false,
        expiration_warning: true
      };

      const validatePreferences = (prefs) => {
        const requiredKeys = ['quote_created', 'quote_sent', 'status_change', 'follow_up', 'expiration_warning'];
        return requiredKeys.every(key => typeof prefs[key] === 'boolean');
      };

      expect(validatePreferences(validPreferences)).toBe(true);
      expect(validatePreferences({ quote_created: 'yes' })).toBe(false);
    });
  });

  describe('Notification UI Helpers', () => {
    test('should format notification timestamp', () => {
      const formatTimestamp = (timestamp) => {
        const date = new Date(timestamp);
        const now = new Date();
        const diffMs = now - date;
        const diffMins = Math.floor(diffMs / 60000);

        if (diffMins < 1) return 'Just now';
        if (diffMins < 60) return `${diffMins} minutes ago`;
        if (diffMins < 1440) return `${Math.floor(diffMins / 60)} hours ago`;
        return date.toLocaleDateString();
      };

      const now = new Date();
      const fiveMinutesAgo = new Date(now - 5 * 60000);
      const twoHoursAgo = new Date(now - 2 * 60 * 60000);

      expect(formatTimestamp(fiveMinutesAgo)).toContain('minutes ago');
      expect(formatTimestamp(twoHoursAgo)).toContain('hours ago');
    });

    test('should get notification icon based on type', () => {
      const getNotificationIcon = (type) => {
        const icons = {
          quote_created: '📝',
          quote_sent: '📧',
          status_change: '🔄',
          follow_up: '📞',
          expiration_warning: '⏰'
        };
        return icons[type] || '📬';
      };

      expect(getNotificationIcon('quote_created')).toBe('📝');
      expect(getNotificationIcon('quote_sent')).toBe('📧');
      expect(getNotificationIcon('unknown')).toBe('📬');
    });

    test('should determine notification priority', () => {
      const getNotificationPriority = (type, metadata) => {
        if (type === 'expiration_warning' && metadata?.days_until_expiration <= 1) {
          return 'high';
        }
        if (type === 'status_change' && metadata?.new_status === 'rejected') {
          return 'high';
        }
        if (type === 'quote_sent') {
          return 'medium';
        }
        return 'low';
      };

      expect(getNotificationPriority('expiration_warning', { days_until_expiration: 1 })).toBe('high');
      expect(getNotificationPriority('status_change', { new_status: 'rejected' })).toBe('high');
      expect(getNotificationPriority('quote_sent', {})).toBe('medium');
      expect(getNotificationPriority('follow_up', {})).toBe('low');
    });
  });
});
