import React, { useState, useEffect, useCallback } from 'react';
import { authFetch } from '../../services/authFetch';

const API = '/api/pre-orders';

const formatStatus = (status) => {
  if (!status) return '';
  return status.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
};

const thStyle = {
  padding: '12px 16px',
  fontSize: 13,
  fontWeight: 600,
  color: '#6b7280',
  textTransform: 'uppercase',
  letterSpacing: '0.05em',
  borderBottom: '2px solid #e5e7eb',
  textAlign: 'left',
  whiteSpace: 'nowrap'
};

const tdStyle = {
  padding: '12px 16px',
  fontSize: 14,
  color: '#374151',
  borderBottom: '1px solid #f3f4f6'
};

const cardStyle = {
  background: '#fff',
  borderRadius: 12,
  boxShadow: '0 1px 3px rgba(0,0,0,0.08), 0 1px 2px rgba(0,0,0,0.06)',
  overflow: 'hidden'
};

const inputStyle = {
  width: '100%',
  padding: '10px 14px',
  borderRadius: 8,
  border: '1px solid #d1d5db',
  fontSize: 14,
  color: '#111827',
  outline: 'none',
  transition: 'border-color 0.15s',
  boxSizing: 'border-box'
};

const labelStyle = {
  display: 'block',
  marginBottom: 6,
  fontSize: 13,
  fontWeight: 600,
  color: '#374151'
};

const SkeletonRow = ({ cols }) => (
  <tr>
    {Array.from({ length: cols }).map((_, i) => (
      <td key={i} style={tdStyle}>
        <div style={{
          height: 16,
          borderRadius: 4,
          background: 'linear-gradient(90deg, #f3f4f6 25%, #e5e7eb 50%, #f3f4f6 75%)',
          backgroundSize: '200% 100%',
          animation: 'shimmer 1.5s infinite',
          width: i === 0 ? '70%' : '50%'
        }} />
      </td>
    ))}
  </tr>
);

const EmptyState = ({ message }) => (
  <div style={{ textAlign: 'center', padding: '48px 24px', color: '#9ca3af' }}>
    <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="#d1d5db" strokeWidth="1.5" style={{ margin: '0 auto 16px' }}>
      <path d="M21 16V8a2 2 0 00-1-1.73l-7-4a2 2 0 00-2 0l-7 4A2 2 0 003 8v8a2 2 0 001 1.73l7 4a2 2 0 002 0l7-4A2 2 0 0021 16z" />
      <polyline points="3.27 6.96 12 12.01 20.73 6.96" />
      <line x1="12" y1="22.08" x2="12" y2="12" />
    </svg>
    <p style={{ fontSize: 15, fontWeight: 500, margin: 0 }}>{message}</p>
  </div>
);

export default function PreOrderManager() {
  const [tab, setTab] = useState('list');
  const [preOrders, setPreOrders] = useState([]);
  const [availableProducts, setAvailableProducts] = useState([]);
  const [loading, setLoading] = useState(false);
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState('');
  const [form, setForm] = useState({ customerId: '', productId: '', quantity: 1, notes: '' });

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const [listRes, prodRes] = await Promise.all([
        authFetch(API),
        authFetch(`${API}/available-products`)
      ]);
      const listData = await listRes.json();
      const prodData = await prodRes.json();
      if (listData.success) setPreOrders(listData.data?.preOrders || []);
      if (prodData.success) setAvailableProducts(prodData.data || []);
    } catch (e) { setError(e.message); }
    setLoading(false);
  }, []);

  useEffect(() => { fetchData(); }, [fetchData]);

  const create = async () => {
    if (!form.customerId || !form.productId) return setError('Customer and product required');
    setCreating(true);
    try {
      const payload = {
        ...form,
        customerId: parseInt(form.customerId, 10),
        productId: parseInt(form.productId, 10),
        quantity: parseInt(form.quantity, 10) || 1
      };
      const res = await authFetch(API, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      const data = await res.json();
      if (data.success) {
        fetchData();
        setForm({ customerId: '', productId: '', quantity: 1, notes: '' });
        setTab('list');
      }
      else setError(data.error || 'Failed');
    } catch (e) { setError(e.message); }
    setCreating(false);
  };

  const updateStatus = async (id, status) => {
    try {
      await authFetch(`${API}/${id}/status`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status })
      });
      fetchData();
    } catch (e) { setError(e.message); }
  };

  const statusColors = { pending: '#6b7280', confirmed: '#2563eb', available: '#10b981', notified: '#f59e0b', fulfilled: '#059669', cancelled: '#ef4444', refunded: '#dc2626' };

  const tabs = [
    { key: 'list', label: 'All Pre-Orders' },
    { key: 'create', label: 'Create' },
    { key: 'products', label: 'Available Products' }
  ];

  return (
    <div style={{ padding: '24px', maxWidth: 1200, margin: '0 auto' }}>
      {/* Shimmer keyframes */}
      <style>{`@keyframes shimmer { 0% { background-position: 200% 0; } 100% { background-position: -200% 0; } }`}</style>

      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 16, marginBottom: 24 }}>
        <div style={{
          width: 48, height: 48, borderRadius: 12,
          background: 'linear-gradient(135deg, #f59e0b, #d97706)',
          display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0
        }}>
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M21 16V8a2 2 0 00-1-1.73l-7-4a2 2 0 00-2 0l-7 4A2 2 0 003 8v8a2 2 0 001 1.73l7 4a2 2 0 002 0l7-4A2 2 0 0021 16z" />
            <polyline points="3.27 6.96 12 12.01 20.73 6.96" />
            <line x1="12" y1="22.08" x2="12" y2="12" />
          </svg>
        </div>
        <div>
          <h2 style={{ margin: 0, fontSize: 22, fontWeight: 700, color: '#111827' }}>Pre-Orders</h2>
          <p style={{ margin: '2px 0 0', fontSize: 14, color: '#6b7280' }}>Manage product pre-orders and fulfillment</p>
        </div>
      </div>

      {/* Error banner */}
      {error && (
        <div style={{
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          background: '#fef2f2', color: '#dc2626', padding: '12px 16px',
          borderRadius: 8, marginBottom: 16, fontSize: 14, border: '1px solid #fecaca'
        }}>
          <span>{error}</span>
          <button onClick={() => setError('')} style={{
            background: 'none', border: 'none', color: '#dc2626', cursor: 'pointer',
            fontSize: 18, fontWeight: 700, padding: '0 4px', lineHeight: 1, flexShrink: 0, marginLeft: 12
          }}>×</button>
        </div>
      )}

      {/* Pill tab bar */}
      <div style={{ display: 'inline-flex', gap: 4, padding: 4, background: '#f3f4f6', borderRadius: 10, marginBottom: 24 }}>
        {tabs.map(t => (
          <button key={t.key} onClick={() => setTab(t.key)} style={{
            padding: '8px 20px', borderRadius: 8, border: 'none', fontSize: 14, fontWeight: 500,
            background: tab === t.key ? '#f59e0b' : 'transparent',
            color: tab === t.key ? '#fff' : '#6b7280',
            cursor: 'pointer', transition: 'all 0.15s'
          }}>{t.label}</button>
        ))}
      </div>

      {/* Pre-Orders List */}
      {tab === 'list' && (
        <div style={cardStyle}>
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr>
                  <th style={thStyle}>Customer</th>
                  <th style={thStyle}>Product</th>
                  <th style={thStyle}>Qty</th>
                  <th style={thStyle}>Status</th>
                  <th style={thStyle}>Release</th>
                  <th style={{ ...thStyle, textAlign: 'right' }}>Deposit</th>
                  <th style={thStyle}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {loading ? (
                  <>
                    <SkeletonRow cols={7} />
                    <SkeletonRow cols={7} />
                    <SkeletonRow cols={7} />
                    <SkeletonRow cols={7} />
                  </>
                ) : preOrders.length === 0 ? (
                  <tr><td colSpan={7}><EmptyState message="No pre-orders found" /></td></tr>
                ) : (
                  preOrders.map(po => (
                    <tr key={po.id} style={{ borderBottom: '1px solid #f3f4f6', transition: 'background 0.15s', cursor: 'default' }}
                      onMouseEnter={e => e.currentTarget.style.background = '#f9fafb'}
                      onMouseLeave={e => e.currentTarget.style.background = 'transparent'}>
                      <td style={tdStyle}>{po.customer_name}</td>
                      <td style={tdStyle}>{po.product_name}</td>
                      <td style={tdStyle}>{po.quantity}</td>
                      <td style={tdStyle}>
                        <span style={{
                          padding: '4px 10px', borderRadius: 12, fontSize: 12, fontWeight: 600,
                          color: '#fff', background: statusColors[po.status] || '#6b7280'
                        }}>{formatStatus(po.status)}</span>
                      </td>
                      <td style={tdStyle}>{po.release_date || '\u2014'}</td>
                      <td style={{ ...tdStyle, textAlign: 'right', fontFamily: 'monospace' }}>${((po.deposit_cents || 0) / 100).toFixed(2)}</td>
                      <td style={tdStyle}>
                        {po.status === 'available' && (
                          <button onClick={() => updateStatus(po.id, 'notified')} style={{
                            padding: '5px 12px', borderRadius: 6, border: 'none',
                            background: '#f59e0b', color: '#fff', cursor: 'pointer',
                            fontSize: 13, fontWeight: 500, marginRight: 4
                          }}>Notify</button>
                        )}
                        {po.status === 'notified' && (
                          <button onClick={() => updateStatus(po.id, 'fulfilled')} style={{
                            padding: '5px 12px', borderRadius: 6, border: 'none',
                            background: '#10b981', color: '#fff', cursor: 'pointer',
                            fontSize: 13, fontWeight: 500
                          }}>Fulfill</button>
                        )}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Create Form */}
      {tab === 'create' && (
        <div style={{ ...cardStyle, padding: 24, maxWidth: 600 }}>
          <h3 style={{ margin: '0 0 20px', fontSize: 16, fontWeight: 600, color: '#111827' }}>New Pre-Order</h3>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
            {[
              { key: 'customerId', label: 'Customer ID', type: 'number' },
              { key: 'productId', label: 'Product ID', type: 'number' },
              { key: 'quantity', label: 'Quantity', type: 'number' },
              { key: 'notes', label: 'Notes', type: 'text' }
            ].map(f => (
              <div key={f.key} style={f.key === 'notes' ? { gridColumn: '1 / -1' } : {}}>
                <label style={labelStyle}>{f.label}</label>
                <input
                  type={f.type}
                  value={form[f.key]}
                  onChange={e => setForm(p => ({ ...p, [f.key]: e.target.value }))}
                  style={inputStyle}
                  placeholder={`Enter ${f.label.toLowerCase()}`}
                />
              </div>
            ))}
          </div>
          <button
            onClick={create}
            disabled={creating}
            style={{
              marginTop: 20, padding: '10px 28px', borderRadius: 8, border: 'none',
              background: creating ? '#9ca3af' : '#f59e0b', color: '#fff',
              cursor: creating ? 'not-allowed' : 'pointer',
              fontSize: 14, fontWeight: 600, transition: 'background 0.15s'
            }}
          >
            {creating ? 'Creating...' : 'Create Pre-Order'}
          </button>
        </div>
      )}

      {/* Available Products */}
      {tab === 'products' && (
        <div style={cardStyle}>
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr>
                  <th style={thStyle}>Product</th>
                  <th style={thStyle}>SKU</th>
                  <th style={{ ...thStyle, textAlign: 'right' }}>Price</th>
                  <th style={thStyle}>Release Date</th>
                  <th style={thStyle}>Deposit %</th>
                  <th style={thStyle}>Pre-Orders</th>
                </tr>
              </thead>
              <tbody>
                {loading ? (
                  <>
                    <SkeletonRow cols={6} />
                    <SkeletonRow cols={6} />
                    <SkeletonRow cols={6} />
                    <SkeletonRow cols={6} />
                  </>
                ) : availableProducts.length === 0 ? (
                  <tr><td colSpan={6}><EmptyState message="No products available for pre-order" /></td></tr>
                ) : (
                  availableProducts.map(p => (
                    <tr key={p.id} style={{ transition: 'background 0.15s', cursor: 'default' }}
                      onMouseEnter={e => e.currentTarget.style.background = '#f9fafb'}
                      onMouseLeave={e => e.currentTarget.style.background = 'transparent'}>
                      <td style={tdStyle}>{p.name}</td>
                      <td style={{ ...tdStyle, fontFamily: 'monospace', fontSize: 13 }}>{p.sku}</td>
                      <td style={{ ...tdStyle, textAlign: 'right', fontFamily: 'monospace' }}>
                        ${((p.sell_price || p.msrp_cents || p.price || 0) / 100).toFixed(2)}
                      </td>
                      <td style={tdStyle}>{p.preorder_release_date || '\u2014'}</td>
                      <td style={tdStyle}>{p.preorder_deposit_percent || 100}%</td>
                      <td style={tdStyle}>{p.current_preorders}{p.preorder_max_qty ? `/${p.preorder_max_qty}` : ''}</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
