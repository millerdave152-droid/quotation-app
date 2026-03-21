import React, { useState, useEffect, useCallback } from 'react';
import { authFetch } from '../../services/authFetch';

const API = '/api/surveys';

export default function SurveyDashboard() {
  const [tab, setTab] = useState('templates');
  const [templates, setTemplates] = useState([]);
  const [stats, setStats] = useState({});
  const [responses, setResponses] = useState([]);
  const [_selectedTemplate, setSelectedTemplate] = useState(null);
  const [error, setError] = useState('');
  const [form, setForm] = useState({ name: '', triggerEvent: 'purchase', triggerDelayHours: 24, googleReviewRedirectUrl: '', questions: '[]' });

  const fetchTemplates = useCallback(async () => {
    try {
      const res = await authFetch(`${API}/templates`);
      const data = await res.json();
      if (data.success) setTemplates(data.data || []);
    } catch (e) { setError(e.message); }
  }, []);

  const fetchStats = useCallback(async () => {
    try {
      const res = await authFetch(`${API}/stats`);
      const data = await res.json();
      if (data.success) setStats(data.data || {});
    } catch (e) { /* ignore */ }
  }, []);

  useEffect(() => { fetchTemplates(); fetchStats(); }, [fetchTemplates, fetchStats]);

  const createTemplate = async () => {
    try {
      let questions;
      try { questions = JSON.parse(form.questions); } catch { return setError('Invalid questions JSON'); }
      const res = await authFetch(`${API}/templates`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...form, questions })
      });
      const data = await res.json();
      if (data.success) { fetchTemplates(); setTab('templates'); }
      else setError(data.error || 'Failed');
    } catch (e) { setError(e.message); }
  };

  const loadResponses = async (templateId) => {
    try {
      const res = await authFetch(`${API}/templates/${templateId}/responses`);
      const data = await res.json();
      if (data.success) { setResponses(data.data || []); setSelectedTemplate(templateId); setTab('responses'); }
    } catch (e) { setError(e.message); }
  };

  return (
    <div style={{ padding: '24px', maxWidth: 1200 }}>
      <h2 style={{ marginBottom: 16 }}>Surveys & Reviews</h2>
      {error && <div style={{ background: '#fef2f2', color: '#dc2626', padding: 12, borderRadius: 8, marginBottom: 16 }}>{error} <button onClick={() => setError('')}>×</button></div>}

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 12, marginBottom: 24 }}>
        {[
          { label: 'Templates', value: stats.template_count, color: '#2563eb' },
          { label: 'Responses', value: stats.total_responses, color: '#10b981' },
          { label: 'Avg Rating', value: stats.avg_rating, color: '#f59e0b' },
          { label: 'Google Redirects', value: stats.google_redirects, color: '#8b5cf6' },
        ].map(s => (
          <div key={s.label} style={{ padding: 16, background: '#f9fafb', borderRadius: 8, textAlign: 'center', borderLeft: `4px solid ${s.color}` }}>
            <div style={{ fontSize: 24, fontWeight: 700, color: s.color }}>{s.value || 0}</div>
            <div style={{ color: '#6b7280', fontSize: 13 }}>{s.label}</div>
          </div>
        ))}
      </div>

      <div style={{ display: 'flex', gap: 8, marginBottom: 24 }}>
        {['templates', 'create', 'responses'].map(t => (
          <button key={t} onClick={() => setTab(t)}
            style={{ padding: '8px 16px', borderRadius: 8, border: 'none', background: tab === t ? '#2563eb' : '#f3f4f6', color: tab === t ? '#fff' : '#374151', cursor: 'pointer' }}>
            {t === 'templates' ? 'Templates' : t === 'create' ? 'Create Template' : 'Responses'}
          </button>
        ))}
      </div>

      {tab === 'templates' && (
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead><tr style={{ borderBottom: '2px solid #e5e7eb', textAlign: 'left' }}>
            <th style={{ padding: 8 }}>Name</th><th style={{ padding: 8 }}>Trigger</th><th style={{ padding: 8 }}>Delay</th>
            <th style={{ padding: 8 }}>Responses</th><th style={{ padding: 8 }}>Avg Rating</th><th style={{ padding: 8 }}>Active</th><th style={{ padding: 8 }}>Actions</th>
          </tr></thead>
          <tbody>
            {templates.map(t => (
              <tr key={t.id} style={{ borderBottom: '1px solid #f3f4f6' }}>
                <td style={{ padding: 8 }}>{t.name}</td>
                <td style={{ padding: 8 }}>{t.trigger_event}</td>
                <td style={{ padding: 8 }}>{t.trigger_delay_hours}h</td>
                <td style={{ padding: 8 }}>{t.response_count}</td>
                <td style={{ padding: 8 }}>{t.avg_rating ? `${t.avg_rating}/5` : '—'}</td>
                <td style={{ padding: 8 }}>{t.is_active ? 'Yes' : 'No'}</td>
                <td style={{ padding: 8 }}><button onClick={() => loadResponses(t.id)} style={{ padding: '4px 8px', borderRadius: 4, border: '1px solid #d1d5db', background: '#fff', cursor: 'pointer' }}>Responses</button></td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      {tab === 'create' && (
        <div style={{ maxWidth: 500 }}>
          {[{ key: 'name', label: 'Template Name' }, { key: 'googleReviewRedirectUrl', label: 'Google Review URL' }].map(f => (
            <div key={f.key} style={{ marginBottom: 12 }}>
              <label style={{ display: 'block', marginBottom: 4 }}>{f.label}</label>
              <input value={form[f.key]} onChange={e => setForm(p => ({ ...p, [f.key]: e.target.value }))}
                style={{ width: '100%', padding: 8, borderRadius: 8, border: '1px solid #d1d5db' }} />
            </div>
          ))}
          <div style={{ marginBottom: 12 }}>
            <label style={{ display: 'block', marginBottom: 4 }}>Trigger Event</label>
            <select value={form.triggerEvent} onChange={e => setForm(p => ({ ...p, triggerEvent: e.target.value }))}
              style={{ width: '100%', padding: 8, borderRadius: 8, border: '1px solid #d1d5db' }}>
              {['purchase', 'delivery', 'work_order_complete', 'installation', 'manual'].map(e => <option key={e} value={e}>{e.replace(/_/g, ' ')}</option>)}
            </select>
          </div>
          <div style={{ marginBottom: 12 }}>
            <label style={{ display: 'block', marginBottom: 4 }}>Delay (hours)</label>
            <input type="number" value={form.triggerDelayHours} onChange={e => setForm(p => ({ ...p, triggerDelayHours: parseInt(e.target.value) }))}
              style={{ width: '100%', padding: 8, borderRadius: 8, border: '1px solid #d1d5db' }} />
          </div>
          <div style={{ marginBottom: 12 }}>
            <label style={{ display: 'block', marginBottom: 4 }}>Questions (JSON array)</label>
            <textarea value={form.questions} onChange={e => setForm(p => ({ ...p, questions: e.target.value }))} rows={4}
              style={{ width: '100%', padding: 8, borderRadius: 8, border: '1px solid #d1d5db', fontFamily: 'monospace' }} />
          </div>
          <button onClick={createTemplate} style={{ padding: '10px 24px', borderRadius: 8, border: 'none', background: '#2563eb', color: '#fff', cursor: 'pointer' }}>Create Template</button>
        </div>
      )}

      {tab === 'responses' && (
        <div>
          <h3>Responses</h3>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead><tr style={{ borderBottom: '2px solid #e5e7eb', textAlign: 'left' }}>
              <th style={{ padding: 8 }}>Customer</th><th style={{ padding: 8 }}>Rating</th><th style={{ padding: 8 }}>Feedback</th>
              <th style={{ padding: 8 }}>Google?</th><th style={{ padding: 8 }}>Completed</th>
            </tr></thead>
            <tbody>
              {responses.map(r => (
                <tr key={r.id} style={{ borderBottom: '1px solid #f3f4f6' }}>
                  <td style={{ padding: 8 }}>{r.customer_name}</td>
                  <td style={{ padding: 8 }}>{'★'.repeat(r.overall_rating || 0)}{'☆'.repeat(5 - (r.overall_rating || 0))}</td>
                  <td style={{ padding: 8 }}>{r.feedback_text || '—'}</td>
                  <td style={{ padding: 8 }}>{r.redirected_to_google ? 'Yes' : 'No'}</td>
                  <td style={{ padding: 8 }}>{r.completed_at ? new Date(r.completed_at).toLocaleDateString() : '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
