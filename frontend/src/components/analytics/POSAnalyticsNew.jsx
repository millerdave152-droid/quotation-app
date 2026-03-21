/**
 * POSAnalyticsNew.jsx — Screen 21
 * Quotify Design System · POS Unified Analytics Dashboard
 * Design frame: 1uFfZ
 */

import { motion } from 'framer-motion';
import {
  RotateCw,
  DollarSign,
  ShoppingCart,
  ArrowUpRight,
  Percent,
  Send,
} from 'lucide-react';
// removed — MainLayout provides sidebar

/* ------------------------------------------------------------------ */
/*  Data                                                               */
/* ------------------------------------------------------------------ */

const periodPills = ['7d', '30d', '90d', 'Year'];

const statCards = [
  {
    label: 'Total POS Revenue',
    value: '$124,850',
    sub: '+18.2% vs last period',
    subColor: '#16A34A',
    icon: DollarSign,
  },
  {
    label: 'Avg Order Value',
    value: '$847',
    sub: '+$52 increase',
    subColor: '#16A34A',
    icon: ArrowUpRight,
  },
  {
    label: 'Total Transactions',
    value: '147',
    sub: '+12 this week',
    subColor: '#16A34A',
    icon: ShoppingCart,
  },
  {
    label: 'Quote-to-Sale Conv.',
    value: '64%',
    sub: '+3% improvement',
    subColor: '#16A34A',
    icon: Percent,
  },
];

const chartRows = [
  [
    { title: 'Average Order Value Trend' },
    { title: 'Top Selling Categories' },
  ],
  [
    { title: 'Sales by Payment Method' },
    { title: 'Conversion Funnel' },
  ],
  [
    { title: 'Product Performance' },
    { title: 'Customer Purchase Frequency' },
  ],
];

const expiringQuotes = [
  {
    quote: 'Q-2024-0891',
    customer: 'Johnson Interiors',
    amount: '$12,400',
    expires: 'Mar 5, 2024',
  },
  {
    quote: 'Q-2024-0887',
    customer: 'Maple Renovations',
    amount: '$8,750',
    expires: 'Mar 6, 2024',
  },
  {
    quote: 'Q-2024-0883',
    customer: 'Cedar Homes Ltd.',
    amount: '$15,200',
    expires: 'Mar 7, 2024',
  },
];

/* ------------------------------------------------------------------ */
/*  Component                                                          */
/* ------------------------------------------------------------------ */

export default function POSAnalyticsNew() {
  return (
    <div className="flex flex-col h-[calc(100vh-64px)] overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-border shrink-0">
          <div className="flex flex-col gap-0.5">
            <h1 className="text-foreground font-primary text-[22px] font-bold">
              POS Analytics
            </h1>
            <p className="text-muted-foreground font-secondary text-[13px]">
              Point of sale performance metrics
            </p>
          </div>

          <div className="flex items-center gap-3">
            <div className="flex items-center gap-1 bg-secondary rounded-lu-pill p-1">
              {periodPills.map((p) => (
                <span
                  key={p}
                  className={`px-3 py-1.5 rounded-lu-pill font-secondary text-sm font-medium cursor-pointer ${
                    p === '30d'
                      ? 'bg-background text-foreground shadow-lu-sm'
                      : 'text-muted-foreground'
                  }`}
                >
                  {p}
                </span>
              ))}
            </div>

            <motion.button
              whileHover={{ scale: 1.05 }}
              whileTap={{ scale: 0.95 }}
              className="flex items-center gap-1.5 h-9 px-3 rounded-lu-pill bg-background border border-border text-foreground font-secondary text-sm shadow-lu-sm"
            >
              <RotateCw size={14} />
              Refresh
            </motion.button>
          </div>
        </div>

        {/* Body */}
        <div className="flex-1 flex flex-col gap-5 p-6 overflow-auto">
          {/* Stats Row */}
          <div className="grid grid-cols-4 gap-4">
            {statCards.map((card, i) => (
              <motion.div
                key={card.label}
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: i * 0.05, duration: 0.3 }}
                className="flex flex-col gap-1 p-4 bg-card border border-border rounded-lg"
              >
                <div className="flex items-center justify-between">
                  <span className="text-muted-foreground font-secondary text-[11px]">
                    {card.label}
                  </span>
                  <card.icon size={14} className="text-muted-foreground" />
                </div>
                <span className="text-foreground font-primary text-2xl font-bold">
                  {card.value}
                </span>
                <span
                  className="font-secondary text-[11px]"
                  style={{ color: card.subColor }}
                >
                  {card.sub}
                </span>
              </motion.div>
            ))}
          </div>

          {/* Chart Rows (3 rows × 2 cards) */}
          {chartRows.map((row, ri) => (
            <div key={ri} className="grid grid-cols-2 gap-4">
              {row.map((chart, ci) => (
                <motion.div
                  key={chart.title}
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{
                    delay: 0.2 + ri * 0.1 + ci * 0.05,
                    duration: 0.3,
                  }}
                  className="flex flex-col gap-3 p-4 bg-card border border-border rounded-lg"
                >
                  <span className="text-foreground font-primary text-sm font-semibold">
                    {chart.title}
                  </span>
                  <div className="h-40 bg-secondary rounded flex items-center justify-center">
                    <span className="text-muted-foreground font-secondary text-sm">
                      {chart.title} Chart
                    </span>
                  </div>
                </motion.div>
              ))}
            </div>
          ))}

          {/* Expiring Quotes Card */}
          <motion.div
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.6, duration: 0.3 }}
            className="flex flex-col gap-3 p-4 bg-card border border-border rounded-lg"
          >
            <span className="text-foreground font-primary text-sm font-semibold">
              Expiring Quotes (Next 7 Days)
            </span>

            {/* Table */}
            <div className="overflow-x-auto">
              <table className="w-full text-left">
                <thead>
                  <tr className="border-b border-border">
                    {['Quote #', 'Customer', 'Amount', 'Expires', 'Action'].map(
                      (h) => (
                        <th
                          key={h}
                          className="pb-2 text-muted-foreground font-secondary text-[11px] font-medium"
                        >
                          {h}
                        </th>
                      )
                    )}
                  </tr>
                </thead>
                <tbody>
                  {expiringQuotes.map((q) => (
                    <tr
                      key={q.quote}
                      className="border-b border-border last:border-0"
                    >
                      <td className="py-2.5 text-foreground font-primary text-sm font-medium">
                        {q.quote}
                      </td>
                      <td className="py-2.5 text-foreground font-secondary text-sm">
                        {q.customer}
                      </td>
                      <td className="py-2.5 text-foreground font-primary text-sm font-semibold">
                        {q.amount}
                      </td>
                      <td className="py-2.5 text-muted-foreground font-secondary text-sm">
                        {q.expires}
                      </td>
                      <td className="py-2.5">
                        <button className="flex items-center gap-1 px-3 py-1 rounded-lu-pill bg-primary text-primary-foreground font-secondary text-xs font-medium">
                          <Send size={12} />
                          Send Reminder
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </motion.div>
        </div>
    </div>
  );
}
