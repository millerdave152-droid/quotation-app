import React, { useState, useEffect, useCallback } from 'react';
import { authFetch } from '../../services/authFetch';

const API = '/api/catalog-exports';

export default function CatalogExportManager() {
  const [exports, setExports] = useState([]);
  const [logs, setLogs] = useState([]);
  const [showCreate, setShowCreate] = useState(false);
  const [error, setError] = useState('');
  const [form, setForm] = useState({ name: '', platform: 'facebook', filterRules: '{}', fieldMapping: '{}' });

  const fetchExports = useCallback(async () => {
    try {
      const res = await authFetch(API);
      const data = await res.json();
      if (data.success) setExports(data.data || []);
    } catch (e) { setError(e.message); }
  }, []);

  useEffect(() => { fetchExports(); }, [fetchExports]);

  const create = async () => {
    try {
      const res = await authFetch(API, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...form, filterRules: JSON.parse(form.filterRules), fieldMapping: JSON.parse(form.fieldMapping) })
      });
      const data = await res.json();
      if (data.success) { fetchExports(); setShowCreate(false); }
      else setError(data.error || 'Failed');
    } catch (e) { setError(e.message); }
  };

  const runExport = async (id) => {
    try {
      const res = await authFetch(`${API}/${id}/run`, { method: 'POST' });
      const data = await res.json();
      if (data.success) alert(`Exported ${data.data?.productsExported} products`);
      fetchExports();
    } catch (e) { setError(e.message); }
  };

  const viewLogs = async (id) => {
    try {
      const res = await authFetch(`${API}/${id}/logs`);
      const data = await res.json();
      if (data.success) setLogs(data.data || []);
    } catch (e) { setError(e.message); }
  };

  return (
    <div style={{ padding: '24px', maxWidth: 1200 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 16 }}>
        <h2>Catalog Exports</h2>
        <button onClick={() => setShowCreate(!showCreate)} style={{ padding: '8px 16px', borderRadius: 8, border: 'none', background: '#2563eb', color: '#fff', cursor: 'pointer' }}>
          {showCreate ? 'Cancel' : 'New Export'}
        </button>
      </div>
      {error && <div style={{ background: '#fef2f2', color: '#dc2626', padding: 12, borderRadius: 8, marginBottom: 16 }}>{error} <button onClick={() => setError('')}>×</button></div>}

      {showCreate && (
        <div style={{ maxWidth: 500, marginBottom: 24, padding: 16, background: '#f9fafb', borderRadius: 8 }}>
          {[{ key: 'name', label: 'Name' }].map(f => (
            <div key={f.key} style={{ marginBottom: 12 }}>
              <label style={{ display: 'block', marginBottom: 4 }}>{f.label}</label>
              <input value={form[f.key]} onChange={e => setForm(p => ({ ...p, [f.key]: e.target.value }))}
                style={{ width: '100%', padding: 8, borderRadius: 8, border: '1px solid #d1d5db' }} />
            </div>
          ))}
          <div style={{ marginBottom: 12 }}>
            <label style={{ display: 'block', marginBottom: 4 }}>Platform</label>
            <select value={form.platform} onChange={e => setForm(p => ({ ...p, platform: e.target.value }))}
              style={{ width: '100%', padding: 8, borderRadius: 8, border: '1px solid #d1d5db' }}>
              {['facebook', 'instagram', 'google_shopping', 'pinterest'].map(p => <option key={p} value={p}>{p.replace(/_/g, ' ')}</option>)}
            </select>
          </div>
          <button onClick={create} style={{ padding: '10px 24px', borderRadius: 8, border: 'none', background: '#2563eb', color: '#fff', cursor: 'pointer' }}>Create</button>
        </div>
      )}

      <table style={{ width: '100%', borderCollapse: 'collapse' }}>
        <thead><tr style={{ borderBottom: '2px solid #e5e7eb', textAlign: 'left' }}>
          <th style={{ padding: 8 }}>Name</th><th style={{ padding: 8 }}>Platform</th><th style={{ padding: 8 }}>Last Export</th>
          <th style={{ padding: 8 }}>Products</th><th style={{ padding: 8 }}>Runs</th><th style={{ padding: 8 }}>Actions</th>
        </tr></thead>
        <tbody>
          {exports.map(e => (
            <tr key={e.id} style={{ borderBottom: '1px solid #f3f4f6' }}>
              <td style={{ padding: 8 }}>{e.name}</td>
              <td style={{ padding: 8 }}>{e.platform}</td>
              <td style={{ padding: 8 }}>{e.last_export_at ? new Date(e.last_export_at).toLocaleDateString() : 'Never'}</td>
              <td style={{ padding: 8 }}>{e.last_product_count || 0}</td>
              <td style={{ padding: 8 }}>{e.total_runs}</td>
              <td style={{ padding: 8 }}>
                <button onClick={() => runExport(e.id)} style={{ padding: '4px 8px', borderRadius: 4, border: 'none', background: '#10b981', color: '#fff', cursor: 'pointer', marginRight: 4 }}>Run</button>
                <button onClick={() => viewLogs(e.id)} style={{ padding: '4px 8px', borderRadius: 4, border: '1px solid #d1d5db', background: '#fff', cursor: 'pointer' }}>Logs</button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      {logs.length > 0 && (
        <div style={{ marginTop: 16 }}>
          <h3>Export Logs</h3>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead><tr style={{ borderBottom: '2px solid #e5e7eb', textAlign: 'left' }}>
              <th style={{ padding: 8 }}>Date</th><th style={{ padding: 8 }}>Status</th><th style={{ padding: 8 }}>Products</th><th style={{ padding: 8 }}>Format</th>
            </tr></thead>
            <tbody>
              {logs.map(l => (
                <tr key={l.id} style={{ borderBottom: '1px solid #f3f4f6' }}>
                  <td style={{ padding: 8 }}>{new Date(l.started_at).toLocaleString()}</td>
                  <td style={{ padding: 8 }}><span style={{ padding: '2px 8px', borderRadius: 12, fontSize: 12, color: '#fff', background: l.status === 'completed' ? '#10b981' : '#ef4444' }}>{l.status}</span></td>
                  <td style={{ padding: 8 }}>{l.products_exported}</td>
                  <td style={{ padding: 8 }}>{l.format}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
