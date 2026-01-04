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
 */

import React, { useState, useEffect, useCallback } from 'react';

const API_URL = process.env.REACT_APP_API_URL || 'http://localhost:3001';

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
 * Mini bar chart component for win rate by tier
 */
const WinRateChart = ({ data }) => {
  if (!data || data.length === 0) {
    return <div style={{ textAlign: 'center', color: '#9ca3af', padding: '20px' }}>No data available</div>;
  }

  const maxWinRate = Math.max(...data.map(d => d.winRate), 100);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
      {data.map((tier, index) => (
        <div key={tier.tier}>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '4px' }}>
            <span style={{ fontSize: '13px', color: '#374151', fontWeight: '500' }}>{tier.tierLabel}</span>
            <span style={{ fontSize: '13px', color: '#6b7280' }}>
              {tier.winRate}% ({tier.wonCount}/{tier.closedCount})
            </span>
          </div>
          <div style={{
            width: '100%',
            height: '8px',
            background: '#e5e7eb',
            borderRadius: '4px',
            overflow: 'hidden'
          }}>
            <div style={{
              width: `${(tier.winRate / maxWinRate) * 100}%`,
              height: '100%',
              background: tier.winRate >= 50 ? '#22c55e' : tier.winRate >= 25 ? '#f59e0b' : '#ef4444',
              borderRadius: '4px',
              transition: 'width 0.5s ease'
            }} />
          </div>
        </div>
      ))}
    </div>
  );
};

/**
 * Metric card component
 */
const MetricCard = ({ title, value, subtitle, icon, color = '#3b82f6', trend, trendValue }) => (
  <div style={{
    background: 'white',
    padding: '20px',
    borderRadius: '12px',
    boxShadow: '0 1px 3px rgba(0,0,0,0.1)',
    borderLeft: `4px solid ${color}`
  }}>
    <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between' }}>
      <div>
        <div style={{ fontSize: '13px', color: '#6b7280', marginBottom: '6px' }}>{title}</div>
        <div style={{ fontSize: '28px', fontWeight: 'bold', color: '#1f2937' }}>{value}</div>
        {subtitle && (
          <div style={{ fontSize: '12px', color: '#9ca3af', marginTop: '4px' }}>{subtitle}</div>
        )}
      </div>
      {icon && (
        <div style={{
          width: '40px',
          height: '40px',
          borderRadius: '10px',
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
    {trend && (
      <div style={{
        marginTop: '8px',
        fontSize: '12px',
        color: trend === 'up' ? '#22c55e' : trend === 'down' ? '#ef4444' : '#6b7280',
        display: 'flex',
        alignItems: 'center',
        gap: '4px'
      }}>
        {trend === 'up' ? '↑' : trend === 'down' ? '↓' : '→'} {trendValue}
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

const Dashboard = ({ onNavigate, onViewQuote, onBack }) => {
  const [stats, setStats] = useState(null);
  const [recentActivities, setRecentActivities] = useState([]);
  const [recentQuotes, setRecentQuotes] = useState([]);
  const [loading, setLoading] = useState(true);
  const [activityFilter, setActivityFilter] = useState('all');
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

      // Handle stats response
      if (statsRes.ok) {
        const statsData = await statsRes.json();
        setStats(statsData);
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

        <div style={{ display: 'flex', gap: '12px' }}>
          <button
            onClick={fetchDashboardData}
            disabled={loading}
            style={{
              padding: '12px 20px',
              background: '#f3f4f6',
              color: '#374151',
              border: 'none',
              borderRadius: '8px',
              fontSize: '14px',
              fontWeight: '600',
              cursor: loading ? 'wait' : 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: '8px'
            }}
          >
            <span style={{ display: loading ? 'inline-block' : 'none', animation: 'spin 1s linear infinite' }}>⟳</span>
            {loading ? 'Refreshing...' : '⟳ Refresh'}
          </button>
          <button
            onClick={onBack}
            style={{
              padding: '12px 24px',
              background: '#6b7280',
              color: 'white',
              border: 'none',
              borderRadius: '8px',
              fontSize: '14px',
              fontWeight: '600',
              cursor: 'pointer'
            }}
          >
            Back to Quotes
          </button>
          <button
            onClick={() => onNavigate?.('builder')}
            style={{
              padding: '12px 24px',
              background: '#3b82f6',
              color: 'white',
              border: 'none',
              borderRadius: '8px',
              fontSize: '14px',
              fontWeight: '600',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: '8px'
            }}
          >
            <span>+</span> New Quote
          </button>
        </div>
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
        {/* Weekly Activity */}
        <div style={{
          background: 'white',
          padding: '20px',
          borderRadius: '12px',
          boxShadow: '0 1px 3px rgba(0,0,0,0.1)'
        }}>
          <h3 style={{ margin: '0 0 16px', fontSize: '16px', fontWeight: '600', color: '#1f2937' }}>
            Quote Activity This Week
          </h3>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '12px' }}>
            <ActivityBadge
              label="Created"
              count={stats?.weeklyActivity?.created || 0}
              color="#3b82f6"
              icon="✨"
            />
            <ActivityBadge
              label="Sent"
              count={stats?.weeklyActivity?.sent || 0}
              color="#8b5cf6"
              icon="📤"
            />
            <ActivityBadge
              label="Won"
              count={stats?.weeklyActivity?.won || 0}
              color="#22c55e"
              icon="🏆"
            />
            <ActivityBadge
              label="Lost"
              count={stats?.weeklyActivity?.lost || 0}
              color="#ef4444"
              icon="❌"
            />
          </div>
          {stats?.weeklyActivity?.wonValueCents > 0 && (
            <div style={{
              marginTop: '16px',
              padding: '12px',
              background: '#dcfce7',
              borderRadius: '8px',
              textAlign: 'center'
            }}>
              <span style={{ fontSize: '14px', color: '#166534' }}>
                Won this week: <strong>{formatCurrency(stats.weeklyActivity.wonValueCents)}</strong>
              </span>
            </div>
          )}
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

          {/* Pipeline Breakdown */}
          <div style={{
            background: 'white',
            padding: '20px',
            borderRadius: '12px',
            boxShadow: '0 1px 3px rgba(0,0,0,0.1)'
          }}>
            <h3 style={{ margin: '0 0 16px', fontSize: '16px', fontWeight: '600', color: '#1f2937' }}>
              Pipeline Breakdown
            </h3>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
              {[
                { label: 'Draft', count: stats?.draft_count, value: stats?.draft_value_cents, color: '#9ca3af' },
                { label: 'Sent', count: stats?.sent_count, value: stats?.sent_value_cents, color: '#3b82f6' },
                { label: 'Pending', count: stats?.pending_approval_count, value: 0, color: '#f59e0b' },
                { label: 'Won', count: stats?.won_count, value: stats?.won_value_cents, color: '#22c55e' },
                { label: 'Lost', count: stats?.lost_count, value: stats?.lost_value_cents, color: '#ef4444' }
              ].map(item => (
                <div key={item.label} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <div style={{ width: '10px', height: '10px', borderRadius: '2px', background: item.color }} />
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
