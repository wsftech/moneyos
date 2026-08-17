import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { AtualizacaoModal } from "./AtualizacaoModal";
import { AtualizacaoToast } from "./AtualizacaoToast";
import { useContexto } from "../contexts/ContextoContext";
import {
  baixarEInstalarAtualizacao,
  dismissAtualizacao,
  foiDismissAtualizacao,
  verificarAtualizacao,
  type ProgressoAtualizacao,
} from "../services/atualizacoes";

type FaseUi = "fechado" | "disponivel" | "progresso" | "erro";

type AtualizacaoContextValue = {
  /** Abre o fluxo de instalação (com modal de progresso). */
  instalarAtualizacao: (versao: string, notas?: string) => Promise<void>;
  /** Verifica em segundo plano e mostra o aviso se houver update. */
  verificarEmBackground: () => Promise<void>;
};

const AtualizacaoContext = createContext<AtualizacaoContextValue | null>(null);

export function useAtualizacao(): AtualizacaoContextValue {
  const ctx = useContext(AtualizacaoContext);
  if (!ctx) {
    throw new Error("useAtualizacao deve ser usado dentro de AtualizacaoProvider");
  }
  return ctx;
}

export function AtualizacaoProvider({ children }: { children: ReactNode }) {
  const [fase, setFase] = useState<FaseUi>("fechado");
  const [versao, setVersao] = useState<string | undefined>();
  const [notas, setNotas] = useState<string | undefined>();
  const [progresso, setProgresso] = useState<ProgressoAtualizacao>({ fase: "idle" });
  const [erro, setErro] = useState<string | undefined>();
  const [instalando, setInstalando] = useState(false);
  const instalandoRef = useRef(false);
  const faseRef = useRef(fase);
  instalandoRef.current = instalando;
  faseRef.current = fase;

  const fechar = useCallback(() => {
    if (instalando) return;
    setFase("fechado");
    setErro(undefined);
    setProgresso({ fase: "idle" });
  }, [instalando]);

  const depois = useCallback(() => {
    if (versao) dismissAtualizacao(versao);
    fechar();
  }, [versao, fechar]);

  const executarInstalacao = useCallback(async (v: string, n?: string) => {
    setVersao(v);
    setNotas(n);
    setErro(undefined);
    setInstalando(true);
    setFase("progresso");
    setProgresso({ fase: "baixando", baixado: 0 });
    try {
      await baixarEInstalarAtualizacao(setProgresso);
    } catch (err) {
      setErro(err instanceof Error ? err.message : String(err));
      setProgresso({ fase: "idle" });
      setFase("erro");
      setInstalando(false);
    }
  }, []);

  const instalarAtualizacao = useCallback(
    async (v: string, n?: string) => {
      await executarInstalacao(v, n);
    },
    [executarInstalacao],
  );

  const verificarEmBackground = useCallback(async () => {
    if (instalandoRef.current || faseRef.current === "progresso") return;
    const status = await verificarAtualizacao();
    if (status.tipo !== "disponivel") return;
    if (foiDismissAtualizacao(status.versao)) return;
    setVersao(status.versao);
    setNotas(status.notas);
    setFase("disponivel");
  }, []);

  const value = useMemo(
    () => ({ instalarAtualizacao, verificarEmBackground }),
    [instalarAtualizacao, verificarEmBackground],
  );

  return (
    <AtualizacaoContext.Provider value={value}>
      {children}
      <AtualizacaoToast
        open={fase === "disponivel"}
        versao={versao}
        notas={notas}
        onAtualizar={() => {
          if (versao) void executarInstalacao(versao, notas);
        }}
        onDepois={depois}
      />
      <AtualizacaoModal
        open={fase === "progresso" || fase === "erro"}
        modo={fase === "erro" ? "erro" : "progresso"}
        versao={versao}
        notas={notas}
        progresso={progresso}
        erro={erro}
        onInstalar={() => {
          if (versao) void executarInstalacao(versao, notas);
        }}
        onDepois={depois}
        onFechar={fechar}
      />
    </AtualizacaoContext.Provider>
  );
}

/** Verifica assim que o app sai da splash — o aviso deve aparecer ao abrir. */
export function AtualizacaoBackgroundCheck() {
  const { verificarEmBackground } = useAtualizacao();
  const { loading } = useContexto();
  const executou = useRef(false);

  useEffect(() => {
    if (loading || executou.current) return;
    executou.current = true;
    const t = window.setTimeout(() => {
      void verificarEmBackground();
    }, 400);
    return () => window.clearTimeout(t);
  }, [loading, verificarEmBackground]);
  return null;
}
