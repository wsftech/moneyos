-- Limite de crédito do cartão
ALTER TABLE contas ADD COLUMN limite_credito REAL;

-- Faturas de cartão (ciclos de fechamento)
CREATE TABLE IF NOT EXISTS faturas_cartao (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    conta_id INTEGER NOT NULL,
    mes_referencia TEXT NOT NULL,
    periodo_inicio TEXT NOT NULL,
    periodo_fim TEXT NOT NULL,
    vencimento TEXT NOT NULL,
    total REAL NOT NULL DEFAULT 0,
    valor_pago REAL,
    data_pagamento TEXT,
    status TEXT NOT NULL DEFAULT 'aberta' CHECK (status IN ('aberta', 'fechada', 'paga')),
    transacao_pagamento_id INTEGER,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now')),
    UNIQUE(conta_id, mes_referencia),
    FOREIGN KEY (conta_id) REFERENCES contas (id) ON DELETE CASCADE,
    FOREIGN KEY (transacao_pagamento_id) REFERENCES transacoes (id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_faturas_cartao_conta ON faturas_cartao (conta_id);
CREATE INDEX IF NOT EXISTS idx_faturas_cartao_status ON faturas_cartao (status);

-- Vínculo compras → fatura; pagamento → fatura (evita duplicar no P&L)
ALTER TABLE transacoes ADD COLUMN fatura_cartao_id INTEGER REFERENCES faturas_cartao (id);
ALTER TABLE transacoes ADD COLUMN pagamento_fatura_id INTEGER REFERENCES faturas_cartao (id);

CREATE INDEX IF NOT EXISTS idx_transacoes_fatura_cartao ON transacoes (fatura_cartao_id);
