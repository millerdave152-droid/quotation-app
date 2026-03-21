/**
 * AdvancedPricingManagerNew.jsx
 * Screen 22 — Advanced Pricing Manager (Pencil frame Q1tcI)
 * QuotifySidebar + header, stats, tabs, volume discount tiers table,
 * stacking policy rules
 */

import { useState } from 'react';
// import QuotifySidebar from '../shared/QuotifySidebar'; // removed — MainLayout provides sidebar

const statsData = [
  { label: 'Active Rules', value: '47', detail: '12 volume, 18 promo, 8 MAP, 9 bundle' },
  { label: 'Revenue Impact', value: '+$48.2K', valueColor: '#22C55E', detail: 'This month vs. baseline' },
  { label: 'Avg. Discount', value: '14.2%', detail: 'Across all active promotions' },
  { label: 'MAP Violations', value: '3', valueColor: '#EF4444', detail: 'Requires immediate attention', detailColor: '#EF4444' },
];

const tabs = ['Volume Discounts', 'Promotions', 'MAP Enforcement', 'Bundle Pricing'];

const tierRows = [
  { name: 'Bulk Sofa Discount', category: 'Living Room', qty: '3+', discount: '15%', stackable: true, validUntil: 'Jun 30, 2026', status: 'Active', statusColor: '#22C55E', statusBg: '#22C55E15' },
  { name: 'Bedroom Set Bundle', category: 'Bedroom', qty: '5+', discount: '20%', stackable: false, validUntil: 'Dec 31, 2026', status: 'Active', statusColor: '#22C55E', statusBg: '#22C55E15' },
  { name: 'Office Furniture Multi-Buy', category: 'Office', qty: '10+', discount: '25%', stackable: true, validUntil: 'Mar 31, 2026', validColor: '#F59E0B', status: 'Expiring', statusColor: '#F59E0B', statusBg: '#F59E0B15' },
  { name: 'Dining Room Clearance', category: 'Dining', qty: '2+', discount: '10%', stackable: false, validUntil: '—', status: 'Paused', statusColor: 'hsl(var(--lu-muted-foreground))', statusBg: 'hsl(var(--lu-secondary))', dimmed: true },
];

const stackingRules = [
  { icon: 'check_circle', iconColor: '#22C55E', rule: 'Volume + Employee = Best Single', desc: 'When volume and employee discounts overlap, apply whichever is higher' },
  { icon: 'check_circle', iconColor: '#22C55E', rule: 'Promo + Volume = Stackable (Max 30%)', desc: 'Promotional and volume discounts can combine up to a 30% maximum cap' },
  { icon: 'block', iconColor: '#EF4444', rule: 'MAP Override = Never Stack', desc: 'MAP-enforced prices cannot be reduced by any discount combination' },
];

export default function AdvancedPricingManagerNew() {
  const [activeTab, setActiveTab] = useState('Volume Discounts');

  return (
    <div className="flex-1 overflow-y-auto p-7 flex flex-col gap-5">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div className="flex flex-col gap-1">
            <h1 className="font-primary text-[22px] font-bold text-foreground">Advanced Pricing Manager</h1>
            <p className="font-secondary text-[13px] text-muted-foreground">Volume discounts, promotions, MAP enforcement & stacking policies</p>
          </div>
          <div className="flex items-center gap-3">
            <button className="h-8 px-4 rounded-full border border-border text-foreground font-primary text-xs font-medium flex items-center gap-1.5">
              <span className="material-symbols-rounded text-sm">history</span>Price History
            </button>
            <button className="h-8 px-4 rounded-full bg-primary text-primary-foreground font-primary text-xs font-medium flex items-center gap-1.5">
              <span className="material-symbols-rounded text-sm">add</span>New Price Rule
            </button>
          </div>
        </div>

        {/* Stats Row */}
        <div className="grid grid-cols-4 gap-3">
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

        {/* Volume Discount Tiers Table */}
        <div className="bg-card border border-border rounded-xl overflow-hidden">
          <div className="flex items-center justify-between px-5 py-4 border-b border-border">
            <div className="flex items-center gap-2">
              <span className="material-symbols-rounded text-xl text-primary">layers</span>
              <span className="font-secondary text-[15px] font-semibold text-foreground">Volume Discount Tiers</span>
              <span className="font-primary text-[10px] font-semibold text-white bg-primary rounded-full px-2 py-0.5">12 rules</span>
            </div>
            <button className="px-3 py-1 rounded-md border border-border font-secondary text-[11px] font-medium text-foreground flex items-center gap-1">
              <span className="material-symbols-rounded text-sm">add</span>Add Tier
            </button>
          </div>
          <div className="flex items-center bg-secondary px-5 py-2.5">
            <span className="font-secondary text-[11px] font-semibold text-muted-foreground" style={{ width: 180 }}>Rule Name</span>
            <span className="font-secondary text-[11px] font-semibold text-muted-foreground" style={{ width: 120 }}>Category</span>
            <span className="font-secondary text-[11px] font-semibold text-muted-foreground text-center" style={{ width: 70 }}>Min Qty</span>
            <span className="font-secondary text-[11px] font-semibold text-muted-foreground text-center" style={{ width: 80 }}>Discount</span>
            <span className="font-secondary text-[11px] font-semibold text-muted-foreground text-center" style={{ width: 80 }}>Stackable</span>
            <span className="font-secondary text-[11px] font-semibold text-muted-foreground" style={{ width: 100 }}>Valid Until</span>
            <span className="font-secondary text-[11px] font-semibold text-muted-foreground text-center" style={{ width: 70 }}>Status</span>
            <span className="font-secondary text-[11px] font-semibold text-muted-foreground text-right flex-1">Actions</span>
          </div>
          {tierRows.map((r, i) => (
            <div key={r.name} className={`flex items-center px-5 py-3 ${i < tierRows.length - 1 ? 'border-b border-border' : ''} ${r.dimmed ? 'opacity-60' : ''}`}>
              <span className="font-secondary text-xs font-semibold text-foreground" style={{ width: 180 }}>{r.name}</span>
              <span className="font-secondary text-xs text-foreground" style={{ width: 120 }}>{r.category}</span>
              <span className="font-primary text-xs text-foreground text-center" style={{ width: 70 }}>{r.qty}</span>
              <span className="font-primary text-xs font-semibold text-center" style={{ width: 80, color: '#22C55E' }}>{r.discount}</span>
              <div className="flex justify-center" style={{ width: 80 }}>
                <div className={`w-8 h-4 rounded-full flex items-center px-0.5 ${r.stackable ? 'bg-primary justify-end' : 'bg-secondary justify-start'}`}>
                  <div className="w-3 h-3 rounded-full bg-white" />
                </div>
              </div>
              <span className="font-secondary text-xs" style={{ width: 100, color: r.validColor || 'hsl(var(--lu-foreground))' }}>{r.validUntil}</span>
              <div className="flex justify-center" style={{ width: 70 }}>
                <span className="font-secondary text-[10px] font-medium rounded-full px-2 py-0.5" style={{ background: r.statusBg, color: r.statusColor }}>{r.status}</span>
              </div>
              <div className="flex justify-end flex-1">
                <button className="w-7 h-7 rounded-md border border-border flex items-center justify-center">
                  <span className="material-symbols-rounded text-sm text-muted-foreground">edit</span>
                </button>
              </div>
            </div>
          ))}
        </div>

        {/* Stacking Policy */}
        <div className="bg-card border border-border rounded-xl overflow-hidden">
          <div className="flex items-center justify-between px-5 py-4 border-b border-border">
            <div className="flex items-center gap-2">
              <span className="material-symbols-rounded text-xl text-primary">stacks</span>
              <span className="font-secondary text-[15px] font-semibold text-foreground">Stacking Policy</span>
            </div>
            <button className="px-3 py-1 rounded-md border border-border font-secondary text-[11px] font-medium text-foreground flex items-center gap-1">
              <span className="material-symbols-rounded text-sm">settings</span>Configure
            </button>
          </div>
          <div className="p-5 flex flex-col gap-2">
            {stackingRules.map((r) => (
              <div key={r.rule} className="flex items-start gap-3 bg-secondary rounded-lg p-3">
                <span className="material-symbols-rounded text-lg shrink-0 mt-0.5" style={{ color: r.iconColor }}>{r.icon}</span>
                <div className="flex flex-col gap-0.5">
                  <span className="font-secondary text-xs font-semibold text-foreground">{r.rule}</span>
                  <span className="font-secondary text-[11px] text-muted-foreground">{r.desc}</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
  );
}
