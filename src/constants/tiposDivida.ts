export type SubtipoDivida = "financiamento" | "emprestimo" | "parcelamento";

export const TIPOS_DIVIDA: {
  id: SubtipoDivida;
  titulo: string;
  tituloPlural: string;
  descricao: string;
}[] = [
  {
    id: "financiamento",
    titulo: "Financiamento",
    tituloPlural: "Financiamentos",
    descricao:
      "Imóvel, veículo ou equipamento. Use quando um bem está atrelado ao contrato (banco ou financeira).",
  },
  {
    id: "emprestimo",
    titulo: "Empréstimo",
    tituloPlural: "Empréstimos",
    descricao:
      "Dinheiro que você pegou emprestado — pessoal, consignado ou entre pessoas. Não está atrelado a um bem específico.",
  },
  {
    id: "parcelamento",
    titulo: "Parcelamento",
    tituloPlural: "Parcelamentos",
    descricao:
      "Compra ou acordo em vezes fora do cartão: carnê da loja, acordo com credor, dívida ativa, imposto parcelado ou boleto em X vezes. O pagamento se registra em Dívidas (Pagar parcelas) e aí altera o caixa. Compras no cartão ficam em Cartões de crédito.",
  },
];

export function labelSubtipoDivida(tipo: SubtipoDivida): string {
  return TIPOS_DIVIDA.find((t) => t.id === tipo)?.titulo ?? tipo;
}

export function descricaoSubtipoDivida(tipo: SubtipoDivida): string {
  return TIPOS_DIVIDA.find((t) => t.id === tipo)?.descricao ?? "";
}
