/**
 * CardPaymentNew.jsx
 * Screen 5 — Checkout: Card Payment (Pencil frame phuwZ)
 * Two-panel layout: Left = Order Summary, Right = Terminal Waiting State
 */

import { motion } from 'framer-motion';
import {
  Receipt,
  X,
  ArrowLeft,
  Wifi,
} from 'lucide-react';

// ─── Static Data ───────────────────────────────────────────────

const lineItems = [
  { id: 1, name: 'Ashley Sectional × 1', price: '$2,499.00' },
  { id: 2, name: 'La-Z-Boy Recliner × 1', price: '$1,439.10' },
  { id: 3, name: 'Simmons Platform Bed × 2', price: '$1,798.00' },
];

// ─── Component ─────────────────────────────────────────────────

export default function CardPaymentNew() {
  return (
    <div className="flex h-screen bg-background">
      {/* ══════════════════════════════════════════
          LEFT PANEL — Order Summary (460px)
          ══════════════════════════════════════════ */}
      <div className="w-[460px] shrink-0 flex flex-col bg-card border-r border-border">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-border">
          <div className="flex items-center gap-2">
            <Receipt size={20} className="text-primary" />
            <span className="font-secondary text-[16px] font-bold text-foreground">
              Order Summary
            </span>
          </div>
          <button className="text-muted-foreground hover:text-foreground transition-colors">
            <X size={20} />
          </button>
        </div>

        {/* Line Items */}
        <div className="flex-1 overflow-y-auto">
          {lineItems.map((item) => (
            <div
              key={item.id}
              className="flex items-center justify-between px-5 py-2.5 border-b border-border"
            >
              <span className="font-secondary text-xs text-foreground">{item.name}</span>
              <span className="font-primary text-xs font-semibold text-foreground">
                {item.price}
              </span>
            </div>
          ))}
        </div>

        {/* Totals */}
        <div className="flex flex-col gap-1.5 px-5 pt-3 pb-4 border-t border-border bg-card">
          <div className="flex justify-between">
            <span className="font-secondary text-xs text-muted-foreground">Subtotal</span>
            <span className="font-secondary text-xs text-foreground">$5,736.10</span>
          </div>
          <div className="flex justify-between">
            <span className="font-secondary text-xs text-muted-foreground">HST (13%)</span>
            <span className="font-secondary text-xs text-foreground">$745.69</span>
          </div>
          <div className="h-px bg-border my-1" />
          <div className="flex items-center justify-between">
            <span className="font-secondary text-[16px] font-bold text-foreground">
              Amount Due
            </span>
            <span className="font-primary text-[22px] font-bold text-primary">
              $6,481.79
            </span>
          </div>
        </div>
      </div>

      {/* ══════════════════════════════════════════
          RIGHT PANEL — Card Terminal Waiting
          ══════════════════════════════════════════ */}
      <div className="flex-1 flex flex-col items-center gap-6 px-12 py-8 overflow-y-auto">
        {/* Back Button */}
        <div className="w-full">
          <motion.button
            whileHover={{ scale: 1.02 }}
            whileTap={{ scale: 0.97 }}
            className="flex items-center gap-1.5 rounded-lu-pill px-4 h-10 border border-transparent hover:border-border transition-colors"
          >
            <ArrowLeft size={20} className="text-foreground" />
            <span className="font-primary text-sm font-medium text-foreground">
              Back to Methods
            </span>
          </motion.button>
        </div>

        {/* Terminal Card */}
        <div className="flex flex-col items-center gap-6 w-[480px] bg-card rounded-[20px] border border-border p-10">
          {/* Icon */}
          <div className="w-20 h-20 rounded-full bg-[#3B82F610] flex items-center justify-center">
            <Wifi size={40} className="text-[#3B82F6]" />
          </div>

          {/* Title */}
          <h2 className="font-primary text-[22px] font-bold text-foreground">
            Waiting for Terminal
          </h2>

          {/* Subtitle */}
          <p className="font-secondary text-sm text-muted-foreground text-center max-w-[360px]">
            Please tap, insert, or swipe the card on the terminal
          </p>

          {/* Charging Badge */}
          <div className="flex items-center gap-1.5 bg-[#3B82F610] rounded-lu-pill px-5 py-2">
            <span className="font-secondary text-[13px] text-[#3B82F6]">Charging:</span>
            <span className="font-primary text-[16px] font-bold text-[#3B82F6]">$6,481.79</span>
          </div>

          {/* Progress Bar */}
          <div className="w-full h-1 bg-secondary rounded-lu-xs overflow-hidden">
            <motion.div
              className="h-full bg-[#3B82F6] rounded-lu-xs"
              initial={{ width: '0%' }}
              animate={{ width: '40%' }}
              transition={{ duration: 2, repeat: Infinity, repeatType: 'reverse', ease: 'easeInOut' }}
            />
          </div>

          {/* Terminal Status */}
          <div className="flex items-center gap-1.5">
            <div className="w-2 h-2 rounded-full bg-[#3B82F6]" />
            <span className="font-secondary text-xs font-medium text-[#3B82F6]">
              Connected to Moneris Terminal
            </span>
          </div>

          {/* Manual Entry Link */}
          <button className="font-secondary text-xs font-medium text-primary hover:underline">
            Enter card details manually
          </button>
        </div>

        {/* Cancel Button */}
        <motion.button
          whileHover={{ scale: 1.02 }}
          whileTap={{ scale: 0.97 }}
          className="flex items-center gap-1.5 bg-background border border-border rounded-lu-pill px-4 h-10 shadow-lu-sm"
        >
          <X size={20} className="text-foreground" />
          <span className="font-primary text-sm font-medium text-foreground">Cancel Payment</span>
        </motion.button>
      </div>
    </div>
  );
}
