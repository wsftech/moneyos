import { useCallback, useEffect, useMemo, useState } from "react";
import { ContextoBadge } from "../components/ContextoSelector";
import {
  ContextoFormSelect,
  defaultFormContexto,
  resolveContexto,
} from "../components/ContextoFormSelect";
import { useConfirm } from "../components/ConfirmDialog";
import { Button } from "../components/ui/Button";
import { EmptyState, ErrorAlert, LoadingSpinner, PageHeader } from "../components/ui/Feedback";
import { Input, Select, Textarea, ValorInput } from "../components/ui/FormFields";
import { Modal } from "../components/ui/Modal";
import { useContexto } from "../contexts/ContextoContext";
import { listCategorias } from "../db/categorias";
import { listContas } from "../db/contas";
import { ParcelasJaPagasField } from "../components/ParcelasJaPagasField";
import {
  FaixaInicialParcelasField,
  resolverFaixaCadastro,
  rotuloFaixaContrato,
} from "../components/FaixaInicialParcelasField";
import {
  aplicarPagamentosHistoricos,
  createEmprestimo,
  deleteEmprestimo,
  filtrarParcelasPorSelecao,
  listEmprestimos,
  listParcelas,
  pagarParcelas,
  sincronizarStatusParcelas,
  sincronizarLancamentosParcelamentos,
  updateEmprestimo,
  type EmprestimoInput,
} from "../db/emprestimos";
import { getErrorMessage } from "../db/utils";
import type {
  Contexto,
  ContextoVisualizacao,
  EmprestimoParcela,
  EmprestimoResumo,
  ModalidadeEmprestimo,
} from "../types";
import { formatCurrency, formatDate, mesAtual } from "../utils/format";
import { descricaoSubtipoDivida } from "../constants/tiposDivida";
import { gerarValoresPrevistos } from "../utils/financiamentoCalc";
import {
  gerarPagamentosHistoricosPadrao,
  validarParcelasJaPagas,
} from "../utils/parcelasHistoricas";

type SelecaoRapida = "mes" | "ultima" | "mes_e_ultima" | "todas" | "manual";
type PagamentoSelecionado = { valor: number; data: string };

function copyModalidade(modalidade: ModalidadeEmprestimo) {
  const parcelamento = modalidade === "parcelamento";
  return {
    title: parcelamento ? "Parcelamentos" : "Empréstimos",
    subtitle: parcelamento
      ? "Carnê, acordo, imposto ou compra em vezes — fora do cartão de crédito"
      : "Empréstimos bancários e pessoais — parcelas e saldo devedor",
    novo: parcelamento ? "+ Novo parcelamento" : "+ Novo empréstimo",
    empty: parcelamento ? "Nenhum parcelamento cadastrado." : "Nenhum empréstimo cadastrado.",
    excluir: parcelamento
      ? "Excluir este parcelamento e todas as parcelas?"
      : "Excluir este empréstimo e todas as parcelas?",
    editar: parcelamento ? "Editar parcelamento" : "Editar empréstimo",
    novoModal: parcelamento ? "Novo parcelamento" : "Novo empréstimo",
    valorHint: parcelamento
      ? "Total do carnê, acordo ou contrato (soma das parcelas)."
      : "Como aparece no app do banco (ex.: R$ 68.684,46).",
  };
}

export function EmprestimosPage({
  embedded = false,
  onChanged,
  abrirNovo = false,
  onAbrirNovoConsumido,
  modalidade = "emprestimo",
}: {
  embedded?: boolean;
  onChanged?: () => void;
  abrirNovo?: boolean;
  onAbrirNovoConsumido?: () => void;
  modalidade?: ModalidadeEmprestimo;
} = {}) {
  const { contexto, loading: ctxLoading } = useContexto();
  const confirm = useConfirm();
  const copy = copyModalidade(modalidade);
  const [items, setItems] = useState<EmprestimoResumo[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [modalCadastro, setModalCadastro] = useState(false);
  const [modalPagamento, setModalPagamento] = useState(false);
  const [editing, setEditing] = useState<EmprestimoResumo | null>(null);
  const [pagando, setPagando] = useState<EmprestimoResumo | null>(null);
  const [pagamentoHistorico, setPagamentoHistorico] = useState(false);

  useEffect(() => {
    if (!abrirNovo) return;
    setEditing(null);
    setModalCadastro(true);
    onAbrirNovoConsumido?.();
  }, [abrirNovo, onAbrirNovoConsumido]);

  const carregar = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      await sincronizarStatusParcelas();
      if (modalidade === "parcelamento") {
        await sincronizarLancamentosParcelamentos(contexto);
      }
      setItems(await listEmprestimos(contexto, modalidade));
      onChanged?.();
    } catch (err) {
      setError(getErrorMessage(err));
    } finally {
      setLoading(false);
    }
  }, [contexto, modalidade]);

  useEffect(() => {
    if (!ctxLoading) void carregar();
  }, [carregar, ctxLoading]);

  async function handleDelete(id: number) {
    if (!(await confirm(copy.excluir))) return;
    try {
      await deleteEmprestimo(id);
      await carregar();
    } catch (err) {
      setError(getErrorMessage(err));
    }
  }

  return (
    <div>
      {!embedded && (
        <PageHeader
          title={copy.title}
          subtitle={copy.subtitle}
          action={
            <Button
              onClick={() => {
                setEditing(null);
                setModalCadastro(true);
              }}
            >
              {copy.novo}
            </Button>
          }
        />
      )}
      {embedded && (
        <div className="mb-4 flex justify-end">
          <Button
            onClick={() => {
              setEditing(null);
              setModalCadastro(true);
            }}
          >
            {copy.novo}
          </Button>
        </div>
      )}

      {error && (
        <div className="mb-4">
          <ErrorAlert message={error} />
        </div>
      )}

      {loading || ctxLoading ? (
        <LoadingSpinner />
      ) : items.length === 0 ? (
        <EmptyState message={copy.empty} />
      ) : (
        <div className="space-y-4">
          {items.map((fin) => (
            <EmprestimoCard
              key={fin.id}
              fin={fin}
              contexto={contexto}
              onPagar={() => {
                setPagando(fin);
                setPagamentoHistorico(false);
                setModalPagamento(true);
              }}
              onRegistrarAnteriores={() => {
                setPagando(fin);
                setPagamentoHistorico(true);
                setModalPagamento(true);
              }}
              onEdit={() => {
                setEditing(fin);
                setModalCadastro(true);
              }}
              onDelete={() => void handleDelete(fin.id)}
            />
          ))}
        </div>
      )}

      <CadastroModal
        open={modalCadastro}
        onClose={() => setModalCadastro(false)}
        emprestimo={editing}
        modalidade={modalidade}
        onSaved={() => {
          setModalCadastro(false);
          void carregar();
        }}
      />

      <PagamentoModal
        open={modalPagamento}
        onClose={() => {
          setModalPagamento(false);
          setPagamentoHistorico(false);
        }}
        emprestimo={pagando}
        modoHistorico={pagamentoHistorico}
        onSaved={async () => {
          setModalPagamento(false);
          setPagamentoHistorico(false);
          await carregar();
        }}
      />
    </div>
  );
}

function EmprestimoCard({
  fin,
  contexto,
  onPagar,
  onRegistrarAnteriores,
  onEdit,
  onDelete,
}: {
  fin: EmprestimoResumo;
  contexto: ContextoVisualizacao;
  onPagar: () => void;
  onRegistrarAnteriores: () => void;
  onEdit: () => void;
  onDelete: () => void;
}) {
  const [expandido, setExpandido] = useState(false);
  const [parcelas, setParcelas] = useState<EmprestimoParcela[]>([]);
  const [loadingParcelas, setLoadingParcelas] = useState(false);

  async function toggleHistorico() {
    if (expandido) {
      setExpandido(false);
      return;
    }
    setLoadingParcelas(true);
    try {
      setParcelas(await listParcelas(fin.id));
      setExpandido(true);
    } finally {
      setLoadingParcelas(false);
    }
  }

  const pagas = parcelas.filter((p) => p.status === "paga");

  return (
    <div className="app-card p-5">
      <div className="mb-3 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h3 className="font-semibold text-slate-900">{fin.descricao}</h3>
          <p className="text-sm text-slate-500">
            {fin.parcelas_pagas}/{fin.total_parcelas} parcelas · venc. dia{" "}
            {fin.data_primeira_parcela.slice(8, 10)} ·{" "}
            {rotuloFaixaContrato(
              fin.total_parcelas,
              fin.valor_parcela,
              fin.faixa_inicial_qtd,
              fin.faixa_inicial_valor,
            )}
          </p>
          {contexto === "consolidado" && (
            <div className="mt-1">
              <ContextoBadge itemContexto={fin.contexto} />
            </div>
          )}
        </div>
        <div className="text-right">
          <p className="text-lg font-bold text-slate-900">{formatCurrency(fin.valor_restante)}</p>
          <p className="text-xs text-slate-500">restante</p>
        </div>
      </div>

      <div className="mb-2 h-2 overflow-hidden rounded-full bg-slate-100">
        <div
          className="h-full rounded-full bg-gradient-to-r from-cyan-400 to-blue-500 transition-all"
          style={{ width: `${fin.percentual_pago}%` }}
        />
      </div>
      <p className="mb-4 text-xs text-slate-500">
        Você pagou {formatCurrency(fin.valor_pago)} de {formatCurrency(fin.valor_total_contrato)}
        {" · "}
        Falta {formatCurrency(fin.valor_restante)}
        {" · "}
        {fin.percentual_pago}% quitado
        {fin.proximo_vencimento && <> · Próx. venc.: {formatDate(fin.proximo_vencimento)}</>}
      </p>

      {expandido && pagas.length > 0 && (
        <div className="mb-4 overflow-x-auto rounded-lg border border-slate-100">
          <table className="w-full text-xs">
            <thead className="app-table-head">
              <tr>
                <th className="px-3 py-2 font-medium">#</th>
                <th className="px-3 py-2 font-medium">Vencimento</th>
                <th className="px-3 py-2 font-medium">Pago em</th>
                <th className="px-3 py-2 font-medium text-right">Valor</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {pagas.map((p) => (
                <tr key={p.id}>
                  <td className="px-3 py-2">{p.numero_parcela}</td>
                  <td className="px-3 py-2">{formatDate(p.vencimento)}</td>
                  <td className="px-3 py-2">
                    {p.data_pagamento ? formatDate(p.data_pagamento) : "—"}
                    {p.data_pagamento && p.data_pagamento < p.vencimento && (
                      <span className="ml-1 text-green-600">antecipado</span>
                    )}
                  </td>
                  <td className="px-3 py-2 text-right font-medium">
                    {formatCurrency(p.valor_pago ?? 0)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <div className="flex flex-wrap gap-2">
        {fin.parcelas_pagas > 0 && (
          <Button variant="secondary" className="py-1.5" onClick={() => void toggleHistorico()}>
            {loadingParcelas ? "..." : expandido ? "Ocultar histórico" : "Ver pagamentos"}
          </Button>
        )}
        {fin.parcelas_restantes > 0 && (
          <>
            <Button className="py-1.5" onClick={onPagar}>
              Pagar parcelas
            </Button>
            <Button variant="secondary" className="py-1.5" onClick={onRegistrarAnteriores}>
              Registrar anteriores
            </Button>
          </>
        )}
        <Button variant="secondary" className="py-1.5" onClick={onEdit}>
          Editar
        </Button>
        <Button variant="ghost" className="text-rose-600" onClick={onDelete}>
          Excluir
        </Button>
      </div>
    </div>
  );
}

function CadastroModal({
  open,
  onClose,
  emprestimo,
  onSaved,
  modalidade,
}: {
  open: boolean;
  onClose: () => void;
  emprestimo: EmprestimoResumo | null;
  onSaved: () => void;
  modalidade: ModalidadeEmprestimo;
}) {
  const { contexto } = useContexto();
  const [contas, setContas] = useState<Awaited<ReturnType<typeof listContas>>>([]);
  const [categorias, setCategorias] = useState<Awaited<ReturnType<typeof listCategorias>>>([]);
  const [formContexto, setFormContexto] = useState<Contexto>(defaultFormContexto(contexto));
  const [descricao, setDescricao] = useState("");
  const [valorTotal, setValorTotal] = useState("");
  const [valorParcela, setValorParcela] = useState("");
  const [totalParcelas, setTotalParcelas] = useState("");
  const [dataPrimeira, setDataPrimeira] = useState("");
  const [contaId, setContaId] = useState("");
  const [categoriaId, setCategoriaId] = useState("");
  const [observacoes, setObservacoes] = useState("");
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [parcelasJaPagas, setParcelasJaPagas] = useState(0);
  const [faixaEnabled, setFaixaEnabled] = useState(false);
  const [faixaQtd, setFaixaQtd] = useState("");
  const [faixaValor, setFaixaValor] = useState("");

  useEffect(() => {
    if (!open) return;

    void (async () => {
      const ctxForm = emprestimo?.contexto ?? defaultFormContexto(contexto);
      const ctxDivida = ctxForm === "empresa" ? "empresa" : "pessoal";
      const { ensureCategoriaDivida } = await import("../db/categorias");
      const padrao = await ensureCategoriaDivida(modalidade, ctxDivida);
      const [c, cat] = await Promise.all([listContas(contexto), listCategorias(contexto)]);
      const despesas = cat.filter((x) => x.tipo === "despesa");
      setContas(c);
      setCategorias(despesas);

      if (emprestimo) {
        setFormContexto(emprestimo.contexto);
        setDescricao(emprestimo.descricao);
        setValorTotal(String(emprestimo.valor_total));
        setValorParcela(String(emprestimo.valor_parcela));
        setTotalParcelas(String(emprestimo.total_parcelas));
        setDataPrimeira(emprestimo.data_primeira_parcela);
        setContaId(String(emprestimo.conta_id));
        setCategoriaId(
          emprestimo.categoria_id
            ? String(emprestimo.categoria_id)
            : padrao
              ? String(padrao.id)
              : "",
        );
        setObservacoes(emprestimo.observacoes ?? "");
        const temFaixa = !!(emprestimo.faixa_inicial_qtd && emprestimo.faixa_inicial_valor);
        setFaixaEnabled(temFaixa);
        setFaixaQtd(temFaixa ? String(emprestimo.faixa_inicial_qtd) : "");
        setFaixaValor(temFaixa ? String(emprestimo.faixa_inicial_valor) : "");
      } else {
        setFormContexto(defaultFormContexto(contexto));
        setDescricao("");
        setValorTotal("");
        setValorParcela("");
        setTotalParcelas("");
        setDataPrimeira(new Date().toISOString().slice(0, 10));
        setContaId(c[0] ? String(c[0].id) : "");
        setCategoriaId(padrao ? String(padrao.id) : "");
        setObservacoes("");
        setParcelasJaPagas(0);
        setFaixaEnabled(false);
        setFaixaQtd("");
        setFaixaValor("");
      }
    })();
  }, [open, contexto, emprestimo, modalidade]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setFormError(null);

    if (emprestimo) {
      const vt = parseFloat(valorTotal);
      const vp = parseFloat(valorParcela);
      if (!descricao || !contaId || !categoriaId || isNaN(vt) || vt <= 0 || isNaN(vp) || vp <= 0) {
        setFormError("Preencha descrição, categoria, valor total e parcela de referência.");
        return;
      }
      const faixaEdit = resolverFaixaCadastro(
        faixaEnabled,
        faixaQtd,
        faixaValor,
        emprestimo.total_parcelas,
      );
      if (faixaEdit.erro) {
        setFormError(faixaEdit.erro);
        return;
      }
      setSaving(true);
      try {
        await updateEmprestimo(emprestimo.id, {
          descricao,
          valor_total: vt,
          valor_parcela: vp,
          conta_id: Number(contaId),
          categoria_id: Number(categoriaId),
          observacoes: observacoes || null,
          faixa_inicial_qtd: faixaEdit.faixa?.qtd ?? null,
          faixa_inicial_valor: faixaEdit.faixa?.valor ?? null,
        });
        onSaved();
      } catch (err) {
        setFormError(getErrorMessage(err));
      } finally {
        setSaving(false);
      }
      return;
    }

    const vt = parseFloat(valorTotal);
    const vp = parseFloat(valorParcela);
    const tp = parseInt(totalParcelas, 10);
    if (
      !descricao ||
      !dataPrimeira ||
      !contaId ||
      !categoriaId ||
      isNaN(vt) ||
      vt <= 0 ||
      isNaN(vp) ||
      vp <= 0 ||
      isNaN(tp) ||
      tp <= 0
    ) {
      setFormError("Preencha todos os campos obrigatórios, incluindo a categoria do orçamento.");
      return;
    }

    if (parcelasJaPagas > 0) {
      const errHist = validarParcelasJaPagas(parcelasJaPagas, tp);
      if (errHist) {
        setFormError(errHist);
        return;
      }
    }

    const faixaNova = resolverFaixaCadastro(faixaEnabled, faixaQtd, faixaValor, tp);
    if (faixaNova.erro) {
      setFormError(faixaNova.erro);
      return;
    }

    const input: EmprestimoInput = {
      descricao,
      valor_total: vt,
      valor_parcela: vp,
      total_parcelas: tp,
      contexto: resolveContexto(contexto, formContexto),
      conta_id: Number(contaId),
      categoria_id: Number(categoriaId),
      data_primeira_parcela: dataPrimeira,
      observacoes: observacoes || null,
      modalidade,
      faixa_inicial_qtd: faixaNova.faixa?.qtd ?? null,
      faixa_inicial_valor: faixaNova.faixa?.valor ?? null,
    };

    setSaving(true);
    try {
      const created = await createEmprestimo(input);
      if (parcelasJaPagas > 0) {
        const previstos = gerarValoresPrevistos(vt, vp, tp, faixaNova.faixa);
        const historico = gerarPagamentosHistoricosPadrao(
          parcelasJaPagas,
          previstos,
          dataPrimeira,
        );
        await aplicarPagamentosHistoricos(
          created.id,
          historico.map((r) => ({
            numero_parcela: r.numero_parcela,
            valor_pago: r.valor,
            data_pagamento: r.data,
          })),
          { criar_transacao: false, conta_id: Number(contaId) },
        );
      }
      onSaved();
    } catch (err) {
      setFormError(getErrorMessage(err));
    } finally {
      setSaving(false);
    }
  }

  const isEdit = !!emprestimo;
  const copy = copyModalidade(modalidade);
  const vtPreview = parseFloat(valorTotal);
  const vpPreview = parseFloat(valorParcela);
  const tpPreview = parseInt(totalParcelas, 10);
  const mediaParcela =
    !isNaN(vtPreview) && !isNaN(tpPreview) && tpPreview > 0
      ? vtPreview / tpPreview
      : null;

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={isEdit ? copy.editar : copy.novoModal}
      wide
    >
      <form onSubmit={(e) => void handleSubmit(e)} className="space-y-4">
        {formError && <ErrorAlert message={formError} />}
        {!isEdit && (
          <p className="app-muted-box px-3 py-2 text-sm text-slate-600">
            {descricaoSubtipoDivida(modalidade)}
          </p>
        )}
        <Input label="Descrição" value={descricao} onChange={(e) => setDescricao(e.target.value)} required />
        <ValorInput
          label="Valor total do contrato"
          min="0"
          value={valorTotal}
          onChange={(e) => setValorTotal(e.target.value)}
          required
        />
        <p className="-mt-2 text-xs text-slate-500">
          {copy.valorHint}
        </p>
        {!isEdit && (
          <div className="grid gap-4 md:grid-cols-2">
            <ValorInput
              label={
                faixaEnabled
                  ? "Parcela das demais (orçamento)"
                  : "Parcela de referência (orçamento)"
              }
              min="0"
              value={valorParcela}
              onChange={(e) => setValorParcela(e.target.value)}
              required
            />
            <Input
              label="Quantidade de parcelas"
              type="number"
              min="1"
              value={totalParcelas}
              onChange={(e) => setTotalParcelas(e.target.value)}
              required
            />
          </div>
        )}
        {isEdit && (
          <ValorInput
            label={
              faixaEnabled
                ? "Parcela das demais (orçamento)"
                : "Parcela de referência (orçamento)"
            }
            min="0"
            value={valorParcela}
            onChange={(e) => setValorParcela(e.target.value)}
            required
          />
        )}
        <FaixaInicialParcelasField
          enabled={faixaEnabled}
          onEnabledChange={setFaixaEnabled}
          qtd={faixaQtd}
          onQtdChange={setFaixaQtd}
          valor={faixaValor}
          onValorChange={setFaixaValor}
          totalParcelas={isEdit ? (emprestimo?.total_parcelas ?? 0) : tpPreview || 0}
          valorParcela={vpPreview || 0}
          valorTotal={vtPreview || 0}
        />
        {!isEdit && !faixaEnabled && mediaParcela !== null && (
          <p className="app-muted-box px-3 py-2 text-sm">
            Média contábil: {formatCurrency(mediaParcela)} ({tpPreview} parcelas). O{" "}
            <strong>valor previsto</strong> de cada parcela será a parcela de referência (
            {!isNaN(vpPreview) && vpPreview > 0 ? formatCurrency(vpPreview) : "acima"}), não a média.
          </p>
        )}
        {isEdit && (
          <p className="rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-800">
            Ao corrigir o valor total, as parcelas pendentes serão recalculadas. Pagamentos já
            registrados mantêm o valor real pago.
          </p>
        )}
        {!isEdit && (
          <>
            <Input
              label="Vencimento da 1ª parcela"
              type="date"
              value={dataPrimeira}
              onChange={(e) => setDataPrimeira(e.target.value)}
              required
            />
            <p className="-mt-2 text-xs text-slate-500">
              Use a data de <strong>vencimento no contrato</strong> (ex.: todo dia 13 → 13/03), não
              a data em que você pagou adiantado. Pagamentos reais ficam em “Parcelas já pagas” ou
              “Registrar anteriores”.
            </p>
          </>
        )}
        {!isEdit && (
          <ParcelasJaPagasField
            value={parcelasJaPagas}
            onChange={setParcelasJaPagas}
            totalParcelas={tpPreview || 0}
          />
        )}
        {isEdit && (
          <p className="app-muted-box px-3 py-2 text-sm">
            Quantidade de parcelas ({emprestimo?.total_parcelas}) não pode ser alterada.
            Exclua e recadastre se necessário.
          </p>
        )}
        <div className="grid gap-4 md:grid-cols-2">
          <Select
            label="Conta para pagamento"
            value={contaId}
            onChange={(e) => setContaId(e.target.value)}
            options={contas.map((c) => ({ value: String(c.id), label: c.nome }))}
          />
          <Select
            label="Categoria (orçamento) *"
            value={categoriaId}
            onChange={(e) => setCategoriaId(e.target.value)}
            options={categorias.map((c) => ({ value: String(c.id), label: c.nome }))}
          />
        </div>
        {contexto === "consolidado" && !isEdit && (
          <ContextoFormSelect value={formContexto} onChange={setFormContexto} />
        )}
        <Textarea label="Observações" value={observacoes} onChange={(e) => setObservacoes(e.target.value)} />
        <p className="text-xs text-slate-500">
          A parcela entra no orçamento da categoria escolhida (gasto realizado + comprometido).
          Defina o limite dessa categoria em Orçamentos — não criamos um item por contrato.
        </p>
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

function PagamentoModal({
  open,
  onClose,
  emprestimo,
  modoHistorico = false,
  onSaved,
}: {
  open: boolean;
  onClose: () => void;
  emprestimo: EmprestimoResumo | null;
  modoHistorico?: boolean;
  onSaved: () => void;
}) {
  const [parcelas, setParcelas] = useState<EmprestimoParcela[]>([]);
  const [selecionadas, setSelecionadas] = useState<Map<number, PagamentoSelecionado>>(new Map());
  const [dataPagamento, setDataPagamento] = useState(new Date().toISOString().slice(0, 10));
  const [criarTransacoes, setCriarTransacoes] = useState(true);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [selecaoRapida, setSelecaoRapida] = useState<SelecaoRapida>("mes");

  useEffect(() => {
    async function load() {
      if (!emprestimo || !open) return;
      setLoading(true);
      setCriarTransacoes(true);
      try {
        await sincronizarStatusParcelas(emprestimo.id);
        const ps = await listParcelas(emprestimo.id);
        setParcelas(ps);
        if (modoHistorico) {
          setSelecionadas(new Map());
          setSelecaoRapida("manual");
          setCriarTransacoes(false);
        } else {
          aplicarSelecaoRapida(ps, "mes");
        }
      } catch (err) {
        setFormError(getErrorMessage(err));
      } finally {
        setLoading(false);
      }
    }
    void load();
  }, [emprestimo, open, modoHistorico]);

  function aplicarSelecaoRapida(ps: EmprestimoParcela[], modo: SelecaoRapida) {
    if (modo === "manual") return;
    const filtradas = filtrarParcelasPorSelecao(ps, modo, mesAtual());
    const hoje = new Date().toISOString().slice(0, 10);
    const map = new Map<number, PagamentoSelecionado>();
    for (const p of filtradas) {
      map.set(p.id, { valor: p.valor_previsto, data: hoje });
    }
    setSelecionadas(map);
    setSelecaoRapida(modo);
  }

  function toggleParcela(p: EmprestimoParcela, checked: boolean) {
    setSelecaoRapida("manual");
    setSelecionadas((prev) => {
      const next = new Map(prev);
      if (checked) next.set(p.id, prev.get(p.id) ?? { valor: p.valor_previsto, data: dataPagamento });
      else next.delete(p.id);
      return next;
    });
  }

  function setValorParcela(id: number, valor: number) {
    setSelecionadas((prev) => {
      const next = new Map(prev);
      const cur = prev.get(id);
      if (cur) next.set(id, { ...cur, valor });
      return next;
    });
  }

  function setDataParcela(id: number, data: string) {
    setSelecionadas((prev) => {
      const next = new Map(prev);
      const cur = prev.get(id);
      if (cur) next.set(id, { ...cur, data });
      return next;
    });
  }

  function aplicarDataGlobal(data: string) {
    setDataPagamento(data);
    setSelecionadas((prev) => {
      const next = new Map(prev);
      for (const [id, sel] of prev) {
        next.set(id, { ...sel, data });
      }
      return next;
    });
  }

  const pendentes = useMemo(
    () => parcelas.filter((p) => p.status !== "paga"),
    [parcelas],
  );

  const totalSelecionado = useMemo(
    () => Array.from(selecionadas.values()).reduce((s, v) => s + v.valor, 0),
    [selecionadas],
  );

  const pagas = useMemo(() => parcelas.filter((p) => p.status === "paga"), [parcelas]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!emprestimo) return;
    if (selecionadas.size === 0) {
      setFormError("Selecione ao menos uma parcela.");
      return;
    }

    setSaving(true);
    setFormError(null);
    try {
      await pagarParcelas(emprestimo.id, {
        criar_transacao: criarTransacoes,
        pagamentos: Array.from(selecionadas.entries()).map(([parcela_id, sel]) => ({
          parcela_id,
          valor_pago: sel.valor,
          data_pagamento: sel.data,
        })),
      });
      await onSaved();
    } catch (err) {
      setFormError(getErrorMessage(err));
    } finally {
      setSaving(false);
    }
  }

  if (!emprestimo) return null;

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={
        modoHistorico
          ? `Registrar pagamentos anteriores · ${emprestimo.descricao}`
          : `Pagar parcelas · ${emprestimo.descricao}`
      }
      wide
    >
      {loading ? (
        <LoadingSpinner label="Carregando parcelas..." />
      ) : (
        <form onSubmit={(e) => void handleSubmit(e)} className="space-y-4">
          {formError && <ErrorAlert message={formError} />}

          {modoHistorico && (
            <p className="rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-800">
              Informe data e valor reais do extrato nas parcelas ainda pendentes. O cadastro só
              registra a quantidade já paga, sem lançar despesa.
            </p>
          )}

          {!modoHistorico && (
          <div className="flex flex-wrap gap-2">
            {(
              [
                ["mes", "Parcela do mês"],
                ["ultima", "Última parcela"],
                ["mes_e_ultima", "Mês + última"],
                ["todas", "Todas pendentes"],
              ] as const
            ).map(([key, label]) => (
              <Button
                key={key}
                type="button"
                variant={selecaoRapida === key ? "primary" : "secondary"}
                className="py-1.5 text-xs"
                onClick={() => aplicarSelecaoRapida(parcelas, key)}
              >
                {label}
              </Button>
            ))}
          </div>
          )}

          <Input
            label="Data padrão (aplica às selecionadas)"
            type="date"
            value={dataPagamento}
            onChange={(e) => aplicarDataGlobal(e.target.value)}
          />

          {pagas.length > 0 && (
            <div className="app-muted-box px-3 py-2 text-xs">
              <strong>{pagas.length} parcela(s) já paga(s)</strong>
              {" · "}
              Total pago: {formatCurrency(pagas.reduce((s, p) => s + (p.valor_pago ?? 0), 0))}
            </div>
          )}

          <div className="max-h-64 overflow-y-auto rounded-lg border border-slate-200">
            <table className="w-full text-sm">
              <thead className="sticky top-0 app-table-head">
                <tr>
                  <th className="px-3 py-2 font-medium" />
                  <th className="px-3 py-2 font-medium">#</th>
                  <th className="px-3 py-2 font-medium">Vencimento</th>
                  <th className="px-3 py-2 font-medium">Previsto</th>
                  <th className="px-3 py-2 font-medium">Data pago</th>
                  <th className="px-3 py-2 font-medium">Valor pago</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {pendentes.map((p) => {
                  const checked = selecionadas.has(p.id);
                  const sel = selecionadas.get(p.id);
                  return (
                    <tr key={p.id} className={checked ? "bg-teal-50" : ""}>
                      <td className="px-3 py-2">
                        <input
                          type="checkbox"
                          checked={checked}
                          onChange={(e) => toggleParcela(p, e.target.checked)}
                        />
                      </td>
                      <td className="px-3 py-2">{p.numero_parcela}</td>
                      <td className="px-3 py-2">
                        {formatDate(p.vencimento)}
                        {p.status === "atrasada" && (
                          <span className="ml-1 text-xs text-rose-600">atrasada</span>
                        )}
                      </td>
                      <td className="px-3 py-2">{formatCurrency(p.valor_previsto)}</td>
                      <td className="px-3 py-2">
                        <input
                          type="date"
                          disabled={!checked}
                          value={checked ? (sel?.data ?? dataPagamento) : ""}
                          onChange={(e) => setDataParcela(p.id, e.target.value)}
                          className="rounded border border-slate-200 bg-slate-50 px-2 py-1 text-sm text-slate-700 disabled:opacity-50"
                        />
                      </td>
                      <td className="px-3 py-2">
                        <ValorInput
                          compact
                          min="0"
                          disabled={!checked}
                          value={checked ? (sel?.valor ?? p.valor_previsto) : ""}
                          onChange={(e) => setValorParcela(p.id, parseFloat(e.target.value) || 0)}
                          className="w-24 !rounded-lg !px-2 !py-1 text-sm"
                        />
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {selecionadas.size > 0 && (
            <p className="text-sm font-medium text-slate-600">
              Total selecionado: {formatCurrency(totalSelecionado)}
              {Array.from(selecionadas.entries()).some(([id, sel]) => {
                const p = parcelas.find((x) => x.id === id);
                return p && sel.valor < p.valor_previsto;
              }) && (
                <span className="ml-2 text-green-600">(valor menor que previsto — antecipação)</span>
              )}
            </p>
          )}

          <label className="flex cursor-pointer items-start gap-2">
            <input
              type="checkbox"
              className="mt-0.5"
              checked={criarTransacoes}
              onChange={(e) => setCriarTransacoes(e.target.checked)}
            />
            <span className="text-xs text-slate-400">
              Criar transações de despesa (desmarque se já lançou manualmente em Transações)
            </span>
          </label>

          <p className="text-xs text-slate-500">
            Informe a data real do débito e o valor exato do extrato. Pode pagar antes do vencimento
            com valor diferente do previsto.
          </p>

          <div className="flex justify-end gap-2">
            <Button type="button" variant="secondary" onClick={onClose}>
              Cancelar
            </Button>
            <Button type="submit" disabled={saving || selecionadas.size === 0}>
              {saving ? "Processando..." : `Confirmar pagamento (${selecionadas.size})`}
            </Button>
          </div>
        </form>
      )}
    </Modal>
  );
}
