import React from 'react';

/**
 * ErrorBoundary Component
 * Catches JavaScript errors in child components and displays a fallback UI
 * instead of crashing the entire application.
 */
class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = {
      hasError: false,
      error: null,
      errorInfo: null
    };
  }

  static getDerivedStateFromError(error) {
    // Update state so the next render shows the fallback UI
    return { hasError: true, error };
  }

  componentDidCatch(error, errorInfo) {
    // Log error to console for debugging
    console.error('ErrorBoundary caught an error:', error, errorInfo);

    this.setState({ errorInfo });

    // TODO: Send to error tracking service (Sentry, LogRocket, etc.)
    // if (window.Sentry) {
    //   window.Sentry.captureException(error, { extra: errorInfo });
    // }
  }

  handleReload = () => {
    window.location.reload();
  };

  handleGoHome = () => {
    window.location.href = '/quotes';
  };

  render() {
    if (this.state.hasError) {
      // Fallback UI when an error occurs
      return (
        <div style={{
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          minHeight: '100vh',
          padding: '40px 20px',
          background: 'linear-gradient(135deg, #f5f7fa 0%, #c3cfe2 100%)',
          fontFamily: 'system-ui, -apple-system, sans-serif',
        }}>
          <div style={{
            background: 'white',
            borderRadius: '16px',
            padding: '40px',
            maxWidth: '500px',
            width: '100%',
            boxShadow: '0 10px 40px rgba(0,0,0,0.1)',
            textAlign: 'center',
          }}>
            {/* Error Icon */}
            <div style={{ fontSize: '64px', marginBottom: '20px' }}>
              ⚠️
            </div>

            {/* Title */}
            <h1 style={{
              margin: '0 0 12px 0',
              fontSize: '24px',
              fontWeight: '700',
              color: '#1f2937',
            }}>
              Something went wrong
            </h1>

            {/* Description */}
            <p style={{
              margin: '0 0 24px 0',
              fontSize: '16px',
              color: '#6b7280',
              lineHeight: '1.5',
            }}>
              We're sorry, but something unexpected happened.
              Please try refreshing the page or return to the home screen.
            </p>

            {/* Action Buttons */}
            <div style={{ display: 'flex', gap: '12px', justifyContent: 'center', flexWrap: 'wrap' }}>
              <button
                onClick={this.handleReload}
                style={{
                  padding: '12px 24px',
                  background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
                  color: 'white',
                  border: 'none',
                  borderRadius: '8px',
                  fontSize: '15px',
                  fontWeight: '600',
                  cursor: 'pointer',
                  minHeight: '44px',
                  minWidth: '120px',
                }}
              >
                🔄 Refresh Page
              </button>
              <button
                onClick={this.handleGoHome}
                style={{
                  padding: '12px 24px',
                  background: 'white',
                  color: '#667eea',
                  border: '2px solid #667eea',
                  borderRadius: '8px',
                  fontSize: '15px',
                  fontWeight: '600',
                  cursor: 'pointer',
                  minHeight: '44px',
                  minWidth: '120px',
                }}
              >
                🏠 Go to Home
              </button>
            </div>

            {/* Error Details (collapsible for developers) */}
            {process.env.NODE_ENV === 'development' && this.state.error && (
              <details style={{
                marginTop: '24px',
                textAlign: 'left',
                background: '#fef2f2',
                border: '1px solid #fecaca',
                borderRadius: '8px',
                padding: '16px',
              }}>
                <summary style={{
                  cursor: 'pointer',
                  color: '#dc2626',
                  fontWeight: '600',
                  marginBottom: '8px',
                }}>
                  Developer Details
                </summary>
                <pre style={{
                  margin: '12px 0 0 0',
                  padding: '12px',
                  background: '#1f2937',
                  color: '#f3f4f6',
                  borderRadius: '4px',
                  fontSize: '12px',
                  overflow: 'auto',
                  maxHeight: '200px',
                  whiteSpace: 'pre-wrap',
                  wordBreak: 'break-word',
                }}>
                  {this.state.error.toString()}
                  {this.state.errorInfo && this.state.errorInfo.componentStack}
                </pre>
              </details>
            )}
          </div>

          {/* Footer */}
          <p style={{
            marginTop: '24px',
            fontSize: '13px',
            color: '#9ca3af',
          }}>
            If this problem persists, please contact support.
          </p>
        </div>
      );
    }

    // Render children normally when no error
    return this.props.children;
  }
}

export default ErrorBoundary;
