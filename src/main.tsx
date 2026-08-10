import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import { ContextoProvider } from "./contexts/ContextoContext";
import "./index.css";

ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
  <React.StrictMode>
    <ContextoProvider>
      <App />
    </ContextoProvider>
  </React.StrictMode>,
);
