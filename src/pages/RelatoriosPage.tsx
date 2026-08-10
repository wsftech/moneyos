import { useCallback, useEffect, useState } from "react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  ComposedChart,
  Legend,
  Line,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { Button } from "../components/ui/Button";
import { ErrorAlert, LoadingSpinner, PageHeader } from "../components/ui/Feedback";
import { Input } from "../components/ui/FormFields";
import { useContexto } from "../contexts/ContextoContext";
import { ContextoBadge } from "../components/ContextoSelector";
import { findCategoriaById, listCategorias } from "../db/categorias";
import { getDreSimplificada } from "../db/dre";
import { getRelatorioEndividamento } from "../db/endividamento";
import { getFluxoProjetado12Meses } from "../db/fluxoProjetado";
import {
  getComparativoMensal,
  getGastoPorCategoria,
  listTransacoesParaExportacao,
  type GastoPorCategoriaResumo,
} from "../db/transacoes";
import { getErrorMessage } from "../db/utils";
import type { DreSimplificada, FluxoProjetado12Meses, RelatorioEndividamento } from "../types";
import { intervaloDoMes } from "../utils/dates";
import {
  downloadCsv,
  formatCurrency,
  formatDate,
  labelMes,
  mesAtual,
  mesesAnteriores,
} from "../utils/format";
import { chartTooltipStyle, THEME } from "../utils/theme";

function mapGastosRelatorio(
  gastos: GastoPorCategoriaResumo[],
  todasCategorias: Awaited<ReturnType<typeof listCategorias>>,
) {
  return gastos.map((g) => {
    const cat =
      g.categoria_nome != null
        ? null
        : findCategoriaById(todasCategorias, g.categoria_id);
    return {
      nome: g.categoria_nome ?? cat?.nome ?? "Sem categoria",
      total: g.total,
      cor: g.categoria_cor ?? cat?.cor ?? "#94a3b8",
    };
  });
}

export function RelatoriosPage() {
  const { contexto, loading: ctxLoading } = useContexto();
  const [mes, setMes] = useState(mesAtual());
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [gastosCategoria, setGastosCategoria] = useState<
    { nome: string; total: number; cor: string }[]
  >([]);
  const [comparativo, setComparativo] = useState<
    { mes: string; receitas: number; despesas: number; mesLabel: string }[]
  >([]);
  const [dre, setDre] = useState<DreSimplificada | null>(null);
  const [endividamento, setEndividamento] = useState<RelatorioEndividamento | null>(null);
  const [fluxo12, setFluxo12] = useState<FluxoProjetado12Meses | null>(null);

  const carregar = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const meses = mesesAnteriores(6);
      const [gastos, comp, todasCat, dreMes, endiv, fluxo] = await Promise.all([
        getGastoPorCategoria(mes, contexto),
        getComparativoMensal(meses, contexto),
        listCategorias("consolidado"),
        getDreSimplificada(mes, contexto),
        getRelatorioEndividamento(contexto, mes),
        getFluxoProjetado12Meses(contexto),
      ]);

      setGastosCategoria(mapGastosRelatorio(gastos, todasCat));
      setComparativo(
        comp.map((c) => ({
          ...c,
          mesLabel: labelMes(c.mes).split(" de ")[0].slice(0, 3),
        })),
      );
      setDre(dreMes);
      setEndividamento(endiv);
      setFluxo12(fluxo);
    } catch (err) {
      setError(getErrorMessage(err));
    } finally {
      setLoading(false);
    }
  }, [contexto, mes]);

  useEffect(() => {
    if (!ctxLoading) void carregar();
  }, [carregar, ctxLoading]);

  async function exportarCsv() {
    try {
      const { inicio, fim } = intervaloDoMes(mes);
      const transacoes = await listTransacoesParaExportacao({
        contexto,
        dataInicio: inicio,
        dataFim: fim,
      });
      const categorias = await listCategorias("consolidado");
      const rows = transacoes.map((t) => {
        const cat = findCategoriaById(categorias, t.categoria_id);
        return [
          t.data,
          t.descricao,
          t.tipo,
          t.contexto,
          String(t.valor),
          cat?.nome ?? "",
          t.status,
        ];
      });
      downloadCsv(
        `transacoes-${mes}.csv`,
        ["Data", "Descrição", "Tipo", "Contexto", "Valor", "Categoria", "Status"],
        rows,
      );
    } catch (err) {
      setError(getErrorMessage(err));
    }
  }

  if (loading || ctxLoading) return <LoadingSpinner label="Gerando relatórios..." />;
  if (error) return <ErrorAlert message={error} />;

  const comparativoChart = comparativo;

  return (
    <div>
      <PageHeader
        title="Relatórios"
        subtitle="Análises e exportação de dados"
        action={
          <Button variant="secondary" onClick={() => void exportarCsv()}>
            Exportar CSV
          </Button>
        }
      />

      <div className="mb-6 max-w-xs">
        <Input
          label="Mês de referência"
          type="month"
          value={mes}
          onChange={(e) => setMes(e.target.value)}
        />
      </div>

      {endividamento && (
        <section className="mb-6 app-card p-5">
          <h2 className="mb-1 font-semibold text-slate-100">Endividamento</h2>
          <p className="mb-4 text-xs text-slate-500">
            Dívida vs caixa vs patrimônio — financiamentos, empréstimos e faturas de cartão
          </p>

          <div className="mb-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <IndicadorCard
              label="Patrimônio líquido"
              value={formatCurrency(endividamento.patrimonio.patrimonio_liquido)}
              hint={`Contas ${formatCurrency(endividamento.patrimonio.saldo_contas)} − Dívidas ${formatCurrency(endividamento.total_dividas)}`}
              tone={endividamento.patrimonio.patrimonio_liquido >= 0 ? "green" : "red"}
            />
            <IndicadorCard
              label="Caixa disponível"
              value={formatCurrency(endividamento.patrimonio.caixa_disponivel)}
              hint="Exclui cartão e investimentos"
            />
            <IndicadorCard
              label="Saldo devedor"
              value={formatCurrency(endividamento.total_dividas)}
              hint={`Faturas cartão: ${formatCurrency(endividamento.total_faturas_cartao)}`}
              tone="red"
            />
            <IndicadorCard
              label={`Parcelas em ${labelMes(mes)}`}
              value={formatCurrency(endividamento.parcelas_mes_atual)}
              hint={
                endividamento.indicadores.cobertura_caixa != null
                  ? `Caixa cobre ${endividamento.indicadores.cobertura_caixa.toFixed(1)}× a dívida parcelada`
                  : "Sem dívidas parceladas"
              }
            />
          </div>

          <div className="mb-6 grid gap-3 sm:grid-cols-3">
            <div className="rounded-lg border border-white/10 bg-white/5 px-4 py-3 text-sm">
              <p className="text-xs text-slate-500">Cobertura do caixa</p>
              <p className="mt-1 font-semibold text-slate-200">
                {endividamento.indicadores.cobertura_caixa != null
                  ? `${endividamento.indicadores.cobertura_caixa.toFixed(2)}×`
                  : "—"}
              </p>
              <p className="mt-0.5 text-xs text-slate-500">Caixa ÷ saldo devedor</p>
            </div>
            <div className="rounded-lg border border-white/10 bg-white/5 px-4 py-3 text-sm">
              <p className="text-xs text-slate-500">Dívida / patrimônio em contas</p>
              <p className="mt-1 font-semibold text-slate-200">
                {endividamento.indicadores.divida_sobre_patrimonio != null
                  ? `${(endividamento.indicadores.divida_sobre_patrimonio * 100).toFixed(0)}%`
                  : "—"}
              </p>
            </div>
            <div className="rounded-lg border border-white/10 bg-white/5 px-4 py-3 text-sm">
              <p className="text-xs text-slate-500">Meses de caixa p/ quitar dívida</p>
              <p className="mt-1 font-semibold text-slate-200">
                {endividamento.indicadores.meses_caixa_para_divida != null
                  ? `${endividamento.indicadores.meses_caixa_para_divida.toFixed(1)} meses`
                  : "—"}
              </p>
              <p className="mt-0.5 text-xs text-slate-500">Com base nas parcelas do mês</p>
            </div>
          </div>

          {endividamento.itens.length === 0 ? (
            <p className="text-sm text-slate-500">Nenhuma dívida ou fatura pendente.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[640px] text-sm">
                <thead className="app-table-head">
                  <tr>
                    <th className="px-3 py-2 text-left font-medium">Descrição</th>
                    <th className="px-3 py-2 text-left font-medium">Tipo</th>
                    {contexto === "consolidado" && (
                      <th className="px-3 py-2 text-left font-medium">Contexto</th>
                    )}
                    <th className="px-3 py-2 text-right font-medium">Restante</th>
                    <th className="px-3 py-2 text-right font-medium">Pago</th>
                    <th className="px-3 py-2 text-right font-medium">Progresso</th>
                    <th className="px-3 py-2 text-left font-medium">Próx. venc.</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-white/10">
                  {endividamento.itens.map((item) => (
                    <tr key={`${item.tipo}-${item.id}`}>
                      <td className="px-3 py-2 text-slate-200">{item.descricao}</td>
                      <td className="px-3 py-2 capitalize text-slate-400">
                        {item.tipo === "fatura_cartao" ? "Fatura cartão" : item.tipo}
                      </td>
                      {contexto === "consolidado" && (
                        <td className="px-3 py-2">
                          <ContextoBadge itemContexto={item.contexto} />
                        </td>
                      )}
                      <td className="px-3 py-2 text-right font-medium text-rose-300">
                        {formatCurrency(item.valor_restante)}
                      </td>
                      <td className="px-3 py-2 text-right text-slate-400">
                        {formatCurrency(item.valor_pago)}
                      </td>
                      <td className="px-3 py-2 text-right text-slate-400">
                        {item.percentual_pago}%
                        {item.parcelas_restantes != null && (
                          <span className="ml-1 text-xs text-slate-500">
                            ({item.parcelas_restantes} parc.)
                          </span>
                        )}
                      </td>
                      <td className="px-3 py-2 text-slate-400">
                        {item.proximo_vencimento ? formatDate(item.proximo_vencimento) : "—"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      )}

      {fluxo12 && (
        <section className="mb-6 app-card p-5">
          <h2 className="mb-1 font-semibold text-slate-100">Fluxo de caixa — 12 meses</h2>
          <p className="mb-4 text-xs text-slate-500">
            Projeção mensal com vencimentos, recorrentes e faturas de cartão
          </p>

          <div className="mb-4 grid gap-3 sm:grid-cols-3">
            <IndicadorCard
              label="Saldo hoje"
              value={formatCurrency(fluxo12.saldo_atual)}
            />
            <IndicadorCard
              label="Saldo em 12 meses"
              value={formatCurrency(fluxo12.saldo_final_12m)}
              tone={fluxo12.saldo_final_12m >= 0 ? "green" : "red"}
            />
            <IndicadorCard
              label="Saldo mínimo projetado"
              value={formatCurrency(fluxo12.saldo_minimo)}
              hint={
                fluxo12.mes_saldo_minimo
                  ? `Em ${labelMes(fluxo12.mes_saldo_minimo)}`
                  : undefined
              }
              tone={fluxo12.saldo_minimo >= 0 ? "amber" : "red"}
            />
          </div>

          <ResponsiveContainer width="100%" height={320}>
            <ComposedChart data={fluxo12.meses}>
              <CartesianGrid strokeDasharray="3 3" stroke={THEME.chartGrid} vertical={false} />
              <XAxis
                dataKey="mesLabel"
                tick={{ fontSize: 11, fill: THEME.tick }}
                axisLine={false}
                tickLine={false}
              />
              <YAxis
                tickFormatter={(v) => `R$${Number(v) / 1000}k`}
                tick={{ fill: THEME.tick, fontSize: 11 }}
                axisLine={false}
                tickLine={false}
              />
              <Tooltip formatter={(v) => formatCurrency(Number(v))} contentStyle={chartTooltipStyle} />
              <Legend wrapperStyle={{ color: THEME.tick }} />
              <Bar dataKey="entradas" name="Entradas" fill={THEME.income} radius={[4, 4, 0, 0]} />
              <Bar dataKey="saidas" name="Saídas" fill={THEME.expense} radius={[4, 4, 0, 0]} />
              <Line
                type="monotone"
                dataKey="saldo_final"
                name="Saldo final"
                stroke="#22d3ee"
                strokeWidth={2}
                dot={{ r: 3, fill: "#22d3ee" }}
              />
            </ComposedChart>
          </ResponsiveContainer>
        </section>
      )}

      {dre && (
        <section className="mb-6 app-card p-5">
          <h2 className="mb-4 font-semibold text-slate-100">
            DRE simplificada — {labelMes(mes)}
          </h2>
          <div className="grid gap-6 lg:grid-cols-2">
            <div>
              <h3 className="mb-2 text-sm font-medium text-emerald-400">Receitas</h3>
              {dre.receitas.length === 0 ? (
                <p className="text-sm text-slate-500">Sem receitas no período.</p>
              ) : (
                <table className="w-full text-sm">
                  <tbody className="divide-y divide-white/10">
                    {dre.receitas.map((r) => (
                      <tr key={r.nome}>
                        <td className="py-1.5">
                          <span className="mr-2 inline-block h-2 w-2 rounded-full" style={{ backgroundColor: r.cor }} />
                          {r.nome}
                        </td>
                        <td className="py-1.5 text-right">{formatCurrency(r.total)}</td>
                      </tr>
                    ))}
                    <tr className="font-semibold text-emerald-400">
                      <td className="pt-2">Total receitas</td>
                      <td className="pt-2 text-right">{formatCurrency(dre.total_receitas)}</td>
                    </tr>
                  </tbody>
                </table>
              )}
            </div>
            <div>
              <h3 className="mb-2 text-sm font-medium text-rose-400">Despesas</h3>
              {dre.despesas.length === 0 ? (
                <p className="text-sm text-slate-500">Sem despesas no período.</p>
              ) : (
                <table className="w-full text-sm">
                  <tbody className="divide-y divide-white/10">
                    {dre.despesas.map((d) => (
                      <tr key={d.nome}>
                        <td className="py-1.5">
                          <span className="mr-2 inline-block h-2 w-2 rounded-full" style={{ backgroundColor: d.cor }} />
                          {d.nome}
                        </td>
                        <td className="py-1.5 text-right">{formatCurrency(d.total)}</td>
                      </tr>
                    ))}
                    <tr className="font-semibold text-rose-400">
                      <td className="pt-2">Total despesas</td>
                      <td className="pt-2 text-right">{formatCurrency(dre.total_despesas)}</td>
                    </tr>
                  </tbody>
                </table>
              )}
            </div>
          </div>
          <div className="mt-4 flex items-center justify-between border-t border-white/10 pt-4">
            <span className="font-semibold text-slate-200">Resultado do período</span>
            <span className={`text-lg font-bold ${dre.resultado >= 0 ? "text-emerald-400" : "text-rose-400"}`}>
              {formatCurrency(dre.resultado)}
            </span>
          </div>
        </section>
      )}

      <div className="grid gap-6 lg:grid-cols-2">
        <section className="app-card p-5">
          <h2 className="mb-4 font-semibold text-slate-100">
            Gastos por categoria — {labelMes(mes)}
          </h2>
          {gastosCategoria.length === 0 ? (
            <p className="text-sm text-slate-500">Sem despesas neste mês.</p>
          ) : (
            <ResponsiveContainer width="100%" height={300}>
              <BarChart data={gastosCategoria} layout="vertical">
                <CartesianGrid strokeDasharray="3 3" stroke={THEME.chartGrid} />
                <XAxis type="number" tickFormatter={(v) => `R$${v}`} tick={{ fill: THEME.tick }} />
                <YAxis type="category" dataKey="nome" width={100} tick={{ fontSize: 11, fill: THEME.tick }} />
                <Tooltip formatter={(v) => formatCurrency(Number(v))} contentStyle={chartTooltipStyle} />
                <Bar dataKey="total" name="Gasto" radius={[0, 4, 4, 0]}>
                  {gastosCategoria.map((entry, i) => (
                    <Cell key={i} fill={entry.cor} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          )}
        </section>

        <section className="app-card p-5">
          <h2 className="mb-4 font-semibold text-slate-100">Comparativo — últimos 6 meses</h2>
          {comparativoChart.length === 0 ? (
            <p className="text-sm text-slate-500">Sem dados para comparar.</p>
          ) : (
            <ResponsiveContainer width="100%" height={300}>
              <BarChart data={comparativoChart}>
                <CartesianGrid strokeDasharray="3 3" stroke={THEME.chartGrid} vertical={false} />
                <XAxis dataKey="mesLabel" tick={{ fontSize: 12, fill: THEME.tick }} axisLine={false} tickLine={false} />
                <YAxis tickFormatter={(v) => `R$${v}`} tick={{ fill: THEME.tick }} axisLine={false} tickLine={false} />
                <Tooltip formatter={(v) => formatCurrency(Number(v))} contentStyle={chartTooltipStyle} />
                <Legend wrapperStyle={{ color: THEME.tick }} />
                <Bar dataKey="receitas" name="Receitas" fill={THEME.income} radius={[6, 6, 0, 0]} />
                <Bar dataKey="despesas" name="Despesas" fill={THEME.expense} radius={[6, 6, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          )}
        </section>
      </div>

      {gastosCategoria.length > 0 && (
        <section className="mt-6 app-card p-5">
          <h2 className="mb-4 font-semibold text-slate-100">Detalhamento</h2>
          <table className="w-full text-sm">
            <thead className="app-table-head">
              <tr>
                <th className="pb-2 font-medium">Categoria</th>
                <th className="pb-2 font-medium text-right">Total</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/10">
              {gastosCategoria.map((g) => (
                <tr key={g.nome}>
                  <td className="py-2">
                    <span className="mr-2 inline-block h-2 w-2 rounded-full" style={{ backgroundColor: g.cor }} />
                    {g.nome}
                  </td>
                  <td className="py-2 text-right font-medium">{formatCurrency(g.total)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      )}
    </div>
  );
}

function IndicadorCard({
  label,
  value,
  hint,
  tone = "neutral",
}: {
  label: string;
  value: string;
  hint?: string;
  tone?: "neutral" | "green" | "red" | "amber";
}) {
  const valueClass = {
    neutral: "text-white",
    green: "text-emerald-400",
    red: "text-rose-400",
    amber: "text-amber-400",
  }[tone];

  return (
    <div className="rounded-xl border border-white/[0.06] bg-white/[0.03] p-4">
      <p className="text-xs text-slate-500">{label}</p>
      <p className={`mt-1 text-xl font-bold ${valueClass}`}>{value}</p>
      {hint && <p className="mt-1 text-xs text-slate-500">{hint}</p>}
    </div>
  );
}
