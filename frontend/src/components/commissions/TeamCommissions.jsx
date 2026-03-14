import React, { useState, useEffect, useCallback } from 'react';
import { authFetch } from '../../services/authFetch';

const API_URL = process.env.REACT_APP_API_URL || '';

const formatCurrency = (dollars) => {
  if (dollars == null || isNaN(dollars)) return '$0.00';
  return `$${Number(dollars).toFixed(2).replace(/\B(?=(\d{3})+(?!\d))/g, ',')}`;
};

const formatPercent = (rate) => {
  if (rate == null) return '0%';
  return `${(Number(rate) * 100).toFixed(1)}%`;
};

// ==========================================
// Commission Rules Tab
// ==========================================
function CommissionRulesTab() {
  const [rules, setRules] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [showForm, setShowForm] = useState(false);
  const [editingRule, setEditingRule] = useState(null);
  const [formData, setFormData] = useState({
    ruleName: '', ruleType: 'flat', description: '', rate: '',
    priority: 100, categoryId: '', productType: '',
    appliesToDiscounted: true, discountThreshold: 0.2, discountedRate: '',
    isBonus: false, bonusFlatCents: '', isActive: true,
  });

  const fetchRules = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await authFetch(`${API_URL}/api/commissions/rules?includeInactive=true`);
      const data = await res.json();
      if (data.success) setRules(data.data || []);
      else setError(data.message || 'Failed to load rules');
    } catch (err) {
      setError('Failed to load commission rules');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchRules(); }, [fetchRules]);

  const resetForm = () => {
    setFormData({
      ruleName: '', ruleType: 'flat', description: '', rate: '',
      priority: 100, categoryId: '', productType: '',
      appliesToDiscounted: true, discountThreshold: 0.2, discountedRate: '',
      isBonus: false, bonusFlatCents: '', isActive: true,
    });
    setEditingRule(null);
    setShowForm(false);
  };

  const handleEdit = (rule) => {
    setFormData({
      ruleName: rule.ruleName || '',
      ruleType: rule.ruleType || 'flat',
      description: rule.description || '',
      rate: rule.rate || '',
      priority: rule.priority || 100,
      categoryId: rule.categoryId || '',
      productType: rule.productType || '',
      appliesToDiscounted: rule.appliesToDiscounted !== false,
      discountThreshold: rule.discountThreshold || 0.2,
      discountedRate: rule.discountedRate || '',
      isBonus: rule.isBonus || false,
      bonusFlatCents: rule.bonusFlatCents || '',
      isActive: rule.isActive !== false,
    });
    setEditingRule(rule);
    setShowForm(true);
  };

  const handleSave = async () => {
    try {
      const payload = {
        ...formData,
        rate: parseFloat(formData.rate) || 0,
        priority: parseInt(formData.priority) || 100,
        categoryId: formData.categoryId ? parseInt(formData.categoryId) : null,
        productType: formData.productType || null,
        discountedRate: formData.discountedRate ? parseFloat(formData.discountedRate) : null,
        bonusFlatCents: formData.bonusFlatCents ? parseInt(formData.bonusFlatCents) : null,
      };

      const url = editingRule
        ? `${API_URL}/api/commissions/rules/${editingRule.id}`
        : `${API_URL}/api/commissions/rules`;
      const method = editingRule ? 'PUT' : 'POST';

      const res = await authFetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      if (data.success) {
        resetForm();
        fetchRules();
      } else {
        alert(data.message || 'Failed to save rule');
      }
    } catch (err) {
      alert('Failed to save rule');
    }
  };

  const handleDelete = async (ruleId) => {
    if (!window.confirm('Deactivate this commission rule?')) return;
    try {
      const res = await authFetch(`${API_URL}/api/commissions/rules/${ruleId}`, { method: 'DELETE' });
      const data = await res.json();
      if (data.success) fetchRules();
      else alert(data.message || 'Failed to deactivate rule');
    } catch {
      alert('Failed to deactivate rule');
    }
  };

  if (loading) return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      {[1, 2, 3].map(i => (
        <div key={i} style={{ background: 'white', borderRadius: 12, padding: 20, boxShadow: '0 1px 3px rgba(0,0,0,0.06)' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between' }}>
            <div style={{ width: '40%', height: 16, background: '#e5e7eb', borderRadius: 4, animation: 'pulse 1.5s infinite' }} />
            <div style={{ width: '15%', height: 16, background: '#e5e7eb', borderRadius: 4, animation: 'pulse 1.5s infinite' }} />
          </div>
          <div style={{ width: '25%', height: 12, background: '#f3f4f6', borderRadius: 4, marginTop: 8, animation: 'pulse 1.5s infinite' }} />
        </div>
      ))}
      <style>{`@keyframes pulse { 0%, 100% { opacity: 1; } 50% { opacity: 0.4; } }`}</style>
    </div>
  );
  if (error) return (
    <div style={{ padding: 60, textAlign: 'center' }}>
      <p style={{ color: '#ef4444', fontWeight: 500, marginBottom: 12 }}>{error}</p>
      <button onClick={fetchRules} style={{ padding: '8px 20px', background: '#667eea', color: 'white', border: 'none', borderRadius: 8, cursor: 'pointer', fontSize: 14, fontWeight: 500 }}>Retry</button>
    </div>
  );

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
        <div style={{ fontSize: 14, color: '#6b7280' }}>{rules.length} rule{rules.length !== 1 ? 's' : ''} configured</div>
        <button
          onClick={() => { resetForm(); setShowForm(true); }}
          style={{ padding: '10px 20px', background: '#667eea', color: 'white', border: 'none', borderRadius: 8, fontSize: 14, fontWeight: 600, cursor: 'pointer' }}
        >
          + Add Rule
        </button>
      </div>

      {showForm && (
        <div style={{ background: '#f9fafb', border: '1px solid #e5e7eb', borderRadius: 12, padding: 24, marginBottom: 24 }}>
          <h3 style={{ margin: '0 0 16px', fontSize: 16, fontWeight: 600, color: '#111827' }}>
            {editingRule ? 'Edit Rule' : 'New Commission Rule'}
          </h3>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
            <div>
              <label style={labelStyle}>Rule Name *</label>
              <input style={inputStyle} value={formData.ruleName} onChange={e => setFormData(f => ({ ...f, ruleName: e.target.value }))} placeholder="e.g. Base Commission" />
            </div>
            <div>
              <label style={labelStyle}>Type</label>
              <select style={inputStyle} value={formData.ruleType} onChange={e => setFormData(f => ({ ...f, ruleType: e.target.value }))}>
                <option value="flat">Flat Rate</option>
                <option value="tiered">Tiered</option>
                <option value="category">Category-Based</option>
                <option value="product_type">Product Type</option>
                <option value="bonus">Bonus</option>
              </select>
            </div>
            <div>
              <label style={labelStyle}>Rate (decimal, e.g. 0.05 = 5%)</label>
              <input style={inputStyle} type="number" step="0.001" value={formData.rate} onChange={e => setFormData(f => ({ ...f, rate: e.target.value }))} placeholder="0.05" />
            </div>
            <div>
              <label style={labelStyle}>Priority (lower = higher priority)</label>
              <input style={inputStyle} type="number" value={formData.priority} onChange={e => setFormData(f => ({ ...f, priority: e.target.value }))} />
            </div>
            <div style={{ gridColumn: '1 / -1' }}>
              <label style={labelStyle}>Description</label>
              <input style={inputStyle} value={formData.description} onChange={e => setFormData(f => ({ ...f, description: e.target.value }))} placeholder="Rule description" />
            </div>
            <div>
              <label style={labelStyle}>Category ID (optional)</label>
              <input style={inputStyle} type="number" value={formData.categoryId} onChange={e => setFormData(f => ({ ...f, categoryId: e.target.value }))} />
            </div>
            <div>
              <label style={labelStyle}>Product Type (optional)</label>
              <input style={inputStyle} value={formData.productType} onChange={e => setFormData(f => ({ ...f, productType: e.target.value }))} placeholder="e.g. warranty" />
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
              <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 14, color: '#374151', cursor: 'pointer' }}>
                <input type="checkbox" checked={formData.appliesToDiscounted} onChange={e => setFormData(f => ({ ...f, appliesToDiscounted: e.target.checked }))} />
                Applies to Discounted
              </label>
              <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 14, color: '#374151', cursor: 'pointer' }}>
                <input type="checkbox" checked={formData.isBonus} onChange={e => setFormData(f => ({ ...f, isBonus: e.target.checked }))} />
                Is Bonus
              </label>
              <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 14, color: '#374151', cursor: 'pointer' }}>
                <input type="checkbox" checked={formData.isActive} onChange={e => setFormData(f => ({ ...f, isActive: e.target.checked }))} />
                Active
              </label>
            </div>
          </div>
          <div style={{ display: 'flex', gap: 12, marginTop: 20 }}>
            <button onClick={handleSave} style={{ padding: '10px 24px', background: '#10b981', color: 'white', border: 'none', borderRadius: 8, fontSize: 14, fontWeight: 600, cursor: 'pointer' }}>
              {editingRule ? 'Update Rule' : 'Create Rule'}
            </button>
            <button onClick={resetForm} style={{ padding: '10px 24px', background: '#e5e7eb', color: '#374151', border: 'none', borderRadius: 8, fontSize: 14, fontWeight: 600, cursor: 'pointer' }}>
              Cancel
            </button>
          </div>
        </div>
      )}

      <div style={{ background: 'white', borderRadius: 12, overflow: 'hidden', boxShadow: '0 1px 3px rgba(0,0,0,0.1)' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead>
            <tr style={{ background: '#f9fafb', borderBottom: '2px solid #e5e7eb' }}>
              <th style={thStyle}>Rule Name</th>
              <th style={thStyle}>Type</th>
              <th style={thStyle}>Rate</th>
              <th style={thStyle}>Category</th>
              <th style={thStyle}>Priority</th>
              <th style={thStyle}>Status</th>
              <th style={{ ...thStyle, textAlign: 'right' }}>Actions</th>
            </tr>
          </thead>
          <tbody>
            {rules.length === 0 ? (
              <tr><td colSpan={7} style={{ padding: 40, textAlign: 'center', color: '#9ca3af' }}>No commission rules configured</td></tr>
            ) : rules.map(rule => (
              <tr key={rule.id} style={{ borderBottom: '1px solid #f3f4f6' }}>
                <td style={tdStyle}>
                  <div style={{ fontWeight: 600, color: '#111827' }}>{rule.ruleName}</div>
                  {rule.description && <div style={{ fontSize: 12, color: '#6b7280', marginTop: 2 }}>{rule.description}</div>}
                </td>
                <td style={tdStyle}>
                  <span style={{ padding: '2px 8px', borderRadius: 6, fontSize: 12, fontWeight: 500, background: typeColors[rule.ruleType]?.bg || '#f3f4f6', color: typeColors[rule.ruleType]?.color || '#374151' }}>
                    {rule.ruleType}
                  </span>
                </td>
                <td style={tdStyle}>{rule.ratePercent || formatPercent(rule.rate)}</td>
                <td style={tdStyle}>{rule.categoryName || rule.productType || 'All'}</td>
                <td style={tdStyle}>{rule.priority}</td>
                <td style={tdStyle}>
                  <span style={{ padding: '2px 8px', borderRadius: 6, fontSize: 12, fontWeight: 600, background: rule.isActive ? '#dcfce7' : '#fee2e2', color: rule.isActive ? '#15803d' : '#dc2626' }}>
                    {rule.isActive ? 'Active' : 'Inactive'}
                  </span>
                </td>
                <td style={{ ...tdStyle, textAlign: 'right' }}>
                  <button onClick={() => handleEdit(rule)} style={actionBtnStyle}>Edit</button>
                  {rule.isActive && (
                    <button onClick={() => handleDelete(rule.id)} style={{ ...actionBtnStyle, color: '#ef4444' }}>Deactivate</button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ==========================================
// Payroll Summary Tab
// ==========================================
function PayrollSummaryTab() {
  const [summary, setSummary] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const now = new Date();
  const firstOfMonth = new Date(now.getFullYear(), now.getMonth(), 1).toISOString().split('T')[0];
  const today = now.toISOString().split('T')[0];
  const [periodStart, setPeriodStart] = useState(firstOfMonth);
  const [periodEnd, setPeriodEnd] = useState(today);

  const fetchPayroll = useCallback(async () => {
    if (!periodStart || !periodEnd) return;
    setLoading(true);
    setError(null);
    try {
      const res = await authFetch(`${API_URL}/api/commissions/payroll/summary?periodStart=${periodStart}&periodEnd=${periodEnd}`);
      const data = await res.json();
      if (data.success) setSummary(data.data || []);
      else setError(data.message || 'Failed to load payroll summary');
    } catch (err) {
      setError('Failed to load payroll summary');
    } finally {
      setLoading(false);
    }
  }, [periodStart, periodEnd]);

  useEffect(() => { fetchPayroll(); }, [fetchPayroll]);

  const totals = summary.reduce((acc, row) => ({
    grossCommission: acc.grossCommission + (row.grossCommission || 0),
    totalSales: acc.totalSales + (row.totalSales || 0),
    orderCount: acc.orderCount + (row.orderCount || 0),
  }), { grossCommission: 0, totalSales: 0, orderCount: 0 });

  return (
    <div>
      <div style={{ display: 'flex', gap: 16, alignItems: 'flex-end', marginBottom: 24, flexWrap: 'wrap' }}>
        <div>
          <label style={labelStyle}>Period Start</label>
          <input type="date" style={inputStyle} value={periodStart} onChange={e => setPeriodStart(e.target.value)} />
        </div>
        <div>
          <label style={labelStyle}>Period End</label>
          <input type="date" style={inputStyle} value={periodEnd} onChange={e => setPeriodEnd(e.target.value)} />
        </div>
        <button onClick={fetchPayroll} style={{ padding: '10px 20px', background: '#667eea', color: 'white', border: 'none', borderRadius: 8, fontSize: 14, fontWeight: 600, cursor: 'pointer', height: 42 }}>
          Refresh
        </button>
      </div>

      {/* Summary cards */}
      {summary.length > 0 && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 16, marginBottom: 24 }}>
          <div style={cardStyle}>
            <div style={{ fontSize: 13, color: '#6b7280', marginBottom: 4 }}>Total Commission</div>
            <div style={{ fontSize: 28, fontWeight: 700, color: '#10b981' }}>{formatCurrency(totals.grossCommission)}</div>
          </div>
          <div style={cardStyle}>
            <div style={{ fontSize: 13, color: '#6b7280', marginBottom: 4 }}>Total Sales</div>
            <div style={{ fontSize: 28, fontWeight: 700, color: '#111827' }}>{formatCurrency(totals.totalSales)}</div>
          </div>
          <div style={cardStyle}>
            <div style={{ fontSize: 13, color: '#6b7280', marginBottom: 4 }}>Total Orders</div>
            <div style={{ fontSize: 28, fontWeight: 700, color: '#667eea' }}>{totals.orderCount}</div>
          </div>
          <div style={cardStyle}>
            <div style={{ fontSize: 13, color: '#6b7280', marginBottom: 4 }}>Sales Reps</div>
            <div style={{ fontSize: 28, fontWeight: 700, color: '#8b5cf6' }}>{summary.length}</div>
          </div>
        </div>
      )}

      {loading ? (
        <div style={{ background: 'white', borderRadius: 12, overflow: 'hidden', boxShadow: '0 1px 3px rgba(0,0,0,0.1)' }}>
          {[1, 2, 3, 4].map(i => (
            <div key={i} style={{ display: 'flex', justifyContent: 'space-between', padding: '16px 20px', borderBottom: '1px solid #f3f4f6' }}>
              <div style={{ width: '30%', height: 14, background: '#e5e7eb', borderRadius: 4, animation: 'pulse 1.5s infinite' }} />
              <div style={{ width: '15%', height: 14, background: '#e5e7eb', borderRadius: 4, animation: 'pulse 1.5s infinite' }} />
              <div style={{ width: '15%', height: 14, background: '#e5e7eb', borderRadius: 4, animation: 'pulse 1.5s infinite' }} />
            </div>
          ))}
          <style>{`@keyframes pulse { 0%, 100% { opacity: 1; } 50% { opacity: 0.4; } }`}</style>
        </div>
      ) : error ? (
        <div style={{ padding: 60, textAlign: 'center' }}>
          <p style={{ color: '#ef4444', fontWeight: 500, marginBottom: 12 }}>{error}</p>
          <button onClick={fetchPayroll} style={{ padding: '8px 20px', background: '#667eea', color: 'white', border: 'none', borderRadius: 8, cursor: 'pointer', fontSize: 14, fontWeight: 500 }}>Retry</button>
        </div>
      ) : (
        <div style={{ background: 'white', borderRadius: 12, overflow: 'hidden', boxShadow: '0 1px 3px rgba(0,0,0,0.1)' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr style={{ background: '#f9fafb', borderBottom: '2px solid #e5e7eb' }}>
                <th style={thStyle}>Sales Rep</th>
                <th style={thStyle}>Email</th>
                <th style={{ ...thStyle, textAlign: 'right' }}>Orders</th>
                <th style={{ ...thStyle, textAlign: 'right' }}>Total Sales</th>
                <th style={{ ...thStyle, textAlign: 'right' }}>Gross Commission</th>
                <th style={{ ...thStyle, textAlign: 'right' }}>Avg Rate</th>
              </tr>
            </thead>
            <tbody>
              {summary.length === 0 ? (
                <tr><td colSpan={6} style={{ padding: 40, textAlign: 'center', color: '#9ca3af' }}>No commission data for this period</td></tr>
              ) : summary.map(row => (
                <tr key={row.repId} style={{ borderBottom: '1px solid #f3f4f6' }}>
                  <td style={tdStyle}><span style={{ fontWeight: 600, color: '#111827' }}>{row.repName}</span></td>
                  <td style={tdStyle}><span style={{ color: '#6b7280', fontSize: 13 }}>{row.email}</span></td>
                  <td style={{ ...tdStyle, textAlign: 'right' }}>{row.orderCount}</td>
                  <td style={{ ...tdStyle, textAlign: 'right' }}>{formatCurrency(row.totalSales)}</td>
                  <td style={{ ...tdStyle, textAlign: 'right', fontWeight: 600, color: '#10b981' }}>{formatCurrency(row.grossCommission)}</td>
                  <td style={{ ...tdStyle, textAlign: 'right' }}>
                    {row.totalSales > 0 ? formatPercent(row.grossCommission / row.totalSales) : '0%'}
                  </td>
                </tr>
              ))}
              {summary.length > 1 && (
                <tr style={{ background: '#f9fafb', borderTop: '2px solid #e5e7eb', fontWeight: 700 }}>
                  <td style={tdStyle}>Totals</td>
                  <td style={tdStyle}></td>
                  <td style={{ ...tdStyle, textAlign: 'right' }}>{totals.orderCount}</td>
                  <td style={{ ...tdStyle, textAlign: 'right' }}>{formatCurrency(totals.totalSales)}</td>
                  <td style={{ ...tdStyle, textAlign: 'right', color: '#10b981' }}>{formatCurrency(totals.grossCommission)}</td>
                  <td style={{ ...tdStyle, textAlign: 'right' }}>
                    {totals.totalSales > 0 ? formatPercent(totals.grossCommission / totals.totalSales) : '0%'}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

// ==========================================
// Export Report Tab
// ==========================================
function ExportReportTab() {
  const [exporting, setExporting] = useState(false);
  const [reps, setReps] = useState([]);
  const now = new Date();
  const firstOfMonth = new Date(now.getFullYear(), now.getMonth(), 1).toISOString().split('T')[0];
  const today = now.toISOString().split('T')[0];
  const [startDate, setStartDate] = useState(firstOfMonth);
  const [endDate, setEndDate] = useState(today);
  const [repId, setRepId] = useState('');
  const [previewData, setPreviewData] = useState(null);

  // Fetch team for rep dropdown
  useEffect(() => {
    (async () => {
      try {
        const res = await authFetch(`${API_URL}/api/commissions/team`);
        const data = await res.json();
        if (data.success && data.data?.reps) setReps(data.data.reps);
      } catch { /* ignore */ }
    })();
  }, []);

  // Preview stats when dates change
  useEffect(() => {
    if (!startDate || !endDate) return;
    (async () => {
      try {
        const res = await authFetch(`${API_URL}/api/commissions/stats?startDate=${startDate}&endDate=${endDate}`);
        const data = await res.json();
        if (data.success) setPreviewData(data.data);
      } catch { /* ignore */ }
    })();
  }, [startDate, endDate]);

  const handleExport = async () => {
    setExporting(true);
    try {
      const params = new URLSearchParams({ startDate, endDate, format: 'csv' });
      if (repId) params.append('repId', repId);

      const res = await authFetch(`${API_URL}/api/commissions/export?${params.toString()}`);
      if (!res.ok) {
        const err = await res.json().catch(() => null);
        alert(err?.message || 'Export failed');
        return;
      }

      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `commissions_${startDate}_${endDate}.csv`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch {
      alert('Failed to export report');
    } finally {
      setExporting(false);
    }
  };

  return (
    <div>
      <div style={{ background: 'white', borderRadius: 12, padding: 24, boxShadow: '0 1px 3px rgba(0,0,0,0.1)', marginBottom: 24 }}>
        <h3 style={{ margin: '0 0 16px', fontSize: 16, fontWeight: 600, color: '#111827' }}>Export Commission Report</h3>
        <p style={{ margin: '0 0 20px', fontSize: 14, color: '#6b7280' }}>
          Generate a CSV file with detailed commission data for the selected period.
        </p>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 16, marginBottom: 20 }}>
          <div>
            <label style={labelStyle}>Start Date</label>
            <input type="date" style={inputStyle} value={startDate} onChange={e => setStartDate(e.target.value)} />
          </div>
          <div>
            <label style={labelStyle}>End Date</label>
            <input type="date" style={inputStyle} value={endDate} onChange={e => setEndDate(e.target.value)} />
          </div>
          <div>
            <label style={labelStyle}>Sales Rep (optional)</label>
            <select style={inputStyle} value={repId} onChange={e => setRepId(e.target.value)}>
              <option value="">All Reps</option>
              {reps.map(rep => (
                <option key={rep.repId} value={rep.repId}>{rep.repName}</option>
              ))}
            </select>
          </div>
        </div>

        <button
          onClick={handleExport}
          disabled={exporting || !startDate || !endDate}
          style={{
            padding: '12px 32px', background: exporting ? '#9ca3af' : '#10b981', color: 'white',
            border: 'none', borderRadius: 8, fontSize: 14, fontWeight: 600,
            cursor: exporting ? 'not-allowed' : 'pointer', transition: 'all 0.15s',
          }}
        >
          {exporting ? 'Exporting...' : 'Download CSV'}
        </button>
      </div>

      {previewData && (
        <div style={{ background: 'white', borderRadius: 12, padding: 24, boxShadow: '0 1px 3px rgba(0,0,0,0.1)' }}>
          <h3 style={{ margin: '0 0 16px', fontSize: 16, fontWeight: 600, color: '#111827' }}>Period Overview</h3>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 16 }}>
            <div style={cardStyle}>
              <div style={{ fontSize: 13, color: '#6b7280', marginBottom: 4 }}>Total Commission</div>
              <div style={{ fontSize: 24, fontWeight: 700, color: '#10b981' }}>
                {formatCurrency(previewData.totalCommission || previewData.total_commission || 0)}
              </div>
            </div>
            <div style={cardStyle}>
              <div style={{ fontSize: 13, color: '#6b7280', marginBottom: 4 }}>Total Sales</div>
              <div style={{ fontSize: 24, fontWeight: 700, color: '#111827' }}>
                {formatCurrency(previewData.totalSales || previewData.total_sales || 0)}
              </div>
            </div>
            <div style={cardStyle}>
              <div style={{ fontSize: 13, color: '#6b7280', marginBottom: 4 }}>Orders</div>
              <div style={{ fontSize: 24, fontWeight: 700, color: '#667eea' }}>
                {previewData.orderCount || previewData.order_count || 0}
              </div>
            </div>
            <div style={cardStyle}>
              <div style={{ fontSize: 13, color: '#6b7280', marginBottom: 4 }}>Avg Rate</div>
              <div style={{ fontSize: 24, fontWeight: 700, color: '#8b5cf6' }}>
                {previewData.avgRate != null ? formatPercent(previewData.avgRate) :
                  previewData.avg_rate != null ? formatPercent(previewData.avg_rate) : 'N/A'}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ==========================================
// Shared styles
// ==========================================
const labelStyle = { display: 'block', fontSize: 13, fontWeight: 600, color: '#374151', marginBottom: 4 };
const inputStyle = { width: '100%', padding: '10px 12px', border: '1px solid #d1d5db', borderRadius: 8, fontSize: 14, outline: 'none', boxSizing: 'border-box' };
const thStyle = { padding: '12px 16px', textAlign: 'left', fontSize: 12, fontWeight: 600, color: '#6b7280', textTransform: 'uppercase', letterSpacing: '0.05em' };
const tdStyle = { padding: '14px 16px', fontSize: 14, color: '#374151' };
const actionBtnStyle = { background: 'none', border: 'none', color: '#667eea', fontSize: 13, fontWeight: 600, cursor: 'pointer', padding: '4px 8px' };
const cardStyle = { background: '#f9fafb', padding: 20, borderRadius: 10, border: '1px solid #e5e7eb' };
const typeColors = {
  flat: { bg: '#dbeafe', color: '#1d4ed8' },
  tiered: { bg: '#fef3c7', color: '#d97706' },
  category: { bg: '#dcfce7', color: '#15803d' },
  product_type: { bg: '#f3e8ff', color: '#7c3aed' },
  bonus: { bg: '#fce7f3', color: '#be185d' },
};

// ==========================================
// Main TeamCommissions Component
// ==========================================
const tabs = [
  { id: 'rules', label: 'Commission Rules' },
  { id: 'payroll', label: 'Payroll Summary' },
  { id: 'export', label: 'Export Report' },
];

export default function TeamCommissions() {
  const [activeTab, setActiveTab] = useState('rules');

  return (
    <div style={{ padding: 30, fontFamily: 'system-ui, -apple-system, sans-serif', background: '#f9fafb', minHeight: 'calc(100vh - 140px)' }}>
      <div style={{ maxWidth: 1400, margin: '0 auto' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 14, marginBottom: 20 }}>
          <div style={{
            width: 42, height: 42, borderRadius: 12,
            background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            boxShadow: '0 4px 12px rgba(102, 126, 234, 0.3)', flexShrink: 0
          }}>
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <line x1="12" y1="1" x2="12" y2="23"/><path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"/>
            </svg>
          </div>
          <div>
            <h1 style={{ fontSize: 24, fontWeight: 700, color: '#111827', margin: 0 }}>Team Commissions</h1>
            <p style={{ color: '#6b7280', margin: '2px 0 0', fontSize: 13 }}>
              Manage commission rules, view payroll summaries, and export reports
            </p>
          </div>
        </div>

        <div style={{ display: 'flex', gap: 8, marginBottom: 24, background: '#f3f4f6', padding: 4, borderRadius: 10, width: 'fit-content' }}>
          {tabs.map(tab => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              style={{
                padding: '10px 20px', borderRadius: 8, border: 'none',
                fontSize: 14, fontWeight: 600, cursor: 'pointer',
                background: activeTab === tab.id ? '#667eea' : 'transparent',
                color: activeTab === tab.id ? 'white' : '#6b7280',
                transition: 'all 0.15s',
              }}
            >
              {tab.label}
            </button>
          ))}
        </div>

        {activeTab === 'rules' && <CommissionRulesTab />}
        {activeTab === 'payroll' && <PayrollSummaryTab />}
        {activeTab === 'export' && <ExportReportTab />}
      </div>
    </div>
  );
}
