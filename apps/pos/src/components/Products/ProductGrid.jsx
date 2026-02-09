/**
 * TeleTime POS - Product Grid Component
 * Grid layout for displaying products with optional internal data fetching
 */

import { useState, useCallback, useRef, useEffect } from 'react';
import ProductTile from './ProductTile';
import { getProducts, getProductsByCategory, quickSearch } from '../../api/products';

/**
 * Skeleton loader for product tiles
 */
function ProductSkeleton() {
  return (
    <div className="flex flex-col w-full min-h-[160px] p-3 bg-white border-2 border-gray-100 rounded-xl animate-pulse">
      {/* Image skeleton */}
      <div className="w-full h-20 mb-2 bg-gray-200 rounded-lg" />
      {/* Title skeleton */}
      <div className="h-4 w-3/4 bg-gray-200 rounded mb-2" />
      {/* SKU skeleton */}
      <div className="h-3 w-1/2 bg-gray-200 rounded mb-2" />
      {/* Price skeleton */}
      <div className="mt-auto h-5 w-1/3 bg-gray-200 rounded" />
    </div>
  );
}

/**
 * Empty state component
 */
function EmptyState({ searchActive, categoryActive }) {
  let title = 'Ready to Sell';
  let message = 'Search for a product, scan a barcode, or pick from your favorites above to get started.';
  let icon = (
    <svg className="w-10 h-10 text-blue-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M21 21l-5.197-5.197m0 0A7.5 7.5 0 105.196 5.196a7.5 7.5 0 0010.607 10.607z" />
    </svg>
  );
  let bgColor = 'bg-blue-50';

  if (searchActive) {
    title = 'No products found';
    message = "Try adjusting your search or check the spelling.";
    icon = (
      <svg className="w-10 h-10 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4" />
      </svg>
    );
    bgColor = 'bg-gray-100';
  } else if (categoryActive) {
    title = 'No products in this category';
    message = 'Try selecting a different category or searching for products.';
    icon = (
      <svg className="w-10 h-10 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4" />
      </svg>
    );
    bgColor = 'bg-gray-100';
  }

  return (
    <div className="flex flex-col items-center justify-center py-16 px-4 text-center">
      <div className={`w-20 h-20 mb-4 rounded-full ${bgColor} flex items-center justify-center`}>
        {icon}
      </div>
      <h3 className="text-lg font-semibold text-gray-900 mb-2">{title}</h3>
      <p className="text-sm text-gray-500 max-w-xs">{message}</p>
      {!searchActive && !categoryActive && (
        <div className="mt-4 flex items-center gap-4 text-xs text-gray-400">
          <span className="flex items-center gap-1">
            <kbd className="px-1.5 py-0.5 bg-gray-100 rounded text-gray-500 font-mono">F2</kbd> Search
          </span>
          <span className="flex items-center gap-1">
            <kbd className="px-1.5 py-0.5 bg-gray-100 rounded text-gray-500 font-mono">F8</kbd> Price Check
          </span>
        </div>
      )}
    </div>
  );
}

/**
 * Product grid component
 * Supports two modes:
 * 1. External data: Pass products array directly
 * 2. Internal fetch: Pass categoryId and/or searchQuery to auto-fetch
 *
 * @param {object} props
 * @param {Array} props.products - Products to display (external mode)
 * @param {string|number} props.categoryId - Category to filter by (fetch mode)
 * @param {string} props.searchQuery - Search query (fetch mode)
 * @param {function} props.onProductSelect - Callback when product is selected
 * @param {function} props.onSelect - Alias for onProductSelect
 * @param {boolean} props.isLoading - Override loading state
 * @param {boolean} props.hasMore - More products available (external mode)
 * @param {function} props.onLoadMore - Load more callback (external mode)
 * @param {string} props.className - Additional CSS classes
 */
export function ProductGrid({
  products: externalProducts,
  categoryId,
  searchQuery,
  onProductSelect,
  onSelect,
  isLoading: externalLoading,
  hasMore: externalHasMore,
  onLoadMore: externalOnLoadMore,
  className = '',
}) {
  // Internal state for fetch mode
  const [internalProducts, setInternalProducts] = useState([]);
  const [internalLoading, setInternalLoading] = useState(false);
  const [page, setPage] = useState(1);
  const [hasMorePages, setHasMorePages] = useState(true);
  const [totalCount, setTotalCount] = useState(0);

  const observerRef = useRef(null);
  const loadMoreRef = useRef(null);
  const fetchIdRef = useRef(0);

  // Determine mode
  const isExternalMode = externalProducts !== undefined;
  const products = isExternalMode ? externalProducts : internalProducts;
  const isLoading = externalLoading ?? internalLoading;
  const hasMore = isExternalMode ? (externalHasMore ?? false) : hasMorePages;
  const onLoadMore = isExternalMode ? externalOnLoadMore : () => setPage(p => p + 1);
  const handleSelect = onProductSelect || onSelect;

  // Fetch products (internal mode)
  const fetchProducts = useCallback(async (pageNum = 1, append = false) => {
    if (isExternalMode) return;

    const currentFetchId = ++fetchIdRef.current;
    setInternalLoading(true);

    try {
      let response;

      if (searchQuery && searchQuery.length >= 2) {
        // Search mode
        response = await quickSearch(searchQuery);
        if (currentFetchId === fetchIdRef.current && response.success) {
          setInternalProducts(response.data || []);
          setHasMorePages(false); // Search doesn't paginate
          setTotalCount(response.data?.length || 0);
        }
      } else if (categoryId) {
        // Category filter mode
        response = await getProductsByCategory(categoryId, { page: pageNum, limit: 24 });
        if (currentFetchId === fetchIdRef.current && response.success) {
          const newProducts = response.data || [];
          setInternalProducts(prev => append ? [...prev, ...newProducts] : newProducts);
          setHasMorePages(newProducts.length >= 24);
          setTotalCount(response.total || newProducts.length);
        }
      } else {
        // All products mode
        response = await getProducts({ page: pageNum, limit: 24 });
        if (currentFetchId === fetchIdRef.current && response.success) {
          const newProducts = response.data || [];
          setInternalProducts(prev => append ? [...prev, ...newProducts] : newProducts);
          setHasMorePages(newProducts.length >= 24);
          setTotalCount(response.total || newProducts.length);
        }
      }
    } catch (err) {
      console.error('[ProductGrid] Fetch error:', err);
      if (currentFetchId === fetchIdRef.current) {
        setInternalProducts([]);
        setHasMorePages(false);
      }
    } finally {
      if (currentFetchId === fetchIdRef.current) {
        setInternalLoading(false);
      }
    }
  }, [isExternalMode, categoryId, searchQuery]);

  // Reset and fetch when category or search changes
  useEffect(() => {
    if (isExternalMode) return;

    setPage(1);
    setInternalProducts([]);
    fetchProducts(1, false);
  }, [isExternalMode, categoryId, searchQuery, fetchProducts]);

  // Fetch more when page changes (pagination)
  useEffect(() => {
    if (isExternalMode || page === 1) return;
    fetchProducts(page, true);
  }, [isExternalMode, page, fetchProducts]);

  // Intersection observer for infinite scroll
  useEffect(() => {
    if (!hasMore || !onLoadMore) return;

    const options = {
      root: null,
      rootMargin: '100px',
      threshold: 0.1,
    };

    observerRef.current = new IntersectionObserver((entries) => {
      if (entries[0].isIntersecting && hasMore && !isLoading) {
        onLoadMore();
      }
    }, options);

    if (loadMoreRef.current) {
      observerRef.current.observe(loadMoreRef.current);
    }

    return () => {
      if (observerRef.current) {
        observerRef.current.disconnect();
      }
    };
  }, [hasMore, isLoading, onLoadMore]);

  // Handle product selection
  const handleProductSelect = useCallback(
    (product) => {
      handleSelect?.(product);
    },
    [handleSelect]
  );

  // Determine search/category active states
  const searchActive = !!(searchQuery && searchQuery.length >= 2);
  const categoryActive = !!categoryId;

  // Initial loading state
  if (isLoading && products.length === 0) {
    return (
      <div className={`p-4 ${className}`}>
        <div
          className="
            grid gap-3
            grid-cols-[repeat(auto-fill,minmax(140px,1fr))]
          "
        >
          {[...Array(12)].map((_, i) => (
            <ProductSkeleton key={i} />
          ))}
        </div>
      </div>
    );
  }

  // Empty state
  if (!isLoading && products.length === 0) {
    return <EmptyState searchActive={searchActive} categoryActive={categoryActive} />;
  }

  return (
    <div className={`p-4 ${className}`}>
      {/* Product Grid */}
      <div
        className="
          grid gap-3
          grid-cols-[repeat(auto-fill,minmax(140px,1fr))]
        "
      >
        {products.map((product) => (
          <ProductTile
            key={product.productId || product.product_id || product.id}
            product={product}
            onSelect={handleProductSelect}
          />
        ))}

        {/* Loading more skeletons */}
        {isLoading &&
          products.length > 0 &&
          [...Array(4)].map((_, i) => <ProductSkeleton key={`loading-${i}`} />)}
      </div>

      {/* Load More Section */}
      {hasMore && (
        <div ref={loadMoreRef} className="flex justify-center py-6">
          {isLoading ? (
            <div className="flex items-center gap-2 text-gray-500">
              <div className="w-5 h-5 border-2 border-gray-300 border-t-blue-600 rounded-full animate-spin" />
              <span>Loading more...</span>
            </div>
          ) : (
            <button
              type="button"
              onClick={onLoadMore}
              className="
                h-11 px-6
                bg-gray-100 hover:bg-gray-200
                text-gray-700 font-medium
                rounded-lg
                transition-colors duration-150
              "
            >
              Load More Products
            </button>
          )}
        </div>
      )}
    </div>
  );
}

export default ProductGrid;
