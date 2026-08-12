import { useEffect, useMemo } from "react";
import { addMonths } from "../utils/dates";
import { formatCurrency, formatDate } from "../utils/format";
import {
  gerarPagamentosHistoricosPadrao,
  totalPagamentosHistoricos,
  type PagamentoHistoricoRow,
} from "../utils/parcelasHistoricas";

interface ParcelasHistoricasSectionProps {
  enabled: boolean;
  onEnabledChange: (enabled: boolean) => void;
  quantidade: number;
  onQuantidadeChange: (qtd: number) => void;
  totalParcelas: number;
  valorReferencia: number;
  dataPrimeiraParcela: string;
  rows: PagamentoHistoricoRow[];
  onRowsChange: (rows: PagamentoHistoricoRow[]) => void;
  criarTransacoes: boolean;
  onCriarTransacoesChange: (value: boolean) => void;
}

export function ParcelasHistoricasSection({
  enabled,
  onEnabledChange,
  quantidade,
  onQuantidadeChange,
  totalParcelas,
  valorReferencia,
  dataPrimeiraParcela,
  rows,
  onRowsChange,
  criarTransacoes,
  onCriarTransacoesChange,
}: ParcelasHistoricasSectionProps) {
  const maxQtd = totalParcelas > 0 ? totalParcelas : 0;
  const vpValido = valorReferencia > 0;
  const dataValida = !!dataPrimeiraParcela;

  useEffect(() => {
    if (!enabled) return;
    if (quantidade <= 0 || !vpValido || !dataValida) {
      onRowsChange([]);
      return;
    }
    const qtd = Math.min(quantidade, maxQtd);
    onRowsChange(gerarPagamentosHistoricosPadrao(qtd, valorReferencia, dataPrimeiraParcela));
    // eslint-disable-next-line react-hooks/exhaustive-deps -- regenera só quando estrutura muda
  }, [enabled, quantidade, valorReferencia, dataPrimeiraParcela, maxQtd, vpValido, dataValida]);

  const total = useMemo(() => totalPagamentosHistoricos(rows), [rows]);

  function updateRow(index: number, patch: Partial<PagamentoHistoricoRow>) {
    onRowsChange(rows.map((r, i) => (i === index ? { ...r, ...patch } : r)));
  }

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
            Já paguei parcelas antes de cadastrar
          </span>
          <p className="mt-0.5 text-xs text-slate-500">
            Informe data e valor reais de cada pagamento (como no extrato). Ajuste os valores se
            pagou antecipado ou parcialmente.
          </p>
        </div>
      </label>

      {enabled && (
        <div className="mt-4 space-y-3">
          <div className="flex flex-wrap items-end gap-4">
            <div>
              <label className="mb-1 block text-xs font-medium text-slate-400">
                Quantas parcelas já pagas?
              </label>
              <input
                type="number"
                min={1}
                max={maxQtd || 1}
                value={quantidade || ""}
                onChange={(e) => onQuantidadeChange(Math.max(0, parseInt(e.target.value, 10) || 0))}
                className="w-24 rounded-lg border border-slate-200 px-3 py-2 text-sm"
                disabled={maxQtd === 0}
              />
            </div>
            {rows.length > 0 && (
              <p className="text-sm text-slate-400">
                Total informado: <strong>{formatCurrency(total)}</strong>
              </p>
            )}
          </div>

          {!vpValido || !dataValida ? (
            <p className="text-xs text-amber-700">
              Preencha a parcela de referência e a data da 1ª parcela para gerar a tabela.
            </p>
          ) : rows.length > 0 ? (
            <div className="max-h-48 overflow-y-auto app-card rounded-lg">
              <table className="w-full text-sm">
                <thead className="sticky top-0 app-table-head text-xs">
                  <tr>
                    <th className="px-3 py-2 font-medium">#</th>
                    <th className="px-3 py-2 font-medium">Vencimento</th>
                    <th className="px-3 py-2 font-medium">Data pago</th>
                    <th className="px-3 py-2 font-medium">Valor pago</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {rows.map((row, i) => (
                    <tr key={row.numero_parcela}>
                      <td className="px-3 py-2">{row.numero_parcela}</td>
                      <td className="px-3 py-2 text-slate-500">
                        {formatDate(addMonths(dataPrimeiraParcela, row.numero_parcela - 1))}
                      </td>
                      <td className="px-3 py-2">
                        <input
                          type="date"
                          value={row.data}
                          onChange={(e) => updateRow(i, { data: e.target.value })}
                          className="rounded border border-slate-200 px-2 py-1 text-sm"
                        />
                      </td>
                      <td className="px-3 py-2">
                        <input
                          type="number"
                          step="0.01"
                          min="0"
                          value={row.valor}
                          onChange={(e) =>
                            updateRow(i, { valor: parseFloat(e.target.value) || 0 })
                          }
                          className="w-28 rounded border border-slate-200 px-2 py-1 text-sm"
                        />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : null}

          <label className="flex cursor-pointer items-start gap-2">
            <input
              type="checkbox"
              className="mt-0.5"
              checked={criarTransacoes}
              onChange={(e) => onCriarTransacoesChange(e.target.checked)}
            />
            <span className="text-xs text-slate-400">
              Criar transações de despesa para cada pagamento (desmarque se já lançou manualmente
              em Transações)
            </span>
          </label>
        </div>
      )}
    </div>
  );
}
