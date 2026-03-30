/**
 * FinancingSelector — Flexiti financing card for quote builder
 * Fetches plans from /api/financing/plans, lets user select plan + term,
 * saves to quote via /api/quotations/:quoteId/financing
 */

import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { authFetch } from '../../services/authFetch';
import { CreditCard, Check, X, Loader2 } from 'lucide-react';

const API_URL = process.env.REACT_APP_API_URL || '';

const PLAN_TYPES = [
  { value: 'equal_monthly', label: 'Equal Monthly Payments — 0% Interest', terms: [6, 9, 12, 18] },
  { value: 'deferred', label: 'Deferred — No Payment, No Interest', terms: [3, 6, 9, 12, 18] }
];

export default function FinancingSelector({ quoteId, quoteTotal, quoteFinancing, setQuoteFinancing }) {
  const [enabled, setEnabled] = useState(!!quoteFinancing);
  const [planType, setPlanType] = useState(quoteFinancing?.planType || 'equal_monthly');
  const [termMonths, setTermMonths] = useState(quoteFinancing?.termMonths || 12);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(!!quoteFinancing);
  const [error, setError] = useState(null);

  // Reset saved state when quote changes
  useEffect(() => {
    if (quoteFinancing) {
      setEnabled(true);
      setPlanType(quoteFinancing.planType || quoteFinancing.financing_type || 'equal_monthly');
      setTermMonths(quoteFinancing.termMonths || quoteFinancing.term_months || 12);
      setSaved(true);
    } else {
      setSaved(false);
    }
  }, [quoteFinancing]);

  const selectedPlanConfig = useMemo(
    () => PLAN_TYPES.find(p => p.value === planType) || PLAN_TYPES[0],
    [planType]
  );

  const monthlyPayment = useMemo(() => {
    if (!quoteTotal || quoteTotal <= 0 || !termMonths) return 0;
    if (planType === 'deferred') return 0;
    return quoteTotal / termMonths;
  }, [quoteTotal, termMonths, planType]);

  // Ensure term is valid when plan type changes
  useEffect(() => {
    if (!selectedPlanConfig.terms.includes(termMonths)) {
      setTermMonths(selectedPlanConfig.terms[2] || selectedPlanConfig.terms[0]);
    }
  }, [planType, selectedPlanConfig, termMonths]);

  const handleSave = useCallback(async () => {
    if (!quoteId) {
      // If no quoteId yet, just set in local state
      const financingData = {
        provider: 'flexiti',
        planType,
        termMonths,
        interestRate: 0,
        monthlyPaymentCents: Math.round(monthlyPayment * 100),
        plan: { plan_name: selectedPlanConfig.label, provider: 'flexiti', term_months: termMonths, apr_percent: 0 },
        calculation: { monthlyPaymentCents: Math.round(monthlyPayment * 100), termMonths, totalInterestCents: 0 }
      };
      setQuoteFinancing(financingData);
      setSaved(true);
      return;
    }

    setSaving(true);
    setError(null);
    try {
      const res = await authFetch(`${API_URL}/api/quotations/${quoteId}/financing`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          financing_type: planType,
          provider: 'flexiti',
          plan_name: selectedPlanConfig.label,
          financed_amount_cents: Math.round(quoteTotal * 100),
          down_payment_cents: 0,
          term_months: termMonths,
          apr_percent: 0,
          interest_rate: 0,
          monthly_payment_cents: Math.round(monthlyPayment * 100),
          total_interest_cents: 0
        })
      });
      if (!res.ok) throw new Error('Failed to save financing');

      const financingData = {
        provider: 'flexiti',
        planType,
        termMonths,
        interestRate: 0,
        monthlyPaymentCents: Math.round(monthlyPayment * 100),
        plan: { plan_name: selectedPlanConfig.label, provider: 'flexiti', term_months: termMonths, apr_percent: 0 },
        calculation: { monthlyPaymentCents: Math.round(monthlyPayment * 100), termMonths, totalInterestCents: 0 }
      };
      setQuoteFinancing(financingData);
      setSaved(true);
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  }, [quoteId, planType, termMonths, monthlyPayment, quoteTotal, selectedPlanConfig, setQuoteFinancing]);

  const handleRemove = useCallback(() => {
    setQuoteFinancing(null);
    setEnabled(false);
    setSaved(false);
    setPlanType('equal_monthly');
    setTermMonths(12);
  }, [setQuoteFinancing]);

  const fmt = (v) => new Intl.NumberFormat('en-CA', { style: 'currency', currency: 'CAD' }).format(v || 0);

  return (
    <div style={{
      background: '#ffffff',
      border: '1px solid #e5e7eb',
      borderRadius: 12,
      overflow: 'hidden',
      marginTop: 16
    }}>
      {/* Header */}
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        padding: '14px 20px', borderBottom: enabled ? '1px solid #e5e7eb' : 'none',
        background: '#fafbfc'
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <CreditCard style={{ width: 18, height: 18, color: '#4f46e5' }} />
          <span style={{ fontSize: 14, fontWeight: 700, color: '#111827' }}>Financing Options</span>
          {saved && (
            <span style={{
              fontSize: 11, fontWeight: 700, color: '#059669', background: '#ecfdf5',
              padding: '2px 8px', borderRadius: 10
            }}>
              Active
            </span>
          )}
        </div>
        <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', fontSize: 13 }}>
          <span style={{ color: '#6b7280', fontWeight: 500 }}>{enabled ? 'On' : 'Off'}</span>
          <div
            onClick={() => {
              if (enabled && saved) { handleRemove(); } else { setEnabled(!enabled); }
            }}
            style={{
              width: 40, height: 22, borderRadius: 11, cursor: 'pointer',
              background: enabled ? '#4f46e5' : '#d1d5db', position: 'relative',
              transition: 'background 0.2s'
            }}
          >
            <div style={{
              width: 18, height: 18, borderRadius: 9, background: '#fff',
              position: 'absolute', top: 2,
              left: enabled ? 20 : 2, transition: 'left 0.2s',
              boxShadow: '0 1px 3px rgba(0,0,0,0.2)'
            }} />
          </div>
        </label>
      </div>

      {/* Body */}
      {enabled && (
        <div style={{ padding: 20 }}>
          {saved ? (
            /* ── Saved state ── */
            <div style={{
              background: '#f0fdf4', border: '1px solid #bbf7d0', borderRadius: 10,
              padding: '16px 20px', display: 'flex', alignItems: 'center', justifyContent: 'space-between'
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <Check style={{ width: 18, height: 18, color: '#059669' }} />
                <div>
                  <p style={{ fontSize: 14, fontWeight: 700, color: '#065f46', margin: 0 }}>
                    Flexiti — {termMonths} months @ 0%
                  </p>
                  <p style={{ fontSize: 12, color: '#047857', margin: '2px 0 0' }}>
                    {planType === 'deferred'
                      ? `$0.00 during term, full balance due after ${termMonths} months`
                      : `Est. Monthly Payment: ${fmt(monthlyPayment)}`
                    }
                  </p>
                </div>
              </div>
              <button
                onClick={handleRemove}
                style={{
                  padding: '4px 12px', fontSize: 12, fontWeight: 600, color: '#dc2626',
                  background: '#fef2f2', border: '1px solid #fecaca', borderRadius: 6,
                  cursor: 'pointer'
                }}
              >
                Remove
              </button>
            </div>
          ) : (
            /* ── Selection form ── */
            <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
              {/* Provider */}
              <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                <span style={{ fontSize: 13, fontWeight: 600, color: '#374151', width: 90 }}>Provider</span>
                <span style={{
                  fontSize: 12, fontWeight: 700, color: '#4f46e5', background: '#eef2ff',
                  padding: '4px 12px', borderRadius: 6
                }}>
                  Flexiti
                </span>
              </div>

              {/* Plan Type */}
              <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                <span style={{ fontSize: 13, fontWeight: 600, color: '#374151', width: 90 }}>Plan Type</span>
                <select
                  value={planType}
                  onChange={(e) => setPlanType(e.target.value)}
                  style={{
                    flex: 1, padding: '8px 12px', fontSize: 13, border: '1px solid #d1d5db',
                    borderRadius: 8, outline: 'none', color: '#111827', background: '#f9fafb',
                    cursor: 'pointer'
                  }}
                >
                  {PLAN_TYPES.map(p => (
                    <option key={p.value} value={p.value}>{p.label}</option>
                  ))}
                </select>
              </div>

              {/* Term */}
              <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                <span style={{ fontSize: 13, fontWeight: 600, color: '#374151', width: 90 }}>Term</span>
                <div style={{ display: 'flex', gap: 6 }}>
                  {selectedPlanConfig.terms.map(t => (
                    <button
                      key={t}
                      type="button"
                      onClick={() => setTermMonths(t)}
                      style={{
                        padding: '6px 14px', fontSize: 13, fontWeight: termMonths === t ? 700 : 500,
                        color: termMonths === t ? '#fff' : '#374151',
                        background: termMonths === t ? '#4f46e5' : '#f3f4f6',
                        border: termMonths === t ? '1px solid #4f46e5' : '1px solid #d1d5db',
                        borderRadius: 8, cursor: 'pointer', transition: 'all 0.15s'
                      }}
                    >
                      {t}mo
                    </button>
                  ))}
                </div>
              </div>

              {/* Summary */}
              <div style={{
                background: '#f8fafc', border: '1px solid #e5e7eb', borderRadius: 10,
                padding: '14px 16px'
              }}>
                {planType === 'deferred' ? (
                  <div>
                    <p style={{ fontSize: 13, fontWeight: 600, color: '#111827', margin: 0 }}>
                      $0.00 during {termMonths} month term
                    </p>
                    <p style={{ fontSize: 12, color: '#6b7280', margin: '4px 0 0' }}>
                      Full balance of {fmt(quoteTotal)} due after {termMonths} months. 0% interest if paid in full.
                    </p>
                  </div>
                ) : (
                  <div>
                    <p style={{ fontSize: 13, fontWeight: 600, color: '#111827', margin: 0 }}>
                      Est. Monthly Payment: <span style={{ fontSize: 16, color: '#4f46e5' }}>{fmt(monthlyPayment)}</span>
                    </p>
                    <p style={{ fontSize: 12, color: '#6b7280', margin: '4px 0 0' }}>
                      {termMonths} equal payments of {fmt(monthlyPayment)} — 0% interest on {fmt(quoteTotal)} total
                    </p>
                  </div>
                )}
              </div>

              {/* Error */}
              {error && (
                <p style={{ fontSize: 12, color: '#dc2626', margin: 0 }}>{error}</p>
              )}

              {/* Add Button */}
              <button
                type="button"
                onClick={handleSave}
                disabled={saving || quoteTotal <= 0}
                style={{
                  padding: '10px 20px', fontSize: 14, fontWeight: 700, color: '#fff',
                  background: saving ? '#9ca3af' : '#4f46e5', border: 'none', borderRadius: 8,
                  cursor: saving ? 'default' : 'pointer', display: 'flex', alignItems: 'center',
                  justifyContent: 'center', gap: 8, transition: 'background 0.15s'
                }}
              >
                {saving ? <Loader2 style={{ width: 16, height: 16, animation: 'spin 1s linear infinite' }} /> : <CreditCard style={{ width: 16, height: 16 }} />}
                {saving ? 'Saving...' : 'Add Financing to Quote'}
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
