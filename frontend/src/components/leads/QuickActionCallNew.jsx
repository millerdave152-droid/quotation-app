/**
 * QuickActionCallNew.jsx — Screen 65
 * TeleTime Design System · Log Phone Call
 * Design frame: WLvo3
 */

import { useState } from 'react';
import { motion } from 'framer-motion';
import { Loader2 } from 'lucide-react';
import { authFetch } from '../../services/authFetch';
import { useToast } from '../ui/Toast';

export default function QuickActionCallNew({ leadId, onClose, onSuccess }) {
  const toast = useToast();
  const [outcome, setOutcome] = useState('answered');
  const [duration, setDuration] = useState('15');
  const [notes, setNotes] = useState('');
  const [saving, setSaving] = useState(false);

  const handleSave = async () => {
    setSaving(true);
    try {
      const res = await authFetch(`/api/leads/${leadId}/quick-actions/call`, {
        method: 'POST',
        body: JSON.stringify({
          outcome,
          duration_minutes: parseInt(duration) || null,
          notes: notes.trim() || null,
        }),
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.message || 'Failed to log call');
      }
      toast.success('Call logged');
      onSuccess?.();
      onClose?.();
    } catch (err) {
      toast.error(err.message || 'Failed to log call');
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
          <h2 className="text-foreground font-primary text-[20px] font-bold">Log Phone Call</h2>
        </div>

        {/* Call Outcome */}
        <div className="flex flex-col gap-1.5">
          <span className="text-foreground font-secondary text-sm font-medium">Call Outcome</span>
          <div className="relative">
            <select
              value={outcome}
              onChange={(e) => setOutcome(e.target.value)}
              className="w-full h-10 px-4 rounded-lg bg-background border border-input text-foreground font-secondary text-sm outline-none appearance-none cursor-pointer"
            >
              <option value="answered">Answered</option>
              <option value="voicemail">Voicemail</option>
              <option value="no-answer">No Answer</option>
              <option value="busy">Busy</option>
            </select>
            <span className="material-symbols-rounded absolute right-3 top-1/2 -translate-y-1/2 text-[18px] text-muted-foreground pointer-events-none">
              expand_more
            </span>
          </div>
        </div>

        {/* Duration */}
        <div className="flex flex-col gap-1.5">
          <span className="text-foreground font-secondary text-sm font-medium">Duration (min)</span>
          <input
            type="number"
            value={duration}
            onChange={(e) => setDuration(e.target.value)}
            className="h-10 px-4 rounded-lg bg-background border border-input text-foreground font-secondary text-sm outline-none"
          />
        </div>

        {/* Notes */}
        <div className="flex flex-col gap-1.5">
          <span className="text-foreground font-secondary text-sm font-medium">Notes</span>
          <textarea
            rows={3}
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="Call notes..."
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
            {saving ? 'Logging...' : 'Log Call'}
          </button>
        </div>
      </motion.div>
    </div>
  );
}
