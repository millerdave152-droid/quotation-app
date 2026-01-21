import React, { createContext, useState, useContext, useCallback, useMemo } from 'react';

const QuoteContext = createContext(null);

export const useQuote = () => {
  const context = useContext(QuoteContext);
  if (!context) {
    throw new Error('useQuote must be used within a QuoteProvider');
  }
  return context;
};

// Optional hook that doesn't throw if context is missing
export const useQuoteOptional = () => {
  return useContext(QuoteContext);
};

export const QuoteProvider = ({ children }) => {
  // Current quote being edited
  const [currentQuote, setCurrentQuote] = useState(null);

  // Quote items (line items)
  const [quoteItems, setQuoteItems] = useState([]);

  // Selected customer for the quote
  const [selectedCustomer, setSelectedCustomer] = useState(null);

  // Quote metadata
  const [quoteMetadata, setQuoteMetadata] = useState({
    notes: '',
    validUntil: null,
    status: 'draft'
  });

  // Loading states
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);

  // Quote item operations
  const addItem = useCallback((product, quantity = 1, customPrice = null) => {
    setQuoteItems(prev => {
      const existingIndex = prev.findIndex(item => item.productId === product.id);

      if (existingIndex >= 0) {
        // Update quantity if item exists
        const updated = [...prev];
        updated[existingIndex] = {
          ...updated[existingIndex],
          quantity: updated[existingIndex].quantity + quantity
        };
        return updated;
      }

      // Add new item
      return [...prev, {
        id: `temp-${Date.now()}`,
        productId: product.id,
        product,
        name: product.name,
        quantity,
        unitPrice: customPrice ?? product.sell_cents ?? product.sellCents ?? 0,
        cost: product.cost_cents ?? product.costCents ?? 0,
        margin: 0
      }];
    });
  }, []);

  const removeItem = useCallback((itemId) => {
    setQuoteItems(prev => prev.filter(item => item.id !== itemId && item.productId !== itemId));
  }, []);

  const updateItemQuantity = useCallback((itemId, quantity) => {
    if (quantity <= 0) {
      removeItem(itemId);
      return;
    }

    setQuoteItems(prev => prev.map(item =>
      (item.id === itemId || item.productId === itemId)
        ? { ...item, quantity }
        : item
    ));
  }, [removeItem]);

  const updateItemPrice = useCallback((itemId, unitPrice) => {
    setQuoteItems(prev => prev.map(item =>
      (item.id === itemId || item.productId === itemId)
        ? { ...item, unitPrice }
        : item
    ));
  }, []);

  const clearItems = useCallback(() => {
    setQuoteItems([]);
  }, []);

  // Quote calculations
  const totals = useMemo(() => {
    const subtotal = quoteItems.reduce((sum, item) =>
      sum + (item.unitPrice * item.quantity), 0
    );
    const totalCost = quoteItems.reduce((sum, item) =>
      sum + ((item.cost || 0) * item.quantity), 0
    );
    const margin = subtotal > 0 ? ((subtotal - totalCost) / subtotal * 100) : 0;

    return {
      subtotal,
      totalCost,
      margin: margin.toFixed(2),
      itemCount: quoteItems.length,
      totalQuantity: quoteItems.reduce((sum, item) => sum + item.quantity, 0)
    };
  }, [quoteItems]);

  // Reset quote state
  const resetQuote = useCallback(() => {
    setCurrentQuote(null);
    setQuoteItems([]);
    setSelectedCustomer(null);
    setQuoteMetadata({
      notes: '',
      validUntil: null,
      status: 'draft'
    });
  }, []);

  // Load existing quote
  const loadQuote = useCallback((quote) => {
    setCurrentQuote(quote);
    setQuoteItems(quote.items || []);
    setSelectedCustomer(quote.customer || null);
    setQuoteMetadata({
      notes: quote.notes || '',
      validUntil: quote.validUntil || quote.valid_until || null,
      status: quote.status || 'draft'
    });
  }, []);

  const value = useMemo(() => ({
    // State
    currentQuote,
    quoteItems,
    selectedCustomer,
    quoteMetadata,
    loading,
    saving,
    totals,

    // Setters
    setCurrentQuote,
    setQuoteItems,
    setSelectedCustomer,
    setQuoteMetadata,
    setLoading,
    setSaving,

    // Item operations
    addItem,
    removeItem,
    updateItemQuantity,
    updateItemPrice,
    clearItems,

    // Quote operations
    resetQuote,
    loadQuote,

    // Helpers
    hasItems: quoteItems.length > 0,
    isEditing: !!currentQuote?.id
  }), [
    currentQuote,
    quoteItems,
    selectedCustomer,
    quoteMetadata,
    loading,
    saving,
    totals,
    addItem,
    removeItem,
    updateItemQuantity,
    updateItemPrice,
    clearItems,
    resetQuote,
    loadQuote
  ]);

  return <QuoteContext.Provider value={value}>{children}</QuoteContext.Provider>;
};
