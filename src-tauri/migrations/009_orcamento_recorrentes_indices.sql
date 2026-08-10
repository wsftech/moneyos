-- Permite múltiplos itens recorrentes por categoria e orçamentos manuais + recorrentes no mesmo mês

DROP INDEX IF EXISTS idx_orcamentos_unique;

CREATE UNIQUE INDEX IF NOT EXISTS idx_orcamentos_categoria_mes
    ON orcamentos (categoria_id, contexto, mes_referencia)
    WHERE recorrente_id IS NULL;

-- SQLite não remove UNIQUE inline; recria a tabela sem a restrição por categoria/contexto
CREATE TABLE orcamento_recorrentes_new (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    descricao TEXT NOT NULL,
    categoria_id INTEGER NOT NULL,
    contexto TEXT NOT NULL CHECK (contexto IN ('pessoal', 'empresa')),
    valor_limite REAL NOT NULL CHECK (valor_limite >= 0),
    ativo INTEGER NOT NULL DEFAULT 1,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now')),
    FOREIGN KEY (categoria_id) REFERENCES categorias (id) ON DELETE RESTRICT
);

INSERT INTO orcamento_recorrentes_new SELECT * FROM orcamento_recorrentes;

DROP TABLE orcamento_recorrentes;

ALTER TABLE orcamento_recorrentes_new RENAME TO orcamento_recorrentes;

CREATE INDEX IF NOT EXISTS idx_orcamento_recorrentes_contexto ON orcamento_recorrentes (contexto);
