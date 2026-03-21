/**
 * Commission Rules Page
 * Admin/Manager view to manage commission rules (CRUD)
 */

import React, { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  getCommissionRules,
  createCommissionRule,
  updateCommissionRule,
  deleteCommissionRule,
} from '../api/commissions';

import { ArrowLeft, CheckCircle, Plus, RefreshCw, SquarePen, Trash2, XCircle } from 'lucide-react';
const RULE_TYPES = [
  { value: 'flat', label: 'Flat Rate', color: 'bg-blue-100 text-blue-700' },
  { value: 'tiered', label: 'Tiered', color: 'bg-amber-100 text-amber-700' },
  { value: 'category', label: 'Category', color: 'bg-green-100 text-green-700' },
  { value: 'product_type', label: 'Product Type', color: 'bg-purple-100 text-purple-700' },
  { value: 'bonus', label: 'Bonus', color: 'bg-pink-100 text-pink-700' },
  { value: 'warranty', label: 'Warranty', color: 'bg-orange-100 text-orange-700' },
];

function getRuleTypeStyle(type) {
  return RULE_TYPES.find(t => t.value === type)?.color || 'bg-slate-100 text-slate-700';
}

const EMPTY_FORM = {
  ruleName: '',
  ruleType: 'flat',
  description: '',
  rate: '',
  priority: 100,
  categoryId: '',
  productType: '',
  appliesToDiscounted: true,
  discountThreshold: 0.2,
  discountedRate: '',
  isBonus: false,
  bonusFlatCents: '',
  isActive: true,
};

export default function CommissionRulesPage() {
  const navigate = useNavigate();
  const [rules, setRules] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [showForm, setShowForm] = useState(false);
  const [editingRule, setEditingRule] = useState(null);
  const [saving, setSaving] = useState(false);
  const [formData, setFormData] = useState({ ...EMPTY_FORM });

  const fetchRules = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const result = await getCommissionRules(true);
      if (result.success) {
        setRules(result.data || []);
      } else {
        setError(result.error || 'Failed to load rules');
      }
    } catch (err) {
      setError('Failed to load commission rules');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchRules(); }, [fetchRules]);

  const resetForm = () => {
    setFormData({ ...EMPTY_FORM });
    setEditingRule(null);
    setShowForm(false);
  };

  const handleEdit = (rule) => {
    setFormData({
      ruleName: rule.ruleName || '',
      ruleType: rule.ruleType || 'flat',
      description: rule.description || '',
      rate: rule.rate || '',
      priority: rule.priority || 100,
      categoryId: rule.categoryId || '',
      productType: rule.productType || '',
      appliesToDiscounted: rule.appliesToDiscounted !== false,
      discountThreshold: rule.discountThreshold || 0.2,
      discountedRate: rule.discountedRate || '',
      isBonus: rule.isBonus || false,
      bonusFlatCents: rule.bonusFlatCents || '',
      isActive: rule.isActive !== false,
    });
    setEditingRule(rule);
    setShowForm(true);
  };

  const handleSave = async () => {
    if (!formData.ruleName || !formData.rate) {
      alert('Rule name and rate are required');
      return;
    }

    setSaving(true);
    try {
      const payload = {
        ...formData,
        rate: parseFloat(formData.rate) || 0,
        priority: parseInt(formData.priority) || 100,
        categoryId: formData.categoryId ? parseInt(formData.categoryId) : null,
        productType: formData.productType || null,
        discountedRate: formData.discountedRate ? parseFloat(formData.discountedRate) : null,
        bonusFlatCents: formData.bonusFlatCents ? parseInt(formData.bonusFlatCents) : null,
      };

      let result;
      if (editingRule) {
        result = await updateCommissionRule(editingRule.id, payload);
      } else {
        result = await createCommissionRule(payload);
      }

      if (result.success) {
        resetForm();
        fetchRules();
      } else {
        alert(result.error || 'Failed to save rule');
      }
    } catch (err) {
      alert('Failed to save rule');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (ruleId) => {
    if (!window.confirm('Deactivate this commission rule?')) return;
    try {
      const result = await deleteCommissionRule(ruleId);
      if (result.success) fetchRules();
      else alert(result.error || 'Failed to deactivate rule');
    } catch {
      alert('Failed to deactivate rule');
    }
  };

  const updateField = (field, value) => {
    setFormData(prev => ({ ...prev, [field]: value }));
  };

  return (
    <div className="min-h-screen bg-slate-50">
      {/* Header */}
      <header className="bg-white border-b border-slate-200 sticky top-0 z-10">
        <div className="max-w-7xl mx-auto px-4 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              <button
                onClick={() => navigate('/')}
                className="p-2 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded-lg transition-colors"
              >
                <ArrowLeft className="w-5 h-5" />
              </button>
              <div>
                <h1 className="text-xl font-bold text-slate-900">Commission Rules</h1>
                <p className="text-sm text-slate-500">Configure rates, bonuses, and tier structures</p>
              </div>
            </div>
            <div className="flex items-center gap-3">
              <button
                onClick={fetchRules}
                disabled={loading}
                className="flex items-center gap-2 px-4 py-2 text-slate-600 hover:text-slate-900 hover:bg-slate-100 rounded-lg transition-colors"
              >
                <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
                Refresh
              </button>
              <button
                onClick={() => { resetForm(); setShowForm(true); }}
                className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
              >
                <Plus className="w-4 h-4" />
                Add Rule
              </button>
            </div>
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 py-6">
        {/* Rule Form */}
        {showForm && (
          <div className="bg-white rounded-xl border border-slate-200 p-6 mb-6 shadow-sm">
            <h2 className="text-lg font-semibold text-slate-900 mb-4">
              {editingRule ? 'Edit Rule' : 'New Commission Rule'}
            </h2>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Rule Name *</label>
                <input
                  type="text"
                  value={formData.ruleName}
                  onChange={e => updateField('ruleName', e.target.value)}
                  placeholder="e.g. Base Commission"
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Type</label>
                <select
                  value={formData.ruleType}
                  onChange={e => updateField('ruleType', e.target.value)}
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm"
                >
                  {RULE_TYPES.map(t => (
                    <option key={t.value} value={t.value}>{t.label}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Rate (decimal, e.g. 0.05 = 5%) *</label>
                <input
                  type="number"
                  step="0.001"
                  value={formData.rate}
                  onChange={e => updateField('rate', e.target.value)}
                  placeholder="0.05"
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Priority (lower = higher priority)</label>
                <input
                  type="number"
                  value={formData.priority}
                  onChange={e => updateField('priority', e.target.value)}
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm"
                />
              </div>
              <div className="md:col-span-2">
                <label className="block text-sm font-medium text-slate-700 mb-1">Description</label>
                <input
                  type="text"
                  value={formData.description}
                  onChange={e => updateField('description', e.target.value)}
                  placeholder="What this rule does"
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Category ID (optional)</label>
                <input
                  type="number"
                  value={formData.categoryId}
                  onChange={e => updateField('categoryId', e.target.value)}
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Product Type (optional)</label>
                <input
                  type="text"
                  value={formData.productType}
                  onChange={e => updateField('productType', e.target.value)}
                  placeholder="e.g. warranty"
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm"
                />
              </div>
              <div className="md:col-span-2 flex items-center gap-6 pt-2">
                <label className="flex items-center gap-2 text-sm text-slate-700 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={formData.appliesToDiscounted}
                    onChange={e => updateField('appliesToDiscounted', e.target.checked)}
                    className="rounded border-slate-300 text-blue-600 focus:ring-blue-500"
                  />
                  Applies to Discounted
                </label>
                <label className="flex items-center gap-2 text-sm text-slate-700 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={formData.isBonus}
                    onChange={e => updateField('isBonus', e.target.checked)}
                    className="rounded border-slate-300 text-blue-600 focus:ring-blue-500"
                  />
                  Is Bonus
                </label>
                <label className="flex items-center gap-2 text-sm text-slate-700 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={formData.isActive}
                    onChange={e => updateField('isActive', e.target.checked)}
                    className="rounded border-slate-300 text-blue-600 focus:ring-blue-500"
                  />
                  Active
                </label>
              </div>
            </div>

            <div className="flex items-center gap-3 mt-6 pt-4 border-t border-slate-200">
              <button
                onClick={handleSave}
                disabled={saving}
                className="flex items-center gap-2 px-5 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors disabled:opacity-50"
              >
                {saving ? 'Saving...' : editingRule ? 'Update Rule' : 'Create Rule'}
              </button>
              <button
                onClick={resetForm}
                className="px-5 py-2 text-slate-600 hover:bg-slate-100 rounded-lg transition-colors"
              >
                Cancel
              </button>
            </div>
          </div>
        )}

        {/* Rules list */}
        {error ? (
          <div className="bg-red-50 border border-red-200 rounded-xl p-6 text-center">
            <p className="text-red-600">{error}</p>
            <button onClick={fetchRules} className="mt-3 text-sm text-red-600 hover:underline">Try again</button>
          </div>
        ) : loading ? (
          <div className="space-y-3">
            {[1,2,3,4].map(i => (
              <div key={i} className="bg-white rounded-xl border border-slate-200 p-5 animate-pulse">
                <div className="flex items-center gap-4">
                  <div className="h-6 bg-slate-200 rounded w-1/4"></div>
                  <div className="h-5 bg-slate-100 rounded-full w-20"></div>
                  <div className="flex-1"></div>
                  <div className="h-5 bg-slate-100 rounded w-16"></div>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
            <div className="px-4 py-3 border-b border-slate-200 bg-slate-50">
              <span className="text-sm font-medium text-slate-600">{rules.length} rule{rules.length !== 1 ? 's' : ''} configured</span>
            </div>

            {rules.length === 0 ? (
              <div className="p-12 text-center">
                <p className="text-slate-500 mb-2">No commission rules configured</p>
                <button
                  onClick={() => { resetForm(); setShowForm(true); }}
                  className="text-sm text-blue-600 hover:underline"
                >
                  Create your first rule
                </button>
              </div>
            ) : (
              <div className="divide-y divide-slate-100">
                {rules.map(rule => (
                  <div
                    key={rule.id}
                    className="flex items-center gap-4 px-4 py-4 hover:bg-slate-50 transition-colors"
                  >
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-3">
                        <span className="font-medium text-slate-900 truncate">{rule.ruleName}</span>
                        <span className={`px-2 py-0.5 text-xs font-medium rounded-full ${getRuleTypeStyle(rule.ruleType)}`}>
                          {rule.ruleType}
                        </span>
                        {rule.isActive ? (
                          <span className="flex items-center gap-1 text-xs text-green-600">
                            <CheckCircle className="w-3.5 h-3.5" />
                            Active
                          </span>
                        ) : (
                          <span className="flex items-center gap-1 text-xs text-red-500">
                            <XCircle className="w-3.5 h-3.5" />
                            Inactive
                          </span>
                        )}
                      </div>
                      {rule.description && (
                        <p className="text-sm text-slate-500 mt-0.5 truncate">{rule.description}</p>
                      )}
                    </div>

                    <div className="text-right shrink-0">
                      <div className="text-sm font-semibold text-slate-900">
                        {rule.ratePercent || `${(rule.rate * 100).toFixed(1)}%`}
                      </div>
                      <div className="text-xs text-slate-500">
                        {rule.categoryName || rule.productType || 'All products'}
                      </div>
                    </div>

                    <div className="text-right shrink-0 text-xs text-slate-500">
                      P{rule.priority}
                    </div>

                    <div className="flex items-center gap-1 shrink-0">
                      <button
                        onClick={() => handleEdit(rule)}
                        className="p-2 text-slate-400 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-colors"
                        title="Edit rule"
                      >
                        <SquarePen className="w-4 h-4" />
                      </button>
                      {rule.isActive && (
                        <button
                          onClick={() => handleDelete(rule.id)}
                          className="p-2 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                          title="Deactivate rule"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </main>
    </div>
  );
}
