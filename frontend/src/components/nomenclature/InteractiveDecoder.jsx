/**
 * InteractiveDecoder.jsx
 * Enter a model number and see character-by-character breakdown
 */

import React, { useState, useCallback } from 'react';
import ModelBreakdown from './ModelBreakdown';

const API_BASE = process.env.REACT_APP_API_URL || 'http://localhost:3001';

const InteractiveDecoder = ({ manufacturer, templates }) => {
  const [modelNumber, setModelNumber] = useState('');
  const [decodeResult, setDecodeResult] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [recentModels, setRecentModels] = useState([]);

  // Decode model number
  const decodeModel = useCallback(async (model) => {
    if (!model || model.length < 3) {
      setError('Please enter at least 3 characters');
      return;
    }

    try {
      setLoading(true);
      setError(null);

      const token = localStorage.getItem('auth_token');
      const response = await fetch(`${API_BASE}/api/nomenclature/decode`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({
          modelNumber: model.toUpperCase(),
          manufacturer: manufacturer
        })
      });

      if (!response.ok) {
        throw new Error('Failed to decode model number');
      }

      const data = await response.json();

      if (data.success) {
        setDecodeResult(data.data);
        // Add to recent models (max 5)
        setRecentModels(prev => {
          const updated = [model.toUpperCase(), ...prev.filter(m => m !== model.toUpperCase())];
          return updated.slice(0, 5);
        });
      } else {
        // Backend returns 'error' field, not 'message'
        setError(data.error || data.message || 'Could not decode model number');
        setDecodeResult(null);
      }
    } catch (err) {
      console.error('Decode error:', err);
      // Provide more helpful error message
      if (err.message === 'Failed to fetch') {
        setError('Network error. Please check your connection and try again.');
      } else {
        setError(err.message || 'Failed to decode model number. Please try again.');
      }
      setDecodeResult(null);
    } finally {
      setLoading(false);
    }
  }, [manufacturer]);

  // Handle form submit
  const handleSubmit = (e) => {
    e.preventDefault();
    decodeModel(modelNumber);
  };

  // Example models for current manufacturer
  const exampleModels = templates.flatMap(t => t.example_models || []).slice(0, 4);

  return (
    <div>
      {/* Input Section */}
      <div style={{ marginBottom: '24px' }}>
        <form onSubmit={handleSubmit}>
          <div style={{ display: 'flex', gap: '12px', marginBottom: '12px' }}>
            <input
              type="text"
              value={modelNumber}
              onChange={(e) => setModelNumber(e.target.value.toUpperCase())}
              placeholder={`Enter ${manufacturer} model number...`}
              style={{
                flex: 1,
                padding: '14px 16px',
                fontSize: '18px',
                fontFamily: 'monospace',
                letterSpacing: '2px',
                border: '2px solid #e5e7eb',
                borderRadius: '8px',
                outline: 'none',
                transition: 'border-color 0.2s ease'
              }}
              onFocus={(e) => e.target.style.borderColor = '#4f46e5'}
              onBlur={(e) => e.target.style.borderColor = '#e5e7eb'}
            />
            <button
              type="submit"
              disabled={loading || modelNumber.length < 3}
              style={{
                padding: '14px 28px',
                fontSize: '16px',
                fontWeight: '600',
                backgroundColor: loading ? '#9ca3af' : '#4f46e5',
                color: 'white',
                border: 'none',
                borderRadius: '8px',
                cursor: loading ? 'wait' : 'pointer',
                transition: 'background-color 0.2s ease'
              }}
            >
              {loading ? 'Decoding...' : 'Decode'}
            </button>
          </div>
        </form>

        {/* Example Models */}
        {exampleModels.length > 0 && (
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
            <span style={{ fontSize: '13px', color: '#6b7280' }}>Try examples:</span>
            {exampleModels.map((model, idx) => (
              <button
                key={idx}
                onClick={() => {
                  setModelNumber(model);
                  decodeModel(model);
                }}
                style={{
                  padding: '4px 10px',
                  fontSize: '12px',
                  fontFamily: 'monospace',
                  backgroundColor: '#f3f4f6',
                  border: '1px solid #e5e7eb',
                  borderRadius: '4px',
                  cursor: 'pointer',
                  color: '#4f46e5'
                }}
              >
                {model}
              </button>
            ))}
          </div>
        )}

        {/* Recent Models */}
        {recentModels.length > 0 && (
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginTop: '8px', flexWrap: 'wrap' }}>
            <span style={{ fontSize: '13px', color: '#6b7280' }}>Recent:</span>
            {recentModels.map((model, idx) => (
              <button
                key={idx}
                onClick={() => {
                  setModelNumber(model);
                  decodeModel(model);
                }}
                style={{
                  padding: '4px 10px',
                  fontSize: '12px',
                  fontFamily: 'monospace',
                  backgroundColor: '#fef3c7',
                  border: '1px solid #fcd34d',
                  borderRadius: '4px',
                  cursor: 'pointer',
                  color: '#92400e'
                }}
              >
                {model}
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Error Display */}
      {error && (
        <div style={{
          backgroundColor: '#fef2f2',
          border: '1px solid #fecaca',
          borderRadius: '8px',
          padding: '12px 16px',
          marginBottom: '24px',
          color: '#dc2626',
          fontSize: '14px'
        }}>
          {error}
        </div>
      )}

      {/* Results Section */}
      {decodeResult && (
        <ModelBreakdown
          result={decodeResult}
          modelNumber={decodeResult.modelNumber}
        />
      )}

      {/* Help Text */}
      {!decodeResult && !error && (
        <div style={{
          textAlign: 'center',
          padding: '48px 24px',
          backgroundColor: '#f9fafb',
          borderRadius: '12px',
          border: '2px dashed #e5e7eb'
        }}>
          <div style={{ fontSize: '48px', marginBottom: '16px' }}>🔍</div>
          <div style={{ fontSize: '16px', fontWeight: '600', color: '#374151', marginBottom: '8px' }}>
            Enter a Model Number to Decode
          </div>
          <div style={{ fontSize: '14px', color: '#6b7280' }}>
            Type any {manufacturer} model number above to see a detailed breakdown<br />
            of what each character or segment means
          </div>
        </div>
      )}
    </div>
  );
};

export default InteractiveDecoder;
