/**
 * TeleTime POS - Threshold Configuration Admin Component
 * Allows admins to configure override thresholds and approval levels
 */

import { useState, useEffect, useCallback } from 'react';
import {
  Cog6ToothIcon,
  ShieldCheckIcon,
  PlusIcon,
  PencilIcon,
  TrashIcon,
  CheckIcon,
  XMarkIcon,
  ExclamationTriangleIcon,
  ChevronDownIcon,
  ChevronUpIcon,
  ClockIcon,
  UserGroupIcon,
  TagIcon,
} from '@heroicons/react/24/outline';

const API_BASE = import.meta.env.VITE_API_URL || 'http://localhost:3001/api';

const THRESHOLD_TYPES = [
  { value: 'discount_percent', label: 'Discount Percentage', unit: '%' },
  { value: 'discount_amount', label: 'Discount Amount', unit: '$' },
  { value: 'margin_below', label: 'Minimum Margin', unit: '%' },
  { value: 'price_below_cost', label: 'Below Cost Sale', unit: '' },
  { value: 'void_transaction', label: 'Void Transaction', unit: '' },
  { value: 'void_item', label: 'Void Item', unit: '' },
  { value: 'refund_amount', label: 'Refund Amount', unit: '$' },
  { value: 'refund_no_receipt', label: 'No Receipt Refund', unit: '' },
  { value: 'drawer_adjustment', label: 'Drawer Adjustment', unit: '' },
];

const APPROVAL_LEVELS = [
  { value: 'shift_lead', label: 'Shift Lead', color: 'text-blue-600 bg-blue-100' },
  { value: 'manager', label: 'Manager', color: 'text-purple-600 bg-purple-100' },
  { value: 'area_manager', label: 'Area Manager', color: 'text-orange-600 bg-orange-100' },
  { value: 'admin', label: 'Admin', color: 'text-red-600 bg-red-100' },
];

const DAYS_OF_WEEK = [
  { value: 0, label: 'Sun' },
  { value: 1, label: 'Mon' },
  { value: 2, label: 'Tue' },
  { value: 3, label: 'Wed' },
  { value: 4, label: 'Thu' },
  { value: 5, label: 'Fri' },
  { value: 6, label: 'Sat' },
];

/**
 * Approval Level Badge
 */
function ApprovalLevelBadge({ level }) {
  const config = APPROVAL_LEVELS.find((l) => l.value === level) || APPROVAL_LEVELS[1];
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${config.color}`}>
      {config.label}
    </span>
  );
}

/**
 * Approval Level Configuration Row
 */
function ApprovalLevelRow({ level, config, thresholdType, onUpdate, onDelete }) {
  const [editing, setEditing] = useState(false);
  const [maxValue, setMaxValue] = useState(config?.maxValue || 0);
  const [isUnlimited, setIsUnlimited] = useState(config?.isUnlimited || false);

  const levelConfig = APPROVAL_LEVELS.find((l) => l.value === level);
  const typeConfig = THRESHOLD_TYPES.find((t) => t.value === thresholdType);

  const handleSave = () => {
    onUpdate(level, {
      maxValue: isUnlimited ? 999999.99 : maxValue,
      isUnlimited,
    });
    setEditing(false);
  };

  return (
    <div className="flex items-center justify-between py-2 px-3 bg-gray-50 rounded-lg">
      <div className="flex items-center gap-3">
        <span className={`px-2 py-1 rounded text-xs font-medium ${levelConfig?.color}`}>
          {levelConfig?.label}
        </span>
        {editing ? (
          <div className="flex items-center gap-2">
            <label className="flex items-center gap-1 text-sm">
              <input
                type="checkbox"
                checked={isUnlimited}
                onChange={(e) => setIsUnlimited(e.target.checked)}
                className="rounded border-gray-300 text-blue-600"
              />
              Unlimited
            </label>
            {!isUnlimited && (
              <div className="flex items-center gap-1">
                <span className="text-sm text-gray-500">Up to</span>
                <input
                  type="number"
                  value={maxValue}
                  onChange={(e) => setMaxValue(parseFloat(e.target.value) || 0)}
                  className="w-24 px-2 py-1 text-sm border rounded"
                  step="0.01"
                  min="0"
                />
                <span className="text-sm text-gray-500">{typeConfig?.unit}</span>
              </div>
            )}
          </div>
        ) : (
          <span className="text-sm text-gray-700">
            {config?.isUnlimited ? (
              <span className="text-green-600 font-medium">Unlimited</span>
            ) : (
              <>
                Up to <span className="font-medium">{config?.maxValue || 0}{typeConfig?.unit}</span>
              </>
            )}
          </span>
        )}
      </div>
      <div className="flex items-center gap-1">
        {editing ? (
          <>
            <button
              type="button"
              onClick={handleSave}
              className="p-1 text-green-600 hover:bg-green-50 rounded"
            >
              <CheckIcon className="w-4 h-4" />
            </button>
            <button
              type="button"
              onClick={() => setEditing(false)}
              className="p-1 text-gray-500 hover:bg-gray-100 rounded"
            >
              <XMarkIcon className="w-4 h-4" />
            </button>
          </>
        ) : (
          <>
            <button
              type="button"
              onClick={() => setEditing(true)}
              className="p-1 text-gray-500 hover:bg-gray-100 rounded"
            >
              <PencilIcon className="w-4 h-4" />
            </button>
            {config && (
              <button
                type="button"
                onClick={() => onDelete(level)}
                className="p-1 text-red-500 hover:bg-red-50 rounded"
              >
                <TrashIcon className="w-4 h-4" />
              </button>
            )}
          </>
        )}
      </div>
    </div>
  );
}

/**
 * Threshold Card Component
 */
function ThresholdCard({ threshold, categories, onUpdate, onUpdateApprovalLevel, onDeleteApprovalLevel }) {
  const [expanded, setExpanded] = useState(false);
  const [editing, setEditing] = useState(false);
  const [formData, setFormData] = useState({
    thresholdValue: threshold.thresholdValue || '',
    requiresApproval: threshold.requiresApproval,
    requireReason: threshold.requireReason,
    appliesToPos: threshold.appliesToPos,
    appliesToQuotes: threshold.appliesToQuotes,
    categoryId: threshold.categoryId || '',
    validFrom: threshold.validFrom ? threshold.validFrom.slice(0, 16) : '',
    validTo: threshold.validTo ? threshold.validTo.slice(0, 16) : '',
    activeStartTime: threshold.activeStartTime || '',
    activeEndTime: threshold.activeEndTime || '',
    activeDays: threshold.activeDays || [],
    isActive: threshold.isActive,
  });

  const typeConfig = THRESHOLD_TYPES.find((t) => t.value === threshold.thresholdType);

  const handleSave = async () => {
    await onUpdate(threshold.id, formData);
    setEditing(false);
  };

  const toggleDay = (day) => {
    setFormData((prev) => ({
      ...prev,
      activeDays: prev.activeDays.includes(day)
        ? prev.activeDays.filter((d) => d !== day)
        : [...prev.activeDays, day].sort(),
    }));
  };

  // Convert approval levels array to map for easier lookup
  const approvalLevelsMap = {};
  (threshold.approvalLevels || []).forEach((al) => {
    approvalLevelsMap[al.level] = al;
  });

  return (
    <div className={`border rounded-xl overflow-hidden ${threshold.isActive ? 'border-gray-200' : 'border-gray-200 bg-gray-50 opacity-75'}`}>
      {/* Header */}
      <div
        className="flex items-center justify-between p-4 cursor-pointer hover:bg-gray-50"
        onClick={() => setExpanded(!expanded)}
      >
        <div className="flex items-center gap-3">
          <div className={`p-2 rounded-lg ${threshold.isActive ? 'bg-blue-100' : 'bg-gray-200'}`}>
            <ShieldCheckIcon className={`w-5 h-5 ${threshold.isActive ? 'text-blue-600' : 'text-gray-500'}`} />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h3 className="font-semibold text-gray-900">{threshold.name}</h3>
              {!threshold.isActive && (
                <span className="px-2 py-0.5 bg-gray-200 text-gray-600 text-xs rounded">Inactive</span>
              )}
              {threshold.categoryName && (
                <span className="px-2 py-0.5 bg-purple-100 text-purple-700 text-xs rounded flex items-center gap-1">
                  <TagIcon className="w-3 h-3" />
                  {threshold.categoryName}
                </span>
              )}
            </div>
            <div className="flex items-center gap-3 text-sm text-gray-500">
              <span>{typeConfig?.label}</span>
              {threshold.thresholdValue && (
                <>
                  <span>•</span>
                  <span>Threshold: {threshold.thresholdValue}{typeConfig?.unit}</span>
                </>
              )}
              <span>•</span>
              <ApprovalLevelBadge level={threshold.defaultApprovalLevel} />
            </div>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {threshold.validFrom || threshold.validTo ? (
            <span className="flex items-center gap-1 px-2 py-1 bg-amber-100 text-amber-700 text-xs rounded">
              <ClockIcon className="w-3 h-3" />
              Time-limited
            </span>
          ) : null}
          {expanded ? (
            <ChevronUpIcon className="w-5 h-5 text-gray-400" />
          ) : (
            <ChevronDownIcon className="w-5 h-5 text-gray-400" />
          )}
        </div>
      </div>

      {/* Expanded Content */}
      {expanded && (
        <div className="border-t border-gray-200 p-4 space-y-4">
          {/* Basic Settings */}
          {editing ? (
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Threshold Value
                  </label>
                  <div className="flex items-center gap-2">
                    <input
                      type="number"
                      value={formData.thresholdValue}
                      onChange={(e) => setFormData({ ...formData, thresholdValue: e.target.value })}
                      className="flex-1 px-3 py-2 border rounded-lg"
                      step="0.01"
                      min="0"
                    />
                    <span className="text-gray-500">{typeConfig?.unit}</span>
                  </div>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Category (Optional)
                  </label>
                  <select
                    value={formData.categoryId}
                    onChange={(e) => setFormData({ ...formData, categoryId: e.target.value })}
                    className="w-full px-3 py-2 border rounded-lg"
                  >
                    <option value="">All Categories</option>
                    {categories.map((cat) => (
                      <option key={cat.id} value={cat.id}>{cat.name}</option>
                    ))}
                  </select>
                </div>
              </div>

              {/* Validity Period */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Validity Period (for sales events)
                </label>
                <div className="grid grid-cols-2 gap-4">
                  <input
                    type="datetime-local"
                    value={formData.validFrom}
                    onChange={(e) => setFormData({ ...formData, validFrom: e.target.value })}
                    className="px-3 py-2 border rounded-lg"
                    placeholder="Start date"
                  />
                  <input
                    type="datetime-local"
                    value={formData.validTo}
                    onChange={(e) => setFormData({ ...formData, validTo: e.target.value })}
                    className="px-3 py-2 border rounded-lg"
                    placeholder="End date"
                  />
                </div>
              </div>

              {/* Time of Day Restrictions */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Time of Day Restrictions
                </label>
                <div className="grid grid-cols-2 gap-4">
                  <input
                    type="time"
                    value={formData.activeStartTime}
                    onChange={(e) => setFormData({ ...formData, activeStartTime: e.target.value })}
                    className="px-3 py-2 border rounded-lg"
                    placeholder="Start time"
                  />
                  <input
                    type="time"
                    value={formData.activeEndTime}
                    onChange={(e) => setFormData({ ...formData, activeEndTime: e.target.value })}
                    className="px-3 py-2 border rounded-lg"
                    placeholder="End time"
                  />
                </div>
              </div>

              {/* Days of Week */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Active Days
                </label>
                <div className="flex gap-2">
                  {DAYS_OF_WEEK.map((day) => (
                    <button
                      key={day.value}
                      type="button"
                      onClick={() => toggleDay(day.value)}
                      className={`px-3 py-1 rounded text-sm font-medium transition-colors ${
                        formData.activeDays.includes(day.value)
                          ? 'bg-blue-600 text-white'
                          : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                      }`}
                    >
                      {day.label}
                    </button>
                  ))}
                </div>
              </div>

              {/* Toggles */}
              <div className="flex flex-wrap gap-4">
                <label className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    checked={formData.requiresApproval}
                    onChange={(e) => setFormData({ ...formData, requiresApproval: e.target.checked })}
                    className="rounded border-gray-300 text-blue-600"
                  />
                  <span className="text-sm">Requires Approval</span>
                </label>
                <label className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    checked={formData.requireReason}
                    onChange={(e) => setFormData({ ...formData, requireReason: e.target.checked })}
                    className="rounded border-gray-300 text-blue-600"
                  />
                  <span className="text-sm">Require Reason</span>
                </label>
                <label className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    checked={formData.appliesToPos}
                    onChange={(e) => setFormData({ ...formData, appliesToPos: e.target.checked })}
                    className="rounded border-gray-300 text-blue-600"
                  />
                  <span className="text-sm">Applies to POS</span>
                </label>
                <label className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    checked={formData.appliesToQuotes}
                    onChange={(e) => setFormData({ ...formData, appliesToQuotes: e.target.checked })}
                    className="rounded border-gray-300 text-blue-600"
                  />
                  <span className="text-sm">Applies to Quotes</span>
                </label>
                <label className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    checked={formData.isActive}
                    onChange={(e) => setFormData({ ...formData, isActive: e.target.checked })}
                    className="rounded border-gray-300 text-blue-600"
                  />
                  <span className="text-sm">Active</span>
                </label>
              </div>

              {/* Save/Cancel Buttons */}
              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setEditing(false)}
                  className="px-4 py-2 text-gray-600 hover:bg-gray-100 rounded-lg"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={handleSave}
                  className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
                >
                  Save Changes
                </button>
              </div>
            </div>
          ) : (
            <div className="flex justify-between items-start">
              <div className="space-y-2 text-sm text-gray-600">
                {threshold.description && <p>{threshold.description}</p>}
                <div className="flex flex-wrap gap-2">
                  {threshold.appliesToPos && <span className="px-2 py-0.5 bg-green-100 text-green-700 rounded">POS</span>}
                  {threshold.appliesToQuotes && <span className="px-2 py-0.5 bg-blue-100 text-blue-700 rounded">Quotes</span>}
                  {threshold.requireReason && <span className="px-2 py-0.5 bg-amber-100 text-amber-700 rounded">Reason Required</span>}
                </div>
                {(threshold.validFrom || threshold.validTo) && (
                  <p className="text-amber-600">
                    Valid: {threshold.validFrom ? new Date(threshold.validFrom).toLocaleDateString() : 'Any'} - {threshold.validTo ? new Date(threshold.validTo).toLocaleDateString() : 'Any'}
                  </p>
                )}
              </div>
              <button
                type="button"
                onClick={() => setEditing(true)}
                className="flex items-center gap-1 px-3 py-1.5 text-sm text-blue-600 hover:bg-blue-50 rounded-lg"
              >
                <PencilIcon className="w-4 h-4" />
                Edit
              </button>
            </div>
          )}

          {/* Approval Levels Section */}
          <div className="pt-4 border-t border-gray-200">
            <div className="flex items-center justify-between mb-3">
              <h4 className="font-medium text-gray-900 flex items-center gap-2">
                <UserGroupIcon className="w-5 h-5 text-gray-500" />
                Tiered Approval Levels
              </h4>
            </div>
            <div className="space-y-2">
              {APPROVAL_LEVELS.map((level) => (
                <ApprovalLevelRow
                  key={level.value}
                  level={level.value}
                  config={approvalLevelsMap[level.value]}
                  thresholdType={threshold.thresholdType}
                  onUpdate={(lvl, data) => onUpdateApprovalLevel(threshold.id, lvl, data)}
                  onDelete={(lvl) => onDeleteApprovalLevel(threshold.id, lvl)}
                />
              ))}
            </div>
            <p className="mt-2 text-xs text-gray-500">
              Configure how much each approval level can authorize. Lower levels handle smaller overrides, higher levels handle larger ones.
            </p>
          </div>
        </div>
      )}
    </div>
  );
}

/**
 * Main Threshold Configuration Component
 */
export function ThresholdConfig() {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [thresholds, setThresholds] = useState([]);
  const [categories, setCategories] = useState([]);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [filter, setFilter] = useState('all'); // all, active, inactive

  // Fetch thresholds
  const fetchThresholds = useCallback(async () => {
    try {
      setLoading(true);
      const response = await fetch(`${API_BASE}/manager-overrides/thresholds/config?includeInactive=true`, {
        headers: {
          Authorization: `Bearer ${localStorage.getItem('pos_token')}`,
        },
      });

      if (!response.ok) throw new Error('Failed to load thresholds');

      const data = await response.json();
      if (!data.success) throw new Error(data.error);

      setThresholds(data.data);
    } catch (err) {
      console.error('[ThresholdConfig] Fetch error:', err);
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, []);

  // Fetch categories
  const fetchCategories = useCallback(async () => {
    try {
      const response = await fetch(`${API_BASE}/categories`, {
        headers: {
          Authorization: `Bearer ${localStorage.getItem('pos_token')}`,
        },
      });

      if (response.ok) {
        const data = await response.json();
        setCategories(data.categories || data || []);
      }
    } catch (err) {
      console.error('[ThresholdConfig] Fetch categories error:', err);
    }
  }, []);

  useEffect(() => {
    fetchThresholds();
    fetchCategories();
  }, [fetchThresholds, fetchCategories]);

  // Update threshold
  const handleUpdateThreshold = async (thresholdId, updates) => {
    try {
      // Convert form data to API format
      const apiUpdates = {
        threshold_value: updates.thresholdValue ? parseFloat(updates.thresholdValue) : null,
        requires_approval: updates.requiresApproval,
        require_reason: updates.requireReason,
        applies_to_pos: updates.appliesToPos,
        applies_to_quotes: updates.appliesToQuotes,
        category_id: updates.categoryId || null,
        valid_from: updates.validFrom || null,
        valid_to: updates.validTo || null,
        active_start_time: updates.activeStartTime || null,
        active_end_time: updates.activeEndTime || null,
        active_days: updates.activeDays.length > 0 ? updates.activeDays : null,
        is_active: updates.isActive,
      };

      const response = await fetch(`${API_BASE}/manager-overrides/thresholds/${thresholdId}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${localStorage.getItem('pos_token')}`,
        },
        body: JSON.stringify(apiUpdates),
      });

      if (!response.ok) throw new Error('Failed to update threshold');

      // Refresh thresholds
      await fetchThresholds();
    } catch (err) {
      console.error('[ThresholdConfig] Update error:', err);
      setError(err.message);
    }
  };

  // Update approval level
  const handleUpdateApprovalLevel = async (thresholdId, level, data) => {
    try {
      const response = await fetch(
        `${API_BASE}/manager-overrides/thresholds/${thresholdId}/approval-levels/${level}`,
        {
          method: 'PUT',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${localStorage.getItem('pos_token')}`,
          },
          body: JSON.stringify(data),
        }
      );

      if (!response.ok) throw new Error('Failed to update approval level');

      // Refresh thresholds
      await fetchThresholds();
    } catch (err) {
      console.error('[ThresholdConfig] Update approval level error:', err);
      setError(err.message);
    }
  };

  // Delete approval level
  const handleDeleteApprovalLevel = async (thresholdId, level) => {
    try {
      const response = await fetch(
        `${API_BASE}/manager-overrides/thresholds/${thresholdId}/approval-levels/${level}`,
        {
          method: 'DELETE',
          headers: {
            Authorization: `Bearer ${localStorage.getItem('pos_token')}`,
          },
        }
      );

      if (!response.ok) throw new Error('Failed to delete approval level');

      // Refresh thresholds
      await fetchThresholds();
    } catch (err) {
      console.error('[ThresholdConfig] Delete approval level error:', err);
      setError(err.message);
    }
  };

  // Filter thresholds
  const filteredThresholds = thresholds.filter((t) => {
    if (filter === 'active') return t.isActive;
    if (filter === 'inactive') return !t.isActive;
    return true;
  });

  // Group by type for display
  const groupedThresholds = {};
  filteredThresholds.forEach((t) => {
    const group = t.thresholdType.startsWith('discount') ? 'Discounts'
      : t.thresholdType.startsWith('margin') || t.thresholdType === 'price_below_cost' ? 'Margin Protection'
      : t.thresholdType.startsWith('void') ? 'Voids'
      : t.thresholdType.startsWith('refund') ? 'Refunds'
      : 'Other';
    if (!groupedThresholds[group]) groupedThresholds[group] = [];
    groupedThresholds[group].push(t);
  });

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="w-8 h-8 border-4 border-blue-600 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="max-w-4xl mx-auto p-6">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <div className="p-2 bg-blue-100 rounded-lg">
            <Cog6ToothIcon className="w-6 h-6 text-blue-600" />
          </div>
          <div>
            <h1 className="text-xl font-bold text-gray-900">Override Thresholds</h1>
            <p className="text-sm text-gray-500">Configure approval requirements and limits</p>
          </div>
        </div>
        <button
          type="button"
          onClick={() => setShowCreateModal(true)}
          className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
        >
          <PlusIcon className="w-5 h-5" />
          Add Threshold
        </button>
      </div>

      {/* Error Display */}
      {error && (
        <div className="mb-4 p-4 bg-red-50 border border-red-200 rounded-lg flex items-center gap-3">
          <ExclamationTriangleIcon className="w-5 h-5 text-red-500" />
          <p className="text-red-700">{error}</p>
          <button
            type="button"
            onClick={() => setError(null)}
            className="ml-auto text-red-500 hover:text-red-700"
          >
            <XMarkIcon className="w-5 h-5" />
          </button>
        </div>
      )}

      {/* Filter Tabs */}
      <div className="flex gap-2 mb-6">
        {[
          { id: 'all', label: 'All' },
          { id: 'active', label: 'Active' },
          { id: 'inactive', label: 'Inactive' },
        ].map((tab) => (
          <button
            key={tab.id}
            type="button"
            onClick={() => setFilter(tab.id)}
            className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
              filter === tab.id
                ? 'bg-blue-100 text-blue-700'
                : 'text-gray-600 hover:bg-gray-100'
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Threshold Groups */}
      <div className="space-y-8">
        {Object.entries(groupedThresholds).map(([group, items]) => (
          <div key={group}>
            <h2 className="text-lg font-semibold text-gray-900 mb-3">{group}</h2>
            <div className="space-y-3">
              {items.map((threshold) => (
                <ThresholdCard
                  key={threshold.id}
                  threshold={threshold}
                  categories={categories}
                  onUpdate={handleUpdateThreshold}
                  onUpdateApprovalLevel={handleUpdateApprovalLevel}
                  onDeleteApprovalLevel={handleDeleteApprovalLevel}
                />
              ))}
            </div>
          </div>
        ))}
      </div>

      {filteredThresholds.length === 0 && (
        <div className="text-center py-12">
          <ShieldCheckIcon className="w-12 h-12 text-gray-300 mx-auto mb-4" />
          <p className="text-gray-500">No thresholds found</p>
        </div>
      )}
    </div>
  );
}

export default ThresholdConfig;
