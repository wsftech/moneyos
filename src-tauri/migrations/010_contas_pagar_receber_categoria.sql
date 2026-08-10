-- Categoria e mês de referência do orçamento em contas a pagar/receber
ALTER TABLE contas_a_pagar_receber
    ADD COLUMN categoria_id INTEGER REFERENCES categorias (id) ON DELETE SET NULL;

ALTER TABLE contas_a_pagar_receber
    ADD COLUMN mes_referencia TEXT;

CREATE INDEX IF NOT EXISTS idx_contas_a_pagar_receber_categoria
    ON contas_a_pagar_receber (categoria_id, contexto, mes_referencia);
