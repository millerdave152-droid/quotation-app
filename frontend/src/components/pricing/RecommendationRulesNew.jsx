/**
 * RecommendationRulesNew.jsx
 * Screen 24 — Recommendation Rules (Pencil frame zIl11)
 * QuotifySidebar + header, 3 stats, tabs, auto-generated rules table
 */

import { useState } from 'react';
// import QuotifySidebar from '../shared/QuotifySidebar'; // removed — MainLayout provides sidebar

const statsData = [
  { label: 'Active Rules', value: '156', detail: '82 auto, 48 curated, 26 category' },
  { label: 'Conversion Rate', value: '24.8%', valueColor: '#22C55E', detail: '+3.2% vs last month', detailColor: '#22C55E' },
  { label: 'Revenue Impact', value: '+$32.4K', valueColor: '#22C55E', detail: 'From cross-sell recommendations' },
];

const tabs = ['Auto-Generated', 'Curated Bundles', 'Category Rules'];

const ruleRows = [
  { buy: 'Ashley 3-Piece Sectional', recommend: 'Ottoman + Throw Pillows Set', confidence: 92, conversions: '148', status: 'Active', statusColor: '#22C55E', statusBg: '#22C55E15' },
  { buy: 'Queen Platform Bed', recommend: 'Mattress + Nightstand Pair', confidence: 87, conversions: '96', status: 'Active', statusColor: '#22C55E', statusBg: '#22C55E15' },
  { buy: '6-Chair Dining Table', recommend: 'Buffet Cabinet + China Set', confidence: 74, conversions: '52', status: 'Active', statusColor: '#22C55E', statusBg: '#22C55E15' },
  { buy: 'Power Recliner', recommend: 'Side Table + Floor Lamp', confidence: 68, conversions: '41', status: 'Review', statusColor: '#F59E0B', statusBg: '#F59E0B15' },
];

export default function RecommendationRulesNew() {
  const [activeTab, setActiveTab] = useState('Auto-Generated');

  return (
    <div className="flex-1 overflow-y-auto p-7 flex flex-col gap-5">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div className="flex flex-col gap-1">
            <h1 className="font-primary text-[22px] font-bold text-foreground">Recommendation Rules</h1>
            <p className="font-secondary text-[13px] text-muted-foreground">Auto-generated, curated bundles & category-based product suggestions</p>
          </div>
          <div className="flex items-center gap-2">
            <button className="h-8 px-4 rounded-full border border-border text-foreground font-primary text-xs font-medium flex items-center gap-1.5">
              <span className="material-symbols-rounded text-sm">science</span>Test Rules
            </button>
            <button className="h-8 px-4 rounded-full bg-primary text-primary-foreground font-primary text-xs font-medium flex items-center gap-1.5">
              <span className="material-symbols-rounded text-sm">add</span>New Rule
            </button>
          </div>
        </div>

        {/* Stats Row */}
        <div className="grid grid-cols-3 gap-3">
          {statsData.map((s) => (
            <div key={s.label} className="bg-card border border-border rounded-xl p-4 flex flex-col gap-1">
              <span className="font-secondary text-[11px] text-muted-foreground">{s.label}</span>
              <span className="font-primary text-xl font-bold" style={{ color: s.valueColor || 'hsl(var(--lu-foreground))' }}>{s.value}</span>
              <span className="font-secondary text-[10px]" style={{ color: s.detailColor || 'hsl(var(--lu-muted-foreground))' }}>{s.detail}</span>
            </div>
          ))}
        </div>

        {/* Tabs */}
        <div className="flex items-center gap-1">
          {tabs.map((t) => (
            <button key={t} onClick={() => setActiveTab(t)}
              className={`font-secondary text-sm font-medium px-4 py-1.5 rounded-lg transition-colors ${activeTab === t ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:text-foreground'}`}>
              {t}
            </button>
          ))}
        </div>

        {/* Auto-Generated Rules Table */}
        <div className="bg-card border border-border rounded-xl overflow-hidden">
          <div className="flex items-center justify-between px-5 py-4 border-b border-border">
            <div className="flex items-center gap-2">
              <span className="material-symbols-rounded text-lg text-primary">auto_awesome</span>
              <span className="font-secondary text-[15px] font-semibold text-foreground">Auto-Generated Rules</span>
              <span className="font-primary text-[10px] font-semibold text-white bg-primary rounded-full px-2 py-0.5">82 rules</span>
            </div>
          </div>
          <div className="flex items-center bg-secondary px-4 py-2.5">
            <span className="font-secondary text-[11px] font-semibold text-muted-foreground" style={{ width: 200 }}>If Customer Buys</span>
            <span className="font-secondary text-[11px] font-semibold text-muted-foreground" style={{ width: 200 }}>Then Recommend</span>
            <span className="font-secondary text-[11px] font-semibold text-muted-foreground text-center" style={{ width: 80 }}>Confidence</span>
            <span className="font-secondary text-[11px] font-semibold text-muted-foreground text-center" style={{ width: 80 }}>Conversions</span>
            <span className="font-secondary text-[11px] font-semibold text-muted-foreground text-center" style={{ width: 70 }}>Status</span>
          </div>
          {ruleRows.map((r, i) => (
            <div key={r.buy} className={`flex items-center px-4 py-3 ${i < ruleRows.length - 1 ? 'border-b border-border' : ''}`}>
              <span className="font-secondary text-xs text-foreground" style={{ width: 200 }}>{r.buy}</span>
              <span className="font-secondary text-xs text-foreground" style={{ width: 200 }}>{r.recommend}</span>
              <span className="font-primary text-xs font-bold text-center" style={{ width: 80, color: r.confidence >= 80 ? '#22C55E' : '#F59E0B' }}>{r.confidence}%</span>
              <span className="font-primary text-xs font-semibold text-foreground text-center" style={{ width: 80 }}>{r.conversions}</span>
              <div className="flex justify-center" style={{ width: 70 }}>
                <span className="font-secondary text-[10px] font-medium rounded-full px-2 py-0.5" style={{ background: r.statusBg, color: r.statusColor }}>{r.status}</span>
              </div>
            </div>
          ))}
        </div>
      </div>
  );
}
