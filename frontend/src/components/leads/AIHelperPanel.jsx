/**
 * AIHelperPanel - AI-powered helpers for leads
 * - Generate summary
 * - Suggest products
 * - Draft follow-up message
 */

import React, { useState } from 'react';
import {
  generateAISummary,
  generateProductSuggestions,
  generateFollowUpDraft
} from './hooks/useLeads';
import { useToast } from '../ui/Toast';

function AIHelperPanel({ leadId, lead, onUpdate }) {
  const toast = useToast();
  const [loading, setLoading] = useState({
    summary: false,
    suggestions: false,
    draft: false
  });
  const [results, setResults] = useState({
    summary: lead?.ai_summary || null,
    suggestions: lead?.ai_suggested_products || null,
    draft: lead?.ai_draft_message || null
  });
  const [draftTone, setDraftTone] = useState('professional');
  const [showSuggestions, setShowSuggestions] = useState(false);

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
      setResults(prev => ({ ...prev, suggestions: result.data?.suggestions || result.suggestions }));
      setShowSuggestions(true);
      onUpdate?.();
      toast.success('Product suggestions generated');
    } catch (error) {
      toast.error(error.message);
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
          {results.suggestions && showSuggestions && (
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
              {Array.isArray(results.suggestions) ? (
                results.suggestions.map((cat, idx) => (
                  <div key={idx} style={{ marginBottom: '1rem' }}>
                    <div style={{ fontWeight: 600, marginBottom: '0.5rem' }}>
                      {cat.category}
                    </div>
                    <div style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', marginBottom: '0.5rem' }}>
                      {cat.reasoning}
                    </div>
                    {cat.products?.length > 0 ? (
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                        {cat.products.slice(0, 3).map((product, pIdx) => (
                          <div
                            key={pIdx}
                            style={{
                              padding: '0.5rem',
                              background: 'var(--bg-secondary)',
                              borderRadius: '4px',
                              fontSize: '0.85rem'
                            }}
                          >
                            <div style={{ fontWeight: 500 }}>{product.brand} {product.model}</div>
                            <div style={{ color: 'var(--text-secondary)' }}>
                              ${product.price?.toFixed(2)} | {product.inStock ? 'In Stock' : 'Out of Stock'}
                            </div>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <div style={{ fontStyle: 'italic', color: 'var(--text-secondary)' }}>
                        No matching products found
                      </div>
                    )}
                  </div>
                ))
              ) : (
                <div>No suggestions available</div>
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

export default AIHelperPanel;
