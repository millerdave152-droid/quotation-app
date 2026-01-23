import React, { useState, useEffect } from 'react';
import { useAuth } from '../../contexts/AuthContext';

const API_URL = process.env.REACT_APP_API_URL || 'http://localhost:3001';

const DataQualityDashboard = () => {
  const { token } = useAuth();
  const [report, setReport] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [activeTab, setActiveTab] = useState('overview');
  const [fixing, setFixing] = useState(null);
  const [notification, setNotification] = useState(null);
  const [mergeModal, setMergeModal] = useState(null);

  useEffect(() => {
    fetchReport();
  }, []);

  const fetchReport = async () => {
    setLoading(true);
    try {
      const response = await fetch(`${API_URL}/api/data-quality/report`, {
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        }
      });
      const result = await response.json();
      if (result.success) {
        setReport(result.data);
      } else {
        setError(result.message);
      }
    } catch (err) {
      setError('Failed to fetch data quality report');
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const handleAutoFix = async (fixType) => {
    if (!window.confirm(`Are you sure you want to run the "${fixType}" auto-fix? This will modify data.`)) {
      return;
    }

    setFixing(fixType);
    try {
      const response = await fetch(`${API_URL}/api/data-quality/auto-fix/${fixType}`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        }
      });
      const result = await response.json();
      if (result.success) {
        showNotification(`Fixed ${result.data.fixed} records`, 'success');
        fetchReport();
      } else {
        showNotification(result.message || 'Auto-fix failed', 'error');
      }
    } catch (err) {
      showNotification('Auto-fix failed', 'error');
    } finally {
      setFixing(null);
    }
  };

  const handleMergeDuplicates = async () => {
    if (!mergeModal) return;

    try {
      const response = await fetch(`${API_URL}/api/data-quality/merge`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          entityType: mergeModal.entityType,
          primaryId: mergeModal.primaryId,
          duplicateIds: mergeModal.duplicateIds
        })
      });
      const result = await response.json();
      if (result.success) {
        showNotification(`Merged ${result.data.merged} records`, 'success');
        setMergeModal(null);
        fetchReport();
      } else {
        showNotification(result.message || 'Merge failed', 'error');
      }
    } catch (err) {
      showNotification('Merge failed', 'error');
    }
  };

  const showNotification = (message, type) => {
    setNotification({ message, type });
    setTimeout(() => setNotification(null), 3000);
  };

  const getGradeColor = (grade) => {
    const colors = {
      'A': { bg: '#d1fae5', text: '#065f46', border: '#a7f3d0' },
      'B': { bg: '#dbeafe', text: '#1e40af', border: '#93c5fd' },
      'C': { bg: '#fef3c7', text: '#92400e', border: '#fcd34d' },
      'D': { bg: '#fed7aa', text: '#c2410c', border: '#fdba74' },
      'F': { bg: '#fee2e2', text: '#991b1b', border: '#fecaca' }
    };
    return colors[grade] || colors['C'];
  };

  const getSeverityColor = (severity) => {
    const colors = {
      critical: { bg: '#fee2e2', text: '#991b1b', border: '#fecaca' },
      high: { bg: '#fed7aa', text: '#c2410c', border: '#fdba74' },
      medium: { bg: '#fef3c7', text: '#92400e', border: '#fcd34d' },
      low: { bg: '#f3f4f6', text: '#374151', border: '#d1d5db' }
    };
    return colors[severity] || colors.medium;
  };

  if (loading) {
    return (
      <div style={{ padding: '40px', textAlign: 'center' }}>
        <div style={{ fontSize: '16px', color: '#6b7280' }}>Loading data quality report...</div>
      </div>
    );
  }

  if (error) {
    return (
      <div style={{ padding: '40px', textAlign: 'center' }}>
        <div style={{ color: '#dc2626', marginBottom: '16px' }}>{error}</div>
        <button
          onClick={fetchReport}
          style={{
            padding: '10px 20px',
            background: '#667eea',
            color: 'white',
            border: 'none',
            borderRadius: '8px',
            cursor: 'pointer'
          }}
        >
          Retry
        </button>
      </div>
    );
  }

  const gradeColor = report?.health ? getGradeColor(report.health.grade) : getGradeColor('C');

  return (
    <div style={{ padding: '24px', maxWidth: '1400px', margin: '0 auto' }}>
      {/* Notification */}
      {notification && (
        <div style={{
          position: 'fixed',
          top: '80px',
          right: '24px',
          padding: '12px 24px',
          borderRadius: '8px',
          background: notification.type === 'success' ? '#10b981' : '#ef4444',
          color: 'white',
          zIndex: 1000,
          boxShadow: '0 4px 12px rgba(0,0,0,0.15)'
        }}>
          {notification.message}
        </div>
      )}

      {/* Header */}
      <div style={{ marginBottom: '24px' }}>
        <h1 style={{ margin: '0 0 8px 0', fontSize: '28px', fontWeight: '700', color: '#111827' }}>
          Data Quality Dashboard
        </h1>
        <p style={{ margin: 0, color: '#6b7280' }}>
          Monitor and maintain data integrity across your system
        </p>
      </div>

      {/* Health Score Card */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
        gap: '16px',
        marginBottom: '24px'
      }}>
        {/* Overall Score */}
        <div style={{
          background: 'white',
          borderRadius: '12px',
          padding: '24px',
          boxShadow: '0 1px 3px rgba(0,0,0,0.1)'
        }}>
          <div style={{ fontSize: '14px', color: '#6b7280', marginBottom: '8px' }}>Overall Score</div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            <div style={{
              width: '60px',
              height: '60px',
              borderRadius: '12px',
              background: gradeColor.bg,
              border: `2px solid ${gradeColor.border}`,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontSize: '24px',
              fontWeight: 'bold',
              color: gradeColor.text
            }}>
              {report?.health?.grade}
            </div>
            <div>
              <div style={{ fontSize: '32px', fontWeight: 'bold', color: '#111827' }}>
                {report?.health?.score}%
              </div>
            </div>
          </div>
        </div>

        {/* Total Issues */}
        <div style={{
          background: 'white',
          borderRadius: '12px',
          padding: '24px',
          boxShadow: '0 1px 3px rgba(0,0,0,0.1)'
        }}>
          <div style={{ fontSize: '14px', color: '#6b7280', marginBottom: '8px' }}>Total Issues</div>
          <div style={{ fontSize: '32px', fontWeight: 'bold', color: '#111827' }}>
            {report?.summary?.totalIssues || 0}
          </div>
          {report?.summary?.criticalIssues > 0 && (
            <div style={{ fontSize: '13px', color: '#dc2626', marginTop: '4px' }}>
              {report.summary.criticalIssues} critical
            </div>
          )}
        </div>

        {/* Duplicates */}
        <div style={{
          background: 'white',
          borderRadius: '12px',
          padding: '24px',
          boxShadow: '0 1px 3px rgba(0,0,0,0.1)'
        }}>
          <div style={{ fontSize: '14px', color: '#6b7280', marginBottom: '8px' }}>Duplicates Found</div>
          <div style={{ fontSize: '32px', fontWeight: 'bold', color: '#111827' }}>
            {report?.summary?.duplicatesFound || 0}
          </div>
        </div>

        {/* Last Updated */}
        <div style={{
          background: 'white',
          borderRadius: '12px',
          padding: '24px',
          boxShadow: '0 1px 3px rgba(0,0,0,0.1)'
        }}>
          <div style={{ fontSize: '14px', color: '#6b7280', marginBottom: '8px' }}>Last Updated</div>
          <div style={{ fontSize: '16px', fontWeight: '600', color: '#111827' }}>
            {report?.generatedAt ? new Date(report.generatedAt).toLocaleString() : 'N/A'}
          </div>
          <button
            onClick={fetchReport}
            style={{
              marginTop: '8px',
              padding: '6px 12px',
              background: '#f3f4f6',
              border: '1px solid #d1d5db',
              borderRadius: '6px',
              cursor: 'pointer',
              fontSize: '13px'
            }}
          >
            Refresh
          </button>
        </div>
      </div>

      {/* Metrics Breakdown */}
      <div style={{
        background: 'white',
        borderRadius: '12px',
        padding: '24px',
        marginBottom: '24px',
        boxShadow: '0 1px 3px rgba(0,0,0,0.1)'
      }}>
        <h2 style={{ margin: '0 0 16px 0', fontSize: '18px', fontWeight: '600' }}>Health Metrics</h2>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '16px' }}>
          {report?.health?.metrics && Object.entries(report.health.metrics).map(([key, value]) => (
            <div key={key}>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '6px' }}>
                <span style={{ fontSize: '13px', color: '#6b7280', textTransform: 'capitalize' }}>
                  {key.replace(/([A-Z])/g, ' $1').trim()}
                </span>
                <span style={{ fontSize: '13px', fontWeight: '600', color: '#111827' }}>{value}%</span>
              </div>
              <div style={{
                width: '100%',
                height: '8px',
                background: '#f3f4f6',
                borderRadius: '4px',
                overflow: 'hidden'
              }}>
                <div style={{
                  width: `${value}%`,
                  height: '100%',
                  background: value >= 80 ? '#10b981' : value >= 60 ? '#f59e0b' : '#ef4444',
                  borderRadius: '4px',
                  transition: 'width 0.3s ease'
                }} />
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Tabs */}
      <div style={{
        display: 'flex',
        gap: '8px',
        marginBottom: '16px',
        borderBottom: '1px solid #e5e7eb',
        paddingBottom: '8px'
      }}>
        {['overview', 'customers', 'leads', 'products', 'duplicates', 'auto-fix'].map(tab => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab)}
            style={{
              padding: '8px 16px',
              background: activeTab === tab ? '#667eea' : 'transparent',
              color: activeTab === tab ? 'white' : '#6b7280',
              border: 'none',
              borderRadius: '6px',
              cursor: 'pointer',
              fontSize: '14px',
              fontWeight: '500',
              textTransform: 'capitalize'
            }}
          >
            {tab.replace('-', ' ')}
          </button>
        ))}
      </div>

      {/* Tab Content */}
      <div style={{
        background: 'white',
        borderRadius: '12px',
        padding: '24px',
        boxShadow: '0 1px 3px rgba(0,0,0,0.1)'
      }}>
        {activeTab === 'overview' && (
          <div>
            <h3 style={{ margin: '0 0 16px 0', fontSize: '16px', fontWeight: '600' }}>Recommendations</h3>
            {report?.health?.recommendations?.length > 0 ? (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                {report.health.recommendations.map((rec, idx) => (
                  <div key={idx} style={{
                    padding: '12px 16px',
                    borderRadius: '8px',
                    background: rec.priority === 'high' ? '#fef2f2' : rec.priority === 'medium' ? '#fefce8' : '#f0fdf4',
                    border: `1px solid ${rec.priority === 'high' ? '#fecaca' : rec.priority === 'medium' ? '#fef08a' : '#bbf7d0'}`
                  }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '4px' }}>
                      <span style={{
                        padding: '2px 8px',
                        borderRadius: '4px',
                        fontSize: '11px',
                        fontWeight: '600',
                        textTransform: 'uppercase',
                        background: rec.priority === 'high' ? '#dc2626' : rec.priority === 'medium' ? '#f59e0b' : '#10b981',
                        color: 'white'
                      }}>
                        {rec.priority}
                      </span>
                      <span style={{ fontSize: '13px', color: '#6b7280', textTransform: 'capitalize' }}>
                        {rec.area}
                      </span>
                    </div>
                    <div style={{ fontSize: '14px', color: '#374151' }}>{rec.message}</div>
                  </div>
                ))}
              </div>
            ) : (
              <div style={{ color: '#6b7280', textAlign: 'center', padding: '20px' }}>
                No recommendations - your data quality is excellent!
              </div>
            )}
          </div>
        )}

        {activeTab === 'customers' && (
          <IssuesList title="Customer Issues" issues={report?.customers?.issues} getSeverityColor={getSeverityColor} />
        )}

        {activeTab === 'leads' && (
          <IssuesList title="Lead Issues" issues={report?.leads?.issues} getSeverityColor={getSeverityColor} />
        )}

        {activeTab === 'products' && (
          <IssuesList title="Product Issues" issues={report?.products?.issues} getSeverityColor={getSeverityColor} />
        )}

        {activeTab === 'duplicates' && (
          <div>
            <h3 style={{ margin: '0 0 16px 0', fontSize: '16px', fontWeight: '600' }}>
              Duplicate Records ({report?.duplicates?.total || 0})
            </h3>

            {/* Customer Duplicates */}
            {report?.duplicates?.customers?.length > 0 && (
              <div style={{ marginBottom: '24px' }}>
                <h4 style={{ margin: '0 0 12px 0', fontSize: '14px', fontWeight: '600', color: '#374151' }}>
                  Customer Duplicates
                </h4>
                {report.duplicates.customers.map((dup, idx) => (
                  <DuplicateCard
                    key={idx}
                    duplicate={dup}
                    entityType="customer"
                    onMerge={(primaryId, duplicateIds) => setMergeModal({
                      entityType: 'customer',
                      primaryId,
                      duplicateIds,
                      records: dup.records
                    })}
                  />
                ))}
              </div>
            )}

            {/* Lead Duplicates */}
            {report?.duplicates?.leads?.length > 0 && (
              <div>
                <h4 style={{ margin: '0 0 12px 0', fontSize: '14px', fontWeight: '600', color: '#374151' }}>
                  Lead Duplicates
                </h4>
                {report.duplicates.leads.map((dup, idx) => (
                  <DuplicateCard
                    key={idx}
                    duplicate={dup}
                    entityType="lead"
                    onMerge={(primaryId, duplicateIds) => setMergeModal({
                      entityType: 'lead',
                      primaryId,
                      duplicateIds,
                      records: dup.records
                    })}
                  />
                ))}
              </div>
            )}

            {(!report?.duplicates?.customers?.length && !report?.duplicates?.leads?.length) && (
              <div style={{ color: '#6b7280', textAlign: 'center', padding: '20px' }}>
                No duplicates found
              </div>
            )}
          </div>
        )}

        {activeTab === 'auto-fix' && (
          <div>
            <h3 style={{ margin: '0 0 16px 0', fontSize: '16px', fontWeight: '600' }}>Auto-Fix Tools</h3>
            <p style={{ margin: '0 0 24px 0', fontSize: '14px', color: '#6b7280' }}>
              These tools will automatically fix common data issues. Review carefully before running.
            </p>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
              <AutoFixCard
                title="Trim Emails"
                description="Remove leading/trailing whitespace from customer email addresses"
                fixType="trim_emails"
                fixing={fixing}
                onFix={handleAutoFix}
              />
              <AutoFixCard
                title="Standardize Phone Numbers"
                description="Remove non-numeric characters from phone numbers (keep numbers only)"
                fixType="standardize_phones"
                fixing={fixing}
                onFix={handleAutoFix}
              />
              <AutoFixCard
                title="Close Stale Leads"
                description="Mark leads stuck in 'new' status for 90+ days as lost"
                fixType="close_stale_leads"
                fixing={fixing}
                onFix={handleAutoFix}
              />
            </div>
          </div>
        )}
      </div>

      {/* Merge Modal */}
      {mergeModal && (
        <div style={{
          position: 'fixed',
          inset: 0,
          background: 'rgba(0,0,0,0.5)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 1000
        }}>
          <div style={{
            background: 'white',
            borderRadius: '16px',
            width: '100%',
            maxWidth: '500px',
            padding: '24px',
            boxShadow: '0 25px 50px -12px rgba(0,0,0,0.25)'
          }}>
            <h3 style={{ margin: '0 0 16px 0', fontSize: '18px', fontWeight: '600' }}>
              Merge {mergeModal.entityType} Records
            </h3>
            <p style={{ margin: '0 0 16px 0', fontSize: '14px', color: '#6b7280' }}>
              Select the primary record to keep. Other records will be merged into it and deleted.
            </p>

            <div style={{ marginBottom: '24px' }}>
              {mergeModal.records.map(record => (
                <label key={record.id} style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '12px',
                  padding: '12px',
                  borderRadius: '8px',
                  border: mergeModal.primaryId === record.id ? '2px solid #667eea' : '1px solid #e5e7eb',
                  marginBottom: '8px',
                  cursor: 'pointer',
                  background: mergeModal.primaryId === record.id ? '#f0f4ff' : 'white'
                }}>
                  <input
                    type="radio"
                    checked={mergeModal.primaryId === record.id}
                    onChange={() => setMergeModal({
                      ...mergeModal,
                      primaryId: record.id,
                      duplicateIds: mergeModal.records.filter(r => r.id !== record.id).map(r => r.id)
                    })}
                  />
                  <div>
                    <div style={{ fontWeight: '500' }}>{record.name}</div>
                    {record.email && <div style={{ fontSize: '13px', color: '#6b7280' }}>{record.email}</div>}
                  </div>
                </label>
              ))}
            </div>

            <div style={{ display: 'flex', gap: '12px', justifyContent: 'flex-end' }}>
              <button
                onClick={() => setMergeModal(null)}
                style={{
                  padding: '10px 20px',
                  background: 'white',
                  border: '1px solid #d1d5db',
                  borderRadius: '8px',
                  cursor: 'pointer'
                }}
              >
                Cancel
              </button>
              <button
                onClick={handleMergeDuplicates}
                disabled={!mergeModal.primaryId}
                style={{
                  padding: '10px 20px',
                  background: mergeModal.primaryId ? '#667eea' : '#9ca3af',
                  color: 'white',
                  border: 'none',
                  borderRadius: '8px',
                  cursor: mergeModal.primaryId ? 'pointer' : 'not-allowed'
                }}
              >
                Merge Records
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

// Issues List Component
const IssuesList = ({ title, issues, getSeverityColor }) => {
  if (!issues || issues.length === 0) {
    return (
      <div style={{ color: '#6b7280', textAlign: 'center', padding: '20px' }}>
        No issues found - data quality is good!
      </div>
    );
  }

  return (
    <div>
      <h3 style={{ margin: '0 0 16px 0', fontSize: '16px', fontWeight: '600' }}>{title}</h3>
      <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
        {issues.map((issue, idx) => {
          const colors = getSeverityColor(issue.severity);
          return (
            <div key={idx} style={{
              padding: '16px',
              borderRadius: '8px',
              background: colors.bg,
              border: `1px solid ${colors.border}`
            }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '8px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <span style={{
                    padding: '2px 8px',
                    borderRadius: '4px',
                    fontSize: '11px',
                    fontWeight: '600',
                    textTransform: 'uppercase',
                    background: colors.text,
                    color: 'white'
                  }}>
                    {issue.severity}
                  </span>
                  <span style={{ fontSize: '12px', color: '#6b7280' }}>{issue.type}</span>
                </div>
                <span style={{ fontSize: '14px', fontWeight: '600', color: colors.text }}>
                  {issue.count} records
                </span>
              </div>
              <div style={{ fontSize: '14px', color: '#374151', marginBottom: '12px' }}>
                {issue.message}
              </div>
              {issue.records && issue.records.length > 0 && (
                <div style={{
                  background: 'rgba(255,255,255,0.7)',
                  borderRadius: '6px',
                  padding: '12px',
                  fontSize: '13px'
                }}>
                  <div style={{ fontWeight: '500', marginBottom: '8px', color: '#6b7280' }}>Sample records:</div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                    {issue.records.slice(0, 5).map(record => (
                      <div key={record.id} style={{ color: '#374151' }}>
                        #{record.id} - {record.name || record.model || 'N/A'}
                        {record.email && ` (${record.email})`}
                      </div>
                    ))}
                    {issue.records.length > 5 && (
                      <div style={{ color: '#9ca3af', fontStyle: 'italic' }}>
                        ...and {issue.records.length - 5} more
                      </div>
                    )}
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
};

// Duplicate Card Component
const DuplicateCard = ({ duplicate, entityType, onMerge }) => {
  const records = duplicate.records || [];

  return (
    <div style={{
      padding: '16px',
      borderRadius: '8px',
      background: '#fefce8',
      border: '1px solid #fef08a',
      marginBottom: '12px'
    }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '8px' }}>
        <div>
          <span style={{ fontSize: '12px', color: '#6b7280', textTransform: 'capitalize' }}>
            Duplicate by {duplicate.type}
          </span>
          <div style={{ fontWeight: '500', color: '#374151' }}>{duplicate.matchValue}</div>
        </div>
        <button
          onClick={() => onMerge(records[0]?.id, records.slice(1).map(r => r.id))}
          style={{
            padding: '6px 12px',
            background: '#667eea',
            color: 'white',
            border: 'none',
            borderRadius: '6px',
            cursor: 'pointer',
            fontSize: '13px'
          }}
        >
          Merge
        </button>
      </div>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px' }}>
        {records.map(record => (
          <div key={record.id} style={{
            padding: '6px 10px',
            background: 'white',
            borderRadius: '4px',
            fontSize: '13px'
          }}>
            #{record.id} - {record.name}
          </div>
        ))}
      </div>
    </div>
  );
};

// Auto-Fix Card Component
const AutoFixCard = ({ title, description, fixType, fixing, onFix }) => (
  <div style={{
    padding: '16px',
    borderRadius: '8px',
    background: '#f9fafb',
    border: '1px solid #e5e7eb',
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center'
  }}>
    <div>
      <div style={{ fontWeight: '500', color: '#111827', marginBottom: '4px' }}>{title}</div>
      <div style={{ fontSize: '13px', color: '#6b7280' }}>{description}</div>
    </div>
    <button
      onClick={() => onFix(fixType)}
      disabled={fixing === fixType}
      style={{
        padding: '8px 16px',
        background: fixing === fixType ? '#9ca3af' : '#10b981',
        color: 'white',
        border: 'none',
        borderRadius: '6px',
        cursor: fixing === fixType ? 'not-allowed' : 'pointer',
        fontSize: '13px',
        fontWeight: '500',
        minWidth: '80px'
      }}
    >
      {fixing === fixType ? 'Fixing...' : 'Run Fix'}
    </button>
  </div>
);

export default DataQualityDashboard;
