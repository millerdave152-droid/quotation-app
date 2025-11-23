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
    isMounted.current = true;

    if (!loadedOnce.current) {
      loadedOnce.current = true;
      fetchInitialData();
    }

    return () => {
      isMounted.current = false;
    };
  }, []);

  // DISABLED TEMPORARILY TO FIX INFINITE LOOP - Smart suggestions calculation
  // This useEffect was causing infinite re-renders due to too many dependencies
  /*
  useEffect(() => {
    if (!loadedOnce.current || !isMounted.current) return;
    if (quoteItems.length > 0 && view === 'builder') {
      const timer = setTimeout(() => {
        if (!isMounted.current) return;
        const quoteTotal = calculateQuoteTotals.total;
        const suggestions = getSmartSuggestions({
          quoteTotal,
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
      }, 300);
      return () => clearTimeout(timer);
    } else {
      setSmartSuggestions(null);
    }
  }, [calculateQuoteTotals, quoteItems, quoteFinancing, quoteWarranties, quoteDelivery, quoteRebates, quoteTradeIns, availableFinancing, availableWarranties, availableRebates, view]);
  */

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
    if (!isMounted.current) return;

    try {
      // Set loading FIRST to prevent flickering
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
      logger.error('Error fetching data:', err);
      if (isMounted.current) {
        alert('Error loading data. Please try again.');
      }
    } finally {
      if (isMounted.current) {
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
  
  const saveQuote = async () => {
    if (!selectedCustomer) {
      alert('Please select a customer');
      return;
    }

    if (quoteItems.length === 0) {
      alert('Please add at least one item');
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

      alert(editingQuoteId
        ? `Quote updated successfully!`
        : `Quote ${result.quote?.quote_number || result.quote_number} created successfully!`
      );

      // Reset builder and return to list
      resetBuilder();
      setView('list');
      refreshQuotesOnly(); // Only refresh quotes, not everything
    } catch (err) {
      logger.error('Error saving quote:', err);
      alert(`Error ${editingQuoteId ? 'updating' : 'creating'} quote. Please try again.`);
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

  const renderListView = () => {
    // Helper function to check if quote is expiring soon
    const isExpiringSoon = (expiresAt) => {
      if (!expiresAt) return false;
      const expiryDate = new Date(expiresAt);
      const today = new Date();
      const daysUntilExpiry = Math.ceil((expiryDate - today) / (1000 * 60 * 60 * 24));
      return daysUntilExpiry >= 0 && daysUntilExpiry <= 7;
    };

    const isExpired = (expiresAt) => {
      if (!expiresAt) return false;
      const expiryDate = new Date(expiresAt);
      const today = new Date();
      return expiryDate < today;
    };

    // Filter quotations
    const filteredQuotes = quotations.filter(q => {
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
      // Customer filter
      const matchesCustomer = customerFilter === 'all' || q.customer_id === parseInt(customerFilter);

      // Product filter (search in quote notes and internal notes for product mentions)
      let matchesProduct = true;
      if (productFilter.trim()) {
        const productLower = productFilter.toLowerCase();
        matchesProduct =
          q.notes?.toLowerCase().includes(productLower) ||
          q.internal_notes?.toLowerCase().includes(productLower) ||
          q.customer_name?.toLowerCase().includes(productLower);
      }

      // Created by filter
      const matchesCreatedBy = createdByFilter === 'all' || q.created_by === createdByFilter;

      return matchesSearch && matchesStatus && matchesDate && matchesValue && matchesExpiring &&
             matchesCustomer && matchesProduct && matchesCreatedBy;
    });

    // Sort quotes
    const sortedQuotes = [...filteredQuotes].sort((a, b) => {
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

    // Count expiring soon quotes (for dashboard)
    const expiringSoonCount = quotations.filter(q =>
      isExpiringSoon(q.expires_at) && q.status !== 'WON' && q.status !== 'LOST'
    ).length;
    
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
            📋 Quotations
          </h1>

          <div style={{ display: 'flex', gap: '12px' }}>
            <button
              onClick={() => setView('analytics')}
              style={{
                padding: '12px 24px',
                background: '#8b5cf6',
                color: 'white',
                border: 'none',
                borderRadius: '8px',
                fontSize: '16px',
                fontWeight: 'bold',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                gap: '8px'
              }}
            >
              📊 Analytics
            </button>

            <button
              onClick={() => {
                fetchPendingApprovals();
                setView('approvals');
              }}
              style={{
                padding: '12px 24px',
                background: '#6366f1',
                color: 'white',
                border: 'none',
                borderRadius: '8px',
                fontSize: '16px',
                fontWeight: 'bold',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                gap: '8px'
              }}
            >
              ✅ Approvals
            </button>

            <button
              onClick={() => {
                fetchFollowUpData();
                setView('followups');
              }}
              style={{
                padding: '12px 24px',
                background: '#ec4899',
                color: 'white',
                border: 'none',
                borderRadius: '8px',
                fontSize: '16px',
                fontWeight: 'bold',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                gap: '8px'
              }}
            >
              📞 Follow-Ups
              {(followUpStats.overdue_count > 0 || followUpStats.due_soon_count > 0) && (
                <span style={{
                  background: '#dc2626',
                  color: 'white',
                  borderRadius: '12px',
                  padding: '2px 8px',
                  fontSize: '12px',
                  fontWeight: 'bold'
                }}>
                  {(followUpStats.overdue_count || 0) + (followUpStats.due_soon_count || 0)}
                </span>
              )}
            </button>

            <button
              onClick={() => setExpiringFilter(!expiringFilter)}
              style={{
                padding: '12px 24px',
                background: expiringFilter ? '#f59e0b' : '#6b7280',
                color: 'white',
                border: 'none',
                borderRadius: '8px',
                fontSize: '16px',
                fontWeight: 'bold',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                gap: '8px'
              }}
            >
              ⚠️ Expiring Soon ({quotations.filter(q => {
                if (!q.quote_expiry_date) return false;
                const days = Math.ceil((new Date(q.quote_expiry_date) - new Date()) / (1000 * 60 * 60 * 24));
                return days >= 0 && days <= 7 && q.status !== 'WON' && q.status !== 'LOST';
              }).length})
            </button>

            <button
              onClick={() => exportToExcel(sortedQuotes)}
              disabled={sortedQuotes.length === 0}
              style={{
                padding: '12px 24px',
                background: sortedQuotes.length === 0 ? '#9ca3af' : '#10b981',
                color: 'white',
                border: 'none',
                borderRadius: '8px',
                fontSize: '16px',
                fontWeight: 'bold',
                cursor: sortedQuotes.length === 0 ? 'not-allowed' : 'pointer',
                display: 'flex',
                alignItems: 'center',
                gap: '8px'
              }}
            >
              📥 Export
            </button>

            <button
              onClick={createNewQuote}
              style={{
                padding: '12px 24px',
                background: '#3b82f6',
                color: 'white',
                border: 'none',
                borderRadius: '8px',
                fontSize: '16px',
                fontWeight: 'bold',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                gap: '8px'
              }}
            >
              ➕ New Quote
            </button>
          </div>
        </div>
        
        {/* Stats Cards */}
        <div style={{ 
          display: 'grid', 
          gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
          gap: '16px',
          marginBottom: '24px'
        }}>
          <div style={{
            background: 'white',
            padding: '20px',
            borderRadius: '12px',
            boxShadow: '0 1px 3px rgba(0,0,0,0.1)'
          }}>
            <div style={{ fontSize: '14px', color: '#6b7280', marginBottom: '8px' }}>
              Total Quotes
            </div>
            <div style={{ fontSize: '32px', fontWeight: 'bold', color: '#3b82f6' }}>
              {stats.total_quotes || 0}
            </div>
          </div>
          
          <div style={{
            background: 'white',
            padding: '20px',
            borderRadius: '12px',
            boxShadow: '0 1px 3px rgba(0,0,0,0.1)'
          }}>
            <div style={{ fontSize: '14px', color: '#6b7280', marginBottom: '8px' }}>
              Total Value
            </div>
            <div style={{ fontSize: '32px', fontWeight: 'bold', color: '#10b981' }}>
              ${((stats.total_value_cents || 0) / 100).toFixed(2)}
            </div>
          </div>
          
          <div style={{
            background: 'white',
            padding: '20px',
            borderRadius: '12px',
            boxShadow: '0 1px 3px rgba(0,0,0,0.1)'
          }}>
            <div style={{ fontSize: '14px', color: '#6b7280', marginBottom: '8px' }}>
              Average Quote
            </div>
            <div style={{ fontSize: '32px', fontWeight: 'bold', color: '#f59e0b' }}>
              ${((stats.avg_quote_cents || 0) / 100).toFixed(2)}
            </div>
          </div>
          
          <div style={{
            background: 'white',
            padding: '20px',
            borderRadius: '12px',
            boxShadow: '0 1px 3px rgba(0,0,0,0.1)'
          }}>
            <div style={{ fontSize: '14px', color: '#6b7280', marginBottom: '8px' }}>
              Won Rate
            </div>
            <div style={{ fontSize: '32px', fontWeight: 'bold', color: '#8b5cf6' }}>
              {stats.won_rate || '0'}%
            </div>
          </div>

          <div style={{
            background: 'white',
            padding: '20px',
            borderRadius: '12px',
            boxShadow: '0 1px 3px rgba(0,0,0,0.1)',
            border: expiringSoonCount > 0 ? '2px solid #f59e0b' : 'none'
          }}>
            <div style={{ fontSize: '14px', color: '#6b7280', marginBottom: '8px' }}>
              ⏰ Expiring Soon
            </div>
            <div style={{ fontSize: '32px', fontWeight: 'bold', color: expiringSoonCount > 0 ? '#f59e0b' : '#6b7280' }}>
              {expiringSoonCount}
            </div>
            <div style={{ fontSize: '11px', color: '#9ca3af', marginTop: '4px' }}>
              Within 7 days
            </div>
          </div>
        </div>
        
        {/* Filters */}
        <div style={{
          background: 'white',
          padding: '16px',
          borderRadius: '12px',
          marginBottom: '24px',
          boxShadow: '0 1px 3px rgba(0,0,0,0.1)'
        }}>
          <div style={{ display: 'flex', gap: '12px', marginBottom: '12px', flexWrap: 'wrap' }}>
            <input
              type="text"
              placeholder="🔍 Search quotes or customers..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              style={{
                flex: '1 1 250px',
                padding: '12px',
                border: '1px solid #d1d5db',
                borderRadius: '8px',
                fontSize: '14px'
              }}
            />

            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              style={{
                padding: '12px',
                border: '1px solid #d1d5db',
                borderRadius: '8px',
                fontSize: '14px',
                minWidth: '120px'
              }}
            >
              <option value="all">All Status</option>
              <option value="DRAFT">Draft</option>
              <option value="SENT">Sent</option>
              <option value="WON">Won</option>
              <option value="LOST">Lost</option>
            </select>

            <select
              value={dateFilter}
              onChange={(e) => setDateFilter(e.target.value)}
              style={{
                padding: '12px',
                border: '1px solid #d1d5db',
                borderRadius: '8px',
                fontSize: '14px',
                minWidth: '120px'
              }}
            >
              <option value="all">All Time</option>
              <option value="today">Today</option>
              <option value="week">Last 7 Days</option>
              <option value="month">Last 30 Days</option>
            </select>

            <select
              value={valueFilter}
              onChange={(e) => setValueFilter(e.target.value)}
              style={{
                padding: '12px',
                border: '1px solid #d1d5db',
                borderRadius: '8px',
                fontSize: '14px',
                minWidth: '120px'
              }}
            >
              <option value="all">All Values</option>
              <option value="0-1000">$0 - $1,000</option>
              <option value="1000-5000">$1,000 - $5,000</option>
              <option value="5000-10000">$5,000 - $10,000</option>
              <option value="10000+">$10,000+</option>
            </select>

            <button
              onClick={() => setExpiringFilter(!expiringFilter)}
              style={{
                padding: '12px 16px',
                background: expiringFilter ? '#f59e0b' : 'white',
                color: expiringFilter ? 'white' : '#6b7280',
                border: expiringFilter ? 'none' : '1px solid #d1d5db',
                borderRadius: '8px',
                fontSize: '14px',
                fontWeight: 'bold',
                cursor: 'pointer',
                whiteSpace: 'nowrap'
              }}
            >
              ⏰ Expiring Soon
            </button>
          </div>

          {/* Sort Controls */}
          <div style={{ display: 'flex', gap: '12px', alignItems: 'center' }}>
            <span style={{ fontSize: '14px', color: '#6b7280', fontWeight: 'bold' }}>
              Sort by:
            </span>
            <select
              value={sortBy}
              onChange={(e) => setSortBy(e.target.value)}
              style={{
                padding: '8px 12px',
                border: '1px solid #d1d5db',
                borderRadius: '8px',
                fontSize: '14px'
              }}
            >
              <option value="date">Date</option>
              <option value="value">Value</option>
              <option value="customer">Customer</option>
              <option value="status">Status</option>
            </select>

            <button
              onClick={() => setSortOrder(sortOrder === 'asc' ? 'desc' : 'asc')}
              style={{
                padding: '8px 12px',
                background: 'white',
                border: '1px solid #d1d5db',
                borderRadius: '8px',
                fontSize: '14px',
                cursor: 'pointer',
                fontWeight: 'bold'
              }}
            >
              {sortOrder === 'asc' ? '↑ Ascending' : '↓ Descending'}
            </button>

            <div style={{ flex: 1 }} />

            <button
              onClick={() => setShowAdvancedFilters(!showAdvancedFilters)}
              style={{
                padding: '8px 16px',
                background: showAdvancedFilters ? '#667eea' : 'white',
                color: showAdvancedFilters ? 'white' : '#667eea',
                border: showAdvancedFilters ? 'none' : '1px solid #667eea',
                borderRadius: '8px',
                fontSize: '14px',
                cursor: 'pointer',
                fontWeight: 'bold'
              }}
            >
              {showAdvancedFilters ? '▲' : '▼'} Advanced {getActiveFilterCount() > 0 && `(${getActiveFilterCount()})`}
            </button>

            <button
              onClick={clearAllFilters}
              style={{
                padding: '8px 12px',
                background: '#6b7280',
                color: 'white',
                border: 'none',
                borderRadius: '8px',
                fontSize: '14px',
                cursor: 'pointer'
              }}
            >
              ✕ Clear All
            </button>
          </div>

          {/* Advanced Filters Panel */}
          {showAdvancedFilters && (
            <div style={{
              marginTop: '16px',
              padding: '16px',
              background: '#f9fafb',
              borderRadius: '8px',
              border: '1px solid #e5e7eb'
            }}>
              <div style={{ fontWeight: 'bold', marginBottom: '12px', color: '#374151' }}>
                🔍 Advanced Filters
              </div>
              <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap' }}>
                <select
                  value={customerFilter}
                  onChange={(e) => setCustomerFilter(e.target.value)}
                  style={{
                    padding: '10px',
                    border: '1px solid #d1d5db',
                    borderRadius: '8px',
                    fontSize: '14px',
                    minWidth: '200px',
                    background: 'white'
                  }}
                >
                  <option value="all">All Customers</option>
                  {customers.map(c => (
                    <option key={c.id} value={c.id}>{c.name}</option>
                  ))}
                </select>

                <input
                  type="text"
                  placeholder="Filter by product/model..."
                  value={productFilter}
                  onChange={(e) => setProductFilter(e.target.value)}
                  style={{
                    flex: '1 1 200px',
                    padding: '10px',
                    border: '1px solid #d1d5db',
                    borderRadius: '8px',
                    fontSize: '14px',
                    background: 'white'
                  }}
                />

                <select
                  value={createdByFilter}
                  onChange={(e) => setCreatedByFilter(e.target.value)}
                  style={{
                    padding: '10px',
                    border: '1px solid #d1d5db',
                    borderRadius: '8px',
                    fontSize: '14px',
                    minWidth: '180px',
                    background: 'white'
                  }}
                >
                  <option value="all">All Creators</option>
                  {[...new Set(quotations.map(q => q.created_by).filter(Boolean))].map(creator => (
                    <option key={creator} value={creator}>{creator}</option>
                  ))}
                </select>
              </div>

              {/* Active Filter Chips */}
              {getActiveFilterCount() > 0 && (
                <div style={{ marginTop: '12px', display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                  <span style={{ fontSize: '12px', color: '#6b7280', fontWeight: 'bold' }}>
                    Active filters:
                  </span>
                  {searchTerm && (
                    <span style={{
                      padding: '4px 8px',
                      background: '#dbeafe',
                      color: '#1e40af',
                      borderRadius: '4px',
                      fontSize: '12px'
                    }}>
                      Search: "{searchTerm}"
                    </span>
                  )}
                  {statusFilter !== 'all' && (
                    <span style={{
                      padding: '4px 8px',
                      background: '#dbeafe',
                      color: '#1e40af',
                      borderRadius: '4px',
                      fontSize: '12px'
                    }}>
                      Status: {statusFilter}
                    </span>
                  )}
                  {dateFilter !== 'all' && (
                    <span style={{
                      padding: '4px 8px',
                      background: '#dbeafe',
                      color: '#1e40af',
                      borderRadius: '4px',
                      fontSize: '12px'
                    }}>
                      Date: {dateFilter}
                    </span>
                  )}
                  {valueFilter !== 'all' && (
                    <span style={{
                      padding: '4px 8px',
                      background: '#dbeafe',
                      color: '#1e40af',
                      borderRadius: '4px',
                      fontSize: '12px'
                    }}>
                      Value: {valueFilter}
                    </span>
                  )}
                  {customerFilter !== 'all' && (
                    <span style={{
                      padding: '4px 8px',
                      background: '#dbeafe',
                      color: '#1e40af',
                      borderRadius: '4px',
                      fontSize: '12px'
                    }}>
                      Customer: {customers.find(c => c.id == customerFilter)?.name || 'Unknown'}
                    </span>
                  )}
                  {productFilter && (
                    <span style={{
                      padding: '4px 8px',
                      background: '#dbeafe',
                      color: '#1e40af',
                      borderRadius: '4px',
                      fontSize: '12px'
                    }}>
                      Product: "{productFilter}"
                    </span>
                  )}
                </div>
              )}
            </div>
          )}
        </div>
        
        {/* Quotes Table */}
        <div style={{
          background: 'white',
          borderRadius: '12px',
          boxShadow: '0 1px 3px rgba(0,0,0,0.1)',
          overflow: 'hidden'
        }}>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr style={{ background: '#f9fafb', borderBottom: '2px solid #e5e7eb' }}>
                <th style={{ padding: '16px', textAlign: 'left', fontWeight: 'bold' }}>
                  Quote #
                </th>
                <th style={{ padding: '16px', textAlign: 'left', fontWeight: 'bold' }}>
                  Customer
                </th>
                <th style={{ padding: '16px', textAlign: 'left', fontWeight: 'bold' }}>
                  Date
                </th>
                <th style={{ padding: '16px', textAlign: 'right', fontWeight: 'bold' }}>
                  Total
                </th>
                <th style={{ padding: '16px', textAlign: 'center', fontWeight: 'bold' }}>
                  Status
                </th>
                <th style={{ padding: '16px', textAlign: 'center', fontWeight: 'bold' }}>
                  Actions
                </th>
              </tr>
            </thead>
            <tbody>
              {sortedQuotes.map((quote) => {
                const expiringSoon = isExpiringSoon(quote.expires_at);
                const expired = isExpired(quote.expires_at);
                const showWarning = (expiringSoon || expired) && quote.status !== 'WON' && quote.status !== 'LOST';

                return (
                  <tr
                    key={quote.id}
                    style={{
                      borderBottom: '1px solid #e5e7eb',
                      transition: 'background 0.2s',
                      background: showWarning && expired ? '#fef2f2' : 'white'
                    }}
                    onMouseEnter={(e) => e.currentTarget.style.background = showWarning && expired ? '#fee2e2' : '#f9fafb'}
                    onMouseLeave={(e) => e.currentTarget.style.background = showWarning && expired ? '#fef2f2' : 'white'}
                  >
                    <td style={{ padding: '16px' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <span style={{ fontWeight: 'bold', color: '#3b82f6' }}>
                          {quote.quote_number}
                        </span>
                        {showWarning && (
                          <span style={{
                            padding: '2px 8px',
                            borderRadius: '12px',
                            fontSize: '10px',
                            fontWeight: 'bold',
                            background: expired ? '#fee2e2' : '#fef3c7',
                            color: expired ? '#991b1b' : '#92400e',
                            display: 'flex',
                            alignItems: 'center',
                            gap: '4px'
                          }}>
                            {expired ? '🚫 EXPIRED' : '⏰ EXPIRES SOON'}
                          </span>
                        )}
                      </div>
                    </td>
                  <td style={{ padding: '16px' }}>
                    {quote.customer_name}
                  </td>
                  <td style={{ padding: '16px', color: '#6b7280' }}>
                    {new Date(quote.created_at || quote.quote_date).toLocaleDateString()}
                  </td>
                  <td style={{ padding: '16px', textAlign: 'right', fontWeight: 'bold' }}>
                    ${((quote.total_cents || 0) / 100).toFixed(2)}
                  </td>
                  <td style={{ padding: '16px', textAlign: 'center' }}>
                    <span style={{
                      padding: '4px 12px',
                      borderRadius: '12px',
                      fontSize: '12px',
                      fontWeight: 'bold',
                      background:
                        quote.status === 'DRAFT' ? '#e0e7ff' :
                        quote.status === 'SENT' ? '#dbeafe' :
                        quote.status === 'WON' ? '#d1fae5' :
                        quote.status === 'PENDING_APPROVAL' ? '#fef3c7' :
                        quote.status === 'APPROVED' ? '#d1fae5' :
                        quote.status === 'REJECTED' ? '#fee2e2' :
                        '#fee2e2',
                      color:
                        quote.status === 'DRAFT' ? '#3730a3' :
                        quote.status === 'SENT' ? '#1e40af' :
                        quote.status === 'WON' ? '#065f46' :
                        quote.status === 'PENDING_APPROVAL' ? '#92400e' :
                        quote.status === 'APPROVED' ? '#065f46' :
                        quote.status === 'REJECTED' ? '#991b1b' :
                        '#991b1b'
                    }}>
                      {quote.status}
                    </span>
                    {/* Expiry Warning Badge */}
                    {getExpiryInfo(quote.quote_expiry_date) && (
                      <div style={{
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: '4px',
                        padding: '4px 12px',
                        background: getExpiryInfo(quote.quote_expiry_date).bg,
                        color: getExpiryInfo(quote.quote_expiry_date).color,
                        borderRadius: '12px',
                        fontSize: '12px',
                        fontWeight: '600',
                        marginLeft: '8px'
                      }}>
                        {getExpiryInfo(quote.quote_expiry_date).urgent && '⚠️ '}
                        {getExpiryInfo(quote.quote_expiry_date).text}
                      </div>
                    )}
                  </td>
                  <td style={{ padding: '16px', textAlign: 'center' }}>
                    <div style={{ display: 'flex', gap: '8px', justifyContent: 'center' }}>
                      <button
                        onClick={() => viewQuote(quote.id)}
                        style={{
                          padding: '6px 12px',
                          background: '#3b82f6',
                          color: 'white',
                          border: 'none',
                          borderRadius: '6px',
                          fontSize: '12px',
                          cursor: 'pointer'
                        }}
                      >
                        👁️ View
                      </button>
                      <button
                        onClick={() => deleteQuote(quote.id)}
                        style={{
                          padding: '6px 12px',
                          background: '#ef4444',
                          color: 'white',
                          border: 'none',
                          borderRadius: '6px',
                          fontSize: '12px',
                          cursor: 'pointer'
                        }}
                      >
                        🗑️ Delete
                      </button>
                    </div>
                  </td>
                </tr>
                );
              })}
            </tbody>
          </table>
          
          {sortedQuotes.length === 0 && (
            <div style={{ 
              padding: '48px',
              textAlign: 'center',
              color: '#6b7280'
            }}>
              No quotes found. Create your first quote!
            </div>
          )}
        </div>
      </div>
    );
  };
  
  const renderBuilderView = () => {
    const totals = calculateQuoteTotals;
    
    // Filter products for search
    const filteredProducts = products.filter(p =>
      p.sku?.toLowerCase().includes(productSearchTerm.toLowerCase()) ||
      p.model?.toLowerCase().includes(productSearchTerm.toLowerCase()) ||
      p.manufacturer?.toLowerCase().includes(productSearchTerm.toLowerCase())
    );
    
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
            {editingQuoteId ? '✏️ Edit Quote' : '📝 Quote Builder'}
          </h1>

          <button
            onClick={() => {
              resetBuilder();
              setView('list');
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
            ← Back to List
          </button>
        </div>
        
        {/* Customer Selection */}
        <div style={{
          background: 'white',
          padding: '24px',
          borderRadius: '12px',
          marginBottom: '24px',
          boxShadow: '0 1px 3px rgba(0,0,0,0.1)'
        }}>
          <h3 style={{ fontSize: '18px', fontWeight: 'bold', marginBottom: '16px' }}>
            1. Select Customer <span style={{ color: '#ef4444' }}>*</span>
          </h3>

          {!selectedCustomer && (
            <div style={{
              padding: '8px 12px',
              background: '#fef2f2',
              border: '1px solid #fecaca',
              borderRadius: '6px',
              color: '#991b1b',
              fontSize: '13px',
              fontWeight: '600',
              marginBottom: '12px'
            }}>
              ⚠️ Please select a customer to continue
            </div>
          )}

          {!selectedCustomer ? (
            <div style={{ position: 'relative' }}>
              <input
                type="text"
                placeholder="🔍 Search customers by name, company, or email..."
                value={customerSearchTerm}
                onChange={(e) => {
                  setCustomerSearchTerm(e.target.value);
                  setShowCustomerDropdown(true);
                }}
                onFocus={() => setShowCustomerDropdown(true)}
                style={{
                  width: '100%',
                  padding: '12px',
                  border: '2px solid #ef4444',
                  borderRadius: '8px',
                  fontSize: '14px'
                }}
              />

              {showCustomerDropdown && (
                <div style={{
                  position: 'absolute',
                  top: '100%',
                  left: 0,
                  right: 0,
                  maxHeight: '300px',
                  overflowY: 'auto',
                  background: 'white',
                  border: '2px solid #d1d5db',
                  borderRadius: '8px',
                  marginTop: '4px',
                  boxShadow: '0 4px 6px rgba(0,0,0,0.1)',
                  zIndex: 1000
                }}>
                  {customers
                    .filter(c => {
                      const search = customerSearchTerm.toLowerCase();
                      return (
                        (c.name && c.name.toLowerCase().includes(search)) ||
                        (c.company && c.company.toLowerCase().includes(search)) ||
                        (c.company_name && c.company_name.toLowerCase().includes(search)) ||
                        (c.email && c.email.toLowerCase().includes(search)) ||
                        (c.first_name && c.first_name.toLowerCase().includes(search)) ||
                        (c.last_name && c.last_name.toLowerCase().includes(search))
                      );
                    })
                    .slice(0, 50)
                    .map(c => (
                      <div
                        key={c.id}
                        onClick={() => {
                          setSelectedCustomer(c);
                          setCustomerSearchTerm('');
                          setShowCustomerDropdown(false);
                          fetchCustomerQuotes(c.id);
                        }}
                        style={{
                          padding: '12px',
                          borderBottom: '1px solid #e5e7eb',
                          cursor: 'pointer',
                          transition: 'background 0.2s'
                        }}
                        onMouseEnter={(e) => e.currentTarget.style.background = '#f9fafb'}
                        onMouseLeave={(e) => e.currentTarget.style.background = 'white'}
                      >
                        <div style={{ fontWeight: 'bold' }}>
                          {c.company || c.company_name || 'N/A'}
                        </div>
                        <div style={{ fontSize: '12px', color: '#6b7280' }}>
                          {c.name || `${c.first_name || ''} ${c.last_name || ''}`.trim()}
                        </div>
                        <div style={{ fontSize: '12px', color: '#6b7280' }}>{c.email}</div>
                      </div>
                    ))}
                  {customers.filter(c => {
                    const search = customerSearchTerm.toLowerCase();
                    return (
                      (c.name && c.name.toLowerCase().includes(search)) ||
                      (c.company && c.company.toLowerCase().includes(search)) ||
                      (c.company_name && c.company_name.toLowerCase().includes(search)) ||
                      (c.email && c.email.toLowerCase().includes(search)) ||
                      (c.first_name && c.first_name.toLowerCase().includes(search)) ||
                      (c.last_name && c.last_name.toLowerCase().includes(search))
                    );
                  }).length === 0 && (
                    <div style={{ padding: '12px', textAlign: 'center', color: '#6b7280' }}>
                      No customers found
                    </div>
                  )}
                </div>
              )}
            </div>
          ) : (
            <div style={{
              padding: '16px',
              background: '#f0f9ff',
              borderRadius: '8px',
              border: '2px solid #3b82f6'
            }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div>
                  <div style={{ fontWeight: 'bold', fontSize: '16px', marginBottom: '4px' }}>
                    {selectedCustomer.company || selectedCustomer.company_name || 'N/A'}
                  </div>
                  <div style={{ color: '#6b7280', fontSize: '14px' }}>
                    {selectedCustomer.name || `${selectedCustomer.first_name || ''} ${selectedCustomer.last_name || ''}`}
                  </div>
                  <div style={{ color: '#6b7280', fontSize: '14px' }}>
                    {selectedCustomer.email} • {selectedCustomer.phone}
                  </div>
                </div>
                <button
                  onClick={() => setSelectedCustomer(null)}
                  style={{
                    padding: '8px 16px',
                    background: '#ef4444',
                    color: 'white',
                    border: 'none',
                    borderRadius: '6px',
                    cursor: 'pointer'
                  }}
                >
                  Change
                </button>
              </div>

              {/* Customer Quote History */}
              {customerQuotes.length > 0 && (
                <div style={{
                  marginTop: '16px',
                  padding: '12px',
                  background: '#fef3c7',
                  border: '1px solid #fde047',
                  borderRadius: '8px'
                }}>
                  <div style={{ fontSize: '13px', fontWeight: 'bold', marginBottom: '8px', color: '#92400e' }}>
                    📊 Recent Quotes for this Customer:
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                    {customerQuotes.map((quote, idx) => (
                      <div key={quote.id} style={{ display: 'flex', justifyContent: 'space-between', fontSize: '12px', color: '#78350f' }}>
                        <span style={{ fontWeight: '600' }}>
                          {quote.quote_number}
                        </span>
                        <span>
                          {new Date(quote.created_at).toLocaleDateString()}
                        </span>
                        <span style={{ fontWeight: 'bold' }}>
                          ${((quote.total_cents || 0) / 100).toFixed(2)}
                        </span>
                        <span style={{
                          padding: '2px 6px',
                          borderRadius: '4px',
                          fontSize: '10px',
                          fontWeight: 'bold',
                          background:
                            quote.status === 'WON' ? '#d1fae5' :
                            quote.status === 'LOST' ? '#fee2e2' :
                            quote.status === 'SENT' ? '#dbeafe' : '#e0e7ff',
                          color:
                            quote.status === 'WON' ? '#065f46' :
                            quote.status === 'LOST' ? '#991b1b' :
                            quote.status === 'SENT' ? '#1e40af' : '#3730a3'
                        }}>
                          {quote.status}
                        </span>
                      </div>
                    ))}
                  </div>
                  {customerQuotes.length === 5 && (
                    <div style={{ fontSize: '11px', color: '#92400e', marginTop: '8px', fontStyle: 'italic' }}>
                      Showing last 5 quotes
                    </div>
                  )}
                </div>
              )}
            </div>
          )}
        </div>

        {/* Template Section */}
        {templates.length > 0 && (
          <div style={{
            background: 'white',
            padding: '24px',
            borderRadius: '12px',
            marginBottom: '24px',
            boxShadow: '0 1px 3px rgba(0,0,0,0.1)',
            border: '2px solid #8b5cf6'
          }}>
            <h3 style={{ fontSize: '18px', fontWeight: 'bold', marginBottom: '16px', color: '#8b5cf6' }}>
              📋 Quote Templates
            </h3>

            <div style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fill, minmax(250px, 1fr))',
              gap: '12px'
            }}>
              {templates.map(template => (
                <div
                  key={template.id}
                  style={{
                    padding: '16px',
                    background: '#f9fafb',
                    border: '1px solid #d1d5db',
                    borderRadius: '8px',
                    transition: 'all 0.2s'
                  }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.background = '#f0f9ff';
                    e.currentTarget.style.borderColor = '#8b5cf6';
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.background = '#f9fafb';
                    e.currentTarget.style.borderColor = '#d1d5db';
                  }}
                >
                  <div style={{ fontWeight: 'bold', marginBottom: '8px', fontSize: '14px' }}>
                    {template.name}
                  </div>
                  {template.description && (
                    <div style={{ fontSize: '12px', color: '#6b7280', marginBottom: '12px' }}>
                      {template.description}
                    </div>
                  )}
                  <div style={{ fontSize: '11px', color: '#9ca3af', marginBottom: '12px' }}>
                    {typeof template.items === 'string'
                      ? JSON.parse(template.items).length
                      : template.items.length} items
                    {template.discount_percent > 0 && ` • ${template.discount_percent}% discount`}
                  </div>
                  <div style={{ display: 'flex', gap: '8px' }}>
                    <button
                      onClick={() => loadTemplate(template)}
                      style={{
                        flex: 1,
                        padding: '8px 12px',
                        background: '#8b5cf6',
                        color: 'white',
                        border: 'none',
                        borderRadius: '6px',
                        fontSize: '12px',
                        fontWeight: 'bold',
                        cursor: 'pointer'
                      }}
                    >
                      Load
                    </button>
                    <button
                      onClick={() => deleteTemplate(template.id, template.name)}
                      style={{
                        padding: '8px 12px',
                        background: '#ef4444',
                        color: 'white',
                        border: 'none',
                        borderRadius: '6px',
                        fontSize: '12px',
                        cursor: 'pointer'
                      }}
                    >
                      🗑️
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Product Selection */}
        <div style={{
          background: 'white',
          padding: '24px',
          borderRadius: '12px',
          marginBottom: '24px',
          boxShadow: '0 1px 3px rgba(0,0,0,0.1)'
        }}>
          <h3 style={{ fontSize: '18px', fontWeight: 'bold', marginBottom: '16px' }}>
            2. Add Products
          </h3>

          {/* Product Tabs */}
          <div style={{ display: 'flex', gap: '8px', marginBottom: '16px', borderBottom: '2px solid #e5e7eb' }}>
            <button
              onClick={() => setProductTab('search')}
              style={{
                padding: '8px 16px',
                background: productTab === 'search' ? '#3b82f6' : 'transparent',
                color: productTab === 'search' ? 'white' : '#6b7280',
                border: 'none',
                borderRadius: '8px 8px 0 0',
                fontSize: '14px',
                fontWeight: 'bold',
                cursor: 'pointer',
                marginBottom: '-2px'
              }}
            >
              🔍 Search
            </button>
            <button
              onClick={() => setProductTab('favorites')}
              style={{
                padding: '8px 16px',
                background: productTab === 'favorites' ? '#3b82f6' : 'transparent',
                color: productTab === 'favorites' ? 'white' : '#6b7280',
                border: 'none',
                borderRadius: '8px 8px 0 0',
                fontSize: '14px',
                fontWeight: 'bold',
                cursor: 'pointer',
                marginBottom: '-2px'
              }}
            >
              ⭐ Favorites ({favoriteProducts ? favoriteProducts.length : 0})
            </button>
            <button
              onClick={() => setProductTab('recent')}
              style={{
                padding: '8px 16px',
                background: productTab === 'recent' ? '#3b82f6' : 'transparent',
                color: productTab === 'recent' ? 'white' : '#6b7280',
                border: 'none',
                borderRadius: '8px 8px 0 0',
                fontSize: '14px',
                fontWeight: 'bold',
                cursor: 'pointer',
                marginBottom: '-2px'
              }}
            >
              🕐 Recent ({recentProducts.length})
            </button>
          </div>

          {/* Search Tab */}
          {productTab === 'search' && (
            <>
              <input
                type="text"
                placeholder="Search products by SKU, model, or manufacturer..."
                value={productSearchTerm}
                onChange={(e) => setProductSearchTerm(e.target.value)}
                style={{
                  width: '100%',
                  padding: '12px',
                  border: '1px solid #d1d5db',
                  borderRadius: '8px',
                  fontSize: '14px',
                  marginBottom: '16px'
                }}
              />
            </>
          )}
          
          {/* Product Results - Search Tab */}
          {productTab === 'search' && productSearchTerm && (
            <div style={{
              maxHeight: '300px',
              overflowY: 'auto',
              border: '1px solid #d1d5db',
              borderRadius: '8px',
              marginBottom: '16px'
            }}>
              {filteredProducts.slice(0, 10).map(product => {
                const isFavorite = favoriteProducts && favoriteProducts.some(p => p.id === product.id);
                return (
                  <div
                    key={product.id}
                    style={{
                      padding: '12px',
                      borderBottom: '1px solid #e5e7eb',
                      display: 'flex',
                      justifyContent: 'space-between',
                      alignItems: 'center'
                    }}
                    onMouseEnter={(e) => e.currentTarget.style.background = '#f9fafb'}
                    onMouseLeave={(e) => e.currentTarget.style.background = 'white'}
                  >
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        toggleFavorite(product.id);
                      }}
                      style={{
                        background: 'none',
                        border: 'none',
                        fontSize: '20px',
                        cursor: 'pointer',
                        marginRight: '8px'
                      }}
                    >
                      {isFavorite ? '⭐' : '☆'}
                    </button>
                    <div style={{ flex: 1, cursor: 'pointer' }} onClick={() => addProductToQuote(product)}>
                      <div style={{ fontWeight: 'bold', marginBottom: '4px' }}>
                        {product.manufacturer} - {product.model}
                      </div>
                      <div style={{ fontSize: '12px', color: '#6b7280' }}>
                        SKU: {product.sku || product.model} • {product.category}
                      </div>
                    </div>
                    <div style={{ textAlign: 'right', marginRight: '16px' }}>
                      <div style={{ fontWeight: 'bold' }}>
                        ${(product.msrp_cents / 100).toFixed(2)}
                      </div>
                      <div style={{ fontSize: '12px', color: '#6b7280' }}>
                        Cost: ${(product.cost_cents / 100).toFixed(2)}
                      </div>
                    </div>
                    <button
                      onClick={() => addProductToQuote(product)}
                      style={{
                        padding: '6px 12px',
                        background: '#3b82f6',
                        color: 'white',
                        border: 'none',
                        borderRadius: '6px',
                        fontSize: '12px',
                        cursor: 'pointer'
                      }}
                    >
                      Add
                    </button>
                  </div>
                );
              })}
            </div>
          )}

          {/* Favorites Tab */}
          {productTab === 'favorites' && (
            <div style={{
              maxHeight: '300px',
              overflowY: 'auto',
              border: '1px solid #d1d5db',
              borderRadius: '8px',
              marginBottom: '16px'
            }}>
              {!favoriteProducts || favoriteProducts.length === 0 ? (
                <div style={{ padding: '48px', textAlign: 'center', color: '#6b7280' }}>
                  No favorite products yet. Click the ☆ icon to add favorites!
                </div>
              ) : (
                favoriteProducts.map(product => (
                  <div
                    key={product.id}
                    style={{
                      padding: '12px',
                      borderBottom: '1px solid #e5e7eb',
                      display: 'flex',
                      justifyContent: 'space-between',
                      alignItems: 'center'
                    }}
                    onMouseEnter={(e) => e.currentTarget.style.background = '#f9fafb'}
                    onMouseLeave={(e) => e.currentTarget.style.background = 'white'}
                  >
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        toggleFavorite(product.id);
                      }}
                      style={{
                        background: 'none',
                        border: 'none',
                        fontSize: '20px',
                        cursor: 'pointer',
                        marginRight: '8px'
                      }}
                    >
                      ⭐
                    </button>
                    <div style={{ flex: 1, cursor: 'pointer' }} onClick={() => addProductToQuote(product)}>
                      <div style={{ fontWeight: 'bold', marginBottom: '4px' }}>
                        {product.manufacturer} - {product.model}
                      </div>
                      <div style={{ fontSize: '12px', color: '#6b7280' }}>
                        SKU: {product.sku || product.model} • {product.category}
                      </div>
                    </div>
                    <div style={{ textAlign: 'right', marginRight: '16px' }}>
                      <div style={{ fontWeight: 'bold' }}>
                        ${(product.msrp_cents / 100).toFixed(2)}
                      </div>
                      <div style={{ fontSize: '12px', color: '#6b7280' }}>
                        Cost: ${(product.cost_cents / 100).toFixed(2)}
                      </div>
                    </div>
                    <button
                      onClick={() => addProductToQuote(product)}
                      style={{
                        padding: '6px 12px',
                        background: '#3b82f6',
                        color: 'white',
                        border: 'none',
                        borderRadius: '6px',
                        fontSize: '12px',
                        cursor: 'pointer'
                      }}
                    >
                      Add
                    </button>
                  </div>
                ))
              )}
            </div>
          )}

          {/* Recent Tab */}
          {productTab === 'recent' && (
            <div style={{
              maxHeight: '300px',
              overflowY: 'auto',
              border: '1px solid #d1d5db',
              borderRadius: '8px',
              marginBottom: '16px'
            }}>
              {recentProducts.length === 0 ? (
                <div style={{ padding: '48px', textAlign: 'center', color: '#6b7280' }}>
                  No recently used products yet. Start creating quotes!
                </div>
              ) : (
                recentProducts.map(product => {
                  const isFavorite = favoriteProducts && favoriteProducts.some(p => p.id === product.id);
                  return (
                    <div
                      key={product.id}
                      style={{
                        padding: '12px',
                        borderBottom: '1px solid #e5e7eb',
                        display: 'flex',
                        justifyContent: 'space-between',
                        alignItems: 'center'
                      }}
                      onMouseEnter={(e) => e.currentTarget.style.background = '#f9fafb'}
                      onMouseLeave={(e) => e.currentTarget.style.background = 'white'}
                    >
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          toggleFavorite(product.id);
                        }}
                        style={{
                          background: 'none',
                          border: 'none',
                          fontSize: '20px',
                          cursor: 'pointer',
                          marginRight: '8px'
                        }}
                      >
                        {isFavorite ? '⭐' : '☆'}
                      </button>
                      <div style={{ flex: 1, cursor: 'pointer' }} onClick={() => addProductToQuote(product)}>
                        <div style={{ fontWeight: 'bold', marginBottom: '4px' }}>
                          {product.manufacturer} - {product.model}
                        </div>
                        <div style={{ fontSize: '12px', color: '#6b7280' }}>
                          SKU: {product.sku || product.model} • {product.category}
                        </div>
                      </div>
                      <div style={{ textAlign: 'right', marginRight: '16px' }}>
                        <div style={{ fontWeight: 'bold' }}>
                          ${(product.msrp_cents / 100).toFixed(2)}
                        </div>
                        <div style={{ fontSize: '12px', color: '#6b7280' }}>
                          Cost: ${(product.cost_cents / 100).toFixed(2)}
                        </div>
                      </div>
                      <button
                        onClick={() => addProductToQuote(product)}
                        style={{
                          padding: '6px 12px',
                          background: '#3b82f6',
                          color: 'white',
                          border: 'none',
                          borderRadius: '6px',
                          fontSize: '12px',
                          cursor: 'pointer'
                        }}
                      >
                        Add
                      </button>
                    </div>
                  );
                })
              )}
            </div>
          )}
          
          {/* Service Items Quick Add */}
          <div style={{ marginTop: '16px' }}>
            <h4 style={{ fontSize: '14px', fontWeight: 'bold', marginBottom: '12px' }}>
              Quick Add Services:
            </h4>
            <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
              {SERVICE_ITEMS.map(service => (
                <button
                  key={service.sku}
                  onClick={() => addServiceItem(service)}
                  style={{
                    padding: '8px 16px',
                    background: '#f0f9ff',
                    color: '#3b82f6',
                    border: '1px solid #3b82f6',
                    borderRadius: '6px',
                    fontSize: '12px',
                    cursor: 'pointer',
                    fontWeight: 'bold'
                  }}
                >
                  + {service.name}
                </button>
              ))}
            </div>
          </div>
        </div>
        
        {/* Quote Items */}
        {quoteItems.length === 0 && selectedCustomer && (
          <div style={{
            background: 'white',
            padding: '24px',
            borderRadius: '12px',
            marginBottom: '24px',
            boxShadow: '0 1px 3px rgba(0,0,0,0.1)'
          }}>
            <h3 style={{ fontSize: '18px', fontWeight: 'bold', marginBottom: '16px' }}>
              3. Quote Items <span style={{ color: '#ef4444' }}>*</span>
            </h3>
            <div style={{
              padding: '12px 16px',
              background: '#fef2f2',
              border: '1px solid #fecaca',
              borderRadius: '6px',
              color: '#991b1b',
              fontSize: '14px',
              fontWeight: '600'
            }}>
              ⚠️ Please add at least one item to the quote
            </div>
          </div>
        )}

        {quoteItems.length > 0 && (
          <div style={{
            background: 'white',
            padding: '24px',
            borderRadius: '12px',
            marginBottom: '24px',
            boxShadow: '0 1px 3px rgba(0,0,0,0.1)'
          }}>
            <h3 style={{ fontSize: '18px', fontWeight: 'bold', marginBottom: '16px' }}>
              3. Quote Items
            </h3>
            
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr style={{ background: '#f9fafb', borderBottom: '2px solid #e5e7eb' }}>
                  <th style={{ padding: '12px', textAlign: 'left', fontWeight: 'bold' }}>Item</th>
                  <th style={{ padding: '12px', textAlign: 'center', fontWeight: 'bold', width: '80px' }}>Qty</th>
                  <th style={{ padding: '12px', textAlign: 'right', fontWeight: 'bold', width: '100px' }}>Cost</th>
                  <th style={{ padding: '12px', textAlign: 'right', fontWeight: 'bold', width: '100px' }}>MSRP</th>
                  <th style={{ padding: '12px', textAlign: 'right', fontWeight: 'bold', width: '100px' }}>Sell</th>
                  <th style={{ padding: '12px', textAlign: 'right', fontWeight: 'bold', width: '80px' }}>Margin</th>
                  <th style={{ padding: '12px', textAlign: 'right', fontWeight: 'bold', width: '100px' }}>Total</th>
                  <th style={{ padding: '12px', textAlign: 'center', fontWeight: 'bold', width: '60px' }}>-</th>
                </tr>
              </thead>
              <tbody>
                {quoteItems.map((item, idx) => {
                  const lineTotal = item.sell * item.quantity;
                  const margin = calculateMargin(item.sell, item.cost);
                  const isPriceBelowCost = item.sell < item.cost;
                  const isLowMargin = margin < 5;
                  const hasWarning = isPriceBelowCost || isLowMargin;

                  return (
                    <React.Fragment key={idx}>
                      <tr style={{ borderBottom: hasWarning ? '0' : '1px solid #e5e7eb' }}>
                        <td style={{ padding: '12px' }}>
                          <div style={{ fontWeight: 'bold' }}>
                            {item.manufacturer} - {item.model}
                          </div>
                          <div style={{ fontSize: '12px', color: '#6b7280' }}>
                            SKU: {item.sku || item.model}
                          </div>
                        </td>
                      <td style={{ padding: '12px', textAlign: 'center' }}>
                        <input
                          type="number"
                          min="1"
                          value={item.quantity}
                          onChange={(e) => updateQuoteItem(idx, 'quantity', parseInt(e.target.value) || 1)}
                          style={{
                            width: '60px',
                            padding: '6px',
                            border: '1px solid #d1d5db',
                            borderRadius: '4px',
                            textAlign: 'center'
                          }}
                        />
                      </td>
                      <td style={{ padding: '12px', textAlign: 'right', color: '#6b7280' }}>
                        ${item.cost.toFixed(2)}
                      </td>
                      <td style={{ padding: '12px', textAlign: 'right', color: '#6b7280' }}>
                        ${item.msrp.toFixed(2)}
                      </td>
                      <td style={{ padding: '12px', textAlign: 'right' }}>
                        <input
                          type="number"
                          min="0"
                          step="0.01"
                          value={item.sell}
                          onChange={(e) => updateQuoteItem(idx, 'sell', parseFloat(e.target.value) || 0)}
                          style={{
                            width: '100px',
                            padding: '6px',
                            border: '1px solid #d1d5db',
                            borderRadius: '4px',
                            textAlign: 'right'
                          }}
                        />
                      </td>
                      <td style={{ 
                        padding: '12px', 
                        textAlign: 'right',
                        fontWeight: 'bold',
                        color: margin >= 20 ? '#10b981' : margin >= 10 ? '#f59e0b' : '#ef4444'
                      }}>
                        {margin.toFixed(1)}%
                      </td>
                      <td style={{ padding: '12px', textAlign: 'right', fontWeight: 'bold' }}>
                        ${lineTotal.toFixed(2)}
                      </td>
                      <td style={{ padding: '12px', textAlign: 'center' }}>
                        <button
                          onClick={() => removeQuoteItem(idx)}
                          style={{
                            padding: '4px 8px',
                            background: '#ef4444',
                            color: 'white',
                            border: 'none',
                            borderRadius: '4px',
                            cursor: 'pointer'
                          }}
                        >
                          ×
                        </button>
                      </td>
                    </tr>

                    {/* Inline Validation Warnings */}
                    {hasWarning && (
                      <tr style={{ borderBottom: '1px solid #e5e7eb' }}>
                        <td colSpan="8" style={{ padding: '8px 12px', background: '#fef2f2' }}>
                          <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap' }}>
                            {isPriceBelowCost && (
                              <div style={{
                                padding: '4px 12px',
                                background: '#fee2e2',
                                border: '1px solid #fecaca',
                                borderRadius: '6px',
                                color: '#991b1b',
                                fontSize: '13px',
                                fontWeight: '600'
                              }}>
                                ⚠️ Price (${item.sell.toFixed(2)}) is below cost (${item.cost.toFixed(2)})
                              </div>
                            )}
                            {isLowMargin && !isPriceBelowCost && (
                              <div style={{
                                padding: '4px 12px',
                                background: '#fef3c7',
                                border: '1px solid #fde047',
                                borderRadius: '6px',
                                color: '#92400e',
                                fontSize: '13px',
                                fontWeight: '600'
                              }}>
                                ⚠️ Low margin: {margin.toFixed(1)}% (below 5%)
                              </div>
                            )}
                          </div>
                        </td>
                      </tr>
                    )}
                    </React.Fragment>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}

        {/* Smart Suggestions Banner */}
        {smartSuggestions && showSuggestions && view === 'builder' && (
          <div style={{
            background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
            padding: '20px',
            borderRadius: '8px',
            marginTop: '20px',
            marginBottom: '20px',
            color: 'white'
          }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '15px' }}>
              <h3 style={{ margin: 0, fontSize: '18px' }}>💡 Smart Suggestions</h3>
              <button
                onClick={() => setShowSuggestions(false)}
                style={{
                  background: 'rgba(255,255,255,0.2)',
                  border: 'none',
                  color: 'white',
                  padding: '5px 15px',
                  borderRadius: '5px',
                  cursor: 'pointer'
                }}
              >
                Dismiss
              </button>
            </div>

            {getSuggestionsSummary(smartSuggestions, calculateQuoteTotals.total).messages.map((msg, idx) => (
              <div key={idx} style={{ marginBottom: '8px', fontSize: '14px' }}>{msg}</div>
            ))}

            <button
              onClick={() => setShowRevenueFeatures(true)}
              style={{
                background: 'white',
                color: '#667eea',
                border: 'none',
                padding: '10px 20px',
                borderRadius: '5px',
                cursor: 'pointer',
                fontWeight: 'bold',
                marginTop: '10px'
              }}
            >
              View Suggestions
            </button>
          </div>
        )}

        {/* ============================================ */}
        {/* REVENUE FEATURES SECTION */}
        {/* ============================================ */}
        {quoteItems.length > 0 && (
          <div style={{
            marginTop: '30px',
            padding: '20px',
            backgroundColor: '#f8f9fa',
            borderRadius: '8px',
            border: '2px solid #4CAF50'
          }}>
            <div style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              marginBottom: '20px'
            }}>
              <h3 style={{ margin: 0, color: '#4CAF50' }}>
                Revenue Features - Maximize Your Sale!
              </h3>
              <button
                onClick={() => setShowRevenueFeatures(!showRevenueFeatures)}
                style={{
                  padding: '10px 20px',
                  backgroundColor: '#4CAF50',
                  color: 'white',
                  border: 'none',
                  borderRadius: '4px',
                  cursor: 'pointer',
                  fontWeight: 'bold'
                }}
              >
                {showRevenueFeatures ? 'Hide Revenue Features' : 'Show Revenue Features'}
              </button>
            </div>

            {showRevenueFeatures && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>

                {/* Financing Calculator */}
                <FinancingCalculator
                  quoteTotal={calculateQuoteTotals.total * 100}
                  onFinancingSelected={(financing) => {
                    setQuoteFinancing(financing);
                    logger.log('Financing selected:', financing);
                  }}
                />

                {/* Warranty Selector */}
                <WarrantySelector
                  products={quoteItems}
                  onWarrantyAdded={(warranty) => {
                    setQuoteWarranties([...quoteWarranties, warranty]);
                    logger.log('Warranty added:', warranty);
                  }}
                />

                {/* Delivery Selector */}
                <DeliverySelector
                  customerAddress={selectedCustomer ?
                    `${selectedCustomer.address}, ${selectedCustomer.city}` :
                    'Customer address'
                  }
                  onDeliverySelected={(delivery) => {
                    setQuoteDelivery(delivery);
                    logger.log('Delivery selected:', delivery);
                  }}
                />

                {/* Rebates Display */}
                <RebatesDisplay
                  products={quoteItems}
                  onRebateApplied={(rebates) => {
                    setQuoteRebates(rebates);
                    logger.log('Rebates applied:', rebates);
                  }}
                />

                {/* Trade-In Estimator */}
                <TradeInEstimator
                  onTradeInAdded={(tradeIn) => {
                    setQuoteTradeIns([...quoteTradeIns, tradeIn]);
                    logger.log('Trade-in added:', tradeIn);
                  }}
                />

                {/* Summary of Applied Features */}
                {(quoteFinancing || quoteWarranties.length > 0 || quoteDelivery ||
                  quoteRebates.length > 0 || quoteTradeIns.length > 0) && (
                  <div style={{
                    backgroundColor: '#e8f5e9',
                    padding: '20px',
                    borderRadius: '8px',
                    marginTop: '20px'
                  }}>
                    <h4 style={{ marginTop: 0 }}>Applied Revenue Features:</h4>

                    {quoteFinancing && (
                      <div style={{ marginBottom: '10px' }}>
                        <span style={{ fontWeight: 'bold' }}>Financing:</span> {quoteFinancing.plan.plan_name} -
                        ${(quoteFinancing.calculation.monthlyPaymentCents / 100).toFixed(2)}/month
                      </div>
                    )}

                    {quoteWarranties.length > 0 && (
                      <div style={{ marginBottom: '10px' }}>
                        <span style={{ fontWeight: 'bold' }}>Warranties:</span> {quoteWarranties.length} warranty plans added
                        (${quoteWarranties.reduce((sum, w) => sum + (w.cost / 100), 0).toFixed(2)})
                      </div>
                    )}

                    {quoteDelivery && (
                      <div style={{ marginBottom: '10px' }}>
                        <span style={{ fontWeight: 'bold' }}>Delivery:</span> {quoteDelivery.service.service_name} -
                        ${(quoteDelivery.calculation.totalCents / 100).toFixed(2)}
                      </div>
                    )}

                    {quoteRebates.length > 0 && (
                      <div style={{ marginBottom: '10px' }}>
                        <span style={{ fontWeight: 'bold' }}>Rebates:</span> {quoteRebates.length} rebates applied
                      </div>
                    )}

                    {quoteTradeIns.length > 0 && (
                      <div style={{ marginBottom: '10px' }}>
                        <span style={{ fontWeight: 'bold' }}>Trade-Ins:</span> {quoteTradeIns.length} trade-ins -
                        Credit: ${quoteTradeIns.reduce((sum, t) => sum + (t.estimatedValueCents / 100), 0).toFixed(2)}
                      </div>
                    )}

                    <button
                      onClick={() => {
                        setQuoteFinancing(null);
                        setQuoteWarranties([]);
                        setQuoteDelivery(null);
                        setQuoteRebates([]);
                        setQuoteTradeIns([]);
                      }}
                      style={{
                        marginTop: '10px',
                        padding: '8px 16px',
                        backgroundColor: '#f44336',
                        color: 'white',
                        border: 'none',
                        borderRadius: '4px',
                        cursor: 'pointer'
                      }}
                    >
                      Clear All Revenue Features
                    </button>
                  </div>
                )}
              </div>
            )}
          </div>
        )}

        {/* Totals & Summary */}
        {quoteItems.length > 0 && (
          <div style={{
            background: 'white',
            padding: '24px',
            borderRadius: '12px',
            marginBottom: '24px',
            boxShadow: '0 1px 3px rgba(0,0,0,0.1)'
          }}>
            <h3 style={{ fontSize: '18px', fontWeight: 'bold', marginBottom: '16px' }}>
              4. Quote Summary
            </h3>
            
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '24px' }}>
              {/* Left: Notes & Discount */}
              <div>
                <div style={{ marginBottom: '16px' }}>
                  <label style={{ display: 'block', fontWeight: 'bold', marginBottom: '8px' }}>
                    Discount %:
                  </label>
                  <input
                    type="number"
                    min="0"
                    max="100"
                    step="0.1"
                    value={discountPercent}
                    onChange={(e) => setDiscountPercent(parseFloat(e.target.value) || 0)}
                    style={{
                      width: '100%',
                      padding: '12px',
                      border: '1px solid #d1d5db',
                      borderRadius: '8px'
                    }}
                  />
                </div>
                
                <div style={{ marginBottom: '16px' }}>
                  <label style={{ display: 'block', fontWeight: 'bold', marginBottom: '8px' }}>
                    Customer Notes (Visible on Quote):
                  </label>
                  <textarea
                    value={notes}
                    onChange={(e) => setNotes(e.target.value)}
                    rows="3"
                    placeholder="Add notes that will be visible to the customer..."
                    style={{
                      width: '100%',
                      padding: '12px',
                      border: '1px solid #d1d5db',
                      borderRadius: '8px',
                      resize: 'vertical'
                    }}
                  />
                </div>

                <div style={{ marginBottom: '16px' }}>
                  <label style={{ display: 'block', fontWeight: 'bold', marginBottom: '8px' }}>
                    🔒 Internal Notes (Private):
                  </label>
                  <textarea
                    value={internalNotes}
                    onChange={(e) => setInternalNotes(e.target.value)}
                    rows="3"
                    placeholder="Add internal notes (NOT visible to customer)..."
                    style={{
                      width: '100%',
                      padding: '12px',
                      border: '2px solid #fee2e2',
                      borderRadius: '8px',
                      resize: 'vertical',
                      background: '#fef2f2'
                    }}
                  />
                </div>

                <div>
                  <label style={{ display: 'block', fontWeight: 'bold', marginBottom: '8px' }}>
                    Payment Terms:
                  </label>
                  <select
                    onChange={(e) => {
                      if (e.target.value) {
                        const template = paymentTermsTemplates.find(t => t.id === parseInt(e.target.value));
                        if (template) setTerms(template.terms_text);
                      }
                    }}
                    style={{
                      width: '100%',
                      padding: '12px',
                      border: '1px solid #d1d5db',
                      borderRadius: '8px',
                      marginBottom: '12px',
                      fontSize: '14px'
                    }}
                  >
                    <option value="">Select a template...</option>
                    {paymentTermsTemplates && paymentTermsTemplates.map(template => (
                      <option key={template.id} value={template.id}>
                        {template.name} {template.is_default && '(Default)'}
                      </option>
                    ))}
                  </select>
                  <textarea
                    value={terms}
                    onChange={(e) => setTerms(e.target.value)}
                    rows="3"
                    placeholder="Or enter custom terms..."
                    style={{
                      width: '100%',
                      padding: '12px',
                      border: '1px solid #d1d5db',
                      borderRadius: '8px',
                      resize: 'vertical'
                    }}
                  />
                </div>
              </div>
              
              {/* Right: Totals */}
              <div style={{
                padding: '24px',
                background: '#f9fafb',
                borderRadius: '8px',
                border: '2px solid #e5e7eb'
              }}>
                <div style={{ marginBottom: '12px', display: 'flex', justifyContent: 'space-between' }}>
                  <span>Products Subtotal:</span>
                  <span style={{ fontWeight: 'bold' }}>${totals.subtotal.toFixed(2)}</span>
                </div>

                {discountPercent > 0 && (
                  <div style={{ marginBottom: '12px', display: 'flex', justifyContent: 'space-between', color: '#ef4444' }}>
                    <span>Discount ({discountPercent}%):</span>
                    <span style={{ fontWeight: 'bold' }}>-${totals.discount.toFixed(2)}</span>
                  </div>
                )}

                {totals.deliveryCost > 0 && (
                  <div style={{ marginBottom: '12px', display: 'flex', justifyContent: 'space-between', color: '#4CAF50' }}>
                    <span>Delivery & Installation:</span>
                    <span style={{ fontWeight: 'bold' }}>+${totals.deliveryCost.toFixed(2)}</span>
                  </div>
                )}

                {totals.warrantiesCost > 0 && (
                  <div style={{ marginBottom: '12px', display: 'flex', justifyContent: 'space-between', color: '#4CAF50' }}>
                    <span>Extended Warranties:</span>
                    <span style={{ fontWeight: 'bold' }}>+${totals.warrantiesCost.toFixed(2)}</span>
                  </div>
                )}

                {totals.tradeInCredit > 0 && (
                  <div style={{ marginBottom: '12px', display: 'flex', justifyContent: 'space-between', color: '#2196F3' }}>
                    <span>Trade-In Credit:</span>
                    <span style={{ fontWeight: 'bold' }}>-${totals.tradeInCredit.toFixed(2)}</span>
                  </div>
                )}

                {totals.rebateCredit > 0 && (
                  <div style={{ marginBottom: '12px', display: 'flex', justifyContent: 'space-between', color: '#2196F3' }}>
                    <span>Manufacturer Rebates:</span>
                    <span style={{ fontWeight: 'bold' }}>-${totals.rebateCredit.toFixed(2)}</span>
                  </div>
                )}

                <div style={{
                  borderTop: '2px solid #ddd',
                  marginTop: '10px',
                  paddingTop: '10px',
                  marginBottom: '12px',
                  display: 'flex',
                  justifyContent: 'space-between'
                }}>
                  <span>Subtotal after add-ons:</span>
                  <span style={{ fontWeight: 'bold' }}>${totals.afterAddOns.toFixed(2)}</span>
                </div>

                <div style={{ marginBottom: '12px', display: 'flex', justifyContent: 'space-between' }}>
                  <span>HST (13%):</span>
                  <span style={{ fontWeight: 'bold' }}>${totals.tax.toFixed(2)}</span>
                </div>

                <div style={{
                  paddingTop: '12px',
                  marginTop: '12px',
                  borderTop: '2px solid #333',
                  display: 'flex',
                  justifyContent: 'space-between',
                  fontSize: '20px'
                }}>
                  <span style={{ fontWeight: 'bold' }}>TOTAL:</span>
                  <span style={{ fontWeight: 'bold', color: '#3b82f6' }}>${totals.total.toFixed(2)}</span>
                </div>

                {totals.financing && (
                  <div style={{
                    marginTop: '15px',
                    padding: '10px',
                    backgroundColor: '#e3f2fd',
                    borderRadius: '4px',
                    textAlign: 'center'
                  }}>
                    <div style={{ fontSize: '14px', color: '#666' }}>Or as low as:</div>
                    <div style={{ fontSize: '20px', fontWeight: 'bold', color: '#2196F3' }}>
                      ${(totals.financing.calculation.monthlyPaymentCents / 100).toFixed(2)}/month
                    </div>
                    <div style={{ fontSize: '12px', color: '#666' }}>
                      {totals.financing.plan.plan_name}
                    </div>
                  </div>
                )}
                
                <div style={{ 
                  marginTop: '16px',
                  paddingTop: '16px',
                  borderTop: '1px solid #d1d5db'
                }}>
                  <div style={{ marginBottom: '8px', display: 'flex', justifyContent: 'space-between', color: '#10b981' }}>
                    <span>Gross Profit:</span>
                    <span style={{ fontWeight: 'bold' }}>${totals.profit.toFixed(2)}</span>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                    <span>Profit Margin:</span>
                    <span style={{
                      fontWeight: 'bold',
                      color: totals.profitMargin >= 20 ? '#10b981' : totals.profitMargin >= 10 ? '#f59e0b' : '#ef4444'
                    }}>
                      {totals.profitMargin.toFixed(1)}%
                    </span>
                  </div>

                  {/* Overall Validation Warning */}
                  {totals.profitMargin < 5 && (
                    <div style={{
                      marginTop: '12px',
                      padding: '8px 12px',
                      background: '#fef2f2',
                      border: '1px solid #fecaca',
                      borderRadius: '6px',
                      color: '#991b1b',
                      fontSize: '13px',
                      fontWeight: '600'
                    }}>
                      ⚠️ Overall margin is very low ({totals.profitMargin.toFixed(1)}%)
                    </div>
                  )}
                </div>
              </div>
            </div>

            {/* QUOTE PROTECTION SETTINGS */}
            <div style={{
              background: 'white',
              borderRadius: '12px',
              padding: '24px',
              marginTop: '24px',
              boxShadow: '0 2px 4px rgba(0,0,0,0.1)'
            }}>
              <h3 style={{
                fontSize: '18px',
                fontWeight: 'bold',
                marginBottom: '16px',
                display: 'flex',
                alignItems: 'center',
                gap: '8px'
              }}>
                🔒 Quote Protection Settings
              </h3>

              <div style={{ display: 'grid', gap: '16px' }}>
                {/* Hide Model Numbers */}
                <label style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '12px',
                  cursor: 'pointer',
                  padding: '12px',
                  background: '#f9fafb',
                  borderRadius: '8px'
                }}>
                  <input
                    type="checkbox"
                    checked={hideModelNumbers}
                    onChange={(e) => setHideModelNumbers(e.target.checked)}
                    style={{ width: '20px', height: '20px', cursor: 'pointer' }}
                  />
                  <div>
                    <div style={{ fontWeight: '600', fontSize: '14px' }}>
                      Hide Model Numbers (Customer-Facing Quote)
                    </div>
                    <div style={{ fontSize: '12px', color: '#6b7280' }}>
                      Protects pricing from competitors. Shows only product descriptions.
                    </div>
                  </div>
                </label>

                {/* Watermark Settings */}
                <div style={{
                  padding: '12px',
                  background: '#f9fafb',
                  borderRadius: '8px'
                }}>
                  <label style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '8px' }}>
                    <input
                      type="checkbox"
                      checked={watermarkEnabled}
                      onChange={(e) => setWatermarkEnabled(e.target.checked)}
                      style={{ width: '20px', height: '20px', cursor: 'pointer' }}
                    />
                    <span style={{ fontWeight: '600', fontSize: '14px' }}>
                      Enable PDF Watermark
                    </span>
                  </label>

                  {watermarkEnabled && (
                    <div style={{ marginLeft: '32px' }}>
                      <label style={{ fontSize: '12px', color: '#6b7280', display: 'block', marginBottom: '4px' }}>
                        Watermark Text:
                      </label>
                      <input
                        type="text"
                        value={watermarkText}
                        onChange={(e) => setWatermarkText(e.target.value)}
                        placeholder="CONFIDENTIAL - FOR {CUSTOMER} ONLY"
                        style={{
                          width: '100%',
                          padding: '8px 12px',
                          border: '1px solid #d1d5db',
                          borderRadius: '6px',
                          fontSize: '14px'
                        }}
                      />
                      <div style={{ fontSize: '11px', color: '#9ca3af', marginTop: '4px' }}>
                        Use {"{CUSTOMER}"} for customer name placeholder
                      </div>
                    </div>
                  )}
                </div>

                {/* Quote Expiry Date */}
                <div style={{
                  padding: '12px',
                  background: '#f9fafb',
                  borderRadius: '8px'
                }}>
                  <label style={{ fontSize: '14px', fontWeight: '600', display: 'block', marginBottom: '8px' }}>
                    Quote Expires:
                  </label>
                  <input
                    type="date"
                    value={quoteExpiryDate}
                    onChange={(e) => setQuoteExpiryDate(e.target.value)}
                    min={new Date().toISOString().split('T')[0]}
                    style={{
                      padding: '8px 12px',
                      border: '1px solid #d1d5db',
                      borderRadius: '6px',
                      fontSize: '14px'
                    }}
                  />
                  <div style={{ fontSize: '11px', color: '#9ca3af', marginTop: '4px' }}>
                    Default: 14 days from creation
                  </div>
                </div>
              </div>
            </div>

            {/* Save Button */}
            <div style={{ marginTop: '24px', textAlign: 'center', display: 'flex', gap: '16px', justifyContent: 'center' }}>
              <button
                onClick={saveQuote}
                disabled={!selectedCustomer || quoteItems.length === 0}
                style={{
                  padding: '16px 48px',
                  background: (!selectedCustomer || quoteItems.length === 0) ? '#9ca3af' : '#10b981',
                  color: 'white',
                  border: 'none',
                  borderRadius: '8px',
                  fontSize: '18px',
                  fontWeight: 'bold',
                  cursor: (!selectedCustomer || quoteItems.length === 0) ? 'not-allowed' : 'pointer'
                }}
              >
                {editingQuoteId ? '✅ Update Quote' : '💾 Save Quote'}
              </button>

              <button
                onClick={() => setShowTemplateSaveDialog(true)}
                disabled={quoteItems.length === 0}
                style={{
                  padding: '16px 48px',
                  background: quoteItems.length === 0 ? '#9ca3af' : '#8b5cf6',
                  color: 'white',
                  border: 'none',
                  borderRadius: '8px',
                  fontSize: '18px',
                  fontWeight: 'bold',
                  cursor: quoteItems.length === 0 ? 'not-allowed' : 'pointer'
                }}
              >
                📋 Save as Template
              </button>
            </div>
          </div>
        )}

        {/* Template Save Dialog */}
        {showTemplateSaveDialog && (
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
                📋 Save as Template
              </h3>

              <div style={{ marginBottom: '20px' }}>
                <label style={{ display: 'block', fontWeight: 'bold', marginBottom: '8px' }}>
                  Template Name <span style={{ color: '#ef4444' }}>*</span>
                </label>
                <input
                  type="text"
                  value={templateName}
                  onChange={(e) => setTemplateName(e.target.value)}
                  placeholder="e.g., Standard Kitchen Package, Office Setup..."
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

              <div style={{ marginBottom: '24px' }}>
                <label style={{ display: 'block', fontWeight: 'bold', marginBottom: '8px' }}>
                  Description (Optional)
                </label>
                <textarea
                  value={templateDescription}
                  onChange={(e) => setTemplateDescription(e.target.value)}
                  placeholder="Brief description of this template..."
                  rows="3"
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
                ℹ️ This will save the current items ({quoteItems.length}), discount ({discountPercent}%), notes, and terms as a reusable template.
              </div>

              <div style={{ display: 'flex', gap: '12px', justifyContent: 'flex-end' }}>
                <button
                  onClick={() => {
                    setShowTemplateSaveDialog(false);
                    setTemplateName('');
                    setTemplateDescription('');
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
                  onClick={saveAsTemplate}
                  disabled={!templateName.trim()}
                  style={{
                    padding: '12px 24px',
                    background: templateName.trim() ? '#8b5cf6' : '#9ca3af',
                    color: 'white',
                    border: 'none',
                    borderRadius: '8px',
                    fontSize: '16px',
                    fontWeight: 'bold',
                    cursor: templateName.trim() ? 'pointer' : 'not-allowed'
                  }}
                >
                  💾 Save Template
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    );
  };
  
  const renderViewerView = () => {
    if (!selectedQuote) return null;
    
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
            📄 Quote {selectedQuote.quote_number}
          </h1>

          <div style={{ display: 'flex', gap: '12px' }}>
            <button
              onClick={() => openEmailDialog(selectedQuote)}
              style={{
                padding: '12px 24px',
                background: '#10b981',
                color: 'white',
                border: 'none',
                borderRadius: '8px',
                fontSize: '16px',
                fontWeight: 'bold',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                gap: '8px'
              }}
            >
              📧 Send Email
            </button>

            {(selectedQuote.status === 'DRAFT' || selectedQuote.status === 'SENT') && (
              <button
                onClick={openApprovalDialog}
                disabled={quoteApprovals.some(a => a.status === 'PENDING')}
                style={{
                  padding: '12px 24px',
                  background: quoteApprovals.some(a => a.status === 'PENDING') ? '#9ca3af' : '#6366f1',
                  color: 'white',
                  border: 'none',
                  borderRadius: '8px',
                  fontSize: '16px',
                  fontWeight: 'bold',
                  cursor: quoteApprovals.some(a => a.status === 'PENDING') ? 'not-allowed' : 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '8px'
                }}
              >
                ✅ Request Approval
              </button>
            )}

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
        </div>
        
        {/* Quote Header Info */}
        <div style={{
          background: 'white',
          padding: '24px',
          borderRadius: '12px',
          marginBottom: '24px',
          boxShadow: '0 1px 3px rgba(0,0,0,0.1)'
        }}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '24px', marginBottom: '16px' }}>
            <div>
              <h3 style={{ fontSize: '18px', fontWeight: 'bold', marginBottom: '12px' }}>
                Customer Information
              </h3>
              <div style={{ color: '#6b7280' }}>
                <div style={{ marginBottom: '4px' }}>{selectedQuote.customer_name}</div>
                <div style={{ marginBottom: '4px' }}>{selectedQuote.customer_email}</div>
                <div>{selectedQuote.customer_phone}</div>
              </div>
            </div>
            
            <div>
              <h3 style={{ fontSize: '18px', fontWeight: 'bold', marginBottom: '12px' }}>
                Quote Information
              </h3>
              <div style={{ color: '#6b7280' }}>
                <div style={{ marginBottom: '4px' }}>
                  Date: {new Date(selectedQuote.created_at || selectedQuote.quote_date).toLocaleDateString()}
                </div>
                <div style={{ marginBottom: '4px' }}>
                  Valid Until: {new Date(selectedQuote.expires_at || selectedQuote.valid_until).toLocaleDateString()}
                </div>
                <div>
                  Status: <span style={{
                    padding: '2px 8px',
                    borderRadius: '8px',
                    fontSize: '12px',
                    fontWeight: 'bold',
                    background:
                      selectedQuote.status === 'DRAFT' ? '#e0e7ff' :
                      selectedQuote.status === 'SENT' ? '#dbeafe' :
                      selectedQuote.status === 'WON' ? '#d1fae5' :
                      selectedQuote.status === 'PENDING_APPROVAL' ? '#fef3c7' :
                      selectedQuote.status === 'APPROVED' ? '#d1fae5' :
                      selectedQuote.status === 'REJECTED' ? '#fee2e2' :
                      '#fee2e2',
                    color:
                      selectedQuote.status === 'DRAFT' ? '#3730a3' :
                      selectedQuote.status === 'SENT' ? '#1e40af' :
                      selectedQuote.status === 'WON' ? '#065f46' :
                      selectedQuote.status === 'PENDING_APPROVAL' ? '#92400e' :
                      selectedQuote.status === 'APPROVED' ? '#065f46' :
                      selectedQuote.status === 'REJECTED' ? '#991b1b' :
                      '#991b1b'
                  }}>
                    {selectedQuote.status}
                  </span>
                </div>
              </div>
            </div>
          </div>
        </div>
        
        {/* Quote Items */}
        <div style={{
          background: 'white',
          padding: '24px',
          borderRadius: '12px',
          marginBottom: '24px',
          boxShadow: '0 1px 3px rgba(0,0,0,0.1)'
        }}>
          <h3 style={{ fontSize: '18px', fontWeight: 'bold', marginBottom: '16px' }}>
            Items
          </h3>
          
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr style={{ background: '#f9fafb', borderBottom: '2px solid #e5e7eb' }}>
                <th style={{ padding: '12px', textAlign: 'left', fontWeight: 'bold' }}>Item</th>
                <th style={{ padding: '12px', textAlign: 'center', fontWeight: 'bold' }}>Qty</th>
                <th style={{ padding: '12px', textAlign: 'right', fontWeight: 'bold' }}>Unit Price</th>
                <th style={{ padding: '12px', textAlign: 'right', fontWeight: 'bold' }}>Total</th>
              </tr>
            </thead>
            <tbody>
              {selectedQuote.items?.map((item, idx) => (
                <tr key={idx} style={{ borderBottom: '1px solid #e5e7eb' }}>
                  <td style={{ padding: '12px' }}>
                    <div style={{ fontWeight: 'bold' }}>
                      {item.manufacturer} - {item.model}
                    </div>
                    <div style={{ fontSize: '12px', color: '#6b7280' }}>
                      SKU: {item.sku || item.model}
                    </div>
                    {item.description && (
                      <div style={{ fontSize: '12px', color: '#6b7280', marginTop: '4px' }}>
                        {item.description}
                      </div>
                    )}
                  </td>
                  <td style={{ padding: '12px', textAlign: 'center' }}>
                    {item.quantity}
                  </td>
                  <td style={{ padding: '12px', textAlign: 'right' }}>
                    ${((item.sell_cents || item.unit_price_cents || 0) / 100).toFixed(2)}
                  </td>
                  <td style={{ padding: '12px', textAlign: 'right', fontWeight: 'bold' }}>
                    ${((item.line_total_cents || 0) / 100).toFixed(2)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          
          {/* Totals */}
          <div style={{ 
            marginTop: '24px', 
            paddingTop: '24px', 
            borderTop: '2px solid #e5e7eb',
            textAlign: 'right'
          }}>
            <div style={{ marginBottom: '8px' }}>
              <span style={{ marginRight: '40px' }}>Subtotal:</span>
              <span style={{ fontWeight: 'bold' }}>${((selectedQuote.subtotal_cents || 0) / 100).toFixed(2)}</span>
            </div>
            {selectedQuote.discount_percent > 0 && (
              <div style={{ marginBottom: '8px', color: '#ef4444' }}>
                <span style={{ marginRight: '40px' }}>
                  Discount ({selectedQuote.discount_percent}%):
                </span>
                <span style={{ fontWeight: 'bold' }}>-${((selectedQuote.discount_cents || 0) / 100).toFixed(2)}</span>
              </div>
            )}
            <div style={{ marginBottom: '8px' }}>
              <span style={{ marginRight: '40px' }}>HST (13%):</span>
              <span style={{ fontWeight: 'bold' }}>${((selectedQuote.tax_cents || 0) / 100).toFixed(2)}</span>
            </div>
            <div style={{ 
              fontSize: '24px', 
              marginTop: '16px',
              paddingTop: '16px',
              borderTop: '2px solid #e5e7eb'
            }}>
              <span style={{ marginRight: '40px', fontWeight: 'bold' }}>TOTAL:</span>
              <span style={{ fontWeight: 'bold', color: '#3b82f6' }}>
                ${((selectedQuote.total_cents || 0) / 100).toFixed(2)}
              </span>
            </div>
            <div style={{ marginTop: '12px', fontSize: '14px', color: '#10b981' }}>
              <span style={{ marginRight: '40px' }}>Gross Profit:</span>
              <span style={{ fontWeight: 'bold' }}>
                ${((selectedQuote.gross_profit_cents || 0) / 100).toFixed(2)}
              </span>
            </div>
          </div>
        </div>

        {/* Revenue Features Section */}
        {(() => {
          let revenueFeatures = null;
          try {
            revenueFeatures = selectedQuote.revenue_features ?
              (typeof selectedQuote.revenue_features === 'string' ?
                JSON.parse(selectedQuote.revenue_features) :
                selectedQuote.revenue_features) :
              null;
          } catch (e) {
            logger.warn('Could not parse revenue_features:', e);
          }

          if (revenueFeatures && (revenueFeatures.delivery || revenueFeatures.warranties?.length > 0 ||
              revenueFeatures.financing || revenueFeatures.rebates?.length > 0 || revenueFeatures.tradeIns?.length > 0)) {
            return (
              <div style={{
                background: 'white',
                padding: '24px',
                borderRadius: '12px',
                marginBottom: '24px',
                boxShadow: '0 1px 3px rgba(0,0,0,0.1)',
                border: '2px solid #4CAF50'
              }}>
                <h3 style={{ fontSize: '18px', fontWeight: 'bold', marginBottom: '16px', color: '#4CAF50' }}>
                  Value-Added Services
                </h3>

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '20px' }}>
                  {/* Delivery & Installation */}
                  {revenueFeatures.delivery && revenueFeatures.delivery.service && (
                    <div style={{
                      padding: '16px',
                      background: '#f0fdf4',
                      borderRadius: '8px',
                      border: '1px solid #bbf7d0'
                    }}>
                      <div style={{ fontWeight: 'bold', marginBottom: '8px', color: '#166534' }}>
                        Delivery & Installation
                      </div>
                      <div style={{ fontSize: '14px', color: '#6b7280', marginBottom: '4px' }}>
                        {revenueFeatures.delivery.service.service_name}
                      </div>
                      {revenueFeatures.delivery.calculation && (
                        <div style={{ fontSize: '16px', fontWeight: 'bold', color: '#166534', marginTop: '8px' }}>
                          ${(revenueFeatures.delivery.calculation.totalCents / 100).toFixed(2)}
                        </div>
                      )}
                    </div>
                  )}

                  {/* Extended Warranties */}
                  {revenueFeatures.warranties && revenueFeatures.warranties.length > 0 && (
                    <div style={{
                      padding: '16px',
                      background: '#f0fdf4',
                      borderRadius: '8px',
                      border: '1px solid #bbf7d0'
                    }}>
                      <div style={{ fontWeight: 'bold', marginBottom: '8px', color: '#166534' }}>
                        Extended Warranty Coverage
                      </div>
                      {revenueFeatures.warranties.map((warranty, idx) => (
                        <div key={idx} style={{ fontSize: '14px', color: '#6b7280', marginBottom: '4px' }}>
                          • {warranty.plan?.plan_name || 'Warranty Plan'} ({warranty.plan?.duration_years || 'N/A'} years) -
                          ${(warranty.cost / 100).toFixed(2)}
                        </div>
                      ))}
                      <div style={{ fontSize: '16px', fontWeight: 'bold', color: '#166534', marginTop: '8px' }}>
                        Total: ${revenueFeatures.warranties.reduce((sum, w) => sum + (w.cost / 100), 0).toFixed(2)}
                      </div>
                    </div>
                  )}

                  {/* Financing */}
                  {revenueFeatures.financing && revenueFeatures.financing.plan && (
                    <div style={{
                      padding: '16px',
                      background: '#eff6ff',
                      borderRadius: '8px',
                      border: '1px solid #bfdbfe'
                    }}>
                      <div style={{ fontWeight: 'bold', marginBottom: '8px', color: '#1e40af' }}>
                        Financing Available
                      </div>
                      <div style={{ fontSize: '14px', color: '#6b7280', marginBottom: '4px' }}>
                        {revenueFeatures.financing.plan.plan_name}
                      </div>
                      {revenueFeatures.financing.calculation && (
                        <div>
                          <div style={{ fontSize: '20px', fontWeight: 'bold', color: '#1e40af', marginTop: '8px' }}>
                            ${(revenueFeatures.financing.calculation.monthlyPaymentCents / 100).toFixed(2)}/month
                          </div>
                          <div style={{ fontSize: '12px', color: '#6b7280', marginTop: '4px' }}>
                            {revenueFeatures.financing.plan.term_months} months @ {revenueFeatures.financing.plan.apr_percent}% APR
                          </div>
                        </div>
                      )}
                    </div>
                  )}

                  {/* Rebates */}
                  {revenueFeatures.rebates && revenueFeatures.rebates.length > 0 && (
                    <div style={{
                      padding: '16px',
                      background: '#eff6ff',
                      borderRadius: '8px',
                      border: '1px solid #bfdbfe'
                    }}>
                      <div style={{ fontWeight: 'bold', marginBottom: '8px', color: '#1e40af' }}>
                        Manufacturer Rebates
                      </div>
                      {revenueFeatures.rebates.map((rebate, idx) => (
                        <div key={idx} style={{ fontSize: '14px', color: '#6b7280', marginBottom: '4px' }}>
                          • {rebate.rebate_name || 'Rebate'} -
                          {rebate.rebate_percent ?
                            ` ${rebate.rebate_percent}% off` :
                            ` $${(rebate.rebate_amount_cents / 100).toFixed(2)}`
                          }
                        </div>
                      ))}
                    </div>
                  )}

                  {/* Trade-Ins */}
                  {revenueFeatures.tradeIns && revenueFeatures.tradeIns.length > 0 && (
                    <div style={{
                      padding: '16px',
                      background: '#eff6ff',
                      borderRadius: '8px',
                      border: '1px solid #bfdbfe'
                    }}>
                      <div style={{ fontWeight: 'bold', marginBottom: '8px', color: '#1e40af' }}>
                        Trade-In Credit
                      </div>
                      {revenueFeatures.tradeIns.map((tradeIn, idx) => (
                        <div key={idx} style={{ fontSize: '14px', color: '#6b7280', marginBottom: '4px' }}>
                          • {tradeIn.item_description || 'Trade-In Item'} -
                          ${(tradeIn.estimatedValueCents / 100).toFixed(2)} credit
                        </div>
                      ))}
                      <div style={{ fontSize: '16px', fontWeight: 'bold', color: '#1e40af', marginTop: '8px' }}>
                        Total Credit: -${revenueFeatures.tradeIns.reduce((sum, t) => sum + (t.estimatedValueCents / 100), 0).toFixed(2)}
                      </div>
                    </div>
                  )}
                </div>
              </div>
            );
          }
          return null;
        })()}

        {/* Notes and Terms */}
        {(selectedQuote.notes || selectedQuote.internal_notes || selectedQuote.terms) && (
          <div style={{
            background: 'white',
            padding: '24px',
            borderRadius: '12px',
            marginBottom: '24px',
            boxShadow: '0 1px 3px rgba(0,0,0,0.1)'
          }}>
            {selectedQuote.notes && (
              <div style={{ marginBottom: '16px' }}>
                <h4 style={{ fontSize: '14px', fontWeight: 'bold', marginBottom: '8px' }}>
                  Customer Notes:
                </h4>
                <p style={{ color: '#6b7280', margin: 0 }}>{selectedQuote.notes}</p>
              </div>
            )}

            {selectedQuote.internal_notes && (
              <div style={{ marginBottom: '16px', padding: '12px', background: '#fef2f2', borderRadius: '8px', border: '2px solid #fee2e2' }}>
                <h4 style={{ fontSize: '14px', fontWeight: 'bold', marginBottom: '8px', color: '#991b1b' }}>
                  🔒 Internal Notes (Private):
                </h4>
                <p style={{ color: '#6b7280', margin: 0 }}>{selectedQuote.internal_notes}</p>
              </div>
            )}

            {selectedQuote.terms && (
              <div>
                <h4 style={{ fontSize: '14px', fontWeight: 'bold', marginBottom: '8px' }}>
                  Terms & Conditions:
                </h4>
                <p style={{ color: '#6b7280', margin: 0 }}>{selectedQuote.terms}</p>
              </div>
            )}
          </div>
        )}
        
        {/* PDF Actions */}
        <div style={{
          background: 'white',
          padding: '24px',
          borderRadius: '12px',
          marginBottom: '24px',
          boxShadow: '0 1px 3px rgba(0,0,0,0.1)'
        }}>
          <h3 style={{ fontSize: '18px', fontWeight: 'bold', marginBottom: '16px' }}>
            PDF Options
          </h3>

          <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap' }}>
            <button
              onClick={() => previewQuotePDF(selectedQuote.id, 'customer')}
              style={{
                padding: '12px 24px',
                background: '#8b5cf6',
                color: 'white',
                border: 'none',
                borderRadius: '8px',
                fontWeight: 'bold',
                cursor: 'pointer'
              }}
            >
              👁️ Preview Customer PDF
            </button>

            <button
              onClick={() => downloadQuotePDF(selectedQuote.id, 'customer')}
              style={{
                padding: '12px 24px',
                background: '#3b82f6',
                color: 'white',
                border: 'none',
                borderRadius: '8px',
                fontWeight: 'bold',
                cursor: 'pointer'
              }}
            >
              📄 Download Customer PDF
            </button>

            <button
              onClick={() => previewQuotePDF(selectedQuote.id, 'internal')}
              style={{
                padding: '12px 24px',
                background: '#f59e0b',
                color: 'white',
                border: 'none',
                borderRadius: '8px',
                fontWeight: 'bold',
                cursor: 'pointer'
              }}
            >
              👁️ Preview Internal PDF
            </button>

            <button
              onClick={() => downloadQuotePDF(selectedQuote.id, 'internal')}
              style={{
                padding: '12px 24px',
                background: '#ec4899',
                color: 'white',
                border: 'none',
                borderRadius: '8px',
                fontWeight: 'bold',
                cursor: 'pointer'
              }}
            >
              📥 Download Internal PDF
            </button>
          </div>

          <div style={{ marginTop: '12px', fontSize: '13px', color: '#6b7280' }}>
            <strong>Customer PDF:</strong> Clean quote for customer (no costs/margins) • <strong>Internal PDF:</strong> Includes cost analysis & profit margins
          </div>
        </div>

        {/* Actions */}
        <div style={{
          background: 'white',
          padding: '24px',
          borderRadius: '12px',
          marginBottom: '24px',
          boxShadow: '0 1px 3px rgba(0,0,0,0.1)'
        }}>
          <h3 style={{ fontSize: '18px', fontWeight: 'bold', marginBottom: '16px' }}>
            Quote Status
          </h3>

          <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap' }}>
            <button
              onClick={() => editQuote(selectedQuote.id)}
              style={{
                padding: '12px 24px',
                background: '#8b5cf6',
                color: 'white',
                border: 'none',
                borderRadius: '8px',
                fontWeight: 'bold',
                cursor: 'pointer'
              }}
            >
              ✏️ Edit Quote
            </button>

            <button
              onClick={() => duplicateQuote(selectedQuote.id)}
              style={{
                padding: '12px 24px',
                background: '#06b6d4',
                color: 'white',
                border: 'none',
                borderRadius: '8px',
                fontWeight: 'bold',
                cursor: 'pointer'
              }}
            >
              📋 Duplicate Quote
            </button>

            <button
              onClick={() => updateQuoteStatus(selectedQuote.id, 'SENT')}
              disabled={selectedQuote.status !== 'DRAFT'}
              style={{
                padding: '12px 24px',
                background: selectedQuote.status === 'DRAFT' ? '#3b82f6' : '#9ca3af',
                color: 'white',
                border: 'none',
                borderRadius: '8px',
                fontWeight: 'bold',
                cursor: selectedQuote.status === 'DRAFT' ? 'pointer' : 'not-allowed'
              }}
            >
              📧 Mark as Sent
            </button>

            <button
              onClick={() => updateQuoteStatus(selectedQuote.id, 'WON')}
              disabled={selectedQuote.status === 'WON'}
              style={{
                padding: '12px 24px',
                background: selectedQuote.status !== 'WON' ? '#10b981' : '#9ca3af',
                color: 'white',
                border: 'none',
                borderRadius: '8px',
                fontWeight: 'bold',
                cursor: selectedQuote.status !== 'WON' ? 'pointer' : 'not-allowed'
              }}
            >
              🏆 Mark as Won
            </button>

            <button
              onClick={() => updateQuoteStatus(selectedQuote.id, 'LOST')}
              disabled={selectedQuote.status === 'LOST'}
              style={{
                padding: '12px 24px',
                background: selectedQuote.status !== 'LOST' ? '#ef4444' : '#9ca3af',
                color: 'white',
                border: 'none',
                borderRadius: '8px',
                fontWeight: 'bold',
                cursor: selectedQuote.status !== 'LOST' ? 'pointer' : 'not-allowed'
              }}
            >
              ❌ Mark as Lost
            </button>

            <button
              onClick={() => deleteQuote(selectedQuote.id)}
              style={{
                padding: '12px 24px',
                background: '#6b7280',
                color: 'white',
                border: 'none',
                borderRadius: '8px',
                fontWeight: 'bold',
                cursor: 'pointer',
                marginLeft: 'auto'
              }}
            >
              🗑️ Delete Quote
            </button>
          </div>
        </div>
        
        {/* Event History */}
        {quoteEvents.length > 0 && (
          <div style={{
            background: 'white',
            padding: '24px',
            borderRadius: '12px',
            boxShadow: '0 1px 3px rgba(0,0,0,0.1)'
          }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
              <h3 style={{ fontSize: '18px', fontWeight: 'bold', margin: 0 }}>
                📅 Activity Timeline
              </h3>
              <button
                onClick={() => setShowAddEventDialog(true)}
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
                ➕ Add Note
              </button>
            </div>

            {quoteEvents.length === 0 ? (
              <div style={{ padding: '32px', textAlign: 'center', color: '#6b7280' }}>
                No activity recorded yet. Add notes to track interactions!
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                {quoteEvents.map((event, idx) => {
                  const eventColors = {
                    'CREATED': { bg: '#dbeafe', border: '#3b82f6', icon: '✨' },
                    'UPDATED': { bg: '#fef3c7', border: '#f59e0b', icon: '✏️' },
                    'STATUS_CHANGED': { bg: '#e0e7ff', border: '#6366f1', icon: '🔄' },
                    'EMAIL_SENT': { bg: '#d1fae5', border: '#10b981', icon: '📧' },
                    'APPROVAL_REQUESTED': { bg: '#fef3c7', border: '#f59e0b', icon: '✅' },
                    'APPROVED': { bg: '#d1fae5', border: '#10b981', icon: '✅' },
                    'REJECTED': { bg: '#fee2e2', border: '#ef4444', icon: '❌' },
                    'NOTE': { bg: '#f3f4f6', border: '#6b7280', icon: '📝' }
                  };
                  const style = eventColors[event.event_type] || eventColors['NOTE'];

                  return (
                    <div
                      key={event.id}
                      style={{
                        padding: '12px',
                        background: style.bg,
                        borderRadius: '6px',
                        borderLeft: `4px solid ${style.border}`
                      }}
                    >
                      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '4px' }}>
                        <span style={{ fontWeight: 'bold', color: style.border }}>
                          {style.icon} {event.event_type.replace(/_/g, ' ')}
                        </span>
                        <span style={{ fontSize: '12px', color: '#6b7280' }}>
                          {new Date(event.created_at).toLocaleString()}
                        </span>
                      </div>
                      {event.description && (
                        <div style={{ fontSize: '14px', color: '#374151', marginTop: '8px' }}>
                          {event.description}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {/* Approval History */}
        {quoteApprovals.length > 0 && (
          <div style={{
            background: 'white',
            padding: '24px',
            borderRadius: '12px',
            boxShadow: '0 1px 3px rgba(0,0,0,0.1)',
            marginTop: '24px'
          }}>
            <h3 style={{ fontSize: '18px', fontWeight: 'bold', marginBottom: '16px' }}>
              ✅ Approval History
            </h3>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
              {quoteApprovals.map((approval) => {
                const statusColors = {
                  'PENDING': { bg: '#fef3c7', border: '#f59e0b', text: '#92400e' },
                  'APPROVED': { bg: '#d1fae5', border: '#10b981', text: '#065f46' },
                  'REJECTED': { bg: '#fee2e2', border: '#ef4444', text: '#991b1b' }
                };
                const style = statusColors[approval.status] || statusColors['PENDING'];

                return (
                  <div
                    key={approval.id}
                    style={{
                      padding: '16px',
                      background: style.bg,
                      borderRadius: '8px',
                      borderLeft: `4px solid ${style.border}`
                    }}
                  >
                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '12px' }}>
                      <div>
                        <div style={{ fontWeight: 'bold', color: style.text, marginBottom: '4px' }}>
                          {approval.status === 'PENDING' && '⏳ Pending Approval'}
                          {approval.status === 'APPROVED' && '✅ Approved'}
                          {approval.status === 'REJECTED' && '❌ Rejected'}
                        </div>
                        <div style={{ fontSize: '14px', color: '#6b7280' }}>
                          Requested by: {approval.requested_by} ({approval.requested_by_email})
                        </div>
                        {approval.approver_name && (
                          <div style={{ fontSize: '14px', color: '#6b7280' }}>
                            Approver: {approval.approver_name} ({approval.approver_email})
                          </div>
                        )}
                      </div>
                      <div style={{ textAlign: 'right' }}>
                        <div style={{ fontSize: '12px', color: '#6b7280' }}>
                          Requested: {new Date(approval.requested_at).toLocaleString()}
                        </div>
                        {approval.reviewed_at && (
                          <div style={{ fontSize: '12px', color: '#6b7280' }}>
                            Reviewed: {new Date(approval.reviewed_at).toLocaleString()}
                          </div>
                        )}
                      </div>
                    </div>

                    {approval.comments && (
                      <div style={{
                        padding: '12px',
                        background: 'white',
                        borderRadius: '6px',
                        fontSize: '14px',
                        color: '#374151'
                      }}>
                        <strong>Comments:</strong> {approval.comments}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
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
      {view === 'list' && renderListView()}
      {view === 'builder' && renderBuilderView()}
      {view === 'viewer' && renderViewerView()}
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