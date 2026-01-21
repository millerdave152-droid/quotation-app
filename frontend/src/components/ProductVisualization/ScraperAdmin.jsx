import React, { useState, useEffect } from 'react';

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
 * ScraperAdmin - Admin panel for managing and running scrape jobs
 */
function ScraperAdmin({ onJobComplete }) {
  const [status, setStatus] = useState([]);
  const [loading, setLoading] = useState(true);
  const [scraping, setScraping] = useState(false);
  const [activeTab, setActiveTab] = useState('scraper'); // 'scraper' or 'manual'
  const [importing, setImporting] = useState(false);
  const [scrapeForm, setScrapeForm] = useState({
    vendor: 'whirlpool',
    jobType: 'full',
    category: '',
    modelNumber: '',
    downloadImages: true,
    maxProducts: 500
  });
  const [manualForm, setManualForm] = useState({
    vendor: 'Whirlpool',
    modelNumber: '',
    name: '',
    description: '',
    category: '',
    subcategory: '',
    brand: '',
    msrp: '',
    dealerPrice: '',
    imageUrls: ''
  });
  const [bulkJson, setBulkJson] = useState('');

  useEffect(() => {
    fetchStatus();
    // Poll every 5 seconds to catch job status changes (even after page refresh)
    const interval = setInterval(() => {
      fetchStatus();
    }, 5000);
    return () => clearInterval(interval);
  }, []);

  const fetchStatus = async () => {
    try {
      const response = await fetch(`${API_BASE}/vendor-products/scrape/status`, {
        headers: getAuthHeaders()
      });
      if (response.ok) {
        const data = await response.json();
        setStatus(data);

        // Check if any jobs are running
        const hasRunningJob = data.some(v =>
          v.recentJobs?.some(j => j.status === 'running')
        );

        // Notify parent when job completes
        if (!hasRunningJob && scraping && onJobComplete) {
          onJobComplete();
        }

        setScraping(hasRunningJob);
      }
    } catch (error) {
      console.error('Failed to fetch status:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleStartScrape = async () => {
    setScraping(true);

    try {
      const body = {
        vendor: scrapeForm.vendor,
        job_type: scrapeForm.modelNumber ? 'single_product' : scrapeForm.jobType,
        download_images: scrapeForm.downloadImages,
        max_products: scrapeForm.maxProducts
      };

      if (scrapeForm.category) {
        body.categories = [scrapeForm.category];
      }

      if (scrapeForm.modelNumber) {
        body.model_number = scrapeForm.modelNumber;
      }

      const response = await fetch(`${API_BASE}/vendor-products/scrape`, {
        method: 'POST',
        headers: getAuthHeaders(),
        body: JSON.stringify(body)
      });

      if (response.ok) {
        const result = await response.json();
        alert(`Scrape job started: ${result.message}`);
        fetchStatus();
      } else {
        const errorData = await response.json();
        alert(`Failed to start scrape: ${errorData.error?.message || errorData.message || 'Unknown error'}`);
        setScraping(false);
      }
    } catch (error) {
      alert(`Error: ${error.message}`);
      setScraping(false);
    }
  };

  // Manual Import - Single Product
  const handleManualImport = async () => {
    if (!manualForm.modelNumber || !manualForm.name) {
      alert('Model Number and Name are required');
      return;
    }

    setImporting(true);

    try {
      const imageUrls = manualForm.imageUrls
        .split('\n')
        .map(url => url.trim())
        .filter(url => url.length > 0);

      const body = {
        vendor: manualForm.vendor,
        modelNumber: manualForm.modelNumber,
        name: manualForm.name,
        description: manualForm.description || undefined,
        category: manualForm.category || undefined,
        subcategory: manualForm.subcategory || undefined,
        brand: manualForm.brand || undefined,
        msrp: manualForm.msrp ? parseFloat(manualForm.msrp) : undefined,
        dealerPrice: manualForm.dealerPrice ? parseFloat(manualForm.dealerPrice) : undefined,
        imageUrls
      };

      const response = await fetch(`${API_BASE}/vendor-products/manual-import`, {
        method: 'POST',
        headers: getAuthHeaders(),
        body: JSON.stringify(body)
      });

      const result = await response.json();

      if (response.ok) {
        alert(`Success! ${result.message}\nImages processed: ${result.imagesProcessed}`);
        // Reset form
        setManualForm({
          vendor: 'Whirlpool',
          modelNumber: '',
          name: '',
          description: '',
          category: '',
          subcategory: '',
          brand: '',
          msrp: '',
          dealerPrice: '',
          imageUrls: ''
        });
        if (onJobComplete) onJobComplete();
      } else {
        alert(`Failed: ${result.error?.message || result.message || 'Unknown error'}`);
      }
    } catch (error) {
      alert(`Error: ${error.message}`);
    } finally {
      setImporting(false);
    }
  };

  // Manual Import - Bulk JSON
  const handleBulkImport = async () => {
    if (!bulkJson.trim()) {
      alert('Please paste JSON data');
      return;
    }

    let products;
    try {
      products = JSON.parse(bulkJson);
      if (!Array.isArray(products)) {
        products = [products]; // Single object, wrap in array
      }
    } catch (e) {
      alert('Invalid JSON format');
      return;
    }

    setImporting(true);

    try {
      const response = await fetch(`${API_BASE}/vendor-products/manual-import/bulk`, {
        method: 'POST',
        headers: getAuthHeaders(),
        body: JSON.stringify({ products })
      });

      const result = await response.json();

      if (response.ok) {
        alert(`${result.message}`);
        setBulkJson('');
        if (onJobComplete) onJobComplete();
      } else {
        alert(`Failed: ${result.error?.message || result.message || 'Unknown error'}`);
      }
    } catch (error) {
      alert(`Error: ${error.message}`);
    } finally {
      setImporting(false);
    }
  };

  const formatDate = (dateStr) => {
    if (!dateStr) return 'Never';
    return new Date(dateStr).toLocaleString();
  };

  const getStatusColor = (status) => {
    switch (status) {
      case 'running': return '#2196F3';
      case 'completed': return '#4CAF50';
      case 'failed': return '#f44336';
      default: return '#666';
    }
  };

  return (
    <div className="scraper-admin">
      {/* Tab Navigation */}
      <div className="sa-tabs">
        <button
          className={`sa-tab ${activeTab === 'scraper' ? 'active' : ''}`}
          onClick={() => setActiveTab('scraper')}
        >
          Auto Scraper
        </button>
        <button
          className={`sa-tab ${activeTab === 'manual' ? 'active' : ''}`}
          onClick={() => setActiveTab('manual')}
        >
          Manual Import
        </button>
      </div>

      {/* Auto Scraper Tab */}
      {activeTab === 'scraper' && (
        <>
          {/* New Scrape Job */}
          <div className="sa-section">
            <h2 className="sa-title">Start New Scrape Job</h2>

        <div className="sa-form">
          <div className="sa-form-row">
            <label>Vendor</label>
            <select
              value={scrapeForm.vendor}
              onChange={(e) => setScrapeForm({ ...scrapeForm, vendor: e.target.value })}
              disabled={scraping}
            >
              <option value="whirlpool">Whirlpool Central</option>
            </select>
          </div>

          <div className="sa-form-row">
            <label>Job Type</label>
            <select
              value={scrapeForm.jobType}
              onChange={(e) => setScrapeForm({ ...scrapeForm, jobType: e.target.value })}
              disabled={scraping || scrapeForm.modelNumber}
            >
              <option value="full">Full Catalog</option>
              <option value="incremental">Incremental (New Only)</option>
            </select>
          </div>

          <div className="sa-form-row">
            <label>Category (Optional)</label>
            <select
              value={scrapeForm.category}
              onChange={(e) => setScrapeForm({ ...scrapeForm, category: e.target.value })}
              disabled={scraping || scrapeForm.modelNumber}
            >
              <option value="">All Categories</option>
              <option value="Cooking">Cooking</option>
              <option value="Cleaning">Cleaning</option>
              <option value="Refrigeration">Refrigeration</option>
              <option value="Laundry">Laundry</option>
            </select>
          </div>

          <div className="sa-form-row">
            <label>Single Model (Optional)</label>
            <input
              type="text"
              value={scrapeForm.modelNumber}
              onChange={(e) => setScrapeForm({ ...scrapeForm, modelNumber: e.target.value })}
              placeholder="e.g., WFW9620HW"
              disabled={scraping}
            />
          </div>

          <div className="sa-form-row">
            <label>Max Products per Category</label>
            <input
              type="number"
              value={scrapeForm.maxProducts}
              onChange={(e) => setScrapeForm({ ...scrapeForm, maxProducts: parseInt(e.target.value) })}
              min="1"
              max="5000"
              disabled={scraping}
            />
          </div>

          <div className="sa-form-row sa-checkbox">
            <label>
              <input
                type="checkbox"
                checked={scrapeForm.downloadImages}
                onChange={(e) => setScrapeForm({ ...scrapeForm, downloadImages: e.target.checked })}
                disabled={scraping}
              />
              Download and process images
            </label>
          </div>

          <button
            className="sa-start-btn"
            onClick={handleStartScrape}
            disabled={scraping}
          >
            {scraping ? 'Scraping in Progress...' : 'Start Scrape'}
          </button>
        </div>
      </div>

      {/* Vendor Status */}
      <div className="sa-section">
        <h2 className="sa-title">Vendor Status</h2>

        {loading ? (
          <div className="sa-loading">Loading status...</div>
        ) : status.length === 0 ? (
          <div className="sa-empty">No vendors configured</div>
        ) : (
          <div className="sa-vendors">
            {status.map((vendor, idx) => (
              <div key={idx} className="sa-vendor-card">
                <div className="sa-vendor-header">
                  <h3>{vendor.vendor}</h3>
                  <span className="sa-last-sync">
                    Last sync: {formatDate(vendor.lastSync)}
                  </span>
                </div>

                {vendor.recentJobs && vendor.recentJobs.length > 0 && (
                  <div className="sa-jobs">
                    <h4>Recent Jobs</h4>
                    <table className="sa-jobs-table">
                      <thead>
                        <tr>
                          <th>Type</th>
                          <th>Status</th>
                          <th>Products</th>
                          <th>Images</th>
                          <th>Started</th>
                          <th>Completed</th>
                        </tr>
                      </thead>
                      <tbody>
                        {vendor.recentJobs.map(job => (
                          <React.Fragment key={job.id}>
                            <tr>
                              <td>{job.job_type}</td>
                              <td>
                                <span
                                  className="sa-status-badge"
                                  style={{ background: getStatusColor(job.status) }}
                                >
                                  {job.status}
                                </span>
                              </td>
                              <td>
                                {job.products_scraped} / {job.products_found}
                                {job.products_failed > 0 && (
                                  <span className="sa-failed"> ({job.products_failed} failed)</span>
                                )}
                              </td>
                              <td>{job.images_downloaded}</td>
                              <td>{formatDate(job.started_at)}</td>
                              <td>{formatDate(job.completed_at)}</td>
                            </tr>
                            {job.status === 'failed' && job.error_log && (
                              <tr className="sa-error-row">
                                <td colSpan="6">
                                  <div className="sa-error-message">
                                    <strong>Error:</strong> {job.error_log}
                                  </div>
                                </td>
                              </tr>
                            )}
                          </React.Fragment>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
        </>
      )}

      {/* Manual Import Tab */}
      {activeTab === 'manual' && (
        <>
          <div className="sa-section">
            <h2 className="sa-title">Manual Product Import</h2>
            <p className="sa-description">
              Use this to manually add products when auto-scraping is blocked.
              You can use Comet or another AI assistant to gather product data and paste it here.
            </p>

            <div className="sa-form">
              <div className="sa-form-row">
                <label>Vendor *</label>
                <input
                  type="text"
                  value={manualForm.vendor}
                  onChange={(e) => setManualForm({ ...manualForm, vendor: e.target.value })}
                  placeholder="e.g., Whirlpool"
                  disabled={importing}
                />
              </div>

              <div className="sa-form-row">
                <label>Model Number *</label>
                <input
                  type="text"
                  value={manualForm.modelNumber}
                  onChange={(e) => setManualForm({ ...manualForm, modelNumber: e.target.value })}
                  placeholder="e.g., WFW9620HW"
                  disabled={importing}
                />
              </div>

              <div className="sa-form-row">
                <label>Product Name *</label>
                <input
                  type="text"
                  value={manualForm.name}
                  onChange={(e) => setManualForm({ ...manualForm, name: e.target.value })}
                  placeholder="e.g., Front Load Washer with Load & Go"
                  disabled={importing}
                />
              </div>

              <div className="sa-form-row">
                <label>Brand</label>
                <input
                  type="text"
                  value={manualForm.brand}
                  onChange={(e) => setManualForm({ ...manualForm, brand: e.target.value })}
                  placeholder="e.g., Whirlpool"
                  disabled={importing}
                />
              </div>

              <div className="sa-form-row">
                <label>Category</label>
                <input
                  type="text"
                  value={manualForm.category}
                  onChange={(e) => setManualForm({ ...manualForm, category: e.target.value })}
                  placeholder="e.g., Laundry"
                  disabled={importing}
                />
              </div>

              <div className="sa-form-row">
                <label>Subcategory</label>
                <input
                  type="text"
                  value={manualForm.subcategory}
                  onChange={(e) => setManualForm({ ...manualForm, subcategory: e.target.value })}
                  placeholder="e.g., Washers"
                  disabled={importing}
                />
              </div>

              <div className="sa-form-grid">
                <div className="sa-form-row">
                  <label>MSRP ($)</label>
                  <input
                    type="number"
                    value={manualForm.msrp}
                    onChange={(e) => setManualForm({ ...manualForm, msrp: e.target.value })}
                    placeholder="e.g., 1299.99"
                    disabled={importing}
                  />
                </div>

                <div className="sa-form-row">
                  <label>Dealer Price ($)</label>
                  <input
                    type="number"
                    value={manualForm.dealerPrice}
                    onChange={(e) => setManualForm({ ...manualForm, dealerPrice: e.target.value })}
                    placeholder="e.g., 999.99"
                    disabled={importing}
                  />
                </div>
              </div>

              <div className="sa-form-row">
                <label>Description</label>
                <textarea
                  value={manualForm.description}
                  onChange={(e) => setManualForm({ ...manualForm, description: e.target.value })}
                  placeholder="Product description..."
                  rows={3}
                  disabled={importing}
                />
              </div>

              <div className="sa-form-row">
                <label>Image URLs (one per line)</label>
                <textarea
                  value={manualForm.imageUrls}
                  onChange={(e) => setManualForm({ ...manualForm, imageUrls: e.target.value })}
                  placeholder="https://example.com/image1.jpg&#10;https://example.com/image2.jpg"
                  rows={4}
                  disabled={importing}
                />
              </div>

              <button
                className="sa-start-btn"
                onClick={handleManualImport}
                disabled={importing}
              >
                {importing ? 'Importing...' : 'Import Product'}
              </button>
            </div>
          </div>

          <div className="sa-section">
            <h2 className="sa-title">Bulk Import (JSON)</h2>
            <p className="sa-description">
              Paste JSON data for multiple products. Use Comet to generate this from websites.
            </p>

            <div className="sa-form">
              <div className="sa-form-row">
                <label>JSON Data</label>
                <textarea
                  value={bulkJson}
                  onChange={(e) => setBulkJson(e.target.value)}
                  placeholder={`[
  {
    "vendor": "Whirlpool",
    "modelNumber": "WFW9620HW",
    "name": "Front Load Washer",
    "brand": "Whirlpool",
    "category": "Laundry",
    "msrp": 1299.99,
    "imageUrls": ["https://example.com/image.jpg"]
  }
]`}
                  rows={12}
                  disabled={importing}
                  style={{ fontFamily: 'monospace', fontSize: '12px' }}
                />
              </div>

              <button
                className="sa-start-btn"
                onClick={handleBulkImport}
                disabled={importing}
              >
                {importing ? 'Importing...' : 'Bulk Import'}
              </button>
            </div>
          </div>
        </>
      )}

      <style jsx>{`
        .scraper-admin {
          padding: 20px;
        }

        .sa-tabs {
          display: flex;
          gap: 4px;
          margin-bottom: 24px;
          border-bottom: 2px solid #e0e0e0;
        }

        .sa-tab {
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

        .sa-tab:hover {
          color: #2196F3;
        }

        .sa-tab.active {
          color: #2196F3;
          border-bottom-color: #2196F3;
        }

        .sa-section {
          margin-bottom: 32px;
        }

        .sa-title {
          font-size: 18px;
          font-weight: 600;
          color: #1a1a2e;
          margin: 0 0 20px 0;
          padding-bottom: 12px;
          border-bottom: 1px solid #eee;
        }

        .sa-description {
          color: #666;
          font-size: 14px;
          margin-bottom: 20px;
          line-height: 1.5;
        }

        .sa-form {
          max-width: 600px;
        }

        .sa-form-grid {
          display: grid;
          grid-template-columns: 1fr 1fr;
          gap: 16px;
        }

        .sa-form-row {
          margin-bottom: 16px;
        }

        .sa-form-row label {
          display: block;
          font-size: 14px;
          font-weight: 500;
          color: #444;
          margin-bottom: 6px;
        }

        .sa-form-row select,
        .sa-form-row input[type="text"],
        .sa-form-row input[type="number"],
        .sa-form-row textarea {
          width: 100%;
          padding: 10px 12px;
          border: 1px solid #ddd;
          border-radius: 6px;
          font-size: 14px;
          box-sizing: border-box;
        }

        .sa-form-row textarea {
          resize: vertical;
          min-height: 80px;
        }

        .sa-form-row select:disabled,
        .sa-form-row input:disabled,
        .sa-form-row textarea:disabled {
          background: #f5f5f5;
          color: #999;
        }

        .sa-checkbox label {
          display: flex;
          align-items: center;
          gap: 8px;
          cursor: pointer;
        }

        .sa-checkbox input {
          width: 18px;
          height: 18px;
        }

        .sa-start-btn {
          width: 100%;
          padding: 14px;
          background: #2196F3;
          color: white;
          border: none;
          border-radius: 6px;
          font-size: 16px;
          font-weight: 500;
          cursor: pointer;
          transition: all 0.2s;
        }

        .sa-start-btn:hover:not(:disabled) {
          background: #1976D2;
        }

        .sa-start-btn:disabled {
          background: #90CAF9;
          cursor: not-allowed;
        }

        .sa-loading, .sa-empty {
          text-align: center;
          padding: 40px;
          color: #666;
        }

        .sa-vendors {
          display: flex;
          flex-direction: column;
          gap: 20px;
        }

        .sa-vendor-card {
          border: 1px solid #e0e0e0;
          border-radius: 8px;
          padding: 20px;
        }

        .sa-vendor-header {
          display: flex;
          justify-content: space-between;
          align-items: center;
          margin-bottom: 16px;
        }

        .sa-vendor-header h3 {
          margin: 0;
          font-size: 16px;
          color: #1a1a2e;
        }

        .sa-last-sync {
          font-size: 13px;
          color: #888;
        }

        .sa-jobs h4 {
          font-size: 14px;
          font-weight: 500;
          color: #666;
          margin: 0 0 12px 0;
        }

        .sa-jobs-table {
          width: 100%;
          border-collapse: collapse;
          font-size: 13px;
        }

        .sa-jobs-table th {
          text-align: left;
          padding: 8px;
          background: #f9f9f9;
          font-weight: 500;
          color: #666;
        }

        .sa-jobs-table td {
          padding: 8px;
          border-top: 1px solid #eee;
        }

        .sa-status-badge {
          display: inline-block;
          padding: 2px 8px;
          border-radius: 10px;
          color: white;
          font-size: 11px;
          text-transform: uppercase;
        }

        .sa-failed {
          color: #f44336;
          font-size: 11px;
        }

        .sa-error-row {
          background: #fff3f3;
        }

        .sa-error-row td {
          border-top: none !important;
          padding-top: 0 !important;
        }

        .sa-error-message {
          padding: 8px 12px;
          background: #ffebee;
          border-radius: 4px;
          color: #c62828;
          font-size: 12px;
          line-height: 1.4;
          word-break: break-word;
          max-height: 80px;
          overflow-y: auto;
        }

        .sa-error-message strong {
          color: #b71c1c;
        }
      `}</style>
    </div>
  );
}

export default ScraperAdmin;
