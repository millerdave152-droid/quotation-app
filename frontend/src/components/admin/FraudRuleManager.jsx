/**
 * TeleTime - Fraud Rule Manager
 * Admin interface for managing configurable fraud detection rules.
 * Features: rules table with active toggle, category-colored badges,
 * rule editor with typed parameter forms, dry-run testing,
 * effectiveness metrics, create new rule form.
 */

import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { authFetch } from '../../services/authFetch';

const API_URL = process.env.REACT_APP_API_URL || '';

// ============================================================================
// CONSTANTS
// ============================================================================

const CATEGORY_COLORS = {
  velocity: { bg: '#dbeafe', text: '#1e40af', border: '#93c5fd', label: 'Velocity' },
  amount: { bg: '#d1fae5', text: '#065f46', border: '#6ee7b7', label: 'Amount' },
  pattern: { bg: '#fef3c7', text: '#92400e', border: '#fcd34d', label: 'Pattern' },
  employee: { bg: '#fce7f3', text: '#9d174d', border: '#f9a8d4', label: 'Employee' },
  customer: { bg: '#ede9fe', text: '#5b21b6', border: '#c4b5fd', label: 'Customer' },
};

const SEVERITY_COLORS = {
  low: '#6b7280',
  medium: '#f59e0b',
  high: '#f97316',
  critical: '#ef4444',
};

const ACTION_LABELS = {
  alert: 'Alert',
  block: 'Block',
  require_approval: 'Require Approval',
};

const RULE_TYPES = ['velocity', 'amount', 'pattern', 'employee', 'customer'];
const SEVERITIES = ['low', 'medium', 'high', 'critical'];
const ACTIONS = ['alert', 'block', 'require_approval'];

// Parameter form schemas by rule_type
const PARAM_SCHEMAS = {
  velocity: [
    { key: 'max_count', label: 'Max Count', type: 'number', min: 1, max: 100 },
    { key: 'window_seconds', label: 'Window (seconds)', type: 'number', min: 10, max: 86400 },
    { key: 'applies_to', label: 'Applies To', type: 'select', options: ['card', 'terminal', 'employee'] },
    { key: 'max_declines', label: 'Max Declines', type: 'number', min: 1, max: 50, optional: true },
  ],
  amount: [
    { key: 'zscore_threshold', label: 'Z-Score Threshold', type: 'number', min: 0.5, max: 5, step: 0.1, optional: true },
    { key: 'threshold_cad', label: 'Threshold ($CAD)', type: 'number', min: 1, max: 100000, optional: true },
    { key: 'threshold', label: 'Threshold (legacy)', type: 'number', min: 1, max: 100000, optional: true },
    { key: 'threshold_percent', label: 'Threshold (%)', type: 'number', min: 1, max: 100, optional: true },
    { key: 'requires_manager', label: 'Requires Manager', type: 'boolean', optional: true },
    { key: 'category_specific', label: 'Category Specific', type: 'boolean', optional: true },
  ],
  pattern: [
    { key: 'window_minutes', label: 'Window (minutes)', type: 'number', min: 1, max: 1440, optional: true },
    { key: 'max_splits', label: 'Max Splits', type: 'number', min: 2, max: 20, optional: true },
    { key: 'small_amount_threshold', label: 'Small Amount ($)', type: 'number', min: 1, max: 100, optional: true },
    { key: 'min_attempts', label: 'Min Attempts', type: 'number', min: 2, max: 50, optional: true },
    { key: 'window_seconds', label: 'Window (seconds)', type: 'number', min: 10, max: 86400, optional: true },
    { key: 'flag_prepaid', label: 'Flag Prepaid', type: 'boolean', optional: true },
    { key: 'flag_foreign', label: 'Flag Foreign', type: 'boolean', optional: true },
    { key: 'start_hour', label: 'Start Hour (0-23)', type: 'number', min: 0, max: 23, optional: true },
    { key: 'end_hour', label: 'End Hour (0-23)', type: 'number', min: 0, max: 23, optional: true },
    { key: 'impossible_travel_minutes', label: 'Travel Window (min)', type: 'number', min: 1, max: 1440, optional: true },
    { key: 'min_distance_km', label: 'Min Distance (km)', type: 'number', min: 1, max: 10000, optional: true },
  ],
  employee: [
    { key: 'pattern', label: 'Pattern', type: 'text', optional: true },
    { key: 'max_returns', label: 'Max Returns', type: 'number', min: 1, max: 100, optional: true },
    { key: 'window_days', label: 'Window (days)', type: 'number', min: 1, max: 365, optional: true },
  ],
  customer: [
    { key: 'pattern', label: 'Pattern', type: 'text', optional: true },
    { key: 'max_returns', label: 'Max Returns', type: 'number', min: 1, max: 100, optional: true },
    { key: 'window_days', label: 'Window (days)', type: 'number', min: 1, max: 365, optional: true },
  ],
};

// ============================================================================
// HELPERS
// ============================================================================

const inputStyle = {
  width: '100%', padding: '7px 10px', border: '1px solid #d1d5db',
  borderRadius: '6px', fontSize: '13px', boxSizing: 'border-box',
};

const labelStyle = {
  display: 'block', fontSize: '12px', fontWeight: 500, color: '#6b7280', marginBottom: '3px',
};

// ============================================================================
// CATEGORY BADGE
// ============================================================================

function CategoryBadge({ type }) {
  const cat = CATEGORY_COLORS[type] || CATEGORY_COLORS.pattern;
  return (
    <span style={{
      display: 'inline-block', padding: '2px 10px', borderRadius: '12px',
      fontSize: '11px', fontWeight: 600, background: cat.bg, color: cat.text,
      border: `1px solid ${cat.border}`,
    }}>{cat.label}</span>
  );
}

// ============================================================================
// WEIGHT SLIDER
// ============================================================================

function WeightSlider({ value, onChange }) {
  const v = parseInt(value) || 0;
  const pct = (v / 25) * 100;
  const color = v <= 8 ? '#10b981' : v <= 15 ? '#f59e0b' : '#ef4444';

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '4px' }}>
        <label style={labelStyle}>Weight</label>
        <span style={{ fontSize: '14px', fontWeight: 700, color }}>{v}</span>
      </div>
      <div style={{ position: 'relative', height: '24px' }}>
        <div style={{
          position: 'absolute', top: '10px', left: 0, right: 0, height: '4px',
          background: '#e5e7eb', borderRadius: '2px',
        }} />
        <div style={{
          position: 'absolute', top: '10px', left: 0, width: `${pct}%`, height: '4px',
          background: color, borderRadius: '2px', transition: 'width 0.15s',
        }} />
        <input
          type="range" min={0} max={25} value={v}
          onChange={e => onChange(parseInt(e.target.value))}
          style={{
            position: 'absolute', top: 0, left: 0, width: '100%', height: '24px',
            opacity: 0, cursor: 'pointer',
          }}
        />
        <div style={{
          position: 'absolute', top: '4px', left: `calc(${pct}% - 8px)`,
          width: '16px', height: '16px', borderRadius: '50%',
          background: color, border: '2px solid white',
          boxShadow: '0 1px 3px rgba(0,0,0,0.3)', transition: 'left 0.15s',
        }} />
      </div>
      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '10px', color: '#9ca3af', marginTop: '2px' }}>
        <span>0 (None)</span><span>25 (Max)</span>
      </div>
    </div>
  );
}

// ============================================================================
// PARAMETERS EDITOR
// ============================================================================

function ParametersEditor({ ruleType, parameters, onChange }) {
  const schema = PARAM_SCHEMAS[ruleType] || [];
  const params = parameters || {};

  // Only show fields that are populated or required (non-optional)
  const visibleFields = schema.filter(f => !f.optional || params[f.key] !== undefined);
  const addableFields = schema.filter(f => f.optional && params[f.key] === undefined);

  const [showAddField, setShowAddField] = useState(false);

  const updateParam = (key, value) => {
    onChange({ ...params, [key]: value });
  };

  const removeParam = (key) => {
    const next = { ...params };
    delete next[key];
    onChange(next);
  };

  const addParam = (key) => {
    const field = schema.find(f => f.key === key);
    const defaultVal = field?.type === 'boolean' ? false : field?.type === 'number' ? 0 : '';
    onChange({ ...params, [key]: defaultVal });
    setShowAddField(false);
  };

  return (
    <div>
      <label style={{ ...labelStyle, marginBottom: '8px' }}>Parameters</label>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px' }}>
        {visibleFields.map(field => (
          <div key={field.key} style={{ position: 'relative' }}>
            <label style={{ fontSize: '11px', color: '#9ca3af', display: 'block', marginBottom: '2px' }}>
              {field.label}
              {field.optional && (
                <button onClick={() => removeParam(field.key)} style={{
                  background: 'none', border: 'none', color: '#d1d5db', cursor: 'pointer',
                  fontSize: '14px', float: 'right', padding: 0, lineHeight: 1,
                }} title="Remove">&times;</button>
              )}
            </label>
            {field.type === 'number' && (
              <input
                type="number" value={params[field.key] ?? ''} step={field.step || 1}
                min={field.min} max={field.max}
                onChange={e => updateParam(field.key, parseFloat(e.target.value) || 0)}
                style={inputStyle}
              />
            )}
            {field.type === 'text' && (
              <input
                type="text" value={params[field.key] || ''}
                onChange={e => updateParam(field.key, e.target.value)}
                style={inputStyle}
              />
            )}
            {field.type === 'boolean' && (
              <label style={{ display: 'flex', alignItems: 'center', gap: '6px', cursor: 'pointer', fontSize: '13px' }}>
                <input
                  type="checkbox" checked={!!params[field.key]}
                  onChange={e => updateParam(field.key, e.target.checked)}
                />
                {params[field.key] ? 'Yes' : 'No'}
              </label>
            )}
            {field.type === 'select' && (
              <select value={params[field.key] || ''} onChange={e => updateParam(field.key, e.target.value)} style={inputStyle}>
                <option value="">Select...</option>
                {field.options.map(o => <option key={o} value={o}>{o}</option>)}
              </select>
            )}
          </div>
        ))}
      </div>

      {addableFields.length > 0 && (
        <div style={{ marginTop: '8px' }}>
          {showAddField ? (
            <div style={{ display: 'flex', gap: '6px', alignItems: 'center' }}>
              <select onChange={e => e.target.value && addParam(e.target.value)} style={{ ...inputStyle, flex: 1 }}>
                <option value="">Add parameter...</option>
                {addableFields.map(f => <option key={f.key} value={f.key}>{f.label}</option>)}
              </select>
              <button onClick={() => setShowAddField(false)} style={{
                background: 'none', border: 'none', color: '#9ca3af', cursor: 'pointer', fontSize: '16px',
              }}>&times;</button>
            </div>
          ) : (
            <button onClick={() => setShowAddField(true)} style={{
              background: 'none', border: '1px dashed #d1d5db', borderRadius: '6px',
              padding: '4px 12px', fontSize: '12px', color: '#6b7280', cursor: 'pointer',
            }}>+ Add Parameter</button>
          )}
        </div>
      )}
    </div>
  );
}

// ============================================================================
// LOCATION OVERRIDES EDITOR
// ============================================================================

function LocationOverridesEditor({ overrides, onChange }) {
  const entries = Object.entries(overrides || {});
  const [newLocId, setNewLocId] = useState('');
  const [newOverrideJson, setNewOverrideJson] = useState('{}');

  const addOverride = () => {
    if (!newLocId) return;
    try {
      const parsed = JSON.parse(newOverrideJson);
      onChange({ ...overrides, [newLocId]: parsed });
      setNewLocId('');
      setNewOverrideJson('{}');
    } catch {
      alert('Invalid JSON for override parameters');
    }
  };

  const removeOverride = (locId) => {
    const next = { ...overrides };
    delete next[locId];
    onChange(next);
  };

  return (
    <div>
      <label style={{ ...labelStyle, marginBottom: '8px' }}>Location Overrides</label>
      {entries.length > 0 && (
        <div style={{ marginBottom: '8px' }}>
          {entries.map(([locId, params]) => (
            <div key={locId} style={{
              display: 'flex', alignItems: 'center', gap: '8px', padding: '6px 10px',
              background: '#f9fafb', borderRadius: '6px', marginBottom: '4px',
              border: '1px solid #e5e7eb', fontSize: '12px',
            }}>
              <span style={{ fontWeight: 600, color: '#374151', minWidth: '80px' }}>Location {locId}</span>
              <span style={{ flex: 1, color: '#6b7280', fontFamily: 'monospace', fontSize: '11px' }}>
                {JSON.stringify(params)}
              </span>
              <button onClick={() => removeOverride(locId)} style={{
                background: 'none', border: 'none', color: '#ef4444', cursor: 'pointer', fontSize: '16px',
              }}>&times;</button>
            </div>
          ))}
        </div>
      )}
      <div style={{ display: 'flex', gap: '6px', alignItems: 'flex-end' }}>
        <div style={{ width: '80px' }}>
          <label style={{ fontSize: '10px', color: '#9ca3af' }}>Location ID</label>
          <input type="number" value={newLocId} onChange={e => setNewLocId(e.target.value)} style={inputStyle} placeholder="#" />
        </div>
        <div style={{ flex: 1 }}>
          <label style={{ fontSize: '10px', color: '#9ca3af' }}>Override JSON</label>
          <input value={newOverrideJson} onChange={e => setNewOverrideJson(e.target.value)} style={{ ...inputStyle, fontFamily: 'monospace', fontSize: '11px' }} />
        </div>
        <button onClick={addOverride} disabled={!newLocId} style={{
          padding: '7px 12px', background: newLocId ? '#667eea' : '#d1d5db', color: 'white',
          border: 'none', borderRadius: '6px', cursor: newLocId ? 'pointer' : 'default',
          fontSize: '12px', fontWeight: 500, whiteSpace: 'nowrap',
        }}>Add</button>
      </div>
    </div>
  );
}

// ============================================================================
// DRY-RUN RESULTS
// ============================================================================

function DryRunResults({ results, loading }) {
  if (loading) {
    return <p style={{ color: '#6b7280', fontSize: '13px', textAlign: 'center', padding: '20px 0' }}>Running test...</p>;
  }
  if (!results) return null;

  const { current, proposed } = results;

  const MetricBox = ({ label, currentVal, proposedVal, format, invertColor }) => {
    const diff = proposedVal !== undefined ? proposedVal - currentVal : null;
    const isWorse = invertColor ? diff < 0 : diff > 0;
    return (
      <div style={{ padding: '10px', background: '#f9fafb', borderRadius: '6px', textAlign: 'center' }}>
        <p style={{ margin: '0 0 4px', fontSize: '11px', color: '#6b7280' }}>{label}</p>
        <p style={{ margin: 0, fontSize: '18px', fontWeight: 700, color: '#111827' }}>
          {format ? format(currentVal) : currentVal}
        </p>
        {diff !== null && diff !== 0 && (
          <p style={{ margin: '2px 0 0', fontSize: '12px', fontWeight: 600, color: isWorse ? '#ef4444' : '#10b981' }}>
            {diff > 0 ? '+' : ''}{format ? format(diff) : diff} proposed
          </p>
        )}
      </div>
    );
  };

  return (
    <div style={{ marginTop: '16px', padding: '16px', background: '#f0f4ff', borderRadius: '8px', border: '1px solid #c7d2fe' }}>
      <h4 style={{ margin: '0 0 12px', fontSize: '14px', fontWeight: 600, color: '#4338ca' }}>
        Dry-Run Results ({results.period})
      </h4>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '8px' }}>
        <MetricBox label="Total Transactions" currentVal={current.total_transactions} proposedVal={proposed?.total_transactions} />
        <MetricBox label="Would Flag" currentVal={current.would_flag} proposedVal={proposed?.would_flag} />
        <MetricBox label="Would Decline" currentVal={current.would_decline} proposedVal={proposed?.would_decline} />
        <MetricBox label="False Positive Rate" currentVal={current.false_positive_rate} proposedVal={proposed?.false_positive_rate}
          format={v => `${v}%`} invertColor />
      </div>
    </div>
  );
}

// ============================================================================
// EFFECTIVENESS METRICS
// ============================================================================

function EffectivenessMetrics({ metrics }) {
  if (!metrics) return null;

  const items = [
    { label: 'Fires / Day', value: metrics.fires_per_day, color: '#3b82f6' },
    { label: 'Fires / Week', value: metrics.fires_per_week, color: '#6366f1' },
    { label: 'Total (30d)', value: metrics.total_fires_30d, color: '#111827' },
    { label: 'Top Signal %', value: `${metrics.top_signal_pct}%`, color: metrics.top_signal_pct > 20 ? '#f59e0b' : '#6b7280' },
    { label: 'Reviewed', value: metrics.reviewed_count, color: '#6b7280' },
    { label: 'False Pos Rate', value: `${metrics.false_positive_rate}%`, color: metrics.false_positive_rate > 30 ? '#ef4444' : '#10b981' },
  ];

  return (
    <div style={{ marginTop: '16px' }}>
      <label style={{ ...labelStyle, marginBottom: '8px' }}>Effectiveness (30 days)</label>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '6px' }}>
        {items.map(i => (
          <div key={i.label} style={{
            padding: '8px', background: '#f9fafb', borderRadius: '6px', textAlign: 'center',
          }}>
            <p style={{ margin: '0 0 2px', fontSize: '10px', color: '#9ca3af', textTransform: 'uppercase', letterSpacing: '0.5px' }}>{i.label}</p>
            <p style={{ margin: 0, fontSize: '16px', fontWeight: 700, color: i.color }}>{i.value}</p>
          </div>
        ))}
      </div>
    </div>
  );
}

// ============================================================================
// RULE EDITOR MODAL
// ============================================================================

function RuleEditor({ rule, onSave, onCancel, onTest: _onTest }) {
  const isNew = !rule?.id;
  const [form, setForm] = useState({
    rule_code: rule?.rule_code || '',
    rule_name: rule?.rule_name || '',
    description: rule?.description || '',
    rule_type: rule?.rule_type || 'pattern',
    risk_points: rule?.risk_points || 0,
    severity: rule?.severity || 'medium',
    action: rule?.action || 'alert',
    is_active: rule?.is_active !== false,
    weight: rule?.weight || 0,
    parameters: rule?.parameters || {},
    location_overrides: rule?.location_overrides || {},
  });
  const [saving, setSaving] = useState(false);
  const [effectiveness, setEffectiveness] = useState(rule?.effectiveness || null);
  const [dryRunResults, setDryRunResults] = useState(null);
  const [testing, setTesting] = useState(false);
  const [loadingDetail, setLoadingDetail] = useState(false);

  // Load effectiveness metrics for existing rules
  useEffect(() => {
    if (rule?.id && !rule?.effectiveness) {
      setLoadingDetail(true);
      authFetch(`${API_URL}/api/fraud/rules/${rule.id}`)
        .then(r => r.json())
        .then(json => {
          if (json.success && json.data.effectiveness) {
            setEffectiveness(json.data.effectiveness);
          }
        })
        .catch(() => {})
        .finally(() => setLoadingDetail(false));
    }
  }, [rule?.id, rule?.effectiveness]);

  const handleSave = async () => {
    if (!form.rule_code || !form.rule_name) {
      alert('Rule code and name are required');
      return;
    }
    setSaving(true);
    try {
      await onSave(form, isNew);
    } catch { /* handled by parent */ }
    setSaving(false);
  };

  const handleTest = async () => {
    if (!rule?.id) return;
    setTesting(true);
    try {
      const resp = await authFetch(`${API_URL}/api/fraud/rules/${rule.id}/test`, {
        method: 'POST',
        body: JSON.stringify({
          test_parameters: {
            weight: form.weight,
            risk_points: form.risk_points,
          },
        }),
      });
      const json = await resp.json();
      if (json.success) setDryRunResults(json.data);
    } catch { /* ignore */ }
    setTesting(false);
  };

  return (
    <div style={{
      position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
      background: 'rgba(0,0,0,0.5)', display: 'flex', justifyContent: 'flex-end',
      zIndex: 9999,
    }} onClick={onCancel}>
      <div style={{
        width: '560px', height: '100%', background: 'white', overflow: 'auto',
        boxShadow: '-8px 0 30px rgba(0,0,0,0.2)', padding: '28px',
      }} onClick={e => e.stopPropagation()}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '24px' }}>
          <h2 style={{ margin: 0, fontSize: '20px', fontWeight: 700 }}>
            {isNew ? 'Create New Rule' : `Edit: ${rule.rule_name}`}
          </h2>
          <button onClick={onCancel} style={{
            background: 'none', border: 'none', fontSize: '24px', color: '#9ca3af', cursor: 'pointer',
          }}>&times;</button>
        </div>

        {/* Rule Code + Name */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px', marginBottom: '14px' }}>
          <div>
            <label style={labelStyle}>Rule Code *</label>
            <input
              value={form.rule_code} readOnly={!isNew}
              onChange={e => setForm({ ...form, rule_code: e.target.value.toLowerCase().replace(/[^a-z0-9_]/g, '') })}
              style={{ ...inputStyle, background: isNew ? 'white' : '#f3f4f6' }}
              placeholder="e.g. velocity_card_1hr"
            />
          </div>
          <div>
            <label style={labelStyle}>Category *</label>
            <select
              value={form.rule_type} disabled={!isNew}
              onChange={e => setForm({ ...form, rule_type: e.target.value, parameters: {} })}
              style={{ ...inputStyle, background: isNew ? 'white' : '#f3f4f6' }}
            >
              {RULE_TYPES.map(t => <option key={t} value={t}>{CATEGORY_COLORS[t]?.label || t}</option>)}
            </select>
          </div>
        </div>

        <div style={{ marginBottom: '14px' }}>
          <label style={labelStyle}>Rule Name *</label>
          <input value={form.rule_name} onChange={e => setForm({ ...form, rule_name: e.target.value })} style={inputStyle} />
        </div>

        <div style={{ marginBottom: '14px' }}>
          <label style={labelStyle}>Description</label>
          <textarea value={form.description} onChange={e => setForm({ ...form, description: e.target.value })}
            rows={2} style={{ ...inputStyle, resize: 'vertical' }} />
        </div>

        {/* Severity + Action */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px', marginBottom: '14px' }}>
          <div>
            <label style={labelStyle}>Severity</label>
            <select value={form.severity} onChange={e => setForm({ ...form, severity: e.target.value })} style={inputStyle}>
              {SEVERITIES.map(s => <option key={s} value={s}>{s.charAt(0).toUpperCase() + s.slice(1)}</option>)}
            </select>
          </div>
          <div>
            <label style={labelStyle}>Action</label>
            <select value={form.action} onChange={e => setForm({ ...form, action: e.target.value })} style={inputStyle}>
              {ACTIONS.map(a => <option key={a} value={a}>{ACTION_LABELS[a]}</option>)}
            </select>
          </div>
        </div>

        {/* Risk Points + Active */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px', marginBottom: '14px' }}>
          <div>
            <label style={labelStyle}>Risk Points (0-100)</label>
            <input type="number" min={0} max={100} value={form.risk_points}
              onChange={e => setForm({ ...form, risk_points: parseInt(e.target.value) || 0 })} style={inputStyle} />
          </div>
          <div>
            <label style={labelStyle}>Active</label>
            <label style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer', padding: '8px 0' }}>
              <div onClick={() => setForm({ ...form, is_active: !form.is_active })} style={{
                width: '40px', height: '22px', borderRadius: '11px',
                background: form.is_active ? '#10b981' : '#d1d5db',
                position: 'relative', cursor: 'pointer', transition: 'background 0.2s',
              }}>
                <div style={{
                  width: '18px', height: '18px', borderRadius: '50%', background: 'white',
                  position: 'absolute', top: '2px', left: form.is_active ? '20px' : '2px',
                  transition: 'left 0.2s', boxShadow: '0 1px 3px rgba(0,0,0,0.2)',
                }} />
              </div>
              <span style={{ fontSize: '13px', color: form.is_active ? '#10b981' : '#6b7280', fontWeight: 500 }}>
                {form.is_active ? 'Active' : 'Inactive'}
              </span>
            </label>
          </div>
        </div>

        {/* Weight Slider */}
        <div style={{ marginBottom: '18px' }}>
          <WeightSlider value={form.weight} onChange={w => setForm({ ...form, weight: w })} />
        </div>

        <hr style={{ border: 'none', borderTop: '1px solid #e5e7eb', margin: '16px 0' }} />

        {/* Parameters Editor */}
        <div style={{ marginBottom: '16px' }}>
          <ParametersEditor
            ruleType={form.rule_type}
            parameters={form.parameters}
            onChange={p => setForm({ ...form, parameters: p })}
          />
        </div>

        {/* Location Overrides */}
        <div style={{ marginBottom: '16px' }}>
          <LocationOverridesEditor
            overrides={form.location_overrides}
            onChange={o => setForm({ ...form, location_overrides: o })}
          />
        </div>

        <hr style={{ border: 'none', borderTop: '1px solid #e5e7eb', margin: '16px 0' }} />

        {/* Effectiveness Metrics */}
        {!isNew && (
          loadingDetail ? (
            <p style={{ fontSize: '13px', color: '#9ca3af', textAlign: 'center' }}>Loading metrics...</p>
          ) : (
            <EffectivenessMetrics metrics={effectiveness} />
          )
        )}

        {/* Dry-Run Testing */}
        {!isNew && (
          <div style={{ marginTop: '16px' }}>
            <button onClick={handleTest} disabled={testing} style={{
              padding: '8px 18px', background: testing ? '#d1d5db' : '#111827', color: 'white',
              border: 'none', borderRadius: '6px', cursor: testing ? 'default' : 'pointer',
              fontWeight: 500, fontSize: '13px', width: '100%',
            }}>{testing ? 'Running Test...' : 'Test Rule Against Last 30 Days'}</button>
            <DryRunResults results={dryRunResults} loading={testing} />
          </div>
        )}

        <hr style={{ border: 'none', borderTop: '1px solid #e5e7eb', margin: '20px 0' }} />

        {/* Actions */}
        <div style={{ display: 'flex', gap: '10px', justifyContent: 'flex-end' }}>
          <button onClick={onCancel} style={{
            padding: '8px 18px', border: '1px solid #d1d5db', borderRadius: '6px',
            background: 'white', color: '#374151', cursor: 'pointer', fontWeight: 500,
          }}>Cancel</button>
          <button onClick={handleSave} disabled={saving} style={{
            padding: '8px 24px', border: 'none', borderRadius: '6px',
            background: saving ? '#d1d5db' : '#667eea', color: 'white',
            cursor: saving ? 'default' : 'pointer', fontWeight: 500,
          }}>{saving ? 'Saving...' : isNew ? 'Create Rule' : 'Save Changes'}</button>
        </div>
      </div>
    </div>
  );
}

// ============================================================================
// MAIN COMPONENT
// ============================================================================

export default function FraudRuleManager() {
  const [rules, setRules] = useState([]);
  const [loading, setLoading] = useState(true);
  const [editingRule, setEditingRule] = useState(null); // null | rule object | { _isNew: true }
  const [sortBy, setSortBy] = useState('category'); // category | weight | name
  const [filterType, setFilterType] = useState('all');
  const [togglingId, setTogglingId] = useState(null);

  // ---- Fetch rules ----
  const fetchRules = useCallback(async () => {
    setLoading(true);
    try {
      const resp = await authFetch(`${API_URL}/api/fraud/rules`);
      const json = await resp.json();
      if (json.success) setRules(json.data || []);
    } catch { /* ignore */ }
    setLoading(false);
  }, []);

  useEffect(() => { fetchRules(); }, [fetchRules]);

  // ---- Toggle active ----
  const handleToggle = async (rule) => {
    setTogglingId(rule.id);
    try {
      await authFetch(`${API_URL}/api/fraud/rules/${rule.id}`, {
        method: 'PUT',
        body: JSON.stringify({ is_active: !rule.is_active }),
      });
      setRules(prev => prev.map(r => r.id === rule.id ? { ...r, is_active: !r.is_active } : r));
    } catch { /* ignore */ }
    setTogglingId(null);
  };

  // ---- Save rule ----
  const handleSave = async (formData, isNew) => {
    const method = isNew ? 'POST' : 'PUT';
    const url = isNew
      ? `${API_URL}/api/fraud/rules`
      : `${API_URL}/api/fraud/rules/${editingRule.id}`;

    const resp = await authFetch(url, {
      method,
      body: JSON.stringify(formData),
    });
    const json = await resp.json();
    if (!json.success) {
      alert(json.error || 'Failed to save rule');
      return;
    }
    setEditingRule(null);
    fetchRules();
  };

  // ---- Delete (soft) ----
  const handleDelete = async (rule) => {
    if (!window.confirm(`Deactivate rule "${rule.rule_name}"? This will disable it from fraud detection.`)) return;
    try {
      await authFetch(`${API_URL}/api/fraud/rules/${rule.id}`, { method: 'DELETE' });
      fetchRules();
    } catch { /* ignore */ }
  };

  // ---- Sort + Filter ----
  const sortedRules = useMemo(() => {
    let filtered = filterType === 'all' ? rules : rules.filter(r => r.rule_type === filterType);

    return [...filtered].sort((a, b) => {
      if (sortBy === 'category') return (a.rule_type || '').localeCompare(b.rule_type || '') || (a.rule_code || '').localeCompare(b.rule_code || '');
      if (sortBy === 'weight') return (b.weight || b.risk_points || 0) - (a.weight || a.risk_points || 0);
      if (sortBy === 'name') return (a.rule_name || '').localeCompare(b.rule_name || '');
      return 0;
    });
  }, [rules, filterType, sortBy]);

  // ---- Category counts ----
  const categoryCounts = useMemo(() => {
    const counts = { all: rules.length };
    for (const r of rules) {
      counts[r.rule_type] = (counts[r.rule_type] || 0) + 1;
    }
    return counts;
  }, [rules]);

  return (
    <div>
      {/* ---- TOOLBAR ---- */}
      <div style={{
        display: 'flex', justifyContent: 'space-between', alignItems: 'center',
        marginBottom: '16px', flexWrap: 'wrap', gap: '10px',
      }}>
        {/* Filter tabs */}
        <div style={{ display: 'flex', gap: '4px', flexWrap: 'wrap' }}>
          <button onClick={() => setFilterType('all')} style={{
            padding: '5px 12px', borderRadius: '6px', fontSize: '12px', fontWeight: 500,
            border: '1px solid', cursor: 'pointer',
            borderColor: filterType === 'all' ? '#667eea' : '#d1d5db',
            background: filterType === 'all' ? '#667eea' : 'white',
            color: filterType === 'all' ? 'white' : '#374151',
          }}>All ({categoryCounts.all})</button>
          {RULE_TYPES.map(t => {
            const cat = CATEGORY_COLORS[t];
            return (
              <button key={t} onClick={() => setFilterType(t)} style={{
                padding: '5px 12px', borderRadius: '6px', fontSize: '12px', fontWeight: 500,
                border: '1px solid', cursor: 'pointer',
                borderColor: filterType === t ? cat.text : '#d1d5db',
                background: filterType === t ? cat.bg : 'white',
                color: filterType === t ? cat.text : '#374151',
              }}>{cat.label} ({categoryCounts[t] || 0})</button>
            );
          })}
        </div>

        <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
          {/* Sort */}
          <select value={sortBy} onChange={e => setSortBy(e.target.value)} style={{
            padding: '5px 10px', border: '1px solid #d1d5db', borderRadius: '6px',
            fontSize: '12px', color: '#6b7280',
          }}>
            <option value="category">Sort: Category</option>
            <option value="weight">Sort: Weight</option>
            <option value="name">Sort: Name</option>
          </select>

          <button onClick={() => setEditingRule({ _isNew: true })} style={{
            padding: '7px 16px', background: '#667eea', color: 'white', border: 'none',
            borderRadius: '6px', cursor: 'pointer', fontWeight: 500, fontSize: '13px',
          }}>+ New Rule</button>
        </div>
      </div>

      {/* ---- RULES TABLE ---- */}
      {loading ? (
        <div style={{ display: 'flex', justifyContent: 'center', padding: '60px 0' }}>
          <div style={{
            width: '40px', height: '40px', border: '3px solid #e5e7eb',
            borderTopColor: '#667eea', borderRadius: '50%',
            animation: 'frspin 0.8s linear infinite',
          }} />
          <style>{`@keyframes frspin { to { transform: rotate(360deg); } }`}</style>
        </div>
      ) : (
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px' }}>
            <thead>
              <tr style={{ borderBottom: '2px solid #e5e7eb' }}>
                <th style={{ padding: '10px 12px', textAlign: 'center', width: '60px', color: '#6b7280', fontWeight: 600 }}>Active</th>
                <th style={{ padding: '10px 12px', textAlign: 'left', color: '#6b7280', fontWeight: 600 }}>Rule</th>
                <th style={{ padding: '10px 12px', textAlign: 'left', color: '#6b7280', fontWeight: 600 }}>Category</th>
                <th style={{ padding: '10px 12px', textAlign: 'center', color: '#6b7280', fontWeight: 600 }}>Weight</th>
                <th style={{ padding: '10px 12px', textAlign: 'center', color: '#6b7280', fontWeight: 600 }}>Points</th>
                <th style={{ padding: '10px 12px', textAlign: 'center', color: '#6b7280', fontWeight: 600 }}>Severity</th>
                <th style={{ padding: '10px 12px', textAlign: 'center', color: '#6b7280', fontWeight: 600 }}>Action</th>
                <th style={{ padding: '10px 12px', textAlign: 'right', color: '#6b7280', fontWeight: 600 }}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {sortedRules.map(rule => {
                const weight = rule.weight || rule.risk_points || 0;
                const weightColor = weight <= 8 ? '#10b981' : weight <= 15 ? '#f59e0b' : '#ef4444';

                return (
                  <tr key={rule.id} style={{
                    borderBottom: '1px solid #f3f4f6',
                    opacity: rule.is_active ? 1 : 0.5,
                    transition: 'opacity 0.2s',
                  }}>
                    {/* Toggle */}
                    <td style={{ padding: '10px 12px', textAlign: 'center' }}>
                      <div
                        onClick={() => handleToggle(rule)}
                        style={{
                          width: '36px', height: '20px', borderRadius: '10px',
                          background: rule.is_active ? '#10b981' : '#d1d5db',
                          position: 'relative', cursor: togglingId === rule.id ? 'default' : 'pointer',
                          transition: 'background 0.2s', display: 'inline-block',
                          opacity: togglingId === rule.id ? 0.5 : 1,
                        }}
                      >
                        <div style={{
                          width: '16px', height: '16px', borderRadius: '50%', background: 'white',
                          position: 'absolute', top: '2px', left: rule.is_active ? '18px' : '2px',
                          transition: 'left 0.2s', boxShadow: '0 1px 2px rgba(0,0,0,0.2)',
                        }} />
                      </div>
                    </td>
                    {/* Rule name + description */}
                    <td style={{ padding: '10px 12px' }}>
                      <p style={{ margin: '0 0 2px', fontWeight: 600, color: '#111827' }}>{rule.rule_name}</p>
                      <p style={{ margin: 0, fontSize: '11px', color: '#9ca3af' }}>
                        {rule.rule_code}
                        {rule.description ? ` — ${rule.description.substring(0, 60)}${rule.description.length > 60 ? '...' : ''}` : ''}
                      </p>
                    </td>
                    {/* Category */}
                    <td style={{ padding: '10px 12px' }}>
                      <CategoryBadge type={rule.rule_type} />
                    </td>
                    {/* Weight */}
                    <td style={{ padding: '10px 12px', textAlign: 'center' }}>
                      <span style={{ fontWeight: 700, color: weightColor, fontSize: '15px' }}>{weight}</span>
                    </td>
                    {/* Risk points */}
                    <td style={{ padding: '10px 12px', textAlign: 'center', color: '#374151' }}>{rule.risk_points}</td>
                    {/* Severity */}
                    <td style={{ padding: '10px 12px', textAlign: 'center' }}>
                      <span style={{
                        display: 'inline-block', width: '8px', height: '8px', borderRadius: '50%',
                        background: SEVERITY_COLORS[rule.severity] || '#6b7280',
                        marginRight: '4px',
                      }} />
                      <span style={{ fontSize: '12px', color: SEVERITY_COLORS[rule.severity] || '#6b7280', fontWeight: 500, textTransform: 'capitalize' }}>
                        {rule.severity}
                      </span>
                    </td>
                    {/* Action */}
                    <td style={{ padding: '10px 12px', textAlign: 'center' }}>
                      <span style={{
                        fontSize: '11px', fontWeight: 500, padding: '2px 8px', borderRadius: '4px',
                        background: rule.action === 'block' ? '#fee2e2' : rule.action === 'require_approval' ? '#fef3c7' : '#f3f4f6',
                        color: rule.action === 'block' ? '#991b1b' : rule.action === 'require_approval' ? '#92400e' : '#6b7280',
                      }}>{ACTION_LABELS[rule.action] || rule.action}</span>
                    </td>
                    {/* Actions */}
                    <td style={{ padding: '10px 12px', textAlign: 'right' }}>
                      <div style={{ display: 'flex', gap: '6px', justifyContent: 'flex-end' }}>
                        <button onClick={() => setEditingRule(rule)} style={{
                          padding: '4px 12px', background: '#f3f4f6', color: '#374151',
                          border: '1px solid #e5e7eb', borderRadius: '4px', cursor: 'pointer',
                          fontSize: '12px', fontWeight: 500,
                        }}>Edit</button>
                        {rule.is_active && (
                          <button onClick={() => handleDelete(rule)} style={{
                            padding: '4px 12px', background: 'white', color: '#ef4444',
                            border: '1px solid #fecaca', borderRadius: '4px', cursor: 'pointer',
                            fontSize: '12px', fontWeight: 500,
                          }}>Disable</button>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })}
              {sortedRules.length === 0 && (
                <tr>
                  <td colSpan={8} style={{ padding: '30px', textAlign: 'center', color: '#9ca3af' }}>
                    No rules found{filterType !== 'all' ? ` in category "${filterType}"` : ''}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}

      {/* ---- EDITOR MODAL ---- */}
      {editingRule && (
        <RuleEditor
          rule={editingRule._isNew ? null : editingRule}
          onSave={handleSave}
          onCancel={() => setEditingRule(null)}
        />
      )}
    </div>
  );
}
