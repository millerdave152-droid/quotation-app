import React, { useState, useMemo } from 'react';
import './QuoteList.css';

const PIPELINE_STAGES = [
  {
    id: 'draft', label: 'Draft', color: '#9ca3af', bgColor: '#f3f4f6',
    icon: <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
  },
  {
    id: 'sent', label: 'Sent', color: '#3b82f6', bgColor: '#eff6ff',
    icon: <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="22" y1="2" x2="11" y2="13"/><polygon points="22 2 15 22 11 13 2 9 22 2"/></svg>
  },
  {
    id: 'viewed', label: 'Viewed', color: '#8b5cf6', bgColor: '#f5f3ff',
    icon: <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>
  },
  {
    id: 'pending', label: 'Pending', color: '#f59e0b', bgColor: '#fffbeb',
    icon: <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>
  },
  {
    id: 'won', label: 'Won', color: '#22c55e', bgColor: '#f0fdf4',
    icon: <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M6 9H4.5a2.5 2.5 0 0 1 0-5C7 4 9 7 12 7s5-3 7.5-3a2.5 2.5 0 0 1 0 5H18"/><path d="M18 9v11a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2V9"/><path d="M12 7v15"/></svg>
  },
  {
    id: 'lost', label: 'Lost', color: '#ef4444', bgColor: '#fef2f2',
    icon: <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><line x1="15" y1="9" x2="9" y2="15"/><line x1="9" y1="9" x2="15" y2="15"/></svg>
  },
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
        grouped['draft'].push(quote);
      }
    });

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
    <div className="kanban-container">
      {/* Pipeline Header */}
      <div className="kanban-header">
        <div className="kanban-title">
          <span className="kanban-title-icon">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="3" width="5" height="18" rx="1"/><rect x="10" y="3" width="5" height="12" rx="1"/><rect x="17" y="3" width="5" height="8" rx="1"/></svg>
          </span>
          <div>
            <h2>Quote Pipeline</h2>
            <p className="kanban-subtitle">Drag and drop quotes to change their status</p>
          </div>
        </div>

        <div className="kanban-header-actions">
          {/* Pipeline Value Summary */}
          <div className="kanban-pipeline-summary">
            <div className="kanban-summary-item">
              <div className="kanban-summary-label">Total Pipeline</div>
              <div className="kanban-summary-value">
                {formatCurrency(Object.values(columnTotals).reduce((sum, t) => sum + t.value, 0))}
              </div>
            </div>
            <div className="kanban-summary-divider" />
            <div className="kanban-summary-item">
              <div className="kanban-summary-label">Total Quotes</div>
              <div className="kanban-summary-value">{quotations.length}</div>
            </div>
          </div>

          {/* View Mode Toggle */}
          {onViewModeChange && (
            <div className="quote-view-toggle">
              <button
                onClick={() => onViewModeChange('list')}
                className={`quote-view-btn ${listViewMode === 'list' ? 'active' : ''}`}
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
                className={`quote-view-btn ${listViewMode === 'kanban' ? 'active' : ''}`}
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
            <button onClick={onCreateNew} className="quote-new-btn">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
              New Quote
            </button>
          )}
        </div>
      </div>

      {/* Kanban Board */}
      <div
        className="kanban-board"
        style={{ gridTemplateColumns: `repeat(${PIPELINE_STAGES.length}, 1fr)` }}
      >
        {PIPELINE_STAGES.map(stage => (
          <div
            key={stage.id}
            onDragOver={(e) => handleDragOver(e, stage.id)}
            onDragLeave={handleDragLeave}
            onDrop={(e) => handleDrop(e, stage.id)}
            className={`kanban-column ${dragOverColumn === stage.id ? 'drag-over' : ''}`}
            style={{
              backgroundColor: dragOverColumn === stage.id ? stage.bgColor : undefined,
              borderColor: dragOverColumn === stage.id ? stage.color : undefined,
            }}
          >
            {/* Column Header */}
            <div
              className="kanban-col-header"
              style={{ backgroundColor: stage.bgColor, borderLeftColor: stage.color }}
            >
              <div className="kanban-col-title">
                <span
                  className="kanban-col-icon"
                  style={{ backgroundColor: `${stage.color}15`, color: stage.color }}
                >
                  {stage.icon}
                </span>
                <span className="kanban-col-name">{stage.label}</span>
                <span className="kanban-col-count" style={{ backgroundColor: stage.color }}>
                  {columnTotals[stage.id].count}
                </span>
              </div>
              <div className="kanban-col-value" style={{ color: stage.color }}>
                {formatCurrency(columnTotals[stage.id].value)}
              </div>
            </div>

            {/* Quote Cards */}
            <div className="kanban-cards">
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
                    className={`kanban-card ${draggedQuote?.id === quote.id ? 'dragging' : ''} ${isExpired ? 'expired' : ''} ${isExpiringSoon ? 'expiring' : ''}`}
                  >
                    {/* Quote Number & Value */}
                    <div className="kanban-card-top">
                      <span className="kanban-card-number">{quote.quotation_number}</span>
                      <span className="kanban-card-amount">{formatCurrency(quote.total_amount)}</span>
                    </div>

                    {/* Customer Name */}
                    <div className="kanban-card-customer">
                      {quote.customer_name || 'No Customer'}
                    </div>

                    {/* Items Count & Date */}
                    <div className="kanban-card-meta">
                      <span>{quote.item_count || 0} items</span>
                      <span>{formatDate(quote.created_at)}</span>
                    </div>

                    {/* Expiry Warning */}
                    {(isExpiringSoon || isExpired) && (
                      <div className={`kanban-card-expiry ${isExpired ? 'expired' : 'expiring'}`}>
                        {isExpired
                          ? 'Expired'
                          : daysUntilExpiry === 0
                            ? 'Expires Today!'
                            : `Expires in ${daysUntilExpiry} day${daysUntilExpiry !== 1 ? 's' : ''}`
                        }
                      </div>
                    )}

                    {/* Actions */}
                    <div className="kanban-card-actions">
                      <button
                        onClick={(e) => { e.stopPropagation(); onViewQuote(quote.id); }}
                        className="kanban-card-btn btn-view"
                      >
                        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>
                        View
                      </button>
                      <button
                        onClick={(e) => { e.stopPropagation(); onEditQuote(quote.id); }}
                        className="kanban-card-btn btn-edit"
                      >
                        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
                        Edit
                      </button>
                    </div>
                  </div>
                );
              })}

              {/* Empty State */}
              {(quotesByStatus[stage.id] || []).length === 0 && (
                <div className="kanban-empty">
                  <div className="kanban-empty-icon" style={{ color: stage.color }}>
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
