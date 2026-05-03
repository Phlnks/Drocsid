import React, { Component, ErrorInfo, ReactNode } from 'react';

interface Props {
  children?: ReactNode;
}

interface State {
  hasError: boolean;
  error?: Error;
}

export class ErrorBoundary extends Component<Props, State> {
  public state: State = {
    hasError: false
  };

  public static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  public componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error('Uncaught error:', error, errorInfo);
  }

  public render() {
    if (this.state.hasError) {
      return (
        <div className="flex flex-col items-center justify-center h-full min-h-[400px] w-full bg-zinc-950 text-white p-6">
          <h1 className="text-xl font-bold text-red-500 mb-4">Something went wrong</h1>
          <div className="bg-black/50 p-4 rounded-lg overflow-auto w-full max-w-4xl text-left border border-zinc-800">
            <pre className="text-sm text-red-400 whitespace-pre-wrap font-mono">
              {this.state.error?.message}
            </pre>
            <pre className="text-xs text-zinc-500 whitespace-pre-wrap mt-4 font-mono overflow-auto">
              {this.state.error?.stack}
            </pre>
          </div>
          <button 
            onClick={() => window.location.reload()}
            className="mt-6 px-4 py-2 bg-indigo-500 hover:bg-indigo-600 rounded-md font-medium transition-colors"
          >
            Reload application
          </button>
        </div>
      );
    }

    return this.props.children;
  }
}
