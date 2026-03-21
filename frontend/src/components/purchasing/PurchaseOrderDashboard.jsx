import React, { useState, useEffect, useCallback } from 'react';
import { authFetch } from '../../services/authFetch';

const API_URL = process.env.REACT_APP_API_URL || '';

const STATUS_COLORS = {
  draft: '#94a3b8', submitted: '#f59e0b', confirmed: '#3b82f6',
  partially_received: '#8b5cf6', received: '#10b981', cancelled: '#ef4444',
};

// ============================================================================
// MAIN COMPONENT
// ============================================================================
export default function PurchaseOrderDashboard() {
  const [tab, setTab] = useState('dashboard');
  const [stats, setStats] = useState(null);
  const [pos, setPOs] = useState([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);
  const [statusFilter, setStatusFilter] = useState('');
  const [selectedPO, setSelectedPO] = useState(null);
  const [receivingQueue, setReceivingQueue] = useState([]);
  const [vendors, setVendors] = useState([]);
  const [suggestions, setSuggestions] = useState([]);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  // Create PO form
  const [createForm, setCreateForm] = useState({ vendorId: '', locationId: '', expectedDate: '', notes: '', items: [{ productId: '', quantityOrdered: '', unitCostCents: '' }] });

  // Receiving form
  const [receiveItems, setReceiveItems] = useState([]);

  const styles = {
    container: { padding: 24, maxWidth: 1400, margin: '0 auto' },
    header: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24, flexWrap: 'wrap', gap: 12 },
    title: { fontSize: 24, fontWeight: 700, color: '#1e293b' },
    tabs: { display: 'flex', gap: 4, background: '#f1f5f9', borderRadius: 8, padding: 4, flexWrap: 'wrap' },
    tab: (active) => ({
      padding: '8px 14px', borderRadius: 6, cursor: 'pointer', fontWeight: 500, fontSize: 13,
      background: active ? '#fff' : 'transparent', color: active ? '#1e293b' : '#64748b',
      boxShadow: active ? '0 1px 3px rgba(0,0,0,0.1)' : 'none', border: 'none', whiteSpace: 'nowrap',
    }),
    card: { background: '#fff', borderRadius: 12, boxShadow: '0 1px 3px rgba(0,0,0,0.08)', padding: 20, marginBottom: 16 },
    input: { padding: '8px 12px', borderRadius: 6, border: '1px solid #d1d5db', fontSize: 14, width: '100%' },
    select: { padding: '8px 12px', borderRadius: 6, border: '1px solid #d1d5db', fontSize: 14 },
    btn: { padding: '8px 16px', borderRadius: 6, border: 'none', fontWeight: 600, cursor: 'pointer', fontSize: 14, background: '#667eea', color: '#fff' },
    btnSm: { padding: '4px 10px', borderRadius: 4, border: 'none', cursor: 'pointer', fontSize: 12, background: '#e2e8f0', color: '#475569' },
    btnDanger: { padding: '4px 10px', borderRadius: 4, border: 'none', cursor: 'pointer', fontSize: 12, background: '#fee2e2', color: '#dc2626' },
    btnSuccess: { padding: '4px 10px', borderRadius: 4, border: 'none', cursor: 'pointer', fontSize: 12, background: '#d1fae5', color: '#059669' },
    badge: (status) => ({
      display: 'inline-block', padding: '2px 8px', borderRadius: 12, fontSize: 12, fontWeight: 600,
      background: (STATUS_COLORS[status] || '#6b7280') + '20', color: STATUS_COLORS[status] || '#6b7280',
    }),
    table: { width: '100%', borderCollapse: 'collapse' },
    th: { textAlign: 'left', padding: '10px 12px', borderBottom: '2px solid #e2e8f0', fontSize: 12, fontWeight: 600, color: '#64748b', textTransform: 'uppercase' },
    td: { padding: '10px 12px', borderBottom: '1px solid #f1f5f9', fontSize: 14 },
    statCard: (color) => ({
      background: color + '10', borderRadius: 12, padding: 20, textAlign: 'center', borderLeft: `4px solid ${color}`,
    }),
    statValue: { fontSize: 28, fontWeight: 700, color: '#1e293b' },
    statLabel: { fontSize: 13, color: '#64748b', marginTop: 4 },
    alert: (type) => ({
      padding: '10px 16px', borderRadius: 8, marginBottom: 16, fontSize: 14,
      background: type === 'error' ? '#fef2f2' : '#f0fdf4',
      color: type === 'error' ? '#dc2626' : '#16a34a',
      border: `1px solid ${type === 'error' ? '#fecaca' : '#bbf7d0'}`,
    }),
  };

  // ============================================================================
  // API CALLS
  // ============================================================================
  const fetchStats = useCallback(async () => {
    try {
      const res = await authFetch(`${API_URL}/api/purchase-orders/stats`);
      const data = await res.json();
      if (data.success !== false) setStats(data.data);
    } catch (err) { /* ignore */ }
  }, []);

  const fetchPOs = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (statusFilter) params.set('status', statusFilter);
      params.set('limit', '50');
      const res = await authFetch(`${API_URL}/api/purchase-orders?${params}`);
      const data = await res.json();
      if (data.success !== false) { setPOs(data.data?.purchaseOrders || []); setTotal(data.data?.total || 0); }
    } catch (err) { setError(err.message); }
    finally { setLoading(false); }
  }, [statusFilter]);

  const fetchPODetail = async (poId) => {
    try {
      const res = await authFetch(`${API_URL}/api/purchase-orders/${poId}`);
      const data = await res.json();
      if (data.success !== false) {
        setSelectedPO(data.data);
        // Set up receiving form
        setReceiveItems((data.data.items || []).map(it => ({
          purchaseOrderItemId: it.id,
          productName: it.product_name,
          quantityOrdered: it.quantity_ordered,
          quantityReceived: it.quantity_received,
          quantityToReceive: 0,
          quantityDamaged: 0,
          serialNumbers: '',
        })));
        setTab('detail');
      }
    } catch (err) { setError(err.message); }
  };

  const fetchReceivingQueue = useCallback(async () => {
    try {
      const res = await authFetch(`${API_URL}/api/purchase-orders/receiving-queue`);
      const data = await res.json();
      if (data.success !== false) setReceivingQueue(data.data || []);
    } catch (err) { /* ignore */ }
  }, []);

  const fetchVendors = useCallback(async () => {
    try {
      const res = await authFetch(`${API_URL}/api/purchase-orders/vendors/list`);
      const data = await res.json();
      if (data.success !== false) setVendors(data.data || []);
    } catch (err) { /* ignore */ }
  }, []);

  const fetchSuggestions = useCallback(async () => {
    try {
      const res = await authFetch(`${API_URL}/api/purchase-orders/suggestions`);
      const data = await res.json();
      if (data.success !== false) setSuggestions(data.data || []);
    } catch (err) { /* ignore */ }
  }, []);

  const createPO = async (e) => {
    e.preventDefault();
    setError(''); setSuccess('');
    try {
      const items = createForm.items.filter(i => i.productId && i.quantityOrdered && i.unitCostCents).map(i => ({
        productId: parseInt(i.productId), quantityOrdered: parseInt(i.quantityOrdered), unitCostCents: parseInt(i.unitCostCents),
      }));
      if (!items.length) { setError('Add at least one item'); return; }
      const res = await authFetch(`${API_URL}/api/purchase-orders`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ vendorId: parseInt(createForm.vendorId), locationId: createForm.locationId ? parseInt(createForm.locationId) : null, items, expectedDate: createForm.expectedDate || null, notes: createForm.notes || null }),
      });
      const data = await res.json();
      if (res.ok) {
        setSuccess(`PO ${data.data?.po_number || ''} created`);
        setCreateForm({ vendorId: '', locationId: '', expectedDate: '', notes: '', items: [{ productId: '', quantityOrdered: '', unitCostCents: '' }] });
        fetchPOs();
      } else { setError(data.message || 'Failed'); }
    } catch (err) { setError(err.message); }
  };

  const changePOStatus = async (poId, action) => {
    setError(''); setSuccess('');
    try {
      const res = await authFetch(`${API_URL}/api/purchase-orders/${poId}/${action}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({}) });
      const data = await res.json();
      if (res.ok) { setSuccess(`PO ${action} successful`); fetchPODetail(poId); } else { setError(data.message || 'Failed'); }
    } catch (err) { setError(err.message); }
  };

  const createPOFromSuggestions = async (vendorId, products) => {
    setError(''); setSuccess('');
    try {
      const res = await authFetch(`${API_URL}/api/purchase-orders/generate-from-suggestions`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ vendorId, products }),
      });
      const data = await res.json();
      if (res.ok) { setSuccess(`PO ${data.data?.po_number || ''} created from suggestions`); fetchSuggestions(); }
      else { setError(data.message || 'Failed'); }
    } catch (err) { setError(err.message); }
  };

  const receiveGoods = async (poId) => {
    setError(''); setSuccess('');
    try {
      const items = receiveItems.filter(i => i.quantityToReceive > 0).map(i => ({
        purchaseOrderItemId: i.purchaseOrderItemId,
        quantityReceived: parseInt(i.quantityToReceive),
        quantityDamaged: parseInt(i.quantityDamaged) || 0,
        serialNumbers: i.serialNumbers ? i.serialNumbers.split(',').map(s => s.trim()).filter(Boolean) : [],
      }));
      if (!items.length) { setError('Enter quantities to receive'); return; }
      const res = await authFetch(`${API_URL}/api/purchase-orders/${poId}/receive`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ items }),
      });
      const data = await res.json();
      if (res.ok) { setSuccess(`Goods received: ${data.data?.receipt?.receipt_number || ''}`); fetchPODetail(poId); } else { setError(data.message || 'Failed'); }
    } catch (err) { setError(err.message); }
  };

  useEffect(() => {
    if (tab === 'dashboard') { fetchStats(); }
    if (tab === 'orders') { fetchPOs(); }
    if (tab === 'receiving') { fetchReceivingQueue(); }
    if (tab === 'vendors') { fetchVendors(); }
    if (tab === 'suggestions') { fetchSuggestions(); }
    if (tab === 'create') { fetchVendors(); }
  }, [tab, fetchStats, fetchPOs, fetchReceivingQueue, fetchVendors, fetchSuggestions]);

  const formatCents = (c) => `$${((c || 0) / 100).toFixed(2)}`;

  return (
    <div style={styles.container}>
      <div style={styles.header}>
        <h1 style={styles.title}>Purchase Orders</h1>
        <div style={styles.tabs}>
          {['dashboard', 'orders', 'create', 'receiving', 'vendors', 'suggestions'].map(t => (
            <button key={t} style={styles.tab(tab === t || (t === 'detail' && tab === 'detail'))} onClick={() => setTab(t)}>
              {t === 'create' ? 'New PO' : t.charAt(0).toUpperCase() + t.slice(1).replace('_', ' ')}
            </button>
          ))}
          {selectedPO && <button style={styles.tab(tab === 'detail')} onClick={() => setTab('detail')}>PO Detail</button>}
        </div>
      </div>

      {error && <div style={styles.alert('error')}>{error}</div>}
      {success && <div style={styles.alert('success')}>{success}</div>}

      {/* DASHBOARD */}
      {tab === 'dashboard' && stats && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 16 }}>
          <div style={styles.statCard('#3b82f6')}><div style={styles.statValue}>{stats.openPOs}</div><div style={styles.statLabel}>Open POs</div></div>
          <div style={styles.statCard('#8b5cf6')}><div style={styles.statValue}>{stats.pendingReceipts}</div><div style={styles.statLabel}>Pending Receipts</div></div>
          <div style={styles.statCard('#ef4444')}><div style={styles.statValue}>{stats.overduePOs}</div><div style={styles.statLabel}>Overdue POs</div></div>
          <div style={styles.statCard('#10b981')}><div style={styles.statValue}>{formatCents(stats.monthlySpendCents)}</div><div style={styles.statLabel}>Monthly Spend</div></div>
        </div>
      )}

      {/* ORDERS LIST */}
      {tab === 'orders' && (
        <div style={styles.card}>
          <div style={{ display: 'flex', gap: 12, marginBottom: 16 }}>
            <select style={styles.select} value={statusFilter} onChange={e => setStatusFilter(e.target.value)}>
              <option value="">All Statuses</option>
              {['draft','submitted','confirmed','partially_received','received','cancelled'].map(s => <option key={s} value={s}>{s.replace('_', ' ')}</option>)}
            </select>
            <button style={styles.btn} onClick={fetchPOs}>Refresh</button>
          </div>
          <div style={{ fontSize: 13, color: '#64748b', marginBottom: 8 }}>{total} purchase order(s)</div>
          {loading ? <div style={{ textAlign: 'center', padding: 40 }}>Loading...</div> : (
            <table style={styles.table}>
              <thead>
                <tr>
                  <th style={styles.th}>PO Number</th>
                  <th style={styles.th}>Vendor</th>
                  <th style={styles.th}>Status</th>
                  <th style={styles.th}>Total</th>
                  <th style={styles.th}>Expected</th>
                  <th style={styles.th}>Created</th>
                  <th style={styles.th}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {pos.map(po => (
                  <tr key={po.id}>
                    <td style={{ ...styles.td, fontFamily: 'monospace', fontWeight: 600 }}>{po.po_number}</td>
                    <td style={styles.td}>{po.vendor_name}</td>
                    <td style={styles.td}><span style={styles.badge(po.status)}>{po.status.replace('_', ' ')}</span></td>
                    <td style={styles.td}>{formatCents(po.total_cents)}</td>
                    <td style={styles.td}>{po.expected_date ? new Date(po.expected_date).toLocaleDateString() : '-'}</td>
                    <td style={styles.td}>{new Date(po.created_at).toLocaleDateString()}</td>
                    <td style={styles.td}><button style={styles.btnSm} onClick={() => fetchPODetail(po.id)}>View</button></td>
                  </tr>
                ))}
                {!pos.length && <tr><td colSpan={7} style={{ ...styles.td, textAlign: 'center', color: '#94a3b8' }}>No POs found</td></tr>}
              </tbody>
            </table>
          )}
        </div>
      )}

      {/* CREATE PO */}
      {tab === 'create' && (
        <div style={styles.card}>
          <h3 style={{ fontSize: 18, fontWeight: 600, marginBottom: 16 }}>Create Purchase Order</h3>
          <form onSubmit={createPO} style={{ display: 'flex', flexDirection: 'column', gap: 12, maxWidth: 700 }}>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
              <div>
                <label style={{ fontSize: 13, fontWeight: 600, display: 'block', marginBottom: 4 }}>Vendor *</label>
                <select style={{ ...styles.select, width: '100%' }} value={createForm.vendorId} onChange={e => setCreateForm({ ...createForm, vendorId: e.target.value })} required>
                  <option value="">Select vendor...</option>
                  {vendors.map(v => <option key={v.id} value={v.id}>{v.name} ({v.code})</option>)}
                </select>
              </div>
              <div>
                <label style={{ fontSize: 13, fontWeight: 600, display: 'block', marginBottom: 4 }}>Expected Date</label>
                <input style={styles.input} type="date" value={createForm.expectedDate} onChange={e => setCreateForm({ ...createForm, expectedDate: e.target.value })} />
              </div>
            </div>
            <div>
              <label style={{ fontSize: 13, fontWeight: 600, display: 'block', marginBottom: 4 }}>Notes</label>
              <textarea style={{ ...styles.input, minHeight: 50 }} value={createForm.notes} onChange={e => setCreateForm({ ...createForm, notes: e.target.value })} />
            </div>
            <h4 style={{ fontSize: 14, fontWeight: 600, marginTop: 8 }}>Line Items</h4>
            {createForm.items.map((item, i) => (
              <div key={i} style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr auto', gap: 8, alignItems: 'end' }}>
                <div>
                  <label style={{ fontSize: 11, color: '#64748b' }}>Product ID</label>
                  <input style={styles.input} type="number" value={item.productId} onChange={e => { const items = [...createForm.items]; items[i].productId = e.target.value; setCreateForm({ ...createForm, items }); }} />
                </div>
                <div>
                  <label style={{ fontSize: 11, color: '#64748b' }}>Qty</label>
                  <input style={styles.input} type="number" value={item.quantityOrdered} onChange={e => { const items = [...createForm.items]; items[i].quantityOrdered = e.target.value; setCreateForm({ ...createForm, items }); }} />
                </div>
                <div>
                  <label style={{ fontSize: 11, color: '#64748b' }}>Unit Cost (cents)</label>
                  <input style={styles.input} type="number" value={item.unitCostCents} onChange={e => { const items = [...createForm.items]; items[i].unitCostCents = e.target.value; setCreateForm({ ...createForm, items }); }} />
                </div>
                <button type="button" style={styles.btnDanger} onClick={() => { const items = createForm.items.filter((_, idx) => idx !== i); setCreateForm({ ...createForm, items: items.length ? items : [{ productId: '', quantityOrdered: '', unitCostCents: '' }] }); }}>X</button>
              </div>
            ))}
            <button type="button" style={{ ...styles.btnSm, alignSelf: 'flex-start' }} onClick={() => setCreateForm({ ...createForm, items: [...createForm.items, { productId: '', quantityOrdered: '', unitCostCents: '' }] })}>+ Add Item</button>
            <button type="submit" style={{ ...styles.btn, alignSelf: 'flex-start', marginTop: 8 }}>Create PO</button>
          </form>
        </div>
      )}

      {/* PO DETAIL */}
      {tab === 'detail' && selectedPO && (
        <>
          <div style={styles.card}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: 12 }}>
              <div>
                <h3 style={{ fontSize: 20, fontWeight: 700, fontFamily: 'monospace' }}>{selectedPO.po_number}</h3>
                <div style={{ color: '#64748b', marginTop: 4 }}>Vendor: {selectedPO.vendor_name}</div>
                <div style={{ marginTop: 8 }}><span style={styles.badge(selectedPO.status)}>{selectedPO.status.replace('_', ' ')}</span></div>
              </div>
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                {selectedPO.status === 'draft' && <button style={styles.btnSuccess} onClick={() => changePOStatus(selectedPO.id, 'submit')}>Submit</button>}
                {selectedPO.status === 'submitted' && <button style={styles.btnSuccess} onClick={() => changePOStatus(selectedPO.id, 'confirm')}>Confirm</button>}
                {!['received', 'cancelled'].includes(selectedPO.status) && <button style={styles.btnDanger} onClick={() => changePOStatus(selectedPO.id, 'cancel')}>Cancel</button>}
              </div>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: 12, marginTop: 16, fontSize: 13 }}>
              <div><span style={{ color: '#64748b' }}>Total:</span> <strong>{formatCents(selectedPO.total_cents)}</strong></div>
              <div><span style={{ color: '#64748b' }}>Order Date:</span> {selectedPO.order_date ? new Date(selectedPO.order_date).toLocaleDateString() : '-'}</div>
              <div><span style={{ color: '#64748b' }}>Expected:</span> {selectedPO.expected_date ? new Date(selectedPO.expected_date).toLocaleDateString() : '-'}</div>
              <div><span style={{ color: '#64748b' }}>Created By:</span> {selectedPO.created_by_name || '-'}</div>
            </div>
          </div>

          <div style={styles.card}>
            <h4 style={{ fontSize: 16, fontWeight: 600, marginBottom: 12 }}>Line Items</h4>
            <table style={styles.table}>
              <thead>
                <tr>
                  <th style={styles.th}>Product</th>
                  <th style={styles.th}>Ordered</th>
                  <th style={styles.th}>Received</th>
                  <th style={styles.th}>Unit Cost</th>
                  <th style={styles.th}>Total</th>
                </tr>
              </thead>
              <tbody>
                {(selectedPO.items || []).map(it => (
                  <tr key={it.id}>
                    <td style={styles.td}>{it.product_name}<br/><span style={{ fontSize: 12, color: '#94a3b8' }}>{it.product_sku}</span></td>
                    <td style={styles.td}>{it.quantity_ordered}</td>
                    <td style={styles.td}>{it.quantity_received}</td>
                    <td style={styles.td}>{formatCents(it.unit_cost_cents)}</td>
                    <td style={styles.td}>{formatCents(it.total_cents)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Receiving form for confirmed POs */}
          {['confirmed', 'partially_received'].includes(selectedPO.status) && (
            <div style={styles.card}>
              <h4 style={{ fontSize: 16, fontWeight: 600, marginBottom: 12 }}>Receive Goods</h4>
              <table style={styles.table}>
                <thead>
                  <tr>
                    <th style={styles.th}>Product</th>
                    <th style={styles.th}>Remaining</th>
                    <th style={styles.th}>Qty to Receive</th>
                    <th style={styles.th}>Damaged</th>
                    <th style={styles.th}>Serial Numbers</th>
                  </tr>
                </thead>
                <tbody>
                  {receiveItems.map((ri, i) => (
                    <tr key={ri.purchaseOrderItemId}>
                      <td style={styles.td}>{ri.productName}</td>
                      <td style={styles.td}>{ri.quantityOrdered - ri.quantityReceived}</td>
                      <td style={styles.td}>
                        <input style={{ ...styles.input, width: 80 }} type="number" min={0} max={ri.quantityOrdered - ri.quantityReceived}
                          value={ri.quantityToReceive} onChange={e => { const items = [...receiveItems]; items[i].quantityToReceive = e.target.value; setReceiveItems(items); }} />
                      </td>
                      <td style={styles.td}>
                        <input style={{ ...styles.input, width: 60 }} type="number" min={0}
                          value={ri.quantityDamaged} onChange={e => { const items = [...receiveItems]; items[i].quantityDamaged = e.target.value; setReceiveItems(items); }} />
                      </td>
                      <td style={styles.td}>
                        <input style={{ ...styles.input, width: 200 }} placeholder="SN1, SN2, ..."
                          value={ri.serialNumbers} onChange={e => { const items = [...receiveItems]; items[i].serialNumbers = e.target.value; setReceiveItems(items); }} />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <button style={{ ...styles.btn, marginTop: 12 }} onClick={() => receiveGoods(selectedPO.id)}>Receive Goods</button>
            </div>
          )}

          {/* Receipts */}
          {selectedPO.receipts && selectedPO.receipts.length > 0 && (
            <div style={styles.card}>
              <h4 style={{ fontSize: 16, fontWeight: 600, marginBottom: 12 }}>Receiving History</h4>
              <table style={styles.table}>
                <thead>
                  <tr><th style={styles.th}>Receipt #</th><th style={styles.th}>Received By</th><th style={styles.th}>Date</th></tr>
                </thead>
                <tbody>
                  {selectedPO.receipts.map(r => (
                    <tr key={r.id}>
                      <td style={{ ...styles.td, fontFamily: 'monospace' }}>{r.receipt_number}</td>
                      <td style={styles.td}>{r.received_by_name || '-'}</td>
                      <td style={styles.td}>{new Date(r.received_at).toLocaleString()}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}

      {/* RECEIVING QUEUE */}
      {tab === 'receiving' && (
        <div style={styles.card}>
          <h3 style={{ fontSize: 18, fontWeight: 600, marginBottom: 16 }}>Receiving Queue</h3>
          <table style={styles.table}>
            <thead>
              <tr>
                <th style={styles.th}>PO Number</th>
                <th style={styles.th}>Vendor</th>
                <th style={styles.th}>Status</th>
                <th style={styles.th}>Items</th>
                <th style={styles.th}>Units Pending</th>
                <th style={styles.th}>Expected</th>
                <th style={styles.th}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {receivingQueue.map(po => (
                <tr key={po.id}>
                  <td style={{ ...styles.td, fontFamily: 'monospace', fontWeight: 600 }}>{po.po_number}</td>
                  <td style={styles.td}>{po.vendor_name}</td>
                  <td style={styles.td}><span style={styles.badge(po.status)}>{po.status.replace('_', ' ')}</span></td>
                  <td style={styles.td}>{po.item_count}</td>
                  <td style={styles.td}>{po.units_pending}</td>
                  <td style={styles.td}>{po.expected_date ? new Date(po.expected_date).toLocaleDateString() : '-'}</td>
                  <td style={styles.td}><button style={styles.btnSuccess} onClick={() => fetchPODetail(po.id)}>Receive</button></td>
                </tr>
              ))}
              {!receivingQueue.length && <tr><td colSpan={7} style={{ ...styles.td, textAlign: 'center', color: '#94a3b8' }}>No POs awaiting receipt</td></tr>}
            </tbody>
          </table>
        </div>
      )}

      {/* VENDORS */}
      {tab === 'vendors' && (
        <div style={styles.card}>
          <h3 style={{ fontSize: 18, fontWeight: 600, marginBottom: 16 }}>Vendors</h3>
          <table style={styles.table}>
            <thead>
              <tr>
                <th style={styles.th}>Name</th>
                <th style={styles.th}>Code</th>
                <th style={styles.th}>Contact</th>
                <th style={styles.th}>Email</th>
                <th style={styles.th}>Payment Terms</th>
                <th style={styles.th}>Lead Time</th>
              </tr>
            </thead>
            <tbody>
              {vendors.map(v => (
                <tr key={v.id}>
                  <td style={{ ...styles.td, fontWeight: 600 }}>{v.name}</td>
                  <td style={{ ...styles.td, fontFamily: 'monospace' }}>{v.code || '-'}</td>
                  <td style={styles.td}>{v.contact_name || '-'}</td>
                  <td style={styles.td}>{v.contact_email || '-'}</td>
                  <td style={styles.td}>{v.payment_terms_days ? `${v.payment_terms_days} days` : '-'}</td>
                  <td style={styles.td}>{v.lead_time_days ? `${v.lead_time_days} days` : '-'}</td>
                </tr>
              ))}
              {!vendors.length && <tr><td colSpan={6} style={{ ...styles.td, textAlign: 'center', color: '#94a3b8' }}>No vendors found</td></tr>}
            </tbody>
          </table>
        </div>
      )}

      {/* REORDER SUGGESTIONS */}
      {tab === 'suggestions' && (
        <div>
          {suggestions.map(group => (
            <div key={group.vendorId} style={styles.card}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
                <h3 style={{ fontSize: 16, fontWeight: 600 }}>{group.vendorName}</h3>
                {group.vendorId > 0 && (
                  <button style={styles.btnSuccess} onClick={() => createPOFromSuggestions(group.vendorId, group.products)}>Create PO</button>
                )}
              </div>
              <table style={styles.table}>
                <thead>
                  <tr>
                    <th style={styles.th}>Product</th>
                    <th style={styles.th}>SKU</th>
                    <th style={styles.th}>On Hand</th>
                    <th style={styles.th}>Reorder Point</th>
                    <th style={styles.th}>Reorder Qty</th>
                  </tr>
                </thead>
                <tbody>
                  {group.products.map(p => (
                    <tr key={p.product_id}>
                      <td style={styles.td}>{p.product_name}</td>
                      <td style={{ ...styles.td, fontFamily: 'monospace' }}>{p.sku}</td>
                      <td style={{ ...styles.td, color: '#ef4444', fontWeight: 600 }}>{p.qty_on_hand || 0}</td>
                      <td style={styles.td}>{p.reorder_point}</td>
                      <td style={styles.td}>{p.reorder_qty || '-'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ))}
          {!suggestions.length && <div style={styles.card}><div style={{ textAlign: 'center', color: '#94a3b8', padding: 40 }}>No products below reorder point</div></div>}
        </div>
      )}
    </div>
  );
}
