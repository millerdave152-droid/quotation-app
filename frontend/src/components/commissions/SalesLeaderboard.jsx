import React, { useState, useEffect, useCallback } from 'react';
import { authFetch } from '../../services/authFetch';

const PERIODS = [
  { key: 'today', label: 'Today' },
  { key: 'week', label: 'This Week' },
  { key: 'month', label: 'This Month' },
  { key: 'quarter', label: 'Quarter' },
  { key: 'year', label: 'Year' },
];

const RANK_STYLES = {
  1: { bg: 'linear-gradient(135deg, #fbbf24, #f59e0b)', color: '#78350f', medal: '#FFD700' },
  2: { bg: 'linear-gradient(135deg, #d1d5db, #9ca3af)', color: '#374151', medal: '#C0C0C0' },
  3: { bg: 'linear-gradient(135deg, #d97706, #b45309)', color: '#451a03', medal: '#CD7F32' },
};

const SalesLeaderboard = () => {
  const [period, setPeriod] = useState('month');
  const [data, setData] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const fetchLeaderboard = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await authFetch(`/api/commissions/leaderboard?period=${period}`);
      const json = await response.json();
      if (json.success) {
        setData(json.data || []);
      } else {
        setError(json.message || 'Failed to load leaderboard');
      }
    } catch (err) {
      setError('Failed to load leaderboard');
    } finally {
      setLoading(false);
    }
  }, [period]);

  useEffect(() => {
    fetchLeaderboard();
    const interval = setInterval(fetchLeaderboard, 60000);
    return () => clearInterval(interval);
  }, [fetchLeaderboard]);

  const formatCurrency = (val) => {
    if (!val && val !== 0) return '$0.00';
    return `$${Number(val).toFixed(2).replace(/\B(?=(\d{3})+(?!\d))/g, ',')}`;
  };

  const formatPercent = (val) => {
    if (!val && val !== 0) return '0.0%';
    return `${(Number(val) * 100).toFixed(1)}%`;
  };

  return (
    <div style={{ padding: '30px', fontFamily: 'system-ui, -apple-system, sans-serif', background: '#f9fafb', minHeight: 'calc(100vh - 140px)' }}>
      <div style={{ maxWidth: '1200px', margin: '0 auto' }}>
        {/* Header */}
        <div style={{ marginBottom: '24px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '16px' }}>
          <div>
            <h1 style={{ margin: '0 0 8px 0', fontSize: '28px', fontWeight: 'bold', background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>
              Sales Leaderboard
            </h1>
            <p style={{ margin: 0, color: '#6b7280', fontSize: '14px' }}>Track top performers and sales competition</p>
          </div>
          <button onClick={fetchLeaderboard} style={{ padding: '10px 20px', background: '#667eea', color: 'white', border: 'none', borderRadius: '8px', fontSize: '14px', fontWeight: '600', cursor: 'pointer' }}>
            Refresh
          </button>
        </div>

        {/* Period Selector */}
        <div style={{ display: 'flex', gap: '8px', marginBottom: '24px', flexWrap: 'wrap' }}>
          {PERIODS.map(p => (
            <button
              key={p.key}
              onClick={() => setPeriod(p.key)}
              style={{
                padding: '10px 20px',
                borderRadius: '8px',
                border: 'none',
                fontSize: '14px',
                fontWeight: '600',
                cursor: 'pointer',
                transition: 'all 0.2s',
                background: period === p.key ? 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)' : 'white',
                color: period === p.key ? 'white' : '#4b5563',
                boxShadow: period === p.key ? '0 4px 12px rgba(102, 126, 234, 0.35)' : '0 1px 3px rgba(0,0,0,0.1)',
              }}
            >
              {p.label}
            </button>
          ))}
        </div>

        {/* Content */}
        {loading ? (
          <div style={{ background: 'white', borderRadius: '12px', padding: '60px', textAlign: 'center', boxShadow: '0 1px 3px rgba(0,0,0,0.1)' }}>
            <div style={{ width: '40px', height: '40px', border: '4px solid #e5e7eb', borderTopColor: '#667eea', borderRadius: '50%', animation: 'spin 1s linear infinite', margin: '0 auto 16px' }} />
            <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
            <p style={{ color: '#6b7280', fontSize: '14px', margin: 0 }}>Loading leaderboard...</p>
          </div>
        ) : error ? (
          <div style={{ background: 'white', borderRadius: '12px', padding: '60px', textAlign: 'center', boxShadow: '0 1px 3px rgba(0,0,0,0.1)' }}>
            <p style={{ color: '#ef4444', fontSize: '16px', marginBottom: '16px' }}>{error}</p>
            <button onClick={fetchLeaderboard} style={{ padding: '10px 20px', background: '#667eea', color: 'white', border: 'none', borderRadius: '8px', cursor: 'pointer' }}>Retry</button>
          </div>
        ) : data.length === 0 ? (
          <div style={{ background: 'white', borderRadius: '12px', padding: '60px', textAlign: 'center', boxShadow: '0 1px 3px rgba(0,0,0,0.1)' }}>
            <div style={{ fontSize: '48px', marginBottom: '16px' }}>🏆</div>
            <p style={{ color: '#6b7280', fontSize: '16px', margin: 0 }}>No sales data for this period yet.</p>
          </div>
        ) : (
          <>
            {/* Top 3 Podium */}
            {data.length >= 3 && (
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '16px', marginBottom: '24px' }}>
                {[1, 0, 2].map(idx => {
                  const rep = data[idx];
                  if (!rep) return null;
                  const rs = RANK_STYLES[rep.rank] || {};
                  return (
                    <div key={rep.repId} style={{
                      background: 'white',
                      borderRadius: '16px',
                      padding: '24px',
                      textAlign: 'center',
                      boxShadow: rep.rank === 1 ? '0 8px 30px rgba(251, 191, 36, 0.3)' : '0 2px 8px rgba(0,0,0,0.08)',
                      border: rep.rank === 1 ? '2px solid #fbbf24' : '1px solid #f3f4f6',
                      transform: rep.rank === 1 ? 'scale(1.05)' : 'none',
                      order: idx === 1 ? 0 : idx === 0 ? -1 : 1,
                    }}>
                      <div style={{
                        width: '48px', height: '48px', borderRadius: '50%',
                        background: rs.bg, display: 'flex', alignItems: 'center', justifyContent: 'center',
                        margin: '0 auto 12px', fontSize: '20px', fontWeight: 'bold', color: 'white',
                      }}>
                        {rep.rank}
                      </div>
                      <div style={{ fontSize: '18px', fontWeight: '700', color: '#111827', marginBottom: '4px' }}>{rep.repName}</div>
                      <div style={{ fontSize: '24px', fontWeight: '700', color: '#10b981', marginBottom: '8px' }}>{formatCurrency(rep.sales)}</div>
                      <div style={{ display: 'flex', justifyContent: 'center', gap: '16px', fontSize: '13px', color: '#6b7280' }}>
                        <span>{rep.orders} orders</span>
                        <span>{formatCurrency(rep.commission)} comm.</span>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}

            {/* Full Table */}
            <div style={{ background: 'white', borderRadius: '12px', boxShadow: '0 1px 3px rgba(0,0,0,0.1)', overflow: 'hidden' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                <thead>
                  <tr style={{ background: '#f9fafb', borderBottom: '2px solid #e5e7eb' }}>
                    <th style={{ padding: '14px 16px', textAlign: 'left', fontSize: '12px', fontWeight: '700', color: '#6b7280', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Rank</th>
                    <th style={{ padding: '14px 16px', textAlign: 'left', fontSize: '12px', fontWeight: '700', color: '#6b7280', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Rep Name</th>
                    <th style={{ padding: '14px 16px', textAlign: 'right', fontSize: '12px', fontWeight: '700', color: '#6b7280', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Orders</th>
                    <th style={{ padding: '14px 16px', textAlign: 'right', fontSize: '12px', fontWeight: '700', color: '#6b7280', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Sales</th>
                    <th style={{ padding: '14px 16px', textAlign: 'right', fontSize: '12px', fontWeight: '700', color: '#6b7280', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Commission</th>
                    <th style={{ padding: '14px 16px', textAlign: 'right', fontSize: '12px', fontWeight: '700', color: '#6b7280', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Avg Rate</th>
                  </tr>
                </thead>
                <tbody>
                  {data.map(rep => {
                    const isTop3 = rep.rank <= 3;
                    const rs = RANK_STYLES[rep.rank];
                    return (
                      <tr key={rep.repId} style={{
                        borderBottom: '1px solid #f3f4f6',
                        background: isTop3 ? `${rs.medal}08` : 'transparent',
                      }}>
                        <td style={{ padding: '14px 16px' }}>
                          {isTop3 ? (
                            <span style={{
                              display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                              width: '28px', height: '28px', borderRadius: '50%',
                              background: rs.bg, color: 'white', fontWeight: '700', fontSize: '13px',
                            }}>
                              {rep.rank}
                            </span>
                          ) : (
                            <span style={{ fontWeight: '600', color: '#6b7280', paddingLeft: '6px' }}>{rep.rank}</span>
                          )}
                        </td>
                        <td style={{ padding: '14px 16px', fontWeight: isTop3 ? '700' : '500', color: '#111827', fontSize: '14px' }}>{rep.repName}</td>
                        <td style={{ padding: '14px 16px', textAlign: 'right', fontWeight: '600', color: '#374151', fontSize: '14px' }}>{rep.orders}</td>
                        <td style={{ padding: '14px 16px', textAlign: 'right', fontWeight: '700', color: '#10b981', fontSize: '14px' }}>{formatCurrency(rep.sales)}</td>
                        <td style={{ padding: '14px 16px', textAlign: 'right', fontWeight: '600', color: '#667eea', fontSize: '14px' }}>{formatCurrency(rep.commission)}</td>
                        <td style={{ padding: '14px 16px', textAlign: 'right', fontWeight: '500', color: '#6b7280', fontSize: '14px' }}>{formatPercent(rep.avgRate)}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </>
        )}
      </div>
    </div>
  );
};

export default SalesLeaderboard;
