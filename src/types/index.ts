export type Contexto = "pessoal" | "empresa";
export type ContextoVisualizacao = Contexto | "consolidado";
export type ContextoCategoria = Contexto | "ambos";

export type TipoConta =
  | "banco"
  | "dinheiro"
  | "cartao_credito"
  | "poupanca"
  | "investimento";

export type TipoCategoria = "receita" | "despesa";

export type TipoTransacao = "receita" | "despesa" | "transferencia";

export type StatusTransacao = "efetivado" | "pendente";

export type TipoContaPagarReceber = "pagar" | "receber";

export type StatusContaPagarReceber = "pendente" | "pago" | "atrasado";

export interface Conta {
  id: number;
  nome: string;
  tipo: TipoConta;
  contexto: Contexto;
  saldo_inicial: number;
  cor: string;
  icone: string | null;
  ativo: boolean;
  /** Dia do fechamento da fatura (1–31), só cartão de crédito */
  dia_fechamento: number | null;
  /** Dia do vencimento da fatura (1–31), só cartão de crédito */
  dia_vencimento: number | null;
  /** Limite de crédito (só cartão) */
  limite_credito: number | null;
  /** Data a partir da qual o saldo_inicial é válido (YYYY-MM-DD) */
  data_saldo_inicial: string | null;
}

export interface Categoria {
  id: number;
  nome: string;
  tipo: TipoCategoria;
  contexto: ContextoCategoria;
  cor: string;
  icone: string | null;
}

export type TransferenciaPapel = "saida" | "entrada";

export interface Transacao {
  id: number;
  descricao: string;
  valor: number;
  data: string;
  tipo: TipoTransacao;
  conta_id: number;
  categoria_id: number | null;
  contexto: Contexto;
  status: StatusTransacao;
  anexo_path: string | null;
  observacoes: string | null;
  transacao_vinculada_id: number | null;
  transferencia_papel: TransferenciaPapel | null;
  /** Compra vinculada a uma fatura de cartão */
  fatura_cartao_id: number | null;
  /** Transferência de pagamento de fatura (não entra no P&L) */
  pagamento_fatura_id: number | null;
  created_at: string;
  updated_at: string;
  /** Tags vinculadas (preenchido em consultas estendidas) */
  tags?: Tag[];
}

export interface Tag {
  id: number;
  nome: string;
  contexto: ContextoCategoria;
  cor: string;
}

export interface ContaPagarReceber {
  id: number;
  descricao: string;
  valor: number;
  vencimento: string;
  tipo: TipoContaPagarReceber;
  contexto: Contexto;
  status: StatusContaPagarReceber;
  transacao_id: number | null;
  categoria_id: number | null;
  /** Mês YYYY-MM em que o valor conta no orçamento (ex.: gastos de ago. na fatura que vence em set.) */
  mes_referencia: string | null;
}

export interface Orcamento {
  id: number;
  categoria_id: number;
  contexto: Contexto;
  mes_referencia: string;
  valor_limite: number;
  descricao: string | null;
  recorrente_id: number | null;
}

export interface OrcamentoRecorrente {
  id: number;
  descricao: string;
  categoria_id: number;
  contexto: Contexto;
  valor_limite: number;
  ativo: boolean;
  created_at: string;
  updated_at: string;
}

export interface Configuracao {
  chave: string;
  valor: string;
}

export type StatusParcelaFinanciamento = "pendente" | "paga" | "atrasada";
export type StatusParcelaEmprestimo = StatusParcelaFinanciamento;

export interface Financiamento {
  id: number;
  descricao: string;
  valor_total: number;
  valor_parcela: number;
  total_parcelas: number;
  contexto: Contexto;
  conta_id: number;
  categoria_id: number | null;
  data_primeira_parcela: string;
  ativo: boolean;
  observacoes: string | null;
  created_at: string;
  updated_at: string;
}

export interface FinanciamentoParcela {
  id: number;
  financiamento_id: number;
  numero_parcela: number;
  valor_previsto: number;
  vencimento: string;
  valor_pago: number | null;
  data_pagamento: string | null;
  status: StatusParcelaFinanciamento;
  transacao_id: number | null;
  observacoes: string | null;
}

export interface FinanciamentoResumo extends Financiamento {
  parcelas_pagas: number;
  parcelas_restantes: number;
  valor_pago: number;
  /** Saldo devedor = valor_total − valor_pago (como no app do banco) */
  valor_restante: number;
  valor_total_contrato: number;
  percentual_pago: number;
  proximo_vencimento: string | null;
}

export interface Emprestimo {
  id: number;
  descricao: string;
  valor_total: number;
  valor_parcela: number;
  total_parcelas: number;
  contexto: Contexto;
  conta_id: number;
  categoria_id: number | null;
  data_primeira_parcela: string;
  ativo: boolean;
  observacoes: string | null;
  created_at: string;
  updated_at: string;
}

export interface EmprestimoParcela {
  id: number;
  emprestimo_id: number;
  numero_parcela: number;
  valor_previsto: number;
  vencimento: string;
  valor_pago: number | null;
  data_pagamento: string | null;
  status: StatusParcelaEmprestimo;
  transacao_id: number | null;
  observacoes: string | null;
}

export interface EmprestimoResumo extends Emprestimo {
  parcelas_pagas: number;
  parcelas_restantes: number;
  valor_pago: number;
  valor_restante: number;
  valor_total_contrato: number;
  percentual_pago: number;
  proximo_vencimento: string | null;
}

export interface TransacaoRecorrente {
  id: number;
  descricao: string;
  valor: number;
  tipo: "receita" | "despesa";
  conta_id: number;
  categoria_id: number | null;
  contexto: Contexto;
  dia_mes: number;
  ativo: boolean;
  observacoes: string | null;
  created_at: string;
  updated_at: string;
}

export interface DreSimplificada {
  receitas: { categoria_id: number | null; nome: string; cor: string; total: number }[];
  despesas: { categoria_id: number | null; nome: string; cor: string; total: number }[];
  total_receitas: number;
  total_despesas: number;
  resultado: number;
}

export interface FluxoProjetadoDia {
  data: string;
  entradas: number;
  saidas: number;
  saldo: number;
}

export interface FluxoProjetadoResumo {
  saldo_atual: number;
  saldo_30: number;
  saldo_60: number;
  saldo_90: number;
  dias: FluxoProjetadoDia[];
}

export interface FluxoMensalProjetado {
  mes: string;
  mesLabel: string;
  entradas: number;
  saidas: number;
  saldo_final: number;
}

export interface FluxoProjetado12Meses {
  saldo_atual: number;
  meses: FluxoMensalProjetado[];
  saldo_minimo: number;
  mes_saldo_minimo: string | null;
  saldo_final_12m: number;
}

export type TipoItemEndividamento = "financiamento" | "emprestimo" | "fatura_cartao";

export interface ItemEndividamento {
  id: number;
  tipo: TipoItemEndividamento;
  descricao: string;
  contexto: Contexto;
  valor_total: number;
  valor_pago: number;
  valor_restante: number;
  percentual_pago: number;
  proximo_vencimento: string | null;
  parcelas_restantes: number | null;
}

export interface RelatorioEndividamento {
  patrimonio: PatrimonioResumo;
  itens: ItemEndividamento[];
  total_dividas: number;
  total_faturas_cartao: number;
  parcelas_mes_atual: number;
  indicadores: {
    cobertura_caixa: number | null;
    divida_sobre_patrimonio: number | null;
    meses_caixa_para_divida: number | null;
  };
}

export interface FaturaCartaoResumo {
  id?: number;
  conta_id: number;
  conta_nome: string;
  mes_referencia: string;
  periodo_inicio: string;
  periodo_fim: string;
  vencimento: string;
  total: number;
  valor_pago?: number | null;
  data_pagamento?: string | null;
  status?: StatusFaturaCartao;
  itens: { id: number; data: string; descricao: string; valor: number }[];
}

export type StatusFaturaCartao = "aberta" | "fechada" | "paga";

export interface ResumoCartaoCredito {
  conta_id: number;
  conta_nome: string;
  limite_credito: number | null;
  total_em_aberto: number;
  limite_disponivel: number | null;
  fatura_atual: FaturaCartaoResumo | null;
  saldo_conta: number;
}

export interface MetaFinanceira {
  id: number;
  nome: string;
  valor_alvo: number;
  valor_atual: number;
  contexto: Contexto;
  conta_id: number | null;
  prazo: string | null;
  cor: string;
  ativo: boolean;
  created_at: string;
  updated_at: string;
}

export interface MetaFinanceiraComProgresso extends MetaFinanceira {
  percentual: number;
  valor_atual_efetivo: number;
}

export interface RegraCategorizacao {
  id: number;
  padrao: string;
  categoria_id: number;
  contexto: ContextoCategoria;
  tipo: "receita" | "despesa" | "ambos";
  prioridade: number;
  ativo: boolean;
  created_at: string;
}

export interface PatrimonioResumo {
  saldo_contas: number;
  dividas: number;
  patrimonio_liquido: number;
  caixa_disponivel: number;
}

export type NivelAlertaOrcamento = "atencao" | "estourado" | "abaixo_meta";

export interface AlertaOrcamento {
  orcamento_id: number;
  descricao: string;
  categoria_nome: string;
  contexto: Contexto;
  tipo_categoria: TipoCategoria;
  percentual: number;
  total_usado: number;
  valor_limite: number;
  nivel: NivelAlertaOrcamento;
}
