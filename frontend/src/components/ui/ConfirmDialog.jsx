import React, { useEffect, useRef } from 'react';

/**
 * Accessible confirmation dialog to replace window.confirm()
 * Features:
 * - Keyboard navigation (Escape to cancel, Enter to confirm)
 * - Focus trap
 * - ARIA labels
 * - Customizable appearance
 */

const ConfirmDialog = ({
  isOpen,
  onConfirm,
  onCancel,
  title = 'Confirm Action',
  message = 'Are you sure you want to proceed?',
  confirmText = 'Confirm',
  cancelText = 'Cancel',
  variant = 'default', // 'default', 'danger', 'warning'
  icon = null,
  loading = false
}) => {
  const dialogRef = useRef(null);
  const confirmButtonRef = useRef(null);

  // Focus management
  useEffect(() => {
    if (isOpen && confirmButtonRef.current) {
      confirmButtonRef.current.focus();
    }
  }, [isOpen]);

  // Keyboard handling
  useEffect(() => {
    if (!isOpen) return;

    const handleKeyDown = (e) => {
      if (e.key === 'Escape') {
        onCancel();
      } else if (e.key === 'Tab') {
        // Trap focus within dialog
        const focusableElements = dialogRef.current?.querySelectorAll(
          'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
        );
        if (focusableElements?.length) {
          const firstElement = focusableElements[0];
          const lastElement = focusableElements[focusableElements.length - 1];

          if (e.shiftKey && document.activeElement === firstElement) {
            e.preventDefault();
            lastElement.focus();
          } else if (!e.shiftKey && document.activeElement === lastElement) {
            e.preventDefault();
            firstElement.focus();
          }
        }
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onCancel]);

  // Prevent body scroll when open
  useEffect(() => {
    if (isOpen) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = '';
    }
    return () => {
      document.body.style.overflow = '';
    };
  }, [isOpen]);

  if (!isOpen) return null;

  const variantStyles = {
    default: {
      confirmBg: '#3b82f6',
      confirmHover: '#2563eb',
      iconBg: '#dbeafe',
      iconColor: '#3b82f6'
    },
    danger: {
      confirmBg: '#ef4444',
      confirmHover: '#dc2626',
      iconBg: '#fee2e2',
      iconColor: '#ef4444'
    },
    warning: {
      confirmBg: '#f59e0b',
      confirmHover: '#d97706',
      iconBg: '#fef3c7',
      iconColor: '#f59e0b'
    }
  };

  const styles = variantStyles[variant] || variantStyles.default;

  const defaultIcons = {
    default: '❓',
    danger: '⚠️',
    warning: '⚡'
  };

  const displayIcon = icon || defaultIcons[variant] || defaultIcons.default;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="dialog-title"
      aria-describedby="dialog-description"
      style={{
        position: 'fixed',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        background: 'rgba(0, 0, 0, 0.5)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 10000,
        padding: '20px'
      }}
      onClick={(e) => {
        if (e.target === e.currentTarget) onCancel();
      }}
    >
      <div
        ref={dialogRef}
        style={{
          background: 'white',
          borderRadius: '16px',
          padding: '24px',
          maxWidth: '400px',
          width: '100%',
          boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.25)',
          animation: 'dialogSlideIn 0.2s ease-out'
        }}
      >
        {/* Icon */}
        <div
          style={{
            width: '48px',
            height: '48px',
            borderRadius: '50%',
            background: styles.iconBg,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            margin: '0 auto 16px',
            fontSize: '24px'
          }}
          aria-hidden="true"
        >
          {displayIcon}
        </div>

        {/* Title */}
        <h2
          id="dialog-title"
          style={{
            margin: '0 0 8px',
            fontSize: '20px',
            fontWeight: '600',
            textAlign: 'center',
            color: '#1f2937'
          }}
        >
          {title}
        </h2>

        {/* Message */}
        <p
          id="dialog-description"
          style={{
            margin: '0 0 24px',
            fontSize: '14px',
            color: '#6b7280',
            textAlign: 'center',
            lineHeight: '1.5'
          }}
        >
          {message}
        </p>

        {/* Actions */}
        <div
          style={{
            display: 'flex',
            gap: '12px',
            justifyContent: 'center'
          }}
          role="group"
          aria-label="Dialog actions"
        >
          <button
            onClick={onCancel}
            disabled={loading}
            aria-label={`${cancelText} and close dialog`}
            style={{
              padding: '12px 24px',
              background: '#f3f4f6',
              border: 'none',
              borderRadius: '8px',
              fontSize: '14px',
              fontWeight: '600',
              color: '#374151',
              cursor: loading ? 'not-allowed' : 'pointer',
              transition: 'background 0.2s',
              opacity: loading ? 0.7 : 1
            }}
            onMouseEnter={(e) => !loading && (e.target.style.background = '#e5e7eb')}
            onMouseLeave={(e) => (e.target.style.background = '#f3f4f6')}
          >
            {cancelText}
          </button>
          <button
            ref={confirmButtonRef}
            onClick={onConfirm}
            disabled={loading}
            aria-label={loading ? 'Processing...' : confirmText}
            aria-busy={loading}
            style={{
              padding: '12px 24px',
              background: styles.confirmBg,
              border: 'none',
              borderRadius: '8px',
              fontSize: '14px',
              fontWeight: '600',
              color: 'white',
              cursor: loading ? 'not-allowed' : 'pointer',
              transition: 'background 0.2s',
              display: 'flex',
              alignItems: 'center',
              gap: '8px',
              opacity: loading ? 0.7 : 1
            }}
            onMouseEnter={(e) => !loading && (e.target.style.background = styles.confirmHover)}
            onMouseLeave={(e) => (e.target.style.background = styles.confirmBg)}
          >
            {loading && (
              <span
                style={{
                  width: '16px',
                  height: '16px',
                  border: '2px solid rgba(255,255,255,0.3)',
                  borderTopColor: 'white',
                  borderRadius: '50%',
                  animation: 'spin 0.8s linear infinite'
                }}
                aria-hidden="true"
              />
            )}
            {confirmText}
          </button>
        </div>
      </div>

      {/* Animation styles */}
      <style>{`
        @keyframes dialogSlideIn {
          from {
            opacity: 0;
            transform: scale(0.95) translateY(-10px);
          }
          to {
            opacity: 1;
            transform: scale(1) translateY(0);
          }
        }
      `}</style>
    </div>
  );
};

// Hook for easier usage
export const useConfirmDialog = () => {
  const [dialogState, setDialogState] = React.useState({
    isOpen: false,
    title: '',
    message: '',
    variant: 'default',
    onConfirm: () => {},
    loading: false
  });

  const confirm = ({
    title = 'Confirm Action',
    message = 'Are you sure?',
    variant = 'default',
    confirmText = 'Confirm',
    cancelText = 'Cancel'
  }) => {
    return new Promise((resolve) => {
      setDialogState({
        isOpen: true,
        title,
        message,
        variant,
        confirmText,
        cancelText,
        loading: false,
        onConfirm: () => {
          setDialogState(prev => ({ ...prev, isOpen: false }));
          resolve(true);
        },
        onCancel: () => {
          setDialogState(prev => ({ ...prev, isOpen: false }));
          resolve(false);
        }
      });
    });
  };

  const DialogComponent = () => (
    <ConfirmDialog
      isOpen={dialogState.isOpen}
      title={dialogState.title}
      message={dialogState.message}
      variant={dialogState.variant}
      confirmText={dialogState.confirmText}
      cancelText={dialogState.cancelText}
      loading={dialogState.loading}
      onConfirm={dialogState.onConfirm}
      onCancel={dialogState.onCancel}
    />
  );

  return { confirm, DialogComponent };
};

export default ConfirmDialog;
