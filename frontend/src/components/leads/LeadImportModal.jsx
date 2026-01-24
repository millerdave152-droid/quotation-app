/**
 * LeadImportModal - Bulk CSV import for leads
 * Features: File upload, field mapping, duplicate detection, preview
 */

import React, { useState, useCallback, useRef } from 'react';

const API_URL = process.env.REACT_APP_API_URL || 'http://localhost:3001';

// Available lead fields for mapping
const LEAD_FIELDS = [
  { value: '', label: 'Skip this column' },
  { value: 'contact_name', label: 'Contact Name', required: true },
  { value: 'contact_email', label: 'Email' },
  { value: 'contact_phone', label: 'Phone' },
  { value: 'lead_source', label: 'Lead Source' },
  { value: 'source_details', label: 'Source Details' },
  { value: 'priority', label: 'Priority' },
  { value: 'timeline', label: 'Timeline' },
  { value: 'inquiry_reason', label: 'Inquiry Reason' },
  { value: 'requirements_notes', label: 'Notes/Requirements' },
  { value: 'follow_up_date', label: 'Follow-up Date' },
  { value: 'preferred_contact_method', label: 'Preferred Contact Method' },
  { value: 'best_time_to_contact', label: 'Best Time to Contact' }
];

/**
 * Step indicator component
 */
const StepIndicator = ({ currentStep, steps }) => (
  <div style={{
    display: 'flex',
    justifyContent: 'center',
    marginBottom: '24px'
  }}>
    {steps.map((step, idx) => (
      <div key={idx} style={{ display: 'flex', alignItems: 'center' }}>
        <div style={{
          width: '32px',
          height: '32px',
          borderRadius: '50%',
          background: idx <= currentStep ? '#3b82f6' : '#e5e7eb',
          color: idx <= currentStep ? 'white' : '#9ca3af',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          fontSize: '14px',
          fontWeight: '600'
        }}>
          {idx < currentStep ? '✓' : idx + 1}
        </div>
        <span style={{
          marginLeft: '8px',
          fontSize: '13px',
          color: idx <= currentStep ? '#1f2937' : '#9ca3af',
          fontWeight: idx === currentStep ? '600' : '400'
        }}>
          {step}
        </span>
        {idx < steps.length - 1 && (
          <div style={{
            width: '40px',
            height: '2px',
            background: idx < currentStep ? '#3b82f6' : '#e5e7eb',
            margin: '0 12px'
          }} />
        )}
      </div>
    ))}
  </div>
);

/**
 * Main LeadImportModal Component
 */
function LeadImportModal({ onClose, onImportComplete }) {
  const fileInputRef = useRef(null);
  const [step, setStep] = useState(0);
  const [file, setFile] = useState(null);
  const [preview, setPreview] = useState(null);
  const [mappings, setMappings] = useState({});
  const [importOptions, setImportOptions] = useState({
    skipDuplicates: true,
    defaultPriority: 'warm',
    defaultSource: 'csv_import'
  });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [importResult, setImportResult] = useState(null);

  const steps = ['Upload File', 'Map Fields', 'Review & Import', 'Complete'];

  /**
   * Handle file selection
   */
  const handleFileSelect = async (e) => {
    const selectedFile = e.target.files[0];
    if (!selectedFile) return;

    if (!selectedFile.name.endsWith('.csv')) {
      setError('Please select a CSV file');
      return;
    }

    setFile(selectedFile);
    setError(null);
    setLoading(true);

    try {
      const formData = new FormData();
      formData.append('file', selectedFile);

      const res = await fetch(`${API_URL}/api/leads/import/preview`, {
        method: 'POST',
        body: formData
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error?.message || 'Failed to preview file');
      }

      const data = await res.json();
      setPreview(data.data);
      setMappings(data.data.mappings || {});
      setStep(1);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  /**
   * Handle mapping change
   */
  const handleMappingChange = (column, field) => {
    setMappings(prev => ({
      ...prev,
      [column]: field
    }));
  };

  /**
   * Check if mapping is valid (has contact_name)
   */
  const isMappingValid = () => {
    return Object.values(mappings).includes('contact_name');
  };

  /**
   * Perform import
   */
  const handleImport = async () => {
    setLoading(true);
    setError(null);

    try {
      const formData = new FormData();
      formData.append('file', file);
      formData.append('mappings', JSON.stringify(mappings));
      formData.append('skipDuplicates', importOptions.skipDuplicates);
      formData.append('defaultPriority', importOptions.defaultPriority);
      formData.append('defaultSource', importOptions.defaultSource);

      const res = await fetch(`${API_URL}/api/leads/import`, {
        method: 'POST',
        body: formData
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error?.message || 'Import failed');
      }

      const data = await res.json();
      setImportResult(data.data);
      setStep(3);
      onImportComplete?.();
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  /**
   * Download template
   */
  const downloadTemplate = () => {
    const headers = 'Name,Email,Phone,Source,Priority,Timeline,Notes\n';
    const sample = 'John Smith,john@example.com,555-123-4567,Website,Hot,ASAP,Interested in kitchen appliances\n';
    const content = headers + sample;

    const blob = new Blob([content], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = 'lead_import_template.csv';
    link.click();
  };

  return (
    <div style={{
      position: 'fixed',
      top: 0,
      left: 0,
      right: 0,
      bottom: 0,
      background: 'rgba(0,0,0,0.5)',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      zIndex: 1000
    }}>
      <div style={{
        background: 'white',
        borderRadius: '16px',
        width: '90%',
        maxWidth: '800px',
        maxHeight: '90vh',
        overflow: 'hidden',
        display: 'flex',
        flexDirection: 'column'
      }}>
        {/* Header */}
        <div style={{
          padding: '20px 24px',
          borderBottom: '1px solid #e5e7eb',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center'
        }}>
          <h2 style={{ margin: 0, fontSize: '20px', fontWeight: '600' }}>
            Import Leads from CSV
          </h2>
          <button
            onClick={onClose}
            style={{
              background: 'none',
              border: 'none',
              fontSize: '24px',
              cursor: 'pointer',
              color: '#9ca3af'
            }}
          >
            ×
          </button>
        </div>

        {/* Content */}
        <div style={{ flex: 1, overflow: 'auto', padding: '24px' }}>
          <StepIndicator currentStep={step} steps={steps} />

          {error && (
            <div style={{
              padding: '12px 16px',
              background: '#fee2e2',
              color: '#991b1b',
              borderRadius: '8px',
              marginBottom: '16px',
              fontSize: '14px'
            }}>
              {error}
            </div>
          )}

          {/* Step 0: Upload */}
          {step === 0 && (
            <div style={{ textAlign: 'center', padding: '32px' }}>
              <input
                type="file"
                ref={fileInputRef}
                onChange={handleFileSelect}
                accept=".csv"
                style={{ display: 'none' }}
              />

              <div style={{
                border: '2px dashed #d1d5db',
                borderRadius: '12px',
                padding: '48px',
                marginBottom: '24px',
                cursor: 'pointer',
                transition: 'border-color 0.2s'
              }}
              onClick={() => fileInputRef.current?.click()}
              onDragOver={(e) => {
                e.preventDefault();
                e.currentTarget.style.borderColor = '#3b82f6';
              }}
              onDragLeave={(e) => {
                e.currentTarget.style.borderColor = '#d1d5db';
              }}
              onDrop={(e) => {
                e.preventDefault();
                e.currentTarget.style.borderColor = '#d1d5db';
                if (e.dataTransfer.files.length) {
                  handleFileSelect({ target: { files: e.dataTransfer.files } });
                }
              }}
              >
                <div style={{ fontSize: '48px', marginBottom: '16px' }}>📁</div>
                <p style={{ margin: 0, fontSize: '16px', fontWeight: '500', color: '#374151' }}>
                  Drop your CSV file here or click to browse
                </p>
                <p style={{ margin: '8px 0 0', fontSize: '13px', color: '#9ca3af' }}>
                  Maximum file size: 5MB
                </p>
              </div>

              <button
                onClick={downloadTemplate}
                style={{
                  padding: '10px 20px',
                  background: '#f3f4f6',
                  color: '#374151',
                  border: 'none',
                  borderRadius: '8px',
                  fontSize: '14px',
                  cursor: 'pointer'
                }}
              >
                Download Template
              </button>
            </div>
          )}

          {/* Step 1: Map Fields */}
          {step === 1 && preview && (
            <div>
              <p style={{ marginBottom: '16px', color: '#6b7280', fontSize: '14px' }}>
                Found {preview.totalRows} rows. Map your CSV columns to lead fields below.
              </p>

              <div style={{
                border: '1px solid #e5e7eb',
                borderRadius: '8px',
                overflow: 'hidden'
              }}>
                <div style={{
                  display: 'grid',
                  gridTemplateColumns: '1fr 1fr 2fr',
                  gap: '1px',
                  background: '#e5e7eb'
                }}>
                  <div style={{ padding: '12px', background: '#f9fafb', fontWeight: '600', fontSize: '13px' }}>
                    CSV Column
                  </div>
                  <div style={{ padding: '12px', background: '#f9fafb', fontWeight: '600', fontSize: '13px' }}>
                    Map To
                  </div>
                  <div style={{ padding: '12px', background: '#f9fafb', fontWeight: '600', fontSize: '13px' }}>
                    Sample Data
                  </div>

                  {preview.columns.map((column) => (
                    <React.Fragment key={column}>
                      <div style={{ padding: '12px', background: 'white', fontSize: '13px' }}>
                        {column}
                      </div>
                      <div style={{ padding: '8px 12px', background: 'white' }}>
                        <select
                          value={mappings[column] || ''}
                          onChange={(e) => handleMappingChange(column, e.target.value)}
                          style={{
                            width: '100%',
                            padding: '6px 8px',
                            border: '1px solid #d1d5db',
                            borderRadius: '6px',
                            fontSize: '13px'
                          }}
                        >
                          {LEAD_FIELDS.map(field => (
                            <option key={field.value} value={field.value}>
                              {field.label}
                            </option>
                          ))}
                        </select>
                      </div>
                      <div style={{ padding: '12px', background: 'white', fontSize: '12px', color: '#6b7280' }}>
                        {preview.sampleRows.slice(0, 2).map(row => row[column]).join(', ')}
                      </div>
                    </React.Fragment>
                  ))}
                </div>
              </div>

              {!isMappingValid() && (
                <p style={{
                  marginTop: '12px',
                  padding: '8px 12px',
                  background: '#fef3c7',
                  color: '#92400e',
                  borderRadius: '6px',
                  fontSize: '13px'
                }}>
                  Please map at least one column to "Contact Name" (required)
                </p>
              )}
            </div>
          )}

          {/* Step 2: Review & Options */}
          {step === 2 && preview && (
            <div>
              <div style={{
                padding: '16px',
                background: '#f9fafb',
                borderRadius: '8px',
                marginBottom: '16px'
              }}>
                <h4 style={{ margin: '0 0 12px', fontSize: '14px', fontWeight: '600' }}>
                  Import Summary
                </h4>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '16px' }}>
                  <div>
                    <div style={{ fontSize: '24px', fontWeight: 'bold', color: '#3b82f6' }}>
                      {preview.totalRows}
                    </div>
                    <div style={{ fontSize: '12px', color: '#6b7280' }}>Total Rows</div>
                  </div>
                  <div>
                    <div style={{ fontSize: '24px', fontWeight: 'bold', color: '#22c55e' }}>
                      {Object.values(mappings).filter(v => v).length}
                    </div>
                    <div style={{ fontSize: '12px', color: '#6b7280' }}>Fields Mapped</div>
                  </div>
                  <div>
                    <div style={{ fontSize: '24px', fontWeight: 'bold', color: '#6366f1' }}>
                      {file?.name}
                    </div>
                    <div style={{ fontSize: '12px', color: '#6b7280' }}>File</div>
                  </div>
                </div>
              </div>

              <h4 style={{ margin: '0 0 12px', fontSize: '14px', fontWeight: '600' }}>
                Import Options
              </h4>

              <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                <label style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <input
                    type="checkbox"
                    checked={importOptions.skipDuplicates}
                    onChange={(e) => setImportOptions(prev => ({ ...prev, skipDuplicates: e.target.checked }))}
                  />
                  <span style={{ fontSize: '14px' }}>Skip duplicate leads (same email/phone)</span>
                </label>

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
                  <div>
                    <label style={{ display: 'block', fontSize: '12px', fontWeight: '500', marginBottom: '4px' }}>
                      Default Priority
                    </label>
                    <select
                      value={importOptions.defaultPriority}
                      onChange={(e) => setImportOptions(prev => ({ ...prev, defaultPriority: e.target.value }))}
                      style={{
                        width: '100%',
                        padding: '8px',
                        border: '1px solid #d1d5db',
                        borderRadius: '6px',
                        fontSize: '14px'
                      }}
                    >
                      <option value="hot">Hot</option>
                      <option value="warm">Warm</option>
                      <option value="cold">Cold</option>
                    </select>
                  </div>
                  <div>
                    <label style={{ display: 'block', fontSize: '12px', fontWeight: '500', marginBottom: '4px' }}>
                      Lead Source
                    </label>
                    <input
                      type="text"
                      value={importOptions.defaultSource}
                      onChange={(e) => setImportOptions(prev => ({ ...prev, defaultSource: e.target.value }))}
                      placeholder="csv_import"
                      style={{
                        width: '100%',
                        padding: '8px',
                        border: '1px solid #d1d5db',
                        borderRadius: '6px',
                        fontSize: '14px'
                      }}
                    />
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Step 3: Complete */}
          {step === 3 && importResult && (
            <div style={{ textAlign: 'center', padding: '32px' }}>
              <div style={{
                width: '64px',
                height: '64px',
                borderRadius: '50%',
                background: '#dcfce7',
                margin: '0 auto 16px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontSize: '32px'
              }}>
                ✓
              </div>
              <h3 style={{ margin: '0 0 16px', fontSize: '20px', fontWeight: '600' }}>
                Import Complete
              </h3>

              <div style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(3, 1fr)',
                gap: '16px',
                marginBottom: '24px'
              }}>
                <div style={{ padding: '16px', background: '#dcfce7', borderRadius: '8px' }}>
                  <div style={{ fontSize: '28px', fontWeight: 'bold', color: '#16a34a' }}>
                    {importResult.imported}
                  </div>
                  <div style={{ fontSize: '13px', color: '#166534' }}>Imported</div>
                </div>
                <div style={{ padding: '16px', background: '#fef3c7', borderRadius: '8px' }}>
                  <div style={{ fontSize: '28px', fontWeight: 'bold', color: '#b45309' }}>
                    {importResult.skipped}
                  </div>
                  <div style={{ fontSize: '13px', color: '#92400e' }}>Skipped</div>
                </div>
                <div style={{ padding: '16px', background: '#fee2e2', borderRadius: '8px' }}>
                  <div style={{ fontSize: '28px', fontWeight: 'bold', color: '#dc2626' }}>
                    {importResult.errors?.length || 0}
                  </div>
                  <div style={{ fontSize: '13px', color: '#991b1b' }}>Errors</div>
                </div>
              </div>

              {importResult.duplicates?.length > 0 && (
                <p style={{ fontSize: '13px', color: '#6b7280' }}>
                  {importResult.duplicates.length} potential duplicate(s) detected and skipped
                </p>
              )}

              {importResult.errors?.length > 0 && (
                <div style={{
                  textAlign: 'left',
                  marginTop: '16px',
                  padding: '12px',
                  background: '#fee2e2',
                  borderRadius: '8px',
                  maxHeight: '120px',
                  overflow: 'auto'
                }}>
                  <p style={{ margin: '0 0 8px', fontWeight: '600', fontSize: '13px', color: '#991b1b' }}>
                    Errors:
                  </p>
                  {importResult.errors.slice(0, 10).map((err, idx) => (
                    <p key={idx} style={{ margin: '4px 0', fontSize: '12px', color: '#7f1d1d' }}>
                      Row {err.row}: {err.errors.join(', ')}
                    </p>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>

        {/* Footer */}
        <div style={{
          padding: '16px 24px',
          borderTop: '1px solid #e5e7eb',
          display: 'flex',
          justifyContent: 'space-between'
        }}>
          <button
            onClick={step === 0 ? onClose : () => setStep(prev => prev - 1)}
            disabled={loading || step === 3}
            style={{
              padding: '10px 20px',
              background: '#f3f4f6',
              color: '#374151',
              border: 'none',
              borderRadius: '8px',
              fontSize: '14px',
              cursor: loading || step === 3 ? 'not-allowed' : 'pointer'
            }}
          >
            {step === 0 ? 'Cancel' : 'Back'}
          </button>

          {step < 3 && (
            <button
              onClick={() => {
                if (step === 2) {
                  handleImport();
                } else {
                  setStep(prev => prev + 1);
                }
              }}
              disabled={loading || (step === 1 && !isMappingValid())}
              style={{
                padding: '10px 24px',
                background: step === 2 ? '#22c55e' : '#3b82f6',
                color: 'white',
                border: 'none',
                borderRadius: '8px',
                fontSize: '14px',
                fontWeight: '600',
                cursor: loading ? 'wait' : 'pointer',
                opacity: (step === 1 && !isMappingValid()) ? 0.5 : 1
              }}
            >
              {loading ? 'Processing...' : step === 2 ? 'Import Leads' : 'Continue'}
            </button>
          )}

          {step === 3 && (
            <button
              onClick={onClose}
              style={{
                padding: '10px 24px',
                background: '#3b82f6',
                color: 'white',
                border: 'none',
                borderRadius: '8px',
                fontSize: '14px',
                fontWeight: '600',
                cursor: 'pointer'
              }}
            >
              Done
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

export default LeadImportModal;
