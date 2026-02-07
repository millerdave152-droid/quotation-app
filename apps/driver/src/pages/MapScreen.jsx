import { useEffect, useState, useCallback, useMemo, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { MapContainer, TileLayer, Polyline, CircleMarker, useMap } from 'react-leaflet';
import 'leaflet/dist/leaflet.css';
import { useApp } from '../context/AppContext';
import api from '../api/client';
import { db } from '../lib/db';
import useLocationTracking from '../hooks/useLocationTracking';
import MapMarker from '../components/MapMarker';
import NavigationButton from '../components/NavigationButton';

// Fix Leaflet default icon issue with bundlers
import L from 'leaflet';
delete L.Icon.Default.prototype._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png',
  iconUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png',
  shadowUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png',
});

const DEFAULT_CENTER = [43.65, -79.38]; // Toronto
const DEFAULT_ZOOM = 12;

export default function MapScreen() {
  const navigate = useNavigate();
  const { online } = useApp();
  const [route, setRoute] = useState(null);
  const [stops, setStops] = useState([]);
  const [summary, setSummary] = useState({ total: 0, completed: 0, remaining: 0 });
  const [loading, setLoading] = useState(true);
  const [viewMode, setViewMode] = useState('map'); // 'map' | 'list'
  const mapRef = useRef(null);

  // Track location while on this screen
  const routeInProgress = route?.status === 'in_progress';
  const { position } = useLocationTracking({ enabled: routeInProgress, interval: 30000 });

  const loadRoute = useCallback(async () => {
    try {
      if (online) {
        const res = await api.get('/api/driver/route/today');
        setRoute(res.data.route || null);
        setStops(res.data.stops || []);
        setSummary(res.data.summary || { total: 0, completed: 0, remaining: 0 });
        await db.put('meta', {
          route: res.data.route,
          stops: res.data.stops,
          summary: res.data.summary,
        }, 'todayRoute');
      } else {
        const cached = await db.get('meta', 'todayRoute');
        if (cached) {
          setRoute(cached.route);
          setStops(cached.stops || []);
          setSummary(cached.summary || { total: 0, completed: 0, remaining: 0 });
        }
      }
    } catch {
      const cached = await db.get('meta', 'todayRoute');
      if (cached) {
        setRoute(cached.route);
        setStops(cached.stops || []);
        setSummary(cached.summary || { total: 0, completed: 0, remaining: 0 });
      }
    } finally {
      setLoading(false);
    }
  }, [online]);

  useEffect(() => { loadRoute(); }, [loadRoute]);

  // Stops that have valid coordinates
  const geoStops = useMemo(
    () => stops.filter(s => hasCoords(s)),
    [stops]
  );

  // Route polyline coordinates
  const routeLine = useMemo(() => {
    const coords = [];
    if (position) coords.push([position.lat, position.lng]);
    geoStops
      .sort((a, b) => (a.sequence_order || 0) - (b.sequence_order || 0))
      .forEach(s => {
        const status = s.stop_status || mapBookingStatus(s.booking_status);
        if (status !== 'completed') {
          coords.push([parseFloat(s.latitude || s.lat), parseFloat(s.longitude || s.lng)]);
        }
      });
    return coords;
  }, [geoStops, position]);

  // Find next pending stop
  const nextStop = useMemo(() => {
    return geoStops.find(s => {
      const status = s.stop_status || mapBookingStatus(s.booking_status);
      return status === 'pending' || status === 'approaching';
    });
  }, [geoStops]);

  // Map center
  const mapCenter = useMemo(() => {
    if (position) return [position.lat, position.lng];
    if (geoStops.length > 0) {
      return [
        parseFloat(geoStops[0].latitude || geoStops[0].lat),
        parseFloat(geoStops[0].longitude || geoStops[0].lng),
      ];
    }
    return DEFAULT_CENTER;
  }, [position, geoStops]);

  function handleNavigateToStop(stop) {
    const addr = stop.delivery_address || stop.stop_address;
    const lat = parseFloat(stop.latitude || stop.lat);
    const lng = parseFloat(stop.longitude || stop.lng);
    openExternalNav(addr, lat, lng);
  }

  if (loading) {
    return <div className="flex h-full items-center justify-center text-sm text-slate-400">Loading map...</div>;
  }

  return (
    <div className="flex h-full flex-col">
      {/* Top bar */}
      <div className="flex items-center justify-between border-b border-slate-200 bg-white px-4 py-2">
        <div>
          <p className="text-sm font-semibold text-slate-900">
            {route ? `Route ${route.route_number}` : "Today's Stops"}
          </p>
          <p className="text-xs text-slate-400">
            {summary.completed}/{summary.total} completed
          </p>
        </div>

        {/* View toggle */}
        <div className="flex overflow-hidden rounded-lg border border-slate-200">
          <button
            onClick={() => setViewMode('map')}
            className={`px-3 py-1.5 text-xs font-medium ${
              viewMode === 'map' ? 'bg-blue-600 text-white' : 'bg-white text-slate-600'
            }`}
          >
            Map
          </button>
          <button
            onClick={() => navigate('/')}
            className="border-l border-slate-200 bg-white px-3 py-1.5 text-xs font-medium text-slate-600"
          >
            List
          </button>
        </div>
      </div>

      {/* Map */}
      <div className="relative flex-1">
        <MapContainer
          center={mapCenter}
          zoom={DEFAULT_ZOOM}
          className="h-full w-full"
          ref={mapRef}
          zoomControl={false}
        >
          <TileLayer
            attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
            url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
          />

          {/* Route line */}
          {routeLine.length > 1 && (
            <Polyline
              positions={routeLine}
              pathOptions={{ color: '#3b82f6', weight: 4, opacity: 0.7, dashArray: '8 6' }}
            />
          )}

          {/* Driver position (blue dot) */}
          {position && (
            <CircleMarker
              center={[position.lat, position.lng]}
              radius={8}
              pathOptions={{
                fillColor: '#3b82f6',
                fillOpacity: 1,
                color: '#fff',
                weight: 3,
              }}
            />
          )}

          {/* Stop markers */}
          {geoStops.map((stop, i) => (
            <MapMarker
              key={stop.stop_id || stop.booking_id || i}
              stop={stop}
              onNavigate={handleNavigateToStop}
            />
          ))}

          {/* Auto-fit bounds */}
          <FitBounds stops={geoStops} position={position} />
        </MapContainer>

        {/* Navigate to next button */}
        {nextStop && (
          <div className="absolute bottom-4 left-4 right-4 z-[1000]">
            <div className="rounded-xl bg-white p-3 shadow-lg">
              <div className="mb-2 flex items-center justify-between">
                <div>
                  <p className="text-xs text-slate-400">Next stop</p>
                  <p className="text-sm font-semibold text-slate-900">
                    {nextStop.customer_name || nextStop.contact_name}
                  </p>
                  <p className="text-xs text-slate-500">
                    {truncate(nextStop.delivery_address || nextStop.stop_address, 45)}
                  </p>
                </div>
                <span className="flex h-8 w-8 items-center justify-center rounded-full bg-blue-100 text-xs font-bold text-blue-700">
                  {nextStop.sequence_order || '·'}
                </span>
              </div>
              <NavigationButton
                address={nextStop.delivery_address || nextStop.stop_address}
                lat={parseFloat(nextStop.latitude || nextStop.lat)}
                lng={parseFloat(nextStop.longitude || nextStop.lng)}
                className="w-full"
              />
            </div>
          </div>
        )}

        {/* No coords warning */}
        {geoStops.length === 0 && stops.length > 0 && (
          <div className="absolute inset-0 z-[1000] flex items-center justify-center bg-white/80">
            <div className="rounded-lg bg-white p-6 text-center shadow-lg">
              <p className="text-sm font-medium text-slate-700">No GPS coordinates available</p>
              <p className="mt-1 text-xs text-slate-400">Stops haven't been geocoded yet</p>
              <button
                onClick={() => navigate('/')}
                className="mt-3 rounded-lg bg-blue-600 px-4 py-2 text-xs font-medium text-white"
              >
                View List Instead
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// Auto-fit map to show all markers
function FitBounds({ stops, position }) {
  const map = useMap();

  useEffect(() => {
    const points = [];
    if (position) points.push([position.lat, position.lng]);
    stops.forEach(s => {
      const lat = parseFloat(s.latitude || s.lat);
      const lng = parseFloat(s.longitude || s.lng);
      if (!isNaN(lat) && !isNaN(lng)) points.push([lat, lng]);
    });
    if (points.length >= 2) {
      map.fitBounds(points, { padding: [50, 50] });
    } else if (points.length === 1) {
      map.setView(points[0], 14);
    }
  }, [stops.length, position?.lat, position?.lng]); // eslint-disable-line

  return null;
}

function hasCoords(stop) {
  const lat = parseFloat(stop.latitude || stop.lat);
  const lng = parseFloat(stop.longitude || stop.lng);
  return !isNaN(lat) && !isNaN(lng) && lat !== 0 && lng !== 0;
}

function truncate(str, len) {
  if (!str) return '';
  return str.length > len ? str.slice(0, len - 2) + '...' : str;
}

function openExternalNav(address, lat, lng) {
  const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent);
  const dest = lat && lng ? `${lat},${lng}` : encodeURIComponent(address || '');
  if (isIOS) {
    window.open(`maps://maps.apple.com/?daddr=${dest}&dirflg=d`, '_blank');
  } else {
    window.open(`https://www.google.com/maps/dir/?api=1&destination=${dest}&travelmode=driving`, '_blank');
  }
}

function mapBookingStatus(bookingStatus) {
  const map = {
    pending: 'pending', scheduled: 'pending', confirmed: 'pending',
    in_transit: 'approaching', delivered: 'completed',
    failed: 'failed', cancelled: 'skipped',
  };
  return map[bookingStatus] || 'pending';
}
