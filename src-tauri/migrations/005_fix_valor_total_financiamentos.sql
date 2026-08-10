-- Corrige valor_total a partir da soma real das parcelas
UPDATE financiamentos
SET valor_total = (
    SELECT COALESCE(SUM(valor_previsto), 0)
    FROM financiamento_parcelas
    WHERE financiamento_id = financiamentos.id
)
WHERE EXISTS (
    SELECT 1 FROM financiamento_parcelas fp WHERE fp.financiamento_id = financiamentos.id
);
