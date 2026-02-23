import React, { useState, useEffect, useCallback } from 'react';
import { authFetch } from '../../services/authFetch';

const API = '/api/audience-sync';

export default function AudienceSyncManager() {
  const [syncs, setSyncs] = useState([]);
  const [logs, setLogs] = useState([]);
  const [showCreate, setShowCreate] = useState(false);
  const [error, setError] = useState('');
  const [form, setForm] = useState({ name: '', platform: 'facebook', externalAudienceId: '', syncFrequencyHours: 24, segmentRules: '{}' });

  const fetchSyncs = useCallback(async () => {
    try {
      const res = await authFetch(API);
      const data = await res.json();
      if (data.success) setSyncs(data.data || []);
    } catch (e) { setError(e.message); }
  }, []);

  useEffect(() => { fetchSyncs(); }, [fetchSyncs]);

  const create = async () => {
    try {
      const res = await authFetch(API, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...form, segmentRules: JSON.parse(form.segmentRules) })
      });
      const data = await res.json();
      if (data.success) { fetchSyncs(); setShowCreate(false); }
      else setError(data.error || 'Failed');
    } catch (e) { setError(e.message); }
  };

  const runSync = async (id) => {
    try {
      const res = await authFetch(`${API}/${id}/run`, { method: 'POST' });
      const data = await res.json();
      if (data.success) alert(`Matched ${data.data?.membersMatched} members`);
      fetchSyncs();
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
        <h2>Audience Sync</h2>
        <button onClick={() => setShowCreate(!showCreate)} style={{ padding: '8px 16px', borderRadius: 8, border: 'none', background: '#2563eb', color: '#fff', cursor: 'pointer' }}>
          {showCreate ? 'Cancel' : 'New Sync'}
        </button>
      </div>
      {error && <div style={{ background: '#fef2f2', color: '#dc2626', padding: 12, borderRadius: 8, marginBottom: 16 }}>{error} <button onClick={() => setError('')}>×</button></div>}

      {showCreate && (
        <div style={{ maxWidth: 500, marginBottom: 24, padding: 16, background: '#f9fafb', borderRadius: 8 }}>
          {[{ key: 'name', label: 'Name' }, { key: 'externalAudienceId', label: 'External Audience ID' }].map(f => (
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
              {['facebook', 'google', 'tiktok'].map(p => <option key={p} value={p}>{p}</option>)}
            </select>
          </div>
          <div style={{ marginBottom: 12 }}>
            <label style={{ display: 'block', marginBottom: 4 }}>Segment Rules (JSON)</label>
            <textarea value={form.segmentRules} onChange={e => setForm(p => ({ ...p, segmentRules: e.target.value }))} rows={3}
              style={{ width: '100%', padding: 8, borderRadius: 8, border: '1px solid #d1d5db', fontFamily: 'monospace' }} />
          </div>
          <button onClick={create} style={{ padding: '10px 24px', borderRadius: 8, border: 'none', background: '#2563eb', color: '#fff', cursor: 'pointer' }}>Create</button>
        </div>
      )}

      <table style={{ width: '100%', borderCollapse: 'collapse' }}>
        <thead><tr style={{ borderBottom: '2px solid #e5e7eb', textAlign: 'left' }}>
          <th style={{ padding: 8 }}>Name</th><th style={{ padding: 8 }}>Platform</th><th style={{ padding: 8 }}>Last Sync</th>
          <th style={{ padding: 8 }}>Members</th><th style={{ padding: 8 }}>Frequency</th><th style={{ padding: 8 }}>Actions</th>
        </tr></thead>
        <tbody>
          {syncs.map(s => (
            <tr key={s.id} style={{ borderBottom: '1px solid #f3f4f6' }}>
              <td style={{ padding: 8 }}>{s.name}</td>
              <td style={{ padding: 8 }}>{s.platform}</td>
              <td style={{ padding: 8 }}>{s.last_sync_at ? new Date(s.last_sync_at).toLocaleDateString() : 'Never'}</td>
              <td style={{ padding: 8 }}>{s.last_members_added || 0}</td>
              <td style={{ padding: 8 }}>{s.sync_frequency_hours}h</td>
              <td style={{ padding: 8 }}>
                <button onClick={() => runSync(s.id)} style={{ padding: '4px 8px', borderRadius: 4, border: 'none', background: '#10b981', color: '#fff', cursor: 'pointer', marginRight: 4 }}>Run</button>
                <button onClick={() => viewLogs(s.id)} style={{ padding: '4px 8px', borderRadius: 4, border: '1px solid #d1d5db', background: '#fff', cursor: 'pointer' }}>Logs</button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      {logs.length > 0 && (
        <div style={{ marginTop: 16 }}>
          <h3>Sync Logs</h3>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead><tr style={{ borderBottom: '2px solid #e5e7eb', textAlign: 'left' }}>
              <th style={{ padding: 8 }}>Date</th><th style={{ padding: 8 }}>Status</th><th style={{ padding: 8 }}>Matched</th><th style={{ padding: 8 }}>Added</th><th style={{ padding: 8 }}>Removed</th>
            </tr></thead>
            <tbody>
              {logs.map(l => (
                <tr key={l.id} style={{ borderBottom: '1px solid #f3f4f6' }}>
                  <td style={{ padding: 8 }}>{new Date(l.started_at).toLocaleString()}</td>
                  <td style={{ padding: 8 }}><span style={{ padding: '2px 8px', borderRadius: 12, fontSize: 12, color: '#fff', background: l.status === 'completed' ? '#10b981' : '#ef4444' }}>{l.status}</span></td>
                  <td style={{ padding: 8 }}>{l.members_matched}</td>
                  <td style={{ padding: 8 }}>{l.members_added}</td>
                  <td style={{ padding: 8 }}>{l.members_removed}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
