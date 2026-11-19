import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import "./styles.css";

// Red de seguridad: si un error de render deja la ventana en blanco, mostrarlo en pantalla.
class ErrorBoundary extends React.Component<{ children: React.ReactNode }, { error: Error | null }> {
  state = { error: null as Error | null };

  static getDerivedStateFromError(error: Error) {
    return { error };
  }

  componentDidCatch(error: Error, info: React.ErrorInfo) {
    console.error("[NEXUS] error de interfaz", error, info);
  }

  render() {
    if (this.state.error) {
      return (
        <div className="app">
          <div className="card">
            <h3>Error interno de la interfaz</h3>
            <p className="error">{String(this.state.error.message || this.state.error)}</p>
            <button onClick={() => location.reload()}>Reintentar</button>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}

ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
  <React.StrictMode>
    <ErrorBoundary>
      <App />
    </ErrorBoundary>
  </React.StrictMode>
);
