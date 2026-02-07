import SignatureCapture from './SignatureCapture';

/**
 * Full-screen modal overlay for signature capture during delivery confirmation.
 *
 * Props:
 *   customerName  — pre-filled signer name
 *   onComplete    — ({ signature_image, signer_name, relationship, signed_at }) => void
 *   onCancel      — () => void
 */
export default function SignatureModal({ customerName, onComplete, onCancel }) {
  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-black/50">
      <div className="flex flex-1 flex-col overflow-y-auto">
        <div className="mt-auto w-full rounded-t-2xl bg-white px-5 pb-8 pt-5 shadow-2xl">
          {/* Header */}
          <div className="mb-4 flex items-center justify-between">
            <h2 className="text-lg font-bold text-slate-900">Delivery Signature</h2>
            <button onClick={onCancel} className="text-sm font-medium text-slate-400">
              Cancel
            </button>
          </div>

          {/* Delivery confirmation context */}
          <div className="mb-4 rounded-lg bg-blue-50 px-3 py-2">
            <p className="text-xs text-blue-700">
              By signing, the recipient confirms all items have been received in acceptable condition.
            </p>
          </div>

          {/* Signature capture */}
          <SignatureCapture
            customerName={customerName}
            onComplete={onComplete}
            onCancel={onCancel}
            instructions="Please sign below to confirm delivery"
          />
        </div>
      </div>
    </div>
  );
}
