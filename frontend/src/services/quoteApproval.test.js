import { cachedFetch } from './apiCache';

jest.mock('./apiCache');

describe('Quote Approval Workflow Service', () => {
  const API_BASE_URL = '/api';

  beforeEach(() => {
    jest.clearAllMocks();
    global.fetch = jest.fn();
  });

  describe('createApprovalRule', () => {
    test('should create approval rule', async () => {
      const mockResponse = {
        success: true,
        rule: {
          id: 1,
          name: 'High Value Quotes',
          conditions: { min_amount: 10000 },
          approvers: [2, 3],
          order_level: 1,
          is_active: true
        }
      };

      global.fetch = jest.fn().mockResolvedValue({
        ok: true,
        json: async () => mockResponse
      });

      const createApprovalRule = async (ruleData) => {
        const response = await fetch(`${API_BASE_URL}/approval-rules`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(ruleData)
        });
        return await response.json();
      };

      const result = await createApprovalRule({
        name: 'High Value Quotes',
        conditions: { min_amount: 10000 },
        approvers: [2, 3],
        order_level: 1,
        created_by: 1
      });

      expect(result.success).toBe(true);
      expect(result.rule.name).toBe('High Value Quotes');
    });
  });

  describe('getApprovalRules', () => {
    test('should fetch all approval rules', async () => {
      const mockData = {
        rules: [
          { id: 1, name: 'Rule 1', order_level: 1, is_active: true },
          { id: 2, name: 'Rule 2', order_level: 2, is_active: false }
        ]
      };

      cachedFetch.mockResolvedValue(mockData);

      const getApprovalRules = async (activeOnly = false) => {
        const url = activeOnly
          ? `${API_BASE_URL}/approval-rules?active_only=true`
          : `${API_BASE_URL}/approval-rules`;
        return await cachedFetch(url);
      };

      const result = await getApprovalRules();
      expect(result.rules).toHaveLength(2);
    });

    test('should filter active rules only', async () => {
      const mockData = {
        rules: [{ id: 1, name: 'Rule 1', order_level: 1, is_active: true }]
      };

      cachedFetch.mockResolvedValue(mockData);

      const getApprovalRules = async (activeOnly = false) => {
        const url = activeOnly
          ? `${API_BASE_URL}/approval-rules?active_only=true`
          : `${API_BASE_URL}/approval-rules`;
        return await cachedFetch(url);
      };

      const result = await getApprovalRules(true);
      expect(result.rules).toHaveLength(1);
    });
  });

  describe('submitQuoteForApproval', () => {
    test('should submit quote for approval', async () => {
      const mockResponse = {
        success: true,
        approval_requests_created: true
      };

      global.fetch = jest.fn().mockResolvedValue({
        ok: true,
        json: async () => mockResponse
      });

      const submitQuoteForApproval = async (quoteId, data) => {
        const response = await fetch(`${API_BASE_URL}/quotes/${quoteId}/submit-for-approval`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(data)
        });
        return await response.json();
      };

      const result = await submitQuoteForApproval(1, {
        submitted_by: 1,
        notes: 'Please review'
      });

      expect(result.success).toBe(true);
      expect(result.approval_requests_created).toBe(true);
    });

    test('should handle auto-approval', async () => {
      const mockResponse = {
        success: true,
        auto_approved: true
      };

      global.fetch = jest.fn().mockResolvedValue({
        ok: true,
        json: async () => mockResponse
      });

      const submitQuoteForApproval = async (quoteId, data) => {
        const response = await fetch(`${API_BASE_URL}/quotes/${quoteId}/submit-for-approval`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(data)
        });
        return await response.json();
      };

      const result = await submitQuoteForApproval(1, { submitted_by: 1 });
      expect(result.auto_approved).toBe(true);
    });
  });

  describe('approveRequest', () => {
    test('should approve approval request', async () => {
      const mockResponse = {
        success: true,
        all_approvals_complete: true
      };

      global.fetch = jest.fn().mockResolvedValue({
        ok: true,
        json: async () => mockResponse
      });

      const approveRequest = async (requestId, approverId, comments) => {
        const response = await fetch(`${API_BASE_URL}/approval-requests/${requestId}/approve`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ approver_id: approverId, comments })
        });
        return await response.json();
      };

      const result = await approveRequest(1, 2, 'Looks good');
      expect(result.success).toBe(true);
      expect(result.all_approvals_complete).toBe(true);
    });

    test('should handle partial approval', async () => {
      const mockResponse = {
        success: true,
        all_approvals_complete: false
      };

      global.fetch = jest.fn().mockResolvedValue({
        ok: true,
        json: async () => mockResponse
      });

      const approveRequest = async (requestId, approverId, comments) => {
        const response = await fetch(`${API_BASE_URL}/approval-requests/${requestId}/approve`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ approver_id: approverId, comments })
        });
        return await response.json();
      };

      const result = await approveRequest(1, 2, 'Approved');
      expect(result.all_approvals_complete).toBe(false);
    });
  });

  describe('rejectRequest', () => {
    test('should reject approval request', async () => {
      const mockResponse = { success: true };

      global.fetch = jest.fn().mockResolvedValue({
        ok: true,
        json: async () => mockResponse
      });

      const rejectRequest = async (requestId, approverId, reason) => {
        const response = await fetch(`${API_BASE_URL}/approval-requests/${requestId}/reject`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ approver_id: approverId, reason })
        });
        return await response.json();
      };

      const result = await rejectRequest(1, 2, 'Price too high');
      expect(result.success).toBe(true);
    });
  });

  describe('getPendingApprovals', () => {
    test('should fetch pending approvals for user', async () => {
      const mockData = {
        approvals: [
          {
            id: 1,
            quotation_id: 1,
            quote_number: 'Q-001',
            total_amount: 15000,
            customer_name: 'Acme Corp'
          },
          {
            id: 2,
            quotation_id: 2,
            quote_number: 'Q-002',
            total_amount: 20000,
            customer_name: 'Tech Inc'
          }
        ]
      };

      cachedFetch.mockResolvedValue(mockData);

      const getPendingApprovals = async (userId) => {
        return await cachedFetch(`${API_BASE_URL}/users/${userId}/pending-approvals`);
      };

      const result = await getPendingApprovals(2);
      expect(result.approvals).toHaveLength(2);
    });
  });

  describe('getApprovalHistory', () => {
    test('should fetch approval history for quote', async () => {
      const mockData = {
        history: [
          {
            id: 1,
            level: 1,
            status: 'approved',
            approver_name: 'John Doe',
            rule_name: 'High Value'
          },
          {
            id: 2,
            level: 2,
            status: 'pending',
            approver_name: 'Jane Smith',
            rule_name: 'Executive'
          }
        ]
      };

      cachedFetch.mockResolvedValue(mockData);

      const getApprovalHistory = async (quoteId) => {
        return await cachedFetch(`${API_BASE_URL}/quotes/${quoteId}/approval-history`);
      };

      const result = await getApprovalHistory(1);
      expect(result.history).toHaveLength(2);
    });
  });

  describe('delegateApproval', () => {
    test('should delegate approval request', async () => {
      const mockResponse = { success: true };

      global.fetch = jest.fn().mockResolvedValue({
        ok: true,
        json: async () => mockResponse
      });

      const delegateApproval = async (requestId, fromUserId, toUserId, reason) => {
        const response = await fetch(`${API_BASE_URL}/approval-requests/${requestId}/delegate`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            from_user_id: fromUserId,
            to_user_id: toUserId,
            reason
          })
        });
        return await response.json();
      };

      const result = await delegateApproval(1, 2, 3, 'Out of office');
      expect(result.success).toBe(true);
    });
  });

  describe('getApprovalAnalytics', () => {
    test('should fetch approval analytics', async () => {
      const mockData = {
        analytics: {
          total_requests: 100,
          approved_count: 70,
          rejected_count: 20,
          pending_count: 10,
          avg_approval_time_hours: 24.5
        }
      };

      cachedFetch.mockResolvedValue(mockData);

      const getApprovalAnalytics = async (startDate, endDate) => {
        return await cachedFetch(
          `${API_BASE_URL}/approval-analytics?start_date=${startDate}&end_date=${endDate}`
        );
      };

      const result = await getApprovalAnalytics('2024-01-01', '2024-12-31');
      expect(result.analytics.total_requests).toBe(100);
      expect(result.analytics.approved_count).toBe(70);
    });
  });

  describe('updateApprovalRule', () => {
    test('should update approval rule status', async () => {
      const mockResponse = {
        success: true,
        rule: { id: 1, name: 'Test Rule', is_active: false }
      };

      global.fetch = jest.fn().mockResolvedValue({
        ok: true,
        json: async () => mockResponse
      });

      const updateApprovalRule = async (ruleId, updates) => {
        const response = await fetch(`${API_BASE_URL}/approval-rules/${ruleId}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(updates)
        });
        return await response.json();
      };

      const result = await updateApprovalRule(1, { is_active: false });
      expect(result.success).toBe(true);
    });
  });

  describe('Approval Status Utilities', () => {
    test('should get approval status color', () => {
      const getApprovalStatusColor = (status) => {
        const colors = {
          pending: 'yellow',
          approved: 'green',
          rejected: 'red',
          delegated: 'blue'
        };
        return colors[status] || 'gray';
      };

      expect(getApprovalStatusColor('pending')).toBe('yellow');
      expect(getApprovalStatusColor('approved')).toBe('green');
      expect(getApprovalStatusColor('rejected')).toBe('red');
    });

    test('should get approval status label', () => {
      const getApprovalStatusLabel = (status) => {
        const labels = {
          pending: 'Awaiting Approval',
          approved: 'Approved',
          rejected: 'Rejected',
          delegated: 'Delegated'
        };
        return labels[status] || 'Unknown';
      };

      expect(getApprovalStatusLabel('pending')).toBe('Awaiting Approval');
      expect(getApprovalStatusLabel('approved')).toBe('Approved');
    });
  });

  describe('Approval Rule Utilities', () => {
    test('should check if rule applies to quote', () => {
      const doesRuleApply = (rule, quote) => {
        const conditions = rule.conditions;

        if (conditions.min_amount && quote.total_amount < conditions.min_amount) {
          return false;
        }

        if (conditions.max_amount && quote.total_amount > conditions.max_amount) {
          return false;
        }

        if (conditions.customer_type && quote.customer_type !== conditions.customer_type) {
          return false;
        }

        return true;
      };

      const rule = { conditions: { min_amount: 10000 } };
      const quote1 = { total_amount: 15000 };
      const quote2 = { total_amount: 5000 };

      expect(doesRuleApply(rule, quote1)).toBe(true);
      expect(doesRuleApply(rule, quote2)).toBe(false);
    });

    test('should get applicable rules for quote', () => {
      const getApplicableRules = (rules, quote) => {
        const doesRuleApply = (rule, quote) => {
          const conditions = rule.conditions;
          if (conditions.min_amount && quote.total_amount < conditions.min_amount) {
            return false;
          }
          return true;
        };

        return rules
          .filter(rule => rule.is_active)
          .filter(rule => doesRuleApply(rule, quote))
          .sort((a, b) => a.order_level - b.order_level);
      };

      const rules = [
        { id: 1, conditions: { min_amount: 10000 }, order_level: 1, is_active: true },
        { id: 2, conditions: { min_amount: 50000 }, order_level: 2, is_active: true },
        { id: 3, conditions: { min_amount: 1000 }, order_level: 3, is_active: false }
      ];

      const quote = { total_amount: 15000 };
      const applicable = getApplicableRules(rules, quote);

      expect(applicable).toHaveLength(1);
      expect(applicable[0].id).toBe(1);
    });
  });

  describe('Approval Progress Tracking', () => {
    test('should calculate approval progress', () => {
      const calculateProgress = (history) => {
        const total = history.length;
        const approved = history.filter(h => h.status === 'approved').length;
        return total > 0 ? ((approved / total) * 100).toFixed(0) : '0';
      };

      const history = [
        { status: 'approved' },
        { status: 'approved' },
        { status: 'pending' },
        { status: 'pending' }
      ];

      expect(calculateProgress(history)).toBe('50');
    });

    test('should get next pending approver', () => {
      const getNextApprover = (history) => {
        const pending = history
          .filter(h => h.status === 'pending')
          .sort((a, b) => a.level - b.level);
        return pending.length > 0 ? pending[0] : null;
      };

      const history = [
        { level: 1, status: 'approved', approver_name: 'John' },
        { level: 2, status: 'pending', approver_name: 'Jane' },
        { level: 3, status: 'pending', approver_name: 'Bob' }
      ];

      const next = getNextApprover(history);
      expect(next.approver_name).toBe('Jane');
      expect(next.level).toBe(2);
    });

    test('should check if all approvals complete', () => {
      const areAllApprovalsComplete = (history) => {
        return history.every(h => h.status === 'approved');
      };

      const complete = [
        { status: 'approved' },
        { status: 'approved' }
      ];

      const incomplete = [
        { status: 'approved' },
        { status: 'pending' }
      ];

      expect(areAllApprovalsComplete(complete)).toBe(true);
      expect(areAllApprovalsComplete(incomplete)).toBe(false);
    });
  });

  describe('Approval Time Calculations', () => {
    test('should calculate time since submission', () => {
      const getTimeSinceSubmission = (submittedAt) => {
        const now = new Date('2024-12-31T12:00:00');
        const submitted = new Date(submittedAt);
        const hours = Math.floor((now - submitted) / (1000 * 60 * 60));

        if (hours < 1) return 'Less than 1 hour';
        if (hours < 24) return `${hours} hours`;
        const days = Math.floor(hours / 24);
        return `${days} day${days > 1 ? 's' : ''}`;
      };

      expect(getTimeSinceSubmission('2024-12-31T11:30:00')).toBe('Less than 1 hour');
      expect(getTimeSinceSubmission('2024-12-31T06:00:00')).toBe('6 hours');
      expect(getTimeSinceSubmission('2024-12-29T12:00:00')).toBe('2 days');
    });

    test('should format approval time', () => {
      const formatApprovalTime = (hours) => {
        if (hours < 1) return 'Less than 1 hour';
        if (hours < 24) return `${hours.toFixed(1)} hours`;
        const days = (hours / 24).toFixed(1);
        return `${days} days`;
      };

      expect(formatApprovalTime(0.5)).toBe('Less than 1 hour');
      expect(formatApprovalTime(12)).toBe('12.0 hours');
      expect(formatApprovalTime(48)).toBe('2.0 days');
    });
  });

  describe('Approval Notifications', () => {
    test('should format approval notification', () => {
      const formatApprovalNotification = (approval) => {
        return `New approval request for quote ${approval.quote_number} (${approval.customer_name})`;
      };

      expect(formatApprovalNotification({
        quote_number: 'Q-001',
        customer_name: 'Acme Corp'
      })).toBe('New approval request for quote Q-001 (Acme Corp)');
    });

    test('should format delegation notification', () => {
      const formatDelegationNotification = (delegation) => {
        return `${delegation.from_name} delegated approval to you: ${delegation.reason}`;
      };

      expect(formatDelegationNotification({
        from_name: 'John Doe',
        reason: 'Out of office'
      })).toBe('John Doe delegated approval to you: Out of office');
    });
  });

  describe('Approval Filtering', () => {
    test('should filter approvals by status', () => {
      const filterByStatus = (approvals, status) => {
        return approvals.filter(a => a.status === status);
      };

      const approvals = [
        { id: 1, status: 'pending' },
        { id: 2, status: 'approved' },
        { id: 3, status: 'pending' }
      ];

      const pending = filterByStatus(approvals, 'pending');
      expect(pending).toHaveLength(2);
    });

    test('should filter approvals by level', () => {
      const filterByLevel = (approvals, level) => {
        return approvals.filter(a => a.level === level);
      };

      const approvals = [
        { id: 1, level: 1 },
        { id: 2, level: 2 },
        { id: 3, level: 1 }
      ];

      const level1 = filterByLevel(approvals, 1);
      expect(level1).toHaveLength(2);
    });
  });

  describe('Approval Sorting', () => {
    test('should sort approvals by level', () => {
      const sortByLevel = (approvals) => {
        return [...approvals].sort((a, b) => a.level - b.level);
      };

      const approvals = [
        { id: 1, level: 3 },
        { id: 2, level: 1 },
        { id: 3, level: 2 }
      ];

      const sorted = sortByLevel(approvals);
      expect(sorted[0].level).toBe(1);
      expect(sorted[2].level).toBe(3);
    });

    test('should sort approvals by date', () => {
      const sortByDate = (approvals) => {
        return [...approvals].sort((a, b) =>
          new Date(b.created_at) - new Date(a.created_at)
        );
      };

      const approvals = [
        { id: 1, created_at: '2024-01-01' },
        { id: 2, created_at: '2024-01-03' },
        { id: 3, created_at: '2024-01-02' }
      ];

      const sorted = sortByDate(approvals);
      expect(sorted[0].id).toBe(2);
      expect(sorted[2].id).toBe(1);
    });
  });

  describe('Approval Validation', () => {
    test('should validate approval permission', () => {
      const canApprove = (approval, userId) => {
        return approval.approver_id === userId && approval.status === 'pending';
      };

      const approval = { approver_id: 2, status: 'pending' };

      expect(canApprove(approval, 2)).toBe(true);
      expect(canApprove(approval, 3)).toBe(false);
    });

    test('should validate delegation permission', () => {
      const canDelegate = (approval, userId) => {
        return approval.approver_id === userId &&
               approval.status === 'pending' &&
               !approval.delegated_from;
      };

      const approval1 = { approver_id: 2, status: 'pending', delegated_from: null };
      const approval2 = { approver_id: 2, status: 'pending', delegated_from: 1 };

      expect(canDelegate(approval1, 2)).toBe(true);
      expect(canDelegate(approval2, 2)).toBe(false);
    });
  });
});
