/**
 * PackagePreview - Shows Good/Better/Best package preview
 * Displays package tiers with products and pricing
 * Enhanced with sort options and better empty states
 */
import React, { useState, useMemo } from 'react';
import './PackagePreview.css';

const PackagePreview = ({
  packages = null,
  loading = false,
  error = null,
  preview = null,
  onSelectPackage,
  selectedTier = null,
  activeFilters = {}
}) => {
  const [sortBy, setSortBy] = useState('price_asc');
  const formatPrice = (cents) => {
    if (!cents && cents !== 0) return '--';
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
      minimumFractionDigits: 0,
      maximumFractionDigits: 0
    }).format(cents / 100);
  };

  // Sort options for the packages
  const sortOptions = [
    { value: 'price_asc', label: 'Price: Low â†’ High' },
    { value: 'price_desc', label: 'Price: High â†’ Low' },
    { value: 'cohesion', label: 'Brand Cohesion' },
    { value: 'savings', label: 'Best Savings' }
  ];

  const tiers = ['good', 'better', 'best'];
  const tierLabels = {
    good: { label: 'Good', color: '#48bb78', description: 'Budget-Friendly', icon: 'ðŸ‘' },
    better: { label: 'Better', color: '#4299e1', description: 'Best Value', icon: 'â­' },
    best: { label: 'Best', color: '#9f7aea', description: 'Premium Choice', icon: 'ðŸ’Ž' }
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
        category: item.product.category,
        image_url: item.product.image_url
      };
    }
    // Flat structure: { model, manufacturer, msrp_cents }
    return {
      slot: item.slot || item.category,
      model: item.model,
      manufacturer: item.manufacturer,
      name: item.name,
      msrp_cents: parseInt(item.msrp_cents) || 0,
      category: item.category,
      image_url: item.image_url
    };
  };

  // Calculate package total for sorting
  const getPackageTotal = (pkg) => {
    if (!pkg?.items) return 0;
    return pkg.items.reduce((sum, item) => {
      const data = getProductData(item);
      return sum + (data.msrp_cents || 0);
    }, 0);
  };

  const packagesData = packages || {};

  // Sort tiers based on selected option
  const sortedTiers = useMemo(() => {
    const tiersWithData = tiers.map(tier => ({
      tier,
      pkg: packagesData[tier],
      total: packagesData[tier] ? getPackageTotal(packagesData[tier]) : 0,
      cohesion: packagesData[tier]?.brand_cohesion_score || 0,
      savings: packagesData[tier]?.savings_percent || 0
    }));

    switch (sortBy) {
      case 'price_asc':
        return tiersWithData.sort((a, b) => a.total - b.total).map(t => t.tier);
      case 'price_desc':
        return tiersWithData.sort((a, b) => b.total - a.total).map(t => t.tier);
      case 'cohesion':
        return tiersWithData.sort((a, b) => b.cohesion - a.cohesion).map(t => t.tier);
      case 'savings':
        return tiersWithData.sort((a, b) => b.savings - a.savings).map(t => t.tier);
      default:
        return tiers;
    }
  }, [getPackageTotal, packagesData, sortBy, tiers]);

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

  // Show empty state with helpful suggestions
  if (!packages) {
    // Build helpful message based on active filters
    const activeFiltersList = [];
    if (activeFilters.brand?.length) {
      activeFiltersList.push(`Brand: ${activeFilters.brand.join(', ')}`);
    }
    if (activeFilters.finish) {
      activeFiltersList.push(`Finish: ${activeFilters.finish}`);
    }
    if (activeFilters.price_range) {
      activeFiltersList.push(`Price: $${activeFilters.price_range[0]} - $${activeFilters.price_range[1]}`);
    }

    return (
      <div className="package-preview">
        <div className="package-preview-empty">
          <div className="empty-illustration">
            <span className="empty-icon-main">📦</span>
            <span className="empty-icon-secondary">✨</span>
          </div>
          <h3>Ready to Build Your Package</h3>
          <p>Use the filters on the left to customize your preferences, then click "Generate Packages" to see your Good / Better / Best options.</p>

          {activeFiltersList.length > 0 && (
            <div className="empty-filters-summary">
              <span className="summary-label">Current filters:</span>
              <div className="summary-tags">
                {activeFiltersList.map((filter, idx) => (
                  <span key={idx} className="summary-tag">{filter}</span>
                ))}
              </div>
            </div>
          )}

          <div className="empty-tips">
            <div className="empty-tip">
              <span className="tip-icon">💡</span>
              <span>Select brands you prefer for consistent styling</span>
            </div>
            <div className="empty-tip">
              <span className="tip-icon">🎨</span>
              <span>Choose a finish to match your kitchen or laundry room</span>
            </div>
            <div className="empty-tip">
              <span className="tip-icon">💰</span>
              <span>Set a budget range to see packages in your price point</span>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="package-preview">
      {/* Sort controls */}
      <div className="package-sort-bar">
        <span className="sort-label">Sort by:</span>
        <select
          className="sort-select"
          value={sortBy}
          onChange={(e) => setSortBy(e.target.value)}
        >
          {sortOptions.map(opt => (
            <option key={opt.value} value={opt.value}>{opt.label}</option>
          ))}
        </select>
        <span className="packages-count">
          {Object.keys(packagesData).filter(k => packagesData[k]).length} packages available
        </span>
      </div>

      <div className="package-tiers">
        {sortedTiers.map((tier, idx) => {
          const pkg = packagesData[tier];
          if (!pkg) return null;

          const tierInfo = tierLabels[tier];
          const isSelected = selectedTier === tier;

          // Extract product data and calculate total
          const items = pkg.items?.map(getProductData) || [];
          const totalPrice = items.reduce((sum, item) => sum + (item.msrp_cents || 0), 0);

          // Get category icon
          const getCategoryIcon = (slot) => {
            const s = (slot || '').toLowerCase();
            if (s.includes('fridge') || s.includes('refrigerator')) return '🧊';
            if (s.includes('range') || s.includes('stove') || s.includes('oven')) return '🔥';
            if (s.includes('dish')) return '🍽️';
            if (s.includes('wash')) return '🧺';
            if (s.includes('dry')) return '♨️';
            return '📦';
          };

          return (
            <div
              key={tier}
              className={`package-tier-card ${isSelected ? 'selected' : ''}`}
              onClick={() => onSelectPackage && onSelectPackage(tier, pkg)}
              style={{
                '--tier-color': tierInfo.color,
                animationDelay: `${idx * 100}ms`
              }}
            >
              <div className="tier-header">
                <div className="tier-header-top">
                  <span className="tier-icon">{tierInfo.icon}</span>
                  <div
                    className="tier-badge"
                    style={{ background: tierInfo.color }}
                  >
                    {tierInfo.label}
                  </div>
                </div>
                <div className="tier-description">{tierInfo.description}</div>
              </div>

              <div className="tier-price">
                {formatPrice(totalPrice)}
              </div>

              <div className="tier-items">
                {items.map((item, idx) => (
                  <div key={idx} className="tier-item">
                    <span className="tier-item-icon">{getCategoryIcon(item.slot)}</span>
                    <div className="tier-item-details">
                      <div className="tier-item-category">
                        {item.slot || item.category || 'Appliance'}
                      </div>
                      <div className="tier-item-name">
                        <span className="tier-item-brand">{item.manufacturer}</span>
                        <span className="tier-item-model">{item.model}</span>
                      </div>
                    </div>
                    <div className="tier-item-price">
                      {formatPrice(item.msrp_cents)}
                    </div>
                  </div>
                ))}
              </div>

              <div className="tier-summary">
                <span>{items.length} items</span>
                {pkg.brand_cohesion_score !== undefined && (
                  <span className="tier-cohesion" title="Brand Cohesion Score">
                    🎯 {pkg.brand_cohesion_score}%
                  </span>
                )}
                {pkg.savings_percent > 0 && (
                  <span className="tier-savings">
                    Save {pkg.savings_percent}%
                  </span>
                )}
              </div>

              <button
                className={`tier-select-btn ${isSelected ? 'selected' : ''}`}
                onClick={(e) => {
                  e.stopPropagation();
                  onSelectPackage && onSelectPackage(tier, pkg);
                }}
              >
                {isSelected ? '✓ Selected' : 'Select Package'}
              </button>
            </div>
          );
        })}
      </div>
    </div>
  );
};

export default PackagePreview;

