import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { PageHeader } from "../components/ui/Feedback";
import { COPYRIGHT_COM_CNPJ } from "../constants/empresa";
import { useContexto } from "../contexts/ContextoContext";

const STORAGE_KEY = "moneyos_aprender_passos";
const STORAGE_KEY_EMPRESA = "moneyos_aprender_passos_empresa";

type PassoId = "contas" | "categorias" | "transacao" | "recorrentes" | "dashboard";
type PassoEmpresaId =
  | "emp_contexto"
  | "emp_contas"
  | "emp_categorias"
  | "emp_receber"
  | "emp_aging";

const PASSOS: {
  id: PassoId;
  titulo: string;
  detalhe: string;
  to: string;
  cta: string;
}[] = [
  {
    id: "contas",
    titulo: "Crie suas contas",
    detalhe: "Bancos, carteira e cartões — onde o dinheiro fica. Bens (imóvel, carro) também em Contas.",
    to: "/contas",
    cta: "Abrir Contas",
  },
  {
    id: "categorias",
    titulo: "Organize as categorias",
    detalhe: "Ex.: alimentação, salário, aluguel. Dá para importar um modelo pronto.",
    to: "/categorias",
    cta: "Abrir Categorias",
  },
  {
    id: "transacao",
    titulo: "Lance a primeira movimentação",
    detalhe:
      "Informe o quê, quanto, quando e de onde. Detalhes extras ficam em “Mais opções”.",
    to: "/transacoes?nova=1",
    cta: "Abrir Lançamentos",
  },
  {
    id: "recorrentes",
    titulo: "Cadastre o que se repete",
    detalhe:
      "Aluguel, assinaturas, salário — em Recorrentes (menu A vencer); o app lança no dia do vencimento.",
    to: "/transacoes?aba=recorrentes",
    cta: "Abrir Recorrentes",
  },
  {
    id: "dashboard",
    titulo: "Acompanhe o mês no Início",
    detalhe: "Veja se o mês fecha, o que fazer agora e o resultado (padrão: só o que já entrou/saiu).",
    to: "/",
    cta: "Abrir Início",
  },
];

const PASSOS_EMPRESA: {
  id: PassoEmpresaId;
  titulo: string;
  detalhe: string;
  to: string;
  cta: string;
}[] = [
  {
    id: "emp_contexto",
    titulo: "Troque o contexto para Empresa",
    detalhe: "No seletor do topo, escolha Empresa para não misturar com o caixa pessoal.",
    to: "/",
    cta: "Abrir Início",
  },
  {
    id: "emp_contas",
    titulo: "Crie as contas da empresa",
    detalhe: "Conta bancária PJ e, se usar, cartão da empresa — sempre no contexto Empresa.",
    to: "/contas",
    cta: "Abrir Contas",
  },
  {
    id: "emp_categorias",
    titulo: "Separe categorias de negócio",
    detalhe: "Receitas de serviço/venda e despesas operacionais. Tags ajudam como centro de custo.",
    to: "/categorias",
    cta: "Abrir Categorias",
  },
  {
    id: "emp_receber",
    titulo: "Cadastre o a receber na Agenda",
    detalhe: "Clientes e valores com vencimento — a receber ainda não é caixa.",
    to: "/contas-pagar-receber",
    cta: "Abrir Agenda",
  },
  {
    id: "emp_aging",
    titulo: "Acompanhe o aging na Agenda",
    detalhe: "Veja o que está a vencer e o que já atrasou (1–30, 31–60, 61–90, 90+ dias).",
    to: "/contas-pagar-receber",
    cta: "Ver Agenda",
  },
];

const GLOSSARIO: { titulo: string; texto: string; to: string }[] = [
  {
    titulo: "Início",
    texto: "Resumo do mês: se fecha, o que fazer agora e o resultado.",
    to: "/",
  },
  {
    titulo: "Contas",
    texto: "Onde o dinheiro está — bancos, carteira e cartões.",
    to: "/contas",
  },
  {
    titulo: "Lançamentos",
    texto: "O que já aconteceu: pagou, recebeu ou transferiu.",
    to: "/transacoes",
  },
  {
    titulo: "Agenda",
    texto: "Compromissos avulsos com data de vencimento (não confundir com recorrentes).",
    to: "/contas-pagar-receber",
  },
  {
    titulo: "Recorrentes",
    texto: "O que se repete todo mês. Também acessível pela aba em Lançamentos.",
    to: "/transacoes?aba=recorrentes",
  },
  {
    titulo: "Dívidas",
    texto: "Financiamentos e empréstimos parcelados — escolha o tipo ao cadastrar.",
    to: "/dividas-parceladas",
  },
  {
    titulo: "Orçamentos",
    texto: "Limite de gasto por categoria; na aba Receita planejada, quanto você quer receber no mês.",
    to: "/orcamentos",
  },
  {
    titulo: "Metas",
    texto: "Objetivos de reserva ou economia (emergência, viagem), com progresso.",
    to: "/metas",
  },
  {
    titulo: "Relatórios",
    texto: "Visão mais detalhada do período e projeções de caixa.",
    to: "/relatorios",
  },
  {
    titulo: "Categorias",
    texto: "Forma de classificar receitas e despesas.",
    to: "/categorias",
  },
  {
    titulo: "Patrimônio fora do banco",
    texto: "Imóvel, veículo e outros bens — em Contas, abaixo das contas bancárias.",
    to: "/contas",
  },
];

const FAQ: { pergunta: string; resposta: string }[] = [
  {
    pergunta: "Qual a diferença entre recorrente e Agenda?",
    resposta:
      "Recorrente (em Lançamentos) é o que se repete todo mês (aluguel, Netflix). Agenda é compromisso avulso ou pontual, com uma data específica.",
  },
  {
    pergunta: "Por que o aluguel ainda não apareceu em Lançamentos?",
    resposta:
      "O recorrente só vira lançamento no mês atual, a partir do dia de vencimento. Antes disso ele entra no resultado “Incluindo o que ainda vence” no Início.",
  },
  {
    pergunta: "Pessoal e empresa: o que muda?",
    resposta:
      "Você pode separar as finanças por contexto. O seletor no topo define o que você está vendo. Em consolidado, os dois aparecem juntos — não é um único caixa; transferências entre contextos entram no resultado como despesa e receita (retirada/aporte).",
  },
  {
    pergunta: "Onde ficam meus dados?",
    resposta:
      "Tudo fica no seu computador (banco local). Em Configurações → Dados você pode fazer backup e restaurar.",
  },
  {
    pergunta: "O resultado do Início inclui o quê?",
    resposta:
      "“Já entrou / saiu” (padrão) mostra só o efetivado. “Incluindo o que ainda vence” soma também agenda, parcelas, faturas e recorrentes ainda não gerados.",
  },
  {
    pergunta: "O que é “disponível para gastar”?",
    resposta:
      "Em Orçamentos (despesas), é o limite do mês menos o já usado e comprometido. Não é o saldo do banco — é o envelope do mês.",
  },
  {
    pergunta: "Preciso cadastrar tudo de uma vez?",
    resposta:
      "Não. Comece pelas contas e alguns lançamentos. Vá completando categorias, recorrentes e orçamentos conforme usar o app. Se usa Empresa, siga o checklist específico abaixo.",
  },
];

function lerPassosConcluidos(): Set<PassoId> {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return new Set();
    const parsed = JSON.parse(raw) as string[];
    return new Set(parsed.filter((id): id is PassoId => PASSOS.some((p) => p.id === id)));
  } catch {
    return new Set();
  }
}

function salvarPassosConcluidos(ids: Set<PassoId>) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify([...ids]));
  } catch {
    /* ignore */
  }
}

function lerPassosEmpresa(): Set<PassoEmpresaId> {
  try {
    const raw = localStorage.getItem(STORAGE_KEY_EMPRESA);
    if (!raw) return new Set();
    const parsed = JSON.parse(raw) as string[];
    return new Set(
      parsed.filter((id): id is PassoEmpresaId => PASSOS_EMPRESA.some((p) => p.id === id)),
    );
  } catch {
    return new Set();
  }
}

function salvarPassosEmpresa(ids: Set<PassoEmpresaId>) {
  try {
    localStorage.setItem(STORAGE_KEY_EMPRESA, JSON.stringify([...ids]));
  } catch {
    /* ignore */
  }
}

export function AprenderPage() {
  const { escopo } = useContexto();
  const mostrarChecklistEmpresa = escopo !== "pessoal";
  const [feitos, setFeitos] = useState<Set<PassoId>>(() => lerPassosConcluidos());
  const [feitosEmpresa, setFeitosEmpresa] = useState<Set<PassoEmpresaId>>(() => lerPassosEmpresa());
  const [faqAberto, setFaqAberto] = useState<number | null>(0);

  const progresso = useMemo(() => {
    const total = PASSOS.length;
    const ok = PASSOS.filter((p) => feitos.has(p.id)).length;
    return { ok, total, pct: Math.round((ok / total) * 100) };
  }, [feitos]);

  const progressoEmpresa = useMemo(() => {
    const total = PASSOS_EMPRESA.length;
    const ok = PASSOS_EMPRESA.filter((p) => feitosEmpresa.has(p.id)).length;
    return { ok, total, pct: Math.round((ok / total) * 100) };
  }, [feitosEmpresa]);

  function alternarPasso(id: PassoId) {
    setFeitos((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      salvarPassosConcluidos(next);
      return next;
    });
  }

  function alternarPassoEmpresa(id: PassoEmpresaId) {
    setFeitosEmpresa((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      salvarPassosEmpresa(next);
      return next;
    });
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Aprender a usar o WSF Money"
        subtitle="Passo a passo simples para organizar suas finanças neste app."
      />

      <section className="app-card p-5">
        <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
          <div>
            <h2 className="font-semibold text-slate-900">Comece por aqui</h2>
            <p className="mt-1 text-sm text-slate-500">
              Marque cada passo quando terminar. Seu progresso fica salvo neste computador.
            </p>
          </div>
          <p className="text-sm font-medium text-teal-800">
            {progresso.ok} de {progresso.total} · {progresso.pct}%
          </p>
        </div>

        <div className="mb-5 h-2 overflow-hidden rounded-full bg-slate-100">
          <div
            className="h-full rounded-full bg-teal-600 transition-[width] duration-300"
            style={{ width: `${progresso.pct}%` }}
          />
        </div>

        <ol className="space-y-3">
          {PASSOS.map((passo, index) => {
            const feito = feitos.has(passo.id);
            return (
              <li
                key={passo.id}
                className={`rounded-xl border p-4 transition-colors ${
                  feito
                    ? "border-teal-200 bg-teal-50/60"
                    : "border-slate-200 bg-slate-50/50"
                }`}
              >
                <div className="flex flex-wrap items-start gap-3">
                  <button
                    type="button"
                    onClick={() => alternarPasso(passo.id)}
                    className={`mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full border text-xs font-semibold ${
                      feito
                        ? "border-teal-600 bg-teal-600 text-white"
                        : "border-slate-300 bg-white text-slate-600"
                    }`}
                    aria-pressed={feito}
                    aria-label={feito ? `Desmarcar: ${passo.titulo}` : `Marcar: ${passo.titulo}`}
                  >
                    {feito ? "✓" : index + 1}
                  </button>
                  <div className="min-w-0 flex-1">
                    <p
                      className={`text-sm font-semibold ${
                        feito ? "text-teal-900 line-through decoration-teal-700/40" : "text-slate-900"
                      }`}
                    >
                      {passo.titulo}
                    </p>
                    <p className="mt-1 text-sm text-slate-600">{passo.detalhe}</p>
                    <Link to={passo.to} className="app-link mt-2 inline-block text-sm">
                      {passo.cta} →
                    </Link>
                  </div>
                </div>
              </li>
            );
          })}
        </ol>
      </section>

      {mostrarChecklistEmpresa && (
      <section className="app-card p-5">
        <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
          <div>
            <h2 className="font-semibold text-slate-900">Se você usa Empresa</h2>
            <p className="mt-1 text-sm text-slate-500">
              Checklist curto de caixa e cobrança — separado do uso pessoal.
            </p>
          </div>
          <p className="text-sm font-medium text-teal-800">
            {progressoEmpresa.ok} de {progressoEmpresa.total} · {progressoEmpresa.pct}%
          </p>
        </div>
        <div className="mb-5 h-2 overflow-hidden rounded-full bg-slate-100">
          <div
            className="h-full rounded-full bg-teal-600 transition-[width] duration-300"
            style={{ width: `${progressoEmpresa.pct}%` }}
          />
        </div>
        <ol className="space-y-3">
          {PASSOS_EMPRESA.map((passo, index) => {
            const feito = feitosEmpresa.has(passo.id);
            return (
              <li
                key={passo.id}
                className={`rounded-xl border p-4 transition-colors ${
                  feito
                    ? "border-teal-200 bg-teal-50/60"
                    : "border-slate-200 bg-slate-50/50"
                }`}
              >
                <div className="flex flex-wrap items-start gap-3">
                  <button
                    type="button"
                    onClick={() => alternarPassoEmpresa(passo.id)}
                    className={`mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full border text-xs font-semibold ${
                      feito
                        ? "border-teal-600 bg-teal-600 text-white"
                        : "border-slate-300 bg-white text-slate-600"
                    }`}
                    aria-pressed={feito}
                    aria-label={feito ? `Desmarcar: ${passo.titulo}` : `Marcar: ${passo.titulo}`}
                  >
                    {feito ? "✓" : index + 1}
                  </button>
                  <div className="min-w-0 flex-1">
                    <p
                      className={`text-sm font-semibold ${
                        feito ? "text-teal-900 line-through decoration-teal-700/40" : "text-slate-900"
                      }`}
                    >
                      {passo.titulo}
                    </p>
                    <p className="mt-1 text-sm text-slate-600">{passo.detalhe}</p>
                    <Link to={passo.to} className="app-link mt-2 inline-block text-sm">
                      {passo.cta} →
                    </Link>
                  </div>
                </div>
              </li>
            );
          })}
        </ol>
      </section>
      )}

      <section className="app-card p-5">
        <h2 className="font-semibold text-slate-900">O que é cada coisa</h2>
        <p className="mt-1 text-sm text-slate-500">
          Uma frase por tela. Clique para ir direto ao lugar certo.
        </p>
        <div className="mt-4 grid gap-3 sm:grid-cols-2">
          {GLOSSARIO.map((item) => (
            <Link
              key={item.titulo}
              to={item.to}
              className="rounded-xl border border-slate-200 bg-white p-4 transition-colors hover:border-slate-300 hover:bg-slate-50"
            >
              <p className="text-sm font-semibold text-slate-900">{item.titulo}</p>
              <p className="mt-1 text-sm text-slate-600">{item.texto}</p>
              <p className="mt-2 text-xs font-medium text-teal-800">Abrir →</p>
            </Link>
          ))}
        </div>
      </section>

      <section className="app-card p-5">
        <h2 className="font-semibold text-slate-900">Dúvidas frequentes</h2>
        <p className="mt-1 text-sm text-slate-500">Respostas curtas para os casos mais comuns.</p>
        <div className="mt-4 divide-y divide-slate-200 rounded-xl border border-slate-200">
          {FAQ.map((item, index) => {
            const aberto = faqAberto === index;
            return (
              <div key={item.pergunta}>
                <button
                  type="button"
                  className="flex w-full items-center justify-between gap-3 px-4 py-3 text-left"
                  onClick={() => setFaqAberto(aberto ? null : index)}
                  aria-expanded={aberto}
                >
                  <span className="text-sm font-medium text-slate-800">{item.pergunta}</span>
                  <span className="shrink-0 text-slate-400">{aberto ? "−" : "+"}</span>
                </button>
                {aberto && (
                  <p className="px-4 pb-4 text-sm leading-relaxed text-slate-600">{item.resposta}</p>
                )}
              </div>
            );
          })}
        </div>
      </section>

      <p className="text-center text-xs text-slate-400">{COPYRIGHT_COM_CNPJ}</p>
    </div>
  );
}
