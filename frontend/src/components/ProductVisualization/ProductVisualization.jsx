import React, { useState, useEffect } from 'react';
import ProductBrowser from './ProductBrowser';
import ProductDetail from './ProductDetail';
import ScraperAdmin from './ScraperAdmin';

import { authFetch } from '../../services/authFetch';
const API_BASE = '/api';

// Helper to get auth headers
const getAuthHeaders = () => {
  const token = localStorage.getItem('auth_token');
  return {
    'Content-Type': 'application/json',
    ...(token && { 'Authorization': `Bearer ${token}` })
  };
};

/**
 * ProductVisualization - Main container for vendor product visualization module
 * Provides product browsing, detail view, and scraper admin functionality
 */
function ProductVisualization() {
  const [activeTab, setActiveTab] = useState('browse');
  const [selectedProductId, setSelectedProductId] = useState(null);
  const [stats, setStats] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchStats();
  }, []);

  const fetchStats = async () => {
    try {
      const response = await authFetch(`${API_BASE}/vendor-products/stats`, {
        headers: getAuthHeaders()
      });
      if (response.ok) {
        const data = await response.json();
        setStats(data);
      }
    } catch (error) {
      console.error('Failed to fetch stats:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleProductSelect = (productId) => {
    setSelectedProductId(productId);
    setActiveTab('detail');
  };

  const handleBackToBrowse = () => {
    setSelectedProductId(null);
    setActiveTab('browse');
  };

  const tabs = [
    { id: 'browse', label: 'Browse Products', icon: 'grid' },
    { id: 'admin', label: 'Scraper Admin', icon: 'settings' }
  ];

  if (selectedProductId) {
    tabs.unshift({ id: 'detail', label: 'Product Details', icon: 'info' });
  }

  return (
    <div className="product-visualization">
      {/* Header */}
      <div className="pv-header">
        <div className="pv-header-content">
          <h1>Product Visualization</h1>
          <p className="pv-subtitle">Browse and manage vendor product data</p>
        </div>

        {/* Stats Cards */}
        {stats && (
          <div className="pv-stats">
            <div className="pv-stat-card">
              <span className="pv-stat-value">{stats.vendor_count || 0}</span>
              <span className="pv-stat-label">Vendors</span>
            </div>
            <div className="pv-stat-card">
              <span className="pv-stat-value">{stats.product_count || 0}</span>
              <span className="pv-stat-label">Products</span>
            </div>
            <div className="pv-stat-card">
              <span className="pv-stat-value">{stats.image_count || 0}</span>
              <span className="pv-stat-label">Images</span>
            </div>
            <div className="pv-stat-card">
              <span className="pv-stat-value">{stats.running_jobs || 0}</span>
              <span className="pv-stat-label">Active Jobs</span>
            </div>
          </div>
        )}
      </div>

      {/* Tab Navigation */}
      <div className="pv-tabs">
        {tabs.map(tab => (
          <button
            key={tab.id}
            className={`pv-tab ${activeTab === tab.id ? 'active' : ''}`}
            onClick={() => setActiveTab(tab.id)}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Tab Content */}
      <div className="pv-content">
        {activeTab === 'browse' && (
          <ProductBrowser onProductSelect={handleProductSelect} />
        )}

        {activeTab === 'detail' && selectedProductId && (
          <ProductDetail
            productId={selectedProductId}
            onBack={handleBackToBrowse}
          />
        )}

        {activeTab === 'admin' && (
          <ScraperAdmin onJobComplete={fetchStats} />
        )}
      </div>

      <style jsx>{`
        .product-visualization {
          padding: 20px;
          max-width: 1600px;
          margin: 0 auto;
        }

        .pv-header {
          margin-bottom: 24px;
        }

        .pv-header-content h1 {
          margin: 0 0 4px 0;
          font-size: 28px;
          font-weight: 600;
          color: #1a1a2e;
        }

        .pv-subtitle {
          margin: 0;
          color: #666;
          font-size: 14px;
        }

        .pv-stats {
          display: flex;
          gap: 16px;
          margin-top: 20px;
        }

        .pv-stat-card {
          background: white;
          border: 1px solid #e0e0e0;
          border-radius: 8px;
          padding: 16px 24px;
          display: flex;
          flex-direction: column;
          align-items: center;
          min-width: 100px;
        }

        .pv-stat-value {
          font-size: 24px;
          font-weight: 700;
          color: #2196F3;
        }

        .pv-stat-label {
          font-size: 12px;
          color: #666;
          text-transform: uppercase;
          letter-spacing: 0.5px;
        }

        .pv-tabs {
          display: flex;
          gap: 4px;
          border-bottom: 2px solid #e0e0e0;
          margin-bottom: 24px;
        }

        .pv-tab {
          padding: 12px 24px;
          border: none;
          background: none;
          font-size: 14px;
          font-weight: 500;
          color: #666;
          cursor: pointer;
          border-bottom: 2px solid transparent;
          margin-bottom: -2px;
          transition: all 0.2s;
        }

        .pv-tab:hover {
          color: #2196F3;
        }

        .pv-tab.active {
          color: #2196F3;
          border-bottom-color: #2196F3;
        }

        .pv-content {
          background: white;
          border: 1px solid #e0e0e0;
          border-radius: 8px;
          min-height: 500px;
        }
      `}</style>
    </div>
  );
}

export default ProductVisualization;
