/**
 * Customer 360 View
 *
 * Unified single-page customer profile showing:
 * - Profile header with CLV tier and health score
 * - Engagement timeline
 * - Purchase history (orders, quotes, invoices)
 * - Product affinity
 * - Predictive insights (churn risk, next purchase probability)
 * - Recommended actions
 */

import React, { useState, useEffect, useCallback } from 'react';
import {
  User, Crown, Award, Medal, Star, Phone, Mail, Building, MapPin,
  Calendar, TrendingUp, TrendingDown, AlertTriangle, ShoppingCart,
  FileText, Receipt, ArrowRight, RefreshCw, ChevronDown, ChevronUp,
  Clock, DollarSign, Package, AlertCircle, CheckCircle, X, MessageCircle
} from 'lucide-react';
import CustomerActivityTimeline from './CustomerActivityTimeline';

const API_URL = process.env.REACT_APP_API_URL || 'http://localhost:3001';

// Segment configuration
const SEGMENT_CONFIG = {
  platinum: { color: '#1e293b', bgColor: '#f1f5f9', icon: Crown, label: 'Platinum', threshold: '$50,000+' },
  gold: { color: '#b45309', bgColor: '#fef3c7', icon: Award, label: 'Gold', threshold: '$20K-$50K' },
  silver: { color: '#64748b', bgColor: '#f1f5f9', icon: Medal, label: 'Silver', threshold: '$5K-$20K' },
  bronze: { color: '#78716c', bgColor: '#fef3c7', icon: Star, label: 'Bronze', threshold: '<$5K' }
};

// Churn risk colors
const CHURN_COLORS = {
  low: { color: '#22c55e', bgColor: '#dcfce7', label: 'Low Risk' },
  medium: { color: '#f59e0b', bgColor: '#fef3c7', label: 'Medium Risk' },
  high: { color: '#ef4444', bgColor: '#fee2e2', label: 'High Risk' },
  unknown: { color: '#6b7280', bgColor: '#f3f4f6', label: 'Unknown' }
};

const Customer360View = ({ customerId, onClose, onNavigate }) => {
  const [customer, setCustomer] = useState(null);
  const [clvData, setClvData] = useState(null);
  const [predictiveData, setPredictiveData] = useState(null);
  const [quotes, setQuotes] = useState([]);
  const [orders, setOrders] = useState([]);
  const [invoices, setInvoices] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [expandedSections, setExpandedSections] = useState({
    activities: true,
    quotes: true,
    orders: true,
    invoices: false,
    insights: true
  });

  // Fetch all customer data
  const fetchCustomerData = useCallback(async () => {
    if (!customerId) return;

    setLoading(true);
    setError(null);

    try {
      const token = localStorage.getItem('token');
      const headers = {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json'
      };

      // Fetch all data in parallel
      const [customerRes, clvRes, predictiveRes, quotesRes, ordersRes, invoicesRes] = await Promise.all([
        fetch(`${API_URL}/api/customers/${customerId}`, { headers }),
        fetch(`${API_URL}/api/customers/${customerId}/lifetime-value`, { headers }),
        fetch(`${API_URL}/api/customers/${customerId}/predictive-clv`, { headers }).catch(() => null),
        fetch(`${API_URL}/api/quotations?customerId=${customerId}&limit=20`, { headers }),
        fetch(`${API_URL}/api/orders?customerId=${customerId}&limit=20`, { headers }).catch(() => null),
        fetch(`${API_URL}/api/invoices?customerId=${customerId}&limit=20`, { headers }).catch(() => null)
      ]);

      if (!customerRes.ok) throw new Error('Failed to fetch customer');

      const customerData = await customerRes.json();
      setCustomer(customerData.data || customerData);

      if (clvRes.ok) {
        const clv = await clvRes.json();
        setClvData(clv.data || clv);
      }

      if (predictiveRes?.ok) {
        const predictive = await predictiveRes.json();
        setPredictiveData(predictive.data);
      }

      if (quotesRes.ok) {
        const quotesData = await quotesRes.json();
        setQuotes(quotesData.quotations || quotesData.data?.quotations || []);
      }

      if (ordersRes?.ok) {
        const ordersData = await ordersRes.json();
        setOrders(ordersData.orders || ordersData.data?.orders || []);
      }

      if (invoicesRes?.ok) {
        const invoicesData = await invoicesRes.json();
        setInvoices(invoicesData.invoices || invoicesData.data?.invoices || []);
      }
    } catch (err) {
      console.error('Customer 360 fetch error:', err);
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [customerId]);

  useEffect(() => {
    fetchCustomerData();
  }, [fetchCustomerData]);

  const formatCurrency = (value) => {
    if (!value || isNaN(value)) return '$0';
    const num = typeof value === 'number' ? value : parseFloat(value);
    // Handle cents vs dollars
    const amount = num > 10000000 ? num / 100 : num;
    return `$${amount.toLocaleString('en-CA', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`;
  };

  const formatDate = (date) => {
    if (!date) return 'N/A';
    return new Date(date).toLocaleDateString('en-CA', {
      year: 'numeric',
      month: 'short',
      day: 'numeric'
    });
  };

  const toggleSection = (section) => {
    setExpandedSections(prev => ({
      ...prev,
      [section]: !prev[section]
    }));
  };

  if (loading) {
    return (
      <div style={{
        position: 'fixed',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        background: 'rgba(0,0,0,0.5)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 1000
      }}>
        <div style={{
          background: 'white',
          borderRadius: '16px',
          padding: '40px',
          textAlign: 'center'
        }}>
          <div style={{
            width: '48px',
            height: '48px',
            border: '4px solid #e5e7eb',
            borderTopColor: '#3b82f6',
            borderRadius: '50%',
            margin: '0 auto 16px',
            animation: 'spin 1s linear infinite'
          }} />
          <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
          <div style={{ color: '#6b7280' }}>Loading customer profile...</div>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div style={{
        position: 'fixed',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        background: 'rgba(0,0,0,0.5)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 1000
      }}>
        <div style={{
          background: 'white',
          borderRadius: '16px',
          padding: '40px',
          textAlign: 'center',
          maxWidth: '400px'
        }}>
          <AlertTriangle size={48} color="#ef4444" style={{ marginBottom: '16px' }} />
          <div style={{ color: '#ef4444', marginBottom: '16px' }}>{error}</div>
          <div style={{ display: 'flex', gap: '12px', justifyContent: 'center' }}>
            <button
              onClick={fetchCustomerData}
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
            <button
              onClick={onClose}
              style={{
                padding: '10px 20px',
                background: '#f3f4f6',
                color: '#374151',
                border: 'none',
                borderRadius: '8px',
                cursor: 'pointer',
                fontWeight: '600'
              }}
            >
              Close
            </button>
          </div>
        </div>
      </div>
    );
  }

  const segment = clvData?.segment || 'bronze';
  const segmentConfig = SEGMENT_CONFIG[segment];
  const SegmentIcon = segmentConfig?.icon || Star;
  const churnRisk = predictiveData?.churn?.risk || clvData?.churnRisk || 'unknown';
  const churnConfig = CHURN_COLORS[churnRisk];

  // Calculate health score (0-100)
  const healthScore = predictiveData
    ? Math.round(100 - (predictiveData.churn?.probability || 0))
    : clvData?.churnRisk === 'low' ? 85 : clvData?.churnRisk === 'medium' ? 50 : 25;

  return (
    <div style={{
      position: 'fixed',
      top: 0,
      left: 0,
      right: 0,
      bottom: 0,
      background: 'rgba(0,0,0,0.5)',
      display: 'flex',
      justifyContent: 'flex-end',
      zIndex: 1000
    }}>
      {/* Backdrop click to close */}
      <div
        style={{ flex: 1 }}
        onClick={onClose}
      />

      {/* Panel */}
      <div style={{
        width: '700px',
        maxWidth: '90vw',
        height: '100%',
        background: '#f9fafb',
        boxShadow: '-4px 0 20px rgba(0,0,0,0.15)',
        display: 'flex',
        flexDirection: 'column',
        animation: 'slideIn 0.3s ease-out'
      }}>
        <style>{`
          @keyframes slideIn {
            from { transform: translateX(100%); }
            to { transform: translateX(0); }
          }
        `}</style>

        {/* Header */}
        <div style={{
          background: 'linear-gradient(135deg, #1e293b 0%, #334155 100%)',
          color: 'white',
          padding: '24px'
        }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'start', marginBottom: '16px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
              <div style={{
                width: '64px',
                height: '64px',
                borderRadius: '50%',
                background: 'rgba(255,255,255,0.2)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center'
              }}>
                <User size={32} color="white" />
              </div>
              <div>
                <h2 style={{ margin: '0 0 4px', fontSize: '24px', fontWeight: 'bold' }}>
                  {customer?.name || 'Unknown Customer'}
                </h2>
                <p style={{ margin: 0, fontSize: '14px', opacity: 0.9 }}>
                  {customer?.company || customer?.email || 'No contact info'}
                </p>
              </div>
            </div>
            <button
              onClick={onClose}
              style={{
                padding: '8px',
                background: 'rgba(255,255,255,0.2)',
                border: 'none',
                borderRadius: '8px',
                cursor: 'pointer',
                color: 'white'
              }}
            >
              <X size={20} />
            </button>
          </div>

          {/* Quick Stats */}
          <div style={{ display: 'flex', gap: '16px', flexWrap: 'wrap' }}>
            {/* Segment Badge */}
            <div style={{
              display: 'flex',
              alignItems: 'center',
              gap: '8px',
              padding: '8px 16px',
              background: segmentConfig?.bgColor || '#f3f4f6',
              borderRadius: '20px'
            }}>
              <SegmentIcon size={18} color={segmentConfig?.color} />
              <span style={{ fontWeight: '600', color: segmentConfig?.color }}>
                {segmentConfig?.label || 'Bronze'}
              </span>
            </div>

            {/* CLV */}
            <div style={{
              display: 'flex',
              alignItems: 'center',
              gap: '8px',
              padding: '8px 16px',
              background: 'rgba(255,255,255,0.15)',
              borderRadius: '20px'
            }}>
              <DollarSign size={18} />
              <span style={{ fontWeight: '600' }}>
                CLV: {formatCurrency(clvData?.lifetimeValue || 0)}
              </span>
            </div>

            {/* Health Score */}
            <div style={{
              display: 'flex',
              alignItems: 'center',
              gap: '8px',
              padding: '8px 16px',
              background: churnConfig?.bgColor || '#f3f4f6',
              borderRadius: '20px'
            }}>
              {healthScore >= 70 ? (
                <CheckCircle size={18} color={churnConfig?.color} />
              ) : healthScore >= 40 ? (
                <AlertCircle size={18} color={churnConfig?.color} />
              ) : (
                <AlertTriangle size={18} color={churnConfig?.color} />
              )}
              <span style={{ fontWeight: '600', color: churnConfig?.color }}>
                Health: {healthScore}%
              </span>
            </div>
          </div>
        </div>

        {/* Content */}
        <div style={{ flex: 1, overflowY: 'auto', padding: '24px' }}>
          {/* Contact Info */}
          <div style={{
            background: 'white',
            borderRadius: '12px',
            padding: '20px',
            marginBottom: '16px',
            boxShadow: '0 1px 3px rgba(0,0,0,0.1)'
          }}>
            <h3 style={{ margin: '0 0 16px', fontSize: '16px', fontWeight: '600', color: '#374151' }}>
              Contact Information
            </h3>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '16px' }}>
              {customer?.email && (
                <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                  <Mail size={18} color="#6b7280" />
                  <a href={`mailto:${customer.email}`} style={{ color: '#3b82f6', textDecoration: 'none' }}>
                    {customer.email}
                  </a>
                </div>
              )}
              {customer?.phone && (
                <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                  <Phone size={18} color="#6b7280" />
                  <a href={`tel:${customer.phone}`} style={{ color: '#3b82f6', textDecoration: 'none' }}>
                    {customer.phone}
                  </a>
                </div>
              )}
              {customer?.company && (
                <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                  <Building size={18} color="#6b7280" />
                  <span style={{ color: '#374151' }}>{customer.company}</span>
                </div>
              )}
              {(customer?.city || customer?.province) && (
                <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                  <MapPin size={18} color="#6b7280" />
                  <span style={{ color: '#374151' }}>
                    {[customer.city, customer.province].filter(Boolean).join(', ')}
                  </span>
                </div>
              )}
              {customer?.created_at && (
                <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                  <Calendar size={18} color="#6b7280" />
                  <span style={{ color: '#374151' }}>Customer since {formatDate(customer.created_at)}</span>
                </div>
              )}
            </div>
          </div>

          {/* Activity Timeline */}
          <CollapsibleSection
            title="Activity Timeline"
            icon={<MessageCircle size={18} color="#3b82f6" />}
            expanded={expandedSections.activities}
            onToggle={() => toggleSection('activities')}
          >
            <CustomerActivityTimeline customerId={customerId} limit={15} />
          </CollapsibleSection>

          {/* Predictive Insights */}
          {(predictiveData || clvData) && (
            <CollapsibleSection
              title="Predictive Insights"
              icon={<TrendingUp size={18} color="#6366f1" />}
              expanded={expandedSections.insights}
              onToggle={() => toggleSection('insights')}
            >
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '12px' }}>
                {/* Churn Risk */}
                <div style={{
                  padding: '16px',
                  background: churnConfig?.bgColor || '#f3f4f6',
                  borderRadius: '10px'
                }}>
                  <div style={{ fontSize: '13px', color: '#6b7280', marginBottom: '6px' }}>Churn Risk</div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <span style={{ fontSize: '24px', fontWeight: 'bold', color: churnConfig?.color }}>
                      {predictiveData?.churn?.probability || (churnRisk === 'high' ? 75 : churnRisk === 'medium' ? 40 : 15)}%
                    </span>
                    <span style={{ fontSize: '13px', color: churnConfig?.color, fontWeight: '600' }}>
                      {churnConfig?.label}
                    </span>
                  </div>
                </div>

                {/* Next Purchase */}
                {predictiveData?.nextPurchase && (
                  <div style={{
                    padding: '16px',
                    background: '#dbeafe',
                    borderRadius: '10px'
                  }}>
                    <div style={{ fontSize: '13px', color: '#6b7280', marginBottom: '6px' }}>Next Purchase</div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                      <span style={{ fontSize: '24px', fontWeight: 'bold', color: '#1d4ed8' }}>
                        {predictiveData.nextPurchase.probability30Days}%
                      </span>
                      <span style={{ fontSize: '13px', color: '#3b82f6', fontWeight: '600' }}>
                        likely in 30 days
                      </span>
                    </div>
                  </div>
                )}

                {/* Predicted CLV */}
                {predictiveData?.predicted && (
                  <div style={{
                    padding: '16px',
                    background: '#dcfce7',
                    borderRadius: '10px'
                  }}>
                    <div style={{ fontSize: '13px', color: '#6b7280', marginBottom: '6px' }}>Predicted 12-mo CLV</div>
                    <div style={{ fontSize: '24px', fontWeight: 'bold', color: '#16a34a' }}>
                      {formatCurrency(predictiveData.predicted.totalPredictedCLV)}
                    </div>
                  </div>
                )}

                {/* Purchase Frequency */}
                {clvData?.metrics && (
                  <div style={{
                    padding: '16px',
                    background: '#fef3c7',
                    borderRadius: '10px'
                  }}>
                    <div style={{ fontSize: '13px', color: '#6b7280', marginBottom: '6px' }}>Avg Order Interval</div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                      <span style={{ fontSize: '24px', fontWeight: 'bold', color: '#b45309' }}>
                        {clvData.metrics.avgDaysBetweenOrders || predictiveData?.historical?.avgDaysBetween || 'N/A'}
                      </span>
                      <span style={{ fontSize: '13px', color: '#92400e', fontWeight: '600' }}>
                        days
                      </span>
                    </div>
                  </div>
                )}
              </div>

              {/* Recommended Actions */}
              {churnRisk !== 'low' && (
                <div style={{
                  marginTop: '16px',
                  padding: '16px',
                  background: churnConfig?.bgColor || '#fee2e2',
                  borderRadius: '10px',
                  border: `1px solid ${churnConfig?.color}30`
                }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '12px' }}>
                    <AlertTriangle size={18} color={churnConfig?.color} />
                    <span style={{ fontWeight: '600', color: churnConfig?.color }}>Recommended Action</span>
                  </div>
                  <p style={{ margin: 0, fontSize: '14px', color: '#374151' }}>
                    {churnRisk === 'high'
                      ? 'This customer is at high risk of churning. Reach out immediately with a personalized offer or check-in call.'
                      : 'This customer shows signs of reduced engagement. Consider sending a re-engagement email or special offer.'}
                  </p>
                  <div style={{ display: 'flex', gap: '8px', marginTop: '12px' }}>
                    <button
                      onClick={() => onNavigate?.('builder', { customerId })}
                      style={{
                        padding: '8px 16px',
                        background: churnConfig?.color,
                        color: 'white',
                        border: 'none',
                        borderRadius: '6px',
                        cursor: 'pointer',
                        fontSize: '13px',
                        fontWeight: '600'
                      }}
                    >
                      Create Quote
                    </button>
                    <button
                      style={{
                        padding: '8px 16px',
                        background: 'white',
                        color: '#374151',
                        border: '1px solid #e5e7eb',
                        borderRadius: '6px',
                        cursor: 'pointer',
                        fontSize: '13px',
                        fontWeight: '600'
                      }}
                    >
                      Send Email
                    </button>
                  </div>
                </div>
              )}
            </CollapsibleSection>
          )}

          {/* Quotes */}
          <CollapsibleSection
            title={`Quotes (${quotes.length})`}
            icon={<FileText size={18} color="#6366f1" />}
            expanded={expandedSections.quotes}
            onToggle={() => toggleSection('quotes')}
            count={quotes.length}
          >
            {quotes.length === 0 ? (
              <div style={{ textAlign: 'center', padding: '20px', color: '#6b7280' }}>
                No quotes found
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                {quotes.slice(0, 5).map(quote => (
                  <TransactionRow
                    key={quote.id}
                    type="quote"
                    number={quote.quote_number}
                    status={quote.status}
                    amount={quote.total_amount}
                    date={quote.created_at}
                    formatCurrency={formatCurrency}
                    formatDate={formatDate}
                    onClick={() => onNavigate?.('quotes', { selected: quote.id })}
                  />
                ))}
                {quotes.length > 5 && (
                  <button
                    onClick={() => onNavigate?.('quotes', { filter: `customerId=${customerId}` })}
                    style={{
                      padding: '8px',
                      background: 'transparent',
                      border: 'none',
                      color: '#6366f1',
                      cursor: 'pointer',
                      fontWeight: '500',
                      fontSize: '13px'
                    }}
                  >
                    View all {quotes.length} quotes
                  </button>
                )}
              </div>
            )}
          </CollapsibleSection>

          {/* Orders */}
          <CollapsibleSection
            title={`Orders (${orders.length})`}
            icon={<ShoppingCart size={18} color="#22c55e" />}
            expanded={expandedSections.orders}
            onToggle={() => toggleSection('orders')}
            count={orders.length}
          >
            {orders.length === 0 ? (
              <div style={{ textAlign: 'center', padding: '20px', color: '#6b7280' }}>
                No orders found
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                {orders.slice(0, 5).map(order => (
                  <TransactionRow
                    key={order.id}
                    type="order"
                    number={order.order_number}
                    status={order.status}
                    amount={order.total_cents}
                    date={order.created_at}
                    formatCurrency={formatCurrency}
                    formatDate={formatDate}
                    onClick={() => onNavigate?.('orders', { selected: order.id })}
                  />
                ))}
                {orders.length > 5 && (
                  <button
                    onClick={() => onNavigate?.('orders', { filter: `customerId=${customerId}` })}
                    style={{
                      padding: '8px',
                      background: 'transparent',
                      border: 'none',
                      color: '#6366f1',
                      cursor: 'pointer',
                      fontWeight: '500',
                      fontSize: '13px'
                    }}
                  >
                    View all {orders.length} orders
                  </button>
                )}
              </div>
            )}
          </CollapsibleSection>

          {/* Invoices */}
          <CollapsibleSection
            title={`Invoices (${invoices.length})`}
            icon={<Receipt size={18} color="#f59e0b" />}
            expanded={expandedSections.invoices}
            onToggle={() => toggleSection('invoices')}
            count={invoices.length}
          >
            {invoices.length === 0 ? (
              <div style={{ textAlign: 'center', padding: '20px', color: '#6b7280' }}>
                No invoices found
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                {invoices.slice(0, 5).map(invoice => (
                  <TransactionRow
                    key={invoice.id}
                    type="invoice"
                    number={invoice.invoice_number}
                    status={invoice.status}
                    amount={invoice.total_amount}
                    date={invoice.created_at}
                    formatCurrency={formatCurrency}
                    formatDate={formatDate}
                    onClick={() => onNavigate?.('invoices', { selected: invoice.id })}
                  />
                ))}
                {invoices.length > 5 && (
                  <button
                    onClick={() => onNavigate?.('invoices', { filter: `customerId=${customerId}` })}
                    style={{
                      padding: '8px',
                      background: 'transparent',
                      border: 'none',
                      color: '#6366f1',
                      cursor: 'pointer',
                      fontWeight: '500',
                      fontSize: '13px'
                    }}
                  >
                    View all {invoices.length} invoices
                  </button>
                )}
              </div>
            )}
          </CollapsibleSection>
        </div>

        {/* Footer Actions */}
        <div style={{
          padding: '16px 24px',
          background: 'white',
          borderTop: '1px solid #e5e7eb',
          display: 'flex',
          gap: '12px'
        }}>
          <button
            onClick={() => onNavigate?.('builder', { customerId })}
            style={{
              flex: 1,
              padding: '12px',
              background: '#6366f1',
              color: 'white',
              border: 'none',
              borderRadius: '8px',
              cursor: 'pointer',
              fontWeight: '600',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '8px'
            }}
          >
            <FileText size={18} />
            Create Quote
          </button>
          <button
            onClick={() => onNavigate?.('customers', { selected: customerId, edit: true })}
            style={{
              padding: '12px 24px',
              background: '#f3f4f6',
              color: '#374151',
              border: 'none',
              borderRadius: '8px',
              cursor: 'pointer',
              fontWeight: '600'
            }}
          >
            Edit Customer
          </button>
        </div>
      </div>
    </div>
  );
};

// Collapsible Section Component
const CollapsibleSection = ({ title, icon, expanded, onToggle, children, count }) => (
  <div style={{
    background: 'white',
    borderRadius: '12px',
    marginBottom: '16px',
    boxShadow: '0 1px 3px rgba(0,0,0,0.1)',
    overflow: 'hidden'
  }}>
    <button
      onClick={onToggle}
      style={{
        width: '100%',
        padding: '16px 20px',
        background: 'transparent',
        border: 'none',
        cursor: 'pointer',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between'
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
        {icon}
        <span style={{ fontWeight: '600', fontSize: '15px', color: '#374151' }}>{title}</span>
      </div>
      {expanded ? <ChevronUp size={18} color="#6b7280" /> : <ChevronDown size={18} color="#6b7280" />}
    </button>
    {expanded && (
      <div style={{ padding: '0 20px 20px' }}>
        {children}
      </div>
    )}
  </div>
);

// Transaction Row Component
const TransactionRow = ({ type, number, status, amount, date, formatCurrency, formatDate, onClick }) => {
  const statusColors = {
    draft: { bg: '#f3f4f6', text: '#374151' },
    sent: { bg: '#dbeafe', text: '#1d4ed8' },
    pending: { bg: '#fef3c7', text: '#92400e' },
    accepted: { bg: '#dcfce7', text: '#166534' },
    won: { bg: '#dcfce7', text: '#166534' },
    paid: { bg: '#dcfce7', text: '#166534' },
    lost: { bg: '#fee2e2', text: '#991b1b' },
    cancelled: { bg: '#fee2e2', text: '#991b1b' },
    overdue: { bg: '#fee2e2', text: '#991b1b' }
  };

  const statusStyle = statusColors[status?.toLowerCase()] || statusColors.draft;

  return (
    <div
      onClick={onClick}
      style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        padding: '12px',
        background: '#f9fafb',
        borderRadius: '8px',
        cursor: 'pointer',
        transition: 'background 0.15s ease'
      }}
      onMouseEnter={(e) => e.currentTarget.style.background = '#f3f4f6'}
      onMouseLeave={(e) => e.currentTarget.style.background = '#f9fafb'}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
        <span style={{ fontWeight: '600', color: '#3b82f6', fontSize: '14px' }}>
          {number || `#${type.slice(0, 3).toUpperCase()}-?`}
        </span>
        <span style={{
          padding: '2px 8px',
          background: statusStyle.bg,
          color: statusStyle.text,
          borderRadius: '12px',
          fontSize: '11px',
          fontWeight: '600',
          textTransform: 'uppercase'
        }}>
          {status || 'draft'}
        </span>
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
        <span style={{ fontWeight: '600', color: '#22c55e', fontSize: '14px' }}>
          {formatCurrency(amount)}
        </span>
        <span style={{ fontSize: '12px', color: '#6b7280' }}>
          {formatDate(date)}
        </span>
        <ArrowRight size={14} color="#9ca3af" />
      </div>
    </div>
  );
};

export default Customer360View;
