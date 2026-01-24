/**
 * SalesForecastDashboard - Predictive sales analytics
 * - 30/60/90 day revenue forecasts
 * - Pipeline projections with win probabilities
 * - Seasonality patterns
 * - Sales velocity metrics
 */

import React, { useState, useEffect } from 'react';
import {
  LineChart, Line, BarChart, Bar, AreaChart, Area,
  XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer,
  PieChart, Pie, Cell, ComposedChart
} from 'recharts';
import api from '../../services/api';
import { useToast } from '../ui/Toast';

const COLORS = ['#3b82f6', '#22c55e', '#f59e0b', '#ef4444', '#8b5cf6', '#06b6d4'];

function SalesForecastDashboard() {
  const toast = useToast();
  const [loading, setLoading] = useState(true);
  const [forecastPeriod, setForecastPeriod] = useState(30);
  const [data, setData] = useState({
    forecast: null,
    pipeline: null,
    seasonality: null,
    velocity: null,
    summary: null
  });

  useEffect(() => {
    fetchAllData();
  }, [forecastPeriod]);

  const fetchAllData = async () => {
    setLoading(true);
    try {
      const [forecastRes, pipelineRes, seasonalityRes, velocityRes, summaryRes] = await Promise.all([
        api.get(`/analytics/forecast/revenue?days=${forecastPeriod}`),
        api.get('/analytics/forecast/pipeline'),
        api.get('/analytics/seasonality'),
        api.get('/analytics/sales-velocity'),
        api.get('/analytics/forecast/summary')
      ]);

      setData({
        forecast: forecastRes.data?.data || forecastRes.data,
        pipeline: pipelineRes.data?.data || pipelineRes.data,
        seasonality: seasonalityRes.data?.data || seasonalityRes.data,
        velocity: velocityRes.data?.data || velocityRes.data,
        summary: summaryRes.data?.data || summaryRes.data
      });
    } catch (error) {
      toast.error('Failed to load forecast data');
      console.error(error);
    } finally {
      setLoading(false);
    }
  };

  const formatCurrency = (cents) => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
      minimumFractionDigits: 0,
      maximumFractionDigits: 0
    }).format(cents / 100);
  };

  const formatShortCurrency = (cents) => {
    const value = cents / 100;
    if (value >= 1000000) return `$${(value / 1000000).toFixed(1)}M`;
    if (value >= 1000) return `$${(value / 1000).toFixed(0)}K`;
    return `$${value.toFixed(0)}`;
  };

  if (loading) {
    return (
      <div className="forecast-dashboard">
        <div className="loading-state">
          <div className="loading-spinner"></div>
          <p>Loading forecast data...</p>
        </div>
      </div>
    );
  }

  const { forecast, pipeline, seasonality, velocity, summary } = data;

  return (
    <div className="forecast-dashboard">
      <div className="dashboard-header">
        <div>
          <h1 style={{ margin: 0, fontSize: '1.5rem', fontWeight: 600 }}>Sales Forecast</h1>
          <p style={{ margin: '4px 0 0', color: 'var(--text-secondary)' }}>
            Predictive analytics and revenue projections
          </p>
        </div>
        <div style={{ display: 'flex', gap: '8px' }}>
          {[30, 60, 90].map(days => (
            <button
              key={days}
              className={`btn btn-sm ${forecastPeriod === days ? 'btn-primary' : 'btn-secondary'}`}
              onClick={() => setForecastPeriod(days)}
            >
              {days} Days
            </button>
          ))}
        </div>
      </div>

      {/* Key Metrics Row */}
      <div className="forecast-metrics-row">
        <ForecastMetricCard
          title="Forecasted Revenue"
          value={formatCurrency(summary?.forecasts?.[`${forecastPeriod}_day`]?.total || 0)}
          subtitle={`Next ${forecastPeriod} days`}
          trend={summary?.trend}
          confidence={forecast?.confidence}
        />
        <ForecastMetricCard
          title="Pipeline Value"
          value={formatCurrency(pipeline?.pipeline?.totalValue || 0)}
          subtitle="Total open quotes"
          metric={`${pipeline?.pipeline?.quoteCount || 0} quotes`}
        />
        <ForecastMetricCard
          title="Weighted Pipeline"
          value={formatCurrency(pipeline?.pipeline?.weightedValue || 0)}
          subtitle="Probability-adjusted"
          metric={`${pipeline?.metrics?.winRate || 0}% win rate`}
        />
        <ForecastMetricCard
          title="Avg Sales Cycle"
          value={`${pipeline?.metrics?.avgSalesCycleDays || 0} days`}
          subtitle="Time to close"
          metric={formatCurrency(pipeline?.metrics?.avgWonValue || 0)}
        />
      </div>

      {/* Forecast Chart */}
      <div className="forecast-section">
        <div className="section-header">
          <h2>Revenue Forecast</h2>
          <ConfidenceBadge level={forecast?.confidence} />
        </div>
        <div className="forecast-chart-container">
          {forecast?.dailyForecast ? (
            <ResponsiveContainer width="100%" height={300}>
              <AreaChart data={forecast.dailyForecast}>
                <defs>
                  <linearGradient id="forecastGradient" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#3b82f6" stopOpacity={0.3}/>
                    <stop offset="95%" stopColor="#3b82f6" stopOpacity={0}/>
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                <XAxis
                  dataKey="date"
                  tickFormatter={(v) => new Date(v).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                  tick={{ fontSize: 12 }}
                />
                <YAxis
                  tickFormatter={formatShortCurrency}
                  tick={{ fontSize: 12 }}
                />
                <Tooltip
                  formatter={(value) => formatCurrency(value)}
                  labelFormatter={(label) => new Date(label).toLocaleDateString()}
                />
                <Area
                  type="monotone"
                  dataKey="upperBound"
                  stroke="none"
                  fill="#dbeafe"
                  fillOpacity={0.5}
                />
                <Area
                  type="monotone"
                  dataKey="lowerBound"
                  stroke="none"
                  fill="white"
                />
                <Line
                  type="monotone"
                  dataKey="predictedRevenue"
                  stroke="#3b82f6"
                  strokeWidth={2}
                  dot={false}
                />
              </AreaChart>
            </ResponsiveContainer>
          ) : (
            <div className="no-data">Insufficient data for forecast</div>
          )}
        </div>
      </div>

      {/* Two Column Layout */}
      <div className="forecast-grid">
        {/* Pipeline Stages */}
        <div className="forecast-section">
          <div className="section-header">
            <h2>Pipeline by Stage</h2>
          </div>
          <div className="pipeline-stages">
            {pipeline?.stages?.map((stage, idx) => (
              <PipelineStageBar
                key={stage.stage}
                stage={stage}
                color={COLORS[idx % COLORS.length]}
                maxValue={Math.max(...(pipeline?.stages?.map(s => s.totalValue) || [1]))}
              />
            ))}
          </div>
          <div className="pipeline-projections">
            <h4 style={{ margin: '1rem 0 0.5rem', fontSize: '0.9rem' }}>Expected to Close</h4>
            <div style={{ display: 'flex', gap: '1rem' }}>
              <ProjectionBadge days={30} value={pipeline?.projections?.expected30Day || 0} />
              <ProjectionBadge days={60} value={pipeline?.projections?.expected60Day || 0} />
              <ProjectionBadge days={90} value={pipeline?.projections?.expected90Day || 0} />
            </div>
          </div>
        </div>

        {/* Seasonality */}
        <div className="forecast-section">
          <div className="section-header">
            <h2>Revenue by Day of Week</h2>
          </div>
          {seasonality?.byDayOfWeek?.length > 0 ? (
            <ResponsiveContainer width="100%" height={200}>
              <BarChart data={seasonality.byDayOfWeek}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                <XAxis dataKey="day" tick={{ fontSize: 11 }} />
                <YAxis tickFormatter={formatShortCurrency} tick={{ fontSize: 11 }} />
                <Tooltip formatter={(value) => formatCurrency(value)} />
                <Bar dataKey="totalRevenue" fill="#3b82f6" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          ) : (
            <div className="no-data">No seasonality data available</div>
          )}
          {seasonality?.insights?.length > 0 && (
            <div className="seasonality-insights">
              {seasonality.insights.slice(0, 2).map((insight, idx) => (
                <div key={idx} className="insight-item">
                  <span className="insight-icon">
                    {insight.type === 'best_day' ? '📈' : insight.type === 'peak_season' ? '🎯' : '💡'}
                  </span>
                  <span>{insight.message}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Sales Velocity */}
      <div className="forecast-section">
        <div className="section-header">
          <h2>Sales Team Performance</h2>
          <span style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>
            Last {velocity?.period?.replace('_', ' ')}
          </span>
        </div>
        <div className="velocity-table">
          <table>
            <thead>
              <tr>
                <th>Salesperson</th>
                <th style={{ textAlign: 'right' }}>Quotes</th>
                <th style={{ textAlign: 'right' }}>Won</th>
                <th style={{ textAlign: 'right' }}>Win Rate</th>
                <th style={{ textAlign: 'right' }}>Revenue</th>
                <th style={{ textAlign: 'right' }}>Avg Deal</th>
                <th style={{ textAlign: 'right' }}>Cycle</th>
                <th style={{ textAlign: 'center' }}>Velocity</th>
              </tr>
            </thead>
            <tbody>
              {velocity?.salespeople?.slice(0, 5).map((sp, idx) => (
                <tr key={idx}>
                  <td>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                      {idx === 0 && <span title="Top Performer">🏆</span>}
                      {sp.salesperson || 'Unknown'}
                    </div>
                  </td>
                  <td style={{ textAlign: 'right' }}>{sp.totalQuotes}</td>
                  <td style={{ textAlign: 'right' }}>{sp.wonQuotes}</td>
                  <td style={{ textAlign: 'right' }}>{sp.winRate}%</td>
                  <td style={{ textAlign: 'right' }}>{formatCurrency(sp.wonRevenue)}</td>
                  <td style={{ textAlign: 'right' }}>{formatCurrency(sp.avgDealSize)}</td>
                  <td style={{ textAlign: 'right' }}>{sp.avgSalesCycleDays}d</td>
                  <td style={{ textAlign: 'center' }}>
                    <VelocityBadge score={sp.velocity} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {velocity?.teamMetrics && (
          <div className="team-summary">
            <span>Team Total: {velocity.teamMetrics.totalQuotes} quotes, {velocity.teamMetrics.totalWon} won, {formatCurrency(velocity.teamMetrics.totalRevenue)}</span>
          </div>
        )}
      </div>

      <style>{`
        .forecast-dashboard {
          padding: 1.5rem;
          max-width: 1400px;
          margin: 0 auto;
        }
        .dashboard-header {
          display: flex;
          justify-content: space-between;
          align-items: center;
          margin-bottom: 1.5rem;
        }
        .forecast-metrics-row {
          display: grid;
          grid-template-columns: repeat(4, 1fr);
          gap: 1rem;
          margin-bottom: 1.5rem;
        }
        .forecast-metric-card {
          background: white;
          border-radius: 12px;
          padding: 1.25rem;
          box-shadow: 0 1px 3px rgba(0,0,0,0.1);
        }
        .metric-title {
          font-size: 0.8rem;
          color: var(--text-secondary);
          margin-bottom: 0.5rem;
        }
        .metric-value {
          font-size: 1.75rem;
          font-weight: 700;
          color: var(--text-primary);
        }
        .metric-subtitle {
          font-size: 0.75rem;
          color: var(--text-secondary);
          margin-top: 0.25rem;
        }
        .metric-extra {
          font-size: 0.8rem;
          color: #3b82f6;
          margin-top: 0.5rem;
          font-weight: 500;
        }
        .forecast-section {
          background: white;
          border-radius: 12px;
          padding: 1.25rem;
          box-shadow: 0 1px 3px rgba(0,0,0,0.1);
          margin-bottom: 1.5rem;
        }
        .section-header {
          display: flex;
          justify-content: space-between;
          align-items: center;
          margin-bottom: 1rem;
        }
        .section-header h2 {
          margin: 0;
          font-size: 1rem;
          font-weight: 600;
        }
        .forecast-chart-container {
          margin-top: 0.5rem;
        }
        .forecast-grid {
          display: grid;
          grid-template-columns: 1fr 1fr;
          gap: 1.5rem;
        }
        .pipeline-stages {
          display: flex;
          flex-direction: column;
          gap: 0.75rem;
        }
        .pipeline-stage {
          display: flex;
          align-items: center;
          gap: 1rem;
        }
        .stage-label {
          width: 100px;
          font-size: 0.8rem;
          font-weight: 500;
        }
        .stage-bar-container {
          flex: 1;
          height: 24px;
          background: #f3f4f6;
          border-radius: 4px;
          overflow: hidden;
        }
        .stage-bar {
          height: 100%;
          border-radius: 4px;
          display: flex;
          align-items: center;
          padding-left: 8px;
          transition: width 0.5s ease;
        }
        .stage-value {
          font-size: 0.7rem;
          font-weight: 600;
          color: white;
          white-space: nowrap;
        }
        .stage-meta {
          width: 80px;
          text-align: right;
          font-size: 0.75rem;
          color: var(--text-secondary);
        }
        .pipeline-projections {
          margin-top: 1rem;
          padding-top: 1rem;
          border-top: 1px solid #e5e7eb;
        }
        .projection-badge {
          flex: 1;
          padding: 0.75rem;
          background: #f9fafb;
          border-radius: 8px;
          text-align: center;
        }
        .projection-days {
          font-size: 0.7rem;
          color: var(--text-secondary);
        }
        .projection-value {
          font-size: 1rem;
          font-weight: 600;
          color: #166534;
        }
        .seasonality-insights {
          margin-top: 1rem;
          padding-top: 0.75rem;
          border-top: 1px solid #e5e7eb;
        }
        .insight-item {
          display: flex;
          align-items: center;
          gap: 0.5rem;
          font-size: 0.8rem;
          color: var(--text-secondary);
          margin-bottom: 0.5rem;
        }
        .velocity-table {
          overflow-x: auto;
        }
        .velocity-table table {
          width: 100%;
          border-collapse: collapse;
        }
        .velocity-table th, .velocity-table td {
          padding: 0.75rem;
          text-align: left;
          border-bottom: 1px solid #e5e7eb;
          font-size: 0.875rem;
        }
        .velocity-table th {
          font-weight: 600;
          color: var(--text-secondary);
          font-size: 0.75rem;
          text-transform: uppercase;
        }
        .team-summary {
          margin-top: 0.75rem;
          padding-top: 0.75rem;
          border-top: 1px solid #e5e7eb;
          font-size: 0.8rem;
          color: var(--text-secondary);
          text-align: right;
        }
        .confidence-badge {
          padding: 0.25rem 0.75rem;
          border-radius: 20px;
          font-size: 0.7rem;
          font-weight: 600;
          text-transform: uppercase;
        }
        .confidence-high { background: #dcfce7; color: #166534; }
        .confidence-medium { background: #fef3c7; color: #92400e; }
        .confidence-low { background: #fee2e2; color: #991b1b; }
        .velocity-badge {
          display: inline-flex;
          align-items: center;
          justify-content: center;
          width: 40px;
          height: 24px;
          border-radius: 12px;
          font-size: 0.75rem;
          font-weight: 600;
        }
        .trend-indicator {
          display: flex;
          align-items: center;
          gap: 4px;
          font-size: 0.75rem;
          margin-top: 0.5rem;
        }
        .trend-up { color: #166534; }
        .trend-down { color: #991b1b; }
        .trend-stable { color: #6b7280; }
        .no-data {
          padding: 2rem;
          text-align: center;
          color: var(--text-secondary);
          font-style: italic;
        }
        .loading-state {
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: center;
          min-height: 400px;
        }
        @media (max-width: 1024px) {
          .forecast-metrics-row {
            grid-template-columns: repeat(2, 1fr);
          }
          .forecast-grid {
            grid-template-columns: 1fr;
          }
        }
        @media (max-width: 640px) {
          .forecast-metrics-row {
            grid-template-columns: 1fr;
          }
        }
      `}</style>
    </div>
  );
}

// Sub-components
function ForecastMetricCard({ title, value, subtitle, metric, trend, confidence }) {
  return (
    <div className="forecast-metric-card">
      <div className="metric-title">{title}</div>
      <div className="metric-value">{value}</div>
      <div className="metric-subtitle">{subtitle}</div>
      {metric && <div className="metric-extra">{metric}</div>}
      {trend && (
        <div className={`trend-indicator trend-${trend.direction}`}>
          {trend.direction === 'increasing' ? '↑' : trend.direction === 'decreasing' ? '↓' : '→'}
          <span>{Math.abs(trend.percentChange)}% {trend.direction}</span>
        </div>
      )}
    </div>
  );
}

function ConfidenceBadge({ level }) {
  if (!level) return null;
  return (
    <span className={`confidence-badge confidence-${level}`}>
      {level} confidence
    </span>
  );
}

function PipelineStageBar({ stage, color, maxValue }) {
  const percentage = maxValue > 0 ? (stage.totalValue / maxValue) * 100 : 0;
  const formatCurrency = (cents) => {
    const value = cents / 100;
    if (value >= 1000) return `$${(value / 1000).toFixed(0)}K`;
    return `$${value.toFixed(0)}`;
  };

  return (
    <div className="pipeline-stage">
      <div className="stage-label">{stage.stage}</div>
      <div className="stage-bar-container">
        <div
          className="stage-bar"
          style={{ width: `${Math.max(percentage, 5)}%`, background: color }}
        >
          <span className="stage-value">{formatCurrency(stage.totalValue)}</span>
        </div>
      </div>
      <div className="stage-meta">
        {stage.quoteCount} ({Math.round(stage.winProbability * 100)}%)
      </div>
    </div>
  );
}

function ProjectionBadge({ days, value }) {
  const formatCurrency = (cents) => {
    const v = cents / 100;
    if (v >= 1000) return `$${(v / 1000).toFixed(0)}K`;
    return `$${v.toFixed(0)}`;
  };

  return (
    <div className="projection-badge">
      <div className="projection-days">{days} days</div>
      <div className="projection-value">{formatCurrency(value)}</div>
    </div>
  );
}

function VelocityBadge({ score }) {
  let bg, color;
  if (score >= 70) { bg = '#dcfce7'; color = '#166534'; }
  else if (score >= 40) { bg = '#fef3c7'; color = '#92400e'; }
  else { bg = '#fee2e2'; color = '#991b1b'; }

  return (
    <span className="velocity-badge" style={{ background: bg, color }}>
      {score}
    </span>
  );
}

export default SalesForecastDashboard;
