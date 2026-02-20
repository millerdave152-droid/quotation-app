/**
 * TeleTime POS - Client Error Tracker
 * Captures JS errors, React render errors, network failures, and unhandled rejections.
 * Batches them and sends to POST /api/errors/client-report.
 */

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

/**
 * Build a stable fingerprint from an error so the backend can deduplicate.
 */
function fingerprint(error, source) {
  const parts = [
    error?.name || 'Error',
    (error?.message || '').slice(0, 120),
    source || '',
  ];
  // Use the first meaningful stack frame when available
  if (error?.stack) {
    const frames = error.stack.split('\n').filter(l => l.includes('at '));
    if (frames.length > 0) parts.push(frames[0].trim().slice(0, 120));
  }
  return hashCode(parts.join('|'));
}

// ============================================================================
// ERROR TRACKER CLASS
// ============================================================================

class ErrorTracker {
  constructor() {
    /** @type {Array<object>} */
    this._queue = [];
    this._flushTimer = null;
    this._installed = false;
    this._maxQueueSize = 50;
    this._flushIntervalMs = 10_000; // 10 s
    this._endpoint = '/api/errors/client-report';
    this._appVersion = null;
    this._userId = null;
    this._shiftId = null;
    this._seen = new Set(); // dedup within same session flush window
  }

  // --------------------------------------------------------------------------
  // PUBLIC API
  // --------------------------------------------------------------------------

  /**
   * Install global listeners. Call once at app startup.
   */
  install() {
    if (this._installed) return;
    this._installed = true;

    // Unhandled promise rejections
    window.addEventListener('unhandledrejection', this._onUnhandledRejection);

    // Global JS errors
    window.addEventListener('error', this._onWindowError);

    // Start periodic flush
    this._flushTimer = setInterval(() => this.flush(), this._flushIntervalMs);
  }

  /**
   * Tear down listeners (e.g., in tests).
   */
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

  /**
   * Set per-session metadata (call after login / shift open).
   */
  setMeta({ userId, shiftId, appVersion } = {}) {
    if (userId !== undefined) this._userId = userId;
    if (shiftId !== undefined) this._shiftId = shiftId;
    if (appVersion !== undefined) this._appVersion = appVersion;
  }

  /**
   * Manually capture an error (e.g., from a catch block or ErrorBoundary).
   */
  captureError(error, { severity = 'error', errorType = 'runtime', context = {}, componentStack } = {}) {
    if (!error) return;

    const fp = fingerprint(error, errorType);

    // Skip duplicates within same flush window
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
      shiftId: this._shiftId,
      appVersion: this._appVersion,
      context,
      timestamp: new Date().toISOString(),
    });

    // Auto-flush if queue is full
    if (this._queue.length >= this._maxQueueSize) {
      this.flush();
    }
  }

  /**
   * Capture a network/API error from an axios response interceptor.
   */
  captureNetworkError(error, { url, method, status } = {}) {
    const message = error?.message || `HTTP ${status || '?'} on ${method?.toUpperCase() || '?'} ${url || '?'}`;
    this.captureError(
      { message, stack: error?.stack || null, name: 'NetworkError' },
      {
        errorType: 'network',
        severity: status >= 500 ? 'error' : 'warning',
        context: { url, method, status },
      }
    );
  }

  /**
   * Send queued errors to the server. Returns silently on failure.
   */
  async flush() {
    if (this._queue.length === 0) return;

    const batch = this._queue.splice(0, this._maxQueueSize);
    this._seen.clear();

    try {
      const token = localStorage.getItem('pos_token');
      const headers = { 'Content-Type': 'application/json' };
      if (token) headers.Authorization = `Bearer ${token}`;

      const res = await fetch(this._endpoint, {
        method: 'POST',
        headers,
        body: JSON.stringify({
          errors: batch,
          meta: {
            userId: this._userId,
            shiftId: this._shiftId,
            appVersion: this._appVersion,
            userAgent: navigator.userAgent,
          },
        }),
      });

      if (!res.ok) {
        // Re-queue on server error (don't lose data)
        if (res.status >= 500) {
          this._queue.unshift(...batch);
        }
      }
    } catch (_) {
      // Network down — re-queue
      this._queue.unshift(...batch);
      // Trim to prevent unbounded growth
      if (this._queue.length > this._maxQueueSize * 3) {
        this._queue.length = this._maxQueueSize * 3;
      }
    }
  }

  // --------------------------------------------------------------------------
  // PRIVATE EVENT HANDLERS
  // --------------------------------------------------------------------------

  _onUnhandledRejection = (event) => {
    const error = event.reason instanceof Error
      ? event.reason
      : { message: String(event.reason), stack: null, name: 'UnhandledRejection' };

    this.captureError(error, { errorType: 'unhandled', severity: 'error' });
  };

  _onWindowError = (event) => {
    // Ignore cross-origin script errors with no useful info
    if (event.message === 'Script error.' && !event.filename) return;

    const error = event.error || {
      message: event.message,
      stack: `at ${event.filename}:${event.lineno}:${event.colno}`,
      name: 'WindowError',
    };

    this.captureError(error, { errorType: 'runtime', severity: 'error' });
  };
}

// ============================================================================
// SINGLETON
// ============================================================================

const errorTracker = new ErrorTracker();

export default errorTracker;
export { ErrorTracker };
