/**
 * TeleTime - Chargeback Detail View
 * Full chargeback lifecycle detail with transaction info, defense strategy,
 * evidence management (file upload + auto-populated), status timeline,
 * and internal comments thread.
 */

import React, { useState, useEffect, useCallback, useRef } from 'react';
import { authFetch } from '../../services/authFetch';

const API_URL = process.env.REACT_APP_API_URL || '';

// ============================================================================
// DEFENSE STRATEGIES BY REASON CODE
// ============================================================================

const DEFENSE_STRATEGIES = {
  // Visa
  '10.1': { category: 'EMV Counterfeit', strategy: 'Provide EMV chip transaction log proving chip was read. Include terminal certification records and point-of-interaction evidence showing EMV-compliant processing.' },
  '10.4': { category: 'Unauthorized (Card-Absent)', strategy: 'Provide authorization log, AVS/CVV match results, customer verification records (signed receipt, IP address, device fingerprint), and any 3-D Secure authentication evidence.' },
  '11.3': { category: 'No Authorization', strategy: 'Provide proof of valid authorization code from the issuer, including timestamp and amount authorized. Include processor logs showing approval response.' },
  '12.6': { category: 'Duplicate / Paid by Other Means', strategy: 'Provide documentation showing each transaction is a separate purchase. Include unique invoice numbers, different items, or separate customer requests.' },
  '13.1': { category: 'Not Received', strategy: 'Provide delivery confirmation with signature and GPS proof. Include tracking number, carrier confirmation, and photo evidence of delivery if available.' },
  '13.2': { category: 'Cancelled Recurring', strategy: 'Provide signed recurring billing agreement, cancellation policy, and evidence the customer did not cancel before the billing date.' },
  '13.3': { category: 'Not as Described', strategy: 'Provide product listing snapshot, return policy acknowledgment, customer communication log showing the product matched the description. Include photos of the actual item shipped.' },
  '13.6': { category: 'Credit Not Processed', strategy: 'Provide evidence the credit/refund was already processed, or evidence the return does not qualify per your posted policy.' },
  '13.7': { category: 'Cancelled Services', strategy: 'Provide cancellation policy terms accepted by cardholder and proof that services were provided before cancellation request.' },
  // Mastercard
  '4837': { category: 'No Cardholder Authorization', strategy: 'Provide authorization log, AVS/CVV results, and customer verification records. Include signed receipt or cardholder acknowledgment of the transaction.' },
  '4853': { category: 'Not as Described', strategy: 'Provide product listing snapshot, return policy acknowledgment, customer communication log. Include evidence the product matched the listing description.' },
  '4855': { category: 'Not Provided', strategy: 'Provide delivery confirmation with signature and GPS proof. Include shipping records, tracking information, and evidence of successful delivery.' },
  '4860': { category: 'Credit Not Processed', strategy: 'Provide proof the credit/refund was already processed with transaction reference number, or evidence the return does not qualify per your posted policy.' },
  '4863': { category: 'Does Not Recognize', strategy: 'Provide clear transaction descriptor information, signed receipt, and any customer communication acknowledging the purchase.' },
  '4871': { category: 'Chip/PIN Liability Shift', strategy: 'Provide EMV chip transaction log proving chip was read and PIN verified. Include terminal certification and compliance records.' },
  // Amex
  'C02': { category: 'Credit Not Processed', strategy: 'Provide evidence the credit/refund was already processed with Amex reference number, or that the return does not qualify per policy.' },
  'C08': { category: 'Not Received', strategy: 'Provide delivery confirmation with signature and GPS proof, tracking number, carrier confirmation, and proof of delivery.' },
  'C31': { category: 'Not as Described', strategy: 'Provide product listing snapshot, return policy acknowledgment, customer communication log. Include evidence the item was accurately described.' },
  'C32': { category: 'Damaged/Defective', strategy: 'Provide evidence the product was shipped in good condition (packing photos, quality inspection records). Include return/exchange policy offered to customer.' },
  'F24': { category: 'No Cardholder Authorization', strategy: 'Provide authorization code, AVS/CVV match results, signed receipt, and any evidence the cardholder participated in and authorized the transaction.' },
  'F29': { category: 'Card Not Present', strategy: 'Provide evidence of cardholder authentication: IP address, device fingerprint, shipping-to-billing match, purchase history, and any 3-D Secure data.' },
};

const getDefenseStrategy = (reasonCode) => {
  if (!reasonCode) return null;
  return DEFENSE_STRATEGIES[reasonCode] || null;
};

// ============================================================================
// CONSTANTS
// ============================================================================

const STATUS_CONFIG = {
  pre_alert: { label: 'Pre-Alert', color: '#8b5cf6', bg: '#ede9fe' },
  received: { label: 'Received', color: '#3b82f6', bg: '#dbeafe' },
  under_review: { label: 'Under Review', color: '#f59e0b', bg: '#fef3c7' },
  evidence_submitted: { label: 'Evidence Submitted', color: '#6366f1', bg: '#e0e7ff' },
  won: { label: 'Won', color: '#10b981', bg: '#d1fae5' },
  lost: { label: 'Lost', color: '#ef4444', bg: '#fee2e2' },
  expired: { label: 'Expired', color: '#6b7280', bg: '#f3f4f6' },
  accepted: { label: 'Accepted', color: '#9ca3af', bg: '#f3f4f6' },
};

const EVIDENCE_TYPES = [
  { value: 'receipt', label: 'Transaction Receipt' },
  { value: 'signature', label: 'Customer Signature' },
  { value: 'delivery_proof', label: 'Delivery Confirmation' },
  { value: 'communication', label: 'Customer Communication' },
  { value: 'avs_cvv', label: 'AVS/CVV Results' },
  { value: 'authorization', label: 'Authorization Log' },
  { value: 'emv_log', label: 'EMV Chip Log' },
  { value: 'return_policy', label: 'Return Policy' },
  { value: 'product_listing', label: 'Product Listing' },
  { value: 'customer_history', label: 'Customer History' },
  { value: 'cctv', label: 'CCTV Footage' },
  { value: 'other', label: 'Other' },
];

const formatCurrency = (val) => {
  const num = parseFloat(val) || 0;
  return `$${num.toLocaleString('en-CA', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
};

const formatDate = (d) => {
  if (!d) return '-';
  return new Date(d).toLocaleDateString('en-CA', { month: 'short', day: 'numeric', year: 'numeric' });
};

const formatDateTime = (d) => {
  if (!d) return '-';
  return new Date(d).toLocaleDateString('en-CA', {
    month: 'short', day: 'numeric', year: 'numeric', hour: '2-digit', minute: '2-digit',
  });
};

const getDeadlineDays = (deadline) => {
  if (!deadline) return null;
  return Math.ceil((new Date(deadline) - new Date()) / 86400000);
};

// ============================================================================
// SECTION WRAPPER
// ============================================================================

function Section({ title, children, style, collapsible, defaultOpen = true }) {
  const [open, setOpen] = useState(defaultOpen);

  return (
    <div style={{
      background: 'white', borderRadius: '10px', border: '1px solid #e5e7eb',
      marginBottom: '16px', overflow: 'hidden', ...style,
    }}>
      <div
        onClick={collapsible ? () => setOpen(!open) : undefined}
        style={{
          padding: '14px 20px', borderBottom: open ? '1px solid #e5e7eb' : 'none',
          display: 'flex', justifyContent: 'space-between', alignItems: 'center',
          cursor: collapsible ? 'pointer' : 'default',
          background: '#fafafa',
        }}
      >
        <h3 style={{ margin: 0, fontSize: '15px', fontWeight: 600, color: '#111827' }}>{title}</h3>
        {collapsible && <span style={{ color: '#9ca3af', fontSize: '18px' }}>{open ? '\u25B2' : '\u25BC'}</span>}
      </div>
      {open && <div style={{ padding: '16px 20px' }}>{children}</div>}
    </div>
  );
}

// ============================================================================
// INFO ROW
// ============================================================================

function InfoRow({ label, value, color }) {
  return (
    <div style={{ display: 'flex', padding: '6px 0', borderBottom: '1px solid #f3f4f6' }}>
      <span style={{ width: '160px', fontSize: '13px', color: '#6b7280', fontWeight: 500, flexShrink: 0 }}>{label}</span>
      <span style={{ fontSize: '13px', color: color || '#111827', fontWeight: value ? 400 : 300 }}>{value || '-'}</span>
    </div>
  );
}

// ============================================================================
// MAIN COMPONENT
// ============================================================================

export default function ChargebackDetail({ chargebackId, onBack }) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [comment, setComment] = useState('');
  const [submittingComment, setSubmittingComment] = useState(false);
  const [uploadType, setUploadType] = useState('receipt');
  const [uploadDesc, setUploadDesc] = useState('');
  const [uploadFile, setUploadFile] = useState(null);
  const [uploading, setUploading] = useState(false);
  const [statusChanging, setStatusChanging] = useState(false);
  const fileInputRef = useRef(null);

  const fetchDetail = useCallback(async () => {
    setLoading(true);
    try {
      const resp = await authFetch(`${API_URL}/api/chargebacks/${chargebackId}`);
      const json = await resp.json();
      if (json.success) setData(json.data);
    } catch { /* ignore */ }
    setLoading(false);
  }, [chargebackId]);

  useEffect(() => { fetchDetail(); }, [fetchDetail]);

  // ---- Status change ----
  const handleStatusChange = async (newStatus) => {
    setStatusChanging(true);
    try {
      await authFetch(`${API_URL}/api/chargebacks/${chargebackId}`, {
        method: 'PUT',
        body: JSON.stringify({ status: newStatus }),
      });
      fetchDetail();
    } catch { /* ignore */ }
    setStatusChanging(false);
  };

  // ---- Comment submit ----
  const handleCommentSubmit = async () => {
    if (!comment.trim()) return;
    setSubmittingComment(true);
    try {
      await authFetch(`${API_URL}/api/chargebacks/${chargebackId}/comments`, {
        method: 'POST',
        body: JSON.stringify({ comment: comment.trim() }),
      });
      setComment('');
      fetchDetail();
    } catch { /* ignore */ }
    setSubmittingComment(false);
  };

  // ---- Evidence upload ----
  const handleUpload = async () => {
    setUploading(true);
    try {
      const formData = new FormData();
      formData.append('evidence_type', uploadType);
      if (uploadDesc) formData.append('description', uploadDesc);
      if (uploadFile) formData.append('file', uploadFile);

      await authFetch(`${API_URL}/api/chargebacks/${chargebackId}/evidence`, {
        method: 'POST',
        body: formData,
      });
      setUploadFile(null);
      setUploadDesc('');
      if (fileInputRef.current) fileInputRef.current.value = '';
      fetchDetail();
    } catch { /* ignore */ }
    setUploading(false);
  };

  // ---- Loading state ----
  if (loading) {
    return (
      <div style={{ display: 'flex', justifyContent: 'center', padding: '60px 0' }}>
        <div style={{
          width: '40px', height: '40px', border: '3px solid #e5e7eb',
          borderTopColor: '#667eea', borderRadius: '50%',
          animation: 'cbdspin 0.8s linear infinite',
        }} />
        <style>{`@keyframes cbdspin { to { transform: rotate(360deg); } }`}</style>
      </div>
    );
  }

  if (!data) {
    return <p style={{ textAlign: 'center', color: '#ef4444', padding: '40px 0' }}>Chargeback not found</p>;
  }

  const statusCfg = STATUS_CONFIG[data.status] || STATUS_CONFIG.received;
  const deadlineDays = getDeadlineDays(data.response_deadline);
  const defense = getDefenseStrategy(data.reason_code);
  const autoEvidence = (data.evidence || []).filter(e => e.is_auto_populated);
  const manualEvidence = (data.evidence || []).filter(e => !e.is_auto_populated);

  // Available status transitions
  const transitions = [];
  if (data.status === 'received') transitions.push({ to: 'under_review', label: 'Start Review', color: '#f59e0b' });
  if (data.status === 'under_review') transitions.push({ to: 'evidence_submitted', label: 'Mark Evidence Submitted', color: '#6366f1' });
  if (data.status === 'evidence_submitted') {
    transitions.push({ to: 'won', label: 'Won', color: '#10b981' });
    transitions.push({ to: 'lost', label: 'Lost', color: '#ef4444' });
  }
  if (['received', 'under_review'].includes(data.status)) {
    transitions.push({ to: 'accepted', label: 'Accept (No Dispute)', color: '#9ca3af' });
  }

  return (
    <div>
      {/* ---- BACK BUTTON + HEADER ---- */}
      <div style={{ marginBottom: '20px' }}>
        <button onClick={onBack} style={{
          padding: '6px 14px', background: 'white', border: '1px solid #d1d5db',
          borderRadius: '6px', cursor: 'pointer', fontSize: '13px', fontWeight: 500,
          color: '#374151', marginBottom: '12px',
        }}>&larr; Back to Pipeline</button>

        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: '12px' }}>
          <div>
            <h2 style={{ margin: '0 0 6px', fontSize: '22px', fontWeight: 700, color: '#111827' }}>
              Chargeback #{data.case_number || data.id}
            </h2>
            <div style={{ display: 'flex', gap: '10px', alignItems: 'center', flexWrap: 'wrap' }}>
              <span style={{
                padding: '4px 14px', borderRadius: '16px', fontSize: '13px', fontWeight: 600,
                background: statusCfg.bg, color: statusCfg.color,
              }}>{statusCfg.label}</span>
              <span style={{ fontSize: '24px', fontWeight: 700, color: '#111827' }}>{formatCurrency(data.amount)}</span>
              {data.card_brand && (
                <span style={{ fontSize: '14px', fontWeight: 500, color: '#6b7280' }}>{data.card_brand}</span>
              )}
              {deadlineDays !== null && (
                <span style={{
                  fontSize: '13px', fontWeight: 700, padding: '3px 10px', borderRadius: '6px',
                  color: deadlineDays < 0 ? '#111827' : deadlineDays < 7 ? '#ef4444' : deadlineDays <= 15 ? '#f59e0b' : '#10b981',
                  background: deadlineDays < 7 ? '#fef2f2' : '#f0fdf4',
                }}>
                  {deadlineDays < 0 ? `${Math.abs(deadlineDays)}d overdue` : `${deadlineDays}d remaining`}
                </span>
              )}
            </div>
          </div>

          {/* Status transition buttons */}
          {transitions.length > 0 && (
            <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
              {transitions.map(t => (
                <button key={t.to} onClick={() => handleStatusChange(t.to)} disabled={statusChanging} style={{
                  padding: '8px 16px', border: 'none', borderRadius: '6px',
                  background: statusChanging ? '#d1d5db' : t.color, color: 'white',
                  cursor: statusChanging ? 'default' : 'pointer', fontWeight: 500, fontSize: '13px',
                }}>{t.label}</button>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* ---- TWO COLUMN LAYOUT ---- */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
        {/* LEFT COLUMN */}
        <div>
          {/* Transaction Details */}
          <Section title="Transaction Details">
            <InfoRow label="Transaction #" value={data.transaction_number} />
            <InfoRow label="Transaction Amount" value={formatCurrency(data.transaction_amount)} />
            <InfoRow label="Transaction Date" value={formatDateTime(data.transaction_date)} />
            <InfoRow label="Transaction Status" value={data.transaction_status} />
            <InfoRow label="Payment Method" value={data.payment_method} />
            <InfoRow label="Card" value={data.card_last_four ? `****${data.card_last_four}` : '-'} />
            <InfoRow label="Card Brand" value={data.payment_card_brand || data.card_brand} />
            <InfoRow label="Authorization Code" value={data.authorization_code} />
            <InfoRow label="Processor Ref" value={data.processor_reference} />
            <InfoRow label="Cashier" value={data.cashier_name} />
            <InfoRow label="Customer" value={data.customer_name} />
            <InfoRow label="Customer Email" value={data.customer_email} />
            <InfoRow label="Customer Phone" value={data.customer_phone} />
          </Section>

          {/* Chargeback Details */}
          <Section title="Chargeback Details">
            <InfoRow label="Case Number" value={data.case_number} />
            <InfoRow label="Moneris Case ID" value={data.moneris_case_id} />
            <InfoRow label="Dispute Amount" value={formatCurrency(data.amount)} color="#ef4444" />
            <InfoRow label="Card Brand" value={data.card_brand} />
            <InfoRow label="Reason Code" value={data.reason_code} />
            <InfoRow label="Reason" value={data.reason_description} />
            <InfoRow label="Source" value={data.source || 'Manual'} />
            <InfoRow label="Received Date" value={formatDate(data.received_at)} />
            <InfoRow label="Response Deadline" value={formatDate(data.response_deadline)} color={deadlineDays !== null && deadlineDays < 7 ? '#ef4444' : undefined} />
            <InfoRow label="Assigned To" value={data.assigned_name} />
            <InfoRow label="Evidence Submitted" value={formatDateTime(data.evidence_submitted_at)} />
            <InfoRow label="Resolved" value={formatDateTime(data.resolved_at)} />
            <InfoRow label="Response Days" value={data.response_days ? `${data.response_days} days` : '-'} />
            {data.notes && (
              <div style={{ marginTop: '8px', padding: '10px', background: '#f9fafb', borderRadius: '6px' }}>
                <p style={{ margin: 0, fontSize: '13px', color: '#374151', whiteSpace: 'pre-wrap' }}>{data.notes}</p>
              </div>
            )}
          </Section>

          {/* Fraud Score */}
          {data.fraud_score && (
            <Section title="Fraud Score Data" collapsible defaultOpen={false}>
              <InfoRow label="Score" value={`${data.fraud_score.score}/100`} color={data.fraud_score.score >= 60 ? '#ef4444' : '#10b981'} />
              <InfoRow label="Risk Level" value={data.fraud_score.risk_level} />
              <InfoRow label="AVS Result" value={data.fraud_score.avs_result} />
              <InfoRow label="CVV Result" value={data.fraud_score.cvv_result} />
              <InfoRow label="Entry Method" value={data.fraud_score.entry_method} />
              <InfoRow label="Card BIN" value={data.fraud_score.card_bin} />
              {data.fraud_score.signals && (
                <div style={{ marginTop: '8px' }}>
                  <p style={{ fontSize: '13px', fontWeight: 500, color: '#6b7280', marginBottom: '6px' }}>Signals:</p>
                  {Object.entries(data.fraud_score.signals).map(([key, val]) => (
                    val ? <InfoRow key={key} label={key.replace(/_/g, ' ')} value={String(val)} /> : null
                  ))}
                </div>
              )}
            </Section>
          )}
        </div>

        {/* RIGHT COLUMN */}
        <div>
          {/* Defense Strategy */}
          {defense && (
            <Section title="Recommended Defense Strategy">
              <div style={{
                padding: '14px', background: '#f0f4ff', borderRadius: '8px',
                border: '1px solid #c7d2fe',
              }}>
                <p style={{ margin: '0 0 6px', fontSize: '13px', fontWeight: 600, color: '#4338ca' }}>
                  {data.reason_code} — {defense.category}
                </p>
                <p style={{ margin: 0, fontSize: '13px', color: '#374151', lineHeight: '1.5' }}>
                  {defense.strategy}
                </p>
              </div>
            </Section>
          )}

          {/* Evidence — Auto-Populated */}
          {autoEvidence.length > 0 && (
            <Section title={`Auto-Populated Evidence (${autoEvidence.length})`} collapsible>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                {autoEvidence.map(ev => (
                  <div key={ev.id} style={{
                    padding: '10px 14px', background: '#f0fdf4', borderRadius: '6px',
                    border: '1px solid #bbf7d0',
                  }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '4px' }}>
                      <span style={{ fontSize: '12px', fontWeight: 600, color: '#059669', textTransform: 'uppercase' }}>
                        {ev.evidence_type.replace(/_/g, ' ')}
                      </span>
                      <span style={{ fontSize: '11px', color: '#6b7280' }}>Auto</span>
                    </div>
                    <p style={{ margin: 0, fontSize: '13px', color: '#374151', lineHeight: '1.4' }}>{ev.description}</p>
                  </div>
                ))}
              </div>
            </Section>
          )}

          {/* Evidence — Manual Uploads */}
          <Section title={`Evidence Files (${manualEvidence.length})`}>
            {manualEvidence.length > 0 && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', marginBottom: '16px' }}>
                {manualEvidence.map(ev => (
                  <div key={ev.id} style={{
                    padding: '10px 14px', background: '#f9fafb', borderRadius: '6px',
                    border: '1px solid #e5e7eb', display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                  }}>
                    <div>
                      <p style={{ margin: '0 0 2px', fontSize: '13px', fontWeight: 500, color: '#111827' }}>
                        {ev.evidence_type.replace(/_/g, ' ')}
                      </p>
                      {ev.description && <p style={{ margin: '0 0 2px', fontSize: '12px', color: '#6b7280' }}>{ev.description}</p>}
                      <p style={{ margin: 0, fontSize: '11px', color: '#9ca3af' }}>
                        {ev.uploaded_by_name} &bull; {formatDateTime(ev.created_at)}
                        {ev.file_size ? ` \u2022 ${(ev.file_size / 1024).toFixed(0)}KB` : ''}
                      </p>
                    </div>
                    {ev.file_path && (
                      <a href={`${API_URL}${ev.file_path}`} target="_blank" rel="noopener noreferrer" style={{
                        padding: '4px 12px', background: '#667eea', color: 'white', borderRadius: '4px',
                        fontSize: '12px', fontWeight: 500, textDecoration: 'none',
                      }}>View</a>
                    )}
                  </div>
                ))}
              </div>
            )}

            {/* Upload form */}
            <div style={{
              padding: '14px', background: '#f9fafb', borderRadius: '8px',
              border: '1px dashed #d1d5db',
            }}>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px', marginBottom: '10px' }}>
                <div>
                  <label style={{ fontSize: '12px', fontWeight: 500, color: '#6b7280', display: 'block', marginBottom: '4px' }}>Type</label>
                  <select value={uploadType} onChange={e => setUploadType(e.target.value)} style={{
                    width: '100%', padding: '6px 10px', border: '1px solid #d1d5db',
                    borderRadius: '6px', fontSize: '13px', boxSizing: 'border-box',
                  }}>
                    {EVIDENCE_TYPES.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
                  </select>
                </div>
                <div>
                  <label style={{ fontSize: '12px', fontWeight: 500, color: '#6b7280', display: 'block', marginBottom: '4px' }}>File (PDF, JPEG, PNG — max 10MB)</label>
                  <input ref={fileInputRef} type="file" accept=".pdf,.jpg,.jpeg,.png"
                    onChange={e => setUploadFile(e.target.files?.[0] || null)}
                    style={{ fontSize: '12px' }}
                  />
                </div>
              </div>
              <input
                value={uploadDesc}
                onChange={e => setUploadDesc(e.target.value)}
                placeholder="Description (optional)"
                style={{
                  width: '100%', padding: '6px 10px', border: '1px solid #d1d5db',
                  borderRadius: '6px', fontSize: '13px', marginBottom: '10px', boxSizing: 'border-box',
                }}
              />
              <button onClick={handleUpload} disabled={uploading || !uploadFile} style={{
                padding: '6px 14px', background: uploading || !uploadFile ? '#d1d5db' : '#667eea',
                color: 'white', border: 'none', borderRadius: '6px',
                cursor: uploading || !uploadFile ? 'default' : 'pointer', fontWeight: 500, fontSize: '13px',
              }}>{uploading ? 'Uploading...' : 'Upload Evidence'}</button>
            </div>
          </Section>

          {/* Timeline */}
          <Section title="Timeline" collapsible>
            <div style={{ position: 'relative', paddingLeft: '24px' }}>
              {/* Vertical line */}
              <div style={{
                position: 'absolute', left: '7px', top: '4px', bottom: '4px',
                width: '2px', background: '#e5e7eb',
              }} />

              {(data.timeline || []).map((event, idx) => {
                const cfg = STATUS_CONFIG[event.to_status] || {};
                return (
                  <div key={idx} style={{
                    position: 'relative', marginBottom: '16px',
                    paddingBottom: idx < data.timeline.length - 1 ? '0' : '0',
                  }}>
                    {/* Dot */}
                    <div style={{
                      position: 'absolute', left: '-20px', top: '3px',
                      width: '12px', height: '12px', borderRadius: '50%',
                      background: cfg.color || '#6b7280', border: '2px solid white',
                      boxShadow: '0 0 0 2px #e5e7eb',
                    }} />
                    <div>
                      <div style={{ display: 'flex', gap: '8px', alignItems: 'center', marginBottom: '2px' }}>
                        {event.from_status && (
                          <>
                            <span style={{ fontSize: '12px', color: '#9ca3af' }}>{STATUS_CONFIG[event.from_status]?.label || event.from_status}</span>
                            <span style={{ fontSize: '12px', color: '#d1d5db' }}>&rarr;</span>
                          </>
                        )}
                        <span style={{ fontSize: '13px', fontWeight: 600, color: cfg.color || '#374151' }}>
                          {cfg.label || event.to_status}
                        </span>
                      </div>
                      <p style={{ margin: '0 0 2px', fontSize: '12px', color: '#6b7280' }}>
                        {event.changed_by_name || 'System'} &bull; {formatDateTime(event.created_at)}
                      </p>
                      {event.notes && (
                        <p style={{ margin: 0, fontSize: '12px', color: '#4b5563', fontStyle: 'italic' }}>{event.notes}</p>
                      )}
                    </div>
                  </div>
                );
              })}

              {(!data.timeline || data.timeline.length === 0) && (
                <p style={{ color: '#9ca3af', fontSize: '13px' }}>No status changes recorded</p>
              )}
            </div>
          </Section>

          {/* Comments */}
          <Section title={`Comments (${(data.comments || []).length})`}>
            <div style={{ maxHeight: '300px', overflowY: 'auto', marginBottom: '12px' }}>
              {(data.comments || []).map(c => (
                <div key={c.id} style={{
                  padding: '10px 14px', marginBottom: '8px',
                  background: '#f9fafb', borderRadius: '8px',
                }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '4px' }}>
                    <span style={{ fontSize: '13px', fontWeight: 600, color: '#111827' }}>{c.user_name}</span>
                    <span style={{ fontSize: '11px', color: '#9ca3af' }}>{formatDateTime(c.created_at)}</span>
                  </div>
                  <p style={{ margin: 0, fontSize: '13px', color: '#374151', whiteSpace: 'pre-wrap', lineHeight: '1.4' }}>{c.comment}</p>
                </div>
              ))}
              {(!data.comments || data.comments.length === 0) && (
                <p style={{ color: '#9ca3af', fontSize: '13px', textAlign: 'center', padding: '10px 0' }}>No comments yet</p>
              )}
            </div>
            <div style={{ display: 'flex', gap: '8px' }}>
              <input
                value={comment}
                onChange={e => setComment(e.target.value)}
                placeholder="Add a comment..."
                onKeyDown={e => e.key === 'Enter' && handleCommentSubmit()}
                style={{
                  flex: 1, padding: '8px 12px', border: '1px solid #d1d5db',
                  borderRadius: '6px', fontSize: '13px',
                }}
              />
              <button onClick={handleCommentSubmit} disabled={submittingComment || !comment.trim()} style={{
                padding: '8px 14px', background: submittingComment || !comment.trim() ? '#d1d5db' : '#667eea',
                color: 'white', border: 'none', borderRadius: '6px',
                cursor: submittingComment || !comment.trim() ? 'default' : 'pointer', fontWeight: 500, fontSize: '13px',
              }}>{submittingComment ? '...' : 'Post'}</button>
            </div>
          </Section>
        </div>
      </div>
    </div>
  );
}
