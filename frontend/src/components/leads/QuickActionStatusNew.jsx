/**
 * QuickActionStatusNew.jsx — Screen 68
 * TeleTime Design System · Change Status
 * Design frame: 3wJAY
 */

import { useState } from 'react';
import { motion } from 'framer-motion';
import { Loader2 } from 'lucide-react';
import { authFetch } from '../../services/authFetch';
import { useToast } from '../ui/Toast';

export default function QuickActionStatusNew({ leadId, currentStatus, onClose, onSuccess }) {
  const toast = useToast();
  const [selectedStatus, setSelectedStatus] = useState(currentStatus || null);
  const [saving, setSaving] = useState(false);

  const outlineStatuses = [
    { key: 'contacted', label: 'Contacted' },
    { key: 'qualified', label: 'Qualified' },
  ];

  const filledStatuses = [
    { key: 'converted', label: 'Converted', bg: 'var(--primary)', color: 'var(--primary-foreground)' },
    { key: 'lost', label: 'Lost', bg: 'var(--destructive)', color: 'var(--foreground)' },
  ];

  const handleStatusChange = async (status) => {
    setSelectedStatus(status);
    setSaving(true);
    try {
      const res = await authFetch(`/api/leads/${leadId}/quick-actions/status`, {
        method: 'PUT',
        body: JSON.stringify({ status }),
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.message || 'Failed to update status');
      }
      toast.success(`Status changed to ${status}`);
      onSuccess?.();
      onClose?.();
    } catch (err) {
      toast.error(err.message || 'Failed to update status');
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
          <h2 className="text-foreground font-primary text-[20px] font-bold">Change Status</h2>
          <p className="text-muted-foreground font-secondary text-[13px]">
            Currently: {currentStatus || '\u2014'}
          </p>
        </div>

        {saving && (
          <div className="flex items-center justify-center py-2">
            <Loader2 size={20} className="animate-spin text-muted-foreground" />
          </div>
        )}

        {/* Status Grid */}
        <div className="grid grid-cols-2 gap-3">
          {outlineStatuses.map((s) => (
            <button
              key={s.key}
              onClick={() => handleStatusChange(s.key)}
              disabled={saving || s.key === currentStatus}
              className="h-12 rounded-lg font-primary text-sm font-semibold transition-all disabled:opacity-50"
              style={{
                backgroundColor: selectedStatus === s.key ? '#FF840008' : 'transparent',
                border: selectedStatus === s.key ? '2px solid var(--primary)' : '2px solid var(--border)',
                color: 'var(--foreground)',
              }}
            >
              {s.label}
            </button>
          ))}
          {filledStatuses.map((s) => (
            <button
              key={s.key}
              onClick={() => handleStatusChange(s.key)}
              disabled={saving || s.key === currentStatus}
              className="h-12 rounded-lg font-primary text-sm font-semibold transition-all disabled:opacity-50"
              style={{
                backgroundColor: s.bg,
                color: s.color,
                border: selectedStatus === s.key ? '2px solid var(--foreground)' : '2px solid transparent',
              }}
            >
              {s.label}
            </button>
          ))}
        </div>

        {/* Cancel */}
        <button
          onClick={onClose}
          className="w-full h-10 rounded-lg border border-border text-foreground font-primary text-sm font-medium"
        >
          Cancel
        </button>
      </motion.div>
    </div>
  );
}
