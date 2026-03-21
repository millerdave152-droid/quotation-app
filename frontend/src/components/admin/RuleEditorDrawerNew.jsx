/**
 * RuleEditorDrawerNew.jsx
 * Screen 36 — Rule Editor Drawer (Pencil frame Uj9Ul)
 * Fixed right-edge panel, rule form fields, parameters
 */

import { useState } from 'react';

export default function RuleEditorDrawerNew() {
  const [active, setActive] = useState(true);

  return (
    <div className="fixed right-0 top-0 h-screen w-[560px] bg-card border-l border-border z-50 flex flex-col">
      {/* Header */}
      <div className="flex items-center justify-between px-6 py-5 border-b border-border shrink-0">
        <span className="font-primary text-lg font-bold text-foreground">Edit Rule</span>
        <button className="w-8 h-8 rounded-lg border border-border flex items-center justify-center">
          <span className="material-symbols-rounded text-lg text-muted-foreground">close</span>
        </button>
      </div>

      {/* Body */}
      <div className="flex-1 overflow-y-auto px-6 py-5 flex flex-col gap-4">
        {/* Rule Code */}
        <div className="flex flex-col gap-1.5">
          <label className="font-secondary text-xs font-medium text-muted-foreground">Rule Code</label>
          <input type="text" defaultValue="VEL-001" className="h-10 px-3 rounded-lg border border-border bg-background text-foreground font-primary text-sm" />
        </div>

        {/* Category */}
        <div className="flex flex-col gap-1.5">
          <label className="font-secondary text-xs font-medium text-muted-foreground">Category</label>
          <select className="h-10 px-3 rounded-lg border border-border bg-background text-foreground font-secondary text-sm">
            <option>Velocity</option>
            <option>Amount</option>
            <option>Pattern</option>
          </select>
        </div>

        {/* Rule Name */}
        <div className="flex flex-col gap-1.5">
          <label className="font-secondary text-xs font-medium text-muted-foreground">Rule Name</label>
          <input type="text" defaultValue="Rapid Transaction Velocity" className="h-10 px-3 rounded-lg border border-border bg-background text-foreground font-secondary text-sm" />
        </div>

        {/* Description */}
        <div className="flex flex-col gap-1.5">
          <label className="font-secondary text-xs font-medium text-muted-foreground">Description</label>
          <textarea defaultValue="Detects rapid consecutive transactions that may indicate fraudulent activity or system abuse."
            className="h-20 px-3 py-2 rounded-lg border border-border bg-background text-foreground font-secondary text-sm resize-none" />
        </div>

        {/* Severity + Action */}
        <div className="grid grid-cols-2 gap-4">
          <div className="flex flex-col gap-1.5">
            <label className="font-secondary text-xs font-medium text-muted-foreground">Severity</label>
            <select className="h-10 px-3 rounded-lg border border-border bg-background text-foreground font-secondary text-sm">
              <option>High</option>
              <option>Medium</option>
              <option>Low</option>
            </select>
          </div>
          <div className="flex flex-col gap-1.5">
            <label className="font-secondary text-xs font-medium text-muted-foreground">Action</label>
            <select className="h-10 px-3 rounded-lg border border-border bg-background text-foreground font-secondary text-sm">
              <option>Block</option>
              <option>Alert</option>
              <option>Log</option>
            </select>
          </div>
        </div>

        {/* Risk Points + Weight */}
        <div className="grid grid-cols-2 gap-4">
          <div className="flex flex-col gap-1.5">
            <label className="font-secondary text-xs font-medium text-muted-foreground">Risk Points (0-100)</label>
            <input type="text" defaultValue="75" className="h-10 px-3 rounded-lg border border-border bg-background text-foreground font-primary text-sm" />
          </div>
          <div className="flex flex-col gap-1.5">
            <label className="font-secondary text-xs font-medium text-muted-foreground">Weight (0-25)</label>
            <input type="text" defaultValue="12" className="h-10 px-3 rounded-lg border border-border bg-background text-foreground font-primary text-sm" />
          </div>
        </div>

        {/* Divider */}
        <div className="border-t border-border" />

        {/* Parameters */}
        <span className="font-secondary text-[14px] font-semibold text-foreground">Parameters (Velocity)</span>

        <div className="grid grid-cols-2 gap-4">
          <div className="flex flex-col gap-1.5">
            <label className="font-secondary text-xs font-medium text-muted-foreground">Max Count</label>
            <input type="text" defaultValue="10" className="h-10 px-3 rounded-lg border border-border bg-background text-foreground font-primary text-sm" />
          </div>
          <div className="flex flex-col gap-1.5">
            <label className="font-secondary text-xs font-medium text-muted-foreground">Window (sec)</label>
            <input type="text" defaultValue="60" className="h-10 px-3 rounded-lg border border-border bg-background text-foreground font-primary text-sm" />
          </div>
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div className="flex flex-col gap-1.5">
            <label className="font-secondary text-xs font-medium text-muted-foreground">Applies To</label>
            <select className="h-10 px-3 rounded-lg border border-border bg-background text-foreground font-secondary text-sm">
              <option>All Transactions</option>
              <option>POS Only</option>
              <option>Online Only</option>
            </select>
          </div>
          <div className="flex flex-col gap-1.5">
            <label className="font-secondary text-xs font-medium text-muted-foreground">Max Declines</label>
            <input type="text" defaultValue="3" className="h-10 px-3 rounded-lg border border-border bg-background text-foreground font-primary text-sm" />
          </div>
        </div>

        {/* Active Toggle */}
        <div className="flex items-center gap-3">
          <button onClick={() => setActive(!active)}
            className={`w-9 h-5 rounded-full flex items-center px-0.5 transition-colors ${active ? 'bg-primary justify-end' : 'bg-secondary justify-start'}`}>
            <div className="w-4 h-4 rounded-full bg-white" />
          </button>
          <span className="font-secondary text-[13px] text-foreground">Active</span>
        </div>
      </div>

      {/* Footer */}
      <div className="flex items-center justify-end gap-2.5 px-6 py-4 border-t border-border shrink-0">
        <button className="h-8 px-4 rounded-full border border-border text-foreground font-primary text-xs font-medium">Cancel</button>
        <button className="h-8 px-4 rounded-full bg-primary text-primary-foreground font-primary text-xs font-medium">Save Rule</button>
      </div>
    </div>
  );
}
