import React, { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import { previewQuotePDF, downloadQuotePDF } from '../services/pdfService';
import {
  FinancingCalculator,
  WarrantySelector,
  DeliverySelector,
  RebatesDisplay,
  TradeInEstimator
} from './RevenueFeatures';
import { getSmartSuggestions, getSuggestionsSummary } from '../utils/smartSuggestions';
import { useAuth } from '../contexts/AuthContext';
import logger from '../utils/logger';
import { cachedFetch, invalidateCache } from '../services/apiCache';
import { QuoteList, QuoteBuilder, QuoteViewer } from './quotes';
import { toast } from './ui/Toast';

const API_URL = process.env.REACT_APP_API_URL || 'http://localhost:3001';

const QuotationManager = () => {
  // ============================================
  // AUTHENTICATION
  // ============================================
  const { user } = useAuth();

  // ============================================
  // STATE MANAGEMENT
  // ============================================
  const [view, setView] = useState('list'); // 'list', 'builder', 'viewer', 'analytics', 'approvals', 'followups'
  const [quotations, setQuotations] = useState([]);
  const [customers, setCustomers] = useState([]);
  const [products, setProducts] = useState([]);
  const [stats, setStats] = useState({});
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [dateFilter, setDateFilter] = useState('all'); // 'all', 'today', 'week', 'month', 'custom'
  const [valueFilter, setValueFilter] = useState('all'); // 'all', '0-1000', '1000-5000', '5000-10000', '10000+'
  const [expiringFilter, setExpiringFilter] = useState(false);
  const [sortBy, setSortBy] = useState('date'); // 'date', 'value', 'customer', 'status'
  const [sortOrder, setSortOrder] = useState('desc'); // 'asc', 'desc'

  // Advanced filters
  const [customerFilter, setCustomerFilter] = useState('all'); // Filter by specific customer
  const [productFilter, setProductFilter] = useState(''); // Filter by product name/model
  const [createdByFilter, setCreatedByFilter] = useState('all'); // Filter by creator
  const [showAdvancedFilters, setShowAdvancedFilters] = useState(false); // Toggle advanced panel
  const [filterPresets, setFilterPresets] = useState([]); // Saved filter combinations

  // Builder state
  const [selectedCustomer, setSelectedCustomer] = useState(null);
  const [quoteItems, setQuoteItems] = useState([]);
  const [discountPercent, setDiscountPercent] = useState(0);
  const [notes, setNotes] = useState('');
  const [internalNotes, setInternalNotes] = useState('');
  const [terms, setTerms] = useState('Payment due within 30 days. All prices in CAD.');
  const [productSearchTerm, setProductSearchTerm] = useState('');
  const [editingQuoteId, setEditingQuoteId] = useState(null); // Track if editing
  const [customerSearchTerm, setCustomerSearchTerm] = useState('');
  const [showCustomerDropdown, setShowCustomerDropdown] = useState(false);

  // Viewer state
  const [selectedQuote, setSelectedQuote] = useState(null);
  const [quoteEvents, setQuoteEvents] = useState([]);

  // Template state
  const [templates, setTemplates] = useState([]);
  const [showTemplateSaveDialog, setShowTemplateSaveDialog] = useState(false);
  const [templateName, setTemplateName] = useState('');
  const [templateDescription, setTemplateDescription] = useState('');

  // Customer history state
  const [customerQuotes, setCustomerQuotes] = useState([]);

  // Product favorites & recent state
  const [favoriteProducts, setFavoriteProducts] = useState([]);
  const [recentProducts, setRecentProducts] = useState([]);
  const [productTab, setProductTab] = useState('search'); // 'search', 'favorites', 'recent'

  // Payment terms state
  const [paymentTermsTemplates, setPaymentTermsTemplates] = useState([]);

  // Email dialog state
  const [showEmailDialog, setShowEmailDialog] = useState(false);
  const [emailTo, setEmailTo] = useState('');
  const [emailSubject, setEmailSubject] = useState('');
  const [emailMessage, setEmailMessage] = useState('');

  // Activity timeline state
  const [showAddEventDialog, setShowAddEventDialog] = useState(false);
  const [newEventDescription, setNewEventDescription] = useState('');

  // Analytics state
  const [analyticsData, setAnalyticsData] = useState(null);

  // Approval workflow state
  const [showApprovalDialog, setShowApprovalDialog] = useState(false);
  const [approvalRequestedBy, setApprovalRequestedBy] = useState('');
  const [approvalRequestedByEmail, setApprovalRequestedByEmail] = useState('');
  const [approverName, setApproverName] = useState('');
  const [approverEmail, setApproverEmail] = useState('');
  const [approvalComments, setApprovalComments] = useState('');
  const [quoteApprovals, setQuoteApprovals] = useState([]);
  const [pendingApprovals, setPendingApprovals] = useState([]);
  const [showApprovalActionDialog, setShowApprovalActionDialog] = useState(false);
  const [selectedApproval, setSelectedApproval] = useState(null);
  const [approvalAction, setApprovalAction] = useState(''); // 'approve' or 'reject'
  const [approvalActionComments, setApprovalActionComments] = useState('');

  // ============================================
  // REVENUE FEATURES STATE
  // ============================================
  const [quoteFinancing, setQuoteFinancing] = useState(null);
  const [quoteWarranties, setQuoteWarranties] = useState([]);
  const [quoteDelivery, setQuoteDelivery] = useState(null);
  const [quoteRebates, setQuoteRebates] = useState([]);
  const [quoteTradeIns, setQuoteTradeIns] = useState([]);
  const [showRevenueFeatures, setShowRevenueFeatures] = useState(false);
  const [smartSuggestions, setSmartSuggestions] = useState(null);
  const [showSuggestions, setShowSuggestions] = useState(true);
  const [availableFinancing, setAvailableFinancing] = useState([]);
  const [availableWarranties, setAvailableWarranties] = useState([]);
  const [availableRebates, setAvailableRebates] = useState([]);

  // ============================================
  // QUOTE PROTECTION STATE
  // ============================================
  const [hideModelNumbers, setHideModelNumbers] = useState(false);
  const [watermarkText, setWatermarkText] = useState('CONFIDENTIAL - FOR CUSTOMER USE ONLY');
  const [watermarkEnabled, setWatermarkEnabled] = useState(true);
  const [quoteExpiryDate, setQuoteExpiryDate] = useState('');
  const [emailTemplates, setEmailTemplates] = useState([]);
  const [selectedEmailTemplate, setSelectedEmailTemplate] = useState(null);

  // ============================================
  // FOLLOW-UP REMINDER STATE
  // ============================================
  const [pendingFollowUps, setPendingFollowUps] = useState([]);
  const [staleQuotes, setStaleQuotes] = useState([]);
  const [followUpStats, setFollowUpStats] = useState({
    overdue_count: 0,
    due_soon_count: 0,
    sent_this_week: 0,
    stale_quotes: 0
  });
  const [showInteractionModal, setShowInteractionModal] = useState(false);
  const [selectedFollowUpQuote, setSelectedFollowUpQuote] = useState(null);
  const [interactionType, setInteractionType] = useState('PHONE_CALL');
  const [interactionNotes, setInteractionNotes] = useState('');
  const [nextAction, setNextAction] = useState('');
  const [nextActionDate, setNextActionDate] = useState('');

  // ============================================
  // SERVICE ITEMS (Quick Add)
  // ============================================
  const SERVICE_ITEMS = [
    {
      name: 'Standard Delivery',
      description: 'Delivery within 5-7 business days',
      sku: 'SRV-DEL-STD',
      cost: 30.00,
      msrp: 150.00,
      sell: 99.00,
      is_service: true,
      manufacturer: 'Service',
      category: 'Service'
    },
    {
      name: 'Express Delivery',
      description: 'Next day delivery',
      sku: 'SRV-DEL-EXP',
      cost: 50.00,
      msrp: 200.00,
      sell: 149.00,
      is_service: true,
      manufacturer: 'Service',
      category: 'Service'
    },
    {
      name: 'Basic Installation',
      description: 'Standard product installation',
      sku: 'SRV-INS-BAS',
      cost: 50.00,
      msrp: 200.00,
      sell: 129.00,
      is_service: true,
      manufacturer: 'Service',
      category: 'Service'
    },
    {
      name: 'Premium Installation',
      description: 'Full setup and configuration',
      sku: 'SRV-INS-PRE',
      cost: 80.00,
      msrp: 300.00,
      sell: 199.00,
      is_service: true,
      manufacturer: 'Service',
      category: 'Service'
    },
    {
      name: 'Haul Away',
      description: 'Remove and dispose of old appliance',
      sku: 'SRV-HAL-AWY',
      cost: 20.00,
      msrp: 120.00,
      sell: 79.00,
      is_service: true,
      manufacturer: 'Service',
      category: 'Service'
    }
  ];

  // ============================================
  // ANTI-FLICKERING REFS
  // ============================================
  const isMounted = useRef(true);
  const loadedOnce = useRef(false);

  // ============================================
  // DATA FETCHING
  // ============================================
  useEffect(() => {
    console.log('[QuotationManager] Component mounted');
    isMounted.current = true;

    if (!loadedOnce.current) {
      console.log('[QuotationManager] First mount - fetching initial data');
      loadedOnce.current = true;
      fetchInitialData();
    } else {
      console.log('[QuotationManager] Already loaded once, skipping fetch');
    }

    return () => {
      console.log('[QuotationManager] Component unmounting');
      isMounted.current = false;
    };
  }, []);

  // Smart suggestions calculation - FIXED to prevent infinite loops
  // Uses primitive values and lengths in dependencies to avoid reference changes
  const quoteItemsLength = quoteItems.length;
  const quoteWarrantiesLength = quoteWarranties.length;
  const quoteRebatesLength = quoteRebates.length;
  const quoteTradeInsLength = quoteTradeIns.length;
  const hasFinancing = !!quoteFinancing;
  const hasDelivery = !!quoteDelivery;

  useEffect(() => {
    if (!loadedOnce.current || !isMounted.current) return;

    if (quoteItemsLength > 0 && view === 'builder') {
      const timer = setTimeout(() => {
        if (!isMounted.current) return;
        try {
          const suggestions = getSmartSuggestions({
            quoteTotal: quoteItems.reduce((sum, item) => sum + (item.sell * item.quantity), 0),
            products: quoteItems,
            availableFinancing,
            availableWarranties,
            availableRebates,
            currentFeatures: {
              financing: quoteFinancing,
              warranties: quoteWarranties,
              delivery: quoteDelivery,
              rebates: quoteRebates,
              tradeIns: quoteTradeIns
            }
          });
          setSmartSuggestions(suggestions);
        } catch (err) {
          console.warn('Error generating smart suggestions:', err);
          setSmartSuggestions(null);
        }
      }, 500); // Increased debounce to reduce recalculations
      return () => clearTimeout(timer);
    } else {
      setSmartSuggestions(null);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [quoteItemsLength, quoteWarrantiesLength, quoteRebatesLength, quoteTradeInsLength, hasFinancing, hasDelivery, view]);

  const fetchTemplates = async () => {
    try {
      const res = await fetch(`${API_URL}/api/quote-templates`);
      const data = await res.json();
      setTemplates(Array.isArray(data) ? data : []);
    } catch (err) {
      logger.error('Error fetching templates:', err);
      setTemplates([]);
    }
  };

  const fetchCustomerQuotes = async (customerId) => {
    try {
      const res = await fetch(`${API_URL}/api/quotes?customer_id=${customerId}&limit=5`);
      const data = await res.json();
      setCustomerQuotes(Array.isArray(data) ? data : []);
    } catch (err) {
      logger.error('Error fetching customer quotes:', err);
      setCustomerQuotes([]);
    }
  };

  const fetchFavoriteProducts = async () => {
    try {
      const res = await fetch(`${API_URL}/api/products/favorites`);
      const data = await res.json();
      setFavoriteProducts(Array.isArray(data) ? data : []);
    } catch (err) {
      logger.error('Error fetching favorite products:', err);
      setFavoriteProducts([]);
    }
  };

  const fetchRecentProducts = async () => {
    try {
      const res = await fetch(`${API_URL}/api/products/recent?limit=10`);
      const data = await res.json();
      setRecentProducts(Array.isArray(data) ? data : []);
    } catch (err) {
      logger.error('Error fetching recent products:', err);
      setRecentProducts([]);
    }
  };

  const toggleFavorite = async (productId) => {
    const isFavorite = favoriteProducts && favoriteProducts.some(p => p.id === productId);

    try {
      if (isFavorite) {
        await fetch(`${API_URL}/api/products/favorites/${productId}`, {
          method: 'DELETE'
        });
      } else {
        await fetch(`${API_URL}/api/products/favorites/${productId}`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({})
        });
      }
      fetchFavoriteProducts(); // Refresh favorites list
    } catch (err) {
      logger.error('Error toggling favorite:', err);
    }
  };

  const fetchPaymentTerms = async () => {
    try {
      const res = await fetch(`${API_URL}/api/payment-terms`);
      const data = await res.json();
      setPaymentTermsTemplates(Array.isArray(data) ? data : []);
    } catch (err) {
      logger.error('Error fetching payment terms:', err);
      setPaymentTermsTemplates([]);
    }
  };

  const fetchFinancingPlans = async () => {
    try {
      const res = await fetch(`${API_URL}/api/financing-plans`);
      const data = await res.json();
      setAvailableFinancing(Array.isArray(data) ? data : []);
    } catch (err) {
      logger.error('Error fetching financing plans:', err);
      setAvailableFinancing([]);
    }
  };

  const fetchWarrantyPlans = async () => {
    try {
      const res = await fetch(`${API_URL}/api/warranty-plans`);
      const data = await res.json();
      setAvailableWarranties(Array.isArray(data) ? data : []);
    } catch (err) {
      logger.error('Error fetching warranty plans:', err);
      setAvailableWarranties([]);
    }
  };

  const fetchRebates = async () => {
    try {
      const res = await fetch(`${API_URL}/api/rebates`);
      const data = await res.json();
      setAvailableRebates(Array.isArray(data) ? data : []);
    } catch (err) {
      logger.error('Error fetching rebates:', err);
      setAvailableRebates([]);
    }
  };

  const fetchEmailTemplates = async () => {
    try {
      const res = await fetch(`${API_URL}/api/email-templates`);
      const data = await res.json();
      setEmailTemplates(Array.isArray(data) ? data : []);
    } catch (err) {
      logger.error('Error fetching email templates:', err);
      setEmailTemplates([]);
    }
  };

  // ============================================
  // OPTIMIZED REFRESH FUNCTIONS
  // Only fetch what's needed instead of everything
  // ============================================

  const refreshQuotesOnly = async () => {
    if (!isMounted.current) return;
    try {
      const [quotesRes, statsRes] = await Promise.all([
        fetch(`${API_URL}/api/quotes`),
        fetch(`${API_URL}/api/quotes/stats/summary`)
      ]);
      const quotesData = await quotesRes.json();
      const statsData = await statsRes.json();

      if (!isMounted.current) return;
      const quotesArray = quotesData.quotations || quotesData;
      setQuotations(Array.isArray(quotesArray) ? quotesArray : []);
      setStats(statsData || {});
    } catch (err) {
      logger.error('Error refreshing quotes:', err);
    }
  };

  const refreshCustomersOnly = async () => {
    if (!isMounted.current) return;
    try {
      const res = await fetch(`${API_URL}/api/customers`);
      const data = await res.json();
      const customersArray = data.customers || data;
      setCustomers(Array.isArray(customersArray) ? customersArray : []);
    } catch (err) {
      logger.error('Error refreshing customers:', err);
    }
  };

  // ============================================
  // FOLLOW-UP FETCH FUNCTIONS
  // ============================================

  const fetchFollowUpData = async () => {
    try {
      // Fetch pending follow-ups
      const followUpsRes = await fetch(`${API_URL}/api/follow-ups/pending`);
      const followUpsData = await followUpsRes.json();
      setPendingFollowUps(Array.isArray(followUpsData) ? followUpsData : []);

      // Fetch stale quotes
      const staleRes = await fetch(`${API_URL}/api/follow-ups/stale-quotes?days=7`);
      const staleData = await staleRes.json();
      setStaleQuotes(Array.isArray(staleData) ? staleData : []);

      // Fetch stats
      const statsRes = await fetch(`${API_URL}/api/follow-ups/stats`);
      const statsData = await statsRes.json();
      setFollowUpStats(statsData);
    } catch (err) {
      logger.error('Error fetching follow-up data:', err);
      setPendingFollowUps([]);
      setStaleQuotes([]);
    }
  };

  const markFollowUpSent = async (followUpId) => {
    try {
      await fetch(`${API_URL}/api/follow-ups/${followUpId}/sent`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' }
      });
      fetchFollowUpData(); // Refresh data
      alert('Follow-up marked as sent!');
    } catch (err) {
      logger.error('Error marking follow-up as sent:', err);
      alert('Failed to mark follow-up as sent');
    }
  };

  const logInteraction = async () => {
    if (!selectedFollowUpQuote) return;

    try {
      await fetch(`${API_URL}/api/quotations/${selectedFollowUpQuote.id}/interactions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          interaction_type: interactionType,
          notes: interactionNotes,
          next_action: nextAction,
          next_action_date: nextActionDate || null,
          created_by: user ? `${user.firstName} ${user.lastName}` : 'Unknown User'
        })
      });

      // Reset form
      setShowInteractionModal(false);
      setInteractionNotes('');
      setNextAction('');
      setNextActionDate('');
      setSelectedFollowUpQuote(null);

      // Refresh data
      fetchFollowUpData();
      alert('Interaction logged successfully!');
    } catch (err) {
      logger.error('Error logging interaction:', err);
      alert('Failed to log interaction');
    }
  };

  const fetchInitialData = async () => {
    console.log('[QuotationManager] fetchInitialData called');
    if (!isMounted.current) {
      console.log('[QuotationManager] Component unmounted, aborting fetch');
      return;
    }

    try {
      // Set loading FIRST to prevent flickering
      console.log('[QuotationManager] Setting loading=true, starting data fetch');
      setLoading(true);

      // Fetch ALL data in parallel with CACHING - prevents rate limit issues
      const [
        templatesData, favoritesData, recentData, paymentTermsData,
        financingData, warrantyData, rebatesData, emailTemplatesData,
        quotesData, customersData, productsData, statsData
      ] = await Promise.all([
        cachedFetch('/api/quote-templates').catch(() => []),
        cachedFetch('/api/products/favorites').catch(() => []),
        cachedFetch('/api/products/recent?limit=10').catch(() => []),
        cachedFetch('/api/payment-terms').catch(() => []),
        cachedFetch('/api/financing-plans').catch(() => []),
        cachedFetch('/api/warranty-plans').catch(() => []),
        cachedFetch('/api/rebates').catch(() => []),
        cachedFetch('/api/email-templates').catch(() => []),
        cachedFetch('/api/quotes').catch(() => ({ quotations: [] })),
        cachedFetch('/api/customers').catch(() => []),
        cachedFetch('/api/products?limit=5000').catch(() => []),
        cachedFetch('/api/quotes/stats/summary').catch(() => ({}))
      ]);

      if (!isMounted.current) return;

      // Ensure productsData is an array before filtering
      const productsArray = Array.isArray(productsData) ? productsData : [];

      // Filter out products without model names and with valid data
      const validProducts = productsArray.filter(p =>
        p.model && p.model.trim() !== '' &&
        p.manufacturer && p.manufacturer.trim() !== ''
      );

      logger.log(`Loaded ${productsArray.length} total products, ${validProducts.length} valid products`);

      // Handle both old format (array) and new format (object with quotations property)
      const quotesArray = quotesData.quotations || quotesData;
      const customersArray = customersData.customers || customersData;

      // CRITICAL FIX: Use React.startTransition to batch ALL state updates together
      // This prevents 11 separate re-renders and stops the infinite loop
      React.startTransition(() => {
        setTemplates(Array.isArray(templatesData) ? templatesData : []);
        setFavoriteProducts(Array.isArray(favoritesData) ? favoritesData : []);
        setRecentProducts(Array.isArray(recentData) ? recentData : []);
        setPaymentTermsTemplates(Array.isArray(paymentTermsData) ? paymentTermsData : []);
        setAvailableFinancing(Array.isArray(financingData) ? financingData : []);
        setAvailableWarranties(Array.isArray(warrantyData) ? warrantyData : []);
        setAvailableRebates(Array.isArray(rebatesData) ? rebatesData : []);
        setEmailTemplates(Array.isArray(emailTemplatesData) ? emailTemplatesData : []);
        setQuotations(Array.isArray(quotesArray) ? quotesArray : []);
        setCustomers(Array.isArray(customersArray) ? customersArray : []);
        setProducts(validProducts);
        setStats(statsData || {});
      });
    } catch (err) {
      console.error('[QuotationManager] Error fetching data:', err);
      logger.error('Error fetching data:', err);
      if (isMounted.current) {
        alert('Error loading data. Please try again.');
      }
    } finally {
      if (isMounted.current) {
        console.log('[QuotationManager] Data fetch complete, setting loading=false');
        setLoading(false);
      }
    }
  };
  
  // ============================================
  // QUOTE BUILDER FUNCTIONS
  // ============================================
  const addProductToQuote = (product) => {
    const costCents = product.cost_cents || 0;
    const msrpCents = product.msrp_cents || 0;

    const newItem = {
      product_id: product.id,
      sku: product.sku || product.model,
      model: product.model,
      manufacturer: product.manufacturer,
      description: product.description || '',
      category: product.category || '',
      quantity: 1,
      cost: costCents / 100,
      msrp: msrpCents / 100,
      sell: msrpCents / 100, // Default to MSRP
      cost_cents: costCents,
      msrp_cents: msrpCents,
      sell_cents: msrpCents,
      margin_bp: 0,
      is_service: false
    };
    setQuoteItems([...quoteItems, newItem]);
    setProductSearchTerm('');
  };
  
  const addServiceItem = (service) => {
    const newItem = {
      product_id: null,
      sku: service.sku,
      model: service.name,
      manufacturer: service.manufacturer,
      description: service.description,
      category: service.category,
      quantity: 1,
      cost: service.cost,
      msrp: service.msrp,
      sell: service.sell,
      cost_cents: Math.round(service.cost * 100),
      msrp_cents: Math.round(service.msrp * 100),
      sell_cents: Math.round(service.sell * 100),
      margin_bp: 0,
      is_service: true
    };
    setQuoteItems([...quoteItems, newItem]);
  };
  
  const updateQuoteItem = (index, field, value) => {
    const updated = [...quoteItems];
    updated[index][field] = value;

    // Sync cents values when dollar values change
    if (field === 'sell') {
      updated[index].sell_cents = Math.round(value * 100);
    } else if (field === 'cost') {
      updated[index].cost_cents = Math.round(value * 100);
    } else if (field === 'msrp') {
      updated[index].msrp_cents = Math.round(value * 100);
    }

    setQuoteItems(updated);
  };
  
  const removeQuoteItem = (index) => {
    setQuoteItems(quoteItems.filter((_, i) => i !== index));
  };
  
  const calculateMargin = (sell, cost) => {
    if (sell === 0 || cost === 0) return 0;
    return ((sell - cost) / sell * 100);
  };

  // ============================================
  // HELPER FUNCTIONS (for extracted components)
  // ============================================
  const formatCurrency = (cents) => {
    return `$${((cents || 0) / 100).toFixed(2)}`;
  };

  const formatDate = (dateString) => {
    if (!dateString) return 'N/A';
    return new Date(dateString).toLocaleDateString();
  };

  const getStatusColor = (status) => {
    const colors = {
      'DRAFT': { bg: '#f3f4f6', text: '#374151' },
      'SENT': { bg: '#dbeafe', text: '#1d4ed8' },
      'VIEWED': { bg: '#fef3c7', text: '#b45309' },
      'PENDING_APPROVAL': { bg: '#e0e7ff', text: '#4338ca' },
      'APPROVED': { bg: '#d1fae5', text: '#059669' },
      'REJECTED': { bg: '#fee2e2', text: '#dc2626' },
      'WON': { bg: '#d1fae5', text: '#059669' },
      'LOST': { bg: '#fee2e2', text: '#dc2626' }
    };
    return colors[status] || { bg: '#f3f4f6', text: '#374151' };
  };

  const clearFilters = () => {
    setSearchTerm('');
    setStatusFilter('all');
    setDateFilter('all');
    setValueFilter('all');
    setExpiringFilter(false);
    setCustomerFilter('all');
    setProductFilter('');
  };

  // MEMOIZED CALCULATION - Prevents recalculation unless dependencies change
  const calculateQuoteTotals = useMemo(() => {
    // Base product totals
    const subtotal = quoteItems.reduce((sum, item) =>
      sum + (item.sell * item.quantity), 0);
    const discount = (subtotal * discountPercent) / 100;
    const afterDiscount = subtotal - discount;

    // Add revenue features to subtotal
    let revenueAddOns = 0;

    // Add delivery cost
    if (quoteDelivery && quoteDelivery.calculation) {
      revenueAddOns += (quoteDelivery.calculation.totalCents / 100);
    }

    // Add warranties cost
    if (quoteWarranties.length > 0) {
      revenueAddOns += quoteWarranties.reduce((sum, w) => sum + (w.cost / 100), 0);
    }

    // Subtract trade-ins
    let tradeInCredit = 0;
    if (quoteTradeIns.length > 0) {
      tradeInCredit = quoteTradeIns.reduce((sum, t) => sum + (t.estimatedValueCents / 100), 0);
    }

    // Subtract rebates
    let rebateCredit = 0;
    if (quoteRebates.length > 0) {
      rebateCredit = quoteRebates.reduce((sum, r) => {
        if (r.rebate_percent) {
          return sum + (afterDiscount * (r.rebate_percent / 100));
        }
        return sum + (r.rebate_amount_cents / 100);
      }, 0);
    }

    // Calculate final total with all add-ons and credits
    const afterAddOns = afterDiscount + revenueAddOns - tradeInCredit - rebateCredit;
    const tax = afterAddOns * 0.13; // 13% HST
    const total = afterAddOns + tax;

    // Calculate profit
    const totalCost = quoteItems.reduce((sum, item) =>
      sum + (item.cost * item.quantity), 0);
    const profit = afterAddOns - totalCost;
    const profitMargin = afterAddOns > 0 ? (profit / afterAddOns * 100) : 0;

    return {
      subtotal,
      discount,
      revenueAddOns,
      tradeInCredit,
      rebateCredit,
      afterAddOns,
      tax,
      total,
      profit,
      profitMargin,
      // Detailed breakdown for display
      deliveryCost: quoteDelivery ? (quoteDelivery.calculation.totalCents / 100) : 0,
      warrantiesCost: quoteWarranties.reduce((sum, w) => sum + (w.cost / 100), 0),
      financing: quoteFinancing
    };
  }, [quoteItems, discountPercent, quoteDelivery, quoteWarranties, quoteTradeIns, quoteRebates, quoteFinancing]);

  // MEMOIZED: Helper to check if quote is expiring soon
  const isExpiringSoon = useCallback((expiresAt) => {
    if (!expiresAt) return false;
    const expiryDate = new Date(expiresAt);
    const today = new Date();
    const daysUntilExpiry = Math.ceil((expiryDate - today) / (1000 * 60 * 60 * 24));
    return daysUntilExpiry <= 7 && daysUntilExpiry > 0;
  }, []);

  // MEMOIZED: Filtered and sorted quotations list - prevents recalculation on every render
  const { filteredQuotes, sortedQuotes, expiringSoonCount } = useMemo(() => {
    // Filter quotations
    const filtered = quotations.filter(q => {
      const matchesSearch =
        q.quote_number?.toLowerCase().includes(searchTerm.toLowerCase()) ||
        q.customer_name?.toLowerCase().includes(searchTerm.toLowerCase());

      const matchesStatus = statusFilter === 'all' || q.status === statusFilter;

      // Date filter
      let matchesDate = true;
      if (dateFilter !== 'all') {
        const quoteDate = new Date(q.created_at);
        const today = new Date();
        today.setHours(0, 0, 0, 0);

        if (dateFilter === 'today') {
          matchesDate = quoteDate >= today;
        } else if (dateFilter === 'week') {
          const weekAgo = new Date(today);
          weekAgo.setDate(weekAgo.getDate() - 7);
          matchesDate = quoteDate >= weekAgo;
        } else if (dateFilter === 'month') {
          const monthAgo = new Date(today);
          monthAgo.setMonth(monthAgo.getMonth() - 1);
          matchesDate = quoteDate >= monthAgo;
        }
      }

      // Value filter
      let matchesValue = true;
      if (valueFilter !== 'all') {
        const totalDollars = (q.total_cents || 0) / 100;
        if (valueFilter === '0-1000') {
          matchesValue = totalDollars <= 1000;
        } else if (valueFilter === '1000-5000') {
          matchesValue = totalDollars > 1000 && totalDollars <= 5000;
        } else if (valueFilter === '5000-10000') {
          matchesValue = totalDollars > 5000 && totalDollars <= 10000;
        } else if (valueFilter === '10000+') {
          matchesValue = totalDollars > 10000;
        }
      }

      // Expiring filter
      let matchesExpiring = true;
      if (expiringFilter) {
        matchesExpiring = isExpiringSoon(q.expires_at) && q.status !== 'WON' && q.status !== 'LOST';
      }

      // Advanced Filters
      const matchesCustomer = customerFilter === 'all' || q.customer_id === parseInt(customerFilter);

      let matchesProduct = true;
      if (productFilter.trim()) {
        const productLower = productFilter.toLowerCase();
        matchesProduct =
          q.notes?.toLowerCase().includes(productLower) ||
          q.internal_notes?.toLowerCase().includes(productLower) ||
          q.customer_name?.toLowerCase().includes(productLower);
      }

      const matchesCreatedBy = createdByFilter === 'all' || q.created_by === createdByFilter;

      return matchesSearch && matchesStatus && matchesDate && matchesValue && matchesExpiring &&
             matchesCustomer && matchesProduct && matchesCreatedBy;
    });

    // Sort quotes
    const sorted = [...filtered].sort((a, b) => {
      let comparison = 0;
      if (sortBy === 'date') {
        comparison = new Date(b.created_at) - new Date(a.created_at);
      } else if (sortBy === 'value') {
        comparison = (b.total_cents || 0) - (a.total_cents || 0);
      } else if (sortBy === 'customer') {
        comparison = (a.customer_name || '').localeCompare(b.customer_name || '');
      } else if (sortBy === 'status') {
        comparison = (a.status || '').localeCompare(b.status || '');
      }
      return sortOrder === 'asc' ? -comparison : comparison;
    });

    // Count expiring soon quotes
    const expiringCount = quotations.filter(q =>
      isExpiringSoon(q.expires_at) && q.status !== 'WON' && q.status !== 'LOST'
    ).length;

    return { filteredQuotes: filtered, sortedQuotes: sorted, expiringSoonCount: expiringCount };
  }, [quotations, searchTerm, statusFilter, dateFilter, valueFilter, expiringFilter,
      customerFilter, productFilter, createdByFilter, sortBy, sortOrder, isExpiringSoon]);

  // MEMOIZED: Filtered products for search in builder view
  const filteredProducts = useMemo(() => {
    return products.filter(p =>
      p.sku?.toLowerCase().includes(productSearchTerm.toLowerCase()) ||
      p.model?.toLowerCase().includes(productSearchTerm.toLowerCase()) ||
      p.manufacturer?.toLowerCase().includes(productSearchTerm.toLowerCase())
    );
  }, [products, productSearchTerm]);

  // MEMOIZED: Filtered customers for dropdown
  const filteredCustomers = useMemo(() => {
    if (!customerSearchTerm.trim()) return customers.slice(0, 10);
    const searchLower = customerSearchTerm.toLowerCase();
    return customers.filter(c =>
      c.name?.toLowerCase().includes(searchLower) ||
      c.company?.toLowerCase().includes(searchLower) ||
      c.email?.toLowerCase().includes(searchLower)
    ).slice(0, 10);
  }, [customers, customerSearchTerm]);

  const saveQuote = async () => {
    if (!selectedCustomer) {
      toast.warning('Please select a customer before saving', 'Missing Customer');
      return;
    }

    if (quoteItems.length === 0) {
      toast.warning('Please add at least one item to the quote', 'No Items');
      return;
    }

    try {
      // Note: Totals are calculated in the backend from the items

      const quoteData = {
        customer_id: selectedCustomer.id,
        items: quoteItems,
        notes,
        internal_notes: internalNotes,
        terms,
        discount_percent: discountPercent,
        created_by: 'User', // You can add user authentication later
        // Quote protection settings
        hide_model_numbers: hideModelNumbers,
        watermark_text: watermarkText,
        watermark_enabled: watermarkEnabled,
        quote_expiry_date: quoteExpiryDate || new Date(Date.now() + 14*24*60*60*1000).toISOString().split('T')[0],
        // Revenue features
        revenue_features: {
          financing: quoteFinancing,
          warranties: quoteWarranties,
          delivery: quoteDelivery,
          rebates: quoteRebates,
          tradeIns: quoteTradeIns
        }
      };

      let res;
      if (editingQuoteId) {
        // Update existing quote
        res = await fetch(`${API_URL}/api/quotations/${editingQuoteId}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(quoteData)
        });
      } else {
        // Create new quote
        res = await fetch(`${API_URL}/api/quotes`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(quoteData)
        });
      }

      if (!res.ok) throw new Error(editingQuoteId ? 'Failed to update quote' : 'Failed to create quote');

      const result = await res.json();
      const quoteNumber = result.quote?.quote_number || result.quote_number;

      toast.success(
        editingQuoteId
          ? 'Your quote has been updated successfully'
          : `Quote ${quoteNumber} has been created`,
        editingQuoteId ? 'Quote Updated' : 'Quote Created'
      );

      // Reset builder and return to list
      resetBuilder();
      setView('list');
      refreshQuotesOnly(); // Only refresh quotes, not everything
    } catch (err) {
      logger.error('Error saving quote:', err);
      toast.error(
        `Failed to ${editingQuoteId ? 'update' : 'create'} quote. Please try again.`,
        'Save Error'
      );
    }
  };

  // Save quote and immediately open email dialog
  const saveAndSend = async () => {
    if (!selectedCustomer) {
      toast.warning('Please select a customer before saving', 'Missing Customer');
      return;
    }

    if (quoteItems.length === 0) {
      toast.warning('Please add at least one item to the quote', 'No Items');
      return;
    }

    try {
      const quoteData = {
        customer_id: selectedCustomer.id,
        items: quoteItems,
        notes,
        internal_notes: internalNotes,
        terms,
        discount_percent: discountPercent,
        created_by: 'User',
        hide_model_numbers: hideModelNumbers,
        watermark_text: watermarkText,
        watermark_enabled: watermarkEnabled,
        quote_expiry_date: quoteExpiryDate || new Date(Date.now() + 14*24*60*60*1000).toISOString().split('T')[0],
        revenue_features: {
          financing: quoteFinancing,
          warranties: quoteWarranties,
          delivery: quoteDelivery,
          rebates: quoteRebates,
          tradeIns: quoteTradeIns
        }
      };

      let res;
      if (editingQuoteId) {
        res = await fetch(`${API_URL}/api/quotations/${editingQuoteId}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(quoteData)
        });
      } else {
        res = await fetch(`${API_URL}/api/quotes`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(quoteData)
        });
      }

      if (!res.ok) throw new Error(editingQuoteId ? 'Failed to update quote' : 'Failed to create quote');

      const result = await res.json();
      const savedQuote = result.quote || result;
      const quoteNumber = savedQuote.quote_number;

      toast.success(
        `Quote ${quoteNumber} saved. Opening email...`,
        'Quote Saved'
      );

      // Set the selected quote and open email dialog
      setSelectedQuote({
        ...savedQuote,
        customer_name: selectedCustomer.name,
        customer_email: selectedCustomer.email
      });

      // Prepare email dialog
      setEmailTo(selectedCustomer.email || '');
      setEmailSubject(`Quote ${quoteNumber}`);
      setEmailMessage(`Dear ${selectedCustomer.name},\n\nPlease find attached our quotation for your review.\n\nThank you for your business!`);
      setShowEmailDialog(true);

      // Reset builder and refresh quotes
      resetBuilder();
      refreshQuotesOnly();

    } catch (err) {
      logger.error('Error saving quote:', err);
      toast.error(
        `Failed to save quote. Please try again.`,
        'Save Error'
      );
    }
  };

  const resetBuilder = () => {
    setSelectedCustomer(null);
    setQuoteItems([]);
    setDiscountPercent(0);
    setNotes('');
    setInternalNotes('');
    setTerms('Payment due within 30 days. All prices in CAD.');
    setProductSearchTerm('');
    setCustomerSearchTerm('');
    setShowCustomerDropdown(false);
    setEditingQuoteId(null);

    // Reset quote protection settings
    setHideModelNumbers(false);
    setWatermarkText('CONFIDENTIAL - FOR CUSTOMER USE ONLY');
    setWatermarkEnabled(true);
    setQuoteExpiryDate('');
    setSelectedEmailTemplate(null);
  };

  // ============================================
  // FILTER OPERATIONS
  // ============================================

  const clearAllFilters = () => {
    setSearchTerm('');
    setStatusFilter('all');
    setDateFilter('all');
    setValueFilter('all');
    setExpiringFilter(false);
    setCustomerFilter('all');
    setProductFilter('');
    setCreatedByFilter('all');
  };

  const getActiveFilterCount = () => {
    let count = 0;
    if (searchTerm) count++;
    if (statusFilter !== 'all') count++;
    if (dateFilter !== 'all') count++;
    if (valueFilter !== 'all') count++;
    if (expiringFilter) count++;
    if (customerFilter !== 'all') count++;
    if (productFilter.trim()) count++;
    if (createdByFilter !== 'all') count++;
    return count;
  };

  // ============================================
  // TEMPLATE OPERATIONS
  // ============================================

  const saveAsTemplate = async () => {
    if (!templateName.trim()) {
      alert('Please enter a template name');
      return;
    }

    if (quoteItems.length === 0) {
      alert('Cannot save empty template. Please add items first.');
      return;
    }

    try {
      const res = await fetch(`${API_URL}/api/quote-templates`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: templateName,
          description: templateDescription,
          items: quoteItems,
          discount_percent: discountPercent,
          notes,
          terms
        })
      });

      if (!res.ok) throw new Error('Failed to save template');

      alert(`Template "${templateName}" saved successfully!`);
      setTemplateName('');
      setTemplateDescription('');
      setShowTemplateSaveDialog(false);
      fetchTemplates(); // Refresh templates list
    } catch (err) {
      logger.error('Error saving template:', err);
      alert('Error saving template. Please try again.');
    }
  };

  const loadTemplate = (template) => {
    if (quoteItems.length > 0) {
      if (!window.confirm('This will replace current items. Continue?')) {
        return;
      }
    }

    // Parse items if they're stored as JSON string
    const items = typeof template.items === 'string'
      ? JSON.parse(template.items)
      : template.items;

    setQuoteItems(items);
    setDiscountPercent(template.discount_percent || 0);
    setNotes(template.notes || '');
    setTerms(template.terms || 'Payment due within 30 days. All prices in CAD.');

    alert(`Template "${template.name}" loaded!`);
  };

  const deleteTemplate = async (templateId, templateName) => {
    if (!window.confirm(`Delete template "${templateName}"?`)) {
      return;
    }

    try {
      const res = await fetch(`${API_URL}/api/quote-templates/${templateId}`, {
        method: 'DELETE'
      });

      if (!res.ok) throw new Error('Failed to delete template');

      alert(`Template "${templateName}" deleted successfully!`);
      fetchTemplates(); // Refresh templates list
    } catch (err) {
      logger.error('Error deleting template:', err);
      alert('Error deleting template. Please try again.');
    }
  };

  // ============================================
  // EMAIL QUOTE
  // ============================================
  const openEmailDialog = (quote) => {
    setEmailTo(quote.customer_email || '');
    setEmailSubject(`Quote ${quote.quote_number}`);
    setEmailMessage(`Dear ${quote.customer_name},\n\nPlease find attached our quotation for your review.\n\nThank you for your business!`);
    setShowEmailDialog(true);
  };

  const sendQuoteEmail = async () => {
    if (!emailTo || !selectedQuote) {
      alert('Please enter recipient email');
      return;
    }

    try {
      const res = await fetch(`${API_URL}/api/quotations/${selectedQuote.id}/send-email`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          to_email: emailTo,
          subject: emailSubject,
          message: emailMessage
        })
      });

      if (!res.ok) {
        const error = await res.json();
        throw new Error(error.error || 'Failed to send email');
      }

      alert(`Email sent successfully to ${emailTo}!`);
      setShowEmailDialog(false);
      setEmailTo('');
      setEmailSubject('');
      setEmailMessage('');

      // Refresh quote to update status if it changed
      viewQuote(selectedQuote.id);
      // No need to refresh all data - email doesn't change quotes list
    } catch (err) {
      logger.error('Error sending email:', err);
      alert(`Error sending email: ${err.message}`);
    }
  };

  // ============================================
  // EXCEL EXPORT
  // ============================================
  const exportToExcel = async (quotesToExport) => {
    try {
      // Create CSV content (Excel can open CSV files)
      let csv = 'Quote Number,Customer,Date,Status,Subtotal,Discount,Tax,Total,Profit\n';

      for (const quote of quotesToExport) {
        const row = [
          quote.quote_number,
          `"${quote.customer_name || ''}"`,
          new Date(quote.created_at).toLocaleDateString(),
          quote.status,
          ((quote.subtotal_cents || 0) / 100).toFixed(2),
          ((quote.discount_cents || 0) / 100).toFixed(2),
          ((quote.tax_cents || 0) / 100).toFixed(2),
          ((quote.total_cents || 0) / 100).toFixed(2),
          ((quote.gross_profit_cents || 0) / 100).toFixed(2)
        ].join(',');
        csv += row + '\n';
      }

      // Create download
      const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
      const link = document.createElement('a');
      const url = URL.createObjectURL(blob);
      link.setAttribute('href', url);
      link.setAttribute('download', `quotes-export-${new Date().toISOString().split('T')[0]}.csv`);
      link.style.visibility = 'hidden';
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);

      alert(`Exported ${quotesToExport.length} quotes to Excel!`);
    } catch (err) {
      logger.error('Error exporting to Excel:', err);
      alert('Error exporting quotes. Please try again.');
    }
  };

  // ============================================
  // QUOTE OPERATIONS
  // ============================================
  const viewQuote = async (quoteId) => {
    try {
      const res = await fetch(`${API_URL}/api/quotes/${quoteId}`);
      const data = await res.json();
      setSelectedQuote(data);

      // Fetch events
      const eventsRes = await fetch(`${API_URL}/api/quotes/${quoteId}/events`);
      const eventsData = await eventsRes.json();
      setQuoteEvents(Array.isArray(eventsData) ? eventsData : []);

      // Fetch approvals
      fetchQuoteApprovals(quoteId);

      setView('viewer');
    } catch (err) {
      logger.error('Error fetching quote:', err);
      alert('Error loading quote details');
    }
  };

  const addQuoteEvent = async () => {
    if (!newEventDescription.trim() || !selectedQuote) return;

    try {
      const res = await fetch(`${API_URL}/api/quotations/${selectedQuote.id}/events`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          event_type: 'NOTE',
          description: newEventDescription
        })
      });

      if (!res.ok) throw new Error('Failed to add event');

      // Refresh events
      const eventsRes = await fetch(`${API_URL}/api/quotes/${selectedQuote.id}/events`);
      const eventsData = await eventsRes.json();
      setQuoteEvents(Array.isArray(eventsData) ? eventsData : []);

      setShowAddEventDialog(false);
      setNewEventDescription('');
    } catch (err) {
      logger.error('Error adding event:', err);
      alert('Error adding event. Please try again.');
    }
  };

  // Approval workflow functions
  const fetchQuoteApprovals = async (quoteId) => {
    try {
      const res = await fetch(`${API_URL}/api/quotations/${quoteId}/approvals`);
      const data = await res.json();
      // Ensure data is an array before setting it
      setQuoteApprovals(Array.isArray(data) ? data : []);
    } catch (err) {
      logger.error('Error fetching approvals:', err);
      setQuoteApprovals([]);
    }
  };

  const openApprovalDialog = () => {
    setApprovalRequestedBy('');
    setApprovalRequestedByEmail('');
    setApproverName('');
    setApproverEmail('');
    setApprovalComments('');
    setShowApprovalDialog(true);
  };

  const requestApproval = async () => {
    if (!approvalRequestedBy.trim() || !approvalRequestedByEmail.trim() ||
        !approverName.trim() || !approverEmail.trim()) {
      alert('Please fill in all required fields');
      return;
    }

    if (!selectedQuote) return;

    try {
      const res = await fetch(`${API_URL}/api/quotations/${selectedQuote.id}/request-approval`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          requested_by: approvalRequestedBy,
          requested_by_email: approvalRequestedByEmail,
          approver_name: approverName,
          approver_email: approverEmail,
          comments: approvalComments
        })
      });

      if (!res.ok) {
        const errorData = await res.json();
        throw new Error(errorData.error || 'Failed to request approval');
      }

      alert(`Approval request sent to ${approverName} (${approverEmail})`);
      setShowApprovalDialog(false);

      // Refresh quote and approvals
      viewQuote(selectedQuote.id);
    } catch (err) {
      logger.error('Error requesting approval:', err);
      alert(`Error: ${err.message}`);
    }
  };

  const fetchPendingApprovals = async (approverEmail = null) => {
    try {
      const url = approverEmail
        ? `${API_URL}/api/approvals/pending?approver_email=${encodeURIComponent(approverEmail)}`
        : `${API_URL}/api/approvals/pending`;
      const res = await fetch(url);
      const data = await res.json();
      setPendingApprovals(Array.isArray(data) ? data : []);
    } catch (err) {
      logger.error('Error fetching pending approvals:', err);
      setPendingApprovals([]);
    }
  };

  const openApprovalActionDialog = (approval, action) => {
    setSelectedApproval(approval);
    setApprovalAction(action);
    setApprovalActionComments('');
    setShowApprovalActionDialog(true);
  };

  const performApprovalAction = async () => {
    if (!selectedApproval) return;

    if (approvalAction === 'reject' && !approvalActionComments.trim()) {
      alert('Please provide a reason for rejection');
      return;
    }

    try {
      const endpoint = approvalAction === 'approve' ? 'approve' : 'reject';
      const res = await fetch(`${API_URL}/api/approvals/${selectedApproval.id}/${endpoint}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ comments: approvalActionComments })
      });

      if (!res.ok) throw new Error(`Failed to ${approvalAction} quote`);

      const actionText = approvalAction === 'approve' ? 'approved' : 'rejected';
      alert(`Quote ${actionText} successfully!`);
      setShowApprovalActionDialog(false);

      // Refresh pending approvals and quotations list
      fetchPendingApprovals();
      refreshQuotesOnly(); // Only refresh quotes

      // If we're viewing this quote, refresh it
      if (selectedQuote && selectedQuote.id === selectedApproval.quotation_id) {
        viewQuote(selectedQuote.id);
      }
    } catch (err) {
      logger.error(`Error ${approvalAction}ing quote:`, err);
      alert(`Error: ${err.message}`);
    }
  };

  const editQuote = async (quoteId) => {
    try {
      const res = await fetch(`${API_URL}/api/quotes/${quoteId}`);
      const data = await res.json();

      // Find the customer in the customers list
      const customer = customers.find(c => c.id === data.customer_id);

      // Populate builder with quote data
      setSelectedCustomer(customer);
      setDiscountPercent(data.discount_percent || 0);
      setNotes(data.notes || '');
      setInternalNotes(data.internal_notes || '');
      setTerms(data.terms || 'Payment due within 30 days. All prices in CAD.');
      setEditingQuoteId(quoteId);

      // Load quote protection settings
      setHideModelNumbers(data.hide_model_numbers || false);
      setWatermarkText(data.watermark_text || 'CONFIDENTIAL - FOR CUSTOMER USE ONLY');
      setWatermarkEnabled(data.watermark_enabled !== false);
      setQuoteExpiryDate(data.quote_expiry_date || '');

      // Transform items back to builder format
      const items = data.items.map(item => ({
        product_id: item.product_id,
        manufacturer: item.manufacturer || '',
        model: item.model || item.description,
        description: item.description,
        category: item.category || '',
        sku: item.sku || '',
        quantity: item.quantity,
        cost: (item.cost_cents || 0) / 100,
        msrp: (item.msrp_cents || 0) / 100,
        sell: (item.sell_cents || 0) / 100,
        notes: item.item_notes || ''
      }));

      setQuoteItems(items);
      setView('builder');
    } catch (err) {
      logger.error('Error loading quote for editing:', err);
      alert('Error loading quote for editing');
    }
  };

  const duplicateQuote = async (quoteId) => {
    try {
      const res = await fetch(`${API_URL}/api/quotes/${quoteId}`);
      const data = await res.json();

      // Find the customer in the customers list
      const customer = customers.find(c => c.id === data.customer_id);

      // Populate builder with quote data (but DON'T set editingQuoteId - this creates a new quote)
      setSelectedCustomer(customer);
      setDiscountPercent(data.discount_percent || 0);
      setNotes(data.notes || '');
      setInternalNotes(data.internal_notes || '');
      setTerms(data.terms || 'Payment due within 30 days. All prices in CAD.');
      setEditingQuoteId(null); // Important: null = create new quote

      // Transform items back to builder format
      const items = data.items.map(item => ({
        product_id: item.product_id,
        manufacturer: item.manufacturer || '',
        model: item.model || item.description,
        description: item.description,
        category: item.category || '',
        sku: item.sku || '',
        quantity: item.quantity,
        cost: (item.cost_cents || 0) / 100,
        msrp: (item.msrp_cents || 0) / 100,
        sell: (item.sell_cents || 0) / 100,
        notes: item.item_notes || ''
      }));

      setQuoteItems(items);
      setView('builder');

      alert('Quote duplicated! Click "Save Quote" to create a new quote with this data.');
    } catch (err) {
      logger.error('Error duplicating quote:', err);
      alert('Error duplicating quote');
    }
  };

  const createNewQuote = () => {
    setView('builder');
    setSelectedCustomer(null);
    setQuoteItems([]);
    setDiscountPercent(0);
    setNotes('');
    setInternalNotes('');
    setTerms('Payment due within 30 days. All prices in CAD.');
    setEditingQuoteId(null);
    // Reset revenue features
    setQuoteFinancing(null);
    setQuoteWarranties([]);
    setQuoteDelivery(null);
    setQuoteRebates([]);
    setQuoteTradeIns([]);
    setShowRevenueFeatures(false);
  };

  const updateQuoteStatus = async (quoteId, newStatus) => {
    try {
      const res = await fetch(`${API_URL}/api/quotes/${quoteId}/status`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          status: newStatus,
          user_name: 'User' // Add authentication later
        })
      });
      
      if (!res.ok) throw new Error('Failed to update status');
      
      // Refresh quote details
      const updatedRes = await fetch(`${API_URL}/api/quotes/${quoteId}`);
      const updatedData = await updatedRes.json();
      setSelectedQuote(updatedData);
      
      // Refresh events
      const eventsRes = await fetch(`${API_URL}/api/quotes/${quoteId}/events`);
      const eventsData = await eventsRes.json();
      setQuoteEvents(Array.isArray(eventsData) ? eventsData : []);

      // Refresh list
      refreshQuotesOnly(); // Only refresh quotes

      alert(`Quote status updated to ${newStatus}`);
    } catch (err) {
      logger.error('Error updating status:', err);
      alert('Error updating quote status');
    }
  };
  
  const deleteQuote = async (quoteId) => {
    if (!window.confirm('Are you sure you want to delete this quote? This cannot be undone.')) {
      return;
    }
    
    try {
      const res = await fetch(`${API_URL}/api/quotes/${quoteId}`, {
        method: 'DELETE'
      });
      
      if (!res.ok) throw new Error('Failed to delete quote');

      alert('Quote deleted successfully');
      setView('list');
      refreshQuotesOnly(); // Only refresh quotes
    } catch (err) {
      logger.error('Error deleting quote:', err);
      alert('Error deleting quote');
    }
  };
  
  // ============================================
  // ANALYTICS
  // ============================================
  const calculateAnalytics = () => {
    // Win rate by customer
    const customerStats = {};
    quotations.forEach(q => {
      if (!customerStats[q.customer_name]) {
        customerStats[q.customer_name] = { total: 0, won: 0, revenue: 0 };
      }
      customerStats[q.customer_name].total++;
      if (q.status === 'WON') {
        customerStats[q.customer_name].won++;
        customerStats[q.customer_name].revenue += (q.total_cents || 0) / 100;
      }
    });

    const topCustomers = Object.entries(customerStats)
      .map(([name, data]) => ({
        name,
        ...data,
        winRate: data.total > 0 ? Math.round((data.won / data.total) * 100) : 0
      }))
      .sort((a, b) => b.revenue - a.revenue)
      .slice(0, 10);

    // Product popularity
    const productStats = {};
    quotations.forEach(q => {
      if (q.items) {
        q.items.forEach(item => {
          const key = item.description || 'Unknown';
          if (!productStats[key]) {
            productStats[key] = { count: 0, revenue: 0 };
          }
          productStats[key].count += item.quantity || 0;
          productStats[key].revenue += (item.line_total_cents || 0) / 100;
        });
      }
    });

    const topProducts = Object.entries(productStats)
      .map(([name, data]) => ({ name, ...data }))
      .sort((a, b) => b.revenue - a.revenue)
      .slice(0, 10);

    // Monthly trends (last 6 months)
    const monthlyData = {};
    const now = new Date();
    for (let i = 5; i >= 0; i--) {
      const date = new Date(now.getFullYear(), now.getMonth() - i, 1);
      const key = date.toLocaleDateString('en-US', { year: 'numeric', month: 'short' });
      monthlyData[key] = { quotes: 0, revenue: 0, won: 0 };
    }

    quotations.forEach(q => {
      const date = new Date(q.created_at);
      const key = date.toLocaleDateString('en-US', { year: 'numeric', month: 'short' });
      if (monthlyData[key]) {
        monthlyData[key].quotes++;
        if (q.status === 'WON') {
          monthlyData[key].won++;
          monthlyData[key].revenue += (q.total_cents || 0) / 100;
        }
      }
    });

    // Average days to close
    const closedQuotes = quotations.filter(q => q.status === 'WON' || q.status === 'LOST');
    const avgDaysToClose = closedQuotes.length > 0
      ? Math.round(closedQuotes.reduce((sum, q) => {
          const created = new Date(q.created_at);
          const updated = new Date(q.updated_at || q.created_at);
          const days = Math.ceil((updated - created) / (1000 * 60 * 60 * 24));
          return sum + days;
        }, 0) / closedQuotes.length)
      : 0;

    return {
      topCustomers,
      topProducts,
      monthlyData: Object.entries(monthlyData).map(([month, data]) => ({ month, ...data })),
      avgDaysToClose
    };
  };

  // ============================================
  // RENDER FUNCTIONS
  // ============================================
  const renderAnalyticsView = () => {
    const analytics = calculateAnalytics();

    return (
      <div style={{ padding: '24px' }}>
        {/* Header */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '24px' }}>
          <h1 style={{ fontSize: '32px', fontWeight: 'bold', margin: 0 }}>
            📊 Analytics Dashboard
          </h1>
          <button
            onClick={() => setView('list')}
            style={{
              padding: '12px 24px',
              background: '#6b7280',
              color: 'white',
              border: 'none',
              borderRadius: '8px',
              fontSize: '16px',
              fontWeight: 'bold',
              cursor: 'pointer'
            }}
          >
            ← Back to List
          </button>
        </div>

        {/* Key Metrics */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '16px', marginBottom: '24px' }}>
          <div style={{ background: 'white', padding: '20px', borderRadius: '12px', boxShadow: '0 1px 3px rgba(0,0,0,0.1)' }}>
            <div style={{ fontSize: '14px', color: '#6b7280', marginBottom: '8px' }}>Total Quotes</div>
            <div style={{ fontSize: '32px', fontWeight: 'bold', color: '#3b82f6' }}>{quotations.length}</div>
          </div>
          <div style={{ background: 'white', padding: '20px', borderRadius: '12px', boxShadow: '0 1px 3px rgba(0,0,0,0.1)' }}>
            <div style={{ fontSize: '14px', color: '#6b7280', marginBottom: '8px' }}>Win Rate</div>
            <div style={{ fontSize: '32px', fontWeight: 'bold', color: '#10b981' }}>{stats.won_rate || 0}%</div>
          </div>
          <div style={{ background: 'white', padding: '20px', borderRadius: '12px', boxShadow: '0 1px 3px rgba(0,0,0,0.1)' }}>
            <div style={{ fontSize: '14px', color: '#6b7280', marginBottom: '8px' }}>Avg Days to Close</div>
            <div style={{ fontSize: '32px', fontWeight: 'bold', color: '#f59e0b' }}>{analytics.avgDaysToClose}</div>
          </div>
          <div style={{ background: 'white', padding: '20px', borderRadius: '12px', boxShadow: '0 1px 3px rgba(0,0,0,0.1)' }}>
            <div style={{ fontSize: '14px', color: '#6b7280', marginBottom: '8px' }}>Total Revenue</div>
            <div style={{ fontSize: '32px', fontWeight: 'bold', color: '#8b5cf6' }}>
              ${((stats.won_value_cents || 0) / 100).toLocaleString(undefined, { maximumFractionDigits: 0 })}
            </div>
          </div>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '24px', marginBottom: '24px' }}>
          {/* Top Customers */}
          <div style={{ background: 'white', padding: '24px', borderRadius: '12px', boxShadow: '0 1px 3px rgba(0,0,0,0.1)' }}>
            <h3 style={{ fontSize: '18px', fontWeight: 'bold', marginBottom: '16px' }}>🏆 Top Customers by Revenue</h3>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
              {analytics.topCustomers.slice(0, 5).map((customer, idx) => (
                <div key={idx} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '12px', background: '#f9fafb', borderRadius: '8px' }}>
                  <div>
                    <div style={{ fontWeight: 'bold' }}>{customer.name}</div>
                    <div style={{ fontSize: '12px', color: '#6b7280' }}>
                      {customer.won}/{customer.total} quotes • {customer.winRate}% win rate
                    </div>
                  </div>
                  <div style={{ fontWeight: 'bold', color: '#10b981' }}>
                    ${customer.revenue.toLocaleString(undefined, { maximumFractionDigits: 0 })}
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Top Products */}
          <div style={{ background: 'white', padding: '24px', borderRadius: '12px', boxShadow: '0 1px 3px rgba(0,0,0,0.1)' }}>
            <h3 style={{ fontSize: '18px', fontWeight: 'bold', marginBottom: '16px' }}>📦 Top Products by Revenue</h3>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
              {analytics.topProducts.slice(0, 5).map((product, idx) => (
                <div key={idx} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '12px', background: '#f9fafb', borderRadius: '8px' }}>
                  <div>
                    <div style={{ fontWeight: 'bold', fontSize: '14px' }}>{product.name.substring(0, 40)}{product.name.length > 40 ? '...' : ''}</div>
                    <div style={{ fontSize: '12px', color: '#6b7280' }}>{product.count} units sold</div>
                  </div>
                  <div style={{ fontWeight: 'bold', color: '#8b5cf6' }}>
                    ${product.revenue.toLocaleString(undefined, { maximumFractionDigits: 0 })}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Monthly Trends */}
        <div style={{ background: 'white', padding: '24px', borderRadius: '12px', boxShadow: '0 1px 3px rgba(0,0,0,0.1)' }}>
          <h3 style={{ fontSize: '18px', fontWeight: 'bold', marginBottom: '16px' }}>📈 Monthly Trends (Last 6 Months)</h3>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(6, 1fr)', gap: '16px' }}>
            {analytics.monthlyData.map((month, idx) => (
              <div key={idx} style={{ textAlign: 'center' }}>
                <div style={{ fontSize: '12px', fontWeight: 'bold', color: '#6b7280', marginBottom: '8px' }}>
                  {month.month}
                </div>
                <div style={{
                  height: `${Math.max(month.quotes * 10, 20)}px`,
                  background: '#3b82f6',
                  borderRadius: '4px 4px 0 0',
                  marginBottom: '8px'
                }} />
                <div style={{ fontSize: '20px', fontWeight: 'bold', color: '#3b82f6' }}>
                  {month.quotes}
                </div>
                <div style={{ fontSize: '11px', color: '#6b7280' }}>quotes</div>
                <div style={{ fontSize: '14px', fontWeight: 'bold', color: '#10b981', marginTop: '8px' }}>
                  ${month.revenue.toLocaleString(undefined, { maximumFractionDigits: 0 })}
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    );
  };

  const renderApprovalsView = () => {
    return (
      <div style={{ padding: '24px' }}>
        <div style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          marginBottom: '24px'
        }}>
          <h1 style={{ fontSize: '32px', fontWeight: 'bold', margin: 0 }}>
            ✅ Pending Approvals
          </h1>

          <button
            onClick={() => setView('list')}
            style={{
              padding: '12px 24px',
              background: '#6b7280',
              color: 'white',
              border: 'none',
              borderRadius: '8px',
              fontSize: '16px',
              fontWeight: 'bold',
              cursor: 'pointer'
            }}
          >
            ← Back to List
          </button>
        </div>

        {pendingApprovals.length === 0 ? (
          <div style={{
            background: 'white',
            padding: '64px',
            borderRadius: '12px',
            boxShadow: '0 1px 3px rgba(0,0,0,0.1)',
            textAlign: 'center',
            color: '#6b7280'
          }}>
            <div style={{ fontSize: '48px', marginBottom: '16px' }}>✅</div>
            <h3 style={{ fontSize: '20px', fontWeight: 'bold', marginBottom: '8px', color: '#374151' }}>
              No Pending Approvals
            </h3>
            <p>All approval requests have been processed.</p>
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
            {pendingApprovals.map((approval) => (
              <div
                key={approval.id}
                style={{
                  background: 'white',
                  padding: '24px',
                  borderRadius: '12px',
                  boxShadow: '0 1px 3px rgba(0,0,0,0.1)',
                  borderLeft: '4px solid #f59e0b'
                }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '16px' }}>
                  <div>
                    <h3 style={{ fontSize: '20px', fontWeight: 'bold', marginBottom: '8px', color: '#111827' }}>
                      Quote {approval.quote_number}
                    </h3>
                    <div style={{ fontSize: '14px', color: '#6b7280', display: 'flex', flexDirection: 'column', gap: '4px' }}>
                      <div><strong>Customer:</strong> {approval.customer_name} {approval.customer_company && `(${approval.customer_company})`}</div>
                      <div><strong>Value:</strong> ${((approval.total_cents || 0) / 100).toLocaleString()}</div>
                      <div><strong>Requested by:</strong> {approval.requested_by} ({approval.requested_by_email})</div>
                      <div><strong>Requested on:</strong> {new Date(approval.requested_at).toLocaleString()}</div>
                    </div>
                  </div>

                  <div style={{ fontSize: '48px' }}>⏳</div>
                </div>

                {approval.comments && (
                  <div style={{
                    padding: '12px',
                    background: '#f9fafb',
                    borderRadius: '6px',
                    marginBottom: '16px',
                    fontSize: '14px',
                    color: '#374151'
                  }}>
                    <strong>Comments:</strong> {approval.comments}
                  </div>
                )}

                <div style={{ display: 'flex', gap: '12px', justifyContent: 'flex-end', paddingTop: '16px', borderTop: '1px solid #e5e7eb' }}>
                  <button
                    onClick={() => viewQuote(approval.quotation_id)}
                    style={{
                      padding: '10px 20px',
                      background: '#3b82f6',
                      color: 'white',
                      border: 'none',
                      borderRadius: '8px',
                      fontSize: '14px',
                      fontWeight: 'bold',
                      cursor: 'pointer'
                    }}
                  >
                    👁️ View Quote
                  </button>

                  <button
                    onClick={() => openApprovalActionDialog(approval, 'reject')}
                    style={{
                      padding: '10px 20px',
                      background: '#ef4444',
                      color: 'white',
                      border: 'none',
                      borderRadius: '8px',
                      fontSize: '14px',
                      fontWeight: 'bold',
                      cursor: 'pointer'
                    }}
                  >
                    ❌ Reject
                  </button>

                  <button
                    onClick={() => openApprovalActionDialog(approval, 'approve')}
                    style={{
                      padding: '10px 20px',
                      background: '#10b981',
                      color: 'white',
                      border: 'none',
                      borderRadius: '8px',
                      fontSize: '14px',
                      fontWeight: 'bold',
                      cursor: 'pointer'
                    }}
                  >
                    ✅ Approve
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    );
  };

  // ============================================
  // FOLLOW-UP DASHBOARD VIEW
  // ============================================

  const renderFollowUpsView = () => {
    return (
      <div style={{ padding: '24px' }}>
        {/* Header */}
        <div style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          marginBottom: '24px'
        }}>
          <h1 style={{ fontSize: '32px', fontWeight: 'bold', margin: 0 }}>
            📞 Follow-Up Dashboard
          </h1>

          <button
            onClick={() => setView('list')}
            style={{
              padding: '12px 24px',
              background: '#6b7280',
              color: 'white',
              border: 'none',
              borderRadius: '8px',
              fontSize: '16px',
              fontWeight: 'bold',
              cursor: 'pointer'
            }}
          >
            ← Back to List
          </button>
        </div>

        {/* Stats Cards */}
        <div style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(4, 1fr)',
          gap: '16px',
          marginBottom: '32px'
        }}>
          <div style={{
            background: '#fee2e2',
            padding: '20px',
            borderRadius: '12px',
            border: '2px solid #fecaca'
          }}>
            <div style={{ fontSize: '36px', fontWeight: 'bold', color: '#dc2626' }}>
              {followUpStats.overdue_count || 0}
            </div>
            <div style={{ fontSize: '14px', color: '#991b1b', fontWeight: '600' }}>
              Overdue Reminders
            </div>
          </div>

          <div style={{
            background: '#fef3c7',
            padding: '20px',
            borderRadius: '12px',
            border: '2px solid #fde68a'
          }}>
            <div style={{ fontSize: '36px', fontWeight: 'bold', color: '#ca8a04' }}>
              {followUpStats.due_soon_count || 0}
            </div>
            <div style={{ fontSize: '14px', color: '#92400e', fontWeight: '600' }}>
              Due Next 3 Days
            </div>
          </div>

          <div style={{
            background: '#dbeafe',
            padding: '20px',
            borderRadius: '12px',
            border: '2px solid #bfdbfe'
          }}>
            <div style={{ fontSize: '36px', fontWeight: 'bold', color: '#2563eb' }}>
              {followUpStats.sent_this_week || 0}
            </div>
            <div style={{ fontSize: '14px', color: '#1e40af', fontWeight: '600' }}>
              Sent This Week
            </div>
          </div>

          <div style={{
            background: '#f3e8ff',
            padding: '20px',
            borderRadius: '12px',
            border: '2px solid #e9d5ff'
          }}>
            <div style={{ fontSize: '36px', fontWeight: 'bold', color: '#9333ea' }}>
              {followUpStats.stale_quotes || 0}
            </div>
            <div style={{ fontSize: '14px', color: '#6b21a8', fontWeight: '600' }}>
              Stale Quotes (7+ days)
            </div>
          </div>
        </div>

        {/* Pending Follow-Ups Section */}
        <div style={{ marginBottom: '32px' }}>
          <h2 style={{ fontSize: '24px', fontWeight: 'bold', marginBottom: '16px' }}>
            ⏰ Pending Follow-Ups
          </h2>

          {pendingFollowUps.length === 0 ? (
            <div style={{
              background: 'white',
              padding: '48px',
              borderRadius: '12px',
              textAlign: 'center',
              color: '#6b7280'
            }}>
              <div style={{ fontSize: '48px', marginBottom: '16px' }}>✅</div>
              <div style={{ fontSize: '18px', fontWeight: 'bold' }}>No Pending Follow-Ups</div>
              <div>Great job! All reminders are up to date.</div>
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
              {pendingFollowUps.map((followUp) => {
                const isOverdue = new Date(followUp.scheduled_for) < new Date();
                const daysUntil = Math.ceil((new Date(followUp.scheduled_for) - new Date()) / (1000 * 60 * 60 * 24));

                return (
                  <div
                    key={followUp.id}
                    style={{
                      background: 'white',
                      padding: '24px',
                      borderRadius: '12px',
                      boxShadow: '0 1px 3px rgba(0,0,0,0.1)',
                      borderLeft: `4px solid ${isOverdue ? '#dc2626' : '#f59e0b'}`
                    }}
                  >
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'start' }}>
                      <div style={{ flex: 1 }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '8px' }}>
                          <h3 style={{ fontSize: '20px', fontWeight: 'bold', margin: 0 }}>
                            Quote {followUp.quote_number}
                          </h3>
                          {isOverdue ? (
                            <span style={{
                              padding: '4px 12px',
                              background: '#fee2e2',
                              color: '#dc2626',
                              borderRadius: '12px',
                              fontSize: '12px',
                              fontWeight: 'bold'
                            }}>
                              ⚠️ OVERDUE
                            </span>
                          ) : daysUntil <= 1 ? (
                            <span style={{
                              padding: '4px 12px',
                              background: '#fef3c7',
                              color: '#ca8a04',
                              borderRadius: '12px',
                              fontSize: '12px',
                              fontWeight: 'bold'
                            }}>
                              📅 Due {daysUntil === 0 ? 'Today' : 'Tomorrow'}
                            </span>
                          ) : null}
                        </div>

                        <div style={{ fontSize: '14px', color: '#6b7280', display: 'flex', flexDirection: 'column', gap: '4px' }}>
                          <div><strong>Customer:</strong> {followUp.customer_name}</div>
                          <div><strong>Type:</strong> {followUp.reminder_type.replace(/_/g, ' ')}</div>
                          <div><strong>Scheduled:</strong> {new Date(followUp.scheduled_for).toLocaleString()}</div>
                          {followUp.template_name && (
                            <div><strong>Template:</strong> {followUp.template_name}</div>
                          )}
                        </div>
                      </div>

                      <div style={{ display: 'flex', gap: '8px', marginLeft: '16px' }}>
                        <button
                          onClick={() => {
                            viewQuote(followUp.quotation_id);
                          }}
                          style={{
                            padding: '8px 16px',
                            background: '#3b82f6',
                            color: 'white',
                            border: 'none',
                            borderRadius: '6px',
                            fontSize: '14px',
                            fontWeight: 'bold',
                            cursor: 'pointer',
                            whiteSpace: 'nowrap'
                          }}
                        >
                          👁️ View
                        </button>

                        <button
                          onClick={() => {
                            // Open email dialog with quote
                            const quote = quotations.find(q => q.id === followUp.quotation_id);
                            if (quote) {
                              setSelectedQuote(quote);
                              setEmailTo(quote.customer_email || '');
                              setEmailSubject(`Follow-up: Quote ${quote.quote_number}`);
                              setEmailMessage('');
                              setShowEmailDialog(true);
                              markFollowUpSent(followUp.id);
                            }
                          }}
                          style={{
                            padding: '8px 16px',
                            background: '#10b981',
                            color: 'white',
                            border: 'none',
                            borderRadius: '6px',
                            fontSize: '14px',
                            fontWeight: 'bold',
                            cursor: 'pointer',
                            whiteSpace: 'nowrap'
                          }}
                        >
                          📧 Email
                        </button>

                        <button
                          onClick={() => {
                            const quote = quotations.find(q => q.id === followUp.quotation_id);
                            if (quote) {
                              setSelectedFollowUpQuote(quote);
                              setShowInteractionModal(true);
                            }
                          }}
                          style={{
                            padding: '8px 16px',
                            background: '#8b5cf6',
                            color: 'white',
                            border: 'none',
                            borderRadius: '6px',
                            fontSize: '14px',
                            fontWeight: 'bold',
                            cursor: 'pointer',
                            whiteSpace: 'nowrap'
                          }}
                        >
                          📝 Log Call
                        </button>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Stale Quotes Section */}
        <div>
          <h2 style={{ fontSize: '24px', fontWeight: 'bold', marginBottom: '16px' }}>
            🕐 Stale Quotes (No Activity in 7+ Days)
          </h2>

          {staleQuotes.length === 0 ? (
            <div style={{
              background: 'white',
              padding: '48px',
              borderRadius: '12px',
              textAlign: 'center',
              color: '#6b7280'
            }}>
              <div style={{ fontSize: '48px', marginBottom: '16px' }}>✨</div>
              <div style={{ fontSize: '18px', fontWeight: 'bold' }}>No Stale Quotes</div>
              <div>All quotes have been followed up recently.</div>
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
              {staleQuotes.map((quote) => {
                const daysSinceActivity = quote.days_since_activity || 0;

                return (
                  <div
                    key={quote.id}
                    style={{
                      background: 'white',
                      padding: '24px',
                      borderRadius: '12px',
                      boxShadow: '0 1px 3px rgba(0,0,0,0.1)',
                      borderLeft: '4px solid #9333ea'
                    }}
                  >
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'start' }}>
                      <div style={{ flex: 1 }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '8px' }}>
                          <h3 style={{ fontSize: '20px', fontWeight: 'bold', margin: 0 }}>
                            Quote {quote.quote_number}
                          </h3>
                          <span style={{
                            padding: '4px 12px',
                            background: '#f3e8ff',
                            color: '#9333ea',
                            borderRadius: '12px',
                            fontSize: '12px',
                            fontWeight: 'bold'
                          }}>
                            {daysSinceActivity} days since last activity
                          </span>
                        </div>

                        <div style={{ fontSize: '14px', color: '#6b7280', display: 'flex', flexDirection: 'column', gap: '4px' }}>
                          <div><strong>Customer:</strong> {quote.customer_name}</div>
                          <div><strong>Value:</strong> ${((quote.total_cents || 0) / 100).toLocaleString()}</div>
                          <div><strong>Status:</strong> {quote.status}</div>
                          <div><strong>Created:</strong> {new Date(quote.created_at).toLocaleDateString()}</div>
                        </div>
                      </div>

                      <div style={{ display: 'flex', gap: '8px', marginLeft: '16px' }}>
                        <button
                          onClick={() => viewQuote(quote.id)}
                          style={{
                            padding: '8px 16px',
                            background: '#3b82f6',
                            color: 'white',
                            border: 'none',
                            borderRadius: '6px',
                            fontSize: '14px',
                            fontWeight: 'bold',
                            cursor: 'pointer'
                          }}
                        >
                          👁️ View
                        </button>

                        <button
                          onClick={() => {
                            setSelectedFollowUpQuote(quote);
                            setShowInteractionModal(true);
                          }}
                          style={{
                            padding: '8px 16px',
                            background: '#8b5cf6',
                            color: 'white',
                            border: 'none',
                            borderRadius: '6px',
                            fontSize: '14px',
                            fontWeight: 'bold',
                            cursor: 'pointer'
                          }}
                        >
                          📝 Log Interaction
                        </button>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Interaction Modal */}
        {showInteractionModal && (
          <div style={{
            position: 'fixed',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            background: 'rgba(0, 0, 0, 0.5)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 1000
          }}>
            <div style={{
              background: 'white',
              padding: '32px',
              borderRadius: '12px',
              boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.1)',
              minWidth: '600px',
              maxWidth: '700px'
            }}>
              <h3 style={{ fontSize: '24px', fontWeight: 'bold', marginBottom: '24px' }}>
                📝 Log Customer Interaction
              </h3>

              <div style={{ marginBottom: '20px' }}>
                <label style={{ display: 'block', fontWeight: 'bold', marginBottom: '8px' }}>
                  Quote: {selectedFollowUpQuote?.quote_number}
                </label>
                <div style={{ fontSize: '14px', color: '#6b7280' }}>
                  Customer: {selectedFollowUpQuote?.customer_name}
                </div>
              </div>

              <div style={{ marginBottom: '20px' }}>
                <label style={{ display: 'block', fontWeight: 'bold', marginBottom: '8px' }}>
                  Interaction Type
                </label>
                <select
                  value={interactionType}
                  onChange={(e) => setInteractionType(e.target.value)}
                  style={{
                    width: '100%',
                    padding: '12px',
                    border: '2px solid #d1d5db',
                    borderRadius: '8px',
                    fontSize: '14px'
                  }}
                >
                  <option value="PHONE_CALL">Phone Call</option>
                  <option value="EMAIL">Email</option>
                  <option value="IN_PERSON">In-Person Meeting</option>
                  <option value="VIDEO_CALL">Video Call</option>
                </select>
              </div>

              <div style={{ marginBottom: '20px' }}>
                <label style={{ display: 'block', fontWeight: 'bold', marginBottom: '8px' }}>
                  Notes
                </label>
                <textarea
                  value={interactionNotes}
                  onChange={(e) => setInteractionNotes(e.target.value)}
                  rows="4"
                  placeholder="Summarize the conversation..."
                  style={{
                    width: '100%',
                    padding: '12px',
                    border: '2px solid #d1d5db',
                    borderRadius: '8px',
                    fontSize: '14px',
                    resize: 'vertical'
                  }}
                />
              </div>

              <div style={{ marginBottom: '20px' }}>
                <label style={{ display: 'block', fontWeight: 'bold', marginBottom: '8px' }}>
                  Next Action (Optional)
                </label>
                <input
                  type="text"
                  value={nextAction}
                  onChange={(e) => setNextAction(e.target.value)}
                  placeholder="e.g., Send revised quote, Schedule demo"
                  style={{
                    width: '100%',
                    padding: '12px',
                    border: '2px solid #d1d5db',
                    borderRadius: '8px',
                    fontSize: '14px'
                  }}
                />
              </div>

              <div style={{ marginBottom: '24px' }}>
                <label style={{ display: 'block', fontWeight: 'bold', marginBottom: '8px' }}>
                  Next Action Date (Optional)
                </label>
                <input
                  type="date"
                  value={nextActionDate}
                  onChange={(e) => setNextActionDate(e.target.value)}
                  min={new Date().toISOString().split('T')[0]}
                  style={{
                    width: '100%',
                    padding: '12px',
                    border: '2px solid #d1d5db',
                    borderRadius: '8px',
                    fontSize: '14px'
                  }}
                />
              </div>

              <div style={{ display: 'flex', gap: '12px', justifyContent: 'flex-end' }}>
                <button
                  onClick={() => {
                    setShowInteractionModal(false);
                    setInteractionNotes('');
                    setNextAction('');
                    setNextActionDate('');
                    setSelectedFollowUpQuote(null);
                  }}
                  style={{
                    padding: '12px 24px',
                    background: '#6b7280',
                    color: 'white',
                    border: 'none',
                    borderRadius: '8px',
                    fontSize: '16px',
                    fontWeight: 'bold',
                    cursor: 'pointer'
                  }}
                >
                  Cancel
                </button>

                <button
                  onClick={logInteraction}
                  disabled={!interactionNotes.trim()}
                  style={{
                    padding: '12px 24px',
                    background: !interactionNotes.trim() ? '#9ca3af' : '#10b981',
                    color: 'white',
                    border: 'none',
                    borderRadius: '8px',
                    fontSize: '16px',
                    fontWeight: 'bold',
                    cursor: !interactionNotes.trim() ? 'not-allowed' : 'pointer'
                  }}
                >
                  Save Interaction
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    );
  };

  // ============================================
  // HELPER FUNCTIONS
  // ============================================

  // Calculate quote expiry status and return appropriate styling
  const getExpiryInfo = (expiryDate) => {
    if (!expiryDate) return null;

    const today = new Date();
    const expiry = new Date(expiryDate);
    const daysUntilExpiry = Math.ceil((expiry - today) / (1000 * 60 * 60 * 24));

    if (daysUntilExpiry < 0) {
      return { text: 'EXPIRED', color: '#dc2626', bg: '#fee2e2', urgent: true };
    } else if (daysUntilExpiry === 0) {
      return { text: 'Expires Today!', color: '#dc2626', bg: '#fee2e2', urgent: true };
    } else if (daysUntilExpiry <= 3) {
      return { text: `Expires in ${daysUntilExpiry} day${daysUntilExpiry === 1 ? '' : 's'}`, color: '#dc2626', bg: '#fee2e2', urgent: true };
    } else if (daysUntilExpiry <= 7) {
      return { text: `Expires in ${daysUntilExpiry} days`, color: '#ea580c', bg: '#ffedd5', urgent: false };
    } else if (daysUntilExpiry <= 14) {
      return { text: `Expires in ${daysUntilExpiry} days`, color: '#ca8a04', bg: '#fef3c7', urgent: false };
    }

    return null;
  };

  // ============================================
  // MAIN RENDER
  // ============================================
  if (loading) {
    return (
      <div style={{ 
        display: 'flex', 
        justifyContent: 'center', 
        alignItems: 'center', 
        minHeight: '400px',
        fontSize: '18px',
        color: '#6b7280'
      }}>
        Loading quotations...
      </div>
    );
  }
  
  return (
    <div>
      {view === 'list' && (
        <QuoteList
          quotations={quotations}
          stats={stats}
          followUpStats={followUpStats}
          searchTerm={searchTerm}
          setSearchTerm={setSearchTerm}
          statusFilter={statusFilter}
          setStatusFilter={setStatusFilter}
          dateFilter={dateFilter}
          setDateFilter={setDateFilter}
          valueFilter={valueFilter}
          setValueFilter={setValueFilter}
          expiringFilter={expiringFilter}
          setExpiringFilter={setExpiringFilter}
          sortBy={sortBy}
          setSortBy={setSortBy}
          sortOrder={sortOrder}
          setSortOrder={setSortOrder}
          showAdvancedFilters={showAdvancedFilters}
          setShowAdvancedFilters={setShowAdvancedFilters}
          customerFilter={customerFilter}
          setCustomerFilter={setCustomerFilter}
          productFilter={productFilter}
          setProductFilter={setProductFilter}
          onCreateNew={createNewQuote}
          onViewQuote={(id) => viewQuote(id)}
          onEditQuote={(id) => editQuote(id)}
          onDeleteQuote={(id) => deleteQuote(id)}
          onViewAnalytics={() => setView('analytics')}
          onViewApprovals={() => { fetchPendingApprovals(); setView('approvals'); }}
          onViewFollowUps={() => { fetchFollowUpData(); setView('followups'); }}
          onExport={(quotes) => exportToExcel(quotes)}
          onClearFilters={clearFilters}
          getActiveFilterCount={getActiveFilterCount}
          formatCurrency={formatCurrency}
          formatDate={formatDate}
          getStatusColor={getStatusColor}
        />
      )}
      {view === 'builder' && (
        <QuoteBuilder
          customers={customers}
          products={products}
          templates={templates}
          paymentTermsTemplates={paymentTermsTemplates}
          favoriteProducts={favoriteProducts}
          recentProducts={recentProducts}
          customerQuotes={customerQuotes}
          editingQuoteId={editingQuoteId}
          selectedCustomer={selectedCustomer}
          setSelectedCustomer={setSelectedCustomer}
          quoteItems={quoteItems}
          setQuoteItems={setQuoteItems}
          discountPercent={discountPercent}
          setDiscountPercent={setDiscountPercent}
          notes={notes}
          setNotes={setNotes}
          internalNotes={internalNotes}
          setInternalNotes={setInternalNotes}
          terms={terms}
          setTerms={setTerms}
          hideModelNumbers={hideModelNumbers}
          setHideModelNumbers={setHideModelNumbers}
          watermarkEnabled={watermarkEnabled}
          setWatermarkEnabled={setWatermarkEnabled}
          watermarkText={watermarkText}
          setWatermarkText={setWatermarkText}
          quoteExpiryDate={quoteExpiryDate}
          setQuoteExpiryDate={setQuoteExpiryDate}
          quoteFinancing={quoteFinancing}
          setQuoteFinancing={setQuoteFinancing}
          quoteWarranties={quoteWarranties}
          setQuoteWarranties={setQuoteWarranties}
          quoteDelivery={quoteDelivery}
          setQuoteDelivery={setQuoteDelivery}
          quoteRebates={quoteRebates}
          setQuoteRebates={setQuoteRebates}
          quoteTradeIns={quoteTradeIns}
          setQuoteTradeIns={setQuoteTradeIns}
          showRevenueFeatures={showRevenueFeatures}
          setShowRevenueFeatures={setShowRevenueFeatures}
          onSave={saveQuote}
          onSaveAndSend={saveAndSend}
          onSaveTemplate={saveAsTemplate}
          onBack={() => setView('list')}
          onLoadTemplate={loadTemplate}
          onAddProduct={addProductToQuote}
          onRemoveProduct={removeQuoteItem}
          onUpdateItem={updateQuoteItem}
          onAddService={addServiceItem}
          toggleFavorite={toggleFavorite}
          isFavorite={(productId) => favoriteProducts && favoriteProducts.some(p => p.id === productId)}
          formatCurrency={formatCurrency}
          calculateMargin={calculateMargin}
          calculateTotals={calculateQuoteTotals}
          showTemplateSaveDialog={showTemplateSaveDialog}
          setShowTemplateSaveDialog={setShowTemplateSaveDialog}
          templateName={templateName}
          setTemplateName={setTemplateName}
          templateDescription={templateDescription}
          setTemplateDescription={setTemplateDescription}
        />
      )}
      {view === 'viewer' && (
        <QuoteViewer
          quote={selectedQuote}
          quoteEvents={quoteEvents}
          quoteApprovals={quoteApprovals}
          onBack={() => setView('list')}
          onEdit={(id) => editQuote(id)}
          onDuplicate={(id) => duplicateQuote(id)}
          onDelete={(id) => deleteQuote(id)}
          onUpdateStatus={(id, status) => updateQuoteStatus(id, status)}
          onSendEmail={() => {
            if (selectedQuote) {
              setEmailTo(selectedQuote.customer_email || '');
              setEmailSubject(`Quote #${selectedQuote.quote_number || selectedQuote.id} from Your Company`);
              setEmailMessage('');
              setShowEmailDialog(true);
            }
          }}
          onRequestApproval={() => setShowApprovalDialog(true)}
          onAddEvent={() => setShowAddEventDialog(true)}
          showAddEventDialog={showAddEventDialog}
          setShowAddEventDialog={setShowAddEventDialog}
          newEventDescription={newEventDescription}
          setNewEventDescription={setNewEventDescription}
          onSaveEvent={addQuoteEvent}
        />
      )}
      {view === 'analytics' && renderAnalyticsView()}
      {view === 'approvals' && renderApprovalsView()}
      {view === 'followups' && renderFollowUpsView()}

      {/* Email Dialog */}
      {showEmailDialog && (
        <div style={{
          position: 'fixed',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          background: 'rgba(0, 0, 0, 0.5)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 1000
        }}>
          <div style={{
            background: 'white',
            padding: '32px',
            borderRadius: '12px',
            boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.1)',
            minWidth: '600px',
            maxWidth: '700px'
          }}>
            <h3 style={{ fontSize: '24px', fontWeight: 'bold', marginBottom: '24px' }}>
              📧 Send Quote via Email
            </h3>

            <div style={{ marginBottom: '20px' }}>
              <label style={{ display: 'block', fontWeight: 'bold', marginBottom: '8px' }}>
                To Email <span style={{ color: '#ef4444' }}>*</span>
              </label>
              <input
                type="email"
                value={emailTo}
                onChange={(e) => setEmailTo(e.target.value)}
                placeholder="customer@example.com"
                style={{
                  width: '100%',
                  padding: '12px',
                  border: '2px solid #d1d5db',
                  borderRadius: '8px',
                  fontSize: '14px'
                }}
                autoFocus
              />
            </div>

            {/* Email Template Selector */}
            <div style={{ marginBottom: '16px' }}>
              <label style={{
                display: 'block',
                fontWeight: '600',
                marginBottom: '8px'
              }}>
                📧 Email Template:
              </label>
              <select
                value={selectedEmailTemplate || ''}
                onChange={(e) => {
                  const templateId = e.target.value;
                  if (templateId) {
                    const template = emailTemplates.find(t => t.id === parseInt(templateId));
                    if (template) {
                      setEmailSubject(template.subject_line
                        .replace('{quote_number}', selectedQuote.quote_number || selectedQuote.id)
                        .replace('{customer_name}', selectedQuote.customer_name)
                      );
                      setEmailMessage(template.body_text
                        .replace('{customer_first_name}', selectedQuote.customer_name.split(' ')[0])
                        .replace('{customer_name}', selectedQuote.customer_name)
                        .replace('{quote_number}', selectedQuote.quote_number || selectedQuote.id)
                        .replace('{quote_date}', new Date(selectedQuote.created_at).toLocaleDateString())
                        .replace('{product_summary}', `${quoteItems.length} items`)
                        .replace('{quote_expiry_date}', quoteExpiryDate || 'TBD')
                        .replace('{sales_rep_name}', 'Sales Team')
                        .replace('{sales_rep_phone}', '(416) 555-1234')
                      );
                      setSelectedEmailTemplate(templateId);
                    }
                  }
                }}
                style={{
                  width: '100%',
                  padding: '10px',
                  border: '1px solid #d1d5db',
                  borderRadius: '6px',
                  fontSize: '14px',
                  background: 'white'
                }}
              >
                <option value="">-- Select a template or write custom message --</option>
                {emailTemplates.map(template => (
                  <option key={template.id} value={template.id}>
                    {template.name} ({template.category})
                  </option>
                ))}
              </select>

              {/* Show talking points if template selected */}
              {selectedEmailTemplate && emailTemplates.find(t => t.id === parseInt(selectedEmailTemplate))?.talking_points?.length > 0 && (
                <div style={{
                  marginTop: '12px',
                  padding: '12px',
                  background: '#fef3c7',
                  borderRadius: '6px',
                  fontSize: '12px'
                }}>
                  <strong>💡 Talking Points for Follow-Up Call:</strong>
                  <ul style={{ margin: '8px 0 0 20px', paddingLeft: '0' }}>
                    {emailTemplates.find(t => t.id === parseInt(selectedEmailTemplate)).talking_points.map((point, idx) => (
                      <li key={idx} style={{ marginTop: '4px' }}>{point}</li>
                    ))}
                  </ul>
                </div>
              )}
            </div>

            <div style={{ marginBottom: '20px' }}>
              <label style={{ display: 'block', fontWeight: 'bold', marginBottom: '8px' }}>
                Subject
              </label>
              <input
                type="text"
                value={emailSubject}
                onChange={(e) => setEmailSubject(e.target.value)}
                style={{
                  width: '100%',
                  padding: '12px',
                  border: '2px solid #d1d5db',
                  borderRadius: '8px',
                  fontSize: '14px'
                }}
              />
            </div>

            <div style={{ marginBottom: '24px' }}>
              <label style={{ display: 'block', fontWeight: 'bold', marginBottom: '8px' }}>
                Message
              </label>
              <textarea
                value={emailMessage}
                onChange={(e) => setEmailMessage(e.target.value)}
                rows="6"
                placeholder="Enter your message to the customer..."
                style={{
                  width: '100%',
                  padding: '12px',
                  border: '2px solid #d1d5db',
                  borderRadius: '8px',
                  fontSize: '14px',
                  resize: 'vertical'
                }}
              />
            </div>

            <div style={{
              padding: '12px',
              background: '#f0f9ff',
              border: '1px solid #bfdbfe',
              borderRadius: '8px',
              marginBottom: '24px',
              fontSize: '13px',
              color: '#1e40af'
            }}>
              ℹ️ The quote will be included as a formatted HTML email with all items, totals, and terms.
            </div>

            <div style={{ display: 'flex', gap: '12px', justifyContent: 'flex-end' }}>
              <button
                onClick={() => {
                  setShowEmailDialog(false);
                  setEmailTo('');
                  setEmailSubject('');
                  setEmailMessage('');
                }}
                style={{
                  padding: '12px 24px',
                  background: '#6b7280',
                  color: 'white',
                  border: 'none',
                  borderRadius: '8px',
                  fontSize: '16px',
                  fontWeight: 'bold',
                  cursor: 'pointer'
                }}
              >
                Cancel
              </button>

              <button
                onClick={sendQuoteEmail}
                disabled={!emailTo.trim()}
                style={{
                  padding: '12px 24px',
                  background: emailTo.trim() ? '#10b981' : '#9ca3af',
                  color: 'white',
                  border: 'none',
                  borderRadius: '8px',
                  fontSize: '16px',
                  fontWeight: 'bold',
                  cursor: emailTo.trim() ? 'pointer' : 'not-allowed'
                }}
              >
                📧 Send Email
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Add Event Dialog */}
      {showAddEventDialog && (
        <div style={{
          position: 'fixed',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          background: 'rgba(0, 0, 0, 0.5)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 1000
        }}>
          <div style={{
            background: 'white',
            padding: '32px',
            borderRadius: '12px',
            boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.1)',
            minWidth: '500px',
            maxWidth: '600px'
          }}>
            <h3 style={{ fontSize: '24px', fontWeight: 'bold', marginBottom: '24px' }}>
              📝 Add Activity Note
            </h3>

            <div style={{ marginBottom: '24px' }}>
              <label style={{ display: 'block', fontWeight: 'bold', marginBottom: '8px' }}>
                Note/Description <span style={{ color: '#ef4444' }}>*</span>
              </label>
              <textarea
                value={newEventDescription}
                onChange={(e) => setNewEventDescription(e.target.value)}
                rows="4"
                placeholder="e.g., Called customer to discuss pricing, Sent revised quote via email..."
                style={{
                  width: '100%',
                  padding: '12px',
                  border: '2px solid #d1d5db',
                  borderRadius: '8px',
                  fontSize: '14px',
                  resize: 'vertical'
                }}
                autoFocus
              />
            </div>

            <div style={{
              padding: '12px',
              background: '#f0f9ff',
              border: '1px solid #bfdbfe',
              borderRadius: '8px',
              marginBottom: '24px',
              fontSize: '13px',
              color: '#1e40af'
            }}>
              ℹ️ Use this to track customer interactions, follow-ups, or any important notes about this quote.
            </div>

            <div style={{ display: 'flex', gap: '12px', justifyContent: 'flex-end' }}>
              <button
                onClick={() => {
                  setShowAddEventDialog(false);
                  setNewEventDescription('');
                }}
                style={{
                  padding: '12px 24px',
                  background: '#6b7280',
                  color: 'white',
                  border: 'none',
                  borderRadius: '8px',
                  fontSize: '16px',
                  fontWeight: 'bold',
                  cursor: 'pointer'
                }}
              >
                Cancel
              </button>

              <button
                onClick={addQuoteEvent}
                disabled={!newEventDescription.trim()}
                style={{
                  padding: '12px 24px',
                  background: newEventDescription.trim() ? '#3b82f6' : '#9ca3af',
                  color: 'white',
                  border: 'none',
                  borderRadius: '8px',
                  fontSize: '16px',
                  fontWeight: 'bold',
                  cursor: newEventDescription.trim() ? 'pointer' : 'not-allowed'
                }}
              >
                📝 Add Note
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Request Approval Dialog */}
      {showApprovalDialog && (
        <div style={{
          position: 'fixed',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          background: 'rgba(0, 0, 0, 0.5)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 1000
        }}>
          <div style={{
            background: 'white',
            padding: '32px',
            borderRadius: '12px',
            boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.1)',
            minWidth: '600px',
            maxWidth: '700px'
          }}>
            <h3 style={{ fontSize: '24px', fontWeight: 'bold', marginBottom: '24px' }}>
              ✅ Request Quote Approval
            </h3>

            <div style={{ marginBottom: '16px' }}>
              <label style={{ display: 'block', fontWeight: 'bold', marginBottom: '8px' }}>
                Your Name <span style={{ color: '#ef4444' }}>*</span>
              </label>
              <input
                type="text"
                value={approvalRequestedBy}
                onChange={(e) => setApprovalRequestedBy(e.target.value)}
                placeholder="e.g., John Smith"
                style={{
                  width: '100%',
                  padding: '12px',
                  border: '2px solid #d1d5db',
                  borderRadius: '8px',
                  fontSize: '14px'
                }}
              />
            </div>

            <div style={{ marginBottom: '16px' }}>
              <label style={{ display: 'block', fontWeight: 'bold', marginBottom: '8px' }}>
                Your Email <span style={{ color: '#ef4444' }}>*</span>
              </label>
              <input
                type="email"
                value={approvalRequestedByEmail}
                onChange={(e) => setApprovalRequestedByEmail(e.target.value)}
                placeholder="e.g., john@company.com"
                style={{
                  width: '100%',
                  padding: '12px',
                  border: '2px solid #d1d5db',
                  borderRadius: '8px',
                  fontSize: '14px'
                }}
              />
            </div>

            <div style={{ marginBottom: '16px' }}>
              <label style={{ display: 'block', fontWeight: 'bold', marginBottom: '8px' }}>
                Approver Name <span style={{ color: '#ef4444' }}>*</span>
              </label>
              <input
                type="text"
                value={approverName}
                onChange={(e) => setApproverName(e.target.value)}
                placeholder="e.g., Jane Doe"
                style={{
                  width: '100%',
                  padding: '12px',
                  border: '2px solid #d1d5db',
                  borderRadius: '8px',
                  fontSize: '14px'
                }}
              />
            </div>

            <div style={{ marginBottom: '16px' }}>
              <label style={{ display: 'block', fontWeight: 'bold', marginBottom: '8px' }}>
                Approver Email <span style={{ color: '#ef4444' }}>*</span>
              </label>
              <input
                type="email"
                value={approverEmail}
                onChange={(e) => setApproverEmail(e.target.value)}
                placeholder="e.g., jane@company.com"
                style={{
                  width: '100%',
                  padding: '12px',
                  border: '2px solid #d1d5db',
                  borderRadius: '8px',
                  fontSize: '14px'
                }}
              />
            </div>

            <div style={{ marginBottom: '24px' }}>
              <label style={{ display: 'block', fontWeight: 'bold', marginBottom: '8px' }}>
                Comments (Optional)
              </label>
              <textarea
                value={approvalComments}
                onChange={(e) => setApprovalComments(e.target.value)}
                rows="3"
                placeholder="Add any notes or context for the approver..."
                style={{
                  width: '100%',
                  padding: '12px',
                  border: '2px solid #d1d5db',
                  borderRadius: '8px',
                  fontSize: '14px',
                  resize: 'vertical'
                }}
              />
            </div>

            <div style={{
              padding: '12px',
              background: '#f0f9ff',
              border: '1px solid #bfdbfe',
              borderRadius: '8px',
              marginBottom: '24px',
              fontSize: '13px',
              color: '#1e40af'
            }}>
              ℹ️ An email will be sent to the approver with quote details and a link to approve or reject.
            </div>

            <div style={{ display: 'flex', gap: '12px', justifyContent: 'flex-end' }}>
              <button
                onClick={() => setShowApprovalDialog(false)}
                style={{
                  padding: '12px 24px',
                  background: '#6b7280',
                  color: 'white',
                  border: 'none',
                  borderRadius: '8px',
                  fontSize: '16px',
                  fontWeight: 'bold',
                  cursor: 'pointer'
                }}
              >
                Cancel
              </button>

              <button
                onClick={requestApproval}
                disabled={!approvalRequestedBy.trim() || !approvalRequestedByEmail.trim() ||
                         !approverName.trim() || !approverEmail.trim()}
                style={{
                  padding: '12px 24px',
                  background: (approvalRequestedBy.trim() && approvalRequestedByEmail.trim() &&
                              approverName.trim() && approverEmail.trim()) ? '#6366f1' : '#9ca3af',
                  color: 'white',
                  border: 'none',
                  borderRadius: '8px',
                  fontSize: '16px',
                  fontWeight: 'bold',
                  cursor: (approvalRequestedBy.trim() && approvalRequestedByEmail.trim() &&
                          approverName.trim() && approverEmail.trim()) ? 'pointer' : 'not-allowed'
                }}
              >
                ✅ Send Request
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Approval Action Dialog (Approve/Reject) */}
      {showApprovalActionDialog && selectedApproval && (
        <div style={{
          position: 'fixed',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          background: 'rgba(0, 0, 0, 0.5)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 1000
        }}>
          <div style={{
            background: 'white',
            padding: '32px',
            borderRadius: '12px',
            boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.1)',
            minWidth: '500px',
            maxWidth: '600px'
          }}>
            <h3 style={{ fontSize: '24px', fontWeight: 'bold', marginBottom: '24px' }}>
              {approvalAction === 'approve' ? '✅ Approve Quote' : '❌ Reject Quote'}
            </h3>

            <div style={{
              padding: '16px',
              background: '#f9fafb',
              borderRadius: '8px',
              marginBottom: '24px'
            }}>
              <div style={{ marginBottom: '8px' }}>
                <strong>Quote:</strong> {selectedApproval.quote_number}
              </div>
              <div style={{ marginBottom: '8px' }}>
                <strong>Customer:</strong> {selectedApproval.customer_name}
              </div>
              <div style={{ marginBottom: '8px' }}>
                <strong>Value:</strong> ${((selectedApproval.total_cents || 0) / 100).toFixed(2)}
              </div>
              <div>
                <strong>Requested by:</strong> {selectedApproval.requested_by}
              </div>
            </div>

            <div style={{ marginBottom: '24px' }}>
              <label style={{ display: 'block', fontWeight: 'bold', marginBottom: '8px' }}>
                Comments {approvalAction === 'reject' && <span style={{ color: '#ef4444' }}>*</span>}
              </label>
              <textarea
                value={approvalActionComments}
                onChange={(e) => setApprovalActionComments(e.target.value)}
                rows="4"
                placeholder={approvalAction === 'approve'
                  ? 'Add any comments (optional)...'
                  : 'Please provide a reason for rejection...'
                }
                style={{
                  width: '100%',
                  padding: '12px',
                  border: '2px solid #d1d5db',
                  borderRadius: '8px',
                  fontSize: '14px',
                  resize: 'vertical'
                }}
                autoFocus
              />
            </div>

            <div style={{ display: 'flex', gap: '12px', justifyContent: 'flex-end' }}>
              <button
                onClick={() => setShowApprovalActionDialog(false)}
                style={{
                  padding: '12px 24px',
                  background: '#6b7280',
                  color: 'white',
                  border: 'none',
                  borderRadius: '8px',
                  fontSize: '16px',
                  fontWeight: 'bold',
                  cursor: 'pointer'
                }}
              >
                Cancel
              </button>

              <button
                onClick={performApprovalAction}
                disabled={approvalAction === 'reject' && !approvalActionComments.trim()}
                style={{
                  padding: '12px 24px',
                  background: approvalAction === 'approve'
                    ? '#10b981'
                    : (approvalActionComments.trim() ? '#ef4444' : '#9ca3af'),
                  color: 'white',
                  border: 'none',
                  borderRadius: '8px',
                  fontSize: '16px',
                  fontWeight: 'bold',
                  cursor: (approvalAction === 'reject' && !approvalActionComments.trim())
                    ? 'not-allowed'
                    : 'pointer'
                }}
              >
                {approvalAction === 'approve' ? '✅ Approve' : '❌ Reject'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default QuotationManager;