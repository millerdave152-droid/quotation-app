/**
 * TeleTime POS - Approval Rules Page
 * Admin interface for managing override approval thresholds
 */

import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  ArrowLeftIcon,
  ShieldCheckIcon,
  PlusIcon,
  PencilIcon,
  TrashIcon,
  DocumentDuplicateIcon,
  FunnelIcon,
  MagnifyingGlassIcon,
  EllipsisVerticalIcon,
  CheckIcon,
  XMarkIcon,
  ExclamationTriangleIcon,
  TagIcon,
  CalendarIcon,
  ChevronDownIcon,
} from '@heroicons/react/24/outline';
import { ShieldCheckIcon as ShieldCheckSolid } from '@heroicons/react/24/solid';
import { ApprovalRuleModal } from './ApprovalRuleModal';

const API_BASE = import.meta.env.VITE_API_URL || 'http://localhost:3001/api';

const THRESHOLD_TYPE_LABELS = {
  discount_percent: 'Discount %',
  discount_amount: 'Discount $',
  margin_below: 'Min Margin',
  price_below_cost: 'Below Cost',
  void_transaction: 'Void Txn',
  void_item: 'Void Item',
  refund_amount: 'Refund $',
  refund_no_receipt: 'No Receipt',
  drawer_adjustment: 'Drawer Adj',
};

const TYPE_COLORS = {
  discount_percent: 'bg-blue-100 text-blue-700',
  discount_amount: 'bg-blue-100 text-blue-700',
  margin_below: 'bg-amber-100 text-amber-700',
  price_below_cost: 'bg-red-100 text-red-700',
  void_transaction: 'bg-purple-100 text-purple-700',
  void_item: 'bg-purple-100 text-purple-700',
  refund_amount: 'bg-orange-100 text-orange-700',
  refund_no_receipt: 'bg-orange-100 text-orange-700',
  drawer_adjustment: 'bg-gray-100 text-gray-700',
};

/**
 * Status badge component
 */
function StatusBadge({ isActive }) {
  return (
    <span
      className={`
        inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium
        ${isActive ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-600'}
      `}
    >
      {isActive ? (
        <>
          <CheckIcon className="w-3 h-3" />
          Active
        </>
      ) : (
        <>
          <XMarkIcon className="w-3 h-3" />
          Inactive
        </>
      )}
    </span>
  );
}

/**
 * Approval levels summary
 */
function ApprovalLevelsSummary({ levels }) {
  if (!levels || levels.length === 0) {
    return <span className="text-gray-400 text-sm">No levels configured</span>;
  }

  const levelOrder = ['shift_lead', 'manager', 'area_manager', 'admin'];
  const sortedLevels = [...levels].sort(
    (a, b) => levelOrder.indexOf(a.level) - levelOrder.indexOf(b.level)
  );

  const firstLevel = sortedLevels[0];
  const lastLevel = sortedLevels[sortedLevels.length - 1];

  const formatLevel = (level) => {
    const names = {
      shift_lead: 'Lead',
      manager: 'Mgr',
      area_manager: 'Area',
      admin: 'Admin',
    };
    return names[level.level] || level.level;
  };

  const formatValue = (level) => {
    if (level.isUnlimited) return '∞';
    return level.maxValue;
  };

  return (
    <div className="flex items-center gap-1 text-xs">
      <span className="px-1.5 py-0.5 bg-blue-100 text-blue-700 rounded">
        {formatLevel(firstLevel)}: {formatValue(firstLevel)}
      </span>
      {levels.length > 1 && (
        <>
          <span className="text-gray-400">→</span>
          <span className="px-1.5 py-0.5 bg-red-100 text-red-700 rounded">
            {formatLevel(lastLevel)}: {formatValue(lastLevel)}
          </span>
        </>
      )}
      {levels.length > 2 && (
        <span className="text-gray-400">+{levels.length - 2}</span>
      )}
    </div>
  );
}

/**
 * Rule row component
 */
function RuleRow({ rule, onEdit, onDelete, onDuplicate, onToggleActive }) {
  const [showMenu, setShowMenu] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const handleDelete = async () => {
    if (!confirm('Are you sure you want to delete this rule? It will be retained for audit purposes.')) {
      return;
    }
    setDeleting(true);
    await onDelete(rule.id);
    setDeleting(false);
    setShowMenu(false);
  };

  const formatThreshold = () => {
    if (!rule.thresholdValue) return '-';
    const type = rule.thresholdType;
    if (type.includes('percent') || type.includes('margin')) {
      return `${rule.thresholdValue}%`;
    }
    if (type.includes('amount') || type.includes('refund')) {
      return `$${rule.thresholdValue}`;
    }
    return rule.thresholdValue;
  };

  const hasTimeLimit = rule.validFrom || rule.validTo;

  return (
    <tr className={`hover:bg-gray-50 transition-colors ${!rule.isActive ? 'opacity-60' : ''}`}>
      {/* Name & Type */}
      <td className="px-4 py-3">
        <div className="flex items-center gap-3">
          <div className={`p-2 rounded-lg ${rule.isActive ? 'bg-blue-100' : 'bg-gray-200'}`}>
            <ShieldCheckIcon className={`w-5 h-5 ${rule.isActive ? 'text-blue-600' : 'text-gray-400'}`} />
          </div>
          <div>
            <p className="font-medium text-gray-900">{rule.name}</p>
            <div className="flex items-center gap-2 mt-0.5">
              <span className={`px-2 py-0.5 rounded text-xs font-medium ${TYPE_COLORS[rule.thresholdType] || 'bg-gray-100 text-gray-600'}`}>
                {THRESHOLD_TYPE_LABELS[rule.thresholdType] || rule.thresholdType}
              </span>
              {hasTimeLimit && (
                <span className="flex items-center gap-1 text-xs text-amber-600">
                  <CalendarIcon className="w-3 h-3" />
                  Limited
                </span>
              )}
            </div>
          </div>
        </div>
      </td>

      {/* Threshold */}
      <td className="px-4 py-3">
        <span className="font-mono text-sm">{formatThreshold()}</span>
      </td>

      {/* Category */}
      <td className="px-4 py-3">
        {rule.categoryName ? (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 bg-purple-100 text-purple-700 rounded text-xs">
            <TagIcon className="w-3 h-3" />
            {rule.categoryName}
          </span>
        ) : (
          <span className="text-gray-400 text-sm">All</span>
        )}
      </td>

      {/* Approval Levels */}
      <td className="px-4 py-3">
        <ApprovalLevelsSummary levels={rule.approvalLevels} />
      </td>

      {/* Status */}
      <td className="px-4 py-3">
        <StatusBadge isActive={rule.isActive} />
      </td>

      {/* Actions */}
      <td className="px-4 py-3">
        <div className="flex items-center justify-end gap-2">
          {/* Quick toggle */}
          <button
            type="button"
            onClick={() => onToggleActive(rule.id, !rule.isActive)}
            className={`
              relative w-10 h-6 rounded-full transition-colors
              ${rule.isActive ? 'bg-green-500' : 'bg-gray-300'}
            `}
            title={rule.isActive ? 'Deactivate' : 'Activate'}
          >
            <span
              className={`
                absolute top-1 w-4 h-4 bg-white rounded-full transition-transform shadow
                ${rule.isActive ? 'left-5' : 'left-1'}
              `}
            />
          </button>

          {/* Edit */}
          <button
            type="button"
            onClick={() => onEdit(rule)}
            className="p-2 text-gray-500 hover:text-blue-600 hover:bg-blue-50 rounded-lg"
            title="Edit rule"
          >
            <PencilIcon className="w-4 h-4" />
          </button>

          {/* Menu */}
          <div className="relative">
            <button
              type="button"
              onClick={() => setShowMenu(!showMenu)}
              className="p-2 text-gray-500 hover:text-gray-700 hover:bg-gray-100 rounded-lg"
            >
              <EllipsisVerticalIcon className="w-4 h-4" />
            </button>

            {showMenu && (
              <>
                <div
                  className="fixed inset-0 z-10"
                  onClick={() => setShowMenu(false)}
                />
                <div className="absolute right-0 mt-1 w-48 bg-white rounded-lg shadow-lg border border-gray-200 py-1 z-20">
                  <button
                    type="button"
                    onClick={() => {
                      onDuplicate(rule.id);
                      setShowMenu(false);
                    }}
                    className="w-full px-4 py-2 text-left text-sm text-gray-700 hover:bg-gray-50 flex items-center gap-2"
                  >
                    <DocumentDuplicateIcon className="w-4 h-4" />
                    Duplicate Rule
                  </button>
                  <hr className="my-1" />
                  <button
                    type="button"
                    onClick={handleDelete}
                    disabled={deleting}
                    className="w-full px-4 py-2 text-left text-sm text-red-600 hover:bg-red-50 flex items-center gap-2 disabled:opacity-50"
                  >
                    <TrashIcon className="w-4 h-4" />
                    {deleting ? 'Deleting...' : 'Delete Rule'}
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      </td>
    </tr>
  );
}

/**
 * Approval Rules Page Component
 */
export function ApprovalRulesPage() {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [rules, setRules] = useState([]);
  const [categories, setCategories] = useState([]);
  const [total, setTotal] = useState(0);

  // Filters
  const [search, setSearch] = useState('');
  const [typeFilter, setTypeFilter] = useState('');
  const [categoryFilter, setCategoryFilter] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [showFilters, setShowFilters] = useState(false);

  // Modal
  const [showModal, setShowModal] = useState(false);
  const [editingRule, setEditingRule] = useState(null);

  // Fetch rules
  const fetchRules = useCallback(async () => {
    try {
      setLoading(true);
      const params = new URLSearchParams();

      if (typeFilter) params.append('thresholdType', typeFilter);
      if (categoryFilter) {
        params.append('categoryId', categoryFilter === 'none' ? 'null' : categoryFilter);
      }
      if (statusFilter) params.append('isActive', statusFilter);
      params.append('includeDeleted', 'false');

      const response = await fetch(`${API_BASE}/admin/approval-rules?${params}`, {
        headers: {
          Authorization: `Bearer ${localStorage.getItem('pos_token')}`,
        },
      });

      if (!response.ok) throw new Error('Failed to load rules');

      const data = await response.json();
      if (!data.success) throw new Error(data.error);

      setRules(data.data);
      setTotal(data.pagination?.total || data.data.length);
    } catch (err) {
      console.error('[ApprovalRulesPage] Fetch error:', err);
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [typeFilter, categoryFilter, statusFilter]);

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
      console.error('[ApprovalRulesPage] Fetch categories error:', err);
    }
  }, []);

  useEffect(() => {
    fetchRules();
    fetchCategories();
  }, [fetchRules, fetchCategories]);

  // Handle rule edit
  const handleEdit = (rule) => {
    setEditingRule(rule);
    setShowModal(true);
  };

  // Handle rule creation
  const handleCreate = () => {
    setEditingRule(null);
    setShowModal(true);
  };

  // Handle save
  const handleSave = () => {
    fetchRules();
  };

  // Handle delete
  const handleDelete = async (ruleId) => {
    try {
      const response = await fetch(`${API_BASE}/admin/approval-rules/${ruleId}`, {
        method: 'DELETE',
        headers: {
          Authorization: `Bearer ${localStorage.getItem('pos_token')}`,
        },
      });

      if (!response.ok) throw new Error('Failed to delete rule');

      fetchRules();
    } catch (err) {
      console.error('[ApprovalRulesPage] Delete error:', err);
      setError(err.message);
    }
  };

  // Handle duplicate
  const handleDuplicate = async (ruleId) => {
    try {
      const response = await fetch(`${API_BASE}/admin/approval-rules/${ruleId}/duplicate`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${localStorage.getItem('pos_token')}`,
        },
        body: JSON.stringify({}),
      });

      if (!response.ok) throw new Error('Failed to duplicate rule');

      fetchRules();
    } catch (err) {
      console.error('[ApprovalRulesPage] Duplicate error:', err);
      setError(err.message);
    }
  };

  // Handle toggle active
  const handleToggleActive = async (ruleId, isActive) => {
    try {
      const response = await fetch(`${API_BASE}/admin/approval-rules/${ruleId}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${localStorage.getItem('pos_token')}`,
        },
        body: JSON.stringify({ isActive }),
      });

      if (!response.ok) throw new Error('Failed to update rule');

      // Optimistic update
      setRules((prev) =>
        prev.map((r) => (r.id === ruleId ? { ...r, isActive } : r))
      );
    } catch (err) {
      console.error('[ApprovalRulesPage] Toggle error:', err);
      setError(err.message);
      fetchRules(); // Refresh on error
    }
  };

  // Filter rules by search
  const filteredRules = rules.filter((rule) => {
    if (!search) return true;
    const searchLower = search.toLowerCase();
    return (
      rule.name.toLowerCase().includes(searchLower) ||
      rule.thresholdType.toLowerCase().includes(searchLower) ||
      rule.categoryName?.toLowerCase().includes(searchLower)
    );
  });

  return (
    <div className="min-h-screen bg-gray-100">
      {/* Header */}
      <div className="bg-white border-b border-gray-200">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between h-16">
            <div className="flex items-center gap-4">
              <button
                type="button"
                onClick={() => navigate(-1)}
                className="p-2 text-gray-500 hover:text-gray-700 hover:bg-gray-100 rounded-lg"
              >
                <ArrowLeftIcon className="w-5 h-5" />
              </button>
              <div className="flex items-center gap-3">
                <div className="p-2 bg-blue-100 rounded-lg">
                  <ShieldCheckSolid className="w-6 h-6 text-blue-600" />
                </div>
                <div>
                  <h1 className="text-xl font-bold text-gray-900">Approval Rules</h1>
                  <p className="text-sm text-gray-500">Configure override thresholds</p>
                </div>
              </div>
            </div>

            <button
              type="button"
              onClick={handleCreate}
              className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
            >
              <PlusIcon className="w-5 h-5" />
              Create Rule
            </button>
          </div>
        </div>
      </div>

      {/* Content */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
        {/* Error */}
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

        {/* Search and Filters */}
        <div className="bg-white rounded-xl border border-gray-200 mb-6">
          <div className="p-4 flex items-center gap-4">
            {/* Search */}
            <div className="flex-1 relative">
              <MagnifyingGlassIcon className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
              <input
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search rules..."
                className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
              />
            </div>

            {/* Filter toggle */}
            <button
              type="button"
              onClick={() => setShowFilters(!showFilters)}
              className={`
                flex items-center gap-2 px-4 py-2 border rounded-lg transition-colors
                ${showFilters
                  ? 'bg-blue-50 border-blue-300 text-blue-700'
                  : 'border-gray-300 text-gray-700 hover:bg-gray-50'
                }
              `}
            >
              <FunnelIcon className="w-5 h-5" />
              Filters
              <ChevronDownIcon className={`w-4 h-4 transition-transform ${showFilters ? 'rotate-180' : ''}`} />
            </button>
          </div>

          {/* Filter panel */}
          {showFilters && (
            <div className="px-4 pb-4 border-t border-gray-200 pt-4">
              <div className="flex gap-4">
                <div className="flex-1">
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Threshold Type
                  </label>
                  <select
                    value={typeFilter}
                    onChange={(e) => setTypeFilter(e.target.value)}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg"
                  >
                    <option value="">All Types</option>
                    {Object.entries(THRESHOLD_TYPE_LABELS).map(([value, label]) => (
                      <option key={value} value={value}>{label}</option>
                    ))}
                  </select>
                </div>

                <div className="flex-1">
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Category
                  </label>
                  <select
                    value={categoryFilter}
                    onChange={(e) => setCategoryFilter(e.target.value)}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg"
                  >
                    <option value="">All Categories</option>
                    <option value="none">Global (No Category)</option>
                    {categories.map((cat) => (
                      <option key={cat.id} value={cat.id}>{cat.name}</option>
                    ))}
                  </select>
                </div>

                <div className="flex-1">
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Status
                  </label>
                  <select
                    value={statusFilter}
                    onChange={(e) => setStatusFilter(e.target.value)}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg"
                  >
                    <option value="">All Status</option>
                    <option value="true">Active</option>
                    <option value="false">Inactive</option>
                  </select>
                </div>

                <div className="flex items-end">
                  <button
                    type="button"
                    onClick={() => {
                      setTypeFilter('');
                      setCategoryFilter('');
                      setStatusFilter('');
                    }}
                    className="px-4 py-2 text-gray-600 hover:text-gray-800 hover:bg-gray-100 rounded-lg"
                  >
                    Clear
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Stats */}
        <div className="grid grid-cols-4 gap-4 mb-6">
          <div className="bg-white rounded-xl border border-gray-200 p-4">
            <p className="text-2xl font-bold text-gray-900">{total}</p>
            <p className="text-sm text-gray-500">Total Rules</p>
          </div>
          <div className="bg-white rounded-xl border border-green-200 p-4">
            <p className="text-2xl font-bold text-green-600">
              {rules.filter((r) => r.isActive).length}
            </p>
            <p className="text-sm text-gray-500">Active</p>
          </div>
          <div className="bg-white rounded-xl border border-purple-200 p-4">
            <p className="text-2xl font-bold text-purple-600">
              {rules.filter((r) => r.categoryId).length}
            </p>
            <p className="text-sm text-gray-500">Category-Specific</p>
          </div>
          <div className="bg-white rounded-xl border border-amber-200 p-4">
            <p className="text-2xl font-bold text-amber-600">
              {rules.filter((r) => r.validFrom || r.validTo).length}
            </p>
            <p className="text-sm text-gray-500">Time-Limited</p>
          </div>
        </div>

        {/* Rules Table */}
        <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
          {loading ? (
            <div className="flex items-center justify-center py-12">
              <div className="w-8 h-8 border-4 border-blue-600 border-t-transparent rounded-full animate-spin" />
            </div>
          ) : filteredRules.length === 0 ? (
            <div className="text-center py-12">
              <ShieldCheckIcon className="w-12 h-12 text-gray-300 mx-auto mb-4" />
              <p className="text-gray-500">No approval rules found</p>
              <button
                type="button"
                onClick={handleCreate}
                className="mt-4 text-blue-600 hover:underline"
              >
                Create your first rule
              </button>
            </div>
          ) : (
            <table className="w-full">
              <thead className="bg-gray-50 border-b border-gray-200">
                <tr>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Rule
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Threshold
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Category
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Approval Levels
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Status
                  </th>
                  <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Actions
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200">
                {filteredRules.map((rule) => (
                  <RuleRow
                    key={rule.id}
                    rule={rule}
                    onEdit={handleEdit}
                    onDelete={handleDelete}
                    onDuplicate={handleDuplicate}
                    onToggleActive={handleToggleActive}
                  />
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>

      {/* Modal */}
      <ApprovalRuleModal
        isOpen={showModal}
        onClose={() => {
          setShowModal(false);
          setEditingRule(null);
        }}
        rule={editingRule}
        categories={categories}
        onSave={handleSave}
      />
    </div>
  );
}

export default ApprovalRulesPage;
