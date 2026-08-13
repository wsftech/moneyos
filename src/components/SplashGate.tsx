import { useEffect } from "react";
import { useContexto } from "../contexts/ContextoContext";
import { agendarFechamentoSplashFallback, fecharSplashscreen } from "../services/splash";

/**
 * Mantém a splash até o contexto (e o boot básico do app) estar pronto.
 * Fallback de segurança: timeout no frontend + ~5s no Rust.
 */
export function SplashGate({ children }: { children: React.ReactNode }) {
  const { loading } = useContexto();

  useEffect(() => {
    agendarFechamentoSplashFallback();
  }, []);

  useEffect(() => {
    if (loading) return;
    void fecharSplashscreen();
  }, [loading]);

  return <>{children}</>;
}
