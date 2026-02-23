import React, { useState, useEffect, useCallback } from 'react';
import { authFetch } from '../../services/authFetch';

const API = '/api/inventory/counts';

export default function InventoryCount() {
  const [tab, setTab] = useState('list');
  const [counts, setCounts] = useState([]);
  const [selectedCount, setSelectedCount] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  // Form state
  const [locationId, setLocationId] = useState('');
  const [countType, setCountType] = useState('full');
  const [locations, setLocations] = useState([]);

  // Scan entry state
  const [scanBarcode, setScanBarcode] = useState('');
  const [scanQty, setScanQty] = useState('');

  const fetchCounts = useCallback(async () => {
    setLoading(true);
    try {
      const res = await authFetch(API);
      const data = await res.json();
      if (data.success) setCounts(data.data?.counts || []);
    } catch (e) { setError(e.message); }
    setLoading(false);
  }, []);

  const fetchLocations = useCallback(async () => {
    try {
      const res = await authFetch('/api/locations');
      const data = await res.json();
      if (data.success) setLocations(data.data || []);
    } catch (e) { /* ignore */ }
  }, []);

  useEffect(() => { fetchCounts(); fetchLocations(); }, [fetchCounts, fetchLocations]);

  const createCount = async () => {
    if (!locationId) return setError('Select a location');
    try {
      const res = await authFetch(API, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ locationId: parseInt(locationId), countType })
      });
      const data = await res.json();
      if (data.success) { fetchCounts(); setTab('list'); }
      else setError(data.error || 'Failed to create count');
    } catch (e) { setError(e.message); }
  };

  const startCount = async (id) => {
    try {
      const res = await authFetch(`${API}/${id}/start`, { method: 'POST' });
      const data = await res.json();
      if (data.success) { fetchCounts(); loadCount(id); }
    } catch (e) { setError(e.message); }
  };

  const loadCount = async (id) => {
    try {
      const res = await authFetch(`${API}/${id}`);
      const data = await res.json();
      if (data.success) { setSelectedCount(data.data); setTab('detail'); }
    } catch (e) { setError(e.message); }
  };

  const recordScan = async () => {
    if (!selectedCount || !scanBarcode) return;
    try {
      const res = await authFetch(`${API}/${selectedCount.id}/record`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          productId: parseInt(scanBarcode),
          countedQty: parseInt(scanQty) || 1,
          barcode: scanBarcode
        })
      });
      const data = await res.json();
      if (data.success) {
        setScanBarcode('');
        setScanQty('');
        loadCount(selectedCount.id);
      }
    } catch (e) { setError(e.message); }
  };

  const completeCount = async (id) => {
    try {
      await authFetch(`${API}/${id}/complete`, { method: 'POST' });
      loadCount(id);
    } catch (e) { setError(e.message); }
  };

  const approveCount = async (id) => {
    try {
      await authFetch(`${API}/${id}/approve`, { method: 'POST' });
      loadCount(id);
      fetchCounts();
    } catch (e) { setError(e.message); }
  };

  const statusColors = {
    draft: '#6b7280', in_progress: '#2563eb', review: '#f59e0b', approved: '#10b981', cancelled: '#ef4444'
  };

  const tabs = [
    { key: 'list', label: 'Active Counts' },
    { key: 'create', label: 'Create Count' },
    { key: 'detail', label: 'Count Entry', disabled: !selectedCount },
    { key: 'variance', label: 'Variance Review', disabled: !selectedCount },
  ];

  return (
    <div style={{ padding: '24px', maxWidth: 1200 }}>
      <h2 style={{ marginBottom: 16 }}>Inventory Counts</h2>
      {error && <div style={{ background: '#fef2f2', color: '#dc2626', padding: 12, borderRadius: 8, marginBottom: 16 }}>{error} <button onClick={() => setError('')}>×</button></div>}

      <div style={{ display: 'flex', gap: 8, marginBottom: 24 }}>
        {tabs.map(t => (
          <button key={t.key} onClick={() => !t.disabled && setTab(t.key)}
            disabled={t.disabled}
            style={{
              padding: '8px 16px', borderRadius: 8, border: 'none', cursor: t.disabled ? 'not-allowed' : 'pointer',
              background: tab === t.key ? '#2563eb' : '#f3f4f6', color: tab === t.key ? '#fff' : '#374151',
              opacity: t.disabled ? 0.5 : 1
            }}>
            {t.label}
          </button>
        ))}
      </div>

      {tab === 'list' && (
        <div>
          {loading ? <p>Loading...</p> : (
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr style={{ borderBottom: '2px solid #e5e7eb', textAlign: 'left' }}>
                  <th style={{ padding: 8 }}>Count #</th>
                  <th style={{ padding: 8 }}>Location</th>
                  <th style={{ padding: 8 }}>Type</th>
                  <th style={{ padding: 8 }}>Status</th>
                  <th style={{ padding: 8 }}>Items</th>
                  <th style={{ padding: 8 }}>Counted</th>
                  <th style={{ padding: 8 }}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {counts.map(c => (
                  <tr key={c.id} style={{ borderBottom: '1px solid #f3f4f6' }}>
                    <td style={{ padding: 8, fontFamily: 'monospace' }}>{c.count_number}</td>
                    <td style={{ padding: 8 }}>{c.location_name}</td>
                    <td style={{ padding: 8 }}>{c.count_type}</td>
                    <td style={{ padding: 8 }}>
                      <span style={{ padding: '2px 8px', borderRadius: 12, fontSize: 12, color: '#fff', background: statusColors[c.status] || '#6b7280' }}>
                        {c.status}
                      </span>
                    </td>
                    <td style={{ padding: 8 }}>{c.total_items}</td>
                    <td style={{ padding: 8 }}>{c.total_counted}</td>
                    <td style={{ padding: 8 }}>
                      <button onClick={() => loadCount(c.id)} style={{ marginRight: 4, padding: '4px 8px', borderRadius: 4, border: '1px solid #d1d5db', background: '#fff', cursor: 'pointer' }}>View</button>
                      {c.status === 'draft' && <button onClick={() => startCount(c.id)} style={{ padding: '4px 8px', borderRadius: 4, border: 'none', background: '#2563eb', color: '#fff', cursor: 'pointer' }}>Start</button>}
                      {c.status === 'in_progress' && <button onClick={() => completeCount(c.id)} style={{ padding: '4px 8px', borderRadius: 4, border: 'none', background: '#f59e0b', color: '#fff', cursor: 'pointer' }}>Complete</button>}
                      {c.status === 'review' && <button onClick={() => approveCount(c.id)} style={{ padding: '4px 8px', borderRadius: 4, border: 'none', background: '#10b981', color: '#fff', cursor: 'pointer' }}>Approve</button>}
                    </td>
                  </tr>
                ))}
                {counts.length === 0 && <tr><td colSpan={7} style={{ padding: 16, textAlign: 'center', color: '#9ca3af' }}>No counts found</td></tr>}
              </tbody>
            </table>
          )}
        </div>
      )}

      {tab === 'create' && (
        <div style={{ maxWidth: 500 }}>
          <h3>Create New Count</h3>
          <div style={{ marginBottom: 12 }}>
            <label style={{ display: 'block', marginBottom: 4 }}>Location</label>
            <select value={locationId} onChange={e => setLocationId(e.target.value)}
              style={{ width: '100%', padding: 8, borderRadius: 8, border: '1px solid #d1d5db' }}>
              <option value="">Select location...</option>
              {locations.map(l => <option key={l.id} value={l.id}>{l.name}</option>)}
            </select>
          </div>
          <div style={{ marginBottom: 12 }}>
            <label style={{ display: 'block', marginBottom: 4 }}>Count Type</label>
            <select value={countType} onChange={e => setCountType(e.target.value)}
              style={{ width: '100%', padding: 8, borderRadius: 8, border: '1px solid #d1d5db' }}>
              <option value="full">Full Count</option>
              <option value="cycle">Cycle Count</option>
              <option value="spot">Spot Check</option>
              <option value="abc">ABC Count</option>
            </select>
          </div>
          <button onClick={createCount} style={{ padding: '10px 24px', borderRadius: 8, border: 'none', background: '#2563eb', color: '#fff', cursor: 'pointer' }}>
            Create Count
          </button>
        </div>
      )}

      {tab === 'detail' && selectedCount && (
        <div>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
            <h3>{selectedCount.count_number} — {selectedCount.location_name}</h3>
            <span style={{ padding: '4px 12px', borderRadius: 12, color: '#fff', background: statusColors[selectedCount.status] }}>
              {selectedCount.status}
            </span>
          </div>

          {selectedCount.status === 'in_progress' && (
            <div style={{ display: 'flex', gap: 8, marginBottom: 16, padding: 16, background: '#f3f4f6', borderRadius: 8 }}>
              <input value={scanBarcode} onChange={e => setScanBarcode(e.target.value)}
                placeholder="Scan barcode or enter product ID" autoFocus
                onKeyDown={e => e.key === 'Enter' && recordScan()}
                style={{ flex: 1, padding: 8, borderRadius: 8, border: '1px solid #d1d5db' }} />
              <input type="number" value={scanQty} onChange={e => setScanQty(e.target.value)}
                placeholder="Qty" min="0"
                style={{ width: 80, padding: 8, borderRadius: 8, border: '1px solid #d1d5db' }} />
              <button onClick={recordScan} style={{ padding: '8px 16px', borderRadius: 8, border: 'none', background: '#2563eb', color: '#fff', cursor: 'pointer' }}>
                Record
              </button>
            </div>
          )}

          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr style={{ borderBottom: '2px solid #e5e7eb', textAlign: 'left' }}>
                <th style={{ padding: 8 }}>SKU</th>
                <th style={{ padding: 8 }}>Product</th>
                <th style={{ padding: 8, textAlign: 'right' }}>Expected</th>
                <th style={{ padding: 8, textAlign: 'right' }}>Counted</th>
                <th style={{ padding: 8, textAlign: 'right' }}>Variance</th>
              </tr>
            </thead>
            <tbody>
              {(selectedCount.items || []).map(item => (
                <tr key={item.id} style={{ borderBottom: '1px solid #f3f4f6', background: item.variance !== 0 ? '#fef3c7' : 'transparent' }}>
                  <td style={{ padding: 8, fontFamily: 'monospace' }}>{item.sku}</td>
                  <td style={{ padding: 8 }}>{item.product_name}</td>
                  <td style={{ padding: 8, textAlign: 'right' }}>{item.expected_qty}</td>
                  <td style={{ padding: 8, textAlign: 'right' }}>{item.counted_qty ?? '—'}</td>
                  <td style={{ padding: 8, textAlign: 'right', color: item.variance > 0 ? '#10b981' : item.variance < 0 ? '#ef4444' : '#6b7280', fontWeight: item.variance !== 0 ? 600 : 400 }}>
                    {item.variance > 0 ? '+' : ''}{item.variance}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {tab === 'variance' && selectedCount && (
        <div>
          <h3>Variance Review — {selectedCount.count_number}</h3>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 12, marginBottom: 16 }}>
            <div style={{ padding: 16, background: '#f3f4f6', borderRadius: 8, textAlign: 'center' }}>
              <div style={{ fontSize: 24, fontWeight: 700 }}>{selectedCount.total_variance_units || 0}</div>
              <div style={{ color: '#6b7280' }}>Total Variance Units</div>
            </div>
            <div style={{ padding: 16, background: '#f3f4f6', borderRadius: 8, textAlign: 'center' }}>
              <div style={{ fontSize: 24, fontWeight: 700 }}>${((selectedCount.total_variance_cost_cents || 0) / 100).toFixed(2)}</div>
              <div style={{ color: '#6b7280' }}>Variance Cost</div>
            </div>
            <div style={{ padding: 16, background: '#f3f4f6', borderRadius: 8, textAlign: 'center' }}>
              <div style={{ fontSize: 24, fontWeight: 700 }}>{selectedCount.total_items || 0}</div>
              <div style={{ color: '#6b7280' }}>Total Items</div>
            </div>
          </div>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr style={{ borderBottom: '2px solid #e5e7eb', textAlign: 'left' }}>
                <th style={{ padding: 8 }}>Product</th>
                <th style={{ padding: 8, textAlign: 'right' }}>Expected</th>
                <th style={{ padding: 8, textAlign: 'right' }}>Counted</th>
                <th style={{ padding: 8, textAlign: 'right' }}>Variance</th>
                <th style={{ padding: 8, textAlign: 'right' }}>Cost Impact</th>
              </tr>
            </thead>
            <tbody>
              {(selectedCount.items || []).filter(i => i.variance !== 0).map(item => (
                <tr key={item.id} style={{ borderBottom: '1px solid #f3f4f6' }}>
                  <td style={{ padding: 8 }}>{item.product_name} <span style={{ color: '#9ca3af' }}>{item.sku}</span></td>
                  <td style={{ padding: 8, textAlign: 'right' }}>{item.expected_qty}</td>
                  <td style={{ padding: 8, textAlign: 'right' }}>{item.counted_qty}</td>
                  <td style={{ padding: 8, textAlign: 'right', color: item.variance > 0 ? '#10b981' : '#ef4444', fontWeight: 600 }}>
                    {item.variance > 0 ? '+' : ''}{item.variance}
                  </td>
                  <td style={{ padding: 8, textAlign: 'right' }}>${((item.variance_cost_cents || 0) / 100).toFixed(2)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
