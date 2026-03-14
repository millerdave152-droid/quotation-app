import React, { useState, useEffect, useMemo } from 'react';
import { authFetch } from '../../services/authFetch';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer,
  LineChart, Line, PieChart, Pie, Cell
} from 'recharts';
import {
  FileBarChart, Play, Save, Trash2, Calendar, Clock, CheckCircle,
  Layout, BookOpen, RefreshCw, ChevronRight, Mail, X, Download, Printer
} from 'lucide-react';

const API_URL = process.env.REACT_APP_API_URL || '';

const api = {
  get: async (url) => {
    const response = await authFetch(`${API_URL}${url}`);
    return { data: await response.json() };
  },
  post: async (url, data) => {
    const response = await authFetch(`${API_URL}${url}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data)
    });
    return { data: await response.json() };
  },
  put: async (url, data) => {
    const response = await authFetch(`${API_URL}${url}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data)
    });
    return { data: await response.json() };
  },
  delete: async (url) => {
    const response = await authFetch(`${API_URL}${url}`, { method: 'DELETE' });
    return { data: await response.json() };
  }
};

const CHART_COLORS = ['#6366f1', '#22c55e', '#f59e0b', '#ef4444', '#3b82f6', '#8b5cf6', '#14b8a6', '#ec4899'];

// Shared styles
const card = {
  background: 'white', borderRadius: '12px', padding: '24px',
  border: '1px solid #e5e7eb', boxShadow: '0 1px 3px rgba(0,0,0,0.06)'
};
const inputStyle = {
  width: '100%', padding: '8px 12px',
  border: '1px solid #d1d5db', borderRadius: '8px',
  fontSize: '14px', color: '#111827', background: 'white',
  outline: 'none', boxSizing: 'border-box'
};
const thStyle = {
  padding: '10px 14px', textAlign: 'left', fontSize: '11px',
  fontWeight: '600', color: '#6b7280', textTransform: 'uppercase',
  letterSpacing: '0.05em', background: '#f9fafb'
};
const tdStyle = {
  padding: '10px 14px', fontSize: '13px', color: '#374151',
  whiteSpace: 'nowrap'
};
const btnPrimary = {
  padding: '8px 16px', background: '#2563eb', color: 'white',
  border: 'none', borderRadius: '8px', cursor: 'pointer',
  fontSize: '13px', fontWeight: '500', display: 'inline-flex',
  alignItems: 'center', gap: '6px'
};
const btnSecondary = {
  padding: '8px 16px', background: '#f3f4f6', color: '#374151',
  border: '1px solid #d1d5db', borderRadius: '8px', cursor: 'pointer',
  fontSize: '13px', fontWeight: '500', display: 'inline-flex',
  alignItems: 'center', gap: '6px'
};
const sectionTitle = {
  fontSize: '14px', fontWeight: '600', color: '#111827', margin: '0 0 12px'
};
const labelStyle = {
  display: 'block', fontSize: '13px', fontWeight: '500',
  color: '#374151', marginBottom: '4px'
};

const ReportBuilder = () => {
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState('builder');
  const [metrics, setMetrics] = useState([]);
  const [dimensions, setDimensions] = useState([]);
  const [prebuiltTemplates, setPrebuiltTemplates] = useState([]);
  const [savedTemplates, setSavedTemplates] = useState([]);
  const [scheduledReports, setScheduledReports] = useState([]);

  const [selectedMetrics, setSelectedMetrics] = useState([]);
  const [selectedDimension, setSelectedDimension] = useState(null);
  const [chartType, setChartType] = useState('bar');
  const [dateRange, setDateRange] = useState({ start: null, end: null });
  const [filters, setFilters] = useState({});

  const [reportResult, setReportResult] = useState(null);
  const [executing, setExecuting] = useState(false);

  const [showSaveDialog, setShowSaveDialog] = useState(false);
  const [templateName, setTemplateName] = useState('');
  const [templateDescription, setTemplateDescription] = useState('');
  const [isPublic, setIsPublic] = useState(false);

  const [showScheduleDialog, setShowScheduleDialog] = useState(false);
  const [scheduleType, setScheduleType] = useState('weekly');
  const [scheduleConfig, setScheduleConfig] = useState({ time: '08:00', dayOfWeek: 1 });
  const [recipients, setRecipients] = useState('');
  const [selectedTemplateForSchedule, setSelectedTemplateForSchedule] = useState(null);

  useEffect(() => { fetchMetadata(); }, []);

  const fetchMetadata = async () => {
    setLoading(true);
    try {
      const [metricsRes, dimensionsRes, prebuiltRes, templatesRes, scheduledRes] = await Promise.all([
        api.get('/api/reports/metrics'),
        api.get('/api/reports/dimensions'),
        api.get('/api/reports/prebuilt'),
        api.get('/api/reports/templates'),
        api.get('/api/reports/scheduled')
      ]);
      setMetrics(metricsRes.data.data || []);
      setDimensions(dimensionsRes.data.data || []);
      setPrebuiltTemplates(prebuiltRes.data.data || []);
      setSavedTemplates(templatesRes.data.data || []);
      setScheduledReports(scheduledRes.data.data || []);
    } catch (error) {
      console.error('Error fetching report metadata:', error);
    } finally {
      setLoading(false);
    }
  };

  const executeReport = async () => {
    if (selectedMetrics.length === 0) { alert('Please select at least one metric'); return; }
    setExecuting(true);
    try {
      const response = await api.post('/api/reports/execute', {
        config: {
          metrics: selectedMetrics,
          dimensions: selectedDimension,
          dateRange: dateRange.start ? dateRange : null,
          filters
        }
      });
      setReportResult(response.data.data);
    } catch (error) {
      console.error('Error executing report:', error);
      alert('Failed to execute report');
    } finally {
      setExecuting(false);
    }
  };

  const saveTemplate = async () => {
    if (!templateName.trim()) { alert('Please enter a template name'); return; }
    try {
      await api.post('/api/reports/templates', {
        name: templateName, description: templateDescription,
        config: { metrics: selectedMetrics, dimensions: selectedDimension, chartType, filters },
        isPublic
      });
      setShowSaveDialog(false);
      setTemplateName('');
      setTemplateDescription('');
      fetchMetadata();
    } catch (error) {
      console.error('Error saving template:', error);
      alert('Failed to save template');
    }
  };

  const loadTemplate = (template) => {
    const config = typeof template.config === 'string' ? JSON.parse(template.config) : template.config;
    setSelectedMetrics(config.metrics || []);
    setSelectedDimension(config.dimensions || null);
    setChartType(config.chartType || 'bar');
    setFilters(config.filters || {});
    setActiveTab('builder');
  };

  const deleteTemplate = async (templateId) => {
    if (!window.confirm('Delete this template?')) return;
    try {
      await api.delete(`/api/reports/templates/${templateId}`);
      fetchMetadata();
    } catch (error) {
      console.error('Error deleting template:', error);
    }
  };

  const scheduleReport = async () => {
    if (!selectedTemplateForSchedule) { alert('Please select a template to schedule'); return; }
    const recipientList = recipients.split(',').map(e => e.trim()).filter(Boolean);
    if (recipientList.length === 0) { alert('Please enter at least one recipient email'); return; }
    try {
      await api.post('/api/reports/scheduled', {
        templateId: selectedTemplateForSchedule, scheduleType,
        scheduleConfig, recipients: recipientList
      });
      setShowScheduleDialog(false);
      setRecipients('');
      setSelectedTemplateForSchedule(null);
      fetchMetadata();
    } catch (error) {
      console.error('Error scheduling report:', error);
      alert('Failed to schedule report');
    }
  };

  const toggleMetric = (metricId) => {
    setSelectedMetrics(prev =>
      prev.includes(metricId) ? prev.filter(m => m !== metricId) : [...prev, metricId]
    );
  };

  const groupedMetrics = useMemo(() => {
    const groups = {};
    metrics.forEach(m => {
      if (!groups[m.category]) groups[m.category] = [];
      groups[m.category].push(m);
    });
    return groups;
  }, [metrics]);

  const formatCurrency = (value) => {
    if (value === null || value === undefined) return '-';
    return new Intl.NumberFormat('en-US', {
      style: 'currency', currency: 'USD',
      minimumFractionDigits: 0, maximumFractionDigits: 0
    }).format(value);
  };

  const isCurrencyMetric = (id) =>
    id.includes('Revenue') || id.includes('Value') || id.includes('Amount');

  const formatMetricValue = (id, val) =>
    isCurrencyMetric(id) ? formatCurrency(val) : typeof val === 'number' ? val.toFixed(1) : val;

  // ==================== RENDER CHART ====================
  const renderChart = () => {
    if (!reportResult?.data?.rows || reportResult.data.rows.length === 0) {
      return (
        <div style={{
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          height: '240px', background: '#f9fafb', borderRadius: '8px', color: '#9ca3af'
        }}>
          No data to display
        </div>
      );
    }

    const data = reportResult.data.rows;

    if (chartType === 'pie' && selectedMetrics.length === 1) {
      return (
        <ResponsiveContainer width="100%" height={300}>
          <PieChart>
            <Pie data={data} dataKey={selectedMetrics[0]} nameKey="dimension"
              cx="50%" cy="50%" outerRadius={100} fill="#8884d8" label>
              {data.map((_, index) => (
                <Cell key={`cell-${index}`} fill={CHART_COLORS[index % CHART_COLORS.length]} />
              ))}
            </Pie>
            <Tooltip />
            <Legend />
          </PieChart>
        </ResponsiveContainer>
      );
    }

    if (chartType === 'line') {
      return (
        <ResponsiveContainer width="100%" height={300}>
          <LineChart data={data}>
            <CartesianGrid strokeDasharray="3 3" />
            <XAxis dataKey="dimension" />
            <YAxis />
            <Tooltip />
            <Legend />
            {selectedMetrics.map((metricId, idx) => (
              <Line key={metricId} type="monotone" dataKey={metricId}
                name={metrics.find(m => m.id === metricId)?.name || metricId}
                stroke={CHART_COLORS[idx % CHART_COLORS.length]} />
            ))}
          </LineChart>
        </ResponsiveContainer>
      );
    }

    return (
      <ResponsiveContainer width="100%" height={300}>
        <BarChart data={data}>
          <CartesianGrid strokeDasharray="3 3" />
          <XAxis dataKey="dimension" />
          <YAxis />
          <Tooltip />
          <Legend />
          {selectedMetrics.map((metricId, idx) => (
            <Bar key={metricId} dataKey={metricId}
              name={metrics.find(m => m.id === metricId)?.name || metricId}
              fill={CHART_COLORS[idx % CHART_COLORS.length]} />
          ))}
        </BarChart>
      </ResponsiveContainer>
    );
  };

  // ==================== EXPORT HELPERS ====================
  const exportCsv = () => {
    if (!reportResult?.data?.rows || reportResult.data.rows.length === 0) return;
    const rows = reportResult.data.rows;
    const headers = [];
    if (selectedDimension) {
      headers.push(dimensions.find(d => d.id === selectedDimension)?.name || 'Dimension');
    }
    selectedMetrics.forEach(metricId => {
      headers.push(metrics.find(m => m.id === metricId)?.name || metricId);
    });
    const csvRows = [headers.join(',')];
    rows.forEach(row => {
      const vals = [];
      if (selectedDimension) vals.push(`"${String(row.dimension || '').replace(/"/g, '""')}"`);
      selectedMetrics.forEach(metricId => {
        const v = row[metricId];
        vals.push(v !== null && v !== undefined ? v : '');
      });
      csvRows.push(vals.join(','));
    });
    const blob = new Blob([csvRows.join('\n')], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `report-${new Date().toISOString().slice(0, 10)}.csv`;
    link.click();
    URL.revokeObjectURL(url);
  };

  const exportPdf = () => {
    window.print();
  };

  // ==================== QUICK DATE HELPERS ====================
  const applyQuickDate = (days) => {
    const end = new Date();
    const start = new Date();
    if (days === 'year') {
      start.setMonth(0, 1);
    } else {
      start.setDate(start.getDate() - days);
    }
    setDateRange({
      start: start.toISOString().slice(0, 10),
      end: end.toISOString().slice(0, 10)
    });
  };

  // ==================== BUILDER TAB ====================
  const renderBuilderTab = () => (
    <div className="rb-builder-grid" style={{ display: 'grid', gridTemplateColumns: '340px 1fr', gap: '24px' }}>
      {/* Left: Configuration */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
        {/* Metrics */}
        <div style={card}>
          <h3 style={sectionTitle}>Select Metrics</h3>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
            {Object.entries(groupedMetrics).map(([category, categoryMetrics]) => (
              <div key={category}>
                <h4 style={{
                  fontSize: '11px', fontWeight: '600', color: '#6b7280',
                  textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '6px'
                }}>
                  {category}
                </h4>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                  {categoryMetrics.map(metric => (
                    <label key={metric.id} style={{
                      display: 'flex', alignItems: 'center', gap: '8px',
                      cursor: 'pointer', padding: '4px 0', fontSize: '13px', color: '#374151'
                    }}>
                      <input
                        type="checkbox"
                        checked={selectedMetrics.includes(metric.id)}
                        onChange={() => toggleMetric(metric.id)}
                        style={{ accentColor: '#2563eb' }}
                      />
                      {metric.name}
                    </label>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Dimension */}
        <div style={card}>
          <h3 style={sectionTitle}>Group By</h3>
          <select
            value={selectedDimension || ''}
            onChange={(e) => setSelectedDimension(e.target.value || null)}
            style={inputStyle}
          >
            <option value="">No grouping (totals only)</option>
            {dimensions.map(dim => (
              <option key={dim.id} value={dim.id}>{dim.name}</option>
            ))}
          </select>
        </div>

        {/* Chart Type */}
        <div style={card}>
          <h3 style={sectionTitle}>Chart Type</h3>
          <div style={{ display: 'flex', gap: '8px' }}>
            {['bar', 'line', 'pie'].map(type => (
              <button
                key={type}
                onClick={() => setChartType(type)}
                style={{
                  flex: 1, padding: '8px', border: 'none', borderRadius: '8px',
                  fontSize: '13px', fontWeight: '500', cursor: 'pointer',
                  background: chartType === type ? '#2563eb' : '#f3f4f6',
                  color: chartType === type ? 'white' : '#374151',
                  transition: 'all 0.15s'
                }}
              >
                {type.charAt(0).toUpperCase() + type.slice(1)}
              </button>
            ))}
          </div>
        </div>

        {/* Date Range */}
        <div style={card}>
          <h3 style={sectionTitle}>Date Range</h3>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px', marginBottom: '10px' }}>
            {[
              { label: 'Last 7 days', value: 7 },
              { label: 'Last 30 days', value: 30 },
              { label: 'Last 90 days', value: 90 },
              { label: 'This Year', value: 'year' }
            ].map(preset => (
              <button
                key={preset.label}
                onClick={() => applyQuickDate(preset.value)}
                style={{
                  padding: '4px 10px', fontSize: '11px', fontWeight: '500',
                  border: '1px solid #d1d5db', borderRadius: '6px',
                  background: '#f9fafb', color: '#374151', cursor: 'pointer',
                  transition: 'all 0.15s'
                }}
                onMouseEnter={e => { e.currentTarget.style.borderColor = '#6366f1'; e.currentTarget.style.color = '#6366f1'; }}
                onMouseLeave={e => { e.currentTarget.style.borderColor = '#d1d5db'; e.currentTarget.style.color = '#374151'; }}
              >
                {preset.label}
              </button>
            ))}
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
            <div>
              <label style={labelStyle}>From</label>
              <input type="date" value={dateRange.start || ''}
                onChange={(e) => setDateRange(prev => ({ ...prev, start: e.target.value }))}
                style={inputStyle} />
            </div>
            <div>
              <label style={labelStyle}>To</label>
              <input type="date" value={dateRange.end || ''}
                onChange={(e) => setDateRange(prev => ({ ...prev, end: e.target.value }))}
                style={inputStyle} />
            </div>
          </div>
        </div>

        {/* Actions */}
        <div style={{ display: 'flex', gap: '8px' }}>
          <button
            onClick={executeReport}
            disabled={executing || selectedMetrics.length === 0}
            style={{
              ...btnPrimary, flex: 1,
              opacity: executing || selectedMetrics.length === 0 ? 0.5 : 1,
              cursor: executing || selectedMetrics.length === 0 ? 'not-allowed' : 'pointer'
            }}
          >
            <Play size={14} />
            {executing ? 'Running...' : 'Run Report'}
          </button>
          <button
            onClick={() => setShowSaveDialog(true)}
            disabled={selectedMetrics.length === 0}
            style={{
              ...btnSecondary,
              opacity: selectedMetrics.length === 0 ? 0.5 : 1,
              cursor: selectedMetrics.length === 0 ? 'not-allowed' : 'pointer'
            }}
          >
            <Save size={14} />
            Save
          </button>
        </div>
      </div>

      {/* Right: Results */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
        {reportResult ? (
          <>
            {/* Summary Cards */}
            {reportResult.data.summary && (
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: '12px' }}>
                {Object.entries(reportResult.data.summary).map(([metricId, stats]) => {
                  const metric = metrics.find(m => m.id === metricId);
                  return (
                    <div key={metricId} style={{
                      ...card, padding: '16px',
                      borderLeft: `3px solid ${CHART_COLORS[selectedMetrics.indexOf(metricId) % CHART_COLORS.length]}`
                    }}>
                      <div style={{ fontSize: '12px', color: '#6b7280', marginBottom: '4px' }}>
                        {metric?.name || metricId}
                      </div>
                      <div style={{ fontSize: '22px', fontWeight: '700', color: '#111827' }}>
                        {formatMetricValue(metricId, stats.total)}
                      </div>
                      <div style={{ fontSize: '11px', color: '#9ca3af', marginTop: '2px' }}>
                        Avg: {typeof stats.average === 'number' ? stats.average.toFixed(1) : stats.average}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}

            {/* Chart */}
            <div style={card}>
              <h3 style={{ ...sectionTitle, marginBottom: '16px' }}>Visualization</h3>
              {renderChart()}
            </div>

            {/* Data Table */}
            <div style={{ ...card, padding: 0, overflow: 'hidden' }}>
              <div style={{ padding: '16px 20px', borderBottom: '1px solid #f3f4f6' }}>
                <h3 style={{ ...sectionTitle, margin: 0 }}>
                  Data ({reportResult.data.rowCount} rows)
                </h3>
              </div>
              <div style={{ overflowX: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                  <thead>
                    <tr>
                      {selectedDimension && (
                        <th style={thStyle}>
                          {dimensions.find(d => d.id === selectedDimension)?.name || 'Dimension'}
                        </th>
                      )}
                      {selectedMetrics.map(metricId => (
                        <th key={metricId} style={{ ...thStyle, textAlign: 'right' }}>
                          {metrics.find(m => m.id === metricId)?.name || metricId}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {reportResult.data.rows.map((row, idx) => (
                      <tr key={idx} style={{ borderTop: '1px solid #f3f4f6' }}
                        onMouseEnter={e => e.currentTarget.style.background = '#f9fafb'}
                        onMouseLeave={e => e.currentTarget.style.background = 'transparent'}>
                        {selectedDimension && (
                          <td style={{ ...tdStyle, fontWeight: '500', color: '#111827' }}>{row.dimension}</td>
                        )}
                        {selectedMetrics.map(metricId => (
                          <td key={metricId} style={{ ...tdStyle, textAlign: 'right' }}>
                            {formatMetricValue(metricId, row[metricId])}
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {/* Export Toolbar */}
              <div style={{
                padding: '12px 20px', borderTop: '1px solid #f3f4f6',
                display: 'flex', gap: '8px', justifyContent: 'flex-end', background: '#f9fafb'
              }}>
                <button onClick={exportCsv} style={{
                  ...btnSecondary, fontSize: '12px', padding: '6px 14px'
                }}>
                  <Download size={13} />
                  Export CSV
                </button>
                <button onClick={exportPdf} style={{
                  ...btnSecondary, fontSize: '12px', padding: '6px 14px'
                }}>
                  <Printer size={13} />
                  Export PDF
                </button>
              </div>
            </div>
          </>
        ) : (
          <div style={{
            ...card, padding: '60px', textAlign: 'center'
          }}>
            <Layout size={40} color="#d1d5db" style={{ marginBottom: '12px' }} />
            <div style={{ color: '#6b7280', fontSize: '15px' }}>
              Select metrics and click "Run Report" to see results
            </div>
          </div>
        )}
      </div>
    </div>
  );

  // ==================== TEMPLATES TAB ====================
  const renderTemplatesTab = () => (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
      {/* Pre-built */}
      <div style={card}>
        <h3 style={{ ...sectionTitle, fontSize: '15px', marginBottom: '16px', display: 'flex', alignItems: 'center', gap: '8px' }}>
          <BookOpen size={16} color="#2563eb" />
          Pre-built Templates
        </h3>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))', gap: '14px' }}>
          {prebuiltTemplates.map(template => (
            <div key={template.id} style={{
              padding: '16px', border: '1px solid #e5e7eb', borderRadius: '10px',
              transition: 'border-color 0.15s, box-shadow 0.15s'
            }}
              onMouseEnter={e => { e.currentTarget.style.borderColor = '#2563eb'; e.currentTarget.style.boxShadow = '0 2px 8px rgba(37,99,235,0.1)'; }}
              onMouseLeave={e => { e.currentTarget.style.borderColor = '#e5e7eb'; e.currentTarget.style.boxShadow = 'none'; }}
            >
              <h4 style={{ fontWeight: '600', color: '#111827', margin: '0 0 4px', fontSize: '14px' }}>{template.name}</h4>
              <p style={{ fontSize: '12px', color: '#6b7280', margin: '0 0 12px', lineHeight: '1.4' }}>{template.description}</p>
              <button onClick={() => loadTemplate(template)} style={{ ...btnPrimary, padding: '6px 12px', fontSize: '12px' }}>
                <ChevronRight size={12} />
                Use Template
              </button>
            </div>
          ))}
          {prebuiltTemplates.length === 0 && (
            <p style={{ color: '#9ca3af', fontSize: '13px', gridColumn: '1 / -1' }}>No pre-built templates available.</p>
          )}
        </div>
      </div>

      {/* Saved */}
      <div style={{ ...card, padding: 0, overflow: 'hidden' }}>
        <div style={{ padding: '16px 20px', borderBottom: '1px solid #f3f4f6', display: 'flex', alignItems: 'center', gap: '8px' }}>
          <Save size={16} color="#2563eb" />
          <h3 style={{ ...sectionTitle, margin: 0, fontSize: '15px' }}>Saved Templates</h3>
        </div>
        {savedTemplates.length > 0 ? (
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr>
                  <th style={thStyle}>Name</th>
                  <th style={thStyle}>Description</th>
                  <th style={thStyle}>Created</th>
                  <th style={thStyle}>Visibility</th>
                  <th style={{ ...thStyle, textAlign: 'right' }}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {savedTemplates.map(template => (
                  <tr key={template.id} style={{ borderTop: '1px solid #f3f4f6' }}
                    onMouseEnter={e => e.currentTarget.style.background = '#f9fafb'}
                    onMouseLeave={e => e.currentTarget.style.background = 'transparent'}>
                    <td style={{ ...tdStyle, fontWeight: '500', color: '#111827' }}>{template.name}</td>
                    <td style={{ ...tdStyle, color: '#6b7280', whiteSpace: 'normal', maxWidth: '240px' }}>
                      {template.description || '-'}
                    </td>
                    <td style={tdStyle}>{new Date(template.created_at).toLocaleDateString()}</td>
                    <td style={tdStyle}>
                      <span style={{
                        padding: '2px 8px', borderRadius: '10px', fontSize: '11px', fontWeight: '600',
                        background: template.is_public ? '#f0fdf4' : '#f3f4f6',
                        color: template.is_public ? '#16a34a' : '#6b7280'
                      }}>
                        {template.is_public ? 'Public' : 'Private'}
                      </span>
                    </td>
                    <td style={{ ...tdStyle, textAlign: 'right' }}>
                      <div style={{ display: 'flex', gap: '6px', justifyContent: 'flex-end' }}>
                        <button onClick={() => loadTemplate(template)}
                          style={{ ...linkBtn, color: '#2563eb' }}>Load</button>
                        <button onClick={() => { setSelectedTemplateForSchedule(template.id); setShowScheduleDialog(true); }}
                          style={{ ...linkBtn, color: '#16a34a' }}>Schedule</button>
                        <button onClick={() => deleteTemplate(template.id)}
                          style={{ ...linkBtn, color: '#dc2626' }}>Delete</button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <div style={{ padding: '32px', textAlign: 'center', color: '#9ca3af', fontSize: '13px' }}>
            No saved templates yet. Build a report and save it as a template.
          </div>
        )}
      </div>
    </div>
  );

  // ==================== SCHEDULED TAB ====================
  const renderScheduledTab = () => (
    <div style={{ ...card, padding: 0, overflow: 'hidden' }}>
      <div style={{
        padding: '16px 20px', borderBottom: '1px solid #f3f4f6',
        display: 'flex', alignItems: 'center', justifyContent: 'space-between'
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <Calendar size={16} color="#2563eb" />
          <h3 style={{ ...sectionTitle, margin: 0, fontSize: '15px' }}>Scheduled Reports</h3>
        </div>
        <button onClick={() => setShowScheduleDialog(true)} style={{ ...btnPrimary, padding: '6px 12px', fontSize: '12px' }}>
          <Calendar size={12} />
          New Schedule
        </button>
      </div>
      {scheduledReports.length > 0 ? (
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr>
                <th style={thStyle}>Template</th>
                <th style={thStyle}>Frequency</th>
                <th style={thStyle}>Next Run</th>
                <th style={thStyle}>Last Run</th>
                <th style={thStyle}>Status</th>
                <th style={{ ...thStyle, textAlign: 'right' }}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {scheduledReports.map(schedule => (
                <tr key={schedule.id} style={{ borderTop: '1px solid #f3f4f6' }}
                  onMouseEnter={e => e.currentTarget.style.background = '#f9fafb'}
                  onMouseLeave={e => e.currentTarget.style.background = 'transparent'}>
                  <td style={{ ...tdStyle, fontWeight: '500', color: '#111827' }}>
                    {schedule.template_name}
                  </td>
                  <td style={tdStyle}>
                    <span style={{
                      padding: '2px 8px', background: '#f3f4f6', borderRadius: '4px',
                      fontSize: '12px', fontWeight: '500', textTransform: 'capitalize'
                    }}>
                      {schedule.schedule_type}
                    </span>
                  </td>
                  <td style={tdStyle}>
                    {schedule.next_run_at ? new Date(schedule.next_run_at).toLocaleString() : '-'}
                  </td>
                  <td style={tdStyle}>
                    {schedule.last_run_at ? new Date(schedule.last_run_at).toLocaleString() : 'Never'}
                  </td>
                  <td style={tdStyle}>
                    <span style={{
                      padding: '3px 10px', borderRadius: '12px', fontSize: '11px', fontWeight: '600',
                      background: schedule.is_active ? '#f0fdf4' : '#fef2f2',
                      color: schedule.is_active ? '#16a34a' : '#dc2626',
                      display: 'inline-flex', alignItems: 'center', gap: '4px'
                    }}>
                      {schedule.is_active && <CheckCircle size={11} />}
                      {schedule.is_active ? 'Active' : 'Paused'}
                    </span>
                  </td>
                  <td style={{ ...tdStyle, textAlign: 'right' }}>
                    <div style={{ display: 'flex', gap: '6px', justifyContent: 'flex-end' }}>
                      <button
                        onClick={async () => {
                          await api.put(`/api/reports/scheduled/${schedule.id}`, { isActive: !schedule.is_active });
                          fetchMetadata();
                        }}
                        style={{ ...linkBtn, color: '#f59e0b' }}
                      >
                        {schedule.is_active ? 'Pause' : 'Resume'}
                      </button>
                      <button
                        onClick={async () => {
                          if (window.confirm('Delete this scheduled report?')) {
                            await api.delete(`/api/reports/scheduled/${schedule.id}`);
                            fetchMetadata();
                          }
                        }}
                        style={{ ...linkBtn, color: '#dc2626' }}
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
      ) : (
        <div style={{ padding: '40px', textAlign: 'center', color: '#9ca3af' }}>
          <Calendar size={36} color="#d1d5db" style={{ marginBottom: '10px' }} />
          <p style={{ fontWeight: '500', color: '#374151', margin: '0 0 4px' }}>No scheduled reports yet</p>
          <p style={{ fontSize: '13px', margin: 0 }}>Save a template and schedule it for automatic delivery.</p>
        </div>
      )}
    </div>
  );

  // ==================== TABS CONFIG ====================
  const tabs = [
    { id: 'builder', label: 'Report Builder', icon: <Layout size={15} /> },
    { id: 'templates', label: 'Templates', icon: <BookOpen size={15} /> },
    { id: 'scheduled', label: 'Scheduled', icon: <Calendar size={15} />, count: scheduledReports.length }
  ];

  // ==================== LOADING SKELETON ====================
  if (loading) {
    const skeletonBlock = (height) => ({
      background: 'linear-gradient(90deg, #f3f4f6 25%, #e5e7eb 50%, #f3f4f6 75%)',
      backgroundSize: '200% 100%',
      animation: 'shimmer 1.5s ease-in-out infinite',
      borderRadius: '12px',
      height,
      width: '100%'
    });
    return (
      <div style={{ padding: '24px', maxWidth: '1400px', margin: '0 auto' }}>
        {/* Header skeleton */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '14px', marginBottom: '24px' }}>
          <div style={{ ...skeletonBlock('42px'), width: '42px', flexShrink: 0 }} />
          <div style={{ flex: 1 }}>
            <div style={{ ...skeletonBlock('20px'), width: '200px', marginBottom: '8px' }} />
            <div style={{ ...skeletonBlock('14px'), width: '340px' }} />
          </div>
        </div>
        {/* Tabs skeleton */}
        <div style={{ ...skeletonBlock('40px'), marginBottom: '24px', borderRadius: '8px' }} />
        {/* Builder grid skeleton */}
        <div className="rb-builder-grid" style={{ display: 'grid', gridTemplateColumns: '340px 1fr', gap: '24px' }}>
          {/* Left panel: 3 card skeletons */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
            <div style={skeletonBlock('180px')} />
            <div style={skeletonBlock('100px')} />
            <div style={skeletonBlock('120px')} />
          </div>
          {/* Right panel: 1 large skeleton */}
          <div style={skeletonBlock('420px')} />
        </div>
        <style>{`
          @keyframes shimmer {
            0% { background-position: 200% 0; }
            100% { background-position: -200% 0; }
          }
          @media (max-width: 900px) {
            .rb-builder-grid { grid-template-columns: 1fr !important; }
          }
        `}</style>
      </div>
    );
  }

  // ==================== MAIN RENDER ====================
  return (
    <div style={{ padding: '24px', maxWidth: '1400px', margin: '0 auto' }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '14px', marginBottom: '24px' }}>
        <div style={{
          width: '42px', height: '42px', borderRadius: '12px',
          background: 'linear-gradient(135deg, #6366f1 0%, #4f46e5 100%)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          boxShadow: '0 4px 12px rgba(99, 102, 241, 0.3)', flexShrink: 0
        }}>
          <FileBarChart size={22} color="white" />
        </div>
        <div>
          <h1 style={{ fontSize: '24px', fontWeight: '700', margin: 0, color: '#111827' }}>
            Report Builder
          </h1>
          <p style={{ color: '#6b7280', margin: '2px 0 0', fontSize: '13px' }}>
            Create custom reports, save templates, and schedule automatic delivery
          </p>
        </div>
      </div>

      {/* Tabs */}
      <div style={{ display: 'flex', gap: '4px', marginBottom: '24px', borderBottom: '2px solid #e5e7eb' }}>
        {tabs.map(tab => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            style={{
              display: 'flex', alignItems: 'center', gap: '6px',
              padding: '10px 18px', background: 'transparent',
              color: activeTab === tab.id ? '#6366f1' : '#6b7280',
              border: 'none',
              borderBottom: activeTab === tab.id ? '2px solid #6366f1' : '2px solid transparent',
              marginBottom: '-2px', cursor: 'pointer',
              fontSize: '14px', fontWeight: activeTab === tab.id ? '600' : '400',
              transition: 'all 0.15s ease'
            }}
          >
            {tab.icon}
            {tab.label}
            {tab.count > 0 && (
              <span style={{
                background: activeTab === tab.id ? '#6366f1' : '#e5e7eb',
                color: activeTab === tab.id ? 'white' : '#6b7280',
                fontSize: '11px', fontWeight: '600',
                padding: '1px 7px', borderRadius: '10px'
              }}>
                {tab.count}
              </span>
            )}
          </button>
        ))}
      </div>

      {activeTab === 'builder' && renderBuilderTab()}
      {activeTab === 'templates' && renderTemplatesTab()}
      {activeTab === 'scheduled' && renderScheduledTab()}

      {/* Save Dialog */}
      {showSaveDialog && (
        <ModalOverlay onClose={() => setShowSaveDialog(false)}>
          <h3 style={{ margin: '0 0 16px', fontSize: '16px', fontWeight: '600', color: '#111827' }}>
            Save Template
          </h3>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
            <div>
              <label style={labelStyle}>Template Name</label>
              <input type="text" value={templateName}
                onChange={(e) => setTemplateName(e.target.value)}
                style={inputStyle} placeholder="My Report" />
            </div>
            <div>
              <label style={labelStyle}>Description</label>
              <textarea value={templateDescription}
                onChange={(e) => setTemplateDescription(e.target.value)}
                style={{ ...inputStyle, resize: 'vertical', minHeight: '72px' }}
                rows={3} placeholder="What this report shows..." />
            </div>
            <label style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer', fontSize: '13px', color: '#374151' }}>
              <input type="checkbox" checked={isPublic}
                onChange={(e) => setIsPublic(e.target.checked)}
                style={{ accentColor: '#2563eb' }} />
              Make this template public
            </label>
          </div>
          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px', marginTop: '20px' }}>
            <button onClick={() => setShowSaveDialog(false)} style={btnSecondary}>Cancel</button>
            <button onClick={saveTemplate} style={btnPrimary}>
              <Save size={14} />
              Save Template
            </button>
          </div>
        </ModalOverlay>
      )}

      {/* Schedule Dialog */}
      {showScheduleDialog && (
        <ModalOverlay onClose={() => setShowScheduleDialog(false)}>
          <h3 style={{ margin: '0 0 16px', fontSize: '16px', fontWeight: '600', color: '#111827', display: 'flex', alignItems: 'center', gap: '8px' }}>
            <Calendar size={18} color="#2563eb" />
            Schedule Report
          </h3>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
            <div>
              <label style={labelStyle}>Frequency</label>
              <select value={scheduleType} onChange={(e) => setScheduleType(e.target.value)} style={inputStyle}>
                <option value="daily">Daily</option>
                <option value="weekly">Weekly</option>
                <option value="monthly">Monthly</option>
              </select>
            </div>
            <div>
              <label style={labelStyle}>Time</label>
              <input type="time" value={scheduleConfig.time}
                onChange={(e) => setScheduleConfig(prev => ({ ...prev, time: e.target.value }))}
                style={inputStyle} />
            </div>
            {scheduleType === 'weekly' && (
              <div>
                <label style={labelStyle}>Day of Week</label>
                <select
                  value={scheduleConfig.dayOfWeek}
                  onChange={(e) => setScheduleConfig(prev => ({ ...prev, dayOfWeek: parseInt(e.target.value) }))}
                  style={inputStyle}
                >
                  {['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'].map((d, i) => (
                    <option key={i} value={i}>{d}</option>
                  ))}
                </select>
              </div>
            )}
            {scheduleType === 'monthly' && (
              <div>
                <label style={labelStyle}>Day of Month</label>
                <input type="number" min={1} max={28}
                  value={scheduleConfig.dayOfMonth || 1}
                  onChange={(e) => setScheduleConfig(prev => ({ ...prev, dayOfMonth: parseInt(e.target.value) }))}
                  style={inputStyle} />
              </div>
            )}
            <div>
              <label style={labelStyle}>
                <Mail size={12} style={{ marginRight: '4px', verticalAlign: '-1px' }} />
                Recipients (comma-separated emails)
              </label>
              <input type="text" value={recipients}
                onChange={(e) => setRecipients(e.target.value)}
                style={inputStyle} placeholder="email@example.com, other@example.com" />
            </div>
          </div>
          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px', marginTop: '20px' }}>
            <button onClick={() => setShowScheduleDialog(false)} style={btnSecondary}>Cancel</button>
            <button onClick={scheduleReport} style={btnPrimary}>
              <Calendar size={14} />
              Schedule Report
            </button>
          </div>
        </ModalOverlay>
      )}

      <style>{`
        @keyframes spin { to { transform: rotate(360deg); } }
        @media (max-width: 900px) {
          .rb-builder-grid { grid-template-columns: 1fr !important; }
        }
      `}</style>
    </div>
  );
};

// Modal Overlay Component
const ModalOverlay = ({ children, onClose }) => (
  <div style={{
    position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)',
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    zIndex: 50
  }}
    onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
  >
    <div style={{
      background: 'white', borderRadius: '14px', padding: '24px',
      width: '100%', maxWidth: '440px', boxShadow: '0 20px 60px rgba(0,0,0,0.2)',
      position: 'relative', maxHeight: '90vh', overflowY: 'auto'
    }}>
      <button onClick={onClose} style={{
        position: 'absolute', top: '12px', right: '12px',
        background: 'none', border: 'none', cursor: 'pointer', color: '#9ca3af', padding: '4px'
      }}>
        <X size={18} />
      </button>
      {children}
    </div>
  </div>
);

// Link button style
const linkBtn = {
  background: 'none', border: 'none', cursor: 'pointer',
  fontSize: '12px', fontWeight: '500', padding: '2px 4px'
};

export default ReportBuilder;
