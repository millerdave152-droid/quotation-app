import React, { useState } from 'react';

/**
 * VolumeDiscountEditor - Modal for creating/editing volume discount rules
 */
const VolumeDiscountEditor = ({ rule, onSave, onClose }) => {
  const [formData, setFormData] = useState({
    name: rule?.name || '',
    description: rule?.description || '',
    scope_type: rule?.scope_type || 'all',
    scope_product_id: rule?.scope_product_id || '',
    scope_category: rule?.scope_category || '',
    scope_manufacturer: rule?.scope_manufacturer || '',
    discount_type: rule?.discount_type || 'percent',
    is_active: rule?.is_active ?? true,
    valid_from: rule?.valid_from ? new Date(rule.valid_from).toISOString().slice(0, 16) : '',
    valid_until: rule?.valid_until ? new Date(rule.valid_until).toISOString().slice(0, 16) : '',
    priority: rule?.priority || 0,
    can_stack: rule?.can_stack ?? true,
    stacking_group: rule?.stacking_group || ''
  });

  const [tiers, setTiers] = useState(
    rule?.tiers?.length > 0
      ? rule.tiers.map(t => ({
          min_quantity: t.min_quantity,
          max_quantity: t.max_quantity || '',
          discount_value: t.discount_value,
          display_label: t.display_label || ''
        }))
      : [{ min_quantity: 2, max_quantity: '', discount_value: 5, display_label: '' }]
  );

  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);

  const handleChange = (e) => {
    const { name, value, type, checked } = e.target;
    setFormData(prev => ({
      ...prev,
      [name]: type === 'checkbox' ? checked : value
    }));
  };

  const handleTierChange = (index, field, value) => {
    const newTiers = [...tiers];
    newTiers[index] = { ...newTiers[index], [field]: value };
    setTiers(newTiers);
  };

  const addTier = () => {
    const lastTier = tiers[tiers.length - 1];
    const nextMin = lastTier?.max_quantity ? parseInt(lastTier.max_quantity) + 1 : (parseInt(lastTier?.min_quantity) || 1) + 5;
    setTiers([...tiers, { min_quantity: nextMin, max_quantity: '', discount_value: '', display_label: '' }]);
  };

  const removeTier = (index) => {
    if (tiers.length <= 1) return;
    setTiers(tiers.filter((_, i) => i !== index));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError(null);
    setSaving(true);

    try {
      // Validate tiers
      const validTiers = tiers.filter(t => t.min_quantity && t.discount_value);
      if (validTiers.length === 0) {
        throw new Error('At least one valid tier is required');
      }

      // Sort tiers by min_quantity
      validTiers.sort((a, b) => parseInt(a.min_quantity) - parseInt(b.min_quantity));

      const submitData = {
        ...formData,
        id: rule?.id,
        scope_product_id: formData.scope_type === 'product' ? parseInt(formData.scope_product_id) : null,
        scope_category: formData.scope_type === 'category' ? formData.scope_category : null,
        scope_manufacturer: formData.scope_type === 'manufacturer' ? formData.scope_manufacturer : null,
        valid_from: formData.valid_from || null,
        valid_until: formData.valid_until || null,
        stacking_group: formData.stacking_group || null,
        tiers: validTiers.map(t => ({
          min_quantity: parseInt(t.min_quantity),
          max_quantity: t.max_quantity ? parseInt(t.max_quantity) : null,
          discount_value: parseFloat(t.discount_value),
          display_label: t.display_label || null
        }))
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
    maxWidth: '700px',
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

  const tierRowStyle = {
    display: 'grid',
    gridTemplateColumns: '1fr 1fr 1fr 2fr auto',
    gap: '12px',
    alignItems: 'end',
    marginBottom: '12px'
  };

  return (
    <div style={modalOverlayStyle} onClick={onClose}>
      <div style={modalStyle} onClick={e => e.stopPropagation()}>
        <div style={{ padding: '20px', borderBottom: '1px solid #e5e7eb' }}>
          <h2 style={{ margin: 0, fontSize: '20px', fontWeight: '600' }}>
            {rule ? 'Edit Volume Discount Rule' : 'Create Volume Discount Rule'}
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

          {/* Basic Info */}
          <div style={{ marginBottom: '24px' }}>
            <h3 style={{ fontSize: '16px', fontWeight: '600', color: '#1a1a2e', marginBottom: '16px' }}>Basic Information</h3>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px', marginBottom: '16px' }}>
              <div>
                <label style={labelStyle}>Rule Name *</label>
                <input
                  type="text"
                  name="name"
                  value={formData.name}
                  onChange={handleChange}
                  required
                  placeholder="e.g., Bulk Appliance Discount"
                  style={inputStyle}
                />
              </div>
              <div>
                <label style={labelStyle}>Priority</label>
                <input
                  type="number"
                  name="priority"
                  value={formData.priority}
                  onChange={handleChange}
                  min="0"
                  placeholder="Higher = more priority"
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
                placeholder="Brief description of this discount rule"
                style={{ ...inputStyle, resize: 'vertical' }}
              />
            </div>
          </div>

          {/* Scope */}
          <div style={{ marginBottom: '24px' }}>
            <h3 style={{ fontSize: '16px', fontWeight: '600', color: '#1a1a2e', marginBottom: '16px' }}>Scope</h3>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 2fr', gap: '16px' }}>
              <div>
                <label style={labelStyle}>Applies To *</label>
                <select
                  name="scope_type"
                  value={formData.scope_type}
                  onChange={handleChange}
                  required
                  style={inputStyle}
                >
                  <option value="all">All Products</option>
                  <option value="manufacturer">Specific Manufacturer</option>
                  <option value="category">Specific Category</option>
                  <option value="product">Specific Product</option>
                </select>
              </div>

              {formData.scope_type === 'manufacturer' && (
                <div>
                  <label style={labelStyle}>Manufacturer *</label>
                  <input
                    type="text"
                    name="scope_manufacturer"
                    value={formData.scope_manufacturer}
                    onChange={handleChange}
                    required
                    placeholder="e.g., Samsung, LG, Whirlpool"
                    style={inputStyle}
                  />
                </div>
              )}

              {formData.scope_type === 'category' && (
                <div>
                  <label style={labelStyle}>Category *</label>
                  <input
                    type="text"
                    name="scope_category"
                    value={formData.scope_category}
                    onChange={handleChange}
                    required
                    placeholder="e.g., Refrigerators, Washers"
                    style={inputStyle}
                  />
                </div>
              )}

              {formData.scope_type === 'product' && (
                <div>
                  <label style={labelStyle}>Product ID *</label>
                  <input
                    type="number"
                    name="scope_product_id"
                    value={formData.scope_product_id}
                    onChange={handleChange}
                    required
                    placeholder="Enter product ID"
                    style={inputStyle}
                  />
                </div>
              )}
            </div>
          </div>

          {/* Discount Tiers */}
          <div style={{ marginBottom: '24px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
              <h3 style={{ fontSize: '16px', fontWeight: '600', color: '#1a1a2e', margin: 0 }}>Discount Tiers</h3>
              <button
                type="button"
                onClick={addTier}
                style={{
                  padding: '6px 12px',
                  backgroundColor: '#dbeafe',
                  color: '#1d4ed8',
                  border: 'none',
                  borderRadius: '4px',
                  fontSize: '13px',
                  fontWeight: '500',
                  cursor: 'pointer'
                }}
              >
                + Add Tier
              </button>
            </div>

            <div style={{ backgroundColor: '#f9fafb', padding: '16px', borderRadius: '8px' }}>
              {/* Header */}
              <div style={{ ...tierRowStyle, marginBottom: '8px', fontWeight: '500', fontSize: '13px', color: '#6b7280' }}>
                <div>Min Qty *</div>
                <div>Max Qty</div>
                <div>Discount % *</div>
                <div>Label (optional)</div>
                <div></div>
              </div>

              {/* Tier Rows */}
              {tiers.map((tier, index) => (
                <div key={index} style={tierRowStyle}>
                  <input
                    type="number"
                    value={tier.min_quantity}
                    onChange={e => handleTierChange(index, 'min_quantity', e.target.value)}
                    min="1"
                    required
                    placeholder="2"
                    style={{ ...inputStyle, padding: '8px 10px' }}
                  />
                  <input
                    type="number"
                    value={tier.max_quantity}
                    onChange={e => handleTierChange(index, 'max_quantity', e.target.value)}
                    min={tier.min_quantity || 1}
                    placeholder="No limit"
                    style={{ ...inputStyle, padding: '8px 10px' }}
                  />
                  <input
                    type="number"
                    value={tier.discount_value}
                    onChange={e => handleTierChange(index, 'discount_value', e.target.value)}
                    min="0"
                    max="100"
                    step="0.01"
                    required
                    placeholder="5"
                    style={{ ...inputStyle, padding: '8px 10px' }}
                  />
                  <input
                    type="text"
                    value={tier.display_label}
                    onChange={e => handleTierChange(index, 'display_label', e.target.value)}
                    placeholder="e.g., Buy 5+, get 10% off"
                    style={{ ...inputStyle, padding: '8px 10px' }}
                  />
                  <button
                    type="button"
                    onClick={() => removeTier(index)}
                    disabled={tiers.length <= 1}
                    style={{
                      padding: '8px 12px',
                      backgroundColor: tiers.length <= 1 ? '#f3f4f6' : '#fee2e2',
                      color: tiers.length <= 1 ? '#9ca3af' : '#dc2626',
                      border: 'none',
                      borderRadius: '4px',
                      cursor: tiers.length <= 1 ? 'not-allowed' : 'pointer',
                      fontSize: '16px'
                    }}
                  >
                    X
                  </button>
                </div>
              ))}
            </div>
          </div>

          {/* Validity Period */}
          <div style={{ marginBottom: '24px' }}>
            <h3 style={{ fontSize: '16px', fontWeight: '600', color: '#1a1a2e', marginBottom: '16px' }}>Validity Period (optional)</h3>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
              <div>
                <label style={labelStyle}>Valid From</label>
                <input
                  type="datetime-local"
                  name="valid_from"
                  value={formData.valid_from}
                  onChange={handleChange}
                  style={inputStyle}
                />
              </div>
              <div>
                <label style={labelStyle}>Valid Until</label>
                <input
                  type="datetime-local"
                  name="valid_until"
                  value={formData.valid_until}
                  onChange={handleChange}
                  style={inputStyle}
                />
              </div>
            </div>
          </div>

          {/* Stacking Options */}
          <div style={{ marginBottom: '24px' }}>
            <h3 style={{ fontSize: '16px', fontWeight: '600', color: '#1a1a2e', marginBottom: '16px' }}>Stacking Options</h3>

            <div style={{ display: 'flex', gap: '24px', marginBottom: '16px' }}>
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

            {formData.can_stack && (
              <div>
                <label style={labelStyle}>Stacking Group (optional)</label>
                <input
                  type="text"
                  name="stacking_group"
                  value={formData.stacking_group}
                  onChange={handleChange}
                  placeholder="e.g., volume_discounts (only best in group applies)"
                  style={{ ...inputStyle, maxWidth: '300px' }}
                />
              </div>
            )}
          </div>

          {/* Actions */}
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
              {saving ? 'Saving...' : (rule ? 'Update Rule' : 'Create Rule')}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

export default VolumeDiscountEditor;
