import { useState, useEffect, useRef } from 'react';
import PhotoCapture from './PhotoCapture';
import PhotoGallery from './PhotoGallery';
import SignatureCapture from './SignatureCapture';
import CompletionChecklist, { isChecklistComplete } from './CompletionChecklist';
import CompletionSummary from './CompletionSummary';

const STEPS = ['photos', 'signature', 'checklist', 'review', 'submitting', 'success'];

/**
 * Full-screen delivery completion workflow.
 *
 * Steps:  photos → signature → checklist → review → submit → success → auto-advance
 *
 * Props:
 *   delivery         — delivery object
 *   items            — order items array
 *   initialPhotos    — photos already captured during in_progress phase
 *   onSubmit         — async (payload) => { next_delivery }
 *   onCancel         — () => void
 *   onGoToNext       — (nextDeliveryId) => void  — navigate to next stop
 *   onGoToRoute      — () => void                 — navigate back to route list
 *   onOpenCamera     — () => void  (not used internally — camera inline)
 */
export default function DeliveryCompletionScreen({
  delivery,
  items = [],
  initialPhotos = [],
  onSubmit,
  onCancel,
  onGoToNext,
  onGoToRoute,
}) {
  const [step, setStep] = useState('photos');
  const [photos, setPhotos] = useState(initialPhotos);
  const [showCamera, setShowCamera] = useState(false);
  const [signatureData, setSignatureData] = useState(null);
  const [checklist, setChecklist] = useState({});
  const [completionType, setCompletionType] = useState('delivered');
  const [notes, setNotes] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState(null);
  const [nextDelivery, setNextDelivery] = useState(null);
  const completionTime = useRef(null);

  const customerName = delivery?.customer_name || delivery?.contact_name || '';
  const hasEnoughPhotos = photos.length >= 2;
  const hasSignature = !!signatureData;
  const checklistDone = isChecklistComplete(checklist, photos.length, hasSignature, completionType);

  // Determine which step issues exist
  const photosMissing = !hasEnoughPhotos;
  const signatureMissing = !hasSignature;

  function handlePhotoCapture(photo) {
    setPhotos(prev => [...prev, photo]);
    setShowCamera(false);
  }

  function handlePhotoDelete(id) {
    setPhotos(prev => prev.filter(p => p.id !== id));
  }

  function handleTagPhoto(id, tag) {
    setPhotos(prev => prev.map(p => {
      if (p.id === id) return { ...p, tag };
      if (p.tag === tag && tag !== 'damage') return { ...p, tag: undefined };
      return p;
    }));
  }

  function handleSignatureComplete(sigData) {
    setSignatureData(sigData);
    setStep('checklist');
  }

  function goToReview() {
    completionTime.current = new Date().toISOString();
    setStep('review');
  }

  async function handleSubmit() {
    setSubmitting(true);
    setSubmitError(null);
    setStep('submitting');

    const payload = {
      completed_at: completionTime.current || new Date().toISOString(),
      completion_type: completionType,
      signature: signatureData ? {
        image: signatureData.signature_image,
        signer_name: signatureData.signer_name,
        relationship: signatureData.relationship,
        signed_at: signatureData.signed_at,
      } : null,
      photos: photos.map(p => ({ data: p.data, caption: p.caption, tag: p.tag, timestamp: p.timestamp })),
      checklist: {
        all_items_delivered: !!checklist.all_items_delivered,
        items_placed_correctly: !!checklist.items_placed_correctly,
        packaging_removed: !!checklist.packaging_removed,
        customer_satisfied: !!checklist.customer_satisfied,
      },
      notes: notes.trim() || null,
    };

    try {
      const result = await onSubmit(payload);
      setNextDelivery(result?.next_delivery || null);
      setStep('success');
    } catch (err) {
      setSubmitError(err.message || 'Failed to submit');
      setStep('review');
      setSubmitting(false);
    }
  }

  // Auto-advance after success (5 seconds)
  useEffect(() => {
    if (step !== 'success') return;
    const timer = setTimeout(() => {
      if (nextDelivery?.id) {
        onGoToNext?.(nextDelivery.id);
      } else {
        onGoToRoute?.();
      }
    }, 5000);
    return () => clearTimeout(timer);
  }, [step, nextDelivery]); // eslint-disable-line

  // ---- Camera overlay ----
  if (showCamera) {
    return (
      <PhotoCapture
        onCapture={handlePhotoCapture}
        onClose={() => setShowCamera(false)}
        maxPhotos={5}
        currentCount={photos.length}
      />
    );
  }

  // ---- Submitting spinner ----
  if (step === 'submitting') {
    return (
      <div className="fixed inset-0 z-50 flex flex-col items-center justify-center bg-white">
        <div className="h-12 w-12 animate-spin rounded-full border-4 border-green-600 border-t-transparent" />
        <p className="mt-4 text-sm font-semibold text-slate-700">Submitting delivery...</p>
        <p className="mt-1 text-xs text-slate-400">Uploading photos and signature</p>
      </div>
    );
  }

  // ---- Success screen ----
  if (step === 'success') {
    return (
      <div className="fixed inset-0 z-50 flex flex-col bg-white">
        <div className="flex flex-1 flex-col items-center justify-center px-6">
          <div className="mb-4 flex h-20 w-20 items-center justify-center rounded-full bg-green-100">
            <svg className="h-10 w-10 text-green-600" fill="none" viewBox="0 0 24 24" strokeWidth={2.5} stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" d="m4.5 12.75 6 6 9-13.5" />
            </svg>
          </div>
          <h2 className="text-xl font-bold text-slate-900">Delivery Complete!</h2>
          <p className="mt-1 text-sm text-slate-500">
            #{delivery?.booking_number || delivery?.id} — {customerName}
          </p>

          {/* Next delivery hint */}
          {nextDelivery ? (
            <div className="mt-6 w-full rounded-xl border border-blue-200 bg-blue-50 p-4 text-center">
              <p className="text-xs text-blue-600">Next delivery</p>
              <p className="mt-0.5 text-sm font-semibold text-blue-800">
                {nextDelivery.customer_name || nextDelivery.contact_name}
              </p>
              <p className="text-xs text-blue-600">{nextDelivery.delivery_address}</p>
              <p className="mt-2 text-[10px] text-blue-400">Auto-advancing in 5 seconds...</p>
            </div>
          ) : (
            <div className="mt-6 w-full rounded-xl border border-green-200 bg-green-50 p-4 text-center">
              <p className="text-sm font-medium text-green-700">All deliveries on this route are complete!</p>
              <p className="mt-1 text-[10px] text-green-500">Returning to route in 5 seconds...</p>
            </div>
          )}
        </div>

        {/* Manual navigation */}
        <div className="flex gap-3 px-4 pb-8">
          {nextDelivery ? (
            <button
              onClick={() => onGoToNext?.(nextDelivery.id)}
              className="flex-1 rounded-xl bg-blue-600 py-3.5 text-sm font-bold text-white shadow-lg"
            >
              Go to Next Delivery
            </button>
          ) : (
            <button
              onClick={() => onGoToRoute?.()}
              className="flex-1 rounded-xl bg-green-600 py-3.5 text-sm font-bold text-white shadow-lg"
            >
              Back to Route
            </button>
          )}
        </div>
      </div>
    );
  }

  // ---- Main completion flow ----
  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-white">
      {/* Header */}
      <div className="flex items-center justify-between border-b border-slate-200 px-4 py-3">
        <button
          onClick={step === 'photos' ? onCancel : () => {
            const idx = STEPS.indexOf(step);
            if (idx > 0) setStep(STEPS[idx - 1]);
          }}
          className="text-sm font-medium text-blue-600"
        >
          {step === 'photos' ? 'Cancel' : 'Back'}
        </button>
        <h2 className="text-sm font-bold text-slate-900">Complete Delivery</h2>
        <span className="text-xs text-slate-400">
          {STEPS.indexOf(step) + 1}/{4}
        </span>
      </div>

      {/* Step indicator */}
      <div className="flex gap-1 px-4 pt-3">
        {['Photos', 'Signature', 'Checklist', 'Review'].map((label, i) => (
          <div key={label} className="flex-1">
            <div className={`h-1 rounded-full ${STEPS.indexOf(step) >= i ? 'bg-green-500' : 'bg-slate-200'}`} />
            <p className={`mt-1 text-center text-[10px] ${STEPS.indexOf(step) >= i ? 'text-green-600 font-medium' : 'text-slate-400'}`}>
              {label}
            </p>
          </div>
        ))}
      </div>

      {/* Completion type selector (top of photo step only) */}
      {step === 'photos' && (
        <div className="flex gap-2 px-4 pt-4">
          {[
            { value: 'delivered', label: 'Full Delivery', cls: 'border-green-300 bg-green-50 text-green-700' },
            { value: 'partial', label: 'Partial', cls: 'border-amber-300 bg-amber-50 text-amber-700' },
            { value: 'refused', label: 'Refused', cls: 'border-red-300 bg-red-50 text-red-700' },
          ].map(opt => (
            <button
              key={opt.value}
              onClick={() => setCompletionType(opt.value)}
              className={`flex-1 rounded-lg border py-2 text-center text-xs font-semibold transition-colors ${
                completionType === opt.value ? opt.cls : 'border-slate-200 bg-white text-slate-500'
              }`}
            >
              {opt.label}
            </button>
          ))}
        </div>
      )}

      {/* Step content */}
      <div className="flex-1 overflow-y-auto px-4 py-4">
        {/* ---- STEP 1: Photos ---- */}
        {step === 'photos' && (
          <div>
            <PhotoGallery
              photos={photos}
              onDelete={handlePhotoDelete}
              onAdd={() => setShowCamera(true)}
              onTagPhoto={handleTagPhoto}
              maxPhotos={5}
              minRequired={2}
            />
            {photosMissing && (
              <p className="mt-3 text-center text-xs text-amber-600">
                At least 2 photos required (items in place + delivery location)
              </p>
            )}
          </div>
        )}

        {/* ---- STEP 2: Signature ---- */}
        {step === 'signature' && (
          <div>
            {signatureData ? (
              <div className="space-y-3">
                <div className="rounded-xl border border-green-200 bg-green-50 p-4 text-center">
                  <p className="text-xs text-green-600">Signature captured</p>
                  <p className="mt-1 text-sm font-semibold text-green-800">{signatureData.signer_name}</p>
                  <div className="mx-auto mt-2 h-20 w-64 overflow-hidden rounded-lg border border-green-200 bg-white">
                    <img src={signatureData.signature_image} alt="Signature" className="h-full w-full object-contain" />
                  </div>
                </div>
                <button
                  onClick={() => setSignatureData(null)}
                  className="w-full rounded-lg border border-slate-200 py-2.5 text-xs font-medium text-slate-600"
                >
                  Recapture Signature
                </button>
              </div>
            ) : (
              <div>
                <div className="mb-3 rounded-lg bg-blue-50 px-3 py-2">
                  <p className="text-xs text-blue-700">
                    By signing, the recipient confirms all items have been received in acceptable condition.
                  </p>
                </div>
                <SignatureCapture
                  customerName={customerName}
                  onComplete={handleSignatureComplete}
                  onCancel={() => setStep('photos')}
                  instructions="Please sign below to confirm delivery"
                />
              </div>
            )}
          </div>
        )}

        {/* ---- STEP 3: Checklist ---- */}
        {step === 'checklist' && (
          <div className="space-y-4">
            <CompletionChecklist
              checklist={checklist}
              onChange={setChecklist}
              photosCount={photos.length}
              hasSignature={hasSignature}
              completionType={completionType}
            />

            {/* Notes */}
            <div>
              <label className="mb-1 block text-xs font-medium text-slate-500">Completion Notes (optional)</label>
              <textarea
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="e.g., Left in garage as requested, slight damage to box corner..."
                rows={3}
                className="w-full rounded-lg border border-slate-200 px-3 py-2.5 text-sm text-slate-800 placeholder:text-slate-300 focus:border-blue-400 focus:outline-none"
              />
            </div>
          </div>
        )}

        {/* ---- STEP 4: Review ---- */}
        {step === 'review' && (
          <div>
            {submitError && (
              <div className="mb-3 rounded-lg bg-red-50 border border-red-200 px-3 py-2">
                <p className="text-xs text-red-700">{submitError}</p>
              </div>
            )}
            <CompletionSummary
              delivery={delivery}
              items={items}
              photos={photos}
              signatureData={signatureData}
              arrivalTime={delivery?.actual_arrival}
              completionTime={completionTime.current}
              completionType={completionType}
              notes={notes}
            />
          </div>
        )}
      </div>

      {/* Bottom action */}
      {step !== 'signature' || signatureData ? (
        <div className="border-t border-slate-200 px-4 pb-8 pt-3">
          {step === 'photos' && (
            <button
              onClick={() => setStep('signature')}
              disabled={photosMissing}
              className={`w-full rounded-xl py-3.5 text-sm font-bold shadow-lg ${
                photosMissing
                  ? 'bg-slate-200 text-slate-400'
                  : 'bg-blue-600 text-white'
              }`}
            >
              {photosMissing ? `Need ${2 - photos.length} more photo${2 - photos.length > 1 ? 's' : ''}` : 'Next: Signature'}
            </button>
          )}

          {step === 'signature' && signatureData && (
            <button
              onClick={() => setStep('checklist')}
              className="w-full rounded-xl bg-blue-600 py-3.5 text-sm font-bold text-white shadow-lg"
            >
              Next: Checklist
            </button>
          )}

          {step === 'checklist' && (
            <button
              onClick={goToReview}
              disabled={!checklistDone}
              className={`w-full rounded-xl py-3.5 text-sm font-bold shadow-lg ${
                checklistDone ? 'bg-blue-600 text-white' : 'bg-slate-200 text-slate-400'
              }`}
            >
              {checklistDone ? 'Review & Submit' : 'Complete checklist to continue'}
            </button>
          )}

          {step === 'review' && (
            <button
              onClick={handleSubmit}
              disabled={submitting}
              className="w-full rounded-xl bg-green-600 py-3.5 text-sm font-bold text-white shadow-lg disabled:opacity-50"
            >
              {submitting ? 'Submitting...' : 'Confirm & Complete Delivery'}
            </button>
          )}
        </div>
      ) : null}
    </div>
  );
}
