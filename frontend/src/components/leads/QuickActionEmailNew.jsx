/**
 * QuickActionEmailNew.jsx — Screen 66
 * TeleTime Design System · Log Email
 * Design frame: 0rKnz
 */

import { useState } from 'react';
import { motion } from 'framer-motion';
import { Loader2 } from 'lucide-react';
import { authFetch } from '../../services/authFetch';
import { useToast } from '../ui/Toast';

export default function QuickActionEmailNew({ leadId, onClose, onSuccess }) {
  const toast = useToast();
  const [subject, setSubject] = useState('');
  const [notes, setNotes] = useState('');
  const [saving, setSaving] = useState(false);

  const handleSave = async () => {
    setSaving(true);
    try {
      const res = await authFetch(`/api/leads/${leadId}/quick-actions/email`, {
        method: 'POST',
        body: JSON.stringify({
          subject: subject.trim() || null,
          notes: notes.trim() || null,
        }),
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.message || 'Failed to log email');
      }
      toast.success('Email logged');
      onSuccess?.();
      onClose?.();
    } catch (err) {
      toast.error(err.message || 'Failed to log email');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 flex items-center justify-center z-50">
      <motion.div
        initial={{ opacity: 0, y: -12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.15 }}
        className="w-[400px] bg-card rounded-xl border border-border flex flex-col gap-5 p-6"
        style={{ boxShadow: '0 8px 24px #00000022' }}
      >
        {/* Header */}
        <div className="flex flex-col gap-1">
          <h2 className="text-foreground font-primary text-[20px] font-bold">Log Email</h2>
        </div>

        {/* Subject */}
        <div className="flex flex-col gap-1.5">
          <span className="text-foreground font-secondary text-sm font-medium">Subject</span>
          <input
            type="text"
            value={subject}
            onChange={(e) => setSubject(e.target.value)}
            placeholder="Follow-up on inquiry"
            className="h-10 px-4 rounded-lg bg-background border border-input text-foreground font-secondary text-sm outline-none placeholder:text-muted-foreground"
          />
        </div>

        {/* Notes */}
        <div className="flex flex-col gap-1.5">
          <span className="text-foreground font-secondary text-sm font-medium">Notes</span>
          <textarea
            rows={4}
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="Email summary..."
            className="px-4 py-3 rounded-lg bg-background border border-input text-foreground font-secondary text-sm outline-none resize-none placeholder:text-muted-foreground"
          />
        </div>

        {/* Actions */}
        <div className="flex items-center justify-end gap-3 pt-1">
          <button
            onClick={onClose}
            disabled={saving}
            className="h-10 px-5 rounded-lg border border-border text-foreground font-primary text-sm font-medium disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            onClick={handleSave}
            disabled={saving}
            className="h-10 px-5 rounded-lg bg-primary text-primary-foreground font-primary text-sm font-semibold disabled:opacity-50 flex items-center gap-1.5"
          >
            {saving && <Loader2 size={14} className="animate-spin" />}
            {saving ? 'Logging...' : 'Log Email'}
          </button>
        </div>
      </motion.div>
    </div>
  );
}
