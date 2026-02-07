import { useState } from 'react';

const REQUIRED_LABELS = [
  { key: 'items', label: 'Items in place' },
  { key: 'location', label: 'Delivery location' },
];

/**
 * Grid of captured delivery photos with full-size viewer and required-photo indicator.
 *
 * Props:
 *   photos       — Array<{ id, data, timestamp, caption, tag? }>
 *   onDelete     — (id) => void
 *   onAdd        — () => void   opens PhotoCapture
 *   onTagPhoto   — (id, tag) => void   assigns a required-photo tag
 *   maxPhotos    — number (default 5)
 *   minRequired  — number (default 2)  minimum photos needed
 */
export default function PhotoGallery({ photos, onDelete, onAdd, onTagPhoto, maxPhotos = 5, minRequired = 2 }) {
  const [viewPhoto, setViewPhoto] = useState(null); // full-size viewer

  const taggedKeys = new Set(photos.map(p => p.tag).filter(Boolean));
  const requiredMet = REQUIRED_LABELS.filter(r => taggedKeys.has(r.key)).length;
  const allRequiredMet = requiredMet >= REQUIRED_LABELS.length;

  return (
    <>
      <div className="rounded-xl border border-slate-200 bg-white p-4">
        {/* Header */}
        <div className="mb-3 flex items-center justify-between">
          <p className="text-xs font-medium uppercase text-slate-400">Delivery Photos</p>
          <span className={`text-xs font-medium ${
            photos.length >= minRequired ? 'text-green-600' : 'text-amber-600'
          }`}>
            {photos.length} of {minRequired} required
          </span>
        </div>

        {/* Required checklist */}
        <div className="mb-3 flex flex-wrap gap-1.5">
          {REQUIRED_LABELS.map(r => {
            const done = taggedKeys.has(r.key);
            return (
              <span key={r.key} className={`rounded-full px-2.5 py-1 text-[10px] font-medium ${
                done ? 'bg-green-100 text-green-700' : 'bg-slate-100 text-slate-500'
              }`}>
                {done ? '✓ ' : '○ '}{r.label}
              </span>
            );
          })}
        </div>

        {/* Photo grid */}
        <div className="grid grid-cols-3 gap-2">
          {photos.map((photo) => (
            <div key={photo.id} className="group relative">
              <button
                onClick={() => setViewPhoto(photo)}
                className="block aspect-square w-full overflow-hidden rounded-lg bg-slate-100"
              >
                <img
                  src={photo.data}
                  alt={photo.caption || 'Delivery photo'}
                  className="h-full w-full object-cover"
                />
              </button>

              {/* Tag badge */}
              {photo.tag && (
                <span className="absolute left-1 top-1 rounded bg-blue-600/80 px-1.5 py-0.5 text-[9px] font-bold text-white">
                  {REQUIRED_LABELS.find(r => r.key === photo.tag)?.label || photo.tag}
                </span>
              )}

              {/* Caption */}
              {photo.caption && (
                <p className="mt-0.5 truncate text-[10px] text-slate-500">{photo.caption}</p>
              )}

              {/* Delete */}
              <button
                onClick={(e) => { e.stopPropagation(); onDelete(photo.id); }}
                className="absolute right-1 top-1 flex h-5 w-5 items-center justify-center rounded-full bg-black/50 text-[10px] text-white opacity-0 transition-opacity group-hover:opacity-100"
                style={{ opacity: 1 }} // always visible on touch devices
              >
                ✕
              </button>
            </div>
          ))}

          {/* Add photo button */}
          {photos.length < maxPhotos && (
            <button
              onClick={onAdd}
              className="flex aspect-square w-full flex-col items-center justify-center gap-1 rounded-lg border-2 border-dashed border-slate-300 bg-slate-50 text-slate-400"
            >
              <CameraIcon className="h-6 w-6" />
              <span className="text-[10px] font-medium">Add Photo</span>
            </button>
          )}
        </div>

        {/* Helper text */}
        {photos.length === 0 && (
          <p className="mt-2 text-center text-xs text-slate-400">
            Take at least {minRequired} photos for proof of delivery
          </p>
        )}
      </div>

      {/* Full-size viewer */}
      {viewPhoto && (
        <PhotoViewer
          photo={viewPhoto}
          onClose={() => setViewPhoto(null)}
          onDelete={() => { onDelete(viewPhoto.id); setViewPhoto(null); }}
          onTag={onTagPhoto ? (tag) => { onTagPhoto(viewPhoto.id, tag); setViewPhoto(null); } : null}
          taggedKeys={taggedKeys}
        />
      )}
    </>
  );
}

/* ---- Full-size photo viewer ---- */
function PhotoViewer({ photo, onClose, onDelete, onTag, taggedKeys }) {
  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-black">
      {/* Top bar */}
      <div className="flex items-center justify-between px-4 py-3">
        <button onClick={onClose} className="text-sm font-medium text-white/80">Close</button>
        <button
          onClick={onDelete}
          className="rounded-lg bg-red-600/80 px-3 py-1.5 text-xs font-medium text-white"
        >
          Delete
        </button>
      </div>

      {/* Image */}
      <div className="flex flex-1 items-center justify-center px-2">
        <img src={photo.data} alt={photo.caption || 'Photo'} className="max-h-full max-w-full object-contain" />
      </div>

      {/* Caption + tag */}
      <div className="space-y-3 px-4 pb-8 pt-3">
        {photo.caption && (
          <p className="text-center text-sm text-white/80">{photo.caption}</p>
        )}
        <p className="text-center text-[10px] text-white/40">
          {new Date(photo.timestamp).toLocaleString()}
        </p>

        {/* Tag buttons */}
        {onTag && (
          <div className="flex flex-wrap justify-center gap-2">
            {REQUIRED_LABELS.map(r => {
              const isThis = photo.tag === r.key;
              const taken = taggedKeys.has(r.key) && !isThis;
              return (
                <button
                  key={r.key}
                  onClick={() => onTag(r.key)}
                  disabled={taken}
                  className={`rounded-full px-3 py-1.5 text-xs font-medium transition-colors ${
                    isThis
                      ? 'bg-blue-600 text-white'
                      : taken
                        ? 'bg-white/10 text-white/30'
                        : 'bg-white/20 text-white'
                  } disabled:opacity-40`}
                >
                  {isThis ? '✓ ' : ''}{r.label}
                </button>
              );
            })}
            <button
              onClick={() => onTag('damage')}
              className={`rounded-full px-3 py-1.5 text-xs font-medium transition-colors ${
                photo.tag === 'damage'
                  ? 'bg-amber-600 text-white'
                  : 'bg-white/20 text-white'
              }`}
            >
              {photo.tag === 'damage' ? '✓ ' : ''}Existing damage
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

/* ---- Icon ---- */
function CameraIcon({ className }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" d="M6.827 6.175A2.31 2.31 0 0 1 5.186 7.23c-.38.054-.757.112-1.134.175C2.999 7.58 2.25 8.507 2.25 9.574V18a2.25 2.25 0 0 0 2.25 2.25h15A2.25 2.25 0 0 0 21.75 18V9.574c0-1.067-.75-1.994-1.802-2.169a47.865 47.865 0 0 0-1.134-.175 2.31 2.31 0 0 1-1.64-1.055l-.822-1.316a2.192 2.192 0 0 0-1.736-1.039 48.774 48.774 0 0 0-5.232 0 2.192 2.192 0 0 0-1.736 1.039l-.821 1.316Z" />
      <path strokeLinecap="round" strokeLinejoin="round" d="M16.5 12.75a4.5 4.5 0 1 1-9 0 4.5 4.5 0 0 1 9 0Z" />
    </svg>
  );
}
