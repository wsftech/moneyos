import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { PageHeader } from "../components/ui/Feedback";
import { COPYRIGHT_COM_CNPJ } from "../constants/empresa";

const STORAGE_KEY = "moneyos_aprender_passos";

type PassoId = "contas" | "categorias" | "transacao" | "recorrentes" | "dashboard";

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
    detalhe: "Bancos, carteira e cartões — onde o dinheiro fica.",
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
    titulo: "Lance a primeira transação",
    detalhe: "Registre uma receita ou despesa que já aconteceu.",
    to: "/transacoes?nova=1",
    cta: "Abrir Transações",
  },
  {
    id: "recorrentes",
    titulo: "Cadastre o que se repete",
    detalhe: "Aluguel, assinaturas, salário — o app lança no dia do vencimento.",
    to: "/transacoes?aba=recorrentes",
    cta: "Abrir Recorrentes",
  },
  {
    id: "dashboard",
    titulo: "Acompanhe o mês no Dashboard",
    detalhe: "Veja entradas, saídas e o que ainda está em aberto.",
    to: "/",
    cta: "Abrir Dashboard",
  },
];

const GLOSSARIO: { titulo: string; texto: string; to: string }[] = [
  {
    titulo: "Dashboard",
    texto: "Resumo do mês: o que entrou, o que sai e o que ainda está em aberto.",
    to: "/",
  },
  {
    titulo: "Contas",
    texto: "Onde o dinheiro está — bancos, carteira e cartões.",
    to: "/contas",
  },
  {
    titulo: "Transações",
    texto: "O que já aconteceu: pagou, recebeu ou transferiu.",
    to: "/transacoes",
  },
  {
    titulo: "Recorrentes",
    texto: "Contas fixas (ex.: aluguel). Viram lançamento no dia informado, no mês atual.",
    to: "/transacoes?aba=recorrentes",
  },
  {
    titulo: "A pagar / receber",
    texto: "Compromissos avulsos com data de vencimento.",
    to: "/contas-pagar-receber",
  },
  {
    titulo: "Dívidas parceladas",
    texto: "Financiamentos e empréstimos com parcelas.",
    to: "/dividas-parceladas",
  },
  {
    titulo: "Orçamentos",
    texto: "Limite de gasto (ou meta de receita) por categoria no mês.",
    to: "/orcamentos",
  },
  {
    titulo: "Metas",
    texto: "Objetivos de reserva ou economia, com progresso.",
    to: "/metas",
  },
  {
    titulo: "Relatórios",
    texto: "Visão mais detalhada do período e projeções.",
    to: "/relatorios",
  },
  {
    titulo: "Categorias",
    texto: "Forma de classificar receitas e despesas.",
    to: "/categorias",
  },
];

const FAQ: { pergunta: string; resposta: string }[] = [
  {
    pergunta: "Qual a diferença entre recorrente e conta a pagar?",
    resposta:
      "Recorrente é algo que se repete todo mês (aluguel, Netflix). Conta a pagar é um compromisso avulso ou pontual, com uma data específica.",
  },
  {
    pergunta: "Por que o aluguel ainda não apareceu em Transações?",
    resposta:
      "O recorrente só vira lançamento no mês atual, a partir do dia de vencimento. Antes disso ele aparece como compromisso previsto no Dashboard.",
  },
  {
    pergunta: "Pessoal e empresa: o que muda?",
    resposta:
      "Você pode separar as finanças por contexto. O seletor no topo define o que você está vendo. Em consolidado, os dois aparecem juntos.",
  },
  {
    pergunta: "Onde ficam meus dados?",
    resposta:
      "Tudo fica no seu computador (banco local). Em Configurações → Dados você pode fazer backup e restaurar.",
  },
  {
    pergunta: "Entradas × saídas do Dashboard inclui o quê?",
    resposta:
      "Soma o que já foi lançado e o que ainda está em aberto no mês: contas, parcelas, faturas e recorrentes ainda não gerados.",
  },
  {
    pergunta: "Preciso cadastrar tudo de uma vez?",
    resposta:
      "Não. Comece pelas contas e algumas transações. Vá completando categorias, recorrentes e orçamentos conforme usar o app.",
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

export function AprenderPage() {
  const [feitos, setFeitos] = useState<Set<PassoId>>(() => lerPassosConcluidos());
  const [faqAberto, setFaqAberto] = useState<number | null>(0);

  const progresso = useMemo(() => {
    const total = PASSOS.length;
    const ok = PASSOS.filter((p) => feitos.has(p.id)).length;
    return { ok, total, pct: Math.round((ok / total) * 100) };
  }, [feitos]);

  function alternarPasso(id: PassoId) {
    setFeitos((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      salvarPassosConcluidos(next);
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
