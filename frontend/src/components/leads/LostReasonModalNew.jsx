/**
 * LostReasonModalNew.jsx — Screen 70
 * TeleTime Design System · Mark Lead as Lost
 * Design frame: O1Bsq
 */

import { useState } from 'react';
import { motion } from 'framer-motion';

/* ------------------------------------------------------------------ */
/*  Data                                                               */
/* ------------------------------------------------------------------ */

const reasons = [
  'Price too high', 'Competitor',
  'Bad timing', 'No response',
  'Budget constraints', 'Changed mind',
  'Not a good fit', 'Project delayed',
  'Duplicate', 'Spam',
];

/* ------------------------------------------------------------------ */
/*  Component                                                          */
/* ------------------------------------------------------------------ */

export default function LostReasonModalNew() {
  const [selectedReason, setSelectedReason] = useState(null);
  const [customReason, setCustomReason] = useState('');

  return (
    <div className="fixed inset-0 bg-black/30 flex items-center justify-center z-50">
      <motion.div
        initial={{ opacity: 0, y: -12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.15 }}
        className="w-[480px] bg-card rounded-xl border border-border flex flex-col gap-5 p-6"
        style={{ boxShadow: '0 8px 24px #00000022' }}
      >
        {/* Header */}
        <div className="flex flex-col gap-1">
          <h2 className="text-foreground font-primary text-[20px] font-bold">Mark Lead as Lost</h2>
          <p className="text-muted-foreground font-secondary text-[13px]">Why was this lead lost?</p>
        </div>

        {/* Reason Grid */}
        <div className="grid grid-cols-2 gap-2.5">
          {reasons.map((reason) => (
            <button
              key={reason}
              onClick={() => setSelectedReason(reason)}
              className="h-10 rounded-full font-secondary text-[13px] font-medium transition-all"
              style={{
                backgroundColor: selectedReason === reason ? '#EF444415' : 'transparent',
                border: selectedReason === reason ? '1.5px solid #EF4444' : '1.5px solid var(--border)',
                color: selectedReason === reason ? '#EF4444' : 'var(--foreground)',
              }}
            >
              {reason}
            </button>
          ))}
        </div>

        {/* Custom Reason */}
        <div className="flex flex-col gap-1.5">
          <span className="text-foreground font-secondary text-sm font-medium">Custom Reason</span>
          <textarea
            rows={3}
            value={customReason}
            onChange={(e) => setCustomReason(e.target.value)}
            placeholder="Enter a custom reason..."
            className="px-4 py-3 rounded-lg bg-background border border-input text-foreground font-secondary text-sm outline-none resize-none placeholder:text-muted-foreground"
          />
        </div>

        {/* Actions */}
        <div className="flex items-center justify-between pt-1">
          <button className="h-10 px-5 rounded-lg border border-border text-foreground font-primary text-sm font-medium">
            Skip (No Reason)
          </button>
          <button className="h-10 px-5 rounded-lg bg-destructive text-foreground font-primary text-sm font-semibold">
            Mark as Lost
          </button>
        </div>
      </motion.div>
    </div>
  );
}
