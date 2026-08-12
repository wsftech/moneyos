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
] as const;

/** Presets de instituições — preenchem nome, cor e sigla; logo pode ser enviada à parte. */
export const BANCOS_PRESETS = [
  { id: "santander", nome: "Santander", sigla: "SAN", cor: "#EC0000" },
  { id: "nubank", nome: "Nubank", sigla: "Nu", cor: "#820AD1" },
  { id: "itau", nome: "Itaú", sigla: "ITA", cor: "#EC7000" },
  { id: "bradesco", nome: "Bradesco", sigla: "BRA", cor: "#CC092F" },
  { id: "bb", nome: "Banco do Brasil", sigla: "BB", cor: "#FFCC00" },
  { id: "caixa", nome: "Caixa", sigla: "CX", cor: "#0070AF" },
  { id: "inter", nome: "Inter", sigla: "INT", cor: "#FF7A00" },
  { id: "c6", nome: "C6 Bank", sigla: "C6", cor: "#1A1A1A" },
  { id: "btg", nome: "BTG Pactual", sigla: "BTG", cor: "#001E4C" },
  { id: "xp", nome: "XP", sigla: "XP", cor: "#000000" },
  { id: "picpay", nome: "PicPay", sigla: "PP", cor: "#21C25E" },
  { id: "original", nome: "Original", sigla: "ORI", cor: "#00A868" },
] as const;

export type BancoPreset = (typeof BANCOS_PRESETS)[number];

export function iconeConta(icone: string | null | undefined, tipo: TipoConta): string {
  return icone?.trim() || ICONE_PADRAO_POR_TIPO[tipo];
}

export function isEmojiIcon(value: string): boolean {
  return /^\p{Extended_Pictographic}/u.test(value);
}
