import React, { useState, useEffect, useRef, useCallback } from 'react';
import { handleApiError } from '../utils/errorHandler';
import { toast } from './ui/Toast';

import { authFetch } from '../services/authFetch';
const API_BASE = `${process.env.REACT_APP_API_URL || 'http://localhost:3001'}/api`;

// Get auth headers for API calls
const getAuthHeaders = () => {
  const token = localStorage.getItem('auth_token');
  return {
    'Content-Type': 'application/json',
    ...(token && { 'Authorization': `Bearer ${token}` })
  };
};

/**
 * Power Features 2026 Component
 * Integrates: Special Orders, E-Signatures, Customer Portal, Quote Templates,
 * Quote Versioning, Mobile Preview, Follow-ups, Payments, Attachments, Price Book
 */

const PowerFeatures2026 = () => {
  const [activeTab, setActiveTab] = useState('special-orders');
  const [loading, setLoading] = useState(false);

  // Special Orders State
  const [stockProducts, setStockProducts] = useState([]);
  const [stockFilter, setStockFilter] = useState('all');

  // Templates State
  const [templates, setTemplates] = useState([]);
  const [showTemplateModal, setShowTemplateModal] = useState(false);
  const [newTemplate, setNewTemplate] = useState({ name: '', description: '', category: '', default_validity_days: 14 });

  // Follow-ups State
  const [followUpRules, setFollowUpRules] = useState([]);
  const [pendingFollowUps, setPendingFollowUps] = useState([]);

  // Price Book State
  const [priceBooks, setPriceBooks] = useState([]);
  const [priceNotifications, setPriceNotifications] = useState([]);

  const isMounted = useRef(true);

  useEffect(() => {
    isMounted.current = true;
    loadDataForTab(activeTab);
    return () => { isMounted.current = false; };
  }, [activeTab]);

  const loadDataForTab = async (tab) => {
    if (!isMounted.current) return;
    setLoading(true);

    try {
      switch (tab) {
        case 'special-orders':
          await loadStockProducts();
          break;
        case 'templates':
          await loadTemplates();
          break;
        case 'follow-ups':
          await loadFollowUps();
          break;
        case 'price-book':
          await loadPriceBooks();
          break;
        default:
          break;
      }
    } catch (error) {
      handleApiError(error, { context: 'Loading data' });
    } finally {
      if (isMounted.current) setLoading(false);
    }
  };

  // =====================================================
  // SPECIAL ORDERS
  // =====================================================
  const loadStockProducts = async () => {
    try {
      let url = `${API_BASE}/features/products/stock-status`;
      if (stockFilter === 'out') url += '?in_stock=false';
      else if (stockFilter === 'orderable') url += '?orderable=true&in_stock=false';

      const response = await authFetch(url, { headers: getAuthHeaders() });
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }
      const data = await response.json();
      if (isMounted.current) setStockProducts(data);
    } catch (error) {
      handleApiError(error, { context: 'Loading stock products' });
      if (isMounted.current) setStockProducts([]);
    }
  };

  const updateProductStock = async (productId, updates) => {
    try {
      await authFetch(`${API_BASE}/features/products/${productId}/stock`, {
        method: 'PUT',
        headers: getAuthHeaders(),
        body: JSON.stringify(updates)
      });
      toast.success('Stock status updated');
      await loadStockProducts();
    } catch (error) {
      handleApiError(error, { context: 'Updating stock' });
    }
  };

  // =====================================================
  // TEMPLATES
  // =====================================================
  const loadTemplates = async () => {
    try {
      const response = await authFetch(`${API_BASE}/features/quote-templates`, { headers: getAuthHeaders() });
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }
      const data = await response.json();
      if (isMounted.current) setTemplates(data);
    } catch (error) {
      handleApiError(error, { context: 'Loading templates' });
      if (isMounted.current) setTemplates([]);
    }
  };

  const createTemplate = async () => {
    try {
      await authFetch(`${API_BASE}/features/quote-templates`, {
        method: 'POST',
        headers: getAuthHeaders(),
        body: JSON.stringify(newTemplate)
      });
      toast.success('Template created');
      setShowTemplateModal(false);
      setNewTemplate({ name: '', description: '', category: '', default_validity_days: 14 });
      await loadTemplates();
    } catch (error) {
      handleApiError(error, { context: 'Creating template' });
    }
  };

  // =====================================================
  // FOLLOW-UPS
  // =====================================================
  const loadFollowUps = async () => {
    try {
      const [rulesRes, pendingRes] = await Promise.all([
        authFetch(`${API_BASE}/features/follow-up-rules`, { headers: getAuthHeaders() }),
        authFetch(`${API_BASE}/features/follow-ups/pending`, { headers: getAuthHeaders() })
      ]);
      if (!rulesRes.ok || !pendingRes.ok) {
        throw new Error('Failed to fetch follow-up data');
      }
      const rules = await rulesRes.json();
      const pending = await pendingRes.json();
      if (isMounted.current) {
        setFollowUpRules(rules);
        setPendingFollowUps(pending);
      }
    } catch (error) {
      handleApiError(error, { context: 'Loading follow-ups' });
      if (isMounted.current) {
        setFollowUpRules([]);
        setPendingFollowUps([]);
      }
    }
  };

  const markFollowUpSent = async (id) => {
    try {
      await authFetch(`${API_BASE}/features/follow-ups/${id}/sent`, { method: 'PUT', headers: getAuthHeaders() });
      toast.success('Follow-up marked as sent');
      await loadFollowUps();
    } catch (error) {
      handleApiError(error, { context: 'Marking follow-up sent' });
    }
  };

  // =====================================================
  // PRICE BOOK
  // =====================================================
  const loadPriceBooks = async () => {
    try {
      const [booksRes, notificationsRes] = await Promise.all([
        authFetch(`${API_BASE}/features/price-books`, { headers: getAuthHeaders() }),
        authFetch(`${API_BASE}/features/price-notifications?acknowledged=false`, { headers: getAuthHeaders() })
      ]);
      if (!booksRes.ok || !notificationsRes.ok) {
        throw new Error('Failed to fetch price book data');
      }
      const books = await booksRes.json();
      const notifications = await notificationsRes.json();
      if (isMounted.current) {
        setPriceBooks(books);
        setPriceNotifications(notifications);
      }
    } catch (error) {
      handleApiError(error, { context: 'Loading price books' });
      if (isMounted.current) {
        setPriceBooks([]);
        setPriceNotifications([]);
      }
    }
  };

  const acknowledgeNotification = async (id) => {
    try {
      await authFetch(`${API_BASE}/features/price-notifications/${id}/acknowledge`, {
        method: 'PUT',
        headers: getAuthHeaders(),
        body: JSON.stringify({ acknowledged_by: 'System' })
      });
      toast.success('Notification acknowledged');
      await loadPriceBooks();
    } catch (error) {
      handleApiError(error, { context: 'Acknowledging notification' });
    }
  };

  // =====================================================
  // RENDER
  // =====================================================
  const tabs = [
    { id: 'special-orders', label: '📦 Special Orders', description: 'Manage stock status & lead times' },
    { id: 'e-signatures', label: '✍️ E-Signatures', description: 'Digital quote acceptance' },
    { id: 'portal', label: '🌐 Customer Portal', description: 'Self-service quote access' },
    { id: 'templates', label: '📝 Quote Templates', description: 'Pre-configured quote templates' },
    { id: 'versioning', label: '🔄 Quote Versions', description: 'Track quote revisions' },
    { id: 'mobile', label: '📱 Mobile Preview', description: 'QR codes & mobile links' },
    { id: 'follow-ups', label: '⏰ Follow-ups', description: 'Automated reminders' },
    { id: 'payments', label: '💳 Payments', description: 'Deposit & payment tracking' },
    { id: 'attachments', label: '📎 Attachments', description: 'Spec sheets & documents' },
    { id: 'price-book', label: '📊 Price Book', description: 'Manufacturer pricing' }
  ];

  const formatCurrency = (cents) => cents ? `$${(cents / 100).toFixed(2)}` : '$0.00';

  return (
    <div style={{ padding: '30px', fontFamily: 'system-ui, -apple-system, sans-serif', background: '#f9fafb', minHeight: 'calc(100vh - 140px)' }}>
      <div style={{ maxWidth: '1400px', margin: '0 auto' }}>
        {/* Header */}
        <div style={{ marginBottom: '30px' }}>
          <h1 style={{ margin: '0 0 8px 0', fontSize: '28px', fontWeight: 'bold', background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>
            🚀 Power Features 2026
          </h1>
          <p style={{ margin: 0, color: '#6b7280', fontSize: '14px' }}>Advanced quotation system capabilities</p>
        </div>

        {/* Tab Navigation */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: '12px', marginBottom: '24px' }}>
          {tabs.map(tab => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              style={{
                padding: '16px',
                background: activeTab === tab.id ? 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)' : 'white',
                color: activeTab === tab.id ? 'white' : '#374151',
                border: 'none',
                borderRadius: '12px',
                cursor: 'pointer',
                textAlign: 'left',
                boxShadow: '0 1px 3px rgba(0,0,0,0.1)',
                transition: 'all 0.2s'
              }}
            >
              <div style={{ fontSize: '16px', fontWeight: '600', marginBottom: '4px' }}>{tab.label}</div>
              <div style={{ fontSize: '11px', opacity: 0.8 }}>{tab.description}</div>
            </button>
          ))}
        </div>

        {/* Content Area */}
        <div style={{ background: 'white', borderRadius: '16px', padding: '24px', boxShadow: '0 1px 3px rgba(0,0,0,0.1)' }}>
          {loading ? (
            <div style={{ textAlign: 'center', padding: '40px', color: '#6b7280' }}>Loading...</div>
          ) : (
            <>
              {/* Special Orders Tab */}
              {activeTab === 'special-orders' && (
                <div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
                    <h2 style={{ margin: 0, fontSize: '20px', fontWeight: '600' }}>📦 Special Order Products</h2>
                    <select
                      value={stockFilter}
                      onChange={(e) => { setStockFilter(e.target.value); setTimeout(loadStockProducts, 100); }}
                      style={{ padding: '8px 16px', borderRadius: '8px', border: '1px solid #e5e7eb' }}
                    >
                      <option value="all">All Products</option>
                      <option value="out">Out of Stock</option>
                      <option value="orderable">Orderable Only</option>
                    </select>
                  </div>

                  <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                    <thead>
                      <tr style={{ borderBottom: '2px solid #e5e7eb' }}>
                        <th style={{ textAlign: 'left', padding: '12px', fontSize: '12px', color: '#6b7280', textTransform: 'uppercase' }}>Product</th>
                        <th style={{ textAlign: 'center', padding: '12px', fontSize: '12px', color: '#6b7280', textTransform: 'uppercase' }}>In Stock</th>
                        <th style={{ textAlign: 'center', padding: '12px', fontSize: '12px', color: '#6b7280', textTransform: 'uppercase' }}>Lead Time</th>
                        <th style={{ textAlign: 'center', padding: '12px', fontSize: '12px', color: '#6b7280', textTransform: 'uppercase' }}>Status</th>
                        <th style={{ textAlign: 'right', padding: '12px', fontSize: '12px', color: '#6b7280', textTransform: 'uppercase' }}>Actions</th>
                      </tr>
                    </thead>
                    <tbody>
                      {stockProducts.slice(0, 50).map(product => (
                        <tr key={product.id} style={{ borderBottom: '1px solid #f3f4f6' }}>
                          <td style={{ padding: '12px' }}>
                            <div style={{ fontWeight: '600' }}>{product.manufacturer} {product.model}</div>
                            <div style={{ fontSize: '12px', color: '#6b7280' }}>{product.category}</div>
                          </td>
                          <td style={{ textAlign: 'center', padding: '12px' }}>
                            <span style={{
                              padding: '4px 12px',
                              borderRadius: '999px',
                              fontSize: '12px',
                              fontWeight: '500',
                              background: product.in_stock ? '#dcfce7' : '#fee2e2',
                              color: product.in_stock ? '#166534' : '#991b1b'
                            }}>
                              {product.in_stock ? 'Yes' : 'No'}
                            </span>
                          </td>
                          <td style={{ textAlign: 'center', padding: '12px' }}>
                            {product.lead_time_days || 0} days
                          </td>
                          <td style={{ textAlign: 'center', padding: '12px' }}>
                            <select
                              value={product.stock_status || 'in_stock'}
                              onChange={(e) => updateProductStock(product.id, { stock_status: e.target.value })}
                              style={{ padding: '4px 8px', borderRadius: '4px', border: '1px solid #e5e7eb', fontSize: '12px' }}
                            >
                              <option value="in_stock">In Stock</option>
                              <option value="low_stock">Low Stock</option>
                              <option value="out_of_stock">Out of Stock</option>
                              <option value="special_order">Special Order</option>
                              <option value="discontinued">Discontinued</option>
                            </select>
                          </td>
                          <td style={{ textAlign: 'right', padding: '12px' }}>
                            <button
                              onClick={() => updateProductStock(product.id, { in_stock: !product.in_stock })}
                              style={{
                                padding: '6px 12px',
                                background: '#f3f4f6',
                                border: 'none',
                                borderRadius: '6px',
                                cursor: 'pointer',
                                fontSize: '12px'
                              }}
                            >
                              Toggle Stock
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  {stockProducts.length > 50 && (
                    <div style={{ textAlign: 'center', padding: '16px', color: '#6b7280', fontSize: '14px' }}>
                      Showing 50 of {stockProducts.length} products
                    </div>
                  )}
                </div>
              )}

              {/* E-Signatures Tab */}
              {activeTab === 'e-signatures' && (
                <div>
                  <h2 style={{ margin: '0 0 20px 0', fontSize: '20px', fontWeight: '600' }}>✍️ E-Signature System</h2>
                  <div style={{ background: '#f0f9ff', padding: '24px', borderRadius: '12px', marginBottom: '20px' }}>
                    <h3 style={{ margin: '0 0 12px 0', color: '#0369a1' }}>How E-Signatures Work</h3>
                    <ol style={{ margin: 0, paddingLeft: '20px', color: '#0c4a6e' }}>
                      <li style={{ marginBottom: '8px' }}>Generate an acceptance link for any quote from the Quotations tab</li>
                      <li style={{ marginBottom: '8px' }}>Send the link to your customer via email</li>
                      <li style={{ marginBottom: '8px' }}>Customer reviews quote and signs digitally</li>
                      <li>Quote status automatically updates to "ACCEPTED"</li>
                    </ol>
                  </div>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '16px' }}>
                    <div style={{ background: '#f9fafb', padding: '20px', borderRadius: '12px', textAlign: 'center' }}>
                      <div style={{ fontSize: '32px', marginBottom: '8px' }}>🔗</div>
                      <div style={{ fontWeight: '600' }}>Secure Links</div>
                      <div style={{ fontSize: '12px', color: '#6b7280' }}>Unique tokens per quote</div>
                    </div>
                    <div style={{ background: '#f9fafb', padding: '20px', borderRadius: '12px', textAlign: 'center' }}>
                      <div style={{ fontSize: '32px', marginBottom: '8px' }}>📝</div>
                      <div style={{ fontWeight: '600' }}>Digital Signatures</div>
                      <div style={{ fontSize: '12px', color: '#6b7280' }}>Touch or mouse input</div>
                    </div>
                    <div style={{ background: '#f9fafb', padding: '20px', borderRadius: '12px', textAlign: 'center' }}>
                      <div style={{ fontSize: '32px', marginBottom: '8px' }}>📜</div>
                      <div style={{ fontWeight: '600' }}>Legal Record</div>
                      <div style={{ fontSize: '12px', color: '#6b7280' }}>IP & timestamp logged</div>
                    </div>
                  </div>
                </div>
              )}

              {/* Customer Portal Tab */}
              {activeTab === 'portal' && (
                <div>
                  <h2 style={{ margin: '0 0 20px 0', fontSize: '20px', fontWeight: '600' }}>🌐 Customer Portal</h2>
                  <div style={{ background: '#fef3c7', padding: '24px', borderRadius: '12px', marginBottom: '20px' }}>
                    <h3 style={{ margin: '0 0 12px 0', color: '#92400e' }}>Self-Service Quote Access</h3>
                    <p style={{ margin: 0, color: '#78350f' }}>
                      Generate unique portal access links for customers. They can view all their quotes,
                      request changes, and add comments without needing a login.
                    </p>
                  </div>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '20px' }}>
                    <div style={{ background: '#f9fafb', padding: '24px', borderRadius: '12px' }}>
                      <h4 style={{ margin: '0 0 12px 0' }}>Customer Features</h4>
                      <ul style={{ margin: 0, paddingLeft: '20px', color: '#374151' }}>
                        <li>View all their quotes</li>
                        <li>See quote details and items</li>
                        <li>Request changes or revisions</li>
                        <li>Add comments or questions</li>
                        <li>Accept quotes with e-signature</li>
                      </ul>
                    </div>
                    <div style={{ background: '#f9fafb', padding: '24px', borderRadius: '12px' }}>
                      <h4 style={{ margin: '0 0 12px 0' }}>Admin Features</h4>
                      <ul style={{ margin: 0, paddingLeft: '20px', color: '#374151' }}>
                        <li>Generate portal links per customer</li>
                        <li>Track portal access activity</li>
                        <li>View change requests</li>
                        <li>Respond to customer comments</li>
                        <li>Revoke access if needed</li>
                      </ul>
                    </div>
                  </div>
                </div>
              )}

              {/* Templates Tab */}
              {activeTab === 'templates' && (
                <div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
                    <h2 style={{ margin: 0, fontSize: '20px', fontWeight: '600' }}>📝 Quote Templates</h2>
                    <button
                      onClick={() => setShowTemplateModal(true)}
                      style={{
                        padding: '10px 20px',
                        background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
                        color: 'white',
                        border: 'none',
                        borderRadius: '8px',
                        cursor: 'pointer',
                        fontWeight: '600'
                      }}
                    >
                      + New Template
                    </button>
                  </div>

                  {templates.length === 0 ? (
                    <div style={{ textAlign: 'center', padding: '40px', color: '#6b7280' }}>
                      No templates yet. Create your first template to speed up quote creation.
                    </div>
                  ) : (
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '16px' }}>
                      {templates.map(template => (
                        <div key={template.id} style={{ background: '#f9fafb', padding: '20px', borderRadius: '12px' }}>
                          <h4 style={{ margin: '0 0 8px 0' }}>{template.name}</h4>
                          <p style={{ margin: '0 0 12px 0', fontSize: '13px', color: '#6b7280' }}>{template.description}</p>
                          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '12px', color: '#9ca3af' }}>
                            <span>{template.item_count || 0} items</span>
                            <span>Used {template.use_count || 0}x</span>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}

                  {/* Template Modal */}
                  {showTemplateModal && (
                    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 }}>
                      <div style={{ background: 'white', padding: '32px', borderRadius: '16px', width: '500px', maxWidth: '90vw' }}>
                        <h3 style={{ margin: '0 0 20px 0' }}>Create Quote Template</h3>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                          <input
                            type="text"
                            placeholder="Template Name"
                            value={newTemplate.name}
                            onChange={(e) => setNewTemplate({ ...newTemplate, name: e.target.value })}
                            style={{ padding: '12px', borderRadius: '8px', border: '1px solid #e5e7eb' }}
                          />
                          <textarea
                            placeholder="Description"
                            value={newTemplate.description}
                            onChange={(e) => setNewTemplate({ ...newTemplate, description: e.target.value })}
                            style={{ padding: '12px', borderRadius: '8px', border: '1px solid #e5e7eb', minHeight: '80px' }}
                          />
                          <input
                            type="text"
                            placeholder="Category (e.g., Kitchen Package, Laundry Set)"
                            value={newTemplate.category}
                            onChange={(e) => setNewTemplate({ ...newTemplate, category: e.target.value })}
                            style={{ padding: '12px', borderRadius: '8px', border: '1px solid #e5e7eb' }}
                          />
                          <div style={{ display: 'flex', gap: '12px', justifyContent: 'flex-end' }}>
                            <button onClick={() => setShowTemplateModal(false)} style={{ padding: '10px 20px', background: '#f3f4f6', border: 'none', borderRadius: '8px', cursor: 'pointer' }}>
                              Cancel
                            </button>
                            <button onClick={createTemplate} style={{ padding: '10px 20px', background: '#667eea', color: 'white', border: 'none', borderRadius: '8px', cursor: 'pointer' }}>
                              Create Template
                            </button>
                          </div>
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              )}

              {/* Versioning Tab */}
              {activeTab === 'versioning' && (
                <div>
                  <h2 style={{ margin: '0 0 20px 0', fontSize: '20px', fontWeight: '600' }}>🔄 Quote Versioning</h2>
                  <div style={{ background: '#ecfdf5', padding: '24px', borderRadius: '12px' }}>
                    <h3 style={{ margin: '0 0 12px 0', color: '#065f46' }}>Automatic Version Control</h3>
                    <p style={{ margin: 0, color: '#047857' }}>
                      Every time you make significant changes to a quote, a new version is automatically created.
                      View the full history of changes and compare versions side-by-side.
                    </p>
                  </div>
                </div>
              )}

              {/* Mobile Preview Tab */}
              {activeTab === 'mobile' && (
                <div>
                  <h2 style={{ margin: '0 0 20px 0', fontSize: '20px', fontWeight: '600' }}>📱 Mobile Preview & QR Codes</h2>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '20px' }}>
                    <div style={{ background: '#f9fafb', padding: '24px', borderRadius: '12px' }}>
                      <h4 style={{ margin: '0 0 12px 0' }}>Mobile-Responsive Views</h4>
                      <p style={{ margin: 0, color: '#6b7280', fontSize: '14px' }}>
                        Generate public links that customers can view on any device.
                        The quote preview automatically adapts to mobile screens.
                      </p>
                    </div>
                    <div style={{ background: '#f9fafb', padding: '24px', borderRadius: '12px' }}>
                      <h4 style={{ margin: '0 0 12px 0' }}>QR Code Generation</h4>
                      <p style={{ margin: 0, color: '#6b7280', fontSize: '14px' }}>
                        Add QR codes to printed quotes that link directly to the
                        digital version for easy mobile access.
                      </p>
                    </div>
                  </div>
                </div>
              )}

              {/* Follow-ups Tab */}
              {activeTab === 'follow-ups' && (
                <div>
                  <h2 style={{ margin: '0 0 20px 0', fontSize: '20px', fontWeight: '600' }}>⏰ Automated Follow-ups</h2>

                  <div style={{ marginBottom: '24px' }}>
                    <h3 style={{ margin: '0 0 12px 0', fontSize: '16px' }}>Follow-up Rules</h3>
                    <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                      <thead>
                        <tr style={{ borderBottom: '2px solid #e5e7eb' }}>
                          <th style={{ textAlign: 'left', padding: '12px', fontSize: '12px', color: '#6b7280' }}>Rule</th>
                          <th style={{ textAlign: 'center', padding: '12px', fontSize: '12px', color: '#6b7280' }}>Trigger</th>
                          <th style={{ textAlign: 'center', padding: '12px', fontSize: '12px', color: '#6b7280' }}>Status</th>
                        </tr>
                      </thead>
                      <tbody>
                        {followUpRules.map(rule => (
                          <tr key={rule.id} style={{ borderBottom: '1px solid #f3f4f6' }}>
                            <td style={{ padding: '12px' }}>
                              <div style={{ fontWeight: '600' }}>{rule.name}</div>
                              <div style={{ fontSize: '12px', color: '#6b7280' }}>{rule.description}</div>
                            </td>
                            <td style={{ textAlign: 'center', padding: '12px' }}>
                              {rule.trigger_days > 0 ? `${rule.trigger_days} days after sent` : `${Math.abs(rule.trigger_days)} days before expiry`}
                            </td>
                            <td style={{ textAlign: 'center', padding: '12px' }}>
                              <span style={{
                                padding: '4px 12px',
                                borderRadius: '999px',
                                fontSize: '12px',
                                background: rule.is_active ? '#dcfce7' : '#fee2e2',
                                color: rule.is_active ? '#166534' : '#991b1b'
                              }}>
                                {rule.is_active ? 'Active' : 'Inactive'}
                              </span>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>

                  <div>
                    <h3 style={{ margin: '0 0 12px 0', fontSize: '16px' }}>Pending Follow-ups ({pendingFollowUps.length})</h3>
                    {pendingFollowUps.length === 0 ? (
                      <div style={{ textAlign: 'center', padding: '20px', color: '#6b7280', background: '#f9fafb', borderRadius: '8px' }}>
                        No pending follow-ups
                      </div>
                    ) : (
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                        {pendingFollowUps.map(followUp => (
                          <div key={followUp.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '16px', background: '#fef3c7', borderRadius: '8px' }}>
                            <div>
                              <div style={{ fontWeight: '600' }}>Quote #{followUp.quotation_number}</div>
                              <div style={{ fontSize: '13px', color: '#92400e' }}>{followUp.customer_name} - {followUp.customer_email}</div>
                            </div>
                            <button
                              onClick={() => markFollowUpSent(followUp.id)}
                              style={{ padding: '8px 16px', background: '#f59e0b', color: 'white', border: 'none', borderRadius: '6px', cursor: 'pointer' }}
                            >
                              Mark Sent
                            </button>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              )}

              {/* Payments Tab */}
              {activeTab === 'payments' && (
                <div>
                  <h2 style={{ margin: '0 0 20px 0', fontSize: '20px', fontWeight: '600' }}>💳 Payment Integration</h2>
                  <div style={{ background: '#dbeafe', padding: '24px', borderRadius: '12px', marginBottom: '20px' }}>
                    <h3 style={{ margin: '0 0 12px 0', color: '#1e40af' }}>Coming Soon: Online Payments</h3>
                    <p style={{ margin: 0, color: '#1e3a8a' }}>
                      Accept deposits and full payments directly through quotes.
                      Integration with Stripe and Square for secure credit card processing.
                    </p>
                  </div>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '16px' }}>
                    <div style={{ background: '#f9fafb', padding: '20px', borderRadius: '12px', textAlign: 'center' }}>
                      <div style={{ fontSize: '28px', marginBottom: '8px' }}>💰</div>
                      <div style={{ fontWeight: '600' }}>Deposits</div>
                      <div style={{ fontSize: '12px', color: '#6b7280' }}>Collect upfront payments</div>
                    </div>
                    <div style={{ background: '#f9fafb', padding: '20px', borderRadius: '12px', textAlign: 'center' }}>
                      <div style={{ fontSize: '28px', marginBottom: '8px' }}>🔒</div>
                      <div style={{ fontWeight: '600' }}>Secure</div>
                      <div style={{ fontSize: '12px', color: '#6b7280' }}>PCI compliant</div>
                    </div>
                    <div style={{ background: '#f9fafb', padding: '20px', borderRadius: '12px', textAlign: 'center' }}>
                      <div style={{ fontSize: '28px', marginBottom: '8px' }}>📧</div>
                      <div style={{ fontWeight: '600' }}>Receipts</div>
                      <div style={{ fontSize: '12px', color: '#6b7280' }}>Automatic confirmation</div>
                    </div>
                  </div>
                </div>
              )}

              {/* Attachments Tab */}
              {activeTab === 'attachments' && (
                <div>
                  <h2 style={{ margin: '0 0 20px 0', fontSize: '20px', fontWeight: '600' }}>📎 PDF Attachments & Spec Sheets</h2>
                  <div style={{ background: '#f0fdf4', padding: '24px', borderRadius: '12px', marginBottom: '20px' }}>
                    <h3 style={{ margin: '0 0 12px 0', color: '#166534' }}>Attach Documents to Quotes</h3>
                    <p style={{ margin: 0, color: '#15803d' }}>
                      Upload product specification sheets, warranty documents, and other materials.
                      Optionally include them in the generated PDF quotes.
                    </p>
                  </div>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '20px' }}>
                    <div style={{ background: '#f9fafb', padding: '24px', borderRadius: '12px' }}>
                      <h4 style={{ margin: '0 0 12px 0' }}>Supported File Types</h4>
                      <ul style={{ margin: 0, paddingLeft: '20px', color: '#374151' }}>
                        <li>PDF documents</li>
                        <li>Images (JPG, PNG)</li>
                        <li>Product spec sheets</li>
                        <li>Warranty information</li>
                      </ul>
                    </div>
                    <div style={{ background: '#f9fafb', padding: '24px', borderRadius: '12px' }}>
                      <h4 style={{ margin: '0 0 12px 0' }}>Features</h4>
                      <ul style={{ margin: 0, paddingLeft: '20px', color: '#374151' }}>
                        <li>Per-product attachments</li>
                        <li>Include in PDF option</li>
                        <li>Auto-attach product images</li>
                        <li>Manufacturer spec library</li>
                      </ul>
                    </div>
                  </div>
                </div>
              )}

              {/* Price Book Tab */}
              {activeTab === 'price-book' && (
                <div>
                  <h2 style={{ margin: '0 0 20px 0', fontSize: '20px', fontWeight: '600' }}>📊 Price Book Management</h2>

                  {priceNotifications.length > 0 && (
                    <div style={{ background: '#fef3c7', padding: '16px', borderRadius: '12px', marginBottom: '20px' }}>
                      <h4 style={{ margin: '0 0 12px 0', color: '#92400e' }}>⚠️ {priceNotifications.length} Price Change Notifications</h4>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                        {priceNotifications.slice(0, 5).map(notification => (
                          <div key={notification.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '12px', background: 'white', borderRadius: '8px' }}>
                            <div>
                              <span style={{ fontWeight: '600' }}>{notification.manufacturer} {notification.model}</span>
                              <span style={{ marginLeft: '12px', color: notification.change_percent > 0 ? '#dc2626' : '#16a34a' }}>
                                {notification.change_percent > 0 ? '+' : ''}{notification.change_percent}%
                              </span>
                            </div>
                            <button
                              onClick={() => acknowledgeNotification(notification.id)}
                              style={{ padding: '6px 12px', background: '#f59e0b', color: 'white', border: 'none', borderRadius: '6px', cursor: 'pointer', fontSize: '12px' }}
                            >
                              Acknowledge
                            </button>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  <div style={{ marginBottom: '24px' }}>
                    <h3 style={{ margin: '0 0 12px 0', fontSize: '16px' }}>Price Books</h3>
                    {priceBooks.length === 0 ? (
                      <div style={{ textAlign: 'center', padding: '20px', color: '#6b7280', background: '#f9fafb', borderRadius: '8px' }}>
                        No price books imported yet. Use the Product Import feature to create price books.
                      </div>
                    ) : (
                      <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                        <thead>
                          <tr style={{ borderBottom: '2px solid #e5e7eb' }}>
                            <th style={{ textAlign: 'left', padding: '12px', fontSize: '12px', color: '#6b7280' }}>Name</th>
                            <th style={{ textAlign: 'left', padding: '12px', fontSize: '12px', color: '#6b7280' }}>Manufacturer</th>
                            <th style={{ textAlign: 'center', padding: '12px', fontSize: '12px', color: '#6b7280' }}>Effective</th>
                            <th style={{ textAlign: 'center', padding: '12px', fontSize: '12px', color: '#6b7280' }}>Products</th>
                            <th style={{ textAlign: 'center', padding: '12px', fontSize: '12px', color: '#6b7280' }}>Status</th>
                          </tr>
                        </thead>
                        <tbody>
                          {priceBooks.map(book => (
                            <tr key={book.id} style={{ borderBottom: '1px solid #f3f4f6' }}>
                              <td style={{ padding: '12px', fontWeight: '600' }}>{book.name}</td>
                              <td style={{ padding: '12px' }}>{book.manufacturer}</td>
                              <td style={{ textAlign: 'center', padding: '12px' }}>{new Date(book.effective_date).toLocaleDateString()}</td>
                              <td style={{ textAlign: 'center', padding: '12px' }}>{book.product_count}</td>
                              <td style={{ textAlign: 'center', padding: '12px' }}>
                                <span style={{
                                  padding: '4px 12px',
                                  borderRadius: '999px',
                                  fontSize: '12px',
                                  background: book.status === 'active' ? '#dcfce7' : '#fee2e2',
                                  color: book.status === 'active' ? '#166534' : '#991b1b'
                                }}>
                                  {book.status}
                                </span>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    )}
                  </div>
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
};

export default PowerFeatures2026;
