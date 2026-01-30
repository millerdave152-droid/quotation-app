import React, { useState, useEffect, useRef } from 'react';
import { BarChart3, TrendingUp, DollarSign, Package, Calendar, Users } from 'lucide-react';
import { cachedFetch } from '../services/apiCache';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  PieChart, Pie, Cell, Legend
} from 'recharts';

const API_BASE = `${process.env.REACT_APP_API_URL || 'http://localhost:3001'}/api`;

// Feature chart colors
const FEATURE_COLORS = {
  financing: '#3b82f6',
  warranties: '#10b981',
  delivery: '#8b5cf6',
  rebates: '#f59e0b',
  tradeIns: '#06b6d4'
};

const RevenueAnalytics = () => {
  const [analytics, setAnalytics] = useState(null);
  const [topFeatures, setTopFeatures] = useState([]);
  const [loading, setLoading] = useState(true);
  const [period, setPeriod] = useState('30'); // 30, 60, 90 days
  const [error, setError] = useState(null);

  const isMounted = useRef(true);
  const loadedOnce = useRef(false);

  // Cleanup on unmount
  useEffect(() => {
    isMounted.current = true;

    if (!loadedOnce.current) {
      loadedOnce.current = true;
      fetchAnalytics();
    }

    return () => {
      isMounted.current = false;
    };
  }, []);

  // Refetch when period changes (but not on initial mount)
  useEffect(() => {
    if (loadedOnce.current && isMounted.current) {
      fetchAnalytics();
    }
  }, [period]);

  // Fetch analytics data with caching
  const fetchAnalytics = async () => {
    if (!isMounted.current) return;

    setLoading(true);
    setError(null);
    try {
      // Fetch both analytics and top features in parallel with caching
      const [analyticsResponse, topFeaturesResponse] = await Promise.all([
        cachedFetch(`/api/analytics/revenue-features?period=${period}`),
        cachedFetch('/api/analytics/top-features?limit=10')
      ]);

      if (!isMounted.current) return;

      // Extract data from wrapped response (backend uses res.success() which wraps in { success, data, ... })
      const analyticsData = analyticsResponse?.data || analyticsResponse || {};
      const topFeaturesData = Array.isArray(topFeaturesResponse?.data)
        ? topFeaturesResponse.data
        : (Array.isArray(topFeaturesResponse) ? topFeaturesResponse : []);

      setAnalytics(analyticsData);
      setTopFeatures(topFeaturesData);
    } catch (err) {
      console.error('Analytics fetch error:', err);
      if (isMounted.current) {
        setError(err.message);
      }
    } finally {
      if (isMounted.current) {
        setLoading(false);
      }
    }
  };

  if (loading) {
    return (
      <div style={{ padding: '40px', textAlign: 'center' }}>
        <div style={{ fontSize: '18px', color: '#6b7280' }}>Loading analytics...</div>
      </div>
    );
  }

  if (error) {
    return (
      <div style={{ padding: '40px', textAlign: 'center' }}>
        <div style={{ fontSize: '18px', color: '#ef4444' }}>Error: {error}</div>
        <button
          onClick={fetchAnalytics}
          style={{
            marginTop: '20px',
            padding: '10px 20px',
            background: '#3b82f6',
            color: 'white',
            border: 'none',
            borderRadius: '6px',
            cursor: 'pointer'
          }}
        >
          Retry
        </button>
      </div>
    );
  }

  if (!analytics) {
    return (
      <div style={{ padding: '40px', textAlign: 'center' }}>
        <div style={{ fontSize: '18px', color: '#6b7280' }}>No analytics data available</div>
      </div>
    );
  }

  const formatCurrency = (cents) => {
    if (cents === null || cents === undefined || isNaN(cents)) return '$0.00';
    return `$${(cents / 100).toFixed(2)}`;
  };

  const formatPercent = (value) => {
    if (value === null || value === undefined || isNaN(value)) return '0.0%';
    return `${value.toFixed(1)}%`;
  };

  const formatDate = (dateValue) => {
    if (!dateValue) return 'N/A';
    try {
      const date = new Date(dateValue);
      if (isNaN(date.getTime())) return 'N/A';
      return date.toLocaleDateString();
    } catch {
      return 'N/A';
    }
  };

  // Safe accessor for nested properties
  const featureAdoption = analytics?.featureAdoption || {};
  const revenue = analytics?.revenue || {};
  const averages = analytics?.averages || {};
  const periodInfo = analytics?.period || {};

  const maxAdoption = Math.max(
    featureAdoption.financing || 0,
    featureAdoption.warranties || 0,
    featureAdoption.delivery || 0,
    featureAdoption.rebates || 0,
    featureAdoption.tradeIns || 0
  );

  return (
    <div style={{ padding: '20px', maxWidth: '1400px', margin: '0 auto' }}>
      {/* Header */}
      <div style={{ marginBottom: '30px' }}>
        <h1 style={{ fontSize: '32px', fontWeight: 'bold', color: '#111827', marginBottom: '10px', display: 'flex', alignItems: 'center', gap: '12px' }}>
          <BarChart3 size={36} color="#3b82f6" />
          Revenue Features Analytics
        </h1>
        <p style={{ fontSize: '16px', color: '#6b7280' }}>
          Track revenue feature adoption and performance over time
        </p>
      </div>

      {/* Period Selector */}
      <div style={{ marginBottom: '30px', display: 'flex', gap: '10px' }}>
        {['7', '30', '60', '90'].map(p => (
          <button
            key={p}
            onClick={() => setPeriod(p)}
            style={{
              padding: '10px 20px',
              background: period === p ? '#3b82f6' : '#f3f4f6',
              color: period === p ? 'white' : '#374151',
              border: 'none',
              borderRadius: '6px',
              cursor: 'pointer',
              fontWeight: period === p ? 'bold' : 'normal',
              transition: 'all 0.2s'
            }}
          >
            Last {p} days
          </button>
        ))}
      </div>

      {/* Summary Cards */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(250px, 1fr))', gap: '20px', marginBottom: '30px' }}>
        {/* Total Quotes with Features */}
        <div style={{ background: 'white', padding: '20px', borderRadius: '12px', boxShadow: '0 1px 3px rgba(0,0,0,0.1)', border: '2px solid #e5e7eb' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'start', marginBottom: '10px' }}>
            <div style={{ fontSize: '14px', color: '#6b7280', fontWeight: '600' }}>Quotes with Features</div>
            <Package size={20} color="#3b82f6" />
          </div>
          <div style={{ fontSize: '32px', fontWeight: 'bold', color: '#111827' }}>{analytics?.totalQuotes || 0}</div>
          <div style={{ fontSize: '12px', color: '#10b981', marginTop: '5px' }}>
            {formatPercent(analytics?.adoptionRate || 0)} adoption rate
          </div>
        </div>

        {/* Total Revenue from Features */}
        <div style={{ background: 'white', padding: '20px', borderRadius: '12px', boxShadow: '0 1px 3px rgba(0,0,0,0.1)', border: '2px solid #10b981' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'start', marginBottom: '10px' }}>
            <div style={{ fontSize: '14px', color: '#6b7280', fontWeight: '600' }}>Total Revenue</div>
            <DollarSign size={20} color="#10b981" />
          </div>
          <div style={{ fontSize: '32px', fontWeight: 'bold', color: '#10b981' }}>
            {formatCurrency(revenue.total || 0)}
          </div>
          <div style={{ fontSize: '12px', color: '#6b7280', marginTop: '5px' }}>
            Warranties + Delivery
          </div>
        </div>

        {/* Average Revenue per Quote */}
        <div style={{ background: 'white', padding: '20px', borderRadius: '12px', boxShadow: '0 1px 3px rgba(0,0,0,0.1)', border: '2px solid #8b5cf6' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'start', marginBottom: '10px' }}>
            <div style={{ fontSize: '14px', color: '#6b7280', fontWeight: '600' }}>Avg per Quote</div>
            <TrendingUp size={20} color="#8b5cf6" />
          </div>
          <div style={{ fontSize: '32px', fontWeight: 'bold', color: '#8b5cf6' }}>
            {formatCurrency(averages.revenuePerQuote || 0)}
          </div>
          <div style={{ fontSize: '12px', color: '#6b7280', marginTop: '5px' }}>
            {(averages.featuresPerQuote || 0).toFixed(1)} features per quote
          </div>
        </div>

        {/* Period Info */}
        <div style={{ background: 'white', padding: '20px', borderRadius: '12px', boxShadow: '0 1px 3px rgba(0,0,0,0.1)', border: '2px solid #f59e0b' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'start', marginBottom: '10px' }}>
            <div style={{ fontSize: '14px', color: '#6b7280', fontWeight: '600' }}>Period</div>
            <Calendar size={20} color="#f59e0b" />
          </div>
          <div style={{ fontSize: '32px', fontWeight: 'bold', color: '#f59e0b' }}>
            {periodInfo.days || period}
          </div>
          <div style={{ fontSize: '12px', color: '#6b7280', marginTop: '5px' }}>
            days analyzed
          </div>
        </div>
      </div>

      {/* Feature Adoption Charts */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '24px', marginBottom: '30px' }}>
        {/* Bar Chart */}
        <div style={{ background: 'white', padding: '30px', borderRadius: '12px', boxShadow: '0 1px 3px rgba(0,0,0,0.1)' }}>
          <h2 style={{ fontSize: '20px', fontWeight: 'bold', color: '#111827', marginBottom: '20px' }}>
            Feature Adoption by Quotes
          </h2>
          {(() => {
            const barData = [
              { name: 'Financing', value: featureAdoption.financing || 0, fill: FEATURE_COLORS.financing },
              { name: 'Warranties', value: featureAdoption.warranties || 0, fill: FEATURE_COLORS.warranties },
              { name: 'Delivery', value: featureAdoption.delivery || 0, fill: FEATURE_COLORS.delivery },
              { name: 'Rebates', value: featureAdoption.rebates || 0, fill: FEATURE_COLORS.rebates },
              { name: 'Trade-Ins', value: featureAdoption.tradeIns || 0, fill: FEATURE_COLORS.tradeIns }
            ];

            return (
              <ResponsiveContainer width="100%" height={250}>
                <BarChart data={barData} margin={{ top: 10, right: 10, left: 10, bottom: 5 }}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f3f4f6" />
                  <XAxis dataKey="name" stroke="#9ca3af" fontSize={12} tickLine={false} />
                  <YAxis stroke="#9ca3af" fontSize={12} tickLine={false} allowDecimals={false} />
                  <Tooltip
                    formatter={(value) => [`${value} quotes`, 'Adoption']}
                    contentStyle={{ borderRadius: '8px', border: '1px solid #e5e7eb', boxShadow: '0 4px 12px rgba(0,0,0,0.1)' }}
                  />
                  <Bar dataKey="value" radius={[4, 4, 0, 0]} barSize={40}>
                    {barData.map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={entry.fill} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            );
          })()}
        </div>

        {/* Revenue Pie Chart */}
        <div style={{ background: 'white', padding: '30px', borderRadius: '12px', boxShadow: '0 1px 3px rgba(0,0,0,0.1)' }}>
          <h2 style={{ fontSize: '20px', fontWeight: 'bold', color: '#111827', marginBottom: '20px' }}>
            Revenue by Feature
          </h2>
          {(() => {
            const pieData = [
              { name: 'Warranties', value: (revenue.warranties || 0) / 100, color: FEATURE_COLORS.warranties },
              { name: 'Delivery', value: (revenue.delivery || 0) / 100, color: FEATURE_COLORS.delivery }
            ].filter(d => d.value > 0);

            if (pieData.length === 0) {
              return <div style={{ textAlign: 'center', padding: '60px', color: '#9ca3af' }}>No revenue data</div>;
            }

            return (
              <ResponsiveContainer width="100%" height={250}>
                <PieChart>
                  <Pie
                    data={pieData}
                    cx="50%"
                    cy="50%"
                    innerRadius={50}
                    outerRadius={90}
                    paddingAngle={3}
                    dataKey="value"
                    label={({ name, value }) => `${name}: $${value.toLocaleString()}`}
                    labelLine={true}
                  >
                    {pieData.map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={entry.color} />
                    ))}
                  </Pie>
                  <Tooltip
                    formatter={(value) => [`$${value.toLocaleString()}`, 'Revenue']}
                    contentStyle={{ borderRadius: '8px', border: '1px solid #e5e7eb' }}
                  />
                </PieChart>
              </ResponsiveContainer>
            );
          })()}
        </div>
      </div>

      {/* Feature Details Cards */}
      <div style={{ background: 'white', padding: '30px', borderRadius: '12px', boxShadow: '0 1px 3px rgba(0,0,0,0.1)', marginBottom: '30px' }}>
        <h2 style={{ fontSize: '20px', fontWeight: 'bold', color: '#111827', marginBottom: '20px' }}>
          Feature Performance Details
        </h2>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '16px' }}>
          {[
            { key: 'financing', label: 'Financing', icon: '💳', count: featureAdoption.financing, revenue: null },
            { key: 'warranties', label: 'Warranties', icon: '🛡️', count: featureAdoption.warranties, revenue: revenue.warranties },
            { key: 'delivery', label: 'Delivery', icon: '🚚', count: featureAdoption.delivery, revenue: revenue.delivery },
            { key: 'rebates', label: 'Rebates', icon: '🎁', count: featureAdoption.rebates, revenue: null },
            { key: 'tradeIns', label: 'Trade-Ins', icon: '♻️', count: featureAdoption.tradeIns, revenue: revenue.tradeIns }
          ].map(feature => (
            <div key={feature.key} style={{
              padding: '20px',
              background: `linear-gradient(135deg, ${FEATURE_COLORS[feature.key]}15 0%, white 100%)`,
              borderRadius: '12px',
              border: `2px solid ${FEATURE_COLORS[feature.key]}30`,
              transition: 'transform 0.2s ease'
            }}
            onMouseEnter={(e) => e.currentTarget.style.transform = 'scale(1.02)'}
            onMouseLeave={(e) => e.currentTarget.style.transform = 'scale(1)'}
            >
              <div style={{ fontSize: '28px', marginBottom: '8px' }}>{feature.icon}</div>
              <div style={{ fontSize: '14px', fontWeight: '600', color: '#374151', marginBottom: '4px' }}>{feature.label}</div>
              <div style={{ fontSize: '24px', fontWeight: 'bold', color: FEATURE_COLORS[feature.key] }}>{feature.count || 0}</div>
              <div style={{ fontSize: '12px', color: '#6b7280' }}>quotes</div>
              {feature.revenue !== null && (
                <div style={{ marginTop: '8px', paddingTop: '8px', borderTop: '1px solid #e5e7eb' }}>
                  <div style={{ fontSize: '16px', fontWeight: '600', color: '#10b981' }}>{formatCurrency(feature.revenue || 0)}</div>
                  <div style={{ fontSize: '11px', color: '#9ca3af' }}>revenue</div>
                </div>
              )}
            </div>
          ))}
        </div>
      </div>

      {/* Revenue Breakdown */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: '20px', marginBottom: '30px' }}>
        {/* Warranty Revenue */}
        <div style={{ background: 'linear-gradient(135deg, #10b981 0%, #059669 100%)', padding: '24px', borderRadius: '12px', color: 'white' }}>
          <div style={{ fontSize: '14px', opacity: 0.9, marginBottom: '8px' }}>Warranty Revenue</div>
          <div style={{ fontSize: '36px', fontWeight: 'bold', marginBottom: '5px' }}>
            {formatCurrency(revenue.warranties || 0)}
          </div>
          <div style={{ fontSize: '12px', opacity: 0.8 }}>{featureAdoption.warranties || 0} warranty plans sold</div>
        </div>

        {/* Delivery Revenue */}
        <div style={{ background: 'linear-gradient(135deg, #8b5cf6 0%, #7c3aed 100%)', padding: '24px', borderRadius: '12px', color: 'white' }}>
          <div style={{ fontSize: '14px', opacity: 0.9, marginBottom: '8px' }}>Delivery Revenue</div>
          <div style={{ fontSize: '36px', fontWeight: 'bold', marginBottom: '5px' }}>
            {formatCurrency(revenue.delivery || 0)}
          </div>
          <div style={{ fontSize: '12px', opacity: 0.8 }}>{featureAdoption.delivery || 0} deliveries scheduled</div>
        </div>

        {/* Total Feature Revenue */}
        <div style={{ background: 'linear-gradient(135deg, #3b82f6 0%, #2563eb 100%)', padding: '24px', borderRadius: '12px', color: 'white' }}>
          <div style={{ fontSize: '14px', opacity: 0.9, marginBottom: '8px' }}>Combined Revenue</div>
          <div style={{ fontSize: '36px', fontWeight: 'bold', marginBottom: '5px' }}>
            {formatCurrency(revenue.total || 0)}
          </div>
          <div style={{ fontSize: '12px', opacity: 0.8 }}>Direct revenue from add-ons</div>
        </div>
      </div>

      {/* Recent Quotes with Features */}
      {Array.isArray(topFeatures) && topFeatures.length > 0 && (
        <div style={{ background: 'white', padding: '30px', borderRadius: '12px', boxShadow: '0 1px 3px rgba(0,0,0,0.1)' }}>
          <h2 style={{ fontSize: '20px', fontWeight: 'bold', color: '#111827', marginBottom: '20px' }}>
            Recent Quotes with Revenue Features
          </h2>
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr style={{ borderBottom: '2px solid #e5e7eb' }}>
                  <th style={{ padding: '12px', textAlign: 'left', fontSize: '12px', fontWeight: '600', color: '#6b7280', textTransform: 'uppercase' }}>Quote ID</th>
                  <th style={{ padding: '12px', textAlign: 'left', fontSize: '12px', fontWeight: '600', color: '#6b7280', textTransform: 'uppercase' }}>Date</th>
                  <th style={{ padding: '12px', textAlign: 'right', fontSize: '12px', fontWeight: '600', color: '#6b7280', textTransform: 'uppercase' }}>Total</th>
                  <th style={{ padding: '12px', textAlign: 'center', fontSize: '12px', fontWeight: '600', color: '#6b7280', textTransform: 'uppercase' }}>Financing</th>
                  <th style={{ padding: '12px', textAlign: 'center', fontSize: '12px', fontWeight: '600', color: '#6b7280', textTransform: 'uppercase' }}>Warranties</th>
                  <th style={{ padding: '12px', textAlign: 'center', fontSize: '12px', fontWeight: '600', color: '#6b7280', textTransform: 'uppercase' }}>Delivery</th>
                  <th style={{ padding: '12px', textAlign: 'center', fontSize: '12px', fontWeight: '600', color: '#6b7280', textTransform: 'uppercase' }}>Rebates</th>
                  <th style={{ padding: '12px', textAlign: 'center', fontSize: '12px', fontWeight: '600', color: '#6b7280', textTransform: 'uppercase' }}>Trade-Ins</th>
                </tr>
              </thead>
              <tbody>
                {topFeatures.filter(f => f != null).map((feature, index) => (
                  <tr key={index} style={{ borderBottom: '1px solid #f3f4f6' }}>
                    <td style={{ padding: '12px', fontSize: '14px', fontWeight: '500', color: '#111827' }}>Q-{feature?.quoteId || 'N/A'}</td>
                    <td style={{ padding: '12px', fontSize: '14px', color: '#6b7280' }}>
                      {formatDate(feature?.date)}
                    </td>
                    <td style={{ padding: '12px', fontSize: '14px', fontWeight: '600', color: '#10b981', textAlign: 'right' }}>
                      {formatCurrency(feature?.total)}
                    </td>
                    <td style={{ padding: '12px', textAlign: 'center' }}>
                      {feature?.features?.financing ? <span style={{ color: '#10b981', fontSize: '18px' }}>✓</span> : <span style={{ color: '#d1d5db' }}>−</span>}
                    </td>
                    <td style={{ padding: '12px', textAlign: 'center' }}>
                      {(feature?.features?.warranties || 0) > 0 ? (
                        <span style={{ color: '#10b981', fontSize: '14px', fontWeight: '600' }}>{feature?.features?.warranties}</span>
                      ) : (
                        <span style={{ color: '#d1d5db' }}>−</span>
                      )}
                    </td>
                    <td style={{ padding: '12px', textAlign: 'center' }}>
                      {feature?.features?.delivery ? <span style={{ color: '#10b981', fontSize: '18px' }}>✓</span> : <span style={{ color: '#d1d5db' }}>−</span>}
                    </td>
                    <td style={{ padding: '12px', textAlign: 'center' }}>
                      {(feature?.features?.rebates || 0) > 0 ? (
                        <span style={{ color: '#f59e0b', fontSize: '14px', fontWeight: '600' }}>{feature?.features?.rebates}</span>
                      ) : (
                        <span style={{ color: '#d1d5db' }}>−</span>
                      )}
                    </td>
                    <td style={{ padding: '12px', textAlign: 'center' }}>
                      {(feature?.features?.tradeIns || 0) > 0 ? (
                        <span style={{ color: '#06b6d4', fontSize: '14px', fontWeight: '600' }}>{feature?.features?.tradeIns}</span>
                      ) : (
                        <span style={{ color: '#d1d5db' }}>−</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
};

export default RevenueAnalytics;
