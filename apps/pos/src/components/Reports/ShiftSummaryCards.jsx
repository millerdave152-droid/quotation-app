/**
 * TeleTime POS - Shift Summary Cards
 * At-a-glance metrics display for shift reports
 */

import {
  BanknotesIcon,
  ShoppingCartIcon,
  ReceiptPercentIcon,
  CurrencyDollarIcon,
  ArrowTrendingUpIcon,
  ArrowTrendingDownIcon,
  MinusIcon,
} from '@heroicons/react/24/outline';

/**
 * Format currency
 */
function formatCurrency(value) {
  return new Intl.NumberFormat('en-CA', {
    style: 'currency',
    currency: 'CAD',
  }).format(value || 0);
}

/**
 * Single summary card component
 */
function SummaryCard({
  title,
  value,
  subtitle,
  icon: Icon,
  color = 'blue',
  trend,
  trendValue,
}) {
  const colorClasses = {
    blue: 'bg-blue-50 text-blue-600 border-blue-200',
    green: 'bg-green-50 text-green-600 border-green-200',
    purple: 'bg-purple-50 text-purple-600 border-purple-200',
    orange: 'bg-orange-50 text-orange-600 border-orange-200',
    red: 'bg-red-50 text-red-600 border-red-200',
  };

  const iconBgClasses = {
    blue: 'bg-blue-100',
    green: 'bg-green-100',
    purple: 'bg-purple-100',
    orange: 'bg-orange-100',
    red: 'bg-red-100',
  };

  const getTrendIcon = () => {
    if (trend === 'up') return ArrowTrendingUpIcon;
    if (trend === 'down') return ArrowTrendingDownIcon;
    return MinusIcon;
  };

  const getTrendColor = () => {
    if (trend === 'up') return 'text-green-600';
    if (trend === 'down') return 'text-red-600';
    return 'text-gray-500';
  };

  const TrendIcon = getTrendIcon();

  return (
    <div className={`p-4 rounded-xl border ${colorClasses[color]}`}>
      <div className="flex items-start justify-between">
        <div className={`p-2 rounded-lg ${iconBgClasses[color]}`}>
          <Icon className="w-5 h-5" />
        </div>
        {trend && (
          <div className={`flex items-center gap-1 text-sm ${getTrendColor()}`}>
            <TrendIcon className="w-4 h-4" />
            <span>{trendValue}</span>
          </div>
        )}
      </div>
      <div className="mt-3">
        <p className="text-2xl font-bold text-gray-900">{value}</p>
        <p className="text-sm font-medium mt-1">{title}</p>
        {subtitle && (
          <p className="text-xs text-gray-500 mt-1">{subtitle}</p>
        )}
      </div>
    </div>
  );
}

/**
 * Shift Summary Cards Component
 * @param {object} props
 * @param {object} props.summary - Sales summary data
 * @param {object} props.payments - Payment breakdown data
 * @param {object} props.comparison - Comparison with previous period (optional)
 */
export function ShiftSummaryCards({ summary, payments, comparison }) {
  if (!summary) {
    return (
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {[1, 2, 3, 4].map(i => (
          <div key={i} className="p-4 rounded-xl border border-gray-200 animate-pulse">
            <div className="w-10 h-10 bg-gray-200 rounded-lg mb-3" />
            <div className="h-8 bg-gray-200 rounded w-24 mb-2" />
            <div className="h-4 bg-gray-200 rounded w-16" />
          </div>
        ))}
      </div>
    );
  }

  const { transactions, revenue, averages, itemsSold } = summary;
  const cashInDrawer = payments?.cashDrawer?.expectedInDrawer || 0;

  // Calculate trends if comparison data exists
  const getTrend = (current, previous) => {
    if (!previous || previous === 0) return null;
    const change = ((current - previous) / previous) * 100;
    return {
      direction: change > 0 ? 'up' : change < 0 ? 'down' : 'neutral',
      value: `${Math.abs(change).toFixed(1)}%`,
    };
  };

  const revenueTrend = comparison?.revenue
    ? getTrend(revenue.netRevenue, comparison.previous?.salesSummary?.revenue?.netRevenue)
    : null;

  const transactionTrend = comparison?.transactions
    ? getTrend(transactions.total, comparison.previous?.salesSummary?.transactions?.total)
    : null;

  return (
    <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
      <SummaryCard
        icon={CurrencyDollarIcon}
        title="Total Sales"
        value={formatCurrency(revenue.netRevenue)}
        subtitle={`Gross: ${formatCurrency(revenue.grossRevenue)}`}
        color="green"
        trend={revenueTrend?.direction}
        trendValue={revenueTrend?.value}
      />

      <SummaryCard
        icon={ShoppingCartIcon}
        title="Transactions"
        value={transactions.total.toLocaleString()}
        subtitle={`${transactions.voided} voided, ${transactions.refunded} refunded`}
        color="blue"
        trend={transactionTrend?.direction}
        trendValue={transactionTrend?.value}
      />

      <SummaryCard
        icon={ReceiptPercentIcon}
        title="Avg Transaction"
        value={formatCurrency(averages.transactionValue)}
        subtitle={`${averages.itemsPerTransaction.toFixed(1)} items/txn`}
        color="purple"
      />

      <SummaryCard
        icon={BanknotesIcon}
        title="Cash in Drawer"
        value={formatCurrency(cashInDrawer)}
        subtitle={`Discounts: ${formatCurrency(revenue.totalDiscounts)}`}
        color="orange"
      />
    </div>
  );
}

/**
 * Extended cards for more detailed view
 */
export function ExtendedSummaryCards({ summary, payments, operational }) {
  if (!summary) return null;

  const { revenue } = summary;

  return (
    <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mt-4">
      <SummaryCard
        icon={CurrencyDollarIcon}
        title="Total Tax"
        value={formatCurrency(revenue.tax.total)}
        subtitle={`HST: ${formatCurrency(revenue.tax.hst)} | GST: ${formatCurrency(revenue.tax.gst)}`}
        color="blue"
      />

      <SummaryCard
        icon={BanknotesIcon}
        title="Card Payments"
        value={formatCurrency(payments?.totals?.card || 0)}
        subtitle={`Cash: ${formatCurrency(payments?.totals?.cash || 0)}`}
        color="purple"
      />

      <SummaryCard
        icon={ShoppingCartIcon}
        title="Items Sold"
        value={(summary.itemsSold || 0).toLocaleString()}
        subtitle="Total units"
        color="green"
      />

      <SummaryCard
        icon={ReceiptPercentIcon}
        title="Manager Overrides"
        value={(operational?.managerOverrides?.count || 0).toString()}
        subtitle={`${operational?.voids?.count || 0} voids`}
        color={operational?.managerOverrides?.count > 0 ? 'orange' : 'blue'}
      />
    </div>
  );
}

export default ShiftSummaryCards;
