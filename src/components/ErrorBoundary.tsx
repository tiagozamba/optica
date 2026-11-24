import React from 'react';
import { AlertTriangle, RotateCcw } from 'lucide-react';

interface ErrorBoundaryState {
  hasError: boolean;
  message: string;
  detail: string;
}

export class ErrorBoundary extends React.Component<
  { children: React.ReactNode },
  ErrorBoundaryState
> {
  constructor(props: { children: React.ReactNode }) {
    super(props);
    this.state = {
      hasError: false,
      message: '',
      detail: '',
    };
  }

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    let parsedMessage = error.message || 'Ocurrió un error inesperado en la aplicación.';
    let detail = '';
    try {
      const parsed = JSON.parse(error.message) as {
        error?: string;
        operationType?: string;
        path?: string;
      };
      if (parsed && parsed.error) {
        parsedMessage = parsed.error.includes('permission') || parsed.error.includes('Missing or insufficient')
          ? 'Permiso denegado al acceder a la base de datos. Verificá tu rol asignado o consultá con el Administrador.'
          : parsed.error;
        detail = `Operación: ${parsed.operationType ?? 'desconocida'} · Ruta: ${parsed.path ?? '—'}`;
      }
    } catch {
      // Plain error message
    }
    return {
      hasError: true,
      message: parsedMessage,
      detail,
    };
  }

  handleReset = () => {
    this.setState({ hasError: false, message: '', detail: '' });
    window.location.reload();
  };

  render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-screen bg-slate-50 flex items-center justify-center p-6">
          <div className="max-w-lg w-full bg-white border border-slate-200 rounded-xl p-8">
            <div className="flex items-center gap-3 text-rose-700 mb-4">
              <AlertTriangle className="w-6 h-6 shrink-0" />
              <h1 className="text-xl font-semibold text-slate-900">
                Se interrumpió la operación actual
              </h1>
            </div>
            <p className="text-sm text-slate-600 leading-relaxed mb-4">
              {this.state.message}
            </p>
            {this.state.detail && (
              <p className="font-mono text-xs text-slate-500 bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 mb-6">
                {this.state.detail}
              </p>
            )}
            <button
              type="button"
              onClick={this.handleReset}
              className="inline-flex items-center gap-2 px-4 py-2.5 bg-[#0F4C81] hover:bg-[#0B3A63] text-white text-sm font-medium rounded-lg transition-colors whitespace-nowrap shrink-0"
            >
              <RotateCcw className="w-4 h-4" />
              Recargar sistema
            </button>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
