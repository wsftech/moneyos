import { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { AtivosManuaisSection } from "../components/AtivosManuaisSection";
import { ContextoBadge } from "../components/ContextoSelector";
import { ContaIcone, IconeContaPicker } from "../components/ContaIcone";
import { useConfirm } from "../components/ConfirmDialog";
import {
  ContextoFormSelect,
  defaultFormContexto,
  resolveContexto,
} from "../components/ContextoFormSelect";
import { Button } from "../components/ui/Button";
import { EmptyState, ErrorAlert, LoadingSpinner, PageHeader } from "../components/ui/Feedback";
import { Input, Select } from "../components/ui/FormFields";
import { Modal } from "../components/ui/Modal";
import { useContexto } from "../contexts/ContextoContext";
import {
  createConta,
  deleteConta,
  listContasComSaldo,
  updateConta,
  type ContaComSaldo,
  type ContaInput,
} from "../db/contas";
import {
  anexarLogoConta,
  invalidarLogoPreview,
  removerLogoConta,
} from "../db/logosConta";
import { getResumoCartaoCredito } from "../db/faturasCartao";
import { getErrorMessage } from "../db/utils";
import type { Contexto, ResumoCartaoCredito, TipoConta } from "../types";
import { ICONE_PADRAO_POR_TIPO, type BancoPreset } from "../utils/contaIcone";
import { formatCurrency, formatDate, labelTipoConta, arredondarMoeda } from "../utils/format";

const TIPO_OPTIONS: { value: TipoConta; label: string }[] = [
  { value: "banco", label: "Banco" },
  { value: "dinheiro", label: "Dinheiro" },
  { value: "cartao_credito", label: "Cartão de crédito" },
  { value: "poupanca", label: "Poupança" },
  { value: "investimento", label: "Investimento" },
];

const CORES = ["#EC0000", "#820AD1", "#EC7000", "#CC092F", "#0070AF", "#22c55e", "#0a2533", "#6366f1"];

export function ContasPage() {
  const { contexto, loading: ctxLoading } = useContexto();
  const confirm = useConfirm();
  const [contas, setContas] = useState<ContaComSaldo[]>([]);
  const [resumosCartao, setResumosCartao] = useState<Map<number, ResumoCartaoCredito>>(new Map());
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<ContaComSaldo | null>(null);

  const carregar = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const lista = await listContasComSaldo(contexto);
      setContas(lista);
      const cartoes = lista.filter(
        (c) => c.tipo === "cartao_credito" && c.dia_fechamento && c.dia_vencimento,
      );
      const resumosMap = new Map<number, ResumoCartaoCredito>();
      await Promise.all(
        cartoes.map(async (c) => {
          const r = await getResumoCartaoCredito(c.id);
          if (r) resumosMap.set(c.id, r);
        }),
      );
      setResumosCartao(resumosMap);
    } catch (err) {
      setError(getErrorMessage(err));
    } finally {
      setLoading(false);
    }
  }, [contexto]);

  useEffect(() => {
    if (!ctxLoading) void carregar();
  }, [carregar, ctxLoading]);

  async function handleDelete(id: number) {
    if (!(await confirm("Excluir esta conta?"))) return;
    try {
      await deleteConta(id);
      await carregar();
    } catch (err) {
      setError(getErrorMessage(err));
    }
  }

  return (
    <div>
      <PageHeader
        title="Contas"
        subtitle="Bancos, carteiras, cartões, poupança e investimentos"
        action={
          <Button
            onClick={() => {
              setEditing(null);
              setModalOpen(true);
            }}
          >
            + Nova conta
          </Button>
        }
      />

      {error && (
        <div className="mb-4">
          <ErrorAlert message={error} />
        </div>
      )}
      {loading || ctxLoading ? (
        <LoadingSpinner />
      ) : contas.length === 0 ? (
        <EmptyState message="Nenhuma conta cadastrada. Comece pelos bancos ou pela carteira onde o dinheiro fica." />
      ) : (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {contas.map((conta) => {
            const resumoCartao = resumosCartao.get(conta.id);
            const isCartao = conta.tipo === "cartao_credito";
            return (
              <div
                key={conta.id}
                className="app-card p-5"
                style={{ borderTopColor: conta.cor, borderTopWidth: 3 }}
              >
                <div className="mb-3 flex items-start justify-between gap-3">
                  <div className="flex items-start gap-3">
                    <ContaIcone
                      icone={conta.icone}
                      logoPath={conta.logo_path}
                      tipo={conta.tipo}
                      cor={conta.cor}
                    />
                    <div>
                      <h3 className="font-semibold text-slate-900">{conta.nome}</h3>
                      <p className="text-xs text-slate-500">{labelTipoConta(conta.tipo)}</p>
                    </div>
                  </div>
                  {contexto === "consolidado" && <ContextoBadge itemContexto={conta.contexto} />}
                </div>
                {isCartao && resumoCartao ? (
                  <>
                    <p className="text-xl font-bold text-rose-600">
                      {formatCurrency(resumoCartao.total_em_aberto)}
                      <span className="ml-2 text-sm font-normal text-slate-500">em aberto</span>
                    </p>
                    {resumoCartao.limite_disponivel != null && (
                      <p className="mt-1 text-sm text-emerald-600">
                        Disponível: {formatCurrency(resumoCartao.limite_disponivel)}
                      </p>
                    )}
                    {resumoCartao.fatura_atual && (
                      <div className="mt-2 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-xs">
                        <p className="font-medium text-slate-600">Fatura atual</p>
                        <p className="text-slate-500">
                          Vence {formatDate(resumoCartao.fatura_atual.vencimento)}
                          {resumoCartao.fatura_atual.status === "aberta" && " · Em aberto"}
                          {resumoCartao.fatura_atual.status === "fechada" && " · Fechada"}
                        </p>
                        <p className="mt-1 font-semibold text-rose-600">
                          {formatCurrency(
                            resumoCartao.fatura_atual.total -
                              (resumoCartao.fatura_atual.valor_pago ?? 0),
                          )}
                        </p>
                      </div>
                    )}
                  </>
                ) : (
                  <p
                    className={`text-xl font-bold ${arredondarMoeda(conta.saldo) >= 0 ? "text-slate-900" : "text-rose-600"}`}
                  >
                    {formatCurrency(conta.saldo)}
                  </p>
                )}
                {!conta.ativo && (
                  <span className="mt-2 inline-block rounded-full bg-slate-100 px-2 py-0.5 text-xs text-slate-500">
                    Inativa
                  </span>
                )}
                <div className="mt-4 flex gap-2">
                  {isCartao && conta.dia_fechamento && (
                    <Link to={`/faturas/${conta.id}`} className="flex-1">
                      <Button variant="secondary" className="w-full py-1.5">
                        Faturas
                      </Button>
                    </Link>
                  )}
                  <Button
                    variant="secondary"
                    className="flex-1 py-1.5"
                    onClick={() => {
                      setEditing(conta);
                      setModalOpen(true);
                    }}
                  >
                    Editar
                  </Button>
                  <Button
                    variant="ghost"
                    className="text-rose-600"
                    onClick={() => void handleDelete(conta.id)}
                  >
                    Excluir
                  </Button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      <AtivosManuaisSection />

      <ContaModal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        conta={editing}
        onSaved={() => {
          setModalOpen(false);
          void carregar();
        }}
      />
    </div>
  );
}

function ContaModal({
  open,
  onClose,
  conta,
  onSaved,
}: {
  open: boolean;
  onClose: () => void;
  conta: ContaComSaldo | null;
  onSaved: () => void;
}) {
  const { contexto } = useContexto();
  const [formContexto, setFormContexto] = useState<Contexto>(defaultFormContexto(contexto));
  const [nome, setNome] = useState("");
  const [tipo, setTipo] = useState<TipoConta>("banco");
  const [saldoInicial, setSaldoInicial] = useState("0");
  const [cor, setCor] = useState(CORES[0]);
  const [icone, setIcone] = useState("");
  const [logoPath, setLogoPath] = useState<string | null>(null);
  const [pendingLogoSource, setPendingLogoSource] = useState<string | null>(null);
  const [removeLogoOnSave, setRemoveLogoOnSave] = useState(false);
  const [ativo, setAtivo] = useState(true);
  const [diaFechamento, setDiaFechamento] = useState("");
  const [diaVencimento, setDiaVencimento] = useState("");
  const [limiteCredito, setLimiteCredito] = useState("");
  const [dataSaldoInicial, setDataSaldoInicial] = useState("");
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  useEffect(() => {
    if (conta) {
      setFormContexto(conta.contexto);
      setNome(conta.nome);
      setTipo(conta.tipo);
      setSaldoInicial(String(conta.saldo_inicial));
      setCor(conta.cor);
      setIcone(conta.icone ?? "");
      setLogoPath(conta.logo_path);
      setPendingLogoSource(null);
      setRemoveLogoOnSave(false);
      setAtivo(conta.ativo);
      setDiaFechamento(conta.dia_fechamento ? String(conta.dia_fechamento) : "");
      setDiaVencimento(conta.dia_vencimento ? String(conta.dia_vencimento) : "");
      setLimiteCredito(conta.limite_credito ? String(conta.limite_credito) : "");
      setDataSaldoInicial(conta.data_saldo_inicial ?? "");
    } else {
      setFormContexto(defaultFormContexto(contexto));
      setNome("");
      setTipo("banco");
      setSaldoInicial("0");
      setCor(CORES[0]);
      setIcone("");
      setLogoPath(null);
      setPendingLogoSource(null);
      setRemoveLogoOnSave(false);
      setAtivo(true);
      setDiaFechamento("");
      setDiaVencimento("");
      setLimiteCredito("");
      setDataSaldoInicial("");
    }
  }, [conta, open, contexto]);

  function handleLogoPathChange(path: string | null) {
    if (path === null) {
      setRemoveLogoOnSave(true);
      setLogoPath(null);
      setPendingLogoSource(null);
    } else {
      setLogoPath(path);
      setRemoveLogoOnSave(false);
    }
  }

  function handleBancoPreset(preset: BancoPreset) {
    setNome((atual) => (atual.trim() ? atual : preset.nome));
    setCor(preset.cor);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setFormError(null);
    if (!nome) {
      setFormError("Informe o nome da conta.");
      return;
    }

    const input: ContaInput = {
      nome,
      tipo,
      contexto: resolveContexto(contexto, formContexto),
      saldo_inicial: parseFloat(saldoInicial) || 0,
      cor,
      icone: icone.trim() || null,
      ativo,
      dia_fechamento:
        tipo === "cartao_credito" && diaFechamento ? Number(diaFechamento) : null,
      dia_vencimento:
        tipo === "cartao_credito" && diaVencimento ? Number(diaVencimento) : null,
      limite_credito:
        tipo === "cartao_credito" && limiteCredito ? parseFloat(limiteCredito) : null,
      data_saldo_inicial: dataSaldoInicial.trim() || null,
    };
    setSaving(true);
    try {
      if (conta) {
        await updateConta(conta.id, input);
        if (pendingLogoSource) {
          const dest = await anexarLogoConta(conta.id, pendingLogoSource, conta.logo_path);
          invalidarLogoPreview(conta.logo_path);
          invalidarLogoPreview(dest);
        } else if (removeLogoOnSave && conta.logo_path) {
          await removerLogoConta(conta.id, conta.logo_path);
          invalidarLogoPreview(conta.logo_path);
        }
      } else {
        const criada = await createConta(input);
        if (pendingLogoSource) {
          const dest = await anexarLogoConta(criada.id, pendingLogoSource, null);
          invalidarLogoPreview(dest);
        }
      }
      onSaved();
    } catch (err) {
      setFormError(getErrorMessage(err));
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal open={open} onClose={onClose} title={conta ? "Editar conta" : "Nova conta"} wide>
      <form onSubmit={(e) => void handleSubmit(e)} className="space-y-4">
        {formError && <ErrorAlert message={formError} />}
        <Input label="Nome" value={nome} onChange={(e) => setNome(e.target.value)} required />
        <Select
          label="Tipo"
          value={tipo}
          onChange={(e) => {
            const novoTipo = e.target.value as TipoConta;
            setTipo(novoTipo);
            if (!conta && !icone) {
              setIcone(ICONE_PADRAO_POR_TIPO[novoTipo]);
            }
          }}
          options={TIPO_OPTIONS.map((o) => ({ value: o.value, label: o.label }))}
        />
        <IconeContaPicker
          value={icone}
          onChange={setIcone}
          tipo={tipo}
          logoPath={removeLogoOnSave ? null : logoPath}
          pendingLogoSource={pendingLogoSource}
          onLogoPathChange={handleLogoPathChange}
          onPendingLogoSourceChange={setPendingLogoSource}
          onBancoPreset={handleBancoPreset}
          previewCor={cor}
        />
        {contexto === "consolidado" && (
          <ContextoFormSelect value={formContexto} onChange={setFormContexto} />
        )}
        <Input
          label="Saldo inicial"
          type="number"
          step="0.01"
          value={saldoInicial}
          onChange={(e) => setSaldoInicial(e.target.value)}
        />
        <Input
          label="Válido a partir de (opcional)"
          type="date"
          value={dataSaldoInicial}
          onChange={(e) => setDataSaldoInicial(e.target.value)}
        />
        <p className="-mt-2 text-xs text-slate-500">
          Use quando a conta passou a ser controlada a partir de uma data específica. Lançamentos
          anteriores não afetam o saldo.
        </p>
        {tipo === "cartao_credito" && (
          <>
            <div className="grid gap-4 md:grid-cols-2">
              <Input
                label="Dia de fechamento"
                type="number"
                min="1"
                max="31"
                value={diaFechamento}
                onChange={(e) => setDiaFechamento(e.target.value)}
                placeholder="Ex.: 5"
              />
              <Input
                label="Dia de vencimento"
                type="number"
                min="1"
                max="31"
                value={diaVencimento}
                onChange={(e) => setDiaVencimento(e.target.value)}
                placeholder="Ex.: 12"
              />
            </div>
            <Input
              label="Limite de crédito (opcional)"
              type="number"
              step="0.01"
              min="0"
              value={limiteCredito}
              onChange={(e) => setLimiteCredito(e.target.value)}
              placeholder="Ex.: 5000"
            />
          </>
        )}
        <div>
          <p className="mb-2 text-sm font-medium text-slate-600">Cor</p>
          <div className="flex flex-wrap gap-2">
            {CORES.map((c) => (
              <button
                key={c}
                type="button"
                onClick={() => setCor(c)}
                className={`h-8 w-8 rounded-full border-2 ring-offset-2 ${cor === c ? "border-slate-900 ring-2 ring-slate-900/30" : "border-transparent"}`}
                style={{ backgroundColor: c }}
              />
            ))}
            {!CORES.includes(cor) && (
              <button
                type="button"
                className="h-8 w-8 rounded-full border-2 border-slate-900 ring-2 ring-slate-900/30"
                style={{ backgroundColor: cor }}
                title="Cor do banco"
              />
            )}
          </div>
        </div>
        <label className="flex items-center gap-2 text-sm text-slate-700">
          <input type="checkbox" checked={ativo} onChange={(e) => setAtivo(e.target.checked)} />
          Conta ativa
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
