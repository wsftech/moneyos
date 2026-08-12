import { Button } from "./ui/Button";
import { Modal } from "./ui/Modal";
import {
  formatBytes,
  percentualProgresso,
  type ProgressoAtualizacao,
} from "../services/atualizacoes";

type Modo = "disponivel" | "progresso" | "erro";

export function AtualizacaoModal({
  open,
  modo,
  versao,
  notas,
  progresso,
  erro,
  onInstalar,
  onDepois,
  onFechar,
}: {
  open: boolean;
  modo: Modo;
  versao?: string;
  notas?: string;
  progresso: ProgressoAtualizacao;
  erro?: string;
  onInstalar: () => void;
  onDepois: () => void;
  onFechar: () => void;
}) {
  const pct = percentualProgresso(progresso);
  const instalando = modo === "progresso";
  const titulo =
    modo === "erro"
      ? "Falha na atualização"
      : instalando
        ? "Atualizando o WSF Money"
        : `Atualização ${versao ? `v${versao}` : ""} disponível`;

  return (
    <Modal open={open} onClose={onFechar} title={titulo} closable={!instalando}>
      {modo === "disponivel" && (
        <div className="space-y-4">
          <p className="text-sm text-slate-600">
            Uma nova versão está pronta. A instalação leva alguns instantes; o app será reiniciado
            automaticamente ao concluir.
          </p>
          {notas && (
            <div className="max-h-40 overflow-y-auto rounded-xl border border-slate-200 bg-slate-50 p-3">
              <p className="text-xs font-medium text-slate-500">Novidades</p>
              <p className="mt-1 whitespace-pre-wrap text-sm text-slate-700">{notas}</p>
            </div>
          )}
          <div className="flex justify-end gap-2">
            <Button type="button" variant="secondary" onClick={onDepois}>
              Depois
            </Button>
            <Button type="button" onClick={onInstalar}>
              Instalar e reiniciar
            </Button>
          </div>
        </div>
      )}

      {modo === "progresso" && (
        <div className="space-y-4">
          <ProgressoVisual progresso={progresso} pct={pct} />
          <p className="text-xs text-slate-500">
            Não feche o aplicativo. Ao finalizar a instalação, o WSF Money abrirá de novo sozinho.
          </p>
        </div>
      )}

      {modo === "erro" && (
        <div className="space-y-4">
          <p className="text-sm text-rose-700">{erro ?? "Não foi possível concluir a atualização."}</p>
          <div className="flex justify-end">
            <Button type="button" variant="secondary" onClick={onFechar}>
              Fechar
            </Button>
          </div>
        </div>
      )}
    </Modal>
  );
}

function ProgressoVisual({
  progresso,
  pct,
}: {
  progresso: ProgressoAtualizacao;
  pct: number | null;
}) {
  const barra =
    progresso.fase === "baixando"
      ? (pct ?? Math.min(90, 8 + Math.round(progresso.baixado / (256 * 1024))))
      : progresso.fase === "instalando"
        ? 95
        : progresso.fase === "reiniciando"
          ? 100
          : 0;

  const titulo =
    progresso.fase === "baixando"
      ? "Baixando atualização…"
      : progresso.fase === "instalando"
        ? "Instalando…"
        : progresso.fase === "reiniciando"
          ? "Reiniciando o aplicativo…"
          : "Preparando…";

  const detalhe =
    progresso.fase === "baixando"
      ? pct != null
        ? `${pct}% · ${formatBytes(progresso.baixado)}${
            progresso.total ? ` de ${formatBytes(progresso.total)}` : ""
          }`
        : progresso.baixado > 0
          ? formatBytes(progresso.baixado)
          : "Conectando…"
      : progresso.fase === "instalando"
        ? "Aplicando a nova versão"
        : progresso.fase === "reiniciando"
          ? "Quase lá"
          : null;

  return (
    <div>
      <div className="mb-2 flex items-center justify-between gap-3">
        <p className="text-sm font-medium text-slate-800">{titulo}</p>
        {detalhe && <p className="text-xs text-slate-500">{detalhe}</p>}
      </div>
      <div className="h-2.5 overflow-hidden rounded-full bg-slate-100">
        <div
          className="h-full rounded-full bg-teal-600 transition-[width] duration-300 ease-out"
          style={{ width: `${barra}%` }}
        />
      </div>
      {progresso.fase === "baixando" && pct == null && (
        <div className="mt-3 h-1 overflow-hidden rounded-full bg-slate-100">
          <div className="atualizacao-indeterminate h-full w-1/3 rounded-full bg-teal-500/80" />
        </div>
      )}
    </div>
  );
}
