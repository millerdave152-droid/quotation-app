import React, { useState } from 'react';
import { cachedFetch } from './services/apiCache';

// Lazy load components - loads ONLY when tab is first clicked
const QuotationManager = React.lazy(() => import('./components/QuotationManager'));
const CustomerManagement = React.lazy(() => import('./components/CustomerManagement'));
const ProductManagement = React.lazy(() => import('./components/ProductManagement'));
const RevenueAnalytics = React.lazy(() => import('./components/RevenueAnalytics'));
const MarketplaceManager = React.lazy(() => import('./components/MarketplaceManager'));
const MarketplaceReports = React.lazy(() => import('./components/MarketplaceReports'));
const BulkOperationsCenter = React.lazy(() => import('./components/BulkOperationsCenter'));

// Dashboard component with real data and anti-flickering
const Dashboard = () => {
  const [stats, setStats] = React.useState(null);
  const [loading, setLoading] = React.useState(true);

  // Anti-flickering refs - CRITICAL for preventing remount loops
  const isMounted = React.useRef(true);
  const loadedOnce = React.useRef(false);

  React.useEffect(() => {
    isMounted.current = true;

    // Only fetch ONCE per component lifetime
    if (!loadedOnce.current) {
      loadedOnce.current = true;
      fetchDashboardStats();
    }

    return () => {
      isMounted.current = false;
    };
  }, []);

  const fetchDashboardStats = async () => {
    if (!isMounted.current) return;

    try {
      const data = await cachedFetch('/api/dashboard/stats');

      if (!isMounted.current) return;
      setStats(data);
    } catch (error) {
      console.error('Error fetching dashboard stats:', error);
    } finally {
      if (isMounted.current) {
        setLoading(false);
      }
    }
  };

  const formatCurrency = (cents) => {
    if (!cents) return '$0.00';
    return `$${(cents / 100).toFixed(2).replace(/\B(?=(\d{3})+(?!\d))/g, ',')}`;
  };

  const formatDate = (dateString) => {
    return new Date(dateString).toLocaleDateString('en-CA', { month: 'short', day: 'numeric' });
  };

  if (loading) {
    return (
      <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '400px' }}>
        <div style={{ fontSize: '24px', color: '#6b7280' }}>Loading dashboard...</div>
      </div>
    );
  }

  return (
    <div style={{ padding: '30px', fontFamily: 'system-ui, -apple-system, sans-serif', background: '#f9fafb', minHeight: 'calc(100vh - 140px)' }}>
      <div style={{ maxWidth: '1400px', margin: '0 auto' }}>
        <div style={{ marginBottom: '30px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div>
            <h1 style={{ margin: '0 0 8px 0', fontSize: '32px', fontWeight: 'bold', background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>
              📊 Dashboard
            </h1>
            <p style={{ margin: 0, color: '#6b7280', fontSize: '14px' }}>Real-time business overview and insights</p>
          </div>
          <button onClick={fetchDashboardStats} style={{ padding: '12px 24px', background: '#667eea', color: 'white', border: 'none', borderRadius: '8px', fontSize: '14px', fontWeight: '600', cursor: 'pointer' }}>
            🔄 Refresh
          </button>
        </div>

        {/* Key Metrics */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: '20px', marginBottom: '30px' }}>
          <div style={{ background: 'white', padding: '24px', borderRadius: '12px', boxShadow: '0 1px 3px rgba(0,0,0,0.1)', borderLeft: '4px solid #667eea' }}>
            <div style={{ fontSize: '14px', color: '#6b7280', marginBottom: '8px', fontWeight: '500' }}>Total Quotes</div>
            <div style={{ fontSize: '32px', fontWeight: 'bold', color: '#111827', marginBottom: '8px' }}>{stats?.quotes?.total_quotes || 0}</div>
            <div style={{ fontSize: '12px', color: '#10b981' }}>+{stats?.quotes?.quotes_this_month || 0} this month</div>
          </div>
          <div style={{ background: 'white', padding: '24px', borderRadius: '12px', boxShadow: '0 1px 3px rgba(0,0,0,0.1)', borderLeft: '4px solid #10b981' }}>
            <div style={{ fontSize: '14px', color: '#6b7280', marginBottom: '8px', fontWeight: '500' }}>Total Revenue</div>
            <div style={{ fontSize: '32px', fontWeight: 'bold', color: '#111827', marginBottom: '8px' }}>{formatCurrency(stats?.quotes?.total_value)}</div>
            <div style={{ fontSize: '12px', color: '#10b981' }}>{formatCurrency(stats?.quotes?.revenue_this_month)} this month</div>
          </div>
          <div style={{ background: 'white', padding: '24px', borderRadius: '12px', boxShadow: '0 1px 3px rgba(0,0,0,0.1)', borderLeft: '4px solid #f59e0b' }}>
            <div style={{ fontSize: '14px', color: '#6b7280', marginBottom: '8px', fontWeight: '500' }}>Total Customers</div>
            <div style={{ fontSize: '32px', fontWeight: 'bold', color: '#111827', marginBottom: '8px' }}>{stats?.customers?.total_customers || 0}</div>
            <div style={{ fontSize: '12px', color: '#10b981' }}>+{stats?.customers?.new_this_month || 0} this month</div>
          </div>
          <div style={{ background: 'white', padding: '24px', borderRadius: '12px', boxShadow: '0 1px 3px rgba(0,0,0,0.1)', borderLeft: '4px solid #8b5cf6' }}>
            <div style={{ fontSize: '14px', color: '#6b7280', marginBottom: '8px', fontWeight: '500' }}>Total Products</div>
            <div style={{ fontSize: '32px', fontWeight: 'bold', color: '#111827', marginBottom: '8px' }}>{stats?.products?.total_products || 0}</div>
            <div style={{ fontSize: '12px', color: '#6b7280' }}>In database</div>
          </div>
        </div>

        {/* Quote Status Distribution */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: '16px', marginBottom: '30px' }}>
          <div style={{ background: 'white', padding: '20px', borderRadius: '12px', boxShadow: '0 1px 3px rgba(0,0,0,0.1)', textAlign: 'center' }}>
            <div style={{ fontSize: '28px', fontWeight: 'bold', color: '#6b7280', marginBottom: '4px' }}>{stats?.quotes?.draft_count || 0}</div>
            <div style={{ fontSize: '13px', color: '#6b7280', fontWeight: '500' }}>Draft</div>
          </div>
          <div style={{ background: 'white', padding: '20px', borderRadius: '12px', boxShadow: '0 1px 3px rgba(0,0,0,0.1)', textAlign: 'center' }}>
            <div style={{ fontSize: '28px', fontWeight: 'bold', color: '#3b82f6', marginBottom: '4px' }}>{stats?.quotes?.sent_count || 0}</div>
            <div style={{ fontSize: '13px', color: '#6b7280', fontWeight: '500' }}>Sent</div>
          </div>
          <div style={{ background: 'white', padding: '20px', borderRadius: '12px', boxShadow: '0 1px 3px rgba(0,0,0,0.1)', textAlign: 'center' }}>
            <div style={{ fontSize: '28px', fontWeight: 'bold', color: '#10b981', marginBottom: '4px' }}>{stats?.quotes?.won_count || 0}</div>
            <div style={{ fontSize: '13px', color: '#6b7280', fontWeight: '500' }}>Won</div>
          </div>
          <div style={{ background: 'white', padding: '20px', borderRadius: '12px', boxShadow: '0 1px 3px rgba(0,0,0,0.1)', textAlign: 'center' }}>
            <div style={{ fontSize: '28px', fontWeight: 'bold', color: '#ef4444', marginBottom: '4px' }}>{stats?.quotes?.lost_count || 0}</div>
            <div style={{ fontSize: '13px', color: '#6b7280', fontWeight: '500' }}>Lost</div>
          </div>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: '30px', marginBottom: '30px' }}>
          {/* Recent Quotes */}
          <div style={{ background: 'white', borderRadius: '12px', boxShadow: '0 1px 3px rgba(0,0,0,0.1)', overflow: 'hidden' }}>
            <div style={{ padding: '20px', borderBottom: '1px solid #e5e7eb' }}>
              <h3 style={{ margin: 0, fontSize: '18px', fontWeight: '600', color: '#111827' }}>📋 Recent Quotes</h3>
            </div>
            <div style={{ maxHeight: '400px', overflow: 'auto' }}>
              {stats?.recentQuotes && stats.recentQuotes.length > 0 ? (
                <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                  <tbody>
                    {stats.recentQuotes.map(quote => (
                      <tr key={quote.id} style={{ borderBottom: '1px solid #f3f4f6' }}>
                        <td style={{ padding: '16px' }}>
                          <div style={{ fontWeight: '600', color: '#667eea', fontSize: '14px' }}>{quote.quotation_number}</div>
                          <div style={{ fontSize: '12px', color: '#6b7280', marginTop: '4px' }}>{quote.customer_name || 'No customer'}</div>
                        </td>
                        <td style={{ padding: '16px', textAlign: 'right' }}>
                          <div style={{ fontWeight: '600', color: '#111827', fontSize: '14px' }}>{formatCurrency(quote.total_amount)}</div>
                          <div style={{ fontSize: '12px', color: '#6b7280', marginTop: '4px' }}>{formatDate(quote.created_at)}</div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              ) : (
                <div style={{ padding: '40px', textAlign: 'center', color: '#9ca3af' }}>No quotes yet</div>
              )}
            </div>
          </div>

          {/* Top Customers */}
          <div style={{ background: 'white', borderRadius: '12px', boxShadow: '0 1px 3px rgba(0,0,0,0.1)', overflow: 'hidden' }}>
            <div style={{ padding: '20px', borderBottom: '1px solid #e5e7eb' }}>
              <h3 style={{ margin: 0, fontSize: '18px', fontWeight: '600', color: '#111827' }}>🏆 Top Customers</h3>
            </div>
            <div style={{ padding: '16px' }}>
              {stats?.topCustomers && stats.topCustomers.length > 0 ? (
                stats.topCustomers.map((customer, index) => (
                  <div key={customer.id} style={{ padding: '12px', marginBottom: '8px', background: '#f9fafb', borderRadius: '8px' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'start' }}>
                      <div style={{ flex: 1 }}>
                        <div style={{ fontWeight: '600', color: '#111827', fontSize: '14px' }}>#{index + 1} {customer.name}</div>
                        <div style={{ fontSize: '12px', color: '#6b7280', marginTop: '4px' }}>{customer.quote_count} quotes</div>
                      </div>
                      <div style={{ textAlign: 'right' }}>
                        <div style={{ fontWeight: '600', color: '#10b981', fontSize: '14px' }}>{formatCurrency(customer.total_spent)}</div>
                      </div>
                    </div>
                  </div>
                ))
              ) : (
                <div style={{ padding: '20px', textAlign: 'center', color: '#9ca3af', fontSize: '14px' }}>No data yet</div>
              )}
            </div>
          </div>
        </div>

        {/* Revenue Trend */}
        {stats?.revenueTrend && stats.revenueTrend.length > 0 && (
          <div style={{ background: 'white', borderRadius: '12px', boxShadow: '0 1px 3px rgba(0,0,0,0.1)', padding: '24px' }}>
            <h3 style={{ margin: '0 0 20px 0', fontSize: '18px', fontWeight: '600', color: '#111827' }}>📈 Revenue Trend (Last 6 Months)</h3>
            <div style={{ display: 'flex', alignItems: 'flex-end', gap: '16px', height: '200px' }}>
              {stats.revenueTrend.map((month, index) => {
                const maxRevenue = Math.max(...stats.revenueTrend.map(m => parseFloat(m.revenue)));
                const heightPercent = maxRevenue > 0 ? (parseFloat(month.revenue) / maxRevenue) * 100 : 0;
                return (
                  <div key={index} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'flex-end' }}>
                    <div style={{ width: '100%', background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)', borderRadius: '8px 8px 0 0', height: `${heightPercent}%`, minHeight: '20px', position: 'relative', display: 'flex', alignItems: 'flex-start', justifyContent: 'center', padding: '8px 0' }}>
                      <div style={{ fontSize: '11px', color: 'white', fontWeight: '600', textAlign: 'center' }}>{formatCurrency(month.revenue)}</div>
                    </div>
                    <div style={{ fontSize: '11px', color: '#6b7280', marginTop: '8px', textAlign: 'center', fontWeight: '500' }}>{month.month}</div>
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

function App() {
  const [activeTab, setActiveTab] = useState('quotations');
  // Track which tabs have been visited to avoid unmounting/remounting
  const [loadedTabs, setLoadedTabs] = useState({ quotations: true }); // Start with first tab loaded

  // Switch tabs and mark as loaded
  const handleTabClick = (tab) => {
    setActiveTab(tab);
    if (!loadedTabs[tab]) {
      setLoadedTabs(prev => ({ ...prev, [tab]: true }));
    }
  };

  return (
    <div style={{ minHeight: '100vh', background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)' }}>
      {/* Header */}
      <div style={{ background: 'white', boxShadow: '0 2px 4px rgba(0,0,0,0.1)' }}>
        <div style={{ maxWidth: '1400px', margin: '0 auto', padding: '20px 30px' }}>
          <h1 style={{ margin: 0, fontSize: '24px', fontWeight: 'bold', background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>
            Customer Quotation System Pro
          </h1>

          {/* Navigation Tabs */}
          <div style={{ display: 'flex', gap: '8px', marginTop: '20px', borderBottom: '2px solid #e5e7eb' }}>
            <button onClick={() => handleTabClick('dashboard')} style={{ padding: '12px 24px', background: activeTab === 'dashboard' ? 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)' : 'transparent', color: activeTab === 'dashboard' ? 'white' : '#6b7280', border: 'none', borderRadius: '8px 8px 0 0', fontSize: '15px', fontWeight: '600', cursor: 'pointer' }}>
              📈 Dashboard
            </button>
            <button onClick={() => handleTabClick('customers')} style={{ padding: '12px 24px', background: activeTab === 'customers' ? 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)' : 'transparent', color: activeTab === 'customers' ? 'white' : '#6b7280', border: 'none', borderRadius: '8px 8px 0 0', fontSize: '15px', fontWeight: '600', cursor: 'pointer' }}>
              👥 Customers
            </button>
            <button onClick={() => handleTabClick('products')} style={{ padding: '12px 24px', background: activeTab === 'products' ? 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)' : 'transparent', color: activeTab === 'products' ? 'white' : '#6b7280', border: 'none', borderRadius: '8px 8px 0 0', fontSize: '15px', fontWeight: '600', cursor: 'pointer' }}>
              🏷️ Products
            </button>
            <button onClick={() => handleTabClick('quotations')} style={{ padding: '12px 24px', background: activeTab === 'quotations' ? 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)' : 'transparent', color: activeTab === 'quotations' ? 'white' : '#6b7280', border: 'none', borderRadius: '8px 8px 0 0', fontSize: '15px', fontWeight: '600', cursor: 'pointer' }}>
              📋 Quotations
            </button>
            <button onClick={() => handleTabClick('analytics')} style={{ padding: '12px 24px', background: activeTab === 'analytics' ? 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)' : 'transparent', color: activeTab === 'analytics' ? 'white' : '#6b7280', border: 'none', borderRadius: '8px 8px 0 0', fontSize: '15px', fontWeight: '600', cursor: 'pointer' }}>
              📊 Analytics
            </button>
            <button onClick={() => handleTabClick('marketplace')} style={{ padding: '12px 24px', background: activeTab === 'marketplace' ? 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)' : 'transparent', color: activeTab === 'marketplace' ? 'white' : '#6b7280', border: 'none', borderRadius: '8px 8px 0 0', fontSize: '15px', fontWeight: '600', cursor: 'pointer' }}>
              🛒 Marketplace
            </button>
            <button onClick={() => handleTabClick('reports')} style={{ padding: '12px 24px', background: activeTab === 'reports' ? 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)' : 'transparent', color: activeTab === 'reports' ? 'white' : '#6b7280', border: 'none', borderRadius: '8px 8px 0 0', fontSize: '15px', fontWeight: '600', cursor: 'pointer' }}>
              📑 Reports
            </button>
            <button onClick={() => handleTabClick('powertools')} style={{ padding: '12px 24px', background: activeTab === 'powertools' ? 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)' : 'transparent', color: activeTab === 'powertools' ? 'white' : '#6b7280', border: 'none', borderRadius: '8px 8px 0 0', fontSize: '15px', fontWeight: '600', cursor: 'pointer' }}>
              ⚡ Power Tools
            </button>
          </div>
        </div>
      </div>

      {/* Main Content - Only load tabs when first visited, then keep mounted */}
      <div style={{ background: '#f9fafb', minHeight: 'calc(100vh - 140px)' }}>
        {/* Dashboard - always eager loaded */}
        {loadedTabs.dashboard && (
          <div style={{ display: activeTab === 'dashboard' ? 'block' : 'none' }}>
            <Dashboard />
          </div>
        )}

        {/* Lazy-loaded tabs - load once on first visit, then keep mounted */}
        <React.Suspense fallback={
          <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '400px', flexDirection: 'column' }}>
            <div style={{ fontSize: '20px', color: '#667eea', fontWeight: '600', marginBottom: '12px' }}>Loading...</div>
            <div style={{ fontSize: '14px', color: '#6b7280' }}>Please wait</div>
          </div>
        }>
          {loadedTabs.customers && (
            <div style={{ display: activeTab === 'customers' ? 'block' : 'none' }}>
              <CustomerManagement />
            </div>
          )}
          {loadedTabs.products && (
            <div style={{ display: activeTab === 'products' ? 'block' : 'none' }}>
              <ProductManagement />
            </div>
          )}
          {loadedTabs.quotations && (
            <div style={{ display: activeTab === 'quotations' ? 'block' : 'none' }}>
              <QuotationManager />
            </div>
          )}
          {loadedTabs.analytics && (
            <div style={{ display: activeTab === 'analytics' ? 'block' : 'none' }}>
              <RevenueAnalytics />
            </div>
          )}
          {loadedTabs.marketplace && (
            <div style={{ display: activeTab === 'marketplace' ? 'block' : 'none' }}>
              <MarketplaceManager />
            </div>
          )}
          {loadedTabs.reports && (
            <div style={{ display: activeTab === 'reports' ? 'block' : 'none' }}>
              <MarketplaceReports />
            </div>
          )}
          {loadedTabs.powertools && (
            <div style={{ display: activeTab === 'powertools' ? 'block' : 'none' }}>
              <BulkOperationsCenter />
            </div>
          )}
        </React.Suspense>
      </div>
    </div>
  );
}

export default App;