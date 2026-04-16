-- Migração: tabela de dados do HOSPEDA-SISTEMA
-- Execute este script no SQL Editor do seu projeto Supabase:
-- https://supabase.com/dashboard/project/ydrmjoppjxtmnwtvtinb/sql

CREATE TABLE IF NOT EXISTS hospeda_data (
  id            uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id       uuid        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  chave         text        NOT NULL,
  valor         jsonb,
  atualizado_em timestamptz DEFAULT now(),
  UNIQUE(user_id, chave)
);

-- Habilita Row Level Security para que cada usuário acesse apenas seus próprios dados
ALTER TABLE hospeda_data ENABLE ROW LEVEL SECURITY;

CREATE POLICY "acesso_proprio"
  ON hospeda_data
  FOR ALL
  TO authenticated
  USING  (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);
