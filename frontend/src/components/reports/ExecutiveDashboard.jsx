import React, { useState, useEffect } from 'react';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer,
  LineChart, Line, AreaChart, Area, PieChart, Pie, Cell
} from 'recharts';

const API_URL = process.env.REACT_APP_API_URL || 'http://localhost:3001';

// Helper for API calls
const api = {
  get: async (url) => {
    const response = await fetch(`${API_URL}${url}`);
    return { data: await response.json() };
  }
};

const COLORS = ['#4CAF50', '#2196F3', '#FF9800', '#9C27B0', '#F44336', '#00BCD4'];

const ExecutiveDashboard = () => {
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [forecastData, setForecastData] = useState(null);
  const [pipelineData, setPipelineData] = useState(null);
  const [salesVelocity, setSalesVelocity] = useState(null);
  const [inventoryHealth, setInventoryHealth] = useState(null);
  const [topCustomers, setTopCustomers] = useState([]);
  const [arAging, setArAging] = useState(null);

  useEffect(() => {
    fetchDashboardData();
  }, []);

  const fetchDashboardData = async () => {
    setLoading(true);
    try {
      const [forecastRes, pipelineRes, velocityRes, inventoryRes, customersRes, arRes] = await Promise.all([
        api.get('/api/analytics/forecast/summary').catch(() => ({ data: { data: null } })),
        api.get('/api/quotations/analytics/pipeline-win-rates').catch(() => ({ data: { data: null } })),
        api.get('/api/analytics/sales-velocity?days=30').catch(() => ({ data: { data: null } })),
        api.get('/api/inventory/optimization/health').catch(() => ({ data: { data: null } })),
        api.get('/api/customers/top-clv?limit=5').catch(() => ({ data: { data: [] } })),
        api.get('/api/invoices/ar-aging').catch(() => ({ data: { data: null } }))
      ]);

      setForecastData(forecastRes.data.data);
      setPipelineData(pipelineRes.data.data);
      setSalesVelocity(velocityRes.data.data);
      setInventoryHealth(inventoryRes.data.data);
      setTopCustomers(customersRes.data.data || []);
      setArAging(arRes.data.data);
    } catch (error) {
      console.error('Error fetching dashboard data:', error);
    } finally {
      setLoading(false);
    }
  };

  const refreshData = async () => {
    setRefreshing(true);
    await fetchDashboardData();
    setRefreshing(false);
  };

  const formatCurrency = (value) => {
    if (value === null || value === undefined) return '-';
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
      minimumFractionDigits: 0,
      maximumFractionDigits: 0
    }).format(value);
  };

  const formatPercent = (value) => {
    if (value === null || value === undefined) return '-';
    return `${value.toFixed(1)}%`;
  };

  // KPI Card Component
  const KPICard = ({ title, value, change, changeLabel, target, icon, color = 'blue' }) => {
    const colors = {
      blue: 'bg-blue-50 dark:bg-blue-900/20 border-blue-200 dark:border-blue-800',
      green: 'bg-green-50 dark:bg-green-900/20 border-green-200 dark:border-green-800',
      yellow: 'bg-yellow-50 dark:bg-yellow-900/20 border-yellow-200 dark:border-yellow-800',
      red: 'bg-red-50 dark:bg-red-900/20 border-red-200 dark:border-red-800',
      purple: 'bg-purple-50 dark:bg-purple-900/20 border-purple-200 dark:border-purple-800'
    };

    const isPositive = change >= 0;

    return (
      <div className={`rounded-xl border p-6 ${colors[color]}`}>
        <div className="flex items-center justify-between">
          <span className="text-sm font-medium text-gray-600 dark:text-gray-400">{title}</span>
          {icon && <span className="text-2xl">{icon}</span>}
        </div>
        <div className="mt-2 flex items-end justify-between">
          <div>
            <div className="text-3xl font-bold text-gray-900 dark:text-white">{value}</div>
            {change !== undefined && (
              <div className={`text-sm mt-1 ${isPositive ? 'text-green-600' : 'text-red-600'}`}>
                {isPositive ? '↑' : '↓'} {Math.abs(change).toFixed(1)}% {changeLabel}
              </div>
            )}
          </div>
          {target && (
            <div className="text-right">
              <div className="text-xs text-gray-500 dark:text-gray-400">Target</div>
              <div className="text-sm font-medium text-gray-700 dark:text-gray-300">{target}</div>
            </div>
          )}
        </div>
      </div>
    );
  };

  // Progress Ring Component
  const ProgressRing = ({ value, max, label, color = '#4CAF50' }) => {
    const percentage = max > 0 ? (value / max) * 100 : 0;
    const circumference = 2 * Math.PI * 45;
    const strokeDashoffset = circumference - (percentage / 100) * circumference;

    return (
      <div className="flex flex-col items-center">
        <svg className="w-28 h-28 transform -rotate-90">
          <circle
            cx="56"
            cy="56"
            r="45"
            stroke="#e5e7eb"
            strokeWidth="10"
            fill="none"
            className="dark:stroke-gray-700"
          />
          <circle
            cx="56"
            cy="56"
            r="45"
            stroke={color}
            strokeWidth="10"
            fill="none"
            strokeDasharray={circumference}
            strokeDashoffset={strokeDashoffset}
            strokeLinecap="round"
          />
        </svg>
        <div className="text-center -mt-16 mb-4">
          <div className="text-2xl font-bold text-gray-900 dark:text-white">{percentage.toFixed(0)}%</div>
          <div className="text-xs text-gray-500 dark:text-gray-400">{label}</div>
        </div>
      </div>
    );
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-screen">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
      </div>
    );
  }

  return (
    <div className="p-6 space-y-6 bg-gray-50 dark:bg-gray-900 min-h-screen">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold text-gray-900 dark:text-white">Executive Dashboard</h1>
          <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
            Real-time business performance metrics
          </p>
        </div>
        <button
          onClick={refreshData}
          disabled={refreshing}
          className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 transition-colors flex items-center gap-2"
        >
          <svg className={`w-4 h-4 ${refreshing ? 'animate-spin' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
          </svg>
          {refreshing ? 'Refreshing...' : 'Refresh'}
        </button>
      </div>

      {/* Revenue KPIs */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <KPICard
          title="Revenue (30-Day Forecast)"
          value={forecastData?.forecast?.forecast30
            ? formatCurrency(forecastData.forecast.forecast30.predictedRevenue)
            : '-'}
          change={forecastData?.forecast?.forecast30?.growthRate}
          changeLabel="vs last period"
          icon="💰"
          color="green"
        />
        <KPICard
          title="Pipeline Value"
          value={forecastData?.pipeline?.totalWeighted
            ? formatCurrency(forecastData.pipeline.totalWeighted)
            : '-'}
          target={forecastData?.pipeline?.totalValue
            ? formatCurrency(forecastData.pipeline.totalValue)
            : undefined}
          icon="📊"
          color="blue"
        />
        <KPICard
          title="Win Rate"
          value={pipelineData?.stages?.find(s => s.stage === 'WON')?.actualWinRate
            ? `${pipelineData.stages.find(s => s.stage === 'WON').actualWinRate}%`
            : '-'}
          icon="🎯"
          color="purple"
        />
        <KPICard
          title="Active Quotes"
          value={pipelineData?.stages
            ?.filter(s => !['WON', 'LOST', 'EXPIRED'].includes(s.stage))
            .reduce((sum, s) => sum + s.count, 0) || '-'}
          icon="📝"
          color="yellow"
        />
      </div>

      {/* Main Charts Row */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Revenue Forecast Chart */}
        <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm p-6">
          <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">
            Revenue Forecast
          </h3>
          {forecastData?.forecast?.historicalData?.length > 0 ? (
            <ResponsiveContainer width="100%" height={250}>
              <AreaChart data={forecastData.forecast.historicalData.slice(-30)}>
                <defs>
                  <linearGradient id="colorRevenue" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#4CAF50" stopOpacity={0.8}/>
                    <stop offset="95%" stopColor="#4CAF50" stopOpacity={0.1}/>
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="date" tickFormatter={(d) => new Date(d).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })} />
                <YAxis tickFormatter={(v) => `$${(v / 1000).toFixed(0)}k`} />
                <Tooltip formatter={(v) => formatCurrency(v)} />
                <Area type="monotone" dataKey="revenue" stroke="#4CAF50" fillOpacity={1} fill="url(#colorRevenue)" />
              </AreaChart>
            </ResponsiveContainer>
          ) : (
            <div className="h-64 flex items-center justify-center text-gray-500 dark:text-gray-400">
              No forecast data available
            </div>
          )}
        </div>

        {/* Pipeline Stage Distribution */}
        <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm p-6">
          <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">
            Pipeline by Stage
          </h3>
          {pipelineData?.stages?.length > 0 ? (
            <div className="flex items-center">
              <ResponsiveContainer width="50%" height={250}>
                <PieChart>
                  <Pie
                    data={pipelineData.stages.filter(s => !['WON', 'LOST', 'EXPIRED'].includes(s.stage))}
                    dataKey="value"
                    nameKey="stage"
                    cx="50%"
                    cy="50%"
                    outerRadius={80}
                    label={({ stage }) => stage}
                  >
                    {pipelineData.stages.map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                    ))}
                  </Pie>
                  <Tooltip formatter={(v) => formatCurrency(v)} />
                </PieChart>
              </ResponsiveContainer>
              <div className="w-1/2 space-y-2">
                {pipelineData.stages
                  .filter(s => !['WON', 'LOST', 'EXPIRED'].includes(s.stage))
                  .map((stage, idx) => (
                    <div key={stage.stage} className="flex items-center justify-between text-sm">
                      <div className="flex items-center gap-2">
                        <div className="w-3 h-3 rounded-full" style={{ backgroundColor: COLORS[idx % COLORS.length] }} />
                        <span className="text-gray-600 dark:text-gray-400">{stage.stage}</span>
                      </div>
                      <span className="font-medium text-gray-900 dark:text-white">
                        {formatCurrency(stage.value / 100)}
                      </span>
                    </div>
                  ))}
              </div>
            </div>
          ) : (
            <div className="h-64 flex items-center justify-center text-gray-500 dark:text-gray-400">
              No pipeline data available
            </div>
          )}
        </div>
      </div>

      {/* Second Row */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Top Customers by CLV */}
        <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm p-6">
          <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">
            Top Customers by CLV
          </h3>
          {topCustomers.length > 0 ? (
            <div className="space-y-4">
              {topCustomers.map((customer, idx) => (
                <div key={customer.id || idx} className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className={`w-8 h-8 rounded-full flex items-center justify-center text-white text-sm font-bold ${
                      idx === 0 ? 'bg-yellow-500' : idx === 1 ? 'bg-gray-400' : idx === 2 ? 'bg-amber-700' : 'bg-gray-300'
                    }`}>
                      {idx + 1}
                    </div>
                    <div>
                      <div className="font-medium text-gray-900 dark:text-white text-sm">{customer.name}</div>
                      <div className="text-xs text-gray-500 dark:text-gray-400">
                        {customer.clv_segment || 'Standard'} tier
                      </div>
                    </div>
                  </div>
                  <div className="text-right">
                    <div className="font-medium text-gray-900 dark:text-white">
                      {formatCurrency(customer.clv_score || customer.total_spent_cents / 100)}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="h-48 flex items-center justify-center text-gray-500 dark:text-gray-400">
              No customer data available
            </div>
          )}
        </div>

        {/* Sales Team Performance */}
        <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm p-6">
          <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">
            Sales Team Performance
          </h3>
          {salesVelocity?.salespeople?.length > 0 ? (
            <ResponsiveContainer width="100%" height={200}>
              <BarChart data={salesVelocity.salespeople.slice(0, 5)} layout="vertical">
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis type="number" tickFormatter={(v) => `$${(v / 1000).toFixed(0)}k`} />
                <YAxis type="category" dataKey="salesperson" width={80} />
                <Tooltip formatter={(v) => formatCurrency(v)} />
                <Bar dataKey="totalRevenue" fill="#4CAF50" radius={[0, 4, 4, 0]} />
              </BarChart>
            </ResponsiveContainer>
          ) : (
            <div className="h-48 flex items-center justify-center text-gray-500 dark:text-gray-400">
              No sales data available
            </div>
          )}
        </div>

        {/* Inventory & AR Health */}
        <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm p-6">
          <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">
            Health Indicators
          </h3>
          <div className="grid grid-cols-2 gap-4">
            <ProgressRing
              value={inventoryHealth?.inStock || 85}
              max={100}
              label="In Stock"
              color="#4CAF50"
            />
            <ProgressRing
              value={arAging?.summary?.current || 70}
              max={arAging?.summary?.total || 100}
              label="AR Current"
              color="#2196F3"
            />
          </div>
          <div className="mt-4 space-y-2">
            <div className="flex justify-between text-sm">
              <span className="text-gray-500 dark:text-gray-400">Low Stock Items</span>
              <span className="font-medium text-yellow-600">{inventoryHealth?.lowStock || 0}</span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-gray-500 dark:text-gray-400">Out of Stock</span>
              <span className="font-medium text-red-600">{inventoryHealth?.outOfStock || 0}</span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-gray-500 dark:text-gray-400">Overdue Invoices</span>
              <span className="font-medium text-red-600">{arAging?.summary?.overdueCount || 0}</span>
            </div>
          </div>
        </div>
      </div>

      {/* Alerts Section */}
      <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm p-6">
        <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">
          Action Required
        </h3>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="p-4 bg-red-50 dark:bg-red-900/20 rounded-lg border border-red-200 dark:border-red-800">
            <div className="flex items-center gap-2 text-red-700 dark:text-red-400 font-medium">
              <span className="text-lg">⚠️</span>
              <span>Expiring Quotes</span>
            </div>
            <div className="mt-2 text-2xl font-bold text-red-600">
              {pipelineData?.stages?.find(s => s.stage === 'SENT')?.count || 0}
            </div>
            <div className="text-sm text-red-600 dark:text-red-400">quotes need follow-up</div>
          </div>

          <div className="p-4 bg-yellow-50 dark:bg-yellow-900/20 rounded-lg border border-yellow-200 dark:border-yellow-800">
            <div className="flex items-center gap-2 text-yellow-700 dark:text-yellow-400 font-medium">
              <span className="text-lg">📦</span>
              <span>Low Inventory</span>
            </div>
            <div className="mt-2 text-2xl font-bold text-yellow-600">
              {inventoryHealth?.lowStock || 0}
            </div>
            <div className="text-sm text-yellow-600 dark:text-yellow-400">products need reorder</div>
          </div>

          <div className="p-4 bg-orange-50 dark:bg-orange-900/20 rounded-lg border border-orange-200 dark:border-orange-800">
            <div className="flex items-center gap-2 text-orange-700 dark:text-orange-400 font-medium">
              <span className="text-lg">💳</span>
              <span>Overdue Payments</span>
            </div>
            <div className="mt-2 text-2xl font-bold text-orange-600">
              {formatCurrency(arAging?.summary?.overdueAmount || 0)}
            </div>
            <div className="text-sm text-orange-600 dark:text-orange-400">needs collection</div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default ExecutiveDashboard;
