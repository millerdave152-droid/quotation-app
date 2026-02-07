/**
 * Get current GPS position with high accuracy.
 * Returns { latitude, longitude, accuracy } or throws on failure.
 */
export function getCurrentPosition() {
  return new Promise((resolve, reject) => {
    navigator.geolocation.getCurrentPosition(
      (position) => resolve({
        latitude: position.coords.latitude,
        longitude: position.coords.longitude,
        accuracy: position.coords.accuracy,
      }),
      (error) => reject(error),
      { enableHighAccuracy: true, timeout: 10000 }
    );
  });
}
