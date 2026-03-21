/**
 * OrderAnalyticsNew.jsx — Screen 47
 * TeleTime Design System · Order Analytics
 * Design frame: pvmrM
 */

import { useState, useEffect, useCallback } from 'react';
import { motion } from 'framer-motion';
import { Download, Loader2 } from 'lucide-react';
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from 'recharts';
import BreadcrumbTopBar from '../shared/BreadcrumbTopBar';
import { useToast } from '../ui/Toast';
import apiClient from '../../services/apiClient';

/* ------------------------------------------------------------------ */
/*  Constants                                                          */
/* ------------------------------------------------------------------ */

const PERIODS = [
  { label: '7 Days',  value: 7 },
  { label: '30 Days', value: 30 },
  { label: '90 Days', value: 90 },
];

/* ------------------------------------------------------------------ */
/*  Helpers                                                            */
/* ------------------------------------------------------------------ */

function formatNumber(n) {
  if (n == null) return '—';
  return Number(n).toLocaleString('en-US');
}

function formatCents(cents) {
  if (!cents && cents !== 0) return '$0.00';
  return `$${(Number(cents) / 100).toLocaleString('en-US', { minimumFractionDigits: 2 })}`;
}


function formatPct(val) {
  if (val == null) return '—';
  const n = Number(val);
  if (isNaN(n)) return val;
  return `${n.toFixed(1)}%`;
}

/* ------------------------------------------------------------------ */
/*  Hook                                                               */
/* ------------------------------------------------------------------ */

function useOrderAnalytics(days) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);

  const fetch = useCallback(async () => {
    try {
      setLoading(true);
      const res = await apiClient.get(`/api/analytics/revenue-features?period=${days}`);
      const payload = res.data?.data || res.data;
      setData(payload);
    } catch { /* ignore */ } finally {
      setLoading(false);
    }
  }, [days]);

  useEffect(() => { fetch(); }, [fetch]);

  return { data, loading };
}

/* ------------------------------------------------------------------ */
/*  Sub-components                                                     */
/* ------------------------------------------------------------------ */

function PeriodSelector({ active, onChange }) {
  return (
    <div className="flex bg-secondary rounded-lg p-[3px]">
      {PERIODS.map((p) => (
        <button
          key={p.value}
          onClick={() => onChange(p.value)}
          className={`px-3 py-1 rounded-md font-secondary text-[11px] transition-all ${
            active === p.value
              ? 'bg-background shadow font-medium text-foreground'
              : 'text-muted-foreground'
          }`}
        >
          {p.label}
        </button>
      ))}
    </div>
  );
}

function ExportButton() {
  const toast = useToast();
  return (
    <motion.button
      whileHover={{ scale: 1.02 }}
      whileTap={{ scale: 0.97 }}
      onClick={() => toast.info('Export coming soon')}
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

export default function OrderAnalyticsNew() {
  const [period, setPeriod] = useState(7);
  const { data, loading } = useOrderAnalytics(period);

  /* Extract KPIs from response */
  const totalQuotes = data?.totalQuotes ?? data?.total_quotes;
  const revenue = data?.revenue || {};
  const avgValue = data?.averages?.averageTotal ?? data?.averages?.average_total;
  const adoptionRate = data?.adoptionRate ?? data?.adoption_rate;

  const kpis = [
    {
      label: 'Total Orders',
      value: totalQuotes != null ? formatNumber(totalQuotes) : '—',
      delta: data?.trends?.quoteTrend != null ? `${data.trends.quoteTrend > 0 ? '+' : ''}${data.trends.quoteTrend.toFixed(1)}% vs last period` : null,
      up: data?.trends?.quoteTrend >= 0,
    },
    {
      label: 'Avg Order Value',
      value: avgValue != null ? formatCents(avgValue) : '—',
      delta: data?.trends?.avgTrend != null ? `${data.trends.avgTrend > 0 ? '+' : ''}${data.trends.avgTrend.toFixed(1)}% vs last period` : null,
      up: data?.trends?.avgTrend >= 0,
    },
    {
      label: 'Revenue',
      value: revenue.total != null ? formatCents(revenue.total) : '—',
      delta: data?.trends?.revenueTrend != null ? `${data.trends.revenueTrend > 0 ? '+' : ''}${data.trends.revenueTrend.toFixed(1)}% vs last period` : null,
      up: data?.trends?.revenueTrend >= 0,
    },
    {
      label: 'Feature Adoption',
      value: adoptionRate != null ? formatPct(adoptionRate) : '—',
      delta: null,
      up: true,
    },
  ];

  /* Build chart data from feature adoption */
  const features = data?.featureAdoption || {};
  const volumeData = Object.entries(features).map(([key, val]) => ({
    day: key.charAt(0).toUpperCase() + key.slice(1),
    orders: val?.count ?? val ?? 0,
  }));

  /* Build status breakdown from feature adoption rates */
  const featureColors = ['#22C55E', '#3B82F6', '#F59E0B', '#EF4444', '#8B5CF6'];
  const totalFeatureOrders = volumeData.reduce((sum, d) => sum + d.orders, 0) || 1;
  const statuses = volumeData.map((d, i) => {
    const pct = ((d.orders / totalFeatureOrders) * 100).toFixed(1);
    return {
      label: d.day,
      color: featureColors[i % featureColors.length],
      count: formatNumber(d.orders),
      pct: `${pct}%`,
      barW: `${pct}%`,
    };
  });

  return (
    <div className="flex flex-col h-screen bg-background overflow-hidden">
      <BreadcrumbTopBar
        title={['Marketplace', 'Order Analytics']}
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
            Order Analytics
          </h1>
          <div className="flex-1" />
          <span className="bg-secondary text-muted-foreground font-secondary text-[11px] font-medium px-2.5 py-1 rounded-full">
            {totalQuotes != null ? `${formatNumber(totalQuotes)} orders this period` : '—'}
          </span>
        </div>

        {loading && (
          <div className="flex items-center justify-center py-20">
            <Loader2 size={28} className="animate-spin text-muted-foreground" />
          </div>
        )}

        {!loading && (
          <>
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
                      k.up !== false ? 'text-foreground' : 'text-[#EF4444]'
                    }`}
                  >
                    {k.value}
                  </span>
                  {k.delta && (
                    <span
                      className={`font-secondary text-[11px] ${
                        k.up !== false ? 'text-[#22C55E]' : 'text-[#EF4444]'
                      }`}
                    >
                      {k.delta}
                    </span>
                  )}
                </motion.div>
              ))}
            </div>

            {/* Mid row */}
            <div className="flex gap-4 flex-1 min-h-0">
              {/* Bar chart card */}
              <div className="flex-1 flex flex-col gap-3 bg-card rounded-xl p-4 border border-border">
                <span className="text-foreground font-secondary text-sm font-semibold">
                  Feature Adoption
                </span>
                <span className="text-muted-foreground font-secondary text-[11px]">
                  Feature usage over the last {PERIODS.find((p) => p.value === period)?.label || period + ' days'}
                </span>
                <div className="flex-1 min-h-0" style={{ minHeight: 200 }}>
                  {volumeData.length > 0 ? (
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart data={volumeData} margin={{ top: 8, right: 8, bottom: 0, left: -12 }}>
                        <defs>
                          <linearGradient id="orderGrad" x1="0" y1="0" x2="0" y2="1">
                            <stop offset="0%" stopColor="#FF8400" />
                            <stop offset="100%" stopColor="#FF840060" />
                          </linearGradient>
                        </defs>
                        <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" vertical={false} />
                        <XAxis
                          dataKey="day"
                          tick={{ fontSize: 10, fill: 'var(--muted-foreground)', fontFamily: 'var(--font-secondary)' }}
                          axisLine={false}
                          tickLine={false}
                        />
                        <YAxis
                          tick={{ fontSize: 9, fill: 'var(--muted-foreground)', fontFamily: 'var(--font-primary)' }}
                          axisLine={false}
                          tickLine={false}
                        />
                        <Tooltip
                          contentStyle={{
                            background: 'var(--card)',
                            border: '1px solid var(--border)',
                            borderRadius: 8,
                            fontSize: 12,
                            fontFamily: 'var(--font-secondary)',
                          }}
                        />
                        <Bar dataKey="orders" fill="url(#orderGrad)" radius={[4, 4, 0, 0]} />
                      </BarChart>
                    </ResponsiveContainer>
                  ) : (
                    <div className="flex items-center justify-center h-full">
                      <span className="text-muted-foreground font-secondary text-sm">No chart data available</span>
                    </div>
                  )}
                </div>
              </div>

              {/* Right sidebar */}
              <div className="w-[340px] shrink-0 flex flex-col gap-4">
                {/* Feature Breakdown */}
                <div className="flex flex-col gap-3.5 bg-card rounded-xl p-4 border border-border">
                  <span className="text-foreground font-secondary text-sm font-semibold">
                    Feature Breakdown
                  </span>
                  {statuses.length === 0 && (
                    <span className="text-muted-foreground font-secondary text-xs">No data available</span>
                  )}
                  {statuses.map((s) => (
                    <div key={s.label} className="flex flex-col gap-1.5">
                      <div className="flex items-center gap-2">
                        <div className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: s.color }} />
                        <span className="flex-1 text-foreground font-secondary text-xs">{s.label}</span>
                        <span className="text-foreground font-primary text-xs font-semibold">{s.count}</span>
                        <span className="font-primary text-[11px] font-medium" style={{ color: s.color }}>
                          {s.pct}
                        </span>
                      </div>
                      <div className="h-1 bg-secondary rounded-sm overflow-hidden">
                        <div className="h-full rounded-sm" style={{ backgroundColor: s.color, width: s.barW }} />
                      </div>
                    </div>
                  ))}
                </div>

                {/* Revenue Breakdown */}
                <div className="flex flex-col gap-3 bg-card rounded-xl p-4 border border-border">
                  <span className="text-foreground font-secondary text-sm font-semibold">
                    Revenue Sources
                  </span>
                  {[
                    { name: 'Financing',  value: revenue.financing },
                    { name: 'Warranties', value: revenue.warranties },
                    { name: 'Delivery',   value: revenue.delivery },
                    { name: 'Rebates',    value: revenue.rebates },
                    { name: 'Trade-Ins',  value: revenue.tradeIns },
                  ].filter((d) => d.value != null).map((d) => (
                    <div key={d.name} className="flex items-center gap-2">
                      <span className="flex-1 text-foreground font-secondary text-xs">{d.name}</span>
                      <span className="text-foreground font-primary text-xs font-semibold">
                        {formatCents(d.value)}
                      </span>
                    </div>
                  ))}
                  {revenue.total == null && (
                    <span className="text-muted-foreground font-secondary text-xs">No revenue data</span>
                  )}
                </div>
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
