import { serve } from 'https://deno.land/std@0.224.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { getSupabaseSecretKey, isSupabaseSecretKey } from '../_shared/secret-key.ts';

const headers = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Content-Type': 'application/json',
};

type Lead = {
  id: string;
  nome: string | null;
  email: string | null;
  whatsapp: string | null;
  resort_nome: string | null;
  status_pipeline_alterado_em?: string | null;
};

type Template = {
  id: string;
  tipo: string;
  canal: 'whatsapp' | 'email';
  assunto: string | null;
  conteudo: string;
  atraso_horas: number;
};

function renderTemplate(template: string, lead: Lead): string {
  return template.replace(/\{\{(nome|resort)\}\}/g, (_match, key: string) =>
    key === 'nome' ? lead.nome || 'hóspede' : lead.resort_nome || 'sua hospedagem'
  );
}

serve(async (request: Request) => {
  if (request.method === 'OPTIONS') return new Response('ok', { headers });
  if (request.method !== 'POST') return new Response('Method not allowed', { status: 405, headers });

  const authorization = request.headers.get('authorization') || '';
  const serviceKey = getSupabaseSecretKey();
  if (!isSupabaseSecretKey(authorization.replace(/^Bearer\s+/i, ''))) {
    return new Response(JSON.stringify({ ok: false, error: 'unauthorized' }), { status: 401, headers });
  }

  const supabaseUrl = Deno.env.get('SUPABASE_URL');
  if (!supabaseUrl || !serviceKey) {
    return new Response(JSON.stringify({ ok: false, error: 'supabase_not_configured' }), { status: 500, headers });
  }
  const supabase = createClient(supabaseUrl, serviceKey);
  const webhook = Deno.env.get('CRM_MESSAGING_WEBHOOK');
  const webhookToken = Deno.env.get('CRM_MESSAGING_WEBHOOK_TOKEN');
  const now = Date.now();
  let processed = 0;
  let failed = 0;

  const [templateResult, leadResult, proposalResult, reservationResult] = await Promise.all([
    supabase.from('lead_mensagens_templates').select('*').eq('ativo', true),
    supabase.from('leads').select('id,nome,email,whatsapp,resort_nome,status_pipeline_alterado_em,status_pipeline')
      .in('status_pipeline', ['novo', 'contatado', 'negociacao']).order('status_pipeline_alterado_em').limit(100),
    supabase.from('leads').select('id,nome,email,whatsapp,resort_nome,status_pipeline_alterado_em,status_pipeline')
      .eq('status_pipeline', 'proposta_enviada').order('status_pipeline_alterado_em').limit(100),
    supabase.from('reservas_hospede').select('id,nome_hospede,email_hospede,telefone,resort_nome,data_saida')
      .eq('status', 'concluida').order('data_saida').limit(100),
  ]);
  const queryError = templateResult.error || leadResult.error || proposalResult.error || reservationResult.error;
  if (queryError) return new Response(JSON.stringify({ ok: false, error: 'query_failed' }), { status: 500, headers });

  const templates = (templateResult.data || []) as Template[];
  const eligible: Array<{ template: Template; lead?: Lead; reservaId?: string; destinatario: string }> = [];
  const byType = (type: string, channel: Template['canal']) =>
    templates.find((template) => template.tipo === type && template.canal === channel);
  const addLead = (lead: Lead, type: string, baseTime: string | null) => {
    for (const channel of ['whatsapp', 'email'] as const) {
      const template = byType(type, channel);
      const recipient = channel === 'email' ? lead.email : lead.whatsapp;
      if (!template || !recipient || !baseTime) continue;
      if (new Date(baseTime).getTime() + template.atraso_horas * 3600000 > now) continue;
      eligible.push({ template, lead, destinatario: recipient });
    }
  };
  for (const lead of (leadResult.data || []) as Lead[]) {
    addLead(lead, 'lead_parado', lead.status_pipeline_alterado_em || null);
  }
  for (const lead of (proposalResult.data || []) as Lead[]) {
    addLead(lead, 'proposta_sem_resposta', lead.status_pipeline_alterado_em || null);
  }
  const today = new Date();
  for (const reserva of reservationResult.data || []) {
    if (!reserva.data_saida) continue;
    for (const channel of ['whatsapp', 'email'] as const) {
      const template = byType('pos_estadia', channel);
      const recipient = channel === 'email' ? reserva.email_hospede : reserva.telefone;
      if (!template || !recipient) continue;
      const eligibleAt = new Date(reserva.data_saida + 'T00:00:00Z').getTime() + template.atraso_horas * 3600000;
      if (eligibleAt <= today.getTime()) {
        eligible.push({
          template,
          reservaId: reserva.id,
          lead: { id: reserva.id, nome: reserva.nome_hospede, email: reserva.email_hospede, whatsapp: reserva.telefone, resort_nome: reserva.resort_nome },
          destinatario: recipient,
        });
      }
    }
  }

  for (const item of eligible) {
    const reference = item.reservaId || item.lead!.id;
    const key = `${item.template.tipo}:${item.template.canal}:${reference}`;
    const insert = await supabase.from('lead_mensagens_automaticas').insert({
      lead_id: item.reservaId ? null : item.lead!.id,
      reserva_id: item.reservaId || null,
      tipo: item.template.tipo,
      canal: item.template.canal,
      destinatario: item.destinatario,
      chave_idempotencia: key,
      status: webhook ? 'pendente' : 'ignorado',
      erro: webhook ? null : 'CRM_MESSAGING_WEBHOOK não configurado',
    }).select('id').maybeSingle();
    let messageId = insert.data?.id;
    if (insert.error?.code === '23505') {
      if (!webhook) continue;
      const existing = await supabase.from('lead_mensagens_automaticas')
        .select('id,status').eq('chave_idempotencia', key).maybeSingle();
      if (existing.error || existing.data?.status !== 'ignorado') continue;
      const reopened = await supabase.from('lead_mensagens_automaticas')
        .update({ status: 'pendente', erro: null })
        .eq('id', existing.data.id).eq('status', 'ignorado').select('id').maybeSingle();
      if (reopened.error || !reopened.data) continue;
      messageId = reopened.data.id;
    } else if (insert.error || !insert.data) {
      failed++;
      continue;
    }
    if (!webhook) continue;

    let error = 'Falha de entrega';
    let sent = false;
    for (let attempt = 0; attempt < 3; attempt++) {
      try {
        const response = await fetch(webhook, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            ...(webhookToken ? { Authorization: 'Bearer ' + webhookToken } : {}),
          },
          body: JSON.stringify({
            canal: item.template.canal,
            destinatario: item.destinatario,
            assunto: item.template.assunto ? renderTemplate(item.template.assunto, item.lead!) : null,
            mensagem: renderTemplate(item.template.conteudo, item.lead!),
            tipo: item.template.tipo,
          }),
          signal: AbortSignal.timeout(10000),
        });
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        sent = true;
        break;
      } catch (caught) {
        error = caught instanceof Error ? caught.message : 'Falha de entrega';
        if (attempt < 2) await new Promise((resolve) => setTimeout(resolve, 250 * (attempt + 1)));
      }
    }
    const update = await supabase.from('lead_mensagens_automaticas').update({
      status: sent ? 'enviado' : 'falhou',
      erro: sent ? null : error.slice(0, 500),
      enviado_em: sent ? new Date().toISOString() : null,
    }).eq('id', messageId);
    if (update.error || !sent) failed++;
    else processed++;
  }

  return new Response(JSON.stringify({ ok: true, processadas: processed, falhas: failed, candidatas: eligible.length }), { headers });
});
