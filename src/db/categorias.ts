import { getDatabase } from "./connection";
import {
  applyContextoFilter,
  buildCategoriaContextoFilter,
  sameEntityId,
  withDatabase,
} from "./utils";
import type {
  Categoria,
  Contexto,
  ContextoCategoria,
  ContextoVisualizacao,
  TipoCategoria,
} from "../types";

export interface CategoriaInput {
  nome: string;
  tipo: TipoCategoria;
  contexto: ContextoCategoria;
  cor: string;
  icone?: string | null;
}

interface CategoriaRow {
  id: number;
  nome: string;
  tipo: TipoCategoria;
  contexto: ContextoCategoria;
  cor: string;
  icone: string | null;
}

function mapCategoria(row: CategoriaRow): Categoria {
  return row;
}

export async function listCategorias(contexto?: ContextoVisualizacao): Promise<Categoria[]> {
  return withDatabase(async () => {
    const db = await getDatabase();
    const filter = buildCategoriaContextoFilter(contexto);
    const { query, params } = applyContextoFilter(
      `SELECT * FROM categorias WHERE 1=1${filter.clause} ORDER BY nome ASC`,
      filter,
    );
    const rows = await db.select<CategoriaRow[]>(query, params);
    return rows.map(mapCategoria);
  });
}

export function findCategoriaById(
  categorias: Categoria[],
  id: number | string | null | undefined,
): Categoria | undefined {
  if (id == null) return undefined;
  return categorias.find((c) => sameEntityId(c.id, id));
}

export function filtrarCategoriasParaLancamento(
  categorias: Categoria[],
  lancamentoContexto: Contexto,
  tipo?: TipoCategoria,
): Categoria[] {
  return categorias.filter(
    (c) =>
      (c.contexto === lancamentoContexto || c.contexto === "ambos") &&
      (tipo == null || c.tipo === tipo),
  );
}

export async function getCategoria(id: number): Promise<Categoria | null> {
  return withDatabase(async () => {
    const db = await getDatabase();
    const rows = await db.select<CategoriaRow[]>("SELECT * FROM categorias WHERE id = $1", [id]);
    return rows[0] ? mapCategoria(rows[0]) : null;
  });
}

export async function createCategoria(input: CategoriaInput): Promise<Categoria> {
  const categoria = await withDatabase(async () => {
    const db = await getDatabase();
    const result = await db.execute(
      `INSERT INTO categorias (nome, tipo, contexto, cor, icone)
       VALUES ($1, $2, $3, $4, $5)`,
      [input.nome, input.tipo, input.contexto, input.cor, input.icone ?? null],
    );
    const created = await getCategoria(result.lastInsertId as number);
    if (!created) {
      throw new Error("Falha ao criar categoria");
    }
    return created;
  });

  // Envelopes em toda a faixa conhecida (meses passados com dados + horizonte futuro).
  const { garantirOrcamentosCategoriaEmFaixa } = await import("./orcamentos");
  await garantirOrcamentosCategoriaEmFaixa(categoria);

  return categoria;
}

export async function updateCategoria(
  id: number,
  input: Partial<CategoriaInput>,
): Promise<Categoria> {
  return withDatabase(async () => {
    const existing = await getCategoria(id);
    if (!existing) {
      throw new Error("Categoria não encontrada");
    }

    const db = await getDatabase();
    await db.execute(
      `UPDATE categorias
       SET nome = $1, tipo = $2, contexto = $3, cor = $4, icone = $5
       WHERE id = $6`,
      [
        input.nome ?? existing.nome,
        input.tipo ?? existing.tipo,
        input.contexto ?? existing.contexto,
        input.cor ?? existing.cor,
        input.icone !== undefined ? input.icone : existing.icone,
        id,
      ],
    );

    const categoria = await getCategoria(id);
    if (!categoria) {
      throw new Error("Falha ao atualizar categoria");
    }
    return categoria;
  });
}

export type ImpactoExclusaoCategoria = {
  orcamentos: number;
  orcamentoRecorrentes: number;
  regras: number;
  transacoes: number;
  emprestimos: number;
  financiamentos: number;
  contasPagarReceber: number;
  transacoesRecorrentes: number;
};

async function countWhere(
  table: string,
  categoriaId: number,
): Promise<number> {
  const db = await getDatabase();
  const rows = await db.select<{ c: number }[]>(
    `SELECT COUNT(*) AS c FROM ${table} WHERE categoria_id = $1`,
    [categoriaId],
  );
  return Number(rows[0]?.c ?? 0);
}

/** Conta o que será removido ou desvinculado ao excluir a categoria. */
export async function getImpactoExclusaoCategoria(
  id: number,
): Promise<ImpactoExclusaoCategoria> {
  return withDatabase(async () => ({
    orcamentos: await countWhere("orcamentos", id),
    orcamentoRecorrentes: await countWhere("orcamento_recorrentes", id),
    regras: await countWhere("regras_categorizacao", id),
    transacoes: await countWhere("transacoes", id),
    emprestimos: await countWhere("emprestimos", id),
    financiamentos: await countWhere("financiamentos", id),
    contasPagarReceber: await countWhere("contas_a_pagar_receber", id),
    transacoesRecorrentes: await countWhere("transacoes_recorrentes", id),
  }));
}

/**
 * Exclui a categoria e os orçamentos/regras ligados a ela.
 * Lançamentos (transações, dívidas etc.) permanecem, sem a categoria.
 */
export async function deleteCategoria(id: number): Promise<void> {
  return withDatabase(async () => {
    const db = await getDatabase();

    // orcamento_recorrentes usa ON DELETE RESTRICT — precisa limpar antes.
    await db.execute(
      `UPDATE orcamentos SET recorrente_id = NULL
       WHERE recorrente_id IN (SELECT id FROM orcamento_recorrentes WHERE categoria_id = $1)`,
      [id],
    );
    await db.execute("DELETE FROM orcamento_recorrentes WHERE categoria_id = $1", [id]);
    await db.execute("DELETE FROM orcamentos WHERE categoria_id = $1", [id]);
    await db.execute("DELETE FROM regras_categorizacao WHERE categoria_id = $1", [id]);

    await db.execute("UPDATE transacoes SET categoria_id = NULL WHERE categoria_id = $1", [id]);
    await db.execute("UPDATE emprestimos SET categoria_id = NULL WHERE categoria_id = $1", [id]);
    await db.execute("UPDATE financiamentos SET categoria_id = NULL WHERE categoria_id = $1", [id]);
    await db.execute(
      "UPDATE contas_a_pagar_receber SET categoria_id = NULL WHERE categoria_id = $1",
      [id],
    );
    await db.execute(
      "UPDATE transacoes_recorrentes SET categoria_id = NULL WHERE categoria_id = $1",
      [id],
    );

    await db.execute("DELETE FROM categorias WHERE id = $1", [id]);
  });
}

export type TipoCategoriaDivida = "financiamento" | "emprestimo" | "parcelamento";

const CATEGORIA_DIVIDA_PADRAO: Record<
  TipoCategoriaDivida,
  { nome: string; cor: string; chave: string }
> = {
  financiamento: { nome: "Financiamentos", cor: "#64748b", chave: "financiamento" },
  emprestimo: { nome: "Empréstimos", cor: "#78716c", chave: "emprestimo" },
  parcelamento: { nome: "Parcelamentos", cor: "#a16207", chave: "parcelamento" },
};

/** Normaliza "Financiamento(s)" / "Empréstimo(s)" para a mesma chave. */
export function chaveNomeCategoriaDivida(nome: string): string {
  return nome
    .toLowerCase()
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .replace(/[^a-z]/g, "")
    .replace(/s$/, "");
}

export function isNomeCategoriaCartoesCredito(nome: string): boolean {
  const compact = nome
    .toLowerCase()
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .replace(/[^a-z]/g, "");
  return (
    compact.includes("cartoesdecredito") ||
    compact.includes("cartaodecredito") ||
    compact.includes("cartoescredito") ||
    compact.includes("cartaocredito")
  );
}

export function findCategoriaCartoesCreditoNaLista(
  categorias: Categoria[],
  contexto?: Contexto,
): Categoria | null {
  const matches = categorias.filter(
    (c) =>
      c.tipo === "despesa" &&
      isNomeCategoriaCartoesCredito(c.nome) &&
      (!contexto || c.contexto === contexto || c.contexto === "ambos"),
  );
  if (matches.length === 0) return null;
  matches.sort((a, b) => b.nome.length - a.nome.length || a.id - b.id);
  return matches[0];
}

/** Localiza categoria de dívida existente (singular/plural). Não cria nada. */
export async function findCategoriaDivida(
  tipo: TipoCategoriaDivida,
  contexto: Contexto,
): Promise<Categoria | null> {
  const chave = CATEGORIA_DIVIDA_PADRAO[tipo].chave;
  const existentes = await listCategorias(contexto);
  const matches = existentes.filter(
    (c) =>
      c.tipo === "despesa" &&
      (c.contexto === contexto || c.contexto === "ambos") &&
      chaveNomeCategoriaDivida(c.nome) === chave,
  );
  if (matches.length === 0) return null;
  // Prefere o nome que o usuário manteve (ex.: "Financiamentos" > "Financiamento")
  matches.sort((a, b) => b.nome.length - a.nome.length || a.id - b.id);
  return matches[0];
}

/**
 * Garante categoria padrão só quando ainda não existe nenhuma no mesmo “ramo”
 * (Financiamento/Financiamentos). Evita recriar após exclusão intencional se
 * o usuário já cadastrou outra com nome equivalente.
 */
export async function ensureCategoriaDivida(
  tipo: TipoCategoriaDivida,
  contexto: Contexto,
): Promise<Categoria> {
  const found = await findCategoriaDivida(tipo, contexto);
  if (found) return found;
  const padrao = CATEGORIA_DIVIDA_PADRAO[tipo];
  return createCategoria({
    nome: padrao.nome,
    tipo: "despesa",
    contexto,
    cor: padrao.cor,
  });
}

/** Garante a categoria de despesa "Impostos" no contexto empresa. */
export async function ensureCategoriaImpostos(): Promise<Categoria> {
  const cats = await listCategorias("empresa");
  const found = cats.find(
    (c) =>
      c.tipo === "despesa" &&
      (c.contexto === "empresa" || c.contexto === "ambos") &&
      c.nome.trim().toLowerCase() === "impostos",
  );
  if (found) return found;
  return createCategoria({
    nome: "Impostos",
    tipo: "despesa",
    contexto: "empresa",
    cor: "#ef4444",
  });
}

/**
 * Associa dívidas sem categoria a uma categoria do mesmo ramo, se existir.
 * Não recria categorias excluídas — evita “Financiamento” voltar sozinho.
 */
export async function backfillCategoriasDividasSemCategoria(
  contexto?: ContextoVisualizacao,
): Promise<number> {
  const { getDatabase } = await import("./connection");
  const { garantirOrcamentoCategoriaMes } = await import("./orcamentos");

  return withDatabase(async () => {
    const db = await getDatabase();
    const filterFin = contexto && contexto !== "consolidado" ? " AND contexto = $1" : "";
    const params = contexto && contexto !== "consolidado" ? [contexto] : [];

    const fins = await db.select<
      { id: number; contexto: Contexto; descricao: string; valor_parcela: number }[]
    >(
      `SELECT id, contexto, descricao, valor_parcela FROM financiamentos
       WHERE ativo = 1 AND categoria_id IS NULL${filterFin}`,
      params,
    );
    const emps = await db.select<
      {
        id: number;
        contexto: Contexto;
        descricao: string;
        valor_parcela: number;
        modalidade: string | null;
      }[]
    >(
      `SELECT id, contexto, descricao, valor_parcela, modalidade FROM emprestimos
       WHERE ativo = 1 AND categoria_id IS NULL${filterFin}`,
      params,
    );

    let atualizados = 0;

    for (const f of fins) {
      const cat = await findCategoriaDivida("financiamento", f.contexto);
      if (!cat) continue;
      await db.execute("UPDATE financiamentos SET categoria_id = $1 WHERE id = $2", [
        cat.id,
        f.id,
      ]);
      await garantirOrcamentoCategoriaMes(cat);
      atualizados++;
    }
    for (const e of emps) {
      const tipoCat: TipoCategoriaDivida =
        e.modalidade === "parcelamento" ? "parcelamento" : "emprestimo";
      const cat = await findCategoriaDivida(tipoCat, e.contexto);
      if (!cat) continue;
      await db.execute("UPDATE emprestimos SET categoria_id = $1 WHERE id = $2", [
        cat.id,
        e.id,
      ]);
      await garantirOrcamentoCategoriaMes(cat);
      atualizados++;
    }
    return atualizados;
  });
}
