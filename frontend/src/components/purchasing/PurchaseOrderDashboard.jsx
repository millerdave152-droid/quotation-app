import React, { useState, useEffect, useCallback, useRef } from 'react';
import { authFetch } from '../../services/authFetch';

const API_URL = process.env.REACT_APP_API_URL || '';

const STATUS_COLORS = {
  draft: '#94a3b8', submitted: '#f59e0b', confirmed: '#3b82f6',
  partially_received: '#8b5cf6', received: '#10b981', cancelled: '#ef4444',
};

const PROCUREMENT_COLORS = {
  in_stock: '#10b981', received: '#10b981', on_order: '#3b82f6',
  partially_on_order: '#f59e0b', pending: '#ef4444',
};

// ============================================================================
// PRODUCT SEARCH AUTOCOMPLETE (reusable inline component)
// ============================================================================
function ProductSearchInput({ value, selectedProduct, onSelect, onClear, placeholder }) {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState([]);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const debounceRef = useRef(null);
  const wrapperRef = useRef(null);

  useEffect(() => {
    const handleClickOutside = (e) => {
      if (wrapperRef.current && !wrapperRef.current.contains(e.target)) setOpen(false);
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const search = useCallback(async (q) => {
    if (!q || q.length < 2) { setResults([]); return; }
    setLoading(true);
    try {
      const res = await authFetch(`${API_URL}/api/products/search?q=${encodeURIComponent(q)}&limit=15`);
      const data = await res.json();
      setResults(Array.isArray(data) ? data : (data.data || []));
    } catch { setResults([]); }
    finally { setLoading(false); }
  }, []);

  const handleChange = (e) => {
    const v = e.target.value;
    setQuery(v);
    if (selectedProduct) onClear();
    clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => search(v), 250);
    setOpen(true);
  };

  const handleSelect = (product) => {
    onSelect(product);
    setQuery('');
    setResults([]);
    setOpen(false);
  };

  if (selectedProduct) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 12px', borderRadius: 6, border: '1px solid #c7d2fe', background: '#eef2ff', fontSize: 13, height: 42, boxSizing: 'border-box' }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontWeight: 600, color: '#1e293b', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
            {selectedProduct.manufacturer} {selectedProduct.model}
          </div>
          <div style={{ fontSize: 11, color: '#64748b' }}>
            SKU: {selectedProduct.sku || selectedProduct.model || '—'} | Stock: {selectedProduct.qty_on_hand ?? '?'}
            {selectedProduct.cost_cents ? ` | Cost: $${(selectedProduct.cost_cents / 100).toFixed(2)}` : ''}
          </div>
        </div>
        <button type="button" onClick={onClear} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#64748b', fontSize: 18, padding: '0 4px', lineHeight: 1, flexShrink: 0 }} title="Clear">&times;</button>
      </div>
    );
  }

  return (
    <div ref={wrapperRef} style={{ position: 'relative' }}>
      <input
        style={{ padding: '8px 12px', borderRadius: 6, border: '1px solid #d1d5db', fontSize: 14, width: '100%', height: 42, boxSizing: 'border-box' }}
        placeholder={placeholder || 'Search by model, SKU, name...'}
        value={query}
        onChange={handleChange}
        onFocus={() => { if (results.length) setOpen(true); }}
      />
      {open && (results.length > 0 || loading) && (
        <div style={{
          position: 'absolute', top: '100%', left: 0, right: 0, zIndex: 50, marginTop: 4,
          background: '#fff', borderRadius: 8, boxShadow: '0 4px 20px rgba(0,0,0,0.15)',
          border: '1px solid #e2e8f0', maxHeight: 320, overflowY: 'auto',
        }}>
          {loading && <div style={{ padding: 12, fontSize: 13, color: '#94a3b8', textAlign: 'center' }}>Searching...</div>}
          {results.map(p => (
            <div
              key={p.id}
              onClick={() => handleSelect(p)}
              style={{
                padding: '10px 14px', cursor: 'pointer', borderBottom: '1px solid #f1f5f9',
                display: 'flex', justifyContent: 'space-between', alignItems: 'center',
              }}
              onMouseEnter={e => e.currentTarget.style.background = '#f8fafc'}
              onMouseLeave={e => e.currentTarget.style.background = '#fff'}
            >
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontWeight: 600, fontSize: 13, color: '#1e293b' }}>
                  {p.manufacturer} {p.model}
                </div>
                <div style={{ fontSize: 11, color: '#64748b', marginTop: 2 }}>
                  {p.sku && p.sku !== p.model ? `SKU: ${p.sku} | ` : ''}{p.category || 'Uncategorized'}
                  {p.name && !p.name.includes(p.model) ? ` | ${p.name}` : ''}
                </div>
              </div>
              <div style={{ textAlign: 'right', fontSize: 12, flexShrink: 0, marginLeft: 12 }}>
                <div style={{ fontWeight: 600, color: (p.qty_on_hand || 0) > 0 ? '#10b981' : '#ef4444' }}>
                  {p.qty_on_hand ?? 0} in stock
                </div>
                {p.cost_cents ? <div style={{ color: '#64748b' }}>Cost: ${(p.cost_cents / 100).toFixed(2)}</div> : null}
              </div>
            </div>
          ))}
          {!loading && results.length === 0 && query.length >= 2 && (
            <div style={{ padding: 12, fontSize: 13, color: '#94a3b8', textAlign: 'center' }}>No products found</div>
          )}
        </div>
      )}
    </div>
  );
}

// ============================================================================
// DEMAND CHIP — shows customer demand for a product inline
// ============================================================================
function DemandChip({ productId }) {
  const [demand, setDemand] = useState(null);
  const [loading, setLoading] = useState(false);
  const fetched = useRef(false);

  useEffect(() => {
    if (!productId || fetched.current) return;
    fetched.current = true;
    setLoading(true);
    authFetch(`${API_URL}/api/purchase-orders/demand/${productId}`)
      .then(r => r.json())
      .then(data => { if (data.success !== false && Array.isArray(data.data) && data.data.length) setDemand(data.data); })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [productId]);

  // Reset when productId changes
  useEffect(() => { fetched.current = false; setDemand(null); }, [productId]);

  if (loading) return <span style={{ fontSize: 11, color: '#94a3b8' }}>Loading demand...</span>;
  if (!demand || !demand.length) return null;

  const totalQty = demand.reduce((s, d) => s + (d.quantity || 0), 0);
  const unallocated = demand.reduce((s, d) => s + (d.quantity_unallocated || d.quantity || 0), 0);

  return (
    <div style={{ marginTop: 6, padding: '6px 10px', borderRadius: 6, background: '#fffbeb', border: '1px solid #fde68a', fontSize: 12 }}>
      <div style={{ fontWeight: 600, color: '#92400e', marginBottom: 2 }}>
        Customer Demand: {totalQty} unit(s) across {demand.length} order(s)
        {unallocated > 0 && <span style={{ color: '#dc2626' }}> ({unallocated} unallocated)</span>}
      </div>
      {demand.slice(0, 4).map((d, i) => (
        <div key={i} style={{ color: '#78716c', fontSize: 11, marginTop: 1 }}>
          {d.order_number} — {d.customer_name}: {d.quantity} unit(s)
          <span style={{ marginLeft: 6, color: PROCUREMENT_COLORS[d.procurement_status] || '#6b7280' }}>
            [{d.procurement_status || 'pending'}]
          </span>
        </div>
      ))}
      {demand.length > 4 && <div style={{ fontSize: 11, color: '#94a3b8' }}>+{demand.length - 4} more orders</div>}
    </div>
  );
}

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
  const [locations, setLocations] = useState([]);
  const [suggestions, setSuggestions] = useState([]);
  const [demandBoard, setDemandBoard] = useState([]);
  const [linkedOrders, setLinkedOrders] = useState([]);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  // Create PO form — items now carry selected product objects
  const emptyItem = () => ({ productId: '', product: null, quantityOrdered: '', unitCostCents: '' });
  const [createForm, setCreateForm] = useState({ vendorId: '', locationId: '', expectedDate: '', notes: '', items: [emptyItem()] });

  // Receiving form
  const [receiveItems, setReceiveItems] = useState([]);

  const inputBase = { padding: '8px 12px', borderRadius: 6, border: '1px solid #d1d5db', fontSize: 14, width: '100%', boxSizing: 'border-box' };

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
    card: { background: '#fff', borderRadius: 12, boxShadow: '0 1px 3px rgba(0,0,0,0.08)', padding: 24, marginBottom: 16 },
    input: { ...inputBase },
    inputTall: { ...inputBase, height: 42 },
    select: { ...inputBase },
    selectTall: { ...inputBase, height: 42 },
    btn: { padding: '8px 16px', borderRadius: 6, border: 'none', fontWeight: 600, cursor: 'pointer', fontSize: 14, background: '#667eea', color: '#fff' },
    btnSm: { padding: '4px 10px', borderRadius: 4, border: 'none', cursor: 'pointer', fontSize: 12, background: '#e2e8f0', color: '#475569' },
    btnDanger: { padding: '4px 10px', borderRadius: 4, border: 'none', cursor: 'pointer', fontSize: 12, background: '#fee2e2', color: '#dc2626' },
    btnSuccess: { padding: '4px 10px', borderRadius: 4, border: 'none', cursor: 'pointer', fontSize: 12, background: '#d1fae5', color: '#059669' },
    badge: (status) => ({
      display: 'inline-block', padding: '2px 8px', borderRadius: 12, fontSize: 12, fontWeight: 600,
      background: (STATUS_COLORS[status] || '#6b7280') + '20', color: STATUS_COLORS[status] || '#6b7280',
    }),
    label: { fontSize: 13, fontWeight: 600, display: 'block', marginBottom: 6, color: '#334155' },
    labelSm: { fontSize: 12, fontWeight: 600, color: '#64748b', marginBottom: 6, display: 'block', textTransform: 'uppercase', letterSpacing: '0.03em' },
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
        fetchLinkedOrders(poId);
        // Set up receiving form
        setReceiveItems((data.data.items || []).map(it => ({
          purchaseOrderItemId: it.id,
          productName: it.product_name,
          productSku: it.product_sku || it.product_model || '',
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

  const fetchLocations = useCallback(async () => {
    try {
      const res = await authFetch(`${API_URL}/api/locations`);
      const data = await res.json();
      if (data.success !== false) setLocations(data.data || []);
    } catch (err) { /* ignore */ }
  }, []);

  const fetchSuggestions = useCallback(async () => {
    try {
      const res = await authFetch(`${API_URL}/api/purchase-orders/suggestions`);
      const data = await res.json();
      if (data.success !== false) setSuggestions(data.data || []);
    } catch (err) { /* ignore */ }
  }, []);

  const fetchDemandBoard = useCallback(async () => {
    try {
      const res = await authFetch(`${API_URL}/api/purchase-orders/demand-board`);
      const data = await res.json();
      if (data.success !== false) setDemandBoard(data.data || []);
    } catch (err) { /* ignore */ }
  }, []);

  const fetchLinkedOrders = async (poId) => {
    try {
      const res = await authFetch(`${API_URL}/api/purchase-orders/${poId}/linked-orders`);
      const data = await res.json();
      if (data.success !== false) setLinkedOrders(data.data || []);
    } catch (err) { setLinkedOrders([]); }
  };

  const createPOFromDemand = async (vendorId) => {
    setError(''); setSuccess('');
    try {
      const res = await authFetch(`${API_URL}/api/purchase-orders/create-from-demand`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ vendorId }),
      });
      const data = await res.json();
      if (res.ok) { setSuccess(`PO ${data.data?.po_number || ''} created from demand`); fetchDemandBoard(); }
      else { setError(data.message || data.error?.message || 'Failed'); }
    } catch (err) { setError(err.message); }
  };

  const autoLinkPO = async (poId) => {
    setError(''); setSuccess('');
    try {
      const res = await authFetch(`${API_URL}/api/purchase-orders/${poId}/link-orders`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' });
      const data = await res.json();
      if (res.ok) { setSuccess(`Linked ${data.data?.linksCreated || 0} order items to PO`); fetchLinkedOrders(poId); }
      else { setError(data.message || data.error?.message || 'Failed'); }
    } catch (err) { setError(err.message); }
  };

  const createPO = async (e) => {
    e.preventDefault();
    setError(''); setSuccess('');
    try {
      const items = createForm.items
        .filter(i => i.productId && i.quantityOrdered && i.unitCostCents)
        .map(i => ({
          productId: parseInt(i.productId),
          quantityOrdered: parseInt(i.quantityOrdered),
          unitCostCents: parseInt(i.unitCostCents),
        }));
      if (!items.length) { setError('Add at least one complete line item (product, qty, cost)'); return; }
      const res = await authFetch(`${API_URL}/api/purchase-orders`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          vendorId: parseInt(createForm.vendorId),
          locationId: createForm.locationId ? parseInt(createForm.locationId) : null,
          items,
          expectedDate: createForm.expectedDate || null,
          notes: createForm.notes || null,
        }),
      });
      const data = await res.json();
      if (res.ok) {
        setSuccess(`PO ${data.data?.po_number || ''} created`);
        setCreateForm({ vendorId: '', locationId: '', expectedDate: '', notes: '', items: [emptyItem()] });
        fetchPOs();
      } else { setError(data.message || data.error?.message || 'Failed'); }
    } catch (err) { setError(err.message); }
  };

  const changePOStatus = async (poId, action) => {
    setError(''); setSuccess('');
    try {
      const res = await authFetch(`${API_URL}/api/purchase-orders/${poId}/${action}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({}) });
      const data = await res.json();
      if (res.ok) { setSuccess(`PO ${action} successful`); fetchPODetail(poId); } else { setError(data.message || data.error?.message || 'Failed'); }
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
      else { setError(data.message || data.error?.message || 'Failed'); }
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
      if (res.ok) { setSuccess(`Goods received: ${data.data?.receipt?.receipt_number || ''}`); fetchPODetail(poId); } else { setError(data.message || data.error?.message || 'Failed'); }
    } catch (err) { setError(err.message); }
  };

  useEffect(() => {
    if (tab === 'dashboard') { fetchStats(); }
    if (tab === 'orders') { fetchPOs(); }
    if (tab === 'receiving') { fetchReceivingQueue(); }
    if (tab === 'vendors') { fetchVendors(); }
    if (tab === 'suggestions') { fetchSuggestions(); }
    if (tab === 'create') { fetchVendors(); fetchLocations(); }
    if (tab === 'demand') { fetchDemandBoard(); }
  }, [tab, fetchStats, fetchPOs, fetchReceivingQueue, fetchVendors, fetchLocations, fetchSuggestions, fetchDemandBoard]);

  const formatCents = (c) => `$${((c || 0) / 100).toFixed(2)}`;

  // Helpers for create form item updates
  const updateItem = (index, field, value) => {
    const items = [...createForm.items];
    items[index] = { ...items[index], [field]: value };
    setCreateForm({ ...createForm, items });
  };

  const selectProduct = (index, product) => {
    const items = [...createForm.items];
    items[index] = {
      ...items[index],
      productId: product.id,
      product,
      unitCostCents: items[index].unitCostCents || (product.cost_cents ? String(product.cost_cents) : ''),
    };
    setCreateForm({ ...createForm, items });
  };

  const clearProduct = (index) => {
    const items = [...createForm.items];
    items[index] = { ...items[index], productId: '', product: null };
    setCreateForm({ ...createForm, items });
  };

  return (
    <div style={styles.container}>
      <div style={styles.header}>
        <h1 style={styles.title}>Purchase Orders</h1>
        <div style={styles.tabs}>
          {['dashboard', 'orders', 'demand', 'create', 'receiving', 'vendors', 'suggestions'].map(t => (
            <button key={t} style={styles.tab(tab === t || (t === 'detail' && tab === 'detail'))} onClick={() => setTab(t)}>
              {t === 'create' ? 'New PO' : t === 'demand' ? 'Demand Board' : t.charAt(0).toUpperCase() + t.slice(1).replace('_', ' ')}
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

      {/* ================================================================== */}
      {/* CREATE PO — with product search and demand context                 */}
      {/* ================================================================== */}
      {tab === 'create' && (
        <div style={styles.card}>
          <h3 style={{ fontSize: 20, fontWeight: 700, marginBottom: 28, color: '#1e293b' }}>Create Purchase Order</h3>
          <form onSubmit={createPO}>
            {/* Header fields */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 20, marginBottom: 20 }}>
              <div>
                <label style={styles.label}>Vendor *</label>
                <select style={styles.selectTall} value={createForm.vendorId} onChange={e => setCreateForm({ ...createForm, vendorId: e.target.value })} required>
                  <option value="">Select vendor...</option>
                  {vendors.map(v => <option key={v.id} value={v.id}>{v.name} ({v.code})</option>)}
                </select>
              </div>
              <div>
                <label style={styles.label}>Delivery Location</label>
                <select style={styles.selectTall} value={createForm.locationId} onChange={e => setCreateForm({ ...createForm, locationId: e.target.value })}>
                  <option value="">Default (any)</option>
                  {locations.map(l => <option key={l.id} value={l.id}>{l.name}{l.code ? ` (${l.code})` : ''}</option>)}
                </select>
              </div>
              <div>
                <label style={styles.label}>Expected Date</label>
                <input style={styles.inputTall} type="date" value={createForm.expectedDate} onChange={e => setCreateForm({ ...createForm, expectedDate: e.target.value })} />
              </div>
            </div>
            <div style={{ marginBottom: 24 }}>
              <label style={styles.label}>Notes</label>
              <textarea style={{ ...styles.input, minHeight: 72, resize: 'vertical' }} value={createForm.notes} onChange={e => setCreateForm({ ...createForm, notes: e.target.value })} placeholder="Internal notes for this purchase order..." />
            </div>

            {/* Divider */}
            <div style={{ borderTop: '2px solid #e2e8f0', marginBottom: 24 }} />

            {/* Line Items */}
            <h4 style={{ fontSize: 16, fontWeight: 700, color: '#1e293b', marginTop: 0, marginBottom: 16 }}>Line Items</h4>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 16, marginBottom: 20 }}>
              {createForm.items.map((item, i) => (
                <div key={i} style={{ background: '#f8fafc', borderRadius: 10, padding: 20, border: '1px solid #e2e8f0' }}>
                  {/* Row 1: Product search full width */}
                  <div style={{ marginBottom: 20 }}>
                    <label style={styles.labelSm}>Product</label>
                    <ProductSearchInput
                      value={item.productId}
                      selectedProduct={item.product}
                      onSelect={(p) => selectProduct(i, p)}
                      onClear={() => clearProduct(i)}
                      placeholder="Search by model #, SKU, or product name..."
                    />
                  </div>
                  {/* Row 2: Qty, Cost, Line Total, Remove — all same height */}
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr 100px', gap: 16, alignItems: 'end' }}>
                    <div>
                      <label style={styles.labelSm}>Quantity</label>
                      <input style={styles.inputTall} type="number" min="1" value={item.quantityOrdered}
                        onChange={e => updateItem(i, 'quantityOrdered', e.target.value)} placeholder="0" />
                    </div>
                    <div>
                      <label style={styles.labelSm}>Unit Cost (cents)</label>
                      <input style={styles.inputTall} type="number" min="0" value={item.unitCostCents}
                        onChange={e => updateItem(i, 'unitCostCents', e.target.value)} placeholder="0" />
                    </div>
                    <div>
                      <label style={styles.labelSm}>Line Total</label>
                      <div style={{ height: 42, display: 'flex', alignItems: 'center', padding: '0 12px', borderRadius: 6, background: '#f1f5f9', border: '1px solid #e2e8f0', fontSize: 14, fontWeight: 600, color: '#1e293b', boxSizing: 'border-box' }}>
                        {(item.unitCostCents > 0 && item.quantityOrdered > 0)
                          ? formatCents((parseInt(item.unitCostCents) || 0) * (parseInt(item.quantityOrdered) || 0))
                          : <span style={{ color: '#94a3b8', fontWeight: 400 }}>$0.00</span>
                        }
                      </div>
                    </div>
                    <div>
                      <label style={{ ...styles.labelSm, visibility: 'hidden' }}>&nbsp;</label>
                      <button type="button" style={{ ...styles.btnDanger, width: '100%', height: 42, fontSize: 13, boxSizing: 'border-box' }} onClick={() => {
                        const items = createForm.items.filter((_, idx) => idx !== i);
                        setCreateForm({ ...createForm, items: items.length ? items : [emptyItem()] });
                      }}>Remove</button>
                    </div>
                  </div>
                  {/* Demand context for selected product */}
                  {item.productId && <div style={{ marginTop: 16 }}><DemandChip productId={item.productId} /></div>}
                </div>
              ))}
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <button type="button" style={{ ...styles.btnSm, padding: '10px 20px', fontSize: 13 }} onClick={() => setCreateForm({ ...createForm, items: [...createForm.items, emptyItem()] })}>+ Add Line Item</button>
              <button type="submit" style={{ ...styles.btn, padding: '12px 32px', fontSize: 15 }}>Create PO</button>
            </div>
          </form>
        </div>
      )}

      {/* ================================================================== */}
      {/* PO DETAIL — with demand + linked orders panel                      */}
      {/* ================================================================== */}
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

          {/* Line Items with demand context */}
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
                  <th style={styles.th}>Demand</th>
                </tr>
              </thead>
              <tbody>
                {(selectedPO.items || []).map(it => (
                  <tr key={it.id}>
                    <td style={styles.td}>
                      <div style={{ fontWeight: 600 }}>{it.product_name}</div>
                      <span style={{ fontSize: 12, color: '#94a3b8', fontFamily: 'monospace' }}>{it.product_sku || it.product_model || `ID: ${it.product_id}`}</span>
                    </td>
                    <td style={styles.td}>{it.quantity_ordered}</td>
                    <td style={styles.td}>
                      {it.quantity_received}
                      {it.quantity_received < it.quantity_ordered && (
                        <span style={{ fontSize: 11, color: '#f59e0b', marginLeft: 4 }}>
                          ({it.quantity_ordered - it.quantity_received} pending)
                        </span>
                      )}
                    </td>
                    <td style={styles.td}>{formatCents(it.unit_cost_cents)}</td>
                    <td style={styles.td}>{formatCents(it.total_cents)}</td>
                    <td style={{ ...styles.td, maxWidth: 260 }}>
                      <DemandChip productId={it.product_id} />
                    </td>
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
                      <td style={styles.td}>
                        <div>{ri.productName}</div>
                        {ri.productSku && <div style={{ fontSize: 11, color: '#94a3b8', fontFamily: 'monospace' }}>{ri.productSku}</div>}
                      </td>
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

          {/* Linked Customer Orders */}
          <div style={styles.card}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
              <h4 style={{ fontSize: 16, fontWeight: 600 }}>Linked Customer Orders</h4>
              {!['received', 'cancelled'].includes(selectedPO.status) && (
                <button style={styles.btnSuccess} onClick={() => autoLinkPO(selectedPO.id)}>Auto-Link Orders</button>
              )}
            </div>
            {linkedOrders.length > 0 ? (
              <table style={styles.table}>
                <thead>
                  <tr>
                    <th style={styles.th}>Order #</th>
                    <th style={styles.th}>Customer</th>
                    <th style={styles.th}>Status</th>
                    <th style={styles.th}>Items</th>
                    <th style={styles.th}>Date</th>
                  </tr>
                </thead>
                <tbody>
                  {linkedOrders.map(lo => (
                    <tr key={lo.order_id}>
                      <td style={{ ...styles.td, fontFamily: 'monospace', fontWeight: 600 }}>{lo.order_number}</td>
                      <td style={styles.td}>{lo.customer_name}{lo.customer_company ? ` (${lo.customer_company})` : ''}</td>
                      <td style={styles.td}><span style={styles.badge(lo.order_status)}>{lo.order_status}</span></td>
                      <td style={styles.td}>
                        {(lo.linked_items || []).map((li, idx) => (
                          <div key={idx} style={{ fontSize: 12 }}>
                            {li.productName} — {li.quantityAllocated} unit(s)
                          </div>
                        ))}
                      </td>
                      <td style={styles.td}>{lo.order_date ? new Date(lo.order_date).toLocaleDateString() : '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            ) : (
              <div style={{ textAlign: 'center', color: '#94a3b8', padding: 20, fontSize: 13 }}>
                No customer orders linked to this PO
              </div>
            )}
          </div>
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

      {/* DEMAND BOARD */}
      {tab === 'demand' && (
        <div>
          <div style={styles.card}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
              <h3 style={{ fontSize: 18, fontWeight: 600 }}>Order Demand Board</h3>
              <span style={{ fontSize: 13, color: '#64748b' }}>
                Products with unfulfilled customer order demand
              </span>
            </div>
            {demandBoard.length > 0 ? (
              <table style={styles.table}>
                <thead>
                  <tr>
                    <th style={styles.th}>Product</th>
                    <th style={styles.th}>Vendor</th>
                    <th style={styles.th}>On Hand</th>
                    <th style={styles.th}>Reorder Pt</th>
                    <th style={styles.th}>Orders</th>
                    <th style={styles.th}>Demanded</th>
                    <th style={styles.th}>Unallocated</th>
                    <th style={styles.th}>On Order</th>
                    <th style={styles.th}>Net Gap</th>
                    <th style={styles.th}>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {demandBoard.map(d => (
                    <tr key={d.product_id}>
                      <td style={styles.td}>
                        {d.product_name}
                        <br/><span style={{ fontSize: 11, color: '#94a3b8', fontFamily: 'monospace' }}>{d.sku}</span>
                      </td>
                      <td style={styles.td}>{d.vendor_name || '—'}</td>
                      <td style={{ ...styles.td, fontWeight: 600, color: d.qty_on_hand <= 0 ? '#ef4444' : '#1e293b' }}>{d.qty_on_hand}</td>
                      <td style={styles.td}>{d.reorder_point || '—'}</td>
                      <td style={{ ...styles.td, fontWeight: 600 }}>{d.order_count}</td>
                      <td style={styles.td}>{d.total_demanded}</td>
                      <td style={{ ...styles.td, fontWeight: 600, color: '#f59e0b' }}>{d.unallocated_demand}</td>
                      <td style={{ ...styles.td, color: '#3b82f6' }}>{d.on_order_qty}</td>
                      <td style={{ ...styles.td, fontWeight: 700, color: d.net_gap > 0 ? '#ef4444' : '#10b981', fontSize: 16 }}>
                        {d.net_gap > 0 ? `+${d.net_gap}` : d.net_gap}
                      </td>
                      <td style={styles.td}>
                        {d.net_gap > 0 && d.vendor_id && (
                          <button style={styles.btnSuccess} onClick={() => createPOFromDemand(d.vendor_id)}>
                            Create PO
                          </button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            ) : (
              <div style={{ textAlign: 'center', color: '#94a3b8', padding: 40 }}>
                No unfulfilled demand — all customer orders are covered
              </div>
            )}
          </div>
          <div style={{ padding: '8px 0', fontSize: 12, color: '#94a3b8' }}>
            <strong>Net Gap</strong> = Demanded - On Hand - On Order. Positive = needs PO.
          </div>
        </div>
      )}
    </div>
  );
}
