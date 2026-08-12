import { useEffect, useState } from "react";
import { useAtualizacao } from "../components/AtualizacaoProvider";
import { Button } from "../components/ui/Button";
import { ErrorAlert } from "../components/ui/Feedback";
import {
  obterVersaoApp,
  verificarAtualizacao,
  type StatusAtualizacao,
} from "../services/atualizacoes";

export function ConfiguracoesSobrePage() {
  const { instalarAtualizacao } = useAtualizacao();
  const [versao, setVersao] = useState<string | null>(null);
  const [status, setStatus] = useState<StatusAtualizacao | null>(null);
  const [verificando, setVerificando] = useState(false);
  const [iniciandoInstall, setIniciandoInstall] = useState(false);

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
    if (status?.tipo !== "disponivel") return;
    setIniciandoInstall(true);
    try {
      await instalarAtualizacao(status.versao, status.notas);
    } finally {
      setIniciandoInstall(false);
    }
  }

  return (
    <div className="space-y-6">
      <section className="app-card p-5">
        <h2 className="font-semibold text-slate-900">Sobre o WSF Money</h2>
        <p className="mt-2 text-sm text-slate-500">
          Controle financeiro pessoal e empresarial — contas, transações, orçamentos e relatórios.
        </p>
        <p className="mt-3 text-sm text-slate-600">
          Versão instalada:{" "}
          <strong className="text-slate-900">{versao ?? "—"}</strong>
        </p>
      </section>

      <section className="app-card p-5">
        <h2 className="font-semibold text-slate-900">Atualizações</h2>
        <p className="mt-2 text-sm text-slate-500">
          O app verifica novas versões automaticamente ao iniciar. Você também pode verificar
          manualmente aqui. Ao instalar, o app fecha, o instalador aplica a versão e o WSF Money
          reabre sozinho. Se isso não acontecer, instale pelo GitHub Releases.
        </p>

        <div className="mt-4 flex flex-wrap gap-2">
          <Button
            variant="secondary"
            onClick={() => void handleVerificar()}
            disabled={verificando || iniciandoInstall}
          >
            {verificando ? "Verificando…" : "Verificar atualizações"}
          </Button>
          {status?.tipo === "disponivel" && (
            <Button onClick={() => void handleInstalar()} disabled={iniciandoInstall}>
              Instalar v{status.versao}
            </Button>
          )}
          <a
            href="https://github.com/wsftech/moneyos/releases/latest"
            className="inline-flex items-center rounded-lg px-3 py-2 text-sm font-medium text-teal-800 hover:underline"
            target="_blank"
            rel="noreferrer"
          >
            Baixar instalador
          </a>
        </div>

        {status?.tipo === "atualizado" && (
          <p className="mt-3 text-sm text-emerald-600">Você está na versão mais recente.</p>
        )}
        {status?.tipo === "indisponivel" && (
          <p className="mt-3 text-sm text-slate-500">
            Verificação de atualizações disponível apenas no app instalado (Windows).
          </p>
        )}
        {status?.tipo === "disponivel" && status.notas && (
          <div className="mt-3 rounded-xl border border-slate-200 bg-slate-50 p-3">
            <p className="text-xs font-medium text-slate-500">Novidades</p>
            <p className="mt-1 whitespace-pre-wrap text-sm text-slate-600">{status.notas}</p>
          </div>
        )}
        {status?.tipo === "sem_publicacao" && (
          <p className="mt-3 text-sm text-slate-500">
            Nenhuma release publicada no servidor de atualizações ainda. Quando houver uma nova
            versão em{" "}
            <a
              href="https://github.com/wsftech/moneyos/releases"
              className="text-teal-700 hover:underline"
              target="_blank"
              rel="noreferrer"
            >
              GitHub Releases
            </a>
            , a verificação funcionará automaticamente.
          </p>
        )}
        {status?.tipo === "erro" && (
          <div className="mt-3">
            <ErrorAlert message={status.mensagem} />
          </div>
        )}
      </section>

      <section className="app-card p-5">
        <h2 className="font-semibold text-slate-900">Instalação no Windows</h2>
        <p className="mt-2 text-sm text-slate-500">
          Distribua o instalador gerado em{" "}
          <code className="text-slate-600">src-tauri/target/release/bundle/nsis/</code>. As
          atualizações futuras serão baixadas e aplicadas automaticamente pelo app.
        </p>
      </section>
    </div>
  );
}
