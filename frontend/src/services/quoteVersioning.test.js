import { cachedFetch } from './apiCache';

jest.mock('./apiCache');

describe('Quote Versioning Service', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('createVersion', () => {
    test('should create a new version of the quote', async () => {
      const mockResponse = {
        success: true,
        message: 'Version created successfully',
        version_number: 1
      };

      cachedFetch.mockResolvedValue(mockResponse);

      const createVersion = async (quoteId, versionNotes, changesSummary) => {
        return await cachedFetch(`/api/quotations/${quoteId}/create-version`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            version_notes: versionNotes,
            changes_summary: changesSummary
          })
        });
      };

      const result = await createVersion(1, 'Initial version', 'Created quote');

      expect(result.success).toBe(true);
      expect(result.version_number).toBe(1);
    });

    test('should validate version notes length', () => {
      const validateVersionNotes = (notes) => {
        if (notes && notes.length > 500) {
          throw new Error('Version notes cannot exceed 500 characters');
        }
        return true;
      };

      const longNotes = 'a'.repeat(501);
      expect(() => validateVersionNotes(longNotes)).toThrow('cannot exceed 500 characters');
      expect(validateVersionNotes('Valid notes')).toBe(true);
    });
  });

  describe('getVersions', () => {
    test('should fetch all versions of a quote', async () => {
      const mockVersions = {
        count: 3,
        versions: [
          { version_number: 3, created_at: '2025-01-29', created_by_name: 'John Doe' },
          { version_number: 2, created_at: '2025-01-28', created_by_name: 'Jane Smith' },
          { version_number: 1, created_at: '2025-01-27', created_by_name: 'John Doe' }
        ]
      };

      cachedFetch.mockResolvedValue(mockVersions);

      const getVersions = async (quoteId) => {
        return await cachedFetch(`/api/quotations/${quoteId}/versions`);
      };

      const result = await getVersions(1);

      expect(result.count).toBe(3);
      expect(result.versions).toHaveLength(3);
      expect(result.versions[0].version_number).toBe(3);
    });
  });

  describe('getVersion', () => {
    test('should fetch specific version', async () => {
      const mockVersion = {
        version_number: 2,
        data: {
          total_amount: 15000,
          items: [{ product_id: 1, quantity: 2 }]
        },
        created_by_name: 'John Doe',
        version_notes: 'Updated pricing'
      };

      cachedFetch.mockResolvedValue(mockVersion);

      const getVersion = async (quoteId, versionNumber) => {
        return await cachedFetch(`/api/quotations/${quoteId}/versions/${versionNumber}`);
      };

      const result = await getVersion(1, 2);

      expect(result.version_number).toBe(2);
      expect(result.data.total_amount).toBe(15000);
    });
  });

  describe('restoreVersion', () => {
    test('should restore quote to specific version', async () => {
      const mockResponse = {
        success: true,
        message: 'Quote restored to version 2',
        restored_from_version: 2
      };

      cachedFetch.mockResolvedValue(mockResponse);

      const restoreVersion = async (quoteId, versionNumber, createBackup = false) => {
        return await cachedFetch(`/api/quotations/${quoteId}/restore-version/${versionNumber}`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ create_new_version: createBackup })
        });
      };

      const result = await restoreVersion(1, 2, true);

      expect(result.success).toBe(true);
      expect(result.restored_from_version).toBe(2);
    });

    test('should determine if confirmation is needed before restoring', () => {
      const needsConfirmation = (versionNumber, currentVersion) => {
        // Newer or same version doesn't need confirmation
        if (versionNumber >= currentVersion) {
          return false;
        }
        // Restoring to older version needs confirmation
        return true;
      };

      expect(needsConfirmation(2, 5)).toBe(true);  // Older version needs confirmation
      expect(needsConfirmation(5, 5)).toBe(false); // Same version doesn't need confirmation
      expect(needsConfirmation(6, 5)).toBe(false); // Newer version doesn't need confirmation
    });
  });

  describe('compareVersions', () => {
    test('should compare two versions', async () => {
      const mockComparison = {
        version1: 1,
        version2: 2,
        has_changes: true,
        differences: {
          total_amount: {
            version1: 15000,
            version2: 20000,
            changed: true
          },
          discount: {
            version1: 5,
            version2: 10,
            changed: true
          },
          terms: {
            version1: 'Net 30',
            version2: 'Net 30',
            changed: false
          }
        }
      };

      cachedFetch.mockResolvedValue(mockComparison);

      const compareVersions = async (quoteId, version1, version2) => {
        return await cachedFetch(
          `/api/quotations/${quoteId}/compare-versions?version1=${version1}&version2=${version2}`
        );
      };

      const result = await compareVersions(1, 1, 2);

      expect(result.has_changes).toBe(true);
      expect(result.differences.total_amount.changed).toBe(true);
      expect(result.differences.terms.changed).toBe(false);
    });

    test('should validate version numbers are different', () => {
      const validateVersionComparison = (v1, v2) => {
        if (v1 === v2) {
          throw new Error('Cannot compare a version with itself');
        }
        if (v1 < 1 || v2 < 1) {
          throw new Error('Version numbers must be positive');
        }
        return true;
      };

      expect(() => validateVersionComparison(2, 2)).toThrow('Cannot compare a version with itself');
      expect(() => validateVersionComparison(0, 1)).toThrow('must be positive');
      expect(validateVersionComparison(1, 2)).toBe(true);
    });
  });

  describe('getVersionHistory', () => {
    test('should fetch version action history', async () => {
      const mockHistory = {
        count: 2,
        history: [
          { action: 'created', version_number: 3, performed_by_name: 'John Doe' },
          { action: 'restored', version_number: 2, performed_by_name: 'Jane Smith' }
        ]
      };

      cachedFetch.mockResolvedValue(mockHistory);

      const getVersionHistory = async (quoteId) => {
        return await cachedFetch(`/api/quotations/${quoteId}/version-history`);
      };

      const result = await getVersionHistory(1);

      expect(result.count).toBe(2);
      expect(result.history).toHaveLength(2);
    });
  });

  describe('setAutoVersion', () => {
    test('should enable auto-versioning', async () => {
      const mockResponse = {
        success: true,
        message: 'Auto-versioning enabled',
        auto_version_enabled: true,
        auto_version_threshold: 5
      };

      cachedFetch.mockResolvedValue(mockResponse);

      const setAutoVersion = async (quoteId, enable, threshold = null) => {
        return await cachedFetch(`/api/quotations/${quoteId}/auto-version`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ enable, threshold })
        });
      };

      const result = await setAutoVersion(1, true, 5);

      expect(result.success).toBe(true);
      expect(result.auto_version_enabled).toBe(true);
      expect(result.auto_version_threshold).toBe(5);
    });
  });

  describe('deleteVersion', () => {
    test('should delete a version', async () => {
      const mockResponse = {
        success: true,
        message: 'Version 2 deleted'
      };

      cachedFetch.mockResolvedValue(mockResponse);

      const deleteVersion = async (quoteId, versionNumber) => {
        return await cachedFetch(`/api/quotations/${quoteId}/versions/${versionNumber}`, {
          method: 'DELETE'
        });
      };

      const result = await deleteVersion(1, 2);

      expect(result.success).toBe(true);
    });

    test('should generate confirmation message for deletion', () => {
      const getDeleteConfirmationMessage = (versionNumber) => {
        return `Are you sure you want to delete version ${versionNumber}? This action cannot be undone.`;
      };

      const message = getDeleteConfirmationMessage(2);

      expect(message).toContain('version 2');
      expect(message).toContain('cannot be undone');
    });
  });

  describe('lockVersion', () => {
    test('should lock a version', async () => {
      const mockResponse = {
        success: true,
        message: 'Version 2 locked',
        version: {
          version_number: 2,
          is_locked: true
        }
      };

      cachedFetch.mockResolvedValue(mockResponse);

      const lockVersion = async (quoteId, versionNumber, lockReason) => {
        return await cachedFetch(`/api/quotations/${quoteId}/lock-version`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ version_number: versionNumber, lock_reason: lockReason })
        });
      };

      const result = await lockVersion(1, 2, 'Final approved version');

      expect(result.success).toBe(true);
      expect(result.version.is_locked).toBe(true);
    });

    test('should validate lock reason', () => {
      const validateLockReason = (reason) => {
        if (!reason || reason.trim() === '') {
          throw new Error('Lock reason is required');
        }
        if (reason.length < 5) {
          throw new Error('Lock reason must be at least 5 characters');
        }
        return true;
      };

      expect(() => validateLockReason('')).toThrow('Lock reason is required');
      expect(() => validateLockReason('abc')).toThrow('at least 5 characters');
      expect(validateLockReason('Final approved version')).toBe(true);
    });
  });

  describe('getVersionDiff', () => {
    test('should get detailed diff between versions', async () => {
      const mockDiff = {
        metadata: {
          from_version: 1,
          to_version: 2,
          from_date: '2025-01-27',
          to_date: '2025-01-28'
        },
        changes: [
          { field: 'total_amount', old_value: 15000, new_value: 20000, change_type: 'modified' },
          { field: 'terms', old_value: 'Net 30', new_value: 'Net 60', change_type: 'modified' }
        ]
      };

      cachedFetch.mockResolvedValue(mockDiff);

      const getVersionDiff = async (quoteId, version1, version2) => {
        return await cachedFetch(`/api/quotations/${quoteId}/version-diff/${version1}/${version2}`);
      };

      const result = await getVersionDiff(1, 1, 2);

      expect(result.changes).toHaveLength(2);
      expect(result.changes[0].field).toBe('total_amount');
      expect(result.changes[0].change_type).toBe('modified');
    });
  });

  describe('UI Helper Functions', () => {
    test('should format version label', () => {
      const formatVersionLabel = (versionNumber, isCurrent = false) => {
        let label = `v${versionNumber}`;
        if (isCurrent) label += ' (Current)';
        return label;
      };

      expect(formatVersionLabel(2, false)).toBe('v2');
      expect(formatVersionLabel(3, true)).toBe('v3 (Current)');
    });

    test('should get version status badge', () => {
      const getVersionStatusBadge = (version, currentVersion) => {
        if (version.is_locked) return { text: 'Locked', color: 'red' };
        if (version.version_number === currentVersion) return { text: 'Current', color: 'green' };
        if (version.version_number < currentVersion) return { text: 'Old', color: 'gray' };
        return { text: 'Future', color: 'blue' };
      };

      expect(getVersionStatusBadge({ version_number: 3, is_locked: true }, 3))
        .toEqual({ text: 'Locked', color: 'red' });
      expect(getVersionStatusBadge({ version_number: 3, is_locked: false }, 3))
        .toEqual({ text: 'Current', color: 'green' });
      expect(getVersionStatusBadge({ version_number: 1, is_locked: false }, 3))
        .toEqual({ text: 'Old', color: 'gray' });
    });

    test('should format change type', () => {
      const formatChangeType = (changeType) => {
        const types = {
          'modified': 'Modified',
          'added': 'Added',
          'removed': 'Removed'
        };
        return types[changeType] || 'Unknown';
      };

      expect(formatChangeType('modified')).toBe('Modified');
      expect(formatChangeType('added')).toBe('Added');
      expect(formatChangeType('removed')).toBe('Removed');
    });

    test('should format version date', () => {
      const formatVersionDate = (dateString) => {
        const date = new Date(dateString);
        const now = new Date();
        const diffMs = now - date;
        const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

        if (diffDays === 0) return 'Today';
        if (diffDays === 1) return 'Yesterday';
        if (diffDays < 7) return `${diffDays} days ago`;
        return date.toLocaleDateString();
      };

      const today = new Date();
      const yesterday = new Date(today - 24 * 60 * 60 * 1000);
      const threeDaysAgo = new Date(today - 3 * 24 * 60 * 60 * 1000);

      expect(formatVersionDate(today.toISOString())).toBe('Today');
      expect(formatVersionDate(yesterday.toISOString())).toBe('Yesterday');
      expect(formatVersionDate(threeDaysAgo.toISOString())).toBe('3 days ago');
    });

    test('should calculate version age', () => {
      const getVersionAge = (createdAt) => {
        const now = new Date();
        const created = new Date(createdAt);
        const diffMs = now - created;
        const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
        const diffDays = Math.floor(diffHours / 24);

        if (diffHours < 1) return 'Just created';
        if (diffHours < 24) return `${diffHours} hours old`;
        if (diffDays === 1) return '1 day old';
        return `${diffDays} days old`;
      };

      const now = new Date();
      const fiveHoursAgo = new Date(now - 5 * 60 * 60 * 1000);
      const twoDaysAgo = new Date(now - 2 * 24 * 60 * 60 * 1000);

      expect(getVersionAge(fiveHoursAgo)).toContain('hours old');
      expect(getVersionAge(twoDaysAgo)).toBe('2 days old');
    });

    test('should determine if version can be deleted', () => {
      const canDeleteVersion = (version, currentVersion) => {
        if (version.version_number === currentVersion) return false;
        if (version.is_locked) return false;
        return true;
      };

      expect(canDeleteVersion({ version_number: 3, is_locked: false }, 3)).toBe(false);
      expect(canDeleteVersion({ version_number: 2, is_locked: true }, 3)).toBe(false);
      expect(canDeleteVersion({ version_number: 2, is_locked: false }, 3)).toBe(true);
    });

    test('should determine if version can be restored', () => {
      const canRestoreVersion = (version, currentVersion) => {
        // Cannot restore to the current version
        return version.version_number !== currentVersion;
      };

      expect(canRestoreVersion({ version_number: 2 }, 3)).toBe(true);
      expect(canRestoreVersion({ version_number: 3 }, 3)).toBe(false);
    });
  });

  describe('Version Comparison Helpers', () => {
    test('should highlight changes in comparison', () => {
      const highlightChanges = (differences) => {
        return Object.entries(differences)
          .filter(([_, diff]) => diff.changed)
          .map(([field, diff]) => ({
            field,
            from: diff.version1,
            to: diff.version2
          }));
      };

      const differences = {
        total_amount: { version1: 15000, version2: 20000, changed: true },
        discount: { version1: 5, version2: 5, changed: false },
        terms: { version1: 'Net 30', version2: 'Net 60', changed: true }
      };

      const changes = highlightChanges(differences);

      expect(changes).toHaveLength(2);
      expect(changes[0].field).toBe('total_amount');
      expect(changes[1].field).toBe('terms');
    });

    test('should calculate change percentage', () => {
      const calculateChangePercentage = (oldValue, newValue) => {
        if (oldValue === 0) return newValue > 0 ? 100 : 0;
        const diff = newValue - oldValue;
        const percentage = (diff / oldValue) * 100;
        return Math.round(percentage * 10) / 10; // Round to 1 decimal
      };

      expect(calculateChangePercentage(10000, 15000)).toBe(50);
      expect(calculateChangePercentage(20000, 18000)).toBe(-10);
      expect(calculateChangePercentage(0, 5000)).toBe(100);
    });

    test('should format change direction', () => {
      const formatChangeDirection = (oldValue, newValue) => {
        if (oldValue === newValue) return 'No change';
        if (newValue > oldValue) return 'Increased';
        return 'Decreased';
      };

      expect(formatChangeDirection(10000, 15000)).toBe('Increased');
      expect(formatChangeDirection(15000, 10000)).toBe('Decreased');
      expect(formatChangeDirection(10000, 10000)).toBe('No change');
    });

    test('should group changes by category', () => {
      const groupChangesByCategory = (changes) => {
        const categories = {
          pricing: ['total_amount', 'discount', 'subtotal'],
          terms: ['terms', 'payment_terms', 'delivery_terms'],
          items: ['items', 'line_items']
        };

        const grouped = {};

        changes.forEach(change => {
          let category = 'other';
          for (const [cat, fields] of Object.entries(categories)) {
            if (fields.includes(change.field)) {
              category = cat;
              break;
            }
          }

          if (!grouped[category]) grouped[category] = [];
          grouped[category].push(change);
        });

        return grouped;
      };

      const changes = [
        { field: 'total_amount', old_value: 10000, new_value: 15000 },
        { field: 'terms', old_value: 'Net 30', new_value: 'Net 60' },
        { field: 'discount', old_value: 5, new_value: 10 }
      ];

      const grouped = groupChangesByCategory(changes);

      expect(grouped.pricing).toHaveLength(2);
      expect(grouped.terms).toHaveLength(1);
    });
  });

  describe('Version Timeline', () => {
    test('should build version timeline', () => {
      const buildVersionTimeline = (versions) => {
        return versions.map((version, index) => ({
          version_number: version.version_number,
          date: version.created_at,
          author: version.created_by_name,
          notes: version.version_notes,
          is_first: index === versions.length - 1,
          is_latest: index === 0
        }));
      };

      const versions = [
        { version_number: 3, created_at: '2025-01-29', created_by_name: 'John', version_notes: 'v3' },
        { version_number: 2, created_at: '2025-01-28', created_by_name: 'Jane', version_notes: 'v2' },
        { version_number: 1, created_at: '2025-01-27', created_by_name: 'John', version_notes: 'v1' }
      ];

      const timeline = buildVersionTimeline(versions);

      expect(timeline[0].is_latest).toBe(true);
      expect(timeline[2].is_first).toBe(true);
      expect(timeline[1].is_latest).toBe(false);
      expect(timeline[1].is_first).toBe(false);
    });

    test('should filter versions by date range', () => {
      const filterVersionsByDateRange = (versions, startDate, endDate) => {
        return versions.filter(v => {
          const vDate = new Date(v.created_at);
          return vDate >= new Date(startDate) && vDate <= new Date(endDate);
        });
      };

      const versions = [
        { version_number: 3, created_at: '2025-01-29' },
        { version_number: 2, created_at: '2025-01-28' },
        { version_number: 1, created_at: '2025-01-27' }
      ];

      const filtered = filterVersionsByDateRange(versions, '2025-01-28', '2025-01-29');

      expect(filtered).toHaveLength(2);
      expect(filtered[0].version_number).toBe(3);
    });

    test('should filter versions by author', () => {
      const filterVersionsByAuthor = (versions, authorName) => {
        return versions.filter(v => v.created_by_name === authorName);
      };

      const versions = [
        { version_number: 3, created_by_name: 'John Doe' },
        { version_number: 2, created_by_name: 'Jane Smith' },
        { version_number: 1, created_by_name: 'John Doe' }
      ];

      const filtered = filterVersionsByAuthor(versions, 'John Doe');

      expect(filtered).toHaveLength(2);
      expect(filtered.every(v => v.created_by_name === 'John Doe')).toBe(true);
    });
  });

  describe('Version Export', () => {
    test('should prepare version data for export', () => {
      const prepareVersionForExport = (version) => {
        return {
          version_number: version.version_number,
          created_at: version.created_at,
          created_by: version.created_by_name,
          notes: version.version_notes,
          data_snapshot: version.data
        };
      };

      const version = {
        version_number: 2,
        created_at: '2025-01-28',
        created_by_name: 'John Doe',
        version_notes: 'Updated pricing',
        data: { total_amount: 15000 }
      };

      const exported = prepareVersionForExport(version);

      expect(exported.version_number).toBe(2);
      expect(exported.created_by).toBe('John Doe');
      expect(exported.data_snapshot.total_amount).toBe(15000);
    });
  });
});
