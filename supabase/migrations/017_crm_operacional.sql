-- CRM operacional: scoring, histórico, notas, aprovações e automações.

ALTER TABLE public.leads
  ADD COLUMN IF NOT EXISTS responsavel_id uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS ticket_estimado numeric(12, 2),
  ADD COLUMN IF NOT EXISTS status_pipeline_alterado_em timestamptz;

UPDATE public.leads
SET status_pipeline_alterado_em = coalesce(atualizado_em, criado_em, now())
WHERE status_pipeline_alterado_em IS NULL;

ALTER TABLE public.leads
  ALTER COLUMN status_pipeline_alterado_em SET DEFAULT now(),
  ALTER COLUMN status_pipeline_alterado_em SET NOT NULL;

CREATE OR REPLACE FUNCTION public.crm_usuario_privilegiado()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.profiles
    WHERE id = auth.uid() AND role IN ('admin', 'proprietario')
  );
$$;

GRANT EXECUTE ON FUNCTION public.crm_usuario_privilegiado() TO authenticated;

CREATE OR REPLACE FUNCTION public.calcular_score_lead(
  p_utm_source text,
  p_origem text,
  p_email text,
  p_whatsapp text,
  p_num_pessoas int,
  p_data_entrada date,
  p_ticket_estimado numeric
) RETURNS int
LANGUAGE plpgsql
STABLE
AS $$
DECLARE
  v_score int := 0;
  v_dias int;
BEGIN
  v_score := v_score + CASE
    WHEN lower(coalesce(nullif(p_utm_source, ''), p_origem, '')) IN ('instagram', 'facebook', 'meta', 'google', 'cpc', 'ads') THEN 20
    WHEN lower(coalesce(nullif(p_utm_source, ''), p_origem, '')) IN ('whatsapp', 'direct', 'orcamento', 'chat') THEN 15
    ELSE 10
  END;
  v_score := v_score + CASE WHEN nullif(trim(p_email), '') IS NOT NULL THEN 10 ELSE 0 END;
  v_score := v_score + CASE WHEN nullif(regexp_replace(coalesce(p_whatsapp, ''), '\D', '', 'g'), '') IS NOT NULL THEN 10 ELSE 0 END;
  v_score := v_score + LEAST(greatest(coalesce(p_num_pessoas, 1), 1) * 3, 15);

  IF p_data_entrada IS NOT NULL THEN
    v_dias := p_data_entrada - CURRENT_DATE;
    v_score := v_score + CASE
      WHEN v_dias BETWEEN 0 AND 7 THEN 25
      WHEN v_dias BETWEEN 8 AND 30 THEN 18
      WHEN v_dias BETWEEN 31 AND 90 THEN 10
      WHEN v_dias < 0 THEN 2
      ELSE 5
    END;
  ELSE
    v_score := v_score + 5;
  END IF;

  v_score := v_score + CASE
    WHEN coalesce(p_ticket_estimado, 0) >= 10000 THEN 20
    WHEN coalesce(p_ticket_estimado, 0) >= 5000 THEN 15
    WHEN coalesce(p_ticket_estimado, 0) > 0 THEN 8
    ELSE 0
  END;
  RETURN LEAST(v_score, 100);
END;
$$;

CREATE OR REPLACE FUNCTION public.crm_atualizar_score_lead()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    NEW.status_pipeline_alterado_em := coalesce(NEW.status_pipeline_alterado_em, now());
  ELSIF NEW.status_pipeline IS DISTINCT FROM OLD.status_pipeline THEN
    NEW.status_pipeline_alterado_em := now();
  END IF;
  NEW.score := public.calcular_score_lead(
    NEW.utm_source, NEW.origem, NEW.email, NEW.whatsapp,
    NEW.num_pessoas, NEW.data_entrada, NEW.ticket_estimado
  );
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_crm_score_lead_insert ON public.leads;
DROP TRIGGER IF EXISTS trg_crm_score_lead_update ON public.leads;
DROP TRIGGER IF EXISTS trg_crm_score_lead ON public.leads;
CREATE TRIGGER trg_crm_score_lead
BEFORE INSERT OR UPDATE ON public.leads
FOR EACH ROW EXECUTE FUNCTION public.crm_atualizar_score_lead();

UPDATE public.leads
SET score = public.calcular_score_lead(
  utm_source, origem, email, whatsapp, num_pessoas, data_entrada, ticket_estimado
);

CREATE TABLE IF NOT EXISTS public.leads_historico (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  lead_id uuid NOT NULL REFERENCES public.leads(id) ON DELETE CASCADE,
  tipo_evento text NOT NULL,
  descricao text NOT NULL,
  usuario_id uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  criado_em timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.leads_notas (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  lead_id uuid NOT NULL REFERENCES public.leads(id) ON DELETE CASCADE,
  autor_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE RESTRICT DEFAULT auth.uid(),
  nota text NOT NULL CHECK (length(trim(nota)) BETWEEN 1 AND 5000),
  criado_em timestamptz NOT NULL DEFAULT now()
);

CREATE OR REPLACE FUNCTION public.crm_registrar_historico_lead()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    INSERT INTO public.leads_historico (lead_id, tipo_evento, descricao, usuario_id)
    VALUES (NEW.id, 'lead_criado', 'Lead criado', auth.uid());
  ELSE
    IF NEW.status_pipeline IS DISTINCT FROM OLD.status_pipeline THEN
      INSERT INTO public.leads_historico (lead_id, tipo_evento, descricao, usuario_id)
      VALUES (NEW.id, 'etapa_alterada', 'Etapa: ' || OLD.status_pipeline || ' → ' || NEW.status_pipeline, auth.uid());
    END IF;
    IF NEW.responsavel_id IS DISTINCT FROM OLD.responsavel_id THEN
      INSERT INTO public.leads_historico (lead_id, tipo_evento, descricao, usuario_id)
      VALUES (NEW.id, 'responsavel_alterado', 'Responsável atualizado', auth.uid());
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_crm_historico_lead ON public.leads;
CREATE TRIGGER trg_crm_historico_lead
AFTER INSERT OR UPDATE ON public.leads
FOR EACH ROW EXECUTE FUNCTION public.crm_registrar_historico_lead();

CREATE OR REPLACE FUNCTION public.crm_registrar_nota_historico()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.leads_historico (lead_id, tipo_evento, descricao, usuario_id)
  VALUES (NEW.lead_id, 'nota_adicionada', 'Nota interna adicionada', NEW.autor_id);
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_crm_nota_historico ON public.leads_notas;
CREATE TRIGGER trg_crm_nota_historico
AFTER INSERT ON public.leads_notas
FOR EACH ROW EXECUTE FUNCTION public.crm_registrar_nota_historico();

CREATE TABLE IF NOT EXISTS public.aprovacoes_pendentes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tipo text NOT NULL CHECK (tipo IN ('alteracao_tarifa', 'blackout_dates', 'disponibilidade')),
  descricao text NOT NULL,
  dados jsonb NOT NULL DEFAULT '{}'::jsonb,
  status text NOT NULL DEFAULT 'pendente' CHECK (status IN ('pendente', 'aprovada', 'rejeitada')),
  solicitante_id uuid REFERENCES public.profiles(id) ON DELETE SET NULL DEFAULT auth.uid(),
  resolvido_por uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  criado_em timestamptz NOT NULL DEFAULT now(),
  resolvido_em timestamptz
);

CREATE TABLE IF NOT EXISTS public.lead_mensagens_templates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tipo text NOT NULL CHECK (tipo IN ('lead_parado', 'proposta_sem_resposta', 'pos_estadia')),
  canal text NOT NULL CHECK (canal IN ('whatsapp', 'email')),
  assunto text,
  conteudo text NOT NULL,
  atraso_horas int NOT NULL DEFAULT 24 CHECK (atraso_horas >= 0),
  ativo boolean NOT NULL DEFAULT true,
  atualizado_em timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tipo, canal)
);

CREATE TABLE IF NOT EXISTS public.lead_mensagens_automaticas (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  lead_id uuid REFERENCES public.leads(id) ON DELETE SET NULL,
  reserva_id uuid REFERENCES public.reservas_hospede(id) ON DELETE SET NULL,
  tipo text NOT NULL,
  canal text NOT NULL CHECK (canal IN ('whatsapp', 'email')),
  destinatario text,
  status text NOT NULL DEFAULT 'pendente' CHECK (status IN ('pendente', 'enviado', 'falhou', 'ignorado')),
  erro text,
  enviado_em timestamptz,
  criado_em timestamptz NOT NULL DEFAULT now(),
  chave_idempotencia text NOT NULL UNIQUE
);

CREATE TABLE IF NOT EXISTS public.crm_integracoes_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  lead_id uuid NOT NULL REFERENCES public.leads(id) ON DELETE CASCADE,
  provedor text NOT NULL,
  status text NOT NULL DEFAULT 'pendente' CHECK (status IN ('pendente', 'sincronizado', 'falhou')),
  tentativas int NOT NULL DEFAULT 0,
  proxima_tentativa timestamptz,
  erro text,
  criado_em timestamptz NOT NULL DEFAULT now(),
  atualizado_em timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_leads_historico_lead_data ON public.leads_historico(lead_id, criado_em DESC);
CREATE INDEX IF NOT EXISTS idx_leads_notas_lead_data ON public.leads_notas(lead_id, criado_em DESC);
CREATE INDEX IF NOT EXISTS idx_aprovacoes_status_data ON public.aprovacoes_pendentes(status, criado_em DESC);
CREATE INDEX IF NOT EXISTS idx_crm_sync_retry ON public.crm_integracoes_logs(status, proxima_tentativa);

DO $$
DECLARE
  v_tabela text;
BEGIN
  FOREACH v_tabela IN ARRAY ARRAY[
    'leads_historico', 'leads_notas', 'aprovacoes_pendentes',
    'lead_mensagens_templates', 'lead_mensagens_automaticas', 'crm_integracoes_logs'
  ] LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', v_tabela);
  END LOOP;
END;
$$;

DROP POLICY IF EXISTS "profiles_leitura_crm" ON public.profiles;
CREATE POLICY "profiles_leitura_crm" ON public.profiles
  FOR SELECT TO authenticated USING (public.crm_usuario_privilegiado());

DROP POLICY IF EXISTS "leads_historico_leitura" ON public.leads_historico;
CREATE POLICY "leads_historico_leitura" ON public.leads_historico
  FOR SELECT TO authenticated USING (public.crm_usuario_privilegiado());
DROP POLICY IF EXISTS "leads_notas_leitura" ON public.leads_notas;
CREATE POLICY "leads_notas_leitura" ON public.leads_notas
  FOR SELECT TO authenticated USING (public.crm_usuario_privilegiado());
DROP POLICY IF EXISTS "leads_notas_insercao" ON public.leads_notas;
CREATE POLICY "leads_notas_insercao" ON public.leads_notas
  FOR INSERT TO authenticated WITH CHECK (
    public.crm_usuario_privilegiado() AND autor_id = auth.uid()
  );
DROP POLICY IF EXISTS "aprovacoes_leitura" ON public.aprovacoes_pendentes;
CREATE POLICY "aprovacoes_leitura" ON public.aprovacoes_pendentes
  FOR SELECT TO authenticated USING (public.crm_usuario_privilegiado());
DROP POLICY IF EXISTS "aprovacoes_insercao" ON public.aprovacoes_pendentes;
CREATE POLICY "aprovacoes_insercao" ON public.aprovacoes_pendentes
  FOR INSERT TO authenticated WITH CHECK (
    public.crm_usuario_privilegiado() AND solicitante_id = auth.uid()
  );
DROP POLICY IF EXISTS "aprovacoes_resolucao" ON public.aprovacoes_pendentes;
CREATE POLICY "aprovacoes_resolucao" ON public.aprovacoes_pendentes
  FOR UPDATE TO authenticated
  USING (public.crm_usuario_privilegiado() AND status = 'pendente')
  WITH CHECK (
    public.crm_usuario_privilegiado() AND status IN ('aprovada', 'rejeitada')
    AND resolvido_por = auth.uid()
  );
DROP POLICY IF EXISTS "lead_mensagens_templates_leitura" ON public.lead_mensagens_templates;
CREATE POLICY "lead_mensagens_templates_leitura" ON public.lead_mensagens_templates
  FOR SELECT TO authenticated USING (public.crm_usuario_privilegiado());
DROP POLICY IF EXISTS "lead_mensagens_templates_admin" ON public.lead_mensagens_templates;
CREATE POLICY "lead_mensagens_templates_admin" ON public.lead_mensagens_templates
  FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid() AND p.role = 'admin'))
  WITH CHECK (EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid() AND p.role = 'admin'));
DROP POLICY IF EXISTS "lead_mensagens_automaticas_leitura" ON public.lead_mensagens_automaticas;
CREATE POLICY "lead_mensagens_automaticas_leitura" ON public.lead_mensagens_automaticas
  FOR SELECT TO authenticated USING (public.crm_usuario_privilegiado());
DROP POLICY IF EXISTS "crm_integracoes_logs_leitura" ON public.crm_integracoes_logs;
CREATE POLICY "crm_integracoes_logs_leitura" ON public.crm_integracoes_logs
  FOR SELECT TO authenticated USING (public.crm_usuario_privilegiado());

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_publication WHERE pubname = 'supabase_realtime') THEN
    BEGIN
      ALTER PUBLICATION supabase_realtime ADD TABLE public.leads;
    EXCEPTION WHEN duplicate_object THEN NULL;
    END;
    BEGIN
      ALTER PUBLICATION supabase_realtime ADD TABLE public.reservas_hospede;
    EXCEPTION WHEN duplicate_object THEN NULL;
    END;
  END IF;
END;
$$;

INSERT INTO public.lead_mensagens_templates (tipo, canal, assunto, conteudo, atraso_horas)
VALUES
  ('lead_parado', 'whatsapp', NULL, 'Olá {{nome}}, podemos ajudar com sua hospedagem em {{resort}}?', 24),
  ('lead_parado', 'email', 'Sua hospedagem na HOSPEDAH', 'Olá {{nome}}, podemos ajudar com sua hospedagem em {{resort}}?', 24),
  ('proposta_sem_resposta', 'whatsapp', NULL, 'Olá {{nome}}, ficou alguma dúvida sobre sua proposta para {{resort}}?', 72),
  ('proposta_sem_resposta', 'email', 'Dúvidas sobre sua proposta', 'Olá {{nome}}, podemos ajudar com sua proposta para {{resort}}?', 72),
  ('pos_estadia', 'whatsapp', NULL, 'Olá {{nome}}, como foi sua estadia em {{resort}}? Seu feedback é muito importante.', 24),
  ('pos_estadia', 'email', 'Conte como foi sua estadia', 'Olá {{nome}}, como foi sua estadia em {{resort}}? Seu feedback é muito importante.', 24)
ON CONFLICT (tipo, canal) DO NOTHING;
