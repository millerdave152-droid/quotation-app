import React, { useState, useRef, useCallback } from 'react';
import { authFetch } from '../../services/authFetch';
import { useToast } from '../ui';
import { Upload, FileText, Loader2, CheckCircle, AlertTriangle, XCircle, ChevronDown, ChevronRight, Trash2 } from 'lucide-react';

// ── Kleonik palette ─────────────────────────────────────────
const K = {
  midnight:  '#1A2332',
  copper:    '#C8614A',
  cyan:      '#2B8FAD',
  warm:      '#F5F0E8',
  white:     '#ffffff',
  copperLt:  '#F3DCD6',
  cyanLt:    '#D6EEF5',
  greenLt:   '#D5F0DB',
  green:     '#2E8B57',
  yellowLt:  '#FFF3CD',
  yellow:    '#B8860B',
  redLt:     '#F8D7DA',
  red:       '#C0392B',
  border:    '#E0DAD0',
  textMuted: '#7A7265',
  bg:        '#FAF8F5',
};

const font = "'DM Sans', system-ui, -apple-system, sans-serif";

// ── CEProductImport ─────────────────────────────────────────

const CEProductImport = () => {
  const toast = useToast();
  const fileRef = useRef(null);

  // Input state
  const [rawText, setRawText] = useState('');
  const [fileName, setFileName] = useState(null);

  // Import state
  const [importing, setImporting] = useState(false);
  const [result, setResult] = useState(null);
  const [progress, setProgress] = useState(null); // { processed, total }

  // Collapsible sections
  const [showNotFound, setShowNotFound] = useState(false);
  const [showErrors, setShowErrors] = useState(false);

  // ── Parse UPCs from textarea ──────────────────────────
  const parseUpcs = useCallback(() => {
    return rawText
      .split(/[\n,;]+/)
      .map(s => s.trim())
      .filter(s => s.length >= 5 && /^\d+$/.test(s));
  }, [rawText]);

  const upcs = parseUpcs();
  const upcCount = upcs.length;

  // ── CSV file handler ──────────────────────────────────
  const handleFile = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setFileName(file.name);
    const reader = new FileReader();
    reader.onload = (ev) => {
      const text = ev.target?.result || '';
      // Append to existing textarea content
      const existing = rawText.trim();
      setRawText(existing ? `${existing}\n${text}` : text);
    };
    reader.readAsText(file);

    // Reset the input so the same file can be re-selected
    e.target.value = '';
  };

  // ── Clear all ─────────────────────────────────────────
  const handleClear = () => {
    setRawText('');
    setFileName(null);
    setResult(null);
    setProgress(null);
  };

  // ── Import ────────────────────────────────────────────
  const handleImport = async () => {
    if (upcCount === 0) return;

    setImporting(true);
    setResult(null);
    setProgress({ processed: 0, total: upcCount });

    try {
      const response = await authFetch('/api/admin/products/import-ce', {
        method: 'POST',
        body: JSON.stringify({ upcs }),
      });

      const data = await response.json();

      if (!response.ok || !data.success) {
        throw new Error(data.message || 'Import failed');
      }

      const r = data.data;
      setResult(r);
      setProgress({ processed: r.summary.total, total: r.summary.total });

      if (r.summary.failed > 0) {
        toast.error(`Import completed with ${r.summary.failed} error(s)`);
      } else if (r.summary.notFound > 0) {
        toast.warning(`Import done — ${r.summary.notFound} UPC(s) not found in Icecat`);
      } else {
        toast.success(`Successfully imported ${r.summary.imported + r.summary.updated} product(s)`);
      }
    } catch (err) {
      toast.error(err.message || 'Import request failed');
      setResult({ success: [], notFound: [], errors: [{ upc: '-', error: err.message }], summary: { total: upcCount, imported: 0, updated: 0, notFound: 0, failed: 1 } });
    } finally {
      setImporting(false);
    }
  };

  // ── Render ────────────────────────────────────────────
  return (
    <div style={{ padding: '30px', fontFamily: font, background: K.bg, minHeight: '100vh' }}>
      <div style={{ maxWidth: '960px', margin: '0 auto' }}>

        {/* Header */}
        <div style={{ marginBottom: '32px' }}>
          <h1 style={{
            fontSize: '28px',
            fontWeight: 700,
            color: K.midnight,
            margin: '0 0 8px 0',
            letterSpacing: '-0.02em',
          }}>
            CE Product Import
          </h1>
          <p style={{ margin: 0, fontSize: '15px', color: K.textMuted }}>
            Bulk import Consumer Electronics products from Icecat by UPC code.
          </p>
        </div>

        {/* Input Card */}
        <div style={{
          background: K.white,
          borderRadius: '12px',
          border: `1px solid ${K.border}`,
          padding: '28px',
          marginBottom: '24px',
        }}>
          {/* Textarea */}
          <label style={{ display: 'block', fontSize: '14px', fontWeight: 600, color: K.midnight, marginBottom: '8px' }}>
            UPC Codes
          </label>
          <textarea
            value={rawText}
            onChange={(e) => setRawText(e.target.value)}
            placeholder={'Paste UPC codes here, one per line...\n\n8806094994957\n0196548819492\n8806095072890'}
            rows={8}
            style={{
              width: '100%',
              padding: '14px 16px',
              border: `1px solid ${K.border}`,
              borderRadius: '8px',
              fontSize: '14px',
              fontFamily: "'DM Sans', monospace",
              resize: 'vertical',
              outline: 'none',
              background: K.bg,
              color: K.midnight,
              boxSizing: 'border-box',
              lineHeight: '1.6',
            }}
          />

          {/* File upload + UPC count row */}
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: '14px', flexWrap: 'wrap', gap: '12px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
              {/* CSV upload */}
              <input
                ref={fileRef}
                type="file"
                accept=".csv,.txt"
                onChange={handleFile}
                style={{ display: 'none' }}
              />
              <button
                onClick={() => fileRef.current?.click()}
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '6px',
                  padding: '8px 16px',
                  background: K.warm,
                  color: K.midnight,
                  border: `1px solid ${K.border}`,
                  borderRadius: '8px',
                  fontSize: '13px',
                  fontWeight: 600,
                  fontFamily: font,
                  cursor: 'pointer',
                }}
              >
                <Upload size={15} />
                Upload CSV
              </button>

              {fileName && (
                <span style={{ fontSize: '13px', color: K.textMuted }}>
                  <FileText size={13} style={{ verticalAlign: 'middle', marginRight: '4px' }} />
                  {fileName}
                </span>
              )}

              {/* Clear */}
              {rawText.length > 0 && (
                <button
                  onClick={handleClear}
                  style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: '4px',
                    padding: '8px 12px',
                    background: 'transparent',
                    color: K.textMuted,
                    border: 'none',
                    fontSize: '13px',
                    fontFamily: font,
                    cursor: 'pointer',
                  }}
                >
                  <Trash2 size={14} />
                  Clear
                </button>
              )}
            </div>

            {/* UPC count badge */}
            <div style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: '6px',
              padding: '6px 14px',
              background: upcCount > 0 ? K.cyanLt : K.warm,
              color: upcCount > 0 ? K.cyan : K.textMuted,
              borderRadius: '20px',
              fontSize: '13px',
              fontWeight: 600,
            }}>
              {upcCount > 500 ? (
                <><AlertTriangle size={14} color={K.yellow} /> {upcCount} UPCs (max 500)</>
              ) : (
                <>{upcCount} UPC{upcCount !== 1 ? 's' : ''} queued</>
              )}
            </div>
          </div>

          {/* Import button */}
          <button
            onClick={handleImport}
            disabled={importing || upcCount === 0 || upcCount > 500}
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '8px',
              width: '100%',
              marginTop: '20px',
              padding: '14px 24px',
              background: (importing || upcCount === 0 || upcCount > 500) ? K.border : K.copper,
              color: (importing || upcCount === 0 || upcCount > 500) ? K.textMuted : K.white,
              border: 'none',
              borderRadius: '10px',
              fontSize: '15px',
              fontWeight: 700,
              fontFamily: font,
              cursor: (importing || upcCount === 0 || upcCount > 500) ? 'not-allowed' : 'pointer',
              letterSpacing: '0.01em',
              transition: 'background 0.15s ease',
            }}
          >
            {importing ? (
              <>
                <Loader2 size={18} style={{ animation: 'spin 1s linear infinite' }} />
                Importing... {progress ? `${progress.processed} / ${progress.total}` : ''}
              </>
            ) : (
              <>Import {upcCount > 0 ? `${upcCount} Product${upcCount !== 1 ? 's' : ''}` : 'Products'}</>
            )}
          </button>
        </div>

        {/* Results Card */}
        {result && (
          <div style={{
            background: K.white,
            borderRadius: '12px',
            border: `1px solid ${K.border}`,
            padding: '28px',
            marginBottom: '24px',
          }}>
            <h2 style={{ fontSize: '18px', fontWeight: 700, color: K.midnight, margin: '0 0 20px 0' }}>
              Import Results
            </h2>

            {/* Summary cards */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: '14px', marginBottom: '24px' }}>
              {/* Total */}
              <StatCard label="Total" value={result.summary.total} bg={K.warm} color={K.midnight} />
              {/* Imported */}
              <StatCard label="Imported" value={result.summary.imported} bg={K.greenLt} color={K.green} icon={<CheckCircle size={16} />} />
              {/* Updated */}
              <StatCard label="Updated" value={result.summary.updated} bg={K.cyanLt} color={K.cyan} icon={<CheckCircle size={16} />} />
              {/* Not Found */}
              <StatCard label="Not Found" value={result.summary.notFound} bg={K.yellowLt} color={K.yellow} icon={<AlertTriangle size={16} />} />
              {/* Errors */}
              <StatCard label="Errors" value={result.summary.failed} bg={K.redLt} color={K.red} icon={<XCircle size={16} />} />
            </div>

            {/* Progress bar */}
            <div style={{ height: '6px', background: K.warm, borderRadius: '3px', overflow: 'hidden', marginBottom: '24px' }}>
              <div style={{
                height: '100%',
                borderRadius: '3px',
                width: `${result.summary.total > 0 ? 100 : 0}%`,
                background: result.summary.failed > 0
                  ? `linear-gradient(90deg, ${K.green} 0%, ${K.green} ${pct(result.summary.imported + result.summary.updated, result.summary.total)}%, ${K.yellow} ${pct(result.summary.imported + result.summary.updated, result.summary.total)}%, ${K.yellow} ${pct(result.summary.imported + result.summary.updated + result.summary.notFound, result.summary.total)}%, ${K.red} ${pct(result.summary.imported + result.summary.updated + result.summary.notFound, result.summary.total)}%, ${K.red} 100%)`
                  : result.summary.notFound > 0
                    ? `linear-gradient(90deg, ${K.green} 0%, ${K.green} ${pct(result.summary.imported + result.summary.updated, result.summary.total)}%, ${K.yellow} ${pct(result.summary.imported + result.summary.updated, result.summary.total)}%, ${K.yellow} 100%)`
                    : K.green,
                transition: 'width 0.4s ease',
              }} />
            </div>

            {/* Success list (brief) */}
            {result.success.length > 0 && (
              <div style={{ marginBottom: '16px' }}>
                <div style={{ fontSize: '13px', fontWeight: 600, color: K.green, marginBottom: '8px' }}>
                  <CheckCircle size={14} style={{ verticalAlign: 'middle', marginRight: '4px' }} />
                  {result.success.length} successful
                </div>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
                  {result.success.slice(0, 12).map((s, i) => (
                    <span key={i} style={{
                      display: 'inline-block',
                      padding: '3px 10px',
                      background: K.greenLt,
                      color: K.green,
                      borderRadius: '6px',
                      fontSize: '12px',
                      fontWeight: 500,
                    }}>
                      {s.upc} — {s.action === 'inserted' ? 'new' : 'updated'}
                    </span>
                  ))}
                  {result.success.length > 12 && (
                    <span style={{ fontSize: '12px', color: K.textMuted, alignSelf: 'center' }}>
                      +{result.success.length - 12} more
                    </span>
                  )}
                </div>
              </div>
            )}

            {/* Not Found — collapsible */}
            {result.notFound.length > 0 && (
              <CollapsibleSection
                title={`${result.notFound.length} not found in Icecat`}
                icon={<AlertTriangle size={14} />}
                color={K.yellow}
                bg={K.yellowLt}
                open={showNotFound}
                onToggle={() => setShowNotFound(!showNotFound)}
              >
                <table style={tableStyle}>
                  <thead>
                    <tr>
                      <th style={thStyle}>UPC</th>
                      <th style={thStyle}>Reason</th>
                    </tr>
                  </thead>
                  <tbody>
                    {result.notFound.map((nf, i) => (
                      <tr key={i} style={{ borderBottom: `1px solid ${K.border}` }}>
                        <td style={tdStyle}>{nf.upc}</td>
                        <td style={{ ...tdStyle, color: K.textMuted }}>{nf.reason}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </CollapsibleSection>
            )}

            {/* Errors — collapsible */}
            {result.errors.length > 0 && (
              <CollapsibleSection
                title={`${result.errors.length} error(s)`}
                icon={<XCircle size={14} />}
                color={K.red}
                bg={K.redLt}
                open={showErrors}
                onToggle={() => setShowErrors(!showErrors)}
              >
                <table style={tableStyle}>
                  <thead>
                    <tr>
                      <th style={thStyle}>UPC</th>
                      <th style={thStyle}>Error</th>
                    </tr>
                  </thead>
                  <tbody>
                    {result.errors.map((e, i) => (
                      <tr key={i} style={{ borderBottom: `1px solid ${K.border}` }}>
                        <td style={tdStyle}>{e.upc}</td>
                        <td style={{ ...tdStyle, color: K.red }}>{e.error}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </CollapsibleSection>
            )}
          </div>
        )}
      </div>

      {/* Spinner keyframe (injected once) */}
      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  );
};

// ── Sub-components ──────────────────────────────────────────

function StatCard({ label, value, bg, color, icon }) {
  return (
    <div style={{
      padding: '16px 18px',
      background: bg,
      borderRadius: '10px',
      display: 'flex',
      alignItems: 'center',
      gap: '10px',
    }}>
      {icon && <span style={{ color, flexShrink: 0 }}>{icon}</span>}
      <div>
        <div style={{ fontSize: '22px', fontWeight: 700, color, lineHeight: 1.1 }}>{value}</div>
        <div style={{ fontSize: '12px', fontWeight: 500, color: K.textMuted, marginTop: '2px' }}>{label}</div>
      </div>
    </div>
  );
}

function CollapsibleSection({ title, icon, color, bg, open, onToggle, children }) {
  return (
    <div style={{ marginBottom: '12px', borderRadius: '8px', overflow: 'hidden', border: `1px solid ${K.border}` }}>
      <button
        onClick={onToggle}
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: '8px',
          width: '100%',
          padding: '12px 16px',
          background: bg,
          color,
          border: 'none',
          fontSize: '13px',
          fontWeight: 600,
          fontFamily: "'DM Sans', system-ui, sans-serif",
          cursor: 'pointer',
          textAlign: 'left',
        }}
      >
        {icon}
        <span>{title}</span>
        <span style={{ marginLeft: 'auto' }}>
          {open ? <ChevronDown size={15} /> : <ChevronRight size={15} />}
        </span>
      </button>
      {open && (
        <div style={{ padding: '0', background: K.white }}>
          {children}
        </div>
      )}
    </div>
  );
}

// ── Helpers ─────────────────────────────────────────────────

function pct(num, total) {
  if (!total) return 0;
  return Math.round((num / total) * 100);
}

const tableStyle = {
  width: '100%',
  borderCollapse: 'collapse',
  fontSize: '13px',
};

const thStyle = {
  padding: '10px 16px',
  textAlign: 'left',
  fontSize: '11px',
  fontWeight: 700,
  color: K.textMuted,
  textTransform: 'uppercase',
  letterSpacing: '0.04em',
  borderBottom: `2px solid ${K.border}`,
};

const tdStyle = {
  padding: '10px 16px',
  verticalAlign: 'middle',
  color: K.midnight,
};

export default CEProductImport;
