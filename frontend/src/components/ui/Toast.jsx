import React, { createContext, useContext, useState, useCallback, useEffect } from 'react';

/**
 * Toast notification system with accessibility support
 * Features:
 * - Multiple toast types (success, error, warning, info)
 * - Auto-dismiss with configurable duration
 * - Stack management
 * - ARIA live regions for screen readers
 * - Smooth animations
 */

// Toast Context
const ToastContext = createContext(null);

// Toast types and their styles
const TOAST_TYPES = {
  success: {
    bg: '#10b981',
    icon: '✓',
    title: 'Success'
  },
  error: {
    bg: '#ef4444',
    icon: '✕',
    title: 'Error'
  },
  warning: {
    bg: '#f59e0b',
    icon: '⚠',
    title: 'Warning'
  },
  info: {
    bg: '#3b82f6',
    icon: 'ℹ',
    title: 'Info'
  }
};

// Single Toast Component
const ToastItem = ({ toast, onDismiss }) => {
  const [isExiting, setIsExiting] = useState(false);
  const typeStyle = TOAST_TYPES[toast.type] || TOAST_TYPES.info;

  useEffect(() => {
    if (toast.duration > 0) {
      const timer = setTimeout(() => {
        handleDismiss();
      }, toast.duration);
      return () => clearTimeout(timer);
    }
  }, [toast.duration]);

  const handleDismiss = () => {
    setIsExiting(true);
    setTimeout(() => onDismiss(toast.id), 200);
  };

  return (
    <div
      role="alert"
      aria-live="polite"
      style={{
        display: 'flex',
        alignItems: 'flex-start',
        gap: '12px',
        padding: '16px',
        background: 'white',
        borderRadius: '12px',
        boxShadow: '0 10px 25px -5px rgba(0, 0, 0, 0.1), 0 8px 10px -6px rgba(0, 0, 0, 0.1)',
        maxWidth: '400px',
        width: '100%',
        animation: isExiting ? 'toastSlideOut 0.2s ease-in forwards' : 'toastSlideIn 0.3s ease-out',
        borderLeft: `4px solid ${typeStyle.bg}`
      }}
    >
      {/* Icon */}
      <div
        style={{
          width: '28px',
          height: '28px',
          borderRadius: '50%',
          background: `${typeStyle.bg}15`,
          color: typeStyle.bg,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          fontSize: '14px',
          fontWeight: 'bold',
          flexShrink: 0
        }}
        aria-hidden="true"
      >
        {typeStyle.icon}
      </div>

      {/* Content */}
      <div style={{ flex: 1, minWidth: 0 }}>
        {toast.title && (
          <div style={{
            fontWeight: '600',
            fontSize: '14px',
            color: '#1f2937',
            marginBottom: '4px'
          }}>
            {toast.title}
          </div>
        )}
        <div style={{
          fontSize: '14px',
          color: '#6b7280',
          lineHeight: '1.5',
          wordBreak: 'break-word'
        }}>
          {typeof toast.message === 'object'
            ? (toast.message?.message || toast.message?.code || JSON.stringify(toast.message))
            : toast.message}
        </div>
      </div>

      {/* Dismiss button */}
      <button
        onClick={handleDismiss}
        aria-label="Dismiss notification"
        style={{
          background: 'none',
          border: 'none',
          padding: '4px',
          cursor: 'pointer',
          color: '#9ca3af',
          fontSize: '18px',
          lineHeight: 1,
          borderRadius: '4px',
          transition: 'color 0.2s',
          flexShrink: 0
        }}
        onMouseEnter={(e) => e.target.style.color = '#374151'}
        onMouseLeave={(e) => e.target.style.color = '#9ca3af'}
      >
        ×
      </button>

      {/* Progress bar for auto-dismiss */}
      {toast.duration > 0 && (
        <div style={{
          position: 'absolute',
          bottom: 0,
          left: 0,
          right: 0,
          height: '3px',
          background: `${typeStyle.bg}30`,
          borderRadius: '0 0 12px 12px',
          overflow: 'hidden'
        }}>
          <div style={{
            height: '100%',
            background: typeStyle.bg,
            animation: `toastProgress ${toast.duration}ms linear forwards`
          }} />
        </div>
      )}
    </div>
  );
};

// Toast Container Component
const ToastContainer = ({ toasts, onDismiss, position = 'top-right' }) => {
  const positionStyles = {
    'top-right': { top: '20px', right: '20px' },
    'top-left': { top: '20px', left: '20px' },
    'bottom-right': { bottom: '20px', right: '20px' },
    'bottom-left': { bottom: '20px', left: '20px' },
    'top-center': { top: '20px', left: '50%', transform: 'translateX(-50%)' },
    'bottom-center': { bottom: '20px', left: '50%', transform: 'translateX(-50%)' }
  };

  return (
    <div
      role="region"
      aria-label="Notifications"
      aria-live="polite"
      style={{
        position: 'fixed',
        zIndex: 10001,
        display: 'flex',
        flexDirection: 'column',
        gap: '12px',
        ...positionStyles[position]
      }}
    >
      {toasts.map(toast => (
        <ToastItem key={toast.id} toast={toast} onDismiss={onDismiss} />
      ))}

      {/* Animation styles */}
      <style>{`
        @keyframes toastSlideIn {
          from {
            opacity: 0;
            transform: translateX(100%);
          }
          to {
            opacity: 1;
            transform: translateX(0);
          }
        }
        @keyframes toastSlideOut {
          from {
            opacity: 1;
            transform: translateX(0);
          }
          to {
            opacity: 0;
            transform: translateX(100%);
          }
        }
        @keyframes toastProgress {
          from {
            width: 100%;
          }
          to {
            width: 0%;
          }
        }
      `}</style>
    </div>
  );
};

// Toast Provider Component
export const ToastProvider = ({ children, position = 'top-right', maxToasts = 5 }) => {
  const [toasts, setToasts] = useState([]);

  const addToast = useCallback(({ type = 'info', message, title, duration = 5000 }) => {
    const id = Date.now() + Math.random();
    const newToast = { id, type, message, title, duration };

    setToasts(prev => {
      const updated = [newToast, ...prev];
      // Limit number of visible toasts
      return updated.slice(0, maxToasts);
    });

    return id;
  }, [maxToasts]);

  const dismissToast = useCallback((id) => {
    setToasts(prev => prev.filter(toast => toast.id !== id));
  }, []);

  const dismissAll = useCallback(() => {
    setToasts([]);
  }, []);

  // Helper to sanitize message (convert objects to strings)
  const sanitizeMessage = (msg) => {
    if (typeof msg === 'object' && msg !== null) {
      return msg.message || msg.code || msg.error || JSON.stringify(msg);
    }
    return msg;
  };

  // Convenience methods
  const success = useCallback((message, title = 'Success') =>
    addToast({ type: 'success', message: sanitizeMessage(message), title }), [addToast]);

  const error = useCallback((message, title = 'Error') =>
    addToast({ type: 'error', message: sanitizeMessage(message), title, duration: 8000 }), [addToast]);

  const warning = useCallback((message, title = 'Warning') =>
    addToast({ type: 'warning', message: sanitizeMessage(message), title }), [addToast]);

  const info = useCallback((message, title = 'Info') =>
    addToast({ type: 'info', message: sanitizeMessage(message), title }), [addToast]);

  const value = {
    toasts,
    addToast,
    dismissToast,
    dismissAll,
    success,
    error,
    warning,
    info
  };

  return (
    <ToastContext.Provider value={value}>
      {children}
      <ToastContainer toasts={toasts} onDismiss={dismissToast} position={position} />
    </ToastContext.Provider>
  );
};

// Hook to use toast
export const useToast = () => {
  const context = useContext(ToastContext);
  if (!context) {
    throw new Error('useToast must be used within a ToastProvider');
  }
  return context;
};

// Standalone toast function (for use outside React components)
let toastRef = null;

export const setToastRef = (ref) => {
  toastRef = ref;
};

export const toast = {
  success: (message, title) => toastRef?.success(message, title),
  error: (message, title) => toastRef?.error(message, title),
  warning: (message, title) => toastRef?.warning(message, title),
  info: (message, title) => toastRef?.info(message, title)
};

export default ToastProvider;
