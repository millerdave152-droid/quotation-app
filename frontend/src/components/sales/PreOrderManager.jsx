import React, { useState, useEffect, useCallback } from 'react';
import { authFetch } from '../../services/authFetch';

const API = '/api/pre-orders';

export default function PreOrderManager() {
  const [tab, setTab] = useState('list');
  const [preOrders, setPreOrders] = useState([]);
  const [availableProducts, setAvailableProducts] = useState([]);
  const [loading, setLoading] = useState(false);
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
    try {
      const res = await authFetch(API, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form)
      });
      const data = await res.json();
      if (data.success) { fetchData(); setTab('list'); }
      else setError(data.error || 'Failed');
    } catch (e) { setError(e.message); }
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

  return (
    <div style={{ padding: '24px', maxWidth: 1200 }}>
      <h2 style={{ marginBottom: 16 }}>Pre-Orders</h2>
      {error && <div style={{ background: '#fef2f2', color: '#dc2626', padding: 12, borderRadius: 8, marginBottom: 16 }}>{error} <button onClick={() => setError('')}>×</button></div>}

      <div style={{ display: 'flex', gap: 8, marginBottom: 24 }}>
        <button onClick={() => setTab('list')} style={{ padding: '8px 16px', borderRadius: 8, border: 'none', background: tab === 'list' ? '#2563eb' : '#f3f4f6', color: tab === 'list' ? '#fff' : '#374151', cursor: 'pointer' }}>All Pre-Orders</button>
        <button onClick={() => setTab('create')} style={{ padding: '8px 16px', borderRadius: 8, border: 'none', background: tab === 'create' ? '#2563eb' : '#f3f4f6', color: tab === 'create' ? '#fff' : '#374151', cursor: 'pointer' }}>Create</button>
        <button onClick={() => setTab('products')} style={{ padding: '8px 16px', borderRadius: 8, border: 'none', background: tab === 'products' ? '#2563eb' : '#f3f4f6', color: tab === 'products' ? '#fff' : '#374151', cursor: 'pointer' }}>Available Products</button>
      </div>

      {tab === 'list' && (
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead><tr style={{ borderBottom: '2px solid #e5e7eb', textAlign: 'left' }}>
            <th style={{ padding: 8 }}>Customer</th><th style={{ padding: 8 }}>Product</th><th style={{ padding: 8 }}>Qty</th>
            <th style={{ padding: 8 }}>Status</th><th style={{ padding: 8 }}>Release</th><th style={{ padding: 8, textAlign: 'right' }}>Deposit</th><th style={{ padding: 8 }}>Actions</th>
          </tr></thead>
          <tbody>
            {preOrders.map(po => (
              <tr key={po.id} style={{ borderBottom: '1px solid #f3f4f6' }}>
                <td style={{ padding: 8 }}>{po.customer_name}</td>
                <td style={{ padding: 8 }}>{po.product_name}</td>
                <td style={{ padding: 8 }}>{po.quantity}</td>
                <td style={{ padding: 8 }}><span style={{ padding: '2px 8px', borderRadius: 12, fontSize: 12, color: '#fff', background: statusColors[po.status] }}>{po.status}</span></td>
                <td style={{ padding: 8 }}>{po.release_date || '—'}</td>
                <td style={{ padding: 8, textAlign: 'right' }}>${((po.deposit_cents || 0) / 100).toFixed(2)}</td>
                <td style={{ padding: 8 }}>
                  {po.status === 'available' && <button onClick={() => updateStatus(po.id, 'notified')} style={{ padding: '4px 8px', borderRadius: 4, border: 'none', background: '#f59e0b', color: '#fff', cursor: 'pointer', marginRight: 4 }}>Notify</button>}
                  {po.status === 'notified' && <button onClick={() => updateStatus(po.id, 'fulfilled')} style={{ padding: '4px 8px', borderRadius: 4, border: 'none', background: '#10b981', color: '#fff', cursor: 'pointer' }}>Fulfill</button>}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      {tab === 'create' && (
        <div style={{ maxWidth: 500 }}>
          {[{ key: 'customerId', label: 'Customer ID', type: 'number' }, { key: 'productId', label: 'Product ID', type: 'number' },
            { key: 'quantity', label: 'Quantity', type: 'number' }, { key: 'notes', label: 'Notes', type: 'text' }
          ].map(f => (
            <div key={f.key} style={{ marginBottom: 12 }}>
              <label style={{ display: 'block', marginBottom: 4 }}>{f.label}</label>
              <input type={f.type} value={form[f.key]} onChange={e => setForm(p => ({ ...p, [f.key]: e.target.value }))}
                style={{ width: '100%', padding: 8, borderRadius: 8, border: '1px solid #d1d5db' }} />
            </div>
          ))}
          <button onClick={create} style={{ padding: '10px 24px', borderRadius: 8, border: 'none', background: '#2563eb', color: '#fff', cursor: 'pointer' }}>Create Pre-Order</button>
        </div>
      )}

      {tab === 'products' && (
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead><tr style={{ borderBottom: '2px solid #e5e7eb', textAlign: 'left' }}>
            <th style={{ padding: 8 }}>Product</th><th style={{ padding: 8 }}>SKU</th><th style={{ padding: 8, textAlign: 'right' }}>Price</th>
            <th style={{ padding: 8 }}>Release Date</th><th style={{ padding: 8 }}>Deposit %</th><th style={{ padding: 8 }}>Pre-Orders</th>
          </tr></thead>
          <tbody>
            {availableProducts.map(p => (
              <tr key={p.id} style={{ borderBottom: '1px solid #f3f4f6' }}>
                <td style={{ padding: 8 }}>{p.name}</td>
                <td style={{ padding: 8, fontFamily: 'monospace' }}>{p.sku}</td>
                <td style={{ padding: 8, textAlign: 'right' }}>${parseFloat(p.price || 0).toFixed(2)}</td>
                <td style={{ padding: 8 }}>{p.preorder_release_date || '—'}</td>
                <td style={{ padding: 8 }}>{p.preorder_deposit_percent || 100}%</td>
                <td style={{ padding: 8 }}>{p.current_preorders}{p.preorder_max_qty ? `/${p.preorder_max_qty}` : ''}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}
