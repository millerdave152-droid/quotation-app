/**
 * TeleTime POS - Rule Audit Log Component
 * Shows history of changes to an approval rule
 */

import { useState, useEffect, useCallback } from 'react';
import {
  ClockIcon,
  UserIcon,
  PencilSquareIcon,
  PlusCircleIcon,
  TrashIcon,
  DocumentDuplicateIcon,
  ArrowPathIcon,
  ChevronDownIcon,
  ChevronUpIcon,
} from '@heroicons/react/24/outline';

const API_BASE = import.meta.env.VITE_API_URL || 'http://localhost:3001/api';

const ACTION_CONFIG = {
  create: {
    icon: PlusCircleIcon,
    label: 'Created',
    color: 'text-green-600',
    bgColor: 'bg-green-100',
  },
  update: {
    icon: PencilSquareIcon,
    label: 'Updated',
    color: 'text-blue-600',
    bgColor: 'bg-blue-100',
  },
  delete: {
    icon: TrashIcon,
    label: 'Deleted',
    color: 'text-red-600',
    bgColor: 'bg-red-100',
  },
  bulk_update: {
    icon: ArrowPathIcon,
    label: 'Bulk Update',
    color: 'text-purple-600',
    bgColor: 'bg-purple-100',
  },
  duplicate: {
    icon: DocumentDuplicateIcon,
    label: 'Duplicated',
    color: 'text-amber-600',
    bgColor: 'bg-amber-100',
  },
};

/**
 * Format date relative to now
 */
function formatRelativeDate(dateStr) {
  const date = new Date(dateStr);
  const now = new Date();
  const diffMs = now - date;
  const diffMins = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMs / 3600000);
  const diffDays = Math.floor(diffMs / 86400000);

  if (diffMins < 1) return 'Just now';
  if (diffMins < 60) return `${diffMins}m ago`;
  if (diffHours < 24) return `${diffHours}h ago`;
  if (diffDays < 7) return `${diffDays}d ago`;

  return date.toLocaleDateString('en-CA', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

/**
 * Format change details
 */
function formatChanges(changes, action) {
  if (!changes) return null;

  if (action === 'create') {
    return (
      <div className="text-sm text-gray-600">
        <p>Initial configuration:</p>
        <ul className="list-disc list-inside mt-1 text-xs text-gray-500">
          {changes.name && <li>Name: {changes.name}</li>}
          {changes.thresholdType && <li>Type: {changes.thresholdType}</li>}
          {changes.thresholdValue && <li>Threshold: {changes.thresholdValue}</li>}
          {changes.categoryId && <li>Category: {changes.categoryId}</li>}
        </ul>
      </div>
    );
  }

  if (action === 'update' && changes.before && changes.after) {
    const changedFields = [];
    const after = changes.after;

    Object.keys(after).forEach((key) => {
      if (after[key] !== undefined) {
        changedFields.push(key);
      }
    });

    return (
      <div className="text-sm text-gray-600">
        <p>Changed fields:</p>
        <ul className="list-disc list-inside mt-1 text-xs text-gray-500">
          {changedFields.slice(0, 5).map((field) => (
            <li key={field}>{field.replace(/([A-Z])/g, ' $1').trim()}</li>
          ))}
          {changedFields.length > 5 && <li>...and {changedFields.length - 5} more</li>}
        </ul>
      </div>
    );
  }

  if (action === 'delete') {
    return (
      <p className="text-sm text-gray-600">Rule was soft-deleted (retained for audit)</p>
    );
  }

  if (action === 'duplicate') {
    return (
      <p className="text-sm text-gray-600">
        Duplicated from rule #{changes.sourceRuleId}
        {changes.newName && ` as "${changes.newName}"`}
      </p>
    );
  }

  return null;
}

/**
 * Single audit log entry
 */
function AuditLogEntry({ entry, isExpanded, onToggle }) {
  const config = ACTION_CONFIG[entry.action] || ACTION_CONFIG.update;
  const Icon = config.icon;

  return (
    <div className="border-l-2 border-gray-200 pl-4 pb-4 last:pb-0">
      <div
        className="flex items-start gap-3 cursor-pointer hover:bg-gray-50 -ml-4 pl-4 -mr-2 pr-2 py-2 rounded-r-lg"
        onClick={onToggle}
      >
        {/* Icon */}
        <div className={`p-2 rounded-lg ${config.bgColor} -ml-6`}>
          <Icon className={`w-4 h-4 ${config.color}`} />
        </div>

        {/* Content */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center justify-between">
            <p className={`font-medium ${config.color}`}>{config.label}</p>
            <span className="text-xs text-gray-400">{formatRelativeDate(entry.created_at)}</span>
          </div>

          <div className="flex items-center gap-2 mt-1">
            <UserIcon className="w-4 h-4 text-gray-400" />
            <span className="text-sm text-gray-600">{entry.admin_name || 'System'}</span>
          </div>

          {/* Expandable details */}
          {isExpanded && entry.changes && (
            <div className="mt-3 p-3 bg-gray-50 rounded-lg">
              {formatChanges(entry.changes, entry.action)}
            </div>
          )}
        </div>

        {/* Expand indicator */}
        {entry.changes && (
          <div className="text-gray-400">
            {isExpanded ? (
              <ChevronUpIcon className="w-4 h-4" />
            ) : (
              <ChevronDownIcon className="w-4 h-4" />
            )}
          </div>
        )}
      </div>
    </div>
  );
}

/**
 * Rule Audit Log Component
 */
export function RuleAuditLog({ ruleId, auditLog: initialLog }) {
  const [auditLog, setAuditLog] = useState(initialLog || []);
  const [loading, setLoading] = useState(!initialLog);
  const [error, setError] = useState(null);
  const [expandedId, setExpandedId] = useState(null);

  // Fetch audit log if not provided
  const fetchAuditLog = useCallback(async () => {
    if (!ruleId) return;

    try {
      setLoading(true);
      const response = await fetch(`${API_BASE}/admin/approval-rules/${ruleId}`, {
        headers: {
          Authorization: `Bearer ${localStorage.getItem('pos_token')}`,
        },
      });

      if (!response.ok) throw new Error('Failed to load audit log');

      const data = await response.json();
      if (data.success && data.auditLog) {
        setAuditLog(data.auditLog);
      }
    } catch (err) {
      console.error('[RuleAuditLog] Fetch error:', err);
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [ruleId]);

  useEffect(() => {
    if (!initialLog && ruleId) {
      fetchAuditLog();
    }
  }, [initialLog, ruleId, fetchAuditLog]);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-8">
        <div className="w-6 h-6 border-2 border-blue-600 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="text-center py-8">
        <p className="text-red-600">{error}</p>
        <button
          onClick={fetchAuditLog}
          className="mt-2 text-blue-600 hover:underline"
        >
          Try again
        </button>
      </div>
    );
  }

  if (!auditLog || auditLog.length === 0) {
    return (
      <div className="text-center py-8">
        <ClockIcon className="w-12 h-12 text-gray-300 mx-auto mb-3" />
        <p className="text-gray-500">No audit history available</p>
        <p className="text-sm text-gray-400 mt-1">Changes to this rule will appear here</p>
      </div>
    );
  }

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between mb-4">
        <h3 className="font-medium text-gray-900 flex items-center gap-2">
          <ClockIcon className="w-5 h-5 text-gray-500" />
          Change History
        </h3>
        <span className="text-sm text-gray-500">{auditLog.length} entries</span>
      </div>

      <div className="relative">
        {auditLog.map((entry) => (
          <AuditLogEntry
            key={entry.id}
            entry={entry}
            isExpanded={expandedId === entry.id}
            onToggle={() => setExpandedId(expandedId === entry.id ? null : entry.id)}
          />
        ))}
      </div>
    </div>
  );
}

export default RuleAuditLog;
