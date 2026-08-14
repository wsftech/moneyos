import { useEffect, useMemo, useState } from "react";
import { ParcelasJaPagasField } from "./ParcelasJaPagasField";
import {
  defaultFormContexto,
  resolveContexto,
} from "./ContextoFormSelect";
import { Button } from "./ui/Button";
import { ErrorAlert } from "./ui/Feedback";
import { Input, Select, ValorInput } from "./ui/FormFields";
import { Modal } from "./ui/Modal";
import { useContexto } from "../contexts/ContextoContext";
import {
  filtrarCategoriasParaLancamento,
  findCategoriaCartoesCreditoNaLista,
  listCategorias,
} from "../db/categorias";
import { listContas } from "../db/contas";
import {
  getProgressoOrcamentoCategoria,
  garantirOrcamentoCategoriaMes,
  type ProgressoOrcamentoCategoria,
} from "../db/orcamentos";
import { createCompraParceladaCartao, createTransacao, updateTransacao } from "../db/transacoes";
import { getErrorMessage } from "../db/utils";
import type { Conta, Transacao } from "../types";
import { formatCurrency, labelMes } from "../utils/format";
import { addMonths, todayIsoDate } from "../utils/dates";
import { mesFechamentoParaData } from "../utils/faturaCartao";
import { validarParcelasJaPagas } from "../utils/parcelasHistoricas";

export function CompraCartaoModal({
  open,
  onClose,
  cartao,
  cartoes,
  transacao,
  onSaved,
}: {
  open: boolean;
  onClose: () => void;
  cartao?: Conta | null;
  cartoes?: Conta[];
  transacao?: Transacao | null;
  onSaved: () => void;
}) {
  const { contexto } = useContexto();
  const [listaCartoes, setListaCartoes] = useState<Conta[]>([]);
  const [categorias, setCategorias] = useState<Awaited<ReturnType<typeof listCategorias>>>([]);
  const [cartaoId, setCartaoId] = useState("");
  const [descricao, setDescricao] = useState("");
  const [valor, setValor] = useState("");
  const [data, setData] = useState("");
  const [categoriaId, setCategoriaId] = useState("");
  const [parcelas, setParcelas] = useState("1");
  const [parcelasJaPagas, setParcelasJaPagas] = useState(0);
  const [preview, setPreview] = useState<ProgressoOrcamentoCategoria | null>(null);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  const cartaoFixo = cartao ?? null;
  const isEdit = !!transacao;

  useEffect(() => {
    if (!open) return;
    void (async () => {
      const [cats, contas] = await Promise.all([
        listCategorias(contexto),
        cartoes ? Promise.resolve(cartoes) : listContas(contexto),
      ]);
      setCategorias(cats);
      const soCartoes = contas.filter(
        (c) => c.tipo === "cartao_credito" && c.ativo && c.dia_fechamento && c.dia_vencimento,
      );
      setListaCartoes(soCartoes);
      if (transacao) {
        setCartaoId(String(transacao.conta_id));
        setDescricao(transacao.descricao);
        setValor(String(transacao.valor));
        setData(transacao.data);
        setCategoriaId(transacao.categoria_id ? String(transacao.categoria_id) : "");
        setParcelas(transacao.parcela_total ? String(transacao.parcela_total) : "1");
      } else {
        setCartaoId(cartaoFixo ? String(cartaoFixo.id) : soCartoes[0] ? String(soCartoes[0].id) : "");
        setDescricao("");
        setValor("");
        setData(todayIsoDate());
        const ctxCartao = (cartaoFixo ?? soCartoes[0])?.contexto;
        const padrao = findCategoriaCartoesCreditoNaLista(cats, ctxCartao);
        setCategoriaId(padrao ? String(padrao.id) : "");
        setParcelas("1");
        setParcelasJaPagas(0);
      }
      setFormError(null);
      setPreview(null);
    })();
  }, [open, contexto, cartaoFixo, cartoes, transacao]);

  const cartaoSel =
    cartaoFixo ?? listaCartoes.find((c) => String(c.id) === cartaoId) ?? null;
  const ctxLancamento = cartaoSel?.contexto ?? resolveContexto(contexto, defaultFormContexto(contexto));
  const categoriasFiltradas = useMemo(
    () => filtrarCategoriasParaLancamento(categorias, ctxLancamento, "despesa"),
    [categorias, ctxLancamento],
  );

  const nParcelas = Math.max(1, Math.floor(Number(parcelas) || 1));
  const jaPagas = Math.min(Math.max(0, parcelasJaPagas), Math.max(0, nParcelas - 1));
  const restantes = nParcelas >= 2 ? nParcelas - jaPagas : nParcelas;
  const valorNum = parseFloat(valor);
  const mesOrcamento = data ? data.slice(0, 7) : "";

  useEffect(() => {
    if (!open || !categoriaId || !mesOrcamento || !cartaoSel) {
      setPreview(null);
      return;
    }
    let cancelled = false;
    const valorRestante =
      nParcelas >= 2 && !isNaN(valorNum) && valorNum > 0
        ? (valorNum * restantes) / nParcelas
        : !isNaN(valorNum)
          ? valorNum
          : 0;
    void getProgressoOrcamentoCategoria(
      Number(categoriaId),
      cartaoSel.contexto,
      mesOrcamento,
      { valorExtra: valorRestante },
    )
      .then((p) => {
        if (!cancelled) setPreview(p);
      })
      .catch(() => {
        if (!cancelled) setPreview(null);
      });
    return () => {
      cancelled = true;
    };
  }, [open, categoriaId, mesOrcamento, cartaoSel, valorNum, nParcelas, restantes]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setFormError(null);
    if (!cartaoSel) {
      setFormError("Selecione o cartão.");
      return;
    }
    if (!cartaoSel.dia_fechamento || !cartaoSel.dia_vencimento) {
      setFormError("Cadastre o fechamento e o vencimento do cartão antes de lançar compras.");
      return;
    }
    if (!descricao.trim() || !data) {
      setFormError("Preencha descrição e data da compra.");
      return;
    }
    if (isNaN(valorNum) || valorNum <= 0) {
      setFormError("Informe o valor da compra.");
      return;
    }
    if (!categoriaId) {
      setFormError("A categoria é obrigatória para a compra entrar no orçamento.");
      return;
    }
    if (!isEdit && (nParcelas < 1 || nParcelas > 48)) {
      setFormError("Informe entre 1 e 48 parcelas.");
      return;
    }
    if (!isEdit && nParcelas >= 2) {
      const errHist = validarParcelasJaPagas(jaPagas, nParcelas);
      if (errHist) {
        setFormError(errHist);
        return;
      }
      if (jaPagas >= nParcelas) {
        setFormError("Deixe ao menos 1 parcela em aberto.");
        return;
      }
    }

    const catId = Number(categoriaId);
    setSaving(true);
    try {
      if (transacao) {
        await updateTransacao(transacao.id, {
          descricao: descricao.trim(),
          valor: valorNum,
          data,
          tipo: "despesa",
          conta_id: cartaoSel.id,
          categoria_id: catId,
          contexto: cartaoSel.contexto,
        });
        const { getCategoria } = await import("../db/categorias");
        const cat = await getCategoria(catId);
        if (cat) {
          await garantirOrcamentoCategoriaMes(cat, data.slice(0, 7));
        }
        onSaved();
        return;
      }

      const base = {
        descricao: descricao.trim(),
        valor: valorNum,
        data,
        conta_id: cartaoSel.id,
        categoria_id: catId,
        contexto: cartaoSel.contexto,
      };
      const criadas =
        nParcelas >= 2
          ? await createCompraParceladaCartao({
              ...base,
              parcelas: nParcelas,
              parcelas_ja_pagas: jaPagas,
            })
          : [await createTransacao({ ...base, tipo: "despesa" })];

      const { getCategoria } = await import("../db/categorias");
      const cat = await getCategoria(catId);
      if (cat) {
        const meses = new Set(criadas.map((t) => t.data.slice(0, 7)));
        for (const mes of meses) {
          await garantirOrcamentoCategoriaMes(cat, mes);
        }
      }
      onSaved();
    } catch (err) {
      setFormError(getErrorMessage(err));
    } finally {
      setSaving(false);
    }
  }

  const valorParcela =
    nParcelas >= 2 && !isNaN(valorNum) && valorNum > 0 ? valorNum / nParcelas : null;
  const primeiraRestante =
    data && nParcelas >= 2 ? addMonths(data, jaPagas) : null;
  const mesFaturaPrevisto =
    primeiraRestante && cartaoSel?.dia_fechamento
      ? mesFechamentoParaData(primeiraRestante, cartaoSel.dia_fechamento)
      : null;

  return (
    <Modal open={open} onClose={onClose} title={isEdit ? "Editar compra no cartão" : "Nova compra no cartão"}>
      <form onSubmit={(e) => void handleSubmit(e)} className="space-y-4">
        {formError && <ErrorAlert message={formError} />}
        {!cartaoFixo && !isEdit && (
          <Select
            label="Cartão"
            value={cartaoId}
            onChange={(e) => setCartaoId(e.target.value)}
            options={listaCartoes.map((c) => ({
              value: String(c.id),
              label: c.final_cartao ? `${c.nome} •••• ${c.final_cartao}` : c.nome,
            }))}
            required
          />
        )}
        <Input
          label="O quê"
          value={descricao}
          onChange={(e) => setDescricao(e.target.value)}
          placeholder="Ex.: mercado, farmácia, Netflix"
          required
        />
        <div className="grid gap-4 md:grid-cols-2">
          <ValorInput
            label={isEdit ? "Valor" : "Valor total"}
            min="0"
            value={valor}
            onChange={(e) => setValor(e.target.value)}
            required
          />
          <Input
            label="Data da compra"
            type="date"
            value={data}
            onChange={(e) => setData(e.target.value)}
            required
          />
        </div>
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
        <p className="-mt-2 text-xs text-slate-500">
          Usa as categorias da aba Categorias. O valor consome o orçamento no mês da compra
          {mesOrcamento ? ` (${mesOrcamento})` : ""}.
        </p>
        {!isEdit && (
          <Input
            label="Parcelas"
            type="number"
            min="1"
            max="48"
            value={parcelas}
            onChange={(e) => {
              setParcelas(e.target.value);
              const n = Math.max(1, Math.floor(Number(e.target.value) || 1));
              setParcelasJaPagas((q) => Math.min(q, Math.max(0, n - 1)));
            }}
          />
        )}
        {!isEdit && nParcelas >= 2 && (
          <ParcelasJaPagasField
            value={jaPagas}
            onChange={(q) => setParcelasJaPagas(Math.min(q, nParcelas - 1))}
            totalParcelas={nParcelas}
            hint="Quantas já caíram na fatura. Só as restantes serão lançadas (ex.: 10× com 4 pagas → cria da 5/10 em diante)."
          />
        )}
        {isEdit && transacao?.parcela_total != null && transacao.parcela_total > 1 && (
          <p className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-500">
            Parcela {transacao.parcela_numero}/{transacao.parcela_total}. Valor e data valem só
            para esta parcela; a categoria se aplica a todas.
          </p>
        )}
        {!isEdit && nParcelas >= 2 && valorParcela != null && (
          <p className="text-xs text-slate-500">
            {jaPagas > 0
              ? `${restantes} em aberto de cerca de ${formatCurrency(valorParcela)} (parcela ${jaPagas + 1}/${nParcelas} em diante)`
              : `${nParcelas}× de cerca de ${formatCurrency(valorParcela)}`}
            {primeiraRestante ? ` · próxima parcela em ${primeiraRestante}` : ""}
            {mesFaturaPrevisto ? ` · fatura de ${labelMes(mesFaturaPrevisto)}` : ""}. Use a data
            original da compra (1ª parcela).
          </p>
        )}
        {preview && preview.valor_limite != null && (
          <p
            className={`rounded-lg px-3 py-2 text-xs ${
              (preview.disponivel ?? 0) < 0
                ? "bg-rose-50 text-rose-800"
                : "bg-slate-50 text-slate-600"
            }`}
          >
            {(preview.disponivel ?? 0) >= 0
              ? `Neste orçamento ainda cabem ${formatCurrency(preview.disponivel ?? 0)} após esta compra.`
              : `Esta compra deixa o orçamento ${formatCurrency(Math.abs(preview.disponivel ?? 0))} acima do limite.`}
          </p>
        )}
        <div className="flex justify-end gap-2">
          <Button type="button" variant="secondary" onClick={onClose}>
            Cancelar
          </Button>
          <Button type="submit" disabled={saving}>
            {saving ? "Salvando..." : isEdit ? "Salvar" : "Lançar compra"}
          </Button>
        </div>
      </form>
    </Modal>
  );
}
