import React, { useState, useEffect, useCallback } from 'react';
import { authFetch } from '../../services/authFetch';

const API = '/api/special-orders';

const defaultForm = { customerId: '', productId: '', quantity: 1, depositCents: 0, totalPriceCents: 0, vendorName: '', etaDate: '', notes: '' };

export default function SpecialOrderTracker() {
  const [tab, setTab] = useState('list');
  const [orders, setOrders] = useState([]);
  const [stats, setStats] = useState({});
  const [loading, setLoading] = useState(false);
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [form, setForm] = useState(defaultForm);

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
    } catch { /* ignore */ }
  }, []);

  useEffect(() => { fetchOrders(); fetchStats(); }, [fetchOrders, fetchStats]);

  const createOrder = async () => {
    if (!form.customerId) return setError('Customer ID required');
    setCreating(true);
    try {
      const payload = {
        ...form,
        customerId: parseInt(form.customerId) || null,
        productId: form.productId ? parseInt(form.productId) : null,
        quantity: parseInt(form.quantity) || 1,
        depositCents: parseInt(form.depositCents) || 0,
        totalPriceCents: parseInt(form.totalPriceCents) || 0,
      };
      const res = await authFetch(API, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      const data = await res.json();
      if (data.success) {
        setForm(defaultForm);
        fetchOrders();
        fetchStats();
        setTab('list');
      } else {
        setError(data.error || 'Failed to create order');
      }
    } catch (e) { setError(e.message); }
    setCreating(false);
  };

  const updateStatus = async (id, status) => {
    try {
      const res = await authFetch(`${API}/${id}/status`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status })
      });
      const data = await res.json();
      if (data.success) { fetchOrders(); fetchStats(); }
    } catch (e) { setError(e.message); }
  };

  const statusColors = {
    ordered: '#6b7280', eta_confirmed: '#2563eb', in_transit: '#8b5cf6', arrived: '#10b981',
    customer_notified: '#f59e0b', picked_up: '#059669', delivered: '#047857', cancelled: '#ef4444'
  };

  const thStyle = { padding: '12px 14px', textAlign: 'left', fontSize: 12, fontWeight: 600, color: '#6b7280', textTransform: 'uppercase', letterSpacing: '0.05em' };
  const tdStyle = { padding: '12px 14px', fontSize: 14, color: '#374151' };
  const labelStyle = { display: 'block', fontSize: 13, fontWeight: 600, color: '#374151', marginBottom: 4 };
  const inputStyle = { width: '100%', padding: '10px 12px', borderRadius: 8, border: '1px solid #d1d5db', fontSize: 14, outline: 'none', boxSizing: 'border-box' };

  return (
    <div style={{ padding: '24px', maxWidth: 1400, margin: '0 auto' }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 14, marginBottom: 24 }}>
        <div style={{
          width: 42, height: 42, borderRadius: 12,
          background: 'linear-gradient(135deg, #8b5cf6 0%, #6d28d9 100%)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          boxShadow: '0 4px 12px rgba(139, 92, 246, 0.3)', flexShrink: 0
        }}>
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="9" cy="21" r="1"/><circle cx="20" cy="21" r="1"/>
            <path d="M1 1h4l2.68 13.39a2 2 0 0 0 2 1.61h9.72a2 2 0 0 0 2-1.61L23 6H6"/>
          </svg>
        </div>
        <div>
          <h1 style={{ fontSize: 24, fontWeight: 700, color: '#111827', margin: 0 }}>Special Orders</h1>
          <p style={{ color: '#6b7280', margin: '2px 0 0', fontSize: 13 }}>
            Track vendor orders, arrivals, and customer pickups
          </p>
        </div>
      </div>

      {error && (
        <div style={{ background: '#fef2f2', color: '#dc2626', padding: '12px 16px', borderRadius: 8, marginBottom: 16, display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: 14 }}>
          {error}
          <button onClick={() => setError('')} style={{ background: 'none', border: 'none', color: '#dc2626', cursor: 'pointer', fontSize: 18, padding: '0 4px' }}>×</button>
        </div>
      )}

      {/* Stats Cards */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 16, marginBottom: 24 }}>
        {[
          { label: 'Active Orders', value: stats.active_count, color: '#2563eb' },
          { label: 'Arrived', value: stats.arrived_pending, color: '#10b981' },
          { label: 'In Transit', value: stats.in_transit, color: '#8b5cf6' },
          { label: 'Overdue Pickup', value: stats.overdue_pickup, color: '#ef4444' },
        ].map(s => (
          <div key={s.label} style={{
            padding: 20, background: 'white', borderRadius: 12, borderLeft: `4px solid ${s.color}`,
            boxShadow: '0 1px 3px rgba(0,0,0,0.06)'
          }}>
            <div style={{ fontSize: 28, fontWeight: 700, color: s.color }}>{s.value || 0}</div>
            <div style={{ color: '#6b7280', fontSize: 13, fontWeight: 500 }}>{s.label}</div>
          </div>
        ))}
      </div>

      {/* Tabs */}
      <div style={{ display: 'flex', gap: 8, marginBottom: 24, background: '#f3f4f6', padding: 4, borderRadius: 10, width: 'fit-content' }}>
        {[
          { id: 'list', label: 'All Orders' },
          { id: 'create', label: '+ Create Order' },
        ].map(t => (
          <button key={t.id} onClick={() => setTab(t.id)} style={{
            padding: '10px 20px', borderRadius: 8, border: 'none', fontSize: 14, fontWeight: 600, cursor: 'pointer',
            background: tab === t.id ? '#8b5cf6' : 'transparent',
            color: tab === t.id ? 'white' : '#6b7280',
            transition: 'all 0.15s',
          }}>
            {t.label}
          </button>
        ))}
      </div>

      {/* Orders List */}
      {tab === 'list' && (
        <div>
          <div style={{ marginBottom: 16, display: 'flex', gap: 12, alignItems: 'center' }}>
            <select value={statusFilter} onChange={e => setStatusFilter(e.target.value)} style={{
              padding: '10px 12px', borderRadius: 8, border: '1px solid #d1d5db', fontSize: 14, background: 'white', cursor: 'pointer'
            }}>
              <option value="">All Statuses</option>
              {Object.keys(statusColors).map(s => (
                <option key={s} value={s}>{s.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase())}</option>
              ))}
            </select>
            <button onClick={() => { fetchOrders(); fetchStats(); }} style={{
              padding: '10px 16px', background: 'white', border: '1px solid #d1d5db', borderRadius: 8,
              fontSize: 14, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6
            }}>
              Refresh
            </button>
          </div>

          {loading ? (
            <div style={{ background: 'white', borderRadius: 12, overflow: 'hidden', boxShadow: '0 1px 3px rgba(0,0,0,0.06)' }}>
              {[1, 2, 3, 4, 5].map(i => (
                <div key={i} style={{ display: 'flex', gap: 16, padding: '14px 16px', borderBottom: '1px solid #f3f4f6' }}>
                  <div style={{ width: '15%', height: 14, background: '#e5e7eb', borderRadius: 4, animation: 'pulse 1.5s infinite' }} />
                  <div style={{ width: '20%', height: 14, background: '#e5e7eb', borderRadius: 4, animation: 'pulse 1.5s infinite' }} />
                  <div style={{ width: '25%', height: 14, background: '#e5e7eb', borderRadius: 4, animation: 'pulse 1.5s infinite' }} />
                  <div style={{ width: '10%', height: 14, background: '#e5e7eb', borderRadius: 4, animation: 'pulse 1.5s infinite' }} />
                </div>
              ))}
              <style>{`@keyframes pulse { 0%, 100% { opacity: 1; } 50% { opacity: 0.4; } }`}</style>
            </div>
          ) : orders.length === 0 ? (
            <div style={{ background: 'white', borderRadius: 12, padding: 60, textAlign: 'center', boxShadow: '0 1px 3px rgba(0,0,0,0.06)' }}>
              <div style={{ fontSize: 40, marginBottom: 12, opacity: 0.4 }}>📦</div>
              <p style={{ color: '#6b7280', fontSize: 15, margin: 0 }}>No special orders found</p>
            </div>
          ) : (
            <div style={{ background: 'white', borderRadius: 12, overflow: 'hidden', boxShadow: '0 1px 3px rgba(0,0,0,0.06)' }}>
              <div style={{ overflowX: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 700 }}>
                  <thead>
                    <tr style={{ background: '#f9fafb', borderBottom: '2px solid #e5e7eb' }}>
                      <th style={thStyle}>SO #</th>
                      <th style={thStyle}>Customer</th>
                      <th style={thStyle}>Product</th>
                      <th style={thStyle}>Vendor</th>
                      <th style={thStyle}>Status</th>
                      <th style={thStyle}>ETA</th>
                      <th style={thStyle}>Amount</th>
                      <th style={{ ...thStyle, textAlign: 'right' }}>Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {orders.map(o => (
                      <tr key={o.id} style={{ borderBottom: '1px solid #f3f4f6', transition: 'background 0.1s' }}
                        onMouseEnter={e => e.currentTarget.style.background = '#f9fafb'}
                        onMouseLeave={e => e.currentTarget.style.background = 'transparent'}>
                        <td style={{ ...tdStyle, fontFamily: 'monospace', fontWeight: 600, color: '#8b5cf6' }}>{o.so_number}</td>
                        <td style={tdStyle}>{o.customer_name || '—'}</td>
                        <td style={tdStyle}>{o.product_name || o.product_description || '—'}</td>
                        <td style={tdStyle}>{o.vendor_name || '—'}</td>
                        <td style={tdStyle}>
                          <span style={{
                            padding: '3px 10px', borderRadius: 12, fontSize: 11, fontWeight: 600,
                            color: '#fff', background: statusColors[o.status] || '#6b7280'
                          }}>
                            {(o.status || '').replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase())}
                          </span>
                        </td>
                        <td style={tdStyle}>{o.eta_date ? new Date(o.eta_date).toLocaleDateString('en-CA') : '—'}</td>
                        <td style={tdStyle}>{o.total_price_cents ? `$${(o.total_price_cents / 100).toFixed(2)}` : '—'}</td>
                        <td style={{ ...tdStyle, textAlign: 'right' }}>
                          <div style={{ display: 'flex', gap: 6, justifyContent: 'flex-end' }}>
                            {o.status === 'ordered' && (
                              <button onClick={() => updateStatus(o.id, 'in_transit')} style={actionBtnStyle('#2563eb')}>
                                In Transit
                              </button>
                            )}
                            {o.status === 'in_transit' && (
                              <button onClick={() => updateStatus(o.id, 'arrived')} style={actionBtnStyle('#10b981')}>
                                Mark Arrived
                              </button>
                            )}
                            {o.status === 'arrived' && (
                              <button onClick={() => updateStatus(o.id, 'customer_notified')} style={actionBtnStyle('#f59e0b')}>
                                Notify Customer
                              </button>
                            )}
                            {o.status === 'customer_notified' && (
                              <button onClick={() => updateStatus(o.id, 'picked_up')} style={actionBtnStyle('#059669')}>
                                Picked Up
                              </button>
                            )}
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Create Form */}
      {tab === 'create' && (
        <div style={{ background: 'white', borderRadius: 12, padding: 24, boxShadow: '0 1px 3px rgba(0,0,0,0.06)', maxWidth: 600 }}>
          <h3 style={{ margin: '0 0 20px', fontSize: 16, fontWeight: 600, color: '#111827' }}>Create Special Order</h3>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
            <div>
              <label style={labelStyle}>Customer ID *</label>
              <input type="number" value={form.customerId} onChange={e => setForm(p => ({ ...p, customerId: e.target.value }))} style={inputStyle} placeholder="Required" />
            </div>
            <div>
              <label style={labelStyle}>Product ID</label>
              <input type="number" value={form.productId} onChange={e => setForm(p => ({ ...p, productId: e.target.value }))} style={inputStyle} placeholder="Optional" />
            </div>
            <div>
              <label style={labelStyle}>Vendor</label>
              <input type="text" value={form.vendorName} onChange={e => setForm(p => ({ ...p, vendorName: e.target.value }))} style={inputStyle} />
            </div>
            <div>
              <label style={labelStyle}>Quantity</label>
              <input type="number" min="1" value={form.quantity} onChange={e => setForm(p => ({ ...p, quantity: e.target.value }))} style={inputStyle} />
            </div>
            <div>
              <label style={labelStyle}>Total Price (cents)</label>
              <input type="number" value={form.totalPriceCents} onChange={e => setForm(p => ({ ...p, totalPriceCents: e.target.value }))} style={inputStyle} />
            </div>
            <div>
              <label style={labelStyle}>Deposit (cents)</label>
              <input type="number" value={form.depositCents} onChange={e => setForm(p => ({ ...p, depositCents: e.target.value }))} style={inputStyle} />
            </div>
            <div>
              <label style={labelStyle}>ETA Date</label>
              <input type="date" value={form.etaDate} onChange={e => setForm(p => ({ ...p, etaDate: e.target.value }))} style={inputStyle} />
            </div>
            <div style={{ gridColumn: '1 / -1' }}>
              <label style={labelStyle}>Notes</label>
              <textarea value={form.notes} onChange={e => setForm(p => ({ ...p, notes: e.target.value }))} style={{ ...inputStyle, resize: 'vertical', minHeight: 72 }} rows={3} />
            </div>
          </div>
          <div style={{ display: 'flex', gap: 12, marginTop: 20 }}>
            <button onClick={createOrder} disabled={creating || !form.customerId} style={{
              padding: '10px 24px', background: creating || !form.customerId ? '#9ca3af' : '#8b5cf6', color: 'white',
              border: 'none', borderRadius: 8, fontSize: 14, fontWeight: 600,
              cursor: creating || !form.customerId ? 'not-allowed' : 'pointer'
            }}>
              {creating ? 'Creating...' : 'Create Order'}
            </button>
            <button onClick={() => { setForm(defaultForm); setTab('list'); }} style={{
              padding: '10px 24px', background: '#e5e7eb', color: '#374151',
              border: 'none', borderRadius: 8, fontSize: 14, fontWeight: 600, cursor: 'pointer'
            }}>
              Cancel
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

const actionBtnStyle = (color) => ({
  padding: '5px 12px', borderRadius: 6, border: 'none', background: color,
  color: '#fff', cursor: 'pointer', fontSize: 12, fontWeight: 500,
  transition: 'opacity 0.15s'
});
