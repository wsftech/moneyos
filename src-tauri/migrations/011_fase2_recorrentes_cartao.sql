-- Cartão de crédito: ciclo de fatura
ALTER TABLE contas ADD COLUMN dia_fechamento INTEGER;
ALTER TABLE contas ADD COLUMN dia_vencimento INTEGER;

-- Lançamentos recorrentes (aluguel, assinaturas, salários)
CREATE TABLE IF NOT EXISTS transacoes_recorrentes (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    descricao TEXT NOT NULL,
    valor REAL NOT NULL CHECK (valor >= 0),
    tipo TEXT NOT NULL CHECK (tipo IN ('receita', 'despesa')),
    conta_id INTEGER NOT NULL,
    categoria_id INTEGER,
    contexto TEXT NOT NULL CHECK (contexto IN ('pessoal', 'empresa')),
    dia_mes INTEGER NOT NULL CHECK (dia_mes >= 1 AND dia_mes <= 31),
    ativo INTEGER NOT NULL DEFAULT 1,
    observacoes TEXT,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now')),
    FOREIGN KEY (conta_id) REFERENCES contas (id) ON DELETE RESTRICT,
    FOREIGN KEY (categoria_id) REFERENCES categorias (id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_transacoes_recorrentes_contexto ON transacoes_recorrentes (contexto);
CREATE INDEX IF NOT EXISTS idx_transacoes_recorrentes_ativo ON transacoes_recorrentes (ativo);

CREATE TABLE IF NOT EXISTS transacao_recorrente_lancamentos (
    recorrente_id INTEGER NOT NULL,
    mes_referencia TEXT NOT NULL,
    transacao_id INTEGER NOT NULL,
    PRIMARY KEY (recorrente_id, mes_referencia),
    FOREIGN KEY (recorrente_id) REFERENCES transacoes_recorrentes (id) ON DELETE CASCADE,
    FOREIGN KEY (transacao_id) REFERENCES transacoes (id) ON DELETE CASCADE
);
