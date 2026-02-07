import { useEffect, useState, useCallback } from 'react';
import { useApp } from '../context/AppContext';
import api from '../api/client';
import { db } from '../lib/db';
import RouteHeader from '../components/RouteHeader';
import RouteProgress from '../components/RouteProgress';
import DeliveryCard from '../components/DeliveryCard';

const FILTERS = ['all', 'pending', 'completed', 'issues'];

export default function RouteScreen() {
  const { online, showToast } = useApp();
  const [route, setRoute] = useState(null);
  const [stops, setStops] = useState([]);
  const [summary, setSummary] = useState({ total: 0, completed: 0, failed: 0, remaining: 0 });
  const [filter, setFilter] = useState('all');
  const [loading, setLoading] = useState(true);
  const [starting, setStarting] = useState(false);
  const [refreshing, setRefreshing] = useState(false);

  const loadRoute = useCallback(async (isRefresh = false) => {
    if (isRefresh) setRefreshing(true);
    try {
      if (online) {
        const res = await api.get('/api/driver/route/today');
        setRoute(res.data.route || null);
        setStops(res.data.stops || []);
        setSummary(res.data.summary || { total: 0, completed: 0, failed: 0, remaining: 0 });
        // Cache for offline
        await db.put('meta', {
          route: res.data.route,
          stops: res.data.stops,
          summary: res.data.summary,
          cachedAt: new Date().toISOString(),
        }, 'todayRoute');
      } else {
        const cached = await db.get('meta', 'todayRoute');
        if (cached) {
          setRoute(cached.route || null);
          setStops(cached.stops || []);
          setSummary(cached.summary || { total: 0, completed: 0, failed: 0, remaining: 0 });
        }
      }
    } catch (err) {
      console.error('Failed to load route:', err);
      // Fallback to cache
      const cached = await db.get('meta', 'todayRoute');
      if (cached) {
        setRoute(cached.route);
        setStops(cached.stops || []);
        setSummary(cached.summary || { total: 0, completed: 0, failed: 0, remaining: 0 });
      }
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [online]);

  useEffect(() => { loadRoute(); }, [loadRoute]);

  // Pull-to-refresh via touch
  useEffect(() => {
    let startY = 0;
    const main = document.getElementById('route-scroll');
    if (!main) return;

    function onTouchStart(e) {
      if (main.scrollTop === 0) startY = e.touches[0].clientY;
    }
    function onTouchEnd(e) {
      const endY = e.changedTouches[0].clientY;
      if (startY && endY - startY > 80 && main.scrollTop === 0) {
        loadRoute(true);
      }
      startY = 0;
    }
    main.addEventListener('touchstart', onTouchStart, { passive: true });
    main.addEventListener('touchend', onTouchEnd, { passive: true });
    return () => {
      main.removeEventListener('touchstart', onTouchStart);
      main.removeEventListener('touchend', onTouchEnd);
    };
  }, [loadRoute]);

  async function handleStartRoute() {
    if (!route) return;
    setStarting(true);
    try {
      const res = await api.post(`/api/driver/route/${route.id}/start`);
      setRoute(res.data.route);
      showToast('Route started — drive safe!', 'success');
    } catch (err) {
      showToast(err.message || 'Failed to start route', 'error');
    } finally {
      setStarting(false);
    }
  }

  const filteredStops = stops.filter(s => {
    const status = s.stop_status || mapBookingStatus(s.booking_status);
    if (filter === 'all') return true;
    if (filter === 'pending') return status === 'pending' || status === 'approaching';
    if (filter === 'completed') return status === 'completed';
    if (filter === 'issues') return status === 'failed' || status === 'skipped' || s.issue_reported;
    return true;
  });

  if (loading) {
    return <div className="flex h-64 items-center justify-center text-sm text-slate-400">Loading route...</div>;
  }

  const canStartRoute = route && ['planned', 'optimized', 'assigned'].includes(route.status);
  const routeInProgress = route && route.status === 'in_progress';

  return (
    <div id="route-scroll" className="h-full overflow-y-auto">
      {/* Pull-to-refresh indicator */}
      {refreshing && (
        <div className="flex items-center justify-center py-3">
          <div className="h-5 w-5 animate-spin rounded-full border-2 border-blue-600 border-t-transparent" />
        </div>
      )}

      <div className="p-4">
        <RouteHeader route={route} summary={summary} />

        {/* Start route button */}
        {canStartRoute && (
          <button
            onClick={handleStartRoute}
            disabled={starting || !online}
            className="mb-4 w-full rounded-lg bg-blue-600 px-4 py-3 text-sm font-semibold text-white disabled:opacity-50"
          >
            {starting ? 'Starting...' : 'Start Route'}
          </button>
        )}

        {/* Progress bar */}
        {stops.length > 0 && (
          <RouteProgress summary={summary} route={route} />
        )}

        {/* Filter tabs */}
        <div className="mb-4 flex gap-2">
          {FILTERS.map(f => (
            <button
              key={f}
              onClick={() => setFilter(f)}
              className={`rounded-full px-3 py-1.5 text-xs font-medium capitalize ${
                filter === f ? 'bg-blue-600 text-white' : 'bg-slate-100 text-slate-600'
              }`}
            >
              {f === 'issues' ? 'Issues' : f}
              {f === 'pending' && summary.remaining > 0 && (
                <span className="ml-1 rounded-full bg-white/20 px-1.5">{summary.remaining}</span>
              )}
              {f === 'issues' && summary.failed > 0 && (
                <span className="ml-1 rounded-full bg-white/20 px-1.5">{summary.failed}</span>
              )}
            </button>
          ))}
        </div>

        {/* Stops list */}
        {filteredStops.length === 0 ? (
          <div className="rounded-xl border border-slate-200 bg-white p-8 text-center">
            <p className="text-sm text-slate-400">
              {stops.length === 0
                ? 'No deliveries assigned for today'
                : `No ${filter} deliveries`
              }
            </p>
          </div>
        ) : (
          <div className="space-y-3 pb-4">
            {filteredStops.map((stop, idx) => (
              <DeliveryCard
                key={stop.stop_id || stop.booking_id || idx}
                stop={stop}
                isActive={routeInProgress && isNextPending(stop, stops)}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function isNextPending(stop, allStops) {
  const status = stop.stop_status || mapBookingStatus(stop.booking_status);
  if (status !== 'pending') return false;
  // Is this the first pending stop?
  const firstPending = allStops.find(s => {
    const st = s.stop_status || mapBookingStatus(s.booking_status);
    return st === 'pending';
  });
  return firstPending && (firstPending.stop_id || firstPending.booking_id) === (stop.stop_id || stop.booking_id);
}

function mapBookingStatus(bookingStatus) {
  const map = {
    pending: 'pending', scheduled: 'pending', confirmed: 'pending',
    in_transit: 'approaching', delivered: 'completed',
    failed: 'failed', cancelled: 'skipped', rescheduled: 'skipped',
  };
  return map[bookingStatus] || 'pending';
}
