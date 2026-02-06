/**
 * Dashboard Component
 *
 * Enhanced dashboard with:
 * - Key metrics/KPIs with advanced calculations
 * - Conversion rate, avg days to close
 * - Win rate by value tier
 * - Sales velocity metrics
 * - Top salespeople leaderboard
 * - Pipeline overview
 * - Recent activity feed
 * - At-risk customers widget (Week 4.4)
 */

import React, { useState, useEffect, useCallback } from 'react';
import { AtRiskCustomers } from './customers';
import { AIInsightsWidget, SmartQuickActions, UnifiedTimeline } from './dashboard/index';
import {
  AreaChart, Area, BarChart, Bar, LineChart, Line, PieChart, Pie, Cell,
  XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend
} from 'recharts';

const API_URL = process.env.REACT_APP_API_URL || 'http://localhost:3001';

// Chart color palette
const CHART_COLORS = {
  primary: '#6366f1',
  success: '#22c55e',
  warning: '#f59e0b',
  danger: '#ef4444',
  info: '#3b82f6',
  purple: '#8b5cf6',
  pink: '#ec4899',
  teal: '#14b8a6'
};

const STATUS_COLORS = {
  draft: '#9ca3af',
  sent: '#3b82f6',
  pending: '#f59e0b',
  won: '#22c55e',
  lost: '#ef4444'
};

// Activity type configurations
const ACTIVITY_CONFIG = {
  CREATED: { icon: '✨', color: '#3b82f6', bgColor: '#dbeafe', label: 'Created' },
  UPDATED: { icon: '✏️', color: '#f59e0b', bgColor: '#fef3c7', label: 'Updated' },
  STATUS_CHANGED: { icon: '🔄', color: '#6366f1', bgColor: '#e0e7ff', label: 'Status Changed' },
  SENT: { icon: '📤', color: '#10b981', bgColor: '#d1fae5', label: 'Sent' },
  WON: { icon: '🏆', color: '#22c55e', bgColor: '#dcfce7', label: 'Won' },
  LOST: { icon: '❌', color: '#ef4444', bgColor: '#fee2e2', label: 'Lost' },
  EMAIL_SENT: { icon: '📧', color: '#10b981', bgColor: '#d1fae5', label: 'Email Sent' },
  CUSTOMER_VIEWED: { icon: '👀', color: '#8b5cf6', bgColor: '#ede9fe', label: 'Viewed' },
  FOLLOW_UP_SCHEDULED: { icon: '📅', color: '#f97316', bgColor: '#ffedd5', label: 'Follow-up' },
  CUSTOMER_CONTACTED: { icon: '📞', color: '#06b6d4', bgColor: '#cffafe', label: 'Contacted' },
  PRICE_ADJUSTED: { icon: '💰', color: '#eab308', bgColor: '#fef9c3', label: 'Price Adjusted' },
  APPROVAL_REQUESTED: { icon: '⏳', color: '#f59e0b', bgColor: '#fef3c7', label: 'Approval Requested' },
  APPROVED: { icon: '✅', color: '#22c55e', bgColor: '#dcfce7', label: 'Approved' },
  REJECTED: { icon: '❌', color: '#ef4444', bgColor: '#fee2e2', label: 'Rejected' },
  NOTE_ADDED: { icon: '📝', color: '#6b7280', bgColor: '#f3f4f6', label: 'Note' },
  INTERNAL_NOTE: { icon: '🔒', color: '#374151', bgColor: '#e5e7eb', label: 'Internal Note' }
};

/**
 * Mini sparkline component for KPI cards
 */
const Sparkline = ({ data, color = CHART_COLORS.primary, height = 40 }) => {
  if (!data || data.length === 0) return null;

  return (
    <ResponsiveContainer width="100%" height={height}>
      <AreaChart data={data} margin={{ top: 0, right: 0, left: 0, bottom: 0 }}>
        <defs>
          <linearGradient id={`gradient-${color.replace('#', '')}`} x1="0" y1="0" x2="0" y2="1">
            <stop offset="5%" stopColor={color} stopOpacity={0.3}/>
            <stop offset="95%" stopColor={color} stopOpacity={0}/>
          </linearGradient>
        </defs>
        <Area
          type="monotone"
          dataKey="value"
          stroke={color}
          strokeWidth={2}
          fill={`url(#gradient-${color.replace('#', '')})`}
        />
      </AreaChart>
    </ResponsiveContainer>
  );
};

/**
 * Win Rate Chart using Recharts horizontal BarChart
 */
const WinRateChart = ({ data }) => {
  if (!data || data.length === 0) {
    return <div style={{ textAlign: 'center', color: '#9ca3af', padding: '20px' }}>No data available</div>;
  }

  const chartData = data.map(tier => ({
    name: tier.tierLabel,
    winRate: tier.winRate,
    fill: tier.winRate >= 50 ? CHART_COLORS.success : tier.winRate >= 25 ? CHART_COLORS.warning : CHART_COLORS.danger,
    wonCount: tier.wonCount,
    closedCount: tier.closedCount
  }));

  const CustomTooltip = ({ active, payload }) => {
    if (active && payload && payload.length) {
      const data = payload[0].payload;
      return (
        <div style={{
          background: 'white',
          border: '1px solid #e5e7eb',
          borderRadius: '8px',
          padding: '12px',
          boxShadow: '0 4px 12px rgba(0,0,0,0.1)'
        }}>
          <p style={{ margin: 0, fontWeight: '600', color: '#1f2937' }}>{data.name}</p>
          <p style={{ margin: '4px 0 0', color: data.fill, fontWeight: '600' }}>{data.winRate}% Win Rate</p>
          <p style={{ margin: '4px 0 0', fontSize: '12px', color: '#6b7280' }}>
            {data.wonCount} won / {data.closedCount} closed
          </p>
        </div>
      );
    }
    return null;
  };

  return (
    <ResponsiveContainer width="100%" height={Math.max(120, data.length * 50)}>
      <BarChart
        data={chartData}
        layout="vertical"
        margin={{ top: 5, right: 30, left: 80, bottom: 5 }}
      >
        <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="#f3f4f6" />
        <XAxis type="number" domain={[0, 100]} tickFormatter={(v) => `${v}%`} stroke="#9ca3af" fontSize={12} />
        <YAxis type="category" dataKey="name" stroke="#9ca3af" fontSize={12} width={75} />
        <Tooltip content={<CustomTooltip />} />
        <Bar dataKey="winRate" radius={[0, 4, 4, 0]} barSize={20}>
          {chartData.map((entry, index) => (
            <Cell key={`cell-${index}`} fill={entry.fill} />
          ))}
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  );
};

/**
 * Pipeline Pie Chart
 */
const PipelinePieChart = ({ stats }) => {
  const data = [
    { name: 'Draft', value: stats?.draft_count || 0, color: STATUS_COLORS.draft },
    { name: 'Sent', value: stats?.sent_count || 0, color: STATUS_COLORS.sent },
    { name: 'Won', value: stats?.won_count || 0, color: STATUS_COLORS.won },
    { name: 'Lost', value: stats?.lost_count || 0, color: STATUS_COLORS.lost }
  ].filter(d => d.value > 0);

  if (data.length === 0) {
    return <div style={{ textAlign: 'center', color: '#9ca3af', padding: '20px' }}>No data</div>;
  }

  return (
    <ResponsiveContainer width="100%" height={200}>
      <PieChart>
        <Pie
          data={data}
          cx="50%"
          cy="50%"
          innerRadius={50}
          outerRadius={80}
          paddingAngle={2}
          dataKey="value"
        >
          {data.map((entry, index) => (
            <Cell key={`cell-${index}`} fill={entry.color} />
          ))}
        </Pie>
        <Tooltip
          formatter={(value, name) => [`${value} quotes`, name]}
          contentStyle={{ borderRadius: '8px', border: '1px solid #e5e7eb' }}
        />
        <Legend
          verticalAlign="bottom"
          iconType="circle"
          iconSize={8}
          formatter={(value) => <span style={{ color: '#374151', fontSize: '12px' }}>{value}</span>}
        />
      </PieChart>
    </ResponsiveContainer>
  );
};

/**
 * Weekly Activity Bar Chart
 */
const WeeklyActivityChart = ({ weeklyActivity }) => {
  const data = [
    { name: 'Created', value: weeklyActivity?.created || 0, fill: CHART_COLORS.info },
    { name: 'Sent', value: weeklyActivity?.sent || 0, fill: CHART_COLORS.purple },
    { name: 'Won', value: weeklyActivity?.won || 0, fill: CHART_COLORS.success },
    { name: 'Lost', value: weeklyActivity?.lost || 0, fill: CHART_COLORS.danger }
  ];

  return (
    <ResponsiveContainer width="100%" height={160}>
      <BarChart data={data} margin={{ top: 10, right: 10, left: 10, bottom: 5 }}>
        <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f3f4f6" />
        <XAxis dataKey="name" stroke="#9ca3af" fontSize={12} tickLine={false} />
        <YAxis stroke="#9ca3af" fontSize={12} tickLine={false} allowDecimals={false} />
        <Tooltip
          formatter={(value) => [value, 'Quotes']}
          contentStyle={{ borderRadius: '8px', border: '1px solid #e5e7eb' }}
        />
        <Bar dataKey="value" radius={[4, 4, 0, 0]} barSize={40}>
          {data.map((entry, index) => (
            <Cell key={`cell-${index}`} fill={entry.fill} />
          ))}
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  );
};

/**
 * Enhanced Metric card component with sparkline support
 */
const MetricCard = ({ title, value, subtitle, icon, color = '#3b82f6', trend, trendValue, sparkData }) => (
  <div style={{
    background: 'white',
    padding: '20px',
    borderRadius: '12px',
    boxShadow: '0 1px 3px rgba(0,0,0,0.1)',
    borderLeft: `4px solid ${color}`,
    position: 'relative',
    overflow: 'hidden'
  }}>
    <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between' }}>
      <div style={{ flex: 1 }}>
        <div style={{ fontSize: '13px', color: '#6b7280', marginBottom: '6px', fontWeight: '500' }}>{title}</div>
        <div style={{ fontSize: '28px', fontWeight: 'bold', color: '#1f2937' }}>{value}</div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginTop: '4px' }}>
          {trend && (
            <span style={{
              fontSize: '12px',
              fontWeight: '600',
              color: trend === 'up' ? '#22c55e' : trend === 'down' ? '#ef4444' : '#6b7280',
              display: 'flex',
              alignItems: 'center',
              gap: '2px',
              padding: '2px 6px',
              borderRadius: '4px',
              background: trend === 'up' ? '#dcfce7' : trend === 'down' ? '#fee2e2' : '#f3f4f6'
            }}>
              {trend === 'up' ? '↑' : trend === 'down' ? '↓' : '→'} {trendValue}
            </span>
          )}
          {subtitle && (
            <span style={{ fontSize: '12px', color: '#9ca3af' }}>{subtitle}</span>
          )}
        </div>
      </div>
      {icon && (
        <div style={{
          width: '44px',
          height: '44px',
          borderRadius: '12px',
          background: `linear-gradient(135deg, ${color}20 0%, ${color}10 100%)`,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          fontSize: '22px',
          flexShrink: 0
        }}>
          {icon}
        </div>
      )}
    </div>
    {/* Sparkline at bottom */}
    {sparkData && sparkData.length > 0 && (
      <div style={{ marginTop: '12px', marginLeft: '-8px', marginRight: '-8px' }}>
        <Sparkline data={sparkData} color={color} height={35} />
      </div>
    )}
  </div>
);

/**
 * Activity badge for weekly stats
 */
const ActivityBadge = ({ label, count, color, icon }) => (
  <div style={{
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
    padding: '10px 14px',
    background: `${color}10`,
    borderRadius: '8px',
    border: `1px solid ${color}30`
  }}>
    <span style={{ fontSize: '16px' }}>{icon}</span>
    <div>
      <div style={{ fontSize: '18px', fontWeight: 'bold', color }}>{count}</div>
      <div style={{ fontSize: '11px', color: '#6b7280' }}>{label}</div>
    </div>
  </div>
);

// Time period options for filtering
const TIME_PERIODS = [
  { value: '7d', label: '7 Days' },
  { value: '30d', label: '30 Days' },
  { value: '90d', label: '90 Days' },
  { value: 'ytd', label: 'YTD' },
  { value: 'all', label: 'All Time' }
];

const Dashboard = ({ onNavigate, onViewQuote, onBack }) => {
  const [stats, setStats] = useState(null);
  const [recentActivities, setRecentActivities] = useState([]);
  const [recentQuotes, setRecentQuotes] = useState([]);
  const [loading, setLoading] = useState(true);
  const [activityFilter, setActivityFilter] = useState('all');
  const [timePeriod, setTimePeriod] = useState('30d');
  const [lastRefresh, setLastRefresh] = useState(null);
  const [error, setError] = useState(null);

  // Fetch dashboard data
  const fetchDashboardData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [statsRes, activitiesRes, quotesRes] = await Promise.all([
        fetch(`${API_URL}/api/quotations/stats/dashboard`),
        fetch(`${API_URL}/api/activities/recent?limit=30`),
        fetch(`${API_URL}/api/quotations?limit=10&sortBy=created_at&sortOrder=DESC`)
      ]);

      // Handle stats response (standardized API response format)
      if (statsRes.ok) {
        const statsData = await statsRes.json();
        // Handle both direct data and wrapped { success, data } format
        if (statsData.success && statsData.data) {
          setStats(statsData.data);
        } else if (statsData.success === undefined) {
          // Legacy format - direct data
          setStats(statsData);
        } else {
          console.error('Dashboard stats API error:', statsData.error);
          setError(`Failed to load dashboard metrics: ${statsData.error?.message || 'Unknown error'}`);
        }
      } else {
        const errorData = await statsRes.json().catch(() => ({}));
        console.error('Dashboard stats API error:', statsRes.status, errorData);
        setError(`Failed to load dashboard metrics: ${errorData?.error?.message || statsRes.statusText}`);
      }

      // Handle activities response
      if (activitiesRes.ok) {
        const activitiesData = await activitiesRes.json();
        setRecentActivities(activitiesData.activities || []);
      } else {
        console.error('Activities API error:', activitiesRes.status);
      }

      // Handle quotes response
      if (quotesRes.ok) {
        const quotesData = await quotesRes.json();
        setRecentQuotes(quotesData.quotations || []);
      } else {
        console.error('Quotes API error:', quotesRes.status);
      }

      setLastRefresh(new Date());
    } catch (error) {
      console.error('Error fetching dashboard data:', error);
      setError(`Connection error: ${error.message}. Please check if the backend server is running.`);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchDashboardData();
    const interval = setInterval(fetchDashboardData, 60000); // Refresh every minute
    return () => clearInterval(interval);
  }, [fetchDashboardData]);

  // Format currency
  const formatCurrency = (cents) => {
    return `$${((cents || 0) / 100).toLocaleString('en-CA', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`;
  };

  // Format relative time
  const formatRelativeTime = (date) => {
    const now = new Date();
    const activityDate = new Date(date);
    const diffMs = now - activityDate;
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMs / 3600000);
    const diffDays = Math.floor(diffMs / 86400000);

    if (diffMins < 1) return 'Just now';
    if (diffMins < 60) return `${diffMins}m ago`;
    if (diffHours < 24) return `${diffHours}h ago`;
    if (diffDays < 7) return `${diffDays}d ago`;

    return activityDate.toLocaleDateString('en-CA', { month: 'short', day: 'numeric' });
  };

  // Get config for activity type
  const getActivityConfig = (type) => {
    return ACTIVITY_CONFIG[type] || {
      icon: '📌',
      color: '#6b7280',
      bgColor: '#f3f4f6',
      label: type
    };
  };

  // Filter activities
  const filteredActivities = recentActivities.filter(activity => {
    if (activityFilter === 'all') return true;
    if (activityFilter === 'communication') {
      return ['EMAIL_SENT', 'CUSTOMER_CONTACTED', 'CUSTOMER_VIEWED', 'FOLLOW_UP_SCHEDULED'].includes(activity.event_type);
    }
    if (activityFilter === 'status') {
      return ['STATUS_CHANGED', 'SENT', 'WON', 'LOST', 'APPROVED', 'REJECTED'].includes(activity.event_type);
    }
    if (activityFilter === 'notes') {
      return ['NOTE_ADDED', 'INTERNAL_NOTE'].includes(activity.event_type);
    }
    return true;
  });

  // Status badge component
  const StatusBadge = ({ status }) => {
    const statusColors = {
      DRAFT: { bg: '#f3f4f6', text: '#374151' },
      SENT: { bg: '#dbeafe', text: '#1d4ed8' },
      WON: { bg: '#dcfce7', text: '#166534' },
      LOST: { bg: '#fee2e2', text: '#991b1b' },
      PENDING_APPROVAL: { bg: '#fef3c7', text: '#92400e' }
    };
    const colors = statusColors[status] || statusColors.DRAFT;

    return (
      <span style={{
        padding: '4px 10px',
        background: colors.bg,
        color: colors.text,
        borderRadius: '12px',
        fontSize: '11px',
        fontWeight: '600',
        textTransform: 'uppercase'
      }}>
        {status}
      </span>
    );
  };

  if (loading && !stats) {
    return (
      <div style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        height: '400px',
        color: '#6b7280'
      }}>
        <div style={{ textAlign: 'center' }}>
          <div style={{
            width: '40px',
            height: '40px',
            border: '3px solid #e5e7eb',
            borderTopColor: '#3b82f6',
            borderRadius: '50%',
            animation: 'spin 1s linear infinite',
            margin: '0 auto 16px'
          }} />
          Loading dashboard...
        </div>
      </div>
    );
  }

  // Show error state if there's an error and no stats
  if (error && !stats) {
    return (
      <div style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        height: '400px',
        color: '#6b7280'
      }}>
        <div style={{ textAlign: 'center', maxWidth: '500px', padding: '20px' }}>
          <div style={{ fontSize: '48px', marginBottom: '16px' }}>⚠️</div>
          <h2 style={{ margin: '0 0 12px', color: '#ef4444', fontSize: '20px', fontWeight: '600' }}>
            Dashboard Error
          </h2>
          <p style={{ margin: '0 0 20px', color: '#6b7280', lineHeight: '1.5' }}>
            {error}
          </p>
          <button
            onClick={fetchDashboardData}
            style={{
              padding: '12px 24px',
              background: '#3b82f6',
              color: 'white',
              border: 'none',
              borderRadius: '8px',
              fontSize: '14px',
              fontWeight: '600',
              cursor: 'pointer'
            }}
          >
            Retry
          </button>
        </div>
      </div>
    );
  }

  return (
    <div style={{ padding: '24px', maxWidth: '1600px', margin: '0 auto' }}>
      {/* Header */}
      <div style={{
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginBottom: '24px'
      }}>
        <div>
          <h1 style={{ margin: 0, fontSize: '28px', fontWeight: 'bold', color: '#1f2937' }}>
            Dashboard
          </h1>
          <p style={{ margin: '4px 0 0', color: '#6b7280', fontSize: '14px' }}>
            Welcome back! Here's what's happening with your quotes.
            {lastRefresh && (
              <span style={{ marginLeft: '12px', fontSize: '12px', color: '#9ca3af' }}>
                Last updated: {lastRefresh.toLocaleTimeString()}
              </span>
            )}
          </p>
        </div>

        <div style={{ display: 'flex', gap: '12px', alignItems: 'center' }}>
          {/* Time Period Selector */}
          <div style={{
            display: 'flex',
            background: '#f3f4f6',
            borderRadius: '8px',
            padding: '4px'
          }}>
            {TIME_PERIODS.map(period => (
              <button
                key={period.value}
                onClick={() => setTimePeriod(period.value)}
                style={{
                  padding: '8px 12px',
                  background: timePeriod === period.value ? 'white' : 'transparent',
                  color: timePeriod === period.value ? '#1f2937' : '#6b7280',
                  border: 'none',
                  borderRadius: '6px',
                  fontSize: '13px',
                  fontWeight: '500',
                  cursor: 'pointer',
                  transition: 'all 0.15s ease',
                  boxShadow: timePeriod === period.value ? '0 1px 3px rgba(0,0,0,0.1)' : 'none'
                }}
              >
                {period.label}
              </button>
            ))}
          </div>

          <button
            onClick={fetchDashboardData}
            disabled={loading}
            style={{
              padding: '10px 16px',
              background: 'white',
              color: '#374151',
              border: '1px solid #e5e7eb',
              borderRadius: '8px',
              fontSize: '14px',
              fontWeight: '500',
              cursor: loading ? 'wait' : 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: '6px'
            }}
          >
            <span style={{ display: loading ? 'inline-block' : 'none', animation: 'spin 1s linear infinite' }}>⟳</span>
            {loading ? 'Refreshing...' : '⟳ Refresh'}
          </button>
          <button
            onClick={() => onNavigate?.('builder')}
            style={{
              padding: '10px 20px',
              background: 'linear-gradient(135deg, #6366f1 0%, #4f46e5 100%)',
              color: 'white',
              border: 'none',
              borderRadius: '8px',
              fontSize: '14px',
              fontWeight: '600',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: '8px',
              boxShadow: '0 2px 8px rgba(99, 102, 241, 0.3)'
            }}
          >
            <span>+</span> New Quote
          </button>
        </div>
      </div>

      {/* Smart Quick Actions */}
      <div style={{ marginBottom: '24px' }}>
        <SmartQuickActions onNavigate={onNavigate} />
      </div>

      {/* Primary Stats Row */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(5, 1fr)',
        gap: '16px',
        marginBottom: '24px'
      }}>
        <MetricCard
          title="Total Quotes"
          value={stats?.total_quotes || 0}
          subtitle={`${stats?.last_7_days || 0} this week`}
          icon="📋"
          color="#3b82f6"
        />
        <MetricCard
          title="Avg Quote Value"
          value={formatCurrency(stats?.avg_quote_value_cents || 0)}
          subtitle="Per quote"
          icon="💵"
          color="#10b981"
        />
        <MetricCard
          title="Conversion Rate"
          value={`${stats?.conversionRate || 0}%`}
          subtitle={`${stats?.closedQuotesCount || 0} closed quotes`}
          icon="🎯"
          color="#8b5cf6"
        />
        <MetricCard
          title="Avg Days to Close"
          value={stats?.avgDaysToClose || 0}
          subtitle={stats?.daysToCloseSampleSize > 0 ? `Based on ${stats.daysToCloseSampleSize} won quotes` : 'No data yet'}
          icon="⏱️"
          color="#f59e0b"
        />
        <MetricCard
          title="Win Rate"
          value={`${stats?.win_rate || 0}%`}
          subtitle={`${stats?.won_count || 0} won / ${stats?.total_quotes || 0} total`}
          icon="🏆"
          color="#22c55e"
        />
      </div>

      {/* Pipeline Value Cards */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(3, 1fr)',
        gap: '16px',
        marginBottom: '24px'
      }}>
        {/* Pipeline Value */}
        <div style={{
          background: 'linear-gradient(135deg, #3b82f6 0%, #1d4ed8 100%)',
          padding: '24px',
          borderRadius: '12px',
          color: 'white'
        }}>
          <div style={{ fontSize: '14px', opacity: 0.9, marginBottom: '8px' }}>Pipeline Value</div>
          <div style={{ fontSize: '36px', fontWeight: 'bold' }}>
            {formatCurrency(stats?.pipeline_value_cents)}
          </div>
          <div style={{ fontSize: '13px', opacity: 0.8, marginTop: '8px' }}>
            {(stats?.draft_count || 0) + (stats?.sent_count || 0)} active quotes
          </div>
          <div style={{
            marginTop: '12px',
            padding: '8px 12px',
            background: 'rgba(255,255,255,0.15)',
            borderRadius: '6px',
            fontSize: '12px'
          }}>
            Potential revenue if all convert
          </div>
        </div>

        {/* Won Revenue */}
        <div style={{
          background: 'linear-gradient(135deg, #22c55e 0%, #16a34a 100%)',
          padding: '24px',
          borderRadius: '12px',
          color: 'white'
        }}>
          <div style={{ fontSize: '14px', opacity: 0.9, marginBottom: '8px' }}>Won Revenue</div>
          <div style={{ fontSize: '36px', fontWeight: 'bold' }}>
            {formatCurrency(stats?.won_value_cents)}
          </div>
          <div style={{ fontSize: '13px', opacity: 0.8, marginTop: '8px' }}>
            {stats?.won_count || 0} quotes won
          </div>
          <div style={{
            marginTop: '12px',
            padding: '8px 12px',
            background: 'rgba(255,255,255,0.15)',
            borderRadius: '6px',
            fontSize: '12px'
          }}>
            Profit: {formatCurrency(stats?.won_profit_cents)}
          </div>
        </div>

        {/* Lost Value */}
        <div style={{
          background: 'linear-gradient(135deg, #ef4444 0%, #dc2626 100%)',
          padding: '24px',
          borderRadius: '12px',
          color: 'white'
        }}>
          <div style={{ fontSize: '14px', opacity: 0.9, marginBottom: '8px' }}>Lost Value</div>
          <div style={{ fontSize: '36px', fontWeight: 'bold' }}>
            {formatCurrency(stats?.lost_value_cents)}
          </div>
          <div style={{ fontSize: '13px', opacity: 0.8, marginTop: '8px' }}>
            {stats?.lost_count || 0} quotes lost
          </div>
          <div style={{
            marginTop: '12px',
            padding: '8px 12px',
            background: 'rgba(255,255,255,0.15)',
            borderRadius: '6px',
            fontSize: '12px'
          }}>
            Opportunity to recover
          </div>
        </div>
      </div>

      {/* Weekly Activity & Sales Velocity Row */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: '1fr 1fr',
        gap: '24px',
        marginBottom: '24px'
      }}>
        {/* Weekly Activity Chart */}
        <div style={{
          background: 'white',
          padding: '20px',
          borderRadius: '12px',
          boxShadow: '0 1px 3px rgba(0,0,0,0.1)'
        }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
            <h3 style={{ margin: 0, fontSize: '16px', fontWeight: '600', color: '#1f2937' }}>
              Quote Activity This Week
            </h3>
            {stats?.weeklyActivity?.wonValueCents > 0 && (
              <div style={{
                padding: '6px 12px',
                background: 'linear-gradient(135deg, #22c55e 0%, #16a34a 100%)',
                borderRadius: '20px',
                color: 'white',
                fontSize: '13px',
                fontWeight: '600',
                boxShadow: '0 2px 8px rgba(34, 197, 94, 0.3)'
              }}>
                Won: {formatCurrency(stats.weeklyActivity.wonValueCents)}
              </div>
            )}
          </div>
          <WeeklyActivityChart weeklyActivity={stats?.weeklyActivity} />
          <div style={{ display: 'flex', justifyContent: 'space-around', marginTop: '12px', paddingTop: '12px', borderTop: '1px solid #f3f4f6' }}>
            <div style={{ textAlign: 'center' }}>
              <div style={{ fontSize: '20px', fontWeight: 'bold', color: CHART_COLORS.info }}>{stats?.weeklyActivity?.created || 0}</div>
              <div style={{ fontSize: '11px', color: '#6b7280' }}>Created</div>
            </div>
            <div style={{ textAlign: 'center' }}>
              <div style={{ fontSize: '20px', fontWeight: 'bold', color: CHART_COLORS.purple }}>{stats?.weeklyActivity?.sent || 0}</div>
              <div style={{ fontSize: '11px', color: '#6b7280' }}>Sent</div>
            </div>
            <div style={{ textAlign: 'center' }}>
              <div style={{ fontSize: '20px', fontWeight: 'bold', color: CHART_COLORS.success }}>{stats?.weeklyActivity?.won || 0}</div>
              <div style={{ fontSize: '11px', color: '#6b7280' }}>Won</div>
            </div>
            <div style={{ textAlign: 'center' }}>
              <div style={{ fontSize: '20px', fontWeight: 'bold', color: CHART_COLORS.danger }}>{stats?.weeklyActivity?.lost || 0}</div>
              <div style={{ fontSize: '11px', color: '#6b7280' }}>Lost</div>
            </div>
          </div>
        </div>

        {/* Sales Velocity */}
        <div style={{
          background: 'white',
          padding: '20px',
          borderRadius: '12px',
          boxShadow: '0 1px 3px rgba(0,0,0,0.1)'
        }}>
          <h3 style={{ margin: '0 0 16px', fontSize: '16px', fontWeight: '600', color: '#1f2937' }}>
            Sales Velocity (Last 90 Days)
          </h3>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '16px' }}>
            <div style={{ textAlign: 'center', padding: '16px', background: '#f9fafb', borderRadius: '8px' }}>
              <div style={{ fontSize: '24px', fontWeight: 'bold', color: '#3b82f6' }}>
                {stats?.salesVelocity?.avgQuotesPerWeek || 0}
              </div>
              <div style={{ fontSize: '12px', color: '#6b7280', marginTop: '4px' }}>
                Quotes/Week
              </div>
            </div>
            <div style={{ textAlign: 'center', padding: '16px', background: '#f9fafb', borderRadius: '8px' }}>
              <div style={{ fontSize: '24px', fontWeight: 'bold', color: '#f59e0b' }}>
                {stats?.salesVelocity?.avgDaysToSend || 0}
              </div>
              <div style={{ fontSize: '12px', color: '#6b7280', marginTop: '4px' }}>
                Days to Send
              </div>
            </div>
            <div style={{ textAlign: 'center', padding: '16px', background: '#f9fafb', borderRadius: '8px' }}>
              <div style={{ fontSize: '24px', fontWeight: 'bold', color: '#22c55e' }}>
                {stats?.salesVelocity?.avgDaysSentToClose || 0}
              </div>
              <div style={{ fontSize: '12px', color: '#6b7280', marginTop: '4px' }}>
                Days to Close
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Main Content Grid */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: '1fr 350px',
        gap: '24px'
      }}>
        {/* Left Column */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
          {/* Win Rate by Value Tier */}
          <div style={{
            background: 'white',
            padding: '20px',
            borderRadius: '12px',
            boxShadow: '0 1px 3px rgba(0,0,0,0.1)'
          }}>
            <h3 style={{ margin: '0 0 16px', fontSize: '16px', fontWeight: '600', color: '#1f2937' }}>
              Win Rate by Value Tier
            </h3>
            <WinRateChart data={stats?.winRateByTier || []} />
          </div>

          {/* Cross-Module Activity Timeline */}
          <UnifiedTimeline
            onNavigate={onNavigate}
            limit={15}
          />

          {/* Recent Activity Feed */}
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
              justifyContent: 'space-between',
              alignItems: 'center'
            }}>
              <h3 style={{ margin: 0, fontSize: '16px', fontWeight: '600', color: '#1f2937' }}>
                Recent Activity
              </h3>
              <div style={{ display: 'flex', gap: '8px' }}>
                {['all', 'communication', 'status', 'notes'].map(filter => (
                  <button
                    key={filter}
                    onClick={() => setActivityFilter(filter)}
                    style={{
                      padding: '6px 12px',
                      background: activityFilter === filter ? '#3b82f6' : '#f3f4f6',
                      color: activityFilter === filter ? 'white' : '#6b7280',
                      border: 'none',
                      borderRadius: '6px',
                      fontSize: '12px',
                      fontWeight: '500',
                      cursor: 'pointer',
                      textTransform: 'capitalize'
                    }}
                  >
                    {filter}
                  </button>
                ))}
              </div>
            </div>

            <div style={{ maxHeight: '400px', overflowY: 'auto' }}>
              {filteredActivities.length === 0 ? (
                <div style={{ padding: '40px 20px', textAlign: 'center', color: '#6b7280' }}>
                  <div style={{ fontSize: '36px', marginBottom: '12px' }}>📋</div>
                  <p style={{ margin: 0, fontWeight: '500' }}>No recent activity</p>
                </div>
              ) : (
                <div>
                  {filteredActivities.slice(0, 10).map((activity, index) => {
                    const config = getActivityConfig(activity.event_type);
                    return (
                      <div
                        key={activity.id}
                        onClick={() => activity.quotation_id && onViewQuote?.(activity.quotation_id)}
                        style={{
                          padding: '14px 20px',
                          borderBottom: index < 9 ? '1px solid #f3f4f6' : 'none',
                          display: 'flex',
                          gap: '12px',
                          cursor: activity.quotation_id ? 'pointer' : 'default',
                          transition: 'background 0.15s ease'
                        }}
                        onMouseEnter={(e) => {
                          if (activity.quotation_id) e.currentTarget.style.background = '#f9fafb';
                        }}
                        onMouseLeave={(e) => {
                          e.currentTarget.style.background = 'transparent';
                        }}
                      >
                        <div style={{
                          width: '32px',
                          height: '32px',
                          borderRadius: '50%',
                          background: config.bgColor,
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          fontSize: '14px',
                          flexShrink: 0
                        }}>
                          {config.icon}
                        </div>
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{ display: 'flex', justifyContent: 'space-between', gap: '8px' }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                              {activity.quote_number && (
                                <span style={{ fontWeight: '600', color: '#3b82f6', fontSize: '13px' }}>
                                  {activity.quote_number}
                                </span>
                              )}
                              {activity.customer_name && (
                                <span style={{ color: '#6b7280', fontSize: '12px' }}>
                                  {activity.customer_name}
                                </span>
                              )}
                            </div>
                            <span style={{ fontSize: '11px', color: '#9ca3af', whiteSpace: 'nowrap' }}>
                              {formatRelativeTime(activity.created_at)}
                            </span>
                          </div>
                          <p style={{
                            margin: '2px 0 0',
                            fontSize: '13px',
                            color: '#374151',
                            overflow: 'hidden',
                            textOverflow: 'ellipsis',
                            whiteSpace: 'nowrap'
                          }}>
                            {activity.description}
                          </p>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Right Sidebar */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
          {/* AI Insights Widget */}
          <AIInsightsWidget
            onNavigate={onNavigate}
            onAction={(action, insight, result) => {
              // Handle insight action - can be integrated with analytics tracking
            }}
            limit={5}
          />

          {/* Top Salespeople */}
          {stats?.topSalespeople && stats.topSalespeople.length > 0 && (
            <div style={{
              background: 'white',
              padding: '20px',
              borderRadius: '12px',
              boxShadow: '0 1px 3px rgba(0,0,0,0.1)'
            }}>
              <h3 style={{ margin: '0 0 16px', fontSize: '16px', fontWeight: '600', color: '#1f2937' }}>
                Top Salespeople
              </h3>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                {stats.topSalespeople.map((person, index) => (
                  <div key={person.name} style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '12px',
                    padding: '12px',
                    background: index === 0 ? '#fef3c7' : '#f9fafb',
                    borderRadius: '8px'
                  }}>
                    <div style={{
                      width: '28px',
                      height: '28px',
                      borderRadius: '50%',
                      background: index === 0 ? '#f59e0b' : index === 1 ? '#9ca3af' : index === 2 ? '#cd7f32' : '#e5e7eb',
                      color: 'white',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      fontSize: '12px',
                      fontWeight: 'bold'
                    }}>
                      {index + 1}
                    </div>
                    <div style={{ flex: 1 }}>
                      <div style={{ fontWeight: '600', fontSize: '14px', color: '#1f2937' }}>
                        {person.name}
                      </div>
                      <div style={{ fontSize: '12px', color: '#6b7280' }}>
                        {person.quoteCount} quotes • {person.winRate}% win rate
                      </div>
                    </div>
                    <div style={{ textAlign: 'right' }}>
                      <div style={{ fontWeight: '600', fontSize: '14px', color: '#22c55e' }}>
                        {formatCurrency(person.wonValueCents)}
                      </div>
                      <div style={{ fontSize: '11px', color: '#9ca3af' }}>won</div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Pipeline Breakdown with Pie Chart */}
          <div style={{
            background: 'white',
            padding: '20px',
            borderRadius: '12px',
            boxShadow: '0 1px 3px rgba(0,0,0,0.1)'
          }}>
            <h3 style={{ margin: '0 0 8px', fontSize: '16px', fontWeight: '600', color: '#1f2937' }}>
              Pipeline Distribution
            </h3>
            <PipelinePieChart stats={stats} />
            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', marginTop: '8px', paddingTop: '12px', borderTop: '1px solid #f3f4f6' }}>
              {[
                { label: 'Draft', count: stats?.draft_count, value: stats?.draft_value_cents, color: STATUS_COLORS.draft },
                { label: 'Sent', count: stats?.sent_count, value: stats?.sent_value_cents, color: STATUS_COLORS.sent },
                { label: 'Won', count: stats?.won_count, value: stats?.won_value_cents, color: STATUS_COLORS.won },
                { label: 'Lost', count: stats?.lost_count, value: stats?.lost_value_cents, color: STATUS_COLORS.lost }
              ].map(item => (
                <div key={item.label} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <div style={{ width: '10px', height: '10px', borderRadius: '50%', background: item.color }} />
                    <span style={{ fontSize: '13px', color: '#374151' }}>{item.label}</span>
                  </div>
                  <div style={{ textAlign: 'right' }}>
                    <span style={{ fontWeight: '600', color: '#1f2937', fontSize: '13px' }}>{item.count || 0}</span>
                    {item.value > 0 && (
                      <span style={{ fontSize: '11px', color: '#9ca3af', marginLeft: '6px' }}>
                        {formatCurrency(item.value)}
                      </span>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* At-Risk Customers Widget */}
          <AtRiskCustomers
            limit={5}
            showSummary={false}
            onViewProfile={(customer) => onNavigate?.('customers', { selected: customer.id })}
            onScheduleFollowUp={(customer) => {
              // Navigate to create a follow-up quote for at-risk customer
              onNavigate?.('builder', { customerId: customer.id, followUp: true });
            }}
            onViewAll={() => onNavigate?.('customers', { filter: 'at-risk' })}
          />

          {/* Recent Quotes */}
          <div style={{
            background: 'white',
            padding: '20px',
            borderRadius: '12px',
            boxShadow: '0 1px 3px rgba(0,0,0,0.1)'
          }}>
            <h3 style={{ margin: '0 0 16px', fontSize: '16px', fontWeight: '600', color: '#1f2937' }}>
              Recent Quotes
            </h3>
            {recentQuotes.length === 0 ? (
              <div style={{ textAlign: 'center', padding: '20px', color: '#6b7280' }}>No quotes yet</div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                {recentQuotes.slice(0, 5).map(quote => (
                  <div
                    key={quote.id}
                    onClick={() => onViewQuote?.(quote.id)}
                    style={{
                      padding: '10px 12px',
                      background: '#f9fafb',
                      borderRadius: '8px',
                      cursor: 'pointer',
                      transition: 'all 0.15s ease'
                    }}
                    onMouseEnter={(e) => {
                      e.currentTarget.style.background = '#f3f4f6';
                      e.currentTarget.style.transform = 'translateX(4px)';
                    }}
                    onMouseLeave={(e) => {
                      e.currentTarget.style.background = '#f9fafb';
                      e.currentTarget.style.transform = 'translateX(0)';
                    }}
                  >
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '4px' }}>
                      <span style={{ fontWeight: '600', color: '#1f2937', fontSize: '12px' }}>{quote.quote_number}</span>
                      <StatusBadge status={quote.status} />
                    </div>
                    <div style={{ fontSize: '12px', color: '#6b7280', marginBottom: '2px' }}>
                      {quote.customer_name || 'No customer'}
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <span style={{ fontWeight: '600', color: '#3b82f6', fontSize: '13px' }}>
                        {formatCurrency(quote.total_cents)}
                      </span>
                      <span style={{ fontSize: '10px', color: '#9ca3af' }}>
                        {formatRelativeTime(quote.created_at)}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Quick Actions */}
          <div style={{
            background: 'white',
            padding: '20px',
            borderRadius: '12px',
            boxShadow: '0 1px 3px rgba(0,0,0,0.1)'
          }}>
            <h3 style={{ margin: '0 0 12px', fontSize: '16px', fontWeight: '600', color: '#1f2937' }}>
              Quick Actions
            </h3>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
              <button
                onClick={() => onNavigate?.('builder')}
                style={{
                  padding: '10px 14px',
                  background: '#3b82f6',
                  color: 'white',
                  border: 'none',
                  borderRadius: '8px',
                  fontSize: '13px',
                  fontWeight: '500',
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '8px'
                }}
              >
                <span>+</span> Create New Quote
              </button>
              <button
                onClick={() => onNavigate?.('analytics')}
                style={{
                  padding: '10px 14px',
                  background: '#f3f4f6',
                  color: '#374151',
                  border: 'none',
                  borderRadius: '8px',
                  fontSize: '13px',
                  fontWeight: '500',
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '8px'
                }}
              >
                <span>📊</span> View Analytics
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default Dashboard;
