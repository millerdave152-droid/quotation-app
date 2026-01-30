/**
 * RequirementSection - Structured product requirements input
 */

import React, { useState } from 'react';

const categoryOptions = [
  'Refrigerator',
  'Range',
  'Dishwasher',
  'Microwave',
  'Washer',
  'Dryer',
  'Laundry Pair',
  'Kitchen Package',
  'Freezer',
  'Cooktop',
  'Wall Oven',
  'Range Hood',
  'Wine Cooler',
  'Other'
];

const brandOptions = [
  'Whirlpool',
  'Samsung',
  'LG',
  'GE',
  'Bosch',
  'KitchenAid',
  'Maytag',
  'Frigidaire',
  'Electrolux',
  'Miele',
  'Fisher & Paykel',
  'No Preference'
];

const colorOptions = [
  'Stainless Steel',
  'Black Stainless',
  'White',
  'Black',
  'Slate',
  'Fingerprint Resistant',
  'No Preference'
];

function RequirementSection({ requirements, onChange }) {
  const [editingIndex, setEditingIndex] = useState(null);

  const addRequirement = () => {
    const newRequirement = {
      category: '',
      subcategory: '',
      brand_preferences: [],
      budget_min_cents: null,
      budget_max_cents: null,
      must_have_features: [],
      color_preferences: [],
      size_constraints: '',
      quantity: 1,
      notes: ''
    };
    onChange([...requirements, newRequirement]);
    setEditingIndex(requirements.length);
  };

  const updateRequirement = (index, field, value) => {
    const updated = [...requirements];
    updated[index] = { ...updated[index], [field]: value };
    onChange(updated);
  };

  const removeRequirement = (index) => {
    const updated = requirements.filter((_, i) => i !== index);
    onChange(updated);
    setEditingIndex(null);
  };

  const handleBrandToggle = (index, brand) => {
    const current = requirements[index].brand_preferences || [];
    const updated = current.includes(brand)
      ? current.filter(b => b !== brand)
      : [...current, brand];
    updateRequirement(index, 'brand_preferences', updated);
  };

  const handleColorToggle = (index, color) => {
    const current = requirements[index].color_preferences || [];
    const updated = current.includes(color)
      ? current.filter(c => c !== color)
      : [...current, color];
    updateRequirement(index, 'color_preferences', updated);
  };

  const handleBudgetChange = (index, type, value) => {
    const cents = value ? Math.round(parseFloat(value) * 100) : null;
    updateRequirement(index, type, cents);
  };

  return (
    <div className="requirements-list">
      {requirements.map((req, index) => (
        <div key={index} className="requirement-section">
          <div className="requirement-header">
            <span className="requirement-category">
              {req.category || 'New Requirement'}
              {req.quantity > 1 && ` (x${req.quantity})`}
            </span>
            <div style={{ display: 'flex', gap: '0.5rem' }}>
              <button
                type="button"
                className="btn btn-sm btn-secondary"
                onClick={() => setEditingIndex(editingIndex === index ? null : index)}
              >
                {editingIndex === index ? 'Collapse' : 'Edit'}
              </button>
              <button
                type="button"
                className="requirement-remove"
                onClick={() => removeRequirement(index)}
                title="Remove"
              >
                ✕
              </button>
            </div>
          </div>

          {(editingIndex === index || !req.category) && (
            <div className="requirement-fields">
              {/* Category */}
              <div className="form-group">
                <label>Category *</label>
                <select
                  value={req.category}
                  onChange={(e) => updateRequirement(index, 'category', e.target.value)}
                >
                  <option value="">Select category...</option>
                  {categoryOptions.map(cat => (
                    <option key={cat} value={cat}>{cat}</option>
                  ))}
                </select>
              </div>

              {/* Quantity */}
              <div className="form-group">
                <label>Quantity</label>
                <input
                  type="number"
                  min="1"
                  value={req.quantity}
                  onChange={(e) => updateRequirement(index, 'quantity', parseInt(e.target.value) || 1)}
                />
              </div>

              {/* Budget Range */}
              <div className="form-group">
                <label>Min Budget ($)</label>
                <input
                  type="number"
                  min="0"
                  step="100"
                  placeholder="0"
                  value={req.budget_min_cents ? (req.budget_min_cents / 100) : ''}
                  onChange={(e) => handleBudgetChange(index, 'budget_min_cents', e.target.value)}
                />
              </div>

              <div className="form-group">
                <label>Max Budget ($)</label>
                <input
                  type="number"
                  min="0"
                  step="100"
                  placeholder="No limit"
                  value={req.budget_max_cents ? (req.budget_max_cents / 100) : ''}
                  onChange={(e) => handleBudgetChange(index, 'budget_max_cents', e.target.value)}
                />
              </div>

              {/* Brand Preferences */}
              <div className="form-group" style={{ gridColumn: '1 / -1' }}>
                <label>Brand Preferences</label>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem', marginTop: '0.25rem' }}>
                  {brandOptions.map(brand => (
                    <button
                      key={brand}
                      type="button"
                      onClick={() => handleBrandToggle(index, brand)}
                      style={{
                        padding: '0.375rem 0.625rem',
                        borderRadius: '6px',
                        border: '1px solid var(--border-color)',
                        background: (req.brand_preferences || []).includes(brand) ? '#dbeafe' : 'white',
                        color: (req.brand_preferences || []).includes(brand) ? '#1d4ed8' : 'inherit',
                        cursor: 'pointer',
                        fontSize: '0.8rem'
                      }}
                    >
                      {brand}
                    </button>
                  ))}
                </div>
              </div>

              {/* Color Preferences */}
              <div className="form-group" style={{ gridColumn: '1 / -1' }}>
                <label>Color Preferences</label>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem', marginTop: '0.25rem' }}>
                  {colorOptions.map(color => (
                    <button
                      key={color}
                      type="button"
                      onClick={() => handleColorToggle(index, color)}
                      style={{
                        padding: '0.375rem 0.625rem',
                        borderRadius: '6px',
                        border: '1px solid var(--border-color)',
                        background: (req.color_preferences || []).includes(color) ? '#dbeafe' : 'white',
                        color: (req.color_preferences || []).includes(color) ? '#1d4ed8' : 'inherit',
                        cursor: 'pointer',
                        fontSize: '0.8rem'
                      }}
                    >
                      {color}
                    </button>
                  ))}
                </div>
              </div>

              {/* Size Constraints */}
              <div className="form-group" style={{ gridColumn: '1 / -1' }}>
                <label>Size Constraints</label>
                <input
                  type="text"
                  placeholder="e.g., Max 36in wide, counter depth"
                  value={req.size_constraints || ''}
                  onChange={(e) => updateRequirement(index, 'size_constraints', e.target.value)}
                />
              </div>

              {/* Notes */}
              <div className="form-group" style={{ gridColumn: '1 / -1' }}>
                <label>Notes</label>
                <textarea
                  placeholder="Any specific requirements for this category..."
                  value={req.notes || ''}
                  onChange={(e) => updateRequirement(index, 'notes', e.target.value)}
                  rows={2}
                />
              </div>
            </div>
          )}

          {/* Summary when collapsed */}
          {editingIndex !== index && req.category && (
            <div style={{ fontSize: '0.875rem', color: 'var(--text-secondary)' }}>
              {req.brand_preferences?.length > 0 && (
                <span>Brands: {req.brand_preferences.join(', ')} | </span>
              )}
              {(req.budget_min_cents || req.budget_max_cents) && (
                <span>
                  Budget: {req.budget_min_cents ? `$${(req.budget_min_cents/100).toFixed(0)}` : '$0'}
                  {' - '}
                  {req.budget_max_cents ? `$${(req.budget_max_cents/100).toFixed(0)}` : 'No limit'}
                </span>
              )}
            </div>
          )}
        </div>
      ))}

      <button
        type="button"
        className="add-requirement-btn"
        onClick={addRequirement}
      >
        + Add Product Requirement
      </button>
    </div>
  );
}

export default RequirementSection;
