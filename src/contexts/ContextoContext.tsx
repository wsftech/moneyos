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
import {
  clampContextoVisualizacao,
  CONFIG_KEY_ESCOPO_FINANCEIRO,
  contextosParaEscopo,
  DEFAULT_ESCOPO_FINANCEIRO,
  parseEscopoFinanceiro,
  visualizacoesParaEscopo,
} from "../db/escopoFinanceiro";
import { categoriaContextoMatches, contextoMatches } from "../db/utils";
import type {
  Contexto,
  ContextoCategoria,
  ContextoVisualizacao,
  EscopoFinanceiro,
} from "../types";

const CONFIG_KEY = "contexto_visualizacao";
const DEFAULT_CONTEXTO: ContextoVisualizacao = "pessoal";

interface ContextoContextValue {
  contexto: ContextoVisualizacao;
  setContexto: (contexto: ContextoVisualizacao) => Promise<void>;
  escopo: EscopoFinanceiro;
  setEscopo: (escopo: EscopoFinanceiro) => Promise<void>;
  /** Opções do seletor de visão (respeita o escopo). */
  opcoesVisualizacao: ContextoVisualizacao[];
  /** Contextos permitidos ao criar/editar itens. */
  contextosDisponiveis: Contexto[];
  escopoUnico: boolean;
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

function parseContextoVisualizacao(valor: string | null | undefined): ContextoVisualizacao | null {
  if (valor === "pessoal" || valor === "empresa" || valor === "consolidado") return valor;
  return null;
}

export function ContextoProvider({ children }: { children: ReactNode }) {
  const [contexto, setContextoState] = useState<ContextoVisualizacao>(DEFAULT_CONTEXTO);
  const [escopo, setEscopoState] = useState<EscopoFinanceiro>(DEFAULT_ESCOPO_FINANCEIRO);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function load() {
      try {
        const [savedCtx, savedEscopo] = await Promise.all([
          getConfiguracao(CONFIG_KEY),
          getConfiguracao(CONFIG_KEY_ESCOPO_FINANCEIRO),
        ]);
        const escopoCarregado = parseEscopoFinanceiro(savedEscopo);
        const ctxCarregado = parseContextoVisualizacao(savedCtx) ?? DEFAULT_CONTEXTO;
        const ctxFinal = clampContextoVisualizacao(ctxCarregado, escopoCarregado);
        setEscopoState(escopoCarregado);
        setContextoState(ctxFinal);
        if (ctxFinal !== ctxCarregado) {
          await setConfiguracao(CONFIG_KEY, ctxFinal);
        }
      } finally {
        setLoading(false);
      }
    }
    void load();
  }, []);

  const setContexto = useCallback(
    async (novoContexto: ContextoVisualizacao) => {
      const permitido = clampContextoVisualizacao(novoContexto, escopo);
      setContextoState(permitido);
      await setConfiguracao(CONFIG_KEY, permitido);
    },
    [escopo],
  );

  const setEscopo = useCallback(async (novoEscopo: EscopoFinanceiro) => {
    setEscopoState(novoEscopo);
    await setConfiguracao(CONFIG_KEY_ESCOPO_FINANCEIRO, novoEscopo);
    setContextoState((atual) => {
      const ctxAjustado = clampContextoVisualizacao(atual, novoEscopo);
      if (ctxAjustado !== atual) {
        void setConfiguracao(CONFIG_KEY, ctxAjustado);
      }
      return ctxAjustado;
    });
  }, []);

  const opcoesVisualizacao = useMemo(() => visualizacoesParaEscopo(escopo), [escopo]);
  const contextosDisponiveis = useMemo(() => contextosParaEscopo(escopo), [escopo]);
  const escopoUnico = contextosDisponiveis.length === 1;

  const value = useMemo<ContextoContextValue>(
    () => ({
      contexto,
      setContexto,
      escopo,
      setEscopo,
      opcoesVisualizacao,
      contextosDisponiveis,
      escopoUnico,
      loading,
      matchesContexto: (itemContexto) => contextoMatches(itemContexto, contexto),
      matchesCategoriaContexto: (categoriaContexto) =>
        categoriaContextoMatches(categoriaContexto, contexto),
      label: LABELS[contexto],
    }),
    [
      contexto,
      setContexto,
      escopo,
      setEscopo,
      opcoesVisualizacao,
      contextosDisponiveis,
      escopoUnico,
      loading,
    ],
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
