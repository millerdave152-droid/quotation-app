/**
 * CustomerHealth Component
 * Week 4.3 of 4-week sprint
 *
 * Displays Customer Lifetime Value (CLV) and churn risk metrics
 * in a reusable card format for customer profiles and dashboards.
 */

import React from 'react';

// Segment color configurations
const SEGMENT_COLORS = {
  platinum: {
    background: 'linear-gradient(135deg, #1e293b 0%, #334155 100%)',
    badge: 'linear-gradient(135deg, #a78bfa 0%, #8b5cf6 100%)',
    icon: '\u{1F48E}' // Diamond
  },
  gold: {
    background: 'linear-gradient(135deg, #b45309 0%, #d97706 100%)',
    badge: 'linear-gradient(135deg, #fbbf24 0%, #f59e0b 100%)',
    icon: '\u{1F947}' // Gold medal
  },
  silver: {
    background: 'linear-gradient(135deg, #64748b 0%, #94a3b8 100%)',
    badge: 'linear-gradient(135deg, #e2e8f0 0%, #cbd5e1 100%)',
    badgeTextColor: '#374151',
    icon: '\u{1F948}' // Silver medal
  },
  bronze: {
    background: 'linear-gradient(135deg, #78350f 0%, #a16207 100%)',
    badge: 'linear-gradient(135deg, #fcd34d 0%, #f59e0b 100%)',
    icon: '\u{1F949}' // Bronze medal
  },
  default: {
    background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
    badge: 'linear-gradient(135deg, #a78bfa 0%, #7c3aed 100%)',
    icon: ''
  }
};

// Churn risk color configurations
const CHURN_RISK_COLORS = {
  high: { background: '#ef4444', icon: '\u26A0\uFE0F' }, // Warning
  medium: { background: '#f59e0b', icon: '\u23F3' }, // Hourglass
  low: { background: '#22c55e', icon: '\u2713' }, // Check
  unknown: { background: '#6b7280', icon: '?' }
};

// Trend indicator configurations
const TREND_CONFIG = {
  improving: { icon: '\u2191', color: '#22c55e', label: 'Improving' },
  stable: { icon: '\u2194', color: '#f59e0b', label: 'Stable' },
  declining: { icon: '\u2193', color: '#ef4444', label: 'Declining' }
};

/**
 * Format currency value
 */
const formatCurrency = (value) => {
  if (value === null || value === undefined) return '$0.00';
  return `$${Number(value).toLocaleString('en-US', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  })}`;
};

/**
 * Get explanation text for churn risk
 */
const getChurnExplanation = (clvData) => {
  const explanations = [];

  if (clvData?.engagement?.daysSinceLastActivity > 90) {
    explanations.push(`No activity in ${clvData.engagement.daysSinceLastActivity} days`);
  }

  if (clvData?.engagement?.trend === 'declining') {
    explanations.push('Decreasing purchase frequency');
  }

  if (clvData?.metrics?.conversionRate < 20) {
    explanations.push('Low conversion rate');
  }

  if (clvData?.engagement?.daysSinceLastActivity > 30 && clvData?.engagement?.daysSinceLastActivity <= 90) {
    explanations.push(`${clvData.engagement.daysSinceLastActivity} days since last quote`);
  }

  return explanations.length > 0 ? explanations.join(' + ') : null;
};

/**
 * Segment Badge Component
 */
const SegmentBadge = ({ segment }) => {
  const config = SEGMENT_COLORS[segment] || SEGMENT_COLORS.default;

  return (
    <div style={{
      background: config.badge,
      padding: '8px 16px',
      borderRadius: '20px',
      fontSize: '14px',
      fontWeight: '700',
      textTransform: 'uppercase',
      letterSpacing: '0.5px',
      color: config.badgeTextColor || 'white',
      boxShadow: '0 2px 8px rgba(0,0,0,0.15)',
      display: 'inline-flex',
      alignItems: 'center',
      gap: '4px'
    }}>
      {config.icon && <span>{config.icon}</span>}
      {segment || 'Unknown'}
    </div>
  );
};

/**
 * Churn Risk Badge Component
 */
const ChurnRiskBadge = ({ risk }) => {
  const config = CHURN_RISK_COLORS[risk] || CHURN_RISK_COLORS.unknown;

  return (
    <div style={{
      background: config.background,
      padding: '6px 12px',
      borderRadius: '16px',
      fontSize: '12px',
      fontWeight: '600',
      color: 'white',
      display: 'inline-flex',
      alignItems: 'center',
      gap: '4px'
    }}>
      <span>{config.icon}</span>
      {risk ? risk.charAt(0).toUpperCase() + risk.slice(1) : 'Unknown'} Risk
    </div>
  );
};

/**
 * Trend Indicator Component
 */
const TrendIndicator = ({ trend }) => {
  const config = TREND_CONFIG[trend] || TREND_CONFIG.stable;

  return (
    <div style={{
      display: 'inline-flex',
      alignItems: 'center',
      gap: '4px',
      fontSize: '12px',
      color: config.color,
      fontWeight: '600'
    }}>
      <span style={{ fontSize: '14px' }}>{config.icon}</span>
      {config.label}
    </div>
  );
};

/**
 * Metric Card Component
 */
const MetricCard = ({ value, label, highlight = false }) => (
  <div style={{
    background: highlight ? 'rgba(255,255,255,0.2)' : 'rgba(255,255,255,0.15)',
    borderRadius: '8px',
    padding: '12px',
    textAlign: 'center',
    minWidth: 0
  }}>
    <div style={{
      fontSize: '20px',
      fontWeight: 'bold',
      color: highlight ? '#86efac' : 'inherit'
    }}>
      {value}
    </div>
    <div style={{ fontSize: '11px', opacity: 0.9 }}>{label}</div>
  </div>
);

/**
 * Main CustomerHealth Component
 */
const CustomerHealth = ({
  clvData,
  loading = false,
  compact = false,
  showExplanation = true,
  className = ''
}) => {
  if (loading) {
    return (
      <div
        className={className}
        style={{
          background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
          borderRadius: '12px',
          padding: compact ? '16px' : '24px',
          color: 'white'
        }}
      >
        <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: compact ? '80px' : '120px' }}>
          <div style={{
            width: '24px',
            height: '24px',
            border: '3px solid rgba(255,255,255,0.3)',
            borderTopColor: 'white',
            borderRadius: '50%',
            animation: 'spin 0.8s linear infinite'
          }} />
          <span style={{ marginLeft: '12px', opacity: 0.9 }}>Loading CLV data...</span>
        </div>
      </div>
    );
  }

  if (!clvData) {
    return (
      <div
        className={className}
        style={{
          background: '#f3f4f6',
          borderRadius: '12px',
          padding: compact ? '16px' : '24px',
          textAlign: 'center',
          color: '#6b7280'
        }}
      >
        <div style={{ fontSize: '24px', marginBottom: '8px' }}>-</div>
        <div style={{ fontSize: '14px' }}>No CLV data available</div>
      </div>
    );
  }

  const segment = clvData.segment || clvData.clv_segment;
  const churnRisk = clvData.engagement?.churnRisk || clvData.churn_risk;
  const trend = clvData.engagement?.trend || clvData.clv_trend;
  const lifetimeValue = clvData.metrics?.lifetimeValue || (clvData.clv_score ? clvData.clv_score / 100 : 0);
  const daysSinceActivity = clvData.engagement?.daysSinceLastActivity ?? clvData.days_since_last_activity;
  const segmentConfig = SEGMENT_COLORS[segment] || SEGMENT_COLORS.default;
  const explanation = showExplanation ? getChurnExplanation(clvData) : null;

  // Compact view for dashboard widgets
  if (compact) {
    return (
      <div
        className={className}
        style={{
          background: segmentConfig.background,
          borderRadius: '12px',
          padding: '16px',
          color: 'white'
        }}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
          <div>
            <div style={{ fontSize: '12px', opacity: 0.9 }}>CLV</div>
            <div style={{ fontSize: '24px', fontWeight: 'bold' }}>
              {formatCurrency(lifetimeValue)}
            </div>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', alignItems: 'flex-end' }}>
            <SegmentBadge segment={segment} />
            {churnRisk && churnRisk !== 'unknown' && (
              <ChurnRiskBadge risk={churnRisk} />
            )}
          </div>
        </div>
        {trend && (
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <TrendIndicator trend={trend} />
            {daysSinceActivity !== null && daysSinceActivity !== undefined && (
              <span style={{ fontSize: '11px', opacity: 0.8 }}>
                {daysSinceActivity === 0 ? 'Active today' :
                 daysSinceActivity === 1 ? '1 day ago' :
                 `${daysSinceActivity} days ago`}
              </span>
            )}
          </div>
        )}
      </div>
    );
  }

  // Full view for customer profiles
  return (
    <div
      className={className}
      style={{
        background: segmentConfig.background,
        borderRadius: '12px',
        padding: '24px',
        color: 'white'
      }}
    >
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '20px' }}>
        <div>
          <div style={{ fontSize: '14px', opacity: 0.9, marginBottom: '4px' }}>Customer Lifetime Value</div>
          <div style={{ fontSize: '36px', fontWeight: 'bold' }}>
            {formatCurrency(lifetimeValue)}
          </div>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', alignItems: 'flex-end' }}>
          <SegmentBadge segment={segment} />
          {churnRisk && churnRisk !== 'unknown' && (
            <ChurnRiskBadge risk={churnRisk} />
          )}
          {trend && (
            <div style={{
              background: 'rgba(255,255,255,0.2)',
              padding: '6px 12px',
              borderRadius: '16px'
            }}>
              <TrendIndicator trend={trend} />
            </div>
          )}
        </div>
      </div>

      {/* Metrics Grid */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(100px, 1fr))', gap: '12px', marginBottom: '16px' }}>
        <MetricCard
          value={clvData.quoteStats?.totalQuotes || clvData.total_transactions || 0}
          label="Total Quotes"
        />
        <MetricCard
          value={clvData.quoteStats?.convertedQuotes || 0}
          label="Converted"
          highlight
        />
        <MetricCard
          value={`$${(clvData.metrics?.averageOrderValue || (clvData.avg_order_value_cents ? clvData.avg_order_value_cents / 100 : 0)).toLocaleString('en-US', { maximumFractionDigits: 0 })}`}
          label="Avg Order"
        />
        <MetricCard
          value={`${clvData.metrics?.conversionRate?.toFixed(0) || 0}%`}
          label="Conversion"
        />
      </div>

      {/* Advanced Metrics */}
      {clvData.metrics && (
        <div style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(120px, 1fr))',
          gap: '12px',
          borderTop: '1px solid rgba(255,255,255,0.2)',
          paddingTop: '16px',
          marginBottom: explanation ? '16px' : '0'
        }}>
          <div style={{ textAlign: 'center', minWidth: 0 }}>
            <div style={{ fontSize: '18px', fontWeight: 'bold' }}>
              {formatCurrency(clvData.metrics.predictedAnnualValue || 0)}
            </div>
            <div style={{ fontSize: '11px', opacity: 0.8 }}>Predicted Annual</div>
          </div>
          <div style={{ textAlign: 'center', minWidth: 0 }}>
            <div style={{ fontSize: '18px', fontWeight: 'bold' }}>
              {(clvData.metrics.purchaseFrequency || 0).toFixed(2)}/mo
            </div>
            <div style={{ fontSize: '11px', opacity: 0.8 }}>Purchase Freq</div>
          </div>
          <div style={{ textAlign: 'center', minWidth: 0 }}>
            <div style={{ fontSize: '18px', fontWeight: 'bold' }}>
              {clvData.tenureMonths || 0} mo
            </div>
            <div style={{ fontSize: '11px', opacity: 0.8 }}>Tenure</div>
          </div>
        </div>
      )}

      {/* Last Activity */}
      {daysSinceActivity !== null && daysSinceActivity !== undefined && (
        <div style={{
          padding: '12px',
          background: 'rgba(255,255,255,0.1)',
          borderRadius: '8px',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          marginBottom: explanation ? '12px' : '0'
        }}>
          <span style={{ fontSize: '13px', opacity: 0.9 }}>Last Activity</span>
          <span style={{ fontSize: '13px', fontWeight: '600' }}>
            {daysSinceActivity === 0 ? 'Today' :
             daysSinceActivity === 1 ? 'Yesterday' :
             `${daysSinceActivity} days ago`}
          </span>
        </div>
      )}

      {/* Churn Risk Explanation */}
      {explanation && churnRisk === 'high' && (
        <div style={{
          padding: '12px',
          background: 'rgba(239, 68, 68, 0.3)',
          borderRadius: '8px',
          border: '1px solid rgba(239, 68, 68, 0.5)'
        }}>
          <div style={{ fontSize: '12px', fontWeight: '600', marginBottom: '4px', opacity: 0.9 }}>
            At-Risk Indicators
          </div>
          <div style={{ fontSize: '13px' }}>{explanation}</div>
        </div>
      )}
    </div>
  );
};

// Export sub-components for flexibility
CustomerHealth.SegmentBadge = SegmentBadge;
CustomerHealth.ChurnRiskBadge = ChurnRiskBadge;
CustomerHealth.TrendIndicator = TrendIndicator;

export default CustomerHealth;
