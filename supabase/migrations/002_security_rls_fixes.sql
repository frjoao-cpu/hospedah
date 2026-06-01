-- ============================================================
-- HOSPEDAH — Migration 002: Correções de RLS
--
-- Aplica políticas de menor privilégio nas tabelas com acesso
-- demasiado permissivo identificadas na auditoria de segurança.
--
-- Execute no SQL Editor do Supabase:
-- https://supabase.com/dashboard/project/ydrmjoppjxtmnwtvtinb/sql
-- ============================================================

-- ============================================================
-- 1. reservas_hospede — SELECT restrito a admin/proprietário
-- ============================================================
-- Problema: qualquer usuário autenticado conseguia ler TODAS as
-- reservas (dados pessoais de todos os hóspedes).
-- Solução: somente admin e proprietario podem fazer SELECT geral.
-- Hóspedes podem consultar a própria reserva via RPC (abaixo).

DROP POLICY IF EXISTS "reservas_hospede_leitura_owner"  ON reservas_hospede;
DROP POLICY IF EXISTS "reservas_hospede_leitura_admin"  ON reservas_hospede;

CREATE POLICY "reservas_hospede_leitura_admin"
  ON reservas_hospede FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM profiles p
      WHERE p.id = auth.uid()
        AND p.role IN ('admin', 'proprietario')
    )
  );

-- RPC pública: hóspede consulta reserva pelo próprio e-mail + id
-- (nenhum dado de terceiro é exposto)
CREATE OR REPLACE FUNCTION get_reserva_hospede(
  p_id             uuid,
  p_email_hospede  text
)
RETURNS SETOF reservas_hospede
LANGUAGE sql SECURITY DEFINER SET search_path = public AS $$
  SELECT *
  FROM reservas_hospede
  WHERE id = p_id
    AND lower(email_hospede) = lower(p_email_hospede);
$$;

GRANT EXECUTE ON FUNCTION get_reserva_hospede(uuid, text) TO anon, authenticated;

-- ============================================================
-- 2. disponibilidade — escrita restrita a admin/proprietário
-- ============================================================
-- Problema: qualquer usuário autenticado podia criar, alterar ou
-- remover bloqueios de disponibilidade de qualquer propriedade.

DROP POLICY IF EXISTS "disponibilidade_escrita_auth"  ON disponibilidade;
DROP POLICY IF EXISTS "disponibilidade_escrita_admin" ON disponibilidade;

CREATE POLICY "disponibilidade_escrita_admin"
  ON disponibilidade FOR ALL TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM profiles p
      WHERE p.id = auth.uid()
        AND p.role IN ('admin', 'proprietario')
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM profiles p
      WHERE p.id = auth.uid()
        AND p.role IN ('admin', 'proprietario')
    )
  );

-- ============================================================
-- 3. precos_dinamicos — escrita restrita a admin/proprietário
-- ============================================================
-- Problema: qualquer usuário autenticado podia criar ou alterar
-- regras de preço de qualquer propriedade.

DROP POLICY IF EXISTS "precos_escrita_auth"  ON precos_dinamicos;
DROP POLICY IF EXISTS "precos_escrita_admin" ON precos_dinamicos;

CREATE POLICY "precos_escrita_admin"
  ON precos_dinamicos FOR ALL TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM profiles p
      WHERE p.id = auth.uid()
        AND p.role IN ('admin', 'proprietario')
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM profiles p
      WHERE p.id = auth.uid()
        AND p.role IN ('admin', 'proprietario')
    )
  );

-- ============================================================
-- 4. mensagens — SELECT restrito; RPC para acesso por conversa
-- ============================================================
-- Problema: a política SELECT USING (true) permitia que qualquer
-- visitante lesse as mensagens de QUALQUER conversa.
-- Solução: somente admin/proprietario via SELECT direto; visitantes
-- usam a RPC get_mensagens_conversa() para acessar uma conversa
-- específica pelo conversa_id (que age como token de acesso).
--
-- ATENÇÃO: o front-end (chat.html) deve migrar para usar a RPC
-- get_mensagens_conversa() em vez de client.from('mensagens').select().
-- O canal Realtime de INSERT/Supabase Broadcast não é afetado.

DROP POLICY IF EXISTS "mensagens_leitura_conversa" ON mensagens;
DROP POLICY IF EXISTS "mensagens_leitura_admin"    ON mensagens;

CREATE POLICY "mensagens_leitura_admin"
  ON mensagens FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM profiles p
      WHERE p.id = auth.uid()
        AND p.role IN ('admin', 'proprietario')
    )
  );

-- RPC pública: retorna mensagens de uma conversa pelo conversa_id.
-- O conversa_id (ex: "reserva_<uuid>" ou "hospede_<token>") funciona
-- como segredo de acesso — quem tem o ID acessa apenas aquela conversa.
CREATE OR REPLACE FUNCTION get_mensagens_conversa(p_conversa_id text)
RETURNS SETOF mensagens
LANGUAGE sql SECURITY DEFINER SET search_path = public AS $$
  SELECT *
  FROM mensagens
  WHERE conversa_id = p_conversa_id
  ORDER BY criado_em ASC;
$$;

GRANT EXECUTE ON FUNCTION get_mensagens_conversa(text) TO anon, authenticated;

-- ============================================================
-- 5. abandono_reserva — UPDATE restrito (evitar adulteração)
-- ============================================================
-- Problema: a política UPDATE WITH CHECK (true) permite que qualquer
-- visitante atualize registros de abandono de outros visitantes.

DROP POLICY IF EXISTS "abandono_upsert_publica" ON abandono_reserva;
DROP POLICY IF EXISTS "abandono_upsert_sessao"  ON abandono_reserva;

-- Apenas a própria sessão (pelo session_id armazenado no cliente)
-- pode atualizar seu registro de abandono.
-- Como a tabela não tem coluna de identificação de user auth,
-- a restrição é feita via RPC para UPSERT seguro.

CREATE OR REPLACE FUNCTION upsert_abandono_reserva(
  p_session_id      text,
  p_resort_nome     text,
  p_email_hospede   text,
  p_telefone        text,
  p_data_entrada    date,
  p_data_saida      date,
  p_valor_estimado  numeric,
  p_ref_code        text
) RETURNS void
LANGUAGE sql SECURITY DEFINER SET search_path = public AS $$
  INSERT INTO abandono_reserva (
    session_id, resort_nome, email_hospede, telefone,
    data_entrada, data_saida, valor_estimado, ref_code,
    atualizado_em
  ) VALUES (
    p_session_id, p_resort_nome, p_email_hospede, p_telefone,
    p_data_entrada, p_data_saida, p_valor_estimado, p_ref_code,
    now()
  )
  ON CONFLICT (session_id) DO UPDATE SET
    resort_nome    = EXCLUDED.resort_nome,
    email_hospede  = EXCLUDED.email_hospede,
    telefone       = EXCLUDED.telefone,
    data_entrada   = EXCLUDED.data_entrada,
    data_saida     = EXCLUDED.data_saida,
    valor_estimado = EXCLUDED.valor_estimado,
    ref_code       = EXCLUDED.ref_code,
    atualizado_em  = now();
$$;

GRANT EXECUTE ON FUNCTION upsert_abandono_reserva(text,text,text,text,date,date,numeric,text)
  TO anon, authenticated;
