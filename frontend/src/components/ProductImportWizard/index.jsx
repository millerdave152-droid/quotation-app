import { authFetch } from '../../services/authFetch';
/**
 * ProductImportWizard
 * 4-step wizard for importing products from manufacturer price sheets
 *
 * Steps:
 * 1. Upload & Manufacturer Selection
 * 2. Column Mapping (AI-assisted)
 * 3. Validation Preview
 * 4. Import Results
 */

import React, { useState, useRef, useEffect } from 'react';

const API_BASE = `${process.env.REACT_APP_API_URL || 'http://localhost:3001'}/api`;

const ProductImportWizard = ({ onClose, onImportComplete }) => {
  // Current step (1-4)
  const [currentStep, setCurrentStep] = useState(1);

  // Step 1: Upload state
  const [file, setFile] = useState(null);
  const [manufacturer, setManufacturer] = useState('');
  const [manufacturers, setManufacturers] = useState([]);
  const [templates, setTemplates] = useState([]);
  const [selectedTemplate, setSelectedTemplate] = useState(null);
  const [headerRowIndex, setHeaderRowIndex] = useState(1);
  const [isUploading, setIsUploading] = useState(false);

  // Step 2: Column mapping state
  const [parsedData, setParsedData] = useState(null);
  const [columnMappings, setColumnMappings] = useState({});
  const [targetFields, setTargetFields] = useState([]);
  const [detectionConfidence, setDetectionConfidence] = useState(0);

  // Step 3: Validation state
  const [validationResults, setValidationResults] = useState(null);
  const [isValidating, setIsValidating] = useState(false);

  // Step 4: Import state
  const [importResults, setImportResults] = useState(null);
  const [isImporting, setIsImporting] = useState(false);
  const [saveAsTemplate, setSaveAsTemplate] = useState(false);
  const [newTemplateName, setNewTemplateName] = useState('');

  // General state
  const [error, setError] = useState(null);
  const [notification, setNotification] = useState(null);
  const fileInputRef = useRef(null);

  // Load initial data
  useEffect(() => {
    loadManufacturers();
    loadTargetFields();
  }, []);

  const loadManufacturers = async () => {
    try {
      const response = await authFetch(`${API_BASE}/import-templates/manufacturers`);
      const data = await response.json();
      if (data.success) {
        setManufacturers(data.data || []);
      }
    } catch (err) {
      console.error('Failed to load manufacturers:', err);
    }
  };

  const loadTargetFields = async () => {
    try {
      const response = await authFetch(`${API_BASE}/import-templates/target-fields`);
      const data = await response.json();
      if (data.success) {
        setTargetFields(data.data || []);
      }
    } catch (err) {
      console.error('Failed to load target fields:', err);
    }
  };

  const loadTemplatesForManufacturer = async (mfr) => {
    try {
      const response = await authFetch(`${API_BASE}/import-templates?manufacturer=${encodeURIComponent(mfr)}`);
      const data = await response.json();
      if (data.success) {
        setTemplates(data.data || []);
        // Auto-select default template if exists
        const defaultTemplate = data.data.find(t => t.is_default);
        if (defaultTemplate) {
          setSelectedTemplate(defaultTemplate);
        }
      }
    } catch (err) {
      console.error('Failed to load templates:', err);
    }
  };

  const showNotification = (message, type = 'success') => {
    setNotification({ message, type });
    setTimeout(() => setNotification(null), 4000);
  };

  // Step 1: Handle file selection
  const handleFileSelect = async (e) => {
    const selectedFile = e.target.files[0];
    if (!selectedFile) return;

    const ext = selectedFile.name.toLowerCase().slice(selectedFile.name.lastIndexOf('.'));
    if (!['.csv', '.xlsx', '.xls'].includes(ext)) {
      setError('Invalid file type. Please upload CSV or Excel files.');
      return;
    }

    setFile(selectedFile);
    setError(null);

    // Try to detect manufacturer from filename
    const filename = selectedFile.name.toLowerCase();
    const knownMfrs = ['samsung', 'lg', 'whirlpool', 'ge', 'frigidaire', 'electrolux', 'maytag', 'kitchenaid'];
    for (const mfr of knownMfrs) {
      if (filename.includes(mfr)) {
        setManufacturer(mfr.charAt(0).toUpperCase() + mfr.slice(1));
        loadTemplatesForManufacturer(mfr);
        break;
      }
    }
  };

  // Step 1: Parse file and go to step 2
  const handleParseFile = async () => {
    if (!file) {
      setError('Please select a file to import');
      return;
    }

    setIsUploading(true);
    setError(null);

    try {
      const formData = new FormData();
      formData.append('file', file);
      formData.append('headerRowIndex', headerRowIndex.toString());

      const response = await authFetch(`${API_BASE}/import-templates/parse-file`, {
        method: 'POST',
        body: formData
      });

      const data = await response.json();

      if (!data.success) {
        throw new Error(data.error || 'Failed to parse file');
      }

      setParsedData(data.data);

      // Apply template mappings if selected, otherwise use auto-detection
      if (selectedTemplate) {
        setColumnMappings(selectedTemplate.column_mappings || {});
        setDetectionConfidence(95);
      } else if (data.data.detection) {
        setColumnMappings(data.data.detection.mappings || {});
        setDetectionConfidence(data.data.detection.overallConfidence || 0);
      }

      // Check for template match
      if (data.data.templateMatch?.bestMatch && !selectedTemplate) {
        setSelectedTemplate(data.data.templateMatch.bestMatch.template);
        setColumnMappings(data.data.templateMatch.bestMatch.template.column_mappings || {});
        showNotification(`Matched template: ${data.data.templateMatch.bestMatch.templateName}`, 'success');
      }

      setCurrentStep(2);
    } catch (err) {
      setError(err.message);
    } finally {
      setIsUploading(false);
    }
  };

  // Step 2: Update column mapping
  const handleMappingChange = (sourceColumn, targetField) => {
    setColumnMappings(prev => ({
      ...prev,
      [sourceColumn]: {
        ...prev[sourceColumn],
        targetField: targetField
      }
    }));
  };

  // Step 2: Validate and go to step 3
  const handleValidate = async () => {
    setIsValidating(true);
    setError(null);

    try {
      // For now, do client-side validation preview
      const results = validateData(parsedData.sampleRows, columnMappings, parsedData.headers);
      setValidationResults(results);
      setCurrentStep(3);
    } catch (err) {
      setError(err.message);
    } finally {
      setIsValidating(false);
    }
  };

  // Client-side validation
  const validateData = (rows, mappings, headers) => {
    const results = {
      totalRows: rows.length,
      validRows: 0,
      invalidRows: 0,
      errors: [],
      warnings: [],
      preview: []
    };

    // Check required fields are mapped
    const mappedTargets = Object.values(mappings).map(m => m.targetField);
    if (!mappedTargets.includes('model')) {
      results.errors.push({ type: 'mapping', message: 'Model number field is required' });
    }
    if (!mappedTargets.includes('cost_cents')) {
      results.errors.push({ type: 'mapping', message: 'Cost field is required' });
    }

    // Process sample rows
    for (let i = 0; i < rows.length; i++) {
      const row = rows[i];
      const rowValues = Array.isArray(row) ? row : Object.values(row);
      const mappedRow = { _rowIndex: i + 1, _errors: [], _warnings: [] };

      for (const [sourceCol, config] of Object.entries(mappings)) {
        if (!config.targetField) continue;

        const headerIndex = headers.indexOf(sourceCol);
        if (headerIndex >= 0) {
          let value = rowValues[headerIndex];

          // Apply transformation
          if (config.transformation?.type === 'multiply_100' && value) {
            const numValue = parseFloat(value.toString().replace(/[$,]/g, ''));
            value = isNaN(numValue) ? 0 : Math.round(numValue * 100);
          }

          mappedRow[config.targetField] = value;

          // Validate required
          if (config.isRequired && !value) {
            mappedRow._errors.push(`Missing ${config.targetField}`);
          }
        }
      }

      if (mappedRow._errors.length > 0) {
        results.invalidRows++;
      } else {
        results.validRows++;
      }

      results.preview.push(mappedRow);
    }

    return results;
  };

  // Step 3: Execute import
  const handleImport = async () => {
    setIsImporting(true);
    setError(null);

    try {
      // Prepare import data
      const formData = new FormData();
      formData.append('file', file);
      formData.append('columnMappings', JSON.stringify(columnMappings));
      formData.append('headerRowIndex', headerRowIndex.toString());
      if (manufacturer) {
        formData.append('manufacturer', manufacturer);
      }

      const response = await authFetch(`${API_BASE}/products/import-universal`, {
        method: 'POST',
        body: formData
      });

      const response_data = await response.json();

      // API wraps response in data property
      const result = response_data.data || response_data;

      if (!response_data.success && !result.inserted) {
        throw new Error(response_data.error?.message || response_data.error || 'Import failed');
      }

      setImportResults({
        total: result.total || 0,
        inserted: result.inserted || 0,
        updated: result.updated || 0,
        failed: result.failed || 0,
        errors: result.validationErrors || []
      });

      // Record template usage if selected
      if (selectedTemplate) {
        try {
          await authFetch(`${API_BASE}/import-templates/${selectedTemplate.id}/record-usage`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              filename: file.name,
              fileType: file.name.split('.').pop(),
              matchMethod: 'template',
              total: result.total || 0,
              inserted: result.inserted || 0,
              updated: result.updated || 0,
              failed: result.failed || 0
            })
          });
        } catch (e) {
          console.warn('Failed to record template usage:', e);
        }
      }

      setCurrentStep(4);
    } catch (err) {
      setError(err.message);
    } finally {
      setIsImporting(false);
    }
  };

  // Step 4: Save as template
  const handleSaveAsTemplate = async () => {
    if (!newTemplateName.trim()) {
      setError('Please enter a template name');
      return;
    }

    try {
      const response = await authFetch(`${API_BASE}/import-templates`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: newTemplateName,
          manufacturer: manufacturer || 'Unknown',
          filenamePatterns: [file.name.toLowerCase().split('.')[0]],
          headerPatterns: parsedData.headers,
          columnMappings: columnMappings,
          headerRowIndex: headerRowIndex,
          isDefault: false
        })
      });

      const data = await response.json();
      if (data.success) {
        showNotification('Template saved successfully!', 'success');
        setSaveAsTemplate(false);
      } else {
        throw new Error(data.error || 'Failed to save template');
      }
    } catch (err) {
      setError(err.message);
    }
  };

  // Render step indicator
  const renderStepIndicator = () => (
    <div style={styles.stepIndicator}>
      {[1, 2, 3, 4].map(step => (
        <div key={step} style={styles.stepContainer}>
          <div style={{
            ...styles.stepCircle,
            backgroundColor: currentStep >= step ? '#667eea' : '#e5e7eb',
            color: currentStep >= step ? 'white' : '#9ca3af'
          }}>
            {currentStep > step ? '✓' : step}
          </div>
          <div style={{
            ...styles.stepLabel,
            color: currentStep >= step ? '#111827' : '#9ca3af'
          }}>
            {step === 1 && 'Upload'}
            {step === 2 && 'Map Columns'}
            {step === 3 && 'Validate'}
            {step === 4 && 'Results'}
          </div>
          {step < 4 && (
            <div style={{
              ...styles.stepLine,
              backgroundColor: currentStep > step ? '#667eea' : '#e5e7eb'
            }} />
          )}
        </div>
      ))}
    </div>
  );

  // Render Step 1: Upload
  const renderStep1 = () => (
    <div style={styles.stepContent}>
      <h3 style={styles.stepTitle}>Upload Price Sheet</h3>
      <p style={styles.stepDescription}>
        Upload a manufacturer price sheet (CSV or Excel) to import products
      </p>

      {/* File Upload */}
      <div
        style={styles.uploadArea}
        onClick={() => fileInputRef.current?.click()}
        onDragOver={(e) => e.preventDefault()}
        onDrop={(e) => {
          e.preventDefault();
          if (e.dataTransfer.files[0]) {
            handleFileSelect({ target: { files: e.dataTransfer.files } });
          }
        }}
      >
        <input
          ref={fileInputRef}
          type="file"
          accept=".csv,.xlsx,.xls"
          onChange={handleFileSelect}
          style={{ display: 'none' }}
        />
        {file ? (
          <div style={styles.fileInfo}>
            <span style={styles.fileIcon}>📄</span>
            <div>
              <div style={styles.fileName}>{file.name}</div>
              <div style={styles.fileSize}>{(file.size / 1024).toFixed(1)} KB</div>
            </div>
            <button
              onClick={(e) => { e.stopPropagation(); setFile(null); }}
              style={styles.removeFileBtn}
            >
              ✕
            </button>
          </div>
        ) : (
          <div style={styles.uploadPrompt}>
            <span style={styles.uploadIcon}>📁</span>
            <div style={styles.uploadText}>
              Click or drag file to upload
            </div>
            <div style={styles.uploadHint}>
              Supports CSV, XLSX, XLS (max 25MB)
            </div>
          </div>
        )}
      </div>

      {/* Manufacturer Selection */}
      <div style={styles.formGroup}>
        <label style={styles.label}>Manufacturer (optional)</label>
        <input
          type="text"
          value={manufacturer}
          onChange={(e) => {
            setManufacturer(e.target.value);
            if (e.target.value) {
              loadTemplatesForManufacturer(e.target.value);
            }
          }}
          placeholder="e.g., Samsung, LG, Whirlpool"
          style={styles.input}
          list="manufacturer-list"
        />
        <datalist id="manufacturer-list">
          {manufacturers.map(m => (
            <option key={m.manufacturer} value={m.manufacturer} />
          ))}
        </datalist>
      </div>

      {/* Template Selection */}
      {templates.length > 0 && (
        <div style={styles.formGroup}>
          <label style={styles.label}>Use Saved Template</label>
          <select
            value={selectedTemplate?.id || ''}
            onChange={(e) => {
              const template = templates.find(t => t.id === parseInt(e.target.value));
              setSelectedTemplate(template || null);
            }}
            style={styles.select}
          >
            <option value="">Auto-detect columns</option>
            {templates.map(t => (
              <option key={t.id} value={t.id}>
                {t.name} {t.is_default ? '(Default)' : ''} - {t.use_count} imports
              </option>
            ))}
          </select>
        </div>
      )}

      {/* Header Row Index */}
      <div style={styles.formGroup}>
        <label style={styles.label}>Header Row</label>
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap' }}>
          <input
            type="number"
            value={headerRowIndex}
            onChange={(e) => setHeaderRowIndex(Math.max(1, parseInt(e.target.value) || 1))}
            min="1"
            style={{ ...styles.input, width: '80px' }}
          />
          <div style={{ display: 'flex', gap: '5px' }}>
            <button
              type="button"
              onClick={() => setHeaderRowIndex(1)}
              style={{
                padding: '4px 8px',
                fontSize: '12px',
                backgroundColor: headerRowIndex === 1 ? '#3b82f6' : '#f3f4f6',
                color: headerRowIndex === 1 ? 'white' : '#374151',
                border: '1px solid #d1d5db',
                borderRadius: '4px',
                cursor: 'pointer'
              }}
            >
              Standard (1)
            </button>
            <button
              type="button"
              onClick={() => setHeaderRowIndex(4)}
              style={{
                padding: '4px 8px',
                fontSize: '12px',
                backgroundColor: headerRowIndex === 4 ? '#3b82f6' : '#f3f4f6',
                color: headerRowIndex === 4 ? 'white' : '#374151',
                border: '1px solid #d1d5db',
                borderRadius: '4px',
                cursor: 'pointer'
              }}
            >
              Samsung (4)
            </button>
            <button
              type="button"
              onClick={() => setHeaderRowIndex(5)}
              style={{
                padding: '4px 8px',
                fontSize: '12px',
                backgroundColor: headerRowIndex === 5 ? '#3b82f6' : '#f3f4f6',
                color: headerRowIndex === 5 ? 'white' : '#374151',
                border: '1px solid #d1d5db',
                borderRadius: '4px',
                cursor: 'pointer'
              }}
            >
              LG/Whirlpool (5)
            </button>
            <button
              type="button"
              onClick={() => setHeaderRowIndex(7)}
              style={{
                padding: '4px 8px',
                fontSize: '12px',
                backgroundColor: headerRowIndex === 7 ? '#3b82f6' : '#f3f4f6',
                color: headerRowIndex === 7 ? 'white' : '#374151',
                border: '1px solid #d1d5db',
                borderRadius: '4px',
                cursor: 'pointer'
              }}
            >
              GE/Café (7)
            </button>
          </div>
        </div>
        <span style={styles.hint}>Row containing column headers (varies by manufacturer)</span>
      </div>
    </div>
  );

  // Render Step 2: Column Mapping
  const renderStep2 = () => (
    <div style={styles.stepContent}>
      <h3 style={styles.stepTitle}>Map Columns</h3>
      <p style={styles.stepDescription}>
        Review and adjust column mappings. Confidence: {detectionConfidence}%
      </p>

      {/* Mapping Table */}
      <div style={styles.mappingContainer}>
        <div style={styles.mappingHeader}>
          <span style={styles.mappingColHeader}>Source Column</span>
          <span style={styles.mappingColHeader}>Sample Value</span>
          <span style={styles.mappingColHeader}>Map To</span>
          <span style={styles.mappingColHeader}>Confidence</span>
        </div>

        {parsedData?.headers?.map((header, idx) => {
          const mapping = columnMappings[header] || {};
          const sampleValue = parsedData.sampleRows[0]
            ? (Array.isArray(parsedData.sampleRows[0])
              ? parsedData.sampleRows[0][idx]
              : Object.values(parsedData.sampleRows[0])[idx])
            : '';

          return (
            <div key={header} style={styles.mappingRow}>
              <span style={styles.mappingSource}>{header}</span>
              <span style={styles.mappingSample}>{sampleValue?.toString()?.substring(0, 30) || '-'}</span>
              <select
                value={mapping.targetField || ''}
                onChange={(e) => handleMappingChange(header, e.target.value)}
                style={{
                  ...styles.mappingSelect,
                  borderColor: mapping.isRequired && !mapping.targetField ? '#ef4444' : '#e5e7eb'
                }}
              >
                <option value="">-- Skip --</option>
                {targetFields.map(field => (
                  <option key={field.targetField} value={field.targetField}>
                    {field.label} {field.isRequired ? '*' : ''}
                  </option>
                ))}
              </select>
              <span style={{
                ...styles.confidenceBadge,
                backgroundColor: mapping.confidence > 70 ? '#d1fae5' :
                                 mapping.confidence > 40 ? '#fef3c7' : '#f3f4f6',
                color: mapping.confidence > 70 ? '#065f46' :
                       mapping.confidence > 40 ? '#92400e' : '#6b7280'
              }}>
                {mapping.confidence || 0}%
              </span>
            </div>
          );
        })}
      </div>

      {/* Unmapped Warning */}
      {parsedData?.detection?.unmappedHeaders?.length > 0 && (
        <div style={styles.warning}>
          <strong>Unmapped columns:</strong> {parsedData.detection.unmappedHeaders.join(', ')}
        </div>
      )}
    </div>
  );

  // Render Step 3: Validation Preview
  const renderStep3 = () => (
    <div style={styles.stepContent}>
      <h3 style={styles.stepTitle}>Validation Preview</h3>
      <p style={styles.stepDescription}>
        Review the data before importing
      </p>

      {validationResults && (
        <>
          {/* Summary Cards */}
          <div style={styles.summaryCards}>
            <div style={styles.summaryCard}>
              <div style={styles.summaryValue}>{validationResults.totalRows}</div>
              <div style={styles.summaryLabel}>Total Rows</div>
            </div>
            <div style={{ ...styles.summaryCard, borderColor: '#10b981' }}>
              <div style={{ ...styles.summaryValue, color: '#10b981' }}>{validationResults.validRows}</div>
              <div style={styles.summaryLabel}>Valid</div>
            </div>
            <div style={{ ...styles.summaryCard, borderColor: '#ef4444' }}>
              <div style={{ ...styles.summaryValue, color: '#ef4444' }}>{validationResults.invalidRows}</div>
              <div style={styles.summaryLabel}>Invalid</div>
            </div>
          </div>

          {/* Errors */}
          {validationResults.errors.length > 0 && (
            <div style={styles.errorBox}>
              <strong>Errors:</strong>
              <ul style={styles.errorList}>
                {validationResults.errors.map((err, idx) => (
                  <li key={idx}>{err.message}</li>
                ))}
              </ul>
            </div>
          )}

          {/* Data Preview Table */}
          <div style={styles.previewTable}>
            <h4 style={styles.previewTitle}>Data Preview (First 10 rows)</h4>
            <div style={styles.tableWrapper}>
              <table style={styles.table}>
                <thead>
                  <tr>
                    <th style={styles.th}>Row</th>
                    {Object.values(columnMappings)
                      .filter(m => m.targetField)
                      .map(m => (
                        <th key={m.targetField} style={styles.th}>
                          {targetFields.find(f => f.targetField === m.targetField)?.label || m.targetField}
                        </th>
                      ))}
                    <th style={styles.th}>Status</th>
                  </tr>
                </thead>
                <tbody>
                  {validationResults.preview.slice(0, 10).map((row, idx) => (
                    <tr key={idx} style={row._errors?.length > 0 ? styles.errorRow : {}}>
                      <td style={styles.td}>{row._rowIndex}</td>
                      {Object.values(columnMappings)
                        .filter(m => m.targetField)
                        .map(m => (
                          <td key={m.targetField} style={styles.td}>
                            {formatCellValue(row[m.targetField], m.targetField)}
                          </td>
                        ))}
                      <td style={styles.td}>
                        {row._errors?.length > 0 ? (
                          <span style={styles.errorBadge}>Error</span>
                        ) : (
                          <span style={styles.okBadge}>OK</span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}
    </div>
  );

  // Format cell value for display
  const formatCellValue = (value, field) => {
    if (value === null || value === undefined) return '-';

    if (field.includes('_cents') && typeof value === 'number') {
      return `$${(value / 100).toFixed(2)}`;
    }

    return value.toString().substring(0, 40);
  };

  // Render Step 4: Import Results
  const renderStep4 = () => (
    <div style={styles.stepContent}>
      <h3 style={styles.stepTitle}>Import Complete</h3>

      {importResults && (
        <>
          {/* Result Summary */}
          <div style={styles.resultSummary}>
            <div style={styles.resultIcon}>
              {importResults.failed === 0 ? '✅' : '⚠️'}
            </div>
            <div style={styles.resultMessage}>
              {importResults.failed === 0
                ? 'All products imported successfully!'
                : `Import completed with ${importResults.failed} errors`}
            </div>
          </div>

          {/* Result Cards */}
          <div style={styles.summaryCards}>
            <div style={styles.summaryCard}>
              <div style={styles.summaryValue}>{importResults.total}</div>
              <div style={styles.summaryLabel}>Total Processed</div>
            </div>
            <div style={{ ...styles.summaryCard, borderColor: '#10b981' }}>
              <div style={{ ...styles.summaryValue, color: '#10b981' }}>{importResults.inserted}</div>
              <div style={styles.summaryLabel}>New Products</div>
            </div>
            <div style={{ ...styles.summaryCard, borderColor: '#3b82f6' }}>
              <div style={{ ...styles.summaryValue, color: '#3b82f6' }}>{importResults.updated}</div>
              <div style={styles.summaryLabel}>Updated</div>
            </div>
            <div style={{ ...styles.summaryCard, borderColor: '#ef4444' }}>
              <div style={{ ...styles.summaryValue, color: '#ef4444' }}>{importResults.failed}</div>
              <div style={styles.summaryLabel}>Failed</div>
            </div>
          </div>

          {/* Save as Template */}
          {!selectedTemplate && (
            <div style={styles.saveTemplateSection}>
              <label style={styles.checkboxLabel}>
                <input
                  type="checkbox"
                  checked={saveAsTemplate}
                  onChange={(e) => setSaveAsTemplate(e.target.checked)}
                  style={styles.checkbox}
                />
                Save column mappings as template for future imports
              </label>

              {saveAsTemplate && (
                <div style={styles.templateNameInput}>
                  <input
                    type="text"
                    value={newTemplateName}
                    onChange={(e) => setNewTemplateName(e.target.value)}
                    placeholder="Template name (e.g., Samsung 2024 Pricelist)"
                    style={styles.input}
                  />
                  <button onClick={handleSaveAsTemplate} style={styles.saveTemplateBtn}>
                    Save Template
                  </button>
                </div>
              )}
            </div>
          )}

          {/* Error Details */}
          {importResults.errors?.length > 0 && (
            <div style={styles.errorBox}>
              <strong>Import Errors (first 10):</strong>
              <ul style={styles.errorList}>
                {importResults.errors.slice(0, 10).map((err, idx) => (
                  <li key={idx}>Row {err.row}: {err.error || err.message}</li>
                ))}
              </ul>
            </div>
          )}
        </>
      )}
    </div>
  );

  // Render navigation buttons
  const renderNavigation = () => (
    <div style={styles.navigation}>
      <button
        onClick={() => currentStep === 1 ? onClose() : setCurrentStep(currentStep - 1)}
        style={styles.backBtn}
        disabled={isUploading || isValidating || isImporting}
      >
        {currentStep === 1 ? 'Cancel' : 'Back'}
      </button>

      <div style={styles.navRight}>
        {currentStep === 1 && (
          <button
            onClick={handleParseFile}
            style={styles.nextBtn}
            disabled={!file || isUploading}
          >
            {isUploading ? 'Parsing...' : 'Next: Map Columns'}
          </button>
        )}

        {currentStep === 2 && (
          <button
            onClick={handleValidate}
            style={styles.nextBtn}
            disabled={isValidating}
          >
            {isValidating ? 'Validating...' : 'Next: Validate'}
          </button>
        )}

        {currentStep === 3 && (
          <button
            onClick={handleImport}
            style={styles.importBtn}
            disabled={isImporting || validationResults?.errors?.length > 0}
          >
            {isImporting ? 'Importing...' : `Import ${validationResults?.validRows || 0} Products`}
          </button>
        )}

        {currentStep === 4 && (
          <button
            onClick={() => {
              if (onImportComplete) onImportComplete(importResults);
              onClose();
            }}
            style={styles.nextBtn}
          >
            Done
          </button>
        )}
      </div>
    </div>
  );

  return (
    <div style={styles.overlay}>
      <div style={styles.modal}>
        {/* Header */}
        <div style={styles.header}>
          <h2 style={styles.title}>Import Products</h2>
          <button onClick={onClose} style={styles.closeBtn}>✕</button>
        </div>

        {/* Step Indicator */}
        {renderStepIndicator()}

        {/* Error Display */}
        {error && (
          <div style={styles.error}>
            {error}
            <button onClick={() => setError(null)} style={styles.dismissBtn}>✕</button>
          </div>
        )}

        {/* Notification */}
        {notification && (
          <div style={{
            ...styles.notification,
            backgroundColor: notification.type === 'error' ? '#fee2e2' : '#d1fae5',
            color: notification.type === 'error' ? '#b91c1c' : '#065f46'
          }}>
            {notification.message}
          </div>
        )}

        {/* Step Content */}
        <div style={styles.content}>
          {currentStep === 1 && renderStep1()}
          {currentStep === 2 && renderStep2()}
          {currentStep === 3 && renderStep3()}
          {currentStep === 4 && renderStep4()}
        </div>

        {/* Navigation */}
        {renderNavigation()}
      </div>
    </div>
  );
};

// Styles
const styles = {
  overlay: {
    position: 'fixed',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 1000
  },
  modal: {
    backgroundColor: 'white',
    borderRadius: '16px',
    width: '90%',
    maxWidth: '900px',
    maxHeight: '90vh',
    display: 'flex',
    flexDirection: 'column',
    boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.25)'
  },
  header: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: '20px 24px',
    borderBottom: '1px solid #e5e7eb'
  },
  title: {
    margin: 0,
    fontSize: '20px',
    fontWeight: '600',
    color: '#111827'
  },
  closeBtn: {
    background: 'none',
    border: 'none',
    fontSize: '20px',
    cursor: 'pointer',
    color: '#6b7280',
    padding: '4px 8px'
  },
  stepIndicator: {
    display: 'flex',
    justifyContent: 'center',
    alignItems: 'center',
    padding: '20px',
    borderBottom: '1px solid #e5e7eb',
    backgroundColor: '#f9fafb'
  },
  stepContainer: {
    display: 'flex',
    alignItems: 'center'
  },
  stepCircle: {
    width: '32px',
    height: '32px',
    borderRadius: '50%',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    fontWeight: '600',
    fontSize: '14px'
  },
  stepLabel: {
    marginLeft: '8px',
    fontSize: '14px',
    fontWeight: '500'
  },
  stepLine: {
    width: '60px',
    height: '2px',
    margin: '0 12px'
  },
  content: {
    flex: 1,
    overflow: 'auto',
    padding: '24px'
  },
  stepContent: {},
  stepTitle: {
    fontSize: '18px',
    fontWeight: '600',
    color: '#111827',
    marginBottom: '8px'
  },
  stepDescription: {
    fontSize: '14px',
    color: '#6b7280',
    marginBottom: '24px'
  },
  uploadArea: {
    border: '2px dashed #d1d5db',
    borderRadius: '12px',
    padding: '40px',
    textAlign: 'center',
    cursor: 'pointer',
    transition: 'border-color 0.2s',
    marginBottom: '24px',
    backgroundColor: '#f9fafb'
  },
  uploadPrompt: {},
  uploadIcon: { fontSize: '48px', marginBottom: '16px' },
  uploadText: { fontSize: '16px', fontWeight: '500', color: '#111827', marginBottom: '8px' },
  uploadHint: { fontSize: '14px', color: '#6b7280' },
  fileInfo: {
    display: 'flex',
    alignItems: 'center',
    gap: '16px',
    textAlign: 'left'
  },
  fileIcon: { fontSize: '40px' },
  fileName: { fontSize: '16px', fontWeight: '500', color: '#111827' },
  fileSize: { fontSize: '14px', color: '#6b7280' },
  removeFileBtn: {
    marginLeft: 'auto',
    background: '#fee2e2',
    border: 'none',
    borderRadius: '50%',
    width: '28px',
    height: '28px',
    cursor: 'pointer',
    color: '#b91c1c'
  },
  formGroup: {
    marginBottom: '20px'
  },
  label: {
    display: 'block',
    fontSize: '14px',
    fontWeight: '500',
    color: '#374151',
    marginBottom: '8px'
  },
  input: {
    width: '100%',
    padding: '10px 12px',
    border: '2px solid #e5e7eb',
    borderRadius: '8px',
    fontSize: '14px',
    boxSizing: 'border-box'
  },
  select: {
    width: '100%',
    padding: '10px 12px',
    border: '2px solid #e5e7eb',
    borderRadius: '8px',
    fontSize: '14px',
    backgroundColor: 'white'
  },
  hint: {
    fontSize: '12px',
    color: '#9ca3af',
    marginLeft: '12px'
  },
  mappingContainer: {
    border: '1px solid #e5e7eb',
    borderRadius: '8px',
    overflow: 'hidden'
  },
  mappingHeader: {
    display: 'grid',
    gridTemplateColumns: '2fr 2fr 2fr 80px',
    gap: '12px',
    padding: '12px 16px',
    backgroundColor: '#f9fafb',
    fontWeight: '600',
    fontSize: '12px',
    color: '#6b7280',
    textTransform: 'uppercase'
  },
  mappingColHeader: {},
  mappingRow: {
    display: 'grid',
    gridTemplateColumns: '2fr 2fr 2fr 80px',
    gap: '12px',
    padding: '12px 16px',
    borderTop: '1px solid #e5e7eb',
    alignItems: 'center'
  },
  mappingSource: {
    fontSize: '14px',
    fontWeight: '500',
    color: '#111827'
  },
  mappingSample: {
    fontSize: '13px',
    color: '#6b7280',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap'
  },
  mappingSelect: {
    padding: '8px',
    border: '2px solid #e5e7eb',
    borderRadius: '6px',
    fontSize: '13px',
    backgroundColor: 'white'
  },
  confidenceBadge: {
    padding: '4px 8px',
    borderRadius: '4px',
    fontSize: '12px',
    fontWeight: '500',
    textAlign: 'center'
  },
  warning: {
    marginTop: '16px',
    padding: '12px',
    backgroundColor: '#fef3c7',
    borderRadius: '8px',
    fontSize: '14px',
    color: '#92400e'
  },
  summaryCards: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fit, minmax(120px, 1fr))',
    gap: '16px',
    marginBottom: '24px'
  },
  summaryCard: {
    padding: '16px',
    backgroundColor: '#f9fafb',
    borderRadius: '8px',
    textAlign: 'center',
    border: '2px solid #e5e7eb'
  },
  summaryValue: {
    fontSize: '28px',
    fontWeight: '700',
    color: '#111827'
  },
  summaryLabel: {
    fontSize: '13px',
    color: '#6b7280',
    marginTop: '4px'
  },
  errorBox: {
    padding: '16px',
    backgroundColor: '#fee2e2',
    borderRadius: '8px',
    marginBottom: '24px',
    color: '#b91c1c'
  },
  errorList: {
    margin: '8px 0 0 0',
    paddingLeft: '20px'
  },
  previewTable: {
    marginTop: '24px'
  },
  previewTitle: {
    fontSize: '14px',
    fontWeight: '600',
    marginBottom: '12px',
    color: '#374151'
  },
  tableWrapper: {
    overflowX: 'auto',
    border: '1px solid #e5e7eb',
    borderRadius: '8px'
  },
  table: {
    width: '100%',
    borderCollapse: 'collapse',
    fontSize: '13px'
  },
  th: {
    padding: '12px',
    textAlign: 'left',
    backgroundColor: '#f9fafb',
    borderBottom: '2px solid #e5e7eb',
    fontWeight: '600',
    color: '#374151',
    whiteSpace: 'nowrap'
  },
  td: {
    padding: '12px',
    borderBottom: '1px solid #e5e7eb',
    color: '#111827'
  },
  errorRow: {
    backgroundColor: '#fef2f2'
  },
  errorBadge: {
    padding: '4px 8px',
    backgroundColor: '#fee2e2',
    color: '#b91c1c',
    borderRadius: '4px',
    fontSize: '12px',
    fontWeight: '500'
  },
  okBadge: {
    padding: '4px 8px',
    backgroundColor: '#d1fae5',
    color: '#065f46',
    borderRadius: '4px',
    fontSize: '12px',
    fontWeight: '500'
  },
  resultSummary: {
    textAlign: 'center',
    marginBottom: '24px'
  },
  resultIcon: {
    fontSize: '48px',
    marginBottom: '12px'
  },
  resultMessage: {
    fontSize: '18px',
    fontWeight: '600',
    color: '#111827'
  },
  saveTemplateSection: {
    marginTop: '24px',
    padding: '16px',
    backgroundColor: '#f0f9ff',
    borderRadius: '8px',
    border: '1px solid #bae6fd'
  },
  checkboxLabel: {
    display: 'flex',
    alignItems: 'center',
    fontSize: '14px',
    color: '#0369a1',
    cursor: 'pointer'
  },
  checkbox: {
    marginRight: '8px',
    width: '18px',
    height: '18px'
  },
  templateNameInput: {
    display: 'flex',
    gap: '12px',
    marginTop: '12px'
  },
  saveTemplateBtn: {
    padding: '10px 16px',
    backgroundColor: '#0284c7',
    color: 'white',
    border: 'none',
    borderRadius: '8px',
    cursor: 'pointer',
    fontWeight: '500',
    whiteSpace: 'nowrap'
  },
  navigation: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: '20px 24px',
    borderTop: '1px solid #e5e7eb',
    backgroundColor: '#f9fafb'
  },
  navRight: {
    display: 'flex',
    gap: '12px'
  },
  backBtn: {
    padding: '10px 20px',
    backgroundColor: 'white',
    border: '2px solid #e5e7eb',
    borderRadius: '8px',
    cursor: 'pointer',
    fontSize: '14px',
    fontWeight: '500'
  },
  nextBtn: {
    padding: '10px 20px',
    backgroundColor: '#667eea',
    color: 'white',
    border: 'none',
    borderRadius: '8px',
    cursor: 'pointer',
    fontSize: '14px',
    fontWeight: '500'
  },
  importBtn: {
    padding: '10px 24px',
    backgroundColor: '#10b981',
    color: 'white',
    border: 'none',
    borderRadius: '8px',
    cursor: 'pointer',
    fontSize: '14px',
    fontWeight: '600'
  },
  error: {
    margin: '16px 24px 0',
    padding: '12px 16px',
    backgroundColor: '#fee2e2',
    border: '1px solid #fecaca',
    borderRadius: '8px',
    color: '#b91c1c',
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center'
  },
  dismissBtn: {
    background: 'none',
    border: 'none',
    cursor: 'pointer',
    color: '#b91c1c',
    fontSize: '16px'
  },
  notification: {
    margin: '16px 24px 0',
    padding: '12px 16px',
    borderRadius: '8px',
    fontSize: '14px'
  }
};

export default ProductImportWizard;
