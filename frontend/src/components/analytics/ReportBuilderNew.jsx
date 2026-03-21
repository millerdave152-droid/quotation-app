/**
 * ReportBuilderNew.jsx
 * Screen 3 — Report Builder (Pencil frame Lkt6L)
 * Top bar + tab bar + split panel: config (360px) | results (fill)
 */

import { useState } from 'react';
import { motion } from 'framer-motion';

const tabs = ['Builder', 'Templates', 'Scheduled'];

const salesMetrics = [
  { id: 'total-sales', label: 'Total Sales' },
  { id: 'quote-count', label: 'Quote Count' },
  { id: 'win-rate', label: 'Win Rate' },
];
const revenueMetrics = [
  { id: 'total-revenue', label: 'Total Revenue' },
  { id: 'avg-per-quote', label: 'Avg per Quote' },
];

const chartTypes = [
  { id: 'bar', icon: 'bar_chart', label: 'Bar' },
  { id: 'line', icon: 'show_chart', label: 'Line' },
  { id: 'pie', icon: 'pie_chart', label: 'Pie' },
];

const summaryCards = [
  { label: 'Total Sales', value: '$1,247,500', sub: 'Avg: $8,785', accent: 'border-t-2 border-t-primary' },
  { label: 'Quote Count', value: '142', sub: 'Avg: 2.4/day', accent: 'border-t-2 border-t-blue-500' },
  { label: 'Total Revenue', value: '$847,250', sub: 'Avg: $5,966', accent: 'border-t-2 border-t-emerald-500' },
];

const barData = [
  { label: 'Living', h: 140, color: 'hsl(var(--lu-primary))' },
  { label: 'Bedroom', h: 100, color: '#3B82F6' },
  { label: 'Dining', h: 120, color: '#22C55E' },
  { label: 'Office', h: 80, color: '#F59E0B' },
  { label: 'Outdoor', h: 60, color: '#8B5CF6' },
];

const tableHeaders = ['Category', 'Total Sales', 'Quote Count', 'Total Revenue', 'Avg per Quote'];
const tableRows = [
  ['Living Room', '$428,500', '48', '$285,200', '$5,942'],
  ['Bedroom', '$312,000', '35', '$198,400', '$5,669'],
  ['Dining', '$267,800', '28', '$178,900', '$6,389'],
  ['Office', '$148,200', '18', '$112,500', '$6,250'],
  ['Outdoor', '$91,000', '13', '$72,250', '$5,558'],
];

export default function ReportBuilderNew() {
  const [activeTab, setActiveTab] = useState('Builder');
  const [chartType, setChartType] = useState('bar');
  const [selectedMetrics, setSelectedMetrics] = useState(['total-sales', 'quote-count', 'total-revenue']);

  const toggleMetric = (id) =>
    setSelectedMetrics((prev) => prev.includes(id) ? prev.filter((m) => m !== id) : [...prev, id]);

  return (
    <motion.div initial={{opacity:0,y:8}} animate={{opacity:1,y:0}} transition={{duration:0.2}} className="flex flex-col h-screen bg-background">
      {/* Top Bar */}
      <div className="flex items-center h-[52px] px-6 bg-card shrink-0">
        <span className="font-primary text-base font-bold text-primary">LUNARIS</span>
        <span className="font-secondary text-sm text-muted-foreground mx-3">/</span>
        <span className="font-secondary text-sm font-semibold text-foreground">Report Builder</span>
      </div>
      <div className="h-px bg-border" />

      {/* Tab Bar */}
      <div className="flex items-center gap-1 px-6 py-2 bg-card shrink-0 border-b border-border/50">
        {tabs.map((t) => (
          <button key={t} onClick={() => setActiveTab(t)}
            className={`font-secondary text-sm font-medium px-4 py-1.5 rounded-lg transition-colors ${activeTab === t ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:text-foreground'}`}>
            {t}
          </button>
        ))}
      </div>
      <div className="h-px bg-border" />

      {/* Split Panel */}
      <div className="flex flex-1 overflow-hidden">
        {/* Config Panel (360px) */}
        <div className="w-[360px] shrink-0 bg-card border-r border-border/50 p-5 flex flex-col gap-4 overflow-y-auto">
          <span className="font-secondary text-sm font-bold text-foreground pb-3 border-b border-border/50">Report Configuration</span>

          {/* Metrics */}
          <div className="flex flex-col gap-2">
            <span className="font-secondary text-xs font-semibold text-foreground pb-3 border-b border-border/50">Select Metrics</span>
            <div className="bg-background rounded-lg px-3 py-2 flex flex-col gap-1.5">
              <span className="font-secondary text-[10px] font-semibold text-muted-foreground">Sales</span>
              {salesMetrics.map((m) => (
                <label key={m.id} className="flex items-center gap-2 cursor-pointer">
                  <input type="checkbox" checked={selectedMetrics.includes(m.id)} onChange={() => toggleMetric(m.id)} className="w-4 h-4 rounded border-border accent-primary cursor-pointer" />
                  <span className="font-secondary text-[11px] text-foreground">{m.label}</span>
                </label>
              ))}
            </div>
            <div className="bg-background rounded-lg px-3 py-2 flex flex-col gap-1.5">
              <span className="font-secondary text-[10px] font-semibold text-muted-foreground">Revenue</span>
              {revenueMetrics.map((m) => (
                <label key={m.id} className="flex items-center gap-2 cursor-pointer">
                  <input type="checkbox" checked={selectedMetrics.includes(m.id)} onChange={() => toggleMetric(m.id)} className="w-4 h-4 rounded border-border accent-primary cursor-pointer" />
                  <span className="font-secondary text-[11px] text-foreground">{m.label}</span>
                </label>
              ))}
            </div>
          </div>

          {/* Group By */}
          <div className="flex flex-col gap-1.5">
            <span className="font-secondary text-xs font-semibold text-foreground pb-3 border-b border-border/50">Group By</span>
            <select className="h-10 px-3 rounded-lg border border-border bg-background text-foreground font-secondary text-sm outline-none focus:border-primary transition">
              <option>Category</option><option>Salesperson</option><option>Month</option>
            </select>
          </div>

          {/* Chart Type */}
          <div className="flex flex-col gap-1.5">
            <span className="font-secondary text-xs font-semibold text-foreground pb-3 border-b border-border/50">Chart Type</span>
            <div className="flex gap-1">
              {chartTypes.map((ct) => (
                <button key={ct.id} onClick={() => setChartType(ct.id)}
                  className={`flex-1 flex items-center justify-center gap-1 h-8 rounded-lg font-secondary text-[11px] font-semibold transition-colors ${chartType === ct.id ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground hover:text-foreground'}`}>
                  <span className="material-symbols-rounded text-sm">{ct.icon}</span>{ct.label}
                </button>
              ))}
            </div>
          </div>

          {/* Date Range */}
          <div className="flex flex-col gap-1.5">
            <span className="font-secondary text-xs font-semibold text-foreground pb-3 border-b border-border/50">Date Range</span>
            <div className="flex gap-2">
              <div className="flex-1 flex flex-col gap-1">
                <span className="font-secondary text-[10px] text-muted-foreground">From</span>
                <input type="text" defaultValue="2026-01-01" className="h-10 px-3 rounded-lg border border-border bg-background text-foreground font-secondary text-sm outline-none focus:border-primary transition" />
              </div>
              <div className="flex-1 flex flex-col gap-1">
                <span className="font-secondary text-[10px] text-muted-foreground">To</span>
                <input type="text" defaultValue="2026-02-28" className="h-10 px-3 rounded-lg border border-border bg-background text-foreground font-secondary text-sm outline-none focus:border-primary transition" />
              </div>
            </div>
          </div>

          {/* Buttons */}
          <div className="flex gap-2 mt-auto">
            <button className="flex-1 h-10 bg-primary text-primary-foreground rounded-lg font-primary text-xs font-medium flex items-center justify-center gap-1.5">
              <span className="material-symbols-rounded text-sm">play_arrow</span>Run Report
            </button>
            <button className="h-10 px-4 rounded-lg border border-border text-foreground font-primary text-xs font-medium flex items-center gap-1.5">
              <span className="material-symbols-rounded text-sm">save</span>Save
            </button>
          </div>
        </div>

        {/* Results Panel */}
        <div className="flex-1 p-5 bg-background flex flex-col gap-4 overflow-y-auto">
          <span className="font-secondary text-base font-bold text-foreground">Report Results</span>

          {/* Summary Cards */}
          <div className="grid grid-cols-3 gap-3">
            {summaryCards.map((s) => (
              <div key={s.label} className={`bg-gradient-to-br from-card to-card/50 border border-border rounded-xl p-4 flex flex-col gap-0.5 shadow-sm hover:shadow-md transition-shadow ${s.accent}`}>
                <span className="font-secondary text-xs font-medium text-muted-foreground">{s.label}</span>
                <span className="font-primary text-2xl font-bold tracking-tight text-foreground">{s.value}</span>
                <span className="font-secondary text-[10px] text-muted-foreground">{s.sub}</span>
              </div>
            ))}
          </div>

          {/* Bar Chart */}
          <div className="bg-card border border-border rounded-xl p-4 shadow-sm">
            <span className="font-secondary text-[13px] font-bold text-foreground">Sales by Category</span>
            <div className="flex items-end gap-4 h-[160px] mt-3 bg-gradient-to-t from-primary/20 to-transparent rounded-lg relative">
              <div className="absolute inset-x-4 top-1/4 border-b border-dashed border-border/30" />
              <div className="absolute inset-x-4 top-1/2 border-b border-dashed border-border/30" />
              <div className="absolute inset-x-4 top-3/4 border-b border-dashed border-border/30" />
              {barData.map((b) => (
                <div key={b.label} className="flex-1 flex flex-col items-center justify-end gap-1 relative z-10">
                  <div className="w-full rounded-t-md" style={{ height: b.h, background: b.color }} />
                  <span className="font-secondary text-[9px] text-muted-foreground">{b.label}</span>
                </div>
              ))}
            </div>
          </div>

          {/* Data Table */}
          <div className="bg-card border border-border rounded-xl overflow-hidden flex-1">
            <div className="flex items-center bg-muted/50 border-b border-border/50 h-9 px-4">
              {tableHeaders.map((h, i) => (
                <span key={h} className="font-secondary text-[11px] font-semibold text-muted-foreground uppercase tracking-wider"
                  style={{ width: i === 0 ? 200 : i === 1 ? 140 : i === 2 ? 120 : i === 3 ? 140 : 120 }}>
                  {h}
                </span>
              ))}
            </div>
            {tableRows.map((row, ri) => (
              <div key={ri} className={`flex items-center h-10 px-4 hover:bg-muted/30 transition-colors ${ri < tableRows.length - 1 ? 'border-b border-border/50' : ''}`}>
                {row.map((cell, ci) => (
                  <span key={ci} className={`font-${ci === 0 ? 'secondary' : 'primary'} text-xs ${ci === 0 ? 'font-semibold' : ''} text-foreground`}
                    style={{ width: ci === 0 ? 200 : ci === 1 ? 140 : ci === 2 ? 120 : ci === 3 ? 140 : 120 }}>
                    {cell}
                  </span>
                ))}
              </div>
            ))}
          </div>
        </div>
      </div>
    </motion.div>
  );
}
