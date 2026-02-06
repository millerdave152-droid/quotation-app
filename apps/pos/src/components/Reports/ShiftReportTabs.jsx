/**
 * TeleTime POS - Shift Report Tabs
 * Detailed breakdown tabs with charts and tables
 */

import { useState } from 'react';
import {
  BarChart,
  Bar,
  PieChart,
  Pie,
  Cell,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
  LineChart,
  Line,
} from 'recharts';
import {
  ChartBarIcon,
  CreditCardIcon,
  UsersIcon,
  ShieldCheckIcon,
  ClockIcon,
} from '@heroicons/react/24/outline';

/**
 * Format currency
 */
function formatCurrency(value) {
  return new Intl.NumberFormat('en-CA', {
    style: 'currency',
    currency: 'CAD',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(value || 0);
}

/**
 * Tab button component
 */
function TabButton({ active, onClick, icon: Icon, label }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`
        flex items-center gap-2 px-4 py-2 text-sm font-medium rounded-lg
        transition-colors
        ${active
          ? 'bg-blue-100 text-blue-700'
          : 'text-gray-600 hover:bg-gray-100'
        }
      `}
    >
      <Icon className="w-4 h-4" />
      {label}
    </button>
  );
}

// ============================================================================
// SALES TAB
// ============================================================================

const CHART_COLORS = ['#3B82F6', '#10B981', '#8B5CF6', '#F59E0B', '#EF4444', '#EC4899', '#06B6D4', '#84CC16'];

function SalesTab({ hourlyData, productData }) {
  // Format hourly data for chart
  const hourlyChartData = Object.entries(hourlyData?.byHour || {}).map(([hour, data]) => ({
    hour: formatHour(parseInt(hour, 10)),
    revenue: data.revenue,
    transactions: data.transactions,
  })).filter(d => d.revenue > 0 || d.transactions > 0);

  // Category data for pie chart
  const categoryData = (productData?.byCategory || []).slice(0, 8).map((cat, index) => ({
    name: cat.categoryName,
    value: cat.revenue,
    fill: CHART_COLORS[index % CHART_COLORS.length],
  }));

  return (
    <div className="space-y-6">
      {/* Hourly Sales Chart */}
      <div className="bg-white rounded-xl border border-gray-200 p-4">
        <h4 className="text-sm font-semibold text-gray-900 mb-4 flex items-center gap-2">
          <ClockIcon className="w-4 h-4" />
          Hourly Sales
        </h4>
        {hourlyChartData.length > 0 ? (
          <ResponsiveContainer width="100%" height={250}>
            <BarChart data={hourlyChartData}>
              <CartesianGrid strokeDasharray="3 3" stroke="#E5E7EB" />
              <XAxis dataKey="hour" tick={{ fontSize: 12 }} />
              <YAxis tick={{ fontSize: 12 }} tickFormatter={(v) => `$${v}`} />
              <Tooltip
                formatter={(value, name) => [
                  name === 'revenue' ? formatCurrency(value) : value,
                  name === 'revenue' ? 'Revenue' : 'Transactions'
                ]}
              />
              <Bar dataKey="revenue" fill="#3B82F6" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        ) : (
          <div className="h-[250px] flex items-center justify-center text-gray-500">
            No hourly data available
          </div>
        )}
      </div>

      {/* Category Breakdown */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Pie Chart */}
        <div className="bg-white rounded-xl border border-gray-200 p-4">
          <h4 className="text-sm font-semibold text-gray-900 mb-4">Sales by Category</h4>
          {categoryData.length > 0 ? (
            <ResponsiveContainer width="100%" height={250}>
              <PieChart>
                <Pie
                  data={categoryData}
                  dataKey="value"
                  nameKey="name"
                  cx="50%"
                  cy="50%"
                  outerRadius={80}
                  label={({ name, percent }) => `${name} (${(percent * 100).toFixed(0)}%)`}
                  labelLine={false}
                >
                  {categoryData.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={entry.fill} />
                  ))}
                </Pie>
                <Tooltip formatter={(value) => formatCurrency(value)} />
              </PieChart>
            </ResponsiveContainer>
          ) : (
            <div className="h-[250px] flex items-center justify-center text-gray-500">
              No category data available
            </div>
          )}
        </div>

        {/* Top Products Table */}
        <div className="bg-white rounded-xl border border-gray-200 p-4">
          <h4 className="text-sm font-semibold text-gray-900 mb-4">Top Products</h4>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-gray-500 border-b">
                  <th className="pb-2 font-medium">Product</th>
                  <th className="pb-2 font-medium text-right">Units</th>
                  <th className="pb-2 font-medium text-right">Revenue</th>
                </tr>
              </thead>
              <tbody>
                {(productData?.topProducts || []).slice(0, 5).map((product, index) => (
                  <tr key={index} className="border-b border-gray-100 last:border-0">
                    <td className="py-2 pr-2">
                      <p className="font-medium text-gray-900 truncate max-w-[200px]">
                        {product.productName}
                      </p>
                      <p className="text-xs text-gray-500">{product.sku}</p>
                    </td>
                    <td className="py-2 text-right text-gray-700">{product.unitsSold}</td>
                    <td className="py-2 text-right font-medium text-gray-900">
                      {formatCurrency(product.revenue)}
                    </td>
                  </tr>
                ))}
                {(!productData?.topProducts || productData.topProducts.length === 0) && (
                  <tr>
                    <td colSpan={3} className="py-4 text-center text-gray-500">
                      No product data available
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
}

// ============================================================================
// PAYMENTS TAB
// ============================================================================

function PaymentsTab({ paymentData }) {
  const { byMethod = {}, totals = {}, cashDrawer = {} } = paymentData || {};

  // Format for pie chart
  const paymentChartData = Object.entries(byMethod).map(([method, data], index) => ({
    name: formatPaymentMethod(method),
    value: data.amount,
    count: data.count,
    fill: CHART_COLORS[index % CHART_COLORS.length],
  }));

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Payment Pie Chart */}
        <div className="bg-white rounded-xl border border-gray-200 p-4">
          <h4 className="text-sm font-semibold text-gray-900 mb-4">Payment Methods</h4>
          {paymentChartData.length > 0 ? (
            <ResponsiveContainer width="100%" height={250}>
              <PieChart>
                <Pie
                  data={paymentChartData}
                  dataKey="value"
                  nameKey="name"
                  cx="50%"
                  cy="50%"
                  outerRadius={80}
                  innerRadius={40}
                  label={({ name, percent }) => `${name} (${(percent * 100).toFixed(0)}%)`}
                >
                  {paymentChartData.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={entry.fill} />
                  ))}
                </Pie>
                <Tooltip formatter={(value) => formatCurrency(value)} />
              </PieChart>
            </ResponsiveContainer>
          ) : (
            <div className="h-[250px] flex items-center justify-center text-gray-500">
              No payment data available
            </div>
          )}
        </div>

        {/* Payment Breakdown Table */}
        <div className="bg-white rounded-xl border border-gray-200 p-4">
          <h4 className="text-sm font-semibold text-gray-900 mb-4">Payment Breakdown</h4>
          <div className="space-y-3">
            {Object.entries(byMethod).map(([method, data]) => (
              <div key={method} className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
                <div>
                  <p className="font-medium text-gray-900">{formatPaymentMethod(method)}</p>
                  <p className="text-xs text-gray-500">{data.count} transactions</p>
                </div>
                <p className="text-lg font-bold text-gray-900">{formatCurrency(data.amount)}</p>
              </div>
            ))}
            {Object.keys(byMethod).length === 0 && (
              <p className="text-center text-gray-500 py-4">No payments recorded</p>
            )}
          </div>

          {/* Cash Drawer Summary */}
          <div className="mt-4 pt-4 border-t border-gray-200">
            <h5 className="text-sm font-medium text-gray-700 mb-2">Cash Drawer</h5>
            <div className="space-y-2 text-sm">
              <div className="flex justify-between">
                <span className="text-gray-600">Cash Tendered</span>
                <span className="font-medium">{formatCurrency(cashDrawer.cashTendered)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-600">Change Given</span>
                <span className="font-medium">-{formatCurrency(cashDrawer.changeGiven)}</span>
              </div>
              <div className="flex justify-between pt-2 border-t">
                <span className="font-medium text-gray-900">Expected in Drawer</span>
                <span className="font-bold text-gray-900">{formatCurrency(cashDrawer.expectedInDrawer)}</span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

// ============================================================================
// STAFF TAB
// ============================================================================

function StaffTab({ repData }) {
  const reps = repData || [];

  // Sort by revenue
  const sortedReps = [...reps].sort((a, b) => b.metrics.totalRevenue - a.metrics.totalRevenue);

  // Chart data
  const chartData = sortedReps.slice(0, 8).map(rep => ({
    name: rep.name.split(' ')[0], // First name only for chart
    revenue: rep.metrics.totalRevenue,
    transactions: rep.metrics.transactionCount,
  }));

  return (
    <div className="space-y-6">
      {/* Performance Chart */}
      <div className="bg-white rounded-xl border border-gray-200 p-4">
        <h4 className="text-sm font-semibold text-gray-900 mb-4">Sales Performance</h4>
        {chartData.length > 0 ? (
          <ResponsiveContainer width="100%" height={250}>
            <BarChart data={chartData} layout="vertical">
              <CartesianGrid strokeDasharray="3 3" stroke="#E5E7EB" />
              <XAxis type="number" tickFormatter={(v) => `$${v}`} />
              <YAxis dataKey="name" type="category" width={80} tick={{ fontSize: 12 }} />
              <Tooltip formatter={(value, name) => [
                name === 'revenue' ? formatCurrency(value) : value,
                name === 'revenue' ? 'Revenue' : 'Transactions'
              ]} />
              <Bar dataKey="revenue" fill="#10B981" radius={[0, 4, 4, 0]} />
            </BarChart>
          </ResponsiveContainer>
        ) : (
          <div className="h-[250px] flex items-center justify-center text-gray-500">
            No staff performance data available
          </div>
        )}
      </div>

      {/* Staff Table */}
      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-gray-50">
            <tr className="text-left text-gray-600">
              <th className="px-4 py-3 font-medium">Sales Rep</th>
              <th className="px-4 py-3 font-medium text-right">Transactions</th>
              <th className="px-4 py-3 font-medium text-right">Revenue</th>
              <th className="px-4 py-3 font-medium text-right">Avg Sale</th>
              <th className="px-4 py-3 font-medium text-right">Discount %</th>
              <th className="px-4 py-3 font-medium text-right">Items</th>
            </tr>
          </thead>
          <tbody>
            {sortedReps.map((rep, index) => (
              <tr key={rep.repId || index} className="border-t border-gray-100 hover:bg-gray-50">
                <td className="px-4 py-3">
                  <p className="font-medium text-gray-900">{rep.name}</p>
                  <p className="text-xs text-gray-500">{rep.email}</p>
                </td>
                <td className="px-4 py-3 text-right text-gray-700">
                  {rep.metrics.transactionCount}
                </td>
                <td className="px-4 py-3 text-right font-medium text-gray-900">
                  {formatCurrency(rep.metrics.totalRevenue)}
                </td>
                <td className="px-4 py-3 text-right text-gray-700">
                  {formatCurrency(rep.metrics.avgTransaction)}
                </td>
                <td className="px-4 py-3 text-right">
                  <span className={rep.metrics.avgDiscountPercent > 10 ? 'text-orange-600' : 'text-gray-700'}>
                    {rep.metrics.avgDiscountPercent.toFixed(1)}%
                  </span>
                </td>
                <td className="px-4 py-3 text-right text-gray-700">
                  {rep.metrics.itemsSold}
                </td>
              </tr>
            ))}
            {sortedReps.length === 0 && (
              <tr>
                <td colSpan={6} className="px-4 py-8 text-center text-gray-500">
                  No staff data available
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ============================================================================
// OVERRIDES TAB
// ============================================================================

function OverridesTab({ operationalData }) {
  const { voids = {}, refunds = {}, managerOverrides = {}, quoteConversions = {} } = operationalData || {};

  return (
    <div className="space-y-6">
      {/* Summary Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-red-50 border border-red-200 rounded-xl p-4">
          <p className="text-3xl font-bold text-red-700">{voids.count}</p>
          <p className="text-sm font-medium text-red-600">Voided Transactions</p>
          <p className="text-xs text-red-500 mt-1">{formatCurrency(voids.value)} value</p>
        </div>

        <div className="bg-orange-50 border border-orange-200 rounded-xl p-4">
          <p className="text-3xl font-bold text-orange-700">{refunds.count}</p>
          <p className="text-sm font-medium text-orange-600">Refunds</p>
          <p className="text-xs text-orange-500 mt-1">{formatCurrency(refunds.value)} value</p>
        </div>

        <div className="bg-purple-50 border border-purple-200 rounded-xl p-4">
          <p className="text-3xl font-bold text-purple-700">{managerOverrides.count}</p>
          <p className="text-sm font-medium text-purple-600">Manager Overrides</p>
          <p className="text-xs text-purple-500 mt-1">{managerOverrides.uniqueApprovers} approvers</p>
        </div>

        <div className="bg-green-50 border border-green-200 rounded-xl p-4">
          <p className="text-3xl font-bold text-green-700">{quoteConversions.count}</p>
          <p className="text-sm font-medium text-green-600">Quotes Converted</p>
          <p className="text-xs text-green-500 mt-1">{formatCurrency(quoteConversions.revenue)} revenue</p>
        </div>
      </div>

      {/* Override Types */}
      {managerOverrides.types && managerOverrides.types.length > 0 && (
        <div className="bg-white rounded-xl border border-gray-200 p-4">
          <h4 className="text-sm font-semibold text-gray-900 mb-4">Override Types Used</h4>
          <div className="flex flex-wrap gap-2">
            {managerOverrides.types.map((type, index) => (
              <span
                key={index}
                className="px-3 py-1 bg-purple-100 text-purple-700 text-sm font-medium rounded-full"
              >
                {formatOverrideType(type)}
              </span>
            ))}
          </div>
        </div>
      )}

      {/* Void Reasons */}
      {voids.reasons && voids.reasons.length > 0 && (
        <div className="bg-white rounded-xl border border-gray-200 p-4">
          <h4 className="text-sm font-semibold text-gray-900 mb-4">Void Reasons</h4>
          <div className="space-y-2">
            {voids.reasons.map((reason, index) => (
              <div key={index} className="flex items-center gap-2 text-sm">
                <span className="w-2 h-2 bg-red-500 rounded-full" />
                <span className="text-gray-700">{reason || 'No reason provided'}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// ============================================================================
// HELPERS
// ============================================================================

function formatHour(hour) {
  const ampm = hour >= 12 ? 'PM' : 'AM';
  const hour12 = hour % 12 || 12;
  return `${hour12}${ampm}`;
}

function formatPaymentMethod(method) {
  const methods = {
    cash: 'Cash',
    credit: 'Credit Card',
    debit: 'Debit Card',
    gift_card: 'Gift Card',
    account: 'Account',
  };
  return methods[method] || method.charAt(0).toUpperCase() + method.slice(1);
}

function formatOverrideType(type) {
  return type
    .replace(/_/g, ' ')
    .split(' ')
    .map(word => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ');
}

// ============================================================================
// MAIN COMPONENT
// ============================================================================

/**
 * Shift Report Tabs Component
 * @param {object} props
 * @param {object} props.report - Full report data
 */
export function ShiftReportTabs({ report }) {
  const [activeTab, setActiveTab] = useState('sales');

  const tabs = [
    { id: 'sales', label: 'Sales', icon: ChartBarIcon },
    { id: 'payments', label: 'Payments', icon: CreditCardIcon },
    { id: 'staff', label: 'Staff', icon: UsersIcon },
    { id: 'overrides', label: 'Overrides', icon: ShieldCheckIcon },
  ];

  return (
    <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
      {/* Tab Navigation */}
      <div className="flex gap-2 p-4 border-b border-gray-200 bg-gray-50 overflow-x-auto">
        {tabs.map(tab => (
          <TabButton
            key={tab.id}
            active={activeTab === tab.id}
            onClick={() => setActiveTab(tab.id)}
            icon={tab.icon}
            label={tab.label}
          />
        ))}
      </div>

      {/* Tab Content */}
      <div className="p-4">
        {activeTab === 'sales' && (
          <SalesTab
            hourlyData={report?.hourlyBreakdown}
            productData={report?.productSummary}
          />
        )}
        {activeTab === 'payments' && (
          <PaymentsTab paymentData={report?.paymentBreakdown} />
        )}
        {activeTab === 'staff' && (
          <StaffTab repData={report?.salesRepPerformance} />
        )}
        {activeTab === 'overrides' && (
          <OverridesTab operationalData={report?.operationalMetrics} />
        )}
      </div>
    </div>
  );
}

export default ShiftReportTabs;
