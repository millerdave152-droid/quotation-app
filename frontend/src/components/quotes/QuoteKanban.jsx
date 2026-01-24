import React, { useState, useMemo } from 'react';

const PIPELINE_STAGES = [
  { id: 'draft', label: 'Draft', color: '#9ca3af', bgColor: '#f3f4f6', icon: '📝' },
  { id: 'sent', label: 'Sent', color: '#3b82f6', bgColor: '#eff6ff', icon: '📤' },
  { id: 'viewed', label: 'Viewed', color: '#8b5cf6', bgColor: '#f5f3ff', icon: '👁️' },
  { id: 'pending', label: 'Pending', color: '#f59e0b', bgColor: '#fffbeb', icon: '⏳' },
  { id: 'won', label: 'Won', color: '#22c55e', bgColor: '#f0fdf4', icon: '🏆' },
  { id: 'lost', label: 'Lost', color: '#ef4444', bgColor: '#fef2f2', icon: '❌' },
];

const QuoteKanban = ({
  quotations,
  onViewQuote,
  onEditQuote,
  onStatusChange,
  onCreateNew,
  onViewModeChange,
  listViewMode = 'kanban',
  formatCurrency,
  formatDate,
}) => {
  const [draggedQuote, setDraggedQuote] = useState(null);
  const [dragOverColumn, setDragOverColumn] = useState(null);

  // Group quotes by status
  const quotesByStatus = useMemo(() => {
    const grouped = {};
    PIPELINE_STAGES.forEach(stage => {
      grouped[stage.id] = [];
    });

    quotations.forEach(quote => {
      const status = (quote.status || 'draft').toLowerCase();
      if (grouped[status]) {
        grouped[status].push(quote);
      } else {
        // Put unknown statuses in draft
        grouped['draft'].push(quote);
      }
    });

    // Sort each column by date (newest first)
    Object.keys(grouped).forEach(key => {
      grouped[key].sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
    });

    return grouped;
  }, [quotations]);

  // Calculate column totals
  const columnTotals = useMemo(() => {
    const totals = {};
    PIPELINE_STAGES.forEach(stage => {
      const quotes = quotesByStatus[stage.id] || [];
      totals[stage.id] = {
        count: quotes.length,
        value: quotes.reduce((sum, q) => sum + (parseFloat(q.total_amount) || 0), 0),
      };
    });
    return totals;
  }, [quotesByStatus]);

  // Drag handlers
  const handleDragStart = (e, quote) => {
    setDraggedQuote(quote);
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/plain', quote.id);
  };

  const handleDragEnd = () => {
    setDraggedQuote(null);
    setDragOverColumn(null);
  };

  const handleDragOver = (e, stageId) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    setDragOverColumn(stageId);
  };

  const handleDragLeave = () => {
    setDragOverColumn(null);
  };

  const handleDrop = (e, newStatus) => {
    e.preventDefault();
    setDragOverColumn(null);

    if (draggedQuote && draggedQuote.status !== newStatus) {
      onStatusChange(draggedQuote.id, newStatus);
    }
    setDraggedQuote(null);
  };

  // Get days until expiry
  const getDaysUntilExpiry = (expiryDate) => {
    if (!expiryDate) return null;
    const today = new Date();
    const expiry = new Date(expiryDate);
    const diffTime = expiry - today;
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
    return diffDays;
  };

  return (
    <div style={{ padding: '20px' }}>
      {/* Pipeline Header */}
      <div style={{
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginBottom: '20px',
      }}>
        <div>
          <h2 style={{ margin: 0, fontSize: '24px', fontWeight: '700', color: '#111827' }}>
            Quote Pipeline
          </h2>
          <p style={{ margin: '4px 0 0', color: '#6b7280', fontSize: '14px' }}>
            Drag and drop quotes to change their status
          </p>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
          {/* Pipeline Value Summary */}
          <div style={{
            display: 'flex',
            gap: '16px',
            padding: '12px 20px',
            backgroundColor: '#f9fafb',
            borderRadius: '8px',
          }}>
            <div style={{ textAlign: 'center' }}>
              <div style={{ fontSize: '12px', color: '#6b7280', fontWeight: '500' }}>Total Pipeline</div>
              <div style={{ fontSize: '18px', fontWeight: '700', color: '#111827' }}>
                {formatCurrency(Object.values(columnTotals).reduce((sum, t) => sum + t.value, 0))}
              </div>
            </div>
            <div style={{ width: '1px', backgroundColor: '#e5e7eb' }} />
            <div style={{ textAlign: 'center' }}>
              <div style={{ fontSize: '12px', color: '#6b7280', fontWeight: '500' }}>Total Quotes</div>
              <div style={{ fontSize: '18px', fontWeight: '700', color: '#111827' }}>
                {quotations.length}
              </div>
            </div>
          </div>

          {/* View Mode Toggle */}
          {onViewModeChange && (
            <div style={{
              display: 'flex',
              backgroundColor: '#f3f4f6',
              borderRadius: '8px',
              padding: '4px',
            }}>
              <button
                onClick={() => onViewModeChange('list')}
                style={{
                  padding: '8px 16px',
                  border: 'none',
                  borderRadius: '6px',
                  backgroundColor: listViewMode === 'list' ? 'white' : 'transparent',
                  color: listViewMode === 'list' ? '#111827' : '#6b7280',
                  fontSize: '13px',
                  fontWeight: '600',
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '6px',
                  boxShadow: listViewMode === 'list' ? '0 1px 3px rgba(0,0,0,0.1)' : 'none',
                  transition: 'all 0.15s ease',
                }}
              >
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <line x1="8" y1="6" x2="21" y2="6"></line>
                  <line x1="8" y1="12" x2="21" y2="12"></line>
                  <line x1="8" y1="18" x2="21" y2="18"></line>
                  <line x1="3" y1="6" x2="3.01" y2="6"></line>
                  <line x1="3" y1="12" x2="3.01" y2="12"></line>
                  <line x1="3" y1="18" x2="3.01" y2="18"></line>
                </svg>
                List
              </button>
              <button
                onClick={() => onViewModeChange('kanban')}
                style={{
                  padding: '8px 16px',
                  border: 'none',
                  borderRadius: '6px',
                  backgroundColor: listViewMode === 'kanban' ? 'white' : 'transparent',
                  color: listViewMode === 'kanban' ? '#111827' : '#6b7280',
                  fontSize: '13px',
                  fontWeight: '600',
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '6px',
                  boxShadow: listViewMode === 'kanban' ? '0 1px 3px rgba(0,0,0,0.1)' : 'none',
                  transition: 'all 0.15s ease',
                }}
              >
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <rect x="3" y="3" width="5" height="18" rx="1"></rect>
                  <rect x="10" y="3" width="5" height="12" rx="1"></rect>
                  <rect x="17" y="3" width="5" height="8" rx="1"></rect>
                </svg>
                Pipeline
              </button>
            </div>
          )}

          {/* Create New Button */}
          {onCreateNew && (
            <button
              onClick={onCreateNew}
              style={{
                padding: '12px 24px',
                background: '#22c55e',
                color: 'white',
                border: 'none',
                borderRadius: '8px',
                fontSize: '14px',
                fontWeight: 'bold',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                gap: '8px',
                boxShadow: '0 2px 8px rgba(34, 197, 94, 0.4)',
                transition: 'all 0.2s ease'
              }}
              onMouseEnter={(e) => { e.currentTarget.style.background = '#16a34a'; }}
              onMouseLeave={(e) => { e.currentTarget.style.background = '#22c55e'; }}
            >
              + New Quote
            </button>
          )}
        </div>
      </div>

      {/* Kanban Board */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: `repeat(${PIPELINE_STAGES.length}, 1fr)`,
        gap: '16px',
        minHeight: '600px',
      }}>
        {PIPELINE_STAGES.map(stage => (
          <div
            key={stage.id}
            onDragOver={(e) => handleDragOver(e, stage.id)}
            onDragLeave={handleDragLeave}
            onDrop={(e) => handleDrop(e, stage.id)}
            style={{
              backgroundColor: dragOverColumn === stage.id ? stage.bgColor : '#f9fafb',
              borderRadius: '12px',
              padding: '12px',
              border: dragOverColumn === stage.id
                ? `2px dashed ${stage.color}`
                : '2px solid transparent',
              transition: 'all 0.2s ease',
            }}
          >
            {/* Column Header */}
            <div style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              marginBottom: '12px',
              padding: '8px 12px',
              backgroundColor: stage.bgColor,
              borderRadius: '8px',
              borderLeft: `4px solid ${stage.color}`,
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <span style={{ fontSize: '16px' }}>{stage.icon}</span>
                <span style={{ fontWeight: '600', color: '#111827', fontSize: '14px' }}>
                  {stage.label}
                </span>
                <span style={{
                  backgroundColor: stage.color,
                  color: 'white',
                  fontSize: '11px',
                  fontWeight: '600',
                  padding: '2px 8px',
                  borderRadius: '12px',
                }}>
                  {columnTotals[stage.id].count}
                </span>
              </div>
              <div style={{ fontSize: '12px', fontWeight: '600', color: stage.color }}>
                {formatCurrency(columnTotals[stage.id].value)}
              </div>
            </div>

            {/* Quote Cards */}
            <div style={{
              display: 'flex',
              flexDirection: 'column',
              gap: '10px',
              minHeight: '400px',
              overflowY: 'auto',
              maxHeight: 'calc(100vh - 300px)',
            }}>
              {(quotesByStatus[stage.id] || []).map(quote => {
                const daysUntilExpiry = getDaysUntilExpiry(quote.valid_until);
                const isExpiringSoon = daysUntilExpiry !== null && daysUntilExpiry <= 7 && daysUntilExpiry >= 0;
                const isExpired = daysUntilExpiry !== null && daysUntilExpiry < 0;

                return (
                  <div
                    key={quote.id}
                    draggable
                    onDragStart={(e) => handleDragStart(e, quote)}
                    onDragEnd={handleDragEnd}
                    onClick={() => onViewQuote(quote.id)}
                    style={{
                      backgroundColor: 'white',
                      borderRadius: '8px',
                      padding: '12px',
                      boxShadow: draggedQuote?.id === quote.id
                        ? '0 8px 20px rgba(0,0,0,0.15)'
                        : '0 1px 3px rgba(0,0,0,0.1)',
                      cursor: 'grab',
                      opacity: draggedQuote?.id === quote.id ? 0.5 : 1,
                      transition: 'all 0.2s ease',
                      border: isExpired
                        ? '2px solid #ef4444'
                        : isExpiringSoon
                          ? '2px solid #f59e0b'
                          : '1px solid #e5e7eb',
                    }}
                    onMouseEnter={(e) => {
                      if (draggedQuote?.id !== quote.id) {
                        e.currentTarget.style.transform = 'translateY(-2px)';
                        e.currentTarget.style.boxShadow = '0 4px 12px rgba(0,0,0,0.1)';
                      }
                    }}
                    onMouseLeave={(e) => {
                      e.currentTarget.style.transform = 'none';
                      e.currentTarget.style.boxShadow = '0 1px 3px rgba(0,0,0,0.1)';
                    }}
                  >
                    {/* Quote Number & Value */}
                    <div style={{
                      display: 'flex',
                      justifyContent: 'space-between',
                      alignItems: 'flex-start',
                      marginBottom: '8px',
                    }}>
                      <span style={{
                        fontWeight: '600',
                        color: '#6366f1',
                        fontSize: '13px',
                      }}>
                        {quote.quotation_number}
                      </span>
                      <span style={{
                        fontWeight: '700',
                        color: '#111827',
                        fontSize: '14px',
                      }}>
                        {formatCurrency(quote.total_amount)}
                      </span>
                    </div>

                    {/* Customer Name */}
                    <div style={{
                      fontWeight: '500',
                      color: '#111827',
                      fontSize: '14px',
                      marginBottom: '8px',
                      whiteSpace: 'nowrap',
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                    }}>
                      {quote.customer_name || 'No Customer'}
                    </div>

                    {/* Items Count & Date */}
                    <div style={{
                      display: 'flex',
                      justifyContent: 'space-between',
                      fontSize: '12px',
                      color: '#6b7280',
                    }}>
                      <span>{quote.item_count || 0} items</span>
                      <span>{formatDate(quote.created_at)}</span>
                    </div>

                    {/* Expiry Warning */}
                    {(isExpiringSoon || isExpired) && (
                      <div style={{
                        marginTop: '8px',
                        padding: '4px 8px',
                        borderRadius: '4px',
                        fontSize: '11px',
                        fontWeight: '600',
                        backgroundColor: isExpired ? '#fef2f2' : '#fffbeb',
                        color: isExpired ? '#dc2626' : '#d97706',
                        textAlign: 'center',
                      }}>
                        {isExpired
                          ? 'Expired'
                          : daysUntilExpiry === 0
                            ? 'Expires Today!'
                            : `Expires in ${daysUntilExpiry} day${daysUntilExpiry !== 1 ? 's' : ''}`
                        }
                      </div>
                    )}

                    {/* Actions */}
                    <div style={{
                      display: 'flex',
                      gap: '8px',
                      marginTop: '10px',
                      paddingTop: '10px',
                      borderTop: '1px solid #f3f4f6',
                    }}>
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          onViewQuote(quote.id);
                        }}
                        style={{
                          flex: 1,
                          padding: '6px 0',
                          border: '1px solid #e5e7eb',
                          borderRadius: '6px',
                          backgroundColor: 'white',
                          color: '#374151',
                          fontSize: '12px',
                          fontWeight: '500',
                          cursor: 'pointer',
                          transition: 'all 0.15s',
                        }}
                        onMouseEnter={(e) => {
                          e.currentTarget.style.backgroundColor = '#f9fafb';
                        }}
                        onMouseLeave={(e) => {
                          e.currentTarget.style.backgroundColor = 'white';
                        }}
                      >
                        View
                      </button>
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          onEditQuote(quote.id);
                        }}
                        style={{
                          flex: 1,
                          padding: '6px 0',
                          border: 'none',
                          borderRadius: '6px',
                          backgroundColor: '#6366f1',
                          color: 'white',
                          fontSize: '12px',
                          fontWeight: '500',
                          cursor: 'pointer',
                          transition: 'all 0.15s',
                        }}
                        onMouseEnter={(e) => {
                          e.currentTarget.style.backgroundColor = '#4f46e5';
                        }}
                        onMouseLeave={(e) => {
                          e.currentTarget.style.backgroundColor = '#6366f1';
                        }}
                      >
                        Edit
                      </button>
                    </div>
                  </div>
                );
              })}

              {/* Empty State */}
              {(quotesByStatus[stage.id] || []).length === 0 && (
                <div style={{
                  padding: '32px 16px',
                  textAlign: 'center',
                  color: '#9ca3af',
                  fontSize: '13px',
                  backgroundColor: 'white',
                  borderRadius: '8px',
                  border: '2px dashed #e5e7eb',
                }}>
                  <div style={{ fontSize: '24px', marginBottom: '8px', opacity: 0.5 }}>
                    {stage.icon}
                  </div>
                  No quotes in {stage.label.toLowerCase()}
                </div>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};

export default QuoteKanban;
