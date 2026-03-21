/**
 * CustomerActivityTimelineNew.jsx — Screen 53
 * TeleTime Design System · Customer Activity Timeline
 * Design frame: XnCUZ
 */

import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Plus,
  X,
  FileText,
  Phone,
  CreditCard,
  Mail,
  Truck,
  PlusCircle,
} from 'lucide-react';

/* ------------------------------------------------------------------ */
/*  Data                                                               */
/* ------------------------------------------------------------------ */

const filters = ['All', 'Quotes', 'Orders', 'Communications', 'Payments'];

const todayItems = [
  {
    icon: FileText,
    iconColor: '#FF8400',
    dotBg: '#FF840015',
    title: 'Quote #Q-2026-0847 Created',
    time: '10:32 AM',
    desc: 'Living room sectional + accent chairs. Total: $8,450',
    badge: { label: 'Draft', bg: 'var(--color-warning)', color: 'var(--color-warning-foreground)' },
    amount: '$8,450.00',
  },
  {
    icon: Phone,
    iconColor: '#10B981',
    dotBg: '#10B98115',
    title: 'Phone Call \u2022 Outbound',
    time: '9:15 AM',
    desc: 'Discussed delivery timeline for pending order. Customer confirmed availability for March 5th installation.',
    meta: 'Agent: Sarah Chen \u2022 Duration: 8 min',
  },
];

const yesterdayItems = [
  {
    icon: CreditCard,
    iconColor: '#6366F1',
    dotBg: '#6366F115',
    title: 'Payment Received',
    time: '3:45 PM',
    desc: 'Deposit payment for Order #ORD-2026-0312. Method: Credit Card ending 4821',
    badge: { label: 'Paid', bg: 'var(--color-success)', color: 'var(--color-success-foreground)' },
    amount: '$3,200.00',
  },
  {
    icon: Mail,
    iconColor: '#F59E0B',
    dotBg: '#F59E0B15',
    title: 'Email Sent \u2022 Quote Follow-up',
    time: '11:20 AM',
    desc: 'Follow-up on Quote #Q-2026-0832. Reminder to review and approve before promotional pricing expires.',
  },
  {
    icon: Truck,
    iconColor: '#3B82F6',
    dotBg: '#3B82F615',
    title: 'Order #ORD-2026-0298 Delivered',
    time: '9:00 AM',
    desc: 'Bedroom set delivered and installed. Customer signed off. Satisfaction rating: 5/5',
    badge: { label: 'Delivered', bg: 'var(--color-success)', color: 'var(--color-success-foreground)' },
  },
];

/* ------------------------------------------------------------------ */
/*  Timeline Item                                                      */
/* ------------------------------------------------------------------ */

function TimelineItem({ item, isLast }) {
  const Icon = item.icon;
  return (
    <div
      className="flex gap-3 py-3.5 px-0"
      style={!isLast ? { borderBottom: '1px solid var(--border)' } : {}}
    >
      {/* Dot */}
      <div
        className="w-8 h-8 rounded-full flex items-center justify-center shrink-0"
        style={{ backgroundColor: item.dotBg }}
      >
        <Icon size={16} style={{ color: item.iconColor }} />
      </div>

      {/* Content */}
      <div className="flex-1 flex flex-col gap-1 min-w-0">
        <div className="flex items-center justify-between">
          <span className="text-foreground font-secondary text-[13px] font-semibold">
            {item.title}
          </span>
          <span className="text-muted-foreground font-secondary text-[11px] shrink-0 ml-2">
            {item.time}
          </span>
        </div>
        <span className="text-muted-foreground font-secondary text-xs leading-relaxed">
          {item.desc}
        </span>
        {item.meta && (
          <span className="text-muted-foreground font-secondary text-[11px] font-medium">
            {item.meta}
          </span>
        )}
        {(item.badge || item.amount) && (
          <div className="flex items-center gap-1.5 mt-0.5">
            {item.badge && (
              <span
                className="inline-flex items-center px-2 py-0.5 rounded-full font-primary text-sm"
                style={{ backgroundColor: item.badge.bg, color: item.badge.color }}
              >
                {item.badge.label}
              </span>
            )}
            {item.amount && (
              <span className="text-foreground font-primary text-xs font-semibold">
                {item.amount}
              </span>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Component                                                          */
/* ------------------------------------------------------------------ */

export default function CustomerActivityTimelineNew() {
  const [activeFilter, setActiveFilter] = useState('All');
  const [noteText, setNoteText] = useState('');

  return (
    <div className="fixed right-0 top-0 h-screen w-[600px] bg-card border-l border-border z-50 flex flex-col overflow-hidden">
      {/* Header */}
      <div
        className="flex items-center justify-between px-5 py-4 shrink-0"
        style={{ borderBottom: '1px solid var(--border)' }}
      >
        <div className="flex flex-col gap-0.5">
          <h2 className="text-foreground font-secondary text-[16px] font-bold">
            Activity Timeline
          </h2>
          <span className="text-muted-foreground font-secondary text-xs">
            John Anderson &bull; All activity
          </span>
        </div>
        <div className="flex items-center gap-2">
          <button className="flex items-center gap-1.5 h-8 px-4 rounded-full bg-background border border-border text-foreground font-primary text-xs font-medium shadow-lu-sm">
            <Plus size={14} />
            Filter
          </button>
          <button className="w-8 h-8 rounded-full bg-primary flex items-center justify-center">
            <X size={16} className="text-primary-foreground" />
          </button>
        </div>
      </div>

      {/* Filter pills */}
      <div
        className="flex items-center gap-1.5 px-5 py-2.5 bg-secondary shrink-0"
        style={{ borderBottom: '1px solid var(--border)' }}
      >
        {filters.map((f) => (
          <button
            key={f}
            onClick={() => setActiveFilter(f)}
            className={`px-2.5 py-1 rounded-full font-secondary text-[11px] transition-all ${
              activeFilter === f
                ? 'bg-primary text-white font-semibold'
                : 'border border-border text-muted-foreground'
            }`}
          >
            {f}
          </button>
        ))}
      </div>

      {/* Scrollable timeline */}
      <div className="flex-1 overflow-auto">
        <AnimatePresence mode="wait">
          <motion.div
            key={activeFilter}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.15 }}
          >
            {/* Today */}
            <div className="bg-secondary px-5 py-2">
              <span className="text-muted-foreground font-secondary text-[11px] font-semibold">
                Today &bull; Feb 28, 2026
              </span>
            </div>
            <div className="px-5">
              {todayItems.map((item, i) => (
                <TimelineItem key={item.title} item={item} isLast={i === todayItems.length - 1} />
              ))}
            </div>

            {/* Yesterday */}
            <div className="bg-secondary px-5 py-2">
              <span className="text-muted-foreground font-secondary text-[11px] font-semibold">
                Yesterday &bull; Feb 27, 2026
              </span>
            </div>
            <div className="px-5">
              {yesterdayItems.map((item, i) => (
                <TimelineItem key={item.title} item={item} isLast={i === yesterdayItems.length - 1} />
              ))}
            </div>
          </motion.div>
        </AnimatePresence>
      </div>

      {/* Add Note section */}
      <div
        className="flex flex-col gap-2.5 px-5 py-3.5 bg-secondary shrink-0"
        style={{ borderTop: '1px solid var(--border)' }}
      >
        <div className="flex items-center gap-1.5">
          <PlusCircle size={16} className="text-primary" />
          <span className="text-foreground font-secondary text-[13px] font-semibold">
            Add Activity Note
          </span>
        </div>

        <textarea
          value={noteText}
          onChange={(e) => setNoteText(e.target.value)}
          placeholder="Type a note about this customer..."
          rows={3}
          className="w-full px-4 py-2 rounded-lu-md border border-input bg-background text-foreground font-secondary text-sm resize-none outline-none placeholder:text-muted-foreground"
          style={{ height: 80 }}
        />

        <div className="flex items-center justify-between">
          <div className="flex items-center gap-1.5">
            <span className="text-muted-foreground font-secondary text-[11px]">Type:</span>
            <span className="px-2 py-1 rounded-full bg-secondary border border-border font-primary text-sm text-secondary-foreground">
              General Note
            </span>
          </div>
          <div className="flex items-center gap-2">
            <button className="h-[30px] px-4 rounded-full border border-border font-primary text-[11px] font-medium text-foreground">
              Cancel
            </button>
            <motion.button
              whileHover={{ scale: 1.02 }}
              whileTap={{ scale: 0.97 }}
              className="h-[30px] px-4 rounded-full bg-primary text-primary-foreground font-primary text-[11px] font-medium"
            >
              Add Note
            </motion.button>
          </div>
        </div>
      </div>
    </div>
  );
}
