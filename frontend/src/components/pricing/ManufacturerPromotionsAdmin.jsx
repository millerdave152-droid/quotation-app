import React, { useState, useEffect, useCallback, useRef } from 'react';

const API_URL = `${process.env.REACT_APP_API_URL || 'http://localhost:3001'}/api`;

const getAuthHeaders = () => {
  const token = localStorage.getItem('auth_token');
  return {
    'Content-Type': 'application/json',
    ...(token && { 'Authorization': `Bearer ${token}` })
  };
};

/**
 * ManufacturerPromotionsAdmin - Admin dashboard for manufacturer promotions
 *
 * Features:
 * - View/manage manufacturer promotions
 * - Import Excel files with promotion data
 * - Configure watch folders for auto-import
 * - View import history
 */
const ManufacturerPromotionsAdmin = () => {
  const [activeTab, setActiveTab] = useState('promotions');
  const [promotions, setPromotions] = useState([]);
  const [importLogs, setImportLogs] = useState([]);
  const [watchFolders, setWatchFolders] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [uploading, setUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(null);

  const fileInputRef = useRef(null);

  // Filters
  const [filters, setFilters] = useState({
    manufacturer: '',
    promo_type: '',
    active_only: true
  });

  // Fetch promotions
  const fetchPromotions = useCallback(async () => {
    try {
      const params = new URLSearchParams();
      if (filters.manufacturer) params.append('manufacturer', filters.manufacturer);
      if (filters.promo_type) params.append('promo_type', filters.promo_type);
      params.append('active_only', filters.active_only);
      params.append('include_expired', !filters.active_only);

      const response = await fetch(`${API_URL}/promotions/manufacturer?${params}`, {
        headers: getAuthHeaders()
      });
      if (!response.ok) throw new Error('Failed to fetch promotions');
      const result = await response.json();
      // API returns { success, data } - extract the array
      setPromotions(Array.isArray(result) ? result : (result.data || []));
    } catch (err) {
      console.error('Error fetching promotions:', err);
      setError(err.message);
    }
  }, [filters]);

  // Fetch import logs
  const fetchImportLogs = useCallback(async () => {
    try {
      const response = await fetch(`${API_URL}/promotions/manufacturer/import/logs`, {
        headers: getAuthHeaders()
      });
      if (!response.ok) throw new Error('Failed to fetch import logs');
      const result = await response.json();
      // API returns { success, data } - extract the array
      setImportLogs(Array.isArray(result) ? result : (result.data || []));
    } catch (err) {
      console.error('Error fetching import logs:', err);
    }
  }, []);

  // Fetch watch folders
  const fetchWatchFolders = useCallback(async () => {
    try {
      const response = await fetch(`${API_URL}/promotions/manufacturer/watch-folders`, {
        headers: getAuthHeaders()
      });
      if (!response.ok) throw new Error('Failed to fetch watch folders');
      const result = await response.json();
      // API returns { success, data } - extract the array
      setWatchFolders(Array.isArray(result) ? result : (result.data || []));
    } catch (err) {
      console.error('Error fetching watch folders:', err);
    }
  }, []);

  // Initial data fetch
  useEffect(() => {
    const loadData = async () => {
      setLoading(true);
      await Promise.all([fetchPromotions(), fetchImportLogs(), fetchWatchFolders()]);
      setLoading(false);
    };
    loadData();
  }, [fetchPromotions, fetchImportLogs, fetchWatchFolders]);

  // Handle file upload
  const handleFileUpload = async (event) => {
    const file = event.target.files?.[0];
    if (!file) return;

    const formData = new FormData();
    formData.append('file', file);

    setUploading(true);
    setUploadProgress({ status: 'uploading', message: 'Uploading file...' });

    try {
      const token = localStorage.getItem('auth_token');
      const response = await fetch(`${API_URL}/promotions/manufacturer/import`, {
        method: 'POST',
        headers: {
          ...(token && { 'Authorization': `Bearer ${token}` })
        },
        body: formData
      });

      let result;
      try {
        result = await response.json();
      } catch (parseErr) {
        throw new Error(`Server returned invalid response (${response.status}): ${response.statusText}`);
      }

      if (!response.ok) {
        // Handle error - API returns { error: { code, message } } or { error: string }
        let errorMsg = 'Import failed';
        if (result.error) {
          if (typeof result.error === 'string') {
            errorMsg = result.error;
          } else if (result.error.message) {
            errorMsg = result.error.message;
          } else if (typeof result.error === 'object') {
            errorMsg = JSON.stringify(result.error);
          }
        } else if (result.message) {
          errorMsg = result.message;
        }
        throw new Error(errorMsg);
      }

      // Backend wraps response in 'data'
      const importData = result.data || result;
      // Backend uses 'stats' not 'summary'
      const stats = importData.stats || importData.summary || importData;

      setUploadProgress({
        status: 'success',
        message: `Import complete! ${stats.modelsImported || stats.models_imported || 0} models imported, ${stats.modelsMatched || stats.models_matched || 0} matched to products.`,
        details: importData
      });

      // Refresh data
      await Promise.all([fetchPromotions(), fetchImportLogs()]);

    } catch (err) {
      console.error('Upload error:', err);
      setUploadProgress({
        status: 'error',
        message: err.message
      });
    } finally {
      setUploading(false);
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
    }
  };

  // Toggle promotion active status
  const togglePromotionStatus = async (promoId, currentStatus) => {
    try {
      const response = await fetch(`${API_URL}/promotions/manufacturer/${promoId}`, {
        method: 'PUT',
        headers: getAuthHeaders(),
        body: JSON.stringify({ is_active: !currentStatus })
      });

      if (!response.ok) throw new Error('Failed to update promotion');
      await fetchPromotions();
    } catch (err) {
      console.error('Error updating promotion:', err);
      alert('Failed to update promotion: ' + err.message);
    }
  };

  // Delete promotion
  const deletePromotion = async (promoId) => {
    if (!window.confirm('Are you sure you want to deactivate this promotion?')) return;

    try {
      const response = await fetch(`${API_URL}/promotions/manufacturer/${promoId}`, {
        method: 'DELETE',
        headers: getAuthHeaders()
      });

      if (!response.ok) throw new Error('Failed to delete promotion');
      await fetchPromotions();
    } catch (err) {
      console.error('Error deleting promotion:', err);
      alert('Failed to delete promotion: ' + err.message);
    }
  };

  // Add watch folder
  const addWatchFolder = async () => {
    const folderPath = prompt('Enter folder path to watch for promotion files:');
    if (!folderPath) return;

    const manufacturer = prompt('Enter manufacturer name (optional, press Enter to skip):');

    try {
      const response = await fetch(`${API_URL}/promotions/manufacturer/watch-folders`, {
        method: 'POST',
        headers: getAuthHeaders(),
        body: JSON.stringify({
          folder_path: folderPath,
          manufacturer: manufacturer || null
        })
      });

      if (!response.ok) {
        const err = await response.json();
        throw new Error(err.error || 'Failed to add watch folder');
      }

      await fetchWatchFolders();
    } catch (err) {
      console.error('Error adding watch folder:', err);
      alert('Failed to add watch folder: ' + err.message);
    }
  };

  // Scan watch folders
  const scanWatchFolders = async () => {
    try {
      const response = await fetch(`${API_URL}/promotions/manufacturer/watch-folders/scan`, {
        method: 'POST',
        headers: getAuthHeaders()
      });

      const result = await response.json();
      if (!response.ok) throw new Error(result.error || 'Scan failed');

      alert(`Scan complete! Processed ${result.files_processed || 0} files.`);
      await Promise.all([fetchPromotions(), fetchImportLogs()]);
    } catch (err) {
      console.error('Error scanning folders:', err);
      alert('Scan failed: ' + err.message);
    }
  };

  // Styles
  const containerStyle = {
    padding: '24px',
    maxWidth: '1400px',
    margin: '0 auto',
    backgroundColor: '#f8fafc',
    minHeight: '100vh'
  };

  const headerStyle = {
    marginBottom: '24px'
  };

  const titleStyle = {
    fontSize: '28px',
    fontWeight: '700',
    color: '#1a1a2e',
    margin: 0
  };

  const tabsStyle = {
    display: 'flex',
    gap: '0',
    marginBottom: '24px',
    borderBottom: '2px solid #e5e7eb',
    paddingBottom: '0'
  };

  const tabStyle = (isActive) => ({
    padding: '12px 24px',
    fontSize: '14px',
    fontWeight: '600',
    color: isActive ? '#059669' : '#6b7280',
    backgroundColor: 'transparent',
    border: 'none',
    borderBottom: isActive ? '2px solid #059669' : '2px solid transparent',
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

  const promoTypeBadge = (type) => {
    const colors = {
      bundle_savings: { bg: '#dbeafe', text: '#1d4ed8' },
      bonus_gift: { bg: '#fef3c7', text: '#92400e' },
      guarantee: { bg: '#d1fae5', text: '#065f46' }
    };
    const c = colors[type] || { bg: '#f3f4f6', text: '#374151' };
    return {
      padding: '4px 8px',
      backgroundColor: c.bg,
      color: c.text,
      borderRadius: '4px',
      fontSize: '12px',
      fontWeight: '500',
      textTransform: 'capitalize'
    };
  };

  const formatDate = (date) => {
    if (!date) return '-';
    return new Date(date).toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric'
    });
  };

  const formatCents = (cents) => {
    if (!cents) return '$0';
    return `$${(cents / 100).toFixed(0)}`;
  };

  if (loading) {
    return (
      <div style={containerStyle}>
        <div style={{ textAlign: 'center', padding: '60px' }}>
          <div style={{ fontSize: '24px', marginBottom: '16px' }}>Loading promotions...</div>
        </div>
      </div>
    );
  }

  return (
    <div style={containerStyle}>
      <div style={headerStyle}>
        <h1 style={titleStyle}>Manufacturer Promotions</h1>
        <p style={{ color: '#6b7280', marginTop: '8px' }}>
          Manage promotions from Whirlpool, KitchenAid, Maytag, JennAir
        </p>
      </div>

      {/* Tabs */}
      <div style={tabsStyle}>
        <button style={tabStyle(activeTab === 'promotions')} onClick={() => setActiveTab('promotions')}>
          Active Promotions ({promotions.length})
        </button>
        <button style={tabStyle(activeTab === 'import')} onClick={() => setActiveTab('import')}>
          Import
        </button>
        <button style={tabStyle(activeTab === 'folders')} onClick={() => setActiveTab('folders')}>
          Watch Folders ({watchFolders.length})
        </button>
        <button style={tabStyle(activeTab === 'history')} onClick={() => setActiveTab('history')}>
          Import History ({importLogs.length})
        </button>
      </div>

      {error && (
        <div style={{ padding: '16px', backgroundColor: '#fef2f2', border: '1px solid #fecaca', borderRadius: '8px', marginBottom: '16px', color: '#dc2626' }}>
          {error}
        </div>
      )}

      {/* Promotions Tab */}
      {activeTab === 'promotions' && (
        <div style={cardStyle}>
          {/* Filters */}
          <div style={{ padding: '16px 20px', borderBottom: '1px solid #e5e7eb', display: 'flex', gap: '16px', alignItems: 'center', flexWrap: 'wrap' }}>
            <select
              value={filters.manufacturer}
              onChange={(e) => setFilters(f => ({ ...f, manufacturer: e.target.value }))}
              style={{ padding: '8px 12px', border: '1px solid #d1d5db', borderRadius: '6px', fontSize: '14px' }}
            >
              <option value="">All Manufacturers</option>
              <option value="Whirlpool">Whirlpool</option>
              <option value="KitchenAid">KitchenAid</option>
              <option value="Maytag">Maytag</option>
              <option value="JennAir">JennAir</option>
            </select>

            <select
              value={filters.promo_type}
              onChange={(e) => setFilters(f => ({ ...f, promo_type: e.target.value }))}
              style={{ padding: '8px 12px', border: '1px solid #d1d5db', borderRadius: '6px', fontSize: '14px' }}
            >
              <option value="">All Types</option>
              <option value="bundle_savings">Bundle Savings</option>
              <option value="bonus_gift">Bonus Gift</option>
              <option value="guarantee">Guarantee</option>
            </select>

            <label style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '14px', color: '#374151' }}>
              <input
                type="checkbox"
                checked={filters.active_only}
                onChange={(e) => setFilters(f => ({ ...f, active_only: e.target.checked }))}
              />
              Active only
            </label>

            <button
              onClick={fetchPromotions}
              style={{
                padding: '8px 16px',
                backgroundColor: '#059669',
                color: '#fff',
                border: 'none',
                borderRadius: '6px',
                fontSize: '14px',
                cursor: 'pointer'
              }}
            >
              Refresh
            </button>
          </div>

          {/* Promotions Table */}
          {promotions.length === 0 ? (
            <div style={{ padding: '60px', textAlign: 'center', color: '#6b7280' }}>
              <div style={{ fontSize: '48px', marginBottom: '16px' }}>🏷️</div>
              <div style={{ fontSize: '16px', marginBottom: '8px' }}>No promotions found</div>
              <div style={{ fontSize: '14px' }}>Import a promotion file to get started</div>
            </div>
          ) : (
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                <thead>
                  <tr style={{ backgroundColor: '#f9fafb' }}>
                    <th style={{ padding: '12px 16px', textAlign: 'left', fontSize: '12px', fontWeight: '600', color: '#6b7280', textTransform: 'uppercase' }}>Promotion</th>
                    <th style={{ padding: '12px 16px', textAlign: 'left', fontSize: '12px', fontWeight: '600', color: '#6b7280', textTransform: 'uppercase' }}>Manufacturer</th>
                    <th style={{ padding: '12px 16px', textAlign: 'left', fontSize: '12px', fontWeight: '600', color: '#6b7280', textTransform: 'uppercase' }}>Type</th>
                    <th style={{ padding: '12px 16px', textAlign: 'left', fontSize: '12px', fontWeight: '600', color: '#6b7280', textTransform: 'uppercase' }}>Value</th>
                    <th style={{ padding: '12px 16px', textAlign: 'left', fontSize: '12px', fontWeight: '600', color: '#6b7280', textTransform: 'uppercase' }}>Dates</th>
                    <th style={{ padding: '12px 16px', textAlign: 'center', fontSize: '12px', fontWeight: '600', color: '#6b7280', textTransform: 'uppercase' }}>Models</th>
                    <th style={{ padding: '12px 16px', textAlign: 'center', fontSize: '12px', fontWeight: '600', color: '#6b7280', textTransform: 'uppercase' }}>Status</th>
                    <th style={{ padding: '12px 16px', textAlign: 'center', fontSize: '12px', fontWeight: '600', color: '#6b7280', textTransform: 'uppercase' }}>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {promotions.map((promo) => (
                    <tr key={promo.id} style={{ borderTop: '1px solid #e5e7eb' }}>
                      <td style={{ padding: '16px' }}>
                        <div style={{ fontWeight: '600', color: '#1a1a2e' }}>{promo.promo_name}</div>
                        <div style={{ fontSize: '12px', color: '#6b7280', marginTop: '2px' }}>{promo.promo_code}</div>
                      </td>
                      <td style={{ padding: '16px', color: '#374151' }}>{promo.manufacturer}</td>
                      <td style={{ padding: '16px' }}>
                        <span style={promoTypeBadge(promo.promo_type)}>
                          {promo.promo_type.replace('_', ' ')}
                        </span>
                      </td>
                      <td style={{ padding: '16px' }}>
                        {promo.promo_type === 'bundle_savings' && promo.tier_discounts && (
                          <div style={{ fontSize: '13px' }}>
                            {promo.tier_discounts.map((tier, i) => (
                              <div key={i}>{tier.min_items}+ items: {formatCents(tier.discount_cents)}</div>
                            ))}
                          </div>
                        )}
                        {promo.promo_type === 'bonus_gift' && (
                          <div style={{ fontSize: '13px' }}>{promo.gift_description || 'Free gift'}</div>
                        )}
                        {promo.promo_type === 'guarantee' && (
                          <div style={{ fontSize: '13px' }}>{promo.badge_text || promo.promo_name}</div>
                        )}
                      </td>
                      <td style={{ padding: '16px', fontSize: '13px', color: '#6b7280' }}>
                        <div>{formatDate(promo.start_date)} -</div>
                        <div>{formatDate(promo.end_date)}</div>
                      </td>
                      <td style={{ padding: '16px', textAlign: 'center' }}>
                        <span style={{
                          padding: '4px 8px',
                          backgroundColor: '#f3f4f6',
                          borderRadius: '9999px',
                          fontSize: '13px',
                          fontWeight: '500'
                        }}>
                          {promo.eligible_model_count || 0}
                        </span>
                      </td>
                      <td style={{ padding: '16px', textAlign: 'center' }}>
                        <span style={{
                          padding: '4px 8px',
                          backgroundColor: promo.is_active ? '#d1fae5' : '#fee2e2',
                          color: promo.is_active ? '#065f46' : '#dc2626',
                          borderRadius: '4px',
                          fontSize: '12px',
                          fontWeight: '500'
                        }}>
                          {promo.is_active ? 'Active' : 'Inactive'}
                        </span>
                      </td>
                      <td style={{ padding: '16px', textAlign: 'center' }}>
                        <div style={{ display: 'flex', gap: '8px', justifyContent: 'center' }}>
                          <button
                            onClick={() => togglePromotionStatus(promo.id, promo.is_active)}
                            style={{
                              padding: '6px 12px',
                              backgroundColor: promo.is_active ? '#fee2e2' : '#d1fae5',
                              color: promo.is_active ? '#dc2626' : '#065f46',
                              border: 'none',
                              borderRadius: '4px',
                              fontSize: '12px',
                              cursor: 'pointer'
                            }}
                          >
                            {promo.is_active ? 'Deactivate' : 'Activate'}
                          </button>
                          <button
                            onClick={() => deletePromotion(promo.id)}
                            style={{
                              padding: '6px 12px',
                              backgroundColor: '#f3f4f6',
                              color: '#6b7280',
                              border: 'none',
                              borderRadius: '4px',
                              fontSize: '12px',
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

      {/* Import Tab */}
      {activeTab === 'import' && (
        <div style={cardStyle}>
          <div style={{ padding: '24px' }}>
            <h2 style={{ margin: '0 0 16px 0', fontSize: '18px', fontWeight: '600' }}>Import Promotion File</h2>
            <p style={{ color: '#6b7280', marginBottom: '24px' }}>
              Upload an Excel file (.xlsx, .xls) containing promotion data and eligible models.
              The system will automatically detect the promotion type and match models to your product catalog.
            </p>

            {/* Upload Area */}
            <div
              style={{
                border: '2px dashed #d1d5db',
                borderRadius: '12px',
                padding: '48px',
                textAlign: 'center',
                backgroundColor: '#f9fafb',
                marginBottom: '24px'
              }}
            >
              <div style={{ fontSize: '48px', marginBottom: '16px' }}>📄</div>
              <div style={{ fontSize: '16px', fontWeight: '500', marginBottom: '8px' }}>
                Drop Excel file here or click to browse
              </div>
              <div style={{ fontSize: '14px', color: '#6b7280', marginBottom: '16px' }}>
                Supports .xlsx, .xls files up to 10MB
              </div>
              <input
                ref={fileInputRef}
                type="file"
                accept=".xlsx,.xls,.csv"
                onChange={handleFileUpload}
                disabled={uploading}
                style={{ display: 'none' }}
                id="promo-file-input"
              />
              <label
                htmlFor="promo-file-input"
                style={{
                  display: 'inline-block',
                  padding: '12px 24px',
                  backgroundColor: uploading ? '#9ca3af' : '#059669',
                  color: '#fff',
                  borderRadius: '8px',
                  fontSize: '14px',
                  fontWeight: '500',
                  cursor: uploading ? 'not-allowed' : 'pointer'
                }}
              >
                {uploading ? 'Uploading...' : 'Select File'}
              </label>
            </div>

            {/* Upload Progress */}
            {uploadProgress && (
              <div
                style={{
                  padding: '16px',
                  backgroundColor: uploadProgress.status === 'success' ? '#d1fae5' :
                                   uploadProgress.status === 'error' ? '#fee2e2' : '#dbeafe',
                  border: `1px solid ${uploadProgress.status === 'success' ? '#86efac' :
                                        uploadProgress.status === 'error' ? '#fecaca' : '#93c5fd'}`,
                  borderRadius: '8px',
                  marginBottom: '24px'
                }}
              >
                <div style={{
                  fontWeight: '500',
                  color: uploadProgress.status === 'success' ? '#065f46' :
                         uploadProgress.status === 'error' ? '#dc2626' : '#1d4ed8',
                  marginBottom: uploadProgress.details ? '8px' : 0
                }}>
                  {uploadProgress.status === 'success' ? '✓ ' : uploadProgress.status === 'error' ? '✗ ' : '⏳ '}
                  {uploadProgress.message}
                </div>
                {uploadProgress.details && (uploadProgress.details.stats || uploadProgress.details.summary) && (
                  <div style={{ fontSize: '13px', color: '#374151', marginTop: '8px' }}>
                    {(() => {
                      const s = uploadProgress.details.stats || uploadProgress.details.summary || {};
                      return (
                        <>
                          <div>Promotion: {uploadProgress.details.promotion?.promo_name || 'Created/Updated'}</div>
                          <div>Models: {s.modelsImported || s.models_imported || 0} imported, {s.modelsMatched || s.models_matched || 0} matched to products</div>
                        </>
                      );
                    })()}
                  </div>
                )}
              </div>
            )}

            {/* Expected Format Info */}
            <div style={{ backgroundColor: '#f0f9ff', border: '1px solid #bae6fd', borderRadius: '8px', padding: '16px' }}>
              <h3 style={{ margin: '0 0 12px 0', fontSize: '14px', fontWeight: '600', color: '#0369a1' }}>Expected File Format</h3>
              <div style={{ fontSize: '13px', color: '#0369a1' }}>
                <p style={{ margin: '0 0 8px 0' }}>The Excel file should contain columns for:</p>
                <ul style={{ margin: '0', paddingLeft: '20px' }}>
                  <li><strong>Brand</strong> - Manufacturer name (Whirlpool, KitchenAid, etc.)</li>
                  <li><strong>Category</strong> - Product category (Cooking, Refrigeration, etc.)</li>
                  <li><strong>Model</strong> - Model number</li>
                  <li><strong>SubCategory</strong> (optional) - Specific subcategory</li>
                  <li><strong>Product Family Detail</strong> (optional) - Additional product info</li>
                </ul>
                <p style={{ margin: '12px 0 0 0' }}>
                  The promotion type is auto-detected from the filename (e.g., "Kitchen Suite Savings" = bundle_savings).
                </p>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Watch Folders Tab */}
      {activeTab === 'folders' && (
        <div style={cardStyle}>
          <div style={{ padding: '16px 20px', borderBottom: '1px solid #e5e7eb', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <h2 style={{ margin: 0, fontSize: '18px', fontWeight: '600' }}>Watch Folders</h2>
            <div style={{ display: 'flex', gap: '12px' }}>
              <button
                onClick={scanWatchFolders}
                style={{
                  padding: '8px 16px',
                  backgroundColor: '#f3f4f6',
                  color: '#374151',
                  border: '1px solid #d1d5db',
                  borderRadius: '6px',
                  fontSize: '14px',
                  cursor: 'pointer'
                }}
              >
                Scan Now
              </button>
              <button
                onClick={addWatchFolder}
                style={{
                  padding: '8px 16px',
                  backgroundColor: '#059669',
                  color: '#fff',
                  border: 'none',
                  borderRadius: '6px',
                  fontSize: '14px',
                  cursor: 'pointer'
                }}
              >
                + Add Folder
              </button>
            </div>
          </div>

          {watchFolders.length === 0 ? (
            <div style={{ padding: '60px', textAlign: 'center', color: '#6b7280' }}>
              <div style={{ fontSize: '48px', marginBottom: '16px' }}>📁</div>
              <div style={{ fontSize: '16px', marginBottom: '8px' }}>No watch folders configured</div>
              <div style={{ fontSize: '14px' }}>Add a folder to automatically import new promotion files</div>
            </div>
          ) : (
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                <thead>
                  <tr style={{ backgroundColor: '#f9fafb' }}>
                    <th style={{ padding: '12px 16px', textAlign: 'left', fontSize: '12px', fontWeight: '600', color: '#6b7280', textTransform: 'uppercase' }}>Folder Path</th>
                    <th style={{ padding: '12px 16px', textAlign: 'left', fontSize: '12px', fontWeight: '600', color: '#6b7280', textTransform: 'uppercase' }}>Manufacturer</th>
                    <th style={{ padding: '12px 16px', textAlign: 'center', fontSize: '12px', fontWeight: '600', color: '#6b7280', textTransform: 'uppercase' }}>Files Processed</th>
                    <th style={{ padding: '12px 16px', textAlign: 'left', fontSize: '12px', fontWeight: '600', color: '#6b7280', textTransform: 'uppercase' }}>Last Checked</th>
                    <th style={{ padding: '12px 16px', textAlign: 'center', fontSize: '12px', fontWeight: '600', color: '#6b7280', textTransform: 'uppercase' }}>Status</th>
                  </tr>
                </thead>
                <tbody>
                  {watchFolders.map((folder) => (
                    <tr key={folder.id} style={{ borderTop: '1px solid #e5e7eb' }}>
                      <td style={{ padding: '16px', fontFamily: 'monospace', fontSize: '13px' }}>{folder.folder_path}</td>
                      <td style={{ padding: '16px', color: '#374151' }}>{folder.manufacturer || 'All'}</td>
                      <td style={{ padding: '16px', textAlign: 'center' }}>{folder.files_processed || 0}</td>
                      <td style={{ padding: '16px', fontSize: '13px', color: '#6b7280' }}>
                        {folder.last_checked_at ? formatDate(folder.last_checked_at) : 'Never'}
                      </td>
                      <td style={{ padding: '16px', textAlign: 'center' }}>
                        <span style={{
                          padding: '4px 8px',
                          backgroundColor: folder.is_active ? '#d1fae5' : '#fee2e2',
                          color: folder.is_active ? '#065f46' : '#dc2626',
                          borderRadius: '4px',
                          fontSize: '12px',
                          fontWeight: '500'
                        }}>
                          {folder.is_active ? 'Active' : 'Paused'}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* Import History Tab */}
      {activeTab === 'history' && (
        <div style={cardStyle}>
          <div style={{ padding: '16px 20px', borderBottom: '1px solid #e5e7eb' }}>
            <h2 style={{ margin: 0, fontSize: '18px', fontWeight: '600' }}>Import History</h2>
          </div>

          {importLogs.length === 0 ? (
            <div style={{ padding: '60px', textAlign: 'center', color: '#6b7280' }}>
              <div style={{ fontSize: '48px', marginBottom: '16px' }}>📋</div>
              <div style={{ fontSize: '16px', marginBottom: '8px' }}>No imports yet</div>
              <div style={{ fontSize: '14px' }}>Import history will appear here</div>
            </div>
          ) : (
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                <thead>
                  <tr style={{ backgroundColor: '#f9fafb' }}>
                    <th style={{ padding: '12px 16px', textAlign: 'left', fontSize: '12px', fontWeight: '600', color: '#6b7280', textTransform: 'uppercase' }}>File</th>
                    <th style={{ padding: '12px 16px', textAlign: 'left', fontSize: '12px', fontWeight: '600', color: '#6b7280', textTransform: 'uppercase' }}>Source</th>
                    <th style={{ padding: '12px 16px', textAlign: 'center', fontSize: '12px', fontWeight: '600', color: '#6b7280', textTransform: 'uppercase' }}>Promotions</th>
                    <th style={{ padding: '12px 16px', textAlign: 'center', fontSize: '12px', fontWeight: '600', color: '#6b7280', textTransform: 'uppercase' }}>Models</th>
                    <th style={{ padding: '12px 16px', textAlign: 'center', fontSize: '12px', fontWeight: '600', color: '#6b7280', textTransform: 'uppercase' }}>Matched</th>
                    <th style={{ padding: '12px 16px', textAlign: 'center', fontSize: '12px', fontWeight: '600', color: '#6b7280', textTransform: 'uppercase' }}>Status</th>
                    <th style={{ padding: '12px 16px', textAlign: 'left', fontSize: '12px', fontWeight: '600', color: '#6b7280', textTransform: 'uppercase' }}>Date</th>
                  </tr>
                </thead>
                <tbody>
                  {importLogs.map((log) => (
                    <tr key={log.id} style={{ borderTop: '1px solid #e5e7eb' }}>
                      <td style={{ padding: '16px' }}>
                        <div style={{ fontWeight: '500', color: '#1a1a2e', maxWidth: '250px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                          {log.file_name}
                        </div>
                      </td>
                      <td style={{ padding: '16px' }}>
                        <span style={{
                          padding: '4px 8px',
                          backgroundColor: log.import_source === 'folder_watch' ? '#e0e7ff' : '#fef3c7',
                          color: log.import_source === 'folder_watch' ? '#4338ca' : '#92400e',
                          borderRadius: '4px',
                          fontSize: '12px'
                        }}>
                          {log.import_source === 'folder_watch' ? 'Auto' : 'Manual'}
                        </span>
                      </td>
                      <td style={{ padding: '16px', textAlign: 'center' }}>
                        {log.promotions_created || 0} / {log.promotions_updated || 0}
                      </td>
                      <td style={{ padding: '16px', textAlign: 'center' }}>{log.models_imported || 0}</td>
                      <td style={{ padding: '16px', textAlign: 'center' }}>
                        <span style={{
                          color: log.models_matched > 0 ? '#059669' : '#6b7280',
                          fontWeight: log.models_matched > 0 ? '600' : '400'
                        }}>
                          {log.models_matched || 0}
                        </span>
                      </td>
                      <td style={{ padding: '16px', textAlign: 'center' }}>
                        <span style={{
                          padding: '4px 8px',
                          backgroundColor: log.status === 'success' ? '#d1fae5' :
                                           log.status === 'failed' ? '#fee2e2' :
                                           log.status === 'partial' ? '#fef3c7' : '#e0e7ff',
                          color: log.status === 'success' ? '#065f46' :
                                 log.status === 'failed' ? '#dc2626' :
                                 log.status === 'partial' ? '#92400e' : '#4338ca',
                          borderRadius: '4px',
                          fontSize: '12px',
                          fontWeight: '500',
                          textTransform: 'capitalize'
                        }}>
                          {log.status}
                        </span>
                      </td>
                      <td style={{ padding: '16px', fontSize: '13px', color: '#6b7280' }}>
                        {formatDate(log.started_at)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}
    </div>
  );
};

export default ManufacturerPromotionsAdmin;
