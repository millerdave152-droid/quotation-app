/**
 * LeadImportStep1New.jsx — Screen 71
 * TeleTime Design System · Import Leads from CSV (Step 1)
 * Design frame: PDlke
 */

import { useState } from 'react';
import { motion } from 'framer-motion';

/* ------------------------------------------------------------------ */
/*  Data                                                               */
/* ------------------------------------------------------------------ */

const steps = [
  { num: 1, label: 'Upload' },
  { num: 2, label: 'Map Fields' },
  { num: 3, label: 'Review' },
  { num: 4, label: 'Complete' },
];

/* ------------------------------------------------------------------ */
/*  Component                                                          */
/* ------------------------------------------------------------------ */

export default function LeadImportStep1New() {
  const [dragOver, setDragOver] = useState(false);

  return (
    <div className="fixed inset-0 bg-black/30 flex items-center justify-center z-50">
      <motion.div
        initial={{ opacity: 0, y: -12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.15 }}
        className="w-[560px] bg-card rounded-xl border border-border flex flex-col gap-5 p-6"
        style={{ boxShadow: '0 8px 24px #00000022' }}
      >
        {/* Header */}
        <h2 className="text-foreground font-primary text-[20px] font-bold">Import Leads from CSV</h2>

        {/* Stepper */}
        <div className="flex items-center justify-center gap-6">
          {steps.map((step, i) => (
            <div key={step.num} className="flex items-center gap-2">
              {i > 0 && (
                <div className="w-8 h-px bg-border" />
              )}
              <div
                className="w-6 h-6 rounded-full flex items-center justify-center font-primary text-[11px] font-bold shrink-0"
                style={{
                  backgroundColor: step.num === 1 ? 'var(--primary)' : 'var(--secondary)',
                  color: step.num === 1 ? 'var(--primary-foreground)' : 'var(--muted-foreground)',
                }}
              >
                {step.num}
              </div>
              <span
                className="font-secondary text-[12px]"
                style={{
                  color: step.num === 1 ? 'var(--foreground)' : 'var(--muted-foreground)',
                  fontWeight: step.num === 1 ? 600 : 'normal',
                }}
              >
                {step.label}
              </span>
            </div>
          ))}
        </div>

        {/* Drop Zone */}
        <div
          className="flex flex-col items-center justify-center gap-3 h-[180px] rounded-xl transition-colors cursor-pointer"
          style={{
            border: dragOver ? '2px dashed var(--primary)' : '2px dashed var(--border)',
            backgroundColor: dragOver ? '#FF840005' : 'transparent',
          }}
          onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
          onDragLeave={() => setDragOver(false)}
          onDrop={(e) => { e.preventDefault(); setDragOver(false); }}
        >
          <span className="material-symbols-rounded text-[32px] text-muted-foreground">upload</span>
          <span className="text-foreground font-secondary text-sm font-medium">
            Drag and drop your CSV file here
          </span>
          <span className="text-muted-foreground font-secondary text-[12px]">
            or click to browse (.csv, max 5MB)
          </span>
        </div>

        {/* Template Download */}
        <button className="w-full h-10 rounded-lg border border-border text-foreground font-primary text-sm font-medium hover:bg-secondary transition-colors">
          Download CSV Template
        </button>

        {/* Actions */}
        <div className="flex items-center justify-end gap-3 pt-1">
          <button className="h-10 px-5 rounded-lg border border-border text-foreground font-primary text-sm font-medium">
            Cancel
          </button>
          <button className="h-10 px-5 rounded-lg bg-primary text-primary-foreground font-primary text-sm font-semibold">
            Next: Map Fields
          </button>
        </div>
      </motion.div>
    </div>
  );
}
