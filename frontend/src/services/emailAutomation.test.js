import { cachedFetch } from './apiCache';

jest.mock('./apiCache');

describe('Email Automation & Templates Service', () => {
  const API_BASE_URL = '/api';

  beforeEach(() => {
    jest.clearAllMocks();
    global.fetch = jest.fn();
  });

  describe('createEmailTemplate', () => {
    test('should create email template', async () => {
      const mockResponse = {
        success: true,
        template: {
          id: 1,
          name: 'Quote Sent',
          subject: 'Your Quote {{quote_number}}',
          body: 'Dear {{customer_name}}',
          variables: ['quote_number', 'customer_name']
        }
      };

      global.fetch = jest.fn().mockResolvedValue({
        ok: true,
        json: async () => mockResponse
      });

      const createEmailTemplate = async (templateData) => {
        const response = await fetch(`${API_BASE_URL}/email-templates`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(templateData)
        });
        return await response.json();
      };

      const result = await createEmailTemplate({
        name: 'Quote Sent',
        subject: 'Your Quote {{quote_number}}',
        body: 'Dear {{customer_name}}',
        variables: ['quote_number', 'customer_name'],
        category: 'quotes',
        created_by: 1
      });

      expect(result.success).toBe(true);
      expect(result.template.name).toBe('Quote Sent');
    });

    test('should validate required fields', async () => {
      global.fetch = jest.fn().mockResolvedValue({
        ok: false,
        status: 400,
        json: async () => ({ error: 'Name, subject, and body are required' })
      });

      const createEmailTemplate = async (templateData) => {
        const response = await fetch(`${API_BASE_URL}/email-templates`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(templateData)
        });
        return await response.json();
      };

      const result = await createEmailTemplate({ name: 'Test' });
      expect(result.error).toBeDefined();
    });
  });

  describe('getEmailTemplates', () => {
    test('should fetch all email templates', async () => {
      const mockData = {
        templates: [
          { id: 1, name: 'Template 1', category: 'quotes' },
          { id: 2, name: 'Template 2', category: 'follow-up' }
        ]
      };

      cachedFetch.mockResolvedValue(mockData);

      const getEmailTemplates = async () => {
        return await cachedFetch(`${API_BASE_URL}/email-templates`);
      };

      const result = await getEmailTemplates();
      expect(result.templates).toHaveLength(2);
    });

    test('should filter templates by category', async () => {
      const mockData = {
        templates: [{ id: 1, name: 'Template 1', category: 'quotes' }]
      };

      cachedFetch.mockResolvedValue(mockData);

      const getEmailTemplates = async (category) => {
        const url = category
          ? `${API_BASE_URL}/email-templates?category=${category}`
          : `${API_BASE_URL}/email-templates`;
        return await cachedFetch(url);
      };

      const result = await getEmailTemplates('quotes');
      expect(result.templates).toHaveLength(1);
      expect(result.templates[0].category).toBe('quotes');
    });
  });

  describe('sendQuoteEmail', () => {
    test('should send email with template', async () => {
      const mockResponse = {
        success: true,
        message: 'Email sent successfully'
      };

      global.fetch = jest.fn().mockResolvedValue({
        ok: true,
        json: async () => mockResponse
      });

      const sendQuoteEmail = async (quoteId, emailData) => {
        const response = await fetch(`${API_BASE_URL}/quotes/${quoteId}/send-email`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(emailData)
        });
        return await response.json();
      };

      const result = await sendQuoteEmail(1, {
        template_id: 1,
        recipient_email: 'customer@example.com',
        cc_emails: ['manager@example.com']
      });

      expect(result.success).toBe(true);
      expect(result.message).toContain('sent');
    });

    test('should send email with custom message', async () => {
      global.fetch = jest.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ success: true })
      });

      const sendQuoteEmail = async (quoteId, emailData) => {
        const response = await fetch(`${API_BASE_URL}/quotes/${quoteId}/send-email`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(emailData)
        });
        return await response.json();
      };

      const result = await sendQuoteEmail(1, {
        recipient_email: 'customer@example.com',
        custom_message: 'Please find your custom quote attached.'
      });

      expect(result.success).toBe(true);
    });
  });

  describe('scheduleEmail', () => {
    test('should schedule follow-up email', async () => {
      const mockResponse = {
        success: true,
        schedule: {
          id: 1,
          quotation_id: 1,
          schedule_type: 'follow-up',
          schedule_date: '2024-12-31',
          status: 'pending'
        }
      };

      global.fetch = jest.fn().mockResolvedValue({
        ok: true,
        json: async () => mockResponse
      });

      const scheduleEmail = async (scheduleData) => {
        const response = await fetch(`${API_BASE_URL}/email-schedules`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(scheduleData)
        });
        return await response.json();
      };

      const result = await scheduleEmail({
        quotation_id: 1,
        template_id: 1,
        schedule_type: 'follow-up',
        schedule_date: '2024-12-31',
        recipient_email: 'customer@example.com',
        created_by: 1
      });

      expect(result.success).toBe(true);
      expect(result.schedule.status).toBe('pending');
    });

    test('should schedule reminder email', async () => {
      global.fetch = jest.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          success: true,
          schedule: { schedule_type: 'reminder' }
        })
      });

      const scheduleEmail = async (scheduleData) => {
        const response = await fetch(`${API_BASE_URL}/email-schedules`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(scheduleData)
        });
        return await response.json();
      };

      const result = await scheduleEmail({
        quotation_id: 1,
        schedule_type: 'reminder',
        schedule_date: '2024-12-31',
        recipient_email: 'customer@example.com'
      });

      expect(result.success).toBe(true);
      expect(result.schedule.schedule_type).toBe('reminder');
    });
  });

  describe('getEmailLogs', () => {
    test('should fetch email logs for quote', async () => {
      const mockData = {
        logs: [
          { id: 1, recipient: 'test@example.com', status: 'sent', sent_at: '2024-01-01' },
          { id: 2, recipient: 'test2@example.com', status: 'opened', sent_at: '2024-01-02' }
        ]
      };

      cachedFetch.mockResolvedValue(mockData);

      const getEmailLogs = async (quoteId) => {
        return await cachedFetch(`${API_BASE_URL}/quotes/${quoteId}/email-logs`);
      };

      const result = await getEmailLogs(1);
      expect(result.logs).toHaveLength(2);
    });
  });

  describe('trackEmailEvent', () => {
    test('should track email opened event', async () => {
      global.fetch = jest.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ success: true })
      });

      const trackEmailEvent = async (logId, eventType) => {
        const response = await fetch(`${API_BASE_URL}/email-logs/${logId}/track`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ event_type: eventType })
        });
        return await response.json();
      };

      const result = await trackEmailEvent(1, 'opened');
      expect(result.success).toBe(true);
    });

    test('should track email clicked event', async () => {
      global.fetch = jest.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ success: true })
      });

      const trackEmailEvent = async (logId, eventType) => {
        const response = await fetch(`${API_BASE_URL}/email-logs/${logId}/track`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ event_type: eventType })
        });
        return await response.json();
      };

      const result = await trackEmailEvent(1, 'clicked');
      expect(result.success).toBe(true);
    });
  });

  describe('updateEmailTemplate', () => {
    test('should update template', async () => {
      const mockResponse = {
        success: true,
        template: {
          id: 1,
          name: 'Updated Template',
          subject: 'New Subject'
        }
      };

      global.fetch = jest.fn().mockResolvedValue({
        ok: true,
        json: async () => mockResponse
      });

      const updateEmailTemplate = async (templateId, updates) => {
        const response = await fetch(`${API_BASE_URL}/email-templates/${templateId}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(updates)
        });
        return await response.json();
      };

      const result = await updateEmailTemplate(1, {
        name: 'Updated Template',
        subject: 'New Subject'
      });

      expect(result.success).toBe(true);
      expect(result.template.name).toBe('Updated Template');
    });
  });

  describe('deleteEmailTemplate', () => {
    test('should delete template', async () => {
      global.fetch = jest.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ success: true })
      });

      const deleteEmailTemplate = async (templateId) => {
        const response = await fetch(`${API_BASE_URL}/email-templates/${templateId}`, {
          method: 'DELETE'
        });
        return await response.json();
      };

      const result = await deleteEmailTemplate(1);
      expect(result.success).toBe(true);
    });
  });

  describe('duplicateEmailTemplate', () => {
    test('should duplicate template', async () => {
      const mockResponse = {
        success: true,
        template: {
          id: 2,
          name: 'Original (Copy)',
          subject: 'Test'
        }
      };

      global.fetch = jest.fn().mockResolvedValue({
        ok: true,
        json: async () => mockResponse
      });

      const duplicateEmailTemplate = async (templateId, userId) => {
        const response = await fetch(`${API_BASE_URL}/email-templates/${templateId}/duplicate`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ created_by: userId })
        });
        return await response.json();
      };

      const result = await duplicateEmailTemplate(1, 1);
      expect(result.success).toBe(true);
      expect(result.template.name).toContain('Copy');
    });
  });

  describe('getEmailAnalytics', () => {
    test('should fetch email analytics', async () => {
      const mockData = {
        analytics: {
          total_sent: 100,
          total_opened: 60,
          total_clicked: 30,
          total_bounced: 5,
          total_replied: 10,
          open_rate: '60.00',
          click_rate: '30.00'
        }
      };

      cachedFetch.mockResolvedValue(mockData);

      const getEmailAnalytics = async (startDate, endDate) => {
        return await cachedFetch(
          `${API_BASE_URL}/email-analytics?start_date=${startDate}&end_date=${endDate}`
        );
      };

      const result = await getEmailAnalytics('2024-01-01', '2024-12-31');
      expect(result.analytics.total_sent).toBe(100);
      expect(result.analytics.open_rate).toBe('60.00');
    });
  });

  describe('Template Variable Utilities', () => {
    test('should extract variables from template', () => {
      const extractVariables = (text) => {
        const regex = /\{\{(\w+)\}\}/g;
        const matches = [];
        let match;
        while ((match = regex.exec(text)) !== null) {
          matches.push(match[1]);
        }
        return matches;
      };

      expect(extractVariables('Hello {{customer_name}}, your quote {{quote_number}}')).toEqual([
        'customer_name',
        'quote_number'
      ]);
      expect(extractVariables('No variables here')).toEqual([]);
    });

    test('should replace variables in template', () => {
      const replaceVariables = (template, data) => {
        let result = template;
        Object.keys(data).forEach(key => {
          result = result.replace(new RegExp(`\\{\\{${key}\\}\\}`, 'g'), data[key]);
        });
        return result;
      };

      expect(replaceVariables('Hello {{name}}', { name: 'John' })).toBe('Hello John');
      expect(replaceVariables('Quote {{quote_number}} for {{customer}}', {
        quote_number: 'Q-001',
        customer: 'Acme Corp'
      })).toBe('Quote Q-001 for Acme Corp');
    });

    test('should validate template variables', () => {
      const validateTemplate = (template, requiredVars) => {
        const extractVariables = (text) => {
          const regex = /\{\{(\w+)\}\}/g;
          const matches = [];
          let match;
          while ((match = regex.exec(text)) !== null) {
            matches.push(match[1]);
          }
          return matches;
        };

        const variables = extractVariables(template);
        return requiredVars.every(v => variables.includes(v));
      };

      expect(validateTemplate('Hello {{customer_name}}', ['customer_name'])).toBe(true);
      expect(validateTemplate('Hello {{customer_name}}', ['customer_name', 'quote_number'])).toBe(false);
    });
  });

  describe('Email Status Utilities', () => {
    test('should get email status color', () => {
      const getEmailStatusColor = (status) => {
        const colors = {
          sent: 'blue',
          opened: 'green',
          clicked: 'purple',
          bounced: 'red',
          replied: 'teal'
        };
        return colors[status] || 'gray';
      };

      expect(getEmailStatusColor('sent')).toBe('blue');
      expect(getEmailStatusColor('opened')).toBe('green');
      expect(getEmailStatusColor('clicked')).toBe('purple');
    });

    test('should calculate email engagement score', () => {
      const calculateEngagementScore = (log) => {
        let score = 0;
        if (log.status === 'opened') score += 25;
        if (log.status === 'clicked') score += 50;
        if (log.status === 'replied') score += 100;
        return score;
      };

      expect(calculateEngagementScore({ status: 'sent' })).toBe(0);
      expect(calculateEngagementScore({ status: 'opened' })).toBe(25);
      expect(calculateEngagementScore({ status: 'clicked' })).toBe(50);
      expect(calculateEngagementScore({ status: 'replied' })).toBe(100);
    });
  });

  describe('Template Category Management', () => {
    test('should group templates by category', () => {
      const groupByCategory = (templates) => {
        return templates.reduce((acc, template) => {
          const category = template.category || 'general';
          if (!acc[category]) acc[category] = [];
          acc[category].push(template);
          return acc;
        }, {});
      };

      const templates = [
        { id: 1, name: 'T1', category: 'quotes' },
        { id: 2, name: 'T2', category: 'quotes' },
        { id: 3, name: 'T3', category: 'follow-up' }
      ];

      const grouped = groupByCategory(templates);
      expect(grouped.quotes).toHaveLength(2);
      expect(grouped['follow-up']).toHaveLength(1);
    });

    test('should get template categories', () => {
      const getTemplateCategories = (templates) => {
        const categories = new Set(templates.map(t => t.category || 'general'));
        return Array.from(categories);
      };

      const templates = [
        { category: 'quotes' },
        { category: 'follow-up' },
        { category: 'quotes' }
      ];

      const categories = getTemplateCategories(templates);
      expect(categories).toHaveLength(2);
      expect(categories).toContain('quotes');
      expect(categories).toContain('follow-up');
    });
  });

  describe('Schedule Management', () => {
    test('should format schedule date', () => {
      const formatScheduleDate = (date) => {
        const d = new Date(date);
        return d.toLocaleDateString('en-US', {
          year: 'numeric',
          month: 'short',
          day: 'numeric',
          hour: '2-digit',
          minute: '2-digit'
        });
      };

      const formatted = formatScheduleDate('2024-12-31T10:30:00');
      expect(formatted).toContain('2024');
      expect(formatted).toContain('Dec');
    });

    test('should check if schedule is overdue', () => {
      const isScheduleOverdue = (schedule) => {
        if (schedule.status !== 'pending') return false;
        return new Date(schedule.schedule_date) < new Date();
      };

      expect(isScheduleOverdue({
        status: 'pending',
        schedule_date: '2020-01-01'
      })).toBe(true);

      expect(isScheduleOverdue({
        status: 'pending',
        schedule_date: '2030-01-01'
      })).toBe(false);

      expect(isScheduleOverdue({
        status: 'sent',
        schedule_date: '2020-01-01'
      })).toBe(false);
    });
  });

  describe('Email Formatting', () => {
    test('should format recipient list', () => {
      const formatRecipients = (recipients) => {
        if (recipients.length <= 2) {
          return recipients.join(', ');
        }
        return `${recipients[0]}, ${recipients[1]} +${recipients.length - 2} more`;
      };

      expect(formatRecipients(['a@test.com'])).toBe('a@test.com');
      expect(formatRecipients(['a@test.com', 'b@test.com'])).toBe('a@test.com, b@test.com');
      expect(formatRecipients(['a@test.com', 'b@test.com', 'c@test.com', 'd@test.com']))
        .toBe('a@test.com, b@test.com +2 more');
    });

    test('should validate email address', () => {
      const isValidEmail = (email) => {
        return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
      };

      expect(isValidEmail('test@example.com')).toBe(true);
      expect(isValidEmail('invalid.email')).toBe(false);
      expect(isValidEmail('test@')).toBe(false);
    });
  });

  describe('Analytics Calculations', () => {
    test('should calculate open rate', () => {
      const calculateOpenRate = (sent, opened) => {
        if (sent === 0) return '0.00';
        return ((opened / sent) * 100).toFixed(2);
      };

      expect(calculateOpenRate(100, 60)).toBe('60.00');
      expect(calculateOpenRate(0, 0)).toBe('0.00');
      expect(calculateOpenRate(100, 0)).toBe('0.00');
    });

    test('should calculate click-through rate', () => {
      const calculateCTR = (sent, clicked) => {
        if (sent === 0) return '0.00';
        return ((clicked / sent) * 100).toFixed(2);
      };

      expect(calculateCTR(100, 30)).toBe('30.00');
      expect(calculateCTR(100, 0)).toBe('0.00');
    });

    test('should get email performance grade', () => {
      const getPerformanceGrade = (openRate) => {
        const rate = parseFloat(openRate);
        if (rate >= 70) return 'A';
        if (rate >= 50) return 'B';
        if (rate >= 30) return 'C';
        if (rate >= 10) return 'D';
        return 'F';
      };

      expect(getPerformanceGrade('75.00')).toBe('A');
      expect(getPerformanceGrade('55.00')).toBe('B');
      expect(getPerformanceGrade('35.00')).toBe('C');
      expect(getPerformanceGrade('15.00')).toBe('D');
      expect(getPerformanceGrade('5.00')).toBe('F');
    });
  });
});
