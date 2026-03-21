/**
 * InstitutionalPanel — Quote builder institutional mode
 * Renders below the main quote form when the selected customer
 * has an institutional_profile. Hidden entirely otherwise.
 */

import React, { useState, useEffect, useCallback } from 'react';
import {
  Select, MenuItem, FormControl, InputLabel, Switch,
  Chip, LinearProgress
} from '@mui/material';
import apiClient from '../../services/apiClient';

const PAYMENT_TERMS_OPTIONS = [
  { value: 'net30', label: 'Net-30' },
  { value: 'net60', label: 'Net-60' },
  { value: 'net90', label: 'Net-90' },
  { value: 'cod', label: 'COD' },
  { value: 'prepaid', label: 'Prepaid' },
];

const formatCurrency = (cents) => {
  if (!cents && cents !== 0) return '$0.00';
  return `$${(cents / 100).toFixed(2).replace(/\B(?=(\d{3})+(?!\d))/g, ',')}`;
};

const inputStyle = {
  width: '100%', padding: '10px 12px', border: '1px solid #d1d5db',
  borderRadius: '6px', fontSize: '14px', background: 'white',
};

const labelStyle = {
  display: 'block', marginBottom: '4px', fontSize: '13px',
  fontWeight: 600, color: '#374151',
};

export default function InstitutionalPanel({
  customerId,
  fields,
  setFields,
  quoteTotalCents = 0,
  onDeliveryAddressSelect,
}) {
  const [profile, setProfile] = useState(null);
  const [addresses, setAddresses] = useState([]);
  const [exemption, setExemption] = useState(null);
  const [creditStatus, setCreditStatus] = useState(null);
  const [loading, setLoading] = useState(true);

  // Fetch institutional profile for customer
  useEffect(() => {
    if (!customerId) {
      setProfile(null);
      setLoading(false);
      return;
    }

    let cancelled = false;
    (async () => {
      setLoading(true);
      try {
        const { data } = await apiClient.get(`/api/institutional/customer/${customerId}/profile`);
        const p = data.data?.profile || data.profile || null;
        if (cancelled) return;
        setProfile(p);

        if (p) {
          // Pre-fill payment terms from profile
          if (!fields.payment_terms) {
            setFields(f => ({ ...f, payment_terms: p.payment_terms, institutional_profile_id: p.id }));
          } else {
            setFields(f => ({ ...f, institutional_profile_id: p.id }));
          }

          // Fetch addresses
          try {
            const addrRes = await apiClient.get(`/api/institutional/${p.id}/addresses`);
            if (!cancelled) setAddresses((addrRes.data.data || addrRes.data) || []);
          } catch { /* silent */ }

          // Fetch exemptions
          try {
            const exRes = await apiClient.get(`/api/tax/customer/${customerId}/exemptions`);
            const certs = exRes.data.data || exRes.data || [];
            if (!cancelled && certs.length > 0) {
              setExemption(certs[0]);
              setFields(f => ({ ...f, tax_exempt_cert_id: certs[0].id }));
            }
          } catch { /* silent */ }

          // Fetch credit
          try {
            const crRes = await apiClient.get(`/api/institutional/${p.id}/credit`);
            if (!cancelled) setCreditStatus(crRes.data.data || crRes.data);
          } catch { /* silent */ }
        }
      } catch {
        if (!cancelled) setProfile(null);
      }
      if (!cancelled) setLoading(false);
    })();

    return () => { cancelled = true; };
  }, [customerId]); // eslint-disable-line react-hooks/exhaustive-deps

  // Handle delivery site selection
  const handleSiteSelect = useCallback((addressId) => {
    setFields(f => ({ ...f, delivery_address_id: addressId }));
    const addr = addresses.find(a => a.id === parseInt(addressId));
    if (addr && onDeliveryAddressSelect) {
      onDeliveryAddressSelect({
        address: addr.address_line1 + (addr.address_line2 ? `, ${addr.address_line2}` : ''),
        city: addr.city,
        postal_code: addr.postal_code,
      });
    }
  }, [addresses, setFields, onDeliveryAddressSelect]);

  // Don't render if no profile
  if (loading) return null;
  if (!profile) return null;

  const poRequired = profile.requires_po;
  const creditPct = creditStatus?.hasLimit
    ? Math.min(creditStatus.utilizationPct, 100)
    : 0;
  const creditBarColor = creditPct >= 90 ? '#dc2626' : creditPct >= 70 ? '#d97706' : '#3b82f6';

  return (
    <div style={{
      background: 'white', border: '1px solid #bfdbfe', borderRadius: '12px',
      padding: '20px', marginTop: '16px',
    }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '16px' }}>
        <span style={{ fontSize: '16px', fontWeight: 700, color: '#1e40af' }}>
          Institutional Account
        </span>
        <Chip label={profile.org_type.replace('_', ' ')} size="small" color="primary" variant="outlined" sx={{ textTransform: 'capitalize' }} />
        <span style={{ fontSize: '13px', color: '#6b7280' }}>{profile.org_name}</span>
      </div>

      {/* Row 1: PO + Budget */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px', marginBottom: '14px' }}>
        <div>
          <label style={labelStyle}>
            PO Number {poRequired && <span style={{ color: '#dc2626' }}>*</span>}
          </label>
          <input
            style={{ ...inputStyle, borderColor: poRequired && !fields.po_number ? '#fca5a5' : '#d1d5db' }}
            placeholder={poRequired ? 'Required for this account' : 'Optional'}
            value={fields.po_number || ''}
            onChange={(e) => setFields(f => ({ ...f, po_number: e.target.value }))}
          />
          {poRequired && !fields.po_number && (
            <p style={{ margin: '4px 0 0', fontSize: '12px', color: '#dc2626' }}>
              This account requires a PO number before the quote can be sent.
            </p>
          )}
        </div>
        <div>
          <label style={labelStyle}>Budget Code</label>
          <input
            style={inputStyle}
            placeholder="Optional"
            value={fields.budget_code || ''}
            onChange={(e) => setFields(f => ({ ...f, budget_code: e.target.value }))}
          />
        </div>
      </div>

      {/* Row 2: Department + Terms */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px', marginBottom: '14px' }}>
        <div>
          <label style={labelStyle}>Department Reference</label>
          <input
            style={inputStyle}
            placeholder="Optional"
            value={fields.department_reference || ''}
            onChange={(e) => setFields(f => ({ ...f, department_reference: e.target.value }))}
          />
        </div>
        <FormControl fullWidth size="small">
          <InputLabel sx={{ fontSize: '13px' }}>Payment Terms</InputLabel>
          <Select
            value={fields.payment_terms || 'net30'}
            label="Payment Terms"
            onChange={(e) => setFields(f => ({ ...f, payment_terms: e.target.value }))}
            sx={{ fontSize: '14px' }}
          >
            {PAYMENT_TERMS_OPTIONS.map(opt => (
              <MenuItem key={opt.value} value={opt.value}>{opt.label}</MenuItem>
            ))}
          </Select>
        </FormControl>
      </div>

      {/* Row 3: Delivery + Tax */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px', marginBottom: '14px' }}>
        <FormControl fullWidth size="small">
          <InputLabel sx={{ fontSize: '13px' }}>Delivery Site</InputLabel>
          <Select
            value={fields.delivery_address_id || ''}
            label="Delivery Site"
            onChange={(e) => handleSiteSelect(e.target.value)}
            sx={{ fontSize: '14px' }}
          >
            <MenuItem value="">None selected</MenuItem>
            {addresses.map(addr => (
              <MenuItem key={addr.id} value={addr.id}>
                {addr.site_name} — {addr.city}
              </MenuItem>
            ))}
          </Select>
        </FormControl>

        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <label style={{ ...labelStyle, marginBottom: 0 }}>Tax Exempt</label>
            <Switch
              checked={!!fields.tax_exempt_cert_id}
              onChange={(e) => {
                if (e.target.checked && !exemption) {
                  // Manual override
                  setFields(f => ({ ...f, tax_exempt_cert_id: 'manual' }));
                } else if (!e.target.checked) {
                  setFields(f => ({ ...f, tax_exempt_cert_id: null }));
                } else if (exemption) {
                  setFields(f => ({ ...f, tax_exempt_cert_id: exemption.id }));
                }
              }}
              size="small"
            />
          </div>
          {exemption && fields.tax_exempt_cert_id && (
            <Chip
              label={`Tax Exempt \u2014 Cert #${exemption.certificate_number}${exemption.expiry_date ? ` (exp ${new Date(exemption.expiry_date).toLocaleDateString('en-CA')})` : ''}`}
              size="small" color="success" variant="outlined"
              sx={{ mt: 0.5, fontSize: '11px' }}
            />
          )}
          {!exemption && fields.tax_exempt_cert_id && (
            <Chip
              label="No verified exemption cert on file \u2014 override requires manager"
              size="small" color="warning" variant="outlined"
              sx={{ mt: 0.5, fontSize: '11px' }}
            />
          )}
        </div>
      </div>

      {/* Row 4: Consolidated Invoice Group */}
      <div style={{ marginBottom: '14px' }}>
        <label style={labelStyle}>Consolidated Invoice Group</label>
        <input
          style={inputStyle}
          placeholder="e.g. PEEL-Q2-2026 \u2014 tag quotes for joint invoice"
          value={fields.consolidated_invoice_group || ''}
          onChange={(e) => setFields(f => ({ ...f, consolidated_invoice_group: e.target.value }))}
        />
      </div>

      {/* Credit status bar */}
      {creditStatus && (
        <div style={{ background: '#f0f9ff', border: '1px solid #bfdbfe', borderRadius: '8px', padding: '12px 16px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '6px', fontSize: '13px' }}>
            <span style={{ fontWeight: 600, color: '#1e40af' }}>Credit Status</span>
            {creditStatus.hasLimit ? (
              <span style={{ color: '#4b5563' }}>
                {formatCurrency(creditStatus.usedCents)} / {formatCurrency(creditStatus.limitCents)} used
              </span>
            ) : (
              <span style={{ color: '#9ca3af' }}>No credit limit set</span>
            )}
          </div>
          {creditStatus.hasLimit && (
            <>
              <LinearProgress
                variant="determinate"
                value={creditPct}
                sx={{ height: 8, borderRadius: 4, '& .MuiLinearProgress-bar': { backgroundColor: creditBarColor } }}
              />
              <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: '4px', fontSize: '12px', color: '#6b7280' }}>
                <span>Available: {formatCurrency(creditStatus.availableCents)}</span>
                <span>{creditStatus.utilizationPct}% utilized</span>
              </div>
              {quoteTotalCents > 0 && creditStatus.availableCents < quoteTotalCents && (
                <div style={{ marginTop: '8px', padding: '8px 12px', background: '#FFFBEB', border: '1px solid #FDE68A', borderRadius: '6px', fontSize: '12px', color: '#92400E' }}>
                  This quote exceeds available credit ({formatCurrency(creditStatus.availableCents)} available, {formatCurrency(quoteTotalCents)} quote total)
                </div>
              )}
            </>
          )}
        </div>
      )}
    </div>
  );
}
