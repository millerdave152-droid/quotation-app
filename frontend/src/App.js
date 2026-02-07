import React, { useEffect, useState, useCallback } from 'react';
import { BrowserRouter, Routes, Route, NavLink, Navigate, useNavigate } from 'react-router-dom';
import { cachedFetch } from './services/apiCache';
import { ToastProvider, useToast, setToastRef } from './components/ui';
import { SkeletonStats, SkeletonTable } from './components/ui';
import { handleApiError } from './utils/errorHandler';
import ErrorBoundary from './components/ErrorBoundary';
import { MainLayout } from './components/layout';
import { AuthProvider, useAuth } from './contexts/AuthContext';
import { QuoteProvider } from './contexts/QuoteContext';
import { ProductProvider } from './contexts/ProductContext';
import { ThemeProvider, useTheme } from './contexts/ThemeContext';
import ProtectedRoute from './components/auth/ProtectedRoute';
import CommandPalette from './components/ui/CommandPalette';
import GlobalSearch from './components/ui/GlobalSearch';
import AIAssistant from './components/AIAssistant';
import './services/authGuards';

import { authFetch } from './services/authFetch';
// Utility CSS classes for replacing inline styles
import './styles/utilities.css';
import './styles/theme.css';

// Lazy load components - loads ONLY when tab is first clicked
const LoginPage = React.lazy(() => import('./pages/LoginPage'));
const QuotationManager = React.lazy(() => import('./components/QuotationManager'));
const CustomerManagement = React.lazy(() => import('./components/CustomerManagement'));
const ProductManagement = React.lazy(() => import('./components/ProductManagement'));
const RevenueAnalytics = React.lazy(() => import('./components/RevenueAnalytics'));
const MarketplaceManager = React.lazy(() => import('./components/MarketplaceManager'));
const MarketplaceReports = React.lazy(() => import('./components/MarketplaceReports'));
const BulkOperationsCenter = React.lazy(() => import('./components/BulkOperationsCenter'));
const PowerFeatures2026 = React.lazy(() => import('./components/PowerFeatures2026'));
const SearchResults = React.lazy(() => import('./components/SearchResults'));
const UserManagement = React.lazy(() => import('./components/admin/UserManagement'));
const CustomerQuoteView = React.lazy(() => import('./pages/CustomerQuoteView'));

// Enterprise Phase 2 Components
const InvoiceManager = React.lazy(() => import('./components/invoices/InvoiceManager'));
const InventoryDashboard = React.lazy(() => import('./components/inventory/InventoryDashboard'));
const PaymentPortal = React.lazy(() => import('./pages/PaymentPortal'));
const EnhancedCustomerPortal = React.lazy(() => import('./pages/EnhancedCustomerPortal'));
const QuoteExpiryManager = React.lazy(() => import('./components/quotes/QuoteExpiryManager'));

// Advanced Pricing Components
const AdvancedPricingManager = React.lazy(() => import('./components/pricing/AdvancedPricingManager'));
const ManufacturerPromotionsAdmin = React.lazy(() => import('./components/pricing/ManufacturerPromotionsAdmin'));

// Product Visualization (Vendor Product Gallery)
const ProductVisualization = React.lazy(() => import('./components/ProductVisualization/ProductVisualization'));

// CLV Analytics Dashboard
const CLVDashboard = React.lazy(() => import('./components/analytics/CLVDashboard'));

// Purchasing Intelligence Dashboard
const PurchasingIntelligence = React.lazy(() => import('./components/analytics/PurchasingIntelligence'));

// Pipeline Analytics Dashboard
const PipelineAnalytics = React.lazy(() => import('./components/quotations/PipelineAnalytics'));

// Report Builder & Executive Dashboard
const ReportBuilder = React.lazy(() => import('./components/reports/ReportBuilder'));
const ExecutiveDashboard = React.lazy(() => import('./components/reports/ExecutiveDashboard'));

// Model Nomenclature Training Center
const TrainingCenter = React.lazy(() => import('./components/nomenclature/TrainingCenter'));
const NomenclatureAdmin = React.lazy(() => import('./components/nomenclature/NomenclatureAdmin'));

// Recommendation Rules Admin
const RecommendationRulesPage = React.lazy(() => import('./components/admin/recommendations/RecommendationRulesPage'));

// Quick Search (Universal Product Finder)
const QuickSearch = React.lazy(() => import('./components/QuickSearch'));

// Leads / Inquiry Capture
const LeadCapture = React.lazy(() => import('./components/leads/LeadCapture'));

// Delivery Management Dashboard
const DeliveryDashboard = React.lazy(() => import('./pages/DeliveryDashboard'));

// Dashboard component with real data and anti-flickering
const Dashboard = () => {
  const [stats, setStats] = React.useState(null);
  const [leadStats, setLeadStats] = React.useState(null);
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
      fetchLeadStats();
    }

    return () => {
      isMounted.current = false;
    };
  }, []);

  const fetchLeadStats = async () => {
    try {
      const token = localStorage.getItem('auth_token');
      const response = await authFetch('/api/leads/stats', {
        headers: {
          'Authorization': `Bearer ${token}`
        }
      });
      if (response.ok) {
        const data = await response.json();
        if (isMounted.current) {
          setLeadStats(data.data || data);
        }
      }
    } catch (error) {
      console.error('Error fetching lead stats:', error);
    }
  };

  const fetchDashboardStats = async () => {
    if (!isMounted.current) return;

    try {
      const data = await cachedFetch('/api/dashboard/stats');

      if (!isMounted.current) return;
      setStats(data);
    } catch (error) {
      handleApiError(error, { context: 'Loading dashboard' });
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
    if (!dateString) return 'N/A';
    try {
      const date = new Date(dateString);
      if (isNaN(date.getTime())) return 'N/A';
      return date.toLocaleDateString('en-CA', { month: 'short', day: 'numeric' });
    } catch {
      return 'N/A';
    }
  };

  if (loading) {
    return (
      <div style={{ padding: '30px', fontFamily: 'system-ui, -apple-system, sans-serif', background: '#f9fafb', minHeight: 'calc(100vh - 140px)' }}>
        <div style={{ maxWidth: '1400px', margin: '0 auto' }}>
          {/* Header skeleton */}
          <div style={{ marginBottom: '30px' }}>
            <div style={{ background: '#e5e7eb', width: '200px', height: '32px', borderRadius: '8px', marginBottom: '8px' }} />
            <div style={{ background: '#e5e7eb', width: '300px', height: '16px', borderRadius: '4px' }} />
          </div>
          {/* Stats skeleton */}
          <div style={{ marginBottom: '30px' }}>
            <SkeletonStats count={4} />
          </div>
          {/* Table skeleton */}
          <div style={{ background: 'white', borderRadius: '12px', overflow: 'hidden', boxShadow: '0 1px 3px rgba(0,0,0,0.1)' }}>
            <SkeletonTable rows={5} columns={4} />
          </div>
        </div>
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

        {/* Leads Overview */}
        {leadStats && (
          <div style={{ background: 'white', borderRadius: '12px', boxShadow: '0 1px 3px rgba(0,0,0,0.1)', padding: '24px', marginBottom: '30px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
              <h3 style={{ margin: 0, fontSize: '18px', fontWeight: '600', color: '#111827' }}>📝 Leads Pipeline</h3>
              <a href="/leads" style={{ fontSize: '14px', color: '#667eea', textDecoration: 'none', fontWeight: '500' }}>View All →</a>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(100px, 1fr))', gap: '16px' }}>
              <div style={{ textAlign: 'center', padding: '12px', background: '#f0f9ff', borderRadius: '8px' }}>
                <div style={{ fontSize: '24px', fontWeight: 'bold', color: '#0284c7' }}>{leadStats.total || 0}</div>
                <div style={{ fontSize: '12px', color: '#6b7280', marginTop: '4px' }}>Total</div>
              </div>
              <div style={{ textAlign: 'center', padding: '12px', background: '#dbeafe', borderRadius: '8px' }}>
                <div style={{ fontSize: '24px', fontWeight: 'bold', color: '#1d4ed8' }}>{leadStats.new_count || 0}</div>
                <div style={{ fontSize: '12px', color: '#6b7280', marginTop: '4px' }}>New</div>
              </div>
              <div style={{ textAlign: 'center', padding: '12px', background: '#fef3c7', borderRadius: '8px' }}>
                <div style={{ fontSize: '24px', fontWeight: 'bold', color: '#d97706' }}>{leadStats.hot_count || 0}</div>
                <div style={{ fontSize: '12px', color: '#6b7280', marginTop: '4px' }}>Hot</div>
              </div>
              <div style={{ textAlign: 'center', padding: '12px', background: '#dcfce7', borderRadius: '8px' }}>
                <div style={{ fontSize: '24px', fontWeight: 'bold', color: '#15803d' }}>{leadStats.qualified_count || 0}</div>
                <div style={{ fontSize: '12px', color: '#6b7280', marginTop: '4px' }}>Qualified</div>
              </div>
              <div style={{ textAlign: 'center', padding: '12px', background: '#fef2f2', borderRadius: '8px' }}>
                <div style={{ fontSize: '24px', fontWeight: 'bold', color: '#dc2626' }}>{(leadStats.follow_up_today || 0) + (leadStats.overdue_follow_ups || 0)}</div>
                <div style={{ fontSize: '12px', color: '#6b7280', marginTop: '4px' }}>Follow-ups</div>
              </div>
            </div>
          </div>
        )}

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

// Main App with protected routes
function App() {
  const { isAuthenticated, loading } = useAuth();
  const { toggleTheme, setLightTheme, setDarkTheme } = useTheme();
  const navigate = useNavigate();
  const [commandPaletteOpen, setCommandPaletteOpen] = useState(false);
  const [globalSearchOpen, setGlobalSearchOpen] = useState(false);

  // Global keyboard shortcuts
  useEffect(() => {
    const handleKeyDown = (e) => {
      // Command Palette (Ctrl+K or Cmd+K)
      if ((e.ctrlKey || e.metaKey) && e.key === 'k') {
        e.preventDefault();
        setCommandPaletteOpen(prev => !prev);
        setGlobalSearchOpen(false);
      }
      // Global Search (Ctrl+Shift+F or Cmd+Shift+F)
      if ((e.ctrlKey || e.metaKey) && e.shiftKey && e.key === 'F') {
        e.preventDefault();
        setGlobalSearchOpen(prev => !prev);
        setCommandPaletteOpen(false);
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, []);

  // Handle navigation from Command Palette
  const handleCommandNavigate = useCallback((path, action) => {
    if (path) {
      navigate(path);
    } else if (action) {
      // Handle actions
      switch (action) {
        case 'new-quote':
          navigate('/quotes/new');
          break;
        case 'new-customer':
          navigate('/customers');
          // Trigger add customer modal via URL param or state
          setTimeout(() => {
            const event = new CustomEvent('openAddCustomer');
            window.dispatchEvent(event);
          }, 100);
          break;
        case 'new-product':
          navigate('/products');
          setTimeout(() => {
            const event = new CustomEvent('openAddProduct');
            window.dispatchEvent(event);
          }, 100);
          break;
        case 'new-order':
          navigate('/quotes');
          break;
        case 'search-quotes':
          navigate('/quotes');
          setTimeout(() => {
            const searchInput = document.querySelector('input[placeholder*="Search"]');
            if (searchInput) searchInput.focus();
          }, 100);
          break;
        case 'search-customers':
          navigate('/customers');
          setTimeout(() => {
            const searchInput = document.querySelector('input[placeholder*="Search"]');
            if (searchInput) searchInput.focus();
          }, 100);
          break;
        case 'search-products':
          navigate('/products');
          setTimeout(() => {
            const searchInput = document.querySelector('input[placeholder*="Search"]');
            if (searchInput) searchInput.focus();
          }, 100);
          break;
        case 'global-search':
          setGlobalSearchOpen(true);
          break;
        case 'toggle-theme':
          toggleTheme();
          break;
        case 'set-light-theme':
          setLightTheme();
          break;
        case 'set-dark-theme':
          setDarkTheme();
          break;
        default:
          break;
      }
    }
  }, [navigate, toggleTheme, setLightTheme, setDarkTheme]);

  // Show loading while checking auth state
  if (loading) {
    return (
      <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '100vh', background: '#f9fafb' }}>
        <div style={{ textAlign: 'center' }}>
          <div style={{ width: '48px', height: '48px', border: '4px solid #e5e7eb', borderTopColor: '#667eea', borderRadius: '50%', animation: 'spin 1s linear infinite', margin: '0 auto 16px' }} />
          <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
          <p style={{ color: '#6b7280', fontSize: '14px', margin: 0 }}>Loading...</p>
        </div>
      </div>
    );
  }

  return (
    <>
      {/* Command Palette - Always available */}
      <CommandPalette
        isOpen={commandPaletteOpen}
        onClose={() => setCommandPaletteOpen(false)}
        onNavigate={handleCommandNavigate}
      />

      {/* Global Search - Ctrl+Shift+F */}
      <GlobalSearch
        isOpen={globalSearchOpen}
        onClose={() => setGlobalSearchOpen(false)}
      />

      {/* AI Assistant Chat - Only show when authenticated */}
      {isAuthenticated && <AIAssistant />}

      <React.Suspense fallback={
      <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '100vh', flexDirection: 'column', background: '#f9fafb' }}>
        <div style={{ fontSize: '20px', color: '#667eea', fontWeight: '600', marginBottom: '12px' }}>Loading...</div>
        <div style={{ fontSize: '14px', color: '#6b7280' }}>Please wait</div>
      </div>
    }>
      <Routes>
        {/* Public route - Login page */}
        <Route path="/login" element={
          isAuthenticated ? <Navigate to="/quotes" replace /> : <LoginPage />
        } />

        {/* Public route - Customer quote view via magic link */}
        <Route path="/quote/counter/:token" element={<CustomerQuoteView />} />
        <Route path="/quote/view/:token" element={<CustomerQuoteView />} />
        <Route path="/pay/:token" element={<PaymentPortal />} />
        <Route path="/customer-portal/:token" element={<EnhancedCustomerPortal />} />

        {/* Protected routes - wrapped in MainLayout */}
        <Route element={<ProtectedRoute><MainLayout /></ProtectedRoute>}>
          <Route path="/" element={<Navigate to="/quotes" replace />} />
          <Route path="/dashboard" element={<Dashboard />} />
          <Route path="/customers" element={<CustomerManagement />} />
          <Route path="/customers/:id" element={<CustomerManagement />} />
          <Route path="/products" element={<ProductManagement />} />
          <Route path="/products/:id" element={<ProductManagement />} />
          <Route path="/quotes" element={<QuotationManager />} />
          <Route path="/quotes/new" element={<QuotationManager />} />
          <Route path="/quotes/:id" element={<QuotationManager />} />
          <Route path="/analytics" element={<RevenueAnalytics />} />
          <Route path="/clv-dashboard" element={<CLVDashboard />} />
          <Route path="/purchasing-intelligence" element={<PurchasingIntelligence />} />
          <Route path="/pipeline-analytics" element={<PipelineAnalytics />} />
          <Route path="/report-builder" element={<ReportBuilder />} />
          <Route path="/executive-dashboard" element={<ExecutiveDashboard />} />
          <Route path="/training-center" element={<TrainingCenter />} />
          <Route path="/marketplace/*" element={<MarketplaceManager />} />
          <Route path="/reports" element={<MarketplaceReports />} />
          <Route path="/bulk-ops" element={<BulkOperationsCenter />} />
          <Route path="/features/*" element={<PowerFeatures2026 />} />
          <Route path="/search" element={<SearchResults />} />
          {/* Enterprise Phase 2 Routes */}
          <Route path="/invoices" element={<InvoiceManager />} />
          <Route path="/inventory" element={<InventoryDashboard />} />
          <Route path="/quote-expiry" element={<QuoteExpiryManager />} />
          {/* Advanced Pricing */}
          <Route path="/pricing" element={<AdvancedPricingManager />} />
          <Route path="/manufacturer-promotions" element={<ManufacturerPromotionsAdmin />} />
          {/* Product Visualization */}
          <Route path="/product-visualization" element={<ProductVisualization />} />
          <Route path="/product-visualization/:id" element={<ProductVisualization />} />
          {/* Quick Search (Universal Product Finder) */}
          <Route path="/quick-search" element={<QuickSearch />} />
          {/* Leads / Inquiry Capture */}
          <Route path="/leads" element={<LeadCapture />} />
          <Route path="/leads/:id" element={<LeadCapture />} />
          {/* Admin routes */}
          <Route path="/admin/users" element={
            <ProtectedRoute requiredRoles={['admin']}>
              <UserManagement />
            </ProtectedRoute>
          } />
          <Route path="/admin/nomenclature" element={
            <ProtectedRoute requiredRoles={['admin']}>
              <NomenclatureAdmin />
            </ProtectedRoute>
          } />
          <Route path="/admin/deliveries" element={
            <ProtectedRoute requiredRoles={['admin', 'manager']}>
              <DeliveryDashboard />
            </ProtectedRoute>
          } />
          <Route path="/admin/recommendations" element={
            <ProtectedRoute requiredRoles={['admin', 'manager']}>
              <RecommendationRulesPage />
            </ProtectedRoute>
          } />
          {/* 404 fallback */}
          <Route path="*" element={
            <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '400px', flexDirection: 'column' }}>
              <div style={{ fontSize: '48px', marginBottom: '16px' }}>404</div>
              <div style={{ fontSize: '20px', color: '#667eea', fontWeight: '600', marginBottom: '12px' }}>Page Not Found</div>
              <NavLink to="/quotes" style={{ color: '#667eea', textDecoration: 'underline' }}>Go to Quotations</NavLink>
            </div>
          } />
        </Route>
      </Routes>
    </React.Suspense>
    </>
  );
}

// Wrap App with BrowserRouter, ErrorBoundary, AuthProvider, QuoteProvider, ProductProvider, ThemeProvider, and ToastProvider
const AppWithProviders = () => (
  <BrowserRouter>
    <ErrorBoundary>
      <ThemeProvider>
        <AuthProvider>
          <QuoteProvider>
            <ProductProvider>
              <ToastProvider position="top-right" maxToasts={5}>
                <ToastRefSetter />
                <App />
              </ToastProvider>
            </ProductProvider>
          </QuoteProvider>
        </AuthProvider>
      </ThemeProvider>
    </ErrorBoundary>
  </BrowserRouter>
);

// Component to set toast ref for use outside React
const ToastRefSetter = () => {
  const toast = useToast();
  useEffect(() => {
    setToastRef(toast);
  }, [toast]);
  return null;
};

export default AppWithProviders;
