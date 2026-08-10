import { useEffect, useState } from "react";
import { Button } from "../components/ui/Button";
import { ErrorAlert } from "../components/ui/Feedback";
import {
  baixarEInstalarAtualizacao,
  obterVersaoApp,
  verificarAtualizacao,
  type ProgressoAtualizacao,
  type StatusAtualizacao,
} from "../services/atualizacoes";

export function ConfiguracoesSobrePage() {
  const [versao, setVersao] = useState<string | null>(null);
  const [status, setStatus] = useState<StatusAtualizacao | null>(null);
  const [progresso, setProgresso] = useState<ProgressoAtualizacao>({ fase: "idle" });
  const [verificando, setVerificando] = useState(false);
  const [instalando, setInstalando] = useState(false);

  useEffect(() => {
    void obterVersaoApp().then(setVersao);
    void handleVerificar();
  }, []);

  async function handleVerificar() {
    setVerificando(true);
    setStatus(null);
    try {
      setStatus(await verificarAtualizacao());
    } finally {
      setVerificando(false);
    }
  }

  async function handleInstalar() {
    setInstalando(true);
    setProgresso({ fase: "baixando", baixado: 0 });
    try {
      await baixarEInstalarAtualizacao(setProgresso);
    } catch (err) {
      setStatus({
        tipo: "erro",
        mensagem: err instanceof Error ? err.message : String(err),
      });
      setProgresso({ fase: "idle" });
    } finally {
      setInstalando(false);
    }
  }

  const progressoLabel =
    progresso.fase === "baixando"
      ? progresso.total
        ? `Baixando… ${Math.round((progresso.baixado / progresso.total) * 100)}%`
        : "Baixando atualização…"
      : progresso.fase === "instalando"
        ? "Instalando…"
        : progresso.fase === "concluido"
          ? "Reiniciando…"
          : null;

  return (
    <div className="space-y-6">
      <section className="app-card p-5">
        <h2 className="font-semibold text-white">Sobre o Money OS</h2>
        <p className="mt-2 text-sm text-slate-400">
          Controle financeiro pessoal e empresarial — contas, transações, orçamentos e relatórios.
        </p>
        <p className="mt-3 text-sm text-slate-300">
          Versão instalada:{" "}
          <strong className="text-white">{versao ?? "—"}</strong>
        </p>
      </section>

      <section className="app-card p-5">
        <h2 className="font-semibold text-white">Atualizações</h2>
        <p className="mt-2 text-sm text-slate-400">
          O app verifica novas versões automaticamente ao iniciar. Você também pode verificar manualmente
          aqui.
        </p>

        <div className="mt-4 flex flex-wrap gap-2">
          <Button
            variant="secondary"
            onClick={() => void handleVerificar()}
            disabled={verificando || instalando}
          >
            {verificando ? "Verificando…" : "Verificar atualizações"}
          </Button>
          {status?.tipo === "disponivel" && (
            <Button onClick={() => void handleInstalar()} disabled={instalando}>
              Instalar v{status.versao}
            </Button>
          )}
        </div>

        {progressoLabel && (
          <p className="mt-3 text-sm text-indigo-300">{progressoLabel}</p>
        )}

        {status?.tipo === "atualizado" && (
          <p className="mt-3 text-sm text-emerald-400">Você está na versão mais recente.</p>
        )}
        {status?.tipo === "indisponivel" && (
          <p className="mt-3 text-sm text-slate-500">
            Verificação de atualizações disponível apenas no app instalado (Windows).
          </p>
        )}
        {status?.tipo === "disponivel" && status.notas && (
          <div className="mt-3 rounded-xl border border-white/[0.06] bg-white/[0.03] p-3">
            <p className="text-xs font-medium text-slate-400">Novidades</p>
            <p className="mt-1 whitespace-pre-wrap text-sm text-slate-300">{status.notas}</p>
          </div>
        )}
        {status?.tipo === "erro" && (
          <div className="mt-3">
            <ErrorAlert message={status.mensagem} />
          </div>
        )}
      </section>

      <section className="app-card p-5">
        <h2 className="font-semibold text-white">Instalação no Windows</h2>
        <p className="mt-2 text-sm text-slate-400">
          Distribua o instalador gerado em{" "}
          <code className="text-slate-300">src-tauri/target/release/bundle/nsis/</code>. As
          atualizações futuras serão baixadas e aplicadas automaticamente pelo app.
        </p>
      </section>
    </div>
  );
}
