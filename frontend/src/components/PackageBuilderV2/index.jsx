/**
 * PackageBuilderV2 - Main container component
 * Faceted filtering system for appliance packages
 * Inspired by canadianappliance.ca with Good/Better/Best output
 */
import React, { useState, useCallback } from 'react';
import FilterSidebar from './FilterSidebar';
import ActiveFilters from './ActiveFilters';
import PackagePreview from './PackagePreview';
import usePackageFilters from '../../hooks/usePackageFilters';
import './PackageBuilderV2.css';

const PackageBuilderV2 = ({
  defaultPackageType = 'kitchen',
  onPackageSelect,
  onClose
}) => {
  const [packageType, setPackageType] = useState(defaultPackageType);
  const [selectedTier, setSelectedTier] = useState(null);
  const [mobileSidebarOpen, setMobileSidebarOpen] = useState(false);

  // Use the filter hook
  const {
    selectedFilters,
    filterOptions,
    loading: filtersLoading,
    packages,
    packagesLoading,
    packagesError,
    preview,
    updateFilters,
    removeFilter,
    clearFilters,
    generatePackages,
    hasActiveFilters
  } = usePackageFilters(packageType);

  // Handle package type change
  const handlePackageTypeChange = (type) => {
    setPackageType(type);
    setSelectedTier(null);
  };

  // Handle tier selection
  const handleSelectPackage = useCallback((tier, pkg) => {
    setSelectedTier(tier);
    if (onPackageSelect) {
      onPackageSelect(tier, pkg, packageType);
    }
  }, [packageType, onPackageSelect]);

  // Handle generate click
  const handleGenerate = () => {
    console.log('Generating packages with filters:', selectedFilters);
    generatePackages();
  };

  // Debug log
  console.log('PackageBuilderV2 state:', {
    packages,
    packagesLoading,
    packagesError,
    hasFilters: hasActiveFilters(),
    selectedFilters
  });

  // Check if can generate - always allow, even without filters
  const canGenerate = true;

  return (
    <div className="package-builder-v2">
      {/* Header */}
      <div className="pbv2-header">
        <div className="pbv2-header-left">
          <button
            className="pbv2-mobile-filter-btn"
            onClick={() => setMobileSidebarOpen(true)}
          >
            Filters
          </button>
          <h2>Package Builder</h2>
        </div>

        <div className="pbv2-package-type-tabs">
          <button
            className={`pbv2-tab ${packageType === 'kitchen' ? 'active' : ''}`}
            onClick={() => handlePackageTypeChange('kitchen')}
          >
            Kitchen Package
          </button>
          <button
            className={`pbv2-tab ${packageType === 'laundry' ? 'active' : ''}`}
            onClick={() => handlePackageTypeChange('laundry')}
          >
            Laundry Package
          </button>
        </div>

        <div className="pbv2-header-right">
          <button
            className="pbv2-generate-btn"
            onClick={handleGenerate}
            disabled={packagesLoading}
          >
            {packagesLoading ? 'Generating...' : 'Generate Packages'}
          </button>
          {onClose && (
            <button className="pbv2-close-btn" onClick={onClose}>
              &times;
            </button>
          )}
        </div>
      </div>

      {/* Active filters bar */}
      {hasActiveFilters() && (
        <ActiveFilters
          selectedFilters={selectedFilters}
          filterOptions={filterOptions}
          onRemoveFilter={removeFilter}
          onClearAll={clearFilters}
        />
      )}

      {/* Main content area */}
      <div className="pbv2-content">
        {/* Mobile sidebar overlay */}
        {mobileSidebarOpen && (
          <div
            className="pbv2-mobile-overlay"
            onClick={() => setMobileSidebarOpen(false)}
          />
        )}

        {/* Filter sidebar */}
        <div className={`pbv2-sidebar ${mobileSidebarOpen ? 'open' : ''}`}>
          <FilterSidebar
            packageType={packageType}
            filterOptions={filterOptions}
            selectedFilters={selectedFilters}
            onFilterChange={updateFilters}
            onClearFilters={clearFilters}
            loading={filtersLoading}
          />
          <button
            className="pbv2-close-sidebar-btn"
            onClick={() => setMobileSidebarOpen(false)}
          >
            Apply Filters
          </button>
        </div>

        {/* Package preview area */}
        <div className="pbv2-main">
          {/* Status/info bar */}
          <div className="pbv2-info-bar">
            {!packages && !packagesLoading && !packagesError && (
              <div className="pbv2-info-message">
                <span className="info-icon">&#9432;</span>
                Select your preferences using the filters on the left, then click "Generate Packages" to see your Good/Better/Best options.
              </div>
            )}
            {packagesLoading && (
              <div className="pbv2-info-message">
                <span className="info-icon">&#8987;</span>
                Generating packages based on your selections...
              </div>
            )}
            {packagesError && (
              <div className="pbv2-error-message" style={{ background: '#fed7d7', color: '#c53030' }}>
                <span className="error-icon">&#9888;</span>
                Error: {packagesError}
              </div>
            )}
            {packages && !packagesError && !packagesLoading && (
              <div className="pbv2-success-message">
                <span className="success-icon">&#10003;</span>
                Packages generated! Select a tier below to add to your quote.
              </div>
            )}
          </div>

          {/* Package preview */}
          <PackagePreview
            packages={packages}
            loading={packagesLoading}
            error={packagesError}
            preview={preview}
            onSelectPackage={handleSelectPackage}
            selectedTier={selectedTier}
          />

          {/* Bottom action bar */}
          {selectedTier && packages && (
            <div className="pbv2-action-bar">
              <div className="pbv2-selected-info">
                Selected: <strong>{selectedTier.toUpperCase()}</strong> package
              </div>
              <button
                className="pbv2-add-to-quote-btn"
                onClick={() => onPackageSelect && onPackageSelect(selectedTier, packages[selectedTier], packageType)}
              >
                Add to Quote
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default PackageBuilderV2;
