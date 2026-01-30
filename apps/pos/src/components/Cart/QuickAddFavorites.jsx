/**
 * TeleTime POS - Quick Add Favorites Panel
 * Shows frequently-added products as touch-friendly buttons for fast cart additions
 */

import { useState, useEffect, useCallback, useRef } from 'react';
import { StarIcon, XMarkIcon } from '@heroicons/react/24/outline';
import { StarIcon as StarSolidIcon } from '@heroicons/react/24/solid';
import { formatCurrency } from '../../utils/formatters';

const FAVORITES_KEY = 'pos_favorites';
const MAX_DISPLAY = 8;

/**
 * Load favorites from localStorage
 */
const loadFavorites = () => {
  try {
    const stored = localStorage.getItem(FAVORITES_KEY);
    return stored ? JSON.parse(stored) : {};
  } catch {
    return {};
  }
};

/**
 * Save favorites to localStorage
 */
const saveFavorites = (favorites) => {
  try {
    localStorage.setItem(FAVORITES_KEY, JSON.stringify(favorites));
  } catch (err) {
    console.error('[Favorites] Failed to save:', err);
  }
};

/**
 * Update favorite count for a product (called externally from CartContext)
 */
export function trackFavorite(product) {
  const productId = product.productId || product.product_id;
  if (!productId) return;

  const favorites = loadFavorites();
  const existing = favorites[productId];

  favorites[productId] = {
    product: {
      productId,
      name: product.name || product.productName || product.product_name,
      price: parseFloat(product.price || product.unitPrice || product.unit_price || 0),
      sku: product.sku || product.productSku || product.product_sku || '',
      imageUrl: product.imageUrl || product.image_url || null,
    },
    addCount: (existing?.addCount || 0) + 1,
    lastAdded: new Date().toISOString(),
  };

  saveFavorites(favorites);
}

/**
 * Remove a product from favorites
 */
export function removeFavorite(productId) {
  const favorites = loadFavorites();
  delete favorites[productId];
  saveFavorites(favorites);
}

/**
 * Check if a product is in favorites
 */
export function isFavorite(productId) {
  const favorites = loadFavorites();
  return !!favorites[productId];
}

/**
 * QuickAddFavorites panel component
 */
export function QuickAddFavorites({ onAddItem }) {
  const [favorites, setFavorites] = useState([]);
  const [longPressId, setLongPressId] = useState(null);
  const longPressTimer = useRef(null);

  // Load and sort favorites
  const refreshFavorites = useCallback(() => {
    const stored = loadFavorites();
    const sorted = Object.entries(stored)
      .map(([id, data]) => ({ id, ...data }))
      .sort((a, b) => b.addCount - a.addCount)
      .slice(0, MAX_DISPLAY);
    setFavorites(sorted);
  }, []);

  useEffect(() => {
    refreshFavorites();

    // Listen for storage changes (from other tabs or addItem calls)
    const handleStorage = (e) => {
      if (e.key === FAVORITES_KEY) refreshFavorites();
    };
    window.addEventListener('storage', handleStorage);
    return () => window.removeEventListener('storage', handleStorage);
  }, [refreshFavorites]);

  // Refresh when favorites might have changed (poll every 2s)
  useEffect(() => {
    const interval = setInterval(refreshFavorites, 2000);
    return () => clearInterval(interval);
  }, [refreshFavorites]);

  const handleAdd = useCallback((fav) => {
    onAddItem?.(fav.product);
  }, [onAddItem]);

  const handleRemove = useCallback((productId) => {
    removeFavorite(productId);
    setLongPressId(null);
    refreshFavorites();
  }, [refreshFavorites]);

  const handlePointerDown = useCallback((productId) => {
    longPressTimer.current = setTimeout(() => {
      setLongPressId(productId);
    }, 600);
  }, []);

  const handlePointerUp = useCallback(() => {
    if (longPressTimer.current) {
      clearTimeout(longPressTimer.current);
      longPressTimer.current = null;
    }
  }, []);

  if (favorites.length === 0) return null;

  return (
    <div className="px-4 py-2 bg-amber-50 border-b border-amber-200">
      <div className="flex items-center gap-2 mb-2">
        <StarSolidIcon className="w-4 h-4 text-amber-500" />
        <span className="text-xs font-semibold text-amber-700 uppercase tracking-wide">
          Favorites
        </span>
      </div>
      <div className="flex flex-wrap gap-2">
        {favorites.map((fav) => (
          <div key={fav.id} className="relative">
            <button
              type="button"
              onClick={() => handleAdd(fav)}
              onPointerDown={() => handlePointerDown(fav.id)}
              onPointerUp={handlePointerUp}
              onPointerLeave={handlePointerUp}
              className="
                flex items-center gap-2
                h-9 px-3
                bg-white border border-amber-200
                rounded-lg
                text-sm font-medium text-gray-700
                hover:bg-amber-100 hover:border-amber-300
                active:scale-95
                transition-all duration-100
                select-none
              "
            >
              <span className="truncate max-w-[120px]">
                {fav.product.name}
              </span>
              <span className="text-xs text-gray-400">
                {formatCurrency(fav.product.price)}
              </span>
            </button>

            {/* Remove button (shown on long-press or hover on desktop) */}
            {longPressId === fav.id && (
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  handleRemove(fav.id);
                }}
                className="
                  absolute -top-2 -right-2 z-10
                  w-5 h-5
                  bg-red-500 text-white
                  rounded-full
                  flex items-center justify-center
                  shadow-md
                "
              >
                <XMarkIcon className="w-3 h-3" />
              </button>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

/**
 * Star toggle button for cart items to add/remove from favorites
 */
export function FavoriteToggle({ product }) {
  const productId = product.productId || product.product_id;
  const [starred, setStarred] = useState(false);

  useEffect(() => {
    setStarred(isFavorite(productId));
  }, [productId]);

  const toggle = (e) => {
    e.stopPropagation();
    if (starred) {
      removeFavorite(productId);
      setStarred(false);
    } else {
      trackFavorite(product);
      setStarred(true);
    }
  };

  return (
    <button
      type="button"
      onClick={toggle}
      className="w-7 h-7 flex items-center justify-center rounded-md hover:bg-amber-50 transition-colors"
      title={starred ? 'Remove from favorites' : 'Add to favorites'}
    >
      {starred ? (
        <StarSolidIcon className="w-4 h-4 text-amber-500" />
      ) : (
        <StarIcon className="w-4 h-4 text-gray-300 hover:text-amber-400" />
      )}
    </button>
  );
}

export default QuickAddFavorites;
