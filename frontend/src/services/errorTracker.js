/**
 * TeleTime Frontend - Client Error Tracker
 * Captures JS errors, React render errors, and unhandled rejections.
 * Batches them and sends to POST /api/errors/client-report.
 */

const API_URL = process.env.REACT_APP_API_URL || 'http://localhost:3001';

// ============================================================================
// FINGERPRINT HELPER
// ============================================================================

function hashCode(str) {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    hash = ((hash << 5) - hash + str.charCodeAt(i)) | 0;
  }
  return Math.abs(hash).toString(36);
}

function fingerprint(error, source) {
  const parts = [
    error?.name || 'Error',
    (error?.message || '').slice(0, 120),
    source || '',
  ];
  if (error?.stack) {
    const frames = error.stack.split('\n').filter(l => l.includes('at '));
    if (frames.length > 0) parts.push(frames[0].trim().slice(0, 120));
  }
  return hashCode(parts.join('|'));
}

// ============================================================================
// ERROR TRACKER
// ============================================================================

class ErrorTracker {
  constructor() {
    this._queue = [];
    this._flushTimer = null;
    this._installed = false;
    this._maxQueueSize = 50;
    this._flushIntervalMs = 10_000;
    this._endpoint = `${API_URL}/api/errors/client-report`;
    this._userId = null;
    this._seen = new Set();
  }

  install() {
    if (this._installed) return;
    this._installed = true;
    window.addEventListener('unhandledrejection', this._onUnhandledRejection);
    window.addEventListener('error', this._onWindowError);
    this._flushTimer = setInterval(() => this.flush(), this._flushIntervalMs);
  }

  uninstall() {
    if (!this._installed) return;
    this._installed = false;
    window.removeEventListener('unhandledrejection', this._onUnhandledRejection);
    window.removeEventListener('error', this._onWindowError);
    if (this._flushTimer) {
      clearInterval(this._flushTimer);
      this._flushTimer = null;
    }
  }

  setMeta({ userId } = {}) {
    if (userId !== undefined) this._userId = userId;
  }

  captureError(error, { severity = 'error', errorType = 'runtime', context = {}, componentStack } = {}) {
    if (!error) return;
    const fp = fingerprint(error, errorType);
    if (this._seen.has(fp)) return;
    this._seen.add(fp);

    this._queue.push({
      fingerprint: fp,
      errorType,
      severity,
      message: error.message || String(error),
      stackTrace: error.stack || null,
      componentStack: componentStack || null,
      url: window.location.href,
      userId: this._userId,
      context,
      timestamp: new Date().toISOString(),
    });

    if (this._queue.length >= this._maxQueueSize) {
      this.flush();
    }
  }

  async flush() {
    if (this._queue.length === 0) return;
    const batch = this._queue.splice(0, this._maxQueueSize);
    this._seen.clear();

    try {
      const token = localStorage.getItem('auth_token');
      const headers = { 'Content-Type': 'application/json' };
      if (token) headers.Authorization = `Bearer ${token}`;

      const res = await fetch(this._endpoint, {
        method: 'POST',
        headers,
        body: JSON.stringify({
          errors: batch,
          meta: { userId: this._userId, userAgent: navigator.userAgent },
        }),
      });

      if (!res.ok && res.status >= 500) {
        this._queue.unshift(...batch);
      }
    } catch (_) {
      this._queue.unshift(...batch);
      if (this._queue.length > this._maxQueueSize * 3) {
        this._queue.length = this._maxQueueSize * 3;
      }
    }
  }

  _onUnhandledRejection = (event) => {
    const error = event.reason instanceof Error
      ? event.reason
      : { message: String(event.reason), stack: null, name: 'UnhandledRejection' };
    this.captureError(error, { errorType: 'unhandled', severity: 'error' });
  };

  _onWindowError = (event) => {
    if (event.message === 'Script error.' && !event.filename) return;
    const error = event.error || {
      message: event.message,
      stack: `at ${event.filename}:${event.lineno}:${event.colno}`,
      name: 'WindowError',
    };
    this.captureError(error, { errorType: 'runtime', severity: 'error' });
  };
}

const errorTracker = new ErrorTracker();
export default errorTracker;
