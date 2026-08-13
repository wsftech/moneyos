import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import {
  AtualizacaoBackgroundCheck,
  AtualizacaoProvider,
} from "./components/AtualizacaoProvider";
import { ConfirmProvider } from "./components/ConfirmDialog";
import { SplashGate } from "./components/SplashGate";
import { ContextoProvider } from "./contexts/ContextoContext";
import { agendarFechamentoSplashFallback } from "./services/splash";
import "./index.css";

// Só agenda o timeout de segurança — a splash fecha quando o boot estiver pronto.
agendarFechamentoSplashFallback();

ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
  <React.StrictMode>
    <ContextoProvider>
      <ConfirmProvider>
        <AtualizacaoProvider>
          <SplashGate>
            <App />
            <AtualizacaoBackgroundCheck />
          </SplashGate>
        </AtualizacaoProvider>
      </ConfirmProvider>
    </ContextoProvider>
  </React.StrictMode>,
);
