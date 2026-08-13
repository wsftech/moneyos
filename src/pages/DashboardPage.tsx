import { useCallback, useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { ContextoBadge } from "../components/ContextoSelector";
import { HeroFechamento } from "../components/HeroFechamento";
import { ErrorAlert, LoadingSpinner } from "../components/ui/Feedback";
import { Input } from "../components/ui/FormFields";
import { useContexto } from "../contexts/ContextoContext";
import { getAlertasOrcamento } from "../db/alertasOrcamento";
import { findCategoriaById, listCategorias } from "../db/categorias";
import { listMetasFinanceiras } from "../db/metas";
import { getPatrimonioResumo } from "../db/patrimonio";
import {
  listAcoesAgora,
  vencimentoEstaAtrasado,
  type ProximoVencimentoUnificado,
} from "../db/proximosVencimentos";
import {
  getResumoMensalEntradasSaidas,
  listItensCompromissosSaidaAteFimDoMes,
  type ItemCompromissoSaida,
  type ResumoMensalEntradasSaidas,
} from "../db/resumoMensalUnificado";
import { getGastoPorCategoria, type GastoPorCategoriaResumo } from "../db/transacoes";
import { getErrorMessage } from "../db/utils";
import type {
  AlertaOrcamento,
  Categoria,
  MetaFinanceiraComProgresso,
  PatrimonioResumo,
} from "../types";
import {
  arredondarMoeda,
  formatCurrency,
  formatDate,
  labelMes,
  mesAtual,
} from "../utils/format";
import { THEME } from "../utils/theme";

type VisaoMes = "realizado" | "previsto";

type CatGasto = {
  id: number | null;
  nome: string;
  total: number;
  cor: string;
};

function mesOffset(mes: string, delta: number): string {
  const [y, m] = mes.split("-").map(Number);
  const d = new Date(y, m - 1 + delta, 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

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

export function DashboardPage() {
  const { contexto, loading: ctxLoading } = useContexto();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [mes, setMes] = useState(mesAtual());
  const [visao, setVisao] = useState<VisaoMes>("realizado");
  const [detalheAberto, setDetalheAberto] = useState(false);

  const [resumoMes, setResumoMes] = useState<ResumoMensalEntradasSaidas | null>(null);
  const [compromissosItens, setCompromissosItens] = useState<ItemCompromissoSaida[]>([]);
  const [gastosMes, setGastosMes] = useState<CatGasto[]>([]);
  const [acoes, setAcoes] = useState<ProximoVencimentoUnificado[]>([]);
  const [patrimonio, setPatrimonio] = useState<PatrimonioResumo | null>(null);
  const [alertas, setAlertas] = useState<AlertaOrcamento[]>([]);
  const [metas, setMetas] = useState<MetaFinanceiraComProgresso[]>([]);

  const mesCorrente = mes === mesAtual();
  const mesAnterior = mesOffset(mesAtual(), -1);

  const carregar = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [resumoU, itensComp, gastosM, todasCat, acoesAgora, pat, al, met] = await Promise.all([
        getResumoMensalEntradasSaidas(mes, contexto),
        listItensCompromissosSaidaAteFimDoMes(mes, contexto),
        getGastoPorCategoria(mes, contexto),
        listCategorias("consolidado"),
        listAcoesAgora(contexto, 7),
        getPatrimonioResumo(contexto),
        getAlertasOrcamento(contexto, mes),
        listMetasFinanceiras(contexto),
      ]);

      setResumoMes(resumoU);
      setCompromissosItens(itensComp);
      setGastosMes(mapGastosCategoria(gastosM, todasCat));
      setAcoes(acoesAgora);
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

  const entradas = visao === "realizado" ? (resumoMes?.realizado_entradas ?? 0) : (resumoMes?.entradas ?? 0);
  const saidas = visao === "realizado" ? (resumoMes?.realizado_saidas ?? 0) : (resumoMes?.saidas ?? 0);
  const resultado = arredondarMoeda(entradas - saidas);

  const fechamento = useMemo(() => {
    if (!resumoMes || !patrimonio) return null;
    const aindaPagar = resumoMes.aberto_saidas;
    const aindaReceber = resumoMes.aberto_entradas;
    const caixa = patrimonio.caixa_disponivel;
    const depoisDePagar = arredondarMoeda(caixa - aindaPagar);
    const depoisDeReceber = arredondarMoeda(caixa - aindaPagar + aindaReceber);
    // Reserva usa só saídas já realizadas — evita “meses de folga” inflados pelo previsto
    const saidasRealizadas = resumoMes.realizado_saidas;
    const reservaMeses =
      saidasRealizadas > 0 ? arredondarMoeda(caixa / saidasRealizadas) : null;
    const detalhePagar = {
      agenda: resumoMes.detalhe_saidas.contas_pagar,
      dividas: arredondarMoeda(
        resumoMes.detalhe_saidas.financiamentos + resumoMes.detalhe_saidas.emprestimos,
      ),
      faturas: resumoMes.detalhe_saidas.faturas,
      recorrentes: resumoMes.detalhe_saidas.recorrentes,
    };
    return {
      aindaPagar,
      aindaReceber,
      caixa,
      depoisDePagar,
      depoisDeReceber,
      reservaMeses,
      detalhePagar,
    };
  }, [resumoMes, patrimonio]);

  if (loading || ctxLoading) return <LoadingSpinner />;
  if (error) return <ErrorAlert message={error} />;

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Início</h1>
          <p className="mt-1 text-sm text-slate-500">
            <span className="capitalize">{labelMes(mes)}</span>
            {contexto === "empresa"
              ? " · caixa da empresa"
              : contexto === "pessoal"
                ? " · suas finanças"
                : " · pessoal e empresa juntos"}
          </p>
        </div>
        <div className="flex flex-wrap items-end gap-2">
          <div className="flex rounded-xl border border-slate-200 bg-white p-1">
            <MesChip
              ativo={mesCorrente}
              onClick={() => setMes(mesAtual())}
              label="Este mês"
            />
            <MesChip
              ativo={mes === mesAnterior}
              onClick={() => setMes(mesAnterior)}
              label="Anterior"
            />
          </div>
          <div className="w-40">
            <Input
              label="Outro mês"
              type="month"
              value={mes}
              onChange={(e) => setMes(e.target.value)}
            />
          </div>
        </div>
      </div>

      {fechamento && (
        <HeroFechamento
          mesCorrente={mesCorrente}
          mesLabel={labelMes(mes)}
          fechamento={fechamento}
          compromissosItens={compromissosItens}
          contexto={contexto}
          resultadoMes={resultado}
        />
      )}

      {mesCorrente && acoes.length > 0 && (
        <section className="app-card p-5">
          <div className="mb-3 flex items-center justify-between gap-2">
            <div>
              <h2 className="font-semibold text-slate-900">Fazer agora</h2>
              <p className="text-xs text-slate-500">
                {contexto === "empresa"
                  ? "Atrasados, a receber e o que vence em 7 dias"
                  : "Atrasados e o que vence em 7 dias"}
              </p>
            </div>
            <Link to="/contas-pagar-receber" className="app-link text-xs">
              Ver agenda →
            </Link>
          </div>
          <ul className="divide-y divide-slate-100">
            {acoes.slice(0, 8).map((v) => (
              <li key={v.chave}>
                <Link
                  to={v.rota}
                  className="flex items-center justify-between gap-3 py-2.5 hover:bg-slate-50/80"
                >
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium text-slate-800">{v.descricao}</p>
                    <p className="mt-0.5 text-xs text-slate-500">
                      {v.detalhe} · {formatDate(v.vencimento)}
                      {vencimentoEstaAtrasado(v.status) && (
                        <span className="ml-1 font-medium text-rose-600">Atrasado</span>
                      )}
                      {v.tipo === "receber" && (
                        <span className="ml-1 text-emerald-700">A receber</span>
                      )}
                    </p>
                  </div>
                  <div className="shrink-0 text-right">
                    <p
                      className={`text-sm font-semibold ${
                        v.tipo === "receber" ? "text-emerald-700" : "text-slate-900"
                      }`}
                    >
                      {formatCurrency(v.valor)}
                    </p>
                    {contexto === "consolidado" && <ContextoBadge itemContexto={v.contexto} />}
                  </div>
                </Link>
              </li>
            ))}
          </ul>
        </section>
      )}

      {resumoMes && (
        <section className="app-card p-5">
          <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
            <div>
              <h2 className="font-semibold text-slate-900">
                {contexto === "empresa" ? "Caixa do mês" : "Resultado do mês"}
              </h2>
              <p className="mt-0.5 text-xs text-slate-500">
                {contexto === "empresa"
                  ? visao === "realizado"
                    ? "Só o que já entrou ou saiu da conta — não é lucro contábil"
                    : "Inclui o que ainda vence. A receber ainda não é caixa."
                  : visao === "realizado"
                    ? "Só o que já entrou ou saiu da conta"
                    : "Inclui agenda, parcelas, faturas e recorrentes ainda não gerados"}
              </p>
            </div>
            <div className="flex rounded-xl border border-slate-200 bg-slate-50 p-1">
              <VisaoChip
                ativo={visao === "realizado"}
                onClick={() => setVisao("realizado")}
                label="Já entrou / saiu"
              />
              <VisaoChip
                ativo={visao === "previsto"}
                onClick={() => setVisao("previsto")}
                label="Incluindo o que ainda vence"
              />
            </div>
          </div>

          <div className="grid gap-3 sm:grid-cols-3">
            <div className="rounded-xl border border-slate-200 bg-slate-50/80 p-4">
              <p className="text-xs font-medium text-slate-500">Entradas</p>
              <p className="mt-1 text-xl font-bold text-slate-900">{formatCurrency(entradas)}</p>
            </div>
            <div className="rounded-xl border border-slate-200 bg-slate-50/80 p-4">
              <p className="text-xs font-medium text-slate-500">Saídas</p>
              <p className="mt-1 text-xl font-bold text-slate-900">{formatCurrency(saidas)}</p>
            </div>
            <div className="rounded-xl border border-slate-200 bg-white p-4">
              <p className="text-xs font-medium text-slate-500">Resultado</p>
              <p
                className={`mt-1 text-xl font-bold ${
                  resultado >= 0 ? "text-emerald-700" : "text-rose-700"
                }`}
              >
                {resultado >= 0 ? "" : "−"}
                {formatCurrency(Math.abs(resultado))}
              </p>
            </div>
          </div>

          <button
            type="button"
            className="mt-3 text-xs font-medium text-teal-700 hover:underline"
            onClick={() => setDetalheAberto((v) => !v)}
          >
            {detalheAberto ? "Ocultar origem dos valores" : "De onde vêm esses valores"}
          </button>

          {detalheAberto && (
            <div className="mt-3 grid gap-3 sm:grid-cols-2">
              <DetalheOrigens
                titulo="Entradas"
                itens={[
                  { label: "Já lançado", valor: resumoMes.detalhe_entradas.realizado },
                  { label: "A receber", valor: resumoMes.detalhe_entradas.contas_receber },
                  { label: "Recorrentes ainda não gerados", valor: resumoMes.detalhe_entradas.recorrentes },
                ]}
              />
              <DetalheOrigens
                titulo="Saídas"
                itens={[
                  { label: "Já lançado", valor: resumoMes.detalhe_saidas.realizado },
                  { label: "A pagar", valor: resumoMes.detalhe_saidas.contas_pagar },
                  { label: "Dívidas parceladas", valor: arredondarMoeda(resumoMes.detalhe_saidas.financiamentos + resumoMes.detalhe_saidas.emprestimos) },
                  { label: "Faturas de cartão", valor: resumoMes.detalhe_saidas.faturas },
                  { label: "Recorrentes ainda não gerados", valor: resumoMes.detalhe_saidas.recorrentes },
                ]}
              />
            </div>
          )}
        </section>
      )}

      {patrimonio && (
        <div className="space-y-2">
          <div className="grid gap-3 sm:grid-cols-3">
            <PosicaoCard
              titulo="Caixa"
              valor={formatCurrency(patrimonio.caixa_disponivel)}
              detalhe="Banco, dinheiro e poupança"
            />
            {contexto === "empresa" ? (
              <PosicaoCard
                titulo="A receber"
                valor={formatCurrency(fechamento?.aindaReceber ?? 0)}
                detalhe="Em aberto neste mês — ainda não é caixa"
                link={{ to: "/contas-pagar-receber", label: "Ver agenda →" }}
              />
            ) : (
            <PosicaoCard
              titulo="Patrimônio"
              valor={formatCurrency(patrimonio.patrimonio_liquido)}
              detalhe={
                patrimonio.ativos_manuais > 0
                  ? `Contas ${formatCurrency(patrimonio.saldo_contas)} + bens ${formatCurrency(patrimonio.ativos_manuais)} − dívidas ${formatCurrency(patrimonio.dividas)}`
                  : `Contas ${formatCurrency(patrimonio.saldo_contas)} − dívidas ${formatCurrency(patrimonio.dividas)}`
              }
              valorClass={patrimonio.patrimonio_liquido >= 0 ? "text-slate-900" : "text-rose-700"}
              link={{ to: "/contas", label: "Incluir bens →" }}
            />
            )}
            <PosicaoCard
              titulo="Dívidas"
              valor={formatCurrency(patrimonio.dividas)}
              detalhe={
                patrimonio.dividas_cartao > 0
                  ? `Parceladas ${formatCurrency(patrimonio.dividas_parceladas)} · cartão ${formatCurrency(patrimonio.dividas_cartao)}`
                  : "Financiamentos, empréstimos e cartão"
              }
              link={{ to: "/dividas-parceladas", label: "Ver dívidas →" }}
            />
          </div>
          {contexto === "empresa" && (
            <p className="px-1 text-xs text-slate-500">
              Patrimônio líquido {formatCurrency(patrimonio.patrimonio_liquido)}
              {patrimonio.ativos_manuais > 0
                ? ` (inclui ${formatCurrency(patrimonio.ativos_manuais)} em bens)`
                : ""}
              {" · "}
              <Link to="/relatorios" className="app-link">
                Ver em Relatórios →
              </Link>
              {" · "}
              <Link to="/contas" className="app-link">
                Cadastrar bens →
              </Link>
            </p>
          )}
        </div>
      )}

      <div className="grid gap-6 lg:grid-cols-2">
        <section className="app-card p-5">
          <h2 className="mb-3 font-semibold text-slate-900">
            {contexto === "empresa" ? "Onde a empresa gastou" : "Onde o dinheiro foi"}
          </h2>
          {gastosMes.length === 0 ? (
            <p className="text-sm text-slate-500">Nenhuma despesa categorizada neste mês.</p>
          ) : (
            <ul className="space-y-2">
              {gastosMes.slice(0, 5).map((g) => {
                const total = gastosMes.reduce((s, i) => s + i.total, 0);
                const pct = total > 0 ? Math.round((g.total / total) * 100) : 0;
                return (
                  <li key={g.id ?? g.nome}>
                    <div className="flex items-center justify-between gap-2 text-sm">
                      <span className="flex min-w-0 items-center gap-2 text-slate-700">
                        <span
                          className="h-2 w-2 shrink-0 rounded-full"
                          style={{ backgroundColor: g.cor }}
                        />
                        <span className="truncate">{g.nome}</span>
                      </span>
                      <span className="shrink-0 text-slate-800">
                        {formatCurrency(g.total)}
                        <span className="ml-1 text-xs text-slate-400">{pct}%</span>
                      </span>
                    </div>
                    <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-slate-100">
                      <div
                        className="h-full rounded-full"
                        style={{ width: `${Math.min(pct, 100)}%`, backgroundColor: g.cor }}
                      />
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </section>

        <section className="app-card p-5">
          <div className="mb-3 flex items-center justify-between">
            <h2 className="font-semibold text-slate-900">Orçamentos</h2>
            <Link to="/orcamentos" className="app-link text-xs">
              Ver todos →
            </Link>
          </div>
          {alertas.length === 0 ? (
            <p className="text-sm text-slate-500">Nenhum orçamento estourando neste mês.</p>
          ) : (
            <ul className="space-y-2">
              {alertas.slice(0, 4).map((a) => (
                <li key={a.orcamento_id} className="rounded-xl border border-slate-200 px-3 py-2.5">
                  <p className="text-sm font-medium text-slate-800">{a.descricao}</p>
                  <p className="text-xs text-slate-500">{a.categoria_nome}</p>
                  <p
                    className={`mt-1 text-sm font-semibold ${
                      a.nivel === "estourado" ? "text-rose-700" : "text-amber-800"
                    }`}
                  >
                    {a.percentual.toFixed(0)}% · {formatCurrency(a.total_usado)} /{" "}
                    {formatCurrency(a.valor_limite)}
                  </p>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>

      {metas.length > 0 && (
        <section className="app-card p-5">
          <div className="mb-3 flex items-center justify-between">
            <h2 className="font-semibold text-slate-900">Metas</h2>
            <Link to="/metas" className="app-link text-xs">
              Ver todas →
            </Link>
          </div>
          <ul className="grid gap-3 sm:grid-cols-3">
            {metas.map((m) => (
              <li key={m.id}>
                <div className="flex items-center justify-between gap-2">
                  <p className="truncate text-sm text-slate-700">{m.nome}</p>
                  <p className="shrink-0 text-xs text-slate-500">{m.percentual.toFixed(0)}%</p>
                </div>
                <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-slate-100">
                  <div
                    className="h-full rounded-full bg-teal-700"
                    style={{ width: `${Math.min(m.percentual, 100)}%` }}
                  />
                </div>
              </li>
            ))}
          </ul>
        </section>
      )}

      <p className="text-center text-xs text-slate-400">
        Projeção de 12 meses e endividamento detalhado ficam em{" "}
        <Link to="/relatorios" className="app-link">
          Relatórios
        </Link>
        .
      </p>
    </div>
  );
}

function MesChip({
  ativo,
  onClick,
  label,
}: {
  ativo: boolean;
  onClick: () => void;
  label: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`rounded-lg px-3 py-1.5 text-xs font-medium ${
        ativo ? "bg-app-sidebar text-white" : "text-slate-600 hover:bg-slate-50"
      }`}
    >
      {label}
    </button>
  );
}

function VisaoChip({
  ativo,
  onClick,
  label,
}: {
  ativo: boolean;
  onClick: () => void;
  label: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`rounded-lg px-3 py-1.5 text-xs font-medium ${
        ativo ? "bg-white text-slate-900" : "text-slate-500 hover:text-slate-800"
      }`}
    >
      {label}
    </button>
  );
}

function PosicaoCard({
  titulo,
  valor,
  detalhe,
  valorClass = "text-slate-900",
  link,
}: {
  titulo: string;
  valor: string;
  detalhe: string;
  valorClass?: string;
  link?: { to: string; label: string };
}) {
  return (
    <div className="app-card p-4">
      <p className="text-xs font-medium text-slate-500">{titulo}</p>
      <p className={`mt-1 text-xl font-bold tracking-tight ${valorClass}`}>{valor}</p>
      <p className="mt-1 text-xs text-slate-500">{detalhe}</p>
      {link && (
        <Link to={link.to} className="app-link mt-2 inline-block text-xs">
          {link.label}
        </Link>
      )}
    </div>
  );
}

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
