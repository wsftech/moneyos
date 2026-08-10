export interface LancamentoOfx {
  fitid: string;
  data: string;
  valor: number;
  tipo: "receita" | "despesa";
  descricao: string;
  trntype: string | null;
}

function extractTag(block: string, tag: string): string | null {
  const sgml = new RegExp(`<${tag}>([^<\\r\\n]+)`, "i");
  const sgmlMatch = block.match(sgml);
  if (sgmlMatch) return sgmlMatch[1].trim();

  const xml = new RegExp(`<${tag}>([^<]*)</${tag}>`, "i");
  const xmlMatch = block.match(xml);
  return xmlMatch ? xmlMatch[1].trim() : null;
}

export function parseOfxDate(raw: string): string | null {
  const match = raw.trim().match(/^(\d{4})(\d{2})(\d{2})/);
  if (!match) return null;
  return `${match[1]}-${match[2]}-${match[3]}`;
}

function inferTipo(trnType: string | null, amount: number): "receita" | "despesa" {
  const t = (trnType ?? "").toUpperCase();
  if (t === "CREDIT" || t === "DEP" || t === "INT" || t === "DIV") return "receita";
  if (t === "DEBIT" || t === "PAYMENT" || t === "FEE" || t === "SRVCHG" || t === "ATM") {
    return "despesa";
  }
  return amount >= 0 ? "receita" : "despesa";
}

function parseStmtTrnBlock(block: string): LancamentoOfx | null {
  const fitid = extractTag(block, "FITID");
  const dtPosted = extractTag(block, "DTPOSTED");
  const trnAmtRaw = extractTag(block, "TRNAMT");
  if (!fitid || !dtPosted || trnAmtRaw == null) return null;

  const data = parseOfxDate(dtPosted);
  const amount = parseFloat(trnAmtRaw.replace(",", "."));
  if (!data || isNaN(amount) || amount === 0) return null;

  const trntype = extractTag(block, "TRNTYPE");
  const tipo = inferTipo(trntype, amount);
  const memo = extractTag(block, "MEMO");
  const name = extractTag(block, "NAME");
  const descricao = (memo || name || trntype || "Lançamento OFX").trim();

  return {
    fitid,
    data,
    valor: Math.abs(amount),
    tipo,
    descricao,
    trntype,
  };
}

export function parseOfx(conteudo: string): LancamentoOfx[] {
  const normalized = conteudo.replace(/\r\n/g, "\n");
  const blocks = normalized.split(/<STMTTRN>/i).slice(1);
  const lancamentos: LancamentoOfx[] = [];
  const fitids = new Set<string>();

  for (const block of blocks) {
    const parsed = parseStmtTrnBlock(block);
    if (!parsed || fitids.has(parsed.fitid)) continue;
    fitids.add(parsed.fitid);
    lancamentos.push(parsed);
  }

  return lancamentos.sort((a, b) => a.data.localeCompare(b.data) || a.fitid.localeCompare(b.fitid));
}

export function intervaloOfx(lancamentos: LancamentoOfx[]): { inicio: string; fim: string } | null {
  if (lancamentos.length === 0) return null;
  const datas = lancamentos.map((l) => l.data).sort();
  return { inicio: datas[0], fim: datas[datas.length - 1] };
}
