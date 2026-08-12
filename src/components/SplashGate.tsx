import { useEffect } from "react";
import { agendarFechamentoSplashFallback, fecharSplashscreen } from "../services/splash";

/**
 * Fecha a splash assim que o React monta (não espera DB/contexto).
 * Há também timeout de segurança no Rust (~4s).
 */
export function SplashGate({ children }: { children: React.ReactNode }) {
  useEffect(() => {
    agendarFechamentoSplashFallback();
    void fecharSplashscreen();
  }, []);

  return <>{children}</>;
}
