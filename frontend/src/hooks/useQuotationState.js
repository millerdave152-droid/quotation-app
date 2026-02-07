import { authFetch } from '../services/authFetch';
/**
 * Quotation State Management Hook
 * Centralizes all quotation-related state and handlers
 */

import { useState, useRef, useEffect, useCallback } from 'react';
import { cachedFetch, invalidateCache } from '../services/apiCache';
import logger from '../utils/logger';

const API_URL = process.env.REACT_APP_API_URL || 'http://localhost:3001';

export const useQuotationState = () => {
  // ============================================
  // VIEW STATE
  // ============================================
  const [view, setView] = useState('list');
  const [loading, setLoading] = useState(true);

  // ============================================
  // DATA STATE
  // ============================================
  const [quotations, setQuotations] = useState([]);
  const [customers, setCustomers] = useState([]);
  const [products, setProducts] = useState([]);
  const [stats, setStats] = useState({});
  const [templates, setTemplates] = useState([]);
  const [paymentTermsTemplates, setPaymentTermsTemplates] = useState([]);

  // ============================================
  // FILTER STATE
  // ============================================
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [dateFilter, setDateFilter] = useState('all');
  const [valueFilter, setValueFilter] = useState('all');
  const [expiringFilter, setExpiringFilter] = useState(false);
  const [sortBy, setSortBy] = useState('date');
  const [sortOrder, setSortOrder] = useState('desc');
  const [customerFilter, setCustomerFilter] = useState('all');
  const [productFilter, setProductFilter] = useState('');
  const [createdByFilter, setCreatedByFilter] = useState('all');
  const [showAdvancedFilters, setShowAdvancedFilters] = useState(false);
  const [filterPresets, setFilterPresets] = useState([]);

  // ============================================
  // BUILDER STATE
  // ============================================
  const [selectedCustomer, setSelectedCustomer] = useState(null);
  const [quoteItems, setQuoteItems] = useState([]);
  const [discountPercent, setDiscountPercent] = useState(0);
  const [notes, setNotes] = useState('');
  const [internalNotes, setInternalNotes] = useState('');
  const [terms, setTerms] = useState('Payment due within 30 days. All prices in CAD.');
  const [productSearchTerm, setProductSearchTerm] = useState('');
  const [editingQuoteId, setEditingQuoteId] = useState(null);
  const [customerSearchTerm, setCustomerSearchTerm] = useState('');
  const [showCustomerDropdown, setShowCustomerDropdown] = useState(false);

  // ============================================
  // VIEWER STATE
  // ============================================
  const [selectedQuote, setSelectedQuote] = useState(null);
  const [quoteEvents, setQuoteEvents] = useState([]);

  // ============================================
  // PRODUCT STATE
  // ============================================
  const [favoriteProducts, setFavoriteProducts] = useState([]);
  const [recentProducts, setRecentProducts] = useState([]);
  const [productTab, setProductTab] = useState('search');
  const [customerQuotes, setCustomerQuotes] = useState([]);

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

  // ============================================
  // EMAIL STATE
  // ============================================
  const [showEmailDialog, setShowEmailDialog] = useState(false);
  const [emailTo, setEmailTo] = useState('');
  const [emailSubject, setEmailSubject] = useState('');
  const [emailMessage, setEmailMessage] = useState('');
  const [emailTemplates, setEmailTemplates] = useState([]);
  const [selectedEmailTemplate, setSelectedEmailTemplate] = useState(null);

  // ============================================
  // TEMPLATE STATE
  // ============================================
  const [showTemplateSaveDialog, setShowTemplateSaveDialog] = useState(false);
  const [templateName, setTemplateName] = useState('');
  const [templateDescription, setTemplateDescription] = useState('');

  // ============================================
  // ACTIVITY STATE
  // ============================================
  const [showAddEventDialog, setShowAddEventDialog] = useState(false);
  const [newEventDescription, setNewEventDescription] = useState('');

  // ============================================
  // ANALYTICS STATE
  // ============================================
  const [analyticsData, setAnalyticsData] = useState(null);

  // ============================================
  // APPROVAL STATE
  // ============================================
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
  const [approvalAction, setApprovalAction] = useState('');
  const [approvalActionComments, setApprovalActionComments] = useState('');

  // ============================================
  // FOLLOW-UP STATE
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
  // REFS
  // ============================================
  const isMounted = useRef(true);
  const loadedOnce = useRef(false);

  // ============================================
  // SERVICE ITEMS
  // ============================================
  const SERVICE_ITEMS = [
    { name: 'Standard Delivery', description: 'Delivery within 5-7 business days', sku: 'SRV-DEL-STD', cost: 30.00, msrp: 150.00, sell: 99.00, is_service: true, manufacturer: 'Service', category: 'Service' },
    { name: 'Express Delivery', description: 'Next day delivery', sku: 'SRV-DEL-EXP', cost: 50.00, msrp: 200.00, sell: 149.00, is_service: true, manufacturer: 'Service', category: 'Service' },
    { name: 'Basic Installation', description: 'Standard product installation', sku: 'SRV-INS-BAS', cost: 50.00, msrp: 200.00, sell: 129.00, is_service: true, manufacturer: 'Service', category: 'Service' },
    { name: 'Premium Installation', description: 'Full setup and configuration', sku: 'SRV-INS-PRE', cost: 80.00, msrp: 300.00, sell: 199.00, is_service: true, manufacturer: 'Service', category: 'Service' },
    { name: 'Haul Away', description: 'Remove and dispose of old appliance', sku: 'SRV-HAL-AWY', cost: 20.00, msrp: 120.00, sell: 79.00, is_service: true, manufacturer: 'Service', category: 'Service' }
  ];

  // ============================================
  // DATA FETCHING
  // ============================================
  const fetchInitialData = useCallback(async () => {
    if (!isMounted.current) return;
    setLoading(true);

    try {
      const [quotationsRes, customersRes, productsRes, statsRes] = await Promise.all([
        cachedFetch('/api/quotations?limit=100'),
        cachedFetch('/api/customers'),
        cachedFetch('/api/products?limit=500'),
        cachedFetch('/api/quotations/stats/summary')
      ]);

      if (!isMounted.current) return;

      setQuotations(quotationsRes?.quotations || quotationsRes || []);
      setCustomers(customersRes?.customers || customersRes || []);
      setProducts(productsRes?.products || productsRes || []);
      setStats(statsRes || {});
    } catch (err) {
      logger.error('Error fetching initial data:', err);
    } finally {
      if (isMounted.current) {
        setLoading(false);
      }
    }
  }, []);

  const fetchQuotations = useCallback(async () => {
    try {
      const data = await cachedFetch('/api/quotations?limit=100');
      if (isMounted.current) {
        setQuotations(data?.quotations || data || []);
      }
    } catch (err) {
      logger.error('Error fetching quotations:', err);
    }
  }, []);

  const fetchTemplates = useCallback(async () => {
    try {
      const res = await authFetch(`${API_URL}/api/quote-templates`);
      const data = await res.json();
      if (isMounted.current) {
        setTemplates(Array.isArray(data) ? data : []);
      }
    } catch (err) {
      logger.error('Error fetching templates:', err);
      setTemplates([]);
    }
  }, []);

  const fetchPaymentTerms = useCallback(async () => {
    try {
      const res = await authFetch(`${API_URL}/api/payment-terms`);
      const data = await res.json();
      if (isMounted.current) {
        setPaymentTermsTemplates(Array.isArray(data) ? data : []);
      }
    } catch (err) {
      logger.error('Error fetching payment terms:', err);
      setPaymentTermsTemplates([]);
    }
  }, []);

  const fetchQuoteEvents = useCallback(async (quoteId) => {
    // Validate quoteId before making API call
    if (!quoteId || quoteId === 'undefined') {
      setQuoteEvents([]);
      return;
    }

    try {
      const res = await authFetch(`${API_URL}/api/quotations/${quoteId}/events`);
      const data = await res.json();
      if (isMounted.current) {
        setQuoteEvents(Array.isArray(data) ? data : []);
      }
    } catch (err) {
      logger.error('Error fetching quote events:', err);
      setQuoteEvents([]);
    }
  }, []);

  const fetchCustomerQuotes = useCallback(async (customerId) => {
    try {
      const res = await authFetch(`${API_URL}/api/quotations?customer_id=${customerId}&limit=5`);
      const data = await res.json();
      if (isMounted.current) {
        setCustomerQuotes(data?.quotations || data || []);
      }
    } catch (err) {
      logger.error('Error fetching customer quotes:', err);
      setCustomerQuotes([]);
    }
  }, []);

  const fetchPendingApprovals = useCallback(async () => {
    try {
      const res = await authFetch(`${API_URL}/api/quotations/approvals/pending`);
      const data = await res.json();
      if (isMounted.current) {
        setPendingApprovals(Array.isArray(data) ? data : []);
      }
    } catch (err) {
      logger.error('Error fetching pending approvals:', err);
      setPendingApprovals([]);
    }
  }, []);

  const fetchFollowUpData = useCallback(async () => {
    try {
      const [pending, stale, statsRes] = await Promise.all([
        authFetch(`${API_URL}/api/quotations/follow-ups/pending`).then(r => r.json()),
        authFetch(`${API_URL}/api/quotations/stale`).then(r => r.json()),
        authFetch(`${API_URL}/api/quotations/follow-ups/stats`).then(r => r.json())
      ]);

      if (isMounted.current) {
        setPendingFollowUps(Array.isArray(pending) ? pending : []);
        setStaleQuotes(Array.isArray(stale) ? stale : []);
        setFollowUpStats(statsRes || {});
      }
    } catch (err) {
      logger.error('Error fetching follow-up data:', err);
    }
  }, []);

  // ============================================
  // QUOTE OPERATIONS
  // ============================================
  const resetBuilder = useCallback(() => {
    setSelectedCustomer(null);
    setQuoteItems([]);
    setDiscountPercent(0);
    setNotes('');
    setInternalNotes('');
    setTerms('Payment due within 30 days. All prices in CAD.');
    setEditingQuoteId(null);
    setCustomerSearchTerm('');
    setProductSearchTerm('');
    setQuoteFinancing(null);
    setQuoteWarranties([]);
    setQuoteDelivery(null);
    setQuoteRebates([]);
    setQuoteTradeIns([]);
    setHideModelNumbers(false);
    setWatermarkText('CONFIDENTIAL - FOR CUSTOMER USE ONLY');
    setWatermarkEnabled(true);
    setQuoteExpiryDate('');
  }, []);

  const startNewQuote = useCallback(() => {
    resetBuilder();
    setView('builder');
  }, [resetBuilder]);

  const editQuote = useCallback(async (quote) => {
    // Validate quote has an ID
    if (!quote?.id) {
      logger.error('Cannot edit quote: No quote ID provided');
      return;
    }

    try {
      const res = await authFetch(`${API_URL}/api/quotations/${quote.id}`);
      const fullQuote = await res.json();

      setSelectedCustomer(customers.find(c => c.id === fullQuote.customer_id) || null);
      setQuoteItems((fullQuote.items || []).map(item => ({
        ...item,
        cost: item.cost_cents / 100,
        msrp: item.msrp_cents / 100,
        sell: item.sell_cents / 100,
      })));
      setDiscountPercent(parseFloat(fullQuote.discount_percent) || 0);
      setNotes(fullQuote.notes || '');
      setInternalNotes(fullQuote.internal_notes || '');
      setTerms(fullQuote.terms || '');
      setEditingQuoteId(quote.id);
      setHideModelNumbers(fullQuote.hide_model_numbers || false);
      setWatermarkText(fullQuote.watermark_text || 'CONFIDENTIAL - FOR CUSTOMER USE ONLY');
      setWatermarkEnabled(fullQuote.watermark_enabled !== false);
      setQuoteExpiryDate(fullQuote.quote_expiry_date || '');
      setView('builder');
    } catch (err) {
      logger.error('Error loading quote for edit:', err);
    }
  }, [customers]);

  const viewQuote = useCallback(async (quote) => {
    // Validate quote has an ID
    if (!quote?.id) {
      logger.error('Cannot view quote: No quote ID provided');
      return;
    }

    try {
      const res = await authFetch(`${API_URL}/api/quotations/${quote.id}`);
      const fullQuote = await res.json();
      setSelectedQuote(fullQuote);
      await fetchQuoteEvents(quote.id);
      setView('viewer');
    } catch (err) {
      logger.error('Error loading quote details:', err);
    }
  }, [fetchQuoteEvents]);

  const deleteQuote = useCallback(async (quoteId) => {
    // Validate quoteId
    if (!quoteId || quoteId === 'undefined') {
      logger.error('Cannot delete quote: No quote ID provided');
      return;
    }

    if (!window.confirm('Are you sure you want to delete this quotation?')) return;

    try {
      await authFetch(`${API_URL}/api/quotations/${quoteId}`, { method: 'DELETE' });
      invalidateCache('/api/quotations');
      await fetchQuotations();
    } catch (err) {
      logger.error('Error deleting quote:', err);
    }
  }, [fetchQuotations]);

  // ============================================
  // ITEM OPERATIONS
  // ============================================
  const addItemToQuote = useCallback((product) => {
    const existingIndex = quoteItems.findIndex(item =>
      (item.product_id === product.id) || (item.model === product.model_number)
    );

    if (existingIndex >= 0) {
      setQuoteItems(prev => prev.map((item, idx) =>
        idx === existingIndex ? { ...item, quantity: item.quantity + 1 } : item
      ));
    } else {
      const newItem = {
        product_id: product.id,
        manufacturer: product.manufacturer || '',
        model: product.model_number || product.name || '',
        description: product.description || product.name || '',
        category: product.category || '',
        quantity: 1,
        cost: (product.cost_cents || 0) / 100,
        msrp: (product.msrp_cents || 0) / 100,
        sell: (product.msrp_cents || 0) / 100,
        notes: ''
      };
      setQuoteItems(prev => [...prev, newItem]);

      // Track recent products
      setRecentProducts(prev => {
        const filtered = prev.filter(p => p.id !== product.id);
        return [product, ...filtered].slice(0, 10);
      });
    }
    setProductSearchTerm('');
  }, [quoteItems]);

  const removeItemFromQuote = useCallback((index) => {
    setQuoteItems(prev => prev.filter((_, i) => i !== index));
  }, []);

  const updateItemQuantity = useCallback((index, quantity) => {
    const qty = Math.max(1, parseInt(quantity) || 1);
    setQuoteItems(prev => prev.map((item, i) =>
      i === index ? { ...item, quantity: qty } : item
    ));
  }, []);

  const updateItemPrice = useCallback((index, field, value) => {
    const numValue = parseFloat(value) || 0;
    setQuoteItems(prev => prev.map((item, i) =>
      i === index ? { ...item, [field]: numValue } : item
    ));
  }, []);

  // ============================================
  // CALCULATIONS
  // ============================================
  const calculateTotals = useCallback(() => {
    const subtotal = quoteItems.reduce((sum, item) => sum + (item.sell * item.quantity), 0);
    const discount = (subtotal * discountPercent) / 100;
    const afterDiscount = subtotal - discount;
    const tax = afterDiscount * 0.13; // 13% HST
    const total = afterDiscount + tax;
    const totalCost = quoteItems.reduce((sum, item) => sum + (item.cost * item.quantity), 0);
    const grossProfit = afterDiscount - totalCost;
    const marginPercent = afterDiscount > 0 ? (grossProfit / afterDiscount) * 100 : 0;

    return {
      subtotal,
      discount,
      afterDiscount,
      tax,
      total,
      totalCost,
      grossProfit,
      marginPercent
    };
  }, [quoteItems, discountPercent]);

  // ============================================
  // LIFECYCLE
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
  }, [fetchInitialData]);

  return {
    // View
    view, setView,
    loading, setLoading,

    // Data
    quotations, setQuotations,
    customers, setCustomers,
    products, setProducts,
    stats, setStats,
    templates, setTemplates,
    paymentTermsTemplates, setPaymentTermsTemplates,

    // Filters
    searchTerm, setSearchTerm,
    statusFilter, setStatusFilter,
    dateFilter, setDateFilter,
    valueFilter, setValueFilter,
    expiringFilter, setExpiringFilter,
    sortBy, setSortBy,
    sortOrder, setSortOrder,
    customerFilter, setCustomerFilter,
    productFilter, setProductFilter,
    createdByFilter, setCreatedByFilter,
    showAdvancedFilters, setShowAdvancedFilters,
    filterPresets, setFilterPresets,

    // Builder
    selectedCustomer, setSelectedCustomer,
    quoteItems, setQuoteItems,
    discountPercent, setDiscountPercent,
    notes, setNotes,
    internalNotes, setInternalNotes,
    terms, setTerms,
    productSearchTerm, setProductSearchTerm,
    editingQuoteId, setEditingQuoteId,
    customerSearchTerm, setCustomerSearchTerm,
    showCustomerDropdown, setShowCustomerDropdown,

    // Viewer
    selectedQuote, setSelectedQuote,
    quoteEvents, setQuoteEvents,

    // Products
    favoriteProducts, setFavoriteProducts,
    recentProducts, setRecentProducts,
    productTab, setProductTab,
    customerQuotes, setCustomerQuotes,

    // Revenue Features
    quoteFinancing, setQuoteFinancing,
    quoteWarranties, setQuoteWarranties,
    quoteDelivery, setQuoteDelivery,
    quoteRebates, setQuoteRebates,
    quoteTradeIns, setQuoteTradeIns,
    showRevenueFeatures, setShowRevenueFeatures,
    smartSuggestions, setSmartSuggestions,
    showSuggestions, setShowSuggestions,
    availableFinancing, setAvailableFinancing,
    availableWarranties, setAvailableWarranties,
    availableRebates, setAvailableRebates,

    // Quote Protection
    hideModelNumbers, setHideModelNumbers,
    watermarkText, setWatermarkText,
    watermarkEnabled, setWatermarkEnabled,
    quoteExpiryDate, setQuoteExpiryDate,

    // Email
    showEmailDialog, setShowEmailDialog,
    emailTo, setEmailTo,
    emailSubject, setEmailSubject,
    emailMessage, setEmailMessage,
    emailTemplates, setEmailTemplates,
    selectedEmailTemplate, setSelectedEmailTemplate,

    // Templates
    showTemplateSaveDialog, setShowTemplateSaveDialog,
    templateName, setTemplateName,
    templateDescription, setTemplateDescription,

    // Activity
    showAddEventDialog, setShowAddEventDialog,
    newEventDescription, setNewEventDescription,

    // Analytics
    analyticsData, setAnalyticsData,

    // Approvals
    showApprovalDialog, setShowApprovalDialog,
    approvalRequestedBy, setApprovalRequestedBy,
    approvalRequestedByEmail, setApprovalRequestedByEmail,
    approverName, setApproverName,
    approverEmail, setApproverEmail,
    approvalComments, setApprovalComments,
    quoteApprovals, setQuoteApprovals,
    pendingApprovals, setPendingApprovals,
    showApprovalActionDialog, setShowApprovalActionDialog,
    selectedApproval, setSelectedApproval,
    approvalAction, setApprovalAction,
    approvalActionComments, setApprovalActionComments,

    // Follow-ups
    pendingFollowUps, setPendingFollowUps,
    staleQuotes, setStaleQuotes,
    followUpStats, setFollowUpStats,
    showInteractionModal, setShowInteractionModal,
    selectedFollowUpQuote, setSelectedFollowUpQuote,
    interactionType, setInteractionType,
    interactionNotes, setInteractionNotes,
    nextAction, setNextAction,
    nextActionDate, setNextActionDate,

    // Refs
    isMounted,
    loadedOnce,

    // Constants
    SERVICE_ITEMS,
    API_URL,

    // Methods
    fetchInitialData,
    fetchQuotations,
    fetchTemplates,
    fetchPaymentTerms,
    fetchQuoteEvents,
    fetchCustomerQuotes,
    fetchPendingApprovals,
    fetchFollowUpData,
    resetBuilder,
    startNewQuote,
    editQuote,
    viewQuote,
    deleteQuote,
    addItemToQuote,
    removeItemFromQuote,
    updateItemQuantity,
    updateItemPrice,
    calculateTotals,
  };
};

export default useQuotationState;
