import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { Cell, Pie, PieChart, ResponsiveContainer, Tooltip } from "recharts";
import type { ItemCompromissoSaida } from "../db/resumoMensalUnificado";
import { formatCurrency, formatDate } from "../utils/format";
import { THEME, chartTooltipStyle } from "../utils/theme";

type FechamentoDados = {
  aindaPagar: number;
  aindaReceber: number;
  caixa: number;
  depoisDePagar: number;
  depoisDeReceber: number;
  reservaMeses: number | null;
  detalhePagar: {
    agenda: number;
    dividas: number;
    faturas: number;
    recorrentes: number;
  };
};

const CORES_ORIGEM: Record<ItemCompromissoSaida["origem"], string> = {
  agenda: THEME.accent,
  divida: "#7c3aed",
  fatura: "#f59e0b",
  recorrente: "#0ea5e9",
};

export function HeroFechamento({
  mesCorrente,
  mesLabel,
  fechamento,
  compromissosItens,
  contexto,
  resultadoMes,
}: {
  mesCorrente: boolean;
  mesLabel: string;
  fechamento: FechamentoDados;
  compromissosItens: ItemCompromissoSaida[];
  contexto: string;
  resultadoMes: number;
}) {
  const [detalheAberto, setDetalheAberto] = useState(false);

  const composicao = useMemo(() => {
    const rows = [
      { origem: "agenda" as const, label: "Agenda", valor: fechamento.detalhePagar.agenda },
      { origem: "divida" as const, label: "Dívidas", valor: fechamento.detalhePagar.dividas },
      { origem: "fatura" as const, label: "Faturas", valor: fechamento.detalhePagar.faturas },
      {
        origem: "recorrente" as const,
        label: "Recorrentes",
        valor: fechamento.detalhePagar.recorrentes,
      },
    ].filter((r) => r.valor > 0);
    const total = rows.reduce((s, r) => s + r.valor, 0) || 1;
    return rows.map((r) => ({ ...r, pct: (r.valor / total) * 100 }));
  }, [fechamento.detalhePagar]);

  if (!mesCorrente) {
    return (
      <section className="app-card overflow-hidden p-5">
        <p className="text-xs font-medium uppercase tracking-wide text-slate-500">
          Visão de {mesLabel}
        </p>
        <p className="mt-2 text-xl font-bold text-slate-900">
          {resultadoMes >= 0 ? "Mês positivo" : "Mês negativo"}:{" "}
          {resultadoMes >= 0 ? "" : "−"}
          {formatCurrency(Math.abs(resultadoMes))}
        </p>
        <p className="mt-1 text-sm text-slate-500">
          Use o seletor “Já entrou / saiu” ou “Incluindo o que ainda vence” no bloco abaixo.
        </p>
      </section>
    );
  }

  const fecha = fechamento.depoisDePagar >= 0;
  const fechaSeReceber =
    !fecha && fechamento.aindaReceber > 0 && fechamento.depoisDeReceber >= 0;
  const faltaOuFolga = Math.abs(fechamento.depoisDePagar);
  const sobraSeReceber = fechamento.depoisDeReceber;

  const statusLabel = fecha ? "Sim, fecha" : fechaSeReceber ? "Fecha se receber" : "Não fecha";
  const statusTom = fecha
    ? "bg-emerald-100 text-emerald-800 ring-emerald-200"
    : fechaSeReceber
      ? "bg-amber-100 text-amber-900 ring-amber-200"
      : "bg-rose-100 text-rose-800 ring-rose-200";
  const fundo =
    fecha
      ? "from-emerald-50/90 via-white to-teal-50/40"
      : fechaSeReceber
        ? "from-amber-50/90 via-white to-orange-50/30"
        : "from-rose-50/80 via-white to-slate-50";
  const tomTitulo = fecha ? "text-emerald-950" : fechaSeReceber ? "text-amber-950" : "text-rose-900";

  let titulo: string;
  if (fecha) {
    titulo = `Com o caixa de hoje, depois de pagar sobram ${formatCurrency(fechamento.depoisDePagar)}.`;
  } else if (fechaSeReceber) {
    titulo = `Hoje faltam ${formatCurrency(faltaOuFolga)}. Se entrar o a receber, sobram ${formatCurrency(sobraSeReceber)}.`;
  } else if (fechamento.aindaReceber > 0) {
    titulo = `Mesmo com o a receber, ainda faltariam ${formatCurrency(Math.abs(fechamento.depoisDeReceber))}.`;
  } else {
    titulo = `O caixa cobre só parte dos compromissos — faltam ${formatCurrency(faltaOuFolga)}.`;
  }

  const pergunta =
    contexto === "empresa"
      ? "O caixa cobre o que vence?"
      : contexto === "consolidado"
        ? "Pessoal + empresa: o caixa cobre o que vence?"
        : "Este mês fecha?";

  const compromissos = Math.max(fechamento.aindaPagar, 0);
  const cobertoCaixa = Math.min(fechamento.caixa, compromissos);
  const faltaCaixa = Math.max(compromissos - fechamento.caixa, 0);
  const pctCaixa =
    compromissos <= 0 ? 100 : Math.min(100, Math.round((cobertoCaixa / compromissos) * 100));
  const pctComReceber =
    compromissos <= 0
      ? 100
      : Math.min(
          100,
          Math.round(
            (Math.min(fechamento.caixa + fechamento.aindaReceber, compromissos) / compromissos) *
              100,
          ),
        );

  const donutData =
    compromissos <= 0
      ? [{ name: "Sem compromissos", value: 1, cor: THEME.income }]
      : faltaCaixa <= 0
        ? [{ name: "Coberto pelo caixa", value: compromissos, cor: THEME.income }]
        : cobertoCaixa <= 0
          ? [
              {
                name: "Ainda falta no caixa",
                value: faltaCaixa,
                cor: fechaSeReceber ? "#f59e0b" : THEME.expense,
              },
            ]
          : [
              { name: "Coberto pelo caixa", value: cobertoCaixa, cor: THEME.accent },
              {
                name: "Ainda falta no caixa",
                value: faltaCaixa,
                cor: fechaSeReceber ? "#f59e0b" : THEME.expense,
              },
            ];

  const grupos = [
    {
      origem: "agenda" as const,
      label: "Agenda a pagar",
      total: fechamento.detalhePagar.agenda,
      verTodos: "/contas-pagar-receber",
    },
    {
      origem: "divida" as const,
      label: "Dívidas parceladas",
      total: fechamento.detalhePagar.dividas,
      verTodos: "/dividas-parceladas",
    },
    {
      origem: "fatura" as const,
      label: "Faturas de cartão",
      total: fechamento.detalhePagar.faturas,
      verTodos: "/contas",
    },
    {
      origem: "recorrente" as const,
      label: "Recorrentes ainda não gerados",
      total: fechamento.detalhePagar.recorrentes,
      verTodos: "/transacoes?aba=recorrentes",
    },
  ].filter((g) => g.total > 0);

  return (
    <section
      className={`app-card overflow-hidden border bg-gradient-to-br ${fundo} ${
        fecha ? "border-emerald-200/80" : fechaSeReceber ? "border-amber-200/80" : "border-rose-200/80"
      }`}
    >
      <div className="grid gap-4 p-5 lg:grid-cols-[minmax(0,1.2fr)_220px] lg:items-center">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <p className="text-xs font-medium uppercase tracking-wide text-slate-500">{pergunta}</p>
            <span
              className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-[11px] font-semibold ring-1 ${statusTom}`}
            >
              {statusLabel}
            </span>
          </div>
          <p className={`mt-2 text-xl font-bold leading-snug tracking-tight sm:text-2xl ${tomTitulo}`}>
            {titulo}
          </p>

          <div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-4">
            <MetricaChip label="Caixa" valor={formatCurrency(fechamento.caixa)} />
            <MetricaChip label="A pagar" valor={formatCurrency(fechamento.aindaPagar)} destaque="rose" />
            <MetricaChip
              label="A receber"
              valor={formatCurrency(fechamento.aindaReceber)}
              destaque="emerald"
            />
            <MetricaChip
              label={fecha ? "Sobram" : fechaSeReceber ? "Sobram se receber" : "Ainda faltam"}
              valor={formatCurrency(
                fecha
                  ? faltaOuFolga
                  : fechaSeReceber
                    ? sobraSeReceber
                    : fechamento.aindaReceber > 0
                      ? Math.abs(fechamento.depoisDeReceber)
                      : faltaOuFolga,
              )}
              destaque={fecha || fechaSeReceber ? "teal" : "rose"}
            />
          </div>

          {fechaSeReceber && (
            <p className="mt-3 text-xs text-amber-900/80">
              A receber ainda não é dinheiro na conta — o mês só fecha de verdade se entrar a
              tempo.
            </p>
          )}
        </div>

        <div className="relative mx-auto h-[180px] w-[180px] shrink-0">
          <ResponsiveContainer width="100%" height="100%">
            <PieChart>
              <Pie
                data={donutData}
                dataKey="value"
                nameKey="name"
                innerRadius={58}
                outerRadius={78}
                paddingAngle={compromissos > 0 && faltaCaixa > 0 ? 2 : 0}
                stroke="none"
              >
                {donutData.map((slice) => (
                  <Cell key={slice.name} fill={slice.cor} />
                ))}
              </Pie>
              <Tooltip
                formatter={(value) => formatCurrency(Number(value))}
                contentStyle={chartTooltipStyle}
              />
            </PieChart>
          </ResponsiveContainer>
          <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center text-center">
            <p className="text-[10px] font-medium uppercase tracking-wide text-slate-500">
              Cobertura
            </p>
            <p className={`text-2xl font-bold tabular-nums ${tomTitulo}`}>{pctCaixa}%</p>
            {fechaSeReceber && (
              <p className="mt-0.5 text-[10px] text-amber-800">
                {pctComReceber}% c/ receber
              </p>
            )}
            {!fechaSeReceber && compromissos > 0 && (
              <p className="mt-0.5 text-[10px] text-slate-400">pelo caixa</p>
            )}
          </div>
        </div>
      </div>

      {composicao.length > 0 && (
        <div className="border-t border-slate-200/70 px-5 py-4">
          <div className="mb-2 flex items-center justify-between gap-2">
            <p className="text-xs font-medium text-slate-600">Composição dos compromissos</p>
            <p className="text-xs tabular-nums text-slate-500">
              {formatCurrency(fechamento.aindaPagar)}
            </p>
          </div>
          <div className="flex h-3 overflow-hidden rounded-full bg-slate-100 ring-1 ring-slate-200/80">
            {composicao.map((parte) => (
              <div
                key={parte.origem}
                title={`${parte.label}: ${formatCurrency(parte.valor)}`}
                className="h-full transition-[width] duration-500"
                style={{
                  width: `${parte.pct}%`,
                  backgroundColor: CORES_ORIGEM[parte.origem],
                }}
              />
            ))}
          </div>
          <ul className="mt-2.5 flex flex-wrap gap-x-4 gap-y-1">
            {composicao.map((parte) => (
              <li key={parte.origem} className="flex items-center gap-1.5 text-[11px] text-slate-600">
                <span
                  className="h-2 w-2 rounded-full"
                  style={{ backgroundColor: CORES_ORIGEM[parte.origem] }}
                />
                {parte.label}{" "}
                <span className="tabular-nums font-medium text-slate-800">
                  {formatCurrency(parte.valor)}
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {grupos.length > 0 && (
        <div className="border-t border-slate-200/70 px-5 py-3">
          <button
            type="button"
            onClick={() => setDetalheAberto((v) => !v)}
            className="flex w-full items-center justify-between gap-2 text-left text-xs font-medium text-teal-800 hover:text-teal-950"
          >
            <span>
              {detalheAberto ? "Ocultar itens" : "Ver itens dos compromissos"} (
              {compromissosItens.length})
            </span>
            <span className="text-slate-400">{detalheAberto ? "▴" : "▾"}</span>
          </button>

          {detalheAberto && (
            <div className="mt-3 space-y-3">
              {grupos.map((grupo) => {
                const itens = compromissosItens.filter((i) => i.origem === grupo.origem);
                return (
                  <div key={grupo.origem}>
                    <div className="mb-1 flex items-center justify-between gap-2 text-xs">
                      <span className="flex items-center gap-1.5 font-semibold text-slate-700">
                        <span
                          className="h-2 w-2 rounded-full"
                          style={{ backgroundColor: CORES_ORIGEM[grupo.origem] }}
                        />
                        {grupo.label}
                      </span>
                      <span className="tabular-nums text-slate-800">
                        {formatCurrency(grupo.total)}
                      </span>
                    </div>
                    <ul className="space-y-1">
                      {itens.map((item, idx) => (
                        <li key={`${item.origem}-${item.descricao}-${item.vencimento}-${idx}`}>
                          <Link
                            to={item.rota}
                            className="flex items-start justify-between gap-3 rounded-lg px-2 py-1.5 text-xs hover:bg-white/80"
                          >
                            <span className="min-w-0">
                              <span className="block truncate font-medium text-slate-800">
                                {item.descricao}
                              </span>
                              <span className="text-slate-500">
                                {item.detalhe}
                                {item.vencimento ? ` · ${formatDate(item.vencimento)}` : ""}
                              </span>
                            </span>
                            <span className="shrink-0 tabular-nums text-slate-800">
                              {formatCurrency(item.valor)}
                            </span>
                          </Link>
                        </li>
                      ))}
                    </ul>
                    {itens.length === 0 && (
                      <p className="px-2 text-[11px] text-slate-400">
                        Abra{" "}
                        <Link to={grupo.verTodos} className="app-link">
                          {grupo.label.toLowerCase()}
                        </Link>{" "}
                        para conferir.
                      </p>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      <div className="border-t border-slate-200/60 px-5 py-2.5">
        <p className="text-[11px] text-slate-400">
          Caixa = banco, dinheiro e poupança (sem investimento nem fatura de cartão).
          {contexto === "pessoal" && fechamento.reservaMeses != null
            ? ` Reserva ≈ ${fechamento.reservaMeses.toFixed(1)} ${fechamento.reservaMeses >= 2 ? "meses" : "mês"} de saídas já realizadas.`
            : ""}
          {contexto === "consolidado"
            ? " Visão conjunta de pessoal e empresa — não é um único caixa."
            : ""}
        </p>
      </div>
    </section>
  );
}

function MetricaChip({
  label,
  valor,
  destaque,
}: {
  label: string;
  valor: string;
  destaque?: "rose" | "emerald" | "teal";
}) {
  const tom =
    destaque === "rose"
      ? "border-rose-100 bg-rose-50/80"
      : destaque === "emerald"
        ? "border-emerald-100 bg-emerald-50/80"
        : destaque === "teal"
          ? "border-teal-100 bg-teal-50/80"
          : "border-slate-200/80 bg-white/70";
  return (
    <div className={`rounded-xl border px-3 py-2 shadow-sm shadow-slate-900/5 ${tom}`}>
      <p className="text-[10px] font-medium uppercase tracking-wide text-slate-500">{label}</p>
      <p className="mt-0.5 truncate text-sm font-bold tabular-nums text-slate-900">{valor}</p>
    </div>
  );
}
