import React, { useState, useEffect, useRef } from 'react';
import { BarChart3, TrendingUp, DollarSign, Package, Calendar, Users } from 'lucide-react';
import { cachedFetch } from '../services/apiCache';

const API_BASE = `${process.env.REACT_APP_API_URL || 'http://localhost:3001'}/api`;

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
      const [data, topData] = await Promise.all([
        cachedFetch(`/api/analytics/revenue-features?period=${period}`),
        cachedFetch('/api/analytics/top-features?limit=10')
      ]);

      if (!isMounted.current) return;
      setAnalytics(data);
      setTopFeatures(topData);
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
    return `$${(cents / 100).toFixed(2)}`;
  };

  const formatPercent = (value) => {
    return `${value.toFixed(1)}%`;
  };

  const maxAdoption = Math.max(
    analytics?.featureAdoption?.financing || 0,
    analytics?.featureAdoption?.warranties || 0,
    analytics?.featureAdoption?.delivery || 0,
    analytics?.featureAdoption?.rebates || 0,
    analytics?.featureAdoption?.tradeIns || 0
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
            {formatCurrency(analytics?.revenue?.total || 0)}
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
            {formatCurrency(analytics?.averages?.revenuePerQuote || 0)}
          </div>
          <div style={{ fontSize: '12px', color: '#6b7280', marginTop: '5px' }}>
            {(analytics?.averages?.featuresPerQuote || 0).toFixed(1)} features per quote
          </div>
        </div>

        {/* Period Info */}
        <div style={{ background: 'white', padding: '20px', borderRadius: '12px', boxShadow: '0 1px 3px rgba(0,0,0,0.1)', border: '2px solid #f59e0b' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'start', marginBottom: '10px' }}>
            <div style={{ fontSize: '14px', color: '#6b7280', fontWeight: '600' }}>Period</div>
            <Calendar size={20} color="#f59e0b" />
          </div>
          <div style={{ fontSize: '32px', fontWeight: 'bold', color: '#f59e0b' }}>
            {analytics?.period?.days || period}
          </div>
          <div style={{ fontSize: '12px', color: '#6b7280', marginTop: '5px' }}>
            days analyzed
          </div>
        </div>
      </div>

      {/* Feature Adoption Chart */}
      <div style={{ background: 'white', padding: '30px', borderRadius: '12px', boxShadow: '0 1px 3px rgba(0,0,0,0.1)', marginBottom: '30px' }}>
        <h2 style={{ fontSize: '20px', fontWeight: 'bold', color: '#111827', marginBottom: '20px' }}>
          Feature Adoption
        </h2>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
          {/* Financing */}
          <div>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '8px' }}>
              <span style={{ fontSize: '14px', fontWeight: '600', color: '#374151' }}>💳 Financing</span>
              <span style={{ fontSize: '14px', fontWeight: 'bold', color: '#3b82f6' }}>
                {analytics.featureAdoption.financing} quotes
              </span>
            </div>
            <div style={{ background: '#e5e7eb', height: '12px', borderRadius: '6px', overflow: 'hidden' }}>
              <div style={{
                background: '#3b82f6',
                height: '100%',
                width: maxAdoption > 0 ? `${(analytics.featureAdoption.financing / maxAdoption) * 100}%` : '0%',
                transition: 'width 0.3s'
              }} />
            </div>
          </div>

          {/* Warranties */}
          <div>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '8px' }}>
              <span style={{ fontSize: '14px', fontWeight: '600', color: '#374151' }}>🛡️ Extended Warranties</span>
              <span style={{ fontSize: '14px', fontWeight: 'bold', color: '#10b981' }}>
                {analytics.featureAdoption.warranties} quotes ({formatCurrency(analytics.revenue.warranties)})
              </span>
            </div>
            <div style={{ background: '#e5e7eb', height: '12px', borderRadius: '6px', overflow: 'hidden' }}>
              <div style={{
                background: '#10b981',
                height: '100%',
                width: maxAdoption > 0 ? `${(analytics.featureAdoption.warranties / maxAdoption) * 100}%` : '0%',
                transition: 'width 0.3s'
              }} />
            </div>
          </div>

          {/* Delivery */}
          <div>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '8px' }}>
              <span style={{ fontSize: '14px', fontWeight: '600', color: '#374151' }}>🚚 Delivery & Installation</span>
              <span style={{ fontSize: '14px', fontWeight: 'bold', color: '#8b5cf6' }}>
                {analytics.featureAdoption.delivery} quotes ({formatCurrency(analytics.revenue.delivery)})
              </span>
            </div>
            <div style={{ background: '#e5e7eb', height: '12px', borderRadius: '6px', overflow: 'hidden' }}>
              <div style={{
                background: '#8b5cf6',
                height: '100%',
                width: maxAdoption > 0 ? `${(analytics.featureAdoption.delivery / maxAdoption) * 100}%` : '0%',
                transition: 'width 0.3s'
              }} />
            </div>
          </div>

          {/* Rebates */}
          <div>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '8px' }}>
              <span style={{ fontSize: '14px', fontWeight: '600', color: '#374151' }}>🎁 Manufacturer Rebates</span>
              <span style={{ fontSize: '14px', fontWeight: 'bold', color: '#f59e0b' }}>
                {analytics.featureAdoption.rebates} quotes
              </span>
            </div>
            <div style={{ background: '#e5e7eb', height: '12px', borderRadius: '6px', overflow: 'hidden' }}>
              <div style={{
                background: '#f59e0b',
                height: '100%',
                width: maxAdoption > 0 ? `${(analytics.featureAdoption.rebates / maxAdoption) * 100}%` : '0%',
                transition: 'width 0.3s'
              }} />
            </div>
          </div>

          {/* Trade-Ins */}
          <div>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '8px' }}>
              <span style={{ fontSize: '14px', fontWeight: '600', color: '#374151' }}>♻️ Trade-In Credits</span>
              <span style={{ fontSize: '14px', fontWeight: 'bold', color: '#06b6d4' }}>
                {analytics.featureAdoption.tradeIns} quotes ({formatCurrency(analytics.revenue.tradeIns)} credit)
              </span>
            </div>
            <div style={{ background: '#e5e7eb', height: '12px', borderRadius: '6px', overflow: 'hidden' }}>
              <div style={{
                background: '#06b6d4',
                height: '100%',
                width: maxAdoption > 0 ? `${(analytics.featureAdoption.tradeIns / maxAdoption) * 100}%` : '0%',
                transition: 'width 0.3s'
              }} />
            </div>
          </div>
        </div>
      </div>

      {/* Revenue Breakdown */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: '20px', marginBottom: '30px' }}>
        {/* Warranty Revenue */}
        <div style={{ background: 'linear-gradient(135deg, #10b981 0%, #059669 100%)', padding: '24px', borderRadius: '12px', color: 'white' }}>
          <div style={{ fontSize: '14px', opacity: 0.9, marginBottom: '8px' }}>Warranty Revenue</div>
          <div style={{ fontSize: '36px', fontWeight: 'bold', marginBottom: '5px' }}>
            {formatCurrency(analytics.revenue.warranties)}
          </div>
          <div style={{ fontSize: '12px', opacity: 0.8 }}>{analytics.featureAdoption.warranties} warranty plans sold</div>
        </div>

        {/* Delivery Revenue */}
        <div style={{ background: 'linear-gradient(135deg, #8b5cf6 0%, #7c3aed 100%)', padding: '24px', borderRadius: '12px', color: 'white' }}>
          <div style={{ fontSize: '14px', opacity: 0.9, marginBottom: '8px' }}>Delivery Revenue</div>
          <div style={{ fontSize: '36px', fontWeight: 'bold', marginBottom: '5px' }}>
            {formatCurrency(analytics.revenue.delivery)}
          </div>
          <div style={{ fontSize: '12px', opacity: 0.8 }}>{analytics.featureAdoption.delivery} deliveries scheduled</div>
        </div>

        {/* Total Feature Revenue */}
        <div style={{ background: 'linear-gradient(135deg, #3b82f6 0%, #2563eb 100%)', padding: '24px', borderRadius: '12px', color: 'white' }}>
          <div style={{ fontSize: '14px', opacity: 0.9, marginBottom: '8px' }}>Combined Revenue</div>
          <div style={{ fontSize: '36px', fontWeight: 'bold', marginBottom: '5px' }}>
            {formatCurrency(analytics.revenue.total)}
          </div>
          <div style={{ fontSize: '12px', opacity: 0.8 }}>Direct revenue from add-ons</div>
        </div>
      </div>

      {/* Recent Quotes with Features */}
      {topFeatures.length > 0 && (
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
                {topFeatures.map((feature, index) => (
                  <tr key={index} style={{ borderBottom: '1px solid #f3f4f6' }}>
                    <td style={{ padding: '12px', fontSize: '14px', fontWeight: '500', color: '#111827' }}>Q-{feature.quoteId}</td>
                    <td style={{ padding: '12px', fontSize: '14px', color: '#6b7280' }}>
                      {new Date(feature.date).toLocaleDateString()}
                    </td>
                    <td style={{ padding: '12px', fontSize: '14px', fontWeight: '600', color: '#10b981', textAlign: 'right' }}>
                      {formatCurrency(feature.total)}
                    </td>
                    <td style={{ padding: '12px', textAlign: 'center' }}>
                      {feature.features.financing ? <span style={{ color: '#10b981', fontSize: '18px' }}>✓</span> : <span style={{ color: '#d1d5db' }}>−</span>}
                    </td>
                    <td style={{ padding: '12px', textAlign: 'center' }}>
                      {feature.features.warranties > 0 ? (
                        <span style={{ color: '#10b981', fontSize: '14px', fontWeight: '600' }}>{feature.features.warranties}</span>
                      ) : (
                        <span style={{ color: '#d1d5db' }}>−</span>
                      )}
                    </td>
                    <td style={{ padding: '12px', textAlign: 'center' }}>
                      {feature.features.delivery ? <span style={{ color: '#10b981', fontSize: '18px' }}>✓</span> : <span style={{ color: '#d1d5db' }}>−</span>}
                    </td>
                    <td style={{ padding: '12px', textAlign: 'center' }}>
                      {feature.features.rebates > 0 ? (
                        <span style={{ color: '#f59e0b', fontSize: '14px', fontWeight: '600' }}>{feature.features.rebates}</span>
                      ) : (
                        <span style={{ color: '#d1d5db' }}>−</span>
                      )}
                    </td>
                    <td style={{ padding: '12px', textAlign: 'center' }}>
                      {feature.features.tradeIns > 0 ? (
                        <span style={{ color: '#06b6d4', fontSize: '14px', fontWeight: '600' }}>{feature.features.tradeIns}</span>
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
