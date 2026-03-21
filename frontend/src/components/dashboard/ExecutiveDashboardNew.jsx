/**
 * ExecutiveDashboardNew.jsx — Screen 15
 * TeleTime Design System · Executive Dashboard
 * Design frame: ibcRa
 *
 * Uses recharts for Revenue Forecast (AreaChart) and Pipeline by Stage (PieChart).
 * Sales Team Performance uses pure CSS bars.
 */

import { motion } from 'framer-motion';
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
} from 'recharts';
import {
  Download,
  RefreshCw,
  TrendingUp,
  Filter,
  Trophy,
  FileText,
} from 'lucide-react';
import StatCard from '../shared/StatCard';

/* ------------------------------------------------------------------ */
/*  KPI Data                                                           */
/* ------------------------------------------------------------------ */

const kpiCards = [
  {
    label: 'Revenue (30-Day Forecast)',
    value: '$847,250',
    sub: '+12.4%',
    subLabel: 'vs last period',
    subColor: '#22C55E',
    icon: TrendingUp,
    iconColor: '#22C55E',
  },
  {
    label: 'Pipeline Value',
    value: '$2.4M',
    sub: '142 active quotes',
    subLabel: '',
    subColor: '',
    icon: Filter,
    iconColor: '#3B82F6',
  },
  {
    label: 'Win Rate',
    value: '34.2%',
    sub: '+2.1%',
    subLabel: 'vs last quarter',
    subColor: '#22C55E',
    icon: Trophy,
    iconColor: '#F59E0B',
  },
  {
    label: 'Active Quotes',
    value: '142',
    sub: '23 expiring soon',
    subLabel: '',
    subColor: '#F59E0B',
    icon: FileText,
    iconColor: 'var(--primary)',
  },
];

/* ------------------------------------------------------------------ */
/*  Revenue Forecast Data                                              */
/* ------------------------------------------------------------------ */

const revenueData = [
  { month: 'Jan', actual: 620, projected: null },
  { month: 'Feb', actual: 710, projected: null },
  { month: 'Mar', actual: 847, projected: 847 },
  { month: 'Apr', actual: null, projected: 920 },
  { month: 'May', actual: null, projected: 980 },
  { month: 'Jun', actual: null, projected: 1050 },
];

/* ------------------------------------------------------------------ */
/*  Pipeline Donut Data                                                */
/* ------------------------------------------------------------------ */

const pipelineData = [
  { name: 'Draft', value: 840, color: '#3B82F6' },
  { name: 'Sent', value: 720, color: '#22C55E' },
  { name: 'Approved', value: 480, color: 'hsl(var(--primary))' },
  { name: 'Pending', value: 360, color: '#F59E0B' },
];

/* ------------------------------------------------------------------ */
/*  Top 5 CLV Data                                                     */
/* ------------------------------------------------------------------ */

const clvData = [
  { rank: 1, name: 'Meridian Interiors', value: '$124,500' },
  { rank: 2, name: 'Summit Properties', value: '$98,200' },
  { rank: 3, name: 'Oakwood Living', value: '$87,400' },
  { rank: 4, name: 'Design Collective', value: '$72,800' },
  { rank: 5, name: 'Urban Home Studio', value: '$65,100' },
];

/* ------------------------------------------------------------------ */
/*  Team Performance Data                                              */
/* ------------------------------------------------------------------ */

const teamData = [
  { name: 'Jane D.', value: '$245K', pct: 100, color: 'bg-secondary' },
  { name: 'Mike S.', value: '$198K', pct: 81, color: 'bg-primary' },
  { name: 'Sarah C.', value: '$167K', pct: 68, color: 'bg-[#22C55E]' },
  { name: 'Alex R.', value: '$142K', pct: 58, color: 'bg-[#3B82F6]' },
];

/* ------------------------------------------------------------------ */
/*  Health & Actions Data                                              */
/* ------------------------------------------------------------------ */

const gauges = [
  { label: 'In Stock', value: '92%', color: '#22C55E' },
  { label: 'AR Current', value: '87%', color: '#22C55E' },
];

const badges = [
  { label: '3 Low Stock', bg: 'bg-[#F59E0B15]', text: 'text-[#F59E0B]' },
  { label: '1 Out of Stock', bg: 'bg-[#EF444415]', text: 'text-[#EF4444]' },
];

const actions = [
  { label: 'Expiring Quotes', value: '23', color: 'text-[#F59E0B]' },
  { label: 'Low Inventory', value: '7', color: 'text-[#EF4444]' },
  { label: 'Overdue Payments', value: '$12,400', color: 'text-[#EF4444]' },
];

/* ------------------------------------------------------------------ */
/*  Custom Tooltip                                                     */
/* ------------------------------------------------------------------ */

function ChartTooltip({ active, payload, label }) {
  if (!active || !payload?.length) return null;
  return (
    <div className="bg-card border border-border rounded-lg px-3 py-2 shadow-lu-sm">
      <p className="text-foreground font-secondary text-xs font-semibold">
        {label}
      </p>
      {payload.map((p) => (
        <p key={p.dataKey} className="text-muted-foreground font-secondary text-[11px]">
          {p.dataKey === 'actual' ? 'Actual' : 'Projected'}: ${p.value}K
        </p>
      ))}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Card Wrapper                                                       */
/* ------------------------------------------------------------------ */

function DashCard({ title, children, className = '' }) {
  return (
    <div
      className={`flex flex-col bg-card border border-border rounded-xl overflow-hidden ${className}`}
    >
      {title && (
        <>
          <div className="flex items-center justify-between px-4 py-3">
            <span className="text-foreground font-secondary text-sm font-bold">
              {title}
            </span>
          </div>
          <div className="h-px bg-border" />
        </>
      )}
      {children}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Component                                                          */
/* ------------------------------------------------------------------ */

export default function ExecutiveDashboardNew() {
  return (
    <div className="flex flex-col h-screen bg-background font-secondary">
      {/* ── Top Bar ── */}
      <div className="flex items-center justify-between h-[52px] px-6 bg-card shrink-0">
        <div className="flex items-center gap-3">
          <span className="text-primary font-primary text-base font-bold">
            TeleTime
          </span>
          <span className="text-muted-foreground text-sm">/</span>
          <span className="text-foreground text-sm font-semibold">
            Executive Dashboard
          </span>
        </div>

        <div className="flex items-center gap-2">
          <motion.button
            whileHover={{ scale: 1.02 }}
            whileTap={{ scale: 0.97 }}
            className="flex items-center gap-1.5 h-10 px-4 rounded-lu-pill bg-background border border-border text-foreground font-primary text-sm font-medium shadow-lu-sm"
          >
            <Download size={16} />
            Export
          </motion.button>
          <motion.button
            whileHover={{ scale: 1.02 }}
            whileTap={{ scale: 0.97 }}
            className="flex items-center gap-1.5 h-10 px-4 rounded-lu-pill bg-primary text-primary-foreground font-primary text-sm font-medium"
          >
            <RefreshCw size={16} />
            Refresh
          </motion.button>
        </div>
      </div>

      {/* Divider */}
      <div className="h-px bg-border" />

      {/* ── Body ── */}
      <div className="flex-1 flex flex-col gap-5 p-6 overflow-auto">
        {/* ── KPI Row ── */}
        <div className="grid grid-cols-4 gap-4">
          {kpiCards.map((card, i) => (
            <StatCard
              key={card.label}
              label={card.label}
              value={card.value}
              subtitle={card.sub}
              subtitleColor={card.subColor}
              subtitleLabel={card.subLabel}
              icon={card.icon}
              iconColor={card.iconColor}
              delay={i * 0.06}
            />
          ))}
        </div>

        {/* ── Charts Row ── */}
        <div className="flex gap-4 h-[280px]">
          {/* Revenue Forecast */}
          <DashCard title="Revenue Forecast" className="flex-1">
            <div className="flex-1 px-4 pb-4">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart
                  data={revenueData}
                  margin={{ top: 10, right: 10, left: -20, bottom: 0 }}
                >
                  <defs>
                    <linearGradient id="revGrad" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="#FF8400" stopOpacity={0.15} />
                      <stop offset="100%" stopColor="#FF8400" stopOpacity={0.02} />
                    </linearGradient>
                  </defs>
                  <XAxis
                    dataKey="month"
                    axisLine={false}
                    tickLine={false}
                    tick={{ fontSize: 10, fill: 'hsl(var(--muted-foreground))' }}
                  />
                  <YAxis hide />
                  <Tooltip content={<ChartTooltip />} />
                  {/* Historical (solid) */}
                  <Area
                    type="monotone"
                    dataKey="actual"
                    stroke="hsl(var(--primary))"
                    strokeWidth={2}
                    fill="url(#revGrad)"
                    connectNulls={false}
                  />
                  {/* Projected (dashed, dimmed) */}
                  <Area
                    type="monotone"
                    dataKey="projected"
                    stroke="hsl(var(--primary))"
                    strokeWidth={2}
                    strokeDasharray="5 5"
                    strokeOpacity={0.5}
                    fill="url(#revGrad)"
                    fillOpacity={0.3}
                    connectNulls={false}
                  />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          </DashCard>

          {/* Pipeline by Stage — Donut */}
          <DashCard title="Pipeline by Stage" className="w-[400px]">
            <div className="flex items-center gap-4 flex-1 px-4 pb-4">
              {/* Donut */}
              <div className="relative w-[140px] h-[140px] shrink-0">
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie
                      data={pipelineData}
                      cx="50%"
                      cy="50%"
                      innerRadius={50}
                      outerRadius={70}
                      paddingAngle={2}
                      dataKey="value"
                      stroke="none"
                    >
                      {pipelineData.map((entry) => (
                        <Cell key={entry.name} fill={entry.color} />
                      ))}
                    </Pie>
                  </PieChart>
                </ResponsiveContainer>
                {/* Center text */}
                <div className="absolute inset-0 flex flex-col items-center justify-center">
                  <span className="text-foreground font-primary text-sm font-bold">
                    $2.4M
                  </span>
                  <span className="text-muted-foreground font-secondary text-[10px]">
                    Total
                  </span>
                </div>
              </div>

              {/* Legend */}
              <div className="flex flex-col gap-2">
                {pipelineData.map((entry) => (
                  <div key={entry.name} className="flex items-center gap-2">
                    <div
                      className="w-2.5 h-2.5 rounded-sm shrink-0"
                      style={{ backgroundColor: entry.color }}
                    />
                    <span className="text-foreground font-secondary text-[11px]">
                      {entry.name} — ${entry.value}K
                    </span>
                  </div>
                ))}
              </div>
            </div>
          </DashCard>
        </div>

        {/* ── Bottom Row ── */}
        <div className="flex gap-4 h-[280px]">
          {/* Top 5 Customers by CLV */}
          <DashCard title="Top 5 Customers by CLV" className="flex-1">
            <div className="flex-1 flex flex-col">
              {clvData.map((c, i) => (
                <div key={c.rank}>
                  <div className="flex items-center justify-between px-4 py-2">
                    <div className="flex items-center gap-2">
                      <span
                        className={`font-primary text-xs font-bold ${
                          c.rank <= 2 ? 'text-primary' : 'text-muted-foreground'
                        }`}
                      >
                        {c.rank}
                      </span>
                      <span className="text-foreground font-secondary text-xs font-semibold">
                        {c.name}
                      </span>
                    </div>
                    <span
                      className={`font-primary text-xs font-semibold ${
                        c.rank === 1 ? 'text-primary' : 'text-foreground'
                      }`}
                    >
                      {c.value}
                    </span>
                  </div>
                  {i < clvData.length - 1 && (
                    <div className="h-px bg-border" />
                  )}
                </div>
              ))}
            </div>
          </DashCard>

          {/* Sales Team Performance */}
          <DashCard title="Sales Team Performance" className="flex-1">
            <div className="flex-1 flex flex-col gap-2.5 p-4">
              {teamData.map((t) => (
                <div key={t.name} className="flex items-center gap-2">
                  <span className="w-[50px] text-foreground font-secondary text-[11px] shrink-0">
                    {t.name}
                  </span>
                  <div className="flex-1 h-4 bg-transparent">
                    <div
                      className={`h-full rounded ${t.color}`}
                      style={{ width: `${t.pct}%` }}
                    />
                  </div>
                  <span className="text-foreground font-primary text-[11px] font-semibold shrink-0">
                    {t.value}
                  </span>
                </div>
              ))}
            </div>
          </DashCard>

          {/* Health & Actions */}
          <DashCard title="Health & Actions" className="w-[360px]">
            <div className="flex-1 flex flex-col gap-2.5 p-3">
              {/* Gauges */}
              <div className="flex gap-3">
                {gauges.map((g) => (
                  <div
                    key={g.label}
                    className="flex-1 flex flex-col items-center gap-1 p-2.5 bg-background rounded-lg"
                  >
                    <span
                      className="font-primary text-lg font-bold"
                      style={{ color: g.color }}
                    >
                      {g.value}
                    </span>
                    <span className="text-muted-foreground font-secondary text-[10px]">
                      {g.label}
                    </span>
                  </div>
                ))}
              </div>

              {/* Badges */}
              <div className="flex gap-1.5">
                {badges.map((b) => (
                  <span
                    key={b.label}
                    className={`inline-flex items-center px-2 py-0.5 rounded text-[10px] font-semibold ${b.bg} ${b.text}`}
                  >
                    {b.label}
                  </span>
                ))}
              </div>

              <div className="h-px bg-border" />

              {/* Action Required */}
              <span className="text-foreground font-secondary text-xs font-bold">
                Action Required
              </span>

              {actions.map((a) => (
                <div
                  key={a.label}
                  className="flex items-center justify-between"
                >
                  <span className="text-muted-foreground font-secondary text-[11px]">
                    {a.label}
                  </span>
                  <span className={`font-primary text-xs font-bold ${a.color}`}>
                    {a.value}
                  </span>
                </div>
              ))}
            </div>
          </DashCard>
        </div>
      </div>
    </div>
  );
}
