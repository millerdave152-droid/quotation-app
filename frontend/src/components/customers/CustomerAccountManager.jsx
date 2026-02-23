import React, { useState, useEffect, useCallback } from 'react';
import { authFetch } from '../../services/authFetch';

const API = '/api/customer-accounts';

export default function CustomerAccountManager() {
  const [tab, setTab] = useState('list');
  const [accounts, setAccounts] = useState([]);
  const [selected, setSelected] = useState(null);
  const [statement, setStatement] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [form, setForm] = useState({ customerId: '', creditLimitCents: 500000, paymentTermsDays: 30 });
  const [txForm, setTxForm] = useState({ amountCents: '', description: '' });

  const fetchAccounts = useCallback(async () => {
    setLoading(true);
    try {
      const res = await authFetch(API);
      const data = await res.json();
      if (data.success) setAccounts(data.data?.accounts || []);
    } catch (e) { setError(e.message); }
    setLoading(false);
  }, []);

  useEffect(() => { fetchAccounts(); }, [fetchAccounts]);

  const loadAccount = async (id) => {
    try {
      const [accRes, stmtRes] = await Promise.all([
        authFetch(`${API}/${id}`),
        authFetch(`${API}/${id}/statement`)
      ]);
      const accData = await accRes.json();
      const stmtData = await stmtRes.json();
      if (accData.success) setSelected(accData.data);
      if (stmtData.success) setStatement(stmtData.data);
      setTab('detail');
    } catch (e) { setError(e.message); }
  };

  const openAccount = async () => {
    if (!form.customerId) return setError('Customer ID required');
    try {
      const res = await authFetch(API, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form)
      });
      const data = await res.json();
      if (data.success) { fetchAccounts(); setTab('list'); }
      else setError(data.error || 'Failed');
    } catch (e) { setError(e.message); }
  };

  const recordPayment = async () => {
    if (!selected || !txForm.amountCents) return;
    try {
      const res = await authFetch(`${API}/${selected.id}/payment`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ amountCents: parseInt(txForm.amountCents), description: txForm.description })
      });
      const data = await res.json();
      if (data.success) { setTxForm({ amountCents: '', description: '' }); loadAccount(selected.id); }
    } catch (e) { setError(e.message); }
  };

  return (
    <div style={{ padding: '24px', maxWidth: 1200 }}>
      <h2 style={{ marginBottom: 16 }}>Customer Accounts</h2>
      {error && <div style={{ background: '#fef2f2', color: '#dc2626', padding: 12, borderRadius: 8, marginBottom: 16 }}>{error} <button onClick={() => setError('')}>×</button></div>}

      <div style={{ display: 'flex', gap: 8, marginBottom: 24 }}>
        {['list', 'create', 'detail'].map(t => (
          <button key={t} onClick={() => (t !== 'detail' || selected) && setTab(t)}
            disabled={t === 'detail' && !selected}
            style={{ padding: '8px 16px', borderRadius: 8, border: 'none', cursor: (t === 'detail' && !selected) ? 'not-allowed' : 'pointer',
              background: tab === t ? '#2563eb' : '#f3f4f6', color: tab === t ? '#fff' : '#374151',
              opacity: (t === 'detail' && !selected) ? 0.5 : 1 }}>
            {t === 'list' ? 'All Accounts' : t === 'create' ? 'Open Account' : 'Account Detail'}
          </button>
        ))}
      </div>

      {tab === 'list' && (
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead><tr style={{ borderBottom: '2px solid #e5e7eb', textAlign: 'left' }}>
            <th style={{ padding: 8 }}>Customer</th><th style={{ padding: 8 }}>Status</th><th style={{ padding: 8, textAlign: 'right' }}>Credit Limit</th>
            <th style={{ padding: 8, textAlign: 'right' }}>Balance</th><th style={{ padding: 8, textAlign: 'right' }}>Available</th><th style={{ padding: 8 }}>Terms</th>
          </tr></thead>
          <tbody>
            {accounts.map(a => (
              <tr key={a.id} onClick={() => loadAccount(a.id)} style={{ borderBottom: '1px solid #f3f4f6', cursor: 'pointer' }}>
                <td style={{ padding: 8 }}>{a.customer_name}</td>
                <td style={{ padding: 8 }}><span style={{ padding: '2px 8px', borderRadius: 12, fontSize: 12, color: '#fff', background: a.status === 'active' ? '#10b981' : a.status === 'on_hold' ? '#f59e0b' : '#ef4444' }}>{a.status}</span></td>
                <td style={{ padding: 8, textAlign: 'right' }}>${(a.credit_limit_cents / 100).toFixed(2)}</td>
                <td style={{ padding: 8, textAlign: 'right', color: a.balance_cents > 0 ? '#dc2626' : '#10b981' }}>${(a.balance_cents / 100).toFixed(2)}</td>
                <td style={{ padding: 8, textAlign: 'right' }}>${(a.available_credit_cents / 100).toFixed(2)}</td>
                <td style={{ padding: 8 }}>Net {a.payment_terms_days}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      {tab === 'create' && (
        <div style={{ maxWidth: 400 }}>
          <h3>Open New Account</h3>
          <div style={{ marginBottom: 12 }}>
            <label style={{ display: 'block', marginBottom: 4 }}>Customer ID</label>
            <input type="number" value={form.customerId} onChange={e => setForm(p => ({ ...p, customerId: e.target.value }))}
              style={{ width: '100%', padding: 8, borderRadius: 8, border: '1px solid #d1d5db' }} />
          </div>
          <div style={{ marginBottom: 12 }}>
            <label style={{ display: 'block', marginBottom: 4 }}>Credit Limit (cents)</label>
            <input type="number" value={form.creditLimitCents} onChange={e => setForm(p => ({ ...p, creditLimitCents: parseInt(e.target.value) }))}
              style={{ width: '100%', padding: 8, borderRadius: 8, border: '1px solid #d1d5db' }} />
          </div>
          <div style={{ marginBottom: 12 }}>
            <label style={{ display: 'block', marginBottom: 4 }}>Payment Terms (days)</label>
            <input type="number" value={form.paymentTermsDays} onChange={e => setForm(p => ({ ...p, paymentTermsDays: parseInt(e.target.value) }))}
              style={{ width: '100%', padding: 8, borderRadius: 8, border: '1px solid #d1d5db' }} />
          </div>
          <button onClick={openAccount} style={{ padding: '10px 24px', borderRadius: 8, border: 'none', background: '#2563eb', color: '#fff', cursor: 'pointer' }}>Open Account</button>
        </div>
      )}

      {tab === 'detail' && selected && (
        <div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 12, marginBottom: 24 }}>
            <div style={{ padding: 16, background: '#f9fafb', borderRadius: 8, textAlign: 'center' }}>
              <div style={{ fontSize: 20, fontWeight: 700 }}>{selected.customer_name}</div>
              <div style={{ color: '#6b7280' }}>Customer</div>
            </div>
            <div style={{ padding: 16, background: '#f9fafb', borderRadius: 8, textAlign: 'center' }}>
              <div style={{ fontSize: 20, fontWeight: 700 }}>${(selected.credit_limit_cents / 100).toFixed(2)}</div>
              <div style={{ color: '#6b7280' }}>Credit Limit</div>
            </div>
            <div style={{ padding: 16, background: '#f9fafb', borderRadius: 8, textAlign: 'center' }}>
              <div style={{ fontSize: 20, fontWeight: 700, color: selected.balance_cents > 0 ? '#dc2626' : '#10b981' }}>${(selected.balance_cents / 100).toFixed(2)}</div>
              <div style={{ color: '#6b7280' }}>Balance</div>
            </div>
            <div style={{ padding: 16, background: '#f9fafb', borderRadius: 8, textAlign: 'center' }}>
              <div style={{ fontSize: 20, fontWeight: 700, color: '#10b981' }}>${(selected.available_credit_cents / 100).toFixed(2)}</div>
              <div style={{ color: '#6b7280' }}>Available</div>
            </div>
          </div>

          <div style={{ marginBottom: 16, padding: 16, background: '#f3f4f6', borderRadius: 8 }}>
            <h4 style={{ margin: '0 0 8px' }}>Record Payment</h4>
            <div style={{ display: 'flex', gap: 8 }}>
              <input type="number" value={txForm.amountCents} onChange={e => setTxForm(p => ({ ...p, amountCents: e.target.value }))}
                placeholder="Amount (cents)" style={{ flex: 1, padding: 8, borderRadius: 8, border: '1px solid #d1d5db' }} />
              <input value={txForm.description} onChange={e => setTxForm(p => ({ ...p, description: e.target.value }))}
                placeholder="Description" style={{ flex: 2, padding: 8, borderRadius: 8, border: '1px solid #d1d5db' }} />
              <button onClick={recordPayment} style={{ padding: '8px 16px', borderRadius: 8, border: 'none', background: '#10b981', color: '#fff', cursor: 'pointer' }}>Record</button>
            </div>
          </div>

          <h4>Transaction History</h4>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead><tr style={{ borderBottom: '2px solid #e5e7eb', textAlign: 'left' }}>
              <th style={{ padding: 8 }}>Date</th><th style={{ padding: 8 }}>Type</th><th style={{ padding: 8 }}>Description</th>
              <th style={{ padding: 8, textAlign: 'right' }}>Amount</th><th style={{ padding: 8, textAlign: 'right' }}>Balance After</th>
            </tr></thead>
            <tbody>
              {(statement?.transactions || []).map(t => (
                <tr key={t.id} style={{ borderBottom: '1px solid #f3f4f6' }}>
                  <td style={{ padding: 8 }}>{new Date(t.created_at).toLocaleDateString()}</td>
                  <td style={{ padding: 8 }}><span style={{ padding: '2px 8px', borderRadius: 12, fontSize: 12, background: t.type === 'payment' ? '#dcfce7' : '#fee2e2', color: t.type === 'payment' ? '#166534' : '#991b1b' }}>{t.type}</span></td>
                  <td style={{ padding: 8 }}>{t.description}</td>
                  <td style={{ padding: 8, textAlign: 'right' }}>${(t.amount_cents / 100).toFixed(2)}</td>
                  <td style={{ padding: 8, textAlign: 'right' }}>${(t.balance_after_cents / 100).toFixed(2)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
