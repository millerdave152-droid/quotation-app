import { authFetch } from '../../services/authFetch';
/**
 * Sales Pipeline Dashboard Component
 *
 * Unified view of the entire sales funnel from leads to customers
 * with real-time metrics, trends, and action items.
 */

import React, { useState, useEffect, useCallback } from 'react';
import {
  AreaChart, Area, BarChart, Bar, LineChart, Line, PieChart, Pie, Cell,
  XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend, FunnelChart, Funnel, LabelList
} from 'recharts';

const API_URL = process.env.REACT_APP_API_URL || 'http://localhost:3001';

// Color palette
const COLORS = {
  primary: '#6366f1',
  success: '#22c55e',
  warning: '#f59e0b',
  danger: '#ef4444',
  info: '#3b82f6',
  purple: '#8b5cf6',
  teal: '#14b8a6',
  gray: '#6b7280'
};

const STAGE_COLORS = {
  new: '#6366f1',
  contacted: '#8b5cf6',
  qualified: '#a855f7',
  draft: '#3b82f6',
  sent: '#0ea5e9',
  pending: '#f59e0b',
  won: '#22c55e',
  lost: '#ef4444'
};

/**
 * Format currency from cents
 */
const formatCurrency = (cents) => {
  return `$${((cents || 0) / 100).toLocaleString('en-CA', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`;
};

/**
 * Format relative time
 */
const formatRelativeTime = (date) => {
  const now = new Date();
  const d = new Date(date);
  const diffMs = now - d;
  const diffDays = Math.floor(diffMs / 86400000);

  if (diffDays === 0) return 'Today';
  if (diffDays === 1) return 'Yesterday';
  if (diffDays < 7) return `${diffDays} days ago`;
  return d.toLocaleDateString('en-CA', { month: 'short', day: 'numeric' });
};

/**
 * Pipeline Funnel Chart
 */
const PipelineFunnel = ({ data }) => {
  if (!data || data.length === 0) {
    return <div style={{ textAlign: 'center', color: '#9ca3af', padding: '40px' }}>No data available</div>;
  }

  return (
    <ResponsiveContainer width="100%" height={300}>
      <BarChart
        data={data}
        layout="vertical"
        margin={{ top: 10, right: 30, left: 100, bottom: 10 }}
      >
        <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="#f3f4f6" />
        <XAxis type="number" stroke="#9ca3af" fontSize={12} />
        <YAxis type="category" dataKey="stage" stroke="#9ca3af" fontSize={12} width={90} />
        <Tooltip
          formatter={(value) => [value, 'Count']}
          contentStyle={{ borderRadius: '8px', border: '1px solid #e5e7eb' }}
        />
        <Bar dataKey="count" radius={[0, 4, 4, 0]} barSize={28}>
          {data.map((entry, index) => (
            <Cell key={`cell-${index}`} fill={entry.color || COLORS.primary} />
          ))}
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  );
};

/**
 * Trend Chart
 */
const TrendChart = ({ data, dataKey, color = COLORS.primary, name }) => {
  if (!data || data.length === 0) return null;

  return (
    <ResponsiveContainer width="100%" height={150}>
      <AreaChart data={data} margin={{ top: 5, right: 5, left: 5, bottom: 5 }}>
        <defs>
          <linearGradient id={`gradient-${dataKey}`} x1="0" y1="0" x2="0" y2="1">
            <stop offset="5%" stopColor={color} stopOpacity={0.3}/>
            <stop offset="95%" stopColor={color} stopOpacity={0}/>
          </linearGradient>
        </defs>
        <CartesianGrid strokeDasharray="3 3" stroke="#f3f4f6" vertical={false} />
        <XAxis dataKey="date" tick={false} stroke="#9ca3af" />
        <YAxis stroke="#9ca3af" fontSize={10} width={30} />
        <Tooltip
          formatter={(value) => [value, name]}
          labelFormatter={(label) => new Date(label).toLocaleDateString()}
          contentStyle={{ borderRadius: '8px', border: '1px solid #e5e7eb', fontSize: '12px' }}
        />
        <Area
          type="monotone"
          dataKey={dataKey}
          stroke={color}
          strokeWidth={2}
          fill={`url(#gradient-${dataKey})`}
        />
      </AreaChart>
    </ResponsiveContainer>
  );
};

/**
 * Metric Card Component
 */
const MetricCard = ({ title, value, subtitle, icon, color = COLORS.primary, trend, onClick }) => (
  <div
    onClick={onClick}
    style={{
      background: 'white',
      padding: '20px',
      borderRadius: '12px',
      boxShadow: '0 1px 3px rgba(0,0,0,0.1)',
      borderLeft: `4px solid ${color}`,
      cursor: onClick ? 'pointer' : 'default',
      transition: 'transform 0.15s ease, box-shadow 0.15s ease'
    }}
    onMouseEnter={(e) => {
      if (onClick) {
        e.currentTarget.style.transform = 'translateY(-2px)';
        e.currentTarget.style.boxShadow = '0 4px 12px rgba(0,0,0,0.15)';
      }
    }}
    onMouseLeave={(e) => {
      e.currentTarget.style.transform = 'translateY(0)';
      e.currentTarget.style.boxShadow = '0 1px 3px rgba(0,0,0,0.1)';
    }}
  >
    <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between' }}>
      <div>
        <div style={{ fontSize: '13px', color: '#6b7280', marginBottom: '4px' }}>{title}</div>
        <div style={{ fontSize: '28px', fontWeight: 'bold', color: '#1f2937' }}>{value}</div>
        {subtitle && (
          <div style={{ fontSize: '12px', color: '#9ca3af', marginTop: '4px' }}>{subtitle}</div>
        )}
      </div>
      {icon && (
        <div style={{
          width: '44px',
          height: '44px',
          borderRadius: '12px',
          background: `${color}15`,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          fontSize: '20px'
        }}>
          {icon}
        </div>
      )}
    </div>
    {trend !== undefined && (
      <div style={{
        marginTop: '8px',
        fontSize: '12px',
        fontWeight: '500',
        color: trend >= 0 ? COLORS.success : COLORS.danger
      }}>
        {trend >= 0 ? '↑' : '↓'} {Math.abs(trend)}% vs last period
      </div>
    )}
  </div>
);

/**
 * Action Item Card
 */
const ActionItemCard = ({ type, icon, title, items, color, onItemClick }) => (
  <div style={{
    background: 'white',
    borderRadius: '12px',
    boxShadow: '0 1px 3px rgba(0,0,0,0.1)',
    overflow: 'hidden'
  }}>
    <div style={{
      padding: '16px 20px',
      borderBottom: '1px solid #e5e7eb',
      display: 'flex',
      alignItems: 'center',
      gap: '10px'
    }}>
      <span style={{ fontSize: '20px' }}>{icon}</span>
      <h3 style={{ margin: 0, fontSize: '15px', fontWeight: '600', color: '#1f2937' }}>
        {title}
      </h3>
      <span style={{
        marginLeft: 'auto',
        padding: '4px 10px',
        background: `${color}15`,
        color: color,
        borderRadius: '12px',
        fontSize: '12px',
        fontWeight: '600'
      }}>
        {items.length}
      </span>
    </div>
    <div style={{ maxHeight: '200px', overflowY: 'auto' }}>
      {items.length === 0 ? (
        <div style={{ padding: '24px', textAlign: 'center', color: '#9ca3af' }}>
          No items
        </div>
      ) : (
        items.map((item, idx) => (
          <div
            key={idx}
            onClick={() => onItemClick?.(type, item)}
            style={{
              padding: '12px 20px',
              borderBottom: idx < items.length - 1 ? '1px solid #f3f4f6' : 'none',
              cursor: 'pointer',
              transition: 'background 0.15s ease'
            }}
            onMouseEnter={(e) => e.currentTarget.style.background = '#f9fafb'}
            onMouseLeave={(e) => e.currentTarget.style.background = 'transparent'}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
              <div>
                <div style={{ fontWeight: '500', fontSize: '13px', color: '#1f2937' }}>
                  {item.title || item.contactName || item.customerName || item.name}
                </div>
                <div style={{ fontSize: '12px', color: '#6b7280', marginTop: '2px' }}>
                  {item.subtitle || item.leadNumber || item.quoteNumber}
                </div>
              </div>
              {item.badge && (
                <span style={{
                  padding: '2px 8px',
                  background: `${item.badgeColor || COLORS.warning}15`,
                  color: item.badgeColor || COLORS.warning,
                  borderRadius: '4px',
                  fontSize: '11px',
                  fontWeight: '500'
                }}>
                  {item.badge}
                </span>
              )}
            </div>
          </div>
        ))
      )}
    </div>
  </div>
);

/**
 * Performance Table Row
 */
const PerformanceRow = ({ data, rank }) => (
  <div style={{
    display: 'grid',
    gridTemplateColumns: '40px 1fr 80px 80px 100px',
    gap: '12px',
    padding: '12px 16px',
    alignItems: 'center',
    borderBottom: '1px solid #f3f4f6'
  }}>
    <div style={{
      width: '28px',
      height: '28px',
      borderRadius: '50%',
      background: rank === 1 ? '#fef3c7' : rank === 2 ? '#f3f4f6' : rank === 3 ? '#fef3c7' : '#f9fafb',
      color: rank === 1 ? '#f59e0b' : rank === 2 ? '#6b7280' : rank === 3 ? '#cd7f32' : '#9ca3af',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      fontSize: '12px',
      fontWeight: 'bold'
    }}>
      {rank}
    </div>
    <div>
      <div style={{ fontWeight: '500', fontSize: '13px', color: '#1f2937' }}>{data.name}</div>
      <div style={{ fontSize: '11px', color: '#9ca3af' }}>{data.role}</div>
    </div>
    <div style={{ textAlign: 'center' }}>
      <div style={{ fontWeight: '600', fontSize: '14px', color: '#1f2937' }}>{data.quotesWon}</div>
      <div style={{ fontSize: '10px', color: '#9ca3af' }}>Won</div>
    </div>
    <div style={{ textAlign: 'center' }}>
      <div style={{ fontWeight: '600', fontSize: '14px', color: COLORS.success }}>{data.conversionRate}%</div>
      <div style={{ fontSize: '10px', color: '#9ca3af' }}>Conv.</div>
    </div>
    <div style={{ textAlign: 'right' }}>
      <div style={{ fontWeight: '600', fontSize: '14px', color: COLORS.success }}>{formatCurrency(data.wonValueCents)}</div>
      <div style={{ fontSize: '10px', color: '#9ca3af' }}>Revenue</div>
    </div>
  </div>
);

/**
 * Main Sales Pipeline Dashboard
 */
const SalesPipelineDashboard = ({ onNavigate, onViewLead, onViewQuote, onViewCustomer }) => {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [selectedPeriod, setSelectedPeriod] = useState('30d');
  const [refreshing, setRefreshing] = useState(false);

  const fetchData = useCallback(async () => {
    try {
      setRefreshing(true);
      const [summaryRes, teamRes, sourceRes] = await Promise.all([
        authFetch(`${API_URL}/api/dashboard/summary`),
        authFetch(`${API_URL}/api/dashboard/performance/team?days=30`),
        authFetch(`${API_URL}/api/dashboard/performance/by-source`)
      ]);

      if (!summaryRes.ok) throw new Error('Failed to fetch dashboard data');

      const summaryData = await summaryRes.json();
      const teamData = await teamRes.json();
      const sourceData = await sourceRes.json();

      setData({
        ...summaryData.data,
        teamPerformance: teamData.data,
        sourcePerformance: sourceData.data
      });
    } catch (err) {
      console.error('Dashboard error:', err);
      setError(err.message);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    fetchData();
    const interval = setInterval(fetchData, 60000);
    return () => clearInterval(interval);
  }, [fetchData]);

  const handleActionItemClick = (type, item) => {
    switch (type) {
      case 'overdueFollowUps':
      case 'hotLeads':
        onViewLead?.(item.id);
        break;
      case 'stalledQuotes':
        onViewQuote?.(item.id);
        break;
      case 'atRiskCustomers':
        onViewCustomer?.(item.customerId);
        break;
      default:
        break;
    }
  };

  if (loading) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '400px' }}>
        <div style={{ textAlign: 'center', color: '#6b7280' }}>
          <div style={{
            width: '40px',
            height: '40px',
            border: '3px solid #e5e7eb',
            borderTopColor: COLORS.primary,
            borderRadius: '50%',
            animation: 'spin 1s linear infinite',
            margin: '0 auto 16px'
          }} />
          Loading sales pipeline...
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '400px' }}>
        <div style={{ textAlign: 'center', maxWidth: '400px' }}>
          <div style={{ fontSize: '48px', marginBottom: '16px' }}>&#9888;&#65039;</div>
          <h2 style={{ margin: '0 0 12px', color: COLORS.danger }}>Error Loading Dashboard</h2>
          <p style={{ color: '#6b7280', marginBottom: '20px' }}>{error}</p>
          <button
            onClick={fetchData}
            style={{
              padding: '12px 24px',
              background: COLORS.primary,
              color: 'white',
              border: 'none',
              borderRadius: '8px',
              cursor: 'pointer',
              fontWeight: '600'
            }}
          >
            Retry
          </button>
        </div>
      </div>
    );
  }

  const { overview, actionItems, weeklyTrends, teamPerformance, sourcePerformance } = data || {};

  return (
    <div style={{ padding: '24px', maxWidth: '1600px', margin: '0 auto' }}>
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '24px' }}>
        <div>
          <h1 style={{ margin: 0, fontSize: '28px', fontWeight: 'bold', color: '#1f2937' }}>
            Sales Pipeline
          </h1>
          <p style={{ margin: '4px 0 0', color: '#6b7280', fontSize: '14px' }}>
            Unified view of your entire sales funnel
          </p>
        </div>
        <div style={{ display: 'flex', gap: '12px' }}>
          <select
            value={selectedPeriod}
            onChange={(e) => setSelectedPeriod(e.target.value)}
            style={{
              padding: '10px 16px',
              border: '1px solid #e5e7eb',
              borderRadius: '8px',
              fontSize: '14px',
              color: '#374151',
              background: 'white',
              cursor: 'pointer'
            }}
          >
            <option value="7d">Last 7 Days</option>
            <option value="30d">Last 30 Days</option>
            <option value="90d">Last 90 Days</option>
            <option value="ytd">Year to Date</option>
          </select>
          <button
            onClick={fetchData}
            disabled={refreshing}
            style={{
              padding: '10px 16px',
              background: 'white',
              border: '1px solid #e5e7eb',
              borderRadius: '8px',
              fontSize: '14px',
              cursor: refreshing ? 'wait' : 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: '6px'
            }}
          >
            &#8635; {refreshing ? 'Refreshing...' : 'Refresh'}
          </button>
        </div>
      </div>

      {/* Conversion Rates Row */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(4, 1fr)',
        gap: '16px',
        marginBottom: '24px'
      }}>
        <MetricCard
          title="Total Leads"
          value={overview?.leads?.total || 0}
          subtitle={`${overview?.leads?.thisWeek || 0} this week`}
          icon="&#128101;"
          color={COLORS.primary}
          onClick={() => onNavigate?.('leads')}
        />
        <MetricCard
          title="Lead to Quote"
          value={`${overview?.conversionRates?.leadToQuote || 0}%`}
          subtitle={`${overview?.leads?.quoteCreated || 0} converted`}
          icon="&#128200;"
          color={COLORS.purple}
        />
        <MetricCard
          title="Quote Win Rate"
          value={`${overview?.conversionRates?.winRate || 0}%`}
          subtitle={`${overview?.quotes?.won || 0} won`}
          icon="&#127942;"
          color={COLORS.success}
        />
        <MetricCard
          title="Avg Days to Close"
          value={overview?.quotes?.avgDaysToClose || 0}
          subtitle="From quote to won"
          icon="&#9200;"
          color={COLORS.warning}
        />
      </div>

      {/* Pipeline Value Cards */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(3, 1fr)',
        gap: '16px',
        marginBottom: '24px'
      }}>
        <div style={{
          background: 'linear-gradient(135deg, #3b82f6 0%, #1d4ed8 100%)',
          padding: '24px',
          borderRadius: '12px',
          color: 'white'
        }}>
          <div style={{ fontSize: '14px', opacity: 0.9 }}>Pipeline Value</div>
          <div style={{ fontSize: '36px', fontWeight: 'bold', marginTop: '8px' }}>
            {formatCurrency(overview?.quotes?.pipelineValueCents)}
          </div>
          <div style={{ fontSize: '13px', opacity: 0.8, marginTop: '8px' }}>
            {(overview?.quotes?.draft || 0) + (overview?.quotes?.sent || 0)} active quotes
          </div>
        </div>

        <div style={{
          background: 'linear-gradient(135deg, #22c55e 0%, #16a34a 100%)',
          padding: '24px',
          borderRadius: '12px',
          color: 'white'
        }}>
          <div style={{ fontSize: '14px', opacity: 0.9 }}>Won Revenue</div>
          <div style={{ fontSize: '36px', fontWeight: 'bold', marginTop: '8px' }}>
            {formatCurrency(overview?.quotes?.wonValueCents)}
          </div>
          <div style={{ fontSize: '13px', opacity: 0.8, marginTop: '8px' }}>
            {overview?.quotes?.won || 0} quotes won
          </div>
        </div>

        <div style={{
          background: 'linear-gradient(135deg, #f59e0b 0%, #d97706 100%)',
          padding: '24px',
          borderRadius: '12px',
          color: 'white'
        }}>
          <div style={{ fontSize: '14px', opacity: 0.9 }}>Total CLV</div>
          <div style={{ fontSize: '36px', fontWeight: 'bold', marginTop: '8px' }}>
            {formatCurrency(overview?.customers?.totalClvCents)}
          </div>
          <div style={{ fontSize: '13px', opacity: 0.8, marginTop: '8px' }}>
            {overview?.customers?.total || 0} active customers
          </div>
        </div>
      </div>

      {/* Main Content Grid */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: '1fr 1fr',
        gap: '24px',
        marginBottom: '24px'
      }}>
        {/* Pipeline Funnel */}
        <div style={{
          background: 'white',
          borderRadius: '12px',
          boxShadow: '0 1px 3px rgba(0,0,0,0.1)',
          padding: '20px'
        }}>
          <h3 style={{ margin: '0 0 16px', fontSize: '16px', fontWeight: '600', color: '#1f2937' }}>
            Sales Funnel
          </h3>
          <PipelineFunnel data={overview?.funnel} />
        </div>

        {/* Weekly Trends */}
        <div style={{
          background: 'white',
          borderRadius: '12px',
          boxShadow: '0 1px 3px rgba(0,0,0,0.1)',
          padding: '20px'
        }}>
          <h3 style={{ margin: '0 0 16px', fontSize: '16px', fontWeight: '600', color: '#1f2937' }}>
            Weekly Trends
          </h3>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
            <div>
              <div style={{ fontSize: '12px', color: '#6b7280', marginBottom: '8px' }}>Leads Created</div>
              <TrendChart
                data={weeklyTrends}
                dataKey="leadsCreated"
                color={COLORS.primary}
                name="Leads"
              />
            </div>
            <div>
              <div style={{ fontSize: '12px', color: '#6b7280', marginBottom: '8px' }}>Quotes Won</div>
              <TrendChart
                data={weeklyTrends}
                dataKey="quotesWon"
                color={COLORS.success}
                name="Won"
              />
            </div>
          </div>
        </div>
      </div>

      {/* Action Items Grid */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(4, 1fr)',
        gap: '16px',
        marginBottom: '24px'
      }}>
        <ActionItemCard
          type="overdueFollowUps"
          icon="&#128197;"
          title="Overdue Follow-ups"
          items={(actionItems?.overdueFollowUps || []).map(item => ({
            ...item,
            title: item.contactName,
            subtitle: item.leadNumber,
            badge: `${item.daysOverdue}d overdue`,
            badgeColor: COLORS.danger
          }))}
          color={COLORS.danger}
          onItemClick={handleActionItemClick}
        />
        <ActionItemCard
          type="stalledQuotes"
          icon="&#9888;&#65039;"
          title="Stalled Quotes"
          items={(actionItems?.stalledQuotes || []).map(item => ({
            ...item,
            title: item.customerName || 'Unknown',
            subtitle: item.quoteNumber,
            badge: formatCurrency(item.totalCents),
            badgeColor: COLORS.warning
          }))}
          color={COLORS.warning}
          onItemClick={handleActionItemClick}
        />
        <ActionItemCard
          type="atRiskCustomers"
          icon="&#128680;"
          title="At-Risk Customers"
          items={(actionItems?.atRiskCustomers || []).map(item => ({
            ...item,
            title: item.name,
            subtitle: `CLV: ${formatCurrency(item.clvScore)}`,
            badge: `${item.openQuotes} open`,
            badgeColor: COLORS.danger
          }))}
          color={COLORS.danger}
          onItemClick={handleActionItemClick}
        />
        <ActionItemCard
          type="hotLeads"
          icon="&#128293;"
          title="Hot Leads"
          items={(actionItems?.hotLeads || []).map(item => ({
            ...item,
            title: item.contactName,
            subtitle: item.leadNumber,
            badge: item.status,
            badgeColor: COLORS.info
          }))}
          color={COLORS.info}
          onItemClick={handleActionItemClick}
        />
      </div>

      {/* Bottom Row: Team & Source Performance */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: '1fr 1fr',
        gap: '24px'
      }}>
        {/* Team Performance */}
        <div style={{
          background: 'white',
          borderRadius: '12px',
          boxShadow: '0 1px 3px rgba(0,0,0,0.1)',
          overflow: 'hidden'
        }}>
          <div style={{
            padding: '16px 20px',
            borderBottom: '1px solid #e5e7eb'
          }}>
            <h3 style={{ margin: 0, fontSize: '16px', fontWeight: '600', color: '#1f2937' }}>
              Team Performance
            </h3>
          </div>
          <div style={{ maxHeight: '300px', overflowY: 'auto' }}>
            {(teamPerformance || []).slice(0, 5).map((person, idx) => (
              <PerformanceRow key={person.userId} data={person} rank={idx + 1} />
            ))}
            {(!teamPerformance || teamPerformance.length === 0) && (
              <div style={{ padding: '24px', textAlign: 'center', color: '#9ca3af' }}>
                No team data available
              </div>
            )}
          </div>
        </div>

        {/* Source Performance */}
        <div style={{
          background: 'white',
          borderRadius: '12px',
          boxShadow: '0 1px 3px rgba(0,0,0,0.1)',
          overflow: 'hidden'
        }}>
          <div style={{
            padding: '16px 20px',
            borderBottom: '1px solid #e5e7eb'
          }}>
            <h3 style={{ margin: 0, fontSize: '16px', fontWeight: '600', color: '#1f2937' }}>
              Performance by Lead Source
            </h3>
          </div>
          <div style={{ padding: '16px' }}>
            {(sourcePerformance || []).slice(0, 5).map((source, idx) => (
              <div
                key={source.source}
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  padding: '12px',
                  background: idx % 2 === 0 ? '#f9fafb' : 'white',
                  borderRadius: '8px',
                  marginBottom: '8px'
                }}
              >
                <div>
                  <div style={{ fontWeight: '500', fontSize: '14px', color: '#1f2937' }}>
                    {source.source}
                  </div>
                  <div style={{ fontSize: '12px', color: '#6b7280' }}>
                    {source.leadsCount} leads &bull; {source.leadConversionRate}% conversion
                  </div>
                </div>
                <div style={{ textAlign: 'right' }}>
                  <div style={{ fontWeight: '600', fontSize: '14px', color: COLORS.success }}>
                    {formatCurrency(source.wonValueCents)}
                  </div>
                  <div style={{ fontSize: '11px', color: '#9ca3af' }}>
                    {source.wonQuotes} won
                  </div>
                </div>
              </div>
            ))}
            {(!sourcePerformance || sourcePerformance.length === 0) && (
              <div style={{ padding: '24px', textAlign: 'center', color: '#9ca3af' }}>
                No source data available
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default SalesPipelineDashboard;
