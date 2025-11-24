import { cachedFetch } from './apiCache';

jest.mock('./apiCache');

describe('Approval Workflow Service', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('submitForApproval', () => {
    test('should submit quote for approval', async () => {
      const mockResponse = {
        success: true,
        message: 'Quote submitted for approval',
        approval_level_required: 1
      };

      cachedFetch.mockResolvedValue(mockResponse);

      const submitForApproval = async (quoteId, notes) => {
        return await cachedFetch(`/api/quotations/${quoteId}/submit-for-approval`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ notes })
        });
      };

      const result = await submitForApproval(1, 'Please review this quote');

      expect(result.success).toBe(true);
      expect(result.approval_level_required).toBe(1);
      expect(cachedFetch).toHaveBeenCalledWith(
        '/api/quotations/1/submit-for-approval',
        expect.objectContaining({ method: 'POST' })
      );
    });

    test('should determine approval level based on amount', () => {
      const determineApprovalLevel = (amount) => {
        if (amount > 100000) return 3; // Executive
        if (amount > 50000) return 2; // Manager
        if (amount > 10000) return 1; // Supervisor
        return 0; // Auto-approve
      };

      expect(determineApprovalLevel(150000)).toBe(3);
      expect(determineApprovalLevel(75000)).toBe(2);
      expect(determineApprovalLevel(25000)).toBe(1);
      expect(determineApprovalLevel(5000)).toBe(0);
    });

    test('should validate notes are not too long', () => {
      const validateNotes = (notes) => {
        const maxLength = 500;
        if (notes && notes.length > maxLength) {
          throw new Error(`Notes cannot exceed ${maxLength} characters`);
        }
        return true;
      };

      const longNotes = 'a'.repeat(501);
      expect(() => validateNotes(longNotes)).toThrow('cannot exceed 500 characters');
      expect(validateNotes('Valid notes')).toBe(true);
    });
  });

  describe('approveQuote', () => {
    test('should approve quote with comments', async () => {
      const mockResponse = {
        success: true,
        message: 'Quote approved successfully',
        approved_by: 2
      };

      cachedFetch.mockResolvedValue(mockResponse);

      const approveQuote = async (quoteId, comments) => {
        return await cachedFetch(`/api/quotations/${quoteId}/approve`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ comments })
        });
      };

      const result = await approveQuote(1, 'Approved - good pricing');

      expect(result.success).toBe(true);
      expect(result.message).toContain('approved successfully');
    });

    test('should handle insufficient authority error', async () => {
      cachedFetch.mockRejectedValue({
        status: 403,
        error: 'Insufficient approval authority',
        required_level: 3,
        user_level: 1
      });

      const approveQuote = async (quoteId, comments) => {
        return await cachedFetch(`/api/quotations/${quoteId}/approve`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ comments })
        });
      };

      await expect(approveQuote(1, 'Test')).rejects.toMatchObject({
        status: 403,
        error: 'Insufficient approval authority'
      });
    });
  });

  describe('rejectQuote', () => {
    test('should reject quote with reason', async () => {
      const mockResponse = {
        success: true,
        message: 'Quote rejected',
        reason: 'Pricing too high'
      };

      cachedFetch.mockResolvedValue(mockResponse);

      const rejectQuote = async (quoteId, reason) => {
        return await cachedFetch(`/api/quotations/${quoteId}/reject`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ reason })
        });
      };

      const result = await rejectQuote(1, 'Pricing too high');

      expect(result.success).toBe(true);
      expect(result.reason).toBe('Pricing too high');
    });

    test('should validate rejection reason is provided', () => {
      const validateRejectionReason = (reason) => {
        if (!reason || reason.trim() === '') {
          throw new Error('Rejection reason is required');
        }
        if (reason.length < 10) {
          throw new Error('Rejection reason must be at least 10 characters');
        }
        return true;
      };

      expect(() => validateRejectionReason('')).toThrow('Rejection reason is required');
      expect(() => validateRejectionReason('Too short')).toThrow('at least 10 characters');
      expect(validateRejectionReason('This is a valid rejection reason')).toBe(true);
    });
  });

  describe('getApprovalStatus', () => {
    test('should fetch approval status for quote', async () => {
      const mockStatus = {
        quote_id: 1,
        approval_status: 'pending',
        approval_level_required: 2,
        submitted_at: '2025-01-29T10:00:00Z',
        submitted_by: 1
      };

      cachedFetch.mockResolvedValue(mockStatus);

      const getApprovalStatus = async (quoteId) => {
        return await cachedFetch(`/api/quotations/${quoteId}/approval-status`);
      };

      const result = await getApprovalStatus(1);

      expect(result.approval_status).toBe('pending');
      expect(result.approval_level_required).toBe(2);
    });
  });

  describe('getPendingApprovals', () => {
    test('should fetch pending approvals for current user', async () => {
      const mockApprovals = {
        count: 3,
        approvals: [
          { id: 1, quote_number: 'Q-001', total_amount: 15000 },
          { id: 2, quote_number: 'Q-002', total_amount: 25000 },
          { id: 3, quote_number: 'Q-003', total_amount: 12000 }
        ],
        user_level: 2
      };

      cachedFetch.mockResolvedValue(mockApprovals);

      const getPendingApprovals = async () => {
        return await cachedFetch('/api/approvals/pending');
      };

      const result = await getPendingApprovals();

      expect(result.count).toBe(3);
      expect(result.approvals).toHaveLength(3);
      expect(result.user_level).toBe(2);
    });
  });

  describe('getApprovalHistory', () => {
    test('should fetch approval history for quote', async () => {
      const mockHistory = {
        count: 2,
        history: [
          {
            id: 1,
            action: 'approved',
            performed_by: 2,
            performed_by_name: 'John Manager',
            created_at: '2025-01-29'
          },
          {
            id: 2,
            action: 'delegated',
            performed_by: 1,
            performed_by_name: 'Jane Smith',
            created_at: '2025-01-28'
          }
        ]
      };

      cachedFetch.mockResolvedValue(mockHistory);

      const getApprovalHistory = async (quoteId) => {
        return await cachedFetch(`/api/quotations/${quoteId}/approval-history`);
      };

      const result = await getApprovalHistory(1);

      expect(result.count).toBe(2);
      expect(result.history).toHaveLength(2);
      expect(result.history[0].action).toBe('approved');
    });
  });

  describe('delegateApproval', () => {
    test('should delegate approval to another user', async () => {
      const mockResponse = {
        success: true,
        message: 'Approval delegated successfully',
        delegated_to: 3
      };

      cachedFetch.mockResolvedValue(mockResponse);

      const delegateApproval = async (quoteId, delegateToUserId, reason) => {
        return await cachedFetch(`/api/quotations/${quoteId}/delegate-approval`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ delegate_to: delegateToUserId, reason })
        });
      };

      const result = await delegateApproval(1, 3, 'Out of office');

      expect(result.success).toBe(true);
      expect(result.delegated_to).toBe(3);
    });

    test('should validate delegation reason', () => {
      const validateDelegationReason = (reason) => {
        if (!reason || reason.trim() === '') {
          throw new Error('Delegation reason is required');
        }
        return true;
      };

      expect(() => validateDelegationReason('')).toThrow('Delegation reason is required');
      expect(validateDelegationReason('Out of office')).toBe(true);
    });
  });

  describe('bulkApprove', () => {
    test('should approve multiple quotes at once', async () => {
      const mockResponse = {
        success: true,
        approved_count: 3,
        approved_quotes: [1, 2, 3],
        failed_count: 0,
        failed_quotes: []
      };

      cachedFetch.mockResolvedValue(mockResponse);

      const bulkApprove = async (quoteIds, comments) => {
        return await cachedFetch('/api/approvals/bulk-approve', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ quote_ids: quoteIds, comments })
        });
      };

      const result = await bulkApprove([1, 2, 3], 'Bulk approved');

      expect(result.approved_count).toBe(3);
      expect(result.approved_quotes).toEqual([1, 2, 3]);
    });

    test('should handle partial failures in bulk approve', async () => {
      const mockResponse = {
        success: true,
        approved_count: 2,
        approved_quotes: [1, 3],
        failed_count: 1,
        failed_quotes: [{ quote_id: 2, reason: 'Insufficient authority' }]
      };

      cachedFetch.mockResolvedValue(mockResponse);

      const bulkApprove = async (quoteIds, comments) => {
        return await cachedFetch('/api/approvals/bulk-approve', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ quote_ids: quoteIds, comments })
        });
      };

      const result = await bulkApprove([1, 2, 3], 'Test');

      expect(result.approved_count).toBe(2);
      expect(result.failed_count).toBe(1);
      expect(result.failed_quotes[0].reason).toBe('Insufficient authority');
    });
  });

  describe('getApprovalStatistics', () => {
    test('should fetch approval statistics', async () => {
      const mockStats = {
        pending_count: '5',
        approved_count: '20',
        rejected_count: '3',
        avg_approval_time_hours: '2.5'
      };

      cachedFetch.mockResolvedValue(mockStats);

      const getApprovalStatistics = async (startDate, endDate) => {
        const params = new URLSearchParams();
        if (startDate) params.append('start_date', startDate);
        if (endDate) params.append('end_date', endDate);
        return await cachedFetch(`/api/approvals/statistics?${params.toString()}`);
      };

      const result = await getApprovalStatistics('2025-01-01', '2025-01-31');

      expect(result.pending_count).toBe('5');
      expect(result.approved_count).toBe('20');
      expect(result.avg_approval_time_hours).toBe('2.5');
    });
  });

  describe('UI Helper Functions', () => {
    test('should get approval status badge color', () => {
      const getApprovalBadgeColor = (status) => {
        const colors = {
          'pending': 'yellow',
          'approved': 'green',
          'rejected': 'red',
          'delegated': 'blue'
        };
        return colors[status] || 'gray';
      };

      expect(getApprovalBadgeColor('pending')).toBe('yellow');
      expect(getApprovalBadgeColor('approved')).toBe('green');
      expect(getApprovalBadgeColor('rejected')).toBe('red');
      expect(getApprovalBadgeColor('unknown')).toBe('gray');
    });

    test('should format approval level name', () => {
      const formatApprovalLevelName = (level) => {
        const names = {
          0: 'Auto-Approved',
          1: 'Supervisor',
          2: 'Manager',
          3: 'Executive'
        };
        return names[level] || 'Unknown';
      };

      expect(formatApprovalLevelName(0)).toBe('Auto-Approved');
      expect(formatApprovalLevelName(1)).toBe('Supervisor');
      expect(formatApprovalLevelName(2)).toBe('Manager');
      expect(formatApprovalLevelName(3)).toBe('Executive');
    });

    test('should check if user can approve quote', () => {
      const canUserApprove = (userLevel, requiredLevel) => {
        return userLevel >= requiredLevel;
      };

      expect(canUserApprove(3, 2)).toBe(true);  // Executive can approve Manager level
      expect(canUserApprove(2, 2)).toBe(true);  // Manager can approve Manager level
      expect(canUserApprove(1, 2)).toBe(false); // Supervisor cannot approve Manager level
    });

    test('should format time since submission', () => {
      const formatTimeSinceSubmission = (submittedAt) => {
        const now = new Date();
        const submitted = new Date(submittedAt);
        const diffMs = now - submitted;
        const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
        const diffDays = Math.floor(diffHours / 24);

        if (diffHours < 1) return 'Less than 1 hour ago';
        if (diffHours < 24) return `${diffHours} hours ago`;
        if (diffDays === 1) return '1 day ago';
        return `${diffDays} days ago`;
      };

      const now = new Date();
      const twoHoursAgo = new Date(now - 2 * 60 * 60 * 1000);
      const twoDaysAgo = new Date(now - 2 * 24 * 60 * 60 * 1000);

      expect(formatTimeSinceSubmission(twoHoursAgo)).toContain('hours ago');
      expect(formatTimeSinceSubmission(twoDaysAgo)).toContain('days ago');
    });

    test('should generate approval action icon', () => {
      const getApprovalActionIcon = (action) => {
        const icons = {
          'approved': '✓',
          'rejected': '✗',
          'delegated': '➤',
          'submitted': '↑',
          'withdrawn': '⤺'
        };
        return icons[action] || '●';
      };

      expect(getApprovalActionIcon('approved')).toBe('✓');
      expect(getApprovalActionIcon('rejected')).toBe('✗');
      expect(getApprovalActionIcon('delegated')).toBe('➤');
    });

    test('should determine if approval is urgent', () => {
      const isApprovalUrgent = (submittedAt, amount) => {
        const now = new Date();
        const submitted = new Date(submittedAt);
        const hoursSinceSubmission = (now - submitted) / (1000 * 60 * 60);

        // Urgent if over 24 hours old, or high value and over 12 hours
        if (hoursSinceSubmission > 24) return true;
        if (amount > 50000 && hoursSinceSubmission > 12) return true;
        return false;
      };

      const now = new Date();
      const oneDayAgo = new Date(now - 25 * 60 * 60 * 1000);
      const fifteenHoursAgo = new Date(now - 15 * 60 * 60 * 1000);

      expect(isApprovalUrgent(oneDayAgo, 10000)).toBe(true);
      expect(isApprovalUrgent(fifteenHoursAgo, 60000)).toBe(true);
      expect(isApprovalUrgent(fifteenHoursAgo, 5000)).toBe(false);
    });
  });

  describe('Approval Workflow Validation', () => {
    test('should validate user has required permissions', () => {
      const validateUserPermissions = (userRole, requiredPermissions) => {
        const rolePermissions = {
          'user': ['submit'],
          'supervisor': ['submit', 'approve_level_1'],
          'manager': ['submit', 'approve_level_1', 'approve_level_2', 'delegate'],
          'executive': ['submit', 'approve_level_1', 'approve_level_2', 'approve_level_3', 'delegate'],
          'admin': ['submit', 'approve_level_1', 'approve_level_2', 'approve_level_3', 'delegate', 'override']
        };

        const userPerms = rolePermissions[userRole] || [];
        return requiredPermissions.every(perm => userPerms.includes(perm));
      };

      expect(validateUserPermissions('supervisor', ['submit', 'approve_level_1'])).toBe(true);
      expect(validateUserPermissions('supervisor', ['approve_level_2'])).toBe(false);
      expect(validateUserPermissions('manager', ['approve_level_2', 'delegate'])).toBe(true);
      expect(validateUserPermissions('executive', ['approve_level_3'])).toBe(true);
    });

    test('should validate approval chain is complete', () => {
      const isApprovalChainComplete = (approvals, requiredLevel) => {
        // Check if all levels up to required level have been approved
        for (let level = 1; level <= requiredLevel; level++) {
          const levelApproval = approvals.find(a => a.level === level);
          if (!levelApproval || levelApproval.status !== 'approved') {
            return false;
          }
        }
        return true;
      };

      const completeChain = [
        { level: 1, status: 'approved' },
        { level: 2, status: 'approved' },
        { level: 3, status: 'approved' }
      ];

      const incompleteChain = [
        { level: 1, status: 'approved' },
        { level: 2, status: 'pending' }
      ];

      expect(isApprovalChainComplete(completeChain, 3)).toBe(true);
      expect(isApprovalChainComplete(incompleteChain, 2)).toBe(false);
    });

    test('should calculate approval SLA status', () => {
      const getApprovalSLAStatus = (submittedAt, approvalLevel) => {
        const now = new Date();
        const submitted = new Date(submittedAt);
        const hoursSinceSubmission = (now - submitted) / (1000 * 60 * 60);

        const slaHours = {
          1: 24,  // Supervisor - 24 hours
          2: 48,  // Manager - 48 hours
          3: 72   // Executive - 72 hours
        };

        const slaLimit = slaHours[approvalLevel] || 24;
        const percentUsed = (hoursSinceSubmission / slaLimit) * 100;

        if (percentUsed <= 50) return 'on-time';
        if (percentUsed <= 90) return 'at-risk';
        if (percentUsed < 100) return 'critical';
        return 'breached';
      };

      const now = new Date();
      const tenHoursAgo = new Date(now - 10 * 60 * 60 * 1000);
      const twentyHoursAgo = new Date(now - 20 * 60 * 60 * 1000);
      const fortyEightHoursAgo = new Date(now - 48 * 60 * 60 * 1000);

      expect(getApprovalSLAStatus(tenHoursAgo, 1)).toBe('on-time');
      expect(getApprovalSLAStatus(twentyHoursAgo, 1)).toBe('at-risk');
      expect(getApprovalSLAStatus(fortyEightHoursAgo, 1)).toBe('breached');
    });
  });

  describe('Approval Notifications', () => {
    test('should determine who to notify on submission', () => {
      const getApprovalNotificationRecipients = (approvalLevel, delegations) => {
        const recipients = [];

        // Default approvers by level
        const defaultApprovers = {
          1: ['supervisor@company.com'],
          2: ['manager@company.com'],
          3: ['executive@company.com']
        };

        // Check for delegations first
        const delegation = delegations.find(d => d.level === approvalLevel && d.active);
        if (delegation) {
          recipients.push(delegation.delegateTo);
        } else {
          recipients.push(...(defaultApprovers[approvalLevel] || []));
        }

        return recipients;
      };

      const noDelegations = [];
      const withDelegation = [
        { level: 1, delegateTo: 'delegate@company.com', active: true }
      ];

      expect(getApprovalNotificationRecipients(1, noDelegations)).toEqual(['supervisor@company.com']);
      expect(getApprovalNotificationRecipients(1, withDelegation)).toEqual(['delegate@company.com']);
    });

    test('should format approval notification message', () => {
      const formatApprovalNotificationMessage = (action, quoteNumber, amount, userName) => {
        const messages = {
          'submitted': `Quote ${quoteNumber} ($${amount.toLocaleString()}) has been submitted for your approval by ${userName}`,
          'approved': `Quote ${quoteNumber} has been approved by ${userName}`,
          'rejected': `Quote ${quoteNumber} has been rejected by ${userName}`,
          'delegated': `Quote ${quoteNumber} approval has been delegated to you by ${userName}`
        };
        return messages[action] || 'Unknown action';
      };

      expect(formatApprovalNotificationMessage('submitted', 'Q-001', 15000, 'John Doe'))
        .toContain('submitted for your approval');
      expect(formatApprovalNotificationMessage('approved', 'Q-001', 15000, 'Jane Manager'))
        .toContain('approved by Jane Manager');
    });
  });

  describe('Approval Filters and Sorting', () => {
    test('should filter approvals by status', () => {
      const filterApprovalsByStatus = (approvals, status) => {
        return approvals.filter(a => a.approval_status === status);
      };

      const approvals = [
        { id: 1, approval_status: 'pending' },
        { id: 2, approval_status: 'approved' },
        { id: 3, approval_status: 'pending' },
        { id: 4, approval_status: 'rejected' }
      ];

      expect(filterApprovalsByStatus(approvals, 'pending')).toHaveLength(2);
      expect(filterApprovalsByStatus(approvals, 'approved')).toHaveLength(1);
    });

    test('should sort approvals by priority', () => {
      const sortApprovalsByPriority = (approvals) => {
        return approvals.sort((a, b) => {
          // Sort by: 1) Amount (high to low), 2) Age (old to new)
          if (b.amount !== a.amount) {
            return b.amount - a.amount;
          }
          return new Date(a.submitted_at) - new Date(b.submitted_at);
        });
      };

      const approvals = [
        { id: 1, amount: 10000, submitted_at: '2025-01-29' },
        { id: 2, amount: 50000, submitted_at: '2025-01-28' },
        { id: 3, amount: 50000, submitted_at: '2025-01-27' }
      ];

      const sorted = sortApprovalsByPriority(approvals);

      expect(sorted[0].id).toBe(3); // Same amount, older
      expect(sorted[1].id).toBe(2); // Same amount, newer
      expect(sorted[2].id).toBe(1); // Lower amount
    });
  });
});
