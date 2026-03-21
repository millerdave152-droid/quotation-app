/**
 * BulkPriceUpdateNew.jsx
 * Screen 26 — Bulk Price Update (Pencil frame FWz58)
 * Fixed overlay, centered 520px card, adjustment form + preview table
 */

import { useState } from 'react';

const previewRows = [
  { product: 'Ashley Sectional', current: '$2,499', newPrice: '$2,749', change: '+$250' },
  { product: 'La-Z-Boy Recliner', current: '$1,599', newPrice: '$1,759', change: '+$160' },
  { product: 'Simmons Bed', current: '$899', newPrice: '$989', change: '+$90' },
];

export default function BulkPriceUpdateNew() {
  const [adjustmentType, setAdjustmentType] = useState('percentage');
  const [value, setValue] = useState('10');

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
      <div className="w-[520px] bg-card rounded-xl border border-border shadow-2xl overflow-hidden flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-border">
          <div className="flex items-center gap-2">
            <span className="material-symbols-rounded text-xl text-primary">price_change</span>
            <span className="font-primary text-base font-bold text-foreground">Bulk Price Update</span>
          </div>
          <button className="w-8 h-8 rounded-lg border border-border flex items-center justify-center">
            <span className="material-symbols-rounded text-lg text-muted-foreground">close</span>
          </button>
        </div>

        {/* Body */}
        <div className="p-5 flex flex-col gap-4 flex-1">
          {/* Info Banner */}
          <div className="flex items-center gap-2 rounded-lg px-4 py-3 bg-[#FF840010] border border-[#FF840030]">
            <span className="material-symbols-rounded text-lg text-primary">info</span>
            <span className="font-secondary text-xs text-foreground">3 products selected for price update</span>
          </div>

          {/* Adjustment Type */}
          <div className="flex flex-col gap-1.5">
            <label className="font-secondary text-xs font-medium text-foreground">Adjustment Type</label>
            <select value={adjustmentType} onChange={(e) => setAdjustmentType(e.target.value)}
              className="h-9 px-3 rounded-lg border border-border bg-background text-foreground font-secondary text-sm">
              <option value="percentage">Percentage Increase</option>
              <option value="fixed">Fixed Amount</option>
            </select>
          </div>

          {/* Adjustment Value */}
          <div className="flex flex-col gap-1.5">
            <label className="font-secondary text-xs font-medium text-foreground">Adjustment Value (%)</label>
            <input type="text" value={value} onChange={(e) => setValue(e.target.value)}
              className="h-9 px-3 rounded-lg border border-border bg-background text-foreground font-primary text-sm" />
          </div>

          {/* Preview */}
          <span className="font-secondary text-[13px] font-semibold text-foreground">Preview</span>
          <div className="rounded-lg border border-border overflow-hidden">
            <div className="flex items-center bg-secondary px-3 py-2">
              <span className="font-secondary text-[10px] font-semibold text-muted-foreground" style={{ width: 140 }}>Product</span>
              <span className="font-secondary text-[10px] font-semibold text-muted-foreground text-right" style={{ width: 70 }}>Current</span>
              <span className="font-secondary text-[10px] font-semibold text-muted-foreground text-right" style={{ width: 70 }}>New</span>
              <span className="font-secondary text-[10px] font-semibold text-muted-foreground text-right" style={{ width: 70 }}>Change</span>
            </div>
            {previewRows.map((r, i) => (
              <div key={r.product} className={`flex items-center px-3 py-2 ${i < previewRows.length - 1 ? 'border-b border-border' : ''}`}>
                <span className="font-secondary text-[11px] text-foreground" style={{ width: 140 }}>{r.product}</span>
                <span className="font-primary text-[11px] text-muted-foreground text-right" style={{ width: 70 }}>{r.current}</span>
                <span className="font-primary text-[11px] font-semibold text-foreground text-right" style={{ width: 70 }}>{r.newPrice}</span>
                <span className="font-primary text-[11px] font-semibold text-right" style={{ width: 70, color: '#22C55E' }}>{r.change}</span>
              </div>
            ))}
          </div>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end gap-2 px-5 py-4 border-t border-border">
          <button className="h-8 px-4 rounded-full border border-border text-foreground font-primary text-xs font-medium">Cancel</button>
          <button className="h-8 px-4 rounded-full bg-primary text-primary-foreground font-primary text-xs font-medium flex items-center gap-1.5">
            <span className="material-symbols-rounded text-sm">check</span>Apply Changes
          </button>
        </div>
      </div>
    </div>
  );
}
