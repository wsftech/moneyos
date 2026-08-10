-- Saldo inicial válido a partir de uma data
ALTER TABLE contas ADD COLUMN data_saldo_inicial TEXT;

-- Tags / centros de custo
CREATE TABLE IF NOT EXISTS tags (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    nome TEXT NOT NULL,
    contexto TEXT NOT NULL CHECK (contexto IN ('pessoal', 'empresa', 'ambos')),
    cor TEXT NOT NULL DEFAULT '#6366f1',
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    UNIQUE (nome, contexto)
);

CREATE INDEX IF NOT EXISTS idx_tags_contexto ON tags (contexto);

CREATE TABLE IF NOT EXISTS transacao_tags (
    transacao_id INTEGER NOT NULL REFERENCES transacoes (id) ON DELETE CASCADE,
    tag_id INTEGER NOT NULL REFERENCES tags (id) ON DELETE CASCADE,
    PRIMARY KEY (transacao_id, tag_id)
);

CREATE INDEX IF NOT EXISTS idx_transacao_tags_tag ON transacao_tags (tag_id);

-- Preferências de lembretes (JSON simples)
CREATE TABLE IF NOT EXISTS app_config (
    chave TEXT PRIMARY KEY,
    valor TEXT NOT NULL
);

INSERT OR IGNORE INTO app_config (chave, valor) VALUES ('lembretes_ativos', 'true');
INSERT OR IGNORE INTO app_config (chave, valor) VALUES ('lembretes_dias', '3');
