-- Dígitos finais para identificar o cartão sem guardar o número completo.
ALTER TABLE contas ADD COLUMN final_cartao TEXT;
