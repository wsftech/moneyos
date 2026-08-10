-- Valor previsto das parcelas pendentes passa a usar a parcela de referência (não total/n)
UPDATE financiamento_parcelas
SET valor_previsto = (
  SELECT f.valor_parcela
  FROM financiamentos f
  WHERE f.id = financiamento_parcelas.financiamento_id
)
WHERE status IN ('pendente', 'atrasada');
