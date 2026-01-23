/**
 * LeadSourceROI - Lead source performance and ROI tracking
 * Shows which sources generate the best leads and revenue
 */

import React, { useState, useEffect } from 'react';
import {
  BarChart, Bar, PieChart, Pie, Cell,
  XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer
} from 'recharts';
import api from '../../services/api';
import { useToast } from '../ui/Toast';

const COLORS = ['#3b82f6', '#22c55e', '#f59e0b', '#ef4444', '#8b5cf6', '#06b6d4', '#ec4899'];

function LeadSourceROI() {
  const toast = useToast();
  const [loading, setLoading] = useState(true);
  const [period, setPeriod] = useState(90);
  const [data, setData] = useState(null);
  const [view, setView] = useState('overview');

  useEffect(() => {
    fetchData();
  }, [period]);

  const fetchData = async () => {
    setLoading(true);
    try {
      const response = await api.get(`/analytics/lead-sources?days=${period}`);
      setData(response.data?.data || response.data);
    } catch (error) {
      toast.error('Failed to load lead source data');
      console.error(error);
    } finally {
      setLoading(false);
    }
  };

  const formatCurrency = (cents) => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
      minimumFractionDigits: 0
    }).format(cents / 100);
  };

  if (loading) {
    return (
      <div className="lead-source-roi">
        <div className="loading-state">
          <div className="loading-spinner"></div>
          <p>Loading source analytics...</p>
        </div>
      </div>
    );
  }

  if (!data) {
    return (
      <div className="lead-source-roi">
        <div className="no-data">No data available</div>
      </div>
    );
  }

  const { sources, performance, topPerformers } = data;

  // Prepare chart data
  const pieData = sources?.slice(0, 6).map(s => ({
    name: s.source,
    value: s.totalLeads
  })) || [];

  const conversionData = sources?.map(s => ({
    source: s.source.length > 12 ? s.source.substring(0, 12) + '...' : s.source,
    conversionRate: s.metrics.conversionRate,
    avgScore: s.metrics.avgLeadScore
  })) || [];

  const revenueData = performance?.map(p => ({
    source: p.source.length > 12 ? p.source.substring(0, 12) + '...' : p.source,
    revenue: p.totalRevenue / 100,
    revenuePerLead: p.revenuePerLead / 100
  })) || [];

  return (
    <div className="lead-source-roi">
      <div className="roi-header">
        <div>
          <h1 style={{ margin: 0, fontSize: '1.5rem', fontWeight: 600 }}>Lead Source ROI</h1>
          <p style={{ margin: '4px 0 0', color: 'var(--text-secondary)' }}>
            Analyze which sources generate the best leads and revenue
          </p>
        </div>
        <div style={{ display: 'flex', gap: '8px' }}>
          {[30, 60, 90].map(days => (
            <button
              key={days}
              className={`btn btn-sm ${period === days ? 'btn-primary' : 'btn-secondary'}`}
              onClick={() => setPeriod(days)}
            >
              {days} Days
            </button>
          ))}
        </div>
      </div>

      {/* Top Performers Highlight */}
      {topPerformers?.length > 0 && (
        <div className="top-performers-section">
          <h3>Top Performing Sources</h3>
          <div className="top-performers-grid">
            {topPerformers.slice(0, 3).map((source, idx) => (
              <div key={idx} className="top-performer-card">
                <div className="performer-rank">#{idx + 1}</div>
                <div className="performer-source">{source.source}</div>
                <div className="performer-stats">
                  <div className="stat">
                    <span className="stat-value">{source.conversionRate}%</span>
                    <span className="stat-label">Conversion</span>
                  </div>
                  <div className="stat">
                    <span className="stat-value">{formatCurrency(source.revenue)}</span>
                    <span className="stat-label">Revenue</span>
                  </div>
                  <div className="stat">
                    <span className="stat-value">{source.totalLeads}</span>
                    <span className="stat-label">Leads</span>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Charts Grid */}
      <div className="charts-grid">
        {/* Lead Distribution Pie */}
        <div className="chart-card">
          <h3>Lead Distribution by Source</h3>
          {pieData.length > 0 ? (
            <ResponsiveContainer width="100%" height={250}>
              <PieChart>
                <Pie
                  data={pieData}
                  cx="50%"
                  cy="50%"
                  labelLine={false}
                  outerRadius={80}
                  fill="#8884d8"
                  dataKey="value"
                  label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`}
                >
                  {pieData.map((_, idx) => (
                    <Cell key={`cell-${idx}`} fill={COLORS[idx % COLORS.length]} />
                  ))}
                </Pie>
                <Tooltip formatter={(value) => `${value} leads`} />
              </PieChart>
            </ResponsiveContainer>
          ) : (
            <div className="no-data-small">No lead data</div>
          )}
        </div>

        {/* Conversion Rate by Source */}
        <div className="chart-card">
          <h3>Conversion Rate by Source</h3>
          {conversionData.length > 0 ? (
            <ResponsiveContainer width="100%" height={250}>
              <BarChart data={conversionData} layout="vertical">
                <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                <XAxis type="number" domain={[0, 100]} tick={{ fontSize: 11 }} />
                <YAxis dataKey="source" type="category" tick={{ fontSize: 11 }} width={90} />
                <Tooltip formatter={(value) => `${value}%`} />
                <Bar dataKey="conversionRate" fill="#22c55e" radius={[0, 4, 4, 0]} />
              </BarChart>
            </ResponsiveContainer>
          ) : (
            <div className="no-data-small">No conversion data</div>
          )}
        </div>
      </div>

      {/* Revenue by Source */}
      <div className="chart-card full-width">
        <h3>Revenue by Source</h3>
        {revenueData.length > 0 ? (
          <ResponsiveContainer width="100%" height={300}>
            <BarChart data={revenueData}>
              <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
              <XAxis dataKey="source" tick={{ fontSize: 11 }} />
              <YAxis tickFormatter={(v) => `$${v >= 1000 ? (v/1000).toFixed(0) + 'K' : v}`} tick={{ fontSize: 11 }} />
              <Tooltip formatter={(value) => `$${value.toLocaleString()}`} />
              <Legend />
              <Bar dataKey="revenue" name="Total Revenue" fill="#3b82f6" radius={[4, 4, 0, 0]} />
              <Bar dataKey="revenuePerLead" name="Rev/Lead" fill="#8b5cf6" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        ) : (
          <div className="no-data-small">No revenue data</div>
        )}
      </div>

      {/* Detailed Source Table */}
      <div className="source-table-section">
        <h3>Detailed Source Analysis</h3>
        <div className="source-table-container">
          <table className="source-table">
            <thead>
              <tr>
                <th>Source</th>
                <th style={{ textAlign: 'right' }}>Leads</th>
                <th style={{ textAlign: 'right' }}>Converted</th>
                <th style={{ textAlign: 'right' }}>Conv. Rate</th>
                <th style={{ textAlign: 'right' }}>Avg Score</th>
                <th style={{ textAlign: 'right' }}>Revenue</th>
                <th style={{ textAlign: 'right' }}>Rev/Lead</th>
              </tr>
            </thead>
            <tbody>
              {sources?.map((source, idx) => {
                const perf = performance?.find(p => p.source === source.source);
                return (
                  <tr key={idx}>
                    <td>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <div
                          style={{
                            width: '10px',
                            height: '10px',
                            borderRadius: '50%',
                            background: COLORS[idx % COLORS.length]
                          }}
                        />
                        {source.source}
                      </div>
                    </td>
                    <td style={{ textAlign: 'right' }}>{source.totalLeads}</td>
                    <td style={{ textAlign: 'right' }}>{source.breakdown.converted}</td>
                    <td style={{ textAlign: 'right' }}>
                      <span style={{
                        color: source.metrics.conversionRate >= 30 ? '#22c55e' :
                               source.metrics.conversionRate >= 15 ? '#f59e0b' : '#ef4444'
                      }}>
                        {source.metrics.conversionRate}%
                      </span>
                    </td>
                    <td style={{ textAlign: 'right' }}>{source.metrics.avgLeadScore}</td>
                    <td style={{ textAlign: 'right' }}>{formatCurrency(perf?.totalRevenue || 0)}</td>
                    <td style={{ textAlign: 'right' }}>{formatCurrency(perf?.revenuePerLead || 0)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      <style>{`
        .lead-source-roi {
          padding: 1.5rem;
          max-width: 1400px;
          margin: 0 auto;
        }
        .roi-header {
          display: flex;
          justify-content: space-between;
          align-items: center;
          margin-bottom: 1.5rem;
        }
        .top-performers-section {
          margin-bottom: 1.5rem;
        }
        .top-performers-section h3 {
          margin: 0 0 1rem;
          font-size: 1rem;
          font-weight: 600;
        }
        .top-performers-grid {
          display: grid;
          grid-template-columns: repeat(3, 1fr);
          gap: 1rem;
        }
        .top-performer-card {
          background: linear-gradient(135deg, #3b82f6 0%, #8b5cf6 100%);
          border-radius: 12px;
          padding: 1.25rem;
          color: white;
          position: relative;
        }
        .performer-rank {
          position: absolute;
          top: 10px;
          right: 10px;
          font-size: 0.8rem;
          opacity: 0.8;
        }
        .performer-source {
          font-size: 1.1rem;
          font-weight: 600;
          margin-bottom: 1rem;
        }
        .performer-stats {
          display: flex;
          gap: 1rem;
        }
        .performer-stats .stat {
          flex: 1;
          text-align: center;
        }
        .performer-stats .stat-value {
          display: block;
          font-size: 1.1rem;
          font-weight: 700;
        }
        .performer-stats .stat-label {
          font-size: 0.7rem;
          opacity: 0.8;
        }
        .charts-grid {
          display: grid;
          grid-template-columns: 1fr 1fr;
          gap: 1.5rem;
          margin-bottom: 1.5rem;
        }
        .chart-card {
          background: white;
          border-radius: 12px;
          padding: 1.25rem;
          box-shadow: 0 1px 3px rgba(0,0,0,0.1);
        }
        .chart-card.full-width {
          grid-column: span 2;
        }
        .chart-card h3 {
          margin: 0 0 1rem;
          font-size: 1rem;
          font-weight: 600;
        }
        .source-table-section {
          background: white;
          border-radius: 12px;
          padding: 1.25rem;
          box-shadow: 0 1px 3px rgba(0,0,0,0.1);
        }
        .source-table-section h3 {
          margin: 0 0 1rem;
          font-size: 1rem;
          font-weight: 600;
        }
        .source-table-container {
          overflow-x: auto;
        }
        .source-table {
          width: 100%;
          border-collapse: collapse;
        }
        .source-table th, .source-table td {
          padding: 0.75rem;
          border-bottom: 1px solid #e5e7eb;
          font-size: 0.875rem;
        }
        .source-table th {
          font-weight: 600;
          color: var(--text-secondary);
          text-transform: uppercase;
          font-size: 0.75rem;
        }
        .source-table tr:hover {
          background: #f9fafb;
        }
        .no-data, .no-data-small {
          text-align: center;
          color: var(--text-secondary);
          font-style: italic;
          padding: 2rem;
        }
        .no-data-small {
          padding: 3rem 1rem;
        }
        .loading-state {
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: center;
          min-height: 400px;
        }
        @media (max-width: 1024px) {
          .top-performers-grid {
            grid-template-columns: 1fr;
          }
          .charts-grid {
            grid-template-columns: 1fr;
          }
          .chart-card.full-width {
            grid-column: span 1;
          }
        }
      `}</style>
    </div>
  );
}

export default LeadSourceROI;
