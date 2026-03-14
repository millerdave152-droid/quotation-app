import React, { useState, useEffect } from 'react';
import { authFetch } from '../../services/authFetch';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  AreaChart, Area, PieChart, Pie, Cell
} from 'recharts';

const API_URL = process.env.REACT_APP_API_URL || '';

const api = {
  get: async (url) => {
    const response = await authFetch(`${API_URL}${url}`);
    return { data: await response.json() };
  }
};

const COLORS = ['#4CAF50', '#2196F3', '#FF9800', '#9C27B0', '#F44336', '#00BCD4'];

// Shared styles
const card = {
  background: 'white',
  borderRadius: '12px',
  padding: '24px',
  boxShadow: '0 1px 3px rgba(0,0,0,0.08)'
};
const sectionTitle = { margin: '0 0 16px', fontSize: '16px', fontWeight: '600', color: '#1f2937' };
const emptyState = { display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#9ca3af', padding: '40px 0' };

const ExecutiveDashboard = () => {
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [forecastData, setForecastData] = useState(null);
  const [pipelineData, setPipelineData] = useState(null);
  const [salesVelocity, setSalesVelocity] = useState(null);
  const [inventoryHealth, setInventoryHealth] = useState(null);
  const [topCustomers, setTopCustomers] = useState([]);
  const [arAging, setArAging] = useState(null);

  useEffect(() => {
    fetchDashboardData();
  }, []);

  const fetchDashboardData = async () => {
    setLoading(true);
    try {
      const [forecastRes, pipelineRes, velocityRes, inventoryRes, customersRes, arRes] = await Promise.all([
        api.get('/api/analytics/forecast/summary').catch(() => ({ data: { data: null } })),
        api.get('/api/quotations/analytics/pipeline-win-rates').catch(() => ({ data: { data: null } })),
        api.get('/api/analytics/sales-velocity?days=30').catch(() => ({ data: { data: null } })),
        api.get('/api/inventory/optimization/health').catch(() => ({ data: { data: null } })),
        api.get('/api/customers/top-clv?limit=5').catch(() => ({ data: { data: [] } })),
        api.get('/api/invoices/ar-aging').catch(() => ({ data: { data: null } }))
      ]);

      setForecastData(forecastRes.data.data);
      setPipelineData(pipelineRes.data.data);
      setSalesVelocity(velocityRes.data.data);
      setInventoryHealth(inventoryRes.data.data);
      setTopCustomers(customersRes.data.data || []);
      setArAging(arRes.data.data);
    } catch (error) {
      console.error('Error fetching dashboard data:', error);
    } finally {
      setLoading(false);
    }
  };

  const refreshData = async () => {
    setRefreshing(true);
    await fetchDashboardData();
    setRefreshing(false);
  };

  const formatCurrency = (value) => {
    if (value === null || value === undefined || isNaN(value)) return '-';
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
      minimumFractionDigits: 0,
      maximumFractionDigits: 0
    }).format(value);
  };

  // KPI Card
  const KPICard = ({ title, value, change, changeLabel, target, icon, color = '#3b82f6' }) => {
    const isPositive = change >= 0;
    return (
      <div style={{
        background: 'white',
        borderRadius: '12px',
        padding: '20px',
        borderLeft: `4px solid ${color}`,
        boxShadow: '0 1px 3px rgba(0,0,0,0.08)',
        position: 'relative'
      }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <span style={{ fontSize: '13px', fontWeight: '500', color: '#6b7280' }}>{title}</span>
          {icon && (
            <div style={{
              width: '36px',
              height: '36px',
              borderRadius: '10px',
              background: `${color}14`,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              flexShrink: 0
            }}>
              {icon}
            </div>
          )}
        </div>
        <div style={{ marginTop: '8px', display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between' }}>
          <div>
            <div style={{ fontSize: '28px', fontWeight: '700', color: '#1f2937' }}>{value}</div>
            {change !== undefined && (
              <div style={{
                fontSize: '12px',
                marginTop: '4px',
                fontWeight: '600',
                color: isPositive ? '#22c55e' : '#ef4444',
                display: 'flex',
                alignItems: 'center',
                gap: '4px'
              }}>
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                  {isPositive
                    ? <polyline points="18 15 12 9 6 15"/>
                    : <polyline points="6 9 12 15 18 9"/>}
                </svg>
                {Math.abs(change).toFixed(1)}% {changeLabel}
              </div>
            )}
          </div>
          {target && (
            <div style={{ textAlign: 'right' }}>
              <div style={{ fontSize: '11px', color: '#9ca3af' }}>Target</div>
              <div style={{ fontSize: '13px', fontWeight: '600', color: '#374151' }}>{target}</div>
            </div>
          )}
        </div>
      </div>
    );
  };

  // Progress Ring
  const ProgressRing = ({ value, max, label, color = '#4CAF50' }) => {
    const percentage = max > 0 ? (value / max) * 100 : 0;
    const circumference = 2 * Math.PI * 45;
    const strokeDashoffset = circumference - (percentage / 100) * circumference;

    return (
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
        <svg width="112" height="112" style={{ transform: 'rotate(-90deg)' }}>
          <circle cx="56" cy="56" r="45" stroke="#e5e7eb" strokeWidth="10" fill="none" />
          <circle
            cx="56" cy="56" r="45"
            stroke={color} strokeWidth="10" fill="none"
            strokeDasharray={circumference}
            strokeDashoffset={strokeDashoffset}
            strokeLinecap="round"
          />
        </svg>
        <div style={{ textAlign: 'center', marginTop: '-64px', marginBottom: '16px' }}>
          <div style={{ fontSize: '22px', fontWeight: '700', color: '#1f2937' }}>{percentage.toFixed(0)}%</div>
          <div style={{ fontSize: '11px', color: '#9ca3af' }}>{label}</div>
        </div>
      </div>
    );
  };

  if (loading) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '400px', color: '#6b7280' }}>
        <div style={{ textAlign: 'center' }}>
          <div style={{
            width: '40px', height: '40px',
            border: '3px solid #e5e7eb', borderTopColor: '#3b82f6',
            borderRadius: '50%', animation: 'spin 1s linear infinite',
            margin: '0 auto 16px'
          }} />
          Loading executive dashboard...
        </div>
      </div>
    );
  }

  return (
    <div style={{ padding: '24px', maxWidth: '1600px', margin: '0 auto' }}>
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '24px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '14px' }}>
          <div style={{
            width: '38px', height: '38px', borderRadius: '10px',
            background: 'linear-gradient(135deg, #3b82f6 0%, #1d4ed8 100%)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            boxShadow: '0 3px 10px rgba(59, 130, 246, 0.25)', flexShrink: 0
          }}>
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M18 20V10"/><path d="M12 20V4"/><path d="M6 20v-6"/>
            </svg>
          </div>
          <div>
            <h1 style={{ margin: 0, fontSize: '24px', fontWeight: '700', color: '#1f2937' }}>Dashboard</h1>
            <p style={{ margin: '2px 0 0', color: '#6b7280', fontSize: '13px' }}>
              Real-time business performance metrics
            </p>
          </div>
        </div>
        <button
          onClick={refreshData}
          disabled={refreshing}
          style={{
            padding: '8px 14px',
            background: '#3b82f6',
            color: 'white',
            border: 'none',
            borderRadius: '6px',
            fontSize: '13px',
            fontWeight: '500',
            cursor: refreshing ? 'wait' : 'pointer',
            display: 'flex',
            alignItems: 'center',
            gap: '6px',
            opacity: refreshing ? 0.7 : 1
          }}
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={refreshing ? { animation: 'spin 1s linear infinite' } : {}}>
            <polyline points="23 4 23 10 17 10"/><polyline points="1 20 1 14 7 14"/>
            <path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15"/>
          </svg>
          {refreshing ? 'Refreshing...' : 'Refresh'}
        </button>
      </div>

      {/* Revenue KPIs */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '16px', marginBottom: '24px' }}>
        <KPICard
          title="Revenue (30-Day Forecast)"
          value={forecastData?.forecast?.forecast30
            ? formatCurrency(forecastData.forecast.forecast30.predictedRevenue)
            : '-'}
          change={forecastData?.forecast?.forecast30?.growthRate}
          changeLabel="vs last period"
          icon={<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#22c55e" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="12" y1="1" x2="12" y2="23"/><path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"/></svg>}
          color="#22c55e"
        />
        <KPICard
          title="Pipeline Value"
          value={forecastData?.pipeline?.totalWeighted
            ? formatCurrency(forecastData.pipeline.totalWeighted)
            : '-'}
          target={forecastData?.pipeline?.totalValue
            ? formatCurrency(forecastData.pipeline.totalValue)
            : undefined}
          icon={<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#3b82f6" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="20" x2="18" y2="10"/><line x1="12" y1="20" x2="12" y2="4"/><line x1="6" y1="20" x2="6" y2="14"/></svg>}
          color="#3b82f6"
        />
        <KPICard
          title="Win Rate"
          value={pipelineData?.stages?.find(s => s.stage === 'WON')?.actualWinRate
            ? `${pipelineData.stages.find(s => s.stage === 'WON').actualWinRate}%`
            : '-'}
          icon={<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#8b5cf6" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><circle cx="12" cy="12" r="6"/><circle cx="12" cy="12" r="2"/></svg>}
          color="#8b5cf6"
        />
        <KPICard
          title="Active Quotes"
          value={pipelineData?.stages
            ?.filter(s => !['WON', 'LOST', 'EXPIRED'].includes(s.stage))
            .reduce((sum, s) => sum + s.count, 0) || '-'}
          icon={<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#f59e0b" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/></svg>}
          color="#f59e0b"
        />
      </div>

      {/* Main Charts Row */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '24px', marginBottom: '24px' }}>
        {/* Revenue Forecast Chart */}
        <div style={card}>
          <h3 style={sectionTitle}>Revenue Forecast</h3>
          {forecastData?.forecast?.historicalData?.length > 0 ? (
            <ResponsiveContainer width="100%" height={250}>
              <AreaChart data={forecastData.forecast.historicalData.slice(-30)}>
                <defs>
                  <linearGradient id="colorRevenue" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#4CAF50" stopOpacity={0.8}/>
                    <stop offset="95%" stopColor="#4CAF50" stopOpacity={0.1}/>
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="#f3f4f6" />
                <XAxis dataKey="date" tickFormatter={(d) => new Date(d).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })} stroke="#9ca3af" fontSize={12} />
                <YAxis tickFormatter={(v) => `$${(v / 1000).toFixed(0)}k`} stroke="#9ca3af" fontSize={12} />
                <Tooltip formatter={(v) => formatCurrency(v)} contentStyle={{ borderRadius: '8px', border: '1px solid #e5e7eb' }} />
                <Area type="monotone" dataKey="revenue" stroke="#4CAF50" fillOpacity={1} fill="url(#colorRevenue)" />
              </AreaChart>
            </ResponsiveContainer>
          ) : (
            <div style={{ ...emptyState, height: '250px' }}>No forecast data available</div>
          )}
        </div>

        {/* Pipeline Stage Distribution */}
        <div style={card}>
          <h3 style={sectionTitle}>Pipeline by Stage</h3>
          {pipelineData?.stages?.length > 0 ? (
            <div style={{ display: 'flex', alignItems: 'center' }}>
              <ResponsiveContainer width="50%" height={250}>
                <PieChart>
                  <Pie
                    data={pipelineData.stages.filter(s => !['WON', 'LOST', 'EXPIRED'].includes(s.stage))}
                    dataKey="value"
                    nameKey="stage"
                    cx="50%" cy="50%"
                    outerRadius={80}
                    label={({ stage }) => stage}
                  >
                    {pipelineData.stages.map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                    ))}
                  </Pie>
                  <Tooltip formatter={(v) => formatCurrency(v)} contentStyle={{ borderRadius: '8px', border: '1px solid #e5e7eb' }} />
                </PieChart>
              </ResponsiveContainer>
              <div style={{ width: '50%', display: 'flex', flexDirection: 'column', gap: '8px' }}>
                {pipelineData.stages
                  .filter(s => !['WON', 'LOST', 'EXPIRED'].includes(s.stage))
                  .map((stage, idx) => (
                    <div key={stage.stage} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', fontSize: '13px' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <div style={{ width: '10px', height: '10px', borderRadius: '50%', background: COLORS[idx % COLORS.length] }} />
                        <span style={{ color: '#6b7280' }}>{stage.stage}</span>
                      </div>
                      <span style={{ fontWeight: '600', color: '#1f2937' }}>
                        {formatCurrency(stage.value / 100)}
                      </span>
                    </div>
                  ))}
              </div>
            </div>
          ) : (
            <div style={{ ...emptyState, height: '250px' }}>No pipeline data available</div>
          )}
        </div>
      </div>

      {/* Second Row */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '24px', marginBottom: '24px' }}>
        {/* Top Customers by CLV */}
        <div style={card}>
          <h3 style={sectionTitle}>Top Customers by CLV</h3>
          {topCustomers.length > 0 ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
              {topCustomers.map((customer, idx) => (
                <div key={customer.id || idx} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                    <div style={{
                      width: '28px', height: '28px', borderRadius: '50%',
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      color: 'white', fontSize: '12px', fontWeight: '700',
                      background: idx === 0 ? '#f59e0b' : idx === 1 ? '#9ca3af' : idx === 2 ? '#cd7f32' : '#e5e7eb'
                    }}>
                      {idx + 1}
                    </div>
                    <div>
                      <div style={{ fontWeight: '600', color: '#1f2937', fontSize: '13px' }}>{customer.name}</div>
                      <div style={{ fontSize: '11px', color: '#9ca3af' }}>
                        {customer.clv_segment || 'Standard'} tier
                      </div>
                    </div>
                  </div>
                  <div style={{ fontWeight: '600', color: '#1f2937', fontSize: '13px' }}>
                    {formatCurrency(customer.clv_score || (customer.total_spent_cents ? customer.total_spent_cents / 100 : 0))}
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div style={{ ...emptyState, height: '200px' }}>No customer data available</div>
          )}
        </div>

        {/* Sales Team Performance */}
        <div style={card}>
          <h3 style={sectionTitle}>Sales Team Performance</h3>
          {salesVelocity?.salespeople?.length > 0 ? (
            <ResponsiveContainer width="100%" height={200}>
              <BarChart data={salesVelocity.salespeople.slice(0, 5)} layout="vertical">
                <CartesianGrid strokeDasharray="3 3" stroke="#f3f4f6" />
                <XAxis type="number" tickFormatter={(v) => `$${(v / 1000).toFixed(0)}k`} stroke="#9ca3af" fontSize={12} />
                <YAxis type="category" dataKey="salesperson" width={80} stroke="#9ca3af" fontSize={12} />
                <Tooltip formatter={(v) => formatCurrency(v)} contentStyle={{ borderRadius: '8px', border: '1px solid #e5e7eb' }} />
                <Bar dataKey="totalRevenue" fill="#4CAF50" radius={[0, 4, 4, 0]} />
              </BarChart>
            </ResponsiveContainer>
          ) : (
            <div style={{ ...emptyState, height: '200px' }}>No sales data available</div>
          )}
        </div>

        {/* Inventory & AR Health */}
        <div style={card}>
          <h3 style={sectionTitle}>Health Indicators</h3>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
            <ProgressRing
              value={inventoryHealth?.healthy?.percentage || 85}
              max={100}
              label="In Stock"
              color="#4CAF50"
            />
            <ProgressRing
              value={arAging?.summary?.current || 70}
              max={arAging?.summary?.total || 100}
              label="AR Current"
              color="#2196F3"
            />
          </div>
          <div style={{ marginTop: '16px', display: 'flex', flexDirection: 'column', gap: '10px' }}>
            {[
              { label: 'Low Stock Items', value: inventoryHealth?.low?.count || 0, color: '#f59e0b' },
              { label: 'Out of Stock', value: inventoryHealth?.outOfStock?.count || 0, color: '#ef4444' },
              { label: 'Overdue Invoices', value: arAging?.summary?.overdueCount || 0, color: '#ef4444' }
            ].map(item => (
              <div key={item.label} style={{ display: 'flex', justifyContent: 'space-between', fontSize: '13px' }}>
                <span style={{ color: '#9ca3af' }}>{item.label}</span>
                <span style={{ fontWeight: '600', color: item.color }}>{item.value}</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Alerts Section */}
      <div style={card}>
        <h3 style={sectionTitle}>Action Required</h3>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '16px' }}>
          {/* Expiring Quotes */}
          <div style={{ padding: '16px', background: '#fef2f2', borderRadius: '8px', border: '1px solid #fecaca' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', color: '#991b1b', fontWeight: '600', fontSize: '13px' }}>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#ef4444" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/>
              </svg>
              <span>Expiring Quotes</span>
            </div>
            <div style={{ marginTop: '8px', fontSize: '24px', fontWeight: '700', color: '#ef4444' }}>
              {pipelineData?.stages?.find(s => s.stage === 'SENT')?.count || 0}
            </div>
            <div style={{ fontSize: '12px', color: '#ef4444' }}>quotes need follow-up</div>
          </div>

          {/* Low Inventory */}
          <div style={{ padding: '16px', background: '#fefce8', borderRadius: '8px', border: '1px solid #fef08a' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', color: '#a16207', fontWeight: '600', fontSize: '13px' }}>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#f59e0b" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <line x1="16.5" y1="9.4" x2="7.5" y2="4.21"/><path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"/><polyline points="3.27 6.96 12 12.01 20.73 6.96"/><line x1="12" y1="22.08" x2="12" y2="12"/>
              </svg>
              <span>Low Inventory</span>
            </div>
            <div style={{ marginTop: '8px', fontSize: '24px', fontWeight: '700', color: '#f59e0b' }}>
              {inventoryHealth?.lowStock || 0}
            </div>
            <div style={{ fontSize: '12px', color: '#a16207' }}>products need reorder</div>
          </div>

          {/* Overdue Payments */}
          <div style={{ padding: '16px', background: '#fff7ed', borderRadius: '8px', border: '1px solid #fed7aa' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', color: '#c2410c', fontWeight: '600', fontSize: '13px' }}>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#f97316" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <rect x="1" y="4" width="22" height="16" rx="2" ry="2"/><line x1="1" y1="10" x2="23" y2="10"/>
              </svg>
              <span>Overdue Payments</span>
            </div>
            <div style={{ marginTop: '8px', fontSize: '24px', fontWeight: '700', color: '#f97316' }}>
              {formatCurrency(arAging?.summary?.overdueAmount || 0)}
            </div>
            <div style={{ fontSize: '12px', color: '#c2410c' }}>needs collection</div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default ExecutiveDashboard;
