-- Metas financeiras (reserva, objetivos)
CREATE TABLE IF NOT EXISTS metas_financeiras (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    nome TEXT NOT NULL,
    valor_alvo REAL NOT NULL CHECK (valor_alvo > 0),
    valor_atual REAL NOT NULL DEFAULT 0 CHECK (valor_atual >= 0),
    contexto TEXT NOT NULL CHECK (contexto IN ('pessoal', 'empresa')),
    conta_id INTEGER,
    prazo TEXT,
    cor TEXT NOT NULL DEFAULT '#6366f1',
    ativo INTEGER NOT NULL DEFAULT 1,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now')),
    FOREIGN KEY (conta_id) REFERENCES contas (id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_metas_contexto ON metas_financeiras (contexto);
CREATE INDEX IF NOT EXISTS idx_metas_ativo ON metas_financeiras (ativo);

-- Regras de categorização automática por descrição
CREATE TABLE IF NOT EXISTS regras_categorizacao (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    padrao TEXT NOT NULL,
    categoria_id INTEGER NOT NULL,
    contexto TEXT NOT NULL CHECK (contexto IN ('pessoal', 'empresa', 'ambos')),
    tipo TEXT NOT NULL DEFAULT 'despesa' CHECK (tipo IN ('receita', 'despesa', 'ambos')),
    prioridade INTEGER NOT NULL DEFAULT 0,
    ativo INTEGER NOT NULL DEFAULT 1,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    FOREIGN KEY (categoria_id) REFERENCES categorias (id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_regras_ativo ON regras_categorizacao (ativo);
