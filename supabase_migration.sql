-- Migração: tabela de dados do HOSPEDA-SISTEMA
-- Execute este script no SQL Editor do seu projeto Supabase:
-- https://supabase.com/dashboard/project/ydrmjoppjxtmnwtvtinb/sql

-- ============================================================
-- 1. TABELA PRINCIPAL DE SINCRONIZAÇÃO (já existente)
-- ============================================================
CREATE TABLE IF NOT EXISTS hospeda_data (
  id            uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id       uuid        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  chave         text        NOT NULL,
  valor         jsonb,
  atualizado_em timestamptz DEFAULT now(),
  UNIQUE(user_id, chave)
);

ALTER TABLE hospeda_data ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "acesso_proprio" ON hospeda_data;

CREATE POLICY "acesso_proprio"
  ON hospeda_data
  FOR ALL
  TO authenticated
  USING  (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- ============================================================
-- 2. ACOMODAÇÕES — listagem pública de imóveis
-- ============================================================
CREATE TABLE IF NOT EXISTS acomodacoes (
  id              uuid          PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id        uuid          REFERENCES auth.users(id) ON DELETE SET NULL,
  nome            text          NOT NULL,
  descricao       text,
  tipo            text          NOT NULL DEFAULT 'resort',  -- resort, apartamento, casa, chalé
  cidade          text          NOT NULL,
  estado          text          NOT NULL DEFAULT 'SP',
  endereco        text,
  latitude        numeric(10,7),
  longitude       numeric(10,7),
  capacidade      int           NOT NULL DEFAULT 2,
  quartos         int           NOT NULL DEFAULT 1,
  banheiros       int           NOT NULL DEFAULT 1,
  preco_base      numeric(10,2) NOT NULL DEFAULT 0,
  comodidades     text[]        DEFAULT '{}',
  fotos           text[]        DEFAULT '{}',  -- URLs das fotos
  ativa           boolean       NOT NULL DEFAULT true,
  criado_em       timestamptz   DEFAULT now(),
  atualizado_em   timestamptz   DEFAULT now()
);

ALTER TABLE acomodacoes ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "acomodacoes_leitura_publica" ON acomodacoes;
DROP POLICY IF EXISTS "acomodacoes_escrita_owner" ON acomodacoes;

CREATE POLICY "acomodacoes_leitura_publica"
  ON acomodacoes FOR SELECT USING (ativa = true);

CREATE POLICY "acomodacoes_escrita_owner"
  ON acomodacoes FOR ALL TO authenticated
  USING (auth.uid() = owner_id)
  WITH CHECK (auth.uid() = owner_id);

-- ============================================================
-- 3. RESERVAS DE HÓSPEDES — solicitações públicas de reserva
-- ============================================================
CREATE TABLE IF NOT EXISTS reservas_hospede (
  id              uuid          PRIMARY KEY DEFAULT gen_random_uuid(),
  acomodacao_id   uuid          REFERENCES acomodacoes(id) ON DELETE CASCADE,
  nome_hospede    text          NOT NULL,
  email_hospede   text          NOT NULL,
  telefone        text,
  data_entrada    date          NOT NULL,
  data_saida      date          NOT NULL,
  num_hospedes    int           NOT NULL DEFAULT 1,
  valor_total     numeric(10,2),
  status          text          NOT NULL DEFAULT 'pendente', -- pendente, confirmada, cancelada, concluida
  mensagem        text,
  resort_nome     text,         -- nome do resort selecionado (texto livre)
  criado_em       timestamptz   DEFAULT now(),
  atualizado_em   timestamptz   DEFAULT now()
);

ALTER TABLE reservas_hospede ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "reservas_hospede_insercao_publica" ON reservas_hospede;
DROP POLICY IF EXISTS "reservas_hospede_leitura_owner" ON reservas_hospede;

-- Qualquer visitante pode criar uma solicitação de reserva
CREATE POLICY "reservas_hospede_insercao_publica"
  ON reservas_hospede FOR INSERT WITH CHECK (true);

-- Apenas donos autenticados lêem todas; hóspede pode ver a própria pelo id
CREATE POLICY "reservas_hospede_leitura_owner"
  ON reservas_hospede FOR SELECT TO authenticated USING (true);

-- ============================================================
-- 4. DISPONIBILIDADE — datas bloqueadas por acomodação
-- ============================================================
CREATE TABLE IF NOT EXISTS disponibilidade (
  id              uuid          PRIMARY KEY DEFAULT gen_random_uuid(),
  acomodacao_id   uuid          REFERENCES acomodacoes(id) ON DELETE CASCADE,
  resort_nome     text,         -- para uso sem acomodacao_id (modo texto)
  data_bloqueada  date          NOT NULL,
  motivo          text          DEFAULT 'reservado',
  criado_em       timestamptz   DEFAULT now()
);

ALTER TABLE disponibilidade ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "disponibilidade_leitura_publica" ON disponibilidade;
DROP POLICY IF EXISTS "disponibilidade_escrita_auth" ON disponibilidade;

CREATE POLICY "disponibilidade_leitura_publica"
  ON disponibilidade FOR SELECT USING (true);

CREATE POLICY "disponibilidade_escrita_auth"
  ON disponibilidade FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- ============================================================
-- 5. AVALIAÇÕES — reviews de hóspedes
-- ============================================================
CREATE TABLE IF NOT EXISTS avaliacoes (
  id              uuid          PRIMARY KEY DEFAULT gen_random_uuid(),
  acomodacao_id   uuid          REFERENCES acomodacoes(id) ON DELETE SET NULL,
  resort_nome     text,         -- nome do resort (texto livre)
  nome_hospede    text          NOT NULL,
  email_hospede   text,
  nota            numeric(2,1)  NOT NULL CHECK (nota >= 1 AND nota <= 5),
  comentario      text,
  aprovada        boolean       NOT NULL DEFAULT false, -- moderação
  criado_em       timestamptz   DEFAULT now()
);

ALTER TABLE avaliacoes ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "avaliacoes_leitura_publica" ON avaliacoes;
DROP POLICY IF EXISTS "avaliacoes_insercao_publica" ON avaliacoes;
DROP POLICY IF EXISTS "avaliacoes_moderacao_auth" ON avaliacoes;

CREATE POLICY "avaliacoes_leitura_publica"
  ON avaliacoes FOR SELECT USING (aprovada = true);

CREATE POLICY "avaliacoes_insercao_publica"
  ON avaliacoes FOR INSERT WITH CHECK (true);

CREATE POLICY "avaliacoes_moderacao_auth"
  ON avaliacoes FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- ============================================================
-- 6. MENSAGENS — chat hóspede ↔ anfitrião (Supabase Realtime)
-- ============================================================
CREATE TABLE IF NOT EXISTS mensagens (
  id              uuid          PRIMARY KEY DEFAULT gen_random_uuid(),
  conversa_id     text          NOT NULL, -- ex: "reserva_<uuid>" ou "hospede_<email>"
  remetente       text          NOT NULL, -- "hospede" | "anfitriao"
  nome_remetente  text          NOT NULL,
  conteudo        text          NOT NULL,
  lida            boolean       NOT NULL DEFAULT false,
  criado_em       timestamptz   DEFAULT now()
);

ALTER TABLE mensagens ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "mensagens_insercao_publica" ON mensagens;
DROP POLICY IF EXISTS "mensagens_leitura_conversa" ON mensagens;

CREATE POLICY "mensagens_insercao_publica"
  ON mensagens FOR INSERT WITH CHECK (true);

CREATE POLICY "mensagens_leitura_conversa"
  ON mensagens FOR SELECT USING (true);

-- Habilitar Realtime para a tabela mensagens
ALTER PUBLICATION supabase_realtime ADD TABLE mensagens;

-- ============================================================
-- 7. PREÇOS DINÂMICOS — por período/temporada
-- ============================================================
CREATE TABLE IF NOT EXISTS precos_dinamicos (
  id              uuid          PRIMARY KEY DEFAULT gen_random_uuid(),
  acomodacao_id   uuid          REFERENCES acomodacoes(id) ON DELETE CASCADE,
  resort_nome     text,
  tipo_regra      text          NOT NULL DEFAULT 'temporada_alta', -- temporada_alta, temporada_baixa, valor_dia, promocao
  nome_periodo    text          NOT NULL, -- ex: "Réveillon", "Julho", "Baixa temporada"
  data_inicio     date          NOT NULL,
  data_fim        date          NOT NULL,
  preco_noite     numeric(10,2) NOT NULL,
  desconto_percentual numeric(5,2),
  multiplicador   numeric(4,2)  DEFAULT 1.0, -- fator sobre o preço base
  criado_em       timestamptz   DEFAULT now()
);

-- Compatibilidade para bases já existentes
ALTER TABLE precos_dinamicos ADD COLUMN IF NOT EXISTS tipo_regra text;
UPDATE precos_dinamicos SET tipo_regra = 'temporada_alta' WHERE tipo_regra IS NULL;
ALTER TABLE precos_dinamicos ALTER COLUMN tipo_regra SET DEFAULT 'temporada_alta';
ALTER TABLE precos_dinamicos ALTER COLUMN tipo_regra SET NOT NULL;
ALTER TABLE precos_dinamicos ADD COLUMN IF NOT EXISTS desconto_percentual numeric(5,2);
ALTER TABLE precos_dinamicos ADD COLUMN IF NOT EXISTS num_dormitorios int DEFAULT NULL; -- NULL = aplica a todos, 1 = 1 dormitório, 2 = 2 dormitórios

ALTER TABLE precos_dinamicos ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "precos_leitura_publica" ON precos_dinamicos;
DROP POLICY IF EXISTS "precos_escrita_auth" ON precos_dinamicos;

CREATE POLICY "precos_leitura_publica"
  ON precos_dinamicos FOR SELECT USING (true);

CREATE POLICY "precos_escrita_auth"
  ON precos_dinamicos FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- ============================================================
-- 8. ÍNDICES para performance
-- ============================================================
CREATE INDEX IF NOT EXISTS idx_disponibilidade_data     ON disponibilidade(resort_nome, data_bloqueada);
CREATE INDEX IF NOT EXISTS idx_reservas_hospede_resort  ON reservas_hospede(resort_nome, status);
CREATE INDEX IF NOT EXISTS idx_avaliacoes_resort        ON avaliacoes(resort_nome, aprovada);
CREATE INDEX IF NOT EXISTS idx_mensagens_conversa       ON mensagens(conversa_id, criado_em);
CREATE INDEX IF NOT EXISTS idx_precos_periodo           ON precos_dinamicos(resort_nome, data_inicio, data_fim);
