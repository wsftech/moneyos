-- Distingue empréstimo (dinheiro) de parcelamento (carnê / acordo / imposto em vezes).
ALTER TABLE emprestimos ADD COLUMN modalidade TEXT NOT NULL DEFAULT 'emprestimo';

CREATE INDEX IF NOT EXISTS idx_emprestimos_modalidade ON emprestimos (modalidade);
