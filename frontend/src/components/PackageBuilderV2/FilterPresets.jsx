/**
 * FilterPresets - Quick filter preset buttons for common configurations
 * One-click apply for popular filter combinations
 */
import React, { useState } from 'react';
import './FilterPresets.css';

const FilterPresets = ({
  packageType = 'kitchen',
  onApplyPreset,
  currentFilters = {}
}) => {
  const [showCustom, setShowCustom] = useState(false);
  const [customName, setCustomName] = useState('');
  const [savedPresets, setSavedPresets] = useState(() => {
    try {
      const saved = localStorage.getItem('package_filter_presets');
      return saved ? JSON.parse(saved) : [];
    } catch {
      return [];
    }
  });

  // Built-in presets for kitchen
  const kitchenPresets = [
    {
      id: 'budget_kitchen',
      name: 'Budget Kitchen',
      icon: '💰',
      description: 'Value brands, basic features',
      filters: {
        brand: ['Frigidaire', 'Whirlpool', 'GE'],
        price_range: [0, 4000]
      }
    },
    {
      id: 'premium_kitchen',
      name: 'Premium Kitchen',
      icon: '✨',
      description: 'High-end brands & finishes',
      filters: {
        brand: ['Samsung', 'LG', 'Bosch', 'KitchenAid'],
        finish: 'stainless'
      }
    },
    {
      id: 'smart_home',
      name: 'Smart Home Ready',
      icon: '📱',
      description: 'WiFi & voice enabled',
      filters: {
        refrigerator: { smart: true },
        range: { smart: true },
        dishwasher: { smart: true }
      }
    },
    {
      id: 'builder_grade',
      name: 'Builder Grade',
      icon: '🏗️',
      description: 'Entry-level appliances',
      filters: {
        brand: ['Frigidaire', 'GE'],
        price_range: [0, 3000]
      }
    }
  ];

  // Built-in presets for laundry
  const laundryPresets = [
    {
      id: 'budget_laundry',
      name: 'Budget Laundry',
      icon: '💰',
      description: 'Reliable basic models',
      filters: {
        brand: ['Amana', 'Whirlpool'],
        price_range: [0, 1500]
      }
    },
    {
      id: 'premium_laundry',
      name: 'Premium Laundry',
      icon: '✨',
      description: 'LG/Samsung with smart features',
      filters: {
        brand: ['LG', 'Samsung'],
        washer: { smart: true },
        dryer: { smart: true }
      }
    },
    {
      id: 'high_capacity',
      name: 'High Capacity',
      icon: '📦',
      description: 'Large load capability',
      filters: {
        washer: { capacity: 'large' },
        dryer: { capacity: 'large' }
      }
    },
    {
      id: 'energy_efficient',
      name: 'Energy Efficient',
      icon: '🌱',
      description: 'ENERGY STAR certified',
      filters: {
        washer: { energy_star: true },
        dryer: { energy_star: true }
      }
    }
  ];

  const presets = packageType === 'kitchen' ? kitchenPresets : laundryPresets;

  // Check if a preset matches current filters
  const isPresetActive = (preset) => {
    const pf = preset.filters;
    const cf = currentFilters;

    // Simple check - compare brands and finish
    if (pf.brand && cf.brand) {
      const brandsMatch = pf.brand.every(b => cf.brand?.includes(b));
      if (brandsMatch) return true;
    }
    if (pf.finish && cf.finish === pf.finish) return true;

    return false;
  };

  const handleApplyPreset = (preset) => {
    if (onApplyPreset) {
      onApplyPreset(preset.filters);
    }
  };

  const handleSaveCustom = () => {
    if (!customName.trim()) return;

    const newPreset = {
      id: `custom_${Date.now()}`,
      name: customName,
      icon: '⭐',
      description: 'Custom preset',
      filters: { ...currentFilters },
      isCustom: true
    };

    const updated = [...savedPresets, newPreset];
    setSavedPresets(updated);
    localStorage.setItem('package_filter_presets', JSON.stringify(updated));
    setCustomName('');
    setShowCustom(false);
  };

  const handleDeleteCustom = (presetId) => {
    const updated = savedPresets.filter(p => p.id !== presetId);
    setSavedPresets(updated);
    localStorage.setItem('package_filter_presets', JSON.stringify(updated));
  };

  const hasActiveFilters = Object.keys(currentFilters).length > 0;

  return (
    <div className="filter-presets">
      <div className="filter-presets-header">
        <span className="filter-presets-title">Quick Presets</span>
      </div>

      <div className="filter-presets-grid">
        {presets.map(preset => (
          <button
            key={preset.id}
            className={`filter-preset-card ${isPresetActive(preset) ? 'active' : ''}`}
            onClick={() => handleApplyPreset(preset)}
            title={preset.description}
          >
            <span className="preset-icon">{preset.icon}</span>
            <span className="preset-name">{preset.name}</span>
          </button>
        ))}
      </div>

      {/* Custom presets */}
      {savedPresets.length > 0 && (
        <div className="custom-presets-section">
          <div className="custom-presets-title">Saved Presets</div>
          <div className="custom-presets-list">
            {savedPresets.map(preset => (
              <div key={preset.id} className="custom-preset-item">
                <button
                  className="custom-preset-btn"
                  onClick={() => handleApplyPreset(preset)}
                >
                  {preset.icon} {preset.name}
                </button>
                <button
                  className="custom-preset-delete"
                  onClick={() => handleDeleteCustom(preset.id)}
                  title="Delete preset"
                >
                  ×
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Save current as preset */}
      {hasActiveFilters && (
        <div className="save-preset-section">
          {showCustom ? (
            <div className="save-preset-form">
              <input
                type="text"
                placeholder="Preset name..."
                value={customName}
                onChange={(e) => setCustomName(e.target.value)}
                className="save-preset-input"
                onKeyDown={(e) => e.key === 'Enter' && handleSaveCustom()}
                autoFocus
              />
              <div className="save-preset-actions">
                <button
                  className="save-preset-confirm"
                  onClick={handleSaveCustom}
                  disabled={!customName.trim()}
                >
                  Save
                </button>
                <button
                  className="save-preset-cancel"
                  onClick={() => setShowCustom(false)}
                >
                  Cancel
                </button>
              </div>
            </div>
          ) : (
            <button
              className="save-preset-trigger"
              onClick={() => setShowCustom(true)}
            >
              💾 Save Current Filters as Preset
            </button>
          )}
        </div>
      )}
    </div>
  );
};

export default FilterPresets;
