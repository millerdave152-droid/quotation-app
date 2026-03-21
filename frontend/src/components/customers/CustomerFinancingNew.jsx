/**
 * CustomerFinancingNew.jsx — Screen 39
 * TeleTime Design System · Customer Financing Page
 * Design frame: ZQuDw
 */

import { useState } from 'react';
import { motion } from 'framer-motion';
import {
  Plus,
  Search,
  Filter,
  DollarSign,
  TrendingUp,
  Clock,
  AlertTriangle,
  Calendar,
} from 'lucide-react';
import LunarisSidebar from '../shared/LunarisSidebar';

/* ------------------------------------------------------------------ */
/*  Data                                                               */
/* ------------------------------------------------------------------ */

const statCards = [
  {
    icon: DollarSign,
    iconColor: 'text-primary',
    label: 'Active Agreements',
    value: '23',
    sub: '+3 this month',
    subColor: 'text-[hsl(var(--color-success-foreground))]',
  },
  {
    icon: TrendingUp,
    iconColor: 'text-[#10B981]',
    label: 'Total Financed',
    value: '$186,400',
    sub: 'across all agreements',
    subColor: 'text-muted-foreground',
  },
  {
    icon: Clock,
    iconColor: 'text-[#F59E0B]',
    label: 'Payments Due',
    value: '8',
    valueColor: 'text-[hsl(var(--color-warning-foreground))]',
    sub: 'this week',
    subColor: 'text-muted-foreground',
  },
  {
    icon: AlertTriangle,
    iconColor: 'text-[#EF4444]',
    label: 'Overdue',
    value: '3',
    valueColor: 'text-[hsl(var(--color-error-foreground))]',
    sub: '$4,200 outstanding',
    subColor: 'text-[hsl(var(--color-error-foreground))]',
  },
];

const agreementCols = [
  { label: 'Customer', w: 'w-[180px]' },
  { label: 'Agreement #', w: 'w-[130px]' },
  { label: 'Total', w: 'w-[100px]' },
  { label: 'Remaining', w: 'w-[100px]' },
  { label: 'Monthly', w: 'w-[90px]' },
  { label: 'Next Due', w: 'w-[100px]' },
  { label: 'Status', w: 'w-[80px]' },
  { label: 'Actions', w: 'w-[100px]' },
];

const agreements = [
  {
    initials: 'JA',
    name: 'John Anderson',
    agreement: 'FIN-2026-001',
    total: '$12,600',
    remaining: '$8,400',
    monthly: '$700/mo',
    due: 'Mar 1, 2026',
    dueColor: 'text-foreground',
    dueFw: 'font-normal',
    status: 'Current',
    statusBg: 'bg-[hsl(var(--color-success))]',
    statusColor: 'text-[hsl(var(--color-success-foreground))]',
    stripe: false,
  },
  {
    initials: 'MP',
    name: 'Martinez Properties',
    agreement: 'FIN-2026-002',
    total: '$24,000',
    remaining: '$18,000',
    monthly: '$1,000/mo',
    due: 'Mar 5, 2026',
    dueColor: 'text-foreground',
    dueFw: 'font-normal',
    status: 'Current',
    statusBg: 'bg-[hsl(var(--color-success))]',
    statusColor: 'text-[hsl(var(--color-success-foreground))]',
    stripe: true,
  },
  {
    initials: 'SL',
    name: 'Sarah Lopez',
    agreement: 'FIN-2025-089',
    total: '$8,400',
    remaining: '$2,100',
    monthly: '$350/mo',
    due: 'Feb 15, 2026',
    dueColor: 'text-[hsl(var(--color-error-foreground))]',
    dueFw: 'font-semibold',
    status: 'Overdue',
    statusBg: 'bg-[hsl(var(--color-warning))]',
    statusColor: 'text-[hsl(var(--color-warning-foreground))]',
    stripe: false,
  },
  {
    initials: 'TR',
    name: 'Thompson Res.',
    agreement: 'FIN-2025-072',
    total: '$16,800',
    remaining: '$5,600',
    monthly: '$933/mo',
    due: 'Mar 10, 2026',
    dueColor: 'text-foreground',
    dueFw: 'font-normal',
    status: 'Current',
    statusBg: 'bg-[hsl(var(--color-success))]',
    statusColor: 'text-[hsl(var(--color-success-foreground))]',
    stripe: true,
  },
];

const scheduleCols = [
  { label: 'Due Date', w: 'w-[120px]' },
  { label: 'Customer', w: 'w-[200px]' },
  { label: 'Agreement #', w: 'w-[140px]' },
  { label: 'Amount', w: 'w-[100px]' },
  { label: 'Status', w: 'w-[100px]' },
  { label: 'Action', w: 'w-[120px]' },
];

const scheduleRows = [
  {
    date: 'Feb 15, 2026',
    dateColor: 'text-[hsl(var(--color-error-foreground))]',
    dateFw: 'font-semibold',
    customer: 'Sarah Lopez',
    agreement: 'FIN-2025-089',
    amount: '$350.00',
    status: 'Overdue',
    statusBg: 'bg-[hsl(var(--color-warning))]',
    statusColor: 'text-[hsl(var(--color-warning-foreground))]',
    action: 'Record Payment',
    actionPrimary: true,
    rowBg: 'bg-[#FEF2F210]',
    stripe: false,
  },
  {
    date: 'Mar 1, 2026',
    dateColor: 'text-foreground',
    dateFw: 'font-normal',
    customer: 'John Anderson',
    agreement: 'FIN-2026-001',
    amount: '$700.00',
    status: 'Upcoming',
    statusBg: 'bg-secondary',
    statusColor: 'text-secondary-foreground',
    action: 'Send Reminder',
    actionPrimary: false,
    rowBg: 'bg-secondary',
    stripe: true,
  },
  {
    date: 'Mar 5, 2026',
    dateColor: 'text-foreground',
    dateFw: 'font-normal',
    customer: 'Martinez Properties',
    agreement: 'FIN-2026-002',
    amount: '$1,000.00',
    status: 'Upcoming',
    statusBg: 'bg-secondary',
    statusColor: 'text-secondary-foreground',
    action: 'Send Reminder',
    actionPrimary: false,
    rowBg: '',
    stripe: false,
  },
  {
    date: 'Mar 10, 2026',
    dateColor: 'text-foreground',
    dateFw: 'font-normal',
    customer: 'Thompson Res.',
    agreement: 'FIN-2025-072',
    amount: '$933.00',
    status: 'Upcoming',
    statusBg: 'bg-secondary',
    statusColor: 'text-secondary-foreground',
    action: 'Send Reminder',
    actionPrimary: false,
    rowBg: 'bg-secondary',
    stripe: true,
  },
];

/* ------------------------------------------------------------------ */
/*  Component                                                          */
/* ------------------------------------------------------------------ */

export default function CustomerFinancingNew() {
  const [search, setSearch] = useState('');

  return (
    <div className="flex h-screen bg-background overflow-hidden">
      <LunarisSidebar activeItem="Customers" />

      <div className="flex-1 flex flex-col gap-6 p-7 overflow-auto">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div className="flex flex-col gap-0.5">
            <h1 className="text-foreground font-primary text-[22px] font-bold">
              Customer Financing
            </h1>
            <p className="text-muted-foreground font-secondary text-[13px]">
              Manage financing agreements and payment schedules
            </p>
          </div>
          <motion.button
            whileHover={{ scale: 1.02 }}
            whileTap={{ scale: 0.97 }}
            className="flex items-center gap-1.5 h-12 px-6 rounded-lu-pill bg-primary text-primary-foreground font-primary text-sm font-medium"
          >
            <Plus size={18} />
            New Financing Agreement
          </motion.button>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-4 gap-4">
          {statCards.map((stat, i) => {
            const Icon = stat.icon;
            return (
              <motion.div
                key={stat.label}
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: i * 0.04, duration: 0.3 }}
                className="flex flex-col bg-card border border-border rounded-lg overflow-hidden"
              >
                <div className="flex items-center gap-2 px-4 py-3">
                  <Icon size={18} className={stat.iconColor} />
                  <span className="text-muted-foreground font-secondary text-[12px]">
                    {stat.label}
                  </span>
                </div>
                <div className="flex flex-col gap-0.5 px-4 pb-3">
                  <span
                    className={`font-primary text-[28px] font-bold ${stat.valueColor || 'text-foreground'}`}
                  >
                    {stat.value}
                  </span>
                  <span className={`font-secondary text-[11px] ${stat.subColor}`}>
                    {stat.sub}
                  </span>
                </div>
              </motion.div>
            );
          })}
        </div>

        {/* Active Financing Agreements */}
        <motion.div
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.2, duration: 0.3 }}
          className="flex flex-col bg-card border border-border rounded-lg overflow-hidden"
        >
          {/* Table header */}
          <div className="flex items-center justify-between px-4 py-3.5">
            <span className="text-foreground font-primary text-sm font-semibold">
              Active Financing Agreements
            </span>
            <div className="flex items-center gap-2">
              <div className="flex items-center gap-2 w-[200px] px-2 py-1.5 rounded-sm border border-border bg-background">
                <Search size={16} className="text-muted-foreground shrink-0" />
                <input
                  type="text"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Search..."
                  className="flex-1 bg-transparent text-foreground font-secondary text-sm outline-none placeholder:text-muted-foreground"
                />
              </div>
              <button className="flex items-center gap-1.5 h-8 px-4 rounded-lu-pill bg-background border border-border text-foreground font-primary text-[12px] font-medium shadow-lu-sm">
                <Filter size={14} />
                Filter
              </button>
            </div>
          </div>

          {/* Column headers */}
          <div
            className="flex items-center px-4 py-2.5 bg-secondary"
            style={{ borderBottom: '1px solid var(--border)' }}
          >
            {agreementCols.map((col) => (
              <span
                key={col.label}
                className={`${col.w} shrink-0 text-muted-foreground font-secondary text-[11px] font-semibold`}
              >
                {col.label}
              </span>
            ))}
          </div>

          {/* Rows */}
          {agreements.map((row) => (
            <div
              key={row.agreement}
              className={`flex items-center px-4 py-2.5 ${row.stripe ? 'bg-secondary' : ''}`}
              style={{ borderBottom: '1px solid var(--border)' }}
            >
              {/* Customer */}
              <div className="w-[180px] shrink-0 flex items-center gap-2">
                <div className="w-7 h-7 rounded-full bg-secondary flex items-center justify-center">
                  <span className="text-secondary-foreground font-primary text-[10px] font-semibold">
                    {row.initials}
                  </span>
                </div>
                <span className="text-foreground font-secondary text-[12px] font-medium">
                  {row.name}
                </span>
              </div>

              <span className="w-[130px] shrink-0 text-foreground font-secondary text-[12px]">
                {row.agreement}
              </span>
              <span className="w-[100px] shrink-0 text-foreground font-secondary text-[12px] font-semibold">
                {row.total}
              </span>
              <span className="w-[100px] shrink-0 text-foreground font-secondary text-[12px]">
                {row.remaining}
              </span>
              <span className="w-[90px] shrink-0 text-foreground font-secondary text-[12px]">
                {row.monthly}
              </span>
              <span
                className={`w-[100px] shrink-0 font-secondary text-[12px] ${row.dueColor} ${row.dueFw}`}
              >
                {row.due}
              </span>

              {/* Status badge */}
              <div className="w-[80px] shrink-0">
                <span
                  className={`inline-flex items-center justify-center w-full px-2 py-1 rounded-full font-primary text-[11px] ${row.statusBg} ${row.statusColor}`}
                >
                  {row.status}
                </span>
              </div>

              {/* Actions */}
              <div className="w-[100px] shrink-0 flex items-center gap-1.5">
                <button className="w-7 h-7 rounded-full bg-primary flex items-center justify-center">
                  <Search size={12} className="text-primary-foreground" />
                </button>
                <button className="w-7 h-7 rounded-full bg-primary flex items-center justify-center">
                  <Plus size={12} className="text-primary-foreground" />
                </button>
              </div>
            </div>
          ))}
        </motion.div>

        {/* Upcoming Payment Schedule */}
        <motion.div
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.3, duration: 0.3 }}
          className="flex flex-col bg-card border border-border rounded-lg overflow-hidden"
        >
          {/* Header */}
          <div className="flex items-center justify-between px-4 py-3.5">
            <div className="flex items-center gap-2">
              <Calendar size={18} className="text-primary" />
              <span className="text-foreground font-primary text-sm font-semibold">
                Upcoming Payment Schedule
              </span>
            </div>
            <span className="inline-flex items-center px-2 py-1 rounded-full bg-[hsl(var(--color-warning))] text-[hsl(var(--color-warning-foreground))] font-primary text-[11px]">
              3 overdue
            </span>
          </div>

          {/* Column headers */}
          <div
            className="flex items-center px-4 py-2.5 bg-secondary"
            style={{ borderBottom: '1px solid var(--border)' }}
          >
            {scheduleCols.map((col) => (
              <span
                key={col.label}
                className={`${col.w} shrink-0 text-muted-foreground font-secondary text-[11px] font-semibold`}
              >
                {col.label}
              </span>
            ))}
          </div>

          {/* Rows */}
          {scheduleRows.map((row) => (
            <div
              key={row.agreement}
              className={`flex items-center px-4 py-2.5 ${row.rowBg}`}
              style={{ borderBottom: '1px solid var(--border)' }}
            >
              <span
                className={`w-[120px] shrink-0 font-secondary text-[12px] ${row.dateColor} ${row.dateFw}`}
              >
                {row.date}
              </span>
              <span className="w-[200px] shrink-0 text-foreground font-secondary text-[12px] font-medium">
                {row.customer}
              </span>
              <span className="w-[140px] shrink-0 text-foreground font-secondary text-[12px]">
                {row.agreement}
              </span>
              <span className="w-[100px] shrink-0 text-foreground font-primary text-[12px] font-semibold">
                {row.amount}
              </span>

              {/* Status */}
              <div className="w-[100px] shrink-0">
                <span
                  className={`inline-flex items-center justify-center w-full px-2 py-1 rounded-full font-primary text-[11px] ${row.statusBg} ${row.statusColor}`}
                >
                  {row.status}
                </span>
              </div>

              {/* Action */}
              <div className="w-[120px] shrink-0">
                {row.actionPrimary ? (
                  <button className="flex items-center justify-center w-full h-7 rounded-lu-pill bg-primary text-primary-foreground font-primary text-[11px] font-medium">
                    {row.action}
                  </button>
                ) : (
                  <button className="flex items-center justify-center w-full h-7 rounded-lu-pill bg-background border border-border text-foreground font-primary text-[11px] font-medium shadow-lu-sm">
                    {row.action}
                  </button>
                )}
              </div>
            </div>
          ))}
        </motion.div>
      </div>
    </div>
  );
}
