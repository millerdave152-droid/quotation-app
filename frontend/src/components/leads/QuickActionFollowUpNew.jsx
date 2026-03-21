/**
 * QuickActionFollowUpNew.jsx — Screen 69
 * TeleTime Design System · Schedule Follow-up
 * Design frame: QG89x
 */

import { useState } from 'react';
import { motion } from 'framer-motion';
import { Loader2 } from 'lucide-react';
import { authFetch } from '../../services/authFetch';
import { useToast } from '../ui/Toast';

/* ------------------------------------------------------------------ */
/*  Helpers                                                            */
/* ------------------------------------------------------------------ */

const addDays = (days) => {
  const d = new Date();
  d.setDate(d.getDate() + days);
  return d.toISOString().slice(0, 10);
};

const quickPicks = [
  { label: 'Tomorrow', days: 1 },
  { label: 'In 3 days', days: 3 },
  { label: 'Next week', days: 7 },
];

/* ------------------------------------------------------------------ */
/*  Component                                                          */
/* ------------------------------------------------------------------ */

export default function QuickActionFollowUpNew({ leadId, onClose, onSuccess }) {
  const toast = useToast();
  const [selectedDate, setSelectedDate] = useState('');
  const [reminderNote, setReminderNote] = useState('');
  const [saving, setSaving] = useState(false);

  const handleSave = async () => {
    if (!selectedDate) {
      toast.warning('Please select a follow-up date');
      return;
    }
    setSaving(true);
    try {
      const res = await authFetch(`/api/leads/${leadId}/quick-actions/follow-up`, {
        method: 'PUT',
        body: JSON.stringify({
          follow_up_date: selectedDate,
          note: reminderNote.trim() || null,
        }),
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.message || 'Failed to set follow-up');
      }
      toast.success('Follow-up scheduled');
      onSuccess?.();
      onClose?.();
    } catch (err) {
      toast.error(err.message || 'Failed to set follow-up');
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
          <h2 className="text-foreground font-primary text-[20px] font-bold">Schedule Follow-up</h2>
        </div>

        {/* Follow-up Date */}
        <div className="flex flex-col gap-1.5">
          <span className="text-foreground font-secondary text-sm font-medium">Follow-up Date</span>
          <input
            type="date"
            value={selectedDate}
            onChange={(e) => setSelectedDate(e.target.value)}
            className="h-10 px-4 rounded-lg bg-background border border-input text-foreground font-secondary text-sm outline-none"
          />
        </div>

        {/* Quick Picks */}
        <div className="flex items-center gap-2">
          {quickPicks.map((pick) => (
            <button
              key={pick.label}
              onClick={() => setSelectedDate(addDays(pick.days))}
              className={`h-9 px-4 rounded-lg border font-secondary text-[12px] font-medium transition-colors ${
                selectedDate === addDays(pick.days)
                  ? 'border-primary bg-primary/10 text-primary'
                  : 'border-border text-foreground hover:bg-secondary'
              }`}
            >
              {pick.label}
            </button>
          ))}
        </div>

        {/* Reminder Note */}
        <div className="flex flex-col gap-1.5">
          <span className="text-foreground font-secondary text-sm font-medium">Reminder Note</span>
          <textarea
            rows={3}
            value={reminderNote}
            onChange={(e) => setReminderNote(e.target.value)}
            placeholder="Add a reminder note..."
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
            disabled={saving || !selectedDate}
            className="h-10 px-5 rounded-lg bg-primary text-primary-foreground font-primary text-sm font-semibold disabled:opacity-50 flex items-center gap-1.5"
          >
            {saving && <Loader2 size={14} className="animate-spin" />}
            {saving ? 'Scheduling...' : 'Set Follow-up'}
          </button>
        </div>
      </motion.div>
    </div>
  );
}
