/**
 * TeleTime - Chargeback Tracker
 * Kanban-style pipeline view with metrics dashboard, new entry form,
 * and drill-down to ChargebackDetail for lifecycle management.
 */

import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { authFetch } from '../../services/authFetch';
import ChargebackDetail from './ChargebackDetail';

const API_URL = process.env.REACT_APP_API_URL || '';

// ============================================================================
// CONSTANTS
// ============================================================================

const PIPELINE_COLUMNS = [
  { id: 'pre_alert', label: 'Pre-Alert', color: '#8b5cf6' },
  { id: 'received', label: 'Received', color: '#3b82f6' },
  { id: 'under_review', label: 'Under Review', color: '#f59e0b' },
  { id: 'evidence_submitted', label: 'Evidence Submitted', color: '#6366f1' },
  { id: 'won', label: 'Won', color: '#10b981' },
  { id: 'lost', label: 'Lost', color: '#ef4444' },
  { id: 'expired', label: 'Expired', color: '#6b7280' },
  { id: 'accepted', label: 'Accepted', color: '#9ca3af' },
];

const REASON_CODES = {
  Visa: [
    { code: '10.1', desc: 'EMV Liability Shift Counterfeit Fraud' },
    { code: '10.2', desc: 'EMV Liability Shift Non-Counterfeit Fraud' },
    { code: '10.3', desc: 'Other Fraud — Card-Present Environment' },
    { code: '10.4', desc: 'Other Fraud — Card-Absent Environment' },
    { code: '10.5', desc: 'Visa Fraud Monitoring Program' },
    { code: '11.1', desc: 'Card Recovery Bulletin' },
    { code: '11.2', desc: 'Declined Authorization' },
    { code: '11.3', desc: 'No Authorization' },
    { code: '12.1', desc: 'Late Presentment' },
    { code: '12.2', desc: 'Incorrect Transaction Code' },
    { code: '12.3', desc: 'Incorrect Currency' },
    { code: '12.4', desc: 'Incorrect Account Number' },
    { code: '12.5', desc: 'Incorrect Amount' },
    { code: '12.6', desc: 'Duplicate Processing / Paid by Other Means' },
    { code: '13.1', desc: 'Merchandise / Services Not Received' },
    { code: '13.2', desc: 'Cancelled Recurring Transaction' },
    { code: '13.3', desc: 'Not as Described or Defective' },
    { code: '13.4', desc: 'Counterfeit Merchandise' },
    { code: '13.5', desc: 'Misrepresentation' },
    { code: '13.6', desc: 'Credit Not Processed' },
    { code: '13.7', desc: 'Cancelled Merchandise / Services' },
  ],
  Mastercard: [
    { code: '4834', desc: 'Point-of-Interaction Error' },
    { code: '4837', desc: 'No Cardholder Authorization' },
    { code: '4840', desc: 'Fraudulent Processing of Transactions' },
    { code: '4853', desc: 'Cardholder Dispute — Defective/Not as Described' },
    { code: '4855', desc: 'Goods or Services Not Provided' },
    { code: '4859', desc: 'Services Not Rendered' },
    { code: '4860', desc: 'Credit Not Processed' },
    { code: '4863', desc: 'Cardholder Does Not Recognize' },
    { code: '4871', desc: 'Chip/PIN Liability Shift' },
  ],
  Amex: [
    { code: 'A01', desc: 'Charge Amount Exceeds Authorization Amount' },
    { code: 'A02', desc: 'No Valid Authorization' },
    { code: 'A08', desc: 'Authorization Approval Expired' },
    { code: 'C02', desc: 'Credit Not Processed' },
    { code: 'C04', desc: 'Goods/Services Return or Refused' },
    { code: 'C05', desc: 'Goods/Services Cancelled' },
    { code: 'C08', desc: 'Goods/Services Not Received or Only Partially Received' },
    { code: 'C14', desc: 'Paid by Other Means' },
    { code: 'C18', desc: 'Request for Paper Copy' },
    { code: 'C28', desc: 'Cancelled Recurring Billing' },
    { code: 'C31', desc: 'Goods/Services Not as Described' },
    { code: 'C32', desc: 'Goods/Services Damaged or Defective' },
    { code: 'F10', desc: 'Missing Imprint' },
    { code: 'F14', desc: 'Missing Signature' },
    { code: 'F24', desc: 'No Cardholder Authorization' },
    { code: 'F29', desc: 'Card Not Present' },
    { code: 'FR2', desc: 'Fraud Full Recourse Program' },
    { code: 'FR4', desc: 'Immediate Chargeback Program' },
    { code: 'FR6', desc: 'Partial Immediate Chargeback' },
  ],
};

const DEADLINE_DAYS = { Visa: 30, Mastercard: 30, Amex: 20 };

const formatCurrency = (val) => {
  const num = parseFloat(val) || 0;
  return `$${num.toLocaleString('en-CA', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
};

const formatDate = (d) => {
  if (!d) return '-';
  return new Date(d).toLocaleDateString('en-CA', { month: 'short', day: 'numeric', year: 'numeric' });
};

const getDeadlineUrgency = (deadline) => {
  if (!deadline) return { color: '#9ca3af', label: 'No deadline', days: null };
  const days = Math.ceil((new Date(deadline) - new Date()) / 86400000);
  if (days < 0) return { color: '#111827', label: `${Math.abs(days)}d overdue`, days };
  if (days < 7) return { color: '#ef4444', label: `${days}d left`, days };
  if (days <= 15) return { color: '#f59e0b', label: `${days}d left`, days };
  return { color: '#10b981', label: `${days}d left`, days };
};

// ============================================================================
// METRICS ROW
// ============================================================================

function MetricsRow({ metrics }) {
  if (!metrics) return null;

  const cards = [
    { label: 'This Month', value: metrics.this_month?.total || 0, sub: `${metrics.this_month?.pending || 0} pending`, color: '#3b82f6' },
    { label: 'This Quarter', value: metrics.this_quarter?.total || 0, color: '#6366f1' },
    { label: 'This Year', value: metrics.this_year?.total || 0, color: '#111827' },
    { label: 'CB Rate', value: `${metrics.chargeback_rate || 0}%`, sub: 'of transactions', color: metrics.chargeback_rate > 1 ? '#ef4444' : '#10b981' },
    { label: 'Win Rate', value: `${metrics.win_rate || 0}%`, color: metrics.win_rate >= 50 ? '#10b981' : '#ef4444' },
    { label: 'Avg Response', value: metrics.avg_response_days ? `${metrics.avg_response_days}d` : 'N/A', color: '#6b7280' },
    { label: 'In Dispute', value: formatCurrency(metrics.amounts?.total_dispute), color: '#f59e0b' },
    { label: 'Won Back', value: formatCurrency(metrics.amounts?.won_back), color: '#10b981' },
    { label: 'Lost', value: formatCurrency(metrics.amounts?.lost_amount), color: '#ef4444' },
  ];

  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(9, 1fr)', gap: '10px', marginBottom: '20px' }}>
      {cards.map(c => (
        <div key={c.label} style={{
          background: 'white', borderRadius: '10px', padding: '14px 12px',
          border: '1px solid #e5e7eb', textAlign: 'center',
        }}>
          <p style={{ margin: '0 0 4px', fontSize: '11px', color: '#6b7280', fontWeight: 500, textTransform: 'uppercase', letterSpacing: '0.5px' }}>{c.label}</p>
          <p style={{ margin: 0, fontSize: '20px', fontWeight: 700, color: c.color }}>{c.value}</p>
          {c.sub && <p style={{ margin: '2px 0 0', fontSize: '11px', color: '#9ca3af' }}>{c.sub}</p>}
        </div>
      ))}
    </div>
  );
}

// ============================================================================
// STATUS CHANGE MODAL
// ============================================================================

function StatusChangeModal({ chargeback, targetStatus, onConfirm, onCancel }) {
  const [notes, setNotes] = useState('');
  const column = PIPELINE_COLUMNS.find(c => c.id === targetStatus);

  return (
    <div style={{
      position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
      background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center',
      justifyContent: 'center', zIndex: 9999,
    }} onClick={onCancel}>
      <div style={{
        background: 'white', borderRadius: '12px', padding: '28px', width: '440px',
        boxShadow: '0 20px 60px rgba(0,0,0,0.3)',
      }} onClick={e => e.stopPropagation()}>
        <h3 style={{ margin: '0 0 16px', fontSize: '18px', fontWeight: 600 }}>Change Status</h3>
        <p style={{ margin: '0 0 16px', fontSize: '14px', color: '#6b7280' }}>
          Move <strong>#{chargeback.case_number || chargeback.id}</strong> ({formatCurrency(chargeback.amount)}) to{' '}
          <span style={{ color: column?.color, fontWeight: 600 }}>{column?.label}</span>?
        </p>
        <textarea
          value={notes}
          onChange={e => setNotes(e.target.value)}
          placeholder="Optional notes..."
          rows={3}
          style={{
            width: '100%', padding: '10px', border: '1px solid #d1d5db', borderRadius: '8px',
            fontSize: '14px', resize: 'vertical', marginBottom: '16px', boxSizing: 'border-box',
          }}
        />
        <div style={{ display: 'flex', gap: '10px', justifyContent: 'flex-end' }}>
          <button onClick={onCancel} style={{
            padding: '8px 18px', border: '1px solid #d1d5db', borderRadius: '6px',
            background: 'white', color: '#374151', cursor: 'pointer', fontWeight: 500,
          }}>Cancel</button>
          <button onClick={() => onConfirm(notes)} style={{
            padding: '8px 18px', border: 'none', borderRadius: '6px',
            background: column?.color || '#667eea', color: 'white', cursor: 'pointer', fontWeight: 500,
          }}>Confirm</button>
        </div>
      </div>
    </div>
  );
}

// ============================================================================
// NEW CHARGEBACK FORM
// ============================================================================

function NewChargebackForm({ onCreated, onCancel }) {
  const [step, setStep] = useState('search'); // search | form
  const [searchType, setSearchType] = useState('transaction_id');
  const [searchValue, setSearchValue] = useState('');
  const [searchDate, setSearchDate] = useState('');
  const [searchAmount, setSearchAmount] = useState('');
  const [searchResults, setSearchResults] = useState([]);
  const [searching, setSearching] = useState(false);
  const [selectedTxn, setSelectedTxn] = useState(null);
  const [form, setForm] = useState({
    card_brand: '', reason_code: '', amount: '', received_at: new Date().toISOString().slice(0, 10),
    case_number: '', notes: '', assigned_to: '',
  });
  const [saving, setSaving] = useState(false);

  const handleSearch = async () => {
    setSearching(true);
    try {
      const params = new URLSearchParams();
      if (searchType === 'transaction_id') params.set('transaction_id', searchValue);
      else if (searchType === 'date_amount') {
        params.set('date', searchDate);
        params.set('amount', searchAmount);
      } else if (searchType === 'last_four') params.set('last_four', searchValue);

      const resp = await authFetch(`${API_URL}/api/chargebacks/search-transactions?${params}`);
      const json = await resp.json();
      setSearchResults(json.data || []);
    } catch { /* ignore */ }
    setSearching(false);
  };

  const selectTransaction = (txn) => {
    setSelectedTxn(txn);
    setForm(prev => ({
      ...prev,
      amount: txn.payment_amount || txn.total_amount || '',
      card_brand: txn.card_brand || '',
    }));
    setStep('form');
  };

  const reasonCodes = useMemo(() => {
    return REASON_CODES[form.card_brand] || [];
  }, [form.card_brand]);

  const responseDeadline = useMemo(() => {
    if (!form.received_at || !form.card_brand) return '';
    const days = DEADLINE_DAYS[form.card_brand] || 30;
    const d = new Date(form.received_at);
    d.setDate(d.getDate() + days);
    return d.toISOString().slice(0, 10);
  }, [form.received_at, form.card_brand]);

  const handleSubmit = async () => {
    if (!selectedTxn || !form.amount) return;
    setSaving(true);
    try {
      const body = {
        transaction_id: selectedTxn.transaction_id,
        payment_id: selectedTxn.payment_id,
        amount: parseFloat(form.amount),
        card_brand: form.card_brand || null,
        reason_code: form.reason_code || null,
        reason_description: reasonCodes.find(r => r.code === form.reason_code)?.desc || null,
        received_at: form.received_at ? new Date(form.received_at).toISOString() : null,
        response_deadline: responseDeadline ? new Date(responseDeadline).toISOString() : null,
        case_number: form.case_number || null,
        notes: form.notes || null,
        customer_id: selectedTxn.customer_id || null,
      };
      const resp = await authFetch(`${API_URL}/api/chargebacks`, {
        method: 'POST',
        body: JSON.stringify(body),
      });
      const json = await resp.json();
      if (json.success) onCreated(json.data);
    } catch { /* ignore */ }
    setSaving(false);
  };

  const inputStyle = {
    width: '100%', padding: '8px 12px', border: '1px solid #d1d5db', borderRadius: '6px',
    fontSize: '14px', boxSizing: 'border-box',
  };
  const labelStyle = { display: 'block', fontSize: '13px', fontWeight: 500, color: '#374151', marginBottom: '4px' };

  return (
    <div style={{
      position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
      background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center',
      justifyContent: 'center', zIndex: 9999, overflow: 'auto',
    }} onClick={onCancel}>
      <div style={{
        background: 'white', borderRadius: '12px', padding: '28px', width: '600px',
        maxHeight: '90vh', overflow: 'auto', boxShadow: '0 20px 60px rgba(0,0,0,0.3)',
      }} onClick={e => e.stopPropagation()}>
        <h3 style={{ margin: '0 0 20px', fontSize: '20px', fontWeight: 600 }}>
          {step === 'search' ? 'Find Original Transaction' : 'New Chargeback'}
        </h3>

        {step === 'search' && (
          <>
            {/* Search type selector */}
            <div style={{ display: 'flex', gap: '8px', marginBottom: '16px' }}>
              {[
                { id: 'transaction_id', label: 'Transaction ID' },
                { id: 'date_amount', label: 'Date + Amount' },
                { id: 'last_four', label: 'Last 4 Digits' },
              ].map(t => (
                <button key={t.id} onClick={() => setSearchType(t.id)} style={{
                  padding: '6px 14px', borderRadius: '6px', fontSize: '13px', fontWeight: 500,
                  border: '1px solid', cursor: 'pointer',
                  borderColor: searchType === t.id ? '#667eea' : '#d1d5db',
                  background: searchType === t.id ? '#667eea' : 'white',
                  color: searchType === t.id ? 'white' : '#374151',
                }}>{t.label}</button>
              ))}
            </div>

            {/* Search inputs */}
            <div style={{ display: 'flex', gap: '10px', marginBottom: '16px' }}>
              {searchType === 'date_amount' ? (
                <>
                  <input type="date" value={searchDate} onChange={e => setSearchDate(e.target.value)} style={{ ...inputStyle, flex: 1 }} />
                  <input type="number" step="0.01" value={searchAmount} onChange={e => setSearchAmount(e.target.value)} placeholder="Amount" style={{ ...inputStyle, flex: 1 }} />
                </>
              ) : (
                <input
                  value={searchValue}
                  onChange={e => setSearchValue(e.target.value)}
                  placeholder={searchType === 'transaction_id' ? 'Enter transaction ID' : 'Enter last 4 digits'}
                  style={{ ...inputStyle, flex: 1 }}
                  onKeyDown={e => e.key === 'Enter' && handleSearch()}
                />
              )}
              <button onClick={handleSearch} disabled={searching} style={{
                padding: '8px 18px', background: '#667eea', color: 'white', border: 'none',
                borderRadius: '6px', cursor: 'pointer', fontWeight: 500, whiteSpace: 'nowrap',
              }}>{searching ? 'Searching...' : 'Search'}</button>
            </div>

            {/* Search results */}
            {searchResults.length > 0 && (
              <div style={{ maxHeight: '300px', overflow: 'auto', border: '1px solid #e5e7eb', borderRadius: '8px' }}>
                {searchResults.map((txn, i) => (
                  <div key={i} onClick={() => selectTransaction(txn)} style={{
                    padding: '12px 16px', cursor: 'pointer', borderBottom: '1px solid #f3f4f6',
                    display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                    transition: 'background 0.1s',
                  }}
                    onMouseEnter={e => { e.currentTarget.style.background = '#f0f4ff'; }}
                    onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; }}
                  >
                    <div>
                      <p style={{ margin: '0 0 2px', fontWeight: 600, fontSize: '14px' }}>
                        #{txn.transaction_number || txn.transaction_id}
                      </p>
                      <p style={{ margin: 0, fontSize: '12px', color: '#6b7280' }}>
                        {txn.customer_name || 'No customer'} &bull; {formatDate(txn.created_at)}
                        {txn.card_last_four ? ` \u2022 ****${txn.card_last_four}` : ''}
                      </p>
                    </div>
                    <div style={{ textAlign: 'right' }}>
                      <p style={{ margin: '0 0 2px', fontWeight: 600, fontSize: '14px' }}>{formatCurrency(txn.total_amount)}</p>
                      <p style={{ margin: 0, fontSize: '12px', color: '#6b7280' }}>{txn.card_brand || txn.payment_method}</p>
                    </div>
                  </div>
                ))}
              </div>
            )}
            {searchResults.length === 0 && !searching && searchValue && (
              <p style={{ color: '#9ca3af', fontSize: '14px', textAlign: 'center', padding: '20px 0' }}>No transactions found</p>
            )}

            <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: '16px' }}>
              <button onClick={onCancel} style={{
                padding: '8px 18px', border: '1px solid #d1d5db', borderRadius: '6px',
                background: 'white', color: '#374151', cursor: 'pointer', fontWeight: 500,
              }}>Cancel</button>
            </div>
          </>
        )}

        {step === 'form' && selectedTxn && (
          <>
            {/* Selected transaction summary */}
            <div style={{
              background: '#f0f4ff', borderRadius: '8px', padding: '12px 16px',
              marginBottom: '20px', border: '1px solid #c7d2fe',
            }}>
              <p style={{ margin: '0 0 4px', fontSize: '14px', fontWeight: 600 }}>
                Transaction #{selectedTxn.transaction_number || selectedTxn.transaction_id}
              </p>
              <p style={{ margin: 0, fontSize: '13px', color: '#4b5563' }}>
                {formatCurrency(selectedTxn.total_amount)} &bull; {selectedTxn.customer_name || 'No customer'}
                {selectedTxn.card_last_four ? ` \u2022 ****${selectedTxn.card_last_four}` : ''}
                {selectedTxn.authorization_code ? ` \u2022 Auth: ${selectedTxn.authorization_code}` : ''}
              </p>
            </div>

            {/* Form fields */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '14px', marginBottom: '16px' }}>
              <div>
                <label style={labelStyle}>Card Brand *</label>
                <select value={form.card_brand} onChange={e => setForm({ ...form, card_brand: e.target.value, reason_code: '' })} style={inputStyle}>
                  <option value="">Select brand</option>
                  <option value="Visa">Visa</option>
                  <option value="Mastercard">Mastercard</option>
                  <option value="Amex">Amex</option>
                </select>
              </div>
              <div>
                <label style={labelStyle}>Dispute Amount ($)</label>
                <input type="number" step="0.01" value={form.amount} onChange={e => setForm({ ...form, amount: e.target.value })} style={inputStyle} />
              </div>
              <div style={{ gridColumn: '1 / -1' }}>
                <label style={labelStyle}>Reason Code</label>
                <select value={form.reason_code} onChange={e => setForm({ ...form, reason_code: e.target.value })} style={inputStyle} disabled={!form.card_brand}>
                  <option value="">Select reason code</option>
                  {reasonCodes.map(r => (
                    <option key={r.code} value={r.code}>{r.code} — {r.desc}</option>
                  ))}
                </select>
              </div>
              <div>
                <label style={labelStyle}>Received Date</label>
                <input type="date" value={form.received_at} onChange={e => setForm({ ...form, received_at: e.target.value })} style={inputStyle} />
              </div>
              <div>
                <label style={labelStyle}>Response Deadline (auto)</label>
                <input type="date" value={responseDeadline} readOnly style={{ ...inputStyle, background: '#f3f4f6' }} />
                {form.card_brand && <p style={{ margin: '2px 0 0', fontSize: '11px', color: '#9ca3af' }}>{DEADLINE_DAYS[form.card_brand] || 30} days from received date</p>}
              </div>
              <div>
                <label style={labelStyle}>Case Number</label>
                <input value={form.case_number} onChange={e => setForm({ ...form, case_number: e.target.value })} placeholder="Optional" style={inputStyle} />
              </div>
            </div>

            <div style={{ marginBottom: '16px' }}>
              <label style={labelStyle}>Notes</label>
              <textarea value={form.notes} onChange={e => setForm({ ...form, notes: e.target.value })} rows={3} placeholder="Internal notes..." style={{ ...inputStyle, resize: 'vertical' }} />
            </div>

            <div style={{ display: 'flex', gap: '10px', justifyContent: 'flex-end' }}>
              <button onClick={() => setStep('search')} style={{
                padding: '8px 18px', border: '1px solid #d1d5db', borderRadius: '6px',
                background: 'white', color: '#374151', cursor: 'pointer', fontWeight: 500,
              }}>Back</button>
              <button onClick={handleSubmit} disabled={saving || !form.amount} style={{
                padding: '8px 18px', border: 'none', borderRadius: '6px',
                background: saving ? '#d1d5db' : '#667eea', color: 'white',
                cursor: saving ? 'default' : 'pointer', fontWeight: 500,
              }}>{saving ? 'Creating...' : 'Create Chargeback'}</button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

// ============================================================================
// PIPELINE CARD
// ============================================================================

function PipelineCard({ cb, onClick, onStatusChange }) {
  const urgency = getDeadlineUrgency(cb.response_deadline);

  return (
    <div onClick={() => onClick(cb)} style={{
      background: 'white', borderRadius: '8px', padding: '12px',
      border: '1px solid #e5e7eb', cursor: 'pointer',
      boxShadow: '0 1px 3px rgba(0,0,0,0.06)',
      transition: 'box-shadow 0.15s, transform 0.1s',
    }}
      onMouseEnter={e => { e.currentTarget.style.boxShadow = '0 4px 12px rgba(0,0,0,0.12)'; e.currentTarget.style.transform = 'translateY(-1px)'; }}
      onMouseLeave={e => { e.currentTarget.style.boxShadow = '0 1px 3px rgba(0,0,0,0.06)'; e.currentTarget.style.transform = 'translateY(0)'; }}
    >
      {/* Amount + Brand */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '8px' }}>
        <span style={{ fontSize: '16px', fontWeight: 700, color: '#111827' }}>{formatCurrency(cb.amount)}</span>
        {cb.card_brand && (
          <span style={{
            fontSize: '11px', fontWeight: 600, padding: '2px 8px', borderRadius: '4px',
            background: cb.card_brand === 'Visa' ? '#e0e7ff' : cb.card_brand === 'Mastercard' ? '#fef3c7' : '#fce7f3',
            color: cb.card_brand === 'Visa' ? '#3730a3' : cb.card_brand === 'Mastercard' ? '#92400e' : '#9d174d',
          }}>{cb.card_brand}</span>
        )}
      </div>

      {/* Reason code */}
      {cb.reason_code && (
        <p style={{ margin: '0 0 4px', fontSize: '12px', fontWeight: 600, color: '#4b5563' }}>
          {cb.reason_code}
        </p>
      )}
      {cb.reason_description && (
        <p style={{ margin: '0 0 8px', fontSize: '11px', color: '#6b7280', lineHeight: '1.3' }}>
          {cb.reason_description.length > 60 ? cb.reason_description.substring(0, 60) + '...' : cb.reason_description}
        </p>
      )}

      {/* Meta */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '11px', color: '#9ca3af' }}>
        <span>#{cb.case_number || cb.id}</span>
        <span>{formatDate(cb.received_at || cb.created_at)}</span>
      </div>

      {/* Deadline + Assigned */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '6px' }}>
        {cb.response_deadline && (
          <span style={{
            fontSize: '11px', fontWeight: 700, color: urgency.color,
            padding: '2px 6px', borderRadius: '4px',
            background: urgency.days !== null && urgency.days < 7 ? '#fef2f2' : 'transparent',
          }}>{urgency.label}</span>
        )}
        {cb.assigned_name && (
          <span style={{ fontSize: '11px', color: '#6b7280' }}>{cb.assigned_name.split(' ')[0]}</span>
        )}
      </div>

      {/* Quick status change buttons (for active statuses) */}
      {['received', 'under_review', 'evidence_submitted'].includes(cb.status) && (
        <div style={{ display: 'flex', gap: '4px', marginTop: '8px', flexWrap: 'wrap' }} onClick={e => e.stopPropagation()}>
          {cb.status === 'received' && (
            <button onClick={() => onStatusChange(cb, 'under_review')} style={quickBtn('#f59e0b')}>Review</button>
          )}
          {cb.status === 'under_review' && (
            <button onClick={() => onStatusChange(cb, 'evidence_submitted')} style={quickBtn('#6366f1')}>Submit Evidence</button>
          )}
          {cb.status === 'evidence_submitted' && (
            <>
              <button onClick={() => onStatusChange(cb, 'won')} style={quickBtn('#10b981')}>Won</button>
              <button onClick={() => onStatusChange(cb, 'lost')} style={quickBtn('#ef4444')}>Lost</button>
            </>
          )}
        </div>
      )}
    </div>
  );
}

const quickBtn = (color) => ({
  padding: '3px 8px', fontSize: '10px', fontWeight: 600, borderRadius: '4px',
  border: 'none', background: color, color: 'white', cursor: 'pointer',
});

// ============================================================================
// PIPELINE COLUMN
// ============================================================================

function PipelineColumn({ column, cases, onCardClick, onStatusChange }) {
  return (
    <div style={{
      minWidth: '220px', maxWidth: '260px', flex: '1 1 220px',
      display: 'flex', flexDirection: 'column',
    }}>
      {/* Column header */}
      <div style={{
        display: 'flex', alignItems: 'center', gap: '8px',
        marginBottom: '10px', padding: '0 4px',
      }}>
        <div style={{ width: '10px', height: '10px', borderRadius: '50%', background: column.color }} />
        <span style={{ fontSize: '13px', fontWeight: 600, color: '#374151' }}>{column.label}</span>
        <span style={{
          fontSize: '11px', fontWeight: 600, color: '#6b7280',
          background: '#f3f4f6', borderRadius: '10px', padding: '1px 8px',
        }}>{cases.length}</span>
      </div>

      {/* Cards */}
      <div style={{
        flex: 1, display: 'flex', flexDirection: 'column', gap: '8px',
        background: '#f9fafb', borderRadius: '8px', padding: '8px',
        minHeight: '100px', maxHeight: '600px', overflowY: 'auto',
      }}>
        {cases.length === 0 ? (
          <p style={{ color: '#d1d5db', fontSize: '12px', textAlign: 'center', padding: '20px 0' }}>None</p>
        ) : (
          cases.map(cb => (
            <PipelineCard key={cb.id} cb={cb} onClick={onCardClick} onStatusChange={onStatusChange} />
          ))
        )}
      </div>
    </div>
  );
}

// ============================================================================
// MAIN COMPONENT
// ============================================================================

export default function ChargebackTracker() {
  const [cases, setCases] = useState([]);
  const [metrics, setMetrics] = useState(null);
  const [loading, setLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);
  const [selectedCase, setSelectedCase] = useState(null);
  const [statusModal, setStatusModal] = useState(null); // { chargeback, targetStatus }
  const [view, setView] = useState('pipeline'); // pipeline | list

  // ---- Fetch data ----
  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const [casesResp, metricsResp] = await Promise.all([
        authFetch(`${API_URL}/api/chargebacks?limit=200`),
        authFetch(`${API_URL}/api/chargebacks/analytics`),
      ]);
      const casesJson = await casesResp.json();
      const metricsJson = await metricsResp.json();

      if (casesJson.success) setCases(casesJson.data || []);
      if (metricsJson.success) setMetrics(metricsJson.data);
    } catch { /* ignore */ }
    setLoading(false);
  }, []);

  useEffect(() => { fetchData(); }, [fetchData]);

  // ---- Group cases by status for pipeline ----
  const groupedCases = useMemo(() => {
    const groups = {};
    PIPELINE_COLUMNS.forEach(col => { groups[col.id] = []; });
    cases.forEach(cb => {
      const status = cb.status || 'received';
      if (groups[status]) groups[status].push(cb);
      else groups.received.push(cb);
    });
    return groups;
  }, [cases]);

  // ---- Status change handler ----
  const handleStatusChangeRequest = (cb, targetStatus) => {
    setStatusModal({ chargeback: cb, targetStatus });
  };

  const confirmStatusChange = async (notes) => {
    if (!statusModal) return;
    const { chargeback, targetStatus } = statusModal;
    try {
      await authFetch(`${API_URL}/api/chargebacks/${chargeback.id}`, {
        method: 'PUT',
        body: JSON.stringify({ status: targetStatus, status_notes: notes || undefined }),
      });
      setStatusModal(null);
      fetchData();
    } catch { /* ignore */ }
  };

  // ---- Card click → detail view ----
  const handleCardClick = (cb) => {
    setSelectedCase(cb);
  };

  // ---- New chargeback created ----
  const handleCreated = () => {
    setShowCreate(false);
    fetchData();
  };

  // ---- Detail view ----
  if (selectedCase) {
    return (
      <ChargebackDetail
        chargebackId={selectedCase.id}
        onBack={() => { setSelectedCase(null); fetchData(); }}
        onStatusChange={(id, newStatus) => {
          handleStatusChangeRequest({ ...selectedCase, id }, newStatus);
        }}
      />
    );
  }

  return (
    <div>
      {/* ---- METRICS ---- */}
      <MetricsRow metrics={metrics} />

      {/* ---- TOOLBAR ---- */}
      <div style={{
        display: 'flex', justifyContent: 'space-between', alignItems: 'center',
        marginBottom: '16px',
      }}>
        <div style={{ display: 'flex', gap: '6px' }}>
          <button onClick={() => setView('pipeline')} style={{
            padding: '6px 14px', borderRadius: '6px', fontSize: '13px', fontWeight: 500,
            border: '1px solid', cursor: 'pointer',
            borderColor: view === 'pipeline' ? '#667eea' : '#d1d5db',
            background: view === 'pipeline' ? '#667eea' : 'white',
            color: view === 'pipeline' ? 'white' : '#374151',
          }}>Pipeline</button>
          <button onClick={() => setView('list')} style={{
            padding: '6px 14px', borderRadius: '6px', fontSize: '13px', fontWeight: 500,
            border: '1px solid', cursor: 'pointer',
            borderColor: view === 'list' ? '#667eea' : '#d1d5db',
            background: view === 'list' ? '#667eea' : 'white',
            color: view === 'list' ? 'white' : '#374151',
          }}>List</button>
        </div>
        <button onClick={() => setShowCreate(true)} style={{
          padding: '8px 18px', background: '#667eea', color: 'white', border: 'none',
          borderRadius: '6px', cursor: 'pointer', fontWeight: 500, fontSize: '13px',
        }}>+ New Chargeback</button>
      </div>

      {loading ? (
        <div style={{ display: 'flex', justifyContent: 'center', padding: '60px 0' }}>
          <div style={{
            width: '40px', height: '40px', border: '3px solid #e5e7eb',
            borderTopColor: '#667eea', borderRadius: '50%',
            animation: 'cbspin 0.8s linear infinite',
          }} />
          <style>{`@keyframes cbspin { to { transform: rotate(360deg); } }`}</style>
        </div>
      ) : view === 'pipeline' ? (
        /* ---- PIPELINE VIEW ---- */
        <div style={{
          display: 'flex', gap: '12px', overflowX: 'auto',
          paddingBottom: '16px',
        }}>
          {PIPELINE_COLUMNS.map(col => (
            <PipelineColumn
              key={col.id}
              column={col}
              cases={groupedCases[col.id] || []}
              onCardClick={handleCardClick}
              onStatusChange={handleStatusChangeRequest}
            />
          ))}
        </div>
      ) : (
        /* ---- LIST VIEW ---- */
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px' }}>
            <thead>
              <tr style={{ borderBottom: '2px solid #e5e7eb' }}>
                {['Case #', 'Amount', 'Brand', 'Reason', 'Customer', 'Received', 'Deadline', 'Status', 'Assigned'].map(h => (
                  <th key={h} style={{ padding: '10px 12px', textAlign: 'left', color: '#6b7280', fontWeight: 600 }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {cases.map(cb => {
                const urgency = getDeadlineUrgency(cb.response_deadline);
                const col = PIPELINE_COLUMNS.find(c => c.id === cb.status);
                return (
                  <tr key={cb.id} onClick={() => handleCardClick(cb)} style={{
                    borderBottom: '1px solid #f3f4f6', cursor: 'pointer',
                    transition: 'background 0.1s',
                  }}
                    onMouseEnter={e => { e.currentTarget.style.background = '#f8fafc'; }}
                    onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; }}
                  >
                    <td style={{ padding: '10px 12px', fontWeight: 500 }}>#{cb.case_number || cb.id}</td>
                    <td style={{ padding: '10px 12px', fontWeight: 600 }}>{formatCurrency(cb.amount)}</td>
                    <td style={{ padding: '10px 12px' }}>{cb.card_brand || '-'}</td>
                    <td style={{ padding: '10px 12px' }}>
                      {cb.reason_code && <span style={{ fontWeight: 500 }}>{cb.reason_code}</span>}
                      {cb.reason_description && <span style={{ color: '#6b7280', marginLeft: '4px', fontSize: '12px' }}>{cb.reason_description.substring(0, 40)}</span>}
                    </td>
                    <td style={{ padding: '10px 12px' }}>{cb.customer_name || '-'}</td>
                    <td style={{ padding: '10px 12px', fontSize: '12px' }}>{formatDate(cb.received_at || cb.created_at)}</td>
                    <td style={{ padding: '10px 12px', fontWeight: 600, color: urgency.color }}>{urgency.label}</td>
                    <td style={{ padding: '10px 12px' }}>
                      <span style={{
                        display: 'inline-block', padding: '2px 10px', borderRadius: '12px',
                        fontSize: '11px', fontWeight: 600,
                        background: col ? `${col.color}18` : '#f3f4f6',
                        color: col?.color || '#6b7280',
                      }}>{col?.label || cb.status}</span>
                    </td>
                    <td style={{ padding: '10px 12px', fontSize: '12px' }}>{cb.assigned_name || '-'}</td>
                  </tr>
                );
              })}
              {cases.length === 0 && (
                <tr><td colSpan={9} style={{ padding: '30px', textAlign: 'center', color: '#9ca3af' }}>No chargebacks found</td></tr>
              )}
            </tbody>
          </table>
        </div>
      )}

      {/* ---- MODALS ---- */}
      {showCreate && (
        <NewChargebackForm onCreated={handleCreated} onCancel={() => setShowCreate(false)} />
      )}
      {statusModal && (
        <StatusChangeModal
          chargeback={statusModal.chargeback}
          targetStatus={statusModal.targetStatus}
          onConfirm={confirmStatusChange}
          onCancel={() => setStatusModal(null)}
        />
      )}
    </div>
  );
}
