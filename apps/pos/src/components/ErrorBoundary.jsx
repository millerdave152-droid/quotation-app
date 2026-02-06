/**
 * TeleTime POS - Error Boundary Component
 * Catches JavaScript errors and displays a fallback UI
 */

import { Component } from 'react';
import { ExclamationTriangleIcon, ArrowPathIcon } from '@heroicons/react/24/outline';

/**
 * Error boundary to catch rendering errors
 */
export class ErrorBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null, errorInfo: null };
  }

  static getDerivedStateFromError(error) {
    return { hasError: true, error };
  }

  componentDidCatch(error, errorInfo) {
    this.setState({ errorInfo });

    // Log error to console in development
    console.error('[ErrorBoundary] Caught error:', error, errorInfo);

    // In production, you could send this to an error tracking service
    if (import.meta.env.PROD) {
      // TODO: Send to error tracking service
      // sendToErrorTracking({ error, errorInfo, url: window.location.href });
    }
  }

  handleReload = () => {
    window.location.reload();
  };

  handleGoHome = () => {
    window.location.href = '/';
  };

  handleReset = () => {
    this.setState({ hasError: false, error: null, errorInfo: null });
  };

  render() {
    if (this.state.hasError) {
      const isDev = import.meta.env.DEV;

      return (
        <div className="min-h-screen bg-slate-800 flex items-center justify-center p-4">
          <div className="max-w-lg w-full">
            {/* Error Card */}
            <div className="bg-white rounded-2xl shadow-2xl p-8 text-center">
              {/* Icon */}
              <div className="w-20 h-20 mx-auto mb-6 bg-red-100 rounded-full flex items-center justify-center">
                <ExclamationTriangleIcon className="w-10 h-10 text-red-600" />
              </div>

              {/* Title */}
              <h1 className="text-2xl font-bold text-gray-900 mb-2">
                Something went wrong
              </h1>

              {/* Description */}
              <p className="text-gray-600 mb-6">
                An unexpected error occurred. Please try refreshing the page or returning to the home screen.
              </p>

              {/* Error Details (Development Only) */}
              {isDev && this.state.error && (
                <div className="mb-6 p-4 bg-gray-100 rounded-lg text-left overflow-x-auto">
                  <p className="text-sm font-mono text-red-600 mb-2">
                    {this.state.error.toString()}
                  </p>
                  {this.state.errorInfo?.componentStack && (
                    <pre className="text-xs text-gray-600 whitespace-pre-wrap">
                      {this.state.errorInfo.componentStack}
                    </pre>
                  )}
                </div>
              )}

              {/* Actions */}
              <div className="flex flex-col sm:flex-row gap-3 justify-center">
                <button
                  type="button"
                  onClick={this.handleReload}
                  className="
                    flex items-center justify-center gap-2
                    h-12 px-6
                    bg-blue-600 hover:bg-blue-700
                    text-white font-medium
                    rounded-xl
                    transition-colors
                  "
                >
                  <ArrowPathIcon className="w-5 h-5" />
                  Refresh Page
                </button>

                <button
                  type="button"
                  onClick={this.handleGoHome}
                  className="
                    flex items-center justify-center gap-2
                    h-12 px-6
                    bg-gray-200 hover:bg-gray-300
                    text-gray-700 font-medium
                    rounded-xl
                    transition-colors
                  "
                >
                  Go to Home
                </button>
              </div>

              {/* Try Again (Development) */}
              {isDev && (
                <button
                  type="button"
                  onClick={this.handleReset}
                  className="mt-4 text-sm text-gray-500 hover:text-gray-700 underline"
                >
                  Try to render again
                </button>
              )}
            </div>

            {/* Footer */}
            <p className="text-center text-gray-500 text-sm mt-6">
              If this problem persists, please contact support.
            </p>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}

export default ErrorBoundary;
