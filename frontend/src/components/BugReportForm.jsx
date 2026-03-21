/**
 * BugReportForm — Floating bug-report button + modal
 * Props:
 *   reportedBy  (string)  — current logged-in user's display name
 *   currentPage (string?) — falls back to window.location.pathname
 */

import React, { useState, useEffect, useRef, useCallback } from 'react';

/* Works in both CRA (process.env) and Vite (import.meta.env) */
const API_BASE =
  (typeof import.meta !== 'undefined' && import.meta.env?.VITE_API_URL) ||
  (typeof process !== 'undefined' && process.env?.REACT_APP_API_URL) ||
  '';

const SEVERITIES = [
  {
    value: 'blocker',
    label: 'Blocker',
    desc: "Can't complete a sale or quote",
    color: '#ef4444',
    bg: '#fef2f2',
    border: '#fca5a5'
  },
  {
    value: 'major',
    label: 'Major',
    desc: 'Wrong result, but workaround exists',
    color: '#f59e0b',
    bg: '#fffbeb',
    border: '#fcd34d'
  },
  {
    value: 'minor',
    label: 'Minor',
    desc: 'Visual issue or small annoyance',
    color: '#10b981',
    bg: '#ecfdf5',
    border: '#6ee7b7'
  }
];

const INITIAL_FORM = { title: '', severity: '', description: '', steps: '' };

function BugReportForm({ reportedBy = '', currentPage }) {
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState(INITIAL_FORM);
  const [errors, setErrors] = useState({});
  const [submitting, setSubmitting] = useState(false);
  const [result, setResult] = useState(null); // { type: 'success'|'error', message }
  const [pulse, setPulse] = useState(true);
  const titleRef = useRef(null);

  // Pulse the FAB for 2 seconds on first mount
  useEffect(() => {
    const t = setTimeout(() => setPulse(false), 2000);
    return () => clearTimeout(t);
  }, []);

  // Lock body scroll & focus title when modal opens
  useEffect(() => {
    if (open) {
      document.body.style.overflow = 'hidden';
      setTimeout(() => titleRef.current?.focus(), 50);
    } else {
      document.body.style.overflow = '';
    }
    return () => { document.body.style.overflow = ''; };
  }, [open]);

  // Close on Escape
  useEffect(() => {
    if (!open) return;
    const handler = (e) => { if (e.key === 'Escape') handleClose(); };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  });

  const page = currentPage || window.location.pathname;
  const now = new Date().toLocaleString('en-CA', {
    dateStyle: 'medium',
    timeStyle: 'short'
  });

  const handleChange = (field, value) => {
    setForm((prev) => ({ ...prev, [field]: value }));
    if (errors[field]) setErrors((prev) => ({ ...prev, [field]: null }));
  };

  const validate = () => {
    const errs = {};
    if (!form.title.trim()) errs.title = 'Title is required';
    if (!form.severity) errs.severity = 'Select a severity';
    if (!form.description.trim()) errs.description = 'Description is required';
    setErrors(errs);
    return Object.keys(errs).length === 0;
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!validate()) return;
    setSubmitting(true);
    setResult(null);

    try {
      const res = await fetch(`${API_BASE}/api/bug-reports`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: form.title.trim(),
          description: form.description.trim(),
          severity: form.severity,
          steps: form.steps.trim() || null,
          page,
          reportedBy: reportedBy || null,
          createdAt: new Date().toISOString(),
          userAgent: navigator.userAgent
        })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error?.message || 'Submission failed');

      setResult({ type: 'success', message: `Bug #${data.id} submitted — thanks!` });
      setTimeout(() => {
        setOpen(false);
        setForm(INITIAL_FORM);
        setErrors({});
        setResult(null);
      }, 2000);
    } catch (err) {
      setResult({
        type: 'error',
        message: `${err.message}. You can also report via WhatsApp.`
      });
    } finally {
      setSubmitting(false);
    }
  };

  const handleClose = useCallback(() => {
    if (submitting) return;
    setOpen(false);
    setResult(null);
  }, [submitting]);

  const selectedSev = SEVERITIES.find((s) => s.value === form.severity);

  return (
    <>
      {/* ── Keyframe animations ── */}
      <style>{`
        @keyframes bugPulse {
          0%, 100% { box-shadow: 0 2px 8px rgba(59,130,246,0.3); }
          50%  { box-shadow: 0 0 0 8px rgba(59,130,246,0.15), 0 2px 8px rgba(59,130,246,0.3); }
        }
        @keyframes bugModalIn {
          from { opacity: 0; transform: scale(0.95) translateY(8px); }
          to   { opacity: 1; transform: scale(1) translateY(0); }
        }
      `}</style>

      {/* ── Floating Action Button ── */}
      <button
        onClick={() => setOpen(true)}
        style={{
          position: 'fixed',
          bottom: 24,
          right: 24,
          zIndex: 9998,
          display: 'inline-flex',
          alignItems: 'center',
          gap: 8,
          padding: '10px 18px',
          background: '#3b82f6',
          color: '#fff',
          border: 'none',
          borderRadius: 10,
          fontSize: 14,
          fontWeight: 600,
          cursor: 'pointer',
          boxShadow: '0 2px 8px rgba(59,130,246,0.3)',
          animation: pulse ? 'bugPulse 0.7s ease-in-out 3' : 'none',
          transition: 'background 0.15s'
        }}
        onMouseEnter={(e) => (e.currentTarget.style.background = '#2563eb')}
        onMouseLeave={(e) => (e.currentTarget.style.background = '#3b82f6')}
      >
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor"
          strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <circle cx="12" cy="12" r="10" />
          <line x1="12" y1="8" x2="12" y2="12" />
          <line x1="12" y1="16" x2="12.01" y2="16" />
        </svg>
        Report a Bug
      </button>

      {/* ── Modal Overlay ── */}
      {open && (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="bug-modal-title"
          onClick={handleClose}
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(0,0,0,0.5)',
            backdropFilter: 'blur(2px)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 9999,
            padding: 16
          }}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            style={{
              background: '#fff',
              borderRadius: 14,
              width: '100%',
              maxWidth: 520,
              maxHeight: '90vh',
              overflowY: 'auto',
              boxShadow: '0 25px 50px -12px rgba(0,0,0,0.25)',
              animation: 'bugModalIn 0.2s ease-out'
            }}
          >
            {/* ── Header ── */}
            <div style={{
              padding: '16px 24px',
              borderBottom: '1px solid #e5e7eb',
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center'
            }}>
              <h3 id="bug-modal-title" style={{
                margin: 0,
                fontSize: 17,
                fontWeight: 700,
                color: '#111827',
                display: 'flex',
                alignItems: 'center',
                gap: 8
              }}>
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#3b82f6"
                  strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <circle cx="12" cy="12" r="10" />
                  <line x1="12" y1="8" x2="12" y2="12" />
                  <line x1="12" y1="16" x2="12.01" y2="16" />
                </svg>
                Report a Bug
              </h3>
              <button onClick={handleClose} style={{
                background: 'none',
                border: 'none',
                fontSize: 20,
                color: '#6b7280',
                cursor: 'pointer',
                padding: '4px 8px',
                borderRadius: 4,
                lineHeight: 1
              }}>
                &times;
              </button>
            </div>

            {/* ── Body ── */}
            <form onSubmit={handleSubmit} style={{ padding: 24 }}>
              {/* Result banners */}
              {result && (
                <div style={{
                  padding: '12px 16px',
                  borderRadius: 8,
                  marginBottom: 20,
                  fontSize: 14,
                  fontWeight: 500,
                  background: result.type === 'success' ? '#ecfdf5' : '#fef2f2',
                  color: result.type === 'success' ? '#065f46' : '#991b1b',
                  border: `1px solid ${result.type === 'success' ? '#a7f3d0' : '#fecaca'}`
                }}>
                  {result.message}
                </div>
              )}

              {/* Title */}
              <div style={{ marginBottom: 20 }}>
                <label style={labelStyle}>Title</label>
                <input
                  ref={titleRef}
                  type="text"
                  maxLength={120}
                  value={form.title}
                  onChange={(e) => handleChange('title', e.target.value)}
                  placeholder="Brief summary of the issue"
                  style={{
                    ...inputStyle,
                    ...(errors.title ? errorBorderStyle : {})
                  }}
                />
                {errors.title && <span style={errorTextStyle}>{errors.title}</span>}
              </div>

              {/* Severity cards */}
              <div style={{ marginBottom: 20 }}>
                <label style={labelStyle}>Severity</label>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 10 }}>
                  {SEVERITIES.map((sev) => {
                    const selected = form.severity === sev.value;
                    return (
                      <button
                        key={sev.value}
                        type="button"
                        onClick={() => handleChange('severity', sev.value)}
                        style={{
                          padding: '12px 10px',
                          borderRadius: 10,
                          border: selected
                            ? `2px solid ${sev.color}`
                            : '1px solid #e5e7eb',
                          background: selected ? sev.bg : '#fff',
                          cursor: 'pointer',
                          textAlign: 'center',
                          transition: 'all 0.15s',
                          boxShadow: selected
                            ? `0 0 0 3px ${sev.color}22`
                            : '0 1px 2px rgba(0,0,0,0.04)'
                        }}
                      >
                        <div style={{
                          fontSize: 14,
                          fontWeight: 700,
                          color: sev.color,
                          marginBottom: 4
                        }}>
                          {sev.label}
                        </div>
                        <div style={{
                          fontSize: 12,
                          color: '#6b7280',
                          lineHeight: 1.3
                        }}>
                          {sev.desc}
                        </div>
                      </button>
                    );
                  })}
                </div>
                {errors.severity && <span style={errorTextStyle}>{errors.severity}</span>}
              </div>

              {/* Description */}
              <div style={{ marginBottom: 20 }}>
                <label style={labelStyle}>What happened?</label>
                <textarea
                  rows={3}
                  value={form.description}
                  onChange={(e) => handleChange('description', e.target.value)}
                  placeholder="Describe what went wrong..."
                  style={{
                    ...inputStyle,
                    resize: 'vertical',
                    ...(errors.description ? errorBorderStyle : {})
                  }}
                />
                {errors.description && <span style={errorTextStyle}>{errors.description}</span>}
              </div>

              {/* Steps */}
              <div style={{ marginBottom: 20 }}>
                <label style={labelStyle}>
                  Steps to reproduce <span style={{ fontWeight: 400, color: '#9ca3af' }}>(optional)</span>
                </label>
                <textarea
                  rows={3}
                  value={form.steps}
                  onChange={(e) => handleChange('steps', e.target.value)}
                  placeholder="1. Go to...&#10;2. Click on...&#10;3. See error..."
                  style={{ ...inputStyle, resize: 'vertical' }}
                />
              </div>

              {/* Metadata strip */}
              <div style={{
                display: 'flex',
                flexWrap: 'wrap',
                gap: 16,
                padding: '10px 14px',
                background: '#f9fafb',
                borderRadius: 8,
                border: '1px solid #f3f4f6',
                marginBottom: 24,
                fontSize: 12,
                color: '#6b7280'
              }}>
                <span><strong>Page:</strong> {page}</span>
                {reportedBy && <span><strong>By:</strong> {reportedBy}</span>}
                <span><strong>Time:</strong> {now}</span>
              </div>

              {/* Submit */}
              <button
                type="submit"
                disabled={submitting || result?.type === 'success'}
                style={{
                  width: '100%',
                  padding: '12px 20px',
                  borderRadius: 8,
                  border: 'none',
                  fontSize: 14,
                  fontWeight: 600,
                  color: '#fff',
                  cursor: submitting ? 'not-allowed' : 'pointer',
                  background: selectedSev
                    ? selectedSev.color
                    : '#3b82f6',
                  opacity: submitting ? 0.7 : 1,
                  transition: 'background 0.15s, opacity 0.15s',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: 8
                }}
              >
                {submitting && (
                  <svg width="16" height="16" viewBox="0 0 24 24" style={{
                    animation: 'spin 0.8s linear infinite'
                  }}>
                    <circle cx="12" cy="12" r="10" stroke="currentColor"
                      strokeWidth="3" fill="none" strokeDasharray="31.4 31.4"
                      strokeLinecap="round" />
                  </svg>
                )}
                {submitting
                  ? 'Submitting...'
                  : selectedSev
                    ? `Submit ${selectedSev.label} Bug`
                    : 'Submit Bug Report'}
              </button>
            </form>
          </div>
        </div>
      )}
    </>
  );
}

/* ── Shared style objects ── */

const labelStyle = {
  display: 'block',
  fontSize: 13,
  fontWeight: 600,
  color: '#4b5563',
  marginBottom: 6
};

const inputStyle = {
  width: '100%',
  padding: '10px 14px',
  border: '1px solid #d1d5db',
  borderRadius: 8,
  fontSize: 14,
  transition: 'border-color 0.2s, box-shadow 0.2s',
  outline: 'none',
  boxSizing: 'border-box'
};

const errorBorderStyle = {
  borderColor: '#ef4444',
  boxShadow: '0 0 0 3px rgba(239,68,68,0.1)'
};

const errorTextStyle = {
  display: 'block',
  fontSize: 12,
  color: '#ef4444',
  marginTop: 4
};

export default BugReportForm;
