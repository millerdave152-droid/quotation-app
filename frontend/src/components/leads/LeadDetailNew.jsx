/**
 * LeadDetailNew.jsx — Screen 16
 * TeleTime Design System · Lead Detail View
 * Design frame: bwg9K
 */

import { useState } from 'react';
import { motion } from 'framer-motion';
import {
  Sparkles,
  Phone,
  Mail,
  Plus,
  X,
  Loader2,
  Copy,
  Check,
} from 'lucide-react';
import {
  useLead,
  addLeadActivity,
  generateAISummary,
  generateProductSuggestions,
  generateFollowUpDraft,
} from './hooks/useLeads';
import { useToast } from '../ui/Toast';

/* ------------------------------------------------------------------ */
/*  Style maps                                                         */
/* ------------------------------------------------------------------ */

const STATUS_STYLES = {
  new: { bg: 'bg-primary', text: 'text-primary-foreground', label: 'New' },
  contacted: { bg: 'bg-success', text: 'text-success-foreground', label: 'Contacted' },
  qualified: { bg: 'bg-info', text: 'text-info-foreground', label: 'Qualified' },
  quote_created: { bg: 'bg-[#DBEAFE]', text: 'text-[#3B82F6]', label: 'Quote Created' },
  converted: { bg: 'bg-success', text: 'text-success-foreground', label: 'Converted' },
  lost: { bg: 'bg-error', text: 'text-error-foreground', label: 'Lost' },
};

const PRIORITY_STYLES = {
  hot: { bg: '#FEE2E2', color: '#EF4444' },
  warm: { bg: '#FEF3C7', color: '#D97706' },
  cold: { bg: 'var(--secondary)', color: 'var(--muted-foreground)' },
};

const SCORE_COLORS = {
  A: { value: '#16A34A', bg: '#DCFCE7' },
  B: { value: '#3B82F6', bg: '#DBEAFE' },
  C: { value: '#D97706', bg: '#FEF3C7' },
  D: { value: '#EF4444', bg: '#FEE2E2' },
};

const ACTIVITY_STYLES = {
  status_change: { dotColor: 'bg-info-foreground', typeBg: 'bg-info', typeText: 'text-info-foreground', label: 'Status Change' },
  call: { dotColor: 'bg-[#16A34A]', typeBg: 'bg-[#DCFCE7]', typeText: 'text-[#16A34A]', label: 'Phone Call' },
  email: { dotColor: 'bg-[#3B82F6]', typeBg: 'bg-[#DBEAFE]', typeText: 'text-[#3B82F6]', label: 'Email' },
  note: { dotColor: 'bg-[#D97706]', typeBg: 'bg-[#FEF3C7]', typeText: 'text-[#D97706]', label: 'Note' },
  converted_to_quote: { dotColor: 'bg-primary', typeBg: 'bg-[#FFF7ED]', typeText: 'text-primary', label: 'Converted' },
  created: { dotColor: 'bg-primary', typeBg: 'bg-[#FFF7ED]', typeText: 'text-primary', label: 'Lead Created' },
};

const TIMELINE_PILL = {
  ASAP: { bg: '#FEF3C7', color: '#D97706' },
  '1-2 Weeks': { bg: '#FEF3C7', color: '#D97706' },
  '1-3 Mo.': { bg: 'var(--secondary)', color: 'var(--muted-foreground)' },
  '3-6 Mo.': { bg: 'var(--secondary)', color: 'var(--muted-foreground)' },
};

/* ------------------------------------------------------------------ */
/*  Helpers                                                            */
/* ------------------------------------------------------------------ */

const scoreGrade = (score) => {
  if (!score && score !== 0) return 'D';
  if (score >= 75) return 'A';
  if (score >= 50) return 'B';
  if (score >= 25) return 'C';
  return 'D';
};

const relativeTime = (dateStr) => {
  if (!dateStr) return '';
  const d = new Date(dateStr);
  const now = new Date();
  const diffMin = Math.floor((now - d) / 60000);
  if (diffMin < 1) return 'Just now';
  if (diffMin < 60) return `${diffMin}m ago`;
  const diffHr = Math.floor(diffMin / 60);
  if (diffHr < 24) return `${diffHr}h ago`;
  const diffDay = Math.floor(diffHr / 24);
  if (diffDay === 1) return 'Yesterday';
  if (diffDay < 7) return `${diffDay}d ago`;
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
};

const formatFollowUp = (dateStr) => {
  if (!dateStr) return { text: '\u2014', color: undefined, bold: false };
  const d = new Date(dateStr);
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const target = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  const diff = Math.floor((target - today) / 86400000);
  if (diff < 0) return { text: 'Overdue', color: '#EF4444', bold: true };
  if (diff === 0) return { text: 'Today', color: '#D97706', bold: true };
  if (diff === 1) return { text: 'Tomorrow', color: '#3B82F6', bold: false };
  return {
    text: d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }),
    color: undefined,
    bold: false,
  };
};

const formatBudget = (minCents, maxCents) => {
  if (!minCents && !maxCents) return '\u2014';
  const fmt = (c) => `$${(c / 100).toLocaleString()}`;
  if (minCents && maxCents) return `${fmt(minCents)} \u2014 ${fmt(maxCents)}`;
  if (minCents) return `${fmt(minCents)}+`;
  return `Up to ${fmt(maxCents)}`;
};

const parseBrands = (brands) => {
  if (!brands) return [];
  if (Array.isArray(brands)) return brands;
  try { return JSON.parse(brands); } catch { return [brands]; }
};

/* ------------------------------------------------------------------ */
/*  Info Grid                                                          */
/* ------------------------------------------------------------------ */

function InfoGrid({ items }) {
  return (
    <div className="grid grid-cols-2 gap-x-6 gap-y-2">
      {items.map((item) => (
        <div key={item.label} className="flex flex-col gap-1">
          <span className="text-muted-foreground font-secondary text-[11px]">
            {item.label}
          </span>
          {item.pill ? (
            <span
              className="inline-flex items-center w-fit px-2 py-0.5 rounded-full font-primary text-[10px] font-semibold"
              style={{ backgroundColor: item.pillBg, color: item.pillText }}
            >
              {item.value}
            </span>
          ) : (
            <span
              className={`font-secondary text-[13px] ${
                item.valueBold ? 'font-semibold' : ''
              }`}
              style={item.valueColor ? { color: item.valueColor } : undefined}
            >
              {item.value}
            </span>
          )}
        </div>
      ))}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Component                                                          */
/* ------------------------------------------------------------------ */

export default function LeadDetailNew({ leadId, onClose, onConvert }) {
  const toast = useToast();
  const { lead, loading, error, refresh } = useLead(leadId);

  const [aiLoading, setAiLoading] = useState({ summary: false, products: false, followup: false });
  const [aiResults, setAiResults] = useState({});
  const [noteText, setNoteText] = useState('');
  const [showNoteInput, setShowNoteInput] = useState(false);
  const [noteSaving, setNoteSaving] = useState(false);
  const [copied, setCopied] = useState(false);

  /* ── Loading / Error states ── */
  if (loading) {
    return (
      <motion.div
        initial={{ x: 100, opacity: 0 }}
        animate={{ x: 0, opacity: 1 }}
        className="w-[900px] h-full bg-background flex items-center justify-center shadow-2xl"
      >
        <Loader2 size={32} className="animate-spin text-muted-foreground" />
      </motion.div>
    );
  }

  if (error || !lead) {
    return (
      <motion.div
        initial={{ x: 100, opacity: 0 }}
        animate={{ x: 0, opacity: 1 }}
        className="w-[900px] h-full bg-background flex flex-col items-center justify-center gap-3 shadow-2xl"
      >
        <span className="font-secondary text-sm text-muted-foreground">
          {error || 'Lead not found'}
        </span>
        <button
          onClick={onClose}
          className="h-10 px-5 rounded-lg border border-border text-foreground font-primary text-sm font-medium"
        >
          Close
        </button>
      </motion.div>
    );
  }

  /* ── Derived data ── */
  const grade = scoreGrade(lead.lead_score);
  const sc = SCORE_COLORS[grade];
  const st = STATUS_STYLES[lead.status] || STATUS_STYLES.new;
  const pr = PRIORITY_STYLES[lead.priority] || PRIORITY_STYLES.cold;
  const fu = formatFollowUp(lead.follow_up_date);
  const tlPill = TIMELINE_PILL[lead.timeline];

  const contactInfo = [
    { label: 'Email', value: lead.contact_email || '\u2014' },
    { label: 'Phone', value: lead.contact_phone || '\u2014' },
    { label: 'Preferred Method', value: lead.preferred_contact || 'Phone' },
    { label: 'Best Time', value: lead.best_time || '\u2014' },
  ];

  const sourceInfo = [
    { label: 'Source', value: lead.source || '\u2014' },
    { label: 'Source Details', value: lead.source_details || '\u2014' },
  ];

  const timingInfo = [
    { label: 'Inquiry Reason', value: lead.inquiry_reason || '\u2014' },
    ...(tlPill
      ? [{ label: 'Timeline', value: lead.timeline, pill: true, pillBg: tlPill.bg, pillText: tlPill.color }]
      : [{ label: 'Timeline', value: lead.timeline || '\u2014' }]),
    { label: 'Move-in Date', value: lead.move_in_date
        ? new Date(lead.move_in_date).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
        : '\u2014' },
    { label: 'Follow-up Date', value: fu.text, valueColor: fu.color, valueBold: fu.bold },
  ];

  const reqs = lead.requirements || [];
  const activities = lead.activities || [];

  /* ── AI Actions ── */
  const handleAI = async (type, fn) => {
    setAiLoading((p) => ({ ...p, [type]: true }));
    try {
      const res = await fn();
      const data = res.data || res;
      setAiResults((p) => ({ ...p, [type]: data }));
    } catch (err) {
      toast.error(err.message || 'AI request failed');
    } finally {
      setAiLoading((p) => ({ ...p, [type]: false }));
    }
  };

  /* ── Add Note ── */
  const handleAddNote = async () => {
    if (!noteText.trim()) return;
    setNoteSaving(true);
    try {
      await addLeadActivity(leadId, 'note', noteText.trim());
      toast.success('Note added');
      setNoteText('');
      setShowNoteInput(false);
      refresh();
    } catch {
      toast.error('Failed to add note');
    } finally {
      setNoteSaving(false);
    }
  };

  /* ── Copy draft ── */
  const handleCopyDraft = (text) => {
    navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <motion.div
      initial={{ x: 100, opacity: 0 }}
      animate={{ x: 0, opacity: 1 }}
      transition={{ duration: 0.2 }}
      className="w-[900px] h-full bg-background flex flex-col overflow-hidden shadow-2xl"
    >
      {/* Header */}
      <div className="flex items-center justify-between px-6 py-4 border-b border-border shrink-0">
        <div className="flex items-center gap-3">
          <h1 className="text-foreground font-primary text-[20px] font-bold">
            {lead.contact_name}
          </h1>
          <span className="inline-flex items-center px-2 py-0.5 rounded-md bg-secondary font-primary text-[11px] font-medium text-muted-foreground">
            {lead.lead_number}
          </span>
        </div>
        <div className="flex items-center gap-2">
          <motion.button
            whileHover={{ scale: 1.02 }}
            whileTap={{ scale: 0.97 }}
            onClick={() => toast.info('Edit form coming soon')}
            className="flex items-center gap-1.5 h-10 px-4 rounded-lu-pill bg-background border border-border text-foreground font-primary text-sm font-medium shadow-lu-sm"
          >
            Edit
          </motion.button>
          <motion.button
            whileHover={{ scale: 1.02 }}
            whileTap={{ scale: 0.97 }}
            onClick={() => onConvert?.(lead)}
            className="flex items-center gap-1.5 h-10 px-4 rounded-lu-pill bg-primary text-primary-foreground font-primary text-sm font-medium"
          >
            Convert to Quote
          </motion.button>
          <button
            onClick={() => onClose?.()}
            className="flex items-center gap-1.5 h-10 px-4 rounded-lu-pill text-foreground font-primary text-sm font-medium"
          >
            <X size={16} />
            Close
          </button>
        </div>
      </div>

      {/* Badges Row */}
      <div className="flex items-center gap-2 px-6 py-3 border-b border-border shrink-0">
        <span className={`inline-flex items-center px-2.5 py-1 rounded-full ${st.bg} ${st.text} font-primary text-xs font-semibold`}>
          {st.label}
        </span>
        <span
          className="inline-flex items-center px-2.5 py-1 rounded-full font-primary text-xs font-bold"
          style={{ backgroundColor: pr.bg, color: pr.color }}
        >
          {(lead.priority || '').toUpperCase()}
        </span>
        {lead.lead_score != null && (
          <span
            className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full font-primary text-xs font-semibold"
            style={{ backgroundColor: sc.bg, color: sc.value }}
          >
            Score: {lead.lead_score}
            <span className="font-bold">{grade}</span>
          </span>
        )}
      </div>

      {/* Body */}
      <div className="flex flex-1 overflow-hidden">
        {/* ── Left Column ── */}
        <div className="flex-1 flex flex-col gap-5 p-6 overflow-auto">
          {/* Contact Information */}
          <motion.div
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.05, duration: 0.3 }}
            className="flex flex-col gap-3 p-4 bg-card border border-border rounded-lg"
          >
            <span className="text-foreground font-primary text-sm font-semibold">
              Contact Information
            </span>
            <InfoGrid items={contactInfo} />
          </motion.div>

          {/* Lead Source */}
          <motion.div
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.1, duration: 0.3 }}
            className="flex flex-col gap-3 p-4 bg-card border border-border rounded-lg"
          >
            <span className="text-foreground font-primary text-sm font-semibold">
              Lead Source
            </span>
            <InfoGrid items={sourceInfo} />
          </motion.div>

          {/* Context & Timing */}
          <motion.div
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.15, duration: 0.3 }}
            className="flex flex-col gap-3 p-4 bg-card border border-border rounded-lg"
          >
            <span className="text-foreground font-primary text-sm font-semibold">
              Context &amp; Timing
            </span>
            <InfoGrid items={timingInfo} />
          </motion.div>

          {/* Requirements */}
          <motion.div
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.2, duration: 0.3 }}
            className="flex flex-col gap-3 p-4 bg-card border border-border rounded-lg"
          >
            <span className="text-foreground font-primary text-sm font-semibold">
              Requirements
            </span>
            {reqs.length === 0 && lead.requirements_notes && (
              <span className="text-muted-foreground font-secondary text-[13px]">
                {lead.requirements_notes}
              </span>
            )}
            {reqs.length === 0 && !lead.requirements_notes && (
              <span className="text-muted-foreground font-secondary text-[13px]">
                No requirements recorded
              </span>
            )}
            {reqs.map((req) => {
              const brands = parseBrands(req.brand_preferences);
              return (
                <div
                  key={req.id}
                  className="flex flex-col gap-1.5 p-3 bg-background border border-border rounded-md"
                >
                  <div className="flex items-center justify-between">
                    <span className="text-foreground font-secondary text-[13px] font-semibold">
                      {req.category}{req.subcategory ? ` \u2014 ${req.subcategory}` : ''}
                    </span>
                    <span className="text-muted-foreground font-secondary text-[11px]">
                      Qty: {req.quantity || 1}
                    </span>
                  </div>
                  <span className="text-muted-foreground font-secondary text-xs">
                    Budget: {formatBudget(req.budget_min_cents, req.budget_max_cents)}
                  </span>
                  {brands.length > 0 && (
                    <div className="flex gap-1 flex-wrap">
                      {brands.map((b) => (
                        <span
                          key={b}
                          className="inline-flex items-center px-1.5 py-0.5 rounded-full bg-secondary text-secondary-foreground font-secondary text-[10px]"
                        >
                          {b}
                        </span>
                      ))}
                    </div>
                  )}
                  {req.notes && (
                    <span className="text-muted-foreground font-secondary text-[11px]">{req.notes}</span>
                  )}
                </div>
              );
            })}
          </motion.div>
        </div>

        {/* ── Right Column ── */}
        <div className="w-[360px] shrink-0 flex flex-col gap-4 p-5 border-l border-border overflow-auto">
          {/* AI Assistant */}
          <motion.div
            initial={{ opacity: 0, x: 8 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ delay: 0.1, duration: 0.3 }}
            className="flex flex-col gap-3 p-3.5 bg-card border border-border rounded-lg"
          >
            <div className="flex items-center gap-2">
              <Sparkles size={16} className="text-primary" />
              <span className="text-foreground font-primary text-[13px] font-semibold">
                AI Assistant
              </span>
            </div>

            {/* AI Actions — next best actions */}
            <div className="flex flex-col gap-1.5">
              <div className="flex items-center gap-2 p-2.5 bg-background border border-border rounded-md">
                <Phone size={14} className="text-primary shrink-0" />
                <div className="flex-1 flex flex-col gap-0.5">
                  <span className="text-foreground font-secondary text-xs font-medium">Call Now</span>
                  <span className="text-muted-foreground font-secondary text-[10px]">
                    {lead.priority === 'hot' ? 'Hot lead, follow up ASAP' : 'Follow up on inquiry'}
                  </span>
                </div>
                <span
                  className="inline-flex items-center px-1.5 py-0.5 rounded-full font-primary text-[9px] font-semibold"
                  style={{ backgroundColor: lead.priority === 'hot' ? '#FEE2E2' : '#FEF3C7', color: lead.priority === 'hot' ? '#EF4444' : '#D97706' }}
                >
                  {lead.priority === 'hot' ? 'High' : 'Med'}
                </span>
              </div>
              <div className="flex items-center gap-2 p-2.5 bg-background border border-border rounded-md">
                <Mail size={14} className="text-primary shrink-0" />
                <div className="flex-1 flex flex-col gap-0.5">
                  <span className="text-foreground font-secondary text-xs font-medium">Send Quote</span>
                  <span className="text-muted-foreground font-secondary text-[10px]">
                    {reqs.length > 0 ? 'Requirements are clear' : 'Gather requirements first'}
                  </span>
                </div>
                <span
                  className="inline-flex items-center px-1.5 py-0.5 rounded-full font-primary text-[9px] font-semibold"
                  style={{ backgroundColor: reqs.length > 0 ? '#FEF3C7' : '#F3F4F6', color: reqs.length > 0 ? '#D97706' : '#9CA3AF' }}
                >
                  {reqs.length > 0 ? 'Med' : 'Low'}
                </span>
              </div>
            </div>

            {/* AI Buttons */}
            <div className="flex gap-1.5">
              <button
                onClick={() => handleAI('summary', () => generateAISummary(leadId))}
                disabled={aiLoading.summary}
                className="flex-1 h-10 rounded-lu-pill bg-background border border-border text-foreground font-primary text-sm font-medium shadow-lu-sm disabled:opacity-50 flex items-center justify-center gap-1"
              >
                {aiLoading.summary ? <Loader2 size={14} className="animate-spin" /> : 'Summarize'}
              </button>
              <button
                onClick={() => handleAI('products', () => generateProductSuggestions(leadId))}
                disabled={aiLoading.products}
                className="flex-1 h-10 rounded-lu-pill bg-background border border-border text-foreground font-primary text-sm font-medium shadow-lu-sm disabled:opacity-50 flex items-center justify-center gap-1"
              >
                {aiLoading.products ? <Loader2 size={14} className="animate-spin" /> : 'Suggest'}
              </button>
              <button
                onClick={() => handleAI('followup', () => generateFollowUpDraft(leadId, 'professional'))}
                disabled={aiLoading.followup}
                className="flex-1 h-10 rounded-lu-pill bg-background border border-border text-foreground font-primary text-sm font-medium shadow-lu-sm disabled:opacity-50 flex items-center justify-center gap-1"
              >
                {aiLoading.followup ? <Loader2 size={14} className="animate-spin" /> : 'Draft'}
              </button>
            </div>

            {/* AI Results */}
            {aiResults.summary && (
              <div className="p-3 bg-background border border-border rounded-md">
                <span className="text-foreground font-secondary text-xs font-semibold">Summary</span>
                <p className="text-muted-foreground font-secondary text-[12px] mt-1 whitespace-pre-wrap">
                  {aiResults.summary.summary}
                </p>
              </div>
            )}
            {aiResults.products && (
              <div className="p-3 bg-background border border-border rounded-md">
                <span className="text-foreground font-secondary text-xs font-semibold">Suggested Products</span>
                <div className="flex flex-col gap-1 mt-1">
                  {(Array.isArray(aiResults.products.suggestions) ? aiResults.products.suggestions : []).map((s, i) => (
                    <span key={i} className="text-muted-foreground font-secondary text-[12px]">
                      {typeof s === 'string' ? s : s.name || s.product || JSON.stringify(s)}
                    </span>
                  ))}
                </div>
              </div>
            )}
            {aiResults.followup && (
              <div className="p-3 bg-background border border-border rounded-md relative">
                <div className="flex items-center justify-between mb-1">
                  <span className="text-foreground font-secondary text-xs font-semibold">Draft Follow-up</span>
                  <button
                    onClick={() => handleCopyDraft(aiResults.followup.draft)}
                    className="text-muted-foreground hover:text-foreground"
                  >
                    {copied ? <Check size={12} /> : <Copy size={12} />}
                  </button>
                </div>
                <p className="text-muted-foreground font-secondary text-[12px] whitespace-pre-wrap">
                  {aiResults.followup.draft}
                </p>
              </div>
            )}
          </motion.div>

          {/* Notes & Activities */}
          <motion.div
            initial={{ opacity: 0, x: 8 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ delay: 0.2, duration: 0.3 }}
            className="flex flex-col gap-2.5 p-3.5 bg-card border border-border rounded-lg"
          >
            <div className="flex items-center justify-between">
              <span className="text-foreground font-primary text-[13px] font-semibold">
                Notes &amp; Activities
              </span>
              <button
                onClick={() => setShowNoteInput(!showNoteInput)}
                className="flex items-center gap-1 h-10 px-4 rounded-lu-pill text-foreground font-primary text-sm font-medium"
              >
                <Plus size={14} />
                Add Note
              </button>
            </div>

            {/* Note Input */}
            {showNoteInput && (
              <div className="flex flex-col gap-2">
                <textarea
                  rows={3}
                  value={noteText}
                  onChange={(e) => setNoteText(e.target.value)}
                  placeholder="Enter your note..."
                  className="px-3 py-2 rounded-lg bg-background border border-input text-foreground font-secondary text-sm outline-none resize-none placeholder:text-muted-foreground"
                />
                <div className="flex justify-end gap-2">
                  <button
                    onClick={() => { setShowNoteInput(false); setNoteText(''); }}
                    className="h-8 px-3 rounded-lg border border-border text-foreground font-primary text-xs font-medium"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={handleAddNote}
                    disabled={noteSaving || !noteText.trim()}
                    className="h-8 px-3 rounded-lg bg-primary text-primary-foreground font-primary text-xs font-medium disabled:opacity-50 flex items-center gap-1"
                  >
                    {noteSaving ? <Loader2 size={12} className="animate-spin" /> : 'Save'}
                  </button>
                </div>
              </div>
            )}

            {/* Timeline */}
            <div className="flex flex-col">
              {activities.length === 0 && (
                <span className="text-muted-foreground font-secondary text-[11px] py-2">No activities yet</span>
              )}
              {activities.map((entry) => {
                const style = ACTIVITY_STYLES[entry.activity_type] || ACTIVITY_STYLES.note;
                return (
                  <div key={entry.id} className="flex gap-2.5 py-2">
                    <div className={`w-2 h-2 rounded-full shrink-0 mt-1.5 ${style.dotColor}`} />
                    <div className="flex-1 flex flex-col gap-0.5">
                      <div className="flex items-center gap-1.5">
                        <span className={`inline-flex items-center px-1.5 py-0.5 rounded-full font-primary text-[9px] font-semibold ${style.typeBg} ${style.typeText}`}>
                          {style.label}
                        </span>
                        <span className="text-muted-foreground font-secondary text-[10px]">
                          {relativeTime(entry.created_at)}
                        </span>
                      </div>
                      {entry.description && (
                        <span className="text-muted-foreground font-secondary text-[11px]">
                          {entry.description}
                        </span>
                      )}
                      {entry.performed_by_name && (
                        <span className="text-muted-foreground font-secondary text-[10px]">
                          by {entry.performed_by_name}
                        </span>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </motion.div>
        </div>
      </div>
    </motion.div>
  );
}
