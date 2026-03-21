/**
 * CommissionSplitModalNew.jsx
 * Screen 28 — Commission Split Modal (Pencil frame pCOLt)
 * Fixed overlay, centered 560px card, transaction info,
 * member split cards with progress bars, summary
 */

import { useState } from 'react';

export default function CommissionSplitModalNew() {
  const [split] = useState({ jane: 70, mike: 30 });

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
      <div className="w-[560px] bg-background rounded-xl overflow-hidden flex flex-col shadow-2xl">
        {/* Header */}
        <div className="flex items-center justify-between px-6 h-14 bg-card">
          <div className="flex items-center gap-2.5">
            <span className="material-symbols-rounded text-2xl text-primary">group</span>
            <span className="font-secondary text-base font-semibold text-foreground">Split Commission</span>
          </div>
          <button className="w-8 h-8 rounded-lg border border-border flex items-center justify-center">
            <span className="material-symbols-rounded text-lg text-muted-foreground">close</span>
          </button>
        </div>
        <div className="h-px bg-border" />

        {/* Body */}
        <div className="p-6 flex flex-col gap-4 flex-1">
          {/* Transaction Info */}
          <div className="bg-card rounded-[10px] p-3.5 flex items-center justify-between">
            <div className="flex flex-col gap-0.5">
              <span className="font-primary text-[13px] font-semibold text-foreground">TXN-2026-04820</span>
              <span className="font-secondary text-xs text-muted-foreground">Feb 28, 2026 · $3,245.00</span>
            </div>
            <div className="flex flex-col items-end gap-0.5">
              <span className="font-secondary text-[11px] text-muted-foreground">Total Commission</span>
              <span className="font-primary text-base font-bold" style={{ color: '#22C55E' }}>$146.03</span>
            </div>
          </div>

          {/* Commission Split Label */}
          <span className="font-secondary text-[14px] font-semibold text-foreground">Commission Split</span>

          {/* Member 1 — Jane Doe (highlighted) */}
          <div className="bg-card rounded-xl border-2 border-primary p-4 flex flex-col gap-2.5">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 rounded-full bg-primary flex items-center justify-center">
                  <span className="font-primary text-[10px] font-semibold text-white">JD</span>
                </div>
                <span className="font-secondary text-[14px] font-medium text-foreground">Jane Doe (You)</span>
              </div>
              <span className="font-primary text-xs font-bold text-white bg-primary rounded-lg px-3 py-1">{split.jane}%</span>
            </div>
            <div className="h-1.5 rounded-full bg-secondary">
              <div className="h-1.5 rounded-full bg-primary" style={{ width: `${split.jane}%` }} />
            </div>
            <span className="font-secondary text-[13px] font-semibold text-primary">Earnings: $102.22</span>
          </div>

          {/* Member 2 — Mike Smith */}
          <div className="bg-card rounded-xl border border-border p-4 flex flex-col gap-2.5">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 rounded-full flex items-center justify-center" style={{ background: '#3B82F6' }}>
                  <span className="font-primary text-[10px] font-semibold text-white">MS</span>
                </div>
                <span className="font-secondary text-[14px] font-medium text-foreground">Mike Smith</span>
              </div>
              <span className="font-primary text-xs font-semibold text-foreground bg-secondary rounded-lg px-3 py-1">{split.mike}%</span>
            </div>
            <div className="h-1.5 rounded-full bg-secondary">
              <div className="h-1.5 rounded-full" style={{ width: `${split.mike}%`, background: '#3B82F6' }} />
            </div>
            <span className="font-secondary text-[13px] font-semibold" style={{ color: '#3B82F6' }}>Earnings: $43.81</span>
          </div>

          {/* Add Member */}
          <button className="h-8 px-4 text-muted-foreground font-secondary text-xs font-medium flex items-center gap-1.5 hover:text-foreground transition-colors w-fit">
            <span className="material-symbols-rounded text-sm">person_add</span>Add Team Member
          </button>

          {/* Divider */}
          <div className="h-px bg-border" />

          {/* Summary Bar */}
          <div className="rounded-[10px] h-11 px-4 flex items-center justify-between bg-[#22C55E10] border border-[#22C55E30]">
            <span className="font-secondary text-[13px] font-medium text-foreground">Total Allocated</span>
            <span className="font-primary text-[14px] font-bold" style={{ color: '#22C55E' }}>100% — $146.03</span>
          </div>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end gap-3 px-6 py-4 border-t border-border">
          <button className="h-9 px-5 rounded-full border border-border text-foreground font-primary text-xs font-medium">Cancel</button>
          <button className="h-9 px-5 rounded-full bg-primary text-primary-foreground font-primary text-xs font-medium flex items-center gap-1.5">
            <span className="material-symbols-rounded text-sm">check</span>Confirm Split
          </button>
        </div>
      </div>
    </div>
  );
}
