import React, { useState, useEffect } from 'react';

import { authFetch } from '../../services/authFetch';
const API_URL = process.env.REACT_APP_API_URL || 'http://localhost:3001';

/**
 * QuoteExpiryManager - Admin UI for managing quote expiry rules
 * and viewing/renewing expiring quotes
 */
const QuoteExpiryManager = () => {
  const [activeTab, setActiveTab] = useState('rules');
  const [rules, setRules] = useState([]);
  const [expiringQuotes, setExpiringQuotes] = useState([]);
  const [expiredQuotes, setExpiredQuotes] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showRuleModal, setShowRuleModal] = useState(false);
  const [editingRule, setEditingRule] = useState(null);
  const [selectedQuotes, setSelectedQuotes] = useState([]);

  // Rule form state
  const [ruleForm, setRuleForm] = useState({
    rule_name: '',
    channel: 'default',
    days_valid: 30,
    reminder_days: '7,3,1',
    auto_expire: true,
    allow_renewal: true,
    renewal_extends_days: 14,
    is_default: false
  });

  useEffect(() => {
    fetchData();
  }, []);

  const fetchData = async () => {
    setLoading(true);
    try {
      const token = localStorage.getItem('auth_token');
      const headers = { 'Authorization': `Bearer ${token}` };

      const [rulesRes, expiringRes, expiredRes] = await Promise.all([
        authFetch(`${API_URL}/api/quotations/expiry-rules`, { headers }),
        authFetch(`${API_URL}/api/quotations/expiring?days=7`, { headers }),
        authFetch(`${API_URL}/api/quotations/expired?days=30`, { headers })
      ]);

      const [rulesData, expiringData, expiredData] = await Promise.all([
        rulesRes.json(),
        expiringRes.json(),
        expiredRes.json()
      ]);

      if (rulesData.success) setRules(rulesData.data || []);
      if (expiringData.success) setExpiringQuotes(expiringData.data || []);
      if (expiredData.success) setExpiredQuotes(expiredData.data || []);
    } catch (err) {
      console.error('Failed to fetch data:', err);
    } finally {
      setLoading(false);
    }
  };

  const formatCurrency = (cents) => {
    return new Intl.NumberFormat('en-CA', {
      style: 'currency',
      currency: 'CAD'
    }).format((cents || 0) / 100);
  };

  const formatDate = (dateStr) => {
    if (!dateStr) return 'N/A';
    return new Date(dateStr).toLocaleDateString('en-CA', {
      year: 'numeric',
      month: 'short',
      day: 'numeric'
    });
  };

  const getDaysUntilExpiry = (expiryDate) => {
    const days = Math.ceil((new Date(expiryDate) - new Date()) / (1000 * 60 * 60 * 24));
    return days;
  };

  const handleSaveRule = async () => {
    try {
      const token = localStorage.getItem('auth_token');
      const url = editingRule
        ? `${API_URL}/api/quotations/expiry-rules/${editingRule.id}`
        : `${API_URL}/api/quotations/expiry-rules`;

      const response = await authFetch(url, {
        method: editingRule ? 'PUT' : 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({
          ...ruleForm,
          reminder_days_before: ruleForm.reminder_days.split(',').map(d => parseInt(d.trim()))
        })
      });

      const data = await response.json();
      if (data.success) {
        setShowRuleModal(false);
        setEditingRule(null);
        resetRuleForm();
        fetchData();
      } else {
        alert(data.error || 'Failed to save rule');
      }
    } catch (err) {
      alert('Failed to save rule: ' + err.message);
    }
  };

  const handleDeleteRule = async (ruleId) => {
    if (!window.confirm('Delete this expiry rule?')) return;

    try {
      const token = localStorage.getItem('auth_token');
      const response = await authFetch(`${API_URL}/api/quotations/expiry-rules/${ruleId}`, {
        method: 'DELETE',
        headers: { 'Authorization': `Bearer ${token}` }
      });

      const data = await response.json();
      if (data.success) {
        fetchData();
      } else {
        alert(data.error || 'Failed to delete rule');
      }
    } catch (err) {
      alert('Failed to delete rule: ' + err.message);
    }
  };

  const handleRenewQuote = async (quoteId, extendDays = 14) => {
    try {
      const token = localStorage.getItem('auth_token');
      const response = await authFetch(`${API_URL}/api/quotations/${quoteId}/renew`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({ extend_days: extendDays })
      });

      const data = await response.json();
      if (data.success) {
        fetchData();
      } else {
        alert(data.error || 'Failed to renew quote');
      }
    } catch (err) {
      alert('Failed to renew quote: ' + err.message);
    }
  };

  const handleBulkRenew = async () => {
    if (selectedQuotes.length === 0) {
      alert('Please select quotes to renew');
      return;
    }

    const extendDays = prompt('Extend by how many days?', '14');
    if (!extendDays) return;

    for (const quoteId of selectedQuotes) {
      await handleRenewQuote(quoteId, parseInt(extendDays));
    }
    setSelectedQuotes([]);
  };

  const resetRuleForm = () => {
    setRuleForm({
      rule_name: '',
      channel: 'default',
      days_valid: 30,
      reminder_days: '7,3,1',
      auto_expire: true,
      allow_renewal: true,
      renewal_extends_days: 14,
      is_default: false
    });
  };

  const openEditRule = (rule) => {
    setEditingRule(rule);
    setRuleForm({
      rule_name: rule.rule_name,
      channel: rule.channel || 'default',
      days_valid: rule.days_valid,
      reminder_days: (rule.reminder_days_before || [7, 3, 1]).join(','),
      auto_expire: rule.auto_expire,
      allow_renewal: rule.allow_renewal,
      renewal_extends_days: rule.renewal_extends_days,
      is_default: rule.is_default
    });
    setShowRuleModal(true);
  };

  const toggleQuoteSelection = (quoteId) => {
    setSelectedQuotes(prev =>
      prev.includes(quoteId)
        ? prev.filter(id => id !== quoteId)
        : [...prev, quoteId]
    );
  };

  const selectAllQuotes = (quotes) => {
    const allIds = quotes.map(q => q.id);
    const allSelected = allIds.every(id => selectedQuotes.includes(id));
    if (allSelected) {
      setSelectedQuotes(prev => prev.filter(id => !allIds.includes(id)));
    } else {
      setSelectedQuotes(prev => [...new Set([...prev, ...allIds])]);
    }
  };

  if (loading) {
    return (
      <div style={styles.container}>
        <div style={styles.loading}>Loading...</div>
      </div>
    );
  }

  return (
    <div style={styles.container}>
      {/* Header */}
      <div style={styles.header}>
        <div>
          <h1 style={styles.title}>Quote Expiry Management</h1>
          <p style={styles.subtitle}>Configure expiry rules and manage expiring quotes</p>
        </div>
      </div>

      {/* Stats Cards */}
      <div style={styles.statsRow}>
        <div style={styles.statCard}>
          <div style={styles.statNumber}>{expiringQuotes.length}</div>
          <div style={styles.statLabel}>Expiring Soon (7 days)</div>
        </div>
        <div style={{ ...styles.statCard, background: '#fef2f2' }}>
          <div style={{ ...styles.statNumber, color: '#dc2626' }}>{expiredQuotes.length}</div>
          <div style={styles.statLabel}>Recently Expired</div>
        </div>
        <div style={{ ...styles.statCard, background: '#f0fdf4' }}>
          <div style={{ ...styles.statNumber, color: '#059669' }}>{rules.length}</div>
          <div style={styles.statLabel}>Active Rules</div>
        </div>
      </div>

      {/* Tabs */}
      <div style={styles.tabs}>
        <button
          onClick={() => setActiveTab('rules')}
          style={{
            ...styles.tab,
            ...(activeTab === 'rules' ? styles.tabActive : {})
          }}
        >
          Expiry Rules
        </button>
        <button
          onClick={() => setActiveTab('expiring')}
          style={{
            ...styles.tab,
            ...(activeTab === 'expiring' ? styles.tabActive : {})
          }}
        >
          Expiring Quotes ({expiringQuotes.length})
        </button>
        <button
          onClick={() => setActiveTab('expired')}
          style={{
            ...styles.tab,
            ...(activeTab === 'expired' ? styles.tabActive : {})
          }}
        >
          Expired Quotes ({expiredQuotes.length})
        </button>
      </div>

      {/* Rules Tab */}
      {activeTab === 'rules' && (
        <div style={styles.content}>
          <div style={styles.contentHeader}>
            <h2 style={styles.contentTitle}>Expiry Rules</h2>
            <button
              onClick={() => {
                resetRuleForm();
                setEditingRule(null);
                setShowRuleModal(true);
              }}
              style={styles.addButton}
            >
              + Add Rule
            </button>
          </div>

          <div style={styles.rulesGrid}>
            {rules.map(rule => (
              <div key={rule.id} style={styles.ruleCard}>
                <div style={styles.ruleHeader}>
                  <h3 style={styles.ruleName}>{rule.rule_name}</h3>
                  {rule.is_default && (
                    <span style={styles.defaultBadge}>Default</span>
                  )}
                </div>

                <div style={styles.ruleDetails}>
                  <div style={styles.ruleDetail}>
                    <span style={styles.ruleLabel}>Channel:</span>
                    <span>{rule.channel || 'All'}</span>
                  </div>
                  <div style={styles.ruleDetail}>
                    <span style={styles.ruleLabel}>Valid Days:</span>
                    <span>{rule.days_valid}</span>
                  </div>
                  <div style={styles.ruleDetail}>
                    <span style={styles.ruleLabel}>Reminders:</span>
                    <span>{(rule.reminder_days_before || []).join(', ')} days before</span>
                  </div>
                  <div style={styles.ruleDetail}>
                    <span style={styles.ruleLabel}>Auto Expire:</span>
                    <span style={rule.auto_expire ? styles.statusYes : styles.statusNo}>
                      {rule.auto_expire ? 'Yes' : 'No'}
                    </span>
                  </div>
                  <div style={styles.ruleDetail}>
                    <span style={styles.ruleLabel}>Allow Renewal:</span>
                    <span style={rule.allow_renewal ? styles.statusYes : styles.statusNo}>
                      {rule.allow_renewal ? `Yes (+${rule.renewal_extends_days} days)` : 'No'}
                    </span>
                  </div>
                </div>

                <div style={styles.ruleActions}>
                  <button
                    onClick={() => openEditRule(rule)}
                    style={styles.editButton}
                  >
                    Edit
                  </button>
                  {!rule.is_default && (
                    <button
                      onClick={() => handleDeleteRule(rule.id)}
                      style={styles.deleteButton}
                    >
                      Delete
                    </button>
                  )}
                </div>
              </div>
            ))}

            {rules.length === 0 && (
              <div style={styles.emptyState}>
                <p>No expiry rules configured</p>
                <button
                  onClick={() => setShowRuleModal(true)}
                  style={styles.addButton}
                >
                  Create First Rule
                </button>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Expiring Quotes Tab */}
      {activeTab === 'expiring' && (
        <div style={styles.content}>
          <div style={styles.contentHeader}>
            <h2 style={styles.contentTitle}>Quotes Expiring Soon</h2>
            {selectedQuotes.length > 0 && (
              <button onClick={handleBulkRenew} style={styles.bulkButton}>
                Renew Selected ({selectedQuotes.length})
              </button>
            )}
          </div>

          <div style={styles.table}>
            <div style={styles.tableHeader}>
              <div style={{ ...styles.tableCell, width: '40px' }}>
                <input
                  type="checkbox"
                  onChange={() => selectAllQuotes(expiringQuotes)}
                  checked={expiringQuotes.length > 0 && expiringQuotes.every(q => selectedQuotes.includes(q.id))}
                />
              </div>
              <div style={{ ...styles.tableCell, flex: 1 }}>Quote #</div>
              <div style={{ ...styles.tableCell, flex: 2 }}>Customer</div>
              <div style={{ ...styles.tableCell, width: '120px' }}>Total</div>
              <div style={{ ...styles.tableCell, width: '120px' }}>Expires</div>
              <div style={{ ...styles.tableCell, width: '100px' }}>Days Left</div>
              <div style={{ ...styles.tableCell, width: '120px' }}>Actions</div>
            </div>

            {expiringQuotes.map(quote => {
              const daysLeft = getDaysUntilExpiry(quote.expires_at);
              return (
                <div key={quote.id} style={styles.tableRow}>
                  <div style={{ ...styles.tableCell, width: '40px' }}>
                    <input
                      type="checkbox"
                      checked={selectedQuotes.includes(quote.id)}
                      onChange={() => toggleQuoteSelection(quote.id)}
                    />
                  </div>
                  <div style={{ ...styles.tableCell, flex: 1, fontWeight: '600' }}>
                    {quote.quote_number}
                  </div>
                  <div style={{ ...styles.tableCell, flex: 2 }}>
                    {quote.customer_name}
                  </div>
                  <div style={{ ...styles.tableCell, width: '120px' }}>
                    {formatCurrency(quote.total_cents)}
                  </div>
                  <div style={{ ...styles.tableCell, width: '120px' }}>
                    {formatDate(quote.expires_at)}
                  </div>
                  <div style={{ ...styles.tableCell, width: '100px' }}>
                    <span style={{
                      ...styles.daysLeftBadge,
                      background: daysLeft <= 1 ? '#fef2f2' : daysLeft <= 3 ? '#fffbeb' : '#f0fdf4',
                      color: daysLeft <= 1 ? '#dc2626' : daysLeft <= 3 ? '#d97706' : '#059669'
                    }}>
                      {daysLeft} day{daysLeft !== 1 ? 's' : ''}
                    </span>
                  </div>
                  <div style={{ ...styles.tableCell, width: '120px' }}>
                    <button
                      onClick={() => handleRenewQuote(quote.id)}
                      style={styles.renewButton}
                    >
                      Renew
                    </button>
                  </div>
                </div>
              );
            })}

            {expiringQuotes.length === 0 && (
              <div style={styles.emptyRow}>
                No quotes expiring in the next 7 days
              </div>
            )}
          </div>
        </div>
      )}

      {/* Expired Quotes Tab */}
      {activeTab === 'expired' && (
        <div style={styles.content}>
          <div style={styles.contentHeader}>
            <h2 style={styles.contentTitle}>Recently Expired Quotes</h2>
            {selectedQuotes.length > 0 && (
              <button onClick={handleBulkRenew} style={styles.bulkButton}>
                Restore Selected ({selectedQuotes.length})
              </button>
            )}
          </div>

          <div style={styles.table}>
            <div style={styles.tableHeader}>
              <div style={{ ...styles.tableCell, width: '40px' }}>
                <input
                  type="checkbox"
                  onChange={() => selectAllQuotes(expiredQuotes)}
                  checked={expiredQuotes.length > 0 && expiredQuotes.every(q => selectedQuotes.includes(q.id))}
                />
              </div>
              <div style={{ ...styles.tableCell, flex: 1 }}>Quote #</div>
              <div style={{ ...styles.tableCell, flex: 2 }}>Customer</div>
              <div style={{ ...styles.tableCell, width: '120px' }}>Total</div>
              <div style={{ ...styles.tableCell, width: '120px' }}>Expired On</div>
              <div style={{ ...styles.tableCell, width: '100px' }}>Days Ago</div>
              <div style={{ ...styles.tableCell, width: '120px' }}>Actions</div>
            </div>

            {expiredQuotes.map(quote => {
              const daysAgo = Math.abs(getDaysUntilExpiry(quote.expired_at || quote.expires_at));
              return (
                <div key={quote.id} style={{ ...styles.tableRow, opacity: 0.8 }}>
                  <div style={{ ...styles.tableCell, width: '40px' }}>
                    <input
                      type="checkbox"
                      checked={selectedQuotes.includes(quote.id)}
                      onChange={() => toggleQuoteSelection(quote.id)}
                    />
                  </div>
                  <div style={{ ...styles.tableCell, flex: 1, fontWeight: '600' }}>
                    {quote.quote_number}
                  </div>
                  <div style={{ ...styles.tableCell, flex: 2 }}>
                    {quote.customer_name}
                  </div>
                  <div style={{ ...styles.tableCell, width: '120px' }}>
                    {formatCurrency(quote.total_cents)}
                  </div>
                  <div style={{ ...styles.tableCell, width: '120px' }}>
                    {formatDate(quote.expired_at || quote.expires_at)}
                  </div>
                  <div style={{ ...styles.tableCell, width: '100px' }}>
                    <span style={styles.expiredBadge}>
                      {daysAgo} day{daysAgo !== 1 ? 's' : ''} ago
                    </span>
                  </div>
                  <div style={{ ...styles.tableCell, width: '120px' }}>
                    <button
                      onClick={() => handleRenewQuote(quote.id)}
                      style={styles.restoreButton}
                    >
                      Restore
                    </button>
                  </div>
                </div>
              );
            })}

            {expiredQuotes.length === 0 && (
              <div style={styles.emptyRow}>
                No recently expired quotes
              </div>
            )}
          </div>
        </div>
      )}

      {/* Rule Modal */}
      {showRuleModal && (
        <div style={styles.modalOverlay}>
          <div style={styles.modal}>
            <h2 style={styles.modalTitle}>
              {editingRule ? 'Edit Expiry Rule' : 'Create Expiry Rule'}
            </h2>

            <div style={styles.formGroup}>
              <label style={styles.label}>Rule Name</label>
              <input
                type="text"
                value={ruleForm.rule_name}
                onChange={(e) => setRuleForm({ ...ruleForm, rule_name: e.target.value })}
                style={styles.input}
                placeholder="e.g., Standard 30-Day"
              />
            </div>

            <div style={styles.formRow}>
              <div style={styles.formGroup}>
                <label style={styles.label}>Channel</label>
                <select
                  value={ruleForm.channel}
                  onChange={(e) => setRuleForm({ ...ruleForm, channel: e.target.value })}
                  style={styles.select}
                >
                  <option value="default">Default (All)</option>
                  <option value="web">Web</option>
                  <option value="phone">Phone</option>
                  <option value="in_store">In-Store</option>
                  <option value="email">Email</option>
                </select>
              </div>

              <div style={styles.formGroup}>
                <label style={styles.label}>Days Valid</label>
                <input
                  type="number"
                  value={ruleForm.days_valid}
                  onChange={(e) => setRuleForm({ ...ruleForm, days_valid: parseInt(e.target.value) })}
                  style={styles.input}
                  min="1"
                  max="365"
                />
              </div>
            </div>

            <div style={styles.formGroup}>
              <label style={styles.label}>Reminder Days (comma-separated)</label>
              <input
                type="text"
                value={ruleForm.reminder_days}
                onChange={(e) => setRuleForm({ ...ruleForm, reminder_days: e.target.value })}
                style={styles.input}
                placeholder="7,3,1"
              />
              <span style={styles.helpText}>Days before expiry to send reminders</span>
            </div>

            <div style={styles.formRow}>
              <div style={styles.checkboxGroup}>
                <label style={styles.checkboxLabel}>
                  <input
                    type="checkbox"
                    checked={ruleForm.auto_expire}
                    onChange={(e) => setRuleForm({ ...ruleForm, auto_expire: e.target.checked })}
                  />
                  Auto-expire quotes
                </label>
              </div>

              <div style={styles.checkboxGroup}>
                <label style={styles.checkboxLabel}>
                  <input
                    type="checkbox"
                    checked={ruleForm.allow_renewal}
                    onChange={(e) => setRuleForm({ ...ruleForm, allow_renewal: e.target.checked })}
                  />
                  Allow renewal
                </label>
              </div>
            </div>

            {ruleForm.allow_renewal && (
              <div style={styles.formGroup}>
                <label style={styles.label}>Renewal Extends By (days)</label>
                <input
                  type="number"
                  value={ruleForm.renewal_extends_days}
                  onChange={(e) => setRuleForm({ ...ruleForm, renewal_extends_days: parseInt(e.target.value) })}
                  style={styles.input}
                  min="1"
                  max="90"
                />
              </div>
            )}

            <div style={styles.checkboxGroup}>
              <label style={styles.checkboxLabel}>
                <input
                  type="checkbox"
                  checked={ruleForm.is_default}
                  onChange={(e) => setRuleForm({ ...ruleForm, is_default: e.target.checked })}
                />
                Set as default rule
              </label>
            </div>

            <div style={styles.modalActions}>
              <button
                onClick={() => {
                  setShowRuleModal(false);
                  setEditingRule(null);
                  resetRuleForm();
                }}
                style={styles.cancelButton}
              >
                Cancel
              </button>
              <button
                onClick={handleSaveRule}
                style={styles.saveButton}
              >
                {editingRule ? 'Update Rule' : 'Create Rule'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

const styles = {
  container: {
    padding: '24px',
    maxWidth: '1400px',
    margin: '0 auto',
  },
  loading: {
    textAlign: 'center',
    padding: '60px',
    color: '#6b7280',
  },
  header: {
    marginBottom: '24px',
  },
  title: {
    margin: '0 0 4px',
    fontSize: '28px',
    fontWeight: '700',
    color: '#111827',
  },
  subtitle: {
    margin: 0,
    color: '#6b7280',
    fontSize: '14px',
  },
  statsRow: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
    gap: '16px',
    marginBottom: '24px',
  },
  statCard: {
    background: '#f5f3ff',
    padding: '20px',
    borderRadius: '12px',
  },
  statNumber: {
    fontSize: '32px',
    fontWeight: '700',
    color: '#667eea',
  },
  statLabel: {
    fontSize: '14px',
    color: '#6b7280',
    marginTop: '4px',
  },
  tabs: {
    display: 'flex',
    gap: '8px',
    marginBottom: '24px',
    borderBottom: '2px solid #e5e7eb',
    paddingBottom: '0',
  },
  tab: {
    padding: '12px 24px',
    border: 'none',
    background: 'transparent',
    fontSize: '14px',
    fontWeight: '600',
    color: '#6b7280',
    cursor: 'pointer',
    borderBottom: '2px solid transparent',
    marginBottom: '-2px',
    transition: 'all 0.2s',
  },
  tabActive: {
    color: '#667eea',
    borderBottomColor: '#667eea',
  },
  content: {
    background: 'white',
    borderRadius: '12px',
    boxShadow: '0 1px 3px rgba(0,0,0,0.1)',
    padding: '24px',
  },
  contentHeader: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: '20px',
  },
  contentTitle: {
    margin: 0,
    fontSize: '18px',
    fontWeight: '600',
    color: '#111827',
  },
  addButton: {
    padding: '10px 20px',
    background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
    color: 'white',
    border: 'none',
    borderRadius: '8px',
    fontSize: '14px',
    fontWeight: '600',
    cursor: 'pointer',
  },
  bulkButton: {
    padding: '10px 20px',
    background: '#10b981',
    color: 'white',
    border: 'none',
    borderRadius: '8px',
    fontSize: '14px',
    fontWeight: '600',
    cursor: 'pointer',
  },
  rulesGrid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))',
    gap: '16px',
  },
  ruleCard: {
    border: '1px solid #e5e7eb',
    borderRadius: '12px',
    padding: '20px',
  },
  ruleHeader: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: '16px',
  },
  ruleName: {
    margin: 0,
    fontSize: '16px',
    fontWeight: '600',
    color: '#111827',
  },
  defaultBadge: {
    background: '#dbeafe',
    color: '#1d4ed8',
    padding: '4px 8px',
    borderRadius: '4px',
    fontSize: '11px',
    fontWeight: '600',
  },
  ruleDetails: {
    marginBottom: '16px',
  },
  ruleDetail: {
    display: 'flex',
    justifyContent: 'space-between',
    padding: '6px 0',
    fontSize: '13px',
    borderBottom: '1px solid #f3f4f6',
  },
  ruleLabel: {
    color: '#6b7280',
  },
  statusYes: {
    color: '#059669',
    fontWeight: '500',
  },
  statusNo: {
    color: '#dc2626',
    fontWeight: '500',
  },
  ruleActions: {
    display: 'flex',
    gap: '8px',
  },
  editButton: {
    flex: 1,
    padding: '8px 16px',
    background: '#f3f4f6',
    border: 'none',
    borderRadius: '6px',
    fontSize: '13px',
    fontWeight: '500',
    cursor: 'pointer',
  },
  deleteButton: {
    padding: '8px 16px',
    background: '#fef2f2',
    color: '#dc2626',
    border: 'none',
    borderRadius: '6px',
    fontSize: '13px',
    fontWeight: '500',
    cursor: 'pointer',
  },
  table: {
    border: '1px solid #e5e7eb',
    borderRadius: '8px',
    overflow: 'hidden',
  },
  tableHeader: {
    display: 'flex',
    background: '#f9fafb',
    borderBottom: '1px solid #e5e7eb',
    fontWeight: '600',
    fontSize: '13px',
    color: '#374151',
  },
  tableRow: {
    display: 'flex',
    borderBottom: '1px solid #e5e7eb',
    fontSize: '14px',
  },
  tableCell: {
    padding: '12px 16px',
    display: 'flex',
    alignItems: 'center',
  },
  daysLeftBadge: {
    padding: '4px 8px',
    borderRadius: '4px',
    fontSize: '12px',
    fontWeight: '600',
  },
  expiredBadge: {
    padding: '4px 8px',
    background: '#fef2f2',
    color: '#dc2626',
    borderRadius: '4px',
    fontSize: '12px',
    fontWeight: '600',
  },
  renewButton: {
    padding: '6px 12px',
    background: '#10b981',
    color: 'white',
    border: 'none',
    borderRadius: '4px',
    fontSize: '12px',
    fontWeight: '500',
    cursor: 'pointer',
  },
  restoreButton: {
    padding: '6px 12px',
    background: '#667eea',
    color: 'white',
    border: 'none',
    borderRadius: '4px',
    fontSize: '12px',
    fontWeight: '500',
    cursor: 'pointer',
  },
  emptyRow: {
    padding: '40px',
    textAlign: 'center',
    color: '#6b7280',
  },
  emptyState: {
    gridColumn: '1 / -1',
    textAlign: 'center',
    padding: '60px',
    color: '#6b7280',
  },
  modalOverlay: {
    position: 'fixed',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    background: 'rgba(0,0,0,0.5)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 1000,
    padding: '20px',
  },
  modal: {
    background: 'white',
    borderRadius: '16px',
    padding: '32px',
    maxWidth: '500px',
    width: '100%',
    maxHeight: '90vh',
    overflowY: 'auto',
  },
  modalTitle: {
    margin: '0 0 24px',
    fontSize: '20px',
    fontWeight: '700',
    color: '#111827',
  },
  formGroup: {
    marginBottom: '20px',
  },
  formRow: {
    display: 'grid',
    gridTemplateColumns: '1fr 1fr',
    gap: '16px',
  },
  label: {
    display: 'block',
    marginBottom: '6px',
    fontSize: '14px',
    fontWeight: '600',
    color: '#374151',
  },
  input: {
    width: '100%',
    padding: '10px 14px',
    fontSize: '14px',
    border: '2px solid #e5e7eb',
    borderRadius: '8px',
    outline: 'none',
    boxSizing: 'border-box',
  },
  select: {
    width: '100%',
    padding: '10px 14px',
    fontSize: '14px',
    border: '2px solid #e5e7eb',
    borderRadius: '8px',
    outline: 'none',
    boxSizing: 'border-box',
    background: 'white',
  },
  helpText: {
    display: 'block',
    marginTop: '4px',
    fontSize: '12px',
    color: '#6b7280',
  },
  checkboxGroup: {
    marginBottom: '16px',
  },
  checkboxLabel: {
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
    fontSize: '14px',
    color: '#374151',
    cursor: 'pointer',
  },
  modalActions: {
    display: 'flex',
    gap: '12px',
    marginTop: '24px',
  },
  cancelButton: {
    flex: 1,
    padding: '12px',
    background: '#f3f4f6',
    color: '#374151',
    border: 'none',
    borderRadius: '8px',
    fontSize: '14px',
    fontWeight: '600',
    cursor: 'pointer',
  },
  saveButton: {
    flex: 1,
    padding: '12px',
    background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
    color: 'white',
    border: 'none',
    borderRadius: '8px',
    fontSize: '14px',
    fontWeight: '600',
    cursor: 'pointer',
  },
};

export default QuoteExpiryManager;
