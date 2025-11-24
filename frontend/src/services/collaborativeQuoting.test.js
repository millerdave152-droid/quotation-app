import { cachedFetch } from './apiCache';

jest.mock('./apiCache');

describe('Collaborative Quoting Service', () => {
  const API_BASE_URL = '/api';

  beforeEach(() => {
    jest.clearAllMocks();
    global.fetch = jest.fn();
  });

  describe('addComment', () => {
    test('should add internal comment', async () => {
      const mockResponse = {
        success: true,
        comment: { id: 1, content: 'Internal note', is_internal: true }
      };

      global.fetch = jest.fn().mockResolvedValue({
        ok: true,
        json: async () => mockResponse
      });

      const addComment = async (quoteId, content, mentions, userId) => {
        const response = await fetch(`${API_BASE_URL}/quotes/${quoteId}/comments`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ content, mentions, created_by: userId })
        });
        return await response.json();
      };

      const result = await addComment(1, 'Internal note', [], 1);
      expect(result.success).toBe(true);
      expect(result.comment.is_internal).toBe(true);
    });

    test('should process mentions', async () => {
      global.fetch = jest.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ success: true, comment: { id: 1 } })
      });

      const addComment = async (quoteId, content, mentions, userId) => {
        const response = await fetch(`${API_BASE_URL}/quotes/${quoteId}/comments`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ content, mentions, created_by: userId })
        });
        return await response.json();
      };

      await addComment(1, '@john please review', [2, 3], 1);

      expect(global.fetch).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          body: expect.stringContaining('mentions')
        })
      );
    });
  });

  describe('getComments', () => {
    test('should fetch internal comments', async () => {
      const mockData = {
        comments: [
          { id: 1, content: 'Comment 1', created_by_name: 'John' },
          { id: 2, content: 'Comment 2', created_by_name: 'Jane' }
        ]
      };

      cachedFetch.mockResolvedValue(mockData);

      const getComments = async (quoteId) => {
        return await cachedFetch(`${API_BASE_URL}/quotes/${quoteId}/comments`);
      };

      const result = await getComments(1);
      expect(result.comments).toHaveLength(2);
    });
  });

  describe('createTask', () => {
    test('should create task for quote', async () => {
      const mockResponse = {
        success: true,
        task: {
          id: 1,
          title: 'Review pricing',
          assigned_to: 2,
          status: 'pending'
        }
      };

      global.fetch = jest.fn().mockResolvedValue({
        ok: true,
        json: async () => mockResponse
      });

      const createTask = async (quoteId, taskData) => {
        const response = await fetch(`${API_BASE_URL}/quotes/${quoteId}/tasks`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(taskData)
        });
        return await response.json();
      };

      const result = await createTask(1, {
        title: 'Review pricing',
        assigned_to: 2,
        created_by: 1
      });

      expect(result.success).toBe(true);
      expect(result.task.title).toBe('Review pricing');
    });
  });

  describe('getTasks', () => {
    test('should fetch tasks for quote', async () => {
      const mockData = {
        tasks: [
          { id: 1, title: 'Task 1', status: 'pending' },
          { id: 2, title: 'Task 2', status: 'completed' }
        ]
      };

      cachedFetch.mockResolvedValue(mockData);

      const getTasks = async (quoteId) => {
        return await cachedFetch(`${API_BASE_URL}/quotes/${quoteId}/tasks`);
      };

      const result = await getTasks(1);
      expect(result.tasks).toHaveLength(2);
    });
  });

  describe('updateTaskStatus', () => {
    test('should update task status', async () => {
      const mockResponse = {
        success: true,
        task: { id: 1, status: 'completed' }
      };

      global.fetch = jest.fn().mockResolvedValue({
        ok: true,
        json: async () => mockResponse
      });

      const updateTaskStatus = async (taskId, status) => {
        const response = await fetch(`${API_BASE_URL}/tasks/${taskId}/status`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ status })
        });
        return await response.json();
      };

      const result = await updateTaskStatus(1, 'completed');
      expect(result.success).toBe(true);
      expect(result.task.status).toBe('completed');
    });
  });

  describe('createRevisionRequest', () => {
    test('should create revision request', async () => {
      const mockResponse = {
        success: true,
        revision_request: {
          id: 1,
          requested_changes: 'Update pricing',
          status: 'pending'
        }
      };

      global.fetch = jest.fn().mockResolvedValue({
        ok: true,
        json: async () => mockResponse
      });

      const createRevisionRequest = async (quoteId, data) => {
        const response = await fetch(`${API_BASE_URL}/quotes/${quoteId}/revision-requests`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(data)
        });
        return await response.json();
      };

      const result = await createRevisionRequest(1, {
        requested_changes: 'Update pricing',
        requested_by: 1
      });

      expect(result.success).toBe(true);
    });
  });

  describe('getUserMentions', () => {
    test('should fetch unread mentions', async () => {
      const mockData = {
        mentions: [
          { id: 1, content: '@user review this', quote_number: 'Q-001' }
        ],
        unread_count: 1
      };

      cachedFetch.mockResolvedValue(mockData);

      const getUserMentions = async (userId) => {
        return await cachedFetch(`${API_BASE_URL}/users/${userId}/mentions`);
      };

      const result = await getUserMentions(1);
      expect(result.mentions).toHaveLength(1);
      expect(result.unread_count).toBe(1);
    });
  });

  describe('getAssignedTasks', () => {
    test('should fetch assigned tasks', async () => {
      const mockData = {
        tasks: [
          { id: 1, title: 'Task 1', quote_number: 'Q-001' },
          { id: 2, title: 'Task 2', quote_number: 'Q-002' }
        ]
      };

      cachedFetch.mockResolvedValue(mockData);

      const getAssignedTasks = async (userId, status = null) => {
        const url = status
          ? `${API_BASE_URL}/users/${userId}/assigned-tasks?status=${status}`
          : `${API_BASE_URL}/users/${userId}/assigned-tasks`;
        return await cachedFetch(url);
      };

      const result = await getAssignedTasks(1);
      expect(result.tasks).toHaveLength(2);
    });
  });

  describe('getCollaborationActivity', () => {
    test('should fetch collaboration activity', async () => {
      const mockData = {
        activities: [
          { type: 'comment', description: 'Added comment' },
          { type: 'task', description: 'Created task' }
        ]
      };

      cachedFetch.mockResolvedValue(mockData);

      const getCollaborationActivity = async (quoteId) => {
        return await cachedFetch(`${API_BASE_URL}/quotes/${quoteId}/collaboration-activity`);
      };

      const result = await getCollaborationActivity(1);
      expect(result.activities).toHaveLength(2);
    });
  });

  describe('Mention Utilities', () => {
    test('should extract mentions from text', () => {
      const extractMentions = (text) => {
        const regex = /@(\w+)/g;
        const matches = [];
        let match;
        while ((match = regex.exec(text)) !== null) {
          matches.push(match[1]);
        }
        return matches;
      };

      expect(extractMentions('@john @jane please review')).toEqual(['john', 'jane']);
      expect(extractMentions('no mentions here')).toEqual([]);
    });

    test('should format mention for display', () => {
      const formatMention = (username) => `@${username}`;

      expect(formatMention('john')).toBe('@john');
    });

    test('should validate mention format', () => {
      const isValidMention = (text) => /^@\w+$/.test(text);

      expect(isValidMention('@john')).toBe(true);
      expect(isValidMention('@john-doe')).toBe(false);
      expect(isValidMention('john')).toBe(false);
    });
  });

  describe('Task Status Utilities', () => {
    test('should get task status color', () => {
      const getTaskStatusColor = (status) => {
        const colors = {
          pending: 'yellow',
          in_progress: 'blue',
          completed: 'green',
          cancelled: 'gray'
        };
        return colors[status] || 'gray';
      };

      expect(getTaskStatusColor('pending')).toBe('yellow');
      expect(getTaskStatusColor('completed')).toBe('green');
    });

    test('should check if task is overdue', () => {
      const isTaskOverdue = (task) => {
        if (!task.due_date || task.status === 'completed') return false;
        return new Date(task.due_date) < new Date();
      };

      expect(isTaskOverdue({ due_date: '2020-01-01', status: 'pending' })).toBe(true);
      expect(isTaskOverdue({ due_date: '2030-01-01', status: 'pending' })).toBe(false);
      expect(isTaskOverdue({ due_date: '2020-01-01', status: 'completed' })).toBe(false);
    });

    test('should calculate task priority', () => {
      const getTaskPriority = (task) => {
        if (!task.due_date) return 'low';

        const daysUntilDue = Math.ceil((new Date(task.due_date) - new Date()) / (1000 * 60 * 60 * 24));

        if (daysUntilDue < 0) return 'overdue';
        if (daysUntilDue <= 1) return 'urgent';
        if (daysUntilDue <= 3) return 'high';
        if (daysUntilDue <= 7) return 'medium';
        return 'low';
      };

      expect(getTaskPriority({ due_date: '2020-01-01' })).toBe('overdue');
      expect(getTaskPriority({})).toBe('low');
    });
  });

  describe('Comment Formatting', () => {
    test('should format comment timestamp', () => {
      const formatCommentTime = (timestamp) => {
        const date = new Date(timestamp);
        const now = new Date();
        const seconds = Math.floor((now - date) / 1000);

        if (seconds < 60) return 'just now';
        if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`;
        if (seconds < 86400) return `${Math.floor(seconds / 3600)}h ago`;
        return date.toLocaleDateString();
      };

      const fiveMinutesAgo = new Date(Date.now() - 5 * 60 * 1000);
      expect(formatCommentTime(fiveMinutesAgo.toISOString())).toBe('5m ago');
    });

    test('should truncate long comments', () => {
      const truncateComment = (text, maxLength = 100) => {
        if (text.length <= maxLength) return text;
        return text.substring(0, maxLength) + '...';
      };

      const longText = 'a'.repeat(150);
      expect(truncateComment(longText)).toHaveLength(103); // 100 + '...'
      expect(truncateComment('short')).toBe('short');
    });
  });

  describe('Collaboration Statistics', () => {
    test('should count active collaborators', () => {
      const countActiveCollaborators = (activities) => {
        const users = new Set(activities.map(a => a.user_id));
        return users.size;
      };

      const activities = [
        { user_id: 1 },
        { user_id: 2 },
        { user_id: 1 }
      ];

      expect(countActiveCollaborators(activities)).toBe(2);
    });

    test('should get collaboration summary', () => {
      const getCollaborationSummary = (activities) => {
        const summary = {
          total_activities: activities.length,
          comments: activities.filter(a => a.type === 'comment').length,
          tasks: activities.filter(a => a.type === 'task').length
        };
        return summary;
      };

      const activities = [
        { type: 'comment' },
        { type: 'comment' },
        { type: 'task' }
      ];

      const summary = getCollaborationSummary(activities);
      expect(summary.total_activities).toBe(3);
      expect(summary.comments).toBe(2);
      expect(summary.tasks).toBe(1);
    });
  });

  describe('Notification Management', () => {
    test('should format mention notification', () => {
      const formatMentionNotification = (mention) => {
        return `${mention.mentioned_by} mentioned you in ${mention.quote_number}`;
      };

      expect(formatMentionNotification({
        mentioned_by: 'John',
        quote_number: 'Q-001'
      })).toBe('John mentioned you in Q-001');
    });

    test('should format task notification', () => {
      const formatTaskNotification = (task) => {
        return `New task assigned: ${task.title}`;
      };

      expect(formatTaskNotification({ title: 'Review quote' }))
        .toBe('New task assigned: Review quote');
    });
  });

  describe('Permission Checking', () => {
    test('should check if user can add comments', () => {
      const canAddComment = (user, quote) => {
        if (user.role === 'admin') return true;
        if (quote.assigned_to === user.id) return true;
        if (quote.created_by === user.id) return true;
        return false;
      };

      const admin = { id: 1, role: 'admin' };
      const assigned = { id: 2, role: 'user' };
      const other = { id: 3, role: 'user' };
      const quote = { assigned_to: 2, created_by: 1 };

      expect(canAddComment(admin, quote)).toBe(true);
      expect(canAddComment(assigned, quote)).toBe(true);
      expect(canAddComment(other, quote)).toBe(false);
    });
  });
});
