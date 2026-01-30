/**
 * TeleTime POS - Signature Pad Component
 * Touch and mouse-friendly signature capture with SVG output
 * Uses SignatureCanvas for drawing logic
 */

import { useState, useRef, useCallback, useEffect } from 'react';
import {
  XMarkIcon,
  ArrowPathIcon,
  CheckIcon,
  PencilIcon,
} from '@heroicons/react/24/outline';
import SignatureCanvas from './SignatureCanvas';

/**
 * Signature Pad Component
 * @param {object} props
 * @param {function} props.onAccept - Callback with signature data when accepted
 * @param {function} props.onCancel - Callback when cancelled
 * @param {string} props.title - Title text
 * @param {string} props.subtitle - Subtitle/description text
 * @param {string} props.legalText - Legal terms to display
 * @param {boolean} props.requirePrintedName - Whether printed name is required
 * @param {string} props.outputFormat - 'svg' or 'png'
 */
export default function SignaturePad({
  onAccept,
  onCancel,
  title = 'Signature Required',
  subtitle = 'Please sign below',
  legalText,
  requirePrintedName = true,
  outputFormat = 'svg',
  className = '',
}) {
  const canvasRef = useRef(null);
  const containerRef = useRef(null);

  // State
  const [signerName, setSignerName] = useState('');
  const [showPreview, setShowPreview] = useState(false);
  const [previewData, setPreviewData] = useState(null);
  const [hasSignature, setHasSignature] = useState(false);
  const [canvasSize, setCanvasSize] = useState({ width: 600, height: 200 });

  // Validation
  const canAccept = hasSignature && (!requirePrintedName || signerName.trim().length >= 2);

  // Handle responsive sizing
  useEffect(() => {
    const updateSize = () => {
      if (containerRef.current) {
        const rect = containerRef.current.getBoundingClientRect();
        const width = Math.min(rect.width - 32, 800);
        const height = Math.min(200, Math.max(150, width * 0.3));
        setCanvasSize({ width: Math.floor(width), height: Math.floor(height) });
      }
    };

    updateSize();
    window.addEventListener('resize', updateSize);
    return () => window.removeEventListener('resize', updateSize);
  }, []);

  // Handle stroke changes
  const handleStrokeChange = useCallback((strokeCount) => {
    setHasSignature(strokeCount > 0);
  }, []);

  // Clear signature
  const handleClear = useCallback(() => {
    canvasRef.current?.clear();
    setShowPreview(false);
    setPreviewData(null);
    setHasSignature(false);
  }, []);

  // Store signature data URL when entering preview (canvas unmounts in preview mode)
  const [signatureDataURL, setSignatureDataURL] = useState(null);
  const [strokeCount, setStrokeCount] = useState(0);

  // Show preview
  const handleShowPreview = useCallback(() => {
    if (!canvasRef.current) return;

    let data;
    if (outputFormat === 'svg') {
      data = canvasRef.current.toSVG();
    } else {
      data = canvasRef.current.toPNG();
    }

    // Save data URL and stroke count before canvas unmounts
    const dataURL = outputFormat === 'svg'
      ? canvasRef.current.toSVGDataURL()
      : canvasRef.current.toPNG();
    setSignatureDataURL(dataURL);
    setStrokeCount(canvasRef.current.getStrokeCount());

    setPreviewData(data);
    setShowPreview(true);
  }, [outputFormat]);

  // Accept signature
  const handleAccept = useCallback(() => {
    if (!canAccept || !signatureDataURL) return;

    onAccept?.({
      signatureData: signatureDataURL,
      signerName: signerName.trim(),
      format: outputFormat,
      capturedAt: new Date().toISOString(),
      dimensions: canvasSize,
      strokeCount,
    });
  }, [canAccept, signatureDataURL, strokeCount, outputFormat, signerName, canvasSize, onAccept]);

  return (
    <div className={`flex flex-col ${className}`} ref={containerRef}>
      {/* Header */}
      <div className="text-center mb-6">
        <div className="inline-flex items-center justify-center w-16 h-16 bg-blue-100 rounded-full mb-4">
          <PencilIcon className="w-8 h-8 text-blue-600" />
        </div>
        <h2 className="text-2xl font-bold text-gray-900">{title}</h2>
        <p className="text-gray-500 mt-1">{subtitle}</p>
      </div>

      {/* Legal Text */}
      {legalText && (
        <div className="mb-4 p-4 bg-gray-50 rounded-lg border border-gray-200 max-h-32 overflow-y-auto">
          <p className="text-sm text-gray-600 whitespace-pre-line">{legalText}</p>
        </div>
      )}

      {/* Preview Mode */}
      {showPreview ? (
        <div className="space-y-4">
          {/* Preview Card */}
          <div className="bg-white rounded-xl border-2 border-gray-200 p-6">
            <p className="text-sm text-gray-500 mb-3 text-center">Signature Preview</p>

            {/* Signature Image - use img tag to avoid dangerouslySetInnerHTML DOM conflicts */}
            <div className="bg-gray-50 rounded-lg p-4 flex items-center justify-center min-h-[120px]">
              {previewData ? (
                <img
                  src={signatureDataURL || previewData}
                  alt="Signature preview"
                  className="max-w-full"
                  style={{ maxWidth: canvasSize.width, maxHeight: canvasSize.height }}
                />
              ) : null}
            </div>

            {/* Signer Name */}
            <div className="mt-4 pt-4 border-t border-gray-200 text-center">
              <p className="text-lg font-semibold text-gray-900">{signerName}</p>
              <p className="text-xs text-gray-400 mt-1">
                {new Date().toLocaleDateString('en-US', {
                  weekday: 'long',
                  year: 'numeric',
                  month: 'long',
                  day: 'numeric',
                  hour: '2-digit',
                  minute: '2-digit',
                })}
              </p>
            </div>
          </div>

          {/* Preview Actions */}
          <div className="flex gap-3">
            <button
              type="button"
              onClick={() => setShowPreview(false)}
              className="flex-1 h-14 flex items-center justify-center gap-2 bg-gray-100 hover:bg-gray-200 text-gray-700 font-medium rounded-xl transition-colors"
            >
              <ArrowPathIcon className="w-5 h-5" />
              Edit Signature
            </button>
            <button
              type="button"
              onClick={handleAccept}
              className="flex-1 h-14 flex items-center justify-center gap-2 bg-green-600 hover:bg-green-700 text-white font-bold rounded-xl transition-colors"
            >
              <CheckIcon className="w-5 h-5" />
              Confirm & Accept
            </button>
          </div>
        </div>
      ) : (
        /* Drawing Mode */
        <div className="space-y-4">
          {/* Signature Canvas Container */}
          <div className="relative">
            <div className="bg-white rounded-xl border-2 border-dashed border-gray-300 overflow-hidden">
              {/* Canvas */}
              <SignatureCanvas
                ref={canvasRef}
                width={canvasSize.width}
                height={canvasSize.height}
                strokeColor="#1f2937"
                strokeWidth={2.5}
                onChange={handleStrokeChange}
                className="w-full"
              />

              {/* Signature Line */}
              <div
                className="absolute left-8 right-8 border-b-2 border-gray-300 pointer-events-none"
                style={{ bottom: canvasSize.height * 0.2 }}
              />

              {/* X mark */}
              <div
                className="absolute left-6 text-gray-400 text-2xl font-serif pointer-events-none"
                style={{ bottom: canvasSize.height * 0.15 }}
              >
                X
              </div>

              {/* Empty State Hint */}
              {!hasSignature && (
                <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                  <p className="text-gray-400 text-lg">Sign here</p>
                </div>
              )}
            </div>

            {/* Clear Button */}
            {hasSignature && (
              <button
                type="button"
                onClick={handleClear}
                className="absolute top-3 right-3 p-2 bg-white/90 hover:bg-red-50 text-gray-500 hover:text-red-600 rounded-lg shadow-sm border border-gray-200 transition-colors"
                title="Clear signature"
              >
                <ArrowPathIcon className="w-5 h-5" />
              </button>
            )}
          </div>

          {/* Printed Name Input */}
          {requirePrintedName && (
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Print Your Name
              </label>
              <input
                type="text"
                value={signerName}
                onChange={(e) => setSignerName(e.target.value)}
                placeholder="Enter your full name"
                className="w-full h-14 px-4 text-lg border-2 border-gray-200 rounded-xl focus:border-blue-500 focus:ring-2 focus:ring-blue-100 transition-colors"
                autoComplete="name"
              />
            </div>
          )}

          {/* Action Buttons */}
          <div className="flex gap-3 pt-2">
            <button
              type="button"
              onClick={onCancel}
              className="flex-1 h-14 flex items-center justify-center gap-2 bg-gray-100 hover:bg-gray-200 text-gray-700 font-medium rounded-xl transition-colors"
            >
              <XMarkIcon className="w-5 h-5" />
              Cancel
            </button>
            <button
              type="button"
              onClick={handleShowPreview}
              disabled={!canAccept}
              className={`flex-1 h-14 flex items-center justify-center gap-2 font-bold rounded-xl transition-colors ${
                canAccept
                  ? 'bg-blue-600 hover:bg-blue-700 text-white'
                  : 'bg-gray-200 text-gray-400 cursor-not-allowed'
              }`}
            >
              <CheckIcon className="w-5 h-5" />
              Review & Sign
            </button>
          </div>

          {/* Validation Hints */}
          {!hasSignature && (
            <p className="text-center text-sm text-gray-400">
              Draw your signature in the box above
            </p>
          )}
          {hasSignature && requirePrintedName && signerName.trim().length < 2 && (
            <p className="text-center text-sm text-amber-600">
              Please enter your printed name
            </p>
          )}
        </div>
      )}
    </div>
  );
}
