/**
 * VersionHistory Component
 * Displays version history for a quote with comparison and restore features
 */

import React, { useState, useEffect, useCallback } from 'react';

const API_URL = process.env.REACT_APP_API_URL || 'http://localhost:3001';

const VersionHistory = ({
  quoteId,
  currentVersion,
  onRestore,
  formatCurrency
}) => {
  const [versions, setVersions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [selectedVersion, setSelectedVersion] = useState(null);
  const [compareMode, setCompareMode] = useState(false);
  const [compareVersions, setCompareVersions] = useState({ v1: null, v2: null });
  const [comparison, setComparison] = useState(null);
  const [restoring, setRestoring] = useState(false);

  // Fetch version history
  const fetchVersions = useCallback(async () => {
    if (!quoteId) return;

    try {
      setLoading(true);
      const response = await fetch(`${API_URL}/api/quotations/${quoteId}/versions`);
      if (response.ok) {
        const data = await response.json();
        setVersions(data.versions || []);
      } else {
        setError('Failed to load version history');
      }
    } catch (err) {
      setError('Error loading version history');
    } finally {
      setLoading(false);
    }
  }, [quoteId]);

  useEffect(() => {
    fetchVersions();
  }, [fetchVersions]);

  // Fetch version details
  const fetchVersionDetails = async (versionNumber) => {
    try {
      const response = await fetch(`${API_URL}/api/quotations/${quoteId}/versions/${versionNumber}`);
      if (response.ok) {
        const data = await response.json();
        setSelectedVersion(data.version);
      }
    } catch (err) {
      console.error('Error fetching version details:', err);
    }
  };

  // Compare two versions
  const compareVersionsHandler = async () => {
    if (!compareVersions.v1 || !compareVersions.v2) return;

    try {
      const response = await fetch(
        `${API_URL}/api/quotations/${quoteId}/versions/compare?v1=${compareVersions.v1}&v2=${compareVersions.v2}`
      );
      if (response.ok) {
        const data = await response.json();
        setComparison(data.comparison);
      }
    } catch (err) {
      console.error('Error comparing versions:', err);
    }
  };

  // Restore to a version
  const handleRestore = async (versionNumber) => {
    if (!window.confirm(`Restore quote to version ${versionNumber}? This will create a new version with the current state before restoring.`)) {
      return;
    }

    setRestoring(true);
    try {
      const response = await fetch(`${API_URL}/api/quotations/${quoteId}/versions/${versionNumber}/restore`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ restoredBy: 'User' })
      });

      if (response.ok) {
        const data = await response.json();
        if (onRestore) {
          onRestore(data.quote);
        }
        fetchVersions();
      }
    } catch (err) {
      console.error('Error restoring version:', err);
    } finally {
      setRestoring(false);
    }
  };

  const formatDate = (dateString) => {
    if (!dateString) return 'N/A';
    return new Date(dateString).toLocaleString('en-CA', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  };

  const formatMoney = (cents) => {
    if (formatCurrency) return formatCurrency(cents);
    return `$${((cents || 0) / 100).toFixed(2)}`;
  };

  const getChangeTypeIcon = (changeType) => {
    const icons = {
      items_updated: '📦',
      price_adjusted: '💰',
      customer_changed: '👤',
      status_changed: '🔄',
      discount_applied: '🏷️',
      restored: '↩️',
      manual: '📝',
      created: '✨'
    };
    return icons[changeType] || '📋';
  };

  const getChangeTypeColor = (changeType) => {
    const colors = {
      items_updated: '#3b82f6',
      price_adjusted: '#10b981',
      customer_changed: '#8b5cf6',
      status_changed: '#f59e0b',
      discount_applied: '#ec4899',
      restored: '#6366f1',
      manual: '#6b7280',
      created: '#22c55e'
    };
    return colors[changeType] || '#6b7280';
  };

  if (loading) {
    return (
      <div style={{ padding: '20px', textAlign: 'center', color: '#6b7280' }}>
        Loading version history...
      </div>
    );
  }

  if (error) {
    return (
      <div style={{ padding: '20px', textAlign: 'center', color: '#ef4444' }}>
        {error}
      </div>
    );
  }

  if (versions.length === 0) {
    return (
      <div style={{
        padding: '24px',
        textAlign: 'center',
        color: '#6b7280',
        background: '#f9fafb',
        borderRadius: '8px'
      }}>
        <div style={{ fontSize: '32px', marginBottom: '8px' }}>📋</div>
        <div style={{ fontWeight: '500' }}>No version history yet</div>
        <div style={{ fontSize: '13px', marginTop: '4px' }}>
          Version history will appear here when the quote is edited
        </div>
      </div>
    );
  }

  return (
    <div style={{ background: 'white', borderRadius: '12px', overflow: 'hidden' }}>
      {/* Header */}
      <div style={{
        padding: '16px 20px',
        borderBottom: '1px solid #e5e7eb',
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center'
      }}>
        <div>
          <h3 style={{ margin: 0, fontSize: '16px', fontWeight: '600' }}>
            Version History
          </h3>
          <div style={{ fontSize: '13px', color: '#6b7280', marginTop: '2px' }}>
            {versions.length} version{versions.length !== 1 ? 's' : ''} recorded
          </div>
        </div>
        <button
          onClick={() => {
            setCompareMode(!compareMode);
            setComparison(null);
            setCompareVersions({ v1: null, v2: null });
          }}
          style={{
            padding: '8px 16px',
            background: compareMode ? '#3b82f6' : '#f3f4f6',
            color: compareMode ? 'white' : '#374151',
            border: 'none',
            borderRadius: '6px',
            fontSize: '13px',
            fontWeight: '500',
            cursor: 'pointer'
          }}
        >
          {compareMode ? 'Exit Compare' : 'Compare Versions'}
        </button>
      </div>

      {/* Compare Mode Selector */}
      {compareMode && (
        <div style={{
          padding: '16px 20px',
          background: '#f0f9ff',
          borderBottom: '1px solid #bae6fd'
        }}>
          <div style={{ display: 'flex', gap: '16px', alignItems: 'center', flexWrap: 'wrap' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <span style={{ fontSize: '13px', color: '#0369a1' }}>Compare:</span>
              <select
                value={compareVersions.v1 || ''}
                onChange={(e) => setCompareVersions(prev => ({ ...prev, v1: e.target.value }))}
                style={{
                  padding: '6px 12px',
                  border: '1px solid #bae6fd',
                  borderRadius: '4px',
                  fontSize: '13px'
                }}
              >
                <option value="">Select version</option>
                {versions.map(v => (
                  <option key={v.version_number} value={v.version_number}>
                    v{v.version_number}
                  </option>
                ))}
              </select>
            </div>
            <span style={{ color: '#0369a1' }}>vs</span>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <select
                value={compareVersions.v2 || ''}
                onChange={(e) => setCompareVersions(prev => ({ ...prev, v2: e.target.value }))}
                style={{
                  padding: '6px 12px',
                  border: '1px solid #bae6fd',
                  borderRadius: '4px',
                  fontSize: '13px'
                }}
              >
                <option value="">Select version</option>
                {versions.map(v => (
                  <option key={v.version_number} value={v.version_number}>
                    v{v.version_number}
                  </option>
                ))}
              </select>
            </div>
            <button
              onClick={compareVersionsHandler}
              disabled={!compareVersions.v1 || !compareVersions.v2}
              style={{
                padding: '6px 16px',
                background: compareVersions.v1 && compareVersions.v2 ? '#0284c7' : '#9ca3af',
                color: 'white',
                border: 'none',
                borderRadius: '4px',
                fontSize: '13px',
                cursor: compareVersions.v1 && compareVersions.v2 ? 'pointer' : 'not-allowed'
              }}
            >
              Compare
            </button>
          </div>

          {/* Comparison Results */}
          {comparison && (
            <div style={{ marginTop: '16px' }}>
              <div style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
                gap: '12px',
                marginBottom: '16px'
              }}>
                <div style={{
                  padding: '12px',
                  background: 'white',
                  borderRadius: '6px',
                  border: '1px solid #e5e7eb'
                }}>
                  <div style={{ fontSize: '11px', color: '#6b7280', textTransform: 'uppercase' }}>
                    Total Change
                  </div>
                  <div style={{
                    fontSize: '18px',
                    fontWeight: '600',
                    color: comparison.summary.total_change >= 0 ? '#10b981' : '#ef4444'
                  }}>
                    {comparison.summary.total_change >= 0 ? '+' : ''}{formatMoney(comparison.summary.total_change)}
                  </div>
                </div>
                <div style={{
                  padding: '12px',
                  background: 'white',
                  borderRadius: '6px',
                  border: '1px solid #e5e7eb'
                }}>
                  <div style={{ fontSize: '11px', color: '#6b7280', textTransform: 'uppercase' }}>
                    Items Changed
                  </div>
                  <div style={{ fontSize: '14px', fontWeight: '500', marginTop: '4px' }}>
                    <span style={{ color: '#10b981' }}>+{comparison.summary.items_added}</span>
                    {' / '}
                    <span style={{ color: '#ef4444' }}>-{comparison.summary.items_removed}</span>
                    {' / '}
                    <span style={{ color: '#f59e0b' }}>{comparison.summary.items_modified} modified</span>
                  </div>
                </div>
              </div>

              {/* Item Changes */}
              {comparison.differences.items.length > 0 && (
                <div style={{
                  background: 'white',
                  borderRadius: '6px',
                  border: '1px solid #e5e7eb',
                  overflow: 'hidden'
                }}>
                  <div style={{
                    padding: '10px 12px',
                    background: '#f9fafb',
                    fontWeight: '500',
                    fontSize: '13px'
                  }}>
                    Item Changes
                  </div>
                  {comparison.differences.items.map((change, idx) => (
                    <div key={idx} style={{
                      padding: '10px 12px',
                      borderTop: '1px solid #f3f4f6',
                      fontSize: '13px',
                      display: 'flex',
                      alignItems: 'center',
                      gap: '8px'
                    }}>
                      <span style={{
                        padding: '2px 8px',
                        borderRadius: '4px',
                        fontSize: '11px',
                        fontWeight: '500',
                        background: change.type === 'added' ? '#dcfce7' :
                                   change.type === 'removed' ? '#fee2e2' : '#fef3c7',
                        color: change.type === 'added' ? '#15803d' :
                               change.type === 'removed' ? '#dc2626' : '#92400e'
                      }}>
                        {change.type.toUpperCase()}
                      </span>
                      <span>{change.item.manufacturer} {change.item.model || change.item.sku}</span>
                      {change.changes && (
                        <span style={{ color: '#6b7280' }}>
                          ({change.changes.map(c => `${c.field}: ${c.from} → ${c.to}`).join(', ')})
                        </span>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* Version List */}
      <div style={{ maxHeight: '400px', overflowY: 'auto' }}>
        {versions.map((version, index) => (
          <div
            key={version.id}
            style={{
              padding: '16px 20px',
              borderBottom: index < versions.length - 1 ? '1px solid #f3f4f6' : 'none',
              cursor: 'pointer',
              transition: 'background 0.1s'
            }}
            onMouseEnter={(e) => e.currentTarget.style.background = '#f9fafb'}
            onMouseLeave={(e) => e.currentTarget.style.background = 'white'}
            onClick={() => fetchVersionDetails(version.version_number)}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
              <div style={{ flex: 1 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <span style={{ fontSize: '18px' }}>
                    {getChangeTypeIcon(version.change_type)}
                  </span>
                  <span style={{
                    padding: '2px 8px',
                    background: getChangeTypeColor(version.change_type) + '15',
                    color: getChangeTypeColor(version.change_type),
                    borderRadius: '4px',
                    fontSize: '12px',
                    fontWeight: '600'
                  }}>
                    v{version.version_number}
                  </span>
                  {version.version_number === currentVersion && (
                    <span style={{
                      padding: '2px 8px',
                      background: '#dcfce7',
                      color: '#15803d',
                      borderRadius: '4px',
                      fontSize: '11px',
                      fontWeight: '500'
                    }}>
                      CURRENT
                    </span>
                  )}
                </div>
                <div style={{
                  fontSize: '14px',
                  fontWeight: '500',
                  marginTop: '6px',
                  color: '#1f2937'
                }}>
                  {version.change_summary || 'Quote updated'}
                </div>
                <div style={{
                  fontSize: '12px',
                  color: '#6b7280',
                  marginTop: '4px',
                  display: 'flex',
                  gap: '16px'
                }}>
                  <span>{version.changed_by || 'User'}</span>
                  <span>{formatDate(version.changed_at)}</span>
                  <span>{version.items_count} items</span>
                </div>
              </div>
              <div style={{ textAlign: 'right' }}>
                <div style={{ fontSize: '16px', fontWeight: '600', color: '#1f2937' }}>
                  {formatMoney(version.total_cents)}
                </div>
                {version.version_number !== currentVersion && (
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      handleRestore(version.version_number);
                    }}
                    disabled={restoring}
                    style={{
                      marginTop: '8px',
                      padding: '4px 12px',
                      background: restoring ? '#9ca3af' : '#6366f1',
                      color: 'white',
                      border: 'none',
                      borderRadius: '4px',
                      fontSize: '12px',
                      cursor: restoring ? 'not-allowed' : 'pointer'
                    }}
                  >
                    Restore
                  </button>
                )}
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* Version Details Modal */}
      {selectedVersion && (
        <div
          style={{
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
          }}
          onClick={() => setSelectedVersion(null)}
        >
          <div
            style={{
              background: 'white',
              borderRadius: '12px',
              width: '100%',
              maxWidth: '600px',
              maxHeight: '80vh',
              overflow: 'hidden'
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <div style={{
              padding: '16px 20px',
              borderBottom: '1px solid #e5e7eb',
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center'
            }}>
              <h3 style={{ margin: 0, fontSize: '18px', fontWeight: '600' }}>
                Version {selectedVersion.version_number} Details
              </h3>
              <button
                onClick={() => setSelectedVersion(null)}
                style={{
                  background: 'none',
                  border: 'none',
                  fontSize: '24px',
                  cursor: 'pointer',
                  color: '#6b7280'
                }}
              >
                &times;
              </button>
            </div>
            <div style={{ padding: '20px', overflowY: 'auto', maxHeight: 'calc(80vh - 60px)' }}>
              {/* Summary */}
              <div style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(2, 1fr)',
                gap: '12px',
                marginBottom: '20px'
              }}>
                <div style={{ padding: '12px', background: '#f9fafb', borderRadius: '8px' }}>
                  <div style={{ fontSize: '12px', color: '#6b7280' }}>Total</div>
                  <div style={{ fontSize: '20px', fontWeight: '600' }}>
                    {formatMoney(selectedVersion.total_cents)}
                  </div>
                </div>
                <div style={{ padding: '12px', background: '#f9fafb', borderRadius: '8px' }}>
                  <div style={{ fontSize: '12px', color: '#6b7280' }}>Gross Profit</div>
                  <div style={{ fontSize: '20px', fontWeight: '600', color: '#10b981' }}>
                    {formatMoney(selectedVersion.gross_profit_cents)}
                  </div>
                </div>
              </div>

              {/* Details */}
              <div style={{ marginBottom: '20px' }}>
                <h4 style={{ fontSize: '14px', fontWeight: '600', marginBottom: '12px' }}>Details</h4>
                <div style={{ fontSize: '13px', color: '#374151' }}>
                  <div style={{ marginBottom: '8px' }}>
                    <strong>Customer:</strong> {selectedVersion.customer_name || 'N/A'}
                  </div>
                  <div style={{ marginBottom: '8px' }}>
                    <strong>Status:</strong> {selectedVersion.status}
                  </div>
                  <div style={{ marginBottom: '8px' }}>
                    <strong>Discount:</strong> {selectedVersion.discount_percent}%
                  </div>
                  <div style={{ marginBottom: '8px' }}>
                    <strong>Changed by:</strong> {selectedVersion.changed_by}
                  </div>
                  <div>
                    <strong>Changed at:</strong> {formatDate(selectedVersion.changed_at)}
                  </div>
                </div>
              </div>

              {/* Items */}
              {selectedVersion.items_snapshot && selectedVersion.items_snapshot.length > 0 && (
                <div>
                  <h4 style={{ fontSize: '14px', fontWeight: '600', marginBottom: '12px' }}>
                    Items ({selectedVersion.items_snapshot.length})
                  </h4>
                  <div style={{ border: '1px solid #e5e7eb', borderRadius: '8px', overflow: 'hidden' }}>
                    {selectedVersion.items_snapshot.map((item, idx) => (
                      <div key={idx} style={{
                        padding: '10px 12px',
                        borderBottom: idx < selectedVersion.items_snapshot.length - 1 ? '1px solid #f3f4f6' : 'none',
                        fontSize: '13px'
                      }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                          <div>
                            <div style={{ fontWeight: '500' }}>
                              {item.manufacturer} {item.model || item.sku}
                            </div>
                            <div style={{ color: '#6b7280', fontSize: '12px' }}>
                              Qty: {item.quantity}
                            </div>
                          </div>
                          <div style={{ textAlign: 'right' }}>
                            <div>{formatMoney(item.unit_price_cents)}</div>
                            <div style={{ color: '#6b7280', fontSize: '12px' }}>
                              {formatMoney(item.line_total_cents || item.unit_price_cents * item.quantity)}
                            </div>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Restore Button */}
              {selectedVersion.version_number !== currentVersion && (
                <button
                  onClick={() => handleRestore(selectedVersion.version_number)}
                  disabled={restoring}
                  style={{
                    width: '100%',
                    marginTop: '20px',
                    padding: '12px',
                    background: restoring ? '#9ca3af' : '#6366f1',
                    color: 'white',
                    border: 'none',
                    borderRadius: '8px',
                    fontSize: '14px',
                    fontWeight: '600',
                    cursor: restoring ? 'not-allowed' : 'pointer'
                  }}
                >
                  {restoring ? 'Restoring...' : `Restore to Version ${selectedVersion.version_number}`}
                </button>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default VersionHistory;
