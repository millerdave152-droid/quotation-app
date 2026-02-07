import React, { useState, useEffect } from 'react';
import { useSearchParams, useNavigate } from 'react-router-dom';

import { authFetch } from '../services/authFetch';
const API_URL = process.env.REACT_APP_API_URL || 'http://localhost:3001';

// Result Card Components
const ProductCard = ({ product, onClick }) => (
  <div
    onClick={onClick}
    style={{
      padding: '16px',
      background: 'white',
      borderRadius: '8px',
      border: '1px solid #e5e7eb',
      cursor: 'pointer',
      transition: 'all 0.2s ease',
    }}
    onMouseEnter={(e) => e.currentTarget.style.borderColor = '#3b82f6'}
    onMouseLeave={(e) => e.currentTarget.style.borderColor = '#e5e7eb'}
  >
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
      <div>
        <div style={{ fontWeight: '600', color: '#111827' }}>{product.model || product.sku}</div>
        <div style={{ fontSize: '13px', color: '#6b7280', marginTop: '4px' }}>
          {product.manufacturer} {product.category && `• ${product.category}`}
        </div>
      </div>
      <div style={{ textAlign: 'right' }}>
        <div style={{ fontWeight: '600', color: '#059669' }}>
          ${((product.msrp_cents || product.price_cents || 0) / 100).toLocaleString()}
        </div>
        <div style={{ fontSize: '12px', color: '#9ca3af' }}>MSRP</div>
      </div>
    </div>
    {product.description && (
      <div style={{ fontSize: '13px', color: '#6b7280', marginTop: '8px', lineHeight: '1.4' }}>
        {product.description.substring(0, 100)}{product.description.length > 100 ? '...' : ''}
      </div>
    )}
  </div>
);

const CustomerCard = ({ customer, onClick }) => (
  <div
    onClick={onClick}
    style={{
      padding: '16px',
      background: 'white',
      borderRadius: '8px',
      border: '1px solid #e5e7eb',
      cursor: 'pointer',
      transition: 'all 0.2s ease',
    }}
    onMouseEnter={(e) => e.currentTarget.style.borderColor = '#3b82f6'}
    onMouseLeave={(e) => e.currentTarget.style.borderColor = '#e5e7eb'}
  >
    <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
      <div style={{
        width: '40px',
        height: '40px',
        borderRadius: '50%',
        background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
        color: 'white',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        fontWeight: 'bold',
        fontSize: '14px',
      }}>
        {(customer.name || 'C').charAt(0).toUpperCase()}
      </div>
      <div style={{ flex: 1 }}>
        <div style={{ fontWeight: '600', color: '#111827' }}>{customer.name}</div>
        <div style={{ fontSize: '13px', color: '#6b7280' }}>
          {customer.email} {customer.phone && `• ${customer.phone}`}
        </div>
        {customer.company && (
          <div style={{ fontSize: '12px', color: '#9ca3af', marginTop: '2px' }}>{customer.company}</div>
        )}
      </div>
    </div>
  </div>
);

const QuoteCard = ({ quote, onClick }) => {
  const statusColors = {
    DRAFT: { bg: '#f3f4f6', text: '#4b5563' },
    SENT: { bg: '#dbeafe', text: '#1d4ed8' },
    WON: { bg: '#d1fae5', text: '#059669' },
    LOST: { bg: '#fee2e2', text: '#dc2626' },
    EXPIRED: { bg: '#fef3c7', text: '#d97706' },
  };
  const colors = statusColors[quote.status] || statusColors.DRAFT;

  return (
    <div
      onClick={onClick}
      style={{
        padding: '16px',
        background: 'white',
        borderRadius: '8px',
        border: '1px solid #e5e7eb',
        cursor: 'pointer',
        transition: 'all 0.2s ease',
      }}
      onMouseEnter={(e) => e.currentTarget.style.borderColor = '#3b82f6'}
      onMouseLeave={(e) => e.currentTarget.style.borderColor = '#e5e7eb'}
    >
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <span style={{ fontWeight: '600', color: '#111827' }}>
              {quote.quote_number || quote.quotation_number}
            </span>
            <span style={{
              padding: '2px 8px',
              borderRadius: '4px',
              fontSize: '11px',
              fontWeight: '600',
              background: colors.bg,
              color: colors.text,
            }}>
              {quote.status}
            </span>
          </div>
          <div style={{ fontSize: '13px', color: '#6b7280', marginTop: '4px' }}>
            {quote.customer_name || 'No customer'}
          </div>
        </div>
        <div style={{ textAlign: 'right' }}>
          <div style={{ fontWeight: '600', color: '#111827' }}>
            ${((quote.total_cents || 0) / 100).toLocaleString()}
          </div>
          <div style={{ fontSize: '12px', color: '#9ca3af' }}>
            {new Date(quote.created_at).toLocaleDateString()}
          </div>
        </div>
      </div>
    </div>
  );
};

// Tab Button Component
const TabButton = ({ active, onClick, children, count }) => (
  <button
    onClick={onClick}
    style={{
      padding: '12px 20px',
      border: 'none',
      background: 'transparent',
      borderBottom: active ? '2px solid #3b82f6' : '2px solid transparent',
      color: active ? '#3b82f6' : '#6b7280',
      fontWeight: active ? '600' : '500',
      fontSize: '14px',
      cursor: 'pointer',
      display: 'flex',
      alignItems: 'center',
      gap: '8px',
      transition: 'all 0.2s ease',
    }}
  >
    {children}
    {count !== undefined && (
      <span style={{
        padding: '2px 8px',
        borderRadius: '10px',
        fontSize: '12px',
        background: active ? '#dbeafe' : '#f3f4f6',
        color: active ? '#3b82f6' : '#6b7280',
      }}>
        {count}
      </span>
    )}
  </button>
);

const SearchResults = () => {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const query = searchParams.get('q') || '';
  const type = searchParams.get('type') || 'all';

  const [activeTab, setActiveTab] = useState(type);
  const [loading, setLoading] = useState(true);
  const [results, setResults] = useState({
    products: [],
    customers: [],
    quotes: [],
  });
  const [error, setError] = useState(null);

  useEffect(() => {
    if (query.length < 2) {
      setLoading(false);
      return;
    }

    const fetchResults = async () => {
      setLoading(true);
      setError(null);

      try {
        const searches = [];

        // Determine which searches to run based on type
        if (type === 'all' || type === 'products') {
          searches.push(
            authFetch(`${API_URL}/api/products?search=${encodeURIComponent(query)}&limit=20`)
              .then(r => r.json())
              .then(data => ({ type: 'products', data: data.data?.products || data.products || [] }))
              .catch(() => ({ type: 'products', data: [] }))
          );
        }

        if (type === 'all' || type === 'customers') {
          searches.push(
            authFetch(`${API_URL}/api/customers?search=${encodeURIComponent(query)}&limit=20`)
              .then(r => r.json())
              .then(data => ({ type: 'customers', data: data.data?.customers || data.customers || data.data || [] }))
              .catch(() => ({ type: 'customers', data: [] }))
          );
        }

        if (type === 'all' || type === 'quotes') {
          searches.push(
            authFetch(`${API_URL}/api/quotes/search?search=${encodeURIComponent(query)}&limit=20`)
              .then(r => r.json())
              .then(data => ({ type: 'quotes', data: data.data?.quotations || data.quotations || data.data || [] }))
              .catch(() => ({ type: 'quotes', data: [] }))
          );
        }

        const searchResults = await Promise.all(searches);

        const newResults = { products: [], customers: [], quotes: [] };
        searchResults.forEach(result => {
          if (Array.isArray(result.data)) {
            newResults[result.type] = result.data;
          }
        });

        setResults(newResults);
      } catch (err) {
        setError('Failed to search. Please try again.');
        console.error('Search error:', err);
      } finally {
        setLoading(false);
      }
    };

    fetchResults();
  }, [query, type]);

  const totalResults = results.products.length + results.customers.length + results.quotes.length;

  const getDisplayResults = () => {
    switch (activeTab) {
      case 'products':
        return results.products;
      case 'customers':
        return results.customers;
      case 'quotes':
        return results.quotes;
      default:
        return [...results.quotes, ...results.customers, ...results.products];
    }
  };

  const renderResultCard = (item, index) => {
    // Determine item type based on properties
    if (item.quote_number || item.quotation_number) {
      return (
        <QuoteCard
          key={`quote-${item.id || index}`}
          quote={item}
          onClick={() => navigate(`/quotes/${item.id}`)}
        />
      );
    } else if (item.model || item.sku || item.msrp_cents) {
      return (
        <ProductCard
          key={`product-${item.id || index}`}
          product={item}
          onClick={() => navigate(`/products/${item.id}`)}
        />
      );
    } else if (item.email || item.phone) {
      return (
        <CustomerCard
          key={`customer-${item.id || index}`}
          customer={item}
          onClick={() => navigate(`/customers/${item.id}`)}
        />
      );
    }
    return null;
  };

  if (query.length < 2) {
    return (
      <div style={{ padding: '40px', textAlign: 'center' }}>
        <div style={{ fontSize: '48px', marginBottom: '16px' }}>🔍</div>
        <h2 style={{ color: '#374151', marginBottom: '8px' }}>Search the System</h2>
        <p style={{ color: '#6b7280' }}>Enter at least 2 characters to search for products, customers, or quotes.</p>
      </div>
    );
  }

  return (
    <div style={{ padding: '24px', maxWidth: '1200px', margin: '0 auto' }}>
      {/* Header */}
      <div style={{ marginBottom: '24px' }}>
        <h1 style={{ fontSize: '24px', fontWeight: '700', color: '#111827', marginBottom: '4px' }}>
          Search Results
        </h1>
        <p style={{ color: '#6b7280' }}>
          {loading ? 'Searching...' : `Found ${totalResults} results for "${query}"`}
        </p>
      </div>

      {/* Tabs */}
      <div style={{
        display: 'flex',
        borderBottom: '1px solid #e5e7eb',
        marginBottom: '24px',
        overflowX: 'auto',
      }}>
        <TabButton
          active={activeTab === 'all'}
          onClick={() => setActiveTab('all')}
          count={totalResults}
        >
          All
        </TabButton>
        <TabButton
          active={activeTab === 'quotes'}
          onClick={() => setActiveTab('quotes')}
          count={results.quotes.length}
        >
          Quotes
        </TabButton>
        <TabButton
          active={activeTab === 'customers'}
          onClick={() => setActiveTab('customers')}
          count={results.customers.length}
        >
          Customers
        </TabButton>
        <TabButton
          active={activeTab === 'products'}
          onClick={() => setActiveTab('products')}
          count={results.products.length}
        >
          Products
        </TabButton>
      </div>

      {/* Error State */}
      {error && (
        <div style={{
          padding: '16px',
          background: '#fee2e2',
          borderRadius: '8px',
          color: '#dc2626',
          marginBottom: '24px',
        }}>
          {error}
        </div>
      )}

      {/* Loading State */}
      {loading && (
        <div style={{ textAlign: 'center', padding: '40px' }}>
          <div style={{ fontSize: '32px', marginBottom: '16px' }}>⏳</div>
          <p style={{ color: '#6b7280' }}>Searching...</p>
        </div>
      )}

      {/* Results Grid */}
      {!loading && !error && (
        <div style={{
          display: 'grid',
          gap: '12px',
          gridTemplateColumns: 'repeat(auto-fill, minmax(350px, 1fr))',
        }}>
          {getDisplayResults().map((item, index) => renderResultCard(item, index))}
        </div>
      )}

      {/* Empty State */}
      {!loading && !error && getDisplayResults().length === 0 && (
        <div style={{ textAlign: 'center', padding: '40px' }}>
          <div style={{ fontSize: '48px', marginBottom: '16px' }}>📭</div>
          <h3 style={{ color: '#374151', marginBottom: '8px' }}>No results found</h3>
          <p style={{ color: '#6b7280' }}>
            Try adjusting your search terms or search in a different category.
          </p>
        </div>
      )}
    </div>
  );
};

export default SearchResults;
