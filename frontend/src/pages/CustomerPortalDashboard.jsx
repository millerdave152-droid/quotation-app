/**
 * CustomerPortalDashboard - Self-service customer portal
 * Features: Quote history, reorder, communication preferences, profile management
 */

import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';

const API_URL = process.env.REACT_APP_API_URL || 'http://localhost:3001';

function CustomerPortalDashboard() {
  const { token } = useParams();
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [data, setData] = useState(null);
  const [activeTab, setActiveTab] = useState('overview');
  const [selectedQuote, setSelectedQuote] = useState(null);
  const [showPreferences, setShowPreferences] = useState(false);
  const [processing, setProcessing] = useState(false);

  useEffect(() => {
    fetchDashboard();
  }, [token]);

  const fetchDashboard = async () => {
    try {
      setLoading(true);
      const response = await fetch(`${API_URL}/api/customer-portal/dashboard/${token}`);
      const result = await response.json();

      if (!result.success) {
        throw new Error(result.error || 'Failed to load dashboard');
      }

      setData(result.data);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleViewQuote = (quoteId) => {
    navigate(`/customer-portal/quote/${token}/${quoteId}`);
  };

  const handleReorder = async (quoteId) => {
    if (!window.confirm('Would you like to create a new quote based on this order?')) {
      return;
    }

    setProcessing(true);
    try {
      const response = await fetch(`${API_URL}/api/customer-portal/reorder/${token}/${quoteId}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({})
      });

      const result = await response.json();

      if (!result.success) {
        throw new Error(result.error || 'Failed to create reorder');
      }

      alert('Reorder request submitted! We will contact you shortly with your new quote.');
      fetchDashboard();
    } catch (err) {
      alert(err.message);
    } finally {
      setProcessing(false);
    }
  };

  const handleSavePreferences = async (preferences) => {
    setProcessing(true);
    try {
      const response = await fetch(`${API_URL}/api/customer-portal/preferences/${token}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(preferences)
      });

      const result = await response.json();

      if (!result.success) {
        throw new Error(result.error || 'Failed to save preferences');
      }

      setShowPreferences(false);
      fetchDashboard();
      alert('Preferences saved successfully!');
    } catch (err) {
      alert(err.message);
    } finally {
      setProcessing(false);
    }
  };

  const formatCurrency = (cents) => {
    return new Intl.NumberFormat('en-CA', {
      style: 'currency',
      currency: 'CAD'
    }).format((cents || 0) / 100);
  };

  const formatDate = (dateStr) => {
    return new Date(dateStr).toLocaleDateString('en-CA', {
      year: 'numeric',
      month: 'short',
      day: 'numeric'
    });
  };

  const getStatusBadge = (status) => {
    const styles = {
      SENT: { bg: '#fef3c7', color: '#92400e', label: 'Pending' },
      VIEWED: { bg: '#dbeafe', color: '#1d4ed8', label: 'Viewed' },
      ACCEPTED: { bg: '#dcfce7', color: '#166534', label: 'Accepted' },
      WON: { bg: '#dcfce7', color: '#166534', label: 'Completed' },
      DECLINED: { bg: '#fee2e2', color: '#991b1b', label: 'Declined' },
      EXPIRED: { bg: '#f3f4f6', color: '#6b7280', label: 'Expired' },
      DRAFT: { bg: '#e5e7eb', color: '#374151', label: 'Draft' }
    };
    const style = styles[status] || styles.DRAFT;
    return (
      <span style={{
        padding: '4px 10px',
        borderRadius: '16px',
        fontSize: '12px',
        fontWeight: 600,
        backgroundColor: style.bg,
        color: style.color
      }}>
        {style.label}
      </span>
    );
  };

  if (loading) {
    return (
      <div style={styles.container}>
        <div style={styles.loadingCard}>
          <div style={styles.spinner} />
          <p>Loading your dashboard...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div style={styles.container}>
        <div style={styles.errorCard}>
          <h2>Unable to Load Dashboard</h2>
          <p>{error}</p>
        </div>
      </div>
    );
  }

  const { customer, quotes, stats, preferences } = data;

  return (
    <div style={styles.container}>
      {/* Header */}
      <div style={styles.header}>
        <div>
          <h1 style={styles.greeting}>Welcome back, {customer.name}!</h1>
          <p style={styles.subtitle}>Manage your quotes and preferences</p>
        </div>
        <button
          onClick={() => setShowPreferences(true)}
          style={styles.settingsBtn}
        >
          Preferences
        </button>
      </div>

      {/* Stats Cards */}
      <div style={styles.statsGrid}>
        <div style={styles.statCard}>
          <div style={styles.statValue}>{stats.totalQuotes}</div>
          <div style={styles.statLabel}>Total Quotes</div>
        </div>
        <div style={styles.statCard}>
          <div style={styles.statValue}>{stats.acceptedQuotes}</div>
          <div style={styles.statLabel}>Orders Placed</div>
        </div>
        <div style={{ ...styles.statCard, ...styles.statCardHighlight }}>
          <div style={styles.statValue}>{formatCurrency(stats.totalSpent)}</div>
          <div style={styles.statLabel}>Total Spent</div>
        </div>
        <div style={styles.statCard}>
          <div style={styles.statValue}>{stats.pendingQuotes}</div>
          <div style={styles.statLabel}>Pending Quotes</div>
        </div>
      </div>

      {/* Tabs */}
      <div style={styles.tabs}>
        <button
          onClick={() => setActiveTab('overview')}
          style={activeTab === 'overview' ? styles.tabActive : styles.tab}
        >
          Recent Quotes
        </button>
        <button
          onClick={() => setActiveTab('pending')}
          style={activeTab === 'pending' ? styles.tabActive : styles.tab}
        >
          Pending ({stats.pendingQuotes})
        </button>
        <button
          onClick={() => setActiveTab('completed')}
          style={activeTab === 'completed' ? styles.tabActive : styles.tab}
        >
          Completed ({stats.acceptedQuotes})
        </button>
      </div>

      {/* Quotes List */}
      <div style={styles.quotesList}>
        {quotes
          .filter(q => {
            if (activeTab === 'pending') return ['SENT', 'VIEWED', 'DRAFT'].includes(q.status);
            if (activeTab === 'completed') return ['ACCEPTED', 'WON'].includes(q.status);
            return true;
          })
          .map(quote => (
            <div key={quote.id} style={styles.quoteCard}>
              <div style={styles.quoteHeader}>
                <div>
                  <div style={styles.quoteNumber}>Quote #{quote.quoteNumber}</div>
                  <div style={styles.quoteDate}>{formatDate(quote.createdAt)}</div>
                </div>
                {getStatusBadge(quote.status)}
              </div>

              <div style={styles.quoteDetails}>
                <div style={styles.quoteDetail}>
                  <span style={styles.detailLabel}>Items</span>
                  <span style={styles.detailValue}>{quote.itemCount}</span>
                </div>
                <div style={styles.quoteDetail}>
                  <span style={styles.detailLabel}>Total</span>
                  <span style={styles.detailValue}>{formatCurrency(quote.totalCents)}</span>
                </div>
                {quote.validUntil && ['SENT', 'VIEWED'].includes(quote.status) && (
                  <div style={styles.quoteDetail}>
                    <span style={styles.detailLabel}>Valid Until</span>
                    <span style={styles.detailValue}>{formatDate(quote.validUntil)}</span>
                  </div>
                )}
              </div>

              <div style={styles.quoteActions}>
                {['SENT', 'VIEWED'].includes(quote.status) && (
                  <button
                    onClick={() => navigate(`/customer-portal/${token}?quote=${quote.id}`)}
                    style={styles.primaryBtn}
                  >
                    Review & Accept
                  </button>
                )}
                {['WON', 'ACCEPTED'].includes(quote.status) && (
                  <button
                    onClick={() => handleReorder(quote.id)}
                    disabled={processing}
                    style={styles.secondaryBtn}
                  >
                    Reorder
                  </button>
                )}
                <button
                  onClick={() => handleViewQuote(quote.id)}
                  style={styles.linkBtn}
                >
                  View Details
                </button>
              </div>
            </div>
          ))}

        {quotes.length === 0 && (
          <div style={styles.emptyState}>
            <p>No quotes found</p>
          </div>
        )}
      </div>

      {/* Contact Card */}
      <div style={styles.contactCard}>
        <h3>Need Help?</h3>
        <p>Have questions about a quote or need assistance?</p>
        <p><strong>Email:</strong> sales@example.com</p>
        <p><strong>Phone:</strong> (555) 123-4567</p>
      </div>

      {/* Preferences Modal */}
      {showPreferences && (
        <PreferencesModal
          preferences={preferences}
          onSave={handleSavePreferences}
          onClose={() => setShowPreferences(false)}
          processing={processing}
        />
      )}
    </div>
  );
}

function PreferencesModal({ preferences, onSave, onClose, processing }) {
  const [form, setForm] = useState({
    email_quotes: preferences.email_quotes !== false,
    email_promotions: preferences.email_promotions !== false,
    email_reminders: preferences.email_reminders !== false,
    sms_delivery_updates: preferences.sms_delivery_updates === true,
    sms_reminders: preferences.sms_reminders === true,
    preferred_contact_method: preferences.preferred_contact_method || 'email'
  });

  const handleChange = (key, value) => {
    setForm({ ...form, [key]: value });
  };

  return (
    <div style={styles.modalOverlay} onClick={onClose}>
      <div style={styles.modal} onClick={e => e.stopPropagation()}>
        <h2 style={styles.modalTitle}>Communication Preferences</h2>

        <div style={styles.preferenceGroup}>
          <h4>Email Notifications</h4>
          <label style={styles.checkboxLabel}>
            <input
              type="checkbox"
              checked={form.email_quotes}
              onChange={e => handleChange('email_quotes', e.target.checked)}
            />
            <span>Quote updates and reminders</span>
          </label>
          <label style={styles.checkboxLabel}>
            <input
              type="checkbox"
              checked={form.email_promotions}
              onChange={e => handleChange('email_promotions', e.target.checked)}
            />
            <span>Special offers and promotions</span>
          </label>
          <label style={styles.checkboxLabel}>
            <input
              type="checkbox"
              checked={form.email_reminders}
              onChange={e => handleChange('email_reminders', e.target.checked)}
            />
            <span>Follow-up reminders</span>
          </label>
        </div>

        <div style={styles.preferenceGroup}>
          <h4>SMS Notifications</h4>
          <label style={styles.checkboxLabel}>
            <input
              type="checkbox"
              checked={form.sms_delivery_updates}
              onChange={e => handleChange('sms_delivery_updates', e.target.checked)}
            />
            <span>Delivery status updates</span>
          </label>
          <label style={styles.checkboxLabel}>
            <input
              type="checkbox"
              checked={form.sms_reminders}
              onChange={e => handleChange('sms_reminders', e.target.checked)}
            />
            <span>Important reminders</span>
          </label>
        </div>

        <div style={styles.preferenceGroup}>
          <h4>Preferred Contact Method</h4>
          <select
            value={form.preferred_contact_method}
            onChange={e => handleChange('preferred_contact_method', e.target.value)}
            style={styles.select}
          >
            <option value="email">Email</option>
            <option value="phone">Phone Call</option>
            <option value="sms">Text Message</option>
          </select>
        </div>

        <div style={styles.modalActions}>
          <button onClick={onClose} style={styles.cancelBtn}>
            Cancel
          </button>
          <button
            onClick={() => onSave(form)}
            disabled={processing}
            style={styles.saveBtn}
          >
            {processing ? 'Saving...' : 'Save Preferences'}
          </button>
        </div>
      </div>
    </div>
  );
}

const styles = {
  container: {
    minHeight: '100vh',
    background: '#f3f4f6',
    padding: '24px',
    maxWidth: '1000px',
    margin: '0 auto'
  },
  header: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: '24px'
  },
  greeting: {
    margin: 0,
    fontSize: '28px',
    fontWeight: 700,
    color: '#111827'
  },
  subtitle: {
    margin: '4px 0 0',
    color: '#6b7280'
  },
  settingsBtn: {
    padding: '10px 20px',
    background: 'white',
    border: '2px solid #e5e7eb',
    borderRadius: '8px',
    fontSize: '14px',
    fontWeight: 600,
    cursor: 'pointer'
  },
  statsGrid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(4, 1fr)',
    gap: '16px',
    marginBottom: '24px'
  },
  statCard: {
    background: 'white',
    padding: '20px',
    borderRadius: '12px',
    textAlign: 'center',
    boxShadow: '0 1px 3px rgba(0,0,0,0.1)'
  },
  statCardHighlight: {
    background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
    color: 'white'
  },
  statValue: {
    fontSize: '24px',
    fontWeight: 700,
    marginBottom: '4px'
  },
  statLabel: {
    fontSize: '13px',
    opacity: 0.8
  },
  tabs: {
    display: 'flex',
    gap: '8px',
    marginBottom: '16px'
  },
  tab: {
    padding: '10px 20px',
    background: 'white',
    border: '1px solid #e5e7eb',
    borderRadius: '8px',
    fontSize: '14px',
    cursor: 'pointer',
    fontWeight: 500
  },
  tabActive: {
    padding: '10px 20px',
    background: '#667eea',
    color: 'white',
    border: '1px solid #667eea',
    borderRadius: '8px',
    fontSize: '14px',
    cursor: 'pointer',
    fontWeight: 600
  },
  quotesList: {
    display: 'flex',
    flexDirection: 'column',
    gap: '16px'
  },
  quoteCard: {
    background: 'white',
    borderRadius: '12px',
    padding: '20px',
    boxShadow: '0 1px 3px rgba(0,0,0,0.1)'
  },
  quoteHeader: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: '16px'
  },
  quoteNumber: {
    fontSize: '16px',
    fontWeight: 600,
    color: '#111827'
  },
  quoteDate: {
    fontSize: '13px',
    color: '#6b7280',
    marginTop: '4px'
  },
  quoteDetails: {
    display: 'flex',
    gap: '32px',
    marginBottom: '16px',
    paddingBottom: '16px',
    borderBottom: '1px solid #e5e7eb'
  },
  quoteDetail: {
    display: 'flex',
    flexDirection: 'column'
  },
  detailLabel: {
    fontSize: '12px',
    color: '#6b7280',
    marginBottom: '4px'
  },
  detailValue: {
    fontSize: '15px',
    fontWeight: 600,
    color: '#111827'
  },
  quoteActions: {
    display: 'flex',
    gap: '12px'
  },
  primaryBtn: {
    padding: '10px 20px',
    background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
    color: 'white',
    border: 'none',
    borderRadius: '8px',
    fontSize: '14px',
    fontWeight: 600,
    cursor: 'pointer'
  },
  secondaryBtn: {
    padding: '10px 20px',
    background: 'white',
    color: '#374151',
    border: '2px solid #e5e7eb',
    borderRadius: '8px',
    fontSize: '14px',
    fontWeight: 600,
    cursor: 'pointer'
  },
  linkBtn: {
    padding: '10px 20px',
    background: 'none',
    color: '#667eea',
    border: 'none',
    fontSize: '14px',
    fontWeight: 600,
    cursor: 'pointer'
  },
  emptyState: {
    textAlign: 'center',
    padding: '40px',
    color: '#6b7280'
  },
  contactCard: {
    background: 'white',
    borderRadius: '12px',
    padding: '24px',
    marginTop: '24px',
    boxShadow: '0 1px 3px rgba(0,0,0,0.1)'
  },
  modalOverlay: {
    position: 'fixed',
    inset: 0,
    background: 'rgba(0,0,0,0.5)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 1000,
    padding: '20px'
  },
  modal: {
    background: 'white',
    borderRadius: '16px',
    padding: '32px',
    maxWidth: '450px',
    width: '100%'
  },
  modalTitle: {
    margin: '0 0 24px',
    fontSize: '20px',
    fontWeight: 600
  },
  preferenceGroup: {
    marginBottom: '24px'
  },
  checkboxLabel: {
    display: 'flex',
    alignItems: 'center',
    gap: '10px',
    padding: '10px 0',
    fontSize: '14px',
    cursor: 'pointer'
  },
  select: {
    width: '100%',
    padding: '12px',
    fontSize: '14px',
    border: '2px solid #e5e7eb',
    borderRadius: '8px'
  },
  modalActions: {
    display: 'flex',
    gap: '12px',
    justifyContent: 'flex-end',
    marginTop: '24px'
  },
  cancelBtn: {
    padding: '12px 24px',
    background: '#f3f4f6',
    border: 'none',
    borderRadius: '8px',
    fontSize: '14px',
    fontWeight: 600,
    cursor: 'pointer'
  },
  saveBtn: {
    padding: '12px 24px',
    background: '#667eea',
    color: 'white',
    border: 'none',
    borderRadius: '8px',
    fontSize: '14px',
    fontWeight: 600,
    cursor: 'pointer'
  },
  loadingCard: {
    background: 'white',
    padding: '60px',
    borderRadius: '16px',
    textAlign: 'center',
    maxWidth: '400px',
    margin: '100px auto'
  },
  spinner: {
    width: '48px',
    height: '48px',
    border: '4px solid #e5e7eb',
    borderTopColor: '#667eea',
    borderRadius: '50%',
    margin: '0 auto 20px',
    animation: 'spin 1s linear infinite'
  },
  errorCard: {
    background: 'white',
    padding: '60px',
    borderRadius: '16px',
    textAlign: 'center',
    maxWidth: '400px',
    margin: '100px auto'
  }
};

export default CustomerPortalDashboard;
