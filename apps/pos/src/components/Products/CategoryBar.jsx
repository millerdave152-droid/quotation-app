/**
 * TeleTime POS - Category Bar Component
 * Horizontal scrollable list of product categories
 */

import { useState, useEffect, useRef } from 'react';
import { getCategories } from '../../api/products';
import api from '../../api/axios';
import { ChevronLeft, ChevronRight } from 'lucide-react';

/**
 * Horizontal scrollable category bar
 * @param {object} props
 * @param {number|null} props.selectedCategory - Currently selected category ID (null for All)
 * @param {function} props.onSelect - Callback when category is selected
 * @param {function} props.onSelectCategory - Alias for onSelect
 * @param {function} props.onSpecFilter - Callback when spec filter changes: { specKey: value }
 * @param {string} props.className - Additional CSS classes
 */
export function CategoryBar({
  selectedCategory = null,
  onSelect,
  onSelectCategory,
  onSpecFilter,
  className = '',
}) {
  // Support both prop names
  const handleSelect = onSelectCategory || onSelect;
  const [categories, setCategories] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [showLeftArrow, setShowLeftArrow] = useState(false);
  const [showRightArrow, setShowRightArrow] = useState(false);
  const [specOptions, setSpecOptions] = useState([]);
  const [activeSpecs, setActiveSpecs] = useState({});
  const [recentCategories, setRecentCategories] = useState([]); // Last 4 browsed category IDs
  const [showRecent, setShowRecent] = useState(false);
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

  // Fetch spec options when selected category changes
  useEffect(() => {
    if (selectedCategory && categories.length > 0) {
      const cat = categories.find(
        c => (c.categoryId || c.category_id || c.id) === selectedCategory
      );
      const slug = cat?.slug || cat?.category_slug;
      if (slug) {
        api.get(`/categories/${slug}/specs`)
          .then((r) => {
            const specs = r.specs || r.data?.specs || [];
            setSpecOptions(specs);
          })
          .catch(() => setSpecOptions([]));
      } else {
        setSpecOptions([]);
      }
    } else {
      setSpecOptions([]);
    }
    setActiveSpecs({});
    onSpecFilter?.({});
  }, [selectedCategory, categories]);

  // Handle spec filter toggle
  const handleSpecToggle = (specKey, value) => {
    const next = { ...activeSpecs };
    if (next[specKey] === value) {
      delete next[specKey];
    } else {
      next[specKey] = value;
    }
    setActiveSpecs(next);
    onSpecFilter?.(next);
  };

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

  // Handle category click + track recently viewed
  const handleCategoryClick = (categoryId) => {
    handleSelect?.(categoryId);
    if (categoryId !== null) {
      setRecentCategories(prev => {
        const filtered = prev.filter(id => id !== categoryId);
        return [categoryId, ...filtered].slice(0, 4);
      });
    }
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
          <ChevronLeft className="w-5 h-5" />
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

        {/* Recently viewed categories */}
        {recentCategories.length > 0 && (() => {
          const recentCats = recentCategories
            .map(id => categories.find(c => (c.categoryId || c.category_id || c.id) === id))
            .filter(Boolean);
          if (recentCats.length === 0) return null;
          return (
            <>
              <div className="flex-shrink-0 w-px h-7 self-center bg-gray-300" />
              <span className="flex-shrink-0 text-[10px] font-medium text-gray-400 self-center px-1">Recent</span>
              {recentCats.map((cat) => {
                const catId = cat.categoryId || cat.category_id || cat.id;
                return (
                  <button
                    key={`recent-${catId}`}
                    onClick={() => handleCategoryClick(catId)}
                    className={`
                      flex-shrink-0
                      h-11 px-4
                      flex items-center justify-center
                      text-sm font-semibold
                      rounded-lg
                      whitespace-nowrap
                      transition-all duration-150
                      ${
                        selectedCategory === catId
                          ? 'bg-purple-600 text-white shadow-md'
                          : 'bg-purple-50 text-purple-700 hover:bg-purple-100 border border-purple-200'
                      }
                    `}
                  >
                    {cat.categoryName || cat.category_name || cat.name}
                  </button>
                );
              })}
              <div className="flex-shrink-0 w-px h-7 self-center bg-gray-300" />
            </>
          );
        })()}

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
          <ChevronRight className="w-5 h-5" />
        </button>
      )}

      {/* Spec Quick-Filter Pills */}
      {specOptions.length > 0 && (
        <div
          className="flex flex-wrap gap-2 px-1 py-1.5 mt-1.5 border-t border-gray-100"
        >
          {specOptions.map((spec) => (
            <div key={spec.spec_key} className="flex items-center gap-1">
              <span className="text-[11px] font-medium text-gray-500 mr-0.5">{spec.spec_label}:</span>
              {spec.spec_values.map((val) => (
                <button
                  key={val}
                  onClick={() => handleSpecToggle(spec.spec_key, val)}
                  className={`
                    flex-shrink-0 h-8 px-3
                    text-xs font-medium rounded-lg
                    transition-all duration-150
                    ${activeSpecs[spec.spec_key] === val
                      ? 'bg-blue-600 text-white shadow-sm'
                      : 'bg-gray-50 text-gray-600 hover:bg-gray-100 border border-gray-200'
                    }
                  `}
                >
                  {val}
                </button>
              ))}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export default CategoryBar;
