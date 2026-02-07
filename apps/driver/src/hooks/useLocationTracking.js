import { useState, useEffect, useRef, useCallback } from 'react';
import { queueAction } from '../utils/syncManager';

const DEFAULT_INTERVAL = 30000; // 30 seconds

export default function useLocationTracking({ enabled = false, interval = DEFAULT_INTERVAL } = {}) {
  const [position, setPosition] = useState(null);
  const [error, setError] = useState(null);
  const watchRef = useRef(null);
  const sendTimerRef = useRef(null);
  const lastSentRef = useRef(null);

  // Get single position
  const getPosition = useCallback(() => {
    return new Promise((resolve, reject) => {
      if (!navigator.geolocation) return reject(new Error('Geolocation not available'));
      navigator.geolocation.getCurrentPosition(resolve, reject, {
        enableHighAccuracy: true,
        timeout: 15000,
        maximumAge: 5000,
      });
    });
  }, []);

  // Send location to server (queues if offline)
  const sendLocation = useCallback(async (pos) => {
    try {
      await queueAction({
        type: 'location_ping',
        latitude: pos.coords.latitude,
        longitude: pos.coords.longitude,
        speed: pos.coords.speed ? Math.round(pos.coords.speed * 3.6) : null, // m/s to km/h
        heading: pos.coords.heading,
        accuracy: pos.coords.accuracy ? Math.round(pos.coords.accuracy) : null,
      });
    } catch {
      // Queued for later
    }
  }, []);

  useEffect(() => {
    if (!enabled || !navigator.geolocation) return;

    // Watch position continuously for smooth map updates
    watchRef.current = navigator.geolocation.watchPosition(
      (pos) => {
        setPosition({
          lat: pos.coords.latitude,
          lng: pos.coords.longitude,
          accuracy: pos.coords.accuracy,
          speed: pos.coords.speed,
          heading: pos.coords.heading,
          timestamp: pos.timestamp,
        });
        setError(null);
      },
      (err) => setError(err.message),
      { enableHighAccuracy: true, maximumAge: 10000 }
    );

    // Send location to server at interval
    sendTimerRef.current = setInterval(async () => {
      try {
        const pos = await getPosition();
        // Only send if moved significantly (>20m) or first send
        const last = lastSentRef.current;
        if (last) {
          const dist = haversine(last.lat, last.lng, pos.coords.latitude, pos.coords.longitude);
          if (dist < 0.02) return; // Less than 20m, skip
        }
        await sendLocation(pos);
        lastSentRef.current = { lat: pos.coords.latitude, lng: pos.coords.longitude };
      } catch {
        // Skip this interval
      }
    }, interval);

    // Initial send
    getPosition().then(pos => {
      sendLocation(pos);
      lastSentRef.current = { lat: pos.coords.latitude, lng: pos.coords.longitude };
    }).catch(() => {});

    return () => {
      if (watchRef.current != null) navigator.geolocation.clearWatch(watchRef.current);
      if (sendTimerRef.current) clearInterval(sendTimerRef.current);
    };
  }, [enabled, interval, getPosition, sendLocation]);

  return { position, error, getPosition };
}

// Haversine distance in km
function haversine(lat1, lon1, lat2, lon2) {
  const R = 6371;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) * Math.cos((lat2 * Math.PI) / 180) *
    Math.sin(dLon / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}
