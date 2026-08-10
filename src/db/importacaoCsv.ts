import { listCategorias } from "./categorias";
import { createTransacao, type TransacaoInput } from "./transacoes";
import { resolverCategoriaPorDescricao } from "./regrasCategorizacao";
import type { Contexto, ContextoVisualizacao } from "../types";

export interface LinhaImportacaoCsv {
  data: string;
  descricao: string;
  tipo: "receita" | "despesa";
  valor: number;
  categoria_nome?: string;
  contexto?: Contexto;
}

export interface ResultadoImportacaoCsv {
  importados: number;
  ignorados: number;
  erros: string[];
}

function parseCsvLine(line: string): string[] {
  const result: string[] = [];
  let current = "";
  let inQuotes = false;

  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') {
      inQuotes = !inQuotes;
      continue;
    }
    if (ch === "," && !inQuotes) {
      result.push(current.trim());
      current = "";
      continue;
    }
    current += ch;
  }
  result.push(current.trim());
  return result;
}

function normalizarData(raw: string): string | null {
  const trimmed = raw.trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) return trimmed;
  const br = trimmed.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
  if (br) return `${br[3]}-${br[2]}-${br[1]}`;
  return null;
}

function normalizarTipo(raw: string): "receita" | "despesa" | null {
  const t = raw.trim().toLowerCase();
  if (t === "receita" || t === "entrada") return "receita";
  if (t === "despesa" || t === "saida" || t === "saída") return "despesa";
  return null;
}

export function parseCsvTransacoes(conteudo: string): LinhaImportacaoCsv[] {
  const lines = conteudo
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean);
  if (lines.length === 0) return [];

  const header = parseCsvLine(lines[0]).map((h) => h.toLowerCase());
  const hasHeader = header.some((h) => h.includes("data") || h.includes("descri"));
  const startIdx = hasHeader ? 1 : 0;

  const idxData = hasHeader ? header.findIndex((h) => h.includes("data")) : 0;
  const idxDesc = hasHeader
    ? header.findIndex((h) => h.includes("descri"))
    : 1;
  const idxTipo = hasHeader ? header.findIndex((h) => h.includes("tipo")) : 2;
  const idxValor = hasHeader ? header.findIndex((h) => h.includes("valor")) : 3;
  const idxCat = hasHeader ? header.findIndex((h) => h.includes("categoria")) : -1;
  const idxCtx = hasHeader ? header.findIndex((h) => h.includes("contexto")) : -1;

  const rows: LinhaImportacaoCsv[] = [];

  for (let i = startIdx; i < lines.length; i++) {
    const cols = parseCsvLine(lines[i]);
    const data = normalizarData(cols[idxData] ?? "");
    const descricao = cols[idxDesc] ?? "";
    const tipo = normalizarTipo(cols[idxTipo] ?? "despesa");
    const valor = Math.abs(parseFloat(String(cols[idxValor] ?? "0").replace(",", ".")));

    if (!data || !descricao || !tipo || isNaN(valor) || valor <= 0) continue;

    rows.push({
      data,
      descricao,
      tipo,
      valor,
      categoria_nome: idxCat >= 0 ? cols[idxCat] : undefined,
      contexto:
        idxCtx >= 0 && (cols[idxCtx] === "pessoal" || cols[idxCtx] === "empresa")
          ? cols[idxCtx]
          : undefined,
    });
  }

  return rows;
}

export async function importarTransacoesCsv(
  linhas: LinhaImportacaoCsv[],
  contaId: number,
  contextoPadrao: ContextoVisualizacao,
  contextoConta: Contexto,
): Promise<ResultadoImportacaoCsv> {
  const categorias = await listCategorias("consolidado");
  let importados = 0;
  let ignorados = 0;
  const erros: string[] = [];

  for (const [i, linha] of linhas.entries()) {
    try {
      const ctx: Contexto =
        contextoPadrao !== "consolidado"
          ? contextoPadrao
          : linha.contexto ?? contextoConta;

      let categoriaId: number | null = null;
      if (linha.categoria_nome) {
        const cat = categorias.find(
          (c) => c.nome.toLowerCase() === linha.categoria_nome!.toLowerCase(),
        );
        categoriaId = cat?.id ?? null;
      }
      if (!categoriaId) {
        categoriaId = await resolverCategoriaPorDescricao(linha.descricao, ctx, linha.tipo);
      }

      const input: TransacaoInput = {
        descricao: linha.descricao,
        valor: linha.valor,
        data: linha.data,
        tipo: linha.tipo,
        conta_id: contaId,
        categoria_id: categoriaId,
        contexto: ctx,
        status: "efetivado",
      };
      await createTransacao(input);
      importados++;
    } catch (err) {
      ignorados++;
      erros.push(`Linha ${i + 1}: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  return { importados, ignorados, erros };
}
