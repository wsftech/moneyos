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
