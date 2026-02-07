import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';

import { authFetch } from '../../services/authFetch';
const API_URL = process.env.REACT_APP_API_URL || 'http://localhost:3001';

const GlobalSearch = ({ isOpen, onClose }) => {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState({ quotes: [], customers: [], products: [] });
  const [loading, setLoading] = useState(false);
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [activeCategory, setActiveCategory] = useState('all'); // 'all', 'quotes', 'customers', 'products'
  const inputRef = useRef(null);
  const listRef = useRef(null);
  const navigate = useNavigate();
  const searchTimeoutRef = useRef(null);

  // Focus input when opened
  useEffect(() => {
    if (isOpen && inputRef.current) {
      inputRef.current.focus();
      setQuery('');
      setResults({ quotes: [], customers: [], products: [] });
      setSelectedIndex(0);
      setActiveCategory('all');
    }
  }, [isOpen]);

  // Search function with debounce
  const performSearch = useCallback(async (searchQuery) => {
    if (searchQuery.length < 2) {
      setResults({ quotes: [], customers: [], products: [] });
      return;
    }

    setLoading(true);
    const token = localStorage.getItem('auth_token');
    const headers = {
      'Content-Type': 'application/json',
      ...(token && { 'Authorization': `Bearer ${token}` })
    };

    try {
      // Search all endpoints in parallel
      const [quotesRes, customersRes, productsRes] = await Promise.all([
        authFetch(`${API_URL}/api/quotes/search?q=${encodeURIComponent(searchQuery)}&limit=5`, { headers }),
        authFetch(`${API_URL}/api/customers/search?q=${encodeURIComponent(searchQuery)}&limit=5`, { headers }),
        authFetch(`${API_URL}/api/products/search?q=${encodeURIComponent(searchQuery)}&limit=5`, { headers }),
      ]);

      const [quotes, customers, products] = await Promise.all([
        quotesRes.ok ? quotesRes.json() : [],
        customersRes.ok ? customersRes.json() : [],
        productsRes.ok ? productsRes.json() : [],
      ]);

      setResults({
        quotes: Array.isArray(quotes) ? quotes : (quotes.quotes || []),
        customers: Array.isArray(customers) ? customers : (customers.customers || []),
        products: Array.isArray(products) ? products : (products.products || []),
      });
      setSelectedIndex(0);
    } catch (error) {
      console.error('Global search error:', error);
      setResults({ quotes: [], customers: [], products: [] });
    } finally {
      setLoading(false);
    }
  }, []);

  // Debounced search
  useEffect(() => {
    if (searchTimeoutRef.current) {
      clearTimeout(searchTimeoutRef.current);
    }

    searchTimeoutRef.current = setTimeout(() => {
      performSearch(query);
    }, 300);

    return () => {
      if (searchTimeoutRef.current) {
        clearTimeout(searchTimeoutRef.current);
      }
    };
  }, [query, performSearch]);

  // Get all results flattened for keyboard navigation
  const getAllResults = () => {
    const all = [];
    if (activeCategory === 'all' || activeCategory === 'quotes') {
      results.quotes.forEach(q => all.push({ ...q, type: 'quote' }));
    }
    if (activeCategory === 'all' || activeCategory === 'customers') {
      results.customers.forEach(c => all.push({ ...c, type: 'customer' }));
    }
    if (activeCategory === 'all' || activeCategory === 'products') {
      results.products.forEach(p => all.push({ ...p, type: 'product' }));
    }
    return all;
  };

  const allResults = getAllResults();

  // Handle keyboard navigation
  const handleKeyDown = useCallback((e) => {
    if (!isOpen) return;

    switch (e.key) {
      case 'ArrowDown':
        e.preventDefault();
        setSelectedIndex(prev => Math.min(prev + 1, allResults.length - 1));
        break;
      case 'ArrowUp':
        e.preventDefault();
        setSelectedIndex(prev => Math.max(prev - 1, 0));
        break;
      case 'Enter':
        e.preventDefault();
        if (allResults[selectedIndex]) {
          handleSelectResult(allResults[selectedIndex]);
        }
        break;
      case 'Escape':
        e.preventDefault();
        onClose();
        break;
      case 'Tab':
        e.preventDefault();
        // Cycle through categories
        const categories = ['all', 'quotes', 'customers', 'products'];
        const currentIndex = categories.indexOf(activeCategory);
        setActiveCategory(categories[(currentIndex + 1) % categories.length]);
        setSelectedIndex(0);
        break;
      default:
        break;
    }
  }, [isOpen, allResults, selectedIndex, onClose, activeCategory]);

  useEffect(() => {
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [handleKeyDown]);

  // Scroll selected item into view
  useEffect(() => {
    if (listRef.current) {
      const selectedItem = listRef.current.querySelector(`[data-index="${selectedIndex}"]`);
      if (selectedItem) {
        selectedItem.scrollIntoView({ block: 'nearest' });
      }
    }
  }, [selectedIndex]);

  // Handle result selection
  const handleSelectResult = (result) => {
    onClose();
    switch (result.type) {
      case 'quote':
        navigate(`/quotes/${result.id}`);
        break;
      case 'customer':
        navigate(`/customers/${result.id}`);
        break;
      case 'product':
        navigate(`/products/${result.id}`);
        break;
      default:
        break;
    }
  };

  // Format currency
  const formatCurrency = (cents) => {
    if (!cents) return '$0.00';
    return `$${(cents / 100).toFixed(2).replace(/\B(?=(\d{3})+(?!\d))/g, ',')}`;
  };

  if (!isOpen) return null;

  const totalResults = results.quotes.length + results.customers.length + results.products.length;

  return (
    <>
      {/* Backdrop */}
      <div
        style={{
          position: 'fixed',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          backgroundColor: 'rgba(0, 0, 0, 0.5)',
          backdropFilter: 'blur(4px)',
          zIndex: 9998,
        }}
        onClick={onClose}
      />

      {/* Search Modal */}
      <div
        style={{
          position: 'fixed',
          top: '15%',
          left: '50%',
          transform: 'translateX(-50%)',
          width: '100%',
          maxWidth: '700px',
          backgroundColor: 'white',
          borderRadius: '12px',
          boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.25)',
          zIndex: 9999,
          overflow: 'hidden',
        }}
      >
        {/* Search Input */}
        <div style={{ padding: '16px', borderBottom: '1px solid #e5e7eb' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            <span style={{ fontSize: '20px' }}>🔍</span>
            <input
              ref={inputRef}
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search quotes, customers, products..."
              style={{
                flex: 1,
                border: 'none',
                outline: 'none',
                fontSize: '16px',
                backgroundColor: 'transparent',
              }}
            />
            {loading && (
              <span style={{ color: '#6366f1', animation: 'spin 1s linear infinite' }}>⏳</span>
            )}
            <kbd style={{
              padding: '4px 8px',
              backgroundColor: '#f3f4f6',
              borderRadius: '4px',
              fontSize: '12px',
              color: '#6b7280',
            }}>
              ESC
            </kbd>
          </div>
        </div>

        {/* Category Tabs */}
        <div style={{
          display: 'flex',
          gap: '4px',
          padding: '12px 16px',
          backgroundColor: '#f9fafb',
          borderBottom: '1px solid #e5e7eb',
        }}>
          {[
            { id: 'all', label: 'All', count: totalResults },
            { id: 'quotes', label: 'Quotes', count: results.quotes.length, icon: '📋' },
            { id: 'customers', label: 'Customers', count: results.customers.length, icon: '👥' },
            { id: 'products', label: 'Products', count: results.products.length, icon: '📦' },
          ].map(cat => (
            <button
              key={cat.id}
              onClick={() => { setActiveCategory(cat.id); setSelectedIndex(0); }}
              style={{
                padding: '6px 12px',
                borderRadius: '6px',
                border: 'none',
                backgroundColor: activeCategory === cat.id ? 'white' : 'transparent',
                color: activeCategory === cat.id ? '#111827' : '#6b7280',
                fontSize: '13px',
                fontWeight: '500',
                cursor: 'pointer',
                boxShadow: activeCategory === cat.id ? '0 1px 3px rgba(0,0,0,0.1)' : 'none',
                display: 'flex',
                alignItems: 'center',
                gap: '6px',
              }}
            >
              {cat.icon && <span>{cat.icon}</span>}
              {cat.label}
              <span style={{
                backgroundColor: activeCategory === cat.id ? '#6366f1' : '#e5e7eb',
                color: activeCategory === cat.id ? 'white' : '#6b7280',
                padding: '2px 6px',
                borderRadius: '10px',
                fontSize: '11px',
                fontWeight: '600',
              }}>
                {cat.count}
              </span>
            </button>
          ))}
        </div>

        {/* Results */}
        <div
          ref={listRef}
          style={{
            maxHeight: '400px',
            overflowY: 'auto',
            padding: '8px',
          }}
        >
          {query.length < 2 ? (
            <div style={{
              padding: '40px',
              textAlign: 'center',
              color: '#9ca3af',
            }}>
              <div style={{ fontSize: '32px', marginBottom: '12px' }}>🔍</div>
              Type at least 2 characters to search
            </div>
          ) : allResults.length === 0 && !loading ? (
            <div style={{
              padding: '40px',
              textAlign: 'center',
              color: '#9ca3af',
            }}>
              <div style={{ fontSize: '32px', marginBottom: '12px' }}>📭</div>
              No results found for "{query}"
            </div>
          ) : (
            <>
              {/* Quotes Section */}
              {(activeCategory === 'all' || activeCategory === 'quotes') && results.quotes.length > 0 && (
                <div style={{ marginBottom: '16px' }}>
                  {activeCategory === 'all' && (
                    <div style={{
                      padding: '8px 12px',
                      fontSize: '12px',
                      fontWeight: '600',
                      color: '#6b7280',
                      textTransform: 'uppercase',
                    }}>
                      Quotes
                    </div>
                  )}
                  {results.quotes.map((quote, i) => {
                    const globalIndex = allResults.findIndex(r => r.type === 'quote' && r.id === quote.id);
                    return (
                      <div
                        key={`quote-${quote.id}`}
                        data-index={globalIndex}
                        onClick={() => handleSelectResult({ ...quote, type: 'quote' })}
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          gap: '12px',
                          padding: '12px',
                          borderRadius: '8px',
                          cursor: 'pointer',
                          backgroundColor: selectedIndex === globalIndex ? '#f3f4f6' : 'transparent',
                        }}
                        onMouseEnter={() => setSelectedIndex(globalIndex)}
                      >
                        <span style={{ fontSize: '18px' }}>📋</span>
                        <div style={{ flex: 1 }}>
                          <div style={{ fontWeight: '600', color: '#6366f1', fontSize: '14px' }}>
                            {quote.quotation_number || quote.quote_number}
                          </div>
                          <div style={{ fontSize: '13px', color: '#6b7280' }}>
                            {quote.customer_name || 'No customer'}
                          </div>
                        </div>
                        <div style={{ textAlign: 'right' }}>
                          <div style={{ fontWeight: '600', fontSize: '14px' }}>
                            {formatCurrency(quote.total_amount)}
                          </div>
                          <div style={{
                            fontSize: '11px',
                            padding: '2px 8px',
                            borderRadius: '10px',
                            backgroundColor: quote.status === 'won' ? '#dcfce7' : quote.status === 'sent' ? '#dbeafe' : '#f3f4f6',
                            color: quote.status === 'won' ? '#166534' : quote.status === 'sent' ? '#1d4ed8' : '#6b7280',
                            textTransform: 'uppercase',
                          }}>
                            {quote.status}
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}

              {/* Customers Section */}
              {(activeCategory === 'all' || activeCategory === 'customers') && results.customers.length > 0 && (
                <div style={{ marginBottom: '16px' }}>
                  {activeCategory === 'all' && (
                    <div style={{
                      padding: '8px 12px',
                      fontSize: '12px',
                      fontWeight: '600',
                      color: '#6b7280',
                      textTransform: 'uppercase',
                    }}>
                      Customers
                    </div>
                  )}
                  {results.customers.map((customer, i) => {
                    const globalIndex = allResults.findIndex(r => r.type === 'customer' && r.id === customer.id);
                    return (
                      <div
                        key={`customer-${customer.id}`}
                        data-index={globalIndex}
                        onClick={() => handleSelectResult({ ...customer, type: 'customer' })}
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          gap: '12px',
                          padding: '12px',
                          borderRadius: '8px',
                          cursor: 'pointer',
                          backgroundColor: selectedIndex === globalIndex ? '#f3f4f6' : 'transparent',
                        }}
                        onMouseEnter={() => setSelectedIndex(globalIndex)}
                      >
                        <span style={{ fontSize: '18px' }}>👤</span>
                        <div style={{ flex: 1 }}>
                          <div style={{ fontWeight: '600', fontSize: '14px' }}>
                            {customer.name}
                          </div>
                          <div style={{ fontSize: '13px', color: '#6b7280' }}>
                            {customer.email || customer.phone || 'No contact info'}
                          </div>
                        </div>
                        {customer.company && (
                          <div style={{
                            fontSize: '12px',
                            color: '#6b7280',
                            backgroundColor: '#f3f4f6',
                            padding: '4px 8px',
                            borderRadius: '4px',
                          }}>
                            {customer.company}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}

              {/* Products Section */}
              {(activeCategory === 'all' || activeCategory === 'products') && results.products.length > 0 && (
                <div>
                  {activeCategory === 'all' && (
                    <div style={{
                      padding: '8px 12px',
                      fontSize: '12px',
                      fontWeight: '600',
                      color: '#6b7280',
                      textTransform: 'uppercase',
                    }}>
                      Products
                    </div>
                  )}
                  {results.products.map((product, i) => {
                    const globalIndex = allResults.findIndex(r => r.type === 'product' && r.id === product.id);
                    return (
                      <div
                        key={`product-${product.id}`}
                        data-index={globalIndex}
                        onClick={() => handleSelectResult({ ...product, type: 'product' })}
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          gap: '12px',
                          padding: '12px',
                          borderRadius: '8px',
                          cursor: 'pointer',
                          backgroundColor: selectedIndex === globalIndex ? '#f3f4f6' : 'transparent',
                        }}
                        onMouseEnter={() => setSelectedIndex(globalIndex)}
                      >
                        <span style={{ fontSize: '18px' }}>📦</span>
                        <div style={{ flex: 1 }}>
                          <div style={{ fontWeight: '600', fontSize: '14px' }}>
                            {product.name || product.model}
                          </div>
                          <div style={{ fontSize: '13px', color: '#6b7280' }}>
                            {product.model && product.name ? product.model : ''} {product.manufacturer && `• ${product.manufacturer}`}
                          </div>
                        </div>
                        <div style={{ textAlign: 'right' }}>
                          <div style={{ fontWeight: '600', fontSize: '14px' }}>
                            {formatCurrency(product.msrp_cents || product.cost_cents)}
                          </div>
                          {product.category && (
                            <div style={{ fontSize: '11px', color: '#6b7280' }}>
                              {product.category.split(' > ').pop()}
                            </div>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </>
          )}
        </div>

        {/* Footer */}
        <div style={{
          padding: '12px 16px',
          borderTop: '1px solid #e5e7eb',
          backgroundColor: '#f9fafb',
          display: 'flex',
          gap: '16px',
          fontSize: '12px',
          color: '#6b7280',
        }}>
          <span><kbd style={{ padding: '2px 4px', backgroundColor: '#e5e7eb', borderRadius: '2px' }}>↑↓</kbd> Navigate</span>
          <span><kbd style={{ padding: '2px 4px', backgroundColor: '#e5e7eb', borderRadius: '2px' }}>↵</kbd> Select</span>
          <span><kbd style={{ padding: '2px 4px', backgroundColor: '#e5e7eb', borderRadius: '2px' }}>Tab</kbd> Switch category</span>
          <span><kbd style={{ padding: '2px 4px', backgroundColor: '#e5e7eb', borderRadius: '2px' }}>ESC</kbd> Close</span>
        </div>
      </div>
    </>
  );
};

export default GlobalSearch;
