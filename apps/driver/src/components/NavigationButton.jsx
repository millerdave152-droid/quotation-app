export default function NavigationButton({ address, lat, lng, className = '' }) {
  function handleNavigate() {
    if (!address && lat == null) return;

    const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent);
    const destination = lat != null && lng != null
      ? `${lat},${lng}`
      : encodeURIComponent(address);

    if (isIOS) {
      // Try Apple Maps first, falls back to Google Maps
      window.open(`maps://maps.apple.com/?daddr=${destination}&dirflg=d`, '_blank');
    } else {
      // Google Maps navigation intent (works on Android + desktop)
      window.open(
        `https://www.google.com/maps/dir/?api=1&destination=${destination}&travelmode=driving`,
        '_blank'
      );
    }
  }

  return (
    <button
      onClick={handleNavigate}
      className={`flex items-center justify-center gap-2 rounded-lg bg-blue-600 px-4 py-3 text-sm font-semibold text-white shadow-lg ${className}`}
    >
      <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" d="M6 12 3.269 3.125A59.769 59.769 0 0 1 21.485 12 59.768 59.768 0 0 1 3.27 20.875L5.999 12Zm0 0h7.5" />
      </svg>
      Navigate
    </button>
  );
}
