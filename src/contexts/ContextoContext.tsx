import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { getConfiguracao, setConfiguracao } from "../db/configuracoes";
import { categoriaContextoMatches, contextoMatches } from "../db/utils";
import type { Contexto, ContextoCategoria, ContextoVisualizacao } from "../types";

const CONFIG_KEY = "contexto_visualizacao";
const DEFAULT_CONTEXTO: ContextoVisualizacao = "consolidado";

interface ContextoContextValue {
  contexto: ContextoVisualizacao;
  setContexto: (contexto: ContextoVisualizacao) => Promise<void>;
  loading: boolean;
  matchesContexto: (itemContexto: Contexto) => boolean;
  matchesCategoriaContexto: (categoriaContexto: ContextoCategoria) => boolean;
  label: string;
}

const ContextoContext = createContext<ContextoContextValue | null>(null);

const LABELS: Record<ContextoVisualizacao, string> = {
  pessoal: "Pessoal",
  empresa: "Empresa",
  consolidado: "Consolidado",
};

export function ContextoProvider({ children }: { children: ReactNode }) {
  const [contexto, setContextoState] = useState<ContextoVisualizacao>(DEFAULT_CONTEXTO);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function loadContexto() {
      try {
        const saved = await getConfiguracao(CONFIG_KEY);
        if (saved === "pessoal" || saved === "empresa" || saved === "consolidado") {
          setContextoState(saved);
        }
      } finally {
        setLoading(false);
      }
    }
    void loadContexto();
  }, []);

  const setContexto = useCallback(async (novoContexto: ContextoVisualizacao) => {
    setContextoState(novoContexto);
    await setConfiguracao(CONFIG_KEY, novoContexto);
  }, []);

  const value = useMemo<ContextoContextValue>(
    () => ({
      contexto,
      setContexto,
      loading,
      matchesContexto: (itemContexto) => contextoMatches(itemContexto, contexto),
      matchesCategoriaContexto: (categoriaContexto) =>
        categoriaContextoMatches(categoriaContexto, contexto),
      label: LABELS[contexto],
    }),
    [contexto, setContexto, loading],
  );

  return <ContextoContext.Provider value={value}>{children}</ContextoContext.Provider>;
}

export function useContexto(): ContextoContextValue {
  const ctx = useContext(ContextoContext);
  if (!ctx) {
    throw new Error("useContexto deve ser usado dentro de ContextoProvider");
  }
  return ctx;
}
