import { useEffect, useMemo, useState } from "react";
import { Button } from "./ui/Button";
import { ErrorAlert } from "./ui/Feedback";
import { Input, Select } from "./ui/FormFields";
import { Modal } from "./ui/Modal";
import { useContexto } from "../contexts/ContextoContext";
import {
  conciliarOfxComTransacoes,
  importarLancamentosOfx,
  type ItemConciliacao,
  type ResultadoConciliacao,
} from "../db/conciliacaoOfx";
import { getErrorMessage } from "../db/utils";
import type { Conta } from "../types";
import { formatCurrency, formatDate } from "../utils/format";
import { parseOfx, type LancamentoOfx } from "../utils/ofxParser";

type ContasLista = Conta[];

const STATUS_LABEL: Record<ItemConciliacao["status"], string> = {
  conciliado: "Conciliado",
  pendente_ofx: "Só no extrato",
  pendente_app: "Só no app",
};

const STATUS_CLASS: Record<ItemConciliacao["status"], string> = {
  conciliado: "text-emerald-400",
  pendente_ofx: "text-amber-400",
  pendente_app: "text-cyan-300",
};

export function ConciliacaoOfxModal({
  open,
  onClose,
  contas,
  onImported,
}: {
  open: boolean;
  onClose: () => void;
  contas: ContasLista;
  onImported: () => void;
}) {
  const { contexto } = useContexto();
  const contasBanco = useMemo(
    () => contas.filter((c) => c.tipo !== "cartao_credito"),
    [contas],
  );

  const [contaId, setContaId] = useState("");
  const [lancamentos, setLancamentos] = useState<LancamentoOfx[]>([]);
  const [resultado, setResultado] = useState<ResultadoConciliacao | null>(null);
  const [selecionados, setSelecionados] = useState<Set<string>>(new Set());
  const [filtroStatus, setFiltroStatus] = useState<"todos" | ItemConciliacao["status"]>("todos");
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  useEffect(() => {
    if (open) {
      setContaId(contasBanco[0] ? String(contasBanco[0].id) : "");
      setLancamentos([]);
      setResultado(null);
      setSelecionados(new Set());
      setFiltroStatus("todos");
      setFormError(null);
      setSuccessMsg(null);
    }
  }, [open, contasBanco]);

  async function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setFormError(null);
    setSuccessMsg(null);
    try {
      const text = await file.text();
      const parsed = parseOfx(text);
      if (parsed.length === 0) {
        setFormError("Nenhum lançamento encontrado no arquivo OFX.");
        setLancamentos([]);
        setResultado(null);
        return;
      }
      setLancamentos(parsed);
      setResultado(null);
    } catch (err) {
      setFormError(getErrorMessage(err));
    }
  }

  async function handleConciliar() {
    setFormError(null);
    setSuccessMsg(null);
    if (!contaId) {
      setFormError("Selecione a conta bancária.");
      return;
    }
    if (lancamentos.length === 0) {
      setFormError("Carregue um extrato OFX válido.");
      return;
    }

    setLoading(true);
    try {
      const res = await conciliarOfxComTransacoes(lancamentos, Number(contaId));
      setResultado(res);
      setSelecionados(
        new Set(res.itens.filter((i) => i.status === "pendente_ofx").map((i) => i.chave)),
      );
    } catch (err) {
      setFormError(getErrorMessage(err));
    } finally {
      setLoading(false);
    }
  }

  function toggleSelecionado(chave: string) {
    setSelecionados((prev) => {
      const next = new Set(prev);
      if (next.has(chave)) next.delete(chave);
      else next.add(chave);
      return next;
    });
  }

  async function handleImportar() {
    setFormError(null);
    setSuccessMsg(null);
    if (!contaId || !resultado) return;

    const conta = contasBanco.find((c) => c.id === Number(contaId));
    if (!conta) {
      setFormError("Conta inválida.");
      return;
    }

    const paraImportar = resultado.itens.filter(
      (i) => i.status === "pendente_ofx" && selecionados.has(i.chave) && i.fitid,
    );
    if (paraImportar.length === 0) {
      setFormError("Selecione ao menos um lançamento do extrato para importar.");
      return;
    }

    const mapaOfx = new Map(lancamentos.map((l) => [l.fitid, l]));
    const linhas = paraImportar
      .map((i) => (i.fitid ? mapaOfx.get(i.fitid) : undefined))
      .filter(Boolean) as LancamentoOfx[];

    setSaving(true);
    try {
      const res = await importarLancamentosOfx(linhas, Number(contaId), conta.contexto);
      setSuccessMsg(
        `${res.importados} lançamento(s) importado(s)` +
          (res.ignorados > 0 ? `, ${res.ignorados} com erro` : ""),
      );
      if (res.importados > 0) {
        await handleConciliar();
        onImported();
      }
      if (res.erros.length > 0) {
        setFormError(res.erros.slice(0, 3).join(" · "));
      }
    } catch (err) {
      setFormError(getErrorMessage(err));
    } finally {
      setSaving(false);
    }
  }

  const itensFiltrados =
    resultado?.itens.filter((i) => filtroStatus === "todos" || i.status === filtroStatus) ?? [];

  return (
    <Modal open={open} onClose={onClose} title="Conciliação bancária (OFX)" wide>
      <div className="space-y-4">
        {formError && <ErrorAlert message={formError} />}
        {successMsg && (
          <p className="rounded-xl border border-emerald-500/20 bg-emerald-500/10 px-3 py-2 text-sm text-emerald-300">
            {successMsg}
          </p>
        )}

        <p className="text-sm text-slate-400">
          Importe o extrato OFX do banco, compare com os lançamentos do app e importe apenas o que
          ainda não foi registrado. Contas de cartão não usam conciliação OFX.
        </p>

        <div className="grid gap-4 md:grid-cols-2">
          <Input
            label="Arquivo OFX"
            type="file"
            accept=".ofx,.OFX,application/x-ofx,text/plain"
            onChange={(e) => void handleFile(e)}
          />
          <Select
            label="Conta bancária"
            value={contaId}
            onChange={(e) => setContaId(e.target.value)}
            options={contasBanco.map((c) => ({ value: String(c.id), label: c.nome }))}
          />
        </div>

        {lancamentos.length > 0 && !resultado && (
          <p className="text-sm text-slate-300">
            {lancamentos.length} lançamento(s) no extrato. Clique em Conciliar para comparar.
          </p>
        )}

        {resultado && (
          <>
            <div className="grid gap-3 sm:grid-cols-3">
              <ResumoChip label="Conciliados" value={resultado.resumo.conciliados} tone="green" />
              <ResumoChip
                label="Só no extrato"
                value={resultado.resumo.pendentesOfx}
                tone="amber"
              />
              <ResumoChip label="Só no app" value={resultado.resumo.pendentesApp} tone="cyan" />
            </div>
            {resultado.periodo && (
              <p className="text-xs text-slate-500">
                Período do extrato: {formatDate(resultado.periodo.inicio)} a{" "}
                {formatDate(resultado.periodo.fim)}
                {contexto === "consolidado" ? " · use a conta correta (pessoal/empresa)" : ""}
              </p>
            )}

            <div className="flex flex-wrap gap-2">
              {(["todos", "conciliado", "pendente_ofx", "pendente_app"] as const).map((f) => (
                <Button
                  key={f}
                  type="button"
                  variant={filtroStatus === f ? "primary" : "secondary"}
                  className="py-1 text-xs"
                  onClick={() => setFiltroStatus(f)}
                >
                  {f === "todos"
                    ? "Todos"
                    : f === "conciliado"
                      ? "Conciliados"
                      : f === "pendente_ofx"
                        ? "Só extrato"
                        : "Só app"}
                </Button>
              ))}
            </div>

            <div className="max-h-80 overflow-auto rounded-xl border border-white/10">
              <table className="w-full min-w-[640px] text-sm">
                <thead className="sticky top-0 bg-slate-900/95 text-left text-slate-400">
                  <tr>
                    <th className="px-3 py-2 w-10" />
                    <th className="px-3 py-2">Data</th>
                    <th className="px-3 py-2">Descrição</th>
                    <th className="px-3 py-2">Tipo</th>
                    <th className="px-3 py-2 text-right">Valor</th>
                    <th className="px-3 py-2">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-white/5">
                  {itensFiltrados.map((item) => (
                    <tr key={item.chave} className="hover:bg-white/[0.02]">
                      <td className="px-3 py-2">
                        {item.status === "pendente_ofx" && (
                          <input
                            type="checkbox"
                            checked={selecionados.has(item.chave)}
                            onChange={() => toggleSelecionado(item.chave)}
                          />
                        )}
                      </td>
                      <td className="px-3 py-2 whitespace-nowrap text-slate-300">
                        {formatDate(item.data)}
                      </td>
                      <td className="px-3 py-2 text-slate-200">{item.descricao}</td>
                      <td className="px-3 py-2 capitalize text-slate-400">{item.tipo}</td>
                      <td
                        className={`px-3 py-2 text-right font-medium whitespace-nowrap ${
                          item.tipo === "receita" ? "text-emerald-400" : "text-rose-400"
                        }`}
                      >
                        {item.tipo === "receita" ? "+" : "-"}
                        {formatCurrency(item.valor)}
                      </td>
                      <td className={`px-3 py-2 text-xs font-medium ${STATUS_CLASS[item.status]}`}>
                        {STATUS_LABEL[item.status]}
                        {item.transacao_id && item.status === "conciliado" && (
                          <span className="ml-1 text-slate-500">#{item.transacao_id}</span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )}

        <div className="flex justify-end gap-2">
          <Button type="button" variant="secondary" onClick={onClose}>
            Fechar
          </Button>
          {!resultado ? (
            <Button
              disabled={loading || lancamentos.length === 0 || !contaId}
              onClick={() => void handleConciliar()}
            >
              {loading ? "Conciliando..." : "Conciliar"}
            </Button>
          ) : (
            <Button
              disabled={saving || resultado.resumo.pendentesOfx === 0}
              onClick={() => void handleImportar()}
            >
              {saving ? "Importando..." : "Importar selecionados"}
            </Button>
          )}
        </div>
      </div>
    </Modal>
  );
}

function ResumoChip({
  label,
  value,
  tone,
}: {
  label: string;
  value: number;
  tone: "green" | "amber" | "cyan";
}) {
  const colors = {
    green: "border-emerald-500/20 bg-emerald-500/10 text-emerald-200",
    amber: "border-amber-500/20 bg-amber-500/10 text-amber-200",
    cyan: "border-cyan-500/20 bg-cyan-500/10 text-cyan-200",
  };
  return (
    <div className={`rounded-lg border px-4 py-3 ${colors[tone]}`}>
      <p className="text-xs opacity-70">{label}</p>
      <p className="text-xl font-bold">{value}</p>
    </div>
  );
}
