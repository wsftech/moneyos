import { Button } from "./ui/Button";

export function AtualizacaoToast({
  open,
  versao,
  notas,
  onAtualizar,
  onDepois,
}: {
  open: boolean;
  versao?: string;
  notas?: string;
  onAtualizar: () => void;
  onDepois: () => void;
}) {
  if (!open) return null;

  const resumoNotas = notas?.trim()
    ? notas.trim().split(/\n/)[0]?.slice(0, 120)
    : null;

  return (
    <div
      className="pointer-events-none fixed bottom-12 right-4 z-40 w-[min(22rem,calc(100vw-1.5rem))] sm:bottom-14"
      role="status"
      aria-live="polite"
      aria-label="Atualização disponível"
    >
      <div className="pointer-events-auto overflow-hidden rounded-2xl border border-teal-200/80 bg-white shadow-xl shadow-slate-900/15">
        <div className="h-1 bg-teal-600" />
        <div className="p-4">
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="text-sm font-semibold text-slate-900">Nova versão disponível</p>
              <p className="mt-1 text-sm text-slate-600">
                {versao
                  ? `WSF Money v${versao} já pode ser instalada.`
                  : "Uma atualização já pode ser instalada."}
              </p>
            </div>
            <button
              type="button"
              onClick={onDepois}
              className="rounded-lg px-1.5 py-0.5 text-lg leading-none text-slate-400 hover:bg-slate-100 hover:text-slate-700"
              aria-label="Dispensar aviso"
            >
              ×
            </button>
          </div>
          {resumoNotas && (
            <p className="mt-2 line-clamp-2 text-xs text-slate-500">{resumoNotas}</p>
          )}
          <div className="mt-4 flex flex-wrap items-center gap-2">
            <Button type="button" onClick={onAtualizar} className="py-1.5">
              Atualizar agora
            </Button>
            <Button type="button" variant="secondary" className="py-1.5" onClick={onDepois}>
              Depois
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
