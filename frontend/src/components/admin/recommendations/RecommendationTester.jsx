import { authFetch } from '../../../services/authFetch';
/**
 * RecommendationTester - Debug tool for testing recommendations
 * Enter a product or simulate a cart to see what recommendations would appear
 */

import { useState, useEffect } from 'react';
import {
  MagnifyingGlassIcon,
  ShoppingCartIcon,
  BeakerIcon,
  PlusIcon,
  XMarkIcon,
  InformationCircleIcon,
  CheckCircleIcon,
  ExclamationTriangleIcon,
  ArrowPathIcon,
} from '@heroicons/react/24/outline';

const API_BASE = import.meta.env.VITE_API_URL || 'http://localhost:3001';

/**
 * Product search input
 */
function ProductSearchInput({ onSelect, placeholder }) {
  const [search, setSearch] = useState('');
  const [results, setResults] = useState([]);
  const [loading, setLoading] = useState(false);
  const [isOpen, setIsOpen] = useState(false);

  useEffect(() => {
    if (!search || search.length < 2) {
      setResults([]);
      return;
    }

    const timer = setTimeout(async () => {
      setLoading(true);
      try {
        const token = localStorage.getItem('auth_token');
        const response = await authFetch(
          `${API_BASE}/api/products?search=${encodeURIComponent(search)}&limit=8`,
          {
            headers: { Authorization: `Bearer ${token}` },
          }
        );

        if (response.ok) {
          const data = await response.json();
          setResults(data.data || data.products || []);
          setIsOpen(true);
        }
      } catch (err) {
        console.error('Search failed:', err);
      } finally {
        setLoading(false);
      }
    }, 300);

    return () => clearTimeout(timer);
  }, [search]);

  const handleSelect = (product) => {
    onSelect({
      productId: product.product_id || product.id,
      name: product.name,
      sku: product.sku,
      price: parseFloat(product.price),
      quantity: 1,
    });
    setSearch('');
    setIsOpen(false);
  };

  return (
    <div className="relative">
      <div className="relative">
        <MagnifyingGlassIcon className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
        <input
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          onFocus={() => results.length > 0 && setIsOpen(true)}
          placeholder={placeholder}
          className="w-full pl-10 pr-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
        />
        {loading && (
          <div className="absolute right-3 top-1/2 -translate-y-1/2">
            <div className="animate-spin h-5 w-5 border-2 border-blue-500 border-t-transparent rounded-full" />
          </div>
        )}
      </div>

      {isOpen && results.length > 0 && (
        <div className="absolute z-10 mt-1 w-full bg-white border border-gray-200 rounded-lg shadow-lg max-h-64 overflow-y-auto">
          {results.map((product) => (
            <button
              key={product.product_id || product.id}
              type="button"
              onClick={() => handleSelect(product)}
              className="w-full px-4 py-3 text-left hover:bg-blue-50 border-b border-gray-100 last:border-0"
            >
              <p className="font-medium text-gray-900">{product.name}</p>
              <p className="text-sm text-gray-500">
                {product.sku} - ${parseFloat(product.price).toFixed(2)}
              </p>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

/**
 * Cart item display
 */
function CartItem({ item, onRemove }) {
  return (
    <div className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
      <div className="flex-1">
        <p className="font-medium text-gray-900">{item.name}</p>
        <p className="text-sm text-gray-500">
          {item.sku} - ${item.price.toFixed(2)}
        </p>
      </div>
      <button
        onClick={onRemove}
        className="p-1 text-gray-400 hover:text-red-600"
      >
        <XMarkIcon className="w-5 h-5" />
      </button>
    </div>
  );
}

/**
 * Recommendation result card
 */
function RecommendationCard({ rec, index }) {
  return (
    <div className="border border-gray-200 rounded-lg p-4 hover:shadow-md transition-shadow">
      <div className="flex items-start justify-between">
        <div className="flex-1">
          <div className="flex items-center gap-2">
            <span className="text-xs font-bold text-gray-400">#{index + 1}</span>
            <h4 className="font-medium text-gray-900">{rec.name}</h4>
          </div>
          <p className="text-sm text-gray-500 mt-1">
            {rec.sku} - ${rec.price?.toFixed(2)}
          </p>
        </div>
        <div className="text-right">
          <div className="text-lg font-bold text-blue-600">
            {Math.round(rec.relevanceScore * 100)}%
          </div>
          <div className="text-xs text-gray-500">score</div>
        </div>
      </div>

      <div className="mt-3 flex items-center gap-2">
        <span className="text-xs px-2 py-1 bg-blue-100 text-blue-800 rounded">
          {rec.reason}
        </span>
        {rec.source && (
          <span className="text-xs px-2 py-1 bg-gray-100 text-gray-600 rounded">
            {rec.source}
          </span>
        )}
        {rec.category && (
          <span className="text-xs px-2 py-1 bg-purple-100 text-purple-700 rounded">
            {rec.category}
          </span>
        )}
      </div>

      {rec.relationshipType && (
        <div className="mt-2 text-xs text-gray-500">
          Type: {rec.relationshipType} | Curated: {rec.isCurated ? 'Yes' : 'No'}
        </div>
      )}
    </div>
  );
}

/**
 * Debug info panel
 */
function DebugInfo({ data, type }) {
  const [expanded, setExpanded] = useState(false);

  if (!data) return null;

  return (
    <div className="mt-4 border border-gray-200 rounded-lg overflow-hidden">
      <button
        onClick={() => setExpanded(!expanded)}
        className="w-full px-4 py-3 bg-gray-50 flex items-center justify-between hover:bg-gray-100"
      >
        <div className="flex items-center gap-2">
          <InformationCircleIcon className="w-5 h-5 text-gray-400" />
          <span className="font-medium text-gray-700">Debug Information</span>
        </div>
        <span className="text-sm text-gray-500">
          {expanded ? 'Hide' : 'Show'}
        </span>
      </button>

      {expanded && (
        <div className="p-4 bg-gray-900 text-gray-100">
          <pre className="text-xs overflow-x-auto whitespace-pre-wrap">
            {JSON.stringify(data, null, 2)}
          </pre>
        </div>
      )}
    </div>
  );
}

/**
 * Main recommendation tester
 */
export default function RecommendationTester() {
  const [mode, setMode] = useState('product'); // 'product' or 'cart'
  const [selectedProduct, setSelectedProduct] = useState(null);
  const [cartItems, setCartItems] = useState([]);
  const [recommendations, setRecommendations] = useState([]);
  const [crossSell, setCrossSell] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [debugData, setDebugData] = useState(null);
  const [testResults, setTestResults] = useState(null);

  // Test product recommendations
  const testProductRecommendations = async () => {
    if (!selectedProduct) return;

    setLoading(true);
    setError(null);
    setTestResults(null);

    try {
      const token = localStorage.getItem('auth_token');

      // Get product recommendations
      const recResponse = await authFetch(
        `${API_BASE}/api/recommendations/product/${selectedProduct.productId}?limit=10`,
        {
          headers: { Authorization: `Bearer ${token}` },
        }
      );

      const recData = await recResponse.json();

      // Get cross-sell suggestions
      const crossResponse = await authFetch(
        `${API_BASE}/api/recommendations/cross-sell/${selectedProduct.productId}?limit=5&includeMargin=true`,
        {
          headers: { Authorization: `Bearer ${token}` },
        }
      );

      const crossData = await crossResponse.json();

      if (recData.success) {
        setRecommendations(recData.data.recommendations || []);
        setDebugData({
          source: recData.data.source,
          generatedAt: recData.data.generatedAt,
        });
      } else {
        setError(recData.error);
      }

      if (crossData.success) {
        setCrossSell(crossData.data.suggestions || []);
      }

      // Analyze results
      setTestResults({
        productRecCount: recData.data?.recommendations?.length || 0,
        crossSellCount: crossData.data?.suggestions?.length || 0,
        hasAccessories:
          recData.data?.recommendations?.some(
            (r) => r.relationshipType === 'accessory'
          ) || false,
        hasBoughtTogether:
          recData.data?.recommendations?.some(
            (r) => r.relationshipType === 'bought_together'
          ) || false,
        avgScore:
          recData.data?.recommendations?.length > 0
            ? (
                recData.data.recommendations.reduce(
                  (sum, r) => sum + r.relevanceScore,
                  0
                ) / recData.data.recommendations.length
              ).toFixed(2)
            : 0,
      });
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  // Test cart recommendations
  const testCartRecommendations = async () => {
    if (cartItems.length === 0) return;

    setLoading(true);
    setError(null);
    setTestResults(null);

    try {
      const token = localStorage.getItem('auth_token');

      const response = await authFetch(`${API_BASE}/api/recommendations/cart`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          items: cartItems.map((item) => ({
            productId: item.productId,
            quantity: item.quantity,
            price: item.price,
          })),
          limit: 10,
        }),
      });

      const data = await response.json();

      if (data.success) {
        setRecommendations(data.data.recommendations || []);
        setDebugData({
          cartAnalysis: data.data.cartAnalysis,
          generatedAt: data.data.generatedAt,
        });

        setTestResults({
          productRecCount: data.data.recommendations?.length || 0,
          cartTotal: data.data.cartAnalysis?.cartTotal || 0,
          cartItemCount: data.data.cartAnalysis?.itemCount || 0,
          avgScore:
            data.data.recommendations?.length > 0
              ? (
                  data.data.recommendations.reduce(
                    (sum, r) => sum + r.relevanceScore,
                    0
                  ) / data.data.recommendations.length
                ).toFixed(2)
              : 0,
        });
      } else {
        setError(data.error);
      }
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  // Add to cart
  const handleAddToCart = (product) => {
    if (cartItems.some((item) => item.productId === product.productId)) {
      return; // Already in cart
    }
    setCartItems((prev) => [...prev, product]);
  };

  // Remove from cart
  const handleRemoveFromCart = (productId) => {
    setCartItems((prev) => prev.filter((item) => item.productId !== productId));
  };

  // Clear results
  const clearResults = () => {
    setRecommendations([]);
    setCrossSell([]);
    setDebugData(null);
    setTestResults(null);
    setError(null);
  };

  return (
    <div className="space-y-6">
      {/* Mode Selection */}
      <div className="bg-white rounded-lg shadow p-6">
        <h2 className="text-lg font-semibold text-gray-900 mb-4">
          Test Recommendations
        </h2>

        <div className="flex gap-4 mb-6">
          <button
            onClick={() => {
              setMode('product');
              clearResults();
            }}
            className={`flex-1 flex items-center justify-center gap-2 p-4 rounded-lg border-2 transition-colors ${
              mode === 'product'
                ? 'border-blue-500 bg-blue-50 text-blue-700'
                : 'border-gray-200 hover:border-gray-300 text-gray-600'
            }`}
          >
            <MagnifyingGlassIcon className="w-5 h-5" />
            <span className="font-medium">Single Product</span>
          </button>
          <button
            onClick={() => {
              setMode('cart');
              clearResults();
            }}
            className={`flex-1 flex items-center justify-center gap-2 p-4 rounded-lg border-2 transition-colors ${
              mode === 'cart'
                ? 'border-blue-500 bg-blue-50 text-blue-700'
                : 'border-gray-200 hover:border-gray-300 text-gray-600'
            }`}
          >
            <ShoppingCartIcon className="w-5 h-5" />
            <span className="font-medium">Simulate Cart</span>
          </button>
        </div>

        {/* Product Mode */}
        {mode === 'product' && (
          <div className="space-y-4">
            <ProductSearchInput
              onSelect={(product) => {
                setSelectedProduct(product);
                clearResults();
              }}
              placeholder="Search for a product to test..."
            />

            {selectedProduct && (
              <div className="flex items-center justify-between p-4 bg-blue-50 rounded-lg">
                <div>
                  <p className="font-medium text-blue-900">
                    {selectedProduct.name}
                  </p>
                  <p className="text-sm text-blue-700">
                    {selectedProduct.sku} - ${selectedProduct.price.toFixed(2)}
                  </p>
                </div>
                <button
                  onClick={() => {
                    setSelectedProduct(null);
                    clearResults();
                  }}
                  className="p-1 text-blue-400 hover:text-blue-600"
                >
                  <XMarkIcon className="w-5 h-5" />
                </button>
              </div>
            )}

            <button
              onClick={testProductRecommendations}
              disabled={!selectedProduct || loading}
              className="w-full flex items-center justify-center gap-2 px-4 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {loading ? (
                <>
                  <ArrowPathIcon className="w-5 h-5 animate-spin" />
                  Testing...
                </>
              ) : (
                <>
                  <BeakerIcon className="w-5 h-5" />
                  Test Recommendations
                </>
              )}
            </button>
          </div>
        )}

        {/* Cart Mode */}
        {mode === 'cart' && (
          <div className="space-y-4">
            <ProductSearchInput
              onSelect={handleAddToCart}
              placeholder="Add products to simulated cart..."
            />

            {cartItems.length > 0 && (
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <p className="text-sm font-medium text-gray-700">
                    Cart Items ({cartItems.length})
                  </p>
                  <button
                    onClick={() => {
                      setCartItems([]);
                      clearResults();
                    }}
                    className="text-sm text-red-600 hover:underline"
                  >
                    Clear All
                  </button>
                </div>
                {cartItems.map((item) => (
                  <CartItem
                    key={item.productId}
                    item={item}
                    onRemove={() => handleRemoveFromCart(item.productId)}
                  />
                ))}
                <div className="text-right text-sm font-medium text-gray-700">
                  Total: $
                  {cartItems
                    .reduce((sum, item) => sum + item.price, 0)
                    .toFixed(2)}
                </div>
              </div>
            )}

            <button
              onClick={testCartRecommendations}
              disabled={cartItems.length === 0 || loading}
              className="w-full flex items-center justify-center gap-2 px-4 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {loading ? (
                <>
                  <ArrowPathIcon className="w-5 h-5 animate-spin" />
                  Testing...
                </>
              ) : (
                <>
                  <BeakerIcon className="w-5 h-5" />
                  Test Cart Recommendations
                </>
              )}
            </button>
          </div>
        )}
      </div>

      {/* Error */}
      {error && (
        <div className="bg-red-50 border border-red-200 rounded-lg p-4 flex items-start gap-3">
          <ExclamationTriangleIcon className="w-5 h-5 text-red-500 flex-shrink-0 mt-0.5" />
          <div>
            <p className="font-medium text-red-800">Test Failed</p>
            <p className="text-sm text-red-600">{error}</p>
          </div>
        </div>
      )}

      {/* Test Results Summary */}
      {testResults && (
        <div className="bg-white rounded-lg shadow p-6">
          <div className="flex items-center gap-2 mb-4">
            <CheckCircleIcon className="w-5 h-5 text-green-500" />
            <h3 className="font-semibold text-gray-900">Test Results</h3>
          </div>

          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <div className="p-3 bg-blue-50 rounded-lg text-center">
              <p className="text-2xl font-bold text-blue-700">
                {testResults.productRecCount}
              </p>
              <p className="text-xs text-blue-600">Recommendations</p>
            </div>
            {mode === 'product' && (
              <div className="p-3 bg-green-50 rounded-lg text-center">
                <p className="text-2xl font-bold text-green-700">
                  {testResults.crossSellCount}
                </p>
                <p className="text-xs text-green-600">Cross-Sell Items</p>
              </div>
            )}
            <div className="p-3 bg-purple-50 rounded-lg text-center">
              <p className="text-2xl font-bold text-purple-700">
                {testResults.avgScore}
              </p>
              <p className="text-xs text-purple-600">Avg Score</p>
            </div>
            {mode === 'product' && (
              <div className="p-3 bg-orange-50 rounded-lg text-center">
                <div className="flex justify-center gap-2">
                  {testResults.hasAccessories && (
                    <span className="text-xs bg-orange-200 text-orange-800 px-2 py-0.5 rounded">
                      Accessories
                    </span>
                  )}
                  {testResults.hasBoughtTogether && (
                    <span className="text-xs bg-orange-200 text-orange-800 px-2 py-0.5 rounded">
                      Bought Together
                    </span>
                  )}
                </div>
                <p className="text-xs text-orange-600 mt-1">Types Found</p>
              </div>
            )}
            {mode === 'cart' && (
              <div className="p-3 bg-orange-50 rounded-lg text-center">
                <p className="text-2xl font-bold text-orange-700">
                  ${testResults.cartTotal?.toFixed(2)}
                </p>
                <p className="text-xs text-orange-600">Cart Total</p>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Product Recommendations */}
      {recommendations.length > 0 && (
        <div className="bg-white rounded-lg shadow p-6">
          <h3 className="font-semibold text-gray-900 mb-4">
            Product Recommendations ({recommendations.length})
          </h3>
          <div className="grid md:grid-cols-2 gap-4">
            {recommendations.map((rec, index) => (
              <RecommendationCard key={rec.productId} rec={rec} index={index} />
            ))}
          </div>
        </div>
      )}

      {/* Cross-Sell Suggestions */}
      {crossSell.length > 0 && (
        <div className="bg-white rounded-lg shadow p-6">
          <h3 className="font-semibold text-gray-900 mb-4">
            Cross-Sell Suggestions ({crossSell.length})
          </h3>
          <div className="grid md:grid-cols-3 gap-4">
            {crossSell.map((item, index) => (
              <div
                key={item.productId}
                className="border border-green-200 bg-green-50 rounded-lg p-4"
              >
                <div className="flex items-start justify-between mb-2">
                  <span className="text-xs font-bold text-green-600">
                    #{index + 1}
                  </span>
                  {item.marginPercent && (
                    <span className="text-xs bg-green-200 text-green-800 px-2 py-0.5 rounded">
                      {item.marginPercent}% margin
                    </span>
                  )}
                </div>
                <h4 className="font-medium text-gray-900">{item.name}</h4>
                <p className="text-sm text-gray-500 mt-1">
                  ${item.price?.toFixed(2)}
                  {item.priceAsPercentOfMain && (
                    <span className="text-xs text-gray-400 ml-1">
                      ({item.priceAsPercentOfMain}% of main)
                    </span>
                  )}
                </p>
                <p className="text-xs text-green-700 mt-2">{item.reason}</p>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* No Results */}
      {testResults && recommendations.length === 0 && (
        <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-6 text-center">
          <ExclamationTriangleIcon className="w-8 h-8 text-yellow-500 mx-auto mb-2" />
          <p className="font-medium text-yellow-800">No Recommendations Found</p>
          <p className="text-sm text-yellow-600 mt-1">
            This product has no active relationships or matching rules.
            <br />
            Try adding curated relationships or category rules.
          </p>
        </div>
      )}

      {/* Debug Data */}
      <DebugInfo data={debugData} />
    </div>
  );
}
