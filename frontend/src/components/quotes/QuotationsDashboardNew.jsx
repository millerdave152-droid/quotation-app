/**
 * QuotationsDashboardNew.jsx — Screen 24
 * TeleTime ERP · Quotations Dashboard (Dark Sidebar Variant)
 * Design frame: CZwuw
 */

import { useState } from 'react';
import { motion } from 'framer-motion';
import {
  BarChart2,
  LineChart,
  Cpu,
  FileText,
  Monitor,
  ShoppingBag,
  Package,
  Box,
  Layers,
  Image,
  Archive,
  ArrowLeftRight,
  Download,
  Hash,
  CheckSquare,
  List,
  Clipboard,
  Tag,
  Percent,
  Store,
  Wrench,
  Shield,
  Truck,
  Users,
  Book,
  ChevronDown,
  ChevronRight,
  Search,
  Bell,
  AlertCircle,
  Grid3X3,
  Settings,
  LayoutDashboard,
  Kanban,
} from 'lucide-react';

/* ------------------------------------------------------------------ */
/*  Sidebar Nav Data                                                   */
/* ------------------------------------------------------------------ */

const sidebarSections = [
  {
    label: 'ANALYTICS',
    icon: BarChart2,
    expanded: true,
    items: [
      { icon: LayoutDashboard, label: 'Dashboard' },
      { icon: LineChart, label: 'Insights' },
      { icon: Cpu, label: 'Purchasing AI' },
      { icon: FileText, label: 'Report Builder' },
      { icon: Monitor, label: 'Executive Dashboard' },
    ],
  },
  { label: 'SALES', icon: ShoppingBag, expanded: false, items: [] },
  {
    label: 'INVENTORY',
    icon: Package,
    expanded: true,
    items: [
      { icon: Box, label: 'Products' },
      { icon: Layers, label: 'Product Variants' },
      { icon: Image, label: 'Product Gallery' },
      { icon: Archive, label: 'Inventory' },
      { icon: ArrowLeftRight, label: 'Transfers' },
      { icon: Download, label: 'Receiving' },
      { icon: Hash, label: 'Inventory Counts' },
      { icon: CheckSquare, label: 'Count Review' },
      { icon: List, label: 'Serial Numbers' },
      { icon: Clipboard, label: 'Purchase Orders' },
      { icon: Tag, label: 'Pricing Rules' },
      { icon: Percent, label: 'Mfr Promotions' },
    ],
  },
  { label: 'MARKETPLACE', icon: Store, expanded: false, items: [] },
  { label: 'TOOLS', icon: Wrench, expanded: false, items: [] },
  {
    label: 'ADMIN',
    icon: Shield,
    expanded: true,
    items: [
      { icon: Truck, label: 'Delivery Management' },
      { icon: Users, label: 'User Management' },
      { icon: Book, label: 'Nomenclature Admin' },
    ],
  },
];

/* ------------------------------------------------------------------ */
/*  Stats & Tabs Data                                                  */
/* ------------------------------------------------------------------ */

const statCards = [
  { label: 'Total Quotes', value: '92', color: '#111827' },
  { label: 'Total Value', value: '$312,375.98', color: '#22c55e' },
  { label: 'Won Rate', value: '1%', color: '#111827' },
  {
    label: 'Expiring Soon',
    value: '10',
    color: '#f97316',
    sub: 'Within 7 days',
    border: '#f97316',
  },
];

const filterTabs = [
  { label: 'All', count: 92 },
  { label: 'Draft', count: 73 },
  { label: 'Sent', count: 2 },
  { label: 'Won', count: 1 },
  { label: 'Lost', count: 0 },
  { label: 'Pending', count: 0 },
  { label: 'Expiring Soon', count: 4 },
  { label: 'High Value', count: 21 },
  { label: 'Recent', count: 11 },
  { label: 'No Customer', count: 16 },
];

const actionBtns = [
  { label: 'Dashboard', borderColor: '#14b8a6', textColor: '#14b8a6' },
  { label: 'Analytics', borderColor: '#14b8a6', textColor: '#14b8a6' },
  { label: 'Approvals', borderColor: '#22c55e', textColor: '#22c55e' },
  { label: 'Follow-Ups', borderColor: '#f97316', textColor: '#f97316' },
];

/* ------------------------------------------------------------------ */
/*  Table Data                                                         */
/* ------------------------------------------------------------------ */

const tableRows = [
  {
    quote: 'Q-2026-0061',
    rev: '0',
    customer: 'SAURABH MEHTA',
    statuses: [
      { label: 'DRAFT', bg: '#6b7280' },
      { label: 'EXPIRED', bg: '#ef4444' },
    ],
    total: '$2,445.42',
    date: '2026-01-05',
    highlight: true,
  },
  {
    quote: 'Q-2026-0059',
    rev: '0',
    customer: 'BOB APRKS',
    statuses: [
      { label: 'DRAFT', bg: '#6b7280' },
      { label: 'EXPIRED', bg: '#ef4444' },
    ],
    total: '$1,547.15',
    date: '2025-12-28',
    highlight: true,
  },
  {
    quote: 'Q-2026-0057',
    rev: '0',
    customer: 'Paul Supek',
    statuses: [{ label: 'DRAFT', bg: '#6b7280' }],
    total: '$0.00',
    date: '2025-12-15',
    highlight: false,
  },
  {
    quote: 'Q-2026-0056',
    rev: '0',
    customer: 'SAURABH MEHTA',
    statuses: [
      { label: 'DRAFT', bg: '#6b7280' },
      { label: 'EXPIRED', bg: '#ef4444' },
    ],
    total: '$44,413.80',
    date: '2025-12-10',
    highlight: true,
  },
  {
    quote: 'Q-2026-0054',
    rev: '0',
    customer: 'JAGNESH PATEL',
    statuses: [
      { label: 'DRAFT', bg: '#6b7280' },
    ],
    total: '$4,534.78',
    date: '2025-12-01',
    highlight: false,
  },
  {
    quote: 'Q-2026-0052',
    rev: '0',
    customer: 'BALDEEP SINGH',
    statuses: [
      { label: 'DRAFT', bg: '#6b7280' },
      { label: 'EXPIRED', bg: '#ef4444' },
    ],
    total: '$8,679.00',
    date: '2025-11-28',
    highlight: true,
  },
  {
    quote: 'Q-2025-0397',
    rev: '0',
    customer: 'Bob test',
    statuses: [{ label: 'SENT', bg: '#3b82f6' }],
    total: '$26,425.09',
    date: '2025-11-20',
    highlight: false,
  },
  {
    quote: 'Q-2025-0341',
    rev: '0',
    customer: 'Phinley McIntyre',
    statuses: [
      { label: 'WON', bg: '#22c55e' },
    ],
    total: '$11,795.00',
    date: '2025-11-15',
    highlight: false,
  },
];

/* ------------------------------------------------------------------ */
/*  Component                                                          */
/* ------------------------------------------------------------------ */

export default function QuotationsDashboardNew() {
  const [activeTab, setActiveTab] = useState('all');

  return (
    <div className="flex h-screen bg-[#f8f9fa] overflow-hidden">
      {/* ══════════════ Dark Sidebar ══════════════ */}
      <aside className="w-[200px] shrink-0 flex flex-col overflow-hidden" style={{ backgroundColor: '#1a1f36' }}>
        {/* Logo */}
        <div className="flex items-center gap-2.5 h-12 px-4">
          <div className="w-7 h-7 rounded-md bg-[#3b82f6]" />
          <div className="flex flex-col">
            <span className="text-white text-[13px] font-bold leading-none" style={{ fontFamily: 'Inter, sans-serif' }}>
              TELETIME
            </span>
            <span className="text-[#8892b0] text-[9px]" style={{ fontFamily: 'Inter, sans-serif' }}>
              Quotation System
            </span>
          </div>
        </div>

        {/* Nav */}
        <nav className="flex-1 overflow-y-auto py-2">
          {sidebarSections.map((section) => (
            <div key={section.label}>
              {/* Section Header */}
              <div className="flex items-center gap-1.5 px-4 pt-3 pb-1.5">
                <section.icon size={14} color="#8892b0" />
                <span className="text-[#8892b0] text-[11px] font-semibold" style={{ fontFamily: 'Inter, sans-serif' }}>
                  {section.label}
                </span>
                {section.expanded ? (
                  <ChevronDown size={12} color="#8892b0" />
                ) : (
                  <ChevronRight size={12} color="#8892b0" />
                )}
              </div>

              {/* Section Items */}
              {section.expanded &&
                section.items.map((item) => (
                  <div
                    key={item.label}
                    className="flex items-center gap-2.5 py-[7px] pl-9 pr-4 cursor-pointer hover:bg-white/5"
                  >
                    <item.icon size={15} color="#c8d0e0" />
                    <span className="text-[#c8d0e0] text-[13px]" style={{ fontFamily: 'Inter, sans-serif' }}>
                      {item.label}
                    </span>
                  </div>
                ))}
            </div>
          ))}
        </nav>

        {/* Footer */}
        <div className="px-4 py-3" style={{ borderTop: '1px solid #2a3050' }}>
          <span className="block text-[#8892b0] text-[11px] font-medium" style={{ fontFamily: 'Inter, sans-serif' }}>
            TeleTime Solutions
          </span>
          <span className="block text-[#5a6380] text-[10px]" style={{ fontFamily: 'Inter, sans-serif' }}>
            Enterprise v2.0.0
          </span>
        </div>
      </aside>

      {/* ══════════════ Right Panel ══════════════ */}
      <div className="flex-1 flex flex-col overflow-hidden">
        {/* ── Top Nav Bar ── */}
        <div className="flex items-center justify-between h-12 px-5 bg-white shrink-0" style={{ borderBottom: '1px solid #e5e7eb' }}>
          {/* Search */}
          <div className="flex items-center gap-2 h-8 px-3 rounded-md bg-[#f3f4f6] w-[300px]">
            <Search size={14} color="#9ca3af" />
            <span className="text-[#9ca3af] text-[13px]" style={{ fontFamily: 'Inter, sans-serif' }}>
              Search...
            </span>
          </div>

          <div className="flex items-center gap-4">
            {/* Icons */}
            <div className="flex items-center gap-3">
              <Bell size={18} color="#6b7280" className="cursor-pointer" />
              <AlertCircle size={18} color="#ef4444" className="cursor-pointer" />
              <Grid3X3 size={18} color="#6b7280" className="cursor-pointer" />
              <Settings size={18} color="#6b7280" className="cursor-pointer" />
            </div>

            {/* User */}
            <div className="flex items-center gap-2">
              <div className="w-[30px] h-[30px] rounded-full bg-[#3b82f6]" />
              <span className="text-[#111827] text-[13px]" style={{ fontFamily: 'Inter, sans-serif' }}>
                System Administrator
              </span>
              <ChevronDown size={12} color="#6b7280" />
            </div>
          </div>
        </div>

        {/* ── Main Content ── */}
        <div className="flex-1 flex flex-col gap-4 p-5 overflow-auto">
          {/* Page Header */}
          <div className="flex items-center justify-between">
            <span className="text-[#111827] text-2xl font-bold" style={{ fontFamily: 'Inter, sans-serif' }}>
              Quotations
            </span>
            <div className="flex items-center gap-2">
              {actionBtns.map((btn) => (
                <button
                  key={btn.label}
                  className="h-[34px] px-3.5 rounded text-[13px] font-medium"
                  style={{
                    fontFamily: 'Inter, sans-serif',
                    color: btn.textColor,
                    border: `1px solid ${btn.borderColor}`,
                  }}
                >
                  {btn.label}
                </button>
              ))}
              <button
                className="h-[34px] px-3.5 rounded bg-[#ef4444] text-white text-[13px] font-medium"
                style={{ fontFamily: 'Inter, sans-serif' }}
              >
                Export
              </button>

              {/* List / Pipeline toggle */}
              <div className="flex h-[34px]">
                <div className="flex items-center gap-1.5 px-3 rounded-l border border-[#e5e7eb]">
                  <List size={14} color="#6b7280" />
                  <span className="text-[#6b7280] text-[13px]" style={{ fontFamily: 'Inter, sans-serif' }}>
                    List
                  </span>
                </div>
                <div className="flex items-center gap-1.5 px-3 rounded-r border border-[#e5e7eb] border-l-0">
                  <Kanban size={14} color="#6b7280" />
                  <span className="text-[#6b7280] text-[13px]" style={{ fontFamily: 'Inter, sans-serif' }}>
                    Pipeline
                  </span>
                </div>
              </div>

              <button
                className="h-[34px] px-3.5 rounded bg-[#3b82f6] text-white text-[13px] font-semibold"
                style={{ fontFamily: 'Inter, sans-serif' }}
              >
                + New Quote
              </button>
            </div>
          </div>

          {/* Stats Cards */}
          <div className="grid grid-cols-4 gap-4">
            {statCards.map((card, i) => (
              <motion.div
                key={card.label}
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: i * 0.05, duration: 0.3 }}
                className="flex flex-col gap-1 p-4 bg-white rounded-lg"
                style={{
                  border: card.border
                    ? `2px solid ${card.border}`
                    : '1px solid #e5e7eb',
                }}
              >
                <span className="text-[#6b7280] text-[13px]" style={{ fontFamily: 'Inter, sans-serif' }}>
                  {card.label}
                </span>
                <span
                  className="text-[28px] font-bold"
                  style={{ fontFamily: 'Inter, sans-serif', color: card.color }}
                >
                  {card.value}
                </span>
                {card.sub && (
                  <span
                    className="text-[11px]"
                    style={{ fontFamily: 'Inter, sans-serif', color: card.color }}
                  >
                    {card.sub}
                  </span>
                )}
              </motion.div>
            ))}
          </div>

          {/* Drafts Button */}
          <div className="flex">
            <button className="flex items-center gap-1.5 h-8 px-3 rounded bg-[#111827]">
              <span className="text-white text-[13px]" style={{ fontFamily: 'Inter, sans-serif' }}>
                Drafts
              </span>
              <div className="w-5 h-5 rounded-full bg-[#ef4444] flex items-center justify-center">
                <span className="text-white text-[10px] font-semibold" style={{ fontFamily: 'Inter, sans-serif' }}>
                  73
                </span>
              </div>
            </button>
          </div>

          {/* Filter Tabs */}
          <div className="flex items-center gap-2 flex-wrap">
            {filterTabs.map((tab) => {
              const isActive = tab.label.toLowerCase().replace(/\s+/g, '-') === activeTab ||
                (activeTab === 'all' && tab.label === 'All');
              return (
                <button
                  key={tab.label}
                  onClick={() => setActiveTab(tab.label.toLowerCase().replace(/\s+/g, '-'))}
                  className="flex items-center gap-1.5 h-[30px] px-3 rounded-full text-[12px]"
                  style={{
                    fontFamily: 'Inter, sans-serif',
                    ...(isActive
                      ? { backgroundColor: '#111827', color: '#ffffff', fontWeight: 500 }
                      : { border: '1px solid #e5e7eb', color: '#6b7280' }),
                  }}
                >
                  {tab.label}
                  <span
                    className={`text-[11px] ${isActive ? 'font-semibold' : ''}`}
                    style={{
                      ...(isActive
                        ? {
                            backgroundColor: '#3b82f6',
                            color: '#ffffff',
                            borderRadius: '9px',
                            width: '22px',
                            height: '18px',
                            display: 'inline-flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            fontSize: '10px',
                          }
                        : { color: '#9ca3af' }),
                    }}
                  >
                    {tab.count}
                  </span>
                </button>
              );
            })}
          </div>

          {/* Search / Filter Row */}
          <div className="flex items-center gap-2.5">
            <div className="flex items-center gap-2 h-[34px] px-3 rounded border border-[#e5e7eb] bg-white w-[340px]">
              <Search size={14} color="#9ca3af" />
              <span className="text-[#9ca3af] text-[13px]" style={{ fontFamily: 'Inter, sans-serif' }}>
                Search by quote #, customer, SKU, email...
              </span>
            </div>
            {['All Status', 'All Time', 'All Values', 'Expiring'].map((f) => (
              <div
                key={f}
                className="flex items-center gap-1.5 h-[34px] px-3 rounded border border-[#e5e7eb] bg-white cursor-pointer"
              >
                <span className="text-[#6b7280] text-[13px]" style={{ fontFamily: 'Inter, sans-serif' }}>
                  {f}
                </span>
                {f !== 'Expiring' && <ChevronDown size={12} color="#9ca3af" />}
              </div>
            ))}
          </div>

          {/* Sort Row */}
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span className="text-[#6b7280] text-[12px]" style={{ fontFamily: 'Inter, sans-serif' }}>
                Sort by: <strong className="text-[#111827]">Date</strong>
              </span>
            </div>
            <div className="flex items-center gap-3">
              <span className="text-[#9ca3af] text-[12px]" style={{ fontFamily: 'Inter, sans-serif' }}>
                Showing 8 of 92
              </span>
              <span className="text-[#3b82f6] text-[12px] font-medium cursor-pointer" style={{ fontFamily: 'Inter, sans-serif' }}>
                Clear Filters
              </span>
            </div>
          </div>

          {/* Data Table */}
          <motion.div
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.2, duration: 0.3 }}
            className="flex-1 bg-white rounded-lg border border-[#e5e7eb] overflow-hidden"
          >
            {/* Header */}
            <div
              className="flex items-center h-11 px-4"
              style={{ backgroundColor: '#f9fafb', borderBottom: '1px solid #e5e7eb' }}
            >
              <div className="w-10 flex justify-center shrink-0">
                <div className="w-4 h-4 rounded-[3px] border border-[#d1d5db]" />
              </div>
              {[
                { label: 'Quote #', w: 'w-[130px]' },
                { label: 'Customer', w: 'flex-1' },
                { label: 'Status', w: 'w-[150px]' },
                { label: 'Total', w: 'w-[110px]' },
                { label: 'Date', w: 'w-[100px]' },
                { label: 'Actions', w: 'w-[140px]' },
              ].map((col) => (
                <div key={col.label} className={`${col.w} shrink-0`}>
                  <span className="text-[#6b7280] text-[12px] font-semibold" style={{ fontFamily: 'Inter, sans-serif' }}>
                    {col.label}
                  </span>
                </div>
              ))}
            </div>

            {/* Rows */}
            {tableRows.map((row) => (
              <div
                key={row.quote}
                className="flex items-center h-[50px] px-4"
                style={{
                  backgroundColor: row.highlight ? '#fef9c3' : '#ffffff',
                  borderBottom: '1px solid #e5e7eb',
                }}
              >
                <div className="w-10 flex justify-center shrink-0">
                  <div className="w-4 h-4 rounded-[3px] border border-[#d1d5db]" />
                </div>

                {/* Quote # */}
                <div className="w-[130px] shrink-0 flex flex-col gap-px">
                  <span className="text-[#3b82f6] text-[12px]" style={{ fontFamily: 'Inter, sans-serif' }}>
                    {row.quote}
                  </span>
                  <span className="text-[#9ca3af] text-[10px]" style={{ fontFamily: 'Inter, sans-serif' }}>
                    {row.rev}
                  </span>
                </div>

                {/* Customer */}
                <div className="flex-1 shrink-0 flex flex-col gap-px">
                  <span className="text-[#111827] text-[12px] font-semibold" style={{ fontFamily: 'Inter, sans-serif' }}>
                    {row.customer}
                  </span>
                  <span className="text-[#9ca3af] text-[10px]" style={{ fontFamily: 'Inter, sans-serif' }}>
                    {row.customer}
                  </span>
                </div>

                {/* Status */}
                <div className="w-[150px] shrink-0 flex items-center gap-1">
                  {row.statuses.map((s) => (
                    <span
                      key={s.label}
                      className="px-2 py-[3px] rounded-[3px] text-white text-[9px] font-bold"
                      style={{ fontFamily: 'Inter, sans-serif', backgroundColor: s.bg }}
                    >
                      {s.label}
                    </span>
                  ))}
                </div>

                {/* Total */}
                <div className="w-[110px] shrink-0">
                  <span className="text-[#111827] text-[12px]" style={{ fontFamily: 'Inter, sans-serif' }}>
                    {row.total}
                  </span>
                </div>

                {/* Date */}
                <div className="w-[100px] shrink-0">
                  <span className="text-[#6b7280] text-[12px]" style={{ fontFamily: 'Inter, sans-serif' }}>
                    {row.date}
                  </span>
                </div>

                {/* Actions */}
                <div className="w-[140px] shrink-0 flex items-center gap-1">
                  <button
                    className="px-2.5 py-1 rounded-[3px] bg-[#3b82f6] text-white text-[11px] font-medium"
                    style={{ fontFamily: 'Inter, sans-serif' }}
                  >
                    View
                  </button>
                  <button
                    className="px-2.5 py-1 rounded-[3px] bg-[#6b7280] text-white text-[11px] font-medium"
                    style={{ fontFamily: 'Inter, sans-serif' }}
                  >
                    Edit
                  </button>
                  <button
                    className="px-2.5 py-1 rounded-[3px] bg-[#ef4444] text-white text-[11px] font-medium"
                    style={{ fontFamily: 'Inter, sans-serif' }}
                  >
                    Delete
                  </button>
                </div>
              </div>
            ))}
          </motion.div>
        </div>
      </div>
    </div>
  );
}
