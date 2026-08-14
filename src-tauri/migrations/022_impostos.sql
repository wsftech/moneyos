-- Guias de impostos (visão empresa): DAS, FGTS, etc.
CREATE TABLE IF NOT EXISTS impostos (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    tipo_tributo TEXT NOT NULL,
    descricao TEXT NOT NULL,
    valor REAL NOT NULL CHECK (valor >= 0),
    competencia TEXT NOT NULL,
    vencimento TEXT NOT NULL,
    contexto TEXT NOT NULL CHECK (contexto IN ('pessoal', 'empresa')) DEFAULT 'empresa',
    status TEXT NOT NULL CHECK (status IN ('pendente', 'pago', 'atrasado')) DEFAULT 'pendente',
    categoria_id INTEGER REFERENCES categorias(id) ON DELETE SET NULL,
    transacao_id INTEGER REFERENCES transacoes(id) ON DELETE SET NULL,
    codigo_guia TEXT,
    observacoes TEXT,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_impostos_contexto ON impostos(contexto);
CREATE INDEX IF NOT EXISTS idx_impostos_vencimento ON impostos(vencimento);
CREATE INDEX IF NOT EXISTS idx_impostos_status ON impostos(status);
CREATE INDEX IF NOT EXISTS idx_impostos_competencia ON impostos(competencia);
CREATE INDEX IF NOT EXISTS idx_impostos_categoria_comp ON impostos(categoria_id, contexto, competencia);
