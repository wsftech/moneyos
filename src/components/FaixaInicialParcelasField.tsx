import { useMemo } from "react";
import { Input, ValorInput } from "./ui/FormFields";
import {
  agruparValoresIguais,
  gerarValoresPrevistos,
  normalizarFaixaInicial,
  validarFaixaInicial,
  type FaixaInicialParcelas,
} from "../utils/financiamentoCalc";
import { formatCurrency } from "../utils/format";

export function FaixaInicialParcelasField({
  enabled,
  onEnabledChange,
  qtd,
  onQtdChange,
  valor,
  onValorChange,
  totalParcelas,
  valorParcela,
  valorTotal,
}: {
  enabled: boolean;
  onEnabledChange: (enabled: boolean) => void;
  qtd: string;
  onQtdChange: (qtd: string) => void;
  valor: string;
  onValorChange: (valor: string) => void;
  totalParcelas: number;
  valorParcela: number;
  valorTotal: number;
}) {
  const preview = useMemo(() => {
    const faixa = normalizarFaixaInicial(parseInt(qtd, 10), parseFloat(valor));
    if (!enabled || !faixa || totalParcelas < 2 || !(valorParcela > 0) || !(valorTotal > 0)) {
      return null;
    }
    if (faixa.qtd >= totalParcelas) return null;
    const valores = gerarValoresPrevistos(valorTotal, valorParcela, totalParcelas, faixa);
    const grupos = agruparValoresIguais(valores);
    const soma = valores.reduce((s, v) => s + v, 0);
    return { grupos, soma };
  }, [enabled, qtd, valor, totalParcelas, valorParcela, valorTotal]);

  return (
    <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
      <label className="flex cursor-pointer items-start gap-3">
        <input
          type="checkbox"
          className="mt-1"
          checked={enabled}
          onChange={(e) => onEnabledChange(e.target.checked)}
        />
        <div>
          <span className="text-sm font-medium text-slate-700">
            Primeiras parcelas com outro valor
          </span>
          <p className="mt-0.5 text-xs text-slate-500">
            Ex.: 3 primeiras de R$ 130,48 e as demais de R$ 464,85.
          </p>
        </div>
      </label>

      {enabled && (
        <div className="mt-4 space-y-3">
          <div className="grid gap-4 md:grid-cols-2">
            <Input
              label="Quantas primeiras"
              type="number"
              min="1"
              max={totalParcelas > 1 ? String(totalParcelas - 1) : undefined}
              value={qtd}
              onChange={(e) => onQtdChange(e.target.value)}
            />
            <ValorInput
              label="Valor dessas primeiras"
              min="0"
              value={valor}
              onChange={(e) => onValorChange(e.target.value)}
            />
          </div>
          {preview && (
            <p className="text-xs text-slate-600">
              {preview.grupos
                .map((g) => `${g.qtd} × ${formatCurrency(g.valor)}`)
                .join(" + ")}{" "}
              = <strong>{formatCurrency(preview.soma)}</strong>
            </p>
          )}
        </div>
      )}
    </div>
  );
}

export function rotuloFaixaContrato(
  totalParcelas: number,
  valorParcela: number,
  faixaQtd: number | null,
  faixaValor: number | null,
): string {
  const faixa = normalizarFaixaInicial(faixaQtd, faixaValor);
  if (!faixa) return `ref. ${formatCurrency(valorParcela)}/mês`;
  const demais = Math.max(0, totalParcelas - faixa.qtd);
  return `${faixa.qtd}× ${formatCurrency(faixa.valor)} + ${demais}× ${formatCurrency(valorParcela)}`;
}

export function resolverFaixaCadastro(
  enabled: boolean,
  qtd: string,
  valor: string,
  totalParcelas: number,
): { faixa?: FaixaInicialParcelas; erro?: string } {
  if (!enabled) return {};
  const faixa = normalizarFaixaInicial(parseInt(qtd, 10), parseFloat(valor));
  if (!faixa) {
    return { erro: "Informe quantidade e valor das primeiras parcelas." };
  }
  const erro = validarFaixaInicial(faixa, totalParcelas);
  if (erro) return { erro };
  return { faixa };
}
