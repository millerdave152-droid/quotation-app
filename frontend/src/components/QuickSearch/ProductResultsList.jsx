/**
 * ProductResultsList - Grid/List view with pagination
 */
import React from 'react';
import ProductResultCard from './ProductResultCard';

// Loading skeleton
const LoadingSkeleton = ({ viewMode, count = 8 }) => (
  <div className={viewMode === 'grid' ? 'loading-grid' : 'product-list'}>
    {Array.from({ length: count }).map((_, idx) => (
      <div key={idx} className="loading-card">
        <div className="skeleton skeleton-image" />
        <div className="skeleton skeleton-text medium" />
        <div className="skeleton skeleton-text short" />
      </div>
    ))}
  </div>
);

// Empty state
const EmptyState = ({ searchQuery, hasFilters }) => (
  <div className="empty-results">
    <svg width="64" height="64" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1">
      <circle cx="11" cy="11" r="8" />
      <line x1="21" y1="21" x2="16.65" y2="16.65" />
    </svg>
    <h3>No products found</h3>
    <p>
      {searchQuery
        ? `No results for "${searchQuery}". Try a different search term.`
        : hasFilters
          ? 'No products match the selected filters. Try adjusting your filters.'
          : 'No products available at this time.'}
    </p>
  </div>
);

// Pagination component
const Pagination = ({ pagination, onPageChange }) => {
  const { page, totalPages, totalCount } = pagination;

  if (totalPages <= 1) return null;

  const getPageNumbers = () => {
    const pages = [];
    const maxVisible = 5;

    if (totalPages <= maxVisible) {
      for (let i = 1; i <= totalPages; i++) {
        pages.push(i);
      }
    } else {
      // Always show first page
      pages.push(1);

      if (page > 3) {
        pages.push('...');
      }

      // Show pages around current
      for (let i = Math.max(2, page - 1); i <= Math.min(totalPages - 1, page + 1); i++) {
        if (!pages.includes(i)) {
          pages.push(i);
        }
      }

      if (page < totalPages - 2) {
        pages.push('...');
      }

      // Always show last page
      if (!pages.includes(totalPages)) {
        pages.push(totalPages);
      }
    }

    return pages;
  };

  return (
    <div className="pagination">
      <button
        onClick={() => onPageChange(page - 1)}
        disabled={page === 1}
      >
        Previous
      </button>

      {getPageNumbers().map((p, idx) => (
        p === '...' ? (
          <span key={`ellipsis-${idx}`} className="page-info">...</span>
        ) : (
          <button
            key={p}
            onClick={() => onPageChange(p)}
            className={page === p ? 'active' : ''}
            style={page === p ? { background: '#2563eb', color: 'white', borderColor: '#2563eb' } : {}}
          >
            {p}
          </button>
        )
      ))}

      <button
        onClick={() => onPageChange(page + 1)}
        disabled={page === totalPages}
      >
        Next
      </button>
    </div>
  );
};

const ProductResultsList = ({
  products = [],
  loading = false,
  viewMode = 'grid',
  userRole = 'sales',
  onAddToQuote,
  pagination = { page: 1, totalPages: 1, totalCount: 0 },
  onPageChange,
  searchQuery = '',
  hasFilters = false
}) => {
  // Loading state
  if (loading && products.length === 0) {
    return <LoadingSkeleton viewMode={viewMode} />;
  }

  // Empty state
  if (!loading && products.length === 0) {
    return <EmptyState searchQuery={searchQuery} hasFilters={hasFilters} />;
  }

  return (
    <>
      {/* Product Grid/List */}
      <div className={viewMode === 'grid' ? 'product-grid' : 'product-list'}>
        {products.map(product => (
          <ProductResultCard
            key={product.id}
            product={product}
            viewMode={viewMode}
            userRole={userRole}
            onAddToQuote={onAddToQuote}
          />
        ))}
      </div>

      {/* Loading overlay for pagination */}
      {loading && products.length > 0 && (
        <div style={{
          position: 'fixed',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          background: 'rgba(255,255,255,0.7)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 100
        }}>
          <div style={{
            padding: '1rem 2rem',
            background: 'white',
            borderRadius: '8px',
            boxShadow: '0 4px 12px rgba(0,0,0,0.15)'
          }}>
            Loading...
          </div>
        </div>
      )}

      {/* Pagination */}
      <Pagination
        pagination={pagination}
        onPageChange={onPageChange}
      />
    </>
  );
};

export default ProductResultsList;
