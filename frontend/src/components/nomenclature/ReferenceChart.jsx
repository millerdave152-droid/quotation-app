/**
 * ReferenceChart.jsx
 * Visual nomenclature reference tables per brand/product type
 */

import React, { useState, useEffect, useCallback } from 'react';

const API_BASE = process.env.REACT_APP_API_URL || 'http://localhost:3001';

const ReferenceChart = ({ manufacturer, templates }) => {
  const [selectedTemplate, setSelectedTemplate] = useState(null);
  const [templateData, setTemplateData] = useState(null);
  const [expandedRules, setExpandedRules] = useState({});
  const [loading, setLoading] = useState(false);

  // Fetch detailed template with rules and codes
  const fetchTemplateDetails = useCallback(async (productType) => {
    try {
      setLoading(true);
      const token = localStorage.getItem('auth_token');
      const response = await fetch(
        `${API_BASE}/api/nomenclature/templates/${encodeURIComponent(manufacturer)}/${encodeURIComponent(productType)}`,
        {
          headers: {
            'Authorization': `Bearer ${token}`
          }
        }
      );

      if (response.ok) {
        const data = await response.json();
        if (data.success) {
          setTemplateData(data.data);
          // Expand all rules by default
          const expanded = {};
          data.data.rules?.forEach(rule => {
            expanded[rule.id] = true;
          });
          setExpandedRules(expanded);
        }
      }
    } catch (err) {
      console.error('Error fetching template details:', err);
    } finally {
      setLoading(false);
    }
  }, [manufacturer]);

  // Select first template by default
  useEffect(() => {
    if (templates.length > 0 && !selectedTemplate) {
      setSelectedTemplate(templates[0].product_type);
      fetchTemplateDetails(templates[0].product_type);
    }
  }, [templates, selectedTemplate, fetchTemplateDetails]);

  // Handle template selection
  const handleTemplateSelect = (productType) => {
    setSelectedTemplate(productType);
    fetchTemplateDetails(productType);
  };

  // Toggle rule expansion
  const toggleRule = (ruleId) => {
    setExpandedRules(prev => ({
      ...prev,
      [ruleId]: !prev[ruleId]
    }));
  };

  if (templates.length === 0) {
    return (
      <div style={{
        textAlign: 'center',
        padding: '48px 24px',
        backgroundColor: '#f9fafb',
        borderRadius: '12px'
      }}>
        <div style={{ fontSize: '48px', marginBottom: '16px' }}>📋</div>
        <div style={{ fontSize: '16px', fontWeight: '600', color: '#374151', marginBottom: '8px' }}>
          No Reference Charts Available
        </div>
        <div style={{ fontSize: '14px', color: '#6b7280' }}>
          No nomenclature templates found for {manufacturer}
        </div>
      </div>
    );
  }

  return (
    <div>
      {/* Product Type Tabs */}
      <div style={{
        display: 'flex',
        gap: '8px',
        marginBottom: '24px',
        flexWrap: 'wrap'
      }}>
        {templates.map(template => (
          <button
            key={template.id}
            onClick={() => handleTemplateSelect(template.product_type)}
            style={{
              padding: '10px 20px',
              fontSize: '14px',
              fontWeight: selectedTemplate === template.product_type ? '600' : '400',
              backgroundColor: selectedTemplate === template.product_type ? '#4f46e5' : 'white',
              color: selectedTemplate === template.product_type ? 'white' : '#374151',
              border: '1px solid',
              borderColor: selectedTemplate === template.product_type ? '#4f46e5' : '#e5e7eb',
              borderRadius: '8px',
              cursor: 'pointer',
              transition: 'all 0.2s ease'
            }}
          >
            {template.product_type}
          </button>
        ))}
      </div>

      {loading ? (
        <div style={{ textAlign: 'center', padding: '48px' }}>
          <div style={{ fontSize: '24px', marginBottom: '8px' }}>Loading...</div>
        </div>
      ) : templateData ? (
        <div>
          {/* Template Header */}
          <div style={{
            backgroundColor: '#f9fafb',
            borderRadius: '12px',
            padding: '20px',
            marginBottom: '24px'
          }}>
            <h3 style={{ fontSize: '18px', fontWeight: '600', color: '#111827', margin: '0 0 8px 0' }}>
              {templateData.template_name}
            </h3>
            {templateData.description && (
              <p style={{ color: '#6b7280', margin: '0 0 16px 0', fontSize: '14px' }}>
                {templateData.description}
              </p>
            )}
            {templateData.example_models?.length > 0 && (
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                <span style={{ fontSize: '13px', color: '#6b7280' }}>Examples:</span>
                {templateData.example_models.map((model, idx) => (
                  <span
                    key={idx}
                    style={{
                      padding: '4px 10px',
                      backgroundColor: 'white',
                      border: '1px solid #e5e7eb',
                      borderRadius: '4px',
                      fontFamily: 'monospace',
                      fontSize: '13px'
                    }}
                  >
                    {model}
                  </span>
                ))}
              </div>
            )}
          </div>

          {/* Rules and Codes */}
          {templateData.rules?.map((rule, ruleIdx) => (
            <div
              key={rule.id}
              style={{
                marginBottom: '16px',
                border: '1px solid #e5e7eb',
                borderRadius: '12px',
                overflow: 'hidden'
              }}
            >
              {/* Rule Header */}
              <div
                onClick={() => toggleRule(rule.id)}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  padding: '16px',
                  backgroundColor: '#f9fafb',
                  cursor: 'pointer',
                  borderBottom: expandedRules[rule.id] ? '1px solid #e5e7eb' : 'none'
                }}
              >
                <div style={{
                  width: '8px',
                  height: '40px',
                  backgroundColor: rule.color || '#4f46e5',
                  borderRadius: '4px',
                  marginRight: '16px'
                }} />
                <div style={{ flex: 1 }}>
                  <div style={{ fontWeight: '600', color: '#111827', marginBottom: '4px' }}>
                    {rule.segment_name}
                  </div>
                  <div style={{ fontSize: '13px', color: '#6b7280' }}>
                    Position {rule.position_start}{rule.position_start !== rule.position_end ? `-${rule.position_end}` : ''}
                    {rule.segment_description && ` • ${rule.segment_description}`}
                  </div>
                </div>
                <div style={{
                  padding: '4px 12px',
                  backgroundColor: 'white',
                  borderRadius: '16px',
                  fontSize: '12px',
                  color: '#6b7280',
                  marginRight: '12px'
                }}>
                  {rule.codes?.length || 0} codes
                </div>
                <span style={{ fontSize: '20px', color: '#6b7280' }}>
                  {expandedRules[rule.id] ? '−' : '+'}
                </span>
              </div>

              {/* Codes Table */}
              {expandedRules[rule.id] && rule.codes?.length > 0 && (
                <div style={{ padding: '16px' }}>
                  <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                    <thead>
                      <tr style={{ backgroundColor: '#f3f4f6' }}>
                        <th style={{
                          padding: '10px 16px',
                          textAlign: 'left',
                          fontSize: '12px',
                          fontWeight: '600',
                          color: '#6b7280',
                          textTransform: 'uppercase',
                          letterSpacing: '0.5px',
                          width: '100px'
                        }}>
                          Code
                        </th>
                        <th style={{
                          padding: '10px 16px',
                          textAlign: 'left',
                          fontSize: '12px',
                          fontWeight: '600',
                          color: '#6b7280',
                          textTransform: 'uppercase',
                          letterSpacing: '0.5px'
                        }}>
                          Meaning
                        </th>
                        <th style={{
                          padding: '10px 16px',
                          textAlign: 'left',
                          fontSize: '12px',
                          fontWeight: '600',
                          color: '#6b7280',
                          textTransform: 'uppercase',
                          letterSpacing: '0.5px'
                        }}>
                          Details
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      {rule.codes.map((code, codeIdx) => (
                        <tr
                          key={code.id}
                          style={{
                            borderBottom: codeIdx < rule.codes.length - 1 ? '1px solid #e5e7eb' : 'none'
                          }}
                        >
                          <td style={{
                            padding: '12px 16px',
                            fontFamily: 'monospace',
                            fontSize: '16px',
                            fontWeight: '600',
                            color: rule.color || '#4f46e5'
                          }}>
                            {code.code_value}
                            {code.is_common && (
                              <span style={{
                                marginLeft: '8px',
                                padding: '2px 6px',
                                backgroundColor: '#dbeafe',
                                color: '#1d4ed8',
                                fontSize: '10px',
                                borderRadius: '4px',
                                fontFamily: 'sans-serif'
                              }}>
                                Common
                              </span>
                            )}
                          </td>
                          <td style={{
                            padding: '12px 16px',
                            fontWeight: '500',
                            color: '#111827'
                          }}>
                            {code.code_meaning}
                          </td>
                          <td style={{
                            padding: '12px 16px',
                            color: '#6b7280',
                            fontSize: '13px'
                          }}>
                            {code.additional_info || '-'}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}

              {/* No codes message */}
              {expandedRules[rule.id] && (!rule.codes || rule.codes.length === 0) && (
                <div style={{
                  padding: '24px',
                  textAlign: 'center',
                  color: '#6b7280',
                  fontSize: '14px'
                }}>
                  No codes defined for this segment yet
                </div>
              )}
            </div>
          ))}

          {/* Print-friendly hint */}
          <div style={{
            marginTop: '24px',
            padding: '12px 16px',
            backgroundColor: '#eff6ff',
            borderRadius: '8px',
            fontSize: '13px',
            color: '#1d4ed8',
            display: 'flex',
            alignItems: 'center',
            gap: '8px'
          }}>
            <span style={{ fontSize: '18px' }}>🖨️</span>
            <span>
              Tip: Use Ctrl/Cmd + P to print this reference chart for quick access
            </span>
          </div>
        </div>
      ) : (
        <div style={{
          textAlign: 'center',
          padding: '48px',
          color: '#6b7280'
        }}>
          Select a product type to view its reference chart
        </div>
      )}
    </div>
  );
};

export default ReferenceChart;
