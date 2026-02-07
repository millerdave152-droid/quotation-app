import { useRef, useState, useEffect, useCallback } from 'react';

/**
 * Camera viewfinder with capture, front/back switch, flash toggle, and preview.
 *
 * Props:
 *   onCapture     — (photo: { id, data, timestamp, caption }) => void
 *   onClose       — () => void
 *   maxPhotos     — number (default 5)
 *   currentCount  — how many photos already taken
 */
export default function PhotoCapture({ onCapture, onClose, maxPhotos = 5, currentCount = 0 }) {
  const videoRef = useRef(null);
  const [stream, setStream] = useState(null);
  const [facingMode, setFacingMode] = useState('environment');
  const [flashEnabled, setFlashEnabled] = useState(false);
  const [hasFlash, setHasFlash] = useState(false);
  const [preview, setPreview] = useState(null); // { data, id, timestamp }
  const [caption, setCaption] = useState('');
  const [cameraError, setCameraError] = useState(null);

  const startCamera = useCallback(async () => {
    // Stop any existing stream first
    if (stream) {
      stream.getTracks().forEach(t => t.stop());
    }
    setCameraError(null);

    try {
      const mediaStream = await navigator.mediaDevices.getUserMedia({
        video: {
          facingMode,
          width: { ideal: 1280 },
          height: { ideal: 720 },
        },
        audio: false,
      });

      if (videoRef.current) {
        videoRef.current.srcObject = mediaStream;
      }
      setStream(mediaStream);

      // Check flash/torch support
      const track = mediaStream.getVideoTracks()[0];
      if (track) {
        const caps = track.getCapabilities?.();
        setHasFlash(caps?.torch === true || (Array.isArray(caps?.torch) && caps.torch.length > 0));
      }
    } catch (err) {
      console.error('Camera error:', err);
      setCameraError(err.name === 'NotAllowedError'
        ? 'Camera permission denied. Please allow camera access.'
        : 'Could not access camera.');
    }
  }, [facingMode]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    startCamera();
    return () => {
      // Cleanup on unmount
      if (videoRef.current?.srcObject) {
        videoRef.current.srcObject.getTracks().forEach(t => t.stop());
      }
    };
  }, [startCamera]);

  // Toggle flash via torch constraint
  useEffect(() => {
    if (!stream || !hasFlash) return;
    const track = stream.getVideoTracks()[0];
    if (track?.applyConstraints) {
      track.applyConstraints({ advanced: [{ torch: flashEnabled }] }).catch(() => {});
    }
  }, [flashEnabled, stream, hasFlash]);

  function switchCamera() {
    setFacingMode(prev => prev === 'environment' ? 'user' : 'environment');
  }

  function capturePhoto() {
    if (!videoRef.current) return;
    const video = videoRef.current;
    const canvas = document.createElement('canvas');
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    canvas.getContext('2d').drawImage(video, 0, 0);

    const data = canvas.toDataURL('image/jpeg', 0.8);
    setPreview({
      id: Date.now(),
      data,
      timestamp: new Date().toISOString(),
    });
  }

  function handleRetake() {
    setPreview(null);
    setCaption('');
  }

  function handleAccept() {
    if (!preview) return;
    onCapture({
      ...preview,
      caption: caption.trim() || '',
    });
    setPreview(null);
    setCaption('');
  }

  const atMax = (currentCount >= maxPhotos);

  // ---- Preview mode ----
  if (preview) {
    return (
      <div className="fixed inset-0 z-50 flex flex-col bg-black">
        {/* Preview image */}
        <div className="flex flex-1 items-center justify-center">
          <img src={preview.data} alt="Preview" className="max-h-full max-w-full object-contain" />
        </div>

        {/* Caption */}
        <div className="bg-black/80 px-4 py-3">
          <input
            type="text"
            value={caption}
            onChange={(e) => setCaption(e.target.value)}
            placeholder="Add caption (optional)..."
            className="w-full rounded-lg bg-white/10 px-3 py-2.5 text-sm text-white placeholder:text-white/40 focus:bg-white/15 focus:outline-none"
          />
        </div>

        {/* Actions */}
        <div className="flex gap-3 bg-black px-4 pb-8 pt-3">
          <button
            onClick={handleRetake}
            className="flex-1 rounded-xl border border-white/30 py-3.5 text-sm font-semibold text-white"
          >
            Retake
          </button>
          <button
            onClick={handleAccept}
            className="flex-1 rounded-xl bg-green-600 py-3.5 text-sm font-bold text-white shadow-lg"
          >
            Use Photo
          </button>
        </div>
      </div>
    );
  }

  // ---- Camera viewfinder mode ----
  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-black">
      {/* Top bar */}
      <div className="flex items-center justify-between px-4 py-3">
        <button onClick={onClose} className="text-sm font-medium text-white/80">
          Cancel
        </button>
        <span className="text-xs text-white/60">
          {currentCount}/{maxPhotos} photos
        </span>
        <div className="flex gap-3">
          {/* Flash toggle */}
          {hasFlash && (
            <button
              onClick={() => setFlashEnabled(f => !f)}
              className={`flex h-9 w-9 items-center justify-center rounded-full ${
                flashEnabled ? 'bg-yellow-400 text-black' : 'bg-white/20 text-white'
              }`}
            >
              <FlashIcon className="h-5 w-5" />
            </button>
          )}
          {/* Switch camera */}
          <button
            onClick={switchCamera}
            className="flex h-9 w-9 items-center justify-center rounded-full bg-white/20 text-white"
          >
            <SwitchIcon className="h-5 w-5" />
          </button>
        </div>
      </div>

      {/* Viewfinder */}
      <div className="relative flex flex-1 items-center justify-center">
        {cameraError ? (
          <div className="px-8 text-center">
            <p className="text-sm text-white/70">{cameraError}</p>
            <button onClick={startCamera} className="mt-3 rounded-lg bg-white/20 px-4 py-2 text-xs text-white">
              Retry
            </button>
          </div>
        ) : (
          <video
            ref={videoRef}
            autoPlay
            playsInline
            muted
            className="h-full w-full object-cover"
          />
        )}
      </div>

      {/* Capture button */}
      <div className="flex items-center justify-center pb-10 pt-5">
        <button
          onClick={capturePhoto}
          disabled={!!cameraError || atMax}
          className="flex h-[72px] w-[72px] items-center justify-center rounded-full border-4 border-white disabled:opacity-30"
        >
          <div className="h-[58px] w-[58px] rounded-full bg-white" />
        </button>
      </div>

      {atMax && (
        <p className="pb-4 text-center text-xs text-amber-400">Maximum photos reached</p>
      )}
    </div>
  );
}

/* ---- Inline SVG icons ---- */

function FlashIcon({ className }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" d="m3.75 13.5 10.5-11.25L12 10.5h8.25L9.75 21.75 12 13.5H3.75Z" />
    </svg>
  );
}

function SwitchIcon({ className }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" d="M16.023 9.348h4.992v-.001M2.985 19.644v-4.992m0 0h4.992m-4.993 0 3.181 3.183a8.25 8.25 0 0 0 13.803-3.7M4.031 9.865a8.25 8.25 0 0 1 13.803-3.7l3.181 3.182M21.015 4.356v4.992" />
    </svg>
  );
}
