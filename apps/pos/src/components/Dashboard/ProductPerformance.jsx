/**
 * Product Performance Component
 * Shows top products across Quote + POS channels
 */

import React, { useState, useEffect } from 'react';
import { getProductPerformance, getCategoryPerformance } from '../../api/reports';
import { ChartBarIcon, TagIcon } from '@heroicons/react/24/outline';

const ProductPerformance = ({ dateRange = {} }) => {
  const [products, setProducts] = useState([]);
  const [categories, setCategories] = useState([]);
  const [loading, setLoading] = useState(true);
  const [viewMode, setViewMode] = useState('products'); // 'products' or 'categories'

  useEffect(() => {
    const fetchData = async () => {
      setLoading(true);
      try {
        const [productsRes, categoriesRes] = await Promise.all([
          getProductPerformance({ ...dateRange, limit: 10 }),
          getCategoryPerformance(dateRange),
        ]);

        if (productsRes.success) setProducts(productsRes.data || []);
        if (categoriesRes.success) setCategories(categoriesRes.data || []);
      } catch (error) {
        console.error('Failed to fetch product data:', error);
      }
      setLoading(false);
    };

    fetchData();
  }, [dateRange]);

  const formatCurrency = (val) => {
    if (val >= 1000000) return `$${(val / 1000000).toFixed(1)}M`;
    if (val >= 1000) return `$${(val / 1000).toFixed(1)}K`;
    return `$${parseFloat(val).toFixed(2)}`;
  };

  if (loading) {
    return (
      <div className="bg-white rounded-xl p-6 shadow-sm border border-gray-100">
        <div className="animate-pulse">
          <div className="h-6 bg-gray-200 rounded w-48 mb-4" />
          <div className="space-y-3">
            {[...Array(5)].map((_, i) => (
              <div key={i} className="h-12 bg-gray-100 rounded" />
            ))}
          </div>
        </div>
      </div>
    );
  }

  // Find max revenue for bar width calculation
  const maxProductRevenue = Math.max(...products.map(p => parseFloat(p.total_revenue) || 0), 1);
  const maxCategoryRevenue = Math.max(...categories.map(c => parseFloat(c.total_revenue) || 0), 1);

  return (
    <div className="bg-white rounded-xl p-6 shadow-sm border border-gray-100">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h2 className="text-lg font-semibold text-gray-900">Product Performance</h2>
          <p className="text-sm text-gray-500">Top sellers across all channels</p>
        </div>

        {/* View toggle */}
        <div className="flex bg-gray-100 rounded-lg p-1">
          <button
            onClick={() => setViewMode('products')}
            className={`flex items-center gap-1.5 px-3 py-1 text-sm rounded-md transition ${
              viewMode === 'products'
                ? 'bg-white text-gray-900 shadow-sm'
                : 'text-gray-600 hover:text-gray-900'
            }`}
          >
            <ChartBarIcon className="w-4 h-4" />
            Products
          </button>
          <button
            onClick={() => setViewMode('categories')}
            className={`flex items-center gap-1.5 px-3 py-1 text-sm rounded-md transition ${
              viewMode === 'categories'
                ? 'bg-white text-gray-900 shadow-sm'
                : 'text-gray-600 hover:text-gray-900'
            }`}
          >
            <TagIcon className="w-4 h-4" />
            Categories
          </button>
        </div>
      </div>

      {viewMode === 'products' ? (
        // Products view
        <div className="space-y-3">
          {/* Header row */}
          <div className="grid grid-cols-12 gap-2 text-xs font-medium text-gray-500 uppercase tracking-wide px-3">
            <div className="col-span-5">Product</div>
            <div className="col-span-2 text-center">Quote</div>
            <div className="col-span-2 text-center">POS</div>
            <div className="col-span-3 text-right">Revenue</div>
          </div>

          {products.length === 0 ? (
            <div className="text-center py-8 text-gray-500">No product data available</div>
          ) : (
            products.map((product, i) => {
              const revenue = parseFloat(product.total_revenue) || 0;
              const barWidth = (revenue / maxProductRevenue) * 100;

              return (
                <div
                  key={i}
                  className="grid grid-cols-12 gap-2 items-center p-3 bg-gray-50 rounded-lg hover:bg-gray-100 transition"
                >
                  <div className="col-span-5">
                    <p className="font-medium text-gray-900 truncate">{product.product_name}</p>
                    <p className="text-xs text-gray-500">{product.sku}</p>
                  </div>
                  <div className="col-span-2 text-center">
                    <span className="inline-flex items-center justify-center px-2 py-0.5 rounded-full bg-blue-100 text-blue-700 text-xs font-medium">
                      {parseInt(product.quote_units) || 0}
                    </span>
                  </div>
                  <div className="col-span-2 text-center">
                    <span className="inline-flex items-center justify-center px-2 py-0.5 rounded-full bg-green-100 text-green-700 text-xs font-medium">
                      {parseInt(product.pos_units) || 0}
                    </span>
                  </div>
                  <div className="col-span-3">
                    <div className="flex items-center gap-2">
                      <div className="flex-1 h-2 bg-gray-200 rounded-full overflow-hidden">
                        <div
                          className="h-full bg-blue-500 rounded-full"
                          style={{ width: `${barWidth}%` }}
                        />
                      </div>
                      <span className="text-sm font-medium text-gray-900 w-16 text-right">
                        {formatCurrency(revenue)}
                      </span>
                    </div>
                  </div>
                </div>
              );
            })
          )}
        </div>
      ) : (
        // Categories view
        <div className="space-y-3">
          {/* Header row */}
          <div className="grid grid-cols-12 gap-2 text-xs font-medium text-gray-500 uppercase tracking-wide px-3">
            <div className="col-span-4">Category</div>
            <div className="col-span-2 text-center">Products</div>
            <div className="col-span-2 text-center">Units</div>
            <div className="col-span-4 text-right">Revenue</div>
          </div>

          {categories.length === 0 ? (
            <div className="text-center py-8 text-gray-500">No category data available</div>
          ) : (
            categories.map((category, i) => {
              const revenue = parseFloat(category.total_revenue) || 0;
              const barWidth = (revenue / maxCategoryRevenue) * 100;
              const quoteRevenue = parseFloat(category.quote_revenue) || 0;
              const posRevenue = parseFloat(category.pos_revenue) || 0;
              const quotePercent = revenue > 0 ? (quoteRevenue / revenue) * 100 : 0;

              return (
                <div
                  key={i}
                  className="grid grid-cols-12 gap-2 items-center p-3 bg-gray-50 rounded-lg hover:bg-gray-100 transition"
                >
                  <div className="col-span-4">
                    <p className="font-medium text-gray-900">{category.category}</p>
                  </div>
                  <div className="col-span-2 text-center text-sm text-gray-600">
                    {parseInt(category.unique_products) || 0}
                  </div>
                  <div className="col-span-2 text-center text-sm text-gray-600">
                    {parseInt(category.total_units) || 0}
                  </div>
                  <div className="col-span-4">
                    <div className="flex items-center gap-2">
                      <div className="flex-1 h-2 bg-gray-200 rounded-full overflow-hidden flex">
                        <div
                          className="h-full bg-blue-500"
                          style={{ width: `${quotePercent}%` }}
                          title={`Quote: ${formatCurrency(quoteRevenue)}`}
                        />
                        <div
                          className="h-full bg-green-500"
                          style={{ width: `${100 - quotePercent}%` }}
                          title={`POS: ${formatCurrency(posRevenue)}`}
                        />
                      </div>
                      <span className="text-sm font-medium text-gray-900 w-16 text-right">
                        {formatCurrency(revenue)}
                      </span>
                    </div>
                  </div>
                </div>
              );
            })
          )}
        </div>
      )}

      {/* Legend */}
      <div className="flex items-center justify-center gap-6 mt-4 pt-4 border-t border-gray-100">
        <div className="flex items-center gap-2">
          <span className="w-3 h-3 rounded-full bg-blue-500" />
          <span className="text-sm text-gray-600">Quote Sales</span>
        </div>
        <div className="flex items-center gap-2">
          <span className="w-3 h-3 rounded-full bg-green-500" />
          <span className="text-sm text-gray-600">POS Sales</span>
        </div>
      </div>
    </div>
  );
};

export default ProductPerformance;
