/**
 * FraudRuleManagerNew.jsx — Screen 45
 * TeleTime Design System · Admin — Fraud Rule Manager
 * Design frame: HuJUe
 */

import { useState } from 'react';
import { motion } from 'framer-motion';
import { Plus } from 'lucide-react';
import AdminSidebar from '../shared/AdminSidebar';

/* ------------------------------------------------------------------ */
/*  Data                                                               */
/* ------------------------------------------------------------------ */

const filters = [
  { key: 'all', label: 'All' },
  { key: 'velocity', label: 'Velocity' },
  { key: 'amount', label: 'Amount' },
  { key: 'pattern', label: 'Pattern' },
  { key: 'employee', label: 'Employee' },
  { key: 'customer', label: 'Customer' },
];

const ruleCols = [
  { label: 'Active', w: 'w-[50px]' },
  { label: 'Rule', w: 'flex-1' },
  { label: 'Category', w: 'w-[90px]' },
  { label: 'Weight', w: 'w-[60px]' },
  { label: 'Severity', w: 'w-[80px]' },
  { label: 'Action', w: 'w-[100px]' },
];

const rules = [
  {
    active: true,
    name: 'Rapid Transaction Velocity',
    code: 'VEL-001 · Max 10 txns in 60s window',
    category: 'Velocity',
    catBg: '#DBEAFE',
    catColor: '#2563EB',
    weight: '12',
    weightColor: 'text-[#F59E0B]',
    severity: 'High',
    severityDot: 'bg-[#DC2626]',
    action: 'Block',
    actionColor: 'text-destructive',
  },
  {
    active: true,
    name: 'Unusual Discount Amount',
    code: 'AMT-003 · Z-score > 2.5 from mean',
    category: 'Amount',
    catBg: '#D1FAE5',
    catColor: '#059669',
    weight: '8',
    weightColor: 'text-[#059669]',
    severity: 'Medium',
    severityDot: 'bg-[#F59E0B]',
    action: 'Require Approval',
    actionColor: 'text-primary',
  },
  {
    active: true,
    name: 'Split Transaction Pattern',
    code: 'PAT-002 · Max 3 splits in 30min window',
    category: 'Pattern',
    catBg: '#FEF3C7',
    catColor: '#D97706',
    weight: '18',
    weightColor: 'text-[#DC2626]',
    severity: 'Critical',
    severityDot: 'bg-[#DC2626]',
    action: 'Block',
    actionColor: 'text-destructive',
  },
];

/* ------------------------------------------------------------------ */
/*  Component                                                          */
/* ------------------------------------------------------------------ */

export default function FraudRuleManagerNew() {
  const [activeFilter, setActiveFilter] = useState('all');

  return (
    <div className="flex h-screen bg-background overflow-hidden">
      <AdminSidebar activeItem="Fraud Rules" />

      <div className="flex-1 flex flex-col overflow-hidden">
        {/* Header */}
        <div
          className="flex items-center justify-between px-6 py-5"
          style={{ borderBottom: '1px solid var(--border)' }}
        >
          <div className="flex flex-col gap-1">
            <h1 className="text-foreground font-primary text-[22px] font-bold">
              Fraud Rule Manager
            </h1>
            <p className="text-muted-foreground font-secondary text-[13px]">
              Configure and manage fraud detection rules
            </p>
          </div>
          <motion.button
            whileHover={{ scale: 1.02 }}
            whileTap={{ scale: 0.97 }}
            className="flex items-center gap-1.5 h-10 px-4 rounded-lu-pill bg-primary text-primary-foreground font-primary text-sm font-medium"
          >
            <Plus size={16} />
            New Rule
          </motion.button>
        </div>

        {/* Filter pills */}
        <div
          className="flex items-center gap-2 px-6 py-3"
          style={{ borderBottom: '1px solid var(--border)' }}
        >
          {filters.map((f) => (
            <button
              key={f.key}
              onClick={() => setActiveFilter(f.key)}
              className={`flex items-center px-3.5 py-1.5 rounded-[20px] font-secondary text-[12px] transition-colors ${
                activeFilter === f.key
                  ? 'bg-foreground text-background font-semibold'
                  : 'border border-border text-foreground'
              }`}
            >
              {f.label}
            </button>
          ))}
        </div>

        {/* Table */}
        <div className="flex-1 flex flex-col overflow-auto">
          {/* Column headers */}
          <div
            className="flex items-center px-6 py-2.5 bg-secondary"
            style={{ borderBottom: '1px solid var(--border)' }}
          >
            {ruleCols.map((col) => (
              <span
                key={col.label}
                className={`${col.w} shrink-0 text-muted-foreground font-secondary text-[11px] font-semibold`}
              >
                {col.label}
              </span>
            ))}
          </div>

          {/* Rows */}
          {rules.map((rule) => (
            <div
              key={rule.code}
              className="flex items-center px-6 py-3"
              style={{ borderBottom: '1px solid var(--border)' }}
            >
              {/* Toggle switch */}
              <div className="w-[50px] shrink-0">
                <div className="w-8 h-5 rounded-full bg-primary relative cursor-pointer">
                  <div className="absolute right-0.5 top-0.5 w-4 h-4 bg-white rounded-full" />
                </div>
              </div>

              {/* Rule name + code */}
              <div className="flex-1 shrink-0 flex flex-col gap-0.5">
                <span className="text-foreground font-secondary text-[13px] font-medium">
                  {rule.name}
                </span>
                <span className="text-muted-foreground font-primary text-[10px]">
                  {rule.code}
                </span>
              </div>

              {/* Category badge */}
              <div className="w-[90px] shrink-0">
                <span
                  className="inline-flex items-center px-2 py-[2px] rounded font-primary text-[10px] font-semibold"
                  style={{ backgroundColor: rule.catBg, color: rule.catColor }}
                >
                  {rule.category}
                </span>
              </div>

              {/* Weight */}
              <span className={`w-[60px] shrink-0 font-primary text-[12px] font-semibold ${rule.weightColor}`}>
                {rule.weight}
              </span>

              {/* Severity */}
              <div className="w-[80px] shrink-0 flex items-center gap-1">
                <div className={`w-1.5 h-1.5 rounded-full ${rule.severityDot}`} />
                <span className="text-foreground font-secondary text-[12px]">{rule.severity}</span>
              </div>

              {/* Action */}
              <span className={`w-[100px] shrink-0 font-secondary text-[12px] font-medium ${rule.actionColor}`}>
                {rule.action}
              </span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
