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

-- Habilitar Realtime para a tabela mensagens (idempotente)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND tablename = 'mensagens'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE mensagens;
  END IF;
END $$;

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

-- ============================================================
-- 9. PERFIS DE USUÁRIO — roles e dados extras (vinculados ao Supabase Auth)
-- ============================================================
CREATE TABLE IF NOT EXISTS profiles (
  id              uuid          PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  role            text          NOT NULL DEFAULT 'hospede' CHECK (role IN ('admin', 'proprietario', 'hospede')),
  nome_completo   text,
  telefone        text,
  cidade          text,
  avatar_url      text,
  criado_em       timestamptz   DEFAULT now(),
  atualizado_em   timestamptz   DEFAULT now()
);

ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "profiles_leitura_proprio" ON profiles;
DROP POLICY IF EXISTS "profiles_atualizacao_proprio" ON profiles;
DROP POLICY IF EXISTS "profiles_leitura_admin" ON profiles;

-- Cada usuário lê/atualiza apenas seu próprio perfil
CREATE POLICY "profiles_leitura_proprio"
  ON profiles FOR SELECT TO authenticated
  USING (auth.uid() = id);

CREATE POLICY "profiles_atualizacao_proprio"
  ON profiles FOR UPDATE TO authenticated
  USING (auth.uid() = id) WITH CHECK (auth.uid() = id);

-- Função auxiliar SECURITY DEFINER para verificar se o usuário atual é admin.
-- Necessário para evitar recursão infinita ao referenciar profiles dentro de
-- uma policy de profiles (PostgreSQL detecta a recursão e gera erro).
-- Segurança: a função só retorna true/false sem expor dados, e SET search_path = public
-- impede ataques de sequestro de search_path. O owner da função deve ser o dono do schema.
CREATE OR REPLACE FUNCTION is_admin_user()
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin');
$$;

-- Concede permissão de execução à função para usuários autenticados.
-- Necessário para que as policies que chamam is_admin_user() funcionem corretamente.
GRANT EXECUTE ON FUNCTION is_admin_user() TO authenticated;

-- Admin pode ler todos os perfis (usa função SECURITY DEFINER para evitar recursão)
CREATE POLICY "profiles_leitura_admin"
  ON profiles FOR SELECT TO authenticated
  USING (is_admin_user());

-- Trigger: criar perfil automaticamente ao criar usuário
CREATE OR REPLACE FUNCTION handle_new_user()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  INSERT INTO public.profiles (id, role, nome_completo)
  VALUES (new.id, 'hospede', new.raw_user_meta_data->>'full_name')
  ON CONFLICT (id) DO NOTHING;
  RETURN new;
END;
$$;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE PROCEDURE handle_new_user();

-- ============================================================
-- 10. ABANDONO DE RESERVA — rastreio de sessões incompletas
-- ============================================================
CREATE TABLE IF NOT EXISTS abandono_reserva (
  id              uuid          PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id      text          NOT NULL UNIQUE,
  resort_nome     text,
  email_hospede   text,
  telefone        text,
  data_entrada    date,
  data_saida      date,
  valor_estimado  numeric(10,2),
  ref_code        text,
  criado_em       timestamptz   DEFAULT now(),
  atualizado_em   timestamptz   DEFAULT now()
);

ALTER TABLE abandono_reserva ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "abandono_insercao_publica"   ON abandono_reserva;
DROP POLICY IF EXISTS "abandono_upsert_publica"     ON abandono_reserva;

CREATE POLICY "abandono_insercao_publica"
  ON abandono_reserva FOR INSERT WITH CHECK (true);

CREATE POLICY "abandono_upsert_publica"
  ON abandono_reserva FOR UPDATE WITH CHECK (true);

-- ============================================================
-- 11. ATIVIDADE PÚBLICA — prova social anonimizada
-- ============================================================
CREATE TABLE IF NOT EXISTS atividade_publica (
  id              uuid          PRIMARY KEY DEFAULT gen_random_uuid(),
  resort_nome     text          NOT NULL,
  cidade_hospede  text,
  mes_reserva     text,
  criado_em       timestamptz   DEFAULT now()
);

ALTER TABLE atividade_publica ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "atividade_leitura_publica"  ON atividade_publica;
DROP POLICY IF EXISTS "atividade_insercao_publica" ON atividade_publica;

CREATE POLICY "atividade_leitura_publica"
  ON atividade_publica FOR SELECT USING (true);

CREATE POLICY "atividade_insercao_publica"
  ON atividade_publica FOR INSERT WITH CHECK (true);

-- ============================================================
-- 12. FIDELIDADE — pontos de lealdade por hóspede
-- ============================================================
CREATE TABLE IF NOT EXISTS fidelidade (
  id              uuid          PRIMARY KEY DEFAULT gen_random_uuid(),
  email_hospede   text          NOT NULL UNIQUE,
  pontos          int           NOT NULL DEFAULT 0,
  nivel           text          NOT NULL DEFAULT 'bronze' CHECK (nivel IN ('bronze', 'prata', 'ouro')),
  total_estadias  int           NOT NULL DEFAULT 0,
  atualizado_em   timestamptz   DEFAULT now()
);

ALTER TABLE fidelidade ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "fidelidade_leitura_publica"      ON fidelidade;
DROP POLICY IF EXISTS "fidelidade_insercao_publica"     ON fidelidade;
DROP POLICY IF EXISTS "fidelidade_atualizacao_publica"  ON fidelidade;

CREATE POLICY "fidelidade_leitura_publica"
  ON fidelidade FOR SELECT USING (true);

CREATE POLICY "fidelidade_insercao_publica"
  ON fidelidade FOR INSERT WITH CHECK (true);

CREATE POLICY "fidelidade_atualizacao_publica"
  ON fidelidade FOR UPDATE WITH CHECK (true);

-- ============================================================
-- 13. TICKETS DE PÓS-VENDA — ocorrências e chamados
-- ============================================================
CREATE TABLE IF NOT EXISTS tickets (
  id              uuid          PRIMARY KEY DEFAULT gen_random_uuid(),
  reserva_id      uuid          REFERENCES reservas_hospede(id) ON DELETE SET NULL,
  nome_hospede    text          NOT NULL,
  email_hospede   text          NOT NULL,
  resort_nome     text,
  assunto         text          NOT NULL,
  descricao       text,
  status          text          NOT NULL DEFAULT 'aberto' CHECK (status IN ('aberto', 'em_andamento', 'resolvido', 'fechado')),
  prioridade      text          NOT NULL DEFAULT 'media' CHECK (prioridade IN ('baixa', 'media', 'alta', 'urgente')),
  resposta_admin  text,
  criado_em       timestamptz   DEFAULT now(),
  atualizado_em   timestamptz   DEFAULT now()
);

ALTER TABLE tickets ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "tickets_insercao_publica"    ON tickets;
DROP POLICY IF EXISTS "tickets_leitura_proprio"     ON tickets;
DROP POLICY IF EXISTS "tickets_admin_total"         ON tickets;

CREATE POLICY "tickets_insercao_publica"
  ON tickets FOR INSERT WITH CHECK (true);

-- Hóspede vê os seus tickets (por e-mail)
CREATE POLICY "tickets_leitura_proprio"
  ON tickets FOR SELECT USING (true);

-- Admin gerencia tudo
CREATE POLICY "tickets_admin_total"
  ON tickets FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM profiles p WHERE p.id = auth.uid() AND p.role = 'admin'))
  WITH CHECK (EXISTS (SELECT 1 FROM profiles p WHERE p.id = auth.uid() AND p.role = 'admin'));

-- ============================================================
-- 14. NPS PÓS-ESTADIA — avaliação numérica do hóspede
-- ============================================================
CREATE TABLE IF NOT EXISTS nps_respostas (
  id              uuid          PRIMARY KEY DEFAULT gen_random_uuid(),
  reserva_id      uuid          REFERENCES reservas_hospede(id) ON DELETE SET NULL,
  email_hospede   text          NOT NULL,
  resort_nome     text,
  nota            int           NOT NULL CHECK (nota >= 0 AND nota <= 10),
  comentario      text,
  criado_em       timestamptz   DEFAULT now()
);

ALTER TABLE nps_respostas ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "nps_insercao_publica"    ON nps_respostas;
DROP POLICY IF EXISTS "nps_leitura_admin"       ON nps_respostas;

CREATE POLICY "nps_insercao_publica"
  ON nps_respostas FOR INSERT WITH CHECK (true);

CREATE POLICY "nps_leitura_admin"
  ON nps_respostas FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM profiles p WHERE p.id = auth.uid() AND p.role IN ('admin', 'proprietario')));

-- ============================================================
-- 15. COLUNA ref_code em reservas_hospede (indicação viral)
-- ============================================================
ALTER TABLE reservas_hospede ADD COLUMN IF NOT EXISTS ref_code text;

-- ============================================================
-- 16. VIEW DE DEMANDA POR RESORT
-- ============================================================
CREATE OR REPLACE VIEW vw_demanda_resort AS
SELECT
  resort_nome,
  COUNT(*) AS total_reservas
FROM reservas_hospede
WHERE status IN ('pendente', 'confirmada')
  AND criado_em > NOW() - INTERVAL '30 days'
  AND resort_nome IS NOT NULL
GROUP BY resort_nome;

-- ============================================================
-- 17. FUNÇÃO RPC — demanda pública (SECURITY DEFINER para contornar RLS)
-- ============================================================
CREATE OR REPLACE FUNCTION get_demanda_resort()
RETURNS TABLE(resort_nome text, total_reservas bigint)
LANGUAGE sql SECURITY DEFINER SET search_path = public AS $$
  SELECT
    resort_nome,
    COUNT(*)::bigint AS total_reservas
  FROM reservas_hospede
  WHERE status IN ('pendente', 'confirmada')
    AND criado_em > NOW() - INTERVAL '30 days'
    AND resort_nome IS NOT NULL
  GROUP BY resort_nome;
$$;

GRANT EXECUTE ON FUNCTION get_demanda_resort() TO anon, authenticated;

-- ============================================================
-- 18. ÍNDICES ADICIONAIS
-- ============================================================
CREATE INDEX IF NOT EXISTS idx_abandono_session    ON abandono_reserva(session_id);
CREATE INDEX IF NOT EXISTS idx_fidelidade_email    ON fidelidade(email_hospede);
CREATE INDEX IF NOT EXISTS idx_tickets_email       ON tickets(email_hospede, status);
CREATE INDEX IF NOT EXISTS idx_nps_email           ON nps_respostas(email_hospede);
CREATE INDEX IF NOT EXISTS idx_atividade_criado    ON atividade_publica(criado_em DESC);

-- ============================================================
-- 19. LEADS — pipeline de CRM (captados pelo formulário de orçamento e exit-intent)
-- ============================================================
CREATE TABLE IF NOT EXISTS leads (
  id              uuid          PRIMARY KEY DEFAULT gen_random_uuid(),
  nome            text,
  whatsapp        text,
  email           text,
  resort_nome     text,
  num_pessoas     int,
  data_entrada    date,
  data_saida      date,
  observacoes     text,
  origem          text          NOT NULL DEFAULT 'orcamento', -- orcamento, exit_intent, busca, chat
  utm_source      text,
  utm_medium      text,
  utm_campaign    text,
  score           int           NOT NULL DEFAULT 0,  -- lead scoring: 0–100
  status_pipeline text          NOT NULL DEFAULT 'novo'
                                CHECK (status_pipeline IN ('novo','contatado','proposta_enviada','negociacao','fechado','perdido')),
  ref_code        text,
  criado_em       timestamptz   DEFAULT now(),
  atualizado_em   timestamptz   DEFAULT now()
);

ALTER TABLE leads ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "leads_insercao_publica"  ON leads;
DROP POLICY IF EXISTS "leads_leitura_admin"     ON leads;

-- Qualquer visitante pode criar um lead (captura de orçamento/exit-intent)
CREATE POLICY "leads_insercao_publica"
  ON leads FOR INSERT WITH CHECK (true);

-- Apenas administradores lêem e gerenciam leads
CREATE POLICY "leads_leitura_admin"
  ON leads FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM profiles p WHERE p.id = auth.uid() AND p.role IN ('admin', 'proprietario')))
  WITH CHECK (EXISTS (SELECT 1 FROM profiles p WHERE p.id = auth.uid() AND p.role IN ('admin', 'proprietario')));

CREATE INDEX IF NOT EXISTS idx_leads_status   ON leads(status_pipeline, criado_em DESC);
CREATE INDEX IF NOT EXISTS idx_leads_resort   ON leads(resort_nome);
CREATE INDEX IF NOT EXISTS idx_leads_email    ON leads(email);
CREATE INDEX IF NOT EXISTS idx_leads_whatsapp ON leads(whatsapp);

-- ============================================================
-- 20. FUNÇÃO RPC — lead scoring automático
--     Calcula score baseado em: UTM origin, resort escolhido,
--     número de pessoas e proximidade das datas.
-- ============================================================
CREATE OR REPLACE FUNCTION calcular_score_lead(
  p_utm_source   text,
  p_resort_nome  text,
  p_num_pessoas  int,
  p_data_entrada date
) RETURNS int LANGUAGE plpgsql AS $$
DECLARE
  v_score int := 0;
BEGIN
  -- Origem (canal)
  v_score := v_score + CASE
    WHEN lower(p_utm_source) IN ('instagram','facebook','meta') THEN 25
    WHEN lower(p_utm_source) IN ('google','cpc','ads')          THEN 20
    WHEN lower(p_utm_source) IN ('whatsapp','direct')           THEN 15
    ELSE 10
  END;

  -- Resort premium
  v_score := v_score + CASE
    WHEN p_resort_nome ILIKE '%wyndham%' OR p_resort_nome ILIKE '%hot beach%' THEN 20
    WHEN p_resort_nome ILIKE '%juquehy%' OR p_resort_nome ILIKE '%ipioca%'    THEN 18
    ELSE 12
  END;

  -- Grupo (mais pessoas = maior receita potencial)
  v_score := v_score + LEAST(COALESCE(p_num_pessoas, 2) * 3, 20);

  -- Urgência (data próxima = mais urgente)
  v_score := v_score + CASE
    WHEN p_data_entrada IS NOT NULL AND p_data_entrada <= CURRENT_DATE + 14 THEN 20
    WHEN p_data_entrada IS NOT NULL AND p_data_entrada <= CURRENT_DATE + 30 THEN 12
    ELSE 5
  END;

  RETURN LEAST(v_score, 100);
END;
$$;

-- ============================================================
-- 22. FAQ DINÂMICO — perguntas frequentes editáveis pelo painel
-- ============================================================
CREATE TABLE IF NOT EXISTS faq (
  id        uuid    PRIMARY KEY DEFAULT gen_random_uuid(),
  chave     text    NOT NULL UNIQUE,   -- palavra-chave para correspondência (minúsculas)
  label     text    NOT NULL,          -- texto exibido no chip de sugestão
  resposta  text    NOT NULL,          -- resposta enviada ao hóspede (suporta HTML básico e **bold**)
  ativo     boolean NOT NULL DEFAULT true,
  ordem     int     NOT NULL DEFAULT 0,
  criado_em timestamptz DEFAULT now()
);

ALTER TABLE faq ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "faq_leitura_publica" ON faq;
DROP POLICY IF EXISTS "faq_escrita_auth"    ON faq;

CREATE POLICY "faq_leitura_publica"
  ON faq FOR SELECT USING (ativo = true);

CREATE POLICY "faq_escrita_auth"
  ON faq FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- Dados iniciais (espelha o FAQ estático anterior do chat.html)
INSERT INTO faq (chave, label, resposta, ordem) VALUES
  ('como reservar',        'Como reservar?',       'Para reservar, acesse nossa página de <a href="reservas.html" style="color:var(--dourado)">reservas</a>, escolha o resort, selecione as datas disponíveis e preencha seus dados. Nossa equipe confirma em até 2 horas! 📅', 1),
  ('formas de pagamento',  'Formas de pagamento',  'Aceitamos: ⚡ PIX (5% de desconto), 💳 Cartão de crédito (até 12x), 📄 Boleto bancário e 🏦 Transferência. Qual você prefere?', 2),
  ('horário de check-in',  'Horário check-in',     '🔑 Check-in a partir das **14h** e Check-out até as **11h**. Para horários especiais, entre em contato com antecedência que fazemos o possível para acomodar seu pedido!', 3),
  ('opções para criança',  'Para crianças',        '👶 Sim! Temos opções com atividades para crianças, berços disponíveis sob solicitação e parques aquáticos perfeitos para toda a família. Qual resort te interessa?', 4),
  ('cancelamento',         'Cancelamento',         '📋 Nossa política de cancelamento: cancelamentos com mais de 7 dias de antecedência recebem reembolso integral. Entre 3-7 dias, 50% de reembolso. Menos de 3 dias, sem reembolso. Tem alguma reserva específica?', 5),
  ('wifi',                 'Tem Wi-Fi?',           '📶 Sim! Todos os resorts dispõem de Wi-Fi gratuito em quartos e áreas comuns.', 6),
  ('preço',                'Preços',               '💲 Os preços variam por resort e período. Confira nossa página de <a href="busca.html" style="color:var(--dourado)">busca</a> para ver disponibilidade e valores atualizados!', 7),
  ('disponibilidade',      'Disponibilidade',      '🗓️ Para verificar disponibilidade, acesse <a href="reservas.html" style="color:var(--dourado)">reservas</a> e selecione as datas desejadas — o calendário mostrará as datas disponíveis em tempo real.', 8)
ON CONFLICT (chave) DO NOTHING;

CREATE INDEX IF NOT EXISTS idx_faq_ordem ON faq(ativo, ordem);

-- ============================================================
-- 23. LOGS DE IA — histórico de interações com feedback do hóspede
-- ============================================================
CREATE TABLE IF NOT EXISTS ai_logs (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  conversa_id text NOT NULL,
  pergunta    text,
  resposta    text,
  avaliacao   int  CHECK (avaliacao IN (-1, 1)),  -- 1 = útil, -1 = não útil
  criado_em   timestamptz DEFAULT now()
);

ALTER TABLE ai_logs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "ai_logs_insercao_publica"  ON ai_logs;
DROP POLICY IF EXISTS "ai_logs_avaliacao_publica" ON ai_logs;
DROP POLICY IF EXISTS "ai_logs_leitura_admin"     ON ai_logs;

-- Visitantes anônimos podem registrar e avaliar interações com a IA
CREATE POLICY "ai_logs_insercao_publica"
  ON ai_logs FOR INSERT WITH CHECK (true);

CREATE POLICY "ai_logs_avaliacao_publica"
  ON ai_logs FOR UPDATE USING (true) WITH CHECK (true);

-- Apenas administradores lêem os logs completos
CREATE POLICY "ai_logs_leitura_admin"
  ON ai_logs FOR SELECT TO authenticated
  USING (is_admin_user());

CREATE INDEX IF NOT EXISTS idx_ai_logs_conversa  ON ai_logs(conversa_id, criado_em DESC);
CREATE INDEX IF NOT EXISTS idx_ai_logs_avaliacao ON ai_logs(avaliacao) WHERE avaliacao IS NOT NULL;

-- ============================================================
-- 21. DEFINIR PAPEL DO ADMINISTRADOR  ⚠️  OBRIGATÓRIO
-- ============================================================
-- ⚠️  SEM EXECUTAR ESTES COMANDOS O LOGIN NO SISTEMA HOSPEDA
--     SERÁ BLOQUEADO COM "PERFIL NÃO ENCONTRADO" OU "SEM PERMISSÃO".
--
-- Passo 1 – Garante que o usuário admin tenha um perfil (caso tenha
-- sido criado antes do trigger on_auth_user_created existir):
--
--   INSERT INTO profiles (id, role)
--   SELECT id, 'hospede'
--   FROM auth.users
--   WHERE email = 'admin@seu-dominio.com.br'
--   ON CONFLICT (id) DO NOTHING;
--
-- Passo 2 – Define o papel 'admin' para o administrador principal
-- (substitua pelo e-mail real cadastrado no Supabase Auth):
--
--   UPDATE profiles
--   SET role = 'admin'
--   WHERE id = (SELECT id FROM auth.users WHERE email = 'admin@seu-dominio.com.br');
--
-- Para tornar um usuário proprietário em vez de admin:
--
--   INSERT INTO profiles (id, role)
--   SELECT id, 'hospede'
--   FROM auth.users
--   WHERE email = 'proprietario@seu-dominio.com.br'
--   ON CONFLICT (id) DO NOTHING;
--
--   UPDATE profiles
--   SET role = 'proprietario'
--   WHERE id = (SELECT id FROM auth.users WHERE email = 'proprietario@seu-dominio.com.br');
