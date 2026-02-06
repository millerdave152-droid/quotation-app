/**
 * TeleTime POS - Product Search Component
 * Search input with debounce for finding products
 */

import { useState, useCallback, useRef, useEffect, forwardRef, useImperativeHandle } from 'react';
import { MagnifyingGlassIcon, XMarkIcon } from '@heroicons/react/24/outline';
import { quickSearch as quickSearchProducts } from '../../api/products';
import { formatCurrency } from '../../utils/formatters';

/**
 * Product search input with debounce and optional dropdown results
 * Supports both controlled and uncontrolled modes
 *
 * @param {object} props
 * @param {string} props.value - Controlled input value (optional)
 * @param {function} props.onChange - Controlled change handler (optional)
 * @param {function} props.onSelect - Callback when product is selected from dropdown
 * @param {function} props.onSearch - Legacy callback when search value changes (debounced)
 * @param {string} props.placeholder - Input placeholder text
 * @param {boolean} props.isLoading - Override loading state
 * @param {number} props.resultCount - Override result count display
 * @param {boolean} props.showResultCount - Whether to show result count
 * @param {boolean} props.showDropdown - Whether to show results dropdown (default: true if onSelect provided)
 * @param {string} props.className - Additional CSS classes
 * @param {React.Ref} ref - Forwarded ref to access input focus
 */
export const ProductSearch = forwardRef(function ProductSearch({
  value: controlledValue,
  onChange: controlledOnChange,
  onSelect,
  onSearch,
  placeholder = 'Search by name, SKU, or barcode...',
  isLoading: externalLoading,
  resultCount: externalResultCount,
  showResultCount = false,
  showDropdown,
  className = '',
}, ref) {
  // Internal state for uncontrolled mode
  const [internalValue, setInternalValue] = useState('');
  const [results, setResults] = useState([]);
  const [isSearching, setIsSearching] = useState(false);
  const [showResults, setShowResults] = useState(false);

  const debounceRef = useRef(null);
  const inputRef = useRef(null);
  const containerRef = useRef(null);

  // Expose focus method via ref
  useImperativeHandle(ref, () => ({
    focus: () => inputRef.current?.focus(),
    blur: () => inputRef.current?.blur(),
    select: () => inputRef.current?.select(),
  }));

  // Determine if controlled
  const isControlled = controlledValue !== undefined;
  const value = isControlled ? controlledValue : internalValue;
  const isLoading = externalLoading ?? isSearching;
  const resultCount = externalResultCount ?? results.length;
  const shouldShowDropdown = showDropdown ?? !!onSelect;

  // Perform search
  const performSearch = useCallback(async (searchQuery) => {
    if (!searchQuery || searchQuery.length < 2) {
      setResults([]);
      setShowResults(false);
      return;
    }

    if (shouldShowDropdown) {
      setIsSearching(true);
      try {
        const response = await quickSearchProducts(searchQuery);
        if (response.success) {
          setResults(response.data || []);
          setShowResults(true);
        }
      } catch (err) {
        console.error('[ProductSearch] Search error:', err);
        setResults([]);
      } finally {
        setIsSearching(false);
      }
    }
  }, [shouldShowDropdown]);

  // Debounced search
  const debouncedSearch = useCallback(
    (searchValue) => {
      if (debounceRef.current) {
        clearTimeout(debounceRef.current);
      }

      debounceRef.current = setTimeout(() => {
        onSearch?.(searchValue);
        performSearch(searchValue);
      }, 300);
    },
    [onSearch, performSearch]
  );

  // Handle input change
  const handleChange = (e) => {
    const newValue = e.target.value;

    if (isControlled) {
      controlledOnChange?.(newValue);
    } else {
      setInternalValue(newValue);
    }

    debouncedSearch(newValue);
  };

  // Handle product selection
  const handleSelectProduct = (product) => {
    onSelect?.(product);

    // Clear search after selection
    if (isControlled) {
      controlledOnChange?.('');
    } else {
      setInternalValue('');
    }
    setResults([]);
    setShowResults(false);
    inputRef.current?.focus();
  };

  // Handle clear
  const handleClear = () => {
    if (isControlled) {
      controlledOnChange?.('');
    } else {
      setInternalValue('');
    }
    onSearch?.('');
    setResults([]);
    setShowResults(false);
    inputRef.current?.focus();
  };

  // Handle keyboard shortcuts
  const handleKeyDown = (e) => {
    if (e.key === 'Escape') {
      if (showResults) {
        setShowResults(false);
      } else {
        handleClear();
      }
    }
  };

  // Close dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (e) => {
      if (containerRef.current && !containerRef.current.contains(e.target)) {
        setShowResults(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Cleanup debounce on unmount
  useEffect(() => {
    return () => {
      if (debounceRef.current) {
        clearTimeout(debounceRef.current);
      }
    };
  }, []);

  return (
    <div ref={containerRef} className={`relative ${className}`}>
      {/* Search Input Container */}
      <div className="relative flex items-center">
        {/* Search Icon */}
        <div className="absolute left-4 pointer-events-none">
          {isLoading ? (
            <div className="w-5 h-5 border-2 border-gray-300 border-t-blue-600 rounded-full animate-spin" />
          ) : (
            <MagnifyingGlassIcon className="w-5 h-5 text-gray-400" />
          )}
        </div>

        {/* Input Field */}
        <input
          ref={inputRef}
          type="text"
          value={value}
          onChange={handleChange}
          onKeyDown={handleKeyDown}
          onFocus={() => results.length > 0 && setShowResults(true)}
          placeholder={placeholder}
          className="
            w-full h-12 pl-12 pr-12
            text-base font-medium
            bg-white border-2 border-gray-200
            rounded-xl
            placeholder:text-gray-400
            focus:outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100
            transition-all duration-150
          "
          autoComplete="off"
          autoCorrect="off"
          autoCapitalize="off"
          spellCheck="false"
          data-barcode-ignore="true"
        />

        {/* Clear Button */}
        {value && (
          <button
            type="button"
            onClick={handleClear}
            className="
              absolute right-2
              w-8 h-8
              flex items-center justify-center
              text-gray-400 hover:text-gray-600
              hover:bg-gray-100
              rounded-lg
              transition-colors duration-150
            "
            aria-label="Clear search"
          >
            <XMarkIcon className="w-5 h-5" />
          </button>
        )}
      </div>

      {/* Result Count (legacy) */}
      {showResultCount && value && !isLoading && (
        <div className="absolute -bottom-6 left-0 text-sm text-gray-500">
          {resultCount === 0 ? (
            <span>No products found</span>
          ) : resultCount === 1 ? (
            <span>1 product found</span>
          ) : (
            <span>{resultCount} products found</span>
          )}
        </div>
      )}

      {/* Results Dropdown */}
      {shouldShowDropdown && showResults && results.length > 0 && (
        <div className="absolute top-full left-0 right-0 mt-2 bg-white rounded-xl shadow-lg border border-gray-200 max-h-80 overflow-y-auto z-50">
          <div className="px-3 py-2 bg-gray-50 border-b border-gray-100 text-xs text-gray-500">
            {results.length} {results.length === 1 ? 'product' : 'products'} found
          </div>
          {results.map((product) => {
            const productId = product.productId || product.product_id || product.id;
            const name = product.name || product.productName || product.product_name;
            const sku = product.sku || product.productSku || product.product_sku;
            const price = product.price || product.unitPrice || product.unit_price || 0;
            const stockQty = product.stockQty ?? product.stock_qty ?? product.stock ?? null;

            return (
              <button
                key={productId}
                type="button"
                onClick={() => handleSelectProduct(product)}
                className="
                  w-full px-4 py-3
                  flex items-center gap-4
                  text-left
                  hover:bg-gray-50
                  border-b border-gray-100 last:border-0
                  transition-colors
                "
              >
                <div className="flex-1 min-w-0">
                  <p className="font-medium text-gray-900 truncate">{name}</p>
                  <p className="text-sm text-gray-500">SKU: {sku}</p>
                </div>
                <div className="text-right flex-shrink-0">
                  <p className="font-semibold text-gray-900 tabular-nums">
                    {formatCurrency(price)}
                  </p>
                  {stockQty !== null && (
                    <p className={`text-xs ${stockQty > 0 ? 'text-green-600' : 'text-red-600'}`}>
                      {stockQty > 0 ? `${stockQty} in stock` : 'Out of stock'}
                    </p>
                  )}
                </div>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
});

export default ProductSearch;
