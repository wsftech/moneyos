import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import {
  AtualizacaoBackgroundCheck,
  AtualizacaoProvider,
} from "./components/AtualizacaoProvider";
import { SplashGate } from "./components/SplashGate";
import { ContextoProvider } from "./contexts/ContextoContext";
import { agendarFechamentoSplashFallback, fecharSplashscreen } from "./services/splash";
import "./index.css";

// Fecha a splash o mais cedo possível (não depende do React tree).
agendarFechamentoSplashFallback();
void fecharSplashscreen();

ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
  <React.StrictMode>
    <ContextoProvider>
      <AtualizacaoProvider>
        <SplashGate>
          <App />
          <AtualizacaoBackgroundCheck />
        </SplashGate>
      </AtualizacaoProvider>
    </ContextoProvider>
  </React.StrictMode>,
);
