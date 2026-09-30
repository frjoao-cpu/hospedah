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
  origem: string | null;
  status_pipeline: string;
  resort_nome: string | null;
  ticket_estimado: number | null;
};

const providers = new Set(['hubspot', 'rdstation', 'kommo', 'pipedrive']);

async function syncLead(
  supabase: ReturnType<typeof createClient>,
  leadId: string,
  existingLogId?: string,
  baseAttempts = 0,
): Promise<boolean> {
  const provider = (Deno.env.get('CRM_PROVIDER') || '').toLowerCase();
  const endpoint = Deno.env.get('CRM_SYNC_ENDPOINT');
  const token = Deno.env.get('CRM_SYNC_TOKEN');
  let errorMessage = '';
  let succeeded = false;
  let attempts = baseAttempts;

  if (!providers.has(provider)) {
    errorMessage = 'CRM_PROVIDER ausente ou não suportado';
    attempts++;
  } else if (!endpoint || !token) {
    errorMessage = 'CRM_SYNC_ENDPOINT/CRM_SYNC_TOKEN não configurados';
    attempts++;
  } else {
    const leadResult = await supabase.from('leads')
      .select('id,nome,email,whatsapp,origem,status_pipeline,resort_nome,ticket_estimado')
      .eq('id', leadId).maybeSingle();
    if (leadResult.error || !leadResult.data) {
      errorMessage = leadResult.error?.message || 'Lead não encontrado';
      attempts++;
    } else {
      const lead = leadResult.data as Lead;
      for (let attempt = 1; attempt <= 3; attempt++) {
        attempts = baseAttempts + attempt;
        try {
          const response = await fetch(endpoint, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + token },
            body: JSON.stringify({ provider, action: 'upsert', lead }),
            signal: AbortSignal.timeout(10000),
          });
          if (!response.ok) throw new Error(`HTTP ${response.status}`);
          succeeded = true;
          break;
        } catch (caught) {
          errorMessage = caught instanceof Error ? caught.message : 'Falha na sincronização';
          if (attempt < 3) await new Promise((resolve) => setTimeout(resolve, 250 * attempt));
        }
      }
    }
  }

  const logData = {
    status: succeeded ? 'sincronizado' : 'falhou',
    tentativas: attempts,
    proxima_tentativa: succeeded ? null : new Date(Date.now() + 15 * 60 * 1000).toISOString(),
    erro: succeeded ? null : errorMessage.slice(0, 500),
    atualizado_em: new Date().toISOString(),
  };
  const log = existingLogId
    ? await supabase.from('crm_integracoes_logs').update(logData).eq('id', existingLogId)
    : await supabase.from('crm_integracoes_logs').insert({
      ...logData,
      lead_id: leadId,
      provedor: provider || 'nao_configurado',
    });
  if (log.error) console.error('crm-sync: não foi possível registrar o resultado');
  return succeeded;
}

serve(async (request: Request) => {
  if (request.method === 'OPTIONS') return new Response('ok', { headers });
  if (request.method !== 'POST') return new Response('Method not allowed', { status: 405, headers });

  const authorization = request.headers.get('authorization') || '';
  const jwt = authorization.replace(/^Bearer\s+/i, '');
  const serviceKey = getSupabaseSecretKey();
  const supabaseUrl = Deno.env.get('SUPABASE_URL');
  if (!supabaseUrl || !serviceKey) {
    return new Response(JSON.stringify({ ok: false, error: 'supabase_not_configured' }), { status: 500, headers });
  }
  const supabase = createClient(supabaseUrl, serviceKey);
  let leadId = '';

  try {
    const body = await request.json();
    const isServiceCall = isSupabaseSecretKey(jwt);
    if (isServiceCall && body.acao === 'reprocessar') {
      const due = await supabase.from('crm_integracoes_logs')
        .select('id,lead_id,tentativas').eq('status', 'falhou')
        .lte('proxima_tentativa', new Date().toISOString()).lt('tentativas', 5).limit(50);
      if (due.error) throw due.error;
      let synced = 0;
      for (const item of due.data || []) {
        if (await syncLead(supabase, item.lead_id, item.id, item.tentativas)) synced++;
      }
      return new Response(JSON.stringify({ ok: true, processadas: due.data?.length || 0, sincronizadas: synced }), { headers });
    }

    if (!jwt || isServiceCall) {
      return new Response(JSON.stringify({ ok: false, error: 'unauthorized' }), { status: 401, headers });
    }
    const userResult = await supabase.auth.getUser(jwt);
    const user = userResult.data.user;
    if (userResult.error || !user) {
      return new Response(JSON.stringify({ ok: false, error: 'unauthorized' }), { status: 401, headers });
    }
    const role = await supabase.from('profiles').select('role').eq('id', user.id).maybeSingle();
    if (role.error || !['admin', 'proprietario'].includes(role.data?.role || '')) {
      return new Response(JSON.stringify({ ok: false, error: 'forbidden' }), { status: 403, headers });
    }

    leadId = String(body.lead_id || '');
    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(leadId)) {
      return new Response(JSON.stringify({ ok: false, error: 'invalid_lead_id' }), { status: 400, headers });
    }
    const succeeded = await syncLead(supabase, leadId);
    return new Response(JSON.stringify({ ok: succeeded, queued_retry: !succeeded }), { status: succeeded ? 200 : 202, headers });
  } catch {
    return new Response(JSON.stringify({ ok: false, error: 'sync_failed' }), { status: 500, headers });
  }
});
