import { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { ContextoBadge } from "../components/ContextoSelector";
import { ErrorAlert, LoadingSpinner } from "../components/ui/Feedback";
import { Input } from "../components/ui/FormFields";
import { useContexto } from "../contexts/ContextoContext";
import { getAlertasOrcamento } from "../db/alertasOrcamento";
import { findCategoriaById, listCategorias } from "../db/categorias";
import { getFluxoProjetado } from "../db/fluxoProjetado";
import { listMetasFinanceiras } from "../db/metas";
import { getPatrimonioResumo } from "../db/patrimonio";
import { listProximosVencimentosUnificados, vencimentoEstaAtrasado } from "../db/proximosVencimentos";
import {
  getComparativoMensal,
  getGastoPorCategoria,
  getResumoMensal,
  type GastoPorCategoriaResumo,
} from "../db/transacoes";
import { getErrorMessage } from "../db/utils";
import type {
  AlertaOrcamento,
  Categoria,
  FluxoProjetadoResumo,
  MetaFinanceiraComProgresso,
  PatrimonioResumo,
} from "../types";
import {
  arredondarMoeda,
  formatCurrency,
  formatDate,
  labelMes,
  mesAtual,
  mesesAnteriores,
} from "../utils/format";
import { chartTooltipStyle, THEME } from "../utils/theme";

type CatGasto = {
  id: number | null;
  nome: string;
  total: number;
  cor: string;
};

function mapGastosCategoria(
  gastos: GastoPorCategoriaResumo[],
  todasCategorias: Categoria[],
): CatGasto[] {
  return gastos.map((g) => {
    const cat =
      g.categoria_nome != null ? null : findCategoriaById(todasCategorias, g.categoria_id);
    return {
      id: g.categoria_id,
      nome: g.categoria_nome ?? cat?.nome ?? "Sem categoria",
      total: g.total,
      cor: g.categoria_cor ?? cat?.cor ?? THEME.categories[5],
    };
  });
}

function mesCurto(mesReferencia: string): string {
  const [ano, mes] = mesReferencia.split("-");
  const d = new Date(Number(ano), Number(mes) - 1, 1);
  return d.toLocaleDateString("pt-BR", { month: "short" }).replace(".", "");
}

export function DashboardPage() {
  const { contexto, loading: ctxLoading } = useContexto();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [mes, setMes] = useState(mesAtual());

  const [resumo, setResumo] = useState({ receitas: 0, despesas: 0 });
  const [comparativo, setComparativo] = useState<
    { mes: string; receitas: number; despesas: number; mesLabel: string }[]
  >([]);
  const [gastosMes, setGastosMes] = useState<CatGasto[]>([]);
  const [vencimentos, setVencimentos] = useState<
    Awaited<ReturnType<typeof listProximosVencimentosUnificados>>
  >([]);
  const [fluxoProjetado, setFluxoProjetado] = useState<FluxoProjetadoResumo | null>(null);
  const [patrimonio, setPatrimonio] = useState<PatrimonioResumo | null>(null);
  const [alertas, setAlertas] = useState<AlertaOrcamento[]>([]);
  const [metas, setMetas] = useState<MetaFinanceiraComProgresso[]>([]);

  const carregar = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const meses12 = mesesAnteriores(12);
      const [r, comp, gastosM, todasCat, v, fp, pat, al, met] = await Promise.all([
        getResumoMensal(mes, contexto),
        getComparativoMensal(meses12, contexto),
        getGastoPorCategoria(mes, contexto),
        listCategorias("consolidado"),
        listProximosVencimentosUnificados(contexto, 6),
        getFluxoProjetado(contexto),
        getPatrimonioResumo(contexto),
        getAlertasOrcamento(contexto, mes),
        listMetasFinanceiras(contexto),
      ]);

      setResumo(r);
      setComparativo(comp.map((c) => ({ ...c, mesLabel: mesCurto(c.mes) })));
      setGastosMes(mapGastosCategoria(gastosM, todasCat));
      setVencimentos(v);
      setFluxoProjetado(fp);
      setPatrimonio(pat);
      setAlertas(al);
      setMetas(met.slice(0, 3));
    } catch (err) {
      setError(getErrorMessage(err));
    } finally {
      setLoading(false);
    }
  }, [contexto, mes]);

  useEffect(() => {
    if (!ctxLoading) void carregar();
  }, [carregar, ctxLoading]);

  const resultadoMes = arredondarMoeda(resumo.receitas - resumo.despesas);

  if (loading || ctxLoading) return <LoadingSpinner />;
  if (error) return <ErrorAlert message={error} />;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-white">Dashboard</h1>
          <p className="mt-1 text-sm text-slate-500">{labelMes(mes)}</p>
        </div>
        <div className="w-44">
          <Input
            label="Mês de referência"
            type="month"
            value={mes}
            onChange={(e) => setMes(e.target.value)}
          />
        </div>
      </div>

      {/* Situação financeira */}
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <KpiCard
          title="Caixa disponível"
          value={formatCurrency(patrimonio?.caixa_disponivel ?? 0)}
          subtitle="Saldo em contas (exc. cartão e investimentos)"
          valueClass="text-white"
        />
        <KpiCard
          title="Resultado do mês"
          value={`${resultadoMes >= 0 ? "+" : ""}${formatCurrency(resultadoMes)}`}
          subtitle="Receitas − despesas no período"
          valueClass={resultadoMes >= 0 ? "text-emerald-400" : "text-rose-400"}
        />
        <KpiCard
          title="Receitas"
          value={formatCurrency(resumo.receitas)}
          subtitle={labelMes(mes)}
          valueClass="text-emerald-400"
        />
        <KpiCard
          title="Despesas"
          value={formatCurrency(resumo.despesas)}
          subtitle={labelMes(mes)}
          valueClass="text-rose-400"
        />
      </div>

      {/* Atenção imediata */}
      <div className="grid gap-6 lg:grid-cols-2">
        <section className="app-card p-5">
          <h2 className="mb-4 font-semibold text-white">Próximos vencimentos</h2>
          {vencimentos.length === 0 ? (
            <p className="text-sm text-slate-500">Nenhum vencimento pendente.</p>
          ) : (
            <ul className="grid gap-2 sm:grid-cols-2">
              {vencimentos.map((v) => (
                <li key={v.chave}>
                  <Link
                    to={v.rota}
                    className="flex flex-col rounded-xl border border-white/[0.06] bg-white/[0.03] p-3 transition-colors hover:border-white/10 hover:bg-white/5"
                  >
                    <p className="truncate text-sm font-medium text-slate-200">{v.descricao}</p>
                    <p className="mt-1 text-xs text-slate-500">
                      {formatDate(v.vencimento)}
                      {vencimentoEstaAtrasado(v.status) && (
                        <span className="ml-1 text-[#ff2d55]">· Atrasado</span>
                      )}
                    </p>
                    <p className="mt-2 text-sm font-semibold text-white">{formatCurrency(v.valor)}</p>
                    {contexto === "consolidado" && <ContextoBadge itemContexto={v.contexto} />}
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </section>

        {alertas.length > 0 ? (
          <section className="app-card p-5">
            <div className="mb-4 flex items-center justify-between">
              <h2 className="font-semibold text-white">Orçamentos em atenção</h2>
              <Link to="/orcamentos" className="text-xs text-indigo-400 hover:underline">
                Ver todos →
              </Link>
            </div>
            <ul className="grid gap-2 sm:grid-cols-2">
              {alertas.slice(0, 4).map((a) => (
                <li
                  key={a.orcamento_id}
                  className={`rounded-xl border p-3 ${
                    a.nivel === "estourado"
                      ? "border-rose-500/30 bg-rose-500/10"
                      : "border-amber-500/30 bg-amber-500/10"
                  }`}
                >
                  <p className="text-sm font-medium text-slate-200">{a.descricao}</p>
                  <p className="text-xs text-slate-500">
                    {a.categoria_nome}
                    {a.tipo_categoria === "receita" ? " · Meta de receita" : ""}
                  </p>
                  <p
                    className={`mt-1 text-sm font-semibold ${
                      a.nivel === "estourado" ? "text-rose-400" : "text-amber-400"
                    }`}
                  >
                    {a.percentual.toFixed(0)}% · {formatCurrency(a.total_usado)} /{" "}
                    {formatCurrency(a.valor_limite)}
                    {a.nivel === "abaixo_meta" && " — abaixo da meta"}
                  </p>
                </li>
              ))}
            </ul>
          </section>
        ) : (
          <section className="app-card flex flex-col justify-center p-5">
            <h2 className="font-semibold text-white">Orçamentos</h2>
            <p className="mt-2 text-sm text-slate-500">Nenhum alerta neste mês.</p>
            <Link to="/orcamentos" className="mt-3 text-xs text-indigo-400 hover:underline">
              Gerenciar orçamentos →
            </Link>
          </section>
        )}
      </div>

      {/* Tendência + categorias */}
      <div className="grid gap-6 xl:grid-cols-3">
        <section className="app-card p-5 xl:col-span-2">
          <h2 className="mb-4 font-semibold text-white">Receitas vs despesas — 12 meses</h2>
          {comparativo.length === 0 ? (
            <p className="text-sm text-slate-500">Sem dados para exibir.</p>
          ) : (
            <ResponsiveContainer width="100%" height={280}>
              <BarChart data={comparativo} barGap={4} barCategoryGap="18%">
                <CartesianGrid strokeDasharray="3 3" stroke={THEME.chartGrid} vertical={false} />
                <XAxis
                  dataKey="mesLabel"
                  tick={{ fill: THEME.tick, fontSize: 11 }}
                  axisLine={false}
                  tickLine={false}
                />
                <YAxis
                  tick={{ fill: THEME.tick, fontSize: 11 }}
                  tickFormatter={(v) => `${v / 1000}k`}
                  axisLine={false}
                  tickLine={false}
                />
                <Tooltip formatter={(v) => formatCurrency(Number(v))} contentStyle={chartTooltipStyle} />
                <Legend wrapperStyle={{ color: THEME.tick, fontSize: 12 }} />
                <Bar
                  dataKey="receitas"
                  name="Receitas"
                  fill={THEME.income}
                  radius={[6, 6, 0, 0]}
                  maxBarSize={28}
                />
                <Bar
                  dataKey="despesas"
                  name="Despesas"
                  fill={THEME.expense}
                  radius={[6, 6, 0, 0]}
                  maxBarSize={28}
                />
              </BarChart>
            </ResponsiveContainer>
          )}
        </section>

        <DonutCard title="Top despesas do mês" data={gastosMes} total={resumo.despesas} />
      </div>

      {/* Contexto opcional */}
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {patrimonio && (
          <div className="app-card p-4">
            <p className="text-xs text-slate-500">Patrimônio líquido</p>
            <p
              className={`text-xl font-bold ${patrimonio.patrimonio_liquido >= 0 ? "text-emerald-400" : "text-rose-400"}`}
            >
              {formatCurrency(patrimonio.patrimonio_liquido)}
            </p>
            <p className="mt-1 text-xs text-slate-500">
              Contas {formatCurrency(patrimonio.saldo_contas)} − Dívidas{" "}
              {formatCurrency(patrimonio.dividas)}
            </p>
          </div>
        )}

        {fluxoProjetado && (
          <div className="app-card p-4">
            <div className="mb-2 flex items-center justify-between">
              <p className="text-xs text-slate-500">Projeção de caixa</p>
              <Link to="/relatorios" className="text-[10px] text-indigo-400 hover:underline">
                Ver completa →
              </Link>
            </div>
            <div className="grid grid-cols-3 gap-2 text-center">
              <div>
                <p className="text-[10px] text-slate-500">30 dias</p>
                <p
                  className={`text-sm font-bold ${fluxoProjetado.saldo_30 >= 0 ? "text-emerald-400" : "text-rose-400"}`}
                >
                  {formatCurrency(fluxoProjetado.saldo_30)}
                </p>
              </div>
              <div>
                <p className="text-[10px] text-slate-500">60 dias</p>
                <p
                  className={`text-sm font-bold ${fluxoProjetado.saldo_60 >= 0 ? "text-emerald-400" : "text-rose-400"}`}
                >
                  {formatCurrency(fluxoProjetado.saldo_60)}
                </p>
              </div>
              <div>
                <p className="text-[10px] text-slate-500">90 dias</p>
                <p
                  className={`text-sm font-bold ${fluxoProjetado.saldo_90 >= 0 ? "text-emerald-400" : "text-rose-400"}`}
                >
                  {formatCurrency(fluxoProjetado.saldo_90)}
                </p>
              </div>
            </div>
          </div>
        )}

        {metas.length > 0 && (
          <div className="app-card p-4 md:col-span-2 xl:col-span-1">
            <div className="mb-2 flex items-center justify-between">
              <p className="text-xs font-medium text-slate-400">Metas</p>
              <Link to="/metas" className="text-[10px] text-indigo-400 hover:underline">
                Ver todas →
              </Link>
            </div>
            <ul className="space-y-2">
              {metas.map((m) => (
                <li key={m.id}>
                  <div className="flex items-center justify-between gap-2">
                    <p className="truncate text-sm text-slate-200">{m.nome}</p>
                    <p className="shrink-0 text-xs text-slate-500">{m.percentual.toFixed(0)}%</p>
                  </div>
                  <div className="mt-1 h-1 overflow-hidden rounded-full bg-white/10">
                    <div
                      className="h-full rounded-full bg-indigo-500"
                      style={{ width: `${Math.min(m.percentual, 100)}%` }}
                    />
                  </div>
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>
    </div>
  );
}

function KpiCard({
  title,
  value,
  subtitle,
  valueClass = "text-white",
}: {
  title: string;
  value: string;
  subtitle?: string;
  valueClass?: string;
}) {
  return (
    <div className="app-card p-4">
      <p className="text-xs text-slate-500">{title}</p>
      <p className={`mt-1 text-2xl font-bold tracking-tight ${valueClass}`}>{value}</p>
      {subtitle && <p className="mt-1 text-xs text-slate-500">{subtitle}</p>}
    </div>
  );
}

function DonutCard({
  title,
  data,
  total,
}: {
  title: string;
  data: CatGasto[];
  total: number;
}) {
  const pieData = data.filter((d) => d.total > 0).slice(0, 5);
  return (
    <div className="app-card flex flex-col p-4">
      <h3 className="mb-2 text-sm font-semibold text-white">{title}</h3>
      {pieData.length === 0 || total <= 0 ? (
        <p className="flex flex-1 items-center justify-center text-xs text-slate-500">Sem despesas</p>
      ) : (
        <>
          <div className="relative flex flex-1 items-center justify-center">
            <ResponsiveContainer width="100%" height={180}>
              <PieChart>
                <Pie
                  data={pieData}
                  dataKey="total"
                  nameKey="nome"
                  cx="50%"
                  cy="50%"
                  innerRadius={52}
                  outerRadius={72}
                  paddingAngle={2}
                  stroke="none"
                >
                  {pieData.map((entry, i) => (
                    <Cell key={entry.id ?? i} fill={entry.cor} />
                  ))}
                </Pie>
                <Tooltip formatter={(v) => formatCurrency(Number(v))} contentStyle={chartTooltipStyle} />
              </PieChart>
            </ResponsiveContainer>
            <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center text-center">
              <span className="text-lg font-bold text-white">{formatCurrency(total)}</span>
              <span className="text-[10px] text-slate-500">total</span>
            </div>
          </div>
          <ul className="mt-2 space-y-1">
            {pieData.map((g) => (
              <li key={g.id ?? g.nome} className="flex items-center justify-between gap-2 text-xs">
                <span className="flex min-w-0 items-center gap-2 text-slate-400">
                  <span className="h-2 w-2 shrink-0 rounded-full" style={{ backgroundColor: g.cor }} />
                  <span className="truncate">{g.nome}</span>
                </span>
                <span className="shrink-0 text-slate-300">{formatCurrency(g.total)}</span>
              </li>
            ))}
          </ul>
        </>
      )}
    </div>
  );
}
