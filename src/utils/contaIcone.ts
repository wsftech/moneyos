import type { TipoConta } from "../types";

export const ICONE_PADRAO_POR_TIPO: Record<TipoConta, string> = {
  banco: "🏦",
  dinheiro: "💵",
  cartao_credito: "💳",
  poupanca: "🪙",
  investimento: "📈",
};

export const ICONES_SUGERIDOS = [
  { icone: "🏦", label: "Banco" },
  { icone: "💳", label: "Cartão" },
  { icone: "💵", label: "Dinheiro" },
  { icone: "🪙", label: "Poupança" },
  { icone: "📈", label: "Investimento" },
  { icone: "🏧", label: "Caixa eletrônico" },
  { icone: "💰", label: "Carteira" },
  { icone: "🔵", label: "Nubank" },
  { icone: "🟠", label: "Itaú" },
  { icone: "🔴", label: "Bradesco" },
  { icone: "🟡", label: "BB" },
  { icone: "🟣", label: "Inter" },
] as const;

export function iconeConta(icone: string | null | undefined, tipo: TipoConta): string {
  return icone?.trim() || ICONE_PADRAO_POR_TIPO[tipo];
}

export function isEmojiIcon(value: string): boolean {
  return /^\p{Extended_Pictographic}/u.test(value);
}
