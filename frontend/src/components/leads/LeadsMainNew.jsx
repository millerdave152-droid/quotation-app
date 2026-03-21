/**
 * LeadsMainNew.jsx
 * Screen 9 — Leads & Inquiries Main (Pencil frame Qu133)
 * Sidebar + main content: header, stats bar, filter panel + data table with pagination
 */

import { useState, useRef, useEffect } from 'react';
import { useParams } from 'react-router-dom';
import { motion } from 'framer-motion';
import {
  Search,
  TriangleAlert,
  Phone,
  Mail,
  FileText,
  ArrowRight,
  Calendar,
  RefreshCw,
  Plus,
  X,
} from 'lucide-react';
// import LunarisSidebar from '../shared/LunarisSidebar'; // removed — MainLayout provides sidebar
import PaginationBar from '../shared/PaginationBar';
import { useLeads, useLeadStats, createLead, addLeadActivity } from './hooks/useLeads';
import { useToast } from '../ui/Toast';
import LeadQuickCaptureNew from './LeadQuickCaptureNew';
import LeadDetailNew from './LeadDetailNew';
import ConvertToQuoteNew from './ConvertToQuoteNew';

// ─── Style Maps ───────────────────────────────────────────────

const statusChips = [
  { label: 'New', value: 'new' },
  { label: 'Contacted', value: 'contacted' },
  { label: 'Qualified', value: 'qualified' },
  { label: 'Quote Created', value: 'quote_created' },
  { label: 'Converted', value: 'converted' },
  { label: 'Lost', value: 'lost' },
];

const priorityChips = [
  { label: 'Hot', value: 'hot', bg: 'bg-red-500/10', text: 'text-red-600' },
  { label: 'Warm', value: 'warm', bg: 'bg-amber-500/10', text: 'text-amber-600' },
  { label: 'Cold', value: 'cold', bg: 'bg-blue-500/10', text: 'text-blue-600' },
];

const tableColumns = [
  { label: 'Lead', width: 'w-[160px]' },
  { label: 'Score', width: 'w-[70px]' },
  { label: 'Contact', width: 'w-[160px]' },
  { label: 'Source', width: 'w-[90px]' },
  { label: 'Timeline', width: 'w-[90px]' },
  { label: 'Status', width: 'w-[90px]' },
  { label: 'Priority', width: 'w-[70px]' },
  { label: 'Follow-up', width: 'w-[90px]' },
  { label: 'Actions', width: 'flex-1' },
];

const SCORE_STYLES = {
  A: { text: 'text-emerald-600', bg: 'bg-emerald-500/10' },
  B: { text: 'text-blue-600', bg: 'bg-blue-500/10' },
  C: { text: 'text-amber-600', bg: 'bg-amber-500/10' },
  D: { text: 'text-red-600', bg: 'bg-red-500/10' },
};

const TIMELINE_STYLES = {
  ASAP: { bg: 'bg-amber-500/10', text: 'text-amber-600' },
  '1-2 Weeks': { bg: 'bg-amber-500/10', text: 'text-amber-600' },
  '3-6 Mo.': { bg: 'bg-muted', text: 'text-muted-foreground' },
  '1-3 Mo.': { bg: 'bg-muted', text: 'text-muted-foreground' },
};

const STATUS_STYLES = {
  new: { bg: 'bg-violet-500/10', text: 'text-violet-600' },
  contacted: { bg: 'bg-blue-500/10', text: 'text-blue-600' },
  qualified: { bg: 'bg-emerald-500/10', text: 'text-emerald-600' },
  quote_created: { bg: 'bg-blue-500/10', text: 'text-blue-600' },
  converted: { bg: 'bg-green-500/10', text: 'text-green-600' },
  lost: { bg: 'bg-red-500/10', text: 'text-red-600' },
};

const PRIORITY_STYLES = {
  hot: { bg: 'bg-red-500/10', text: 'text-red-600' },
  warm: { bg: 'bg-amber-500/10', text: 'text-amber-600' },
  cold: { bg: 'bg-blue-500/10', text: 'text-blue-600' },
};

// ─── Helpers ──────────────────────────────────────────────────

const scoreGrade = (score) => {
  if (!score && score !== 0) return 'D';
  if (score >= 75) return 'A';
  if (score >= 50) return 'B';
  if (score >= 25) return 'C';
  return 'D';
};

const statusDisplay = (s) => {
  const map = {
    new: 'New', contacted: 'Contacted', qualified: 'Qualified',
    quote_created: 'Quote Created', converted: 'Converted', lost: 'Lost',
  };
  return map[s] || s || '\u2014';
};

const formatFollowUp = (dateStr) => {
  if (!dateStr) return { text: '\u2014', className: 'text-muted-foreground' };
  const d = new Date(dateStr);
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const target = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  const diff = Math.floor((target - today) / 86400000);
  if (diff < 0) return { text: 'Overdue', className: 'text-red-600 font-semibold' };
  if (diff === 0) return { text: 'Today', className: 'text-amber-600 font-semibold' };
  if (diff === 1) return { text: 'Tomorrow', className: 'text-blue-600' };
  return {
    text: d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
    className: 'text-muted-foreground',
  };
};

// ─── Component ────────────────────────────────────────────────

export default function LeadsMainNew() {
  const { id: urlLeadId } = useParams();
  const toast = useToast();
  const [activeTab, setActiveTab] = useState('leads');
  const [showCapture, setShowCapture] = useState(false);
  const [selectedLeadId, setSelectedLeadId] = useState(null);
  const [showConvertModal, setShowConvertModal] = useState(false);
  const [convertLead, setConvertLead] = useState(null);
  const [searchInput, setSearchInput] = useState('');
  const searchTimer = useRef(null);

  /* Step 1 — hooks */
  const {
    leads, loading, pagination, filters,
    updateFilters, setPage, refresh: refreshLeads,
  } = useLeads({ initialLimit: 25 });

  const { stats, refresh: refreshStats } = useLeadStats();

  // Open detail panel if URL contains a lead ID
  useEffect(() => {
    if (urlLeadId) {
      setSelectedLeadId(urlLeadId);
    }
  }, [urlLeadId]);

  /* Step 2 — live stats cards */
  const liveStats = [
    { label: 'Total', value: stats?.total ?? '\u2014', color: 'text-foreground', accent: 'border-t-blue-500' },
    { label: 'New', value: stats?.new_count ?? '\u2014', color: 'text-violet-600', accent: 'border-t-violet-500' },
    { label: 'Contacted', value: stats?.contacted_count ?? '\u2014', color: 'text-blue-600', accent: 'border-t-blue-500' },
    { label: 'Qualified', value: stats?.qualified_count ?? '\u2014', color: 'text-emerald-600', accent: 'border-t-emerald-500' },
    { label: 'Hot', value: stats?.hot_count ?? '\u2014', color: 'text-red-600', accent: 'border-t-red-500' },
    { label: 'Follow-ups Today', value: stats?.follow_up_today ?? '\u2014', color: 'text-primary', accent: 'border-t-orange-500' },
    { label: 'Overdue', value: stats?.overdue_follow_ups ?? '\u2014', color: 'text-red-600', accent: 'border-t-red-500' },
  ];

  /* Step 3 — search with 300 ms debounce */
  const handleSearchChange = (e) => {
    const val = e.target.value;
    setSearchInput(val);
    clearTimeout(searchTimer.current);
    searchTimer.current = setTimeout(() => {
      updateFilters({ search: val });
    }, 300);
  };

  /* Step 4 — filter chip toggles */
  const handleStatusFilter = (value) => {
    updateFilters({ status: filters.status === value ? '' : value });
  };

  const handlePriorityFilter = (value) => {
    updateFilters({ priority: filters.priority === value ? '' : value });
  };

  const handleClearFilters = () => {
    setSearchInput('');
    updateFilters({ search: '', status: '', priority: '', assignedTo: '' });
  };

  /* Step 9 — row quick-actions */
  const handleQuickCall = async (lead) => {
    try {
      await addLeadActivity(lead.id, 'call', `Outbound call to ${lead.contact_name}`);
      toast.success(`Call logged for ${lead.contact_name}`);
    } catch {
      toast.error('Failed to log call');
    }
  };

  const handleQuickEmail = async (lead) => {
    try {
      await addLeadActivity(lead.id, 'email', `Email sent to ${lead.contact_name}`);
      toast.success(`Email logged for ${lead.contact_name}`);
    } catch {
      toast.error('Failed to log email');
    }
  };

  const handleViewLead = (lead) => {
    setSelectedLeadId(lead.id);
  };

  /* Step 10 — quick capture save */
  const handleQuickCaptureSave = async (data) => {
    await createLead(data);
    toast.success('Lead created successfully');
    setShowCapture(false);
    refreshLeads();
    refreshStats();
  };

  /* Step 11 — refresh + export */
  const handleRefresh = () => {
    refreshLeads();
    refreshStats();
  };

  const handleExport = () => {
    if (!leads.length) {
      toast.warning('No leads to export');
      return;
    }
    const headers = ['Lead #', 'Name', 'Email', 'Phone', 'Source', 'Status', 'Priority', 'Score', 'Follow-up'];
    const rows = leads.map((l) => [
      l.lead_number, l.contact_name, l.contact_email, l.contact_phone,
      l.source, l.status, l.priority, l.lead_score, l.follow_up_date || '',
    ]);
    const csv = [headers, ...rows]
      .map((r) => r.map((c) => `"${(c ?? '').toString().replace(/"/g, '""')}"`).join(','))
      .join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `leads-export-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
    toast.success('Leads exported');
  };

  return (
    <>
      {/* ═══════════════════════════════════════════
          MAIN CONTENT
          ═══════════════════════════════════════════ */}
      <motion.div
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.2 }}
        className="flex-1 flex flex-col overflow-hidden"
      >
        {/* ─── Page Header ─── */}
        <div className="flex items-center justify-between px-6 py-5 border-b border-border/50 shrink-0">
          <div className="flex flex-col gap-0.5">
            <h1 className="font-primary text-2xl font-semibold tracking-tight text-foreground">
              Leads &amp; Inquiries
            </h1>
            <p className="font-secondary text-sm text-muted-foreground">
              Capture and track customer inquiries before formal quotes
            </p>
          </div>
          <div className="flex items-center gap-2.5">
            {/* Toggle Tabs */}
            <div className="flex items-center h-10 bg-secondary rounded-full p-1 gap-2">
              <button
                onClick={() => setActiveTab('analytics')}
                className={`font-secondary text-sm px-3 py-1.5 rounded-full transition-colors ${
                  activeTab === 'analytics'
                    ? 'bg-background shadow-sm text-foreground font-medium'
                    : 'text-muted-foreground'
                }`}
              >
                Analytics
              </button>
              <button
                onClick={() => setActiveTab('leads')}
                className={`font-secondary text-sm px-3 py-1.5 rounded-full transition-colors ${
                  activeTab === 'leads'
                    ? 'bg-background shadow-sm text-foreground font-medium'
                    : 'text-muted-foreground'
                }`}
              >
                View Leads
              </button>
            </div>
            {/* Quick Capture */}
            <button
              onClick={() => setShowCapture(true)}
              className="flex items-center gap-1.5 h-10 px-4 rounded-full border border-border bg-background shadow-sm font-primary text-sm font-medium text-foreground"
            >
              <Plus size={20} />
              Quick Capture
            </button>
            {/* New Lead */}
            <motion.button
              whileHover={{ scale: 1.03 }}
              whileTap={{ scale: 0.97 }}
              onClick={() => setShowCapture(true)}
              className="flex items-center gap-1.5 h-10 px-4 rounded-full bg-primary font-primary text-sm font-medium text-primary-foreground"
            >
              + New Lead
            </motion.button>
          </div>
        </div>

        {/* ─── Stats Bar ─── */}
        <div className="flex items-center gap-3 px-6 py-4 shrink-0">
          {liveStats.map((card, i) => (
            <motion.div
              key={card.label}
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: i * 0.05, duration: 0.3 }}
              className={`flex-1 bg-gradient-to-br from-card to-card/50 rounded-xl p-4 border border-border ${card.accent} border-t-2 flex flex-col gap-1 shadow-sm hover:shadow-md transition-shadow`}
            >
              <span className="font-secondary text-xs font-medium text-muted-foreground">{card.label}</span>
              <span className={`font-primary text-3xl font-bold tracking-tight ${card.color}`}>{card.value}</span>
            </motion.div>
          ))}
        </div>

        {/* ─── Body Area ─── */}
        <div className="flex flex-1 overflow-hidden">
          {/* Filter Panel (240px) */}
          <div className="w-[240px] shrink-0 bg-card border-r border-border/50 p-4 flex flex-col gap-4 overflow-y-auto">
            <span className="font-primary text-sm font-semibold text-foreground">Filters</span>

            {/* Search */}
            <div className="relative">
              <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground" />
              <input
                type="text"
                value={searchInput}
                onChange={handleSearchChange}
                placeholder="Search leads..."
                className="w-full h-9 pl-8 pr-3 bg-background border border-border rounded-lg font-secondary text-sm text-foreground outline-none placeholder:text-muted-foreground focus:border-primary transition"
              />
            </div>

            {/* Status Filter */}
            <div className="flex flex-col gap-2">
              <span className="font-secondary text-xs font-semibold text-foreground">Status</span>
              <div className="flex flex-wrap gap-1.5">
                {statusChips.map((chip) => (
                  <button
                    key={chip.value}
                    onClick={() => handleStatusFilter(chip.value)}
                    className={`font-secondary text-[11px] font-medium px-2.5 py-1 rounded-full transition-colors ${
                      filters.status === chip.value
                        ? 'bg-primary text-primary-foreground'
                        : 'bg-secondary text-secondary-foreground hover:opacity-80'
                    }`}
                  >
                    {chip.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Priority Filter */}
            <div className="flex flex-col gap-2">
              <span className="font-secondary text-xs font-semibold text-foreground">Priority</span>
              <div className="flex flex-wrap gap-1.5">
                {priorityChips.map((chip) => (
                  <button
                    key={chip.value}
                    onClick={() => handlePriorityFilter(chip.value)}
                    className={`font-secondary text-[11px] font-medium px-2.5 py-1 rounded-full transition-colors ${
                      filters.priority === chip.value
                        ? `ring-2 ring-primary ${chip.bg} ${chip.text}`
                        : `${chip.bg} ${chip.text} hover:opacity-80`
                    }`}
                  >
                    {chip.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Clear Filters */}
            <button
              onClick={handleClearFilters}
              className="flex items-center justify-center gap-1.5 h-10 rounded-full border border-border font-primary text-sm font-medium text-foreground w-full"
            >
              <X size={20} />
              Clear All Filters
            </button>
          </div>

          {/* Lead List Panel */}
          <div className="flex-1 flex flex-col overflow-hidden">
            {/* Follow-up Alerts */}
            {(stats?.overdue_follow_ups > 0 || stats?.follow_up_today > 0) && (
              <div className="flex items-center gap-3 bg-red-500/10 border border-red-500/20 rounded-xl mx-4 mt-3 px-4 py-2.5 shrink-0">
                <TriangleAlert size={16} className="text-red-600" />
                {stats.overdue_follow_ups > 0 && (
                  <span className="bg-red-600 text-white font-secondary text-[11px] font-semibold px-2.5 py-0.5 rounded-full">
                    {stats.overdue_follow_ups} overdue
                  </span>
                )}
                {stats.follow_up_today > 0 && (
                  <span className="bg-amber-500 text-white font-secondary text-[11px] font-semibold px-2.5 py-0.5 rounded-full">
                    {stats.follow_up_today} due today
                  </span>
                )}
              </div>
            )}

            {/* List Header */}
            <div className="flex items-center justify-between px-5 py-3 border-b border-border/50 shrink-0">
              <span className="font-primary text-[15px] font-semibold text-foreground">
                Leads ({pagination.total})
              </span>
              <div className="flex items-center gap-2">
                <button
                  onClick={handleExport}
                  className="flex items-center gap-1.5 h-10 px-4 rounded-full border border-border font-primary text-sm font-medium text-foreground"
                >
                  Export CSV
                </button>
                <button
                  onClick={handleRefresh}
                  className="flex items-center justify-center w-10 h-10 rounded-full bg-primary"
                >
                  <RefreshCw size={16} className="text-primary-foreground" />
                </button>
              </div>
            </div>

            {/* Table */}
            <div className="flex-1 overflow-y-auto">
              {/* Header Row */}
              <div className="flex items-center bg-muted/50 border-b border-border/50 px-0 shrink-0">
                <div className="w-10 flex items-center justify-center h-10">
                  <div className="w-4 h-4 rounded border border-border" />
                </div>
                {tableColumns.map((col) => (
                  <div key={col.label} className={`${col.width} px-2 py-2`}>
                    <span className="font-secondary text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                      {col.label}
                    </span>
                  </div>
                ))}
              </div>

              {/* Loading */}
              {loading && (
                <div className="px-4 py-2">
                  {Array.from({ length: 6 }).map((_, i) => (
                    <div key={i} className="flex items-center h-11 gap-4 border-b border-border/50">
                      <div className="w-10 h-4 bg-muted rounded animate-pulse" />
                      <div className="w-[160px] h-4 bg-muted rounded animate-pulse" />
                      <div className="w-[70px] h-4 bg-muted rounded animate-pulse" />
                      <div className="flex-1 h-4 bg-muted rounded animate-pulse" />
                      <div className="w-[90px] h-4 bg-muted rounded animate-pulse" />
                      <div className="w-[90px] h-4 bg-muted rounded animate-pulse" />
                    </div>
                  ))}
                </div>
              )}

              {/* Empty */}
              {!loading && leads.length === 0 && (
                <div className="flex flex-col items-center justify-center py-20 gap-3">
                  <FileText size={48} className="text-muted-foreground/30" />
                  <h3 className="font-secondary text-lg font-semibold text-foreground">No leads found</h3>
                  <p className="font-secondary text-sm text-muted-foreground">Try adjusting your search or filters</p>
                </div>
              )}

              {/* Data Rows */}
              {!loading && leads.map((lead, idx) => {
                const grade = scoreGrade(lead.lead_score);
                const sc = SCORE_STYLES[grade];
                const tl = TIMELINE_STYLES[lead.timeline] || { bg: 'bg-muted', text: 'text-muted-foreground' };
                const st = STATUS_STYLES[lead.status] || { bg: 'bg-muted', text: 'text-foreground' };
                const pr = PRIORITY_STYLES[lead.priority] || { bg: 'bg-muted', text: 'text-muted-foreground' };
                const fu = formatFollowUp(lead.follow_up_date);
                const isLost = lead.status === 'lost';

                return (
                  <motion.div
                    key={lead.id}
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    transition={{ delay: idx * 0.03 }}
                    className={`group flex items-center border-b border-border/50 hover:bg-muted/30 transition-colors cursor-pointer ${isLost ? 'bg-red-500/5' : ''}`}
                  >
                    {/* Checkbox */}
                    <div className="w-10 flex items-center justify-center h-11">
                      <div className="w-4 h-4 rounded border border-border" />
                    </div>

                    {/* Lead */}
                    <div className="w-[160px] px-3 py-1.5 flex flex-col gap-px">
                      <span className="font-secondary text-[13px] font-semibold text-foreground">{lead.contact_name}</span>
                      <span className="font-primary text-[11px] text-muted-foreground">{lead.lead_number}</span>
                    </div>

                    {/* Score */}
                    <div className="w-[70px] px-1.5 flex items-center gap-1">
                      <span className={`font-primary text-xs font-bold ${sc.text}`}>{lead.lead_score ?? '\u2014'}</span>
                      <span className={`font-primary text-[10px] font-bold px-[5px] py-px rounded-full ${sc.bg} ${sc.text}`}>
                        {grade}
                      </span>
                    </div>

                    {/* Contact */}
                    <div className="w-[160px] px-3 py-1.5 flex flex-col gap-px">
                      <span className="font-secondary text-[11px] text-muted-foreground">{lead.contact_email || '\u2014'}</span>
                      <span className="font-secondary text-[11px] text-muted-foreground">{lead.contact_phone || '\u2014'}</span>
                    </div>

                    {/* Source */}
                    <div className="w-[90px] px-1.5">
                      <span className="font-secondary text-xs text-foreground">{lead.source || '\u2014'}</span>
                    </div>

                    {/* Timeline */}
                    <div className="w-[90px] px-1.5">
                      <span className={`${tl.bg} ${tl.text} font-primary text-[10px] font-semibold px-2 py-0.5 rounded-full`}>
                        {lead.timeline || '\u2014'}
                      </span>
                    </div>

                    {/* Status */}
                    <div className="w-[90px] px-1.5 flex flex-col gap-0.5">
                      <span className={`${st.bg} ${st.text} font-secondary text-[10px] font-semibold px-2.5 py-0.5 rounded-full inline-block w-fit`}>
                        {statusDisplay(lead.status)}
                      </span>
                      {lead.lost_reason && (
                        <span className="font-secondary text-[9px] text-muted-foreground">{lead.lost_reason}</span>
                      )}
                    </div>

                    {/* Priority */}
                    <div className="w-[70px] px-1.5">
                      <span className={`${pr.bg} ${pr.text} font-secondary text-[10px] font-bold px-2 py-0.5 rounded-full`}>
                        {(lead.priority || '').toUpperCase()}
                      </span>
                    </div>

                    {/* Follow-up */}
                    <div className="w-[90px] px-1.5">
                      <span className={`font-secondary text-xs ${fu.className}`}>{fu.text}</span>
                    </div>

                    {/* Actions */}
                    <div className="flex-1 flex items-center gap-1 px-1.5 opacity-0 group-hover:opacity-100 transition-opacity">
                      <button onClick={(e) => { e.stopPropagation(); handleQuickCall(lead); }} className="w-7 h-7 flex items-center justify-center rounded-lg bg-emerald-500/10 text-emerald-600 hover:bg-emerald-500/20 transition-colors">
                        <Phone size={13} />
                      </button>
                      <button onClick={(e) => { e.stopPropagation(); handleQuickEmail(lead); }} className="w-7 h-7 flex items-center justify-center rounded-lg bg-blue-500/10 text-blue-600 hover:bg-blue-500/20 transition-colors">
                        <Mail size={13} />
                      </button>
                      <button onClick={(e) => { e.stopPropagation(); handleViewLead(lead); }} className="w-7 h-7 flex items-center justify-center rounded-lg bg-primary/10 text-primary hover:bg-primary/20 transition-colors">
                        <FileText size={13} />
                      </button>
                      <button onClick={(e) => { e.stopPropagation(); handleViewLead(lead); }} className="w-7 h-7 flex items-center justify-center rounded-lg bg-muted text-muted-foreground hover:text-foreground transition-colors">
                        <ArrowRight size={13} />
                      </button>
                      <button onClick={(e) => { e.stopPropagation(); toast.info('Schedule follow-up \u2014 coming in Sprint 2'); }} className="w-7 h-7 flex items-center justify-center rounded-lg bg-muted text-muted-foreground hover:text-foreground transition-colors">
                        <Calendar size={13} />
                      </button>
                    </div>
                  </motion.div>
                );
              })}
            </div>

            <PaginationBar
              current={pagination.page}
              total={pagination.total}
              perPage={pagination.limit}
              label="leads"
              onPageChange={setPage}
            />
          </div>
        </div>
      </motion.div>

      {/* Quick Capture Overlay */}
      {showCapture && (
        <LeadQuickCaptureNew
          onSave={handleQuickCaptureSave}
          onClose={() => setShowCapture(false)}
        />
      )}

      {/* Lead Detail Panel */}
      {selectedLeadId && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-end">
          <LeadDetailNew
            leadId={selectedLeadId}
            onClose={() => setSelectedLeadId(null)}
            onConvert={(lead) => {
              setConvertLead(lead);
              setShowConvertModal(true);
              setSelectedLeadId(null);
            }}
          />
        </div>
      )}

      {/* Convert to Quote Modal */}
      {showConvertModal && convertLead && (
        <ConvertToQuoteNew
          lead={convertLead}
          onClose={() => setShowConvertModal(false)}
          onConvert={() => {
            setShowConvertModal(false);
            refreshLeads();
            refreshStats();
          }}
        />
      )}
    </>
  );
}
