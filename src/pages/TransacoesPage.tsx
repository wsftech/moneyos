import { useCallback, useEffect, useMemo, useState } from "react";
import { useSearchParams, Link } from "react-router-dom";
import { abrirAnexo, nomeAnexo } from "../db/anexos";
import { aplicarAnexoPendente, TransacaoAnexoField } from "../components/TransacaoAnexoField";
import { TagSelect } from "../components/TagSelect";
import { ParcelasJaPagasField } from "../components/ParcelasJaPagasField";
import { ConciliacaoOfxModal } from "../components/ConciliacaoOfxModal";
import { useConfirm } from "../components/ConfirmDialog";
import { ContextoBadge } from "../components/ContextoSelector";
import {
  ContextoFormSelect,
  defaultFormContexto,
  resolveContexto,
} from "../components/ContextoFormSelect";
import { Button } from "../components/ui/Button";
import { EmptyState, ErrorAlert, LoadingSpinner, PageHeader } from "../components/ui/Feedback";
import { Input, Select, Textarea, ValorInput } from "../components/ui/FormFields";
import { Modal } from "../components/ui/Modal";
import { useContexto } from "../contexts/ContextoContext";
import { filtrarCategoriasParaLancamento, listCategorias } from "../db/categorias";
import { listContas } from "../db/contas";
import {
  getProgressoOrcamentoCategoria,
  type ProgressoOrcamentoCategoria,
} from "../db/orcamentos";
import {
  confirmarLancamentoRecorrente,
  createTransacaoRecorrente,
  deleteTransacaoRecorrente,
  listTransacoesRecorrentes,
  mapRecorrentesStatusMes,
  podeConfirmarRecorrenteNoMes,
  updateTransacaoRecorrente,
  type TransacaoRecorrenteInput,
} from "../db/transacoesRecorrentes";
import {
  importarTransacoesCsv,
  parseCsvTransacoes,
  type LinhaImportacaoCsv,
} from "../db/importacaoCsv";
import { getTagsPorTransacoes, getTagsTransacao } from "../db/tags";
import {
  createCompraParceladaCartao,
  createTransacao,
  createTransferencia,
  deleteTransacao,
  getParVinculado,
  listTransacoes,
  updateTransacao,
  updateTransferenciaVinculada,
  type TransacaoInput,
} from "../db/transacoes";
import { listFaturasParaLancamentos } from "../db/faturasCartao";
import { sincronizarLancamentosParcelamentos } from "../db/emprestimos";
import { getErrorMessage } from "../db/utils";
import type { Contexto, Tag, Transacao, TransacaoRecorrente } from "../types";
import { intervaloDoMes, intervaloMesAtual, todayIsoDate } from "../utils/dates";
import { formatCurrency, formatDate, labelMes, mesAtual } from "../utils/format";
import { validarParcelasJaPagas } from "../utils/parcelasHistoricas";
import {
  agruparTransacoesParaExibicao,
  faturaParaExibicao,
  labelTipoTransacao,
} from "../utils/transacoesExibicao";

const TIPO_OPTIONS = [
  { value: "receita", label: "Receita" },
  { value: "despesa", label: "Despesa" },
  { value: "transferencia", label: "Transferência" },
];

export function TransacoesPage() {
  const { contexto, loading: ctxLoading } = useContexto();
  const confirm = useConfirm();
  const [searchParams, setSearchParams] = useSearchParams();
  const [aba, setAba] = useState<"lancamentos" | "recorrentes">("lancamentos");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [transacoes, setTransacoes] = useState<Transacao[]>([]);
  const [contas, setContas] = useState<Awaited<ReturnType<typeof listContas>>>([]);
  const [nomesContas, setNomesContas] = useState<Map<number, string>>(new Map());
  const [categorias, setCategorias] = useState<Awaited<ReturnType<typeof listCategorias>>>([]);
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<Transacao | null>(null);
  const [tipoInicial, setTipoInicial] = useState<TransacaoInput["tipo"] | undefined>();

  const [filtroMes, setFiltroMes] = useState(mesAtual());
  const [filtroDataInicio, setFiltroDataInicio] = useState(() => intervaloMesAtual().inicio);
  const [filtroDataFim, setFiltroDataFim] = useState(() => intervaloMesAtual().fim);
  const [filtroCategoria, setFiltroCategoria] = useState("");
  const [filtroConta, setFiltroConta] = useState("");
  const [importModalOpen, setImportModalOpen] = useState(false);
  const [conciliacaoModalOpen, setConciliacaoModalOpen] = useState(false);
  const [tagsPorTransacao, setTagsPorTransacao] = useState<Map<number, Tag[]>>(new Map());
  const [faturasLancamentos, setFaturasLancamentos] = useState<
    Awaited<ReturnType<typeof listFaturasParaLancamentos>>
  >([]);

  useEffect(() => {
    const abaParam = searchParams.get("aba");
    if (abaParam === "recorrentes") {
      setAba("recorrentes");
    }
  }, [searchParams]);

  useEffect(() => {
    if (searchParams.get("nova") !== "1") return;
    const tipoParam = searchParams.get("tipo");
    const tipo =
      tipoParam === "transferencia" || tipoParam === "receita" || tipoParam === "despesa"
        ? tipoParam
        : undefined;
    setAba("lancamentos");
    setEditing(null);
    setTipoInicial(tipo);
    setModalOpen(true);
    setSearchParams({}, { replace: true });
  }, [searchParams, setSearchParams]);

  const periodoLabel = useMemo(() => {
    if (filtroMes) return labelMes(filtroMes);
    if (filtroDataInicio && filtroDataFim) {
      return `${formatDate(filtroDataInicio)} a ${formatDate(filtroDataFim)}`;
    }
    if (filtroDataInicio) return `a partir de ${formatDate(filtroDataInicio)}`;
    if (filtroDataFim) return `até ${formatDate(filtroDataFim)}`;
    return "todos os períodos";
  }, [filtroMes, filtroDataInicio, filtroDataFim]);

  function aplicarMes(mes: string) {
    const { inicio, fim } = intervaloDoMes(mes);
    setFiltroMes(mes);
    setFiltroDataInicio(inicio);
    setFiltroDataFim(fim);
  }

  function restaurarMesAtual() {
    aplicarMes(mesAtual());
  }

  const carregar = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      await sincronizarLancamentosParcelamentos(contexto);
      const [t, c, cat, todasContas, faturas] = await Promise.all([
        listTransacoes({
          contexto,
          dataInicio: filtroDataInicio || undefined,
          dataFim: filtroDataFim || undefined,
          categoriaId: filtroCategoria ? Number(filtroCategoria) : undefined,
          contaId: filtroConta ? Number(filtroConta) : undefined,
        }),
        listContas(contexto),
        listCategorias("consolidado"),
        listContas("consolidado"),
        filtroDataInicio && filtroDataFim && !filtroCategoria
          ? listFaturasParaLancamentos(filtroDataInicio, filtroDataFim, contexto)
          : Promise.resolve([]),
      ]);
      setTransacoes(t);
      setTagsPorTransacao(await getTagsPorTransacoes(t.map((tx) => tx.id)));
      setContas(c);
      setCategorias(cat);
      setNomesContas(new Map(todasContas.map((conta) => [conta.id, conta.nome])));
      const contaFiltro = filtroConta
        ? c.find((conta) => String(conta.id) === filtroConta)
        : undefined;
      setFaturasLancamentos(
        !contaFiltro || contaFiltro.tipo === "cartao_credito"
          ? filtroConta
            ? faturas.filter((x) => String(x.fatura.conta_id) === filtroConta)
            : faturas
          : [],
      );
    } catch (err) {
      setError(getErrorMessage(err));
    } finally {
      setLoading(false);
    }
  }, [contexto, filtroDataInicio, filtroDataFim, filtroCategoria, filtroConta, filtroMes]);

  useEffect(() => {
    if (!ctxLoading) void carregar();
  }, [carregar, ctxLoading]);

  const transacoesExibicao = useMemo(() => {
    const contasCartaoIds = new Set(
      contas.filter((c) => c.tipo === "cartao_credito").map((c) => c.id),
    );
    const contaFiltro = filtroConta
      ? contas.find((c) => String(c.id) === filtroConta)
      : undefined;
    const ocultarPagamentos = !contaFiltro || contaFiltro.tipo === "cartao_credito";
    const base = agruparTransacoesParaExibicao(transacoes, nomesContas, {
      contasCartaoIds,
      ocultarPagamentosFatura: ocultarPagamentos,
    });
    const faturas = faturasLancamentos.map(({ fatura, contexto: ctx }) =>
      faturaParaExibicao(fatura, ctx),
    );
    return [...base, ...faturas].sort(
      (a, b) =>
        b.transacao.data.localeCompare(a.transacao.data) || b.id - a.id,
    );
  }, [transacoes, nomesContas, contas, filtroConta, faturasLancamentos]);

  async function handleDelete(transacao: Transacao) {
    const vinculada =
      transacao.transacao_vinculada_id !== null ||
      transacoes.some((t) => t.transacao_vinculada_id === transacao.id);

    const msg = vinculada
      ? "Esta transação está vinculada a outra (ex.: transferência entre contextos). Ambas serão excluídas."
      : "Excluir esta transação? Lançamentos a pagar/receber vinculados voltarão para pendente.";

    if (!(await confirm(msg))) return;
    try {
      await deleteTransacao(transacao.id);
      await carregar();
    } catch (err) {
      setError(getErrorMessage(err));
    }
  }

  return (
    <div>
      <PageHeader
        title="Lançamentos"
        subtitle="O que já aconteceu. O que se repete todo mês fica na aba Recorrentes (também no menu A vencer)."
        action={
          aba === "lancamentos" ? (
            <div className="flex gap-2">
              <Button variant="secondary" onClick={() => setConciliacaoModalOpen(true)}>
                Conciliar OFX
              </Button>
              <Button variant="secondary" onClick={() => setImportModalOpen(true)}>
                Importar CSV
              </Button>
              <Button
                onClick={() => {
                  setEditing(null);
                  setTipoInicial(undefined);
                  setModalOpen(true);
                }}
              >
                + Novo lançamento
              </Button>
            </div>
          ) : undefined
        }
      />

      <div className="mb-4 flex gap-2">
        <Button
          variant={aba === "lancamentos" ? "primary" : "secondary"}
          className="py-1.5 text-xs"
          onClick={() => {
            setAba("lancamentos");
            setSearchParams({}, { replace: true });
          }}
        >
          Lançamentos
        </Button>
        <Button
          variant={aba === "recorrentes" ? "primary" : "secondary"}
          className="py-1.5 text-xs"
          onClick={() => {
            setAba("recorrentes");
            setSearchParams({ aba: "recorrentes" }, { replace: true });
          }}
        >
          Recorrentes
        </Button>
      </div>

      {aba === "recorrentes" ? (
        <RecorrentesPanel contexto={contexto} ctxLoading={ctxLoading} contas={contas} categorias={categorias} />
      ) : (
        <>

      <div className="mb-4 space-y-3 app-card p-4">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <p className="text-sm text-slate-400">
            Exibindo: <strong className="text-slate-900">{periodoLabel}</strong>
          </p>
          <Button type="button" variant="secondary" className="py-1.5 text-xs" onClick={restaurarMesAtual}>
            Mês atual
          </Button>
        </div>
        <div className="grid gap-3 md:grid-cols-5">
          <Input
            label="Mês"
            type="month"
            value={filtroMes}
            onChange={(e) => aplicarMes(e.target.value)}
          />
          <Input
            label="Data início"
            type="date"
            value={filtroDataInicio}
            onChange={(e) => {
              setFiltroDataInicio(e.target.value);
              setFiltroMes("");
            }}
          />
          <Input
            label="Data fim"
            type="date"
            value={filtroDataFim}
            onChange={(e) => {
              setFiltroDataFim(e.target.value);
              setFiltroMes("");
            }}
          />
          <Select
            label="Categoria"
            value={filtroCategoria}
            onChange={(e) => setFiltroCategoria(e.target.value)}
            options={[
              { value: "", label: "Todas" },
              ...categorias.map((c) => ({ value: String(c.id), label: c.nome })),
            ]}
          />
          <Select
            label="Conta"
            value={filtroConta}
            onChange={(e) => setFiltroConta(e.target.value)}
            options={[
              { value: "", label: "Todas" },
              ...contas.map((c) => ({ value: String(c.id), label: c.nome })),
            ]}
          />
        </div>
        <p className="text-xs text-slate-500">
          Por padrão mostramos o mês atual. Compras no cartão não entram aqui — aparece o total da
          fatura no vencimento. O detalhe fica em Cartões de crédito.
        </p>
      </div>

      {error && (
        <div className="mb-4">
          <ErrorAlert message={error} />
        </div>
      )}
      {loading || ctxLoading ? (
        <LoadingSpinner />
      ) : transacoesExibicao.length === 0 ? (
        <EmptyState message={`Nenhuma transação em ${periodoLabel}.`} />
      ) : (
        <div className="overflow-x-auto app-card">
          <table className="w-full min-w-[720px] text-sm">
            <thead className="app-table-head">
              <tr>
                <th className="px-4 py-3 font-medium">Data</th>
                <th className="px-4 py-3 font-medium">Descrição</th>
                <th className="px-4 py-3 font-medium">Tipo</th>
                <th className="px-4 py-3 font-medium">Conta</th>
                {contexto === "consolidado" && (
                  <th className="px-4 py-3 font-medium">Contexto</th>
                )}
                <th className="px-4 py-3 font-medium text-right">Valor</th>
                <th className="px-4 py-3 font-medium">Ações</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {transacoesExibicao.map((item) => {
                const t = item.transacao;
                const valorClass = item.isTransferencia && item.contaDestino
                  ? "text-slate-600"
                  : t.tipo === "receita"
                    ? "text-green-600"
                    : t.tipo === "despesa"
                      ? "text-rose-600"
                      : "text-slate-600";
                const valorPrefix =
                  item.isTransferencia && item.contaDestino
                    ? "?"
                    : t.tipo === "receita"
                      ? "+"
                      : t.tipo === "despesa"
                        ? "-"
                        : "?";

                return (
                <tr key={item.id} className="app-table-row">
                  <td className="px-4 py-3 whitespace-nowrap">{formatDate(t.data)}</td>
                  <td className="px-4 py-3">
                    <div className="font-medium text-slate-700">
                      {t.anexo_path && (
                        <button
                          type="button"
                          className="mr-1.5 inline text-slate-400 hover:text-teal-700"
                          title={`Abrir anexo: ${nomeAnexo(t.anexo_path)}`}
                          onClick={() => void abrirAnexo(t.anexo_path!)}
                        >
                          ??
                        </button>
                      )}
                      {t.descricao}
                      {item.faturaResumo?.status === "paga" && (
                        <span className="ml-2 text-xs font-normal text-emerald-700">Paga</span>
                      )}
                      {item.faturaResumo?.status === "aberta" && (
                        <span className="ml-2 text-xs font-normal text-teal-700">Em aberto</span>
                      )}
                      {item.faturaResumo?.status === "fechada" && (
                        <span className="ml-2 text-xs font-normal text-amber-700">Fechada</span>
                      )}
                    </div>
                    {(tagsPorTransacao.get(t.id) ?? []).length > 0 && (
                      <div className="mt-1 flex flex-wrap gap-1">
                        {(tagsPorTransacao.get(t.id) ?? []).map((tag) => (
                          <span
                            key={tag.id}
                            className="inline-block rounded-full px-2 py-0.5 text-[10px] font-medium text-slate-900"
                            style={{ backgroundColor: tag.cor }}
                          >
                            {tag.nome}
                          </span>
                        ))}
                      </div>
                    )}
                  </td>
                  <td className="px-4 py-3">{labelTipoTransacao(item)}</td>
                  <td className="px-4 py-3 text-slate-400">
                    {item.isTransferencia && item.contaOrigem && item.contaDestino ? (
                      <span>
                        {item.contaOrigem}
                        <span className="mx-1 text-slate-400">?</span>
                        {item.contaDestino}
                      </span>
                    ) : (
                      item.contaOrigem ?? "—"
                    )}
                  </td>
                  {contexto === "consolidado" && (
                    <td className="px-4 py-3">
                      {item.isTransferencia && item.par ? (
                        <span className="flex flex-wrap gap-1">
                          <ContextoBadge itemContexto={t.contexto} />
                          <ContextoBadge itemContexto={item.par.contexto} />
                        </span>
                      ) : (
                        <ContextoBadge itemContexto={t.contexto} />
                      )}
                    </td>
                  )}
                  <td
                    className={`px-4 py-3 text-right font-semibold whitespace-nowrap ${valorClass}`}
                  >
                    {valorPrefix}
                    {formatCurrency(t.valor)}
                  </td>
                  <td className="px-4 py-3">
                    {item.faturaResumo ? (
                      <Link to={`/cartoes/${item.faturaResumo.conta_id}`}>
                        <Button variant="ghost" className="px-2 py-1">
                          Ver fatura
                        </Button>
                      </Link>
                    ) : (
                    <div className="flex gap-2">
                      <Button
                        variant="ghost"
                        className="px-2 py-1"
                        onClick={() => {
                          setEditing(t);
                          setModalOpen(true);
                        }}
                      >
                        Editar
                      </Button>
                      <Button
                        variant="ghost"
                        className="px-2 py-1 text-rose-600"
                        onClick={() => void handleDelete(t)}
                      >
                        Excluir
                      </Button>
                    </div>
                    )}
                  </td>
                </tr>
              );
              })}
            </tbody>
          </table>
        </div>
      )}

      <TransacaoModal
        open={modalOpen}
        onClose={() => {
          setModalOpen(false);
          setTipoInicial(undefined);
        }}
        transacao={editing}
        contas={contas}
        categorias={categorias}
        tipoInicial={tipoInicial}
        onSaved={() => {
          setModalOpen(false);
          setTipoInicial(undefined);
          void carregar();
        }}
      />

      <ConciliacaoOfxModal
        open={conciliacaoModalOpen}
        onClose={() => setConciliacaoModalOpen(false)}
        contas={contas}
        onImported={() => {
          setConciliacaoModalOpen(false);
          void carregar();
        }}
      />

      <ImportCsvModal
        open={importModalOpen}
        onClose={() => setImportModalOpen(false)}
        contas={contas}
        onImported={() => {
          setImportModalOpen(false);
          void carregar();
        }}
      />
        </>
      )}
    </div>
  );
}

function RecorrentesPanel({
  contexto,
  ctxLoading,
  contas,
  categorias,
}: {
  contexto: ReturnType<typeof useContexto>["contexto"];
  ctxLoading: boolean;
  contas: Awaited<ReturnType<typeof listContas>>;
  categorias: Awaited<ReturnType<typeof listCategorias>>;
}) {
  const confirm = useConfirm();
  const [lista, setLista] = useState<TransacaoRecorrente[]>([]);
  const [statusMes, setStatusMes] = useState<
    Map<number, { jaGerado: boolean; diaPassou: boolean }>
  >(new Map());
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<TransacaoRecorrente | null>(null);
  const [confirmandoId, setConfirmandoId] = useState<number | null>(null);
  const mes = mesAtual();

  const carregar = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const itens = await listTransacoesRecorrentes(contexto);
      setLista(itens);
      setStatusMes(await mapRecorrentesStatusMes(itens, mes));
    } catch (err) {
      setError(getErrorMessage(err));
    } finally {
      setLoading(false);
    }
  }, [contexto, mes]);

  useEffect(() => {
    if (!ctxLoading) void carregar();
  }, [carregar, ctxLoading]);

  async function handleDelete(id: number) {
    if (!(await confirm("Excluir este lançamento recorrente?"))) return;
    try {
      await deleteTransacaoRecorrente(id);
      await carregar();
    } catch (err) {
      setError(getErrorMessage(err));
    }
  }

  async function handleConfirmar(r: TransacaoRecorrente) {
    const verbo = r.tipo === "receita" ? "recebimento" : "pagamento";
    if (
      !(await confirm({
        title: `Confirmar ${verbo}?`,
        message: `Isso lança ${formatCurrency(r.valor)} na conta e altera o saldo (caixa). Confirme só se o dinheiro já ${r.tipo === "receita" ? "entrou" : "saiu"}.`,
        confirmLabel: "Confirmar",
        tone: "default",
      }))
    ) {
      return;
    }
    setConfirmandoId(r.id);
    setError(null);
    try {
      await confirmarLancamentoRecorrente(r.id, mes);
      await carregar();
    } catch (err) {
      setError(getErrorMessage(err));
    } finally {
      setConfirmandoId(null);
    }
  }

  return (
    <div>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-slate-400">
          Aluguel, assinaturas, salários — ficam como compromisso previsto até você confirmar. Só
          então entram no caixa da conta.
        </p>
        <Button
          onClick={() => {
            setEditing(null);
            setModalOpen(true);
          }}
        >
          + Novo recorrente
        </Button>
      </div>

      {error && (
        <div className="mb-4">
          <ErrorAlert message={error} />
        </div>
      )}

      {loading || ctxLoading ? (
        <LoadingSpinner />
      ) : lista.length === 0 ? (
        <EmptyState message="Nenhum recorrente. Use Recorrentes para o que se repete todo mês (aluguel, assinatura); Agenda é só para datas avulsas." />
      ) : (
        <div className="overflow-x-auto app-card">
          <table className="w-full min-w-[640px] text-sm">
            <thead className="app-table-head">
              <tr>
                <th className="px-4 py-3 font-medium">Descrição</th>
                <th className="px-4 py-3 font-medium">Tipo</th>
                <th className="px-4 py-3 font-medium">Dia</th>
                <th className="px-4 py-3 font-medium">Conta</th>
                <th className="px-4 py-3 font-medium text-right">Valor</th>
                <th className="px-4 py-3 font-medium">Neste mês</th>
                <th className="px-4 py-3 font-medium">Ações</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {lista.map((r) => {
                const conta = contas.find((c) => c.id === r.conta_id);
                const st = statusMes.get(r.id);
                const jaGerado = st?.jaGerado ?? false;
                const podeConfirmar = podeConfirmarRecorrenteNoMes(r, mes, jaGerado);
                return (
                  <tr key={r.id} className="app-table-row">
                    <td className="px-4 py-3 font-medium text-slate-700">{r.descricao}</td>
                    <td className="px-4 py-3 capitalize">{r.tipo}</td>
                    <td className="px-4 py-3">Dia {r.dia_mes}</td>
                    <td className="px-4 py-3 text-slate-400">{conta?.nome ?? "—"}</td>
                    <td
                      className={`px-4 py-3 text-right font-semibold ${r.tipo === "receita" ? "text-green-600" : "text-rose-600"}`}
                    >
                      {r.tipo === "receita" ? "+" : "-"}
                      {formatCurrency(r.valor)}
                    </td>
                    <td className="px-4 py-3">
                      {!r.ativo ? (
                        <span className="text-slate-500">Inativo</span>
                      ) : jaGerado ? (
                        <span className="text-emerald-600">No caixa</span>
                      ) : st?.diaPassou ? (
                        <span className="text-amber-700">Aguardando confirmação</span>
                      ) : (
                        <span className="text-slate-500">Compromisso</span>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex flex-wrap gap-2">
                        {podeConfirmar && (
                          <Button
                            variant="secondary"
                            className="px-2 py-1 text-xs"
                            disabled={confirmandoId === r.id}
                            onClick={() => void handleConfirmar(r)}
                          >
                            {confirmandoId === r.id
                              ? "…"
                              : r.tipo === "receita"
                                ? "Confirmar recebimento"
                                : "Confirmar pagamento"}
                          </Button>
                        )}
                        <Button
                          variant="ghost"
                          className="px-2 py-1"
                          onClick={() => {
                            setEditing(r);
                            setModalOpen(true);
                          }}
                        >
                          Editar
                        </Button>
                        <Button
                          variant="ghost"
                          className="px-2 py-1 text-rose-600"
                          onClick={() => void handleDelete(r.id)}
                        >
                          Excluir
                        </Button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      <RecorrenteModal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        recorrente={editing}
        contas={contas}
        categorias={categorias}
        onSaved={() => {
          setModalOpen(false);
          void carregar();
        }}
      />
    </div>
  );
}

function RecorrenteModal({
  open,
  onClose,
  recorrente,
  contas,
  categorias,
  onSaved,
}: {
  open: boolean;
  onClose: () => void;
  recorrente: TransacaoRecorrente | null;
  contas: Awaited<ReturnType<typeof listContas>>;
  categorias: Awaited<ReturnType<typeof listCategorias>>;
  onSaved: () => void;
}) {
  const { contexto } = useContexto();
  const [formContexto, setFormContexto] = useState<Contexto>(defaultFormContexto(contexto));
  const [descricao, setDescricao] = useState("");
  const [valor, setValor] = useState("");
  const [tipo, setTipo] = useState<"receita" | "despesa">("despesa");
  const [contaId, setContaId] = useState("");
  const [categoriaId, setCategoriaId] = useState("");
  const [diaMes, setDiaMes] = useState("1");
  const [ativo, setAtivo] = useState(true);
  const [observacoes, setObservacoes] = useState("");
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  useEffect(() => {
    if (recorrente) {
      setFormContexto(recorrente.contexto);
      setDescricao(recorrente.descricao);
      setValor(String(recorrente.valor));
      setTipo(recorrente.tipo);
      setContaId(String(recorrente.conta_id));
      setCategoriaId(recorrente.categoria_id ? String(recorrente.categoria_id) : "");
      setDiaMes(String(recorrente.dia_mes));
      setAtivo(recorrente.ativo);
      setObservacoes(recorrente.observacoes ?? "");
    } else {
      setFormContexto(defaultFormContexto(contexto));
      setDescricao("");
      setValor("");
      setTipo("despesa");
      setContaId(contas[0] ? String(contas[0].id) : "");
      setCategoriaId("");
      setDiaMes("1");
      setAtivo(true);
      setObservacoes("");
    }
  }, [recorrente, open, contexto, contas]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setFormError(null);
    const valorNum = parseFloat(valor);
    const dia = Number(diaMes);
    if (!descricao || !valor || isNaN(valorNum) || valorNum <= 0) {
      setFormError("Preencha descrição e valor válido.");
      return;
    }
    if (!contaId) {
      setFormError("Selecione uma conta.");
      return;
    }
    if (dia < 1 || dia > 31) {
      setFormError("Dia do mês deve ser entre 1 e 31.");
      return;
    }
    if (!categoriaId) {
      setFormError("A categoria é obrigatória para o recorrente entrar no orçamento.");
      return;
    }

    const input: TransacaoRecorrenteInput = {
      descricao,
      valor: valorNum,
      tipo,
      conta_id: Number(contaId),
      categoria_id: categoriaId ? Number(categoriaId) : null,
      contexto: resolveContexto(contexto, formContexto),
      dia_mes: dia,
      ativo,
      observacoes: observacoes || null,
    };

    setSaving(true);
    try {
      if (recorrente) {
        await updateTransacaoRecorrente(recorrente.id, input);
      } else {
        await createTransacaoRecorrente(input);
      }
      onSaved();
    } catch (err) {
      setFormError(getErrorMessage(err));
    } finally {
      setSaving(false);
    }
  }

  const contasFiltradas = contas.filter(
    (c) => contexto === "consolidado" || c.contexto === contexto,
  );
  const lancamentoContexto = resolveContexto(contexto, formContexto);
  const categoriasFiltradas = filtrarCategoriasParaLancamento(
    categorias,
    lancamentoContexto,
    tipo,
  );

  return (
    <Modal open={open} onClose={onClose} title={recorrente ? "Editar recorrente" : "Novo recorrente"}>
      <form onSubmit={(e) => void handleSubmit(e)} className="space-y-4">
        {formError && <ErrorAlert message={formError} />}
        <Input label="Descrição" value={descricao} onChange={(e) => setDescricao(e.target.value)} required />
        <div className="grid gap-4 md:grid-cols-2">
          <ValorInput
            label="Valor"
            min="0"
            value={valor}
            onChange={(e) => setValor(e.target.value)}
            required
          />
          <Input
            label="Dia do mês"
            type="number"
            min="1"
            max="31"
            value={diaMes}
            onChange={(e) => setDiaMes(e.target.value)}
            required
          />
        </div>
        <p className="-mt-2 text-xs text-slate-500">
          O lançamento só é criado no mês atual a partir deste dia. Meses anteriores não são
          preenchidos automaticamente.
        </p>
        <div className="grid gap-4 md:grid-cols-2">
          <Select
            label="Tipo"
            value={tipo}
            onChange={(e) => setTipo(e.target.value as "receita" | "despesa")}
            options={[
              { value: "receita", label: "Receita" },
              { value: "despesa", label: "Despesa" },
            ]}
          />
          {contexto === "consolidado" && (
            <ContextoFormSelect value={formContexto} onChange={setFormContexto} />
          )}
        </div>
        <div className="grid gap-4 md:grid-cols-2">
          <Select
            label="Conta"
            value={contaId}
            onChange={(e) => setContaId(e.target.value)}
            options={contasFiltradas.map((c) => ({ value: String(c.id), label: c.nome }))}
          />
          <Select
            label="Categoria (orçamento)"
            value={categoriaId}
            onChange={(e) => setCategoriaId(e.target.value)}
            options={[
              { value: "", label: "Selecione a categoria" },
              ...categoriasFiltradas.map((c) => ({ value: String(c.id), label: c.nome })),
            ]}
            required
          />
        </div>
        <Textarea label="Observações" value={observacoes} onChange={(e) => setObservacoes(e.target.value)} />
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" checked={ativo} onChange={(e) => setAtivo(e.target.checked)} />
          Ativo
        </label>
        <div className="flex justify-end gap-2">
          <Button type="button" variant="secondary" onClick={onClose}>
            Cancelar
          </Button>
          <Button type="submit" disabled={saving}>
            {saving ? "Salvando..." : "Salvar"}
          </Button>
        </div>
      </form>
    </Modal>
  );
}

function ImportCsvModal({
  open,
  onClose,
  contas,
  onImported,
}: {
  open: boolean;
  onClose: () => void;
  contas: Awaited<ReturnType<typeof listContas>>;
  onImported: () => void;
}) {
  const { contexto } = useContexto();
  const [contaId, setContaId] = useState("");
  const [preview, setPreview] = useState<LinhaImportacaoCsv[]>([]);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [resultado, setResultado] = useState<string | null>(null);

  useEffect(() => {
    if (open) {
      setContaId(contas[0] ? String(contas[0].id) : "");
      setPreview([]);
      setFormError(null);
      setResultado(null);
    }
  }, [open, contas]);

  async function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    const text = await file.text();
    setPreview(parseCsvTransacoes(text));
    setResultado(null);
  }

  async function handleImport() {
    setFormError(null);
    if (!contaId) {
      setFormError("Selecione a conta de destino.");
      return;
    }
    if (preview.length === 0) {
      setFormError("Selecione um CSV com lançamentos válidos.");
      return;
    }
    const conta = contas.find((c) => c.id === Number(contaId));
    if (!conta) {
      setFormError("Conta inválida.");
      return;
    }

    setSaving(true);
    try {
      const res = await importarTransacoesCsv(preview, Number(contaId), contexto, conta.contexto);
      setResultado(
        `${res.importados} importados` +
          (res.ignorados > 0 ? `, ${res.ignorados} com erro` : ""),
      );
      if (res.importados > 0) {
        setTimeout(onImported, 800);
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

  return (
    <Modal open={open} onClose={onClose} title="Importar transações (CSV)" wide>
      <div className="space-y-4">
        {formError && <ErrorAlert message={formError} />}
        {resultado && (
          <p className="rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-800">
            {resultado}
          </p>
        )}
        <p className="text-sm text-slate-400">
          Colunas: Data, Descrição, Tipo, Valor (opcional: Categoria, Contexto). Formatos de data:
          AAAA-MM-DD ou DD/MM/AAAA.
        </p>
        <Input label="Arquivo CSV" type="file" accept=".csv,text/csv" onChange={(e) => void handleFile(e)} />
        <Select
          label="Conta de destino"
          value={contaId}
          onChange={(e) => setContaId(e.target.value)}
          options={contas.map((c) => ({ value: String(c.id), label: c.nome }))}
        />
        {preview.length > 0 && (
          <p className="text-sm text-slate-600">{preview.length} lançamento(s) detectado(s).</p>
        )}
        <div className="flex justify-end gap-2">
          <Button type="button" variant="secondary" onClick={onClose}>
            Cancelar
          </Button>
          <Button disabled={saving || preview.length === 0} onClick={() => void handleImport()}>
            {saving ? "Importando..." : "Importar"}
          </Button>
        </div>
      </div>
    </Modal>
  );
}

function TransacaoModal({
  open,
  onClose,
  transacao,
  contas,
  categorias,
  onSaved,
  tipoInicial,
}: {
  open: boolean;
  onClose: () => void;
  transacao: Transacao | null;
  contas: Awaited<ReturnType<typeof listContas>>;
  categorias: Awaited<ReturnType<typeof listCategorias>>;
  onSaved: () => void;
  tipoInicial?: TransacaoInput["tipo"];
}) {
  const { contexto } = useContexto();
  const [formContexto, setFormContexto] = useState<Contexto>(defaultFormContexto(contexto));
  const [descricao, setDescricao] = useState("");
  const [valor, setValor] = useState("");
  const [data, setData] = useState(todayIsoDate());
  const [tipo, setTipo] = useState<TransacaoInput["tipo"]>("despesa");
  const [contaId, setContaId] = useState("");
  const [contaOrigemId, setContaOrigemId] = useState("");
  const [contaDestinoId, setContaDestinoId] = useState("");
  const [categoriaId, setCategoriaId] = useState("");
  const [categoriaOrigemId, setCategoriaOrigemId] = useState("");
  const [categoriaDestinoId, setCategoriaDestinoId] = useState("");
  const [observacoes, setObservacoes] = useState("");
  const [anexoPath, setAnexoPath] = useState<string | null>(null);
  const [pendingAnexoSource, setPendingAnexoSource] = useState<string | null>(null);
  const [tagIds, setTagIds] = useState<number[]>([]);
  const [parcelas, setParcelas] = useState("1");
  const [parcelasJaPagas, setParcelasJaPagas] = useState(0);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [isVinculada, setIsVinculada] = useState(false);
  const [todasContas, setTodasContas] = useState(contas);
  const [maisOpcoes, setMaisOpcoes] = useState(false);
  const [dicaOrcamento, setDicaOrcamento] = useState<ProgressoOrcamentoCategoria | null>(null);

  useEffect(() => {
    if (contexto === "consolidado") {
      void listContas("consolidado").then(setTodasContas);
    } else {
      setTodasContas(contas);
    }
  }, [contexto, contas]);

  useEffect(() => {
    async function loadForm() {
      if (transacao) {
        setDescricao(transacao.descricao);
        setValor(String(transacao.valor));
        setData(transacao.data);
        setObservacoes(transacao.observacoes?.split(" · ")[0] ?? transacao.observacoes ?? "");
        setAnexoPath(transacao.anexo_path);
        setPendingAnexoSource(null);
        const tags = await getTagsTransacao(transacao.id);
        setTagIds(tags.map((tag) => tag.id));
        setMaisOpcoes(
          Boolean(transacao.observacoes) ||
            Boolean(transacao.anexo_path) ||
            tags.length > 0,
        );

        const par = await getParVinculado(transacao);
        const vinculada = !!par || transacao.transacao_vinculada_id !== null;
        setIsVinculada(vinculada);

        if (vinculada && par) {
          setTipo("transferencia");
          const origem =
            transacao.transferencia_papel === "saida" ||
            transacao.tipo === "despesa" ||
            (par && par.id === transacao.transacao_vinculada_id)
              ? transacao
              : par;
          const destino = origem.id === transacao.id ? par : transacao;
          setContaOrigemId(String(origem.conta_id));
          setContaDestinoId(String(destino.conta_id));
          const crossCtx =
            transacao.tipo === "despesa" ||
            transacao.tipo === "receita" ||
            par.tipo === "despesa" ||
            par.tipo === "receita";
          if (crossCtx) {
            const saida =
              transacao.tipo === "despesa"
                ? transacao
                : par!.tipo === "despesa"
                  ? par!
                  : transacao;
            const entrada =
              transacao.tipo === "receita"
                ? transacao
                : par!.tipo === "receita"
                  ? par!
                  : par!;
            setContaOrigemId(String(saida.conta_id));
            setContaDestinoId(String(entrada.conta_id));
            setCategoriaOrigemId(saida.categoria_id ? String(saida.categoria_id) : "");
            setCategoriaDestinoId(entrada.categoria_id ? String(entrada.categoria_id) : "");
          } else {
            setCategoriaOrigemId("");
            setCategoriaDestinoId("");
          }
        } else {
          setFormContexto(transacao.contexto);
          setTipo(transacao.tipo);
          setContaId(String(transacao.conta_id));
          setCategoriaId(transacao.categoria_id ? String(transacao.categoria_id) : "");
        }
      } else {
        setIsVinculada(false);
        setFormContexto(defaultFormContexto(contexto));
        setDescricao("");
        setValor("");
        setData(todayIsoDate());
        setTipo(tipoInicial ?? "despesa");
        const primeira = contas.find((c) => c.tipo !== "cartao_credito") ?? contas[0];
        setContaId(primeira ? String(primeira.id) : "");
        setContaOrigemId(todasContas[0] ? String(todasContas[0].id) : "");
        setContaDestinoId(todasContas[1] ? String(todasContas[1].id) : "");
        setCategoriaId("");
        setCategoriaOrigemId("");
        setCategoriaDestinoId("");
        setObservacoes("");
        setAnexoPath(null);
        setPendingAnexoSource(null);
        setTagIds([]);
        setParcelas("1");
        setParcelasJaPagas(0);
        setMaisOpcoes(false);
      }
    }
    if (open) void loadForm();
  }, [transacao, open, contexto, contas, todasContas, tipoInicial]);

  const isTransferencia = tipo === "transferencia" || isVinculada;
  const contasParaTransfer = contexto === "consolidado" ? todasContas : contas;

  const origemConta = contasParaTransfer.find((c) => String(c.id) === contaOrigemId);
  const destinoConta = contasParaTransfer.find((c) => String(c.id) === contaDestinoId);
  const crossContext =
    origemConta && destinoConta && origemConta.contexto !== destinoConta.contexto;

  const categoriasOrigem = origemConta
    ? filtrarCategoriasParaLancamento(categorias, origemConta.contexto, "despesa")
    : [];
  const categoriasDestino = destinoConta
    ? filtrarCategoriasParaLancamento(categorias, destinoConta.contexto, "receita")
    : [];

  useEffect(() => {
    if (!open || isTransferencia || !categoriaId) {
      setDicaOrcamento(null);
      return;
    }
    const valorNum = parseFloat(valor);
    const extra = !transacao && !Number.isNaN(valorNum) && valorNum > 0 ? valorNum : 0;
    let cancelado = false;
    void getProgressoOrcamentoCategoria(
      Number(categoriaId),
      resolveContexto(contexto, formContexto),
      data.slice(0, 7),
      { valorExtra: extra },
    )
      .then((p) => {
        if (!cancelado) setDicaOrcamento(p.valor_limite != null ? p : null);
      })
      .catch(() => {
        if (!cancelado) setDicaOrcamento(null);
      });
    return () => {
      cancelado = true;
    };
  }, [open, isTransferencia, categoriaId, valor, data, contexto, formContexto, transacao]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setFormError(null);
    const valorNum = parseFloat(valor);
    if (!descricao || !valor || isNaN(valorNum) || valorNum <= 0) {
      setFormError("Preencha descrição e valor válido.");
      return;
    }

    setSaving(true);
    try {
      if (isTransferencia) {
        if (!contaOrigemId || !contaDestinoId) {
          setFormError("Selecione contas de origem e destino.");
          return;
        }
        if (contaOrigemId === contaDestinoId) {
          setFormError("Contas de origem e destino devem ser diferentes.");
          return;
        }

        if (transacao && isVinculada) {
          const par = await getParVinculado(transacao);
          const crossCtx =
            transacao.tipo === "despesa" ||
            transacao.tipo === "receita" ||
            par?.tipo === "despesa" ||
            par?.tipo === "receita";

          if (crossCtx) {
            await updateTransferenciaVinculada(transacao.id, {
              descricao,
              valor: valorNum,
              data,
              observacoes: observacoes || null,
              categoria_origem_id: categoriaOrigemId ? Number(categoriaOrigemId) : null,
              categoria_destino_id: categoriaDestinoId ? Number(categoriaDestinoId) : null,
            });
          } else {
            await updateTransacao(transacao.id, {
              descricao,
              valor: valorNum,
              data,
              observacoes: observacoes || null,
            });
          }
        } else {
          await createTransferencia({
            descricao,
            valor: valorNum,
            data,
            conta_origem_id: Number(contaOrigemId),
            conta_destino_id: Number(contaDestinoId),
            observacoes: observacoes || null,
            categoria_origem_id: crossContext && categoriaOrigemId ? Number(categoriaOrigemId) : null,
            categoria_destino_id:
              crossContext && categoriaDestinoId ? Number(categoriaDestinoId) : null,
          });
        }
      } else {
        if (!contaId) {
          setFormError("Selecione uma conta.");
          return;
        }
        const input: TransacaoInput = {
          descricao,
          valor: valorNum,
          data,
          tipo,
          conta_id: Number(contaId),
          categoria_id: categoriaId ? Number(categoriaId) : null,
          contexto: resolveContexto(contexto, formContexto),
          observacoes: observacoes || null,
          tag_ids: tagIds,
        };
        if (transacao) {
          await updateTransacao(transacao.id, input);
          if (pendingAnexoSource) {
            await aplicarAnexoPendente(transacao.id, pendingAnexoSource);
          }
        } else {
          const contaSel = contasFiltradas.find((c) => String(c.id) === contaId);
          const nParcelas = Math.floor(Number(parcelas));
          const jaPagas = Math.min(
            Math.max(0, parcelasJaPagas),
            Math.max(0, nParcelas - 1),
          );
          if (
            tipo === "despesa" &&
            contaSel?.tipo === "cartao_credito" &&
            nParcelas >= 2
          ) {
            const errHist = validarParcelasJaPagas(jaPagas, nParcelas);
            if (errHist) {
              setFormError(errHist);
              setSaving(false);
              return;
            }
            if (jaPagas >= nParcelas) {
              setFormError("Deixe ao menos 1 parcela em aberto.");
              setSaving(false);
              return;
            }
            const criadas = await createCompraParceladaCartao({
              ...input,
              parcelas: nParcelas,
              parcelas_ja_pagas: jaPagas,
            });
            if (pendingAnexoSource && criadas[0]) {
              await aplicarAnexoPendente(criadas[0].id, pendingAnexoSource);
            }
          } else {
            const created = await createTransacao(input);
            if (pendingAnexoSource) {
              await aplicarAnexoPendente(created.id, pendingAnexoSource);
            }
          }
        }
      }
      onSaved();
    } catch (err) {
      setFormError(getErrorMessage(err));
    } finally {
      setSaving(false);
    }
  }

  const contasFiltradas = contas.filter(
    (c) => contexto === "consolidado" || c.contexto === contexto,
  );
  const contasLancamento = contasFiltradas.filter(
    (c) => transacao != null || c.tipo !== "cartao_credito",
  );

  const contaSelecionada = contasFiltradas.find((c) => String(c.id) === contaId);
  const mostrarParcelas =
    !transacao &&
    !isTransferencia &&
    tipo === "despesa" &&
    contaSelecionada?.tipo === "cartao_credito";

  const lancamentoContexto = resolveContexto(contexto, formContexto);
  const categoriasFiltradas = filtrarCategoriasParaLancamento(
    categorias,
    lancamentoContexto,
    tipo === "transferencia" ? undefined : tipo,
  );

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={transacao ? "Editar lançamento" : "Novo lançamento"}
      wide={isTransferencia || maisOpcoes || crossContext}
    >
      <form onSubmit={(e) => void handleSubmit(e)} className="space-y-4">
        {formError && <ErrorAlert message={formError} />}
        {isVinculada && (
          <p className="rounded-xl border border-teal-200 bg-teal-50 px-3 py-2 text-sm text-teal-800">
            Transferência vinculada — alterações em descrição, valor, data e categorias serão
            aplicadas ao par de lançamentos.
          </p>
        )}

        {!isVinculada && (
          <div className="flex rounded-xl border border-slate-200 bg-slate-50 p-1">
            {TIPO_OPTIONS.map((opt) => (
              <button
                key={opt.value}
                type="button"
                onClick={() => setTipo(opt.value as TransacaoInput["tipo"])}
                className={`flex-1 rounded-lg px-3 py-1.5 text-xs font-medium ${
                  tipo === opt.value
                    ? "bg-white text-slate-900"
                    : "text-slate-500 hover:text-slate-800"
                }`}
              >
                {opt.label}
              </button>
            ))}
          </div>
        )}

        <Input
          label="O quê"
          value={descricao}
          onChange={(e) => setDescricao(e.target.value)}
          required
          placeholder="Ex.: supermercado, salário, aluguel"
        />
        <div className="grid gap-4 md:grid-cols-2">
          <ValorInput
            label="Quanto"
            min="0"
            value={valor}
            onChange={(e) => setValor(e.target.value)}
            required
          />
          <Input
            label="Quando"
            type="date"
            value={data}
            onChange={(e) => setData(e.target.value)}
            required
          />
        </div>

        {contexto === "consolidado" && !isTransferencia && !isVinculada && (
          <ContextoFormSelect value={formContexto} onChange={setFormContexto} />
        )}

        {isTransferencia ? (
          <>
            <div className="grid gap-4 md:grid-cols-2">
              <Select
                label="Sai de"
                value={contaOrigemId}
                onChange={(e) => setContaOrigemId(e.target.value)}
                disabled={isVinculada}
                options={contasParaTransfer.map((c) => ({
                  value: String(c.id),
                  label: `${c.nome} (${c.contexto})`,
                }))}
              />
              <Select
                label="Entra em"
                value={contaDestinoId}
                onChange={(e) => setContaDestinoId(e.target.value)}
                disabled={isVinculada}
                options={contasParaTransfer.map((c) => ({
                  value: String(c.id),
                  label: `${c.nome} (${c.contexto})`,
                }))}
              />
            </div>
            {crossContext && (
              <>
                <p className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-950">
                  Isso é uma <strong>retirada/aporte entre contextos</strong>: sai de{" "}
                  <ContextoBadge itemContexto={origemConta!.contexto} /> e entra em{" "}
                  <ContextoBadge itemContexto={destinoConta!.contexto} />. No resultado do mês
                  aparece como despesa na origem e receita no destino — não é transferência
                  interna de um mesmo caixa.
                </p>
                <div className="grid gap-4 md:grid-cols-2">
                  <Select
                    label={`Categoria na origem (${origemConta!.contexto}) — ex.: pró-labore / retirada`}
                    value={categoriaOrigemId}
                    onChange={(e) => setCategoriaOrigemId(e.target.value)}
                    options={[
                      { value: "", label: "Sem categoria" },
                      ...categoriasOrigem.map((c) => ({ value: String(c.id), label: c.nome })),
                    ]}
                  />
                  <Select
                    label={`Categoria no destino (${destinoConta!.contexto}) — ex.: aporte`}
                    value={categoriaDestinoId}
                    onChange={(e) => setCategoriaDestinoId(e.target.value)}
                    options={[
                      { value: "", label: "Sem categoria" },
                      ...categoriasDestino.map((c) => ({ value: String(c.id), label: c.nome })),
                    ]}
                  />
                </div>
              </>
            )}
          </>
        ) : (
          <div className="grid gap-4 md:grid-cols-2">
            <Select
              label="De onde"
              value={contaId}
              onChange={(e) => setContaId(e.target.value)}
              options={contasLancamento.map((c) => ({ value: String(c.id), label: c.nome }))}
            />
            <Select
              label="Categoria"
              value={categoriaId}
              onChange={(e) => setCategoriaId(e.target.value)}
              options={[
                { value: "", label: "Sem categoria" },
                ...categoriasFiltradas.map((c) => ({ value: String(c.id), label: c.nome })),
              ]}
            />
          </div>
        )}
        {!transacao && !isTransferencia && (
          <p className="-mt-2 text-xs text-slate-500">
            Compras no cartão são lançadas em Cartões de crédito. Aqui entra o total da fatura.
          </p>
        )}
        {!transacao && !isTransferencia && (
          <p className="-mt-2 text-xs text-slate-500">
            Compras no cartão são lançadas em Cartões de crédito. Aqui entra o total da fatura.
          </p>
        )}

        {dicaOrcamento && dicaOrcamento.disponivel != null && (
          <p
            className={`text-xs ${
              dicaOrcamento.disponivel < 0 ? "text-rose-700" : "text-slate-500"
            }`}
          >
            {dicaOrcamento.tipo_categoria === "receita"
              ? dicaOrcamento.disponivel > 0
                ? `Faltam ${formatCurrency(dicaOrcamento.disponivel)} para a meta desta categoria.`
                : "Meta de receita desta categoria atingida neste mês."
              : dicaOrcamento.disponivel >= 0
                ? `Neste orçamento ainda cabem ${formatCurrency(dicaOrcamento.disponivel)}.`
                : `Este lançamento deixa o orçamento ${formatCurrency(Math.abs(dicaOrcamento.disponivel))} acima do limite.`}
          </p>
        )}

        {mostrarParcelas && (
          <div className="space-y-2">
            <Input
              label="Parcelas no cartão"
              type="number"
              min="1"
              max="48"
              step="1"
              value={parcelas}
              onChange={(e) => {
                setParcelas(e.target.value);
                const n = Math.max(1, Math.floor(Number(e.target.value) || 1));
                setParcelasJaPagas((q) => Math.min(q, Math.max(0, n - 1)));
              }}
            />
            {Number(parcelas) >= 2 && (
              <>
                <ParcelasJaPagasField
                  value={Math.min(parcelasJaPagas, Math.max(0, Math.floor(Number(parcelas)) - 1))}
                  onChange={(q) =>
                    setParcelasJaPagas(Math.min(q, Math.max(0, Math.floor(Number(parcelas)) - 1)))
                  }
                  totalParcelas={Math.floor(Number(parcelas))}
                  hint="Quantas já caíram na fatura. Só as restantes serão lançadas (ex.: 10× com 4 pagas → cria da 5/10 em diante)."
                />
                <p className="text-xs text-slate-500">
                  O valor total é dividido em {Math.floor(Number(parcelas))} parcelas; as já
                  pagas não entram de novo nas faturas.
                </p>
              </>
            )}
          </div>
        )}

        {transacao?.parcela_total != null && transacao.parcela_total > 1 && (
          <p className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-400">
            Parcela {transacao.parcela_numero}/{transacao.parcela_total} de compra parcelada
          </p>
        )}

        <button
          type="button"
          className="text-xs font-medium text-teal-700 hover:underline"
          onClick={() => setMaisOpcoes((v) => !v)}
        >
          {maisOpcoes ? "Ocultar opções" : "Mais opções"}
        </button>

        {maisOpcoes && (
          <div className="space-y-4 border-t border-slate-100 pt-3">
            <Textarea
              label="Observações"
              value={observacoes}
              onChange={(e) => setObservacoes(e.target.value)}
            />
            {!isTransferencia && <TagSelect value={tagIds} onChange={setTagIds} />}
            {!isTransferencia && (
              <TransacaoAnexoField
                transacaoId={transacao?.id ?? null}
                anexoPath={anexoPath}
                onAnexoChange={setAnexoPath}
                pendingSource={pendingAnexoSource}
                onPendingSourceChange={setPendingAnexoSource}
              />
            )}
          </div>
        )}

        <div className="flex justify-end gap-2 pt-2">
          <Button type="button" variant="secondary" onClick={onClose}>
            Cancelar
          </Button>
          <Button type="submit" disabled={saving}>
            {saving ? "Salvando..." : "Salvar"}
          </Button>
        </div>
      </form>
    </Modal>
  );
}
