/**
 * TeleTime POS - Notification Preferences Modal
 *
 * Allows users to manage push notification settings:
 *   - Enable/disable push notifications (with browser permission flow)
 *   - Toggle notification sounds
 *   - Set quiet hours (start / end time)
 */

import { useState, useEffect, useCallback } from 'react';
import {
  XMarkIcon,
  BellIcon,
  BellSlashIcon,
  SpeakerWaveIcon,
  SpeakerXMarkIcon,
  MoonIcon,
  ExclamationTriangleIcon,
  CheckCircleIcon,
  ArrowPathIcon,
} from '@heroicons/react/24/outline';
import { usePushNotifications } from '../../hooks/usePushNotifications';
import api from '../../api/axios';

export function NotificationPreferences({ isOpen, onClose }) {
  const {
    isSupported,
    permission,
    isSubscribed,
    loading: pushLoading,
    subscribe,
    unsubscribe,
  } = usePushNotifications();

  const [prefs, setPrefs] = useState({
    pushEnabled: true,
    soundEnabled: true,
    quietStart: '',
    quietEnd: '',
  });
  const [loadingPrefs, setLoadingPrefs] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState('');

  // Fetch preferences when modal opens
  useEffect(() => {
    if (!isOpen) return;
    setSaved(false);
    setError('');

    let cancelled = false;
    (async () => {
      setLoadingPrefs(true);
      try {
        const res = await api.get('/push/preferences');
        const data = res?.data?.data || res?.data;
        if (!cancelled && data) {
          setPrefs({
            pushEnabled: data.push_enabled ?? true,
            soundEnabled: data.sound_enabled ?? true,
            quietStart: data.quiet_start ? data.quiet_start.slice(0, 5) : '',
            quietEnd: data.quiet_end ? data.quiet_end.slice(0, 5) : '',
          });
        }
      } catch {
        // Use defaults on error
      } finally {
        if (!cancelled) setLoadingPrefs(false);
      }
    })();
    return () => { cancelled = true; };
  }, [isOpen]);

  // Save preferences to backend
  const savePrefs = useCallback(async (newPrefs) => {
    setSaving(true);
    setError('');
    setSaved(false);
    try {
      await api.put('/push/preferences', {
        pushEnabled: newPrefs.pushEnabled,
        soundEnabled: newPrefs.soundEnabled,
        quietStart: newPrefs.quietStart || null,
        quietEnd: newPrefs.quietEnd || null,
      });
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    } catch (err) {
      setError(err?.response?.data?.message || 'Failed to save preferences');
    } finally {
      setSaving(false);
    }
  }, []);

  // Toggle push notifications
  const handleTogglePush = async () => {
    if (!isSubscribed) {
      // Subscribe
      const ok = await subscribe();
      if (ok) {
        const updated = { ...prefs, pushEnabled: true };
        setPrefs(updated);
        await savePrefs(updated);
      }
    } else {
      // Unsubscribe
      await unsubscribe();
      const updated = { ...prefs, pushEnabled: false };
      setPrefs(updated);
      await savePrefs(updated);
    }
  };

  // Toggle sound
  const handleToggleSound = async () => {
    const updated = { ...prefs, soundEnabled: !prefs.soundEnabled };
    setPrefs(updated);
    await savePrefs(updated);
  };

  // Update quiet hours
  const handleQuietChange = (field, value) => {
    setPrefs((prev) => ({ ...prev, [field]: value }));
  };

  const handleQuietSave = async () => {
    await savePrefs(prefs);
  };

  // Clear quiet hours
  const handleClearQuiet = async () => {
    const updated = { ...prefs, quietStart: '', quietEnd: '' };
    setPrefs(updated);
    await savePrefs(updated);
  };

  if (!isOpen) return null;

  const permissionDenied = permission === 'denied';
  const isActive = isSubscribed && prefs.pushEnabled;
  const hasQuietHours = prefs.quietStart && prefs.quietEnd;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/50" onClick={onClose} />
      <div className="relative bg-white rounded-2xl shadow-2xl max-w-md w-full max-h-[90vh] overflow-y-auto">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 bg-blue-50 rounded-lg flex items-center justify-center">
              <BellIcon className="w-5 h-5 text-blue-600" />
            </div>
            <h2 className="text-lg font-bold text-gray-900">Notification Settings</h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="w-9 h-9 flex items-center justify-center text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-lg transition-colors"
          >
            <XMarkIcon className="w-5 h-5" />
          </button>
        </div>

        <div className="p-6 space-y-6">
          {/* Status Banner */}
          {saved && (
            <div className="flex items-center gap-2 p-3 bg-green-50 border border-green-200 rounded-lg text-sm text-green-700">
              <CheckCircleIcon className="w-5 h-5 flex-shrink-0" />
              Settings saved
            </div>
          )}
          {error && (
            <div className="flex items-center gap-2 p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700">
              <ExclamationTriangleIcon className="w-5 h-5 flex-shrink-0" />
              {error}
            </div>
          )}

          {/* Browser Support Warning */}
          {!isSupported && (
            <div className="flex items-start gap-3 p-4 bg-amber-50 border border-amber-200 rounded-xl">
              <ExclamationTriangleIcon className="w-5 h-5 text-amber-600 flex-shrink-0 mt-0.5" />
              <div>
                <p className="text-sm font-medium text-amber-800">Push notifications not supported</p>
                <p className="text-xs text-amber-600 mt-1">
                  Your browser does not support push notifications. Try using Chrome, Edge, or Firefox.
                </p>
              </div>
            </div>
          )}

          {/* Permission Denied Warning */}
          {isSupported && permissionDenied && (
            <div className="flex items-start gap-3 p-4 bg-red-50 border border-red-200 rounded-xl">
              <BellSlashIcon className="w-5 h-5 text-red-500 flex-shrink-0 mt-0.5" />
              <div>
                <p className="text-sm font-medium text-red-800">Notifications blocked</p>
                <p className="text-xs text-red-600 mt-1">
                  You previously blocked notifications for this site. To re-enable, click the lock icon
                  in your browser's address bar and allow notifications.
                </p>
              </div>
            </div>
          )}

          {/* Loading State */}
          {loadingPrefs ? (
            <div className="space-y-4">
              {[1, 2, 3].map((i) => (
                <div key={i} className="h-16 bg-gray-100 rounded-xl animate-pulse" />
              ))}
            </div>
          ) : (
            <>
              {/* ─── Push Notifications Toggle ─── */}
              <div className="flex items-center justify-between p-4 bg-gray-50 rounded-xl">
                <div className="flex items-center gap-3">
                  {isActive ? (
                    <BellIcon className="w-6 h-6 text-blue-600" />
                  ) : (
                    <BellSlashIcon className="w-6 h-6 text-gray-400" />
                  )}
                  <div>
                    <p className="text-sm font-semibold text-gray-900">Push Notifications</p>
                    <p className="text-xs text-gray-500">
                      {isActive
                        ? 'Receiving alerts for approval requests'
                        : 'Enable to get notified of new approval requests'}
                    </p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={handleTogglePush}
                  disabled={!isSupported || permissionDenied || pushLoading}
                  className={`relative inline-flex h-7 w-12 items-center rounded-full transition-colors focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 disabled:opacity-50 disabled:cursor-not-allowed ${
                    isActive ? 'bg-blue-600' : 'bg-gray-300'
                  }`}
                >
                  {pushLoading ? (
                    <ArrowPathIcon className="w-4 h-4 text-white absolute left-1/2 -translate-x-1/2 animate-spin" />
                  ) : (
                    <span
                      className={`inline-block h-5 w-5 rounded-full bg-white shadow-sm transform transition-transform ${
                        isActive ? 'translate-x-6' : 'translate-x-1'
                      }`}
                    />
                  )}
                </button>
              </div>

              {/* ─── Sound Toggle ─── */}
              <div className="flex items-center justify-between p-4 bg-gray-50 rounded-xl">
                <div className="flex items-center gap-3">
                  {prefs.soundEnabled ? (
                    <SpeakerWaveIcon className="w-6 h-6 text-blue-600" />
                  ) : (
                    <SpeakerXMarkIcon className="w-6 h-6 text-gray-400" />
                  )}
                  <div>
                    <p className="text-sm font-semibold text-gray-900">Notification Sound</p>
                    <p className="text-xs text-gray-500">
                      {prefs.soundEnabled ? 'Sound plays on new notifications' : 'Notifications are silent'}
                    </p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={handleToggleSound}
                  disabled={saving}
                  className={`relative inline-flex h-7 w-12 items-center rounded-full transition-colors focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 disabled:opacity-50 ${
                    prefs.soundEnabled ? 'bg-blue-600' : 'bg-gray-300'
                  }`}
                >
                  <span
                    className={`inline-block h-5 w-5 rounded-full bg-white shadow-sm transform transition-transform ${
                      prefs.soundEnabled ? 'translate-x-6' : 'translate-x-1'
                    }`}
                  />
                </button>
              </div>

              {/* ─── Quiet Hours ─── */}
              <div className="p-4 bg-gray-50 rounded-xl space-y-3">
                <div className="flex items-center gap-3">
                  <MoonIcon className="w-6 h-6 text-indigo-500" />
                  <div>
                    <p className="text-sm font-semibold text-gray-900">Quiet Hours</p>
                    <p className="text-xs text-gray-500">
                      No push notifications during this time window
                    </p>
                  </div>
                </div>

                <div className="flex items-center gap-3">
                  <div className="flex-1">
                    <label className="block text-xs font-medium text-gray-600 mb-1">Start</label>
                    <input
                      type="time"
                      value={prefs.quietStart}
                      onChange={(e) => handleQuietChange('quietStart', e.target.value)}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm text-gray-900 focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                    />
                  </div>
                  <span className="text-gray-400 mt-5">to</span>
                  <div className="flex-1">
                    <label className="block text-xs font-medium text-gray-600 mb-1">End</label>
                    <input
                      type="time"
                      value={prefs.quietEnd}
                      onChange={(e) => handleQuietChange('quietEnd', e.target.value)}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm text-gray-900 focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                    />
                  </div>
                </div>

                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={handleQuietSave}
                    disabled={saving || (!prefs.quietStart && !prefs.quietEnd)}
                    className="px-3 py-1.5 text-xs font-medium text-white bg-blue-600 hover:bg-blue-700 rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    {saving ? 'Saving...' : 'Save Hours'}
                  </button>
                  {hasQuietHours && (
                    <button
                      type="button"
                      onClick={handleClearQuiet}
                      disabled={saving}
                      className="px-3 py-1.5 text-xs font-medium text-gray-600 hover:text-gray-800 hover:bg-gray-200 rounded-lg transition-colors"
                    >
                      Clear
                    </button>
                  )}
                  {hasQuietHours && (
                    <span className="text-xs text-gray-500 ml-auto">
                      Active: {prefs.quietStart} &ndash; {prefs.quietEnd}
                    </span>
                  )}
                </div>
              </div>

              {/* ─── Info ─── */}
              <div className="text-xs text-gray-400 text-center px-4">
                Push notifications alert you to price override requests even when the app is in the background.
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
