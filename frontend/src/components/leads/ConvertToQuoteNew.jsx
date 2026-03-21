/**
 * ConvertToQuoteNew.jsx — Screen 44
 * TeleTime Design System · Convert Lead to Quote Modal
 * Design frame: 1uZ1J
 */

import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { AlertTriangle, Plus, X, Loader2 } from 'lucide-react';
import { convertToQuote } from './hooks/useLeads';
import { useToast } from '../ui/Toast';

/* ------------------------------------------------------------------ */
/*  Helpers                                                            */
/* ------------------------------------------------------------------ */

const formatBudget = (minCents, maxCents) => {
  if (!minCents && !maxCents) return '';
  const fmt = (c) => `$${(c / 100).toLocaleString()}`;
  if (minCents && maxCents) return `${fmt(minCents)}-${fmt(maxCents)}`;
  if (minCents) return `${fmt(minCents)}+`;
  return `Up to ${fmt(maxCents)}`;
};

/* ------------------------------------------------------------------ */
/*  Component                                                          */
/* ------------------------------------------------------------------ */

export default function ConvertToQuoteNew({ lead, onClose, onConvert }) {
  const navigate = useNavigate();
  const toast = useToast();
  const [notes, setNotes] = useState('');
  const [converting, setConverting] = useState(false);
  const [error, setError] = useState(null);

  const summaryFields = [
    { label: 'Customer:', value: lead?.contact_name || '\u2014', fw: 'font-medium' },
    { label: 'Email:', value: lead?.contact_email || '\u2014', fw: 'font-normal' },
    { label: 'Phone:', value: lead?.contact_phone || '\u2014', fw: 'font-normal' },
    { label: 'Timeline:', value: lead?.timeline || '\u2014', fw: 'font-semibold',
      color: lead?.timeline === 'ASAP' ? 'text-[#D97706]' : undefined },
  ];

  /* Build requirements list */
  const reqLines = [];
  if (lead?.requirements?.length > 0) {
    lead.requirements.forEach((r) => {
      const budget = formatBudget(r.budget_min_cents, r.budget_max_cents);
      reqLines.push(`\u2022 ${r.category}${r.quantity ? ` (${r.quantity})` : ''}${budget ? ` \u2014 ${budget}` : ''}`);
    });
  } else if (lead?.requirements_notes) {
    reqLines.push(lead.requirements_notes);
  }

  const handleConvert = async () => {
    setConverting(true);
    setError(null);
    try {
      const res = await convertToQuote(lead.id, { notes });
      const result = res.data || res;
      toast.success('Quote created successfully');
      onConvert?.(result.quotation || result);
      navigate('/quotes/new', {
        state: { quoteId: result.quotation?.id },
      });
    } catch (err) {
      setError(err.message || 'Failed to convert lead');
      toast.error(err.message || 'Failed to convert lead');
    } finally {
      setConverting(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50">
      <motion.div
        initial={{ opacity: 0, scale: 0.96 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ duration: 0.2 }}
        className="w-[480px] bg-card rounded-xl border border-border p-6 flex flex-col gap-4"
      >
        <h2 className="text-foreground font-primary text-[18px] font-bold">
          Convert Lead to Quote
        </h2>

        {/* Summary card */}
        <div className="flex flex-col gap-2 bg-background border border-border rounded-lg p-4">
          {summaryFields.map((f) => (
            <div key={f.label} className="flex items-center gap-2">
              <span className="text-muted-foreground font-secondary text-[12px] w-[80px] shrink-0">
                {f.label}
              </span>
              <span className={`font-secondary text-[12px] ${f.fw} ${f.color || 'text-foreground'}`}>
                {f.value}
              </span>
            </div>
          ))}
          {reqLines.length > 0 && (
            <>
              <span className="text-muted-foreground font-secondary text-[12px]">Requirements:</span>
              <div className="flex flex-col gap-1 pl-3">
                {reqLines.map((r, i) => (
                  <span key={i} className="text-foreground font-secondary text-[12px]">{r}</span>
                ))}
              </div>
            </>
          )}
        </div>

        {/* Warning notice — only when no existing customer */}
        {!lead?.customer_id && (
          <div className="flex items-center gap-2 bg-[#FEF3C7] rounded-lg p-3">
            <AlertTriangle size={16} className="text-[#D97706] shrink-0" />
            <span className="text-[#D97706] font-secondary text-[12px]">
              A new customer record will be created
            </span>
          </div>
        )}

        {/* Error */}
        {error && (
          <div className="flex items-center gap-2 bg-[#FEE2E2] rounded-lg p-3">
            <AlertTriangle size={16} className="text-[#EF4444] shrink-0" />
            <span className="text-[#EF4444] font-secondary text-[12px]">{error}</span>
          </div>
        )}

        {/* Quote Notes */}
        <div className="flex flex-col gap-1.5">
          <span className="text-foreground font-primary text-sm font-medium">Quote Notes</span>
          <textarea
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="Optional notes for the quote..."
            rows={3}
            className="w-full px-4 py-2 rounded-lu-md border border-input bg-background text-foreground font-secondary text-sm resize-none outline-none placeholder:text-muted-foreground"
          />
        </div>

        {/* Buttons */}
        <div className="flex items-center gap-3">
          <motion.button
            whileHover={{ scale: 1.02 }}
            whileTap={{ scale: 0.97 }}
            onClick={onClose}
            disabled={converting}
            className="flex items-center justify-center gap-1.5 flex-1 h-10 rounded-lu-pill bg-background border border-border text-foreground font-primary text-sm font-medium shadow-lu-sm disabled:opacity-50"
          >
            <X size={16} />
            Cancel
          </motion.button>
          <motion.button
            whileHover={{ scale: 1.02 }}
            whileTap={{ scale: 0.97 }}
            onClick={handleConvert}
            disabled={converting}
            className="flex items-center justify-center gap-1.5 flex-1 h-10 rounded-lu-pill bg-primary text-primary-foreground font-primary text-sm font-medium disabled:opacity-50"
          >
            {converting ? <Loader2 size={16} className="animate-spin" /> : <Plus size={16} />}
            {converting ? 'Converting...' : 'Create Quote'}
          </motion.button>
        </div>
      </motion.div>
    </div>
  );
}
