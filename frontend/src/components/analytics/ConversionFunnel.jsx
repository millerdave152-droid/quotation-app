/**
 * ConversionFunnel - Visual conversion funnel analytics
 * - Lead -> Qualified -> Quote -> Won conversion rates
 * - Bottleneck identification
 * - Time in stage analysis
 * - Drop-off point detection
 */

import React, { useState, useEffect } from 'react';
import {
  BarChart, Bar, LineChart, Line, XAxis, YAxis,
  CartesianGrid, Tooltip, ResponsiveContainer, Cell
} from 'recharts';
import api from '../../services/api';
import { useToast } from '../ui/Toast';

const FUNNEL_COLORS = ['#3b82f6', '#22c55e', '#f59e0b', '#ef4444'];
const SOURCE_COLORS = ['#3b82f6', '#22c55e', '#f59e0b', '#8b5cf6', '#06b6d4', '#f97316'];

function ConversionFunnel() {
  const toast = useToast();
  const [loading, setLoading] = useState(true);
  const [period, setPeriod] = useState(90);
  const [data, setData] = useState(null);
  const [activeTab, setActiveTab] = useState('lead');

  useEffect(() => {
    fetchFunnelData();
  }, [period]);

  const fetchFunnelData = async () => {
    setLoading(true);
    try {
      const response = await api.get(`/analytics/funnel?days=${period}`);
      setData(response.data?.data || response.data);
    } catch (error) {
      toast.error('Failed to load funnel data');
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
      <div className="conversion-funnel">
        <div className="loading-state">
          <div className="loading-spinner"></div>
          <p>Loading funnel data...</p>
        </div>
      </div>
    );
  }

  if (!data) {
    return (
      <div className="conversion-funnel">
        <div className="no-data">No data available</div>
      </div>
    );
  }

  const { stages, timing, dropoffs, trends, bySource, bottlenecks } = data;

  return (
    <div className="conversion-funnel">
      <div className="funnel-header">
        <div>
          <h1 style={{ margin: 0, fontSize: '1.5rem', fontWeight: 600 }}>Conversion Funnel</h1>
          <p style={{ margin: '4px 0 0', color: 'var(--text-secondary)' }}>
            Track conversion rates and identify bottlenecks
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

      {/* Summary Metrics */}
      <div className="funnel-metrics">
        <div className="metric-card">
          <div className="metric-label">Lead → Quote Rate</div>
          <div className="metric-value">{stages?.summary?.leadToQuoteRate || 0}%</div>
        </div>
        <div className="metric-card">
          <div className="metric-label">Quote Win Rate</div>
          <div className="metric-value">{stages?.summary?.quoteWinRate || 0}%</div>
        </div>
        <div className="metric-card">
          <div className="metric-label">Overall Conversion</div>
          <div className="metric-value highlight">{stages?.summary?.overallConversion || 0}%</div>
        </div>
        <div className="metric-card">
          <div className="metric-label">Total Won Value</div>
          <div className="metric-value">{formatCurrency(stages?.summary?.totalWonValue || 0)}</div>
        </div>
      </div>

      {/* Bottlenecks Alert */}
      {bottlenecks?.length > 0 && (
        <div className="bottlenecks-section">
          <h3>Bottlenecks Detected</h3>
          <div className="bottleneck-list">
            {bottlenecks.slice(0, 3).map((bottleneck, idx) => (
              <div key={idx} className={`bottleneck-item severity-${bottleneck.severity}`}>
                <div className="bottleneck-header">
                  <span className="bottleneck-stage">{bottleneck.stage}</span>
                  <span className={`severity-badge ${bottleneck.severity}`}>
                    {bottleneck.severity}
                  </span>
                </div>
                <div className="bottleneck-metric">
                  {bottleneck.dropoffRate ? `${bottleneck.dropoffRate}% drop-off` : bottleneck.metric}
                </div>
                <div className="bottleneck-suggestion">{bottleneck.suggestion}</div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Funnel Tab Selector */}
      <div className="funnel-tabs">
        <button
          className={`tab-btn ${activeTab === 'lead' ? 'active' : ''}`}
          onClick={() => setActiveTab('lead')}
        >
          Lead Funnel
        </button>
        <button
          className={`tab-btn ${activeTab === 'quote' ? 'active' : ''}`}
          onClick={() => setActiveTab('quote')}
        >
          Quote Funnel
        </button>
      </div>

      {/* Funnel Visualization */}
      <div className="funnel-section">
        <div className="funnel-visual">
          <FunnelChart
            data={activeTab === 'lead' ? stages?.leadFunnel : stages?.quoteFunnel}
            colors={FUNNEL_COLORS}
          />
        </div>
        <div className="funnel-details">
          <h4>Stage Details</h4>
          {(activeTab === 'lead' ? stages?.leadFunnel : stages?.quoteFunnel)?.map((stage, idx) => (
            <div key={idx} className="stage-detail-row">
              <div className="stage-info">
                <span className="stage-name">{stage.stage}</span>
                <span className="stage-count">{stage.count}</span>
              </div>
              <div className="stage-bars">
                <div className="progress-bar">
                  <div
                    className="progress-fill"
                    style={{
                      width: `${stage.percentage}%`,
                      background: FUNNEL_COLORS[idx % FUNNEL_COLORS.length]
                    }}
                  />
                </div>
                <span className="stage-percentage">{stage.percentage}%</span>
              </div>
              {stage.dropoff > 0 && (
                <div className="dropoff-indicator">
                  -{stage.dropoff}% dropoff
                </div>
              )}
            </div>
          ))}
        </div>
      </div>

      {/* Two Column Grid */}
      <div className="funnel-grid">
        {/* Stage Timing */}
        <div className="funnel-card">
          <h3>Average Time in Stage</h3>
          <div className="timing-list">
            <TimingRow label="New → Contacted" days={timing?.leadStages?.newToContacted} target={1} />
            <TimingRow label="Contacted → Qualified" days={timing?.leadStages?.contactedToQualified} target={7} />
            <TimingRow label="Qualified → Converted" days={timing?.leadStages?.qualifiedToConverted} target={14} />
            <div style={{ borderTop: '1px solid #e5e7eb', margin: '0.75rem 0' }} />
            <TimingRow label="Draft → Sent" days={timing?.quoteStages?.draftToSent} target={2} />
            <TimingRow label="Full Sales Cycle" days={timing?.quoteStages?.sentToWon} target={21} />
          </div>
        </div>

        {/* Conversion by Source */}
        <div className="funnel-card">
          <h3>Conversion by Source</h3>
          {bySource?.length > 0 ? (
            <ResponsiveContainer width="100%" height={200}>
              <BarChart data={bySource.slice(0, 6)} layout="vertical">
                <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                <XAxis type="number" domain={[0, 100]} tick={{ fontSize: 11 }} />
                <YAxis dataKey="source" type="category" tick={{ fontSize: 11 }} width={80} />
                <Tooltip formatter={(value) => `${value}%`} />
                <Bar dataKey="conversionRate" fill="#3b82f6" radius={[0, 4, 4, 0]}>
                  {bySource.slice(0, 6).map((_, idx) => (
                    <Cell key={idx} fill={SOURCE_COLORS[idx % SOURCE_COLORS.length]} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          ) : (
            <div className="no-data-small">No source data available</div>
          )}
        </div>
      </div>

      {/* Conversion Trends */}
      <div className="funnel-card">
        <h3>Conversion Rate Trends</h3>
        {trends?.leadConversion?.length > 0 ? (
          <ResponsiveContainer width="100%" height={250}>
            <LineChart data={trends.leadConversion}>
              <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
              <XAxis
                dataKey="week"
                tickFormatter={(v) => new Date(v).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                tick={{ fontSize: 11 }}
              />
              <YAxis domain={[0, 100]} tick={{ fontSize: 11 }} tickFormatter={(v) => `${v}%`} />
              <Tooltip
                labelFormatter={(v) => new Date(v).toLocaleDateString()}
                formatter={(value, name) => [`${value}%`, name === 'rate' ? 'Conversion Rate' : name]}
              />
              <Line
                type="monotone"
                dataKey="rate"
                stroke="#3b82f6"
                strokeWidth={2}
                dot={{ r: 4 }}
                activeDot={{ r: 6 }}
              />
            </LineChart>
          </ResponsiveContainer>
        ) : (
          <div className="no-data-small">Not enough data for trends</div>
        )}
      </div>

      {/* Lost Reasons */}
      <div className="funnel-grid">
        <div className="funnel-card">
          <h3>Lost Lead Reasons</h3>
          {dropoffs?.lostLeadReasons?.length > 0 ? (
            <div className="reason-list">
              {dropoffs.lostLeadReasons.slice(0, 5).map((reason, idx) => (
                <div key={idx} className="reason-row">
                  <span className="reason-name">{reason.reason}</span>
                  <span className="reason-count">{reason.count}</span>
                </div>
              ))}
            </div>
          ) : (
            <div className="no-data-small">No lost reasons recorded</div>
          )}
        </div>
        <div className="funnel-card">
          <h3>Lost Quote Reasons</h3>
          {dropoffs?.lostQuoteReasons?.length > 0 ? (
            <div className="reason-list">
              {dropoffs.lostQuoteReasons.slice(0, 5).map((reason, idx) => (
                <div key={idx} className="reason-row">
                  <span className="reason-name">{reason.reason}</span>
                  <span className="reason-count">{reason.count}</span>
                </div>
              ))}
            </div>
          ) : (
            <div className="no-data-small">No lost reasons recorded</div>
          )}
        </div>
      </div>

      <style>{`
        .conversion-funnel {
          padding: 1.5rem;
          max-width: 1400px;
          margin: 0 auto;
        }
        .funnel-header {
          display: flex;
          justify-content: space-between;
          align-items: center;
          margin-bottom: 1.5rem;
        }
        .funnel-metrics {
          display: grid;
          grid-template-columns: repeat(4, 1fr);
          gap: 1rem;
          margin-bottom: 1.5rem;
        }
        .metric-card {
          background: white;
          border-radius: 12px;
          padding: 1.25rem;
          box-shadow: 0 1px 3px rgba(0,0,0,0.1);
          text-align: center;
        }
        .metric-label {
          font-size: 0.8rem;
          color: var(--text-secondary);
          margin-bottom: 0.5rem;
        }
        .metric-value {
          font-size: 2rem;
          font-weight: 700;
          color: var(--text-primary);
        }
        .metric-value.highlight {
          color: #3b82f6;
        }
        .bottlenecks-section {
          background: #fef3c7;
          border: 1px solid #fcd34d;
          border-radius: 12px;
          padding: 1rem;
          margin-bottom: 1.5rem;
        }
        .bottlenecks-section h3 {
          margin: 0 0 0.75rem;
          font-size: 0.9rem;
          color: #92400e;
          display: flex;
          align-items: center;
          gap: 0.5rem;
        }
        .bottlenecks-section h3::before {
          content: '⚠️';
        }
        .bottleneck-list {
          display: grid;
          grid-template-columns: repeat(auto-fit, minmax(280px, 1fr));
          gap: 0.75rem;
        }
        .bottleneck-item {
          background: white;
          border-radius: 8px;
          padding: 0.75rem;
          border-left: 4px solid #f59e0b;
        }
        .bottleneck-item.severity-critical {
          border-left-color: #ef4444;
        }
        .bottleneck-header {
          display: flex;
          justify-content: space-between;
          align-items: center;
          margin-bottom: 0.5rem;
        }
        .bottleneck-stage {
          font-weight: 600;
          font-size: 0.85rem;
        }
        .severity-badge {
          font-size: 0.65rem;
          padding: 0.15rem 0.5rem;
          border-radius: 10px;
          text-transform: uppercase;
          font-weight: 600;
        }
        .severity-badge.warning {
          background: #fef3c7;
          color: #92400e;
        }
        .severity-badge.critical {
          background: #fee2e2;
          color: #991b1b;
        }
        .bottleneck-metric {
          font-size: 0.9rem;
          font-weight: 600;
          color: #374151;
          margin-bottom: 0.25rem;
        }
        .bottleneck-suggestion {
          font-size: 0.8rem;
          color: var(--text-secondary);
        }
        .funnel-tabs {
          display: flex;
          gap: 0;
          margin-bottom: 1rem;
        }
        .tab-btn {
          padding: 0.75rem 1.5rem;
          border: 1px solid #e5e7eb;
          background: white;
          cursor: pointer;
          font-size: 0.875rem;
          font-weight: 500;
        }
        .tab-btn:first-child {
          border-radius: 8px 0 0 8px;
        }
        .tab-btn:last-child {
          border-radius: 0 8px 8px 0;
          border-left: none;
        }
        .tab-btn.active {
          background: #3b82f6;
          color: white;
          border-color: #3b82f6;
        }
        .funnel-section {
          background: white;
          border-radius: 12px;
          padding: 1.5rem;
          box-shadow: 0 1px 3px rgba(0,0,0,0.1);
          margin-bottom: 1.5rem;
          display: grid;
          grid-template-columns: 1fr 1fr;
          gap: 2rem;
        }
        .funnel-visual {
          min-height: 300px;
        }
        .funnel-details h4 {
          margin: 0 0 1rem;
          font-size: 0.9rem;
        }
        .stage-detail-row {
          margin-bottom: 1rem;
        }
        .stage-info {
          display: flex;
          justify-content: space-between;
          margin-bottom: 0.25rem;
        }
        .stage-name {
          font-weight: 500;
          font-size: 0.875rem;
        }
        .stage-count {
          font-weight: 600;
          color: #3b82f6;
        }
        .stage-bars {
          display: flex;
          align-items: center;
          gap: 0.5rem;
        }
        .progress-bar {
          flex: 1;
          height: 8px;
          background: #f3f4f6;
          border-radius: 4px;
          overflow: hidden;
        }
        .progress-fill {
          height: 100%;
          border-radius: 4px;
          transition: width 0.5s ease;
        }
        .stage-percentage {
          font-size: 0.75rem;
          font-weight: 600;
          width: 40px;
          text-align: right;
        }
        .dropoff-indicator {
          font-size: 0.7rem;
          color: #ef4444;
          text-align: right;
        }
        .funnel-grid {
          display: grid;
          grid-template-columns: 1fr 1fr;
          gap: 1.5rem;
          margin-bottom: 1.5rem;
        }
        .funnel-card {
          background: white;
          border-radius: 12px;
          padding: 1.25rem;
          box-shadow: 0 1px 3px rgba(0,0,0,0.1);
        }
        .funnel-card h3 {
          margin: 0 0 1rem;
          font-size: 1rem;
          font-weight: 600;
        }
        .timing-list {
          display: flex;
          flex-direction: column;
          gap: 0.75rem;
        }
        .timing-row {
          display: flex;
          justify-content: space-between;
          align-items: center;
        }
        .timing-label {
          font-size: 0.875rem;
          color: var(--text-secondary);
        }
        .timing-value {
          font-weight: 600;
          font-size: 0.9rem;
          display: flex;
          align-items: center;
          gap: 0.5rem;
        }
        .timing-status {
          width: 8px;
          height: 8px;
          border-radius: 50%;
        }
        .timing-status.good { background: #22c55e; }
        .timing-status.warning { background: #f59e0b; }
        .timing-status.bad { background: #ef4444; }
        .reason-list {
          display: flex;
          flex-direction: column;
          gap: 0.5rem;
        }
        .reason-row {
          display: flex;
          justify-content: space-between;
          padding: 0.5rem;
          background: #f9fafb;
          border-radius: 6px;
        }
        .reason-name {
          font-size: 0.85rem;
          color: var(--text-secondary);
        }
        .reason-count {
          font-weight: 600;
          font-size: 0.85rem;
        }
        .no-data, .no-data-small {
          text-align: center;
          color: var(--text-secondary);
          font-style: italic;
          padding: 2rem;
        }
        .no-data-small {
          padding: 1rem;
        }
        .loading-state {
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: center;
          min-height: 400px;
        }
        @media (max-width: 1024px) {
          .funnel-metrics {
            grid-template-columns: repeat(2, 1fr);
          }
          .funnel-section {
            grid-template-columns: 1fr;
          }
          .funnel-grid {
            grid-template-columns: 1fr;
          }
        }
        @media (max-width: 640px) {
          .funnel-metrics {
            grid-template-columns: 1fr;
          }
        }
      `}</style>
    </div>
  );
}

// Sub-components
function FunnelChart({ data, colors }) {
  if (!data || data.length === 0) return <div className="no-data">No funnel data</div>;

  const maxCount = Math.max(...data.map(d => d.count));

  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '4px' }}>
      {data.map((stage, idx) => {
        const width = maxCount > 0 ? (stage.count / maxCount) * 100 : 100;
        return (
          <div
            key={idx}
            style={{
              width: `${Math.max(width, 30)}%`,
              background: colors[idx % colors.length],
              padding: '1rem',
              borderRadius: '4px',
              textAlign: 'center',
              color: 'white',
              transition: 'width 0.5s ease',
              position: 'relative'
            }}
          >
            <div style={{ fontWeight: 600, fontSize: '0.9rem' }}>{stage.stage}</div>
            <div style={{ fontSize: '1.25rem', fontWeight: 700 }}>{stage.count}</div>
            <div style={{ fontSize: '0.75rem', opacity: 0.9 }}>{stage.percentage}%</div>
          </div>
        );
      })}
    </div>
  );
}

function TimingRow({ label, days, target }) {
  const status = days <= target ? 'good' : days <= target * 2 ? 'warning' : 'bad';

  return (
    <div className="timing-row">
      <span className="timing-label">{label}</span>
      <span className="timing-value">
        <span className={`timing-status ${status}`} />
        {days || 0} days
      </span>
    </div>
  );
}

export default ConversionFunnel;
