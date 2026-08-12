import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { AtualizacaoModal } from "./AtualizacaoModal";
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
  /** Verifica em segundo plano e oferece modal se houver update (respeita dismiss da sessão). */
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
    if (instalando || fase === "progresso") return;
    const status = await verificarAtualizacao();
    if (status.tipo !== "disponivel") return;
    if (foiDismissAtualizacao(status.versao)) return;
    setVersao(status.versao);
    setNotas(status.notas);
    setFase("disponivel");
  }, [instalando, fase]);

  const value = useMemo(
    () => ({ instalarAtualizacao, verificarEmBackground }),
    [instalarAtualizacao, verificarEmBackground],
  );

  return (
    <AtualizacaoContext.Provider value={value}>
      {children}
      <AtualizacaoModal
        open={fase !== "fechado"}
        modo={fase === "fechado" ? "disponivel" : fase}
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

/** Dispara a verificação silenciosa uma vez após montar o provider. */
export function AtualizacaoBackgroundCheck() {
  const { verificarEmBackground } = useAtualizacao();
  useEffect(() => {
    const t = window.setTimeout(() => {
      void verificarEmBackground();
    }, 2500);
    return () => window.clearTimeout(t);
  }, [verificarEmBackground]);
  return null;
}
