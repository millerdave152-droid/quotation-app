import React, { useState, useEffect } from 'react';

const API_BASE = '/api';

/**
 * ScraperAdmin - Admin panel for managing and running scrape jobs
 */
function ScraperAdmin({ onJobComplete }) {
  const [status, setStatus] = useState([]);
  const [loading, setLoading] = useState(true);
  const [scraping, setScraping] = useState(false);
  const [scrapeForm, setScrapeForm] = useState({
    vendor: 'whirlpool',
    jobType: 'full',
    category: '',
    modelNumber: '',
    downloadImages: true,
    maxProducts: 500
  });

  useEffect(() => {
    fetchStatus();
    // Refresh status every 10 seconds while scraping
    const interval = setInterval(() => {
      if (scraping) {
        fetchStatus();
      }
    }, 10000);
    return () => clearInterval(interval);
  }, [scraping]);

  const fetchStatus = async () => {
    try {
      const response = await fetch(`${API_BASE}/vendor-products/scrape/status`);
      if (response.ok) {
        const data = await response.json();
        setStatus(data);

        // Check if any jobs are running
        const hasRunningJob = data.some(v =>
          v.recentJobs?.some(j => j.status === 'running')
        );
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
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body)
      });

      if (response.ok) {
        const result = await response.json();
        alert(`Scrape job started: ${result.message}`);
        fetchStatus();
      } else {
        const error = await response.json();
        alert(`Failed to start scrape: ${error.error}`);
        setScraping(false);
      }
    } catch (error) {
      alert(`Error: ${error.message}`);
      setScraping(false);
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
                          <tr key={job.id}>
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

      <style jsx>{`
        .scraper-admin {
          padding: 20px;
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

        .sa-form {
          max-width: 500px;
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
        .sa-form-row input[type="number"] {
          width: 100%;
          padding: 10px 12px;
          border: 1px solid #ddd;
          border-radius: 6px;
          font-size: 14px;
        }

        .sa-form-row select:disabled,
        .sa-form-row input:disabled {
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
      `}</style>
    </div>
  );
}

export default ScraperAdmin;
