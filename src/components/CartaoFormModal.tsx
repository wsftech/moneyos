import { useEffect, useState } from "react";
import { ContaIcone, IconeContaPicker } from "./ContaIcone";
import {
  ContextoFormSelect,
  defaultFormContexto,
  resolveContexto,
} from "./ContextoFormSelect";
import { Button } from "./ui/Button";
import { ErrorAlert } from "./ui/Feedback";
import { Input, ValorInput } from "./ui/FormFields";
import { Modal } from "./ui/Modal";
import { useContexto } from "../contexts/ContextoContext";
import {
  createConta,
  updateConta,
  type ContaInput,
} from "../db/contas";
import {
  anexarLogoConta,
  invalidarLogoPreview,
  removerLogoConta,
} from "../db/logosConta";
import { getErrorMessage } from "../db/utils";
import type { Conta, Contexto } from "../types";

const CORES = ["#1A1F71", "#EB001B", "#820AD1", "#EC0000", "#EC7000", "#006FCF", "#111111", "#0a2533"];

function normalizarFinal(valor: string): string {
  return valor.replace(/\D/g, "").slice(0, 4);
}

export function CartaoFormModal({
  open,
  onClose,
  cartao,
  onSaved,
}: {
  open: boolean;
  onClose: () => void;
  cartao: Conta | null;
  onSaved: (conta: Conta) => void;
}) {
  const { contexto } = useContexto();
  const [formContexto, setFormContexto] = useState<Contexto>(defaultFormContexto(contexto));
  const [nome, setNome] = useState("");
  const [finalCartao, setFinalCartao] = useState("");
  const [cor, setCor] = useState(CORES[0]);
  const [icone, setIcone] = useState("💳");
  const [logoPath, setLogoPath] = useState<string | null>(null);
  const [pendingLogoSource, setPendingLogoSource] = useState<string | null>(null);
  const [removeLogoOnSave, setRemoveLogoOnSave] = useState(false);
  const [diaFechamento, setDiaFechamento] = useState("");
  const [diaVencimento, setDiaVencimento] = useState("");
  const [limiteCredito, setLimiteCredito] = useState("");
  const [ativo, setAtivo] = useState(true);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    if (cartao) {
      setFormContexto(cartao.contexto);
      setNome(cartao.nome);
      setFinalCartao(cartao.final_cartao ?? "");
      setCor(cartao.cor);
      setIcone(cartao.icone ?? "💳");
      setLogoPath(cartao.logo_path);
      setPendingLogoSource(null);
      setRemoveLogoOnSave(false);
      setDiaFechamento(cartao.dia_fechamento ? String(cartao.dia_fechamento) : "");
      setDiaVencimento(cartao.dia_vencimento ? String(cartao.dia_vencimento) : "");
      setLimiteCredito(cartao.limite_credito ? String(cartao.limite_credito) : "");
      setAtivo(cartao.ativo);
    } else {
      setFormContexto(defaultFormContexto(contexto));
      setNome("");
      setFinalCartao("");
      setCor(CORES[0]);
      setIcone("💳");
      setLogoPath(null);
      setPendingLogoSource(null);
      setRemoveLogoOnSave(false);
      setDiaFechamento("");
      setDiaVencimento("");
      setLimiteCredito("");
      setAtivo(true);
    }
    setFormError(null);
  }, [cartao, open, contexto]);

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

  function handleBandeira(preset: { nome: string; cor: string; sigla: string }) {
    setCor(preset.cor);
  }

  function handleBancoEmissor(preset: { nome: string; cor: string; sigla: string }) {
    setNome(preset.nome);
    setCor(preset.cor);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setFormError(null);
    if (!nome.trim()) {
      setFormError("Informe o nome do cartão (ex.: Nubank, Itaú).");
      return;
    }
    const fechamento = Number(diaFechamento);
    const vencimento = Number(diaVencimento);
    if (!diaFechamento || fechamento < 1 || fechamento > 31) {
      setFormError("Informe o dia de fechamento da fatura (1–31).");
      return;
    }
    if (!diaVencimento || vencimento < 1 || vencimento > 31) {
      setFormError("Informe o dia de vencimento da fatura (1–31).");
      return;
    }
    const limite = parseFloat(limiteCredito);
    if (limiteCredito.trim() === "" || isNaN(limite) || limite < 0) {
      setFormError("Informe o limite do cartão (use 0 se não há limite definido).");
      return;
    }
    const finais = normalizarFinal(finalCartao);
    if (finais && finais.length !== 4) {
      setFormError("Use 4 dígitos para identificar o cartão (ex.: 1234).");
      return;
    }

    const input: ContaInput = {
      nome: nome.trim(),
      tipo: "cartao_credito",
      contexto: resolveContexto(contexto, formContexto),
      saldo_inicial: 0,
      cor,
      icone: icone.trim() || "💳",
      ativo,
      dia_fechamento: fechamento,
      dia_vencimento: vencimento,
      limite_credito: limite,
      final_cartao: finais || null,
    };

    setSaving(true);
    try {
      let saved: Awaited<ReturnType<typeof createConta>>;
      if (cartao) {
        saved = await updateConta(cartao.id, input);
        if (pendingLogoSource) {
          const dest = await anexarLogoConta(cartao.id, pendingLogoSource, cartao.logo_path);
          invalidarLogoPreview(cartao.logo_path);
          invalidarLogoPreview(dest);
        } else if (removeLogoOnSave && cartao.logo_path) {
          await removerLogoConta(cartao.id, cartao.logo_path);
          invalidarLogoPreview(cartao.logo_path);
        }
      } else {
        saved = await createConta(input);
        if (pendingLogoSource) {
          const dest = await anexarLogoConta(saved.id, pendingLogoSource, null);
          invalidarLogoPreview(dest);
        }
      }
      onSaved(saved);
    } catch (err) {
      setFormError(getErrorMessage(err));
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal open={open} onClose={onClose} title={cartao ? "Editar cartão" : "Novo cartão"} wide>
      <form onSubmit={(e) => void handleSubmit(e)} className="space-y-4">
        {formError && <ErrorAlert message={formError} />}
        <Input
          label="Nome do cartão"
          value={nome}
          onChange={(e) => setNome(e.target.value)}
          placeholder="Ex.: Nubank, Itaú Click"
          required
        />
        <Input
          label="Final do cartão"
          value={finalCartao}
          onChange={(e) => setFinalCartao(normalizarFinal(e.target.value))}
          placeholder="1234"
          inputMode="numeric"
          maxLength={4}
        />
        <p className="-mt-2 text-xs text-slate-500">
          Só os 4 últimos dígitos, para distinguir cartões do mesmo banco. Não cadastre o número
          completo.
        </p>
        <IconeContaPicker
          value={icone}
          onChange={setIcone}
          tipo="cartao_credito"
          logoPath={removeLogoOnSave ? null : logoPath}
          pendingLogoSource={pendingLogoSource}
          onLogoPathChange={handleLogoPathChange}
          onPendingLogoSourceChange={setPendingLogoSource}
          onBandeiraPreset={handleBandeira}
          onBancoPreset={handleBancoEmissor}
          nomeAtual={nome}
          previewCor={cor}
        />
        {contexto === "consolidado" && (
          <ContextoFormSelect value={formContexto} onChange={setFormContexto} />
        )}
        <div className="grid gap-4 md:grid-cols-2">
          <Input
            label="Dia de fechamento"
            type="number"
            min="1"
            max="31"
            value={diaFechamento}
            onChange={(e) => setDiaFechamento(e.target.value)}
            placeholder="Ex.: 5"
            required
          />
          <Input
            label="Dia de vencimento"
            type="number"
            min="1"
            max="31"
            value={diaVencimento}
            onChange={(e) => setDiaVencimento(e.target.value)}
            placeholder="Ex.: 12"
            required
          />
        </div>
        <p className="-mt-2 text-xs text-slate-500">
          Compra no dia do fechamento entra automaticamente na próxima fatura.
        </p>
        <ValorInput
          label="Limite do cartão"
          min="0"
          value={limiteCredito}
          onChange={(e) => setLimiteCredito(e.target.value)}
          placeholder="Ex.: 5000"
          required
        />
        <div>
          <p className="mb-2 text-sm font-medium text-slate-600">Cor</p>
          <div className="flex flex-wrap items-center gap-2">
            <ContaIcone icone={icone} tipo="cartao_credito" cor={cor} size="sm" />
            {CORES.map((c) => (
              <button
                key={c}
                type="button"
                onClick={() => setCor(c)}
                className={`h-8 w-8 rounded-full border-2 ring-offset-2 ${cor === c ? "border-slate-900 ring-2 ring-slate-900/30" : "border-transparent"}`}
                style={{ backgroundColor: c }}
              />
            ))}
          </div>
        </div>
        <label className="flex items-center gap-2 text-sm text-slate-700">
          <input type="checkbox" checked={ativo} onChange={(e) => setAtivo(e.target.checked)} />
          Cartão ativo
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
