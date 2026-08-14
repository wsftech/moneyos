import type { Contexto, ContextoVisualizacao } from "../types";

export class DatabaseError extends Error {
  constructor(
    message: string,
    public readonly cause?: unknown,
  ) {
    super(message);
    this.name = "DatabaseError";
  }
}

export async function withDatabase<T>(fn: () => Promise<T>): Promise<T> {
  try {
    return await fn();
  } catch (error) {
    if (error instanceof DatabaseError) {
      throw error;
    }
    throw new DatabaseError(friendlyDatabaseMessage(error), error);
  }
}

function friendlyDatabaseMessage(error: unknown): string {
  const raw = error instanceof Error ? error.message : String(error);

  if (raw.includes("FOREIGN KEY constraint failed")) {
    return "Este registro está vinculado a outros dados. Remova as dependências antes de excluir.";
  }
  if (raw.includes("UNIQUE constraint failed")) {
    if (raw.includes("orcamentos")) {
      if (raw.includes("idx_orcamentos_categoria_mes")) {
        return "Já existe um orçamento manual para esta categoria, contexto e mês.";
      }
      if (raw.includes("idx_orcamentos_recorrente_mes")) {
        return "Este item recorrente já está cadastrado para este mês.";
      }
      return "Já existe um orçamento para esta categoria, contexto e mês.";
    }
    return "Já existe um registro com estes dados.";
  }
  if (raw.includes("CHECK constraint failed")) {
    return "Valor inválido. Verifique os campos e tente novamente.";
  }
  if (raw.includes("NOT NULL constraint failed")) {
    return "Preencha todos os campos obrigatórios.";
  }

  return raw || "Erro desconhecido ao acessar o banco de dados";
}

export function getErrorMessage(error: unknown): string {
  if (error instanceof DatabaseError) return error.message;
  if (error instanceof Error) return error.message;
  return "Ocorreu um erro inesperado. Tente novamente.";
}

export function isUniqueConstraintError(error: unknown): boolean {
  const parts: string[] = [];
  if (error instanceof DatabaseError) {
    parts.push(error.message);
    if (error.cause != null) {
      parts.push(error.cause instanceof Error ? error.cause.message : String(error.cause));
    }
  } else if (error instanceof Error) {
    parts.push(error.message);
  } else {
    parts.push(String(error));
  }
  const raw = parts.join(" ");
  return raw.includes("UNIQUE constraint failed") || raw.includes("Já existe um registro com estes dados");
}

export function toBoolean(value: number | boolean): boolean {
  return value === true || value === 1;
}

export function fromBoolean(value: boolean): number {
  return value ? 1 : 0;
}

export interface ContextoFilterResult {
  clause: string;
  params: unknown[];
}

export function buildContextoFilter(
  contexto: ContextoVisualizacao | undefined,
  column = "contexto",
): ContextoFilterResult {
  if (!contexto || contexto === "consolidado") {
    return { clause: "", params: [] };
  }
  return { clause: ` AND ${column} = $CTX`, params: [contexto] };
}

export function buildCategoriaContextoFilter(
  contexto: ContextoVisualizacao | undefined,
): ContextoFilterResult {
  if (!contexto || contexto === "consolidado") {
    return { clause: "", params: [] };
  }
  return {
    clause: " AND (contexto = $CTX OR contexto = 'ambos')",
    params: [contexto],
  };
}

export function applyContextoFilter(
  baseQuery: string,
  filter: ContextoFilterResult,
  paramStartIndex = 1,
): { query: string; params: unknown[] } {
  if (!filter.clause) {
    return { query: baseQuery, params: [] };
  }

  let paramIndex = paramStartIndex;
  const query = baseQuery.replace(/\$CTX/g, () => `$${paramIndex++}`);
  return { query, params: filter.params };
}

export function contextoMatches(
  itemContexto: Contexto,
  visualizacao: ContextoVisualizacao,
): boolean {
  if (visualizacao === "consolidado") return true;
  return itemContexto === visualizacao;
}

export function categoriaContextoMatches(
  categoriaContexto: Contexto | "ambos",
  visualizacao: ContextoVisualizacao,
): boolean {
  if (visualizacao === "consolidado") return true;
  return categoriaContexto === visualizacao || categoriaContexto === "ambos";
}

export function categoriaAplicaAoLancamento(
  categoriaContexto: Contexto | "ambos",
  lancamentoContexto: Contexto,
): boolean {
  return categoriaContexto === lancamentoContexto || categoriaContexto === "ambos";
}

export function sameEntityId(
  a: number | string | null | undefined,
  b: number | string | null | undefined,
): boolean {
  if (a == null || b == null) return false;
  return Number(a) === Number(b);
}

export function nowIso(): string {
  return new Date().toISOString();
}

export function todayIsoDate(): string {
  return new Date().toISOString().slice(0, 10);
}
