import { authFetch } from '../../services/authFetch';
/**
 * NomenclatureAdmin.jsx
 * Admin dashboard for managing nomenclature data and scrape jobs
 */

import React, { useState, useEffect, useCallback } from 'react';

const API_BASE = process.env.REACT_APP_API_URL || 'http://localhost:3001';

const NomenclatureAdmin = () => {
  // State
  const [templates, setTemplates] = useState([]);
  const [scrapeJobs, setScrapeJobs] = useState([]);
  const [changes, setChanges] = useState([]);
  const [currentJob, setCurrentJob] = useState(null);
  const [loading, setLoading] = useState(true);
  const [scraping, setScraping] = useState(false);
  const [activeTab, setActiveTab] = useState('overview');
  const [selectedBrand, setSelectedBrand] = useState('');

  // Fetch data
  const fetchData = useCallback(async () => {
    try {
      setLoading(true);
      const token = localStorage.getItem('auth_token');
      const headers = { 'Authorization': `Bearer ${token}` };

      // Fetch templates
      const templatesRes = await authFetch(`${API_BASE}/api/nomenclature/templates`, { headers });
      if (templatesRes.ok) {
        const data = await templatesRes.json();
        if (data.success) setTemplates(data.data);
      }

      // Fetch scrape history
      const jobsRes = await authFetch(`${API_BASE}/api/nomenclature/scrape/history`, { headers });
      if (jobsRes.ok) {
        const data = await jobsRes.json();
        if (data.success) setScrapeJobs(data.data);
      }

      // Fetch recent changes
      const changesRes = await authFetch(`${API_BASE}/api/nomenclature/changes?limit=20`, { headers });
      if (changesRes.ok) {
        const data = await changesRes.json();
        if (data.success) setChanges(data.data);
      }

      // Check current job status
      const statusRes = await authFetch(`${API_BASE}/api/nomenclature/scrape/status`, { headers });
      if (statusRes.ok) {
        const data = await statusRes.json();
        if (data.success && data.data?.status === 'running') {
          setCurrentJob(data.data);
          setScraping(true);
        }
      }

    } catch (err) {
      console.error('Error fetching admin data:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  // Poll for job status while scraping
  useEffect(() => {
    if (!scraping || !currentJob) return;

    const interval = setInterval(async () => {
      try {
        const token = localStorage.getItem('auth_token');
        const res = await authFetch(`${API_BASE}/api/nomenclature/scrape/status/${currentJob.id}`, {
          headers: { 'Authorization': `Bearer ${token}` }
        });

        if (res.ok) {
          const data = await res.json();
          if (data.success) {
            setCurrentJob(data.data);
            if (data.data.status !== 'running') {
              setScraping(false);
              fetchData(); // Refresh all data
            }
          }
        }
      } catch (err) {
        console.error('Error polling job status:', err);
      }
    }, 5000);

    return () => clearInterval(interval);
  }, [scraping, currentJob, fetchData]);

  // Start full scrape
  const startFullScrape = async () => {
    try {
      setScraping(true);
      const token = localStorage.getItem('auth_token');
      const res = await authFetch(`${API_BASE}/api/nomenclature/scrape/start`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        }
      });

      if (res.ok) {
        const data = await res.json();
        if (data.success) {
          setCurrentJob({ id: data.data.jobId, status: 'running' });
        }
      }
    } catch (err) {
      console.error('Error starting scrape:', err);
      setScraping(false);
    }
  };

  // Start brand scrape
  const startBrandScrape = async (brand) => {
    try {
      setScraping(true);
      const token = localStorage.getItem('auth_token');
      const res = await authFetch(`${API_BASE}/api/nomenclature/scrape/brand/${encodeURIComponent(brand)}`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        }
      });

      if (res.ok) {
        const data = await res.json();
        if (data.success) {
          setCurrentJob({ id: data.data.jobId, status: 'running' });
        }
      }
    } catch (err) {
      console.error('Error starting brand scrape:', err);
      setScraping(false);
    }
  };

  // Export training data
  const exportTrainingData = async () => {
    try {
      const token = localStorage.getItem('auth_token');
      const res = await authFetch(`${API_BASE}/api/nomenclature/training-data`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });

      if (res.ok) {
        const data = await res.json();
        const blob = new Blob([JSON.stringify(data.data, null, 2)], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `nomenclature-training-data-${new Date().toISOString().split('T')[0]}.json`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
      }
    } catch (err) {
      console.error('Error exporting training data:', err);
    }
  };

  // Group templates by manufacturer
  const templatesByManufacturer = templates.reduce((acc, t) => {
    if (!acc[t.manufacturer]) acc[t.manufacturer] = [];
    acc[t.manufacturer].push(t);
    return acc;
  }, {});

  const manufacturers = Object.keys(templatesByManufacturer).sort();

  // Tab styles
  const tabStyle = (isActive) => ({
    padding: '10px 20px',
    fontSize: '14px',
    fontWeight: isActive ? '600' : '500',
    color: isActive ? '#4f46e5' : '#6b7280',
    backgroundColor: isActive ? '#eef2ff' : 'transparent',
    border: 'none',
    borderBottom: isActive ? '2px solid #4f46e5' : '2px solid transparent',
    cursor: 'pointer'
  });

  if (loading) {
    return (
      <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '400px' }}>
        <div style={{ textAlign: 'center' }}>
          <div style={{ fontSize: '32px', marginBottom: '16px' }}>Loading...</div>
        </div>
      </div>
    );
  }

  return (
    <div style={{ padding: '24px', maxWidth: '1400px', margin: '0 auto' }}>
      {/* Header */}
      <div style={{ marginBottom: '24px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div>
          <h1 style={{ fontSize: '24px', fontWeight: '700', color: '#111827', marginBottom: '4px' }}>
            Nomenclature Admin
          </h1>
          <p style={{ color: '#6b7280', fontSize: '14px' }}>
            Manage SKU nomenclature data and scraping
          </p>
        </div>
        <div style={{ display: 'flex', gap: '12px' }}>
          <button
            onClick={exportTrainingData}
            style={{
              padding: '10px 20px',
              fontSize: '14px',
              backgroundColor: 'white',
              color: '#374151',
              border: '1px solid #e5e7eb',
              borderRadius: '8px',
              cursor: 'pointer'
            }}
          >
            Export Training Data
          </button>
          <button
            onClick={startFullScrape}
            disabled={scraping}
            style={{
              padding: '10px 20px',
              fontSize: '14px',
              fontWeight: '600',
              backgroundColor: scraping ? '#9ca3af' : '#4f46e5',
              color: 'white',
              border: 'none',
              borderRadius: '8px',
              cursor: scraping ? 'not-allowed' : 'pointer'
            }}
          >
            {scraping ? 'Scraping...' : 'Start Full Scrape'}
          </button>
        </div>
      </div>

      {/* Current Job Status */}
      {currentJob && currentJob.status === 'running' && (
        <div style={{
          backgroundColor: '#fef3c7',
          border: '1px solid #fcd34d',
          borderRadius: '8px',
          padding: '16px',
          marginBottom: '24px',
          display: 'flex',
          alignItems: 'center',
          gap: '12px'
        }}>
          <div style={{ fontSize: '24px' }}>
            <span style={{ animation: 'spin 1s linear infinite', display: 'inline-block' }}>
              &#x21BB;
            </span>
          </div>
          <div>
            <div style={{ fontWeight: '600', color: '#92400e' }}>Scrape in Progress</div>
            <div style={{ fontSize: '13px', color: '#a16207' }}>
              Templates: {currentJob.templates_created || 0} | Rules: {currentJob.rules_created || 0} | Codes: {currentJob.codes_created || 0}
            </div>
          </div>
        </div>
      )}

      {/* Stats Cards */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
        gap: '16px',
        marginBottom: '24px'
      }}>
        <div style={{
          backgroundColor: 'white',
          borderRadius: '12px',
          padding: '20px',
          boxShadow: '0 1px 3px rgba(0,0,0,0.1)'
        }}>
          <div style={{ fontSize: '32px', fontWeight: '700', color: '#4f46e5' }}>
            {templates.length}
          </div>
          <div style={{ fontSize: '14px', color: '#6b7280' }}>Templates</div>
        </div>
        <div style={{
          backgroundColor: 'white',
          borderRadius: '12px',
          padding: '20px',
          boxShadow: '0 1px 3px rgba(0,0,0,0.1)'
        }}>
          <div style={{ fontSize: '32px', fontWeight: '700', color: '#059669' }}>
            {manufacturers.length}
          </div>
          <div style={{ fontSize: '14px', color: '#6b7280' }}>Brands</div>
        </div>
        <div style={{
          backgroundColor: 'white',
          borderRadius: '12px',
          padding: '20px',
          boxShadow: '0 1px 3px rgba(0,0,0,0.1)'
        }}>
          <div style={{ fontSize: '32px', fontWeight: '700', color: '#f59e0b' }}>
            {templates.filter(t => t.is_scraped).length}
          </div>
          <div style={{ fontSize: '14px', color: '#6b7280' }}>Scraped</div>
        </div>
        <div style={{
          backgroundColor: 'white',
          borderRadius: '12px',
          padding: '20px',
          boxShadow: '0 1px 3px rgba(0,0,0,0.1)'
        }}>
          <div style={{ fontSize: '32px', fontWeight: '700', color: '#6b7280' }}>
            {scrapeJobs.length}
          </div>
          <div style={{ fontSize: '14px', color: '#6b7280' }}>Scrape Jobs</div>
        </div>
      </div>

      {/* Tabs */}
      <div style={{
        backgroundColor: 'white',
        borderRadius: '12px',
        boxShadow: '0 1px 3px rgba(0,0,0,0.1)',
        overflow: 'hidden'
      }}>
        <div style={{ display: 'flex', borderBottom: '1px solid #e5e7eb' }}>
          <button onClick={() => setActiveTab('overview')} style={tabStyle(activeTab === 'overview')}>
            Overview
          </button>
          <button onClick={() => setActiveTab('templates')} style={tabStyle(activeTab === 'templates')}>
            Templates
          </button>
          <button onClick={() => setActiveTab('jobs')} style={tabStyle(activeTab === 'jobs')}>
            Scrape Jobs
          </button>
          <button onClick={() => setActiveTab('changes')} style={tabStyle(activeTab === 'changes')}>
            Change Log
          </button>
        </div>

        <div style={{ padding: '20px' }}>
          {/* Overview Tab */}
          {activeTab === 'overview' && (
            <div>
              <h3 style={{ fontSize: '16px', fontWeight: '600', marginBottom: '16px' }}>
                Templates by Brand
              </h3>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(250px, 1fr))', gap: '16px' }}>
                {manufacturers.map(mfr => (
                  <div
                    key={mfr}
                    style={{
                      border: '1px solid #e5e7eb',
                      borderRadius: '8px',
                      padding: '16px'
                    }}
                  >
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
                      <span style={{ fontWeight: '600', color: '#111827' }}>{mfr}</span>
                      <button
                        onClick={() => startBrandScrape(mfr.toLowerCase())}
                        disabled={scraping}
                        style={{
                          padding: '4px 8px',
                          fontSize: '12px',
                          backgroundColor: scraping ? '#e5e7eb' : '#eef2ff',
                          color: scraping ? '#9ca3af' : '#4f46e5',
                          border: 'none',
                          borderRadius: '4px',
                          cursor: scraping ? 'not-allowed' : 'pointer'
                        }}
                      >
                        Scrape
                      </button>
                    </div>
                    <div style={{ fontSize: '13px', color: '#6b7280' }}>
                      {templatesByManufacturer[mfr].map(t => (
                        <div key={t.id} style={{ display: 'flex', justifyContent: 'space-between', padding: '4px 0' }}>
                          <span>{t.product_type}</span>
                          {t.is_scraped && (
                            <span style={{ color: '#059669', fontSize: '12px' }}>Scraped</span>
                          )}
                        </div>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Templates Tab */}
          {activeTab === 'templates' && (
            <div>
              <div style={{ marginBottom: '16px' }}>
                <select
                  value={selectedBrand}
                  onChange={(e) => setSelectedBrand(e.target.value)}
                  style={{
                    padding: '8px 12px',
                    border: '1px solid #e5e7eb',
                    borderRadius: '6px',
                    fontSize: '14px'
                  }}
                >
                  <option value="">All Brands</option>
                  {manufacturers.map(mfr => (
                    <option key={mfr} value={mfr}>{mfr}</option>
                  ))}
                </select>
              </div>
              <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                <thead>
                  <tr style={{ backgroundColor: '#f9fafb' }}>
                    <th style={{ padding: '12px', textAlign: 'left', fontSize: '12px', fontWeight: '600', color: '#6b7280' }}>Manufacturer</th>
                    <th style={{ padding: '12px', textAlign: 'left', fontSize: '12px', fontWeight: '600', color: '#6b7280' }}>Product Type</th>
                    <th style={{ padding: '12px', textAlign: 'left', fontSize: '12px', fontWeight: '600', color: '#6b7280' }}>Template Name</th>
                    <th style={{ padding: '12px', textAlign: 'left', fontSize: '12px', fontWeight: '600', color: '#6b7280' }}>Scraped</th>
                    <th style={{ padding: '12px', textAlign: 'left', fontSize: '12px', fontWeight: '600', color: '#6b7280' }}>Version</th>
                  </tr>
                </thead>
                <tbody>
                  {templates
                    .filter(t => !selectedBrand || t.manufacturer === selectedBrand)
                    .map(template => (
                      <tr key={template.id} style={{ borderBottom: '1px solid #e5e7eb' }}>
                        <td style={{ padding: '12px', fontSize: '14px' }}>{template.manufacturer}</td>
                        <td style={{ padding: '12px', fontSize: '14px' }}>{template.product_type}</td>
                        <td style={{ padding: '12px', fontSize: '14px' }}>{template.template_name}</td>
                        <td style={{ padding: '12px' }}>
                          {template.is_scraped ? (
                            <span style={{ color: '#059669', fontWeight: '500' }}>Yes</span>
                          ) : (
                            <span style={{ color: '#9ca3af' }}>No</span>
                          )}
                        </td>
                        <td style={{ padding: '12px', fontSize: '14px' }}>{template.version || 1}</td>
                      </tr>
                    ))}
                </tbody>
              </table>
            </div>
          )}

          {/* Jobs Tab */}
          {activeTab === 'jobs' && (
            <div>
              <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                <thead>
                  <tr style={{ backgroundColor: '#f9fafb' }}>
                    <th style={{ padding: '12px', textAlign: 'left', fontSize: '12px', fontWeight: '600', color: '#6b7280' }}>ID</th>
                    <th style={{ padding: '12px', textAlign: 'left', fontSize: '12px', fontWeight: '600', color: '#6b7280' }}>Type</th>
                    <th style={{ padding: '12px', textAlign: 'left', fontSize: '12px', fontWeight: '600', color: '#6b7280' }}>Status</th>
                    <th style={{ padding: '12px', textAlign: 'left', fontSize: '12px', fontWeight: '600', color: '#6b7280' }}>Templates</th>
                    <th style={{ padding: '12px', textAlign: 'left', fontSize: '12px', fontWeight: '600', color: '#6b7280' }}>Rules</th>
                    <th style={{ padding: '12px', textAlign: 'left', fontSize: '12px', fontWeight: '600', color: '#6b7280' }}>Codes</th>
                    <th style={{ padding: '12px', textAlign: 'left', fontSize: '12px', fontWeight: '600', color: '#6b7280' }}>Started</th>
                  </tr>
                </thead>
                <tbody>
                  {scrapeJobs.map(job => (
                    <tr key={job.id} style={{ borderBottom: '1px solid #e5e7eb' }}>
                      <td style={{ padding: '12px', fontSize: '14px' }}>{job.id}</td>
                      <td style={{ padding: '12px', fontSize: '14px' }}>{job.job_type}</td>
                      <td style={{ padding: '12px' }}>
                        <span style={{
                          padding: '4px 8px',
                          borderRadius: '4px',
                          fontSize: '12px',
                          fontWeight: '500',
                          backgroundColor: job.status === 'completed' ? '#d1fae5' : job.status === 'running' ? '#fef3c7' : '#fee2e2',
                          color: job.status === 'completed' ? '#059669' : job.status === 'running' ? '#d97706' : '#dc2626'
                        }}>
                          {job.status}
                        </span>
                      </td>
                      <td style={{ padding: '12px', fontSize: '14px' }}>{job.templates_created || 0}</td>
                      <td style={{ padding: '12px', fontSize: '14px' }}>{job.rules_created || 0}</td>
                      <td style={{ padding: '12px', fontSize: '14px' }}>{job.codes_created || 0}</td>
                      <td style={{ padding: '12px', fontSize: '14px' }}>
                        {job.started_at ? new Date(job.started_at).toLocaleString() : '-'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {/* Changes Tab */}
          {activeTab === 'changes' && (
            <div>
              {changes.length === 0 ? (
                <div style={{ textAlign: 'center', padding: '40px', color: '#6b7280' }}>
                  No changes recorded yet
                </div>
              ) : (
                <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                  <thead>
                    <tr style={{ backgroundColor: '#f9fafb' }}>
                      <th style={{ padding: '12px', textAlign: 'left', fontSize: '12px', fontWeight: '600', color: '#6b7280' }}>Date</th>
                      <th style={{ padding: '12px', textAlign: 'left', fontSize: '12px', fontWeight: '600', color: '#6b7280' }}>Type</th>
                      <th style={{ padding: '12px', textAlign: 'left', fontSize: '12px', fontWeight: '600', color: '#6b7280' }}>Change</th>
                      <th style={{ padding: '12px', textAlign: 'left', fontSize: '12px', fontWeight: '600', color: '#6b7280' }}>Manufacturer</th>
                      <th style={{ padding: '12px', textAlign: 'left', fontSize: '12px', fontWeight: '600', color: '#6b7280' }}>Field</th>
                    </tr>
                  </thead>
                  <tbody>
                    {changes.map(change => (
                      <tr key={change.id} style={{ borderBottom: '1px solid #e5e7eb' }}>
                        <td style={{ padding: '12px', fontSize: '14px' }}>
                          {new Date(change.detected_at).toLocaleString()}
                        </td>
                        <td style={{ padding: '12px', fontSize: '14px' }}>{change.entity_type}</td>
                        <td style={{ padding: '12px' }}>
                          <span style={{
                            padding: '2px 8px',
                            borderRadius: '4px',
                            fontSize: '12px',
                            backgroundColor: change.change_type === 'added' ? '#d1fae5' : change.change_type === 'modified' ? '#fef3c7' : '#fee2e2',
                            color: change.change_type === 'added' ? '#059669' : change.change_type === 'modified' ? '#d97706' : '#dc2626'
                          }}>
                            {change.change_type}
                          </span>
                        </td>
                        <td style={{ padding: '12px', fontSize: '14px' }}>{change.manufacturer}</td>
                        <td style={{ padding: '12px', fontSize: '14px' }}>{change.field_name || '-'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          )}
        </div>
      </div>

      {/* CSS for spinner animation */}
      <style>{`
        @keyframes spin {
          from { transform: rotate(0deg); }
          to { transform: rotate(360deg); }
        }
      `}</style>
    </div>
  );
};

export default NomenclatureAdmin;
