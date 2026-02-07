import { authFetch } from '../services/authFetch';
/**
 * ManufacturerTemplateManager.jsx
 *
 * Comprehensive UI for managing manufacturer import templates.
 * Features:
 * - View all templates grouped by manufacturer
 * - Create, edit, clone, delete templates
 * - Test templates with sample files
 * - View usage history and success rates
 */

import React, { useState, useEffect, useCallback } from 'react';

const API_BASE = `${process.env.REACT_APP_API_URL || 'http://localhost:3001'}/api`;

const ManufacturerTemplateManager = () => {
  // State
  const [templates, setTemplates] = useState([]);
  const [manufacturers, setManufacturers] = useState([]);
  const [selectedTemplate, setSelectedTemplate] = useState(null);
  const [loading, setLoading] = useState(true);
  const [notification, setNotification] = useState(null);
  const [view, setView] = useState('list'); // list, edit, create, test
  const [filterManufacturer, setFilterManufacturer] = useState('all');
  const [searchTerm, setSearchTerm] = useState('');
  const [targetFields, setTargetFields] = useState([]);

  // Edit form state
  const [editForm, setEditForm] = useState({
    name: '',
    manufacturer: '',
    description: '',
    file_type: 'xlsx',
    filename_patterns: [],
    header_row_index: 1,
    column_mappings: {},
    is_active: true
  });

  // Test state
  const [testFile, setTestFile] = useState(null);
  const [testResults, setTestResults] = useState(null);
  const [testing, setTesting] = useState(false);

  // Load data on mount
  useEffect(() => {
    loadTemplates();
    loadManufacturers();
    loadTargetFields();
  }, []);

  const showNotification = (message, type = 'success') => {
    setNotification({ message, type });
    setTimeout(() => setNotification(null), 4000);
  };

  const loadTemplates = async () => {
    try {
      setLoading(true);
      const response = await authFetch(`${API_BASE}/import-templates?active_only=false`);
      const data = await response.json();
      if (data.success) {
        setTemplates(data.data);
      }
    } catch (error) {
      console.error('Error loading templates:', error);
      showNotification('Failed to load templates', 'error');
    } finally {
      setLoading(false);
    }
  };

  const loadManufacturers = async () => {
    try {
      const response = await authFetch(`${API_BASE}/import-templates/manufacturers`);
      const data = await response.json();
      if (data.success) {
        setManufacturers(data.data);
      }
    } catch (error) {
      console.error('Error loading manufacturers:', error);
    }
  };

  const loadTargetFields = async () => {
    try {
      const response = await authFetch(`${API_BASE}/import-templates/target-fields`);
      const data = await response.json();
      if (data.success) {
        setTargetFields(data.data);
      }
    } catch (error) {
      console.error('Error loading target fields:', error);
    }
  };

  const handleCreateTemplate = () => {
    setEditForm({
      name: '',
      manufacturer: '',
      description: '',
      file_type: 'xlsx',
      filename_patterns: [],
      header_row_index: 1,
      column_mappings: {},
      is_active: true
    });
    setSelectedTemplate(null);
    setView('edit');
  };

  const handleEditTemplate = async (template) => {
    try {
      const response = await authFetch(`${API_BASE}/import-templates/${template.id}`);
      const data = await response.json();
      if (data.success) {
        const t = data.data;
        setEditForm({
          name: t.name || '',
          manufacturer: t.manufacturer || '',
          description: t.description || '',
          file_type: t.file_type || 'xlsx',
          filename_patterns: t.filename_patterns || [],
          header_row_index: t.header_row_index || 1,
          column_mappings: t.column_mappings || {},
          is_active: t.is_active !== false
        });
        setSelectedTemplate(t);
        setView('edit');
      }
    } catch (error) {
      console.error('Error loading template details:', error);
      showNotification('Failed to load template details', 'error');
    }
  };

  const handleSaveTemplate = async () => {
    try {
      const payload = {
        ...editForm,
        filename_patterns: editForm.filename_patterns.filter(p => p.trim())
      };

      let response;
      if (selectedTemplate) {
        response = await authFetch(`${API_BASE}/import-templates/${selectedTemplate.id}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload)
        });
      } else {
        response = await authFetch(`${API_BASE}/import-templates`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload)
        });
      }

      const data = await response.json();
      if (data.success) {
        showNotification(selectedTemplate ? 'Template updated successfully' : 'Template created successfully');
        setView('list');
        loadTemplates();
        loadManufacturers();
      } else {
        showNotification(data.error || 'Failed to save template', 'error');
      }
    } catch (error) {
      console.error('Error saving template:', error);
      showNotification('Failed to save template', 'error');
    }
  };

  const handleCloneTemplate = async (template) => {
    const newName = prompt('Enter name for cloned template:', `${template.name} (Copy)`);
    if (!newName) return;

    try {
      const response = await authFetch(`${API_BASE}/import-templates/${template.id}/clone`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: newName })
      });
      const data = await response.json();
      if (data.success) {
        showNotification('Template cloned successfully');
        loadTemplates();
      } else {
        showNotification(data.error || 'Failed to clone template', 'error');
      }
    } catch (error) {
      console.error('Error cloning template:', error);
      showNotification('Failed to clone template', 'error');
    }
  };

  const handleDeleteTemplate = async (template) => {
    if (!confirm(`Are you sure you want to delete "${template.name}"?`)) return;

    try {
      const response = await authFetch(`${API_BASE}/import-templates/${template.id}`, {
        method: 'DELETE'
      });
      const data = await response.json();
      if (data.success) {
        showNotification('Template deleted successfully');
        loadTemplates();
        loadManufacturers();
      } else {
        showNotification(data.error || 'Failed to delete template', 'error');
      }
    } catch (error) {
      console.error('Error deleting template:', error);
      showNotification('Failed to delete template', 'error');
    }
  };

  const handleTestTemplate = async (template) => {
    setSelectedTemplate(template);
    setTestFile(null);
    setTestResults(null);
    setView('test');
  };

  const runTest = async () => {
    if (!testFile || !selectedTemplate) return;

    setTesting(true);
    try {
      // First parse the file
      const formData = new FormData();
      formData.append('file', testFile);

      const parseResponse = await authFetch(`${API_BASE}/import-templates/parse-file`, {
        method: 'POST',
        body: formData
      });
      const parseData = await parseResponse.json();

      if (!parseData.success) {
        showNotification(parseData.error || 'Failed to parse file', 'error');
        return;
      }

      // Then test the template
      const testResponse = await authFetch(`${API_BASE}/import-templates/${selectedTemplate.id}/test`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          headers: parseData.data.headers,
          sampleData: parseData.data.sampleRows
        })
      });
      const testData = await testResponse.json();

      if (testData.success) {
        setTestResults({
          ...testData.data,
          fileInfo: {
            name: testFile.name,
            headers: parseData.data.headers,
            totalRows: parseData.data.totalRows
          }
        });
      } else {
        showNotification(testData.error || 'Test failed', 'error');
      }
    } catch (error) {
      console.error('Error testing template:', error);
      showNotification('Test failed: ' + error.message, 'error');
    } finally {
      setTesting(false);
    }
  };

  const addColumnMapping = (sourceColumn, targetField) => {
    setEditForm(prev => ({
      ...prev,
      column_mappings: {
        ...prev.column_mappings,
        [sourceColumn]: {
          targetField,
          transform: targetField.includes('cost') || targetField.includes('price') || targetField.includes('msrp')
            ? 'multiply_100'
            : null
        }
      }
    }));
  };

  const removeColumnMapping = (sourceColumn) => {
    setEditForm(prev => {
      const newMappings = { ...prev.column_mappings };
      delete newMappings[sourceColumn];
      return { ...prev, column_mappings: newMappings };
    });
  };

  const addFilenamePattern = () => {
    setEditForm(prev => ({
      ...prev,
      filename_patterns: [...prev.filename_patterns, '']
    }));
  };

  const updateFilenamePattern = (index, value) => {
    setEditForm(prev => {
      const patterns = [...prev.filename_patterns];
      patterns[index] = value;
      return { ...prev, filename_patterns: patterns };
    });
  };

  const removeFilenamePattern = (index) => {
    setEditForm(prev => ({
      ...prev,
      filename_patterns: prev.filename_patterns.filter((_, i) => i !== index)
    }));
  };

  // Filter templates
  const filteredTemplates = templates.filter(t => {
    if (filterManufacturer !== 'all' && t.manufacturer !== filterManufacturer) return false;
    if (searchTerm && !t.name.toLowerCase().includes(searchTerm.toLowerCase()) &&
        !t.manufacturer.toLowerCase().includes(searchTerm.toLowerCase())) return false;
    return true;
  });

  // Group templates by manufacturer
  const groupedTemplates = filteredTemplates.reduce((acc, template) => {
    const mfr = template.manufacturer || 'Other';
    if (!acc[mfr]) acc[mfr] = [];
    acc[mfr].push(template);
    return acc;
  }, {});

  // Render list view
  const renderList = () => (
    <div>
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '24px' }}>
        <div>
          <h2 style={{ margin: '0 0 4px 0', fontSize: '24px', fontWeight: 'bold' }}>Import Templates</h2>
          <p style={{ margin: 0, color: '#6b7280', fontSize: '14px' }}>
            Manage manufacturer-specific column mappings for quick imports
          </p>
        </div>
        <button
          onClick={handleCreateTemplate}
          style={{
            padding: '12px 24px',
            background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
            color: 'white',
            border: 'none',
            borderRadius: '8px',
            cursor: 'pointer',
            fontSize: '15px',
            fontWeight: '600'
          }}
        >
          + Create Template
        </button>
      </div>

      {/* Filters */}
      <div style={{ display: 'flex', gap: '16px', marginBottom: '24px' }}>
        <input
          type="text"
          placeholder="Search templates..."
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          style={{
            flex: 1,
            padding: '10px 16px',
            border: '2px solid #e5e7eb',
            borderRadius: '8px',
            fontSize: '14px'
          }}
        />
        <select
          value={filterManufacturer}
          onChange={(e) => setFilterManufacturer(e.target.value)}
          style={{
            padding: '10px 16px',
            border: '2px solid #e5e7eb',
            borderRadius: '8px',
            fontSize: '14px',
            minWidth: '200px'
          }}
        >
          <option value="all">All Manufacturers</option>
          {manufacturers.map(m => (
            <option key={m.manufacturer} value={m.manufacturer}>
              {m.manufacturer} ({m.template_count})
            </option>
          ))}
        </select>
      </div>

      {/* Stats */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '16px', marginBottom: '24px' }}>
        <div style={{ background: '#f0fdf4', padding: '16px', borderRadius: '8px', border: '1px solid #bbf7d0' }}>
          <div style={{ fontSize: '24px', fontWeight: 'bold', color: '#16a34a' }}>{templates.length}</div>
          <div style={{ fontSize: '13px', color: '#15803d' }}>Total Templates</div>
        </div>
        <div style={{ background: '#eff6ff', padding: '16px', borderRadius: '8px', border: '1px solid #bfdbfe' }}>
          <div style={{ fontSize: '24px', fontWeight: 'bold', color: '#2563eb' }}>{manufacturers.length}</div>
          <div style={{ fontSize: '13px', color: '#1d4ed8' }}>Manufacturers</div>
        </div>
        <div style={{ background: '#fef3c7', padding: '16px', borderRadius: '8px', border: '1px solid #fde68a' }}>
          <div style={{ fontSize: '24px', fontWeight: 'bold', color: '#d97706' }}>
            {templates.filter(t => t.is_active).length}
          </div>
          <div style={{ fontSize: '13px', color: '#b45309' }}>Active</div>
        </div>
        <div style={{ background: '#f3e8ff', padding: '16px', borderRadius: '8px', border: '1px solid #d8b4fe' }}>
          <div style={{ fontSize: '24px', fontWeight: 'bold', color: '#7c3aed' }}>
            {templates.reduce((sum, t) => sum + (t.use_count || 0), 0)}
          </div>
          <div style={{ fontSize: '13px', color: '#6d28d9' }}>Total Uses</div>
        </div>
      </div>

      {/* Template List */}
      {loading ? (
        <div style={{ textAlign: 'center', padding: '40px', color: '#6b7280' }}>Loading templates...</div>
      ) : Object.keys(groupedTemplates).length === 0 ? (
        <div style={{ textAlign: 'center', padding: '40px', background: '#f9fafb', borderRadius: '12px' }}>
          <div style={{ fontSize: '48px', marginBottom: '16px' }}>📋</div>
          <div style={{ fontSize: '18px', fontWeight: '600', marginBottom: '8px' }}>No templates found</div>
          <div style={{ color: '#6b7280', marginBottom: '16px' }}>Create your first template to get started</div>
          <button
            onClick={handleCreateTemplate}
            style={{
              padding: '10px 20px',
              background: '#667eea',
              color: 'white',
              border: 'none',
              borderRadius: '8px',
              cursor: 'pointer'
            }}
          >
            Create Template
          </button>
        </div>
      ) : (
        Object.entries(groupedTemplates).sort().map(([manufacturer, mfrTemplates]) => (
          <div key={manufacturer} style={{ marginBottom: '24px' }}>
            <h3 style={{
              margin: '0 0 12px 0',
              fontSize: '16px',
              fontWeight: '600',
              color: '#374151',
              display: 'flex',
              alignItems: 'center',
              gap: '8px'
            }}>
              <span style={{
                background: '#667eea',
                color: 'white',
                padding: '2px 10px',
                borderRadius: '12px',
                fontSize: '14px'
              }}>
                {manufacturer}
              </span>
              <span style={{ color: '#9ca3af', fontWeight: 'normal' }}>
                {mfrTemplates.length} template{mfrTemplates.length !== 1 ? 's' : ''}
              </span>
            </h3>
            <div style={{ display: 'grid', gap: '12px' }}>
              {mfrTemplates.map(template => (
                <div
                  key={template.id}
                  style={{
                    background: 'white',
                    border: '1px solid #e5e7eb',
                    borderRadius: '10px',
                    padding: '16px 20px',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '16px'
                  }}
                >
                  {/* Status indicator */}
                  <div style={{
                    width: '10px',
                    height: '10px',
                    borderRadius: '50%',
                    background: template.is_active ? '#10b981' : '#9ca3af'
                  }} />

                  {/* Template info */}
                  <div style={{ flex: 1 }}>
                    <div style={{ fontWeight: '600', fontSize: '15px', marginBottom: '4px' }}>
                      {template.name}
                      {template.is_default && (
                        <span style={{
                          marginLeft: '8px',
                          background: '#fef3c7',
                          color: '#b45309',
                          padding: '2px 8px',
                          borderRadius: '4px',
                          fontSize: '11px',
                          fontWeight: '600'
                        }}>
                          DEFAULT
                        </span>
                      )}
                    </div>
                    <div style={{ fontSize: '13px', color: '#6b7280' }}>
                      {template.file_type?.toUpperCase() || 'Any'}
                      {template.filename_patterns?.length > 0 && (
                        <span> • Patterns: {template.filename_patterns.join(', ')}</span>
                      )}
                    </div>
                  </div>

                  {/* Stats */}
                  <div style={{ textAlign: 'center', minWidth: '60px' }}>
                    <div style={{ fontSize: '18px', fontWeight: '600', color: '#667eea' }}>{template.use_count || 0}</div>
                    <div style={{ fontSize: '11px', color: '#9ca3af' }}>uses</div>
                  </div>

                  <div style={{ textAlign: 'center', minWidth: '60px' }}>
                    <div style={{ fontSize: '18px', fontWeight: '600', color: template.success_rate >= 90 ? '#10b981' : template.success_rate >= 70 ? '#f59e0b' : '#ef4444' }}>
                      {template.success_rate || 100}%
                    </div>
                    <div style={{ fontSize: '11px', color: '#9ca3af' }}>success</div>
                  </div>

                  {/* Actions */}
                  <div style={{ display: 'flex', gap: '8px' }}>
                    <button
                      onClick={() => handleTestTemplate(template)}
                      style={{
                        padding: '6px 12px',
                        background: '#f3f4f6',
                        color: '#374151',
                        border: 'none',
                        borderRadius: '6px',
                        cursor: 'pointer',
                        fontSize: '13px'
                      }}
                    >
                      Test
                    </button>
                    <button
                      onClick={() => handleEditTemplate(template)}
                      style={{
                        padding: '6px 12px',
                        background: '#eff6ff',
                        color: '#2563eb',
                        border: 'none',
                        borderRadius: '6px',
                        cursor: 'pointer',
                        fontSize: '13px'
                      }}
                    >
                      Edit
                    </button>
                    <button
                      onClick={() => handleCloneTemplate(template)}
                      style={{
                        padding: '6px 12px',
                        background: '#f0fdf4',
                        color: '#16a34a',
                        border: 'none',
                        borderRadius: '6px',
                        cursor: 'pointer',
                        fontSize: '13px'
                      }}
                    >
                      Clone
                    </button>
                    <button
                      onClick={() => handleDeleteTemplate(template)}
                      style={{
                        padding: '6px 12px',
                        background: '#fef2f2',
                        color: '#dc2626',
                        border: 'none',
                        borderRadius: '6px',
                        cursor: 'pointer',
                        fontSize: '13px'
                      }}
                    >
                      Delete
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        ))
      )}
    </div>
  );

  // Render edit/create view
  const renderEdit = () => (
    <div>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '16px', marginBottom: '24px' }}>
        <button
          onClick={() => setView('list')}
          style={{
            padding: '8px 16px',
            background: '#f3f4f6',
            color: '#374151',
            border: 'none',
            borderRadius: '6px',
            cursor: 'pointer'
          }}
        >
          Back
        </button>
        <h2 style={{ margin: 0, fontSize: '24px', fontWeight: 'bold' }}>
          {selectedTemplate ? 'Edit Template' : 'Create Template'}
        </h2>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '24px' }}>
        {/* Left Column - Basic Info */}
        <div style={{ background: 'white', borderRadius: '12px', padding: '24px', border: '1px solid #e5e7eb' }}>
          <h3 style={{ margin: '0 0 20px 0', fontSize: '18px', fontWeight: '600' }}>Basic Information</h3>

          <div style={{ marginBottom: '16px' }}>
            <label style={{ display: 'block', marginBottom: '6px', fontSize: '14px', fontWeight: '500' }}>
              Template Name *
            </label>
            <input
              type="text"
              value={editForm.name}
              onChange={(e) => setEditForm(prev => ({ ...prev, name: e.target.value }))}
              placeholder="e.g., Samsung Dealer Price List"
              style={{
                width: '100%',
                padding: '10px 14px',
                border: '2px solid #e5e7eb',
                borderRadius: '8px',
                fontSize: '14px'
              }}
            />
          </div>

          <div style={{ marginBottom: '16px' }}>
            <label style={{ display: 'block', marginBottom: '6px', fontSize: '14px', fontWeight: '500' }}>
              Manufacturer *
            </label>
            <input
              type="text"
              value={editForm.manufacturer}
              onChange={(e) => setEditForm(prev => ({ ...prev, manufacturer: e.target.value }))}
              placeholder="e.g., Samsung"
              list="manufacturer-list"
              style={{
                width: '100%',
                padding: '10px 14px',
                border: '2px solid #e5e7eb',
                borderRadius: '8px',
                fontSize: '14px'
              }}
            />
            <datalist id="manufacturer-list">
              {manufacturers.map(m => (
                <option key={m.manufacturer} value={m.manufacturer} />
              ))}
            </datalist>
          </div>

          <div style={{ marginBottom: '16px' }}>
            <label style={{ display: 'block', marginBottom: '6px', fontSize: '14px', fontWeight: '500' }}>
              Description
            </label>
            <textarea
              value={editForm.description}
              onChange={(e) => setEditForm(prev => ({ ...prev, description: e.target.value }))}
              placeholder="Optional description of this template"
              rows={3}
              style={{
                width: '100%',
                padding: '10px 14px',
                border: '2px solid #e5e7eb',
                borderRadius: '8px',
                fontSize: '14px',
                resize: 'vertical'
              }}
            />
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px', marginBottom: '16px' }}>
            <div>
              <label style={{ display: 'block', marginBottom: '6px', fontSize: '14px', fontWeight: '500' }}>
                File Type
              </label>
              <select
                value={editForm.file_type}
                onChange={(e) => setEditForm(prev => ({ ...prev, file_type: e.target.value }))}
                style={{
                  width: '100%',
                  padding: '10px 14px',
                  border: '2px solid #e5e7eb',
                  borderRadius: '8px',
                  fontSize: '14px'
                }}
              >
                <option value="xlsx">Excel (.xlsx)</option>
                <option value="xls">Excel (.xls)</option>
                <option value="csv">CSV</option>
                <option value="">Any</option>
              </select>
            </div>
            <div>
              <label style={{ display: 'block', marginBottom: '6px', fontSize: '14px', fontWeight: '500' }}>
                Header Row
              </label>
              <input
                type="number"
                min="1"
                max="20"
                value={editForm.header_row_index}
                onChange={(e) => setEditForm(prev => ({ ...prev, header_row_index: parseInt(e.target.value) || 1 }))}
                style={{
                  width: '100%',
                  padding: '10px 14px',
                  border: '2px solid #e5e7eb',
                  borderRadius: '8px',
                  fontSize: '14px'
                }}
              />
            </div>
          </div>

          <div style={{ marginBottom: '16px' }}>
            <label style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer' }}>
              <input
                type="checkbox"
                checked={editForm.is_active}
                onChange={(e) => setEditForm(prev => ({ ...prev, is_active: e.target.checked }))}
              />
              <span style={{ fontSize: '14px' }}>Template is active</span>
            </label>
          </div>

          {/* Filename Patterns */}
          <div>
            <label style={{ display: 'block', marginBottom: '6px', fontSize: '14px', fontWeight: '500' }}>
              Filename Patterns (for auto-matching)
            </label>
            {editForm.filename_patterns.map((pattern, index) => (
              <div key={index} style={{ display: 'flex', gap: '8px', marginBottom: '8px' }}>
                <input
                  type="text"
                  value={pattern}
                  onChange={(e) => updateFilenamePattern(index, e.target.value)}
                  placeholder="e.g., samsung, sam_dealer"
                  style={{
                    flex: 1,
                    padding: '8px 12px',
                    border: '2px solid #e5e7eb',
                    borderRadius: '6px',
                    fontSize: '13px'
                  }}
                />
                <button
                  onClick={() => removeFilenamePattern(index)}
                  style={{
                    padding: '8px 12px',
                    background: '#fef2f2',
                    color: '#dc2626',
                    border: 'none',
                    borderRadius: '6px',
                    cursor: 'pointer'
                  }}
                >
                  Remove
                </button>
              </div>
            ))}
            <button
              onClick={addFilenamePattern}
              style={{
                padding: '8px 16px',
                background: '#f3f4f6',
                color: '#374151',
                border: 'none',
                borderRadius: '6px',
                cursor: 'pointer',
                fontSize: '13px'
              }}
            >
              + Add Pattern
            </button>
          </div>
        </div>

        {/* Right Column - Column Mappings */}
        <div style={{ background: 'white', borderRadius: '12px', padding: '24px', border: '1px solid #e5e7eb' }}>
          <h3 style={{ margin: '0 0 20px 0', fontSize: '18px', fontWeight: '600' }}>Column Mappings</h3>

          <p style={{ margin: '0 0 16px 0', fontSize: '13px', color: '#6b7280' }}>
            Map source column names (from the file) to target fields in your product database.
          </p>

          {/* Existing mappings */}
          {Object.entries(editForm.column_mappings).length > 0 ? (
            <div style={{ marginBottom: '20px' }}>
              {Object.entries(editForm.column_mappings).map(([source, config]) => (
                <div
                  key={source}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '8px',
                    padding: '10px 12px',
                    background: '#f9fafb',
                    borderRadius: '6px',
                    marginBottom: '8px'
                  }}
                >
                  <span style={{ flex: 1, fontSize: '13px', fontWeight: '500' }}>{source}</span>
                  <span style={{ color: '#9ca3af' }}>→</span>
                  <span style={{
                    flex: 1,
                    fontSize: '13px',
                    color: '#667eea',
                    fontWeight: '500'
                  }}>
                    {config.targetField}
                    {config.transform && (
                      <span style={{ color: '#9ca3af', fontWeight: 'normal' }}> (×100)</span>
                    )}
                  </span>
                  <button
                    onClick={() => removeColumnMapping(source)}
                    style={{
                      padding: '4px 8px',
                      background: '#fef2f2',
                      color: '#dc2626',
                      border: 'none',
                      borderRadius: '4px',
                      cursor: 'pointer',
                      fontSize: '12px'
                    }}
                  >
                    ×
                  </button>
                </div>
              ))}
            </div>
          ) : (
            <div style={{
              padding: '20px',
              background: '#f9fafb',
              borderRadius: '8px',
              textAlign: 'center',
              marginBottom: '20px'
            }}>
              <div style={{ color: '#9ca3af', fontSize: '14px' }}>No mappings defined yet</div>
            </div>
          )}

          {/* Add new mapping */}
          <div style={{ borderTop: '1px solid #e5e7eb', paddingTop: '16px' }}>
            <div style={{ fontSize: '14px', fontWeight: '500', marginBottom: '12px' }}>Add New Mapping</div>
            <div style={{ display: 'flex', gap: '8px' }}>
              <input
                type="text"
                id="new-source-column"
                placeholder="Source column name"
                style={{
                  flex: 1,
                  padding: '8px 12px',
                  border: '2px solid #e5e7eb',
                  borderRadius: '6px',
                  fontSize: '13px'
                }}
              />
              <select
                id="new-target-field"
                style={{
                  flex: 1,
                  padding: '8px 12px',
                  border: '2px solid #e5e7eb',
                  borderRadius: '6px',
                  fontSize: '13px'
                }}
              >
                <option value="">Select target field</option>
                {targetFields.map(field => (
                  <option key={field.field} value={field.field}>
                    {field.label} ({field.field})
                  </option>
                ))}
              </select>
              <button
                onClick={() => {
                  const source = document.getElementById('new-source-column').value.trim();
                  const target = document.getElementById('new-target-field').value;
                  if (source && target) {
                    addColumnMapping(source, target);
                    document.getElementById('new-source-column').value = '';
                    document.getElementById('new-target-field').value = '';
                  }
                }}
                style={{
                  padding: '8px 16px',
                  background: '#667eea',
                  color: 'white',
                  border: 'none',
                  borderRadius: '6px',
                  cursor: 'pointer',
                  fontSize: '13px'
                }}
              >
                Add
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Save Button */}
      <div style={{ marginTop: '24px', display: 'flex', gap: '12px', justifyContent: 'flex-end' }}>
        <button
          onClick={() => setView('list')}
          style={{
            padding: '12px 24px',
            background: '#f3f4f6',
            color: '#374151',
            border: 'none',
            borderRadius: '8px',
            cursor: 'pointer',
            fontSize: '15px',
            fontWeight: '500'
          }}
        >
          Cancel
        </button>
        <button
          onClick={handleSaveTemplate}
          disabled={!editForm.name || !editForm.manufacturer}
          style={{
            padding: '12px 24px',
            background: editForm.name && editForm.manufacturer ? 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)' : '#9ca3af',
            color: 'white',
            border: 'none',
            borderRadius: '8px',
            cursor: editForm.name && editForm.manufacturer ? 'pointer' : 'not-allowed',
            fontSize: '15px',
            fontWeight: '600'
          }}
        >
          {selectedTemplate ? 'Save Changes' : 'Create Template'}
        </button>
      </div>
    </div>
  );

  // Render test view
  const renderTest = () => (
    <div>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '16px', marginBottom: '24px' }}>
        <button
          onClick={() => setView('list')}
          style={{
            padding: '8px 16px',
            background: '#f3f4f6',
            color: '#374151',
            border: 'none',
            borderRadius: '6px',
            cursor: 'pointer'
          }}
        >
          Back
        </button>
        <h2 style={{ margin: 0, fontSize: '24px', fontWeight: 'bold' }}>
          Test Template: {selectedTemplate?.name}
        </h2>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '24px' }}>
        {/* Left - File Upload */}
        <div style={{ background: 'white', borderRadius: '12px', padding: '24px', border: '1px solid #e5e7eb' }}>
          <h3 style={{ margin: '0 0 16px 0', fontSize: '18px', fontWeight: '600' }}>Upload Test File</h3>

          <div
            style={{
              border: '2px dashed #d1d5db',
              borderRadius: '12px',
              padding: '40px',
              textAlign: 'center',
              background: testFile ? '#f0fdf4' : '#f9fafb',
              cursor: 'pointer'
            }}
            onClick={() => document.getElementById('test-file-input').click()}
          >
            <input
              id="test-file-input"
              type="file"
              accept=".csv,.xlsx,.xls"
              style={{ display: 'none' }}
              onChange={(e) => {
                setTestFile(e.target.files[0]);
                setTestResults(null);
              }}
            />
            {testFile ? (
              <div>
                <div style={{ fontSize: '48px', marginBottom: '12px' }}>📄</div>
                <div style={{ fontWeight: '600', marginBottom: '4px' }}>{testFile.name}</div>
                <div style={{ color: '#6b7280', fontSize: '13px' }}>
                  {(testFile.size / 1024).toFixed(2)} KB
                </div>
              </div>
            ) : (
              <div>
                <div style={{ fontSize: '48px', marginBottom: '12px' }}>📤</div>
                <div style={{ fontWeight: '500', marginBottom: '4px' }}>Click to upload a test file</div>
                <div style={{ color: '#6b7280', fontSize: '13px' }}>CSV, XLSX, or XLS</div>
              </div>
            )}
          </div>

          <button
            onClick={runTest}
            disabled={!testFile || testing}
            style={{
              marginTop: '16px',
              width: '100%',
              padding: '12px 24px',
              background: testFile && !testing ? '#667eea' : '#9ca3af',
              color: 'white',
              border: 'none',
              borderRadius: '8px',
              cursor: testFile && !testing ? 'pointer' : 'not-allowed',
              fontSize: '15px',
              fontWeight: '600'
            }}
          >
            {testing ? 'Testing...' : 'Run Test'}
          </button>
        </div>

        {/* Right - Results */}
        <div style={{ background: 'white', borderRadius: '12px', padding: '24px', border: '1px solid #e5e7eb' }}>
          <h3 style={{ margin: '0 0 16px 0', fontSize: '18px', fontWeight: '600' }}>Test Results</h3>

          {testResults ? (
            <div>
              {/* File info */}
              <div style={{ marginBottom: '16px', padding: '12px', background: '#f9fafb', borderRadius: '8px' }}>
                <div style={{ fontSize: '13px', color: '#6b7280', marginBottom: '4px' }}>File</div>
                <div style={{ fontWeight: '500' }}>{testResults.fileInfo.name}</div>
                <div style={{ fontSize: '13px', color: '#6b7280' }}>
                  {testResults.fileInfo.totalRows} rows, {testResults.fileInfo.headers.length} columns
                </div>
              </div>

              {/* Match results */}
              <div style={{ marginBottom: '16px' }}>
                <div style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '8px',
                  padding: '12px',
                  background: testResults.matchScore >= 80 ? '#f0fdf4' : testResults.matchScore >= 50 ? '#fef3c7' : '#fef2f2',
                  borderRadius: '8px'
                }}>
                  <span style={{ fontSize: '24px' }}>
                    {testResults.matchScore >= 80 ? '✅' : testResults.matchScore >= 50 ? '⚠️' : '❌'}
                  </span>
                  <div>
                    <div style={{ fontWeight: '600' }}>Match Score: {testResults.matchScore}%</div>
                    <div style={{ fontSize: '13px', color: '#6b7280' }}>
                      {testResults.mappedColumns} of {testResults.totalColumns} columns mapped
                    </div>
                  </div>
                </div>
              </div>

              {/* Column mappings */}
              <div>
                <div style={{ fontSize: '14px', fontWeight: '500', marginBottom: '8px' }}>Column Mappings</div>
                <div style={{ maxHeight: '250px', overflowY: 'auto' }}>
                  {testResults.mappings?.map((m, i) => (
                    <div
                      key={i}
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: '8px',
                        padding: '8px 10px',
                        background: m.mapped ? '#f0fdf4' : '#f9fafb',
                        borderRadius: '4px',
                        marginBottom: '4px',
                        fontSize: '13px'
                      }}
                    >
                      <span style={{ flex: 1 }}>{m.source}</span>
                      <span style={{ color: '#9ca3af' }}>→</span>
                      <span style={{ flex: 1, color: m.mapped ? '#16a34a' : '#9ca3af' }}>
                        {m.target || 'Not mapped'}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          ) : (
            <div style={{
              textAlign: 'center',
              padding: '40px',
              color: '#9ca3af'
            }}>
              Upload a file and run test to see results
            </div>
          )}
        </div>
      </div>
    </div>
  );

  return (
    <div style={{
      padding: '30px',
      fontFamily: 'system-ui, -apple-system, sans-serif',
      background: '#f9fafb',
      minHeight: 'calc(100vh - 140px)'
    }}>
      {/* Notification */}
      {notification && (
        <div style={{
          position: 'fixed',
          top: '20px',
          right: '20px',
          zIndex: 9999,
          background: notification.type === 'success' ? '#10b981' : '#ef4444',
          color: 'white',
          padding: '16px 24px',
          borderRadius: '8px',
          boxShadow: '0 10px 40px rgba(0,0,0,0.2)',
          fontWeight: '500'
        }}>
          {notification.type === 'success' ? '✓' : '×'} {notification.message}
        </div>
      )}

      <div style={{ maxWidth: '1200px', margin: '0 auto' }}>
        {view === 'list' && renderList()}
        {view === 'edit' && renderEdit()}
        {view === 'test' && renderTest()}
      </div>
    </div>
  );
};

export default ManufacturerTemplateManager;
