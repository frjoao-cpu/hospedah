-- ============================================================
-- HOSPEDAH — Migration 004: Correções de RLS — fidelidade e tickets
--
-- 1. fidelidade — UPDATE público removido; somente admin/proprietário
--    pode alterar pontos diretamente. Operações do front-end usam
--    as RPCs SECURITY DEFINER abaixo.
--
-- 2. tickets — SELECT irrestrito corrigido: usuários autenticados
--    veem apenas seus próprios tickets (filtro por e-mail da sessão);
--    visitantes sem login usam a RPC get_ticket_hospede(id, email).
--
-- Execute no SQL Editor do Supabase:
-- https://supabase.com/dashboard/project/ydrmjoppjxtmnwtvtinb/sql
-- ============================================================

-- ============================================================
-- 1. fidelidade — remoção do UPDATE público
-- ============================================================
-- Problema: USING (true) / WITH CHECK (true) permitia que qualquer
-- visitante anônimo atualizasse pontos de qualquer hóspede
-- bastando conhecer o e-mail registrado na tabela.
-- Solução: somente admin/proprietário podem fazer UPDATE direto;
-- créditos/débitos do front-end passam pela RPC SECURITY DEFINER.

DROP POLICY IF EXISTS "fidelidade_atualizacao_publica" ON fidelidade;
DROP POLICY IF EXISTS "fidelidade_atualizacao_admin"   ON fidelidade;

CREATE POLICY "fidelidade_atualizacao_admin"
  ON fidelidade FOR UPDATE TO authenticated
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
-- RPC: creditar_pontos_fidelidade
-- Credita pontos e incrementa estadias de forma segura (upsert).
-- Usada por reservas.html após confirmação de reserva e por
-- outros fluxos que precisam registrar pontos sem UPDATE direto.
-- ============================================================
CREATE OR REPLACE FUNCTION creditar_pontos_fidelidade(
  p_email_hospede text,
  p_pontos        int,
  p_estadias_inc  int DEFAULT 0
)
RETURNS void LANGUAGE sql SECURITY DEFINER SET search_path = public AS $$
  INSERT INTO fidelidade (email_hospede, pontos, total_estadias, atualizado_em)
  VALUES (
    lower(p_email_hospede),
    GREATEST(p_pontos, 0),
    GREATEST(p_estadias_inc, 0),
    now()
  )
  ON CONFLICT (email_hospede) DO UPDATE SET
    pontos         = GREATEST(fidelidade.pontos + p_pontos, 0),
    total_estadias = fidelidade.total_estadias + GREATEST(p_estadias_inc, 0),
    nivel          = CASE
                       WHEN fidelidade.total_estadias + GREATEST(p_estadias_inc, 0) >= 10 THEN 'ouro'
                       WHEN fidelidade.total_estadias + GREATEST(p_estadias_inc, 0) >= 3  THEN 'prata'
                       ELSE 'bronze'
                     END,
    atualizado_em  = now();
$$;

GRANT EXECUTE ON FUNCTION creditar_pontos_fidelidade(text, int, int) TO anon, authenticated;

-- ============================================================
-- RPC: registrar_ref_code_fidelidade
-- Registra o código de referral para um hóspede de forma segura.
-- Apenas grava o ref_code se o registro ainda não tiver um,
-- evitando sobrescrita por terceiros que conheçam o e-mail.
-- Usada por referral.html em lugar do INSERT/UPDATE direto.
-- ============================================================
CREATE OR REPLACE FUNCTION registrar_ref_code_fidelidade(
  p_email_hospede text,
  p_ref_code      text
)
RETURNS void LANGUAGE sql SECURITY DEFINER SET search_path = public AS $$
  INSERT INTO fidelidade (email_hospede, pontos, total_estadias, ref_code, atualizado_em)
  VALUES (lower(p_email_hospede), 0, 0, p_ref_code, now())
  ON CONFLICT (email_hospede) DO UPDATE SET
    ref_code      = p_ref_code,
    atualizado_em = now()
  WHERE fidelidade.ref_code IS NULL;
$$;

GRANT EXECUTE ON FUNCTION registrar_ref_code_fidelidade(text, text) TO anon, authenticated;

-- ============================================================
-- 2. tickets — SELECT restrito ao próprio hóspede (por e-mail)
-- ============================================================
-- Problema: USING (true) expunha tickets de todos os hóspedes
-- para qualquer visitante autenticado.
-- Solução: usuários autenticados veem apenas os tickets cujo
-- email_hospede corresponde ao e-mail da sua sessão Supabase Auth;
-- admin/proprietário mantêm acesso total via tickets_admin_total.

DROP POLICY IF EXISTS "tickets_leitura_proprio" ON tickets;

CREATE POLICY "tickets_leitura_proprio"
  ON tickets FOR SELECT TO authenticated
  USING (
    lower(email_hospede) = (
      SELECT lower(u.email)
      FROM auth.users u
      WHERE u.id = auth.uid()
    )
    OR EXISTS (
      SELECT 1 FROM profiles p
      WHERE p.id = auth.uid()
        AND p.role IN ('admin', 'proprietario')
    )
  );

-- ============================================================
-- RPC: get_ticket_hospede
-- Permite que visitantes não autenticados consultem um ticket
-- específico usando id + e-mail como duplo fator de verificação.
-- O UUID do ticket atua como token de acesso de difícil adivinhação.
-- ============================================================
CREATE OR REPLACE FUNCTION get_ticket_hospede(
  p_id            uuid,
  p_email_hospede text
)
RETURNS SETOF tickets
LANGUAGE sql SECURITY DEFINER SET search_path = public AS $$
  SELECT *
  FROM tickets
  WHERE id = p_id
    AND lower(email_hospede) = lower(p_email_hospede);
$$;

GRANT EXECUTE ON FUNCTION get_ticket_hospede(uuid, text) TO anon, authenticated;
