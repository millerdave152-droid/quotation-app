/**
 * Customer Insights Component
 * Shows customer purchase history and top customers
 */

import React, { useState, useEffect } from 'react';
import { getCustomerPurchaseHistory, getAOVComparison } from '../../api/reports';
import {
  UserIcon,
  BuildingStorefrontIcon,
  ArrowTrendingUpIcon,
} from '@heroicons/react/24/outline';

const CustomerInsights = ({ dateRange = {} }) => {
  const [customers, setCustomers] = useState([]);
  const [aovData, setAovData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [sortBy, setSortBy] = useState('total_revenue');

  useEffect(() => {
    const fetchData = async () => {
      setLoading(true);
      try {
        const [customersRes, aovRes] = await Promise.all([
          getCustomerPurchaseHistory({ limit: 10, sortBy, sortOrder: 'DESC' }),
          getAOVComparison(dateRange),
        ]);

        if (customersRes.success) setCustomers(customersRes.data || []);
        if (aovRes.success) setAovData(aovRes.data);
      } catch (error) {
        console.error('Failed to fetch customer data:', error);
      }
      setLoading(false);
    };

    fetchData();
  }, [dateRange, sortBy]);

  const formatCurrency = (val) => {
    if (val >= 1000000) return `$${(val / 1000000).toFixed(1)}M`;
    if (val >= 1000) return `$${(val / 1000).toFixed(1)}K`;
    return `$${parseFloat(val).toFixed(2)}`;
  };

  const formatDate = (dateStr) => {
    if (!dateStr) return '-';
    return new Date(dateStr).toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
    });
  };

  // Extract AOV by source and customer type
  const getAOV = (source, customerType) => {
    if (!aovData?.comparison) return 0;
    const match = aovData.comparison.find(
      r => r.source === source && r.customer_type === customerType
    );
    return parseFloat(match?.avg_order_value) || 0;
  };

  if (loading) {
    return (
      <div className="bg-white rounded-xl p-6 shadow-sm border border-gray-100">
        <div className="animate-pulse">
          <div className="h-6 bg-gray-200 rounded w-40 mb-4" />
          <div className="space-y-3">
            {[...Array(5)].map((_, i) => (
              <div key={i} className="h-12 bg-gray-100 rounded" />
            ))}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="bg-white rounded-xl p-6 shadow-sm border border-gray-100">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h2 className="text-lg font-semibold text-gray-900">Customer Insights</h2>
          <p className="text-sm text-gray-500">Top customers by revenue</p>
        </div>

        {/* Sort selector */}
        <select
          value={sortBy}
          onChange={(e) => setSortBy(e.target.value)}
          className="text-sm border border-gray-200 rounded-lg px-3 py-1.5 bg-white focus:outline-none focus:ring-2 focus:ring-blue-500"
        >
          <option value="total_revenue">By Revenue</option>
          <option value="total_transactions">By Orders</option>
          <option value="last_purchase_date">By Recent</option>
        </select>
      </div>

      {/* AOV Comparison Cards */}
      <div className="grid grid-cols-3 gap-4 mb-6">
        <div className="p-4 bg-blue-50 rounded-lg">
          <div className="flex items-center gap-2 mb-2">
            <UserIcon className="w-4 h-4 text-blue-600" />
            <span className="text-xs text-blue-600 font-medium uppercase">Quote AOV</span>
          </div>
          <p className="text-xl font-bold text-blue-700">
            {formatCurrency(getAOV('quote', 'account'))}
          </p>
          <p className="text-xs text-blue-500">Account customers</p>
        </div>

        <div className="p-4 bg-green-50 rounded-lg">
          <div className="flex items-center gap-2 mb-2">
            <BuildingStorefrontIcon className="w-4 h-4 text-green-600" />
            <span className="text-xs text-green-600 font-medium uppercase">POS AOV (Account)</span>
          </div>
          <p className="text-xl font-bold text-green-700">
            {formatCurrency(getAOV('pos', 'account'))}
          </p>
          <p className="text-xs text-green-500">Account customers</p>
        </div>

        <div className="p-4 bg-gray-50 rounded-lg">
          <div className="flex items-center gap-2 mb-2">
            <ArrowTrendingUpIcon className="w-4 h-4 text-gray-600" />
            <span className="text-xs text-gray-600 font-medium uppercase">POS AOV (Walk-in)</span>
          </div>
          <p className="text-xl font-bold text-gray-700">
            {formatCurrency(getAOV('pos', 'walk-in'))}
          </p>
          <p className="text-xs text-gray-500">Walk-in customers</p>
        </div>
      </div>

      {/* Top Customers Table */}
      <div className="overflow-hidden">
        {/* Header */}
        <div className="grid grid-cols-12 gap-2 text-xs font-medium text-gray-500 uppercase tracking-wide px-3 mb-2">
          <div className="col-span-4">Customer</div>
          <div className="col-span-2 text-center">Quotes</div>
          <div className="col-span-2 text-center">POS</div>
          <div className="col-span-2 text-right">Revenue</div>
          <div className="col-span-2 text-right">Last Order</div>
        </div>

        {/* Rows */}
        <div className="space-y-2">
          {customers.length === 0 ? (
            <div className="text-center py-8 text-gray-500">No customer data available</div>
          ) : (
            customers.map((customer, i) => {
              const totalRevenue = parseFloat(customer.total_revenue) || 0;
              const quoteRevenue = parseFloat(customer.quote_revenue) || 0;
              const posRevenue = parseFloat(customer.pos_revenue) || 0;

              return (
                <div
                  key={customer.customer_id || i}
                  className="grid grid-cols-12 gap-2 items-center p-3 bg-gray-50 rounded-lg hover:bg-gray-100 transition"
                >
                  <div className="col-span-4">
                    <p className="font-medium text-gray-900 truncate">
                      {customer.customer_name}
                    </p>
                    {customer.company_name && (
                      <p className="text-xs text-gray-500 truncate">{customer.company_name}</p>
                    )}
                  </div>
                  <div className="col-span-2 text-center">
                    <div className="flex flex-col items-center">
                      <span className="text-sm font-medium text-blue-600">
                        {customer.total_quotes_converted || 0}
                      </span>
                      <span className="text-xs text-gray-400">
                        {formatCurrency(quoteRevenue)}
                      </span>
                    </div>
                  </div>
                  <div className="col-span-2 text-center">
                    <div className="flex flex-col items-center">
                      <span className="text-sm font-medium text-green-600">
                        {customer.total_pos_transactions || 0}
                      </span>
                      <span className="text-xs text-gray-400">
                        {formatCurrency(posRevenue)}
                      </span>
                    </div>
                  </div>
                  <div className="col-span-2 text-right">
                    <span className="text-sm font-semibold text-gray-900">
                      {formatCurrency(totalRevenue)}
                    </span>
                  </div>
                  <div className="col-span-2 text-right">
                    <span className="text-xs text-gray-500">
                      {formatDate(customer.last_purchase_date)}
                    </span>
                  </div>
                </div>
              );
            })
          )}
        </div>
      </div>
    </div>
  );
};

export default CustomerInsights;
