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
  getComparativoMensalEntradasSaidas,
  getResumoMensalEntradasSaidas,
  type ComparativoMensalEntradasSaidas,
  type ResumoMensalEntradasSaidas,
} from "../db/resumoMensalUnificado";
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
  mesesAoRedor,
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
  const [resumoMes, setResumoMes] = useState<ResumoMensalEntradasSaidas | null>(null);
  const [comparativoMes, setComparativoMes] = useState<
    (ComparativoMensalEntradasSaidas & { mesLabel: string })[]
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
      const mesesUnificado = mesesAoRedor(mes, 2, 3);
      const [r, comp, gastosM, todasCat, v, resumoU, compU, fp, pat, al, met] = await Promise.all([
        getResumoMensal(mes, contexto),
        getComparativoMensal(meses12, contexto),
        getGastoPorCategoria(mes, contexto),
        listCategorias("consolidado"),
        listProximosVencimentosUnificados(contexto, 6),
        getResumoMensalEntradasSaidas(mes, contexto),
        getComparativoMensalEntradasSaidas(mesesUnificado, contexto),
        getFluxoProjetado(contexto),
        getPatrimonioResumo(contexto),
        getAlertasOrcamento(contexto, mes),
        listMetasFinanceiras(contexto),
      ]);

      setResumo(r);
      setComparativo(comp.map((c) => ({ ...c, mesLabel: mesCurto(c.mes) })));
      setGastosMes(mapGastosCategoria(gastosM, todasCat));
      setVencimentos(v);
      setResumoMes(resumoU);
      setComparativoMes(compU.map((c) => ({ ...c, mesLabel: mesCurto(c.mes) })));
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
  const atrasados = vencimentos.filter((v) => vencimentoEstaAtrasado(v.status)).length;
  const taxaPoupanca =
    resumo.receitas > 0 ? Math.round((resultadoMes / resumo.receitas) * 100) : null;
  const topCategoria = gastosMes[0];

  if (loading || ctxLoading) return <LoadingSpinner />;
  if (error) return <ErrorAlert message={error} />;

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Dashboard</h1>
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

      {atrasados > 0 ? (
        <div className="app-banner-danger">
          {atrasados} vencimento{atrasados > 1 ? "s" : ""} em atraso — revise contas a pagar/receber.
        </div>
      ) : vencimentos.length > 0 ? (
        <div className="app-banner-ok">
          Tudo em dia — nenhum vencimento urgente nos próximos itens.
        </div>
      ) : (
        <div className="app-banner-ok">Tudo em dia — nenhum vencimento pendente.</div>
      )}

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <InsightCard
          tone="rose"
          title={
            vencimentos.length === 0
              ? "Sem contas próximas"
              : `${vencimentos.length} conta${vencimentos.length > 1 ? "s" : ""} próxima${vencimentos.length > 1 ? "s" : ""}`
          }
          detail={
            vencimentos[0]
              ? `${vencimentos[0].descricao} · ${formatDate(vencimentos[0].vencimento)}`
              : "Nada agendado no momento"
          }
          link={{ to: "/contas-pagar-receber", label: "Ver contas →" }}
        />
        <InsightCard
          tone="emerald"
          title={
            taxaPoupanca == null
              ? "Taxa de poupança"
              : `Taxa de poupança: ${taxaPoupanca}%`
          }
          detail={
            taxaPoupanca == null
              ? "Sem receitas neste mês"
              : taxaPoupanca >= 0
                ? "Resultado positivo no período"
                : "Despesas acima das receitas"
          }
        />
        <InsightCard
          tone="amber"
          title={topCategoria ? `Maior gasto: ${topCategoria.nome}` : "Sem gastos por categoria"}
          detail={
            topCategoria
              ? `${formatCurrency(topCategoria.total)} neste mês`
              : "Nenhuma despesa categorizada"
          }
        />
        <InsightCard
          tone="violet"
          title={
            alertas.length > 0
              ? `${alertas.length} orçamento${alertas.length > 1 ? "s" : ""} em atenção`
              : "Orçamentos sob controle"
          }
          detail={
            alertas[0]
              ? `${alertas[0].descricao} · ${alertas[0].percentual.toFixed(0)}%`
              : "Nenhum alerta neste mês"
          }
          link={{ to: "/orcamentos", label: "Ver orçamentos →" }}
        />
      </div>

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <KpiCard
          title="Caixa disponível"
          value={formatCurrency(patrimonio?.caixa_disponivel ?? 0)}
          subtitle="Saldo em contas (exc. cartão e investimentos)"
          accent="teal"
          valueClass="text-slate-900"
        />
        <KpiCard
          title="Saldo do mês"
          value={`${resultadoMes >= 0 ? "" : "-"}${formatCurrency(Math.abs(resultadoMes))}`}
          subtitle="Realizado: receitas − despesas"
          accent="sky"
          valueClass={resultadoMes >= 0 ? "text-emerald-600" : "text-rose-600"}
        />
        <KpiCard
          title="Receitas"
          value={formatCurrency(resumo.receitas)}
          subtitle={`Realizado · ${labelMes(mes)}`}
          accent="emerald"
          valueClass="text-slate-900"
        />
        <KpiCard
          title="Despesas"
          value={formatCurrency(resumo.despesas)}
          subtitle={`Realizado · ${labelMes(mes)}`}
          accent="rose"
          valueClass="text-slate-900"
        />
      </div>

      {resumoMes && (
        <section className="app-card p-5">
          <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
            <div>
              <h2 className="font-semibold text-slate-900">Entradas × saídas do mês</h2>
              <p className="mt-0.5 text-xs text-slate-500">
                Realizado + em aberto (contas, financiamentos, empréstimos, faturas e recorrentes) ·{" "}
                {labelMes(mes)}
              </p>
            </div>
          </div>

          <div className="mb-5 grid gap-3 sm:grid-cols-3">
            <div className="rounded-xl border border-emerald-200 bg-emerald-50/80 p-4">
              <p className="text-xs font-medium text-emerald-800">Entradas</p>
              <p className="mt-1 text-xl font-bold text-emerald-700">
                {formatCurrency(resumoMes.entradas)}
              </p>
              <p className="mt-1 text-xs text-emerald-700/80">
                {formatCurrency(resumoMes.realizado_entradas)} realizado
                {resumoMes.aberto_entradas > 0
                  ? ` · ${formatCurrency(resumoMes.aberto_entradas)} em aberto`
                  : ""}
              </p>
            </div>
            <div className="rounded-xl border border-rose-200 bg-rose-50/80 p-4">
              <p className="text-xs font-medium text-rose-800">Saídas</p>
              <p className="mt-1 text-xl font-bold text-rose-700">
                {formatCurrency(resumoMes.saidas)}
              </p>
              <p className="mt-1 text-xs text-rose-700/80">
                {formatCurrency(resumoMes.realizado_saidas)} realizado
                {resumoMes.aberto_saidas > 0
                  ? ` · ${formatCurrency(resumoMes.aberto_saidas)} em aberto`
                  : ""}
              </p>
            </div>
            <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
              <p className="text-xs font-medium text-slate-600">Líquido previsto</p>
              <p
                className={`mt-1 text-xl font-bold ${
                  resumoMes.liquido >= 0 ? "text-emerald-600" : "text-rose-600"
                }`}
              >
                {resumoMes.liquido >= 0 ? "" : "−"}
                {formatCurrency(Math.abs(resumoMes.liquido))}
              </p>
              <p className="mt-1 text-xs text-slate-500">Entradas − saídas (mês completo)</p>
            </div>
          </div>

          <div className="mb-5 grid gap-3 sm:grid-cols-2">
            <DetalheOrigens
              titulo="De onde vêm as entradas"
              itens={[
                { label: "Lançamentos realizados", valor: resumoMes.detalhe_entradas.realizado },
                { label: "Contas a receber", valor: resumoMes.detalhe_entradas.contas_receber },
                { label: "Recorrentes (ainda não gerados)", valor: resumoMes.detalhe_entradas.recorrentes },
              ]}
            />
            <DetalheOrigens
              titulo="Para onde vão as saídas"
              itens={[
                { label: "Lançamentos realizados", valor: resumoMes.detalhe_saidas.realizado },
                { label: "Contas a pagar", valor: resumoMes.detalhe_saidas.contas_pagar },
                { label: "Financiamentos", valor: resumoMes.detalhe_saidas.financiamentos },
                { label: "Empréstimos", valor: resumoMes.detalhe_saidas.emprestimos },
                { label: "Faturas de cartão", valor: resumoMes.detalhe_saidas.faturas },
                { label: "Recorrentes (ainda não gerados)", valor: resumoMes.detalhe_saidas.recorrentes },
              ]}
            />
          </div>

          {comparativoMes.some((c) => c.entradas > 0 || c.saidas > 0) ? (
            <ResponsiveContainer width="100%" height={220}>
              <BarChart data={comparativoMes} barGap={4} barCategoryGap="18%">
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
                <Tooltip
                  formatter={(v) => formatCurrency(Number(v))}
                  contentStyle={chartTooltipStyle}
                />
                <Legend wrapperStyle={{ color: THEME.tick, fontSize: 12 }} />
                <Bar
                  dataKey="entradas"
                  name="Entradas"
                  fill={THEME.income}
                  radius={[6, 6, 0, 0]}
                  maxBarSize={28}
                />
                <Bar
                  dataKey="saidas"
                  name="Saídas"
                  fill={THEME.expense}
                  radius={[6, 6, 0, 0]}
                  maxBarSize={28}
                />
              </BarChart>
            </ResponsiveContainer>
          ) : (
            <p className="text-sm text-slate-500">
              Sem movimentos nos meses ao redor de {labelMes(mes)}.
            </p>
          )}
        </section>
      )}

      <div className="grid gap-6 lg:grid-cols-2">
        <section className="app-card p-5">
          <h2 className="mb-4 font-semibold text-slate-900">Próximos vencimentos</h2>
          {vencimentos.length === 0 ? (
            <p className="text-sm text-slate-500">Nenhum vencimento pendente.</p>
          ) : (
            <ul className="grid gap-2 sm:grid-cols-2">
              {vencimentos.map((v) => (
                <li key={v.chave}>
                  <Link
                    to={v.rota}
                    className="flex flex-col rounded-xl border border-slate-200 bg-slate-50/80 p-3 transition-colors hover:border-slate-300 hover:bg-white"
                  >
                    <p className="truncate text-sm font-medium text-slate-800">{v.descricao}</p>
                    <p className="mt-1 text-xs text-slate-500">
                      {v.detalhe} · {formatDate(v.vencimento)}
                      {vencimentoEstaAtrasado(v.status) && (
                        <span className="ml-1 text-rose-600">· Atrasado</span>
                      )}
                    </p>
                    <p className="mt-2 text-sm font-semibold text-slate-900">
                      {formatCurrency(v.valor)}
                    </p>
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
              <h2 className="font-semibold text-slate-900">Orçamentos em atenção</h2>
              <Link to="/orcamentos" className="app-link text-xs">
                Ver todos →
              </Link>
            </div>
            <ul className="grid gap-2 sm:grid-cols-2">
              {alertas.slice(0, 4).map((a) => (
                <li
                  key={a.orcamento_id}
                  className={`rounded-xl border p-3 ${
                    a.nivel === "estourado"
                      ? "border-rose-200 bg-rose-50"
                      : "border-amber-200 bg-amber-50"
                  }`}
                >
                  <p className="text-sm font-medium text-slate-800">{a.descricao}</p>
                  <p className="text-xs text-slate-500">
                    {a.categoria_nome}
                    {a.tipo_categoria === "receita" ? " · Meta de receita" : ""}
                  </p>
                  <p
                    className={`mt-1 text-sm font-semibold ${
                      a.nivel === "estourado" ? "text-rose-700" : "text-amber-700"
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
            <h2 className="font-semibold text-slate-900">Orçamentos</h2>
            <p className="mt-2 text-sm text-slate-500">Nenhum alerta neste mês.</p>
            <Link to="/orcamentos" className="app-link mt-3 text-xs">
              Gerenciar orçamentos →
            </Link>
          </section>
        )}
      </div>

      <div className="grid gap-6 xl:grid-cols-3">
        <section className="app-card p-5 xl:col-span-2">
          <h2 className="mb-4 font-semibold text-slate-900">Receitas vs despesas — 12 meses</h2>
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

        <DonutCard title="Gastos por categoria" data={gastosMes} total={resumo.despesas} />
      </div>

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {patrimonio && (
          <div className="app-card p-4">
            <p className="text-xs text-slate-500">Patrimônio líquido</p>
            <p
              className={`text-xl font-bold ${patrimonio.patrimonio_liquido >= 0 ? "text-emerald-600" : "text-rose-600"}`}
            >
              {formatCurrency(patrimonio.patrimonio_liquido)}
            </p>
            <p className="mt-1 text-xs text-slate-500">
              Contas {formatCurrency(patrimonio.saldo_contas)} − Dívidas{" "}
              {formatCurrency(patrimonio.dividas)}
              {patrimonio.dividas_cartao > 0
                ? ` (cartão ${formatCurrency(patrimonio.dividas_cartao)})`
                : ""}
            </p>
          </div>
        )}

        {fluxoProjetado && (
          <div className="app-card p-4">
            <div className="mb-2 flex items-center justify-between">
              <p className="text-xs text-slate-500">Projeção de caixa</p>
              <Link to="/relatorios" className="app-link text-[10px]">
                Ver completa →
              </Link>
            </div>
            <div className="grid grid-cols-3 gap-2 text-center">
              <div>
                <p className="text-[10px] text-slate-500">30 dias</p>
                <p
                  className={`text-sm font-bold ${fluxoProjetado.saldo_30 >= 0 ? "text-emerald-600" : "text-rose-600"}`}
                >
                  {formatCurrency(fluxoProjetado.saldo_30)}
                </p>
              </div>
              <div>
                <p className="text-[10px] text-slate-500">60 dias</p>
                <p
                  className={`text-sm font-bold ${fluxoProjetado.saldo_60 >= 0 ? "text-emerald-600" : "text-rose-600"}`}
                >
                  {formatCurrency(fluxoProjetado.saldo_60)}
                </p>
              </div>
              <div>
                <p className="text-[10px] text-slate-500">90 dias</p>
                <p
                  className={`text-sm font-bold ${fluxoProjetado.saldo_90 >= 0 ? "text-emerald-600" : "text-rose-600"}`}
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
              <p className="text-xs font-medium text-slate-500">Metas</p>
              <Link to="/metas" className="app-link text-[10px]">
                Ver todas →
              </Link>
            </div>
            <ul className="space-y-2">
              {metas.map((m) => (
                <li key={m.id}>
                  <div className="flex items-center justify-between gap-2">
                    <p className="truncate text-sm text-slate-700">{m.nome}</p>
                    <p className="shrink-0 text-xs text-slate-500">{m.percentual.toFixed(0)}%</p>
                  </div>
                  <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-slate-100">
                    <div
                      className="h-full rounded-full bg-teal-600"
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

const INSIGHT_TONES = {
  rose: "border-rose-100 bg-rose-50/70 text-rose-800",
  emerald: "border-emerald-100 bg-emerald-50/70 text-emerald-800",
  amber: "border-amber-100 bg-amber-50/70 text-amber-900",
  violet: "border-violet-100 bg-violet-50/70 text-violet-800",
} as const;

function InsightCard({
  tone,
  title,
  detail,
  link,
}: {
  tone: keyof typeof INSIGHT_TONES;
  title: string;
  detail: string;
  link?: { to: string; label: string };
}) {
  return (
    <div className={`rounded-2xl border p-4 ${INSIGHT_TONES[tone]}`}>
      <p className="text-sm font-semibold">{title}</p>
      <p className="mt-1 text-xs opacity-80">{detail}</p>
      {link && (
        <Link to={link.to} className="mt-2 inline-block text-xs font-medium underline-offset-2 hover:underline">
          {link.label}
        </Link>
      )}
    </div>
  );
}

const KPI_ACCENTS = {
  teal: "bg-teal-500",
  sky: "bg-sky-500",
  emerald: "bg-emerald-500",
  rose: "bg-rose-500",
} as const;

function DetalheOrigens({
  titulo,
  itens,
}: {
  titulo: string;
  itens: { label: string; valor: number }[];
}) {
  const visiveis = itens.filter((i) => i.valor > 0);
  return (
    <div className="rounded-xl border border-slate-200 bg-slate-50/60 p-3">
      <p className="text-xs font-medium text-slate-600">{titulo}</p>
      {visiveis.length === 0 ? (
        <p className="mt-2 text-xs text-slate-500">Nenhum valor neste mês.</p>
      ) : (
        <ul className="mt-2 space-y-1.5">
          {visiveis.map((i) => (
            <li key={i.label} className="flex items-center justify-between gap-2 text-xs">
              <span className="text-slate-600">{i.label}</span>
              <span className="font-medium text-slate-800">{formatCurrency(i.valor)}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function KpiCard({
  title,
  value,
  subtitle,
  accent,
  valueClass = "text-slate-900",
}: {
  title: string;
  value: string;
  subtitle?: string;
  accent: keyof typeof KPI_ACCENTS;
  valueClass?: string;
}) {
  return (
    <div className="app-kpi-card">
      <div className={`absolute inset-x-0 top-0 h-1 ${KPI_ACCENTS[accent]}`} />
      <p className="text-xs font-medium text-slate-500">{title}</p>
      <p className={`mt-2 text-2xl font-bold tracking-tight ${valueClass}`}>{value}</p>
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
      <h3 className="mb-2 text-sm font-semibold text-slate-900">{title}</h3>
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
              <span className="text-lg font-bold text-slate-900">{formatCurrency(total)}</span>
              <span className="text-[10px] text-slate-500">total</span>
            </div>
          </div>
          <ul className="mt-2 space-y-1">
            {pieData.map((g) => (
              <li key={g.id ?? g.nome} className="flex items-center justify-between gap-2 text-xs">
                <span className="flex min-w-0 items-center gap-2 text-slate-600">
                  <span className="h-2 w-2 shrink-0 rounded-full" style={{ backgroundColor: g.cor }} />
                  <span className="truncate">{g.nome}</span>
                </span>
                <span className="shrink-0 text-slate-800">{formatCurrency(g.total)}</span>
              </li>
            ))}
          </ul>
        </>
      )}
    </div>
  );
}
