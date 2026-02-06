import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';

const API_BASE = `${process.env.REACT_APP_API_URL || 'http://localhost:3001'}/api`;

function QuoteCreatorEnhanced({ onClose, onQuoteCreated }) {
  // State management
  const [customers, setCustomers] = useState([]);
  const [products, setProducts] = useState([]);
  const [selectedCustomer, setSelectedCustomer] = useState(null);
  const [lineItems, setLineItems] = useState([]);
  const [customerNotes, setCustomerNotes] = useState('');
  const [internalNotes, setInternalNotes] = useState('');
  const [loading, setLoading] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [productsLoading, setProductsLoading] = useState(false);
  const [quoteStatus, setQuoteStatus] = useState('DRAFT');

  // Expiry date - default 30 days from now
  const getDefaultExpiryDate = () => {
    const date = new Date();
    date.setDate(date.getDate() + 30);
    return date.toISOString().split('T')[0]; // YYYY-MM-DD format for input
  };
  const [expiryDate, setExpiryDate] = useState(getDefaultExpiryDate());
  const [showNewCustomerForm, setShowNewCustomerForm] = useState(false);

  // Additional charges - STORED IN CENTS
  const [deliveryFee, setDeliveryFee] = useState(0);
  const [installationFee, setInstallationFee] = useState(0);
  const [setupFee, setSetupFee] = useState(0);

  // Tax settings
  const [taxRate, setTaxRate] = useState(0.13); // Ontario default
  const [taxExempt, setTaxExempt] = useState(false);

  // Refs for debouncing
  const searchTimeoutRef = useRef(null);

  useEffect(() => {
    fetchCustomers();
    // Load recent products on initial mount (small set)
    fetchProducts('', true);

    // Keyboard shortcuts
    const handleKeyboard = (e) => {
      if (e.ctrlKey && e.key === 's') {
        e.preventDefault();
        handleSaveQuote();
      }
    };
    window.addEventListener('keydown', handleKeyboard);
    return () => {
      window.removeEventListener('keydown', handleKeyboard);
      // Clear any pending search timeout on unmount
      if (searchTimeoutRef.current) {
        clearTimeout(searchTimeoutRef.current);
      }
    };
  }, []);

  // Debounced product search effect
  useEffect(() => {
    // Clear any existing timeout
    if (searchTimeoutRef.current) {
      clearTimeout(searchTimeoutRef.current);
    }

    // Only search if user has typed at least 2 characters
    if (searchTerm.trim().length >= 2) {
      searchTimeoutRef.current = setTimeout(() => {
        fetchProducts(searchTerm);
      }, 300); // 300ms debounce
    } else if (searchTerm.trim().length === 0) {
      // Reset to recent products when search is cleared
      fetchProducts('', true);
    }

    // Cleanup on unmount
    return () => {
      if (searchTimeoutRef.current) {
        clearTimeout(searchTimeoutRef.current);
      }
    };
  }, [searchTerm]);

  const fetchCustomers = async () => {
    try {
      const response = await fetch(`${API_BASE}/customers`);
      const data = await response.json();
      setCustomers(data);
    } catch (error) {
      // Silently handle customer fetch errors
    }
  };

  // Optimized product fetch - server-side search with pagination
  const fetchProducts = async (search = '', isInitial = false) => {
    try {
      setProductsLoading(true);

      // Build URL with search params
      const params = new URLSearchParams();
      if (search.trim()) {
        params.append('search', search.trim());
      }
      params.append('limit', '50'); // Only fetch 50 products at a time

      const response = await fetch(`${API_BASE}/products?${params.toString()}`);
      const data = await response.json();

      // Filter out products without model names and with valid data
      const validProducts = (Array.isArray(data) ? data : data.products || []).filter(p =>
        p.model && p.model.trim() !== '' &&
        p.manufacturer && p.manufacturer.trim() !== ''
      );

      if (isInitial) {
        console.log(`Loaded ${validProducts.length} initial products`);
      } else {
        console.log(`Found ${validProducts.length} products matching "${search}"`);
      }

      setProducts(validProducts);
    } catch (error) {
      console.error('Error fetching products:', error);
      setProducts([]);
    } finally {
      setProductsLoading(false);
    }
  };

  const addLineItem = (product) => {
    const existingItem = lineItems.find(item => item.product_id === product.id);
    
    if (existingItem) {
      setLineItems(lineItems.map(item =>
        item.product_id === product.id
          ? { ...item, quantity: item.quantity + 1 }
          : item
      ));
    } else {
      setLineItems([...lineItems, {
        product_id: product.id,
        manufacturer: product.manufacturer || '',
        model: product.model || '',
        sku: product.model || '',
        category: product.category || '',
        product_name: product.model || product.description,
        description: product.description || product.name || '',
        unit_cost: (product.cost_cents || 0) / 100,
        unit_price: (product.msrp_cents || 0) / 100,
        msrp: (product.msrp_cents || 0) / 100,
        quantity: 1,
        discount: 0,
        notes: ''
      }]);
    }
  };

  const updateLineItem = (index, field, value) => {
    const updated = [...lineItems];
    updated[index][field] = value;
    setLineItems(updated);
  };

  const removeLineItem = (index) => {
    if (window.confirm('Remove this item from quote?')) {
      setLineItems(lineItems.filter((_, i) => i !== index));
    }
  };

  const calculateLineTotal = (item) => {
    const subtotal = item.unit_price * item.quantity;
    const discountAmount = subtotal * (item.discount / 100);
    return subtotal - discountAmount;
  };

  const calculateMargin = (item) => {
    const revenue = item.unit_price;
    const cost = item.unit_cost;
    if (revenue === 0) return 0;
    return ((revenue - cost) / revenue) * 100;
  };

  const getMarginColor = (marginPercent) => {
    if (marginPercent < 5) return '#ef4444'; // red
    if (marginPercent < 15) return '#f59e0b'; // orange
    return '#10b981'; // green
  };

  const calculateItemsSubtotal = () => {
    return lineItems.reduce((sum, item) => sum + calculateLineTotal(item), 0);
  };

  const calculateAdditionalCharges = () => {
    // Additional charges are stored in cents, convert to dollars for calculation
    return (deliveryFee + installationFee + setupFee) / 100;
  };

  const calculateSubtotal = () => {
    return calculateItemsSubtotal() + calculateAdditionalCharges();
  };

  const calculateTax = () => {
    if (taxExempt) return 0;
    return calculateSubtotal() * taxRate;
  };

  const calculateTotal = () => {
    return calculateSubtotal() + calculateTax();
  };

  const calculateTotalCost = () => {
    return lineItems.reduce((sum, item) => sum + (item.unit_cost * item.quantity), 0);
  };

  const calculateTotalProfit = () => {
    return calculateItemsSubtotal() - calculateTotalCost() + calculateAdditionalCharges();
  };

  const calculateOverallMargin = () => {
    const total = calculateItemsSubtotal() + calculateAdditionalCharges();
    if (total === 0) return 0;
    return (calculateTotalProfit() / total) * 100;
  };

  // Validate line items have required fields
  const validateLineItems = () => {
    const invalidItems = [];

    lineItems.forEach((item, index) => {
      const issues = [];

      if (!item.manufacturer || item.manufacturer.trim() === '') {
        issues.push('missing manufacturer');
      }
      if (!item.model || item.model.trim() === '') {
        issues.push('missing model');
      }
      if (!item.unit_price || item.unit_price <= 0) {
        issues.push('invalid price');
      }
      if (!item.product_id) {
        issues.push('missing product ID');
      }

      if (issues.length > 0) {
        invalidItems.push({
          index: index + 1,
          name: item.product_name || item.model || `Item ${index + 1}`,
          issues
        });
      }
    });

    return invalidItems;
  };

  const handleSaveQuote = async () => {
    if (!selectedCustomer) {
      alert('⚠️ Please select a customer');
      return;
    }

    if (lineItems.length === 0) {
      alert('⚠️ Please add at least one product');
      return;
    }

    // Validate line items have all required data
    const invalidItems = validateLineItems();
    if (invalidItems.length > 0) {
      const errorList = invalidItems.map(item =>
        `  Line ${item.index} (${item.name}): ${item.issues.join(', ')}`
      ).join('\n');

      alert(`⚠️ Some line items have incomplete data:\n\n${errorList}\n\nPlease remove and re-add these products to ensure all data is captured.`);
      return;
    }

    // Validate minimum margin if needed
    const overallMargin = calculateOverallMargin();
    if (overallMargin < 5) {
      if (!window.confirm(`⚠️ Warning: Overall margin is ${overallMargin.toFixed(1)}% (below 5%).\n\nDo you want to continue?`)) {
        return;
      }
    }

    setLoading(true);

    try {
      // Parse expiry date from date picker (YYYY-MM-DD format)
      const expirationDate = new Date(expiryDate + 'T23:59:59'); // End of day

      // Calculate totals - values are in DOLLARS, need to convert to CENTS
      const subtotal = calculateSubtotal();
      const tax = calculateTax();
      const total = calculateTotal();
      const profit = calculateTotalProfit();

      console.log('💾 Saving quote - Amounts in DOLLARS:', { subtotal, tax, total, profit });

      const quoteData = {
        customer_id: selectedCustomer.id,

        // Convert dollars to cents for database storage
        subtotal_cents: Math.round(subtotal * 100),
        discount_percent: 0,
        discount_cents: 0,
        tax_rate: taxRate,
        tax_cents: Math.round(tax * 100),
        total_cents: Math.round(total * 100),
        gross_profit_cents: Math.round(profit * 100),

        notes: customerNotes,
        internal_notes: internalNotes,
        terms: 'Payment due within 30 days. All prices in CAD.',
        status: quoteStatus,
        expires_at: expirationDate.toISOString(),

        // Map line items to match database schema
        items: lineItems.map(item => {
          const lineTotal = calculateLineTotal(item);
          const lineCost = item.unit_cost * item.quantity;
          const lineProfit = lineTotal - lineCost;
          const margin_bp = lineTotal > 0 ? Math.round((lineProfit / lineTotal) * 10000) : 0;

          return {
            product_id: item.product_id,
            manufacturer: item.manufacturer || '',
            model: item.model || item.sku || item.product_name || '',
            sku: item.sku || item.model || '',
            category: item.category || '',
            description: item.description || item.product_name || '',
            quantity: item.quantity,
            cost_cents: Math.round(item.unit_cost * 100),
            msrp_cents: Math.round((item.msrp || item.unit_price) * 100),
            sell_cents: Math.round(item.unit_price * 100),
            discount_percent: item.discount,
            line_total_cents: Math.round(lineTotal * 100),
            line_profit_cents: Math.round(lineProfit * 100),
            margin_bp: margin_bp,
            notes: item.notes
          };
        })
      };

      console.log('📤 Quote payload:', JSON.stringify(quoteData, null, 2));

      const response = await fetch(`${API_BASE}/quotes`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(quoteData)
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || `Server error: ${response.status}`);
      }

      const result = await response.json();

      // Handle different response formats (standardized API returns { data: {...} })
      const createdQuote = result.data || result.quote || result;
      const quoteNumber = createdQuote.quote_number || createdQuote.quotation_number;
      const quoteId = createdQuote.id;

      console.log('✅ Quote created successfully:', createdQuote);

      // Show success message with View Quote option
      const viewQuote = window.confirm(
        `✅ Quote ${quoteNumber} created successfully!\n\nClick OK to view the quote, or Cancel to close.`
      );

      if (onQuoteCreated) {
        onQuoteCreated(createdQuote, { viewQuote, quoteId });
      }

      onClose();

    } catch (error) {
      console.error('❌ Error creating quote:', error);
      alert(`Failed to create quote: ${error.message}`);
    } finally {
      setLoading(false);
    }
  };

  // Products are now filtered server-side, so just use them directly
  // Memoize to prevent unnecessary re-renders
  const filteredProducts = useMemo(() => products, [products]);

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
      zIndex: 1000,
      padding: '20px'
    }}>
      <div style={{ 
        background: 'white', 
        borderRadius: '16px', 
        width: '100%', 
        maxWidth: '1800px',
        height: '95vh',
        display: 'flex',
        flexDirection: 'column',
        boxShadow: '0 25px 50px -12px rgba(0,0,0,0.5)'
      }}>
        {/* Header */}
        <div style={{ 
          padding: '24px 32px', 
          borderBottom: '3px solid #e5e7eb',
          background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
          borderRadius: '16px 16px 0 0'
        }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <h2 style={{ margin: 0, fontSize: '28px', fontWeight: 'bold', color: 'white' }}>
              📝 Create New Quote
            </h2>
            <button
              onClick={onClose}
              style={{ 
                background: 'rgba(255,255,255,0.2)', 
                border: '2px solid white',
                borderRadius: '8px',
                padding: '10px 20px',
                fontSize: '16px',
                fontWeight: '600',
                cursor: 'pointer',
                color: 'white'
              }}
            >
              ✕ Close
            </button>
          </div>
        </div>

        {/* Content - Scrollable */}
        <div style={{ 
          flex: 1,
          overflow: 'auto',
          padding: '32px'
        }}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 2fr', gap: '32px' }}>
            {/* LEFT COLUMN: Product Search & Customer */}
            <div>
              {/* Customer Selection */}
              <div style={{ 
                marginBottom: '24px',
                padding: '20px',
                background: '#f9fafb',
                borderRadius: '12px',
                border: '2px solid #e5e7eb'
              }}>
                <label style={{ display: 'block', fontSize: '16px', fontWeight: '600', marginBottom: '12px', color: '#374151' }}>
                  👤 Select Customer *
                </label>
                <select
                  value={selectedCustomer?.id || ''}
                  onChange={(e) => {
                    const customer = customers.find(c => c.id === parseInt(e.target.value));
                    setSelectedCustomer(customer);
                  }}
                  style={{ 
                    width: '100%', 
                    padding: '12px', 
                    fontSize: '15px', 
                    border: '2px solid #d1d5db',
                    borderRadius: '8px',
                    background: 'white',
                    fontWeight: '600'
                  }}
                >
                  <option value="">-- Choose Customer --</option>
                  {customers.map(customer => (
                    <option key={customer.id} value={customer.id}>
                      {customer.company || customer.name}
                    </option>
                  ))}
                </select>
                
                {selectedCustomer && (
                  <div style={{ 
                    marginTop: '12px', 
                    padding: '12px', 
                    background: 'white', 
                    borderRadius: '8px',
                    fontSize: '13px',
                    border: '1px solid #e5e7eb'
                  }}>
                    <div><strong>Email:</strong> {selectedCustomer.email}</div>
                    <div><strong>Phone:</strong> {selectedCustomer.phone}</div>
                  </div>
                )}
              </div>

              {/* Quote Settings */}
              <div style={{ 
                padding: '20px',
                background: '#f9fafb',
                borderRadius: '12px',
                border: '2px solid #e5e7eb',
                marginBottom: '24px'
              }}>
                <h3 style={{ margin: '0 0 16px 0', fontSize: '16px', fontWeight: '700', color: '#374151' }}>
                  ⚙️ Quote Settings
                </h3>
                
                <div style={{ marginBottom: '16px' }}>
                  <label style={{ display: 'block', fontSize: '13px', fontWeight: '600', color: '#6b7280', marginBottom: '6px' }}>
                    Status
                  </label>
                  <select
                    value={quoteStatus}
                    onChange={(e) => setQuoteStatus(e.target.value)}
                    style={{ 
                      width: '100%', 
                      padding: '10px', 
                      border: '2px solid #d1d5db', 
                      borderRadius: '6px',
                      fontSize: '14px',
                      fontWeight: '600'
                    }}
                  >
                    <option value="DRAFT">📝 Draft</option>
                    <option value="SENT">📧 Sent</option>
                    <option value="ACCEPTED">✅ Accepted</option>
                    <option value="DECLINED">❌ Declined</option>
                  </select>
                </div>

                <div style={{ marginBottom: '16px' }}>
                  <label style={{ display: 'block', fontSize: '13px', fontWeight: '600', color: '#6b7280', marginBottom: '6px' }}>
                    Valid Until
                  </label>
                  <input
                    type="date"
                    value={expiryDate}
                    onChange={(e) => setExpiryDate(e.target.value)}
                    min={new Date().toISOString().split('T')[0]}
                    style={{
                      width: '100%',
                      padding: '10px',
                      border: '2px solid #d1d5db',
                      borderRadius: '6px',
                      fontSize: '14px',
                      fontWeight: '600'
                    }}
                  />
                  <div style={{ fontSize: '11px', color: '#9ca3af', marginTop: '4px' }}>
                    {(() => {
                      const today = new Date();
                      today.setHours(0, 0, 0, 0);
                      const expiry = new Date(expiryDate);
                      const diffDays = Math.ceil((expiry - today) / (1000 * 60 * 60 * 24));
                      return diffDays > 0 ? `${diffDays} days from today` : 'Expires today';
                    })()}
                  </div>
                </div>

                <div>
                  <label style={{ display: 'flex', alignItems: 'center', fontSize: '14px', fontWeight: '600', color: '#374151', cursor: 'pointer' }}>
                    <input
                      type="checkbox"
                      checked={taxExempt}
                      onChange={(e) => setTaxExempt(e.target.checked)}
                      style={{ marginRight: '8px', width: '18px', height: '18px', cursor: 'pointer' }}
                    />
                    Tax Exempt Customer
                  </label>
                </div>
              </div>

              {/* Product Search */}
              <div style={{ 
                padding: '20px',
                background: '#f0f9ff',
                borderRadius: '12px',
                border: '2px solid #bae6fd'
              }}>
                <h3 style={{ margin: '0 0 12px 0', fontSize: '16px', fontWeight: '700', color: '#0c4a6e' }}>
                  🔍 Add Products
                </h3>
                <input
                  type="text"
                  placeholder="Type 2+ characters to search products..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  style={{
                    width: '100%',
                    padding: '12px',
                    border: '2px solid #7dd3fc',
                    borderRadius: '8px',
                    fontSize: '14px',
                    marginBottom: '12px'
                  }}
                />
                {searchTerm.trim().length === 1 && (
                  <div style={{
                    padding: '12px',
                    background: '#fef3c7',
                    borderRadius: '8px',
                    marginBottom: '12px',
                    fontSize: '13px',
                    color: '#92400e'
                  }}>
                    💡 Type at least 2 characters to search
                  </div>
                )}
                <div style={{ maxHeight: '400px', overflow: 'auto' }}>
                  {productsLoading ? (
                    <div style={{
                      padding: '24px',
                      textAlign: 'center',
                      color: '#6b7280'
                    }}>
                      ⏳ Searching products...
                    </div>
                  ) : filteredProducts.length === 0 ? (
                    <div style={{
                      padding: '24px',
                      textAlign: 'center',
                      color: '#6b7280'
                    }}>
                      {searchTerm.trim().length >= 2
                        ? 'No products found. Try a different search term.'
                        : 'Type to search for products'
                      }
                    </div>
                  ) : filteredProducts.map(product => (
                    <div
                      key={product.id}
                      onClick={() => addLineItem(product)}
                      style={{ 
                        padding: '12px',
                        margin: '8px 0',
                        background: 'white',
                        borderRadius: '8px',
                        cursor: 'pointer',
                        border: '2px solid #e0f2fe',
                        transition: 'all 0.2s'
                      }}
                      onMouseEnter={(e) => {
                        e.currentTarget.style.background = '#e0f2fe';
                        e.currentTarget.style.borderColor = '#0ea5e9';
                      }}
                      onMouseLeave={(e) => {
                        e.currentTarget.style.background = 'white';
                        e.currentTarget.style.borderColor = '#e0f2fe';
                      }}
                    >
                      <div style={{ fontWeight: '600', fontSize: '14px', color: '#0c4a6e', marginBottom: '4px' }}>
                        {product.manufacturer ? `${product.manufacturer} ${product.model}` : product.model}
                      </div>
                      <div style={{ fontSize: '13px', color: '#64748b', marginBottom: '6px' }}>
                        {product.description}
                      </div>
                      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '13px' }}>
                        <span style={{ color: '#dc2626', fontWeight: '600' }}>
                          Cost: ${((product.cost_cents || 0) / 100).toFixed(2)}
                        </span>
                        <span style={{
                          color: (product.msrp_cents && product.msrp_cents > 0) ? '#059669' : '#ef4444',
                          fontWeight: '700'
                        }}>
                          {(product.msrp_cents && product.msrp_cents > 0) ? (
                            `Price: $${(product.msrp_cents / 100).toFixed(2)}`
                          ) : (
                            'MSRP: NOT SET ⚠️'
                          )}
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            {/* RIGHT COLUMN: Quote Items & Summary */}
            <div>
              {/* Line Items */}
              <div style={{ marginBottom: '24px' }}>
                <h3 style={{ fontSize: '18px', fontWeight: '700', marginBottom: '16px', color: '#374151' }}>
                  🛒 Quote Items ({lineItems.length})
                </h3>
                
                {lineItems.length === 0 ? (
                  <div style={{ 
                    padding: '48px', 
                    textAlign: 'center', 
                    background: '#f9fafb', 
                    borderRadius: '12px',
                    border: '2px dashed #d1d5db',
                    color: '#9ca3af',
                    fontSize: '16px'
                  }}>
                    No items added yet. Search and click products on the left to add them.
                  </div>
                ) : (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                    {lineItems.map((item, index) => (
                      <div 
                        key={index}
                        style={{ 
                          padding: '16px',
                          background: 'white',
                          borderRadius: '12px',
                          border: '2px solid #e5e7eb',
                          boxShadow: '0 2px 4px rgba(0,0,0,0.05)'
                        }}
                      >
                        <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr 1fr 1fr 1fr auto', gap: '12px', alignItems: 'center' }}>
                          {/* Product Name */}
                          <div>
                            <div style={{ fontWeight: '700', fontSize: '15px', color: '#1f2937', marginBottom: '4px' }}>
                              {item.product_name}
                            </div>
                            <input
                              type="text"
                              value={item.description}
                              onChange={(e) => updateLineItem(index, 'description', e.target.value)}
                              placeholder="Description..."
                              style={{ 
                                width: '100%', 
                                padding: '6px 8px', 
                                fontSize: '13px', 
                                border: '1px solid #e5e7eb',
                                borderRadius: '4px',
                                color: '#6b7280'
                              }}
                            />
                          </div>

                          {/* Quantity */}
                          <div>
                            <label style={{ display: 'block', fontSize: '11px', fontWeight: '600', color: '#9ca3af', marginBottom: '4px' }}>
                              QTY
                            </label>
                            <input
                              type="number"
                              value={item.quantity}
                              onChange={(e) => updateLineItem(index, 'quantity', Math.max(1, parseInt(e.target.value) || 1))}
                              min="1"
                              style={{ 
                                width: '100%', 
                                padding: '8px', 
                                fontSize: '14px', 
                                border: '2px solid #e5e7eb',
                                borderRadius: '6px',
                                textAlign: 'center',
                                fontWeight: '600'
                              }}
                            />
                          </div>

                          {/* Unit Price */}
                          <div>
                            <label style={{ display: 'block', fontSize: '11px', fontWeight: '600', color: '#9ca3af', marginBottom: '4px' }}>
                              UNIT PRICE
                            </label>
                            <input
                              type="text"
                              value={item.unit_price.toFixed(2)}
                              onChange={(e) => {
                                const value = e.target.value.replace(/[^0-9.]/g, '');
                                const dollars = parseFloat(value) || 0;
                                updateLineItem(index, 'unit_price', dollars);
                              }}
                              style={{
                                width: '100%',
                                padding: '8px',
                                fontSize: '14px',
                                border: '2px solid #e5e7eb',
                                borderRadius: '6px',
                                fontWeight: '600'
                              }}
                            />
                          </div>

                          {/* Discount */}
                          <div>
                            <label style={{ display: 'block', fontSize: '11px', fontWeight: '600', color: '#9ca3af', marginBottom: '4px' }}>
                              DISC %
                            </label>
                            <input
                              type="number"
                              value={item.discount}
                              onChange={(e) => updateLineItem(index, 'discount', Math.max(0, Math.min(100, parseFloat(e.target.value) || 0)))}
                              min="0"
                              max="100"
                              step="0.1"
                              style={{ 
                                width: '100%', 
                                padding: '8px', 
                                fontSize: '14px', 
                                border: '2px solid #e5e7eb',
                                borderRadius: '6px',
                                textAlign: 'center'
                              }}
                            />
                          </div>

                          {/* Line Total & Margin */}
                          <div style={{ textAlign: 'right' }}>
                            <div style={{ fontSize: '16px', fontWeight: '700', color: '#059669', marginBottom: '4px' }}>
                              ${calculateLineTotal(item).toFixed(2)}
                            </div>
                            <div
                              style={{
                                display: 'inline-block',
                                padding: '4px 8px',
                                borderRadius: '4px',
                                fontSize: '12px',
                                fontWeight: '700',
                                color: 'white',
                                background: getMarginColor(calculateMargin(item))
                              }}
                            >
                              {calculateMargin(item).toFixed(1)}% margin
                            </div>
                          </div>

                          {/* Remove Button */}
                          <button
                            onClick={() => removeLineItem(index)}
                            style={{ 
                              padding: '8px 12px',
                              background: '#fee2e2',
                              border: '2px solid #fecaca',
                              borderRadius: '6px',
                              cursor: 'pointer',
                              fontSize: '14px',
                              fontWeight: '600',
                              color: '#dc2626'
                            }}
                            onMouseEnter={(e) => e.target.style.background = '#fecaca'}
                            onMouseLeave={(e) => e.target.style.background = '#fee2e2'}
                          >
                            ✕
                          </button>
                        </div>

                        {/* Item Notes */}
                        <input
                          type="text"
                          value={item.notes}
                          onChange={(e) => updateLineItem(index, 'notes', e.target.value)}
                          placeholder="Add item notes (optional)..."
                          style={{ 
                            width: '100%', 
                            padding: '8px', 
                            fontSize: '13px', 
                            border: '1px solid #e5e7eb',
                            borderRadius: '4px',
                            marginTop: '12px',
                            color: '#6b7280'
                          }}
                        />
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Additional Charges */}
              <div style={{ 
                marginTop: '24px',
                padding: '20px',
                background: '#fef3c7',
                borderRadius: '12px',
                border: '2px solid #fde047'
              }}>
                <h3 style={{ margin: '0 0 16px 0', fontSize: '16px', fontWeight: '700', color: '#92400e' }}>
                  💵 Additional Charges
                </h3>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '16px' }}>
                  <div>
                    <label style={{ display: 'block', fontSize: '13px', fontWeight: '600', color: '#6b7280', marginBottom: '6px' }}>
                      🚚 Delivery Fee ($)
                    </label>
                    <input
                      type="text"
                      placeholder="0.00"
                      value={(deliveryFee / 100).toFixed(2)}
                      onChange={(e) => {
                        const value = e.target.value.replace(/[^0-9.]/g, '');
                        const dollars = parseFloat(value) || 0;
                        setDeliveryFee(Math.round(dollars * 100));
                      }}
                      onFocus={(e) => e.target.select()}
                      style={{ width: '100%', padding: '10px', border: '2px solid #d1d5db', borderRadius: '6px', fontSize: '14px', fontWeight: '600' }}
                    />
                  </div>
                  <div>
                    <label style={{ display: 'block', fontSize: '13px', fontWeight: '600', color: '#6b7280', marginBottom: '6px' }}>
                      🔧 Installation Fee ($)
                    </label>
                    <input
                      type="text"
                      placeholder="0.00"
                      value={(installationFee / 100).toFixed(2)}
                      onChange={(e) => {
                        const value = e.target.value.replace(/[^0-9.]/g, '');
                        const dollars = parseFloat(value) || 0;
                        setInstallationFee(Math.round(dollars * 100));
                      }}
                      onFocus={(e) => e.target.select()}
                      style={{ width: '100%', padding: '10px', border: '2px solid #d1d5db', borderRadius: '6px', fontSize: '14px', fontWeight: '600' }}
                    />
                  </div>
                  <div>
                    <label style={{ display: 'block', fontSize: '13px', fontWeight: '600', color: '#6b7280', marginBottom: '6px' }}>
                      ⚙️ Setup Fee ($)
                    </label>
                    <input
                      type="text"
                      placeholder="0.00"
                      value={(setupFee / 100).toFixed(2)}
                      onChange={(e) => {
                        const value = e.target.value.replace(/[^0-9.]/g, '');
                        const dollars = parseFloat(value) || 0;
                        setSetupFee(Math.round(dollars * 100));
                      }}
                      onFocus={(e) => e.target.select()}
                      style={{ width: '100%', padding: '10px', border: '2px solid #d1d5db', borderRadius: '6px', fontSize: '14px', fontWeight: '600' }}
                    />
                  </div>
                </div>
              </div>

              {/* Notes - Split into Customer and Internal */}
              <div style={{ marginTop: '24px', display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '20px' }}>
                <div>
                  <label style={{ display: 'block', fontSize: '16px', fontWeight: '600', marginBottom: '8px', color: '#374151' }}>
                    📝 Customer Notes (Visible on Quote)
                  </label>
                  <textarea
                    value={customerNotes}
                    onChange={(e) => setCustomerNotes(e.target.value)}
                    rows={4}
                    placeholder="Add terms, conditions, or notes for the customer..."
                    style={{ 
                      width: '100%', 
                      padding: '12px', 
                      border: '2px solid #e5e7eb', 
                      borderRadius: '8px',
                      fontSize: '14px',
                      fontFamily: 'inherit',
                      resize: 'vertical'
                    }}
                  />
                </div>
                <div>
                  <label style={{ display: 'block', fontSize: '16px', fontWeight: '600', marginBottom: '8px', color: '#374151' }}>
                    🔒 Internal Notes (Private)
                  </label>
                  <textarea
                    value={internalNotes}
                    onChange={(e) => setInternalNotes(e.target.value)}
                    rows={4}
                    placeholder="Add internal notes (not visible to customer)..."
                    style={{ 
                      width: '100%', 
                      padding: '12px', 
                      border: '2px solid #fee2e2', 
                      borderRadius: '8px',
                      fontSize: '14px',
                      fontFamily: 'inherit',
                      resize: 'vertical',
                      background: '#fef2f2'
                    }}
                  />
                </div>
              </div>

              {/* Enhanced Summary */}
              <div style={{ 
                marginTop: '24px', 
                padding: '24px', 
                background: 'linear-gradient(135deg, #f0f9ff 0%, #e0f2fe 100%)', 
                borderRadius: '12px',
                border: '3px solid #bae6fd'
              }}>
                <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: '24px' }}>
                  {/* Left: Profit Analysis (Admin Only) */}
                  <div>
                    <h3 style={{ margin: '0 0 16px 0', fontSize: '18px', fontWeight: '700', color: '#0c4a6e' }}>
                      📊 Profit Analysis
                    </h3>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', fontSize: '15px' }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                        <span style={{ color: '#64748b' }}>Total Cost:</span>
                        <span style={{ fontWeight: '600', color: '#dc2626' }}>
                          ${calculateTotalCost().toFixed(2)}
                        </span>
                      </div>
                      <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                        <span style={{ color: '#64748b' }}>Total Revenue:</span>
                        <span style={{ fontWeight: '600' }}>
                          ${(calculateItemsSubtotal() + calculateAdditionalCharges()).toFixed(2)}
                        </span>
                      </div>
                      <div style={{
                        display: 'flex',
                        justifyContent: 'space-between',
                        padding: '12px',
                        background: 'white',
                        borderRadius: '8px',
                        marginTop: '8px'
                      }}>
                        <span style={{ fontWeight: '700', color: '#0c4a6e', fontSize: '16px' }}>Gross Profit:</span>
                        <span style={{ fontWeight: '700', fontSize: '18px', color: '#059669' }}>
                          ${calculateTotalProfit().toFixed(2)}
                        </span>
                      </div>
                      <div style={{ 
                        display: 'flex', 
                        justifyContent: 'space-between',
                        padding: '12px',
                        background: getMarginColor(calculateOverallMargin()),
                        borderRadius: '8px',
                        color: 'white'
                      }}>
                        <span style={{ fontWeight: '700', fontSize: '16px' }}>Overall Margin:</span>
                        <span style={{ fontWeight: '700', fontSize: '20px' }}>
                          {calculateOverallMargin().toFixed(1)}%
                        </span>
                      </div>
                    </div>
                  </div>

                  {/* Right: Quote Summary */}
                  <div>
                    <h3 style={{ margin: '0 0 16px 0', fontSize: '18px', fontWeight: '700', color: '#0c4a6e' }}>
                      💰 Quote Total
                    </h3>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', fontSize: '15px' }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                        <span style={{ color: '#64748b' }}>Subtotal:</span>
                        <span style={{ fontWeight: '600' }}>${calculateSubtotal().toFixed(2)}</span>
                      </div>
                      <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                        <span style={{ color: '#64748b' }}>Tax ({(taxRate * 100).toFixed(1)}%):</span>
                        <span style={{ fontWeight: '600' }}>
                          {taxExempt ? (
                            <span style={{ color: '#10b981' }}>EXEMPT</span>
                          ) : (
                            `$${calculateTax().toFixed(2)}`
                          )}
                        </span>
                      </div>
                      <div style={{
                        display: 'flex',
                        justifyContent: 'space-between',
                        fontSize: '24px',
                        paddingTop: '16px',
                        borderTop: '3px solid #bae6fd',
                        marginTop: '12px'
                      }}>
                        <span style={{ fontWeight: 'bold', color: '#0c4a6e' }}>Total:</span>
                        <span style={{ fontWeight: 'bold', color: '#059669' }}>
                          ${calculateTotal().toFixed(2)}
                        </span>
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              {/* Action Buttons */}
              <div style={{ display: 'flex', gap: '12px', marginTop: '24px' }}>
                <button
                  onClick={onClose}
                  disabled={loading}
                  style={{ 
                    flex: 1,
                    padding: '16px', 
                    background: 'white', 
                    border: '2px solid #d1d5db', 
                    borderRadius: '8px', 
                    fontSize: '16px', 
                    fontWeight: '600',
                    cursor: loading ? 'not-allowed' : 'pointer',
                    color: '#6b7280'
                  }}
                >
                  Cancel
                </button>
                <button
                  onClick={handleSaveQuote}
                  disabled={loading || !selectedCustomer || lineItems.length === 0}
                  style={{ 
                    flex: 2,
                    padding: '16px', 
                    background: loading || !selectedCustomer || lineItems.length === 0 
                      ? '#d1d5db' 
                      : 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)', 
                    border: 'none', 
                    borderRadius: '8px', 
                    fontSize: '18px', 
                    fontWeight: 'bold',
                    cursor: loading || !selectedCustomer || lineItems.length === 0 ? 'not-allowed' : 'pointer',
                    color: 'white',
                    boxShadow: loading || !selectedCustomer || lineItems.length === 0 ? 'none' : '0 4px 12px rgba(102,126,234,0.4)'
                  }}
                >
                  {loading ? '⏳ Creating Quote...' : '✅ Create Quote (Ctrl+S)'}
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

export default QuoteCreatorEnhanced;