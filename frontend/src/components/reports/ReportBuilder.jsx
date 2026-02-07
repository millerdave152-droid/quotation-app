import React, { useState, useEffect, useMemo } from 'react';
import { authFetch } from '../../services/authFetch';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer,
  LineChart, Line, PieChart, Pie, Cell
} from 'recharts';

const API_URL = process.env.REACT_APP_API_URL || 'http://localhost:3001';

// Helper for API calls
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

const CHART_COLORS = ['#4CAF50', '#2196F3', '#FF9800', '#9C27B0', '#F44336', '#00BCD4', '#8BC34A', '#E91E63'];

const ReportBuilder = () => {
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState('builder');
  const [metrics, setMetrics] = useState([]);
  const [dimensions, setDimensions] = useState([]);
  const [prebuiltTemplates, setPrebuiltTemplates] = useState([]);
  const [savedTemplates, setSavedTemplates] = useState([]);
  const [scheduledReports, setScheduledReports] = useState([]);

  // Builder state
  const [selectedMetrics, setSelectedMetrics] = useState([]);
  const [selectedDimension, setSelectedDimension] = useState(null);
  const [chartType, setChartType] = useState('bar');
  const [dateRange, setDateRange] = useState({ start: null, end: null });
  const [filters, setFilters] = useState({});

  // Report result
  const [reportResult, setReportResult] = useState(null);
  const [executing, setExecuting] = useState(false);

  // Save dialog
  const [showSaveDialog, setShowSaveDialog] = useState(false);
  const [templateName, setTemplateName] = useState('');
  const [templateDescription, setTemplateDescription] = useState('');
  const [isPublic, setIsPublic] = useState(false);

  // Schedule dialog
  const [showScheduleDialog, setShowScheduleDialog] = useState(false);
  const [scheduleType, setScheduleType] = useState('weekly');
  const [scheduleConfig, setScheduleConfig] = useState({ time: '08:00', dayOfWeek: 1 });
  const [recipients, setRecipients] = useState('');
  const [selectedTemplateForSchedule, setSelectedTemplateForSchedule] = useState(null);

  useEffect(() => {
    fetchMetadata();
  }, []);

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
    if (selectedMetrics.length === 0) {
      alert('Please select at least one metric');
      return;
    }

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
    if (!templateName.trim()) {
      alert('Please enter a template name');
      return;
    }

    try {
      await api.post('/api/reports/templates', {
        name: templateName,
        description: templateDescription,
        config: {
          metrics: selectedMetrics,
          dimensions: selectedDimension,
          chartType,
          filters
        },
        isPublic
      });
      setShowSaveDialog(false);
      setTemplateName('');
      setTemplateDescription('');
      fetchMetadata();
      alert('Template saved successfully');
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
    if (!window.confirm('Are you sure you want to delete this template?')) return;

    try {
      await api.delete(`/api/reports/templates/${templateId}`);
      fetchMetadata();
    } catch (error) {
      console.error('Error deleting template:', error);
    }
  };

  const scheduleReport = async () => {
    if (!selectedTemplateForSchedule) {
      alert('Please select a template to schedule');
      return;
    }

    const recipientList = recipients.split(',').map(e => e.trim()).filter(Boolean);
    if (recipientList.length === 0) {
      alert('Please enter at least one recipient email');
      return;
    }

    try {
      await api.post('/api/reports/scheduled', {
        templateId: selectedTemplateForSchedule,
        scheduleType,
        scheduleConfig,
        recipients: recipientList
      });
      setShowScheduleDialog(false);
      setRecipients('');
      setSelectedTemplateForSchedule(null);
      fetchMetadata();
      alert('Report scheduled successfully');
    } catch (error) {
      console.error('Error scheduling report:', error);
      alert('Failed to schedule report');
    }
  };

  const toggleMetric = (metricId) => {
    setSelectedMetrics(prev =>
      prev.includes(metricId)
        ? prev.filter(m => m !== metricId)
        : [...prev, metricId]
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
      style: 'currency',
      currency: 'USD',
      minimumFractionDigits: 0,
      maximumFractionDigits: 0
    }).format(value);
  };

  const renderChart = () => {
    if (!reportResult?.data?.rows || reportResult.data.rows.length === 0) {
      return (
        <div className="flex items-center justify-center h-64 bg-gray-50 dark:bg-gray-800 rounded-lg">
          <span className="text-gray-500 dark:text-gray-400">No data to display</span>
        </div>
      );
    }

    const data = reportResult.data.rows;

    if (chartType === 'pie' && selectedMetrics.length === 1) {
      return (
        <ResponsiveContainer width="100%" height={300}>
          <PieChart>
            <Pie
              data={data}
              dataKey={selectedMetrics[0]}
              nameKey="dimension"
              cx="50%"
              cy="50%"
              outerRadius={100}
              fill="#8884d8"
              label
            >
              {data.map((entry, index) => (
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
              <Line
                key={metricId}
                type="monotone"
                dataKey={metricId}
                name={metrics.find(m => m.id === metricId)?.name || metricId}
                stroke={CHART_COLORS[idx % CHART_COLORS.length]}
              />
            ))}
          </LineChart>
        </ResponsiveContainer>
      );
    }

    // Default: bar chart
    return (
      <ResponsiveContainer width="100%" height={300}>
        <BarChart data={data}>
          <CartesianGrid strokeDasharray="3 3" />
          <XAxis dataKey="dimension" />
          <YAxis />
          <Tooltip />
          <Legend />
          {selectedMetrics.map((metricId, idx) => (
            <Bar
              key={metricId}
              dataKey={metricId}
              name={metrics.find(m => m.id === metricId)?.name || metricId}
              fill={CHART_COLORS[idx % CHART_COLORS.length]}
            />
          ))}
        </BarChart>
      </ResponsiveContainer>
    );
  };

  const renderBuilderTab = () => (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
      {/* Left: Configuration */}
      <div className="lg:col-span-1 space-y-6">
        {/* Metrics Selection */}
        <div className="bg-white dark:bg-gray-800 rounded-lg shadow p-4">
          <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">
            Select Metrics
          </h3>
          <div className="space-y-4">
            {Object.entries(groupedMetrics).map(([category, categoryMetrics]) => (
              <div key={category}>
                <h4 className="text-sm font-medium text-gray-500 dark:text-gray-400 uppercase mb-2">
                  {category}
                </h4>
                <div className="space-y-2">
                  {categoryMetrics.map(metric => (
                    <label key={metric.id} className="flex items-center space-x-2 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={selectedMetrics.includes(metric.id)}
                        onChange={() => toggleMetric(metric.id)}
                        className="w-4 h-4 text-blue-600 rounded"
                      />
                      <span className="text-sm text-gray-700 dark:text-gray-300">{metric.name}</span>
                    </label>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Dimension Selection */}
        <div className="bg-white dark:bg-gray-800 rounded-lg shadow p-4">
          <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">
            Group By (Dimension)
          </h3>
          <select
            value={selectedDimension || ''}
            onChange={(e) => setSelectedDimension(e.target.value || null)}
            className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
          >
            <option value="">No grouping (totals only)</option>
            {dimensions.map(dim => (
              <option key={dim.id} value={dim.id}>{dim.name}</option>
            ))}
          </select>
        </div>

        {/* Chart Type */}
        <div className="bg-white dark:bg-gray-800 rounded-lg shadow p-4">
          <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">
            Chart Type
          </h3>
          <div className="flex space-x-2">
            {['bar', 'line', 'pie'].map(type => (
              <button
                key={type}
                onClick={() => setChartType(type)}
                className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                  chartType === type
                    ? 'bg-blue-600 text-white'
                    : 'bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-600'
                }`}
              >
                {type.charAt(0).toUpperCase() + type.slice(1)}
              </button>
            ))}
          </div>
        </div>

        {/* Date Range */}
        <div className="bg-white dark:bg-gray-800 rounded-lg shadow p-4">
          <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">
            Date Range
          </h3>
          <div className="space-y-3">
            <div>
              <label className="block text-sm text-gray-600 dark:text-gray-400 mb-1">From</label>
              <input
                type="date"
                value={dateRange.start || ''}
                onChange={(e) => setDateRange(prev => ({ ...prev, start: e.target.value }))}
                className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
              />
            </div>
            <div>
              <label className="block text-sm text-gray-600 dark:text-gray-400 mb-1">To</label>
              <input
                type="date"
                value={dateRange.end || ''}
                onChange={(e) => setDateRange(prev => ({ ...prev, end: e.target.value }))}
                className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
              />
            </div>
          </div>
        </div>

        {/* Actions */}
        <div className="flex space-x-3">
          <button
            onClick={executeReport}
            disabled={executing || selectedMetrics.length === 0}
            className="flex-1 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            {executing ? 'Running...' : 'Run Report'}
          </button>
          <button
            onClick={() => setShowSaveDialog(true)}
            disabled={selectedMetrics.length === 0}
            className="px-4 py-2 bg-gray-600 text-white rounded-lg hover:bg-gray-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            Save
          </button>
        </div>
      </div>

      {/* Right: Results */}
      <div className="lg:col-span-2 space-y-6">
        {reportResult ? (
          <>
            {/* Summary Cards */}
            {reportResult.data.summary && (
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                {Object.entries(reportResult.data.summary).map(([metricId, stats]) => {
                  const metric = metrics.find(m => m.id === metricId);
                  return (
                    <div key={metricId} className="bg-white dark:bg-gray-800 rounded-lg shadow p-4">
                      <div className="text-sm text-gray-500 dark:text-gray-400">{metric?.name || metricId}</div>
                      <div className="text-2xl font-bold text-gray-900 dark:text-white mt-1">
                        {metricId.includes('Revenue') || metricId.includes('Value') || metricId.includes('Amount')
                          ? formatCurrency(stats.total)
                          : typeof stats.total === 'number' ? stats.total.toFixed(1) : stats.total}
                      </div>
                      <div className="text-xs text-gray-400 dark:text-gray-500 mt-1">
                        Avg: {typeof stats.average === 'number' ? stats.average.toFixed(1) : stats.average}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}

            {/* Chart */}
            <div className="bg-white dark:bg-gray-800 rounded-lg shadow p-6">
              <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">Visualization</h3>
              {renderChart()}
            </div>

            {/* Data Table */}
            <div className="bg-white dark:bg-gray-800 rounded-lg shadow p-6">
              <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">
                Data ({reportResult.data.rowCount} rows)
              </h3>
              <div className="overflow-x-auto">
                <table className="min-w-full divide-y divide-gray-200 dark:divide-gray-700">
                  <thead className="bg-gray-50 dark:bg-gray-900">
                    <tr>
                      {selectedDimension && (
                        <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">
                          {dimensions.find(d => d.id === selectedDimension)?.name || 'Dimension'}
                        </th>
                      )}
                      {selectedMetrics.map(metricId => (
                        <th key={metricId} className="px-4 py-3 text-right text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">
                          {metrics.find(m => m.id === metricId)?.name || metricId}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="bg-white dark:bg-gray-800 divide-y divide-gray-200 dark:divide-gray-700">
                    {reportResult.data.rows.map((row, idx) => (
                      <tr key={idx}>
                        {selectedDimension && (
                          <td className="px-4 py-3 whitespace-nowrap text-sm text-gray-900 dark:text-white">
                            {row.dimension}
                          </td>
                        )}
                        {selectedMetrics.map(metricId => (
                          <td key={metricId} className="px-4 py-3 text-right whitespace-nowrap text-sm text-gray-900 dark:text-white">
                            {metricId.includes('Revenue') || metricId.includes('Value') || metricId.includes('Amount')
                              ? formatCurrency(row[metricId])
                              : typeof row[metricId] === 'number' ? row[metricId].toFixed(1) : row[metricId]}
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </>
        ) : (
          <div className="bg-white dark:bg-gray-800 rounded-lg shadow p-12 text-center">
            <div className="text-gray-400 dark:text-gray-500 text-lg">
              Select metrics and click "Run Report" to see results
            </div>
          </div>
        )}
      </div>
    </div>
  );

  const renderTemplatesTab = () => (
    <div className="space-y-6">
      {/* Pre-built Templates */}
      <div className="bg-white dark:bg-gray-800 rounded-lg shadow p-6">
        <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">
          Pre-built Templates
        </h3>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {prebuiltTemplates.map(template => (
            <div key={template.id} className="border border-gray-200 dark:border-gray-700 rounded-lg p-4">
              <h4 className="font-medium text-gray-900 dark:text-white">{template.name}</h4>
              <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">{template.description}</p>
              <button
                onClick={() => loadTemplate(template)}
                className="mt-3 px-4 py-2 bg-blue-600 text-white text-sm rounded-lg hover:bg-blue-700 transition-colors"
              >
                Use Template
              </button>
            </div>
          ))}
        </div>
      </div>

      {/* Saved Templates */}
      <div className="bg-white dark:bg-gray-800 rounded-lg shadow p-6">
        <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">
          Saved Templates
        </h3>
        {savedTemplates.length > 0 ? (
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200 dark:divide-gray-700">
              <thead className="bg-gray-50 dark:bg-gray-900">
                <tr>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">Name</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">Description</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">Created</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">Public</th>
                  <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">Actions</th>
                </tr>
              </thead>
              <tbody className="bg-white dark:bg-gray-800 divide-y divide-gray-200 dark:divide-gray-700">
                {savedTemplates.map(template => (
                  <tr key={template.id}>
                    <td className="px-4 py-3 whitespace-nowrap text-sm font-medium text-gray-900 dark:text-white">
                      {template.name}
                    </td>
                    <td className="px-4 py-3 text-sm text-gray-500 dark:text-gray-400">
                      {template.description || '-'}
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap text-sm text-gray-500 dark:text-gray-400">
                      {new Date(template.created_at).toLocaleDateString()}
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap text-sm">
                      <span className={`px-2 py-1 rounded-full text-xs ${
                        template.is_public
                          ? 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400'
                          : 'bg-gray-100 text-gray-800 dark:bg-gray-900/30 dark:text-gray-400'
                      }`}>
                        {template.is_public ? 'Public' : 'Private'}
                      </span>
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap text-right text-sm space-x-2">
                      <button
                        onClick={() => loadTemplate(template)}
                        className="text-blue-600 hover:text-blue-800 dark:text-blue-400 dark:hover:text-blue-300"
                      >
                        Load
                      </button>
                      <button
                        onClick={() => {
                          setSelectedTemplateForSchedule(template.id);
                          setShowScheduleDialog(true);
                        }}
                        className="text-green-600 hover:text-green-800 dark:text-green-400 dark:hover:text-green-300"
                      >
                        Schedule
                      </button>
                      <button
                        onClick={() => deleteTemplate(template.id)}
                        className="text-red-600 hover:text-red-800 dark:text-red-400 dark:hover:text-red-300"
                      >
                        Delete
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <p className="text-gray-500 dark:text-gray-400 text-center py-4">
            No saved templates yet. Build a report and save it as a template.
          </p>
        )}
      </div>
    </div>
  );

  const renderScheduledTab = () => (
    <div className="bg-white dark:bg-gray-800 rounded-lg shadow p-6">
      <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">
        Scheduled Reports
      </h3>
      {scheduledReports.length > 0 ? (
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-gray-200 dark:divide-gray-700">
            <thead className="bg-gray-50 dark:bg-gray-900">
              <tr>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">Template</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">Schedule</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">Next Run</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">Last Run</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">Status</th>
                <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">Actions</th>
              </tr>
            </thead>
            <tbody className="bg-white dark:bg-gray-800 divide-y divide-gray-200 dark:divide-gray-700">
              {scheduledReports.map(schedule => (
                <tr key={schedule.id}>
                  <td className="px-4 py-3 whitespace-nowrap text-sm font-medium text-gray-900 dark:text-white">
                    {schedule.template_name}
                  </td>
                  <td className="px-4 py-3 whitespace-nowrap text-sm text-gray-500 dark:text-gray-400">
                    {schedule.schedule_type.charAt(0).toUpperCase() + schedule.schedule_type.slice(1)}
                  </td>
                  <td className="px-4 py-3 whitespace-nowrap text-sm text-gray-500 dark:text-gray-400">
                    {schedule.next_run_at ? new Date(schedule.next_run_at).toLocaleString() : '-'}
                  </td>
                  <td className="px-4 py-3 whitespace-nowrap text-sm text-gray-500 dark:text-gray-400">
                    {schedule.last_run_at ? new Date(schedule.last_run_at).toLocaleString() : 'Never'}
                  </td>
                  <td className="px-4 py-3 whitespace-nowrap text-sm">
                    <span className={`px-2 py-1 rounded-full text-xs ${
                      schedule.is_active
                        ? 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400'
                        : 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400'
                    }`}>
                      {schedule.is_active ? 'Active' : 'Paused'}
                    </span>
                  </td>
                  <td className="px-4 py-3 whitespace-nowrap text-right text-sm space-x-2">
                    <button
                      onClick={async () => {
                        await api.put(`/api/reports/scheduled/${schedule.id}`, {
                          isActive: !schedule.is_active
                        });
                        fetchMetadata();
                      }}
                      className="text-yellow-600 hover:text-yellow-800 dark:text-yellow-400 dark:hover:text-yellow-300"
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
                      className="text-red-600 hover:text-red-800 dark:text-red-400 dark:hover:text-red-300"
                    >
                      Delete
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <p className="text-gray-500 dark:text-gray-400 text-center py-4">
          No scheduled reports yet. Save a template and schedule it for automatic delivery.
        </p>
      )}
    </div>
  );

  const tabs = [
    { id: 'builder', label: 'Report Builder' },
    { id: 'templates', label: 'Templates' },
    { id: 'scheduled', label: 'Scheduled Reports' }
  ];

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
      </div>
    );
  }

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Report Builder</h1>
        <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
          Create custom reports, save templates, and schedule automatic delivery
        </p>
      </div>

      {/* Tabs */}
      <div className="border-b border-gray-200 dark:border-gray-700">
        <nav className="-mb-px flex space-x-8">
          {tabs.map(tab => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`whitespace-nowrap py-4 px-1 border-b-2 font-medium text-sm ${
                activeTab === tab.id
                  ? 'border-blue-500 text-blue-600 dark:text-blue-400'
                  : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300 dark:text-gray-400'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </nav>
      </div>

      {/* Tab Content */}
      {activeTab === 'builder' && renderBuilderTab()}
      {activeTab === 'templates' && renderTemplatesTab()}
      {activeTab === 'scheduled' && renderScheduledTab()}

      {/* Save Dialog */}
      {showSaveDialog && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white dark:bg-gray-800 rounded-lg shadow-xl p-6 w-full max-w-md">
            <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">Save Template</h3>
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                  Template Name
                </label>
                <input
                  type="text"
                  value={templateName}
                  onChange={(e) => setTemplateName(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                  placeholder="My Report"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                  Description
                </label>
                <textarea
                  value={templateDescription}
                  onChange={(e) => setTemplateDescription(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                  rows={3}
                  placeholder="What this report shows..."
                />
              </div>
              <label className="flex items-center space-x-2">
                <input
                  type="checkbox"
                  checked={isPublic}
                  onChange={(e) => setIsPublic(e.target.checked)}
                  className="w-4 h-4 text-blue-600 rounded"
                />
                <span className="text-sm text-gray-700 dark:text-gray-300">Make this template public</span>
              </label>
            </div>
            <div className="flex justify-end space-x-3 mt-6">
              <button
                onClick={() => setShowSaveDialog(false)}
                className="px-4 py-2 text-gray-600 dark:text-gray-400 hover:text-gray-800 dark:hover:text-gray-200"
              >
                Cancel
              </button>
              <button
                onClick={saveTemplate}
                className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
              >
                Save Template
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Schedule Dialog */}
      {showScheduleDialog && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white dark:bg-gray-800 rounded-lg shadow-xl p-6 w-full max-w-md">
            <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">Schedule Report</h3>
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                  Frequency
                </label>
                <select
                  value={scheduleType}
                  onChange={(e) => setScheduleType(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                >
                  <option value="daily">Daily</option>
                  <option value="weekly">Weekly</option>
                  <option value="monthly">Monthly</option>
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                  Time
                </label>
                <input
                  type="time"
                  value={scheduleConfig.time}
                  onChange={(e) => setScheduleConfig(prev => ({ ...prev, time: e.target.value }))}
                  className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                />
              </div>
              {scheduleType === 'weekly' && (
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                    Day of Week
                  </label>
                  <select
                    value={scheduleConfig.dayOfWeek}
                    onChange={(e) => setScheduleConfig(prev => ({ ...prev, dayOfWeek: parseInt(e.target.value) }))}
                    className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                  >
                    <option value={0}>Sunday</option>
                    <option value={1}>Monday</option>
                    <option value={2}>Tuesday</option>
                    <option value={3}>Wednesday</option>
                    <option value={4}>Thursday</option>
                    <option value={5}>Friday</option>
                    <option value={6}>Saturday</option>
                  </select>
                </div>
              )}
              {scheduleType === 'monthly' && (
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                    Day of Month
                  </label>
                  <input
                    type="number"
                    min={1}
                    max={28}
                    value={scheduleConfig.dayOfMonth || 1}
                    onChange={(e) => setScheduleConfig(prev => ({ ...prev, dayOfMonth: parseInt(e.target.value) }))}
                    className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                  />
                </div>
              )}
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                  Recipients (comma-separated emails)
                </label>
                <input
                  type="text"
                  value={recipients}
                  onChange={(e) => setRecipients(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                  placeholder="email@example.com, other@example.com"
                />
              </div>
            </div>
            <div className="flex justify-end space-x-3 mt-6">
              <button
                onClick={() => setShowScheduleDialog(false)}
                className="px-4 py-2 text-gray-600 dark:text-gray-400 hover:text-gray-800 dark:hover:text-gray-200"
              >
                Cancel
              </button>
              <button
                onClick={scheduleReport}
                className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
              >
                Schedule Report
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default ReportBuilder;
