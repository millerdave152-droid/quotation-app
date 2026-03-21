/**
 * CustomerManagementNew.jsx — Screen 18
 * TeleTime Design System · Customer Management Page
 * Design frame: 2wnqA
 */

import { useState, useRef, useEffect, useCallback } from 'react';
import { useParams } from 'react-router-dom';
import { motion } from 'framer-motion';
import { AlertTriangle, BadgeCheck, Calendar, CalendarRange, ChevronDown, ChevronUp, ChevronsUpDown, Eye, LayoutGrid, Loader2, Pencil, Plus, RefreshCw, Search, Table2, Trash2, UserPlus, Users, X } from 'lucide-react';
// import QuotifySidebar from '../shared/QuotifySidebar'; // removed — MainLayout provides sidebar
import Customer360ViewNew from './Customer360ViewNew';
import { useToast } from '../ui/Toast';
import { authFetch } from '../../services/authFetch';
import { checkDuplicates } from '../../services/lookupService';

/* ------------------------------------------------------------------ */
/*  Constants                                                          */
/* ------------------------------------------------------------------ */

const TIER_STYLES = {
  Platinum: { bg: 'bg-purple-500/10', text: 'text-purple-600' },
  Gold: { bg: 'bg-amber-500/10', text: 'text-amber-600' },
  Silver: { bg: 'bg-slate-500/10', text: 'text-slate-600' },
  Bronze: { bg: 'bg-orange-500/10', text: 'text-orange-600' },
};

const PROVINCES = ['Ontario', 'Quebec', 'British Columbia', 'Alberta', 'Manitoba', 'Saskatchewan', 'Nova Scotia', 'New Brunswick', 'Newfoundland', 'PEI'];

const EMPTY_FORM = {
  firstName: '',
  lastName: '',
  email: '',
  phone: '',
  company: '',
  address: '',
  postalCode: '',
  province: 'Ontario',
  city: '',
  notes: '',
};

/* ------------------------------------------------------------------ */
/*  Form Field Components                                              */
/* ------------------------------------------------------------------ */

function FormInput({ label, placeholder, required, value, onChange, type = 'text' }) {
  return (
    <div className="flex flex-col gap-1.5 flex-1">
      <span className="text-foreground font-secondary text-sm font-medium">
        {label}
        {required && ' *'}
      </span>
      <input
        type={type}
        placeholder={placeholder}
        value={value}
        onChange={onChange}
        className="input input-bordered w-full h-10 rounded-lu-pill bg-background text-foreground font-secondary text-sm"
      />
    </div>
  );
}

function FormSelect({ label, options, value, onChange }) {
  return (
    <div className="flex flex-col gap-1.5 flex-1">
      <span className="text-foreground font-secondary text-sm font-medium">
        {label}
      </span>
      <select
        value={value}
        onChange={onChange}
        className="select select-bordered w-full h-10 rounded-lu-pill bg-background text-foreground font-secondary text-sm"
      >
        {options.map((opt) => (
          <option key={opt} value={opt}>
            {opt}
          </option>
        ))}
      </select>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Component                                                          */
/* ------------------------------------------------------------------ */

export default function CustomerManagementNew() {
  const { id: urlCustomerId } = useParams();
  const { addToast } = useToast();

  /* ── UI state ── */
  const [formOpen, setFormOpen] = useState(false);
  const [viewMode, setViewMode] = useState('table');

  /* ── Stats ── */
  const [stats, setStats] = useState(null);
  const [statsLoading, setStatsLoading] = useState(true);

  /* ── Customers table ── */
  const [customers, setCustomers] = useState([]);
  const [tableLoading, setTableLoading] = useState(true);

  /* ── Pagination ── */
  const [currentPage, setCurrentPage] = useState(1);
  const [perPage, setPerPage] = useState(20);
  const [totalCount, setTotalCount] = useState(0);
  const totalPages = Math.ceil(totalCount / perPage) || 1;

  /* ── Filters ── */
  const [searchTerm, setSearchTerm] = useState('');
  const [cityFilter, setCityFilter] = useState('');
  const [provinceFilter, setProvinceFilter] = useState('');
  const searchRef = useRef(null);
  const searchTimerRef = useRef(null);

  /* ── Form ── */
  const [formData, setFormData] = useState({ ...EMPTY_FORM });
  const [editingCustomerId, setEditingCustomerId] = useState(null);
  const [formSaving, setFormSaving] = useState(false);
  const [duplicateWarning, setDuplicateWarning] = useState(null);
  const dupTimerRef = useRef(null);

  /* ── Selected customer for 360 view ── */
  const [selectedCustomerId, setSelectedCustomerId] = useState(null);

  // Open 360 view if URL contains a customer ID
  useEffect(() => {
    if (urlCustomerId) {
      setSelectedCustomerId(urlCustomerId);
    }
  }, [urlCustomerId]);

  /* ────────────────────────────────────────────────────────────────── */
  /*  Data Fetching                                                     */
  /* ────────────────────────────────────────────────────────────────── */

  const fetchStats = useCallback(async () => {
    setStatsLoading(true);
    try {
      const res = await authFetch('/api/customers/stats/overview');
      if (!res.ok) throw new Error('Failed to fetch stats');
      const json = await res.json();
      // res.success wraps in { data: ... }
      setStats(json.data?.overview || json.overview || json);
    } catch (err) {
      console.error('Stats fetch error:', err);
    } finally {
      setStatsLoading(false);
    }
  }, []);

  const fetchCustomers = useCallback(async (page = currentPage, limit = perPage, search = searchTerm, city = cityFilter, province = provinceFilter) => {
    setTableLoading(true);
    try {
      const params = new URLSearchParams({ page: String(page), limit: String(limit) });
      if (search) params.append('search', search);
      if (city) params.append('city', city);
      if (province) params.append('province', province);

      const res = await authFetch(`/api/customers?${params}`);
      if (!res.ok) throw new Error('Failed to fetch customers');
      const json = await res.json();
      setCustomers(json.customers || []);
      setTotalCount(json.pagination?.total || 0);
      setCurrentPage(json.pagination?.page || page);
    } catch (err) {
      console.error('Customers fetch error:', err);
      addToast('Failed to load customers', 'error');
    } finally {
      setTableLoading(false);
    }
  }, [currentPage, perPage, searchTerm, cityFilter, provinceFilter, addToast]);

  /* Initial load */
  useEffect(() => {
    fetchStats();
    fetchCustomers(1, perPage, '', '', '');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /* ────────────────────────────────────────────────────────────────── */
  /*  Search + Filter handlers (debounced)                              */
  /* ────────────────────────────────────────────────────────────────── */

  const triggerSearch = useCallback((search, city, province) => {
    clearTimeout(searchTimerRef.current);
    searchTimerRef.current = setTimeout(() => {
      setCurrentPage(1);
      fetchCustomers(1, perPage, search, city, province);
    }, 300);
  }, [fetchCustomers, perPage]);

  const handleSearchChange = (e) => {
    const val = e.target.value;
    setSearchTerm(val);
    triggerSearch(val, cityFilter, provinceFilter);
  };

  const handleCityChange = (e) => {
    const val = e.target.value;
    setCityFilter(val);
    triggerSearch(searchTerm, val, provinceFilter);
  };

  const handleProvinceChange = (e) => {
    const val = e.target.value;
    setProvinceFilter(val === 'Province' ? '' : val);
    triggerSearch(searchTerm, cityFilter, val === 'Province' ? '' : val);
  };

  const clearAllFilters = () => {
    setSearchTerm('');
    setCityFilter('');
    setProvinceFilter('');
    setCurrentPage(1);
    fetchCustomers(1, perPage, '', '', '');
  };

  const hasActiveFilters = searchTerm || cityFilter || provinceFilter;

  /* ────────────────────────────────────────────────────────────────── */
  /*  Pagination                                                        */
  /* ────────────────────────────────────────────────────────────────── */

  const goToPage = (page) => {
    if (page < 1 || page > totalPages) return;
    setCurrentPage(page);
    fetchCustomers(page, perPage, searchTerm, cityFilter, provinceFilter);
  };

  const handlePerPageChange = (newPerPage) => {
    setPerPage(newPerPage);
    setCurrentPage(1);
    fetchCustomers(1, newPerPage, searchTerm, cityFilter, provinceFilter);
  };

  const getPageNumbers = () => {
    const pages = [];
    if (totalPages <= 5) {
      for (let i = 1; i <= totalPages; i++) pages.push(i);
    } else {
      pages.push(1);
      if (currentPage > 3) pages.push('...');
      const start = Math.max(2, currentPage - 1);
      const end = Math.min(totalPages - 1, currentPage + 1);
      for (let i = start; i <= end; i++) pages.push(i);
      if (currentPage < totalPages - 2) pages.push('...');
      pages.push(totalPages);
    }
    return pages;
  };

  /* ────────────────────────────────────────────────────────────────── */
  /*  Form + Duplicate Detection                                        */
  /* ────────────────────────────────────────────────────────────────── */

  const updateField = (field) => (e) => {
    const val = e.target.value;
    setFormData((prev) => ({ ...prev, [field]: val }));

    // Trigger duplicate check on name/email changes
    if (field === 'firstName' || field === 'lastName' || field === 'email') {
      clearTimeout(dupTimerRef.current);
      dupTimerRef.current = setTimeout(() => {
        const fullName = field === 'firstName'
          ? `${val} ${formData.lastName}`.trim()
          : field === 'lastName'
            ? `${formData.firstName} ${val}`.trim()
            : `${formData.firstName} ${formData.lastName}`.trim();
        const email = field === 'email' ? val : formData.email;
        if (fullName.length > 2 || email.length > 3) {
          checkDuplicates({ name: fullName, email })
            .then((result) => {
              if (result.hasDuplicates) {
                setDuplicateWarning(result.duplicates?.[0]?.name || 'Similar customer');
              } else {
                setDuplicateWarning(null);
              }
            })
            .catch(() => {});
        }
      }, 500);
    }
  };

  const fullName = `${formData.firstName} ${formData.lastName}`.trim();

  const resetForm = () => {
    setFormData({ ...EMPTY_FORM });
    setEditingCustomerId(null);
    setDuplicateWarning(null);
  };

  const handleSaveCustomer = async () => {
    if (!formData.firstName || !formData.email) {
      addToast('First name and email are required', 'warning');
      return;
    }

    setFormSaving(true);
    try {
      const payload = {
        name: fullName,
        email: formData.email,
        phone: formData.phone,
        company: formData.company,
        address: formData.address,
        postal_code: formData.postalCode,
        province: formData.province,
        city: formData.city,
        notes: formData.notes,
      };

      if (editingCustomerId) {
        // PUT update
        const res = await authFetch(`/api/customers/${editingCustomerId}`, {
          method: 'PUT',
          body: JSON.stringify(payload),
        });
        if (!res.ok) {
          const err = await res.json().catch(() => ({}));
          throw new Error(err.message || 'Failed to update customer');
        }
        addToast('Customer updated successfully', 'success');
      } else {
        // POST create
        const res = await authFetch('/api/customers', {
          method: 'POST',
          body: JSON.stringify(payload),
        });
        if (!res.ok) {
          const err = await res.json().catch(() => ({}));
          throw new Error(err.message || 'Failed to create customer');
        }
        addToast('Customer created successfully', 'success');
      }

      resetForm();
      setFormOpen(false);
      fetchStats();
      fetchCustomers(currentPage, perPage, searchTerm, cityFilter, provinceFilter);
    } catch (err) {
      addToast(err.message, 'error');
    } finally {
      setFormSaving(false);
    }
  };

  const handleDeleteCustomer = async (id, name) => {
    if (!window.confirm(`Delete customer "${name}"? This cannot be undone.`)) return;
    try {
      const res = await authFetch(`/api/customers/${id}`, { method: 'DELETE' });
      if (!res.ok) throw new Error('Failed to delete customer');
      addToast('Customer deleted', 'success');
      fetchStats();
      fetchCustomers(currentPage, perPage, searchTerm, cityFilter, provinceFilter);
    } catch (err) {
      addToast(err.message, 'error');
    }
  };

  const handleEditCustomer = (customer) => {
    const nameParts = (customer.name || '').split(' ');
    const firstName = nameParts[0] || '';
    const lastName = nameParts.slice(1).join(' ') || '';
    setFormData({
      firstName,
      lastName,
      email: customer.email || '',
      phone: customer.phone || '',
      company: customer.company || '',
      address: customer.address || '',
      postalCode: customer.postal_code || '',
      province: customer.province || 'Ontario',
      city: customer.city || '',
      notes: customer.notes || '',
    });
    setEditingCustomerId(customer.id);
    setFormOpen(true);
    setDuplicateWarning(null);
  };

  const handleViewCustomer = (id) => {
    setSelectedCustomerId(id);
  };

  const handleEditById = async (id) => {
    // Fetch full customer data and open edit form
    try {
      const res = await authFetch(`/api/customers/${id}`);
      if (!res.ok) throw new Error('Failed to fetch customer');
      const json = await res.json();
      const cust = json.data?.customer || json.data || json;
      handleEditCustomer(cust);
    } catch (err) {
      addToast('Failed to load customer for editing', 'error');
    }
  };

  /* ────────────────────────────────────────────────────────────────── */
  /*  Helpers                                                           */
  /* ────────────────────────────────────────────────────────────────── */

  const getInitials = (name) => {
    if (!name) return '??';
    const parts = name.split(' ');
    return (parts[0]?.[0] || '') + (parts[1]?.[0] || '');
  };

  const getTier = (customer) => {
    return customer.loyalty_tier || customer.clv_segment || 'Bronze';
  };

  const formatNumber = (n) => {
    if (n == null) return '0';
    return Number(n).toLocaleString();
  };

  /* ── Stats cards (computed from API data) ── */
  const statsCards = [
    { label: 'Total Customers', value: statsLoading ? '...' : formatNumber(stats?.total_customers), icon: Users, iconColor: 'var(--primary)', accent: 'border-t-primary' },
    { label: 'New This Month', value: statsLoading ? '...' : formatNumber(stats?.new_this_month), icon: Calendar, iconColor: '#10B981', accent: 'border-t-emerald-500' },
    { label: 'New This Week', value: statsLoading ? '...' : formatNumber(stats?.new_this_week), icon: CalendarRange, iconColor: '#2563EB', accent: 'border-t-blue-500' },
    { label: 'Showing', value: `${customers.length} of ${formatNumber(totalCount)}`, icon: Eye, iconColor: '#8B5CF6', accent: 'border-t-purple-500' },
  ];

  const showingStart = totalCount === 0 ? 0 : (currentPage - 1) * perPage + 1;
  const showingEnd = Math.min(currentPage * perPage, totalCount);

  return (
    <>
      {/* ── Main Content ── */}
      <motion.div
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.2 }}
        className="flex-1 flex flex-col gap-6 p-6 overflow-auto"
      >
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-foreground font-primary text-2xl font-semibold tracking-tight">
              Customers
            </h1>
            <p className="text-muted-foreground font-secondary text-sm mt-0.5">
              Manage your customer database and relationships.
            </p>
          </div>
          <div className="flex items-center gap-2">
            <motion.button
              whileHover={{ scale: 1.02 }}
              whileTap={{ scale: 0.97 }}
              onClick={() => { fetchStats(); fetchCustomers(currentPage, perPage, searchTerm, cityFilter, provinceFilter); }}
              className="flex items-center gap-1.5 h-10 px-4 rounded-lu-pill bg-background border border-border text-foreground font-primary text-sm font-medium shadow-lu-sm"
            >
              <RefreshCw size={16} className={tableLoading ? 'animate-spin' : ''} />
              Refresh
            </motion.button>
            <motion.button
              whileHover={{ scale: 1.02 }}
              whileTap={{ scale: 0.97 }}
              onClick={() => { resetForm(); setFormOpen(true); }}
              className="flex items-center gap-1.5 h-10 px-6 rounded-lu-pill bg-primary text-primary-foreground font-primary text-sm font-medium"
            >
              <Plus size={16} />
              Add Customer
            </motion.button>
          </div>
        </div>

        {/* Stats Row */}
        <div className="grid grid-cols-4 gap-4">
          {statsCards.map((card, i) => {
            const Icon = card.icon;
            return (
              <motion.div
                key={card.label}
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: i * 0.05, duration: 0.3 }}
                className={`bg-gradient-to-br from-card to-card/50 rounded-xl border border-border ${card.accent} border-t-2 p-5 flex flex-col gap-1.5 shadow-sm hover:shadow-md transition-shadow`}
              >
                <div className="flex items-center gap-2">
                  <Icon size={18} style={{ color: card.iconColor }} />
                  <span className="text-muted-foreground font-secondary text-xs font-medium">
                    {card.label}
                  </span>
                </div>
                <span className="text-foreground font-primary text-3xl font-bold tracking-tight">
                  {card.value}
                </span>
              </motion.div>
            );
          })}
        </div>

        {/* Add / Edit Customer Form */}
        <motion.div
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.15, duration: 0.3 }}
          className="bg-card border border-border rounded-xl shadow-sm overflow-hidden"
        >
          {/* Form Header */}
          <button
            onClick={() => setFormOpen(!formOpen)}
            className="flex items-center gap-2 w-full px-5 py-4 text-left"
          >
            <UserPlus size={20} className="text-primary" />
            <span className="text-foreground font-secondary text-[15px] font-semibold">
              {editingCustomerId ? 'Edit Customer' : 'Add New Customer'}
            </span>
            {formOpen ? (
              <ChevronUp size={20} className="text-muted-foreground ml-auto" />
            ) : (
              <ChevronDown size={20} className="text-muted-foreground ml-auto" />
            )}
          </button>

          {/* Form Body */}
          {formOpen && (
            <div className="flex flex-col gap-4 px-5 pb-5">
              {/* Duplicate Detection Banner */}
              {duplicateWarning && (
                <div className="flex items-start gap-2.5 p-4 bg-[#FEF3C7] rounded-lg">
                  <AlertTriangle size={18} className="text-[#D97706] shrink-0 mt-0.5" />
                  <div className="flex-1 flex flex-col gap-0.5">
                    <span className="text-[#92400E] font-secondary text-[13px] font-semibold">
                      Potential Duplicate Detected
                    </span>
                    <span className="text-[#92400E] font-secondary text-xs">
                      A customer with a similar name &quot;{duplicateWarning}&quot; already exists. Review before adding.
                    </span>
                  </div>
                  <X size={16} className="text-[#92400E] shrink-0 cursor-pointer" onClick={() => setDuplicateWarning(null)} />
                </div>
              )}

              {/* Name Preview */}
              {fullName && (
                <div className="flex items-center gap-2 px-4 py-2.5 bg-[#F0FDF4] rounded-lg">
                  <BadgeCheck size={18} className="text-[#10B981]" />
                  <span className="text-[#166534] font-secondary text-[13px] font-semibold">
                    Full Name: {fullName}
                  </span>
                </div>
              )}

              {/* Row 1 */}
              <div className="flex gap-4">
                <FormInput label="First Name" placeholder="John" required value={formData.firstName} onChange={updateField('firstName')} />
                <FormInput label="Last Name" placeholder="Anderson" required value={formData.lastName} onChange={updateField('lastName')} />
              </div>

              {/* Row 2 */}
              <div className="flex gap-4">
                <FormInput label="Email" placeholder="john@anderson.com" required value={formData.email} onChange={updateField('email')} />
                <FormInput label="Phone" placeholder="(416) 555-0189" value={formData.phone} onChange={updateField('phone')} />
              </div>

              {/* Row 3 */}
              <div className="flex gap-4">
                <FormInput label="Company" placeholder="Anderson Living Spaces" value={formData.company} onChange={updateField('company')} />
                <FormInput label="Address" placeholder="456 Oak Avenue" value={formData.address} onChange={updateField('address')} />
              </div>

              {/* Row 4 */}
              <div className="flex gap-4">
                <FormInput label="Postal Code" placeholder="M5V 2T6" value={formData.postalCode} onChange={updateField('postalCode')} />
                <FormSelect
                  label="Province"
                  options={PROVINCES}
                  value={formData.province}
                  onChange={updateField('province')}
                />
                <FormInput label="City" placeholder="Toronto" value={formData.city} onChange={updateField('city')} />
              </div>

              {/* Notes */}
              <div className="flex flex-col gap-1.5">
                <span className="text-foreground font-secondary text-sm font-medium">
                  Notes
                </span>
                <textarea
                  placeholder="Interested in living room furniture. Prefers modern styles."
                  value={formData.notes}
                  onChange={updateField('notes')}
                  className="textarea textarea-bordered w-full h-20 rounded-lu-md bg-background text-foreground font-secondary text-sm resize-none"
                />
              </div>

              {/* Actions */}
              <div className="flex justify-end gap-2">
                <motion.button
                  whileHover={{ scale: 1.02 }}
                  whileTap={{ scale: 0.97 }}
                  onClick={() => { resetForm(); setFormOpen(false); }}
                  className="flex items-center gap-1.5 h-10 px-4 rounded-lu-pill bg-background border border-border text-foreground font-primary text-sm font-medium shadow-lu-sm"
                >
                  Cancel
                </motion.button>
                <motion.button
                  whileHover={{ scale: 1.02 }}
                  whileTap={{ scale: 0.97 }}
                  onClick={handleSaveCustomer}
                  disabled={formSaving}
                  className="flex items-center gap-1.5 h-10 px-4 rounded-lu-pill bg-primary text-primary-foreground font-primary text-sm font-medium disabled:opacity-50"
                >
                  {formSaving ? <Loader2 size={16} className="animate-spin" /> : <Plus size={16} />}
                  {editingCustomerId ? 'Update Customer' : 'Save Customer'}
                </motion.button>
              </div>
            </div>
          )}
        </motion.div>

        {/* Filter Bar */}
        <div className="flex items-end gap-3 rounded-xl border border-border bg-card p-3">
          {/* Search */}
          <div className="flex items-center gap-2 w-[280px] h-10 px-3 border border-border rounded-sm bg-background">
            <Search size={16} className="text-muted-foreground shrink-0" />
            <input
              ref={searchRef}
              type="text"
              placeholder="Search..."
              value={searchTerm}
              onChange={handleSearchChange}
              className="flex-1 bg-transparent text-foreground font-secondary text-sm outline-none placeholder:text-muted-foreground"
            />
            {searchTerm && (
              <X size={16} className="text-foreground shrink-0 cursor-pointer" onClick={() => { setSearchTerm(''); triggerSearch('', cityFilter, provinceFilter); }} />
            )}
          </div>

          {/* City Filter */}
          <div className="flex flex-col gap-1.5 w-[160px]">
            <input
              type="text"
              placeholder="Filter by City..."
              value={cityFilter}
              onChange={handleCityChange}
              className="input input-bordered w-full h-10 rounded-lu-pill bg-background text-foreground font-secondary text-sm"
            />
          </div>

          {/* Province Filter */}
          <div className="flex flex-col gap-1.5 w-[160px]">
            <select
              value={provinceFilter || 'Province'}
              onChange={handleProvinceChange}
              className="select select-bordered w-full h-10 rounded-lu-pill bg-background text-muted-foreground font-secondary text-sm"
            >
              <option>Province</option>
              {PROVINCES.map((p) => (
                <option key={p} value={p}>{p}</option>
              ))}
            </select>
          </div>

          {/* Active Filters */}
          {hasActiveFilters && (
            <div className="flex items-center gap-1.5">
              {provinceFilter && (
                <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-[#FFF7ED] text-primary font-primary text-[11px] font-semibold">
                  {provinceFilter.substring(0, 2).toUpperCase()}
                  <X size={12} className="text-primary cursor-pointer" onClick={() => { setProvinceFilter(''); triggerSearch(searchTerm, cityFilter, ''); }} />
                </span>
              )}
              {cityFilter && (
                <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-[#FFF7ED] text-primary font-primary text-[11px] font-semibold">
                  {cityFilter}
                  <X size={12} className="text-primary cursor-pointer" onClick={() => { setCityFilter(''); triggerSearch(searchTerm, '', provinceFilter); }} />
                </span>
              )}
              <button onClick={clearAllFilters} className="text-primary font-secondary text-xs font-medium">
                Clear All
              </button>
            </div>
          )}

          {/* Spacer */}
          <div className="flex-1" />

          {/* View Toggle */}
          <div className="flex border border-border rounded-lg overflow-hidden">
            <button
              onClick={() => setViewMode('table')}
              className={`flex items-center gap-1 px-3 py-1.5 font-secondary text-xs font-semibold transition-colors ${
                viewMode === 'table'
                  ? 'bg-primary text-primary-foreground'
                  : 'bg-card text-muted-foreground'
              }`}
            >
              <Table2 size={16} />
              Table
            </button>
            <button
              onClick={() => setViewMode('card')}
              className={`flex items-center gap-1 px-3 py-1.5 font-secondary text-xs font-medium transition-colors ${
                viewMode === 'card'
                  ? 'bg-primary text-primary-foreground'
                  : 'bg-card text-muted-foreground'
              }`}
            >
              <LayoutGrid size={16} />
              Card
            </button>
          </div>
        </div>

        {/* Customer Table */}
        <motion.div
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.2, duration: 0.3 }}
          className="bg-card border border-border rounded-xl shadow-sm overflow-hidden"
        >
          {/* Table Header */}
          <div className="flex items-center bg-muted/50 px-5 py-3 border-b border-border/50">
            <div className="flex-1 flex items-center gap-1">
              <span className="text-muted-foreground font-secondary text-xs font-semibold uppercase tracking-wider">
                Name
              </span>
              <ChevronsUpDown size={14} className="text-muted-foreground" />
            </div>
            <div className="w-[200px] flex items-center gap-1">
              <span className="text-muted-foreground font-secondary text-xs font-semibold uppercase tracking-wider">
                Email
              </span>
              <ChevronsUpDown size={14} className="text-muted-foreground" />
            </div>
            <span className="w-[140px] text-muted-foreground font-secondary text-xs font-semibold uppercase tracking-wider">
              Phone
            </span>
            <div className="w-[160px] flex items-center gap-1">
              <span className="text-muted-foreground font-secondary text-xs font-semibold uppercase tracking-wider">
                Company
              </span>
              <ChevronsUpDown size={14} className="text-muted-foreground" />
            </div>
            <div className="w-[100px] flex items-center gap-1">
              <span className="text-muted-foreground font-secondary text-xs font-semibold uppercase tracking-wider">
                City
              </span>
              <ChevronsUpDown size={14} className="text-muted-foreground" />
            </div>
            <span className="w-[100px] text-right text-muted-foreground font-secondary text-xs font-semibold uppercase tracking-wider">
              Actions
            </span>
          </div>

          {/* Loading state */}
          {tableLoading && (
            <div className="flex flex-col gap-3 p-5">
              {[...Array(5)].map((_, i) => (
                <div key={i} className="flex items-center gap-4">
                  <div className="w-8 h-8 rounded-full bg-muted/60 animate-pulse" />
                  <div className="flex-1 h-4 rounded-xl bg-muted/60 animate-pulse" />
                  <div className="w-40 h-4 rounded-xl bg-muted/60 animate-pulse" />
                  <div className="w-28 h-4 rounded-xl bg-muted/60 animate-pulse" />
                </div>
              ))}
            </div>
          )}

          {/* Empty state */}
          {!tableLoading && customers.length === 0 && (
            <div className="flex flex-col items-center justify-center py-16 gap-3">
              <Users size={48} className="text-muted-foreground/40" />
              <span className="text-foreground font-secondary text-base font-medium">No customers found</span>
              <span className="text-muted-foreground font-secondary text-sm">Try adjusting your search or filters</span>
            </div>
          )}

          {/* Table Rows */}
          {!tableLoading && customers.map((c, i) => {
            const tier = getTier(c);
            const tierStyle = TIER_STYLES[tier] || TIER_STYLES.Bronze;
            const isIndividual = !c.company || c.company.toLowerCase() === 'individual';
            return (
              <div
                key={c.id || i}
                className="group flex items-center px-5 py-3.5 border-b border-border/50 hover:bg-muted/30 transition-colors"
              >
                {/* Name + Avatar + Tier */}
                <div className="flex-1 flex items-center gap-2.5">
                  <div className="w-8 h-8 rounded-full bg-secondary flex items-center justify-center shrink-0">
                    <span className="text-secondary-foreground font-primary text-[11px] font-semibold">
                      {getInitials(c.name)}
                    </span>
                  </div>
                  <div className="flex flex-col gap-0.5">
                    <span className="text-foreground font-secondary text-[13px] font-semibold">
                      {c.name}
                    </span>
                    <span
                      className={`inline-flex items-center w-fit px-2.5 py-0.5 rounded-full font-secondary text-xs font-medium ${tierStyle.bg} ${tierStyle.text}`}
                    >
                      {tier}
                    </span>
                  </div>
                </div>

                {/* Email */}
                <span className="w-[200px] text-muted-foreground font-secondary text-[13px]">
                  {c.email}
                </span>

                {/* Phone */}
                <span className="w-[140px] text-muted-foreground font-primary text-[13px]">
                  {c.phone}
                </span>

                {/* Company */}
                <span
                  className={`w-[160px] font-secondary text-[13px] ${
                    isIndividual
                      ? 'text-muted-foreground italic'
                      : 'text-foreground'
                  }`}
                >
                  {isIndividual ? 'Individual' : c.company}
                </span>

                {/* City */}
                <span className="w-[100px] text-muted-foreground font-secondary text-[13px]">
                  {c.city}
                </span>

                {/* Actions */}
                <div className="w-[100px] flex justify-end gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                  <button onClick={() => handleViewCustomer(c.id)} className="w-8 h-8 flex items-center justify-center rounded-lg bg-primary/10 text-primary hover:bg-primary/20 transition-colors">
                    <Eye size={14} />
                  </button>
                  <button onClick={() => handleEditCustomer(c)} className="w-8 h-8 flex items-center justify-center rounded-lg bg-muted text-muted-foreground hover:text-foreground transition-colors">
                    <Pencil size={14} />
                  </button>
                  <button onClick={() => handleDeleteCustomer(c.id, c.name)} className="w-8 h-8 flex items-center justify-center rounded-lg bg-red-500/10 text-red-500 hover:bg-red-500/20 transition-colors">
                    <Trash2 size={14} />
                  </button>
                </div>
              </div>
            );
          })}
        </motion.div>

        {/* Pagination */}
        <div className="flex items-center justify-between">
          <span className="text-muted-foreground font-secondary text-[13px]">
            {totalCount === 0
              ? 'No customers'
              : `Showing ${showingStart} to ${showingEnd} of ${formatNumber(totalCount)} customers`}
          </span>

          <div className="flex items-center gap-2">
            {/* Per Page */}
            <span className="text-muted-foreground font-secondary text-xs">
              Per page:
            </span>
            <select
              value={perPage}
              onChange={(e) => handlePerPageChange(Number(e.target.value))}
              className="flex items-center gap-1 px-2.5 py-1 bg-card border border-border rounded-md text-foreground font-secondary text-xs font-medium"
            >
              {[10, 20, 50, 100].map((n) => (
                <option key={n} value={n}>{n}</option>
              ))}
            </select>

            {/* Previous */}
            <motion.button
              whileHover={{ scale: 1.02 }}
              whileTap={{ scale: 0.97 }}
              onClick={() => goToPage(currentPage - 1)}
              disabled={currentPage <= 1}
              className="flex items-center gap-1.5 h-10 px-4 rounded-lu-pill bg-background border border-border text-foreground font-primary text-sm font-medium disabled:opacity-40"
            >
              Previous
            </motion.button>

            {/* Page Numbers */}
            <div className="flex items-center gap-0.5">
              {getPageNumbers().map((p, idx) =>
                p === '...' ? (
                  <span key={`ellipsis-${idx}`} className="text-muted-foreground font-secondary text-xs px-1">
                    ...
                  </span>
                ) : (
                  <button
                    key={p}
                    onClick={() => goToPage(p)}
                    className={`w-8 h-8 rounded-md font-secondary text-xs flex items-center justify-center ${
                      p === currentPage
                        ? 'bg-primary text-primary-foreground font-medium'
                        : 'text-foreground hover:bg-secondary'
                    }`}
                  >
                    {p}
                  </button>
                )
              )}
            </div>

            {/* Next */}
            <motion.button
              whileHover={{ scale: 1.02 }}
              whileTap={{ scale: 0.97 }}
              onClick={() => goToPage(currentPage + 1)}
              disabled={currentPage >= totalPages}
              className="flex items-center gap-1.5 h-10 px-4 rounded-lu-pill bg-primary text-primary-foreground font-primary text-sm font-medium disabled:opacity-40"
            >
              Next
            </motion.button>
          </div>
        </div>
      </motion.div>

      {/* ── Customer 360 View Overlay ── */}
      {selectedCustomerId && (
        <Customer360ViewNew
          customerId={selectedCustomerId}
          onClose={() => setSelectedCustomerId(null)}
          onEdit={(id) => {
            setSelectedCustomerId(null);
            handleEditById(id);
          }}
        />
      )}
    </>
  );
}
