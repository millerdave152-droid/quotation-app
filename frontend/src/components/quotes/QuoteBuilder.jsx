/**
 * QuoteBuilder Component
 * Handles quote creation and editing with customer selection,
 * product search, item management, and revenue features
 */

import React, { useState, useMemo, useCallback } from 'react';
import {
  FinancingCalculator,
  WarrantySelector,
  DeliverySelector,
  RebatesDisplay,
  TradeInEstimator
} from '../RevenueFeatures';
import { getSmartSuggestions, getSuggestionsSummary } from '../../utils/smartSuggestions';
import logger from '../../utils/logger';

// Service items for quick add
const SERVICE_ITEMS = [
  { name: 'Standard Delivery', description: 'Delivery within 5-7 business days', sku: 'SRV-DEL-STD', cost: 30.00, msrp: 150.00, sell: 99.00, is_service: true, manufacturer: 'Service', category: 'Service' },
  { name: 'Express Delivery', description: 'Next day delivery', sku: 'SRV-DEL-EXP', cost: 50.00, msrp: 200.00, sell: 149.00, is_service: true, manufacturer: 'Service', category: 'Service' },
  { name: 'Basic Installation', description: 'Standard product installation', sku: 'SRV-INS-BAS', cost: 50.00, msrp: 200.00, sell: 129.00, is_service: true, manufacturer: 'Service', category: 'Service' },
  { name: 'Premium Installation', description: 'Full setup and configuration', sku: 'SRV-INS-PRE', cost: 80.00, msrp: 300.00, sell: 199.00, is_service: true, manufacturer: 'Service', category: 'Service' },
  { name: 'Haul Away', description: 'Remove and dispose of old appliance', sku: 'SRV-HAL-AWY', cost: 20.00, msrp: 120.00, sell: 79.00, is_service: true, manufacturer: 'Service', category: 'Service' }
];

const QuoteBuilder = ({
  // Data
  customers = [],
  products = [],
  templates = [],
  paymentTermsTemplates = [],
  favoriteProducts = [],
  recentProducts = [],
  customerQuotes = [],

  // Builder state
  editingQuoteId,
  selectedCustomer,
  setSelectedCustomer,
  quoteItems,
  setQuoteItems,
  discountPercent,
  setDiscountPercent,
  notes,
  setNotes,
  internalNotes,
  setInternalNotes,
  terms,
  setTerms,

  // Quote protection
  hideModelNumbers,
  setHideModelNumbers,
  watermarkEnabled,
  setWatermarkEnabled,
  watermarkText,
  setWatermarkText,
  quoteExpiryDate,
  setQuoteExpiryDate,

  // Revenue features
  quoteFinancing,
  setQuoteFinancing,
  quoteWarranties,
  setQuoteWarranties,
  quoteDelivery,
  setQuoteDelivery,
  quoteRebates,
  setQuoteRebates,
  quoteTradeIns,
  setQuoteTradeIns,
  showRevenueFeatures,
  setShowRevenueFeatures,

  // Delivery & Installation
  deliveryAddress,
  setDeliveryAddress,
  deliveryCity,
  setDeliveryCity,
  deliveryPostalCode,
  setDeliveryPostalCode,
  deliveryDate,
  setDeliveryDate,
  deliveryTimeSlot,
  setDeliveryTimeSlot,
  deliveryInstructions,
  setDeliveryInstructions,
  installationRequired,
  setInstallationRequired,
  installationType,
  setInstallationType,
  haulAwayRequired,
  setHaulAwayRequired,
  haulAwayItems,
  setHaulAwayItems,

  // Sales & Commission
  salesRepName,
  setSalesRepName,
  commissionPercent,
  setCommissionPercent,
  referralSource,
  setReferralSource,
  referralName,
  setReferralName,

  // Customer Experience
  priorityLevel,
  setPriorityLevel,
  specialInstructions,
  setSpecialInstructions,
  paymentMethod,
  setPaymentMethod,
  depositRequired,
  setDepositRequired,
  depositAmount,
  setDepositAmount,

  // Actions
  onSave,
  onSaveAndSend,
  onSaveTemplate,
  onBack,
  onCustomerSelect,
  onLoadTemplate,
  onDeleteTemplate,
  onToggleFavorite,

  // Helpers
  formatCurrency
}) => {
  // Local state
  const [customerSearchTerm, setCustomerSearchTerm] = useState('');
  const [showCustomerDropdown, setShowCustomerDropdown] = useState(false);
  const [productSearchTerm, setProductSearchTerm] = useState('');
  const [productTab, setProductTab] = useState('search');
  const [showTemplateSaveDialog, setShowTemplateSaveDialog] = useState(false);
  const [templateName, setTemplateName] = useState('');
  const [templateDescription, setTemplateDescription] = useState('');
  const [showSuggestions, setShowSuggestions] = useState(true);

  // Filter products based on search
  const filteredProducts = useMemo(() => {
    if (!productSearchTerm || productSearchTerm.length < 2) return [];
    const search = productSearchTerm.toLowerCase();
    return products.filter(p =>
      (p.model_number || '').toLowerCase().includes(search) ||
      (p.manufacturer || '').toLowerCase().includes(search) ||
      (p.sku || '').toLowerCase().includes(search) ||
      (p.description || '').toLowerCase().includes(search)
    ).slice(0, 20);
  }, [products, productSearchTerm]);

  // Calculate margin
  const calculateMargin = useCallback((sell, cost) => {
    if (!sell || sell <= 0) return 0;
    return ((sell - cost) / sell) * 100;
  }, []);

  // Calculate totals
  const calculateTotals = useMemo(() => {
    const subtotal = quoteItems.reduce((sum, item) => sum + (item.sell * item.quantity), 0);
    const discount = (subtotal * discountPercent) / 100;
    const afterDiscount = subtotal - discount;

    // Add revenue features
    const deliveryCost = quoteDelivery?.calculation?.totalCents ? quoteDelivery.calculation.totalCents / 100 : 0;
    const warrantiesCost = quoteWarranties.reduce((sum, w) => sum + ((w.cost || 0) / 100), 0);
    const tradeInCredit = quoteTradeIns.reduce((sum, t) => sum + ((t.estimatedValueCents || 0) / 100), 0);
    const rebateCredit = quoteRebates.reduce((sum, r) => sum + ((r.rebate_amount_cents || 0) / 100), 0);

    const afterAddOns = afterDiscount + deliveryCost + warrantiesCost - tradeInCredit - rebateCredit;
    const tax = afterAddOns * 0.13; // 13% HST
    const total = afterAddOns + tax;

    const totalCost = quoteItems.reduce((sum, item) => sum + (item.cost * item.quantity), 0);
    const profit = afterAddOns - totalCost;
    const profitMargin = afterAddOns > 0 ? (profit / afterAddOns) * 100 : 0;

    return {
      subtotal,
      discount,
      afterDiscount,
      deliveryCost,
      warrantiesCost,
      tradeInCredit,
      rebateCredit,
      afterAddOns,
      tax,
      total,
      totalCost,
      profit,
      profitMargin,
      financing: quoteFinancing
    };
  }, [quoteItems, discountPercent, quoteDelivery, quoteWarranties, quoteTradeIns, quoteRebates, quoteFinancing]);

  // Smart suggestions
  const smartSuggestions = useMemo(() => {
    if (quoteItems.length === 0) return null;
    try {
      return getSmartSuggestions({
        quoteTotal: calculateTotals.total,
        products: quoteItems,
        availableFinancing: [],
        availableWarranties: [],
        availableRebates: [],
        currentFeatures: {
          financing: quoteFinancing,
          warranties: quoteWarranties,
          delivery: quoteDelivery,
          rebates: quoteRebates,
          tradeIns: quoteTradeIns
        }
      });
    } catch (err) {
      return null;
    }
  }, [quoteItems, calculateTotals.total, quoteFinancing, quoteWarranties, quoteDelivery, quoteRebates, quoteTradeIns]);

  // Add product to quote
  const addProductToQuote = useCallback((product) => {
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
        sku: product.sku || product.model_number,
        notes: ''
      };
      setQuoteItems(prev => [...prev, newItem]);
    }
    setProductSearchTerm('');
  }, [quoteItems, setQuoteItems]);

  // Add service item
  const addServiceItem = useCallback((service) => {
    const newItem = {
      product_id: null,
      manufacturer: service.manufacturer,
      model: service.name,
      description: service.description,
      category: service.category,
      quantity: 1,
      cost: service.cost,
      msrp: service.msrp,
      sell: service.sell,
      sku: service.sku,
      is_service: true,
      notes: ''
    };
    setQuoteItems(prev => [...prev, newItem]);
  }, [setQuoteItems]);

  // Update quote item
  const updateQuoteItem = useCallback((index, field, value) => {
    setQuoteItems(prev => prev.map((item, idx) =>
      idx === index ? { ...item, [field]: value } : item
    ));
  }, [setQuoteItems]);

  // Remove quote item
  const removeQuoteItem = useCallback((index) => {
    setQuoteItems(prev => prev.filter((_, idx) => idx !== index));
  }, [setQuoteItems]);

  // Handle save template
  const handleSaveTemplate = useCallback(() => {
    if (!templateName.trim()) return;
    onSaveTemplate?.({
      name: templateName,
      description: templateDescription,
      items: quoteItems,
      discount_percent: discountPercent,
      notes,
      terms
    });
    setShowTemplateSaveDialog(false);
    setTemplateName('');
    setTemplateDescription('');
  }, [templateName, templateDescription, quoteItems, discountPercent, notes, terms, onSaveTemplate]);

  // Clear revenue features
  const clearRevenueFeatures = useCallback(() => {
    setQuoteFinancing(null);
    setQuoteWarranties([]);
    setQuoteDelivery(null);
    setQuoteRebates([]);
    setQuoteTradeIns([]);
  }, [setQuoteFinancing, setQuoteWarranties, setQuoteDelivery, setQuoteRebates, setQuoteTradeIns]);

  const totals = calculateTotals;

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
          {editingQuoteId ? 'Edit Quote' : 'Quote Builder'}
        </h1>

        <button
          onClick={onBack}
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
          Back to List
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
            Please select a customer to continue
          </div>
        )}

        {!selectedCustomer ? (
          <div style={{ position: 'relative' }}>
            <input
              type="text"
              placeholder="Search customers by name, company, or email..."
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
                      (c.name || '').toLowerCase().includes(search) ||
                      (c.company || '').toLowerCase().includes(search) ||
                      (c.email || '').toLowerCase().includes(search)
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
                        onCustomerSelect?.(c);
                      }}
                      style={{
                        padding: '12px',
                        borderBottom: '1px solid #e5e7eb',
                        cursor: 'pointer'
                      }}
                      onMouseEnter={(e) => e.currentTarget.style.background = '#f9fafb'}
                      onMouseLeave={(e) => e.currentTarget.style.background = 'white'}
                    >
                      <div style={{ fontWeight: 'bold' }}>{c.company || c.name}</div>
                      <div style={{ fontSize: '12px', color: '#6b7280' }}>{c.name}</div>
                      <div style={{ fontSize: '12px', color: '#6b7280' }}>{c.email}</div>
                    </div>
                  ))}
                {customers.filter(c => {
                  const search = customerSearchTerm.toLowerCase();
                  return (
                    (c.name || '').toLowerCase().includes(search) ||
                    (c.company || '').toLowerCase().includes(search) ||
                    (c.email || '').toLowerCase().includes(search)
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
                  {selectedCustomer.company || selectedCustomer.name}
                </div>
                <div style={{ color: '#6b7280', fontSize: '14px' }}>
                  {selectedCustomer.name}
                </div>
                <div style={{ color: '#6b7280', fontSize: '14px' }}>
                  {selectedCustomer.email} {selectedCustomer.phone && `• ${selectedCustomer.phone}`}
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
                  Recent Quotes for this Customer:
                </div>
                {customerQuotes.slice(0, 5).map((quote) => (
                  <div key={quote.id} style={{ display: 'flex', justifyContent: 'space-between', fontSize: '12px', color: '#78350f', marginBottom: '4px' }}>
                    <span style={{ fontWeight: '600' }}>{quote.quote_number}</span>
                    <span>{new Date(quote.created_at).toLocaleDateString()}</span>
                    <span style={{ fontWeight: 'bold' }}>${((quote.total_cents || 0) / 100).toFixed(2)}</span>
                    <span style={{
                      padding: '2px 6px',
                      borderRadius: '4px',
                      fontSize: '10px',
                      fontWeight: 'bold',
                      background: quote.status === 'WON' ? '#d1fae5' : quote.status === 'LOST' ? '#fee2e2' : '#dbeafe',
                      color: quote.status === 'WON' ? '#065f46' : quote.status === 'LOST' ? '#991b1b' : '#1e40af'
                    }}>
                      {quote.status}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>

      {/* Templates */}
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
            Quote Templates
          </h3>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(250px, 1fr))', gap: '12px' }}>
            {templates.map(template => (
              <div key={template.id} style={{ padding: '16px', background: '#f9fafb', border: '1px solid #d1d5db', borderRadius: '8px' }}>
                <div style={{ fontWeight: 'bold', marginBottom: '8px', fontSize: '14px' }}>{template.name}</div>
                {template.description && (
                  <div style={{ fontSize: '12px', color: '#6b7280', marginBottom: '12px' }}>{template.description}</div>
                )}
                <div style={{ display: 'flex', gap: '8px' }}>
                  <button
                    onClick={() => onLoadTemplate?.(template)}
                    style={{ flex: 1, padding: '8px 12px', background: '#8b5cf6', color: 'white', border: 'none', borderRadius: '6px', fontSize: '12px', fontWeight: 'bold', cursor: 'pointer' }}
                  >
                    Load
                  </button>
                  <button
                    onClick={() => onDeleteTemplate?.(template.id)}
                    style={{ padding: '8px 12px', background: '#ef4444', color: 'white', border: 'none', borderRadius: '6px', fontSize: '12px', cursor: 'pointer' }}
                  >
                    Delete
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
          {['search', 'favorites', 'recent'].map(tab => (
            <button
              key={tab}
              onClick={() => setProductTab(tab)}
              style={{
                padding: '8px 16px',
                background: productTab === tab ? '#3b82f6' : 'transparent',
                color: productTab === tab ? 'white' : '#6b7280',
                border: 'none',
                borderRadius: '8px 8px 0 0',
                fontSize: '14px',
                fontWeight: 'bold',
                cursor: 'pointer',
                marginBottom: '-2px'
              }}
            >
              {tab === 'search' && 'Search'}
              {tab === 'favorites' && `Favorites (${favoriteProducts?.length || 0})`}
              {tab === 'recent' && `Recent (${recentProducts?.length || 0})`}
            </button>
          ))}
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

            {productSearchTerm && filteredProducts.length > 0 && (
              <div style={{ maxHeight: '300px', overflowY: 'auto', border: '1px solid #d1d5db', borderRadius: '8px', marginBottom: '16px' }}>
                {filteredProducts.map(product => (
                  <div
                    key={product.id}
                    style={{ padding: '12px', borderBottom: '1px solid #e5e7eb', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}
                    onMouseEnter={(e) => e.currentTarget.style.background = '#f9fafb'}
                    onMouseLeave={(e) => e.currentTarget.style.background = 'white'}
                  >
                    <div style={{ flex: 1, cursor: 'pointer' }} onClick={() => addProductToQuote(product)}>
                      <div style={{ fontWeight: 'bold', marginBottom: '4px' }}>
                        {product.manufacturer} - {product.model_number}
                      </div>
                      <div style={{ fontSize: '12px', color: '#6b7280' }}>
                        SKU: {product.sku || product.model_number} • {product.category}
                      </div>
                    </div>
                    <div style={{ textAlign: 'right', marginRight: '16px' }}>
                      <div style={{ fontWeight: 'bold' }}>${((product.msrp_cents || 0) / 100).toFixed(2)}</div>
                      <div style={{ fontSize: '12px', color: '#6b7280' }}>Cost: ${((product.cost_cents || 0) / 100).toFixed(2)}</div>
                    </div>
                    <button
                      onClick={() => addProductToQuote(product)}
                      style={{ padding: '6px 12px', background: '#3b82f6', color: 'white', border: 'none', borderRadius: '6px', fontSize: '12px', cursor: 'pointer' }}
                    >
                      Add
                    </button>
                  </div>
                ))}
              </div>
            )}
          </>
        )}

        {/* Favorites Tab */}
        {productTab === 'favorites' && favoriteProducts && favoriteProducts.length > 0 && (
          <div style={{ maxHeight: '300px', overflowY: 'auto', border: '1px solid #d1d5db', borderRadius: '8px' }}>
            {favoriteProducts.map(product => (
              <div key={product.id} style={{ padding: '12px', borderBottom: '1px solid #e5e7eb', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div style={{ flex: 1, cursor: 'pointer' }} onClick={() => addProductToQuote(product)}>
                  <div style={{ fontWeight: 'bold' }}>{product.manufacturer} - {product.model_number}</div>
                  <div style={{ fontSize: '12px', color: '#6b7280' }}>{product.category}</div>
                </div>
                <button onClick={() => addProductToQuote(product)} style={{ padding: '6px 12px', background: '#3b82f6', color: 'white', border: 'none', borderRadius: '6px', fontSize: '12px', cursor: 'pointer' }}>Add</button>
              </div>
            ))}
          </div>
        )}

        {/* Recent Tab */}
        {productTab === 'recent' && recentProducts && recentProducts.length > 0 && (
          <div style={{ maxHeight: '300px', overflowY: 'auto', border: '1px solid #d1d5db', borderRadius: '8px' }}>
            {recentProducts.map(product => (
              <div key={product.id} style={{ padding: '12px', borderBottom: '1px solid #e5e7eb', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div style={{ flex: 1, cursor: 'pointer' }} onClick={() => addProductToQuote(product)}>
                  <div style={{ fontWeight: 'bold' }}>{product.manufacturer} - {product.model_number}</div>
                  <div style={{ fontSize: '12px', color: '#6b7280' }}>{product.category}</div>
                </div>
                <button onClick={() => addProductToQuote(product)} style={{ padding: '6px 12px', background: '#3b82f6', color: 'white', border: 'none', borderRadius: '6px', fontSize: '12px', cursor: 'pointer' }}>Add</button>
              </div>
            ))}
          </div>
        )}

        {/* Service Items Quick Add */}
        <div style={{ marginTop: '16px' }}>
          <h4 style={{ fontSize: '14px', fontWeight: 'bold', marginBottom: '12px' }}>Quick Add Services:</h4>
          <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
            {SERVICE_ITEMS.map(service => (
              <button
                key={service.sku}
                onClick={() => addServiceItem(service)}
                style={{ padding: '8px 16px', background: '#f0f9ff', color: '#3b82f6', border: '1px solid #3b82f6', borderRadius: '6px', fontSize: '12px', cursor: 'pointer', fontWeight: 'bold' }}
              >
                + {service.name}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Quote Items - Empty State */}
      {quoteItems.length === 0 && selectedCustomer && (
        <div style={{ background: 'white', padding: '24px', borderRadius: '12px', marginBottom: '24px', boxShadow: '0 1px 3px rgba(0,0,0,0.1)' }}>
          <h3 style={{ fontSize: '18px', fontWeight: 'bold', marginBottom: '16px' }}>
            3. Quote Items <span style={{ color: '#ef4444' }}>*</span>
          </h3>
          <div style={{ padding: '12px 16px', background: '#fef2f2', border: '1px solid #fecaca', borderRadius: '6px', color: '#991b1b', fontSize: '14px', fontWeight: '600' }}>
            Please add at least one item to the quote
          </div>
        </div>
      )}

      {/* Quote Items Table */}
      {quoteItems.length > 0 && (
        <div style={{ background: 'white', padding: '24px', borderRadius: '12px', marginBottom: '24px', boxShadow: '0 1px 3px rgba(0,0,0,0.1)' }}>
          <h3 style={{ fontSize: '18px', fontWeight: 'bold', marginBottom: '16px' }}>3. Quote Items</h3>

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
                const isLowMargin = margin < 5 && !isPriceBelowCost;

                return (
                  <React.Fragment key={idx}>
                    <tr style={{ borderBottom: (isPriceBelowCost || isLowMargin) ? 'none' : '1px solid #e5e7eb' }}>
                      <td style={{ padding: '12px' }}>
                        <div style={{ fontWeight: 'bold' }}>{item.manufacturer} - {item.model}</div>
                        <div style={{ fontSize: '12px', color: '#6b7280' }}>SKU: {item.sku || item.model}</div>
                      </td>
                      <td style={{ padding: '12px', textAlign: 'center' }}>
                        <input
                          type="number"
                          min="1"
                          value={item.quantity}
                          onChange={(e) => updateQuoteItem(idx, 'quantity', parseInt(e.target.value) || 1)}
                          style={{ width: '60px', padding: '6px', border: '1px solid #d1d5db', borderRadius: '4px', textAlign: 'center' }}
                        />
                      </td>
                      <td style={{ padding: '12px', textAlign: 'right', color: '#6b7280' }}>${item.cost.toFixed(2)}</td>
                      <td style={{ padding: '12px', textAlign: 'right', color: '#6b7280' }}>${item.msrp.toFixed(2)}</td>
                      <td style={{ padding: '12px', textAlign: 'right' }}>
                        <input
                          type="number"
                          min="0"
                          step="0.01"
                          value={item.sell}
                          onChange={(e) => updateQuoteItem(idx, 'sell', parseFloat(e.target.value) || 0)}
                          style={{ width: '100px', padding: '6px', border: '1px solid #d1d5db', borderRadius: '4px', textAlign: 'right' }}
                        />
                      </td>
                      <td style={{ padding: '12px', textAlign: 'right', fontWeight: 'bold', color: margin >= 20 ? '#10b981' : margin >= 10 ? '#f59e0b' : '#ef4444' }}>
                        {margin.toFixed(1)}%
                      </td>
                      <td style={{ padding: '12px', textAlign: 'right', fontWeight: 'bold' }}>${lineTotal.toFixed(2)}</td>
                      <td style={{ padding: '12px', textAlign: 'center' }}>
                        <button onClick={() => removeQuoteItem(idx)} style={{ padding: '4px 8px', background: '#ef4444', color: 'white', border: 'none', borderRadius: '4px', cursor: 'pointer' }}>×</button>
                      </td>
                    </tr>
                    {(isPriceBelowCost || isLowMargin) && (
                      <tr style={{ borderBottom: '1px solid #e5e7eb' }}>
                        <td colSpan="8" style={{ padding: '8px 12px', background: '#fef2f2' }}>
                          {isPriceBelowCost && (
                            <span style={{ padding: '4px 12px', background: '#fee2e2', border: '1px solid #fecaca', borderRadius: '6px', color: '#991b1b', fontSize: '13px', fontWeight: '600' }}>
                              Price (${item.sell.toFixed(2)}) is below cost (${item.cost.toFixed(2)})
                            </span>
                          )}
                          {isLowMargin && (
                            <span style={{ padding: '4px 12px', background: '#fef3c7', border: '1px solid #fde047', borderRadius: '6px', color: '#92400e', fontSize: '13px', fontWeight: '600' }}>
                              Low margin: {margin.toFixed(1)}%
                            </span>
                          )}
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

      {/* Smart Suggestions */}
      {smartSuggestions && showSuggestions && quoteItems.length > 0 && (
        <div style={{ background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)', padding: '20px', borderRadius: '8px', marginBottom: '20px', color: 'white' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '15px' }}>
            <h3 style={{ margin: 0, fontSize: '18px' }}>Smart Suggestions</h3>
            <button onClick={() => setShowSuggestions(false)} style={{ background: 'rgba(255,255,255,0.2)', border: 'none', color: 'white', padding: '5px 15px', borderRadius: '5px', cursor: 'pointer' }}>Dismiss</button>
          </div>
          {getSuggestionsSummary(smartSuggestions, totals.total).messages.map((msg, idx) => (
            <div key={idx} style={{ marginBottom: '8px', fontSize: '14px' }}>{msg}</div>
          ))}
          <button onClick={() => setShowRevenueFeatures(true)} style={{ background: 'white', color: '#667eea', border: 'none', padding: '10px 20px', borderRadius: '5px', cursor: 'pointer', fontWeight: 'bold', marginTop: '10px' }}>
            View Suggestions
          </button>
        </div>
      )}

      {/* Revenue Features */}
      {quoteItems.length > 0 && (
        <div style={{ marginTop: '30px', padding: '20px', backgroundColor: '#f8f9fa', borderRadius: '8px', border: '2px solid #4CAF50' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
            <h3 style={{ margin: 0, color: '#4CAF50' }}>Revenue Features - Maximize Your Sale!</h3>
            <button onClick={() => setShowRevenueFeatures(!showRevenueFeatures)} style={{ padding: '10px 20px', backgroundColor: '#4CAF50', color: 'white', border: 'none', borderRadius: '4px', cursor: 'pointer', fontWeight: 'bold' }}>
              {showRevenueFeatures ? 'Hide Revenue Features' : 'Show Revenue Features'}
            </button>
          </div>

          {showRevenueFeatures && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
              <FinancingCalculator quoteTotal={totals.total * 100} onFinancingSelected={(financing) => { setQuoteFinancing(financing); logger.log('Financing selected:', financing); }} />
              <WarrantySelector products={quoteItems} onWarrantyAdded={(warranty) => { setQuoteWarranties([...quoteWarranties, warranty]); logger.log('Warranty added:', warranty); }} />
              <DeliverySelector customerAddress={selectedCustomer ? `${selectedCustomer.address || ''}, ${selectedCustomer.city || ''}` : 'Customer address'} onDeliverySelected={(delivery) => { setQuoteDelivery(delivery); logger.log('Delivery selected:', delivery); }} />
              <RebatesDisplay products={quoteItems} onRebateApplied={(rebates) => { setQuoteRebates(rebates); logger.log('Rebates applied:', rebates); }} />
              <TradeInEstimator onTradeInAdded={(tradeIn) => { setQuoteTradeIns([...quoteTradeIns, tradeIn]); logger.log('Trade-in added:', tradeIn); }} />

              {/* Applied Features Summary */}
              {(quoteFinancing || quoteWarranties.length > 0 || quoteDelivery || quoteRebates.length > 0 || quoteTradeIns.length > 0) && (
                <div style={{ backgroundColor: '#e8f5e9', padding: '20px', borderRadius: '8px', marginTop: '20px' }}>
                  <h4 style={{ marginTop: 0 }}>Applied Revenue Features:</h4>
                  {quoteFinancing && <div style={{ marginBottom: '10px' }}><span style={{ fontWeight: 'bold' }}>Financing:</span> {quoteFinancing.plan.plan_name} - ${(quoteFinancing.calculation.monthlyPaymentCents / 100).toFixed(2)}/month</div>}
                  {quoteWarranties.length > 0 && <div style={{ marginBottom: '10px' }}><span style={{ fontWeight: 'bold' }}>Warranties:</span> {quoteWarranties.length} plans (${quoteWarranties.reduce((sum, w) => sum + (w.cost / 100), 0).toFixed(2)})</div>}
                  {quoteDelivery && <div style={{ marginBottom: '10px' }}><span style={{ fontWeight: 'bold' }}>Delivery:</span> {quoteDelivery.service.service_name} - ${(quoteDelivery.calculation.totalCents / 100).toFixed(2)}</div>}
                  {quoteRebates.length > 0 && <div style={{ marginBottom: '10px' }}><span style={{ fontWeight: 'bold' }}>Rebates:</span> {quoteRebates.length} applied</div>}
                  {quoteTradeIns.length > 0 && <div style={{ marginBottom: '10px' }}><span style={{ fontWeight: 'bold' }}>Trade-Ins:</span> {quoteTradeIns.length} - Credit: ${quoteTradeIns.reduce((sum, t) => sum + (t.estimatedValueCents / 100), 0).toFixed(2)}</div>}
                  <button onClick={clearRevenueFeatures} style={{ marginTop: '10px', padding: '8px 16px', backgroundColor: '#f44336', color: 'white', border: 'none', borderRadius: '4px', cursor: 'pointer' }}>Clear All Revenue Features</button>
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* Delivery, Sales & Service Options */}
      {quoteItems.length > 0 && (
        <div style={{ background: 'white', padding: '24px', borderRadius: '12px', marginBottom: '24px', boxShadow: '0 1px 3px rgba(0,0,0,0.1)' }}>
          <h3 style={{ fontSize: '18px', fontWeight: 'bold', marginBottom: '16px' }}>4. Delivery & Service Options</h3>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '24px' }}>
            {/* Left Column: Delivery Info */}
            <div>
              <h4 style={{ fontSize: '16px', fontWeight: 'bold', marginBottom: '12px', color: '#3b82f6' }}>📦 Delivery Information</h4>

              <div style={{ marginBottom: '12px' }}>
                <label style={{ display: 'block', fontWeight: '500', marginBottom: '4px', fontSize: '14px' }}>Delivery Address (if different from customer):</label>
                <input
                  type="text"
                  value={deliveryAddress || ''}
                  onChange={(e) => setDeliveryAddress(e.target.value)}
                  placeholder="Leave blank to use customer address"
                  style={{ width: '100%', padding: '10px', border: '1px solid #d1d5db', borderRadius: '6px', fontSize: '14px' }}
                />
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: '12px', marginBottom: '12px' }}>
                <div>
                  <label style={{ display: 'block', fontWeight: '500', marginBottom: '4px', fontSize: '14px' }}>City:</label>
                  <input
                    type="text"
                    value={deliveryCity || ''}
                    onChange={(e) => setDeliveryCity(e.target.value)}
                    style={{ width: '100%', padding: '10px', border: '1px solid #d1d5db', borderRadius: '6px', fontSize: '14px' }}
                  />
                </div>
                <div>
                  <label style={{ display: 'block', fontWeight: '500', marginBottom: '4px', fontSize: '14px' }}>Postal Code:</label>
                  <input
                    type="text"
                    value={deliveryPostalCode || ''}
                    onChange={(e) => setDeliveryPostalCode(e.target.value)}
                    style={{ width: '100%', padding: '10px', border: '1px solid #d1d5db', borderRadius: '6px', fontSize: '14px' }}
                  />
                </div>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px', marginBottom: '12px' }}>
                <div>
                  <label style={{ display: 'block', fontWeight: '500', marginBottom: '4px', fontSize: '14px' }}>Delivery Date:</label>
                  <input
                    type="date"
                    value={deliveryDate || ''}
                    onChange={(e) => setDeliveryDate(e.target.value)}
                    style={{ width: '100%', padding: '10px', border: '1px solid #d1d5db', borderRadius: '6px', fontSize: '14px' }}
                  />
                </div>
                <div>
                  <label style={{ display: 'block', fontWeight: '500', marginBottom: '4px', fontSize: '14px' }}>Time Slot:</label>
                  <select
                    value={deliveryTimeSlot || ''}
                    onChange={(e) => setDeliveryTimeSlot(e.target.value)}
                    style={{ width: '100%', padding: '10px', border: '1px solid #d1d5db', borderRadius: '6px', fontSize: '14px' }}
                  >
                    <option value="">Select time...</option>
                    <option value="morning">Morning (8am-12pm)</option>
                    <option value="afternoon">Afternoon (12pm-4pm)</option>
                    <option value="evening">Evening (4pm-8pm)</option>
                    <option value="allday">All Day</option>
                    <option value="first">First Available</option>
                  </select>
                </div>
              </div>

              <div style={{ marginBottom: '12px' }}>
                <label style={{ display: 'block', fontWeight: '500', marginBottom: '4px', fontSize: '14px' }}>Delivery Instructions:</label>
                <textarea
                  value={deliveryInstructions || ''}
                  onChange={(e) => setDeliveryInstructions(e.target.value)}
                  placeholder="Stairs, elevator access, parking info, access codes..."
                  rows="2"
                  style={{ width: '100%', padding: '10px', border: '1px solid #d1d5db', borderRadius: '6px', fontSize: '14px', resize: 'vertical' }}
                />
              </div>

              {/* Installation Options */}
              <div style={{ marginTop: '16px', padding: '12px', background: '#f0fdf4', borderRadius: '8px', border: '1px solid #bbf7d0' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '12px' }}>
                  <label style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer' }}>
                    <input
                      type="checkbox"
                      checked={installationRequired || false}
                      onChange={(e) => setInstallationRequired(e.target.checked)}
                      style={{ width: '18px', height: '18px' }}
                    />
                    <span style={{ fontWeight: '500' }}>🔧 Installation Required</span>
                  </label>
                </div>

                {installationRequired && (
                  <div style={{ marginLeft: '26px' }}>
                    <select
                      value={installationType || ''}
                      onChange={(e) => setInstallationType(e.target.value)}
                      style={{ width: '100%', padding: '8px', border: '1px solid #d1d5db', borderRadius: '6px', fontSize: '14px' }}
                    >
                      <option value="">Select installation type...</option>
                      <option value="basic">Basic Installation</option>
                      <option value="premium">Premium Installation (Full Setup)</option>
                      <option value="wallmount">Wall Mount (TV)</option>
                      <option value="builtin">Built-In Installation</option>
                      <option value="custom">Custom Installation</option>
                    </select>
                  </div>
                )}

                <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginTop: '12px' }}>
                  <label style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer' }}>
                    <input
                      type="checkbox"
                      checked={haulAwayRequired || false}
                      onChange={(e) => setHaulAwayRequired(e.target.checked)}
                      style={{ width: '18px', height: '18px' }}
                    />
                    <span style={{ fontWeight: '500' }}>🚛 Haul Away Old Appliance</span>
                  </label>
                </div>

                {haulAwayRequired && (
                  <div style={{ marginLeft: '26px', marginTop: '8px' }}>
                    <input
                      type="text"
                      value={haulAwayItems || ''}
                      onChange={(e) => setHaulAwayItems(e.target.value)}
                      placeholder="Describe items to haul away..."
                      style={{ width: '100%', padding: '8px', border: '1px solid #d1d5db', borderRadius: '6px', fontSize: '14px' }}
                    />
                  </div>
                )}
              </div>
            </div>

            {/* Right Column: Sales & Payment Info */}
            <div>
              <h4 style={{ fontSize: '16px', fontWeight: 'bold', marginBottom: '12px', color: '#10b981' }}>💼 Sales Information</h4>

              <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: '12px', marginBottom: '12px' }}>
                <div>
                  <label style={{ display: 'block', fontWeight: '500', marginBottom: '4px', fontSize: '14px' }}>Sales Rep:</label>
                  <input
                    type="text"
                    value={salesRepName || ''}
                    onChange={(e) => setSalesRepName(e.target.value)}
                    placeholder="Sales rep name"
                    style={{ width: '100%', padding: '10px', border: '1px solid #d1d5db', borderRadius: '6px', fontSize: '14px' }}
                  />
                </div>
                <div>
                  <label style={{ display: 'block', fontWeight: '500', marginBottom: '4px', fontSize: '14px' }}>Commission %:</label>
                  <input
                    type="number"
                    min="0"
                    max="100"
                    step="0.5"
                    value={commissionPercent || 5}
                    onChange={(e) => setCommissionPercent(parseFloat(e.target.value) || 0)}
                    style={{ width: '100%', padding: '10px', border: '1px solid #d1d5db', borderRadius: '6px', fontSize: '14px' }}
                  />
                </div>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px', marginBottom: '12px' }}>
                <div>
                  <label style={{ display: 'block', fontWeight: '500', marginBottom: '4px', fontSize: '14px' }}>Referral Source:</label>
                  <select
                    value={referralSource || ''}
                    onChange={(e) => setReferralSource(e.target.value)}
                    style={{ width: '100%', padding: '10px', border: '1px solid #d1d5db', borderRadius: '6px', fontSize: '14px' }}
                  >
                    <option value="">Select source...</option>
                    <option value="walk-in">Walk-in</option>
                    <option value="website">Website</option>
                    <option value="google">Google Search</option>
                    <option value="facebook">Facebook</option>
                    <option value="instagram">Instagram</option>
                    <option value="referral-customer">Referral - Customer</option>
                    <option value="referral-builder">Referral - Builder/Contractor</option>
                    <option value="referral-designer">Referral - Designer</option>
                    <option value="repeat">Repeat Customer</option>
                    <option value="ad">Advertisement</option>
                    <option value="other">Other</option>
                  </select>
                </div>
                <div>
                  <label style={{ display: 'block', fontWeight: '500', marginBottom: '4px', fontSize: '14px' }}>Referrer Name:</label>
                  <input
                    type="text"
                    value={referralName || ''}
                    onChange={(e) => setReferralName(e.target.value)}
                    placeholder="Who referred them?"
                    style={{ width: '100%', padding: '10px', border: '1px solid #d1d5db', borderRadius: '6px', fontSize: '14px' }}
                  />
                </div>
              </div>

              <h4 style={{ fontSize: '16px', fontWeight: 'bold', marginBottom: '12px', marginTop: '20px', color: '#8b5cf6' }}>💳 Payment & Priority</h4>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px', marginBottom: '12px' }}>
                <div>
                  <label style={{ display: 'block', fontWeight: '500', marginBottom: '4px', fontSize: '14px' }}>Priority Level:</label>
                  <select
                    value={priorityLevel || 'standard'}
                    onChange={(e) => setPriorityLevel(e.target.value)}
                    style={{ width: '100%', padding: '10px', border: '1px solid #d1d5db', borderRadius: '6px', fontSize: '14px' }}
                  >
                    <option value="standard">Standard</option>
                    <option value="preferred">Preferred Customer</option>
                    <option value="vip">VIP</option>
                    <option value="urgent">Urgent</option>
                  </select>
                </div>
                <div>
                  <label style={{ display: 'block', fontWeight: '500', marginBottom: '4px', fontSize: '14px' }}>Payment Method:</label>
                  <select
                    value={paymentMethod || ''}
                    onChange={(e) => setPaymentMethod(e.target.value)}
                    style={{ width: '100%', padding: '10px', border: '1px solid #d1d5db', borderRadius: '6px', fontSize: '14px' }}
                  >
                    <option value="">Select method...</option>
                    <option value="cash">Cash</option>
                    <option value="credit">Credit Card</option>
                    <option value="debit">Debit</option>
                    <option value="financing">Financing</option>
                    <option value="check">Check</option>
                    <option value="etransfer">E-Transfer</option>
                  </select>
                </div>
              </div>

              {/* Deposit Section */}
              <div style={{ marginTop: '16px', padding: '12px', background: '#fef3c7', borderRadius: '8px', border: '1px solid #fcd34d' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '12px' }}>
                  <label style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer' }}>
                    <input
                      type="checkbox"
                      checked={depositRequired || false}
                      onChange={(e) => setDepositRequired(e.target.checked)}
                      style={{ width: '18px', height: '18px' }}
                    />
                    <span style={{ fontWeight: '500' }}>💰 Deposit Required</span>
                  </label>
                </div>

                {depositRequired && (
                  <div style={{ marginLeft: '26px' }}>
                    <label style={{ display: 'block', fontWeight: '500', marginBottom: '4px', fontSize: '14px' }}>Deposit Amount ($):</label>
                    <input
                      type="number"
                      min="0"
                      step="0.01"
                      value={depositAmount || 0}
                      onChange={(e) => setDepositAmount(parseFloat(e.target.value) || 0)}
                      style={{ width: '150px', padding: '8px', border: '1px solid #d1d5db', borderRadius: '6px', fontSize: '14px' }}
                    />
                  </div>
                )}
              </div>

              {/* Special Instructions */}
              <div style={{ marginTop: '16px' }}>
                <label style={{ display: 'block', fontWeight: '500', marginBottom: '4px', fontSize: '14px' }}>Special Instructions:</label>
                <textarea
                  value={specialInstructions || ''}
                  onChange={(e) => setSpecialInstructions(e.target.value)}
                  placeholder="Any special handling requirements..."
                  rows="2"
                  style={{ width: '100%', padding: '10px', border: '1px solid #d1d5db', borderRadius: '6px', fontSize: '14px', resize: 'vertical' }}
                />
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Summary & Totals */}
      {quoteItems.length > 0 && (
        <div style={{ background: 'white', padding: '24px', borderRadius: '12px', marginBottom: '24px', boxShadow: '0 1px 3px rgba(0,0,0,0.1)' }}>
          <h3 style={{ fontSize: '18px', fontWeight: 'bold', marginBottom: '16px' }}>5. Quote Summary</h3>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '24px' }}>
            {/* Left: Notes & Discount */}
            <div>
              <div style={{ marginBottom: '16px' }}>
                <label style={{ display: 'block', fontWeight: 'bold', marginBottom: '8px' }}>Discount %:</label>
                <input type="number" min="0" max="100" step="0.1" value={discountPercent} onChange={(e) => setDiscountPercent(parseFloat(e.target.value) || 0)} style={{ width: '100%', padding: '12px', border: '1px solid #d1d5db', borderRadius: '8px' }} />
              </div>

              <div style={{ marginBottom: '16px' }}>
                <label style={{ display: 'block', fontWeight: 'bold', marginBottom: '8px' }}>Customer Notes:</label>
                <textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows="3" placeholder="Add notes visible to customer..." style={{ width: '100%', padding: '12px', border: '1px solid #d1d5db', borderRadius: '8px', resize: 'vertical' }} />
              </div>

              <div style={{ marginBottom: '16px' }}>
                <label style={{ display: 'block', fontWeight: 'bold', marginBottom: '8px' }}>Internal Notes (Private):</label>
                <textarea value={internalNotes} onChange={(e) => setInternalNotes(e.target.value)} rows="3" placeholder="Internal notes (NOT visible to customer)..." style={{ width: '100%', padding: '12px', border: '2px solid #fee2e2', borderRadius: '8px', resize: 'vertical', background: '#fef2f2' }} />
              </div>

              <div>
                <label style={{ display: 'block', fontWeight: 'bold', marginBottom: '8px' }}>Payment Terms:</label>
                {paymentTermsTemplates.length > 0 && (
                  <select onChange={(e) => { const t = paymentTermsTemplates.find(t => t.id === parseInt(e.target.value)); if (t) setTerms(t.terms_text); }} style={{ width: '100%', padding: '12px', border: '1px solid #d1d5db', borderRadius: '8px', marginBottom: '12px', fontSize: '14px' }}>
                    <option value="">Select a template...</option>
                    {paymentTermsTemplates.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
                  </select>
                )}
                <textarea value={terms} onChange={(e) => setTerms(e.target.value)} rows="3" placeholder="Payment terms..." style={{ width: '100%', padding: '12px', border: '1px solid #d1d5db', borderRadius: '8px', resize: 'vertical' }} />
              </div>
            </div>

            {/* Right: Totals */}
            <div style={{ padding: '24px', background: '#f9fafb', borderRadius: '8px', border: '2px solid #e5e7eb' }}>
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

              {totals.deliveryCost > 0 && <div style={{ marginBottom: '12px', display: 'flex', justifyContent: 'space-between', color: '#4CAF50' }}><span>Delivery & Installation:</span><span style={{ fontWeight: 'bold' }}>+${totals.deliveryCost.toFixed(2)}</span></div>}
              {totals.warrantiesCost > 0 && <div style={{ marginBottom: '12px', display: 'flex', justifyContent: 'space-between', color: '#4CAF50' }}><span>Extended Warranties:</span><span style={{ fontWeight: 'bold' }}>+${totals.warrantiesCost.toFixed(2)}</span></div>}
              {totals.tradeInCredit > 0 && <div style={{ marginBottom: '12px', display: 'flex', justifyContent: 'space-between', color: '#2196F3' }}><span>Trade-In Credit:</span><span style={{ fontWeight: 'bold' }}>-${totals.tradeInCredit.toFixed(2)}</span></div>}
              {totals.rebateCredit > 0 && <div style={{ marginBottom: '12px', display: 'flex', justifyContent: 'space-between', color: '#2196F3' }}><span>Manufacturer Rebates:</span><span style={{ fontWeight: 'bold' }}>-${totals.rebateCredit.toFixed(2)}</span></div>}

              <div style={{ borderTop: '2px solid #ddd', marginTop: '10px', paddingTop: '10px', marginBottom: '12px', display: 'flex', justifyContent: 'space-between' }}>
                <span>Subtotal after add-ons:</span>
                <span style={{ fontWeight: 'bold' }}>${totals.afterAddOns.toFixed(2)}</span>
              </div>

              <div style={{ marginBottom: '12px', display: 'flex', justifyContent: 'space-between' }}>
                <span>HST (13%):</span>
                <span style={{ fontWeight: 'bold' }}>${totals.tax.toFixed(2)}</span>
              </div>

              <div style={{ paddingTop: '12px', marginTop: '12px', borderTop: '2px solid #333', display: 'flex', justifyContent: 'space-between', fontSize: '20px' }}>
                <span style={{ fontWeight: 'bold' }}>TOTAL:</span>
                <span style={{ fontWeight: 'bold', color: '#3b82f6' }}>${totals.total.toFixed(2)}</span>
              </div>

              {totals.financing && (
                <div style={{ marginTop: '15px', padding: '10px', backgroundColor: '#e3f2fd', borderRadius: '4px', textAlign: 'center' }}>
                  <div style={{ fontSize: '14px', color: '#666' }}>Or as low as:</div>
                  <div style={{ fontSize: '20px', fontWeight: 'bold', color: '#2196F3' }}>${(totals.financing.calculation.monthlyPaymentCents / 100).toFixed(2)}/month</div>
                </div>
              )}

              <div style={{ marginTop: '16px', paddingTop: '16px', borderTop: '1px solid #d1d5db' }}>
                <div style={{ marginBottom: '8px', display: 'flex', justifyContent: 'space-between', color: '#10b981' }}>
                  <span>Gross Profit:</span>
                  <span style={{ fontWeight: 'bold' }}>${totals.profit.toFixed(2)}</span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <span>Profit Margin:</span>
                  <span style={{ fontWeight: 'bold', color: totals.profitMargin >= 20 ? '#10b981' : totals.profitMargin >= 10 ? '#f59e0b' : '#ef4444' }}>
                    {totals.profitMargin.toFixed(1)}%
                  </span>
                </div>
                {totals.profitMargin < 5 && (
                  <div style={{ marginTop: '12px', padding: '8px 12px', background: '#fef2f2', border: '1px solid #fecaca', borderRadius: '6px', color: '#991b1b', fontSize: '13px', fontWeight: '600' }}>
                    Overall margin is very low ({totals.profitMargin.toFixed(1)}%)
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* Quote Protection Settings */}
          <div style={{ background: 'white', borderRadius: '12px', padding: '24px', marginTop: '24px', boxShadow: '0 2px 4px rgba(0,0,0,0.1)' }}>
            <h3 style={{ fontSize: '18px', fontWeight: 'bold', marginBottom: '16px', display: 'flex', alignItems: 'center', gap: '8px' }}>Quote Protection Settings</h3>
            <div style={{ display: 'grid', gap: '16px' }}>
              <label style={{ display: 'flex', alignItems: 'center', gap: '12px', cursor: 'pointer', padding: '12px', background: '#f9fafb', borderRadius: '8px' }}>
                <input type="checkbox" checked={hideModelNumbers} onChange={(e) => setHideModelNumbers(e.target.checked)} style={{ width: '20px', height: '20px', cursor: 'pointer' }} />
                <div>
                  <div style={{ fontWeight: '600', fontSize: '14px' }}>Hide Model Numbers</div>
                  <div style={{ fontSize: '12px', color: '#6b7280' }}>Protects pricing from competitors</div>
                </div>
              </label>

              <div style={{ padding: '12px', background: '#f9fafb', borderRadius: '8px' }}>
                <label style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '8px' }}>
                  <input type="checkbox" checked={watermarkEnabled} onChange={(e) => setWatermarkEnabled(e.target.checked)} style={{ width: '20px', height: '20px', cursor: 'pointer' }} />
                  <span style={{ fontWeight: '600', fontSize: '14px' }}>Enable PDF Watermark</span>
                </label>
                {watermarkEnabled && (
                  <div style={{ marginLeft: '32px' }}>
                    <input type="text" value={watermarkText} onChange={(e) => setWatermarkText(e.target.value)} placeholder="CONFIDENTIAL - FOR {CUSTOMER} ONLY" style={{ width: '100%', padding: '8px 12px', border: '1px solid #d1d5db', borderRadius: '6px', fontSize: '14px' }} />
                  </div>
                )}
              </div>

              <div style={{ padding: '12px', background: '#f9fafb', borderRadius: '8px' }}>
                <label style={{ fontSize: '14px', fontWeight: '600', display: 'block', marginBottom: '8px' }}>Quote Expires:</label>
                <input type="date" value={quoteExpiryDate} onChange={(e) => setQuoteExpiryDate(e.target.value)} min={new Date().toISOString().split('T')[0]} style={{ padding: '8px 12px', border: '1px solid #d1d5db', borderRadius: '6px', fontSize: '14px' }} />
              </div>
            </div>
          </div>

          {/* Save Buttons */}
          <div style={{ marginTop: '24px', textAlign: 'center', display: 'flex', gap: '16px', justifyContent: 'center', flexWrap: 'wrap' }}>
            <button
              onClick={onSave}
              disabled={!selectedCustomer || quoteItems.length === 0}
              style={{ padding: '16px 48px', background: (!selectedCustomer || quoteItems.length === 0) ? '#9ca3af' : '#10b981', color: 'white', border: 'none', borderRadius: '8px', fontSize: '18px', fontWeight: 'bold', cursor: (!selectedCustomer || quoteItems.length === 0) ? 'not-allowed' : 'pointer' }}
            >
              {editingQuoteId ? 'Update Quote' : 'Save Quote'}
            </button>

            <button
              onClick={onSaveAndSend}
              disabled={!selectedCustomer || quoteItems.length === 0}
              style={{
                padding: '16px 48px',
                background: (!selectedCustomer || quoteItems.length === 0) ? '#9ca3af' : '#3b82f6',
                color: 'white',
                border: 'none',
                borderRadius: '8px',
                fontSize: '18px',
                fontWeight: 'bold',
                cursor: (!selectedCustomer || quoteItems.length === 0) ? 'not-allowed' : 'pointer',
                display: 'flex',
                alignItems: 'center',
                gap: '8px'
              }}
            >
              <span>Save & Send</span>
              <span style={{ fontSize: '16px' }}>📧</span>
            </button>

            <button
              onClick={() => setShowTemplateSaveDialog(true)}
              disabled={quoteItems.length === 0}
              style={{ padding: '16px 48px', background: quoteItems.length === 0 ? '#9ca3af' : '#8b5cf6', color: 'white', border: 'none', borderRadius: '8px', fontSize: '18px', fontWeight: 'bold', cursor: quoteItems.length === 0 ? 'not-allowed' : 'pointer' }}
            >
              Save as Template
            </button>
          </div>
        </div>
      )}

      {/* Template Save Dialog */}
      {showTemplateSaveDialog && (
        <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(0, 0, 0, 0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 }}>
          <div style={{ background: 'white', padding: '32px', borderRadius: '12px', boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.1)', minWidth: '500px', maxWidth: '600px' }}>
            <h3 style={{ fontSize: '24px', fontWeight: 'bold', marginBottom: '24px' }}>Save as Template</h3>

            <div style={{ marginBottom: '20px' }}>
              <label style={{ display: 'block', fontWeight: 'bold', marginBottom: '8px' }}>Template Name <span style={{ color: '#ef4444' }}>*</span></label>
              <input type="text" value={templateName} onChange={(e) => setTemplateName(e.target.value)} placeholder="e.g., Standard Kitchen Package..." style={{ width: '100%', padding: '12px', border: '2px solid #d1d5db', borderRadius: '8px', fontSize: '14px' }} autoFocus />
            </div>

            <div style={{ marginBottom: '24px' }}>
              <label style={{ display: 'block', fontWeight: 'bold', marginBottom: '8px' }}>Description (Optional)</label>
              <textarea value={templateDescription} onChange={(e) => setTemplateDescription(e.target.value)} placeholder="Brief description..." rows="3" style={{ width: '100%', padding: '12px', border: '2px solid #d1d5db', borderRadius: '8px', fontSize: '14px', resize: 'vertical' }} />
            </div>

            <div style={{ padding: '12px', background: '#f0f9ff', border: '1px solid #bfdbfe', borderRadius: '8px', marginBottom: '24px', fontSize: '13px', color: '#1e40af' }}>
              This will save {quoteItems.length} items, {discountPercent}% discount, notes, and terms as a reusable template.
            </div>

            <div style={{ display: 'flex', gap: '12px', justifyContent: 'flex-end' }}>
              <button onClick={() => { setShowTemplateSaveDialog(false); setTemplateName(''); setTemplateDescription(''); }} style={{ padding: '12px 24px', background: '#6b7280', color: 'white', border: 'none', borderRadius: '8px', fontSize: '16px', fontWeight: 'bold', cursor: 'pointer' }}>Cancel</button>
              <button onClick={handleSaveTemplate} disabled={!templateName.trim()} style={{ padding: '12px 24px', background: templateName.trim() ? '#8b5cf6' : '#9ca3af', color: 'white', border: 'none', borderRadius: '8px', fontSize: '16px', fontWeight: 'bold', cursor: templateName.trim() ? 'pointer' : 'not-allowed' }}>Save Template</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default QuoteBuilder;
