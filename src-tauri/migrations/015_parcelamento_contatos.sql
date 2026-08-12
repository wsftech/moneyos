-- Parcelamento de compras no cartão (N×)
ALTER TABLE transacoes ADD COLUMN compra_parcelada_id TEXT;
ALTER TABLE transacoes ADD COLUMN parcela_numero INTEGER;
ALTER TABLE transacoes ADD COLUMN parcela_total INTEGER;

CREATE INDEX IF NOT EXISTS idx_transacoes_compra_parcelada
    ON transacoes (compra_parcelada_id);

-- Contatos leves (cliente / fornecedor) para a pagar/receber
CREATE TABLE IF NOT EXISTS contatos (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    nome TEXT NOT NULL,
    tipo TEXT NOT NULL CHECK (tipo IN ('cliente', 'fornecedor', 'ambos')),
    contexto TEXT NOT NULL CHECK (contexto IN ('pessoal', 'empresa', 'ambos')),
    observacoes TEXT,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_contatos_contexto ON contatos (contexto);
CREATE INDEX IF NOT EXISTS idx_contatos_tipo ON contatos (tipo);
CREATE UNIQUE INDEX IF NOT EXISTS idx_contatos_nome_contexto ON contatos (nome, contexto);

ALTER TABLE contas_a_pagar_receber ADD COLUMN contato_id INTEGER
    REFERENCES contatos (id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_contas_pagar_receber_contato
    ON contas_a_pagar_receber (contato_id);
