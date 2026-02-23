import React, { useState, useEffect, useCallback } from 'react';
import { authFetch } from '../../services/authFetch';

const API = '/api/work-orders';

export default function WorkOrderDashboard() {
  const [tab, setTab] = useState('dashboard');
  const [workOrders, setWorkOrders] = useState([]);
  const [selected, setSelected] = useState(null);
  const [stats, setStats] = useState({});
  const [schedule, setSchedule] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [filter, setFilter] = useState({ status: '', workType: '' });

  // Create form
  const [form, setForm] = useState({
    customerId: '', workType: 'delivery', priority: 'normal', scheduledDate: '',
    description: '', addressLine1: '', city: '', province: '', postalCode: ''
  });

  const fetchStats = useCallback(async () => {
    try {
      const res = await authFetch(`${API}/stats`);
      const data = await res.json();
      if (data.success) setStats(data.data || {});
    } catch (e) { /* ignore */ }
  }, []);

  const fetchWorkOrders = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (filter.status) params.set('status', filter.status);
      if (filter.workType) params.set('workType', filter.workType);
      const res = await authFetch(`${API}?${params}`);
      const data = await res.json();
      if (data.success) setWorkOrders(data.data?.workOrders || []);
    } catch (e) { setError(e.message); }
    setLoading(false);
  }, [filter]);

  const fetchSchedule = useCallback(async () => {
    try {
      const res = await authFetch(`${API}/schedule`);
      const data = await res.json();
      if (data.success) setSchedule(data.data || []);
    } catch (e) { /* ignore */ }
  }, []);

  useEffect(() => { fetchStats(); fetchWorkOrders(); fetchSchedule(); }, [fetchStats, fetchWorkOrders, fetchSchedule]);

  const loadWO = async (id) => {
    try {
      const res = await authFetch(`${API}/${id}`);
      const data = await res.json();
      if (data.success) { setSelected(data.data); setTab('detail'); }
    } catch (e) { setError(e.message); }
  };

  const createWO = async () => {
    if (!form.customerId) return setError('Customer is required');
    try {
      const res = await authFetch(API, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form)
      });
      const data = await res.json();
      if (data.success) { fetchWorkOrders(); fetchStats(); setTab('list'); }
      else setError(data.error || 'Failed to create');
    } catch (e) { setError(e.message); }
  };

  const transitionStatus = async (id, status) => {
    try {
      const res = await authFetch(`${API}/${id}/status`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status })
      });
      const data = await res.json();
      if (data.success) { loadWO(id); fetchStats(); fetchWorkOrders(); }
    } catch (e) { setError(e.message); }
  };

  const statusColors = {
    draft: '#6b7280', scheduled: '#8b5cf6', assigned: '#2563eb', in_progress: '#f59e0b',
    on_hold: '#ef4444', completed: '#10b981', closed: '#374151', cancelled: '#dc2626'
  };

  const priorityColors = { low: '#6b7280', normal: '#2563eb', high: '#f59e0b', urgent: '#ef4444' };

  const tabs = [
    { key: 'dashboard', label: 'Dashboard' },
    { key: 'list', label: 'All Work Orders' },
    { key: 'create', label: 'Create WO' },
    { key: 'detail', label: 'Detail', disabled: !selected },
    { key: 'schedule', label: 'Schedule' },
  ];

  return (
    <div style={{ padding: '24px', maxWidth: 1200 }}>
      <h2 style={{ marginBottom: 16 }}>Work Orders</h2>
      {error && <div style={{ background: '#fef2f2', color: '#dc2626', padding: 12, borderRadius: 8, marginBottom: 16 }}>{error} <button onClick={() => setError('')}>×</button></div>}

      <div style={{ display: 'flex', gap: 8, marginBottom: 24 }}>
        {tabs.map(t => (
          <button key={t.key} onClick={() => !t.disabled && setTab(t.key)} disabled={t.disabled}
            style={{
              padding: '8px 16px', borderRadius: 8, border: 'none', cursor: t.disabled ? 'not-allowed' : 'pointer',
              background: tab === t.key ? '#2563eb' : '#f3f4f6', color: tab === t.key ? '#fff' : '#374151',
              opacity: t.disabled ? 0.5 : 1
            }}>
            {t.label}
          </button>
        ))}
      </div>

      {tab === 'dashboard' && (
        <div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: 12, marginBottom: 24 }}>
            {[
              { label: 'Active', value: stats.active_count, color: '#2563eb' },
              { label: 'In Progress', value: stats.in_progress_count, color: '#f59e0b' },
              { label: 'Today Scheduled', value: stats.today_scheduled, color: '#8b5cf6' },
              { label: 'Urgent', value: stats.urgent_count, color: '#ef4444' },
              { label: 'Completed (7d)', value: stats.completed_this_week, color: '#10b981' },
            ].map(s => (
              <div key={s.label} style={{ padding: 16, background: '#f9fafb', borderRadius: 8, textAlign: 'center', borderLeft: `4px solid ${s.color}` }}>
                <div style={{ fontSize: 28, fontWeight: 700, color: s.color }}>{s.value || 0}</div>
                <div style={{ color: '#6b7280', fontSize: 13 }}>{s.label}</div>
              </div>
            ))}
          </div>

          <h3>Today's Schedule</h3>
          {schedule.filter(s => s.scheduled_date === new Date().toISOString().slice(0, 10)).length === 0 ?
            <p style={{ color: '#9ca3af' }}>No work orders scheduled for today</p> :
            schedule.filter(s => s.scheduled_date === new Date().toISOString().slice(0, 10)).map(wo => (
              <div key={wo.id} onClick={() => loadWO(wo.id)} style={{ padding: 12, border: '1px solid #e5e7eb', borderRadius: 8, marginBottom: 8, cursor: 'pointer' }}>
                <strong>{wo.wo_number}</strong> — {wo.customer_name} — {wo.work_type}
                <span style={{ float: 'right', padding: '2px 8px', borderRadius: 12, fontSize: 12, color: '#fff', background: statusColors[wo.status] }}>{wo.status}</span>
              </div>
            ))
          }
        </div>
      )}

      {tab === 'list' && (
        <div>
          <div style={{ display: 'flex', gap: 8, marginBottom: 16 }}>
            <select value={filter.status} onChange={e => setFilter(f => ({ ...f, status: e.target.value }))}
              style={{ padding: 8, borderRadius: 8, border: '1px solid #d1d5db' }}>
              <option value="">All Statuses</option>
              {['draft','scheduled','assigned','in_progress','on_hold','completed','closed','cancelled'].map(s => (
                <option key={s} value={s}>{s.replace(/_/g, ' ')}</option>
              ))}
            </select>
            <select value={filter.workType} onChange={e => setFilter(f => ({ ...f, workType: e.target.value }))}
              style={{ padding: 8, borderRadius: 8, border: '1px solid #d1d5db' }}>
              <option value="">All Types</option>
              {['delivery','installation','repair','pickup','exchange','warranty_service'].map(t => (
                <option key={t} value={t}>{t.replace(/_/g, ' ')}</option>
              ))}
            </select>
          </div>
          {loading ? <p>Loading...</p> : (
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead><tr style={{ borderBottom: '2px solid #e5e7eb', textAlign: 'left' }}>
                <th style={{ padding: 8 }}>WO #</th><th style={{ padding: 8 }}>Customer</th><th style={{ padding: 8 }}>Type</th>
                <th style={{ padding: 8 }}>Status</th><th style={{ padding: 8 }}>Priority</th><th style={{ padding: 8 }}>Scheduled</th><th style={{ padding: 8 }}>Assigned</th>
              </tr></thead>
              <tbody>
                {workOrders.map(wo => (
                  <tr key={wo.id} onClick={() => loadWO(wo.id)} style={{ borderBottom: '1px solid #f3f4f6', cursor: 'pointer' }}>
                    <td style={{ padding: 8, fontFamily: 'monospace' }}>{wo.wo_number}</td>
                    <td style={{ padding: 8 }}>{wo.customer_name}</td>
                    <td style={{ padding: 8 }}>{wo.work_type}</td>
                    <td style={{ padding: 8 }}><span style={{ padding: '2px 8px', borderRadius: 12, fontSize: 12, color: '#fff', background: statusColors[wo.status] }}>{wo.status}</span></td>
                    <td style={{ padding: 8 }}><span style={{ color: priorityColors[wo.priority] }}>{wo.priority}</span></td>
                    <td style={{ padding: 8 }}>{wo.scheduled_date || '—'}</td>
                    <td style={{ padding: 8 }}>{wo.assigned_to_name || '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      )}

      {tab === 'create' && (
        <div style={{ maxWidth: 600 }}>
          <h3>Create Work Order</h3>
          {[
            { key: 'customerId', label: 'Customer ID', type: 'number' },
            { key: 'description', label: 'Description', type: 'textarea' },
            { key: 'scheduledDate', label: 'Scheduled Date', type: 'date' },
            { key: 'addressLine1', label: 'Address', type: 'text' },
            { key: 'city', label: 'City', type: 'text' },
            { key: 'province', label: 'Province', type: 'text' },
            { key: 'postalCode', label: 'Postal Code', type: 'text' },
          ].map(f => (
            <div key={f.key} style={{ marginBottom: 12 }}>
              <label style={{ display: 'block', marginBottom: 4, fontWeight: 500 }}>{f.label}</label>
              {f.type === 'textarea' ?
                <textarea value={form[f.key]} onChange={e => setForm(prev => ({ ...prev, [f.key]: e.target.value }))}
                  rows={3} style={{ width: '100%', padding: 8, borderRadius: 8, border: '1px solid #d1d5db' }} /> :
                <input type={f.type} value={form[f.key]} onChange={e => setForm(prev => ({ ...prev, [f.key]: e.target.value }))}
                  style={{ width: '100%', padding: 8, borderRadius: 8, border: '1px solid #d1d5db' }} />
              }
            </div>
          ))}
          <div style={{ display: 'flex', gap: 12, marginBottom: 12 }}>
            <div style={{ flex: 1 }}>
              <label style={{ display: 'block', marginBottom: 4, fontWeight: 500 }}>Work Type</label>
              <select value={form.workType} onChange={e => setForm(prev => ({ ...prev, workType: e.target.value }))}
                style={{ width: '100%', padding: 8, borderRadius: 8, border: '1px solid #d1d5db' }}>
                {['delivery','installation','repair','pickup','exchange','warranty_service'].map(t => <option key={t} value={t}>{t.replace(/_/g, ' ')}</option>)}
              </select>
            </div>
            <div style={{ flex: 1 }}>
              <label style={{ display: 'block', marginBottom: 4, fontWeight: 500 }}>Priority</label>
              <select value={form.priority} onChange={e => setForm(prev => ({ ...prev, priority: e.target.value }))}
                style={{ width: '100%', padding: 8, borderRadius: 8, border: '1px solid #d1d5db' }}>
                {['low','normal','high','urgent'].map(p => <option key={p} value={p}>{p}</option>)}
              </select>
            </div>
          </div>
          <button onClick={createWO} style={{ padding: '10px 24px', borderRadius: 8, border: 'none', background: '#2563eb', color: '#fff', cursor: 'pointer' }}>Create Work Order</button>
        </div>
      )}

      {tab === 'detail' && selected && (
        <div>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
            <div>
              <h3 style={{ margin: 0 }}>{selected.wo_number}</h3>
              <span style={{ color: '#6b7280' }}>{selected.work_type} — {selected.customer_name}</span>
            </div>
            <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
              <span style={{ padding: '4px 12px', borderRadius: 12, color: '#fff', background: statusColors[selected.status] }}>{selected.status}</span>
              <span style={{ color: priorityColors[selected.priority], fontWeight: 600 }}>{selected.priority}</span>
            </div>
          </div>

          {selected.description && <p style={{ background: '#f9fafb', padding: 12, borderRadius: 8 }}>{selected.description}</p>}

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 16 }}>
            <div><strong>Scheduled:</strong> {selected.scheduled_date || 'Not scheduled'}</div>
            <div><strong>Assigned to:</strong> {selected.assigned_to_name || 'Unassigned'}</div>
            <div><strong>Location:</strong> {selected.location_name || '—'}</div>
            <div><strong>Billed to:</strong> {selected.billed_to}</div>
            <div><strong>Labor:</strong> ${((selected.labor_cost_cents || 0) / 100).toFixed(2)}</div>
            <div><strong>Parts:</strong> ${((selected.parts_cost_cents || 0) / 100).toFixed(2)}</div>
          </div>

          {selected.address_line1 && (
            <div style={{ marginBottom: 16, padding: 12, background: '#f3f4f6', borderRadius: 8 }}>
              <strong>Address:</strong> {selected.address_line1}{selected.address_line2 ? `, ${selected.address_line2}` : ''}, {selected.city}, {selected.province} {selected.postal_code}
            </div>
          )}

          <div style={{ display: 'flex', gap: 8, marginBottom: 16 }}>
            {selected.status === 'draft' && <button onClick={() => transitionStatus(selected.id, 'scheduled')} style={{ padding: '8px 16px', borderRadius: 8, border: 'none', background: '#8b5cf6', color: '#fff', cursor: 'pointer' }}>Schedule</button>}
            {selected.status === 'assigned' && <button onClick={() => transitionStatus(selected.id, 'in_progress')} style={{ padding: '8px 16px', borderRadius: 8, border: 'none', background: '#f59e0b', color: '#fff', cursor: 'pointer' }}>Start Work</button>}
            {selected.status === 'in_progress' && <button onClick={() => transitionStatus(selected.id, 'completed')} style={{ padding: '8px 16px', borderRadius: 8, border: 'none', background: '#10b981', color: '#fff', cursor: 'pointer' }}>Complete</button>}
            {selected.status === 'completed' && <button onClick={() => transitionStatus(selected.id, 'closed')} style={{ padding: '8px 16px', borderRadius: 8, border: 'none', background: '#374151', color: '#fff', cursor: 'pointer' }}>Close</button>}
            {!['completed','closed','cancelled'].includes(selected.status) && <button onClick={() => transitionStatus(selected.id, 'cancelled')} style={{ padding: '8px 16px', borderRadius: 8, border: '1px solid #ef4444', background: '#fff', color: '#ef4444', cursor: 'pointer' }}>Cancel</button>}
          </div>

          {selected.items?.length > 0 && (
            <>
              <h4>Items</h4>
              <table style={{ width: '100%', borderCollapse: 'collapse', marginBottom: 16 }}>
                <thead><tr style={{ borderBottom: '2px solid #e5e7eb', textAlign: 'left' }}>
                  <th style={{ padding: 8 }}>Item</th><th style={{ padding: 8 }}>Type</th><th style={{ padding: 8 }}>Qty</th><th style={{ padding: 8, textAlign: 'right' }}>Cost</th>
                </tr></thead>
                <tbody>
                  {selected.items.map(item => (
                    <tr key={item.id} style={{ borderBottom: '1px solid #f3f4f6' }}>
                      <td style={{ padding: 8 }}>{item.product_name || item.description || item.serial_number}</td>
                      <td style={{ padding: 8 }}>{item.item_type}</td>
                      <td style={{ padding: 8 }}>{item.quantity}</td>
                      <td style={{ padding: 8, textAlign: 'right' }}>${((item.unit_cost_cents || 0) / 100).toFixed(2)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </>
          )}

          {selected.history?.length > 0 && (
            <>
              <h4>Status History</h4>
              {selected.history.map(h => (
                <div key={h.id} style={{ padding: 8, borderLeft: '2px solid #e5e7eb', marginBottom: 4, marginLeft: 8 }}>
                  {h.from_status && <span style={{ color: '#9ca3af' }}>{h.from_status} → </span>}
                  <strong>{h.to_status}</strong>
                  <span style={{ color: '#9ca3af', marginLeft: 8 }}>{h.changed_by_name} — {new Date(h.created_at).toLocaleString()}</span>
                  {h.notes && <div style={{ fontSize: 13, color: '#6b7280' }}>{h.notes}</div>}
                </div>
              ))}
            </>
          )}
        </div>
      )}

      {tab === 'schedule' && (
        <div>
          <h3>Schedule</h3>
          {schedule.length === 0 ? <p style={{ color: '#9ca3af' }}>No scheduled work orders</p> :
            schedule.map(wo => (
              <div key={wo.id} onClick={() => loadWO(wo.id)} style={{ padding: 12, border: '1px solid #e5e7eb', borderRadius: 8, marginBottom: 8, cursor: 'pointer', display: 'flex', justifyContent: 'space-between' }}>
                <div>
                  <strong>{wo.wo_number}</strong> — {wo.customer_name}
                  <div style={{ fontSize: 13, color: '#6b7280' }}>{wo.work_type} {wo.scheduled_time_start ? `at ${wo.scheduled_time_start}` : ''}</div>
                </div>
                <div style={{ textAlign: 'right' }}>
                  <div>{wo.scheduled_date}</div>
                  <span style={{ padding: '2px 8px', borderRadius: 12, fontSize: 12, color: '#fff', background: statusColors[wo.status] }}>{wo.status}</span>
                </div>
              </div>
            ))
          }
        </div>
      )}
    </div>
  );
}
