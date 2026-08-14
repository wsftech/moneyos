-- Alinha exclusão de categoria: orcamento_recorrentes passa a CASCADE.
-- Antes de dropar a tabela antiga, desvincula orçamentos mensais gerados por
-- recorrentes: o DROP dispara ON DELETE SET NULL em orcamentos.recorrente_id e
-- isso viola idx_orcamentos_categoria_mes quando já existe orçamento manual
-- no mesmo (categoria, contexto, mês).

DELETE FROM orcamentos WHERE recorrente_id IS NOT NULL;

CREATE TABLE orcamento_recorrentes_new (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    descricao TEXT NOT NULL,
    categoria_id INTEGER NOT NULL,
    contexto TEXT NOT NULL CHECK (contexto IN ('pessoal', 'empresa')),
    valor_limite REAL NOT NULL CHECK (valor_limite >= 0),
    ativo INTEGER NOT NULL DEFAULT 1,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now')),
    FOREIGN KEY (categoria_id) REFERENCES categorias (id) ON DELETE CASCADE
);

INSERT INTO orcamento_recorrentes_new SELECT * FROM orcamento_recorrentes;

DROP TABLE orcamento_recorrentes;

ALTER TABLE orcamento_recorrentes_new RENAME TO orcamento_recorrentes;

CREATE INDEX IF NOT EXISTS idx_orcamento_recorrentes_contexto ON orcamento_recorrentes (contexto);
