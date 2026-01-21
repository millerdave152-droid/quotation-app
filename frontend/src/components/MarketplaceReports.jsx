import React, { useState, useEffect, useCallback } from 'react';

const API_BASE = `${process.env.REACT_APP_API_URL || 'http://localhost:3001'}/api`;

// Helper to get auth headers
const getAuthHeaders = () => {
  const token = localStorage.getItem('auth_token');
  return {
    'Content-Type': 'application/json',
    'Authorization': token ? `Bearer ${token}` : ''
  };
};

/**
 * MarketplaceReports Component
 * Full reporting system for marketplace analytics
 */
function MarketplaceReports() {
  // State
  const [activeReport, setActiveReport] = useState('dashboard');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  // Date range state
  const [dateRange, setDateRange] = useState('month');
  const [customStartDate, setCustomStartDate] = useState('');
  const [customEndDate, setCustomEndDate] = useState('');

  // Report data
  const [dashboardData, setDashboardData] = useState(null);
  const [salesData, setSalesData] = useState(null);
  const [inventoryData, setInventoryData] = useState(null);
  const [profitData, setProfitData] = useState(null);
  const [customerData, setCustomerData] = useState(null);
  const [orderData, setOrderData] = useState(null);

  // Get date range params
  const getDateParams = useCallback(() => {
    const today = new Date();
    let startDate, endDate;

    endDate = today.toISOString().split('T')[0];

    switch (dateRange) {
      case 'today':
        startDate = endDate;
        break;
      case 'week':
        const weekStart = new Date(today);
        weekStart.setDate(today.getDate() - 7);
        startDate = weekStart.toISOString().split('T')[0];
        break;
      case 'month':
        const monthStart = new Date(today);
        monthStart.setDate(today.getDate() - 30);
        startDate = monthStart.toISOString().split('T')[0];
        break;
      case 'quarter':
        const quarterStart = new Date(today);
        quarterStart.setDate(today.getDate() - 90);
        startDate = quarterStart.toISOString().split('T')[0];
        break;
      case 'year':
        const yearStart = new Date(today);
        yearStart.setFullYear(today.getFullYear() - 1);
        startDate = yearStart.toISOString().split('T')[0];
        break;
      case 'custom':
        startDate = customStartDate;
        endDate = customEndDate || endDate;
        break;
      default:
        startDate = new Date(today.setDate(today.getDate() - 30)).toISOString().split('T')[0];
    }

    return { start_date: startDate, end_date: endDate };
  }, [dateRange, customStartDate, customEndDate]);

  // Fetch dashboard data
  const fetchDashboard = useCallback(async () => {
    try {
      const response = await fetch(`${API_BASE}/marketplace/reports/dashboard`, {
        headers: getAuthHeaders()
      });
      if (!response.ok) throw new Error('Failed to fetch dashboard');
      const data = await response.json();
      setDashboardData(data);
    } catch (err) {
      console.error('Dashboard fetch error:', err);
      setError(err.message);
    }
  }, []);

  // Fetch sales report
  const fetchSalesReport = useCallback(async () => {
    setLoading(true);
    try {
      const params = getDateParams();
      const response = await fetch(
        `${API_BASE}/marketplace/reports/sales?start_date=${params.start_date}&end_date=${params.end_date}`,
        { headers: getAuthHeaders() }
      );
      if (!response.ok) throw new Error('Failed to fetch sales report');
      const data = await response.json();
      setSalesData(data);
    } catch (err) {
      console.error('Sales report error:', err);
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [getDateParams]);

  // Fetch inventory report
  const fetchInventoryReport = useCallback(async () => {
    setLoading(true);
    try {
      const response = await fetch(`${API_BASE}/marketplace/reports/inventory`, {
        headers: getAuthHeaders()
      });
      if (!response.ok) throw new Error('Failed to fetch inventory report');
      const data = await response.json();
      setInventoryData(data);
    } catch (err) {
      console.error('Inventory report error:', err);
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, []);

  // Fetch profit report
  const fetchProfitReport = useCallback(async () => {
    setLoading(true);
    try {
      const params = getDateParams();
      const response = await fetch(
        `${API_BASE}/marketplace/reports/profit?start_date=${params.start_date}&end_date=${params.end_date}`,
        { headers: getAuthHeaders() }
      );
      if (!response.ok) throw new Error('Failed to fetch profit report');
      const data = await response.json();
      setProfitData(data);
    } catch (err) {
      console.error('Profit report error:', err);
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [getDateParams]);

  // Fetch customer report
  const fetchCustomerReport = useCallback(async () => {
    setLoading(true);
    try {
      const params = getDateParams();
      const response = await fetch(
        `${API_BASE}/marketplace/reports/customers?start_date=${params.start_date}&end_date=${params.end_date}`,
        { headers: getAuthHeaders() }
      );
      if (!response.ok) throw new Error('Failed to fetch customer report');
      const data = await response.json();
      setCustomerData(data);
    } catch (err) {
      console.error('Customer report error:', err);
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [getDateParams]);

  // Fetch order report
  const fetchOrderReport = useCallback(async () => {
    setLoading(true);
    try {
      const params = getDateParams();
      const response = await fetch(
        `${API_BASE}/marketplace/reports/orders?start_date=${params.start_date}&end_date=${params.end_date}`,
        { headers: getAuthHeaders() }
      );
      if (!response.ok) throw new Error('Failed to fetch order report');
      const data = await response.json();
      setOrderData(data);
    } catch (err) {
      console.error('Order report error:', err);
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [getDateParams]);

  // Load data based on active report
  useEffect(() => {
    setError(null);
    switch (activeReport) {
      case 'dashboard':
        fetchDashboard();
        break;
      case 'sales':
        fetchSalesReport();
        break;
      case 'inventory':
        fetchInventoryReport();
        break;
      case 'profit':
        fetchProfitReport();
        break;
      case 'customers':
        fetchCustomerReport();
        break;
      case 'orders':
        fetchOrderReport();
        break;
      default:
        break;
    }
  }, [activeReport, dateRange, customStartDate, customEndDate]);

  // Export state
  const [exporting, setExporting] = useState(false);
  const [exportError, setExportError] = useState(null);

  // Export report with better error handling
  const handleExport = async (type) => {
    setExporting(true);
    setExportError(null);
    try {
      const params = getDateParams();
      const url = `${API_BASE}/marketplace/reports/export/${type}?start_date=${params.start_date}&end_date=${params.end_date}`;

      // Use fetch to check if the export works before opening
      const response = await fetch(url, { headers: getAuthHeaders() });
      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.error || `Export failed: ${response.status}`);
      }

      // Get the blob and create download link
      const blob = await response.blob();
      const downloadUrl = window.URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = downloadUrl;
      link.download = `${type}-report-${params.start_date}-to-${params.end_date}.csv`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      window.URL.revokeObjectURL(downloadUrl);
    } catch (err) {
      console.error('Export error:', err);
      setExportError(err.message || 'Failed to export report');
    } finally {
      setExporting(false);
    }
  };

  // Format helpers
  const formatCurrency = (cents) => {
    if (!cents && cents !== 0) return '$0.00';
    return `$${(cents / 100).toFixed(2).replace(/\B(?=(\d{3})+(?!\d))/g, ',')}`;
  };

  const formatDate = (dateString) => {
    if (!dateString) return '-';
    return new Date(dateString).toLocaleDateString('en-CA', {
      year: 'numeric',
      month: 'short',
      day: 'numeric'
    });
  };

  const formatPercent = (value) => {
    if (!value && value !== 0) return '0%';
    return `${parseFloat(value).toFixed(1)}%`;
  };

  // Styles
  const styles = {
    container: {
      padding: '30px',
      fontFamily: 'system-ui, -apple-system, sans-serif',
      background: '#f9fafb',
      minHeight: '100vh'
    },
    header: {
      marginBottom: '30px'
    },
    title: {
      margin: 0,
      fontSize: '28px',
      fontWeight: 'bold',
      color: '#111827'
    },
    subtitle: {
      margin: '8px 0 0 0',
      color: '#6b7280',
      fontSize: '14px'
    },
    nav: {
      display: 'flex',
      gap: '8px',
      marginBottom: '20px',
      background: 'white',
      padding: '8px',
      borderRadius: '12px',
      boxShadow: '0 1px 3px rgba(0,0,0,0.1)',
      flexWrap: 'wrap'
    },
    navButton: (isActive) => ({
      padding: '12px 20px',
      background: isActive ? 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)' : 'transparent',
      color: isActive ? 'white' : '#6b7280',
      border: 'none',
      borderRadius: '8px',
      fontSize: '14px',
      fontWeight: '600',
      cursor: 'pointer',
      transition: 'all 0.2s ease'
    }),
    dateFilter: {
      display: 'flex',
      gap: '12px',
      alignItems: 'center',
      marginBottom: '20px',
      background: 'white',
      padding: '16px',
      borderRadius: '12px',
      boxShadow: '0 1px 3px rgba(0,0,0,0.1)',
      flexWrap: 'wrap'
    },
    dateButton: (isActive) => ({
      padding: '8px 16px',
      background: isActive ? '#667eea' : '#f3f4f6',
      color: isActive ? 'white' : '#374151',
      border: 'none',
      borderRadius: '6px',
      fontSize: '13px',
      fontWeight: '500',
      cursor: 'pointer'
    }),
    dateInput: {
      padding: '8px 12px',
      border: '2px solid #e5e7eb',
      borderRadius: '6px',
      fontSize: '13px'
    },
    card: {
      background: 'white',
      borderRadius: '12px',
      padding: '24px',
      boxShadow: '0 1px 3px rgba(0,0,0,0.1)',
      marginBottom: '20px'
    },
    cardTitle: {
      margin: '0 0 16px 0',
      fontSize: '18px',
      fontWeight: '600',
      color: '#111827'
    },
    statGrid: {
      display: 'grid',
      gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
      gap: '16px',
      marginBottom: '24px'
    },
    statCard: (color) => ({
      background: `${color}10`,
      borderRadius: '12px',
      padding: '20px',
      borderLeft: `4px solid ${color}`
    }),
    statValue: {
      fontSize: '28px',
      fontWeight: 'bold',
      color: '#111827',
      marginBottom: '4px'
    },
    statLabel: {
      fontSize: '13px',
      color: '#6b7280',
      fontWeight: '500'
    },
    table: {
      width: '100%',
      borderCollapse: 'collapse'
    },
    th: {
      padding: '12px',
      textAlign: 'left',
      fontSize: '12px',
      fontWeight: '600',
      color: '#6b7280',
      textTransform: 'uppercase',
      borderBottom: '2px solid #e5e7eb',
      background: '#f9fafb'
    },
    td: {
      padding: '12px',
      fontSize: '14px',
      color: '#374151',
      borderBottom: '1px solid #f3f4f6'
    },
    exportButton: {
      padding: '10px 20px',
      background: '#10b981',
      color: 'white',
      border: 'none',
      borderRadius: '8px',
      fontSize: '14px',
      fontWeight: '600',
      cursor: 'pointer',
      display: 'flex',
      alignItems: 'center',
      gap: '8px'
    },
    alert: (type) => ({
      padding: '16px',
      borderRadius: '8px',
      marginBottom: '16px',
      background: type === 'warning' ? '#fef3c7' : type === 'error' ? '#fee2e2' : '#dcfce7',
      color: type === 'warning' ? '#92400e' : type === 'error' ? '#991b1b' : '#166534',
      fontWeight: '500'
    }),
    chartContainer: {
      height: '200px',
      display: 'flex',
      alignItems: 'flex-end',
      gap: '4px',
      padding: '20px 0'
    },
    chartBar: (height, color) => ({
      flex: 1,
      height: `${height}%`,
      background: color || '#667eea',
      borderRadius: '4px 4px 0 0',
      minWidth: '20px',
      maxWidth: '40px',
      transition: 'height 0.3s ease'
    }),
    loading: {
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      padding: '60px',
      color: '#6b7280',
      fontSize: '16px'
    },
    badge: (color) => ({
      padding: '4px 12px',
      borderRadius: '12px',
      fontSize: '12px',
      fontWeight: '600',
      background: `${color}20`,
      color: color
    })
  };

  // Dashboard View
  const renderDashboard = () => {
    if (!dashboardData) return <div style={styles.loading}>Loading dashboard...</div>;

    return (
      <>
        {/* Quick Stats */}
        <div style={styles.statGrid}>
          <div style={styles.statCard('#3b82f6')}>
            <div style={styles.statValue}>{formatCurrency(dashboardData.today?.revenue_today_cents)}</div>
            <div style={styles.statLabel}>Today's Revenue</div>
            <div style={{ fontSize: '12px', color: '#6b7280', marginTop: '4px' }}>
              {dashboardData.today?.orders_today || 0} orders
            </div>
          </div>
          <div style={styles.statCard('#10b981')}>
            <div style={styles.statValue}>{formatCurrency(dashboardData.this_week?.revenue_week_cents)}</div>
            <div style={styles.statLabel}>This Week</div>
            <div style={{ fontSize: '12px', color: '#6b7280', marginTop: '4px' }}>
              {dashboardData.this_week?.orders_week || 0} orders
            </div>
          </div>
          <div style={styles.statCard('#8b5cf6')}>
            <div style={styles.statValue}>{formatCurrency(dashboardData.this_month?.revenue_month_cents)}</div>
            <div style={styles.statLabel}>This Month</div>
            <div style={{ fontSize: '12px', color: '#6b7280', marginTop: '4px' }}>
              {dashboardData.this_month?.orders_month || 0} orders
            </div>
          </div>
          <div style={styles.statCard('#f59e0b')}>
            <div style={styles.statValue}>{dashboardData.pending?.pending_orders || 0}</div>
            <div style={styles.statLabel}>Pending Orders</div>
            <div style={{ fontSize: '12px', color: '#6b7280', marginTop: '4px' }}>
              {dashboardData.pending?.waiting_acceptance || 0} waiting, {dashboardData.pending?.needs_shipping || 0} shipping
            </div>
          </div>
        </div>

        {/* Alerts */}
        <div style={styles.card}>
          <h3 style={styles.cardTitle}>Inventory Alerts</h3>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '16px' }}>
            <div style={styles.alert('error')}>
              <div style={{ fontSize: '24px', fontWeight: 'bold' }}>{dashboardData.inventory_alerts?.out_of_stock || 0}</div>
              <div>Out of Stock</div>
            </div>
            <div style={styles.alert('warning')}>
              <div style={{ fontSize: '24px', fontWeight: 'bold' }}>{dashboardData.inventory_alerts?.low_stock || 0}</div>
              <div>Low Stock (1-5 units)</div>
            </div>
            <div style={styles.alert('success')}>
              <div style={{ fontSize: '24px', fontWeight: 'bold' }}>{dashboardData.inventory_alerts?.never_synced || 0}</div>
              <div>Never Synced</div>
            </div>
          </div>
        </div>

        {/* Last Sync */}
        {dashboardData.last_sync && (
          <div style={styles.card}>
            <h3 style={styles.cardTitle}>Last Sync</h3>
            <div style={{ display: 'flex', gap: '24px', alignItems: 'center' }}>
              <div>
                <span style={{ fontWeight: '600' }}>Status: </span>
                <span style={styles.badge(dashboardData.last_sync.status === 'completed' ? '#10b981' : '#f59e0b')}>
                  {dashboardData.last_sync.status}
                </span>
              </div>
              <div>
                <span style={{ fontWeight: '600' }}>Time: </span>
                {formatDate(dashboardData.last_sync.started_at)}
              </div>
              <div>
                <span style={{ fontWeight: '600' }}>Products: </span>
                {dashboardData.last_sync.products_synced || 0} synced, {dashboardData.last_sync.products_failed || 0} failed
              </div>
            </div>
          </div>
        )}

        {/* Quick Links */}
        <div style={styles.card}>
          <h3 style={styles.cardTitle}>Quick Reports</h3>
          <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap' }}>
            <button onClick={() => setActiveReport('sales')} style={{ ...styles.navButton(false), background: '#dbeafe', color: '#1e40af' }}>
              View Sales Report
            </button>
            <button onClick={() => setActiveReport('inventory')} style={{ ...styles.navButton(false), background: '#dcfce7', color: '#166534' }}>
              View Inventory Report
            </button>
            <button onClick={() => setActiveReport('profit')} style={{ ...styles.navButton(false), background: '#fef3c7', color: '#92400e' }}>
              View Profit Report
            </button>
            <button onClick={() => setActiveReport('customers')} style={{ ...styles.navButton(false), background: '#fae8ff', color: '#86198f' }}>
              View Customer Report
            </button>
          </div>
        </div>
      </>
    );
  };

  // Sales Report View
  const renderSalesReport = () => {
    if (loading) return <div style={styles.loading}>Loading sales report...</div>;
    if (!salesData) return <div style={styles.loading}>No sales data available</div>;

    const maxRevenue = Math.max(...(salesData.daily || []).map(d => d.revenue_cents || 0), 1);

    return (
      <>
        {/* Summary Stats */}
        <div style={styles.statGrid}>
          <div style={styles.statCard('#3b82f6')}>
            <div style={styles.statValue}>{formatCurrency(salesData.summary?.total_revenue_cents)}</div>
            <div style={styles.statLabel}>Total Revenue</div>
          </div>
          <div style={styles.statCard('#10b981')}>
            <div style={styles.statValue}>{salesData.summary?.total_orders || 0}</div>
            <div style={styles.statLabel}>Total Orders</div>
          </div>
          <div style={styles.statCard('#8b5cf6')}>
            <div style={styles.statValue}>{formatCurrency(salesData.summary?.avg_order_value_cents)}</div>
            <div style={styles.statLabel}>Avg Order Value</div>
          </div>
          <div style={styles.statCard('#f59e0b')}>
            <div style={styles.statValue}>{salesData.summary?.total_units_sold || 0}</div>
            <div style={styles.statLabel}>Units Sold</div>
          </div>
        </div>

        {/* Daily Sales Chart */}
        <div style={styles.card}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
            <h3 style={{ ...styles.cardTitle, margin: 0 }}>Daily Sales Trend</h3>
            <button
              onClick={() => handleExport('sales')}
              disabled={exporting}
              style={{ ...styles.exportButton, opacity: exporting ? 0.6 : 1, cursor: exporting ? 'not-allowed' : 'pointer' }}
            >
              {exporting ? 'Exporting...' : 'Export CSV'}
            </button>
          </div>
          {salesData.daily && salesData.daily.length > 0 ? (
            <div style={styles.chartContainer}>
              {salesData.daily.map((day, i) => (
                <div key={i} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', flex: 1 }}>
                  <div style={styles.chartBar((day.revenue_cents / maxRevenue) * 100, '#667eea')}
                       title={`${formatDate(day.date)}: ${formatCurrency(day.revenue_cents)}`} />
                  <div style={{ fontSize: '10px', color: '#9ca3af', marginTop: '4px', transform: 'rotate(-45deg)', whiteSpace: 'nowrap' }}>
                    {new Date(day.date).getDate()}
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div style={{ textAlign: 'center', padding: '40px', color: '#9ca3af' }}>No sales data for this period</div>
          )}
        </div>

        {/* Top Products */}
        <div style={styles.card}>
          <h3 style={styles.cardTitle}>Top Products by Revenue</h3>
          {salesData.top_products && salesData.top_products.length > 0 ? (
            <div style={{ overflowX: 'auto' }}>
              <table style={styles.table}>
                <thead>
                  <tr>
                    <th style={styles.th}>Product</th>
                    <th style={styles.th}>Manufacturer</th>
                    <th style={styles.th}>Orders</th>
                    <th style={styles.th}>Units Sold</th>
                    <th style={{ ...styles.th, textAlign: 'right' }}>Revenue</th>
                  </tr>
                </thead>
                <tbody>
                  {salesData.top_products.map((product, i) => (
                    <tr key={i}>
                      <td style={styles.td}>{product.product_name || 'Unknown'}</td>
                      <td style={styles.td}>{product.manufacturer || '-'}</td>
                      <td style={styles.td}>{product.order_count}</td>
                      <td style={styles.td}>{product.units_sold}</td>
                      <td style={{ ...styles.td, textAlign: 'right', fontWeight: '600' }}>{formatCurrency(product.revenue_cents)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <div style={{ textAlign: 'center', padding: '40px', color: '#9ca3af' }}>No product data</div>
          )}
        </div>

        {/* Sales by Category */}
        <div style={styles.card}>
          <h3 style={styles.cardTitle}>Sales by Category</h3>
          {salesData.by_category && salesData.by_category.length > 0 ? (
            <div style={{ overflowX: 'auto' }}>
              <table style={styles.table}>
                <thead>
                  <tr>
                    <th style={styles.th}>Category</th>
                    <th style={styles.th}>Orders</th>
                    <th style={styles.th}>Units Sold</th>
                    <th style={{ ...styles.th, textAlign: 'right' }}>Revenue</th>
                  </tr>
                </thead>
                <tbody>
                  {salesData.by_category.map((cat, i) => (
                    <tr key={i}>
                      <td style={styles.td}>{cat.category_name}</td>
                      <td style={styles.td}>{cat.order_count}</td>
                      <td style={styles.td}>{cat.units_sold}</td>
                      <td style={{ ...styles.td, textAlign: 'right', fontWeight: '600' }}>{formatCurrency(cat.revenue_cents)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <div style={{ textAlign: 'center', padding: '40px', color: '#9ca3af' }}>No category data</div>
          )}
        </div>
      </>
    );
  };

  // Inventory Report View
  const renderInventoryReport = () => {
    if (loading) return <div style={styles.loading}>Loading inventory report...</div>;
    if (!inventoryData) return <div style={styles.loading}>No inventory data available</div>;

    return (
      <>
        {/* Overall Stats */}
        <div style={styles.statGrid}>
          <div style={styles.statCard('#3b82f6')}>
            <div style={styles.statValue}>{inventoryData.overall?.total_products || 0}</div>
            <div style={styles.statLabel}>Total Products</div>
          </div>
          <div style={styles.statCard('#10b981')}>
            <div style={styles.statValue}>{inventoryData.overall?.total_stock || 0}</div>
            <div style={styles.statLabel}>Total Stock Units</div>
          </div>
          <div style={styles.statCard('#ef4444')}>
            <div style={styles.statValue}>{inventoryData.overall?.out_of_stock || 0}</div>
            <div style={styles.statLabel}>Out of Stock</div>
          </div>
          <div style={styles.statCard('#f59e0b')}>
            <div style={styles.statValue}>{inventoryData.overall?.low_stock || 0}</div>
            <div style={styles.statLabel}>Low Stock</div>
          </div>
        </div>

        {/* Sync Stats */}
        <div style={styles.card}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
            <h3 style={{ ...styles.cardTitle, margin: 0 }}>Sync Status</h3>
            <button
              onClick={() => handleExport('inventory')}
              disabled={exporting}
              style={{ ...styles.exportButton, opacity: exporting ? 0.6 : 1, cursor: exporting ? 'not-allowed' : 'pointer' }}
            >
              {exporting ? 'Exporting...' : 'Export CSV'}
            </button>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '16px' }}>
            <div style={{ background: '#dcfce7', padding: '16px', borderRadius: '8px', textAlign: 'center' }}>
              <div style={{ fontSize: '24px', fontWeight: 'bold', color: '#166534' }}>{inventoryData.overall?.synced || 0}</div>
              <div style={{ color: '#166534' }}>Synced Products</div>
            </div>
            <div style={{ background: '#fef3c7', padding: '16px', borderRadius: '8px', textAlign: 'center' }}>
              <div style={{ fontSize: '24px', fontWeight: 'bold', color: '#92400e' }}>{inventoryData.overall?.never_synced || 0}</div>
              <div style={{ color: '#92400e' }}>Never Synced</div>
            </div>
            <div style={{ background: '#dbeafe', padding: '16px', borderRadius: '8px', textAlign: 'center' }}>
              <div style={{ fontSize: '24px', fontWeight: 'bold', color: '#1e40af' }}>{inventoryData.recent_sync?.count || 0}</div>
              <div style={{ color: '#1e40af' }}>Synced (24h)</div>
            </div>
          </div>
        </div>

        {/* Inventory by Category */}
        <div style={styles.card}>
          <h3 style={styles.cardTitle}>Inventory by Category</h3>
          {inventoryData.by_category && inventoryData.by_category.length > 0 ? (
            <div style={{ overflowX: 'auto' }}>
              <table style={styles.table}>
                <thead>
                  <tr>
                    <th style={styles.th}>Category</th>
                    <th style={styles.th}>Products</th>
                    <th style={styles.th}>Total Stock</th>
                    <th style={styles.th}>Out of Stock</th>
                    <th style={styles.th}>Low Stock</th>
                  </tr>
                </thead>
                <tbody>
                  {inventoryData.by_category.map((cat, i) => (
                    <tr key={i}>
                      <td style={styles.td}>{cat.category_name}</td>
                      <td style={styles.td}>{cat.product_count}</td>
                      <td style={styles.td}>{cat.total_stock}</td>
                      <td style={{ ...styles.td, color: parseInt(cat.out_of_stock_count) > 0 ? '#ef4444' : '#6b7280' }}>
                        {cat.out_of_stock_count}
                      </td>
                      <td style={{ ...styles.td, color: parseInt(cat.low_stock_count) > 0 ? '#f59e0b' : '#6b7280' }}>
                        {cat.low_stock_count}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <div style={{ textAlign: 'center', padding: '40px', color: '#9ca3af' }}>No category data</div>
          )}
        </div>

        {/* Sync History */}
        <div style={styles.card}>
          <h3 style={styles.cardTitle}>Sync History (Last 30)</h3>
          {inventoryData.sync_history && inventoryData.sync_history.length > 0 ? (
            <div style={{ overflowX: 'auto', maxHeight: '400px' }}>
              <table style={styles.table}>
                <thead style={{ position: 'sticky', top: 0, background: 'white' }}>
                  <tr>
                    <th style={styles.th}>Date</th>
                    <th style={styles.th}>Status</th>
                    <th style={styles.th}>Checked</th>
                    <th style={styles.th}>Synced</th>
                    <th style={styles.th}>Failed</th>
                    <th style={styles.th}>Duration</th>
                  </tr>
                </thead>
                <tbody>
                  {inventoryData.sync_history.map((sync, i) => (
                    <tr key={i}>
                      <td style={styles.td}>{formatDate(sync.started_at)}</td>
                      <td style={styles.td}>
                        <span style={styles.badge(sync.status === 'completed' ? '#10b981' : '#f59e0b')}>
                          {sync.status}
                        </span>
                      </td>
                      <td style={styles.td}>{sync.products_checked || 0}</td>
                      <td style={styles.td}>{sync.products_synced || 0}</td>
                      <td style={{ ...styles.td, color: sync.products_failed > 0 ? '#ef4444' : '#6b7280' }}>
                        {sync.products_failed || 0}
                      </td>
                      <td style={styles.td}>{sync.duration_seconds ? `${parseFloat(sync.duration_seconds).toFixed(1)}s` : '-'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <div style={{ textAlign: 'center', padding: '40px', color: '#9ca3af' }}>No sync history</div>
          )}
        </div>

        {/* Never Synced Products */}
        {inventoryData.never_synced && inventoryData.never_synced.length > 0 && (
          <div style={styles.card}>
            <h3 style={styles.cardTitle}>Products Never Synced (First 50)</h3>
            <div style={{ overflowX: 'auto', maxHeight: '300px' }}>
              <table style={styles.table}>
                <thead style={{ position: 'sticky', top: 0, background: 'white' }}>
                  <tr>
                    <th style={styles.th}>Product</th>
                    <th style={styles.th}>Manufacturer</th>
                    <th style={styles.th}>Stock</th>
                    <th style={styles.th}>Price</th>
                  </tr>
                </thead>
                <tbody>
                  {inventoryData.never_synced.map((product, i) => (
                    <tr key={i}>
                      <td style={styles.td}>{product.name}</td>
                      <td style={styles.td}>{product.manufacturer || '-'}</td>
                      <td style={styles.td}>{product.stock_quantity}</td>
                      <td style={styles.td}>${parseFloat(product.price || 0).toFixed(2)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </>
    );
  };

  // Profit Report View
  const renderProfitReport = () => {
    if (loading) return <div style={styles.loading}>Loading profit report...</div>;
    if (!profitData) return <div style={styles.loading}>No profit data available</div>;

    return (
      <>
        {/* Overall Profit Stats */}
        <div style={styles.statGrid}>
          <div style={styles.statCard('#3b82f6')}>
            <div style={styles.statValue}>{formatCurrency(profitData.overall?.total_revenue_cents)}</div>
            <div style={styles.statLabel}>Total Revenue</div>
          </div>
          <div style={styles.statCard('#ef4444')}>
            <div style={styles.statValue}>{formatCurrency(profitData.overall?.total_cost_cents)}</div>
            <div style={styles.statLabel}>Total Cost</div>
          </div>
          <div style={styles.statCard('#10b981')}>
            <div style={styles.statValue}>{formatCurrency(profitData.overall?.total_profit_cents)}</div>
            <div style={styles.statLabel}>Total Profit</div>
          </div>
          <div style={styles.statCard('#8b5cf6')}>
            <div style={styles.statValue}>{formatPercent(profitData.overall?.overall_margin_percent)}</div>
            <div style={styles.statLabel}>Overall Margin</div>
          </div>
        </div>

        {/* Export Button */}
        <div style={{ marginBottom: '20px' }}>
          <button
            onClick={() => handleExport('profit')}
            disabled={exporting}
            style={{ ...styles.exportButton, opacity: exporting ? 0.6 : 1, cursor: exporting ? 'not-allowed' : 'pointer' }}
          >
            {exporting ? 'Exporting...' : 'Export Profit Report CSV'}
          </button>
        </div>

        {/* Alerts Section */}
        {(profitData.unprofitable?.length > 0 || profitData.low_margin_alerts?.length > 0) && (
          <div style={styles.card}>
            <h3 style={styles.cardTitle}>Margin Alerts</h3>

            {profitData.unprofitable?.length > 0 && (
              <div style={{ marginBottom: '20px' }}>
                <div style={styles.alert('error')}>
                  <strong>{profitData.unprofitable.length} products are selling at a loss!</strong>
                </div>
                <div style={{ overflowX: 'auto', maxHeight: '200px' }}>
                  <table style={styles.table}>
                    <thead>
                      <tr>
                        <th style={styles.th}>Product</th>
                        <th style={styles.th}>Units Sold</th>
                        <th style={styles.th}>Revenue</th>
                        <th style={styles.th}>Cost</th>
                        <th style={{ ...styles.th, textAlign: 'right' }}>Loss</th>
                      </tr>
                    </thead>
                    <tbody>
                      {profitData.unprofitable.map((product, i) => (
                        <tr key={i}>
                          <td style={styles.td}>{product.product_name || 'Unknown'}</td>
                          <td style={styles.td}>{product.units_sold}</td>
                          <td style={styles.td}>{formatCurrency(product.revenue_cents)}</td>
                          <td style={styles.td}>{formatCurrency(product.cost_cents)}</td>
                          <td style={{ ...styles.td, textAlign: 'right', color: '#ef4444', fontWeight: '600' }}>
                            {formatCurrency(product.profit_cents)}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {profitData.low_margin_alerts?.length > 0 && (
              <div>
                <div style={styles.alert('warning')}>
                  <strong>{profitData.low_margin_alerts.length} products have margins below 15%</strong>
                </div>
                <div style={{ overflowX: 'auto', maxHeight: '200px' }}>
                  <table style={styles.table}>
                    <thead>
                      <tr>
                        <th style={styles.th}>Product</th>
                        <th style={styles.th}>Units Sold</th>
                        <th style={styles.th}>Revenue</th>
                        <th style={styles.th}>Profit</th>
                        <th style={{ ...styles.th, textAlign: 'right' }}>Margin</th>
                      </tr>
                    </thead>
                    <tbody>
                      {profitData.low_margin_alerts.map((product, i) => (
                        <tr key={i}>
                          <td style={styles.td}>{product.product_name || 'Unknown'}</td>
                          <td style={styles.td}>{product.units_sold}</td>
                          <td style={styles.td}>{formatCurrency(product.revenue_cents)}</td>
                          <td style={styles.td}>{formatCurrency(product.profit_cents)}</td>
                          <td style={{ ...styles.td, textAlign: 'right', color: '#f59e0b', fontWeight: '600' }}>
                            {formatPercent(product.margin_percent)}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </div>
        )}

        {/* Margin by Category */}
        <div style={styles.card}>
          <h3 style={styles.cardTitle}>Profit by Category</h3>
          {profitData.by_category && profitData.by_category.length > 0 ? (
            <div style={{ overflowX: 'auto' }}>
              <table style={styles.table}>
                <thead>
                  <tr>
                    <th style={styles.th}>Category</th>
                    <th style={styles.th}>Orders</th>
                    <th style={styles.th}>Revenue</th>
                    <th style={styles.th}>Cost</th>
                    <th style={styles.th}>Profit</th>
                    <th style={{ ...styles.th, textAlign: 'right' }}>Margin</th>
                  </tr>
                </thead>
                <tbody>
                  {profitData.by_category.map((cat, i) => (
                    <tr key={i}>
                      <td style={styles.td}>{cat.category_name}</td>
                      <td style={styles.td}>{cat.order_count}</td>
                      <td style={styles.td}>{formatCurrency(cat.revenue_cents)}</td>
                      <td style={styles.td}>{formatCurrency(cat.cost_cents)}</td>
                      <td style={{ ...styles.td, color: cat.profit_cents < 0 ? '#ef4444' : '#10b981', fontWeight: '600' }}>
                        {formatCurrency(cat.profit_cents)}
                      </td>
                      <td style={{ ...styles.td, textAlign: 'right', fontWeight: '600' }}>
                        {formatPercent(cat.margin_percent)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <div style={{ textAlign: 'center', padding: '40px', color: '#9ca3af' }}>No category data</div>
          )}
        </div>

        {/* Top Profitable Products */}
        <div style={styles.card}>
          <h3 style={styles.cardTitle}>Top 20 Most Profitable Products</h3>
          {profitData.top_products && profitData.top_products.length > 0 ? (
            <div style={{ overflowX: 'auto' }}>
              <table style={styles.table}>
                <thead>
                  <tr>
                    <th style={styles.th}>Product</th>
                    <th style={styles.th}>Manufacturer</th>
                    <th style={styles.th}>Units</th>
                    <th style={styles.th}>Revenue</th>
                    <th style={styles.th}>Profit</th>
                    <th style={{ ...styles.th, textAlign: 'right' }}>Margin</th>
                  </tr>
                </thead>
                <tbody>
                  {profitData.top_products.map((product, i) => (
                    <tr key={i}>
                      <td style={styles.td}>{product.product_name || 'Unknown'}</td>
                      <td style={styles.td}>{product.manufacturer || '-'}</td>
                      <td style={styles.td}>{product.units_sold}</td>
                      <td style={styles.td}>{formatCurrency(product.revenue_cents)}</td>
                      <td style={{ ...styles.td, color: '#10b981', fontWeight: '600' }}>{formatCurrency(product.profit_cents)}</td>
                      <td style={{ ...styles.td, textAlign: 'right', fontWeight: '600' }}>{formatPercent(product.margin_percent)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <div style={{ textAlign: 'center', padding: '40px', color: '#9ca3af' }}>No product data</div>
          )}
        </div>
      </>
    );
  };

  // Customer Report View
  const renderCustomerReport = () => {
    if (loading) return <div style={styles.loading}>Loading customer report...</div>;
    if (!customerData) return <div style={styles.loading}>No customer data available</div>;

    const newCustomers = customerData.customer_types?.find(ct => ct.customer_type === 'new') || {};
    const returningCustomers = customerData.customer_types?.find(ct => ct.customer_type === 'returning') || {};

    return (
      <>
        {/* New vs Returning */}
        <div style={styles.statGrid}>
          <div style={styles.statCard('#10b981')}>
            <div style={styles.statValue}>{newCustomers.customer_count || 0}</div>
            <div style={styles.statLabel}>New Customers</div>
            <div style={{ fontSize: '12px', color: '#6b7280', marginTop: '4px' }}>
              {newCustomers.order_count || 0} orders, {formatCurrency(newCustomers.revenue_cents)}
            </div>
          </div>
          <div style={styles.statCard('#3b82f6')}>
            <div style={styles.statValue}>{returningCustomers.customer_count || 0}</div>
            <div style={styles.statLabel}>Returning Customers</div>
            <div style={{ fontSize: '12px', color: '#6b7280', marginTop: '4px' }}>
              {returningCustomers.order_count || 0} orders, {formatCurrency(returningCustomers.revenue_cents)}
            </div>
          </div>
          <div style={styles.statCard('#8b5cf6')}>
            <div style={styles.statValue}>
              {((newCustomers.customer_count || 0) + (returningCustomers.customer_count || 0))}
            </div>
            <div style={styles.statLabel}>Total Customers</div>
          </div>
          <div style={styles.statCard('#f59e0b')}>
            <div style={styles.statValue}>
              {formatCurrency(((newCustomers.revenue_cents || 0) + (returningCustomers.revenue_cents || 0)) /
                Math.max((newCustomers.customer_count || 0) + (returningCustomers.customer_count || 0), 1))}
            </div>
            <div style={styles.statLabel}>Avg Revenue/Customer</div>
          </div>
        </div>

        {/* Top Customers */}
        <div style={styles.card}>
          <h3 style={styles.cardTitle}>Top 20 Customers by Revenue</h3>
          {customerData.top_customers && customerData.top_customers.length > 0 ? (
            <div style={{ overflowX: 'auto' }}>
              <table style={styles.table}>
                <thead>
                  <tr>
                    <th style={styles.th}>Customer</th>
                    <th style={styles.th}>Email</th>
                    <th style={styles.th}>Orders</th>
                    <th style={styles.th}>Avg Order</th>
                    <th style={styles.th}>First Order</th>
                    <th style={{ ...styles.th, textAlign: 'right' }}>Total Revenue</th>
                  </tr>
                </thead>
                <tbody>
                  {customerData.top_customers.map((customer, i) => (
                    <tr key={i}>
                      <td style={styles.td}>{customer.customer_name || 'Unknown'}</td>
                      <td style={styles.td}>{customer.customer_email}</td>
                      <td style={styles.td}>{customer.order_count}</td>
                      <td style={styles.td}>{formatCurrency(customer.avg_order_value_cents)}</td>
                      <td style={styles.td}>{formatDate(customer.first_order)}</td>
                      <td style={{ ...styles.td, textAlign: 'right', fontWeight: '600' }}>{formatCurrency(customer.total_revenue_cents)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <div style={{ textAlign: 'center', padding: '40px', color: '#9ca3af' }}>No customer data</div>
          )}
        </div>

        {/* Geographic Distribution */}
        <div style={styles.card}>
          <h3 style={styles.cardTitle}>Orders by Region</h3>
          {customerData.geographic && customerData.geographic.length > 0 ? (
            <div style={{ overflowX: 'auto' }}>
              <table style={styles.table}>
                <thead>
                  <tr>
                    <th style={styles.th}>Region/Province</th>
                    <th style={styles.th}>Orders</th>
                    <th style={{ ...styles.th, textAlign: 'right' }}>Revenue</th>
                  </tr>
                </thead>
                <tbody>
                  {customerData.geographic.map((region, i) => (
                    <tr key={i}>
                      <td style={styles.td}>{region.region}</td>
                      <td style={styles.td}>{region.order_count}</td>
                      <td style={{ ...styles.td, textAlign: 'right', fontWeight: '600' }}>{formatCurrency(region.revenue_cents)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <div style={{ textAlign: 'center', padding: '40px', color: '#9ca3af' }}>No geographic data</div>
          )}
        </div>

        {/* Customer Match Stats */}
        {customerData.match_stats && customerData.match_stats.length > 0 && (
          <div style={styles.card}>
            <h3 style={styles.cardTitle}>Customer Matching Status</h3>
            <div style={{ display: 'flex', gap: '16px', flexWrap: 'wrap' }}>
              {customerData.match_stats.map((stat, i) => (
                <div key={i} style={{ background: '#f3f4f6', padding: '16px 24px', borderRadius: '8px', textAlign: 'center' }}>
                  <div style={{ fontSize: '24px', fontWeight: 'bold', color: '#374151' }}>{stat.count}</div>
                  <div style={{ color: '#6b7280', fontSize: '13px' }}>{stat.customer_match_type || 'unmatched'}</div>
                </div>
              ))}
            </div>
          </div>
        )}
      </>
    );
  };

  // Order Report View
  const renderOrderReport = () => {
    if (loading) return <div style={styles.loading}>Loading order report...</div>;
    if (!orderData) return <div style={styles.loading}>No order data available</div>;

    return (
      <>
        {/* Orders by Status */}
        <div style={styles.card}>
          <h3 style={styles.cardTitle}>Orders by Status</h3>
          <div style={{ display: 'flex', gap: '16px', flexWrap: 'wrap', marginBottom: '20px' }}>
            {orderData.by_status && orderData.by_status.map((status, i) => (
              <div key={i} style={{
                background: status.order_state === 'SHIPPED' ? '#dcfce7' :
                           status.order_state === 'WAITING_ACCEPTANCE' ? '#fef3c7' : '#f3f4f6',
                padding: '16px 24px',
                borderRadius: '8px',
                textAlign: 'center',
                minWidth: '120px'
              }}>
                <div style={{ fontSize: '24px', fontWeight: 'bold', color: '#374151' }}>{status.count}</div>
                <div style={{ color: '#6b7280', fontSize: '12px' }}>{status.order_state}</div>
                <div style={{ color: '#9ca3af', fontSize: '11px', marginTop: '4px' }}>{formatCurrency(status.total_revenue_cents)}</div>
              </div>
            ))}
          </div>
        </div>

        {/* Orders List */}
        <div style={styles.card}>
          <h3 style={styles.cardTitle}>Orders ({orderData.total} total)</h3>
          {orderData.orders && orderData.orders.length > 0 ? (
            <div style={{ overflowX: 'auto', maxHeight: '500px' }}>
              <table style={styles.table}>
                <thead style={{ position: 'sticky', top: 0, background: 'white' }}>
                  <tr>
                    <th style={styles.th}>Order ID</th>
                    <th style={styles.th}>Date</th>
                    <th style={styles.th}>Customer</th>
                    <th style={styles.th}>Items</th>
                    <th style={styles.th}>Status</th>
                    <th style={{ ...styles.th, textAlign: 'right' }}>Total</th>
                  </tr>
                </thead>
                <tbody>
                  {orderData.orders.map((order, i) => (
                    <tr key={i}>
                      <td style={styles.td}>{order.marketplace_order_id}</td>
                      <td style={styles.td}>{formatDate(order.order_date)}</td>
                      <td style={styles.td}>
                        {order.customer_name || order.customer_email || 'Unknown'}
                        {order.customer_id && <span style={styles.badge('#10b981')}> Linked</span>}
                      </td>
                      <td style={styles.td}>{order.item_count}</td>
                      <td style={styles.td}>
                        <span style={styles.badge(
                          order.order_state === 'SHIPPED' ? '#10b981' :
                          order.order_state === 'WAITING_ACCEPTANCE' ? '#f59e0b' : '#6b7280'
                        )}>
                          {order.order_state}
                        </span>
                      </td>
                      <td style={{ ...styles.td, textAlign: 'right', fontWeight: '600' }}>{formatCurrency(order.total_price_cents)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <div style={{ textAlign: 'center', padding: '40px', color: '#9ca3af' }}>No orders found</div>
          )}
        </div>
      </>
    );
  };

  return (
    <div style={styles.container}>
      {/* Header */}
      <div style={styles.header}>
        <h1 style={styles.title}>Marketplace Reports</h1>
        <p style={styles.subtitle}>Comprehensive analytics for your Best Buy marketplace</p>
      </div>

      {/* Navigation */}
      <div style={styles.nav}>
        <button style={styles.navButton(activeReport === 'dashboard')} onClick={() => setActiveReport('dashboard')}>
          Dashboard
        </button>
        <button style={styles.navButton(activeReport === 'sales')} onClick={() => setActiveReport('sales')}>
          Sales Report
        </button>
        <button style={styles.navButton(activeReport === 'inventory')} onClick={() => setActiveReport('inventory')}>
          Inventory Report
        </button>
        <button style={styles.navButton(activeReport === 'profit')} onClick={() => setActiveReport('profit')}>
          Profit & Margin
        </button>
        <button style={styles.navButton(activeReport === 'customers')} onClick={() => setActiveReport('customers')}>
          Customer Report
        </button>
        <button style={styles.navButton(activeReport === 'orders')} onClick={() => setActiveReport('orders')}>
          Order Report
        </button>
      </div>

      {/* Export Status Messages */}
      {exportError && (
        <div style={{
          background: '#fee2e2',
          border: '1px solid #ef4444',
          borderRadius: '8px',
          padding: '12px 16px',
          marginBottom: '16px',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center'
        }}>
          <span style={{ color: '#dc2626', fontWeight: '500' }}>Export Error: {exportError}</span>
          <button
            onClick={() => setExportError(null)}
            style={{ background: 'none', border: 'none', color: '#dc2626', cursor: 'pointer', fontSize: '18px' }}
          >
            ×
          </button>
        </div>
      )}
      {exporting && (
        <div style={{
          background: '#dbeafe',
          border: '1px solid #3b82f6',
          borderRadius: '8px',
          padding: '12px 16px',
          marginBottom: '16px',
          color: '#1e40af',
          fontWeight: '500'
        }}>
          Generating export... Please wait.
        </div>
      )}

      {/* Date Filter (not shown for dashboard and inventory) */}
      {!['dashboard', 'inventory'].includes(activeReport) && (
        <div style={styles.dateFilter}>
          <span style={{ fontWeight: '600', color: '#374151' }}>Date Range:</span>
          <button style={styles.dateButton(dateRange === 'today')} onClick={() => setDateRange('today')}>Today</button>
          <button style={styles.dateButton(dateRange === 'week')} onClick={() => setDateRange('week')}>Last 7 Days</button>
          <button style={styles.dateButton(dateRange === 'month')} onClick={() => setDateRange('month')}>Last 30 Days</button>
          <button style={styles.dateButton(dateRange === 'quarter')} onClick={() => setDateRange('quarter')}>Last 90 Days</button>
          <button style={styles.dateButton(dateRange === 'year')} onClick={() => setDateRange('year')}>Last Year</button>
          <button style={styles.dateButton(dateRange === 'custom')} onClick={() => setDateRange('custom')}>Custom</button>

          {dateRange === 'custom' && (
            <>
              <input
                type="date"
                value={customStartDate}
                onChange={(e) => setCustomStartDate(e.target.value)}
                style={styles.dateInput}
              />
              <span>to</span>
              <input
                type="date"
                value={customEndDate}
                onChange={(e) => setCustomEndDate(e.target.value)}
                style={styles.dateInput}
              />
            </>
          )}
        </div>
      )}

      {/* Error Display */}
      {error && (
        <div style={styles.alert('error')}>
          Error: {error}
          <button onClick={() => setError(null)} style={{ marginLeft: '16px', background: 'none', border: 'none', cursor: 'pointer' }}>Dismiss</button>
        </div>
      )}

      {/* Report Content */}
      {activeReport === 'dashboard' && renderDashboard()}
      {activeReport === 'sales' && renderSalesReport()}
      {activeReport === 'inventory' && renderInventoryReport()}
      {activeReport === 'profit' && renderProfitReport()}
      {activeReport === 'customers' && renderCustomerReport()}
      {activeReport === 'orders' && renderOrderReport()}
    </div>
  );
}

export default MarketplaceReports;
