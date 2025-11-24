import { cachedFetch } from './apiCache';

jest.mock('./apiCache');

describe('Activity Feed Service', () => {
  const API_BASE_URL = '/api';

  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('createActivity', () => {
    test('should create activity log entry', async () => {
      const mockResponse = {
        success: true,
        activity: {
          id: 1,
          activity_type: 'quote_created',
          description: 'Quote #Q-001 created'
        }
      };

      global.fetch = jest.fn().mockResolvedValue({
        ok: true,
        json: async () => mockResponse
      });

      const createActivity = async (data) => {
        const response = await fetch(`${API_BASE_URL}/activities`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(data)
        });
        return await response.json();
      };

      const result = await createActivity({
        activity_type: 'quote_created',
        quotation_id: 1,
        description: 'Quote #Q-001 created'
      });

      expect(result.success).toBe(true);
      expect(result.activity.activity_type).toBe('quote_created');
    });
  });

  describe('getActivities', () => {
    test('should fetch activity feed', async () => {
      const mockData = {
        activities: [
          { id: 1, activity_type: 'quote_created', description: 'Quote created' },
          { id: 2, activity_type: 'quote_sent', description: 'Quote sent' }
        ],
        total: 2
      };

      cachedFetch.mockResolvedValue(mockData);

      const getActivities = async (filters = {}) => {
        const params = new URLSearchParams(filters);
        return await cachedFetch(`${API_BASE_URL}/activities?${params}`);
      };

      const result = await getActivities();
      expect(result.activities).toHaveLength(2);
      expect(result.total).toBe(2);
    });

    test('should filter by activity type', async () => {
      cachedFetch.mockResolvedValue({ activities: [], total: 0 });

      const getActivities = async (filters = {}) => {
        const params = new URLSearchParams(filters);
        return await cachedFetch(`${API_BASE_URL}/activities?${params}`);
      };

      await getActivities({ activity_type: 'quote_created' });
      expect(cachedFetch).toHaveBeenCalledWith(expect.stringContaining('activity_type=quote_created'));
    });
  });

  describe('getQuotationActivities', () => {
    test('should fetch activities for quotation', async () => {
      const mockData = {
        activities: [
          { id: 1, description: 'Created' },
          { id: 2, description: 'Sent' }
        ],
        quotation_id: 1
      };

      cachedFetch.mockResolvedValue(mockData);

      const getQuotationActivities = async (quotationId) => {
        return await cachedFetch(`${API_BASE_URL}/quotations/${quotationId}/activities`);
      };

      const result = await getQuotationActivities(1);
      expect(result.activities).toHaveLength(2);
      expect(result.quotation_id).toBe(1);
    });
  });

  describe('getUserActivities', () => {
    test('should fetch activities by user', async () => {
      const mockData = {
        activities: [
          { id: 1, user_name: 'John Doe' },
          { id: 2, user_name: 'John Doe' }
        ],
        user_id: 1
      };

      cachedFetch.mockResolvedValue(mockData);

      const getUserActivities = async (userId) => {
        return await cachedFetch(`${API_BASE_URL}/activities/user/${userId}`);
      };

      const result = await getUserActivities(1);
      expect(result.activities).toHaveLength(2);
      expect(result.user_id).toBe(1);
    });
  });

  describe('getStatistics', () => {
    test('should fetch activity statistics', async () => {
      const mockData = {
        total_activities: 150,
        active_users: 10,
        quotes_with_activity: 50,
        by_type: [
          { activity_type: 'quote_created', count: 50 }
        ],
        top_users: [
          { user_id: 1, name: 'John Doe', activity_count: 30 }
        ]
      };

      cachedFetch.mockResolvedValue(mockData);

      const getStatistics = async (startDate, endDate) => {
        return await cachedFetch(`${API_BASE_URL}/activities/statistics?start_date=${startDate}&end_date=${endDate}`);
      };

      const result = await getStatistics('2024-01-01', '2024-12-31');
      expect(result.total_activities).toBe(150);
      expect(result.by_type).toHaveLength(1);
    });
  });

  describe('getTimeline', () => {
    test('should fetch activity timeline', async () => {
      const mockData = {
        interval: 'daily',
        timeline: [
          { period: '2024-01-01', activity_count: 10 },
          { period: '2024-01-02', activity_count: 15 }
        ]
      };

      cachedFetch.mockResolvedValue(mockData);

      const getTimeline = async (interval, startDate, endDate) => {
        return await cachedFetch(`${API_BASE_URL}/activities/timeline?interval=${interval}&start_date=${startDate}&end_date=${endDate}`);
      };

      const result = await getTimeline('daily', '2024-01-01', '2024-01-31');
      expect(result.interval).toBe('daily');
      expect(result.timeline).toHaveLength(2);
    });
  });

  describe('Activity Type Helpers', () => {
    test('should get activity type label', () => {
      const getActivityTypeLabel = (type) => {
        const labels = {
          quote_created: 'Quote Created',
          quote_updated: 'Quote Updated',
          quote_sent: 'Quote Sent',
          quote_accepted: 'Quote Accepted',
          quote_rejected: 'Quote Rejected'
        };
        return labels[type] || type;
      };

      expect(getActivityTypeLabel('quote_created')).toBe('Quote Created');
      expect(getActivityTypeLabel('unknown')).toBe('unknown');
    });

    test('should get activity type icon', () => {
      const getActivityTypeIcon = (type) => {
        const icons = {
          quote_created: 'plus',
          quote_updated: 'edit',
          quote_sent: 'send',
          quote_accepted: 'check',
          quote_rejected: 'x'
        };
        return icons[type] || 'activity';
      };

      expect(getActivityTypeIcon('quote_created')).toBe('plus');
      expect(getActivityTypeIcon('quote_sent')).toBe('send');
    });

    test('should get activity type color', () => {
      const getActivityTypeColor = (type) => {
        if (type.includes('created')) return 'blue';
        if (type.includes('accepted') || type.includes('granted')) return 'green';
        if (type.includes('rejected') || type.includes('denied') || type.includes('deleted')) return 'red';
        if (type.includes('sent')) return 'purple';
        return 'gray';
      };

      expect(getActivityTypeColor('quote_created')).toBe('blue');
      expect(getActivityTypeColor('quote_accepted')).toBe('green');
      expect(getActivityTypeColor('quote_rejected')).toBe('red');
    });
  });

  describe('Time Formatting', () => {
    test('should format relative time', () => {
      const formatRelativeTime = (dateString) => {
        const now = new Date();
        const date = new Date(dateString);
        const seconds = Math.floor((now - date) / 1000);

        if (seconds < 60) return 'just now';
        if (seconds < 3600) return `${Math.floor(seconds / 60)} minutes ago`;
        if (seconds < 86400) return `${Math.floor(seconds / 3600)} hours ago`;
        if (seconds < 604800) return `${Math.floor(seconds / 86400)} days ago`;
        return date.toLocaleDateString();
      };

      const now = new Date();
      const fiveMinutesAgo = new Date(now - 5 * 60 * 1000);

      expect(formatRelativeTime(fiveMinutesAgo.toISOString())).toBe('5 minutes ago');
    });

    test('should group activities by date', () => {
      const groupByDate = (activities) => {
        const groups = {};
        activities.forEach(activity => {
          const date = activity.created_at.split('T')[0];
          if (!groups[date]) groups[date] = [];
          groups[date].push(activity);
        });
        return groups;
      };

      const activities = [
        { id: 1, created_at: '2024-01-15T10:00:00Z' },
        { id: 2, created_at: '2024-01-15T11:00:00Z' },
        { id: 3, created_at: '2024-01-16T10:00:00Z' }
      ];

      const grouped = groupByDate(activities);
      expect(Object.keys(grouped)).toHaveLength(2);
      expect(grouped['2024-01-15']).toHaveLength(2);
    });
  });

  describe('Activity Filtering', () => {
    test('should filter by date range', () => {
      const filterByDateRange = (activities, startDate, endDate) => {
        return activities.filter(activity => {
          const date = new Date(activity.created_at);
          return date >= new Date(startDate) && date <= new Date(endDate);
        });
      };

      const activities = [
        { id: 1, created_at: '2024-01-10T10:00:00Z' },
        { id: 2, created_at: '2024-01-15T10:00:00Z' },
        { id: 3, created_at: '2024-01-20T10:00:00Z' }
      ];

      const filtered = filterByDateRange(activities, '2024-01-12', '2024-01-18');
      expect(filtered).toHaveLength(1);
      expect(filtered[0].id).toBe(2);
    });

    test('should filter by user', () => {
      const filterByUser = (activities, userId) => {
        return activities.filter(activity => activity.user_id === userId);
      };

      const activities = [
        { id: 1, user_id: 1 },
        { id: 2, user_id: 2 },
        { id: 3, user_id: 1 }
      ];

      const filtered = filterByUser(activities, 1);
      expect(filtered).toHaveLength(2);
    });

    test('should search activities', () => {
      const searchActivities = (activities, query) => {
        const lowerQuery = query.toLowerCase();
        return activities.filter(activity =>
          activity.description.toLowerCase().includes(lowerQuery)
        );
      };

      const activities = [
        { description: 'Quote Q-001 created' },
        { description: 'Quote Q-002 sent to customer' },
        { description: 'Quote Q-001 accepted' }
      ];

      const results = searchActivities(activities, 'Q-001');
      expect(results).toHaveLength(2);
    });
  });

  describe('Activity Sorting', () => {
    test('should sort by date descending', () => {
      const sortByDate = (activities, order = 'desc') => {
        return [...activities].sort((a, b) => {
          const dateA = new Date(a.created_at);
          const dateB = new Date(b.created_at);
          return order === 'desc' ? dateB - dateA : dateA - dateB;
        });
      };

      const activities = [
        { id: 1, created_at: '2024-01-10T10:00:00Z' },
        { id: 2, created_at: '2024-01-15T10:00:00Z' },
        { id: 3, created_at: '2024-01-12T10:00:00Z' }
      ];

      const sorted = sortByDate(activities, 'desc');
      expect(sorted[0].id).toBe(2);
      expect(sorted[2].id).toBe(1);
    });
  });

  describe('Export Utilities', () => {
    test('should prepare activities for export', () => {
      const prepareForExport = (activities) => {
        return activities.map(activity => ({
          Date: new Date(activity.created_at).toLocaleString(),
          Type: activity.activity_type,
          Description: activity.description,
          User: activity.user_name || 'Unknown'
        }));
      };

      const activities = [
        {
          created_at: '2024-01-15T10:00:00Z',
          activity_type: 'quote_created',
          description: 'Quote created',
          user_name: 'John Doe'
        }
      ];

      const exported = prepareForExport(activities);
      expect(exported[0]).toHaveProperty('Date');
      expect(exported[0]).toHaveProperty('Type');
      expect(exported[0].User).toBe('John Doe');
    });

    test('should generate CSV from activities', () => {
      const generateCSV = (activities) => {
        const headers = ['Date', 'Type', 'Description', 'User'];
        const rows = activities.map(a => [
          new Date(a.created_at).toLocaleString(),
          a.activity_type,
          a.description,
          a.user_name || 'Unknown'
        ]);

        return [
          headers.join(','),
          ...rows.map(row => row.map(cell => `"${cell}"`).join(','))
        ].join('\n');
      };

      const activities = [
        {
          created_at: '2024-01-15T10:00:00Z',
          activity_type: 'quote_created',
          description: 'Quote created',
          user_name: 'John Doe'
        }
      ];

      const csv = generateCSV(activities);
      expect(csv).toContain('Date,Type,Description,User');
      expect(csv).toContain('quote_created');
    });
  });

  describe('Activity Aggregation', () => {
    test('should count activities by type', () => {
      const countByType = (activities) => {
        const counts = {};
        activities.forEach(activity => {
          counts[activity.activity_type] = (counts[activity.activity_type] || 0) + 1;
        });
        return counts;
      };

      const activities = [
        { activity_type: 'quote_created' },
        { activity_type: 'quote_sent' },
        { activity_type: 'quote_created' }
      ];

      const counts = countByType(activities);
      expect(counts.quote_created).toBe(2);
      expect(counts.quote_sent).toBe(1);
    });

    test('should get activity summary', () => {
      const getActivitySummary = (activities) => {
        const uniqueUsers = new Set(activities.map(a => a.user_id)).size;
        const uniqueQuotes = new Set(activities.filter(a => a.quotation_id).map(a => a.quotation_id)).size;

        return {
          total: activities.length,
          uniqueUsers,
          uniqueQuotes,
          timeRange: {
            start: activities[activities.length - 1]?.created_at,
            end: activities[0]?.created_at
          }
        };
      };

      const activities = [
        { user_id: 1, quotation_id: 1, created_at: '2024-01-15T10:00:00Z' },
        { user_id: 2, quotation_id: 1, created_at: '2024-01-14T10:00:00Z' },
        { user_id: 1, quotation_id: 2, created_at: '2024-01-13T10:00:00Z' }
      ];

      const summary = getActivitySummary(activities);
      expect(summary.total).toBe(3);
      expect(summary.uniqueUsers).toBe(2);
      expect(summary.uniqueQuotes).toBe(2);
    });
  });

  describe('Pagination', () => {
    test('should calculate pagination info', () => {
      const getPaginationInfo = (total, limit, offset) => {
        const currentPage = Math.floor(offset / limit) + 1;
        const totalPages = Math.ceil(total / limit);
        const hasNext = offset + limit < total;
        const hasPrev = offset > 0;

        return {
          currentPage,
          totalPages,
          hasNext,
          hasPrev,
          showing: {
            from: offset + 1,
            to: Math.min(offset + limit, total),
            total
          }
        };
      };

      const pagination = getPaginationInfo(100, 20, 40);
      expect(pagination.currentPage).toBe(3);
      expect(pagination.totalPages).toBe(5);
      expect(pagination.hasNext).toBe(true);
      expect(pagination.hasPrev).toBe(true);
      expect(pagination.showing.from).toBe(41);
      expect(pagination.showing.to).toBe(60);
    });
  });
});
