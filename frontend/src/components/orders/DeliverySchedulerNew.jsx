/**
 * DeliverySchedulerNew.jsx — Screen 32
 * TeleTime Design System · Delivery Scheduler
 * Design frame: rd4sl
 */

import { useState } from 'react';
import { motion } from 'framer-motion';
import { Plus, ChevronLeft, ChevronRight, Clock } from 'lucide-react';
import BreadcrumbTopBar from '../shared/BreadcrumbTopBar';

/* ------------------------------------------------------------------ */
/*  Data                                                               */
/* ------------------------------------------------------------------ */

const address = {
  line1: '742 Evergreen Terrace',
  city: 'Springfield',
  province: 'IL',
  postal: '62704',
  zone: 'Zone A',
  zoneNote: 'Free Delivery',
};

const dayHeaders = ['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa'];

// February 2026 starts on Sunday (index 0)
const calendarDays = [
  [1, 2, 3, 4, 5, 6, 7],
  [8, 9, 10, 11, 12, 13, 14],
  [15, 16, 17, 18, 19, 20, 21],
  [22, 23, 24, 25, 26, 27, 28],
];

const timeSlots = [
  {
    range: '9:00 AM – 12:00 PM',
    slots: 3,
    status: 'selected',
    color: 'text-[#F59E0B]',
  },
  {
    range: '12:00 PM – 3:00 PM',
    slots: 5,
    status: 'available',
    color: 'text-[#22C55E]',
  },
  {
    range: '3:00 PM – 6:00 PM',
    slots: 2,
    status: 'available',
    color: 'text-[#F59E0B]',
  },
  {
    range: '6:00 PM – 9:00 PM',
    slots: 0,
    status: 'full',
    color: 'text-[#EF4444]',
  },
];

const summaryRows = [
  { label: 'Order', value: 'ORD-2026-00847' },
  { label: 'Date', value: 'February 25, 2026' },
  { label: 'Time Slot', value: '9:00 AM – 12:00 PM' },
  { label: 'Address', value: '742 Evergreen Terrace, Springfield' },
];

/* ------------------------------------------------------------------ */
/*  Component                                                          */
/* ------------------------------------------------------------------ */

export default function DeliverySchedulerNew() {
  const [selectedDay] = useState(25);
  const [selectedSlot] = useState(0);

  return (
    <div className="flex flex-col h-screen bg-background overflow-hidden">
      <BreadcrumbTopBar
        title={['Orders', 'Delivery Scheduler']}
        rightContent={
          <motion.button
            whileHover={{ scale: 1.02 }}
            whileTap={{ scale: 0.97 }}
            className="flex items-center gap-1.5 h-10 px-4 rounded-lu-pill bg-primary text-primary-foreground font-primary text-sm font-medium"
          >
            <Plus size={16} />
            Schedule Delivery
          </motion.button>
        }
      />

      {/* Body */}
      <div className="flex-1 flex flex-col gap-5 p-6 overflow-auto">
        {/* Title */}
        <div className="flex flex-col gap-1">
          <h1 className="text-foreground font-secondary text-[20px] font-bold">
            Schedule Delivery
          </h1>
          <p className="text-muted-foreground font-secondary text-[13px]">
            Select a delivery date and time slot for ORD-2026-00847
          </p>
        </div>

        {/* Two-column layout */}
        <div className="flex gap-6">
          {/* Left column */}
          <div className="flex-1 flex flex-col gap-6">
            {/* Delivery Address Card */}
            <motion.div
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.3 }}
              className="flex flex-col bg-card border border-border rounded-xl shadow-lu-sm overflow-hidden"
            >
              <div
                className="px-5 py-4"
                style={{ borderBottom: '1px solid var(--border)' }}
              >
                <span className="text-foreground font-secondary text-sm font-semibold">
                  Delivery Address
                </span>
              </div>
              <div className="flex flex-col gap-3 p-5">
                <div className="flex flex-col gap-1">
                  <span className="text-foreground font-secondary text-[13px] font-medium">
                    {address.line1}
                  </span>
                  <span className="text-muted-foreground font-secondary text-[13px]">
                    {address.city}, {address.province} {address.postal}
                  </span>
                </div>
                <div className="flex items-center gap-2">
                  <div className="w-2 h-2 rounded-full bg-[#22C55E]" />
                  <span className="text-[#22C55E] font-secondary text-[12px] font-medium">
                    {address.zone} — {address.zoneNote}
                  </span>
                </div>
              </div>
            </motion.div>

            {/* Calendar Card */}
            <motion.div
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.05, duration: 0.3 }}
              className="flex flex-col bg-card border border-border rounded-xl shadow-lu-sm overflow-hidden"
            >
              <div
                className="px-5 py-4"
                style={{ borderBottom: '1px solid var(--border)' }}
              >
                <span className="text-foreground font-secondary text-sm font-semibold">
                  Select Date
                </span>
              </div>
              <div className="p-5">
                {/* Month navigation */}
                <div className="flex items-center justify-between mb-4">
                  <button className="p-1 text-muted-foreground hover:text-foreground">
                    <ChevronLeft size={16} />
                  </button>
                  <span className="text-foreground font-secondary text-sm font-semibold">
                    February 2026
                  </span>
                  <button className="p-1 text-muted-foreground hover:text-foreground">
                    <ChevronRight size={16} />
                  </button>
                </div>

                {/* Day headers */}
                <div className="grid grid-cols-7 gap-1 mb-2">
                  {dayHeaders.map((d) => (
                    <div
                      key={d}
                      className="flex items-center justify-center h-8 text-muted-foreground font-secondary text-[12px] font-semibold"
                    >
                      {d}
                    </div>
                  ))}
                </div>

                {/* Calendar grid */}
                {calendarDays.map((week, wi) => (
                  <div key={wi} className="grid grid-cols-7 gap-1">
                    {week.map((day) => {
                      const isSelected = day === selectedDay;
                      return (
                        <div
                          key={day}
                          className={`flex items-center justify-center h-10 rounded-full font-secondary text-[13px] cursor-pointer transition-colors ${
                            isSelected
                              ? 'bg-primary text-primary-foreground font-semibold'
                              : 'text-foreground hover:bg-secondary'
                          }`}
                        >
                          {day}
                        </div>
                      );
                    })}
                  </div>
                ))}
              </div>
            </motion.div>
          </div>

          {/* Right column */}
          <div className="w-[400px] shrink-0 flex flex-col gap-6">
            {/* Time Slots Card */}
            <motion.div
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.1, duration: 0.3 }}
              className="flex flex-col bg-card border border-border rounded-xl shadow-lu-sm overflow-hidden"
            >
              <div
                className="flex items-center justify-between px-5 py-4"
                style={{ borderBottom: '1px solid var(--border)' }}
              >
                <span className="text-foreground font-secondary text-sm font-semibold">
                  Available Time Slots
                </span>
                <span className="inline-flex items-center px-2 py-1 rounded-full bg-secondary text-foreground font-secondary text-[11px] font-medium">
                  Feb 25, 2026
                </span>
              </div>
              <div className="flex flex-col gap-2 p-5">
                {timeSlots.map((slot, i) => {
                  const isSelected = i === selectedSlot;
                  const isFull = slot.status === 'full';
                  return (
                    <div
                      key={slot.range}
                      className={`flex items-center justify-between p-3 rounded-lg border cursor-pointer transition-colors ${
                        isSelected
                          ? 'border-primary bg-primary/5'
                          : isFull
                          ? 'border-border opacity-50 cursor-not-allowed'
                          : 'border-border hover:bg-secondary'
                      }`}
                    >
                      <div className="flex items-center gap-2">
                        <Clock
                          size={14}
                          className={
                            isSelected
                              ? 'text-primary'
                              : 'text-muted-foreground'
                          }
                        />
                        <span
                          className={`font-secondary text-[13px] font-medium ${
                            isSelected ? 'text-primary' : 'text-foreground'
                          }`}
                        >
                          {slot.range}
                        </span>
                      </div>
                      <span
                        className={`font-secondary text-[11px] font-medium ${slot.color}`}
                      >
                        {isFull
                          ? 'Full'
                          : `${slot.slots} slot${slot.slots !== 1 ? 's' : ''} left`}
                      </span>
                    </div>
                  );
                })}
              </div>
            </motion.div>

            {/* Booking Summary Card */}
            <motion.div
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.15, duration: 0.3 }}
              className="flex flex-col bg-card border border-border rounded-xl shadow-lu-sm overflow-hidden"
            >
              <div
                className="px-5 py-4"
                style={{ borderBottom: '1px solid var(--border)' }}
              >
                <span className="text-foreground font-secondary text-sm font-semibold">
                  Booking Summary
                </span>
              </div>
              <div className="flex flex-col gap-3 p-5">
                {summaryRows.map((row) => (
                  <div
                    key={row.label}
                    className="flex items-center justify-between"
                  >
                    <span className="text-muted-foreground font-secondary text-[12px]">
                      {row.label}
                    </span>
                    <span className="text-foreground font-secondary text-[12px] font-medium">
                      {row.value}
                    </span>
                  </div>
                ))}
                <div className="flex items-center justify-between">
                  <span className="text-muted-foreground font-secondary text-[12px]">
                    Delivery Fee
                  </span>
                  <span className="text-[#22C55E] font-secondary text-[12px] font-semibold">
                    Free
                  </span>
                </div>

                {/* Notes */}
                <textarea
                  placeholder="Delivery notes (optional)..."
                  rows={3}
                  className="w-full px-3 py-2 rounded-lg border border-border bg-background text-foreground font-secondary text-[13px] resize-none outline-none placeholder:text-muted-foreground"
                />

                {/* Actions */}
                <div className="flex items-center gap-2 pt-1">
                  <motion.button
                    whileHover={{ scale: 1.02 }}
                    whileTap={{ scale: 0.97 }}
                    className="flex-1 flex items-center justify-center h-10 rounded-lu-pill bg-background border border-border text-foreground font-primary text-sm font-medium"
                  >
                    Cancel
                  </motion.button>
                  <motion.button
                    whileHover={{ scale: 1.02 }}
                    whileTap={{ scale: 0.97 }}
                    className="flex-1 flex items-center justify-center h-10 rounded-lu-pill bg-primary text-primary-foreground font-primary text-sm font-medium"
                  >
                    Confirm Booking
                  </motion.button>
                </div>
              </div>
            </motion.div>
          </div>
        </div>
      </div>
    </div>
  );
}
