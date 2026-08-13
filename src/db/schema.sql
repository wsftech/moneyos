-- Espelho da migration inicial (src-tauri/migrations/001_initial.sql)
-- Usado como referência no frontend; migrations são aplicadas pelo plugin SQL no Rust.

-- Tabela: contas (bancos, carteiras, cartões)
CREATE TABLE IF NOT EXISTS contas (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    nome TEXT NOT NULL,
    tipo TEXT NOT NULL CHECK (tipo IN ('banco', 'dinheiro', 'cartao_credito', 'poupanca', 'investimento')),
    contexto TEXT NOT NULL CHECK (contexto IN ('pessoal', 'empresa')),
    saldo_inicial REAL NOT NULL DEFAULT 0,
    cor TEXT NOT NULL DEFAULT '#6366f1',
    icone TEXT,
    logo_path TEXT,
    ativo INTEGER NOT NULL DEFAULT 1
);

CREATE INDEX IF NOT EXISTS idx_contas_contexto ON contas (contexto);

-- Tabela: categorias
CREATE TABLE IF NOT EXISTS categorias (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    nome TEXT NOT NULL,
    tipo TEXT NOT NULL CHECK (tipo IN ('receita', 'despesa')),
    contexto TEXT NOT NULL CHECK (contexto IN ('pessoal', 'empresa', 'ambos')),
    cor TEXT NOT NULL DEFAULT '#6366f1',
    icone TEXT
);

CREATE INDEX IF NOT EXISTS idx_categorias_contexto ON categorias (contexto);

-- Tabela: transações
CREATE TABLE IF NOT EXISTS transacoes (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    descricao TEXT NOT NULL,
    valor REAL NOT NULL CHECK (valor >= 0),
    data TEXT NOT NULL,
    tipo TEXT NOT NULL CHECK (tipo IN ('receita', 'despesa', 'transferencia')),
    conta_id INTEGER NOT NULL,
    categoria_id INTEGER,
    contexto TEXT NOT NULL CHECK (contexto IN ('pessoal', 'empresa')),
    status TEXT NOT NULL DEFAULT 'efetivado' CHECK (status IN ('efetivado', 'pendente')),
    anexo_path TEXT,
    observacoes TEXT,
    transacao_vinculada_id INTEGER,
    transferencia_papel TEXT CHECK (transferencia_papel IN ('saida', 'entrada')),
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now')),
    FOREIGN KEY (conta_id) REFERENCES contas (id) ON DELETE RESTRICT,
    FOREIGN KEY (categoria_id) REFERENCES categorias (id) ON DELETE SET NULL,
    FOREIGN KEY (transacao_vinculada_id) REFERENCES transacoes (id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_transacoes_contexto ON transacoes (contexto);
CREATE INDEX IF NOT EXISTS idx_transacoes_data ON transacoes (data);
CREATE INDEX IF NOT EXISTS idx_transacoes_conta_id ON transacoes (conta_id);
CREATE INDEX IF NOT EXISTS idx_transacoes_categoria_id ON transacoes (categoria_id);

-- Tabela: contas a pagar/receber
CREATE TABLE IF NOT EXISTS contas_a_pagar_receber (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    descricao TEXT NOT NULL,
    valor REAL NOT NULL CHECK (valor >= 0),
    vencimento TEXT NOT NULL,
    tipo TEXT NOT NULL CHECK (tipo IN ('pagar', 'receber')),
    contexto TEXT NOT NULL CHECK (contexto IN ('pessoal', 'empresa')),
    status TEXT NOT NULL DEFAULT 'pendente' CHECK (status IN ('pendente', 'pago', 'atrasado')),
    transacao_id INTEGER,
    FOREIGN KEY (transacao_id) REFERENCES transacoes (id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_contas_a_pagar_receber_contexto ON contas_a_pagar_receber (contexto);
CREATE INDEX IF NOT EXISTS idx_contas_a_pagar_receber_vencimento ON contas_a_pagar_receber (vencimento);
CREATE INDEX IF NOT EXISTS idx_contas_a_pagar_receber_status ON contas_a_pagar_receber (status);

-- Tabela: orçamentos
CREATE TABLE IF NOT EXISTS orcamentos (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    categoria_id INTEGER NOT NULL,
    contexto TEXT NOT NULL CHECK (contexto IN ('pessoal', 'empresa')),
    mes_referencia TEXT NOT NULL,
    valor_limite REAL NOT NULL CHECK (valor_limite >= 0),
    FOREIGN KEY (categoria_id) REFERENCES categorias (id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_orcamentos_contexto ON orcamentos (contexto);
CREATE INDEX IF NOT EXISTS idx_orcamentos_mes_referencia ON orcamentos (mes_referencia);
CREATE UNIQUE INDEX IF NOT EXISTS idx_orcamentos_unique ON orcamentos (categoria_id, contexto, mes_referencia);

-- Tabela: ativos manuais (patrimônio fora do banco)
CREATE TABLE IF NOT EXISTS ativos_manuais (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  descricao TEXT NOT NULL,
  valor REAL NOT NULL CHECK (valor >= 0),
  contexto TEXT NOT NULL CHECK (contexto IN ('pessoal', 'empresa')),
  observacoes TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_ativos_manuais_contexto ON ativos_manuais(contexto);

-- Tabela: configurações (persistência de preferências do app)
CREATE TABLE IF NOT EXISTS configuracoes (
    chave TEXT PRIMARY KEY,
    valor TEXT NOT NULL
);
