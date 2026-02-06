/**
 * TeleTime POS - Approval Rule Modal
 * Create or edit approval threshold rules
 */

import { useState, useEffect, useCallback } from 'react';
import {
  XMarkIcon,
  ShieldCheckIcon,
  ExclamationTriangleIcon,
  CalendarIcon,
  ClockIcon,
  TagIcon,
  InformationCircleIcon,
} from '@heroicons/react/24/outline';
import { ApprovalLevelConfig } from './ApprovalLevelConfig';
import { RuleAuditLog } from './RuleAuditLog';

const API_BASE = import.meta.env.VITE_API_URL || 'http://localhost:3001/api';

const THRESHOLD_TYPES = [
  { value: 'discount_percent', label: 'Discount Percentage', unit: '%', group: 'Discounts' },
  { value: 'discount_amount', label: 'Discount Amount', unit: '$', group: 'Discounts' },
  { value: 'margin_below', label: 'Minimum Margin', unit: '%', group: 'Margin Protection' },
  { value: 'price_below_cost', label: 'Below Cost Sale', unit: '', group: 'Margin Protection' },
  { value: 'void_transaction', label: 'Void Transaction', unit: '', group: 'Voids' },
  { value: 'void_item', label: 'Void Item', unit: '', group: 'Voids' },
  { value: 'refund_amount', label: 'Refund Amount', unit: '$', group: 'Refunds' },
  { value: 'refund_no_receipt', label: 'No Receipt Refund', unit: '', group: 'Refunds' },
  { value: 'drawer_adjustment', label: 'Drawer Adjustment', unit: '', group: 'Other' },
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
 * Approval Rule Modal Component
 */
export function ApprovalRuleModal({
  isOpen,
  onClose,
  rule,
  categories,
  onSave,
}) {
  const [activeTab, setActiveTab] = useState('settings');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [conflicts, setConflicts] = useState([]);

  // Form state
  const [formData, setFormData] = useState({
    name: '',
    thresholdType: 'discount_percent',
    thresholdValue: '',
    description: '',
    requiresApproval: true,
    requireReason: false,
    appliesToPos: true,
    appliesToQuotes: true,
    appliesToOnline: false,
    categoryId: '',
    validFrom: '',
    validTo: '',
    activeStartTime: '',
    activeEndTime: '',
    activeDays: [],
    isActive: true,
    priority: 100,
    approvalLevels: [],
  });

  // Initialize form when rule changes
  useEffect(() => {
    if (rule) {
      setFormData({
        name: rule.name || '',
        thresholdType: rule.thresholdType || 'discount_percent',
        thresholdValue: rule.thresholdValue || '',
        description: rule.description || '',
        requiresApproval: rule.requiresApproval !== false,
        requireReason: rule.requireReason || false,
        appliesToPos: rule.appliesToPos !== false,
        appliesToQuotes: rule.appliesToQuotes !== false,
        appliesToOnline: rule.appliesToOnline || false,
        categoryId: rule.categoryId || '',
        validFrom: rule.validFrom ? rule.validFrom.slice(0, 16) : '',
        validTo: rule.validTo ? rule.validTo.slice(0, 16) : '',
        activeStartTime: rule.activeStartTime || '',
        activeEndTime: rule.activeEndTime || '',
        activeDays: rule.activeDays || [],
        isActive: rule.isActive !== false,
        priority: rule.priority || 100,
        approvalLevels: rule.approvalLevels || [],
      });
    } else {
      // Reset for new rule
      setFormData({
        name: '',
        thresholdType: 'discount_percent',
        thresholdValue: '',
        description: '',
        requiresApproval: true,
        requireReason: false,
        appliesToPos: true,
        appliesToQuotes: true,
        appliesToOnline: false,
        categoryId: '',
        validFrom: '',
        validTo: '',
        activeStartTime: '',
        activeEndTime: '',
        activeDays: [],
        isActive: true,
        priority: 100,
        approvalLevels: [
          { level: 'manager', maxValue: 30, isUnlimited: false },
          { level: 'admin', maxValue: 999999.99, isUnlimited: true },
        ],
      });
    }
    setActiveTab('settings');
    setError(null);
    setConflicts([]);
  }, [rule, isOpen]);

  const handleChange = (field, value) => {
    setFormData((prev) => ({ ...prev, [field]: value }));
    setError(null);
    setConflicts([]);
  };

  const toggleDay = (day) => {
    setFormData((prev) => ({
      ...prev,
      activeDays: prev.activeDays.includes(day)
        ? prev.activeDays.filter((d) => d !== day)
        : [...prev.activeDays, day].sort(),
    }));
  };

  const handleSave = async () => {
    // Validate
    if (!formData.name.trim()) {
      setError('Rule name is required');
      return;
    }

    if (formData.approvalLevels.length === 0) {
      setError('At least one approval level must be configured');
      return;
    }

    // Check threshold value for types that need it
    const needsValue = !['void_transaction', 'void_item', 'refund_no_receipt', 'drawer_adjustment', 'price_below_cost'].includes(formData.thresholdType);
    if (needsValue && !formData.thresholdValue) {
      setError('Threshold value is required for this rule type');
      return;
    }

    try {
      setLoading(true);
      setError(null);

      const payload = {
        ...formData,
        thresholdValue: formData.thresholdValue ? parseFloat(formData.thresholdValue) : null,
        categoryId: formData.categoryId || null,
        validFrom: formData.validFrom || null,
        validTo: formData.validTo || null,
        activeStartTime: formData.activeStartTime || null,
        activeEndTime: formData.activeEndTime || null,
        activeDays: formData.activeDays.length > 0 ? formData.activeDays : null,
      };

      const url = rule
        ? `${API_BASE}/admin/approval-rules/${rule.id}`
        : `${API_BASE}/admin/approval-rules`;

      const response = await fetch(url, {
        method: rule ? 'PUT' : 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${localStorage.getItem('pos_token')}`,
        },
        body: JSON.stringify(payload),
      });

      const data = await response.json();

      if (!response.ok) {
        if (response.status === 409 && data.conflicts) {
          setConflicts(data.conflicts);
          setError('Conflicting rule exists for this category and date range');
          return;
        }
        throw new Error(data.error || data.errors?.join(', ') || 'Failed to save rule');
      }

      onSave?.(data.data);
      onClose();
    } catch (err) {
      console.error('[ApprovalRuleModal] Save error:', err);
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const thresholdTypeConfig = THRESHOLD_TYPES.find((t) => t.value === formData.thresholdType);
  const needsThresholdValue = !['void_transaction', 'void_item', 'refund_no_receipt', 'drawer_adjustment', 'price_below_cost'].includes(formData.thresholdType);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/50 backdrop-blur-sm"
        onClick={onClose}
      />

      {/* Modal */}
      <div className="relative w-full max-w-3xl mx-4 max-h-[90vh] bg-white rounded-2xl shadow-2xl flex flex-col overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-gray-200 bg-gradient-to-r from-blue-50 to-indigo-50">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-white rounded-lg shadow-sm">
              <ShieldCheckIcon className="w-6 h-6 text-blue-600" />
            </div>
            <div>
              <h2 className="text-lg font-bold text-gray-900">
                {rule ? 'Edit Approval Rule' : 'Create Approval Rule'}
              </h2>
              <p className="text-sm text-gray-500">
                Configure threshold and approval requirements
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-2 text-gray-500 hover:text-gray-700 hover:bg-white/50 rounded-lg"
          >
            <XMarkIcon className="w-5 h-5" />
          </button>
        </div>

        {/* Tabs */}
        <div className="flex border-b border-gray-200">
          {[
            { id: 'settings', label: 'Settings' },
            { id: 'levels', label: 'Approval Levels' },
            { id: 'schedule', label: 'Schedule' },
            ...(rule ? [{ id: 'history', label: 'History' }] : []),
          ].map((tab) => (
            <button
              key={tab.id}
              type="button"
              onClick={() => setActiveTab(tab.id)}
              className={`
                px-6 py-3 text-sm font-medium transition-colors
                ${activeTab === tab.id
                  ? 'text-blue-600 border-b-2 border-blue-600 bg-blue-50/50'
                  : 'text-gray-500 hover:text-gray-700 hover:bg-gray-50'
                }
              `}
            >
              {tab.label}
            </button>
          ))}
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-6">
          {/* Error display */}
          {error && (
            <div className="mb-4 p-4 bg-red-50 border border-red-200 rounded-lg flex items-start gap-3">
              <ExclamationTriangleIcon className="w-5 h-5 text-red-500 flex-shrink-0 mt-0.5" />
              <div>
                <p className="text-red-700 font-medium">{error}</p>
                {conflicts.length > 0 && (
                  <ul className="mt-2 text-sm text-red-600">
                    {conflicts.map((c) => (
                      <li key={c.id}>• {c.name}</li>
                    ))}
                  </ul>
                )}
              </div>
            </div>
          )}

          {/* Settings Tab */}
          {activeTab === 'settings' && (
            <div className="space-y-6">
              {/* Basic Info */}
              <div className="grid grid-cols-2 gap-4">
                <div className="col-span-2">
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Rule Name *
                  </label>
                  <input
                    type="text"
                    value={formData.name}
                    onChange={(e) => handleChange('name', e.target.value)}
                    placeholder="e.g., Standard Discount Limit"
                    className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Threshold Type *
                  </label>
                  <select
                    value={formData.thresholdType}
                    onChange={(e) => handleChange('thresholdType', e.target.value)}
                    className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                  >
                    {Object.entries(
                      THRESHOLD_TYPES.reduce((acc, t) => {
                        if (!acc[t.group]) acc[t.group] = [];
                        acc[t.group].push(t);
                        return acc;
                      }, {})
                    ).map(([group, types]) => (
                      <optgroup key={group} label={group}>
                        {types.map((t) => (
                          <option key={t.value} value={t.value}>
                            {t.label}
                          </option>
                        ))}
                      </optgroup>
                    ))}
                  </select>
                </div>

                {needsThresholdValue && (
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Threshold Value *
                    </label>
                    <div className="relative">
                      {thresholdTypeConfig?.unit === '$' && (
                        <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500">$</span>
                      )}
                      <input
                        type="number"
                        value={formData.thresholdValue}
                        onChange={(e) => handleChange('thresholdValue', e.target.value)}
                        placeholder="0"
                        min="0"
                        step={thresholdTypeConfig?.unit === '%' ? '1' : '0.01'}
                        className={`w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 ${
                          thresholdTypeConfig?.unit === '$' ? 'pl-8' : ''
                        }`}
                      />
                      {thresholdTypeConfig?.unit === '%' && (
                        <span className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-500">%</span>
                      )}
                    </div>
                    <p className="mt-1 text-xs text-gray-500">
                      Values above this threshold will require approval
                    </p>
                  </div>
                )}

                <div className="col-span-2">
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    <div className="flex items-center gap-2">
                      <TagIcon className="w-4 h-4 text-gray-400" />
                      Category (Optional)
                    </div>
                  </label>
                  <select
                    value={formData.categoryId}
                    onChange={(e) => handleChange('categoryId', e.target.value)}
                    className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                  >
                    <option value="">All Categories</option>
                    {categories?.map((cat) => (
                      <option key={cat.id} value={cat.id}>
                        {cat.name}
                      </option>
                    ))}
                  </select>
                  <p className="mt-1 text-xs text-gray-500">
                    Leave empty to apply to all categories, or select specific category for tighter/looser rules
                  </p>
                </div>

                <div className="col-span-2">
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Description
                  </label>
                  <textarea
                    value={formData.description}
                    onChange={(e) => handleChange('description', e.target.value)}
                    placeholder="Optional description for this rule..."
                    rows={2}
                    className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                  />
                </div>
              </div>

              {/* Options */}
              <div className="space-y-3">
                <h3 className="text-sm font-medium text-gray-900">Options</h3>
                <div className="grid grid-cols-2 gap-4">
                  <label className="flex items-center gap-3 p-3 bg-gray-50 rounded-lg cursor-pointer hover:bg-gray-100">
                    <input
                      type="checkbox"
                      checked={formData.requiresApproval}
                      onChange={(e) => handleChange('requiresApproval', e.target.checked)}
                      className="w-5 h-5 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                    />
                    <div>
                      <p className="font-medium text-gray-700">Requires Approval</p>
                      <p className="text-xs text-gray-500">Manager must approve this override</p>
                    </div>
                  </label>

                  <label className="flex items-center gap-3 p-3 bg-gray-50 rounded-lg cursor-pointer hover:bg-gray-100">
                    <input
                      type="checkbox"
                      checked={formData.requireReason}
                      onChange={(e) => handleChange('requireReason', e.target.checked)}
                      className="w-5 h-5 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                    />
                    <div>
                      <p className="font-medium text-gray-700">Require Reason</p>
                      <p className="text-xs text-gray-500">Cashier must enter reason</p>
                    </div>
                  </label>

                  <label className="flex items-center gap-3 p-3 bg-gray-50 rounded-lg cursor-pointer hover:bg-gray-100">
                    <input
                      type="checkbox"
                      checked={formData.appliesToPos}
                      onChange={(e) => handleChange('appliesToPos', e.target.checked)}
                      className="w-5 h-5 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                    />
                    <div>
                      <p className="font-medium text-gray-700">Applies to POS</p>
                      <p className="text-xs text-gray-500">In-store transactions</p>
                    </div>
                  </label>

                  <label className="flex items-center gap-3 p-3 bg-gray-50 rounded-lg cursor-pointer hover:bg-gray-100">
                    <input
                      type="checkbox"
                      checked={formData.appliesToQuotes}
                      onChange={(e) => handleChange('appliesToQuotes', e.target.checked)}
                      className="w-5 h-5 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                    />
                    <div>
                      <p className="font-medium text-gray-700">Applies to Quotes</p>
                      <p className="text-xs text-gray-500">Sales quotations</p>
                    </div>
                  </label>

                  <label className="flex items-center gap-3 p-3 bg-gray-50 rounded-lg cursor-pointer hover:bg-gray-100">
                    <input
                      type="checkbox"
                      checked={formData.isActive}
                      onChange={(e) => handleChange('isActive', e.target.checked)}
                      className="w-5 h-5 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                    />
                    <div>
                      <p className="font-medium text-gray-700">Active</p>
                      <p className="text-xs text-gray-500">Rule is currently enforced</p>
                    </div>
                  </label>

                  <div className="p-3 bg-gray-50 rounded-lg">
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Priority
                    </label>
                    <input
                      type="number"
                      value={formData.priority}
                      onChange={(e) => handleChange('priority', parseInt(e.target.value) || 100)}
                      min="1"
                      max="999"
                      className="w-full px-3 py-1.5 border border-gray-300 rounded-lg text-sm"
                    />
                    <p className="text-xs text-gray-500 mt-1">Higher = evaluated first</p>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Approval Levels Tab */}
          {activeTab === 'levels' && (
            <ApprovalLevelConfig
              thresholdType={formData.thresholdType}
              levels={formData.approvalLevels}
              onChange={(levels) => handleChange('approvalLevels', levels)}
            />
          )}

          {/* Schedule Tab */}
          {activeTab === 'schedule' && (
            <div className="space-y-6">
              {/* Validity Period */}
              <div>
                <div className="flex items-center gap-2 mb-3">
                  <CalendarIcon className="w-5 h-5 text-gray-500" />
                  <h3 className="font-medium text-gray-900">Validity Period</h3>
                </div>
                <p className="text-sm text-gray-500 mb-4">
                  Set date range for temporary rules (e.g., promotional periods, sales events)
                </p>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Valid From
                    </label>
                    <input
                      type="datetime-local"
                      value={formData.validFrom}
                      onChange={(e) => handleChange('validFrom', e.target.value)}
                      className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Valid To
                    </label>
                    <input
                      type="datetime-local"
                      value={formData.validTo}
                      onChange={(e) => handleChange('validTo', e.target.value)}
                      className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                    />
                  </div>
                </div>
                {formData.validFrom || formData.validTo ? (
                  <button
                    type="button"
                    onClick={() => {
                      handleChange('validFrom', '');
                      handleChange('validTo', '');
                    }}
                    className="mt-2 text-sm text-blue-600 hover:underline"
                  >
                    Clear dates (make permanent)
                  </button>
                ) : null}
              </div>

              {/* Time of Day */}
              <div>
                <div className="flex items-center gap-2 mb-3">
                  <ClockIcon className="w-5 h-5 text-gray-500" />
                  <h3 className="font-medium text-gray-900">Time of Day Restrictions</h3>
                </div>
                <p className="text-sm text-gray-500 mb-4">
                  Only enforce this rule during specific hours (leave empty for all day)
                </p>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Start Time
                    </label>
                    <input
                      type="time"
                      value={formData.activeStartTime}
                      onChange={(e) => handleChange('activeStartTime', e.target.value)}
                      className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      End Time
                    </label>
                    <input
                      type="time"
                      value={formData.activeEndTime}
                      onChange={(e) => handleChange('activeEndTime', e.target.value)}
                      className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                    />
                  </div>
                </div>
              </div>

              {/* Days of Week */}
              <div>
                <h3 className="font-medium text-gray-900 mb-3">Active Days</h3>
                <p className="text-sm text-gray-500 mb-4">
                  Select specific days when this rule applies (leave all unselected for every day)
                </p>
                <div className="flex gap-2">
                  {DAYS_OF_WEEK.map((day) => (
                    <button
                      key={day.value}
                      type="button"
                      onClick={() => toggleDay(day.value)}
                      className={`
                        px-4 py-2 rounded-lg text-sm font-medium transition-colors
                        ${formData.activeDays.includes(day.value)
                          ? 'bg-blue-600 text-white'
                          : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                        }
                      `}
                    >
                      {day.label}
                    </button>
                  ))}
                </div>
                {formData.activeDays.length > 0 && (
                  <button
                    type="button"
                    onClick={() => handleChange('activeDays', [])}
                    className="mt-2 text-sm text-blue-600 hover:underline"
                  >
                    Clear selection (apply every day)
                  </button>
                )}
              </div>

              {/* Info box */}
              <div className="flex items-start gap-3 p-4 bg-blue-50 rounded-lg">
                <InformationCircleIcon className="w-5 h-5 text-blue-600 flex-shrink-0 mt-0.5" />
                <div className="text-sm text-blue-700">
                  <p className="font-medium">Schedule Tips</p>
                  <ul className="mt-1 list-disc list-inside text-blue-600">
                    <li>Use validity period for temporary sales/promotions</li>
                    <li>Time restrictions apply daily within the validity period</li>
                    <li>Rules are only enforced when ALL conditions are met</li>
                  </ul>
                </div>
              </div>
            </div>
          )}

          {/* History Tab */}
          {activeTab === 'history' && rule && (
            <RuleAuditLog ruleId={rule.id} auditLog={rule.auditLog} />
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between p-4 border-t border-gray-200 bg-gray-50">
          <div className="text-sm text-gray-500">
            {formData.approvalLevels.length === 0 ? (
              <span className="text-amber-600">Configure approval levels to save</span>
            ) : (
              <span>{formData.approvalLevels.length} approval level(s) configured</span>
            )}
          </div>
          <div className="flex gap-3">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-gray-600 hover:bg-gray-200 rounded-lg transition-colors"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={handleSave}
              disabled={loading || formData.approvalLevels.length === 0}
              className="px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {loading ? (
                <span className="flex items-center gap-2">
                  <span className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                  Saving...
                </span>
              ) : rule ? (
                'Save Changes'
              ) : (
                'Create Rule'
              )}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

export default ApprovalRuleModal;
