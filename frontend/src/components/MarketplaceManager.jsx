import React, { useState, useEffect, useRef, useCallback } from 'react';
import axios from 'axios';
import ProductMappingTool from './ProductMappingTool';
import { handleApiError } from '../utils/errorHandler';

/**
 * Enhanced Marketplace Manager Dashboard
 * Features: Notifications, Batch Processing, Auto-Rules, Order Management
 */

const MarketplaceManager = () => {
  // Core state
  const [activeSection, setActiveSection] = useState('dashboard');
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [pulling, setPulling] = useState(false);
  const [message, setMessage] = useState(null);
  const [error, setError] = useState(null);

  // Analytics data
  const [analytics, setAnalytics] = useState(null);
  const [salesChart, setSalesChart] = useState([]);
  const [topProducts, setTopProducts] = useState([]);
  const [salesByCategory, setSalesByCategory] = useState([]);
  const [inventoryHealth, setInventoryHealth] = useState(null);
  const [activityFeed, setActivityFeed] = useState([]);
  const [ordersByState, setOrdersByState] = useState([]);

  // Orders state
  const [orders, setOrders] = useState([]);
  const [selectedOrders, setSelectedOrders] = useState([]);
  const [orderDetailId, setOrderDetailId] = useState(null);
  const [orderDetail, setOrderDetail] = useState(null);
  const [batchProcessing, setBatchProcessing] = useState(false);
  const [rejectReason, setRejectReason] = useState('Out of stock');
  const [showRejectModal, setShowRejectModal] = useState(false);

  // Notifications state
  const [notifications, setNotifications] = useState([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [showNotifications, setShowNotifications] = useState(false);
  const [notificationSound, setNotificationSound] = useState(true);

  // Auto-rules state
  const [autoRules, setAutoRules] = useState([]);
  const [showRuleModal, setShowRuleModal] = useState(false);
  const [editingRule, setEditingRule] = useState(null);

  // Settings state
  const [settings, setSettings] = useState({});

  // Inventory Sync & Pricing state
  const [syncSettings, setSyncSettings] = useState({});
  const [syncHistory, setSyncHistory] = useState([]);
  const [priceRules, setPriceRules] = useState([]);
  const [pricePreviews, setPricePreviews] = useState([]);
  const [inventoryProducts, setInventoryProducts] = useState([]);
  const [globalBuffer, setGlobalBuffer] = useState(0);
  const [showPriceRuleModal, setShowPriceRuleModal] = useState(false);
  const [editingPriceRule, setEditingPriceRule] = useState(null);
  const [inventorySyncing, setInventorySyncing] = useState(false);
  const [inventoryPage, setInventoryPage] = useState(1);
  const [inventoryTotal, setInventoryTotal] = useState(0);
  const [inventorySearch, setInventorySearch] = useState('');
  const [selectedInventoryProducts, setSelectedInventoryProducts] = useState([]);
  const [bulkBufferValue, setBulkBufferValue] = useState('');

  // Anti-flickering refs
  const isMounted = useRef(true);
  const loadedOnce = useRef(false);
  const notificationCheckInterval = useRef(null);

  const API_BASE_URL = process.env.REACT_APP_API_URL || 'http://localhost:3001';

  // Fetch all dashboard data
  const fetchDashboardData = useCallback(async () => {
    if (!isMounted.current) return;

    try {
      setLoading(true);

      const [
        analyticsRes,
        salesChartRes,
        topProductsRes,
        salesByCategoryRes,
        inventoryHealthRes,
        activityFeedRes,
        ordersByStateRes
      ] = await Promise.all([
        axios.get(`${API_BASE_URL}/api/marketplace/dashboard-analytics`).catch(() => ({ data: null })),
        axios.get(`${API_BASE_URL}/api/marketplace/sales-chart`).catch(() => ({ data: [] })),
        axios.get(`${API_BASE_URL}/api/marketplace/top-products`).catch(() => ({ data: [] })),
        axios.get(`${API_BASE_URL}/api/marketplace/sales-by-category`).catch(() => ({ data: [] })),
        axios.get(`${API_BASE_URL}/api/marketplace/inventory-health`).catch(() => ({ data: null })),
        axios.get(`${API_BASE_URL}/api/marketplace/activity-feed`).catch(() => ({ data: [] })),
        axios.get(`${API_BASE_URL}/api/marketplace/orders-by-state`).catch(() => ({ data: [] }))
      ]);

      if (!isMounted.current) return;

      setAnalytics(analyticsRes.data);
      setSalesChart(salesChartRes.data || []);
      setTopProducts(topProductsRes.data || []);
      setSalesByCategory(salesByCategoryRes.data || []);
      setInventoryHealth(inventoryHealthRes.data);
      setActivityFeed(activityFeedRes.data || []);
      setOrdersByState(ordersByStateRes.data || []);
      setError(null);
    } catch (err) {
      if (!isMounted.current) return;
      setError('Failed to fetch dashboard data: ' + (err.response?.data?.error || err.message));
    } finally {
      if (isMounted.current) {
        setLoading(false);
      }
    }
  }, [API_BASE_URL]);

  // Fetch orders
  const fetchOrders = useCallback(async () => {
    try {
      const response = await axios.get(`${API_BASE_URL}/api/marketplace/orders`);
      if (response.data) {
        setOrders(Array.isArray(response.data) ? response.data : response.data.orders || []);
      }
    } catch (err) {
      handleApiError(err, { context: 'Loading orders', silent: true });
    }
  }, [API_BASE_URL]);

  // Fetch notifications
  const fetchNotifications = useCallback(async () => {
    try {
      const response = await axios.get(`${API_BASE_URL}/api/marketplace/notifications`);
      if (response.data) {
        setNotifications(response.data.notifications || []);
        const newUnread = response.data.unread_count || 0;

        // Play sound if new notifications (and sound enabled)
        if (newUnread > unreadCount && notificationSound && unreadCount > 0) {
          playNotificationSound();
        }
        setUnreadCount(newUnread);
      }
    } catch (err) {
      handleApiError(err, { context: 'Loading notifications', silent: true });
    }
  }, [API_BASE_URL, unreadCount, notificationSound]);

  // Fetch auto-rules
  const fetchAutoRules = useCallback(async () => {
    try {
      const response = await axios.get(`${API_BASE_URL}/api/marketplace/auto-rules`);
      setAutoRules(response.data || []);
    } catch (err) {
      handleApiError(err, { context: 'Loading auto-rules', silent: true });
    }
  }, [API_BASE_URL]);

  // Fetch settings
  const fetchSettings = useCallback(async () => {
    try {
      const response = await axios.get(`${API_BASE_URL}/api/marketplace/order-settings`);
      setSettings(response.data || {});
      if (response.data?.notification_sound) {
        setNotificationSound(response.data.notification_sound.enabled);
      }
    } catch (err) {
      handleApiError(err, { context: 'Loading settings', silent: true });
    }
  }, [API_BASE_URL]);

  // Fetch sync settings
  const fetchSyncSettings = useCallback(async () => {
    try {
      const response = await axios.get(`${API_BASE_URL}/api/marketplace/sync-settings`);
      setSyncSettings(response.data || {});
      if (response.data?.global_stock_buffer) {
        setGlobalBuffer(response.data.global_stock_buffer.value || 0);
      }
    } catch (err) {
      handleApiError(err, { context: 'Loading sync settings', silent: true });
    }
  }, [API_BASE_URL]);

  // Fetch sync history
  const fetchSyncHistory = useCallback(async () => {
    try {
      const response = await axios.get(`${API_BASE_URL}/api/marketplace/sync-history?limit=10`);
      setSyncHistory(response.data || []);
    } catch (err) {
      handleApiError(err, { context: 'Loading sync history', silent: true });
    }
  }, [API_BASE_URL]);

  // Fetch price rules
  const fetchPriceRules = useCallback(async () => {
    try {
      const response = await axios.get(`${API_BASE_URL}/api/marketplace/price-rules`);
      setPriceRules(response.data || []);
    } catch (err) {
      handleApiError(err, { context: 'Loading price rules', silent: true });
    }
  }, [API_BASE_URL]);

  // Fetch price previews
  const fetchPricePreviews = useCallback(async () => {
    try {
      const response = await axios.get(`${API_BASE_URL}/api/marketplace/preview-prices?limit=20`);
      setPricePreviews(response.data?.previews || []);
    } catch (err) {
      handleApiError(err, { context: 'Loading price previews', silent: true });
    }
  }, [API_BASE_URL]);

  // Fetch inventory products
  const fetchInventoryProducts = useCallback(async (page = 1, search = '') => {
    try {
      const response = await axios.get(`${API_BASE_URL}/api/marketplace/inventory-products`, {
        params: { page, limit: 25, search }
      });
      setInventoryProducts(response.data?.products || []);
      setInventoryTotal(response.data?.total || 0);
      setGlobalBuffer(response.data?.global_buffer || 0);
    } catch (err) {
      handleApiError(err, { context: 'Loading inventory', silent: true });
    }
  }, [API_BASE_URL]);

  // Play notification sound
  const playNotificationSound = () => {
    try {
      const audio = new Audio('data:audio/wav;base64,UklGRnoGAABXQVZFZm10IBAAAAABAAEAQB8AAEAfAAABAAgAZGF0YQoGAACBhYqFbF1fdJivrJBhNjVgodDbq2EcBj+a2teleif////+//79+/r5+fr6+/r5+fr6+/v6+fn4+Pn6+vr5+Pf39/f4+fr6+fn39/b29vf4+fn5+Pf29fX19vf4+Pj39vX09PT19vf39/b19PPz8/T19vb29fTz8vLy8/T19fX08/Lx8fHy8/T09PTz8vHw8PDx8vPz8/Py8fDv7+/w8fLy8vLx8O/u7u7v8PHx8fHw7+7t7e3u7/Dw8PDv7u3s7Ozs7e7v7+/u7ezr6+vr7O3u7u7t7Ovq6urq6+zt7e3s6+rp6enp6uvs7Ozr6unp6Ojo6erq6+vr6uno6Ofn5+jp6urq6ejn5ubm5+jp6enp6Ofm5eXl5ufo6Ojo5+bl5OTk5ebn5+fn5uXk4+Pj5OXm5ubm5eTj4uLi4+Tl5eXl5OPi4eHh4uPk5OTk4+Li4eDg4OHi4+Pj4+Li4d/f3+Dh4uLi4uHg39/e3t7f4OHh4eHg39/e3d3d3t/g4ODg397e3dzc3N3e39/f397d3Nzb29vc3d7e3t7d3Nzb2tra29zd3d3d3Nzb2tra2trc3d3d');
      audio.volume = 0.5;
      audio.play().catch(() => {});
    } catch (err) {
      console.error('Could not play notification sound');
    }
  };

  // Request browser notification permission
  const requestNotificationPermission = async () => {
    if ('Notification' in window && Notification.permission === 'default') {
      await Notification.requestPermission();
    }
  };

  useEffect(() => {
    isMounted.current = true;

    if (!loadedOnce.current) {
      loadedOnce.current = true;
      fetchDashboardData();
      fetchNotifications();
      fetchSettings();
      requestNotificationPermission();
    }

    // Set up notification polling
    notificationCheckInterval.current = setInterval(() => {
      fetchNotifications();
    }, 60000); // Check every minute

    return () => {
      isMounted.current = false;
      if (notificationCheckInterval.current) {
        clearInterval(notificationCheckInterval.current);
      }
    };
  }, [fetchDashboardData, fetchNotifications, fetchSettings]);

  // Handlers
  const handleSyncInventory = async () => {
    try {
      setSyncing(true);
      setMessage(null);
      setError(null);

      const response = await axios.post(`${API_BASE_URL}/api/marketplace/sync-offers`);

      if (response.data.success) {
        setMessage(`Successfully synced ${response.data.synced} products to marketplace`);
        fetchDashboardData();
      } else {
        setError('Sync completed with issues');
      }
    } catch (err) {
      setError('Failed to sync inventory: ' + (err.response?.data?.error || err.message));
    } finally {
      setSyncing(false);
    }
  };

  const handlePullOrders = async () => {
    try {
      setPulling(true);
      setMessage(null);
      setError(null);

      const response = await axios.get(`${API_BASE_URL}/api/marketplace/pull-orders`);

      if (response.data.success) {
        setMessage(`Successfully imported ${response.data.imported} orders from marketplace`);
        fetchDashboardData();
        fetchOrders();
        fetchNotifications();
      } else {
        setError('Order pull completed with issues');
      }
    } catch (err) {
      setError('Failed to pull orders: ' + (err.response?.data?.error || err.message));
    } finally {
      setPulling(false);
    }
  };

  // Batch order operations
  const handleSelectOrder = (orderId) => {
    setSelectedOrders(prev =>
      prev.includes(orderId)
        ? prev.filter(id => id !== orderId)
        : [...prev, orderId]
    );
  };

  const handleSelectAllOrders = () => {
    const waitingOrders = orders.filter(o => o.order_state === 'WAITING_ACCEPTANCE');
    if (selectedOrders.length === waitingOrders.length) {
      setSelectedOrders([]);
    } else {
      setSelectedOrders(waitingOrders.map(o => o.id));
    }
  };

  const handleBatchAccept = async () => {
    if (selectedOrders.length === 0) return;

    try {
      setBatchProcessing(true);
      setMessage(null);
      setError(null);

      const response = await axios.post(`${API_BASE_URL}/api/marketplace/orders/batch-accept`, {
        order_ids: selectedOrders
      });

      if (response.data.success) {
        setMessage(`Accepted ${response.data.accepted} orders. ${response.data.failed} failed.`);
        setSelectedOrders([]);
        fetchOrders();
        fetchNotifications();
      }
    } catch (err) {
      setError('Failed to batch accept orders: ' + (err.response?.data?.error || err.message));
    } finally {
      setBatchProcessing(false);
    }
  };

  const handleBatchReject = async () => {
    if (selectedOrders.length === 0) return;

    try {
      setBatchProcessing(true);
      setMessage(null);
      setError(null);

      const response = await axios.post(`${API_BASE_URL}/api/marketplace/orders/batch-reject`, {
        order_ids: selectedOrders,
        reason: rejectReason
      });

      if (response.data.success) {
        setMessage(`Rejected ${response.data.rejected} orders. ${response.data.failed} failed.`);
        setSelectedOrders([]);
        setShowRejectModal(false);
        fetchOrders();
        fetchNotifications();
      }
    } catch (err) {
      setError('Failed to batch reject orders: ' + (err.response?.data?.error || err.message));
    } finally {
      setBatchProcessing(false);
    }
  };

  const handleExportOrders = async (format = 'csv') => {
    try {
      const response = await axios.post(`${API_BASE_URL}/api/marketplace/orders/export`, {
        order_ids: selectedOrders.length > 0 ? selectedOrders : null,
        format
      }, {
        responseType: format === 'csv' ? 'blob' : 'json'
      });

      if (format === 'csv') {
        const blob = new Blob([response.data], { type: 'text/csv' });
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `orders_export_${Date.now()}.csv`;
        a.click();
        window.URL.revokeObjectURL(url);
        setMessage('Orders exported successfully');
      }
    } catch (err) {
      setError('Failed to export orders: ' + (err.response?.data?.error || err.message));
    }
  };

  const handleGeneratePackingSlips = async () => {
    if (selectedOrders.length === 0) {
      setError('Please select orders to generate packing slips');
      return;
    }

    try {
      const response = await axios.post(`${API_BASE_URL}/api/marketplace/orders/packing-slips`, {
        order_ids: selectedOrders
      });

      // Open packing slip preview in new window
      const packingSlipWindow = window.open('', '_blank');
      packingSlipWindow.document.write(generatePackingSlipHTML(response.data));
      packingSlipWindow.document.close();
    } catch (err) {
      setError('Failed to generate packing slips: ' + (err.response?.data?.error || err.message));
    }
  };

  // Generate packing slip HTML
  const generatePackingSlipHTML = (slips) => {
    return `
      <!DOCTYPE html>
      <html>
      <head>
        <title>Packing Slips</title>
        <style>
          body { font-family: Arial, sans-serif; margin: 0; padding: 20px; }
          .slip { page-break-after: always; padding: 20px; border: 1px solid #ddd; margin-bottom: 20px; }
          .slip:last-child { page-break-after: auto; }
          .header { display: flex; justify-content: space-between; margin-bottom: 20px; }
          .title { font-size: 24px; font-weight: bold; }
          .order-info { margin-bottom: 15px; }
          .address { margin-bottom: 20px; padding: 15px; background: #f5f5f5; }
          table { width: 100%; border-collapse: collapse; margin-bottom: 20px; }
          th, td { border: 1px solid #ddd; padding: 10px; text-align: left; }
          th { background: #f0f0f0; }
          .totals { text-align: right; }
          @media print { .no-print { display: none; } }
        </style>
      </head>
      <body>
        <button class="no-print" onclick="window.print()" style="padding: 10px 20px; margin-bottom: 20px;">Print All</button>
        ${slips.map(slip => `
          <div class="slip">
            <div class="header">
              <div class="title">Packing Slip</div>
              <div>Order #${slip.mirakl_order_id?.substring(0, 8) || slip.order_id}</div>
            </div>
            <div class="order-info">
              <strong>Order Date:</strong> ${slip.order_date ? new Date(slip.order_date).toLocaleDateString() : 'N/A'}
            </div>
            <div class="address">
              <strong>Ship To:</strong><br>
              ${slip.customer?.name || 'Customer'}<br>
              ${slip.shipping_address?.street1 || ''}<br>
              ${slip.shipping_address?.city || ''}, ${slip.shipping_address?.state || ''} ${slip.shipping_address?.zip || ''}<br>
              ${slip.shipping_address?.country || ''}
            </div>
            <table>
              <thead>
                <tr>
                  <th>Product</th>
                  <th>SKU</th>
                  <th>Qty</th>
                  <th>Price</th>
                  <th>Total</th>
                </tr>
              </thead>
              <tbody>
                ${(slip.items || []).map(item => `
                  <tr>
                    <td>${item.product_name || item.product_sku || 'Product'}</td>
                    <td>${item.product_sku || ''}</td>
                    <td>${item.quantity || 1}</td>
                    <td>$${(item.unit_price || 0).toFixed(2)}</td>
                    <td>$${(item.total_price || 0).toFixed(2)}</td>
                  </tr>
                `).join('')}
              </tbody>
            </table>
            <div class="totals">
              <p><strong>Subtotal:</strong> $${(slip.totals?.subtotal || 0).toFixed(2)}</p>
              <p><strong>Shipping:</strong> $${(slip.totals?.shipping || 0).toFixed(2)}</p>
              <p><strong>Tax:</strong> $${(slip.totals?.tax || 0).toFixed(2)}</p>
              <p style="font-size: 18px;"><strong>Total:</strong> $${(slip.totals?.total || 0).toFixed(2)}</p>
            </div>
          </div>
        `).join('')}
      </body>
      </html>
    `;
  };

  // Notification handlers
  const handleMarkNotificationRead = async (id) => {
    try {
      await axios.put(`${API_BASE_URL}/api/marketplace/notifications/${id}/read`);
      fetchNotifications();
    } catch (err) {
      handleApiError(err, { context: 'Marking notification read', silent: true });
    }
  };

  const handleMarkAllNotificationsRead = async () => {
    try {
      await axios.put(`${API_BASE_URL}/api/marketplace/notifications/mark-all-read`);
      fetchNotifications();
    } catch (err) {
      handleApiError(err, { context: 'Marking notifications read', silent: true });
    }
  };

  const handleDismissNotification = async (id) => {
    try {
      await axios.put(`${API_BASE_URL}/api/marketplace/notifications/${id}/dismiss`);
      fetchNotifications();
    } catch (err) {
      handleApiError(err, { context: 'Dismissing notification', silent: true });
    }
  };

  // Auto-rules handlers
  const handleToggleRule = async (ruleId) => {
    try {
      await axios.put(`${API_BASE_URL}/api/marketplace/auto-rules/${ruleId}/toggle`);
      fetchAutoRules();
    } catch (err) {
      setError('Failed to toggle rule: ' + (err.response?.data?.error || err.message));
    }
  };

  const handleDeleteRule = async (ruleId) => {
    if (!window.confirm('Are you sure you want to delete this rule?')) return;

    try {
      await axios.delete(`${API_BASE_URL}/api/marketplace/auto-rules/${ruleId}`);
      fetchAutoRules();
      setMessage('Rule deleted successfully');
    } catch (err) {
      setError('Failed to delete rule: ' + (err.response?.data?.error || err.message));
    }
  };

  const handleSaveRule = async (ruleData) => {
    try {
      if (editingRule?.id) {
        await axios.put(`${API_BASE_URL}/api/marketplace/auto-rules/${editingRule.id}`, ruleData);
        setMessage('Rule updated successfully');
      } else {
        await axios.post(`${API_BASE_URL}/api/marketplace/auto-rules`, ruleData);
        setMessage('Rule created successfully');
      }
      fetchAutoRules();
      setShowRuleModal(false);
      setEditingRule(null);
    } catch (err) {
      setError('Failed to save rule: ' + (err.response?.data?.error || err.message));
    }
  };

  // View order detail
  const handleViewOrderDetail = async (orderId) => {
    try {
      const response = await axios.get(`${API_BASE_URL}/api/marketplace/orders/${orderId}/detail`);
      setOrderDetail(response.data);
      setOrderDetailId(orderId);
    } catch (err) {
      setError('Failed to fetch order details: ' + (err.response?.data?.error || err.message));
    }
  };

  // Formatting helpers
  const formatCurrency = (amount) => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
      minimumFractionDigits: 0,
      maximumFractionDigits: 0
    }).format(amount || 0);
  };

  const formatRelativeTime = (date) => {
    if (!date) return '';
    const now = new Date();
    const then = new Date(date);
    const diffMs = now - then;
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMs / 3600000);
    const diffDays = Math.floor(diffMs / 86400000);

    if (diffMins < 1) return 'just now';
    if (diffMins < 60) return `${diffMins}m ago`;
    if (diffHours < 24) return `${diffHours}h ago`;
    return `${diffDays}d ago`;
  };

  const getSyncStatusColor = (status) => {
    switch (status) {
      case 'green': return '#28a745';
      case 'yellow': return '#ffc107';
      case 'red': return '#dc3545';
      default: return '#6c757d';
    }
  };

  const getPercentageChange = () => {
    if (!analytics?.revenue) return 0;
    const thisMonth = analytics.revenue.this_month || 0;
    const lastMonth = analytics.revenue.last_month || 0;
    if (lastMonth === 0) return thisMonth > 0 ? 100 : 0;
    return Math.round(((thisMonth - lastMonth) / lastMonth) * 100);
  };

  const getOrderStateColor = (state) => {
    switch (state) {
      case 'WAITING_ACCEPTANCE': return '#ffc107';
      case 'SHIPPING': return '#17a2b8';
      case 'SHIPPED': return '#28a745';
      case 'RECEIVED': return '#28a745';
      case 'REFUSED': return '#dc3545';
      case 'CANCELED': return '#6c757d';
      default: return '#6c757d';
    }
  };

  // Simple bar chart component
  const SimpleBarChart = ({ data, valueKey, labelKey, maxBars = 10 }) => {
    const displayData = data.slice(0, maxBars);
    const maxValue = Math.max(...displayData.map(d => parseFloat(d[valueKey]) || 0), 1);

    return (
      <div style={styles.barChart}>
        {displayData.map((item, index) => (
          <div key={index} style={styles.barRow}>
            <div style={styles.barLabel} title={item[labelKey]}>
              {(item[labelKey] || '').substring(0, 20)}
            </div>
            <div style={styles.barContainer}>
              <div
                style={{
                  ...styles.bar,
                  width: `${(parseFloat(item[valueKey]) / maxValue) * 100}%`
                }}
              />
            </div>
            <div style={styles.barValue}>
              {formatCurrency(item[valueKey])}
            </div>
          </div>
        ))}
        {displayData.length === 0 && (
          <div style={styles.noData}>No sales data yet</div>
        )}
      </div>
    );
  };

  // Simple line chart using CSS
  const SimpleLineChart = ({ data }) => {
    if (!data || data.length === 0) {
      return <div style={styles.noData}>No sales data for the last 30 days</div>;
    }

    const maxRevenue = Math.max(...data.map(d => d.revenue || 0), 1);
    const totalRevenue = data.reduce((sum, d) => sum + (d.revenue || 0), 0);
    const totalOrders = data.reduce((sum, d) => sum + (d.order_count || 0), 0);

    return (
      <div>
        <div style={styles.chartSummary}>
          <span>Total: {formatCurrency(totalRevenue)}</span>
          <span style={{ marginLeft: '20px' }}>Orders: {totalOrders}</span>
        </div>
        <div style={styles.lineChart}>
          {data.map((day, index) => (
            <div
              key={index}
              style={styles.lineBar}
              title={`${day.date}: ${formatCurrency(day.revenue)} (${day.order_count} orders)`}
            >
              <div
                style={{
                  ...styles.lineBarFill,
                  height: `${Math.max((day.revenue / maxRevenue) * 100, 2)}%`
                }}
              />
            </div>
          ))}
        </div>
        <div style={styles.chartLabels}>
          <span>{data[0]?.date?.substring(5)}</span>
          <span>{data[Math.floor(data.length / 2)]?.date?.substring(5)}</span>
          <span>{data[data.length - 1]?.date?.substring(5)}</span>
        </div>
      </div>
    );
  };

  // Notification Bell Component
  const NotificationBell = () => (
    <div style={styles.notificationBellContainer}>
      <button
        style={styles.notificationBell}
        onClick={() => setShowNotifications(!showNotifications)}
        title="Notifications"
      >
        <span style={{ fontSize: '20px' }}>🔔</span>
        {unreadCount > 0 && (
          <span style={styles.notificationBadge}>
            {unreadCount > 99 ? '99+' : unreadCount}
          </span>
        )}
      </button>

      {showNotifications && (
        <div style={styles.notificationDropdown}>
          <div style={styles.notificationHeader}>
            <span style={{ fontWeight: '600' }}>Notifications</span>
            {unreadCount > 0 && (
              <button
                style={styles.markAllReadBtn}
                onClick={handleMarkAllNotificationsRead}
              >
                Mark all read
              </button>
            )}
          </div>
          <div style={styles.notificationList}>
            {notifications.length === 0 ? (
              <div style={styles.noNotifications}>No notifications</div>
            ) : (
              notifications.slice(0, 10).map((notif) => (
                <div
                  key={notif.id}
                  style={{
                    ...styles.notificationItem,
                    backgroundColor: notif.read ? '#fff' : '#f0f7ff'
                  }}
                  onClick={() => handleMarkNotificationRead(notif.id)}
                >
                  <div style={styles.notificationContent}>
                    <div style={styles.notificationTitle}>
                      {notif.priority === 'high' && <span style={{ color: '#dc3545' }}>⚠️ </span>}
                      {notif.title}
                    </div>
                    <div style={styles.notificationMessage}>{notif.message}</div>
                    <div style={styles.notificationTime}>{formatRelativeTime(notif.created_at)}</div>
                  </div>
                  <button
                    style={styles.dismissBtn}
                    onClick={(e) => {
                      e.stopPropagation();
                      handleDismissNotification(notif.id);
                    }}
                  >
                    ×
                  </button>
                </div>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  );

  // Reject Reason Modal
  const RejectModal = () => (
    <div style={styles.modalOverlay} onClick={() => setShowRejectModal(false)}>
      <div style={styles.modal} onClick={e => e.stopPropagation()}>
        <h3 style={styles.modalTitle}>Reject Orders</h3>
        <p>Rejecting {selectedOrders.length} order(s)</p>
        <div style={styles.formGroup}>
          <label style={styles.label}>Rejection Reason:</label>
          <select
            style={styles.select}
            value={rejectReason}
            onChange={(e) => setRejectReason(e.target.value)}
          >
            <option value="Out of stock">Out of stock</option>
            <option value="Price error">Price error</option>
            <option value="Cannot ship to location">Cannot ship to location</option>
            <option value="Product discontinued">Product discontinued</option>
            <option value="Other">Other</option>
          </select>
        </div>
        <div style={styles.modalActions}>
          <button
            style={{ ...styles.button, ...styles.secondaryButton }}
            onClick={() => setShowRejectModal(false)}
          >
            Cancel
          </button>
          <button
            style={{ ...styles.button, ...styles.dangerButton }}
            onClick={handleBatchReject}
            disabled={batchProcessing}
          >
            {batchProcessing ? 'Processing...' : 'Reject Orders'}
          </button>
        </div>
      </div>
    </div>
  );

  // Order Detail Modal
  const OrderDetailModal = () => {
    if (!orderDetail) return null;

    return (
      <div style={styles.modalOverlay} onClick={() => setOrderDetailId(null)}>
        <div style={{ ...styles.modal, maxWidth: '800px' }} onClick={e => e.stopPropagation()}>
          <div style={styles.modalHeader}>
            <h3 style={styles.modalTitle}>
              Order #{orderDetail.order?.mirakl_order_id?.substring(0, 8) || orderDetail.order?.id}
            </h3>
            <button style={styles.closeModalBtn} onClick={() => setOrderDetailId(null)}>×</button>
          </div>

          <div style={styles.orderDetailGrid}>
            <div style={styles.orderDetailSection}>
              <h4>Order Info</h4>
              <p><strong>Status:</strong> <span style={{ color: getOrderStateColor(orderDetail.order?.order_state) }}>{orderDetail.order?.order_state}</span></p>
              <p><strong>Total:</strong> {formatCurrency(orderDetail.order?.total_price)}</p>
              <p><strong>Date:</strong> {orderDetail.order?.order_date ? new Date(orderDetail.order.order_date).toLocaleString() : 'N/A'}</p>
            </div>

            <div style={styles.orderDetailSection}>
              <h4>Customer</h4>
              <p><strong>Name:</strong> {orderDetail.order?.customer_name || 'N/A'}</p>
              <p><strong>Email:</strong> {orderDetail.order?.customer_email || 'N/A'}</p>
            </div>
          </div>

          <div style={styles.orderDetailSection}>
            <h4>Items ({orderDetail.items?.length || 0})</h4>
            <table style={styles.table}>
              <thead>
                <tr>
                  <th>Product</th>
                  <th>SKU</th>
                  <th>Qty</th>
                  <th>Price</th>
                  <th>Total</th>
                </tr>
              </thead>
              <tbody>
                {(orderDetail.items || []).map((item, idx) => (
                  <tr key={idx}>
                    <td>{item.product_name || item.product_sku}</td>
                    <td>{item.product_sku}</td>
                    <td>{item.quantity}</td>
                    <td>{formatCurrency(item.unit_price)}</td>
                    <td>{formatCurrency(item.total_price)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {orderDetail.shipments?.length > 0 && (
            <div style={styles.orderDetailSection}>
              <h4>Shipments</h4>
              {orderDetail.shipments.map((ship, idx) => (
                <div key={idx} style={styles.shipmentItem}>
                  <p><strong>Carrier:</strong> {ship.carrier_name || 'N/A'}</p>
                  <p><strong>Tracking:</strong> {ship.tracking_number || 'N/A'}</p>
                  <p><strong>Status:</strong> {ship.shipment_status || 'N/A'}</p>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    );
  };

  // Auto-Rule Editor Modal
  const RuleEditorModal = () => {
    const [ruleForm, setRuleForm] = useState(editingRule || {
      name: '',
      description: '',
      rule_type: 'auto_accept',
      action: 'accept',
      conditions: [],
      priority: 100,
      enabled: true
    });

    const addCondition = () => {
      setRuleForm(prev => ({
        ...prev,
        conditions: [...(prev.conditions || []), { field: 'order_total', operator: 'greater_than', value: 0 }]
      }));
    };

    const updateCondition = (index, field, value) => {
      setRuleForm(prev => {
        const conditions = [...(prev.conditions || [])];
        conditions[index] = { ...conditions[index], [field]: value };
        return { ...prev, conditions };
      });
    };

    const removeCondition = (index) => {
      setRuleForm(prev => ({
        ...prev,
        conditions: (prev.conditions || []).filter((_, i) => i !== index)
      }));
    };

    return (
      <div style={styles.modalOverlay} onClick={() => setShowRuleModal(false)}>
        <div style={{ ...styles.modal, maxWidth: '600px' }} onClick={e => e.stopPropagation()}>
          <h3 style={styles.modalTitle}>{editingRule ? 'Edit Rule' : 'Create Rule'}</h3>

          <div style={styles.formGroup}>
            <label style={styles.label}>Rule Name *</label>
            <input
              type="text"
              style={styles.input}
              value={ruleForm.name}
              onChange={e => setRuleForm(prev => ({ ...prev, name: e.target.value }))}
              placeholder="e.g., Auto-accept small orders"
            />
          </div>

          <div style={styles.formGroup}>
            <label style={styles.label}>Description</label>
            <textarea
              style={{ ...styles.input, minHeight: '60px' }}
              value={ruleForm.description}
              onChange={e => setRuleForm(prev => ({ ...prev, description: e.target.value }))}
              placeholder="Describe what this rule does..."
            />
          </div>

          <div style={styles.formRow}>
            <div style={styles.formGroup}>
              <label style={styles.label}>Rule Type *</label>
              <select
                style={styles.select}
                value={ruleForm.rule_type}
                onChange={e => {
                  const type = e.target.value;
                  let action = 'accept';
                  if (type === 'auto_reject') action = 'reject';
                  if (type === 'alert') action = 'notify';
                  setRuleForm(prev => ({ ...prev, rule_type: type, action }));
                }}
              >
                <option value="auto_accept">Auto Accept</option>
                <option value="auto_reject">Auto Reject</option>
                <option value="alert">Alert Only</option>
              </select>
            </div>

            <div style={styles.formGroup}>
              <label style={styles.label}>Priority</label>
              <input
                type="number"
                style={styles.input}
                value={ruleForm.priority}
                onChange={e => setRuleForm(prev => ({ ...prev, priority: parseInt(e.target.value) || 100 }))}
                min="1"
                max="1000"
              />
              <small style={styles.helpText}>Lower number = higher priority</small>
            </div>
          </div>

          <div style={styles.formGroup}>
            <label style={styles.label}>Conditions</label>
            {(ruleForm.conditions || []).map((condition, index) => (
              <div key={index} style={styles.conditionRow}>
                <select
                  style={{ ...styles.select, flex: 1 }}
                  value={condition.field}
                  onChange={e => updateCondition(index, 'field', e.target.value)}
                >
                  <option value="order_total">Order Total</option>
                  <option value="max_quantity">Max Item Quantity</option>
                  <option value="total_quantity">Total Quantity</option>
                  <option value="all_items_in_stock">All Items In Stock</option>
                  <option value="any_item_out_of_stock">Any Item Out of Stock</option>
                </select>
                <select
                  style={{ ...styles.select, width: '120px' }}
                  value={condition.operator}
                  onChange={e => updateCondition(index, 'operator', e.target.value)}
                >
                  <option value="equals">Equals</option>
                  <option value="not_equals">Not Equals</option>
                  <option value="greater_than">Greater Than</option>
                  <option value="less_than">Less Than</option>
                  <option value="greater_than_or_equal">≥</option>
                  <option value="less_than_or_equal">≤</option>
                </select>
                <input
                  type="text"
                  style={{ ...styles.input, width: '100px' }}
                  value={condition.value}
                  onChange={e => {
                    let value = e.target.value;
                    if (value === 'true') value = true;
                    else if (value === 'false') value = false;
                    else if (!isNaN(value) && value !== '') value = parseFloat(value);
                    updateCondition(index, 'value', value);
                  }}
                  placeholder="Value"
                />
                <button
                  style={styles.removeConditionBtn}
                  onClick={() => removeCondition(index)}
                >
                  ×
                </button>
              </div>
            ))}
            <button
              style={{ ...styles.button, ...styles.outlineButton, marginTop: '8px' }}
              onClick={addCondition}
            >
              + Add Condition
            </button>
          </div>

          <div style={styles.formGroup}>
            <label style={styles.checkboxLabel}>
              <input
                type="checkbox"
                checked={ruleForm.enabled}
                onChange={e => setRuleForm(prev => ({ ...prev, enabled: e.target.checked }))}
              />
              <span style={{ marginLeft: '8px' }}>Enable this rule</span>
            </label>
          </div>

          <div style={styles.modalActions}>
            <button
              style={{ ...styles.button, ...styles.secondaryButton }}
              onClick={() => {
                setShowRuleModal(false);
                setEditingRule(null);
              }}
            >
              Cancel
            </button>
            <button
              style={{ ...styles.button, ...styles.primaryButton }}
              onClick={() => handleSaveRule(ruleForm)}
              disabled={!ruleForm.name}
            >
              {editingRule ? 'Update Rule' : 'Create Rule'}
            </button>
          </div>
        </div>
      </div>
    );
  };

  return (
    <div style={styles.container}>
      {/* Header */}
      <div style={styles.header}>
        <h1 style={styles.title}>Best Buy Marketplace</h1>
        <div style={styles.headerActions}>
          <NotificationBell />
          <div style={styles.syncIndicator}>
            <span
              style={{
                ...styles.syncDot,
                backgroundColor: getSyncStatusColor(analytics?.sync_status)
              }}
            />
            <span style={styles.syncText}>
              {analytics?.sync_status === 'green' ? 'Synced' :
               analytics?.sync_status === 'yellow' ? 'Pending' : 'Error'}
            </span>
          </div>
        </div>
      </div>

      {/* Section Navigation */}
      <div style={styles.sectionNav}>
        <button
          style={{
            ...styles.navButton,
            ...(activeSection === 'dashboard' ? styles.navButtonActive : {})
          }}
          onClick={() => setActiveSection('dashboard')}
        >
          Dashboard
        </button>
        <button
          style={{
            ...styles.navButton,
            ...(activeSection === 'orders' ? styles.navButtonActive : {})
          }}
          onClick={() => {
            setActiveSection('orders');
            fetchOrders();
          }}
        >
          Orders
        </button>
        <button
          style={{
            ...styles.navButton,
            ...(activeSection === 'automation' ? styles.navButtonActive : {})
          }}
          onClick={() => {
            setActiveSection('automation');
            fetchAutoRules();
          }}
        >
          Automation Rules
        </button>
        <button
          style={{
            ...styles.navButton,
            ...(activeSection === 'mapping' ? styles.navButtonActive : {})
          }}
          onClick={() => setActiveSection('mapping')}
        >
          Product Mapping
        </button>
        <button
          style={{
            ...styles.navButton,
            ...(activeSection === 'inventory' ? styles.navButtonActive : {})
          }}
          onClick={() => {
            setActiveSection('inventory');
            fetchSyncSettings();
            fetchSyncHistory();
            fetchInventoryProducts(1, '');
          }}
        >
          Inventory Sync
        </button>
        <button
          style={{
            ...styles.navButton,
            ...(activeSection === 'pricing' ? styles.navButtonActive : {})
          }}
          onClick={() => {
            setActiveSection('pricing');
            fetchPriceRules();
            fetchPricePreviews();
          }}
        >
          Pricing Rules
        </button>
      </div>

      {/* Messages */}
      {message && (
        <div style={styles.successMessage}>
          {message}
          <button style={styles.closeButton} onClick={() => setMessage(null)}>×</button>
        </div>
      )}

      {error && (
        <div style={styles.errorMessage}>
          {error}
          <button style={styles.closeButton} onClick={() => setError(null)}>×</button>
        </div>
      )}

      {/* Product Mapping Section */}
      {activeSection === 'mapping' && <ProductMappingTool />}

      {/* Inventory Sync Section */}
      {activeSection === 'inventory' && (
        <div style={styles.section}>
          <div style={styles.sectionHeader}>
            <h2 style={styles.sectionTitle}>Inventory Sync Settings</h2>
            <button
              style={{
                ...styles.button,
                ...styles.primaryButton,
                opacity: inventorySyncing ? 0.6 : 1
              }}
              onClick={async () => {
                setInventorySyncing(true);
                try {
                  const response = await axios.post(`${API_BASE_URL}/api/marketplace/run-inventory-sync`);
                  setMessage(`Sync completed: ${response.data.products_synced} products synced`);
                  fetchSyncHistory();
                } catch (err) {
                  setError('Sync failed: ' + (err.response?.data?.error || err.message));
                } finally {
                  setInventorySyncing(false);
                }
              }}
              disabled={inventorySyncing}
            >
              {inventorySyncing ? 'Syncing...' : 'Run Sync Now'}
            </button>
          </div>

          {/* Sync Settings Cards */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '20px', marginBottom: '24px' }}>
            {/* Auto-Sync Toggle */}
            <div style={styles.card}>
              <h3 style={{ margin: '0 0 16px 0', fontSize: '16px' }}>Auto-Sync</h3>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <span>Enable automatic sync</span>
                <label style={styles.toggle}>
                  <input
                    type="checkbox"
                    checked={syncSettings.auto_sync_enabled?.enabled || false}
                    onChange={async (e) => {
                      try {
                        await axios.put(`${API_BASE_URL}/api/marketplace/sync-settings/auto_sync_enabled`, {
                          value: { enabled: e.target.checked }
                        });
                        fetchSyncSettings();
                        setMessage(e.target.checked ? 'Auto-sync enabled' : 'Auto-sync disabled');
                      } catch (err) {
                        setError('Failed to update setting');
                      }
                    }}
                    style={{ display: 'none' }}
                  />
                  <span style={{
                    ...styles.toggleSlider,
                    backgroundColor: syncSettings.auto_sync_enabled?.enabled ? '#0071dc' : '#ccc'
                  }}>
                    <span style={{
                      position: 'absolute',
                      width: '22px',
                      height: '22px',
                      left: syncSettings.auto_sync_enabled?.enabled ? '26px' : '2px',
                      bottom: '2px',
                      backgroundColor: 'white',
                      borderRadius: '50%',
                      transition: '.3s'
                    }}/>
                  </span>
                </label>
              </div>
            </div>

            {/* Sync Frequency */}
            <div style={styles.card}>
              <h3 style={{ margin: '0 0 16px 0', fontSize: '16px' }}>Sync Frequency</h3>
              <select
                style={styles.select}
                value={syncSettings.sync_frequency_hours?.value || 4}
                onChange={async (e) => {
                  try {
                    await axios.put(`${API_BASE_URL}/api/marketplace/sync-settings/sync_frequency_hours`, {
                      value: { value: parseInt(e.target.value) }
                    });
                    fetchSyncSettings();
                    setMessage(`Sync frequency set to every ${e.target.value} hours`);
                  } catch (err) {
                    setError('Failed to update frequency');
                  }
                }}
              >
                <option value="1">Every 1 hour</option>
                <option value="2">Every 2 hours</option>
                <option value="4">Every 4 hours</option>
                <option value="6">Every 6 hours</option>
                <option value="12">Every 12 hours</option>
                <option value="24">Every 24 hours</option>
              </select>
              <p style={{ margin: '8px 0 0 0', fontSize: '12px', color: '#666' }}>
                Last synced: {syncSettings.last_sync_time?.timestamp
                  ? new Date(syncSettings.last_sync_time.timestamp).toLocaleString()
                  : 'Never'}
              </p>
            </div>

            {/* Global Stock Buffer */}
            <div style={styles.card}>
              <h3 style={{ margin: '0 0 16px 0', fontSize: '16px' }}>Global Stock Buffer</h3>
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                <span>Reserve</span>
                <input
                  type="number"
                  min="0"
                  value={globalBuffer}
                  onChange={(e) => setGlobalBuffer(parseInt(e.target.value) || 0)}
                  style={{ ...styles.input, width: '80px' }}
                />
                <span>units</span>
                <button
                  style={{ ...styles.button, ...styles.primaryButton, padding: '8px 16px' }}
                  onClick={async () => {
                    try {
                      await axios.put(`${API_BASE_URL}/api/marketplace/stock-buffer`, {
                        value: globalBuffer
                      });
                      setMessage(`Stock buffer set to ${globalBuffer} units`);
                    } catch (err) {
                      setError('Failed to update buffer');
                    }
                  }}
                >
                  Save
                </button>
              </div>
              <p style={{ margin: '8px 0 0 0', fontSize: '12px', color: '#666' }}>
                This many units will be held back from marketplace listing
              </p>
            </div>
          </div>

          {/* Sync History */}
          <div style={styles.card}>
            <h3 style={{ margin: '0 0 16px 0', fontSize: '16px' }}>Sync History</h3>
            <table style={styles.table}>
              <thead>
                <tr>
                  <th style={styles.th}>Date</th>
                  <th style={styles.th}>Status</th>
                  <th style={styles.th}>Checked</th>
                  <th style={styles.th}>Synced</th>
                  <th style={styles.th}>Failed</th>
                </tr>
              </thead>
              <tbody>
                {syncHistory.length === 0 ? (
                  <tr><td colSpan="5" style={{ ...styles.td, textAlign: 'center' }}>No sync history yet</td></tr>
                ) : syncHistory.map(job => (
                  <tr key={job.id}>
                    <td style={styles.td}>{new Date(job.started_at).toLocaleString()}</td>
                    <td style={styles.td}>
                      <span style={{
                        padding: '4px 8px',
                        borderRadius: '4px',
                        fontSize: '12px',
                        backgroundColor: job.status === 'completed' ? '#d4edda' : job.status === 'running' ? '#fff3cd' : '#f8d7da',
                        color: job.status === 'completed' ? '#155724' : job.status === 'running' ? '#856404' : '#721c24'
                      }}>
                        {job.status}
                      </span>
                    </td>
                    <td style={styles.td}>{job.products_checked}</td>
                    <td style={styles.td}>{job.products_synced}</td>
                    <td style={styles.td}>{job.products_failed}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Inventory Products with Buffer */}
          <div style={{ ...styles.card, marginTop: '24px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
              <h3 style={{ margin: 0, fontSize: '16px' }}>Product Stock Buffers</h3>
              <input
                type="text"
                placeholder="Search products..."
                value={inventorySearch}
                onChange={(e) => setInventorySearch(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    fetchInventoryProducts(1, inventorySearch);
                    setInventoryPage(1);
                  }
                }}
                style={{ ...styles.input, width: '250px' }}
              />
            </div>

            {/* Bulk Operations Bar */}
            {selectedInventoryProducts.length > 0 && (
              <div style={{
                display: 'flex',
                alignItems: 'center',
                gap: '16px',
                padding: '12px 16px',
                backgroundColor: '#e3f2fd',
                borderRadius: '8px',
                marginBottom: '16px'
              }}>
                <span style={{ fontWeight: '600', color: '#1565c0' }}>
                  {selectedInventoryProducts.length} selected
                </span>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <span>Set buffer:</span>
                  <input
                    type="number"
                    min="0"
                    placeholder="Enter value"
                    value={bulkBufferValue}
                    onChange={(e) => setBulkBufferValue(e.target.value)}
                    style={{ ...styles.input, width: '100px', padding: '6px 10px' }}
                  />
                  <button
                    style={{ ...styles.button, ...styles.primaryButton, padding: '6px 16px' }}
                    onClick={async () => {
                      try {
                        await axios.put(`${API_BASE_URL}/api/marketplace/products/bulk-stock-buffer`, {
                          product_ids: selectedInventoryProducts,
                          buffer: bulkBufferValue === '' ? null : parseInt(bulkBufferValue)
                        });
                        setMessage(`Updated buffer for ${selectedInventoryProducts.length} products`);
                        setSelectedInventoryProducts([]);
                        setBulkBufferValue('');
                        fetchInventoryProducts(inventoryPage, inventorySearch);
                      } catch (err) {
                        setError('Failed to bulk update buffers');
                      }
                    }}
                  >
                    Apply
                  </button>
                  <button
                    style={{ ...styles.button, padding: '6px 16px' }}
                    onClick={() => {
                      setBulkBufferValue('');
                      setSelectedInventoryProducts([]);
                    }}
                  >
                    Cancel
                  </button>
                </div>
              </div>
            )}

            <table style={styles.table}>
              <thead>
                <tr>
                  <th style={styles.th}>
                    <input
                      type="checkbox"
                      checked={selectedInventoryProducts.length === inventoryProducts.length && inventoryProducts.length > 0}
                      onChange={(e) => {
                        if (e.target.checked) {
                          setSelectedInventoryProducts(inventoryProducts.map(p => p.id));
                        } else {
                          setSelectedInventoryProducts([]);
                        }
                      }}
                    />
                  </th>
                  <th style={styles.th}>Product</th>
                  <th style={styles.th}>SKU</th>
                  <th style={styles.th}>Actual Stock</th>
                  <th style={styles.th}>Buffer</th>
                  <th style={styles.th}>Effective Stock</th>
                  <th style={styles.th}>Last Synced</th>
                </tr>
              </thead>
              <tbody>
                {inventoryProducts.map(product => (
                  <tr key={product.id} style={{
                    backgroundColor: selectedInventoryProducts.includes(product.id) ? '#e3f2fd' : 'transparent'
                  }}>
                    <td style={styles.td}>
                      <input
                        type="checkbox"
                        checked={selectedInventoryProducts.includes(product.id)}
                        onChange={(e) => {
                          if (e.target.checked) {
                            setSelectedInventoryProducts(prev => [...prev, product.id]);
                          } else {
                            setSelectedInventoryProducts(prev => prev.filter(id => id !== product.id));
                          }
                        }}
                      />
                    </td>
                    <td style={styles.td}>
                      <div>
                        <strong>{product.model}</strong>
                        <div style={{ fontSize: '12px', color: '#666' }}>{product.manufacturer}</div>
                      </div>
                    </td>
                    <td style={styles.td}>{product.sku || '-'}</td>
                    <td style={styles.td}>{product.stock_quantity}</td>
                    <td style={styles.td}>
                      <input
                        type="number"
                        min="0"
                        placeholder={`Global (${globalBuffer})`}
                        value={product.marketplace_stock_buffer ?? ''}
                        onChange={async (e) => {
                          const newBuffer = e.target.value === '' ? null : parseInt(e.target.value);
                          try {
                            await axios.put(`${API_BASE_URL}/api/marketplace/products/${product.id}/stock-buffer`, {
                              buffer: newBuffer
                            });
                            fetchInventoryProducts(inventoryPage, inventorySearch);
                          } catch (err) {
                            setError('Failed to update buffer');
                          }
                        }}
                        style={{ ...styles.input, width: '80px', padding: '4px 8px' }}
                      />
                    </td>
                    <td style={{ ...styles.td, fontWeight: 'bold', color: product.effective_stock > 0 ? '#28a745' : '#dc3545' }}>
                      {product.effective_stock}
                    </td>
                    <td style={styles.td}>
                      {product.marketplace_last_synced
                        ? new Date(product.marketplace_last_synced).toLocaleDateString()
                        : 'Never'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {inventoryTotal > 25 && (
              <div style={{ display: 'flex', justifyContent: 'center', gap: '10px', marginTop: '16px' }}>
                <button
                  style={styles.button}
                  disabled={inventoryPage === 1}
                  onClick={() => {
                    setInventoryPage(p => p - 1);
                    fetchInventoryProducts(inventoryPage - 1, inventorySearch);
                  }}
                >
                  Previous
                </button>
                <span style={{ padding: '8px' }}>Page {inventoryPage} of {Math.ceil(inventoryTotal / 25)}</span>
                <button
                  style={styles.button}
                  disabled={inventoryPage >= Math.ceil(inventoryTotal / 25)}
                  onClick={() => {
                    setInventoryPage(p => p + 1);
                    fetchInventoryProducts(inventoryPage + 1, inventorySearch);
                  }}
                >
                  Next
                </button>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Pricing Rules Section */}
      {activeSection === 'pricing' && (
        <div style={styles.section}>
          <div style={styles.sectionHeader}>
            <h2 style={styles.sectionTitle}>Pricing Rules</h2>
            <button
              style={{ ...styles.button, ...styles.primaryButton }}
              onClick={() => {
                setEditingPriceRule(null);
                setShowPriceRuleModal(true);
              }}
            >
              + Create Rule
            </button>
          </div>

          {/* Price Rules Cards */}
          <div style={styles.rulesGrid}>
            {priceRules.map(rule => (
              <div key={rule.id} style={styles.ruleCard}>
                <div style={styles.ruleHeader}>
                  <div>
                    <h3 style={styles.ruleName}>{rule.name}</h3>
                    <span style={{
                      ...styles.ruleTypeBadge,
                      backgroundColor: rule.rule_type === 'markup_percent' ? '#e3f2fd' :
                                       rule.rule_type === 'markup_fixed' ? '#fff3e0' :
                                       rule.rule_type === 'minimum_margin' ? '#e8f5e9' : '#fce4ec',
                      color: rule.rule_type === 'markup_percent' ? '#1565c0' :
                             rule.rule_type === 'markup_fixed' ? '#ef6c00' :
                             rule.rule_type === 'minimum_margin' ? '#2e7d32' : '#c2185b'
                    }}>
                      {rule.rule_type === 'markup_percent' ? `+${rule.value}%` :
                       rule.rule_type === 'markup_fixed' ? `+$${rule.value}` :
                       rule.rule_type === 'minimum_margin' ? `Min ${rule.value}% margin` :
                       `Round to .${String(rule.value).split('.')[1] || '99'}`}
                    </span>
                  </div>
                  <label style={styles.toggle}>
                    <input
                      type="checkbox"
                      checked={rule.enabled}
                      onChange={async () => {
                        try {
                          await axios.put(`${API_BASE_URL}/api/marketplace/price-rules/${rule.id}/toggle`);
                          fetchPriceRules();
                          fetchPricePreviews();
                        } catch (err) {
                          setError('Failed to toggle rule');
                        }
                      }}
                      style={{ display: 'none' }}
                    />
                    <span style={{
                      ...styles.toggleSlider,
                      backgroundColor: rule.enabled ? '#0071dc' : '#ccc'
                    }}>
                      <span style={{
                        position: 'absolute',
                        width: '22px',
                        height: '22px',
                        left: rule.enabled ? '26px' : '2px',
                        bottom: '2px',
                        backgroundColor: 'white',
                        borderRadius: '50%',
                        transition: '.3s'
                      }}/>
                    </span>
                  </label>
                </div>
                <p style={styles.ruleDescription}>{rule.description}</p>
                <div style={{ display: 'flex', gap: '8px', fontSize: '12px', color: '#666', marginBottom: '12px' }}>
                  <span>Priority: {rule.priority}</span>
                  {rule.apply_globally && <span style={{ color: '#0071dc' }}>Global</span>}
                  {rule.category_code && <span>Category: {rule.category_code}</span>}
                </div>
                <div style={{ display: 'flex', gap: '8px' }}>
                  <button
                    style={{ ...styles.button, flex: 1 }}
                    onClick={() => {
                      setEditingPriceRule(rule);
                      setShowPriceRuleModal(true);
                    }}
                  >
                    Edit
                  </button>
                  <button
                    style={{ ...styles.button, ...styles.dangerButton, flex: 1 }}
                    onClick={async () => {
                      if (window.confirm('Delete this price rule?')) {
                        try {
                          await axios.delete(`${API_BASE_URL}/api/marketplace/price-rules/${rule.id}`);
                          fetchPriceRules();
                          fetchPricePreviews();
                          setMessage('Price rule deleted');
                        } catch (err) {
                          setError('Failed to delete rule');
                        }
                      }
                    }}
                  >
                    Delete
                  </button>
                </div>
              </div>
            ))}
          </div>

          {/* Price Preview Table */}
          <div style={{ ...styles.card, marginTop: '24px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
              <h3 style={{ margin: 0, fontSize: '16px' }}>Price Preview (with rules applied)</h3>
              <button
                style={styles.button}
                onClick={fetchPricePreviews}
              >
                Refresh Preview
              </button>
            </div>
            <table style={styles.table}>
              <thead>
                <tr>
                  <th style={styles.th}>Product</th>
                  <th style={styles.th}>Category</th>
                  <th style={styles.th}>Cost</th>
                  <th style={styles.th}>Original Price</th>
                  <th style={styles.th}>Best Buy Price</th>
                  <th style={styles.th}>Margin</th>
                </tr>
              </thead>
              <tbody>
                {pricePreviews.map(preview => (
                  <tr key={preview.id}>
                    <td style={styles.td}>
                      <div>
                        <strong>{preview.model}</strong>
                        <div style={{ fontSize: '12px', color: '#666' }}>{preview.manufacturer}</div>
                      </div>
                    </td>
                    <td style={styles.td}>{preview.category || '-'}</td>
                    <td style={styles.td}>${preview.cost?.toFixed(2) || '-'}</td>
                    <td style={styles.td}>${preview.original_price?.toFixed(2)}</td>
                    <td style={{ ...styles.td, fontWeight: 'bold', color: '#0071dc' }}>
                      ${preview.marketplace_price?.toFixed(2)}
                      {preview.price_difference > 0 && (
                        <span style={{ fontSize: '11px', color: '#28a745', marginLeft: '4px' }}>
                          (+${preview.price_difference.toFixed(2)})
                        </span>
                      )}
                    </td>
                    <td style={{
                      ...styles.td,
                      color: parseFloat(preview.margin_percent) >= 20 ? '#28a745' :
                             parseFloat(preview.margin_percent) >= 10 ? '#ffc107' : '#dc3545'
                    }}>
                      {preview.margin_percent ? `${preview.margin_percent}%` : '-'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Price Rule Modal */}
      {showPriceRuleModal && (
        <div style={styles.modalOverlay} onClick={() => setShowPriceRuleModal(false)}>
          <div style={styles.modal} onClick={e => e.stopPropagation()}>
            <div style={styles.modalHeader}>
              <h2 style={styles.modalTitle}>{editingPriceRule ? 'Edit Price Rule' : 'Create Price Rule'}</h2>
              <button style={styles.closeButton} onClick={() => setShowPriceRuleModal(false)}>×</button>
            </div>
            <form onSubmit={async (e) => {
              e.preventDefault();
              const formData = new FormData(e.target);
              const ruleData = {
                name: formData.get('name'),
                description: formData.get('description'),
                rule_type: formData.get('rule_type'),
                value: parseFloat(formData.get('value')),
                priority: parseInt(formData.get('priority')),
                apply_globally: formData.get('apply_globally') === 'on',
                category_code: formData.get('category_code') || null,
                enabled: editingPriceRule ? editingPriceRule.enabled : true
              };

              try {
                if (editingPriceRule) {
                  await axios.put(`${API_BASE_URL}/api/marketplace/price-rules/${editingPriceRule.id}`, ruleData);
                  setMessage('Price rule updated');
                } else {
                  await axios.post(`${API_BASE_URL}/api/marketplace/price-rules`, ruleData);
                  setMessage('Price rule created');
                }
                setShowPriceRuleModal(false);
                fetchPriceRules();
                fetchPricePreviews();
              } catch (err) {
                setError('Failed to save price rule');
              }
            }}>
              <div style={{ display: 'grid', gap: '16px' }}>
                <div>
                  <label style={styles.label}>Rule Name</label>
                  <input
                    name="name"
                    defaultValue={editingPriceRule?.name || ''}
                    required
                    style={styles.input}
                    placeholder="e.g., Standard 15% Markup"
                  />
                </div>
                <div>
                  <label style={styles.label}>Description</label>
                  <input
                    name="description"
                    defaultValue={editingPriceRule?.description || ''}
                    style={styles.input}
                    placeholder="Describe what this rule does"
                  />
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
                  <div>
                    <label style={styles.label}>Rule Type</label>
                    <select name="rule_type" defaultValue={editingPriceRule?.rule_type || 'markup_percent'} style={styles.select}>
                      <option value="markup_percent">Markup Percent (+%)</option>
                      <option value="markup_fixed">Markup Fixed (+$)</option>
                      <option value="minimum_margin">Minimum Margin (%)</option>
                      <option value="round_to">Round To (e.g., .99)</option>
                    </select>
                  </div>
                  <div>
                    <label style={styles.label}>Value</label>
                    <input
                      name="value"
                      type="number"
                      step="0.01"
                      defaultValue={editingPriceRule?.value || ''}
                      required
                      style={styles.input}
                      placeholder="15 for 15%, 50 for $50"
                    />
                  </div>
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
                  <div>
                    <label style={styles.label}>Priority (higher = applied first)</label>
                    <input
                      name="priority"
                      type="number"
                      defaultValue={editingPriceRule?.priority || 100}
                      style={styles.input}
                    />
                  </div>
                  <div>
                    <label style={styles.label}>Category (optional)</label>
                    <input
                      name="category_code"
                      defaultValue={editingPriceRule?.category_code || ''}
                      style={styles.input}
                      placeholder="Leave empty for all categories"
                    />
                  </div>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <input
                    type="checkbox"
                    name="apply_globally"
                    id="apply_globally"
                    defaultChecked={editingPriceRule?.apply_globally ?? true}
                  />
                  <label htmlFor="apply_globally">Apply globally (to all products)</label>
                </div>
              </div>
              <div style={{ display: 'flex', gap: '12px', marginTop: '24px', justifyContent: 'flex-end' }}>
                <button type="button" style={styles.button} onClick={() => setShowPriceRuleModal(false)}>
                  Cancel
                </button>
                <button type="submit" style={{ ...styles.button, ...styles.primaryButton }}>
                  {editingPriceRule ? 'Update Rule' : 'Create Rule'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Automation Rules Section */}
      {activeSection === 'automation' && (
        <div style={styles.section}>
          <div style={styles.sectionHeader}>
            <h2 style={styles.sectionTitle}>Automation Rules</h2>
            <button
              style={{ ...styles.button, ...styles.primaryButton }}
              onClick={() => {
                setEditingRule(null);
                setShowRuleModal(true);
              }}
            >
              + Create Rule
            </button>
          </div>

          <div style={styles.rulesGrid}>
            {autoRules.map(rule => (
              <div key={rule.id} style={styles.ruleCard}>
                <div style={styles.ruleHeader}>
                  <div>
                    <h3 style={styles.ruleName}>{rule.name}</h3>
                    <span style={{
                      ...styles.ruleTypeBadge,
                      backgroundColor: rule.rule_type === 'auto_accept' ? '#d4edda' :
                                       rule.rule_type === 'auto_reject' ? '#f8d7da' : '#fff3cd',
                      color: rule.rule_type === 'auto_accept' ? '#155724' :
                             rule.rule_type === 'auto_reject' ? '#721c24' : '#856404'
                    }}>
                      {rule.rule_type.replace('_', ' ')}
                    </span>
                  </div>
                  <label style={styles.toggleSwitch}>
                    <input
                      type="checkbox"
                      checked={rule.enabled}
                      onChange={() => handleToggleRule(rule.id)}
                    />
                    <span style={styles.toggleSlider}></span>
                  </label>
                </div>
                <p style={styles.ruleDescription}>{rule.description || 'No description'}</p>
                <div style={styles.ruleStats}>
                  <span>Priority: {rule.priority}</span>
                  <span>Triggered: {rule.trigger_count || 0} times</span>
                </div>
                <div style={styles.ruleConditions}>
                  {(rule.conditions || []).map((cond, idx) => (
                    <span key={idx} style={styles.conditionTag}>
                      {cond.field} {cond.operator} {String(cond.value)}
                    </span>
                  ))}
                </div>
                <div style={styles.ruleActions}>
                  <button
                    style={{ ...styles.button, ...styles.smallButton }}
                    onClick={() => {
                      setEditingRule(rule);
                      setShowRuleModal(true);
                    }}
                  >
                    Edit
                  </button>
                  <button
                    style={{ ...styles.button, ...styles.smallButton, ...styles.dangerButton }}
                    onClick={() => handleDeleteRule(rule.id)}
                  >
                    Delete
                  </button>
                </div>
              </div>
            ))}
            {autoRules.length === 0 && (
              <div style={styles.noData}>
                No automation rules configured. Create one to automate order processing.
              </div>
            )}
          </div>
        </div>
      )}

      {/* Orders Section */}
      {activeSection === 'orders' && (
        <div style={styles.section}>
          <div style={styles.sectionHeader}>
            <h2 style={styles.sectionTitle}>Marketplace Orders</h2>
            <div style={styles.orderActions}>
              <button
                style={{ ...styles.button, ...styles.primaryButton }}
                onClick={handlePullOrders}
                disabled={pulling}
              >
                {pulling ? 'Pulling...' : 'Pull New Orders'}
              </button>
            </div>
          </div>

          {/* Order States Summary */}
          <div style={styles.orderStatesGrid}>
            {ordersByState.map((state, index) => (
              <div key={index} style={styles.orderStateCard}>
                <div style={styles.orderStateLabel}>{(state.order_state || 'Unknown').replace(/_/g, ' ')}</div>
                <div style={styles.orderStateCount}>{state.count}</div>
              </div>
            ))}
            {ordersByState.length === 0 && (
              <div style={styles.noData}>No orders yet</div>
            )}
          </div>

          {/* Batch Actions Bar */}
          {selectedOrders.length > 0 && (
            <div style={styles.batchActionsBar}>
              <span style={styles.selectedCount}>{selectedOrders.length} selected</span>
              <div style={styles.batchButtons}>
                <button
                  style={{ ...styles.button, ...styles.primaryButton }}
                  onClick={handleBatchAccept}
                  disabled={batchProcessing}
                >
                  Accept Selected
                </button>
                <button
                  style={{ ...styles.button, ...styles.dangerButton }}
                  onClick={() => setShowRejectModal(true)}
                  disabled={batchProcessing}
                >
                  Reject Selected
                </button>
                <button
                  style={{ ...styles.button, ...styles.secondaryButton }}
                  onClick={handleGeneratePackingSlips}
                >
                  Print Packing Slips
                </button>
                <button
                  style={{ ...styles.button, ...styles.outlineButton }}
                  onClick={() => handleExportOrders('csv')}
                >
                  Export CSV
                </button>
              </div>
            </div>
          )}

          {/* Orders Table */}
          <div style={styles.tableContainer}>
            <table style={styles.table}>
              <thead>
                <tr>
                  <th style={styles.checkboxCell}>
                    <input
                      type="checkbox"
                      checked={selectedOrders.length > 0 && selectedOrders.length === orders.filter(o => o.order_state === 'WAITING_ACCEPTANCE').length}
                      onChange={handleSelectAllOrders}
                    />
                  </th>
                  <th>Order ID</th>
                  <th>Status</th>
                  <th>Customer</th>
                  <th>Total</th>
                  <th>Date</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {orders.map(order => (
                  <tr key={order.id}>
                    <td style={styles.checkboxCell}>
                      {order.order_state === 'WAITING_ACCEPTANCE' && (
                        <input
                          type="checkbox"
                          checked={selectedOrders.includes(order.id)}
                          onChange={() => handleSelectOrder(order.id)}
                        />
                      )}
                    </td>
                    <td>{order.mirakl_order_id?.substring(0, 8) || order.id}</td>
                    <td>
                      <span style={{
                        ...styles.statusBadge,
                        backgroundColor: getOrderStateColor(order.order_state),
                        color: '#fff'
                      }}>
                        {order.order_state?.replace(/_/g, ' ')}
                      </span>
                    </td>
                    <td>{order.customer_name || 'N/A'}</td>
                    <td>{formatCurrency(order.total_price_cents / 100)}</td>
                    <td>{order.order_date ? new Date(order.order_date).toLocaleDateString() : 'N/A'}</td>
                    <td>
                      <button
                        style={{ ...styles.button, ...styles.smallButton }}
                        onClick={() => handleViewOrderDetail(order.id)}
                      >
                        View
                      </button>
                    </td>
                  </tr>
                ))}
                {orders.length === 0 && (
                  <tr>
                    <td colSpan="7" style={styles.noDataCell}>No orders found. Click "Pull New Orders" to fetch orders from Best Buy.</td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Dashboard Section */}
      {activeSection === 'dashboard' && (
        <>
          {loading ? (
            <div style={styles.loading}>
              <div style={styles.spinner}></div>
              Loading marketplace dashboard...
            </div>
          ) : (
          <>
          {/* KPI Header Cards */}
          <div style={styles.kpiGrid}>
            <div style={styles.kpiCard}>
              <div style={styles.kpiIcon}>$</div>
              <div style={styles.kpiContent}>
                <div style={styles.kpiLabel}>Total Revenue</div>
                <div style={styles.kpiValue}>{formatCurrency(analytics?.revenue?.total)}</div>
                <div style={styles.kpiSubtext}>All time</div>
              </div>
            </div>

            <div style={styles.kpiCard}>
              <div style={styles.kpiIcon}>📦</div>
              <div style={styles.kpiContent}>
                <div style={styles.kpiLabel}>Orders</div>
                <div style={styles.kpiValue}>{analytics?.orders?.total || 0}</div>
                <div style={styles.kpiSubtext}>
                  Today: {analytics?.orders?.today || 0} | Week: {analytics?.orders?.this_week || 0}
                </div>
              </div>
            </div>

            <div style={styles.kpiCard}>
              <div style={styles.kpiIcon}>📋</div>
              <div style={styles.kpiContent}>
                <div style={styles.kpiLabel}>Products Listed</div>
                <div style={styles.kpiValue}>{analytics?.products?.listed || 0}</div>
                <div style={styles.kpiSubtext}>
                  of {analytics?.products?.total || 0} active products
                </div>
              </div>
            </div>

            <div style={styles.kpiCard}>
              <div style={styles.kpiIcon}>{getPercentageChange() >= 0 ? '📈' : '📉'}</div>
              <div style={styles.kpiContent}>
                <div style={styles.kpiLabel}>This Month</div>
                <div style={styles.kpiValue}>{formatCurrency(analytics?.revenue?.this_month)}</div>
                <div style={{
                  ...styles.kpiSubtext,
                  color: getPercentageChange() >= 0 ? '#28a745' : '#dc3545'
                }}>
                  {getPercentageChange() >= 0 ? '+' : ''}{getPercentageChange()}% vs last month
                </div>
              </div>
            </div>
          </div>

          {/* Main Content Grid */}
          <div style={styles.mainGrid}>
            <div style={styles.chartsColumn}>
              <div style={styles.chartCard}>
                <h3 style={styles.cardTitle}>Sales - Last 30 Days</h3>
                <SimpleLineChart data={salesChart} />
              </div>

              <div style={styles.chartCard}>
                <h3 style={styles.cardTitle}>Top Selling Products</h3>
                <SimpleBarChart data={topProducts} valueKey="total_revenue" labelKey="name" maxBars={5} />
              </div>

              <div style={styles.chartCard}>
                <h3 style={styles.cardTitle}>Sales by Category</h3>
                <SimpleBarChart data={salesByCategory} valueKey="revenue" labelKey="category_name" maxBars={5} />
              </div>
            </div>

            <div style={styles.sideColumn}>
              <div style={styles.healthCard}>
                <h3 style={styles.cardTitle}>Inventory Health</h3>
                <div style={styles.healthGrid}>
                  <div style={styles.healthItem}>
                    <span style={styles.healthLabel}>Listed Products</span>
                    <span style={{ ...styles.healthValue, color: '#28a745' }}>
                      {inventoryHealth?.listed_products || 0}
                    </span>
                  </div>
                  <div style={styles.healthItem}>
                    <span style={styles.healthLabel}>Unmapped</span>
                    <span style={{ ...styles.healthValue, color: '#ffc107' }}>
                      {inventoryHealth?.unmapped_products || 0}
                    </span>
                  </div>
                  <div style={styles.healthItem}>
                    <span style={styles.healthLabel}>Needs Sync</span>
                    <span style={{ ...styles.healthValue, color: '#17a2b8' }}>
                      {inventoryHealth?.needs_sync || 0}
                    </span>
                  </div>
                  <div style={styles.healthItem}>
                    <span style={styles.healthLabel}>Inactive</span>
                    <span style={{ ...styles.healthValue, color: '#6c757d' }}>
                      {inventoryHealth?.inactive_products || 0}
                    </span>
                  </div>
                </div>
              </div>

              <div style={styles.actionsCard}>
                <h3 style={styles.cardTitle}>Quick Actions</h3>
                <div style={styles.quickActions}>
                  <button
                    style={{ ...styles.quickActionBtn, ...styles.primaryButton, ...(syncing ? styles.buttonDisabled : {}) }}
                    onClick={handleSyncInventory}
                    disabled={syncing}
                  >
                    {syncing ? 'Syncing...' : 'Sync All Inventory'}
                  </button>
                  <button
                    style={{ ...styles.quickActionBtn, ...styles.secondaryButton, ...(pulling ? styles.buttonDisabled : {}) }}
                    onClick={handlePullOrders}
                    disabled={pulling}
                  >
                    {pulling ? 'Pulling...' : 'Pull New Orders'}
                  </button>
                  <button
                    style={{ ...styles.quickActionBtn, ...styles.outlineButton }}
                    onClick={() => setActiveSection('mapping')}
                  >
                    View Unmapped Products
                  </button>
                  <button
                    style={{ ...styles.quickActionBtn, ...styles.outlineButton }}
                    onClick={fetchDashboardData}
                  >
                    Refresh Dashboard
                  </button>
                </div>
              </div>

              <div style={styles.activityCard}>
                <h3 style={styles.cardTitle}>Recent Activity</h3>
                <div style={styles.activityList}>
                  {activityFeed.slice(0, 10).map((activity, index) => (
                    <div key={index} style={styles.activityItem}>
                      <span style={styles.activityIcon}>{activity.icon}</span>
                      <div style={styles.activityContent}>
                        <div style={styles.activityTitle}>{activity.title}</div>
                        <div style={styles.activityDesc}>{activity.description}</div>
                      </div>
                      <div style={styles.activityTime}>
                        {formatRelativeTime(activity.timestamp)}
                      </div>
                    </div>
                  ))}
                  {activityFeed.length === 0 && (
                    <div style={styles.noData}>No recent activity</div>
                  )}
                </div>
              </div>
            </div>
          </div>
          </>
          )}
        </>
      )}

      {/* Modals */}
      {showRejectModal && <RejectModal />}
      {orderDetailId && <OrderDetailModal />}
      {showRuleModal && <RuleEditorModal />}
    </div>
  );
};

// Styles
const styles = {
  container: {
    maxWidth: '1400px',
    margin: '0 auto',
    padding: '20px',
    fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
    backgroundColor: '#f8f9fa',
    minHeight: '100vh',
  },
  header: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: '20px',
  },
  headerActions: {
    display: 'flex',
    alignItems: 'center',
    gap: '16px',
  },
  title: {
    fontSize: '28px',
    fontWeight: '700',
    color: '#1a1a2e',
    margin: 0,
  },
  syncIndicator: {
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
    padding: '8px 16px',
    backgroundColor: '#fff',
    borderRadius: '20px',
    boxShadow: '0 2px 4px rgba(0,0,0,0.1)',
  },
  syncDot: {
    width: '10px',
    height: '10px',
    borderRadius: '50%',
  },
  syncText: {
    fontSize: '14px',
    fontWeight: '500',
    color: '#495057',
  },
  // Notification Bell Styles
  notificationBellContainer: {
    position: 'relative',
  },
  notificationBell: {
    background: '#fff',
    border: 'none',
    borderRadius: '50%',
    width: '44px',
    height: '44px',
    cursor: 'pointer',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    boxShadow: '0 2px 4px rgba(0,0,0,0.1)',
    position: 'relative',
  },
  notificationBadge: {
    position: 'absolute',
    top: '-4px',
    right: '-4px',
    backgroundColor: '#dc3545',
    color: '#fff',
    borderRadius: '10px',
    padding: '2px 6px',
    fontSize: '11px',
    fontWeight: '600',
    minWidth: '18px',
    textAlign: 'center',
  },
  notificationDropdown: {
    position: 'absolute',
    top: '50px',
    right: 0,
    width: '360px',
    backgroundColor: '#fff',
    borderRadius: '12px',
    boxShadow: '0 4px 20px rgba(0,0,0,0.15)',
    zIndex: 1000,
    overflow: 'hidden',
  },
  notificationHeader: {
    padding: '16px',
    borderBottom: '1px solid #e9ecef',
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  markAllReadBtn: {
    background: 'none',
    border: 'none',
    color: '#007bff',
    cursor: 'pointer',
    fontSize: '13px',
  },
  notificationList: {
    maxHeight: '400px',
    overflowY: 'auto',
  },
  notificationItem: {
    padding: '12px 16px',
    borderBottom: '1px solid #f0f0f0',
    display: 'flex',
    alignItems: 'flex-start',
    gap: '8px',
    cursor: 'pointer',
    transition: 'background 0.2s',
  },
  notificationContent: {
    flex: 1,
  },
  notificationTitle: {
    fontSize: '14px',
    fontWeight: '600',
    color: '#1a1a2e',
    marginBottom: '4px',
  },
  notificationMessage: {
    fontSize: '13px',
    color: '#6c757d',
    marginBottom: '4px',
  },
  notificationTime: {
    fontSize: '11px',
    color: '#adb5bd',
  },
  dismissBtn: {
    background: 'none',
    border: 'none',
    fontSize: '18px',
    color: '#adb5bd',
    cursor: 'pointer',
    padding: '0 4px',
  },
  noNotifications: {
    padding: '40px',
    textAlign: 'center',
    color: '#6c757d',
  },
  sectionNav: {
    display: 'flex',
    gap: '4px',
    marginBottom: '24px',
    backgroundColor: '#fff',
    padding: '4px',
    borderRadius: '8px',
    boxShadow: '0 2px 4px rgba(0,0,0,0.05)',
  },
  navButton: {
    padding: '12px 24px',
    border: 'none',
    backgroundColor: 'transparent',
    cursor: 'pointer',
    fontSize: '14px',
    fontWeight: '600',
    color: '#6c757d',
    borderRadius: '6px',
    transition: 'all 0.2s',
  },
  navButtonActive: {
    backgroundColor: '#007bff',
    color: '#fff',
  },
  loading: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    gap: '12px',
    padding: '60px',
    fontSize: '16px',
    color: '#666',
  },
  spinner: {
    width: '24px',
    height: '24px',
    border: '3px solid #e9ecef',
    borderTop: '3px solid #007bff',
    borderRadius: '50%',
    animation: 'spin 1s linear infinite',
  },
  successMessage: {
    backgroundColor: '#d4edda',
    color: '#155724',
    padding: '12px 16px',
    borderRadius: '8px',
    marginBottom: '20px',
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    border: '1px solid #c3e6cb',
  },
  errorMessage: {
    backgroundColor: '#f8d7da',
    color: '#721c24',
    padding: '12px 16px',
    borderRadius: '8px',
    marginBottom: '20px',
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    border: '1px solid #f5c6cb',
  },
  closeButton: {
    background: 'none',
    border: 'none',
    fontSize: '20px',
    cursor: 'pointer',
    padding: '0 8px',
    opacity: 0.7,
  },
  section: {
    marginBottom: '24px',
  },
  sectionHeader: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: '20px',
  },
  sectionTitle: {
    fontSize: '20px',
    fontWeight: '600',
    color: '#1a1a2e',
    margin: 0,
  },
  card: {
    backgroundColor: '#fff',
    borderRadius: '12px',
    padding: '20px',
    boxShadow: '0 2px 8px rgba(0,0,0,0.08)',
    marginBottom: '16px',
  },
  th: {
    padding: '12px 16px',
    textAlign: 'left',
    backgroundColor: '#f8f9fa',
    fontWeight: '600',
    fontSize: '13px',
    color: '#495057',
    borderBottom: '2px solid #e9ecef',
  },
  td: {
    padding: '12px 16px',
    borderBottom: '1px solid #e9ecef',
    fontSize: '14px',
    color: '#212529',
  },
  // Button styles
  button: {
    padding: '10px 16px',
    borderRadius: '6px',
    fontSize: '14px',
    fontWeight: '500',
    cursor: 'pointer',
    border: 'none',
    transition: 'all 0.2s',
  },
  primaryButton: {
    backgroundColor: '#007bff',
    color: '#fff',
  },
  secondaryButton: {
    backgroundColor: '#6c757d',
    color: '#fff',
  },
  dangerButton: {
    backgroundColor: '#dc3545',
    color: '#fff',
  },
  outlineButton: {
    backgroundColor: '#fff',
    color: '#007bff',
    border: '1px solid #007bff',
  },
  smallButton: {
    padding: '6px 12px',
    fontSize: '13px',
  },
  buttonDisabled: {
    opacity: 0.6,
    cursor: 'not-allowed',
  },
  // Batch Actions
  batchActionsBar: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: '#e3f2fd',
    padding: '12px 16px',
    borderRadius: '8px',
    marginBottom: '16px',
  },
  selectedCount: {
    fontWeight: '600',
    color: '#1565c0',
  },
  batchButtons: {
    display: 'flex',
    gap: '8px',
  },
  // Table styles
  tableContainer: {
    backgroundColor: '#fff',
    borderRadius: '12px',
    overflow: 'hidden',
    boxShadow: '0 2px 8px rgba(0,0,0,0.08)',
  },
  table: {
    width: '100%',
    borderCollapse: 'collapse',
  },
  checkboxCell: {
    width: '40px',
    textAlign: 'center',
    padding: '12px',
  },
  statusBadge: {
    padding: '4px 8px',
    borderRadius: '4px',
    fontSize: '12px',
    fontWeight: '500',
  },
  noDataCell: {
    padding: '40px',
    textAlign: 'center',
    color: '#6c757d',
  },
  // Modal styles
  modalOverlay: {
    position: 'fixed',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(0,0,0,0.5)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 2000,
  },
  modal: {
    backgroundColor: '#fff',
    borderRadius: '12px',
    padding: '24px',
    maxWidth: '500px',
    width: '90%',
    maxHeight: '90vh',
    overflowY: 'auto',
  },
  modalHeader: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: '20px',
  },
  modalTitle: {
    fontSize: '20px',
    fontWeight: '600',
    margin: 0,
  },
  closeModalBtn: {
    background: 'none',
    border: 'none',
    fontSize: '24px',
    cursor: 'pointer',
    color: '#6c757d',
  },
  modalActions: {
    display: 'flex',
    justifyContent: 'flex-end',
    gap: '12px',
    marginTop: '24px',
  },
  // Form styles
  formGroup: {
    marginBottom: '16px',
  },
  formRow: {
    display: 'flex',
    gap: '16px',
  },
  label: {
    display: 'block',
    marginBottom: '6px',
    fontWeight: '500',
    fontSize: '14px',
    color: '#495057',
  },
  input: {
    width: '100%',
    padding: '10px 12px',
    borderRadius: '6px',
    border: '1px solid #ced4da',
    fontSize: '14px',
    boxSizing: 'border-box',
  },
  select: {
    width: '100%',
    padding: '10px 12px',
    borderRadius: '6px',
    border: '1px solid #ced4da',
    fontSize: '14px',
    backgroundColor: '#fff',
  },
  helpText: {
    fontSize: '12px',
    color: '#6c757d',
    marginTop: '4px',
  },
  checkboxLabel: {
    display: 'flex',
    alignItems: 'center',
    cursor: 'pointer',
  },
  conditionRow: {
    display: 'flex',
    gap: '8px',
    alignItems: 'center',
    marginBottom: '8px',
  },
  removeConditionBtn: {
    background: '#dc3545',
    border: 'none',
    color: '#fff',
    width: '28px',
    height: '28px',
    borderRadius: '4px',
    cursor: 'pointer',
    fontSize: '16px',
  },
  // Rules styles
  rulesGrid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fill, minmax(350px, 1fr))',
    gap: '16px',
  },
  ruleCard: {
    backgroundColor: '#fff',
    borderRadius: '12px',
    padding: '20px',
    boxShadow: '0 2px 8px rgba(0,0,0,0.08)',
  },
  ruleHeader: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: '12px',
  },
  ruleName: {
    fontSize: '16px',
    fontWeight: '600',
    margin: '0 0 8px 0',
    color: '#1a1a2e',
  },
  ruleTypeBadge: {
    padding: '4px 8px',
    borderRadius: '4px',
    fontSize: '11px',
    fontWeight: '600',
    textTransform: 'uppercase',
  },
  ruleDescription: {
    fontSize: '14px',
    color: '#6c757d',
    marginBottom: '12px',
  },
  ruleStats: {
    display: 'flex',
    gap: '16px',
    fontSize: '13px',
    color: '#868e96',
    marginBottom: '12px',
  },
  ruleConditions: {
    display: 'flex',
    flexWrap: 'wrap',
    gap: '6px',
    marginBottom: '16px',
  },
  conditionTag: {
    backgroundColor: '#e9ecef',
    padding: '4px 8px',
    borderRadius: '4px',
    fontSize: '12px',
    color: '#495057',
  },
  ruleActions: {
    display: 'flex',
    gap: '8px',
  },
  toggle: {
    position: 'relative',
    display: 'inline-block',
    width: '50px',
    height: '26px',
    cursor: 'pointer',
  },
  toggleSwitch: {
    position: 'relative',
    display: 'inline-block',
    width: '50px',
    height: '26px',
  },
  toggleSlider: {
    position: 'absolute',
    cursor: 'pointer',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: '#ccc',
    transition: '.3s',
    borderRadius: '26px',
  },
  // Order detail styles
  orderDetailGrid: {
    display: 'grid',
    gridTemplateColumns: '1fr 1fr',
    gap: '20px',
    marginBottom: '20px',
  },
  orderDetailSection: {
    marginBottom: '20px',
  },
  shipmentItem: {
    backgroundColor: '#f8f9fa',
    padding: '12px',
    borderRadius: '8px',
    marginBottom: '8px',
  },
  // KPI styles
  kpiGrid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(4, 1fr)',
    gap: '20px',
    marginBottom: '24px',
  },
  kpiCard: {
    backgroundColor: '#fff',
    borderRadius: '12px',
    padding: '20px',
    display: 'flex',
    alignItems: 'flex-start',
    gap: '16px',
    boxShadow: '0 2px 8px rgba(0,0,0,0.08)',
  },
  kpiIcon: {
    fontSize: '24px',
    width: '48px',
    height: '48px',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#f0f7ff',
    borderRadius: '12px',
  },
  kpiContent: {
    flex: 1,
  },
  kpiLabel: {
    fontSize: '13px',
    color: '#6c757d',
    marginBottom: '4px',
    fontWeight: '500',
  },
  kpiValue: {
    fontSize: '28px',
    fontWeight: '700',
    color: '#1a1a2e',
    lineHeight: 1.2,
  },
  kpiSubtext: {
    fontSize: '12px',
    color: '#868e96',
    marginTop: '4px',
  },
  mainGrid: {
    display: 'grid',
    gridTemplateColumns: '1fr 380px',
    gap: '24px',
  },
  chartsColumn: {
    display: 'flex',
    flexDirection: 'column',
    gap: '20px',
  },
  sideColumn: {
    display: 'flex',
    flexDirection: 'column',
    gap: '20px',
  },
  chartCard: {
    backgroundColor: '#fff',
    borderRadius: '12px',
    padding: '20px',
    boxShadow: '0 2px 8px rgba(0,0,0,0.08)',
  },
  cardTitle: {
    fontSize: '16px',
    fontWeight: '600',
    color: '#1a1a2e',
    marginBottom: '16px',
    margin: '0 0 16px 0',
  },
  healthCard: {
    backgroundColor: '#fff',
    borderRadius: '12px',
    padding: '20px',
    boxShadow: '0 2px 8px rgba(0,0,0,0.08)',
  },
  healthGrid: {
    display: 'grid',
    gridTemplateColumns: '1fr 1fr',
    gap: '12px',
  },
  healthItem: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: '8px 0',
  },
  healthLabel: {
    fontSize: '13px',
    color: '#6c757d',
  },
  healthValue: {
    fontSize: '18px',
    fontWeight: '600',
  },
  actionsCard: {
    backgroundColor: '#fff',
    borderRadius: '12px',
    padding: '20px',
    boxShadow: '0 2px 8px rgba(0,0,0,0.08)',
  },
  quickActions: {
    display: 'flex',
    flexDirection: 'column',
    gap: '8px',
  },
  quickActionBtn: {
    padding: '12px 16px',
    borderRadius: '8px',
    fontSize: '14px',
    fontWeight: '500',
    cursor: 'pointer',
    border: 'none',
    transition: 'all 0.2s',
    width: '100%',
  },
  activityCard: {
    backgroundColor: '#fff',
    borderRadius: '12px',
    padding: '20px',
    boxShadow: '0 2px 8px rgba(0,0,0,0.08)',
  },
  activityList: {
    display: 'flex',
    flexDirection: 'column',
    gap: '12px',
  },
  activityItem: {
    display: 'flex',
    alignItems: 'flex-start',
    gap: '12px',
    padding: '8px 0',
    borderBottom: '1px solid #f0f0f0',
  },
  activityIcon: {
    fontSize: '16px',
  },
  activityContent: {
    flex: 1,
  },
  activityTitle: {
    fontSize: '14px',
    fontWeight: '500',
    color: '#1a1a2e',
  },
  activityDesc: {
    fontSize: '12px',
    color: '#6c757d',
  },
  activityTime: {
    fontSize: '11px',
    color: '#adb5bd',
    whiteSpace: 'nowrap',
  },
  noData: {
    padding: '20px',
    textAlign: 'center',
    color: '#6c757d',
    fontSize: '14px',
  },
  orderStatesGrid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fill, minmax(150px, 1fr))',
    gap: '12px',
    marginBottom: '20px',
  },
  orderStateCard: {
    backgroundColor: '#fff',
    borderRadius: '8px',
    padding: '16px',
    textAlign: 'center',
    boxShadow: '0 2px 4px rgba(0,0,0,0.05)',
  },
  orderStateLabel: {
    fontSize: '12px',
    color: '#6c757d',
    marginBottom: '4px',
    textTransform: 'capitalize',
  },
  orderStateCount: {
    fontSize: '24px',
    fontWeight: '700',
    color: '#1a1a2e',
  },
  orderActions: {
    display: 'flex',
    gap: '8px',
  },
  actionsRow: {
    marginTop: '16px',
  },
  actionButton: {
    padding: '12px 24px',
    borderRadius: '8px',
    fontSize: '14px',
    fontWeight: '500',
    cursor: 'pointer',
    border: 'none',
  },
  barChart: {
    display: 'flex',
    flexDirection: 'column',
    gap: '8px',
  },
  barRow: {
    display: 'flex',
    alignItems: 'center',
    gap: '12px',
  },
  barLabel: {
    width: '120px',
    fontSize: '13px',
    color: '#495057',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
  },
  barContainer: {
    flex: 1,
    height: '20px',
    backgroundColor: '#e9ecef',
    borderRadius: '4px',
    overflow: 'hidden',
  },
  bar: {
    height: '100%',
    backgroundColor: '#007bff',
    borderRadius: '4px',
    transition: 'width 0.3s',
  },
  barValue: {
    width: '80px',
    textAlign: 'right',
    fontSize: '13px',
    fontWeight: '500',
    color: '#1a1a2e',
  },
  lineChart: {
    display: 'flex',
    alignItems: 'flex-end',
    gap: '2px',
    height: '120px',
    padding: '10px 0',
  },
  lineBar: {
    flex: 1,
    display: 'flex',
    alignItems: 'flex-end',
    justifyContent: 'center',
  },
  lineBarFill: {
    width: '100%',
    backgroundColor: '#007bff',
    borderRadius: '2px 2px 0 0',
    minHeight: '2px',
    transition: 'height 0.3s',
  },
  chartSummary: {
    fontSize: '14px',
    color: '#495057',
    marginBottom: '8px',
  },
  chartLabels: {
    display: 'flex',
    justifyContent: 'space-between',
    fontSize: '11px',
    color: '#adb5bd',
    marginTop: '4px',
  },
};

// Add CSS keyframes for spinner
const styleSheet = document.createElement('style');
styleSheet.textContent = `
  @keyframes spin {
    from { transform: rotate(0deg); }
    to { transform: rotate(360deg); }
  }

  .toggle-switch input {
    opacity: 0;
    width: 0;
    height: 0;
  }

  .toggle-switch input:checked + .toggle-slider {
    background-color: #28a745;
  }

  .toggle-switch .toggle-slider:before {
    content: "";
    position: absolute;
    height: 20px;
    width: 20px;
    left: 3px;
    bottom: 3px;
    background-color: white;
    transition: .3s;
    border-radius: 50%;
  }

  .toggle-switch input:checked + .toggle-slider:before {
    transform: translateX(24px);
  }
`;
document.head.appendChild(styleSheet);

export default MarketplaceManager;
