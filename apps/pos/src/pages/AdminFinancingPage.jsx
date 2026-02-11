import React, { useState, useEffect, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  DollarSign,
  Clock,
  CheckCircle,
  XCircle,
  AlertTriangle,
  FileText,
  Users,
  TrendingUp,
  Filter,
  Search,
  ChevronDown,
  ChevronUp,
  Phone,
  Mail,
  Calendar,
  Eye,
  ThumbsUp,
  ThumbsDown,
  RefreshCw,
  Download,
  AlertCircle,
  ArrowLeft,
} from 'lucide-react';
import financingApi from '../api/financing';

// Helper to format currency
const formatCurrency = (cents) => {
  if (cents == null) return '$0.00';
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
  }).format(cents / 100);
};

// Helper to format date
const formatDate = (dateStr) => {
  if (!dateStr) return '-';
  return new Date(dateStr).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
};

// Status badge component
function StatusBadge({ status, size = 'md' }) {
  const statusConfig = {
    pending: { color: 'bg-yellow-100 text-yellow-800', icon: Clock, label: 'Pending' },
    approved: { color: 'bg-green-100 text-green-800', icon: CheckCircle, label: 'Approved' },
    declined: { color: 'bg-red-100 text-red-800', icon: XCircle, label: 'Declined' },
    active: { color: 'bg-blue-100 text-blue-800', icon: TrendingUp, label: 'Active' },
    paid_off: { color: 'bg-gray-100 text-gray-800', icon: CheckCircle, label: 'Paid Off' },
    defaulted: { color: 'bg-red-100 text-red-800', icon: AlertTriangle, label: 'Defaulted' },
    more_info: { color: 'bg-orange-100 text-orange-800', icon: AlertCircle, label: 'More Info' },
  };

  const config = statusConfig[status] || { color: 'bg-gray-100 text-gray-800', icon: Clock, label: status };
  const Icon = config.icon;
  const sizeClasses = size === 'sm' ? 'px-2 py-0.5 text-xs' : 'px-3 py-1 text-sm';

  return (
    <span className={`inline-flex items-center gap-1 rounded-full font-medium ${config.color} ${sizeClasses}`}>
      <Icon className={size === 'sm' ? 'w-3 h-3' : 'w-4 h-4'} />
      {config.label}
    </span>
  );
}

// Risk level badge for collections
function RiskBadge({ level }) {
  const riskConfig = {
    critical: { color: 'bg-red-600 text-white', label: '90+ Days' },
    high: { color: 'bg-red-100 text-red-800', label: '60-90 Days' },
    medium: { color: 'bg-orange-100 text-orange-800', label: '30-60 Days' },
    low: { color: 'bg-yellow-100 text-yellow-800', label: '< 30 Days' },
  };

  const config = riskConfig[level] || riskConfig.low;

  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${config.color}`}>
      {config.label}
    </span>
  );
}

// Dashboard stat card
function StatCard({ title, value, subValue, icon: Icon, color = 'blue', trend }) {
  const colorClasses = {
    blue: 'bg-blue-50 text-blue-600',
    green: 'bg-green-50 text-green-600',
    yellow: 'bg-yellow-50 text-yellow-600',
    red: 'bg-red-50 text-red-600',
    purple: 'bg-purple-50 text-purple-600',
  };

  return (
    <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-4">
      <div className="flex items-center justify-between">
        <div className={`p-2 rounded-lg ${colorClasses[color]}`}>
          <Icon className="w-5 h-5" />
        </div>
        {trend && (
          <span className={`text-xs font-medium ${trend > 0 ? 'text-green-600' : 'text-red-600'}`}>
            {trend > 0 ? '+' : ''}{trend}%
          </span>
        )}
      </div>
      <div className="mt-3">
        <p className="text-2xl font-bold text-gray-900">{value}</p>
        <p className="text-sm text-gray-500">{title}</p>
        {subValue && <p className="text-xs text-gray-400 mt-1">{subValue}</p>}
      </div>
    </div>
  );
}

// Tabs component
function Tabs({ tabs, activeTab, onChange }) {
  return (
    <div className="border-b border-gray-200">
      <nav className="flex space-x-8">
        {tabs.map((tab) => (
          <button
            key={tab.id}
            onClick={() => onChange(tab.id)}
            className={`py-3 px-1 border-b-2 font-medium text-sm whitespace-nowrap ${
              activeTab === tab.id
                ? 'border-blue-500 text-blue-600'
                : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
            }`}
          >
            {tab.label}
            {tab.count != null && (
              <span className={`ml-2 px-2 py-0.5 rounded-full text-xs ${
                activeTab === tab.id ? 'bg-blue-100 text-blue-600' : 'bg-gray-100 text-gray-600'
              }`}>
                {tab.count}
              </span>
            )}
          </button>
        ))}
      </nav>
    </div>
  );
}

// Application row component
function ApplicationRow({ application, onApprove, onDecline, onViewDetails, isExpanded, onToggleExpand }) {
  const canManualApprove = application.status === 'pending' || application.status === 'more_info';

  return (
    <>
      <tr className="hover:bg-gray-50 transition-colors">
        <td className="px-4 py-3">
          <button onClick={onToggleExpand} className="text-gray-400 hover:text-gray-600">
            {isExpanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
          </button>
        </td>
        <td className="px-4 py-3">
          <div className="font-medium text-gray-900">{application.application_number}</div>
          <div className="text-xs text-gray-500">{formatDate(application.created_at)}</div>
        </td>
        <td className="px-4 py-3">
          <div className="font-medium text-gray-900">{application.customer_name}</div>
          <div className="text-xs text-gray-500">{application.customer_email}</div>
        </td>
        <td className="px-4 py-3">
          <div className="text-sm text-gray-900">{application.plan_name || 'N/A'}</div>
          <div className="text-xs text-gray-500">{application.provider}</div>
        </td>
        <td className="px-4 py-3 text-right">
          <div className="font-medium text-gray-900">{formatCurrency(application.amount_cents)}</div>
        </td>
        <td className="px-4 py-3">
          <StatusBadge status={application.status} size="sm" />
        </td>
        <td className="px-4 py-3">
          <div className="flex items-center gap-2 justify-end">
            <button
              onClick={onViewDetails}
              className="p-1.5 text-gray-400 hover:text-blue-600 hover:bg-blue-50 rounded"
              title="View Details"
            >
              <Eye className="w-4 h-4" />
            </button>
            {canManualApprove && (
              <>
                <button
                  onClick={() => onApprove(application.id)}
                  className="p-1.5 text-gray-400 hover:text-green-600 hover:bg-green-50 rounded"
                  title="Approve"
                >
                  <ThumbsUp className="w-4 h-4" />
                </button>
                <button
                  onClick={() => onDecline(application.id)}
                  className="p-1.5 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded"
                  title="Decline"
                >
                  <ThumbsDown className="w-4 h-4" />
                </button>
              </>
            )}
          </div>
        </td>
      </tr>
      {isExpanded && (
        <tr className="bg-gray-50">
          <td colSpan={7} className="px-4 py-4">
            <div className="grid grid-cols-3 gap-6 text-sm">
              <div>
                <h4 className="font-medium text-gray-700 mb-2">Application Details</h4>
                <dl className="space-y-1">
                  <div className="flex justify-between">
                    <dt className="text-gray-500">Term:</dt>
                    <dd className="text-gray-900">{application.term_months} months</dd>
                  </div>
                  <div className="flex justify-between">
                    <dt className="text-gray-500">APR:</dt>
                    <dd className="text-gray-900">{application.apr}%</dd>
                  </div>
                  <div className="flex justify-between">
                    <dt className="text-gray-500">Monthly Payment:</dt>
                    <dd className="text-gray-900">{formatCurrency(application.monthly_payment_cents)}</dd>
                  </div>
                  <div className="flex justify-between">
                    <dt className="text-gray-500">Total Interest:</dt>
                    <dd className="text-gray-900">{formatCurrency(application.total_interest_cents)}</dd>
                  </div>
                </dl>
              </div>
              <div>
                <h4 className="font-medium text-gray-700 mb-2">Customer Info</h4>
                <dl className="space-y-1">
                  <div className="flex justify-between">
                    <dt className="text-gray-500">Phone:</dt>
                    <dd className="text-gray-900">{application.customer_phone || '-'}</dd>
                  </div>
                  <div className="flex justify-between">
                    <dt className="text-gray-500">Credit Score:</dt>
                    <dd className="text-gray-900">{application.credit_score || 'N/A'}</dd>
                  </div>
                </dl>
              </div>
              <div>
                <h4 className="font-medium text-gray-700 mb-2">Processing</h4>
                <dl className="space-y-1">
                  <div className="flex justify-between">
                    <dt className="text-gray-500">Submitted:</dt>
                    <dd className="text-gray-900">{formatDate(application.created_at)}</dd>
                  </div>
                  <div className="flex justify-between">
                    <dt className="text-gray-500">Decision Date:</dt>
                    <dd className="text-gray-900">{formatDate(application.decision_date) || 'Pending'}</dd>
                  </div>
                  {application.decline_reason && (
                    <div className="flex justify-between">
                      <dt className="text-gray-500">Reason:</dt>
                      <dd className="text-red-600">{application.decline_reason}</dd>
                    </div>
                  )}
                </dl>
              </div>
            </div>
          </td>
        </tr>
      )}
    </>
  );
}

// Collections row component
function CollectionsRow({ item, onContact }) {
  return (
    <tr className="hover:bg-gray-50 transition-colors">
      <td className="px-4 py-3">
        <RiskBadge level={item.risk_level} />
      </td>
      <td className="px-4 py-3">
        <div className="font-medium text-gray-900">{item.customer_name}</div>
        <div className="text-xs text-gray-500">{item.agreement_number}</div>
      </td>
      <td className="px-4 py-3">
        <div className="flex items-center gap-2 text-sm text-gray-600">
          <Phone className="w-3 h-3" />
          {item.customer_phone || '-'}
        </div>
        <div className="flex items-center gap-2 text-xs text-gray-500">
          <Mail className="w-3 h-3" />
          {item.customer_email}
        </div>
      </td>
      <td className="px-4 py-3 text-center">
        <div className="text-lg font-bold text-red-600">{item.days_overdue}</div>
        <div className="text-xs text-gray-500">days</div>
      </td>
      <td className="px-4 py-3 text-right">
        <div className="font-medium text-gray-900">{formatCurrency(item.amount_due_cents)}</div>
        <div className="text-xs text-gray-500">Payment #{item.payment_number}</div>
      </td>
      <td className="px-4 py-3 text-right">
        <div className="text-sm text-gray-600">{formatCurrency(item.total_balance_cents)}</div>
      </td>
      <td className="px-4 py-3">
        <div className="flex items-center gap-2 justify-end">
          <button
            onClick={() => onContact(item, 'phone')}
            className="p-1.5 text-gray-400 hover:text-blue-600 hover:bg-blue-50 rounded"
            title="Call Customer"
          >
            <Phone className="w-4 h-4" />
          </button>
          <button
            onClick={() => onContact(item, 'email')}
            className="p-1.5 text-gray-400 hover:text-blue-600 hover:bg-blue-50 rounded"
            title="Email Customer"
          >
            <Mail className="w-4 h-4" />
          </button>
        </div>
      </td>
    </tr>
  );
}

// Filters component
function FiltersPanel({ filters, onChange, providers }) {
  return (
    <div className="bg-gray-50 rounded-lg p-4 mb-4">
      <div className="flex items-center gap-4 flex-wrap">
        {/* Status Filter */}
        <div className="flex-1 min-w-[150px]">
          <label className="block text-xs font-medium text-gray-500 mb-1">Status</label>
          <select
            value={filters.status}
            onChange={(e) => onChange({ ...filters, status: e.target.value })}
            className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
          >
            <option value="">All Statuses</option>
            <option value="pending">Pending</option>
            <option value="approved">Approved</option>
            <option value="declined">Declined</option>
            <option value="more_info">More Info Needed</option>
          </select>
        </div>

        {/* Provider Filter */}
        <div className="flex-1 min-w-[150px]">
          <label className="block text-xs font-medium text-gray-500 mb-1">Provider</label>
          <select
            value={filters.provider}
            onChange={(e) => onChange({ ...filters, provider: e.target.value })}
            className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
          >
            <option value="">All Providers</option>
            {providers.map((p) => (
              <option key={p} value={p}>{p}</option>
            ))}
          </select>
        </div>

        {/* Date Range */}
        <div className="flex-1 min-w-[150px]">
          <label className="block text-xs font-medium text-gray-500 mb-1">From Date</label>
          <input
            type="date"
            value={filters.dateFrom}
            onChange={(e) => onChange({ ...filters, dateFrom: e.target.value })}
            className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
          />
        </div>
        <div className="flex-1 min-w-[150px]">
          <label className="block text-xs font-medium text-gray-500 mb-1">To Date</label>
          <input
            type="date"
            value={filters.dateTo}
            onChange={(e) => onChange({ ...filters, dateTo: e.target.value })}
            className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
          />
        </div>

        {/* Search */}
        <div className="flex-1 min-w-[200px]">
          <label className="block text-xs font-medium text-gray-500 mb-1">Search</label>
          <div className="relative">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-gray-400" />
            <input
              type="text"
              value={filters.search}
              onChange={(e) => onChange({ ...filters, search: e.target.value })}
              placeholder="Customer name or app #"
              className="w-full pl-9 pr-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
            />
          </div>
        </div>

        {/* Clear Filters */}
        <div className="self-end">
          <button
            onClick={() => onChange({ status: '', provider: '', dateFrom: '', dateTo: '', search: '' })}
            className="px-3 py-2 text-sm text-gray-600 hover:text-gray-800 hover:bg-gray-100 rounded-lg"
          >
            Clear
          </button>
        </div>
      </div>
    </div>
  );
}

// Manual Approval Modal
function ManualApprovalModal({ application, action, onConfirm, onCancel, isLoading }) {
  const [reason, setReason] = useState('');
  const isApprove = action === 'approve';

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50">
      <div className="bg-white rounded-xl shadow-xl max-w-md w-full">
        <div className="p-6">
          <div className={`w-12 h-12 rounded-full flex items-center justify-center mb-4 ${
            isApprove ? 'bg-green-100' : 'bg-red-100'
          }`}>
            {isApprove ? (
              <ThumbsUp className="w-6 h-6 text-green-600" />
            ) : (
              <ThumbsDown className="w-6 h-6 text-red-600" />
            )}
          </div>

          <h3 className="text-lg font-semibold text-gray-900">
            {isApprove ? 'Approve Application' : 'Decline Application'}
          </h3>

          <p className="text-sm text-gray-600 mt-2">
            {isApprove
              ? `Are you sure you want to manually approve application ${application?.application_number}?`
              : `Are you sure you want to decline application ${application?.application_number}?`
            }
          </p>

          <div className="mt-4">
            <label className="block text-sm font-medium text-gray-700 mb-1">
              {isApprove ? 'Approval Notes (optional)' : 'Decline Reason'}
            </label>
            <textarea
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder={isApprove ? 'Add notes...' : 'Enter decline reason...'}
              rows={3}
              required={!isApprove}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
            />
          </div>

          <div className="flex gap-3 mt-6">
            <button
              onClick={onCancel}
              disabled={isLoading}
              className="flex-1 px-4 py-2 text-sm font-medium text-gray-700 bg-gray-100 hover:bg-gray-200 rounded-lg disabled:opacity-50"
            >
              Cancel
            </button>
            <button
              onClick={() => onConfirm(reason)}
              disabled={isLoading || (!isApprove && !reason)}
              className={`flex-1 px-4 py-2 text-sm font-medium text-white rounded-lg disabled:opacity-50 ${
                isApprove
                  ? 'bg-green-600 hover:bg-green-700'
                  : 'bg-red-600 hover:bg-red-700'
              }`}
            >
              {isLoading ? 'Processing...' : isApprove ? 'Approve' : 'Decline'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

// Main Admin Financing Page
export default function AdminFinancingPage() {
  const navigate = useNavigate();
  const [activeTab, setActiveTab] = useState('applications');
  const [dashboard, setDashboard] = useState(null);
  const [applications, setApplications] = useState([]);
  const [collections, setCollections] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filters, setFilters] = useState({
    status: '',
    provider: '',
    dateFrom: '',
    dateTo: '',
    search: '',
  });
  const [expandedRows, setExpandedRows] = useState(new Set());
  const [modalState, setModalState] = useState({ show: false, application: null, action: null });
  const [processing, setProcessing] = useState(false);

  // Fetch dashboard data
  useEffect(() => {
    fetchDashboard();
    fetchApplications();
    fetchCollections();
  }, []);

  const fetchDashboard = async () => {
    try {
      const data = await financingApi.getAdminDashboard();
      setDashboard(data);
    } catch (error) {
      console.error('Error fetching dashboard:', error);
    }
  };

  const fetchApplications = async () => {
    setLoading(true);
    try {
      const data = await financingApi.getApplications({ includeAll: true });
      setApplications(data.applications || data || []);
    } catch (error) {
      console.error('Error fetching applications:', error);
    } finally {
      setLoading(false);
    }
  };

  const fetchCollections = async () => {
    try {
      const data = await financingApi.getCollections();
      setCollections(data.collections || data || []);
    } catch (error) {
      console.error('Error fetching collections:', error);
    }
  };

  // Get unique providers for filter
  const providers = useMemo(() => {
    const uniqueProviders = new Set(applications.map((a) => a.provider).filter(Boolean));
    return Array.from(uniqueProviders);
  }, [applications]);

  // Filter applications
  const filteredApplications = useMemo(() => {
    return applications.filter((app) => {
      if (filters.status && app.status !== filters.status) return false;
      if (filters.provider && app.provider !== filters.provider) return false;
      if (filters.dateFrom && new Date(app.created_at) < new Date(filters.dateFrom)) return false;
      if (filters.dateTo && new Date(app.created_at) > new Date(filters.dateTo)) return false;
      if (filters.search) {
        const search = filters.search.toLowerCase();
        const matchesName = app.customer_name?.toLowerCase().includes(search);
        const matchesNumber = app.application_number?.toLowerCase().includes(search);
        if (!matchesName && !matchesNumber) return false;
      }
      return true;
    });
  }, [applications, filters]);

  // Calculate tab counts
  const tabCounts = useMemo(() => ({
    applications: applications.length,
    pending: applications.filter((a) => a.status === 'pending' || a.status === 'more_info').length,
    collections: collections.length,
  }), [applications, collections]);

  // Group collections by risk level
  const collectionsByRisk = useMemo(() => {
    const groups = { critical: [], high: [], medium: [], low: [] };
    collections.forEach((item) => {
      const risk = item.risk_level || 'low';
      if (groups[risk]) {
        groups[risk].push(item);
      }
    });
    return groups;
  }, [collections]);

  // Handle row expand toggle
  const toggleRowExpand = (id) => {
    const newExpanded = new Set(expandedRows);
    if (newExpanded.has(id)) {
      newExpanded.delete(id);
    } else {
      newExpanded.add(id);
    }
    setExpandedRows(newExpanded);
  };

  // Handle manual approval
  const handleApprove = (applicationId) => {
    const app = applications.find((a) => a.id === applicationId);
    setModalState({ show: true, application: app, action: 'approve' });
  };

  const handleDecline = (applicationId) => {
    const app = applications.find((a) => a.id === applicationId);
    setModalState({ show: true, application: app, action: 'decline' });
  };

  const confirmAction = async (reason) => {
    setProcessing(true);
    try {
      if (modalState.action === 'approve') {
        await financingApi.manualApprove(modalState.application.id, { notes: reason });
      } else {
        await financingApi.manualDecline(modalState.application.id, { reason });
      }

      // Refresh data
      await Promise.all([fetchApplications(), fetchDashboard()]);
      setModalState({ show: false, application: null, action: null });
    } catch (error) {
      console.error('Error processing action:', error);
      alert('Failed to process action. Please try again.');
    } finally {
      setProcessing(false);
    }
  };

  // Handle contact for collections
  const handleContact = (item, method) => {
    if (method === 'phone' && item.customer_phone) {
      window.open(`tel:${item.customer_phone}`);
    } else if (method === 'email' && item.customer_email) {
      window.open(`mailto:${item.customer_email}?subject=Regarding Your Payment - ${item.agreement_number}`);
    }
  };

  // Refresh all data
  const handleRefresh = async () => {
    setLoading(true);
    await Promise.all([fetchDashboard(), fetchApplications(), fetchCollections()]);
    setLoading(false);
  };

  const tabs = [
    { id: 'applications', label: 'All Applications', count: tabCounts.applications },
    { id: 'pending', label: 'Pending Review', count: tabCounts.pending },
    { id: 'collections', label: 'Collections', count: tabCounts.collections },
  ];

  return (
    <div className="min-h-screen bg-gray-100">
      {/* Header */}
      <div className="bg-white border-b border-gray-200 px-6 py-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-4">
            <button
              onClick={() => navigate(-1)}
              className="p-2 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-lg transition-colors"
            >
              <ArrowLeft className="w-5 h-5" />
            </button>
            <div>
              <h1 className="text-2xl font-bold text-gray-900">Financing Administration</h1>
              <p className="text-sm text-gray-500 mt-1">Manage applications, approvals, and collections</p>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <button
              onClick={handleRefresh}
              disabled={loading}
              className="flex items-center gap-2 px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 disabled:opacity-50"
            >
              <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
              Refresh
            </button>
            <button
              onClick={() => {
                // Export filtered applications as CSV
                const rows = filteredApplications.length > 0 ? filteredApplications : applications;
                if (rows.length === 0) return;
                const headers = ['Application #', 'Customer', 'Email', 'Provider', 'Plan', 'Amount', 'Status', 'Date'];
                const csvRows = rows.map(app => [
                  app.application_number || '',
                  app.customer_name || '',
                  app.customer_email || '',
                  app.provider || '',
                  app.plan_name || '',
                  app.amount_cents ? (app.amount_cents / 100).toFixed(2) : '0.00',
                  app.status || '',
                  app.created_at ? new Date(app.created_at).toLocaleDateString() : '',
                ]);
                const csv = [headers, ...csvRows].map(r => r.map(c => `"${String(c).replace(/"/g, '""')}"`).join(',')).join('\n');
                const blob = new Blob([csv], { type: 'text/csv' });
                const url = URL.createObjectURL(blob);
                const a = document.createElement('a');
                a.href = url;
                a.download = `financing-applications-${new Date().toISOString().split('T')[0]}.csv`;
                a.click();
                URL.revokeObjectURL(url);
              }}
              className="flex items-center gap-2 px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded-lg hover:bg-blue-700"
            >
              <Download className="w-4 h-4" />
              Export
            </button>
          </div>
        </div>
      </div>

      <div className="p-6">
        {/* Dashboard Stats */}
        {dashboard && (
          <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-4 mb-6">
            <StatCard
              title="Pending Applications"
              value={dashboard.pendingApplications || 0}
              icon={Clock}
              color="yellow"
            />
            <StatCard
              title="Approved (MTD)"
              value={dashboard.approvedMTD || 0}
              icon={CheckCircle}
              color="green"
            />
            <StatCard
              title="Declined (MTD)"
              value={dashboard.declinedMTD || 0}
              icon={XCircle}
              color="red"
            />
            <StatCard
              title="Active Agreements"
              value={dashboard.activeAgreements || 0}
              icon={FileText}
              color="blue"
            />
            <StatCard
              title="Outstanding Balance"
              value={formatCurrency(dashboard.totalOutstandingCents || 0)}
              icon={DollarSign}
              color="purple"
            />
            <StatCard
              title="Past Due Accounts"
              value={collections.length}
              icon={AlertTriangle}
              color="red"
            />
          </div>
        )}

        {/* Main Content */}
        <div className="bg-white rounded-lg shadow-sm border border-gray-200">
          <div className="px-6 pt-4">
            <Tabs tabs={tabs} activeTab={activeTab} onChange={setActiveTab} />
          </div>

          <div className="p-6">
            {/* Applications Tab */}
            {(activeTab === 'applications' || activeTab === 'pending') && (
              <>
                <FiltersPanel filters={filters} onChange={setFilters} providers={providers} />

                {loading ? (
                  <div className="flex items-center justify-center py-12">
                    <RefreshCw className="w-8 h-8 text-blue-500 animate-spin" />
                  </div>
                ) : filteredApplications.length === 0 ? (
                  <div className="text-center py-12">
                    <FileText className="w-12 h-12 text-gray-300 mx-auto mb-3" />
                    <p className="text-gray-500">No applications found</p>
                  </div>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full">
                      <thead>
                        <tr className="bg-gray-50 border-y border-gray-200">
                          <th className="w-10"></th>
                          <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Application</th>
                          <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Customer</th>
                          <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Plan</th>
                          <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">Amount</th>
                          <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Status</th>
                          <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">Actions</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-gray-200">
                        {filteredApplications
                          .filter((app) => activeTab === 'applications' || ['pending', 'more_info'].includes(app.status))
                          .map((app) => (
                            <ApplicationRow
                              key={app.id}
                              application={app}
                              isExpanded={expandedRows.has(app.id)}
                              onToggleExpand={() => toggleRowExpand(app.id)}
                              onApprove={handleApprove}
                              onDecline={handleDecline}
                              onViewDetails={() => toggleRowExpand(app.id)}
                            />
                          ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </>
            )}

            {/* Collections Tab */}
            {activeTab === 'collections' && (
              <>
                {collections.length === 0 ? (
                  <div className="text-center py-12">
                    <CheckCircle className="w-12 h-12 text-green-300 mx-auto mb-3" />
                    <p className="text-gray-500">No past due accounts</p>
                  </div>
                ) : (
                  <div className="space-y-6">
                    {/* Risk Level Summary */}
                    <div className="grid grid-cols-4 gap-4">
                      <div className="bg-red-50 border border-red-200 rounded-lg p-4">
                        <div className="text-2xl font-bold text-red-700">{collectionsByRisk.critical.length}</div>
                        <div className="text-sm text-red-600">Critical (90+ days)</div>
                      </div>
                      <div className="bg-red-50 border border-red-100 rounded-lg p-4">
                        <div className="text-2xl font-bold text-red-600">{collectionsByRisk.high.length}</div>
                        <div className="text-sm text-red-500">High (60-90 days)</div>
                      </div>
                      <div className="bg-orange-50 border border-orange-200 rounded-lg p-4">
                        <div className="text-2xl font-bold text-orange-600">{collectionsByRisk.medium.length}</div>
                        <div className="text-sm text-orange-500">Medium (30-60 days)</div>
                      </div>
                      <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4">
                        <div className="text-2xl font-bold text-yellow-600">{collectionsByRisk.low.length}</div>
                        <div className="text-sm text-yellow-500">Low (&lt;30 days)</div>
                      </div>
                    </div>

                    {/* Collections Table */}
                    <div className="overflow-x-auto">
                      <table className="w-full">
                        <thead>
                          <tr className="bg-gray-50 border-y border-gray-200">
                            <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Risk</th>
                            <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Customer</th>
                            <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Contact</th>
                            <th className="px-4 py-3 text-center text-xs font-medium text-gray-500 uppercase">Days Overdue</th>
                            <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">Amount Due</th>
                            <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">Total Balance</th>
                            <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">Actions</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-200">
                          {collections.map((item) => (
                            <CollectionsRow
                              key={item.payment_id}
                              item={item}
                              onContact={handleContact}
                            />
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                )}
              </>
            )}
          </div>
        </div>
      </div>

      {/* Manual Approval Modal */}
      {modalState.show && (
        <ManualApprovalModal
          application={modalState.application}
          action={modalState.action}
          onConfirm={confirmAction}
          onCancel={() => setModalState({ show: false, application: null, action: null })}
          isLoading={processing}
        />
      )}
    </div>
  );
}
