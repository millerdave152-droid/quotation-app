import React, { useState, useEffect, useCallback } from 'react';
import VolumeDiscountEditor from './VolumeDiscountEditor';
import PromotionManager from './PromotionManager';

import { authFetch } from '../../services/authFetch';
const API_URL = `${process.env.REACT_APP_API_URL || 'http://localhost:3001'}/api`;

// Helper to get auth headers
const getAuthHeaders = () => {
  const token = localStorage.getItem('auth_token');
  return {
    'Content-Type': 'application/json',
    ...(token && { 'Authorization': `Bearer ${token}` })
  };
};

/**
 * AdvancedPricingManager - Admin dashboard for managing pricing rules
 *
 * Features:
 * - Volume discount rules management
 * - Promotions and promo codes management
 * - Stacking policy view
 */
const AdvancedPricingManager = () => {
  const [activeTab, setActiveTab] = useState('volume');
  const [volumeRules, setVolumeRules] = useState([]);
  const [promotions, setPromotions] = useState([]);
  const [stackingPolicy, setStackingPolicy] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  // Modal states
  const [showVolumeEditor, setShowVolumeEditor] = useState(false);
  const [showPromoEditor, setShowPromoEditor] = useState(false);
  const [editingRule, setEditingRule] = useState(null);
  const [editingPromo, setEditingPromo] = useState(null);

  // Fetch all data
  const fetchData = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);

      const [rulesRes, promosRes, policyRes] = await Promise.all([
        authFetch(`${API_URL}/advanced-pricing/volume-rules?includeExpired=true`, { headers: getAuthHeaders() }),
        authFetch(`${API_URL}/advanced-pricing/promotions?includeExpired=true`, { headers: getAuthHeaders() }),
        authFetch(`${API_URL}/advanced-pricing/stacking-policy`, { headers: getAuthHeaders() })
      ]);

      if (!rulesRes.ok || !promosRes.ok || !policyRes.ok) {
        throw new Error('Failed to fetch pricing data');
      }

      const [rules, promos, policy] = await Promise.all([
        rulesRes.json(),
        promosRes.json(),
        policyRes.json()
      ]);

      setVolumeRules(rules);
      setPromotions(promos);
      setStackingPolicy(policy);
    } catch (err) {
      console.error('Error fetching pricing data:', err);
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  // Handle volume rule save
  const handleSaveVolumeRule = async (ruleData) => {
    try {
      const isEdit = !!ruleData.id;
      const url = isEdit
        ? `${API_URL}/advanced-pricing/volume-rules/${ruleData.id}`
        : `${API_URL}/advanced-pricing/volume-rules`;

      const response = await authFetch(url, {
        method: isEdit ? 'PUT' : 'POST',
        headers: getAuthHeaders(),
        body: JSON.stringify(ruleData)
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Failed to save volume rule');
      }

      await fetchData();
      setShowVolumeEditor(false);
      setEditingRule(null);
    } catch (err) {
      console.error('Error saving volume rule:', err);
      throw err;
    }
  };

  // Handle volume rule delete
  const handleDeleteVolumeRule = async (ruleId) => {
    if (!window.confirm('Are you sure you want to delete this volume discount rule?')) {
      return;
    }

    try {
      const response = await authFetch(`${API_URL}/advanced-pricing/volume-rules/${ruleId}`, {
        method: 'DELETE',
        headers: getAuthHeaders()
      });

      if (!response.ok) {
        throw new Error('Failed to delete volume rule');
      }

      await fetchData();
    } catch (err) {
      console.error('Error deleting volume rule:', err);
      alert('Failed to delete volume rule: ' + err.message);
    }
  };

  // Handle promotion save
  const handleSavePromotion = async (promoData) => {
    try {
      const isEdit = !!promoData.id;
      const url = isEdit
        ? `${API_URL}/advanced-pricing/promotions/${promoData.id}`
        : `${API_URL}/advanced-pricing/promotions`;

      const response = await authFetch(url, {
        method: isEdit ? 'PUT' : 'POST',
        headers: getAuthHeaders(),
        body: JSON.stringify(promoData)
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Failed to save promotion');
      }

      await fetchData();
      setShowPromoEditor(false);
      setEditingPromo(null);
    } catch (err) {
      console.error('Error saving promotion:', err);
      throw err;
    }
  };

  // Handle promotion delete
  const handleDeletePromotion = async (promoId) => {
    if (!window.confirm('Are you sure you want to delete this promotion?')) {
      return;
    }

    try {
      const response = await authFetch(`${API_URL}/advanced-pricing/promotions/${promoId}`, {
        method: 'DELETE',
        headers: getAuthHeaders()
      });

      if (!response.ok) {
        throw new Error('Failed to delete promotion');
      }

      await fetchData();
    } catch (err) {
      console.error('Error deleting promotion:', err);
      alert('Failed to delete promotion: ' + err.message);
    }
  };

  const containerStyle = {
    padding: '24px',
    maxWidth: '1400px',
    margin: '0 auto'
  };

  const headerStyle = {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: '24px'
  };

  const titleStyle = {
    fontSize: '24px',
    fontWeight: '700',
    color: '#1a1a2e',
    margin: 0
  };

  const tabsStyle = {
    display: 'flex',
    gap: '8px',
    marginBottom: '24px',
    borderBottom: '2px solid #e5e7eb',
    paddingBottom: '0'
  };

  const tabStyle = (isActive) => ({
    padding: '12px 24px',
    fontSize: '14px',
    fontWeight: '600',
    color: isActive ? '#6366f1' : '#6b7280',
    backgroundColor: 'transparent',
    border: 'none',
    borderBottom: isActive ? '2px solid #6366f1' : '2px solid transparent',
    marginBottom: '-2px',
    cursor: 'pointer',
    transition: 'all 0.2s'
  });

  const cardStyle = {
    backgroundColor: '#fff',
    borderRadius: '12px',
    boxShadow: '0 1px 3px rgba(0,0,0,0.1)',
    overflow: 'hidden'
  };

  const policyCardStyle = {
    backgroundColor: '#f0fdf4',
    border: '1px solid #86efac',
    borderRadius: '12px',
    padding: '20px',
    marginBottom: '24px'
  };

  if (loading) {
    return (
      <div style={containerStyle}>
        <div style={{ textAlign: 'center', padding: '60px' }}>
          <div style={{ fontSize: '24px', marginBottom: '16px' }}>Loading pricing rules...</div>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div style={containerStyle}>
        <div style={{ textAlign: 'center', padding: '60px', color: '#dc2626' }}>
          <div style={{ fontSize: '24px', marginBottom: '16px' }}>Error loading pricing data</div>
          <div>{error}</div>
          <button
            onClick={fetchData}
            style={{
              marginTop: '16px',
              padding: '8px 16px',
              backgroundColor: '#6366f1',
              color: '#fff',
              border: 'none',
              borderRadius: '6px',
              cursor: 'pointer'
            }}
          >
            Retry
          </button>
        </div>
      </div>
    );
  }

  return (
    <div style={containerStyle}>
      <div style={headerStyle}>
        <h1 style={titleStyle}>Advanced Pricing</h1>
      </div>

      {/* Stacking Policy Info */}
      {stackingPolicy && (
        <div style={policyCardStyle}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '12px' }}>
            <span style={{ fontSize: '20px' }}>shield</span>
            <span style={{ fontWeight: '600', color: '#166534' }}>Stacking Policy: {stackingPolicy.policy_name}</span>
          </div>
          <div style={{ display: 'flex', gap: '32px', fontSize: '14px', color: '#166534' }}>
            <span>Max Total Discount: {stackingPolicy.max_total_discount_percent}%</span>
            <span>Min Margin After Discounts: {stackingPolicy.min_margin_after_discounts_percent}%</span>
            <span>Max Stackable Discounts: {stackingPolicy.max_stackable_discounts}</span>
          </div>
        </div>
      )}

      {/* Tabs */}
      <div style={tabsStyle}>
        <button
          style={tabStyle(activeTab === 'volume')}
          onClick={() => setActiveTab('volume')}
        >
          Volume Discounts ({volumeRules.length})
        </button>
        <button
          style={tabStyle(activeTab === 'promotions')}
          onClick={() => setActiveTab('promotions')}
        >
          Promotions ({promotions.length})
        </button>
      </div>

      {/* Volume Discounts Tab */}
      {activeTab === 'volume' && (
        <div style={cardStyle}>
          <div style={{ padding: '16px 20px', borderBottom: '1px solid #e5e7eb', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <h2 style={{ margin: 0, fontSize: '18px', fontWeight: '600' }}>Volume Discount Rules</h2>
            <button
              onClick={() => {
                setEditingRule(null);
                setShowVolumeEditor(true);
              }}
              style={{
                padding: '8px 16px',
                backgroundColor: '#6366f1',
                color: '#fff',
                border: 'none',
                borderRadius: '6px',
                fontSize: '14px',
                fontWeight: '500',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                gap: '6px'
              }}
            >
              + Add Volume Rule
            </button>
          </div>

          {volumeRules.length === 0 ? (
            <div style={{ padding: '60px', textAlign: 'center', color: '#6b7280' }}>
              <div style={{ fontSize: '48px', marginBottom: '16px' }}>%</div>
              <div style={{ fontSize: '16px', marginBottom: '8px' }}>No volume discount rules yet</div>
              <div style={{ fontSize: '14px' }}>Create rules to offer quantity-based discounts</div>
            </div>
          ) : (
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                <thead>
                  <tr style={{ backgroundColor: '#f9fafb' }}>
                    <th style={{ padding: '12px 16px', textAlign: 'left', fontSize: '12px', fontWeight: '600', color: '#6b7280', textTransform: 'uppercase' }}>Name</th>
                    <th style={{ padding: '12px 16px', textAlign: 'left', fontSize: '12px', fontWeight: '600', color: '#6b7280', textTransform: 'uppercase' }}>Scope</th>
                    <th style={{ padding: '12px 16px', textAlign: 'left', fontSize: '12px', fontWeight: '600', color: '#6b7280', textTransform: 'uppercase' }}>Tiers</th>
                    <th style={{ padding: '12px 16px', textAlign: 'left', fontSize: '12px', fontWeight: '600', color: '#6b7280', textTransform: 'uppercase' }}>Validity</th>
                    <th style={{ padding: '12px 16px', textAlign: 'center', fontSize: '12px', fontWeight: '600', color: '#6b7280', textTransform: 'uppercase' }}>Status</th>
                    <th style={{ padding: '12px 16px', textAlign: 'center', fontSize: '12px', fontWeight: '600', color: '#6b7280', textTransform: 'uppercase' }}>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {volumeRules.map((rule) => (
                    <tr key={rule.id} style={{ borderTop: '1px solid #e5e7eb' }}>
                      <td style={{ padding: '16px' }}>
                        <div style={{ fontWeight: '600', color: '#1a1a2e' }}>{rule.name}</div>
                        {rule.description && (
                          <div style={{ fontSize: '13px', color: '#6b7280', marginTop: '4px' }}>{rule.description}</div>
                        )}
                      </td>
                      <td style={{ padding: '16px' }}>
                        <span style={{
                          padding: '4px 8px',
                          backgroundColor: rule.scope_type === 'all' ? '#dbeafe' : rule.scope_type === 'manufacturer' ? '#fef3c7' : '#e0e7ff',
                          color: rule.scope_type === 'all' ? '#1d4ed8' : rule.scope_type === 'manufacturer' ? '#92400e' : '#4338ca',
                          borderRadius: '4px',
                          fontSize: '12px',
                          fontWeight: '500'
                        }}>
                          {rule.scope_type === 'all' ? 'All Products' :
                           rule.scope_type === 'manufacturer' ? rule.scope_manufacturer :
                           rule.scope_type === 'category' ? rule.scope_category : 'Product'}
                        </span>
                      </td>
                      <td style={{ padding: '16px' }}>
                        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px' }}>
                          {(rule.tiers || []).map((tier, idx) => (
                            <span key={idx} style={{
                              padding: '2px 6px',
                              backgroundColor: '#f3f4f6',
                              borderRadius: '4px',
                              fontSize: '12px',
                              color: '#374151'
                            }}>
                              {tier.min_quantity}+: {tier.discount_value}%
                            </span>
                          ))}
                        </div>
                      </td>
                      <td style={{ padding: '16px', fontSize: '13px', color: '#6b7280' }}>
                        {rule.valid_from || rule.valid_until ? (
                          <div>
                            {rule.valid_from && <div>From: {new Date(rule.valid_from).toLocaleDateString()}</div>}
                            {rule.valid_until && <div>Until: {new Date(rule.valid_until).toLocaleDateString()}</div>}
                          </div>
                        ) : (
                          <span>Always</span>
                        )}
                      </td>
                      <td style={{ padding: '16px', textAlign: 'center' }}>
                        <span style={{
                          padding: '4px 8px',
                          backgroundColor: rule.is_active ? '#dcfce7' : '#fee2e2',
                          color: rule.is_active ? '#166534' : '#dc2626',
                          borderRadius: '4px',
                          fontSize: '12px',
                          fontWeight: '500'
                        }}>
                          {rule.is_active ? 'Active' : 'Inactive'}
                        </span>
                      </td>
                      <td style={{ padding: '16px', textAlign: 'center' }}>
                        <div style={{ display: 'flex', justifyContent: 'center', gap: '8px' }}>
                          <button
                            onClick={() => {
                              setEditingRule(rule);
                              setShowVolumeEditor(true);
                            }}
                            style={{
                              padding: '6px 12px',
                              backgroundColor: '#f3f4f6',
                              border: 'none',
                              borderRadius: '4px',
                              fontSize: '13px',
                              cursor: 'pointer'
                            }}
                          >
                            Edit
                          </button>
                          <button
                            onClick={() => handleDeleteVolumeRule(rule.id)}
                            style={{
                              padding: '6px 12px',
                              backgroundColor: '#fee2e2',
                              color: '#dc2626',
                              border: 'none',
                              borderRadius: '4px',
                              fontSize: '13px',
                              cursor: 'pointer'
                            }}
                          >
                            Delete
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* Promotions Tab */}
      {activeTab === 'promotions' && (
        <PromotionManager
          promotions={promotions}
          onEdit={(promo) => {
            setEditingPromo(promo);
            setShowPromoEditor(true);
          }}
          onDelete={handleDeletePromotion}
          onAdd={() => {
            setEditingPromo(null);
            setShowPromoEditor(true);
          }}
        />
      )}

      {/* Volume Discount Editor Modal */}
      {showVolumeEditor && (
        <VolumeDiscountEditor
          rule={editingRule}
          onSave={handleSaveVolumeRule}
          onClose={() => {
            setShowVolumeEditor(false);
            setEditingRule(null);
          }}
        />
      )}

      {/* Promotion Editor Modal */}
      {showPromoEditor && (
        <PromotionEditor
          promotion={editingPromo}
          onSave={handleSavePromotion}
          onClose={() => {
            setShowPromoEditor(false);
            setEditingPromo(null);
          }}
        />
      )}
    </div>
  );
};

/**
 * PromotionEditor - Modal for creating/editing promotions
 */
const PromotionEditor = ({ promotion, onSave, onClose }) => {
  const [formData, setFormData] = useState({
    promo_code: promotion?.promo_code || '',
    promo_name: promotion?.promo_name || '',
    description: promotion?.description || '',
    promo_type: promotion?.promo_type || 'general',
    scope_type: promotion?.scope_type || 'all',
    scope_value: promotion?.scope_value || '',
    discount_type: promotion?.discount_type || 'percent',
    discount_value: promotion?.discount_value || '',
    start_date: promotion?.start_date ? new Date(promotion.start_date).toISOString().slice(0, 16) : '',
    end_date: promotion?.end_date ? new Date(promotion.end_date).toISOString().slice(0, 16) : '',
    auto_activate: promotion?.auto_activate ?? true,
    max_uses_total: promotion?.max_uses_total || '',
    max_uses_per_customer: promotion?.max_uses_per_customer || '',
    min_purchase_cents: promotion?.min_purchase_cents ? (promotion.min_purchase_cents / 100) : '',
    max_discount_cents: promotion?.max_discount_cents ? (promotion.max_discount_cents / 100) : '',
    min_quantity: promotion?.min_quantity || '',
    can_stack: promotion?.can_stack ?? false,
    is_active: promotion?.is_active ?? true
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);

  const handleChange = (e) => {
    const { name, value, type, checked } = e.target;
    setFormData(prev => ({
      ...prev,
      [name]: type === 'checkbox' ? checked : value
    }));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError(null);
    setSaving(true);

    try {
      const submitData = {
        ...formData,
        id: promotion?.id,
        min_purchase_cents: formData.min_purchase_cents ? Math.round(parseFloat(formData.min_purchase_cents) * 100) : null,
        max_discount_cents: formData.max_discount_cents ? Math.round(parseFloat(formData.max_discount_cents) * 100) : null,
        max_uses_total: formData.max_uses_total || null,
        max_uses_per_customer: formData.max_uses_per_customer || null,
        min_quantity: formData.min_quantity || null
      };

      await onSave(submitData);
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  };

  const modalOverlayStyle = {
    position: 'fixed',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(0,0,0,0.5)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 1000
  };

  const modalStyle = {
    backgroundColor: '#fff',
    borderRadius: '12px',
    width: '100%',
    maxWidth: '600px',
    maxHeight: '90vh',
    overflow: 'auto',
    boxShadow: '0 25px 50px -12px rgba(0,0,0,0.25)'
  };

  const inputStyle = {
    width: '100%',
    padding: '10px 12px',
    border: '1px solid #d1d5db',
    borderRadius: '6px',
    fontSize: '14px',
    boxSizing: 'border-box'
  };

  const labelStyle = {
    display: 'block',
    fontSize: '14px',
    fontWeight: '500',
    color: '#374151',
    marginBottom: '6px'
  };

  return (
    <div style={modalOverlayStyle} onClick={onClose}>
      <div style={modalStyle} onClick={e => e.stopPropagation()}>
        <div style={{ padding: '20px', borderBottom: '1px solid #e5e7eb' }}>
          <h2 style={{ margin: 0, fontSize: '20px', fontWeight: '600' }}>
            {promotion ? 'Edit Promotion' : 'Create Promotion'}
          </h2>
        </div>

        <form onSubmit={handleSubmit} style={{ padding: '20px' }}>
          {error && (
            <div style={{
              padding: '12px',
              backgroundColor: '#fee2e2',
              color: '#dc2626',
              borderRadius: '6px',
              marginBottom: '16px',
              fontSize: '14px'
            }}>
              {error}
            </div>
          )}

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px', marginBottom: '16px' }}>
            <div>
              <label style={labelStyle}>Promo Code (optional)</label>
              <input
                type="text"
                name="promo_code"
                value={formData.promo_code}
                onChange={handleChange}
                placeholder="e.g., SUMMER20"
                style={inputStyle}
              />
            </div>
            <div>
              <label style={labelStyle}>Promotion Name *</label>
              <input
                type="text"
                name="promo_name"
                value={formData.promo_name}
                onChange={handleChange}
                required
                placeholder="e.g., Summer Sale 20% Off"
                style={inputStyle}
              />
            </div>
          </div>

          <div style={{ marginBottom: '16px' }}>
            <label style={labelStyle}>Description</label>
            <textarea
              name="description"
              value={formData.description}
              onChange={handleChange}
              rows={2}
              style={{ ...inputStyle, resize: 'vertical' }}
            />
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px', marginBottom: '16px' }}>
            <div>
              <label style={labelStyle}>Discount Type *</label>
              <select
                name="discount_type"
                value={formData.discount_type}
                onChange={handleChange}
                required
                style={inputStyle}
              >
                <option value="percent">Percentage</option>
                <option value="fixed">Fixed Amount ($)</option>
              </select>
            </div>
            <div>
              <label style={labelStyle}>
                Discount Value * {formData.discount_type === 'percent' ? '(%)' : '($)'}
              </label>
              <input
                type="number"
                name="discount_value"
                value={formData.discount_value}
                onChange={handleChange}
                required
                min="0"
                step={formData.discount_type === 'percent' ? '0.01' : '0.01'}
                style={inputStyle}
              />
            </div>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px', marginBottom: '16px' }}>
            <div>
              <label style={labelStyle}>Start Date *</label>
              <input
                type="datetime-local"
                name="start_date"
                value={formData.start_date}
                onChange={handleChange}
                required
                style={inputStyle}
              />
            </div>
            <div>
              <label style={labelStyle}>End Date *</label>
              <input
                type="datetime-local"
                name="end_date"
                value={formData.end_date}
                onChange={handleChange}
                required
                style={inputStyle}
              />
            </div>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px', marginBottom: '16px' }}>
            <div>
              <label style={labelStyle}>Max Uses (Total)</label>
              <input
                type="number"
                name="max_uses_total"
                value={formData.max_uses_total}
                onChange={handleChange}
                min="1"
                placeholder="Unlimited"
                style={inputStyle}
              />
            </div>
            <div>
              <label style={labelStyle}>Max Uses Per Customer</label>
              <input
                type="number"
                name="max_uses_per_customer"
                value={formData.max_uses_per_customer}
                onChange={handleChange}
                min="1"
                placeholder="Unlimited"
                style={inputStyle}
              />
            </div>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px', marginBottom: '16px' }}>
            <div>
              <label style={labelStyle}>Min Purchase ($)</label>
              <input
                type="number"
                name="min_purchase_cents"
                value={formData.min_purchase_cents}
                onChange={handleChange}
                min="0"
                step="0.01"
                placeholder="No minimum"
                style={inputStyle}
              />
            </div>
            <div>
              <label style={labelStyle}>Max Discount ($)</label>
              <input
                type="number"
                name="max_discount_cents"
                value={formData.max_discount_cents}
                onChange={handleChange}
                min="0"
                step="0.01"
                placeholder="No cap"
                style={inputStyle}
              />
            </div>
          </div>

          <div style={{ display: 'flex', gap: '24px', marginBottom: '16px' }}>
            <label style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer' }}>
              <input
                type="checkbox"
                name="auto_activate"
                checked={formData.auto_activate}
                onChange={handleChange}
              />
              <span style={{ fontSize: '14px' }}>Auto-activate (apply without code)</span>
            </label>
            <label style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer' }}>
              <input
                type="checkbox"
                name="can_stack"
                checked={formData.can_stack}
                onChange={handleChange}
              />
              <span style={{ fontSize: '14px' }}>Can stack with other discounts</span>
            </label>
            <label style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer' }}>
              <input
                type="checkbox"
                name="is_active"
                checked={formData.is_active}
                onChange={handleChange}
              />
              <span style={{ fontSize: '14px' }}>Active</span>
            </label>
          </div>

          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '12px', marginTop: '24px', paddingTop: '16px', borderTop: '1px solid #e5e7eb' }}>
            <button
              type="button"
              onClick={onClose}
              style={{
                padding: '10px 20px',
                backgroundColor: '#f3f4f6',
                border: 'none',
                borderRadius: '6px',
                fontSize: '14px',
                fontWeight: '500',
                cursor: 'pointer'
              }}
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={saving}
              style={{
                padding: '10px 20px',
                backgroundColor: '#6366f1',
                color: '#fff',
                border: 'none',
                borderRadius: '6px',
                fontSize: '14px',
                fontWeight: '500',
                cursor: saving ? 'not-allowed' : 'pointer',
                opacity: saving ? 0.7 : 1
              }}
            >
              {saving ? 'Saving...' : (promotion ? 'Update Promotion' : 'Create Promotion')}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

export default AdvancedPricingManager;
