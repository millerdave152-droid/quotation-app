/**
 * LeadQuickCaptureNew.jsx — Screen 64
 * TeleTime Design System · Lead Quick Capture
 * Design frame: DaIq1
 */

import { useState } from 'react';
import { motion } from 'framer-motion';

/* ------------------------------------------------------------------ */
/*  Data                                                               */
/* ------------------------------------------------------------------ */

const sources = ['Walk-in', 'Phone', 'Website', 'Referral'];

const priorities = [
  { key: 'hot', label: 'Hot', bg: '#FEE2E2', color: '#EF4444' },
  { key: 'warm', label: 'Warm', bg: '#FEF3C7', color: '#D97706' },
  { key: 'cold', label: 'Cold', bg: 'var(--secondary)', color: 'var(--muted-foreground)' },
];

/* ------------------------------------------------------------------ */
/*  Component                                                          */
/* ------------------------------------------------------------------ */

export default function LeadQuickCaptureNew({ onSave, onClose }) {
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [email, setEmail] = useState('');
  const [source, setSource] = useState('Walk-in');
  const [priority, setPriority] = useState('warm');
  const [notes, setNotes] = useState('');
  const [saving, setSaving] = useState(false);

  const handleSave = async () => {
    if (!name.trim()) return;
    setSaving(true);
    try {
      await onSave?.({
        contact_name: name.trim(),
        contact_phone: phone.trim(),
        contact_email: email.trim(),
        source: source.toLowerCase().replace('-', '_'),
        priority,
        requirements_notes: notes.trim(),
      });
    } catch {
      // parent handles toast
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/30 flex items-center justify-center z-50">
      <motion.div
        initial={{ opacity: 0, y: -12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.15 }}
        className="w-[440px] bg-card rounded-xl border border-border flex flex-col gap-5 p-6"
        style={{ boxShadow: '0 8px 24px #00000022' }}
      >
        {/* Header */}
        <div className="flex flex-col gap-1">
          <h2 className="text-foreground font-primary text-[20px] font-bold">Quick Capture</h2>
          <p className="text-muted-foreground font-secondary text-[13px]">Quickly log a new lead inquiry</p>
        </div>

        {/* Name */}
        <div className="flex flex-col gap-1.5">
          <span className="text-foreground font-secondary text-sm font-medium">Name *</span>
          <input
            type="text"
            placeholder="Contact name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="h-10 px-4 rounded-lg bg-background border border-input text-foreground font-secondary text-sm outline-none placeholder:text-muted-foreground"
          />
        </div>

        {/* Phone + Email */}
        <div className="flex gap-3">
          <div className="flex flex-col gap-1.5 flex-1">
            <span className="text-foreground font-secondary text-sm font-medium">Phone</span>
            <input
              type="text"
              placeholder="(555) 000-0000"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              className="h-10 px-4 rounded-lg bg-background border border-input text-foreground font-secondary text-sm outline-none placeholder:text-muted-foreground"
            />
          </div>
          <div className="flex flex-col gap-1.5 flex-1">
            <span className="text-foreground font-secondary text-sm font-medium">Email</span>
            <input
              type="text"
              placeholder="email@example.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="h-10 px-4 rounded-lg bg-background border border-input text-foreground font-secondary text-sm outline-none placeholder:text-muted-foreground"
            />
          </div>
        </div>

        {/* Source */}
        <div className="flex flex-col gap-2">
          <span className="text-foreground font-secondary text-sm font-medium">Source</span>
          <div className="flex items-center gap-2">
            {sources.map((s) => (
              <button
                key={s}
                onClick={() => setSource(s)}
                className="px-3.5 py-1.5 rounded-full font-secondary text-[12px] font-medium transition-all"
                style={{
                  backgroundColor: source === s ? 'var(--primary)' : 'var(--secondary)',
                  color: source === s ? 'var(--primary-foreground)' : 'var(--secondary-foreground)',
                }}
              >
                {s}
              </button>
            ))}
          </div>
        </div>

        {/* Priority */}
        <div className="flex flex-col gap-2">
          <span className="text-foreground font-secondary text-sm font-medium">Priority</span>
          <div className="flex items-center gap-2">
            {priorities.map((p) => (
              <button
                key={p.key}
                onClick={() => setPriority(p.key)}
                className="px-3.5 py-1.5 rounded-full font-secondary text-[12px] font-medium transition-all"
                style={{
                  backgroundColor: p.bg,
                  color: p.color,
                  border: priority === p.key ? `2px solid ${p.color}` : '2px solid transparent',
                }}
              >
                {p.label}
              </button>
            ))}
          </div>
        </div>

        {/* Quick Notes */}
        <div className="flex flex-col gap-1.5">
          <span className="text-foreground font-secondary text-sm font-medium">Quick Notes</span>
          <textarea
            rows={3}
            placeholder="What are they looking for?"
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            className="px-4 py-3 rounded-lg bg-background border border-input text-foreground font-secondary text-sm outline-none resize-none placeholder:text-muted-foreground"
          />
        </div>

        {/* Actions */}
        <div className="flex items-center justify-end gap-3 pt-1">
          <button
            onClick={onClose}
            className="h-10 px-5 rounded-lg border border-border text-foreground font-primary text-sm font-medium"
          >
            Cancel
          </button>
          <button
            onClick={handleSave}
            disabled={saving || !name.trim()}
            className="h-10 px-5 rounded-lg bg-primary text-primary-foreground font-primary text-sm font-semibold disabled:opacity-50"
          >
            {saving ? 'Saving...' : 'Save Lead'}
          </button>
        </div>
      </motion.div>
    </div>
  );
}
