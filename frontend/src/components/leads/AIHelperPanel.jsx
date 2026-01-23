/**
 * AIHelperPanel - AI-powered helpers for leads
 * - Next Best Action recommendations
 * - Generate summary
 * - Suggest products
 * - Draft follow-up message
 */

import React, { useState, useEffect } from 'react';
import {
  generateAISummary,
  generateProductSuggestions,
  generateFollowUpDraft
} from './hooks/useLeads';
import { useToast } from '../ui/Toast';
import { useNavigate } from 'react-router-dom';
import { api } from '../../services/apiClient';

function AIHelperPanel({ leadId, lead, onUpdate }) {
  const toast = useToast();
  const navigate = useNavigate();
  const [loading, setLoading] = useState({
    summary: false,
    suggestions: false,
    draft: false,
    nextActions: false
  });
  const [results, setResults] = useState({
    summary: lead?.ai_summary || null,
    suggestions: lead?.ai_suggested_products || null,
    draft: lead?.ai_draft_message || null,
    nextActions: null
  });
  const [draftTone, setDraftTone] = useState('professional');
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [selectedProducts, setSelectedProducts] = useState([]);

  // Fetch next best actions on mount
  useEffect(() => {
    if (leadId) {
      fetchNextActions();
    }
  }, [leadId]);

  const fetchNextActions = async () => {
    setLoading(prev => ({ ...prev, nextActions: true }));
    try {
      const response = await api.get(`/leads/${leadId}/next-actions`);
      setResults(prev => ({ ...prev, nextActions: response.data?.data || response.data }));
    } catch (error) {
      console.error('Failed to fetch next actions:', error);
    } finally {
      setLoading(prev => ({ ...prev, nextActions: false }));
    }
  };

  const toggleProductSelection = (product) => {
    setSelectedProducts(prev => {
      const exists = prev.find(p => p.id === product.id);
      if (exists) {
        return prev.filter(p => p.id !== product.id);
      } else {
        return [...prev, product];
      }
    });
  };

  const isProductSelected = (productId) => {
    return selectedProducts.some(p => p.id === productId);
  };

  const handleCreateQuoteWithProducts = () => {
    // Store selected products in sessionStorage for the quote creation page
    sessionStorage.setItem('quoteProducts', JSON.stringify(selectedProducts));
    sessionStorage.setItem('quoteFromLead', JSON.stringify({
      leadId: lead.id,
      leadNumber: lead.lead_number,
      customerName: lead.contact_name,
      customerEmail: lead.contact_email,
      customerPhone: lead.contact_phone
    }));
    toast.success(`Creating quote with ${selectedProducts.length} products...`);
    navigate('/quotes/new');
  };

  const handleAddAllFromCategory = (products) => {
    const newProducts = products.filter(p => !isProductSelected(p.id));
    if (newProducts.length > 0) {
      setSelectedProducts(prev => [...prev, ...newProducts]);
      toast.success(`Added ${newProducts.length} products`);
    }
  };

  const handleGenerateSummary = async () => {
    setLoading(prev => ({ ...prev, summary: true }));
    try {
      const result = await generateAISummary(leadId);
      setResults(prev => ({ ...prev, summary: result.data?.summary || result.summary }));
      onUpdate?.();
      toast.success('Summary generated');
    } catch (error) {
      toast.error(error.message);
    } finally {
      setLoading(prev => ({ ...prev, summary: false }));
    }
  };

  const handleSuggestProducts = async () => {
    setLoading(prev => ({ ...prev, suggestions: true }));
    try {
      const result = await generateProductSuggestions(leadId);
      const suggestions = result.data?.suggestions || result.suggestions;

      // Set state and show results
      setResults(prev => ({ ...prev, suggestions }));
      setShowSuggestions(true);
      setSelectedProducts([]); // Clear any previous selections

      const totalProducts = suggestions?.reduce((sum, cat) => sum + (cat.products?.length || 0), 0) || 0;
      toast.success(`Found ${totalProducts} matching products`);
    } catch (error) {
      toast.error(error.message || 'Failed to generate suggestions');
    } finally {
      setLoading(prev => ({ ...prev, suggestions: false }));
    }
  };

  const handleGenerateDraft = async () => {
    setLoading(prev => ({ ...prev, draft: true }));
    try {
      const result = await generateFollowUpDraft(leadId, draftTone);
      setResults(prev => ({ ...prev, draft: result.data?.draft || result.draft }));
      onUpdate?.();
      toast.success('Follow-up draft generated');
    } catch (error) {
      toast.error(error.message);
    } finally {
      setLoading(prev => ({ ...prev, draft: false }));
    }
  };

  const copyToClipboard = (text) => {
    navigator.clipboard.writeText(text);
    toast.success('Copied to clipboard');
  };

  return (
    <div className="ai-helper-panel">
      <div className="ai-helper-title">
        <span style={{ fontSize: '1rem' }}>AI Assistant</span>
      </div>

      {/* Next Best Actions - Always Visible at Top */}
      <NextBestActionsPanel
        actions={results.nextActions}
        loading={loading.nextActions}
        onRefresh={fetchNextActions}
        leadId={leadId}
        onActionTaken={onUpdate}
      />

      <div className="ai-helper-buttons">
        {/* Summary */}
        <div>
          <button
            className="ai-helper-btn"
            onClick={handleGenerateSummary}
            disabled={loading.summary}
          >
            {loading.summary ? 'Generating...' : 'Summarize Requirements'}
          </button>
          {results.summary && (
            <div className="ai-result">
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.5rem' }}>
                <strong>Summary</strong>
                <button
                  className="btn btn-sm btn-secondary"
                  onClick={() => copyToClipboard(results.summary)}
                >
                  Copy
                </button>
              </div>
              <pre style={{ whiteSpace: 'pre-wrap', margin: 0, fontFamily: 'inherit' }}>
                {results.summary}
              </pre>
            </div>
          )}
        </div>

        {/* Product Suggestions */}
        <div>
          <button
            className="ai-helper-btn"
            onClick={handleSuggestProducts}
            disabled={loading.suggestions}
          >
            {loading.suggestions ? 'Finding products...' : 'Suggest Products'}
          </button>
          {showSuggestions && (
            <div className="ai-result">
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.5rem' }}>
                <strong>Product Suggestions</strong>
                <button
                  className="btn btn-sm btn-secondary"
                  onClick={() => setShowSuggestions(false)}
                >
                  Hide
                </button>
              </div>
              {/* Selected Products Summary */}
              {selectedProducts.length > 0 && (
                <div style={{
                  background: '#dcfce7',
                  border: '1px solid #22c55e',
                  borderRadius: '6px',
                  padding: '0.75rem',
                  marginBottom: '1rem'
                }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <span style={{ fontWeight: 600, color: '#166534' }}>
                      {selectedProducts.length} product{selectedProducts.length > 1 ? 's' : ''} selected
                    </span>
                    <div style={{ display: 'flex', gap: '0.5rem' }}>
                      <button
                        className="btn btn-sm btn-secondary"
                        onClick={() => setSelectedProducts([])}
                      >
                        Clear
                      </button>
                      <button
                        className="btn btn-sm btn-success"
                        onClick={handleCreateQuoteWithProducts}
                      >
                        Create Quote
                      </button>
                    </div>
                  </div>
                </div>
              )}

              {Array.isArray(results.suggestions) && results.suggestions.length > 0 ? (
                results.suggestions.map((cat, idx) => (
                  <div key={idx} style={{ marginBottom: '1rem' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.5rem' }}>
                      <div style={{ fontWeight: 600 }}>
                        {cat.category}
                      </div>
                      {cat.products?.length > 1 && (
                        <button
                          className="btn btn-sm btn-secondary"
                          onClick={() => handleAddAllFromCategory(cat.products.slice(0, 5))}
                          style={{ fontSize: '0.7rem', padding: '0.25rem 0.5rem' }}
                        >
                          Add All
                        </button>
                      )}
                    </div>
                    <div style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', marginBottom: '0.5rem' }}>
                      {cat.reasoning}
                    </div>
                    {cat.products?.length > 0 ? (
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                        {cat.products.slice(0, 5).map((product, pIdx) => (
                          <div
                            key={pIdx}
                            onClick={() => toggleProductSelection(product)}
                            style={{
                              padding: '0.5rem',
                              background: isProductSelected(product.id) ? '#dbeafe' : 'var(--bg-secondary)',
                              border: isProductSelected(product.id) ? '2px solid #3b82f6' : '2px solid transparent',
                              borderRadius: '4px',
                              fontSize: '0.85rem',
                              cursor: 'pointer',
                              transition: 'all 0.15s ease'
                            }}
                          >
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                              <div style={{ flex: 1 }}>
                                <div style={{ fontWeight: 500 }}>{product.brand} {product.model}</div>
                                <div style={{ color: 'var(--text-secondary)', fontSize: '0.8rem' }}>
                                  {product.name?.substring(0, 60)}{product.name?.length > 60 ? '...' : ''}
                                </div>
                                <div style={{ color: 'var(--text-secondary)', marginTop: '0.25rem' }}>
                                  <strong>${product.price?.toFixed(2)}</strong> | {product.inStock ? '✓ In Stock' : '✗ Out of Stock'}
                                </div>
                              </div>
                              <div style={{
                                width: '24px',
                                height: '24px',
                                borderRadius: '4px',
                                border: '2px solid ' + (isProductSelected(product.id) ? '#3b82f6' : '#d1d5db'),
                                background: isProductSelected(product.id) ? '#3b82f6' : 'white',
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                                color: 'white',
                                fontWeight: 'bold',
                                fontSize: '0.75rem',
                                flexShrink: 0,
                                marginLeft: '0.5rem'
                              }}>
                                {isProductSelected(product.id) && '✓'}
                              </div>
                            </div>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <div style={{ fontStyle: 'italic', color: 'var(--text-secondary)' }}>
                        No matching products found in inventory
                      </div>
                    )}
                  </div>
                ))
              ) : (
                <div style={{ fontStyle: 'italic', color: 'var(--text-secondary)' }}>
                  No product requirements found. Add product requirements to the lead or include appliance types in the notes (e.g., "refrigerator", "range", "washer").
                </div>
              )}
            </div>
          )}
        </div>

        {/* Follow-up Draft */}
        <div>
          <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
            <button
              className="ai-helper-btn"
              onClick={handleGenerateDraft}
              disabled={loading.draft}
              style={{ flex: 1 }}
            >
              {loading.draft ? 'Drafting...' : 'Draft Follow-up Message'}
            </button>
            <select
              value={draftTone}
              onChange={(e) => setDraftTone(e.target.value)}
              style={{
                padding: '0.5rem',
                border: '1px solid #bae6fd',
                borderRadius: '6px',
                fontSize: '0.8rem',
                background: 'white'
              }}
            >
              <option value="professional">Professional</option>
              <option value="friendly">Friendly</option>
              <option value="casual">Casual</option>
            </select>
          </div>
          {results.draft && (
            <div className="ai-result">
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.5rem' }}>
                <strong>Follow-up Draft</strong>
                <button
                  className="btn btn-sm btn-secondary"
                  onClick={() => copyToClipboard(results.draft)}
                >
                  Copy
                </button>
              </div>
              <pre style={{ whiteSpace: 'pre-wrap', margin: 0, fontFamily: 'inherit' }}>
                {results.draft}
              </pre>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// Next Best Actions Panel Component
function NextBestActionsPanel({ actions, loading, onRefresh, leadId, onActionTaken }) {
  const toast = useToast();
  const navigate = useNavigate();

  const getActionIcon = (icon) => {
    const icons = {
      phone: '📞',
      email: '📧',
      document: '📄',
      calendar: '📅',
      tag: '🏷️',
      alert: '⚠️',
      heart: '💚',
      refresh: '🔄',
      info: 'ℹ️',
      check: '✅'
    };
    return icons[icon] || '📌';
  };

  const getUrgencyColor = (urgency) => {
    switch (urgency) {
      case 'high': return { bg: '#fee2e2', border: '#fca5a5', text: '#991b1b' };
      case 'medium': return { bg: '#fef3c7', border: '#fcd34d', text: '#92400e' };
      case 'low': return { bg: '#dcfce7', border: '#86efac', text: '#166534' };
      default: return { bg: '#f3f4f6', border: '#d1d5db', text: '#374151' };
    }
  };

  const handleActionClick = (action) => {
    switch (action.type) {
      case 'call_now':
        toast.info('Open your phone dialer to call the lead');
        break;
      case 'send_email':
        toast.info('Open email composition');
        break;
      case 'send_quote':
        sessionStorage.setItem('quoteFromLead', JSON.stringify({
          leadId: leadId,
          leadNumber: actions?.leadNumber,
          customerName: actions?.contactName
        }));
        navigate('/quotes/new');
        break;
      case 'follow_up':
        toast.info('Schedule a follow-up in the quick actions');
        break;
      default:
        toast.info(`Action: ${action.label}`);
    }
  };

  if (loading) {
    return (
      <div style={{
        background: '#eff6ff',
        borderRadius: '8px',
        padding: '1rem',
        marginBottom: '1rem'
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', color: '#3b82f6' }}>
          <span className="loading-spinner" style={{ width: '16px', height: '16px' }}></span>
          <span style={{ fontSize: '0.875rem' }}>Analyzing lead for best actions...</span>
        </div>
      </div>
    );
  }

  if (!actions || !actions.recommendations || actions.recommendations.length === 0) {
    return null;
  }

  return (
    <div style={{
      background: 'linear-gradient(135deg, #eff6ff 0%, #f0fdf4 100%)',
      borderRadius: '8px',
      padding: '1rem',
      marginBottom: '1rem',
      border: '1px solid #bfdbfe'
    }}>
      <div style={{
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginBottom: '0.75rem'
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
          <span style={{ fontSize: '1rem' }}>🎯</span>
          <span style={{ fontWeight: 600, fontSize: '0.9rem', color: '#1e40af' }}>
            Recommended Actions
          </span>
        </div>
        <button
          onClick={onRefresh}
          style={{
            background: 'none',
            border: 'none',
            cursor: 'pointer',
            color: '#6b7280',
            fontSize: '0.75rem',
            padding: '0.25rem'
          }}
          title="Refresh recommendations"
        >
          🔄
        </button>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
        {actions.recommendations.slice(0, 3).map((action, idx) => {
          const colors = getUrgencyColor(action.urgency);
          return (
            <div
              key={idx}
              onClick={() => handleActionClick(action)}
              style={{
                display: 'flex',
                alignItems: 'flex-start',
                gap: '0.75rem',
                padding: '0.75rem',
                background: 'white',
                borderRadius: '6px',
                border: `1px solid ${colors.border}`,
                cursor: 'pointer',
                transition: 'transform 0.15s, box-shadow 0.15s'
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.transform = 'translateY(-1px)';
                e.currentTarget.style.boxShadow = '0 2px 8px rgba(0,0,0,0.1)';
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.transform = 'none';
                e.currentTarget.style.boxShadow = 'none';
              }}
            >
              <span style={{
                fontSize: '1.25rem',
                background: colors.bg,
                padding: '0.5rem',
                borderRadius: '6px',
                lineHeight: 1
              }}>
                {getActionIcon(action.icon)}
              </span>
              <div style={{ flex: 1 }}>
                <div style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  marginBottom: '0.25rem'
                }}>
                  <span style={{ fontWeight: 600, fontSize: '0.875rem', color: '#1f2937' }}>
                    {action.label}
                  </span>
                  <span style={{
                    fontSize: '0.65rem',
                    padding: '0.15rem 0.4rem',
                    borderRadius: '10px',
                    background: colors.bg,
                    color: colors.text,
                    fontWeight: 600,
                    textTransform: 'uppercase'
                  }}>
                    {action.urgency}
                  </span>
                </div>
                <div style={{ fontSize: '0.8rem', color: '#6b7280' }}>
                  {action.reason}
                </div>
                <div style={{
                  marginTop: '0.25rem',
                  fontSize: '0.7rem',
                  color: '#9ca3af'
                }}>
                  {action.confidence}% confidence
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {actions.recommendations.length > 3 && (
        <div style={{
          textAlign: 'center',
          marginTop: '0.5rem',
          fontSize: '0.75rem',
          color: '#6b7280'
        }}>
          +{actions.recommendations.length - 3} more recommendations
        </div>
      )}
    </div>
  );
}

export default AIHelperPanel;
