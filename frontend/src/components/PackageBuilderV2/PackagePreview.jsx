/**
 * PackagePreview - Shows Good/Better/Best package preview
 * Displays package tiers with products and pricing
 */
import React from 'react';
import './PackagePreview.css';

const PackagePreview = ({
  packages = null,
  loading = false,
  error = null,
  preview = null,
  onSelectPackage,
  selectedTier = null
}) => {
  const formatPrice = (cents) => {
    if (!cents && cents !== 0) return '--';
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
      minimumFractionDigits: 0,
      maximumFractionDigits: 0
    }).format(cents / 100);
  };

  // Show loading state
  if (loading) {
    return (
      <div className="package-preview">
        <div className="package-preview-loading">
          <div className="package-loading-spinner" />
          <p>Generating packages...</p>
        </div>
      </div>
    );
  }

  // Show error state
  if (error) {
    return (
      <div className="package-preview">
        <div className="package-preview-error">
          <span className="error-icon">&#9888;</span>
          <p>{error}</p>
        </div>
      </div>
    );
  }

  // Show preview state (before generation)
  if (!packages && preview) {
    const canGenerate = preview.can_generate;

    return (
      <div className="package-preview">
        <div className="package-preview-status">
          <h3>Package Preview</h3>
          <div className="preview-categories">
            {Object.entries(preview.preview || {}).map(([category, data]) => (
              <div
                key={category}
                className={`preview-category ${data.available ? 'available' : 'unavailable'}`}
              >
                <span className="preview-category-icon">
                  {data.available ? '✓' : '✗'}
                </span>
                <span className="preview-category-name">
                  {category.charAt(0).toUpperCase() + category.slice(1)}
                </span>
                <span className="preview-category-count">
                  {data.count} products
                </span>
              </div>
            ))}
          </div>
          {!canGenerate && (
            <p className="preview-warning">
              Some categories have no matching products. Try adjusting your filters.
            </p>
          )}
        </div>
      </div>
    );
  }

  // Show empty state
  if (!packages) {
    return (
      <div className="package-preview">
        <div className="package-preview-empty">
          <span className="empty-icon">📦</span>
          <h3>Select Filters to Generate Packages</h3>
          <p>Use the filters on the left to narrow down your preferences, then click "Generate Packages".</p>
        </div>
      </div>
    );
  }

  const tiers = ['good', 'better', 'best'];
  const tierLabels = {
    good: { label: 'Good', color: '#48bb78', description: 'Budget-Friendly' },
    better: { label: 'Better', color: '#4299e1', description: 'Best Value' },
    best: { label: 'Best', color: '#9f7aea', description: 'Premium Choice' }
  };

  // Helper to extract product data (handles nested product structure)
  const getProductData = (item) => {
    if (item.product) {
      // Nested structure: { slot, product: { model, manufacturer, msrp_cents } }
      return {
        slot: item.slot || item.slot_label,
        model: item.product.model,
        manufacturer: item.product.manufacturer,
        name: item.product.name,
        msrp_cents: parseInt(item.product.msrp_cents) || 0,
        category: item.product.category
      };
    }
    // Flat structure: { model, manufacturer, msrp_cents }
    return {
      slot: item.slot || item.category,
      model: item.model,
      manufacturer: item.manufacturer,
      name: item.name,
      msrp_cents: parseInt(item.msrp_cents) || 0,
      category: item.category
    };
  };

  return (
    <div className="package-preview">
      <div className="package-tiers">
        {tiers.map(tier => {
          const pkg = packages[tier];
          if (!pkg) return null;

          const tierInfo = tierLabels[tier];
          const isSelected = selectedTier === tier;

          // Extract product data and calculate total
          const items = pkg.items?.map(getProductData) || [];
          const totalPrice = items.reduce((sum, item) => sum + (item.msrp_cents || 0), 0);

          return (
            <div
              key={tier}
              className={`package-tier-card ${isSelected ? 'selected' : ''}`}
              onClick={() => onSelectPackage && onSelectPackage(tier, pkg)}
              style={{ '--tier-color': tierInfo.color }}
            >
              <div className="tier-header">
                <div
                  className="tier-badge"
                  style={{ background: tierInfo.color }}
                >
                  {tierInfo.label}
                </div>
                <div className="tier-description">{tierInfo.description}</div>
              </div>

              <div className="tier-price">
                {formatPrice(totalPrice)}
              </div>

              <div className="tier-items">
                {items.map((item, idx) => (
                  <div key={idx} className="tier-item">
                    <div className="tier-item-category">
                      {item.slot || item.category || 'Appliance'}
                    </div>
                    <div className="tier-item-name">
                      {item.manufacturer} {item.model}
                    </div>
                    <div className="tier-item-price">
                      {formatPrice(item.msrp_cents)}
                    </div>
                  </div>
                ))}
              </div>

              <div className="tier-summary">
                <span>{items.length} items</span>
                {pkg.savings_percent > 0 && (
                  <span className="tier-savings">
                    Save {pkg.savings_percent}%
                  </span>
                )}
              </div>

              <button
                className="tier-select-btn"
                onClick={(e) => {
                  e.stopPropagation();
                  onSelectPackage && onSelectPackage(tier, pkg);
                }}
              >
                {isSelected ? 'Selected' : 'Select Package'}
              </button>
            </div>
          );
        })}
      </div>
    </div>
  );
};

export default PackagePreview;
