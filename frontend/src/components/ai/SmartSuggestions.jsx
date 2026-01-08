import React, { useState, useEffect, useCallback } from 'react';

const API_URL = `${process.env.REACT_APP_API_URL || 'http://localhost:3001'}/api`;

/**
 * SmartSuggestions - AI-powered suggestions panel for quotes
 *
 * Shows intelligent recommendations based on:
 * - Bundle completion opportunities
 * - Protection plan suggestions
 * - Volume discount reminders
 * - Financing options
 */
const SmartSuggestions = ({ quoteItems = [], customerId, onActionClick }) => {
  const [suggestions, setSuggestions] = useState([]);
  const [loading, setLoading] = useState(false);
  const [collapsed, setCollapsed] = useState(false);

  // Fetch suggestions when quote items change
  const fetchSuggestions = useCallback(async () => {
    if (quoteItems.length === 0) {
      setSuggestions([]);
      return;
    }

    setLoading(true);
    try {
      const response = await fetch(`${API_URL}/ai/suggestions/quote`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ quoteItems, customerId })
      });

      if (response.ok) {
        const data = await response.json();
        setSuggestions(data);
      }
    } catch (err) {
      console.error('Error fetching suggestions:', err);
    } finally {
      setLoading(false);
    }
  }, [quoteItems, customerId]);

  useEffect(() => {
    const timer = setTimeout(fetchSuggestions, 500);
    return () => clearTimeout(timer);
  }, [fetchSuggestions]);

  if (quoteItems.length === 0 || (suggestions.length === 0 && !loading)) {
    return null;
  }

  const handleAction = (suggestion) => {
    if (onActionClick) {
      onActionClick(suggestion);
    }
  };

  const getPriorityColor = (priority) => {
    switch (priority) {
      case 'high': return { bg: '#fef3c7', border: '#fbbf24', text: '#92400e' };
      case 'medium': return { bg: '#dbeafe', border: '#3b82f6', text: '#1d4ed8' };
      case 'low': return { bg: '#f3f4f6', border: '#9ca3af', text: '#4b5563' };
      default: return { bg: '#f3f4f6', border: '#9ca3af', text: '#4b5563' };
    }
  };

  const getTypeIcon = (type) => {
    switch (type) {
      case 'bundle_completion': return 'puzzle';
      case 'protection_plan': return 'shield';
      case 'delivery_bundle': return 'truck';
      case 'volume_discount': return 'percent';
      case 'brand_matching': return 'star';
      case 'financing': return 'credit-card';
      default: return 'lightbulb';
    }
  };

  const containerStyle = {
    backgroundColor: '#fffbeb',
    border: '1px solid #fbbf24',
    borderRadius: '12px',
    marginBottom: '24px',
    overflow: 'hidden'
  };

  const headerStyle = {
    padding: '16px 20px',
    backgroundColor: '#fef3c7',
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    cursor: 'pointer'
  };

  const titleStyle = {
    display: 'flex',
    alignItems: 'center',
    gap: '10px',
    fontWeight: '600',
    fontSize: '16px',
    color: '#92400e'
  };

  const contentStyle = {
    padding: collapsed ? '0' : '16px 20px',
    maxHeight: collapsed ? '0' : '500px',
    overflow: 'hidden',
    transition: 'all 0.3s ease'
  };

  return (
    <div style={containerStyle}>
      <div style={headerStyle} onClick={() => setCollapsed(!collapsed)}>
        <div style={titleStyle}>
          <span style={{ fontSize: '20px' }}>lightbulb</span>
          <span>Smart Suggestions</span>
          {suggestions.length > 0 && (
            <span style={{
              padding: '2px 8px',
              backgroundColor: '#f59e0b',
              color: '#fff',
              borderRadius: '12px',
              fontSize: '12px',
              fontWeight: '600'
            }}>
              {suggestions.length}
            </span>
          )}
        </div>
        <span style={{ fontSize: '18px', color: '#92400e' }}>
          {collapsed ? '+' : '-'}
        </span>
      </div>

      <div style={contentStyle}>
        {loading ? (
          <div style={{ textAlign: 'center', padding: '20px', color: '#92400e' }}>
            Analyzing your quote...
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
            {suggestions.map((suggestion, index) => {
              const colors = getPriorityColor(suggestion.priority);
              return (
                <div
                  key={index}
                  style={{
                    padding: '14px 16px',
                    backgroundColor: colors.bg,
                    border: `1px solid ${colors.border}`,
                    borderRadius: '8px',
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center'
                  }}
                >
                  <div style={{ flex: 1 }}>
                    <div style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: '8px',
                      marginBottom: '4px'
                    }}>
                      <span style={{ fontSize: '16px' }}>{getTypeIcon(suggestion.type)}</span>
                      <span style={{
                        fontWeight: '600',
                        fontSize: '14px',
                        color: colors.text
                      }}>
                        {suggestion.title}
                      </span>
                      {suggestion.priority === 'high' && (
                        <span style={{
                          padding: '2px 6px',
                          backgroundColor: '#dc2626',
                          color: '#fff',
                          borderRadius: '4px',
                          fontSize: '10px',
                          fontWeight: '600'
                        }}>
                          RECOMMENDED
                        </span>
                      )}
                    </div>
                    <div style={{ fontSize: '13px', color: '#4b5563' }}>
                      {suggestion.description}
                    </div>
                    {suggestion.potentialSavings && (
                      <div style={{
                        marginTop: '6px',
                        fontSize: '13px',
                        color: '#059669',
                        fontWeight: '500'
                      }}>
                        Potential savings: ${suggestion.potentialSavings}
                      </div>
                    )}
                  </div>
                  {suggestion.action && (
                    <button
                      onClick={() => handleAction(suggestion)}
                      style={{
                        padding: '8px 14px',
                        backgroundColor: colors.text,
                        color: '#fff',
                        border: 'none',
                        borderRadius: '6px',
                        fontSize: '13px',
                        fontWeight: '500',
                        cursor: 'pointer',
                        whiteSpace: 'nowrap',
                        marginLeft: '12px'
                      }}
                    >
                      {suggestion.action === 'browse_category' ? 'Browse' :
                       suggestion.action === 'add_protection' ? 'Add Plan' :
                       suggestion.action === 'add_delivery' ? 'Add Delivery' :
                       suggestion.action === 'browse_products' ? 'Add Item' :
                       suggestion.action === 'view_brand' ? 'View' :
                       suggestion.action === 'view_financing' ? 'View Options' :
                       'View'}
                    </button>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
};

export default SmartSuggestions;
