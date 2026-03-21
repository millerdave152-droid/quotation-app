/**
 * CustomerAnalyticsNew.jsx — Screen 48
 * TeleTime Design System · Customer Analytics
 * Design frame: vcMYy
 */

import { useState } from 'react';
import { motion } from 'framer-motion';
import { Download } from 'lucide-react';
import BreadcrumbTopBar from '../shared/BreadcrumbTopBar';

/* ------------------------------------------------------------------ */
/*  Data                                                               */
/* ------------------------------------------------------------------ */

const periods = ['30 Days', '90 Days', 'Year'];

const kpis = [
  { label: 'New Customers', value: '1,847', delta: '+14.2% vs last period', up: true },
  { label: 'Repeat Rate', value: '38.4%', delta: '+3.1% vs last period', up: true },
  { label: 'Avg Lifetime Value', value: '$247.50', delta: '+$18.30 vs last period', up: true },
  { label: 'Churn Rate', value: '4.8%', delta: '+0.3% vs last period', up: false },
];

const segments = [
  { label: 'VIP (>$500 LTV)', color: '#FF8400', count: '1,284', pct: '10.0%', barW: '10%' },
  { label: 'Regular ($100-$500)', color: '#3B82F6', count: '4,932', pct: '38.4%', barW: '38%' },
  { label: 'Occasional (<$100)', color: '#22C55E', count: '4,287', pct: '33.4%', barW: '33%' },
  { label: 'Inactive (>90 days)', color: '#EF4444', count: '2,344', pct: '18.2%', barW: '18%' },
];

const topCustomers = [
  { name: 'James Chen', initials: 'JC', bg: '#FF8400', orders: '47', spent: '$2,847.50', lastOrder: '2 days ago', lastColor: '' },
  { name: 'Sarah Park', initials: 'SP', bg: '#3B82F6', orders: '38', spent: '$2,190.00', lastOrder: '5 days ago', lastColor: '' },
  { name: 'Mike Liu', initials: 'ML', bg: '#8B5CF6', orders: '31', spent: '$1,834.25', lastOrder: '1 week ago', lastColor: '' },
  { name: 'Anna Wong', initials: 'AW', bg: '#22C55E', orders: '28', spent: '$1,592.75', lastOrder: '3 days ago', lastColor: '' },
  { name: 'David Kim', initials: 'DK', bg: '#EF4444', orders: '24', spent: '$1,421.00', lastOrder: 'Today', lastColor: '#22C55E' },
];

const tableCols = [
  { label: 'Customer', w: 'flex-1' },
  { label: 'Orders', w: 'w-[60px]', align: 'text-right' },
  { label: 'Total Spent', w: 'w-[90px]', align: 'text-right' },
  { label: 'Last Order', w: 'w-[80px]', align: 'text-right' },
];

/* ------------------------------------------------------------------ */
/*  Sub-components                                                     */
/* ------------------------------------------------------------------ */

function PeriodSelector({ active, onChange }) {
  return (
    <div className="flex bg-secondary rounded-lg p-[3px]">
      {periods.map((p) => (
        <button
          key={p}
          onClick={() => onChange(p)}
          className={`px-3 py-1 rounded-md font-secondary text-[11px] transition-all ${
            active === p
              ? 'bg-background shadow font-medium text-foreground'
              : 'text-muted-foreground'
          }`}
        >
          {p}
        </button>
      ))}
    </div>
  );
}

function ExportButton() {
  return (
    <motion.button
      whileHover={{ scale: 1.02 }}
      whileTap={{ scale: 0.97 }}
      className="flex items-center gap-1.5 h-10 px-4 rounded-lu-pill bg-background border border-border text-foreground font-primary text-sm font-medium shadow-lu-sm"
    >
      <Download size={14} />
      Export
    </motion.button>
  );
}

/* ------------------------------------------------------------------ */
/*  Component                                                          */
/* ------------------------------------------------------------------ */

export default function CustomerAnalyticsNew() {
  const [period, setPeriod] = useState('30 Days');

  return (
    <div className="flex flex-col h-screen bg-background overflow-hidden">
      <BreadcrumbTopBar
        title={['Marketplace', 'Customer Analytics']}
        rightContent={
          <>
            <PeriodSelector active={period} onChange={setPeriod} />
            <ExportButton />
          </>
        }
      />

      <div className="flex-1 flex flex-col gap-5 p-6 overflow-auto">
        {/* Header */}
        <div className="flex items-center gap-3">
          <h1 className="text-foreground font-secondary text-[20px] font-bold">
            Customer Analytics
          </h1>
          <div className="flex-1" />
          <span className="bg-secondary text-muted-foreground font-secondary text-[11px] font-medium px-2.5 py-1 rounded-full">
            12,847 total customers
          </span>
        </div>

        {/* KPI cards */}
        <div className="grid grid-cols-4 gap-4">
          {kpis.map((k, i) => (
            <motion.div
              key={k.label}
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: i * 0.04, duration: 0.3 }}
              className="flex flex-col gap-1.5 bg-card rounded-xl p-4 border border-border"
            >
              <span className="text-muted-foreground font-secondary text-[11px] font-medium">
                {k.label}
              </span>
              <span
                className={`font-primary text-[24px] font-bold ${
                  k.up ? 'text-foreground' : 'text-[#EF4444]'
                }`}
              >
                {k.value}
              </span>
              <span
                className={`font-secondary text-[11px] ${
                  k.up ? 'text-[#22C55E]' : 'text-[#EF4444]'
                }`}
              >
                {k.delta}
              </span>
            </motion.div>
          ))}
        </div>

        {/* Mid row */}
        <div className="flex gap-4 flex-1 min-h-0">
          {/* Customer Segments */}
          <div className="w-[400px] shrink-0 flex flex-col gap-3.5 bg-card rounded-xl p-4 border border-border">
            <span className="text-foreground font-secondary text-sm font-semibold">
              Customer Segments
            </span>
            {segments.map((s) => (
              <div key={s.label} className="flex flex-col gap-1">
                <div className="flex items-center gap-2">
                  <div className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: s.color }} />
                  <span className="flex-1 text-foreground font-secondary text-xs">{s.label}</span>
                  <span className="text-foreground font-primary text-xs font-semibold">{s.count}</span>
                  <span className="font-primary text-[11px] font-medium" style={{ color: s.color }}>
                    {s.pct}
                  </span>
                </div>
                <div className="h-1.5 bg-secondary rounded-sm overflow-hidden">
                  <div className="h-full rounded-sm" style={{ backgroundColor: s.color, width: s.barW }} />
                </div>
              </div>
            ))}
          </div>

          {/* Top Customers table */}
          <div className="flex-1 flex flex-col bg-card rounded-xl border border-border overflow-hidden">
            <div className="px-4 py-3">
              <span className="text-foreground font-secondary text-sm font-semibold">
                Top Customers
              </span>
            </div>

            {/* Column headers */}
            <div className="flex items-center px-4 py-2 bg-secondary">
              {tableCols.map((col) => (
                <span
                  key={col.label}
                  className={`${col.w} shrink-0 text-muted-foreground font-secondary text-[11px] font-semibold ${col.align || ''}`}
                >
                  {col.label}
                </span>
              ))}
            </div>

            {/* Rows */}
            {topCustomers.map((c) => (
              <div
                key={c.name}
                className="flex items-center px-4 py-2"
                style={{ borderBottom: '1px solid var(--border)' }}
              >
                {/* Customer name + avatar */}
                <div className="flex-1 flex items-center gap-2">
                  <div
                    className="w-6 h-6 rounded-xl flex items-center justify-center shrink-0"
                    style={{ backgroundColor: c.bg }}
                  >
                    <span className="text-white font-secondary text-[9px] font-bold">
                      {c.initials}
                    </span>
                  </div>
                  <span className="text-foreground font-secondary text-xs font-medium">
                    {c.name}
                  </span>
                </div>

                {/* Orders */}
                <span className="w-[60px] shrink-0 text-foreground font-primary text-xs text-right">
                  {c.orders}
                </span>

                {/* Total Spent */}
                <span className="w-[90px] shrink-0 text-primary font-primary text-xs font-semibold text-right">
                  {c.spent}
                </span>

                {/* Last Order */}
                <span
                  className="w-[80px] shrink-0 font-secondary text-[11px] text-right"
                  style={{ color: c.lastColor || 'var(--muted-foreground)' }}
                >
                  {c.lastOrder}
                </span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
