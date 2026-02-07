import { useRef, useState, useEffect, useCallback } from 'react';
import SignatureCanvas from 'react-signature-canvas';

const RELATIONSHIPS = [
  { value: 'customer', label: 'Customer' },
  { value: 'spouse', label: 'Spouse / Partner' },
  { value: 'family', label: 'Family Member' },
  { value: 'staff', label: 'Building Staff' },
  { value: 'other', label: 'Other' },
];

/**
 * Signature capture pad with signer name and relationship fields.
 *
 * Props:
 *   customerName  — pre-filled signer name
 *   onComplete    — ({ signature_image, signer_name, relationship, signed_at }) => void
 *   onCancel      — () => void
 *   instructions  — optional instruction text
 */
export default function SignatureCapture({ customerName, onComplete, onCancel, instructions }) {
  const sigRef = useRef(null);
  const containerRef = useRef(null);
  const [signerName, setSignerName] = useState(customerName || '');
  const [relationship, setRelationship] = useState('customer');
  const [hasSig, setHasSig] = useState(false);
  const [canvasSize, setCanvasSize] = useState({ width: 500, height: 200 });

  // Responsive canvas sizing
  const updateSize = useCallback(() => {
    if (containerRef.current) {
      const w = containerRef.current.offsetWidth;
      setCanvasSize({ width: w, height: Math.max(160, Math.round(w * 0.4)) });
    }
  }, []);

  useEffect(() => {
    updateSize();
    window.addEventListener('resize', updateSize);
    return () => window.removeEventListener('resize', updateSize);
  }, [updateSize]);

  // Re-render canvas when size changes (clears it)
  useEffect(() => {
    if (sigRef.current) {
      setHasSig(false);
    }
  }, [canvasSize.width, canvasSize.height]);

  function handleClear() {
    sigRef.current?.clear();
    setHasSig(false);
  }

  function handleEnd() {
    if (sigRef.current && !sigRef.current.isEmpty()) {
      setHasSig(true);
    }
  }

  function handleAccept() {
    if (!sigRef.current || sigRef.current.isEmpty()) return;
    if (!signerName.trim()) return;

    const signatureData = sigRef.current.getTrimmedCanvas().toDataURL('image/png');
    onComplete({
      signature_image: signatureData,
      signer_name: signerName.trim(),
      relationship,
      signed_at: new Date().toISOString(),
    });
  }

  const canSubmit = hasSig && signerName.trim().length > 0;

  return (
    <div className="flex flex-col gap-4">
      {/* Instructions */}
      <p className="text-center text-sm text-slate-500">
        {instructions || 'Please sign below to confirm delivery'}
      </p>

      {/* Signature pad */}
      <div ref={containerRef} className="overflow-hidden rounded-xl border-2 border-dashed border-slate-300 bg-white">
        <SignatureCanvas
          ref={sigRef}
          onEnd={handleEnd}
          penColor="#1e293b"
          minWidth={1.5}
          maxWidth={3}
          velocityFilterWeight={0.7}
          canvasProps={{
            width: canvasSize.width,
            height: canvasSize.height,
            className: 'touch-none',
            style: { width: '100%', height: canvasSize.height },
          }}
        />
        {/* Signature line */}
        <div className="mx-4 mb-2 border-t border-slate-300" />
        <p className="mb-2 text-center text-[10px] text-slate-400">Sign above</p>
      </div>

      {/* Clear button */}
      <div className="flex justify-end">
        <button
          onClick={handleClear}
          className="rounded-lg px-3 py-1.5 text-xs font-medium text-slate-500 hover:bg-slate-100"
        >
          Clear Signature
        </button>
      </div>

      {/* Signer name */}
      <div>
        <label className="mb-1 block text-xs font-medium text-slate-500">Signer Name</label>
        <input
          type="text"
          value={signerName}
          onChange={(e) => setSignerName(e.target.value)}
          placeholder="Full name of person signing"
          className="w-full rounded-lg border border-slate-200 px-3 py-2.5 text-sm text-slate-800 placeholder:text-slate-300 focus:border-blue-400 focus:outline-none"
        />
      </div>

      {/* Relationship */}
      <div>
        <label className="mb-1 block text-xs font-medium text-slate-500">Relationship to Customer</label>
        <div className="flex flex-wrap gap-2">
          {RELATIONSHIPS.map((r) => (
            <button
              key={r.value}
              onClick={() => setRelationship(r.value)}
              className={`rounded-full border px-3 py-1.5 text-xs font-medium transition-colors ${
                relationship === r.value
                  ? 'border-blue-300 bg-blue-50 text-blue-700'
                  : 'border-slate-200 bg-white text-slate-600'
              }`}
            >
              {r.label}
            </button>
          ))}
        </div>
      </div>

      {/* Actions */}
      <div className="flex gap-3 pt-1">
        <button
          onClick={onCancel}
          className="flex-1 rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm font-semibold text-slate-600"
        >
          Cancel
        </button>
        <button
          onClick={handleAccept}
          disabled={!canSubmit}
          className="flex-1 rounded-xl bg-green-600 px-4 py-3 text-sm font-bold text-white shadow-lg disabled:opacity-40"
        >
          Accept Signature
        </button>
      </div>
    </div>
  );
}
