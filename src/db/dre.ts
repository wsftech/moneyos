import { getDatabase } from "./connection";
import {
  applyContextoFilter,
  buildContextoFilter,
  withDatabase,
} from "./utils";
import type { ContextoVisualizacao, DreSimplificada } from "../types";
import { arredondarMoeda } from "../utils/format";

const GRUPO_CATEGORIA_SQL = `
  CASE
    WHEN t.categoria_id IS NOT NULL THEN t.categoria_id
    WHEN t.transacao_vinculada_id IS NOT NULL AND v.contexto = 'pessoal' THEN -1
    WHEN t.transacao_vinculada_id IS NOT NULL AND v.contexto = 'empresa' THEN -2
    ELSE NULL
  END
`;

function sqlExcluirTransferenciaCrossContext(
  contexto: ContextoVisualizacao | undefined,
  alias = "transacoes",
): string {
  if (!contexto || contexto === "consolidado") return "";
  return ` AND NOT (
    ${alias}.tipo = 'transferencia'
    AND ${alias}.transacao_vinculada_id IS NOT NULL
    AND EXISTS (
      SELECT 1 FROM transacoes v
      WHERE v.id = ${alias}.transacao_vinculada_id
        AND v.contexto != ${alias}.contexto
    )
  )`;
}

async function totaisPorTipo(
  mesReferencia: string,
  tipo: "receita" | "despesa",
  contexto?: ContextoVisualizacao,
): Promise<{ categoria_id: number | null; nome: string; cor: string; total: number }[]> {
  return withDatabase(async () => {
    const db = await getDatabase();
    const filter = buildContextoFilter(contexto, "t.contexto");
    const { query: baseQuery, params } = applyContextoFilter(
      `SELECT ${GRUPO_CATEGORIA_SQL} AS categoria_id,
              CASE
                WHEN t.categoria_id IS NOT NULL THEN MAX(c.nome)
                WHEN t.transacao_vinculada_id IS NOT NULL AND v.contexto = 'pessoal' THEN 'Transferência → pessoal'
                WHEN t.transacao_vinculada_id IS NOT NULL AND v.contexto = 'empresa' THEN 'Transferência → empresa'
                ELSE 'Sem categoria'
              END AS nome,
              CASE
                WHEN t.categoria_id IS NOT NULL THEN MAX(c.cor)
                WHEN t.transacao_vinculada_id IS NOT NULL THEN '#a78bfa'
                ELSE '#94a3b8'
              END AS cor,
              SUM(t.valor) AS total
       FROM transacoes t
       LEFT JOIN categorias c ON CAST(c.id AS INTEGER) = CAST(t.categoria_id AS INTEGER)
       LEFT JOIN transacoes v ON v.id = t.transacao_vinculada_id
       WHERE t.status = 'efetivado'
         AND t.tipo = $TIPO
         AND t.data LIKE $MES${filter.clause}${sqlExcluirTransferenciaCrossContext(contexto, "t")}
       GROUP BY ${GRUPO_CATEGORIA_SQL}
       ORDER BY total DESC`,
      filter,
      2,
    );
    const query = baseQuery.replace("$TIPO", "$1").replace("$MES", "$2");
    const rows = await db.select<
      { categoria_id: number | string | null; nome: string; cor: string; total: number | string }[]
    >(query, [tipo, `${mesReferencia}%`, ...params]);

    return rows.map((r) => ({
      categoria_id: r.categoria_id != null ? Number(r.categoria_id) : null,
      nome: r.nome,
      cor: r.cor,
      total: Number(r.total),
    }));
  });
}

export async function getDreSimplificada(
  mesReferencia: string,
  contexto?: ContextoVisualizacao,
): Promise<DreSimplificada> {
  const [receitas, despesas] = await Promise.all([
    totaisPorTipo(mesReferencia, "receita", contexto),
    totaisPorTipo(mesReferencia, "despesa", contexto),
  ]);

  const total_receitas = arredondarMoeda(receitas.reduce((s, r) => s + r.total, 0));
  const total_despesas = arredondarMoeda(despesas.reduce((s, d) => s + d.total, 0));

  return {
    receitas,
    despesas,
    total_receitas,
    total_despesas,
    resultado: arredondarMoeda(total_receitas - total_despesas),
  };
}
