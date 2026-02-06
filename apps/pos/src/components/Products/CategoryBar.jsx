/**
 * TeleTime POS - Category Bar Component
 * Horizontal scrollable list of product categories
 */

import { useState, useEffect, useRef } from 'react';
import { ChevronLeftIcon, ChevronRightIcon } from '@heroicons/react/24/outline';
import { getCategories } from '../../api/products';

/**
 * Horizontal scrollable category bar
 * @param {object} props
 * @param {number|null} props.selectedCategory - Currently selected category ID (null for All)
 * @param {function} props.onSelect - Callback when category is selected
 * @param {function} props.onSelectCategory - Alias for onSelect
 * @param {string} props.className - Additional CSS classes
 */
export function CategoryBar({
  selectedCategory = null,
  onSelect,
  onSelectCategory,
  className = '',
}) {
  // Support both prop names
  const handleSelect = onSelectCategory || onSelect;
  const [categories, setCategories] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [showLeftArrow, setShowLeftArrow] = useState(false);
  const [showRightArrow, setShowRightArrow] = useState(false);
  const scrollContainerRef = useRef(null);

  // Fetch categories on mount
  useEffect(() => {
    const fetchCategories = async () => {
      setIsLoading(true);
      const result = await getCategories();
      if (result.success) {
        // Extract categories array from response - API may return { categories: [...] } or array directly
        const cats = result.data?.categories || result.data || [];
        setCategories(Array.isArray(cats) ? cats : []);
      }
      setIsLoading(false);
    };

    fetchCategories();
  }, []);

  // Check scroll arrows visibility
  const updateArrows = () => {
    const container = scrollContainerRef.current;
    if (!container) return;

    setShowLeftArrow(container.scrollLeft > 0);
    setShowRightArrow(
      container.scrollLeft < container.scrollWidth - container.clientWidth - 1
    );
  };

  // Update arrows on scroll and resize
  useEffect(() => {
    const container = scrollContainerRef.current;
    if (!container) return;

    updateArrows();
    container.addEventListener('scroll', updateArrows);
    window.addEventListener('resize', updateArrows);

    return () => {
      container.removeEventListener('scroll', updateArrows);
      window.removeEventListener('resize', updateArrows);
    };
  }, [categories]);

  // Scroll handlers
  const scrollLeft = () => {
    scrollContainerRef.current?.scrollBy({ left: -200, behavior: 'smooth' });
  };

  const scrollRight = () => {
    scrollContainerRef.current?.scrollBy({ left: 200, behavior: 'smooth' });
  };

  // Handle category click
  const handleCategoryClick = (categoryId) => {
    handleSelect?.(categoryId);
  };

  // Loading skeleton
  if (isLoading) {
    return (
      <div className={`flex gap-2 overflow-hidden ${className}`}>
        {[...Array(6)].map((_, i) => (
          <div
            key={i}
            className="h-11 w-24 bg-gray-200 rounded-lg animate-pulse flex-shrink-0"
          />
        ))}
      </div>
    );
  }

  return (
    <div className={`relative ${className}`}>
      {/* Left scroll arrow */}
      {showLeftArrow && (
        <button
          onClick={scrollLeft}
          className="
            absolute left-0 top-1/2 -translate-y-1/2 z-10
            w-8 h-8
            flex items-center justify-center
            bg-white shadow-lg
            rounded-full
            text-gray-600 hover:text-gray-900
            transition-colors duration-150
          "
          aria-label="Scroll left"
        >
          <ChevronLeftIcon className="w-5 h-5" />
        </button>
      )}

      {/* Categories container */}
      <div
        ref={scrollContainerRef}
        className="
          flex gap-2 overflow-x-auto
          px-1 py-1
          scrollbar-hide
          scroll-smooth
        "
        style={{ scrollbarWidth: 'none', msOverflowStyle: 'none' }}
      >
        {/* "All" option */}
        <button
          onClick={() => handleCategoryClick(null)}
          className={`
            flex-shrink-0
            h-11 px-5
            flex items-center justify-center
            text-sm font-semibold
            rounded-lg
            transition-all duration-150
            ${
              selectedCategory === null
                ? 'bg-blue-600 text-white shadow-md'
                : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
            }
          `}
        >
          All
        </button>

        {/* Category buttons */}
        {categories.map((category) => (
          <button
            key={category.categoryId || category.category_id || category.id}
            onClick={() =>
              handleCategoryClick(
                category.categoryId || category.category_id || category.id
              )
            }
            className={`
              flex-shrink-0
              h-11 px-5
              flex items-center justify-center
              text-sm font-semibold
              rounded-lg
              whitespace-nowrap
              transition-all duration-150
              ${
                selectedCategory ===
                (category.categoryId || category.category_id || category.id)
                  ? 'bg-blue-600 text-white shadow-md'
                  : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
              }
            `}
          >
            {category.categoryName || category.category_name || category.name}
          </button>
        ))}
      </div>

      {/* Right scroll arrow */}
      {showRightArrow && (
        <button
          onClick={scrollRight}
          className="
            absolute right-0 top-1/2 -translate-y-1/2 z-10
            w-8 h-8
            flex items-center justify-center
            bg-white shadow-lg
            rounded-full
            text-gray-600 hover:text-gray-900
            transition-colors duration-150
          "
          aria-label="Scroll right"
        >
          <ChevronRightIcon className="w-5 h-5" />
        </button>
      )}
    </div>
  );
}

export default CategoryBar;
