/**
 * TeleTime POS - Tier Settings Admin
 * Admin-only interface for configuring approval tier thresholds,
 * margin floors, timeouts, and role requirements.
 */

import { useState, useEffect, useCallback, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  ArrowLeftIcon,
  ArrowPathIcon,
  ExclamationTriangleIcon,
  CheckCircleIcon,
  ShieldExclamationIcon,
} from '@heroicons/react/24/outline';
import { useAuth } from '../../context/AuthContext';
import api from '../../api/axios';

// ---- Constants ----

const ROLE_OPTIONS = [
  { value: 'salesperson', label: 'Salesperson' },
  { value: 'manager', label: 'Manager' },
  { value: 'senior_manager', label: 'Senior Manager' },
  { value: 'admin', label: 'Admin' },
];

const ROLE_RANK = { salesperson: 0, manager: 1, senior_manager: 2, admin: 3 };

const TIER_COLORS = [
  { bg: 'bg-green-500', border: 'border-green-300', light: 'bg-green-50', text: 'text-green-700', label: 'green' },
  { bg: 'bg-blue-500', border: 'border-blue-300', light: 'bg-blue-50', text: 'text-blue-700', label: 'blue' },
  { bg: 'bg-amber-500', border: 'border-amber-300', light: 'bg-amber-50', text: 'text-amber-700', label: 'amber' },
  { bg: 'bg-red-500', border: 'border-red-300', light: 'bg-red-50', text: 'text-red-700', label: 'red' },
];

const DEFAULT_TIERS = [
  {
    tier: 1, name: 'Salesperson Discretion',
    min_discount_percent: 0, max_discount_percent: 10,
    min_margin_percent: null, allows_below_cost: false,
    required_role: 'salesperson', timeout_seconds: 0, requires_reason_code: false,
  },
  {
    tier: 2, name: 'Standard Override',
    min_discount_percent: 10.01, max_discount_percent: 25,
    min_margin_percent: 5, allows_below_cost: false,
    required_role: 'manager', timeout_seconds: 180, requires_reason_code: false,
  },
  {
    tier: 3, name: 'Deep Override',
    min_discount_percent: 25.01, max_discount_percent: 50,
    min_margin_percent: 0, allows_below_cost: false,
    required_role: 'senior_manager', timeout_seconds: 300, requires_reason_code: false,
  },
  {
    tier: 4, name: 'Below Cost',
    min_discount_percent: 50.01, max_discount_percent: 100,
    min_margin_percent: null, allows_below_cost: true,
    required_role: 'admin', timeout_seconds: 0, requires_reason_code: true,
  },
];

// ---- Toggle Switch ----

function Toggle({ checked, onChange, label }) {
  return (
    <label className="flex items-center gap-2 cursor-pointer">
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        onClick={() => onChange(!checked)}
        className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${checked ? 'bg-blue-600' : 'bg-gray-300'}`}
      >
        <span className={`inline-block h-4 w-4 transform rounded-full bg-white shadow transition-transform ${checked ? 'translate-x-6' : 'translate-x-1'}`} />
      </button>
      {label && <span className="text-sm text-gray-700">{label}</span>}
    </label>
  );
}

// ---- Tier Map (visual bar) ----

function TierMap({ tiers }) {
  if (!tiers || tiers.length === 0) return null;

  // Find the overall max discount to scale the bar
  const maxDiscount = Math.max(
    ...tiers.map(t => parseFloat(t.max_discount_percent) || 0),
    100
  );

  return (
    <div className="bg-white rounded-xl border border-gray-200 p-6 shadow-sm">
      <h3 className="text-sm font-semibold text-gray-900 mb-4">Tier Map — Discount Range Coverage</h3>
      <div className="relative">
        {/* Scale markers */}
        <div className="flex justify-between text-[10px] text-gray-400 mb-1 px-0.5">
          {[0, 10, 25, 50, 75, 100].map(v => (
            <span key={v} className="tabular-nums">{v}%</span>
          ))}
        </div>

        {/* Bar */}
        <div className="relative h-10 bg-gray-100 rounded-lg overflow-hidden flex">
          {tiers.map((t, i) => {
            const min = parseFloat(t.min_discount_percent) || 0;
            const max = parseFloat(t.max_discount_percent) || 0;
            const left = (min / maxDiscount) * 100;
            const width = ((max - min) / maxDiscount) * 100;
            const color = TIER_COLORS[i % TIER_COLORS.length];

            return (
              <div
                key={t.tier}
                className={`absolute inset-y-0 ${color.bg} flex items-center justify-center transition-all duration-300`}
                style={{ left: `${left}%`, width: `${width}%` }}
                title={`Tier ${t.tier}: ${min}%–${max}%`}
              >
                <span className="text-[10px] font-bold text-white truncate px-1">
                  T{t.tier}
                </span>
              </div>
            );
          })}
        </div>

        {/* Gap/overlap warnings */}
        <div className="mt-2 space-y-1">
          {tiers.slice(1).map((t, i) => {
            const prevMax = parseFloat(tiers[i].max_discount_percent) || 0;
            const curMin = parseFloat(t.min_discount_percent) || 0;
            const gap = curMin - prevMax;

            if (Math.abs(gap) < 0.005) return null; // Close enough (floating point)
            if (gap > 0.01) {
              return (
                <div key={t.tier} className="flex items-center gap-1.5 text-[11px] text-amber-600">
                  <ExclamationTriangleIcon className="w-3.5 h-3.5" />
                  Gap: {prevMax}% to {curMin}% between Tier {tiers[i].tier} and Tier {t.tier}
                </div>
              );
            }
            if (gap < -0.01) {
              return (
                <div key={t.tier} className="flex items-center gap-1.5 text-[11px] text-red-600">
                  <ExclamationTriangleIcon className="w-3.5 h-3.5" />
                  Overlap: Tier {tiers[i].tier} max ({prevMax}%) &gt; Tier {t.tier} min ({curMin}%)
                </div>
              );
            }
            return null;
          })}
        </div>
      </div>
    </div>
  );
}

// ---- Tier Card ----

function TierCard({ tier, index, onChange, warnings }) {
  const color = TIER_COLORS[index % TIER_COLORS.length];

  const update = (field, value) => {
    onChange({ ...tier, [field]: value });
  };

  return (
    <div className={`bg-white rounded-xl border-2 ${color.border} shadow-sm overflow-hidden`}>
      {/* Header */}
      <div className={`${color.light} px-5 py-3 border-b ${color.border}`}>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className={`inline-flex items-center justify-center w-7 h-7 rounded-full ${color.bg} text-white text-xs font-bold`}>
              {tier.tier}
            </span>
            <input
              type="text"
              value={tier.name || ''}
              onChange={e => update('name', e.target.value)}
              className={`text-sm font-bold bg-transparent border-none focus:outline-none focus:ring-0 ${color.text} placeholder-gray-400 w-48`}
              placeholder="Tier name..."
            />
          </div>
        </div>
      </div>

      {/* Body */}
      <div className="p-5 space-y-4">
        {/* Discount Range */}
        <div>
          <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">Discount Range (%)</label>
          <div className="flex items-center gap-2">
            <input
              type="number"
              step="0.01"
              min="0"
              max="100"
              value={tier.min_discount_percent ?? ''}
              onChange={e => update('min_discount_percent', e.target.value === '' ? null : parseFloat(e.target.value))}
              className="w-24 h-10 px-3 text-sm font-medium border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-200 focus:border-blue-500"
              placeholder="Min"
            />
            <span className="text-gray-400 text-sm">to</span>
            <input
              type="number"
              step="0.01"
              min="0"
              max="100"
              value={tier.max_discount_percent ?? ''}
              onChange={e => update('max_discount_percent', e.target.value === '' ? null : parseFloat(e.target.value))}
              className="w-24 h-10 px-3 text-sm font-medium border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-200 focus:border-blue-500"
              placeholder="Max"
            />
            <span className="text-xs text-gray-400">%</span>
          </div>
        </div>

        {/* Min Margin Floor */}
        <div>
          <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">Minimum Margin Floor (%)</label>
          <div className="flex items-center gap-2">
            <input
              type="number"
              step="0.1"
              min="0"
              max="100"
              value={tier.min_margin_percent ?? ''}
              onChange={e => update('min_margin_percent', e.target.value === '' ? null : parseFloat(e.target.value))}
              className="w-24 h-10 px-3 text-sm font-medium border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-200 focus:border-blue-500"
              placeholder="None"
            />
            <span className="text-xs text-gray-400">% — leave blank for no floor</span>
          </div>
        </div>

        {/* Required Role */}
        <div>
          <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">Required Role</label>
          <select
            value={tier.required_role || 'salesperson'}
            onChange={e => update('required_role', e.target.value)}
            className="w-48 h-10 px-3 text-sm font-medium border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-200 focus:border-blue-500 bg-white"
          >
            {ROLE_OPTIONS.map(r => (
              <option key={r.value} value={r.value}>{r.label}</option>
            ))}
          </select>
        </div>

        {/* Timeout */}
        <div>
          <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">Timeout (seconds)</label>
          <div className="flex items-center gap-2">
            <input
              type="number"
              min="0"
              max="3600"
              value={tier.timeout_seconds ?? 0}
              onChange={e => update('timeout_seconds', parseInt(e.target.value) || 0)}
              className="w-24 h-10 px-3 text-sm font-medium border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-200 focus:border-blue-500"
            />
            <span className="text-xs text-gray-400">0 = no timeout</span>
          </div>
        </div>

        {/* Toggles */}
        <div className="flex flex-wrap gap-6 pt-1">
          <Toggle
            checked={!!tier.allows_below_cost}
            onChange={v => update('allows_below_cost', v)}
            label="Allows below cost"
          />
          <Toggle
            checked={!!tier.requires_reason_code}
            onChange={v => update('requires_reason_code', v)}
            label="Requires reason code"
          />
        </div>

        {/* Warnings */}
        {warnings.length > 0 && (
          <div className="space-y-1 pt-2 border-t border-gray-100">
            {warnings.map((w, i) => (
              <div key={i} className={`flex items-start gap-1.5 text-[11px] ${w.level === 'error' ? 'text-red-600' : 'text-amber-600'}`}>
                <ExclamationTriangleIcon className="w-3.5 h-3.5 flex-shrink-0 mt-0.5" />
                <span>{w.message}</span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

// ---- Main Component ----

export function TierSettingsAdmin() {
  const navigate = useNavigate();
  const { user, hasRole } = useAuth();

  const [tiers, setTiers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);
  const [saveResult, setSaveResult] = useState(null);
  const [dirty, setDirty] = useState(false);

  const isAdmin = hasRole('admin');

  // ---- Fetch ----
  const fetchTiers = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await api.get('/pos-approvals/settings/tiers');
      const data = res?.data?.data || res?.data || res;
      if (Array.isArray(data) && data.length > 0) {
        setTiers(data.sort((a, b) => a.tier - b.tier));
      } else {
        // No tiers configured yet — use defaults
        setTiers(DEFAULT_TIERS);
      }
      setDirty(false);
    } catch (err) {
      setError(err?.message || 'Failed to load tier settings');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (isAdmin) fetchTiers();
    else setLoading(false);
  }, [isAdmin, fetchTiers]);

  // ---- Validation ----
  const validationWarnings = useMemo(() => {
    const perTier = {};
    tiers.forEach(t => { perTier[t.tier] = []; });

    // Check each tier
    tiers.forEach((t, i) => {
      if (!t.name?.trim()) {
        perTier[t.tier].push({ level: 'error', message: 'Tier name is required' });
      }
      if (t.min_discount_percent == null || t.max_discount_percent == null) {
        perTier[t.tier].push({ level: 'error', message: 'Discount range min and max are required' });
      }
      if (t.min_discount_percent != null && t.max_discount_percent != null && t.min_discount_percent >= t.max_discount_percent) {
        perTier[t.tier].push({ level: 'error', message: 'Max discount must be greater than min' });
      }

      // Timeout warning
      if (t.timeout_seconds > 0 && t.timeout_seconds < 60) {
        perTier[t.tier].push({ level: 'warn', message: 'Timeout under 60s may not give managers enough time' });
      }

      // Below cost only on highest tier
      if (t.allows_below_cost && i < tiers.length - 1) {
        perTier[t.tier].push({ level: 'warn', message: 'Below-cost is typically only allowed on the highest tier' });
      }

      // Contiguous check (gap/overlap with previous)
      if (i > 0) {
        const prevMax = parseFloat(tiers[i - 1].max_discount_percent) || 0;
        const curMin = parseFloat(t.min_discount_percent) || 0;
        const gap = curMin - prevMax;
        if (gap > 0.02) {
          perTier[t.tier].push({ level: 'error', message: `Gap of ${(gap).toFixed(2)}% between this tier and Tier ${tiers[i - 1].tier}` });
        } else if (gap < -0.02) {
          perTier[t.tier].push({ level: 'error', message: `Overlaps with Tier ${tiers[i - 1].tier} by ${Math.abs(gap).toFixed(2)}%` });
        }
      }

      // Role authority must be >= previous tier
      if (i > 0) {
        const prevRank = ROLE_RANK[tiers[i - 1].required_role] ?? 0;
        const curRank = ROLE_RANK[t.required_role] ?? 0;
        if (curRank < prevRank) {
          perTier[t.tier].push({ level: 'error', message: `Required role must be equal or higher than Tier ${tiers[i - 1].tier} (${tiers[i - 1].required_role})` });
        }
      }
    });

    return perTier;
  }, [tiers]);

  const hasErrors = useMemo(() => {
    return Object.values(validationWarnings).some(
      warnings => warnings.some(w => w.level === 'error')
    );
  }, [validationWarnings]);

  // ---- Handlers ----
  const handleTierChange = useCallback((updatedTier) => {
    setTiers(prev => prev.map(t => t.tier === updatedTier.tier ? updatedTier : t));
    setDirty(true);
    setSaveResult(null);
  }, []);

  const handleSave = useCallback(async () => {
    if (hasErrors) return;
    setSaving(true);
    setSaveResult(null);
    try {
      await api.put('/pos-approvals/settings/tiers', { tiers });
      setSaveResult({ type: 'success', message: 'Tier settings saved successfully' });
      setDirty(false);
    } catch (err) {
      setSaveResult({ type: 'error', message: err?.message || 'Failed to save' });
    } finally {
      setSaving(false);
    }
  }, [tiers, hasErrors]);

  const handleReset = useCallback(() => {
    setTiers(DEFAULT_TIERS.map(d => ({ ...d })));
    setDirty(true);
    setSaveResult(null);
  }, []);

  // ---- Access Denied ----
  if (!isAdmin) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center space-y-4 max-w-sm">
          <div className="w-16 h-16 mx-auto bg-red-50 rounded-full flex items-center justify-center">
            <ShieldExclamationIcon className="w-8 h-8 text-red-400" />
          </div>
          <h2 className="text-lg font-bold text-gray-900">Access Denied</h2>
          <p className="text-sm text-gray-500">Only administrators can configure approval tier settings.</p>
          <button
            type="button"
            onClick={() => navigate(-1)}
            className="px-4 py-2 text-sm font-medium text-blue-600 hover:text-blue-700 hover:bg-blue-50 rounded-lg"
          >
            Go Back
          </button>
        </div>
      </div>
    );
  }

  // ---- Render ----
  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <header className="bg-white border-b border-gray-200 sticky top-0 z-10">
        <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between h-16">
            <div className="flex items-center gap-4">
              <button
                type="button"
                onClick={() => navigate(-1)}
                className="w-10 h-10 flex items-center justify-center text-gray-500 hover:text-gray-700 hover:bg-gray-100 rounded-lg transition-colors"
              >
                <ArrowLeftIcon className="w-5 h-5" />
              </button>
              <div>
                <h1 className="text-xl font-bold text-gray-900">Approval Tier Settings</h1>
                <p className="text-sm text-gray-500">Configure discount thresholds, roles, and timeouts</p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={handleReset}
                disabled={saving}
                className="h-10 px-4 text-sm font-medium text-gray-600 bg-gray-100 hover:bg-gray-200 rounded-lg transition-colors disabled:opacity-50"
              >
                Reset to Defaults
              </button>
              <button
                type="button"
                onClick={handleSave}
                disabled={saving || !dirty || hasErrors}
                className="h-10 px-5 text-sm font-bold text-white bg-blue-600 hover:bg-blue-700 rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
              >
                {saving ? (
                  <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                ) : (
                  <CheckCircleIcon className="w-4 h-4" />
                )}
                Save Changes
              </button>
            </div>
          </div>
        </div>
      </header>

      <main className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-6 space-y-6">
        {/* Save result banner */}
        {saveResult && (
          <div className={`p-4 rounded-xl border text-sm font-medium flex items-center gap-2 ${
            saveResult.type === 'success'
              ? 'bg-green-50 border-green-200 text-green-700'
              : 'bg-red-50 border-red-200 text-red-700'
          }`}>
            {saveResult.type === 'success'
              ? <CheckCircleIcon className="w-5 h-5" />
              : <ExclamationTriangleIcon className="w-5 h-5" />
            }
            {saveResult.message}
          </div>
        )}

        {/* Error */}
        {error && (
          <div className="p-4 bg-red-50 border border-red-200 rounded-xl text-sm text-red-700 flex items-center justify-between">
            <span>{error}</span>
            <button onClick={fetchTiers} className="flex items-center gap-1 text-red-600 font-medium hover:text-red-800">
              <ArrowPathIcon className="w-4 h-4" /> Retry
            </button>
          </div>
        )}

        {/* Loading */}
        {loading ? (
          <div className="flex items-center justify-center py-16">
            <div className="w-10 h-10 border-4 border-blue-200 border-t-blue-600 rounded-full animate-spin" />
          </div>
        ) : (
          <>
            {/* Tier Map */}
            <TierMap tiers={tiers} />

            {/* Validation summary */}
            {hasErrors && (
              <div className="p-3 bg-red-50 border border-red-200 rounded-xl flex items-start gap-2">
                <ExclamationTriangleIcon className="w-5 h-5 text-red-500 flex-shrink-0 mt-0.5" />
                <p className="text-sm text-red-700">Fix validation errors before saving.</p>
              </div>
            )}

            {/* Tier Cards */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              {tiers.map((t, i) => (
                <TierCard
                  key={t.tier}
                  tier={t}
                  index={i}
                  onChange={handleTierChange}
                  warnings={validationWarnings[t.tier] || []}
                />
              ))}
            </div>

            {/* Dirty indicator */}
            {dirty && (
              <p className="text-center text-sm text-amber-600 font-medium">
                You have unsaved changes
              </p>
            )}
          </>
        )}
      </main>
    </div>
  );
}

export default TierSettingsAdmin;
