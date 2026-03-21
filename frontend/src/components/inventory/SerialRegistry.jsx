import React, { useState, useEffect, useCallback } from 'react';
import { authFetch } from '../../services/authFetch';

const API_URL = process.env.REACT_APP_API_URL || '';

const STATUS_COLORS = {
  available: '#10b981',
  sold: '#3b82f6',
  returned: '#f59e0b',
  warranty_repair: '#8b5cf6',
  recalled: '#ef4444',
  damaged: '#dc2626',
  scrapped: '#6b7280',
};

const STATUS_OPTIONS = ['available', 'sold', 'returned', 'warranty_repair', 'recalled', 'damaged', 'scrapped'];

// ============================================================================
// MAIN COMPONENT
// ============================================================================
export default function SerialRegistry() {
  const [tab, setTab] = useState('search');
  const [serials, setSerials] = useState([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [selectedSerial, setSelectedSerial] = useState(null);
  const [stats, setStats] = useState(null);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  // Register form state
  const [regForm, setRegForm] = useState({ productId: '', serialNumber: '', locationId: '', notes: '' });

  // ============================================================================
  // API CALLS
  // ============================================================================
  const fetchSerials = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const params = new URLSearchParams();
      if (searchQuery) params.set('q', searchQuery);
      if (statusFilter) params.set('status', statusFilter);
      params.set('limit', '50');
      const res = await authFetch(`${API_URL}/api/serials?${params}`);
      const data = await res.json();
      if (data.success !== false) {
        setSerials(data.data?.serials || []);
        setTotal(data.data?.total || 0);
      }
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [searchQuery, statusFilter]);

  const fetchStats = useCallback(async () => {
    try {
      const res = await authFetch(`${API_URL}/api/serials/stats`);
      const data = await res.json();
      if (data.success !== false) setStats(data.data);
    } catch (err) { /* ignore */ }
  }, []);

  const fetchSerialDetail = async (serialNumber) => {
    try {
      const res = await authFetch(`${API_URL}/api/serials/lookup/${encodeURIComponent(serialNumber)}`);
      const data = await res.json();
      if (data.success !== false) {
        setSelectedSerial(data.data);
        setTab('history');
      }
    } catch (err) {
      setError(err.message);
    }
  };

  const registerSerial = async (e) => {
    e.preventDefault();
    setError('');
    setSuccess('');
    try {
      const res = await authFetch(`${API_URL}/api/serials`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          productId: parseInt(regForm.productId),
          serialNumber: regForm.serialNumber,
          locationId: regForm.locationId ? parseInt(regForm.locationId) : null,
          notes: regForm.notes || null,
        }),
      });
      const data = await res.json();
      if (res.ok) {
        setSuccess(`Serial ${regForm.serialNumber} registered successfully`);
        setRegForm({ productId: '', serialNumber: '', locationId: '', notes: '' });
      } else {
        setError(data.message || 'Registration failed');
      }
    } catch (err) {
      setError(err.message);
    }
  };

  useEffect(() => {
    if (tab === 'search') fetchSerials();
    if (tab === 'stats') fetchStats();
  }, [tab, fetchSerials, fetchStats]);

  // ============================================================================
  // STYLES
  // ============================================================================
  const styles = {
    container: { padding: 24, maxWidth: 1200, margin: '0 auto' },
    header: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24 },
    title: { fontSize: 24, fontWeight: 700, color: '#1e293b' },
    tabs: { display: 'flex', gap: 4, background: '#f1f5f9', borderRadius: 8, padding: 4 },
    tab: (active) => ({
      padding: '8px 16px', borderRadius: 6, cursor: 'pointer', fontWeight: 500, fontSize: 14,
      background: active ? '#fff' : 'transparent', color: active ? '#1e293b' : '#64748b',
      boxShadow: active ? '0 1px 3px rgba(0,0,0,0.1)' : 'none', border: 'none',
    }),
    card: { background: '#fff', borderRadius: 12, boxShadow: '0 1px 3px rgba(0,0,0,0.08)', padding: 20, marginBottom: 16 },
    input: { padding: '8px 12px', borderRadius: 6, border: '1px solid #d1d5db', fontSize: 14, width: '100%' },
    select: { padding: '8px 12px', borderRadius: 6, border: '1px solid #d1d5db', fontSize: 14 },
    btn: { padding: '8px 16px', borderRadius: 6, border: 'none', fontWeight: 600, cursor: 'pointer', fontSize: 14, background: '#667eea', color: '#fff' },
    btnSm: { padding: '4px 10px', borderRadius: 4, border: 'none', cursor: 'pointer', fontSize: 12, background: '#e2e8f0', color: '#475569' },
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
    timeline: { position: 'relative', paddingLeft: 24 },
    timelineDot: (color) => ({
      width: 10, height: 10, borderRadius: '50%', background: color, position: 'absolute', left: 0, top: 6,
    }),
    timelineItem: { position: 'relative', paddingBottom: 20, paddingLeft: 16, borderLeft: '2px solid #e2e8f0', marginLeft: 4 },
  };

  // ============================================================================
  // RENDER
  // ============================================================================
  return (
    <div style={styles.container}>
      <div style={styles.header}>
        <h1 style={styles.title}>Serial Number Registry</h1>
        <div style={styles.tabs}>
          {['search', 'register', 'history', 'stats'].map(t => (
            <button key={t} style={styles.tab(tab === t)} onClick={() => setTab(t)}>
              {t.charAt(0).toUpperCase() + t.slice(1)}
            </button>
          ))}
        </div>
      </div>

      {error && <div style={styles.alert('error')}>{error}</div>}
      {success && <div style={styles.alert('success')}>{success}</div>}

      {/* SEARCH TAB */}
      {tab === 'search' && (
        <div style={styles.card}>
          <div style={{ display: 'flex', gap: 12, marginBottom: 16 }}>
            <input
              style={{ ...styles.input, flex: 1 }}
              placeholder="Search by serial number, product name, or SKU..."
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && fetchSerials()}
            />
            <select style={styles.select} value={statusFilter} onChange={e => setStatusFilter(e.target.value)}>
              <option value="">All Statuses</option>
              {STATUS_OPTIONS.map(s => <option key={s} value={s}>{s.replace('_', ' ')}</option>)}
            </select>
            <button style={styles.btn} onClick={fetchSerials}>Search</button>
          </div>
          <div style={{ fontSize: 13, color: '#64748b', marginBottom: 12 }}>{total} serial(s) found</div>
          {loading ? <div style={{ textAlign: 'center', padding: 40, color: '#64748b' }}>Loading...</div> : (
            <table style={styles.table}>
              <thead>
                <tr>
                  <th style={styles.th}>Serial Number</th>
                  <th style={styles.th}>Product</th>
                  <th style={styles.th}>Status</th>
                  <th style={styles.th}>Location</th>
                  <th style={styles.th}>Customer</th>
                  <th style={styles.th}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {serials.map(s => (
                  <tr key={s.id}>
                    <td style={{ ...styles.td, fontFamily: 'monospace', fontWeight: 600 }}>{s.serial_number}</td>
                    <td style={styles.td}>{s.product_name}<br/><span style={{ fontSize: 12, color: '#94a3b8' }}>{s.product_sku}</span></td>
                    <td style={styles.td}><span style={styles.badge(s.status)}>{s.status.replace('_', ' ')}</span></td>
                    <td style={styles.td}>{s.location_name || '-'}</td>
                    <td style={styles.td}>{s.customer_name || '-'}</td>
                    <td style={styles.td}>
                      <button style={styles.btnSm} onClick={() => fetchSerialDetail(s.serial_number)}>View</button>
                    </td>
                  </tr>
                ))}
                {!serials.length && (
                  <tr><td colSpan={6} style={{ ...styles.td, textAlign: 'center', color: '#94a3b8' }}>No serials found</td></tr>
                )}
              </tbody>
            </table>
          )}
        </div>
      )}

      {/* REGISTER TAB */}
      {tab === 'register' && (
        <div style={styles.card}>
          <h3 style={{ fontSize: 18, fontWeight: 600, marginBottom: 16 }}>Register Serial Number</h3>
          <form onSubmit={registerSerial} style={{ display: 'flex', flexDirection: 'column', gap: 12, maxWidth: 500 }}>
            <div>
              <label style={{ fontSize: 13, fontWeight: 600, display: 'block', marginBottom: 4 }}>Product ID *</label>
              <input style={styles.input} type="number" value={regForm.productId}
                onChange={e => setRegForm({ ...regForm, productId: e.target.value })} required />
            </div>
            <div>
              <label style={{ fontSize: 13, fontWeight: 600, display: 'block', marginBottom: 4 }}>Serial Number *</label>
              <input style={styles.input} value={regForm.serialNumber}
                onChange={e => setRegForm({ ...regForm, serialNumber: e.target.value })} required />
            </div>
            <div>
              <label style={{ fontSize: 13, fontWeight: 600, display: 'block', marginBottom: 4 }}>Location ID</label>
              <input style={styles.input} type="number" value={regForm.locationId}
                onChange={e => setRegForm({ ...regForm, locationId: e.target.value })} />
            </div>
            <div>
              <label style={{ fontSize: 13, fontWeight: 600, display: 'block', marginBottom: 4 }}>Notes</label>
              <textarea style={{ ...styles.input, minHeight: 60 }} value={regForm.notes}
                onChange={e => setRegForm({ ...regForm, notes: e.target.value })} />
            </div>
            <button type="submit" style={{ ...styles.btn, alignSelf: 'flex-start' }}>Register Serial</button>
          </form>
        </div>
      )}

      {/* HISTORY TAB */}
      {tab === 'history' && (
        <div style={styles.card}>
          {selectedSerial ? (
            <>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 20 }}>
                <div>
                  <h3 style={{ fontSize: 20, fontWeight: 700, fontFamily: 'monospace' }}>{selectedSerial.serial_number}</h3>
                  <div style={{ color: '#64748b', marginTop: 4 }}>{selectedSerial.product_name} ({selectedSerial.product_sku})</div>
                  <div style={{ marginTop: 8 }}><span style={styles.badge(selectedSerial.status)}>{selectedSerial.status.replace('_', ' ')}</span></div>
                </div>
                <div style={{ textAlign: 'right', fontSize: 13, color: '#64748b' }}>
                  {selectedSerial.customer_name && <div>Customer: <strong>{selectedSerial.customer_name}</strong></div>}
                  {selectedSerial.location_name && <div>Location: <strong>{selectedSerial.location_name}</strong></div>}
                </div>
              </div>
              <h4 style={{ fontSize: 16, fontWeight: 600, marginBottom: 12 }}>Event Timeline</h4>
              <div style={styles.timeline}>
                {(selectedSerial.history || []).map((evt, i) => (
                  <div key={evt.id || i} style={styles.timelineItem}>
                    <div style={styles.timelineDot(STATUS_COLORS[evt.to_status] || '#6b7280')} />
                    <div style={{ fontSize: 14, fontWeight: 600 }}>{evt.event_type.replace('_', ' ')}</div>
                    <div style={{ fontSize: 12, color: '#64748b' }}>
                      {evt.from_status && <span>{evt.from_status} &rarr; </span>}{evt.to_status}
                      {evt.performed_by_name && <span> by {evt.performed_by_name}</span>}
                    </div>
                    {evt.notes && <div style={{ fontSize: 12, color: '#94a3b8', marginTop: 2 }}>{evt.notes}</div>}
                    <div style={{ fontSize: 11, color: '#94a3b8', marginTop: 2 }}>{new Date(evt.created_at).toLocaleString()}</div>
                  </div>
                ))}
                {(!selectedSerial.history || !selectedSerial.history.length) && (
                  <div style={{ color: '#94a3b8', padding: 20, textAlign: 'center' }}>No events recorded</div>
                )}
              </div>
            </>
          ) : (
            <div style={{ textAlign: 'center', padding: 40, color: '#94a3b8' }}>
              Select a serial from the Search tab to view its history
            </div>
          )}
        </div>
      )}

      {/* STATS TAB */}
      {tab === 'stats' && stats && (
        <>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 16, marginBottom: 24 }}>
            <div style={styles.statCard('#3b82f6')}>
              <div style={styles.statValue}>{stats.total || 0}</div>
              <div style={styles.statLabel}>Total Registered</div>
            </div>
            <div style={styles.statCard('#10b981')}>
              <div style={styles.statValue}>{stats.byStatus?.available || 0}</div>
              <div style={styles.statLabel}>Available</div>
            </div>
            <div style={styles.statCard('#6366f1')}>
              <div style={styles.statValue}>{stats.byStatus?.sold || 0}</div>
              <div style={styles.statLabel}>Sold</div>
            </div>
            <div style={styles.statCard('#8b5cf6')}>
              <div style={styles.statValue}>{stats.byStatus?.warranty_repair || 0}</div>
              <div style={styles.statLabel}>In Repair</div>
            </div>
          </div>
          <div style={styles.card}>
            <h3 style={{ fontSize: 16, fontWeight: 600, marginBottom: 12 }}>Recent Activity</h3>
            <table style={styles.table}>
              <thead>
                <tr>
                  <th style={styles.th}>Serial</th>
                  <th style={styles.th}>Product</th>
                  <th style={styles.th}>Event</th>
                  <th style={styles.th}>By</th>
                  <th style={styles.th}>Date</th>
                </tr>
              </thead>
              <tbody>
                {(stats.recentActivity || []).map(a => (
                  <tr key={a.id}>
                    <td style={{ ...styles.td, fontFamily: 'monospace' }}>{a.serial_number}</td>
                    <td style={styles.td}>{a.product_name}</td>
                    <td style={styles.td}><span style={styles.badge(a.to_status)}>{a.event_type.replace('_', ' ')}</span></td>
                    <td style={styles.td}>{a.performed_by_name || '-'}</td>
                    <td style={styles.td}>{new Date(a.created_at).toLocaleString()}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  );
}
