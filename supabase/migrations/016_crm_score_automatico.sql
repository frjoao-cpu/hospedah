-- HOSPEDAH CRM — calcula automaticamente o score de leads novos e atualizados.
-- Requer calcular_score_lead(), definida no schema base supabase_migration.sql.

create or replace function public.crm_atualizar_score_lead()
returns trigger
language plpgsql
as $$
begin
  new.score := public.calcular_score_lead(
    new.utm_source,
    new.resort_nome,
    new.num_pessoas,
    new.data_entrada
  );
  return new;
end;
$$;

drop trigger if exists trg_crm_score_lead_insert on public.leads;
create trigger trg_crm_score_lead_insert
before insert on public.leads
for each row execute function public.crm_atualizar_score_lead();

drop trigger if exists trg_crm_score_lead_update on public.leads;
create trigger trg_crm_score_lead_update
before update of utm_source, resort_nome, num_pessoas, data_entrada on public.leads
for each row execute function public.crm_atualizar_score_lead();

update public.leads
set score = public.calcular_score_lead(utm_source, resort_nome, num_pessoas, data_entrada)
where score = 0;
