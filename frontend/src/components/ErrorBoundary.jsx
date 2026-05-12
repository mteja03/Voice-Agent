import { Component } from 'react';
import { AlertTriangle } from 'lucide-react';

/**
 * ErrorBoundary — catches render-time JS errors in child components and
 * shows a recoverable error UI instead of a blank screen.
 *
 * Usage:
 *   <ErrorBoundary label="Dialer">
 *     <Dialer ... />
 *   </ErrorBoundary>
 */
export default class ErrorBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { error: null };
  }

  static getDerivedStateFromError(error) {
    return { error };
  }

  componentDidCatch(error, info) {
    // Log to console so devs can see the stack trace
    console.error(`[ErrorBoundary: ${this.props.label || 'unknown'}]`, error, info.componentStack);
  }

  render() {
    if (this.state.error) {
      return (
        <div className="flex flex-col items-center justify-center flex-1 min-h-[300px] gap-4 px-6 text-center">
          <div className="w-14 h-14 rounded-full bg-red-100 dark:bg-red-950/40 flex items-center justify-center">
            <AlertTriangle className="w-7 h-7 text-red-600 dark:text-red-400" aria-hidden />
          </div>
          <div>
            <h2 className="text-lg font-semibold text-slate-900 dark:text-white mb-1">
              Something went wrong
            </h2>
            <p className="text-sm text-slate-600 dark:text-gray-400 mb-4">
              {this.props.label
                ? `The ${this.props.label} panel ran into an error.`
                : 'An unexpected error occurred.'}
            </p>
            <button
              type="button"
              onClick={() => this.setState({ error: null })}
              className="px-4 py-2 rounded-xl text-sm font-medium bg-brand-500 text-black hover:bg-brand-400 transition-colors"
            >
              Try again
            </button>
          </div>
          {import.meta.env.DEV && (
            <details className="text-left max-w-md w-full mt-2">
              <summary className="text-xs text-slate-500 cursor-pointer hover:text-slate-700">
                Error details (dev only)
              </summary>
              <pre className="text-[10px] text-red-700 dark:text-red-400 bg-red-50 dark:bg-red-950/30 rounded-lg p-3 mt-2 overflow-auto max-h-40 whitespace-pre-wrap">
                {this.state.error?.message}
                {'\n\n'}
                {this.state.error?.stack}
              </pre>
            </details>
          )}
        </div>
      );
    }

    return this.props.children;
  }
}
