import React, { ErrorInfo, ReactNode } from 'react';

interface Props {
    children?: ReactNode;
}

interface State {
    hasError: boolean;
    error: Error | null;
    errorInfo: ErrorInfo | null;
}

class ErrorBoundary extends React.Component<Props, State> {
    public state: State = {
        hasError: false,
        error: null,
        errorInfo: null
    };

    static getDerivedStateFromError(error: Error): State {
        return { hasError: true, error, errorInfo: null };
    }

    componentDidCatch(error: Error, errorInfo: ErrorInfo) {
        console.error('Uncaught error:', error, errorInfo);
        this.setState({ error, errorInfo });
    }

    render() {
        if (this.state.hasError) {
            return (
                <div className="flex flex-col items-center justify-center h-full w-full p-8 bg-red-50 dark:bg-red-900/10 text-red-800 dark:text-red-200 text-center">
                    <h1 className="text-2xl font-bold mb-4">Something went wrong.</h1>
                    <p className="font-mono text-sm bg-red-100 dark:bg-red-900/30 p-4 rounded border border-red-200 dark:border-red-800 break-all max-w-2xl text-left">
                        {this.state.error?.toString()}
                    </p>
                    <pre className="mt-4 text-xs overflow-auto max-w-2xl max-h-64 bg-slate-100 dark:bg-slate-900 p-4 rounded text-left">
                        {this.state.errorInfo?.componentStack}
                    </pre>
                    <button
                        onClick={() => window.location.reload()}
                        className="mt-6 px-4 py-2 bg-red-600 text-white rounded hover:bg-red-700 transition-colors shadow-lg"
                    >
                        Reload Application
                    </button>
                </div>
            );
        }

        return this.props.children;
    }
}

export default ErrorBoundary;
