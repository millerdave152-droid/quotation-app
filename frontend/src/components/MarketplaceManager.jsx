import React, { useState, useEffect, useRef, useCallback } from 'react';
import { createAuthorizedClient } from '../services/apiClient';
import ProductMappingTool from './ProductMappingTool';
import { handleApiError } from '../utils/errorHandler';

// Create axios instance with auth headers
const axios = createAuthorizedClient();

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

  // New: Inventory Queue & Drift state
  const [queueStatus, setQueueStatus] = useState(null);
  const [driftResults, setDriftResults] = useState(null);
  const [driftLoading, setDriftLoading] = useState(false);
  const [forceSyncing, setForceSyncing] = useState(false);
  const [recentStockImports, setRecentStockImports] = useState([]);

  // New: Offers tab state
  const [offerProducts, setOfferProducts] = useState([]);
  const [offerTotal, setOfferTotal] = useState(0);
  const [offerPage, setOfferPage] = useState(1);
  const [offerSearch, setOfferSearch] = useState('');
  const [selectedOfferProducts, setSelectedOfferProducts] = useState([]);
  const [offerImports, setOfferImports] = useState([]);
  const [pushingOffers, setPushingOffers] = useState(false);

  // New: Settings tab state
  const [pollingStatus, setPollingStatus] = useState(null);
  const [testingConnection, setTestingConnection] = useState(false);
  const [connectionResult, setConnectionResult] = useState(null);

  // New: Orders filter state
  const [orderStateFilter, setOrderStateFilter] = useState('');
  const [orderSearch, setOrderSearch] = useState('');
  const [orderPage, setOrderPage] = useState(1);
  const [orderTotal, setOrderTotal] = useState(0);

  // New: Shipping modal state
  const [showShipModal, setShowShipModal] = useState(false);
  const [shipOrderId, setShipOrderId] = useState(null);
  const [shipForm, setShipForm] = useState({ tracking_number: '', carrier_code: 'canada_post', carrier_name: '', carrier_url: '' });

  // Channels tab state
  const [channels, setChannels] = useState([]);
  const [channelsLoading, setChannelsLoading] = useState(false);
  const [channelDashboard, setChannelDashboard] = useState(null);
  const [showOnboardingModal, setShowOnboardingModal] = useState(false);
  const [onboardingForm, setOnboardingForm] = useState({ channelType: 'MIRAKL', channelCode: '', channelName: '', apiUrl: '', credentials: { api_key: '', shop_id: '' } });
  const [onboardingResult, setOnboardingResult] = useState(null);
  const [selectedChannelDetail, setSelectedChannelDetail] = useState(null);

  // Orders tab enhancements
  const [orderChannelFilter, setOrderChannelFilter] = useState('');
  const [unifiedView, setUnifiedView] = useState(false);

  // Offers tab enhancements
  const [offerChannelFilter, setOfferChannelFilter] = useState('');
  const [listingHealth, setListingHealth] = useState(null);
  const [bundles, setBundles] = useState([]);

  // Pricing tab state
  const [pricingRules, setPricingRules] = useState([]);
  const [pendingApprovals, setPendingApprovals] = useState([]);
  const [priceChangeLog, setPriceChangeLog] = useState([]);
  const [showPricingRuleModal2, setShowPricingRuleModal2] = useState(false);
  const [editingPricingRule, setEditingPricingRule] = useState(null);
  const [pricingRuleForm, setPricingRuleForm] = useState({ ruleName: '', ruleType: 'MIN_MARGIN', conditions: {}, formula: '', priority: 100, active: true });

  // Returns tab state
  const [returns, setReturns] = useState([]);
  const [returnsTotal, setReturnsTotal] = useState(0);
  const [returnsPage, setReturnsPage] = useState(1);
  const [returnStatusFilter, setReturnStatusFilter] = useState('');
  const [returnStats, setReturnStats] = useState(null);
  const [returnRules, setReturnRules] = useState([]);
  const [returnsAnalytics, setReturnsAnalytics] = useState(null);

  // Messages tab state
  const [messageInbox, setMessageInbox] = useState([]);
  const [messageStats, setMessageStats] = useState(null);
  const [messageTemplates, setMessageTemplates] = useState([]);
  const [selectedThread, setSelectedThread] = useState(null);
  const [threadMessages, setThreadMessages] = useState([]);
  const [replyText, setReplyText] = useState('');

  // Analytics tab state
  const [revenueByChannel, setRevenueByChannel] = useState([]);
  const [productPerformance, setProductPerformance] = useState([]);
  const [profitability, setProfitability] = useState(null);
  const [sellThrough, setSellThrough] = useState([]);
  const [kpiSummary, setKpiSummary] = useState(null);
  const [analyticsChannelId, setAnalyticsChannelId] = useState('');
  const [analyticsDays, setAnalyticsDays] = useState(30);

  // Inventory tab enhancements
  const [stockoutAlerts, setStockoutAlerts] = useState([]);
  const [reorderSuggestions, setReorderSuggestions] = useState([]);
  const [overstockAlerts, setOverstockAlerts] = useState([]);

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
        ordersByStateRes,
        queueStatusRes,
        syncHistoryRes
      ] = await Promise.all([
        axios.get(`${API_BASE_URL}/api/marketplace/dashboard-analytics`).catch(() => ({ data: null })),
        axios.get(`${API_BASE_URL}/api/marketplace/sales-chart`).catch(() => ({ data: [] })),
        axios.get(`${API_BASE_URL}/api/marketplace/top-products`).catch(() => ({ data: [] })),
        axios.get(`${API_BASE_URL}/api/marketplace/sales-by-category`).catch(() => ({ data: [] })),
        axios.get(`${API_BASE_URL}/api/marketplace/inventory-health`).catch(() => ({ data: null })),
        axios.get(`${API_BASE_URL}/api/marketplace/activity-feed`).catch(() => ({ data: [] })),
        axios.get(`${API_BASE_URL}/api/marketplace/orders-by-state`).catch(() => ({ data: [] })),
        axios.get(`${API_BASE_URL}/api/marketplace/inventory/queue-status`).catch(() => ({ data: null })),
        axios.get(`${API_BASE_URL}/api/marketplace/sync-history?limit=10`).catch(() => ({ data: [] }))
      ]);

      if (!isMounted.current) return;

      setAnalytics(analyticsRes.data);
      setSalesChart(salesChartRes.data || []);
      setTopProducts(topProductsRes.data || []);
      setSalesByCategory(salesByCategoryRes.data || []);
      setInventoryHealth(inventoryHealthRes.data);
      setActivityFeed(activityFeedRes.data || []);
      setOrdersByState(ordersByStateRes.data || []);
      setQueueStatus(queueStatusRes.data);
      setSyncHistory(syncHistoryRes.data || []);
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

  // Fetch inventory queue status
  const fetchQueueStatus = useCallback(async () => {
    try {
      const response = await axios.get(`${API_BASE_URL}/api/marketplace/inventory/queue-status`);
      setQueueStatus(response.data);
    } catch (err) {
      handleApiError(err, { context: 'Loading queue status', silent: true });
    }
  }, [API_BASE_URL]);

  // Fetch recent stock imports
  const fetchRecentStockImports = useCallback(async () => {
    try {
      const response = await axios.get(`${API_BASE_URL}/api/marketplace/offers/recent-imports`);
      setRecentStockImports((response.data || []).filter(i => i.import_type === 'STOCK'));
    } catch (err) {
      handleApiError(err, { context: 'Loading stock imports', silent: true });
    }
  }, [API_BASE_URL]);

  // Fetch offers/products for Offers tab
  const fetchOfferProducts = useCallback(async (page = 1, search = '') => {
    try {
      const response = await axios.get(`${API_BASE_URL}/api/marketplace/offers/products`, {
        params: { page, limit: 30, search }
      });
      setOfferProducts(response.data?.products || []);
      setOfferTotal(response.data?.total || 0);
    } catch (err) {
      handleApiError(err, { context: 'Loading offer products', silent: true });
    }
  }, [API_BASE_URL]);

  // Fetch offer imports
  const fetchOfferImports = useCallback(async () => {
    try {
      const response = await axios.get(`${API_BASE_URL}/api/marketplace/offers/recent-imports`);
      setOfferImports(response.data || []);
    } catch (err) {
      handleApiError(err, { context: 'Loading offer imports', silent: true });
    }
  }, [API_BASE_URL]);

  // Fetch polling status
  const fetchPollingStatus = useCallback(async () => {
    try {
      const response = await axios.get(`${API_BASE_URL}/api/marketplace/polling-status`);
      setPollingStatus(response.data);
    } catch (err) {
      handleApiError(err, { context: 'Loading polling status', silent: true });
    }
  }, [API_BASE_URL]);

  // Fetch orders with filters
  const fetchFilteredOrders = useCallback(async (state = '', search = '', page = 1) => {
    try {
      const params = { limit: 30, offset: (page - 1) * 30 };
      if (state) params.state = state;
      if (search) params.search = search;
      const response = await axios.get(`${API_BASE_URL}/api/marketplace/orders`, { params });
      const data = response.data;
      setOrders(Array.isArray(data) ? data : data.orders || []);
      setOrderTotal(data.total || (Array.isArray(data) ? data.length : 0));
    } catch (err) {
      handleApiError(err, { context: 'Loading orders', silent: true });
    }
  }, [API_BASE_URL]);

  // === CHANNELS ===
  const fetchChannels = useCallback(async () => {
    setChannelsLoading(true);
    try {
      const response = await axios.get(`${API_BASE_URL}/api/marketplace/channels`);
      setChannels(response.data?.channels || response.data || []);
    } catch (err) {
      handleApiError(err, { context: 'Loading channels', silent: true });
    } finally { setChannelsLoading(false); }
  }, [API_BASE_URL]);

  const fetchChannelDashboard = useCallback(async () => {
    try {
      const response = await axios.get(`${API_BASE_URL}/api/marketplace/channels/dashboard`);
      setChannelDashboard(response.data);
    } catch (err) { handleApiError(err, { context: 'Loading channel dashboard', silent: true }); }
  }, [API_BASE_URL]);

  const fetchChannelDetail = async (channelId) => {
    try {
      const response = await axios.get(`${API_BASE_URL}/api/marketplace/channels/${channelId}`);
      setSelectedChannelDetail(response.data);
    } catch (err) { setError('Failed to load channel details'); }
  };

  const handleTestChannel = async (channelId) => {
    try {
      const response = await axios.post(`${API_BASE_URL}/api/marketplace/channels/${channelId}/test`);
      setMessage(response.data?.connected ? 'Connection successful' : 'Connection failed: ' + (response.data?.message || 'Unknown error'));
    } catch (err) { setError('Test failed: ' + (err.response?.data?.error || err.message)); }
  };

  const handleActivateChannel = async (channelId) => {
    try {
      await axios.put(`${API_BASE_URL}/api/marketplace/channels/${channelId}/activate`);
      setMessage('Channel activated'); fetchChannels(); fetchChannelDashboard();
    } catch (err) { setError('Activation failed: ' + (err.response?.data?.error || err.message)); }
  };

  const handleDeactivateChannel = async (channelId) => {
    if (!window.confirm('Deactivate this channel? Listings will be paused.')) return;
    try {
      await axios.put(`${API_BASE_URL}/api/marketplace/channels/${channelId}/deactivate`);
      setMessage('Channel deactivated'); fetchChannels(); fetchChannelDashboard();
    } catch (err) { setError('Deactivation failed: ' + (err.response?.data?.error || err.message)); }
  };

  const handleOnboardChannel = async () => {
    try {
      const response = await axios.post(`${API_BASE_URL}/api/marketplace/channels/onboard`, onboardingForm);
      setOnboardingResult(response.data);
      if (response.data?.channel) { fetchChannels(); fetchChannelDashboard(); }
    } catch (err) { setError('Onboarding failed: ' + (err.response?.data?.error || err.message)); }
  };

  // === PRICING ENGINE ===
  const fetchPricingRules = useCallback(async (channelId) => {
    try {
      const url = channelId ? `${API_BASE_URL}/api/marketplace/pricing/rules?channelId=${channelId}` : `${API_BASE_URL}/api/marketplace/pricing/rules`;
      const response = await axios.get(url);
      setPricingRules(response.data?.rules || []);
    } catch (err) { handleApiError(err, { context: 'Loading pricing rules', silent: true }); }
  }, [API_BASE_URL]);

  const fetchPendingApprovals = useCallback(async () => {
    try {
      const response = await axios.get(`${API_BASE_URL}/api/marketplace/pricing/pending`);
      setPendingApprovals(response.data?.pending || []);
    } catch (err) { handleApiError(err, { context: 'Loading pending approvals', silent: true }); }
  }, [API_BASE_URL]);

  const fetchPriceChangeLog = useCallback(async () => {
    try {
      const response = await axios.get(`${API_BASE_URL}/api/marketplace/pricing/log?limit=50`);
      setPriceChangeLog(response.data?.log || []);
    } catch (err) { handleApiError(err, { context: 'Loading price log', silent: true }); }
  }, [API_BASE_URL]);

  const handleSavePricingRule = async () => {
    try {
      if (editingPricingRule?.id) {
        await axios.put(`${API_BASE_URL}/api/marketplace/pricing/rules/${editingPricingRule.id}`, pricingRuleForm);
        setMessage('Rule updated');
      } else {
        await axios.post(`${API_BASE_URL}/api/marketplace/pricing/rules`, pricingRuleForm);
        setMessage('Rule created');
      }
      setShowPricingRuleModal2(false); setEditingPricingRule(null); fetchPricingRules();
    } catch (err) { setError('Save failed: ' + (err.response?.data?.error || err.message)); }
  };

  const handleDeletePricingRule = async (ruleId) => {
    if (!window.confirm('Delete this pricing rule?')) return;
    try {
      await axios.delete(`${API_BASE_URL}/api/marketplace/pricing/rules/${ruleId}`);
      setMessage('Rule deleted'); fetchPricingRules();
    } catch (err) { setError('Delete failed: ' + (err.response?.data?.error || err.message)); }
  };

  const handleApproveChange = async (changeId, approved = true) => {
    try {
      await axios.post(`${API_BASE_URL}/api/marketplace/pricing/approve/${changeId}`, { approved });
      setMessage(approved ? 'Price change approved' : 'Price change rejected'); fetchPendingApprovals();
    } catch (err) { setError('Action failed: ' + (err.response?.data?.error || err.message)); }
  };

  // === RETURNS ===
  const fetchReturns = useCallback(async (status = '', page = 1) => {
    try {
      const params = { limit: 30, offset: (page - 1) * 30 };
      if (status) params.status = status;
      const response = await axios.get(`${API_BASE_URL}/api/marketplace/returns`, { params });
      setReturns(response.data?.returns || []);
      setReturnsTotal(response.data?.total || 0);
    } catch (err) { handleApiError(err, { context: 'Loading returns', silent: true }); }
  }, [API_BASE_URL]);

  const fetchReturnStats = useCallback(async () => {
    try {
      const response = await axios.get(`${API_BASE_URL}/api/marketplace/returns/stats`);
      setReturnStats(response.data);
    } catch (err) { handleApiError(err, { context: 'Loading return stats', silent: true }); }
  }, [API_BASE_URL]);

  const fetchReturnRules = useCallback(async () => {
    try {
      const response = await axios.get(`${API_BASE_URL}/api/marketplace/returns/rules`);
      setReturnRules(response.data?.rules || []);
    } catch (err) { handleApiError(err, { context: 'Loading return rules', silent: true }); }
  }, [API_BASE_URL]);

  const fetchReturnsAnalytics = useCallback(async () => {
    try {
      const response = await axios.get(`${API_BASE_URL}/api/marketplace/returns/analytics`);
      setReturnsAnalytics(response.data);
    } catch (err) { handleApiError(err, { context: 'Loading returns analytics', silent: true }); }
  }, [API_BASE_URL]);

  const handleApproveReturn = async (returnId) => {
    try {
      await axios.post(`${API_BASE_URL}/api/marketplace/returns/${returnId}/approve`);
      setMessage('Return approved'); fetchReturns(returnStatusFilter, returnsPage);
    } catch (err) { setError('Approve failed: ' + (err.response?.data?.error || err.message)); }
  };

  const handleRejectReturn = async (returnId) => {
    try {
      await axios.post(`${API_BASE_URL}/api/marketplace/returns/${returnId}/reject`);
      setMessage('Return rejected'); fetchReturns(returnStatusFilter, returnsPage);
    } catch (err) { setError('Reject failed: ' + (err.response?.data?.error || err.message)); }
  };

  // === MESSAGES ===
  const fetchMessageInbox = useCallback(async () => {
    try {
      const response = await axios.get(`${API_BASE_URL}/api/marketplace/messages/inbox`);
      setMessageInbox(response.data?.messages || response.data || []);
    } catch (err) { handleApiError(err, { context: 'Loading inbox', silent: true }); }
  }, [API_BASE_URL]);

  const fetchMessageStats = useCallback(async () => {
    try {
      const response = await axios.get(`${API_BASE_URL}/api/marketplace/messages/stats`);
      setMessageStats(response.data);
    } catch (err) { handleApiError(err, { context: 'Loading message stats', silent: true }); }
  }, [API_BASE_URL]);

  const fetchMessageTemplates = useCallback(async () => {
    try {
      const response = await axios.get(`${API_BASE_URL}/api/marketplace/messages/templates`);
      setMessageTemplates(response.data?.templates || []);
    } catch (err) { handleApiError(err, { context: 'Loading templates', silent: true }); }
  }, [API_BASE_URL]);

  const handleOpenThread = async (threadId, channelId) => {
    try {
      const response = await axios.get(`${API_BASE_URL}/api/marketplace/messages/thread/${threadId}?channelId=${channelId}`);
      setThreadMessages(response.data?.messages || []);
      setSelectedThread(threadId);
    } catch (err) { setError('Failed to load thread'); }
  };

  const handleSendReply = async (messageId) => {
    if (!replyText.trim()) return;
    try {
      await axios.post(`${API_BASE_URL}/api/marketplace/messages/reply/${messageId}`, { body: replyText });
      setReplyText(''); setMessage('Reply sent'); fetchMessageInbox();
      if (selectedThread) handleOpenThread(selectedThread, '');
    } catch (err) { setError('Reply failed: ' + (err.response?.data?.error || err.message)); }
  };

  const handleMarkMessageRead = async (messageId) => {
    try {
      await axios.post(`${API_BASE_URL}/api/marketplace/messages/${messageId}/read`);
      fetchMessageInbox();
    } catch (err) { /* silent */ }
  };

  // === ANALYTICS ===
  const fetchRevenueByChannel = useCallback(async (days = 30) => {
    try {
      const response = await axios.get(`${API_BASE_URL}/api/marketplace/analytics/revenue?days=${days}`);
      setRevenueByChannel(response.data?.data || []);
    } catch (err) { handleApiError(err, { context: 'Loading revenue data', silent: true }); }
  }, [API_BASE_URL]);

  const fetchProductPerformance = useCallback(async (channelId, days = 30) => {
    try {
      const url = channelId ? `${API_BASE_URL}/api/marketplace/analytics/products?channelId=${channelId}&days=${days}` : `${API_BASE_URL}/api/marketplace/analytics/products?days=${days}`;
      const response = await axios.get(url);
      setProductPerformance(response.data?.data || []);
    } catch (err) { handleApiError(err, { context: 'Loading product performance', silent: true }); }
  }, [API_BASE_URL]);

  const fetchProfitability = useCallback(async (channelId, days = 30) => {
    if (!channelId) return;
    try {
      const response = await axios.get(`${API_BASE_URL}/api/marketplace/analytics/profitability/${channelId}?days=${days}`);
      setProfitability(response.data);
    } catch (err) { handleApiError(err, { context: 'Loading profitability', silent: true }); }
  }, [API_BASE_URL]);

  const fetchSellThrough = useCallback(async (channelId, days = 30) => {
    if (!channelId) return;
    try {
      const response = await axios.get(`${API_BASE_URL}/api/marketplace/analytics/sell-through/${channelId}?days=${days}`);
      setSellThrough(response.data?.data || []);
    } catch (err) { handleApiError(err, { context: 'Loading sell-through', silent: true }); }
  }, [API_BASE_URL]);

  const fetchKpiSummary = useCallback(async (days = 30) => {
    try {
      const response = await axios.get(`${API_BASE_URL}/api/marketplace/analytics/kpi?days=${days}`);
      setKpiSummary(response.data);
    } catch (err) { handleApiError(err, { context: 'Loading KPI', silent: true }); }
  }, [API_BASE_URL]);

  // === INVENTORY FORECASTING ===
  const fetchStockoutAlerts = useCallback(async () => {
    try {
      const response = await axios.get(`${API_BASE_URL}/api/marketplace/forecasting/stockout-alerts`);
      setStockoutAlerts(response.data?.data || []);
    } catch (err) { handleApiError(err, { context: 'Loading stockout alerts', silent: true }); }
  }, [API_BASE_URL]);

  const fetchReorderSuggestions = useCallback(async () => {
    try {
      const response = await axios.get(`${API_BASE_URL}/api/marketplace/forecasting/reorder-suggestions`);
      setReorderSuggestions(response.data?.data || []);
    } catch (err) { handleApiError(err, { context: 'Loading reorder suggestions', silent: true }); }
  }, [API_BASE_URL]);

  const fetchOverstockAlerts = useCallback(async () => {
    try {
      const response = await axios.get(`${API_BASE_URL}/api/marketplace/forecasting/overstock`);
      setOverstockAlerts(response.data?.data || []);
    } catch (err) { handleApiError(err, { context: 'Loading overstock alerts', silent: true }); }
  }, [API_BASE_URL]);

  // === BUNDLES ===
  const fetchBundles = useCallback(async () => {
    try {
      const response = await axios.get(`${API_BASE_URL}/api/marketplace/bundles`);
      setBundles(response.data?.data || []);
    } catch (err) { handleApiError(err, { context: 'Loading bundles', silent: true }); }
  }, [API_BASE_URL]);

  // === LISTING HEALTH ===
  const fetchListingHealth = useCallback(async (channelId) => {
    if (!channelId) return;
    try {
      const response = await axios.get(`${API_BASE_URL}/api/marketplace/listings/health/${channelId}`);
      setListingHealth(response.data);
    } catch (err) { handleApiError(err, { context: 'Loading listing health', silent: true }); }
  }, [API_BASE_URL]);

  // Helper: get channel color for badges
  const getChannelColor = (code) => {
    const colors = { BESTBUY_CA: '#0046be', AMAZON_CA: '#ff9900', THEBAY_CA: '#000', WALMART_CA: '#0071ce', EBAY_CA: '#e53238' };
    return colors[(code || '').toUpperCase()] || '#6c757d';
  };

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

    // Set up notification + dashboard auto-refresh (every 60s)
    notificationCheckInterval.current = setInterval(() => {
      fetchNotifications();
      if (activeSection === 'dashboard') fetchDashboardData();
    }, 60000);

    return () => {
      isMounted.current = false;
      if (notificationCheckInterval.current) {
        clearInterval(notificationCheckInterval.current);
      }
    };
  }, [fetchDashboardData, fetchNotifications, fetchSettings, activeSection]);

  // Handlers
  const handleSyncInventory = async () => {
    try {
      setSyncing(true);
      setMessage(null);
      setError(null);

      // Use batch sync for efficiency (100 products per API call)
      const response = await axios.post(`${API_BASE_URL}/api/marketplace/products/batch-sync`, {
        batch_size: 100,
        delay_ms: 5000
      });

      if (response.data.success) {
        const { synced, failed, total } = response.data;
        if (failed > 0) {
          setMessage(`Synced ${synced}/${total} products. ${failed} failed (check logs).`);
        } else {
          setMessage(`Successfully synced ${synced} products to marketplace`);
        }
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

  // Inventory: Drift check
  const handleDriftCheck = async () => {
    setDriftLoading(true);
    setDriftResults(null);
    try {
      const response = await axios.get(`${API_BASE_URL}/api/marketplace/inventory/drift-check`);
      setDriftResults(response.data);
    } catch (err) {
      setError('Drift check failed: ' + (err.response?.data?.error || err.message));
    } finally {
      setDriftLoading(false);
    }
  };

  // Inventory: Force full sync
  const handleForceFullSync = async () => {
    if (!window.confirm('This will push ALL inventory to Best Buy. This is an intensive operation. Are you sure?')) return;
    setForceSyncing(true);
    try {
      const response = await axios.post(`${API_BASE_URL}/api/marketplace/inventory/force-full-sync`, { confirm: true });
      setMessage(`Full sync complete: ${response.data.processed} products pushed`);
      fetchQueueStatus();
      fetchRecentStockImports();
    } catch (err) {
      setError('Force sync failed: ' + (err.response?.data?.error || err.message));
    } finally {
      setForceSyncing(false);
    }
  };

  // Inventory: Sync now
  const handleInventorySyncNow = async () => {
    setInventorySyncing(true);
    try {
      const response = await axios.post(`${API_BASE_URL}/api/marketplace/inventory/sync-now`);
      setMessage(`Inventory sync complete: ${response.data.processed} products pushed`);
      fetchQueueStatus();
      fetchRecentStockImports();
    } catch (err) {
      setError('Sync failed: ' + (err.response?.data?.error || err.message));
    } finally {
      setInventorySyncing(false);
    }
  };

  // Offers: Toggle marketplace enabled
  const handleToggleOfferEnabled = async (productId, currentEnabled) => {
    try {
      await axios.post(`${API_BASE_URL}/api/marketplace/offers/enable`, {
        product_ids: [productId],
        enabled: !currentEnabled
      });
      fetchOfferProducts(offerPage, offerSearch);
    } catch (err) {
      setError('Failed to toggle marketplace status');
    }
  };

  // Offers: Bulk enable/disable
  const handleBulkOfferToggle = async (enabled) => {
    if (selectedOfferProducts.length === 0) return;
    try {
      await axios.post(`${API_BASE_URL}/api/marketplace/offers/enable`, {
        product_ids: selectedOfferProducts,
        enabled
      });
      setSelectedOfferProducts([]);
      setMessage(`${enabled ? 'Enabled' : 'Disabled'} ${selectedOfferProducts.length} products`);
      fetchOfferProducts(offerPage, offerSearch);
    } catch (err) {
      setError('Failed to update marketplace status');
    }
  };

  // Offers: Push all enabled to Best Buy
  const handlePushAllOffers = async () => {
    setPushingOffers(true);
    try {
      const response = await axios.post(`${API_BASE_URL}/api/marketplace/offers/bulk-push`);
      setMessage(`Push complete: ${response.data.synced || 0} synced, ${response.data.failed || 0} failed`);
      fetchOfferProducts(offerPage, offerSearch);
      fetchOfferImports();
    } catch (err) {
      setError('Push failed: ' + (err.response?.data?.error || err.message));
    } finally {
      setPushingOffers(false);
    }
  };

  // Settings: Test connection
  const handleTestConnection = async () => {
    setTestingConnection(true);
    setConnectionResult(null);
    try {
      // Check env-var credentials + sync status via diagnostics endpoint
      const diagRes = await axios.get(`${API_BASE_URL}/api/marketplace/sync-diagnostics`);
      const env = diagRes.data?.environment;

      if (!env?.mirakl_api_key_set) {
        setConnectionResult({ success: false, message: 'MIRAKL_API_KEY not set in server environment' });
        return;
      }
      if (!env?.mirakl_shop_id_set) {
        setConnectionResult({ success: false, message: 'MIRAKL_SHOP_ID not set in server environment' });
        return;
      }

      // Credentials are configured — try a live sync-status check
      const statusRes = await axios.get(`${API_BASE_URL}/api/marketplace/sync-status`);
      if (statusRes.data?.status === 'operational') {
        setConnectionResult({ success: true, message: `Connected — ${statusRes.data.products?.synced_products || 0} products synced` });
      } else {
        setConnectionResult({ success: true, message: 'Credentials configured (API not yet tested live)' });
      }
    } catch (err) {
      setConnectionResult({ success: false, message: err.response?.data?.error || err.message });
    } finally {
      setTestingConnection(false);
    }
  };

  // Ship order
  const handleShipOrder = async () => {
    if (!shipForm.tracking_number) {
      setError('Tracking number is required');
      return;
    }
    try {
      const res = await axios.post(`${API_BASE_URL}/api/marketplace/orders/${shipOrderId}/ship`, {
        trackingNumber: shipForm.tracking_number,
        carrierCode: shipForm.carrier_code,
        carrierName: shipForm.carrier_code === 'other' ? shipForm.carrier_name : undefined,
        carrierUrl: shipForm.carrier_code === 'other' ? shipForm.carrier_url : undefined,
      });
      setMessage(res.data.miraklWarning
        ? `Shipment saved locally. Warning: ${res.data.miraklWarning}`
        : 'Shipment submitted successfully');
      setShowShipModal(false);
      setShipForm({ tracking_number: '', carrier_code: 'canada_post', carrier_name: '', carrier_url: '' });
      fetchFilteredOrders(orderStateFilter, orderSearch, orderPage);
    } catch (err) {
      setError('Ship failed: ' + (err.response?.data?.error?.message || err.response?.data?.error || err.message));
    }
  };

  // Accept single order
  const handleAcceptOrder = async (orderId) => {
    try {
      // Fetch order items to get line IDs (backend requires lines array)
      const detailRes = await axios.get(`${API_BASE_URL}/api/marketplace/orders/${orderId}/detail`);
      const items = detailRes.data?.items || [];
      if (items.length === 0) {
        setError('No order items found to accept');
        return;
      }
      const lines = items.map(item => ({
        lineId: item.mirakl_order_line_id,
        accepted: true
      }));
      await axios.post(`${API_BASE_URL}/api/marketplace/orders/${orderId}/accept`, { lines });
      setMessage('Order accepted');
      fetchFilteredOrders(orderStateFilter, orderSearch, orderPage);
      fetchDashboardData();
    } catch (err) {
      setError('Accept failed: ' + (err.response?.data?.error || err.response?.data?.message || err.message));
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
    const o = orderDetail.order || {};
    const items = orderDetail.items || [];
    const shippingAddr = (() => {
      try { return typeof o.shipping_address === 'string' ? JSON.parse(o.shipping_address) : o.shipping_address; }
      catch { return null; }
    })();
    const deadlineDate = o.acceptance_deadline ? new Date(o.acceptance_deadline) : null;
    const deadlinePast = deadlineDate && deadlineDate < new Date();
    const deadlineSoon = deadlineDate && !deadlinePast && (deadlineDate - new Date()) < 4 * 60 * 60 * 1000;
    const currency = o.currency_code || o.currency || 'CAD';

    const fmtPrice = (v) => {
      const n = parseFloat(v);
      return isNaN(n) ? 'CA$0.00' : 'CA$' + n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    };

    // Parse tax details from items for payment breakdown
    const parseTaxes = (taxJson) => {
      try {
        const arr = typeof taxJson === 'string' ? JSON.parse(taxJson) : taxJson;
        return Array.isArray(arr) ? arr : [];
      } catch { return []; }
    };

    // Compute totals from items
    const productSubtotal = items.reduce((s, it) => s + parseFloat(it.unit_price || 0) * (parseInt(it.quantity) || 1), 0);
    const shippingSubtotal = items.reduce((s, it) => s + parseFloat(it.shipping_amount || 0), 0);
    // Mirakl's taxes array includes ALL taxes (product + shipping)
    // shipping_taxes is the shipping-only subset — subtract to get product-only
    const allTaxesByCode = {};
    const shippingTaxesByCode = {};
    items.forEach(it => {
      parseTaxes(it.taxes).forEach(t => {
        const code = t.code || t.type || 'TAX';
        allTaxesByCode[code] = (allTaxesByCode[code] || 0) + parseFloat(t.amount || 0);
      });
      parseTaxes(it.shipping_taxes).forEach(t => {
        const code = t.code || t.type || 'TAX';
        shippingTaxesByCode[code] = (shippingTaxesByCode[code] || 0) + parseFloat(t.amount || 0);
      });
    });
    // Product-only taxes = all taxes minus shipping taxes
    const productTaxes = {};
    Object.entries(allTaxesByCode).forEach(([code, total]) => {
      const shippingPortion = shippingTaxesByCode[code] || 0;
      const productPortion = total - shippingPortion;
      if (productPortion > 0.001) productTaxes[code] = productPortion;
    });
    const shippingTaxes = shippingTaxesByCode;
    // taxes_total from backend = product taxes + shipping taxes combined
    const totalTaxes = parseFloat(o.taxes_total || o.tax || 0) ||
      (Object.values(allTaxesByCode).reduce((s, v) => s + v, 0) + Object.values(shippingTaxesByCode).reduce((s, v) => s + v, 0));
    // total_price from Mirakl = product + shipping (excl. taxes), add taxes for grand total
    const totalOrder = parseFloat(o.total_price || 0) + totalTaxes;
    const commissionAmt = parseFloat(o.commission_amount || o.commission_fee || 0);

    const sectionHeader = { margin: '0 0 10px', fontSize: '13px', color: '#6c757d', textTransform: 'uppercase', letterSpacing: '0.5px', fontWeight: '600' };
    const detailRow = { margin: '3px 0', fontSize: '13px', lineHeight: '1.5' };

    return (
      <div style={styles.modalOverlay} onClick={() => setOrderDetailId(null)}>
        <div style={{ ...styles.modal, maxWidth: '920px', maxHeight: '92vh', overflow: 'auto' }} onClick={e => e.stopPropagation()}>
          {/* Header */}
          <div style={{ ...styles.modalHeader, borderBottom: '2px solid #0046be', paddingBottom: '12px' }}>
            <div>
              <h3 style={{ ...styles.modalTitle, margin: 0 }}>
                Order {o.mirakl_order_id || o.id}
              </h3>
              <div style={{ display: 'flex', gap: '12px', marginTop: '6px', alignItems: 'center', flexWrap: 'wrap' }}>
                <span style={{ backgroundColor: getOrderStateColor(o.order_state || o.mirakl_order_state), color: '#fff', padding: '2px 10px', borderRadius: '4px', fontSize: '12px', fontWeight: '600' }}>
                  {(o.order_state || o.mirakl_order_state || '').replace(/_/g, ' ')}
                </span>
                <span style={{ fontSize: '13px', color: '#666' }}>
                  Created {o.order_date ? new Date(o.order_date).toLocaleString() : 'N/A'}
                </span>
                {currency !== 'CAD' && <span style={{ fontSize: '12px', color: '#999' }}>({currency})</span>}
              </div>
            </div>
            <button style={styles.closeModalBtn} onClick={() => setOrderDetailId(null)}>x</button>
          </div>

          {/* Acceptance deadline banner */}
          {(o.order_state === 'WAITING_ACCEPTANCE' || o.mirakl_order_state === 'WAITING_ACCEPTANCE') && (
            <div style={{ background: deadlinePast ? '#f8d7da' : deadlineSoon ? '#fff3cd' : '#d4edda', padding: '10px 16px', borderRadius: '6px', marginBottom: '12px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span style={{ fontWeight: '600', color: deadlinePast ? '#721c24' : deadlineSoon ? '#856404' : '#155724' }}>
                {deadlinePast ? 'Acceptance deadline PASSED' : deadlineSoon ? 'Acceptance deadline approaching' : 'Pending acceptance'}
              </span>
              {deadlineDate && (
                <span style={{ fontSize: '13px', color: '#555', fontWeight: '500' }}>
                  Deadline: {deadlineDate.toLocaleString()}
                </span>
              )}
            </div>
          )}

          {/* Top summary row — like Best Buy's header amounts */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '12px', marginBottom: '16px', background: '#f0f4f8', borderRadius: '8px', padding: '14px' }}>
            <div style={{ textAlign: 'center' }}>
              <div style={{ fontSize: '11px', color: '#6c757d', textTransform: 'uppercase', marginBottom: '2px' }}>Total Order Amount</div>
              <div style={{ fontSize: '18px', fontWeight: '700', color: '#212529' }}>{fmtPrice(totalOrder)}</div>
            </div>
            <div style={{ textAlign: 'center' }}>
              <div style={{ fontSize: '11px', color: '#6c757d', textTransform: 'uppercase', marginBottom: '2px' }}>Total Taxes</div>
              <div style={{ fontSize: '18px', fontWeight: '700', color: '#212529' }}>{fmtPrice(totalTaxes)}</div>
            </div>
            <div style={{ textAlign: 'center' }}>
              <div style={{ fontSize: '11px', color: '#6c757d', textTransform: 'uppercase', marginBottom: '2px' }}>Commission Fees</div>
              <div style={{ fontSize: '18px', fontWeight: '700', color: '#dc3545' }}>{fmtPrice(commissionAmt)}</div>
            </div>
            <div style={{ textAlign: 'center' }}>
              <div style={{ fontSize: '11px', color: '#6c757d', textTransform: 'uppercase', marginBottom: '2px' }}>Shipping Charges</div>
              <div style={{ fontSize: '18px', fontWeight: '700', color: '#212529' }}>
                {fmtPrice(shippingSubtotal + Object.values(shippingTaxes).reduce((s, v) => s + v, 0))}
              </div>
            </div>
          </div>

          {/* Items */}
          <div style={{ marginBottom: '16px' }}>
            <h4 style={sectionHeader}>Items ({items.length})</h4>
            {items.map((item, idx) => {
              const imgUrl = item.product_media_url || item.internal_image_url;
              const displayName = item.product_title || item.product_name || item.model || item.offer_sku || item.product_sku;
              return (
                <div key={idx} style={{ display: 'flex', gap: '14px', padding: '12px', background: '#fff', border: '1px solid #e9ecef', borderRadius: '8px', marginBottom: '8px' }}>
                  {imgUrl && (
                    <div style={{ width: '72px', height: '72px', flexShrink: 0, borderRadius: '6px', overflow: 'hidden', border: '1px solid #e9ecef' }}>
                      <img src={imgUrl} alt="" style={{ width: '100%', height: '100%', objectFit: 'contain' }} onError={(e) => { e.target.style.display = 'none'; }} />
                    </div>
                  )}
                  <div style={{ flex: 1 }}>
                    <div style={{ fontWeight: '600', fontSize: '14px', marginBottom: '2px' }}>{displayName}</div>
                    {item.manufacturer && <div style={{ fontSize: '12px', color: '#666' }}>{item.manufacturer}</div>}
                    {item.category_label && <div style={{ fontSize: '11px', color: '#888' }}>{item.category_label}</div>}
                    <div style={{ fontSize: '12px', color: '#888', marginTop: '4px' }}>
                      Offer SKU: <span style={{ fontFamily: 'monospace' }}>{item.offer_sku || item.product_sku || '-'}</span>
                      {item.offer_id && <span style={{ marginLeft: '12px' }}>Offer ID: {item.offer_id}</span>}
                    </div>
                    {item.order_line_state && (
                      <span style={{ display: 'inline-block', marginTop: '4px', fontSize: '11px', padding: '1px 6px', borderRadius: '3px', background: '#e9ecef', color: '#495057' }}>
                        {item.order_line_state.replace(/_/g, ' ')}
                      </span>
                    )}
                  </div>
                  <div style={{ textAlign: 'right', minWidth: '120px', flexShrink: 0 }}>
                    <div style={{ fontSize: '14px', fontWeight: '600' }}>{item.quantity}x {fmtPrice(item.unit_price)}</div>
                    <div style={{ fontSize: '11px', color: '#888' }}>(excl. taxes)</div>
                    {(item.commission_rate || item.expected_commission_rate) && (
                      <div style={{ marginTop: '4px' }}>
                        {item.commission_rate && (
                          <div style={{ fontSize: '11px', color: '#dc3545' }}>
                            Actual: {parseFloat(item.commission_rate).toFixed(1)}%
                          </div>
                        )}
                        {item.expected_commission_rate && (
                          <div style={{ fontSize: '11px', color: parseFloat(item.expected_commission_rate) !== parseFloat(item.commission_rate) ? '#e67e22' : '#28a745' }}>
                            Expected: {parseFloat(item.expected_commission_rate).toFixed(1)}%
                            {item.commission_rate && parseFloat(item.expected_commission_rate) !== parseFloat(item.commission_rate) && (
                              <span style={{ marginLeft: '4px', fontSize: '10px', background: '#fff3cd', color: '#856404', padding: '0 4px', borderRadius: '3px' }}>
                                differs
                              </span>
                            )}
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>

          {/* Payment Details — matching Best Buy's per-tax breakdown */}
          <div style={{ background: '#f8f9fa', borderRadius: '8px', padding: '16px', marginBottom: '16px' }}>
            <h4 style={sectionHeader}>Payment Details</h4>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr auto', gap: '4px 20px', maxWidth: '400px' }}>
              {/* Product prices */}
              {items.map((item, idx) => (
                <React.Fragment key={`price-${idx}`}>
                  <span style={detailRow}>Product price {item.quantity > 1 ? `${item.quantity}x ` : ''}</span>
                  <span style={{ ...detailRow, textAlign: 'right' }}>{fmtPrice(parseFloat(item.unit_price || 0) * (parseInt(item.quantity) || 1))}</span>
                </React.Fragment>
              ))}
              {/* Product taxes */}
              {Object.entries(productTaxes).map(([code, amt]) => (
                <React.Fragment key={`ptax-${code}`}>
                  <span style={{ ...detailRow, color: '#555' }}>{code}</span>
                  <span style={{ ...detailRow, textAlign: 'right', color: '#555' }}>{fmtPrice(amt)}</span>
                </React.Fragment>
              ))}
              {/* Shipping */}
              {shippingSubtotal > 0 && (
                <>
                  <span style={detailRow}>Shipping charges</span>
                  <span style={{ ...detailRow, textAlign: 'right' }}>{fmtPrice(shippingSubtotal)}</span>
                </>
              )}
              {/* Shipping taxes */}
              {Object.entries(shippingTaxes).map(([code, amt]) => (
                <React.Fragment key={`stax-${code}`}>
                  <span style={{ ...detailRow, color: '#555' }}>{code} (shipping)</span>
                  <span style={{ ...detailRow, textAlign: 'right', color: '#555' }}>{fmtPrice(amt)}</span>
                </React.Fragment>
              ))}
              <div style={{ gridColumn: '1 / -1', borderTop: '2px solid #dee2e6', margin: '6px 0' }} />
              <span style={{ ...detailRow, fontWeight: '700', fontSize: '15px' }}>Total</span>
              <span style={{ ...detailRow, textAlign: 'right', fontWeight: '700', fontSize: '15px' }}>{fmtPrice(totalOrder)}</span>
            </div>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px', marginBottom: '16px' }}>
            {/* Customer Info */}
            <div style={{ background: '#fff', border: '1px solid #e9ecef', borderRadius: '8px', padding: '14px' }}>
              <h4 style={sectionHeader}>Customer</h4>
              <p style={detailRow}><strong>Name:</strong> {o.customer_name || 'N/A'}</p>
              {o.customer_email && <p style={detailRow}><strong>Email:</strong> {o.customer_email}</p>}
              {o.customer_phone && <p style={detailRow}><strong>Phone:</strong> {o.customer_phone}</p>}
              {o.customer_locale && <p style={detailRow}><strong>Language:</strong> {o.customer_locale.replace('_', ' - ')}</p>}
              {o.customer_id && <p style={detailRow}><strong>Matched Customer:</strong> #{o.customer_id}</p>}
            </div>

            {/* Shipping Info */}
            <div style={{ background: '#fff', border: '1px solid #e9ecef', borderRadius: '8px', padding: '14px' }}>
              <h4 style={sectionHeader}>Shipping</h4>
              {o.shipping_zone_label && <p style={detailRow}><strong>Zone:</strong> {o.shipping_zone_label}</p>}
              {o.shipping_type_label && <p style={detailRow}><strong>Method:</strong> {o.shipping_type_label}</p>}
              {(o.delivery_date_start || o.delivery_date_end) && (
                <p style={detailRow}>
                  <strong>Expected Delivery:</strong>{' '}
                  {o.delivery_date_start ? new Date(o.delivery_date_start).toLocaleDateString() : '?'}
                  {' to '}
                  {o.delivery_date_end ? new Date(o.delivery_date_end).toLocaleDateString() : '?'}
                </p>
              )}
              {o.leadtime_to_ship != null && <p style={detailRow}><strong>Lead Time:</strong> {o.leadtime_to_ship} days</p>}
              {deadlineDate && <p style={detailRow}><strong>Acceptance Deadline:</strong> {deadlineDate.toLocaleString()}</p>}
              {o.shipped_date && <p style={detailRow}><strong>Shipped:</strong> {new Date(o.shipped_date).toLocaleString()}</p>}
              {o.delivered_date && <p style={detailRow}><strong>Delivered:</strong> {new Date(o.delivered_date).toLocaleString()}</p>}
            </div>
          </div>

          {/* Shipping Address */}
          {shippingAddr && (
            <div style={{ background: '#fff', border: '1px solid #e9ecef', borderRadius: '8px', padding: '14px', marginBottom: '16px' }}>
              <h4 style={sectionHeader}>Shipping Address</h4>
              <p style={{ margin: '0', lineHeight: '1.6', fontSize: '13px' }}>
                {[
                  shippingAddr.firstname && shippingAddr.lastname ? `${shippingAddr.firstname} ${shippingAddr.lastname}` : null,
                  shippingAddr.street_1 || shippingAddr.street,
                  shippingAddr.street_2,
                  [shippingAddr.city, shippingAddr.state || shippingAddr.province, shippingAddr.zip_code || shippingAddr.postal_code].filter(Boolean).join(', '),
                  shippingAddr.country || shippingAddr.country_iso_code
                ].filter(Boolean).map((line, i) => <span key={i}>{line}<br /></span>)}
              </p>
            </div>
          )}

          {/* Commission Summary */}
          {(() => {
            const expectedTotal = items.reduce((sum, it) => {
              if (!it.expected_commission_rate) return sum;
              const lineAmt = parseFloat(it.unit_price || 0) * (parseInt(it.quantity) || 1);
              return sum + (lineAmt * parseFloat(it.expected_commission_rate) / 100);
            }, 0);
            const hasExpected = items.some(it => it.expected_commission_rate);
            const ratesDiffer = hasExpected && items.some(it =>
              it.commission_rate && it.expected_commission_rate &&
              parseFloat(it.commission_rate).toFixed(1) !== parseFloat(it.expected_commission_rate).toFixed(1)
            );

            return (
              <div style={{ background: ratesDiffer ? '#fff3cd' : '#f0f9f0', borderRadius: '8px', padding: '14px', marginBottom: '16px', border: ratesDiffer ? '1px solid #ffc107' : '1px solid #c3e6cb' }}>
                <h4 style={sectionHeader}>
                  Commission Summary
                  {ratesDiffer && (
                    <span style={{ marginLeft: '8px', fontSize: '11px', background: '#ffc107', color: '#856404', padding: '2px 8px', borderRadius: '4px', fontWeight: '600', textTransform: 'none', letterSpacing: 0 }}>
                      Rate Mismatch
                    </span>
                  )}
                </h4>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr auto', gap: '4px 20px', maxWidth: '400px' }}>
                  <span style={detailRow}>Actual Commission Rate (Mirakl)</span>
                  <span style={{ ...detailRow, textAlign: 'right' }}>{o.commission_rate ? parseFloat(o.commission_rate).toFixed(1) + '%' : 'N/A'}</span>
                  <span style={detailRow}>Actual Commission Amount</span>
                  <span style={{ ...detailRow, textAlign: 'right', color: '#dc3545', fontWeight: '600' }}>-{fmtPrice(commissionAmt)}</span>
                  {hasExpected && (
                    <>
                      <div style={{ gridColumn: '1 / -1', borderTop: '1px dashed #ccc', margin: '4px 0' }} />
                      <span style={{ ...detailRow, color: '#555' }}>Expected Commission (per schedule)</span>
                      <span style={{ ...detailRow, textAlign: 'right', color: ratesDiffer ? '#e67e22' : '#555' }}>-{fmtPrice(expectedTotal)}</span>
                      {ratesDiffer && (
                        <>
                          <span style={{ ...detailRow, color: '#856404', fontSize: '12px' }}>Difference</span>
                          <span style={{ ...detailRow, textAlign: 'right', color: '#856404', fontSize: '12px', fontWeight: '600' }}>
                            {commissionAmt > expectedTotal ? '+' : ''}{fmtPrice(commissionAmt - expectedTotal)}
                          </span>
                        </>
                      )}
                    </>
                  )}
                  <div style={{ gridColumn: '1 / -1', borderTop: '1px solid #e0d5a8', margin: '4px 0' }} />
                  <span style={{ ...detailRow, fontWeight: '700', color: '#28a745' }}>Net Revenue</span>
                  <span style={{ ...detailRow, textAlign: 'right', fontWeight: '700', color: '#28a745', fontSize: '15px' }}>{fmtPrice(totalOrder - commissionAmt)}</span>
                </div>
              </div>
            );
          })()}

          {/* Shipments */}
          {orderDetail.shipments?.length > 0 && (
            <div style={{ marginBottom: '16px' }}>
              <h4 style={sectionHeader}>Shipments</h4>
              {orderDetail.shipments.map((ship, idx) => (
                <div key={idx} style={{ background: '#f8f9fa', borderRadius: '6px', padding: '12px', marginBottom: '8px' }}>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '8px' }}>
                    <p style={{ margin: 0, fontSize: '13px' }}><strong>Carrier:</strong> {ship.carrier_name || ship.carrier_code || 'N/A'}</p>
                    <p style={{ margin: 0, fontSize: '13px' }}><strong>Tracking:</strong> {ship.tracking_number || 'N/A'}</p>
                    <p style={{ margin: 0, fontSize: '13px' }}><strong>Status:</strong> {ship.shipment_status || 'N/A'}</p>
                  </div>
                  {ship.shipped_at && <p style={{ margin: '4px 0 0', fontSize: '12px', color: '#666' }}>Shipped: {new Date(ship.shipped_at).toLocaleString()}</p>}
                </div>
              ))}
            </div>
          )}

          {/* Action Buttons */}
          <div style={{ display: 'flex', gap: '12px', marginTop: '8px', justifyContent: 'flex-end', borderTop: '1px solid #e9ecef', paddingTop: '14px' }}>
            {(o.order_state === 'WAITING_ACCEPTANCE' || o.mirakl_order_state === 'WAITING_ACCEPTANCE') && (
              <button
                style={{ ...styles.button, ...styles.primaryButton, background: '#0046be' }}
                onClick={() => { setOrderDetailId(null); handleAcceptOrder(o.id); }}
              >
                Accept Order
              </button>
            )}
            {(o.order_state === 'SHIPPING' || o.mirakl_order_state === 'SHIPPING') && (
              <button
                style={{ ...styles.button, ...styles.primaryButton }}
                onClick={() => { setOrderDetailId(null); setShipOrderId(o.id); setShowShipModal(true); }}
              >
                Ship Order
              </button>
            )}
            <button style={styles.button} onClick={() => setOrderDetailId(null)}>Close</button>
          </div>
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
                backgroundColor: !analytics ? '#6c757d' : getSyncStatusColor(analytics.sync_status)
              }}
            />
            <span style={styles.syncText}>
              {!analytics ? 'Loading' :
               analytics.sync_status === 'green' ? 'Synced' :
               analytics.sync_status === 'yellow' ? 'Stale' : 'Sync Failed'}
            </span>
          </div>
        </div>
      </div>

      {/* Section Navigation — 10 tabs */}
      <div style={styles.sectionNav}>
        {[
          { key: 'dashboard', label: 'Overview', onSwitch: () => { fetchChannelDashboard(); fetchStockoutAlerts(); } },
          { key: 'orders', label: 'Orders', onSwitch: () => { fetchFilteredOrders(orderStateFilter, orderSearch, 1); fetchAutoRules(); fetchChannels(); } },
          { key: 'offers', label: 'Offers', onSwitch: () => { fetchOfferProducts(1, ''); fetchOfferImports(); fetchChannels(); fetchBundles(); } },
          { key: 'inventory', label: 'Inventory', onSwitch: () => { fetchQueueStatus(); fetchRecentStockImports(); fetchSyncSettings(); fetchSyncHistory(); fetchInventoryProducts(1, ''); fetchStockoutAlerts(); fetchReorderSuggestions(); fetchOverstockAlerts(); } },
          { key: 'channels', label: 'Channels', onSwitch: () => { fetchChannels(); fetchChannelDashboard(); } },
          { key: 'pricing', label: 'Pricing', onSwitch: () => { fetchPricingRules(); fetchPendingApprovals(); fetchPriceChangeLog(); } },
          { key: 'returns', label: 'Returns', onSwitch: () => { fetchReturns('', 1); fetchReturnStats(); fetchReturnRules(); fetchReturnsAnalytics(); } },
          { key: 'messages', label: 'Messages', onSwitch: () => { fetchMessageInbox(); fetchMessageStats(); fetchMessageTemplates(); } },
          { key: 'analytics', label: 'Analytics', onSwitch: () => { fetchRevenueByChannel(analyticsDays); fetchProductPerformance(null, analyticsDays); fetchKpiSummary(analyticsDays); fetchChannels(); } },
          { key: 'settings', label: 'Settings', onSwitch: () => { fetchPollingStatus(); fetchSettings(); fetchSyncSettings(); fetchPriceRules(); fetchChannels(); } },
        ].map(tab => (
          <button
            key={tab.key}
            style={{
              ...styles.navButton,
              ...(activeSection === tab.key ? styles.navButtonActive : {})
            }}
            onClick={() => { setActiveSection(tab.key); tab.onSwitch(); }}
          >
            {tab.label}
          </button>
        ))}
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


      {/* Orders Section — Enhanced with filters */}
      {activeSection === 'orders' && (
        <div style={styles.section}>
          <div style={styles.sectionHeader}>
            <h2 style={styles.sectionTitle}>Marketplace Orders</h2>
            <div style={styles.orderActions}>
              <button style={{ ...styles.button, ...styles.primaryButton }} onClick={handlePullOrders} disabled={pulling}>
                {pulling ? 'Pulling...' : 'Pull New Orders'}
              </button>
            </div>
          </div>

          {/* Unified View Toggle + Filters Bar */}
          <div style={{ display: 'flex', gap: '12px', marginBottom: '16px', flexWrap: 'wrap', alignItems: 'center' }}>
            <label style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '13px', fontWeight: '500', cursor: 'pointer', padding: '8px 12px', background: unifiedView ? '#e3f2fd' : '#fff', border: '1px solid #ced4da', borderRadius: '6px' }}>
              <input type="checkbox" checked={unifiedView} onChange={(e) => setUnifiedView(e.target.checked)} />
              Unified View (incl. POS)
            </label>
            <select
              style={{ ...styles.select, width: '180px' }}
              value={orderChannelFilter}
              onChange={(e) => { setOrderChannelFilter(e.target.value); setOrderPage(1); }}
            >
              <option value="">All Channels</option>
              {channels.map(ch => (
                <option key={ch.id} value={ch.id}>{ch.channel_name || ch.channel_code}</option>
              ))}
            </select>
            <select
              style={{ ...styles.select, width: '200px' }}
              value={orderStateFilter}
              onChange={(e) => { setOrderStateFilter(e.target.value); setOrderPage(1); fetchFilteredOrders(e.target.value, orderSearch, 1); }}
            >
              <option value="">All States</option>
              <option value="WAITING_ACCEPTANCE">Waiting Acceptance</option>
              <option value="SHIPPING">Awaiting Shipment</option>
              <option value="SHIPPED">Shipped</option>
              <option value="RECEIVED">Received</option>
              <option value="REFUSED">Refused</option>
              <option value="CANCELED">Cancelled</option>
            </select>
            <input
              type="text"
              placeholder="Search orders..."
              value={orderSearch}
              onChange={(e) => setOrderSearch(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') { setOrderPage(1); fetchFilteredOrders(orderStateFilter, orderSearch, 1); } }}
              style={{ ...styles.input, width: '200px' }}
            />
            <button style={{ ...styles.button, ...styles.outlineButton }} onClick={() => fetchFilteredOrders(orderStateFilter, orderSearch, 1)}>
              Search
            </button>
          </div>

          {/* Batch Actions Bar */}
          {selectedOrders.length > 0 && (
            <div style={styles.batchActionsBar}>
              <span style={styles.selectedCount}>{selectedOrders.length} selected</span>
              <div style={styles.batchButtons}>
                <button style={{ ...styles.button, ...styles.primaryButton }} onClick={handleBatchAccept} disabled={batchProcessing}>Accept Selected</button>
                <button style={{ ...styles.button, ...styles.dangerButton }} onClick={() => setShowRejectModal(true)} disabled={batchProcessing}>Reject Selected</button>
                <button style={{ ...styles.button, ...styles.secondaryButton }} onClick={handleGeneratePackingSlips}>Packing Slips</button>
                <button style={{ ...styles.button, ...styles.outlineButton }} onClick={() => handleExportOrders('csv')}>Export CSV</button>
              </div>
            </div>
          )}

          {/* Orders Table */}
          <div style={styles.tableContainer}>
            <table style={styles.table}>
              <thead>
                <tr>
                  <th style={styles.checkboxCell}>
                    <input type="checkbox" checked={selectedOrders.length > 0 && selectedOrders.length === orders.filter(o => o.order_state === 'WAITING_ACCEPTANCE').length} onChange={handleSelectAllOrders} />
                  </th>
                  <th style={styles.th}>Order ID</th>
                  <th style={styles.th}>Channel</th>
                  <th style={styles.th}>Customer</th>
                  <th style={styles.th}>Date</th>
                  <th style={styles.th}>State</th>
                  <th style={styles.th}>Items</th>
                  <th style={styles.th}>Total</th>
                  <th style={styles.th}>Commission</th>
                  <th style={styles.th}>Deadline</th>
                  <th style={styles.th}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {orders.map(order => {
                  const deadline = order.acceptance_deadline ? new Date(order.acceptance_deadline) : null;
                  const minsLeft = deadline ? Math.floor((deadline - Date.now()) / 60000) : null;
                  return (
                    <tr key={order.id}>
                      <td style={styles.checkboxCell}>
                        {order.order_state === 'WAITING_ACCEPTANCE' && (
                          <input type="checkbox" checked={selectedOrders.includes(order.id)} onChange={() => handleSelectOrder(order.id)} />
                        )}
                      </td>
                      <td style={styles.td}>{order.mirakl_order_id?.substring(0, 10) || order.id}</td>
                      <td style={styles.td}>
                        {(() => {
                          const ch = channels.find(c => c.id === order.channel_id);
                          const code = ch?.channel_code || order.channel_code || 'BESTBUY_CA';
                          return <span style={{ ...styles.statusBadge, backgroundColor: getChannelColor(code), color: '#fff', fontSize: '11px' }}>{ch?.channel_name || code}</span>;
                        })()}
                      </td>
                      <td style={styles.td}>{order.customer_name || 'N/A'}</td>
                      <td style={styles.td}>{order.order_date ? new Date(order.order_date).toLocaleDateString() : 'N/A'}</td>
                      <td style={styles.td}>
                        <span style={{ ...styles.statusBadge, backgroundColor: getOrderStateColor(order.order_state || order.mirakl_order_state), color: '#fff' }}>
                          {(order.order_state || order.mirakl_order_state || '').replace(/_/g, ' ')}
                        </span>
                      </td>
                      <td style={styles.td}>{order.item_count || order.items_count || '-'}</td>
                      <td style={styles.td}>{formatCurrency((order.total_price_cents || 0) / 100)}</td>
                      <td style={styles.td}>{order.commission_amount ? formatCurrency(order.commission_amount) : '-'}</td>
                      <td style={styles.td}>
                        {order.order_state === 'WAITING_ACCEPTANCE' && minsLeft !== null ? (
                          <span style={{ color: minsLeft < 30 ? '#dc3545' : minsLeft < 120 ? '#f59e0b' : '#28a745', fontWeight: '600', fontSize: '13px' }}>
                            {minsLeft < 60 ? `${minsLeft}m` : `${Math.floor(minsLeft / 60)}h ${minsLeft % 60}m`}
                          </span>
                        ) : ''}
                      </td>
                      <td style={styles.td}>
                        <div style={{ display: 'flex', gap: '4px' }}>
                          {order.order_state === 'WAITING_ACCEPTANCE' && (
                            <button style={{ ...styles.button, ...styles.smallButton, backgroundColor: '#28a745', color: '#fff' }} onClick={() => handleAcceptOrder(order.id)}>Accept</button>
                          )}
                          {order.order_state === 'SHIPPING' && (
                            <button style={{ ...styles.button, ...styles.smallButton, ...styles.primaryButton }} onClick={() => { setShipOrderId(order.id); setShowShipModal(true); }}>Ship</button>
                          )}
                          <button style={{ ...styles.button, ...styles.smallButton }} onClick={() => handleViewOrderDetail(order.id)}>View</button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
                {orders.length === 0 && (
                  <tr><td colSpan="11" style={styles.noDataCell}>No orders found. Click "Pull New Orders" to fetch orders from Best Buy.</td></tr>
                )}
              </tbody>
            </table>
          </div>

          {/* Pagination */}
          {orderTotal > 30 && (
            <div style={{ display: 'flex', justifyContent: 'center', gap: '10px', marginTop: '16px' }}>
              <button style={styles.button} disabled={orderPage === 1} onClick={() => { setOrderPage(p => p - 1); fetchFilteredOrders(orderStateFilter, orderSearch, orderPage - 1); }}>Previous</button>
              <span style={{ padding: '8px' }}>Page {orderPage} of {Math.ceil(orderTotal / 30)}</span>
              <button style={styles.button} disabled={orderPage >= Math.ceil(orderTotal / 30)} onClick={() => { setOrderPage(p => p + 1); fetchFilteredOrders(orderStateFilter, orderSearch, orderPage + 1); }}>Next</button>
            </div>
          )}

          {/* Automation Rules sub-section */}
          <div style={{ marginTop: '32px' }}>
            <div style={styles.sectionHeader}>
              <h3 style={{ ...styles.sectionTitle, fontSize: '18px' }}>Automation Rules</h3>
              <button style={{ ...styles.button, ...styles.primaryButton }} onClick={() => { setEditingRule(null); setShowRuleModal(true); }}>+ Create Rule</button>
            </div>
            <div style={styles.rulesGrid}>
              {autoRules.map(rule => (
                <div key={rule.id} style={styles.ruleCard}>
                  <div style={styles.ruleHeader}>
                    <div>
                      <h4 style={styles.ruleName}>{rule.name}</h4>
                      <span style={{ ...styles.ruleTypeBadge, backgroundColor: rule.rule_type === 'auto_accept' ? '#d4edda' : rule.rule_type === 'auto_reject' ? '#f8d7da' : '#fff3cd', color: rule.rule_type === 'auto_accept' ? '#155724' : rule.rule_type === 'auto_reject' ? '#721c24' : '#856404' }}>
                        {rule.rule_type.replace('_', ' ')}
                      </span>
                    </div>
                  </div>
                  <p style={styles.ruleDescription}>{rule.description || 'No description'}</p>
                  <div style={styles.ruleStats}><span>Triggered: {rule.trigger_count || 0}x</span></div>
                  <div style={styles.ruleActions}>
                    <button style={{ ...styles.button, ...styles.smallButton }} onClick={() => { setEditingRule(rule); setShowRuleModal(true); }}>Edit</button>
                    <button style={{ ...styles.button, ...styles.smallButton, ...styles.dangerButton }} onClick={() => handleDeleteRule(rule.id)}>Delete</button>
                    <button style={{ ...styles.button, ...styles.smallButton }} onClick={() => handleToggleRule(rule.id)}>{rule.enabled ? 'Disable' : 'Enable'}</button>
                  </div>
                </div>
              ))}
              {autoRules.length === 0 && <div style={styles.noData}>No automation rules. Create one to auto-process orders.</div>}
            </div>
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
          {/* Top Row: Operational Stat Cards */}
          <div style={styles.kpiGrid}>
            <div style={{ ...styles.kpiCard, borderLeft: '4px solid #ffc107' }}>
              <div style={{ ...styles.kpiIcon, backgroundColor: '#fff8e1' }}>!</div>
              <div style={styles.kpiContent}>
                <div style={styles.kpiLabel}>Pending Acceptance</div>
                <div style={styles.kpiValue}>
                  {analytics?.orders?.pending_acceptance || ordersByState.find(s => s.order_state === 'WAITING_ACCEPTANCE')?.count || 0}
                  {(analytics?.orders?.urgent_acceptance > 0) && (
                    <span style={{ ...styles.statusBadge, backgroundColor: '#dc3545', color: '#fff', marginLeft: '8px', fontSize: '12px', verticalAlign: 'middle' }}>
                      {analytics.orders.urgent_acceptance} urgent
                    </span>
                  )}
                </div>
                <div style={styles.kpiSubtext}>Orders awaiting review</div>
              </div>
            </div>

            <div style={{ ...styles.kpiCard, borderLeft: '4px solid #17a2b8' }}>
              <div style={{ ...styles.kpiIcon, backgroundColor: '#e3f2fd' }}>📦</div>
              <div style={styles.kpiContent}>
                <div style={styles.kpiLabel}>Awaiting Shipment</div>
                <div style={styles.kpiValue}>
                  {ordersByState.find(s => s.order_state === 'SHIPPING')?.count || 0}
                </div>
                <div style={styles.kpiSubtext}>Ready to ship</div>
              </div>
            </div>

            <div style={{ ...styles.kpiCard, borderLeft: '4px solid #28a745' }}>
              <div style={{ ...styles.kpiIcon, backgroundColor: '#e8f5e9' }}>&#10003;</div>
              <div style={styles.kpiContent}>
                <div style={styles.kpiLabel}>Shipped Today</div>
                <div style={styles.kpiValue}>{analytics?.orders?.shipped_today || 0}</div>
                <div style={styles.kpiSubtext}>Dispatched today</div>
              </div>
            </div>

            <div style={{ ...styles.kpiCard, borderLeft: `4px solid ${(queueStatus?.pendingChanges > 0) ? '#f59e0b' : '#28a745'}` }}>
              <div style={{ ...styles.kpiIcon, backgroundColor: (queueStatus?.pendingChanges > 0) ? '#fff8e1' : '#e8f5e9' }}>&#8693;</div>
              <div style={styles.kpiContent}>
                <div style={styles.kpiLabel}>Inventory Queue</div>
                <div style={styles.kpiValue}>{queueStatus?.pendingChanges ?? '...'}</div>
                <div style={styles.kpiSubtext}>
                  {queueStatus?.lastSync ? `Last sync: ${formatRelativeTime(queueStatus.lastSync)}` : 'No recent sync'}
                </div>
              </div>
            </div>
          </div>

          {/* Revenue Row */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '20px', marginBottom: '24px' }}>
            <div style={styles.kpiCard}>
              <div style={{ ...styles.kpiIcon, backgroundColor: '#e8f5e9' }}>$</div>
              <div style={styles.kpiContent}>
                <div style={styles.kpiLabel}>30-Day Revenue</div>
                <div style={styles.kpiValue}>{formatCurrency(analytics?.revenue?.this_month || 0)}</div>
              </div>
            </div>
            <div style={styles.kpiCard}>
              <div style={{ ...styles.kpiIcon, backgroundColor: '#fce4ec' }}>%</div>
              <div style={styles.kpiContent}>
                <div style={styles.kpiLabel}>30-Day Commission</div>
                <div style={styles.kpiValue}>{formatCurrency(analytics?.commission?.this_month || 0)}</div>
              </div>
            </div>
            <div style={styles.kpiCard}>
              <div style={{ ...styles.kpiIcon, backgroundColor: '#e3f2fd' }}>&#8594;</div>
              <div style={styles.kpiContent}>
                <div style={styles.kpiLabel}>Net Revenue</div>
                <div style={styles.kpiValue}>{formatCurrency((analytics?.revenue?.this_month || 0) - (analytics?.commission?.this_month || 0))}</div>
              </div>
            </div>
          </div>

          {/* Multi-Channel Stats Row */}
          {channelDashboard && channelDashboard.channels && channelDashboard.channels.length > 0 && (
            <div style={{ display: 'grid', gridTemplateColumns: `repeat(${Math.min(channelDashboard.channels.length, 4)}, 1fr)`, gap: '16px', marginBottom: '24px' }}>
              {channelDashboard.channels.map((ch, i) => (
                <div key={i} style={{ ...styles.kpiCard, borderLeft: `4px solid ${getChannelColor(ch.channel_code)}`, cursor: 'pointer' }} onClick={() => { setActiveSection('channels'); fetchChannelDetail(ch.id); }}>
                  <div style={styles.kpiContent}>
                    <div style={{ ...styles.kpiLabel, display: 'flex', alignItems: 'center', gap: '6px' }}>
                      <span style={{ width: '8px', height: '8px', borderRadius: '50%', backgroundColor: ch.status === 'ACTIVE' ? '#28a745' : '#6c757d', display: 'inline-block' }} />
                      {ch.channel_name || ch.channel_code}
                    </div>
                    <div style={styles.kpiValue}>{formatCurrency(ch.revenue_30d || ch.total_revenue || 0)}</div>
                    <div style={styles.kpiSubtext}>{ch.order_count || ch.orders_30d || 0} orders</div>
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* Alert Widgets Row */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '16px', marginBottom: '24px' }}>
            <div style={{ ...styles.card, padding: '16px', borderLeft: '4px solid #dc3545', cursor: 'pointer' }} onClick={() => setActiveSection('inventory')}>
              <div style={{ fontSize: '13px', color: '#6c757d', marginBottom: '4px' }}>Stockout Alerts</div>
              <div style={{ fontSize: '24px', fontWeight: '700', color: '#dc3545' }}>{stockoutAlerts.length}</div>
              <div style={{ fontSize: '12px', color: '#adb5bd' }}>Products at risk</div>
            </div>
            <div style={{ ...styles.card, padding: '16px', borderLeft: '4px solid #ffc107', cursor: 'pointer' }} onClick={() => setActiveSection('messages')}>
              <div style={{ fontSize: '13px', color: '#6c757d', marginBottom: '4px' }}>Unread Messages</div>
              <div style={{ fontSize: '24px', fontWeight: '700', color: '#ffc107' }}>{messageStats?.unread || unreadCount || 0}</div>
              <div style={{ fontSize: '12px', color: '#adb5bd' }}>Awaiting response</div>
            </div>
            <div style={{ ...styles.card, padding: '16px', borderLeft: '4px solid #17a2b8', cursor: 'pointer' }} onClick={() => setActiveSection('returns')}>
              <div style={{ fontSize: '13px', color: '#6c757d', marginBottom: '4px' }}>Pending Returns</div>
              <div style={{ fontSize: '24px', fontWeight: '700', color: '#17a2b8' }}>{returnStats?.pending || 0}</div>
              <div style={{ fontSize: '12px', color: '#adb5bd' }}>Awaiting review</div>
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
                <h3 style={styles.cardTitle}>Sync Activity</h3>
                <div style={styles.activityList}>
                  {syncHistory.slice(0, 10).map((entry, index) => (
                    <div key={index} style={styles.activityItem}>
                      <span style={styles.activityIcon}>
                        {entry.status === 'completed' || entry.status === 'SUCCESS' ? '✓' : entry.status === 'FAILED' ? '✗' : '~'}
                      </span>
                      <div style={styles.activityContent}>
                        <div style={styles.activityTitle}>
                          {(entry.sync_type || entry.job_type || 'sync').replace(/_/g, ' ')}
                        </div>
                        <div style={styles.activityDesc}>
                          <span style={{
                            color: (entry.status === 'completed' || entry.status === 'SUCCESS') ? '#28a745' :
                                   entry.status === 'FAILED' ? '#dc3545' : '#ffc107',
                            fontWeight: '500'
                          }}>
                            {entry.status}
                          </span>
                          {entry.records_processed > 0 && ` — ${entry.records_processed} processed`}
                        </div>
                      </div>
                      <div style={styles.activityTime}>
                        {formatRelativeTime(entry.started_at || entry.created_at || entry.sync_start_time)}
                      </div>
                    </div>
                  ))}
                  {syncHistory.length === 0 && activityFeed.length === 0 && (
                    <div style={styles.noData}>No recent activity</div>
                  )}
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

      {/* ============ TAB 3: OFFERS ============ */}
      {activeSection === 'offers' && (
        <div style={styles.section}>
          <div style={styles.sectionHeader}>
            <h2 style={styles.sectionTitle}>Marketplace Offers</h2>
            <div style={{ display: 'flex', gap: '8px' }}>
              <button style={{ ...styles.button, ...styles.primaryButton, opacity: pushingOffers ? 0.6 : 1 }} onClick={handlePushAllOffers} disabled={pushingOffers}>
                {pushingOffers ? 'Pushing...' : 'Push All Enabled'}
              </button>
            </div>
          </div>

          {/* Channel Selector & Listing Health */}
          {channels.length > 0 && (
            <div style={{ display: 'flex', gap: '8px', marginBottom: '16px', flexWrap: 'wrap' }}>
              <button style={{ ...styles.button, ...(offerChannelFilter === '' ? styles.primaryButton : styles.outlineButton), fontSize: '13px' }} onClick={() => { setOfferChannelFilter(''); }}>All Channels</button>
              {channels.map(ch => (
                <button key={ch.id} style={{ ...styles.button, ...(offerChannelFilter === String(ch.id) ? styles.primaryButton : styles.outlineButton), fontSize: '13px', borderColor: getChannelColor(ch.channel_code), color: offerChannelFilter === String(ch.id) ? '#fff' : getChannelColor(ch.channel_code), backgroundColor: offerChannelFilter === String(ch.id) ? getChannelColor(ch.channel_code) : 'transparent' }} onClick={() => { setOfferChannelFilter(String(ch.id)); fetchListingHealth(ch.id); }}>
                  {ch.channel_name || ch.channel_code}
                  {listingHealth && offerChannelFilter === String(ch.id) && (
                    <span style={{ marginLeft: '6px', padding: '1px 6px', borderRadius: '10px', fontSize: '11px', backgroundColor: (listingHealth.overall_score || listingHealth.overallScore || 0) >= 80 ? '#d4edda' : '#fff3cd', color: (listingHealth.overall_score || listingHealth.overallScore || 0) >= 80 ? '#155724' : '#856404' }}>
                      {listingHealth.overall_score || listingHealth.overallScore || 0}%
                    </span>
                  )}
                </button>
              ))}
            </div>
          )}

          {/* Listing Health Summary */}
          {listingHealth && offerChannelFilter && (
            <div style={{ ...styles.card, marginBottom: '16px', display: 'flex', gap: '20px', alignItems: 'center', flexWrap: 'wrap' }}>
              <div style={{ fontSize: '13px' }}><strong>Listing Health:</strong></div>
              <div style={{ fontSize: '13px' }}>Score: <strong style={{ color: (listingHealth.overall_score || listingHealth.overallScore || 0) >= 80 ? '#28a745' : '#ffc107' }}>{listingHealth.overall_score || listingHealth.overallScore || 0}%</strong></div>
              <div style={{ fontSize: '13px' }}>Issues: <strong style={{ color: '#dc3545' }}>{listingHealth.total_issues || listingHealth.issueCount || 0}</strong></div>
              <div style={{ fontSize: '13px' }}>Products: <strong>{listingHealth.total_products || listingHealth.totalProducts || 0}</strong></div>
            </div>
          )}

          {/* Search & Bulk Actions */}
          <div style={{ display: 'flex', gap: '12px', marginBottom: '16px', flexWrap: 'wrap', alignItems: 'center' }}>
            <input
              type="text" placeholder="Search by name, SKU, UPC..." value={offerSearch}
              onChange={(e) => setOfferSearch(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') { setOfferPage(1); fetchOfferProducts(1, offerSearch); } }}
              style={{ ...styles.input, width: '280px' }}
            />
            <button style={{ ...styles.button, ...styles.outlineButton }} onClick={() => { setOfferPage(1); fetchOfferProducts(1, offerSearch); }}>Search</button>
          </div>

          {selectedOfferProducts.length > 0 && (
            <div style={styles.batchActionsBar}>
              <span style={styles.selectedCount}>{selectedOfferProducts.length} selected</span>
              <div style={styles.batchButtons}>
                <button style={{ ...styles.button, backgroundColor: '#28a745', color: '#fff' }} onClick={() => handleBulkOfferToggle(true)}>Enable Selected</button>
                <button style={{ ...styles.button, ...styles.secondaryButton }} onClick={() => handleBulkOfferToggle(false)}>Disable Selected</button>
                <button style={{ ...styles.button, ...styles.outlineButton }} onClick={() => setSelectedOfferProducts([])}>Clear</button>
              </div>
            </div>
          )}

          {/* Offers Table */}
          <div style={styles.tableContainer}>
            <table style={styles.table}>
              <thead>
                <tr>
                  <th style={styles.checkboxCell}>
                    <input type="checkbox" checked={selectedOfferProducts.length > 0 && selectedOfferProducts.length === offerProducts.length}
                      onChange={(e) => setSelectedOfferProducts(e.target.checked ? offerProducts.map(p => p.id) : [])} />
                  </th>
                  <th style={styles.th}>Name</th>
                  <th style={styles.th}>SKU</th>
                  <th style={styles.th}>UPC</th>
                  <th style={styles.th}>Category</th>
                  <th style={styles.th}>Price</th>
                  <th style={styles.th}>Stock</th>
                  <th style={styles.th}>Marketplace</th>
                  <th style={styles.th}>Mirakl Status</th>
                  <th style={styles.th}>Last Synced</th>
                </tr>
              </thead>
              <tbody>
                {offerProducts.map(p => (
                  <tr key={p.id} style={{ backgroundColor: selectedOfferProducts.includes(p.id) ? '#e3f2fd' : 'transparent' }}>
                    <td style={styles.checkboxCell}>
                      <input type="checkbox" checked={selectedOfferProducts.includes(p.id)}
                        onChange={(e) => setSelectedOfferProducts(prev => e.target.checked ? [...prev, p.id] : prev.filter(id => id !== p.id))} />
                    </td>
                    <td style={styles.td}>
                      <div><strong>{p.name || p.model}</strong></div>
                      <div style={{ fontSize: '12px', color: '#6c757d' }}>{p.manufacturer}</div>
                    </td>
                    <td style={styles.td}>{p.sku || '-'}</td>
                    <td style={styles.td}>
                      {p.upc ? p.upc : <span style={{ color: '#dc3545', fontWeight: '500', fontSize: '12px' }}>Missing</span>}
                    </td>
                    <td style={styles.td}>{p.category || '-'}</td>
                    <td style={styles.td}>${parseFloat(p.price || 0).toFixed(2)}</td>
                    <td style={{ ...styles.td, fontWeight: '600', color: p.stock_quantity > 0 ? '#28a745' : '#dc3545' }}>{p.stock_quantity}</td>
                    <td style={styles.td}>
                      <label style={styles.toggleSwitch} className="toggle-switch">
                        <input type="checkbox" checked={!!p.marketplace_enabled} onChange={() => handleToggleOfferEnabled(p.id, p.marketplace_enabled)} />
                        <span className="toggle-slider" style={styles.toggleSlider}></span>
                      </label>
                    </td>
                    <td style={styles.td}>
                      {p.mirakl_offer_state ? (
                        <span style={{ ...styles.statusBadge, backgroundColor: p.mirakl_offer_state === 'ACTIVE' ? '#d4edda' : '#fff3cd', color: p.mirakl_offer_state === 'ACTIVE' ? '#155724' : '#856404' }}>
                          {p.mirakl_offer_state}
                        </span>
                      ) : <span style={{ color: '#6c757d', fontSize: '12px' }}>Not pushed</span>}
                    </td>
                    <td style={styles.td}>{p.mirakl_last_offer_sync ? formatRelativeTime(p.mirakl_last_offer_sync) : 'Never'}</td>
                  </tr>
                ))}
                {offerProducts.length === 0 && (
                  <tr><td colSpan="10" style={styles.noDataCell}>No marketplace-eligible products found</td></tr>
                )}
              </tbody>
            </table>
          </div>

          {offerTotal > 30 && (
            <div style={{ display: 'flex', justifyContent: 'center', gap: '10px', marginTop: '16px' }}>
              <button style={styles.button} disabled={offerPage === 1} onClick={() => { setOfferPage(p => p - 1); fetchOfferProducts(offerPage - 1, offerSearch); }}>Previous</button>
              <span style={{ padding: '8px' }}>Page {offerPage} of {Math.ceil(offerTotal / 30)}</span>
              <button style={styles.button} disabled={offerPage >= Math.ceil(offerTotal / 30)} onClick={() => { setOfferPage(p => p + 1); fetchOfferProducts(offerPage + 1, offerSearch); }}>Next</button>
            </div>
          )}

          {/* Import Status Section */}
          <div style={{ ...styles.card, marginTop: '24px' }}>
            <h3 style={{ margin: '0 0 16px 0', fontSize: '16px' }}>Recent Imports</h3>
            <table style={styles.table}>
              <thead>
                <tr>
                  <th style={styles.th}>Type</th>
                  <th style={styles.th}>Mirakl Import ID</th>
                  <th style={styles.th}>Status</th>
                  <th style={styles.th}>Records</th>
                  <th style={styles.th}>Errors</th>
                  <th style={styles.th}>Submitted</th>
                </tr>
              </thead>
              <tbody>
                {offerImports.map(imp => (
                  <tr key={imp.id}>
                    <td style={styles.td}>{imp.import_type}</td>
                    <td style={styles.td}>{imp.mirakl_import_id?.substring(0, 12) || '-'}</td>
                    <td style={styles.td}>
                      <span style={{
                        ...styles.statusBadge,
                        backgroundColor: (imp.status === 'COMPLETE' || imp.status === 'COMPLETED') ? '#d4edda' :
                          (imp.status === 'QUEUED' || imp.status === 'PROCESSING') ? '#fff3cd' : '#f8d7da',
                        color: (imp.status === 'COMPLETE' || imp.status === 'COMPLETED') ? '#155724' :
                          (imp.status === 'QUEUED' || imp.status === 'PROCESSING') ? '#856404' : '#721c24'
                      }}>
                        {imp.status}
                      </span>
                      {(imp.status === 'QUEUED' || imp.status === 'PROCESSING') && (
                        <div style={{ marginTop: '4px', height: '4px', backgroundColor: '#e9ecef', borderRadius: '2px', overflow: 'hidden' }}>
                          <div style={{ width: imp.status === 'PROCESSING' ? '60%' : '20%', height: '100%', backgroundColor: '#ffc107', transition: 'width 0.3s' }} />
                        </div>
                      )}
                    </td>
                    <td style={styles.td}>{imp.records_processed || 0}</td>
                    <td style={{ ...styles.td, color: imp.records_with_errors > 0 ? '#dc3545' : 'inherit' }}>{imp.records_with_errors || 0}</td>
                    <td style={styles.td}>{imp.submitted_at ? new Date(imp.submitted_at).toLocaleString() : '-'}</td>
                  </tr>
                ))}
                {offerImports.length === 0 && <tr><td colSpan="6" style={styles.noDataCell}>No recent imports</td></tr>}
              </tbody>
            </table>
          </div>

          {/* Bundles Section */}
          <div style={{ ...styles.card, marginTop: '24px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
              <h3 style={{ margin: 0, fontSize: '16px' }}>Product Bundles ({bundles.length})</h3>
              <button style={{ ...styles.button, ...styles.smallButton }} onClick={fetchBundles}>Refresh</button>
            </div>
            {bundles.length > 0 ? (
              <div style={styles.tableContainer}>
                <table style={styles.table}>
                  <thead>
                    <tr>
                      <th style={styles.th}>Bundle Name</th>
                      <th style={styles.th}>Products</th>
                      <th style={styles.th}>Bundle Price</th>
                      <th style={styles.th}>Status</th>
                      <th style={styles.th}>Channel</th>
                    </tr>
                  </thead>
                  <tbody>
                    {bundles.map(b => (
                      <tr key={b.id}>
                        <td style={styles.td}><strong>{b.name || b.bundle_name}</strong></td>
                        <td style={styles.td}>{b.product_count || (b.products && b.products.length) || 0} items</td>
                        <td style={styles.td}>{formatCurrency(b.price || b.bundle_price || 0)}</td>
                        <td style={styles.td}>
                          <span style={{ ...styles.statusBadge, backgroundColor: b.active ? '#d4edda' : '#f8d7da', color: b.active ? '#155724' : '#721c24' }}>
                            {b.active ? 'Active' : 'Inactive'}
                          </span>
                        </td>
                        <td style={styles.td}>{b.channel_name || b.channel_code || 'All'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <div style={styles.noData}>No product bundles configured.</div>
            )}
          </div>

          {/* Product Mapping Sub-section */}
          <div style={{ marginTop: '32px' }}>
            <h3 style={{ ...styles.sectionTitle, fontSize: '18px', marginBottom: '16px' }}>Product Category Mapping</h3>
            <ProductMappingTool />
          </div>
        </div>
      )}

      {/* ============ TAB 4: INVENTORY ============ */}
      {activeSection === 'inventory' && (
        <div style={styles.section}>
          <h2 style={styles.sectionTitle}>Inventory Management</h2>

          {/* Status Cards */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '20px', margin: '20px 0' }}>
            <div style={styles.kpiCard}>
              <div style={{ ...styles.kpiIcon, backgroundColor: (queueStatus?.pendingChanges > 0) ? '#fff8e1' : '#e8f5e9' }}>&#8693;</div>
              <div style={styles.kpiContent}>
                <div style={styles.kpiLabel}>Pending Changes</div>
                <div style={styles.kpiValue}>{queueStatus?.pendingChanges ?? '...'}</div>
              </div>
            </div>
            <div style={styles.kpiCard}>
              <div style={{ ...styles.kpiIcon, backgroundColor: '#e3f2fd' }}>&#9201;</div>
              <div style={styles.kpiContent}>
                <div style={styles.kpiLabel}>Oldest Pending</div>
                <div style={{ ...styles.kpiValue, fontSize: '20px' }}>{queueStatus?.oldestPending ? formatRelativeTime(queueStatus.oldestPending) : 'None'}</div>
              </div>
            </div>
            <div style={styles.kpiCard}>
              <div style={{ ...styles.kpiIcon, backgroundColor: '#e8f5e9' }}>&#10003;</div>
              <div style={styles.kpiContent}>
                <div style={styles.kpiLabel}>Last Sync</div>
                <div style={{ ...styles.kpiValue, fontSize: '20px' }}>{queueStatus?.lastSync ? formatRelativeTime(queueStatus.lastSync) : 'Never'}</div>
              </div>
            </div>
          </div>

          {/* Action Buttons */}
          <div style={{ display: 'flex', gap: '12px', marginBottom: '24px' }}>
            <button style={{ ...styles.button, ...styles.primaryButton, opacity: inventorySyncing ? 0.6 : 1 }} onClick={handleInventorySyncNow} disabled={inventorySyncing}>
              {inventorySyncing ? 'Syncing...' : 'Sync Now'}
            </button>
            <button style={{ ...styles.button, ...styles.outlineButton, opacity: driftLoading ? 0.6 : 1 }} onClick={handleDriftCheck} disabled={driftLoading}>
              {driftLoading ? 'Checking...' : 'Drift Check'}
            </button>
            <button style={{ ...styles.button, ...styles.dangerButton, opacity: forceSyncing ? 0.6 : 1 }} onClick={handleForceFullSync} disabled={forceSyncing}>
              {forceSyncing ? 'Syncing...' : 'Force Full Sync'}
            </button>
          </div>

          {/* Drift Check Results */}
          {driftResults && (
            <div style={{ ...styles.card, marginBottom: '24px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
                <h3 style={{ margin: 0, fontSize: '16px' }}>Drift Check Results</h3>
                <span style={{ fontSize: '13px', color: '#6c757d' }}>
                  {driftResults.inSync || 0} in sync, {driftResults.drifted?.length || 0} drifted, {driftResults.unknown?.length || 0} unknown
                </span>
              </div>
              {(driftResults.drifted?.length > 0) ? (
                <table style={styles.table}>
                  <thead>
                    <tr>
                      <th style={styles.th}>SKU</th>
                      <th style={styles.th}>Product</th>
                      <th style={styles.th}>Our Stock</th>
                      <th style={styles.th}>Best Buy Stock</th>
                      <th style={styles.th}>Difference</th>
                    </tr>
                  </thead>
                  <tbody>
                    {driftResults.drifted.map((item, idx) => {
                      const diff = (item.internal_qty || 0) - (item.mirakl_qty || 0);
                      return (
                        <tr key={idx}>
                          <td style={styles.td}>{item.sku}</td>
                          <td style={styles.td}>{item.name || item.model || '-'}</td>
                          <td style={styles.td}>{item.internal_qty}</td>
                          <td style={styles.td}>{item.mirakl_qty}</td>
                          <td style={{ ...styles.td, color: diff < 0 ? '#dc3545' : diff > 0 ? '#f59e0b' : '#28a745', fontWeight: '600' }}>
                            {diff > 0 ? '+' : ''}{diff}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              ) : (
                <div style={styles.noData}>All products are in sync!</div>
              )}
            </div>
          )}

          {/* Stock Buffer Management — existing functionality preserved */}
          <div style={{ ...styles.card, marginBottom: '24px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
              <h3 style={{ margin: 0, fontSize: '16px' }}>Global Stock Buffer</h3>
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                <span>Reserve</span>
                <input type="number" min="0" value={globalBuffer} onChange={(e) => setGlobalBuffer(parseInt(e.target.value) || 0)}
                  style={{ ...styles.input, width: '80px' }} />
                <span>units</span>
                <button style={{ ...styles.button, ...styles.primaryButton, padding: '8px 16px' }}
                  onClick={async () => { try { await axios.put(`${API_BASE_URL}/api/marketplace/stock-buffer`, { value: globalBuffer }); setMessage(`Stock buffer set to ${globalBuffer}`); } catch (err) { setError('Failed to update buffer'); } }}>Save</button>
              </div>
            </div>
          </div>

          {/* Product Stock Buffers table — existing functionality */}
          <div style={styles.card}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
              <h3 style={{ margin: 0, fontSize: '16px' }}>Product Stock Buffers</h3>
              <input type="text" placeholder="Search products..." value={inventorySearch}
                onChange={(e) => setInventorySearch(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter') { fetchInventoryProducts(1, inventorySearch); setInventoryPage(1); } }}
                style={{ ...styles.input, width: '250px' }} />
            </div>
            <table style={styles.table}>
              <thead>
                <tr>
                  <th style={styles.th}>Product</th>
                  <th style={styles.th}>SKU</th>
                  <th style={styles.th}>Actual Stock</th>
                  <th style={styles.th}>Buffer</th>
                  <th style={styles.th}>Effective</th>
                  <th style={styles.th}>Last Synced</th>
                </tr>
              </thead>
              <tbody>
                {inventoryProducts.map(product => (
                  <tr key={product.id}>
                    <td style={styles.td}><strong>{product.model}</strong><div style={{ fontSize: '12px', color: '#666' }}>{product.manufacturer}</div></td>
                    <td style={styles.td}>{product.sku || '-'}</td>
                    <td style={styles.td}>{product.stock_quantity}</td>
                    <td style={styles.td}>
                      <input type="number" min="0" placeholder={`Global (${globalBuffer})`} value={product.marketplace_stock_buffer ?? ''}
                        onChange={async (e) => { const v = e.target.value === '' ? null : parseInt(e.target.value); try { await axios.put(`${API_BASE_URL}/api/marketplace/products/${product.id}/stock-buffer`, { buffer: v }); fetchInventoryProducts(inventoryPage, inventorySearch); } catch (err) { setError('Failed to update buffer'); } }}
                        style={{ ...styles.input, width: '80px', padding: '4px 8px' }} />
                    </td>
                    <td style={{ ...styles.td, fontWeight: 'bold', color: product.effective_stock > 0 ? '#28a745' : '#dc3545' }}>{product.effective_stock}</td>
                    <td style={styles.td}>{product.marketplace_last_synced ? new Date(product.marketplace_last_synced).toLocaleDateString() : 'Never'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            {inventoryTotal > 25 && (
              <div style={{ display: 'flex', justifyContent: 'center', gap: '10px', marginTop: '16px' }}>
                <button style={styles.button} disabled={inventoryPage === 1} onClick={() => { setInventoryPage(p => p - 1); fetchInventoryProducts(inventoryPage - 1, inventorySearch); }}>Previous</button>
                <span style={{ padding: '8px' }}>Page {inventoryPage} of {Math.ceil(inventoryTotal / 25)}</span>
                <button style={styles.button} disabled={inventoryPage >= Math.ceil(inventoryTotal / 25)} onClick={() => { setInventoryPage(p => p + 1); fetchInventoryProducts(inventoryPage + 1, inventorySearch); }}>Next</button>
              </div>
            )}
          </div>

          {/* Recent Stock Sync History */}
          <div style={{ ...styles.card, marginTop: '24px' }}>
            <h3 style={{ margin: '0 0 16px 0', fontSize: '16px' }}>Recent Stock Sync History</h3>
            <table style={styles.table}>
              <thead>
                <tr><th style={styles.th}>Date</th><th style={styles.th}>Status</th><th style={styles.th}>Records</th><th style={styles.th}>Errors</th></tr>
              </thead>
              <tbody>
                {recentStockImports.map(imp => (
                  <tr key={imp.id}>
                    <td style={styles.td}>{imp.submitted_at ? new Date(imp.submitted_at).toLocaleString() : '-'}</td>
                    <td style={styles.td}>
                      <span style={{ ...styles.statusBadge, backgroundColor: (imp.status === 'COMPLETE' || imp.status === 'COMPLETED') ? '#d4edda' : '#fff3cd', color: (imp.status === 'COMPLETE' || imp.status === 'COMPLETED') ? '#155724' : '#856404' }}>
                        {imp.status}
                      </span>
                    </td>
                    <td style={styles.td}>{imp.records_processed || 0}</td>
                    <td style={{ ...styles.td, color: imp.records_with_errors > 0 ? '#dc3545' : 'inherit' }}>{imp.records_with_errors || 0}</td>
                  </tr>
                ))}
                {recentStockImports.length === 0 && <tr><td colSpan="4" style={styles.noDataCell}>No stock sync history</td></tr>}
              </tbody>
            </table>
          </div>

          {/* Stockout Alerts */}
          <div style={{ ...styles.card, marginTop: '24px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
              <h3 style={{ margin: 0, fontSize: '16px', color: '#dc3545' }}>Stockout Alerts ({stockoutAlerts.length})</h3>
              <button style={{ ...styles.button, ...styles.smallButton }} onClick={fetchStockoutAlerts}>Refresh</button>
            </div>
            {stockoutAlerts.length > 0 ? (
              <div style={styles.tableContainer}>
                <table style={styles.table}>
                  <thead>
                    <tr>
                      <th style={styles.th}>Product</th>
                      <th style={styles.th}>SKU</th>
                      <th style={styles.th}>Current Stock</th>
                      <th style={styles.th}>Days Until Stockout</th>
                      <th style={styles.th}>Daily Velocity</th>
                    </tr>
                  </thead>
                  <tbody>
                    {stockoutAlerts.slice(0, 15).map((sa, i) => (
                      <tr key={i} style={{ backgroundColor: (sa.days_until_stockout || sa.daysUntilStockout || 99) <= 7 ? '#fff5f5' : 'inherit' }}>
                        <td style={styles.td}><strong>{sa.product_name || sa.name || '-'}</strong></td>
                        <td style={styles.td}>{sa.sku || '-'}</td>
                        <td style={styles.td}>{sa.current_stock || sa.quantity || 0}</td>
                        <td style={styles.td}>
                          <span style={{ fontWeight: '700', color: (sa.days_until_stockout || sa.daysUntilStockout || 99) <= 7 ? '#dc3545' : '#ffc107' }}>
                            {sa.days_until_stockout || sa.daysUntilStockout || '?'} days
                          </span>
                        </td>
                        <td style={styles.td}>{(sa.daily_velocity || sa.avgDailyVelocity || 0).toFixed(1)}/day</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <div style={styles.noData}>No stockout alerts. Inventory levels look healthy.</div>
            )}
          </div>

          {/* Reorder Suggestions */}
          <div style={{ ...styles.card, marginTop: '24px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
              <h3 style={{ margin: 0, fontSize: '16px', color: '#ffc107' }}>Reorder Suggestions ({reorderSuggestions.length})</h3>
              <button style={{ ...styles.button, ...styles.smallButton }} onClick={fetchReorderSuggestions}>Refresh</button>
            </div>
            {reorderSuggestions.length > 0 ? (
              <div style={styles.tableContainer}>
                <table style={styles.table}>
                  <thead>
                    <tr>
                      <th style={styles.th}>Product</th>
                      <th style={styles.th}>SKU</th>
                      <th style={styles.th}>Current Stock</th>
                      <th style={styles.th}>Suggested Qty</th>
                      <th style={styles.th}>Est. Cost</th>
                    </tr>
                  </thead>
                  <tbody>
                    {reorderSuggestions.slice(0, 15).map((rs, i) => (
                      <tr key={i}>
                        <td style={styles.td}><strong>{rs.product_name || rs.name || '-'}</strong></td>
                        <td style={styles.td}>{rs.sku || '-'}</td>
                        <td style={styles.td}>{rs.current_stock || rs.quantity || 0}</td>
                        <td style={styles.td}><strong style={{ color: '#007bff' }}>{rs.suggested_quantity || rs.reorderQty || 0}</strong></td>
                        <td style={styles.td}>{formatCurrency(rs.estimated_cost || rs.estCost || 0)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <div style={styles.noData}>No reorder suggestions at this time.</div>
            )}
          </div>

          {/* Overstock Alerts */}
          <div style={{ ...styles.card, marginTop: '24px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
              <h3 style={{ margin: 0, fontSize: '16px', color: '#6f42c1' }}>Overstock Alerts ({overstockAlerts.length})</h3>
              <button style={{ ...styles.button, ...styles.smallButton }} onClick={fetchOverstockAlerts}>Refresh</button>
            </div>
            {overstockAlerts.length > 0 ? (
              <div style={styles.tableContainer}>
                <table style={styles.table}>
                  <thead>
                    <tr>
                      <th style={styles.th}>Product</th>
                      <th style={styles.th}>SKU</th>
                      <th style={styles.th}>Current Stock</th>
                      <th style={styles.th}>Days of Supply</th>
                      <th style={styles.th}>Excess Value</th>
                    </tr>
                  </thead>
                  <tbody>
                    {overstockAlerts.slice(0, 15).map((oa, i) => (
                      <tr key={i}>
                        <td style={styles.td}><strong>{oa.product_name || oa.name || '-'}</strong></td>
                        <td style={styles.td}>{oa.sku || '-'}</td>
                        <td style={styles.td}>{oa.current_stock || oa.quantity || 0}</td>
                        <td style={styles.td}><span style={{ color: '#6f42c1', fontWeight: '600' }}>{oa.days_of_supply || oa.daysSupply || '?'} days</span></td>
                        <td style={styles.td}>{formatCurrency(oa.excess_value || oa.excessValue || 0)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <div style={styles.noData}>No overstock alerts.</div>
            )}
          </div>
        </div>
      )}

      {/* ============ TAB 5: CHANNELS ============ */}
      {activeSection === 'channels' && (
        <div style={styles.section}>
          <div style={styles.sectionHeader}>
            <h2 style={styles.sectionTitle}>Marketplace Channels</h2>
            <div style={{ display: 'flex', gap: '8px' }}>
              <button style={{ ...styles.button, ...styles.primaryButton }} onClick={() => { setOnboardingResult(null); setShowOnboardingModal(true); }}>+ Add Channel</button>
              <button style={{ ...styles.button, ...styles.outlineButton }} onClick={() => { fetchChannels(); fetchChannelDashboard(); }} disabled={channelsLoading}>Refresh</button>
            </div>
          </div>

          {/* Channel Cards */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(380px, 1fr))', gap: '20px', marginBottom: '24px' }}>
            {channels.map(ch => (
              <div key={ch.id} style={{ ...styles.card, borderLeft: `4px solid ${getChannelColor(ch.channel_code)}` }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '12px' }}>
                  <div>
                    <h3 style={{ margin: '0 0 4px 0', fontSize: '18px', fontWeight: '600' }}>{ch.channel_name || ch.channel_code}</h3>
                    <div style={{ fontSize: '13px', color: '#6c757d', fontFamily: 'monospace' }}>{ch.channel_code}</div>
                  </div>
                  <span style={{ ...styles.statusBadge, backgroundColor: ch.status === 'ACTIVE' ? '#d4edda' : ch.status === 'INACTIVE' ? '#e9ecef' : ch.status === 'SUSPENDED' ? '#fff3cd' : '#f8d7da', color: ch.status === 'ACTIVE' ? '#155724' : ch.status === 'INACTIVE' ? '#495057' : ch.status === 'SUSPENDED' ? '#856404' : '#721c24' }}>
                    {ch.status}
                  </span>
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px', fontSize: '13px', marginBottom: '12px' }}>
                  <div><span style={{ color: '#6c757d' }}>Type: </span><strong>{ch.channel_type || 'Mirakl'}</strong></div>
                  <div><span style={{ color: '#6c757d' }}>Currency: </span><strong>{ch.currency || 'CAD'}</strong></div>
                  {ch.features && <div><span style={{ color: '#6c757d' }}>Features: </span>{Object.entries(ch.features).filter(([,v]) => v).map(([k]) => k).join(', ') || 'Standard'}</div>}
                  {ch.adapterLoaded !== undefined && <div><span style={{ color: '#6c757d' }}>Adapter: </span><span style={{ color: ch.adapterLoaded ? '#28a745' : '#dc3545' }}>{ch.adapterLoaded ? 'Loaded' : 'Not loaded'}</span></div>}
                </div>
                <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                  <button style={{ ...styles.button, ...styles.smallButton, ...styles.outlineButton }} onClick={() => handleTestChannel(ch.id)}>Test Connection</button>
                  <button style={{ ...styles.button, ...styles.smallButton }} onClick={() => fetchChannelDetail(ch.id)}>View Stats</button>
                  {ch.status === 'ACTIVE' ? (
                    <button style={{ ...styles.button, ...styles.smallButton, ...styles.dangerButton }} onClick={() => handleDeactivateChannel(ch.id)}>Deactivate</button>
                  ) : ch.status !== 'PENDING' ? (
                    <button style={{ ...styles.button, ...styles.smallButton, backgroundColor: '#28a745', color: '#fff' }} onClick={() => handleActivateChannel(ch.id)}>Activate</button>
                  ) : null}
                </div>
              </div>
            ))}
          </div>

          {channels.length === 0 && <div style={styles.noData}>No channels configured. Click "+ Add Channel" to onboard your first marketplace.</div>}

          {/* Channel Detail Panel */}
          {selectedChannelDetail && (
            <div style={{ ...styles.card, marginBottom: '24px', borderLeft: '4px solid #007bff' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
                <h3 style={{ margin: 0, fontSize: '16px' }}>Channel Details: {selectedChannelDetail.channel?.channel_name}</h3>
                <button style={{ ...styles.button, ...styles.smallButton }} onClick={() => setSelectedChannelDetail(null)}>Close</button>
              </div>
              {selectedChannelDetail.ordersByState && (
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(140px, 1fr))', gap: '12px', marginBottom: '16px' }}>
                  {Object.entries(selectedChannelDetail.ordersByState).map(([state, count]) => (
                    <div key={state} style={{ padding: '12px', background: '#f8f9fa', borderRadius: '6px', textAlign: 'center' }}>
                      <div style={{ fontSize: '11px', color: '#6c757d', textTransform: 'capitalize' }}>{state.replace(/_/g, ' ')}</div>
                      <div style={{ fontSize: '20px', fontWeight: '700' }}>{count}</div>
                    </div>
                  ))}
                </div>
              )}
              {selectedChannelDetail.recentSyncs?.length > 0 && (
                <table style={styles.table}>
                  <thead><tr><th style={styles.th}>Sync Type</th><th style={styles.th}>Status</th><th style={styles.th}>Count</th><th style={styles.th}>Last Run</th></tr></thead>
                  <tbody>
                    {selectedChannelDetail.recentSyncs.map((s, i) => (
                      <tr key={i}><td style={styles.td}>{s.sync_type}</td><td style={styles.td}><span style={{ color: s.status === 'SUCCESS' ? '#28a745' : '#dc3545' }}>{s.status}</span></td><td style={styles.td}>{s.cnt}</td><td style={styles.td}>{s.last_run ? formatRelativeTime(s.last_run) : '-'}</td></tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          )}

          {/* Dashboard stats */}
          {channelDashboard && channelDashboard.channels?.length > 0 && (
            <div style={styles.card}>
              <h3 style={{ margin: '0 0 16px 0', fontSize: '16px' }}>Cross-Channel Summary</h3>
              <table style={styles.table}>
                <thead><tr><th style={styles.th}>Channel</th><th style={styles.th}>Status</th><th style={styles.th}>Active Listings</th><th style={styles.th}>Orders (30d)</th><th style={styles.th}>Revenue (30d)</th></tr></thead>
                <tbody>
                  {channelDashboard.channels.map((ch, i) => (
                    <tr key={i}>
                      <td style={styles.td}><span style={{ ...styles.statusBadge, backgroundColor: getChannelColor(ch.channel_code), color: '#fff' }}>{ch.channel_name || ch.channel_code}</span></td>
                      <td style={styles.td}><span style={{ color: ch.status === 'ACTIVE' ? '#28a745' : '#6c757d' }}>{ch.status}</span></td>
                      <td style={styles.td}>{ch.active_listings || 0}</td>
                      <td style={styles.td}>{ch.order_count_30d || 0}</td>
                      <td style={styles.td}>{formatCurrency(ch.revenue_30d || 0)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* Onboarding Wizard Modal */}
      {showOnboardingModal && (
        <div style={styles.modalOverlay} onClick={() => setShowOnboardingModal(false)}>
          <div style={{ ...styles.modal, maxWidth: '600px' }} onClick={e => e.stopPropagation()}>
            <h3 style={styles.modalTitle}>Add New Marketplace Channel</h3>
            {onboardingResult ? (
              <div style={{ textAlign: 'center', padding: '24px' }}>
                <div style={{ fontSize: '48px', marginBottom: '16px' }}>{onboardingResult.success ? '!' : 'X'}</div>
                <h4 style={{ marginBottom: '8px' }}>{onboardingResult.success ? 'Channel Created!' : 'Error'}</h4>
                <p style={{ color: '#6c757d', marginBottom: '16px' }}>{onboardingResult.message || (onboardingResult.success ? 'Your new channel has been set up.' : 'Failed to create channel.')}</p>
                <button style={{ ...styles.button, ...styles.primaryButton }} onClick={() => { setShowOnboardingModal(false); setOnboardingResult(null); fetchChannels(); fetchChannelDashboard(); }}>Done</button>
              </div>
            ) : (
              <>
                <div style={styles.formGroup}>
                  <label style={styles.label}>Channel Type</label>
                  <select style={styles.select} value={onboardingForm.channelType} onChange={e => setOnboardingForm(f => ({ ...f, channelType: e.target.value }))}>
                    <option value="MIRAKL">Mirakl</option>
                    <option value="SHOPIFY">Shopify</option>
                    <option value="AMAZON">Amazon</option>
                    <option value="WALMART">Walmart</option>
                  </select>
                </div>
                <div style={styles.formGroup}>
                  <label style={styles.label}>Channel Code</label>
                  <input style={styles.input} value={onboardingForm.channelCode} onChange={e => setOnboardingForm(f => ({ ...f, channelCode: e.target.value }))} placeholder="e.g. BESTBUY_CA, THEBAY" />
                </div>
                <div style={styles.formGroup}>
                  <label style={styles.label}>Channel Name</label>
                  <input style={styles.input} value={onboardingForm.channelName} onChange={e => setOnboardingForm(f => ({ ...f, channelName: e.target.value }))} placeholder="e.g. Best Buy Canada" />
                </div>
                <div style={styles.formGroup}>
                  <label style={styles.label}>API URL</label>
                  <input style={styles.input} value={onboardingForm.apiUrl} onChange={e => setOnboardingForm(f => ({ ...f, apiUrl: e.target.value }))} placeholder="https://marketplace-api.example.com" />
                </div>
                <div style={styles.formGroup}>
                  <label style={styles.label}>API Key</label>
                  <input style={styles.input} type="password" value={onboardingForm.credentials.api_key} onChange={e => setOnboardingForm(f => ({ ...f, credentials: { ...f.credentials, api_key: e.target.value } }))} placeholder="API Key" />
                </div>
                <div style={styles.formGroup}>
                  <label style={styles.label}>Shop ID</label>
                  <input style={styles.input} value={onboardingForm.credentials.shop_id} onChange={e => setOnboardingForm(f => ({ ...f, credentials: { ...f.credentials, shop_id: e.target.value } }))} placeholder="Shop / Seller ID" />
                </div>
                <div style={{ display: 'flex', gap: '12px', justifyContent: 'flex-end', marginTop: '20px' }}>
                  <button style={{ ...styles.button, ...styles.outlineButton }} onClick={() => setShowOnboardingModal(false)}>Cancel</button>
                  <button style={{ ...styles.button, ...styles.primaryButton, opacity: !onboardingForm.channelCode || !onboardingForm.channelName ? 0.6 : 1 }} disabled={!onboardingForm.channelCode || !onboardingForm.channelName} onClick={handleOnboardChannel}>Create Channel</button>
                </div>
              </>
            )}
          </div>
        </div>
      )}

      {/* ============ TAB 6: PRICING ENGINE ============ */}
      {activeSection === 'pricing' && (
        <div style={styles.section}>
          <div style={styles.sectionHeader}>
            <h2 style={styles.sectionTitle}>Pricing Engine</h2>
            <button style={{ ...styles.button, ...styles.primaryButton }} onClick={() => { setEditingPricingRule(null); setPricingRuleForm({ ruleName: '', ruleType: 'MIN_MARGIN', conditions: {}, formula: '', priority: 100, active: true, channelId: channels[0]?.id || '' }); setShowPricingRuleModal2(true); }}>+ Create Rule</button>
          </div>

          {/* Pricing Rules Table */}
          <div style={{ ...styles.card, marginBottom: '24px' }}>
            <h3 style={{ margin: '0 0 16px 0', fontSize: '16px' }}>Pricing Rules ({pricingRules.length})</h3>
            <div style={styles.tableContainer}>
              <table style={styles.table}>
                <thead>
                  <tr>
                    <th style={styles.th}>Rule Name</th>
                    <th style={styles.th}>Type</th>
                    <th style={styles.th}>Channel</th>
                    <th style={styles.th}>Formula</th>
                    <th style={styles.th}>Priority</th>
                    <th style={styles.th}>Status</th>
                    <th style={styles.th}>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {pricingRules.map(rule => (
                    <tr key={rule.id}>
                      <td style={styles.td}><strong>{rule.rule_name || rule.ruleName}</strong></td>
                      <td style={styles.td}>
                        <span style={{ ...styles.statusBadge, backgroundColor: rule.rule_type === 'MIN_MARGIN' ? '#e3f2fd' : rule.rule_type === 'CHANNEL_MARKUP' ? '#fff3e0' : rule.rule_type === 'SCHEDULED' ? '#f3e5f5' : rule.rule_type === 'VOLUME' ? '#e8f5e9' : '#fce4ec', color: rule.rule_type === 'MIN_MARGIN' ? '#1565c0' : rule.rule_type === 'CHANNEL_MARKUP' ? '#ef6c00' : rule.rule_type === 'SCHEDULED' ? '#7b1fa2' : rule.rule_type === 'VOLUME' ? '#2e7d32' : '#c62828' }}>
                          {(rule.rule_type || '').replace(/_/g, ' ')}
                        </span>
                      </td>
                      <td style={styles.td}>
                        {rule.channel_name || rule.channel_code || 'All'}
                      </td>
                      <td style={styles.td}><code style={{ fontSize: '12px', background: '#f8f9fa', padding: '2px 6px', borderRadius: '4px' }}>{rule.formula || '-'}</code></td>
                      <td style={styles.td}>{rule.priority}</td>
                      <td style={styles.td}>
                        <span style={{ ...styles.statusBadge, backgroundColor: rule.active ? '#d4edda' : '#f8d7da', color: rule.active ? '#155724' : '#721c24' }}>
                          {rule.active ? 'Active' : 'Inactive'}
                        </span>
                      </td>
                      <td style={styles.td}>
                        <div style={{ display: 'flex', gap: '6px' }}>
                          <button style={{ ...styles.button, ...styles.smallButton }} onClick={() => { setEditingPricingRule(rule); setPricingRuleForm({ ruleName: rule.rule_name || rule.ruleName || '', ruleType: rule.rule_type || 'MIN_MARGIN', conditions: rule.conditions || {}, formula: rule.formula || '', priority: rule.priority || 100, active: rule.active !== false, channelId: rule.channel_id || '' }); setShowPricingRuleModal2(true); }}>Edit</button>
                          <button style={{ ...styles.button, ...styles.smallButton, ...styles.dangerButton }} onClick={() => handleDeletePricingRule(rule.id)}>Delete</button>
                        </div>
                      </td>
                    </tr>
                  ))}
                  {pricingRules.length === 0 && (
                    <tr><td colSpan="7" style={styles.noDataCell}>No pricing rules configured. Click "+ Create Rule" to add one.</td></tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>

          {/* Pending Approvals */}
          <div style={{ ...styles.card, marginBottom: '24px' }}>
            <h3 style={{ margin: '0 0 16px 0', fontSize: '16px' }}>Pending Price Approvals ({pendingApprovals.length})</h3>
            {pendingApprovals.length > 0 ? (
              <div style={styles.tableContainer}>
                <table style={styles.table}>
                  <thead>
                    <tr>
                      <th style={styles.th}>Product</th>
                      <th style={styles.th}>Channel</th>
                      <th style={styles.th}>Old Price</th>
                      <th style={styles.th}>New Price</th>
                      <th style={styles.th}>Change</th>
                      <th style={styles.th}>Rule</th>
                      <th style={styles.th}>Requested</th>
                      <th style={styles.th}>Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {pendingApprovals.map(pa => {
                      const pctChange = pa.old_price ? (((pa.new_price - pa.old_price) / pa.old_price) * 100).toFixed(1) : 'N/A';
                      return (
                        <tr key={pa.id}>
                          <td style={styles.td}><strong>{pa.product_name || pa.sku || pa.product_id}</strong></td>
                          <td style={styles.td}>{pa.channel_name || pa.channel_code || '-'}</td>
                          <td style={styles.td}>{formatCurrency(pa.old_price)}</td>
                          <td style={styles.td}><strong>{formatCurrency(pa.new_price)}</strong></td>
                          <td style={styles.td}>
                            <span style={{ color: pa.new_price >= pa.old_price ? '#28a745' : '#dc3545', fontWeight: '600' }}>
                              {pa.new_price >= pa.old_price ? '+' : ''}{pctChange}%
                            </span>
                          </td>
                          <td style={styles.td}>{pa.rule_name || '-'}</td>
                          <td style={styles.td}>{pa.created_at ? new Date(pa.created_at).toLocaleDateString() : '-'}</td>
                          <td style={styles.td}>
                            <div style={{ display: 'flex', gap: '6px' }}>
                              <button style={{ ...styles.button, ...styles.smallButton, ...styles.successButton }} onClick={() => handleApproveChange(pa.id, true)}>Approve</button>
                              <button style={{ ...styles.button, ...styles.smallButton, ...styles.dangerButton }} onClick={() => handleApproveChange(pa.id, false)}>Reject</button>
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            ) : (
              <div style={styles.noData}>No pending price changes awaiting approval.</div>
            )}
          </div>

          {/* Price Change Log */}
          <div style={styles.card}>
            <h3 style={{ margin: '0 0 16px 0', fontSize: '16px' }}>Price Change Log</h3>
            {priceChangeLog.length > 0 ? (
              <div style={styles.tableContainer}>
                <table style={styles.table}>
                  <thead>
                    <tr>
                      <th style={styles.th}>Date</th>
                      <th style={styles.th}>Product</th>
                      <th style={styles.th}>Channel</th>
                      <th style={styles.th}>Old Price</th>
                      <th style={styles.th}>New Price</th>
                      <th style={styles.th}>Rule</th>
                      <th style={styles.th}>Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {priceChangeLog.map((log, i) => (
                      <tr key={log.id || i}>
                        <td style={styles.td}>{log.created_at ? new Date(log.created_at).toLocaleDateString() : '-'}</td>
                        <td style={styles.td}>{log.product_name || log.sku || log.product_id}</td>
                        <td style={styles.td}>{log.channel_name || log.channel_code || '-'}</td>
                        <td style={styles.td}>{formatCurrency(log.old_price)}</td>
                        <td style={styles.td}>{formatCurrency(log.new_price)}</td>
                        <td style={styles.td}>{log.rule_name || log.change_type || '-'}</td>
                        <td style={styles.td}>
                          <span style={{ ...styles.statusBadge, backgroundColor: log.status === 'approved' ? '#d4edda' : log.status === 'rejected' ? '#f8d7da' : '#fff3cd', color: log.status === 'approved' ? '#155724' : log.status === 'rejected' ? '#721c24' : '#856404' }}>
                            {log.status || 'applied'}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <div style={styles.noData}>No price changes recorded yet.</div>
            )}
          </div>
        </div>
      )}

      {/* Pricing Rule Modal */}
      {showPricingRuleModal2 && (
        <div style={styles.modalOverlay} onClick={() => setShowPricingRuleModal2(false)}>
          <div style={{ ...styles.modal, maxWidth: '550px' }} onClick={e => e.stopPropagation()}>
            <h3 style={styles.modalTitle}>{editingPricingRule ? 'Edit Pricing Rule' : 'Create Pricing Rule'}</h3>
            <div style={styles.formGroup}>
              <label style={styles.label}>Rule Name</label>
              <input style={styles.input} value={pricingRuleForm.ruleName} onChange={e => setPricingRuleForm(f => ({ ...f, ruleName: e.target.value }))} placeholder="e.g. Best Buy 15% Markup" />
            </div>
            <div style={styles.formGroup}>
              <label style={styles.label}>Rule Type</label>
              <select style={styles.select} value={pricingRuleForm.ruleType} onChange={e => setPricingRuleForm(f => ({ ...f, ruleType: e.target.value }))}>
                <option value="MIN_MARGIN">Min Margin</option>
                <option value="CHANNEL_MARKUP">Channel Markup</option>
                <option value="SCHEDULED">Scheduled</option>
                <option value="VOLUME">Volume</option>
                <option value="COMPETITIVE">Competitive</option>
              </select>
            </div>
            <div style={styles.formGroup}>
              <label style={styles.label}>Channel</label>
              <select style={styles.select} value={pricingRuleForm.channelId || ''} onChange={e => setPricingRuleForm(f => ({ ...f, channelId: e.target.value }))}>
                <option value="">All Channels</option>
                {channels.map(ch => <option key={ch.id} value={ch.id}>{ch.channel_name || ch.channel_code}</option>)}
              </select>
            </div>
            <div style={styles.formGroup}>
              <label style={styles.label}>Formula</label>
              <input style={styles.input} value={pricingRuleForm.formula} onChange={e => setPricingRuleForm(f => ({ ...f, formula: e.target.value }))} placeholder="e.g. cost * 1.15 or base_price + 10" />
            </div>
            <div style={{ display: 'flex', gap: '16px' }}>
              <div style={{ ...styles.formGroup, flex: 1 }}>
                <label style={styles.label}>Priority</label>
                <input type="number" style={styles.input} value={pricingRuleForm.priority} onChange={e => setPricingRuleForm(f => ({ ...f, priority: parseInt(e.target.value) || 100 }))} />
              </div>
              <div style={{ ...styles.formGroup, flex: 1 }}>
                <label style={styles.label}>Status</label>
                <select style={styles.select} value={pricingRuleForm.active ? 'true' : 'false'} onChange={e => setPricingRuleForm(f => ({ ...f, active: e.target.value === 'true' }))}>
                  <option value="true">Active</option>
                  <option value="false">Inactive</option>
                </select>
              </div>
            </div>
            <div style={{ display: 'flex', gap: '12px', justifyContent: 'flex-end', marginTop: '20px' }}>
              <button style={{ ...styles.button, ...styles.outlineButton }} onClick={() => setShowPricingRuleModal2(false)}>Cancel</button>
              <button style={{ ...styles.button, ...styles.primaryButton }} onClick={handleSavePricingRule}>{editingPricingRule ? 'Update Rule' : 'Create Rule'}</button>
            </div>
          </div>
        </div>
      )}

      {/* ============ TAB 7: RETURNS ============ */}
      {activeSection === 'returns' && (
        <div style={styles.section}>
          <div style={styles.sectionHeader}>
            <h2 style={styles.sectionTitle}>Returns Management</h2>
            <button style={{ ...styles.button, ...styles.outlineButton }} onClick={() => fetchReturns(returnStatusFilter, 1)}>Refresh</button>
          </div>

          {/* Return Stats Cards */}
          {returnStats && (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '20px', marginBottom: '24px' }}>
              <div style={{ ...styles.kpiCard, borderLeft: '4px solid #dc3545' }}>
                <div style={{ ...styles.kpiIcon, backgroundColor: '#fce4ec' }}>!</div>
                <div style={styles.kpiContent}>
                  <div style={styles.kpiLabel}>Total Returns</div>
                  <div style={styles.kpiValue}>{returnStats.total || returnsTotal}</div>
                </div>
              </div>
              <div style={{ ...styles.kpiCard, borderLeft: '4px solid #ffc107' }}>
                <div style={{ ...styles.kpiIcon, backgroundColor: '#fff8e1' }}>?</div>
                <div style={styles.kpiContent}>
                  <div style={styles.kpiLabel}>Pending</div>
                  <div style={styles.kpiValue}>{returnStats.pending || 0}</div>
                </div>
              </div>
              <div style={{ ...styles.kpiCard, borderLeft: '4px solid #28a745' }}>
                <div style={{ ...styles.kpiIcon, backgroundColor: '#e8f5e9' }}>&#10003;</div>
                <div style={styles.kpiContent}>
                  <div style={styles.kpiLabel}>Approved</div>
                  <div style={styles.kpiValue}>{returnStats.approved || 0}</div>
                </div>
              </div>
              <div style={{ ...styles.kpiCard, borderLeft: '4px solid #6c757d' }}>
                <div style={{ ...styles.kpiIcon, backgroundColor: '#e9ecef' }}>$</div>
                <div style={styles.kpiContent}>
                  <div style={styles.kpiLabel}>Total Refunded</div>
                  <div style={styles.kpiValue}>{formatCurrency(returnStats.total_refunded || 0)}</div>
                </div>
              </div>
            </div>
          )}

          {/* Filters */}
          <div style={{ ...styles.card, marginBottom: '24px', display: 'flex', gap: '16px', alignItems: 'center', flexWrap: 'wrap' }}>
            <div style={styles.formGroup}>
              <label style={styles.label}>Status Filter</label>
              <select style={{ ...styles.select, width: '200px' }} value={returnStatusFilter} onChange={e => { setReturnStatusFilter(e.target.value); fetchReturns(e.target.value, 1); }}>
                <option value="">All Statuses</option>
                <option value="PENDING">Pending</option>
                <option value="APPROVED">Approved</option>
                <option value="REJECTED">Rejected</option>
                <option value="RECEIVED">Received</option>
                <option value="REFUNDED">Refunded</option>
              </select>
            </div>
          </div>

          {/* Returns Table */}
          <div style={{ ...styles.card, marginBottom: '24px' }}>
            <h3 style={{ margin: '0 0 16px 0', fontSize: '16px' }}>Returns ({returnsTotal})</h3>
            <div style={styles.tableContainer}>
              <table style={styles.table}>
                <thead>
                  <tr>
                    <th style={styles.th}>Return ID</th>
                    <th style={styles.th}>Order</th>
                    <th style={styles.th}>Product</th>
                    <th style={styles.th}>Reason</th>
                    <th style={styles.th}>Status</th>
                    <th style={styles.th}>Refund Amount</th>
                    <th style={styles.th}>Date</th>
                    <th style={styles.th}>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {returns.map(ret => (
                    <tr key={ret.id}>
                      <td style={styles.td}>#{ret.id}</td>
                      <td style={styles.td}>{ret.order_id || ret.mirakl_order_id || '-'}</td>
                      <td style={styles.td}>{ret.product_name || ret.sku || '-'}</td>
                      <td style={styles.td}>{ret.reason || ret.return_reason || '-'}</td>
                      <td style={styles.td}>
                        <span style={{ ...styles.statusBadge, backgroundColor: ret.status === 'PENDING' ? '#fff3cd' : ret.status === 'APPROVED' ? '#d4edda' : ret.status === 'REJECTED' ? '#f8d7da' : ret.status === 'RECEIVED' ? '#e3f2fd' : '#d4edda', color: ret.status === 'PENDING' ? '#856404' : ret.status === 'APPROVED' ? '#155724' : ret.status === 'REJECTED' ? '#721c24' : ret.status === 'RECEIVED' ? '#1565c0' : '#155724' }}>
                          {ret.status}
                        </span>
                      </td>
                      <td style={styles.td}>{formatCurrency(ret.refund_amount || 0)}</td>
                      <td style={styles.td}>{ret.created_at ? new Date(ret.created_at).toLocaleDateString() : '-'}</td>
                      <td style={styles.td}>
                        {ret.status === 'PENDING' && (
                          <div style={{ display: 'flex', gap: '6px' }}>
                            <button style={{ ...styles.button, ...styles.smallButton, ...styles.successButton }} onClick={() => handleApproveReturn(ret.id)}>Approve</button>
                            <button style={{ ...styles.button, ...styles.smallButton, ...styles.dangerButton }} onClick={() => handleRejectReturn(ret.id)}>Reject</button>
                          </div>
                        )}
                      </td>
                    </tr>
                  ))}
                  {returns.length === 0 && (
                    <tr><td colSpan="8" style={styles.noDataCell}>No returns found.</td></tr>
                  )}
                </tbody>
              </table>
            </div>
            {returnsTotal > 20 && (
              <div style={{ display: 'flex', justifyContent: 'center', gap: '8px', marginTop: '16px' }}>
                <button style={{ ...styles.button, ...styles.smallButton }} disabled={returnsPage <= 1} onClick={() => fetchReturns(returnStatusFilter, returnsPage - 1)}>Previous</button>
                <span style={{ padding: '6px 12px', fontSize: '14px' }}>Page {returnsPage} of {Math.ceil(returnsTotal / 20)}</span>
                <button style={{ ...styles.button, ...styles.smallButton }} disabled={returnsPage >= Math.ceil(returnsTotal / 20)} onClick={() => fetchReturns(returnStatusFilter, returnsPage + 1)}>Next</button>
              </div>
            )}
          </div>

          {/* Return Rules */}
          <div style={{ ...styles.card, marginBottom: '24px' }}>
            <h3 style={{ margin: '0 0 16px 0', fontSize: '16px' }}>Return Rules</h3>
            {returnRules.length > 0 ? (
              <div style={styles.tableContainer}>
                <table style={styles.table}>
                  <thead>
                    <tr>
                      <th style={styles.th}>Rule</th>
                      <th style={styles.th}>Condition</th>
                      <th style={styles.th}>Action</th>
                      <th style={styles.th}>Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {returnRules.map((rule, i) => (
                      <tr key={rule.id || i}>
                        <td style={styles.td}><strong>{rule.name || rule.rule_name}</strong></td>
                        <td style={styles.td}>{rule.condition || rule.description || '-'}</td>
                        <td style={styles.td}>{rule.action || rule.auto_action || '-'}</td>
                        <td style={styles.td}>
                          <span style={{ ...styles.statusBadge, backgroundColor: rule.active ? '#d4edda' : '#f8d7da', color: rule.active ? '#155724' : '#721c24' }}>
                            {rule.active ? 'Active' : 'Inactive'}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <div style={styles.noData}>No return rules configured.</div>
            )}
          </div>

          {/* Return Analytics */}
          {returnsAnalytics && (
            <div style={styles.card}>
              <h3 style={{ margin: '0 0 16px 0', fontSize: '16px' }}>Return Rate Analytics</h3>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '16px', marginBottom: '16px' }}>
                <div style={{ textAlign: 'center', padding: '16px', background: '#f8f9fa', borderRadius: '8px' }}>
                  <div style={{ fontSize: '12px', color: '#6c757d' }}>Return Rate</div>
                  <div style={{ fontSize: '24px', fontWeight: '700' }}>{(returnsAnalytics.return_rate || 0).toFixed(1)}%</div>
                </div>
                <div style={{ textAlign: 'center', padding: '16px', background: '#f8f9fa', borderRadius: '8px' }}>
                  <div style={{ fontSize: '12px', color: '#6c757d' }}>Avg Processing Time</div>
                  <div style={{ fontSize: '24px', fontWeight: '700' }}>{returnsAnalytics.avg_processing_days || 0}d</div>
                </div>
                <div style={{ textAlign: 'center', padding: '16px', background: '#f8f9fa', borderRadius: '8px' }}>
                  <div style={{ fontSize: '12px', color: '#6c757d' }}>Top Reason</div>
                  <div style={{ fontSize: '14px', fontWeight: '600' }}>{returnsAnalytics.top_reason || 'N/A'}</div>
                </div>
                <div style={{ textAlign: 'center', padding: '16px', background: '#fce4ec', borderRadius: '8px' }}>
                  <div style={{ fontSize: '12px', color: '#6c757d' }}>Total Cost</div>
                  <div style={{ fontSize: '24px', fontWeight: '700', color: '#dc3545' }}>{formatCurrency(returnsAnalytics.total_cost || 0)}</div>
                </div>
              </div>
              {returnsAnalytics.by_reason && returnsAnalytics.by_reason.length > 0 && (
                <>
                  <h4 style={{ fontSize: '14px', color: '#6c757d', marginBottom: '8px' }}>Returns by Reason</h4>
                  <table style={styles.table}>
                    <thead><tr><th style={styles.th}>Reason</th><th style={styles.th}>Count</th><th style={styles.th}>Percentage</th></tr></thead>
                    <tbody>
                      {returnsAnalytics.by_reason.map((r, i) => (
                        <tr key={i}><td style={styles.td}>{r.reason}</td><td style={styles.td}>{r.count}</td><td style={styles.td}>{r.percentage?.toFixed(1) || 0}%</td></tr>
                      ))}
                    </tbody>
                  </table>
                </>
              )}
            </div>
          )}
        </div>
      )}

      {/* ============ TAB 8: MESSAGES ============ */}
      {activeSection === 'messages' && (
        <div style={styles.section}>
          <div style={styles.sectionHeader}>
            <h2 style={styles.sectionTitle}>Marketplace Messages</h2>
            <button style={{ ...styles.button, ...styles.outlineButton }} onClick={() => { fetchMessageInbox(); fetchMessageStats(); }}>Refresh</button>
          </div>

          {/* Message Stats */}
          {messageStats && (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '20px', marginBottom: '24px' }}>
              <div style={{ ...styles.kpiCard, borderLeft: '4px solid #007bff' }}>
                <div style={{ ...styles.kpiIcon, backgroundColor: '#e3f2fd' }}>M</div>
                <div style={styles.kpiContent}>
                  <div style={styles.kpiLabel}>Total Messages</div>
                  <div style={styles.kpiValue}>{messageStats.total || messageInbox.length}</div>
                </div>
              </div>
              <div style={{ ...styles.kpiCard, borderLeft: '4px solid #dc3545' }}>
                <div style={{ ...styles.kpiIcon, backgroundColor: '#fce4ec' }}>!</div>
                <div style={styles.kpiContent}>
                  <div style={styles.kpiLabel}>Unread</div>
                  <div style={styles.kpiValue}>{messageStats.unread || 0}</div>
                </div>
              </div>
              <div style={{ ...styles.kpiCard, borderLeft: '4px solid #28a745' }}>
                <div style={{ ...styles.kpiIcon, backgroundColor: '#e8f5e9' }}>T</div>
                <div style={styles.kpiContent}>
                  <div style={styles.kpiLabel}>Avg Response Time</div>
                  <div style={styles.kpiValue}>{messageStats.avg_response_time || messageStats.avgResponseHours ? `${(messageStats.avg_response_time || messageStats.avgResponseHours || 0).toFixed(1)}h` : 'N/A'}</div>
                </div>
              </div>
              <div style={{ ...styles.kpiCard, borderLeft: '4px solid #ffc107' }}>
                <div style={{ ...styles.kpiIcon, backgroundColor: '#fff8e1' }}>%</div>
                <div style={styles.kpiContent}>
                  <div style={styles.kpiLabel}>Response Rate</div>
                  <div style={styles.kpiValue}>{messageStats.response_rate ? `${messageStats.response_rate.toFixed(0)}%` : 'N/A'}</div>
                </div>
              </div>
            </div>
          )}

          <div style={{ display: 'flex', gap: '24px' }}>
            {/* Inbox List */}
            <div style={{ ...styles.card, flex: selectedThread ? '0 0 40%' : '1', minWidth: 0 }}>
              <h3 style={{ margin: '0 0 16px 0', fontSize: '16px' }}>Inbox ({messageInbox.length})</h3>
              {messageInbox.length === 0 ? (
                <div style={styles.noData}>No messages in inbox.</div>
              ) : (
                <div style={{ maxHeight: '600px', overflow: 'auto' }}>
                  {messageInbox.map(msg => (
                    <div
                      key={msg.id}
                      style={{
                        padding: '12px 14px',
                        borderBottom: '1px solid #f0f0f0',
                        backgroundColor: selectedThread === msg.thread_id ? '#e3f2fd' : msg.is_read ? '#fff' : '#f0f7ff',
                        cursor: 'pointer',
                      }}
                      onClick={() => handleOpenThread(msg.thread_id, msg.channel_id)}
                    >
                      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '4px' }}>
                        <strong style={{ fontSize: '14px', fontWeight: msg.is_read ? '400' : '700' }}>{msg.subject || msg.sender_name || 'Message'}</strong>
                        <span style={{ fontSize: '11px', color: '#adb5bd' }}>{msg.created_at ? new Date(msg.created_at).toLocaleDateString() : ''}</span>
                      </div>
                      <div style={{ fontSize: '13px', color: '#6c757d', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {msg.body?.substring(0, 100) || msg.preview || ''}
                      </div>
                      <div style={{ display: 'flex', gap: '8px', marginTop: '6px' }}>
                        {msg.channel_code && (
                          <span style={{ fontSize: '11px', padding: '2px 8px', borderRadius: '10px', backgroundColor: getChannelColor(msg.channel_code) + '22', color: getChannelColor(msg.channel_code) }}>
                            {msg.channel_code}
                          </span>
                        )}
                        {!msg.is_read && <span style={{ fontSize: '11px', padding: '2px 8px', borderRadius: '10px', backgroundColor: '#dc3545', color: '#fff' }}>New</span>}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Thread View */}
            {selectedThread && (
              <div style={{ ...styles.card, flex: 1, minWidth: 0 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
                  <h3 style={{ margin: 0, fontSize: '16px' }}>Thread</h3>
                  <button style={{ ...styles.button, ...styles.smallButton }} onClick={() => { setSelectedThread(null); setThreadMessages([]); }}>Close</button>
                </div>
                <div style={{ maxHeight: '400px', overflow: 'auto', marginBottom: '16px' }}>
                  {threadMessages.map((tm, i) => (
                    <div key={tm.id || i} style={{ padding: '12px', marginBottom: '8px', borderRadius: '8px', backgroundColor: tm.is_operator ? '#e3f2fd' : '#f8f9fa', borderLeft: tm.is_operator ? '3px solid #007bff' : '3px solid #6c757d' }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '4px' }}>
                        <strong style={{ fontSize: '13px' }}>{tm.is_operator ? 'You' : (tm.sender_name || 'Customer')}</strong>
                        <span style={{ fontSize: '11px', color: '#adb5bd' }}>{tm.created_at ? new Date(tm.created_at).toLocaleString() : ''}</span>
                      </div>
                      <div style={{ fontSize: '14px', lineHeight: '1.6', whiteSpace: 'pre-wrap' }}>{tm.body}</div>
                    </div>
                  ))}
                  {threadMessages.length === 0 && <div style={styles.noData}>No messages in thread.</div>}
                </div>
                {/* Reply Box */}
                <div style={{ borderTop: '1px solid #e9ecef', paddingTop: '12px' }}>
                  <textarea
                    style={{ ...styles.input, width: '100%', minHeight: '80px', resize: 'vertical', fontFamily: 'inherit' }}
                    value={replyText}
                    onChange={e => setReplyText(e.target.value)}
                    placeholder="Type your reply..."
                  />
                  <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px', marginTop: '8px' }}>
                    <button
                      style={{ ...styles.button, ...styles.primaryButton, opacity: !replyText.trim() ? 0.6 : 1 }}
                      disabled={!replyText.trim()}
                      onClick={() => { const lastMsg = threadMessages[threadMessages.length - 1]; if (lastMsg) handleSendReply(lastMsg.id); }}
                    >
                      Send Reply
                    </button>
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* Message Templates */}
          <div style={{ ...styles.card, marginTop: '24px' }}>
            <h3 style={{ margin: '0 0 16px 0', fontSize: '16px' }}>Response Templates ({messageTemplates.length})</h3>
            {messageTemplates.length > 0 ? (
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '16px' }}>
                {messageTemplates.map(tpl => (
                  <div key={tpl.id} style={{ padding: '14px', border: '1px solid #e9ecef', borderRadius: '8px' }}>
                    <strong style={{ fontSize: '14px', display: 'block', marginBottom: '6px' }}>{tpl.name || tpl.template_name}</strong>
                    <div style={{ fontSize: '13px', color: '#6c757d', lineHeight: '1.5', maxHeight: '80px', overflow: 'hidden' }}>{tpl.body || tpl.template_body}</div>
                    <button style={{ ...styles.button, ...styles.smallButton, marginTop: '8px' }} onClick={() => setReplyText(tpl.body || tpl.template_body || '')}>Use Template</button>
                  </div>
                ))}
              </div>
            ) : (
              <div style={styles.noData}>No message templates configured.</div>
            )}
          </div>
        </div>
      )}

      {/* ============ TAB 9: ANALYTICS ============ */}
      {activeSection === 'analytics' && (
        <div style={styles.section}>
          <div style={styles.sectionHeader}>
            <h2 style={styles.sectionTitle}>Analytics & Insights</h2>
            <div style={{ display: 'flex', gap: '12px', alignItems: 'center' }}>
              <select style={{ ...styles.select, width: '180px' }} value={analyticsChannelId} onChange={e => { setAnalyticsChannelId(e.target.value); if (e.target.value) { fetchProfitability(e.target.value, analyticsDays); fetchSellThrough(e.target.value, analyticsDays); } }}>
                <option value="">All Channels</option>
                {channels.map(ch => <option key={ch.id} value={ch.id}>{ch.channel_name || ch.channel_code}</option>)}
              </select>
              <select style={{ ...styles.select, width: '120px' }} value={analyticsDays} onChange={e => { const d = parseInt(e.target.value); setAnalyticsDays(d); fetchRevenueByChannel(d); fetchProductPerformance(analyticsChannelId || null, d); fetchKpiSummary(d); }}>
                <option value="7">7 Days</option>
                <option value="14">14 Days</option>
                <option value="30">30 Days</option>
                <option value="60">60 Days</option>
                <option value="90">90 Days</option>
              </select>
            </div>
          </div>

          {/* KPI Summary Cards */}
          {kpiSummary && (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: '16px', marginBottom: '24px' }}>
              <div style={{ ...styles.kpiCard, borderLeft: '4px solid #007bff' }}>
                <div style={styles.kpiContent}>
                  <div style={styles.kpiLabel}>Total Revenue</div>
                  <div style={styles.kpiValue}>{formatCurrency(kpiSummary.total_revenue || kpiSummary.totalRevenue || 0)}</div>
                </div>
              </div>
              <div style={{ ...styles.kpiCard, borderLeft: '4px solid #28a745' }}>
                <div style={styles.kpiContent}>
                  <div style={styles.kpiLabel}>Total Orders</div>
                  <div style={styles.kpiValue}>{kpiSummary.total_orders || kpiSummary.totalOrders || 0}</div>
                </div>
              </div>
              <div style={{ ...styles.kpiCard, borderLeft: '4px solid #17a2b8' }}>
                <div style={styles.kpiContent}>
                  <div style={styles.kpiLabel}>Avg Order Value</div>
                  <div style={styles.kpiValue}>{formatCurrency(kpiSummary.avg_order_value || kpiSummary.avgOrderValue || 0)}</div>
                </div>
              </div>
              <div style={{ ...styles.kpiCard, borderLeft: '4px solid #ffc107' }}>
                <div style={styles.kpiContent}>
                  <div style={styles.kpiLabel}>Units Sold</div>
                  <div style={styles.kpiValue}>{kpiSummary.total_units || kpiSummary.unitsSold || 0}</div>
                </div>
              </div>
              <div style={{ ...styles.kpiCard, borderLeft: '4px solid #6f42c1' }}>
                <div style={styles.kpiContent}>
                  <div style={styles.kpiLabel}>Conversion Rate</div>
                  <div style={styles.kpiValue}>{(kpiSummary.conversion_rate || kpiSummary.conversionRate || 0).toFixed(1)}%</div>
                </div>
              </div>
            </div>
          )}

          {/* Revenue by Channel Chart */}
          <div style={{ ...styles.card, marginBottom: '24px' }}>
            <h3 style={{ margin: '0 0 16px 0', fontSize: '16px' }}>Revenue by Channel</h3>
            {revenueByChannel.length > 0 ? (
              <div>
                <div style={{ display: 'flex', gap: '24px', flexWrap: 'wrap', marginBottom: '16px' }}>
                  {(() => {
                    const channelTotals = {};
                    revenueByChannel.forEach(d => {
                      const key = d.channel_name || d.channel_code || 'Default';
                      channelTotals[key] = (channelTotals[key] || 0) + (d.revenue || 0);
                    });
                    return Object.entries(channelTotals).map(([name, total]) => (
                      <div key={name} style={{ padding: '12px 20px', background: '#f8f9fa', borderRadius: '8px', textAlign: 'center', borderLeft: `4px solid ${getChannelColor(name)}` }}>
                        <div style={{ fontSize: '12px', color: '#6c757d' }}>{name}</div>
                        <div style={{ fontSize: '20px', fontWeight: '700' }}>{formatCurrency(total)}</div>
                      </div>
                    ));
                  })()}
                </div>
                <SimpleBarChart data={revenueByChannel.slice(0, 14).map(d => ({ label: d.period || d.date || '', value: d.revenue || 0 }))} height={200} color="#007bff" />
              </div>
            ) : (
              <div style={styles.noData}>No revenue data available for the selected period.</div>
            )}
          </div>

          {/* Product Performance Table */}
          <div style={{ ...styles.card, marginBottom: '24px' }}>
            <h3 style={{ margin: '0 0 16px 0', fontSize: '16px' }}>Product Performance</h3>
            {productPerformance.length > 0 ? (
              <div style={styles.tableContainer}>
                <table style={styles.table}>
                  <thead>
                    <tr>
                      <th style={styles.th}>Product</th>
                      <th style={styles.th}>SKU</th>
                      <th style={styles.th}>Units Sold</th>
                      <th style={styles.th}>Revenue</th>
                      <th style={styles.th}>Avg Price</th>
                      <th style={styles.th}>Return Rate</th>
                    </tr>
                  </thead>
                  <tbody>
                    {productPerformance.slice(0, 20).map((p, i) => (
                      <tr key={i}>
                        <td style={styles.td}><strong>{p.product_name || p.name || '-'}</strong></td>
                        <td style={styles.td}>{p.sku || '-'}</td>
                        <td style={styles.td}>{p.units_sold || p.quantity || 0}</td>
                        <td style={styles.td}>{formatCurrency(p.revenue || p.total_revenue || 0)}</td>
                        <td style={styles.td}>{formatCurrency(p.avg_price || (p.revenue && p.units_sold ? p.revenue / p.units_sold : 0))}</td>
                        <td style={styles.td}>
                          <span style={{ color: (p.return_rate || 0) > 5 ? '#dc3545' : '#28a745' }}>
                            {(p.return_rate || 0).toFixed(1)}%
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <div style={styles.noData}>No product performance data available.</div>
            )}
          </div>

          {/* Profitability Analysis */}
          {profitability && (
            <div style={{ ...styles.card, marginBottom: '24px' }}>
              <h3 style={{ margin: '0 0 16px 0', fontSize: '16px' }}>Profitability Analysis {analyticsChannelId ? '' : '(Select a channel)'}</h3>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '16px', marginBottom: '16px' }}>
                <div style={{ textAlign: 'center', padding: '16px', background: '#e3f2fd', borderRadius: '8px' }}>
                  <div style={{ fontSize: '12px', color: '#6c757d' }}>Gross Revenue</div>
                  <div style={{ fontSize: '24px', fontWeight: '700' }}>{formatCurrency(profitability.gross_revenue || profitability.grossRevenue || 0)}</div>
                </div>
                <div style={{ textAlign: 'center', padding: '16px', background: '#fce4ec', borderRadius: '8px' }}>
                  <div style={{ fontSize: '12px', color: '#6c757d' }}>Total Costs</div>
                  <div style={{ fontSize: '24px', fontWeight: '700', color: '#dc3545' }}>{formatCurrency(profitability.total_costs || profitability.totalCosts || 0)}</div>
                </div>
                <div style={{ textAlign: 'center', padding: '16px', background: (profitability.net_profit || profitability.netProfit || 0) >= 0 ? '#e8f5e9' : '#f8d7da', borderRadius: '8px' }}>
                  <div style={{ fontSize: '12px', color: '#6c757d' }}>Net Profit</div>
                  <div style={{ fontSize: '24px', fontWeight: '700', color: (profitability.net_profit || profitability.netProfit || 0) >= 0 ? '#28a745' : '#dc3545' }}>
                    {formatCurrency(profitability.net_profit || profitability.netProfit || 0)}
                  </div>
                </div>
                <div style={{ textAlign: 'center', padding: '16px', background: '#f8f9fa', borderRadius: '8px' }}>
                  <div style={{ fontSize: '12px', color: '#6c757d' }}>Margin</div>
                  <div style={{ fontSize: '24px', fontWeight: '700' }}>{(profitability.margin_percent || profitability.marginPercent || 0).toFixed(1)}%</div>
                </div>
              </div>
              {profitability.cost_breakdown && (
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '12px' }}>
                  {Object.entries(profitability.cost_breakdown).map(([key, val]) => (
                    <div key={key} style={{ padding: '10px', background: '#f8f9fa', borderRadius: '6px', fontSize: '13px' }}>
                      <div style={{ color: '#6c757d', textTransform: 'capitalize' }}>{key.replace(/_/g, ' ')}</div>
                      <div style={{ fontWeight: '600' }}>{formatCurrency(val)}</div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* Sell-Through Rates */}
          {sellThrough.length > 0 && (
            <div style={{ ...styles.card, marginBottom: '24px' }}>
              <h3 style={{ margin: '0 0 16px 0', fontSize: '16px' }}>Sell-Through Rates</h3>
              <div style={styles.tableContainer}>
                <table style={styles.table}>
                  <thead>
                    <tr>
                      <th style={styles.th}>Product</th>
                      <th style={styles.th}>SKU</th>
                      <th style={styles.th}>Received</th>
                      <th style={styles.th}>Sold</th>
                      <th style={styles.th}>On Hand</th>
                      <th style={styles.th}>Sell-Through %</th>
                    </tr>
                  </thead>
                  <tbody>
                    {sellThrough.slice(0, 20).map((st, i) => (
                      <tr key={i}>
                        <td style={styles.td}>{st.product_name || st.name || '-'}</td>
                        <td style={styles.td}>{st.sku || '-'}</td>
                        <td style={styles.td}>{st.received || st.total_received || 0}</td>
                        <td style={styles.td}>{st.sold || st.total_sold || 0}</td>
                        <td style={styles.td}>{st.on_hand || st.current_stock || 0}</td>
                        <td style={styles.td}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                            <div style={{ flex: 1, height: '8px', background: '#e9ecef', borderRadius: '4px', overflow: 'hidden' }}>
                              <div style={{ width: `${Math.min(st.sell_through_rate || st.sellThroughRate || 0, 100)}%`, height: '100%', background: (st.sell_through_rate || st.sellThroughRate || 0) > 70 ? '#28a745' : (st.sell_through_rate || st.sellThroughRate || 0) > 40 ? '#ffc107' : '#dc3545', borderRadius: '4px' }} />
                            </div>
                            <span style={{ fontWeight: '600', minWidth: '45px' }}>{(st.sell_through_rate || st.sellThroughRate || 0).toFixed(1)}%</span>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* Reports Section */}
          <div style={{ ...styles.card, marginBottom: '24px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
              <h3 style={{ margin: 0, fontSize: '16px' }}>Reports</h3>
            </div>
            <div style={{ display: 'flex', gap: '16px', alignItems: 'flex-end', flexWrap: 'wrap' }}>
              <div style={styles.formGroup}>
                <label style={styles.label}>Report Type</label>
                <select style={{ ...styles.select, width: '250px' }} value={selectedReportType} onChange={(e) => setSelectedReportType(e.target.value)}>
                  <option value="DailySummary">Daily Summary</option>
                  <option value="WeeklyPnL">Weekly P&L</option>
                  <option value="MonthlyTaxReport">Monthly Tax Report</option>
                </select>
              </div>
              {selectedReportType === 'DailySummary' && (
                <div style={styles.formGroup}>
                  <label style={styles.label}>Date</label>
                  <input type="date" style={{ ...styles.input, width: '180px' }} value={reportDate} onChange={(e) => setReportDate(e.target.value)} />
                </div>
              )}
              {selectedReportType === 'MonthlyTaxReport' && (
                <>
                  <div style={styles.formGroup}>
                    <label style={styles.label}>Year</label>
                    <input type="number" style={{ ...styles.input, width: '100px' }} value={reportYear} onChange={(e) => setReportYear(parseInt(e.target.value) || 2026)} />
                  </div>
                  <div style={styles.formGroup}>
                    <label style={styles.label}>Month</label>
                    <select style={{ ...styles.select, width: '140px' }} value={reportMonth} onChange={(e) => setReportMonth(parseInt(e.target.value))}>
                      {[1,2,3,4,5,6,7,8,9,10,11,12].map(m => <option key={m} value={m}>{new Date(2026, m-1).toLocaleString('default', {month: 'long'})}</option>)}
                    </select>
                  </div>
                </>
              )}
              <div style={{ display: 'flex', gap: '8px', paddingBottom: '16px' }}>
                <button style={{ ...styles.button, ...styles.primaryButton, opacity: reportLoading ? 0.6 : 1 }} disabled={reportLoading} onClick={() => fetchReport(selectedReportType, { date: reportDate, year: reportYear, month: reportMonth })}>
                  {reportLoading ? 'Loading...' : 'Generate'}
                </button>
                {reportData && (
                  <>
                    <button style={{ ...styles.button, ...styles.outlineButton }} onClick={() => handleExportReport(selectedReportType, 'csv')}>CSV</button>
                    <button style={{ ...styles.button, ...styles.secondaryButton }} onClick={() => handleExportReport(selectedReportType, 'json')}>JSON</button>
                  </>
                )}
              </div>
            </div>
            {reportData && (
              <div style={{ marginTop: '16px', padding: '16px', background: '#f8f9fa', borderRadius: '8px' }}>
                <h4 style={{ margin: '0 0 12px 0', fontSize: '14px' }}>
                  {reportData.reportType === 'DailySummary' ? 'Daily Summary' : reportData.reportType === 'WeeklyPnL' ? 'Weekly P&L' : 'Monthly Tax'}
                  {reportData.date && <span style={{ fontSize: '13px', color: '#6c757d', marginLeft: '12px' }}>{reportData.date}</span>}
                  {reportData.weekStart && <span style={{ fontSize: '13px', color: '#6c757d', marginLeft: '12px' }}>{reportData.weekStart} - {reportData.weekEnd}</span>}
                </h4>
                {reportData.totals && (
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '12px' }}>
                    <div style={{ padding: '10px', background: '#fff', borderRadius: '6px', fontSize: '13px' }}>
                      <div style={{ color: '#6c757d' }}>Revenue</div>
                      <div style={{ fontWeight: '600' }}>{formatCurrency(reportData.totals.gross_revenue || reportData.totals.grossRevenue || 0)}</div>
                    </div>
                    <div style={{ padding: '10px', background: '#fff', borderRadius: '6px', fontSize: '13px' }}>
                      <div style={{ color: '#6c757d' }}>Orders</div>
                      <div style={{ fontWeight: '600' }}>{reportData.totals.order_count || reportData.totals.orderCount || 0}</div>
                    </div>
                    <div style={{ padding: '10px', background: '#fff', borderRadius: '6px', fontSize: '13px' }}>
                      <div style={{ color: '#6c757d' }}>Net Profit</div>
                      <div style={{ fontWeight: '600', color: (reportData.totals.netProfit || reportData.totals.net_revenue || 0) >= 0 ? '#28a745' : '#dc3545' }}>
                        {formatCurrency(reportData.totals.netProfit || reportData.totals.net_revenue || 0)}
                      </div>
                    </div>
                    <div style={{ padding: '10px', background: '#fff', borderRadius: '6px', fontSize: '13px' }}>
                      <div style={{ color: '#6c757d' }}>Margin</div>
                      <div style={{ fontWeight: '600' }}>{(reportData.totals.marginPercent || 0).toFixed(1)}%</div>
                    </div>
                  </div>
                )}
                {reportData.summary && (
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '12px' }}>
                    <div style={{ padding: '10px', background: '#fff', borderRadius: '6px', fontSize: '13px' }}>
                      <div style={{ color: '#6c757d' }}>Federal Tax</div><div style={{ fontWeight: '600' }}>{formatCurrency(reportData.summary.federalTax)}</div>
                    </div>
                    <div style={{ padding: '10px', background: '#fff', borderRadius: '6px', fontSize: '13px' }}>
                      <div style={{ color: '#6c757d' }}>Provincial Tax</div><div style={{ fontWeight: '600' }}>{formatCurrency(reportData.summary.provincialTax)}</div>
                    </div>
                    <div style={{ padding: '10px', background: '#fff', borderRadius: '6px', fontSize: '13px' }}>
                      <div style={{ color: '#6c757d' }}>Commission ITC</div><div style={{ fontWeight: '600' }}>{formatCurrency(reportData.commissionITC?.itcAmount || 0)}</div>
                    </div>
                    <div style={{ padding: '10px', background: '#fff', borderRadius: '6px', fontSize: '13px' }}>
                      <div style={{ color: '#6c757d' }}>EHF</div><div style={{ fontWeight: '600' }}>{formatCurrency(reportData.ehf?.totalCollected || 0)}</div>
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Anomaly Detection */}
          <div style={{ ...styles.card, marginBottom: '24px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
              <h3 style={{ margin: 0, fontSize: '16px' }}>Anomaly Detection</h3>
              <button style={{ ...styles.button, ...styles.outlineButton, opacity: anomaliesLoading ? 0.6 : 1 }} onClick={fetchAnomalies} disabled={anomaliesLoading}>
                {anomaliesLoading ? 'Scanning...' : 'Scan for Anomalies'}
              </button>
            </div>
            {anomalies ? (
              <>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '12px', marginBottom: '16px' }}>
                  <div style={{ padding: '12px', background: '#f8d7da', borderRadius: '8px', textAlign: 'center' }}>
                    <div style={{ fontSize: '12px', color: '#721c24' }}>High</div>
                    <div style={{ fontSize: '20px', fontWeight: '700', color: '#721c24' }}>{anomalies.bySeverity?.high || 0}</div>
                  </div>
                  <div style={{ padding: '12px', background: '#fff3cd', borderRadius: '8px', textAlign: 'center' }}>
                    <div style={{ fontSize: '12px', color: '#856404' }}>Medium</div>
                    <div style={{ fontSize: '20px', fontWeight: '700', color: '#856404' }}>{anomalies.bySeverity?.medium || 0}</div>
                  </div>
                  <div style={{ padding: '12px', background: '#d4edda', borderRadius: '8px', textAlign: 'center' }}>
                    <div style={{ fontSize: '12px', color: '#155724' }}>Low</div>
                    <div style={{ fontSize: '20px', fontWeight: '700', color: '#155724' }}>{anomalies.bySeverity?.low || 0}</div>
                  </div>
                  <div style={{ padding: '12px', background: '#e3f2fd', borderRadius: '8px', textAlign: 'center' }}>
                    <div style={{ fontSize: '12px', color: '#1565c0' }}>Total</div>
                    <div style={{ fontSize: '20px', fontWeight: '700', color: '#1565c0' }}>{anomalies.totalAnomalies || 0}</div>
                  </div>
                </div>
                {anomalies.anomalies && anomalies.anomalies.length > 0 && (
                  <table style={styles.table}>
                    <thead><tr><th style={styles.th}>Type</th><th style={styles.th}>Severity</th><th style={styles.th}>Message</th><th style={styles.th}>Product</th></tr></thead>
                    <tbody>
                      {anomalies.anomalies.map((a, i) => (
                        <tr key={i}>
                          <td style={styles.td}><span style={{ textTransform: 'capitalize' }}>{(a.type || '').replace(/_/g, ' ')}</span></td>
                          <td style={styles.td}><span style={{ ...styles.statusBadge, backgroundColor: a.severity === 'high' ? '#f8d7da' : a.severity === 'medium' ? '#fff3cd' : '#d4edda', color: a.severity === 'high' ? '#721c24' : a.severity === 'medium' ? '#856404' : '#155724' }}>{a.severity}</span></td>
                          <td style={styles.td}>{a.message}</td>
                          <td style={styles.td}>{a.productName || a.sku || '-'}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
                {anomalies.totalAnomalies === 0 && <div style={styles.noData}>No anomalies detected.</div>}
              </>
            ) : (
              <div style={styles.noData}>Click "Scan for Anomalies" to detect issues.</div>
            )}
          </div>

          {/* AI Natural Language Query */}
          <div style={styles.card}>
            <h3 style={{ margin: '0 0 16px 0', fontSize: '16px' }}>AI Query</h3>
            <div style={{ display: 'flex', gap: '12px', marginBottom: '12px' }}>
              <input type="text" style={{ ...styles.input, flex: 1 }} placeholder="Ask about your marketplace data..." value={aiQuery} onChange={(e) => setAiQuery(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') handleAIQuery(); }} />
              <button style={{ ...styles.button, ...styles.primaryButton, opacity: aiQuerying ? 0.6 : 1, minWidth: '100px' }} disabled={aiQuerying || !aiQuery.trim()} onClick={handleAIQuery}>
                {aiQuerying ? 'Thinking...' : 'Ask AI'}
              </button>
            </div>
            {aiQueryResult && (
              <div style={{ background: '#f0f7ff', padding: '16px', borderRadius: '8px', border: '1px solid #b3d7ff' }}>
                <div style={{ fontWeight: '600', marginBottom: '8px', fontSize: '15px' }}>Answer</div>
                <div style={{ fontSize: '14px', lineHeight: '1.6', marginBottom: '12px' }}>{aiQueryResult.answer}</div>
                {aiQueryResult.data && aiQueryResult.data.length > 0 && (
                  <div style={{ maxHeight: '300px', overflow: 'auto', background: '#fff', borderRadius: '6px', border: '1px solid #e9ecef' }}>
                    <table style={styles.table}>
                      <thead><tr>{Object.keys(aiQueryResult.data[0]).map(key => <th key={key} style={styles.th}>{key}</th>)}</tr></thead>
                      <tbody>
                        {aiQueryResult.data.slice(0, 20).map((row, i) => (
                          <tr key={i}>{Object.values(row).map((val, j) => <td key={j} style={styles.td}>{typeof val === 'number' ? val.toLocaleString() : String(val ?? '-')}</td>)}</tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
                {aiQueryResult.sql && (
                  <details style={{ marginTop: '12px' }}>
                    <summary style={{ cursor: 'pointer', fontSize: '12px', color: '#6c757d' }}>View SQL</summary>
                    <pre style={{ background: '#1a1a2e', color: '#e9ecef', padding: '12px', borderRadius: '6px', fontSize: '12px', overflow: 'auto', marginTop: '8px' }}>{aiQueryResult.sql}</pre>
                  </details>
                )}
              </div>
            )}
          </div>
        </div>
      )}

      {/* ============ TAB 10: SETTINGS ============ */}
      {activeSection === 'settings' && (
        <div style={styles.section}>
          <h2 style={styles.sectionTitle}>Settings</h2>

          {/* Connection Info */}
          <div style={{ ...styles.card, marginTop: '20px' }}>
            <h3 style={{ margin: '0 0 16px 0', fontSize: '16px' }}>Best Buy Marketplace Connection</h3>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '16px', marginBottom: '16px' }}>
              <div>
                <div style={styles.label}>API URL</div>
                <div style={{ fontSize: '14px', color: '#212529', fontFamily: 'monospace', wordBreak: 'break-all' }}>
                  bestbuy-us.mirakl.net
                </div>
              </div>
              <div>
                <div style={styles.label}>API Key</div>
                <div style={{ fontSize: '14px', fontFamily: 'monospace', color: connectionResult?.success ? '#28a745' : '#6c757d' }}>
                  {connectionResult?.success ? '●●●●-●●●●-●●●● (set)' : 'Click Test to verify'}
                </div>
              </div>
              <div>
                <div style={styles.label}>Shop ID</div>
                <div style={{ fontSize: '14px', fontFamily: 'monospace', color: '#212529' }}>Server-side env var</div>
              </div>
            </div>
            <div style={{ display: 'flex', gap: '12px', alignItems: 'center' }}>
              <button style={{ ...styles.button, ...styles.primaryButton, opacity: testingConnection ? 0.6 : 1 }} onClick={handleTestConnection} disabled={testingConnection}>
                {testingConnection ? 'Testing...' : 'Test Connection'}
              </button>
              {connectionResult && (
                <span style={{ fontWeight: '500', color: connectionResult.success ? '#28a745' : '#dc3545' }}>
                  {connectionResult.success ? '✓ ' : '✗ '}{connectionResult.message}
                </span>
              )}
            </div>
          </div>

          {/* Polling Status */}
          <div style={{ ...styles.card, marginTop: '20px' }}>
            <h3 style={{ margin: '0 0 16px 0', fontSize: '16px' }}>
              Polling Jobs
              <button style={{ ...styles.button, ...styles.smallButton, ...styles.outlineButton, marginLeft: '12px' }} onClick={fetchPollingStatus}>Refresh</button>
            </h3>
            {pollingStatus ? (
              <table style={styles.table}>
                <thead>
                  <tr>
                    <th style={styles.th}>Job</th>
                    <th style={styles.th}>Interval</th>
                    <th style={styles.th}>Status</th>
                    <th style={styles.th}>Last Run</th>
                    <th style={styles.th}>Last Result</th>
                    <th style={styles.th}>Next Run</th>
                  </tr>
                </thead>
                <tbody>
                  {(pollingStatus.jobs || []).map(job => (
                    <tr key={job.name}>
                      <td style={styles.td}>
                        <strong>{job.name.charAt(0).toUpperCase() + job.name.slice(1)}</strong>
                      </td>
                      <td style={styles.td}>{job.intervalMinutes} min</td>
                      <td style={styles.td}>
                        <span style={{ display: 'inline-block', width: '10px', height: '10px', borderRadius: '50%', backgroundColor: job.active ? '#28a745' : '#6c757d', marginRight: '6px' }} />
                        {job.active ? 'Running' : 'Stopped'}
                      </td>
                      <td style={styles.td}>{job.lastRun ? formatRelativeTime(job.lastRun) : 'Never'}</td>
                      <td style={styles.td}>
                        {job.lastResult ? (
                          <span style={{ color: job.lastResult.status === 'success' ? '#28a745' : job.lastResult.status === 'skipped' ? '#f59e0b' : '#dc3545' }}>
                            {job.lastResult.status}
                          </span>
                        ) : '-'}
                      </td>
                      <td style={styles.td}>{job.nextRun ? new Date(job.nextRun).toLocaleTimeString() : '-'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            ) : (
              <div style={styles.noData}>
                {pollingStatus?.error || 'Polling status unavailable. Set MARKETPLACE_POLLING_ENABLED=true to enable.'}
              </div>
            )}
            <div style={{ marginTop: '8px', fontSize: '12px', color: '#6c757d' }}>
              Master switch: <code>MARKETPLACE_POLLING_ENABLED</code> = {pollingStatus?.enabled ? 'true' : 'false'}
            </div>
          </div>

          {/* Sync Settings — existing functionality preserved */}
          <div style={{ ...styles.card, marginTop: '20px' }}>
            <h3 style={{ margin: '0 0 16px 0', fontSize: '16px' }}>Sync Settings</h3>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '20px' }}>
              <div>
                <div style={styles.label}>Auto-Sync</div>
                <label style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer' }}>
                  <input type="checkbox" checked={syncSettings.auto_sync_enabled?.enabled || false}
                    onChange={async (e) => { try { await axios.put(`${API_BASE_URL}/api/marketplace/sync-settings/auto_sync_enabled`, { value: { enabled: e.target.checked } }); fetchSyncSettings(); setMessage(e.target.checked ? 'Auto-sync enabled' : 'Auto-sync disabled'); } catch (err) { setError('Failed to update'); } }} />
                  {syncSettings.auto_sync_enabled?.enabled ? 'Enabled' : 'Disabled'}
                </label>
              </div>
              <div>
                <div style={styles.label}>Sync Frequency</div>
                <select style={styles.select} value={syncSettings.sync_frequency_hours?.value || 4}
                  onChange={async (e) => { try { await axios.put(`${API_BASE_URL}/api/marketplace/sync-settings/sync_frequency_hours`, { value: { value: parseInt(e.target.value) } }); fetchSyncSettings(); setMessage(`Frequency set to every ${e.target.value}h`); } catch (err) { setError('Failed to update'); } }}>
                  <option value="1">Every 1 hour</option>
                  <option value="2">Every 2 hours</option>
                  <option value="4">Every 4 hours</option>
                  <option value="6">Every 6 hours</option>
                  <option value="12">Every 12 hours</option>
                  <option value="24">Every 24 hours</option>
                </select>
              </div>
            </div>
          </div>

          {/* Per-Channel Credentials */}
          {channels.length > 0 && (
            <div style={{ ...styles.card, marginTop: '20px' }}>
              <h3 style={{ margin: '0 0 16px 0', fontSize: '16px' }}>Channel Credentials</h3>
              <div style={styles.tableContainer}>
                <table style={styles.table}>
                  <thead>
                    <tr>
                      <th style={styles.th}>Channel</th>
                      <th style={styles.th}>Status</th>
                      <th style={styles.th}>API URL</th>
                      <th style={styles.th}>API Key</th>
                      <th style={styles.th}>Last Tested</th>
                      <th style={styles.th}>Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {channels.map(ch => (
                      <tr key={ch.id}>
                        <td style={styles.td}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                            <span style={{ width: '8px', height: '8px', borderRadius: '50%', backgroundColor: ch.status === 'ACTIVE' ? '#28a745' : '#6c757d' }} />
                            <strong>{ch.channel_name || ch.channel_code}</strong>
                          </div>
                        </td>
                        <td style={styles.td}>
                          <span style={{ ...styles.statusBadge, backgroundColor: ch.status === 'ACTIVE' ? '#d4edda' : '#fff3cd', color: ch.status === 'ACTIVE' ? '#155724' : '#856404' }}>
                            {ch.status}
                          </span>
                        </td>
                        <td style={styles.td}><code style={{ fontSize: '12px' }}>{ch.api_url ? ch.api_url.replace(/https?:\/\//, '').substring(0, 30) : 'Not set'}</code></td>
                        <td style={styles.td}>{ch.credentials_set || ch.api_url ? 'Configured' : 'Not set'}</td>
                        <td style={styles.td}>{ch.last_tested ? formatRelativeTime(ch.last_tested) : 'Never'}</td>
                        <td style={styles.td}>
                          <button style={{ ...styles.button, ...styles.smallButton }} onClick={() => handleTestChannel(ch.id)}>Test</button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* Shipping Preferences */}
          <div style={{ ...styles.card, marginTop: '20px' }}>
            <h3 style={{ margin: '0 0 16px 0', fontSize: '16px' }}>Shipping Preferences</h3>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '20px' }}>
              <div>
                <div style={styles.label}>Default Carrier</div>
                <select style={styles.select} value={settings.default_carrier || 'canada_post'}
                  onChange={async (e) => { try { await axios.put(`${API_BASE_URL}/api/marketplace/settings/default_carrier`, { value: e.target.value }); setSettings(s => ({ ...s, default_carrier: e.target.value })); setMessage('Default carrier updated'); } catch (err) { setError('Failed to update'); } }}>
                  <option value="canada_post">Canada Post</option>
                  <option value="purolator">Purolator</option>
                  <option value="ups">UPS</option>
                  <option value="fedex">FedEx</option>
                </select>
              </div>
              <div>
                <div style={styles.label}>Auto-Select Best Rate</div>
                <label style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer' }}>
                  <input type="checkbox" checked={settings.auto_select_carrier || false}
                    onChange={async (e) => { try { await axios.put(`${API_BASE_URL}/api/marketplace/settings/auto_select_carrier`, { value: e.target.checked }); setSettings(s => ({ ...s, auto_select_carrier: e.target.checked })); setMessage(e.target.checked ? 'Auto-select enabled' : 'Auto-select disabled'); } catch (err) { setError('Failed to update'); } }} />
                  {settings.auto_select_carrier ? 'Enabled' : 'Disabled'}
                </label>
              </div>
            </div>
          </div>

          {/* Pricing Rules — existing functionality preserved */}
          <div style={{ ...styles.card, marginTop: '20px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
              <h3 style={{ margin: 0, fontSize: '16px' }}>Legacy Pricing Rules</h3>
              <button style={{ ...styles.button, ...styles.primaryButton }} onClick={() => { setEditingPriceRule(null); setShowPriceRuleModal(true); }}>+ Create Rule</button>
            </div>
            <div style={styles.rulesGrid}>
              {priceRules.map(rule => (
                <div key={rule.id} style={styles.ruleCard}>
                  <div style={styles.ruleHeader}>
                    <div>
                      <h4 style={styles.ruleName}>{rule.name}</h4>
                      <span style={{ ...styles.ruleTypeBadge, backgroundColor: rule.rule_type === 'markup_percent' ? '#e3f2fd' : rule.rule_type === 'markup_fixed' ? '#fff3e0' : '#e8f5e9', color: rule.rule_type === 'markup_percent' ? '#1565c0' : rule.rule_type === 'markup_fixed' ? '#ef6c00' : '#2e7d32' }}>
                        {rule.rule_type === 'markup_percent' ? `+${rule.value}%` : rule.rule_type === 'markup_fixed' ? `+$${rule.value}` : `Min ${rule.value}%`}
                      </span>
                    </div>
                  </div>
                  <p style={styles.ruleDescription}>{rule.description}</p>
                  <div style={{ display: 'flex', gap: '8px' }}>
                    <button style={{ ...styles.button, ...styles.smallButton }} onClick={() => { setEditingPriceRule(rule); setShowPriceRuleModal(true); }}>Edit</button>
                    <button style={{ ...styles.button, ...styles.smallButton, ...styles.dangerButton }} onClick={async () => { if (window.confirm('Delete this rule?')) { try { await axios.delete(`${API_BASE_URL}/api/marketplace/price-rules/${rule.id}`); fetchPriceRules(); } catch (err) { setError('Failed'); } } }}>Delete</button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Modals */}
      {showRejectModal && <RejectModal />}
      {orderDetailId && <OrderDetailModal />}
      {showRuleModal && <RuleEditorModal />}

      {/* Ship Order Modal */}
      {showShipModal && (
        <div style={styles.modalOverlay} onClick={() => setShowShipModal(false)}>
          <div style={{ ...styles.modal, maxWidth: '500px' }} onClick={e => e.stopPropagation()}>
            <div style={styles.modalHeader}>
              <h3 style={styles.modalTitle}>Ship Order</h3>
              <button style={styles.closeModalBtn} onClick={() => setShowShipModal(false)}>x</button>
            </div>
            <div style={styles.formGroup}>
              <label style={styles.label}>Tracking Number *</label>
              <input type="text" style={styles.input} value={shipForm.tracking_number}
                onChange={(e) => setShipForm(prev => ({ ...prev, tracking_number: e.target.value }))} placeholder="Enter tracking number" />
            </div>
            <div style={styles.formGroup}>
              <label style={styles.label}>Carrier</label>
              <select style={styles.select} value={shipForm.carrier_code}
                onChange={(e) => setShipForm(prev => ({ ...prev, carrier_code: e.target.value }))}>
                <option value="canada_post">Canada Post</option>
                <option value="purolator">Purolator</option>
                <option value="ups">UPS</option>
                <option value="fedex">FedEx</option>
                <option value="dhl">DHL</option>
                <option value="other">Other</option>
              </select>
            </div>
            {shipForm.carrier_code === 'other' && (
              <>
                <div style={styles.formGroup}>
                  <label style={styles.label}>Carrier Name</label>
                  <input type="text" style={styles.input} value={shipForm.carrier_name}
                    onChange={(e) => setShipForm(prev => ({ ...prev, carrier_name: e.target.value }))} placeholder="Carrier name" />
                </div>
                <div style={styles.formGroup}>
                  <label style={styles.label}>Tracking URL</label>
                  <input type="text" style={styles.input} value={shipForm.carrier_url}
                    onChange={(e) => setShipForm(prev => ({ ...prev, carrier_url: e.target.value }))} placeholder="https://..." />
                </div>
              </>
            )}
            <div style={styles.modalActions}>
              <button style={{ ...styles.button, ...styles.secondaryButton }} onClick={() => setShowShipModal(false)}>Cancel</button>
              <button style={{ ...styles.button, ...styles.primaryButton }} onClick={handleShipOrder}>Submit Shipment</button>
            </div>
          </div>
        </div>
      )}
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
    overflowX: 'auto',
    WebkitOverflowScrolling: 'touch',
  },
  navButton: {
    padding: '12px 18px',
    border: 'none',
    backgroundColor: 'transparent',
    cursor: 'pointer',
    fontSize: '13px',
    fontWeight: '600',
    color: '#6c757d',
    borderRadius: '6px',
    transition: 'all 0.2s',
    whiteSpace: 'nowrap',
    flexShrink: 0,
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
  successButton: {
    backgroundColor: '#28a745',
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
