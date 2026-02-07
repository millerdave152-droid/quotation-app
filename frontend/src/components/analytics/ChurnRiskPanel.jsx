import { authFetch } from '../../services/authFetch';
/**
 * Churn Risk Panel
 *
 * Displays churn risk analysis with:
 * - Risk summary cards (high/medium/low counts)
 * - At-risk customer list with action buttons
 * - Retention ROI calculator
 * - Segment recommendations
 */

import React, { useState, useEffect, useCallback } from 'react';
import {
  AlertTriangle, AlertCircle, CheckCircle, Users, DollarSign,
  TrendingDown, ArrowRight, RefreshCw, Phone, Mail, FileText
} from 'lucide-react';

const API_BASE = `${process.env.REACT_APP_API_URL || 'http://localhost:3001'}/api`;

// Risk level configuration
const RISK_CONFIG = {
  high: { color: '#ef4444', bgColor: '#fee2e2', icon: AlertTriangle, label: 'High Risk' },
  medium: { color: '#f59e0b', bgColor: '#fef3c7', icon: AlertCircle, label: 'Medium Risk' },
  low: { color: '#22c55e', bgColor: '#dcfce7', icon: CheckCircle, label: 'Low Risk' },
  unknown: { color: '#6b7280', bgColor: '#f3f4f6', icon: Users, label: 'Unknown' }
};

const ChurnRiskPanel = ({ onNavigate, onContact }) => {
  const [churnData, setChurnData] = useState(null);
  const [roiData, setRoiData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [activeTab, setActiveTab] = useState('overview');

  // Fetch churn analysis data
  const fetchChurnData = useCallback(async () => {
    setLoading(true);
    setError(null);

    try {
      const token = localStorage.getItem('auth_token');
      const headers = {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json'
      };

      // Fetch churn analysis and ROI data in parallel
      const [churnRes, roiRes] = await Promise.all([
        authFetch(`${API_BASE}/customers/predictive-clv/churn-analysis?limit=50&minRevenue=500`, { headers }),
        authFetch(`${API_BASE}/customers/predictive-clv/retention-roi`, { headers })
      ]);

      if (!churnRes.ok) throw new Error('Failed to fetch churn analysis');
      if (!roiRes.ok) throw new Error('Failed to fetch retention ROI');

      const churnResult = await churnRes.json();
      const roiResult = await roiRes.json();

      setChurnData(churnResult.data);
      setRoiData(roiResult.data);
    } catch (err) {
      console.error('Churn analysis fetch error:', err);
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchChurnData();
  }, [fetchChurnData]);

  const formatCurrency = (value) => {
    if (!value || isNaN(value)) return '$0';
    return `$${parseFloat(value).toLocaleString('en-CA', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`;
  };

  const formatDays = (days) => {
    if (!days || isNaN(days)) return 'N/A';
    if (days < 1) return 'Today';
    if (days === 1) return '1 day';
    if (days < 30) return `${Math.round(days)} days`;
    if (days < 60) return `${Math.round(days / 30)} month`;
    return `${Math.round(days / 30)} months`;
  };

  if (loading) {
    return (
      <div style={{
        background: 'white',
        borderRadius: '12px',
        padding: '30px',
        boxShadow: '0 1px 3px rgba(0,0,0,0.1)'
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '20px' }}>
          <AlertTriangle size={24} color="#ef4444" />
          <h2 style={{ margin: 0, fontSize: '20px', fontWeight: 'bold', color: '#111827' }}>
            Churn Risk Analysis
          </h2>
        </div>
        <div style={{ textAlign: 'center', padding: '40px' }}>
          <div style={{
            width: '48px',
            height: '48px',
            border: '4px solid #e5e7eb',
            borderTopColor: '#ef4444',
            borderRadius: '50%',
            margin: '0 auto 16px',
            animation: 'spin 1s linear infinite'
          }} />
          <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
          <div style={{ color: '#6b7280' }}>Analyzing churn risk...</div>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div style={{
        background: 'white',
        borderRadius: '12px',
        padding: '30px',
        boxShadow: '0 1px 3px rgba(0,0,0,0.1)'
      }}>
        <div style={{ textAlign: 'center', padding: '20px' }}>
          <AlertTriangle size={48} color="#ef4444" style={{ marginBottom: '12px' }} />
          <div style={{ color: '#ef4444', marginBottom: '16px' }}>{error}</div>
          <button
            onClick={fetchChurnData}
            style={{
              padding: '10px 20px',
              background: '#3b82f6',
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

  const summary = churnData?.summary || {};
  const customers = churnData?.customers || [];
  const riskCounts = summary.riskCounts || {};
  const atRiskRevenue = summary.atRiskRevenue || {};

  // Filter customers by risk level
  const highRiskCustomers = customers.filter(c => c.churnRisk === 'high');
  const mediumRiskCustomers = customers.filter(c => c.churnRisk === 'medium');

  return (
    <div style={{
      background: 'white',
      borderRadius: '12px',
      padding: '30px',
      boxShadow: '0 1px 3px rgba(0,0,0,0.1)'
    }}>
      {/* Header */}
      <div style={{
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginBottom: '24px'
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          <AlertTriangle size={24} color="#ef4444" />
          <h2 style={{ margin: 0, fontSize: '20px', fontWeight: 'bold', color: '#111827' }}>
            Churn Risk Analysis
          </h2>
        </div>
        <button
          onClick={fetchChurnData}
          style={{
            padding: '8px 16px',
            background: '#f3f4f6',
            border: 'none',
            borderRadius: '8px',
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            gap: '6px',
            color: '#6b7280',
            fontWeight: '500',
            fontSize: '13px'
          }}
        >
          <RefreshCw size={14} />
          Refresh
        </button>
      </div>

      {/* Tab Navigation */}
      <div style={{
        display: 'flex',
        gap: '4px',
        background: '#f3f4f6',
        borderRadius: '8px',
        padding: '4px',
        marginBottom: '24px'
      }}>
        {['overview', 'at-risk', 'roi'].map(tab => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab)}
            style={{
              flex: 1,
              padding: '10px 16px',
              background: activeTab === tab ? 'white' : 'transparent',
              border: 'none',
              borderRadius: '6px',
              cursor: 'pointer',
              fontWeight: '600',
              fontSize: '13px',
              color: activeTab === tab ? '#111827' : '#6b7280',
              boxShadow: activeTab === tab ? '0 1px 3px rgba(0,0,0,0.1)' : 'none',
              textTransform: 'capitalize'
            }}
          >
            {tab === 'at-risk' ? 'At-Risk Customers' : tab === 'roi' ? 'Retention ROI' : 'Overview'}
          </button>
        ))}
      </div>

      {/* Overview Tab */}
      {activeTab === 'overview' && (
        <>
          {/* Risk Summary Cards */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '16px', marginBottom: '24px' }}>
            {Object.entries(RISK_CONFIG).filter(([key]) => key !== 'unknown').map(([level, config]) => {
              const count = riskCounts[level] || 0;
              const IconComponent = config.icon;
              return (
                <div
                  key={level}
                  style={{
                    background: config.bgColor,
                    padding: '20px',
                    borderRadius: '12px',
                    border: `2px solid ${config.color}30`,
                    cursor: level !== 'low' ? 'pointer' : 'default'
                  }}
                  onClick={() => level !== 'low' && setActiveTab('at-risk')}
                >
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                    <span style={{ fontSize: '13px', fontWeight: '600', color: config.color }}>{config.label}</span>
                    <IconComponent size={20} color={config.color} />
                  </div>
                  <div style={{ fontSize: '32px', fontWeight: 'bold', color: config.color }}>{count}</div>
                  <div style={{ fontSize: '12px', color: '#6b7280', marginTop: '4px' }}>
                    customers
                  </div>
                </div>
              );
            })}

            {/* Revenue at Risk */}
            <div style={{
              background: '#fef2f2',
              padding: '20px',
              borderRadius: '12px',
              border: '2px solid #fecaca'
            }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                <span style={{ fontSize: '13px', fontWeight: '600', color: '#991b1b' }}>Revenue at Risk</span>
                <DollarSign size={20} color="#991b1b" />
              </div>
              <div style={{ fontSize: '28px', fontWeight: 'bold', color: '#991b1b' }}>
                {formatCurrency(atRiskRevenue.total)}
              </div>
              <div style={{ fontSize: '12px', color: '#b91c1c', marginTop: '4px' }}>
                {formatCurrency(atRiskRevenue.high)} high + {formatCurrency(atRiskRevenue.medium)} medium
              </div>
            </div>
          </div>

          {/* Quick Insights */}
          <div style={{
            background: '#f8fafc',
            borderRadius: '12px',
            padding: '20px',
            marginBottom: '24px'
          }}>
            <h3 style={{ margin: '0 0 16px', fontSize: '16px', fontWeight: '600', color: '#374151' }}>
              Key Insights
            </h3>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
              {riskCounts.high > 0 && (
                <div style={{ display: 'flex', alignItems: 'center', gap: '12px', padding: '12px', background: '#fee2e2', borderRadius: '8px' }}>
                  <AlertTriangle size={18} color="#dc2626" />
                  <span style={{ fontSize: '14px', color: '#991b1b' }}>
                    <strong>{riskCounts.high} high-risk</strong> customers need immediate attention - {formatCurrency(atRiskRevenue.high)} at stake
                  </span>
                </div>
              )}
              {riskCounts.medium > 0 && (
                <div style={{ display: 'flex', alignItems: 'center', gap: '12px', padding: '12px', background: '#fef3c7', borderRadius: '8px' }}>
                  <AlertCircle size={18} color="#d97706" />
                  <span style={{ fontSize: '14px', color: '#92400e' }}>
                    <strong>{riskCounts.medium} medium-risk</strong> customers should be contacted within 2 weeks
                  </span>
                </div>
              )}
              {roiData && roiData.comparison?.roiPercentage > 50 && (
                <div style={{ display: 'flex', alignItems: 'center', gap: '12px', padding: '12px', background: '#dcfce7', borderRadius: '8px' }}>
                  <TrendingDown size={18} color="#16a34a" />
                  <span style={{ fontSize: '14px', color: '#166534' }}>
                    Retention program would yield <strong>{roiData.comparison.roiPercentage}% ROI</strong> - {roiData.recommendation}
                  </span>
                </div>
              )}
            </div>
          </div>
        </>
      )}

      {/* At-Risk Customers Tab */}
      {activeTab === 'at-risk' && (
        <div>
          {highRiskCustomers.length === 0 && mediumRiskCustomers.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '40px', color: '#6b7280' }}>
              <CheckCircle size={48} color="#22c55e" style={{ marginBottom: '12px' }} />
              <div style={{ fontSize: '16px', fontWeight: '500' }}>No at-risk customers!</div>
              <div style={{ fontSize: '14px', marginTop: '4px' }}>All customers are engaging regularly.</div>
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
              {/* High Risk */}
              {highRiskCustomers.length > 0 && (
                <>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '8px' }}>
                    <AlertTriangle size={16} color="#ef4444" />
                    <span style={{ fontSize: '14px', fontWeight: '600', color: '#991b1b' }}>High Risk ({highRiskCustomers.length})</span>
                  </div>
                  {highRiskCustomers.slice(0, 5).map(customer => (
                    <CustomerRiskCard
                      key={customer.customerId}
                      customer={customer}
                      riskConfig={RISK_CONFIG.high}
                      formatCurrency={formatCurrency}
                      formatDays={formatDays}
                      onNavigate={onNavigate}
                      onContact={onContact}
                    />
                  ))}
                </>
              )}

              {/* Medium Risk */}
              {mediumRiskCustomers.length > 0 && (
                <>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginTop: '16px', marginBottom: '8px' }}>
                    <AlertCircle size={16} color="#f59e0b" />
                    <span style={{ fontSize: '14px', fontWeight: '600', color: '#92400e' }}>Medium Risk ({mediumRiskCustomers.length})</span>
                  </div>
                  {mediumRiskCustomers.slice(0, 5).map(customer => (
                    <CustomerRiskCard
                      key={customer.customerId}
                      customer={customer}
                      riskConfig={RISK_CONFIG.medium}
                      formatCurrency={formatCurrency}
                      formatDays={formatDays}
                      onNavigate={onNavigate}
                      onContact={onContact}
                    />
                  ))}
                </>
              )}
            </div>
          )}
        </div>
      )}

      {/* Retention ROI Tab */}
      {activeTab === 'roi' && roiData && (
        <div>
          {/* ROI Summary */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '16px', marginBottom: '24px' }}>
            <div style={{ background: '#f3f4f6', padding: '20px', borderRadius: '12px' }}>
              <div style={{ fontSize: '13px', color: '#6b7280', marginBottom: '8px' }}>Customers to Target</div>
              <div style={{ fontSize: '28px', fontWeight: 'bold', color: '#374151' }}>{roiData.retention?.customersToTarget || 0}</div>
            </div>
            <div style={{ background: '#fef3c7', padding: '20px', borderRadius: '12px' }}>
              <div style={{ fontSize: '13px', color: '#92400e', marginBottom: '8px' }}>Retention Investment</div>
              <div style={{ fontSize: '28px', fontWeight: 'bold', color: '#b45309' }}>{formatCurrency(roiData.retention?.retentionCostTotal)}</div>
            </div>
            <div style={{ background: '#dcfce7', padding: '20px', borderRadius: '12px' }}>
              <div style={{ fontSize: '13px', color: '#166534', marginBottom: '8px' }}>Expected Revenue Saved</div>
              <div style={{ fontSize: '28px', fontWeight: 'bold', color: '#22c55e' }}>{formatCurrency(roiData.retention?.expectedSavedRevenue)}</div>
            </div>
            <div style={{ background: roiData.comparison?.roiPercentage > 50 ? '#dcfce7' : '#fef3c7', padding: '20px', borderRadius: '12px' }}>
              <div style={{ fontSize: '13px', color: roiData.comparison?.roiPercentage > 50 ? '#166534' : '#92400e', marginBottom: '8px' }}>ROI</div>
              <div style={{ fontSize: '28px', fontWeight: 'bold', color: roiData.comparison?.roiPercentage > 50 ? '#22c55e' : '#b45309' }}>
                {roiData.comparison?.roiPercentage || 0}%
              </div>
            </div>
          </div>

          {/* Recommendation */}
          <div style={{
            background: roiData.comparison?.roiPercentage > 100 ? '#dcfce7' : roiData.comparison?.roiPercentage > 50 ? '#fef3c7' : '#fee2e2',
            borderRadius: '12px',
            padding: '20px'
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
              {roiData.comparison?.roiPercentage > 100 ? (
                <CheckCircle size={24} color="#22c55e" />
              ) : roiData.comparison?.roiPercentage > 50 ? (
                <AlertCircle size={24} color="#f59e0b" />
              ) : (
                <AlertTriangle size={24} color="#ef4444" />
              )}
              <div>
                <div style={{
                  fontWeight: '600',
                  color: roiData.comparison?.roiPercentage > 100 ? '#166534' : roiData.comparison?.roiPercentage > 50 ? '#92400e' : '#991b1b',
                  fontSize: '15px'
                }}>
                  {roiData.recommendation}
                </div>
                <div style={{ fontSize: '13px', color: '#6b7280', marginTop: '4px' }}>
                  Retention cost vs acquisition: Save {formatCurrency(roiData.comparison?.savingsVsAcquisition)} compared to acquiring new customers
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

// Customer Risk Card Component
const CustomerRiskCard = ({ customer, riskConfig, formatCurrency, formatDays, onNavigate, onContact }) => (
  <div style={{
    display: 'flex',
    alignItems: 'center',
    gap: '16px',
    padding: '16px',
    background: riskConfig.bgColor,
    borderRadius: '10px',
    border: `1px solid ${riskConfig.color}30`
  }}>
    {/* Risk indicator */}
    <div style={{
      width: '8px',
      height: '60px',
      borderRadius: '4px',
      background: riskConfig.color
    }} />

    {/* Customer info */}
    <div style={{ flex: 1, minWidth: 0 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
        <span style={{ fontWeight: '600', color: '#111827', fontSize: '15px' }}>
          {customer.customerName}
        </span>
        <span style={{
          padding: '2px 8px',
          background: 'white',
          borderRadius: '12px',
          fontSize: '11px',
          fontWeight: '600',
          color: '#6b7280',
          textTransform: 'uppercase'
        }}>
          {customer.segment}
        </span>
      </div>
      <div style={{ fontSize: '13px', color: '#6b7280', marginTop: '4px' }}>
        {customer.company || customer.email || 'No contact info'}
      </div>
      <div style={{ display: 'flex', gap: '16px', marginTop: '8px', fontSize: '12px' }}>
        <span style={{ color: '#374151' }}>
          <strong>CLV:</strong> {formatCurrency(customer.lifetimeValue)}
        </span>
        <span style={{ color: riskConfig.color }}>
          <strong>Inactive:</strong> {formatDays(customer.daysSinceActivity)}
        </span>
        <span style={{ color: '#6b7280' }}>
          <strong>Orders:</strong> {customer.orderCount}
        </span>
      </div>
    </div>

    {/* Actions */}
    <div style={{ display: 'flex', gap: '8px' }}>
      {customer.email && (
        <button
          onClick={() => onContact?.('email', customer)}
          style={{
            padding: '8px',
            background: 'white',
            border: '1px solid #e5e7eb',
            borderRadius: '8px',
            cursor: 'pointer'
          }}
          title="Send Email"
        >
          <Mail size={16} color="#6b7280" />
        </button>
      )}
      <button
        onClick={() => onNavigate?.('customers', { selected: customer.customerId })}
        style={{
          padding: '8px 12px',
          background: riskConfig.color,
          color: 'white',
          border: 'none',
          borderRadius: '8px',
          cursor: 'pointer',
          display: 'flex',
          alignItems: 'center',
          gap: '4px',
          fontSize: '12px',
          fontWeight: '600'
        }}
      >
        View <ArrowRight size={14} />
      </button>
    </div>
  </div>
);

export default ChurnRiskPanel;
