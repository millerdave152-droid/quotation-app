import React, { useState, useEffect, useCallback } from 'react';
import { authFetch } from '../../services/authFetch';

const API = '/api/customer-accounts';

const thStyle = {
  padding: '12px 16px',
  fontSize: 11,
  fontWeight: 700,
  textTransform: 'uppercase',
  letterSpacing: '0.05em',
  color: '#6b7280',
  borderBottom: '2px solid #e5e7eb',
  textAlign: 'left'
};

const tdStyle = {
  padding: '12px 16px',
  fontSize: 14,
  color: '#374151',
  borderBottom: '1px solid #f3f4f6'
};

const labelStyle = {
  display: 'block',
  marginBottom: 6,
  fontSize: 13,
  fontWeight: 600,
  color: '#374151'
};

const inputStyle = {
  width: '100%',
  padding: '10px 12px',
  borderRadius: 8,
  border: '1px solid #d1d5db',
  fontSize: 14,
  outline: 'none',
  transition: 'border-color 0.2s',
  boxSizing: 'border-box'
};

const cardStyle = {
  background: '#fff',
  borderRadius: 12,
  boxShadow: '0 1px 3px rgba(0,0,0,0.1), 0 1px 2px rgba(0,0,0,0.06)',
  overflow: 'hidden'
};

const tabs = [
  { key: 'list', label: 'All Accounts' },
  { key: 'create', label: 'Open Account' },
  { key: 'detail', label: 'Account Detail' }
];

const statCardAccents = ['#10b981', '#3b82f6', '#ef4444', '#10b981'];

function SkeletonRow() {
  return (
    <tr>
      {[1, 2, 3, 4, 5, 6].map(i => (
        <td key={i} style={tdStyle}>
          <div style={{
            height: 16,
            borderRadius: 4,
            background: 'linear-gradient(90deg, #f3f4f6 25%, #e5e7eb 50%, #f3f4f6 75%)',
            backgroundSize: '200% 100%',
            animation: 'pulse 1.5s ease-in-out infinite',
            width: i === 1 ? '70%' : i === 2 ? '50%' : '60%'
          }} />
        </td>
      ))}
    </tr>
  );
}

export default function CustomerAccountManager() {
  const [tab, setTab] = useState('list');
  const [accounts, setAccounts] = useState([]);
  const [selected, setSelected] = useState(null);
  const [statement, setStatement] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [form, setForm] = useState({ customerId: '', creditLimitCents: 500000, paymentTermsDays: 30 });
  const [txForm, setTxForm] = useState({ amountCents: '', description: '' });
  const [hoveredRow, setHoveredRow] = useState(null);

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
      <style>{`
        @keyframes pulse {
          0%, 100% { background-position: 200% 0; }
          50% { background-position: -200% 0; }
        }
      `}</style>

      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 16, marginBottom: 8 }}>
        <div style={{
          width: 48, height: 48, borderRadius: 12,
          background: 'linear-gradient(135deg, #10b981, #059669)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          boxShadow: '0 4px 12px rgba(16, 185, 129, 0.3)'
        }}>
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <line x1="12" y1="1" x2="12" y2="23" />
            <path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6" />
          </svg>
        </div>
        <div>
          <h2 style={{ margin: 0, fontSize: 24, fontWeight: 700, color: '#111827' }}>Customer Accounts</h2>
          <p style={{ margin: '4px 0 0', fontSize: 14, color: '#6b7280' }}>Manage credit accounts, payments, and balances</p>
        </div>
      </div>

      {/* Error Banner */}
      {error && (
        <div style={{
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          background: '#fef2f2', color: '#dc2626', padding: '12px 16px',
          borderRadius: 10, marginBottom: 16, border: '1px solid #fecaca'
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#dc2626" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="12" cy="12" r="10" /><line x1="12" y1="8" x2="12" y2="12" /><line x1="12" y1="16" x2="12.01" y2="16" />
            </svg>
            <span style={{ fontSize: 14 }}>{error}</span>
          </div>
          <button onClick={() => setError('')} style={{
            background: 'none', border: 'none', cursor: 'pointer', color: '#dc2626',
            fontSize: 20, fontWeight: 700, lineHeight: 1, padding: '4px 8px', borderRadius: 6
          }}>x</button>
        </div>
      )}

      {/* Tabs */}
      <div style={{
        display: 'inline-flex', gap: 4, marginBottom: 24,
        background: '#f3f4f6', padding: 4, borderRadius: 10
      }}>
        {tabs.map(t => (
          <button key={t.key}
            onClick={() => (t.key !== 'detail' || selected) && setTab(t.key)}
            disabled={t.key === 'detail' && !selected}
            style={{
              padding: '8px 20px', borderRadius: 8, border: 'none',
              cursor: (t.key === 'detail' && !selected) ? 'not-allowed' : 'pointer',
              background: tab === t.key ? '#10b981' : 'transparent',
              color: tab === t.key ? '#fff' : '#374151',
              fontWeight: tab === t.key ? 600 : 500,
              fontSize: 14,
              opacity: (t.key === 'detail' && !selected) ? 0.4 : 1,
              transition: 'all 0.2s'
            }}>
            {t.label}
          </button>
        ))}
      </div>

      {/* Accounts List Tab */}
      {tab === 'list' && (
        <div style={cardStyle}>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr>
                <th style={thStyle}>Customer</th>
                <th style={thStyle}>Status</th>
                <th style={{ ...thStyle, textAlign: 'right' }}>Credit Limit</th>
                <th style={{ ...thStyle, textAlign: 'right' }}>Balance</th>
                <th style={{ ...thStyle, textAlign: 'right' }}>Available</th>
                <th style={thStyle}>Terms</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <>
                  <SkeletonRow />
                  <SkeletonRow />
                  <SkeletonRow />
                  <SkeletonRow />
                </>
              ) : accounts.length === 0 ? (
                <tr>
                  <td colSpan={6} style={{ padding: '48px 16px', textAlign: 'center' }}>
                    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 12 }}>
                      <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="#d1d5db" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                        <rect x="2" y="5" width="20" height="14" rx="2" />
                        <line x1="2" y1="10" x2="22" y2="10" />
                      </svg>
                      <div style={{ fontSize: 15, color: '#9ca3af', fontWeight: 500 }}>No customer accounts found</div>
                      <div style={{ fontSize: 13, color: '#d1d5db' }}>Open a new account to get started</div>
                    </div>
                  </td>
                </tr>
              ) : accounts.map(a => (
                <tr key={a.id} onClick={() => loadAccount(a.id)}
                  onMouseEnter={() => setHoveredRow(a.id)}
                  onMouseLeave={() => setHoveredRow(null)}
                  style={{
                    cursor: 'pointer',
                    background: hoveredRow === a.id ? '#f9fafb' : 'transparent',
                    transition: 'background 0.15s'
                  }}>
                  <td style={tdStyle}>{a.customer_name}</td>
                  <td style={tdStyle}>
                    <span style={{
                      padding: '3px 10px', borderRadius: 12, fontSize: 12, fontWeight: 600,
                      color: '#fff',
                      background: a.status === 'active' ? '#10b981' : a.status === 'on_hold' ? '#f59e0b' : '#ef4444'
                    }}>{a.status}</span>
                  </td>
                  <td style={{ ...tdStyle, textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>${(a.credit_limit_cents / 100).toFixed(2)}</td>
                  <td style={{ ...tdStyle, textAlign: 'right', fontVariantNumeric: 'tabular-nums', color: a.balance_cents > 0 ? '#dc2626' : '#10b981', fontWeight: 600 }}>${(a.balance_cents / 100).toFixed(2)}</td>
                  <td style={{ ...tdStyle, textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>${(a.available_credit_cents / 100).toFixed(2)}</td>
                  <td style={tdStyle}>Net {a.payment_terms_days}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Create Account Tab */}
      {tab === 'create' && (
        <div style={{ ...cardStyle, maxWidth: 480, padding: 24 }}>
          <h3 style={{ margin: '0 0 20px', fontSize: 18, fontWeight: 700, color: '#111827' }}>Open New Account</h3>
          <div style={{ marginBottom: 16 }}>
            <label style={labelStyle}>Customer ID</label>
            <input type="number" value={form.customerId} onChange={e => setForm(p => ({ ...p, customerId: e.target.value }))}
              style={inputStyle} />
          </div>
          <div style={{ marginBottom: 16 }}>
            <label style={labelStyle}>Credit Limit (cents)</label>
            <input type="number" value={form.creditLimitCents} onChange={e => setForm(p => ({ ...p, creditLimitCents: parseInt(e.target.value) }))}
              style={inputStyle} />
          </div>
          <div style={{ marginBottom: 20 }}>
            <label style={labelStyle}>Payment Terms (days)</label>
            <input type="number" value={form.paymentTermsDays} onChange={e => setForm(p => ({ ...p, paymentTermsDays: parseInt(e.target.value) }))}
              style={inputStyle} />
          </div>
          <button onClick={openAccount} style={{
            padding: '10px 24px', borderRadius: 8, border: 'none',
            background: 'linear-gradient(135deg, #10b981, #059669)',
            color: '#fff', cursor: 'pointer', fontWeight: 600, fontSize: 14,
            boxShadow: '0 2px 8px rgba(16, 185, 129, 0.3)'
          }}>Open Account</button>
        </div>
      )}

      {/* Account Detail Tab */}
      {tab === 'detail' && selected && (
        <div>
          {/* Stat Cards */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 16, marginBottom: 24 }}>
            {[
              { label: 'Customer', value: selected.customer_name, color: statCardAccents[0] },
              { label: 'Credit Limit', value: `$${(selected.credit_limit_cents / 100).toFixed(2)}`, color: statCardAccents[1] },
              { label: 'Balance', value: `$${(selected.balance_cents / 100).toFixed(2)}`, color: selected.balance_cents > 0 ? '#dc2626' : '#10b981', valueColor: selected.balance_cents > 0 ? '#dc2626' : '#10b981' },
              { label: 'Available', value: `$${(selected.available_credit_cents / 100).toFixed(2)}`, color: statCardAccents[3], valueColor: '#10b981' }
            ].map((card, i) => (
              <div key={i} style={{
                padding: 16, background: '#fff', borderRadius: 10, textAlign: 'center',
                border: '1px solid #e5e7eb',
                boxShadow: '0 1px 3px rgba(0,0,0,0.08)',
                borderLeft: `4px solid ${card.color}`
              }}>
                <div style={{ fontSize: 20, fontWeight: 700, color: card.valueColor || '#111827' }}>{card.value}</div>
                <div style={{ color: '#6b7280', fontSize: 13, marginTop: 4 }}>{card.label}</div>
              </div>
            ))}
          </div>

          {/* Record Payment */}
          <div style={{ ...cardStyle, marginBottom: 24, padding: 20 }}>
            <h4 style={{ margin: '0 0 12px', fontSize: 15, fontWeight: 700, color: '#111827' }}>Record Payment</h4>
            <div style={{ display: 'flex', gap: 10, alignItems: 'flex-end' }}>
              <div style={{ flex: 1 }}>
                <label style={labelStyle}>Amount (cents)</label>
                <input type="number" value={txForm.amountCents} onChange={e => setTxForm(p => ({ ...p, amountCents: e.target.value }))}
                  placeholder="Amount (cents)" style={inputStyle} />
              </div>
              <div style={{ flex: 2 }}>
                <label style={labelStyle}>Description</label>
                <input value={txForm.description} onChange={e => setTxForm(p => ({ ...p, description: e.target.value }))}
                  placeholder="Description" style={inputStyle} />
              </div>
              <button onClick={recordPayment} style={{
                padding: '10px 20px', borderRadius: 8, border: 'none',
                background: '#10b981', color: '#fff', cursor: 'pointer',
                fontWeight: 600, fontSize: 14, whiteSpace: 'nowrap', height: 42
              }}>Record</button>
            </div>
          </div>

          {/* Transaction History */}
          <h4 style={{ margin: '0 0 12px', fontSize: 15, fontWeight: 700, color: '#111827' }}>Transaction History</h4>
          <div style={cardStyle}>
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr>
                  <th style={thStyle}>Date</th>
                  <th style={thStyle}>Type</th>
                  <th style={thStyle}>Description</th>
                  <th style={{ ...thStyle, textAlign: 'right' }}>Amount</th>
                  <th style={{ ...thStyle, textAlign: 'right' }}>Balance After</th>
                </tr>
              </thead>
              <tbody>
                {(statement?.transactions || []).map(t => (
                  <tr key={t.id} style={{ transition: 'background 0.15s' }}
                    onMouseEnter={e => e.currentTarget.style.background = '#f9fafb'}
                    onMouseLeave={e => e.currentTarget.style.background = 'transparent'}>
                    <td style={tdStyle}>{new Date(t.created_at).toLocaleDateString()}</td>
                    <td style={tdStyle}>
                      <span style={{
                        padding: '3px 10px', borderRadius: 12, fontSize: 12, fontWeight: 600,
                        background: t.type === 'payment' ? '#dcfce7' : '#fee2e2',
                        color: t.type === 'payment' ? '#166534' : '#991b1b'
                      }}>{t.type}</span>
                    </td>
                    <td style={tdStyle}>{t.description}</td>
                    <td style={{ ...tdStyle, textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>${(t.amount_cents / 100).toFixed(2)}</td>
                    <td style={{ ...tdStyle, textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>${(t.balance_after_cents / 100).toFixed(2)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
