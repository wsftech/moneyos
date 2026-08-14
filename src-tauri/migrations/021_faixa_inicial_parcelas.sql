-- Parcelas iniciais com valor diferente das demais (ex.: 3× 130,48 e 8× 464,85).
ALTER TABLE financiamentos ADD COLUMN faixa_inicial_qtd INTEGER;
ALTER TABLE financiamentos ADD COLUMN faixa_inicial_valor REAL;

ALTER TABLE emprestimos ADD COLUMN faixa_inicial_qtd INTEGER;
ALTER TABLE emprestimos ADD COLUMN faixa_inicial_valor REAL;
