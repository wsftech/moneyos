-- Empréstimos (pessoal / banco)
CREATE TABLE IF NOT EXISTS emprestimos (
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

CREATE INDEX IF NOT EXISTS idx_emprestimos_contexto ON emprestimos (contexto);
CREATE INDEX IF NOT EXISTS idx_emprestimos_conta_id ON emprestimos (conta_id);
CREATE INDEX IF NOT EXISTS idx_emprestimos_categoria_id ON emprestimos (categoria_id);

CREATE TABLE IF NOT EXISTS emprestimo_parcelas (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    emprestimo_id INTEGER NOT NULL,
    numero_parcela INTEGER NOT NULL,
    valor_previsto REAL NOT NULL CHECK (valor_previsto >= 0),
    vencimento TEXT NOT NULL,
    valor_pago REAL,
    data_pagamento TEXT,
    status TEXT NOT NULL DEFAULT 'pendente' CHECK (status IN ('pendente', 'paga', 'atrasada')),
    transacao_id INTEGER,
    observacoes TEXT,
    FOREIGN KEY (emprestimo_id) REFERENCES emprestimos (id) ON DELETE CASCADE,
    FOREIGN KEY (transacao_id) REFERENCES transacoes (id) ON DELETE SET NULL,
    UNIQUE (emprestimo_id, numero_parcela)
);

CREATE INDEX IF NOT EXISTS idx_emprestimo_parcelas_emprestimo ON emprestimo_parcelas (emprestimo_id);
CREATE INDEX IF NOT EXISTS idx_emprestimo_parcelas_vencimento ON emprestimo_parcelas (vencimento);
CREATE INDEX IF NOT EXISTS idx_emprestimo_parcelas_status ON emprestimo_parcelas (status);
