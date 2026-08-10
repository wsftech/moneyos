-- Itens de orçamento recorrentes (ex.: aluguel todo mês)
CREATE TABLE IF NOT EXISTS orcamento_recorrentes (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    descricao TEXT NOT NULL,
    categoria_id INTEGER NOT NULL,
    contexto TEXT NOT NULL CHECK (contexto IN ('pessoal', 'empresa')),
    valor_limite REAL NOT NULL CHECK (valor_limite >= 0),
    ativo INTEGER NOT NULL DEFAULT 1,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now')),
    FOREIGN KEY (categoria_id) REFERENCES categorias (id) ON DELETE RESTRICT,
    UNIQUE (categoria_id, contexto)
);

CREATE INDEX IF NOT EXISTS idx_orcamento_recorrentes_contexto ON orcamento_recorrentes (contexto);

ALTER TABLE orcamentos ADD COLUMN recorrente_id INTEGER REFERENCES orcamento_recorrentes (id) ON DELETE SET NULL;
ALTER TABLE orcamentos ADD COLUMN descricao TEXT;

CREATE UNIQUE INDEX IF NOT EXISTS idx_orcamentos_recorrente_mes
    ON orcamentos (recorrente_id, mes_referencia)
    WHERE recorrente_id IS NOT NULL;
