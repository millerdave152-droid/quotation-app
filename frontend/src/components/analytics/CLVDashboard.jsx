import React, { useState, useEffect, useRef } from 'react';
import { Users, TrendingUp, DollarSign, Crown, Award, Medal, Star, Filter, RefreshCw, PlayCircle, Clock, Activity } from 'lucide-react';
import { cachedFetch } from '../../services/apiCache';
import {
  PieChart, Pie, Cell, BarChart, Bar, XAxis, YAxis, CartesianGrid,
  Tooltip, ResponsiveContainer, Legend, LineChart, Line
} from 'recharts';
import ChurnRiskPanel from './ChurnRiskPanel';

const API_BASE = `${process.env.REACT_APP_API_URL || 'http://localhost:3001'}/api`;

// Chart colors for segments
const SEGMENT_CHART_COLORS = {
  platinum: '#1e293b',
  gold: '#b45309',
  silver: '#64748b',
  bronze: '#78716c'
};

/**
 * CLV Dashboard - Customer Lifetime Value Analytics
 * Shows segment breakdown, distribution chart, and top customers
 */
const CLVDashboard = () => {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [selectedSegment, setSelectedSegment] = useState('all');
  const [sortBy, setSortBy] = useState('lifetime_value');
  const [sortOrder, setSortOrder] = useState('DESC');
  const [limit, setLimit] = useState(20);
  const [jobStatus, setJobStatus] = useState(null);
  const [recalculating, setRecalculating] = useState(false);
  const [trendData, setTrendData] = useState([]);

  const isMounted = useRef(true);
  const loadedOnce = useRef(false);

  useEffect(() => {
    isMounted.current = true;

    if (!loadedOnce.current) {
      loadedOnce.current = true;
      fetchCLVData();
    }

    return () => {
      isMounted.current = false;
    };
  }, []);

  useEffect(() => {
    if (loadedOnce.current && isMounted.current) {
      fetchCLVData();
    }
  }, [selectedSegment, sortBy, sortOrder, limit]);

  const fetchCLVData = async () => {
    if (!isMounted.current) return;

    setLoading(true);
    setError(null);

    try {
      const params = new URLSearchParams({
        limit: limit.toString(),
        sortBy,
        sortOrder,
        ...(selectedSegment !== 'all' && { segment: selectedSegment })
      });

      const response = await cachedFetch(`/api/customers/lifetime-value?${params}`);

      if (!isMounted.current) return;

      const result = response?.data || response || {};
      setData(result);
    } catch (err) {
      console.error('CLV fetch error:', err);
      if (isMounted.current) {
        setError(err.message || 'Failed to fetch CLV data');
      }
    } finally {
      if (isMounted.current) {
        setLoading(false);
      }
    }
  };

  const fetchJobStatus = async () => {
    try {
      const res = await cachedFetch('/api/clv/job-status');
      if (isMounted.current) setJobStatus(res?.data || res);
    } catch (err) { /* ignore */ }
  };

  const fetchTrends = async () => {
    try {
      const res = await cachedFetch('/api/clv/trends?days=30');
      if (isMounted.current) setTrendData(res?.data || res || []);
    } catch (err) { /* ignore */ }
  };

  const handleRecalculate = async () => {
    setRecalculating(true);
    try {
      const token = localStorage.getItem('token');
      await fetch(`${API_BASE}/clv/run-job`, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' }
      });
      // Poll status briefly
      setTimeout(fetchJobStatus, 2000);
      setTimeout(fetchJobStatus, 8000);
    } catch (err) {
      console.error('Failed to trigger recalculation:', err);
    } finally {
      setRecalculating(false);
    }
  };

  // Fetch job status and trends on mount
  useEffect(() => {
    fetchJobStatus();
    fetchTrends();
  }, []);

  const formatCurrency = (value) => {
    if (value === null || value === undefined || isNaN(value)) return '$0.00';
    return `$${parseFloat(value).toLocaleString('en-CA', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  };

  const formatDate = (dateValue) => {
    if (!dateValue) return 'N/A';
    try {
      const date = new Date(dateValue);
      if (isNaN(date.getTime())) return 'N/A';
      return date.toLocaleDateString('en-CA');
    } catch {
      return 'N/A';
    }
  };

  // Segment configuration
  const segmentConfig = {
    platinum: { color: '#1e293b', bgColor: '#f1f5f9', icon: Crown, label: 'Platinum', threshold: '$50,000+' },
    gold: { color: '#b45309', bgColor: '#fef3c7', icon: Award, label: 'Gold', threshold: '$20,000-$49,999' },
    silver: { color: '#64748b', bgColor: '#f1f5f9', icon: Medal, label: 'Silver', threshold: '$5,000-$19,999' },
    bronze: { color: '#78716c', bgColor: '#fef3c7', icon: Star, label: 'Bronze', threshold: 'Under $5,000' }
  };

  if (loading && !data) {
    return (
      <div style={{ padding: '40px', textAlign: 'center' }}>
        <div style={{
          width: '48px',
          height: '48px',
          border: '4px solid #e5e7eb',
          borderTopColor: '#3b82f6',
          borderRadius: '50%',
          margin: '0 auto 16px',
          animation: 'spin 1s linear infinite'
        }} />
        <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
        <div style={{ fontSize: '18px', color: '#6b7280' }}>Loading CLV data...</div>
      </div>
    );
  }

  if (error) {
    return (
      <div style={{ padding: '40px', textAlign: 'center' }}>
        <div style={{ fontSize: '48px', marginBottom: '16px' }}>⚠️</div>
        <div style={{ fontSize: '18px', color: '#ef4444', marginBottom: '16px' }}>Error: {error}</div>
        <button
          onClick={fetchCLVData}
          style={{
            padding: '12px 24px',
            background: '#3b82f6',
            color: 'white',
            border: 'none',
            borderRadius: '8px',
            cursor: 'pointer',
            fontSize: '14px',
            fontWeight: '600'
          }}
        >
          Retry
        </button>
      </div>
    );
  }

  const summary = data?.summary || {};
  const customers = data?.customers || [];
  const segmentBreakdown = summary?.segmentBreakdown || {};

  // Calculate max for chart scaling
  const maxSegmentCount = Math.max(
    segmentBreakdown.platinum || 0,
    segmentBreakdown.gold || 0,
    segmentBreakdown.silver || 0,
    segmentBreakdown.bronze || 0,
    1
  );

  return (
    <div style={{ padding: '20px', maxWidth: '1400px', margin: '0 auto' }}>
      {/* Header */}
      <div style={{ marginBottom: '30px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '16px' }}>
        <div>
          <h1 style={{ fontSize: '32px', fontWeight: 'bold', color: '#111827', marginBottom: '8px', display: 'flex', alignItems: 'center', gap: '12px' }}>
            <TrendingUp size={36} color="#3b82f6" />
            Customer Lifetime Value
          </h1>
          <p style={{ fontSize: '16px', color: '#6b7280', margin: 0 }}>
            Analyze customer segments and lifetime value metrics
          </p>
        </div>
        <button
          onClick={fetchCLVData}
          disabled={loading}
          style={{
            padding: '12px 24px',
            background: loading ? '#9ca3af' : '#3b82f6',
            color: 'white',
            border: 'none',
            borderRadius: '8px',
            cursor: loading ? 'not-allowed' : 'pointer',
            fontSize: '14px',
            fontWeight: '600',
            display: 'flex',
            alignItems: 'center',
            gap: '8px'
          }}
        >
          <RefreshCw size={16} className={loading ? 'animate-spin' : ''} />
          Refresh
        </button>
      </div>

      {/* Admin Controls */}
      <div style={{ display: 'flex', gap: '16px', marginBottom: '24px', flexWrap: 'wrap', alignItems: 'center' }}>
        <button
          onClick={handleRecalculate}
          disabled={recalculating || jobStatus?.isRunning}
          style={{
            padding: '10px 20px',
            background: recalculating || jobStatus?.isRunning ? '#9ca3af' : '#059669',
            color: 'white',
            border: 'none',
            borderRadius: '8px',
            cursor: recalculating || jobStatus?.isRunning ? 'not-allowed' : 'pointer',
            fontSize: '14px',
            fontWeight: '600',
            display: 'flex',
            alignItems: 'center',
            gap: '8px'
          }}
        >
          <PlayCircle size={16} />
          {jobStatus?.isRunning ? 'Job Running...' : recalculating ? 'Starting...' : 'Recalculate CLV'}
        </button>

        {jobStatus && (
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '13px', color: '#6b7280' }}>
            <Clock size={14} />
            {jobStatus.lastRun
              ? `Last run: ${new Date(jobStatus.lastRun).toLocaleString('en-CA')}`
              : 'Never run'}
            {jobStatus.lastRunStats && (
              <span style={{ color: '#10b981', fontWeight: '600' }}>
                ({jobStatus.lastRunStats.updated} updated, {jobStatus.lastRunStats.duration}ms)
              </span>
            )}
            {jobStatus.isRunning && (
              <span style={{ color: '#f59e0b', fontWeight: '600' }}>Running now</span>
            )}
          </div>
        )}
      </div>

      {/* CLV Trend Chart */}
      {trendData.length > 1 && (
        <div style={{ background: 'white', padding: '24px', borderRadius: '12px', boxShadow: '0 1px 3px rgba(0,0,0,0.1)', marginBottom: '24px' }}>
          <h2 style={{ fontSize: '18px', fontWeight: 'bold', color: '#111827', marginBottom: '16px', display: 'flex', alignItems: 'center', gap: '8px' }}>
            <Activity size={20} color="#8b5cf6" />
            CLV Trends (Last 30 Days)
          </h2>
          <ResponsiveContainer width="100%" height={250}>
            <LineChart data={trendData}>
              <CartesianGrid strokeDasharray="3 3" stroke="#f3f4f6" />
              <XAxis
                dataKey="snapshot_date"
                tickFormatter={(d) => new Date(d).toLocaleDateString('en-CA', { month: 'short', day: 'numeric' })}
                fontSize={12}
              />
              <YAxis
                tickFormatter={(v) => `$${(v / 100).toLocaleString()}`}
                fontSize={12}
              />
              <Tooltip
                labelFormatter={(d) => new Date(d).toLocaleDateString('en-CA')}
                formatter={(value, name) => {
                  if (name === 'avg_clv') return [`$${(value / 100).toFixed(2)}`, 'Avg CLV'];
                  if (name === 'high_risk_count') return [value, 'High Risk'];
                  return [value, name];
                }}
              />
              <Line type="monotone" dataKey="avg_clv" stroke="#8b5cf6" strokeWidth={2} dot={false} name="avg_clv" />
              <Line type="monotone" dataKey="high_risk_count" stroke="#ef4444" strokeWidth={2} dot={false} name="high_risk_count" yAxisId={0} />
            </LineChart>
          </ResponsiveContainer>
        </div>
      )}

      {/* Summary Cards */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '20px', marginBottom: '30px' }}>
        {/* Total Customers */}
        <div style={{ background: 'white', padding: '24px', borderRadius: '12px', boxShadow: '0 1px 3px rgba(0,0,0,0.1)', border: '2px solid #e5e7eb' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'start', marginBottom: '12px' }}>
            <div style={{ fontSize: '14px', color: '#6b7280', fontWeight: '600' }}>Total Customers</div>
            <Users size={24} color="#3b82f6" />
          </div>
          <div style={{ fontSize: '36px', fontWeight: 'bold', color: '#111827' }}>{summary.totalCustomers || 0}</div>
          <div style={{ fontSize: '13px', color: '#10b981', marginTop: '4px' }}>
            {summary.activeCustomers || 0} with purchases
          </div>
        </div>

        {/* Total CLV */}
        <div style={{ background: 'white', padding: '24px', borderRadius: '12px', boxShadow: '0 1px 3px rgba(0,0,0,0.1)', border: '2px solid #10b981' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'start', marginBottom: '12px' }}>
            <div style={{ fontSize: '14px', color: '#6b7280', fontWeight: '600' }}>Total Lifetime Value</div>
            <DollarSign size={24} color="#10b981" />
          </div>
          <div style={{ fontSize: '36px', fontWeight: 'bold', color: '#10b981' }}>{formatCurrency(summary.totalCLV)}</div>
          <div style={{ fontSize: '13px', color: '#6b7280', marginTop: '4px' }}>
            All customer revenue
          </div>
        </div>

        {/* Average CLV */}
        <div style={{ background: 'white', padding: '24px', borderRadius: '12px', boxShadow: '0 1px 3px rgba(0,0,0,0.1)', border: '2px solid #8b5cf6' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'start', marginBottom: '12px' }}>
            <div style={{ fontSize: '14px', color: '#6b7280', fontWeight: '600' }}>Average CLV</div>
            <TrendingUp size={24} color="#8b5cf6" />
          </div>
          <div style={{ fontSize: '36px', fontWeight: 'bold', color: '#8b5cf6' }}>{formatCurrency(summary.averageCLV)}</div>
          <div style={{ fontSize: '13px', color: '#6b7280', marginTop: '4px' }}>
            Per active customer
          </div>
        </div>

        {/* Top Segment */}
        <div style={{ background: 'white', padding: '24px', borderRadius: '12px', boxShadow: '0 1px 3px rgba(0,0,0,0.1)', border: '2px solid #f59e0b' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'start', marginBottom: '12px' }}>
            <div style={{ fontSize: '14px', color: '#6b7280', fontWeight: '600' }}>Platinum Customers</div>
            <Crown size={24} color="#f59e0b" />
          </div>
          <div style={{ fontSize: '36px', fontWeight: 'bold', color: '#f59e0b' }}>{segmentBreakdown.platinum || 0}</div>
          <div style={{ fontSize: '13px', color: '#6b7280', marginTop: '4px' }}>
            $50,000+ lifetime value
          </div>
        </div>
      </div>

      {/* Segment Breakdown with Charts */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1.5fr', gap: '24px', marginBottom: '30px' }}>
        {/* Pie Chart */}
        <div style={{ background: 'white', padding: '30px', borderRadius: '12px', boxShadow: '0 1px 3px rgba(0,0,0,0.1)' }}>
          <h2 style={{ fontSize: '20px', fontWeight: 'bold', color: '#111827', marginBottom: '24px' }}>
            Segment Distribution
          </h2>
          {(() => {
            const pieData = Object.entries(segmentConfig).map(([key, config]) => ({
              name: config.label,
              value: segmentBreakdown[key] || 0,
              color: SEGMENT_CHART_COLORS[key]
            })).filter(d => d.value > 0);

            const totalCustomers = pieData.reduce((sum, d) => sum + d.value, 0);

            if (totalCustomers === 0) {
              return <div style={{ textAlign: 'center', padding: '40px', color: '#9ca3af' }}>No segment data</div>;
            }

            return (
              <ResponsiveContainer width="100%" height={280}>
                <PieChart>
                  <Pie
                    data={pieData}
                    cx="50%"
                    cy="50%"
                    innerRadius={60}
                    outerRadius={100}
                    paddingAngle={3}
                    dataKey="value"
                    label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`}
                    labelLine={false}
                  >
                    {pieData.map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={entry.color} />
                    ))}
                  </Pie>
                  <Tooltip
                    formatter={(value, name) => [`${value} customers`, name]}
                    contentStyle={{ borderRadius: '8px', border: '1px solid #e5e7eb', boxShadow: '0 4px 12px rgba(0,0,0,0.1)' }}
                  />
                </PieChart>
              </ResponsiveContainer>
            );
          })()}
          <div style={{ display: 'flex', justifyContent: 'center', gap: '16px', marginTop: '16px', flexWrap: 'wrap' }}>
            {Object.entries(segmentConfig).map(([key, config]) => (
              <div key={key} style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                <div style={{ width: '12px', height: '12px', borderRadius: '3px', background: SEGMENT_CHART_COLORS[key] }} />
                <span style={{ fontSize: '12px', color: '#6b7280' }}>{config.label}</span>
              </div>
            ))}
          </div>
        </div>

        {/* Segment Cards Grid */}
        <div style={{ background: 'white', padding: '30px', borderRadius: '12px', boxShadow: '0 1px 3px rgba(0,0,0,0.1)' }}>
          <h2 style={{ fontSize: '20px', fontWeight: 'bold', color: '#111827', marginBottom: '24px' }}>
            Segment Breakdown
          </h2>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '16px' }}>
            {Object.entries(segmentConfig).map(([key, config]) => {
              const count = segmentBreakdown[key] || 0;
              const IconComponent = config.icon;
              const totalWithData = (segmentBreakdown.platinum || 0) + (segmentBreakdown.gold || 0) +
                                     (segmentBreakdown.silver || 0) + (segmentBreakdown.bronze || 0);
              const percentage = totalWithData > 0 ? ((count / totalWithData) * 100).toFixed(1) : 0;

              return (
                <div key={key} style={{
                  padding: '20px',
                  background: `linear-gradient(135deg, ${config.bgColor} 0%, white 100%)`,
                  borderRadius: '12px',
                  border: `2px solid ${config.color}30`,
                  transition: 'transform 0.2s ease, box-shadow 0.2s ease',
                  cursor: 'pointer'
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.transform = 'translateY(-2px)';
                  e.currentTarget.style.boxShadow = '0 8px 16px rgba(0,0,0,0.1)';
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.transform = 'translateY(0)';
                  e.currentTarget.style.boxShadow = 'none';
                }}
                onClick={() => setSelectedSegment(key)}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '12px' }}>
                    <div style={{
                      width: '44px',
                      height: '44px',
                      borderRadius: '12px',
                      background: config.color,
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center'
                    }}>
                      <IconComponent size={22} color="white" />
                    </div>
                    <div>
                      <div style={{ fontSize: '16px', fontWeight: 'bold', color: config.color }}>{config.label}</div>
                      <div style={{ fontSize: '11px', color: '#6b7280' }}>{config.threshold}</div>
                    </div>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'baseline', gap: '8px' }}>
                    <span style={{ fontSize: '28px', fontWeight: 'bold', color: config.color }}>{count}</span>
                    <span style={{ fontSize: '14px', color: '#6b7280' }}>({percentage}%)</span>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* Filters */}
      <div style={{ background: 'white', padding: '20px', borderRadius: '12px', boxShadow: '0 1px 3px rgba(0,0,0,0.1)', marginBottom: '20px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '16px', flexWrap: 'wrap' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <Filter size={18} color="#6b7280" />
            <span style={{ fontSize: '14px', fontWeight: '600', color: '#374151' }}>Filters:</span>
          </div>

          {/* Segment Filter */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <label style={{ fontSize: '14px', color: '#6b7280' }}>Segment:</label>
            <select
              value={selectedSegment}
              onChange={(e) => setSelectedSegment(e.target.value)}
              style={{
                padding: '8px 12px',
                borderRadius: '6px',
                border: '1px solid #d1d5db',
                fontSize: '14px',
                background: 'white',
                cursor: 'pointer'
              }}
            >
              <option value="all">All Segments</option>
              <option value="platinum">Platinum ($50k+)</option>
              <option value="gold">Gold ($20k-$50k)</option>
              <option value="silver">Silver ($5k-$20k)</option>
              <option value="bronze">Bronze (Under $5k)</option>
            </select>
          </div>

          {/* Sort By */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <label style={{ fontSize: '14px', color: '#6b7280' }}>Sort by:</label>
            <select
              value={sortBy}
              onChange={(e) => setSortBy(e.target.value)}
              style={{
                padding: '8px 12px',
                borderRadius: '6px',
                border: '1px solid #d1d5db',
                fontSize: '14px',
                background: 'white',
                cursor: 'pointer'
              }}
            >
              <option value="lifetime_value">Lifetime Value</option>
              <option value="total_transactions">Transactions</option>
              <option value="average_order_value">Avg Order</option>
              <option value="customer_name">Name</option>
            </select>
          </div>

          {/* Sort Order */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <label style={{ fontSize: '14px', color: '#6b7280' }}>Order:</label>
            <select
              value={sortOrder}
              onChange={(e) => setSortOrder(e.target.value)}
              style={{
                padding: '8px 12px',
                borderRadius: '6px',
                border: '1px solid #d1d5db',
                fontSize: '14px',
                background: 'white',
                cursor: 'pointer'
              }}
            >
              <option value="DESC">Highest First</option>
              <option value="ASC">Lowest First</option>
            </select>
          </div>

          {/* Limit */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <label style={{ fontSize: '14px', color: '#6b7280' }}>Show:</label>
            <select
              value={limit}
              onChange={(e) => setLimit(parseInt(e.target.value))}
              style={{
                padding: '8px 12px',
                borderRadius: '6px',
                border: '1px solid #d1d5db',
                fontSize: '14px',
                background: 'white',
                cursor: 'pointer'
              }}
            >
              <option value="10">Top 10</option>
              <option value="20">Top 20</option>
              <option value="50">Top 50</option>
              <option value="100">Top 100</option>
            </select>
          </div>
        </div>
      </div>

      {/* Churn Risk Analysis Panel */}
      <div style={{ marginBottom: '30px' }}>
        <ChurnRiskPanel
          onNavigate={(view, params) => {
            // Navigation callback - integrate with your router
          }}
          onContact={(type, customer) => {
            // Contact callback - integrate with your email/phone system
          }}
        />
      </div>

      {/* Top Customers Table */}
      <div style={{ background: 'white', padding: '30px', borderRadius: '12px', boxShadow: '0 1px 3px rgba(0,0,0,0.1)' }}>
        <h2 style={{ fontSize: '20px', fontWeight: 'bold', color: '#111827', marginBottom: '20px' }}>
          Top Customers by Lifetime Value
          {selectedSegment !== 'all' && (
            <span style={{
              marginLeft: '12px',
              fontSize: '14px',
              padding: '4px 12px',
              background: segmentConfig[selectedSegment]?.bgColor || '#f3f4f6',
              color: segmentConfig[selectedSegment]?.color || '#6b7280',
              borderRadius: '20px'
            }}>
              {segmentConfig[selectedSegment]?.label || selectedSegment}
            </span>
          )}
        </h2>

        {customers.length === 0 ? (
          <div style={{ padding: '40px', textAlign: 'center', color: '#6b7280' }}>
            <div style={{ fontSize: '48px', marginBottom: '12px' }}>📊</div>
            <div style={{ fontSize: '16px' }}>No customer data available</div>
          </div>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: '800px' }}>
              <thead>
                <tr style={{ borderBottom: '2px solid #e5e7eb' }}>
                  <th style={{ padding: '14px 12px', textAlign: 'left', fontSize: '12px', fontWeight: '600', color: '#6b7280', textTransform: 'uppercase' }}>Rank</th>
                  <th style={{ padding: '14px 12px', textAlign: 'left', fontSize: '12px', fontWeight: '600', color: '#6b7280', textTransform: 'uppercase' }}>Customer</th>
                  <th style={{ padding: '14px 12px', textAlign: 'left', fontSize: '12px', fontWeight: '600', color: '#6b7280', textTransform: 'uppercase' }}>Segment</th>
                  <th style={{ padding: '14px 12px', textAlign: 'right', fontSize: '12px', fontWeight: '600', color: '#6b7280', textTransform: 'uppercase' }}>Lifetime Value</th>
                  <th style={{ padding: '14px 12px', textAlign: 'center', fontSize: '12px', fontWeight: '600', color: '#6b7280', textTransform: 'uppercase' }}>Transactions</th>
                  <th style={{ padding: '14px 12px', textAlign: 'right', fontSize: '12px', fontWeight: '600', color: '#6b7280', textTransform: 'uppercase' }}>Avg Order</th>
                  <th style={{ padding: '14px 12px', textAlign: 'left', fontSize: '12px', fontWeight: '600', color: '#6b7280', textTransform: 'uppercase' }}>Last Activity</th>
                </tr>
              </thead>
              <tbody>
                {customers.map((customer, index) => {
                  const segment = customer.segment || 'bronze';
                  const config = segmentConfig[segment];
                  const IconComponent = config?.icon || Star;

                  return (
                    <tr key={customer.customerId} style={{ borderBottom: '1px solid #f3f4f6' }}>
                      <td style={{ padding: '16px 12px' }}>
                        <span style={{
                          display: 'inline-flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          width: '32px',
                          height: '32px',
                          borderRadius: '50%',
                          background: index < 3 ? '#fef3c7' : '#f3f4f6',
                          color: index < 3 ? '#b45309' : '#6b7280',
                          fontWeight: 'bold',
                          fontSize: '14px'
                        }}>
                          {index + 1}
                        </span>
                      </td>
                      <td style={{ padding: '16px 12px' }}>
                        <div style={{ fontWeight: '600', color: '#111827', marginBottom: '2px' }}>
                          {customer.customerName || 'Unknown'}
                        </div>
                        <div style={{ fontSize: '13px', color: '#6b7280' }}>
                          {customer.email || customer.company || ''}
                        </div>
                      </td>
                      <td style={{ padding: '16px 12px' }}>
                        <span style={{
                          display: 'inline-flex',
                          alignItems: 'center',
                          gap: '6px',
                          padding: '6px 12px',
                          background: config?.bgColor || '#f3f4f6',
                          color: config?.color || '#6b7280',
                          borderRadius: '20px',
                          fontSize: '13px',
                          fontWeight: '600'
                        }}>
                          <IconComponent size={14} />
                          {config?.label || segment}
                        </span>
                      </td>
                      <td style={{ padding: '16px 12px', textAlign: 'right', fontWeight: '700', color: '#10b981', fontSize: '15px' }}>
                        {formatCurrency(customer.lifetimeValue)}
                      </td>
                      <td style={{ padding: '16px 12px', textAlign: 'center', fontWeight: '600', color: '#374151' }}>
                        {customer.totalTransactions || 0}
                      </td>
                      <td style={{ padding: '16px 12px', textAlign: 'right', color: '#6b7280' }}>
                        {formatCurrency(customer.averageOrderValue)}
                      </td>
                      <td style={{ padding: '16px 12px', color: '#6b7280', fontSize: '13px' }}>
                        {formatDate(customer.lastActivity)}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
};

export default CLVDashboard;
