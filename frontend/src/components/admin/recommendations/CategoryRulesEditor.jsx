import { authFetch } from '../../../services/authFetch';
/**
 * CategoryRulesEditor - Manage category-based recommendation rules
 * "When buying from [TVs], suggest from [HDMI Cables]"
 */

import { useState, useEffect, useCallback } from 'react';
import {
  PlusIcon,
  TrashIcon,
  PencilIcon,
  CheckIcon,
  XMarkIcon,
  ArrowRightIcon,
  ChevronUpIcon,
  ChevronDownIcon,
  PlayIcon,
  PauseIcon,
} from '@heroicons/react/24/outline';

const API_BASE = import.meta.env.VITE_API_URL || 'http://localhost:3001';

/**
 * Category select component
 */
function CategorySelect({ value, onChange, label, placeholder }) {
  const [categories, setCategories] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const loadCategories = async () => {
      try {
        const token = localStorage.getItem('auth_token');
        const response = await authFetch(`${API_BASE}/api/categories`, {
          headers: { Authorization: `Bearer ${token}` },
        });

        if (response.ok) {
          const data = await response.json();
          setCategories(data.data || data.categories || []);
        }
      } catch (err) {
        console.error('Failed to load categories:', err);
      } finally {
        setLoading(false);
      }
    };

    loadCategories();
  }, []);

  return (
    <div>
      {label && (
        <label className="block text-sm font-medium text-gray-700 mb-1">
          {label}
        </label>
      )}
      <select
        value={value || ''}
        onChange={(e) => onChange(e.target.value ? parseInt(e.target.value) : null)}
        disabled={loading}
        className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 disabled:bg-gray-100"
      >
        <option value="">{placeholder || 'Select category...'}</option>
        {categories.map((cat) => (
          <option key={cat.category_id || cat.id} value={cat.category_id || cat.id}>
            {cat.name}
          </option>
        ))}
      </select>
    </div>
  );
}

/**
 * Rule form modal
 */
function RuleModal({ isOpen, onClose, onSave, editData }) {
  const [formData, setFormData] = useState({
    name: '',
    description: '',
    sourceCategoryId: null,
    targetCategoryId: null,
    targetProductId: null,
    priority: 50,
    maxRecommendations: 3,
    minPrice: '',
    maxPrice: '',
    requireStock: true,
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);
  const [targetType, setTargetType] = useState('category');

  // Reset form when opening
  useEffect(() => {
    if (isOpen) {
      if (editData) {
        setFormData({
          name: editData.name,
          description: editData.description || '',
          sourceCategoryId: editData.sourceCategory?.id || null,
          targetCategoryId: editData.targetCategory?.id || null,
          targetProductId: editData.targetProduct?.id || null,
          priority: editData.priority,
          maxRecommendations: editData.maxRecommendations,
          minPrice: editData.minPrice || '',
          maxPrice: editData.maxPrice || '',
          requireStock: editData.requireStock,
        });
        setTargetType(editData.targetProduct ? 'product' : 'category');
      } else {
        setFormData({
          name: '',
          description: '',
          sourceCategoryId: null,
          targetCategoryId: null,
          targetProductId: null,
          priority: 50,
          maxRecommendations: 3,
          minPrice: '',
          maxPrice: '',
          requireStock: true,
        });
        setTargetType('category');
      }
      setError(null);
    }
  }, [isOpen, editData]);

  const handleSubmit = async (e) => {
    e.preventDefault();

    if (!formData.name || !formData.sourceCategoryId) {
      setError('Please provide a rule name and source category');
      return;
    }

    if (targetType === 'category' && !formData.targetCategoryId) {
      setError('Please select a target category');
      return;
    }

    setSaving(true);
    setError(null);

    try {
      const token = localStorage.getItem('auth_token');
      const url = editData
        ? `${API_BASE}/api/recommendations/rules/${editData.id}`
        : `${API_BASE}/api/recommendations/rules`;

      const body = editData
        ? {
            name: formData.name,
            description: formData.description,
            priority: formData.priority,
            maxRecommendations: formData.maxRecommendations,
            minPrice: formData.minPrice ? parseFloat(formData.minPrice) : null,
            maxPrice: formData.maxPrice ? parseFloat(formData.maxPrice) : null,
            requireStock: formData.requireStock,
          }
        : {
            name: formData.name,
            description: formData.description,
            sourceCategoryId: formData.sourceCategoryId,
            targetCategoryId:
              targetType === 'category' ? formData.targetCategoryId : null,
            targetProductId:
              targetType === 'product' ? formData.targetProductId : null,
            priority: formData.priority,
            maxRecommendations: formData.maxRecommendations,
            minPrice: formData.minPrice ? parseFloat(formData.minPrice) : null,
            maxPrice: formData.maxPrice ? parseFloat(formData.maxPrice) : null,
            requireStock: formData.requireStock,
          };

      const response = await authFetch(url, {
        method: editData ? 'PUT' : 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify(body),
      });

      const data = await response.json();

      if (data.success) {
        onSave();
        onClose();
      } else {
        setError(data.error || 'Failed to save rule');
      }
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto">
      <div className="flex items-center justify-center min-h-screen px-4">
        <div className="fixed inset-0 bg-black/50" onClick={onClose} />

        <div className="relative bg-white rounded-xl shadow-xl max-w-lg w-full p-6 max-h-[90vh] overflow-y-auto">
          <h3 className="text-lg font-semibold text-gray-900 mb-4">
            {editData ? 'Edit Rule' : 'Create Category Rule'}
          </h3>

          <form onSubmit={handleSubmit} className="space-y-4">
            {/* Rule Name */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Rule Name
              </label>
              <input
                type="text"
                value={formData.name}
                onChange={(e) =>
                  setFormData((prev) => ({ ...prev, name: e.target.value }))
                }
                placeholder="e.g., HDMI Cables for TVs"
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
              />
            </div>

            {/* Description */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Description (optional)
              </label>
              <input
                type="text"
                value={formData.description}
                onChange={(e) =>
                  setFormData((prev) => ({
                    ...prev,
                    description: e.target.value,
                  }))
                }
                placeholder="Explain what this rule does..."
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
              />
            </div>

            {/* Source Category */}
            <CategorySelect
              value={formData.sourceCategoryId}
              onChange={(val) =>
                setFormData((prev) => ({ ...prev, sourceCategoryId: val }))
              }
              label="When customer buys from..."
              placeholder="Select source category"
            />

            {/* Arrow */}
            <div className="flex justify-center">
              <ArrowRightIcon className="w-6 h-6 text-gray-400 rotate-90" />
            </div>

            {/* Target Type Toggle */}
            {!editData && (
              <div className="flex items-center gap-4">
                <label className="flex items-center gap-2">
                  <input
                    type="radio"
                    checked={targetType === 'category'}
                    onChange={() => setTargetType('category')}
                    className="text-blue-600"
                  />
                  <span className="text-sm">Suggest from category</span>
                </label>
                <label className="flex items-center gap-2">
                  <input
                    type="radio"
                    checked={targetType === 'product'}
                    onChange={() => setTargetType('product')}
                    className="text-blue-600"
                  />
                  <span className="text-sm">Suggest specific product</span>
                </label>
              </div>
            )}

            {/* Target Category */}
            {targetType === 'category' && (
              <CategorySelect
                value={formData.targetCategoryId}
                onChange={(val) =>
                  setFormData((prev) => ({ ...prev, targetCategoryId: val }))
                }
                label="Suggest products from..."
                placeholder="Select target category"
              />
            )}

            {/* Priority */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Priority: {formData.priority}
              </label>
              <input
                type="range"
                min="0"
                max="100"
                value={formData.priority}
                onChange={(e) =>
                  setFormData((prev) => ({
                    ...prev,
                    priority: parseInt(e.target.value),
                  }))
                }
                className="w-full"
              />
              <p className="text-xs text-gray-500">
                Higher priority rules are evaluated first
              </p>
            </div>

            {/* Max Recommendations */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Max Recommendations
              </label>
              <select
                value={formData.maxRecommendations}
                onChange={(e) =>
                  setFormData((prev) => ({
                    ...prev,
                    maxRecommendations: parseInt(e.target.value),
                  }))
                }
                className="w-full px-3 py-2 border border-gray-300 rounded-lg"
              >
                {[1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map((n) => (
                  <option key={n} value={n}>
                    {n} product{n > 1 ? 's' : ''}
                  </option>
                ))}
              </select>
            </div>

            {/* Price Range */}
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Min Price ($)
                </label>
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  value={formData.minPrice}
                  onChange={(e) =>
                    setFormData((prev) => ({
                      ...prev,
                      minPrice: e.target.value,
                    }))
                  }
                  placeholder="No minimum"
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Max Price ($)
                </label>
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  value={formData.maxPrice}
                  onChange={(e) =>
                    setFormData((prev) => ({
                      ...prev,
                      maxPrice: e.target.value,
                    }))
                  }
                  placeholder="No maximum"
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg"
                />
              </div>
            </div>

            {/* Require Stock */}
            <label className="flex items-center gap-2">
              <input
                type="checkbox"
                checked={formData.requireStock}
                onChange={(e) =>
                  setFormData((prev) => ({
                    ...prev,
                    requireStock: e.target.checked,
                  }))
                }
                className="rounded border-gray-300 text-blue-600"
              />
              <span className="text-sm text-gray-700">
                Only suggest in-stock items
              </span>
            </label>

            {/* Error */}
            {error && (
              <div className="p-3 bg-red-50 text-red-700 text-sm rounded-lg">
                {error}
              </div>
            )}

            {/* Actions */}
            <div className="flex justify-end gap-3 pt-4">
              <button
                type="button"
                onClick={onClose}
                className="px-4 py-2 text-gray-700 hover:bg-gray-100 rounded-lg"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={saving}
                className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50"
              >
                {saving ? (
                  <>
                    <div className="animate-spin h-4 w-4 border-2 border-white border-t-transparent rounded-full" />
                    Saving...
                  </>
                ) : (
                  <>
                    <CheckIcon className="w-4 h-4" />
                    {editData ? 'Update' : 'Create'}
                  </>
                )}
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
}

/**
 * Main category rules editor
 */
export default function CategoryRulesEditor({ onStatsUpdate }) {
  const [rules, setRules] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [editData, setEditData] = useState(null);

  // Load rules
  const loadRules = useCallback(async () => {
    setLoading(true);
    try {
      const token = localStorage.getItem('auth_token');
      const response = await authFetch(`${API_BASE}/api/recommendations/rules`, {
        headers: { Authorization: `Bearer ${token}` },
      });

      if (response.ok) {
        const data = await response.json();
        // Sort by priority
        const sorted = (data.data || []).sort(
          (a, b) => b.priority - a.priority
        );
        setRules(sorted);
      }
    } catch (err) {
      console.error('Failed to load rules:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadRules();
  }, [loadRules]);

  // Toggle rule active state
  const toggleActive = async (id, currentActive) => {
    try {
      const token = localStorage.getItem('auth_token');
      const response = await authFetch(
        `${API_BASE}/api/recommendations/rules/${id}`,
        {
          method: 'PUT',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({ isActive: !currentActive }),
        }
      );

      if (response.ok) {
        setRules((prev) =>
          prev.map((r) =>
            r.id === id ? { ...r, isActive: !currentActive } : r
          )
        );
        onStatsUpdate?.();
      }
    } catch (err) {
      console.error('Failed to toggle rule:', err);
    }
  };

  // Update priority
  const updatePriority = async (id, newPriority) => {
    try {
      const token = localStorage.getItem('auth_token');
      await authFetch(`${API_BASE}/api/recommendations/rules/${id}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ priority: newPriority }),
      });

      loadRules();
    } catch (err) {
      console.error('Failed to update priority:', err);
    }
  };

  // Delete rule
  const handleDelete = async (id) => {
    if (!window.confirm('Delete this rule?')) return;

    try {
      const token = localStorage.getItem('auth_token');
      const response = await authFetch(
        `${API_BASE}/api/recommendations/rules/${id}`,
        {
          method: 'DELETE',
          headers: { Authorization: `Bearer ${token}` },
        }
      );

      if (response.ok) {
        setRules((prev) => prev.filter((r) => r.id !== id));
        onStatsUpdate?.();
      }
    } catch (err) {
      console.error('Failed to delete:', err);
    }
  };

  // Edit rule
  const handleEdit = (rule) => {
    setEditData(rule);
    setShowModal(true);
  };

  // Handle save
  const handleSave = () => {
    loadRules();
    onStatsUpdate?.();
  };

  return (
    <div className="bg-white rounded-lg shadow">
      {/* Header */}
      <div className="px-6 py-4 border-b border-gray-200">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-lg font-semibold text-gray-900">
              Category Rules
            </h2>
            <p className="text-sm text-gray-500">
              Set up category-based recommendation triggers
            </p>
          </div>

          <button
            onClick={() => {
              setEditData(null);
              setShowModal(true);
            }}
            className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
          >
            <PlusIcon className="w-4 h-4" />
            Add Rule
          </button>
        </div>
      </div>

      {/* Content */}
      {loading ? (
        <div className="p-8 text-center">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600 mx-auto" />
        </div>
      ) : rules.length === 0 ? (
        <div className="p-8 text-center">
          <p className="text-gray-500 mb-4">No category rules yet.</p>
          <button
            onClick={() => setShowModal(true)}
            className="text-blue-600 hover:underline"
          >
            Create your first rule
          </button>
        </div>
      ) : (
        <div className="divide-y divide-gray-200">
          {rules.map((rule, index) => (
            <div
              key={rule.id}
              className={`px-6 py-4 ${
                !rule.isActive ? 'opacity-50 bg-gray-50' : ''
              }`}
            >
              <div className="flex items-center justify-between">
                {/* Rule Info */}
                <div className="flex-1">
                  <div className="flex items-center gap-3">
                    <span
                      className={`text-xs font-bold px-2 py-1 rounded ${
                        rule.isActive
                          ? 'bg-green-100 text-green-800'
                          : 'bg-gray-200 text-gray-600'
                      }`}
                    >
                      #{rule.priority}
                    </span>
                    <h3 className="font-medium text-gray-900">{rule.name}</h3>
                  </div>

                  <div className="mt-2 flex items-center gap-2 text-sm text-gray-600">
                    <span className="px-2 py-0.5 bg-purple-100 text-purple-800 rounded">
                      {rule.sourceCategory?.name || 'Any'}
                    </span>
                    <ArrowRightIcon className="w-4 h-4 text-gray-400" />
                    <span className="px-2 py-0.5 bg-blue-100 text-blue-800 rounded">
                      {rule.targetCategory?.name ||
                        rule.targetProduct?.name ||
                        'Any'}
                    </span>
                    <span className="text-gray-400">|</span>
                    <span className="text-gray-500">
                      Max {rule.maxRecommendations} items
                    </span>
                    {rule.minPrice && (
                      <span className="text-gray-500">
                        | Min ${rule.minPrice}
                      </span>
                    )}
                    {rule.maxPrice && (
                      <span className="text-gray-500">
                        | Max ${rule.maxPrice}
                      </span>
                    )}
                  </div>

                  {rule.description && (
                    <p className="mt-1 text-xs text-gray-500">
                      {rule.description}
                    </p>
                  )}
                </div>

                {/* Actions */}
                <div className="flex items-center gap-2">
                  {/* Priority Arrows */}
                  <div className="flex flex-col">
                    <button
                      onClick={() =>
                        updatePriority(
                          rule.id,
                          Math.min(100, rule.priority + 10)
                        )
                      }
                      disabled={rule.priority >= 100}
                      className="p-1 text-gray-400 hover:text-gray-600 disabled:opacity-30"
                      title="Increase priority"
                    >
                      <ChevronUpIcon className="w-4 h-4" />
                    </button>
                    <button
                      onClick={() =>
                        updatePriority(rule.id, Math.max(0, rule.priority - 10))
                      }
                      disabled={rule.priority <= 0}
                      className="p-1 text-gray-400 hover:text-gray-600 disabled:opacity-30"
                      title="Decrease priority"
                    >
                      <ChevronDownIcon className="w-4 h-4" />
                    </button>
                  </div>

                  {/* Toggle Active */}
                  <button
                    onClick={() => toggleActive(rule.id, rule.isActive)}
                    className={`p-2 rounded-lg ${
                      rule.isActive
                        ? 'text-green-600 hover:bg-green-50'
                        : 'text-gray-400 hover:bg-gray-100'
                    }`}
                    title={rule.isActive ? 'Pause rule' : 'Activate rule'}
                  >
                    {rule.isActive ? (
                      <PauseIcon className="w-5 h-5" />
                    ) : (
                      <PlayIcon className="w-5 h-5" />
                    )}
                  </button>

                  {/* Edit */}
                  <button
                    onClick={() => handleEdit(rule)}
                    className="p-2 text-gray-400 hover:text-blue-600 hover:bg-blue-50 rounded-lg"
                  >
                    <PencilIcon className="w-4 h-4" />
                  </button>

                  {/* Delete */}
                  <button
                    onClick={() => handleDelete(rule.id)}
                    className="p-2 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded-lg"
                  >
                    <TrashIcon className="w-4 h-4" />
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Modal */}
      <RuleModal
        isOpen={showModal}
        onClose={() => {
          setShowModal(false);
          setEditData(null);
        }}
        onSave={handleSave}
        editData={editData}
      />
    </div>
  );
}
