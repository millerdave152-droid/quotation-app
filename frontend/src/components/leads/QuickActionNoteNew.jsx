/**
 * QuickActionNoteNew.jsx — Screen 67
 * TeleTime Design System · Add Note
 * Design frame: mZbwC
 */

import { useState } from 'react';
import { motion } from 'framer-motion';
import { Loader2 } from 'lucide-react';
import { authFetch } from '../../services/authFetch';
import { useToast } from '../ui/Toast';

export default function QuickActionNoteNew({ leadId, onClose, onSuccess }) {
  const toast = useToast();
  const [notes, setNotes] = useState('');
  const [saving, setSaving] = useState(false);

  const handleSave = async () => {
    if (!notes.trim()) return;
    setSaving(true);
    try {
      const res = await authFetch(`/api/leads/${leadId}/quick-actions/note`, {
        method: 'POST',
        body: JSON.stringify({ note: notes.trim() }),
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.message || 'Failed to add note');
      }
      toast.success('Note added');
      onSuccess?.();
      onClose?.();
    } catch (err) {
      toast.error(err.message || 'Failed to add note');
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
          <h2 className="text-foreground font-primary text-[20px] font-bold">Add Note</h2>
        </div>

        {/* Note */}
        <div className="flex flex-col gap-1.5">
          <span className="text-foreground font-secondary text-sm font-medium">Note *</span>
          <textarea
            rows={5}
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="Enter your note..."
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
            disabled={saving || !notes.trim()}
            className="h-10 px-5 rounded-lg bg-primary text-primary-foreground font-primary text-sm font-semibold disabled:opacity-50 flex items-center gap-1.5"
          >
            {saving && <Loader2 size={14} className="animate-spin" />}
            {saving ? 'Saving...' : 'Save Note'}
          </button>
        </div>
      </motion.div>
    </div>
  );
}
