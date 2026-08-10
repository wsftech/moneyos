-- Vincula transferências entre contextos (ex.: pró-labore)
ALTER TABLE transacoes ADD COLUMN transacao_vinculada_id INTEGER REFERENCES transacoes (id) ON DELETE SET NULL;

-- Direção em transferências internas (saida | entrada)
ALTER TABLE transacoes ADD COLUMN transferencia_papel TEXT CHECK (transferencia_papel IN ('saida', 'entrada'));

CREATE INDEX IF NOT EXISTS idx_transacoes_vinculada ON transacoes (transacao_vinculada_id);
