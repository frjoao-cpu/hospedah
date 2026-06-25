-- ============================================================
-- HOSPEDAH — Migration 005: Oferta Especial Personalizada
--
-- Cria as tabelas e RPCs necessárias para o fluxo completo de
-- geração, envio, visualização e aceite de ofertas personalizadas.
--
-- Execute no SQL Editor do Supabase:
-- https://supabase.com/dashboard/project/ydrmjoppjxtmnwtvtinb/sql
-- ============================================================

-- ============================================================
-- 1. OFERTAS ESPECIAIS — proposta personalizada por reserva
-- ============================================================
CREATE TABLE IF NOT EXISTS ofertas_especiais (
  id                  uuid          PRIMARY KEY DEFAULT gen_random_uuid(),
  reserva_id          uuid          REFERENCES reservas_hospede(id) ON DELETE SET NULL,
  -- Dados do cliente (cópia na oferta para desacoplar)
  nome_hospede        text          NOT NULL,
  email_hospede       text          NOT NULL,
  telefone            text,
  -- Dados da proposta
  resort_nome         text          NOT NULL,
  acomodacao_tipo     text,
  checkin             date          NOT NULL,
  checkout            date          NOT NULL,
  capacidade          int           NOT NULL DEFAULT 1,
  valor_original      numeric(10,2) NOT NULL,
  desconto_valor      numeric(10,2) NOT NULL DEFAULT 0,
  desconto_percentual numeric(5,2)  GENERATED ALWAYS AS (
    CASE WHEN valor_original > 0
      THEN ROUND((desconto_valor / valor_original) * 100, 2)
      ELSE 0
    END
  ) STORED,
  valor_final         numeric(10,2) GENERATED ALWAYS AS (
    valor_original - desconto_valor
  ) STORED,
  observacoes         text,
  -- Controle
  token               text          NOT NULL UNIQUE,
  validade            timestamptz   NOT NULL,
  versao              int           NOT NULL DEFAULT 1,
  status              text          NOT NULL DEFAULT 'pendente'
                        CHECK (status IN ('pendente','visualizada','aceita','recusada','expirada','contra_proposta')),
  -- Rastreamento
  visualizada_em      timestamptz,
  aceita_em           timestamptz,
  criado_em           timestamptz   DEFAULT now(),
  atualizado_em       timestamptz   DEFAULT now()
);

ALTER TABLE ofertas_especiais ENABLE ROW LEVEL SECURITY;

-- Admin/proprietário pode criar, ler e alterar ofertas
DROP POLICY IF EXISTS "ofertas_escrita_admin" ON ofertas_especiais;
CREATE POLICY "ofertas_escrita_admin"
  ON ofertas_especiais FOR ALL TO authenticated
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
-- 2. CONTRAPROPOSTAS — pedido de ajuste enviado pelo cliente
-- ============================================================
CREATE TABLE IF NOT EXISTS contrapropostas (
  id              uuid          PRIMARY KEY DEFAULT gen_random_uuid(),
  oferta_id       uuid          NOT NULL REFERENCES ofertas_especiais(id) ON DELETE CASCADE,
  nova_checkin    date,
  nova_checkout   date,
  novo_resort     text,
  nova_acomodacao text,
  observacoes     text,
  criado_em       timestamptz   DEFAULT now()
);

ALTER TABLE contrapropostas ENABLE ROW LEVEL SECURITY;

-- Admin/proprietário lê contrapropostas
DROP POLICY IF EXISTS "contrapropostas_leitura_admin" ON contrapropostas;
CREATE POLICY "contrapropostas_leitura_admin"
  ON contrapropostas FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM profiles p
      WHERE p.id = auth.uid()
        AND p.role IN ('admin', 'proprietario')
    )
  );

-- ============================================================
-- 3. ÍNDICES
-- ============================================================
CREATE INDEX IF NOT EXISTS idx_ofertas_token     ON ofertas_especiais(token);
CREATE INDEX IF NOT EXISTS idx_ofertas_reserva   ON ofertas_especiais(reserva_id, versao DESC);
CREATE INDEX IF NOT EXISTS idx_ofertas_status    ON ofertas_especiais(status, validade);
CREATE INDEX IF NOT EXISTS idx_contrapropostas   ON contrapropostas(oferta_id, criado_em DESC);

-- ============================================================
-- 4. RPCs PÚBLICAS — cliente acessa via token (sem auth)
-- ============================================================

-- 4a. Lê oferta pelo token (valida expiração, não expõe outras linhas)
CREATE OR REPLACE FUNCTION get_oferta_por_token(p_token text)
RETURNS TABLE (
  id                  uuid,
  reserva_id          uuid,
  nome_hospede        text,
  resort_nome         text,
  acomodacao_tipo     text,
  checkin             date,
  checkout            date,
  capacidade          int,
  valor_original      numeric,
  desconto_valor      numeric,
  desconto_percentual numeric,
  valor_final         numeric,
  observacoes         text,
  validade            timestamptz,
  versao              int,
  status              text,
  visualizada_em      timestamptz,
  aceita_em           timestamptz,
  criado_em           timestamptz
)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT
    id, reserva_id, nome_hospede, resort_nome, acomodacao_tipo,
    checkin, checkout, capacidade,
    valor_original, desconto_valor, desconto_percentual, valor_final,
    observacoes, validade, versao, status,
    visualizada_em, aceita_em, criado_em
  FROM ofertas_especiais
  WHERE token = p_token
  LIMIT 1;
$$;

GRANT EXECUTE ON FUNCTION get_oferta_por_token(text) TO anon, authenticated;

-- 4b. Registra primeira visualização da oferta
CREATE OR REPLACE FUNCTION registrar_visualizacao_oferta(p_token text)
RETURNS void
LANGUAGE sql SECURITY DEFINER SET search_path = public AS $$
  UPDATE ofertas_especiais
  SET
    visualizada_em = COALESCE(visualizada_em, now()),
    status = CASE
               WHEN status = 'pendente' THEN 'visualizada'
               ELSE status
             END,
    atualizado_em = now()
  WHERE token = p_token
    AND status NOT IN ('aceita', 'expirada');
$$;

GRANT EXECUTE ON FUNCTION registrar_visualizacao_oferta(text) TO anon, authenticated;

-- 4c. Aceite da oferta pelo cliente
CREATE OR REPLACE FUNCTION aceitar_oferta(p_token text)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_oferta ofertas_especiais%ROWTYPE;
BEGIN
  -- Busca e bloqueia a linha para evitar race condition
  SELECT * INTO v_oferta
  FROM ofertas_especiais
  WHERE token = p_token
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'erro', 'Oferta não encontrada.');
  END IF;

  IF v_oferta.validade < now() THEN
    UPDATE ofertas_especiais
    SET status = 'expirada', atualizado_em = now()
    WHERE id = v_oferta.id;
    RETURN jsonb_build_object('ok', false, 'erro', 'Oferta expirada.');
  END IF;

  IF v_oferta.status IN ('aceita', 'expirada', 'recusada') THEN
    RETURN jsonb_build_object('ok', false, 'erro', 'Esta oferta não está mais disponível.');
  END IF;

  UPDATE ofertas_especiais
  SET
    status        = 'aceita',
    aceita_em     = now(),
    atualizado_em = now()
  WHERE id = v_oferta.id;

  -- Atualiza status da reserva original para "oferta_aceita"
  IF v_oferta.reserva_id IS NOT NULL THEN
    UPDATE reservas_hospede
    SET status = 'oferta_aceita', atualizado_em = now()
    WHERE id = v_oferta.reserva_id;
  END IF;

  RETURN jsonb_build_object('ok', true, 'oferta_id', v_oferta.id);
END;
$$;

GRANT EXECUTE ON FUNCTION aceitar_oferta(text) TO anon, authenticated;

-- 4d. Contra-proposta do cliente
CREATE OR REPLACE FUNCTION enviar_contraproposta(
  p_token         text,
  p_nova_checkin  date,
  p_nova_checkout date,
  p_novo_resort   text,
  p_nova_acomoda  text,
  p_observacoes   text
)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_oferta_id uuid;
BEGIN
  SELECT id INTO v_oferta_id
  FROM ofertas_especiais
  WHERE token = p_token
    AND validade >= now()
    AND status NOT IN ('aceita', 'expirada', 'recusada');

  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'erro', 'Oferta não disponível para alteração.');
  END IF;

  INSERT INTO contrapropostas (oferta_id, nova_checkin, nova_checkout, novo_resort, nova_acomodacao, observacoes)
  VALUES (v_oferta_id, p_nova_checkin, p_nova_checkout, p_novo_resort, p_nova_acomoda, p_observacoes);

  UPDATE ofertas_especiais
  SET status = 'contra_proposta', atualizado_em = now()
  WHERE id = v_oferta_id;

  RETURN jsonb_build_object('ok', true);
END;
$$;

GRANT EXECUTE ON FUNCTION enviar_contraproposta(text, date, date, text, text, text) TO anon, authenticated;

-- ============================================================
-- 5. EXPIRAR OFERTAS AUTOMATICAMENTE (chamado via cron ou trigger)
-- ============================================================
CREATE OR REPLACE FUNCTION expirar_ofertas_vencidas()
RETURNS void
LANGUAGE sql SECURITY DEFINER SET search_path = public AS $$
  UPDATE ofertas_especiais
  SET status = 'expirada', atualizado_em = now()
  WHERE validade < now()
    AND status NOT IN ('aceita', 'expirada', 'recusada');
$$;

GRANT EXECUTE ON FUNCTION expirar_ofertas_vencidas() TO authenticated;
