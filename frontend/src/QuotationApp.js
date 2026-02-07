import React, { useState, useEffect } from 'react';

import { authFetch } from './services/authFetch';
const API_BASE = `${process.env.REACT_APP_API_URL || 'http://localhost:3001'}/api`;

function QuoteManager() {
  const [quotations, setQuotations] = useState([]);

  useEffect(() => {
    fetchQuotations();
  }, []);

  const fetchQuotations = async () => {
    try {
      const response = await authFetch(`${API_BASE}/quotations`);
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: Failed to fetch quotations`);
      }
      const data = await response.json();
      setQuotations(data);
    } catch (error) {
      // Log error for debugging but don't expose to user
      setQuotations([]);
    }
  };

  const deleteQuotation = async (id) => {
    if (!window.confirm('Are you sure you want to delete this quote?')) return;
    try {
      const response = await authFetch(`${API_BASE}/quotations/${id}`, {
        method: 'DELETE'
      });
      if (response.ok) {
        alert('Quote deleted successfully');
        fetchQuotations();
      } else {
        alert('Failed to delete quote. Please try again.');
      }
    } catch (error) {
      alert('Network error. Please check your connection and try again.');
    }
  };

  const handlePreview = (quote) => {
    alert('👁️ PREVIEW button clicked!\nThis confirms the NEW component is loaded!\n\nNext: We will add PDF functionality.');
  };

  const handleDownloadPDF = (quote) => {
    alert('⬇️ PDF button clicked!\nThis confirms the NEW component is loaded!');
  };

  const handleEmail = (quote) => {
    alert('✉️ EMAIL button clicked!\nThis confirms the NEW component is loaded!');
  };

  const handleInternal = (quote) => {
    alert('📊 INTERNAL button clicked!\nThis confirms the NEW component is loaded!');
  };

  return (
    <div style={{ padding: '30px', fontFamily: 'system-ui, -apple-system, sans-serif' }}>
      {/* SUCCESS BANNER */}
      <div style={{ 
        background: 'linear-gradient(135deg, #10b981 0%, #059669 100%)', 
        padding: '30px', 
        borderRadius: '16px', 
        marginBottom: '30px',
        textAlign: 'center',
        boxShadow: '0 10px 30px rgba(16,185,129,0.3)',
        border: '4px solid #34d399'
      }}>
        <h1 style={{ 
          margin: 0, 
          fontSize: '42px', 
          fontWeight: 'bold', 
          color: 'white',
          textShadow: '2px 2px 4px rgba(0,0,0,0.2)'
        }}>
          ✅ SUCCESS! NEW COMPONENT LOADED! ✅
        </h1>
        <p style={{ 
          margin: '12px 0 0 0', 
          color: 'white', 
          fontSize: '20px',
          fontWeight: '600'
        }}>
          You should now see 5 BUTTONS below (not just View & Delete)
        </p>
      </div>

      <div style={{ marginBottom: '30px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div>
          <h1 style={{ margin: 0, fontSize: '32px', fontWeight: 'bold', background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>
            📋 Quotations - Phase 5 Ready!
          </h1>
          <p style={{ margin: '8px 0 0 0', color: '#6b7280', fontSize: '14px' }}>
            With 5 action buttons: Preview, PDF, Email, Internal, Delete
          </p>
        </div>
        <button
          style={{ padding: '14px 28px', background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)', color: 'white', border: 'none', borderRadius: '8px', fontSize: '16px', fontWeight: 'bold', cursor: 'pointer', boxShadow: '0 4px 6px rgba(0,0,0,0.1)' }}
        >
          ➕ Create New Quote
        </button>
      </div>

      <div style={{ background: 'white', borderRadius: '12px', boxShadow: '0 1px 3px rgba(0,0,0,0.1)', overflow: 'hidden' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead>
            <tr style={{ background: '#f9fafb', borderBottom: '2px solid #e5e7eb' }}>
              <th style={{ padding: '16px', textAlign: 'left', fontSize: '12px', fontWeight: '600', color: '#6b7280', textTransform: 'uppercase' }}>Quote #</th>
              <th style={{ padding: '16px', textAlign: 'left', fontSize: '12px', fontWeight: '600', color: '#6b7280', textTransform: 'uppercase' }}>Date</th>
              <th style={{ padding: '16px', textAlign: 'left', fontSize: '12px', fontWeight: '600', color: '#6b7280', textTransform: 'uppercase' }}>Customer</th>
              <th style={{ padding: '16px', textAlign: 'right', fontSize: '12px', fontWeight: '600', color: '#6b7280', textTransform: 'uppercase' }}>Total</th>
              <th style={{ padding: '16px', textAlign: 'center', fontSize: '12px', fontWeight: '600', color: '#6b7280', textTransform: 'uppercase' }}>
                ⭐ 5 ACTIONS ⭐
              </th>
            </tr>
          </thead>
          <tbody>
            {quotations.length === 0 ? (
              <tr>
                <td colSpan="5" style={{ padding: '40px', textAlign: 'center', color: '#9ca3af' }}>
                  No quotes yet. Create your first quote!
                </td>
              </tr>
            ) : (
              quotations.map(quote => (
                <tr key={quote.id} style={{ borderBottom: '1px solid #f3f4f6', transition: 'background 0.2s' }}>
                  <td style={{ padding: '16px', fontWeight: '600', color: '#667eea' }}>{quote.quote_number}</td>
                  <td style={{ padding: '16px', color: '#374151' }}>{new Date(quote.created_at).toLocaleDateString()}</td>
                  <td style={{ padding: '16px', color: '#374151' }}>{quote.customer_name}</td>
                  <td style={{ padding: '16px', textAlign: 'right', fontWeight: '600', color: '#111827' }}>${parseFloat(quote.total_amount).toFixed(2)}</td>
                  <td style={{ padding: '16px' }}>
                    <div style={{ display: 'flex', gap: '8px', justifyContent: 'center', flexWrap: 'wrap' }}>
                      <button
                        onClick={() => handlePreview(quote)}
                        style={{ 
                          padding: '10px 14px', 
                          background: '#3b82f6', 
                          color: 'white', 
                          border: 'none', 
                          borderRadius: '8px', 
                          fontSize: '13px', 
                          cursor: 'pointer', 
                          fontWeight: '700',
                          boxShadow: '0 2px 4px rgba(59,130,246,0.3)',
                          transition: 'all 0.2s'
                        }}
                        title="Preview PDF in browser"
                      >
                        👁️ PREVIEW
                      </button>
                      <button
                        onClick={() => handleDownloadPDF(quote)}
                        style={{ 
                          padding: '10px 14px', 
                          background: '#10b981', 
                          color: 'white', 
                          border: 'none', 
                          borderRadius: '8px', 
                          fontSize: '13px', 
                          cursor: 'pointer', 
                          fontWeight: '700',
                          boxShadow: '0 2px 4px rgba(16,185,129,0.3)',
                          transition: 'all 0.2s'
                        }}
                        title="Download customer PDF"
                      >
                        ⬇️ PDF
                      </button>
                      <button
                        onClick={() => handleEmail(quote)}
                        style={{ 
                          padding: '10px 14px', 
                          background: '#8b5cf6', 
                          color: 'white', 
                          border: 'none', 
                          borderRadius: '8px', 
                          fontSize: '13px', 
                          cursor: 'pointer', 
                          fontWeight: '700',
                          boxShadow: '0 2px 4px rgba(139,92,246,0.3)',
                          transition: 'all 0.2s'
                        }}
                        title="Email quote"
                      >
                        ✉️ EMAIL
                      </button>
                      <button
                        onClick={() => handleInternal(quote)}
                        style={{ 
                          padding: '10px 14px', 
                          background: '#f59e0b', 
                          color: 'white', 
                          border: 'none', 
                          borderRadius: '8px', 
                          fontSize: '13px', 
                          cursor: 'pointer', 
                          fontWeight: '700',
                          boxShadow: '0 2px 4px rgba(245,158,11,0.3)',
                          transition: 'all 0.2s'
                        }}
                        title="Download internal PDF with costs"
                      >
                        📊 INTERNAL
                      </button>
                      <button
                        onClick={() => deleteQuotation(quote.id)}
                        style={{ 
                          padding: '10px 14px', 
                          background: '#ef4444', 
                          color: 'white', 
                          border: 'none', 
                          borderRadius: '8px', 
                          fontSize: '13px', 
                          cursor: 'pointer', 
                          fontWeight: '700',
                          boxShadow: '0 2px 4px rgba(239,68,68,0.3)',
                          transition: 'all 0.2s'
                        }}
                        title="Delete quote"
                      >
                        🗑️ DELETE
                      </button>
                    </div>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {/* INSTRUCTIONS BANNER */}
      <div style={{ 
        background: '#f3f4f6', 
        padding: '24px', 
        borderRadius: '12px', 
        marginTop: '30px',
        border: '2px solid #d1d5db'
      }}>
        <h3 style={{ margin: '0 0 12px 0', color: '#111827', fontSize: '18px', fontWeight: '600' }}>
          🎯 Next Steps:
        </h3>
        <ul style={{ margin: 0, paddingLeft: '24px', color: '#374151', lineHeight: '1.8' }}>
          <li>Click any of the 5 buttons to test they work</li>
          <li>Once confirmed, we'll add the full PDF generation functionality</li>
          <li>Then add email integration with AWS SES</li>
        </ul>
      </div>
    </div>
  );
}

export default QuoteManager;