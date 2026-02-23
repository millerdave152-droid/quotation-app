import React, { useState, useEffect, useCallback } from 'react';
import { authFetch } from '../../services/authFetch';

const API = '/api/special-orders';

export default function SpecialOrderTracker() {
  const [tab, setTab] = useState('list');
  const [orders, setOrders] = useState([]);
  const [selected, setSelected] = useState(null);
  const [stats, setStats] = useState({});
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [form, setForm] = useState({ customerId: '', productId: '', quantity: 1, depositCents: 0, totalPriceCents: 0, vendorName: '', etaDate: '', notes: '' });

  const fetchOrders = useCallback(async () => {
    setLoading(true);
    try {
      const params = statusFilter ? `?status=${statusFilter}` : '';
      const res = await authFetch(`${API}${params}`);
      const data = await res.json();
      if (data.success) setOrders(data.data?.specialOrders || []);
    } catch (e) { setError(e.message); }
    setLoading(false);
  }, [statusFilter]);

  const fetchStats = useCallback(async () => {
    try {
      const res = await authFetch(`${API}/stats`);
      const data = await res.json();
      if (data.success) setStats(data.data || {});
    } catch (e) { /* ignore */ }
  }, []);

  useEffect(() => { fetchOrders(); fetchStats(); }, [fetchOrders, fetchStats]);

  const createOrder = async () => {
    if (!form.customerId) return setError('Customer ID required');
    try {
      const res = await authFetch(API, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form)
      });
      const data = await res.json();
      if (data.success) { fetchOrders(); fetchStats(); setTab('list'); }
      else setError(data.error || 'Failed');
    } catch (e) { setError(e.message); }
  };

  const updateStatus = async (id, status) => {
    try {
      const res = await authFetch(`${API}/${id}/status`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status })
      });
      const data = await res.json();
      if (data.success) { setSelected(data.data); fetchOrders(); fetchStats(); }
    } catch (e) { setError(e.message); }
  };

  const statusColors = {
    ordered: '#6b7280', eta_confirmed: '#2563eb', in_transit: '#8b5cf6', arrived: '#10b981',
    customer_notified: '#f59e0b', picked_up: '#059669', delivered: '#047857', cancelled: '#ef4444'
  };

  return (
    <div style={{ padding: '24px', maxWidth: 1200 }}>
      <h2 style={{ marginBottom: 16 }}>Special Orders</h2>
      {error && <div style={{ background: '#fef2f2', color: '#dc2626', padding: 12, borderRadius: 8, marginBottom: 16 }}>{error} <button onClick={() => setError('')}>×</button></div>}

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 12, marginBottom: 24 }}>
        {[
          { label: 'Active', value: stats.active_count, color: '#2563eb' },
          { label: 'Arrived', value: stats.arrived_pending, color: '#10b981' },
          { label: 'In Transit', value: stats.in_transit, color: '#8b5cf6' },
          { label: 'Overdue Pickup', value: stats.overdue_pickup, color: '#ef4444' },
        ].map(s => (
          <div key={s.label} style={{ padding: 16, background: '#f9fafb', borderRadius: 8, textAlign: 'center', borderLeft: `4px solid ${s.color}` }}>
            <div style={{ fontSize: 24, fontWeight: 700, color: s.color }}>{s.value || 0}</div>
            <div style={{ color: '#6b7280', fontSize: 13 }}>{s.label}</div>
          </div>
        ))}
      </div>

      <div style={{ display: 'flex', gap: 8, marginBottom: 16 }}>
        <button onClick={() => setTab('list')} style={{ padding: '8px 16px', borderRadius: 8, border: 'none', background: tab === 'list' ? '#2563eb' : '#f3f4f6', color: tab === 'list' ? '#fff' : '#374151', cursor: 'pointer' }}>All Orders</button>
        <button onClick={() => setTab('create')} style={{ padding: '8px 16px', borderRadius: 8, border: 'none', background: tab === 'create' ? '#2563eb' : '#f3f4f6', color: tab === 'create' ? '#fff' : '#374151', cursor: 'pointer' }}>Create Order</button>
      </div>

      {tab === 'list' && (
        <div>
          <select value={statusFilter} onChange={e => setStatusFilter(e.target.value)} style={{ marginBottom: 12, padding: 8, borderRadius: 8, border: '1px solid #d1d5db' }}>
            <option value="">All</option>
            {Object.keys(statusColors).map(s => <option key={s} value={s}>{s.replace(/_/g, ' ')}</option>)}
          </select>
          {loading ? <p>Loading...</p> : (
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead><tr style={{ borderBottom: '2px solid #e5e7eb', textAlign: 'left' }}>
                <th style={{ padding: 8 }}>SO #</th><th style={{ padding: 8 }}>Customer</th><th style={{ padding: 8 }}>Product</th>
                <th style={{ padding: 8 }}>Status</th><th style={{ padding: 8 }}>ETA</th><th style={{ padding: 8 }}>Actions</th>
              </tr></thead>
              <tbody>
                {orders.map(o => (
                  <tr key={o.id} style={{ borderBottom: '1px solid #f3f4f6' }}>
                    <td style={{ padding: 8, fontFamily: 'monospace' }}>{o.so_number}</td>
                    <td style={{ padding: 8 }}>{o.customer_name}</td>
                    <td style={{ padding: 8 }}>{o.product_name || o.product_description}</td>
                    <td style={{ padding: 8 }}><span style={{ padding: '2px 8px', borderRadius: 12, fontSize: 12, color: '#fff', background: statusColors[o.status] }}>{o.status.replace(/_/g, ' ')}</span></td>
                    <td style={{ padding: 8 }}>{o.eta_date || '—'}</td>
                    <td style={{ padding: 8 }}>
                      {o.status === 'in_transit' && <button onClick={() => updateStatus(o.id, 'arrived')} style={{ padding: '4px 8px', borderRadius: 4, border: 'none', background: '#10b981', color: '#fff', cursor: 'pointer', marginRight: 4 }}>Mark Arrived</button>}
                      {o.status === 'arrived' && <button onClick={() => updateStatus(o.id, 'customer_notified')} style={{ padding: '4px 8px', borderRadius: 4, border: 'none', background: '#f59e0b', color: '#fff', cursor: 'pointer' }}>Notify Customer</button>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      )}

      {tab === 'create' && (
        <div style={{ maxWidth: 500 }}>
          <h3>Create Special Order</h3>
          {[
            { key: 'customerId', label: 'Customer ID', type: 'number' },
            { key: 'productId', label: 'Product ID', type: 'number' },
            { key: 'vendorName', label: 'Vendor', type: 'text' },
            { key: 'quantity', label: 'Quantity', type: 'number' },
            { key: 'totalPriceCents', label: 'Total Price (cents)', type: 'number' },
            { key: 'depositCents', label: 'Deposit (cents)', type: 'number' },
            { key: 'etaDate', label: 'ETA Date', type: 'date' },
            { key: 'notes', label: 'Notes', type: 'text' },
          ].map(f => (
            <div key={f.key} style={{ marginBottom: 12 }}>
              <label style={{ display: 'block', marginBottom: 4 }}>{f.label}</label>
              <input type={f.type} value={form[f.key]} onChange={e => setForm(p => ({ ...p, [f.key]: e.target.value }))}
                style={{ width: '100%', padding: 8, borderRadius: 8, border: '1px solid #d1d5db' }} />
            </div>
          ))}
          <button onClick={createOrder} style={{ padding: '10px 24px', borderRadius: 8, border: 'none', background: '#2563eb', color: '#fff', cursor: 'pointer' }}>Create</button>
        </div>
      )}
    </div>
  );
}
