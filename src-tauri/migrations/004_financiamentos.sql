-- Financiamentos (empréstimos, parcelamentos)
CREATE TABLE IF NOT EXISTS financiamentos (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    descricao TEXT NOT NULL,
    valor_total REAL NOT NULL CHECK (valor_total >= 0),
    valor_parcela REAL NOT NULL CHECK (valor_parcela >= 0),
    total_parcelas INTEGER NOT NULL CHECK (total_parcelas > 0),
    contexto TEXT NOT NULL CHECK (contexto IN ('pessoal', 'empresa')),
    conta_id INTEGER NOT NULL,
    categoria_id INTEGER,
    data_primeira_parcela TEXT NOT NULL,
    ativo INTEGER NOT NULL DEFAULT 1,
    observacoes TEXT,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now')),
    FOREIGN KEY (conta_id) REFERENCES contas (id) ON DELETE RESTRICT,
    FOREIGN KEY (categoria_id) REFERENCES categorias (id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_financiamentos_contexto ON financiamentos (contexto);
CREATE INDEX IF NOT EXISTS idx_financiamentos_conta_id ON financiamentos (conta_id);
CREATE INDEX IF NOT EXISTS idx_financiamentos_categoria_id ON financiamentos (categoria_id);

-- Parcelas de cada financiamento
CREATE TABLE IF NOT EXISTS financiamento_parcelas (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    financiamento_id INTEGER NOT NULL,
    numero_parcela INTEGER NOT NULL,
    valor_previsto REAL NOT NULL CHECK (valor_previsto >= 0),
    vencimento TEXT NOT NULL,
    valor_pago REAL,
    data_pagamento TEXT,
    status TEXT NOT NULL DEFAULT 'pendente' CHECK (status IN ('pendente', 'paga', 'atrasada')),
    transacao_id INTEGER,
    observacoes TEXT,
    FOREIGN KEY (financiamento_id) REFERENCES financiamentos (id) ON DELETE CASCADE,
    FOREIGN KEY (transacao_id) REFERENCES transacoes (id) ON DELETE SET NULL,
    UNIQUE (financiamento_id, numero_parcela)
);

CREATE INDEX IF NOT EXISTS idx_financiamento_parcelas_financiamento ON financiamento_parcelas (financiamento_id);
CREATE INDEX IF NOT EXISTS idx_financiamento_parcelas_vencimento ON financiamento_parcelas (vencimento);
CREATE INDEX IF NOT EXISTS idx_financiamento_parcelas_status ON financiamento_parcelas (status);
